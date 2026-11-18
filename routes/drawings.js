import express from 'express';

import { submitGuess } from '../lib/game.js';
import { createHttpError } from '../lib/errors.js';
import { authenticate, loadCurrentUser } from '../middleware/auth.js';
import {
  loadDrawingFromParams,
  loadRoomFromParams,
  requireRoomPlayer,
} from '../middleware/rooms.js';
import Drawing from '../models/drawing.js';
import Guess from '../models/guess.js';
import Participant from '../models/participant.js';
import Word from '../models/word.js';

// mergeParams : permet de lire le :code de la room, qui est dans l'URL définie dans app.js
const router = express.Router({ mergeParams: true });

const guessMaxLength = 50;

// Dessins de la partie, dans l'ordre (le mot n'est visible qu'une fois le tour fini)
router.get('/', authenticate, loadRoomFromParams, requireRoomPlayer, async (req, res) => {
  const drawings = await Drawing.find({ room: req.room.id }).sort({ startedAt: 1, _id: 1 });

  const response = [];
  for (const drawing of drawings) {
    let word = null;
    if (drawing.endedAt) {
      const wordDocument = await Word.findById(drawing.word);
      word = wordDocument.label;
    }

    response.push(formatDrawing(drawing, word));
  }

  res.send(response);
});

// Proposer un mot pour le dessin en cours (pas le dessinateur)
router.post(
  '/:id/guesses',
  authenticate,
  loadCurrentUser,
  loadRoomFromParams,
  requireRoomPlayer,
  loadDrawingFromParams,
  async (req, res) => {
    const body = req.body || {};

    if (typeof body.content === 'string' && body.content.length > guessMaxLength) {
      throw createHttpError(422, `A guess must be at most ${guessMaxLength} characters long`);
    }

    const guess = await submitGuess(
      req.room,
      req.drawing,
      req.player,
      req.user.username,
      body.content,
    );

    res.status(201).send(formatGuess(guess, req.user.username, false));
  },
);

// Propositions faites sur un dessin, dans l'ordre (pendant le tour, les bonnes réponses ne montrent pas le mot)
router.get(
  '/:id/guesses',
  authenticate,
  loadRoomFromParams,
  requireRoomPlayer,
  loadDrawingFromParams,
  async (req, res) => {
    const guesses = await Guess.find({ drawing: req.drawing.id }).sort({ createdAt: 1, _id: 1 });
    const players = await Participant.find({ room: req.room.id }).populate('user');
    const isDrawingFinished = Boolean(req.drawing.endedAt);

    const response = [];
    for (const guess of guesses) {
      const hideContent = guess.isCorrect && !isDrawingFinished;
      response.push(formatGuess(guess, findUsername(players, guess.participant), hideContent));
    }

    res.send(response);
  },
);

// Pseudo du joueur qui a fait une proposition (il a pu quitter la room depuis)
function findUsername(players, participantId) {
  for (const player of players) {
    if (player.id === participantId.toString() && player.user) {
      return player.user.username;
    }
  }
  return null;
}

// Réponse JSON d'un dessin
function formatDrawing(drawing, word) {
  return {
    id: drawing.id,
    participantId: drawing.participant,
    roundNumber: drawing.roundNumber,
    word: word,
    startedAt: drawing.startedAt,
    endedAt: drawing.endedAt || null,
  };
}

// Réponse JSON d'une proposition
function formatGuess(guess, username, hideContent) {
  let content = guess.content;
  if (hideContent) {
    content = null;
  }

  return {
    id: guess.id,
    participantId: guess.participant,
    username: username,
    content: content,
    isCorrect: guess.isCorrect,
    points: guess.points,
    createdAt: guess.createdAt,
  };
}

export default router;
