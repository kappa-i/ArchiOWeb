import mongoose from 'mongoose';

import * as config from '../config.js';
import { easyWords, mediumWords, hardWords } from '../data/words.js';
import Word from '../models/word.js';

// Enregistre un mot dans la base.
// S'il existe déjà, on met juste sa difficulté à jour (pas de doublon).
async function saveWord(label, difficulty) {
  await Word.updateOne(
    { label: label },
    { label: label, difficulty: difficulty },
    { upsert: true, runValidators: true },
  );
}

// Connexion à MongoDB
await mongoose.connect(config.databaseUrl);
console.log(`Connected to MongoDB at ${config.databaseUrl}`);

// Enregistrement des mots, liste par liste
for (const label of easyWords) {
  await saveWord(label, 'easy');
}

for (const label of mediumWords) {
  await saveWord(label, 'medium');
}

for (const label of hardWords) {
  await saveWord(label, 'hard');
}

const count = await Word.countDocuments();
console.log(`Done: ${count} words in the database`);

await mongoose.disconnect();
