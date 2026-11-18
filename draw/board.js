// Moteur de dessin de Devin'Art.
//
// Un dessin = une liste d'« opérations » : trait, forme, remplissage ou effacement.
// Tous les joueurs reçoivent les mêmes messages dans le même ordre et les rejouent sur leur canvas :
// tout le monde voit donc exactement le même dessin. Ce fichier ne connaît ni l'interface ni le réseau.

// Taille du dessin, la même pour tous les joueurs (le canvas est agrandi ou réduit à l'écran)
export const WIDTH = 1600;
export const HEIGHT = 1200;

// Écart de couleur accepté par le pot de peinture (0 à 255) : absorbe les bords adoucis des traits
const FILL_TOLERANCE = 48;

// Crée le dessin sur un canvas et renvoie les fonctions pour le modifier
export function createBoard(canvas) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let ops = []; // opérations visibles, dans l'ordre
  let opsById = new Map(); // toutes les opérations reçues, même annulées (pour « rétablir »)

  // Applique un message de dessin. draw = false : met à jour la liste sans redessiner
  function apply(message, draw = true) {
    if (message.type === 'op') {
      if (opsById.has(message.op.id)) {
        return;
      }

      const op = structuredClone(message.op);
      opsById.set(op.id, op);
      ops.push(op);

      if (draw) {
        renderOp(ctx, op);
      }
    }

    if (message.type === 'points') {
      const op = opsById.get(message.id);
      if (!op) {
        return;
      }

      const firstNewPoint = op.points.length;
      for (const point of message.points) {
        op.points.push(point);
      }

      if (draw && ops.includes(op)) {
        for (let i = firstNewPoint; i < op.points.length; i++) {
          renderStrokeSegment(ctx, op, i);
        }
      }
    }

    if (message.type === 'end') {
      const op = opsById.get(message.id);
      if (!op) {
        return;
      }

      op.ended = true;

      if (draw && ops.includes(op)) {
        renderStrokeEnd(ctx, op);
      }
    }

    if (message.type === 'undo') {
      const index = ops.findIndex((op) => op.id === message.id);
      if (index === -1) {
        return;
      }

      ops.splice(index, 1);

      if (draw) {
        redraw();
      }
    }

    if (message.type === 'redo') {
      const op = opsById.get(message.id);
      if (!op || ops.includes(op)) {
        return;
      }

      ops.push(op);

      if (draw) {
        renderOp(ctx, op);
      }
    }
  }

  // Remplace tout le dessin par une liste de messages (ex. quand on rejoint une partie en cours)
  function load(messages) {
    ops = [];
    opsById = new Map();

    for (const message of messages) {
      apply(message, false);
    }

    redraw();
  }

  // Redessine tout depuis le début
  function redraw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    for (const op of ops) {
      renderOp(ctx, op);
    }
  }

  // Id des opérations visibles, dans l'ordre
  function visibleIds() {
    return ops.map((op) => op.id);
  }

  return { apply, load, visibleIds };
}

// Dessine une opération entière sur un contexte (utilisé aussi pour les aperçus)
export function renderOp(ctx, op) {
  if (op.kind === 'stroke') {
    for (let i = 0; i < op.points.length; i++) {
      renderStrokeSegment(ctx, op, i);
    }

    if (op.ended) {
      renderStrokeEnd(ctx, op);
    }
  }

  if (op.kind === 'shape') {
    renderShape(ctx, op);
  }

  if (op.kind === 'fill') {
    floodFill(ctx, op);
  }

  if (op.kind === 'clear') {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

// ---------------------------------------------------------------------------
// Traits
// ---------------------------------------------------------------------------

// Dessine le morceau de trait qui arrive au point i.
// Le trait passe par le milieu des points (courbes de Bézier) pour être bien lisse.
function renderStrokeSegment(ctx, op, i) {
  const current = toPixels(ctx, op.points[i]);

  let curve;
  if (i === 0) {
    curve = { start: current, control: current, end: current };
  } else if (i === 1) {
    const first = toPixels(ctx, op.points[0]);
    curve = { start: first, control: first, end: middle(first, current) };
  } else {
    const beforePrevious = toPixels(ctx, op.points[i - 2]);
    const previous = toPixels(ctx, op.points[i - 1]);
    curve = {
      start: middle(beforePrevious, previous),
      control: previous,
      end: middle(previous, current),
    };
  }

  renderCurve(ctx, op, curve, i);
}

// Fin du trait : relie le dernier milieu au dernier point
function renderStrokeEnd(ctx, op) {
  const count = op.points.length;
  if (count < 2) {
    return;
  }

  const last = toPixels(ctx, op.points[count - 1]);
  const beforeLast = toPixels(ctx, op.points[count - 2]);
  const start = middle(beforeLast, last);

  renderCurve(ctx, op, { start: start, control: last, end: last }, count);
}

function renderCurve(ctx, op, curve, index) {
  // Chaque morceau a son propre hasard, calculé à partir du trait : il est le même chez tous les joueurs
  const random = createRandom(op.seed + index * 7919);

  ctx.save();
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (op.brush === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  }

  if (op.brush === 'marker') {
    drawMarker(ctx, curve, op.size);
  } else if (op.brush === 'crayon') {
    drawCrayon(ctx, curve, op.size, random);
  } else if (op.brush === 'spray') {
    drawSpray(ctx, curve, op.size, random);
  } else {
    drawPen(ctx, curve, op.size);
  }

  ctx.restore();
}

// Stylo (et gomme) : trait rond et plein
function drawPen(ctx, curve, size) {
  if (isDot(curve)) {
    ctx.beginPath();
    ctx.arc(curve.start.x, curve.start.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(curve.start.x, curve.start.y);
  ctx.quadraticCurveTo(curve.control.x, curve.control.y, curve.end.x, curve.end.y);
  ctx.stroke();
}

// Feutre : pointe biseautée en diagonale, le trait est fin ou épais selon la direction
function drawMarker(ctx, curve, size) {
  const nibX = (Math.cos(-Math.PI / 4) * size) / 2;
  const nibY = (Math.sin(-Math.PI / 4) * size) / 2;

  ctx.lineWidth = Math.max(1.5, size / 5);
  ctx.beginPath();

  for (const point of samplePoints(curve, 1.5)) {
    ctx.moveTo(point.x - nibX, point.y - nibY);
    ctx.lineTo(point.x + nibX, point.y + nibY);
  }

  ctx.stroke();
}

// Crayon : plein de petits grains, comme une mine sur du papier
function drawCrayon(ctx, curve, size, random) {
  const grainSize = Math.max(1.2, size / 11);
  const grainsPerStep = Math.ceil(size * 0.7);

  ctx.globalAlpha = 0.6;

  for (const point of samplePoints(curve, Math.max(1.5, size / 4))) {
    for (let i = 0; i < grainsPerStep; i++) {
      const angle = random() * Math.PI * 2;
      const distance = (Math.sqrt(random()) * size) / 2;
      const x = point.x + Math.cos(angle) * distance;
      const y = point.y + Math.sin(angle) * distance;
      ctx.fillRect(x - grainSize / 2, y - grainSize / 2, grainSize, grainSize);
    }
  }
}

// Bombe de peinture : des gouttelettes dispersées autour du trait
function drawSpray(ctx, curve, size, random) {
  const radius = size;
  const dotRadius = Math.max(0.8, size / 22);
  const dotsPerStep = Math.ceil(size / 1.6);

  ctx.beginPath();

  for (const point of samplePoints(curve, Math.max(2, size / 3))) {
    for (let i = 0; i < dotsPerStep; i++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius;
      const x = point.x + Math.cos(angle) * distance;
      const y = point.y + Math.sin(angle) * distance;
      ctx.moveTo(x + dotRadius, y);
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    }
  }

  ctx.fill();
}

// Points régulièrement espacés le long d'une courbe (sans le point de départ, déjà dessiné avant)
function samplePoints(curve, step) {
  if (isDot(curve)) {
    return [curve.start];
  }

  const start = curve.start;
  const control = curve.control;
  const end = curve.end;
  const length = distanceBetween(start, control) + distanceBetween(control, end);
  const count = Math.max(1, Math.ceil(length / step));

  const points = [];
  for (let k = 1; k <= count; k++) {
    const t = k / count;
    points.push({
      x: (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * control.x + t * t * end.x,
      y: (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * control.y + t * t * end.y,
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Formes (seulement le contour, avec la couleur et la taille choisies)
// ---------------------------------------------------------------------------

function renderShape(ctx, op) {
  const from = toPixels(ctx, op.from);
  const to = toPixels(ctx, op.to);

  const left = Math.min(from.x, to.x);
  const top = Math.min(from.y, to.y);
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);
  const centerX = left + width / 2;
  const centerY = top + height / 2;

  ctx.save();
  ctx.strokeStyle = op.color;
  ctx.lineWidth = op.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  if (op.shape === 'line') {
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }

  if (op.shape === 'rect') {
    ctx.rect(left, top, width, height);
  }

  if (op.shape === 'ellipse') {
    ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);
  }

  if (op.shape === 'triangle') {
    ctx.moveTo(centerX, top);
    ctx.lineTo(left + width, top + height);
    ctx.lineTo(left, top + height);
    ctx.closePath();
  }

  if (op.shape === 'star') {
    // Étoile à 5 branches qui remplit le cadre (elle descend moins bas qu'elle ne monte)
    const radiusX = width / 1.902;
    const radiusY = height / 1.809;
    for (let k = 0; k < 10; k++) {
      const angle = -Math.PI / 2 + (k * Math.PI) / 5;
      const ratio = k % 2 === 0 ? 1 : 0.45;
      const x = centerX + Math.cos(angle) * radiusX * ratio;
      const y = top + radiusY + Math.sin(angle) * radiusY * ratio;
      if (k === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }

  if (op.shape === 'heart') {
    const right = left + width;
    const bottom = top + height;
    ctx.moveTo(centerX, top + height * 0.28);
    ctx.bezierCurveTo(centerX, top, left, top - height * 0.05, left, top + height * 0.32);
    ctx.bezierCurveTo(
      left,
      top + height * 0.62,
      centerX - width * 0.12,
      top + height * 0.8,
      centerX,
      bottom,
    );
    ctx.bezierCurveTo(
      centerX + width * 0.12,
      top + height * 0.8,
      right,
      top + height * 0.62,
      right,
      top + height * 0.32,
    );
    ctx.bezierCurveTo(right, top - height * 0.05, centerX, top, centerX, top + height * 0.28);
    ctx.closePath();
  }

  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Pot de peinture : remplit la zone fermée autour du point cliqué
// ---------------------------------------------------------------------------

function floodFill(ctx, op) {
  const color = parseHexColor(op.color);
  if (!color) {
    return;
  }

  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const startX = clamp(Math.floor(op.at[0] * width), 0, width - 1);
  const startY = clamp(Math.floor(op.at[1] * height), 0, height - 1);

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const target = premultipliedColor(data, (startY * width + startX) * 4);

  // Déjà de cette couleur : rien à faire
  if (
    target[3] === 255 &&
    target[0] === color[0] &&
    target[1] === color[1] &&
    target[2] === color[2]
  ) {
    return;
  }

  // 1. Repère les pixels de la zone, ligne par ligne
  const filled = new Uint8Array(width * height);

  function matches(x, y) {
    const index = y * width + x;
    return (
      !filled[index] && colorDistance(premultipliedColor(data, index * 4), target) <= FILL_TOLERANCE
    );
  }

  const stack = [startX, startY];
  while (stack.length > 0) {
    const y = stack.pop();
    let x = stack.pop();

    while (x > 0 && matches(x - 1, y)) {
      x--;
    }

    let aboveAdded = false;
    let belowAdded = false;

    while (x < width && matches(x, y)) {
      filled[y * width + x] = 1;

      if (y > 0) {
        const aboveMatches = matches(x, y - 1);
        if (aboveMatches && !aboveAdded) {
          stack.push(x, y - 1);
        }
        aboveAdded = aboveMatches;
      }

      if (y < height - 1) {
        const belowMatches = matches(x, y + 1);
        if (belowMatches && !belowAdded) {
          stack.push(x, y + 1);
        }
        belowAdded = belowMatches;
      }

      x++;
    }
  }

  // 2. Colore la zone, et glisse la couleur sous les bords adoucis pour ne pas laisser de liseré blanc
  for (let index = 0; index < width * height; index++) {
    const k = index * 4;

    if (filled[index]) {
      data[k] = color[0];
      data[k + 1] = color[1];
      data[k + 2] = color[2];
      data[k + 3] = 255;
      continue;
    }

    const x = index % width;
    const touchesZone =
      (x > 0 && filled[index - 1]) ||
      (x < width - 1 && filled[index + 1]) ||
      filled[index - width] ||
      filled[index + width];

    if (touchesZone) {
      const alpha = data[k + 3] / 255;
      data[k] = data[k] * alpha + color[0] * (1 - alpha);
      data[k + 1] = data[k + 1] * alpha + color[1] * (1 - alpha);
      data[k + 2] = data[k + 2] * alpha + color[2] * (1 - alpha);
      data[k + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
}

// Couleur d'un pixel, avec le rouge/vert/bleu multipliés par l'opacité (un pixel transparent = 0,0,0,0)
function premultipliedColor(data, k) {
  const alpha = data[k + 3];
  return [(data[k] * alpha) / 255, (data[k + 1] * alpha) / 255, (data[k + 2] * alpha) / 255, alpha];
}

function colorDistance(a, b) {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
    Math.abs(a[3] - b[3]),
  );
}

// « #ff8800 » → [255, 136, 0] (null si la couleur n'est pas valide)
function parseHexColor(hex) {
  if (typeof hex !== 'string' || hex.length !== 7 || hex[0] !== '#') {
    return null;
  }

  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);

  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) {
    return null;
  }

  return [red, green, blue];
}

// ---------------------------------------------------------------------------
// Petits outils
// ---------------------------------------------------------------------------

// Les points voyagent entre 0 et 1 (fraction de la largeur / hauteur) : on les remet en pixels
function toPixels(ctx, point) {
  return { x: point[0] * ctx.canvas.width, y: point[1] * ctx.canvas.height };
}

function middle(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isDot(curve) {
  return curve.start.x === curve.end.x && curve.start.y === curve.end.y;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Générateur de hasard « avec graine » (méthode de Park et Miller) :
// la même graine donne toujours la même suite de nombres entre 0 et 1, chez tous les joueurs
function createRandom(seed) {
  let state = (seed % 2147483646) + 1;

  return function () {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}
