import express from 'express';

import { createHttpError } from '../lib/errors.js';
import { authenticate, loadCurrentUser } from '../middleware/auth.js';
import {
  loadParticipantFromParams,
  loadRoomFromParams,
  requireRoomHost,
  requireRoomPlayer,
} from '../middleware/rooms.js';
import Host from '../models/host.js';
import Participant from '../models/participant.js';
import Room from '../models/room.js';
import Settings from '../models/settings.js';
import User from '../models/user.js';

// mergeParams : permet de lire le :code de la room, qui est dans l'URL définie dans app.js
const router = express.Router({ mergeParams: true });

// Rejoindre une room avec son code
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

  const participant = await Participant.create({
    room: req.room.id,
    user: req.user.id,
  });

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

    req.participant.excluded = true;
    await req.participant.save();

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
    const room = req.room;
    const leavingUserId = req.participant.user.toString();

    if (leavingUserId !== req.currentUserId) {
      throw createHttpError(403, 'You can only remove yourself from a room');
    }

    await Participant.deleteOne({ _id: req.participant.id });

    const remainingPlayers = await findPlayersInOrder(room);

    // Plus aucun joueur : la room est supprimée avec ses paramètres et ses participants
    if (remainingPlayers.length === 0) {
      await Participant.deleteMany({ room: room.id });
      await Settings.deleteOne({ room: room.id });
      await Room.deleteOne({ _id: room.id });

      return res.sendStatus(204);
    }

    // L'hôte est parti : le joueur arrivé le plus tôt devient le nouvel hôte
    const host = await Host.findById(room.host);

    if (host.user.toString() === leavingUserId) {
      const newHostUserId = remainingPlayers[0].user;

      let newHost = await Host.findOne({ user: newHostUserId });
      if (!newHost) {
        newHost = await Host.create({ user: newHostUserId });
      }

      room.host = newHost.id;
      await room.save();
    }

    res.sendStatus(204);
  },
);

// Joueurs de la room (sans les exclus), du premier arrivé au dernier
function findPlayersInOrder(room) {
  // _id en second : départage deux joueurs arrivés à la même milliseconde
  return Participant.find({ room: room.id, excluded: false }).sort({ joinedAt: 1, _id: 1 });
}

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
