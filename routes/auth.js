import bcrypt from 'bcrypt';
import express from 'express';
import jwt from 'jsonwebtoken';

import { jwtSecret } from '../config.js';
import { createHttpError } from '../lib/errors.js';
import User from '../models/user.js';

const router = express.Router();

// Connexion : vérifie l'e-mail et le mot de passe, puis renvoie un token
router.post('/login', async (req, res) => {
  const body = req.body || {};
  const email = body.email;
  const password = body.password;

  if (typeof email !== 'string' || typeof password !== 'string') {
    throw createHttpError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw createHttpError(401, 'Invalid email or password');
  }

  const passwordIsValid = await bcrypt.compare(password, user.password);
  if (!passwordIsValid) {
    throw createHttpError(401, 'Invalid email or password');
  }

  const payload = { sub: user.id };
  const token = jwt.sign(payload, jwtSecret, { expiresIn: '7d' });

  res.send({ token: token });
});

export default router;
