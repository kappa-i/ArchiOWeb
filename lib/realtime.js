import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';

import Participant from '../models/participant.js';
import Room from '../models/room.js';

// Messages de dessin qu'un joueur peut envoyer (voir draw/README.md)
const drawingMessageTypes = ['op', 'points', 'end', 'undo', 'redo'];

// Rooms connectées : code de la room → { players: connexions ouvertes, history: messages du dessin en cours }
const rooms = new Map();

// Branche le temps réel (WebSocket sur /ws) sur un serveur HTTP.
// - Avec jwtSecret (l'API) : ws://.../ws?room=ABC123&token=<jeton>, il faut jouer dans la room.
// - Sans jwtSecret (serveur de test npm run draw) : ws://.../ws?room=ABC123&name=Tanguy, pas de compte.
export function attachRealtime(server, jwtSecret) {
  const wss = new WebSocketServer({ server: server, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', async (socket, req) => {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const code = (params.get('room') || '').toUpperCase();

    if (!code) {
      socket.close(1008, 'A room code is required');
      return;
    }

    let name = params.get('name') || 'Anonyme';

    if (jwtSecret) {
      try {
        name = await findPlayerName(code, params.get('token'), jwtSecret);
      } catch (error) {
        socket.close(1008, error.message);
        return;
      }

      // Le joueur est parti pendant la vérification
      if (socket.readyState !== socket.OPEN) {
        return;
      }
    }

    joinRoom(socket, code, name);
  });

  return wss;
}

// Vérifie le jeton et que l'utilisateur joue dans la room, puis renvoie son pseudo
// (même vérification que les middlewares authenticate et requireRoomPlayer)
async function findPlayerName(code, token, jwtSecret) {
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch {
    throw new Error('Your token is invalid or has expired');
  }

  const room = await Room.findOne({ code: code });
  if (!room) {
    throw new Error('Room not found');
  }

  const participant = await Participant.findOne({
    room: room.id,
    user: payload.sub,
    excluded: false,
  }).populate('user');

  if (!participant || !participant.user) {
    throw new Error('Only the players of the room can do this');
  }

  return participant.user.username;
}

// Ajoute le joueur à la room : il reçoit le dessin en cours, et ses traits sont relayés aux autres
function joinRoom(socket, code, name) {
  let room = rooms.get(code);
  if (!room) {
    room = { players: new Set(), history: [] };
    rooms.set(code, room);
  }

  socket.playerName = name;
  room.players.add(socket);

  // Le joueur qui arrive reçoit le dessin déjà commencé, puis tout le monde reçoit la liste des joueurs
  send(socket, { type: 'history', messages: room.history });
  sendPlayersList(code);

  socket.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (!message || !drawingMessageTypes.includes(message.type)) {
      return;
    }

    if (!canDraw(code, name)) {
      return;
    }

    room.history.push(message);
    broadcast(code, message, socket);
  });

  socket.on('close', () => {
    room.players.delete(socket);

    if (room.players.size === 0) {
      rooms.delete(code);
    } else {
      sendPlayersList(code);
    }
  });
}

// Est-ce que ce joueur a le droit de dessiner ?
// TODO (logique des tours) : répondre true seulement pour le dessinateur du tour en cours
export function canDraw(roomCode, playerName) {
  return true;
}

// Envoie un message à tous les joueurs connectés d'une room, sauf à « except » (facultatif)
export function broadcast(roomCode, message, except) {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  for (const socket of room.players) {
    if (socket !== except) {
      send(socket, message);
    }
  }
}

// Messages du dessin en cours d'une room (à enregistrer dans le dessin à la fin du tour)
export function getDrawing(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) {
    return [];
  }

  return room.history;
}

// Efface le dessin d'une room pour tout le monde (à appeler au début de chaque tour)
export function resetDrawing(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  room.history = [];
  broadcast(roomCode, { type: 'history', messages: [] });
}

function sendPlayersList(roomCode) {
  const room = rooms.get(roomCode);

  const players = [];
  for (const socket of room.players) {
    players.push(socket.playerName);
  }

  broadcast(roomCode, { type: 'presence', players: players });
}

function send(socket, message) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}
