import * as THREE from 'three';

/**
 * The wearer's head: a friendly, slightly goofy cartoon who is looking down at their own knot.
 * Only ever seen in the mirror and orbit views (in first person you are inside it).
 */
export function buildHead(skin: THREE.Material) {
  const head = new THREE.Group();
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    head.add(mesh);
    return mesh;
  };
  const ball = new THREE.SphereGeometry(1, 40, 28);
  const white = new THREE.MeshStandardMaterial({ color: '#fbf8f2', roughness: 0.25 });
  const ink = new THREE.MeshStandardMaterial({ color: '#2a211d', roughness: 0.4 });
  const hairMat = new THREE.MeshStandardMaterial({ color: '#4a3226', roughness: 0.85 });
  const blush = new THREE.MeshStandardMaterial({ color: '#e58f7c', roughness: 0.7 });
  const lip = new THREE.MeshStandardMaterial({ color: '#8c4338', roughness: 0.6 });

  add(ball, skin, 0, 0.165, 0.02, 0.08, 0.1, 0.086);
  for (const s of [1, -1]) {
    add(ball, skin, s * 0.081, 0.158, 0.012, 0.012, 0.021, 0.014); // ear
    // big round eyes, looking down and a little inward, at the knot
    add(ball, white, s * 0.03, 0.176, 0.089, 0.0185);
    add(ball, ink, s * 0.0275, 0.1705, 0.1035, 0.0078);
    add(ball, white, s * 0.0255, 0.1735, 0.1095, 0.0022);
    add(ball, blush, s * 0.05, 0.142, 0.0795, 0.013, 0.009, 0.006); // cheek
    // eyebrows, raised in concentration (one a touch higher)
    const brow = add(new THREE.CapsuleGeometry(0.0032, 0.02, 4, 10), hairMat, s * 0.031, 0.203 + (s > 0 ? 0.003 : 0), 0.093);
    brow.rotation.set(0.25, 0, Math.PI / 2 + s * 0.22);
  }
  add(ball, skin, 0, 0.152, 0.104, 0.0115, 0.011, 0.012); // nose
  // a small pleased smile
  const arc = Math.PI * 0.62;
  const smile = add(new THREE.TorusGeometry(0.021, 0.0026, 8, 28, arc), lip, 0, 0.14, 0.0985);
  smile.rotation.set(-0.35, 0, -Math.PI / 2 - arc / 2);
  // hair: a neat cap, swept back, with one tuft that will not lie down
  const cap = add(new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat, 0, 0.172, 0.014, 0.0855, 0.103, 0.0925);
  cap.rotation.x = -0.5;
  const tuft = add(new THREE.ConeGeometry(0.012, 0.04, 12), hairMat, 0.012, 0.272, 0.03);
  tuft.rotation.set(0.5, 0, -0.35);
  return head;
}
