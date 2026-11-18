import supertest from 'supertest';

import app from '../app.js';
import Result from '../models/result.js';
import {
  cleanUpDatabase,
  connectToDatabase,
  createResult,
  createUser,
  disconnectFromDatabase,
  generateToken,
} from './utils.js';

// Connexion à la base de test, vidée avant chaque test, déconnexion à la fin
beforeAll(connectToDatabase);
beforeEach(cleanUpDatabase);
afterAll(disconnectFromDatabase);

describe('GET /users/:id/stats', () => {
  // Deux parties jouées : les totaux et les moyennes sont calculés
  it('should return the stats of a user', async () => {
    const user = await createUser();
    await createResult(user, {
      score: 300,
      rank: 1,
      wordsFound: 3,
      firstFinds: 2,
      totalFindTime: 60,
      successfulDrawings: 1,
      drawingPoints: 50,
      date: new Date('2026-11-01T20:00:00.000Z'),
    });
    await createResult(user, {
      score: 100,
      rank: 3,
      wordsFound: 1,
      firstFinds: 0,
      totalFindTime: 20,
      successfulDrawings: 1,
      drawingPoints: 30,
      date: new Date('2026-11-10T20:00:00.000Z'),
    });

    const res = await supertest(app).get(`/users/${user.id}/stats`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: user.id,
      username: 'jdoe',
      player: {
        gamesPlayed: 2,
        wins: 1,
        winRate: 50,
        bestScore: 300,
        averageScore: 200,
        totalPoints: 400,
        lastGame: '2026-11-10T20:00:00.000Z',
      },
      guesser: {
        wordsFound: 4,
        firstFinds: 2,
        averageFindTime: 20,
      },
      drawer: {
        successfulDrawings: 2,
        drawingPoints: 80,
      },
    });
  });

  // Aucune partie jouée : toutes les statistiques sont à zéro
  it('should return zero stats for a user without results', async () => {
    const user = await createUser();

    const res = await supertest(app).get(`/users/${user.id}/stats`);

    expect(res.status).toBe(200);
    expect(res.body.player.gamesPlayed).toBe(0);
    expect(res.body.player.winRate).toBe(0);
    expect(res.body.player.lastGame).toBe(null);
    expect(res.body.guesser.averageFindTime).toBe(0);
  });

  // Les résultats des autres joueurs ne sont pas comptés
  it('should only count the results of this user', async () => {
    const user = await createUser();
    const other = await createUser({ username: 'other', email: 'other@example.com' });
    await createResult(other, { score: 500, rank: 1, date: new Date() });

    const res = await supertest(app).get(`/users/${user.id}/stats`);

    expect(res.status).toBe(200);
    expect(res.body.player.gamesPlayed).toBe(0);
  });

  // Aucun utilisateur avec cet ID
  it('should respond with 404 if the user does not exist', async () => {
    const res = await supertest(app).get('/users/66b9d6c2f1a2b3c4d5e6f7a8/stats');

    expect(res.status).toBe(404);
  });

  // ID qui n'a pas le bon format
  it('should respond with 404 if the ID is invalid', async () => {
    const res = await supertest(app).get('/users/not-an-id/stats');

    expect(res.status).toBe(404);
  });
});

describe('DELETE /users/me', () => {
  // Les résultats sont supprimés avec le compte
  it('should delete the results of the user', async () => {
    const user = await createUser();
    const token = generateToken(user);
    await createResult(user, { score: 100, rank: 1, date: new Date() });

    const res = await supertest(app).delete('/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    const count = await Result.countDocuments();
    expect(count).toBe(0);
  });
});
