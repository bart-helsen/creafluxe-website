// 3D view of the memory box for the configurator, built in the browser with
// three.js (assets/vendor/three, loaded through the import map on the page).
//
// The shapes follow the generator in product-tools/memory-box (same thickness,
// foot, legs, finger joints, lid parts), so the lid mechanism and the feet look
// like the real thing. It is a picture, not the cut file: the generator stays
// the source of truth.
//
// Axes: x = width (right), y = up, z = towards the viewer (front).
// Flat parts are drawn as 2D shapes in "top view" coordinates (x right,
// y towards the back) and lifted into place.

import * as THREE from "three";
import { OrbitControls } from "./../vendor/three/OrbitControls.js";

// Same numbers as product-tools/memory-box/generator/config.py
const T = 3, FOOT = 8, LEG_W = 26, ARCH_H = 4.5, FINGER_W = 10;
const THUMB = [34, 9], DIVIDER_DIP = 12;
const LID_OVERHANG = 4, LID_RADIUS = 6, LID_CLEAR = 0.5, LIP_W = 9;
const RAIL_IN = 4.5, SLIDE_PLAY = 0.4, SLIDE_PULL = 7;
const HINGE_INSET = 18, HINGE_KNUCKLE_H = 24, HINGE_PIN_D = 3, HINGE_RING = 3;

const BG = 0xf5f2ef;

// ------------------------------------------------------------------ textures

function woodCanvas(seed, base, w = 512, h = 512) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    const wave = Math.sin(y * 0.09 + seed) * 0.5 + Math.sin(y * 0.31 + seed * 2) * 0.3;
    const a = 0.025 + 0.04 * Math.pow(0.5 + 0.5 * Math.sin(y * 0.7 + wave * 3), 4);
    g.fillStyle = `rgba(150,100,55,${a.toFixed(3)})`;
    g.fillRect(0, y, w, 1);
  }
  return c;
}

function woodTexture(seed, base) {
  const t = new THREE.CanvasTexture(woodCanvas(seed, base));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 220, 1 / 220);          // UVs of the shapes are in mm
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function photoTexture() {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 220;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, 220);
  sky.addColorStop(0, "#c9d6dc"); sky.addColorStop(0.6, "#e8e2d6"); sky.addColorStop(1, "#b9b09c");
  g.fillStyle = sky; g.fillRect(0, 0, 320, 220);
  g.fillStyle = "rgba(90,80,64,.55)";
  g.font = "500 22px Manrope, Arial, sans-serif";
  g.textAlign = "center";
  g.fillText("jouw foto", 160, 118);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// -------------------------------------------------------------------- shapes

function roundedRect(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function rectPath(x0, y0, x1, y1, r = 0) {
  const p = r ? roundedRect(x0, y0, x1, y1, r) : new THREE.Path([
    new THREE.Vector2(x0, y0), new THREE.Vector2(x1, y0), new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y1),
  ]);
  return new THREE.Path(p.getPoints(6));
}

function polyShape(pts) {
  return new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
}

// Finger rows on the corners: the same rows for every wall so they interlock.
function fingerRows(height) {
  let n = Math.max(3, Math.round(height / FINGER_W));
  if (n % 2 === 0) n += 1;
  const rows = [];
  for (let k = 0; k < n; k++) rows.push([(k * height) / n, ((k + 1) * height) / n]);
  return rows;
}

/**
 * A wall as a 2D outline, x along the wall (0..L), y up (0..H).
 * full(end, y0, y1): does the wall reach the very end (x = 0 or L) on this row?
 * arch: cut the bracket-foot arch between the legs. notch: [width, depth] scoop in the top.
 */
function wallShape(L, H, rows, full, { arch = false, notch = null } = {}) {
  const pts = [];
  const endX = (end, isFull) => (end === 0 ? (isFull ? 0 : T) : isFull ? L : L - T);
  // bottom, left to right (with the arch)
  pts.push([endX(0, full(0, rows[0][0], rows[0][1])), 0]);
  if (arch && L - 2 * LEG_W > 30) {
    const n = 32;
    pts.push([LEG_W, 0]);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([LEG_W + t * (L - 2 * LEG_W), ARCH_H * Math.pow(Math.sin(Math.PI * t), 0.35)]);
    }
    pts.push([L - LEG_W, 0]);
  }
  // right end, bottom to top
  for (const [y0, y1] of rows) {
    if (y0 >= H) break;
    const x = endX(1, full(1, y0, y1));
    pts.push([x, y0], [x, Math.min(y1, H)]);
  }
  // top, right to left (with the thumb scoop)
  if (notch) {
    const [nw, nd] = notch, cx = L / 2, n = 16;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      pts.push([cx + (nw / 2) * Math.cos(a), H - nd * Math.sin(a)]);
    }
  }
  // left end, top to bottom
  for (let i = rows.length - 1; i >= 0; i--) {
    const [y0, y1] = rows[i];
    if (y0 >= H) continue;
    const x = endX(0, full(0, y0, y1));
    pts.push([x, Math.min(y1, H)], [x, y0]);
  }
  return polyShape(pts);
}

// ---------------------------------------------------------------------- view

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 5, 10000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minPolarAngle = 0.05;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8cbb8, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const mats = {
    wall: new THREE.MeshStandardMaterial({ map: woodTexture(3, "#e3c79c"), roughness: 0.75 }),
    plate: new THREE.MeshStandardMaterial({ map: woodTexture(7, "#ecd4ad"), roughness: 0.7 }),
    edge: new THREE.MeshStandardMaterial({ color: 0x7a4f2c, roughness: 0.9 }),    // laser-burnt edges
    photo: new THREE.MeshStandardMaterial({ map: photoTexture(), roughness: 0.5 }),
    rod: new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 0.6, roughness: 0.35 }),
    engraving: new THREE.MeshStandardMaterial({ roughness: 0.7, transparent: false }),
  };

  let box = null;          // THREE.Group of the current box
  let lid = null;          // { group, open(t) }
  let openTarget = 0, openNow = 0;
  let camAnim = null;
  let running = false;
  let lidTexture = null;
  let fitted = false;

  function part(shape, depth, mat, place) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
    const m = new THREE.Mesh(g, [mat, mats.edge]);
    m.castShadow = m.receiveShadow = true;
    place(m);
    return m;
  }

  // A flat part lying down: shape in top-view coords, bottom at height y.
  const flat = (shape, y, mat = mats.plate, depth = T) =>
    part(shape, depth, mat, (m) => { m.rotation.x = -Math.PI / 2; m.position.y = y; });

  function build(o) {
    const g = new THREE.Group();
    const W = o.inner.w, D = o.inner.d, H = o.inner.h;
    const Wo = W + 2 * T, Do = D + 2 * T;
    const Hw = FOOT + T + H;                       // wall height
    const slide = o.lid === "slide";
    const frontH = slide ? Hw - T - SLIDE_PLAY : Hw;
    // Rows up to the (lower) front wall; above it the sides and back join on one more row.
    const rows = fingerRows(frontH);
    if (frontH < Hw) rows.push([frontH, Hw]);
    const arch = o.feet === "arch";
    const notch = slide ? null : THUMB;

    // Front and back reach the corners on even rows, the sides on odd rows.
    const fb = (end, y0) => rows.findIndex((r) => r[0] === y0) % 2 === 0;
    const side = (end, y0) => {
      const k = rows.findIndex((r) => r[0] === y0);
      if (end === 0 && y0 >= frontH - 0.01) return true;   // above a low front wall
      return k % 2 === 1;
    };
    const front = wallShape(Wo, frontH, rows, fb, { arch, notch });
    const back = wallShape(Wo, Hw, rows, fb, { arch });
    g.add(part(front, T, mats.wall, (m) => m.position.set(-Wo / 2, 0, Do / 2 - T)));
    g.add(part(back, T, mats.wall, (m) => m.position.set(-Wo / 2, 0, -Do / 2)));
    // side wall: x = 0 is the front end
    const sideShape = wallShape(Do, Hw, rows, side, { arch });
    for (const x of [-Wo / 2, Wo / 2 - T]) {
      g.add(part(sideShape, T, mats.wall, (m) => { m.rotation.y = Math.PI / 2; m.position.set(x, 0, Do / 2); }));
    }

    // floor
    g.add(flat(rectShapeTop(-W / 2, -D / 2, W / 2, D / 2), FOOT));

    // dividers
    const liner = slide ? T : 0;
    const Wu = W - 2 * liner;
    const crossing = o.dividers.length > 0 && o.dividersY.length > 0;
    const hdiv = Math.max(20, H - 12);
    const dip = crossing ? 0 : DIVIDER_DIP;
    const divShape = (L) => {
      const pts = [[0, 0], [L, 0], [L, hdiv]];
      if (dip) for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI; pts.push([L / 2 + dip * Math.cos(a), hdiv - dip * Math.sin(a)]); }
      pts.push([0, hdiv]);
      return polyShape(pts);
    };
    for (const f of o.dividers) {
      const x = -Wu / 2 + f * Wu - T / 2;
      g.add(part(divShape(D), T, mats.plate, (m) => { m.rotation.y = Math.PI / 2; m.position.set(x, FOOT + T, D / 2); }));
    }
    for (const f of o.dividersY) {
      const z = D / 2 - f * D - T / 2;
      g.add(part(divShape(Wu), T, mats.plate, (m) => m.position.set(-Wu / 2, FOOT + T, z)));
    }

    // lid
    const lg = new THREE.Group();
    let holder = lg;                             // what moves when the lid opens
    let open;
    let texRect;                                 // texture area in top-view coords
    if (o.lid === "slide") {
      // liners inside the side walls, the lid on them, the U-shaped rail on top
      for (const x of [-W / 2, W / 2 - T]) {
        const ls = polyShape([[0, 0], [D, 0], [D, frontH - FOOT - T], [0, frontH - FOOT - T]]);
        g.add(part(ls, T, mats.plate, (m) => { m.rotation.y = Math.PI / 2; m.position.set(x, FOOT + T, D / 2); }));
      }
      const rail = polyShape([
        [-Wo / 2, -Do / 2], [-Wo / 2 + T + RAIL_IN, -Do / 2], [-Wo / 2 + T + RAIL_IN, Do / 2 - T - RAIL_IN],
        [Wo / 2 - T - RAIL_IN, Do / 2 - T - RAIL_IN], [Wo / 2 - T - RAIL_IN, -Do / 2], [Wo / 2, -Do / 2],
        [Wo / 2, Do / 2], [-Wo / 2, Do / 2],
      ]);
      g.add(flat(rail, Hw));
      const lx = W / 2 - LID_CLEAR, back = D / 2 - LID_CLEAR, frontEdge = -Do / 2;
      const lidPts = [[-lx, frontEdge]];
      for (let i = 0; i <= 12; i++) { const a = Math.PI - (i / 12) * Math.PI; lidPts.push([SLIDE_PULL * Math.cos(a), frontEdge + SLIDE_PULL * Math.sin(a)]); }
      lidPts.push([lx, frontEdge], [lx, back], [-lx, back]);
      const lidShape = polyShape(lidPts);
      lg.add(flat(lidShape, frontH + SLIDE_PLAY / 2));
      lg.userData.top = { shape: lidShape, y: frontH + SLIDE_PLAY / 2 + T };
      texRect = [-Wo / 2, -Do / 2, Wo / 2, Do / 2];
      const travel = D * 0.55;
      open = (t) => { lg.position.z = travel * t; };
    } else {
      const LW = Wo + 2 * LID_OVERHANG;
      const front = -Do / 2 - LID_OVERHANG;
      // hinge: the lid reaches back over the knuckles behind the back wall
      const ring = HINGE_PIN_D / 2 + HINGE_RING, behind = ring + 1;
      const backEdge = o.lid === "hinge" ? Do / 2 + behind + ring : Do / 2 + LID_OVERHANG;
      const lidShape = roundedRect(-LW / 2, front, LW / 2, backEdge, LID_RADIUS);
      const pw = o.photoWindow;
      let win = null;
      if (pw) {
        const LD = backEdge - front;
        const wy1 = backEdge - (LD - pw.h) * 0.35;
        win = [-pw.w / 2, wy1 - pw.h, pw.w / 2, wy1];
        lidShape.holes.push(rectPath(win[0], win[1], win[2], win[3], 4));
      }
      lg.add(flat(lidShape, Hw));
      lg.userData.top = { shape: lidShape, y: Hw + T };
      texRect = [-LW / 2, front, LW / 2, backEdge];

      if (o.lid === "lift") {
        // lip rings under the lid (the first one a solid panel behind a photo window)
        const ox = W / 2 - LID_CLEAR, oy = D / 2 - LID_CLEAR;
        for (let k = 0; k < 2; k++) {
          const ring = roundedRect(-ox, -oy, ox, oy, 2);
          if (!(pw && k === 0)) ring.holes.push(rectPath(-ox + LIP_W, -oy + LIP_W, ox - LIP_W, oy - LIP_W, 2));
          lg.add(flat(ring, Hw - (k + 1) * T));
        }
        if (win) {
          const photo = new THREE.Mesh(new THREE.PlaneGeometry(win[2] - win[0] + 6, win[3] - win[1] + 6), mats.photo);
          photo.rotation.x = -Math.PI / 2;
          photo.position.set(0, Hw + 0.05, -(win[1] + win[3]) / 2);
          lg.add(photo);
        }
        // lifted and tilted towards the viewer, around the middle of the lid
        const pivot = new THREE.Group();
        pivot.position.set(0, Hw, 0);
        lg.position.set(0, -Hw, 0);
        pivot.add(lg);
        holder = pivot;
        open = (t) => {
          const e = t * t * (3 - 2 * t);
          pivot.position.set(0, Hw + 60 * e, 30 * e);
          pivot.rotation.x = THREE.MathUtils.degToRad(22) * e;
        };
      } else {
        // hinge: box knuckles behind the back wall (tabs through it), lid knuckles under the
        // back of the lid, a rod through all four.
        // Knuckle shapes are drawn in the side plane: u = distance behind the back wall, v = height.
        const pinY = Hw - ring - 0.5, pinZ = -Do / 2 - behind;
        const holeAt = (s) => {
          const hole = new THREE.Path();
          hole.absarc(behind, pinY, HINGE_PIN_D / 2 + 0.2, 0, Math.PI * 2, true);
          s.holes.push(hole);
          return s;
        };
        const sidePlate = (s, x) => part(s, T, mats.plate, (m) => { m.rotation.y = Math.PI / 2; m.position.set(x, 0, -Do / 2); });
        const xo = Wo / 2 - HINGE_INSET;
        for (const x of [-xo, xo - T]) {
          const s = new THREE.Shape();
          s.moveTo(-T, pinY - HINGE_KNUCKLE_H);
          s.lineTo(behind + ring, pinY - HINGE_KNUCKLE_H);
          s.lineTo(behind + ring, pinY);
          s.absarc(behind, pinY, ring, 0, Math.PI, false);       // round top over the rod
          s.lineTo(-T, pinY);
          g.add(sidePlate(holeAt(s), x));
        }
        for (const x of [-xo + T + 1, xo - 2 * T - 1]) {
          const s = new THREE.Shape();
          s.moveTo(0.5, Hw);
          s.lineTo(behind + ring, Hw);
          s.lineTo(behind + ring, pinY);
          s.absarc(behind, pinY, ring, 0, -Math.PI, true);       // round bottom under the rod
          s.lineTo(0.5, pinY);
          lg.add(sidePlate(holeAt(s), x));
        }
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(HINGE_PIN_D / 2, HINGE_PIN_D / 2, 2 * xo + 10, 16), mats.rod);
        rod.rotation.z = Math.PI / 2;
        rod.position.set(0, pinY, pinZ);
        rod.castShadow = true;
        g.add(rod);
        // turn around the rod
        const pivot = new THREE.Group();
        pivot.position.set(0, pinY, pinZ);
        lg.position.set(0, -pinY, -pinZ);
        pivot.add(lg);
        holder = pivot;
        open = (t) => { const e = t * t * (3 - 2 * t); pivot.rotation.x = -THREE.MathUtils.degToRad(105) * e; };
      }
    }
    g.add(holder);

    // engraving: a thin layer on top of the lid with the drawing from the 2D preview
    const top = lg.userData.top;
    const eg = new THREE.ShapeGeometry(top.shape, 8);
    const eng = new THREE.Mesh(eg, mats.engraving);
    eng.rotation.x = -Math.PI / 2;
    eng.position.y = top.y + 0.05;
    eng.receiveShadow = true;
    lg.add(eng);
    lg.userData.texRect = texRect;

    // how high the open lid reaches, so the camera keeps it in view
    const reach = o.lid === "hinge" ? Hw + Do * 0.85 : o.lid === "lift" ? Hw + 75 : Hw;
    return { group: g, lidGroup: lg, open, size: { Wo, Do, Hw, reach }, key: [W, D, H, o.lid].join("x") };
  }

  function rectShapeTop(x0, y0, x1, y1) {
    return polyShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  }

  function applyLidTexture() {
    if (!lid) return;
    const r = lid.lidGroup.userData.texRect;
    if (lidTexture) {
      lidTexture.repeat.set(1 / (r[2] - r[0]), 1 / (r[3] - r[1]));
      lidTexture.offset.set(-r[0] / (r[2] - r[0]), -r[1] / (r[3] - r[1]));
      mats.engraving.map = lidTexture;
      mats.engraving.color.set(0xffffff);
    } else {
      mats.engraving.map = mats.plate.map;
      mats.engraving.color.set(0xffffff);
    }
    mats.engraving.needsUpdate = true;
  }

  function disposeGroup(g) {
    g.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
  }

  function frame(size, keepView) {
    const max = Math.max(size.Wo, size.Do, size.reach * 1.3);
    const target = new THREE.Vector3(0, size.reach * 0.42, 0);
    const dir = keepView && fitted
      ? camera.position.clone().sub(controls.target).normalize()
      : new THREE.Vector3(0.75, 0.62, 1.05).normalize();
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(dir, max * 3.0);
    controls.minDistance = max * 1.4;
    controls.maxDistance = max * 6;
    sun.position.set(-max * 1.2, max * 2.6, max * 1.4);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -max * 1.4; sc.right = sc.top = max * 1.4;
    sc.near = 1; sc.far = max * 8;
    sc.updateProjectionMatrix();
    fitted = true;
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    if (Math.abs(openTarget - openNow) > 0.001) {
      openNow += Math.sign(openTarget - openNow) * Math.min(Math.abs(openTarget - openNow), 0.025);
      if (lid) lid.open(openNow);
    }
    if (camAnim) {
      camAnim.t = Math.min(1, camAnim.t + 0.03);
      const e = camAnim.t * camAnim.t * (3 - 2 * camAnim.t);
      const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      s.phi = camAnim.from + (camAnim.to - camAnim.from) * e;
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));
      if (camAnim.t >= 1) camAnim = null;
    }
    controls.update();
    renderer.render(scene, camera);
  }

  let lastSize = "";
  return {
    /** Rebuild the box for a configuration's options. */
    update(o) {
      if (box) { scene.remove(box.group); disposeGroup(box.group); }
      box = lid = build(o);
      scene.add(box.group);
      lid.open(openNow);
      applyLidTexture();
      // re-frame when the size or lid changes, keeping the angle the visitor turned to
      if (box.key !== lastSize) frame(box.size, !!lastSize);
      lastSize = box.key;
    },
    /** Canvas with the engraving (transparent elsewhere), covering the lid's texture area. */
    setLidCanvas(engraving) {
      const c = document.createElement("canvas");
      c.width = engraving.width; c.height = engraving.height;
      const g = c.getContext("2d");
      // grain at about the same scale as the other plates, then the engraving burnt into it
      g.drawImage(woodCanvas(7, "#ecd4ad", Math.ceil(c.width / 2), Math.ceil(c.height / 2)), 0, 0, c.width, c.height);
      g.globalCompositeOperation = "multiply";
      g.drawImage(engraving, 0, 0);
      g.drawImage(engraving, 0, 0);          // twice: laser engraving reads darker than the drawing
      if (lidTexture) lidTexture.dispose();
      lidTexture = new THREE.CanvasTexture(c);
      lidTexture.colorSpace = THREE.SRGBColorSpace;
      lidTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      applyLidTexture();
    },
    setOpen(v) { openTarget = v ? 1 : 0; },
    isOpen() { return openTarget === 1; },
    /** Look from low down (to show the feet) or back to the normal angle. */
    lookLow(low) {
      const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      camAnim = { t: 0, from: s.phi, to: low ? Math.PI * 0.46 : Math.PI * 0.3 };
    },
    start() { if (!running) { running = true; resize(); tick(); } },
    stop() { running = false; },
  };
}
