import supertest from 'supertest';

import app from '../app.js';
import {
  cleanUpDatabase,
  connectToDatabase,
  createResult,
  createUser,
  disconnectFromDatabase,
} from './utils.js';

beforeAll(connectToDatabase);
beforeEach(cleanUpDatabase);
afterAll(disconnectFromDatabase);

const dayInMilliseconds = 24 * 60 * 60 * 1000;

function addResult(user, score, date = new Date()) {
  return createResult(user, {
    score: score,
    rank: 2,
    date: date,
  });
}

describe('GET /users/leaderboard', () => {
  it('should rank users by their total points with default pagination', async () => {
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
        limit: 10,
        totalItems: 2,
        totalPages: 1,
      },
    });
  });

  it('should return the requested page and preserve each player rank', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const bob = await createUser({ username: 'bob', email: 'bob@example.com' });
    const charlie = await createUser({ username: 'charlie', email: 'charlie@example.com' });

    await addResult(alice, 300);
    await addResult(bob, 200);
    await addResult(charlie, 100);

    const res = await supertest(app).get('/users/leaderboard?page=2&limit=1');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      { rank: 2, userId: bob.id, username: 'bob', totalPoints: 200 },
    ]);
    expect(res.body.pagination).toEqual({
      page: 2,
      limit: 1,
      totalItems: 3,
      totalPages: 3,
    });
  });

  it('should filter results using rolling week and month periods', async () => {
    const alice = await createUser({ username: 'alice', email: 'alice@example.com' });
    const recentDate = new Date(Date.now() - 2 * dayInMilliseconds);
    const oldDate = new Date(Date.now() - 8 * dayInMilliseconds);

    await addResult(alice, 70, recentDate);
    await addResult(alice, 900, oldDate);

    const weekRes = await supertest(app).get('/users/leaderboard?period=week');

    expect(weekRes.status).toBe(200);
    expect(weekRes.body.items[0].totalPoints).toBe(70);
    expect(weekRes.body.pagination.totalItems).toBe(1);

    const monthRes = await supertest(app).get('/users/leaderboard?period=month');

    expect(monthRes.status).toBe(200);
    expect(monthRes.body.items[0].totalPoints).toBe(970);
    expect(monthRes.body.pagination.totalItems).toBe(1);
  });

  it('should respond with 400 for an unsupported period', async () => {
    const res = await supertest(app).get('/users/leaderboard?period=year');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('period must be all, week or month');
  });

  it('should respond with 400 for an invalid page', async () => {
    const res = await supertest(app).get('/users/leaderboard?page=0');

    expect(res.status).toBe(400);
  });

  it('should respond with 400 if the limit is greater than 100', async () => {
    const res = await supertest(app).get('/users/leaderboard?limit=101');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('limit must be at most 100');
  });
});
