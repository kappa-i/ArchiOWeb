import bcrypt from 'bcrypt';
import express from 'express';
import mongoose from 'mongoose';

import { createHttpError } from '../lib/errors.js';
import { authenticate, loadCurrentUser } from '../middleware/auth.js';
import Result from '../models/result.js';
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

// Supprimer son compte (et ses résultats de parties)
router.delete('/me', authenticate, loadCurrentUser, async (req, res) => {
  await Result.deleteMany({ user: req.user.id });
  await req.user.deleteOne();

  res.sendStatus(204);
});

// Statistiques d'un joueur, calculées par agrégation sur ses résultats
router.get('/:id/stats', async (req, res) => {
  const id = req.params.id;

  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError(404, 'User not found');
  }

  const user = await User.findById(id);
  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  // On regroupe tous les résultats du joueur en un seul document de totaux
  const totals = await Result.aggregate([
    {
      $match: { user: user._id },
    },
    {
      $group: {
        _id: '$user',
        gamesPlayed: { $sum: 1 },
        wins: { $sum: { $cond: [{ $eq: ['$rank', 1] }, 1, 0] } },
        bestScore: { $max: '$score' },
        totalPoints: { $sum: '$score' },
        lastGame: { $max: '$date' },
        wordsFound: { $sum: '$wordsFound' },
        firstFinds: { $sum: '$firstFinds' },
        totalFindTime: { $sum: '$totalFindTime' },
        successfulDrawings: { $sum: '$successfulDrawings' },
        drawingPoints: { $sum: '$drawingPoints' },
      },
    },
  ]);

  // Aucune partie jouée : tout est à zéro
  let stats = {
    gamesPlayed: 0,
    wins: 0,
    bestScore: 0,
    totalPoints: 0,
    lastGame: null,
    wordsFound: 0,
    firstFinds: 0,
    totalFindTime: 0,
    successfulDrawings: 0,
    drawingPoints: 0,
  };
  if (totals.length > 0) {
    stats = totals[0];
  }

  // Moyennes et pourcentage calculés ici, en évitant la division par zéro
  let winRate = 0;
  let averageScore = 0;
  if (stats.gamesPlayed > 0) {
    winRate = Math.round((stats.wins / stats.gamesPlayed) * 100);
    averageScore = Math.round(stats.totalPoints / stats.gamesPlayed);
  }

  let averageFindTime = 0;
  if (stats.wordsFound > 0) {
    averageFindTime = Math.round(stats.totalFindTime / stats.wordsFound);
  }

  res.send({
    userId: user.id,
    username: user.username,
    player: {
      gamesPlayed: stats.gamesPlayed,
      wins: stats.wins,
      winRate: winRate,
      bestScore: stats.bestScore,
      averageScore: averageScore,
      totalPoints: stats.totalPoints,
      lastGame: stats.lastGame,
    },
    guesser: {
      wordsFound: stats.wordsFound,
      firstFinds: stats.firstFinds,
      averageFindTime: averageFindTime,
    },
    drawer: {
      successfulDrawings: stats.successfulDrawings,
      drawingPoints: stats.drawingPoints,
    },
  });
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

export default router;
