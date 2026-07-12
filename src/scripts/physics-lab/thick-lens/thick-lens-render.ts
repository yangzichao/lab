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
import {
  getThickLensAperture,
  type ObjectRayBundle,
  type ThickLensParameters,
  type ThickLensSolution,
  type Vector2,
} from './thick-lens-physics';

const world = { left: -400, right: 430, top: 155, bottom: -155 };
function project(point: Vector2): Point {
  return {
    x: 34 + ((point.x - world.left) / (world.right - world.left)) * (STAGE_WIDTH - 68),
    y: 36 + ((world.top - point.y) / (world.top - world.bottom)) * (STAGE_HEIGHT - 72),
  };
}

function surfaceX(center: number, radius: number, y: number, front: boolean): number {
  const span = Math.sqrt(Math.max(0, radius * radius - y * y));
  return front ? center - span : center + span;
}

function drawLens(context: CanvasRenderingContext2D, parameters: ThickLensParameters): void {
  const samples = 50;
  const thickLensAperture = getThickLensAperture(parameters);
  const frontCenter = parameters.frontRadius;
  const rearCenter = parameters.lensThickness + parameters.rearRadius;
  context.save();
  context.beginPath();
  for (let index = 0; index <= samples; index += 1) {
    const y = -thickLensAperture + (index / samples) * thickLensAperture * 2;
    const point = project({ x: surfaceX(frontCenter, Math.abs(parameters.frontRadius), y, true), y });
    if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
  }
  for (let index = samples; index >= 0; index -= 1) {
    const y = -thickLensAperture + (index / samples) * thickLensAperture * 2;
    const point = project({ x: surfaceX(rearCenter, Math.abs(parameters.rearRadius), y, false), y });
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fillStyle = 'rgba(37, 99, 235, 0.12)';
  context.strokeStyle = palette.blue;
  context.lineWidth = 2.5;
  context.fill();
  context.stroke();
  context.restore();
}

function drawObject(context: CanvasRenderingContext2D, bundle: ObjectRayBundle, color: string, label: string): void {
  const base = project({ x: bundle.source.x, y: 0 });
  const tip = project(bundle.source);
  drawArrow(context, base, tip, { color, width: 4, headSize: 11 });
  drawLabel(context, label, tip.x, tip.y - 14, { color, size: 11, align: 'center', background: true });
}

function drawBundle(context: CanvasRenderingContext2D, bundle: ObjectRayBundle, color: string, showNormals: boolean): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1.7;
  context.globalAlpha = 0.72;
  for (const ray of bundle.rays) {
    for (const segment of ray.segments) {
      const from = project(segment.from);
      const to = project(segment.to);
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
    if (showNormals) {
      for (const { point, normal } of ray.surfaceNormals) {
        const center = project(point);
        const end = project({ x: point.x + normal.x * 22, y: point.y + normal.y * 22 });
        drawDashedLine(context, center, end, palette.faint, [3, 4]);
      }
    }
  }
  context.restore();
  if (bundle.image && bundle.image.x < world.right) {
    const base = project({ x: bundle.image.x, y: 0 });
    const tip = project(bundle.image);
    drawArrow(context, base, tip, { color, width: 3, headSize: 9 });
  }
}

export function drawThickLensScene(
  context: CanvasRenderingContext2D,
  parameters: ThickLensParameters,
  solution: ThickLensSolution,
  options: { showNormals: boolean; showParaxial: boolean; english: boolean },
): void {
  clearStage(context);
  drawDotGrid(context);
  const axisStart = project({ x: world.left, y: 0 });
  const axisEnd = project({ x: world.right, y: 0 });
  drawDashedLine(context, axisStart, axisEnd, palette.gridStrong, [6, 7]);
  drawLens(context, parameters);
  drawBundle(context, solution.farBundle, palette.amber, options.showNormals);
  drawBundle(context, solution.nearBundle, palette.teal, options.showNormals);
  drawObject(context, solution.farBundle, palette.amber, options.english ? 'far face' : '远端面');
  drawObject(context, solution.nearBundle, palette.teal, options.english ? 'near face' : '近端面');

  if (options.showParaxial) {
    for (const [position, label] of [[solution.frontPrincipalPlane, 'H'], [solution.rearPrincipalPlane, "H'"]] as const) {
      const top = project({ x: position, y: 92 });
      const bottom = project({ x: position, y: -92 });
      drawDashedLine(context, top, bottom, palette.violet, [4, 5]);
      drawLabel(context, label, top.x, top.y - 7, { color: palette.violet, align: 'center', weight: 800 });
    }
  }
  drawLabel(context, options.english ? 'Snell refraction at both spherical interfaces' : '每条光线在两个球面分别执行 Snell 折射', 28, STAGE_HEIGHT - 20, { color: palette.ink, size: 13, weight: 700 });
  drawLabel(context, 'n₁ sin θ₁ = n₂ sin θ₂', STAGE_WIDTH - 28, STAGE_HEIGHT - 20, { color: palette.blue, size: 13, weight: 700, align: 'right' });
}
