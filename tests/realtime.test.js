import http from 'http';
import WebSocket from 'ws';

import { attachRealtime } from '../lib/realtime.js';

// Petit serveur de test sur un port libre (pas besoin de MongoDB), fermé à la fin
let server;
let url;
const sockets = [];

beforeAll(async () => {
  server = http.createServer();
  attachRealtime(server);
  await new Promise((resolve) => server.listen(0, resolve));
  url = `ws://127.0.0.1:${server.address().port}/ws`;
});

// Déconnecte les joueurs après chaque test
afterEach(() => {
  for (const socket of sockets) {
    socket.close();
  }
  sockets.length = 0;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
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
    const socket = new WebSocket(url);

    const closeCode = await new Promise((resolve) => socket.on('close', resolve));

    expect(closeCode).toBe(1008);
  });
});

// Connecte un joueur à une room et garde tous les messages qu'il reçoit dans socket.received
function connectPlayer(room, name) {
  const socket = new WebSocket(`${url}?room=${room}&name=${name}`);
  socket.received = [];
  sockets.push(socket);

  socket.on('message', (data) => {
    socket.received.push(JSON.parse(data));
  });

  return new Promise((resolve) => {
    socket.on('open', () => resolve(socket));
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
