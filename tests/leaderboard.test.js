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

const oneHour = 60 * 60 * 1000;

// Enregistre une partie terminée pour ce joueur : son score, sa place, et il y a combien d'heures
function addResult(user, score, rank, hoursAgo) {
  return createResult(user, {
    score: score,
    rank: rank,
    date: new Date(Date.now() - hoursAgo * oneHour),
  });
}

describe('GET /users/leaderboard', () => {
  // Sans paramètre : les joueurs classés par total de points avec leurs stats, page 1 de 10 joueurs
  it('should rank the players by their total points', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    await createUser({ username: 'charlie', email: 'charlie@example.com' });
    await addResult(alice, 150, 1, 3);
    await addResult(alice, 50, 2, 2);
    await addResult(bob, 175, 1, 1);

    const res = await supertest(app).get('/users/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [
        {
          rank: 1,
          userId: alice.id,
          username: 'alice',
          totalPoints: 200,
          gamesPlayed: 2,
          wins: 1,
          winRate: 50,
          bestScore: 150,
          wordsFound: 0,
          firstFinds: 0,
          successfulDrawings: 0,
          movement: null,
          winStreak: 0,
        },
        {
          rank: 2,
          userId: bob.id,
          username: 'bob',
          totalPoints: 175,
          gamesPlayed: 1,
          wins: 1,
          winRate: 100,
          bestScore: 175,
          wordsFound: 0,
          firstFinds: 0,
          successfulDrawings: 0,
          movement: null,
          winStreak: 1,
        },
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
    await addResult(alice, 300, 1, 1);
    await addResult(bob, 200, 2, 1);
    await addResult(charlie, 100, 3, 1);

    const res = await supertest(app).get('/users/leaderboard?page=2&pageSize=1');

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].rank).toBe(2);
    expect(res.body.items[0].username).toBe('bob');
    expect(res.body.pagination).toEqual({ page: 2, pageSize: 1, totalItems: 3, totalPages: 3 });
  });

  // Filtre « day » : seule la partie d'il y a 2 heures compte, pas celle d'il y a 30 heures
  it('should only count the games of the last 24 hours with period=day', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    await addResult(alice, 70, 1, 2);
    await addResult(alice, 900, 1, 30);

    const res = await supertest(app).get('/users/leaderboard?period=day');

    expect(res.status).toBe(200);
    expect(res.body.items[0].totalPoints).toBe(70);
  });

  // Filtre « week » : seule la partie d'il y a 2 jours compte, pas celle d'il y a 8 jours
  it('should only count the games of the last 7 days with period=week', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    await addResult(alice, 70, 1, 2 * 24);
    await addResult(alice, 900, 1, 8 * 24);

    const res = await supertest(app).get('/users/leaderboard?period=week');

    expect(res.status).toBe(200);
    expect(res.body.items[0].totalPoints).toBe(70);
  });

  // Filtre « month » : les deux premières parties comptent, mais pas celle d'il y a 40 jours
  it('should only count the games of the last 30 days with period=month', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    await addResult(alice, 70, 1, 2 * 24);
    await addResult(alice, 900, 1, 8 * 24);
    await addResult(alice, 5000, 1, 40 * 24);

    const res = await supertest(app).get('/users/leaderboard?period=month');

    expect(res.status).toBe(200);
    expect(res.body.items[0].totalPoints).toBe(970);
  });

  // Recherche « CHAR » : seulement charlie, qui garde son rang du classement complet (3e)
  it('should only return the players whose username contains the search', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    const charlie = await createUser({ username: 'charlie', email: 'charlie@example.com' });
    await addResult(alice, 300, 1, 1);
    await addResult(bob, 200, 2, 1);
    await addResult(charlie, 100, 3, 1);

    const res = await supertest(app).get('/users/leaderboard?search=CHAR');

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].username).toBe('charlie');
    expect(res.body.items[0].rank).toBe(3);
    expect(res.body.pagination.totalItems).toBe(1);
  });

  // Bob dépasse alice dans les dernières 24 h : il gagne 1 place, elle en perd 1
  it('should give the places won or lost in the last 24 hours', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    await addResult(alice, 100, 1, 48);
    await addResult(bob, 50, 2, 48);
    await addResult(bob, 80, 1, 1);

    const res = await supertest(app).get('/users/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.items[0].username).toBe('bob');
    expect(res.body.items[0].movement).toBe(1);
    expect(res.body.items[1].username).toBe('alice');
    expect(res.body.items[1].movement).toBe(-1);
  });

  // Une défaite puis 3 victoires : série de 3 victoires d'affilée
  it('should count the wins in a row of each player', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    await addResult(alice, 40, 2, 4);
    await addResult(alice, 100, 1, 3);
    await addResult(alice, 100, 1, 2);
    await addResult(alice, 100, 1, 1);

    const res = await supertest(app).get('/users/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.items[0].winStreak).toBe(3);
  });

  // Période inconnue : refusée
  it('should respond with 400 for an unknown period', async () => {
    const res = await supertest(app).get('/users/leaderboard?period=year');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('period must be all, month, week or day');
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

describe('GET /users/leaderboard/highlights', () => {
  // Il y a 3 jours alice menait. Bob a gagné 2 parties d'affilée aujourd'hui et l'a dépassée il y a 1 heure.
  it('should return the podium, the leader, the biggest climber and the longest win streak', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    const charlie = await createUser({ username: 'charlie', email: 'charlie@example.com' });
    await addResult(alice, 100, 1, 72);
    await addResult(bob, 60, 2, 72);
    await addResult(charlie, 20, 3, 72);
    await addResult(bob, 30, 1, 2);
    const bobLastGame = await addResult(bob, 40, 1, 1);

    const res = await supertest(app).get('/users/leaderboard/highlights');

    expect(res.status).toBe(200);
    expect(res.body.podium.length).toBe(3);
    expect(res.body.podium[0].username).toBe('bob');
    expect(res.body.podium[1].username).toBe('alice');
    expect(res.body.podium[2].username).toBe('charlie');
    expect(res.body.leader).toEqual({
      userId: bob.id,
      username: 'bob',
      since: bobLastGame.date.toISOString(),
    });
    expect(res.body.biggestClimber).toEqual({ userId: bob.id, username: 'bob', places: 1 });
    expect(res.body.longestWinStreak).toEqual({ userId: bob.id, username: 'bob', wins: 2 });
  });

  // Aucune partie jouée : podium vide et pas de tendances
  it('should return an empty podium when nobody has played', async () => {
    const res = await supertest(app).get('/users/leaderboard/highlights?period=day');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      podium: [],
      leader: null,
      biggestClimber: null,
      longestWinStreak: null,
    });
  });

  // Période inconnue : refusée
  it('should respond with 400 for an unknown period', async () => {
    const res = await supertest(app).get('/users/leaderboard/highlights?period=year');

    expect(res.status).toBe(400);
  });
});
