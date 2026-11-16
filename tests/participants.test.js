import supertest from 'supertest';

import app from '../app.js';
import Host from '../models/host.js';
import Participant from '../models/participant.js';
import Room from '../models/room.js';
import Settings from '../models/settings.js';
import {
  addParticipant,
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

// Deux utilisateurs utilisés dans la plupart des tests : l'hôte et un autre joueur
let hostUser;
let player;

beforeEach(async () => {
  hostUser = await createUser({ username: 'host', email: 'host@example.com' });
  player = await createUser({ username: 'player', email: 'player@example.com' });
});

describe('POST /rooms/:code/participants', () => {
  // Un utilisateur rejoint la room avec son code
  it('should add the user to the room', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    const token = generateToken(player);

    const res = await supertest(app)
      .post('/rooms/ABC123/participants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/rooms/ABC123/participants/${res.body.id}`);
    expect(res.body).toEqual({
      id: expect.any(String),
      userId: player.id,
      username: 'player',
      score: 0,
      excluded: false,
      joinedAt: expect.any(String),
    });

    const playersCount = await Participant.countDocuments({ room: room.id });
    expect(playersCount).toBe(2);
  });

  // Joueur exclu par l'hôte : il ne peut pas revenir
  it('should respond with 403 if the user was excluded', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    await Participant.create({ room: room.id, user: player.id, excluded: true });
    const token = generateToken(player);

    const res = await supertest(app)
      .post('/rooms/ABC123/participants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  // Room pleine : on ne peut plus rejoindre
  it('should respond with 409 if the room is full', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    await Settings.updateOne({ room: room.id }, { maxPlayers: 2 });
    const thirdUser = await createUser({ username: 'third', email: 'third@example.com' });
    await addParticipant(room, thirdUser);
    const token = generateToken(player);

    const res = await supertest(app)
      .post('/rooms/ABC123/participants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The room is full');
  });

  // Partie déjà lancée : on ne peut plus rejoindre
  it('should respond with 409 if the game has started', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    await Room.updateOne({ _id: room.id }, { status: 'playing' });
    const token = generateToken(player);

    const res = await supertest(app)
      .post('/rooms/ABC123/participants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('The game has already started');
  });

  // Code inconnu : room introuvable
  it('should respond with 404 if the room does not exist', async () => {
    const token = generateToken(player);

    const res = await supertest(app)
      .post('/rooms/NOPE99/participants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  // Pas de jeton : l'utilisateur n'est pas connecté
  it('should respond with 401 without a token', async () => {
    const res = await supertest(app).post('/rooms/ABC123/participants');

    expect(res.status).toBe(401);
  });
});

describe('GET /rooms/:code/participants', () => {
  // Un joueur voit la liste des joueurs, par ordre d'arrivée
  it('should list the players of the room', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    await addParticipant(room, player);
    const token = generateToken(player);

    const res = await supertest(app)
      .get('/rooms/ABC123/participants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].username).toBe('host');
    expect(res.body[1].username).toBe('player');
  });

  // Utilisateur qui ne joue pas dans la room : interdit
  it('should respond with 403 if the user is not a player of the room', async () => {
    await createRoom(hostUser, 'ABC123');
    const token = generateToken(player);

    const res = await supertest(app)
      .get('/rooms/ABC123/participants')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /rooms/:code/participants/:id', () => {
  // L'hôte exclut un joueur
  it('should exclude the player', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    const participant = await addParticipant(room, player);
    const token = generateToken(hostUser);

    const res = await supertest(app)
      .patch(`/rooms/ABC123/participants/${participant.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ excluded: true });

    expect(res.status).toBe(200);
    expect(res.body.excluded).toBe(true);
    expect(res.body.username).toBe('player');
  });

  // Un joueur qui n'est pas l'hôte ne peut pas exclure
  it('should respond with 403 if the user is not the host', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    const participant = await addParticipant(room, player);
    const token = generateToken(player);

    const res = await supertest(app)
      .patch(`/rooms/ABC123/participants/${participant.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ excluded: true });

    expect(res.status).toBe(403);
  });

  // Body incorrect : seul { excluded: true } est accepté
  it('should respond with 400 if the body is not { excluded: true }', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    const participant = await addParticipant(room, player);
    const token = generateToken(hostUser);

    const res = await supertest(app)
      .patch(`/rooms/ABC123/participants/${participant.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ score: 100 });

    expect(res.status).toBe(400);
  });

  // Identifiant de joueur inconnu : introuvable
  it('should respond with 404 if the participant does not exist', async () => {
    await createRoom(hostUser, 'ABC123');
    const token = generateToken(hostUser);

    const res = await supertest(app)
      .patch('/rooms/ABC123/participants/123')
      .set('Authorization', `Bearer ${token}`)
      .send({ excluded: true });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /rooms/:code/participants/:id', () => {
  // Un joueur quitte la room
  it('should remove the player from the room', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    const participant = await addParticipant(room, player);
    const token = generateToken(player);

    const res = await supertest(app)
      .delete(`/rooms/ABC123/participants/${participant.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    const playersCount = await Participant.countDocuments({ room: room.id });
    expect(playersCount).toBe(1);
  });

  // L'hôte quitte : le joueur arrivé après lui devient l'hôte
  it('should give the host role to the next player when the host leaves', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    await addParticipant(room, player);
    const hostParticipant = await Participant.findOne({ room: room.id, user: hostUser.id });
    const token = generateToken(hostUser);

    const res = await supertest(app)
      .delete(`/rooms/ABC123/participants/${hostParticipant.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    const updatedRoom = await Room.findById(room.id);
    const newHost = await Host.findById(updatedRoom.host);
    expect(newHost.user.toString()).toBe(player.id);
  });

  // Le dernier joueur quitte : la room est supprimée
  it('should delete the room when the last player leaves', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    const hostParticipant = await Participant.findOne({ room: room.id, user: hostUser.id });
    const token = generateToken(hostUser);

    const res = await supertest(app)
      .delete(`/rooms/ABC123/participants/${hostParticipant.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);

    const deletedRoom = await Room.findById(room.id);
    expect(deletedRoom).toBe(null);
  });

  // On ne peut pas faire quitter quelqu'un d'autre
  it('should respond with 403 if the participant is someone else', async () => {
    const room = await createRoom(hostUser, 'ABC123');
    const participant = await addParticipant(room, player);
    const token = generateToken(hostUser);

    const res = await supertest(app)
      .delete(`/rooms/ABC123/participants/${participant.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
