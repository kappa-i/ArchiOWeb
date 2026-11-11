import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { databaseUrl, jwtSecret } from '../config.js';
import User from '../models/user.js';

// Connexion, déconnexion et nettoyage de la base de test
export async function connectToDatabase() {
  await mongoose.connect(databaseUrl);

  await mongoose.syncIndexes();
}

export async function disconnectFromDatabase() {
  await mongoose.disconnect();
}

export async function cleanUpDatabase() {
  if (!mongoose.connection.name.endsWith('-test')) {
    throw new Error(`Refusing to clean up database ${mongoose.connection.name}`);
  }

  await User.deleteMany();
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
