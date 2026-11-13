/* Virtual Pet Cat: procedural 3D cat (model, coat painting, pose blending, animation) */
(function () {
'use strict';
const VPC = window.VPC = window.VPC || {};
const T = THREE;

const COATS = {
  orange: { name: 'Orange tabby', base: '#e48b42', dark: '#b45f22', light: '#f8dcb6', eye: '#8bbf3f', pattern: 'tabby' },
  grey:   { name: 'Grey tabby',   base: '#9298a2', dark: '#5d636c', light: '#dfe2e7', eye: '#e2b52e', pattern: 'tabby' },
  black:  { name: 'Black',        base: '#26262c', dark: '#18181c', light: '#34343c', eye: '#f2c230', pattern: 'solid' },
  white:  { name: 'White',        base: '#f3f0ea', dark: '#dcd5ca', light: '#ffffff', eye: '#4aa3df', pattern: 'solid' },
  tuxedo: { name: 'Tuxedo',       base: '#222228', dark: '#141418', light: '#f7f7f5', eye: '#8bc34a', pattern: 'tuxedo' },
  calico: { name: 'Calico',       base: '#f5eee2', dark: '#2a2320', light: '#ffffff', eye: '#d79a2b', pattern: 'calico', patch: '#df8638' },
  siamese:{ name: 'Siamese',      base: '#efe2cc', dark: '#5a4234', light: '#f8efe0', eye: '#5aa9e6', pattern: 'point' },
};
VPC.COATS = COATS;

/* ---------- tiny 3D value noise ---------- */
function hash(x, y, z, seed) { let h = (x * 374761393 + y * 668265263 + z * 1442695041 + seed * 9737333) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise3(x, y, z, seed = 1) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = t => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++)
    r += hash(xi + dx, yi + dy, zi + dz, seed) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  return r * 2 - 1;
}

/* Fur colour for a body part at local point p (unit-ish coordinates) */
function furColor(coat, part, p, seed) {
  const C = coat;
  const base = new T.Color(C.base), dark = new T.Color(C.dark), light = new T.Color(C.light);
  const n = noise3(p.x * 2.4 + 10, p.y * 2.4, p.z * 2.4, seed);
  const fine = noise3(p.x * 9, p.y * 9, p.z * 9, seed + 7) * 0.06;
  let c = base.clone();
  switch (C.pattern) {
    case 'tabby': {
      if (part === 'body') {
        const stripe = Math.sin(p.z * 11 + n * 2.2 + Math.abs(p.x) * 2);
        if (stripe > 0.35 && p.y > -0.25) c = dark.clone();
        if (p.y < -0.45) c = light.clone();
      } else if (part === 'head') {
        if (p.y > 0.35 && p.z > -0.2 && Math.abs(Math.sin(p.x * 13)) > 0.75) c = dark.clone();
        if (Math.abs(p.x) > 0.7 && p.y > -0.2 && p.y < 0.25 && Math.sin(p.y * 18) > 0.4) c = dark.clone();
        if (p.y < -0.35 && p.z > 0.3) c = light.clone();
      } else if (part === 'leg') {
        if (Math.sin(p.y * 22) > 0.55 && p.y > -0.8) c = dark.clone();
      } else if (part === 'muzzle' || part === 'chin') c = light.clone();
      else if (part === 'tailRing') c = dark.clone();
      break;
    }
    case 'tuxedo': {
      if (part === 'body' && (p.y < -0.35 || (p.z > 0.55 && p.y < 0.35))) c = light.clone();
      if (part === 'head' && p.y < -0.2 && p.z > 0.25 && Math.abs(p.x) < 0.55) c = light.clone();
      if (part === 'muzzle' || part === 'chin') c = light.clone();
      if (part === 'leg' && p.y < -0.65) c = light.clone();
      if (part === 'paw') c = light.clone();
      break;
    }
    case 'calico': {
      const k = noise3(p.x * 1.7 + (part === 'head' ? 30 : part === 'tail' || part === 'tailRing' ? 60 : 0), p.y * 1.7, p.z * 1.7, seed + 3);
      if (k > 0.18) c = new T.Color(C.patch); else if (k < -0.25) c = dark.clone();
      if (part === 'body' && p.y < -0.4) c = light.clone();
      if (part === 'muzzle' || part === 'chin' || part === 'paw') c = light.clone();
      if (part === 'leg' && p.y < -0.5) c = light.clone();
      break;
    }
    case 'point': {
      // Siamese: dark ears, face mask, legs and tail
      if (part === 'leg') c = base.clone().lerp(dark, T.MathUtils.clamp(-p.y * 1.2, 0, 1));
      if (part === 'paw' || part === 'tail' || part === 'tailRing' || part === 'ear') c = dark.clone();
      if (part === 'head' && p.z > 0.2) c = base.clone().lerp(dark, T.MathUtils.clamp((p.z - 0.2) * 1.6, 0, 1));
      if (part === 'muzzle' || part === 'chin') c = dark.clone();
      if (part === 'body' && p.y < -0.4) c = light.clone();
      break;
    }
    default:
      if (part === 'body' && p.y < -0.5) c = base.clone().lerp(light, 0.4);
      if (part === 'muzzle' || part === 'chin') c = base.clone().lerp(light, 0.5);
  }
  if (part === 'ear' && C.pattern !== 'point' && C.pattern !== 'calico') c = base.clone();
  c.offsetHSL(0, 0, fine);
  return c;
}

function paint(geom, coat, part, seed, transform) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const p = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (transform) transform(p);
    const c = furColor(coat, part, p, seed);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geom.setAttribute('color', new T.BufferAttribute(colors, 3));
  return geom;
}

/* ---------- poses ---------- */
const BASE_POSE = { hipY: 0.22, pitch: 0, headPitch: 0, headYaw: 0, headRoll: 0, fTuck: 0, rTuck: 0, tailUp: 1, tailCurl: 0, earBack: 0, eye: 1, pupil: 0.35, raise: 0, dangle: 0, reach: 0, puff: 0, mouth: 0, roll: 0, spread: 0 };
const POSES = {
  stand:   {},
  walk:    { tailUp: 0.9 },
  run:     { tailUp: 0.5, headPitch: -0.05, earBack: 0.15 },
  sit:     { hipY: 0.085, pitch: 0.62, headPitch: -0.3, rTuck: 1, tailUp: -0.2, tailCurl: 0.75 },
  loaf:    { hipY: 0.1, fTuck: 1, rTuck: 1, headPitch: -0.05, tailUp: -0.3, tailCurl: 0.9, eye: 0.85 },
  sleep:   { hipY: 0.09, fTuck: 1, rTuck: 1, headPitch: 0.6, headYaw: 1.05, headRoll: 0.35, tailUp: -0.4, tailCurl: 1.5, eye: 0, earBack: 0.15, roll: 0.25 },
  crouch:  { hipY: 0.13, pitch: -0.05, headPitch: -0.12, fTuck: 0.45, rTuck: 0.6, tailUp: 0.0, earBack: 0.15, pupil: 1 },
  eat:     { hipY: 0.19, pitch: -0.18, headPitch: 0.95, fTuck: 0.15, rTuck: 0.2, tailUp: 0.4 },
  groom:   { hipY: 0.085, pitch: 0.62, headPitch: 0.45, headYaw: 0.45, rTuck: 1, raise: 1, eye: 0.15, tailUp: -0.2, tailCurl: 0.7 },
  stretch: { hipY: 0.24, pitch: -0.42, headPitch: -0.35, fTuck: 0.85, tailUp: 1.2, mouth: 0.8, eye: 0.3 },
  scratch: { hipY: 0.22, pitch: 0.95, headPitch: -0.6, reach: 1, tailUp: 0.9 },
  litter:  { hipY: 0.12, pitch: 0.28, rTuck: 0.85, headPitch: -0.1, tailUp: 1.2, eye: 0.6 },
  pee:     { hipY: 0.1, pitch: 0.18, fTuck: 0.1, rTuck: 0.8, headPitch: -0.05, tailUp: 1.25, eye: 0.65, earBack: 0.1 },
  poop:    { hipY: 0.12, pitch: 0.4, fTuck: 0.05, rTuck: 0.95, headPitch: 0.05, tailUp: 1.45, eye: 0.15, earBack: 0.3 },
  sniff:   { hipY: 0.2, pitch: -0.15, headPitch: 0.8, fTuck: 0.1, tailUp: 0.7, eye: 0.8 },
  angry:   { hipY: 0.23, pitch: 0.0, headPitch: 0.15, earBack: 1, tailUp: 1.6, puff: 1, pupil: 1, mouth: 1 },
  carried: { hipY: 0.0, pitch: 0.35, dangle: 1, tailUp: -0.9, earBack: 0.3, headPitch: -0.1 },
  leap:    { hipY: 0.22, pitch: 0.12, spread: 1, tailUp: 0.6, pupil: 1, earBack: 0.1 },
  meow:    { hipY: 0.085, pitch: 0.62, headPitch: -0.55, rTuck: 1, mouth: 1, tailUp: 0.6 },
  swipe:   { hipY: 0.085, pitch: 0.62, headPitch: -0.2, rTuck: 1, raise: 1, tailUp: 0.4, pupil: 0.8 },
  knead:   { hipY: 0.1, pitch: 0.1, fTuck: 0.3, rTuck: 1, headPitch: 0.1, eye: 0.25, tailUp: 0.2 },
  happy:   { hipY: 0.085, pitch: 0.62, headPitch: -0.15, rTuck: 1, eye: 0.25, tailUp: 1.1 },
};
VPC.POSES = POSES;

const L = 0.2;       // leg length
const PAW_R = 0.026;

class CatModel {
  constructor(coatKey, seed = 1) {
    this.group = new T.Group();
    this.pose = Object.assign({}, BASE_POSE, POSES.loaf);
    this.target = Object.assign({}, this.pose);
    this.poseName = 'loaf';
    this.phase = 0; this.walk = 0; this.time = 0;
    this.blinkT = 2; this.blink = 0;
    this.knead = 0; this.purr = 0; this.tailLash = 0; this.wiggle = 0;
    this.lookAt = null;
    this.pickables = [];
    this.build(coatKey, seed);
  }
  build(coatKey, seed = 1) {
    this.coatKey = coatKey; this.seed = seed;
    const coat = COATS[coatKey];
    const g = this.group;
    while (g.children.length) g.remove(g.children[0]);
    this.pickables = [];
    const fur = this.furMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const pick = (m, zone) => { m.userData.zone = zone; m.castShadow = true; m.receiveShadow = true; this.pickables.push(m); return m; };

    const root = this.root = new T.Group(); g.add(root);
    const hip = this.hip = new T.Group(); root.add(hip);

    // Torso: a sphere stretched along z, painted in its own unit space
    const torsoG = paint(new T.SphereGeometry(1, 40, 28), coat, 'body', seed);
    const torso = this.torso = pick(new T.Mesh(torsoG, fur), 'body');
    torso.scale.set(0.105, 0.1, 0.205); torso.position.set(0, 0.015, 0.12);
    hip.add(torso);
    const chestG = paint(new T.SphereGeometry(1, 24, 18), coat, 'body', seed, p => { p.z = p.z * 0.5 + 0.55; });
    const chest = pick(new T.Mesh(chestG, fur), 'chest');
    chest.scale.set(0.095, 0.105, 0.1); chest.position.set(0, 0.03, 0.24);
    hip.add(chest);
    const haunchG = paint(new T.SphereGeometry(1, 20, 14), coat, 'body', seed, p => { p.z = p.z * 0.5 - 0.6; });
    for (const s of [-1, 1]) {
      const h = pick(new T.Mesh(haunchG, fur), 'rump');
      h.scale.set(0.065, 0.09, 0.1); h.position.set(s * 0.045, 0.0, 0.02);
      hip.add(h);
    }

    // Legs
    const legG = paint(new T.CylinderGeometry(0.027, 0.022, 1, 12).translate(0, -0.5, 0), coat, 'leg', seed);
    const pawG = paint(new T.SphereGeometry(PAW_R, 12, 8), coat, 'paw', seed);
    this.legs = [];
    for (const [x, z, front] of [[-0.052, 0.255, true], [0.052, 0.255, true], [-0.055, 0.02, false], [0.055, 0.02, false]]) {
      const pivot = new T.Group(); pivot.position.set(x, 0, z); hip.add(pivot);
      const leg = pick(new T.Mesh(legG, fur), 'leg'); pivot.add(leg);
      const paw = pick(new T.Mesh(pawG, fur), 'paw'); paw.scale.set(1, 0.7, 1.35); pivot.add(paw);
      this.legs.push({ pivot, leg, paw, front, side: x < 0 ? -1 : 1 });
    }

    // Neck + head
    const neck = this.neck = new T.Group(); neck.position.set(0, 0.075, 0.3); hip.add(neck);
    const head = this.head = new T.Group(); neck.add(head);
    const headG = paint(new T.SphereGeometry(1, 36, 26), coat, 'head', seed);
    const skull = pick(new T.Mesh(headG, fur), 'head');
    skull.scale.set(0.088, 0.08, 0.082); skull.position.set(0, 0.055, 0.05);
    head.add(skull);
    const cheekG = paint(new T.SphereGeometry(1, 28, 18), coat, 'head', seed, p => { p.y = p.y * 0.6 - 0.35; p.z = p.z * 0.8 + 0.25; });
    const cheeks = pick(new T.Mesh(cheekG, fur), 'cheek');
    cheeks.scale.set(0.094, 0.058, 0.068); cheeks.position.set(0, 0.025, 0.065);
    head.add(cheeks);
    const muzG = paint(new T.SphereGeometry(1, 16, 12), coat, 'muzzle', seed);
    for (const s of [-1, 1]) {
      const m = pick(new T.Mesh(muzG, fur), 'chin'); m.scale.set(0.024, 0.02, 0.022); m.position.set(s * 0.019, 0.022, 0.123); head.add(m);
    }
    const chinG = paint(new T.SphereGeometry(1, 12, 10), coat, 'chin', seed);
    const chin = pick(new T.Mesh(chinG, fur), 'chin'); chin.scale.set(0.02, 0.016, 0.02); chin.position.set(0, 0.002, 0.112); head.add(chin);
    // Mouth (dark, shown when meowing/hissing)
    this.mouthMesh = new T.Mesh(new T.SphereGeometry(1, 12, 8), new T.MeshStandardMaterial({ color: 0x6b2430, roughness: 0.6 }));
    this.mouthMesh.scale.set(0.016, 0.001, 0.01); this.mouthMesh.position.set(0, 0.008, 0.124); head.add(this.mouthMesh);
    const nose = new T.Mesh(new T.SphereGeometry(0.011, 10, 8), new T.MeshStandardMaterial({ color: coat.pattern === 'point' || coatKey === 'black' ? 0x3a2a2a : 0xe0849a, roughness: 0.5 }));
    nose.scale.set(1.3, 0.75, 0.9); nose.position.set(0, 0.042, 0.135); head.add(nose);

    // Eyes
    this.eyes = [];
    const irisMat = new T.MeshStandardMaterial({ color: coat.eye, roughness: 0.15, metalness: 0, emissive: new T.Color(coat.eye), emissiveIntensity: 0.12 });
    const pupilMat = new T.MeshStandardMaterial({ color: 0x080808, roughness: 0.1 });
    const shineMat = new T.MeshBasicMaterial({ color: 0xffffff });
    const lidMat = new T.MeshStandardMaterial({ color: new T.Color(coat.pattern === 'tabby' ? coat.dark : coat.pattern === 'point' ? coat.dark : coat.base).multiplyScalar(0.55), roughness: 1 });
    for (const s of [-1, 1]) {
      const eg = new T.Group(); eg.position.set(s * 0.036, 0.062, 0.112); eg.rotation.y = s * 0.35; head.add(eg);
      const iris = new T.Mesh(new T.SphereGeometry(0.019, 16, 12), irisMat); iris.scale.set(1, 1, 0.55); eg.add(iris);
      const pupil = new T.Mesh(new T.SphereGeometry(0.0175, 12, 10), pupilMat); pupil.position.z = 0.004; pupil.scale.set(0.35, 0.95, 0.5); eg.add(pupil);
      const shine = new T.Mesh(new T.SphereGeometry(0.004, 6, 6), shineMat); shine.position.set(0.006, 0.007, 0.012); eg.add(shine);
      const lid = new T.Mesh(new T.BoxGeometry(0.036, 0.003, 0.004), lidMat); lid.position.set(0, -0.001, 0.012); lid.rotation.z = s * -0.12; eg.add(lid);
      this.eyes.push({ g: eg, iris, pupil, shine, lid });
    }

    // Ears
    const earG = paint(new T.ConeGeometry(0.036, 0.07, 4, 1), coat, 'ear', seed);
    const innerMat = new T.MeshStandardMaterial({ color: coat.pattern === 'point' ? 0x6b5040 : 0xf0a3b2, roughness: 0.8 });
    this.ears = [];
    for (const s of [-1, 1]) {
      const pivot = new T.Group(); pivot.position.set(s * 0.048, 0.11, 0.035); head.add(pivot);
      const ear = pick(new T.Mesh(earG, fur), 'head'); ear.position.y = 0.03; ear.rotation.y = Math.PI / 4; ear.scale.set(1, 1, 0.45); pivot.add(ear);
      const inner = new T.Mesh(new T.ConeGeometry(0.024, 0.05, 3, 1), innerMat); inner.position.set(0, 0.025, 0.012); inner.scale.set(1, 1, 0.3); inner.rotation.y = Math.PI; pivot.add(inner);
      pivot.rotation.z = -s * 0.28;
      this.ears.push({ pivot, side: s });
    }

    // Whiskers
    const wpts = [];
    for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
      wpts.push(new T.Vector3(s * 0.03, 0.024 + k * 0.006, 0.125), new T.Vector3(s * 0.12, 0.03 + k * 0.022, 0.1 - Math.abs(k) * 0.01));
    }
    const wh = new T.LineSegments(new T.BufferGeometry().setFromPoints(wpts), new T.LineBasicMaterial({ color: coatKey === 'white' || coat.pattern === 'point' ? 0x999999 : 0xf2f2f2, transparent: true, opacity: 0.85 }));
    head.add(wh);

    // Tail: chain of segments
    this.tail = [];
    let parent = hip;
    const segs = 11;
    for (let i = 0; i < segs; i++) {
      const sg = new T.Group();
      sg.position.set(0, i === 0 ? 0.06 : 0, i === 0 ? -0.07 : -0.033);
      parent.add(sg);
      const r0 = 0.021 - i * 0.0007, r1 = 0.021 - (i + 1) * 0.0007;
      const ring = coat.pattern === 'tabby' && i % 2 === 1;
      const geo = paint(new T.CylinderGeometry(r1, r0, 0.036, 10).rotateX(Math.PI / 2).translate(0, 0, -0.016), coat, ring ? 'tailRing' : 'tail', seed + i, p => { p.z += i * 0.4; });
      const m = pick(new T.Mesh(geo, fur), 'tail');
      sg.add(m);
      this.tail.push({ g: sg, m });
      parent = sg;
    }
    const tipG = paint(new T.SphereGeometry(0.0145, 10, 8), coat, coat.pattern === 'tabby' ? 'tailRing' : 'tail', seed + 20);
    const tip = pick(new T.Mesh(tipG, fur), 'tail'); tip.position.z = -0.034; parent.add(tip);

    g.scale.setScalar(this.scale || 1.3);
  }
  setScale(s) { this.scale = s; this.group.scale.setScalar(s); }
  setPose(name) {
    if (!POSES[name]) name = 'stand';
    this.poseName = name;
    this.target = Object.assign({}, BASE_POSE, POSES[name]);
  }

  /* ctx: { speed (m/s), dt, purr (0..1), lash (0..1), wiggle (0..1), lookYaw (rad|null), lookPitch, knead } */
  update(dt, ctx = {}) {
    this.time += dt;
    const P = this.pose, Tg = this.target;
    const k = 1 - Math.exp(-dt * (ctx.fast ? 16 : 7));
    for (const key in Tg) P[key] += (Tg[key] - P[key]) * k;

    // Gait
    const speed = ctx.speed || 0;
    const walkTarget = Math.min(1, speed / 0.35);
    this.walk += (walkTarget - this.walk) * (1 - Math.exp(-dt * 10));
    this.phase += dt * (4 + speed * 9);
    const gallop = speed > 1.2;

    // Body
    const pitch = P.pitch + (gallop ? Math.sin(this.phase * 2) * 0.08 * this.walk : 0);
    const breathe = Math.sin(this.time * (this.poseName === 'sleep' ? 2.2 : 3.4)) * 0.012;
    const bob = Math.abs(Math.sin(this.phase)) * 0.012 * this.walk;
    let hipY = P.hipY + bob;
    const wig = ctx.wiggle || 0;
    this.root.position.y = 0;
    this.hip.position.set(Math.sin(this.time * 18) * 0.012 * wig, hipY, 0);
    this.hip.rotation.set(-pitch, Math.sin(this.time * 18) * 0.12 * wig, P.roll);
    this.torso.scale.y = 0.1 * (1 + breathe) * (1 + P.puff * 0.25);
    this.torso.scale.x = 0.105 * (1 + P.puff * 0.25);
    if (ctx.purr) this.hip.position.x += Math.sin(this.time * 90) * 0.0012 * ctx.purr;

    // Legs
    const shoulderY = hipY + 0.255 * Math.sin(pitch) + 0.0;
    for (let i = 0; i < 4; i++) {
      const lg = this.legs[i];
      const front = lg.front;
      const tuck = front ? P.fTuck : P.rTuck;
      const order = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5][i];
      let swing = Math.sin(this.phase + order) * (gallop ? 0.75 : 0.5) * this.walk;
      if (gallop) swing = Math.sin(this.phase + (front ? 0 : Math.PI * 0.6) + (lg.side > 0 ? 0.3 : 0)) * 0.8 * this.walk;
      let ang = swing * (1 - tuck) + -1.42 * tuck;
      const baseY = front ? shoulderY : hipY;
      let len = Math.max(0.06, (baseY - PAW_R * 0.6) / Math.max(0.35, Math.cos(ang)));
      len = len * (1 - tuck) + (front ? 0.11 : 0.09) * tuck;
      // Paw lift during walk
      if (this.walk > 0.05 && tuck < 0.5) len -= Math.max(0, Math.cos(this.phase + order)) * 0.03 * this.walk;
      // Kneading
      if (front && ctx.knead) { ang += 0; len -= Math.max(0, Math.sin(this.time * 6 + (lg.side > 0 ? Math.PI : 0))) * 0.035; }
      // Scratching / reaching up
      if (front && P.reach > 0.01) { ang = ang * (1 - P.reach) + (-1.25 + Math.sin(this.time * 10 + lg.side) * 0.3) * P.reach; len = len * (1 - P.reach) + 0.2 * P.reach; }
      // Leaping: front forward, back legs back
      if (P.spread > 0.01) { ang = ang * (1 - P.spread) + (front ? -1.0 : 0.9) * P.spread; len = len * (1 - P.spread) + L * P.spread; }
      // Dangling when carried
      if (P.dangle > 0.01) { ang = ang * (1 - P.dangle) + (front ? 0.15 : -0.1) * P.dangle + Math.sin(this.time * 2 + i) * 0.05; len = len * (1 - P.dangle) + L * 0.95 * P.dangle; }
      // Raised paw (grooming/swiping) on the right front leg
      if (front && lg.side > 0 && P.raise > 0.01) {
        const swipe = this.poseName === 'swipe' ? Math.sin(this.time * 9) * 0.5 : Math.sin(this.time * 7) * 0.15;
        ang = ang * (1 - P.raise) + (-2.3 + swipe) * P.raise; len = len * (1 - P.raise) + 0.13 * P.raise;
      }
      len = Math.min(len, 0.36);
      lg.pivot.rotation.x = ang + pitch;
      lg.leg.scale.y = len;
      lg.paw.position.y = -len;
    }

    // Head
    let yaw = P.headYaw, hp = P.headPitch;
    if (ctx.lookYaw != null) { yaw = yaw * 0.3 + T.MathUtils.clamp(ctx.lookYaw, -1.1, 1.1) * 0.7; }
    if (ctx.lookPitch != null) { hp = hp * 0.4 + T.MathUtils.clamp(ctx.lookPitch, -0.8, 0.6) * 0.6; }
    this.headYawCur = (this.headYawCur || 0) + (yaw - (this.headYawCur || 0)) * (1 - Math.exp(-dt * 6));
    this.headPitchCur = (this.headPitchCur || 0) + (hp - (this.headPitchCur || 0)) * (1 - Math.exp(-dt * 6));
    this.neck.rotation.set(pitch * 0.85 + this.headPitchCur, this.headYawCur, P.headRoll);
    if (this.poseName === 'groom' || ctx.lick) this.head.rotation.x = Math.sin(this.time * 9) * 0.08;
    else this.head.rotation.x = 0;

    // Ears
    for (const e of this.ears) {
      const twitch = Math.sin(this.time * 0.7 + e.side * 3) > 0.985 ? 0.3 : 0;
      e.pivot.rotation.set(-P.earBack * 0.9, 0, -e.side * (0.28 + P.earBack * 0.9 + twitch));
    }

    // Eyes + blink
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.18; this.blinkT = 2.5 + Math.random() * 4; }
    if (this.blink > 0) this.blink -= dt;
    const open = Math.max(0.02, P.eye * (this.blink > 0 ? 0.05 : 1));
    for (const e of this.eyes) {
      e.iris.scale.y = open; e.pupil.scale.y = 0.95 * open; e.shine.visible = open > 0.4;
      e.pupil.scale.x = 0.25 + P.pupil * 0.55;
      e.lid.visible = open < 0.35;
    }
    this.mouthMesh.scale.y = 0.001 + P.mouth * 0.012;
    this.mouthMesh.position.y = 0.008 - P.mouth * 0.006;

    // Tail
    const n = this.tail.length;
    const lash = ctx.lash || 0;
    const swayAmp = 0.22 + lash * 0.5 + this.walk * 0.08;
    const swaySpeed = 1.6 + lash * 9;
    for (let i = 0; i < n; i++) {
      const t = this.tail[i];
      const f = i / n;
      let rx = 0, ry = 0;
      // Gentle S-curve: rises from the base, leans back mid-way, tip hooks forward
      if (i === 0) rx = -0.3 + P.tailUp * 0.95;
      else if (f < 0.55) rx = P.tailUp * (P.tailUp > 1.2 ? 0.02 : -0.03);
      else rx = P.tailUp * (P.tailUp > 1.2 ? 0.03 : 0.16);
      if (P.tailUp < 0) rx = i === 0 ? -0.15 + P.tailUp * 0.6 : 0.03;
      ry = Math.sin(this.time * swaySpeed - i * 0.45) * swayAmp * (0.3 + f) / 3;
      ry += P.tailCurl * 0.16 * (i > 1 ? 1 : 0.3);
      if (gallop) rx -= 0.04;
      t.g.rotation.set(rx, ry, 0);
      const puff = 1 + P.puff * 0.9;
      t.m.scale.set(puff, puff, 1);
    }
  }

  headWorld(v = new T.Vector3()) { return this.head.getWorldPosition(v).add(new T.Vector3(0, 0.12 * this.group.scale.y, 0)); }
  /* Classify a ray hit on the cat into a petting zone */
  zoneFor(hit) {
    const obj = hit.object;
    let z = obj.userData.zone || 'body';
    if (z === 'head' || z === 'cheek') {
      const lp = this.head.worldToLocal(hit.point.clone());
      if (z === 'cheek' && Math.abs(lp.x) > 0.04) return 'cheek';
      if (lp.y < 0.02 && lp.z > 0.05) return 'chin';
      if (Math.abs(lp.x) > 0.06) return 'cheek';
      return 'head';
    }
    if (z === 'chin') return 'chin';
    if (z === 'body' || z === 'chest') {
      const lp = this.torso.worldToLocal(hit.point.clone());
      if (lp.y < -0.45) return 'belly';
      if (z === 'chest' && lp.y < 0.2) return 'chin';
      if (lp.z < -0.35) return 'rump';
      return 'back';
    }
    if (z === 'rump') return 'rump';
    if (z === 'leg' || z === 'paw') return 'paws';
    return z;
  }
}
VPC.CatModel = CatModel;
})();
