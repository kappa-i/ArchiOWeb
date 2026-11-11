import supertest from 'supertest';

import app from '../app.js';
import { cleanUpDatabase, connectToDatabase, createUser, disconnectFromDatabase } from './utils.js';

// Connexion à la base de test, vidée avant chaque test, déconnexion à la fin
beforeAll(connectToDatabase);
beforeEach(cleanUpDatabase);
afterAll(disconnectFromDatabase);

describe('POST /auth/login', () => {
  // Chaque test de connexion commence avec cet utilisateur en base
  beforeEach(async () => {
    await createUser({ email: 'jdoe@example.com', password: 'password123' });
  });

  // Bon e-mail + bon mot de passe : l'API renvoie un jeton
  it('should return a token for valid credentials', async () => {
    const res = await supertest(app)
      .post('/auth/login')
      .send({ email: 'jdoe@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: expect.any(String) });
  });

  // Mauvais mot de passe : accès refusé
  it('should respond with 401 for a wrong password', async () => {
    const res = await supertest(app)
      .post('/auth/login')
      .send({ email: 'jdoe@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid email or password' });
  });

  // E-mail inconnu : même refus, pour qu'on ne puisse pas deviner les e-mails existants
  it('should respond with 401 for an unknown email', async () => {
    const res = await supertest(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Invalid email or password' });
  });

  // Corps vide : la requête est mal formée
  it('should respond with 400 if the fields are missing', async () => {
    const res = await supertest(app).post('/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Email and password are required' });
  });
});
