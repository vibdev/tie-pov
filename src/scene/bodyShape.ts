import * as THREE from 'three';

/**
 * Body coordinate frame (meters):
 *  - neck axis is x = 0, z = 0; body faces +z
 *  - WEARER'S LEFT is +x (so in the first-person camera it shows on screen-left)
 *  - y = 0 is roughly the bottom of the shirt collar
 */
export const LEFT = 1;

// (y, half-width a, half-depth b)
const PROFILE: [number, number, number][] = [
  [0.1, 0.056, 0.056],
  [0.02, 0.058, 0.058],
  [-0.01, 0.075, 0.066],
  [-0.03, 0.115, 0.073],
  [-0.05, 0.165, 0.082],
  [-0.08, 0.195, 0.093],
  [-0.12, 0.208, 0.103],
  [-0.2, 0.205, 0.113],
  [-0.3, 0.195, 0.117],
  [-0.42, 0.182, 0.113],
  [-0.55, 0.172, 0.108],
  [-0.62, 0.171, 0.106],
  [-0.75, 0.173, 0.104],
  [-0.9, 0.17, 0.1],
  [-1.3, 0.16, 0.095],
];

export function torsoAt(y: number): { a: number; b: number } {
  if (y >= PROFILE[0][0]) return { a: PROFILE[0][1], b: PROFILE[0][2] };
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [y0, a0, b0] = PROFILE[i];
    const [y1, a1, b1] = PROFILE[i + 1];
    if (y <= y0 && y >= y1) {
      let f = (y0 - y) / (y0 - y1);
      f = f * f * (3 - 2 * f) * 0.5 + f * 0.5; // soften the kinks a little
      return { a: a0 + (a1 - a0) * f, b: b0 + (b1 - b0) * f };
    }
  }
  const l = PROFILE[PROFILE.length - 1];
  return { a: l[1], b: l[2] };
}

/** z of the front surface of the torso at (x, y) */
export function bodyFront(x: number, y: number) {
  const { a, b } = torsoAt(y);
  const q = 1 - (x / a) * (x / a);
  return q > 0 ? b * Math.sqrt(q) : 0;
}

/** push a point out of the torso so that it sits at least `margin` above the surface */
export function pushOutOfBody(p: THREE.Vector3, margin: number) {
  const { a, b } = torsoAt(p.y);
  const aa = a + margin, bb = b + margin;
  const r = Math.sqrt((p.x / aa) ** 2 + (p.z / bb) ** 2);
  if (r < 1 && r > 1e-6) {
    p.x /= r;
    p.z /= r;
    return true;
  }
  return false;
}
