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

// Classement des joueurs par total de points, avec pagination et filtre par période
router.get('/leaderboard', async (req, res) => {
  const page = parsePositiveInteger(req.query.page, 1, 'page');
  const limit = parsePositiveInteger(req.query.limit, 10, 'limit');

  if (limit > 100) {
    throw createHttpError(400, 'limit must be at most 100');
  }

  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip + limit)) {
    throw createHttpError(400, 'page is too large');
  }

  const period = req.query.period === undefined ? 'all' : req.query.period;
  if (typeof period !== 'string' || !['all', 'week', 'month'].includes(period)) {
    throw createHttpError(400, 'period must be all, week or month');
  }

  const match = {};
  const dayInMilliseconds = 24 * 60 * 60 * 1000;

  if (period === 'week') {
    match.date = { $gte: new Date(Date.now() - 7 * dayInMilliseconds) };
  } else if (period === 'month') {
    match.date = { $gte: new Date(Date.now() - 30 * dayInMilliseconds) };
  }

  const [leaderboard] = await Result.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$user',
        totalPoints: { $sum: '$score' },
      },
    },
    { $sort: { totalPoints: -1, _id: 1 } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: User.collection.name,
              localField: '_id',
              foreignField: '_id',
              as: 'user',
            },
          },
          { $unwind: '$user' },
          {
            $project: {
              _id: 0,
              userId: '$_id',
              username: '$user.username',
              totalPoints: 1,
            },
          },
        ],
        metadata: [{ $count: 'totalItems' }],
      },
    },
  ]);

  const totalItems = leaderboard.metadata[0]?.totalItems || 0;

  res.send({
    items: leaderboard.items.map((item, index) => ({
      rank: skip + index + 1,
      userId: item.userId.toString(),
      username: item.username,
      totalPoints: item.totalPoints,
    })),
    pagination: {
      page: page,
      limit: limit,
      totalItems: totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  });
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

function parsePositiveInteger(value, defaultValue, field) {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw createHttpError(400, `${field} must be a positive integer`);
  }

  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw createHttpError(400, `${field} must be a safe integer`);
  }

  return number;
}

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
