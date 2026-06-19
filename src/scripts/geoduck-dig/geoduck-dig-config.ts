import type { SpeciesId, ToolSpec } from './geoduck-dig-types';

// ---------------------------------------------------------------------------
// Depth model. The canvas cross-section maps 0..MAX_DEPTH_FT of sand below the
// surface. Real geoduck bodies sit ~2-3 ft down; horse clams shallower; cockles
// barely under the surface as decoys.
// ---------------------------------------------------------------------------
export const MAX_DEPTH_FT = 4;
export const WATER_TABLE_FT = 1.15; // below this the sand is saturated and slumps fast
export const GRASP_MARGIN_FT = 0.5; // you must dig to within 6" of the body to grasp it

// Tide window for the whole session (the low-tide harvest window, compressed).
export const TIDE_WINDOW_SECONDS = 165;
export const DAILY_LIMIT = 3; // Washington keeps the first 3 geoducks you dig

// Extraction tension model (0..1). Hold "pull" to raise tension; release inside
// the safe band to pop the clam intact. Past the snap line the neck tears off.
export const PULL_RISE_PER_SECOND = 0.62;
export const PULL_RELAX_PER_SECOND = 1.1;
export const SNAP_TENSION = 1.0;

export const TOOLS: ToolSpec[] = [
  {
    id: 'shovel',
    label: 'Shovel',
    icon: 'ph-shovel',
    tagline: 'Fast, brutal, leaky',
    blurb:
      'Dig a wide open pit. Quick to move sand, but with no wall the hole slumps shut and a big pit risks slicing the neck or crushing the shell.',
    digRatePerSecond: 1.05,
    caveInBasePerSecond: 0.5,
    retainFactor: 0.18,
    suctionBuildPerSecond: 0.0,
    wetBonus: 0.1,
    pullTolerance: 0.55,
  },
  {
    id: 'pvc-tube',
    label: 'PVC Tube + Scoop',
    icon: 'ph-cylinder',
    tagline: 'The all-rounder',
    blurb:
      'Drive a plastic tube around the show and scoop sand from inside. The wall holds the hole open, and the tube flexes so you can rock it to break suction. The forgiving choice.',
    digRatePerSecond: 0.78,
    caveInBasePerSecond: 0.34,
    retainFactor: 0.82,
    suctionBuildPerSecond: 0.22,
    wetBonus: 0.18,
    pullTolerance: 0.72,
  },
  {
    id: 'steel-tube',
    label: 'Stainless Tube',
    icon: 'ph-circle-dashed',
    tagline: "Pro reach, fierce suction",
    blurb:
      'A rigid pro tube goes deep and keeps a clean wall, but rigid metal grabs the sand with brutal suction — rock it often (R) or the clam stays welded in place.',
    digRatePerSecond: 0.92,
    caveInBasePerSecond: 0.2,
    retainFactor: 0.94,
    suctionBuildPerSecond: 0.5,
    wetBonus: 0.16,
    pullTolerance: 0.66,
  },
  {
    id: 'clam-gun',
    label: 'Clam Gun / Claminator',
    icon: 'ph-flask',
    tagline: 'Pumps wet sand fast',
    blurb:
      'A sealed pump that sucks saturated sand out like a syringe. Tears through wet sand below the water table, but stalls in the dry upper layer and floods the hole as you go.',
    digRatePerSecond: 0.7,
    caveInBasePerSecond: 0.46,
    retainFactor: 0.55,
    suctionBuildPerSecond: 0.12,
    wetBonus: 1.1,
    pullTolerance: 0.64,
  },
];

// Weighted draw for what hides under each show. Geoducks are the prize; horse
// clams are the classic look-alike decoy; cockles are shallow false alarms.
export const SPECIES_WEIGHTS: Record<SpeciesId, number> = {
  geoduck: 0.5,
  'horse-clam': 0.32,
  cockle: 0.18,
};

// One-line teaching notes surfaced in the "real digging" panel.
export const FIELD_NOTES: string[] = [
  'A geoduck never runs. Only its long siphon retracts — the body stays put, 2-3 ft straight down.',
  'A real "show" is a dimple the size of a quarter, or a neck tip poking above the sand at a −2.0 ft tide.',
  'Geoduck neck: oval with two siphon holes. Horse clam: round neck with a leathery tip. Learn the difference.',
  'Pull by the neck and it tears off the shell. You must dig down to the body, loosen it, then lift.',
  'Plastic tubes flex and break suction; rigid steel tubes grip the sand and fight you the whole way up.',
  'Wet sand below the water table slumps back into the hole — and the tide is always coming back in.',
];
