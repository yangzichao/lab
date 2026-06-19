// Shared types for the Geoduck Dig lab. Depths are in feet below the sand
// surface; time is in seconds. The simulation is deliberately faithful to how
// intertidal geoduck digging actually works in the Pacific Northwest: the clam
// never flees, only its long siphon ("neck") retracts, and the body sits 2-3 ft
// down where sand suction and seeping water fight every scoop you take.

export type ToolId = 'shovel' | 'pvc-tube' | 'steel-tube' | 'clam-gun';

export type SpeciesId = 'geoduck' | 'horse-clam' | 'cockle';

export type DigOutcome = 'intact' | 'snapped' | 'crushed' | 'tide-out' | 'abandoned';

export type DigPhase = 'digging' | 'extracting' | 'resolved';

export interface ToolSpec {
  id: ToolId;
  label: string;
  icon: string; // phosphor icon class suffix
  tagline: string;
  blurb: string;
  /** Feet of sand cleared per second while actively digging (dry sand). */
  digRatePerSecond: number;
  /** Feet of sand that seeps/caves back per second before retaining help. */
  caveInBasePerSecond: number;
  /** 0-1 — how much the tool's wall holds sand back (1 = no cave-in). */
  retainFactor: number;
  /** Suction pressure built per second of digging (0-1 scale). */
  suctionBuildPerSecond: number;
  /** How much extra dig speed the tool gets in saturated sand below the water table. */
  wetBonus: number;
  /** Forgiveness of the extraction pull — wider safe band is easier. */
  pullTolerance: number;
}

export interface ClamProfile {
  species: SpeciesId;
  label: string;
  /** Depth of the shell body below the surface, in feet. */
  bodyDepthFt: number;
  /** Harvest weight in pounds (cleaned). */
  weightLb: number;
  /** Identification clues revealed when you inspect the show. */
  neckShape: 'oval' | 'round' | 'short';
  siphonHoles: 1 | 2;
  tip: 'bare' | 'leathery';
  squirt: 'strong' | 'weak' | 'none';
}

export interface BeachShow {
  id: number;
  /** Horizontal position on the flat, 0-1. */
  x: number;
  /** Vertical position on the flat, 0-1 (for the top-down survey view). */
  y: number;
  clam: ClamProfile;
  inspected: boolean;
}

export interface DigInput {
  /** True while the player holds to excavate. */
  digging: boolean;
  /** True while the player holds to pull the clam out. */
  pulling: boolean;
  /** Edge trigger: relieve tube suction by rocking it. */
  rock: boolean;
}

export interface DigResult {
  outcome: DigOutcome;
  species: SpeciesId;
  weightLb: number;
  /** Seconds of the tide window this dig consumed. */
  elapsedSeconds: number;
  message: string;
}

export interface SessionTally {
  geoducks: number;
  totalWeightLb: number;
  snapped: number;
  horseClams: number;
  cockles: number;
}
