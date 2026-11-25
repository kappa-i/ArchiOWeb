import Result from '../models/result.js';

const oneDay = 24 * 60 * 60 * 1000;

// Durée des périodes du filtre ?period=, en jours (« all » : depuis toujours, pas de limite)
const periodDays = {
  day: 1,
  week: 7,
  month: 30,
};

// Le classement complet d'une période, du meilleur au moins bon. Pour chaque joueur :
// - ses statistiques sur la période (points, parties, victoires…) ;
// - movement : les places gagnées (+) ou perdues (-) en 24 h, null s'il n'était pas classé il y a 24 h ;
// - winStreak : ses victoires d'affilée sur ses dernières parties de la période.
// Renvoie aussi leaderSince : depuis quand le premier est en tête (null s'il n'y a personne).
export async function computeLeaderboard(period) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - oneDay);

  const ranking = await computeRanking(periodFilter(period, now));
  const rankingYesterday = await computeRanking(periodFilter(period, yesterday));
  const replay = await replayGames(periodFilter(period, now));

  // Le rang de chaque joueur il y a 24 h
  const ranksYesterday = {};
  for (const player of rankingYesterday) {
    ranksYesterday[player.userId] = player.rank;
  }

  for (const player of ranking) {
    player.movement = null;
    if (ranksYesterday[player.userId] !== undefined) {
      player.movement = ranksYesterday[player.userId] - player.rank;
    }

    player.winStreak = 0;
    if (replay.winStreaks[player.userId] !== undefined) {
      player.winStreak = replay.winStreaks[player.userId];
    }
  }

  // À égalité de points en tête, le « premier » du replay peut être un autre joueur : on ne dit rien
  let leaderSince = null;
  if (ranking.length > 0 && replay.leaderId === ranking[0].userId) {
    leaderSince = replay.leaderSince;
  }

  return { players: ranking, leaderSince: leaderSince };
}

// Grosse percée : le joueur qui a gagné le plus de places en 24 h (null si personne n'a progressé)
export function findBiggestClimber(players) {
  let climber = null;

  for (const player of players) {
    if (player.movement !== null && player.movement > 0) {
      if (climber === null || player.movement > climber.places) {
        climber = { userId: player.userId, username: player.username, places: player.movement };
      }
    }
  }

  return climber;
}

// En feu : la plus longue série de victoires en cours, à partir de 2 victoires d'affilée
export function findLongestWinStreak(players) {
  let best = null;

  for (const player of players) {
    if (player.winStreak >= 2) {
      if (best === null || player.winStreak > best.wins) {
        best = { userId: player.userId, username: player.username, wins: player.winStreak };
      }
    }
  }

  return best;
}

// Filtre MongoDB sur la date des parties : celles de la période qui se termine à la date « end ».
// Ex. « week » avec end = maintenant : les parties des 7 derniers jours.
function periodFilter(period, end) {
  const filter = { date: { $lte: end } };

  if (period !== 'all') {
    filter.date.$gt = new Date(end.getTime() - periodDays[period] * oneDay);
  }

  return filter;
}

// Totaux de chaque joueur (agrégation MongoDB), triés du meilleur au moins bon, avec leur rang
async function computeRanking(filter) {
  const totals = await Result.aggregate([
    {
      $match: filter,
    },
    {
      $group: {
        _id: '$user',
        totalPoints: { $sum: '$score' },
        gamesPlayed: { $sum: 1 },
        wins: { $sum: { $cond: [{ $eq: ['$rank', 1] }, 1, 0] } },
        bestScore: { $max: '$score' },
        wordsFound: { $sum: '$wordsFound' },
        firstFinds: { $sum: '$firstFinds' },
        successfulDrawings: { $sum: '$successfulDrawings' },
      },
    },
    {
      // À égalité de points, on trie par id pour que l'ordre ne change pas d'une page à l'autre
      $sort: { totalPoints: -1, _id: 1 },
    },
    {
      // Ajoute le compte du joueur (pour son pseudo)
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $unwind: '$user',
    },
  ]);

  const ranking = [];
  for (let i = 0; i < totals.length; i++) {
    const total = totals[i];

    ranking.push({
      rank: i + 1,
      userId: total._id.toString(),
      username: total.user.username,
      totalPoints: total.totalPoints,
      gamesPlayed: total.gamesPlayed,
      wins: total.wins,
      winRate: Math.round((total.wins / total.gamesPlayed) * 100),
      bestScore: total.bestScore,
      wordsFound: total.wordsFound,
      firstFinds: total.firstFinds,
      successfulDrawings: total.successfulDrawings,
    });
  }

  return ranking;
}

// Rejoue les parties de la période dans l'ordre, pour savoir :
// - les victoires d'affilée de chaque joueur (remises à 0 dès qu'il ne gagne pas) ;
// - depuis quand le premier est en tête (le moment où il est passé devant tout le monde).
async function replayGames(filter) {
  const results = await Result.find(filter).sort({ date: 1 });

  const totals = {};
  const winStreaks = {};
  let leaderId = null;
  let leaderSince = null;

  for (const result of results) {
    const userId = result.user.toString();

    if (totals[userId] === undefined) {
      totals[userId] = 0;
      winStreaks[userId] = 0;
    }

    totals[userId] = totals[userId] + result.score;

    if (result.rank === 1) {
      winStreaks[userId] = winStreaks[userId] + 1;
    } else {
      winStreaks[userId] = 0;
    }

    // Les points ne font qu'augmenter : seul le joueur qui vient de jouer peut passer en tête
    if (leaderId === null || totals[userId] > totals[leaderId]) {
      leaderId = userId;
      leaderSince = result.date;
    }
  }

  return { winStreaks: winStreaks, leaderId: leaderId, leaderSince: leaderSince };
}
