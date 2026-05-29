const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/levels', express.static(path.join(__dirname, 'levels')));
app.use('/music', express.static(path.join(__dirname, 'music')));
app.use('/sound', express.static(path.join(__dirname, 'sound')));
app.use('/prefabs', express.static(path.join(__dirname, 'prefabs')));

let activeLevel = 'level_1.glb';

app.get('/api/levels', (req, res) => {
  try {
    const files = fs.readdirSync(path.join(__dirname, 'levels')).filter(f => f.endsWith('.glb'));
    res.json(files);
  } catch (e) {
    res.json(['level_1.glb']);
  }
});

app.get('/api/game-state', (req, res) => {
  res.json({ playerCount: readyIds.size, activeLevel });
});

const players = {};
const readyIds = new Set();
const COLORS = ['#ff4444', '#4488ff', '#44cc44', '#ffcc00'];
let colorIndex = 0;

const LEVEL_SPAWN_POINTS = {
  'level_1.glb': [
    { x: -39.64, y: 0.53, z: -31.33 },
    { x: -78.69, y: 0.53, z: -61.07 },
    { x: -57.51, y: 7.10, z: -60.48 },
    { x: -2.64, y: 0.53, z: -255.53 },
    { x: -46.90, y: 0.53, z: -309.56 },
    { x: -49.36, y: 0.46, z: -193.42 },
    { x: 46.60, y: 15.12, z: -173.82 },
    { x: 22.30, y: 0.53, z: -89.89 },
    { x: -81.11, y: 3.84, z: -464.15 },
    { x: -76.45, y: 0.53, z: -383.61 },
    { x: -60.66, y: 10.85, z: -160.14 },
    { x: -15.82, y: 35.39, z: -24.13 },
  ],
  'level_2.glb': [
    { x: -4.43, y: 161.88, z: -21.1 },
    { x: -5.72, y: 160.66, z: -3.36 },
    { x: 22.12, y: 168.59, z: 3.8 },
    { x: 24.99, y: 160.97, z: 3.07 },
    { x: -27.36, y: 161.88, z: 3.34 },
    { x: -27.66, y: 149.69, z: -28.19 },
    { x: -4.56, y: 145.73, z: -17.8 },
    { x: -4.86, y: 154.87, z: 1.14 },
    { x: 12.11, y: 160.05, z: 22.92 },
    { x: 37.7, y: 163.56, z: 20.13 },
    { x: 37.88, y: 163.56, z: -5.22 },
    { x: -34.88, y: 161.88, z: 18.03 },
    { x: 16.88, y: 151.22, z: 22.6 },
    { x: 13.89, y: 155.79, z: -3.39 },
  ],
};
function getSpawnPoints() { return LEVEL_SPAWN_POINTS[activeLevel] || LEVEL_SPAWN_POINTS['level_1.glb']; }
function randomSpawn() { const pts = getSpawnPoints(); return pts[Math.floor(Math.random() * pts.length)]; }

// --- Pedestal state ---
const pedestals = [];

// --- Oddball state ---
let holderID = null;
const scores = {};
let tagCooldownUntil = 0;
const TAG_COOLDOWN_MS = 4000;

function pickRandomHolder() {
  const ids = Object.keys(players);
  if (ids.length === 0) { holderID = null; return; }
  holderID = ids[Math.floor(Math.random() * ids.length)];
  tagCooldownUntil = Date.now() + TAG_COOLDOWN_MS;
  io.emit('holderChanged', holderID);
  io.emit('tagCooldown', TAG_COOLDOWN_MS);
  io.emit('scores', scores);
}

// Score tick — holder gains 1 point per second
setInterval(() => {
  if (holderID && players[holderID]) {
    scores[holderID] = (scores[holderID] || 0) + 1;
    io.emit('scores', scores);
  }
}, 1000);

// Server-side inactivity tracking
const lastActivity = {};
const INACTIVITY_LIMIT = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const id of readyIds) {
    if (lastActivity[id] && now - lastActivity[id] > INACTIVITY_LIMIT) {
      console.log(`Kicking idle player: ${id}`);
      const sock = io.sockets.sockets.get(id);
      if (sock) sock.emit('kicked', 'inactivity');
      if (sock) sock.disconnect(true);
    }
  }
}, 30000);

io.on('connection', (socket) => {
  const color = COLORS[colorIndex % COLORS.length];
  colorIndex++;

  const sp = randomSpawn();
  players[socket.id] = { x: sp.x, y: sp.y, z: sp.z, color, type: 'box', name: 'Player', shape: 'box', skinColor: color, skinImage: '' };
  scores[socket.id] = 0;

  socket.on('selectLevel', (level) => {
    if (typeof level === 'string' && level.endsWith('.glb')) {
      const othersReady = [...readyIds].filter(id => id !== socket.id).length;
      if (othersReady === 0) {
        activeLevel = level;
        io.emit('levelChanged', activeLevel);
      }
    }
  });

  socket.on('setType', (type) => {
    if (type === 'ball' || type === 'box') players[socket.id].type = type;
  });

  socket.on('setName', (name) => {
    if (typeof name === 'string') players[socket.id].name = name.slice(0, 16) || 'Player';
  });

  socket.on('setAppearance', (data) => {
    if (!players[socket.id]) return;
    if (data.shape) players[socket.id].shape = data.shape;
    if (data.skinColor) players[socket.id].skinColor = data.skinColor;
    if (typeof data.skinImage === 'string') players[socket.id].skinImage = data.skinImage.slice(0, 500);
  });

  socket.on('ready', () => {
    readyIds.add(socket.id);
    lastActivity[socket.id] = Date.now();
    console.log(`Player connected: ${socket.id} (${players[socket.id].name}, ${players[socket.id].shape})`);
    socket.emit('currentPlayers', { players, selfId: socket.id });
    socket.emit('holderChanged', holderID);
    socket.emit('scores', scores);
    socket.emit('currentPedestals', pedestals);
    socket.broadcast.emit('newPlayer', { id: socket.id, ...players[socket.id] });

    // First player becomes holder
    if (!holderID) pickRandomHolder();
  });

  socket.on('playerMoved', (data) => {
    if (!players[socket.id]) return;
    lastActivity[socket.id] = Date.now();
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].z = data.z;
    players[socket.id].qx = data.qx || 0;
    players[socket.id].qy = data.qy || 0;
    players[socket.id].qz = data.qz || 0;
    players[socket.id].qw = data.qw || 1;
    players[socket.id].smoothing = data.smoothing;
    players[socket.id].godmode = !!data.godmode;
    socket.broadcast.emit('playerMoved', {
      id: socket.id, x: data.x, y: data.y, z: data.z,
      qx: data.qx, qy: data.qy, qz: data.qz, qw: data.qw,
      smoothing: data.smoothing, godmode: !!data.godmode
    });
  });

  socket.on('placePedestal', (data) => {
    if (!players[socket.id]) return;
    const ped = { x: data.x, y: data.y, z: data.z, id: Date.now() + '_' + socket.id };
    pedestals.push(ped);
    io.emit('pedestalPlaced', ped);
    console.log(`PEDESTAL PLACED at (${ped.x.toFixed(2)}, ${ped.y.toFixed(2)}, ${ped.z.toFixed(2)}) by ${players[socket.id].name}`);
  });

  socket.on('removePedestal', (pedId) => {
    const idx = pedestals.findIndex(p => p.id === pedId);
    if (idx !== -1) {
      pedestals.splice(idx, 1);
      io.emit('pedestalRemoved', pedId);
    }
  });

  socket.on('tagPlayer', (targetId) => {
    if (socket.id !== holderID) return;
    if (!players[targetId]) return;
    const now = Date.now();
    if (now < tagCooldownUntil) return;
    holderID = targetId;
    tagCooldownUntil = now + TAG_COOLDOWN_MS;
    io.emit('holderChanged', holderID);
    io.emit('tagCooldown', TAG_COOLDOWN_MS);
  });

  socket.on('jump', () => {
    socket.broadcast.emit('playerJumped', socket.id);
  });

  socket.on('sprintStart', () => {
    socket.broadcast.emit('playerSprintStart', socket.id);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    readyIds.delete(socket.id);
    delete players[socket.id];
    delete scores[socket.id];
    delete lastActivity[socket.id];
    if (holderID === socket.id) pickRandomHolder();
    io.emit('playerDisconnected', socket.id);
    io.emit('scores', scores);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
