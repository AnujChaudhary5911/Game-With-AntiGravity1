// ─── SOCKET & STATE ──────────────────────────────────────────────────────────
const socket = io();
let myId = null, myRoom = null, myMapId = null, isHost = false;
let players = {}, bullets = {}, localPlayer = null;
let gameRunning = false;

// ─── KEYS ────────────────────────────────────────────────────────────────────
const keys = { left: false, right: false, up: false, jet: false };
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') keys.up = true;
  if (e.key === 'Shift') keys.jet = true;
  if (e.key === 'f' || e.key === 'F') mobileShoot();
  if (e.key === 'r' || e.key === 'R') reload();
});
document.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') keys.up = false;
  if (e.key === 'Shift') keys.jet = false;
});

// ─── MOUSE AIM ───────────────────────────────────────────────────────────────
let mouseX = 400, mouseY = 300;
document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
document.addEventListener('mousedown', e => { if (e.button === 0 && gameRunning) mobileShoot(); });

// ─── SCREEN HELPERS ──────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById(id).style.display = 'flex';
}
function showJoin() { document.getElementById('joinBox').classList.toggle('hidden'); }
function copyCode() { navigator.clipboard.writeText(myRoom); }

// ─── LOBBY ACTIONS ────────────────────────────────────────────────────────────
function createRoom() {
  const name = document.getElementById('playerName').value.trim() || 'Soldier';
  socket.emit('create_room', { name });
}
function joinRoom() {
  const name = document.getElementById('playerName').value.trim() || 'Soldier';
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!code) return setMsg('lobbyMsg', 'Enter a room code!');
  socket.emit('join_room', { code, name });
}
function startGame() { socket.emit('start_game'); }
function reload() { socket.emit('ammo_reload'); }
function setMsg(id, txt) { document.getElementById(id).textContent = txt; }

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────
socket.on('room_created', ({ code, mapId, player, players: ps }) => {
  myId = socket.id; myRoom = code; myMapId = mapId; isHost = true;
  players = ps; localPlayer = players[myId];
  document.getElementById('displayCode').textContent = code;
  document.getElementById('mapName').textContent = mapId.toUpperCase();
  document.getElementById('hostControls').classList.remove('hidden');
  updatePlayerList();
  showScreen('waiting');
});

socket.on('room_joined', ({ code, mapId, player, players: ps }) => {
  myId = socket.id; myRoom = code; myMapId = mapId; isHost = false;
  players = ps; localPlayer = players[myId];
  document.getElementById('displayCode').textContent = code;
  document.getElementById('mapName').textContent = mapId.toUpperCase();
  document.getElementById('hostControls').classList.add('hidden');
  updatePlayerList();
  showScreen('waiting');
});

socket.on('player_joined', ({ player }) => {
  players[player.id] = player;
  updatePlayerList();
  setMsg('waitMsg', `${player.name} joined!`);
  setTimeout(() => setMsg('waitMsg', ''), 2000);
});

socket.on('game_started', ({ mapId, players: ps }) => {
  myMapId = mapId; players = ps; localPlayer = players[myId];
  initGame();
  showScreen('gameScreen');
  gameRunning = true;
});

socket.on('player_moved', ({ id, x, y, vx, vy, angle, grounded, jetpack }) => {
  if (players[id]) Object.assign(players[id], { x, y, vx, vy, angle, grounded, jetpack });
});

socket.on('bullet_fired', (b) => { bullets[b.id] = { ...b }; });

socket.on('player_hit', ({ targetId, hp }) => {
  if (players[targetId]) players[targetId].hp = hp;
  if (targetId === myId && localPlayer) { localPlayer.hp = hp; updateHUD(); }
});

socket.on('player_killed', ({ targetId, killerId }) => {
  const killer = players[killerId]; const victim = players[targetId];
  if (players[targetId]) players[targetId].alive = false;
  if (killer && victim) showKillFeed(`${killer.name} ☠️ ${victim.name}`);
  if (targetId === myId) showDeathScreen();
});

socket.on('player_respawned', (p) => {
  players[p.id] = { ...players[p.id], ...p };
  if (p.id === myId) { localPlayer = players[myId]; hideDeathScreen(); updateHUD(); }
});

socket.on('ammo_updated', ({ ammo }) => { if (localPlayer) { localPlayer.ammo = ammo; updateHUD(); } });
socket.on('player_left', ({ id }) => { delete players[id]; });
socket.on('error', (msg) => setMsg('lobbyMsg', '❌ ' + msg));

// ─── WAITING ROOM UI ─────────────────────────────────────────────────────────
function updatePlayerList() {
  const ul = document.getElementById('playerList');
  ul.innerHTML = Object.values(players).map(p =>
    `<div class="player-item"><div class="player-dot" style="background:${p.color}"></div><span>${p.name}</span>${p.id === myId ? ' <span style="color:#fbbf24;font-size:.75rem">(You)</span>' : ''}</div>`
  ).join('');
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD() {
  if (!localPlayer) return;
  const hp = Math.max(0, localPlayer.hp);
  document.getElementById('hpFill').style.width = hp + '%';
  document.getElementById('hpText').textContent = hp;
  const hpEl = document.getElementById('hpFill');
  hpEl.style.background = hp > 60 ? 'linear-gradient(90deg,#22c55e,#86efac)' : hp > 30 ? 'linear-gradient(90deg,#eab308,#fde047)' : 'linear-gradient(90deg,#ef4444,#fca5a5)';
  document.getElementById('jpFill').style.width = localPlayer.jetpack + '%';
  document.getElementById('ammoCount').textContent = localPlayer.ammo;
  document.getElementById('killCount').textContent = localPlayer.kills || 0;
}

let killFeedTimer;
function showKillFeed(msg) {
  const el = document.getElementById('killFeed');
  el.textContent = msg;
  clearTimeout(killFeedTimer);
  killFeedTimer = setTimeout(() => el.textContent = '', 3000);
}

let respawnInterval;
function showDeathScreen() {
  const ds = document.getElementById('deathScreen');
  ds.classList.remove('hidden');
  let t = 3;
  document.getElementById('respawnTimer').textContent = t;
  clearInterval(respawnInterval);
  respawnInterval = setInterval(() => { t--; document.getElementById('respawnTimer').textContent = t; if (t <= 0) clearInterval(respawnInterval); }, 1000);
}
function hideDeathScreen() { document.getElementById('deathScreen').classList.add('hidden'); }

// ─── MAPS DEFINITION ─────────────────────────────────────────────────────────
const MAPS = {
  jungle: {
    bg: ['#0a1a0f', '#1a3d2b'], clouds: '#1a4d2a',
    platforms: [
      { x: 0,    y: 520, w: 200, h: 20, c: '#2d6a4f' },
      { x: 220,  y: 440, w: 160, h: 20, c: '#2d6a4f' },
      { x: 450,  y: 370, w: 200, h: 20, c: '#2d6a4f' },
      { x: 700,  y: 440, w: 160, h: 20, c: '#2d6a4f' },
      { x: 900,  y: 520, w: 200, h: 20, c: '#2d6a4f' },
      { x: 100,  y: 300, w: 140, h: 20, c: '#40916c' },
      { x: 550,  y: 240, w: 180, h: 20, c: '#40916c' },
      { x: 800,  y: 300, w: 140, h: 20, c: '#40916c' },
      { x: 350,  y: 160, w: 160, h: 20, c: '#52b788' },
      { x: 0,    y: 560, w: 1100, h: 40, c: '#1b4332' },
    ],
    decorations: [
      { type: 'tree', x: 50,  y: 460 }, { type: 'tree', x: 920, y: 460 },
      { type: 'tree', x: 500, y: 310 }, { type: 'bush', x: 300, y: 540 },
      { type: 'bush', x: 700, y: 420 },
    ]
  },
  space: {
    bg: ['#020010', '#0a0520'], clouds: '#1a0a3a',
    platforms: [
      { x: 0,    y: 530, w: 180, h: 18, c: '#4a1d96' },
      { x: 240,  y: 460, w: 140, h: 18, c: '#5b21b6' },
      { x: 450,  y: 380, w: 200, h: 18, c: '#6d28d9' },
      { x: 720,  y: 460, w: 140, h: 18, c: '#5b21b6' },
      { x: 920,  y: 530, w: 180, h: 18, c: '#4a1d96' },
      { x: 80,   y: 310, w: 150, h: 18, c: '#7c3aed' },
      { x: 560,  y: 250, w: 160, h: 18, c: '#7c3aed' },
      { x: 830,  y: 310, w: 150, h: 18, c: '#7c3aed' },
      { x: 330,  y: 170, w: 200, h: 18, c: '#8b5cf6' },
      { x: 0,    y: 560, w: 1100, h: 40, c: '#2e1065' },
    ],
    decorations: []
  },
  lava: {
    bg: ['#1a0400', '#3d0900'], clouds: '#4a1000',
    platforms: [
      { x: 0,    y: 510, w: 190, h: 20, c: '#78350f' },
      { x: 230,  y: 440, w: 150, h: 20, c: '#92400e' },
      { x: 440,  y: 360, w: 210, h: 20, c: '#b45309' },
      { x: 710,  y: 440, w: 150, h: 20, c: '#92400e' },
      { x: 910,  y: 510, w: 190, h: 20, c: '#78350f' },
      { x: 90,   y: 300, w: 140, h: 20, c: '#d97706' },
      { x: 560,  y: 240, w: 170, h: 20, c: '#f59e0b' },
      { x: 820,  y: 300, w: 140, h: 20, c: '#d97706' },
      { x: 340,  y: 160, w: 160, h: 20, c: '#fbbf24' },
      { x: 0,    y: 555, w: 1100, h: 45, c: '#450a00' },
    ],
    decorations: []
  },
  ice: {
    bg: ['#0c1e2e', '#0f3460'], clouds: '#143d60',
    platforms: [
      { x: 0,    y: 520, w: 200, h: 20, c: '#93c5fd' },
      { x: 230,  y: 450, w: 150, h: 20, c: '#bfdbfe' },
      { x: 450,  y: 370, w: 200, h: 20, c: '#dbeafe' },
      { x: 710,  y: 450, w: 150, h: 20, c: '#bfdbfe' },
      { x: 920,  y: 520, w: 200, h: 20, c: '#93c5fd' },
      { x: 100,  y: 310, w: 140, h: 20, c: '#60a5fa' },
      { x: 560,  y: 250, w: 170, h: 20, c: '#60a5fa' },
      { x: 820,  y: 310, w: 140, h: 20, c: '#60a5fa' },
      { x: 340,  y: 170, w: 180, h: 20, c: '#3b82f6' },
      { x: 0,    y: 560, w: 1100, h: 40, c: '#1e3a5f' },
    ],
    decorations: []
  }
};

// ─── GAME ENGINE ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let camX = 0, camY = 0;
let map = null;
let lastShot = 0;
let stars = [];

function initGame() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  map = MAPS[myMapId] || MAPS.jungle;
  if (myMapId === 'space') {
    for (let i = 0; i < 120; i++) stars.push({ x: Math.random()*1100, y: Math.random()*600, r: Math.random()*2+0.3 });
  }
  requestAnimationFrame(gameLoop);
}

window.addEventListener('resize', () => {
  if (gameRunning) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
});

// ─── SHOOTING ────────────────────────────────────────────────────────────────
function mobileShoot() {
  if (!gameRunning || !localPlayer || !localPlayer.alive) return;
  if (localPlayer.ammo <= 0) return;
  const now = Date.now();
  if (now - lastShot < 200) return;
  lastShot = now;
  const px = localPlayer.x + 16, py = localPlayer.y + 16;
  let tx = mouseX + camX, ty = mouseY + camY;
  const dx = tx - px, dy = ty - py;
  const dist = Math.hypot(dx, dy) || 1;
  localPlayer.angle = Math.atan2(dy, dx);
  localPlayer.ammo--;
  updateHUD();
  socket.emit('shoot', { x: px, y: py, vx: (dx/dist)*14, vy: (dy/dist)*14 });
}

// ─── PHYSICS UPDATE ──────────────────────────────────────────────────────────
const GRAVITY = 0.45, SPEED = 3.8, JUMP = -10, JET_POWER = -0.55, JET_MAX = 100;

function updatePlayer() {
  if (!localPlayer || !localPlayer.alive) return;
  const p = localPlayer;
  if (keys.left) { p.vx -= 0.7; if (p.vx < -SPEED) p.vx = -SPEED; }
  else if (keys.right) { p.vx += 0.7; if (p.vx > SPEED) p.vx = SPEED; }
  else { p.vx *= 0.8; }

  if (keys.up && p.grounded) { p.vy = JUMP; p.grounded = false; }
  if (keys.jet && p.jetpack > 0) { p.vy += JET_POWER; p.jetpack = Math.max(0, p.jetpack - 1.5); }
  else if (!keys.jet) { p.jetpack = Math.min(JET_MAX, p.jetpack + 0.5); }

  p.vy += GRAVITY;
  if (p.vy > 12) p.vy = 12;
  p.x += p.vx; p.y += p.vy;

  p.grounded = false;
  const plats = map.platforms;
  for (const pl of plats) {
    if (p.x + 28 > pl.x && p.x < pl.x + pl.w && p.y + 32 > pl.y && p.y + 32 < pl.y + pl.h + 12 && p.vy >= 0) {
      p.y = pl.y - 32; p.vy = 0; p.grounded = true;
    }
  }

  if (p.x < 0) p.x = 0;
  if (p.x > 1068) p.x = 1068;
  if (p.y > 600) { p.y = 100; p.vy = 0; }

  // Bullet collision (server-authoritative but client-side detection for responsiveness)
  for (const bid in bullets) {
    const b = bullets[bid];
    if (b.ownerId === myId) continue;
    if (Math.hypot(b.x - (p.x+16), b.y - (p.y+16)) < 20) {
      socket.emit('bullet_hit', { bulletId: parseInt(bid), targetId: myId });
      delete bullets[bid];
      break;
    }
  }

  // Check hits on other players
  for (const pid in players) {
    if (pid === myId) continue;
    const op = players[pid];
    if (!op.alive) continue;
    for (const bid in bullets) {
      const b = bullets[bid];
      if (b.ownerId !== myId) continue;
      if (Math.hypot(b.x - (op.x+16), b.y - (op.y+16)) < 22) {
        socket.emit('bullet_hit', { bulletId: parseInt(bid), targetId: pid });
        delete bullets[bid];
        break;
      }
    }
  }

  socket.emit('player_update', { x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle, grounded: p.grounded, jetpack: p.jetpack });
  updateHUD();
}

// ─── CAMERA ──────────────────────────────────────────────────────────────────
function updateCamera() {
  if (!localPlayer) return;
  const tw = canvas.width, th = canvas.height;
  camX = localPlayer.x - tw/2 + 16;
  camY = localPlayer.y - th/2 + 16;
  camX = Math.max(0, Math.min(camX, 1100 - tw));
  camY = Math.max(0, Math.min(camY, 600 - th));
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, map.bg[0]);
  grad.addColorStop(1, map.bg[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (myMapId === 'space') {
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      ctx.beginPath();
      ctx.arc(s.x - camX, s.y - camY, s.r, 0, Math.PI*2);
      ctx.fill();
    }
  }
  if (myMapId === 'lava') {
    const t = Date.now()/1000;
    ctx.fillStyle = `rgba(255,${60+Math.sin(t)*20},0,0.12)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawPlatforms() {
  for (const pl of map.platforms) {
    const px = pl.x - camX, py = pl.y - camY;
    if (px + pl.w < 0 || px > canvas.width) continue;
    ctx.save();
    ctx.shadowColor = pl.c; ctx.shadowBlur = 8;
    ctx.fillStyle = pl.c;
    ctx.beginPath();
    ctx.roundRect(px, py, pl.w, pl.h, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(px+4, py+2, pl.w-8, 3);
    ctx.restore();
  }
}

function drawDecorations() {
  if (!map.decorations) return;
  for (const d of map.decorations) {
    const dx = d.x - camX, dy = d.y - camY;
    if (d.type === 'tree') {
      ctx.fillStyle = '#5c3d11'; ctx.fillRect(dx-4, dy, 8, 30);
      ctx.fillStyle = '#2d6a4f';
      ctx.beginPath(); ctx.arc(dx, dy, 22, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#40916c';
      ctx.beginPath(); ctx.arc(dx-8, dy+8, 14, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(dx+8, dy+5, 12, 0, Math.PI*2); ctx.fill();
    } else if (d.type === 'bush') {
      ctx.fillStyle = '#1b4332';
      ctx.beginPath(); ctx.arc(dx, dy, 16, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(dx-10, dy+4, 12, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(dx+10, dy+4, 12, 0, Math.PI*2); ctx.fill();
    }
  }
}

function drawPlayers() {
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive) continue;
    const px = p.x - camX, py = p.y - camY;
    if (px < -60 || px > canvas.width+60) continue;

    ctx.save();
    // Body
    ctx.shadowColor = p.color; ctx.shadowBlur = pid === myId ? 14 : 6;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.roundRect(px, py+8, 32, 24, 6); ctx.fill();

    // Head
    ctx.fillStyle = '#f5cba7';
    ctx.beginPath(); ctx.arc(px+16, py+7, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(px+16, py+1, 8, Math.PI, 0); ctx.fill();

    // Legs
    ctx.fillStyle = p.color;
    ctx.fillRect(px+5, py+30, 8, 10);
    ctx.fillRect(px+19, py+30, 8, 10);

    // Gun
    ctx.translate(px+16, py+16);
    ctx.rotate(p.angle || 0);
    ctx.fillStyle = '#374151';
    ctx.fillRect(4, -4, 20, 7);
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(20, -2, 8, 4);
    ctx.restore();

    // Name tag
    ctx.save();
    ctx.font = 'bold 11px Rajdhani';
    ctx.textAlign = 'center';
    ctx.fillStyle = pid === myId ? '#fbbf24' : '#fff';
    ctx.fillText(p.name, px+16, py-5);
    ctx.restore();

    // HP bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(px, py-18, 32, 5);
    ctx.fillStyle = p.hp > 60 ? '#22c55e' : p.hp > 30 ? '#eab308' : '#ef4444';
    ctx.fillRect(px, py-18, (p.hp/100)*32, 5);

    // Jetpack flame
    if (pid === myId && keys.jet && localPlayer.jetpack > 0) {
      const t = Date.now()/100;
      ctx.fillStyle = `rgba(251,191,36,${0.6+Math.sin(t)*0.3})`;
      ctx.beginPath(); ctx.arc(px+16, py+36, 6+Math.sin(t)*3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = `rgba(239,68,68,${0.4+Math.sin(t)*0.2})`;
      ctx.beginPath(); ctx.arc(px+16, py+42, 3+Math.sin(t)*2, 0, Math.PI*2); ctx.fill();
    }
  }
}

function drawBullets() {
  const t = Date.now();
  for (const bid in bullets) {
    const b = bullets[bid];
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.life <= 0) { delete bullets[bid]; continue; }
    const bx = b.x - camX, by = b.y - camY;
    ctx.save();
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    const grd = ctx.createRadialGradient(bx, by, 0, bx, by, 6);
    grd.addColorStop(0, '#fff'); grd.addColorStop(1, '#f59e0b');
    ctx.fillStyle = grd;
    ctx.arc(bx, by, 5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    // Trail
    ctx.strokeStyle = 'rgba(253,230,138,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - b.vx*3, by - b.vy*3); ctx.stroke();
  }
}

// ─── GAME LOOP ───────────────────────────────────────────────────────────────
function gameLoop() {
  if (!gameRunning) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updatePlayer();
  updateCamera();
  drawBackground();
  drawPlatforms();
  drawDecorations();
  drawBullets();
  drawPlayers();
  requestAnimationFrame(gameLoop);
}
