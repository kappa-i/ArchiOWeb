import supertest from 'supertest';

import app from '../app.js';
import {
  cleanUpDatabase,
  connectToDatabase,
  createUser,
  disconnectFromDatabase,
  generateToken,
} from './utils.js';

// Connexion à la base de test, vidée avant chaque test, déconnexion à la fin
beforeAll(connectToDatabase);
beforeEach(cleanUpDatabase);
afterAll(disconnectFromDatabase);

describe('POST /users', () => {
  // Inscription valide : l'utilisateur est renvoyé, sans le mot de passe
  it('should create a user', async () => {
    const res = await supertest(app)
      .post('/users')
      .send({ username: 'jdoe', email: 'jdoe@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/users/${res.body.id}`);
    expect(res.body).toEqual({
      id: expect.any(String),
      username: 'jdoe',
      email: 'jdoe@example.com',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  // Mot de passe de moins de 8 caractères : refusé
  it('should respond with 422 if the password is too short', async () => {
    const res = await supertest(app)
      .post('/users')
      .send({ username: 'jdoe', email: 'jdoe@example.com', password: 'short' });

    expect(res.status).toBe(422);
  });

  // E-mail mal écrit : refusé
  it('should respond with 422 if the email is invalid', async () => {
    const res = await supertest(app)
      .post('/users')
      .send({ username: 'jdoe', email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(422);
  });

  // E-mail déjà pris par un autre compte : conflit
  it('should respond with 409 if the email is already used', async () => {
    await createUser({ username: 'other', email: 'jdoe@example.com' });

    const res = await supertest(app)
      .post('/users')
      .send({ username: 'jdoe', email: 'jdoe@example.com', password: 'password123' });

    expect(res.status).toBe(409);
  });
});

describe('GET /users/me', () => {
  // Jeton valide : l'API renvoie le profil de l'utilisateur connecté
  it('should return the authenticated user', async () => {
    const user = await createUser({ username: 'jdoe' });
    const token = generateToken(user);

    const res = await supertest(app).get('/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('jdoe');
  });

  // Pas de jeton : l'utilisateur n'est pas connecté
  it('should respond with 401 without a token', async () => {
    const res = await supertest(app).get('/users/me');

    expect(res.status).toBe(401);
  });

  // Faux jeton : refusé
  it('should respond with 401 with an invalid token', async () => {
    const res = await supertest(app).get('/users/me').set('Authorization', 'Bearer invalid');

    expect(res.status).toBe(401);
  });

  // Jeton valide, mais le compte a été supprimé entre-temps
  it('should respond with 404 if the user no longer exists', async () => {
    const user = await createUser();
    const token = generateToken(user);
    await user.deleteOne();

    const res = await supertest(app).get('/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /users/me', () => {
  // Modifier seulement le nom d'utilisateur
  it('should update the username', async () => {
    const user = await createUser({ username: 'jdoe' });
    const token = generateToken(user);

    const res = await supertest(app)
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'johnny' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('johnny');
  });

  // Modifier l'e-mail et le mot de passe en même temps
  it('should update the email and the password', async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await supertest(app)
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'johnny@example.com', password: 'new-password' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('johnny@example.com');
  });

  // Pas de jeton : l'utilisateur n'est pas connecté
  it('should respond with 401 without a token', async () => {
    const res = await supertest(app).patch('/users/me').send({ username: 'johnny' });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /users/me', () => {
  // Jeton valide : le compte est supprimé, réponse vide
  it('should delete the authenticated user', async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await supertest(app).delete('/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  // Pas de jeton : l'utilisateur n'est pas connecté
  it('should respond with 401 without a token', async () => {
    const res = await supertest(app).delete('/users/me');

    expect(res.status).toBe(401);
  });
});
