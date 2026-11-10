import { CP, cp, v3, polyLength, smooth } from '../tie/path';
import { LEFT, bodyFront } from '../scene/bodyShape';
import { neckCore } from './finkmao';
import type { Program, Step } from './types';

export const KB = v3(0, -0.022, 0.092);

function bowWidth(total: number) {
  return (s: number) => {
    const d = Math.min(s, total - s);
    if (d < 0.03) return 0.05 + 0.012 * (d / 0.03);
    if (d < 0.065) return 0.062;
    if (d < 0.16) return 0.062 + (0.026 - 0.062) * smooth((d - 0.065) / 0.095);
    return 0.026;
  };
}

const clone = (cps: CP[]) => cps.map((c) => ({ p: c.p.clone(), g: c.g, side: c.side?.clone() }));

export function buildBowTie(lefty: boolean): Program {
  const L = LEFT;
  const y = KB.y;
  const sideName = (wearerLeft: boolean) => (wearerLeft !== lefty ? 'left' : 'right');
  const UP = v3(0, 1, 0);
  const X = v3(1, 0, 0);

  const { ring, rightCollar } = neckCore(0, KB, { bow: true });
  const a2 = cp(L * 0.017, y + 0.016, 0.088, 0.95);
  const a3 = cp(L * 0.03, 0.005, 0.077);
  const ay = y - 0.05;
  const aHang: CP[] = [cp(L * 0.006, ay, bodyFront(0, ay) + 0.01), cp(L * 0.004, y - 0.012, 0.094, 0.9), a2, a3];

  // Short end folded into the front loop (sits on the wearer's right)
  const zA1 = 0.104, zA2 = 0.097;
  const aBow: CP[] = [
    cp(-L * 0.004, y, zA1, 1),
    cp(-L * 0.03, y, zA1, 1),
    cp(-L * 0.056, y, zA1 - 0.001, 1),
    cp(-L * 0.065, y, (zA1 + zA2) / 2, 1, UP),
    cp(-L * 0.056, y, zA2, 1),
    cp(-L * 0.03, y, zA2, 1),
    cp(-L * 0.004, y + 0.003, zA2 - 0.001, 0.5),
    cp(L * 0.008, y + 0.02, 0.09, 0.75),
    a2,
    a3,
  ];

  const crossFront: CP[] = [
    cp(-L * 0.014, y + 0.012, 0.094),
    cp(0, y - 0.004, 0.103, 0.8),
    cp(L * 0.024, y - 0.03, 0.104),
  ];
  const crossBack: CP[] = [
    cp(-L * 0.014, y + 0.012, 0.088),
    cp(0, y - 0.004, 0.085, 0.8),
    cp(L * 0.022, y - 0.03, 0.088),
  ];
  const upThrough = (zFall: number): CP[] => [
    cp(L * 0.014, y - 0.048, 0.09, 0.8),
    cp(0, y - 0.03, 0.08, 0.7),
    cp(0, y + 0.004, 0.078, 0.6),
    cp(0, y + 0.03, 0.082, 0.6),
    cp(0, y + 0.043, 0.093, 0.6, X),
    cp(0, y + 0.026, zFall, 0.7),
  ];
  const overShoulder: CP[] = [
    cp(-L * 0.03, y + 0.05, 0.12, 0.8),
    cp(-L * 0.08, 0.035, 0.125),
    cp(-L * 0.14, 0.02, 0.105),
  ];
  const drop: CP[] = [cp(0, y + 0.004, 0.111, 0.9), cp(0, y - 0.022, 0.111, 0.9)];
  const pushThrough: CP[] = [
    cp(0, y - 0.034, 0.106, 0.8, X),
    cp(L * 0.004, y - 0.016, 0.1045, 0.7),
    cp(L * 0.022, y, 0.104, 1),
    cp(L * 0.056, y, 0.103, 1),
    cp(L * 0.065, y, 0.0995, 1, UP),
    cp(L * 0.056, y, 0.096, 1),
    cp(L * 0.03, y, 0.096, 1),
    cp(L * 0.006, y, 0.096, 1),
  ];

  const s0 = [...aHang, ...ring, rightCollar];
  const s1 = [...s0, ...crossFront];
  const s2 = [...s1, ...upThrough(0.112)];
  const base3 = [...aBow, ...ring, rightCollar, ...crossBack, ...upThrough(0.112)];
  const s3a = [...s0, ...crossFront, ...upThrough(0.112), ...overShoulder];
  const s3 = [...base3, ...overShoulder];
  const s4 = [...base3, ...drop];
  const s5a = [...s4, ...pushThrough.slice(0, 3)];
  const s5 = [...s4, ...pushThrough];
  // balanced: wings pinched in the middle, the centre knot pulled snug instead of hanging below
  const s6 = clone(s5);
  for (const c of s6) {
    if (Math.abs(c.p.x) < 0.075 && c.p.y < 0.0 && c.p.y > y - 0.06) {
      c.p.z = KB.z + (c.p.z - KB.z) * 0.8 + 0.002;
      c.p.y = y + (c.p.y - y) * 0.85;
      if (Math.abs(c.p.x) < 0.016) c.g = Math.min(c.g ?? 1, 0.5);
      else if (Math.abs(c.p.x) < 0.035) c.g = Math.min(c.g ?? 1, 0.8);
    }
  }

  const hA = polyLength(aBow) - polyLength(aHang);
  const total = polyLength(s5) + 0.004;

    // hand targets (tie space): the fold of the front loop, and the gap behind it
  const foldPt = v3(-L * 0.062, y, 0.104);
  const gapPt = v3(L * 0.012, y + 0.004, 0.1);
  const pinchFront = v3(-L * 0.03, y, 0.108);
  const st = (cps: CP[], headLen: number, right: Step['state']['right'], left: Step['state']['left']) => ({
    cps: clone(cps), headLen, tailKind: 'free' as const, right, left,
  });

  const steps: Step[] = [
    {
      title: 'Drape it',
      text: `Hang the bow tie around your neck with the end on your <b>${sideName(false)}</b> about 4 cm longer.`,
      move: 'reshape',
      state: st(s0, hA, null, null),
      tip: 'Adjustable bow ties: set the length to your collar size first.',
    },
    {
      title: 'Cross over',
      text: `Cross the long end <b>over</b> the short end at your throat.`,
      move: 'lay',
      state: st(s1, hA, 'grip', 'knot'),
    },
    {
      title: 'Up through the neck loop',
      text: 'Bring the long end <b>up behind</b> and through the neck loop. Snug it — this is the base knot.',
      move: 'lay',
      state: st(s2, hA, 'grip', 'knot'),
    },
    {
      title: 'Long end out of the way',
      text: `Flip the long end <b>over your ${sideName(false)} shoulder</b> so it's out of the way. The short end is still hanging down.`,
      move: 'reshape',
      state: st(s3a, hA, 'grip', 'knot'),
    },
    {
      title: 'Fold the front loop',
      text: `Lift the short end and <b>fold it back on itself</b> at its widest point. Hold the fold sideways across your collar, loop out to your <b>${sideName(false)}</b>. This is the front bow loop.`,
      move: 'reshape',
      state: st(s3, 0, foldPt, 'knot'),
      tip: 'Keep pinching this loop for the rest of the tie — it is your anchor.',
    },
    {
      title: 'Drop it over',
      text: 'Keep holding the front loop. Let the long end drop straight down <b>over the middle</b> of it.',
      move: 'reshape',
      state: st(s4, 0, 'grip', pinchFront),
    },
    {
      title: 'Fold the long end',
      text: 'Pinch the long end where it is widest and <b>fold it back up</b> on itself, so the fold points up toward your chin.',
      move: 'lay',
      state: st(s5a, 0, 'grip', pinchFront),
      tip: 'The back loop must be folded the same way up as the front loop, or the bow will twist.',
    },
    {
      title: 'Push it through',
      text: `With a finger, open the <b>gap behind the front loop</b> (just under the centre knot). <b>Push the fold through</b> that gap, out to your <b>${sideName(true)}</b>.`,
      move: 'lay',
      state: st(s5, 0, 'grip', gapPt),
      tip: 'This is the fiddly bit. Open the gap first, then feed the fold through rather than pulling the tip.',
    },
    {
      title: 'Balance it',
      text: 'Tug opposite loops gently to tighten, then pull the folded edges to even out the wings.',
      move: 'reshape',
      state: st(s6, 0, null, null),
    },
  ];
  const splitS = hA + polyLength([...aHang, ...ring.slice(0, 9)]);
  return { total, width: bowWidth(total), headKind: 'free', knotCenter: KB.clone(), splitS, reversible: true, steps };
}
