import {
  clearStage,
  drawDisc,
  drawDotGrid,
  drawLabel,
  palette,
  rgb,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Point,
  type RgbColor,
} from '../shared/stage';
import {
  BOX_HEIGHT,
  BOX_WIDTH,
  maxwellSpeedDensity,
  PARTICLE_RADIUS,
  type GasState,
} from './ideal-gas-physics';

// Layout: the square gas box sits on the left, a tall speed histogram on the
// right. Both share the stage so the viewer can watch a particle speed up and a
// bar grow in the same glance.
const BOX_LEFT = 40;
const BOX_TOP = 64;
const BOX_PIXEL_SIZE = STAGE_HEIGHT - BOX_TOP - 48;
const BOX_SCALE = BOX_PIXEL_SIZE / Math.max(BOX_WIDTH, BOX_HEIGHT);

const HISTOGRAM_LEFT = BOX_LEFT + BOX_PIXEL_SIZE + 70;
const HISTOGRAM_TOP = BOX_TOP + 28;
const HISTOGRAM_WIDTH = STAGE_WIDTH - HISTOGRAM_LEFT - 40;
const HISTOGRAM_HEIGHT = BOX_PIXEL_SIZE - 56;
const HISTOGRAM_BASELINE = HISTOGRAM_TOP + HISTOGRAM_HEIGHT;

const BUCKET_COUNT = 26;
// Upper edge of the speed axis as a multiple of the most probable speed, so the
// histogram and theory curve keep a stable frame as the gas heats and cools.
const SPEED_AXIS_FACTOR = 3.4;

const COLD: RgbColor = rgb.blue;
const HOT: RgbColor = rgb.red;

export type GasSceneOptions = {
  state: GasState;
  temperature: number;
  mostProbableSpeed: number;
  speedAxisMaximum: number;
  showHistogram: boolean;
  colorBySpeed: boolean;
};

function toScreen(physicsX: number, physicsY: number): Point {
  return { x: BOX_LEFT + physicsX * BOX_SCALE, y: BOX_TOP + physicsY * BOX_SCALE };
}

// Map a normalised speed (0 = slow, 1 = fast) to a blue→red colour. Linear
// interpolation in RGB is plenty for an intuitive "cold to hot" read.
function speedColor(fraction: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const r = Math.round(COLD[0] + (HOT[0] - COLD[0]) * clamped);
  const g = Math.round(COLD[1] + (HOT[1] - COLD[1]) * clamped);
  const b = Math.round(COLD[2] + (HOT[2] - COLD[2]) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

export function drawIdealGas(context: CanvasRenderingContext2D, options: GasSceneOptions): void {
  const { state, temperature, mostProbableSpeed, speedAxisMaximum, showHistogram, colorBySpeed } =
    options;

  clearStage(context);
  drawDotGrid(context);

  drawBox(context);
  drawParticles(context, state, speedAxisMaximum, colorBySpeed);

  if (showHistogram) {
    drawHistogram(context, state, temperature, mostProbableSpeed, speedAxisMaximum);
  }

  drawLegend(context, colorBySpeed);
}

function drawBox(context: CanvasRenderingContext2D): void {
  context.save();
  context.fillStyle = palette.paper;
  context.fillRect(BOX_LEFT, BOX_TOP, BOX_WIDTH * BOX_SCALE, BOX_HEIGHT * BOX_SCALE);
  context.strokeStyle = palette.ink;
  context.lineWidth = 2.4;
  context.strokeRect(BOX_LEFT, BOX_TOP, BOX_WIDTH * BOX_SCALE, BOX_HEIGHT * BOX_SCALE);
  context.restore();

  drawLabel(context, 'Gas in a box', BOX_LEFT, BOX_TOP - 14, {
    color: palette.muted,
    size: 13,
    weight: 700,
  });
}

function drawParticles(
  context: CanvasRenderingContext2D,
  state: GasState,
  speedAxisMaximum: number,
  colorBySpeed: boolean,
): void {
  const screenRadius = Math.max(2.2, PARTICLE_RADIUS * BOX_SCALE);
  const safeMaximum = speedAxisMaximum > 1e-9 ? speedAxisMaximum : 1;

  for (const particle of state.particles) {
    const point = toScreen(particle.x, particle.y);
    const speed = Math.hypot(particle.vx, particle.vy);
    const fill = colorBySpeed ? speedColor(speed / safeMaximum) : palette.teal;
    drawDisc(context, point, screenRadius, { fill });
  }
}

function speedHistogramBuckets(
  state: GasState,
  speedAxisMaximum: number,
): { counts: number[]; bucketWidth: number } {
  const counts = new Array<number>(BUCKET_COUNT).fill(0);
  const safeMaximum = speedAxisMaximum > 1e-9 ? speedAxisMaximum : 1;
  const bucketWidth = safeMaximum / BUCKET_COUNT;

  for (const particle of state.particles) {
    const speed = Math.hypot(particle.vx, particle.vy);
    const index = Math.min(BUCKET_COUNT - 1, Math.floor(speed / bucketWidth));
    counts[index] += 1;
  }
  return { counts, bucketWidth };
}

function drawHistogram(
  context: CanvasRenderingContext2D,
  state: GasState,
  temperature: number,
  mostProbableSpeed: number,
  speedAxisMaximum: number,
): void {
  const { counts, bucketWidth } = speedHistogramBuckets(state, speedAxisMaximum);
  const particleCount = state.particles.length;

  // Scale so that whichever is taller — the busiest bucket or the theory peak —
  // just fills the panel, keeping bars and curve directly comparable.
  const peakProbability =
    particleCount > 0
      ? Math.max(...counts.map((count) => count / particleCount))
      : 0;
  const peakDensity = maxwellSpeedDensity(mostProbableSpeed, temperature) * bucketWidth;
  const verticalScale =
    HISTOGRAM_HEIGHT / Math.max(peakProbability, peakDensity, 1e-6) / 1.12;

  // Axis frame.
  context.save();
  context.strokeStyle = palette.gridStrong;
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(HISTOGRAM_LEFT, HISTOGRAM_TOP - 6);
  context.lineTo(HISTOGRAM_LEFT, HISTOGRAM_BASELINE);
  context.lineTo(HISTOGRAM_LEFT + HISTOGRAM_WIDTH, HISTOGRAM_BASELINE);
  context.stroke();
  context.restore();

  // Live bars, tinted by their bucket's speed.
  const barSlot = HISTOGRAM_WIDTH / BUCKET_COUNT;
  const safeMaximum = speedAxisMaximum > 1e-9 ? speedAxisMaximum : 1;
  for (let index = 0; index < BUCKET_COUNT; index += 1) {
    const probability = particleCount > 0 ? counts[index] / particleCount : 0;
    const barHeight = probability * verticalScale;
    if (barHeight < 0.5) {
      continue;
    }
    const bucketSpeed = (index + 0.5) * bucketWidth;
    const x = HISTOGRAM_LEFT + index * barSlot + barSlot * 0.12;
    const width = barSlot * 0.76;
    context.fillStyle = speedColor(bucketSpeed / safeMaximum);
    context.globalAlpha = 0.82;
    context.fillRect(x, HISTOGRAM_BASELINE - barHeight, width, barHeight);
    context.globalAlpha = 1;
  }

  drawTheoryCurve(context, temperature, bucketWidth, verticalScale, safeMaximum);
  drawMostProbableMarker(context, mostProbableSpeed, safeMaximum);

  drawLabel(context, 'Speed distribution', HISTOGRAM_LEFT, HISTOGRAM_TOP - 18, {
    color: palette.muted,
    size: 13,
    weight: 700,
  });
  drawLabel(context, 'speed →', HISTOGRAM_LEFT + HISTOGRAM_WIDTH, HISTOGRAM_BASELINE + 18, {
    color: palette.faint,
    size: 11,
    weight: 600,
    align: 'right',
  });
}

function drawTheoryCurve(
  context: CanvasRenderingContext2D,
  temperature: number,
  bucketWidth: number,
  verticalScale: number,
  speedAxisMaximum: number,
): void {
  // The bars show probability per bucket, so multiply the density by bucketWidth
  // to put the curve on the same footing.
  context.save();
  context.strokeStyle = palette.violet;
  context.lineWidth = 2.2;
  context.beginPath();
  const samples = 120;
  for (let i = 0; i <= samples; i += 1) {
    const speed = (i / samples) * speedAxisMaximum;
    const probability = maxwellSpeedDensity(speed, temperature) * bucketWidth;
    const x = HISTOGRAM_LEFT + (speed / speedAxisMaximum) * HISTOGRAM_WIDTH;
    const y = HISTOGRAM_BASELINE - probability * verticalScale;
    if (i === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();
  context.restore();

  drawLabel(context, 'Maxwell–Boltzmann', HISTOGRAM_LEFT + HISTOGRAM_WIDTH, HISTOGRAM_TOP - 2, {
    color: palette.violet,
    size: 11,
    weight: 700,
    align: 'right',
  });
}

function drawMostProbableMarker(
  context: CanvasRenderingContext2D,
  mostProbableSpeed: number,
  speedAxisMaximum: number,
): void {
  const fraction = Math.min(1, mostProbableSpeed / speedAxisMaximum);
  const x = HISTOGRAM_LEFT + fraction * HISTOGRAM_WIDTH;
  context.save();
  context.setLineDash([4, 5]);
  context.strokeStyle = palette.amber;
  context.lineWidth = 1.6;
  context.beginPath();
  context.moveTo(x, HISTOGRAM_TOP - 4);
  context.lineTo(x, HISTOGRAM_BASELINE);
  context.stroke();
  context.restore();

  drawLabel(context, 'vₚ', x, HISTOGRAM_TOP - 6, {
    color: palette.amber,
    size: 12,
    weight: 800,
    align: 'center',
  });
}

function drawLegend(context: CanvasRenderingContext2D, colorBySpeed: boolean): void {
  const baseY = STAGE_HEIGHT - 22;
  if (colorBySpeed) {
    drawLabel(context, '● slow', BOX_LEFT, baseY, { color: palette.blue, size: 12, weight: 600 });
    drawLabel(context, '● fast', BOX_LEFT + 70, baseY, { color: palette.red, size: 12, weight: 600 });
  } else {
    drawLabel(context, '● particles', BOX_LEFT, baseY, { color: palette.teal, size: 12, weight: 600 });
  }
}

// Expose the framing constant so the lab can derive a matching speed axis from
// temperature each frame.
export function speedAxisFor(mostProbableSpeed: number): number {
  return Math.max(mostProbableSpeed * SPEED_AXIS_FACTOR, 1e-6);
}
