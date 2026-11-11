import bcrypt from 'bcrypt';
import express from 'express';

import { createHttpError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import User from '../models/user.js';

const router = express.Router();

const bcryptCostFactor = 10;
const passwordMinLength = 8;

// Inscription
router.post('/', async (req, res) => {
  const body = req.body || {};

  checkPassword(body.password);
  const hashedPassword = await bcrypt.hash(body.password, bcryptCostFactor);

  const user = await User.create({
    username: body.username,
    email: body.email,
    password: hashedPassword,
  });

  res.status(201).set('Location', `/users/${user.id}`).send(user);
});

// Voir son profil
router.get('/me', authenticate, loadCurrentUser, (req, res) => {
  res.send(req.user);
});

// Modifier son profil (seulement les champs envoyés)
router.patch('/me', authenticate, loadCurrentUser, async (req, res) => {
  const body = req.body || {};
  const user = req.user;

  if (body.username !== undefined) {
    user.username = body.username;
  }

  if (body.email !== undefined) {
    user.email = body.email;
  }

  if (body.password !== undefined) {
    checkPassword(body.password);
    user.password = await bcrypt.hash(body.password, bcryptCostFactor);
  }

  await user.save();

  res.send(user);
});

// Supprimer son compte
router.delete('/me', authenticate, loadCurrentUser, async (req, res) => {
  await req.user.deleteOne();

  res.sendStatus(204);
});

// Vérifie le mot de passe ici, car le schéma ne voit que le hash
function checkPassword(password) {
  if (typeof password !== 'string' || password.length < passwordMinLength) {
    throw createHttpError(
      422,
      `Password must be a string of at least ${passwordMinLength} characters`,
    );
  }
}

// Charge l'utilisateur connecté dans req.user (404 s'il n'existe plus)
async function loadCurrentUser(req, res, next) {
  const user = await User.findById(req.currentUserId);
  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  req.user = user;
  next();
}

export default router;
