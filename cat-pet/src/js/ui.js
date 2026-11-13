/* Virtual Pet Cat: UI, input, audio and main loop */
(function () {
'use strict';
const VPC = window.VPC;
const T = THREE;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Small settings stored in the browser (falls back to keys from before the rename) */
function getPref(name) { try { const v = localStorage.getItem('virtual-pet-cat-' + name); return v !== null ? v : localStorage.getItem('whisker-' + name); } catch (e) { return null; } }
function setPref(name, v) { try { localStorage.setItem('virtual-pet-cat-' + name, v); } catch (e) {} }

/* ================= Audio (synthesized, no files) ================= */
const Snd = {
  ctx: null, on: true, master: null, purrGain: null, noise: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.on ? 0.45 : 0; this.master.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // Continuous purr: low-passed noise, amplitude-modulated at ~25 Hz
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const am = c.createGain(); am.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 25; const lfoG = c.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(am.gain);
    this.purrGain = c.createGain(); this.purrGain.gain.value = 0;
    src.connect(lp).connect(am).connect(this.purrGain).connect(this.master);
    src.start(); lfo.start();
  },
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.45 : 0; },
  purr(level) { if (this.purrGain) this.purrGain.gain.setTargetAtTime(level * 1.6, this.ctx.currentTime, 0.15); },
  env(node, t0, a, peak, dur) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); node.connect(g); g.connect(this.master); return g; },
  noiseBurst(t0, dur, type, freq, peak, q = 1) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); this.env(f, t0, 0.005, peak, dur); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  },
  tone(t0, dur, type, f0, f1, peak, f2) {
    const c = this.ctx, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f2) { o.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.35); o.frequency.linearRampToValueAtTime(f2, t0 + dur); }
    else o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    this.env(o, t0, Math.min(0.05, dur / 4), peak, dur); o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  },
  play(name, v = 1) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime;
    switch (name) {
      case 'meow': {
        const o = c.createOscillator(); o.type = 'sawtooth';
        const base = 520 + Math.random() * 180;
        o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.55, t + 0.18); o.frequency.linearRampToValueAtTime(base * 0.8, t + 0.6);
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1600, t + 0.2); bp.frequency.linearRampToValueAtTime(700, t + 0.6); bp.Q.value = 4;
        o.connect(bp); this.env(bp, t, 0.06, 0.5, 0.65); o.start(t); o.stop(t + 0.7);
        break;
      }
      case 'mrrp': this.tone(t, 0.25, 'triangle', 380, 640, 0.25); break;
      case 'grumble': this.tone(t, 0.45, 'sawtooth', 160, 120, 0.12); break;
      case 'hiss': this.noiseBurst(t, 0.75, 'highpass', 2800, 0.35); break;
      case 'crunch': this.noiseBurst(t, 0.05, 'highpass', 1800, 0.18); this.noiseBurst(t + 0.09, 0.04, 'highpass', 2200, 0.12); break;
      case 'slurp': case 'lap': this.tone(t, 0.07, 'sine', 420, 180, 0.12); break;
      case 'thump': this.tone(t, 0.12, 'sine', 110, 50, 0.25 * v); break;
      case 'crash':
        this.noiseBurst(t, 0.5, 'bandpass', 3200, 0.5, 0.8);
        for (const f of [2100, 3150, 4400]) this.tone(t + Math.random() * 0.08, 0.6, 'sine', f, f * 0.98, 0.08);
        break;
      case 'chirp': for (let i = 0; i < 2; i++) this.tone(t + i * 0.16, 0.1, 'sine', 3200, 4300, 0.08); break;
      case 'chatter': for (let i = 0; i < 4; i++) this.tone(t + i * 0.07, 0.04, 'square', 900, 1300, 0.05); break;
      case 'jingle': for (const f of [2600, 3300, 3900]) this.tone(t + Math.random() * 0.05, 0.35, 'sine', f, f, 0.06); break;
      case 'bat': this.noiseBurst(t, 0.05, 'lowpass', 900, 0.25); break;
      case 'scratch': for (let i = 0; i < 6; i++) this.noiseBurst(t + i * 0.22, 0.14, 'bandpass', 1400, 0.12, 2); break;
      case 'dig': for (let i = 0; i < 4; i++) this.noiseBurst(t + i * 0.18, 0.1, 'bandpass', 900, 0.1, 1.5); break;
      case 'yawn': this.tone(t, 0.7, 'sine', 380, 220, 0.08); break;
      case 'hack': for (let i = 0; i < 3; i++) this.noiseBurst(t + i * 0.3, 0.15, 'lowpass', 500, 0.25); break;
      case 'pop': this.tone(t, 0.08, 'sine', 600, 900, 0.1); break;
      case 'coin': this.tone(t, 0.08, 'square', 988, 988, 0.05); this.tone(t + 0.08, 0.2, 'square', 1319, 1319, 0.05); break;
      case 'water': this.noiseBurst(t, 0.6, 'lowpass', 700, 0.15); break;
      case 'sweep': for (let i = 0; i < 3; i++) this.noiseBurst(t + i * 0.12, 0.1, 'bandpass', 2500, 0.08); break;
    }
  },
};

/* ================= Setup ================= */
const canvas = $('scene');
let world;
try { world = new VPC.World(canvas); }
catch (e) {
  console.error(e);
  window.VPC_bootFail && window.VPC_bootFail('Your browser couldn\u2019t start 3D graphics (WebGL). Turn on hardware acceleration in your browser settings, update your browser, or try another one.');
  window.VPC_started = true;
  throw e;
}
const model = new VPC.CatModel('orange', 1);
world.scene.add(model.group);
const hooks = {
  say: (t, ms) => say(t, ms),
  fx: (t, c) => floatFx(t, c),
  sound: (n, v) => Snd.play(n, v),
  log: () => { if (activeTab === 'journal') renderPanel(); },
  forceDrop: () => endCarry(true),
  onSwat: () => { flash(); gesture = null; },
};
const sim = new VPC.Sim(world, model, hooks);
VPC.sim = sim; VPC.world = world; VPC.model = model; // console handles

let speed = 1;
let tool = 'hand';
let follow = true;
let activeTab = 'needs';
let started = false;

/* ================= Speech bubble + floating text ================= */
const bubble = $('bubble'), fxLayer = $('fx');
let bubbleUntil = 0;
function say(text, ms = 2200) { bubble.textContent = text; bubble.classList.add('show'); bubbleUntil = performance.now() + ms; }
function screenOf(v3) {
  const p = v3.clone().project(world.camera);
  const r = canvas.getBoundingClientRect();
  return { x: (p.x + 1) / 2 * r.width + r.left, y: (1 - p.y) / 2 * r.height + r.top, behind: p.z > 1 };
}
function floatFx(text, color = '#e0794a') {
  const s = screenOf(model.headWorld(new T.Vector3()));
  const el = document.createElement('div');
  el.className = 'float'; el.textContent = text; el.style.color = color;
  el.style.left = (s.x + (Math.random() * 30 - 15)) + 'px'; el.style.top = (s.y - 10) + 'px';
  fxLayer.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function flash() { document.body.classList.add('ouch'); setTimeout(() => document.body.classList.remove('ouch'), 250); }

/* ================= HUD ================= */
const NEED_DEFS = [
  ['hunger', '🍗', 'Food'], ['thirst', '💧', 'Water'], ['energy', '⚡', 'Energy'],
  ['fun', '🧶', 'Fun'], ['hygiene', '🫧', 'Hygiene'], ['social', '🤝', 'Social'],
];
const TOOLS = [
  { id: 'hand', icon: '✋', label: 'Hand', hint: 'Stroke the cat to pet it, or hold to pick it up. Drag toys to throw them. Click bowls, the litter box, the lamp and messes. Drag empty space to look around.' },
  { id: 'brush', icon: '🪮', label: 'Brush', hint: 'Stroke the cat to brush it. Helps hygiene and prevents hairballs. Not every cat likes it.' },
  { id: 'laser', icon: '🔴', label: 'Laser', hint: 'Point at the floor or walls. Each "catch" earns 🪙. Right-drag or two-finger drag to turn the camera.' },
  { id: 'wand', icon: '🪶', label: 'Wand', hint: 'Dangle the feather near the cat, then hold the mouse button to lift it. Wiggle it to keep the cat interested!' },
  { id: 'treat', icon: '🍬', label: 'Treat', hint: `Click the floor to toss a treat (${VPC.PRICES.treat} 🪙). Great for bonding.` },
];
const ACTIONS = [
  { id: 'kibble', icon: '🥣', label: 'Kibble', fn: () => addFood(false) },
  { id: 'wet', icon: '🥫', label: `Wet ${VPC.PRICES.wet}🪙`, fn: () => addFood(true) },
  { id: 'water', icon: '🚰', label: 'Water', fn: refillWater },
  { id: 'scoop', icon: '🧹', label: 'Scoop', fn: scoop },
  { id: 'catnip', icon: '🌿', label: `Nip ${VPC.PRICES.catnip}🪙`, fn: catnip },
  { id: 'bath', icon: '🛁', label: 'Bath', fn: bath },
  { id: 'lamp', icon: '💡', label: 'Lamp', fn: toggleLamp },
  { id: 'follow', icon: '🎥', label: 'Follow', fn: () => { follow = !follow; if (!follow) world.orbit.goalTarget.set(0, 0.35, 0.1); renderButtons(); } },
];
function buildHUD() {
  $('tools').innerHTML = TOOLS.map(t => `<button class="tbtn" data-tool="${t.id}" title="${esc(t.hint)}"><b>${t.icon}</b><span>${t.label}</span></button>`).join('') +
    '<span class="sep"></span>' +
    ACTIONS.map(a => `<button class="tbtn act" data-act="${a.id}"><b>${a.icon}</b><span>${a.label}</span></button>`).join('');
  $('tools').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    Snd.init();
    if (b.dataset.tool) setTool(b.dataset.tool);
    else { const a = ACTIONS.find(x => x.id === b.dataset.act); a && a.fn(); }
  });
  $('needs').innerHTML = NEED_DEFS.map(([k, i, n]) => `<div class="stat"><span>${i}</span><span>${n}</span><div class="bar"><i id="bar-${k}"></i></div><em id="val-${k}"></em></div>`).join('') +
    `<div class="stat"><span>💗</span><span>Bond</span><div class="bar"><i id="bar-bond" class="bond"></i></div><em id="val-bond"></em></div>` +
    `<div class="stat"><span>😰</span><span>Stress</span><div class="bar"><i id="bar-stress" class="stress"></i></div><em id="val-stress"></em></div>`;
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { activeTab = b.dataset.tab; renderPanel(); }));
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { speed = +b.dataset.speed; renderButtons(); }));
  setTool('hand');
}
function setTool(id) {
  tool = id;
  sim.laser.active = false; sim.wand.active = false;
  laserDot.visible = false; wandObj.visible = false;
  canvas.dataset.tool = id;
  const t = TOOLS.find(x => x.id === id);
  $('hint').textContent = t.hint;
  renderButtons();
}
function renderButtons() {
  const S = sim.S;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
  document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === speed));
  const set = (id, on, dis) => { const b = document.querySelector(`[data-act="${id}"]`); if (b) { b.classList.toggle('on', !!on); b.disabled = !!dis; } };
  if (!S) return;
  set('follow', follow);
  set('lamp', S.lamp);
  set('wet', false, S.coins < VPC.PRICES.wet);
  set('catnip', false, S.coins < VPC.PRICES.catnip);
  set('scoop', S.poops >= 2, false);
  const tb = document.querySelector('[data-tool="treat"]'); if (tb) tb.disabled = S.coins < VPC.PRICES.treat;
}
function barCls(v, inv) { if (inv) v = 100 - v; return v < 25 ? 'low' : v < 55 ? 'mid' : ''; }
function fmtClock(S) {
  const m = Math.floor(S.clock % 1440), h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function fmtLogTime(c) { const m = Math.floor(c % 1440); return `D${Math.floor(c / 1440) + 1} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function ageText(S) {
  const days = (S.clock - S.born) / 1440;
  const weeks = days * 8; // one game day = ~8 cat weeks
  return weeks < 52 ? `${Math.floor(weeks)} wks old` : `${(weeks / 52).toFixed(1)} yrs old`;
}
function renderHUD() {
  const S = sim.S; if (!S) return;
  const N = S.needs;
  for (const [k] of NEED_DEFS) { const v = Math.round(N[k]); const b = $('bar-' + k); b.style.width = v + '%'; b.className = barCls(v); $('val-' + k).textContent = v; }
  $('bar-bond').style.width = S.bond + '%'; $('val-bond').textContent = Math.round(S.bond);
  $('bar-stress').style.width = S.stress + '%'; $('bar-stress').className = 'stress ' + barCls(S.stress, true); $('val-stress').textContent = Math.round(S.stress);
  const [emo, mood] = sim.mood();
  $('moodEmoji').textContent = emo; $('moodText').textContent = mood;
  $('catName').textContent = S.name;
  $('thought').textContent = '💭 ' + sim.thought();
  $('stage').textContent = `${sim.stage().label} · ${ageText(S)}`;
  $('coins').textContent = S.coins;
  const hr = sim.hour();
  $('clock').textContent = `${hr >= 6 && hr < 18 ? '☀️' : hr >= 18 && hr < 21 ? '🌇' : '🌙'} Day ${sim.day()} · ${fmtClock(S)}`;
  renderButtons();
  if (activeTab !== 'needs') renderPanel(true);
}
let lastPanel = '';
function renderPanel(soft) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === activeTab));
  $('needs').hidden = activeTab !== 'needs';
  const box = $('panelBody');
  box.hidden = activeTab === 'needs';
  const S = sim.S; if (!S || activeTab === 'needs') return;
  let html = '';
  if (activeTab === 'cat') {
    html += `<div class="traits">${S.traits.map(t => `<div><b>${VPC.TRAITS[t].label}</b> ${esc(VPC.TRAITS[t].desc)}</div>`).join('')}</div>`;
    html += '<h4>What you\'ve learned</h4><ul class="prefs">';
    for (const z of [...VPC.ZONES, 'brush']) {
      const n = S.learned[z] || 0, p = S.prefs[z];
      const known = n >= 4;
      const verdict = !known ? '<span class="muted">??? (try it)</span>' : p > 1.2 ? 'Loves it 😻' : p > 0.5 ? 'Likes it 😺' : p > 0 ? 'Tolerates it 🐱' : p > -0.6 ? 'Dislikes it 😾' : 'Hates it 🙀';
      html += `<li><span>${VPC.ZONE_LABEL[z]}</span><span>${verdict}</span></li>`;
    }
    html += '</ul>';
    html += `<h4>Stats</h4><div class="muted small">Dot catches: ${S.stats.catches} · Pets: ${S.stats.pets} · Gifts: ${S.stats.gifts} · Meals: ${S.stats.meals}${S.sofaScratches ? ` · Sofa scratches: ${S.sofaScratches}` : ''}</div>`;
  } else {
    html = '<ul class="log">' + S.log.slice(0, 40).map(e => `<li><time>${fmtLogTime(e.t)}</time>${esc(e.m)}</li>`).join('') + '</ul>';
  }
  if (soft && html === lastPanel) return;
  lastPanel = html;
  box.innerHTML = html;
}

/* ================= Care actions ================= */
function needCat() { if (!sim.S) return false; Snd.init(); return true; }
function spend(n) { if (sim.S.coins < n) { toast(`Not enough coins (need ${n} 🪙). Play with ${sim.S.name} to earn some.`); return false; } sim.S.coins -= n; Snd.play('coin'); return true; }
function addFood(wet) {
  if (!needCat()) return;
  const S = sim.S;
  if (wet) { if (!spend(VPC.PRICES.wet)) return; S.food = Math.min(100, S.food + 60); S.wet = true; toast('Wet food served. Fancy!'); }
  else { if (S.food >= 95) return toast('The bowl is already full.'); S.food = Math.min(100, S.food + 50); toast('Kibble added to the bowl.'); }
  Snd.play('crunch'); world.setFood(S.food, S.wet);
  if (sim.asleep && sim.has('foodie') && wet) { sim.asleep = false; sim.act = null; }
}
function refillWater() { if (!needCat()) return; sim.S.water = 100; world.setWater(100); Snd.play('water'); toast('Fresh water.'); }
function scoop() {
  if (!needCat()) return;
  const S = sim.S;
  if (!S.poops) return toast('The litter box is already clean.');
  S.poops = 0; world.setPoops(0); Snd.play('sweep'); toast('Litter box scooped. 🧹');
  sim.log('You scooped the litter box.');
}
function catnip() { if (!needCat()) return; if (sim.act && ['carried', 'bath'].includes(sim.act.name)) return; if (!spend(VPC.PRICES.catnip)) return; sim.catnip(); sim.log(`You sprinkled catnip on the rug. ${sim.S.name} is... affected.`); }
function bath() { if (!needCat()) return; if (gesture && gesture.type === 'carry') endCarry(true); sim.bath(); }
function toggleLamp() { if (!needCat()) return; sim.S.lamp = !sim.S.lamp; world.setLamp(sim.S.lamp); Snd.play('pop'); renderButtons(); }
function cleanMess(m) {
  const S = sim.S;
  const i = S.messes.findIndex(x => x.id === m.id); if (i < 0) return;
  S.messes.splice(i, 1);
  if (m.type === 'shards') { S.vaseBroken = false; world.setVase(false); sim.log('You swept up the vase and glued it back together. For now.'); }
  else sim.log(m.type === 'hairball' ? 'You cleaned up the hairball.' : 'You cleaned up the accident.');
  S.stress = Math.max(0, S.stress - 3);
  world.syncMesses(S.messes); Snd.play('sweep');
}

/* ================= Laser + wand objects ================= */
const laserDot = new T.Mesh(new T.SphereGeometry(0.018, 10, 8), new T.MeshBasicMaterial({ color: 0xff2020 }));
const laserGlow = new T.Mesh(new T.SphereGeometry(0.05, 12, 10), new T.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.35, depthWrite: false }));
laserDot.add(laserGlow); laserDot.visible = false; world.scene.add(laserDot);
const wandObj = new T.Group();
{
  const fm = new T.MeshStandardMaterial({ color: 0xf06292, roughness: 0.8 });
  for (let i = 0; i < 3; i++) { const f = new T.Mesh(new T.ConeGeometry(0.025, 0.14, 6), i === 1 ? new T.MeshStandardMaterial({ color: 0x7ec8e3 }) : fm); f.rotation.z = Math.PI + (i - 1) * 0.5; f.position.set((i - 1) * 0.03, -0.06, 0); wandObj.add(f); }
  const bead = new T.Mesh(new T.SphereGeometry(0.018, 8, 6), new T.MeshStandardMaterial({ color: 0xffd54f })); wandObj.add(bead);
}
const wandLine = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 1, 0)]), new T.LineBasicMaterial({ color: 0x333333 }));
wandLine.frustumCulled = false;
world.scene.add(wandObj); world.scene.add(wandLine); wandObj.visible = false; wandLine.visible = false;
let wandGoal = new T.Vector3(), wandPrev = new T.Vector3(), wandHigh = false;

/* ================= Input ================= */
const pointers = new Map();
let gesture = null; // {type, ...}
let pinch = null;
function ndc(e) { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }; }
function hitCat(n) {
  if (!sim.S) return null;
  const rc = world.ray(n.x, n.y);
  const h = rc.intersectObjects(model.pickables, false)[0];
  if (!h) return null;
  // Make sure no furniture is in front of the cat
  const f = rc.intersectObjects(world.surfaces, false)[0];
  if (f && f.distance < h.distance - 0.05) return null;
  return h;
}
function hitInteract(n) {
  const rc = world.ray(n.x, n.y);
  const hits = rc.intersectObjects(world.interactables, false);
  return hits[0] || null;
}
function laserPoint(n) {
  const rc = world.ray(n.x, n.y);
  const h = rc.intersectObjects(world.surfaces, false)[0];
  return h ? h.point.clone().addScaledVector(h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new T.Vector3(0, 1, 0), 0.01) : null;
}
function clampRoom(p) { p.x = clamp(p.x, VPC.BOUNDS.minX, VPC.BOUNDS.maxX); p.z = clamp(p.z, VPC.BOUNDS.minZ, VPC.BOUNDS.maxZ); return p; }

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  Snd.init();
  $('tip').classList.remove('show');
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    if (gesture && gesture.type === 'carry') endCarry(false);
    if (gesture && gesture.type === 'toy') { gesture.toy.held = false; }
    gesture = null;
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    sim.laser.active = false; sim.wand.active = false;
    return;
  }
  if (pointers.size > 2) return;
  const n = ndc(e);
  if (e.button === 2 || e.button === 1) { gesture = { type: 'orbit', x: e.clientX, y: e.clientY }; return; }
  if (!sim.S) { gesture = { type: 'orbit', x: e.clientX, y: e.clientY }; return; }
  if (tool === 'laser') { updateLaser(n); gesture = { type: 'laser' }; return; }
  if (tool === 'wand') { wandHigh = e.pointerType === 'mouse'; updateWand(n); gesture = { type: 'wand' }; return; }
  if (tool === 'treat') {
    const p = world.floorPoint(n.x, n.y);
    if (p && sim.S) {
      clampRoom(p);
      if (spend(VPC.PRICES.treat)) { world.spawnTreat(p.x, p.z); toast('Treat tossed!'); }
    }
    gesture = { type: 'orbit', x: e.clientX, y: e.clientY, moved: 0 };
    return;
  }
  // Hand / brush
  const ch = hitCat(n);
  if (ch) {
    gesture = { type: 'cat', x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0, acc: 0, strokes: 0 };
    canvas.style.cursor = 'grabbing';
    return;
  }
  const ih = tool === 'hand' ? hitInteract(n) : null;
  if (ih && ih.object.userData.ia) {
    const ia = ih.object.userData.ia;
    if (ia.id === 'toy' && !ia.toy.carriedBy) {
      const toy = ia.toy;
      toy.held = true; toy.vel.set(0, 0, 0);
      gesture = { type: 'toy', toy, hist: [], x: e.clientX, y: e.clientY, moved: 0 };
      return;
    }
    gesture = { type: 'click', ia, x: e.clientX, y: e.clientY, moved: 0 };
    return;
  }
  gesture = { type: 'orbit', x: e.clientX, y: e.clientY, moved: 0 };
});
canvas.addEventListener('pointermove', e => {
  const prev = pointers.get(e.pointerId);
  if (prev) { prev.px = prev.x; prev.py = prev.y; prev.x = e.clientX; prev.y = e.clientY; }
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    world.zoom(pinch.d / d);
    world.rotate(mx - pinch.mx, my - pinch.my);
    pinch = { d, mx, my };
    return;
  }
  const n = ndc(e);
  if (tool === 'laser' && (e.pointerType === 'mouse' ? !(gesture && gesture.type === 'orbit') : gesture && gesture.type === 'laser')) updateLaser(n);
  if (tool === 'wand' && (e.pointerType === 'mouse' ? !(gesture && gesture.type === 'orbit') : gesture && gesture.type === 'wand')) updateWand(n);
  if (!gesture) { if (e.pointerType === 'mouse') hover(e, n); return; }
  const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
  switch (gesture.type) {
    case 'orbit': world.rotate(dx, dy); gesture.x = e.clientX; gesture.y = e.clientY; gesture.moved += Math.abs(dx) + Math.abs(dy); if (gesture.moved > 6) follow && (followPause = 2); break;
    case 'cat': {
      const d = Math.hypot(dx, dy);
      gesture.moved += d; gesture.acc += d; gesture.x = e.clientX; gesture.y = e.clientY;
      while (gesture.acc > 26) {
        gesture.acc -= 26;
        const h = hitCat(n);
        if (!h) continue;
        stroke(model.zoneFor(h));
        gesture.strokes++;
      }
      break;
    }
    case 'carry': moveCarry(n); break;
    case 'toy': {
      gesture.moved += Math.hypot(dx, dy); gesture.x = e.clientX; gesture.y = e.clientY;
      const p = world.floorPoint(n.x, n.y, 0.3);
      if (p) { clampRoom(p); gesture.toy.pos.set(p.x, 0.3, p.z); gesture.toy.mesh.position.copy(gesture.toy.pos); gesture.hist.push({ t: performance.now(), x: p.x, z: p.z }); if (gesture.hist.length > 8) gesture.hist.shift(); }
      break;
    }
    case 'click': gesture.moved += Math.hypot(dx, dy); if (gesture.moved > 8) gesture = { type: 'orbit', x: e.clientX, y: e.clientY, moved: 9 }; break;
  }
});
function pointerEnd(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; gesture = null; return; }
  if (e.pointerType !== 'mouse') { if (tool === 'laser') { sim.laser.active = false; laserDot.visible = false; } if (tool === 'wand') { sim.wand.active = false; } }
  if (tool === 'wand' && e.pointerType === 'mouse') wandHigh = false;
  canvas.style.cursor = '';
  if (!gesture) return;
  const g = gesture; gesture = null;
  switch (g.type) {
    case 'cat':
      if (g.moved < 8 && g.strokes === 0) { const h = hitCat(ndc(e)); if (h) stroke(model.zoneFor(h)); }
      break;
    case 'carry': endCarry(false, ndc(e)); break;
    case 'toy': {
      const toy = g.toy; toy.held = false;
      const h = g.hist; const now = performance.now();
      const last = h[h.length - 1];
      let prev = null;
      for (let i = h.length - 2; i >= 0; i--) { prev = h[i]; if (last.t - h[i].t > 40) break; }
      if (last && prev && now - last.t < 160) {
        const a = prev, b = last, dt = Math.max(0.016, (b.t - a.t) / 1000);
        let vx = (b.x - a.x) / dt, vz = (b.z - a.z) / dt; const sp = Math.hypot(vx, vz), max = 6;
        if (sp > max) { vx *= max / sp; vz *= max / sp; }
        toy.vel.set(vx, Math.min(2.5, sp * 0.25), vz);
      }
      if (g.moved < 6 && toy.gift) { sim.acceptGift(toy); Snd.play('coin'); }
      break;
    }
    case 'click': if (g.moved < 8) clickInteract(g.ia); break;
  }
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('pointerleave', e => {
  if (e.pointerType === 'mouse') { if (tool === 'laser') { sim.laser.active = false; laserDot.visible = false; } if (tool === 'wand') sim.wand.active = false; $('tip').classList.remove('show'); }
});
canvas.addEventListener('wheel', e => { e.preventDefault(); world.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
canvas.addEventListener('dblclick', e => {
  const h = hitCat(ndc(e));
  if (h) { follow = true; world.orbit.r = Math.min(world.orbit.r, 3.2); renderButtons(); toast(`Following ${sim.S.name}`); }
});
let followPause = 0;

function stroke(zone) {
  const r = tool === 'brush' ? sim.brush(zone) : sim.pet(zone);
  if (!r) return;
  if (r === 'like' && Math.random() < 0.35) floatFx(pick(['💗', 'purr~', '✨']), '#d0679a');
  if (r === 'dislike' && Math.random() < 0.5) floatFx(pick(['😾', '!', '💢']), '#c0392b');
  if (r === 'woke') floatFx('😾', '#c0392b');
  if (r === 'sleepy-purr' && Math.random() < 0.3) floatFx('purr…', '#8fa6e6');
  if (tool === 'brush' && Math.random() < 0.25) floatFx('✨', '#c9a227');
}
function clickInteract(ia) {
  const S = sim.S; if (!S) return;
  switch (ia.id) {
    case 'food': addFood(false); break;
    case 'water': refillWater(); break;
    case 'litter': scoop(); break;
    case 'lamp': toggleLamp(); break;
    case 'mess': cleanMess(ia.mess); break;
    case 'window': if (world.bird.visible) toast('A bird! Watch the cat\'s tail twitch.'); break;
    default: break;
  }
}
/* Carrying the cat */
function startCarry() {
  if (!sim.pickup()) return false;
  gesture = { type: 'carry' };
  follow = false;
  return true;
}
function moveCarry(n) {
  const p = world.floorPoint(n.x, n.y, 0.55);
  if (!p) return;
  clampRoom(p);
  const c = world.camera.position;
  sim.carryTo(p.x, 0.55, p.z, Math.atan2(c.x - p.x, c.z - p.z));
}
function endCarry(forced, n) {
  if (!sim.act || sim.act.name !== 'carried') { gesture = null; return; }
  const K = sim.K;
  let spot = null;
  for (const id of ['bed', 'sofa', 'box', 'treeLow', 'treeTop', 'sill']) {
    const p = VPC.SPOTS[id].pos;
    const r = id === 'sofa' ? 0.7 : 0.35;
    if (Math.hypot(K.x - p[0], K.z - p[2]) < r) { spot = id; break; }
  }
  if (forced) { spot = null; sim.say('*wriggles free*', 1400); }
  if (spot === 'sofa' || spot === 'bed') sim.log(`You put ${sim.S.name} on the ${VPC.SPOTS[spot].label}.`);
  sim.drop(K.x, K.z, spot);
  if (gesture && gesture.type === 'carry') gesture = null;
}
function updateLaser(n) {
  const p = laserPoint(n);
  if (!p) { sim.laser.active = false; laserDot.visible = false; return; }
  laserDot.position.copy(p); laserDot.visible = true;
  sim.laser.point.copy(p); sim.laser.active = true;
}
function updateWand(n) {
  const p = world.floorPoint(n.x, n.y);
  if (!p) return;
  clampRoom(p);
  wandGoal.set(p.x, 0, p.z);
  sim.wand.active = true;
  wandObj.visible = true; wandLine.visible = true;
}
let hoverT = 0;
function hover(e, n) {
  const now = performance.now(); if (now - hoverT < 60) return; hoverT = now;
  const tip = $('tip');
  let label = null;
  if (sim.S && (tool === 'hand' || tool === 'brush')) {
    const ch = hitCat(n);
    if (ch) {
      const z = model.zoneFor(ch);
      label = `${sim.S.name}: ${tool === 'hand' ? 'stroke to pet, hold to pick up' : 'stroke to brush'} (${VPC.ZONE_LABEL[z] || z})`;
      canvas.style.cursor = 'grab';
    } else if (tool === 'hand') {
      const ih = hitInteract(n);
      if (ih && ih.object.userData.ia) { label = ih.object.userData.ia.label(); canvas.style.cursor = 'pointer'; }
      else canvas.style.cursor = '';
    }
  }
  if (label) { tip.textContent = label; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; tip.classList.add('show'); }
  else tip.classList.remove('show');
}

/* ================= Adoption / settings ================= */
let draft = { coat: 'orange', traits: VPC.rollTraits(), seed: 1 };
const NAMES = ['Mochi', 'Miso', 'Biscuit', 'Pepper', 'Noodle', 'Tofu', 'Luna', 'Mango', 'Pickles', 'Olive', 'Sushi', 'Waffles', 'Juniper', 'Pixel'];
function openAdopt() {
  started = false;
  $('swatches').innerHTML = Object.entries(VPC.COATS).map(([k, c]) => {
    const bg = c.pattern === 'calico' ? `conic-gradient(${c.base} 0 33%, ${c.patch} 0 66%, ${c.dark} 0)` : c.pattern === 'tuxedo' ? `linear-gradient(90deg,${c.base} 50%,${c.light} 50%)` : c.pattern === 'point' ? `radial-gradient(${c.base} 40%, ${c.dark} 75%)` : c.pattern === 'tabby' ? `repeating-linear-gradient(45deg,${c.base} 0 4px,${c.dark} 4px 7px)` : c.base;
    return `<button class="swatch" data-coat="${k}"><span class="dot" style="background:${bg}"></span>${c.name}</button>`;
  }).join('');
  $('adoptName').value = pick(NAMES);
  renderAdopt();
  $('adopt').classList.add('open');
  model.build(draft.coat, draft.seed); model.setScale(1.3);
  sim.K.x = 0.5; sim.K.z = 0.9; sim.K.y = 0; sim.K.at = null;
  model.setPose('sit');
  world.orbit.goalTarget.set(0.5, 0.35, 0.9); world.orbit.r = 3; world.orbit.theta = 0.55; world.orbit.phi = 1.15;
}
function renderAdopt() {
  document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('sel', b.dataset.coat === draft.coat));
  $('adoptTraits').innerHTML = draft.traits.map(t => `<div><b>${VPC.TRAITS[t].label}</b> ${esc(VPC.TRAITS[t].desc)}</div>`).join('');
}
$('swatches').addEventListener('click', e => {
  const b = e.target.closest('.swatch'); if (!b) return;
  draft.coat = b.dataset.coat; draft.seed = Math.floor(Math.random() * 9999);
  model.build(draft.coat, draft.seed); model.setScale(1.3); model.setPose('sit');
  renderAdopt();
});
$('rollBtn').addEventListener('click', () => { draft.traits = VPC.rollTraits(); renderAdopt(); });
$('adoptBtn').addEventListener('click', () => {
  Snd.init();
  const name = $('adoptName').value.trim().slice(0, 16) || pick(NAMES);
  sim.newCat(name, draft.coat, draft.traits);
  sim.S.seed = draft.seed; model.build(draft.coat, draft.seed); model.setScale(sim.stage().scale * 1.3);
  $('adopt').classList.remove('open');
  const coatName = VPC.COATS[draft.coat].name.toLowerCase();
  sim.log(`You adopted ${name}, ${/^[aeiou]/.test(coatName) ? 'an' : 'a'} ${coatName} kitten. Welcome home! 🏠`);
  begin();
  setTimeout(() => { say('Mew?'); Snd.play('meow'); }, 700);
  if (!getPref('help-seen')) { $('help').classList.add('open'); setPref('help-seen', '1'); }
  sim.save();
});
$('settingsBtn').addEventListener('click', () => $('settings').classList.add('open'));
$('helpBtn').addEventListener('click', () => $('help').classList.add('open'));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.modal').classList.remove('open')));
$('soundBtn').addEventListener('click', () => { Snd.init(); Snd.setOn(!Snd.on); $('soundBtn').textContent = Snd.on ? '🔊' : '🔇'; setPref('sound', Snd.on ? '1' : '0'); });
$('panelToggle').addEventListener('click', () => document.body.classList.toggle('panel-open'));
$('theme').addEventListener('change', e => { setTheme(e.target.value); setPref('theme', e.target.value); });
function setTheme(v) { if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; }
$('resetBtn').addEventListener('click', () => {
  if (!confirm(`Rehome ${sim.S ? sim.S.name : 'your cat'} and start over? This can't be undone.`)) return;
  sim.reset(); $('settings').classList.remove('open');
  draft = { coat: 'orange', traits: VPC.rollTraits(), seed: 1 };
  openAdopt();
});
try {
  const th = getPref('theme'); if (th) { setTheme(th); $('theme').value = th; }
  if (getPref('sound') === '0') { Snd.on = false; $('soundBtn').textContent = '🔇'; }
} catch (e) {}

function begin() {
  started = true;
  follow = true;
  world.orbit.r = 4.2; world.orbit.phi = 1.05; world.orbit.theta = 0.6;
  renderHUD(); renderPanel();
  document.body.classList.add('playing');
}

/* ================= Main loop ================= */
let last = performance.now(), lastHUD = 0, lastSave = 0, lastTime = -1;
function frame(now) {
  const realDt = Math.min(0.05, (now - last) / 1000); last = now;
  if (started && sim.S) {
    const simDt = realDt * speed;
    const steps = Math.max(1, Math.ceil(simDt / 0.034));
    for (let i = 0; i < steps; i++) { sim.update(simDt / steps); world.update(simDt / steps); }
    if (speed === 0) { sim._animate(0); }
    if (gesture && gesture.type === 'cat' && tool === 'hand' && gesture.moved < 10 && now - gesture.t0 > 450) startCarry();
    // Wand follows the pointer with a little lag and bob
    if (sim.wand.active) {
      const y = (wandHigh ? 0.65 : 0.3) + Math.sin(now / 260) * 0.03;
      const tgt = new T.Vector3(wandGoal.x, y, wandGoal.z);
      wandPrev.copy(wandObj.position);
      wandObj.position.lerp(tgt, 1 - Math.exp(-realDt * 9));
      sim.wand.pos.copy(wandObj.position);
      sim.wand.speed = wandPrev.distanceTo(wandObj.position) / Math.max(realDt, 0.001);
      const top = wandObj.position.clone().add(new T.Vector3(0.35, 0.9, 0.5));
      wandLine.geometry.setFromPoints([wandObj.position.clone().add(new T.Vector3(0, 0.02, 0)), top]);
    } else { wandObj.visible = false; wandLine.visible = false; }
    Snd.purr(sim.purr * (sim.asleep ? 0.6 : 1));
    if (now - lastHUD > 200) { renderHUD(); lastHUD = now; }
    if (now - lastSave > 5000) { sim.save(); lastSave = now; }
    const hr = sim.hour();
    if (Math.abs(hr - lastTime) > 0.02) { world.setTime(hr); lastTime = hr; }
    if (follow && followPause <= 0) world.orbit.goalTarget.set(sim.K.x, sim.K.y + 0.3, sim.K.z);
    followPause -= realDt;
  } else {
    // Adoption preview: the cat sits in the room looking at you
    world.update(realDt);
    model.group.position.set(sim.K.x, 0, sim.K.z);
    const c = world.camera.position;
    model.group.rotation.y = Math.atan2(c.x - sim.K.x, c.z - sim.K.z);
    model.update(realDt, {});
    if (lastTime < 0) { world.setTime(10); lastTime = 10; }
  }
  world.updateCamera(realDt);
  // Speech bubble follows the head
  if (bubble.classList.contains('show')) {
    if (now > bubbleUntil) bubble.classList.remove('show');
    const s = screenOf(model.headWorld(new T.Vector3()));
    bubble.style.left = s.x + 'px'; bubble.style.top = (s.y - 18) + 'px';
  }
  world.render();
  requestAnimationFrame(frame);
}
function onResize() { world.resize(); }
addEventListener('resize', onResize);
addEventListener('visibilitychange', () => { if (document.hidden) sim.save(); else if (sim.S && started) { const m = sim.catchUp(); if (m) toast(m); } });
addEventListener('pagehide', () => sim.save());

buildHUD();
if (window.matchMedia('(min-width: 900px)').matches) document.body.classList.add('panel-open');
const loaded = sim.load();
if (loaded) {
  begin();
  if (loaded === 'loaded') { const m = sim.catchUp(); if (m) setTimeout(() => toast(m), 600); }
  else sim.save();
} else openAdopt();
requestAnimationFrame(frame);
window.VPC_started = true;
{ const bootEl = $('boot'); if (bootEl) bootEl.remove(); }

window.virtualPetCat = { sim, world, model, setSpeed: v => { speed = v; renderButtons(); }, setTool };
})();
