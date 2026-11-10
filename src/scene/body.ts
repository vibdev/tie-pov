import * as THREE from 'three';
import { torsoAt, bodyFront } from './bodyShape';

function oxfordTexture(base: string, light: string, dark: string) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2)
    for (let x = 0; x < S; x += 2) {
      g.fillStyle = (x / 2 + y / 2) % 2 ? light : dark;
      g.globalAlpha = 0.35 + Math.random() * 0.25;
      g.fillRect(x, y, 2, 2);
    }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeShirtMaterial() {
  const tex = oxfordTexture('#dfe7f2', '#ffffff', '#c9d6e8');
  tex.repeat.set(40, 60);
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
}

export const skinMaterial = new THREE.MeshStandardMaterial({ color: '#d9a07e', roughness: 0.55 });

/** Elliptic torso built from the shared profile, between y0 (top) and y1 (bottom). */
function torsoGeometry(y0: number, y1: number, rows: number, cols = 64, offset = 0) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const y = y0 + ((y1 - y0) * r) / rows;
    const { a, b } = torsoAt(y);
    for (let c = 0; c <= cols; c++) {
      const t = (c / cols) * Math.PI * 2;
      pos.push(Math.sin(t) * (a + offset), y, Math.cos(t) * (b + offset));
      uv.push(c / cols, y);
    }
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** bilinear patch with a dome, used for collar points */
function patch(q00: THREE.Vector3, q10: THREE.Vector3, q01: THREE.Vector3, q11: THREE.Vector3, dome: THREE.Vector3, nu = 8, nv = 12) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      p.set(0, 0, 0)
        .addScaledVector(q00, (1 - u) * (1 - v))
        .addScaledVector(q10, u * (1 - v))
        .addScaledVector(q01, (1 - u) * v)
        .addScaledVector(q11, u * v)
        .addScaledVector(dome, Math.sin(Math.PI * u) * Math.sin(Math.PI * v));
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a truncated-cone band around the neck, open in front */
function band(rTop: number, yTop: number, rBot: number, yBot: number, gap: number, cols = 48) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rows = 3;
  for (let r = 0; r <= rows; r++) {
    const f = r / rows;
    const rr = rTop + (rBot - rTop) * f;
    const y = yTop + (yBot - yTop) * f;
    for (let c = 0; c <= cols; c++) {
      const t = gap + ((Math.PI * 2 - 2 * gap) * c) / cols;
      pos.push(Math.sin(t) * rr, y, Math.cos(t) * rr);
      uv.push(c / cols * 8, f);
    }
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildBody(shirt: THREE.Material) {
  const body = new THREE.Group();
  const add = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  };

  const trousers = new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.9 });
  const leather = new THREE.MeshStandardMaterial({ color: '#3b2417', roughness: 0.45 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c8a55a', roughness: 0.3, metalness: 0.9 });
  const button = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.3 });

  add(torsoGeometry(-0.005, -0.625, 70), shirt);
  add(torsoGeometry(-0.6, -0.88, 12), trousers);
  // belt
  add(torsoGeometry(-0.605, -0.645, 2, 64, 0.004), leather);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.042, 0.008), brass);
  buckle.position.set(0, -0.625, bodyFront(0, -0.625) + 0.008);
  buckle.castShadow = true;
  body.add(buckle);

  // neck
  const neck = add(new THREE.CylinderGeometry(0.057, 0.06, 0.1, 32, 1, true), skinMaterial, false);
  neck.position.set(0, 0.03, -0.002);
  neck.name = 'neck';

  // collar stand, leaf and points
  add(band(0.066, 0.033, 0.068, -0.008, 0.14), shirt);
  add(band(0.073, 0.039, 0.087, -0.007, 0.6), shirt);
  for (const s of [1, -1]) {
    const g = patch(
      new THREE.Vector3(s * 0.011, 0.031, 0.084),
      new THREE.Vector3(s * 0.045, 0.039, 0.06),
      new THREE.Vector3(s * 0.055, -0.064, 0.114),
      new THREE.Vector3(s * 0.078, -0.011, 0.075),
      new THREE.Vector3(0, 0, 0.006),
    );
    add(g, shirt);
  }

  // buttons down the placket
  const bg = new THREE.CylinderGeometry(0.0055, 0.0055, 0.002, 16);
  bg.rotateX(Math.PI / 2);
  for (let y = -0.1; y > -0.6; y -= 0.095) {
    const b = new THREE.Mesh(bg, button);
    b.position.set(0, y, bodyFront(0, y) + 0.001);
    body.add(b);
  }
  // breast pocket (a hint of one)
  const pocket = patch(
    new THREE.Vector3(0.06, -0.15, 0),
    new THREE.Vector3(0.15, -0.15, 0),
    new THREE.Vector3(0.06, -0.27, 0),
    new THREE.Vector3(0.15, -0.27, 0),
    new THREE.Vector3(0, 0, 0),
    6,
    6,
  );
  const pp = pocket.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pp.count; i++) pp.setZ(i, bodyFront(pp.getX(i), pp.getY(i)) + 0.0012);
  pocket.computeVertexNormals();
  add(pocket, shirt, false);

  // legs + shoes (you can see your feet when you look down)
  const legG = new THREE.CylinderGeometry(0.075, 0.058, 0.62, 20);
  const shoeG = new THREE.CapsuleGeometry(0.045, 0.16, 6, 12);
  shoeG.rotateX(Math.PI / 2);
  shoeG.scale(1, 0.55, 1);
  for (const s of [1, -1]) {
    const leg = add(legG, trousers);
    leg.position.set(s * 0.09, -1.15, 0.0);
    const shoe = add(shoeG, leather);
    shoe.position.set(s * 0.1, -1.44, 0.07);
    shoe.rotation.y = s * 0.12;
  }

  return body;
}
