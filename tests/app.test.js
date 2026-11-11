import supertest from 'supertest';

import app from '../app.js';

describe('GET /', () => {
  it('should redirect to the API documentation', async () => {
    const res = await supertest(app).get('/');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api-docs');
  });
});

describe('GET /api-docs/', () => {
  it('should serve the API documentation', async () => {
    const res = await supertest(app).get('/api-docs/');

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
