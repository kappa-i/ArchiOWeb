import supertest from 'supertest';

import app from '../app.js';
import Room from '../models/room.js';
import {
  cleanUpDatabase,
  connectToDatabase,
  createRoom,
  createUser,
  disconnectFromDatabase,
  generateToken,
} from './utils.js';

// Connexion à la base de test, vidée avant chaque test, déconnexion à la fin
beforeAll(connectToDatabase);
beforeEach(cleanUpDatabase);
afterAll(disconnectFromDatabase);

describe('POST /rooms', () => {
  // Utilisateur connecté : la room est créée avec un code et les paramètres par défaut
  it('should create a room', async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await supertest(app).post('/rooms').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/rooms/${res.body.code}`);
    expect(res.body).toEqual({
      id: expect.any(String),
      code: expect.any(String),
      status: 'waiting',
      hostUserId: user.id,
      settings: { maxPlayers: 8, rounds: 3, turnDuration: 80 },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  // Pas de jeton : l'utilisateur n'est pas connecté
  it('should respond with 401 without a token', async () => {
    const res = await supertest(app).post('/rooms');

    expect(res.status).toBe(401);
  });
});

describe('GET /rooms/:code', () => {
  // Code existant : l'API renvoie la room
  it('should return the room', async () => {
    const user = await createUser();
    const token = generateToken(user);
    await createRoom(user, 'ABC123');

    const res = await supertest(app).get('/rooms/ABC123').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ABC123');
    expect(res.body.settings.maxPlayers).toBe(8);
  });

  // Code inconnu : room introuvable
  it('should respond with 404 if the room does not exist', async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await supertest(app).get('/rooms/NOPE99').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  // Pas de jeton : l'utilisateur n'est pas connecté
  it('should respond with 401 without a token', async () => {
    const res = await supertest(app).get('/rooms/ABC123');

    expect(res.status).toBe(401);
  });
});

describe('PATCH /rooms/:code/settings', () => {
  // L'hôte modifie les paramètres
  it('should update the settings', async () => {
    const user = await createUser();
    const token = generateToken(user);
    await createRoom(user, 'ABC123');

    const res = await supertest(app)
      .patch('/rooms/ABC123/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ maxPlayers: 4, rounds: 5, turnDuration: 60 });

    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({ maxPlayers: 4, rounds: 5, turnDuration: 60 });
  });

  // Un autre utilisateur que l'hôte : interdit
  it('should respond with 403 if the user is not the host', async () => {
    const host = await createUser({ username: 'host', email: 'host@example.com' });
    const otherUser = await createUser({ username: 'other', email: 'other@example.com' });
    const token = generateToken(otherUser);
    await createRoom(host, 'ABC123');

    const res = await supertest(app)
      .patch('/rooms/ABC123/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ rounds: 5 });

    expect(res.status).toBe(403);
  });

  // Valeur hors limites (plus de 8 joueurs) : refusée
  it('should respond with 422 if a value is invalid', async () => {
    const user = await createUser();
    const token = generateToken(user);
    await createRoom(user, 'ABC123');

    const res = await supertest(app)
      .patch('/rooms/ABC123/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ maxPlayers: 20 });

    expect(res.status).toBe(422);
  });

  // Partie déjà lancée : on ne peut plus modifier les paramètres
  it('should respond with 409 if the game has started', async () => {
    const user = await createUser();
    const token = generateToken(user);
    const room = await createRoom(user, 'ABC123');
    await Room.updateOne({ _id: room.id }, { status: 'playing' });

    const res = await supertest(app)
      .patch('/rooms/ABC123/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ rounds: 5 });

    expect(res.status).toBe(409);
  });
});
