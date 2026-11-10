import type * as THREE from 'three';
import type { CP } from '../tie/path';

export type TailKind = 'front' | 'back' | 'free';
/** where a hand should be: grip = holding the active end, knot = pinching the knot, a point, or lowered out of view */
export type HandTarget = 'grip' | 'knot' | 'narrow' | THREE.Vector3 | null;

/**
 * reshape — held fabric is simply moved to its new place (draping, folding, flipping an end away)
 * lay     — a hand carries the active end along the new stretch of route; the rest of it trails behind
 * thread  — the tip goes through an opening first and the whole end is pulled through after it
 * cinch   — the finished route is pulled tight: every loop shrinks and fabric slides through the knot
 */
export type MoveKind = 'reshape' | 'lay' | 'thread' | 'cinch';

export interface TieState {
  /** control points from the head end (narrow end / short end) to the active end */
  cps: CP[];
  /** length of fabric hanging freely before cps[0] (material starts at the head tip) */
  headLen: number;
  tailKind: TailKind;
  right: HandTarget;
  left: HandTarget;
}

export interface Step {
  title: string;
  text: string;
  /** Fink–Mao move code, e.g. "Li" */
  code?: string;
  /** how the fabric gets into this step's pose from the previous one */
  move: MoveKind;
  /** for 'cinch': matching control points [index in the previous step's route, index in this one] */
  landmarks?: [number, number][];
  state: TieState;
  tip?: string;
}

export interface Program {
  total: number;
  width: (s: number) => number;
  headKind: 'narrow' | 'free';
  knotCenter: THREE.Vector3;
  /** material arc length at the back of the neck: fabric before it is the narrow/short end */
  splitS?: number;
  /** the tie is hung seam-side out to begin with (some knots turn it over as they are tied) */
  insideOut?: boolean;
  /** the same on both faces (a bow tie): there is no lining to show */
  reversible?: boolean;
  steps: Step[];
}

export interface KnotDef {
  id: string;
  name: string;
  aka?: string;
  kind: 'tie' | 'bow';
  sequence?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  size: 'Small' | 'Medium' | 'Large' | 'Bow';
  symmetric: boolean;
  blurb: string;
  build: (lefty: boolean) => Program;
}
