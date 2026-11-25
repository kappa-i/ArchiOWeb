// Profil de Devin'Art : les statistiques d'un joueur et, sur son propre profil, modifier ou supprimer son compte.
// profile.html → son propre profil (il faut être connecté) ; profile.html?id=… → le profil d'un autre joueur.

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

// Messages d'erreur de l'API, traduits pour les joueurs
const ERROR_MESSAGES = {
  'A resource with the same value already exists': 'Ce pseudo ou cet e-mail est déjà utilisé.',
  'Password must be a string of at least 8 characters':
    'Le mot de passe doit faire au moins 8 caractères.',
};

// ---------------------------------------------------------------------------
// Éléments de la page
// ---------------------------------------------------------------------------

const profileError = document.getElementById('profile-error');
const profile = document.getElementById('profile');
const profileAvatar = document.getElementById('profile-avatar');
const profileName = document.getElementById('profile-name');
const profileSubtitle = document.getElementById('profile-subtitle');
const playerStats = document.getElementById('player-stats');
const guesserStats = document.getElementById('guesser-stats');
const drawerStats = document.getElementById('drawer-stats');

const account = document.getElementById('account');
const accountForm = document.getElementById('account-form');
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const accountError = document.getElementById('account-error');
const saveButton = document.getElementById('save-account');
const deleteButton = document.getElementById('delete-account');
const toasts = document.getElementById('toasts');

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

// Même jeton que la salle d'attente : celui de l'onglet, sinon le dernier compte connecté
let token = sessionStorage.getItem('token');
if (!token) {
  token = localStorage.getItem('token');
}

let me = null; // l'utilisateur connecté (GET /users/me), ou null
let isDeleteArmed = false; // true après un premier clic sur « Supprimer mon compte »

// ---------------------------------------------------------------------------
// Appels à l'API
// ---------------------------------------------------------------------------

// Envoie une requête à l'API et renvoie sa réponse (lance une erreur si l'API répond une erreur)
async function callApi(method, path, body) {
  const options = { method: method, headers: {} };

  if (token) {
    options.headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(path, options);

  // 204 No Content : il n'y a pas de réponse à lire
  let data = null;
  if (response.status !== 204) {
    data = await response.json();
  }

  if (!response.ok) {
    const error = new Error(data.message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function translateError(error) {
  if (ERROR_MESSAGES[error.message]) {
    return ERROR_MESSAGES[error.message];
  }

  if (error.status === 422) {
    return 'Vérifie les champs : pseudo de 3 à 20 caractères et e-mail valide.';
  }

  return 'Oups, quelque chose a raté. Réessaie !';
}

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

async function start() {
  if (token) {
    try {
      me = await callApi('GET', '/users/me');
    } catch {
      me = null;
    }
  }

  // Pas d'id dans l'adresse : c'est son propre profil, il faut être connecté
  const params = new URLSearchParams(location.search);
  let userId = params.get('id');

  if (!userId) {
    if (me === null) {
      location.href = 'lobby.html';
      return;
    }
    userId = me.id;
  }

  let stats;
  try {
    stats = await callApi('GET', `/users/${encodeURIComponent(userId)}/stats`);
  } catch (error) {
    if (error.status !== 404) {
      profileError.textContent = 'Impossible de charger le profil. Réessaie !';
    }
    profileError.hidden = false;
    return;
  }

  const isMyProfile = me !== null && me.id === userId;

  renderHead(stats.username, stats.player.lastGame);
  renderStats(stats);

  if (isMyProfile) {
    fillAccountForm();
    account.hidden = false;
  }

  profile.hidden = false;
}

// ---------------------------------------------------------------------------
// En-tête et statistiques
// ---------------------------------------------------------------------------

function renderHead(username, lastGame) {
  document.title = `Devin'Art · ${username}`;

  profileAvatar.textContent = initials(username);
  profileAvatar.style.background = colorFromName(username);
  profileName.textContent = username;

  if (lastGame === null) {
    profileSubtitle.textContent = 'Pas encore de partie terminée.';
  } else {
    profileSubtitle.textContent = `Dernière partie le ${new Date(lastGame).toLocaleDateString('fr-CH')}`;
  }
}

function renderStats(stats) {
  const player = stats.player;
  addTile(playerStats, formatNumber(player.gamesPlayed), 'Parties jouées');
  addTile(playerStats, formatNumber(player.wins), 'Victoires');
  addTile(playerStats, `${player.winRate} %`, 'Taux de victoire');
  addTile(playerStats, formatNumber(player.totalPoints), 'Points au total');
  addTile(playerStats, formatNumber(player.bestScore), 'Meilleur score');
  addTile(playerStats, formatNumber(player.averageScore), 'Score moyen');

  // Pas de mot trouvé : pas de temps moyen
  const guesser = stats.guesser;
  let averageTime = '—';
  if (guesser.wordsFound > 0) {
    averageTime = `${guesser.averageFindTime} s`;
  }
  addTile(guesserStats, formatNumber(guesser.wordsFound), 'Mots trouvés');
  addTile(guesserStats, formatNumber(guesser.firstFinds), 'Trouvés en premier');
  addTile(guesserStats, averageTime, 'Temps moyen pour trouver');

  const drawer = stats.drawer;
  addTile(drawerStats, formatNumber(drawer.successfulDrawings), 'Dessins devinés');
  addTile(drawerStats, formatNumber(drawer.drawingPoints), 'Points en dessinant');
}

// Une case de statistique : la valeur en grand, le nom en petit
function addTile(list, value, label) {
  const tile = document.createElement('div');

  const name = document.createElement('dt');
  name.textContent = label;
  tile.append(name);

  const number = document.createElement('dd');
  number.textContent = value;
  tile.append(number);

  list.append(tile);
}

// ---------------------------------------------------------------------------
// Mon compte : modifier
// ---------------------------------------------------------------------------

function fillAccountForm() {
  usernameInput.value = me.username;
  emailInput.value = me.email;
  passwordInput.value = '';
}

accountForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  accountError.hidden = true;

  // On n'envoie que ce qui a changé (PATCH /users/me)
  const body = {};
  let hasChanges = false;

  if (usernameInput.value.trim() !== me.username) {
    body.username = usernameInput.value.trim();
    hasChanges = true;
  }

  if (emailInput.value.trim().toLowerCase() !== me.email) {
    body.email = emailInput.value.trim();
    hasChanges = true;
  }

  if (passwordInput.value !== '') {
    body.password = passwordInput.value;
    hasChanges = true;
  }

  if (!hasChanges) {
    toast('Rien à enregistrer.');
    return;
  }

  saveButton.disabled = true;

  try {
    me = await callApi('PATCH', '/users/me', body);
    fillAccountForm();
    profileName.textContent = me.username;
    profileAvatar.textContent = initials(me.username);
    profileAvatar.style.background = colorFromName(me.username);
    toast('Profil enregistré !');
  } catch (error) {
    accountError.textContent = translateError(error);
    accountError.hidden = false;
  }

  saveButton.disabled = false;
});

// ---------------------------------------------------------------------------
// Mon compte : supprimer (deux clics, comme « Exclure » dans la salle d'attente)
// ---------------------------------------------------------------------------

deleteButton.addEventListener('click', async () => {
  // Premier clic : le bouton demande une confirmation pendant 5 secondes
  if (!isDeleteArmed) {
    isDeleteArmed = true;
    deleteButton.textContent = 'Sûr ? Clique encore pour supprimer';
    deleteButton.classList.add('is-armed');
    setTimeout(disarmDelete, 5000);
    return;
  }

  deleteButton.disabled = true;

  try {
    await callApi('DELETE', '/users/me');
  } catch (error) {
    deleteButton.disabled = false;
    disarmDelete();
    toast(translateError(error));
    return;
  }

  // Compte supprimé : on oublie le jeton et on retourne au menu (écran de connexion)
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('roomCode');
  localStorage.removeItem('token');
  location.href = 'lobby.html';
});

function disarmDelete() {
  isDeleteArmed = false;
  deleteButton.textContent = 'Supprimer mon compte';
  deleteButton.classList.remove('is-armed');
}

// ---------------------------------------------------------------------------
// Petites fonctions utiles
// ---------------------------------------------------------------------------

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

function toast(text) {
  const element = document.createElement('div');
  element.className = 'toast';
  element.textContent = text;
  toasts.append(element);

  setTimeout(() => element.remove(), 3000);
}

start();
