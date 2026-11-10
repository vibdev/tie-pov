import * as THREE from 'three';
import type { TieSim } from './sim';
import { TEX_SCALE } from './fabric';

const ACROSS = [-1, -0.6, 0, 0.6, 1];

/** Builds and updates a flat, slightly domed fabric strip following the sim samples. */
export class Ribbon {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  private posAttr: THREE.BufferAttribute;
  private uvAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private faceAttr: THREE.BufferAttribute;
  /** per-sample contact shade, smoothed over time so it never flickers */
  private shade: Float32Array;

  constructor(private sim: TieSim, private width: (s: number) => number, material: THREE.Material) {
    const M = sim.M, A = ACROSS.length;
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(M * A * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.uvAttr = new THREE.BufferAttribute(new Float32Array(M * A * 2), 2);
    this.uvAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('uv', this.uvAttr);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(M * A * 3).fill(1), 3);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('color', this.colAttr);
    this.faceAttr = new THREE.BufferAttribute(new Float32Array(M * A).fill(1), 1);
    this.faceAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('face', this.faceAttr);
    this.shade = new Float32Array(M).fill(1);
    const idx: number[] = [];
    for (let i = 0; i < M - 1; i++) {
      for (let j = 0; j < A - 1; j++) {
        const a = i * A + j, b = a + 1, c = a + A, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  update() {
    const { sim } = this;
    const M = sim.M, A = ACROSS.length;
    const P = this.posAttr.array as Float32Array;
    const U = this.uvAttr.array as Float32Array;
    const t = new THREE.Vector3();
    const n = new THREE.Vector3();
    const out = new THREE.Vector3();
    for (let i = 0; i < M; i++) {
      const p = sim.pos[i];
      const sd = sim.side[i];
      const s = sim.s(i);
      const half = (this.width(s) * sim.gather[i]) / 2;
      t.subVectors(sim.pos[Math.min(M - 1, i + 1)], sim.pos[Math.max(0, i - 1)]).normalize();
      n.crossVectors(t, sd).normalize();
      out.set(p.x, 0, p.z).normalize();
      const bulgeSign = n.dot(out) >= 0 ? 1 : -1;
      const bulge = Math.min(0.0025, half * 0.06) * bulgeSign;
      for (let j = 0; j < A; j++) {
        const a = ACROSS[j];
        const k = (i * A + j) * 3;
        const dome = bulge * (1 - a * a);
        P[k] = p.x + sd.x * half * a + n.x * dome;
        P[k + 1] = p.y + sd.y * half * a + n.y * dome;
        P[k + 2] = p.z + sd.z * half * a + n.z * dome;
        const u = (i * A + j) * 2;
        U[u] = (half * a) / TEX_SCALE;
        U[u + 1] = s / TEX_SCALE;
      }
    }
    const F = this.faceAttr.array as Float32Array;
    for (let i = 0; i < M; i++) for (let j = 0; j < A; j++) F[i * A + j] = sim.face[i];
    this.faceAttr.needsUpdate = true;
    this.updateShade();
    this.posAttr.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }

  /**
   * Contact shading: fabric with other strands of the tie stacked in front of it (further from the
   * body) is darkened in proportion to how much covers it. A strand tucked behind the whole knot ends
   * up much darker than one lying between two layers, which reads the layering at a glance.
   */
  private updateShade() {
    const { sim, shade } = this;
    const M = sim.M, A = ACROSS.length;
    const k = sim.program.knotCenter;
    const near: number[] = [];
    for (let i = 0; i < M; i++) if (sim.pos[i].distanceToSquared(k) < 0.13 * 0.13) near.push(i);
    const raw = new Float32Array(M);
    const out = new THREE.Vector3();
    const d = new THREE.Vector3();
    const R = 0.02;
    for (const i of near) {
      const p = sim.pos[i];
      out.set(p.x, 0, p.z).normalize();
      let cover = 0;
      for (const j of near) {
        if (Math.abs(i - j) < 10) continue; // the strand itself
        d.subVectors(sim.pos[j], p);
        const depth = d.dot(out);
        if (depth < 0.0015) continue; // not in front of this point
        d.addScaledVector(out, -depth);
        const lat = d.length();
        const halfW = (this.width(sim.s(j)) * sim.gather[j]) / 2;
        const reach = Math.min(R, halfW + 0.004);
        if (lat >= reach) continue;
        cover += (1 - lat / reach) * Math.min(1, depth / 0.004);
      }
      raw[i] = cover;
    }
    // each covering strand contributes ~ one sample per 4mm of its width; normalise, smooth along the tie
    const target = new Float32Array(M);
    for (let i = 0; i < M; i++) {
      let acc = 0, n = 0;
      for (let o = -3; o <= 3; o++) {
        const j = i + o;
        if (j < 0 || j >= M) continue;
        acc += raw[j];
        n++;
      }
      const c = acc / n / 5; // ≈ number of layers in front
      target[i] = 1 - Math.min(0.62, 0.3 * c + 0.12 * c * c);
    }
    const C = this.colAttr.array as Float32Array;
    for (let i = 0; i < M; i++) {
      shade[i] += (target[i] - shade[i]) * 0.25;
      const v = shade[i];
      for (let j = 0; j < A; j++) {
        const q = (i * A + j) * 3;
        C[q] = C[q + 1] = C[q + 2] = v;
      }
    }
  }

  dispose() {
    this.geo.dispose();
  }
}
