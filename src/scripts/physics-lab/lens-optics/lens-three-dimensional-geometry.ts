import { BufferGeometry, Float32BufferAttribute } from 'three';

const lensRadius = 150;
const radialSteps = 12;
const angularSteps = 64;

function halfThicknessAtRadius(radiusFraction: number, converging: boolean): number {
  const radiusSquared = radiusFraction * radiusFraction;
  return converging
    ? 7 + 18 * (1 - radiusSquared)
    : 6 + 17 * radiusSquared;
}

export function createLensThreeDimensionalGeometry(
  converging: boolean,
): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const verticesPerFace = (radialSteps + 1) * (angularSteps + 1);

  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const side = sideIndex === 0 ? -1 : 1;
    for (let radialIndex = 0; radialIndex <= radialSteps; radialIndex += 1) {
      const radiusFraction = radialIndex / radialSteps;
      const radius = radiusFraction * lensRadius;
      const x = side * halfThicknessAtRadius(radiusFraction, converging);
      for (let angularIndex = 0; angularIndex <= angularSteps; angularIndex += 1) {
        const angle = (angularIndex / angularSteps) * Math.PI * 2;
        positions.push(x, Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
    }
  }

  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const faceOffset = sideIndex * verticesPerFace;
    for (let radialIndex = 0; radialIndex < radialSteps; radialIndex += 1) {
      for (let angularIndex = 0; angularIndex < angularSteps; angularIndex += 1) {
        const current =
          faceOffset + radialIndex * (angularSteps + 1) + angularIndex;
        const nextRing = current + angularSteps + 1;
        if (sideIndex === 0) {
          indices.push(current, nextRing + 1, nextRing, current, current + 1, nextRing + 1);
        } else {
          indices.push(current, nextRing, nextRing + 1, current, nextRing + 1, current + 1);
        }
      }
    }
  }

  const negativeOuterRing = radialSteps * (angularSteps + 1);
  const positiveOuterRing = verticesPerFace + negativeOuterRing;
  for (let angularIndex = 0; angularIndex < angularSteps; angularIndex += 1) {
    const negativeCurrent = negativeOuterRing + angularIndex;
    const negativeNext = negativeCurrent + 1;
    const positiveCurrent = positiveOuterRing + angularIndex;
    const positiveNext = positiveCurrent + 1;
    indices.push(
      negativeCurrent,
      positiveCurrent,
      positiveNext,
      negativeCurrent,
      positiveNext,
      negativeNext,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
