import Host from '../models/host.js';
import Participant from '../models/participant.js';
import Room from '../models/room.js';
import Settings from '../models/settings.js';

// Joueurs de la room (sans les exclus), du premier arrivé au dernier
export function findPlayersInOrder(room) {
  // _id en second : départage deux joueurs arrivés à la même milliseconde
  return Participant.find({ room: room.id, excluded: false }).sort({ joinedAt: 1, _id: 1 });
}

// Retire un joueur de sa room (il quitte la room, ou il supprime son compte) :
// - s'il ne reste personne, la room est supprimée avec ses paramètres et ses participants ;
// - si c'était l'hôte, le joueur arrivé le plus tôt devient le nouvel hôte.
export async function removePlayer(room, participant) {
  const leavingUserId = participant.user.toString();

  await Participant.deleteOne({ _id: participant.id });

  const remainingPlayers = await findPlayersInOrder(room);

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
}
