import {
  clearStage,
  drawArrow,
  drawDisc,
  drawDotGrid,
  drawFadingTrail,
  drawLabel,
  palette,
  rgb,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Point,
} from '../shared/stage';
import {
  cyclotronRadius,
  lorentzAcceleration,
  speedOf,
  type FieldParameters,
  type ParticleState,
} from './charged-particle-physics';

// The simulation works in metres; this maps a metre to a pixel and puts the
// origin at the stage centre so the particle has room to spiral.
const CENTER: Point = { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };
export const PIXELS_PER_METRE = 5.2;

// Vector arrows are scaled to be readable, then clamped so a fast particle or a
// strong field never paints an arrow off the canvas.
const velocityArrowScale = 3.2;
const forceArrowScale = 0.34;
const maximumArrowLength = 150;

// Spacing of the background field symbols, in pixels.
const fieldSpacing = 60;

export function particleScreenPosition(state: ParticleState): Point {
  return {
    x: CENTER.x + state.x * PIXELS_PER_METRE,
    y: CENTER.y + state.y * PIXELS_PER_METRE,
  };
}

export type ParticleSceneOptions = {
  state: ParticleState;
  fields: FieldParameters;
  trail: Point[];
  showTrail: boolean;
  showVectors: boolean;
  showField: boolean;
};

export function drawChargedParticle(
  context: CanvasRenderingContext2D,
  options: ParticleSceneOptions,
): void {
  const { state, fields, trail, showTrail, showVectors, showField } = options;
  clearStage(context);
  drawDotGrid(context);

  if (showField) {
    drawMagneticField(context, fields);
    drawElectricField(context, fields);
  }

  if (showTrail) {
    drawFadingTrail(context, trail, rgb.blue, { width: 2.4, maxAlpha: 0.55 });
  }

  const particle = particleScreenPosition(state);

  // A pure magnetic field bends the path into a circle; show the osculating
  // cyclotron orbit so the geometry is explicit.
  if (isPureMagnetic(fields)) {
    drawCyclotronCircle(context, state, fields, particle);
  }

  if (showVectors) {
    drawVelocityAndForce(context, state, fields, particle);
  }

  drawDisc(context, particle, 10, {
    fill: palette.blue,
    stroke: '#ffffff',
    strokeWidth: 3,
    glow: true,
  });

  drawLegend(context);
}

function isPureMagnetic(fields: FieldParameters): boolean {
  const electricMagnitude = Math.hypot(fields.electricX, fields.electricY);
  return Math.abs(fields.magneticZ) > 1e-6 && electricMagnitude < 1e-6;
}

// Bz out of the page (positive) → ⊙, into the page (negative) → ⊗.
function drawMagneticField(context: CanvasRenderingContext2D, fields: FieldParameters): void {
  if (Math.abs(fields.magneticZ) < 1e-6) {
    return;
  }
  const outOfPage = fields.magneticZ > 0;
  const symbolRadius = 6;
  context.save();
  context.strokeStyle = palette.faint;
  context.fillStyle = palette.faint;
  context.lineWidth = 1.2;
  for (let x = fieldSpacing; x < STAGE_WIDTH; x += fieldSpacing) {
    for (let y = fieldSpacing; y < STAGE_HEIGHT; y += fieldSpacing) {
      context.beginPath();
      context.arc(x, y, symbolRadius, 0, Math.PI * 2);
      context.stroke();
      if (outOfPage) {
        // ⊙ — a dot for a field arrow tip coming toward you.
        context.beginPath();
        context.arc(x, y, 1.5, 0, Math.PI * 2);
        context.fill();
      } else {
        // ⊗ — crossed lines for the tail of an arrow heading away.
        const d = symbolRadius * 0.7;
        context.beginPath();
        context.moveTo(x - d, y - d);
        context.lineTo(x + d, y + d);
        context.moveTo(x + d, y - d);
        context.lineTo(x - d, y + d);
        context.stroke();
      }
    }
  }
  context.restore();
}

// E shown as a faint amber arrow lattice pointing along the field direction.
function drawElectricField(context: CanvasRenderingContext2D, fields: FieldParameters): void {
  const magnitude = Math.hypot(fields.electricX, fields.electricY);
  if (magnitude < 1e-6) {
    return;
  }
  const unitX = fields.electricX / magnitude;
  const unitY = fields.electricY / magnitude;
  const half = 16;
  context.save();
  context.globalAlpha = 0.5;
  for (let x = fieldSpacing; x < STAGE_WIDTH; x += fieldSpacing) {
    for (let y = fieldSpacing; y < STAGE_HEIGHT; y += fieldSpacing) {
      drawArrow(
        context,
        { x: x - unitX * half, y: y - unitY * half },
        { x: x + unitX * half, y: y + unitY * half },
        { color: palette.amber, width: 1.6, headSize: 6 },
      );
    }
  }
  context.restore();
}

function drawCyclotronCircle(
  context: CanvasRenderingContext2D,
  state: ParticleState,
  fields: FieldParameters,
  particle: Point,
): void {
  const radiusMetres = cyclotronRadius(state, fields);
  if (radiusMetres === null) {
    return;
  }
  const speed = speedOf(state);
  if (speed < 1e-6) {
    return;
  }
  // The centre lies perpendicular to the velocity. For positive q·Bz the
  // magnetic force q v×B points so the particle turns clockwise on screen
  // (y down), so the centre is to the velocity's left: rotate v by −90°.
  const sign = fields.charge * fields.magneticZ > 0 ? 1 : -1;
  const radiusPixels = radiusMetres * PIXELS_PER_METRE;
  const centre: Point = {
    x: particle.x + sign * (state.vy / speed) * radiusPixels,
    y: particle.y - sign * (state.vx / speed) * radiusPixels,
  };
  context.save();
  context.setLineDash([4, 8]);
  context.strokeStyle = 'rgba(15, 118, 110, 0.45)';
  context.lineWidth = 1.6;
  context.beginPath();
  context.arc(centre.x, centre.y, radiusPixels, 0, Math.PI * 2);
  context.stroke();
  context.restore();
  drawDisc(context, centre, 3, { fill: palette.teal });
}

function drawVelocityAndForce(
  context: CanvasRenderingContext2D,
  state: ParticleState,
  fields: FieldParameters,
  particle: Point,
): void {
  const velocityTip = clampVector(
    { x: state.vx * velocityArrowScale, y: state.vy * velocityArrowScale },
    maximumArrowLength,
  );
  drawArrow(
    context,
    particle,
    { x: particle.x + velocityTip.x, y: particle.y + velocityTip.y },
    { color: palette.teal, width: 3 },
  );
  drawLabel(context, 'v', particle.x + velocityTip.x + 6, particle.y + velocityTip.y, {
    color: palette.teal,
    size: 13,
    weight: 700,
  });

  const acceleration = lorentzAcceleration(state, fields);
  const forceTip = clampVector(
    { x: acceleration.x * forceArrowScale, y: acceleration.y * forceArrowScale },
    maximumArrowLength,
  );
  drawArrow(
    context,
    particle,
    { x: particle.x + forceTip.x, y: particle.y + forceTip.y },
    { color: palette.amber, width: 3 },
  );
  drawLabel(context, 'F', particle.x + forceTip.x + 6, particle.y + forceTip.y, {
    color: palette.amber,
    size: 13,
    weight: 700,
  });
}

function clampVector(vector: Point, maxLength: number): Point {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= maxLength || length === 0) {
    return vector;
  }
  const scale = maxLength / length;
  return { x: vector.x * scale, y: vector.y * scale };
}

function drawLegend(context: CanvasRenderingContext2D): void {
  drawLabel(context, '→ velocity', 24, STAGE_HEIGHT - 38, { color: palette.teal, size: 12, weight: 600 });
  drawLabel(context, '→ Lorentz force', 24, STAGE_HEIGHT - 20, { color: palette.amber, size: 12, weight: 600 });
}
