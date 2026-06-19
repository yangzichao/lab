import {
  clearStage,
  drawArrow,
  drawDisc,
  drawFadingTrail,
  drawLabel,
  palette,
  rgb,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Point,
} from '../shared/stage';
import {
  fieldAt,
  nearestChargeIndex,
  potentialAt,
  type Charge,
} from './electric-field-physics';

// ---- Layer 1: potential heat map -------------------------------------------
// Sampled on a coarse grid into a small offscreen buffer, then stretched with
// bilinear smoothing over the stage. Warm (amber→red) is positive potential,
// cool (blue) is negative, near-zero fades to the surface colour.

const heatCell = 10; // stage pixels per sample cell
const heatColumns = Math.ceil(STAGE_WIDTH / heatCell);
const heatRows = Math.ceil(STAGE_HEIGHT / heatCell);

const surfaceColor: [number, number, number] = [245, 247, 243];

let heatCanvas: HTMLCanvasElement | null = null;
let heatContext: CanvasRenderingContext2D | null = null;

const ensureHeatBuffer = (): CanvasRenderingContext2D | null => {
  if (!heatContext) {
    heatCanvas = document.createElement('canvas');
    heatCanvas.width = heatColumns;
    heatCanvas.height = heatRows;
    heatContext = heatCanvas.getContext('2d');
  }
  return heatContext;
};

// Soft saturating map from a signed potential to a 0..1 colour amount.
const potentialToAmount = (potential: number): number => {
  const scaled = Math.abs(potential) / 90;
  return scaled / (1 + scaled);
};

const drawPotentialHeatMap = (
  context: CanvasRenderingContext2D,
  charges: Charge[],
): void => {
  const buffer = ensureHeatBuffer();
  if (!buffer || !heatCanvas) {
    return;
  }
  const image = buffer.createImageData(heatColumns, heatRows);
  for (let row = 0; row < heatRows; row += 1) {
    for (let column = 0; column < heatColumns; column += 1) {
      const point: Point = { x: column * heatCell, y: row * heatCell };
      const potential = potentialAt(point, charges);
      const amount = potentialToAmount(potential);
      const target: [number, number, number] =
        potential >= 0 ? [220, 38, 38] : [37, 99, 235];
      const offset = (row * heatColumns + column) * 4;
      image.data[offset] = surfaceColor[0] + (target[0] - surfaceColor[0]) * amount;
      image.data[offset + 1] = surfaceColor[1] + (target[1] - surfaceColor[1]) * amount;
      image.data[offset + 2] = surfaceColor[2] + (target[2] - surfaceColor[2]) * amount;
      image.data[offset + 3] = 255;
    }
  }
  buffer.putImageData(image, 0, 0);
  context.save();
  context.imageSmoothingEnabled = true;
  context.drawImage(heatCanvas, 0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  context.restore();
};

// ---- Layer 2: equipotential contours ---------------------------------------
// Marching squares over a coarse scalar grid, one pass per potential level.

const contourCell = 14;
const contourLevels = [-60, -36, -20, -10, 10, 20, 36, 60];

const interpolate = (a: number, b: number, level: number): number => {
  if (a === b) {
    return 0.5;
  }
  return (level - a) / (b - a);
};

const drawEquipotentials = (
  context: CanvasRenderingContext2D,
  charges: Charge[],
): void => {
  const columns = Math.ceil(STAGE_WIDTH / contourCell) + 1;
  const rows = Math.ceil(STAGE_HEIGHT / contourCell) + 1;
  const samples: number[] = new Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      samples[row * columns + column] = potentialAt(
        { x: column * contourCell, y: row * contourCell },
        charges,
      );
    }
  }

  context.save();
  context.strokeStyle = 'rgba(93, 104, 99, 0.45)';
  context.lineWidth = 1;
  context.beginPath();
  for (const level of contourLevels) {
    for (let row = 0; row < rows - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const topLeft = samples[row * columns + column];
        const topRight = samples[row * columns + column + 1];
        const bottomRight = samples[(row + 1) * columns + column + 1];
        const bottomLeft = samples[(row + 1) * columns + column];

        const code =
          (topLeft > level ? 1 : 0) |
          (topRight > level ? 2 : 0) |
          (bottomRight > level ? 4 : 0) |
          (bottomLeft > level ? 8 : 0);
        if (code === 0 || code === 15) {
          continue;
        }

        const x0 = column * contourCell;
        const y0 = row * contourCell;
        const top: Point = { x: x0 + contourCell * interpolate(topLeft, topRight, level), y: y0 };
        const right: Point = {
          x: x0 + contourCell,
          y: y0 + contourCell * interpolate(topRight, bottomRight, level),
        };
        const bottom: Point = {
          x: x0 + contourCell * interpolate(bottomLeft, bottomRight, level),
          y: y0 + contourCell,
        };
        const left: Point = { x: x0, y: y0 + contourCell * interpolate(topLeft, bottomLeft, level) };

        const segment = (from: Point, to: Point): void => {
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
        };

        switch (code) {
          case 1:
          case 14:
            segment(left, top);
            break;
          case 2:
          case 13:
            segment(top, right);
            break;
          case 3:
          case 12:
            segment(left, right);
            break;
          case 4:
          case 11:
            segment(bottom, right);
            break;
          case 6:
          case 9:
            segment(top, bottom);
            break;
          case 7:
          case 8:
            segment(left, bottom);
            break;
          case 5:
            segment(left, top);
            segment(bottom, right);
            break;
          case 10:
            segment(top, right);
            segment(left, bottom);
            break;
          default:
            break;
        }
      }
    }
  }
  context.stroke();
  context.restore();
};

// ---- Layer 3: field-line streamlines ----------------------------------------
// Seed a ring of points around each positive charge and integrate along E
// (RK2) until the line dives into a charge or leaves the stage. Negative-only
// scenes get nothing here, which is correct: lines have to start somewhere.

const seedsPerCharge = 14;
const stepLength = 4;
const maxStreamlineSteps = 900;
const arrowSpacing = 70;

const isInside = (point: Point): boolean =>
  point.x > 2 && point.x < STAGE_WIDTH - 2 && point.y > 2 && point.y < STAGE_HEIGHT - 2;

const drawStreamlines = (context: CanvasRenderingContext2D, charges: Charge[]): void => {
  context.save();
  context.strokeStyle = 'rgba(22, 32, 28, 0.55)';
  context.lineWidth = 1.3;

  for (const source of charges) {
    if (source.charge <= 0) {
      continue;
    }
    for (let seed = 0; seed < seedsPerCharge; seed += 1) {
      const angle = (seed / seedsPerCharge) * Math.PI * 2;
      let position: Point = {
        x: source.x + Math.cos(angle) * 11,
        y: source.y + Math.sin(angle) * 11,
      };
      const path: Point[] = [{ ...position }];

      for (let step = 0; step < maxStreamlineSteps; step += 1) {
        const field = fieldAt(position, charges);
        const magnitude = Math.hypot(field.x, field.y);
        if (magnitude < 1e-6) {
          break;
        }
        const half: Point = {
          x: position.x + (field.x / magnitude) * (stepLength / 2),
          y: position.y + (field.y / magnitude) * (stepLength / 2),
        };
        const midField = fieldAt(half, charges);
        const midMagnitude = Math.hypot(midField.x, midField.y);
        if (midMagnitude < 1e-6) {
          break;
        }
        position = {
          x: position.x + (midField.x / midMagnitude) * stepLength,
          y: position.y + (midField.y / midMagnitude) * stepLength,
        };

        if (!isInside(position)) {
          break;
        }
        path.push({ ...position });

        const nearest = nearestChargeIndex(position, charges);
        if (nearest.index >= 0 && charges[nearest.index].charge < 0 && nearest.distance < 12) {
          break;
        }
      }

      if (path.length < 2) {
        continue;
      }
      context.beginPath();
      context.moveTo(path[0].x, path[0].y);
      for (let index = 1; index < path.length; index += 1) {
        context.lineTo(path[index].x, path[index].y);
      }
      context.stroke();

      // Direction arrows partway along, pointing the way the field flows.
      let travelled = 0;
      let nextArrowAt = arrowSpacing;
      for (let index = 1; index < path.length; index += 1) {
        travelled += stepLength;
        if (travelled >= nextArrowAt) {
          drawArrow(context, path[index - 1], path[index], {
            color: 'rgba(22, 32, 28, 0.75)',
            width: 1.3,
            headSize: 7,
          });
          nextArrowAt += arrowSpacing;
        }
      }
    }
  }
  context.restore();
};

// ---- Charge markers ----------------------------------------------------------

const drawCharges = (context: CanvasRenderingContext2D, charges: Charge[]): void => {
  for (const charge of charges) {
    const positive = charge.charge >= 0;
    drawDisc(
      context,
      { x: charge.x, y: charge.y },
      15,
      { fill: positive ? palette.red : palette.blue, stroke: '#ffffff', strokeWidth: 3, glow: true },
    );
    drawLabel(context, positive ? '+' : '−', charge.x, charge.y, {
      color: '#ffffff',
      size: 18,
      weight: 800,
      align: 'center',
      baseline: 'middle',
    });
  }
};

// ---- Test charge + trail -----------------------------------------------------

const drawTestCharge = (
  context: CanvasRenderingContext2D,
  testCharge: Point | null,
  trail: Point[],
): void => {
  if (trail.length > 1) {
    drawFadingTrail(context, trail, rgb.teal, { width: 2.6, maxAlpha: 0.7 });
  }
  if (testCharge) {
    drawDisc(context, testCharge, 7, {
      fill: palette.teal,
      stroke: '#ffffff',
      strokeWidth: 2,
      glow: true,
    });
  }
};

const drawLegend = (context: CanvasRenderingContext2D): void => {
  drawLabel(context, '+ positive charge', 24, STAGE_HEIGHT - 56, {
    color: palette.red,
    size: 12,
    weight: 600,
  });
  drawLabel(context, '− negative charge', 24, STAGE_HEIGHT - 38, {
    color: palette.blue,
    size: 12,
    weight: 600,
  });
  drawLabel(context, '● test charge', 24, STAGE_HEIGHT - 20, {
    color: palette.teal,
    size: 12,
    weight: 600,
  });
};

export type StaticFieldLayerOptions = {
  charges: Charge[];
  showEquipotentials: boolean;
  showFieldLines: boolean;
};

// The static field layer depends only on the (resting) charge layout, so the
// lab caches it into an offscreen canvas and only repaints it when the layout
// or visible-layer toggles change — keeping the per-frame work to compositing.
export function renderStaticFieldLayer(
  context: CanvasRenderingContext2D,
  options: StaticFieldLayerOptions,
): void {
  const { charges, showEquipotentials, showFieldLines } = options;
  clearStage(context);
  drawPotentialHeatMap(context, charges);
  if (showEquipotentials) {
    drawEquipotentials(context, charges);
  }
  if (showFieldLines) {
    drawStreamlines(context, charges);
  }
  drawLegend(context);
}

// The dynamic layer is everything that moves between frames: the test charge
// with its fading trail, plus the charge markers drawn on top.
export function renderDynamicLayer(
  context: CanvasRenderingContext2D,
  testCharge: Point | null,
  trail: Point[],
  charges: Charge[],
): void {
  drawTestCharge(context, testCharge, trail);
  drawCharges(context, charges);
}
