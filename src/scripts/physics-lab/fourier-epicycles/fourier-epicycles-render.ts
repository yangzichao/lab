import {
  drawArrow,
  drawDashedLine,
  drawDisc,
  drawDotGrid,
  drawLabel,
  palette,
  clearStage,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Point,
} from '../shared/stage';
import {
  buildChain,
  sampleTargetWave,
  synthesizeValue,
  type ChainLink,
  type Harmonic,
  type WaveformKind,
} from './fourier-epicycles-physics';

// Layout: the epicycle chain lives in the left column, the scrolling waveform in
// the wide right column. The chain's centre y and the wave's baseline share the
// same row so the horizontal "projection" line reads cleanly straight across.
const CHAIN_CENTER: Point = { x: 188, y: STAGE_HEIGHT / 2 };
const WAVE_LEFT = 360;
const WAVE_RIGHT = STAGE_WIDTH - 40;
const WAVE_BASELINE = STAGE_HEIGHT / 2;
// Pixels per unit of amplitude. The tallest wave (sawtooth/square ≈ ±1) stays
// comfortably inside the stage at this scale.
const AMPLITUDE_SCALE = 92;
// How many seconds of history fill the wave window; one base period is 2π/ω, so
// at ω = 1 this shows roughly one full cycle.
const WINDOW_SECONDS = Math.PI * 2;

export type FourierScene = {
  kind: WaveformKind;
  harmonics: Harmonic[];
  baseFrequency: number;
  time: number;
  showCircles: boolean;
  showTarget: boolean;
};

const harmonicColor = palette.teal;

// The physics chain lives in raw amplitude units around CHAIN_CENTER; scale an
// offset into stage pixels.
const toPixel = (point: Point): Point => ({
  x: CHAIN_CENTER.x + (point.x - CHAIN_CENTER.x) * AMPLITUDE_SCALE,
  y: CHAIN_CENTER.y + (point.y - CHAIN_CENTER.y) * AMPLITUDE_SCALE,
});

export function drawFourierEpicycles(context: CanvasRenderingContext2D, scene: FourierScene): void {
  const { harmonics, baseFrequency, time, showCircles } = scene;
  clearStage(context);
  drawDotGrid(context);

  const { links, tip } = buildChain(harmonics, baseFrequency, time, CHAIN_CENTER);

  // Faint guide circles for each epicycle (radius = |amplitude|).
  if (showCircles) {
    context.save();
    context.strokeStyle = palette.faint;
    context.lineWidth = 1;
    for (const link of links) {
      const center = toPixel(link.from);
      const radius = Math.abs(link.amplitude) * AMPLITUDE_SCALE;
      if (radius < 1.5) {
        continue;
      }
      context.beginPath();
      context.arc(center.x, center.y, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  // The rotating vectors, drawn tip-to-tail.
  for (const link of links) {
    drawArrow(context, toPixel(link.from), toPixel(link.to), {
      color: harmonicColor,
      width: 2,
      headSize: 7,
    });
  }

  const tipPixel = toPixel(tip);

  // Centre pivot of the whole chain.
  drawDisc(context, CHAIN_CENTER, 4, { fill: palette.ink });

  // Label the largest few epicycles with their harmonic number n.
  labelLargestHarmonics(context, links);

  // The scrolling traced wave on the right (blue) + optional target (dashed).
  drawWaveWindow(context, scene, tipPixel);

  // Moving tip marker.
  drawDisc(context, tipPixel, 6, { fill: palette.blue, stroke: '#ffffff', strokeWidth: 2, glow: true });

  drawLegend(context);
}

function labelLargestHarmonics(context: CanvasRenderingContext2D, links: ChainLink[]): void {
  const ranked = [...links]
    .sort((a, b) => Math.abs(b.amplitude) - Math.abs(a.amplitude))
    .slice(0, 3);
  for (const link of ranked) {
    const radius = Math.abs(link.amplitude) * AMPLITUDE_SCALE;
    if (radius < 12) {
      continue;
    }
    const center = toPixel(link.from);
    drawLabel(context, `n=${link.harmonic}`, center.x, center.y - radius - 4, {
      color: palette.amber,
      size: 12,
      weight: 700,
      align: 'center',
      background: true,
    });
  }
}

function drawWaveWindow(
  context: CanvasRenderingContext2D,
  scene: FourierScene,
  tipPixel: Point,
): void {
  const { kind, harmonics, baseFrequency, time, showTarget } = scene;

  // Baseline axis for the wave window.
  drawDashedLine(
    context,
    { x: WAVE_LEFT, y: WAVE_BASELINE },
    { x: WAVE_RIGHT, y: WAVE_BASELINE },
    palette.gridStrong,
    [2, 6],
  );

  const timeToX = (sampleTime: number): number => {
    // The current moment sits at WAVE_LEFT, history scrolls to the right.
    const age = time - sampleTime;
    return WAVE_LEFT + (age / WINDOW_SECONDS) * (WAVE_RIGHT - WAVE_LEFT);
  };
  // Match the chain's vertical convention exactly: the tip sits at
  // CHAIN_CENTER.y + value·SCALE (screen y grows downward), and CHAIN_CENTER.y ==
  // WAVE_BASELINE, so the wave's current point lands at the same y as tipPixel.y
  // and the horizontal projection line connects them precisely.
  const valueToY = (value: number): number => WAVE_BASELINE + value * AMPLITUDE_SCALE;

  const stepCount = 240;

  // Optional ideal target curve (muted dashed) for comparison. A high-N
  // truncation stands in for the ideal infinite series.
  if (showTarget) {
    const targetSamples = sampleTargetWave(kind, baseFrequency, time, time - WINDOW_SECONDS, stepCount);
    context.save();
    context.setLineDash([5, 6]);
    context.strokeStyle = palette.muted;
    context.lineWidth = 1.4;
    context.beginPath();
    targetSamples.forEach((sample, index) => {
      const x = timeToX(sample.time);
      const y = valueToY(sample.value);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();
    context.restore();
  }

  // The synthesised (truncated) wave traced by the tip (blue solid).
  context.save();
  context.strokeStyle = palette.blue;
  context.lineWidth = 2.4;
  context.beginPath();
  for (let index = 0; index <= stepCount; index += 1) {
    const sampleTime = time - (WINDOW_SECONDS * index) / stepCount;
    const x = timeToX(sampleTime);
    const y = valueToY(synthesizeValue(harmonics, baseFrequency, sampleTime));
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();
  context.restore();

  // The horizontal "projection" line connecting the chain tip to the wave's
  // current point — the heart of the demo.
  const currentPoint: Point = { x: WAVE_LEFT, y: tipPixel.y };
  drawDashedLine(context, tipPixel, currentPoint, palette.amber, [4, 5]);
  drawDisc(context, currentPoint, 5, { fill: palette.blue });
}

function drawLegend(context: CanvasRenderingContext2D): void {
  drawLabel(context, '→ rotating terms', 24, STAGE_HEIGHT - 56, {
    color: palette.teal,
    size: 12,
    weight: 600,
  });
  drawLabel(context, '— synthesised wave', 24, STAGE_HEIGHT - 38, {
    color: palette.blue,
    size: 12,
    weight: 600,
  });
  drawLabel(context, '·· target wave', 24, STAGE_HEIGHT - 20, {
    color: palette.muted,
    size: 12,
    weight: 600,
  });
}
