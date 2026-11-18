import mongoose from 'mongoose';

import { createHttpError } from '../lib/errors.js';
import Drawing from '../models/drawing.js';
import Host from '../models/host.js';
import Participant from '../models/participant.js';
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

// Refuse l'accès (403) si l'utilisateur connecté ne joue pas dans la room.
// Sinon, son joueur est gardé dans req.player.
export async function requireRoomPlayer(req, res, next) {
  const participant = await Participant.findOne({
    room: req.room.id,
    user: req.currentUserId,
    excluded: false,
  });

  if (!participant) {
    throw createHttpError(403, 'Only the players of the room can do this');
  }

  req.player = participant;
  next();
}

// Charge le joueur de l'URL (:id) dans req.participant (404 s'il n'est pas dans la room)
export async function loadParticipantFromParams(req, res, next) {
  const id = req.params.id;

  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError(404, 'Participant not found');
  }

  const participant = await Participant.findOne({
    _id: id,
    room: req.room.id,
    excluded: false,
  });

  if (!participant) {
    throw createHttpError(404, 'Participant not found');
  }

  req.participant = participant;
  next();
}

// Charge le dessin de l'URL (:id) dans req.drawing (404 s'il n'est pas dans la room)
export async function loadDrawingFromParams(req, res, next) {
  const id = req.params.id;

  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError(404, 'Drawing not found');
  }

  const drawing = await Drawing.findOne({ _id: id, room: req.room.id });

  if (!drawing) {
    throw createHttpError(404, 'Drawing not found');
  }

  req.drawing = drawing;
  next();
}
