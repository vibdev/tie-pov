import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './style.css';
import { KNOTS } from './knots/catalog';
import type { KnotDef, Program, HandTarget } from './knots/types';
import { Choreo, type Move } from './tie/motion';
import { TieSim } from './tie/sim';
import { Ribbon } from './tie/ribbon';
import { FABRICS, fabricMaterial, tieUniforms } from './tie/fabric';
import { buildBody, makeShirtMaterial, skinMaterial } from './scene/body';
import { buildHead } from './scene/head';
import { LEFT } from './scene/bodyShape';
import { initLook } from './looks';

// ---------- renderer / scene ----------
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a2521');
scene.fog = new THREE.Fog('#2a2521', 1.6, 4.2);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 20);

const hemi = new THREE.HemisphereLight('#fff4e6', '#4a3c30', 1.1);
scene.add(hemi);
const key = new THREE.DirectionalLight('#fff1dc', 2.4);
key.position.set(0.5, 1.6, 1.3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -0.45;
key.shadow.camera.right = 0.45;
key.shadow.camera.top = 0.45;
key.shadow.camera.bottom = -0.9;
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 4;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.0015;
key.shadow.radius = 3;
key.target.position.set(0, -0.2, 0.05);
scene.add(key, key.target);
const fill = new THREE.DirectionalLight('#c9dcff', 0.6);
fill.position.set(-1.2, 0.4, 0.8);
scene.add(fill);

const world = new THREE.Group();
scene.add(world);
const shirt = makeShirtMaterial();
const bodyGroup = buildBody(shirt);
const neck = bodyGroup.getObjectByName('neck')!;
world.add(bodyGroup);
const head = buildHead(skinMaterial);
world.add(head);

// floor
{
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 4; x++) {
      const l = 36 + Math.random() * 10;
      g.fillStyle = `hsl(26, 22%, ${l * 0.55}%)`;
      g.fillRect(x * 64 + (y % 2) * 32 - 32, y * 32, 64, 31);
      g.fillRect(x * 64 + (y % 2) * 32 + 224, y * 32, 64, 31);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.47;
  floor.receiveShadow = true;
  world.add(floor);
}

const tieGroup = new THREE.Group();
world.add(tieGroup);

// ---------- guide (shows where the wide end goes next) ----------
const guideUniforms = { time: { value: 0 }, color: { value: new THREE.Color('#ffd34d') }, opacity: { value: 1 } };
const guideVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const guideFrag = `uniform float time; uniform vec3 color; uniform float opacity; varying vec2 vUv;
  void main(){
    float f = fract(vUv.x * 9.0 - time * 1.2);
    float a = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.45, 0.6, f));
    float fade = smoothstep(0.0, 0.08, vUv.x);
    gl_FragColor = vec4(color, opacity * (0.3 + 0.7 * a) * fade);
  }`;
const guideMatFront = new THREE.ShaderMaterial({ uniforms: guideUniforms, vertexShader: guideVert, fragmentShader: guideFrag, transparent: true, depthWrite: false });
const guideMatXray = new THREE.ShaderMaterial({
  uniforms: { ...guideUniforms, opacity: { value: 0.28 } },
  vertexShader: guideVert, fragmentShader: guideFrag, transparent: true, depthWrite: false, depthTest: false,
});
const guide = new THREE.Group();
guide.renderOrder = 10;
tieGroup.add(guide);
const arrowMat = new THREE.MeshBasicMaterial({ color: '#ffd34d', transparent: true, depthTest: false, opacity: 0.9 });
const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.016, 12), arrowMat);
arrow.renderOrder = 11;

// ---------- state ----------
let def: KnotDef = KNOTS[0];
let program!: Program;
let sim!: TieSim;
let choreo!: Choreo;
let ribbon: Ribbon | null = null;
let fabric = FABRICS[0];
let tieMat = fabricMaterial(fabric, renderer.capabilities.getMaxAnisotropy());
let step = 0;
/** one demonstrated move into step `to`; `wait` is a short lead-in so the learner reads the card and sees the path first */
type Anim = { from: number; to: number; t: number; wait: number; dur: number; move: Move };
let anim: Anim | null = null;
/** auto-advance through the remaining steps */
let playing = false;
/** the current move is frozen mid-way */
let paused = false;
let pausedWasPlaying = false;
let holdTimer = 0;
let speed = 1;
let lefty = false;
let showNotation = false;
let showGuide = true;
/** show the current move again and again until the learner goes on (hands are busy with a real tie) */
let loop = false;
let view: 'pov' | 'mirror' | 'orbit' = 'pov';

// ---------- knot thumbnails for the picker ----------
// Each finished knot is tied by the real engine and photographed from the mirror viewpoint, in the
// current fabric. One per frame, drawn to the canvas just before the main render so nothing flickers.
const THUMB = 112;
const thumbs = new Map<string, string>();
const thumbKey = (k: KnotDef) => `${k.id}|${fabric.id}|${lefty}`;
const thumbCam = new THREE.PerspectiveCamera(26, 1, 0.01, 10);
const thumbCanvas = document.createElement('canvas');
thumbCanvas.width = thumbCanvas.height = THUMB;
const thumbCtx = thumbCanvas.getContext('2d')!;
let thumbQueue: KnotDef[] = [];
function queueThumbs() { thumbQueue = KNOTS.filter((k) => !thumbs.has(thumbKey(k))); }

function renderThumb(k: KnotDef) {
  const prog = k.build(lefty);
  const sm = new TieSim(prog);
  const split = tieUniforms.uSplit.value;
  tieUniforms.uSplit.value = prog.splitS ?? prog.total / 2;
  new Choreo(prog, sm).settle(prog.steps.length - 1, 200);
  const rb = new Ribbon(sm, prog.width, tieMat);
  for (let i = 0; i < 16; i++) rb.update();

  const hidden: [THREE.Object3D, boolean][] = [ribbon!.mesh, guide, head, neck].map((o) => [o, o.visible]);
  ribbon!.mesh.visible = guide.visible = false;
  head.visible = neck.visible = true;
  const sx = world.scale.x;
  world.scale.x = -1; // as seen in a mirror
  tieGroup.add(rb.mesh);
  world.updateMatrixWorld(true);

  const kc = tieGroup.localToWorld(prog.knotCenter.clone());
  const W = renderer.domElement.width, H = renderer.domElement.height;
  thumbCam.aspect = W / H;
  // frame a square of half-height `r` around the knot, whatever the canvas shape
  const r = k.kind === 'bow' ? 0.08 : 0.082;
  const sq = Math.min(W, H);
  const halfV = r * (H / sq);
  thumbCam.fov = (2 * Math.atan(halfV / 0.32) * 180) / Math.PI;
  thumbCam.position.set(kc.x, kc.y + 0.012, kc.z + 0.32);
  thumbCam.lookAt(kc.x, kc.y - 0.012, kc.z);
  thumbCam.updateProjectionMatrix();
  renderer.render(scene, thumbCam);
  thumbCtx.drawImage(renderer.domElement, (W - sq) / 2, (H - sq) / 2, sq, sq, 0, 0, THUMB, THUMB);

  tieUniforms.uSplit.value = split;
  tieGroup.remove(rb.mesh);
  rb.dispose();
  world.scale.x = sx;
  for (const [o, v] of hidden) o.visible = v;
  const url = thumbCanvas.toDataURL('image/jpeg', 0.85);
  thumbs.set(thumbKey(k), url);
  const img = document.querySelector<HTMLImageElement>(`#knot-list img[data-id="${k.id}"]`);
  if (img) img.src = url;
}

function loadKnot(d: KnotDef, keepStep = false) {
  def = d;
  program = d.build(lefty);
  if (ribbon) {
    tieGroup.remove(ribbon.mesh);
    ribbon.dispose();
  }
  sim = new TieSim(program);
  choreo = new Choreo(program, sim);
  tieUniforms.uSplit.value = program.splitS ?? program.total / 2;
  ribbon = new Ribbon(sim, program.width, tieMat);
  tieGroup.add(ribbon.mesh);
  step = keepStep ? Math.min(step, program.steps.length - 1) : 0;
  anim = null;
  playing = false;
  paused = false;
  settleAt(step, 180);
  rebuildGuide(step);
  renderUI();
  renderKnotList();
}

/** put the tie straight into a step's finished pose (no demonstration) */
function settleAt(i: number, iters = 90) {
  step = i;
  choreo.settle(i, iters);
}

/** demonstrate the move into step `to`, starting from wherever the tie is now */
function startMove(to: number) {
  const move = choreo.begin(step, to);
  anim = { from: step, to, t: 0, wait: 0.6 / speed, dur: move.dur / speed, move };
  paused = false;
  holdTimer = 0;
  rebuildGuide(to);
  renderUI(to);
}

/**
 * Navigate to a step. Every step's card, path guide and animation describe the same move:
 * arriving at step N demonstrates move N. Jumps settle instantly on N-1, then demonstrate N.
 */
function goTo(target: number, animate = true) {
  target = Math.max(0, Math.min(program.steps.length - 1, target));
  if (anim) { const to = anim.to; anim = null; settleAt(to, 20); }
  paused = false;
  holdTimer = 0;
  if (!animate) {
    settleAt(target);
    rebuildGuide(target);
    renderUI();
    return;
  }
  if (target === 0) { startMove(0); return; }
  if (target !== step + 1) settleAt(target - 1);
  startMove(target);
}

function finishAnim() {
  if (!anim) return;
  step = anim.to;
  anim = null;
  renderUI();
}

const shownStep = () => (anim ? anim.to : step);

/** dashed path for the route the active end travels in step i (only for 'follow the path' moves) */
function rebuildGuide(i: number) {
  for (const c of [...guide.children]) {
    guide.remove(c);
    if (c instanceof THREE.Mesh && c !== arrow) c.geometry.dispose();
  }
  const mk = program.steps[i].move;
  if (i < 1 || (mk !== 'lay' && mk !== 'thread')) {
    guide.visible = false;
    return;
  }
  const path = choreo.paths[i];
  const s0 = path.ctrlArc[program.steps[i - 1].state.cps.length - 1];
  const s1 = choreo.routeLen[i];
  const pts: THREE.Vector3[] = [];
  const tmp = new THREE.Vector3();
  const n = Math.max(8, Math.ceil((s1 - s0) / 0.004));
  for (let i = 0; i <= n; i++) {
    const p = new THREE.Vector3();
    path.sample(s0 + ((s1 - s0) * i) / n, p, tmp);
    pts.push(p);
  }
  // lift the guide slightly off the fabric toward the viewer side
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, n * 2, 0.0017, 8, false);
  const m1 = new THREE.Mesh(tube, guideMatFront);
  const m2 = new THREE.Mesh(tube, guideMatXray);
  m1.renderOrder = 10;
  m2.renderOrder = 9;
  guide.add(m2, m1, arrow);
  const end = pts[pts.length - 1];
  const dir = new THREE.Vector3().subVectors(end, pts[pts.length - 3]).normalize();
  arrow.position.copy(end).addScaledVector(dir, 0.004);
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  guide.visible = showGuide;
}

function updateTie(dt: number) {
  if (anim && paused) return; // freeze everything: held fabric and free ends
  let handState = program.steps[step].state;
  sim.beginFrame();
  if (anim) {
    if (anim.wait > 0) anim.wait -= dt;
    else anim.t += dt / anim.dur;
    anim.move.apply(Math.min(1, Math.max(0, anim.t)));
    handState = program.steps[anim.to].state;
    if (anim.t >= 1) finishAnim();
  } else {
    choreo.pose(step);
    if (playing) {
      holdTimer += dt;
      if (holdTimer > 1.4 / speed) {
        if (step < program.steps.length - 1) goTo(step + 1);
        else { playing = false; renderUI(); }
      }
    } else if (loop && step > 0) {
      holdTimer += dt;
      if (holdTimer > 2.2 / speed) goTo(step);
    }
  }
  sim.step(dt);
  ribbon!.update();

  const resolve = (h: HandTarget, which: 'right' | 'left'): THREE.Vector3 | null => {
    if (!h) return null;
    if (h === 'grip') {
      const p = sim.pos[sim.gripIndex].clone();
      return p.add(new THREE.Vector3(0, 0, 0.004));
    }
    if (h === 'knot') {
      const k = program.knotCenter;
      return new THREE.Vector3(k.x + (which === 'left' ? LEFT : -LEFT) * 0.006, k.y - 0.045, k.z + 0.02);
    }
    if (h === 'narrow') {
      // the narrow blade, a hand's width below the knot (it hangs behind the wide blade)
      const k = program.knotCenter;
      let best = 0, bd = Infinity;
      for (let i = 0; i < sim.kinStart; i++) {
        const d = Math.abs(sim.pos[i].y - (k.y - 0.16));
        if (d < bd) { bd = d; best = i; }
      }
      return sim.pos[best].clone().add(new THREE.Vector3(0, 0, 0.012));
    }
    return h.clone();
  };
  const rt = resolve(handState.right, 'right');
  const lt = resolve(handState.left, 'left');
  // a small marker shows where each hand should be holding
  placeMarker(grabMarkers[0], rt, handState.right === 'grip', dt);
  placeMarker(grabMarkers[1], lt, handState.left === 'grip', dt);
}

// ---------- grab markers: where your hands should be holding ----------
function markerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(32, 32, 24, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(32, 32, 8, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const markerTex = markerTexture();
const grabMarkers = [0, 1].map(() => {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex, depthTest: false, transparent: true, opacity: 0 }));
  m.renderOrder = 20;
  m.scale.setScalar(0.014);
  tieGroup.add(m);
  return m;
});
const GRAB = new THREE.Color('#ffd34d');
const HOLD = new THREE.Color('#ffffff');
function placeMarker(m: THREE.Sprite, at: THREE.Vector3 | null, active: boolean, dt: number) {
  const mat = m.material;
  const want = at ? (active ? 0.95 : 0.7) : 0;
  mat.opacity += (want - mat.opacity) * Math.min(1, dt * 8);
  m.visible = mat.opacity > 0.02;
  if (!at) return;
  if (mat.opacity < 0.05) m.position.copy(at);
  else m.position.lerp(at, Math.min(1, dt * 14));
  mat.color.copy(active ? GRAB : HOLD);
  const pulse = active ? 1 + 0.12 * Math.sin(clock * 6) : 1;
  m.scale.setScalar((active ? 0.015 : 0.012) * pulse);
}

// ---------- cameras ----------
const eye = new THREE.Vector3(0, 0.13, 0.15);
let yaw = 0;
let pitch = -1.86;
/** user zoom, as offsets from a default that fits the whole knot in the free viewport */
let povZoom = 0;
let mirrorZoom = 0;
/** half-width (m) of the working area the learner must see: bow loops are wider than a necktie knot */
/** share of the window's width that is free for the picture (the dock sits beside it in short, wide windows) */
let freeW = 1;
const fitHalfWidth = () => (def.kind === 'bow' ? 0.115 : 0.09);
function fitPovFov() {
  const dist = eye.distanceTo(program.knotCenter);
  const tanH = fitHalfWidth() / dist;
  // vertical fov whose horizontal extent covers the knot; the free area is what is actually visible
  const v = (2 * Math.atan(tanH / (camera.aspect * freeW)) * 180) / Math.PI;
  return Math.max(50, Math.min(120, v)); // portrait phones need a tall vertical fov for a modest horizontal one
}
function fitMirrorDist() {
  const tanH = Math.tan((34 / 2) * Math.PI / 180) * camera.aspect * freeW;
  return Math.max(0.62, (fitHalfWidth() + 0.035) / tanH + 0.09);
}
const povFov = () => Math.max(24, Math.min(125, fitPovFov() + povZoom));
const mirrorDist = () => Math.max(0.3, Math.min(1.8, fitMirrorDist() + mirrorZoom));
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, -0.08, 0.09);
controls.enableDamping = true;
controls.minDistance = 0.15;
controls.maxDistance = 2.5;
controls.enabled = false;

function setView(v: typeof view) {
  view = v;
  document.body.classList.remove('view-pov', 'view-mirror', 'view-orbit');
  document.body.classList.add(`view-${v}`);
  document.querySelectorAll('#view-switch button').forEach((b) => {
    const on = (b as HTMLElement).dataset.view === v;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (document.getElementById('hint')) showHint();
  world.scale.x = v === 'mirror' ? -1 : 1;
  controls.enabled = v === 'orbit';
  syncPip();
  frameView();
  head.visible = v !== 'pov';
  neck.visible = v !== 'pov';
  if (v === 'orbit') {
    camera.position.set(0.32, 0.12, 0.6);
    camera.fov = 40;
    controls.target.set(0, -0.08, 0.09);
  }
  camera.updateProjectionMatrix();
}

const HINTS: Record<'pov' | 'mirror' | 'orbit', string> = {
  pov: 'Your own eyes · drag to look around · scroll or pinch to zoom · C re-centres',
  mirror: 'Like a bathroom mirror · your left hand appears on the left · scroll or pinch to zoom',
  orbit: 'Free camera · drag to orbit · right-drag to pan · scroll or pinch to zoom',
};
const HINTS_SHORT: Record<'pov' | 'mirror' | 'orbit', string> = {
  pov: 'Your own eyes · drag to look · pinch to zoom',
  mirror: 'Mirror · your left hand is on the left',
  orbit: 'Free camera · drag to orbit · pinch to zoom',
};
let hintTimer = 0;
function showHint() {
  const h = document.getElementById('hint')!;
  h.textContent = window.innerWidth <= 700 ? HINTS_SHORT[view] : HINTS[view];
  h.classList.remove('gone');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => h.classList.add('gone'), 5000);
}

function recenter() {
  if (view === 'pov') { yaw = 0; pitch = -1.86; povZoom = 0; }
  else if (view === 'mirror') mirrorZoom = 0;
  else { camera.position.set(0.32, 0.12, 0.6); controls.target.set(0, -0.08, 0.09); }
}
/** dir < 0 zooms in */
function zoom(dir: number, amount = 1) {
  if (view === 'pov') povZoom = Math.max(-40, Math.min(40, povZoom + dir * 6 * amount));
  else if (view === 'mirror') mirrorZoom = Math.max(-0.5, Math.min(0.8, mirrorZoom + dir * 0.09 * amount));
  else {
    const d = camera.position.clone().sub(controls.target);
    d.multiplyScalar(Math.pow(1.15, dir * amount));
    d.setLength(Math.max(controls.minDistance, Math.min(controls.maxDistance, d.length())));
    camera.position.copy(controls.target).add(d);
  }
}

// pointer input: one finger/mouse looks around (POV), two fingers pinch-zoom (all views)
const pointers = new Map<number, { x: number; y: number }>();
let pinchDist = 0;
let lastX = 0, lastY = 0;
const pinchSpan = () => {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) pinchDist = pinchSpan();
  lastX = e.clientX;
  lastY = e.clientY;
  document.getElementById('hint')!.classList.add('gone');
});
const endPointer = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  pinchDist = 0;
  // continue looking from the surviving finger, not from where it was before the pinch
  const rest = [...pointers.values()][0];
  if (rest) { lastX = rest.x; lastY = rest.y; }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {
    const d = pinchSpan();
    if (pinchDist > 0 && view !== 'orbit') zoom(Math.sign(pinchDist - d), Math.abs(pinchDist - d) / 40);
    pinchDist = d;
    return;
  }
  if (view !== 'pov') return;
  yaw -= (e.clientX - lastX) * 0.0035;
  pitch -= (e.clientY - lastY) * 0.0035;
  yaw = Math.max(-1.1, Math.min(1.1, yaw));
  pitch = Math.max(-2.05, Math.min(-0.35, pitch));
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  if (view !== 'orbit') zoom(Math.sign(e.deltaY), Math.min(3, Math.abs(e.deltaY) / 200));
}, { passive: true });
document.getElementById('btn-center')!.onclick = recenter;
document.getElementById('btn-zin')!.onclick = () => zoom(-1);
document.getElementById('btn-zout')!.onclick = () => zoom(1);

let clock = 0;
function updateCamera(dt: number) {
  if (view === 'pov') {
    const breathe = Math.sin(clock * 1.25) * 0.0025;
    camera.position.set(eye.x, eye.y + breathe, eye.z + breathe * 0.4);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camera.up.set(0, 0.5, 1).normalize();
    camera.lookAt(camera.position.clone().add(dir));
    camera.fov += (povFov() - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  } else if (view === 'mirror') {
    camera.up.set(0, 1, 0);
    camera.position.set(0, -0.04, mirrorDist());
    camera.lookAt(0, -0.075, 0.08);
    camera.fov += (34 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  } else {
    camera.up.set(0, 1, 0);
    controls.update();
  }
}

// ---------- UI ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function setKnotMenu(open: boolean) {
  $('knots').hidden = !open;
  $('knot-btn').setAttribute('aria-expanded', String(open));
  if (open) {
    const cur = $('knots').querySelector<HTMLElement>('button.on');
    cur?.scrollIntoView({ block: 'nearest' });
    cur?.focus();
  } else if ($('knots').contains(document.activeElement)) $('knot-btn').focus();
}
$('knot-btn').addEventListener('click', (e) => { e.stopPropagation(); setKnotMenu($('knots').hidden === true); });
document.addEventListener('pointerdown', (e) => {
  if (!$('knots').hidden && !$('knots').contains(e.target as Node) && !$('knot-btn').contains(e.target as Node)) setKnotMenu(false);
});

function renderKnotList() {
  $('knot-btn-name').textContent = def.name;
  const ul = $('knot-list');
  ul.innerHTML = '';
  for (const k of KNOTS) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = k === def ? 'on' : '';
    if (k === def) b.setAttribute('aria-current', 'true');
    const dots = Array.from({ length: 5 }, (_, i) => `<i class="${i < k.difficulty ? 'f' : ''}"></i>`).join('');
    const level = ['', 'Beginner', 'Easy', 'Intermediate', 'Tricky', 'Advanced'][k.difficulty];
    const src = thumbs.get(thumbKey(k)) ?? '';
    b.innerHTML = `<img class="thumb" data-id="${k.id}" alt="" ${src ? `src="${src}"` : ''} />${k === KNOTS[0] ? '<span class="start">Start here</span>' : ''}<span class="nm">${k.name}</span><span class="sz">${k.size}</span>
      <span class="dots"><span aria-hidden="true">${dots}</span>${level} · ${k.symmetric ? 'symmetric' : 'asymmetric'}</span>
      <span class="blurb">${k.aka ? `<em>a.k.a. ${k.aka}.</em> ` : ''}${k.blurb}</span>`;
    b.onclick = () => {
      if (k !== def) loadKnot(k);
      setKnotMenu(false);
      $('knot-btn').focus(); // the clicked option was just rebuilt, so hand focus back to the opener
    };
    li.appendChild(b);
    ul.appendChild(li);
  }
}

/** Fink–Mao codes are written for right-handers; mirror them for left-handed mode */
const fmtCode = (c: string) => (lefty ? c.replace(/^[LR]/, (m) => (m === 'L' ? 'R' : 'L')) : c);
let announced = '';

function renderUI(shown = shownStep()) {
  const s = program.steps[shown];
  const last = program.steps.length - 1;
  $('step-num').textContent = `${shown + 1} / ${program.steps.length}`;
  $('step-num').setAttribute('aria-label', `Step ${shown + 1} of ${program.steps.length}`);
  document.body.classList.toggle('notation', showNotation);
  $('step-title').textContent = s.title;
  $('step-text').innerHTML = s.text;
  $('step-tip').textContent = s.tip ?? '';
  const seqEl = $('knot-seq');
  seqEl.innerHTML = '';
  if (def.sequence) {
    const codes = program.steps.map((st) => st.code).filter(Boolean) as string[];
    const doneCount = program.steps.slice(0, shown + 1).filter((st) => st.code).length;
    const curCode = s.code ? doneCount - 1 : -1;
    codes.forEach((c, i) => {
      const sp = document.createElement('span');
      sp.textContent = fmtCode(c);
      sp.className = i === curCode ? 'cur' : i < doneCount ? 'done' : '';
      seqEl.appendChild(sp);
    });
    seqEl.setAttribute('aria-label', `Sequence: ${codes.map(fmtCode).join(' ')}`);
  } else {
    seqEl.innerHTML = '<span>bow</span>';
  }
  // timeline buttons persist (rebuilt only when the knot changes) so keyboard focus survives
  const tl = $('timeline');
  if (tl.dataset.program !== def.id + lefty) {
    tl.dataset.program = def.id + lefty;
    tl.innerHTML = '';
    program.steps.forEach((_, i) => {
      const b = document.createElement('button');
      b.onclick = () => { playing = false; goTo(i); };
      tl.appendChild(b);
    });
  }
  program.steps.forEach((st, i) => {
    const b = tl.children[i] as HTMLButtonElement;
    b.dataset.label = `${i + 1}. ${st.title}`;
    b.setAttribute('aria-label', `Step ${i + 1}: ${st.title}`);
    if (i === shown) b.setAttribute('aria-current', 'step');
    else b.removeAttribute('aria-current');
    b.className = i === shown ? 'cur' : i < shown ? 'done' : '';
  });
  const play = $('btn-play');
  const moving = !!anim && !paused;
  play.textContent = playing || moving ? '❚❚' : '▶';
  play.setAttribute('aria-label', playing || moving ? 'Pause' : paused ? 'Resume' : shown === last ? 'Play all steps from the start' : 'Play the remaining steps');
  play.title = `${play.getAttribute('aria-label')} (space)`;
  ($('btn-prev') as HTMLButtonElement).disabled = shown === 0;
  const nextBtn = $('btn-next');
  nextBtn.textContent = shown === last ? '↺  Start over' : 'Next  ›';
  nextBtn.title = shown === last ? 'Back to the start (R)' : 'Next move (→)';
  ($('btn-replay') as HTMLButtonElement).disabled = shown === 0;
  const say = `Step ${shown + 1} of ${program.steps.length}: ${s.title}. ${s.text.replace(/<[^>]+>/g, '')}`;
  if (say !== announced) { announced = say; $('live').textContent = say; }
  frameView(); // the card's height can change with the text
}

function next() { playing = false; if (shownStep() >= program.steps.length - 1) restart(); else goTo(shownStep() + 1); }
function prev() { playing = false; goTo(shownStep() - 1); }
function replay() { playing = false; goTo(shownStep()); }
function restart() { playing = false; goTo(0, false); }
function keyNext() { if (shownStep() < program.steps.length - 1) next(); }
$('btn-next').onclick = next;
$('btn-prev').onclick = prev;
$('btn-replay').onclick = replay;
$('btn-play').onclick = togglePlay;
/** ▶ plays every remaining step; ❚❚ freezes the current move exactly where it is */
function togglePlay() {
  if (playing || (anim && !paused)) {
    pausedWasPlaying = playing;
    playing = false;
    paused = !!anim;
  } else if (anim && paused) {
    paused = false;
    playing = pausedWasPlaying;
  } else {
    playing = true;
    goTo(step >= program.steps.length - 1 ? 0 : step + 1);
  }
  renderUI();
}
$('legend-btn').onclick = () => {
  const l = $('legend');
  l.hidden = !l.hidden;
  $('legend-btn').setAttribute('aria-expanded', String(!l.hidden));
};
// settings is a popover: any click outside it puts it away
document.addEventListener('pointerdown', (e) => {
  const st = $<HTMLDetailsElement>('settings');
  if (st.open && !st.contains(e.target as Node)) st.open = false;
});
document.querySelectorAll<HTMLButtonElement>('#view-switch button').forEach((b) => (b.onclick = () => setView(b.dataset.view as typeof view)));

$<HTMLInputElement>('opt-notation').onchange = (e) => { showNotation = (e.target as HTMLInputElement).checked; renderUI(); };
$<HTMLInputElement>('opt-guide').onchange = (e) => { showGuide = (e.target as HTMLInputElement).checked; rebuildGuide(shownStep()); };
$<HTMLInputElement>('opt-lefty').onchange = (e) => {
  lefty = (e.target as HTMLInputElement).checked;
  tieGroup.scale.x = lefty ? -1 : 1;
  loadKnot(def, true);
  queueThumbs();
};
$<HTMLInputElement>('opt-loop').onchange = (e) => { loop = (e.target as HTMLInputElement).checked; holdTimer = 0; };
$<HTMLInputElement>('opt-speed').oninput = (e) => (speed = parseFloat((e.target as HTMLInputElement).value));

const sw = $('swatches');
for (const f of FABRICS) {
  const b = document.createElement('button');
  b.style.background = f.swatch;
  b.title = f.name;
  b.setAttribute('aria-label', f.name);
  b.setAttribute('aria-pressed', String(f === fabric));
  b.className = f === fabric ? 'on' : '';
  b.onclick = () => {
    fabric = f;
    tieMat.dispose();
    tieMat = fabricMaterial(f, renderer.capabilities.getMaxAnisotropy());
    if (ribbon) ribbon.mesh.material = tieMat;
    queueThumbs();
    renderKnotList();
    sw.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
  };
  sw.appendChild(b);
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement;
  // let native controls keep their own keys
  if (t.closest('input, select, textarea, [contenteditable="true"]')) return;
  const onButton = !!t.closest('button, summary, a');
  if (e.key === 'ArrowRight') keyNext();
  else if (e.key === 'ArrowLeft') prev();
  else if (e.key === ' ' && !onButton) { e.preventDefault(); togglePlay(); }
  else if (e.key === '1') setView('pov');
  else if (e.key === '2') setView('mirror');
  else if (e.key === '3') setView('orbit');
  else if (e.key === 'Escape') { setKnotMenu(false); $<HTMLDetailsElement>('settings').open = false; }
  else if (e.key.toLowerCase() === 'a') replay();
  else if (e.key.toLowerCase() === 'k') setKnotMenu($('knots').hidden === true);
  else if (e.key.toLowerCase() === 'r') restart();
  else if (e.key.toLowerCase() === 'c') recenter();
  else if (e.key === '+' || e.key === '=') zoom(-1);
  else if (e.key === '-') zoom(1);
  else return;
});

// ---------- loop ----------
/**
 * The knot is framed in the space above the dock, so it is never under the card. The shift is eased:
 * the card grows and shrinks a little with its text and the picture should not jump when it does.
 */
let viewDx = 0, viewDy = 0, viewDxTarget = 0, viewDyTarget = 0;
const sideDock = matchMedia('(max-height: 560px) and (min-width: 700px)');
function frameView(snap = false) {
  const w = window.innerWidth, h = window.innerHeight;
  const box = (id: string) => document.getElementById(id)!.getBoundingClientRect(); // all zeros when not displayed
  const dock = box('dock');
  viewDxTarget = viewDyTarget = 0;
  freeW = 1;
  if (dock.height && sideDock.matches) {
    // a short, wide window (a phone on its side): the dock stands at the right, the picture gets the rest
    freeW = dock.left / w;
    viewDxTarget = dock.left / 2 - w / 2;
  } else if (dock.height) {
    const y0 = w <= 700 ? box('knot-btn').bottom : 0;
    viewDyTarget = (y0 + dock.top) / 2 - h / 2;
    // From your own eyes the work is all at the collar and below it is only shirt, so where there is
    // height to spare the knot is left lower, close to the words, instead of centred in the free space.
    if (view === 'pov' && w > 700) viewDyTarget *= 1 - 0.5 * Math.max(0, Math.min(1, (h - 700) / 160));
  }
  if (snap) { viewDx = viewDxTarget; viewDy = viewDyTarget; applyViewOffset(); }
}
function applyViewOffset() {
  const w = window.innerWidth, h = window.innerHeight;
  if (Math.abs(viewDx) > 1 || Math.abs(viewDy) > 1) camera.setViewOffset(w, h, -viewDx, -viewDy, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  frameView(true);
}
window.addEventListener('resize', resize);
resize();

// deep links: #knot=windsor&step=3&view=mirror
const params = new URLSearchParams(location.hash.slice(1));

// ---------- the second view ----------
// Beside the instructions sits the view you are *not* in: the mirror while you tie from your own
// eyes, your own eyes while you watch the mirror. It is the same scene drawn a second time (plainly,
// whatever look is on) into the canvas under a frame element, which is also the button that swaps.
const pipEl = $<HTMLButtonElement>('pip');
const pipCam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
const pipBack = new THREE.Color('#2a2521');
const pipShows = () => (view === 'mirror' ? 'pov' : 'mirror');
let showPip = params.has('pip') ? params.get('pip') === '1' : params.get('ui') !== '0';
$<HTMLInputElement>('opt-pip').checked = showPip;
$<HTMLInputElement>('opt-pip').onchange = (e) => { showPip = (e.target as HTMLInputElement).checked; syncPip(); };
pipEl.onclick = () => setView(pipShows());
function syncPip() {
  pipEl.hidden = !showPip;
  const pov = pipShows() === 'pov';
  pipEl.firstElementChild!.textContent = pov ? 'Your view' : 'Mirror';
  pipEl.title = pov ? 'Through your own eyes · click to switch to it (1)' : 'How it looks in the mirror · click to switch to it (2)';
  pipEl.setAttribute('aria-label', pov ? 'Your own view: switch to it' : 'Mirror view: switch to it');
}
function renderPip() {
  if (pipEl.hidden) return;
  const r = pipEl.getBoundingClientRect();
  const b = parseFloat(getComputedStyle(pipEl).borderTopWidth) - 1; // the frame's border covers the square corners of the picture
  const w = r.width - 2 * b, h = r.height - 2 * b;
  if (w < 8 || h < 8) return;
  const pov = pipShows() === 'pov';
  const shown: [THREE.Object3D, boolean][] = [head, neck, guide, ...grabMarkers].map((o) => [o, o.visible]);
  const sx = world.scale.x;
  head.visible = neck.visible = !pov;
  pipCam.aspect = w / h;
  if (pov) {
    world.scale.x = 1;
    world.updateMatrixWorld(true);
    const tanH = fitHalfWidth() / eye.distanceTo(program.knotCenter);
    pipCam.fov = Math.max(50, Math.min(120, (2 * Math.atan(tanH / pipCam.aspect) * 180) / Math.PI));
    pipCam.position.copy(eye);
    pipCam.up.set(0, 0.5, 1).normalize();
    pipCam.lookAt(eye.x, eye.y + Math.sin(-1.86), eye.z + Math.cos(-1.86));
  } else {
    guide.visible = false;
    for (const m of grabMarkers) m.visible = false;
    world.scale.x = -1;
    world.updateMatrixWorld(true);
    const k = tieGroup.localToWorld(program.knotCenter.clone());
    pipCam.fov = 30;
    const t = Math.tan((pipCam.fov / 2) * Math.PI / 180);
    const half = (fitHalfWidth() + 0.012) * (w / h < 0.7 ? 0.68 : 1); // a narrow frame crops the shoulders rather than shrinking the knot
    const dist = Math.max(half / (t * (w / h)), 0.105 / t);
    pipCam.up.set(0, 1, 0);
    pipCam.position.set(k.x, k.y - 0.01, k.z + dist);
    pipCam.lookAt(k.x, k.y - 0.03, k.z);
  }
  pipCam.updateProjectionMatrix();
  const size = renderer.getSize(new THREE.Vector2());
  renderer.setViewport(r.left + b, size.y - r.bottom + b, w, h);
  renderer.setScissor(r.left + b, size.y - r.bottom + b, w, h);
  renderer.setScissorTest(true);
  const bg = scene.background;
  scene.background ??= pipBack; // the illustrated looks draw their own backdrop; the inset needs one
  renderer.render(scene, pipCam);
  scene.background = bg;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, size.x, size.y);
  world.scale.x = sx;
  world.updateMatrixWorld(true);
  for (const [o, v] of shown) o.visible = v;
}
const startKnot = KNOTS.find((k) => k.id === params.get('knot')) ?? KNOTS[0];
setView((params.get('view') as typeof view) ?? 'pov');
loadKnot(startKnot);
if (params.get('step')) goTo(parseInt(params.get('step')!, 10), false);
if (params.get('ui') === '0') document.querySelectorAll<HTMLElement>('aside,#dock,#settings,#hint,#knot-btn,#cam-tools').forEach((e) => (e.style.display = 'none'));
resize();
if (params.get('cam')) {
  const [x, y, z] = params.get('cam')!.split(',').map(Number);
  setView('orbit');
  camera.position.set(x, y, z);
  controls.target.set(0, y - 0.03, 0.09);
}
// experimental art directions: #look=atelier|woodblock|blueprint|riso|noir
const look = initLook(params.get('look'), { renderer, scene, world, bodyGroup, head, neck, shirt, skin: skinMaterial, hemi, key, fill, overlay: [guide, ...grabMarkers], knotName: () => def.name });
if (params.get('fabric')) {
  const f = FABRICS.find((x) => x.id === params.get('fabric'));
  if (f) (sw.children[FABRICS.indexOf(f)] as HTMLButtonElement).click();
}

let last = performance.now();
let frames = 0;
/** #manual=1: time only advances when a script calls tie.tick(), so captures are exact */
const manual = params.get('manual') === '1';
function frame(now: number) {
  if (frames === 3) document.body.classList.add('ready'); // the scene has drawn: lift the loading screen
  if (++frames > 20 && thumbQueue.length && !manual) renderThumb(thumbQueue.shift()!);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (manual) { requestAnimationFrame(frame); return; }
  tick(dt);
  requestAnimationFrame(frame);
}
function tick(dt: number) {
  clock += dt;
  if (Math.abs(viewDyTarget - viewDy) > 0.5 || Math.abs(viewDxTarget - viewDx) > 0.5) {
    viewDx += (viewDxTarget - viewDx) * Math.min(1, dt * 8);
    viewDy += (viewDyTarget - viewDy) * Math.min(1, dt * 8);
    applyViewOffset();
  }
  updateTie(dt);
  guideUniforms.time.value = clock;
  updateCamera(dt);
  if (look?.render) look.render(camera);
  else renderer.render(scene, camera);
  renderPip();
  queueThumbs();
}
requestAnimationFrame(frame);

// for debugging / screenshots
(window as unknown as { tie: unknown }).tie = { goTo, setView, tick: (dt: number, n = 1) => { for (let i = 0; i < n; i++) tick(dt); }, get step() { return step; }, get sim() { return sim; }, get ribbon() { return ribbon; }, get anim() { return anim; }, guideVisible: () => guide.visible, get paused() { return paused; },
  /** fraction of tie samples (and hand pinch points) inside the visible canvas, for framing checks */
  cam: () => (p: THREE.Vector3) => tieGroup.localToWorld(p.clone()).project(camera),
  onScreen: () => {
    const k = program.knotCenter;
    const local = [...sim.pos, ...grabMarkers.filter((m) => m.visible).map((m) => m.position)].filter((p) => p.distanceTo(k) < 0.12 && p.y < 0.015); // the work area; excludes an end parked over the shoulder
    const inside = local.filter((p) => { const q = tieGroup.localToWorld(p.clone()).project(camera); return Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1; });
    return inside.length / local.length;
  } };
