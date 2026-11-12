// A humanoid robot for the hero tile, drawn with three.js.
//
// Design: a dark mechanical frame (spine, limb bones, actuator drums at every joint)
// with grey armour shells hung over it. During a turn the shells peel outward and the
// frame parts slide along the limbs, so at peak spread the robot reads as a maintenance
// diagram: skeleton in the middle, armour floating around it, all still turning together.
//
// Interface used by script.js:
//   TURN                  seconds one turn lasts
//   mountRobot(canvas) -> { count, turn(dir), stop() } or null when WebGL is unavailable

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export const TURN = 5;

const YAW = THREE.MathUtils.degToRad(30);   // body yaw at either end of a turn
const HEAD_LEAD = THREE.MathUtils.degToRad(9); // the head looks a little ahead of the body
const LOOK_AT = new THREE.Vector3(0, 0.95, 0);
const HALF_H = 1.52;  // world half-height the camera must show (exploded head and feet)
const HALF_W = 1.05; // world half-width at peak spread

const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Explosion amount over one turn: closed at the ends, fully apart around the middle.
const spread = (t) => smooth(0.35, 2.2, t) * (1 - smooth(2.75, 4.45, t));
// Body yaw progress over one turn, with a settled pose at both ends.
const turnProgress = (t) => smooth(0.25, 4.6, t);

export function mountRobot(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 40);

  // ---- lights -------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xd8dce6, 0x3c3f46, 0.95));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
  key.position.set(2.4, 4.2, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 12;
  key.shadow.camera.left = key.shadow.camera.bottom = -1.8;
  key.shadow.camera.right = key.shadow.camera.top = 1.8;
  key.shadow.bias = -0.0015;
  key.shadow.radius = 4;
  scene.add(key);
  const rimA = new THREE.DirectionalLight(0xb7a6ff, 2.2); // lavender rim, back-left
  rimA.position.set(-3.2, 2.4, -2.6);
  scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0xe4ecff, 1.6); // cool rim, back-right
  rimB.position.set(3.4, 1.4, -3);
  scene.add(rimB);
  const fill = new THREE.DirectionalLight(0xc9cfdb, 0.85);
  fill.position.set(-2.5, 0.8, 3.5);
  scene.add(fill);

  // Contact shadow on an invisible floor.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.ShadowMaterial({ opacity: 0.32 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- materials ---------------------------------------------------------------
  const M = {
    shell: new THREE.MeshStandardMaterial({ color: 0x8f939a, roughness: 0.4, metalness: 0.22, side: THREE.DoubleSide }),
    frame: new THREE.MeshStandardMaterial({ color: 0x353a41, roughness: 0.48, metalness: 0.55 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x434952, roughness: 0.3, metalness: 0.72 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.1, metalness: 0.85, side: THREE.DoubleSide }),
    accent: new THREE.MeshStandardMaterial({ color: 0xb7a6ff, emissive: 0xb7a6ff, emissiveIntensity: 1.6, roughness: 0.4 }),
  };

  // ---- geometry helpers ---------------------------------------------------------
  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    capsule: (r, len) => new THREE.CapsuleGeometry(r, len, 6, 18),
    sphere: (r) => new THREE.SphereGeometry(r, 32, 24),
    // Cylinder standing on y; `axis` 'x' lays it across the body (actuator drum).
    drum: (r, h, seg = 28) => new THREE.CylinderGeometry(r, r, h, seg),
    rod: (r, h) => new THREE.CylinderGeometry(r, r, h, 16),
    // Half of a tapered, open cylinder: an armour plate. face 'front' or 'back'.
    plate: (rTop, rBot, h, face) => new THREE.CylinderGeometry(
      rTop, rBot, h, 16, 1, true, face === 'front' ? -Math.PI / 2 : Math.PI / 2, Math.PI
    ),
  };

  // ---- the robot ----------------------------------------------------------------
  const body = new THREE.Group(); // yawed as a whole; every part is a child
  scene.add(body);
  const head = new THREE.Group(); // nested so the head can lead the turn a little
  body.add(head);
  const parts = [];
  const centre = new THREE.Vector3(0, 1.1, 0);
  const UP = new THREE.Vector3(0, 1, 0);

  // part(geometry, material, [x,y,z] home, [x,y,z] offset at full spread, options)
  //   options.rot  : [x,y,z] base euler in radians (e.g. lay a drum along x)
  //   options.scale: [x,y,z]
  //   options.tilt : radians the part tips over at full spread (default alternates)
  //   options.parent: group to attach to (default body)
  function part(geo, mat, home, out, o = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.fromArray(home);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale) m.scale.fromArray(o.scale);
    m.castShadow = true;
    m.receiveShadow = false;
    const outV = new THREE.Vector3().fromArray(out);
    const axis = new THREE.Vector3().crossVectors(outV, UP);
    if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
    axis.normalize();
    const i = parts.length;
    m.userData = {
      home: m.position.clone(),
      out: outV,
      baseQ: m.quaternion.clone(),
      axis,
      tilt: o.tilt ?? (i % 2 ? 0.26 : -0.26),
      // parts near the core start moving first; extremities trail behind
      delay: Math.min(0.32, 0.26 * m.position.distanceTo(centre)),
    };
    (o.parent || body).add(m);
    parts.push(m);
    return m;
  }

  const X = [Math.PI / 2, 0, 0]; // rotate a y-cylinder onto the z axis
  const Z = [0, 0, Math.PI / 2]; // rotate a y-cylinder onto the x axis

  // -- head (helmet, visor, jaw guard, ear pods, status line, neck) --
  head.position.set(0, 1.66, 0);
  const hp = { parent: head };
  part(G.sphere(0.15), M.shell, [0, 0.17, 0], [0, 0.32, -0.04], { ...hp, scale: [1, 1.08, 1], tilt: 0 });
  part(
    new THREE.SphereGeometry(0.154, 32, 16, Math.PI / 2 - 1.0, 2.0, 0.95, 1.0),
    M.visor, [0, 0.17, 0], [0, 0.24, 0.24], { ...hp, scale: [1, 1.08, 1], tilt: -0.3 }
  );
  part(G.box(0.07, 0.006, 0.01), M.accent, [0, 0.19, 0.152], [0, 0.24, 0.32], { ...hp, tilt: -0.3 });
  part(G.plate(0.125, 0.105, 0.05, 'front'), M.frame, [0, 0.06, 0], [0, 0.18, 0.16], { ...hp, scale: [1, 1, 0.95], tilt: 0.3 });
  part(G.drum(0.035, 0.028), M.joint, [-0.152, 0.17, 0], [-0.22, 0.28, 0], { ...hp, rot: Z });
  part(G.drum(0.035, 0.028), M.joint, [0.152, 0.17, 0], [0.22, 0.28, 0], { ...hp, rot: Z });
  part(G.drum(0.045, 0.08), M.joint, [0, -0.02, 0], [0, 0.16, 0], { ...hp, tilt: 0 });

  // -- torso frame --
  part(G.box(0.58, 0.075, 0.15), M.frame, [0, 1.6, 0], [0, 0.14, 0], { tilt: 0 });            // shoulder yoke
  part(G.box(0.17, 0.56, 0.1), M.frame, [0, 1.32, -0.01], [0, 0.02, 0], { tilt: 0 });          // spine
  part(G.box(0.3, 0.06, 0.14), M.joint, [0, 1.5, 0.02], [0, 0.06, 0.06], { tilt: 0 });         // chest cross-member
  part(G.drum(0.13, 0.13), M.joint, [0, 1.17, 0], [0, -0.06, 0], { scale: [1, 1, 0.78], tilt: 0 }); // waist drum
  part(G.box(0.34, 0.13, 0.15), M.frame, [0, 1.03, 0], [0, -0.16, 0], { tilt: 0 });             // pelvis frame
  // -- torso shells --
  part(G.plate(0.31, 0.21, 0.38, 'front'), M.shell, [0, 1.41, 0], [0, 0.08, 0.44], { scale: [1, 1, 0.66], tilt: 0.18 });
  part(G.plate(0.31, 0.21, 0.38, 'back'), M.shell, [0, 1.41, 0], [0, 0.08, -0.44], { scale: [1, 1, 0.66], tilt: -0.18 });
  part(G.box(0.05, 0.004, 0.01), M.accent, [0.1, 1.5, 0.205], [0.1, 0.1, 0.52], { tilt: 0.18 });
  part(G.plate(0.185, 0.165, 0.1, 'front'), M.shell, [0, 1.19, 0], [0, -0.03, 0.34], { scale: [1, 1, 0.7], tilt: 0.2 });
  part(G.plate(0.185, 0.165, 0.1, 'back'), M.shell, [0, 1.19, 0], [0, -0.03, -0.34], { scale: [1, 1, 0.7], tilt: -0.2 });
  part(G.plate(0.21, 0.18, 0.17, 'front'), M.shell, [0, 1.05, 0], [0, -0.16, 0.36], { scale: [1, 1, 0.72], tilt: 0.2 });
  part(G.plate(0.21, 0.18, 0.17, 'back'), M.shell, [0, 1.05, 0], [0, -0.16, -0.36], { scale: [1, 1, 0.72], tilt: -0.2 });

  for (const s of [-1, 1]) {
    // -- arm --
    const ax = s * 0.41;
    part(G.drum(0.07, 0.1), M.joint, [s * 0.335, 1.6, 0], [s * 0.16, 0.14, 0], { rot: Z, tilt: 0 });   // shoulder drum
    part(G.sphere(0.092), M.shell, [ax, 1.6, 0], [s * 0.34, 0.24, 0.02], { scale: [0.9, 1, 1], tilt: s * 0.25 }); // shoulder cap
    part(G.rod(0.034, 0.3), M.frame, [ax, 1.45, 0], [s * 0.2, 0.1, 0], { tilt: 0 });                   // upper arm bone
    part(G.capsule(0.066, 0.15), M.shell, [ax + s * 0.01, 1.44, 0.005], [s * 0.44, 0.1, 0.1], { tilt: s * 0.28 }); // upper arm shell
    part(G.drum(0.056, 0.1), M.joint, [ax, 1.285, 0], [s * 0.3, 0, 0], { rot: Z, tilt: 0 });          // elbow drum
    part(G.rod(0.03, 0.27), M.frame, [ax, 1.15, 0], [s * 0.24, -0.1, 0], { tilt: 0 });                 // forearm bone
    part(G.capsule(0.056, 0.15), M.shell, [ax + s * 0.005, 1.145, 0.01], [s * 0.48, -0.1, 0.1], { tilt: s * -0.28 }); // forearm shell
    part(G.drum(0.04, 0.05), M.joint, [ax, 0.995, 0], [s * 0.3, -0.2, 0], { tilt: 0 });               // wrist
    part(G.box(0.07, 0.1, 0.038), M.frame, [ax, 0.925, 0], [s * 0.32, -0.3, 0], { tilt: 0 });          // palm
    for (let f = 0; f < 4; f++) {
      const z = -0.027 + f * 0.018;
      part(G.box(0.016, 0.04, 0.015), M.joint, [ax, 0.855, z], [s * 0.33, -0.38 - f * 0.012, z * 2.4], { tilt: 0 });
      part(G.box(0.015, 0.035, 0.014), M.shell, [ax, 0.82, z + 0.006], [s * 0.33, -0.45 - f * 0.012, z * 2.4],
        { rot: [0.5, 0, 0], tilt: 0 });
    }
    part(G.box(0.015, 0.035, 0.015), M.joint, [ax - s * 0.01, 0.905, 0.034], [s * 0.3, -0.28, 0.12], { rot: [0.7, 0, s * 0.35], tilt: 0 }); // thumb
    part(G.box(0.014, 0.032, 0.014), M.shell, [ax - s * 0.016, 0.88, 0.052], [s * 0.3, -0.33, 0.14], { rot: [1.1, 0, s * 0.35], tilt: 0 });

    // -- leg --
    const lx = s * 0.155;
    part(G.drum(0.065, 0.09), M.joint, [lx, 0.97, 0], [s * 0.1, -0.1, 0], { rot: Z, tilt: 0 });      // hip drum
    part(G.rod(0.045, 0.41), M.frame, [lx, 0.765, 0], [s * 0.06, -0.14, 0], { tilt: 0 });              // thigh bone
    part(G.capsule(0.086, 0.21), M.shell, [lx + s * 0.005, 0.77, 0.012], [s * 0.3, -0.14, 0.1], { tilt: s * 0.26 }); // thigh shell
    part(G.drum(0.07, 0.12), M.joint, [lx, 0.55, 0], [s * 0.2, -0.2, 0], { rot: Z, tilt: 0 });        // knee drum
    part(G.rod(0.04, 0.43), M.frame, [lx, 0.335, 0], [s * 0.06, -0.26, 0], { tilt: 0 });               // shin bone
    part(G.capsule(0.07, 0.23), M.shell, [lx + s * 0.003, 0.33, 0.012], [s * 0.3, -0.27, 0.1], { tilt: s * -0.26 }); // shin shell
    part(G.drum(0.05, 0.1), M.joint, [lx, 0.11, 0], [s * 0.2, -0.31, 0], { rot: Z, tilt: 0 });        // ankle drum
    part(G.box(0.12, 0.055, 0.26), M.shell, [lx, 0.055, 0.045], [s * 0.14, -0.36, 0.06], { tilt: 0 });  // foot shell
    part(G.box(0.125, 0.025, 0.27), M.frame, [lx, 0.0125, 0.045], [s * 0.14, -0.41, 0.06], { tilt: 0 }); // sole
  }

  // ---- posing -------------------------------------------------------------------
  const q = new THREE.Quaternion();
  function pose(t, dir) {
    const p = turnProgress(t);
    body.rotation.y = dir * THREE.MathUtils.lerp(-YAW, YAW, p);
    head.rotation.y = dir * THREE.MathUtils.lerp(-HEAD_LEAD, HEAD_LEAD, smooth(0.1, 4.2, t)) * (1 - p * 0.3) ;
    const e = spread(t);
    // the whole figure lifts a touch while it is apart, as if floating
    body.position.y = 0.02 * e;
    for (const m of parts) {
      const u = m.userData;
      const k = smooth(u.delay, u.delay + 0.68, e);
      m.position.copy(u.home).addScaledVector(u.out, k);
      if (u.tilt) {
        q.setFromAxisAngle(u.axis, u.tilt * k);
        m.quaternion.copy(u.baseQ).premultiply(q);
      }
    }
  }

  // ---- sizing -------------------------------------------------------------------
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(HALF_H / tanH, HALF_W / (tanH * aspect));
    camera.position.set(0, LOOK_AT.y + 0.38, dist);
    camera.lookAt(LOOK_AT);
    camera.updateProjectionMatrix();
    return true;
  }

  // ---- loop ---------------------------------------------------------------------
  let dir = 1, t0 = 0, playing = false, visible = true, raf = 0, sized = false;

  const render = () => {
    if (!sized) sized = resize();
    if (sized) renderer.render(scene, camera);
  };
  const frame = (now) => {
    raf = 0;
    if (!playing || !visible) return;
    const t = Math.min((now - t0) / 1000, TURN);
    pose(t, dir);
    render();
    if (t < TURN) raf = requestAnimationFrame(frame);
    else playing = false; // hold the final pose
  };
  const schedule = () => { if (!raf && playing && visible) raf = requestAnimationFrame(frame); };

  const ro = new ResizeObserver(() => {
    sized = resize();
    if (sized && (!playing || !visible)) render();
  });
  ro.observe(canvas);
  const io = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) schedule();
  });
  io.observe(canvas);

  sized = resize();
  pose(0, 1);
  render();

  return {
    count: parts.length,
    turn(d) {
      dir = d < 0 ? -1 : 1;
      t0 = performance.now();
      playing = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      schedule();
    },
    stop() {
      playing = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
