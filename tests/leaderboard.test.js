import supertest from 'supertest';

import app from '../app.js';
import {
  cleanUpDatabase,
  connectToDatabase,
  createResult,
  createUser,
  disconnectFromDatabase,
} from './utils.js';

// Connexion à la base de test, vidée avant chaque test, déconnexion à la fin
beforeAll(connectToDatabase);
beforeEach(cleanUpDatabase);
afterAll(disconnectFromDatabase);

const oneDay = 24 * 60 * 60 * 1000;

// Enregistre une partie terminée pour ce joueur, avec ce score (aujourd'hui par défaut)
function addResult(user, score, date = new Date()) {
  return createResult(user, {
    score: score,
    rank: 2,
    date: date,
  });
}

describe('GET /users/leaderboard', () => {
  // Sans paramètre : les joueurs classés par total de points, page 1 de 10 joueurs
  it('should rank the players by their total points', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    await createUser({ username: 'charlie', email: 'charlie@example.com' });
    await addResult(alice, 150);
    await addResult(alice, 50);
    await addResult(bob, 175);

    const res = await supertest(app).get('/users/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        { rank: 1, userId: alice.id, username: 'alice', totalPoints: 200 },
        { rank: 2, userId: bob.id, username: 'bob', totalPoints: 175 },
      ],
      pagination: {
        page: 1,
        pageSize: 10,
        totalItems: 2,
        totalPages: 1,
      },
    });
  });

  // Page 2 avec 1 joueur par page : bob, qui garde son rang (2e)
  it('should return the requested page', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    const charlie = await createUser({ username: 'charlie', email: 'charlie@example.com' });
    await addResult(alice, 300);
    await addResult(bob, 200);
    await addResult(charlie, 100);

    const res = await supertest(app).get('/users/leaderboard?page=2&pageSize=1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [{ rank: 2, userId: bob.id, username: 'bob', totalPoints: 200 }],
      pagination: {
        page: 2,
        pageSize: 1,
        totalItems: 3,
        totalPages: 3,
      },
    });
  });

  // Filtre « week » : seule la partie d'il y a 2 jours compte, pas celle d'il y a 8 jours
  it('should only count the games of the last 7 days with period=week', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    await addResult(alice, 70, new Date(Date.now() - 2 * oneDay));
    await addResult(alice, 900, new Date(Date.now() - 8 * oneDay));

    const res = await supertest(app).get('/users/leaderboard?period=week');

    expect(res.status).toBe(200);
    expect(res.body.items[0].totalPoints).toBe(70);
  });

  // Filtre « month » : les deux parties comptent, mais pas celle d'il y a 40 jours
  it('should only count the games of the last 30 days with period=month', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    await addResult(alice, 70, new Date(Date.now() - 2 * oneDay));
    await addResult(alice, 900, new Date(Date.now() - 8 * oneDay));
    await addResult(alice, 5000, new Date(Date.now() - 40 * oneDay));

    const res = await supertest(app).get('/users/leaderboard?period=month');

    expect(res.status).toBe(200);
    expect(res.body.items[0].totalPoints).toBe(970);
  });

  // Période inconnue : refusée
  it('should respond with 400 for an unknown period', async () => {
    const res = await supertest(app).get('/users/leaderboard?period=year');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('period must be all, week or month');
  });

  // Page 0 : les pages commencent à 1
  it('should respond with 400 for an invalid page', async () => {
    const res = await supertest(app).get('/users/leaderboard?page=0');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('page must be a positive integer');
  });

  // Plus de 100 joueurs par page : refusé
  it('should respond with 400 if pageSize is greater than 100', async () => {
    const res = await supertest(app).get('/users/leaderboard?pageSize=101');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('pageSize must be at most 100');
  });
});
