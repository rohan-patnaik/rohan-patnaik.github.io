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
  key.shadow.bias = -0.0004;
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

function build(robot, head) {
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xf1f1ee, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.38, metalness: 0.55 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8d91, roughness: 0.28, metalness: 0.9 });
  const visor = new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.06, clearcoat: 1, metalness: 0.2 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xb7a6ff });
  const kinds = new Map([[shell, 'shell'], [dark, 'dark'], [metal, 'metal'], [visor, 'shell'], [glow, 'dark']]);

  const parts = [];
  const X = [0, 0, Math.PI / 2];   // cylinder axis along x
  const Z = [Math.PI / 2, 0, 0];   // cylinder axis along z
  const add = (geo, mat, pos, rot, scale, parent = robot) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...scale);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    parts.push({ m, home: m.position.clone(), homeQ: m.quaternion.clone(), kind: kinds.get(mat) });
  };
  const cyl = (r, h, seg = 28) => new THREE.CylinderGeometry(r, r, h, seg);
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 20);
  const box = (w, h, d, r) => roundedBox(w, h, d, r ?? Math.min(w, h, d) * 0.3);
  const bolt = (pos, axis = Z, parent) => add(cyl(0.008, 0.008, 12), metal, pos, axis, null, parent);

  // Head
  add(new THREE.SphereGeometry(0.112, 40, 28), shell, [0, 0.13, -0.005], null, [1, 1.16, 1.06], head);
  add(new THREE.SphereGeometry(0.104, 40, 28), visor, [0, 0.125, 0.03], null, [0.93, 0.78, 1], head);
  add(box(0.1, 0.006, 0.01, 0.003), glow, [0, 0.135, 0.132], null, null, head);
  for (const s of [-1, 1]) {
    add(cyl(0.036, 0.03), dark, [s * 0.112, 0.12, -0.005], X, null, head);
    add(cyl(0.02, 0.012), metal, [s * 0.131, 0.12, -0.005], X, null, head);
  }
  add(box(0.11, 0.08, 0.05), dark, [0, 0.1, -0.095], null, null, head);
  add(cyl(0.034, 0.035), dark, [0, 0.0, 0], null, null, head);
  add(cyl(0.04, 0.02), metal, [0, -0.025, 0], null, null, head);

  // Torso
  add(box(0.22, 0.42, 0.16, 0.03), dark, [0, 1.25, 0]);
  add(box(0.34, 0.24, 0.08, 0.04), shell, [0, 1.36, 0.06]);
  add(box(0.32, 0.26, 0.06, 0.03), shell, [0, 1.35, -0.08]);
  add(box(0.2, 0.17, 0.05, 0.02), dark, [0, 1.28, -0.125]);
  add(box(0.27, 0.045, 0.13, 0.02), dark, [0, 1.49, 0]);
  add(box(0.05, 0.012, 0.01, 0.005), glow, [0, 1.43, 0.101]);
  for (const s of [-1, 1]) {
    add(box(0.03, 0.18, 0.1, 0.012), dark, [s * 0.18, 1.31, 0]);
    bolt([s * 0.145, 1.45, 0.1]);
    bolt([s * 0.145, 1.27, 0.1]);
  }
  for (const y of [1.17, 1.13, 1.09]) add(box(0.2, 0.034, 0.13, 0.012), dark, [0, y, 0.005]);
  add(box(0.17, 0.085, 0.04, 0.018), shell, [0, 1.13, 0.07]);
  add(box(0.27, 0.1, 0.16, 0.03), dark, [0, 1.02, 0]);
  add(box(0.29, 0.065, 0.06, 0.025), shell, [0, 1.02, 0.065]);

  for (const s of [-1, 1]) {
    // Arm
    const ax = s * 0.262;
    add(cyl(0.058, 0.08), dark, [s * 0.212, 1.43, 0], X);
    add(new THREE.SphereGeometry(0.068, 32, 20), shell, [s * 0.258, 1.435, 0], null, [1, 0.92, 1]);
    add(cyl(0.03, 0.012), metal, [s * 0.326, 1.435, 0], X);
    add(cyl(0.028, 0.22), dark, [ax, 1.27, 0]);
    add(cap(0.046, 0.12), shell, [ax, 1.265, 0.004], null, [1, 1, 1.05]);
    add(cyl(0.04, 0.072), dark, [ax, 1.125, 0], X);
    for (const k of [-1, 1]) add(cyl(0.022, 0.01), metal, [ax + k * 0.04, 1.125, 0], X);
    add(cap(0.04, 0.12), shell, [ax, 0.995, 0.006]);
    add(box(0.05, 0.16, 0.04, 0.015), dark, [ax, 0.995, -0.024]);
    add(cyl(0.027, 0.04), dark, [ax, 0.89, 0]);
    // Hand: palm faces the body, fingers hang below
    add(box(0.03, 0.085, 0.072, 0.012), dark, [ax, 0.83, 0]);
    add(box(0.008, 0.05, 0.05, 0.004), shell, [ax + s * 0.017, 0.835, 0]);
    for (const fz of [-0.027, -0.009, 0.009, 0.027]) {
      add(cap(0.0095, 0.014), dark, [ax, 0.774, fz]);
      add(cap(0.009, 0.012), dark, [ax, 0.745, fz]);
      add(cap(0.0088, 0.008), shell, [ax, 0.72, fz]);
    }
    add(cap(0.01, 0.016), dark, [ax - s * 0.016, 0.8, 0.042], [0.5, 0, 0]);
    add(cap(0.0095, 0.012), shell, [ax - s * 0.018, 0.776, 0.054], [0.5, 0, 0]);

    // Leg
    const lx = s * 0.11;
    add(cyl(0.046, 0.05), dark, [s * 0.1, 0.94, 0]);
    add(cyl(0.06, 0.09), dark, [lx, 0.87, 0], X);
    add(cyl(0.036, 0.012), metal, [lx + s * 0.05, 0.87, 0], X);
    add(box(0.07, 0.3, 0.08, 0.02), dark, [lx, 0.68, -0.012]);
    add(box(0.1, 0.25, 0.1, 0.045), shell, [lx, 0.7, 0.024]);
    for (const k of [-1, 1]) add(cyl(0.008, 0.3, 12), metal, [lx + k * 0.028, 0.68, -0.056]);
    bolt([lx, 0.79, 0.075]);
    bolt([lx, 0.61, 0.075]);
    add(cyl(0.055, 0.1), dark, [lx, 0.5, 0], X);
    for (const k of [-1, 1]) add(cyl(0.03, 0.01), metal, [lx + k * 0.053, 0.5, 0], X);
    add(box(0.08, 0.08, 0.04, 0.018), shell, [lx, 0.5, 0.056]);
    add(box(0.06, 0.32, 0.07, 0.02), dark, [lx, 0.3, -0.015]);
    add(box(0.086, 0.24, 0.08, 0.035), shell, [lx, 0.32, 0.03]);
    add(box(0.06, 0.1, 0.06, 0.02), dark, [lx, 0.38, -0.062]);
    add(cyl(0.007, 0.28, 12), metal, [lx, 0.25, -0.062]);
    bolt([lx, 0.4, 0.071]);
    add(cyl(0.032, 0.08), dark, [lx, 0.1, 0], X);
    add(box(0.1, 0.04, 0.24, 0.015), dark, [lx, 0.03, 0.04]);
    add(box(0.09, 0.03, 0.13, 0.012), shell, [lx, 0.064, 0.07]);
    add(box(0.09, 0.026, 0.05, 0.01), dark, [lx, 0.02, 0.185]);
    add(box(0.08, 0.04, 0.05, 0.015), shell, [lx, 0.04, -0.07]);
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
