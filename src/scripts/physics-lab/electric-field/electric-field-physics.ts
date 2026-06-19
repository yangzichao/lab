// Electrostatics for a handful of point charges, in the canvas's own pixel
// space (so the renderer can sample without any unit juggling). Potential and
// field are the textbook superposition sums, with a small softening radius so
// nothing blows up when a probe sits right on top of a charge.

import type { Point } from '../shared/stage';

export type Charge = {
  x: number;
  y: number;
  // Charge in arbitrary units; positive sources, negative sinks. ±1 is "one
  // unit" and the renderer scales colours/streamlines around that.
  charge: number;
};

// Coulomb-ish constant picked purely so the heatmap and streamlines read well
// at this canvas scale — it is not physical, just a visual gain.
export const COULOMB_CONSTANT = 14000;

// Softening length (pixels). Keeps r and r³ finite at the charge centre, and a
// slightly larger value smooths the heatmap/equipotentials right at the core.
const SOFTENING = 10;

export type FieldVector = { x: number; y: number };

export function potentialAt(point: Point, charges: Charge[]): number {
  let total = 0;
  for (const charge of charges) {
    const dx = point.x - charge.x;
    const dy = point.y - charge.y;
    const distance = Math.sqrt(dx * dx + dy * dy + SOFTENING * SOFTENING);
    total += (COULOMB_CONSTANT * charge.charge) / distance;
  }
  return total;
}

export function fieldAt(point: Point, charges: Charge[]): FieldVector {
  let fieldX = 0;
  let fieldY = 0;
  for (const charge of charges) {
    const dx = point.x - charge.x;
    const dy = point.y - charge.y;
    const distanceSquared = dx * dx + dy * dy + SOFTENING * SOFTENING;
    const distance = Math.sqrt(distanceSquared);
    const inverseCube = (COULOMB_CONSTANT * charge.charge) / (distanceSquared * distance);
    fieldX += inverseCube * dx;
    fieldY += inverseCube * dy;
  }
  return { x: fieldX, y: fieldY };
}

export function fieldMagnitude(point: Point, charges: Charge[]): number {
  const field = fieldAt(point, charges);
  return Math.hypot(field.x, field.y);
}

export function netCharge(charges: Charge[]): number {
  let total = 0;
  for (const charge of charges) {
    total += charge.charge;
  }
  return total;
}

// Index of the charge nearest a point, plus its distance — used for dragging
// and for stopping streamlines when they plunge into a sink.
export function nearestChargeIndex(point: Point, charges: Charge[]): { index: number; distance: number } {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < charges.length; index += 1) {
    const distance = Math.hypot(point.x - charges[index].x, point.y - charges[index].y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return { index: bestIndex, distance: bestDistance };
}

export type Preset = { id: string; charges: Charge[] };

// Layouts are expressed in the 900×560 stage space the renderer draws into.
export const presets: Record<string, Charge[]> = {
  dipole: [
    { x: 330, y: 280, charge: 1 },
    { x: 570, y: 280, charge: -1 },
  ],
  like: [
    { x: 330, y: 280, charge: 1 },
    { x: 570, y: 280, charge: 1 },
  ],
  quadrupole: [
    { x: 350, y: 200, charge: 1 },
    { x: 550, y: 200, charge: -1 },
    { x: 350, y: 360, charge: -1 },
    { x: 550, y: 360, charge: 1 },
  ],
};

export function clonePreset(id: string): Charge[] {
  const layout = presets[id] ?? presets.dipole;
  return layout.map((charge) => ({ ...charge }));
}
