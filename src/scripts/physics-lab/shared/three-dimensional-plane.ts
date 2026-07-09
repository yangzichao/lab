import { Vector3 } from 'three';
import { STAGE_HEIGHT, STAGE_WIDTH, type Point } from './stage';

export type ThreeDimensionalPlaneSize = {
  width: number;
  depth: number;
};

export function stagePointToThreeDimensionalPlane(
  point: Point,
  plane: ThreeDimensionalPlaneSize,
  height = 0,
): Vector3 {
  return new Vector3(
    (point.x / STAGE_WIDTH - 0.5) * plane.width,
    height,
    (point.y / STAGE_HEIGHT - 0.5) * plane.depth,
  );
}

export function threeDimensionalPlaneToStagePoint(
  position: Vector3,
  plane: ThreeDimensionalPlaneSize,
): Point {
  return {
    x: (position.x / plane.width + 0.5) * STAGE_WIDTH,
    y: (position.z / plane.depth + 0.5) * STAGE_HEIGHT,
  };
}
