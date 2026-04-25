const AC = new (window.AudioContext || window.webkitAudioContext)();
function unlock(){ AC.resume(); document.removeEventListener('click',unlock); document.removeEventListener('touchstart',unlock); }
document.addEventListener('click',unlock); document.addEventListener('touchstart',unlock);

function playShoot(){
  const o=AC.createOscillator(),g=AC.createGain();
  o.connect(g); g.connect(AC.destination);
  o.frequency.setValueAtTime(800,AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(200,AC.currentTime+0.08);
  g.gain.setValueAtTime(0.3,AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+0.09);
  o.start(); o.stop(AC.currentTime+0.09);
}

function playHit(){
  const b=AC.createOscillator(),g=AC.createGain();
  b.type='square'; b.connect(g); g.connect(AC.destination);
  b.frequency.setValueAtTime(150,AC.currentTime);
  b.frequency.exponentialRampToValueAtTime(60,AC.currentTime+0.12);
  g.gain.setValueAtTime(0.4,AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+0.12);
  b.start(); b.stop(AC.currentTime+0.12);
}

function playDeath(){
  const o=AC.createOscillator(),g=AC.createGain();
  o.type='sawtooth'; o.connect(g); g.connect(AC.destination);
  o.frequency.setValueAtTime(400,AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(40,AC.currentTime+0.5);
  g.gain.setValueAtTime(0.5,AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+0.5);
  o.start(); o.stop(AC.currentTime+0.5);
}

function playJump(){
  const o=AC.createOscillator(),g=AC.createGain();
  o.type='sine'; o.connect(g); g.connect(AC.destination);
  o.frequency.setValueAtTime(200,AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(500,AC.currentTime+0.1);
  g.gain.setValueAtTime(0.15,AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+0.1);
  o.start(); o.stop(AC.currentTime+0.1);
}

function playReload(){
  [0,0.07,0.14].forEach((t,i)=>{
    const o=AC.createOscillator(),g=AC.createGain();
    o.type='triangle'; o.connect(g); g.connect(AC.destination);
    o.frequency.value=300+i*100;
    g.gain.setValueAtTime(0.2,AC.currentTime+t);
    g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+t+0.06);
    o.start(AC.currentTime+t); o.stop(AC.currentTime+t+0.06);
  });
}
