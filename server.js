const fs = require('fs');
const http = require('http');
const path = require('path');
const { randomUUID } = require('crypto');

const GRID_WIDTH = 50;
const GRID_HEIGHT = 40;
const PUBLIC_DIR = path.join(__dirname, 'public');

const state = {
  players: {},
  blocks: {},
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomSpawn() {
  return {
    x: Math.floor(Math.random() * GRID_WIDTH),
    y: Math.floor(Math.random() * GRID_HEIGHT),
  };
}

function createPlayer() {
  const spawn = randomSpawn();
  return {
    id: randomUUID(),
    x: spawn.x,
    y: spawn.y,
    color: `hsl(${Math.floor(Math.random() * 360)} 85% 60%)`,
    updatedAt: Date.now(),
  };
}

function serializeState() {
  return {
    grid: { width: GRID_WIDTH, height: GRID_HEIGHT },
    players: Object.values(state.players),
    blocks: Object.values(state.blocks),
  };
}

function sendJson(res, code, payload) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function applyAction(player, action) {
  switch (action) {
    case 'up':
      player.y = clamp(player.y - 1, 0, GRID_HEIGHT - 1);
      break;
    case 'down':
      player.y = clamp(player.y + 1, 0, GRID_HEIGHT - 1);
      break;
    case 'left':
      player.x = clamp(player.x - 1, 0, GRID_WIDTH - 1);
      break;
    case 'right':
      player.x = clamp(player.x + 1, 0, GRID_WIDTH - 1);
      break;
    case 'place': {
      const key = `${player.x},${player.y}`;
      state.blocks[key] = { key, x: player.x, y: player.y, color: player.color };
      break;
    }
    case 'remove': {
      const key = `${player.x},${player.y}`;
      delete state.blocks[key];
      break;
    }
    default:
      return false;
  }

  player.updatedAt = Date.now();
  return true;
}

function serveStatic(req, res) {
  let targetPath = req.url === '/' ? '/index.html' : req.url;
  targetPath = targetPath.split('?')[0];
  const filePath = path.normalize(path.join(PUBLIC_DIR, targetPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
    };

    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain; charset=utf-8' });
    res.end(content);
  });
}

setInterval(() => {
  const timeout = Date.now() - 60_000;
  for (const [id, player] of Object.entries(state.players)) {
    if (player.updatedAt < timeout) delete state.players[id];
  }
}, 5000);

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/join') {
    const player = createPlayer();
    state.players[player.id] = player;
    sendJson(res, 200, { playerId: player.id, state: serializeState() });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/state')) {
    sendJson(res, 200, serializeState());
    return;
  }

  if (req.method === 'POST' && req.url === '/api/action') {
    try {
      const body = await readBody(req);
      const player = state.players[body.playerId];
      if (!player) {
        sendJson(res, 404, { error: 'Player not found' });
        return;
      }

      if (!applyAction(player, body.action)) {
        sendJson(res, 400, { error: 'Unsupported action' });
        return;
      }

      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  serveStatic(req, res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`Game server running at http://localhost:${PORT}`);
});
