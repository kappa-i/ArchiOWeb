import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const drawingSchema = new Schema(
  {
    room: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    participant: {
      type: Schema.Types.ObjectId,
      ref: 'Participant',
      required: true,
    },
    word: {
      type: Schema.Types.ObjectId,
      ref: 'Word',
      required: true,
    },
    roundNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    data: {
      type: Schema.Types.Mixed,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Drawing', drawingSchema);
