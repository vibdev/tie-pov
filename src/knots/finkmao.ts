import * as THREE from 'three';
import { CP, cp, v3, polyLength, smooth } from '../tie/path';
import { LEFT, bodyFront } from '../scene/bodyShape';
import type { Program, Step, TieState } from './types';

/**
 * Procedural necktie knots from Fink–Mao notation.
 *
 * Regions: L / R / C (centre = up through the neck loop), seen from the wearer.
 * Our geometric reading of the suffix:
 *   "i" — the move ends with the wide blade passing across the FRONT of the knot
 *   "o" — the move ends with the wide blade passing BEHIND the knot
 * which reproduces the familiar instructions (e.g. Four-in-Hand "Li Ro Li Co T":
 * over to the left, behind to the right, across the front to the left, up behind
 * through the neck loop, down through the front).
 */

export const K = v3(0, -0.03, 0.098);
const RX = 0.037;
const DZ0 = 0.0085;
const DZS = 0.0045;

type Region = 'L' | 'R' | 'C';
interface Move { r: Region; front: boolean; code: string }

export function parseSequence(seq: string): Move[] {
  return seq
    .trim()
    .split(/\s+/)
    .filter((t) => t !== 'T')
    .map((t) => ({ r: t[0] as Region, front: t[1] === 'i', code: t }));
}

const rx = (r: Region) => (r === 'L' ? LEFT * RX : r === 'R' ? -LEFT * RX : 0);

/** fabric from the head (narrow) end to the right side of the collar — shared by every state */
export function neckCore(anchorY: number, knot: THREE.Vector3, opts: { bow?: boolean } = {}): { core: CP[]; leftCollar: CP[]; ring: CP[]; rightCollar: CP } {
  const L = LEFT;
  const Ky = knot.y, Kz = knot.z;
  const leftCollar: CP[] = [
    cp(L * 0.017, Ky + 0.026, 0.088, 0.9),
    cp(L * 0.03, 0.005, 0.077),
  ];
  const ring: CP[] = [];
  const r = 0.071;
  const a0 = 0.6, a1 = Math.PI * 2 - 0.6;
  const n = 15;
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    ring.push(cp(L * Math.sin(t) * r, 0.013, Math.cos(t) * r, 1));
  }
  const rightCollar = cp(-L * 0.03, 0.005, 0.077);
  const head: CP[] = opts.bow
    ? []
    : [
        cp(0, anchorY, bodyFront(0, anchorY) + 0.011, 1),
        cp(0, Ky - 0.022, Kz - 0.001, 0.85),
        cp(0, Ky + 0.004, Kz - 0.002, 0.8),
      ];
  return { core: [...head, ...leftCollar, ...ring, rightCollar], leftCollar, ring, rightCollar };
}

export function tieWidth(total: number) {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
  return (s: number) => {
    let w: number;
    if (s < 0.3) w = 0.036;
    else if (s < 0.5) w = lerp(0.036, 0.031, (s - 0.3) / 0.2);
    else if (s < total - 0.8) w = 0.031;
    else if (s < total - 0.3) w = lerp(0.031, 0.086, smooth((s - (total - 0.8)) / 0.5));
    else w = 0.086;
    return Math.max(0.0006, Math.min(w, s * 1.9, (total - s) * 1.9));
  };
}

const clone = (cps: CP[]) => cps.map((c) => ({ p: c.p.clone(), g: c.g, side: c.side?.clone() }));

/** how the finished knot should look: the knot's silhouette, which is what tells knots apart */
export interface KnotLook {
  /** width across the top of the knot (m) */
  topW: number;
  /** height of the visible front band (m) */
  faceH: number;
  /** slope of the front band; non-zero for lopsided knots */
  tilt: number;
  /** how much wider the top is than the bottom (0 = straight band, 0.6 = strong triangle) */
  fan: number;
}

export function buildFinkMao(seq: string, lefty: boolean, look: KnotLook = { topW: 0.05, faceH: 0.046, tilt: 0, fan: 0.3 }): Program {
  const moves = parseSequence(seq);
  const side = (r: Region) => {
    const isLeft = r === 'L';
    return (isLeft !== lefty) ? 'left' : 'right';
  };
  const Ky = K.y, Kz = K.z;
  const anchorY = Ky - 0.055;
  const { core } = neckCore(anchorY, K);
  const approach = cp(-LEFT * 0.017, Ky + 0.026, 0.09, 0.9);

  const steps: Step[] = [];
  const seamOut = !moves[0].front;
  const startState: TieState = { cps: clone(core), headLen: 0, tailKind: 'free', right: null, left: null };
  steps.push({
    title: 'Drape it',
    text: `Hang the tie around your neck${seamOut ? ' <b>seam-side out</b> (inside-out)' : ' with the seam facing your shirt'}. Wide end on your <b>${side('R')}</b>, hanging well below the narrow end.`,
    move: 'reshape',
    state: startState,
    tip: seamOut
      ? 'This knot starts inside-out — the seam faces away from you. It flips right-side out as you tie.'
      : 'Rule of thumb: start with the tip of the narrow end around your sternum.',
  });

  let nf = 0, nb = 0;
  let lastFrontBand = Kz + DZ0;
  let cur: Region | 'S' = 'S';
  const pts: CP[] = [...clone(core), approach];
  const zF = () => Kz + DZ0 + DZS * nf;
  const zB = () => Kz - DZ0 - DZS * nb;

  const moveCount = moves.length;
  /** index of the last control point of each move, in the loose route and in the tight one */
  const looseEnds: number[] = [];
  const tightEnds: number[] = [];
  moves.forEach((m, idx) => {
    const z = m.front ? zF() : zB();
    let tailKind: TieState['tailKind'] = m.front ? 'front' : 'back';
    let title = '';
    let text = '';
    const nextIsC = moves[idx + 1]?.r === 'C';
    const lastBeforeTuck = idx === moveCount - 2;
    if (m.r !== 'C') {
      const xb = rx(m.r);
      if (cur === 'C') {
        pts.push(cp(xb * 0.3, Ky + 0.006, z, 0.6));
      } else {
        const xa = cur === 'S' ? -LEFT * 0.01 : rx(cur);
        pts.push(cp(xa * 0.4, Ky - 0.001, z, 0.62));
        pts.push(cp(xb * 0.4, Ky - 0.006, z, 0.62));
      }
      pts.push(cp(xb, Ky - 0.024, Kz + (m.front ? 0.007 : -0.004), 0.66));
      if (m.front) { lastFrontBand = z; nf++; } else nb++;
      if (cur === 'S') {
        title = m.front ? `Over to your ${side(m.r)}` : `Under to your ${side(m.r)}`;
        text = m.front
          ? `Cross the wide end <b>over</b> the narrow end, to your <b>${side(m.r)}</b>.`
          : `Cross the wide end <b>under</b> the narrow end, to your <b>${side(m.r)}</b>.`;
      } else if (cur === 'C') {
        title = `Down to your ${side(m.r)}`;
        text = `Pull the wide end down ${m.front ? '<b>across the front</b>' : '<b>behind</b> the knot'} and out to your <b>${side(m.r)}</b>.`;
      } else {
        title = m.front ? `Across the front` : `Behind to your ${side(m.r)}`;
        text = m.front
          ? `Bring the wide end <b>across the front</b> of the knot to your <b>${side(m.r)}</b>.`
          : `Pass the wide end <b>behind</b> the knot to your <b>${side(m.r)}</b>.`;
      }
      if (m.front && nextIsC && lastBeforeTuck) text += ' This band becomes the face of the knot — keep it flat and keep a finger in it.';
    } else {
      const xa = cur === 'S' ? -LEFT * 0.01 : rx(cur as Region);
      pts.push(cp(xa * 0.4, Ky - 0.01, z, 0.6));
      pts.push(cp(xa * 0.08, Ky + 0.02, z, 0.55));
      pts.push(cp(0, Ky + 0.043, Kz + (m.front ? -0.001 : 0.004), 0.55, v3(1, 0, 0)));
      if (m.front) nf++; else nb++;
      const fallZ = m.front ? zB() : zF();
      if (m.front) nb++; else nf++;
      pts.push(cp(0, Ky + 0.018, fallZ, 0.6));
      tailKind = m.front ? 'back' : 'front';
      title = 'Up through the neck loop';
      text = m.front
        ? `Lift the wide end up <b>in front</b> and feed it, tip first, over the top and down <b>into the neck loop</b>. Pull it all the way through so it hangs behind the knot.`
        : `Feed the wide end, tip first, up <b>behind</b> the knot and <b>through the neck loop</b>. Pull it all the way through so it flops out toward you.`;
    }
    cur = m.r;
    looseEnds.push(pts.length - 1);
    steps.push({
      title,
      text,
      code: m.code,
      move: m.r === 'C' ? 'thread' : 'lay',
      state: { cps: clone(pts), headLen: 0, tailKind, right: 'grip', left: 'knot' },
    });
  });

  // Tuck through the front band
  const tz = lastFrontBand - 0.0035;
  pts.push(cp(0, Ky + 0.008, tz + 0.002, 0.6));
  pts.push(cp(0, Ky - 0.014, tz, 0.66));
  pts.push(cp(0, Ky - 0.04, zF() + 0.002, 0.85));
  const hy = Ky - 0.075;
  pts.push(cp(0, hy, bodyFront(0, hy) + 0.018, 1));
  steps.push({
    title: 'Through the front',
    text: 'Point the tip of the wide end <b>down behind the front band</b> you just made, and pull it all the way through.',
    code: 'T',
    move: 'thread',
    state: { cps: clone(pts), headLen: 0, tailKind: 'front', right: 'grip', left: 'knot' },
  });

  // Snug it up: a clean, tight finished knot built from the same sequence (the traced route above is
  // deliberately loose so each move is readable; real knots are pulled into a compact shape).
  const lastFace = moves.reduce((acc, m, i) => (m.r !== 'C' && m.front ? i : acc), -1);
  const faceTo = moves[lastFace].r;
  const faceFrom = lastFace > 0 && moves[lastFace - 1].r !== 'C' ? moves[lastFace - 1].r : faceTo === 'L' ? 'R' : 'L';
  const half = look.topW / 2;
  const sx = (r: Region) => (rx(r) === 0 ? 0 : Math.sign(rx(r)));
  const xf = sx(faceFrom) * half, xt = sx(faceTo) * half;
  const yF = Ky - 0.002;
  const tilt = (x: number) => yF + look.tilt * x;
  const fanSide = (x: number) => v3(Math.sign(x) * look.fan, 1, 0);
  const tightHead = neckCore(anchorY, K).core.slice(0, 3).map((c) => ({ ...c, p: c.p.clone() }));
  tightHead[1].p.set(0, Ky - 0.024, Kz - 0.009);
  tightHead[2].p.set(0, Ky + 0.006, Kz - 0.008);
  const fin: CP[] = [...tightHead, ...clone(core.slice(3))];
  // the neck band enters the top corners of the knot smoothly instead of as an ear
  fin[3].p.set(LEFT * half * 0.6, Ky + 0.021, Kz - 0.006);
  fin[3].g = 0.7;
  // where the band disappears under the collar it is folded narrow, not standing up as an ear
  fin[4].g = 0.6;
  fin[4].p.set(LEFT * 0.028, 0.0, 0.08);
  const rc = 3 + 2 + 16; // right collar point: head(3) + left collar(2) + ring(16)
  fin[rc].g = 0.6;
  fin[rc].p.set(-LEFT * 0.028, 0.0, 0.08);
  // inner wraps: hidden behind the front band, they give the knot its bulk and top shoulders
  let zIn = Kz - 0.006;
  for (let i = 0; i < lastFace; i++) {
    const m = moves[i];
    if (m.r === 'C') {
      const nx = i + 1 < moves.length ? sx(moves[i + 1].r) : 0;
      fin.push(cp(nx * half * 0.35, Ky + 0.017, Kz - 0.002, 0.55, v3(1, 0, 0)));
      fin.push(cp(nx * half * 0.55, Ky + 0.008, zIn, 0.6));
    } else {
      const x = sx(m.r) * half * 0.88;
      fin.push(cp(x * 0.2, Ky, zIn, 0.55, v3(0, 1, 0)));
      fin.push(cp(x, Ky + 0.001, zIn, 0.55, v3(0, 1, 0)));
    }
    zIn += 0.0016;
    tightEnds.push(fin.length - 1);
  }
  // the front band (the face of the knot), wrapping around both side edges
  const zFace = Kz + 0.013;
  const faceStart = fin.length;
  // the band is taller in the middle with a level top edge, so the knot tapers to a V into the blade
  const H = look.faceH;
  const yTop = yF + H / 2;
  const hAt = [0.8, 0.96, 1.1, 0.96, 0.8];
  const faceX = [xf * 1.04, xf * 0.8, 0, xt * 0.8, xt * 1.04];
  const faceZ = [Kz + 0.001, zFace - 0.002, zFace + 0.0025, zFace - 0.002, Kz + 0.001];
  const faceH: number[] = [];
  faceX.forEach((x, i) => {
    const h = H * hAt[i];
    faceH.push(h);
    fin.push(cp(x, yTop - h / 2 + look.tilt * x, faceZ[i], 1, i === 2 ? v3(0, 1, 0) : fanSide(x)));
  });
  const faceEnd = fin.length;
  tightEnds.push(fin.length - 1);
  // behind, up through the neck loop, over the top, and down under the band
  fin.push(cp(xt * 0.45, Ky + 0.016, Kz - 0.004, 0.6));
  fin.push(cp(0, yTop - 0.002, Kz + 0.003, 0.5, v3(1, 0, 0)));
  fin.push(cp(0, Ky + 0.006, Kz + 0.0085, 0.5));
  tightEnds.push(fin.length - 1);
  fin.push(cp(0, Ky - 0.02, Kz + 0.0085, 0.45));
  // emerging from the point of the V with a dimple
  fin.push(cp(0, yTop - H * 1.1 - 0.005, Kz + 0.0135, 0.62));
  fin.push(cp(0, hy, bodyFront(0, hy) + 0.018, 1));

  steps.push({
    title: 'Snug it up',
    text: `With your ${side('R')} hand, <b>hold the narrow end</b> behind the wide blade. With your ${side('L')} hand, <b>slide the knot up</b> to your collar, pinching just under it to make a dimple.`,
    move: 'cinch',
    landmarks: [[0, 0], [2, 2], [rc, rc], ...looseEnds.map((l, i) => [l, tightEnds[i]] as [number, number]), [pts.length - 1, fin.length - 1]],
    state: { cps: fin, headLen: 0, tailKind: 'front', right: 'narrow', left: 'knot' },
    tip: 'The tip of the wide end should just touch the top of your belt buckle.',
  });

  // Fabric budget
  const extra = moveCount - 4;
  const N = Math.min(0.44, Math.max(0.3, 0.4 - 0.022 * extra));
  const finalLen = polyLength(pts);
  const total = N + finalLen + 0.47;
  for (const s of steps) s.state.headLen = N;
  // the tight knot uses less fabric; the narrow end takes up the slack so the wide tip still meets the belt
  const finLen = polyLength(fin);
  const last = steps[steps.length - 1].state;
  last.headLen = Math.max(0.25, N + finalLen - finLen);
  // size the front band to exactly the requested height, whatever the blade width is there
  const width = tieWidth(total);
  for (let i = faceStart; i < faceEnd; i++) {
    const sMat = last.headLen + polyLength(fin.slice(0, i + 1));
    fin[i].g = faceH[i - faceStart] / width(sMat);
  }
  const splitS = N + polyLength(core.slice(0, 3 + 2 + 9));
  return { total, width, headKind: 'narrow', knotCenter: K.clone(), splitS, insideOut: seamOut, steps };
}
