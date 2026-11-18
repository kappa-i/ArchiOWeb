import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// Le résultat d'un joueur pour une partie terminée (gardé pour les statistiques du profil)
const resultSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Points obtenus dans la partie
    score: {
      type: Number,
      required: true,
      min: 0,
    },
    // Place à la fin de la partie (1 = victoire)
    rank: {
      type: Number,
      required: true,
      min: 1,
    },
    wordsFound: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Nombre de fois où le joueur a trouvé le mot en premier
    firstFinds: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Temps cumulé (en secondes) pour trouver ses mots
    totalFindTime: {
      type: Number,
      default: 0,
      min: 0,
    },
    drawingsMade: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Dessins trouvés par au moins un joueur
    successfulDrawings: {
      type: Number,
      default: 0,
      min: 0,
    },
    drawingPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Date de fin de la partie
    date: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model('Result', resultSchema);
