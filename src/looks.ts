/**
 * Experimental visual directions for the 3D scene, switched on with `#look=<id>`.
 * Nothing here touches the knot engine: a look only restyles lights/materials and (for the
 * illustrated ones) replaces the final draw with a screen-space pass over colour + geometry buffers.
 */
import * as THREE from 'three';
import { bodyFront } from './scene/bodyShape';

export interface LookCtx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  world: THREE.Group;
  bodyGroup: THREE.Group;
  head: THREE.Group;
  neck: THREE.Object3D;
  shirt: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  /** UI drawn in 3D (path guide, grab markers): always rendered clean, on top of any stylisation */
  overlay: THREE.Object3D[];
  knotName: () => string;
}
export interface Look { render: ((camera: THREE.PerspectiveCamera) => void) | null }

export const LOOK_IDS = ['atelier', 'woodblock', 'blueprint', 'riso', 'noir'] as const;
type LookId = (typeof LOOK_IDS)[number];

const MODE: Record<LookId, number> = { atelier: 0, woodblock: 1, blueprint: 2, riso: 3, noir: 4 };

const CSS: Record<LookId, string> = {
  atelier: `#mirror-frame{box-shadow:inset 0 0 0 10px #b89a63,inset 0 0 0 12px #5c4827,inset 0 0 90px rgba(60,30,10,.35)!important}`,
  woodblock: `#mirror-frame{inset:0!important;border-radius:0!important;box-shadow:inset 0 0 0 22px #efe5cf,inset 0 0 0 24px #1d1b26!important}
    #look-art{right:38px;bottom:38px;width:46px;height:46px;background:#c8372d;color:#f3e9d2;font:700 30px/46px 'Hiragino Mincho ProN','Yu Mincho',serif;text-align:center;border-radius:3px;mix-blend-mode:multiply;opacity:.92}`,
  blueprint: `#mirror-frame{inset:14px!important;border-radius:0!important;box-shadow:inset 0 0 0 1.5px rgba(225,238,255,.85),inset 0 0 0 6px transparent,inset 0 0 0 7px rgba(225,238,255,.45)!important}
    #look-art{right:36px;bottom:36px;padding:9px 14px;border:1.5px solid rgba(225,238,255,.85);color:#e4efff;font:11px/1.6 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;background:rgba(15,45,92,.75)}
    #look-art b{display:block;font-size:14px;letter-spacing:.2em}`,
  riso: `#mirror-frame{inset:0!important;border-radius:0!important;box-shadow:inset 0 0 0 24px #f3ebda!important}
    #look-art{left:40px;bottom:36px;color:#2f4fa6;font:800 13px/1.2 ui-sans-serif,-apple-system,sans-serif;letter-spacing:.22em;text-transform:uppercase;mix-blend-mode:multiply}
    #look-art b{color:#ff4fa8}`,
  noir: `#mirror-frame{inset:0!important;border-radius:0!important;box-shadow:inset 0 0 220px 40px rgba(0,0,0,.85)!important}`,
};

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- scene dressing per look

/** 1 · Atelier: a tailor's dress form in warm workroom light. */
function dressAtelier(c: LookCtx) {
  c.scene.background = canvasTex(512, 512, (g) => {
    const r = g.createRadialGradient(150, 110, 20, 256, 256, 460);
    r.addColorStop(0, '#d9c8ae'); r.addColorStop(0.55, '#a8937a'); r.addColorStop(1, '#4f4135');
    g.fillStyle = r; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,245,225' : '40,25,10'},${Math.random() * 0.05})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  });
  c.scene.fog = null;
  c.scene.environmentIntensity = 0.55;
  c.hemi.intensity = 0.55; c.hemi.color.set('#ffe6c8'); c.hemi.groundColor.set('#5b4330');
  c.key.color.set('#ffdcae'); c.key.intensity = 3.1; c.key.position.set(0.9, 1.3, 1.1); c.key.shadow.radius = 6;
  c.fill.color.set('#a9c2ff'); c.fill.intensity = 0.45;
  c.shirt.color.set('#fff6ea');

  // the wearer becomes a linen dress form: no head, a turned-wood neck cap and brass finial
  for (const m of c.head.children) m.visible = false;
  const linen = canvasTex(128, 128, (g) => {
    g.fillStyle = '#c9b594'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 2) {
      g.fillStyle = `rgba(90,70,40,${0.1 + Math.random() * 0.12})`; g.fillRect(i, 0, 1, 128);
      g.fillStyle = `rgba(255,245,220,${0.1 + Math.random() * 0.12})`; g.fillRect(0, i, 128, 1);
    }
  });
  linen.wrapS = linen.wrapT = THREE.RepeatWrapping; linen.repeat.set(10, 3);
  (c.neck as THREE.Mesh).material = new THREE.MeshStandardMaterial({ map: linen, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.35 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a45a', roughness: 0.25, metalness: 1 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.016, 40), wood);
  cap.position.set(0, 0.086, -0.002);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 24, 16), brass);
  knob.position.set(0, 0.108, -0.002);
  for (const m of [cap, knob]) { m.castShadow = true; c.bodyGroup.add(m); }

  // a tape measure left hanging round the neck, clear of the tie
  const tape = canvasTex(32, 256, (g) => {
    g.fillStyle = '#e9c545'; g.fillRect(0, 0, 32, 256);
    g.fillStyle = '#2a2318';
    for (let y = 0; y < 256; y += 8) g.fillRect(0, y, y % 32 === 0 ? 20 : 10, 1.5);
  });
  tape.wrapT = THREE.RepeatWrapping;
  const tapeMat = new THREE.MeshStandardMaterial({ map: tape, roughness: 0.6, side: THREE.DoubleSide });
  for (const [s, len] of [[1, 0.44], [-1, 0.33]] as const) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const f = i / N, y = -0.03 - len * f;
      const x = s * (0.098 + 0.022 * Math.min(1, f * 5) + 0.004 * Math.sin(f * 7));
      for (const o of [-0.008, 0.008]) { pos.push(x + o, y, bodyFront(x + o, y) + 0.005); uv.push(o > 0 ? 1 : 0, f * len * 12); }
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, tapeMat);
    m.castShadow = m.receiveShadow = true;
    c.bodyGroup.add(m);
  }
}

/** flat, even light for the looks that are redrawn as line/ink anyway */
function dressFlat(c: LookCtx) {
  c.scene.background = null;
  c.scene.fog = null;
  c.hemi.intensity = 1.25; c.hemi.color.set('#ffffff'); c.hemi.groundColor.set('#8a8a8a');
  c.key.intensity = 2.2; c.key.color.set('#ffffff'); c.key.position.set(-0.7, 1.4, 1.2);
  c.fill.intensity = 0.3;
  c.scene.environmentIntensity = 0.15;
}

/** 5 · Noir: one hard lamp through venetian blinds, everything monochrome but the tie. */
function dressNoir(c: LookCtx) {
  c.scene.background = new THREE.Color('#060607');
  c.scene.fog = null;
  c.scene.environmentIntensity = 0.04;
  c.hemi.intensity = 0.07;
  c.key.intensity = 0; c.key.castShadow = false;
  c.fill.color.set('#9fc2ff'); c.fill.intensity = 2.6; c.fill.position.set(-0.9, 0.5, -1.0); // cold rim from behind
  const blinds = canvasTex(256, 256, (g) => {
    g.fillStyle = '#2e2e2e'; g.fillRect(0, 0, 256, 256);
    g.translate(128, 128); g.rotate(-0.13); g.translate(-128, -128);
    g.fillStyle = '#fff'; g.filter = 'blur(0.8px)';
    for (let y = -60; y < 320; y += 9) g.fillRect(-80, y, 420, 5.5);
  });
  const lamp = new THREE.SpotLight('#fff0d8', 7, 0, 0.42, 0.35, 0);
  lamp.position.set(-0.95, 0.55, 1.25);
  lamp.target.position.set(0, -0.12, 0.08);
  lamp.map = blinds;
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.near = 0.6; lamp.shadow.camera.far = 3;
  lamp.shadow.bias = -0.0006; lamp.shadow.normalBias = 0.002;
  c.scene.add(lamp, lamp.target);
}

// ---------------------------------------------------------------- screen-space pass

const GEO_VERT = `varying vec3 vN; varying float vZ;
  void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalMatrix * normal; vZ = -mv.z; gl_Position = projectionMatrix * mv; }`;
const GEO_FRAG = `uniform float id; varying vec3 vN; varying float vZ;
  void main(){ vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n; gl_FragColor = vec4(n.xy, vZ, id); }`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor, tGeo;
uniform vec2 res;
uniform int mode;
varying vec2 vUv;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

vec4 geo(vec2 uv){ vec4 g = texture2D(tGeo, uv); if (g.a < 0.25) g = vec4(0.0, 0.0, 5.0, 0.0); return g; }
vec3 shade(vec2 uv){ vec3 c = texture2D(tColor, uv).rgb; c = 1.0 - exp(-c * 1.5); return pow(c, vec3(1.0/2.2)); }

/** ink line where depth, surface direction or object changes; w = line width in px */
float edge(vec2 uv, float w){
  vec2 o = w / res;
  vec4 c = geo(uv), l = geo(uv - vec2(o.x,0)), r = geo(uv + vec2(o.x,0)), d = geo(uv - vec2(0,o.y)), u = geo(uv + vec2(0,o.y));
  float nd = max(length(l.xy - r.xy), length(u.xy - d.xy));
  float dd = max(abs(l.z + r.z - 2.0*c.z), abs(u.z + d.z - 2.0*c.z));
  float idd = max(abs(l.a - r.a), abs(u.a - d.a));
  return clamp(max(max(smoothstep(0.45, 0.9, nd), smoothstep(0.0012, 0.003, dd)), step(0.2, idd)), 0.0, 1.0);
}
float dots(vec2 px, float cell, float ang, float amt){
  float s = sin(ang), c = cos(ang);
  vec2 q = mat2(c, -s, s, c) * px / cell;
  float d = length(fract(q) - 0.5);
  float r = sqrt(clamp(amt, 0.0, 1.0)) * 0.72;
  return smoothstep(r + 0.06, r - 0.06, d);
}

void main(){
  vec2 px = vUv * res;
  float S = res.y / 900.0;                 // everything is authored for a 900px-tall frame
  vec4 g = geo(vUv);
  bool isTie = g.a > 0.75, isBody = g.a > 0.25 && !isTie;
  vec3 col = shade(vUv);
  vec3 outc = col;

  if (mode == 1) { // ---------------- woodblock print
    vec2 wob = (vec2(vnoise(px/(14.0*S)), vnoise(px/(14.0*S) + 37.0)) - 0.5) * 1.6 * S / res;
    float e = max(edge(vUv + wob, 1.6*S), 0.6*edge(vUv + wob*2.0, 0.8*S));
    vec3 paper = vec3(0.945, 0.905, 0.815);
    vec3 indigo = vec3(0.13, 0.22, 0.40);
    vec3 c;
    if (!isTie && !isBody) {
      float t = smoothstep(0.55, 1.0, vUv.y + 0.05*vnoise(px/(60.0*S)));
      c = mix(paper, indigo, t);           // bokashi: the graded band of colour along the top
    } else {
      float l = lum(col);
      float q = floor(l * 4.0 + 0.5) / 4.0; // a few flat blocks of tone, one per carved block
      c = col * (q / max(l, 0.001));
      if (isBody) { float sat = length(col - l); c = mix(mix(vec3(0.60,0.66,0.72), paper, smoothstep(0.45, 0.8, q)), c * paper, smoothstep(0.03, 0.12, sat)); }
      else c = mix(c, c * paper, 0.5) * 1.08;
    }
    float grain = vnoise(vec2(px.x/(140.0*S), px.y/(1.3*S)));  // wood grain in the flats
    c *= 0.965 + 0.05 * grain;
    c = mix(c, vec3(0.10, 0.09, 0.14), e * 0.93);
    c *= 0.97 + 0.05 * hash(px);
    outc = c;
  } else if (mode == 2) { // ---------- blueprint
    vec3 bg = vec3(0.055, 0.19, 0.40);
    vec3 ink = vec3(0.90, 0.95, 1.0);
    vec2 gq = px / (30.0*S);
    float minor = 1.0 - smoothstep(0.0, 0.035, min(abs(fract(gq.x)-0.5), abs(fract(gq.y)-0.5)) - 0.465) ;
    vec2 gm = gq / 5.0;
    float major = 1.0 - smoothstep(0.0, 0.012, min(abs(fract(gm.x)-0.5), abs(fract(gm.y)-0.5)) - 0.488);
    minor = 1.0 - minor; major = 1.0 - major;
    vec3 c = bg * (0.9 + 0.2 * vnoise(px/(220.0*S)));
    c = mix(c, ink, 0.07 * minor + 0.10 * major);
    float l = lum(col);
    if (isBody) {
      c = mix(c, bg * 0.78, 0.85);                                   // the figure is a quiet, darker cut-out
      float h = step(0.5, fract((px.x + px.y) / (7.0*S)));
      c = mix(c, ink, 0.20 * h * smoothstep(0.62, 0.35, l));        // hatching in the shadows only
    } else if (isTie) {
      float v = smoothstep(0.10, 0.55, l);
      c = mix(bg * 1.25, ink, 0.30 + 0.62 * v);                     // the tie is the one solid, lit thing
      float h = step(0.55, fract((px.x - px.y) / (5.0*S)));
      c = mix(c, bg, 0.30 * h * smoothstep(0.35, 0.12, l));
    }
    float e = edge(vUv, 1.3*S);
    c = mix(c, isTie ? bg * 0.7 : ink, e * (isTie ? 0.95 : 0.9));
    c *= 0.96 + 0.07 * hash(px);
    outc = c;
  } else if (mode == 3) { // ---------- risograph, two inks + a flat
    vec3 paper = vec3(0.955, 0.925, 0.86);
    vec3 blue = vec3(0.16, 0.30, 0.66), pink = vec3(1.0, 0.30, 0.62), yellow = vec3(1.0, 0.86, 0.20);
    vec2 off = vec2(3.5, -2.5) * S / res;                           // the pink drum is slightly off register
    vec4 gp = geo(vUv + off);
    vec3 colP = shade(vUv + off);
    float l = lum(col);
    // yellow flat: a sun behind the shoulders
    vec2 cc = (px - vec2(0.5*res.x, 0.60*res.y)) / res.y;
    float sun = smoothstep(0.455, 0.45, length(cc)) * (g.a < 0.25 ? 1.0 : 0.0);
    // pink: floods the tie, and warms skin
    float pinkAmt = 0.0;
    if (gp.a > 0.75) pinkAmt = 1.0;
    else if (gp.a > 0.25) pinkAmt = dots(px, 5.0*S, 1.31, smoothstep(0.05, 0.3, colP.r - colP.b) * 0.5);
    // blue: carries all the drawing
    float dark = 1.0 - l;
    float blueAmt;
    if (isTie) blueAmt = dots(px, 5.5*S, 0.785, smoothstep(0.25, 0.95, dark) * 1.05);
    else if (isBody) blueAmt = dots(px, 5.5*S, 0.785, smoothstep(0.12, 0.8, dark) * 0.85);
    else blueAmt = 0.0;
    blueAmt = max(blueAmt, edge(vUv, 1.2*S) * 0.95);
    float ink1 = 0.86 + 0.14 * vnoise(px/(3.0*S));                   // patchy ink coverage
    vec3 c = paper;
    c *= mix(vec3(1.0), yellow, sun * ink1);
    c *= mix(vec3(1.0), pink, pinkAmt * ink1);
    c *= mix(vec3(1.0), blue, blueAmt * (0.8 + 0.2 * vnoise(px/(2.0*S) + 9.0)));
    c *= 0.97 + 0.05 * hash(px);
    outc = c;
  } else if (mode == 4) { // ---------- noir, selective colour
    float l = lum(col);
    vec3 bw = vec3(smoothstep(0.03, 0.92, l)) * vec3(0.96, 0.98, 1.04);
    vec3 c = bw;
    if (isTie) { vec3 sat = mix(vec3(l), col, 1.6); c = max(sat, 0.0) * vec3(1.05, 0.92, 0.92); }
    c += (hash(px + 3.0) - 0.5) * 0.07;
    outc = c;
  }
  gl_FragColor = vec4(outc, 1.0);
}`;

export function initLook(id: string | null, c: LookCtx): Look | null {
  if (!id || !(LOOK_IDS as readonly string[]).includes(id)) return null;
  const look = id as LookId;
  document.body.classList.add(`look-${look}`);
  const style = document.createElement('style');
  style.textContent = `#look-art{position:fixed;pointer-events:none;z-index:2}` + CSS[look];
  document.head.appendChild(style);
  const art = document.createElement('div');
  art.id = 'look-art';
  if (look === 'woodblock') art.textContent = '結'; // musubi: "to tie"
  if (look === 'blueprint') art.innerHTML = `<b>${c.knotName()}</b>Fig. 7 · finished knot · front elevation`;
  if (look === 'riso') art.innerHTML = `${c.knotName()} <b>✕</b> finished`;
  if (art.innerHTML) document.body.appendChild(art);

  if (look === 'atelier') { dressAtelier(c); return { render: null }; }
  if (look === 'noir') dressNoir(c); else dressFlat(c);

  const { renderer, scene } = c;
  const size = new THREE.Vector2();
  const colorRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const geoRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const geoMat = (v: number) => new THREE.ShaderMaterial({ uniforms: { id: { value: v } }, vertexShader: GEO_VERT, fragmentShader: GEO_FRAG, side: THREE.DoubleSide });
  const bodyGeo = geoMat(0.5), tieGeo = geoMat(1);
  const post = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: colorRT.texture }, tGeo: { value: geoRT.texture }, res: { value: size }, mode: { value: MODE[look] } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
  });
  const quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  const quadCam = new THREE.Camera();
  const black = new THREE.Color(0, 0, 0);
  const prevClear = new THREE.Color();

  const render = (camera: THREE.PerspectiveCamera) => {
    renderer.getDrawingBufferSize(size);
    if (colorRT.width !== size.x || colorRT.height !== size.y) { colorRT.setSize(size.x, size.y); geoRT.setSize(size.x, size.y); }
    for (const o of c.overlay) o.traverse((x) => x.layers.set(1));

    // 1) lit colour
    camera.layers.set(0);
    renderer.setRenderTarget(colorRT);
    renderer.render(scene, camera);

    // 2) geometry buffer: view normal, depth, and which pixels are tie
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.layers.test(camera.layers)) return;
      const mat = m.material as THREE.Material;
      if (mat.transparent) { swapped.push([m, mat]); m.visible = false; return; }
      swapped.push([m, mat]);
      m.material = (mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial ? tieGeo : bodyGeo;
    });
    const bg = scene.background;
    scene.background = null;
    renderer.getClearColor(prevClear);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(black, 0);
    renderer.setRenderTarget(geoRT);
    renderer.render(scene, camera);
    for (const [m, mat] of swapped) { if ((mat as THREE.Material).transparent) m.visible = true; m.material = mat; }
    renderer.setClearColor(prevClear, prevAlpha);

    // 3) the print
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);

    // 4) 3D UI, clean, on top
    camera.layers.set(1);
    renderer.autoClear = false;
    renderer.render(scene, camera);
    renderer.autoClear = true;
    scene.background = bg;
    camera.layers.set(0);
  };
  return { render };
}
