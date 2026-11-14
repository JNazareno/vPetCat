/* Virtual Pet Cat: simulation (needs, utility AI, activities as generators, save/load) */
(function () {
'use strict';
const VPC = window.VPC = window.VPC || {};
const T = THREE;
const { SPOTS, POINTS, BOUNDS, BLOCKERS } = VPC;

const SAVE_KEY = 'virtual-pet-cat-v2';
const LEGACY_3D_KEY = 'whisker-room-3d-v2'; // saves from before the rename
const OLD_SAVE_KEY = 'whisker-room-v1';     // saves from the 2D prototype

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

const TRAITS = {
  playful:     { label: 'Playful',     desc: 'Lives for the hunt. Gets bored quickly.', fun: 1.35, play: 1.6, energy: 1.1 },
  lazy:        { label: 'Lazy',        desc: 'Naps a lot and plays a little.', energy: 0.75, sleepy: 1.5, play: 0.7 },
  cuddly:      { label: 'Cuddly',      desc: 'Loves laps, petting and being held.', petLimit: 1.8, bond: 1.4, hold: 2, social: 1.3 },
  aloof:       { label: 'Aloof',       desc: 'Affection on its own terms. Short fuse.', petLimit: 0.55, bond: 0.75, hold: 0.4, social: 0.6 },
  foodie:      { label: 'Foodie',      desc: 'Always hungry. Will wake up for treats.', hunger: 1.35, treat: 1.6 },
  mischievous: { label: 'Mischievous', desc: 'Shelves are for clearing. Sofas are for scratching.', knock: 3.5, sofa: 3 },
  vocal:       { label: 'Vocal',       desc: 'Has opinions and will share them.', meow: 2.5 },
  tidy:        { label: 'Tidy',        desc: 'Grooms constantly and hates a dirty litter box.', groom: 1.9, picky: true, hairball: 1.5 },
  curious:     { label: 'Curious',     desc: 'Watches birds, investigates everything.', look: 2, explore: 1.6 },
};
const ZONES = ['head', 'cheek', 'chin', 'back', 'rump', 'belly', 'tail', 'paws'];
const ZONE_LABEL = { head: 'head scratches', cheek: 'cheek rubs', chin: 'chin scratches', back: 'long back strokes', rump: 'base-of-tail pats', belly: 'belly rubs', tail: 'tail touching', paws: 'paw touching', brush: 'brushing' };
const STAGES = [
  { id: 'kitten', label: 'Kitten', until: 2, scale: 0.74, energy: 1.25, fun: 1.25 },
  { id: 'junior', label: 'Junior', until: 5, scale: 0.88, energy: 1.1, fun: 1.1 },
  { id: 'adult',  label: 'Adult',  until: Infinity, scale: 1, energy: 1, fun: 1 },
];
const PRICES = { wet: 4, treat: 2, catnip: 8 };
VPC.TRAITS = TRAITS; VPC.ZONE_LABEL = ZONE_LABEL; VPC.PRICES = PRICES; VPC.STAGES = STAGES;

function rollTraits() {
  const keys = Object.keys(TRAITS);
  const clash = { cuddly: 'aloof', aloof: 'cuddly', lazy: 'playful', playful: 'lazy' };
  const a = pick(keys); let b = pick(keys);
  while (b === a || clash[a] === b) b = pick(keys);
  return [a, b];
}
function rollPrefs(traits) {
  const p = { head: rand(0.6, 1.3), cheek: rand(0.8, 1.5), chin: rand(0.7, 1.5), back: rand(0.2, 1.1), rump: rand(-0.6, 1.2), belly: rand(-1.2, -0.2), tail: rand(-1.1, -0.5), paws: rand(-0.9, 0.1), brush: rand(-0.4, 1.3) };
  if (traits.includes('cuddly')) { p.belly = rand(-0.3, 0.9); p.back += 0.3; }
  if (traits.includes('aloof')) for (const k in p) p[k] -= 0.25;
  // One zone the cat is unusually fond of
  const fav = pick(['head', 'cheek', 'chin', 'back', 'rump']); p[fav] = Math.max(p[fav], 1.45);
  return p;
}
VPC.rollTraits = rollTraits;

class Sim {
  constructor(world, model, hooks) {
    this.w = world; this.m = model; this.h = hooks;
    this.K = { x: 0.3, y: 0, z: 0.6, h: 0.6, at: null, speed: 0 };
    this.act = null;
    this.asleep = false;
    this.purr = 0; this.overstim = 0; this.lashT = 0; this.wiggle = 0; this.knead = 0;
    this.look = null;          // world point the cat is looking at
    this.laser = { active: false, point: new T.Vector3() };
    this.wand = { active: false, pos: new T.Vector3(), speed: 0 };
    this.cool = { laser: 0, wand: 0, toy: 0, meow: 0, attention: 0 };
    this.birdT = 0; this.birdTimer = 30;
    this.lastHour = null;
  }

  /* ---------- setup / persistence ---------- */
  newCat(name, coat, traits) {
    const clock = 8 * 60;
    this.S = {
      v: 2, name, coat, seed: Math.floor(rand(1, 9999)), traits, prefs: rollPrefs(traits), learned: {},
      clock, born: clock, coins: 25,
      needs: { hunger: 70, thirst: 75, energy: 80, fun: 70, hygiene: 90, social: 60 },
      bond: 15, stress: 10, bladder: 15, bowel: 20, clumps: 0, uncovered: false,
      food: 40, wet: false, water: 85, poops: 0, messes: [], vaseBroken: false, lamp: false, sofaScratches: 0,
      cat: { x: 0.3, z: 0.6, h: 0.6, at: null }, toys: {},
      stats: { catches: 0, pets: 0, gifts: 0, meals: 0 },
      day: this._newDay(), log: [], lastReal: Date.now(), stage: 'kitten',
    };
    this._applyLoaded();
    return this.S;
  }
  _newDay() { return { meals: 0, sleep: 0, play: 0, pets: 0, pees: 0, poops: 0, accidents: 0, moodSum: 0, moodN: 0 }; }
  save() {
    if (!this.S) return;
    const S = this.S;
    S.cat = { x: this.K.x, z: this.K.z, h: this.K.h, at: this.K.at && SPOTS[this.K.at] ? this.K.at : null };
    if (this.act && this.act.name === 'carried') S.cat.at = null;
    S.toys = {}; for (const t of this.w.toys) S.toys[t.id] = [t.pos.x, t.pos.z];
    S.lastReal = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
  }
  load() {
    let S = null;
    try { const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_3D_KEY); if (raw) S = JSON.parse(raw); } catch (e) {}
    if (S && S.v === 2) { this.S = S; this._applyLoaded(); return 'loaded'; }
    // Bring a cat over from the 2D prototype if there is one
    try {
      const old = JSON.parse(localStorage.getItem(OLD_SAVE_KEY) || 'null');
      if (old && old.v === 1 && old.name) {
        const coat = VPC.COATS[old.coat] ? old.coat : 'orange';
        const traits = (old.traits || []).filter(t => TRAITS[t]);
        this.newCat(old.name, coat, traits.length === 2 ? traits : rollTraits());
        this.S.bond = clamp(old.stats && old.stats.bond || 15);
        this.S.coins = Math.max(25, old.coins || 0);
        this.S.born = this.S.clock - Math.min(10, (old.age || 0) / 1440 * 24) * 1440 / 24;
        this.log(`${old.name} moved into the new 3D apartment. 🏠`);
        return 'migrated';
      }
    } catch (e) {}
    return null;
  }
  reset() { try { for (const k of [SAVE_KEY, LEGACY_3D_KEY, OLD_SAVE_KEY]) localStorage.removeItem(k); } catch (e) {} this.S = null; }
  _applyLoaded() {
    const S = this.S, K = this.K;
    // Fields added after the first 3D release
    if (S.bowel == null) S.bowel = 20;
    if (S.clumps == null) S.clumps = 0;
    if (S.uncovered == null) S.uncovered = false;
    if (S.day && S.day.pees == null) Object.assign(S.day, { pees: 0, poops: 0, accidents: 0 });
    S.stats.pees = S.stats.pees || 0; S.stats.poops = S.stats.poops || 0; S.stats.accidents = S.stats.accidents || 0;
    K.x = S.cat.x; K.z = S.cat.z; K.h = S.cat.h; K.at = S.cat.at || null;
    K.y = K.at ? SPOTS[K.at].pos[1] : 0;
    if (K.at) { K.x = SPOTS[K.at].pos[0]; K.z = SPOTS[K.at].pos[2]; }
    for (const t of this.w.toys) if (S.toys && S.toys[t.id]) { t.pos.set(S.toys[t.id][0], t.radius, S.toys[t.id][1]); t.vel.set(0, 0, 0); }
    this.m.build(S.coat, S.seed);
    this.m.setScale(this.stage().scale * 1.3);
    this.act = null; this.asleep = false;
    this.syncWorld();
  }
  syncWorld() {
    const S = this.S, w = this.w;
    w.setFood(S.food, S.wet); w.setWater(S.water); w.setLitter(S.poops, S.clumps);
    w.setLamp(S.lamp); w.setVase(S.vaseBroken); w.setSofaScratches(S.sofaScratches); w.syncMesses(S.messes);
    this.updateStink();
  }

  /* ---------- helpers ---------- */
  tm(key, def = 1) {
    let m = def, found = false;
    for (const t of this.S.traits) {
      const v = TRAITS[t] && TRAITS[t][key];
      if (v === undefined) continue;
      if (typeof v === 'boolean') return v;
      m = found ? m * v : v; found = true;
    }
    return m;
  }
  has(t) { return this.S.traits.includes(t); }
  stage() { const d = (this.S.clock - this.S.born) / 1440; return STAGES.find(s => d < s.until); }
  /* Cats grow up fast here: they arrive at 8 weeks old and each game day is 8 weeks (about 2 months) of their life */
  ageWeeks() { return 8 + ((this.S.clock - this.S.born) / 1440) * 8; }
  ageText() {
    const w = this.ageWeeks();
    if (w < 12) return `${Math.floor(w)} wks old`;
    if (w < 52) { const m = Math.floor(w / 4.345); return `${m} month${m === 1 ? '' : 's'} old`; }
    const y = w / 52;
    return y < 1.05 ? '1 year old' : `${y.toFixed(1)} yrs old`;
  }
  hour() { return (this.S.clock % 1440) / 60; }
  day() { return Math.floor(this.S.clock / 1440) + 1; }
  isNight() { const h = this.hour(); return h < 6 || h >= 21.5; }
  log(m) { this.S.log.unshift({ t: this.S.clock, m }); this.S.log.length = Math.min(this.S.log.length, 60); this.h.log && this.h.log(m); }
  say(text, ms) { this.h.say(text, ms); if (/meow|mrr|mew|prrt/i.test(text)) this.h.sound('meow'); }
  fx(t, c) { this.h.fx(t, c); }
  pose(name) { this.m.setPose(name); }
  addMess(type, x, z) {
    x = clamp(x, BOUNDS.minX + 0.1, BOUNDS.maxX - 0.1); z = clamp(z, BOUNDS.minZ + 0.1, BOUNDS.maxZ - 0.1);
    this.S.messes.push({ id: Math.random().toString(36).slice(2, 9), type, x, z });
    this.w.syncMesses(this.S.messes);
  }
  litterDirt() { return this.S.poops + this.S.clumps * 0.6 + (this.S.uncovered ? 1 : 0); }
  litterLimit() { return this.tm('picky', false) ? 2 : 3.2; }
  bathroomUrge() { return Math.max(this.S.bladder, this.S.bowel); }
  updateStink() {
    const S = this.S, d = this.litterDirt(), src = [];
    if (d >= 1.5) src.push({ x: 2.46, y: 0.15, z: 1.97, k: Math.min(1, (d - 1) / 3) });
    for (const m of S.messes) if (m.type === 'poop' || m.type === 'puddle') src.push({ x: m.x, y: 0.02, z: m.z, k: m.type === 'poop' ? 0.9 : 0.6 });
    this.w.setStink(src);
  }
  mood() {
    const N = this.S.needs, S = this.S;
    if (this.asleep) return ['😴', 'Sleeping'];
    if (this.act && this.act.name === 'swat') return ['😾', 'Overstimulated'];
    if (this.act && this.act.name === 'zoomies') return ['🙀', 'ZOOMIES'];
    if (S.stress > 70) return ['😿', 'Stressed'];
    if (N.hunger < 18) return ['😿', 'Starving'];
    if (N.thirst < 18) return ['😿', 'Thirsty'];
    if (this.litterDirt() >= this.litterLimit()) return ['😾', 'Disgusted by the litter box'];
    if (this.bathroomUrge() > 92 && !this.asleep) return ['🙀', 'Really needs the litter box'];
    if (N.energy < 18) return ['🥱', 'Exhausted'];
    if (N.fun < 20) return ['😾', 'Bored'];
    if (N.social < 20) return ['😿', 'Lonely'];
    if (N.hygiene < 25) return ['🙀', 'Scruffy'];
    const m = this.moodScore();
    if (m > 80 && S.bond > 55) return ['😻', 'Blissful'];
    if (m > 62) return ['😺', 'Content'];
    if (m > 45) return ['🐱', 'Meh'];
    return ['😾', 'Grumpy'];
  }
  moodScore() { const N = this.S.needs; return clamp((N.hunger + N.thirst + N.energy + N.fun + N.hygiene + N.social) / 6 - this.S.stress * 0.3); }
  thought() { return this.act ? this.act.thought : 'Thinking about cat things'; }

  /* ---------- activity runner ---------- */
  start(name, gen, thought, priority = 0) {
    if (this.asleep && name !== 'sleep') { this.asleep = false; }
    this.purr = name === 'petted' ? this.purr : 0;
    this.knead = 0; this.wiggle = 0; this.look = null; this.lick = false;
    if (this.inJump) { this.inJump = false; if (this.K.at === null && this.K.y > 0 && name !== 'carried') this.K.y = 0; }
    if (this.carriedToy && name !== 'gift') this._dropMouth();
    this.act = { name, gen, thought, priority, t: 0 };
  }
  _dropMouth() { const t = this.carriedToy; if (!t) return; t.carriedBy = null; t.pos.y = 0.2; t.vel.set(0, 0, 0); this.carriedToy = null; }

  update(dt) {
    const S = this.S;
    if (!S) return;
    this._needs(dt);
    this._world(dt);
    this._stimuli(dt);
    if (!this.act) this.choose();
    try {
      this.act.t += dt;
      const r = this.act.gen.next(dt);
      if (r.done) this.act = null;
    } catch (e) {
      console.error(e); this.act = null; this.K.speed = 0;
    }
    this._animate(dt);
  }

  _needs(dt) {
    const S = this.S, N = S.needs, h = dt / 60; // game hours
    const prevDay = this.day();
    S.clock += dt;
    if (this.day() !== prevDay) this._dailyReport(prevDay);
    const st = this.stage();
    const sleeping = this.asleep;
    N.hunger -= 6.5 * h * this.tm('hunger');
    N.thirst -= 7.5 * h;
    if (sleeping) {
      const spot = this.sleepComfort || 1;
      N.energy += 15 * h * spot * (S.lamp && this.isNight() ? 0.85 : 1);
      S.day.sleep += dt;
    } else N.energy -= 5.5 * h * this.tm('energy') * st.energy;
    N.fun -= (sleeping ? 1.5 : 8.5) * h * this.tm('fun') * st.fun;
    S.bladder = Math.min(100, S.bladder + 3 * h);
    S.bowel = Math.min(100, S.bowel + 1.5 * h);
    const dirt = this.litterDirt();
    const floorWaste = S.messes.filter(m => m.type === 'poop' || m.type === 'puddle').length;
    N.hygiene -= 2.2 * h + (dirt >= 3 ? 2 * h : 0) + floorWaste * 1.5 * h;
    N.social -= (sleeping ? 1 : 4.5) * h * this.tm('social');
    let stressUp = 0;
    if (dirt >= this.litterLimit()) stressUp += 6;
    stressUp += floorWaste * 4;
    if (this.bathroomUrge() > 95) stressUp += 6;
    if (S.messes.length > 2) stressUp += 3;
    if (N.hunger < 15 || N.thirst < 15) stressUp += 8;
    S.stress = clamp(S.stress + (stressUp - 7) * h);
    if (N.hunger < 12 || N.fun < 12 || N.social < 12) S.bond = clamp(S.bond - 1.2 * h);
    else if (this.moodScore() > 65) S.bond = clamp(S.bond + 0.35 * h);
    for (const k in N) N[k] = clamp(N[k]);
    S.day.moodSum += this.moodScore() * dt; S.day.moodN += dt;
    this.overstim = Math.max(0, this.overstim - 11 * dt);
    this.lashT = Math.max(0, this.lashT - dt);
    this.purr = Math.max(0, this.purr - dt * (this.act && this.act.name === 'petted' ? 0.25 : 0.8));
    for (const k in this.cool) this.cool[k] = Math.max(0, this.cool[k] - dt);
    if (this.stage().id !== S.stage) {
      S.stage = this.stage().id;
      this.m.setScale(this.stage().scale * 1.3);
      this.log(`🎉 ${S.name} grew into ${S.stage === 'adult' ? 'an adult' : 'a ' + this.stage().label.toLowerCase()}!`);
    }
  }
  _dailyReport(dayNum) {
    const S = this.S, d = S.day;
    const mood = d.moodN ? d.moodSum / d.moodN : this.moodScore();
    const coins = Math.round(mood / 10 + S.bond / 15);
    S.coins += coins;
    const word = mood > 75 ? 'a great day' : mood > 55 ? 'a good day' : mood > 40 ? 'an okay day' : 'a rough day';
    this.log(`📅 Day ${dayNum} recap: ${S.name} had ${word}. ${d.meals} meals, slept ${Math.round(d.sleep / 60)} h, played ${Math.round(d.play)} min, ${d.pets} pets, ${d.pees || 0} pees and ${d.poops || 0} poops${d.accidents ? ` (${d.accidents} outside the box)` : ''}. Allowance +${coins} 🪙. ${S.name} is now ${this.ageText()}.`);
    S.day = this._newDay();
  }
  _world(dt) {
    // Visiting birds during the day
    const w = this.w;
    if (w.bird.visible) {
      this.birdT -= dt;
      if (this.birdT <= 0) { w.bird.visible = false; }
    } else if (w.daylight > 0.5) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) { w.bird.visible = true; this.birdT = rand(25, 55); this.birdTimer = rand(90, 240); this.h.sound('chirp'); }
    }
    // Gifts expire
    for (const t of w.toys) if (t.gift && this.S.clock > t.gift) t.gift = null;
  }

  /* ---------- stimuli: things that can interrupt what the cat is doing ---------- */
  _stimuli(dt) {
    const S = this.S, N = S.needs, a = this.act;
    const pr = a ? a.priority : -1;
    if (this.inJump) return;
    const awakeEnough = !this.asleep || (N.energy > 55 && Math.random() < dt * 0.4);
    if (pr >= 3) return;
    // Treats
    const treat = this.w.treats.find(t => t.landed);
    if (treat && pr < 2 && (!this.asleep || this.has('foodie') || N.hunger < 50)) {
      return this.start('treat', this.actTreat(treat), 'A treat!', 2);
    }
    if (this.laser.active && pr < 2 && !this.cool.laser && N.energy > 15 && awakeEnough) {
      return this.start('laser', this.actLaser(), 'Must. Catch. Red. Dot.', 2);
    }
    if (this.wand.active && pr < 2 && !this.cool.wand && N.energy > 15 && awakeEnough) {
      return this.start('wand', this.actWand(), 'Stalking the feather', 2);
    }
    if (pr < 1 && !this.asleep && !this.cool.toy && N.energy > 20) {
      for (const t of this.w.toys) {
        if (t.held || t.carriedBy) continue;
        const sp = Math.hypot(t.vel.x, t.vel.z);
        if (sp > 0.7 && Math.random() < dt * 4 * this.tm('play')) {
          return this.start('chase', this.actPlayToy(t, true), `Chasing the ${t.label.toLowerCase()}`, 1);
        }
      }
    }
  }

  /* ---------- choosing what to do ---------- */
  choose() {
    const S = this.S, N = S.needs, w = this.w;
    const night = this.isNight();
    const opts = [];
    const add = (score, make) => { if (score > 0) opts.push({ score, make }); };
    const floorToy = w.toys.filter(t => !t.held && !t.carriedBy);
    const beam = w.sunbeam();
    add(S.bladder >= 72 ? 300 + S.bladder : 0, () => this.start('pee', this.actToilet('pee'), 'Needs to pee'));
    add(S.bowel >= 80 ? 300 + S.bowel : 0, () => this.start('poop', this.actToilet('poop'), 'Needs to poop'));
    add(S.food > 1 && N.hunger < 72 ? (100 - N.hunger) * 1.3 : 0, () => this.start('eat', this.actEat(), 'Going to eat'));
    add(S.food <= 1 && N.hunger < 40 && !this.cool.meow ? (100 - N.hunger) * 1.1 : 0, () => this.start('beg', this.actBeg(), 'The food bowl is empty!'));
    add(S.water > 1 && N.thirst < 70 ? (100 - N.thirst) * 1.2 : 0, () => this.start('drink', this.actDrink(), 'Getting a drink'));
    add(S.water <= 1 && N.thirst < 40 && !this.cool.meow ? (100 - N.thirst) : 0, () => this.start('beg', this.actBeg('water'), 'The water bowl is empty!'));
    add(N.energy < 60 ? (100 - N.energy) * (night ? 1.5 : 1) * this.tm('sleepy') + (night && !S.lamp ? 20 : 0) : 0, () => this.start('sleep', this.actSleep(), 'Looking for a nap spot'));
    add((100 - N.hygiene) * 0.55 * this.tm('groom') + 5, () => this.start('groom', this.actGroom(rand(5, 9)), 'Grooming'));
    if (floorToy.length) add((100 - N.fun) * 0.6 * this.tm('play') * (N.energy / 100), () => { const t = pick(floorToy); this.start('play', this.actPlayToy(t, false), `Playing with the ${t.label.toLowerCase()}`); });
    add(w.daylight > 0.3 ? 10 * this.tm('look') + (w.bird.visible ? 80 : 0) : 3, () => this.start('lookout', this.actLookout(), w.bird.visible ? 'BIRD!' : 'Watching the world outside'));
    add(12 * this.tm('explore'), () => this.start('wander', this.actWander(), 'Patrolling the apartment'));
    add(N.social < 55 && !this.cool.attention ? (100 - N.social) * 0.75 * this.tm('social') : 0, () => this.start('attention', this.actAttention(), 'Wants your attention'));
    add(8 + (100 - N.fun) * 0.08 + S.stress * 0.1, () => this.start('scratch', this.actScratch(), 'Sharpening claws'));
    add(!S.vaseBroken ? 2.5 * this.tm('knock') * (N.fun < 40 ? 3 : 1) : 0, () => this.start('knock', this.actKnock(), 'Eyeing the vase on the shelf...'));
    add(night && N.energy > 60 ? 16 * this.tm('play') : 1.5, () => this.start('zoomies', this.actZoomies(), 'ZOOMIES'));
    const mouse = floorToy.find(t => t.id === 'mouse');
    add(S.bond > 55 && mouse && !mouse.gift ? 5 : 0, () => this.start('gift', this.actGift(mouse), 'Bringing you a present'));
    add(9, () => this.start('perch', this.actPerch(), 'Finding a good vantage point'));
    add(beam && N.energy < 90 ? 22 : 0, () => this.start('sunbath', this.actSunbath(beam), 'Soaking up the sunbeam'));
    add(10, () => this.start('rest', this.actRest(rand(5, 10)), 'Just sitting'));
    opts.sort((a, b) => b.score - a.score);
    const top = opts.slice(0, 4);
    const total = top.reduce((s, o) => s + Math.pow(o.score, 1.6), 0);
    let r = Math.random() * total;
    for (const o of top) { r -= Math.pow(o.score, 1.6); if (r <= 0) return o.make(); }
    top[0].make();
  }

  /* ---------- movement primitives (generators; `yield` returns dt) ---------- */
  _push() {
    const K = this.K;
    if (K.at) return;
    K.x = clamp(K.x, BOUNDS.minX, BOUNDS.maxX); K.z = clamp(K.z, BOUNDS.minZ, BOUNDS.maxZ);
    const r = 0.12;
    for (const b of BLOCKERS) {
      if (K.x > b.x0 - r && K.x < b.x1 + r && K.z > b.z0 - r && K.z < b.z1 + r) {
        const dl = K.x - (b.x0 - r), dr = (b.x1 + r) - K.x, dn = K.z - (b.z0 - r), df = (b.z1 + r) - K.z;
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) K.x = b.x0 - r; else if (m === dr) K.x = b.x1 + r; else if (m === dn) K.z = b.z0 - r; else K.z = b.z1 + r;
      }
    }
  }
  _step(tx, tz, spd, dt) {
    const K = this.K;
    const dx = tx - K.x, dz = tz - K.z, d = Math.hypot(dx, dz);
    if (d < 0.001) { K.speed = 0; return 0; }
    const want = Math.atan2(dx, dz);
    const diff = angDiff(want, K.h);
    const turn = (spd > 1 ? 9 : 5) * dt;
    K.h += clamp(diff, -turn, turn);
    const fwd = Math.abs(diff) > 1.3 ? 0.12 : Math.max(0.25, Math.cos(diff));
    const v = spd * fwd;
    const step = Math.min(v * dt, d);
    K.x += Math.sin(K.h) * step; K.z += Math.cos(K.h) * step;
    this._push();
    K.speed = v;
    return Math.hypot(tx - K.x, tz - K.z);
  }
  *walkTo(x, z, spd = 0.5, tol = 0.06) {
    x = clamp(x, BOUNDS.minX, BOUNDS.maxX); z = clamp(z, BOUNDS.minZ, BOUNDS.maxZ);
    this.pose(spd > 1.1 ? 'run' : 'walk');
    let best = Infinity, stuck = 0;
    while (true) {
      const dt = yield;
      const d = this._step(x, z, spd, dt);
      if (d < tol) break;
      if (d < best - 0.01) { best = d; stuck = 0; } else if ((stuck += dt) > 2.5) break;
    }
    this.K.speed = 0;
    this.pose('stand');
  }
  *face(angle) {
    const K = this.K;
    while (Math.abs(angDiff(angle, K.h)) > 0.06) {
      const dt = yield;
      K.h += clamp(angDiff(angle, K.h), -5 * dt, 5 * dt);
      K.speed = 0.15;
    }
    K.speed = 0;
  }
  *wait(sec, pose, each) {
    if (pose) this.pose(pose);
    let t = 0;
    while (t < sec) { const dt = yield; t += dt; if (each && each(dt, t) === false) break; }
  }
  *jumpTo(x, y, z, at, opts = {}) {
    const K = this.K;
    const dx = x - K.x, dz = z - K.z, dist = Math.hypot(dx, dz);
    if (dist > 0.02) yield* this.face(Math.atan2(dx, dz));
    const big = Math.abs(y - K.y) > 0.3;
    this.pose('crouch'); this.wiggle = big ? 0.5 : 0;
    yield* this.wait(opts.prep != null ? opts.prep : big ? 0.45 : 0.2);
    this.wiggle = 0;
    this.pose('leap');
    const x0 = K.x, y0 = K.y, z0 = K.z, h0 = K.h;
    const turn = opts.face != null ? angDiff(opts.face, h0) : 0;
    const apex = opts.apex != null ? opts.apex : Math.max(0.12, (y - y0 > 0.3 ? 0.32 : y - y0 > 0 ? 0.22 : 0.1) + dist * 0.08);
    const dur = opts.dur || (0.34 + Math.sqrt(Math.abs(y - y0) + dist) * 0.22);
    this.inJump = true;
    let t = 0;
    while (t < 1) {
      const dt = yield;
      t = Math.min(1, t + dt / dur);
      K.x = x0 + (x - x0) * t; K.z = z0 + (z - z0) * t;
      // Upward jumps rise first and then travel across, so the cat clears the edge it's landing on
      const vt = y > y0 + 0.2 ? 1 - (1 - t) * (1 - t) : t;
      K.y = y0 + (y - y0) * vt + apex * 4 * t * (1 - t);
      if (turn) K.h = h0 + turn * (t * t * (3 - 2 * t));
      K.speed = 0;
      if (opts.during) opts.during(t);
    }
    this.inJump = false;
    K.at = at;
    K.y = y;
    this.h.sound('thump', Math.min(1, Math.abs(y0 - y) + 0.3));
    this.pose('stand');
    yield* this.wait(0.12);
  }
  *descend() {
    const K = this.K, s = SPOTS[K.at];
    if (!s) { K.at = null; K.y = 0; return; }
    if (s.parent) { const p = SPOTS[s.parent].pos; yield* this.jumpTo(p[0], p[1], p[2], s.parent); }
    else { const a = s.approach; yield* this.jumpTo(a[0], 0, a[1], null); }
  }
  *goToSpot(id) {
    const K = this.K;
    if (K.at === id) return;
    const chain = []; for (let s = id; s; s = SPOTS[s].parent) chain.unshift(s);
    while (K.at && !chain.includes(K.at)) yield* this.descend();
    const startIdx = K.at ? chain.indexOf(K.at) + 1 : 0;
    if (!K.at) { const a = SPOTS[chain[0]].approach; yield* this.walkTo(a[0], a[1], Math.hypot(a[0] - K.x, a[1] - K.z) > 2.5 ? 0.75 : 0.5); }
    for (let i = startIdx; i < chain.length; i++) { const sp = SPOTS[chain[i]], p = sp.pos; yield* this.jumpTo(p[0], p[1], p[2], chain[i], { face: sp.face }); }
  }
  *goToFloor(x, z, spd) {
    while (this.K.at) yield* this.descend();
    yield* this.walkTo(x, z, spd || (Math.hypot(x - this.K.x, z - this.K.z) > 2.5 ? 0.75 : 0.5));
  }
  randomFloorPoint() {
    for (let i = 0; i < 20; i++) {
      const x = rand(-1.9, 1.9), z = rand(-1.25, 2.1);
      if (!BLOCKERS.some(b => x > b.x0 - 0.2 && x < b.x1 + 0.2 && z > b.z0 - 0.2 && z < b.z1 + 0.2)) return [x, z];
    }
    return [0, 0.5];
  }
  cameraFloorPoint(dist = 1.1) {
    const c = this.w.camera.position, t = this.w.orbit.target;
    let dx = c.x - t.x, dz = c.z - t.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    let x = clamp(t.x + dx * dist, -1.8, 2.0), z = clamp(t.z + dz * dist, -1.2, 2.1);
    return [x, z];
  }
  headingToCamera() { const c = this.w.camera.position; return Math.atan2(c.x - this.K.x, c.z - this.K.z); }

  /* ---------- activities ---------- */
  *actEat() {
    const p = POINTS.food, S = this.S, N = S.needs;
    yield* this.goToFloor(p.x, p.z);
    yield* this.face(p.face);
    this.pose('eat');
    this.act.thought = S.wet ? 'Enjoying wet food 😋' : 'Crunching kibble';
    let ate = 0, crunch = 0;
    while (S.food > 0.5 && N.hunger < 98) {
      const dt = yield;
      const a = Math.min(S.food, 5 * dt);
      S.food -= a; N.hunger = clamp(N.hunger + a * (S.wet ? 1.25 : 1)); S.bowel += a * 0.55; S.bladder += a * (S.wet ? 0.25 : 0.08); ate += a;
      if (S.wet) N.fun = clamp(N.fun + a * 0.08);
      if ((crunch -= dt) < 0) { crunch = 0.45; this.h.sound(S.wet ? 'slurp' : 'crunch'); }
      this.w.setFood(S.food, S.wet);
    }
    if (S.food <= 0.5) { S.food = 0; S.wet = false; this.w.setFood(0, false); }
    if (ate > 8) { S.day.meals++; S.stats.meals++; }
    this.lick = true;
    yield* this.wait(1.6, 'sit');
    this.lick = false;
    if (ate > 15 && Math.random() < 0.5) yield* this.actGroom(rand(3, 5));
  }
  *actDrink() {
    const p = POINTS.water, S = this.S, N = S.needs;
    yield* this.goToFloor(p.x, p.z);
    yield* this.face(p.face);
    this.pose('eat');
    this.act.thought = 'Lapping up water';
    let lap = 0;
    while (S.water > 0.5 && N.thirst < 98) {
      const dt = yield;
      const a = Math.min(S.water, 4 * dt);
      S.water -= a * 0.8; N.thirst = clamp(N.thirst + a * 1.4); S.bladder += a * 0.5;
      if ((lap -= dt) < 0) { lap = 0.3; this.h.sound('lap'); }
      this.w.setWater(S.water);
    }
    yield* this.wait(0.8, 'sit');
  }
  *actBeg(what = 'food') {
    const p = what === 'water' ? POINTS.water : POINTS.food;
    yield* this.goToFloor(p.x + 0.25, p.z);
    yield* this.face(this.headingToCamera());
    this.cool.meow = 40;
    for (let i = 0; i < 2 + Math.round(this.tm('meow')); i++) {
      this.pose('meow');
      this.say(i === 0 ? (what === 'water' ? 'Mrrow? The water is gone.' : pick(['MEOW. The bowl is empty.', 'Mrrrow? Food?', 'Feed me, human 🍽️'])) : pick(['Meow!', 'MRAOW.', 'Mew?']), 2000);
      yield* this.wait(0.7);
      yield* this.wait(rand(1.6, 2.6), 'sit');
    }
  }
  /* Peeing and pooping: sniff, dig, turn, squat, bury. Refuses a dirty box. */
  *actToilet(kind) {
    const S = this.S, N = S.needs;
    const pee = kind === 'pee';
    const verb = pee ? 'pee' : 'poop';
    yield* this.goToSpot('litter');
    // Sniff and inspect the box
    this.pose('sniff');
    yield* this.wait(rand(0.8, 1.4));
    const tooDirty = this.litterDirt() >= this.litterLimit();
    const stressMark = pee && S.stress > 70 && Math.random() < 0.35;
    if (tooDirty || stressMark) return yield* this.actAccident(kind, tooDirty ? 'dirty' : 'stress');
    // Dig a little hole, then turn around to get in position
    this.act.thought = pee ? 'Digging a spot to pee' : 'Digging a spot to poop';
    this.pose('crouch'); this.knead = 1; this.h.sound('dig');
    yield* this.wait(rand(1.0, 1.8));
    this.knead = 0;
    yield* this.turnAround();
    // Squat
    this.act.thought = pee ? 'Peeing… some privacy, please' : 'Pooping… don’t look';
    this.pose(verb);
    if (pee) { this.h.sound('trickle'); yield* this.wait(rand(3, 4.5)); }
    else {
      yield* this.wait(rand(4.5, 6.5), 'poop', (dt, t) => { this.m.pose.hipY = 0.12 + Math.sin(t * 9) * 0.004; });
      this.h.sound('plop');
    }
    if (pee) { S.clumps++; S.bladder = 0; S.day.pees++; S.stats.pees++; }
    else { S.poops++; S.bowel = 0; S.day.poops++; S.stats.poops++; }
    this.w.setLitter(S.poops, S.clumps);
    // Bury it (or not)
    yield* this.turnAround();
    const skipChance = this.has('tidy') ? 0 : 0.12 * (this.has('aloof') ? 2.5 : 1) * (this.has('mischievous') ? 2 : 1);
    if (Math.random() < skipChance) {
      S.uncovered = true;
      this.pose('sniff');
      yield* this.wait(0.8);
      this.log(`${S.name} didn't bother burying their ${verb}. The whole room knows. 🤢`);
    } else {
      this.act.thought = `Burying the ${verb}`;
      this.pose('crouch'); this.knead = 1; this.h.sound('dig');
      yield* this.wait(this.has('tidy') ? rand(3, 4.5) : rand(1.5, 2.5));
      this.knead = 0;
      this.pose('sniff'); yield* this.wait(0.6);
    }
    N.hygiene = clamp(N.hygiene - (pee ? 1.5 : 3));
    if (this.litterDirt() >= this.litterLimit()) this.log(`The litter box needs scooping. ${S.name} won't use it much longer like this.`);
    yield* this.descend();
    this.updateStink();
    // Post-poop zoomies are a real thing
    if (!pee && Math.random() < 0.3 * this.tm('play')) {
      this.say(pick(['!!!', 'I feel AMAZING', '*bolts out of the box*']), 1400);
      if (Math.random() < 0.4) this.log(`${S.name} sprinted out of the litter box like it was on fire. Post-poop zoomies.`);
      return yield* this.actZoomies(rand(3, 5));
    }
    if (this.has('tidy') || Math.random() < 0.3) yield* this.actGroom(rand(2, 4));
  }
  *turnAround() { yield* this.spin(Math.PI, 4.5); }
  /* Turn in place around the middle of the body (not the hips), like a real cat */
  *spin(angle, rate) {
    const K = this.K, c = 0.13 * this.m.group.scale.x; // hips -> middle of the body
    const cx = K.x + Math.sin(K.h) * c, cz = K.z + Math.cos(K.h) * c;
    const h0 = K.h; let turned = 0;
    this.pose('stand');
    while (turned < angle) {
      const dt = yield;
      turned = Math.min(angle, turned + dt * rate);
      K.h = h0 + turned;
      K.x = cx - Math.sin(K.h) * c; K.z = cz - Math.cos(K.h) * c;
      K.speed = 0.3;
    }
    K.speed = 0;
  }
  /* Going outside the box: pee on something soft, poop right next to the box */
  *actAccident(kind, reason) {
    const S = this.S, pee = kind === 'pee';
    this.say(reason === 'dirty' ? pick(['Ew. No.', '…this box is filthy.', 'Absolutely not.']) : pick(['*anxious meow*', 'Mrrrow…']), 2000);
    this.h.sound('grumble');
    yield* this.wait(1.2, 'stand');
    yield* this.descend();
    let spot;
    if (pee) {
      const r = Math.random();
      if (r < 0.45) spot = { x: rand(-0.3, 0.8), z: rand(0.1, 0.7), where: 'on the rug' };
      else if (r < 0.7) spot = { x: SPOTS.bed.pos[0], z: SPOTS.bed.pos[2], where: 'in their bed', bed: true };
      else spot = { x: rand(1.2, 1.8), z: rand(1.4, 2.1), where: 'on the floor' };
    } else spot = { x: rand(1.75, 1.95), z: rand(1.6, 2.2), where: 'right next to the litter box' };
    this.act.thought = pee ? 'Looking for somewhere soft…' : 'Not using THAT box';
    if (spot.bed) yield* this.goToSpot('bed'); else yield* this.walkTo(spot.x, spot.z, 0.55);
    this.pose('sniff'); this.knead = 1;
    yield* this.wait(0.9);
    this.knead = 0;
    yield* this.turnAround();
    this.pose(kind);
    if (pee) this.h.sound('trickle');
    yield* this.wait(pee ? rand(3, 4) : rand(4, 5.5));
    const bx = this.K.x - Math.sin(this.K.h) * 0.13, bz = this.K.z - Math.cos(this.K.h) * 0.13;
    this.addMess(pee ? 'puddle' : 'poop', spot.bed ? SPOTS.bed.pos[0] : bx, spot.bed ? SPOTS.bed.pos[2] : bz);
    if (pee) S.bladder = 0; else S.bowel = 0;
    S.day.accidents++; S.stats.accidents++;
    S.stress = clamp(S.stress + 12); S.bond = clamp(S.bond - 2);
    // Scratches the floor as if burying it (it doesn't work)
    yield* this.turnAround();
    this.pose('crouch'); this.knead = 1; this.h.sound('scratch');
    yield* this.wait(1.2);
    this.knead = 0;
    if (spot.bed) yield* this.descend();
    this.updateStink();
    const why = reason === 'dirty' ? 'The litter box was too dirty. Scoop more often!' : `${S.name} is very stressed. Stressed cats often go outside the box.`;
    this.log(`${pee ? '💦' : '💩'} ${S.name} ${pee ? 'peed' : 'pooped'} ${spot.where}. ${why}`);
  }
  *actSleep(where) {
    const S = this.S, N = S.needs, w = this.w;
    let spot = where;
    if (!spot) {
      const beam = w.sunbeam();
      const bedSoiled = S.messes.some(m => m.type === 'puddle' && Math.hypot(m.x - SPOTS.bed.pos[0], m.z - SPOTS.bed.pos[2]) < 0.35);
      const c = [['bed', bedSoiled ? 0.02 : 1.0 + (S.favSpot === 'bed' ? 0.4 : 0)], ['sofa', 0.7], ['treeTop', 0.45 + (this.has('aloof') ? 0.4 : 0)], ['box', 0.6 + S.stress / 60]];
      if (beam) c.push(['beam', 1.6]);
      if (w.daylight > 0.4) c.push(['sill', 0.35]);
      let tot = c.reduce((s, x) => s + x[1], 0), r = Math.random() * tot;
      spot = c[c.length - 1][0];
      for (const [k, v] of c) { r -= v; if (r <= 0) { spot = k; break; } }
    }
    if (spot === 'beam') {
      const b = w.sunbeam();
      if (b) { yield* this.goToFloor(b.x, b.z); this.sleepComfort = 1.25; this.act.thought = 'Napping in the sunbeam ☀️'; }
      else { spot = 'bed'; }
    }
    if (spot !== 'beam') {
      yield* this.goToSpot(spot);
      this.sleepComfort = { bed: 1.2, sofa: 1.05, treeTop: 1, box: 1.1, sill: 0.9 }[spot] || 1;
      this.act.thought = `Napping on the ${SPOTS[spot] ? SPOTS[spot].label : spot}`;
    }
    // Pre-nap rituals
    if (spot === 'bed' && N.social > 35) {
      this.pose('knead'); this.knead = 1; this.purr = 0.7;
      yield* this.wait(rand(2.5, 4));
      this.knead = 0;
    }
    if (!(this.K.at && SPOTS[this.K.at].narrow)) yield* this.spin(Math.PI * 2, 4);
    yield* this.wait(rand(1.5, 2.5), 'loaf');
    this.pose('sleep');
    this.asleep = true;
    if (this.act.thought.startsWith('Looking')) this.act.thought = 'Napping';
    this.act.thought = this.act.thought.replace('Napping', 'Zzz… napping');
    let zz = 0;
    while (true) {
      const dt = yield;
      if ((zz -= dt) < 0) { zz = rand(2, 3.5); this.fx('z', '#8fa6e6'); }
      const hr = this.hour();
      if (N.energy >= 97) break;
      if (N.hunger < 12 || N.thirst < 10 || S.bladder >= 90 || S.bowel >= 95) break;
      if (hr > 6.5 && hr < 8 && N.energy > 80 && Math.random() < dt * 0.05) break;
    }
    this.asleep = false;
    this.sleepComfort = 1;
    yield* this.wait(0.8, 'loaf');
    yield* this.actStretch();
  }
  *actStretch() {
    this.pose('stretch'); this.h.sound('yawn');
    yield* this.wait(1.6);
    this.pose('stand');
    yield* this.wait(0.4);
  }
  *actGroom(dur = 6) {
    const S = this.S, N = S.needs;
    this.pose('groom');
    yield* this.wait(dur, 'groom', dt => { N.hygiene = clamp(N.hygiene + 3 * dt); });
    const brushedRecently = S.clock - (S.lastBrush || -9999) < 360;
    if (N.hygiene < 80 && !brushedRecently && Math.random() < 0.14 * this.tm('hairball')) {
      this.say('*hack* *hack*', 1800); this.h.sound('hack');
      this.pose('crouch');
      yield* this.wait(1.6, 'crouch', (dt, t) => { this.m.pose.headPitch = 0.4 + Math.sin(t * 14) * 0.25; });
      this.addMess('hairball', this.K.x + Math.sin(this.K.h) * 0.2, this.K.z + Math.cos(this.K.h) * 0.2);
      this.log(`${S.name} coughed up a hairball. Lovely. (Regular brushing helps.)`);
      yield* this.wait(0.8, 'sit');
    } else this.pose('sit');
  }
  *chaseTarget(getPos, opts = {}) {
    // Moves toward a moving target until within tol; returns true if reached
    const tol = opts.tol || 0.2, maxT = opts.maxT || 8;
    while (this.K.at) yield* this.descend();
    let t = 0;
    while (t < maxT) {
      const dt = yield; t += dt;
      const p = getPos(); if (!p) return false;
      const d = Math.hypot(p.x - this.K.x, p.z - this.K.z);
      const spd = d > 1 ? (opts.run || 1.6) : d > 0.45 ? 0.9 : 0.45;
      this.pose(spd > 1.1 ? 'run' : 'walk');
      this.look = p;
      if (this._step(p.x, p.z, spd, dt) < tol) { this.K.speed = 0; return true; }
    }
    this.K.speed = 0;
    return false;
  }
  *actPlayToy(toy, triggered) {
    const S = this.S, N = S.needs;
    while (this.K.at) yield* this.descend();
    const rounds = triggered ? rand(2, 4) : rand(1, 3);
    for (let i = 0; i < rounds; i++) {
      if (toy.held || toy.carriedBy) break;
      const ok = yield* this.chaseTarget(() => toy.pos, { tol: 0.24, run: 1.8, maxT: 7 });
      if (!ok) break;
      // Stalk, wiggle, pounce, bat
      this.pose('crouch'); this.wiggle = 1; this.look = toy.pos;
      yield* this.wait(rand(0.4, 1.0));
      this.wiggle = 0;
      const fx = toy.pos.x, fz = toy.pos.z;
      yield* this.jumpTo(fx - Math.sin(this.K.h) * 0.12, 0, fz - Math.cos(this.K.h) * 0.12, null, { prep: 0.05, apex: 0.12, dur: 0.3 });
      const a = this.K.h + rand(-0.8, 0.8), f = rand(1.0, 2.6);
      toy.vel.set(Math.sin(a) * f, rand(0.5, 1.6), Math.cos(a) * f);
      this.h.sound(toy.id === 'ball' ? 'jingle' : 'bat');
      N.fun = clamp(N.fun + 7 * this.tm('play')); N.energy = clamp(N.energy - 1.2); S.day.play += 1.5;
      this.pose('stand');
      yield* this.wait(rand(0.2, 0.6));
    }
    this.cool.toy = triggered ? 4 : 12;
    yield* this.wait(rand(1, 2), 'sit');
  }
  *actLookout() {
    const w = this.w, N = this.S.needs;
    yield* this.goToSpot('sill');
    yield* this.face(SPOTS.sill.face);
    this.pose('sit');
    const outside = new T.Vector3(-0.8, 1.35, -4);
    let t = 0, chatter = 0, dur = rand(12, 26) * this.tm('look');
    while (t < dur) {
      const dt = yield; t += dt;
      if (w.bird.visible) {
        this.look = w.bird.position;
        this.act.thought = 'BIRD! Ekekekek';
        this.lashT = 0.3;
        N.fun = clamp(N.fun + 2.5 * dt);
        if ((chatter -= dt) < 0) { chatter = rand(1.5, 3); this.pose('meow'); this.say('ek-ek-ek-ek', 1200); this.h.sound('chatter'); }
        else if (chatter < 1.0) this.pose('sit');
        dur = Math.max(dur, t + 2);
      } else {
        this.look = outside;
        N.fun = clamp(N.fun + 0.6 * dt);
        this.pose(t > 6 ? 'loaf' : 'sit');
      }
    }
  }
  *actWander() {
    const [x, z] = this.randomFloorPoint();
    yield* this.goToFloor(x, z);
    yield* this.actRest(rand(3, 6));
  }
  *actRest(dur) {
    const p = Math.random() < 0.5 ? 'sit' : 'loaf';
    let t = 0, lookT = 0;
    this.pose(p);
    while (t < dur) {
      const dt = yield; t += dt;
      if ((lookT -= dt) < 0) {
        lookT = rand(1.5, 3);
        const a = this.K.h + rand(-1, 1);
        this.look = Math.random() < 0.3 ? this.w.camera.position : new T.Vector3(this.K.x + Math.sin(a) * 2, rand(0, 1), this.K.z + Math.cos(a) * 2);
      }
    }
    this.look = null;
  }
  *actAttention() {
    const S = this.S;
    const [x, z] = this.cameraFloorPoint(1.0);
    yield* this.goToFloor(x, z, 0.6);
    yield* this.face(this.headingToCamera());
    this.cool.attention = 50;
    this.look = this.w.camera.position;
    const n = 1 + Math.round(rand(0, 1) * this.tm('meow'));
    for (let i = 0; i < n; i++) {
      this.pose('meow');
      this.say(pick(['Mrrrow?', 'Mew! (pet me?)', 'Prrrt?', 'Meow.', 'Mrrp! 👀']), 1800);
      yield* this.wait(0.6);
      yield* this.wait(rand(1.5, 2.5), 'sit');
    }
    // Wait to see if you respond
    yield* this.wait(rand(5, 9), 'sit');
    this.look = null;
  }
  *actScratch() {
    const S = this.S;
    const sofa = Math.random() < 0.15 * this.tm('sofa');
    const p = sofa ? POINTS.sofaArm : POINTS.post;
    yield* this.goToFloor(p.x, p.z);
    yield* this.face(p.face);
    this.pose('scratch');
    this.h.sound('scratch');
    yield* this.wait(rand(2.5, 4));
    S.needs.fun = clamp(S.needs.fun + 4); S.stress = clamp(S.stress - 10);
    if (sofa) {
      S.sofaScratches++; this.w.setSofaScratches(S.sofaScratches);
      this.log(`${S.name} sharpened their claws on the sofa. (${S.sofaScratches}× now.) The cat tree is right there...`);
    }
    yield* this.wait(0.6, 'stand');
  }
  *actKnock() {
    const S = this.S, w = this.w;
    yield* this.goToSpot('shelf');
    // Walk along the shelf toward the vase
    this.pose('walk');
    const vx = SPOTS.shelf.pos[0];
    while (Math.abs(this.K.x - vx) > 0.02) { const dt = yield; this.K.x += Math.sign(vx - this.K.x) * Math.min(0.3 * dt, Math.abs(vx - this.K.x)); this.K.h = Math.PI / 2; this.K.speed = 0.3; }
    this.K.speed = 0;
    if (S.vaseBroken) { yield* this.wait(2, 'sit'); return; }
    this.pose('sit'); this.look = w.camera.position;
    this.say('*maintains eye contact*', 1800);
    yield* this.wait(1.6);
    this.look = w.vase.position;
    this.pose('swipe');
    yield* this.wait(0.7);
    S.vaseBroken = true;
    w.knockVase(0.35, 2.1, (x, z) => {
      w.setVase(true);
      this.addMess('shards', x, z);
      this.h.sound('crash');
      this.log(`💥 ${S.name} knocked the vase off the shelf. While looking right at you.`);
    });
    this.pose('sit');
    yield* this.wait(0.5);
    this.look = new T.Vector3(2.1, 0, -1.2);
    yield* this.wait(1.6);
    S.needs.fun = clamp(S.needs.fun + 15);
    this.look = null;
  }
  *actZoomies(dur = 7) {
    const S = this.S;
    this.say(pick(['!!!', 'NYOOM', '*thunders past*']), 1200);
    while (this.K.at) yield* this.descend();
    let t = 0;
    while (t < dur) {
      const [x, z] = this.randomFloorPoint();
      const t0 = t;
      this.pose('run');
      while (true) {
        const dt = yield; t += dt;
        if (this._step(x, z, 2.4, dt) < 0.15 || t - t0 > 3) break;
      }
      if (Math.random() < 0.25) { yield* this.goToSpot(pick(['sofa', 'treeLow', 'bed'])); yield* this.descend(); }
    }
    this.K.speed = 0;
    S.needs.fun = clamp(S.needs.fun + 15); S.needs.energy = clamp(S.needs.energy - 6); S.day.play += dur / 2;
    yield* this.wait(1.2, 'sit');
    yield* this.actGroom(3);
  }
  *actGift(mouse) {
    const S = this.S;
    const ok = yield* this.chaseTarget(() => mouse.pos, { tol: 0.2, run: 1.2, maxT: 8 });
    if (!ok || mouse.held) return;
    this.pose('eat');
    yield* this.wait(0.5);
    mouse.carriedBy = this; this.carriedToy = mouse;
    const [x, z] = this.cameraFloorPoint(0.9);
    yield* this.walkTo(x, z, 0.6);
    yield* this.face(this.headingToCamera());
    this._dropMouth();
    mouse.gift = S.clock + 45;
    this.pose('meow');
    this.say('I caught this for you. 🐭', 2600);
    S.stats.gifts++;
    this.log(`${S.name} brought you the toy mouse as a gift. Click it to accept!`);
    yield* this.wait(0.8);
    yield* this.wait(4, 'sit');
  }
  *actPerch() {
    const opts = ['treeTop', 'sofa', 'treeLow', 'box'];
    if (this.w.daylight > 0.3) opts.push('sill');
    const spot = pick(opts);
    this.act.thought = `Hanging out on the ${SPOTS[spot].label}`;
    yield* this.goToSpot(spot);
    if (!SPOTS[spot].narrow) yield* this.face(this.headingToCamera() + rand(-0.8, 0.8));
    yield* this.actRest(rand(8, 16));
  }
  *actSunbath(beam) {
    if (this.S.needs.energy < 70) return yield* this.actSleep('beam');
    yield* this.goToFloor(beam.x, beam.z);
    this.pose('loaf');
    yield* this.wait(rand(10, 20), 'loaf', dt => { this.S.needs.fun = clamp(this.S.needs.fun + 0.3 * dt); this.S.stress = clamp(this.S.stress - 2 * dt); });
  }
  *actTreat(treat) {
    const S = this.S, N = S.needs;
    if (this.asleep) { this.asleep = false; yield* this.wait(0.6, 'loaf'); }
    while (this.K.at) yield* this.descend();
    const ok = yield* this.chaseTarget(() => treat.pos, { tol: 0.17, run: 1.6, maxT: 8 });
    if (!ok || !this.w.treats.includes(treat)) return;
    this.pose('eat');
    yield* this.wait(1.2);
    if (this.w.treats.includes(treat)) this.w.removeTreat(treat);
    const m = this.tm('treat');
    N.hunger = clamp(N.hunger + 4); N.fun = clamp(N.fun + 6 * m); S.bond = clamp(S.bond + 2 * m); S.bowel += 2;
    this.fx('😋'); this.h.sound('crunch');
    this.lick = true;
    yield* this.wait(1.2, 'sit');
    this.lick = false;
    if (this.w.treats.some(t => t.landed)) return;
    // Hopeful look for more
    this.look = this.w.camera.position;
    yield* this.face(this.headingToCamera());
    yield* this.wait(2.5, 'sit');
  }
  *actLaser() {
    const S = this.S, N = S.needs, L = this.laser;
    if (this.asleep) { this.asleep = false; yield* this.wait(0.6, 'loaf'); }
    while (this.K.at) yield* this.descend();
    let lastCatch = null, still = 0, rear = false;
    while (L.active) {
      const dt = yield;
      const p = L.point;
      const onWall = p.y > 0.12;
      let tx = p.x, tz = p.z;
      if (onWall) { // approach the wall below the dot
        tx = clamp(p.x, BOUNDS.minX + 0.12, BOUNDS.maxX); tz = clamp(p.z, BOUNDS.minZ + 0.12, BOUNDS.maxZ);
      }
      this.look = p;
      const d = Math.hypot(tx - this.K.x, tz - this.K.z);
      if (d > 0.22) {
        rear = false;
        const spd = d > 0.9 ? 1.9 : d > 0.4 ? 1.1 : 0.55;
        this.pose(spd > 1.1 ? 'run' : 'walk');
        this._step(tx, tz, spd, dt);
        still = 0;
      } else {
        this.K.speed = 0;
        if (onWall) {
          if (!rear) { rear = true; this.pose('scratch'); this.say(pick(['?!', 'mrrp?!']), 900); }
          still += dt * 0.5;
        } else if (!lastCatch || Math.hypot(p.x - lastCatch.x, p.z - lastCatch.z) > 0.35) {
          lastCatch = { x: p.x, z: p.z };
          yield* this.jumpTo(p.x - Math.sin(this.K.h) * 0.1, 0, p.z - Math.cos(this.K.h) * 0.1, null, { prep: 0.08, apex: 0.1, dur: 0.26 });
          N.fun = clamp(N.fun + 4 * this.tm('play')); N.energy = clamp(N.energy - 0.8);
          S.coins += 1; S.stats.catches++; S.day.play += 0.5;
          this.fx('+1 🪙', '#d4a017');
          if (S.stats.catches % 25 === 0) this.log(`${S.name} has "caught" the red dot ${S.stats.catches} times. It remains uncatchable.`);
        } else {
          this.pose('crouch'); this.wiggle = 0.8; still += dt;
        }
      }
      if (still > 6) { this.wiggle = 0; this.say('...hmph.', 1400); this.cool.laser = 12; break; }
      if (N.energy < 15) { this.wiggle = 0; this.say('Too... tired... 😮‍💨', 1800); this.cool.laser = 40; break; }
      if (N.fun > 99 && Math.random() < dt * 0.1) { this.say('Okay, I win.', 1400); this.cool.laser = 25; break; }
    }
    this.wiggle = 0; this.look = null;
    yield* this.wait(1.2, 'sit');
  }
  *actWand() {
    const S = this.S, N = S.needs, W = this.wand;
    if (this.asleep) { this.asleep = false; yield* this.wait(0.6, 'loaf'); }
    while (this.K.at) yield* this.descend();
    let stalk = 0, nextPounce = rand(0.6, 1.4), bored = 0;
    while (W.active) {
      const dt = yield;
      const p = W.pos;
      this.look = p;
      const d = Math.hypot(p.x - this.K.x, p.z - this.K.z);
      if (d > 0.55) {
        stalk = 0; this.wiggle = 0;
        const spd = d > 1.2 ? 1.5 : 0.5;
        this.pose(spd > 1.1 ? 'run' : 'walk');
        this._step(p.x, p.z, spd, dt);
      } else {
        this.K.speed = 0;
        yield* this.face(Math.atan2(p.x - this.K.x, p.z - this.K.z));
        this.pose('crouch'); this.wiggle = 1;
        stalk += dt;
        if (W.speed < 0.05) bored += dt; else bored = Math.max(0, bored - dt);
        if (stalk > nextPounce) {
          this.wiggle = 0; stalk = 0; nextPounce = rand(0.5, 1.6);
          const tx = p.x, tz = p.z, ty = p.y;
          let caught = false;
          const head = new T.Vector3();
          yield* this.jumpTo(tx - Math.sin(this.K.h) * 0.12, 0, tz - Math.cos(this.K.h) * 0.12, null, {
            prep: 0.05, apex: Math.min(0.7, Math.max(0.15, ty - 0.15)), dur: 0.42,
            during: t => { if (!caught && t > 0.3 && t < 0.75) { this.m.headWorld(head); if (head.distanceTo(W.pos) < 0.3) caught = true; } },
          });
          N.energy = clamp(N.energy - 1.5); S.day.play += 1;
          if (caught) {
            N.fun = clamp(N.fun + 8 * this.tm('play')); S.bond = clamp(S.bond + 0.6); S.coins += 1; S.stats.catches++;
            this.fx('Got it! +1 🪙', '#d4a017'); this.h.sound('bat');
          } else { N.fun = clamp(N.fun + 2); this.fx('miss', '#999'); }
        }
      }
      if (bored > 5) { this.say('Wiggle it, human.', 1500); bored = 0; this.cool.wand = 3; break; }
      if (N.energy < 15) { this.say('Too tired to hunt.', 1600); this.cool.wand = 40; break; }
    }
    this.wiggle = 0; this.look = null;
    yield* this.wait(1, 'sit');
  }

  /* ---------- player interactions ---------- */
  canInteract() { return !(this.act && ['carried', 'swat', 'zoomies', 'bath'].includes(this.act.name)) && !this.inJump; }
  pet(zone) {
    const S = this.S, N = S.needs;
    if (!this.canInteract()) return null;
    if (['laser', 'wand', 'chase', 'treat'].includes(this.act && this.act.name)) return null;
    const pref = S.prefs[zone] != null ? S.prefs[zone] : 0;
    S.learned[zone] = (S.learned[zone] || 0) + 1;
    if (this.asleep) {
      if (this.has('cuddly') || pref > 1.0) { this.purr = Math.min(1, this.purr + 0.2); N.social = clamp(N.social + 0.4); S.bond = clamp(S.bond + 0.05); return 'sleepy-purr'; }
      if (Math.random() < 0.25) {
        this.asleep = false;
        this.start('rest', (function* (self) { self.pose('loaf'); self.m.pose.earBack = 1; self.say('Mrrf!', 1200); S.stress = clamp(S.stress + 4); yield* self.wait(2.5, 'loaf'); })(this), 'Rudely awakened', 1);
        this.log(`You woke ${S.name} up. ${S.name} is not amused.`);
        return 'woke';
      }
      return 'sleep';
    }
    if (!this.act || this.act.name !== 'petted') this.start('petted', this.actPetted(), 'Getting pets', 3);
    this.petIdle = 0; this.petZone = zone;
    const limit = this.tm('petLimit') * (0.75 + S.bond / 200);
    if (pref > 0) {
      S.bond = clamp(S.bond + 0.1 * pref * this.tm('bond'));
      N.social = clamp(N.social + 1.3 * pref); N.fun = clamp(N.fun + 0.25); S.stress = clamp(S.stress - 0.6);
      this.purr = Math.min(1, this.purr + 0.18 * pref);
      this.overstim += (4.5 - pref * 1.2) / limit;
      S.stats.pets++; S.day.pets++;
    } else {
      this.overstim += (10 - pref * 8) / limit;
      this.lashT = 1.4;
      S.stress = clamp(S.stress + 0.8);
      if (zone === 'belly' && Math.random() < 0.3) { this.swat('belly'); return 'swat'; }
    }
    if (this.overstim > 100) { this.swat(zone); return 'swat'; }
    return pref > 0 ? 'like' : 'dislike';
  }
  *actPetted() {
    const zone0 = this.petZone;
    // Pose depends on where the cat was; flop into a loaf if it was resting
    const lying = ['loaf', 'sleep', 'knead'].includes(this.m.poseName);
    this.pose(lying ? 'loaf' : 'happy');
    this.K.speed = 0;
    this.petIdle = 0;
    this.look = this.w.camera.position;
    while (this.petIdle < 1.8) {
      const dt = yield;
      this.petIdle += dt;
      const z = this.petZone;
      // Lean into the touch
      if (z === 'chin') this.m.target.headPitch = -0.55;
      else if (z === 'cheek') this.m.target.headRoll = 0.3;
      else if (z === 'head') this.m.target.headPitch = 0.15;
      if (this.lashT > 0) { this.m.target.earBack = 0.8; this.m.target.eye = 0.8; }
      else { this.m.target.earBack = 0; this.m.target.eye = lying ? 0.3 : 0.35; }
    }
    this.look = null;
    // Cats often groom the spot you touched
    if (Math.random() < 0.4) yield* this.actGroom(rand(2, 4));
  }
  swat(zone) {
    const S = this.S;
    this.overstim = 30;
    S.bond = clamp(S.bond - 2.5); S.stress = clamp(S.stress + 8);
    this.h.sound('hiss');
    this.fx('💢', '#d9534f');
    this.say(zone === 'belly' ? pick(['IT WAS A TRAP.', '*bunny kicks*', 'HSSS!']) : pick(['HSSS!', 'Enough!', '*swat*']), 1600);
    this.log(zone === 'belly' ? `${S.name} rolled over... then grabbed your hand and bunny-kicked it. Classic belly trap.` : `${S.name} got overstimulated and swatted you. Watch for the lashing tail and flattened ears.`);
    this.h.onSwat && this.h.onSwat();
    this.start('swat', this.actSwat(), 'Overstimulated!', 4);
  }
  *actSwat() {
    this.pose('swipe'); this.m.pose.earBack = 1; this.lashT = 2;
    yield* this.wait(0.6);
    this.pose('angry');
    yield* this.wait(0.8);
    const a = this.K.h + Math.PI + rand(-0.6, 0.6);
    if (!this.K.at) yield* this.walkTo(this.K.x + Math.sin(a) * 1.2, this.K.z + Math.cos(a) * 1.2, 0.9);
    yield* this.actGroom(rand(2, 4));
  }
  brush(zone) {
    const S = this.S, N = S.needs;
    if (!this.canInteract() || this.asleep) { if (this.asleep && Math.random() < 0.2) this.pet('back'); return null; }
    if (['laser', 'wand', 'chase', 'treat'].includes(this.act && this.act.name)) return null;
    if (!this.act || this.act.name !== 'petted') this.start('petted', this.actPetted(), 'Being brushed', 3);
    this.petIdle = 0; this.petZone = zone;
    S.lastBrush = S.clock;
    const pref = S.prefs.brush;
    S.learned.brush = (S.learned.brush || 0) + 1;
    N.hygiene = clamp(N.hygiene + 1.6);
    if (zone === 'belly' || zone === 'tail') { this.overstim += 12; this.lashT = 1; }
    if (pref > 0) { this.purr = Math.min(1, this.purr + 0.12 * pref); N.social = clamp(N.social + 0.6 * pref); S.bond = clamp(S.bond + 0.05 * pref); this.overstim += 2; }
    else { this.overstim += 6 / this.tm('petLimit'); this.lashT = 1.2; }
    if (this.overstim > 100) { this.swat(zone); return 'swat'; }
    return pref > 0 ? 'like' : 'dislike';
  }
  pickup() {
    if (!this.canInteract() && !(this.act && this.act.name === 'zoomies')) return false;
    if (this.asleep && !this.has('cuddly')) { this.S.stress = clamp(this.S.stress + 4); }
    this.K.at = null;
    this.start('carried', this.actCarried(), 'Being held', 5);
    this.h.sound(this.has('aloof') ? 'grumble' : 'mrrp');
    return true;
  }
  *actCarried() {
    const S = this.S, N = S.needs;
    this.pose('carried');
    const tol = 7 * this.tm('hold') * (0.6 + S.bond / 100);
    let t = 0;
    while (true) {
      const dt = yield; t += dt;
      this.K.speed = 0;
      if (t < tol) { N.social = clamp(N.social + 1.2 * dt); if (this.has('cuddly')) this.purr = Math.min(0.8, this.purr + dt * 0.3); }
      else {
        this.pose('angry'); this.lashT = 1; this.act.thought = 'Put me DOWN';
        S.stress = clamp(S.stress + 3 * dt);
        if (t > tol + 1.5) { this.say('MRAOW!', 1200); this.h.sound('hiss'); this.h.forceDrop && this.h.forceDrop(); return; }
      }
    }
  }
  carryTo(x, y, z, faceAngle) { const K = this.K; K.x = x; K.y = y; K.z = z; if (faceAngle != null) K.h = faceAngle; }
  drop(x, z, spotId) {
    const K = this.K, S = this.S;
    let ty = 0;
    if (spotId) { const p = SPOTS[spotId].pos; x = p[0]; ty = p[1]; z = p[2]; if (SPOTS[spotId].face != null) K.h = SPOTS[spotId].face; }
    K.x = x; K.z = z; K.at = null;
    if (!spotId) this._push();
    const fromY = K.y;
    const self = this;
    this.start('land', (function* () {
      self.pose('leap');
      let vy = 0;
      while (K.y > ty) { const dt = yield; vy -= 9.8 * dt; K.y = Math.max(ty, K.y + vy * dt); }
      K.at = spotId || null;
      self.h.sound('thump', Math.min(1, fromY));
      self.pose('stand');
      yield* self.wait(0.3);
      if (spotId === 'bed' && S.needs.energy < 80) { yield* self.actSleep('bed'); return; }
      if (S.stress > 50) { self.say(pick(['Hmph.', '*flicks tail*']), 1200); yield* self.actGroom(3); }
      else yield* self.actRest(rand(2, 4));
    })(), 'Landing', 1);
  }
  bath() {
    const S = this.S, N = S.needs;
    if (this.act && this.act.name === 'carried') return;
    N.hygiene = 100; N.fun = clamp(N.fun - 20); S.bond = clamp(S.bond - 4); S.stress = clamp(S.stress + 35);
    this.h.sound('hiss');
    this.say(pick(['BETRAYAL.', 'MRAAOOW!', 'I will remember this.']), 2400);
    this.log(`You gave ${S.name} a bath. Squeaky clean. Deeply offended. Now hiding in the box.`);
    this.K.at = null; this.K.y = 0;
    this.start('bath', (function* (self) {
      self.pose('angry'); self.m.pose.puff = 1;
      yield* self.wait(1.2);
      yield* self.goToSpot('box');
      self.pose('loaf');
      yield* self.wait(rand(15, 25), 'loaf', () => { self.m.target.earBack = 0.6; });
      yield* self.actGroom(6);
    })(this), 'Hiding after the bath', 4);
  }
  catnip() {
    const S = this.S;
    this.start('catnip', (function* (self) {
      yield* self.goToFloor(0.25, 0.4, 1.0);
      self.say('!!! 🌿', 1200);
      self.pose('loaf');
      let t = 0;
      while (t < 4) { const dt = yield; t += dt; self.m.pose.roll = Math.sin(t * 5) * 0.9; self.purr = 1; self.m.target.eye = 0.2; }
      self.m.pose.roll = 0;
      S.needs.fun = clamp(S.needs.fun + 30); S.stress = clamp(S.stress - 25);
      yield* self.actZoomies(8);
    })(this), 'CATNIP', 2);
  }
  acceptGift(toy) {
    const S = this.S;
    if (!toy.gift) return false;
    toy.gift = null;
    const c = Math.floor(rand(4, 8));
    S.coins += c; S.bond = clamp(S.bond + 3);
    this.log(`You accepted ${S.name}'s gift. +${c} 🪙. ${S.name} looks very proud.`);
    if (!this.asleep) this.fx('💗');
    return true;
  }

  /* ---------- per-frame model sync ---------- */
  _animate(dt) {
    const K = this.K, m = this.m;
    m.group.position.set(K.x, K.y, K.z);
    m.group.rotation.y = K.h;
    let lookYaw = null, lookPitch = null;
    if (this.look) {
      const hp = m.headWorld(new T.Vector3());
      const dx = this.look.x - hp.x, dz = this.look.z - hp.z, dy = this.look.y - hp.y;
      lookYaw = angDiff(Math.atan2(dx, dz), K.h);
      lookPitch = -Math.atan2(dy, Math.hypot(dx, dz));
      if (Math.abs(lookYaw) > 1.9) lookYaw = null;
    }
    const lash = Math.max(this.lashT > 0 ? 1 : 0, T.MathUtils.clamp((this.overstim - 45) / 40, 0, 1));
    if (this.overstim > 60 && this.act && this.act.name === 'petted') m.target.earBack = Math.max(m.target.earBack, (this.overstim - 60) / 40);
    m.update(dt, { speed: K.speed, purr: this.purr, lash, wiggle: this.wiggle, lookYaw, lookPitch, knead: this.knead, lick: this.lick, fast: this.inJump });
    if (this.carriedToy) {
      const p = m.headWorld(new T.Vector3());
      this.carriedToy.pos.set(p.x + Math.sin(K.h) * 0.12, p.y - 0.14, p.z + Math.cos(K.h) * 0.12);
      this.carriedToy.mesh.position.copy(this.carriedToy.pos);
    }
  }

  /* ---------- offline catch-up ---------- */
  catchUp() {
    const S = this.S;
    const awayMs = Date.now() - (S.lastReal || Date.now());
    S.lastReal = Date.now();
    if (awayMs < 60000) return null;
    // 1 real minute away = 6 game minutes, up to 8 game hours
    const mins = Math.min(8 * 60, (awayMs / 60000) * 6);
    const N = S.needs;
    let sleeping = false, slept = 0, ate = 0, drank = 0, trips = 0, accidents = 0;
    for (let t = 0; t < mins; t += 5) {
      const h = 5 / 60;
      S.clock += 5;
      N.hunger -= 6.5 * h * this.tm('hunger'); N.thirst -= 7.5 * h;
      if (N.hunger < 60 && S.food > 0) { const a = Math.min(S.food, 100 - N.hunger); S.food -= a; N.hunger += a; S.bowel += a * 0.55; S.bladder += a * 0.1; ate += a; if (S.food <= 0) S.wet = false; }
      if (N.thirst < 60 && S.water > 0) { const a = Math.min(S.water, (100 - N.thirst) / 1.4); S.water -= a * 0.8; N.thirst += a * 1.4; S.bladder += a * 0.5; drank += a; }
      if (!sleeping && N.energy < 40) sleeping = true;
      if (sleeping) { N.energy += 15 * h; slept += 5; if (N.energy >= 95) sleeping = false; } else N.energy -= 5.5 * h;
      N.fun -= (sleeping ? 1.5 : 6) * h; N.hygiene -= 1 * h; N.social -= (sleeping ? 1 : 4) * h;
      S.bladder += 3 * h; S.bowel += 1.5 * h;
      for (const kind of ['pee', 'poop']) {
        const full = kind === 'pee' ? S.bladder >= 72 : S.bowel >= 80;
        if (!full) continue;
        if (kind === 'pee') S.bladder = 0; else S.bowel = 0;
        if (this.litterDirt() < this.litterLimit()) { if (kind === 'pee') { S.clumps++; S.stats.pees++; } else { S.poops++; S.stats.poops++; } trips++; }
        else if (accidents < 2) { accidents++; S.stats.accidents++; S.messes.push({ id: kind[1] + t, type: kind === 'pee' ? 'puddle' : 'poop', x: kind === 'pee' ? rand(-0.3, 0.8) : rand(1.75, 1.95), z: kind === 'pee' ? rand(0.1, 0.7) : rand(1.6, 2.2) }); }
      }
      for (const k in N) N[k] = clamp(N[k], 12, 100);
    }
    let knocked = false;
    if (!S.vaseBroken && Math.random() < 0.08 * this.tm('knock') * (mins / 60)) { S.vaseBroken = true; knocked = true; S.messes.push({ id: 'v' + Date.now(), type: 'shards', x: 2.2, z: -1.3 }); }
    if (sleeping) { S.cat = { x: SPOTS.bed.pos[0], z: SPOTS.bed.pos[2], h: 1, at: 'bed' }; }
    this._applyLoaded();
    this.updateStink();
    const bits = [];
    if (ate > 2) bits.push('ate');
    if (drank > 2) bits.push('had some water');
    if (slept > 20) bits.push(`napped about ${Math.round(slept / 60 * 10) / 10} h`);
    if (trips) bits.push(`used the litter box ${trips === 1 ? 'once' : trips + ' times'}`);
    if (accidents) bits.push(`went outside the box ${accidents === 1 ? 'once' : 'twice'} (it was too dirty)`);
    if (knocked) bits.push('knocked over the vase');
    const msg = `While you were away (${mins >= 60 ? (mins / 60).toFixed(1) + ' game hours' : Math.round(mins) + ' game minutes'}), ${S.name} ${bits.length ? bits.join(', ') : 'mostly stared out of the window'}.`;
    this.log(msg);
    return msg;
  }
}

VPC.Sim = Sim;
VPC.ZONES = ZONES;
})();
