// A humanoid robot drawn as a CAD assembly: every joint is a full actuator
// (housing, end caps, bearing, output flange, encoder board, bolt rings), the torso
// holds battery cells, a logic board and a heatsink, and grey armour plates are
// screwed over a dark frame. Each turn starts assembled looking to one side, opens
// into an exploded view mid-turn, with every part sliding out along its own axis,
// and closes up again as it settles looking to the other side.
// script.js drives it inside the hero tile.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export const TURN = 5;  // seconds for one turn, matching the tile's switch interval

const SPAN = 0.55;       // how far it looks to each side, in radians
const HALF_H = 1.24;     // world half-height the camera keeps in view (exploded)
const HALF_W = 1.1;      // world half-width at peak spread
const LOOK_Y = 1.06;
const PART_SPREAD = 1.6; // parts move this much further than their group, for a clearer diagram

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
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  scene.environment = studio(renderer);

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1.6, 4.5, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 2.6, bottom: -0.4, near: 1, far: 10 });
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe4ff, 2.8);
  rim.position.set(-3, 2.2, -2.5);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffffff, 1.6);
  rim2.position.set(3, 1.5, -2);
  scene.add(rim2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 0.4));

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
  robot.userData.abs = new THREE.Vector3();
  scene.add(robot);
  const b = new Builder(mulberry(11));
  const head = buildRobot(b, robot);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(HALF_H / t, HALF_W / (t * camera.aspect)) + 0.3;
    camera.position.set(0, LOOK_Y + 0.12, dist);
    camera.lookAt(0, LOOK_Y, 0);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(() => { resize(); if (!raf) draw(last); }).observe(canvas);

  const ease = (x) => x * x * (3 - 2 * x);
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const smooth = (a, c, x) => ease(clamp((x - a) / (c - a)));

  // dir 1 turns left to right, -1 right to left; u runs 0..1 across the turn.
  function pose(u, dir, sec) {
    const k = clamp((u - 0.1) / 0.74);
    const turn = 0.5 - 0.5 * Math.cos(Math.PI * k);
    return {
      yaw: -dir * SPAN + dir * 2 * SPAN * turn,
      head: dir * 0.3 * (smooth(0, 0.2, u) - smooth(0.55, 0.95, u)),
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
    for (const n of b.nodes) {
      const e = ease(clamp(s.apart * 1.3 - n.delay));
      n.o.position.copy(n.home).addScaledVector(n.off, e);
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
    count: b.count,
    turn(dir) { playing = { dir, t0: performance.now() }; draw(pose(0, dir, 0)); kick(); },
    stop() { playing = null; if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}

// --- Assembly builder ---------------------------------------------------------

// Every group and mesh is a node with a home position and an exploded offset in its
// parent's frame; nested groups add up, so a part slides out of its actuator while
// the actuator slides out of its limb. Groups made with `group` take absolute
// coordinates for their children; actuator groups use their own local axis frame.
class Builder {
  constructor(rand) {
    this.rand = rand;
    this.nodes = [];
    this.count = 0;
    this.screwGeo = new THREE.SphereGeometry(0.0052, 10, 8);
    this.bolt = new THREE.CylinderGeometry(0.0042, 0.0042, 0.012, 10);
  }
  local(parent, p) {
    const a = parent.userData.abs;
    return a ? [p[0] - a.x, p[1] - a.y, p[2] - a.z] : p;
  }
  track(o, off, delay) {
    this.nodes.push({ o, home: o.position.clone(), off: new THREE.Vector3(...off), delay });
  }
  group(parent, abs, off = [0, 0, 0], delay = 0.02) {
    const g = new THREE.Group();
    g.position.set(...this.local(parent, abs));
    g.userData.abs = new THREE.Vector3(...abs);
    parent.add(g);
    this.track(g, off, delay);
    return g;
  }
  frame(parent, abs, rot, off = [0, 0, 0], delay = 0.05) {
    const g = new THREE.Group();
    g.position.set(...this.local(parent, abs));
    g.rotation.set(...rot);
    parent.add(g);
    this.track(g, off, delay);
    return g;
  }
  mesh(parent, geo, mat, p, off = [0, 0, 0], o = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...this.local(parent, p));
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale) m.scale.set(...o.scale);
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const big = geo.boundingSphere.radius * (o.scale ? Math.max(...o.scale) : 1) > 0.02;
    m.castShadow = m.receiveShadow = big;
    parent.add(m);
    this.track(m, off.map((v) => v * PART_SPREAD), o.delay ?? 0.06 + this.rand() * 0.18);
    this.count++;
    return m;
  }
  screw(parent, mat, p, off) { return this.mesh(parent, this.screwGeo, mat, p, off); }
  // A smooth turned shape from absolute [radius, height] points around a vertical
  // axis at (x, z). `arc` keeps part of the turn (a plate) centred on angle `at`
  // (0 faces forward, PI/2 faces +x). Placed at its own centre.
  lathe(parent, prof, mat, x, z, { sz = 1, arc, at = 0 } = {}, off) {
    const pts = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r, y)))
      .getPoints(36).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
    const g = arc ? new THREE.LatheGeometry(pts, 40, at - arc / 2, arc) : new THREE.LatheGeometry(pts, 40);
    g.scale(1, 1, sz);
    return this.centred(parent, g, mat, x, z, off);
  }
  tube(parent, pts, r, mat, off) {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 8);
    return this.centred(parent, g, mat, 0, 0, off);
  }
  centred(parent, g, mat, x, z, off) {
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    return this.mesh(parent, g, mat, [x + c.x, c.y, z + c.z], off);
  }
}

const AXIS = { x: [0, 0, -Math.PI / 2], '-x': [0, 0, Math.PI / 2], y: [0, 0, 0], '-y': [Math.PI, 0, 0], z: [Math.PI / 2, 0, 0], '-z': [-Math.PI / 2, 0, 0] };
const cyl = (r, h, seg = 32) => new THREE.CylinderGeometry(r, r, h, seg);
const ring = (r, t) => new THREE.TorusGeometry(r, t, 10, 40).rotateX(Math.PI / 2);
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 18);
const box = (w, h, d, r) => roundedBox(w, h, d, r ?? Math.min(w, h, d) * 0.3);

// A rotary actuator whose output faces `axis`: housing, banding ring, front plate,
// bearing, output flange and bolt ring at the front; end cap, encoder board and
// bolts at the back. In the exploded view the stack fans out along its axis.
function actuator(b, M, parent, abs, axis, r, len, off = [0, 0, 0]) {
  const g = b.frame(parent, abs, AXIS[axis], off);
  const h = len / 2;
  b.mesh(g, cyl(r, len), M.dark, [0, 0, 0], [0, 0, 0], { delay: 0.04 });
  b.mesh(g, ring(r * 1.005, r * 0.07), M.metal, [0, -h * 0.4, 0], [0, -len * 0.55, 0]);
  b.mesh(g, cyl(r * 0.97, 0.006), M.metal, [0, h + 0.003, 0], [0, len * 0.75, 0]);
  b.mesh(g, ring(r * 0.56, r * 0.08), M.metal, [0, h + 0.008, 0], [0, len * 1.1, 0]);
  b.mesh(g, cyl(r * 0.5, len * 0.2), M.steel, [0, h + len * 0.1 + 0.006, 0], [0, len * 1.5, 0]);
  const n = r > 0.035 ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * r * 0.78, z = Math.sin(a) * r * 0.78;
    b.mesh(g, b.bolt, M.metal, [x, h + 0.008, z], [x * 0.5, len * 1.05 + 0.05, z * 0.5]);
  }
  b.mesh(g, cyl(r * 0.9, len * 0.12), M.dark, [0, -h - len * 0.06, 0], [0, -len * 0.85, 0]);
  b.mesh(g, cyl(r * 0.45, 0.005), M.pcb, [0, -h - len * 0.12 - 0.003, 0], [0, -len * 1.4 - 0.02, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const x = Math.cos(a) * r * 0.62, z = Math.sin(a) * r * 0.62;
    b.mesh(g, b.bolt, M.metal, [x, -h - len * 0.12 - 0.004, z], [x * 0.4, -len * 1.15 - 0.04, z * 0.4]);
  }
  return g;
}

// --- The robot ----------------------------------------------------------------

function materials() {
  return {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xa3a7ac, roughness: 0.36, metalness: 0.18, clearcoat: 0.55, clearcoatRoughness: 0.22, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x26282c, roughness: 0.42, metalness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8d9095, roughness: 0.28, metalness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.2, metalness: 1 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x040506, roughness: 0.05, clearcoat: 1, metalness: 0.2, side: THREE.DoubleSide }),
    pcb: new THREE.MeshStandardMaterial({ color: 0x1f4a37, roughness: 0.55, metalness: 0.1 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.35, metalness: 0.3 }),
    cell: new THREE.MeshStandardMaterial({ color: 0x3a4656, roughness: 0.35, metalness: 0.6 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.8, metalness: 0 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xb7a6ff }),
  };
}

// Builds into `robot` (feet at y = 0, about 1.75 tall, facing +z). Returns the head
// group so the caller can turn it ahead of the body.
function buildRobot(b, robot) {
  const M = materials();
  const X = [0, 0, Math.PI / 2];
  const Z = [Math.PI / 2, 0, 0];

  // Head: helmet in two halves, face visor, cameras, ear pods, a small board, neck
  const head = b.group(robot, [0, 1.5, 0], [0, 0.36, 0]);
  actuator(b, M, head, [0, 1.525, 0], 'y', 0.026, 0.04, [0, -0.07, 0]);
  actuator(b, M, head, [0, 1.565, -0.008], 'x', 0.022, 0.05, [0, -0.02, 0]);
  b.mesh(head, new THREE.SphereGeometry(0.08, 32, 24), M.dark, [0, 1.637, 0], [0, 0, 0], { scale: [0.9, 1.1, 1] });
  const skull = [[0, 1.517], [0.06, 1.532], [0.095, 1.58], [0.104, 1.637], [0.095, 1.694], [0.06, 1.74], [0, 1.755]];
  b.lathe(head, skull, M.shell, 0, 0, { arc: 3.5, at: Math.PI }, [0, 0.03, -0.13]);
  b.lathe(head, skull, M.shell, 0, 0, { arc: 2.6, at: 0 }, [0, 0.07, 0.06]);
  b.mesh(head, new THREE.SphereGeometry(0.108, 44, 22, Math.PI / 2 - 1.0, 2.0, 1.05, 0.95), M.visor, [0, 1.637, 0.004], [0, 0, 0.2], { scale: [1, 1.1, 1] });
  b.mesh(head, box(0.055, 0.005, 0.006, 0.0025), M.glow, [0, 1.65, 0.112], [0, 0, 0.24]);
  for (const s of [-1, 1]) {
    b.mesh(head, cyl(0.012, 0.02), M.dark, [s * 0.028, 1.637, 0.082], [s * 0.03, 0, 0.13], { rot: Z });
    b.mesh(head, cyl(0.0075, 0.006), M.visor, [s * 0.028, 1.637, 0.094], [s * 0.03, 0, 0.165], { rot: Z });
    b.mesh(head, cyl(0.028, 0.024), M.dark, [s * 0.098, 1.632, 0], [s * 0.09, 0, 0], { rot: X });
    b.mesh(head, cyl(0.018, 0.008), M.metal, [s * 0.114, 1.632, 0], [s * 0.14, 0, 0], { rot: X });
    for (const a of [0.9, 1.7, 2.5]) b.screw(head, M.metal, [s * Math.sin(a) * 0.104, 1.62, Math.cos(a) * 0.104], [s * Math.sin(a) * 0.2, 0.02, Math.cos(a) * 0.2]);
  }
  b.mesh(head, box(0.07, 0.05, 0.004, 0.002), M.pcb, [0, 1.665, -0.04], [0, 0.06, -0.06]);
  for (const x of [-0.02, 0.006, 0.024]) b.mesh(head, box(0.012, 0.012, 0.003, 0.001), M.chip, [x, 1.665, -0.037], [x * 0.5, 0.06, -0.035]);

  // Chest: frame rails, crossbars, shoulder yoke, battery pack, logic board with a
  // heatsink, cabling, and five armour plates held by screws
  const chest = b.group(robot, [0, 1.3, 0], [0, 0.17, 0]);
  for (const s of [-1, 1]) b.mesh(chest, box(0.018, 0.34, 0.11, 0.006), M.dark, [s * 0.05, 1.3, -0.01], [s * 0.035, 0, -0.02]);
  for (const y of [1.18, 1.3, 1.42]) b.mesh(chest, cyl(0.008, 0.2, 16), M.metal, [0, y, -0.05], [0, 0, -0.07], { rot: X });
  b.mesh(chest, box(0.36, 0.04, 0.09, 0.012), M.dark, [0, 1.45, 0], [0, 0.07, 0]);
  b.mesh(chest, box(0.17, 0.16, 0.012, 0.005), M.dark, [0, 1.28, -0.1], [0, 0, -0.32]);
  for (const x of [-0.06, -0.02, 0.02, 0.06]) {
    for (const y of [1.235, 1.335]) b.mesh(chest, cyl(0.017, 0.09, 20), M.cell, [x, y, -0.075], [x * 0.7, (y - 1.285) * 0.8, -0.2]);
  }
  b.mesh(chest, box(0.15, 0.13, 0.005, 0.002), M.pcb, [0, 1.3, 0.04], [0, 0, 0.12]);
  for (const [x, y, w] of [[-0.045, 0.035, 0.024], [0.045, 0.04, 0.02], [-0.045, -0.035, 0.018], [0.045, -0.035, 0.026], [0, -0.05, 0.014]]) {
    b.mesh(chest, box(w, w, 0.004, 0.0015), M.chip, [x, 1.3 + y, 0.045], [x * 0.4, y * 0.4, 0.155]);
  }
  b.mesh(chest, box(0.06, 0.06, 0.006, 0.002), M.metal, [0, 1.3, 0.047], [0, 0, 0.2]);
  for (let i = 0; i < 6; i++) b.mesh(chest, box(0.004, 0.06, 0.02, 0.0015), M.metal, [-0.025 + i * 0.01, 1.3, 0.06], [(-0.025 + i * 0.01) * 0.9, 0, 0.24]);
  for (const s of [-1, 1]) b.tube(chest, [[s * 0.03, 1.33, 0.005], [s * 0.1, 1.42, 0.03], [s * 0.17, 1.44, 0.0]], 0.006, M.cable, [s * 0.05, 0.03, 0.05]);
  const front = [[0.112, 1.2], [0.135, 1.28], [0.152, 1.36], [0.146, 1.43], [0.1, 1.48]];
  const back = [[0.118, 1.24], [0.144, 1.33], [0.148, 1.42], [0.11, 1.48]];
  for (const s of [-1, 1]) {
    b.lathe(chest, front, M.shell, 0, 0, { sz: 0.68, arc: 1.32, at: s * 0.64 }, [s * 0.08, 0, 0.32]);
    b.lathe(chest, back, M.shell, 0, 0, { sz: 0.68, arc: 0.72, at: s * Math.PI / 2 }, [s * 0.2, 0, 0]);
    for (const [x, y, z] of [[0.05, 1.43, 0.1], [0.11, 1.34, 0.086], [0.05, 1.24, 0.086]]) b.screw(chest, M.metal, [s * x, y, z], [s * 0.08, 0, 0.4]);
  }
  b.lathe(chest, back, M.shell, 0, 0, { sz: 0.68, arc: 2.1, at: Math.PI }, [0, 0, -0.42]);
  for (const x of [-0.07, 0.07]) b.screw(chest, M.metal, [x, 1.4, -0.1], [0, 0, -0.5]);
  b.mesh(chest, box(0.04, 0.009, 0.006, 0.003), M.glow, [0.06, 1.42, 0.104], [0.08, 0, 0.34]);

  // Waist yaw joint with front and back abdomen plates
  const waist = b.group(robot, [0, 1.12, 0], [0, 0.07, 0]);
  actuator(b, M, waist, [0, 1.12, 0], 'y', 0.058, 0.05);
  const abs = [[0.088, 1.075], [0.084, 1.12], [0.1, 1.18]];
  b.lathe(waist, abs, M.shell, 0, 0, { sz: 0.74, arc: 2.0 }, [0, 0, 0.22]);
  b.lathe(waist, abs, M.shell, 0, 0, { sz: 0.74, arc: 2.0, at: Math.PI }, [0, 0, -0.22]);

  // Pelvis: frame, hip mounting plates, front and back covers
  const pelvis = b.group(robot, [0, 0.97, 0], [0, 0.02, 0]);
  b.mesh(pelvis, box(0.22, 0.07, 0.13, 0.015), M.dark, [0, 0.98, 0]);
  for (const s of [-1, 1]) b.mesh(pelvis, box(0.03, 0.08, 0.1, 0.008), M.dark, [s * 0.1, 0.93, 0], [s * 0.05, 0, 0]);
  const hipShell = [[0.07, 0.915], [0.108, 0.955], [0.112, 1.0], [0.092, 1.04]];
  b.lathe(pelvis, hipShell, M.shell, 0, 0, { sz: 0.66, arc: 2.4 }, [0, 0, 0.24]);
  b.lathe(pelvis, hipShell, M.shell, 0, 0, { sz: 0.66, arc: 2.0, at: Math.PI }, [0, 0, -0.24]);
  for (const s of [-1, 1]) for (const y of [0.94, 0.99]) b.screw(pelvis, M.metal, [s * 0.06, y, 0.074], [0, 0, 0.3]);

  for (const s of [-1, 1]) {
    const out = s > 0 ? 'x' : '-x';
    const ax = s * 0.255;

    // Arm: shoulder pitch, upper arm (roll joint, link, shells), elbow,
    // forearm (wrist yaw, rods, shells), wrist pitch, hand
    const shoulder = b.group(robot, [s * 0.2, 1.43, 0], [s * 0.15, 0.2, 0]);
    actuator(b, M, shoulder, [s * 0.2, 1.43, 0], out, 0.05, 0.065);
    b.mesh(shoulder, new THREE.SphereGeometry(0.064, 32, 20), M.shell, [s * 0.262, 1.43, 0], [s * 0.13, 0, 0], { scale: [0.6, 0.9, 1] });

    const upper = b.group(robot, [ax, 1.27, 0], [s * 0.26, 0.15, 0]);
    actuator(b, M, upper, [ax, 1.355, 0], 'y', 0.036, 0.04, [0, 0.035, 0]);
    b.mesh(upper, cyl(0.022, 0.17), M.dark, [ax, 1.25, 0]);
    const ua = [[0.04, 1.17], [0.047, 1.24], [0.05, 1.31], [0.044, 1.345]];
    b.lathe(upper, ua, M.shell, ax, 0, { arc: Math.PI }, [0, 0, 0.12]);
    b.lathe(upper, ua, M.shell, ax, 0, { arc: Math.PI, at: Math.PI }, [0, 0, -0.12]);
    for (const y of [1.2, 1.3]) b.screw(upper, M.metal, [ax + s * 0.048, y, 0], [s * 0.09, 0, 0]);

    const elbow = b.group(robot, [ax, 1.135, 0], [s * 0.33, 0.1, 0]);
    actuator(b, M, elbow, [ax, 1.135, 0], out, 0.036, 0.06);

    const fore = b.group(robot, [ax, 1.0, 0], [s * 0.38, 0.04, 0]);
    actuator(b, M, fore, [ax, 1.068, 0], '-y', 0.027, 0.035, [0, 0.02, 0]);
    for (const k of [-1, 1]) b.mesh(fore, cyl(0.006, 0.16, 12), M.steel, [ax, 0.985, k * 0.018], [0, 0, k * 0.05]);
    const fa = [[0.036, 1.1], [0.044, 1.04], [0.038, 0.96], [0.03, 0.91]];
    b.lathe(fore, fa, M.shell, ax, 0, { arc: Math.PI }, [0, 0, 0.11]);
    b.lathe(fore, fa, M.shell, ax, 0, { arc: Math.PI, at: Math.PI }, [0, 0, -0.11]);

    const wrist = b.group(robot, [ax, 0.885, 0], [s * 0.42, 0, 0]);
    actuator(b, M, wrist, [ax, 0.885, 0], 'z', 0.02, 0.04);

    const hand = b.group(robot, [ax, 0.83, 0], [s * 0.46, -0.08, 0]);
    b.mesh(hand, box(0.024, 0.07, 0.06, 0.008), M.dark, [ax, 0.83, 0]);
    b.mesh(hand, box(0.006, 0.06, 0.055, 0.0025), M.shell, [ax - s * 0.016, 0.83, 0], [-s * 0.05, 0, 0]);
    b.mesh(hand, box(0.006, 0.06, 0.055, 0.0025), M.shell, [ax + s * 0.016, 0.83, 0], [s * 0.06, 0, 0]);
    for (const k of [-1, 1]) b.screw(hand, M.metal, [ax + s * 0.02, 0.85, k * 0.018], [s * 0.09, 0, 0]);
    for (const fz of [-0.022, -0.0075, 0.0075, 0.022]) {
      b.mesh(hand, cyl(0.004, 0.014, 10), M.steel, [ax, 0.792, fz], [0, -0.015, fz * 1.2], { rot: Z });
      b.mesh(hand, cap(0.0085, 0.014), M.dark, [ax, 0.774, fz], [0, -0.03, fz * 1.6]);
      b.mesh(hand, cap(0.008, 0.011), M.dark, [ax, 0.748, fz], [0, -0.05, fz * 2.0]);
      b.mesh(hand, cap(0.0078, 0.007), M.shell, [ax, 0.725, fz], [0, -0.072, fz * 2.4]);
    }
    b.mesh(hand, cyl(0.005, 0.012, 10), M.steel, [ax - s * 0.012, 0.81, 0.034], [-s * 0.02, -0.01, 0.03], { rot: Z });
    b.mesh(hand, cap(0.0092, 0.014), M.dark, [ax - s * 0.015, 0.795, 0.042], [-s * 0.03, -0.02, 0.05], { rot: [0.5, 0, 0] });
    b.mesh(hand, cap(0.0086, 0.01), M.shell, [ax - s * 0.017, 0.774, 0.052], [-s * 0.04, -0.035, 0.07], { rot: [0.5, 0, 0] });

    // Leg: hip yaw and roll, thigh (hip pitch, side plates, knee drive, shells),
    // knee, shin (plates, push rods, calf motor, shell), ankle, foot
    const lx = s * 0.1;
    const hip = b.group(robot, [lx, 0.88, 0], [s * 0.13, 0.07, 0]);
    actuator(b, M, hip, [lx, 0.905, 0], '-y', 0.04, 0.04, [0, 0.03, 0]);
    actuator(b, M, hip, [lx, 0.858, 0], 'z', 0.04, 0.07);

    const thigh = b.group(robot, [lx, 0.68, 0], [s * 0.2, 0.04, 0]);
    actuator(b, M, thigh, [lx, 0.79, 0], out, 0.052, 0.085, [0, 0.04, 0]);
    for (const k of [-1, 1]) b.mesh(thigh, box(0.016, 0.26, 0.07, 0.006), M.dark, [lx + k * 0.032, 0.66, 0], [k * 0.04, 0, 0]);
    b.mesh(thigh, cyl(0.014, 0.14, 20), M.dark, [lx, 0.68, -0.055], [0, 0.02, -0.09]);
    b.mesh(thigh, cyl(0.006, 0.12, 12), M.steel, [lx, 0.57, -0.055], [0, -0.04, -0.09]);
    b.mesh(thigh, new THREE.SphereGeometry(0.009, 12, 10), M.metal, [lx, 0.51, -0.055], [0, -0.07, -0.09]);
    b.lathe(thigh, [[0.05, 0.58], [0.064, 0.66], [0.073, 0.75], [0.066, 0.8]], M.shell, lx, 0, { sz: 0.95, arc: 2.6 }, [0, 0, 0.16]);
    b.lathe(thigh, [[0.046, 0.6], [0.058, 0.66], [0.066, 0.74], [0.06, 0.79]], M.shell, lx, 0, { sz: 0.95, arc: 1.6, at: Math.PI }, [0, 0, -0.2]);
    for (const k of [-1, 1]) for (const y of [0.62, 0.72]) b.screw(thigh, M.metal, [lx + k * 0.038, y, 0.05], [0, 0, 0.22]);

    const knee = b.group(robot, [lx, 0.5, 0], [s * 0.24, 0, 0]);
    actuator(b, M, knee, [lx, 0.5, 0], out, 0.048, 0.085);
    b.mesh(knee, new THREE.SphereGeometry(0.04, 28, 18), M.shell, [lx, 0.505, 0.04], [0, 0, 0.15], { scale: [1, 1.05, 0.55] });

    const shin = b.group(robot, [lx, 0.3, 0], [s * 0.27, 0, 0]);
    for (const k of [-1, 1]) {
      b.mesh(shin, box(0.014, 0.3, 0.06, 0.005), M.dark, [lx + k * 0.028, 0.28, -0.005], [k * 0.035, 0, 0]);
      b.mesh(shin, cyl(0.005, 0.3, 12), M.steel, [lx + k * 0.018, 0.24, -0.05], [k * 0.02, 0, -0.1]);
      for (const y of [0.39, 0.09]) b.mesh(shin, new THREE.SphereGeometry(0.008, 12, 10), M.metal, [lx + k * 0.018, y, -0.05], [k * 0.02, (y - 0.24) * 0.3, -0.1]);
    }
    b.mesh(shin, cyl(0.025, 0.08, 24), M.dark, [lx, 0.4, -0.05], [0, 0.02, -0.17]);
    b.mesh(shin, cyl(0.02, 0.01, 24), M.metal, [lx, 0.445, -0.05], [0, 0.06, -0.17]);
    b.lathe(shin, [[0.036, 0.14], [0.044, 0.24], [0.056, 0.36], [0.052, 0.44]], M.shell, lx, 0, { sz: 0.95, arc: 2.6 }, [0, 0, 0.16]);
    for (const y of [0.22, 0.36]) b.screw(shin, M.metal, [lx, y, y > 0.3 ? 0.055 : 0.044], [0, 0, 0.22]);

    const ankle = b.group(robot, [lx, 0.09, 0], [s * 0.3, 0, 0]);
    actuator(b, M, ankle, [lx, 0.09, 0], out, 0.028, 0.07);

    const foot = b.group(robot, [lx, 0.04, 0.03], [s * 0.33, 0, 0.05]);
    b.mesh(foot, box(0.094, 0.016, 0.23, 0.006), M.dark, [lx, 0.009, 0.035]);
    b.mesh(foot, box(0.084, 0.04, 0.17, 0.018), M.shell, [lx, 0.045, 0.045], [0, 0.06, 0]);
    b.mesh(foot, box(0.08, 0.03, 0.05, 0.012), M.dark, [lx, 0.024, 0.17], [0, 0, 0.07]);
    b.mesh(foot, box(0.07, 0.04, 0.045, 0.014), M.shell, [lx, 0.04, -0.07], [0, 0.02, -0.06]);
    for (const k of [-1, 1]) for (const z of [0, 0.09]) b.screw(foot, M.metal, [lx + k * 0.03, 0.066, z], [0, 0.1, 0]);
  }
  return head;
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
