import {
  BufferGeometry,
  Color,
  Vector3,
  type BufferAttribute,
  type PlaneGeometry,
} from 'three';
import {
  stagePointToThreeDimensionalPlane,
  threeDimensionalPlaneToStagePoint,
  type ThreeDimensionalPlaneSize,
} from '../shared/three-dimensional-plane';
import type { Point } from '../shared/stage';
import {
  fieldAt,
  nearestChargeIndex,
  potentialAt,
  type Charge,
} from './electric-field-physics';

export const electricFieldPlane: ThreeDimensionalPlaneSize = { width: 700, depth: 430 };

const potentialContourLevels = [-80, -45, -24, -12, 12, 24, 45, 80];
const positivePotentialColor = new Color(0xff6178);
const negativePotentialColor = new Color(0x4f8dff);
const neutralPotentialColor = new Color(0x16384d);

export function electricPotentialHeight(potential: number): number {
  return Math.tanh(potential / 72) * 92;
}

export function isInsideElectricFieldStage(point: Point): boolean {
  return point.x > 2 && point.x < 898 && point.y > 2 && point.y < 558;
}

export function updateElectricPotentialSurface(
  geometry: PlaneGeometry,
  baseCoordinates: Array<{ x: number; z: number }>,
  charges: Charge[],
): void {
  const positions = geometry.attributes.position as BufferAttribute;
  const colors = geometry.attributes.color as BufferAttribute;
  const color = new Color();

  for (let index = 0; index < positions.count; index += 1) {
    const base = baseCoordinates[index];
    const point = threeDimensionalPlaneToStagePoint(
      new Vector3(base.x, 0, base.z),
      electricFieldPlane,
    );
    const potential = potentialAt(point, charges);
    const height = electricPotentialHeight(potential);
    positions.setY(index, height);
    color.lerpColors(
      neutralPotentialColor,
      potential >= 0 ? positivePotentialColor : negativePotentialColor,
      Math.min(Math.abs(height) / 92, 1),
    );
    colors.setXYZ(index, color.r, color.g, color.b);
  }
  positions.needsUpdate = true;
  colors.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function createElectricEquipotentialGeometry(
  charges: Charge[],
  columns: number,
  rows: number,
): BufferGeometry {
  const samples = new Array<number>((columns + 1) * (rows + 1));
  const sample = (column: number, row: number): number => samples[row * (columns + 1) + column];
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      samples[row * (columns + 1) + column] = potentialAt(
        { x: (column / columns) * 900, y: (row / rows) * 560 },
        charges,
      );
    }
  }

  const segmentPoints: Vector3[] = [];
  const interpolate = (first: number, second: number, level: number): number =>
    first === second ? 0.5 : (level - first) / (second - first);
  const addSegment = (first: Point, second: Point, level: number): void => {
    segmentPoints.push(
      stagePointToThreeDimensionalPlane(
        first,
        electricFieldPlane,
        electricPotentialHeight(level) + 2.6,
      ),
      stagePointToThreeDimensionalPlane(
        second,
        electricFieldPlane,
        electricPotentialHeight(level) + 2.6,
      ),
    );
  };

  for (const level of potentialContourLevels) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const topLeft = sample(column, row);
        const topRight = sample(column + 1, row);
        const bottomRight = sample(column + 1, row + 1);
        const bottomLeft = sample(column, row + 1);
        const code =
          (topLeft > level ? 1 : 0) |
          (topRight > level ? 2 : 0) |
          (bottomRight > level ? 4 : 0) |
          (bottomLeft > level ? 8 : 0);
        if (code === 0 || code === 15) {
          continue;
        }

        const leftX = (column / columns) * 900;
        const topY = (row / rows) * 560;
        const cellWidth = 900 / columns;
        const cellHeight = 560 / rows;
        const top: Point = {
          x: leftX + cellWidth * interpolate(topLeft, topRight, level),
          y: topY,
        };
        const right: Point = {
          x: leftX + cellWidth,
          y: topY + cellHeight * interpolate(topRight, bottomRight, level),
        };
        const bottom: Point = {
          x: leftX + cellWidth * interpolate(bottomLeft, bottomRight, level),
          y: topY + cellHeight,
        };
        const left: Point = {
          x: leftX,
          y: topY + cellHeight * interpolate(topLeft, bottomLeft, level),
        };
        const segmentsByCase: Record<number, [Point, Point][]> = {
          1: [[left, top]], 2: [[top, right]], 3: [[left, right]],
          4: [[bottom, right]], 5: [[left, top], [bottom, right]],
          6: [[top, bottom]], 7: [[left, bottom]], 8: [[left, bottom]],
          9: [[top, bottom]], 10: [[top, right], [left, bottom]],
          11: [[bottom, right]], 12: [[left, right]], 13: [[top, right]],
          14: [[left, top]],
        };
        for (const [first, second] of segmentsByCase[code] ?? []) {
          addSegment(first, second, level);
        }
      }
    }
  }
  return new BufferGeometry().setFromPoints(segmentPoints);
}

export function createElectricFieldLineGeometry(charges: Charge[]): BufferGeometry {
  const lineSegments: Vector3[] = [];
  for (const source of charges) {
    if (source.charge <= 0) {
      continue;
    }
    for (let seedIndex = 0; seedIndex < 14; seedIndex += 1) {
      const angle = (seedIndex / 14) * Math.PI * 2;
      let position: Point = {
        x: source.x + Math.cos(angle) * 12,
        y: source.y + Math.sin(angle) * 12,
      };
      for (let stepIndex = 0; stepIndex < 420; stepIndex += 1) {
        const field = fieldAt(position, charges);
        const magnitude = Math.hypot(field.x, field.y);
        if (magnitude < 1e-6) {
          break;
        }
        const next: Point = {
          x: position.x + (field.x / magnitude) * 5,
          y: position.y + (field.y / magnitude) * 5,
        };
        if (!isInsideElectricFieldStage(next)) {
          break;
        }
        lineSegments.push(
          stagePointToThreeDimensionalPlane(
            position,
            electricFieldPlane,
            electricPotentialHeight(potentialAt(position, charges)) + 4.2,
          ),
          stagePointToThreeDimensionalPlane(
            next,
            electricFieldPlane,
            electricPotentialHeight(potentialAt(next, charges)) + 4.2,
          ),
        );
        position = next;
        const nearest = nearestChargeIndex(position, charges);
        if (
          nearest.index >= 0 &&
          charges[nearest.index].charge < 0 &&
          nearest.distance < 13
        ) {
          break;
        }
      }
    }
  }
  return new BufferGeometry().setFromPoints(lineSegments);
}
