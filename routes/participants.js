import express from 'express';

import { createHttpError } from '../lib/errors.js';
import { broadcast } from '../lib/realtime.js';
import { findPlayersInOrder, leaveAllRooms, removePlayer } from '../lib/rooms.js';
import { authenticate, loadCurrentUser } from '../middleware/auth.js';
import {
  loadParticipantFromParams,
  loadRoomFromParams,
  requireRoomHost,
  requireRoomPlayer,
} from '../middleware/rooms.js';
import Participant from '../models/participant.js';
import Settings from '../models/settings.js';
import User from '../models/user.js';

// mergeParams : permet de lire le :code de la room, qui est dans l'URL définie dans app.js
const router = express.Router({ mergeParams: true });

// Rejoindre une room avec son code.
// On ne joue que dans une room à la fois : il quitte d'abord les autres.
router.post('/', authenticate, loadCurrentUser, loadRoomFromParams, async (req, res) => {
  const existingParticipant = await Participant.findOne({
    room: req.room.id,
    user: req.user.id,
  });

  if (existingParticipant && existingParticipant.excluded) {
    throw createHttpError(403, 'You were excluded from this room');
  }

  if (existingParticipant) {
    throw createHttpError(409, 'You are already in this room');
  }

  if (req.room.status !== 'waiting') {
    throw createHttpError(409, 'The game has already started');
  }

  const settings = await Settings.findOne({ room: req.room.id });
  const playersCount = await Participant.countDocuments({ room: req.room.id, excluded: false });

  if (playersCount >= settings.maxPlayers) {
    throw createHttpError(409, 'The room is full');
  }

  await leaveAllRooms(req.user.id);

  const participant = await Participant.create({
    room: req.room.id,
    user: req.user.id,
  });

  // Deux joueurs ont pu prendre la dernière place en même temps : le dernier arrivé repart
  const players = await findPlayersInOrder(req.room);
  let position = 0;
  for (let i = 0; i < players.length; i++) {
    if (players[i].id === participant.id) {
      position = i;
    }
  }

  if (position >= settings.maxPlayers) {
    await Participant.deleteOne({ _id: participant.id });
    throw createHttpError(409, 'The room is full');
  }

  // Les autres joueurs voient le nouveau joueur arriver
  broadcast(req.room.code, { type: 'room-updated' });

  res
    .status(201)
    .set('Location', `/rooms/${req.room.code}/participants/${participant.id}`)
    .send(formatParticipant(participant, req.user));
});

// Liste des joueurs de la room (sans les exclus), par ordre d'arrivée
router.get('/', authenticate, loadRoomFromParams, requireRoomPlayer, async (req, res) => {
  const participants = await findPlayersInOrder(req.room).populate('user');

  const response = [];
  for (const participant of participants) {
    response.push(formatParticipant(participant, participant.user));
  }

  res.send(response);
});

// Exclure un joueur (seulement l'hôte) : il ne pourra plus revenir dans la room
router.patch(
  '/:id',
  authenticate,
  loadRoomFromParams,
  requireRoomHost,
  loadParticipantFromParams,
  async (req, res) => {
    const body = req.body || {};

    if (body.excluded !== true) {
      throw createHttpError(400, 'The body must be { "excluded": true }');
    }

    if (req.participant.user.toString() === req.currentUserId) {
      throw createHttpError(403, 'The host cannot exclude themselves');
    }

    // Pendant la partie, on ne peut plus exclure (les tours sont déjà prévus)
    if (req.room.status !== 'waiting') {
      throw createHttpError(409, 'The game has already started');
    }

    req.participant.excluded = true;
    await req.participant.save();

    // Le joueur exclu quitte la salle d'attente, les autres le voient partir
    broadcast(req.room.code, { type: 'room-updated' });

    const user = await User.findById(req.participant.user);

    res.send(formatParticipant(req.participant, user));
  },
);

// Quitter la room (un joueur ne peut retirer que lui-même)
router.delete(
  '/:id',
  authenticate,
  loadRoomFromParams,
  loadParticipantFromParams,
  async (req, res) => {
    const leavingUserId = req.participant.user.toString();

    if (leavingUserId !== req.currentUserId) {
      throw createHttpError(403, 'You can only remove yourself from a room');
    }

    await removePlayer(req.room, req.participant);

    res.sendStatus(204);
  },
);

// Réponse JSON d'un participant, avec le nom de l'utilisateur
function formatParticipant(participant, user) {
  return {
    id: participant.id,
    userId: user.id,
    username: user.username,
    score: participant.score,
    excluded: participant.excluded,
    joinedAt: participant.joinedAt,
  };
}

export default router;
