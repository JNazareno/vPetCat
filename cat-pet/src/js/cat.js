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
/* Smoothstep from e0 to e1 (works in either direction), for soft pattern edges */
function ss(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
/* Fur colour for a body part at local point p (unit-ish coordinates). Pattern edges blend softly. */
function furColor(coat, part, p, seed) {
  const C = coat;
  const base = new T.Color(C.base), dark = new T.Color(C.dark), light = new T.Color(C.light);
  const n = noise3(p.x * 2.4 + 10, p.y * 2.4, p.z * 2.4, seed);
  const fine = noise3(p.x * 9, p.y * 9, p.z * 9, seed + 7) * 0.05;
  const c = base.clone();
  switch (C.pattern) {
    case 'tabby': {
      if (part === 'body') {
        // Mackerel tabby: many thin stripes running down the flanks, broken up by noise, and a dark line along the spine
        const brk = noise3(p.x * 6, p.y * 6, p.z * 6, seed + 11);
        const stripe = Math.sin(p.z * 23 + n * 2.6 + Math.abs(p.x) * 3.5 - p.y * 2);
        c.lerp(dark, ss(0.35, 0.8, stripe) * ss(-0.45, -0.05, p.y) * ss(-0.35, 0.1, brk) * 0.9);
        c.lerp(dark, ss(0.72, 0.9, p.y) * ss(0.3, 0.12, Math.abs(p.x)) * 0.85);
        c.lerp(light, ss(-0.35, -0.65, p.y));
      } else if (part === 'head') {
        c.lerp(dark, ss(0.25, 0.45, p.y) * ss(0.55, 0.9, Math.abs(Math.sin(p.x * 13))) * ss(-0.3, -0.1, p.z));
        c.lerp(dark, ss(0.6, 0.8, Math.abs(p.x)) * ss(0.2, 0.65, Math.sin(p.y * 18)) * ss(-0.3, -0.15, p.y) * ss(0.35, 0.2, p.y));
        c.lerp(light, ss(-0.25, -0.5, p.y) * ss(0.15, 0.4, p.z));
        c.lerp(light, ss(0.55, 0.8, p.z) * ss(-0.05, -0.3, p.y) * ss(0.55, 0.35, Math.abs(p.x)));
      } else if (part === 'leg') {
        c.lerp(dark, ss(0.4, 0.8, Math.sin(p.y * 26)) * ss(-0.85, -0.7, p.y) * 0.85);
      } else if (part === 'muzzle' || part === 'chin') c.copy(light);
      else if (part === 'tailRing') c.copy(dark);
      break;
    }
    case 'tuxedo': {
      if (part === 'body') c.lerp(light, Math.max(ss(-0.25, -0.45, p.y), ss(0.45, 0.65, p.z) * ss(0.45, 0.25, p.y)));
      if (part === 'head') c.lerp(light, ss(-0.1, -0.3, p.y) * ss(0.15, 0.35, p.z) * ss(0.65, 0.45, Math.abs(p.x)));
      if (part === 'muzzle' || part === 'chin' || part === 'paw') c.copy(light);
      if (part === 'leg') c.lerp(light, ss(-0.55, -0.75, p.y));
      break;
    }
    case 'calico': {
      const k = noise3(p.x * 1.7 + (part === 'head' ? 30 : part === 'tail' || part === 'tailRing' ? 60 : 0), p.y * 1.7, p.z * 1.7, seed + 3);
      c.lerp(new T.Color(C.patch), ss(0.1, 0.26, k));
      c.lerp(dark, ss(-0.17, -0.33, k));
      if (part === 'body') c.lerp(light, ss(-0.3, -0.55, p.y));
      if (part === 'muzzle' || part === 'chin' || part === 'paw') c.copy(light);
      if (part === 'head') c.lerp(light, ss(0.5, 0.75, p.z) * ss(0.0, -0.3, p.y) * ss(0.6, 0.4, Math.abs(p.x)));
      if (part === 'leg') c.lerp(light, ss(-0.4, -0.62, p.y));
      break;
    }
    case 'point': {
      // Siamese: dark ears, face mask, legs and tail
      if (part === 'leg') c.lerp(dark, Math.max(0, Math.min(1, -p.y * 1.2)));
      if (part === 'paw' || part === 'tail' || part === 'tailRing' || part === 'ear') c.copy(dark);
      if (part === 'head') c.lerp(dark, ss(0.15, 0.85, p.z));
      if (part === 'muzzle' || part === 'chin') c.copy(dark);
      if (part === 'body') c.lerp(light, ss(-0.3, -0.55, p.y));
      break;
    }
    default:
      if (part === 'body') c.lerp(light, ss(-0.4, -0.65, p.y) * 0.4);
      if (part === 'head') c.lerp(light, ss(0.6, 0.85, p.z) * ss(-0.1, -0.35, p.y) * 0.35);
      if (part === 'muzzle' || part === 'chin') c.lerp(light, 0.5);
  }
  if (part === 'ear' && C.pattern !== 'point' && C.pattern !== 'calico') c.copy(base);
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

/* ---------- poses ----------
   hipY: hip joint height; pitch: body tilt (nose up > 0); fTuck: front paws folded under the chest;
   rTuck: back legs folded (sitting on the haunches, feet flat); fwd: front paws stretched forward;
   reach: front paws up (scratching); spread: legs extended in a leap; dangle: legs hanging (carried);
   raise: right front paw lifted (grooming / swiping). */
const BASE_POSE = { hipY: 0.22, pitch: 0, headPitch: 0, headYaw: 0, headRoll: 0, fTuck: 0, rTuck: 0, fwd: 0, tailUp: 1, tailCurl: 0, earBack: 0, eye: 1, pupil: 0.35, raise: 0, dangle: 0, reach: 0, puff: 0, mouth: 0, roll: 0, spread: 0 };
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
  stretch: { hipY: 0.23, pitch: -0.42, headPitch: -0.35, fwd: 1, tailUp: 1.2, mouth: 0.8, eye: 0.3 },
  scratch: { hipY: 0.22, pitch: 0.95, headPitch: -0.6, reach: 1, tailUp: 0.9 },
  litter:  { hipY: 0.12, pitch: 0.28, rTuck: 0.85, headPitch: -0.1, tailUp: 1.2, eye: 0.6 },
  pee:     { hipY: 0.1, pitch: 0.18, fTuck: 0.1, rTuck: 0.8, headPitch: -0.05, tailUp: 1.25, eye: 0.65, earBack: 0.1 },
  poop:    { hipY: 0.12, pitch: 0.4, fTuck: 0.05, rTuck: 0.95, headPitch: 0.05, tailUp: 1.45, eye: 0.15, earBack: 0.3 },
  sniff:   { hipY: 0.2, pitch: -0.15, headPitch: 0.8, fTuck: 0.1, tailUp: 0.7, eye: 0.8 },
  angry:   { hipY: 0.235, pitch: 0.0, headPitch: 0.15, earBack: 1, tailUp: 1.6, puff: 1, pupil: 1, mouth: 1 },
  carried: { hipY: 0.0, pitch: 0.35, dangle: 1, tailUp: -0.9, earBack: 0.3, headPitch: -0.1 },
  leap:    { hipY: 0.22, pitch: 0.12, spread: 1, tailUp: 0.6, pupil: 1, earBack: 0.1 },
  meow:    { hipY: 0.085, pitch: 0.62, headPitch: -0.55, rTuck: 1, mouth: 1, tailUp: 0.6 },
  swipe:   { hipY: 0.085, pitch: 0.62, headPitch: -0.2, rTuck: 1, raise: 1, tailUp: 0.4, pupil: 0.8 },
  knead:   { hipY: 0.1, pitch: 0.1, fTuck: 0.3, rTuck: 1, headPitch: 0.1, eye: 0.25, tailUp: 0.2 },
  happy:   { hipY: 0.085, pitch: 0.62, headPitch: -0.15, rTuck: 1, eye: 0.25, tailUp: 1.1 },
};
VPC.POSES = POSES;

/* ---------- skeleton (model units; the model group is scaled ~1.3 for an adult) ---------- */
const SK = {
  shoulder: new T.Vector3(0.034, -0.026, 0.222), // front leg roots (x mirrored), in the body frame
  hip: new T.Vector3(0.036, -0.026, 0.012),      // back leg roots
  upperArm: 0.086, forearm: 0.088, pastern: 0.03,
  thigh: 0.102, shin: 0.106, meta: 0.074,
  pawH: 0.012,                                    // paw half-height: how high the foot centre sits off the ground
};
const UP = new T.Vector3(0, 1, 0);
const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3(), _v4 = new T.Vector3();

/* Smooth piecewise-linear lookup: table = [[t, value], ...] */
function curve(table, t) {
  if (t <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [t1, v1] = table[i];
    if (t <= t1) { const [t0, v0] = table[i - 1]; const k = (t - t0) / (t1 - t0); const s = k * k * (3 - 2 * k); return v0 + (v1 - v0) * s; }
  }
  return table[table.length - 1][1];
}

/* A limb segment as a lathe: radius profile along its length (0 at the joint it hangs from) */
function limbGeometry(len, profile, segs = 12) {
  const pts = [new T.Vector2(0.0001, -profile[0][1] * 0.7)];
  for (const [f, r] of profile) pts.push(new T.Vector2(r, f * len));
  const last = profile[profile.length - 1][1];
  pts.push(new T.Vector2(last * 0.7, len + last * 0.45), new T.Vector2(0.0001, len + last * 0.75));
  const g = new T.LatheGeometry(pts, segs);
  g.computeVertexNormals();
  return g;
}

/* Two-bone IK: root -> joint -> end, with the joint bending toward `pole`. Writes the joint position. */
function solveIK(root, target, a, b, pole, outJoint, outEnd) {
  const d = _v1.subVectors(target, root);
  let dist = d.length();
  const maxD = a + b - 1e-4, minD = Math.abs(a - b) + 1e-3;
  dist = Math.min(maxD, Math.max(minD, dist));
  const dir = d.normalize();
  outEnd.copy(root).addScaledVector(dir, dist);
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // Bend direction: the pole, made perpendicular to the root->end direction
  const bend = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(dir, -dir.z);
  bend.normalize();
  outJoint.copy(root).addScaledVector(dir, cosA * a).addScaledVector(bend, sinA * a);
}

/* Fine fur-strand normal map, generated once */
let FUR_NORMAL = null;
function furTextures() {
  if (FUR_NORMAL) return;
  const N = 256, h = new Float32Array(N * N);
  // Height field of short, mostly-aligned strokes
  for (let i = 0; i < 9000; i++) {
    let x = Math.random() * N, y = Math.random() * N;
    const ang = Math.PI / 2 + (Math.random() - 0.5) * 0.5, len = 3 + Math.random() * 6, w = Math.random() * 0.4 + 0.3;
    for (let k = 0; k < len; k++) {
      const xi = ((Math.floor(x) % N) + N) % N, yi = ((Math.floor(y) % N) + N) % N;
      h[yi * N + xi] += w * (1 - k / len);
      x += Math.cos(ang); y += Math.sin(ang);
    }
  }
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N];
    const hy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    const nx = -hx * 0.8, ny = -hy * 0.8, nz = 1, l = Math.hypot(nx, ny, nz);
    const o = (y * N + x) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  FUR_NORMAL = new T.CanvasTexture(c);
  FUR_NORMAL.wrapS = FUR_NORMAL.wrapT = T.RepeatWrapping;
  FUR_NORMAL.repeat.set(12, 12);
}

/* Iris texture: radial fibres, darker rim */
function irisTexture(hex) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), base = new T.Color(hex).lerp(new T.Color(0x6e6040), 0.28);
  const css = (col, a = 1) => `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${a})`;
  const light = base.clone().lerp(new T.Color(0xf2e6b0), 0.28), dark = base.clone().multiplyScalar(0.5);
  const grd = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grd.addColorStop(0, css(light)); grd.addColorStop(0.55, css(base)); grd.addColorStop(0.86, css(base.clone().multiplyScalar(0.8))); grd.addColorStop(0.95, css(dark)); grd.addColorStop(1, 'rgba(10,10,10,1)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2, r0 = 12 + Math.random() * 10, r1 = 40 + Math.random() * 18;
    g.strokeStyle = Math.random() < 0.5 ? css(light, 0.35) : css(dark, 0.25); g.lineWidth = 1;
    g.beginPath(); g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0); g.lineTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1); g.stroke();
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  return t;
}

/* Torso: a sphere sculpted along its length (rump -> waist -> deep chest), painted before shaping */
const BODY = { zMin: -0.11, zMax: 0.295 };
const BODY_W   = [[0, 0.068], [0.15, 0.08], [0.3, 0.082], [0.52, 0.068], [0.72, 0.074], [0.88, 0.074], [1, 0.06]];
const BODY_TOP = [[0, 0.066], [0.15, 0.075], [0.3, 0.078], [0.52, 0.07], [0.76, 0.08], [1, 0.07]];
const BODY_BOT = [[0, 0.064], [0.15, 0.084], [0.3, 0.088], [0.5, 0.082], [0.76, 0.1], [1, 0.074]];
function bodyGeometry(coat, seed) {
  const g = new T.SphereGeometry(1, 40, 56);
  g.rotateX(Math.PI / 2); // poles along z (tail end -> chest)
  paint(g, coat, 'body', seed);
  const pos = g.attributes.position, half = (BODY.zMax - BODY.zMin) / 2, mid = (BODY.zMax + BODY.zMin) / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const zn = Math.sign(z) * Math.pow(Math.abs(z), 0.5); // blunter, rounder ends
    const Z = mid + zn * half, t = (Z - BODY.zMin) / (BODY.zMax - BODY.zMin);
    const X = x * curve(BODY_W, t);
    let Y = y > 0 ? y * curve(BODY_TOP, t) : y * curve(BODY_BOT, t);
    Y += 0.01 * Math.sin(Math.PI * t) - 0.004; // gently arched back
    pos.setXYZ(i, X, Y, Z);
  }
  g.computeVertexNormals();
  return g;
}
/* Head: cat skull with wide cheeks, flat forehead and a short muzzle */
function headGeometry(coat, seed) {
  const g = new T.SphereGeometry(1, 40, 30);
  paint(g, coat, 'head', seed);
  const pos = g.attributes.position, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    let X = px * 0.084, Y = py * 0.062, Z = pz * 0.069;
    X *= 1 + 0.14 * clamp((0.1 - py) / 0.9, 0, 1) * (1 - 0.4 * clamp(pz, 0, 1));      // cheeks / jowls
    if (py > 0) { Y *= 1 - 0.1 * py * py; Z -= py * clamp(pz, 0, 1) * 0.012; }         // forehead slopes back from the nose
    const muzzle = clamp((pz - 0.45) / 0.55, 0, 1) * clamp(1 - Math.abs(py + 0.3) / 0.45, 0, 1) * clamp(1 - Math.abs(px) / 0.62, 0, 1);
    Z += muzzle * 0.034; Y -= muzzle * 0.005;                                          // muzzle
    for (const sd of [-1, 1]) {                                                         // whisker pads
      const d = Math.hypot((px - sd * 0.26) / 0.24, (py + 0.42) / 0.2);
      const bump = Math.pow(clamp(1 - d, 0, 1), 1.6) * clamp((pz - 0.55) / 0.45, 0, 1);
      Z += bump * 0.019; X += sd * bump * 0.004; Y -= bump * 0.003;
    }
    const dc = Math.hypot(px / 0.22, (py + 0.72) / 0.16);                              // chin
    Z += Math.pow(clamp(1 - dc, 0, 1), 1.5) * clamp(pz - 0.4, 0, 1) * 0.016;
    if (py < -0.45) Y *= 1 + (-py - 0.45) * 0.22;                                       // fuller, rounder jaw line
    const brow = clamp((pz - 0.55) / 0.45, 0, 1) * clamp(1 - Math.abs(py - 0.3) / 0.25, 0, 1);
    Z -= brow * 0.004;                                                                 // the "stop" above the nose
    if (pz < 0) Z *= 0.93;
    pos.setXYZ(i, X, Y + 0.055, Z + 0.042);
  }
  g.computeVertexNormals();
  return g;
}

class CatModel {
  constructor(coatKey, seed = 1) {
    this.group = new T.Group();
    this.pose = Object.assign({}, BASE_POSE, POSES.loaf);
    this.target = Object.assign({}, this.pose);
    this.poseName = 'loaf';
    this.phase = 0; this.walk = 0; this.time = 0; this.speedSm = 0;
    this.blinkT = 2; this.blink = 0;
    this.lookAt = null; this.wet = 0;
    this.pickables = [];
    furTextures();
    this.build(coatKey, seed);
  }
  build(coatKey, seed = 1) {
    this.coatKey = coatKey; this.seed = seed;
    const coat = COATS[coatKey];
    const g = this.group;
    while (g.children.length) g.remove(g.children[0]);
    this.pickables = [];
    const sheen = new T.Color(coat.light).lerp(new T.Color(0xffffff), 0.3);
    const fur = this.furMat = new T.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.88, metalness: 0,
      sheen: 1, sheenRoughness: 0.65, sheenColor: sheen.multiplyScalar(coatKey === 'black' || coat.pattern === 'tuxedo' ? 0.12 : 0.4),
      normalMap: FUR_NORMAL, normalScale: new T.Vector2(0.12, 0.12), envMap: VPC.envMap || null, envMapIntensity: 0.35,
    });
    const pick = (m, zone) => {
      m.userData.zone = zone; m.castShadow = true; m.receiveShadow = true;
      this.pickables.push(m);
      return m;
    };

    const root = this.root = new T.Group(); g.add(root);
    const hip = this.hip = new T.Group(); root.add(hip);

    // Torso
    this.torso = pick(new T.Mesh(bodyGeometry(coat, seed), fur), 'body');
    hip.add(this.torso);
    // Neck / scruff, bridging the chest and the head
    const neckG = paint(new T.SphereGeometry(1, 28, 20), coat, 'body', seed, p => { p.z = p.z * 0.4 + 0.7; p.y = p.y * 0.7 + 0.2; });
    const neckM = pick(new T.Mesh(neckG, fur), 'chest');
    neckM.scale.set(0.062, 0.07, 0.085); neckM.position.set(0, 0.04, 0.248); neckM.rotation.x = -0.55;
    hip.add(neckM);

    // Legs (meshes live in the root frame; the IK places them every frame)
    this.legs = [];
    const legPart = (len, profile, part, y0, frac, r0) => paint(limbGeometry(len, profile), coat, part, seed, p => { const f = p.y / len; p.y = -(y0 + Math.max(0, Math.min(1, f)) * frac); p.x /= r0; p.z /= r0; });
    const joint = (r, part, y) => paint(new T.SphereGeometry(r, 14, 10), coat, part, seed, p => { p.x /= r; p.z /= r; p.y = y; });
    for (const side of [-1, 1]) for (const front of [true, false]) {
      const L = { front, side, segs: [], joints: [] };
      if (front) {
        L.segs.push(pick(new T.Mesh(legPart(SK.upperArm, [[0, 0.03], [0.4, 0.029], [0.75, 0.025], [1, 0.0225]], 'leg', 0, 0.42, 0.03), fur), 'leg'));
        L.segs.push(pick(new T.Mesh(legPart(SK.forearm, [[0, 0.022], [0.3, 0.0215], [1, 0.0175]], 'leg', 0.42, 0.42, 0.022), fur), 'leg'));
        L.segs.push(pick(new T.Mesh(legPart(SK.pastern, [[0, 0.0175], [1, 0.017]], 'leg', 0.84, 0.12, 0.0175), fur), 'leg'));
        L.joints.push(pick(new T.Mesh(joint(0.0222, 'leg', -0.42), fur), 'leg'));   // elbow
      } else {
        L.segs.push(pick(new T.Mesh(legPart(SK.thigh, [[0, 0.046], [0.3, 0.048], [0.6, 0.039], [0.85, 0.029], [1, 0.0235]], 'leg', 0, 0.3, 0.048), fur), 'rump'));
        L.segs.push(pick(new T.Mesh(legPart(SK.shin, [[0, 0.023], [0.3, 0.021], [1, 0.0165]], 'leg', 0.3, 0.38, 0.023), fur), 'leg'));
        L.segs.push(pick(new T.Mesh(legPart(SK.meta, [[0, 0.0165], [1, 0.0155]], 'leg', 0.68, 0.3, 0.0165), fur), 'leg'));
        L.joints.push(pick(new T.Mesh(joint(0.0235, 'leg', -0.3), fur), 'leg'));    // knee
        L.joints.push(pick(new T.Mesh(joint(0.0172, 'leg', -0.68), fur), 'leg'));   // hock (heel)
      }
      // Paw: an oval pad with three toes at the front
      const paw = new T.Group();
      const pawM = pick(new T.Mesh(paint(new T.SphereGeometry(1, 16, 12), coat, 'paw', seed), fur), 'paws');
      pawM.scale.set(0.02, 0.0125, front ? 0.026 : 0.024); pawM.position.set(0, 0, 0.008);
      paw.add(pawM);
      for (const tx of [-0.011, 0, 0.011]) {
        const toe = pick(new T.Mesh(paint(new T.SphereGeometry(0.0085, 10, 8), coat, 'paw', seed), fur), 'paws');
        toe.scale.set(1, 0.85, 1.15); toe.position.set(tx, -0.002, 0.027 - Math.abs(tx) * 0.35);
        paw.add(toe);
      }
      L.paw = paw;
      L.segs[0].userData.flat = front ? 0.82 : 0.72;
      for (const m of [...L.segs, ...L.joints]) root.add(m);
      root.add(paw);
      L.foot = new T.Vector3(); L.anchor = new T.Vector3();
      this.legs.push(L);
    }

    // Neck pivot + head
    const neck = this.neck = new T.Group(); neck.position.set(0, 0.062, 0.266); hip.add(neck);
    // Throat/neck fur that turns with the head, filling the gap between neck and skull
    const throat = pick(new T.Mesh(paint(new T.SphereGeometry(1, 24, 18), coat, 'body', seed, p => { p.z = p.z * 0.4 + 0.75; p.y = p.y * 0.6 + 0.15; }), fur), 'chest');
    throat.scale.set(0.05, 0.054, 0.055); throat.position.set(0, 0.01, 0.0); neck.add(throat);
    const head = this.head = new T.Group(); neck.add(head);
    const skull = pick(new T.Mesh(headGeometry(coat, seed), fur), 'head');
    head.add(skull);
    this.mouthMesh = new T.Mesh(new T.SphereGeometry(1, 12, 8), new T.MeshStandardMaterial({ color: 0x6b2430, roughness: 0.6 }));
    this.mouthMesh.scale.set(0.014, 0.001, 0.009); this.mouthMesh.position.set(0, 0.009, 0.125); head.add(this.mouthMesh);
    // Nose leather: a rounded triangle pointing down
    const noseCol = coat.pattern === 'point' || coatKey === 'black' ? 0x3a2a2a : coatKey === 'grey' ? 0x8a6a72 : 0xe0849a;
    const nose = new T.Mesh(new T.CylinderGeometry(0.0098, 0.0038, 0.007, 3, 1), new T.MeshStandardMaterial({ color: new T.Color(noseCol).lerp(new T.Color(0x7a5a55), 0.3), roughness: 0.6 }));
    nose.rotation.set(Math.PI / 2 - 0.45, 0, Math.PI); nose.scale.set(1, 1, 0.5); nose.position.set(0, 0.039, 0.134); head.add(nose);

    // Eyes: dark eyeball, textured iris disc, slit pupil, glossy cornea
    this.eyes = [];
    const irisTex = irisTexture(coat.eye);
    const ballMat = new T.MeshStandardMaterial({ color: new T.Color(coat.eye).multiplyScalar(0.25), roughness: 0.4 });
    const irisMat = new T.MeshStandardMaterial({ map: irisTex, roughness: 0.35, emissive: new T.Color(coat.eye), emissiveMap: irisTex, emissiveIntensity: 0.03 });
    const pupilMat = new T.MeshBasicMaterial({ color: 0x050505 });
    const corneaMat = new T.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, envMap: VPC.envMap || null, envMapIntensity: 0.8 });
    const rimMat = new T.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.8 });
    const lidMat = new T.MeshStandardMaterial({ color: new T.Color(coat.pattern === 'tabby' || coat.pattern === 'point' ? coat.dark : coat.base).multiplyScalar(0.5), roughness: 1 });
    for (const s of [-1, 1]) {
      // Set slightly into the head so the surrounding fur frames the eye; outer corners tilt up
      const eg = new T.Group(); eg.position.set(s * 0.0335, 0.061, 0.0988); eg.rotation.y = s * 0.4; eg.rotation.z = s * 0.2; head.add(eg);
      const ball = new T.Mesh(new T.SphereGeometry(0.016, 18, 14), ballMat); ball.scale.set(1, 1, 0.55); eg.add(ball);
      const iris = new T.Mesh(new T.CircleGeometry(0.0139, 32), irisMat); iris.position.z = 0.0089; eg.add(iris);
      const pupil = new T.Mesh(new T.CircleGeometry(0.0128, 24), pupilMat); pupil.position.z = 0.0091; pupil.scale.set(0.3, 0.92, 1); eg.add(pupil);
      const rim = new T.Mesh(new T.TorusGeometry(0.0146, 0.0016, 8, 36), rimMat); rim.position.z = 0.0078; eg.add(rim);
      const cornea = new T.Mesh(new T.SphereGeometry(0.0148, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), corneaMat); cornea.rotation.x = Math.PI / 2; cornea.scale.set(1, 0.55, 1); cornea.position.z = 0.0062; eg.add(cornea);
      const lid = new T.Mesh(new T.BoxGeometry(0.03, 0.0024, 0.004), lidMat); lid.position.set(0, -0.001, 0.0105); eg.add(lid);
      this.eyes.push({ g: eg, iris, pupil, lid, cornea });
    }

    // Ears: solid, flattened cones (real thickness, closed edges) with the base sunk into the head.
    // The pink inner ear is painted onto the front face, fading into a soft rim of fur at the edges.
    const EAR_R = 0.035, EAR_H = 0.062;
    const earG = paint(new T.ConeGeometry(EAR_R, EAR_H, 28, 6, false), coat, 'ear', seed);
    earG.translate(0, EAR_H / 2, 0);
    {
      const pos = earG.attributes.position, col = earG.attributes.color;
      const pink = new T.Color(coat.pattern === 'point' ? 0x6b5040 : 0xc9a29e), c = new T.Color(), deep = new T.Color();
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i), z = pos.getZ(i), r = EAR_R * (1 - y / EAR_H);
        const front = r > 1e-4 ? z / r : 0;                       // 1 at the middle of the front face, 0 at the side edges
        const amt = ss(0.3, 0.62, front) * ss(0.95, 0.78, y / EAR_H);
        if (amt <= 0) continue;
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
        deep.copy(pink).multiplyScalar(1 - 0.22 * ss(0.65, 1, front) * ss(0.7, 0.2, y / EAR_H)); // a little darker deep inside
        c.lerp(deep, amt);
        col.setXYZ(i, c.r, c.g, c.b);
      }
    }
    this.ears = [];
    for (const s of [-1, 1]) {
      const pivot = new T.Group(); pivot.position.set(s * 0.05, 0.091, 0.024); head.add(pivot);
      const ear = pick(new T.Mesh(earG, fur), 'head'); ear.scale.set(1, 1, 0.5); pivot.add(ear);
      pivot.rotation.z = -s * 0.36;
      this.ears.push({ pivot, side: s });
    }

    // Whiskers: slightly drooping curves
    const wpts = [];
    for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
      const a = new T.Vector3(s * 0.027, 0.022 + k * 0.006, 0.126);
      const b = new T.Vector3(s * 0.07, 0.027 + k * 0.015, 0.117 - Math.abs(k) * 0.006);
      const c = new T.Vector3(s * 0.105, 0.017 + k * 0.022, 0.103 - Math.abs(k) * 0.012);
      const crv = new T.QuadraticBezierCurve3(a, b, c).getPoints(6);
      for (let i = 0; i < crv.length - 1; i++) wpts.push(crv[i], crv[i + 1]);
    }
    const mouthPts = [];
    const ph = [new T.Vector3(0, 0.033, 0.1345), new T.Vector3(0, 0.024, 0.1355)];
    mouthPts.push(ph[0], ph[1]);
    for (const sd of [-1, 1]) {
      const crv = new T.QuadraticBezierCurve3(ph[1], new T.Vector3(sd * 0.007, 0.016, 0.135), new T.Vector3(sd * 0.017, 0.017, 0.128)).getPoints(6);
      for (let i = 0; i < crv.length - 1; i++) mouthPts.push(crv[i], crv[i + 1]);
    }
    this.mouthLine = new T.LineSegments(new T.BufferGeometry().setFromPoints(mouthPts), new T.LineBasicMaterial({ color: new T.Color(coat.pattern === 'point' || coatKey === 'black' ? 0x0d0b0a : coat.dark).multiplyScalar(0.5), transparent: true, opacity: 0.7 }));
    head.add(this.mouthLine);
    head.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(wpts), new T.LineBasicMaterial({ color: coatKey === 'white' || coat.pattern === 'point' ? 0x9a9a9a : 0xe6e3dc, transparent: true, opacity: 0.5 })));

    // Tail: a chain of joints (animated) skinned by one seamless tube mesh
    this.tail = [];
    let parent = hip;
    const segs = 11;
    for (let i = 0; i < segs; i++) {
      const sg = new T.Group();
      sg.position.set(0, i === 0 ? 0.028 : 0, i === 0 ? -0.075 : -0.034); // root sits inside the rump
      parent.add(sg);
      this.tail.push({ g: sg });
      parent = sg;
    }
    this.tailEnd = new T.Object3D(); this.tailEnd.position.z = -0.034; parent.add(this.tailEnd);
    this._buildTailTube(coat, seed, fur);
    const rootCap = pick(new T.Mesh(paint(new T.SphereGeometry(0.0215, 14, 10), coat, 'tail', seed + 31), fur), 'tail');
    this.tail[0].g.add(rootCap);

    g.scale.setScalar(this.scale || 1.3);
  }
  _buildTailTube(coat, seed, mat) {
    const RAD = 12, RINGS = 34, TIP = 6;
    this.tailRad = RAD; this.tailRings = RINGS; this.tailTip = TIP;
    const total = RINGS + TIP;
    const pos = new Float32Array(total * RAD * 3), nrm = new Float32Array(total * RAD * 3), col = new Float32Array(total * RAD * 3), uv = new Float32Array(total * RAD * 2);
    const idx = [];
    for (let i = 0; i < total; i++) for (let j = 0; j < RAD; j++) {
      const a = (j / RAD) * Math.PI * 2, f = Math.min(1, i / (RINGS - 1));
      const ringPart = coat.pattern === 'tabby' && Math.floor(f * 11) % 2 === 1 ? 'tailRing' : 'tail';
      const c = furColor(coat, ringPart, new T.Vector3(Math.cos(a), Math.sin(a), f * 4), seed + 31);
      const o = (i * RAD + j) * 3; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      uv[(i * RAD + j) * 2] = j / RAD; uv[(i * RAD + j) * 2 + 1] = i / total * 3;
      if (i < total - 1) {
        const a0 = i * RAD + j, a1 = i * RAD + (j + 1) % RAD, b0 = a0 + RAD, b1 = a1 + RAD;
        idx.push(a0, a1, b0, a1, b1, b0); // wound so the triangles face outward
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('normal', new T.BufferAttribute(nrm, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.tailMesh = new T.Mesh(g, mat);
    this.tailMesh.userData.zone = 'tail'; this.tailMesh.castShadow = true; this.tailMesh.receiveShadow = true;
    this.root.add(this.tailMesh);
    this.pickables.push(this.tailMesh);
    this._tailPts = Array.from({ length: this.tail.length + 1 }, () => new T.Vector3());
    this._tailCurve = new T.CatmullRomCurve3(this._tailPts, false, 'centripetal');
    this._n = new T.Vector3(); this._b = new T.Vector3(); this._t = new T.Vector3();
  }
  _updateTailTube(puff) {
    const pts = this._tailPts, root = this.root;
    root.updateMatrixWorld(true);
    for (let i = 0; i < this.tail.length; i++) { this.tail[i].g.getWorldPosition(pts[i]); root.worldToLocal(pts[i]); }
    this.tailEnd.getWorldPosition(pts[this.tail.length]); root.worldToLocal(pts[this.tail.length]);
    // The tail rests on the surface the cat is on instead of sinking into it: each segment keeps its
    // length, and once it reaches the ground it continues along the ground in the same direction
    const F = 0.019;
    if (pts.some(q => q.y < F)) {
      const orig = this._tailOrig || (this._tailOrig = pts.map(() => new T.Vector3()));
      for (let i = 0; i < pts.length; i++) orig[i].copy(pts[i]);
      if (pts[0].y < F) pts[0].y = F;
      let hx = 0, hz = -1;
      for (let i = 1; i < pts.length; i++) {
        const dx = orig[i].x - orig[i - 1].x, dy = orig[i].y - orig[i - 1].y, dz = orig[i].z - orig[i - 1].z;
        const L = Math.hypot(dx, dy, dz), hl = Math.hypot(dx, dz);
        if (hl > 1e-5) { hx = dx / hl; hz = dz / hl; }
        const ny = Math.max(dy, F - pts[i - 1].y);
        const h = Math.sqrt(Math.max(0, L * L - ny * ny));
        pts[i].set(pts[i - 1].x + hx * h, pts[i - 1].y + ny, pts[i - 1].z + hz * h);
      }
    }
    const RAD = this.tailRad, RINGS = this.tailRings, TIP = this.tailTip;
    const g = this.tailMesh.geometry, P = g.attributes.position.array, Nn = g.attributes.normal.array;
    const n = this._n, b = this._b, t = this._t, p = _v3;
    const pf = 1 + puff * 0.9;
    let r = 0;
    for (let i = 0; i < RINGS; i++) {
      const u = i / (RINGS - 1);
      this._tailCurve.getPoint(u, p);
      this._tailCurve.getTangent(u, t);
      if (i === 0) { n.set(0, 1, 0).addScaledVector(t, -t.y); if (n.lengthSq() < 1e-6) n.set(1, 0, 0); n.normalize(); }
      else { n.addScaledVector(t, -n.dot(t)).normalize(); } // parallel transport
      b.crossVectors(t, n);
      r = (0.021 - 0.009 * u - (u < 0.08 ? (0.08 - u) * 0.02 : 0)) * pf;
      for (let j = 0; j < RAD; j++) {
        const a = (j / RAD) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
        const o = (i * RAD + j) * 3;
        P[o] = p.x + nx * r; P[o + 1] = p.y + ny * r; P[o + 2] = p.z + nz * r;
        Nn[o] = nx; Nn[o + 1] = ny; Nn[o + 2] = nz;
      }
    }
    // Rounded tip
    for (let k = 1; k <= TIP; k++) {
      const a0 = (k / TIP) * Math.PI / 2, rr = r * Math.cos(a0), adv = r * 1.6 * Math.sin(a0);
      for (let j = 0; j < RAD; j++) {
        const a = (j / RAD) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
        const o = ((RINGS - 1 + k) * RAD + j) * 3;
        P[o] = p.x + t.x * adv + nx * rr; P[o + 1] = p.y + t.y * adv + ny * rr; P[o + 2] = p.z + t.z * adv + nz * rr;
        Nn[o] = nx * Math.cos(a0) + t.x * Math.sin(a0); Nn[o + 1] = ny * Math.cos(a0) + t.y * Math.sin(a0); Nn[o + 2] = nz * Math.cos(a0) + t.z * Math.sin(a0);
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
  }
  /* 0..1: fur looks darker and glossier while wet, drying over about a game hour */
  setWet(k) { this.wet = k; }
  setScale(s) { this.scale = s; this.group.scale.setScalar(s); }
  setPose(name) {
    if (!POSES[name]) name = 'stand';
    this.poseName = name;
    this.target = Object.assign({}, BASE_POSE, POSES[name]);
  }

  /* ctx: { speed (m/s), purr (0..1), lash (0..1), wiggle (0..1), lookYaw, lookPitch, knead, lick, fast } */
  update(dt, ctx = {}) {
    this.time += dt;
    const P = this.pose, Tg = this.target;
    const k = 1 - Math.exp(-dt * (ctx.fast ? 16 : 7));
    for (const key in Tg) P[key] += (Tg[key] - P[key]) * k;

    // --- gait ---
    const speed = ctx.speed || 0;
    this.speedSm += (speed - this.speedSm) * (1 - Math.exp(-dt * 8));
    const walkTarget = Math.min(1, speed / 0.25);
    this.walk += (walkTarget - this.walk) * (1 - Math.exp(-dt * 10));
    const gallop = this.speedSm > 1.15;
    const scale = this.group.scale.x || 1;
    const stride = Math.min(0.17, 0.07 + this.speedSm / scale * 0.1);      // model units per step
    const duty = gallop ? 0.42 : 0.62;
    if (this.speedSm > 0.02) this.phase += dt * Math.max(0.6, this.speedSm / scale * duty / stride);
    else this.phase += dt * 0.6 * this.walk;

    // --- body ---
    const wig = ctx.wiggle || 0;
    const pitch = P.pitch + (gallop ? Math.sin(this.phase * Math.PI * 2) * 0.07 * this.walk : 0);
    const bob = (gallop ? Math.abs(Math.sin(this.phase * Math.PI * 2)) * 0.02 : Math.abs(Math.sin(this.phase * Math.PI * 4)) * 0.006) * this.walk;
    const hipY = P.hipY + bob;
    this.hip.position.set(Math.sin(this.time * 18) * 0.012 * wig, hipY, 0);
    this.hip.rotation.set(-pitch, Math.sin(this.time * 18) * 0.12 * wig, P.roll + Math.sin(this.phase * Math.PI * 4) * 0.025 * this.walk * (gallop ? 0 : 1));
    const breathe = Math.sin(this.time * (this.poseName === 'sleep' ? 2.2 : 3.4)) * 0.012;
    this.torso.scale.set(1 + P.puff * 0.18, (1 + breathe) * (1 + P.puff * 0.18), 1);
    if (ctx.purr) this.hip.position.x += Math.sin(this.time * 90) * 0.0012 * ctx.purr;
    this.hip.updateMatrix();

    // --- legs (inverse kinematics) ---
    const fold = this.poseName === 'sleep' ? 1 : 0;
    for (const L of this.legs) this._leg(L, P, ctx, gallop, duty, stride, fold);

    // --- head ---
    let yaw = P.headYaw, hp = P.headPitch;
    if (ctx.lookYaw != null) yaw = yaw * 0.3 + Math.max(-1.1, Math.min(1.1, ctx.lookYaw)) * 0.7;
    if (ctx.lookPitch != null) hp = hp * 0.4 + Math.max(-0.8, Math.min(0.6, ctx.lookPitch)) * 0.6;
    this.headYawCur = (this.headYawCur || 0) + (yaw - (this.headYawCur || 0)) * (1 - Math.exp(-dt * 6));
    this.headPitchCur = (this.headPitchCur || 0) + (hp - (this.headPitchCur || 0)) * (1 - Math.exp(-dt * 6));
    this.neck.rotation.set(pitch * 0.85 + this.headPitchCur, this.headYawCur, P.headRoll);
    this.head.rotation.x = (this.poseName === 'groom' || ctx.lick) ? Math.sin(this.time * 9) * 0.08 : (gallop ? 0 : Math.sin(this.phase * Math.PI * 4) * 0.02 * this.walk);
    for (const e of this.ears) {
      const twitch = Math.sin(this.time * 0.7 + e.side * 3) > 0.985 ? 0.3 : 0;
      e.pivot.rotation.set(-P.earBack * 0.9, e.side * P.earBack * 0.4, -e.side * (0.36 + P.earBack * 0.85 + twitch));
    }
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.16; this.blinkT = 2.5 + Math.random() * 4; }
    if (this.blink > 0) this.blink -= dt;
    const open = Math.max(0.02, P.eye * (this.blink > 0 ? 0.05 : 1));
    for (const e of this.eyes) {
      e.g.scale.y = open * 0.86; // almond-shaped even when wide open
      e.pupil.scale.x = 0.16 + P.pupil * 0.62;
      e.lid.visible = open < 0.35;
      e.lid.scale.y = 1 / Math.max(open, 0.05) * 0.9;
    }
    this.mouthMesh.visible = P.mouth > 0.05; // only open when meowing, yawning or hissing
    this.mouthMesh.scale.y = 0.001 + P.mouth * 0.012;
    this.mouthMesh.position.y = 0.009 - P.mouth * 0.006;

    // --- tail ---
    const n = this.tail.length, lash = ctx.lash || 0;
    const swayAmp = 0.22 + lash * 0.5 + this.walk * 0.08, swaySpeed = 1.6 + lash * 9;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      let rx;
      if (i === 0) rx = -0.3 + P.tailUp * 0.95;
      else if (f < 0.55) rx = P.tailUp * (P.tailUp > 1.2 ? 0.02 : -0.03);
      else rx = P.tailUp * (P.tailUp > 1.2 ? 0.03 : 0.16);
      if (P.tailUp < 0) rx = i === 0 ? -0.15 + P.tailUp * 0.6 : -0.02;
      let ry = Math.sin(this.time * swaySpeed - i * 0.45) * swayAmp * (0.3 + f) / 3 + P.tailCurl * 0.16 * (i > 1 ? 1 : 0.3);
      if (gallop) rx -= 0.04;
      this.tail[i].g.rotation.set(rx, ry, 0);
    }
    this._updateTailTube(P.puff);

    // --- wet fur ---
    if (this.wet > 0) {
      this.wet = Math.max(0, this.wet - dt / 60);
      this.furMat.color.setRGB(1 - 0.28 * this.wet, 1 - 0.28 * this.wet, 1 - 0.24 * this.wet);
      this.furMat.roughness = 0.88 - 0.45 * this.wet;
      this.furMat.sheen = 1 - this.wet * 0.8;
    }
  }

  _leg(L, P, ctx, gallop, duty, stride, fold) {
    const front = L.front, side = L.side;
    const anc = L.anchor.copy(front ? SK.shoulder : SK.hip); anc.x *= side;
    anc.applyMatrix4(this.hip.matrix); // body frame -> root frame
    const ground = SK.pawH;
    // Gait: each leg cycles through stance (planted, sliding back) and swing (lifted, moving forward)
    const offs = gallop ? (front ? (side < 0 ? 0 : 0.12) : (side < 0 ? 0.55 : 0.67)) : (front ? (side < 0 ? 0.25 : 0.75) : (side < 0 ? 0 : 0.5));
    const ph = ((this.phase + offs) % 1 + 1) % 1;
    let gz = 0, gy = 0;
    if (ph < duty) gz = stride * (0.5 - ph / duty);
    else { const u = (ph - duty) / (1 - duty); gz = stride * (-0.5 + u); gy = Math.sin(Math.PI * u) * (gallop ? 0.05 : 0.032); }
    gz *= this.walk; gy *= this.walk;
    const F = L.foot;
    const tuck = front ? P.fTuck : P.rTuck;
    if (front) {
      // Standing: under the shoulder. Tucked: folded under the chest. fwd: stretched out in front.
      F.set(anc.x * 0.95, ground + gy, anc.z + 0.012 + gz + P.fwd * 0.17 + tuck * 0.035);
      if (ctx.knead) F.y += Math.max(0, Math.sin(this.time * 6 + (side > 0 ? Math.PI : 0))) * 0.03;
      if (P.reach > 0.01) { const r = P.reach; F.lerp(_v3.set(anc.x * 0.9, anc.y + 0.1 + Math.sin(this.time * 10 + side) * 0.03, anc.z + 0.12), r); }
      if (P.raise > 0.01 && side > 0) {
        const swipe = this.poseName === 'swipe';
        const tgt = swipe ? _v3.set(anc.x, anc.y + 0.05 + Math.sin(this.time * 9) * 0.04, anc.z + 0.14) : this._mouthPoint(_v3);
        F.lerp(tgt, P.raise);
      }
    } else {
      F.set(anc.x * 0.92, ground + gy, anc.z + 0.03 + gz + tuck * 0.08);
    }
    if (P.spread > 0.01) F.lerp(_v3.set(anc.x, anc.y - 0.12, anc.z + (front ? 0.14 : -0.15)), P.spread);
    if (P.dangle > 0.01) F.lerp(_v3.set(anc.x, anc.y - (front ? 0.2 : 0.24), anc.z + (front ? 0.02 : -0.03)), P.dangle);
    if (fold && !front) F.x = anc.x * 1.6;

    const pole = _v4;
    if (front) {
      // Wrist sits just behind/above the paw; the elbow points backward
      const pastA = 0.25 + tuck * 1.05 - P.reach * 0.3;
      const W = _v1.set(F.x, F.y + SK.pastern * Math.cos(pastA), F.z - SK.pastern * Math.sin(pastA));
      const Wc = new T.Vector3().copy(W);
      pole.set(0, -0.2, -1);
      const elbow = new T.Vector3(), wrist = new T.Vector3();
      solveIK(anc, Wc, SK.upperArm, SK.forearm, pole, elbow, wrist);
      this._seg(L.segs[0], anc, elbow);
      this._seg(L.segs[1], elbow, wrist);
      const pawPos = _v3.copy(F); pawPos.sub(wrist).setLength(SK.pastern).add(wrist);
      this._seg(L.segs[2], wrist, pawPos);
      L.joints[0].position.copy(elbow);
      this._placePaw(L.paw, pawPos, tuck * 0.5 + P.reach * 1.2 - P.dangle * 0.9);
    } else {
      // Metatarsal (foot from heel to toes): upright when standing, flat on the ground when sitting or lying
      const metaA = 0.33 + P.rTuck * 1.2 - P.spread * 0.9 - P.dangle * 0.3;
      const H = new T.Vector3(F.x, F.y + SK.meta * Math.cos(metaA), F.z - SK.meta * Math.sin(metaA));
      pole.set(0, 0.3, 1);
      const knee = new T.Vector3(), hock = new T.Vector3();
      solveIK(anc, H, SK.thigh, SK.shin, pole, knee, hock);
      this._seg(L.segs[0], anc, knee);
      this._seg(L.segs[1], knee, hock);
      const pawPos = _v3.copy(F).sub(hock).setLength(SK.meta).add(hock);
      this._seg(L.segs[2], hock, pawPos);
      L.joints[0].position.copy(knee);
      L.joints[1].position.copy(hock);
      this._placePaw(L.paw, pawPos, P.rTuck * 0.2 - P.dangle * 0.9);
    }
  }
  _seg(mesh, a, b) {
    mesh.position.copy(a);
    if (mesh.userData.flat) mesh.scale.set(mesh.userData.flat, 1, 1.12);
    const d = _v2.subVectors(b, a);
    const len = d.length();
    if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
  }
  _placePaw(paw, p, tilt) {
    paw.position.copy(p);
    paw.rotation.set(-Math.max(-1.2, Math.min(1.2, tilt)) * 0.6, 0, 0);
  }
  _mouthPoint(out) {
    // Where the mouth is, in the root frame (for paw licking)
    this.head.updateMatrixWorld(true);
    out.set(0, 0.0, 0.12);
    this.head.localToWorld(out);
    this.root.worldToLocal(out);
    out.y -= 0.01;
    return out;
  }

  headWorld(v = new T.Vector3()) { return this.head.getWorldPosition(v).add(new T.Vector3(0, 0.12 * this.group.scale.y, 0)); }
  /* Classify a ray hit on the cat into a petting zone */
  zoneFor(hit) {
    const obj = hit.object;
    const z = obj.userData.zone || 'body';
    if (z === 'head' || z === 'cheek') {
      const lp = this.head.worldToLocal(hit.point.clone());
      if (lp.y < 0.03 && lp.z > 0.09) return 'chin';
      if (Math.abs(lp.x) > 0.06 && lp.y < 0.07) return 'cheek';
      return 'head';
    }
    if (z === 'chin') return 'chin';
    if (z === 'chest') { const lp = obj.worldToLocal(hit.point.clone()); return lp.y < 0 ? 'chin' : 'back'; }
    if (z === 'body') {
      const lp = this.torso.worldToLocal(hit.point.clone());
      if (lp.y < -0.042) return 'belly';
      if (lp.z < -0.04) return 'rump';
      return 'back';
    }
    if (z === 'rump') return 'rump';
    if (z === 'tail') {
      // The first stretch of the tail counts as "base of the tail" (the rump zone)
      const root = this.tail[0].g.getWorldPosition(new T.Vector3());
      if (hit.point.distanceTo(root) < 0.075 * this.group.scale.x) return 'rump';
      return 'tail';
    }
    if (z === 'leg' || z === 'paws') return 'paws';
    return z;
  }
}
VPC.CatModel = CatModel;
})();
