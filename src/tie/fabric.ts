import * as THREE from 'three';

export interface Fabric {
  id: string;
  name: string;
  swatch: string;
  draw: (g: CanvasRenderingContext2D, S: number) => void;
  sheen: string;
  /** colour of the wide end's half of the tie (multiplies the texture) */
  wide?: string;
  /** colour of the narrow end's half; the change-over is hidden at the back of the neck */
  narrow?: string;
}

function weave(g: CanvasRenderingContext2D, S: number, alpha = 0.07) {
  // fine twill texture
  g.globalAlpha = alpha;
  for (let i = -S; i < S * 2; i += 3) {
    g.strokeStyle = i % 6 === 0 ? '#ffffff' : '#000000';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i - S * 0.35, S);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function diagStripes(g: CanvasRenderingContext2D, S: number, stripes: [string, number, number][]) {
  // stripes at 45°, period S/2 so the tile is seamless
  const period = S / 2;
  for (const [color, offset, w] of stripes) {
    g.fillStyle = color;
    for (let k = -4; k <= 4; k++) {
      const c = k * period + offset * period;
      g.beginPath();
      g.moveTo(c, 0);
      g.lineTo(c + w * period, 0);
      g.lineTo(c + w * period + S, S);
      g.lineTo(c + S, S);
      g.closePath();
      g.fill();
    }
  }
}

/**
 * Every fabric is a teaching aid, not a wardrobe: each one makes something about the knot visible.
 * All of them have a pale lining with a seam down the middle, so you can always tell when the
 * tie is showing its back.
 */
export const FABRICS: Fabric[] = [
  {
    id: 'two-tone',
    name: 'Two-tone: wide end red, narrow end blue',
    swatch: 'linear-gradient(90deg,#2f5f96 0 38%,#c9423c 38%)',
    sheen: '#ffd9cf',
    wide: '#cf4a41',
    narrow: '#3a6aa6',
    draw: (g, S) => {
      g.fillStyle = '#f4f4f4';
      g.fillRect(0, 0, S, S);
      weave(g, S, 0.09);
    },
  },
  {
    id: 'stripe',
    name: 'Stripes: show which way the fabric runs and twists',
    swatch: 'linear-gradient(135deg,#27407c 0 40%,#c9423c 40% 55%,#27407c 55% 75%,#e3c56a 75% 80%,#27407c 80%)',
    sheen: '#8090c0',
    draw: (g, S) => {
      g.fillStyle = '#27407c';
      g.fillRect(0, 0, S, S);
      diagStripes(g, S, [
        ['#c9423c', 0.05, 0.18],
        ['#e3c56a', 0.32, 0.05],
      ]);
      weave(g, S);
    },
  },
  {
    id: 'arrows',
    name: 'Arrows: point toward the wide tip',
    swatch: 'linear-gradient(135deg,#e2b23c 0 42%,#8a5a12 42% 58%,#e2b23c 58%)',
    sheen: '#fff0c0',
    draw: (g, S) => {
      g.fillStyle = '#e2b23c';
      g.fillRect(0, 0, S, S);
      weave(g, S, 0.05);
      g.strokeStyle = '#8a5a12';
      g.lineWidth = S * 0.045;
      g.lineJoin = 'miter';
      // canvas-up is toward the wide tip
      for (const [cx, cy] of [[0.25, 0.3], [0.75, 0.8], [0.75, -0.2], [0.25, 1.3]]) {
        g.beginPath();
        g.moveTo((cx - 0.13) * S, (cy + 0.07) * S);
        g.lineTo(cx * S, (cy - 0.07) * S);
        g.lineTo((cx + 0.13) * S, (cy + 0.07) * S);
        g.stroke();
      }
    },
  },
  {
    id: 'plain',
    name: 'Plain: folds and layers read most clearly',
    swatch: '#86aede',
    sheen: '#ffffff',
    draw: (g, S) => {
      g.fillStyle = '#86aede';
      g.fillRect(0, 0, S, S);
      weave(g, S, 0.06);
    },
  },
];

const cache = new Map<string, THREE.CanvasTexture>();

export function fabricTexture(f: Fabric, anisotropy: number) {
  let t = cache.get(f.id);
  if (t) return t;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  f.draw(g, S);
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  cache.set(f.id, t);
  return t;
}

/** metres of tie per texture repeat (the ribbon's uv is in these units) */
export const TEX_SCALE = 0.06;
/** shared by every fabric material: where along the tie (m from the narrow tip) the back of the neck is */
export const tieUniforms = { uSplit: { value: 0.7 } };

export function fabricMaterial(f: Fabric, anisotropy: number) {
  const m = new THREE.MeshPhysicalMaterial({
    map: fabricTexture(f, anisotropy),
    roughness: 0.6,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(f.sheen),
    side: THREE.DoubleSide,
    vertexColors: true, // contact shading from the ribbon (see below)
  });
  const uniforms = {
    ...tieUniforms,
    uWide: { value: new THREE.Color(f.wide ?? '#ffffff') },
    uNarrow: { value: new THREE.Color(f.narrow ?? f.wide ?? '#ffffff') },
    uBack: { value: new THREE.Color('#efe6d3') },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float face; varying float vFace;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = face;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSplit; uniform vec3 uWide; uniform vec3 uNarrow; uniform vec3 uBack; varying float vFace;')
      // the two ends in their own colours, and the lining (with its seam) on the back face
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 m = vMapUv * ${TEX_SCALE.toFixed(3)};
          diffuseColor.rgb *= mix(uNarrow, uWide, smoothstep(uSplit - 0.03, uSplit + 0.03, m.y));
          if (abs(vFace) > 0.5 && gl_FrontFacing == (vFace > 0.0)) {
            float seam = smoothstep(0.0007, 0.0015, abs(m.x));
            float stitch = step(0.5, fract(m.y / 0.006));
            diffuseColor.rgb = uBack * mix(0.62 + 0.2 * stitch, 1.0, seam);
          }
        }`,
      )
      // Apply the ribbon's contact shade to *all* light (diffuse, sheen, reflections), not just the
      // diffuse colour; otherwise the sheen washes out the layering cue.
      .replace('#include <color_fragment>', '')
      .replace('#include <opaque_fragment>', 'outgoingLight *= vColor.rgb;\n#include <opaque_fragment>');
  };
  return m;
}
