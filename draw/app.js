import { createBoard, HEIGHT, renderOp, WIDTH } from './board.js';
import { connect } from './network.js';

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

const COLORS = [
  { hex: '#2b2350', name: 'Encre' },
  { hex: '#ffffff', name: 'Blanc' },
  { hex: '#9aa0b8', name: 'Gris' },
  { hex: '#8b5a3c', name: 'Marron' },
  { hex: '#ff4f5e', name: 'Rouge' },
  { hex: '#ff8c42', name: 'Orange' },
  { hex: '#ffd23f', name: 'Jaune' },
  { hex: '#ffc3a0', name: 'Pêche' },
  { hex: '#7ed957', name: 'Vert pomme' },
  { hex: '#1fae6b', name: 'Vert' },
  { hex: '#4fd8e0', name: 'Turquoise' },
  { hex: '#3a8bff', name: 'Bleu' },
  { hex: '#8e5cff', name: 'Violet' },
  { hex: '#ff6fb5', name: 'Rose' },
  { hex: '#c9a7ff', name: 'Lilas' },
];

// Couleurs trop claires pour qu'on voie l'anneau de sélection de leur couleur
const LIGHT_COLORS = ['#ffffff', '#ffc3a0', '#ffd23f'];

// Tailles en pixels du dessin (qui fait 1600 px de large chez tout le monde)
const SIZES = [6, 14, 28, 52];
const ERASER_FACTOR = 1.6;

const BRUSHES = [
  { id: 'pen', label: 'Stylo' },
  { id: 'marker', label: 'Feutre' },
  { id: 'crayon', label: 'Crayon' },
  { id: 'spray', label: 'Bombe' },
];

const SHAPES = [
  { id: 'line', label: 'Ligne', icon: '<path d="M5 19 19 5"/>' },
  { id: 'rect', label: 'Rectangle', icon: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>' },
  { id: 'ellipse', label: 'Cercle', icon: '<circle cx="12" cy="12" r="8"/>' },
  { id: 'triangle', label: 'Triangle', icon: '<path d="M12 4.5 20.5 19h-17z"/>' },
  {
    id: 'star',
    label: 'Étoile',
    icon: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  },
  {
    id: 'heart',
    label: 'Cœur',
    icon: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
  },
];

const HINTS = {
  eraser: 'Frotte pour effacer. La taille change la largeur de la gomme.',
  fill: "Clique dans une zone fermée pour la remplir d'un coup.",
};

// Mots de la manche de démo (le vrai mot viendra du serveur)
const DEMO_WORDS = [
  'Girafe',
  'Pizza',
  'Fusée',
  'Licorne',
  'Volcan',
  'Pingouin',
  'Château',
  'Robot',
  'Dragon',
  'Cactus',
  'Banane',
  'Sirène',
  'Tortue',
  'Guitare',
  'Fantôme',
  'Arc-en-ciel',
  'Hamburger',
  'Escargot',
];
const DEMO_ROUND_DURATION = 80;

// ---------------------------------------------------------------------------
// Joueur et room : dans l'URL, ex. /?room=ABC123&name=Tanguy
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const roomCode = (params.get('room') || 'DEMO').toUpperCase();
const myName = params.get('name') || randomName();
const clientId = Math.random().toString(36).slice(2, 8);
let opCounter = 0;

// ---------------------------------------------------------------------------
// Éléments de la page
// ---------------------------------------------------------------------------

const app = document.getElementById('app');
const sheet = document.getElementById('sheet');
const paper = document.getElementById('paper');
const boardCanvas = document.getElementById('board');
const overlayCanvas = document.getElementById('overlay');
const brushCursor = document.getElementById('brush-cursor');
const toolButtons = document.querySelectorAll('[data-tool]');
const undoButton = document.getElementById('undo');
const redoButton = document.getElementById('redo');
const clearButton = document.getElementById('clear');
const swatches = document.getElementById('swatches');
const sizes = document.getElementById('sizes');
const brushes = document.getElementById('brushes');
const shapes = document.getElementById('shapes');
const sizeSection = document.getElementById('size-section');
const brushSection = document.getElementById('brush-section');
const shapeSection = document.getElementById('shape-section');
const hintSection = document.getElementById('hint-section');
const hint = document.getElementById('hint');
const wordLabel = document.getElementById('word-label');
const word = document.getElementById('word');
const rerollButton = document.getElementById('reroll');
const timer = document.getElementById('timer');
const timerProgress = document.getElementById('timer-progress');
const timerValue = document.getElementById('timer-value');
const players = document.getElementById('players');
const status = document.getElementById('status');
const statusText = document.getElementById('status-text');
const inviteButton = document.getElementById('invite');
const watching = document.getElementById('watching');
const roundOver = document.getElementById('round-over');
const roundOverCard = document.getElementById('round-over-card');
const roundOverTitle = document.getElementById('round-over-title');
const roundWord = document.getElementById('round-word');
const roundScores = document.getElementById('round-scores');
const newRoundButton = document.getElementById('new-round');
const chat = document.getElementById('chat');
const chatMessages = document.getElementById('chat-messages');
const guessForm = document.getElementById('guess-form');
const guessInput = document.getElementById('guess-input');
const gameOver = document.getElementById('game-over');
const gameOverCard = document.getElementById('game-over-card');
const gameOverTitle = document.getElementById('game-over-title');
const ranking = document.getElementById('ranking');
const toasts = document.getElementById('toasts');

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

let tool = 'brush';
let brush = 'pen';
let shape = 'rect';
let color = COLORS[0].hex;
let sizeIndex = 1;
let canDraw = true;
let currentWord = '';

// Arrivé depuis la salle d'attente : on a un jeton de connexion et c'est le serveur qui fait jouer les tours.
// Sinon (serveur de test npm run draw) : manche de démo, sans compte.
const token = sessionStorage.getItem('token');
const serverRounds = token !== null;
let currentDrawingId = null; // le dessin du tour en cours (pour envoyer ses propositions)

// Mes opérations, pour annuler / rétablir seulement ce que j'ai fait
let myOps = [];
let myUndone = [];

// Le dessin, et un calque transparent par-dessus pour l'aperçu des formes
const board = createBoard(boardCanvas);
overlayCanvas.width = WIDTH;
overlayCanvas.height = HEIGHT;
const overlay = overlayCanvas.getContext('2d');

// ---------------------------------------------------------------------------
// Réseau : chaque action est appliquée chez moi, puis envoyée aux autres
// ---------------------------------------------------------------------------

// Pas de serveur (page ouverte comme simple fichier) : network reste null et on dessine en solo
let network = null;

if (location.protocol === 'http:' || location.protocol === 'https:') {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let url = `${protocol}//${location.host}/ws?room=${encodeURIComponent(roomCode)}`;

  // Avec un compte : on envoie son jeton. Sinon (serveur de test) : juste un nom.
  if (token) {
    url = url + `&token=${encodeURIComponent(token)}`;
  } else {
    url = url + `&name=${encodeURIComponent(myName)}`;
  }

  network = connect(url, handleServerMessage, showConnectionStatus);
}

function sendToOthers(message) {
  if (network) {
    network.send(message);
  }
}

function dispatch(message) {
  board.apply(message);
  sendToOthers(message);
}

function handleServerMessage(message) {
  // En arrivant (ou en se reconnectant) : le dessin déjà commencé
  if (message.type === 'history') {
    board.load(message.messages);
    myOps = board.visibleIds().filter((id) => id.startsWith(`${clientId}-`));
    myUndone = [];
    updateHistoryButtons();
    return;
  }

  if (message.type === 'presence') {
    showPlayers(message.players);
    return;
  }

  // Messages du jeu, envoyés par le serveur (lib/game.js)
  if (message.type === 'round-started') {
    onRoundStarted(message);
    return;
  }

  if (message.type === 'word-to-draw') {
    showWord(message.word);
    return;
  }

  if (message.type === 'guess') {
    addChatLine(message.player, message.text, '');
    return;
  }

  if (message.type === 'word-found') {
    onWordFound(message);
    return;
  }

  if (message.type === 'round-ended') {
    onRoundEnded(message);
    return;
  }

  if (message.type === 'game-ended') {
    showGameOver('Partie terminée !', message.ranking);
    return;
  }

  if (message.type === 'game-error') {
    showGameOver("Oups, la partie s'est arrêtée…", []);
    return;
  }

  // Sinon : un message de dessin d'un autre joueur
  board.apply(message);
}

function newId() {
  opCounter++;
  return `${clientId}-${opCounter}`;
}

// ---------------------------------------------------------------------------
// Dessiner avec la souris, le doigt ou le stylet
// ---------------------------------------------------------------------------

let activePointer = null;
let strokeId = null;
let lastPoint = null;
let shapeStart = null;
let shapeEnd = null;
let pendingPoints = [];
let flushTimer = null;

sheet.addEventListener('pointerdown', (event) => {
  if (!canDraw || activePointer !== null) {
    return;
  }

  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }

  event.preventDefault();
  activePointer = event.pointerId;
  sheet.setPointerCapture(event.pointerId);

  const point = toBoardPoint(event, sheet.getBoundingClientRect());

  if (tool === 'fill') {
    const id = newId();
    const at = [clamp(point[0], 0, 0.9999), clamp(point[1], 0, 0.9999)];
    dispatch({ type: 'op', op: { id: id, kind: 'fill', color: color, at: at } });
    rememberOp(id);
    showRipple(event);
    bounceLogo();
    return;
  }

  if (tool === 'shape') {
    shapeStart = point;
    shapeEnd = point;
    return;
  }

  strokeId = newId();
  lastPoint = point;

  dispatch({
    type: 'op',
    op: {
      id: strokeId,
      kind: 'stroke',
      brush: tool === 'eraser' ? 'eraser' : brush,
      color: color,
      size: currentSize(),
      seed: Math.floor(Math.random() * 1000000000),
      points: [point],
    },
  });
  rememberOp(strokeId);
});

sheet.addEventListener('pointermove', (event) => {
  const rect = sheet.getBoundingClientRect();
  moveBrushCursor(event, rect);

  if (event.pointerId !== activePointer) {
    return;
  }

  // Les navigateurs regroupent les mouvements rapides : on récupère tous les points pour un trait fluide
  let events = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
  if (events.length === 0) {
    events = [event];
  }

  if (shapeStart) {
    shapeEnd = toBoardPoint(events[events.length - 1], rect);
    overlay.clearRect(0, 0, WIDTH, HEIGHT);
    renderOp(overlay, shapeOp(event.shiftKey));
    return;
  }

  if (!strokeId) {
    return;
  }

  const points = [];
  for (const coalescedEvent of events) {
    const point = toBoardPoint(coalescedEvent, rect);
    const distance = Math.hypot(
      (point[0] - lastPoint[0]) * WIDTH,
      (point[1] - lastPoint[1]) * HEIGHT,
    );
    if (distance >= 1.5) {
      points.push(point);
      lastPoint = point;
    }
  }

  if (points.length > 0) {
    addPoints(points);
  }
});

sheet.addEventListener('pointerup', finishGesture);
sheet.addEventListener('pointercancel', finishGesture);

sheet.addEventListener('pointerleave', () => {
  brushCursor.classList.remove('is-visible');
});

sheet.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

function finishGesture(event) {
  if (event.pointerId !== activePointer) {
    return;
  }

  activePointer = null;

  if (strokeId) {
    flushPoints();
    dispatch({ type: 'end', id: strokeId });
    strokeId = null;
  }

  if (shapeStart) {
    overlay.clearRect(0, 0, WIDTH, HEIGHT);
    const op = shapeOp(event.shiftKey);
    shapeStart = null;

    // Simple clic sans glisser : pas de forme
    const length = Math.hypot((op.to[0] - op.from[0]) * WIDTH, (op.to[1] - op.from[1]) * HEIGHT);
    if (length < 8) {
      return;
    }

    op.id = newId();
    dispatch({ type: 'op', op: op });
    rememberOp(op.id);
  }
}

// Les points du trait sont dessinés tout de suite chez moi, et envoyés aux autres par paquets
function addPoints(points) {
  board.apply({ type: 'points', id: strokeId, points: points });
  for (const point of points) {
    pendingPoints.push(point);
  }

  if (!flushTimer) {
    flushTimer = setTimeout(flushPoints, 30);
  }
}

function flushPoints() {
  clearTimeout(flushTimer);
  flushTimer = null;

  if (pendingPoints.length > 0 && strokeId) {
    sendToOthers({ type: 'points', id: strokeId, points: pendingPoints });
  }

  pendingPoints = [];
}

// La forme en cours (Maj enfoncée : carré / cercle parfait)
function shapeOp(keepProportions) {
  let to = shapeEnd;

  if (keepProportions && shape !== 'line') {
    const width = (to[0] - shapeStart[0]) * WIDTH;
    const height = (to[1] - shapeStart[1]) * HEIGHT;
    const side = Math.max(Math.abs(width), Math.abs(height));
    to = [
      roundCoordinate(shapeStart[0] + (Math.sign(width) * side) / WIDTH),
      roundCoordinate(shapeStart[1] + (Math.sign(height) * side) / HEIGHT),
    ];
  }

  return {
    kind: 'shape',
    shape: shape,
    color: color,
    size: currentSize(),
    from: shapeStart,
    to: to,
  };
}

// Position du pointeur sur la feuille, entre 0 et 1
function toBoardPoint(event, rect) {
  return [
    roundCoordinate((event.clientX - rect.left) / rect.width),
    roundCoordinate((event.clientY - rect.top) / rect.height),
  ];
}

function roundCoordinate(value) {
  return Math.round(value * 10000) / 10000;
}

function currentSize() {
  if (tool === 'eraser') {
    return Math.round(SIZES[sizeIndex] * ERASER_FACTOR);
  }

  return SIZES[sizeIndex];
}

// Cercle qui suit la souris et montre la taille du pinceau
function moveBrushCursor(event, rect) {
  const showsSize = tool === 'brush' || tool === 'eraser';

  if (event.pointerType === 'touch' || !showsSize || !canDraw) {
    brushCursor.classList.remove('is-visible');
    return;
  }

  let diameter = (currentSize() * rect.width) / WIDTH;
  if (tool === 'brush' && brush === 'spray') {
    diameter = diameter * 2;
  }
  diameter = Math.max(diameter, 4);

  brushCursor.style.width = `${diameter}px`;
  brushCursor.style.height = `${diameter}px`;
  brushCursor.style.translate = `${event.clientX - rect.left - diameter / 2}px ${event.clientY - rect.top - diameter / 2}px`;
  brushCursor.classList.add('is-visible');
}

// ---------------------------------------------------------------------------
// Annuler / rétablir / tout effacer
// ---------------------------------------------------------------------------

function rememberOp(id) {
  myOps.push(id);
  myUndone = [];
  updateHistoryButtons();
}

function undo() {
  if (!canDraw || myOps.length === 0) {
    shake(undoButton);
    return;
  }

  const id = myOps.pop();
  myUndone.push(id);
  dispatch({ type: 'undo', id: id });
  updateHistoryButtons();
  wiggle(undoButton.querySelector('svg'), -40);
}

function redo() {
  if (!canDraw || myUndone.length === 0) {
    shake(redoButton);
    return;
  }

  const id = myUndone.pop();
  myOps.push(id);
  dispatch({ type: 'redo', id: id });
  updateHistoryButtons();
  wiggle(redoButton.querySelector('svg'), 40);
}

function clearDrawing() {
  if (!canDraw) {
    return;
  }

  const id = newId();
  dispatch({ type: 'op', op: { id: id, kind: 'clear' } });
  rememberOp(id);

  wiggle(paper, -3);
  wiggle(clearButton.querySelector('svg'), 25);
}

function updateHistoryButtons() {
  undoButton.disabled = myOps.length === 0;
  redoButton.disabled = myUndone.length === 0;
}

undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);
clearButton.addEventListener('click', clearDrawing);

// ---------------------------------------------------------------------------
// Outils, couleurs, tailles, pinceaux, formes
// ---------------------------------------------------------------------------

for (const button of toolButtons) {
  button.addEventListener('click', () => selectTool(button.dataset.tool));
}

function selectTool(name) {
  tool = name;
  sheet.dataset.tool = name;

  for (const button of toolButtons) {
    const isSelected = button.dataset.tool === name;
    button.setAttribute('aria-pressed', isSelected);
    if (isSelected) {
      pop(button);
      wiggle(button.querySelector('svg'), -18);
    }
  }

  brushSection.classList.toggle('is-hidden', name !== 'brush');
  shapeSection.classList.toggle('is-hidden', name !== 'shape');
  hintSection.classList.toggle('is-hidden', !HINTS[name]);
  hint.textContent = HINTS[name] || '';
  sizeSection.classList.toggle('is-disabled', name === 'fill');

  const visibleSection = [brushSection, shapeSection, hintSection].find(
    (section) => !section.classList.contains('is-hidden'),
  );
  popIn(visibleSection.querySelectorAll('button, .hint'));
}

function buildSwatches() {
  for (const item of COLORS) {
    const button = document.createElement('button');
    button.className = 'swatch';
    button.style.setProperty('--swatch', item.hex);
    if (LIGHT_COLORS.includes(item.hex)) {
      button.style.setProperty('--swatch-ring', '#c4bbe8');
    }
    button.setAttribute('aria-label', item.name);
    button.addEventListener('click', () => selectColor(item.hex, button));
    swatches.append(button);
  }

  // Dernière pastille : n'importe quelle couleur avec le sélecteur du navigateur
  const custom = document.createElement('label');
  custom.className = 'swatch swatch-custom';
  custom.title = 'Autre couleur';

  const input = document.createElement('input');
  input.type = 'color';
  input.value = '#00c2a8';
  input.setAttribute('aria-label', 'Choisir une autre couleur');
  input.addEventListener('input', () => {
    custom.style.setProperty('--swatch', input.value);
    selectColor(input.value, custom);
  });

  custom.append(input);
  swatches.append(custom);
}

function selectColor(hex, element) {
  color = hex;
  document.documentElement.style.setProperty('--current-color', hex);

  for (const swatch of swatches.children) {
    swatch.classList.toggle('is-selected', swatch === element);
    if (swatch.tagName === 'BUTTON') {
      swatch.setAttribute('aria-pressed', swatch === element);
    }
  }

  pop(element, 0.6);
  renderBrushPreviews();

  // Choisir une couleur avec la gomme en main : on reprend le pinceau
  if (tool === 'eraser') {
    selectTool('brush');
  }
}

function buildSizes() {
  SIZES.forEach((size, index) => {
    const button = document.createElement('button');
    button.className = 'size';
    button.setAttribute('aria-label', `Taille ${index + 1}`);
    button.innerHTML = `<span style="--dot: ${6 + index * 6}px"></span>`;
    button.addEventListener('click', () => selectSize(index));
    sizes.append(button);
  });
}

function selectSize(index) {
  sizeIndex = index;

  for (let i = 0; i < sizes.children.length; i++) {
    const button = sizes.children[i];
    button.setAttribute('aria-pressed', i === index);
    if (i === index) {
      pop(button.firstElementChild, 0.3);
    }
  }
}

function buildBrushes() {
  for (const item of BRUSHES) {
    const button = document.createElement('button');
    button.className = 'brush-tile';
    button.dataset.brush = item.id;
    button.innerHTML = `<canvas width="200" height="68" aria-hidden="true"></canvas><span>${item.label}</span>`;
    button.addEventListener('click', () => selectBrush(item.id));
    brushes.append(button);
  }
}

function selectBrush(id) {
  brush = id;

  for (const button of brushes.children) {
    const isSelected = button.dataset.brush === id;
    button.setAttribute('aria-pressed', isSelected);
    if (isSelected) {
      pop(button);
    }
  }
}

// Aperçu de chaque pinceau, dessiné avec le vrai moteur et la couleur choisie
function renderBrushPreviews() {
  const points = [];
  for (let k = 0; k <= 30; k++) {
    points.push([0.1 + (0.8 * k) / 30, 0.5 + 0.26 * Math.sin((k / 30) * Math.PI * 2)]);
  }

  for (const button of brushes.children) {
    const canvas = button.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderOp(ctx, {
      kind: 'stroke',
      brush: button.dataset.brush,
      color: color,
      size: 9,
      seed: 42,
      points: points,
      ended: true,
    });
  }
}

function buildShapes() {
  for (const item of SHAPES) {
    const button = document.createElement('button');
    button.className = 'shape-tile';
    button.dataset.shape = item.id;
    button.setAttribute('aria-label', item.label);
    button.title = item.label;
    button.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg>`;
    button.addEventListener('click', () => selectShape(item.id));
    shapes.append(button);
  }
}

function selectShape(id) {
  shape = id;

  for (const button of shapes.children) {
    const isSelected = button.dataset.shape === id;
    button.setAttribute('aria-pressed', isSelected);
    if (isSelected) {
      pop(button);
    }
  }
}

// Raccourcis clavier
document.addEventListener('keydown', (event) => {
  if (event.target.closest('input')) {
    return;
  }

  const key = event.key.toLowerCase();
  const withCtrl = event.ctrlKey || event.metaKey;

  if (withCtrl && key === 'z' && !event.shiftKey) {
    event.preventDefault();
    undo();
  } else if (withCtrl && (key === 'y' || (key === 'z' && event.shiftKey))) {
    event.preventDefault();
    redo();
  } else if (!withCtrl && !event.altKey) {
    const tools = { b: 'brush', e: 'eraser', f: 'fill', s: 'shape' };
    if (tools[key]) {
      selectTool(tools[key]);
    }
    if (['1', '2', '3', '4'].includes(key)) {
      selectSize(Number(key) - 1);
    }
  }
});

// ---------------------------------------------------------------------------
// Manches : mot, minuteur, fin du temps
// ---------------------------------------------------------------------------

function startRound(duration, isDrawer, drawer) {
  roundOver.hidden = true;
  rerollButton.hidden = serverRounds;
  newRoundButton.hidden = serverRounds;

  canDraw = isDrawer;
  app.classList.toggle('is-watching', !isDrawer);
  watching.hidden = isDrawer;
  watching.textContent = `${drawer || "Quelqu'un"} dessine…`;

  // Ceux qui devinent ont le chat des propositions à la place des outils
  chat.hidden = isDrawer || !serverRounds;

  if (!isDrawer) {
    currentWord = '';
    word.innerHTML = '';
    wordLabel.textContent = 'Devine le mot !';
  }

  updateHistoryButtons();
  startTimer(duration);
}

function startDemoRound() {
  showWord(randomItem(DEMO_WORDS));
  startRound(DEMO_ROUND_DURATION, true);
}

function endRound(wordToReveal) {
  stopTimer();
  canDraw = false;
  brushCursor.classList.remove('is-visible');

  roundWord.textContent = wordToReveal || currentWord;
  roundOver.hidden = false;

  if (canAnimate) {
    gsap.fromTo(
      roundOverCard,
      { scale: 0.4, rotation: -8, opacity: 0 },
      { scale: 1, rotation: 0, opacity: 1, duration: 0.9, ease: 'elastic.out(1, 0.5)' },
    );
  }
  bounceLogo();
}

function showWord(newWord) {
  currentWord = newWord;
  wordLabel.textContent = 'À toi de dessiner';
  word.innerHTML = '';

  for (const character of newWord.toUpperCase()) {
    const letter = document.createElement('span');
    letter.className = character === ' ' || character === '-' ? 'letter is-gap' : 'letter';
    letter.textContent = character;
    word.append(letter);
  }

  if (canAnimate && animationsOn) {
    gsap.fromTo(
      word.children,
      { y: -16, rotation: 'random(-25, 25)', opacity: 0 },
      { y: 0, rotation: 0, opacity: 1, duration: 0.8, stagger: 0.05, ease: 'elastic.out(1, 0.5)' },
    );
  }
}

rerollButton.addEventListener('click', () => {
  let newWord = currentWord;
  while (newWord === currentWord) {
    newWord = randomItem(DEMO_WORDS);
  }
  showWord(newWord);
  wiggle(rerollButton, 180);
});

newRoundButton.addEventListener('click', () => {
  startDemoRound();
  clearDrawing();
});

// ---------------------------------------------------------------------------
// Partie gérée par le serveur (lancée depuis la salle d'attente)
// ---------------------------------------------------------------------------

// En attendant le premier tour
function waitForFirstTurn() {
  canDraw = false;
  app.classList.add('is-watching');
  watching.hidden = false;
  watching.textContent = 'La partie va commencer…';
  wordLabel.textContent = 'Prépare-toi !';
  word.innerHTML = '';
  timerValue.textContent = '…';
  rerollButton.hidden = true;
  inviteButton.hidden = true;
}

function onRoundStarted(message) {
  const isDrawer = message.drawer === myName;

  currentDrawingId = message.drawingId;
  roundOverTitle.textContent = 'Fin du tour !';
  gameOver.hidden = true;

  startRound(message.duration, isDrawer, message.drawer);
  if (!isDrawer) {
    showHint(message.hint);
  }

  guessInput.disabled = false;
  guessInput.placeholder = 'Ta proposition…';
  addChatLine(
    '',
    `Manche ${message.round}/${message.totalRounds} : ${message.drawer} dessine`,
    'is-info',
  );
}

// Ceux qui devinent voient seulement la longueur du mot : une case vide par lettre
function showHint(hintText) {
  wordLabel.textContent = 'Devine le mot !';
  word.innerHTML = '';

  for (const character of hintText) {
    const letter = document.createElement('span');
    if (character === '_') {
      letter.className = 'letter is-blank';
    } else {
      letter.className = 'letter is-gap';
      letter.textContent = character;
    }
    word.append(letter);
  }
}

function onWordFound(message) {
  addChatLine('', `${message.player} a trouvé ! +${message.points}`, 'is-found');
  toast(`${message.player} a trouvé le mot !`);

  if (message.player === myName) {
    guessInput.disabled = true;
    guessInput.value = '';
    guessInput.placeholder = 'Bravo, tu as trouvé !';
    bounceLogo();
  }
}

function onRoundEnded(message) {
  currentDrawingId = null;
  guessInput.disabled = true;
  renderScores(message.scores);
  endRound(message.word);
}

// Scores de fin de tour, du meilleur au moins bon
function renderScores(scores) {
  roundScores.innerHTML = '';

  for (const entry of scores) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = entry.username;
    const points = document.createElement('strong');
    points.textContent = `${entry.score} pts`;
    item.append(name, points);
    roundScores.append(item);
  }
}

// Une ligne dans le chat : « joueur : proposition », ou un message du jeu (className is-info / is-found)
function addChatLine(player, text, className) {
  const line = document.createElement('li');
  if (className) {
    line.className = className;
  }

  if (player) {
    const name = document.createElement('strong');
    name.textContent = `${player} `;
    line.append(name);
  }
  line.append(text);

  chatMessages.append(line);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // On garde seulement les 50 dernières lignes
  if (chatMessages.children.length > 50) {
    chatMessages.firstElementChild.remove();
  }
}

// Envoyer une proposition : POST /rooms/:code/drawings/:id/guesses avec son jeton.
// La réponse arrive aussi par le temps réel (guess ou word-found), pour tout le monde.
guessForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const content = guessInput.value.trim();
  if (content === '' || currentDrawingId === null) {
    return;
  }
  guessInput.value = '';

  try {
    const response = await fetch(`/rooms/${roomCode}/drawings/${currentDrawingId}/guesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: content }),
    });

    if (!response.ok) {
      toast('Proposition refusée : le tour est peut-être fini.');
    }
  } catch {
    toast('Impossible de joindre le serveur.');
  }
});

// Fin de la partie : le classement, puis retour au menu
function showGameOver(title, entries) {
  stopTimer();
  canDraw = false;
  roundOver.hidden = true;
  gameOverTitle.textContent = title;
  ranking.innerHTML = '';

  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = `ranking-item rank-${entry.rank}`;

    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = entry.rank;

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.style.background = colorFromName(entry.username);
    avatar.textContent = initials(entry.username);

    const name = document.createElement('span');
    name.className = 'ranking-name';
    name.textContent = entry.username === myName ? `${entry.username} (toi)` : entry.username;

    const points = document.createElement('strong');
    points.textContent = `${entry.score} pts`;

    item.append(rank, avatar, name, points);
    ranking.append(item);
  }

  gameOver.hidden = false;

  if (canAnimate) {
    gsap.fromTo(
      gameOverCard,
      { scale: 0.5, rotation: -6, opacity: 0 },
      { scale: 1, rotation: 0, opacity: 1, duration: 1, ease: 'elastic.out(1, 0.5)' },
    );
    gsap.fromTo(
      ranking.children,
      { x: -30, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.8, stagger: 0.12, delay: 0.3, ease: 'elastic.out(1, 0.6)' },
    );
  }
}

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 26;
let timerEnd = 0;
let timerDuration = 1;
let timerFrame = null;
let shownSeconds = null;

function startTimer(seconds) {
  stopTimer();
  timerDuration = seconds;
  timerEnd = performance.now() + seconds * 1000;
  shownSeconds = null;
  updateTimer();
}

function stopTimer() {
  cancelAnimationFrame(timerFrame);
}

function updateTimer() {
  const remaining = Math.max(0, (timerEnd - performance.now()) / 1000);
  timerProgress.style.strokeDashoffset = TIMER_CIRCUMFERENCE * (1 - remaining / timerDuration);

  const seconds = Math.ceil(remaining);
  if (seconds !== shownSeconds) {
    shownSeconds = seconds;
    timerValue.textContent = seconds;
    timer.classList.toggle('is-warning', seconds <= 20 && seconds > 10);
    timer.classList.toggle('is-danger', seconds <= 10);

    // Les 10 dernières secondes : le minuteur bat comme un cœur
    if (seconds <= 10 && seconds > 0) {
      pop(timer, 1.2);
    }
  }

  if (remaining > 0) {
    timerFrame = requestAnimationFrame(updateTimer);
  } else if (!serverRounds) {
    endRound(currentWord);
  }
}

// ---------------------------------------------------------------------------
// Joueurs, connexion, invitation
// ---------------------------------------------------------------------------

let knownPlayers = null;

function showPlayers(names) {
  const newNames = knownPlayers ? names.filter((name) => !knownPlayers.includes(name)) : [];

  if (knownPlayers) {
    for (const name of newNames) {
      if (name !== myName) {
        toast(`${name} a rejoint la room`);
      }
    }
    for (const name of knownPlayers) {
      if (!names.includes(name)) {
        toast(`${name} est parti`);
      }
    }
  }

  knownPlayers = names;
  renderAvatars(names, newNames);
}

function renderAvatars(names, newNames = []) {
  players.innerHTML = '';

  for (const name of names.slice(0, 4)) {
    const avatar = document.createElement('span');
    avatar.className = name === myName ? 'avatar is-me' : 'avatar';
    avatar.style.background = colorFromName(name);
    avatar.textContent = initials(name);
    avatar.title = name === myName ? `${name} (toi)` : name;
    players.append(avatar);

    if (newNames.includes(name)) {
      pop(avatar, 0.2);
    }
  }

  if (names.length > 4) {
    const more = document.createElement('span');
    more.className = 'avatar is-more';
    more.textContent = `+${names.length - 4}`;
    players.append(more);
  }
}

function showConnectionStatus(online) {
  status.classList.toggle('is-online', online);
  statusText.textContent = online ? 'En direct' : 'Solo';

  // À la (re)connexion, la liste des joueurs arrive sans annoncer « X a rejoint »
  if (online) {
    knownPlayers = null;
  }
}

inviteButton.addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomCode)}`;
  pop(inviteButton);

  try {
    await navigator.clipboard.writeText(link);
    toast('Lien copié ! Ouvre-le dans un autre onglet');
  } catch {
    toast(link);
  }
});

// ---------------------------------------------------------------------------
// Animations (GSAP). Sans GSAP ou avec « animations réduites », tout marche sans.
// ---------------------------------------------------------------------------

const canAnimate =
  typeof window.gsap !== 'undefined' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let animationsOn = false; // pas de petites animations pendant le chargement

function pop(element, fromScale = 0.75) {
  if (!canAnimate || !animationsOn || !element) {
    return;
  }

  gsap.fromTo(
    element,
    { scale: fromScale },
    {
      scale: 1,
      duration: 0.7,
      ease: 'elastic.out(1.1, 0.4)',
      overwrite: 'auto',
      clearProps: 'scale',
    },
  );
}

function wiggle(element, angle) {
  if (!canAnimate || !animationsOn || !element) {
    return;
  }

  gsap.fromTo(
    element,
    { rotation: angle },
    {
      rotation: 0,
      duration: 0.9,
      ease: 'elastic.out(1.2, 0.3)',
      overwrite: 'auto',
      clearProps: 'rotation',
    },
  );
}

function shake(element) {
  if (!canAnimate || !animationsOn) {
    return;
  }

  gsap.fromTo(
    element,
    { x: -8 },
    { x: 0, duration: 0.6, ease: 'elastic.out(1.5, 0.2)', overwrite: 'auto', clearProps: 'x' },
  );
}

function popIn(elements) {
  if (!canAnimate || !animationsOn) {
    return;
  }

  gsap.fromTo(
    elements,
    { scale: 0.5, opacity: 0 },
    {
      scale: 1,
      opacity: 1,
      duration: 0.7,
      stagger: 0.04,
      ease: 'elastic.out(1, 0.55)',
      overwrite: 'auto',
      clearProps: 'scale,opacity',
    },
  );
}

// Le logo s'écrase et rebondit (remplissage, fin de tour, mot trouvé)
function bounceLogo() {
  if (!canAnimate) {
    return;
  }

  gsap.fromTo(
    '.brand .logo',
    { scaleX: 1.25, scaleY: 0.8, transformOrigin: '50% 100%' },
    { scaleX: 1, scaleY: 1, duration: 0.9, ease: 'elastic.out(1.2, 0.3)', overwrite: 'auto' },
  );
}

// Petite onde de couleur là où on remplit
function showRipple(event) {
  if (!canAnimate) {
    return;
  }

  const rect = sheet.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.left = `${event.clientX - rect.left}px`;
  ripple.style.top = `${event.clientY - rect.top}px`;
  ripple.style.background = color;
  sheet.append(ripple);

  gsap.fromTo(
    ripple,
    { xPercent: -50, yPercent: -50, scale: 0, opacity: 0.6 },
    {
      scale: 1.5,
      opacity: 0,
      duration: 0.7,
      ease: 'power2.out',
      onComplete: () => ripple.remove(),
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

function playIntro() {
  if (!canAnimate) {
    animationsOn = true;
    return;
  }

  gsap
    .timeline({
      defaults: { duration: 1, ease: 'elastic.out(1, 0.6)' },
      onComplete: () => {
        animationsOn = true;
      },
    })
    .fromTo(
      '.hud > *',
      { y: -30, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.07, clearProps: 'y,opacity' },
    )
    .fromTo(
      '.paper',
      { scale: 0.85, rotation: -4, opacity: 0 },
      { scale: 1, rotation: 0, opacity: 1, duration: 1.3, clearProps: 'scale,rotation,opacity' },
      0.1,
    )
    .fromTo(
      '.toolbar, .panel',
      { opacity: 0 },
      { opacity: 1, duration: 0.4, ease: 'power1.out', clearProps: 'opacity' },
      0.2,
    )
    .fromTo('.toolbar .tool', { scale: 0 }, { scale: 1, stagger: 0.05, clearProps: 'scale' }, 0.3)
    .fromTo(
      '.swatch, .size, .brush-tile',
      { scale: 0 },
      { scale: 1, stagger: 0.015, clearProps: 'scale' },
      0.35,
    )
    .fromTo(
      '.tape',
      { y: -30, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        stagger: 0.12,
        duration: 0.6,
        ease: 'back.out(2.5)',
        clearProps: 'y,opacity',
      },
      0.7,
    );

  // Le logo flotte, les taches du fond bougent doucement
  gsap.to('.brand .logo', { y: -4, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.to('.blob', {
    x: 'random(-80, 80)',
    y: 'random(-60, 60)',
    scale: 'random(0.9, 1.15)',
    duration: 'random(7, 11)',
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

// ---------------------------------------------------------------------------
// Petits outils
// ---------------------------------------------------------------------------

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomName() {
  const animals = ['Panda', 'Koala', 'Renard', 'Loutre', 'Hibou', 'Lama', 'Pingouin', 'Axolotl'];
  const adjectives = ['Rigolo', 'Turbo', 'Pastel', 'Cosmique', 'Joyeux', 'Ninja', 'Fluo', 'Câlin'];
  return `${randomItem(animals)} ${randomItem(adjectives)}`;
}

// « Loutre Cosmique » → « LC »
function initials(name) {
  let result = '';

  for (const part of name.split(' ')) {
    if (part.length > 0 && result.length < 2) {
      result = result + part[0].toUpperCase();
    }
  }

  return result;
}

// Toujours la même couleur pour le même nom (même calcul que dans lobby.js).
// Le « × 137 » éloigne les couleurs de deux noms presque pareils (ex. Testeur1 et Testeur2).
function colorFromName(name) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  const hue = (hash * 137) % 360;
  return `hsl(${hue} 70% 62%)`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

document.getElementById('room-code').textContent = roomCode;
buildSwatches();
buildSizes();
buildBrushes();
buildShapes();
selectColor(COLORS[0].hex, swatches.firstElementChild);
selectSize(1);
selectBrush('pen');
selectShape('rect');
selectTool('brush');
renderAvatars([myName]);
updateHistoryButtons();

if (serverRounds) {
  waitForFirstTurn();
} else {
  startDemoRound();
}

playIntro();
