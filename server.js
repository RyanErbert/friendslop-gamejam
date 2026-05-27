const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const players = {};
const COLORS = ['#ff4444', '#4488ff', '#44cc44', '#ffcc00'];
let colorIndex = 0;

io.on('connection', (socket) => {
  const color = COLORS[colorIndex % COLORS.length];
  colorIndex++;

  players[socket.id] = { x: 0, y: 0.5, z: 0, color, type: 'box', name: 'Player' };

  socket.on('setType', (type) => {
    if (type === 'ball' || type === 'box') {
      players[socket.id].type = type;
    }
  });

  socket.on('setName', (name) => {
    if (typeof name === 'string') {
      players[socket.id].name = name.slice(0, 16) || 'Player';
    }
  });

  socket.on('ready', () => {
    console.log(`Player connected: ${socket.id} (${players[socket.id].name}, ${color}, ${players[socket.id].type})`);
    socket.emit('currentPlayers', { players, selfId: socket.id });
    socket.broadcast.emit('newPlayer', {
      id: socket.id,
      ...players[socket.id]
    });
  });

  socket.on('playerMoved', (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].z = data.z;
    socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y, z: data.z });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
