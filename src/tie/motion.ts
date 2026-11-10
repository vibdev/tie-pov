import * as THREE from 'three';
import { DensePath, cp, easeInOut, smooth, type CP } from './path';
import { bodyFront, pushOutOfBody } from '../scene/bodyShape';
import type { MoveKind, Program, TieState } from '../knots/types';
import { OUTSIDE, type TieSim } from './sim';

/** seconds at 1× speed */
const DUR: Record<MoveKind, number> = { reshape: 1.5, lay: 1.8, thread: 3.6, cinch: 2.8 };
const sstep = (a: number, b: number, x: number) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));

export interface Move {
  kind: MoveKind;
  /** seconds at 1× speed */
  dur: number;
  /** pin the fabric for progress e in [0, 1] */
  apply(e: number): void;
}

/** z of the front of the knot as tied so far */
function bulgeOf(st: TieState, knot: THREE.Vector3) {
  let z = 0;
  for (const c of st.cps) if (Math.abs(c.p.y - knot.y) < 0.035 && Math.abs(c.p.x - knot.x) < 0.05) z = Math.max(z, c.p.z);
  return z;
}

/** where the active end hangs once it leaves the route: straight down the chest, in front of or behind the narrow end */
function exitCps(st: TieState, need: number, knot: THREE.Vector3, bulge: number): CP[] {
  const B = st.cps[st.cps.length - 1].p;
  const off = st.tailKind === 'front' ? 0.018 : st.tailKind === 'back' ? 0.005 : 0.012;
  const out: CP[] = [];
  const STEP = 0.05;
  for (let k = 1; (k - 2) * STEP < need; k++) {
    const y = B.y - STEP * k;
    let z = bodyFront(B.x, y) + off;
    z = B.z + (z - B.z) * smooth(Math.min(1, k / 3));
    if (st.tailKind !== 'back') {
      // over the knot, not through it
      const over = (1 - sstep(0.03, 0.06, Math.abs(B.x - knot.x))) * sstep(knot.y - 0.085, knot.y - 0.04, y);
      z = Math.max(z, bodyFront(B.x, y) + (bulge + 0.004 - bodyFront(B.x, y)) * over);
    }
    out.push(cp(B.x, y, z, k < 2 ? 0.9 : 1));
  }
  return out;
}

/**
 * Turns a knot program into motion. Each step has a route (a curve the held fabric lies along);
 * a move decides, moment by moment, which fabric is held where. Everything not held is simulated.
 */
export class Choreo {
  /** each step's route, continued past its end by the line the loose end hangs along */
  paths: DensePath[];
  /** arc length of the route proper */
  routeLen: number[];
  private bulge: number[];
  /**
   * How to tell which face of the fabric shows. While the knot is being tied that simply follows from
   * how the fabric has been folded. The tight route of a finished knot is drawn for its shape alone, so
   * there the rule is the result we know to be true: the outside of a finished knot is the front.
   */
  private faces: number[];
  private P = new THREE.Vector3();
  private S = new THREE.Vector3();
  private P2 = new THREE.Vector3();
  private S2 = new THREE.Vector3();

  constructor(public program: Program, public sim: TieSim) {
    const k = program.knotCenter;
    this.bulge = program.steps.map((s) => bulgeOf(s.state, k));
    this.paths = program.steps.map((s, i) => {
      const need = program.total - s.state.headLen;
      return new DensePath([...s.state.cps, ...exitCps(s.state, need, k, this.bulge[i])]);
    });
    this.routeLen = program.steps.map((s, i) => this.paths[i].ctrlArc[s.state.cps.length - 1]);
    this.faces = program.steps.map((s) => (s.move === 'cinch' ? OUTSIDE : 1));
    // every route's width axis the right way round: its start lies face-out against the chest
    for (const p of this.paths) {
      const n = new THREE.Vector3().subVectors(p.pts[1], p.pts[0]).normalize().cross(p.sides[0]);
      if (n.x * p.pts[0].x + n.z * p.pts[0].z > 0) for (const sd of p.sides) sd.negate();
    }
  }

  private layers(i: number) {
    const st = this.program.steps[i].state;
    this.sim.tailLayered = st.tailKind === 'free' ? 0 : 1;
    this.sim.tailFront = st.tailKind === 'back' ? 0 : 1;
    // only an end that comes out over the top of the knot has to drape over the front of it
    const B = st.cps[st.cps.length - 1].p;
    this.sim.bulgeZ = st.tailKind === 'front' && B.y > this.program.knotCenter.y && Math.abs(B.x) < 0.02 ? this.bulge[i] : 0;
  }

  /** hold the fabric along `path` from its start up to arc `upTo`; below `altUpTo`, cross-fade from `alt` */
  private pinRoute(path: DensePath, headLen: number, upTo: number, alt?: DensePath, altUpTo = 0, w = 1, altEnd = altUpTo, face = 1) {
    const { sim, P, S, P2, S2 } = this;
    let last = -1;
    for (let i = 0; i < sim.M; i++) {
      const sp = sim.s(i) - headLen;
      if (sp < -1e-6) continue;
      if (sp > upTo + 1e-6) break;
      let g = path.sample(sp, P, S);
      if (alt && w < 1 && sp <= altUpTo) {
        // the two routes agree except near their shared end, where their arc lengths drift apart
        const g2 = alt.sample(sp + (altEnd - altUpTo) * Math.min(1, Math.max(0, (sp - altUpTo + 0.06) / 0.06)), P2, S2);
        if (S2.dot(S) < 0) S2.negate();
        P.lerpVectors(P2, P, w);
        S.lerpVectors(S2, S, w);
        g = g2 + (g - g2) * w;
      }
      sim.pin(i, P, S, g, face);
      last = i;
    }
    return last;
  }

  /** the finished pose of step i: the whole route held, both ends hanging */
  pose(i: number) {
    this.layers(i);
    this.sim.trustHints = true;
    const last = this.pinRoute(this.paths[i], this.program.steps[i].state.headLen, this.routeLen[i], undefined, 0, 1, 0, this.faces[i]);
    this.sim.gripIndex = Math.max(0, last);
  }

  /** jump straight to step i and let the loose ends come to rest */
  settle(i: number, iters = 90) {
    const { sim } = this;
    sim.beginFrame();
    this.pose(i);
    sim.hang();
    for (let k = 0; k < iters; k++) {
      sim.beginFrame();
      this.pose(i);
      sim.step(1 / 60);
    }
  }

  /** the move that takes the tie from settled step `from` into step `to` */
  begin(from: number, to: number): Move {
    const step = this.program.steps[to];
    const kind: MoveKind = to === from + 1 ? step.move : 'reshape';
    this.layers(to);
    const apply =
      kind === 'lay' ? this.lay(from, to)
      : kind === 'thread' ? this.thread(from, to)
      : kind === 'cinch' && step.landmarks ? this.cinch(from, to, step.landmarks)
      : this.reshape(to);
    return { kind, dur: DUR[kind], apply };
  }

  // ---------------------------------------------------------------- lay

  /**
   * A hand carries the active end along the new stretch of route. The rest of the end hangs from
   * the hand the whole way and, where the move turns it over (passing behind the knot, say), it
   * turns like a page so you see the other face come round.
   */
  private lay(from: number, to: number) {
    const { sim, program, P, S } = this;
    const st = program.steps[to].state;
    const path = this.paths[to], hang = this.paths[from];
    const e0 = path.ctrlArc[program.steps[from].state.cps.length - 1];
    const a0 = this.routeLen[from];
    const e1 = this.routeLen[to];
    const A = new THREE.Vector3(), B = new THREE.Vector3(), G = new THREE.Vector3(), GS = new THREE.Vector3();
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), s0 = new THREE.Vector3(), s1 = new THREE.Vector3(), tmp = new THREE.Vector3();
    hang.sample(a0, A, tmp);
    path.sample(e1, B, tmp);
    const was = program.steps[from].state.tailKind === 'back' ? 0 : 1;
    const will = st.tailKind === 'back' ? 0 : 1;
    const DOWN = new THREE.Vector3(0, -1, 0);
    let snap: THREE.Vector3[] | null = null;
    return (e: number) => {
      snap ??= sim.pos.map((p) => p.clone());
      const settle = sstep(0, 0.15, e);
      sim.tailFront = was + (will - was) * sstep(0.3, 0.75, e);
      sim.trustHints = true;
      const g = e0 + (e1 - e0) * easeInOut(e);
      const w = sstep(0.2, 0.8, e);
      const base = this.pinRoute(path, st.headLen, g, hang, e0, sstep(0, 0.3, e), a0);
      sim.gripIndex = Math.max(0, base);
      path.sample(g, G, GS);
      for (let i = base + 1; i < sim.M; i++) {
        const d = sim.s(i) - st.headLen - g; // fabric between the hand and this sample
        hang.sample(a0 + d, p0, s0);
        path.sample(e1 + d, p1, s1);
        // hanging from the hand, in a shape that goes from how it hung before to how it will hang after
        P.copy(G).add(p0.sub(A).lerp(p1.sub(B), w));
        if (s0.dot(s1) >= 0) S.lerpVectors(s0, s1, w);
        else S.copy(s0).multiplyScalar(Math.cos(Math.PI * w)).addScaledVector(tmp.crossVectors(DOWN, s0), Math.sin(Math.PI * w) * (s0.x * G.x > 0 ? 1 : -1));
        // right at the hand the fabric is held the way the route holds it
        const k = 1 - sstep(0, 0.035, d);
        if (k > 0 && S.dot(GS) > -0.2) S.lerp(GS, k);
        pushOutOfBody(P, 0.004);
        if (settle < 1) P.lerpVectors(snap[i], P, settle);
        sim.pin(i, P, S, 1);
      }
    };
  }

  // ---------------------------------------------------------------- thread

  /**
   * The end goes through an opening the way it really does: tip first. The end is folded up on
   * itself until its tip reaches the opening, the tip is fed in, and the whole end is pulled through
   * after it; the fold shrinks until it is gone. All of the end is held throughout (it is in your
   * hands), so the doubled blade stays flat and readable.
   */
  private thread(from: number, to: number) {
    const { sim, program, P, S } = this;
    const st = program.steps[to].state;
    const path = this.paths[to];
    const hang = this.paths[from]; // past its route, the line the end was hanging along
    const e0 = path.ctrlArc[program.steps[from].state.cps.length - 1];
    const a0 = this.routeLen[from];
    const L = program.total - (st.headLen + e0); // fabric that has to pass through
    const A = new THREE.Vector3(), T = new THREE.Vector3(), out = new THREE.Vector3(), tmp = new THREE.Vector3();
    path.sample(e0, A, tmp);
    path.sample(e0 + 0.008, T, tmp);
    T.sub(A).normalize();
    out.set(A.x, 0, A.z).normalize();
    // the returning half of the fold lies just in front of the hanging half (and clear of the narrow end)
    const off = out.clone().multiplyScalar(0.013);
    if (program.steps[from].state.tailKind === 'back') off.x += Math.sign(A.x || 1) * 0.022;
    const LIFT = 0.36;
    let snap: THREE.Vector3[] | null = null;
    return (e: number) => {
      snap ??= sim.pos.map((p) => p.clone());
      sim.trustHints = true;
      const base = this.pinRoute(path, st.headLen, e0, hang, e0, sstep(0, 0.3, e), a0);
      const M = sim.M;
      sim.gripIndex = Math.max(base + 1, M - 1 - Math.round(0.025 / sim.ds));
      const sigma = e < LIFT ? 0 : easeInOut((e - LIFT) / (1 - LIFT)) * L; // how far the tip is past the opening
      const D = e < LIFT ? L - (L / 2) * easeInOut(e / LIFT) : (L - sigma) / 2; // where the fold is
      const settle = sstep(0, 0.12, e);
      const aim = sstep(LIFT * 0.6, LIFT, e);
      for (let i = M - 1; i > base; i--) {
        const x = (M - 1 - i) * sim.ds; // distance back from the tip
        let g = 1;
        if (x < sigma) g = path.sample(e0 + sigma - x, P, S);
        else {
          const d = L - x; // distance from the opening along the fabric
          if (d <= D) hang.sample(a0 + d, P, S);
          else {
            const back = 2 * D - d; // how far below the opening, on the returning half
            hang.sample(a0 + back, P, S);
            P.addScaledVector(off, sstep(0, 0.018, d - D));
            // the last few centimetres line up with the opening
            const k = aim * (1 - sstep(0, 0.045, back)) * sstep(0, 0.03, d - D);
            if (k > 0) P.lerp(tmp.copy(A).addScaledVector(T, -back).addScaledVector(out, 0.3 * back), k);
          }
          if (settle < 1) P.lerpVectors(snap[i], P, settle);
        }
        sim.pin(i, P, S, g);
      }
    };
  }

  // ---------------------------------------------------------------- reshape

  /** held fabric is carried straight to its new place */
  private reshape(to: number) {
    const { sim, program, P, S } = this;
    const st = program.steps[to].state;
    const path = this.paths[to];
    const upTo = this.routeLen[to];
    let snap: ReturnType<TieSim['snapshot']> | null = null;
    let g0: Float32Array | null = null;
    return (e: number) => {
      if (!snap) { snap = sim.snapshot(); g0 = sim.gather.slice(); }
      const u = easeInOut(e);
      let last = 0;
      for (let i = 0; i < sim.M; i++) {
        const sp = sim.s(i) - st.headLen;
        if (sp < -1e-6) continue;
        if (sp > upTo + 1e-6) break;
        const g = path.sample(sp, P, S);
        const fs = snap.side[i];
        if (fs.dot(S) < 0) S.negate();
        S.lerpVectors(fs, S, u);
        P.lerpVectors(snap.pos[i], P, u);
        sim.pin(i, P, S, g0![i] + (g - g0![i]) * u);
        last = i;
      }
      sim.gripIndex = last;
    };
  }

  // ---------------------------------------------------------------- cinch

  /**
   * Pulling the knot tight. The loose route shrinks, loop for loop, into the tight one; the fabric
   * stays the length it is, so it slides through the knot and out into the narrow end.
   */
  private cinch(from: number, to: number, landmarks: [number, number][]) {
    const { sim, program } = this;
    const loose = this.paths[from], tight = this.paths[to];
    const hFrom = program.steps[from].state.headLen, hTo = program.steps[to].state.headLen;
    const lenFrom = this.routeLen[from], lenTo = this.routeLen[to];
    const { N, tp, ts, tg } = this.match(from, to, landmarks);
    const bp = Array.from({ length: N }, () => new THREE.Vector3());
    const cum = new Float32Array(N);
    const { P, S } = this;
    return (e: number) => {
      const w = easeInOut(e);
      sim.trustHints = true;
      for (let j = 0; j < N; j++) {
        bp[j].lerpVectors(loose.pts[j], tp[j], w);
        cum[j] = j ? cum[j - 1] + bp[j].distanceTo(bp[j - 1]) : 0;
      }
      const len = cum[N - 1];
      // the wide end does not slip: all the slack comes out through the narrow end
      const headLen = hFrom + lenFrom + (hTo + lenTo - hFrom - lenFrom) * w - len;
      let j = 0, last = 0;
      for (let i = 0; i < sim.M; i++) {
        const sp = sim.s(i) - headLen;
        if (sp < 0) continue;
        if (sp > len) break;
        while (j < N - 2 && cum[j + 1] < sp) j++;
        const f = Math.min(1, (sp - cum[j]) / (cum[j + 1] - cum[j] || 1));
        P.lerpVectors(bp[j], bp[j + 1], f);
        const a = j, b = j + 1;
        S.lerpVectors(loose.sides[a], ts[a], w).lerp(tmpS.lerpVectors(loose.sides[b], ts[b], w), f);
        const ga = loose.gathers[a] + (tg[a] - loose.gathers[a]) * w, gb = loose.gathers[b] + (tg[b] - loose.gathers[b]) * w;
        sim.pin(i, P, S, ga + (gb - ga) * f, e >= 1 ? OUTSIDE : 1);
        last = i;
      }
      sim.gripIndex = last;
    };
  }

  /** for each point of the loose route, the matching point of the tight one (landmark to landmark) */
  private match(from: number, to: number, landmarks: [number, number][]) {
    const loose = this.paths[from], tight = this.paths[to];
    const lenFrom = this.routeLen[from], lenTo = this.routeLen[to];
    const la = landmarks.map(([a]) => loose.ctrlArc[a]);
    const ta = landmarks.map(([, b]) => tight.ctrlArc[b]);
    const toTight = (u: number) => {
      let k = 0;
      while (k < la.length - 2 && u > la[k + 1]) k++;
      const f = Math.min(1, Math.max(0, (u - la[k]) / (la[k + 1] - la[k] || 1)));
      return ta[k] + (ta[k + 1] - ta[k]) * f;
    };
    const n = loose.cum.findIndex((c) => c > lenFrom);
    const N = n < 0 ? loose.pts.length : n + 1;
    const tp: THREE.Vector3[] = [], ts: THREE.Vector3[] = [];
    const tg = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      const p = new THREE.Vector3(), s = new THREE.Vector3();
      tg[j] = tight.sample(Math.min(lenTo, toTight(loose.cum[j])), p, s);
      if (s.dot(loose.sides[j]) < 0) s.negate();
      tp.push(p); ts.push(s);
    }
    return { N, tp, ts, tg };
  }
}
const tmpS = new THREE.Vector3();
