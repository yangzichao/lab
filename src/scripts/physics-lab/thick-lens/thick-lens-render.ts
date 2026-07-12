import {
  cinematicPalette,
  drawCinematicBackdrop,
  drawGlowDisc,
  drawGlowLine,
  drawHudPanel,
} from '../shared/cinematic-stage';
import { drawArrow, drawDashedLine, drawLabel, STAGE_HEIGHT, STAGE_WIDTH, type Point } from '../shared/stage';
import {
  getThickLensAperture,
  type ObjectRayBundle,
  type RaySegment,
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
  const samples = 64;
  const aperture = getThickLensAperture(parameters);
  const frontCenter = parameters.frontRadius;
  const rearCenter = parameters.lensThickness + parameters.rearRadius;
  const outline: Point[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const y = -aperture + (index / samples) * aperture * 2;
    outline.push(project({ x: surfaceX(frontCenter, Math.abs(parameters.frontRadius), y, true), y }));
  }
  for (let index = samples; index >= 0; index -= 1) {
    const y = -aperture + (index / samples) * aperture * 2;
    outline.push(project({ x: surfaceX(rearCenter, Math.abs(parameters.rearRadius), y, false), y }));
  }

  const bounds = outline.reduce((result, point) => ({
    left: Math.min(result.left, point.x),
    right: Math.max(result.right, point.x),
    top: Math.min(result.top, point.y),
    bottom: Math.max(result.bottom, point.y),
  }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  const glass = context.createLinearGradient(bounds.left, 0, bounds.right, 0);
  glass.addColorStop(0, 'rgba(75, 160, 255, 0.18)');
  glass.addColorStop(0.42, 'rgba(190, 245, 255, 0.34)');
  glass.addColorStop(0.58, 'rgba(255, 255, 255, 0.42)');
  glass.addColorStop(1, 'rgba(44, 125, 230, 0.16)');
  context.save();
  context.beginPath();
  outline.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.closePath();
  context.fillStyle = glass;
  context.shadowColor = cinematicPalette.cyan;
  context.shadowBlur = 28;
  context.fill();
  context.strokeStyle = 'rgba(130, 228, 255, 0.9)';
  context.lineWidth = 2;
  context.stroke();
  context.clip();
  for (let x = bounds.left - 80; x < bounds.right + 80; x += 17) {
    context.strokeStyle = 'rgba(220, 250, 255, 0.08)';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(x, bounds.bottom + 30);
    context.lineTo(x + 75, bounds.top - 30);
    context.stroke();
  }
  context.restore();
}

function drawObjectVolume(
  context: CanvasRenderingContext2D,
  solution: ThickLensSolution,
  english: boolean,
): void {
  const farBase = project({ x: solution.farBundle.source.x, y: 0 });
  const nearBase = project({ x: solution.nearBundle.source.x, y: 0 });
  const farTip = project(solution.farBundle.source);
  const nearTip = project(solution.nearBundle.source);
  const volume = context.createLinearGradient(farBase.x, 0, nearBase.x, 0);
  volume.addColorStop(0, 'rgba(255, 189, 74, 0.24)');
  volume.addColorStop(1, 'rgba(54, 241, 205, 0.24)');
  context.fillStyle = volume;
  context.fillRect(farBase.x, farTip.y, Math.max(2, nearBase.x - farBase.x), farBase.y - farTip.y);
  drawArrow(context, farBase, farTip, { color: cinematicPalette.amber, width: 3.2, headSize: 10 });
  drawArrow(context, nearBase, nearTip, { color: cinematicPalette.teal, width: 3.2, headSize: 10 });
  drawLabel(context, english ? 'FAR FACE' : '远端面', farTip.x, farTip.y - 12, { color: cinematicPalette.amber, size: 9, align: 'center', weight: 800 });
  drawLabel(context, english ? 'NEAR FACE' : '近端面', nearTip.x, nearTip.y - 12, { color: cinematicPalette.teal, size: 9, align: 'center', weight: 800 });
}

function rayPolyline(segments: RaySegment[]): Point[] {
  if (segments.length === 0) return [];
  return [project(segments[0].from), ...segments.map((segment) => project(segment.to))];
}

function pointAlongPolyline(points: Point[], progress: number): Point | undefined {
  if (points.length < 2) return undefined;
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let target = progress * total;
  for (let index = 0; index < lengths.length; index += 1) {
    if (target <= lengths[index]) {
      const ratio = target / Math.max(0.001, lengths[index]);
      return {
        x: points[index].x + (points[index + 1].x - points[index].x) * ratio,
        y: points[index].y + (points[index + 1].y - points[index].y) * ratio,
      };
    }
    target -= lengths[index];
  }
  return points[points.length - 1];
}

function drawBundle(
  context: CanvasRenderingContext2D,
  bundle: ObjectRayBundle,
  color: string,
  showNormals: boolean,
  phase: number,
): void {
  bundle.rays.forEach((ray, rayIndex) => {
    ray.segments.forEach((segment) => {
      const from = project(segment.from);
      const to = project(segment.to);
      const segmentColor = segment.medium === 'glass' ? '#f5fbff' : color;
      context.save();
      context.globalAlpha = segment.medium === 'glass' ? 0.9 : 0.54;
      drawGlowLine(context, from, to, segmentColor, segment.medium === 'glass' ? 2.1 : 1.35, 10);
      context.restore();
    });
    const points = rayPolyline(ray.segments);
    const packet = pointAlongPolyline(points, (phase * 0.32 + rayIndex * 0.19) % 1);
    if (packet) drawGlowDisc(context, packet, 2.4, color);

    if (showNormals) {
      ray.surfaceNormals.forEach(({ point, normal }) => {
        const center = project(point);
        const from = project({ x: point.x - normal.x * 18, y: point.y - normal.y * 18 });
        const to = project({ x: point.x + normal.x * 18, y: point.y + normal.y * 18 });
        drawDashedLine(context, from, to, 'rgba(155, 177, 197, 0.44)', [3, 4]);
        drawGlowDisc(context, center, 1.6, cinematicPalette.cyan);
      });
    }
  });

  if (bundle.image && bundle.image.x < world.right && bundle.image.x > world.left) {
    const base = project({ x: bundle.image.x, y: 0 });
    const tip = project(bundle.image);
    const caustic = context.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 34);
    caustic.addColorStop(0, color);
    caustic.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.save();
    context.globalAlpha = 0.28;
    context.fillStyle = caustic;
    context.fillRect(tip.x - 34, tip.y - 34, 68, 68);
    context.restore();
    drawArrow(context, base, tip, { color, width: 2.7, headSize: 8 });
  }
}

export function drawThickLensScene(
  context: CanvasRenderingContext2D,
  parameters: ThickLensParameters,
  solution: ThickLensSolution,
  options: { showNormals: boolean; showParaxial: boolean; english: boolean; phase: number },
): void {
  drawCinematicBackdrop(context, 'optics', options.phase);
  const axisStart = project({ x: world.left, y: 0 });
  const axisEnd = project({ x: world.right, y: 0 });
  drawGlowLine(context, axisStart, axisEnd, 'rgba(91, 140, 255, 0.38)', 1, 5);
  drawObjectVolume(context, solution, options.english);
  drawLens(context, parameters);
  drawBundle(context, solution.farBundle, cinematicPalette.amber, options.showNormals, options.phase);
  drawBundle(context, solution.nearBundle, cinematicPalette.teal, options.showNormals, options.phase + 0.37);

  if (options.showParaxial) {
    for (const [position, label] of [[solution.frontPrincipalPlane, 'H'], [solution.rearPrincipalPlane, "H′"]] as const) {
      const top = project({ x: position, y: 92 });
      const bottom = project({ x: position, y: -92 });
      drawDashedLine(context, top, bottom, cinematicPalette.violet, [4, 5]);
      drawLabel(context, label, top.x, top.y - 7, { color: cinematicPalette.violet, align: 'center', weight: 800 });
    }
  }

  drawHudPanel(context, 24, 20, 310, 52);
  drawLabel(context, options.english ? 'EXACT TWO-SURFACE RAY TRACE' : '精确双界面光线追迹', 40, 41, { color: cinematicPalette.muted, size: 9, weight: 800 });
  drawLabel(context, options.english ? 'moving packets reveal both refractions' : '移动光包揭示两次折射', 40, 61, { color: cinematicPalette.text, size: 12, weight: 700 });
  drawLabel(context, 'n₁ sin θ₁ = n₂ sin θ₂', STAGE_WIDTH - 28, 38, { color: cinematicPalette.cyan, size: 14, weight: 800, align: 'right' });
  drawLabel(context, options.english ? 'object space' : '物方', 34, STAGE_HEIGHT - 20, { color: cinematicPalette.muted, size: 10, weight: 800 });
  drawLabel(context, options.english ? 'image space' : '像方', STAGE_WIDTH - 34, STAGE_HEIGHT - 20, { color: cinematicPalette.muted, size: 10, weight: 800, align: 'right' });
}
