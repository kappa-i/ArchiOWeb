import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { databaseUrl, jwtSecret } from '../config.js';
import { stopAllGames } from '../lib/game.js';
import Drawing from '../models/drawing.js';
import Guess from '../models/guess.js';
import Host from '../models/host.js';
import Participant from '../models/participant.js';
import Result from '../models/result.js';
import Room from '../models/room.js';
import Settings from '../models/settings.js';
import User from '../models/user.js';
import Word from '../models/word.js';

// Connexion, déconnexion et nettoyage de la base de test
export async function connectToDatabase() {
  await mongoose.connect(databaseUrl);

  await mongoose.syncIndexes();
}

export async function disconnectFromDatabase() {
  stopAllGames();
  await mongoose.disconnect();
}

// Vide la base de test et arrête les parties lancées par le test précédent
export async function cleanUpDatabase() {
  if (!mongoose.connection.name.endsWith('-test')) {
    throw new Error(`Refusing to clean up database ${mongoose.connection.name}`);
  }

  stopAllGames();

  await User.deleteMany();
  await Host.deleteMany();
  await Room.deleteMany();
  await Settings.deleteMany();
  await Participant.deleteMany();
  await Result.deleteMany();
  await Word.deleteMany();
  await Drawing.deleteMany();
  await Guess.deleteMany();
}

// Crée un utilisateur en base, avec des valeurs par défaut pour les champs non donnés
export async function createUser(data = {}) {
  let username = 'jdoe';
  if (data.username) {
    username = data.username;
  }

  let email = 'jdoe@example.com';
  if (data.email) {
    email = data.email;
  }

  let password = 'password123';
  if (data.password) {
    password = data.password;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    username: username,
    email: email,
    password: hashedPassword,
  });

  return user;
}

// Crée un jeton de connexion pour cet utilisateur
export function generateToken(user) {
  return jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '1h' });
}

// Crée une room en base dont cet utilisateur est l'hôte (et le premier joueur), avec les paramètres par défaut
export async function createRoom(user, code = 'ABC123') {
  const host = await Host.create({ user: user.id, roomsCreated: 1 });
  const room = await Room.create({ code: code, host: host.id });
  await Settings.create({ room: room.id });
  await Participant.create({ room: room.id, user: user.id });

  return room;
}

// Ajoute cet utilisateur comme joueur de la room
export async function addParticipant(room, user) {
  const participant = await Participant.create({ room: room.id, user: user.id });

  return participant;
}

// Ajoute un mot à dessiner
export async function createWord(label, difficulty = 'easy') {
  const word = await Word.create({ label: label, difficulty: difficulty });

  return word;
}

// Attend (au plus 5 secondes) que la fonction check renvoie autre chose que null.
// Sert à attendre une étape de la partie, qui se déroule en arrière-plan.
export async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    const result = await check();
    if (result !== null) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('Waited too long');
}

// Enregistre le résultat d'une partie terminée pour cet utilisateur
export async function createResult(user, data) {
  const result = await Result.create({
    user: user.id,
    score: data.score,
    rank: data.rank,
    wordsFound: data.wordsFound,
    firstFinds: data.firstFinds,
    totalFindTime: data.totalFindTime,
    successfulDrawings: data.successfulDrawings,
    drawingPoints: data.drawingPoints,
    date: data.date,
  });

  return result;
}
