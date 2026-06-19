import {
  clearStage,
  drawArrow,
  drawAxes,
  drawDashedLine,
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
import { gravityAcceleration, type OrbitMetrics, type OrbitState } from './orbit-physics';

const CENTER: Point = { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };
const velocityArrowScale = 6;
const gravityArrowScale = 240;
const maximumArrowLength = 140;

export function planetScreenPosition(state: OrbitState): Point {
  return { x: CENTER.x + state.x, y: CENTER.y + state.y };
}

export type OrbitSceneOptions = {
  state: OrbitState;
  mu: number;
  trail: Point[];
  metrics: OrbitMetrics;
  showTrail: boolean;
  showOrbit: boolean;
  showVectors: boolean;
};

export function drawOrbit(context: CanvasRenderingContext2D, options: OrbitSceneOptions): void {
  const { state, mu, trail, metrics, showTrail, showOrbit, showVectors } = options;
  clearStage(context);
  drawDotGrid(context);
  drawAxes(context, CENTER);

  if (showOrbit && metrics.bound) {
    drawPredictedOrbit(context, metrics);
  }

  if (showTrail) {
    drawFadingTrail(context, trail, rgb.blue, { width: 2.2, maxAlpha: 0.5 });
  }

  const planet = planetScreenPosition(state);
  drawDashedLine(context, CENTER, planet, palette.faint);
  drawStar(context);

  if (showVectors) {
    drawVelocityAndGravity(context, state, mu, planet);
  }

  drawDisc(context, planet, 11, { fill: palette.blue, stroke: '#ffffff', strokeWidth: 3, glow: true });
  drawLegend(context);
}

function drawPredictedOrbit(context: CanvasRenderingContext2D, metrics: OrbitMetrics): void {
  const cosAngle = Math.cos(metrics.periapsisAngle);
  const sinAngle = Math.sin(metrics.periapsisAngle);
  const focusOffset = metrics.semiMajor * metrics.eccentricity;
  const ellipseCenter: Point = {
    x: CENTER.x - focusOffset * cosAngle,
    y: CENTER.y - focusOffset * sinAngle,
  };

  context.save();
  context.setLineDash([4, 8]);
  context.strokeStyle = 'rgba(37, 99, 235, 0.45)';
  context.lineWidth = 1.6;
  context.beginPath();
  context.ellipse(
    ellipseCenter.x,
    ellipseCenter.y,
    metrics.semiMajor,
    metrics.semiMinor,
    metrics.periapsisAngle,
    0,
    Math.PI * 2,
  );
  context.stroke();
  context.restore();

  const periapsis: Point = {
    x: CENTER.x + metrics.periapsis * cosAngle,
    y: CENTER.y + metrics.periapsis * sinAngle,
  };
  const apoapsis: Point = {
    x: CENTER.x - metrics.apoapsis * cosAngle,
    y: CENTER.y - metrics.apoapsis * sinAngle,
  };
  drawDisc(context, periapsis, 4, { fill: palette.teal });
  drawDisc(context, apoapsis, 4, { fill: palette.violet });
  drawLabel(context, 'periapsis', periapsis.x + 8, periapsis.y - 8, {
    color: palette.teal,
    size: 11,
    weight: 600,
    background: true,
  });
  drawLabel(context, 'apoapsis', apoapsis.x + 8, apoapsis.y - 8, {
    color: palette.violet,
    size: 11,
    weight: 600,
    background: true,
  });
}

function drawVelocityAndGravity(
  context: CanvasRenderingContext2D,
  state: OrbitState,
  mu: number,
  planet: Point,
): void {
  const velocityTip = clampVector(
    { x: state.vx * velocityArrowScale, y: state.vy * velocityArrowScale },
    maximumArrowLength,
  );
  drawArrow(
    context,
    planet,
    { x: planet.x + velocityTip.x, y: planet.y + velocityTip.y },
    { color: palette.teal, width: 3 },
  );
  drawLabel(context, 'v', planet.x + velocityTip.x + 6, planet.y + velocityTip.y, {
    color: palette.teal,
    size: 13,
    weight: 700,
  });

  const acceleration = gravityAcceleration(state, mu);
  const gravityTip = clampVector(
    { x: acceleration.x * gravityArrowScale, y: acceleration.y * gravityArrowScale },
    maximumArrowLength,
  );
  drawArrow(
    context,
    planet,
    { x: planet.x + gravityTip.x, y: planet.y + gravityTip.y },
    { color: palette.amber, width: 3 },
  );
  drawLabel(context, 'g', planet.x + gravityTip.x + 6, planet.y + gravityTip.y, {
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

function drawStar(context: CanvasRenderingContext2D): void {
  const gradient = context.createRadialGradient(CENTER.x, CENTER.y, 4, CENTER.x, CENTER.y, 46);
  gradient.addColorStop(0, '#fff3c4');
  gradient.addColorStop(0.4, 'rgba(245, 158, 11, 0.7)');
  gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(CENTER.x, CENTER.y, 46, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = palette.amber;
  context.beginPath();
  context.arc(CENTER.x, CENTER.y, 15, 0, Math.PI * 2);
  context.fill();
}

function drawLegend(context: CanvasRenderingContext2D): void {
  drawLabel(context, '→ velocity', 24, STAGE_HEIGHT - 38, { color: palette.teal, size: 12, weight: 600 });
  drawLabel(context, '→ gravity', 24, STAGE_HEIGHT - 20, { color: palette.amber, size: 12, weight: 600 });
}
