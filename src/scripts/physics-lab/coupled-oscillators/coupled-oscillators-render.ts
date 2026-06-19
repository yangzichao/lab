import {
  clearStage,
  drawArrow,
  drawDisc,
  drawDotGrid,
  drawLabel,
  palette,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Point,
} from '../shared/stage';
import { modeShape } from './coupled-oscillators-physics';

// The chain is laid out horizontally across the stage. Each bead sits at a
// fixed x and is pushed up or down by its transverse displacement yᵢ; the walls
// are fixed posts at the far left and right. Displacement is scaled into pixels
// so even the modest amplitudes of the higher modes stay clearly visible.

const BASELINE_Y = STAGE_HEIGHT / 2;
const MARGIN_X = 110;
const CHAIN_WIDTH = STAGE_WIDTH - MARGIN_X * 2;
const DISPLACEMENT_SCALE = 150; // displacement (dimensionless) → pixels
const WALL_HALF_HEIGHT = 92;

// Mode envelopes get distinct hues so a mixture reads as overlaid waves.
const modeColors: string[] = [palette.blue, palette.red, palette.violet, palette.amber, palette.green];

function modeColor(modeNumber: number): string {
  return modeColors[(modeNumber - 1) % modeColors.length];
}

// x pixel of bead i (1-based) for a chain of N beads. Beads i = 1..N sit at the
// interior fence posts between the two walls (positions 0 and N+1).
function beadX(beadIndex: number, beadCount: number): number {
  return MARGIN_X + (CHAIN_WIDTH * beadIndex) / (beadCount + 1);
}

function beadPoint(beadIndex: number, beadCount: number, displacement: number): Point {
  return { x: beadX(beadIndex, beadCount), y: BASELINE_Y - displacement * DISPLACEMENT_SCALE };
}

export type ChainSceneOptions = {
  beadCount: number;
  displacements: number[]; // length N, bead i = 1..N at index i-1
  velocities: number[]; // length N, same indexing
  activeModeNumbers: number[]; // modes to draw as envelopes (1-based)
  envelopeAmplitudes: number[]; // signed peak amplitude cₚ·cos(ωₚt) per active mode (matched order)
  showEnvelopes: boolean;
  showSprings: boolean;
};

export function drawCoupledOscillators(
  context: CanvasRenderingContext2D,
  options: ChainSceneOptions,
): void {
  const { beadCount, displacements, velocities, activeModeNumbers, envelopeAmplitudes, showEnvelopes, showSprings } =
    options;

  clearStage(context);
  drawDotGrid(context);

  drawEquilibriumLine(context);
  drawWalls(context, beadCount);

  if (showEnvelopes) {
    activeModeNumbers.forEach((modeNumber, index) => {
      drawModeEnvelope(context, modeNumber, beadCount, envelopeAmplitudes[index] ?? 0);
    });
  }

  if (showSprings) {
    drawSprings(context, beadCount, displacements);
  } else {
    drawConnectingLine(context, beadCount, displacements);
  }

  drawBeads(context, beadCount, displacements, velocities);
  drawLegend(context);
}

function drawEquilibriumLine(context: CanvasRenderingContext2D): void {
  context.save();
  context.setLineDash([4, 8]);
  context.strokeStyle = palette.faint;
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(MARGIN_X, BASELINE_Y);
  context.lineTo(STAGE_WIDTH - MARGIN_X, BASELINE_Y);
  context.stroke();
  context.restore();
}

function drawWalls(context: CanvasRenderingContext2D, beadCount: number): void {
  const leftWallX = beadX(0, beadCount);
  const rightWallX = beadX(beadCount + 1, beadCount);
  context.save();
  context.strokeStyle = palette.ink;
  context.lineWidth = 5;
  for (const wallX of [leftWallX, rightWallX]) {
    context.beginPath();
    context.moveTo(wallX, BASELINE_Y - WALL_HALF_HEIGHT);
    context.lineTo(wallX, BASELINE_Y + WALL_HALF_HEIGHT);
    context.stroke();
    drawDisc(context, { x: wallX, y: BASELINE_Y }, 4, { fill: palette.ink });
  }
  context.restore();
}

// A zig-zag "spring" between two points, drawn as a folded polyline. Used for
// the segment between each pair of neighbours, including the walls.
function drawSpringSegment(context: CanvasRenderingContext2D, from: Point, to: Point): void {
  const coils = 7;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const amplitude = 7;
  const leadFraction = 0.16;

  context.beginPath();
  context.moveTo(from.x, from.y);
  const startX = from.x + dx * leadFraction;
  const startY = from.y + dy * leadFraction;
  const endX = to.x - dx * leadFraction;
  const endY = to.y - dy * leadFraction;
  context.lineTo(startX, startY);
  for (let coil = 1; coil <= coils; coil += 1) {
    const progress = coil / (coils + 1);
    const side = coil % 2 === 0 ? -1 : 1;
    const baseX = startX + (endX - startX) * progress;
    const baseY = startY + (endY - startY) * progress;
    context.lineTo(baseX + nx * amplitude * side, baseY + ny * amplitude * side);
  }
  context.lineTo(endX, endY);
  context.lineTo(to.x, to.y);
  context.stroke();
}

function drawSprings(context: CanvasRenderingContext2D, beadCount: number, displacements: number[]): void {
  context.save();
  context.strokeStyle = palette.muted;
  context.lineWidth = 1.8;
  let previous = beadPoint(0, beadCount, 0); // left wall
  for (let beadIndex = 1; beadIndex <= beadCount; beadIndex += 1) {
    const current = beadPoint(beadIndex, beadCount, displacements[beadIndex - 1]);
    drawSpringSegment(context, previous, current);
    previous = current;
  }
  drawSpringSegment(context, previous, beadPoint(beadCount + 1, beadCount, 0)); // right wall
  context.restore();
}

function drawConnectingLine(context: CanvasRenderingContext2D, beadCount: number, displacements: number[]): void {
  context.save();
  context.strokeStyle = palette.muted;
  context.lineWidth = 2.4;
  context.beginPath();
  const leftWall = beadPoint(0, beadCount, 0);
  context.moveTo(leftWall.x, leftWall.y);
  for (let beadIndex = 1; beadIndex <= beadCount; beadIndex += 1) {
    const current = beadPoint(beadIndex, beadCount, displacements[beadIndex - 1]);
    context.lineTo(current.x, current.y);
  }
  const rightWall = beadPoint(beadCount + 1, beadCount, 0);
  context.lineTo(rightWall.x, rightWall.y);
  context.stroke();
  context.restore();
}

// Continuous envelope of mode p: the smooth sine sin(pπx/(N+1)) scaled by the
// mode's current signed amplitude, sampled finely across the chain. Dashed so
// it reads as a guide rather than a physical object.
function drawModeEnvelope(
  context: CanvasRenderingContext2D,
  modeNumber: number,
  beadCount: number,
  signedAmplitude: number,
): void {
  context.save();
  context.setLineDash([6, 6]);
  context.strokeStyle = modeColor(modeNumber);
  context.globalAlpha = 0.55;
  context.lineWidth = 1.8;
  context.beginPath();
  const samples = 160;
  for (let sample = 0; sample <= samples; sample += 1) {
    const continuousIndex = ((beadCount + 1) * sample) / samples; // 0..N+1
    const shape = modeShape(modeNumber, continuousIndex, beadCount);
    const x = MARGIN_X + (CHAIN_WIDTH * continuousIndex) / (beadCount + 1);
    const y = BASELINE_Y - signedAmplitude * shape * DISPLACEMENT_SCALE;
    if (sample === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();
  context.restore();
}

function drawBeads(
  context: CanvasRenderingContext2D,
  beadCount: number,
  displacements: number[],
  velocities: number[],
): void {
  for (let beadIndex = 1; beadIndex <= beadCount; beadIndex += 1) {
    const displacement = displacements[beadIndex - 1];
    const velocity = velocities[beadIndex - 1] ?? 0;
    const point = beadPoint(beadIndex, beadCount, displacement);

    // Colour by velocity sign: teal when rising, red when falling, neutral when
    // momentarily still — the same colour logic that codes "which way now".
    const moving = Math.abs(velocity) > 1e-4;
    const fill = !moving ? palette.muted : velocity > 0 ? palette.teal : palette.red;

    // A short velocity arrow makes the instantaneous motion legible.
    if (moving) {
      const lookahead = 26;
      drawArrow(
        context,
        point,
        { x: point.x, y: point.y - velocity * lookahead },
        { color: fill, width: 2.2, headSize: 7 },
      );
    }

    drawDisc(context, point, 9, { fill, stroke: '#ffffff', strokeWidth: 2.5, glow: true });
  }
}

function drawLegend(context: CanvasRenderingContext2D): void {
  drawLabel(context, '● moving up', 24, STAGE_HEIGHT - 56, { color: palette.teal, size: 12, weight: 600 });
  drawLabel(context, '● moving down', 24, STAGE_HEIGHT - 38, { color: palette.red, size: 12, weight: 600 });
  // Neutral swatch + note: each envelope's hue distinguishes its mode, so the
  // legend stays a generic key rather than committing to one mode's colour.
  drawLabel(context, '- - mode envelope (hue per mode)', 24, STAGE_HEIGHT - 20, {
    color: palette.muted,
    size: 12,
    weight: 600,
  });
}
