/* Whisker Room: 3D world (room, furniture, lighting, day cycle, toys and physics) */
(function () {
'use strict';
const WR = window.WR = window.WR || {};
const T = THREE;

const ROOM = { minX: -3, maxX: 3, minZ: -2.5, maxZ: 2.5, wallH: 2.8 };
// Walkable floor bounds for the cat (meters)
const BOUNDS = { minX: -2.82, maxX: 2.82, minZ: -2.32, maxZ: 2.32 };
// Furniture footprints the cat and toys can't pass through (floor level)
const BLOCKERS = [
  { id: 'sofa',   x0: 0.05, x1: 2.55, z0: -2.5, z1: -1.52 },
  { id: 'tree',   x0: -2.72, x1: -1.98, z0: 1.26, z1: 1.94 },
  { id: 'litter', x0: 2.12, x1: 2.8, z0: 1.68, z1: 2.26 },
  { id: 'box',    x0: 2.1, x1: 2.72, z0: 0.24, z1: 0.76 },
  { id: 'plant',  x0: 2.45, x1: 2.95, z0: -0.85, z1: -0.35 },
  { id: 'lamp',   x0: -2.85, x1: -2.35, z0: -2.36, z1: -1.86 },
  { id: 'bowls',  x0: -2.82, x1: -2.46, z0: -0.48, z1: 0.42 },
];

/* Places the cat can go. `pos` is where it sits; `approach` is the floor point it jumps from;
   `parent` is another spot it must be on first. */
const SPOTS = {
  bed:    { pos: [-2.15, 0.075, -1.45], approach: [-1.62, -1.2], label: 'bed', comfort: 1.0 },
  sofa:   { pos: [1.15, 0.45, -1.98], approach: [1.15, -1.22], label: 'sofa', comfort: 0.8 },
  shelf:  { pos: [1.62, 1.57, -2.39], parent: 'sofa', label: 'shelf', comfort: 0 },
  sill:   { pos: [-0.8, 0.98, -2.33], approach: [-0.8, -1.75], label: 'windowsill', comfort: 0.6 },
  treeLow:{ pos: [-2.05, 0.625, 1.6], approach: [-1.55, 1.6], label: 'cat tree', comfort: 0.5 },
  treeTop:{ pos: [-2.35, 1.175, 1.6], parent: 'treeLow', label: 'top of the cat tree', comfort: 0.75 },
  box:    { pos: [2.41, 0.03, 0.5], approach: [1.85, 0.5], label: 'cardboard box', comfort: 0.9 },
  litter: { pos: [2.46, 0.12, 1.97], approach: [1.86, 1.97], label: 'litter box', comfort: 0 },
};
// Floor-level points of interest
const POINTS = {
  food:  { x: -2.27, z: -0.28, face: -Math.PI / 2 },
  water: { x: -2.27, z: 0.24, face: -Math.PI / 2 },
  post:  { x: -2.35, z: 1.2, face: 0 },             // scratch the cat tree post (facing +z)
  sofaArm: { x: -0.22, z: -1.95, face: Math.PI / 2 }, // scratch the sofa arm (facing +x)
};
const WINDOW = { x0: -1.5, x1: -0.1, y0: 0.95, y1: 2.05, z: -2.5 };

WR.ROOM = ROOM; WR.BOUNDS = BOUNDS; WR.BLOCKERS = BLOCKERS; WR.SPOTS = SPOTS; WR.POINTS = POINTS;

/* ---------- helpers ---------- */
function mat(color, o = {}) { return new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, o)); }
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function lerpColor(stops, h) {
  // stops: [[hour, '#hex'], ...] sorted, wraps at 24
  for (let i = 0; i < stops.length - 1; i++) {
    const [h0, c0] = stops[i], [h1, c1] = stops[i + 1];
    if (h >= h0 && h <= h1) return new T.Color(c0).lerp(new T.Color(c1), (h - h0) / (h1 - h0 || 1));
  }
  return new T.Color(stops[0][1]);
}

class World {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    this.scene = new T.Scene();
    this.scene.background = new T.Color(0xd8c8b2);
    this.camera = new T.PerspectiveCamera(42, 1, 0.05, 80);
    this.orbit = { target: new T.Vector3(0, 0.35, 0.1), theta: 0.62, phi: 1.02, r: 6.6, goalTarget: new T.Vector3(0, 0.35, 0.1) };

    this.interactables = [];   // meshes with userData.ia
    this.surfaces = [];        // meshes the laser can hit
    this.toys = [];
    this.treats = [];
    this.messMeshes = new Map();
    this.fallers = [];
    this.raycaster = new T.Raycaster();

    this._buildLights();
    this._buildOutside();
    this._buildRoom();
    this._buildFurniture();
    this._buildToys();
    this.resize();
  }

  /* ---------- construction ---------- */
  _add(geom, material, x, y, z, parent, opts = {}) {
    const m = new T.Mesh(geom, material);
    m.position.set(x, y, z);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = opts.receive !== false;
    (parent || this.scene).add(m);
    if (opts.surface !== false) this.surfaces.push(m);
    return m;
  }
  _box(w, h, d, material, x, y, z, parent, opts) { return this._add(new T.BoxGeometry(w, h, d), material, x, y, z, parent, opts); }
  _interact(objs, info) {
    for (const o of [].concat(objs)) o.traverse(m => { if (m.isMesh) { m.userData.ia = info; this.interactables.push(m); } });
  }

  _buildLights() {
    const s = this.scene;
    this.hemi = new T.HemisphereLight(0xdfeeff, 0x7a5a3c, 0.9);
    s.add(this.hemi);
    this.ambient = new T.AmbientLight(0xffffff, 0.12);
    s.add(this.ambient);
    const sun = this.sun = new T.DirectionalLight(0xfff2d6, 2.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 30;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.target.position.set(-0.6, 0, -0.8);
    s.add(sun); s.add(sun.target);
    // Fill light from the "camera side" so the interior is never flat black
    this.fill = new T.DirectionalLight(0xffe9d0, 0.35);
    this.fill.position.set(4, 5, 6);
    s.add(this.fill);
  }

  _buildOutside() {
    const s = this.scene;
    this.skyMat = new T.MeshBasicMaterial({ color: 0x86c5ef, fog: false });
    const sky = new T.Mesh(new T.PlaneGeometry(12, 14), this.skyMat);
    sky.position.set(-2.5, 3, -9);
    s.add(sky);
    const grassMat = new T.MeshLambertMaterial({ color: 0x6d9f58 });
    const grass = new T.Mesh(new T.PlaneGeometry(11, 6.3), grassMat);
    grass.rotation.x = -Math.PI / 2; grass.position.set(-2.6, -0.4, -5.8);
    s.add(grass);
    const treeMat = new T.MeshLambertMaterial({ color: 0x3f7a45 });
    this.treeMat = treeMat; this.grassMat = grassMat;
    for (const [x, z, h] of [[-4.2, -8.6, 1.6], [-2.4, -8.8, 2.1], [0.4, -8.7, 1.4], [-1.2, -8.4, 1.2]]) {
      const t = new T.Mesh(new T.ConeGeometry(h * 0.3, h, 8), treeMat);
      t.position.set(x, h / 2 - 0.4, z); s.add(t);
    }
    this.sunDisc = new T.Mesh(new T.SphereGeometry(0.5, 16, 12), new T.MeshBasicMaterial({ color: 0xfff1b5, fog: false }));
    this.moonDisc = new T.Mesh(new T.SphereGeometry(0.3, 16, 12), new T.MeshBasicMaterial({ color: 0xe8ecff, fog: false }));
    s.add(this.sunDisc); s.add(this.moonDisc);
    // Outer ledge + bird
    this._box(1.5, 0.05, 0.25, mat(0xdedede), -0.8, 0.93, -2.72, null, { surface: false });
    const bird = this.bird = new T.Group();
    const bm = mat(0x5b84c4);
    const body = new T.Mesh(new T.SphereGeometry(0.05, 12, 10), bm); body.scale.set(1, 0.9, 1.3); bird.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.032, 10, 8), bm); head.position.set(0, 0.05, 0.04); bird.add(head);
    const belly = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), mat(0xe9a25c)); belly.position.set(0, -0.005, 0.02); bird.add(belly);
    const beak = new T.Mesh(new T.ConeGeometry(0.01, 0.03, 6), mat(0xf2b134)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.05, 0.08); bird.add(beak);
    bird.position.set(-0.6, 0.99, -2.72);
    bird.rotation.y = 0.3;
    bird.visible = false;
    s.add(bird);
  }

  _buildRoom() {
    const s = this.scene;
    // Floor with planks
    const floorTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#c8975f'; g.fillRect(0, 0, w, h);
      const rows = 8;
      for (let i = 0; i < rows; i++) {
        const y = i * h / rows;
        const shade = 0.9 + ((i * 37) % 7) / 40;
        g.fillStyle = `rgba(${Math.round(190 * shade)},${Math.round(140 * shade)},${Math.round(88 * shade)},1)`;
        g.fillRect(0, y, w, h / rows);
        g.fillStyle = 'rgba(80,50,25,.35)'; g.fillRect(0, y, w, 2);
        const off = (i * 173) % w;
        g.fillRect(off, y, 2, h / rows);
        g.fillRect((off + w / 2) % w, y, 2, h / rows);
        g.strokeStyle = 'rgba(110,70,35,.12)';
        for (let k = 0; k < 6; k++) { g.beginPath(); const yy = y + 6 + k * (h / rows - 8) / 6; g.moveTo(0, yy); g.bezierCurveTo(w * .3, yy + 3, w * .6, yy - 3, w, yy); g.stroke(); }
      }
    }, [3, 2.5]);
    const floor = this.floor = this._add(new T.PlaneGeometry(6, 5), mat(0xffffff, { map: floorTex, roughness: 0.7 }), 0, 0, 0, null, { cast: false });
    floor.rotation.x = -Math.PI / 2;
    floor.userData.floor = true;

    // Rug
    const rugTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#d98f6f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) { g.strokeStyle = i % 2 ? '#f3d2b8' : '#b8644a'; g.lineWidth = 7; g.beginPath(); g.arc(w / 2, h / 2, 118 - i * 18, 0, Math.PI * 2); g.stroke(); }
    });
    const rug = this._add(new T.CylinderGeometry(1.1, 1.1, 0.012, 48), mat(0xffffff, { map: rugTex, roughness: 1 }), 0.25, 0.006, 0.35, null, { cast: false });
    rug.scale.z = 0.72;
    rug.userData.floor = true;

    // Walls
    const wallTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#efe0c9'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(214,190,160,.35)';
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 14, h);
    }, [4, 2]);
    const wallMat = mat(0xffffff, { map: wallTex, roughness: 0.95 });
    const H = ROOM.wallH, wz = -2.55, W = WINDOW;
    // Back wall (with window hole)
    this._box(W.x0 + 3, H, 0.1, wallMat, (-3 + W.x0) / 2, H / 2, wz);
    this._box(3.1 - W.x1 - 0.1 + 0.1, H, 0.1, wallMat, (W.x1 + 3.1) / 2, H / 2, wz);
    this._box(W.x1 - W.x0, W.y0, 0.1, wallMat, (W.x0 + W.x1) / 2, W.y0 / 2, wz);
    this._box(W.x1 - W.x0, H - W.y1, 0.1, wallMat, (W.x0 + W.x1) / 2, (H + W.y1) / 2, wz);
    // Left wall
    this._box(0.1, H, 5.2, wallMat, -3.05, H / 2, -0.0);
    // Baseboards
    const bb = mat(0xf7f2ea);
    this._box(6.1, 0.1, 0.03, bb, 0, 0.05, -2.49);
    this._box(0.03, 0.1, 5, bb, -2.99, 0.05, 0);
    // Invisible shadow blockers (ceiling + open sides) so sunlight only enters through the window
    const blocker = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const ceil = this._box(6.4, 0.05, 5.4, blocker, 0, H, -0.1, null, { receive: false, surface: false });
    ceil.renderOrder = -1;
    this._box(0.05, H, 5.4, blocker, 3.1, H / 2, 0, null, { receive: false, surface: false });

    // Window frame, glass and sill
    const frame = mat(0xffffff, { roughness: 0.5 });
    const fz = -2.5;
    this._box(W.x1 - W.x0 + 0.12, 0.07, 0.14, frame, (W.x0 + W.x1) / 2, W.y1 + 0.02, fz);
    this._box(0.07, W.y1 - W.y0, 0.14, frame, W.x0 - 0.02, (W.y0 + W.y1) / 2, fz);
    this._box(0.07, W.y1 - W.y0, 0.14, frame, W.x1 + 0.02, (W.y0 + W.y1) / 2, fz);
    this._box(0.05, W.y1 - W.y0, 0.08, frame, (W.x0 + W.x1) / 2, (W.y0 + W.y1) / 2, fz);
    this._box(W.x1 - W.x0, 0.04, 0.08, frame, (W.x0 + W.x1) / 2, 1.55, fz);
    const glass = this._add(new T.PlaneGeometry(W.x1 - W.x0, W.y1 - W.y0), new T.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.12, roughness: 0.05 }), (W.x0 + W.x1) / 2, (W.y0 + W.y1) / 2, fz - 0.01, null, { cast: false, surface: false });
    glass.renderOrder = 2;
    const sill = this._box(1.62, 0.06, 0.34, frame, -0.8, 0.95, -2.36);
    this._interact(sill, { id: 'window', label: () => this.bird.visible ? 'A bird is visiting the window!' : 'Windowsill: a favourite lookout' });

    // Picture frame on the left wall
    const art = canvasTex(128, 160, (g, w, h) => {
      g.fillStyle = '#fbf3e6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e0794a'; g.beginPath(); g.ellipse(64, 95, 30, 22, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(64, 62, 20, 18, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(48, 52); g.lineTo(50, 34); g.lineTo(60, 46); g.fill();
      g.beginPath(); g.moveTo(80, 52); g.lineTo(78, 34); g.lineTo(68, 46); g.fill();
    });
    const pic = this._box(0.04, 0.62, 0.5, mat(0x8b6a48), -2.98, 1.65, -0.2);
    const picFace = this._add(new T.PlaneGeometry(0.42, 0.54), mat(0xffffff, { map: art }), -2.955, 1.65, -0.2, null, { cast: false });
    picFace.rotation.y = Math.PI / 2;
  }

  _buildFurniture() {
    const s = this.scene;
    /* Sofa */
    const sofaMat = mat(0x6f8fb3, { roughness: 1 }), cushMat = mat(0x86a5c6, { roughness: 1 });
    const sofa = new T.Group(); s.add(sofa);
    this._box(2.2, 0.32, 0.85, sofaMat, 1.3, 0.2, -2.0, sofa);
    this._box(1.0, 0.11, 0.66, cushMat, 0.78, 0.4, -1.92, sofa);
    this._box(1.0, 0.11, 0.66, cushMat, 1.82, 0.4, -1.92, sofa);
    this._box(2.2, 0.5, 0.2, sofaMat, 1.3, 0.65, -2.33, sofa);
    this._box(0.18, 0.62, 0.85, sofaMat, 0.12, 0.31, -2.0, sofa);
    this._box(0.18, 0.62, 0.85, sofaMat, 2.48, 0.31, -2.0, sofa);
    for (const x of [0.12, 2.48]) for (const z of [-2.35, -1.65]) this._box(0.06, 0.05, 0.06, mat(0x4a3a2c), x, 0.025, z, sofa);
    this.sofaScratch = this._add(new T.PlaneGeometry(0.5, 0.35), new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, map: canvasTex(128, 96, (g) => { g.strokeStyle = 'rgba(240,240,240,.9)'; g.lineWidth = 3; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(12 + i * 12, 10 + (i % 3) * 4); g.lineTo(6 + i * 12, 86 - (i % 2) * 8); g.stroke(); } }) }), 0.025, 0.36, -1.85, sofa, { cast: false, surface: false });
    this.sofaScratch.rotation.y = -Math.PI / 2;
    this._interact(sofa, { id: 'sofa', label: () => 'Sofa' });

    /* Shelf + vase */
    this._box(0.85, 0.04, 0.24, mat(0x9c7a58), 1.85, 1.55, -2.38);
    const vase = this.vase = new T.Group();
    const vmat = mat(0x3f8f8a, { roughness: 0.35 });
    const vbody = new T.Mesh(new T.LatheGeometry([[0.0, 0], [0.07, 0.0], [0.09, 0.08], [0.07, 0.17], [0.035, 0.22], [0.045, 0.26], [0.0, 0.26]].map(p => new T.Vector2(p[0], p[1])), 20), vmat);
    vbody.castShadow = true; vase.add(vbody);
    const flower = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), mat(0xf06292)); flower.position.y = 0.33; vase.add(flower);
    const stem = new T.Mesh(new T.CylinderGeometry(0.005, 0.005, 0.1), mat(0x4caf50)); stem.position.y = 0.28; vase.add(stem);
    vase.position.set(2.08, 1.57, -2.39);
    s.add(vase);
    this.vaseHome = vase.position.clone();

    /* Cat tree */
    const sisal = canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#d2b07a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a98450'; g.lineWidth = 2; for (let y = 0; y < h; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 2); g.stroke(); } }, [1, 3]);
    const carpet = mat(0xb9a8d6, { roughness: 1 });
    const tree = new T.Group(); s.add(tree);
    this._box(0.66, 0.06, 0.66, carpet, -2.35, 0.03, 1.6, tree);
    this._add(new T.CylinderGeometry(0.07, 0.07, 1.12, 16), mat(0xffffff, { map: sisal }), -2.35, 0.6, 1.6, tree);
    this._add(new T.CylinderGeometry(0.26, 0.26, 0.05, 28), carpet, -2.1, 0.6, 1.6, tree);
    this._add(new T.CylinderGeometry(0.27, 0.27, 0.05, 28), carpet, -2.35, 1.15, 1.6, tree);
    const dangle = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), mat(0xffc84a)); dangle.position.set(-2.1, 0.42, 1.78); s.add(dangle);
    const dstring = new T.Mesh(new T.CylinderGeometry(0.003, 0.003, 0.15), mat(0x444444)); dstring.position.set(-2.1, 0.5, 1.78); s.add(dstring);
    this.dangle = dangle;
    this._interact(tree, { id: 'tree', label: () => 'Cat tree: climbing and scratching' });

    /* Bed */
    const bed = new T.Group(); s.add(bed);
    const rim = new T.Mesh(new T.TorusGeometry(0.3, 0.085, 12, 32), mat(0x7f9bd0, { roughness: 1 }));
    rim.rotation.x = Math.PI / 2; rim.position.set(-2.15, 0.085, -1.45); rim.scale.set(1, 0.9, 1); rim.castShadow = rim.receiveShadow = true; bed.add(rim);
    const cush = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.07, 32), mat(0xc4d4f0, { roughness: 1 }));
    cush.position.set(-2.15, 0.035, -1.45); cush.receiveShadow = true; bed.add(cush);
    this.surfaces.push(rim, cush);
    this._interact(bed, { id: 'bed', label: () => 'Cat bed' });

    /* Lamp */
    const lamp = new T.Group(); s.add(lamp);
    this._add(new T.CylinderGeometry(0.16, 0.18, 0.04, 20), mat(0x333333), -2.6, 0.02, -2.1, lamp);
    this._add(new T.CylinderGeometry(0.015, 0.015, 1.5, 8), mat(0x333333), -2.6, 0.76, -2.1, lamp);
    this.shadeMat = mat(0xf5e6c8, { emissive: 0x000000, side: T.DoubleSide });
    this._add(new T.CylinderGeometry(0.14, 0.24, 0.28, 24, 1, true), this.shadeMat, -2.6, 1.6, -2.1, lamp, { cast: false });
    this.lampLight = new T.PointLight(0xffc98a, 0, 0, 2);
    this.lampLight.position.set(-2.6, 1.5, -2.1);
    s.add(this.lampLight);
    this._interact(lamp, { id: 'lamp', label: () => `Floor lamp (${this.lampOn ? 'on' : 'off'}): click to toggle` });

    /* Bowls */
    const mat1 = this._box(0.4, 0.008, 0.95, mat(0xe57373, { roughness: 1 }), -2.62, 0.004, -0.03, null, { cast: false });
    const mkBowl = (z, color) => {
      const g = new T.Group();
      const b = new T.Mesh(new T.CylinderGeometry(0.13, 0.1, 0.07, 24, 1, true), mat(color, { side: T.DoubleSide, roughness: 0.4 }));
      b.position.y = 0.035; b.castShadow = true; g.add(b);
      const bottom = new T.Mesh(new T.CircleGeometry(0.1, 24), mat(color)); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.006; g.add(bottom);
      g.position.set(-2.62, 0.008, z);
      s.add(g);
      return g;
    };
    this.foodBowl = mkBowl(-0.28, 0xd85b5b);
    this.waterBowl = mkBowl(0.24, 0x5b8fd8);
    const kib = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#9c6a38'; g.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? '#7a4f26' : '#b98450'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4, 0, 7); g.fill(); } });
    this.foodFill = new T.Mesh(new T.CylinderGeometry(0.115, 0.1, 0.01, 24), mat(0xffffff, { map: kib }));
    this.foodBowl.add(this.foodFill);
    this.wetMat = mat(0xc98b6b, { roughness: 0.4 });
    this.kibMat = this.foodFill.material;
    this.waterFill = new T.Mesh(new T.CylinderGeometry(0.118, 0.1, 0.01, 24), new T.MeshStandardMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.75, roughness: 0.05 }));
    this.waterBowl.add(this.waterFill);
    this._interact(this.foodBowl, { id: 'food', label: () => `Food bowl (${Math.round(this.foodLevel || 0)}%): click to add kibble` });
    this._interact(this.waterBowl, { id: 'water', label: () => `Water bowl (${Math.round(this.waterLevel || 0)}%): click to refill` });

    /* Litter box */
    const litter = new T.Group(); s.add(litter);
    const lm = mat(0x6fa58b, { roughness: 0.6 });
    this._box(0.62, 0.04, 0.48, lm, 2.46, 0.02, 1.97, litter);
    this._box(0.62, 0.17, 0.04, lm, 2.46, 0.085, 1.75, litter);
    this._box(0.62, 0.17, 0.04, lm, 2.46, 0.085, 2.19, litter);
    this._box(0.04, 0.17, 0.48, lm, 2.15, 0.085, 1.97, litter);
    this._box(0.04, 0.17, 0.48, lm, 2.77, 0.085, 1.97, litter);
    this._box(0.56, 0.08, 0.42, mat(0xe9dfc6, { roughness: 1 }), 2.46, 0.07, 1.97, litter, { cast: false });
    this.poopGroup = new T.Group(); litter.add(this.poopGroup);
    this._interact(litter, { id: 'litter', label: () => `Litter box (${this.poopCount || 0} to scoop): click to clean` });

    /* Cardboard box */
    const cb = mat(0xc89b62, { roughness: 1 });
    const box = new T.Group(); s.add(box);
    this._box(0.56, 0.02, 0.46, cb, 2.41, 0.01, 0.5, box);
    this._box(0.56, 0.3, 0.02, cb, 2.41, 0.15, 0.27, box);
    this._box(0.56, 0.3, 0.02, cb, 2.41, 0.15, 0.73, box);
    this._box(0.02, 0.3, 0.46, cb, 2.69, 0.15, 0.5, box);
    this._box(0.02, 0.18, 0.46, cb, 2.13, 0.09, 0.5, box);
    const flap = this._box(0.02, 0.2, 0.46, cb, 2.04, 0.26, 0.5, box); flap.rotation.z = 0.7;
    this._interact(box, { id: 'box', label: () => 'Cardboard box: the best toy money can buy' });

    /* Plant */
    const pot = this._add(new T.CylinderGeometry(0.16, 0.12, 0.3, 18), mat(0xc4683f), 2.7, 0.15, -0.6);
    const lmat = mat(0x4d9a52, { roughness: 0.8 });
    for (let i = 0; i < 9; i++) {
      const leaf = this._add(new T.SphereGeometry(0.12, 8, 6), lmat, 2.7 + Math.cos(i * 0.7) * 0.12 * (i % 3), 0.42 + i * 0.07, -0.6 + Math.sin(i * 0.7) * 0.12 * (i % 3));
      leaf.scale.set(0.28, 1.1, 0.28); leaf.rotation.z = Math.cos(i * 1.7) * 0.6; leaf.rotation.x = Math.sin(i * 1.3) * 0.6;
    }
    this._interact(pot, { id: 'plant', label: () => 'A cat-safe spider plant' });
  }

  _buildToys() {
    const yarnTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#e04f5f'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff8a95'; g.lineWidth = 2; for (let i = -10; i < 30; i++) { g.beginPath(); g.moveTo(i * 8, 0); g.lineTo(i * 8 + 30, h); g.stroke(); } });
    const yarn = new T.Mesh(new T.SphereGeometry(0.075, 18, 14), mat(0xffffff, { map: yarnTex, roughness: 1 }));
    this.addToy('yarn', 'Ball of yarn', yarn, 0.075, [0.6, 0.3], { roll: true, restitution: 0.35, friction: 1.6 });
    const mouse = new T.Group();
    const mb = new T.Mesh(new T.SphereGeometry(0.05, 14, 10), mat(0x9e9e9e, { roughness: 1 })); mb.scale.set(0.8, 0.7, 1.4); mouse.add(mb);
    const me1 = new T.Mesh(new T.SphereGeometry(0.02, 8, 6), mat(0xf4a6b4)); me1.position.set(0.025, 0.035, 0.035); mouse.add(me1);
    const me2 = me1.clone(); me2.position.x = -0.025; mouse.add(me2);
    const tail = new T.Mesh(new T.CylinderGeometry(0.004, 0.003, 0.12), mat(0xf4a6b4)); tail.rotation.x = Math.PI / 2 + 0.3; tail.position.set(0, 0.0, -0.11); mouse.add(tail);
    this.addToy('mouse', 'Toy mouse', mouse, 0.04, [-0.7, 0.9], { roll: false, restitution: 0.25, friction: 3.2 });
    const ball = new T.Mesh(new T.SphereGeometry(0.045, 16, 12), mat(0x4fc3f7, { roughness: 0.3 }));
    this.addToy('ball', 'Jingle ball', ball, 0.045, [1.2, 1.4], { roll: true, restitution: 0.55, friction: 1.0 });
  }
  addToy(id, label, mesh, radius, xz, o) {
    mesh.traverse(m => { if (m.isMesh) { m.castShadow = true; } });
    this.scene.add(mesh);
    const toy = { id, label, mesh, radius, pos: new T.Vector3(xz[0], radius, xz[1]), vel: new T.Vector3(), held: false, carriedBy: null, ...o };
    mesh.position.copy(toy.pos);
    this.toys.push(toy);
    this._interact(mesh, { id: 'toy', toy, label: () => `${label}: drag and flick to throw` });
    return toy;
  }

  /* ---------- state sync ---------- */
  setFood(amount, wet) {
    this.foodLevel = amount;
    this.foodFill.visible = amount > 0.5;
    this.foodFill.material = wet ? this.wetMat : this.kibMat;
    this.foodFill.position.y = 0.012 + (amount / 100) * 0.045;
    const s = 0.8 + 0.2 * amount / 100; this.foodFill.scale.set(s, 1, s);
  }
  setWater(level) {
    this.waterLevel = level;
    this.waterFill.visible = level > 0.5;
    this.waterFill.position.y = 0.012 + (level / 100) * 0.048;
    const s = 0.82 + 0.18 * level / 100; this.waterFill.scale.set(s, 1, s);
  }
  setPoops(n) {
    if (this.poopCount === n) return;
    this.poopCount = n;
    const g = this.poopGroup;
    while (g.children.length) g.remove(g.children[0]);
    const pm = mat(0x6b4a2b, { roughness: 0.9 });
    for (let i = 0; i < Math.min(n, 6); i++) {
      const p = new T.Mesh(new T.CapsuleGeometry(0.018, 0.04, 4, 8), pm);
      p.position.set(2.32 + (i % 3) * 0.12, 0.12, 1.86 + Math.floor(i / 3) * 0.18 + (i % 2) * 0.04);
      p.rotation.set(Math.PI / 2, 0, i * 1.3);
      g.add(p);
    }
  }
  setLamp(on) {
    this.lampOn = on;
    this.lampLight.intensity = on ? 5.5 : 0;
    this.shadeMat.emissive.set(on ? 0xffb35c : 0x000000);
    this.shadeMat.emissiveIntensity = on ? 0.9 : 0;
  }
  setSofaScratches(n) { this.sofaScratch.material.opacity = Math.min(0.85, n * 0.12); }
  setVase(broken) {
    if (broken) { this.vase.visible = false; return; }
    this.vase.visible = true; this.vase.position.copy(this.vaseHome); this.vase.rotation.set(0, 0, 0);
  }
  knockVase(vx, vz, onLand) {
    const v = this.vase;
    this.fallers.push({ obj: v, vel: new T.Vector3(vx, 0.6, vz), spin: new T.Vector3(3, 0, 4), onLand });
  }
  syncMesses(messes) {
    const keep = new Set();
    for (const m of messes) {
      keep.add(m.id);
      if (this.messMeshes.has(m.id)) continue;
      const g = this._messMesh(m);
      g.position.set(m.x, 0, m.z);
      this.scene.add(g);
      this._interact(g, { id: 'mess', mess: m, label: () => ({ hairball: 'Hairball: click to clean up', puddle: 'Accident: click to clean up', shards: 'Broken vase: click to sweep up and glue back together' }[m.type] || 'Mess') });
      this.messMeshes.set(m.id, g);
    }
    for (const [id, g] of this.messMeshes) if (!keep.has(id)) {
      this.scene.remove(g);
      g.traverse(o => { const i = this.interactables.indexOf(o); if (i >= 0) this.interactables.splice(i, 1); });
      this.messMeshes.delete(id);
    }
  }
  _messMesh(m) {
    const g = new T.Group();
    if (m.type === 'hairball') {
      const h = new T.Mesh(new T.SphereGeometry(0.04, 10, 8), mat(0x7a5a40, { roughness: 1 })); h.scale.set(1.4, 0.6, 1); h.position.y = 0.02; h.castShadow = true; g.add(h);
    } else if (m.type === 'puddle') {
      const p = new T.Mesh(new T.CircleGeometry(0.16, 20), new T.MeshStandardMaterial({ color: 0xf2d77a, transparent: true, opacity: 0.6, roughness: 0.05 }));
      p.rotation.x = -Math.PI / 2; p.position.y = 0.004; p.scale.set(1, 0.7, 1); g.add(p);
    } else if (m.type === 'shards') {
      const sm = mat(0x3f8f8a, { roughness: 0.35 });
      for (let i = 0; i < 7; i++) {
        const sh = new T.Mesh(new T.TetrahedronGeometry(0.035 + (i % 3) * 0.01), sm);
        sh.position.set(Math.cos(i * 2.1) * 0.14 * (1 + i % 2), 0.015, Math.sin(i * 2.1) * 0.1 * (1 + i % 2));
        sh.rotation.set(i, i * 2, i * 3); sh.castShadow = true; g.add(sh);
      }
      const fl = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), mat(0xf06292)); fl.position.set(0.1, 0.03, 0.06); g.add(fl);
    }
    return g;
  }
  spawnTreat(x, z) {
    const m = new T.Mesh(new T.DodecahedronGeometry(0.025), mat(0xb5793b));
    m.castShadow = true;
    m.position.set(x, 0.9, z);
    this.scene.add(m);
    const t = { mesh: m, pos: m.position, vel: new T.Vector3(0, 0, 0), landed: false };
    this.treats.push(t);
    return t;
  }
  removeTreat(t) { this.scene.remove(t.mesh); this.treats.splice(this.treats.indexOf(t), 1); }

  /* ---------- day cycle ---------- */
  // hour: 0..24 (fractional)
  setTime(hour) {
    this.hour = hour;
    const dayAngle = ((hour - 6) / 12) * Math.PI; // 0 at 6am, PI at 6pm
    const sunUp = Math.sin(dayAngle);
    const elev = Math.max(0.05, sunUp) * 0.95;
    const az = Math.cos(dayAngle) * 0.9; // morning: from the left (-x)
    const dir = this.sunDir = new T.Vector3(-az * 0.8, Math.sin(elev) * 1.0, -Math.cos(elev) * 1.0).normalize();
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 14);
    const dayK = T.MathUtils.clamp(sunUp * 3, 0, 1);
    const warm = 1 - T.MathUtils.clamp(sunUp * 2.2, 0, 1);
    this.sun.color.setRGB(1, 0.93 - warm * 0.25, 0.82 - warm * 0.45);
    this.sun.intensity = 3.2 * dayK;
    this.daylight = dayK;
    const sky = lerpColor([[0, '#0a0f24'], [4.5, '#141c44'], [5.8, '#f0a072'], [7, '#9ccbe8'], [12, '#78c0ee'], [17, '#8fc1e0'], [18.4, '#f08a5d'], [19.4, '#2e3366'], [21, '#0f1430'], [24, '#0a0f24']], hour);
    this.skyMat.color.copy(sky);
    this.scene.background.copy(new T.Color(0x2a2522).lerp(new T.Color(0xd8c8b2), dayK));
    this.treeMat.color.copy(new T.Color(0x1d2b25).lerp(new T.Color(0x3f7a45), dayK));
    this.grassMat.color.copy(new T.Color(0x22301f).lerp(new T.Color(0x6d9f58), dayK));
    this.hemi.intensity = 0.28 + 0.75 * dayK;
    this.hemi.color.copy(new T.Color(0x9fb0e0).lerp(new T.Color(0xeef4ff), dayK));
    this.fill.intensity = 0.15 + 0.3 * dayK;
    this.renderer.toneMappingExposure = 0.95 + 0.15 * dayK;
    const winC = new T.Vector3(-0.8, 1.5, -2.6);
    this.sunDisc.position.copy(winC).addScaledVector(dir, 9);
    this.sunDisc.visible = sunUp > -0.05;
    this.moonDisc.position.copy(winC).add(new T.Vector3(az * 4, Math.max(0.4, -sunUp) * 4, -7));
    this.moonDisc.visible = sunUp < 0.1;
  }
  // Where the sunbeam from the window lands on the floor (or null)
  sunbeam() {
    if (!this.sunDir || this.daylight < 0.35) return null;
    const d = this.sunDir;
    if (d.y < 0.12) return null;
    const t = 1.45 / d.y;
    const x = -0.8 - d.x * t, z = -2.5 - d.z * t;
    if (x < BOUNDS.minX + 0.2 || x > BOUNDS.maxX - 0.2 || z > BOUNDS.maxZ - 0.2 || z < -2.2) return null;
    for (const b of BLOCKERS) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return null;
    return { x, z };
  }

  /* ---------- physics ---------- */
  update(dt) {
    for (const toy of this.toys) {
      if (toy.held || toy.carriedBy) continue;
      this._physics(toy.pos, toy.vel, toy.radius, dt, toy.restitution, toy.friction);
      toy.mesh.position.copy(toy.pos);
      const sp = Math.hypot(toy.vel.x, toy.vel.z);
      if (sp > 0.01) {
        if (toy.roll) { toy.mesh.rotation.x += (toy.vel.z / toy.radius) * dt; toy.mesh.rotation.z -= (toy.vel.x / toy.radius) * dt; }
        else toy.mesh.rotation.y = Math.atan2(toy.vel.x, toy.vel.z);
      }
    }
    for (const t of this.treats) {
      if (t.landed) continue;
      this._physics(t.pos, t.vel, 0.02, dt, 0.2, 4);
      if (t.pos.y <= 0.021 && Math.abs(t.vel.y) < 0.05) t.landed = true;
    }
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.vel.y -= 9.8 * dt;
      f.obj.position.addScaledVector(f.vel, dt);
      f.obj.rotation.x += f.spin.x * dt; f.obj.rotation.z += f.spin.z * dt;
      if (f.obj.position.y <= 0.05) { this.fallers.splice(i, 1); f.onLand && f.onLand(f.obj.position.x, f.obj.position.z); }
    }
    // Bird bobbing
    if (this.bird.visible) {
      const t = performance.now() / 1000;
      this.bird.position.y = 0.99 + Math.max(0, Math.sin(t * 7)) * 0.02;
      this.bird.rotation.y = 0.3 + Math.sin(t * 1.3) * 0.6;
    }
    if (this.dangle) { const t = performance.now() / 1000; this.dangle.position.x = -2.1 + Math.sin(t * 1.7) * 0.012; }
  }
  _physics(p, v, r, dt, rest, fric) {
    v.y -= 9.8 * dt;
    p.addScaledVector(v, dt);
    if (p.y < r) { p.y = r; if (v.y < 0) v.y = -v.y * rest; if (Math.abs(v.y) < 0.25) v.y = 0; const k = Math.exp(-fric * dt); v.x *= k; v.z *= k; }
    if (p.x < BOUNDS.minX + 0.1) { p.x = BOUNDS.minX + 0.1; v.x = Math.abs(v.x) * rest; }
    if (p.x > BOUNDS.maxX) { p.x = BOUNDS.maxX; v.x = -Math.abs(v.x) * rest; }
    if (p.z < BOUNDS.minZ) { p.z = BOUNDS.minZ; v.z = Math.abs(v.z) * rest; }
    if (p.z > BOUNDS.maxZ) { p.z = BOUNDS.maxZ; v.z = -Math.abs(v.z) * rest; }
    if (p.y < 0.6) for (const b of BLOCKERS) {
      if (p.x > b.x0 - r && p.x < b.x1 + r && p.z > b.z0 - r && p.z < b.z1 + r) {
        const dl = p.x - (b.x0 - r), dr = (b.x1 + r) - p.x, dn = p.z - (b.z0 - r), df = (b.z1 + r) - p.z;
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) { p.x = b.x0 - r; v.x = -Math.abs(v.x) * rest; }
        else if (m === dr) { p.x = b.x1 + r; v.x = Math.abs(v.x) * rest; }
        else if (m === dn) { p.z = b.z0 - r; v.z = -Math.abs(v.z) * rest; }
        else { p.z = b.z1 + r; v.z = Math.abs(v.z) * rest; }
      }
    }
    if (Math.abs(v.x) < 0.005) v.x = 0; if (Math.abs(v.z) < 0.005) v.z = 0;
  }

  /* ---------- camera ---------- */
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Pull back a bit on tall/narrow screens so the room fits
    this.fitBoost = w / h < 0.8 ? 1.55 : w / h < 1.2 ? 1.2 : 1;
    this.camera.updateProjectionMatrix();
  }
  updateCamera(dt) {
    const o = this.orbit;
    o.target.lerp(o.goalTarget, 1 - Math.exp(-4 * dt));
    const r = o.r * this.fitBoost;
    this.camera.position.set(
      o.target.x + r * Math.sin(o.phi) * Math.sin(o.theta),
      o.target.y + r * Math.cos(o.phi),
      o.target.z + r * Math.sin(o.phi) * Math.cos(o.theta));
    this.camera.lookAt(o.target);
  }
  rotate(dx, dy) {
    const o = this.orbit;
    o.theta = T.MathUtils.clamp(o.theta - dx * 0.006, -0.2, 1.75);
    o.phi = T.MathUtils.clamp(o.phi - dy * 0.005, 0.35, 1.4);
  }
  zoom(f) { this.orbit.r = T.MathUtils.clamp(this.orbit.r * f, 1.4, 9); }

  /* ---------- raycasting ---------- */
  ray(ndcX, ndcY) { this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera); return this.raycaster; }
  floorPoint(ndcX, ndcY, y = 0) {
    const rc = this.ray(ndcX, ndcY);
    const plane = new T.Plane(new T.Vector3(0, 1, 0), -y);
    const p = new T.Vector3();
    return rc.ray.intersectPlane(plane, p) ? p : null;
  }
  render() { this.renderer.render(this.scene, this.camera); }
}

WR.World = World;
WR.mat = mat;
})();
