export type Vector2 = { x: number; y: number };

export type ThickLensParameters = {
  lensThickness: number;
  objectDepth: number;
  objectDistance: number;
  refractiveIndex: number;
  frontRadius: number;
  rearRadius: number;
};

export type RaySegment = {
  from: Vector2;
  to: Vector2;
  medium: 'air' | 'glass';
};

export type TracedRay = {
  segments: RaySegment[];
  surfaceNormals: Array<{ point: Vector2; normal: Vector2 }>;
  outgoingOrigin?: Vector2;
  outgoingDirection?: Vector2;
};

export type ObjectRayBundle = {
  source: Vector2;
  rays: TracedRay[];
  image?: Vector2;
};

export type ThickLensSolution = {
  nearBundle: ObjectRayBundle;
  farBundle: ObjectRayBundle;
  effectiveFocalLength: number;
  frontPrincipalPlane: number;
  rearPrincipalPlane: number;
  transmittedRayCount: number;
};

export function getThickLensAperture(parameters: ThickLensParameters): number {
  const frontCenter = parameters.frontRadius;
  const rearCenter = parameters.lensThickness + parameters.rearRadius;
  const frontRadius = Math.abs(parameters.frontRadius);
  const rearRadius = Math.abs(parameters.rearRadius);
  const maximum = Math.min(76, frontRadius * 0.92, rearRadius * 0.92);
  let lower = 0;
  let upper = maximum;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const height = (lower + upper) / 2;
    const frontX = frontCenter - Math.sqrt(Math.max(0, frontRadius ** 2 - height ** 2));
    const rearX = rearCenter + Math.sqrt(Math.max(0, rearRadius ** 2 - height ** 2));
    if (rearX - frontX >= 2) lower = height;
    else upper = height;
  }
  return Math.max(10, lower * 0.94);
}

function normalize(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function add(origin: Vector2, direction: Vector2, scale: number): Vector2 {
  return { x: origin.x + direction.x * scale, y: origin.y + direction.y * scale };
}

function intersectCircle(
  origin: Vector2,
  direction: Vector2,
  center: Vector2,
  radius: number,
): Vector2 | undefined {
  const offset = { x: origin.x - center.x, y: origin.y - center.y };
  const halfB = offset.x * direction.x + offset.y * direction.y;
  const c = offset.x * offset.x + offset.y * offset.y - radius * radius;
  const discriminant = halfB * halfB - c;
  if (discriminant < 0) return undefined;
  const root = Math.sqrt(discriminant);
  const candidates = [-halfB - root, -halfB + root].filter((distance) => distance > 1e-5);
  if (candidates.length === 0) return undefined;
  return add(origin, direction, Math.min(...candidates));
}

function refract(
  incident: Vector2,
  interfaceNormal: Vector2,
  incidentIndex: number,
  transmittedIndex: number,
): Vector2 | undefined {
  let normal = normalize(interfaceNormal);
  if (incident.x * normal.x + incident.y * normal.y < 0) {
    normal = { x: -normal.x, y: -normal.y };
  }
  const normalComponent = incident.x * normal.x + incident.y * normal.y;
  const tangent = {
    x: incident.x - normalComponent * normal.x,
    y: incident.y - normalComponent * normal.y,
  };
  const indexRatio = incidentIndex / transmittedIndex;
  const transmittedTangent = { x: tangent.x * indexRatio, y: tangent.y * indexRatio };
  const tangentSquared =
    transmittedTangent.x * transmittedTangent.x
    + transmittedTangent.y * transmittedTangent.y;
  if (tangentSquared > 1) return undefined;
  const transmittedNormal = Math.sqrt(Math.max(0, 1 - tangentSquared));
  return normalize({
    x: transmittedTangent.x + transmittedNormal * normal.x,
    y: transmittedTangent.y + transmittedNormal * normal.y,
  });
}

function traceRay(
  source: Vector2,
  frontTargetHeight: number,
  parameters: ThickLensParameters,
): TracedRay {
  const aperture = getThickLensAperture(parameters);
  const frontCenter = { x: parameters.frontRadius, y: 0 };
  const rearCenter = { x: parameters.lensThickness + parameters.rearRadius, y: 0 };
  const approximateTarget = { x: 0, y: frontTargetHeight };
  const incidentDirection = normalize({
    x: approximateTarget.x - source.x,
    y: approximateTarget.y - source.y,
  });
  const firstHit = intersectCircle(
    source,
    incidentDirection,
    frontCenter,
    Math.abs(parameters.frontRadius),
  );
  if (!firstHit || Math.abs(firstHit.y) > aperture) return { segments: [], surfaceNormals: [] };

  const firstRadial = normalize({ x: firstHit.x - frontCenter.x, y: firstHit.y });
  const glassDirection = refract(
    incidentDirection,
    { x: -firstRadial.x, y: -firstRadial.y },
    1,
    parameters.refractiveIndex,
  );
  if (!glassDirection) return { segments: [{ from: source, to: firstHit, medium: 'air' }], surfaceNormals: [] };

  const secondHit = intersectCircle(
    add(firstHit, glassDirection, 1e-3),
    glassDirection,
    rearCenter,
    Math.abs(parameters.rearRadius),
  );
  if (!secondHit || Math.abs(secondHit.y) > aperture) {
    return { segments: [{ from: source, to: firstHit, medium: 'air' }], surfaceNormals: [] };
  }
  const secondRadial = normalize({ x: secondHit.x - rearCenter.x, y: secondHit.y });
  const outgoingDirection = refract(
    glassDirection,
    secondRadial,
    parameters.refractiveIndex,
    1,
  );
  const segments: RaySegment[] = [
    { from: source, to: firstHit, medium: 'air' },
    { from: firstHit, to: secondHit, medium: 'glass' },
  ];
  if (outgoingDirection) {
    segments.push({ from: secondHit, to: add(secondHit, outgoingDirection, 440), medium: 'air' });
  }
  return {
    segments,
    surfaceNormals: [
      { point: firstHit, normal: { x: -firstRadial.x, y: -firstRadial.y } },
      { point: secondHit, normal: secondRadial },
    ],
    outgoingOrigin: outgoingDirection ? secondHit : undefined,
    outgoingDirection,
  };
}

function intersectOutgoingRays(first: TracedRay, second: TracedRay): Vector2 | undefined {
  if (!first.outgoingOrigin || !first.outgoingDirection || !second.outgoingOrigin || !second.outgoingDirection) return undefined;
  const cross = first.outgoingDirection.x * second.outgoingDirection.y - first.outgoingDirection.y * second.outgoingDirection.x;
  if (Math.abs(cross) < 1e-7) return undefined;
  const offset = {
    x: second.outgoingOrigin.x - first.outgoingOrigin.x,
    y: second.outgoingOrigin.y - first.outgoingOrigin.y,
  };
  const distance = (offset.x * second.outgoingDirection.y - offset.y * second.outgoingDirection.x) / cross;
  const point = add(first.outgoingOrigin, first.outgoingDirection, distance);
  return Number.isFinite(point.x) && Math.abs(point.x) < 2000 ? point : undefined;
}

function traceBundle(source: Vector2, parameters: ThickLensParameters): ObjectRayBundle {
  const aperture = getThickLensAperture(parameters);
  const rays = [-0.72, -0.24, 0.28, 0.74].map((fraction) =>
    traceRay(source, fraction * aperture, parameters)
  );
  const usable = rays.filter((ray) => ray.outgoingDirection);
  return {
    source,
    rays,
    image: usable.length >= 2 ? intersectOutgoingRays(usable[0], usable[usable.length - 1]) : undefined,
  };
}

function paraxialSummary(parameters: ThickLensParameters): {
  effectiveFocalLength: number;
  frontPrincipalPlane: number;
  rearPrincipalPlane: number;
} {
  const { refractiveIndex: n, frontRadius: r1, rearRadius: r2, lensThickness: thickness } = parameters;
  const power = (n - 1) * (1 / r1 - 1 / r2 + ((n - 1) * thickness) / (n * r1 * r2));
  const effectiveFocalLength = 1 / power;
  return {
    effectiveFocalLength,
    frontPrincipalPlane: (effectiveFocalLength * (n - 1) * thickness) / (n * r2),
    rearPrincipalPlane: thickness - (effectiveFocalLength * (n - 1) * thickness) / (n * r1),
  };
}

export function solveThickLens(parameters: ThickLensParameters): ThickLensSolution {
  const nearSource = { x: -parameters.objectDistance, y: 48 };
  const farSource = { x: -(parameters.objectDistance + parameters.objectDepth), y: 48 };
  const nearBundle = traceBundle(nearSource, parameters);
  const farBundle = traceBundle(farSource, parameters);
  const paraxial = paraxialSummary(parameters);
  return {
    nearBundle,
    farBundle,
    ...paraxial,
    transmittedRayCount: [...nearBundle.rays, ...farBundle.rays].filter((ray) => ray.outgoingDirection).length,
  };
}
