import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// Un participant = un utilisateur qui joue dans une room
const participantSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    room: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    score: {
      type: Number,
      default: 0,
    },
    // true si l'hôte l'a exclu : il ne peut plus revenir dans la room
    excluded: {
      type: Boolean,
      default: false,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Un utilisateur ne peut être qu'une seule fois dans la même room
participantSchema.index({ user: 1, room: 1 }, { unique: true });

export default mongoose.model('Participant', participantSchema);
