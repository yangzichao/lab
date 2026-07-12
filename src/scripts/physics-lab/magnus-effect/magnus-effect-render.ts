import {
  clearStage,
  drawArrow,
  drawDashedLine,
  drawDotGrid,
  drawLabel,
  palette,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Point,
} from '../shared/stage';
import type {
  MagnusParameters,
  MagnusSnapshot,
  MagnusState,
} from './magnus-effect-physics';

const plot = { left: 70, right: 850, top: 48, bottom: 482 };

function project(point: Point): Point {
  return {
    x: plot.left + (point.x / 50) * (plot.right - plot.left),
    y: plot.bottom - (point.y / 18) * (plot.bottom - plot.top),
  };
}

function drawTrajectory(
  context: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  dashed = false,
): void {
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = dashed ? 1.5 : 3;
  context.setLineDash(dashed ? [7, 7] : []);
  context.beginPath();
  points.forEach((point, index) => {
    const projected = project(point);
    if (index === 0) context.moveTo(projected.x, projected.y);
    else context.lineTo(projected.x, projected.y);
  });
  context.stroke();
  context.restore();
}

function drawAirflow(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  snapshot: MagnusSnapshot,
): void {
  const spinDirection = Math.sign(snapshot.spinRatio) || 1;
  const highSpeedY = spinDirection > 0 ? center.y - radius : center.y + radius;
  const lowSpeedY = spinDirection > 0 ? center.y + radius : center.y - radius;

  context.save();
  context.globalAlpha = 0.16;
  context.fillStyle = palette.blue;
  context.beginPath();
  context.arc(center.x, highSpeedY, radius * 1.45, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = palette.red;
  context.beginPath();
  context.arc(center.x, lowSpeedY, radius * 1.45, 0, Math.PI * 2);
  context.fill();
  context.restore();

  for (const offset of [-2.2, -1.3, 1.3, 2.2]) {
    const y = center.y + offset * radius;
    drawArrow(context, { x: center.x + radius * 3.2, y }, { x: center.x - radius * 3.2, y }, {
      color: palette.blue,
      width: Math.abs(offset) < 2 ? 2.2 : 1.4,
      headSize: 8,
    });
  }
  drawLabel(context, 'fast / low p', center.x, highSpeedY - radius * 1.7, {
    color: palette.blue,
    size: 11,
    align: 'center',
    background: true,
  });
  drawLabel(context, 'slow / high p', center.x, lowSpeedY + radius * 1.9, {
    color: palette.red,
    size: 11,
    align: 'center',
    background: true,
  });
}

function drawBall(
  context: CanvasRenderingContext2D,
  center: Point,
  parameters: MagnusParameters,
  snapshot: MagnusSnapshot,
  showFlow: boolean,
): void {
  const radius = 13 + parameters.ballDiameter * 0.28;
  if (showFlow) drawAirflow(context, center, radius, snapshot);

  const gradient = context.createRadialGradient(center.x - 5, center.y - 6, 2, center.x, center.y, radius);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, '#cbd5cf');
  context.fillStyle = gradient;
  context.strokeStyle = palette.ink;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  const rotation = snapshot.spinRatio * 8;
  context.strokeStyle = palette.ink;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(center.x, center.y, radius * 0.62, rotation, rotation + Math.PI * 1.25);
  context.stroke();
  drawArrow(context, { x: center.x + radius + 8, y: center.y + 18 * Math.sign(snapshot.liftForce || 1) }, { x: center.x + radius + 8, y: center.y - 52 * Math.sign(snapshot.liftForce || 1) }, { color: palette.amber, width: 3, headSize: 10 });
  drawLabel(context, 'Fᴍ', center.x + radius + 15, center.y - 58 * Math.sign(snapshot.liftForce || 1), { color: palette.amber, size: 12, weight: 800 });
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
  clearStage(context);
  drawDotGrid(context);
  context.strokeStyle = palette.gridStrong;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(plot.left, plot.bottom);
  context.lineTo(plot.right, plot.bottom);
  context.stroke();

  if (options.showReference) {
    drawTrajectory(context, options.state.referenceTrail, palette.faint, true);
    drawLabel(context, options.english ? 'no-spin reference' : '无旋转参考', plot.right - 8, plot.top + 18, { color: palette.faint, align: 'right', size: 11 });
  }
  drawTrajectory(context, options.state.trail, palette.teal);
  drawBall(context, project(options.state.position), options.parameters, options.snapshot, options.showFlow);

  drawDashedLine(context, { x: plot.left, y: plot.top }, { x: plot.left, y: plot.bottom }, palette.gridStrong, [3, 7]);
  drawLabel(context, options.english ? 'height' : '高度', plot.left - 12, plot.top, { color: palette.muted, align: 'right', size: 11 });
  drawLabel(context, options.english ? 'range →' : '距离 →', plot.right, plot.bottom + 28, { color: palette.muted, align: 'right', size: 11 });
  drawLabel(context, options.snapshot.liftForce >= 0 ? (options.english ? 'backspin: lift upward' : '下旋：升力向上') : (options.english ? 'topspin: force downward' : '上旋：力向下'), 28, STAGE_HEIGHT - 22, { color: palette.ink, size: 13, weight: 700 });
  drawLabel(context, '½ρv²ACₗ', STAGE_WIDTH - 28, STAGE_HEIGHT - 22, { color: palette.amber, size: 13, align: 'right', weight: 700 });
}
