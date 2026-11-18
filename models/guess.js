import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const guessSchema = new Schema(
  {
    drawing: {
      type: Schema.Types.ObjectId,
      ref: 'Drawing',
      required: true,
    },
    participant: {
      type: Schema.Types.ObjectId,
      ref: 'Participant',
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    points: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Guess', guessSchema);
