// ─── HELPERS ─────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── SOCKET CONNECTION ────────────────────────────────────────────────────────
const socket = io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 5 });

let myId = null, myRoom = null, myMapId = null, isHost = false;
let players = {}, bullets = {}, localPlayer = null;
let gameRunning = false;

socket.on('connect', () => {
  myId = socket.id;
  const el = document.getElementById('connStatus');
  if (el) { el.textContent = '● Connected'; el.style.color = '#22c55e'; }
});
socket.on('disconnect', () => {
  const el = document.getElementById('connStatus');
  if (el) { el.textContent = '● Disconnected'; el.style.color = '#ef4444'; }
});
socket.on('connect_error', () => {
  const el = document.getElementById('connStatus');
  if (el) { el.textContent = '● Connection Error'; el.style.color = '#ef4444'; }
});

// ─── KEYS ────────────────────────────────────────────────────────────────────
const keys = { left: false, right: false, up: false, jet: false };
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft'  || e.key === 'a') keys.left  = true;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
  if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === ' ') keys.up = true;
  if (e.key === 'Shift') keys.jet = true;
  if (e.key === 'f' || e.key === 'F') mobileShoot();
  if (e.key === 'r' || e.key === 'R') reload();
});
document.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft'  || e.key === 'a') keys.left  = false;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
  if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === ' ') keys.up = false;
  if (e.key === 'Shift') keys.jet = false;
});

let mouseX = 400, mouseY = 300;
document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
document.addEventListener('mousedown', e => { if (e.button === 0 && gameRunning) mobileShoot(); });

// ─── SCREEN HELPERS ───────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
  const el = document.getElementById(id);
  el.classList.add('active');
  el.style.display = 'flex';
}
function showJoin() { document.getElementById('joinBox').classList.toggle('hidden'); }
function copyCode() { if (myRoom) navigator.clipboard.writeText(myRoom).catch(() => {}); }

// ─── LOBBY ACTIONS ────────────────────────────────────────────────────────────
function createRoom() {
  if (!socket.connected) return setMsg('lobbyMsg', '❌ Not connected yet, please wait...');
  const name = document.getElementById('playerName').value.trim() || 'Soldier';
  socket.emit('create_room', { name });
}
function joinRoom() {
  if (!socket.connected) return setMsg('lobbyMsg', '❌ Not connected yet, please wait...');
  const name = document.getElementById('playerName').value.trim() || 'Soldier';
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!code) return setMsg('lobbyMsg', 'Enter a room code!');
  socket.emit('join_room', { code, name });
}
function startGame() { socket.emit('start_game'); }
function reload() { socket.emit('ammo_reload'); if(typeof playReload==='function') playReload(); }
function setMsg(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }

// ─── SOCKET EVENTS ────────────────────────────────────────────────────────────
socket.on('room_created', ({ code, mapId, players: ps }) => {
  myId = socket.id; myRoom = code; myMapId = mapId; isHost = true;
  players = ps; localPlayer = players[myId];
  document.getElementById('displayCode').textContent = code;
  document.getElementById('mapName').textContent = mapId.toUpperCase();
  document.getElementById('hostControls').classList.remove('hidden');
  updatePlayerList();
  showScreen('waiting');
});

socket.on('room_joined', ({ code, mapId, players: ps }) => {
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
  setMsg('waitMsg', player.name + ' joined!');
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
socket.on('bullet_fired', b => { bullets[b.id] = { ...b }; });
socket.on('player_hit', ({ targetId, hp }) => {
  if (players[targetId]) players[targetId].hp = hp;
  if (targetId === myId && localPlayer) { localPlayer.hp = hp; updateHUD(); if(typeof playHit==='function') playHit(); }
});
socket.on('player_killed', ({ targetId, killerId }) => {
  const killer = players[killerId], victim = players[targetId];
  if (players[targetId]) players[targetId].alive = false;
  if (killer && victim) showKillFeed(killer.name + ' killed ' + victim.name);
  if (targetId === myId) { showDeathScreen(); if(typeof playDeath==='function') playDeath(); }
});
socket.on('player_respawned', p => {
  players[p.id] = { ...players[p.id], ...p };
  if (p.id === myId) { localPlayer = players[myId]; hideDeathScreen(); updateHUD(); }
});
socket.on('ammo_updated', ({ ammo }) => { if (localPlayer) { localPlayer.ammo = ammo; updateHUD(); } });
socket.on('player_left', ({ id }) => { delete players[id]; });
socket.on('error', msg => setMsg('lobbyMsg', '❌ ' + msg));

// ─── PLAYER LIST ─────────────────────────────────────────────────────────────
function updatePlayerList() {
  const ul = document.getElementById('playerList');
  ul.innerHTML = Object.values(players).map(p =>
    '<div class="player-item"><div class="player-dot" style="background:' + p.color + '"></div><span>' + p.name + '</span>' +
    (p.id === myId ? ' <span style="color:#fbbf24;font-size:.75rem">(You)</span>' : '') + '</div>'
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
  document.getElementById('jpFill').style.width = (localPlayer.jetpack || 0) + '%';
  document.getElementById('ammoCount').textContent = localPlayer.ammo;
  document.getElementById('killCount').textContent = localPlayer.kills || 0;
}

let killFeedTimer;
function showKillFeed(msg) {
  const el = document.getElementById('killFeed');
  el.textContent = msg;
  clearTimeout(killFeedTimer);
  killFeedTimer = setTimeout(() => { el.textContent = ''; }, 3000);
}

let respawnInterval;
function showDeathScreen() {
  document.getElementById('deathScreen').classList.remove('hidden');
  let t = 3;
  document.getElementById('respawnTimer').textContent = t;
  clearInterval(respawnInterval);
  respawnInterval = setInterval(() => { t--; document.getElementById('respawnTimer').textContent = t; if (t <= 0) clearInterval(respawnInterval); }, 1000);
}
function hideDeathScreen() { document.getElementById('deathScreen').classList.add('hidden'); }

const W=2200, H=700;
const MAPS = {
  jungle: {
    bg:['#0a1a0f','#1a3d2b'],
    platforms:[
      {x:0,y:660,w:W,h:40,c:'#1b4332'},
      {x:0,y:520,w:220,h:20,c:'#2d6a4f'},{x:280,y:460,w:180,h:20,c:'#2d6a4f'},
      {x:520,y:400,w:200,h:20,c:'#2d6a4f'},{x:780,y:460,w:180,h:20,c:'#2d6a4f'},
      {x:1020,y:520,w:200,h:20,c:'#2d6a4f'},{x:1280,y:440,w:180,h:20,c:'#40916c'},
      {x:1520,y:380,w:200,h:20,c:'#40916c'},{x:1780,y:460,w:200,h:20,c:'#2d6a4f'},
      {x:2000,y:540,w:200,h:20,c:'#2d6a4f'},
      {x:100,y:340,w:150,h:20,c:'#40916c'},{x:400,y:280,w:160,h:20,c:'#40916c'},
      {x:700,y:300,w:140,h:20,c:'#52b788'},{x:1000,y:340,w:160,h:20,c:'#52b788'},
      {x:1300,y:280,w:180,h:20,c:'#52b788'},{x:1600,y:240,w:160,h:20,c:'#52b788'},
      {x:1900,y:320,w:140,h:20,c:'#40916c'},
      {x:250,y:180,w:140,h:20,c:'#52b788'},{x:600,y:160,w:180,h:20,c:'#52b788'},
      {x:950,y:190,w:160,h:20,c:'#52b788'},{x:1400,y:140,w:200,h:20,c:'#52b788'},
      {x:1750,y:170,w:140,h:20,c:'#52b788'},
      {x:0,y:0,w:10,h:H,c:'#1b4332'},{x:W-10,y:0,w:10,h:H,c:'#1b4332'}
    ]
  },
  space: {
    bg:['#020010','#0a0520'], stars:true,
    platforms:[
      {x:0,y:660,w:W,h:40,c:'#2e1065'},
      {x:0,y:530,w:200,h:18,c:'#4a1d96'},{x:260,y:460,w:160,h:18,c:'#5b21b6'},
      {x:480,y:390,w:200,h:18,c:'#6d28d9'},{x:740,y:460,w:160,h:18,c:'#5b21b6'},
      {x:960,y:530,w:200,h:18,c:'#4a1d96'},{x:1220,y:460,w:180,h:18,c:'#5b21b6'},
      {x:1460,y:390,w:200,h:18,c:'#6d28d9'},{x:1720,y:460,w:180,h:18,c:'#5b21b6'},
      {x:1960,y:530,w:200,h:18,c:'#4a1d96'},
      {x:80,y:340,w:160,h:18,c:'#7c3aed'},{x:400,y:280,w:160,h:18,c:'#7c3aed'},
      {x:700,y:310,w:160,h:18,c:'#7c3aed'},{x:1000,y:280,w:180,h:18,c:'#7c3aed'},
      {x:1300,y:340,w:160,h:18,c:'#7c3aed'},{x:1600,y:260,w:180,h:18,c:'#8b5cf6'},
      {x:1900,y:300,w:160,h:18,c:'#7c3aed'},
      {x:250,y:180,w:140,h:18,c:'#8b5cf6'},{x:600,y:150,w:200,h:18,c:'#8b5cf6'},
      {x:950,y:170,w:160,h:18,c:'#8b5cf6'},{x:1400,y:140,w:200,h:18,c:'#a78bfa'},
      {x:1750,y:160,w:160,h:18,c:'#8b5cf6'},
      {x:0,y:0,w:10,h:H,c:'#2e1065'},{x:W-10,y:0,w:10,h:H,c:'#2e1065'}
    ]
  },
  lava: {
    bg:['#1a0400','#3d0900'],
    platforms:[
      {x:0,y:660,w:W,h:40,c:'#450a00'},
      {x:0,y:520,w:200,h:20,c:'#78350f'},{x:260,y:450,w:170,h:20,c:'#92400e'},
      {x:490,y:380,w:210,h:20,c:'#b45309'},{x:760,y:450,w:170,h:20,c:'#92400e'},
      {x:990,y:520,w:200,h:20,c:'#78350f'},{x:1250,y:440,w:180,h:20,c:'#92400e'},
      {x:1490,y:370,w:210,h:20,c:'#b45309'},{x:1760,y:450,w:180,h:20,c:'#92400e'},
      {x:2000,y:530,w:200,h:20,c:'#78350f'},
      {x:100,y:330,w:150,h:20,c:'#d97706'},{x:400,y:270,w:170,h:20,c:'#f59e0b'},
      {x:700,y:300,w:150,h:20,c:'#d97706'},{x:1050,y:340,w:170,h:20,c:'#d97706'},
      {x:1350,y:270,w:180,h:20,c:'#f59e0b'},{x:1650,y:240,w:170,h:20,c:'#fbbf24'},
      {x:1950,y:300,w:150,h:20,c:'#d97706'},
      {x:250,y:180,w:140,h:20,c:'#fbbf24'},{x:600,y:150,w:200,h:20,c:'#fbbf24'},
      {x:1000,y:180,w:160,h:20,c:'#fbbf24'},{x:1500,y:130,w:200,h:20,c:'#fbbf24'},
      {x:0,y:0,w:10,h:H,c:'#450a00'},{x:W-10,y:0,w:10,h:H,c:'#450a00'}
    ]
  },
  ice: {
    bg:['#0c1e2e','#0f3460'],
    platforms:[
      {x:0,y:660,w:W,h:40,c:'#1e3a5f'},
      {x:0,y:520,w:220,h:20,c:'#93c5fd'},{x:280,y:460,w:160,h:20,c:'#bfdbfe'},
      {x:500,y:390,w:200,h:20,c:'#dbeafe'},{x:760,y:460,w:160,h:20,c:'#bfdbfe'},
      {x:980,y:520,w:220,h:20,c:'#93c5fd'},{x:1260,y:450,w:180,h:20,c:'#bfdbfe'},
      {x:1500,y:380,w:200,h:20,c:'#dbeafe'},{x:1760,y:460,w:180,h:20,c:'#bfdbfe'},
      {x:2000,y:530,w:200,h:20,c:'#93c5fd'},
      {x:100,y:340,w:150,h:20,c:'#60a5fa'},{x:400,y:280,w:170,h:20,c:'#60a5fa'},
      {x:720,y:310,w:150,h:20,c:'#60a5fa'},{x:1050,y:340,w:160,h:20,c:'#60a5fa'},
      {x:1350,y:280,w:180,h:20,c:'#3b82f6'},{x:1650,y:250,w:170,h:20,c:'#3b82f6'},
      {x:1950,y:310,w:150,h:20,c:'#60a5fa'},
      {x:250,y:180,w:140,h:20,c:'#3b82f6'},{x:600,y:150,w:200,h:20,c:'#3b82f6'},
      {x:1000,y:180,w:160,h:20,c:'#3b82f6'},{x:1450,y:130,w:200,h:20,c:'#2563eb'},
      {x:0,y:0,w:10,h:H,c:'#1e3a5f'},{x:W-10,y:0,w:10,h:H,c:'#1e3a5f'}
    ]
  }
};

// ─── GAME ENGINE ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let camX = 0, camY = 0, map = null, lastShot = 0, stars = [];

function initGame() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  map = MAPS[myMapId] || MAPS.jungle;
  stars = [];
  if (map.stars) {
    for (let i = 0; i < 300; i++) stars.push({ x: Math.random()*W, y: Math.random()*H, r: Math.random()*1.5+0.3 });
  }
  requestAnimationFrame(gameLoop);
}

window.addEventListener('resize', () => { if (gameRunning) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; } });

// ─── SHOOTING ────────────────────────────────────────────────────────────────
function mobileShoot() {
  if (!gameRunning || !localPlayer || !localPlayer.alive) return;
  if (localPlayer.ammo <= 0) return;
  const now = Date.now();
  if (now - lastShot < 200) return;
  lastShot = now;
  const px = localPlayer.x + 16, py = localPlayer.y + 16;
  const dx = (mouseX + camX) - px, dy = (mouseY + camY) - py;
  const dist = Math.hypot(dx, dy) || 1;
  localPlayer.angle = Math.atan2(dy, dx);
  localPlayer.ammo--;
  updateHUD();
  socket.emit('shoot', { x: px, y: py, vx: (dx/dist)*14, vy: (dy/dist)*14 });
  if(typeof playShoot==='function') playShoot();
}

// ─── PHYSICS ─────────────────────────────────────────────────────────────────
const GRAVITY = 0.45, SPEED = 3.8, JUMP = -10, JET_POWER = -0.55;

function updatePlayer() {
  if (!localPlayer || !localPlayer.alive) return;
  const p = localPlayer;
  if (keys.left)  { p.vx -= 0.7; if (p.vx < -SPEED) p.vx = -SPEED; }
  else if (keys.right) { p.vx += 0.7; if (p.vx > SPEED) p.vx = SPEED; }
  else { p.vx *= 0.8; }
  if (keys.up && p.grounded) { p.vy = JUMP; p.grounded = false; if(typeof playJump==='function') playJump(); }
  if (keys.jet && p.jetpack > 0) { p.vy += JET_POWER; p.jetpack = Math.max(0, p.jetpack - 1.5); }
  else if (!keys.jet) { p.jetpack = Math.min(100, p.jetpack + 0.5); }
  p.vy += GRAVITY;
  if (p.vy > 12) p.vy = 12;
  p.x += p.vx; p.y += p.vy;
  p.grounded = false;
  for (const pl of map.platforms) {
    if (p.x + 28 > pl.x && p.x < pl.x + pl.w && p.y + 32 > pl.y && p.y + 32 < pl.y + pl.h + 12 && p.vy >= 0) {
      p.y = pl.y - 32; p.vy = 0; p.grounded = true;
    }
  }
  if (p.x < 10) p.x = 10;
  if (p.x > W - 42) p.x = W - 42;
  if (p.y > H) { p.y = 100; p.vy = 0; }

  // Bullet hit detection
  for (const bid in bullets) {
    const b = bullets[bid];
    if (b.ownerId === myId) {
      for (const pid in players) {
        if (pid === myId || !players[pid].alive) continue;
        if (Math.hypot(b.x - (players[pid].x+16), b.y - (players[pid].y+16)) < 22) {
          socket.emit('bullet_hit', { bulletId: parseInt(bid), targetId: pid });
          delete bullets[bid]; break;
        }
      }
    } else {
      if (Math.hypot(b.x - (p.x+16), b.y - (p.y+16)) < 20) {
        socket.emit('bullet_hit', { bulletId: parseInt(bid), targetId: myId });
        delete bullets[bid];
      }
    }
  }
  socket.emit('player_update', { x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle, grounded: p.grounded, jetpack: p.jetpack });
  updateHUD();
}

// ─── CAMERA ──────────────────────────────────────────────────────────────────
function updateCamera() {
  if (!localPlayer) return;
  camX = Math.max(0, Math.min(localPlayer.x - canvas.width/2 + 16, W - canvas.width));
  camY = Math.max(0, Math.min(localPlayer.y - canvas.height/2 + 16, H - canvas.height));
}

// ─── DRAW ─────────────────────────────────────────────────────────────────────
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, map.bg[0]); g.addColorStop(1, map.bg[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (map.stars) {
    ctx.fillStyle = '#fff';
    stars.forEach(s => { ctx.beginPath(); ctx.arc(s.x - camX, s.y - camY, s.r, 0, Math.PI*2); ctx.fill(); });
  }
  if (myMapId === 'lava') {
    ctx.fillStyle = 'rgba(255,60,0,0.08)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawPlatforms() {
  for (const pl of map.platforms) {
    const px = pl.x - camX, py = pl.y - camY;
    if (px + pl.w < 0 || px > canvas.width) continue;
    ctx.save();
    ctx.shadowColor = pl.c; ctx.shadowBlur = 8;
    ctx.fillStyle = pl.c;
    roundRect(ctx, px, py, pl.w, pl.h, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(px+4, py+2, pl.w-8, 3);
    ctx.restore();
  }
}

function drawPlayers() {
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive) continue;
    const px = p.x - camX, py = p.y - camY;
    if (px < -60 || px > canvas.width+60) continue;
    ctx.save();
    ctx.shadowColor = p.color; ctx.shadowBlur = pid === myId ? 14 : 6;
    // Body
    ctx.fillStyle = p.color;
    roundRect(ctx, px, py+8, 32, 24, 6); ctx.fill();
    // Head
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f5cba7'; ctx.beginPath(); ctx.arc(px+16, py+7, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(px+16, py+1, 8, Math.PI, 0); ctx.fill();
    // Legs
    ctx.fillStyle = p.color; ctx.fillRect(px+5, py+30, 8, 10); ctx.fillRect(px+19, py+30, 8, 10);
    // Gun
    ctx.translate(px+16, py+16); ctx.rotate(p.angle || 0);
    ctx.fillStyle = '#374151'; ctx.fillRect(4, -4, 20, 7);
    ctx.fillStyle = '#6b7280'; ctx.fillRect(20, -2, 8, 4);
    ctx.restore();
    // Name
    ctx.save(); ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = pid === myId ? '#fbbf24' : '#fff';
    ctx.fillText(p.name, px+16, py-5); ctx.restore();
    // HP bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px, py-18, 32, 5);
    ctx.fillStyle = p.hp > 60 ? '#22c55e' : p.hp > 30 ? '#eab308' : '#ef4444';
    ctx.fillRect(px, py-18, (p.hp/100)*32, 5);
  }
}

function bulletHitsWall(b) {
  if (!map) return false;
  for (const pl of map.platforms) {
    if (b.x > pl.x && b.x < pl.x + pl.w && b.y > pl.y && b.y < pl.y + pl.h) return true;
  }
  return false;
}

function drawBullets() {
  for (const bid in bullets) {
    const b = bullets[bid];
    b.x += b.vx; b.y += b.vy; b.life--;
    if (b.life <= 0 || bulletHitsWall(b)) { delete bullets[bid]; continue; }
    const bx = b.x - camX, by = b.y - camY;
    ctx.save();
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(253,230,138,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - b.vx*3, by - b.vy*3); ctx.stroke();
    ctx.restore();
  }
}

// ─── GAME LOOP ────────────────────────────────────────────────────────────────
function gameLoop() {
  if (!gameRunning) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updatePlayer(); updateCamera();
  drawBackground(); drawPlatforms(); drawBullets(); drawPlayers();
  requestAnimationFrame(gameLoop);
}
