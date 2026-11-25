import * as config from '../config.js';
import Drawing from '../models/drawing.js';
import Guess from '../models/guess.js';
import Participant from '../models/participant.js';
import Result from '../models/result.js';
import Room from '../models/room.js';
import Settings from '../models/settings.js';
import Word from '../models/word.js';
import { createHttpError } from './errors.js';
import { broadcast, getDrawing, resetDrawing, sendToUser, setCurrentRound } from './realtime.js';

// La partie se déroule sur le serveur, tour par tour :
// 1. un joueur dessine un mot tiré au hasard, les autres proposent des mots (POST .../guesses) ;
// 2. le tour finit quand le temps est écoulé ou que tout le monde a trouvé ;
// 3. une manche = chaque joueur dessine une fois ; après la dernière manche, on enregistre les résultats.

// Pauses en millisecondes (les tests les mettent à 0)
export const timings = {
  beforeFirstTurn: 5000, // le temps que tout le monde arrive sur l'écran de dessin
  betweenTurns: 4000, // le temps de voir le mot et les scores
};

// Points : celui qui trouve gagne entre 50 et 150 (plus il trouve tôt, plus il gagne),
// le dessinateur gagne 25 par joueur qui trouve
const GUESSER_MIN_POINTS = 50;
const GUESSER_BONUS_POINTS = 100;
const DRAWER_POINTS = 25;

// Parties en cours : code de la room → état de la partie
const games = new Map();

// ---------------------------------------------------------------------------
// Lancement et tours
// ---------------------------------------------------------------------------

// Lance la partie d'une room (appelé quand l'hôte lance la partie)
export async function startGame(room) {
  const settings = await Settings.findOne({ room: room.id });
  const players = await findPlayers(room.id);

  // L'ordre des dessinateurs : ordre d'arrivée dans la room
  const order = [];
  for (const player of players) {
    order.push(player.id);
  }

  const game = {
    roomId: room.id,
    code: room.code,
    order: order,
    rounds: settings.rounds,
    turnDuration: settings.turnDuration,
    difficulty: settings.difficulty,
    turnNumber: 0, // numéro du tour en cours (1, 2, 3…)
    totalTurns: settings.rounds * order.length,
    usedWordIds: [],
    drawing: null, // le dessin du tour en cours (null entre deux tours)
    word: null,
    drawerParticipantId: null,
    drawerUserId: null,
    foundBy: [], // ids des joueurs qui ont trouvé pendant ce tour
    endsAt: 0,
    timer: null,
  };

  stopGame(room.code);
  games.set(room.code, game);
  game.timer = setTimeout(() => runSafely(game, startNextTurn), timings.beforeFirstTurn);
}

// Passe au tour suivant (ou termine la partie)
async function startNextTurn(game) {
  // Tout le monde est parti : la room a été supprimée
  const room = await Room.findById(game.roomId);
  if (!room) {
    stopGame(game.code);
    return;
  }

  const players = await findPlayers(game.roomId);
  if (players.length < 2) {
    await endGame(game);
    return;
  }

  // Le prochain dessinateur encore dans la room (ceux qui sont partis sont sautés)
  let drawer = null;
  while (drawer === null && game.turnNumber < game.totalTurns) {
    game.turnNumber++;
    const participantId = game.order[(game.turnNumber - 1) % game.order.length];
    drawer = findById(players, participantId);
  }

  if (drawer === null) {
    await endGame(game);
    return;
  }

  const word = await pickWord(game);
  const roundNumber = Math.ceil(game.turnNumber / game.order.length);

  game.word = word;
  game.drawerParticipantId = drawer.id;
  game.drawerUserId = drawer.user.id;
  game.foundBy = [];
  game.endsAt = Date.now() + game.turnDuration * 1000;
  game.drawing = await Drawing.create({
    room: game.roomId,
    participant: drawer.id,
    word: word.id,
    roundNumber: roundNumber,
  });

  // Le message de début de tour, sans le mot (les autres voient seulement des cases vides)
  const message = {
    type: 'round-started',
    drawingId: game.drawing.id,
    drawer: drawer.user.username,
    round: roundNumber,
    totalRounds: game.rounds,
    duration: game.turnDuration,
    hint: hideLetters(word.label),
  };

  resetDrawing(game.code);
  setCurrentRound(game.code, {
    drawerId: game.drawerUserId,
    word: word.label,
    endsAt: game.endsAt,
    message: message,
  });
  broadcast(game.code, message);
  sendToUser(game.code, game.drawerUserId, { type: 'word-to-draw', word: word.label });

  game.timer = setTimeout(() => runSafely(game, endTurn), game.turnDuration * 1000);
}

// Fin du tour : on enregistre le dessin, on révèle le mot, puis tour suivant après une pause
async function endTurn(game) {
  // Déjà terminé (temps écoulé et tout le monde a trouvé en même temps)
  if (game.drawing === null) {
    return;
  }

  clearTimeout(game.timer);
  const drawing = game.drawing;
  game.drawing = null;

  drawing.endedAt = new Date();
  drawing.data = getDrawing(game.code);
  await drawing.save();

  setCurrentRound(game.code, { drawerId: null, word: null, endsAt: 0, message: null });

  const players = await findPlayers(game.roomId);
  broadcast(game.code, {
    type: 'round-ended',
    word: game.word.label,
    scores: formatScores(players),
  });

  game.timer = setTimeout(() => runSafely(game, startNextTurn), timings.betweenTurns);
}

// Termine tout de suite la partie d'une room (appelé quand il ne reste plus assez de joueurs)
export async function finishGame(room) {
  await endGame({ code: room.code, roomId: room.id });
}

// Fin de la partie : un résultat par joueur (pour ses statistiques), le classement, puis la room est supprimée
async function endGame(game) {
  stopGame(game.code);

  const room = await Room.findById(game.roomId);
  if (!room) {
    return;
  }

  const players = await findPlayers(room.id);
  players.sort((a, b) => b.score - a.score);

  const drawings = await Drawing.find({ room: room.id });
  const drawingIds = [];
  for (const drawing of drawings) {
    drawingIds.push(drawing.id);
  }

  const correctGuesses = await Guess.find({ drawing: { $in: drawingIds }, isCorrect: true }).sort({
    createdAt: 1,
  });

  const ranking = [];
  const date = new Date();

  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const stats = computeStats(player, drawings, correctGuesses);

    await Result.create({
      user: player.user.id,
      score: player.score,
      rank: i + 1,
      wordsFound: stats.wordsFound,
      firstFinds: stats.firstFinds,
      totalFindTime: stats.totalFindTime,
      drawingsMade: stats.drawingsMade,
      successfulDrawings: stats.successfulDrawings,
      drawingPoints: stats.drawingPoints,
      date: date,
    });

    ranking.push({ rank: i + 1, username: player.user.username, score: player.score });
  }

  setCurrentRound(game.code, null);
  broadcast(game.code, { type: 'game-ended', ranking: ranking });

  // La room et tout son contenu sont supprimés (voir « Cycle de vie d'une room » dans docs/INTENTION.md)
  await Guess.deleteMany({ drawing: { $in: drawingIds } });
  await Drawing.deleteMany({ room: room.id });
  await Participant.deleteMany({ room: room.id });
  await Settings.deleteOne({ room: room.id });
  await Room.deleteOne({ _id: room.id });
}

// ---------------------------------------------------------------------------
// Propositions
// ---------------------------------------------------------------------------

// Un joueur propose un mot pour le dessin en cours. Renvoie la proposition enregistrée.
export async function submitGuess(room, drawing, player, username, content) {
  const game = games.get(room.code);

  if (!game || game.drawing === null || game.drawing.id !== drawing.id) {
    throw createHttpError(409, 'This drawing is finished');
  }

  if (player.id === game.drawerParticipantId) {
    throw createHttpError(403, 'The drawer cannot guess');
  }

  if (game.foundBy.includes(player.id)) {
    throw createHttpError(409, 'You already found the word');
  }

  let isCorrect = false;
  if (typeof content === 'string') {
    isCorrect = simplify(content) === simplify(game.word.label);
  }

  // Plus il reste de temps, plus on gagne de points
  let points = 0;
  if (isCorrect) {
    game.foundBy.push(player.id);
    const remaining = Math.max(0, game.endsAt - Date.now());
    const totalTime = game.turnDuration * 1000;
    points = GUESSER_MIN_POINTS + Math.round((GUESSER_BONUS_POINTS * remaining) / totalTime);
  }

  const guess = await Guess.create({
    drawing: drawing.id,
    participant: player.id,
    content: content,
    isCorrect: isCorrect,
    points: points,
  });

  // Mauvaise réponse : elle s'affiche dans le chat de tout le monde
  if (!isCorrect) {
    broadcast(room.code, { type: 'guess', player: username, text: guess.content });
    return guess;
  }

  // Bonne réponse : points pour celui qui trouve et pour le dessinateur (sans révéler le mot aux autres)
  player.score = player.score + points;
  await player.save();
  await Participant.updateOne(
    { _id: game.drawerParticipantId },
    { $inc: { score: DRAWER_POINTS } },
  );
  broadcast(room.code, { type: 'word-found', player: username, points: points });

  // Tout le monde (sauf le dessinateur) a trouvé : le tour se termine tout de suite
  const players = await findPlayers(room.id);
  if (game.foundBy.length >= players.length - 1) {
    runSafely(game, endTurn);
  }

  return guess;
}

// ---------------------------------------------------------------------------
// Pour les tests et en cas d'erreur
// ---------------------------------------------------------------------------

export function stopGame(code) {
  const game = games.get(code);
  if (game) {
    clearTimeout(game.timer);
    games.delete(code);
  }
}

export function stopAllGames() {
  for (const code of games.keys()) {
    stopGame(code);
  }
}

// Lance une étape de la partie. En cas d'erreur, la partie s'arrête et les joueurs sont prévenus.
async function runSafely(game, step) {
  try {
    await step(game);
  } catch (error) {
    if (config.env !== 'test') {
      console.error(error);
    }
    stopGame(game.code);
    setCurrentRound(game.code, null);
    broadcast(game.code, { type: 'game-error' });
  }
}

// ---------------------------------------------------------------------------
// Petits outils
// ---------------------------------------------------------------------------

// Joueurs de la room (sans les exclus), par ordre d'arrivée, avec leur compte
async function findPlayers(roomId) {
  const players = await Participant.find({ room: roomId, excluded: false })
    .sort({ joinedAt: 1, _id: 1 })
    .populate('user');

  // Un joueur dont le compte a été supprimé ne compte plus
  const result = [];
  for (const player of players) {
    if (player.user) {
      result.push(player);
    }
  }
  return result;
}

function findById(players, id) {
  for (const player of players) {
    if (player.id === id) {
      return player;
    }
  }
  return null;
}

// Un mot au hasard de la difficulté choisie, jamais deux fois le même dans la partie
async function pickWord(game) {
  const filter = { _id: { $nin: game.usedWordIds } };

  // « mixed » : pas de filtre, tous les mots peuvent sortir
  if (game.difficulty !== 'mixed') {
    filter.difficulty = game.difficulty;
  }

  const words = await Word.find(filter);

  if (words.length === 0) {
    throw new Error('No words left for this difficulty: run npm run seed:words');
  }

  const word = words[Math.floor(Math.random() * words.length)];
  game.usedWordIds.push(word.id);
  return word;
}

// « arc-en-ciel » → « ___-__-____ » (les autres voient la longueur du mot, pas les lettres)
function hideLetters(label) {
  let hint = '';
  for (const character of label) {
    if (character === ' ' || character === '-') {
      hint = hint + character;
    } else {
      hint = hint + '_';
    }
  }
  return hint;
}

// « Éléphant  » → « elephant » : on compare sans majuscules, sans accents et sans espaces autour.
// « œ » s'écrit « oe » (« cœur » → « coeur ») : presque aucun clavier n'a la touche « œ ».
function simplify(text) {
  const lowerCase = text.trim().toLowerCase().replaceAll('œ', 'oe');

  // normalize('NFD') sépare chaque lettre de son accent ; les accents sont les caractères U+0300 à U+036F
  const decomposed = lowerCase.normalize('NFD');

  let result = '';
  for (const character of decomposed) {
    const code = character.charCodeAt(0);
    if (code < 0x300 || code > 0x36f) {
      result = result + character;
    }
  }
  return result;
}

// Scores des joueurs, du meilleur au moins bon
function formatScores(players) {
  const scores = [];
  for (const player of players) {
    scores.push({ username: player.user.username, score: player.score });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores;
}

// Statistiques d'un joueur pour la partie (enregistrées dans son résultat)
function computeStats(player, drawings, correctGuesses) {
  const stats = {
    wordsFound: 0,
    firstFinds: 0,
    totalFindTime: 0,
    drawingsMade: 0,
    successfulDrawings: 0,
    drawingPoints: 0,
  };

  // Comme devineur : mots trouvés, fois où il a trouvé en premier, temps pour trouver
  for (const guess of correctGuesses) {
    if (guess.participant.toString() !== player.id) {
      continue;
    }

    stats.wordsFound++;

    const drawing = findById(drawings, guess.drawing.toString());
    stats.totalFindTime += Math.round((guess.createdAt - drawing.startedAt) / 1000);

    // Les bonnes réponses sont triées par date : la première de ce dessin est celle du plus rapide
    const firstGuess = correctGuesses.find(
      (other) => other.drawing.toString() === guess.drawing.toString(),
    );
    if (firstGuess.id === guess.id) {
      stats.firstFinds++;
    }
  }

  // Comme dessinateur : dessins faits, dessins trouvés par au moins un joueur, points gagnés
  for (const drawing of drawings) {
    if (drawing.participant.toString() !== player.id) {
      continue;
    }

    stats.drawingsMade++;

    let foundCount = 0;
    for (const guess of correctGuesses) {
      if (guess.drawing.toString() === drawing.id) {
        foundCount++;
      }
    }

    if (foundCount > 0) {
      stats.successfulDrawings++;
    }
    stats.drawingPoints += foundCount * DRAWER_POINTS;
  }

  return stats;
}
