import supertest from 'supertest';

import app from '../app.js';
import { startGame, timings } from '../lib/game.js';
import { absence } from '../lib/realtime.js';
import { cleanUpRoomsAtStartup } from '../lib/rooms.js';
import Drawing from '../models/drawing.js';
import Participant from '../models/participant.js';
import Result from '../models/result.js';
import Room from '../models/room.js';
import Settings from '../models/settings.js';
import Word from '../models/word.js';
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

// Le joueur trouve le mot du dessin (en lisant le mot dans la base)
async function guessTheWord(room, drawing, user) {
  const word = await Word.findById(drawing.word);

  const res = await supertest(app)
    .post(`/rooms/${room.code}/drawings/${drawing.id}/guesses`)
    .set('Authorization', `Bearer ${generateToken(user)}`)
    .send({ content: word.label });

  expect(res.status).toBe(201);
}

describe('A whole game', () => {
  // 1 manche à 2 joueurs : alice dessine (bob trouve), puis bob dessine (alice trouve).
  // À la fin : un résultat par joueur, et la room est supprimée.
  it('should play every turn, save the results and delete the room', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    const room = await createRoom(alice);
    const bobPlayer = await addParticipant(room, bob);
    const alicePlayer = await Participant.findOne({ user: alice.id });
    await Settings.updateOne({ room: room.id }, { rounds: 1 });
    await createWord('chat');
    await createWord('chien');
    room.status = 'playing';
    await room.save();

    await startGame(room);

    const firstDrawing = await waitFor(() =>
      Drawing.findOne({ room: room.id, participant: alicePlayer.id }),
    );
    await guessTheWord(room, firstDrawing, bob);

    const secondDrawing = await waitFor(() =>
      Drawing.findOne({ room: room.id, participant: bobPlayer.id }),
    );
    await guessTheWord(room, secondDrawing, alice);

    // La partie se termine en arrière-plan : on attend que la room disparaisse
    await waitFor(async () => {
      const deletedRoom = await Room.findById(room.id);
      if (deletedRoom === null) {
        return true;
      }
      return null;
    });

    const aliceResult = await Result.findOne({ user: alice.id });
    const bobResult = await Result.findOne({ user: bob.id });
    expect(aliceResult.wordsFound).toBe(1);
    expect(aliceResult.drawingsMade).toBe(1);
    expect(aliceResult.successfulDrawings).toBe(1);
    expect(aliceResult.drawingPoints).toBe(25);
    expect(bobResult.wordsFound).toBe(1);
    expect(aliceResult.rank + bobResult.rank).toBe(3);

    expect(await Drawing.countDocuments({ room: room.id })).toBe(0);
    expect(await Participant.countDocuments({ room: room.id })).toBe(0);
  });
});

describe('Word difficulty', () => {
  // Difficulté « difficile » : le mot tiré est le seul mot difficile de la base
  it('should only pick words of the chosen difficulty', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    const room = await createRoom(alice);
    await addParticipant(room, bob);
    await Settings.updateOne({ room: room.id }, { difficulty: 'hard' });
    await createWord('chat', 'easy');
    await createWord('maison', 'medium');
    const hardWord = await createWord('volcan', 'hard');
    room.status = 'playing';
    await room.save();

    await startGame(room);

    const drawing = await waitFor(() => Drawing.findOne({ room: room.id }));
    expect(drawing.word.toString()).toBe(hardWord.id);
  });
});

describe('Players who leave', () => {
  // Alice dessine et quitte la partie : son tour se termine tout de suite, et c'est à Bob de dessiner
  it('should end the turn when the drawer leaves', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    const carol = await createUser({ username: 'carol', email: 'carol@example.com' });
    const room = await createRoom(alice);
    const bobPlayer = await addParticipant(room, bob);
    await addParticipant(room, carol);
    const alicePlayer = await Participant.findOne({ user: alice.id });
    await Settings.updateOne({ room: room.id }, { rounds: 1 });
    await createWord('chat');
    await createWord('chien');
    await createWord('maison');
    room.status = 'playing';
    await room.save();
    await startGame(room);
    await waitFor(() => Drawing.findOne({ room: room.id, participant: alicePlayer.id }));

    const res = await supertest(app)
      .delete(`/rooms/${room.code}/participants/${alicePlayer.id}`)
      .set('Authorization', `Bearer ${generateToken(alice)}`);

    expect(res.status).toBe(204);
    // Le tour de Bob commence sans attendre la fin du temps d'Alice (80 secondes)
    const bobDrawing = await waitFor(() =>
      Drawing.findOne({ room: room.id, participant: bobPlayer.id }),
    );
    expect(bobDrawing).not.toBe(null);
  });
});

describe('Server restart', () => {
  const normalDelay = absence.delay;

  afterEach(() => {
    absence.delay = normalDelay;
  });

  // La partie s'est arrêtée avec l'ancien serveur : elle se termine (un résultat par joueur, room supprimée)
  it('should finish the games that were being played', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    const room = await createRoom(alice);
    await addParticipant(room, bob);
    await Room.updateOne({ _id: room.id }, { status: 'playing' });

    await cleanUpRoomsAtStartup();

    expect(await Room.findById(room.id)).toBe(null);
    expect(await Result.countDocuments()).toBe(2);
  });

  // Personne ne revient dans la salle d'attente : ses joueurs sont retirés et la room est supprimée
  it('should remove the players of the waiting rooms who do not come back', async () => {
    absence.delay = 50;
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const room = await createRoom(alice);

    await cleanUpRoomsAtStartup();

    await waitFor(async () => {
      const deletedRoom = await Room.findById(room.id);
      if (deletedRoom === null) {
        return true;
      }
      return null;
    });
    expect(await Participant.countDocuments({ room: room.id })).toBe(0);
  });
});
