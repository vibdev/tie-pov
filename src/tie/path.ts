import * as THREE from 'three';

/** A control point of a tie path. `side` is an optional hint for the ribbon's width axis. */
export interface CP {
  p: THREE.Vector3;
  side?: THREE.Vector3;
  /** width multiplier (fabric bunches up inside knots) */
  g?: number;
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const cp = (x: number, y: number, z: number, g = 1, side?: THREE.Vector3): CP => ({ p: v3(x, y, z), g, side });

const SEG = 20;

/** Default width axis for a point travelling along tangent t: perpendicular to t and to the body's outward normal. */
export function defaultSide(p: THREE.Vector3, t: THREE.Vector3, out = new THREE.Vector3()) {
  const o = new THREE.Vector3(p.x, 0, p.z);
  if (o.lengthSq() < 1e-8) o.set(0, 0, 1);
  o.normalize();
  out.crossVectors(t, o);
  return out;
}

/** A densely sampled, arc-length parameterised version of a control polyline. */
export class DensePath {
  pts: THREE.Vector3[] = [];
  sides: THREE.Vector3[] = [];
  gathers: number[] = [];
  cum: number[] = [];
  /** arc length at each control point */
  ctrlArc: number[] = [];
  length = 0;

  constructor(public cps: CP[]) {
    const n = cps.length;
    if (n < 2) {
      const p = cps[0]?.p ?? v3(0, 0, 0);
      this.pts = [p.clone(), p.clone()];
      this.sides = [v3(1, 0, 0), v3(1, 0, 0)];
      this.gathers = [1, 1];
      this.cum = [0, 0];
      this.ctrlArc = [0];
      return;
    }
    const curve = new THREE.CatmullRomCurve3(cps.map((c) => c.p), false, 'centripetal', 0.5);
    const total = SEG * (n - 1);
    const tan = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    let prevSide: THREE.Vector3 | null = null;
    let ref: THREE.Vector3 | null = null;
    let prevPt: THREE.Vector3 | null = null;
    let refGap = 0;
    for (let k = 0; k <= total; k++) {
      const u = k / total;
      const p = curve.getPoint(u);
      curve.getTangent(u, tan);
      const i = Math.min(n - 2, Math.floor(k / SEG));
      const f = k / SEG - i;
      const a = cps[i], b = cps[i + 1];
      const g = (a.g ?? 1) * (1 - f) + (b.g ?? 1) * f;
      const def = defaultSide(p, tan, new THREE.Vector3());
      let side: THREE.Vector3;
      if (!a.side && !b.side) side = def;
      else {
        const sa = a.side ? a.side.clone().normalize() : def.clone().normalize();
        const sb = b.side ? b.side.clone().normalize() : def.clone().normalize();
        if (sa.dot(sb) < 0) sb.negate();
        const w = smooth(f);
        side = sa.multiplyScalar(1 - w).add(sb.multiplyScalar(w));
      }
      side.addScaledVector(tan, -side.dot(tan));
      if (side.lengthSq() < 1e-6) side = prevSide ? prevSide.clone() : tmp.set(1, 0, 0).clone();
      side.normalize();
      // Which way round the axis points. The lie-flat rule ties it to the direction of travel, so where
      // the route doubles back on itself in a few millimetres the rule's answer swings right round.
      // Fabric cannot do that: it folds over instead, keeps its axis and shows its other face. So the
      // axis is kept from reversing against where it was a fabric-thickness-scale step (4 mm) ago,
      // which lets gentle bends turn it and makes hairpins into folds.
      if (ref) {
        if (side.dot(ref) < 0) side.negate();
        refGap += prevPt ? p.distanceTo(prevPt) : 0;
        if (refGap >= 0.004) { ref.copy(side); refGap = 0; }
      } else ref = side.clone();
      prevSide = side;
      prevPt = p;
      this.pts.push(p);
      this.sides.push(side);
      this.gathers.push(g);
    }
    this.cum = [0];
    for (let k = 1; k < this.pts.length; k++) this.cum.push(this.cum[k - 1] + this.pts[k].distanceTo(this.pts[k - 1]));
    this.length = this.cum[this.cum.length - 1];
    for (let i = 0; i < n; i++) this.ctrlArc.push(this.cum[i * SEG]);
  }

  /** sample position / side / gather at arc length s (clamped) */
  sample(s: number, outP: THREE.Vector3, outS: THREE.Vector3): number {
    const cum = this.cum;
    if (s <= 0) { outP.copy(this.pts[0]); outS.copy(this.sides[0]); return this.gathers[0]; }
    if (s >= this.length) {
      const l = this.pts.length - 1;
      outP.copy(this.pts[l]); outS.copy(this.sides[l]); return this.gathers[l];
    }
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const f = (s - cum[lo]) / seg;
    outP.lerpVectors(this.pts[lo], this.pts[hi], f);
    outS.lerpVectors(this.sides[lo], this.sides[hi], f);
    return this.gathers[lo] * (1 - f) + this.gathers[hi] * f;
  }
}

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function polyLength(cps: CP[]) {
  return new DensePath(cps).length;
}
