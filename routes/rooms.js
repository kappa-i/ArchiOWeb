import express from 'express';

import { createHttpError } from '../lib/errors.js';
import { startGame } from '../lib/game.js';
import { authenticate, loadCurrentUser } from '../middleware/auth.js';
import { loadRoomFromParams, requireRoomHost, requireRoomPlayer } from '../middleware/rooms.js';
import Host from '../models/host.js';
import Participant from '../models/participant.js';
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

  // L'hôte joue aussi : il devient le premier participant de sa room
  await Participant.create({ room: room.id, user: req.user.id });

  res
    .status(201)
    .set('Location', `/rooms/${room.code}`)
    .send(formatRoom(room, host, settings));
});

// Voir une room (statut et paramètres), seulement pour ses joueurs
router.get('/:code', authenticate, loadRoomFromParams, requireRoomPlayer, async (req, res) => {
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

    if (body.difficulty !== undefined) {
      settings.difficulty = body.difficulty;
    }

    // D'abord les valeurs elles-mêmes (422 si hors limites)
    await settings.validate();

    // Puis le nombre de places : il ne peut pas être plus petit que le nombre de joueurs déjà là
    const playersCount = await Participant.countDocuments({ room: req.room.id, excluded: false });
    if (settings.maxPlayers < playersCount) {
      throw createHttpError(409, `There are already ${playersCount} players in the room`);
    }

    await settings.save();

    const host = await Host.findById(req.room.host);

    res.send(formatRoom(req.room, host, settings));
  },
);

// Lancer la partie (seulement l'hôte) : le statut passe de « waiting » à « playing »,
// puis le serveur fait jouer les tours (lib/game.js)
router.patch('/:code', authenticate, loadRoomFromParams, requireRoomHost, async (req, res) => {
  const body = req.body || {};

  if (body.status !== 'playing') {
    throw createHttpError(400, 'The body must be { "status": "playing" }');
  }

  if (req.room.status !== 'waiting') {
    throw createHttpError(409, 'The game has already started');
  }

  const playersCount = await Participant.countDocuments({ room: req.room.id, excluded: false });

  if (playersCount < 2) {
    throw createHttpError(409, 'At least 2 players are needed to start the game');
  }

  req.room.status = 'playing';
  await req.room.save();
  await startGame(req.room);

  const host = await Host.findById(req.room.host);
  const settings = await Settings.findOne({ room: req.room.id });

  res.send(formatRoom(req.room, host, settings));
});

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
      difficulty: settings.difficulty,
    },
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

export default router;
