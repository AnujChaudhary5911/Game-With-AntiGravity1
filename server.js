const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const MAPS = ['jungle', 'space', 'lava', 'ice'];

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createPlayer(id, name, x, y, color) {
  return { id, name, x, y, color, vx: 0, vy: 0, hp: 100, ammo: 30, kills: 0, deaths: 0, angle: 0, grounded: false, alive: true, jetpack: 100 };
}

function createBullet(id, x, y, vx, vy, ownerId) {
  return { id, x, y, vx, vy, ownerId, life: 80 };
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('create_room', ({ name }) => {
    const code = generateRoomCode();
    const mapId = MAPS[Math.floor(Math.random() * MAPS.length)];
    rooms[code] = {
      code, mapId, started: false,
      players: {},
      bullets: {},
      host: socket.id,
      bulletCounter: 0
    };
    const color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');
    rooms[code].players[socket.id] = createPlayer(socket.id, name, 200, 300, color);
    socket.join(code);
    socket.roomCode = code;
    socket.emit('room_created', { code, mapId, player: rooms[code].players[socket.id], players: rooms[code].players });
  });

  socket.on('join_room', ({ code, name }) => {
    code = code.toUpperCase();
    if (!rooms[code]) return socket.emit('error', 'Room not found!');
    if (rooms[code].started) return socket.emit('error', 'Game already started!');
    if (Object.keys(rooms[code].players).length >= 6) return socket.emit('error', 'Room full!');
    const color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');
    const spawnX = 200 + Object.keys(rooms[code].players).length * 120;
    rooms[code].players[socket.id] = createPlayer(socket.id, name, spawnX, 300, color);
    socket.join(code);
    socket.roomCode = code;
    socket.emit('room_joined', { code, mapId: rooms[code].mapId, player: rooms[code].players[socket.id], players: rooms[code].players });
    socket.to(code).emit('player_joined', { player: rooms[code].players[socket.id] });
  });

  socket.on('start_game', () => {
    const code = socket.roomCode;
    if (!rooms[code] || rooms[code].host !== socket.id) return;
    rooms[code].started = true;
    io.to(code).emit('game_started', { mapId: rooms[code].mapId, players: rooms[code].players });
  });

  socket.on('player_update', (data) => {
    const code = socket.roomCode;
    if (!rooms[code] || !rooms[code].players[socket.id]) return;
    const p = rooms[code].players[socket.id];
    p.x = data.x; p.y = data.y; p.vx = data.vx; p.vy = data.vy;
    p.angle = data.angle; p.grounded = data.grounded; p.jetpack = data.jetpack;
    socket.to(code).emit('player_moved', { id: socket.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle, grounded: p.grounded, jetpack: p.jetpack });
  });

  socket.on('shoot', (data) => {
    const code = socket.roomCode;
    if (!rooms[code] || !rooms[code].players[socket.id]) return;
    const p = rooms[code].players[socket.id];
    if (p.ammo <= 0 || !p.alive) return;
    p.ammo--;
    const bid = ++rooms[code].bulletCounter;
    const bullet = createBullet(bid, data.x, data.y, data.vx, data.vy, socket.id);
    rooms[code].bullets[bid] = bullet;
    io.to(code).emit('bullet_fired', bullet);
    setTimeout(() => { if (rooms[code] && rooms[code].bullets[bid]) delete rooms[code].bullets[bid]; }, 2000);
  });

  socket.on('bullet_hit', ({ bulletId, targetId }) => {
    const code = socket.roomCode;
    if (!rooms[code]) return;
    const room = rooms[code];
    if (!room.bullets[bulletId]) return;
    const shooter = room.players[room.bullets[bulletId].ownerId];
    const target = room.players[targetId];
    if (!target || !target.alive) return;
    delete room.bullets[bulletId];
    target.hp -= 25;
    io.to(code).emit('player_hit', { targetId, hp: target.hp, shooterId: shooter?.id });
    if (target.hp <= 0) {
      target.alive = false; target.hp = 0; target.deaths++;
      if (shooter) shooter.kills++;
      io.to(code).emit('player_killed', { targetId, killerId: shooter?.id, kills: shooter?.kills });
      setTimeout(() => {
        if (rooms[code] && rooms[code].players[targetId]) {
          rooms[code].players[targetId].hp = 100;
          rooms[code].players[targetId].alive = true;
          rooms[code].players[targetId].ammo = 30;
          rooms[code].players[targetId].x = 200 + Math.random()*400;
          rooms[code].players[targetId].y = 200;
          io.to(code).emit('player_respawned', rooms[code].players[targetId]);
        }
      }, 3000);
    }
  });

  socket.on('ammo_reload', () => {
    const code = socket.roomCode;
    if (!rooms[code] || !rooms[code].players[socket.id]) return;
    rooms[code].players[socket.id].ammo = 30;
    socket.emit('ammo_updated', { ammo: 30 });
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (!rooms[code]) return;
    delete rooms[code].players[socket.id];
    socket.to(code).emit('player_left', { id: socket.id });
    if (Object.keys(rooms[code].players).length === 0) delete rooms[code];
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`BattleZone server running on port ${PORT}`));
