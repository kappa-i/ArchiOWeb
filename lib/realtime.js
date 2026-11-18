import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';

import Participant from '../models/participant.js';
import Room from '../models/room.js';

// Messages de dessin qu'un joueur peut envoyer (voir draw/README.md)
const drawingMessageTypes = ['op', 'points', 'end', 'undo', 'redo'];

// Rooms connectées : code de la room → {
//   players : connexions ouvertes,
//   history : messages du dessin en cours,
//   round : tour en cours (null s'il n'y a pas de partie, voir setCurrentRound)
// }
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
    let userId = null;

    if (jwtSecret) {
      let participant;
      try {
        participant = await findPlayer(code, params.get('token'), jwtSecret);
      } catch (error) {
        socket.close(1008, error.message);
        return;
      }

      // Le joueur est parti pendant la vérification
      if (socket.readyState !== socket.OPEN) {
        return;
      }

      name = participant.user.username;
      userId = participant.user.id;
    }

    joinRoom(socket, code, name, userId);
  });

  return wss;
}

// Vérifie le jeton et que l'utilisateur joue dans la room, puis renvoie le joueur (avec son compte)
// (même vérification que les middlewares authenticate et requireRoomPlayer)
async function findPlayer(code, token, jwtSecret) {
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

  return participant;
}

// Ajoute le joueur à la room : il reçoit le dessin et le tour en cours, et ses traits sont relayés aux autres
function joinRoom(socket, code, name, userId) {
  const room = getRoom(code);

  socket.playerName = name;
  socket.userId = userId;
  room.players.add(socket);

  // Le joueur qui arrive reçoit le dessin déjà commencé, puis tout le monde reçoit la liste des joueurs
  send(socket, { type: 'history', messages: room.history });
  sendPlayersList(code);

  // Une partie est en cours : il reçoit le tour (avec le temps qui reste) et le mot s'il dessine
  if (room.round && room.round.message) {
    const remaining = Math.max(0, Math.round((room.round.endsAt - Date.now()) / 1000));
    room.round.message.duration = remaining;
    send(socket, room.round.message);

    if (room.round.drawerId === userId) {
      send(socket, { type: 'word-to-draw', word: room.round.word });
    }
  }

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

    if (!canDraw(code, socket.userId)) {
      return;
    }

    room.history.push(message);
    broadcast(code, message, socket);
  });

  socket.on('close', () => {
    room.players.delete(socket);

    // On garde la room tant qu'une partie est en cours (un joueur peut recharger sa page)
    if (room.players.size === 0 && room.round === null) {
      rooms.delete(code);
    } else {
      sendPlayersList(code);
    }
  });
}

// Est-ce que ce joueur a le droit de dessiner ?
// Sans partie en cours (ex. serveur de test), tout le monde peut dessiner ; sinon seulement le dessinateur du tour.
export function canDraw(roomCode, userId) {
  const room = rooms.get(roomCode);

  if (!room || room.round === null) {
    return true;
  }

  return room.round.drawerId === userId;
}

// Le jeu (lib/game.js) indique le tour en cours :
// - { drawerId, word, endsAt, message } pendant un tour (message = le « round-started » envoyé à tous) ;
// - { drawerId: null, word: null, endsAt: 0, message: null } entre deux tours (personne ne dessine) ;
// - null quand la partie est finie.
export function setCurrentRound(roomCode, round) {
  const room = getRoom(roomCode);
  room.round = round;

  if (round === null && room.players.size === 0) {
    rooms.delete(roomCode);
  }
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

// Envoie un message à un seul joueur (toutes ses connexions dans la room)
export function sendToUser(roomCode, userId, message) {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  for (const socket of room.players) {
    if (socket.userId === userId) {
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

// La room en mémoire (créée si besoin)
function getRoom(roomCode) {
  let room = rooms.get(roomCode);

  if (!room) {
    room = { players: new Set(), history: [], round: null };
    rooms.set(roomCode, room);
  }

  return room;
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
