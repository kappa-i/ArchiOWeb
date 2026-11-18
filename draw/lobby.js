// Salle d'attente de Devin'Art : se connecter, créer ou rejoindre une room, attendre les joueurs, lancer la partie.
// Toutes les données viennent de l'API : la page est servie par l'API elle-même (/play/lobby.html).

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

// Écran de dessin, servi par l'API comme cette page
const DRAW_URL = '/play/';

// Le serveur n'envoie pas encore d'événements en temps réel : on redemande la room toutes les 2 secondes
const REFRESH_DELAY = 2000;

// Limites des réglages, les mêmes que dans models/settings.js
const SETTINGS_LIMITS = {
  maxPlayers: { min: 2, max: 8, step: 1, unit: '' },
  rounds: { min: 1, max: 10, step: 1, unit: '' },
  turnDuration: { min: 30, max: 180, step: 10, unit: ' s' },
};

// Messages d'erreur de l'API, traduits pour les joueurs
const ERROR_MESSAGES = {
  'Invalid email or password': 'E-mail ou mot de passe incorrect.',
  'A resource with the same value already exists': 'Ce pseudo ou cet e-mail est déjà utilisé.',
  'Password must be a string of at least 8 characters':
    'Le mot de passe doit faire au moins 8 caractères.',
  'Room not found': "Aucune room n'a ce code.",
  'You were excluded from this room': 'Tu as été exclu de cette room.',
  'The game has already started': 'La partie a déjà commencé.',
  'The room is full': 'La room est pleine.',
  'Only the host of the room can do this': "Seul l'hôte peut faire ça.",
  'Only the players of the room can do this': 'Tu ne fais plus partie de cette room.',
  'At least 2 players are needed to start the game':
    'Il faut au moins 2 joueurs pour lancer la partie.',
};

const CROWN_ICON =
  '<svg class="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="#ffd23f" stroke="#e0a800" stroke-width="1.5" stroke-linejoin="round"/></svg>';

// ---------------------------------------------------------------------------
// Éléments de la page
// ---------------------------------------------------------------------------

const authScreen = document.getElementById('auth-screen');
const homeScreen = document.getElementById('home-screen');
const roomScreen = document.getElementById('room-screen');

const meBox = document.getElementById('me');
const meAvatar = document.getElementById('me-avatar');
const meName = document.getElementById('me-name');
const logoutButton = document.getElementById('logout');

const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const authForm = document.getElementById('auth-form');
const usernameField = document.getElementById('username-field');
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authError = document.getElementById('auth-error');
const authSubmit = document.getElementById('auth-submit');

const homeName = document.getElementById('home-name');
const createButton = document.getElementById('create-room');
const joinForm = document.getElementById('join-form');
const joinCodeInput = document.getElementById('join-code');
const joinError = document.getElementById('join-error');

const roomCodeText = document.getElementById('room-code');
const copyLinkButton = document.getElementById('copy-link');
const playersCount = document.getElementById('players-count');
const playerList = document.getElementById('player-list');
const settingsCard = document.getElementById('settings-card');
const settingsNote = document.getElementById('settings-note');
const settingElements = document.querySelectorAll('.setting');
const leaveButton = document.getElementById('leave-room');
const waitingText = document.getElementById('waiting-text');
const startButton = document.getElementById('start-game');

const countdown = document.getElementById('countdown');
const countdownValue = document.getElementById('countdown-value');
const toasts = document.getElementById('toasts');

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

// Le jeton est gardé par onglet : deux onglets peuvent être deux joueurs différents
let token = sessionStorage.getItem('token');
let me = null; // l'utilisateur connecté (GET /users/me)
let room = null; // la room affichée (GET /rooms/:code)
let players = []; // ses joueurs (GET /rooms/:code/participants)
let refreshTimer = null;
let isSignup = false;
let isSavingSettings = false;
let isStarting = false;
let playerToKick = null; // id du joueur à exclure, après un premier clic sur la croix
let lastResponse = ''; // dernière réponse de l'API, pour ne redessiner que si quelque chose a changé

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

  let response;
  try {
    response = await fetch(path, options);
  } catch {
    const error = new Error('Network error');
    error.status = 0;
    throw error;
  }

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

  if (error.status === 0) {
    return "Impossible de joindre le serveur. Est-ce que l'API tourne (npm run dev) ?";
  }

  if (error.status === 422) {
    return 'Vérifie les champs : pseudo de 3 à 20 caractères et e-mail valide.';
  }

  return 'Oups, quelque chose a raté. Réessaie !';
}

function showError(element, error) {
  element.textContent = translateError(error);
  element.hidden = false;
  shake(element);
}

// ---------------------------------------------------------------------------
// Écrans
// ---------------------------------------------------------------------------

function showScreen(screen) {
  for (const otherScreen of [authScreen, homeScreen, roomScreen]) {
    otherScreen.hidden = otherScreen !== screen;
  }

  meBox.hidden = me === null;
  popIn(screen.querySelectorAll('.card, .home-intro'));
}

// Au chargement : on vérifie le jeton, puis on retourne dans la room si on y était déjà
async function start() {
  if (!token) {
    showScreen(authScreen);
    return;
  }

  try {
    me = await callApi('GET', '/users/me');
  } catch {
    // Jeton expiré ou compte supprimé : il faut se reconnecter
    logout();
    return;
  }

  meName.textContent = me.username;
  meAvatar.textContent = initials(me.username);
  meAvatar.style.background = colorFromName(me.username);
  homeName.textContent = me.username;

  const savedCode = sessionStorage.getItem('roomCode');
  if (savedCode) {
    await openRoom(savedCode);
  } else {
    showHome();
  }
}

function showHome() {
  stopRefresh();
  room = null;
  players = [];
  joinError.hidden = true;

  // Arrivé avec un lien d'invitation (lobby.html?code=K7PX2M) : le code est déjà rempli
  const params = new URLSearchParams(location.search);
  if (params.get('code')) {
    joinCodeInput.value = params.get('code').toUpperCase();
  }

  showScreen(homeScreen);
}

// ---------------------------------------------------------------------------
// 1. Connexion / inscription
// ---------------------------------------------------------------------------

loginTab.addEventListener('click', () => setSignupMode(false));
signupTab.addEventListener('click', () => setSignupMode(true));

function setSignupMode(value) {
  isSignup = value;
  loginTab.setAttribute('aria-pressed', !value);
  signupTab.setAttribute('aria-pressed', value);
  usernameField.hidden = !value;
  usernameInput.required = value;
  authError.hidden = true;

  if (value) {
    authSubmit.textContent = 'Créer mon compte';
    passwordInput.autocomplete = 'new-password';
  } else {
    authSubmit.textContent = 'Se connecter';
    passwordInput.autocomplete = 'current-password';
  }
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authError.hidden = true;
  authSubmit.disabled = true;

  try {
    // Inscription : on crée le compte, puis on se connecte avec
    if (isSignup) {
      await callApi('POST', '/users', {
        username: usernameInput.value,
        email: emailInput.value,
        password: passwordInput.value,
      });
    }

    const result = await callApi('POST', '/auth/login', {
      email: emailInput.value,
      password: passwordInput.value,
    });

    token = result.token;
    sessionStorage.setItem('token', token);
    passwordInput.value = '';
    await start();
  } catch (error) {
    showError(authError, error);
  }

  authSubmit.disabled = false;
});

logoutButton.addEventListener('click', async () => {
  if (sessionStorage.getItem('roomCode')) {
    await leaveRoom();
  }
  logout();
});

function logout() {
  stopRefresh();
  token = null;
  me = null;
  room = null;
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('roomCode');
  showScreen(authScreen);
}

// ---------------------------------------------------------------------------
// 2. Créer ou rejoindre une room
// ---------------------------------------------------------------------------

createButton.addEventListener('click', async () => {
  createButton.disabled = true;

  try {
    const newRoom = await callApi('POST', '/rooms');
    await openRoom(newRoom.code);
  } catch (error) {
    toast(translateError(error));
  }

  createButton.disabled = false;
});

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  joinError.hidden = true;

  const code = joinCodeInput.value.trim().toUpperCase();

  if (code.length !== 6) {
    joinError.textContent = 'Le code fait 6 caractères.';
    joinError.hidden = false;
    shake(joinCodeInput);
    return;
  }

  try {
    await callApi('POST', `/rooms/${code}/participants`);
  } catch (error) {
    // Déjà dans cette room (ex. onglet fermé puis rouvert) : on y entre simplement
    if (error.message !== 'You are already in this room') {
      showError(joinError, error);
      shake(joinCodeInput);
      return;
    }
  }

  await openRoom(code);
});

// ---------------------------------------------------------------------------
// 3. Salle d'attente
// ---------------------------------------------------------------------------

// Affiche la salle d'attente de cette room, puis la rafraîchit régulièrement
async function openRoom(code) {
  sessionStorage.setItem('roomCode', code);
  room = null;
  players = [];

  const isInRoom = await loadRoom(code);
  if (!isInRoom) {
    return;
  }

  showScreen(roomScreen);
  scheduleRefresh(code);
}

function scheduleRefresh(code) {
  refreshTimer = setTimeout(async () => {
    const isInRoom = await loadRoom(code);
    if (isInRoom && !isStarting) {
      scheduleRefresh(code);
    }
  }, REFRESH_DELAY);
}

function stopRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = null;
}

// Demande la room et ses joueurs à l'API. Renvoie false si on n'est plus dans la room.
async function loadRoom(code) {
  let newRoom;
  let newPlayers;

  try {
    newRoom = await callApi('GET', `/rooms/${code}`);
    newPlayers = await callApi('GET', `/rooms/${code}/participants`);
  } catch (error) {
    // Serveur injoignable un instant : on garde l'écran et on réessaiera
    if (error.status === 0) {
      return true;
    }

    if (sessionStorage.getItem('roomCode') === code) {
      sessionStorage.removeItem('roomCode');

      if (error.status === 403) {
        toast('Tu ne fais plus partie de cette room.');
      } else if (error.status === 404) {
        toast("Cette room n'existe plus.");
      } else {
        toast(translateError(error));
      }

      showHome();
    }

    return false;
  }

  // On a quitté la room pendant la requête : on ignore la réponse
  if (sessionStorage.getItem('roomCode') !== code) {
    return false;
  }

  // Rien n'a changé depuis la dernière fois : on ne redessine pas.
  // Sinon les boutons seraient recréés toutes les 2 secondes et un clic pourrait se perdre.
  const response = JSON.stringify(newRoom) + JSON.stringify(newPlayers);
  if (room !== null && response === lastResponse) {
    return true;
  }
  lastResponse = response;

  const isFirstLoad = room === null;
  const previousRoom = room;
  const previousPlayers = players;

  room = newRoom;
  players = newPlayers;

  if (isFirstLoad) {
    renderRoom(null);
  } else {
    announceChanges(previousRoom, previousPlayers);
    renderRoom(previousPlayers);
  }

  // L'hôte a lancé la partie
  if (room.status === 'playing') {
    goToDrawing();
  }

  return true;
}

// Petits messages quand quelqu'un arrive, part, ou quand on devient l'hôte
function announceChanges(previousRoom, previousPlayers) {
  for (const player of players) {
    if (!findPlayer(previousPlayers, player.id)) {
      toast(`${player.username} a rejoint la room`);
    }
  }

  for (const player of previousPlayers) {
    if (!findPlayer(players, player.id)) {
      toast(`${player.username} est parti`);
    }
  }

  if (previousRoom.hostUserId !== room.hostUserId && room.hostUserId === me.id) {
    toast("Tu es maintenant l'hôte de la room !");
  }
}

// Affiche toute la salle d'attente. previousPlayers sert à animer les joueurs qui viennent d'arriver.
function renderRoom(previousPlayers) {
  const isHost = room.hostUserId === me.id;

  roomCodeText.textContent = room.code;
  playersCount.textContent = `${players.length} / ${room.settings.maxPlayers}`;
  renderPlayers(isHost, previousPlayers);

  if (!isSavingSettings) {
    renderSettings(isHost);
  }

  startButton.hidden = !isHost;
  startButton.disabled = players.length < 2 || isStarting;

  if (!isHost) {
    waitingText.textContent = "En attente de l'hôte…";
  } else if (players.length < 2) {
    waitingText.textContent = 'Il faut au moins 2 joueurs. Partage le code !';
  } else {
    waitingText.textContent = 'Tout le monde est là ? Lance la partie !';
  }
}

function renderPlayers(isHost, previousPlayers) {
  playerList.innerHTML = '';

  for (const player of players) {
    const isPlayerHost = player.userId === room.hostUserId;
    const isMe = player.userId === me.id;

    const item = document.createElement('li');
    item.className = 'player';

    if (isPlayerHost) {
      item.innerHTML = CROWN_ICON;
    }

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.style.background = colorFromName(player.username);
    avatar.textContent = initials(player.username);
    if (isMe) {
      avatar.classList.add('is-me');
    }
    item.append(avatar);

    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = player.username;
    item.append(name);

    if (isPlayerHost || isMe) {
      const tag = document.createElement('span');
      tag.className = 'player-tag';
      if (isPlayerHost && isMe) {
        tag.textContent = 'Toi · Hôte';
      } else if (isPlayerHost) {
        tag.textContent = 'Hôte';
      } else {
        tag.textContent = 'Toi';
      }
      if (isPlayerHost) {
        tag.classList.add('is-host');
      }
      item.append(tag);
    }

    // L'hôte peut exclure les autres joueurs (deux clics pour confirmer)
    if (isHost && !isMe) {
      const kickButton = document.createElement('button');
      kickButton.className = 'kick';
      kickButton.setAttribute('aria-label', `Exclure ${player.username}`);
      if (playerToKick === player.id) {
        kickButton.textContent = 'Exclure ?';
        kickButton.classList.add('is-armed');
      } else {
        kickButton.textContent = '✕';
      }
      kickButton.addEventListener('click', () => kickPlayer(player));
      item.append(kickButton);
    }

    playerList.append(item);

    if (previousPlayers && !findPlayer(previousPlayers, player.id)) {
      pop(item, 0.3);
    }
  }

  // Places encore libres
  for (let i = players.length; i < room.settings.maxPlayers; i++) {
    const item = document.createElement('li');
    item.className = 'player is-empty';
    item.innerHTML = '<span class="empty-dot"></span><span>Libre</span>';
    playerList.append(item);
  }
}

function renderSettings(isHost) {
  settingsCard.classList.toggle('is-readonly', !isHost);
  settingsNote.hidden = isHost;

  for (const setting of settingElements) {
    const name = setting.dataset.setting;
    const limits = SETTINGS_LIMITS[name];
    const value = room.settings[name];
    const buttons = setting.querySelectorAll('button');

    setting.querySelector('output').textContent = value + limits.unit;
    buttons[0].disabled = value <= minimumValue(name);
    buttons[1].disabled = value >= limits.max;
  }
}

// On ne descend pas le nombre de joueurs max sous le nombre de joueurs déjà là
function minimumValue(name) {
  const limits = SETTINGS_LIMITS[name];

  if (name === 'maxPlayers' && players.length > limits.min) {
    return players.length;
  }

  return limits.min;
}

for (const setting of settingElements) {
  for (const button of setting.querySelectorAll('button')) {
    button.addEventListener('click', () => {
      changeSetting(setting, Number(button.dataset.step));
    });
  }
}

async function changeSetting(setting, direction) {
  const name = setting.dataset.setting;
  const limits = SETTINGS_LIMITS[name];
  const newValue = room.settings[name] + direction * limits.step;

  if (newValue < minimumValue(name) || newValue > limits.max) {
    return;
  }

  const body = {};
  body[name] = newValue;

  isSavingSettings = true;

  try {
    room = await callApi('PATCH', `/rooms/${room.code}/settings`, body);
    isSavingSettings = false;
    renderRoom(players);
    pop(setting.querySelector('output'), 1.4);
  } catch (error) {
    isSavingSettings = false;
    toast(translateError(error));
  }
}

async function kickPlayer(player) {
  // Premier clic : le bouton demande « Exclure ? » pendant 5 secondes
  if (playerToKick !== player.id) {
    playerToKick = player.id;
    renderRoom(players);

    setTimeout(() => {
      if (playerToKick === player.id && room) {
        playerToKick = null;
        renderRoom(players);
      }
    }, 5000);
    return;
  }

  playerToKick = null;

  try {
    await callApi('PATCH', `/rooms/${room.code}/participants/${player.id}`, { excluded: true });
    await loadRoom(room.code);
  } catch (error) {
    toast(translateError(error));
  }
}

leaveButton.addEventListener('click', async () => {
  await leaveRoom();
  showHome();
});

// Quitte la room (DELETE de son propre participant)
async function leaveRoom() {
  const code = sessionStorage.getItem('roomCode');
  const myPlayer = findPlayerOfUser(players, me.id);

  stopRefresh();
  sessionStorage.removeItem('roomCode');
  room = null;

  if (myPlayer) {
    try {
      await callApi('DELETE', `/rooms/${code}/participants/${myPlayer.id}`);
    } catch {
      // Déjà sorti de la room (exclu, room supprimée) : rien à faire
    }
  }
}

startButton.addEventListener('click', async () => {
  startButton.disabled = true;

  try {
    room = await callApi('PATCH', `/rooms/${room.code}`, { status: 'playing' });
    goToDrawing();
  } catch (error) {
    toast(translateError(error));
    shake(startButton);
    startButton.disabled = false;
  }
});

copyLinkButton.addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?code=${room.code}`;
  pop(copyLinkButton);

  try {
    await navigator.clipboard.writeText(link);
    toast('Lien copié ! Envoie-le à tes amis');
  } catch {
    toast(link);
  }
});

// La partie commence : compte à rebours, puis direction l'écran de dessin de la room
function goToDrawing() {
  if (isStarting) {
    return;
  }

  isStarting = true;
  stopRefresh();
  sessionStorage.removeItem('roomCode');

  const url = `${DRAW_URL}?room=${room.code}&name=${encodeURIComponent(me.username)}`;
  playCountdown(() => {
    location.href = url;
  });
}

function playCountdown(onDone) {
  const steps = ['3', '2', '1', 'Go !'];
  let index = 0;

  countdown.hidden = false;

  function showNextStep() {
    if (index === steps.length) {
      onDone();
      return;
    }

    countdownValue.textContent = steps[index];
    pop(countdownValue, 0.2);
    index++;
    setTimeout(showNextStep, 800);
  }

  showNextStep();
}

// ---------------------------------------------------------------------------
// Animations (GSAP). Sans GSAP ou avec « animations réduites », tout marche sans.
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
    { scale: fromScale || 0.75 },
    {
      scale: 1,
      duration: 0.7,
      ease: 'elastic.out(1.1, 0.4)',
      overwrite: 'auto',
      clearProps: 'scale',
    },
  );
}

function shake(element) {
  if (!canAnimate) {
    return;
  }

  gsap.fromTo(
    element,
    { x: -8 },
    { x: 0, duration: 0.6, ease: 'elastic.out(1.5, 0.2)', overwrite: 'auto', clearProps: 'x' },
  );
}

function popIn(elements) {
  if (!canAnimate) {
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
      stagger: 0.08,
      ease: 'elastic.out(1, 0.65)',
      clearProps: 'y,scale,opacity',
    },
  );
}

function toast(text) {
  const element = document.createElement('div');
  element.className = 'toast';
  element.textContent = text;
  toasts.append(element);

  if (!canAnimate) {
    setTimeout(() => element.remove(), 2800);
    return;
  }

  gsap.fromTo(
    element,
    { y: 20, scale: 0.8, opacity: 0 },
    { y: 0, scale: 1, opacity: 1, duration: 0.7, ease: 'elastic.out(1, 0.6)' },
  );
  gsap.to(element, {
    y: -10,
    opacity: 0,
    delay: 2.6,
    duration: 0.3,
    onComplete: () => element.remove(),
  });
}

// Le logo flotte doucement, les taches du fond bougent
if (canAnimate) {
  gsap.to('.brand .logo', { y: -4, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.to('.blob', {
    x: 'random(-80, 80)',
    y: 'random(-60, 60)',
    duration: 'random(7, 11)',
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

// ---------------------------------------------------------------------------
// Petits outils
// ---------------------------------------------------------------------------

function findPlayer(list, id) {
  for (const player of list) {
    if (player.id === id) {
      return player;
    }
  }
  return null;
}

function findPlayerOfUser(list, userId) {
  for (const player of list) {
    if (player.userId === userId) {
      return player;
    }
  }
  return null;
}

// « jdoe » → « J », « Loutre Cosmique » → « LC »
function initials(name) {
  let result = '';

  for (const part of name.split(' ')) {
    if (part.length > 0 && result.length < 2) {
      result = result + part[0].toUpperCase();
    }
  }

  return result;
}

// Toujours la même couleur pour le même nom.
// Le « × 137 » éloigne les couleurs de deux noms presque pareils (ex. Testeur1 et Testeur2).
function colorFromName(name) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  const hue = (hash * 137) % 360;
  return `hsl(${hue} 70% 62%)`;
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

start();
