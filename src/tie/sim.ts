import * as THREE from 'three';
import { defaultSide } from './path';
import { bodyFront, pushOutOfBody } from '../scene/bodyShape';
import type { Program } from '../knots/types';

const SPACING = 0.004;
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** pin(…, face = OUTSIDE): whichever face of this fabric points away from the body is the front */
export const OUTSIDE = 2;
const SUB = 6;
const ITERS = 3;
const GRAVITY = -9.8;

/**
 * The tie as a chain of material samples (index 0 = narrow tip, last = wide tip), 4 mm apart.
 *
 * Every frame the choreography *pins* whichever samples a hand or the knot is holding; everything
 * else is a cloth rope: inextensible, a little stiff, heavy, and unable to pass through the body.
 * Any set of samples can be pinned, so a slack loop between two held places just works.
 */
export class TieSim {
  readonly M: number;
  readonly ds: number;
  pos: THREE.Vector3[];
  prev: THREE.Vector3[];
  side: THREE.Vector3[];
  gather: Float32Array;
  /** which face of the fabric the ribbon's +normal side is: +1 normal, -1 turned over (see Choreo.faces) */
  face: Float32Array;
  private faceIn: Float32Array;

  /** pinned this frame */
  kin: Uint8Array;
  private wasKin: Uint8Array;
  private target: THREE.Vector3[];
  private hint: THREE.Vector3[];
  private hasHint: Uint8Array;
  private vel: THREE.Vector3[];
  private softW: Float32Array;
  private softT: THREE.Vector3[];
  private nearLo: Int32Array;
  private nearHi: Int32Array;
  private sidesReady = false;

  /** first pinned sample: everything below it is the narrow end hanging free */
  kinStart = 0;
  /** the sample a hand is carrying (for hand / marker placement) */
  gripIndex = 0;
  /** where the free wide end wants to lie where it overlaps the narrow end: 1 = in front, 0 = behind */
  tailFront = 1;
  /** 0 = no layering preference at all (bow ties) */
  tailLayered = 1;
  /** the free wide end may not sink into the knot: z of the knot's front surface */
  bulgeZ = 0;
  private layerNow = 1;
  /** this frame's pins give the width axis the right way round already: do not re-sign it along the chain */
  trustHints = false;

  constructor(public program: Program) {
    this.M = Math.max(2, Math.round(program.total / SPACING) + 1);
    this.ds = program.total / (this.M - 1);
    const mk = () => Array.from({ length: this.M }, () => new THREE.Vector3());
    this.pos = mk(); this.prev = mk(); this.side = mk();
    this.target = mk(); this.hint = mk(); this.vel = mk(); this.softT = mk();
    this.gather = new Float32Array(this.M).fill(1);
    this.face = new Float32Array(this.M).fill(program.insideOut ? -1 : 1);
    this.faceIn = new Float32Array(this.M).fill(1);
    this.kin = new Uint8Array(this.M);
    this.wasKin = new Uint8Array(this.M);
    this.hasHint = new Uint8Array(this.M);
    this.softW = new Float32Array(this.M);
    this.nearLo = new Int32Array(this.M);
    this.nearHi = new Int32Array(this.M);
  }

  s(i: number) { return i * this.ds; }

  /** forget last frame's pins; call before pinning */
  beginFrame() {
    this.wasKin.set(this.kin);
    this.kin.fill(0);
    this.hasHint.fill(0);
    this.softW.fill(0);
    this.trustHints = false;
  }

  /** hold sample i at p this frame (side = the ribbon's width axis there, g = how bunched the fabric is) */
  pin(i: number, p: THREE.Vector3, side?: THREE.Vector3, g = 1, face = 1) {
    this.kin[i] = 1;
    this.faceIn[i] = face;
    this.target[i].copy(p);
    if (side) { this.hint[i].copy(side); this.hasHint[i] = 1; }
    this.gather[i] = g;
  }

  /** pull a free sample toward p (a hand guiding fabric it is not gripping) */
  nudge(i: number, p: THREE.Vector3, w: number) {
    this.softT[i].copy(p);
    this.softW[i] = w;
  }

  /** drop everything where it is: no velocities (after a jump to another step) */
  freeze() {
    for (let i = 0; i < this.M; i++) { this.prev[i].copy(this.pos[i]); this.vel[i].set(0, 0, 0); }
    this.layerNow = this.tailFront;
  }

  /** initial pose for the free ends: hanging straight down from whatever is pinned */
  hang() {
    this.applyPins();
    const ds = this.ds;
    let last = -1;
    for (let i = 0; i < this.M; i++) {
      if (this.kin[i]) { last = i; continue; }
      if (last < 0) continue;
      const a = this.pos[i - 1];
      this.pos[i].set(a.x, a.y - ds, a.z + 0.0005);
      pushOutOfBody(this.pos[i], 0.012);
    }
    for (let i = this.kinStart - 1; i >= 0; i--) {
      const a = this.pos[i + 1];
      this.pos[i].set(a.x, a.y - ds, a.z);
      pushOutOfBody(this.pos[i], 0.01);
    }
    this.freeze();
    this.sidesReady = false;
  }

  private applyPins() {
    let first = -1;
    for (let i = 0; i < this.M; i++) {
      if (!this.kin[i]) continue;
      if (first < 0) first = i;
      this.vel[i].subVectors(this.target[i], this.pos[i]);
      this.pos[i].copy(this.target[i]);
      this.prev[i].copy(this.target[i]);
    }
    this.kinStart = Math.max(0, first);
  }

  step(dt: number) {
    const { M } = this;
    // a sample that was held last frame and is let go now keeps the speed it was carried at
    for (let i = 0; i < M; i++) {
      if (this.wasKin[i] && !this.kin[i]) {
        const v = this.vel[i];
        const l = v.length();
        if (l > 0.02) v.multiplyScalar(0.02 / l);
        this.prev[i].copy(this.pos[i]).addScaledVector(v, -1 / SUB);
      }
      if (!this.kin[i]) this.gather[i] += (1 - this.gather[i]) * 0.12; // bunched fabric opens out again
    }
    this.applyPins();
    // nearest pinned neighbours, for the hard length limit
    let lo = -1;
    for (let i = 0; i < M; i++) { if (this.kin[i]) lo = i; this.nearLo[i] = lo; }
    let hi = -1;
    for (let i = M - 1; i >= 0; i--) { if (this.kin[i]) hi = i; this.nearHi[i] = hi; }

    this.layerNow += (this.tailFront - this.layerNow) * Math.min(1, dt * 7);
    const h = Math.min(dt, 1 / 30) / SUB;
    for (let k = 0; k < SUB; k++) this.substep(h);
    this.computeSides();
  }

  private substep(h: number) {
    const { pos, prev, kin, M, ds } = this;
    const damp = 0.991;
    const gy = GRAVITY * h * h;
    for (let i = 0; i < M; i++) {
      if (kin[i]) continue;
      const p = pos[i], q = prev[i];
      const vx = (p.x - q.x) * damp, vy = (p.y - q.y) * damp, vz = (p.z - q.z) * damp;
      q.copy(p);
      p.x += vx; p.y += vy + gy; p.z += vz;
    }
    for (let it = 0; it < ITERS; it++) {
      // fabric is not string: it resists sharp bends
      for (let i = 1; i < M - 1; i++) {
        if (kin[i]) continue;
        const a = pos[i - 1], b = pos[i + 1], p = pos[i];
        p.x += ((a.x + b.x) * 0.5 - p.x) * 0.14;
        p.y += ((a.y + b.y) * 0.5 - p.y) * 0.14;
        p.z += ((a.z + b.z) * 0.5 - p.z) * 0.14;
      }
      for (let i = 0; i < M; i++) {
        const w = this.softW[i];
        if (w > 0 && !kin[i]) pos[i].lerp(this.softT[i], w);
      }
      // it does not stretch
      if (it % 2 === 0) for (let i = 0; i < M - 1; i++) this.link(i, i + 1);
      else for (let i = M - 2; i >= 0; i--) this.link(i, i + 1);
      // ... at all: no sample can be further from a held one than the fabric between them
      for (let i = 0; i < M; i++) {
        if (kin[i]) continue;
        const a = this.nearLo[i], b = this.nearHi[i];
        if (a >= 0) this.leash(i, a, (i - a) * ds);
        if (b >= 0) this.leash(i, b, (b - i) * ds);
      }
      this.collide();
    }
  }

  private link(i: number, j: number) {
    const a = this.pos[i], b = this.pos[j];
    const ka = this.kin[i], kb = this.kin[j];
    if (ka && kb) return;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
    const c = (l - this.ds) / l;
    const wa = ka ? 0 : kb ? 1 : 0.5, wb = kb ? 0 : ka ? 1 : 0.5;
    a.x += dx * c * wa; a.y += dy * c * wa; a.z += dz * c * wa;
    b.x -= dx * c * wb; b.y -= dy * c * wb; b.z -= dz * c * wb;
  }

  private leash(i: number, k: number, max: number) {
    const p = this.pos[i], a = this.pos[k];
    const dx = p.x - a.x, dy = p.y - a.y, dz = p.z - a.z;
    const l2 = dx * dx + dy * dy + dz * dz;
    if (l2 <= max * max) return;
    const f = max / Math.sqrt(l2);
    p.set(a.x + dx * f, a.y + dy * f, a.z + dz * f);
  }

  /** the body, and the order the hanging blades lie in (wide in front of or behind narrow) */
  private collide() {
    const { pos, kin, M } = this;
    const knot = this.program.knotCenter;
    const narrow = this.program.headKind === 'narrow';
    const f = this.layerNow;
    for (let i = 0; i < M; i++) {
      if (kin[i]) continue;
      const p = pos[i];
      const isHead = i < this.kinStart;
      const layered = isHead ? (narrow ? 1 : 0) : this.tailLayered;
      if (layered > 0) {
        const wx = 1 - sstep(0.07, 0.11, Math.abs(p.x));
        const wy = 1 - sstep(knot.y - 0.06, knot.y - 0.02, p.y);
        const w = wx * wy * layered;
        if (w > 0) {
          const bf = bodyFront(p.x, p.y);
          if (isHead) {
            if (p.z > bf + 0.0115) p.z += (bf + 0.0115 - p.z) * w;
            if (p.z < bf + 0.0095) p.z = bf + 0.0095;
          } else {
            const lo = bf + 0.003 + (0.001 + 0.014 * w) * f;
            const hi = bf + 0.0065 + 0.3 * f * f;
            // eased in and velocity-neutral: the blades slide past each other, they are not flicked apart
            let dz = 0;
            if (p.z > hi) dz = Math.max((hi - p.z) * w, -0.0005);
            else if (p.z < lo) dz = Math.min(lo - p.z, 0.0005);
            p.z += dz; this.prev[i].z += dz;
          }
        }
        // the free wide end drapes over the knot, not through it
        if (!isHead && f > 0.5 && this.bulgeZ > 0) {
          const k = (1 - sstep(0.012, 0.03, Math.abs(p.x - knot.x))) * (1 - sstep(0.025, 0.05, Math.abs(p.y - knot.y)));
          const z = this.bulgeZ + 0.003;
          if (k > 0 && p.z < z) { const dz = Math.min((z - p.z) * k, 0.0008); p.z += dz; this.prev[i].z += dz; }
        }
      }
      pushOutOfBody(p, isHead && narrow ? 0.0095 : 0.004);
      if (p.y < -1.46) p.y = -1.46;
    }
  }

  /**
   * The ribbon's width axis at every sample. Held fabric takes it from the route; free fabric carries
   * it along from its neighbour without twisting, relaxing toward lying flat against the body. The
   * sign is carried along the chain, so one face of the tie stays one face however it is folded.
   */
  computeSides() {
    const { pos, side, kin, M } = this;
    const t = new THREE.Vector3();
    const c = new THREE.Vector3();
    const d = new THREE.Vector3();
    const tan = (i: number) => t.subVectors(pos[Math.min(M - 1, i + 1)], pos[Math.max(0, i - 1)]).normalize();
    const k0 = this.kinStart;
    const one = (i: number, from: number) => {
      tan(i);
      const ref = side[from];
      if (kin[i] && this.hasHint[i]) c.copy(this.hint[i]);
      else {
        c.copy(ref);
        defaultSide(pos[i], t, d);
        if (d.lengthSq() > 0.04) { d.normalize(); if (d.dot(ref) < 0) d.negate(); c.addScaledVector(d, 0.3); }
      }
      c.addScaledVector(t, -c.dot(t));
      if (c.lengthSq() < 1e-8) c.copy(ref);
      c.normalize();
      if (c.dot(ref) < 0 && !(this.trustHints && kin[i] && this.hasHint[i])) c.negate();
      side[i].copy(c);
    };
    // the anchor lies against the body the same way round, always: that fixes which face is which
    tan(k0);
    if (kin[k0] && this.hasHint[k0]) c.copy(this.hint[k0]); else defaultSide(pos[k0], t, c);
    c.addScaledVector(t, -c.dot(t));
    if (c.lengthSq() < 1e-8) c.set(1, 0, 0);
    c.normalize();
    d.crossVectors(t, c);
    if (d.x * pos[k0].x + d.z * pos[k0].z > 0) c.negate();
    side[k0].copy(c);
    for (let i = k0 + 1; i < M; i++) one(i, i - 1);
    for (let i = k0 - 1; i >= 0; i--) one(i, i + 1);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < M - 1; i++) {
        c.copy(side[i - 1]).add(side[i + 1]).multiplyScalar(0.5).add(side[i]);
        tan(i);
        c.addScaledVector(t, -c.dot(t));
        if (c.lengthSq() > 1e-8) side[i].copy(c.normalize());
      }
    }
    this.sidesReady = true;
    // loose fabric is the same way round as the held fabric it hangs from
    if (this.program.reversible) { this.face.fill(0); return; }
    const base = this.program.insideOut ? -1 : 1;
    for (let i = k0; i < M; i++) {
      const before = this.face[Math.max(k0, i - 1)];
      if (!kin[i]) this.face[i] = before;
      else if (this.faceIn[i] !== OUTSIDE) this.face[i] = base * this.faceIn[i];
      else {
        tan(i);
        d.crossVectors(t, side[i]);
        const o = (d.x * pos[i].x + d.z * pos[i].z) / (Math.hypot(pos[i].x, pos[i].z) || 1);
        this.face[i] = Math.abs(o) < 0.3 && i > k0 ? before : o < 0 ? 1 : -1;
      }
    }
    for (let i = k0 - 1; i >= 0; i--) this.face[i] = this.face[i + 1];
  }

  snapshot() {
    return { pos: this.pos.map((p) => p.clone()), side: this.side.map((s) => s.clone()), kin: this.kin.slice() };
  }
}
