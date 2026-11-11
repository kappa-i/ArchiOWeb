import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// Les paramètres d'une room (une seule fiche par room)
const settingsSchema = new Schema(
  {
    room: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      unique: true,
    },
    maxPlayers: {
      type: Number,
      default: 8,
      min: 2,
      max: 8,
    },
    rounds: {
      type: Number,
      default: 3,
      min: 1,
      max: 10,
    },
    turnDuration: {
      type: Number,
      default: 80,
      min: 30,
      max: 180,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Settings', settingsSchema);
