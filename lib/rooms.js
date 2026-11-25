import { finishGame, handlePlayerLeft } from './game.js';
import { broadcast, planRemoval } from './realtime.js';
import Host from '../models/host.js';
import Participant from '../models/participant.js';
import Room from '../models/room.js';
import Settings from '../models/settings.js';

// Joueurs de la room (sans les exclus), du premier arrivé au dernier
export function findPlayersInOrder(room) {
  // _id en second : départage deux joueurs arrivés à la même milliseconde
  return Participant.find({ room: room.id, excluded: false }).sort({ joinedAt: 1, _id: 1 });
}

// Retire un joueur de sa room (il quitte la room, il supprime son compte, ou il est parti sans revenir) :
// - partie en cours et moins de 2 joueurs restants : la partie se termine (résultats, puis room supprimée) ;
// - s'il ne reste personne, la room est supprimée avec ses paramètres et ses participants ;
// - si c'était l'hôte, le joueur arrivé le plus tôt devient le nouvel hôte ;
// - partie en cours : si c'était le dessinateur, le tour se termine tout de suite.
export async function removePlayer(room, participant) {
  const leavingUserId = participant.user.toString();

  await Participant.deleteOne({ _id: participant.id });

  const remainingPlayers = await findPlayersInOrder(room);

  if (room.status === 'playing' && remainingPlayers.length < 2) {
    await finishGame(room);
    return;
  }

  if (remainingPlayers.length === 0) {
    await Participant.deleteMany({ room: room.id });
    await Settings.deleteOne({ room: room.id });
    await Room.deleteOne({ _id: room.id });
    return;
  }

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

  if (room.status === 'playing') {
    await handlePlayerLeft(room, participant.id);
  }

  // Les joueurs encore dans la salle d'attente mettent leur page à jour
  broadcast(room.code, { type: 'room-updated' });
}

// Un joueur ne peut être que dans une room à la fois : il quitte toutes celles où il joue
// (avant de créer ou de rejoindre une room, ou de supprimer son compte)
export async function leaveAllRooms(userId) {
  const participants = await Participant.find({ user: userId, excluded: false });

  for (const participant of participants) {
    const room = await Room.findById(participant.room);

    if (room) {
      await removePlayer(room, participant);
    }
  }
}

// Un joueur a fermé sa page et n'est pas revenu à temps (voir lib/realtime.js) : il est retiré de la room
export async function removeAbsentPlayer(roomCode, userId) {
  const room = await Room.findOne({ code: roomCode });
  if (!room) {
    return;
  }

  const participant = await Participant.findOne({ room: room.id, user: userId, excluded: false });
  if (!participant) {
    return;
  }

  await removePlayer(room, participant);
}

// Au démarrage du serveur (ex. après une mise en veille sur Render), personne n'est encore connecté :
// - les parties en cours se sont arrêtées avec le serveur : on les termine (résultats, puis room supprimée) ;
// - les joueurs des salles d'attente qui ne reviennent pas à temps seront retirés.
export async function cleanUpRoomsAtStartup() {
  const rooms = await Room.find();

  for (const room of rooms) {
    if (room.status === 'playing') {
      await finishGame(room);
    }

    if (room.status === 'waiting') {
      const players = await findPlayersInOrder(room);

      for (const player of players) {
        planRemoval(room.code, player.user.toString());
      }
    }
  }
}
