import {
  clearStage,
  drawDashedLine,
  drawDotGrid,
  drawLabel,
  palette,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from '../shared/stage';
import {
  effectiveSlitCount,
  principalMaxima,
  relativeIntensity,
  singleSlitEnvelope,
  wavelengthNanometresToRgb,
  type DiffractionParameters,
} from './diffraction-physics';

// Layout: a thin aperture diagram up top, the intensity curve I(θ) filling the
// middle, and (optionally) a brightness band along the bottom that mimics the
// dark/light fringes a real screen would show.
const PLOT_LEFT = 64;
const PLOT_RIGHT = STAGE_WIDTH - 64;
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT;
const CENTER_X = (PLOT_LEFT + PLOT_RIGHT) / 2;

const APERTURE_Y = 88;
const APERTURE_HALF = 70;

const PLOT_TOP = 168;
const PLOT_BASELINE = 432;
const PLOT_HEIGHT = PLOT_BASELINE - PLOT_TOP;

const BAND_TOP = 470;
const BAND_HEIGHT = 40;

// Angular half-window of the sweep: sinθ runs from −SIN_MAX..+SIN_MAX.
export const SIN_MAX = 0.6;
const SAMPLE_COUNT = 720;

export type DiffractionSceneOptions = {
  parameters: DiffractionParameters;
  // Visible wavelength in nanometres, used only to tint the screen band; the
  // diffraction maths uses parameters.wavelength in aperture units.
  wavelengthNanometres: number;
  showEnvelope: boolean;
  showScreenBand: boolean;
};

// Map sinθ ∈ [−SIN_MAX, SIN_MAX] to a horizontal pixel position on the plot.
function sinThetaToX(sinTheta: number): number {
  return CENTER_X + (sinTheta / SIN_MAX) * (PLOT_WIDTH / 2);
}

export function drawDiffraction(
  context: CanvasRenderingContext2D,
  options: DiffractionSceneOptions,
): void {
  const { parameters, wavelengthNanometres, showEnvelope, showScreenBand } = options;
  clearStage(context);
  drawDotGrid(context);

  drawAperture(context, parameters);
  drawAxis(context);
  if (showEnvelope) {
    drawEnvelopeOverlay(context, parameters);
  }
  drawIntensityCurve(context, parameters);
  drawOrderLabels(context, parameters);
  if (showScreenBand) {
    drawScreenBand(context, parameters, wavelengthNanometres);
  }
  drawLegend(context, parameters, showEnvelope);
}

// Width of the opaque barrier drawn at the aperture plane, in pixels. The slits
// are punched out of this as background-coloured gaps so they read as the lit
// openings (transparent), not as solid blocks.
const APERTURE_BARRIER_WIDTH = 7;

// Top diagram: a thin opaque barrier at the aperture plane with the slit
// openings punched out to scale from a (width) and d (spacing), centred on
// CENTER_X. The barrier is solid ink; the slits read as transparent gaps.
function drawAperture(context: CanvasRenderingContext2D, parameters: DiffractionParameters): void {
  const slits = effectiveSlitCount(parameters);
  const top = APERTURE_Y - APERTURE_HALF;
  const bottom = APERTURE_Y + APERTURE_HALF;
  const barrierLeft = CENTER_X - APERTURE_BARRIER_WIDTH / 2;

  // The opaque barrier: a thin solid block spanning the aperture plane.
  context.save();
  context.fillStyle = palette.ink;
  context.fillRect(barrierLeft, top, APERTURE_BARRIER_WIDTH, bottom - top);
  context.restore();

  // Pixel scale: pick a unit-per-pixel so the widest slit array stays on the
  // plane. The array spans (slits-1)·d + a aperture units, laid out vertically.
  const span = (slits - 1) * parameters.slitSpacing + parameters.slitWidth;
  const usableHalf = APERTURE_HALF - 6;
  const unitsToPixels = (2 * usableHalf) / Math.max(span, parameters.slitWidth, 1);
  const slitPixelWidth = Math.max(parameters.slitWidth * unitsToPixels, 2);
  const spacingPixels = parameters.slitSpacing * unitsToPixels;
  const firstOffset = -((slits - 1) * spacingPixels) / 2;

  // Punch each slit out of the barrier by overpainting with the background, so
  // the opening reads as a transparent gap rather than a solid mark.
  context.save();
  context.fillStyle = palette.surface;
  for (let index = 0; index < slits; index += 1) {
    const centerY = APERTURE_Y + firstOffset + index * spacingPixels;
    context.fillRect(
      barrierLeft - 1,
      centerY - slitPixelWidth / 2,
      APERTURE_BARRIER_WIDTH + 2,
      slitPixelWidth,
    );
  }
  context.restore();

  drawLabel(context, 'aperture', CENTER_X, top - 12, {
    color: palette.muted,
    size: 11,
    weight: 700,
    align: 'center',
  });
  const slitNote =
    slits === 1 ? 'single slit' : slits === 2 ? 'double slit' : `${slits}-slit grating`;
  drawLabel(context, slitNote, CENTER_X + 18, APERTURE_Y, {
    color: palette.muted,
    size: 12,
    weight: 700,
    baseline: 'middle',
  });
}

// The sinθ axis with a baseline and a centre tick at θ = 0.
function drawAxis(context: CanvasRenderingContext2D): void {
  context.save();
  context.strokeStyle = palette.gridStrong;
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(PLOT_LEFT, PLOT_BASELINE);
  context.lineTo(PLOT_RIGHT, PLOT_BASELINE);
  context.stroke();
  context.restore();

  drawDashedLine(
    context,
    { x: CENTER_X, y: PLOT_TOP - 6 },
    { x: CENTER_X, y: PLOT_BASELINE },
    palette.faint,
  );
  drawLabel(context, 'sin θ →', PLOT_RIGHT, PLOT_BASELINE + 18, {
    color: palette.muted,
    size: 11,
    weight: 600,
    align: 'right',
  });
  drawLabel(context, 'I / I₀', PLOT_LEFT - 8, PLOT_TOP + 4, {
    color: palette.muted,
    size: 11,
    weight: 600,
    align: 'right',
  });
}

// Walk the sinθ sweep, mapping each sample to its plot point and feeding it to
// the supplied path step. Shared by the envelope and intensity curves so the
// sampling loop lives in one place.
const traceCurve = (
  sample: (sinTheta: number) => number,
  step: (x: number, y: number, index: number) => void,
): void => {
  for (let index = 0; index <= SAMPLE_COUNT; index += 1) {
    const sinTheta = -SIN_MAX + (2 * SIN_MAX * index) / SAMPLE_COUNT;
    const value = sample(sinTheta);
    const x = sinThetaToX(sinTheta);
    const y = PLOT_BASELINE - value * PLOT_HEIGHT;
    step(x, y, index);
  }
};

// Stroke a curve y = f(sinθ) across the sweep with the given style.
const plotCurve = (
  context: CanvasRenderingContext2D,
  sample: (sinTheta: number) => number,
  style: { stroke: string; width: number; dash?: number[] },
): void => {
  context.save();
  if (style.dash) {
    context.setLineDash(style.dash);
  }
  context.strokeStyle = style.stroke;
  context.lineWidth = style.width;
  context.beginPath();
  traceCurve(sample, (x, y, index) => {
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();
  context.restore();
};

// Single-slit envelope sinc²(β), drawn dashed so it reads as "the cap the fine
// fringes live under".
function drawEnvelopeOverlay(
  context: CanvasRenderingContext2D,
  parameters: DiffractionParameters,
): void {
  plotCurve(context, (sinTheta) => singleSlitEnvelope(sinTheta, parameters), {
    stroke: palette.muted,
    width: 1.6,
    dash: [6, 6],
  });
}

// The full intensity I(θ): a blue fill down to the baseline plus the curve on top.
function drawIntensityCurve(
  context: CanvasRenderingContext2D,
  parameters: DiffractionParameters,
): void {
  const sample = (sinTheta: number): number => relativeIntensity(sinTheta, parameters);

  context.save();
  context.beginPath();
  context.moveTo(PLOT_LEFT, PLOT_BASELINE);
  traceCurve(sample, (x, y) => context.lineTo(x, y));
  context.lineTo(PLOT_RIGHT, PLOT_BASELINE);
  context.closePath();
  context.fillStyle = 'rgba(37, 99, 235, 0.18)';
  context.fill();
  context.restore();

  plotCurve(context, sample, { stroke: palette.blue, width: 2.2 });
}

// Tick + label each principal maximum order m where d·sinθ = mλ.
function drawOrderLabels(
  context: CanvasRenderingContext2D,
  parameters: DiffractionParameters,
): void {
  const maxima = principalMaxima(parameters, SIN_MAX);
  maxima.forEach(({ order, sinTheta }) => {
    const x = sinThetaToX(sinTheta);
    const peak = relativeIntensity(sinTheta, parameters);
    const y = PLOT_BASELINE - peak * PLOT_HEIGHT;
    context.save();
    context.strokeStyle = palette.amber;
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(x, PLOT_BASELINE);
    context.lineTo(x, PLOT_BASELINE + 6);
    context.stroke();
    context.restore();

    const label = order === 0 ? 'm = 0' : order > 0 ? `+${order}` : `${order}`;
    drawLabel(context, label, x, Math.min(y - 8, PLOT_BASELINE - 8), {
      color: palette.amber,
      size: 11,
      weight: 700,
      align: 'center',
    });
  });
}

// Bottom band: map intensity to brightness across the screen, tinted by the
// wavelength so it reads as the actual coloured fringes you would see.
function drawScreenBand(
  context: CanvasRenderingContext2D,
  parameters: DiffractionParameters,
  wavelengthNanometres: number,
): void {
  const [r, g, b] = wavelengthNanometresToRgb(wavelengthNanometres);
  context.save();
  for (let pixelX = PLOT_LEFT; pixelX <= PLOT_RIGHT; pixelX += 1) {
    const fraction = (pixelX - CENTER_X) / (PLOT_WIDTH / 2);
    const sinTheta = fraction * SIN_MAX;
    const brightness = Math.min(relativeIntensity(sinTheta, parameters), 1);
    context.fillStyle = `rgb(${Math.round(r * brightness)}, ${Math.round(g * brightness)}, ${Math.round(b * brightness)})`;
    context.fillRect(pixelX, BAND_TOP, 1, BAND_HEIGHT);
  }
  context.strokeStyle = palette.gridStrong;
  context.lineWidth = 1;
  context.strokeRect(PLOT_LEFT, BAND_TOP, PLOT_WIDTH, BAND_HEIGHT);
  context.restore();

  drawLabel(context, 'screen', PLOT_LEFT, BAND_TOP - 8, {
    color: palette.muted,
    size: 11,
    weight: 700,
  });
}

function drawLegend(
  context: CanvasRenderingContext2D,
  parameters: DiffractionParameters,
  showEnvelope: boolean,
): void {
  let line = STAGE_HEIGHT - 20;
  drawLabel(context, '▬ intensity I(θ)', 24, line, {
    color: palette.blue,
    size: 12,
    weight: 600,
  });
  if (showEnvelope && effectiveSlitCount(parameters) > 1) {
    line -= 18;
    drawLabel(context, '┄ single-slit envelope', 24, line, {
      color: palette.muted,
      size: 12,
      weight: 600,
    });
  }
}
