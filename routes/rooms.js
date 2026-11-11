import express from 'express';

import { createHttpError } from '../lib/errors.js';
import { authenticate, loadCurrentUser } from '../middleware/auth.js';
import { loadRoomFromParams, requireRoomHost } from '../middleware/rooms.js';
import Host from '../models/host.js';
import Room from '../models/room.js';
import Settings from '../models/settings.js';

const router = express.Router();

// Créer une room : l'utilisateur connecté en devient l'hôte
router.post('/', authenticate, loadCurrentUser, async (req, res) => {
  let host = await Host.findOne({ user: req.user.id });
  if (!host) {
    host = await Host.create({ user: req.user.id });
  }

  host.roomsCreated = host.roomsCreated + 1;
  await host.save();

  const code = await generateUniqueCode();

  const room = await Room.create({
    code: code,
    host: host.id,
  });

  const settings = await Settings.create({ room: room.id });

  res
    .status(201)
    .set('Location', `/rooms/${room.code}`)
    .send(formatRoom(room, host, settings));
});

// Voir une room (statut et paramètres)
router.get('/:code', authenticate, loadRoomFromParams, async (req, res) => {
  const host = await Host.findById(req.room.host);
  const settings = await Settings.findOne({ room: req.room.id });

  res.send(formatRoom(req.room, host, settings));
});

// Modifier les paramètres (seulement l'hôte, et avant le début de la partie)
router.patch(
  '/:code/settings',
  authenticate,
  loadRoomFromParams,
  requireRoomHost,
  async (req, res) => {
    if (req.room.status !== 'waiting') {
      throw createHttpError(409, 'The game has already started');
    }

    const body = req.body || {};
    const settings = await Settings.findOne({ room: req.room.id });

    if (body.maxPlayers !== undefined) {
      settings.maxPlayers = body.maxPlayers;
    }

    if (body.rounds !== undefined) {
      settings.rounds = body.rounds;
    }

    if (body.turnDuration !== undefined) {
      settings.turnDuration = body.turnDuration;
    }

    await settings.save();

    const host = await Host.findById(req.room.host);

    res.send(formatRoom(req.room, host, settings));
  },
);

// Génère un code de 6 caractères qui n'est pas encore utilisé (ex. « K7PX2M »)
async function generateUniqueCode() {
  // Sans 0, O, 1 et I, pour éviter les confusions en lisant le code
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let code = '';
  let codeAlreadyUsed = true;

  while (codeAlreadyUsed) {
    code = '';
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      code = code + characters[randomIndex];
    }

    const existingRoom = await Room.findOne({ code: code });
    codeAlreadyUsed = existingRoom !== null;
  }

  return code;
}

// Réponse JSON d'une room, avec l'hôte et les paramètres
function formatRoom(room, host, settings) {
  return {
    id: room.id,
    code: room.code,
    status: room.status,
    hostUserId: host.user,
    settings: {
      maxPlayers: settings.maxPlayers,
      rounds: settings.rounds,
      turnDuration: settings.turnDuration,
    },
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

export default router;
