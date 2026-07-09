// Kinetic theory of an ideal gas in three dimensions. Equal-mass hard spheres
// rattle around inside a unit box, bouncing elastically off its walls and one
// another. There are no forces or potential energy: temperature and pressure
// emerge from the particles' velocity distribution and wall collisions.

export type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

export type GasState = {
  particles: Particle[];
  // Momentum delivered to the walls during the most recent advance() call,
  // summed over every wall bounce. The lab smooths this into a pressure reading.
  wallImpulse: number;
  // Seconds of simulated time spent in the most recent advance() call, so the
  // lab can turn accumulated impulse into impulse-per-unit-time (force).
  elapsedSeconds: number;
};

export const BOX_WIDTH = 1;
export const BOX_HEIGHT = 1;
export const BOX_DEPTH = 1;
export const PARTICLE_MASS = 1;
export const PARTICLE_RADIUS = 0.012;
export const BOLTZMANN_CONSTANT = 1;

// How far to advance per fixed sub-step. Many small steps keep fast particles
// from tunnelling through each other or the walls between collision checks.
const SUB_STEP_SECONDS = 1 / 480;
// Cap the work per frame so a long-paused tab does not stall on resume.
const MAX_SUB_STEPS_PER_ADVANCE = 12;
// Treat the simulation speed in "box units of time" per real second.
const TIME_SCALE = 0.9;
const SPEED_AXIS_FACTOR = 3.4;

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
}

// Lay particles on a jittered 3D grid so none start overlapping, then assign
// isotropic velocity directions. The exact arrangement washes out quickly.
export function createGasState(particleCount: number, targetTemperature: number): GasState {
  const columns = Math.ceil(Math.cbrt(particleCount));
  const rows = columns;
  const layers = Math.ceil(particleCount / (columns * rows));
  const margin = PARTICLE_RADIUS * 2.4;
  const cellWidth = (BOX_WIDTH - margin * 2) / columns;
  const cellHeight = (BOX_HEIGHT - margin * 2) / rows;
  const cellDepth = (BOX_DEPTH - margin * 2) / layers;
  const speedScale = Math.sqrt((3 * BOLTZMANN_CONSTANT * targetTemperature) / PARTICLE_MASS);

  const particles: Particle[] = [];
  for (let index = 0; index < particleCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns) % rows;
    const layer = Math.floor(index / (columns * rows));
    const jitterX = randomBetween(-cellWidth * 0.28, cellWidth * 0.28);
    const jitterY = randomBetween(-cellHeight * 0.28, cellHeight * 0.28);
    const jitterZ = randomBetween(-cellDepth * 0.28, cellDepth * 0.28);
    const azimuth = randomBetween(0, Math.PI * 2);
    const cosineInclination = randomBetween(-1, 1);
    const sineInclination = Math.sqrt(1 - cosineInclination * cosineInclination);
    const speed = speedScale * randomBetween(0.6, 1.4);
    particles.push({
      x: margin + cellWidth * (column + 0.5) + jitterX,
      y: margin + cellHeight * (row + 0.5) + jitterY,
      z: margin + cellDepth * (layer + 0.5) + jitterZ,
      vx: Math.cos(azimuth) * sineInclination * speed,
      vy: cosineInclination * speed,
      vz: Math.sin(azimuth) * sineInclination * speed,
    });
  }

  const state: GasState = { particles, wallImpulse: 0, elapsedSeconds: 0 };
  // The random direction + amplitude shapes the distribution, but its absolute
  // energy is only roughly right. Pin the exact temperature to the
  // target so the first-frame temperature readout matches the slider without
  // waiting for the user to nudge it.
  setTemperature(state, targetTemperature);
  return state;
}

export function totalKineticEnergy(state: GasState): number {
  let sum = 0;
  for (const particle of state.particles) {
    sum +=
      0.5 *
      PARTICLE_MASS *
      (particle.vx * particle.vx + particle.vy * particle.vy + particle.vz * particle.vz);
  }
  return sum;
}

export function meanKineticEnergy(state: GasState): number {
  if (state.particles.length === 0) {
    return 0;
  }
  return totalKineticEnergy(state) / state.particles.length;
}

// Equipartition in 3D gives <KE> = 3kT/2.
export function temperature(state: GasState): number {
  return (2 * meanKineticEnergy(state)) / (3 * BOLTZMANN_CONSTANT);
}

export function meanSpeed(state: GasState): number {
  if (state.particles.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const particle of state.particles) {
    sum += Math.hypot(particle.vx, particle.vy, particle.vz);
  }
  return sum / state.particles.length;
}

// Rescale every velocity so the temperature hits the target. This is how
// heating and cooling enter the model: inject or drain kinetic energy and let
// collisions redistribute it back into a Maxwellian.
export function setTemperature(state: GasState, targetTemperature: number): void {
  const currentTemperature = temperature(state);
  if (currentTemperature <= 1e-9) {
    return;
  }
  const factor = Math.sqrt(targetTemperature / currentTemperature);
  for (const particle of state.particles) {
    particle.vx *= factor;
    particle.vy *= factor;
    particle.vz *= factor;
  }
}

// Most probable speed of the 3D Maxwell distribution.
export function mostProbableSpeed(state: GasState): number {
  return Math.sqrt((2 * BOLTZMANN_CONSTANT * temperature(state)) / PARTICLE_MASS);
}

export function speedAxisForMostProbableSpeed(mostProbableParticleSpeed: number): number {
  return Math.max(mostProbableParticleSpeed * SPEED_AXIS_FACTOR, 1e-6);
}

// Normalized 3D Maxwell–Boltzmann speed distribution.
export function maxwellSpeedDensity(speed: number, gasTemperature: number): number {
  if (gasTemperature <= 1e-9) {
    return 0;
  }
  const massOverThermalEnergy = PARTICLE_MASS / (BOLTZMANN_CONSTANT * gasTemperature);
  return (
    Math.sqrt(2 / Math.PI) *
    Math.pow(massOverThermalEnergy, 1.5) *
    speed *
    speed *
    Math.exp((-massOverThermalEnergy * speed * speed) / 2)
  );
}

function reflectOffWalls(particle: Particle): number {
  // Returns the magnitude of momentum handed to the walls in this step.
  let impulse = 0;
  if (particle.x < PARTICLE_RADIUS) {
    particle.x = PARTICLE_RADIUS;
    impulse += 2 * PARTICLE_MASS * Math.abs(particle.vx);
    particle.vx = Math.abs(particle.vx);
  } else if (particle.x > BOX_WIDTH - PARTICLE_RADIUS) {
    particle.x = BOX_WIDTH - PARTICLE_RADIUS;
    impulse += 2 * PARTICLE_MASS * Math.abs(particle.vx);
    particle.vx = -Math.abs(particle.vx);
  }
  if (particle.y < PARTICLE_RADIUS) {
    particle.y = PARTICLE_RADIUS;
    impulse += 2 * PARTICLE_MASS * Math.abs(particle.vy);
    particle.vy = Math.abs(particle.vy);
  } else if (particle.y > BOX_HEIGHT - PARTICLE_RADIUS) {
    particle.y = BOX_HEIGHT - PARTICLE_RADIUS;
    impulse += 2 * PARTICLE_MASS * Math.abs(particle.vy);
    particle.vy = -Math.abs(particle.vy);
  }
  if (particle.z < PARTICLE_RADIUS) {
    particle.z = PARTICLE_RADIUS;
    impulse += 2 * PARTICLE_MASS * Math.abs(particle.vz);
    particle.vz = Math.abs(particle.vz);
  } else if (particle.z > BOX_DEPTH - PARTICLE_RADIUS) {
    particle.z = BOX_DEPTH - PARTICLE_RADIUS;
    impulse += 2 * PARTICLE_MASS * Math.abs(particle.vz);
    particle.vz = -Math.abs(particle.vz);
  }
  return impulse;
}

// Equal-mass elastic collision: along the line of centres the two normal
// velocity components simply swap; the tangential components are untouched. We
// only resolve a pair when they overlap *and* are approaching, then nudge them
// apart to stop them sticking together on the next step.
function resolvePair(a: Particle, b: Particle): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const distanceSquared = dx * dx + dy * dy + dz * dz;
  const minimumDistance = PARTICLE_RADIUS * 2;
  if (distanceSquared >= minimumDistance * minimumDistance || distanceSquared < 1e-12) {
    return;
  }

  const distance = Math.sqrt(distanceSquared);
  const nx = dx / distance;
  const ny = dy / distance;
  const nz = dz / distance;

  // Relative velocity projected onto the line of centres.
  const relativeNormal =
    (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
  if (relativeNormal < 0) {
    // Approaching: swap normal components (equal masses).
    a.vx += relativeNormal * nx;
    a.vy += relativeNormal * ny;
    a.vz += relativeNormal * nz;
    b.vx -= relativeNormal * nx;
    b.vy -= relativeNormal * ny;
    b.vz -= relativeNormal * nz;
  }

  // Position correction: push each disk out along the normal so they separate.
  const overlap = minimumDistance - distance;
  const push = overlap / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.y += ny * push;
  b.z += nz * push;
}

// A 3D spatial hash keeps pair checks near-O(N): each particle only tests its
// own cell and the 26 neighboring cells.
function resolveCollisions(particles: Particle[]): void {
  const cellSize = PARTICLE_RADIUS * 2;
  const cellKey = (column: number, row: number, layer: number): string =>
    `${column}:${row}:${layer}`;
  const cellOf = (particle: Particle): [number, number, number] => [
    Math.floor(particle.x / cellSize),
    Math.floor(particle.y / cellSize),
    Math.floor(particle.z / cellSize),
  ];
  const buckets = new Map<string, number[]>();

  for (let index = 0; index < particles.length; index += 1) {
    const [column, row, layer] = cellOf(particles[index]);
    const key = cellKey(column, row, layer);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(index);
    } else {
      buckets.set(key, [index]);
    }
  }

  for (let particleIndex = 0; particleIndex < particles.length; particleIndex += 1) {
    const [column, row, layer] = cellOf(particles[particleIndex]);
    for (let layerOffset = -1; layerOffset <= 1; layerOffset += 1) {
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          const neighboringBucket = buckets.get(
            cellKey(column + columnOffset, row + rowOffset, layer + layerOffset),
          );
          if (!neighboringBucket) {
            continue;
          }
          for (const neighborIndex of neighboringBucket) {
            if (neighborIndex > particleIndex) {
              resolvePair(particles[particleIndex], particles[neighborIndex]);
            }
          }
        }
      }
    }
  }
}

// Advance the whole gas by deltaSeconds of real time, chopped into fixed
// sub-steps. Records wall impulse and the simulated time elapsed so pressure can
// be derived downstream.
export function advance(state: GasState, deltaSeconds: number): void {
  const targetSeconds = deltaSeconds * TIME_SCALE;
  const stepCount = Math.min(MAX_SUB_STEPS_PER_ADVANCE, Math.ceil(targetSeconds / SUB_STEP_SECONDS));
  if (stepCount <= 0) {
    state.wallImpulse = 0;
    state.elapsedSeconds = 0;
    return;
  }
  const step = targetSeconds / stepCount;

  let impulse = 0;
  for (let s = 0; s < stepCount; s += 1) {
    // Move → resolve pair collisions → reflect off walls. Wall handling runs
    // last so the line-of-centres separation push in resolveCollisions can
    // never leave a disk poking through the box: any overlap it creates with a
    // wall is clamped and reflected in the same sub-step.
    for (const particle of state.particles) {
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.z += particle.vz * step;
    }
    resolveCollisions(state.particles);
    for (const particle of state.particles) {
      impulse += reflectOffWalls(particle);
    }
  }

  state.wallImpulse = impulse;
  state.elapsedSeconds = targetSeconds;
}

// Pressure is total wall force divided by the six-face surface area.
export function instantaneousPressure(state: GasState): number {
  if (state.elapsedSeconds <= 1e-9) {
    return 0;
  }
  const surfaceArea =
    2 * (BOX_WIDTH * BOX_HEIGHT + BOX_WIDTH * BOX_DEPTH + BOX_HEIGHT * BOX_DEPTH);
  return state.wallImpulse / state.elapsedSeconds / surfaceArea;
}
