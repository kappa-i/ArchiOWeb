import supertest from 'supertest';

import app from '../app.js';

describe('GET /', () => {
  // La racine envoie vers le menu du jeu
  it('should redirect to the game menu', async () => {
    const res = await supertest(app).get('/');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/play/lobby.html');
  });
});

describe('GET /api-docs/', () => {
  it('should serve the API documentation', async () => {
    const res = await supertest(app).get('/api-docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});

describe('GET /play/lobby.html', () => {
  // La page de la salle d'attente est servie par l'API
  it('should serve the waiting room page', async () => {
    const res = await supertest(app).get('/play/lobby.html');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});

describe('GET /play/leaderboard.html', () => {
  // La page du classement est servie par l'API
  it('should serve the leaderboard page', async () => {
    const res = await supertest(app).get('/play/leaderboard.html');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});

describe('GET /unknown', () => {
  it('should respond with 404 Not Found', async () => {
    const res = await supertest(app).get('/unknown');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual({ message: 'Not Found' });
  });
});

describe('POST /unknown with invalid JSON', () => {
  it('should respond with 400 Bad Request', async () => {
    const res = await supertest(app)
      .post('/unknown')
      .set('Content-Type', 'application/json')
      .send('{ invalid json');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual({ message: expect.any(String) });
  });
});
