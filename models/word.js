import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const wordSchema = new Schema(
  {
    label: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    difficulty: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Word', wordSchema);
