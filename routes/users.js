import bcrypt from 'bcrypt';
import express from 'express';
import mongoose from 'mongoose';

import { createHttpError } from '../lib/errors.js';
import {
  computeLeaderboard,
  findBiggestClimber,
  findLongestWinStreak,
} from '../lib/leaderboard.js';
import { removePlayer } from '../lib/rooms.js';
import { authenticate, loadCurrentUser } from '../middleware/auth.js';
import { readPeriod } from '../middleware/leaderboard.js';
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

// Classement des joueurs par total de points, paginé.
// Filtres optionnels : ?period= (all, month, week, day) et ?search= (le pseudo contient ce texte).
router.get('/leaderboard', paginate, readPeriod, async (req, res) => {
  const pagination = req.pagination;
  const leaderboard = await computeLeaderboard(req.period);

  let players = leaderboard.players;

  // Recherche par pseudo, sans tenir compte des majuscules. Chaque joueur garde son rang du classement complet.
  if (req.query.search !== undefined) {
    if (typeof req.query.search !== 'string') {
      throw createHttpError(400, 'search must be a string');
    }

    const search = req.query.search.trim().toLowerCase();
    const foundPlayers = [];

    for (const player of players) {
      if (player.username.toLowerCase().includes(search)) {
        foundPlayers.push(player);
      }
    }

    players = foundPlayers;
  }

  // Seulement les joueurs de la page demandée (ex. page 2 de 10 : du 11e au 20e)
  const items = players.slice(pagination.skip, pagination.skip + pagination.pageSize);

  res.send({
    items: items,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems: players.length,
      totalPages: Math.ceil(players.length / pagination.pageSize),
    },
  });
});

// Le podium (3 premiers) et les tendances du classement de la période :
// qui est en tête et depuis quand, la plus grosse progression en 24 h, la plus longue série de victoires
router.get('/leaderboard/highlights', readPeriod, async (req, res) => {
  const leaderboard = await computeLeaderboard(req.period);
  const players = leaderboard.players;

  let leader = null;
  if (players.length > 0) {
    leader = {
      userId: players[0].userId,
      username: players[0].username,
      since: leaderboard.leaderSince,
    };
  }

  res.send({
    podium: players.slice(0, 3),
    leader: leader,
    biggestClimber: findBiggestClimber(players),
    longestWinStreak: findLongestWinStreak(players),
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
