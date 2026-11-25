// Classement de Devin'Art : podium, tendances et liste paginée des joueurs,
// avec un filtre par période et une recherche par pseudo.
// Les données viennent de l'API : GET /users/leaderboard et GET /users/leaderboard/highlights.

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

// On attend que le joueur ait fini de taper avant de chercher (en millisecondes)
const SEARCH_DELAY = 300;

// Texte affiché pour chaque période (« 3 victoires d'affilée sur 7 jours »…)
const PERIOD_TEXTS = {
  all: 'depuis toujours',
  month: 'sur 30 jours',
  week: 'sur 7 jours',
  day: 'sur 24 h',
};

const CROWN_ICON =
  '<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="#ffd23f" stroke="#e0a800" stroke-width="1.5" stroke-linejoin="round"/></svg>';

// ---------------------------------------------------------------------------
// Éléments de la page
// ---------------------------------------------------------------------------

const periodButtons = document.querySelectorAll('[data-period]');
const podiumList = document.getElementById('podium');
const podiumEmpty = document.getElementById('podium-empty');
const trends = document.getElementById('trends');
const searchInput = document.getElementById('search');
const findMeButton = document.getElementById('find-me');
const rankingList = document.getElementById('ranking');
const rankingEmpty = document.getElementById('ranking-empty');
const pager = document.getElementById('pager');
const toasts = document.getElementById('toasts');

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

// Même jeton que la salle d'attente (l'onglet, sinon le dernier compte connecté) : sert juste à trouver « Toi »
let token = sessionStorage.getItem('token');
if (!token) {
  token = localStorage.getItem('token');
}

let me = null; // l'utilisateur connecté, ou null
let period = 'all';
let page = 1;
let search = '';
let searchTimer = null;

// ---------------------------------------------------------------------------
// Appels à l'API
// ---------------------------------------------------------------------------

// Demande des données à l'API (GET) et renvoie sa réponse (lance une erreur si l'API répond une erreur)
async function getFromApi(path) {
  const options = { headers: {} };

  if (token) {
    options.headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message);
  }

  return data;
}

// Adresse de la page du classement à afficher, selon la période, la page et la recherche
function rankingUrl() {
  let url = `/users/leaderboard?period=${period}&page=${page}&pageSize=${PAGE_SIZE}`;

  if (search !== '') {
    url = url + `&search=${encodeURIComponent(search)}`;
  }

  return url;
}

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

async function start() {
  // Connecté : on retrouve son compte pour le mettre en avant (sinon la page marche quand même)
  if (token) {
    try {
      me = await getFromApi('/users/me');
      findMeButton.hidden = false;
    } catch {
      me = null;
    }
  }

  await loadHighlights();
  await loadRanking();
}

// Podium et tendances de la période
async function loadHighlights() {
  const requestedPeriod = period;
  let highlights;

  try {
    highlights = await getFromApi(`/users/leaderboard/highlights?period=${period}`);
  } catch {
    toast('Impossible de charger le podium. Réessaie !');
    return;
  }

  // La période a changé pendant la requête : une réponse plus récente va arriver
  if (requestedPeriod !== period) {
    return;
  }

  renderPodium(highlights.podium);
  renderTrends(highlights);
}

// La page demandée de la liste
async function loadRanking() {
  const url = rankingUrl();
  let ranking;

  try {
    ranking = await getFromApi(url);
  } catch {
    rankingList.innerHTML = '';
    pager.innerHTML = '';
    rankingEmpty.textContent = 'Impossible de charger le classement. Réessaie !';
    rankingEmpty.hidden = false;
    return;
  }

  // Le filtre ou la page a changé pendant la requête : une réponse plus récente va arriver
  if (url !== rankingUrl()) {
    return;
  }

  renderRanking(ranking.items);
  renderPager(ranking.pagination);
}

// ---------------------------------------------------------------------------
// Filtres : période, recherche, « Me trouver »
// ---------------------------------------------------------------------------

for (const button of periodButtons) {
  button.addEventListener('click', () => {
    if (button.dataset.period === period) {
      return;
    }

    period = button.dataset.period;
    page = 1;

    for (const otherButton of periodButtons) {
      otherButton.setAttribute('aria-pressed', String(otherButton === button));
    }
    pop(button, 1.2);

    loadHighlights();
    loadRanking();
  });
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);

  searchTimer = setTimeout(() => {
    search = searchInput.value.trim();
    page = 1;
    loadRanking();
  }, SEARCH_DELAY);
});

findMeButton.addEventListener('click', () => {
  searchInput.value = me.username;
  search = me.username;
  page = 1;
  loadRanking();
});

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

function renderPodium(players) {
  podiumList.innerHTML = '';
  podiumEmpty.hidden = players.length > 0;

  // Dans l'ordre 1er, 2e, 3e : c'est le CSS qui place le 2e à gauche et le 3e à droite
  for (const player of players) {
    podiumList.append(createPodiumStep(player));
  }

  popIn(podiumList.querySelectorAll('.podium-player'));
  rise(podiumList.querySelectorAll('.podium-block'));
}

function createPodiumStep(player) {
  const step = createElement('li', `podium-step is-rank-${player.rank}`);

  const card = createElement('div', 'podium-player');

  if (player.rank === 1) {
    card.innerHTML = CROWN_ICON;
  }

  card.append(createAvatar(player.username, 'podium-avatar'));

  const name = createProfileLink(player, 'podium-name');
  card.append(name);

  if (isMe(player)) {
    card.append(createElement('span', 'player-tag', 'Toi'));
  }

  card.append(createElement('span', 'podium-points', `${formatNumber(player.totalPoints)} pts`));
  card.append(createBadges(player));

  // Quelques stats de la période
  const stats = createElement('ul', 'podium-stats');
  stats.append(createStat(player.wins, 'victoires'));
  stats.append(createStat(player.gamesPlayed, 'parties'));
  stats.append(createStat(player.bestScore, 'meilleur score'));
  stats.append(createStat(player.wordsFound, 'mots trouvés'));
  card.append(stats);

  step.append(card);

  const block = createElement('div', 'podium-block');
  block.append(createElement('span', 'podium-rank', String(player.rank)));
  step.append(block);

  return step;
}

function createStat(value, label) {
  const item = createElement('li');
  item.append(createElement('strong', '', formatNumber(value)));
  item.append(createElement('span', '', label));
  return item;
}

// ---------------------------------------------------------------------------
// Tendances : en tête depuis…, grosse percée, en feu
// ---------------------------------------------------------------------------

function renderTrends(highlights) {
  trends.innerHTML = '';

  if (highlights.leader !== null) {
    let text = 'À égalité en tête';
    if (highlights.leader.since !== null) {
      text = `En tête ${timeSince(highlights.leader.since)}`;
    }
    trends.append(createTrend('👑', highlights.leader.username, text));
  }

  if (highlights.biggestClimber !== null) {
    const places = highlights.biggestClimber.places;
    let text = `+${places} place en 24 h`;
    if (places > 1) {
      text = `+${places} places en 24 h`;
    }
    trends.append(createTrend('🚀', highlights.biggestClimber.username, text));
  }

  if (highlights.longestWinStreak !== null) {
    const text = `${highlights.longestWinStreak.wins} victoires d'affilée`;
    trends.append(createTrend('🔥', highlights.longestWinStreak.username, text));
  }

  trends.hidden = trends.children.length === 0;
  popIn(trends.children);
}

function createTrend(emoji, username, text) {
  const card = createElement('article', 'card glass trend');
  card.append(createElement('span', 'trend-emoji', emoji));

  const content = createElement('div');
  content.append(createElement('strong', 'trend-name', username));
  content.append(createElement('span', 'trend-text', text));
  card.append(content);

  return card;
}

// « depuis 3 jours », « depuis 5 h », « depuis 12 min », « à l'instant »
function timeSince(date) {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 2) {
    return `depuis ${days} jours`;
  }
  if (days === 1) {
    return 'depuis 1 jour';
  }
  if (hours >= 1) {
    return `depuis ${hours} h`;
  }
  if (minutes >= 1) {
    return `depuis ${minutes} min`;
  }
  return "à l'instant";
}

// ---------------------------------------------------------------------------
// Liste et pagination
// ---------------------------------------------------------------------------

function renderRanking(players) {
  rankingList.innerHTML = '';

  if (players.length === 0) {
    if (search !== '') {
      rankingEmpty.textContent = `Aucun joueur classé ${PERIOD_TEXTS[period]} n'a « ${search} » dans son pseudo.`;
    } else {
      rankingEmpty.textContent = "Personne n'a encore joué sur cette période.";
    }
    rankingEmpty.hidden = false;
    return;
  }

  rankingEmpty.hidden = true;

  for (const player of players) {
    rankingList.append(createRow(player));
  }

  popIn(rankingList.children);
}

function createRow(player) {
  const row = createElement('li', 'board-row');
  if (player.rank <= 3) {
    row.classList.add(`is-rank-${player.rank}`);
  }
  if (isMe(player)) {
    row.classList.add('is-me');
  }

  row.append(createElement('span', 'row-rank', String(player.rank)));

  const who = createElement('div', 'row-player');
  who.append(createAvatar(player.username, ''));

  const name = createProfileLink(player, 'row-name');
  who.append(name);
  if (isMe(player)) {
    who.append(createElement('span', 'player-tag', 'Toi'));
  }
  who.append(createBadges(player));
  row.append(who);

  row.append(createElement('span', 'column-stat', formatNumber(player.gamesPlayed)));
  row.append(createElement('span', 'column-stat', formatNumber(player.wins)));
  row.append(createElement('strong', 'column-points', formatNumber(player.totalPoints)));

  return row;
}

// Petits badges : évolution en 24 h (▲ ▼ ou « Nouveau ») et série de victoires (🔥)
function createBadges(player) {
  const badges = createElement('span', 'badges');

  if (player.movement === null) {
    badges.append(createElement('span', 'badge is-new', 'Nouveau'));
  } else if (player.movement > 0) {
    badges.append(createElement('span', 'badge is-up', `▲ ${player.movement}`));
  } else if (player.movement < 0) {
    badges.append(createElement('span', 'badge is-down', `▼ ${-player.movement}`));
  }

  if (player.winStreak >= 2) {
    badges.append(createElement('span', 'badge is-streak', `🔥 ${player.winStreak}`));
  }

  return badges;
}

// Boutons « précédent / suivant » et les numéros des pages autour de la page actuelle
function renderPager(pagination) {
  pager.innerHTML = '';

  if (pagination.totalPages <= 1) {
    return;
  }

  pager.append(createPageButton('‹', pagination.page - 1, pagination, 'Page précédente'));

  const first = Math.max(1, pagination.page - 2);
  const last = Math.min(pagination.totalPages, pagination.page + 2);

  for (let number = first; number <= last; number++) {
    pager.append(createPageButton(String(number), number, pagination, `Page ${number}`));
  }

  pager.append(createPageButton('›', pagination.page + 1, pagination, 'Page suivante'));
}

function createPageButton(text, number, pagination, label) {
  const button = createElement('button', 'page-button', text);
  button.setAttribute('aria-label', label);

  if (number === pagination.page) {
    button.classList.add('is-current');
    button.setAttribute('aria-current', 'page');
  }

  // Pas de page 0, ni de page après la dernière
  button.disabled = number < 1 || number > pagination.totalPages;

  button.addEventListener('click', () => {
    page = number;
    loadRanking();
  });

  return button;
}

// ---------------------------------------------------------------------------
// Petites fonctions utiles
// ---------------------------------------------------------------------------

// Crée un élément HTML avec sa classe et son texte (le texte n'est jamais lu comme du HTML)
function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

// Le pseudo du joueur, en lien vers son profil
function createProfileLink(player, className) {
  const link = createElement('a', className, player.username);
  link.href = `profile.html?id=${player.userId}`;
  return link;
}

function createAvatar(username, className) {
  const avatar = createElement('span', `avatar ${className}`, initials(username));
  avatar.style.background = colorFromName(username);
  return avatar;
}

function isMe(player) {
  return me !== null && player.userId === me.id;
}

// 1500 → « 1 500 »
function formatNumber(value) {
  return value.toLocaleString('fr-CH');
}

// Initiales et couleur d'un pseudo : même calcul que dans lobby.js
function initials(name) {
  let result = '';

  for (const part of name.split(' ')) {
    if (part.length > 0 && result.length < 2) {
      result = result + part[0].toUpperCase();
    }
  }

  return result;
}

function colorFromName(name) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  const hue = (hash * 137) % 360;
  return `hsl(${hue} 70% 62%)`;
}

// ---------------------------------------------------------------------------
// Animations (GSAP) et messages
// ---------------------------------------------------------------------------

const canAnimate =
  typeof window.gsap !== 'undefined' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function pop(element, fromScale) {
  if (!canAnimate) {
    return;
  }

  gsap.fromTo(
    element,
    { scale: fromScale },
    { scale: 1, duration: 0.7, ease: 'elastic.out(1.1, 0.4)', overwrite: 'auto' },
  );
}

function popIn(elements) {
  if (!canAnimate || elements.length === 0) {
    return;
  }

  gsap.fromTo(
    elements,
    { y: 24, scale: 0.92, opacity: 0 },
    {
      y: 0,
      scale: 1,
      opacity: 1,
      duration: 0.8,
      stagger: 0.06,
      ease: 'elastic.out(1, 0.65)',
      clearProps: 'y,scale,opacity',
    },
  );
}

// Les marches du podium montent depuis le bas
function rise(elements) {
  if (!canAnimate || elements.length === 0) {
    return;
  }

  gsap.fromTo(
    elements,
    { scaleY: 0, transformOrigin: 'bottom' },
    {
      scaleY: 1,
      duration: 0.9,
      stagger: 0.1,
      ease: 'elastic.out(1, 0.7)',
      clearProps: 'scale,transform',
    },
  );
}

function toast(text) {
  const element = createElement('div', 'toast', text);
  toasts.append(element);

  setTimeout(() => element.remove(), 3000);
}

start();
