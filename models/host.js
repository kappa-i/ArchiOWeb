import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// Un hôte = un utilisateur qui a déjà créé au moins une room
const hostSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    roomsCreated: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Host', hostSchema);
