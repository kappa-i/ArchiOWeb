import supertest from 'supertest';

import app from '../app.js';
import { startGame, timings } from '../lib/game.js';
import Drawing from '../models/drawing.js';
import Participant from '../models/participant.js';
import {
  addParticipant,
  cleanUpDatabase,
  connectToDatabase,
  createRoom,
  createUser,
  createWord,
  disconnectFromDatabase,
  generateToken,
  waitFor,
} from './utils.js';

// Connexion à la base de test, vidée avant chaque test, déconnexion à la fin.
// Pas de pause entre les tours pendant les tests.
beforeAll(async () => {
  await connectToDatabase();
  timings.beforeFirstTurn = 0;
  timings.betweenTurns = 0;
});
beforeEach(cleanUpDatabase);
afterAll(disconnectFromDatabase);

// Partie lancée dans la room ABC123 : alice dessine le mot (« éléphant » par défaut), bob et carol devinent
async function startTestGame(word = 'éléphant') {
  const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
  const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
  const carol = await createUser({ username: 'carol', email: 'carol@example.com' });

  const room = await createRoom(alice);
  await addParticipant(room, bob);
  await addParticipant(room, carol);
  await createWord(word);

  room.status = 'playing';
  await room.save();
  await startGame(room);

  const drawing = await waitFor(() => Drawing.findOne({ room: room.id }));

  return { alice, bob, carol, room, drawing };
}

function postGuess(game, user, content) {
  return supertest(app)
    .post(`/rooms/ABC123/drawings/${game.drawing.id}/guesses`)
    .set('Authorization', `Bearer ${generateToken(user)}`)
    .send({ content: content });
}

describe('POST /rooms/:code/drawings/:id/guesses', () => {
  // Mauvaise réponse : enregistrée, sans points
  it('should save a wrong guess', async () => {
    const game = await startTestGame();

    const res = await postGuess(game, game.bob, 'girafe');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      participantId: expect.any(String),
      username: 'bob',
      content: 'girafe',
      isCorrect: false,
      points: 0,
      createdAt: expect.any(String),
    });
  });

  // Bonne réponse (sans majuscules ni accents) : des points pour bob et pour alice qui dessine
  it('should give points for the right word', async () => {
    const game = await startTestGame();

    const res = await postGuess(game, game.bob, ' ELEPHANT ');

    expect(res.status).toBe(201);
    expect(res.body.isCorrect).toBe(true);
    expect(res.body.points).toBeGreaterThanOrEqual(50);
    expect(res.body.points).toBeLessThanOrEqual(150);

    const bobPlayer = await Participant.findOne({ user: game.bob.id });
    const alicePlayer = await Participant.findOne({ user: game.alice.id });
    expect(bobPlayer.score).toBe(res.body.points);
    expect(alicePlayer.score).toBe(25);
  });

  // « coeur » est accepté pour le mot « cœur » (pas de touche « œ » sur le clavier)
  it('should accept oe for the letter œ', async () => {
    const game = await startTestGame('cœur');

    const res = await postGuess(game, game.bob, 'coeur');

    expect(res.status).toBe(201);
    expect(res.body.isCorrect).toBe(true);
  });

  // Le dessinateur ne peut pas deviner son propre mot
  it('should respond with 403 if the drawer guesses', async () => {
    const game = await startTestGame();

    const res = await postGuess(game, game.alice, 'éléphant');

    expect(res.status).toBe(403);
  });

  // Bob a déjà trouvé : il ne peut plus proposer
  it('should respond with 409 if the player already found the word', async () => {
    const game = await startTestGame();
    await postGuess(game, game.bob, 'éléphant');

    const res = await postGuess(game, game.bob, 'éléphant');

    expect(res.status).toBe(409);
  });

  // Tout le monde a trouvé, le tour est fini : plus de propositions sur ce dessin
  it('should respond with 409 if the drawing is finished', async () => {
    const game = await startTestGame();
    await postGuess(game, game.bob, 'éléphant');
    await postGuess(game, game.carol, 'éléphant');
    await waitFor(() => Drawing.findOne({ _id: game.drawing.id, endedAt: { $ne: null } }));

    const res = await postGuess(game, game.bob, 'éléphant');

    expect(res.status).toBe(409);
  });

  // Proposition vide : refusée
  it('should respond with 422 if the guess is empty', async () => {
    const game = await startTestGame();

    const res = await postGuess(game, game.bob, '');

    expect(res.status).toBe(422);
  });

  // Quelqu'un qui ne joue pas dans la room ne peut pas proposer
  it('should respond with 403 if the user is not a player of the room', async () => {
    const game = await startTestGame();
    const dave = await createUser({ username: 'dave', email: 'dave@example.com' });

    const res = await postGuess(game, dave, 'éléphant');

    expect(res.status).toBe(403);
  });

  // Dessin inconnu
  it('should respond with 404 if the drawing does not exist', async () => {
    const game = await startTestGame();

    const res = await supertest(app)
      .post('/rooms/ABC123/drawings/unknown/guesses')
      .set('Authorization', `Bearer ${generateToken(game.bob)}`)
      .send({ content: 'éléphant' });

    expect(res.status).toBe(404);
  });

  // Sans jeton : 401
  it('should respond with 401 without a token', async () => {
    const game = await startTestGame();

    const res = await supertest(app)
      .post(`/rooms/ABC123/drawings/${game.drawing.id}/guesses`)
      .send({ content: 'éléphant' });

    expect(res.status).toBe(401);
  });
});

describe('GET /rooms/:code/drawings', () => {
  // Pendant le tour, le mot du dessin est caché
  it('should list the drawings without the word of the current turn', async () => {
    const game = await startTestGame();

    const res = await supertest(app)
      .get('/rooms/ABC123/drawings')
      .set('Authorization', `Bearer ${generateToken(game.bob)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: game.drawing.id,
        participantId: expect.any(String),
        roundNumber: 1,
        word: null,
        startedAt: expect.any(String),
        endedAt: null,
      },
    ]);
  });

  // Quelqu'un qui ne joue pas dans la room ne voit pas les dessins
  it('should respond with 403 if the user is not a player of the room', async () => {
    await startTestGame();
    const dave = await createUser({ username: 'dave', email: 'dave@example.com' });

    const res = await supertest(app)
      .get('/rooms/ABC123/drawings')
      .set('Authorization', `Bearer ${generateToken(dave)}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /rooms/:code/drawings/:id/guesses', () => {
  // Les propositions dans l'ordre ; la bonne réponse de carol ne montre pas le mot pendant le tour
  it('should list the guesses and hide the right answers during the turn', async () => {
    const game = await startTestGame();
    await postGuess(game, game.bob, 'girafe');
    await postGuess(game, game.carol, 'éléphant');

    const res = await supertest(app)
      .get(`/rooms/ABC123/drawings/${game.drawing.id}/guesses`)
      .set('Authorization', `Bearer ${generateToken(game.alice)}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].username).toBe('bob');
    expect(res.body[0].content).toBe('girafe');
    expect(res.body[1].username).toBe('carol');
    expect(res.body[1].content).toBe(null);
    expect(res.body[1].isCorrect).toBe(true);
  });
});
