import http from 'http';
import WebSocket from 'ws';

import { jwtSecret } from '../config.js';
import { attachRealtime } from '../lib/realtime.js';
import {
  cleanUpDatabase,
  connectToDatabase,
  createRoom,
  createUser,
  disconnectFromDatabase,
  generateToken,
} from './utils.js';

// Deux petits serveurs sur des ports libres :
// - testUrl : comme npm run draw, sans compte (le nom vient de l'URL)
// - apiUrl : comme l'API, il faut un jeton et jouer dans la room
let testServer;
let apiServer;
let testUrl;
let apiUrl;
const sockets = [];

beforeAll(async () => {
  await connectToDatabase();

  testServer = http.createServer();
  attachRealtime(testServer);
  await new Promise((resolve) => testServer.listen(0, resolve));
  testUrl = `ws://127.0.0.1:${testServer.address().port}/ws`;

  apiServer = http.createServer();
  attachRealtime(apiServer, jwtSecret);
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

afterAll(async () => {
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
