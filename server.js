const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/levels', express.static(path.join(__dirname, 'levels')));

const players = {};
const COLORS = ['#ff4444', '#4488ff', '#44cc44', '#ffcc00'];
let colorIndex = 0;

// --- Oddball state ---
let holderID = null;
const scores = {};

function pickRandomHolder() {
  const ids = Object.keys(players);
  if (ids.length === 0) { holderID = null; return; }
  holderID = ids[Math.floor(Math.random() * ids.length)];
  io.emit('holderChanged', holderID);
  io.emit('scores', scores);
}

// Score tick — holder gains 1 point per second
setInterval(() => {
  if (holderID && players[holderID]) {
    scores[holderID] = (scores[holderID] || 0) + 1;
    io.emit('scores', scores);
  }
}, 1000);

io.on('connection', (socket) => {
  const color = COLORS[colorIndex % COLORS.length];
  colorIndex++;

  players[socket.id] = { x: 0, y: 45, z: 0, color, type: 'box', name: 'Player', shape: 'box', skinColor: color, skinImage: '' };
  scores[socket.id] = 0;

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
    console.log(`Player connected: ${socket.id} (${players[socket.id].name}, ${players[socket.id].shape})`);
    socket.emit('currentPlayers', { players, selfId: socket.id });
    socket.emit('holderChanged', holderID);
    socket.emit('scores', scores);
    socket.broadcast.emit('newPlayer', { id: socket.id, ...players[socket.id] });

    // First player becomes holder
    if (!holderID) pickRandomHolder();
  });

  socket.on('playerMoved', (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].z = data.z;
    players[socket.id].qx = data.qx || 0;
    players[socket.id].qy = data.qy || 0;
    players[socket.id].qz = data.qz || 0;
    players[socket.id].qw = data.qw || 1;
    socket.broadcast.emit('playerMoved', {
      id: socket.id, x: data.x, y: data.y, z: data.z,
      qx: data.qx, qy: data.qy, qz: data.qz, qw: data.qw
    });
  });

  socket.on('tagPlayer', (targetId) => {
    // Only holder can tag to pass the oddball
    if (socket.id !== holderID) return;
    if (!players[targetId]) return;
    holderID = targetId;
    io.emit('holderChanged', holderID);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    delete scores[socket.id];
    if (holderID === socket.id) pickRandomHolder();
    io.emit('playerDisconnected', socket.id);
    io.emit('scores', scores);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
