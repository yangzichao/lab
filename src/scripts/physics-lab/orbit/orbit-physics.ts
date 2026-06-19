// Central-force (inverse-square) orbital mechanics. Positions and velocities
// live in scene units relative to the star at the origin; the renderer offsets
// them to the canvas centre. Integrated with velocity-Verlet, which keeps the
// orbit closed instead of slowly spiralling the way naive Euler would.

export type OrbitState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type OrbitMetrics = {
  radius: number;
  speed: number;
  energy: number;
  angularMomentum: number;
  eccentricity: number;
  semiMajor: number;
  semiMinor: number;
  periapsis: number;
  apoapsis: number;
  periapsisAngle: number;
  bound: boolean;
  classification: 'Ellipse' | 'Circle' | 'Parabola' | 'Hyperbola';
};

export const BASE_MU = 9300;
export const ORBIT_TIME_SCALE = 10;

export function createOrbitState(
  mu: number,
  launchRadius: number,
  speedFactor: number,
  launchAngleDegrees: number,
): OrbitState {
  const circularSpeed = Math.sqrt(mu / launchRadius);
  const launchSpeed = circularSpeed * speedFactor;
  const launchAngle = (launchAngleDegrees * Math.PI) / 180;
  return {
    x: launchRadius,
    y: 0,
    vx: launchSpeed * Math.cos(launchAngle),
    vy: launchSpeed * Math.sin(launchAngle),
  };
}

export function gravityAcceleration(state: OrbitState, mu: number): { x: number; y: number } {
  const radiusSquared = Math.max(state.x * state.x + state.y * state.y, 16 * 16);
  const radius = Math.sqrt(radiusSquared);
  const scale = -mu / (radiusSquared * radius);
  return { x: scale * state.x, y: scale * state.y };
}

export function integrateOrbit(state: OrbitState, mu: number, deltaSeconds: number): void {
  let remaining = deltaSeconds * ORBIT_TIME_SCALE;
  while (remaining > 0) {
    const step = Math.min(remaining, 0.032);
    const a1 = gravityAcceleration(state, mu);
    state.vx += a1.x * step * 0.5;
    state.vy += a1.y * step * 0.5;
    state.x += state.vx * step;
    state.y += state.vy * step;
    const a2 = gravityAcceleration(state, mu);
    state.vx += a2.x * step * 0.5;
    state.vy += a2.y * step * 0.5;
    remaining -= step;
  }
}

export function orbitMetrics(state: OrbitState, mu: number): OrbitMetrics {
  const radius = Math.hypot(state.x, state.y);
  const speed = Math.hypot(state.vx, state.vy);
  const energy = 0.5 * speed * speed - mu / radius;
  const angularMomentum = state.x * state.vy - state.y * state.vx;

  // Eccentricity vector: e = ((v·v - mu/r) r - (r·v) v) / mu.
  const radialVelocity = state.x * state.vx + state.y * state.vy;
  const factor = speed * speed - mu / radius;
  const eccentricityX = (factor * state.x - radialVelocity * state.vx) / mu;
  const eccentricityY = (factor * state.y - radialVelocity * state.vy) / mu;
  const eccentricity = Math.hypot(eccentricityX, eccentricityY);
  const periapsisAngle = Math.atan2(eccentricityY, eccentricityX);

  const bound = energy < -1e-3 && eccentricity < 1;
  const semiMajor = bound ? -mu / (2 * energy) : Math.abs(mu / (2 * energy));
  const semiMinor = bound ? semiMajor * Math.sqrt(Math.max(0, 1 - eccentricity * eccentricity)) : 0;
  const periapsis = semiMajor * (1 - eccentricity);
  const apoapsis = bound ? semiMajor * (1 + eccentricity) : Number.POSITIVE_INFINITY;

  return {
    radius,
    speed,
    energy,
    angularMomentum,
    eccentricity,
    semiMajor,
    semiMinor,
    periapsis,
    apoapsis,
    periapsisAngle,
    bound,
    classification: classify(energy, eccentricity),
  };
}

function classify(
  energy: number,
  eccentricity: number,
): 'Ellipse' | 'Circle' | 'Parabola' | 'Hyperbola' {
  if (energy > 1e-2) {
    return 'Hyperbola';
  }
  if (Math.abs(energy) <= 1e-2) {
    return 'Parabola';
  }
  if (eccentricity < 0.04) {
    return 'Circle';
  }
  return 'Ellipse';
}
