import http from 'http';
import supertest from 'supertest';
import WebSocket from 'ws';

import app from '../app.js';
import { jwtSecret } from '../config.js';
import { absence, attachRealtime, canDraw, setCurrentRound } from '../lib/realtime.js';
import Host from '../models/host.js';
import Participant from '../models/participant.js';
import Room from '../models/room.js';
import {
  addParticipant,
  cleanUpDatabase,
  connectToDatabase,
  createRoom,
  createUser,
  disconnectFromDatabase,
  generateToken,
  waitFor,
} from './utils.js';

// Deux petits serveurs sur des ports libres :
// - testUrl : comme npm run draw, sans compte (le nom vient de l'URL)
// - apiUrl : comme l'API, il faut un jeton et jouer dans la room
let testServer;
let apiServer;
let testWss;
let apiWss;
let testUrl;
let apiUrl;
const sockets = [];

beforeAll(async () => {
  await connectToDatabase();

  testServer = http.createServer();
  testWss = attachRealtime(testServer);
  await new Promise((resolve) => testServer.listen(0, resolve));
  testUrl = `ws://127.0.0.1:${testServer.address().port}/ws`;

  apiServer = http.createServer();
  apiWss = attachRealtime(apiServer, jwtSecret);
  await new Promise((resolve) => apiServer.listen(0, resolve));
  apiUrl = `ws://127.0.0.1:${apiServer.address().port}/ws`;
});

beforeEach(cleanUpDatabase);

// Déconnecte les joueurs après chaque test
afterEach(() => {
  for (const socket of sockets) {
    socket.close();
  }
  sockets.length = 0;
});

// Ferme toutes les connexions côté serveur avant de se déconnecter de la base
// (disconnectFromDatabase annule ensuite les retraits de joueurs qu'elles ont prévus)
afterAll(async () => {
  for (const client of testWss.clients) {
    client.terminate();
  }
  for (const client of apiWss.clients) {
    client.terminate();
  }
  await new Promise((resolve) => setTimeout(resolve, 50));

  testServer.closeAllConnections();
  apiServer.closeAllConnections();
  await new Promise((resolve) => testServer.close(resolve));
  await new Promise((resolve) => apiServer.close(resolve));
  await disconnectFromDatabase();
});

// Le début d'un trait, tel que l'envoie la page de dessin
const stroke = {
  type: 'op',
  op: {
    id: 'a-1',
    kind: 'stroke',
    brush: 'pen',
    color: '#000000',
    size: 6,
    seed: 1,
    points: [[0.5, 0.5]],
  },
};

// Chaque test utilise sa propre room, pour ne pas mélanger les joueurs des différents tests
describe('WebSocket /ws', () => {
  // Alice dessine : Bob, dans la même room, reçoit le trait
  it('should send the drawing to the other players of the room', async () => {
    const alice = await connectPlayer('ROOM01', 'Alice');
    const bob = await connectPlayer('ROOM01', 'Bob');

    alice.send(JSON.stringify(stroke));

    const message = await waitForMessage(bob, 'op');
    expect(message).toEqual(stroke);
  });

  // Carol est dans une autre room : elle ne reçoit rien d'autre que sa room vide et sa liste de joueurs
  it('should not send the drawing to another room', async () => {
    const alice = await connectPlayer('ROOM02', 'Alice');
    const bob = await connectPlayer('ROOM02', 'Bob');
    const carol = await connectPlayer('OTHER2', 'Carol');

    alice.send(JSON.stringify(stroke));
    await waitForMessage(bob, 'op');

    expect(carol.received).toEqual([
      { type: 'history', messages: [] },
      { type: 'presence', players: ['Carol'] },
    ]);
  });

  // Carol arrive après le trait d'Alice : elle reçoit le dessin déjà commencé
  it('should send the current drawing to a player who joins later', async () => {
    const alice = await connectPlayer('ROOM03', 'Alice');
    const bob = await connectPlayer('ROOM03', 'Bob');
    alice.send(JSON.stringify(stroke));
    await waitForMessage(bob, 'op');

    const carol = await connectPlayer('ROOM03', 'Carol');

    const history = await waitForMessage(carol, 'history');
    expect(history.messages).toEqual([stroke]);
  });

  // Bob arrive après Alice : il reçoit la liste des 2 joueurs connectés
  it('should send the list of connected players', async () => {
    await connectPlayer('ROOM04', 'Alice');

    const bob = await connectPlayer('ROOM04', 'Bob');

    const presence = await waitForMessage(bob, 'presence');
    expect(presence.players).toEqual(['Alice', 'Bob']);
  });

  // Sans code de room, le serveur ferme la connexion (code 1008)
  it('should refuse a connection without a room code', async () => {
    const closeCode = await waitForClose(testUrl);

    expect(closeCode).toBe(1008);
  });
});

describe('WebSocket /ws with accounts', () => {
  // Un joueur de la room se connecte avec son jeton : il est dans la liste, avec son pseudo
  it('should accept a player of the room', async () => {
    const user = await createUser();
    await createRoom(user, 'ROOM10');

    const socket = await openSocket(`${apiUrl}?room=ROOM10&token=${generateToken(user)}`);

    const presence = await waitForMessage(socket, 'presence');
    expect(presence.players).toEqual(['jdoe']);
  });

  // Sans jeton, la connexion est refusée
  it('should refuse a connection without a token', async () => {
    const user = await createUser();
    await createRoom(user, 'ROOM11');

    const closeCode = await waitForClose(`${apiUrl}?room=ROOM11`);

    expect(closeCode).toBe(1008);
  });

  // Un utilisateur qui ne joue pas dans la room est refusé
  it('should refuse a user who is not a player of the room', async () => {
    const host = await createUser();
    await createRoom(host, 'ROOM12');
    const other = await createUser({ username: 'other', email: 'other@example.com' });

    const closeCode = await waitForClose(`${apiUrl}?room=ROOM12&token=${generateToken(other)}`);

    expect(closeCode).toBe(1008);
  });

  // La room n'existe pas : connexion refusée
  it('should refuse a room that does not exist', async () => {
    const user = await createUser();

    const closeCode = await waitForClose(`${apiUrl}?room=NOROOM&token=${generateToken(user)}`);

    expect(closeCode).toBe(1008);
  });
});

describe('Turns', () => {
  // Pendant un tour, seul le dessinateur peut dessiner
  it('should only let the drawer draw during a turn', () => {
    setCurrentRound('ROOM20', { drawerId: 'drawer-id', word: 'chat', endsAt: 0, message: null });

    expect(canDraw('ROOM20', 'drawer-id')).toBe(true);
    expect(canDraw('ROOM20', 'someone-else')).toBe(false);

    setCurrentRound('ROOM20', null);
  });

  // Le dessinateur arrive pendant son tour : il reçoit le tour en cours et son mot
  it('should send the current turn to a player who joins during the turn', async () => {
    const user = await createUser();
    await createRoom(user, 'ROOM21');
    setCurrentRound('ROOM21', {
      drawerId: user.id,
      word: 'chat',
      endsAt: Date.now() + 60000,
      message: { type: 'round-started', drawer: 'jdoe', duration: 60 },
    });

    const socket = await openSocket(`${apiUrl}?room=ROOM21&token=${generateToken(user)}`);

    const round = await waitForMessage(socket, 'round-started');
    const word = await waitForMessage(socket, 'word-to-draw');
    expect(round.drawer).toBe('jdoe');
    expect(word.word).toBe('chat');

    setCurrentRound('ROOM21', null);
  });
});

describe('Absent players', () => {
  const normalDelay = absence.delay;

  afterEach(() => {
    absence.delay = normalDelay;
  });

  // Alice (l'hôte) ferme sa page et ne revient pas : elle est retirée, Bob devient l'hôte
  it('should remove a player who closed their page and did not come back', async () => {
    absence.delay = 50;
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    const room = await createRoom(alice, 'ROOM30');
    await addParticipant(room, bob);
    const socket = await openSocket(`${apiUrl}?room=ROOM30&token=${generateToken(alice)}`);
    await waitForMessage(socket, 'presence');

    await closeSocket(socket);

    await waitFor(async () => {
      const participant = await Participant.findOne({ user: alice.id });
      if (participant === null) {
        return true;
      }
      return null;
    });
    const updatedRoom = await Room.findById(room.id);
    const host = await Host.findById(updatedRoom.host);
    expect(host.user.toString()).toBe(bob.id);
  });

  // Alice recharge sa page : elle revient avant la fin du délai, elle reste dans la room
  it('should keep a player who comes back in time', async () => {
    absence.delay = 300;
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    await createRoom(alice, 'ROOM31');
    const address = `${apiUrl}?room=ROOM31&token=${generateToken(alice)}`;
    const firstSocket = await openSocket(address);
    await waitForMessage(firstSocket, 'presence');

    await closeSocket(firstSocket);
    const secondSocket = await openSocket(address);
    await waitForMessage(secondSocket, 'presence');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const participant = await Participant.findOne({ user: alice.id });
    expect(participant).not.toBe(null);
  });

  // Bob rejoint la room : Alice, dans la salle d'attente, est prévenue tout de suite
  it('should tell the waiting room when a player joins', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    await createRoom(alice, 'ROOM32');
    const socket = await openSocket(`${apiUrl}?room=ROOM32&token=${generateToken(alice)}`);
    await waitForMessage(socket, 'presence');

    await supertest(app)
      .post('/rooms/ROOM32/participants')
      .set('Authorization', `Bearer ${generateToken(bob)}`);

    const message = await waitForMessage(socket, 'room-updated');
    expect(message).toEqual({ type: 'room-updated' });
  });
});

// Connecte un joueur au serveur de test (sans compte)
function connectPlayer(room, name) {
  return openSocket(`${testUrl}?room=${room}&name=${name}`);
}

// Ouvre une connexion et garde tous les messages reçus dans socket.received
function openSocket(address) {
  const socket = new WebSocket(address);
  socket.received = [];
  sockets.push(socket);

  socket.on('message', (data) => {
    socket.received.push(JSON.parse(data));
  });

  return new Promise((resolve) => {
    socket.on('open', () => resolve(socket));
  });
}

// Ferme la connexion du joueur et attend qu'elle soit bien fermée
function closeSocket(socket) {
  return new Promise((resolve) => {
    socket.on('close', resolve);
    socket.close();
  });
}

// Ouvre une connexion et attend que le serveur la ferme : renvoie le code de fermeture
function waitForClose(address) {
  const socket = new WebSocket(address);

  return new Promise((resolve) => {
    socket.on('close', (code) => resolve(code));
  });
}

// Attend que le joueur ait reçu un message de ce type (on regarde toutes les 10 ms)
async function waitForMessage(socket, type) {
  while (true) {
    for (const message of socket.received) {
      if (message.type === type) {
        return message;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
