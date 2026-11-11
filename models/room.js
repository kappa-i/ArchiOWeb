import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// Une room = une partie, rejointe avec son code
const roomSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['waiting', 'playing', 'finished'],
      default: 'waiting',
    },
    host: {
      type: Schema.Types.ObjectId,
      ref: 'Host',
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Room', roomSchema);
