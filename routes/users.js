import bcrypt from 'bcrypt';
import express from 'express';
import mongoose from 'mongoose';

import { createHttpError } from '../lib/errors.js';
import { removePlayer } from '../lib/rooms.js';
import { authenticate, loadCurrentUser } from '../middleware/auth.js';
import { paginate } from '../middleware/pagination.js';
import Host from '../models/host.js';
import Participant from '../models/participant.js';
import Result from '../models/result.js';
import Room from '../models/room.js';
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

// Supprimer son compte : il quitte d'abord toutes ses rooms, puis ses résultats sont supprimés
router.delete('/me', authenticate, loadCurrentUser, async (req, res) => {
  const participants = await Participant.find({ user: req.user.id });

  for (const participant of participants) {
    // Exclu : il ne joue déjà plus dans cette room, on supprime juste sa fiche
    if (participant.excluded) {
      await Participant.deleteOne({ _id: participant.id });
    } else {
      const room = await Room.findById(participant.room);
      await removePlayer(room, participant);
    }
  }

  await Host.deleteOne({ user: req.user.id });
  await Result.deleteMany({ user: req.user.id });
  await req.user.deleteOne();

  res.sendStatus(204);
});

// Périodes acceptées par le filtre ?period= du classement
const leaderboardPeriods = ['all', 'week', 'month'];

// Classement des joueurs par total de points, paginé, avec un filtre optionnel par période
router.get('/leaderboard', paginate, async (req, res) => {
  const pagination = req.pagination;

  let period = 'all';
  if (req.query.period !== undefined) {
    period = req.query.period;
  }

  if (!leaderboardPeriods.includes(period)) {
    throw createHttpError(400, 'period must be all, week or month');
  }

  // Filtre sur la date des parties : les 7 ou 30 derniers jours (pas de filtre pour « all »)
  const filter = {};
  const oneDay = 24 * 60 * 60 * 1000;

  if (period === 'week') {
    filter.date = { $gte: new Date(Date.now() - 7 * oneDay) };
  }

  if (period === 'month') {
    filter.date = { $gte: new Date(Date.now() - 30 * oneDay) };
  }

  // Total des points par joueur, du meilleur au moins bon, seulement pour la page demandée
  const totals = await Result.aggregate([
    {
      $match: filter,
    },
    {
      $group: {
        _id: '$user',
        totalPoints: { $sum: '$score' },
      },
    },
    {
      // À égalité de points, on trie par id pour que l'ordre ne change pas d'une page à l'autre
      $sort: { totalPoints: -1, _id: 1 },
    },
    {
      $skip: pagination.skip,
    },
    {
      $limit: pagination.pageSize,
    },
    {
      // Ajoute le compte du joueur (pour son pseudo)
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $unwind: '$user',
    },
  ]);

  // Nombre total de joueurs classés (toutes les pages), pour calculer le nombre de pages
  const count = await Result.aggregate([
    {
      $match: filter,
    },
    {
      $group: { _id: '$user' },
    },
    {
      $count: 'totalItems',
    },
  ]);

  let totalItems = 0;
  if (count.length > 0) {
    totalItems = count[0].totalItems;
  }

  // Le rang tient compte des pages précédentes : le 1er de la page 2 (10 par page) est 11e
  const items = [];
  for (let i = 0; i < totals.length; i++) {
    const total = totals[i];

    items.push({
      rank: pagination.skip + i + 1,
      userId: total.user._id.toString(),
      username: total.user.username,
      totalPoints: total.totalPoints,
    });
  }

  res.send({
    items: items,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems: totalItems,
      totalPages: Math.ceil(totalItems / pagination.pageSize),
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
