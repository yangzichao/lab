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
  type RgbColor,
} from '../shared/stage';
import type { Body, ThreeBodyMetrics, ThreeBodyState } from './three-body-physics';

const CENTER: Point = { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 };

// Normalised scene coordinates are ~unit-sized; scale them up to fill the canvas
// and translate to the centre. Velocities use the same factor so arrows read in
// the same visual units as positions.
const SCENE_SCALE = 165;
const velocityArrowScale = 70;
const maximumArrowLength = 130;

// One accent colour per body — the figure-eight is much easier to read when each
// mass owns a hue and leaves a matching fading trail.
const bodyColors: [string, string, string] = [palette.blue, palette.red, palette.violet];
const bodyTrailColors: [RgbColor, RgbColor, RgbColor] = [rgb.blue, rgb.red, rgb.violet];
const bodyLabels: [string, string, string] = ['1', '2', '3'];

export function bodyScreenPosition(body: Body): Point {
  return { x: CENTER.x + body.x * SCENE_SCALE, y: CENTER.y - body.y * SCENE_SCALE };
}

export type ThreeBodySceneOptions = {
  state: ThreeBodyState;
  trails: [Point[], Point[], Point[]];
  metrics: ThreeBodyMetrics;
  showTrails: boolean;
  showVectors: boolean;
  showCenterOfMass: boolean;
  diverged: boolean;
};

function clampVector(vector: Point, maxLength: number): Point {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= maxLength || length === 0) {
    return vector;
  }
  const scale = maxLength / length;
  return { x: vector.x * scale, y: vector.y * scale };
}

export function drawThreeBody(
  context: CanvasRenderingContext2D,
  options: ThreeBodySceneOptions,
): void {
  const { state, trails, metrics, showTrails, showVectors, showCenterOfMass, diverged } = options;
  clearStage(context);
  drawDotGrid(context);

  if (showTrails) {
    for (let index = 0; index < 3; index += 1) {
      drawFadingTrail(context, trails[index], bodyTrailColors[index], {
        width: 2.4,
        maxAlpha: 0.62,
        minAlpha: 0.03,
      });
    }
  }

  if (showCenterOfMass) {
    const comPoint: Point = {
      x: CENTER.x + metrics.centerOfMass.x * SCENE_SCALE,
      y: CENTER.y - metrics.centerOfMass.y * SCENE_SCALE,
    };
    drawDisc(context, comPoint, 3.5, { fill: palette.faint });
    drawLabel(context, 'centre of mass', comPoint.x + 8, comPoint.y - 8, {
      color: palette.faint,
      size: 11,
      weight: 600,
    });
  }

  for (let index = 0; index < 3; index += 1) {
    const body = state.bodies[index];
    const screen = bodyScreenPosition(body);

    if (showVectors) {
      const velocityTip = clampVector(
        { x: body.vx * velocityArrowScale, y: -body.vy * velocityArrowScale },
        maximumArrowLength,
      );
      drawArrow(
        context,
        screen,
        { x: screen.x + velocityTip.x, y: screen.y + velocityTip.y },
        { color: palette.teal, width: 2.4 },
      );
    }

    drawDisc(context, screen, 9, {
      fill: bodyColors[index],
      stroke: '#ffffff',
      strokeWidth: 2.5,
      glow: true,
    });
    drawLabel(context, bodyLabels[index], screen.x, screen.y - 16, {
      color: bodyColors[index],
      size: 12,
      weight: 700,
      align: 'center',
    });
  }

  drawLegend(context);

  if (diverged) {
    drawLabel(context, 'a body has escaped — resetting', STAGE_WIDTH / 2, 30, {
      color: palette.red,
      size: 13,
      weight: 700,
      align: 'center',
      background: true,
    });
  }
}

function drawLegend(context: CanvasRenderingContext2D): void {
  drawLabel(context, 'body 1', 24, STAGE_HEIGHT - 56, { color: palette.blue, size: 12, weight: 600 });
  drawLabel(context, 'body 2', 24, STAGE_HEIGHT - 38, { color: palette.red, size: 12, weight: 600 });
  drawLabel(context, 'body 3', 24, STAGE_HEIGHT - 20, { color: palette.violet, size: 12, weight: 600 });
}
