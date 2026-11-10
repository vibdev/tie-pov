import { buildFinkMao, type KnotLook } from './finkmao';
import { buildBowTie } from './bowtie';
import type { KnotDef } from './types';

const LOOKS: Record<string, KnotLook> = {
  'four-in-hand': { topW: 0.044, faceH: 0.05, tilt: 0.24, fan: 0.22 }, // narrow, tall, lopsided
  oriental: { topW: 0.04, faceH: 0.042, tilt: 0.28, fan: 0.18 }, // the smallest
  kelvin: { topW: 0.048, faceH: 0.05, tilt: 0.16, fan: 0.26 }, // a fuller four-in-hand
  nicky: { topW: 0.05, faceH: 0.046, tilt: 0, fan: 0.32 }, // neat, symmetric, medium
  pratt: { topW: 0.054, faceH: 0.046, tilt: 0, fan: 0.36 },
  'half-windsor': { topW: 0.062, faceH: 0.048, tilt: 0, fan: 0.46 }, // symmetric triangle
  windsor: { topW: 0.076, faceH: 0.052, tilt: 0, fan: 0.6 }, // big, wide triangle
  'st-andrew': { topW: 0.058, faceH: 0.05, tilt: 0.1, fan: 0.42 },
  plattsburgh: { topW: 0.072, faceH: 0.044, tilt: 0, fan: 0.66 }, // broad, short cone
};

const tie = (d: Omit<KnotDef, 'kind' | 'build'> & { sequence: string }): KnotDef => ({
  ...d,
  kind: 'tie',
  build: (lefty) => buildFinkMao(d.sequence, lefty, LOOKS[d.id]),
});

export const KNOTS: KnotDef[] = [
  tie({
    id: 'four-in-hand',
    name: 'Four-in-Hand',
    aka: 'Schoolboy knot',
    sequence: 'Li Ro Li Co T',
    difficulty: 1,
    size: 'Small',
    symmetric: false,
    blurb: 'The everyday classic. Slim, a little lopsided, and quick to tie. Good with button-down and narrow-spread collars.',
  }),
  tie({
    id: 'oriental',
    name: 'Oriental',
    aka: 'Simple knot',
    sequence: 'Lo Ri Co T',
    difficulty: 1,
    size: 'Small',
    symmetric: false,
    blurb: 'The smallest knot there is. Starts inside-out. Good for thick ties or tall people who need extra length.',
  }),
  tie({
    id: 'kelvin',
    name: 'Kelvin',
    sequence: 'Lo Ri Lo Ri Co T',
    difficulty: 2,
    size: 'Small',
    symmetric: false,
    blurb: 'The Oriental with one more turn. A compact knot with a bit more body, named after Lord Kelvin.',
  }),
  tie({
    id: 'nicky',
    name: 'Nicky',
    sequence: 'Lo Ci Ro Li Co T',
    difficulty: 2,
    size: 'Medium',
    symmetric: true,
    blurb: 'A tidy, self-releasing alternative to the Pratt. Symmetric, and medium-sized without being bulky.',
  }),
  tie({
    id: 'pratt',
    name: 'Pratt',
    aka: 'Shelby',
    sequence: 'Lo Ci Lo Ri Co T',
    difficulty: 2,
    size: 'Medium',
    symmetric: true,
    blurb: 'Neat and symmetric, uses little fabric. Starts inside-out. Made famous by news anchor Don Shelby.',
  }),
  tie({
    id: 'half-windsor',
    name: 'Half Windsor',
    sequence: 'Li Ro Ci Lo Ri Co T',
    difficulty: 3,
    size: 'Medium',
    symmetric: true,
    blurb: 'The office all-rounder. Symmetric triangle, medium size, works with almost any collar.',
  }),
  tie({
    id: 'windsor',
    name: 'Windsor',
    aka: 'Full Windsor / Double Windsor',
    sequence: 'Li Co Ri Lo Ci Ro Li Co T',
    difficulty: 4,
    size: 'Large',
    symmetric: true,
    blurb: 'The big, confident triangle. Uses a lot of tie, so start with the narrow end higher. Pair with spread collars.',
  }),
  tie({
    id: 'st-andrew',
    name: 'St. Andrew',
    sequence: 'Lo Ri Co Li Ro Li Co T',
    difficulty: 3,
    size: 'Medium',
    symmetric: false,
    blurb: 'A slightly asymmetric medium knot. More character than a Half Windsor, smaller than a full Windsor.',
  }),
  tie({
    id: 'plattsburgh',
    name: 'Plattsburgh',
    sequence: 'Lo Ci Ro Ci Lo Ri Co T',
    difficulty: 4,
    size: 'Large',
    symmetric: true,
    blurb: 'A wide, cone-shaped knot designed by Fink & Mao. A modern statement knot for wide spread collars.',
  }),
  {
    id: 'bow-tie',
    name: 'Bow Tie',
    aka: 'Self-tie bow',
    kind: 'bow',
    difficulty: 4,
    size: 'Bow',
    symmetric: true,
    blurb: 'The real thing, not a clip-on. Basically a shoelace bow tied at your throat. Slightly uneven looks better.',
    build: (lefty) => buildBowTie(lefty),
  },
];
