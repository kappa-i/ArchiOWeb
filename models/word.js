import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// Un mot à dessiner (liste fixe chargée avec `npm run seed:words`)
const wordSchema = new Schema(
  {
    label: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Seulement ces trois niveaux sont acceptés
    difficulty: {
      type: String,
      required: true,
      enum: ['easy', 'medium', 'hard'],
    },
  },
  { timestamps: true },
);

export default mongoose.model('Word', wordSchema);
