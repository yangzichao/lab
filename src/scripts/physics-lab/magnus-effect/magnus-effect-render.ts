import {
  cinematicPalette,
  drawCinematicBackdrop,
  drawGlowDisc,
  drawGlowLine,
  drawGlowPath,
  drawHudPanel,
  drawPerspectiveGrid,
} from '../shared/cinematic-stage';
import { drawArrow, drawLabel, STAGE_HEIGHT, STAGE_WIDTH, type Point } from '../shared/stage';
import type { MagnusParameters, MagnusSnapshot, MagnusState } from './magnus-effect-physics';

const plot = { left: 68, right: 850, top: 54, bottom: 474 };

function project(point: Point): Point {
  return {
    x: plot.left + (point.x / 50) * (plot.right - plot.left),
    y: plot.bottom - (point.y / 18) * (plot.bottom - plot.top),
  };
}

function drawFlightPath(
  context: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  reference = false,
): void {
  const projected = points.map(project);
  if (reference) {
    context.save();
    context.strokeStyle = 'rgba(155, 177, 197, 0.42)';
    context.lineWidth = 1.5;
    context.setLineDash([7, 8]);
    context.beginPath();
    projected.forEach((point, index) => index === 0
      ? context.moveTo(point.x, point.y)
      : context.lineTo(point.x, point.y));
    context.stroke();
    context.restore();
    return;
  }
  drawGlowPath(context, projected, color, 3.2, 16);
  projected.filter((_, index) => index > 0 && index % 24 === 0).forEach((point) => {
    context.fillStyle = 'rgba(66, 232, 255, 0.22)';
    context.beginPath();
    context.arc(point.x, point.y, 3, 0, Math.PI * 2);
    context.fill();
  });
}

function drawFlowField(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  snapshot: MagnusSnapshot,
  elapsedSeconds: number,
): void {
  const spinDirection = Math.sign(snapshot.spinRatio) || 1;
  const fastSide = spinDirection > 0 ? -1 : 1;

  const pressureGlow = (side: number, color: string): void => {
    const y = center.y + side * radius * 1.2;
    const gradient = context.createRadialGradient(center.x, y, 2, center.x, y, radius * 3.2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(center.x, y, radius * 3.2, 0, Math.PI * 2);
    context.fill();
  };
  pressureGlow(fastSide, 'rgba(66, 232, 255, 0.22)');
  pressureGlow(-fastSide, 'rgba(255, 79, 104, 0.2)');

  for (let index = -3; index <= 3; index += 1) {
    if (index === 0) continue;
    const offset = index * radius * 0.82;
    const bend = -spinDirection * radius * (1.15 - Math.min(1, Math.abs(index) / 3));
    context.save();
    context.strokeStyle = index * fastSide > 0 ? cinematicPalette.cyan : cinematicPalette.red;
    context.globalAlpha = 0.42 + (3 - Math.abs(index)) * 0.1;
    context.lineWidth = Math.abs(index) === 1 ? 2.1 : 1.25;
    context.shadowColor = context.strokeStyle;
    context.shadowBlur = 8;
    context.setLineDash([16, 12]);
    context.lineDashOffset = -elapsedSeconds * (42 + Math.abs(index) * 8);
    context.beginPath();
    context.moveTo(center.x + radius * 4.2, center.y + offset);
    context.bezierCurveTo(
      center.x + radius * 1.7,
      center.y + offset + bend,
      center.x - radius * 1.7,
      center.y + offset + bend,
      center.x - radius * 4.2,
      center.y + offset,
    );
    context.stroke();
    context.restore();
  }
}

function drawSpinningBall(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  parameters: MagnusParameters,
  elapsedSeconds: number,
): void {
  drawGlowDisc(context, center, radius, cinematicPalette.teal, '#dffdf7');
  const ballGradient = context.createRadialGradient(
    center.x - radius * 0.35,
    center.y - radius * 0.42,
    1,
    center.x,
    center.y,
    radius,
  );
  ballGradient.addColorStop(0, '#ffffff');
  ballGradient.addColorStop(0.55, '#bde9df');
  ballGradient.addColorStop(1, '#245e5a');
  context.fillStyle = ballGradient;
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fill();

  const rotation = elapsedSeconds * parameters.spinRate * Math.PI * 2 / 60;
  context.save();
  context.translate(center.x, center.y);
  context.rotate(rotation);
  context.strokeStyle = 'rgba(4, 30, 33, 0.75)';
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(0, 0, radius * 0.36, radius * 0.92, 0, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(0, 0, radius * 0.62, -0.8, 1.75);
  context.stroke();
  context.restore();
}

function drawForceVectors(
  context: CanvasRenderingContext2D,
  center: Point,
  state: MagnusState,
  snapshot: MagnusSnapshot,
  english: boolean,
): void {
  const speedScale = 2.7;
  const speed = Math.max(0.01, snapshot.speed);
  const velocityEnd = {
    x: center.x + state.velocity.x / speed * speedScale * 25,
    y: center.y - state.velocity.y / speed * speedScale * 25,
  };
  drawArrow(context, center, velocityEnd, { color: cinematicPalette.cyan, width: 2.4, headSize: 9 });
  drawLabel(context, 'v', velocityEnd.x + 7, velocityEnd.y, { color: cinematicPalette.cyan, size: 12 });

  const liftDirection = snapshot.liftForce >= 0 ? -1 : 1;
  const liftEnd = { x: center.x, y: center.y + liftDirection * Math.min(76, 34 + Math.abs(snapshot.liftForce) * 8) };
  drawArrow(context, center, liftEnd, { color: cinematicPalette.amber, width: 3, headSize: 10 });
  drawLabel(context, 'Fᴍ', liftEnd.x + 9, liftEnd.y + liftDirection * 4, { color: cinematicPalette.amber, size: 12, weight: 800 });

  drawArrow(context, { x: center.x - 10, y: center.y + 8 }, { x: center.x - 10, y: center.y + 58 }, { color: cinematicPalette.red, width: 2, headSize: 8 });
  drawLabel(context, 'mg', center.x - 18, center.y + 75, { color: cinematicPalette.red, size: 11, align: 'center' });

  drawHudPanel(context, 28, 24, 224, 58);
  drawLabel(context, english ? 'FORCE NARRATIVE' : '受力叙事', 43, 46, { color: cinematicPalette.muted, size: 10, weight: 800 });
  drawLabel(
    context,
    snapshot.liftForce >= 0
      ? (english ? 'backspin lifts the path' : '下旋把轨迹向上托起')
      : (english ? 'topspin bends the path down' : '上旋把轨迹向下压弯'),
    43,
    68,
    { color: cinematicPalette.text, size: 13, weight: 700 },
  );
}

export type MagnusRenderOptions = {
  state: MagnusState;
  parameters: MagnusParameters;
  snapshot: MagnusSnapshot;
  showFlow: boolean;
  showReference: boolean;
  english: boolean;
};

export function drawMagnusScene(
  context: CanvasRenderingContext2D,
  options: MagnusRenderOptions,
): void {
  drawCinematicBackdrop(context, 'aerodynamics', options.state.elapsedSeconds);
  drawPerspectiveGrid(context, plot.bottom, 'rgba(54, 241, 205, 0.13)');
  drawGlowLine(context, { x: plot.left, y: plot.bottom }, { x: plot.right, y: plot.bottom }, cinematicPalette.teal, 1.4, 8);

  if (options.showReference) {
    drawFlightPath(context, options.state.referenceTrail, cinematicPalette.muted, true);
    drawLabel(context, options.english ? 'NO-SPIN PATH' : '无旋转轨迹', plot.right - 8, 106, {
      color: cinematicPalette.muted,
      align: 'right',
      size: 10,
      weight: 800,
    });
  }
  drawFlightPath(context, options.state.trail, cinematicPalette.cyan);

  const center = project(options.state.position);
  const ballRadius = 13 + options.parameters.ballDiameter * 0.28;
  if (options.showFlow) drawFlowField(context, center, ballRadius, options.snapshot, options.state.elapsedSeconds);
  drawSpinningBall(context, center, ballRadius, options.parameters, options.state.elapsedSeconds);
  drawForceVectors(context, center, options.state, options.snapshot, options.english);

  drawLabel(context, options.english ? 'HEIGHT' : '高度', plot.left, plot.top, { color: cinematicPalette.muted, size: 10, weight: 800 });
  drawLabel(context, options.english ? 'RANGE →' : '距离 →', plot.right, plot.bottom + 30, { color: cinematicPalette.muted, align: 'right', size: 10, weight: 800 });
  drawLabel(context, 'S = ωR/v', STAGE_WIDTH - 28, 38, { color: cinematicPalette.cyan, size: 14, align: 'right', weight: 800 });
  drawLabel(context, 'Fᴍ = ½ρv²ACₗ', STAGE_WIDTH - 28, STAGE_HEIGHT - 20, { color: cinematicPalette.amber, size: 13, align: 'right', weight: 800 });
}
