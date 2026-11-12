import { createHttpError } from '../lib/errors.js';
import Host from '../models/host.js';
import Room from '../models/room.js';

// Charge la room du code dans l'URL dans req.room (404 si elle n'existe pas)
export async function loadRoomFromParams(req, res, next) {
  const code = req.params.code.toUpperCase();

  const room = await Room.findOne({ code: code });
  if (!room) {
    throw createHttpError(404, 'Room not found');
  }

  req.room = room;
  next();
}

// Refuse l'accès (403) si l'utilisateur connecté n'est pas l'hôte de la room
export async function requireRoomHost(req, res, next) {
  const host = await Host.findById(req.room.host);

  if (!host || host.user.toString() !== req.currentUserId) {
    throw createHttpError(403, 'Only the host of the room can do this');
  }

  next();
}
