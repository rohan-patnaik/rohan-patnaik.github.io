// A humanoid built from primitives. Each turn starts assembled looking to one
// side, comes apart into an exploded view on the way across, and reassembles as
// it settles looking to the other side. script.js drives it inside the hero tile.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export const TURN = 5;  // seconds for one turn, matching the tile's switch interval

// Returns { count, turn(dir), stop() }, or null when WebGL isn't available.
export function mountRobot(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 2, 0.1, 50);
  scene.environment = studio(renderer);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1.6, 4.5, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 2.4, bottom: -0.4, near: 1, far: 10 });
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe4ff, 2.8);
  rim.position.set(-3, 2.2, -2.5);
  const rim2 = new THREE.DirectionalLight(0xffffff, 1.6);
  rim2.position.set(3, 1.5, -2);
  scene.add(rim2);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 0.35));

  // Floor: a shadow catcher plus a soft pool of light, tinted to the page ink.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const poolMat = new THREE.MeshBasicMaterial({ map: radial(), transparent: true, depthWrite: false, opacity: 0.09 });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.2), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.001;
  scene.add(pool);
  const tint = () => {
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#e8eae4';
    poolMat.color.set(ink);
  };
  tint();
  new MutationObserver(tint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', tint);

  const robot = new THREE.Group();
  scene.add(robot);
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  robot.add(head);
  const parts = build(robot, head);

  // Exploded positions: everything pushes away from the hips, wide more than tall,
  // with the white shells lifting off the dark frame beneath them.
  const centre = new THREE.Vector3(0, 1.0, 0);
  const rand = mulberry(7);
  const r = (s) => (rand() * 2 - 1) * s;
  for (const p of parts) {
    const world = p.home.clone();
    if (p.m.parent === head) world.add(head.position);
    const d = world.clone().sub(centre);
    const off = new THREE.Vector3(d.x * 0.85, d.y * (d.y > 0 ? 0.5 : 0.22), d.z * 1.4);
    if (Math.abs(d.x) > 0.04) off.x += Math.sign(d.x) * 0.05;
    if (p.kind === 'shell') { off.z += world.z >= 0 ? 0.1 : -0.08; off.x += Math.sign(d.x) * 0.025; }
    if (p.kind === 'metal') off.add(new THREE.Vector3(r(1), r(1), r(1)).normalize().multiplyScalar(0.04));
    off.add(new THREE.Vector3(r(0.02), r(0.02), r(0.03)));
    if (world.y + off.y < 0.012) off.y = 0.012 - world.y;
    p.off = off;
    p.spin = p.homeQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(r(0.25), r(0.25), r(0.25))));
    p.delay = 0.22 * rand() + 0.1 * (1 - Math.min(1, d.length() / 0.9));
  }

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(1.16 / t, 0.82 / (t * camera.aspect)) + 0.35;
    camera.position.set(0, 1.1, dist);
    camera.lookAt(0, 0.99, 0);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(() => { resize(); if (!raf) draw(last); }).observe(canvas);

  const SPAN = 0.55;  // how far it looks to each side, in radians
  const tmpQ = new THREE.Quaternion();
  const ease = (x) => x * x * (3 - 2 * x);
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const smooth = (a, b, x) => ease(clamp((x - a) / (b - a)));

  // dir 1 turns left to right, -1 right to left; u runs 0..1 across the turn.
  function pose(u, dir, sec) {
    const k = clamp((u - 0.1) / 0.72);
    const turn = 0.5 - 0.5 * Math.cos(Math.PI * k);
    return {
      yaw: -dir * SPAN + dir * 2 * SPAN * turn,
      head: dir * 0.32 * (smooth(0, 0.2, u) - smooth(0.55, 0.95, u)),
      apart: Math.sin(Math.PI * k),
      bob: Math.sin(sec * 1.7) * 0.003,
    };
  }

  let last = pose(0, 1, 0);
  function draw(s) {
    last = s;
    robot.rotation.y = s.yaw;
    robot.position.y = s.bob;
    head.rotation.y = s.head;
    for (const p of parts) {
      const e = ease(clamp(s.apart * 1.32 - p.delay));
      p.m.position.copy(p.home).addScaledVector(p.off, e);
      p.m.quaternion.copy(tmpQ.copy(p.homeQ).slerp(p.spin, e));
    }
    renderer.render(scene, camera);
  }

  // Render only while a turn is playing and the tile is on screen.
  let raf = 0, visible = true, playing = null;
  const tick = (now) => {
    raf = 0;
    if (!playing || !visible) return;
    const sec = (now - playing.t0) / 1000;
    draw(pose(Math.min(1, sec / TURN), playing.dir, sec));
    raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf && playing && visible) raf = requestAnimationFrame(tick); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(canvas);

  resize();
  draw(last);
  return {
    count: parts.length,
    turn(dir) { playing = { dir, t0: performance.now() }; draw(pose(0, dir, 0)); kick(); },
    stop() { playing = null; if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}

// --- Robot -----------------------------------------------------------------

// Grey armour plates over a dark structural frame, modelled on a modern
// humanoid: helmet with a black face visor, tapered torso, curved limb shells
// and exposed actuators at every joint.
function build(robot, head) {
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xa3a7ac, roughness: 0.36, metalness: 0.18, clearcoat: 0.55, clearcoatRoughness: 0.22, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x232528, roughness: 0.42, metalness: 0.55 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8d91, roughness: 0.28, metalness: 0.9 });
  const visor = new THREE.MeshPhysicalMaterial({ color: 0x040506, roughness: 0.05, clearcoat: 1, metalness: 0.2, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ color: 0xb7a6ff });
  const kinds = new Map([[shell, 'shell'], [dark, 'dark'], [metal, 'metal'], [visor, 'shell'], [glow, 'dark']]);

  const parts = [];
  const X = [0, 0, Math.PI / 2];   // cylinder axis along x
  const add = (geo, mat, pos, rot, scale, parent = robot) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...scale);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    parts.push({ m, home: m.position.clone(), homeQ: m.quaternion.clone(), kind: kinds.get(mat) });
  };
  const cyl = (r, h, seg = 28, r2 = r) => new THREE.CylinderGeometry(r, r2, h, seg);
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 20);
  const box = (w, h, d, r) => roundedBox(w, h, d, r ?? Math.min(w, h, d) * 0.3);
  // A smooth turned shape from a [radius, height] profile. `arc` keeps only part
  // of the turn (a plate), centred on angle `at` (0 faces forward, PI/2 faces +x).
  // The mesh is placed at its own centre so the exploded view pushes it the right way.
  const lathe = (prof, mat, x, z, { sz = 1, arc, at = 0 } = {}, parent) => {
    const pts = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r, y)))
      .getPoints(36).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
    const g = arc ? new THREE.LatheGeometry(pts, 40, at - arc / 2, arc) : new THREE.LatheGeometry(pts, 40);
    g.scale(1, 1, sz);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    add(g, mat, [x + c.x, c.y, z + c.z], null, null, parent);
  };

  // Head (group origin sits at the neck, y = 1.5)
  const helmet = [0.92, 1.12, 1];
  add(new THREE.SphereGeometry(0.104, 44, 32), shell, [0, 0.135, 0], null, helmet, head);
  add(new THREE.SphereGeometry(0.107, 44, 24, Math.PI / 2 - 1.05, 2.1, 0.95, 1.0), visor, [0, 0.135, 0.004], null, helmet, head);
  add(box(0.06, 0.005, 0.008, 0.0025), glow, [0, 0.148, 0.108], null, null, head);
  for (const s of [-1, 1]) {
    add(cyl(0.03, 0.026), dark, [s * 0.094, 0.13, -0.005], X, null, head);
    add(cyl(0.017, 0.01), metal, [s * 0.11, 0.13, -0.005], X, null, head);
  }
  add(box(0.08, 0.06, 0.04, 0.015), dark, [0, 0.11, -0.092], null, null, head);
  add(cyl(0.03, 0.06), dark, [0, 0.025, 0], null, null, head);
  add(cyl(0.038, 0.012), metal, [0, -0.005, 0], null, null, head);

  // Torso: dark core, curved chest and back plates, abdomen plate, pelvis
  lathe([[0, 1.05], [0.085, 1.07], [0.075, 1.15], [0.11, 1.25], [0.135, 1.36], [0.128, 1.46], [0.07, 1.5], [0, 1.51]], dark, 0, 0, { sz: 0.62 });
  lathe([[0.112, 1.22], [0.135, 1.3], [0.152, 1.38], [0.146, 1.45], [0.1, 1.495]], shell, 0, 0, { sz: 0.68, arc: 2.6 });
  lathe([[0.118, 1.26], [0.144, 1.34], [0.148, 1.42], [0.11, 1.48]], shell, 0, 0, { sz: 0.68, arc: 2.1, at: Math.PI });
  lathe([[0.088, 1.11], [0.084, 1.15], [0.1, 1.215]], shell, 0, 0, { sz: 0.74, arc: 2.0 });
  for (const y of [1.11, 1.145, 1.18]) add(cyl(0.083, 0.022, 32), dark, [0, y, 0], null, [1, 1, 0.66]);
  add(box(0.15, 0.13, 0.04, 0.015), dark, [0, 1.33, -0.105]);
  add(box(0.045, 0.01, 0.008, 0.004), glow, [0, 1.42, 0.104]);
  lathe([[0, 0.905], [0.07, 0.915], [0.108, 0.955], [0.112, 1.0], [0.092, 1.04], [0, 1.048]], shell, 0, 0, { sz: 0.66 });
  add(box(0.2, 0.03, 0.11, 0.01), dark, [0, 1.06, 0]);

  for (const s of [-1, 1]) {
    // Shoulder and arm
    const ax = s * 0.255;
    add(cyl(0.052, 0.07), dark, [s * 0.195, 1.425, 0], X);
    add(new THREE.SphereGeometry(0.064, 32, 22), shell, [s * 0.245, 1.43, 0], null, [0.95, 0.88, 1]);
    add(cyl(0.028, 0.012), metal, [s * 0.307, 1.43, 0], X);
    add(cyl(0.028, 0.22), dark, [ax, 1.265, 0]);
    lathe([[0.04, 1.165], [0.047, 1.24], [0.05, 1.31], [0.044, 1.37]], shell, ax, 0, { arc: 3.4, at: s * Math.PI / 2 });
    add(cyl(0.037, 0.068), dark, [ax, 1.135, 0], X);
    for (const k of [-1, 1]) add(cyl(0.02, 0.008), metal, [ax + k * 0.037, 1.135, 0], X);
    add(cyl(0.024, 0.2), dark, [ax, 1.0, 0]);
    lathe([[0, 1.1], [0.036, 1.095], [0.044, 1.04], [0.038, 0.96], [0.03, 0.905], [0, 0.9]], shell, ax, 0.004);
    add(cyl(0.024, 0.035), dark, [ax, 0.88, 0]);
    // Hand: palm faces the body, fingers hang below
    add(box(0.028, 0.08, 0.066, 0.011), dark, [ax, 0.825, 0]);
    add(box(0.008, 0.052, 0.05, 0.004), shell, [ax + s * 0.016, 0.83, 0]);
    for (const fz of [-0.025, -0.0085, 0.0085, 0.025]) {
      add(cap(0.0088, 0.014), dark, [ax, 0.77, fz]);
      add(cap(0.0084, 0.011), dark, [ax, 0.742, fz]);
      add(cap(0.0082, 0.007), shell, [ax, 0.718, fz]);
    }
    add(cap(0.0095, 0.016), dark, [ax - s * 0.015, 0.797, 0.04], [0.5, 0, 0]);
    add(cap(0.009, 0.011), shell, [ax - s * 0.017, 0.774, 0.051], [0.5, 0, 0]);

    // Leg
    const lx = s * 0.1;
    add(cyl(0.044, 0.05), dark, [lx, 0.9, 0]);
    add(cyl(0.056, 0.085), dark, [lx, 0.84, 0], X);
    add(cyl(0.034, 0.012), metal, [lx + s * 0.047, 0.84, 0], X);
    lathe([[0, 0.53], [0.045, 0.55], [0.053, 0.65], [0.06, 0.76], [0.052, 0.81], [0, 0.825]], dark, lx, 0, { sz: 0.9 });
    lathe([[0.05, 0.58], [0.064, 0.66], [0.073, 0.75], [0.066, 0.805]], shell, lx, 0, { sz: 0.95, arc: 3.0 });
    add(cyl(0.016, 0.2), dark, [lx, 0.67, -0.058]);
    add(cyl(0.007, 0.26, 12), metal, [lx + s * 0.022, 0.66, -0.05]);
    add(cyl(0.05, 0.092), dark, [lx, 0.5, 0], X);
    for (const k of [-1, 1]) add(cyl(0.028, 0.008), metal, [lx + k * 0.048, 0.5, 0], X);
    add(new THREE.SphereGeometry(0.042, 28, 18), shell, [lx, 0.505, 0.04], null, [1, 1.05, 0.6]);
    lathe([[0, 0.1], [0.03, 0.12], [0.038, 0.25], [0.046, 0.37], [0.042, 0.45], [0, 0.465]], dark, lx, 0, { sz: 0.9 });
    lathe([[0.036, 0.14], [0.044, 0.24], [0.056, 0.36], [0.052, 0.44]], shell, lx, 0, { sz: 0.95, arc: 2.9 });
    add(cyl(0.022, 0.16), dark, [lx, 0.34, -0.054]);
    add(cyl(0.007, 0.22, 12), metal, [lx, 0.2, -0.048]);
    add(cyl(0.03, 0.07), dark, [lx, 0.09, 0], X);
    add(box(0.084, 0.045, 0.19, 0.02), shell, [lx, 0.047, 0.035]);
    add(box(0.094, 0.018, 0.225, 0.008), dark, [lx, 0.009, 0.035]);
    add(box(0.07, 0.045, 0.045, 0.015), dark, [lx, 0.045, -0.07]);
  }
  return parts;
}

// --- Helpers ---------------------------------------------------------------

// A box with rounded edges and exact normals: vertices are pushed onto a radius
// around an inner box, and the push direction doubles as the normal.
function roundedBox(w, h, d, r, seg = 5) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const half = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(
      Math.max(-half.x, Math.min(half.x, v.x)),
      Math.max(-half.y, Math.min(half.y, v.y)),
      Math.max(-half.z, Math.min(half.z, v.z)),
    );
    n.subVectors(v, inner);
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    v.copy(inner).addScaledVector(n, r);
    pos.setXYZ(i, v.x, v.y, v.z);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// A small softbox studio, baked into an environment map for the reflections.
function studio(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x060606);
  const panel = (w, h, power, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    m.material.color.setScalar(power);
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  panel(5, 5, 3, [0, 6, 1], [0, 0, 0]);
  panel(1.4, 6, 2.2, [-5, 2, 2], [0, 1, 0]);
  panel(1.2, 6, 1.3, [5, 2, -1], [0, 1, 0]);
  panel(8, 1.2, 0.5, [0, 0.4, -6], [0, 1, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

function radial() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
