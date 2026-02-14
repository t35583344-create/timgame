const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const CELL = 20;
const state = {
  selfId: null,
  grid: { width: 50, height: 40 },
  players: new Map(),
  blocks: new Map(),
};

const i18n = {
  en: {
    title: 'Cube Grid Online',
    description: 'Multiplayer sandbox: move with WASD, place and remove blocks.',
    move: 'WASD — move',
    place: 'Q or Left click — place block',
    remove: 'E or Right click — remove block',
    grid: 'Grid: 50 × 40',
    connecting: 'Connecting...',
    online: 'Connected. Players online:',
  },
  ru: {
    title: 'Cube Grid Online',
    description: 'Multiplayer-песочница: двигайтесь на WASD, ставьте блоки и удаляйте их.',
    move: 'WASD — движение',
    place: 'Q или ЛКМ — поставить блок',
    remove: 'E или ПКМ — удалить блок',
    grid: 'Сетка: 50 × 40',
    connecting: 'Подключение...',
    online: 'Подключено. Игроков онлайн:',
  },
  es: {
    title: 'Cube Grid Online',
    description: 'Sandbox multijugador: muévete con WASD, coloca y quita bloques.',
    move: 'WASD — mover',
    place: 'Q o clic izquierdo — colocar bloque',
    remove: 'E o clic derecho — quitar bloque',
    grid: 'Cuadrícula: 50 × 40',
    connecting: 'Conectando...',
    online: 'Conectado. Jugadores en línea:',
  },
};

function locale() {
  const lang = (navigator.language || 'en').split('-')[0];
  return i18n[lang] || i18n.en;
}

function applyI18n() {
  const loc = locale();
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (loc[key]) el.textContent = loc[key];
  });
}

function updateStatus() {
  statusEl.textContent = `${locale().online} ${state.players.size}`;
}

function drawGrid() {
  const { width, height } = state.grid;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0d1324';
  ctx.fillRect(0, 0, width * CELL, height * CELL);

  ctx.strokeStyle = '#1e2744';
  for (let x = 0; x <= width; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5, height * CELL);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL + 0.5);
    ctx.lineTo(width * CELL, y * CELL + 0.5);
    ctx.stroke();
  }
}

function drawBlocks() {
  state.blocks.forEach((block) => {
    ctx.fillStyle = block.color;
    ctx.fillRect(block.x * CELL + 2, block.y * CELL + 2, CELL - 4, CELL - 4);
  });
}

function drawPlayers() {
  state.players.forEach((player) => {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x * CELL + 3, player.y * CELL + 3, CELL - 6, CELL - 6);

    if (player.id === state.selfId) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(player.x * CELL + 3, player.y * CELL + 3, CELL - 6, CELL - 6);
    }
  });
}

function render() {
  drawGrid();
  drawBlocks();
  drawPlayers();
}

function replace(players, blocks) {
  state.players = new Map(players.map((p) => [p.id, p]));
  state.blocks = new Map(blocks.map((b) => [b.key, b]));
  updateStatus();
  render();
}

async function sendAction(action) {
  if (!state.selfId) return;
  await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId: state.selfId, action }),
  });
}

async function pollState() {
  const response = await fetch('/api/state', { cache: 'no-store' });
  const snapshot = await response.json();
  state.grid = snapshot.grid;
  replace(snapshot.players, snapshot.blocks);
}

async function connect() {
  const response = await fetch('/api/join', { method: 'POST' });
  const payload = await response.json();
  state.selfId = payload.playerId;
  state.grid = payload.state.grid;
  replace(payload.state.players, payload.state.blocks);
  setInterval(pollState, 120);
}

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'w') sendAction('up');
  if (key === 'a') sendAction('left');
  if (key === 's') sendAction('down');
  if (key === 'd') sendAction('right');
  if (key === 'q') sendAction('place');
  if (key === 'e') sendAction('remove');
});

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0) sendAction('place');
  if (event.button === 2) sendAction('remove');
});

applyI18n();
connect();
render();
