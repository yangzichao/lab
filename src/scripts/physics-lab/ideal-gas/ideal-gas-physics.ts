// Kinetic theory of an ideal gas in two dimensions. N equal-mass hard disks
// rattle around inside a rectangular box, bouncing elastically off the walls
// and off one another. No forces, no potential — just free flight punctuated by
// collisions — yet the speed distribution settles onto the 2D Maxwell–Boltzmann
// (Rayleigh) curve. Units are arbitrary "box units": the box is BOX_WIDTH ×
// BOX_HEIGHT, particle mass is 1, so temperature reads as mean kinetic energy.

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
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

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
}

// Lay particles on a jittered grid (so none start overlapping) and give each a
// random velocity direction with a speed scaled to hit the requested mean
// kinetic energy. The exact arrangement washes out within a few collisions.
export function createGasState(particleCount: number, meanKineticEnergy: number): GasState {
  const columns = Math.ceil(Math.sqrt(particleCount));
  const rows = Math.ceil(particleCount / columns);
  const margin = PARTICLE_RADIUS * 2.4;
  const cellWidth = (BOX_WIDTH - margin * 2) / columns;
  const cellHeight = (BOX_HEIGHT - margin * 2) / rows;
  // In 2D <KE> = ½ m <v²>, so hitting KE_target means <v²> = 2·KE/m and the
  // characteristic speed is sqrt(2·KE/m). This only sets the rough scale; the
  // exact mean energy is pinned by the setTemperature call below.
  const speedScale = Math.sqrt((2 * meanKineticEnergy) / PARTICLE_MASS);

  const particles: Particle[] = [];
  for (let index = 0; index < particleCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const jitterX = randomBetween(-cellWidth * 0.28, cellWidth * 0.28);
    const jitterY = randomBetween(-cellHeight * 0.28, cellHeight * 0.28);
    const angle = randomBetween(0, Math.PI * 2);
    const speed = speedScale * randomBetween(0.6, 1.4);
    particles.push({
      x: margin + cellWidth * (column + 0.5) + jitterX,
      y: margin + cellHeight * (row + 0.5) + jitterY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }

  const state: GasState = { particles, wallImpulse: 0, elapsedSeconds: 0 };
  // The random direction + amplitude shapes the distribution, but its absolute
  // energy is only roughly right. Pin the exact mean kinetic energy to the
  // target so the first-frame temperature readout matches the slider without
  // waiting for the user to nudge it.
  setTemperature(state, meanKineticEnergy);
  return state;
}

export function totalKineticEnergy(state: GasState): number {
  let sum = 0;
  for (const particle of state.particles) {
    sum += 0.5 * PARTICLE_MASS * (particle.vx * particle.vx + particle.vy * particle.vy);
  }
  return sum;
}

export function meanKineticEnergy(state: GasState): number {
  if (state.particles.length === 0) {
    return 0;
  }
  return totalKineticEnergy(state) / state.particles.length;
}

// Temperature from the equipartition theorem in 2D: <KE> = (2/2) k T = k T, so
// T = <KE> / k. With k = 1 the temperature is numerically the mean kinetic
// energy — a clean "relative" scale for the readout.
export function temperature(state: GasState): number {
  return meanKineticEnergy(state) / BOLTZMANN_CONSTANT;
}

export function meanSpeed(state: GasState): number {
  if (state.particles.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const particle of state.particles) {
    sum += Math.hypot(particle.vx, particle.vy);
  }
  return sum / state.particles.length;
}

// Rescale every velocity so the mean kinetic energy hits the target — this is
// exactly how heating or cooling enters the model: inject or drain energy and
// let the collisions redistribute it back into a Maxwellian.
export function setTemperature(state: GasState, targetMeanKineticEnergy: number): void {
  const current = meanKineticEnergy(state);
  if (current <= 1e-9) {
    return;
  }
  const factor = Math.sqrt(targetMeanKineticEnergy / current);
  for (const particle of state.particles) {
    particle.vx *= factor;
    particle.vy *= factor;
  }
}

// Most probable speed of the 2D Maxwell distribution, v_p = sqrt(kT / m). The
// renderer marks this on the histogram so the peak of the live data lines up
// with theory.
export function mostProbableSpeed(state: GasState): number {
  return Math.sqrt((BOLTZMANN_CONSTANT * temperature(state)) / PARTICLE_MASS);
}

// 2D Maxwell–Boltzmann speed distribution (a Rayleigh distribution):
//   f(v) = (m / kT) · v · exp(-m v² / (2 k T))
// normalised so ∫ f(v) dv = 1. The renderer scales this to overlay the curve on
// the histogram.
export function maxwellSpeedDensity(speed: number, gasTemperature: number): number {
  if (gasTemperature <= 1e-9) {
    return 0;
  }
  const a = PARTICLE_MASS / (BOLTZMANN_CONSTANT * gasTemperature);
  return a * speed * Math.exp((-a * speed * speed) / 2);
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
  return impulse;
}

// Equal-mass elastic collision: along the line of centres the two normal
// velocity components simply swap; the tangential components are untouched. We
// only resolve a pair when they overlap *and* are approaching, then nudge them
// apart to stop them sticking together on the next step.
function resolvePair(a: Particle, b: Particle): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distanceSquared = dx * dx + dy * dy;
  const minimumDistance = PARTICLE_RADIUS * 2;
  if (distanceSquared >= minimumDistance * minimumDistance || distanceSquared < 1e-12) {
    return;
  }

  const distance = Math.sqrt(distanceSquared);
  const nx = dx / distance;
  const ny = dy / distance;

  // Relative velocity projected onto the line of centres.
  const relativeNormal = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relativeNormal < 0) {
    // Approaching: swap normal components (equal masses).
    a.vx += relativeNormal * nx;
    a.vy += relativeNormal * ny;
    b.vx -= relativeNormal * nx;
    b.vy -= relativeNormal * ny;
  }

  // Position correction: push each disk out along the normal so they separate.
  const overlap = minimumDistance - distance;
  const push = overlap / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
}

// A uniform spatial hash keeps pair checks near-O(N): each particle only tests
// the eight neighbouring cells plus its own, instead of all N-1 others.
function resolveCollisions(particles: Particle[]): void {
  const cellSize = PARTICLE_RADIUS * 2;
  const columns = Math.max(1, Math.floor(BOX_WIDTH / cellSize));
  const rows = Math.max(1, Math.floor(BOX_HEIGHT / cellSize));
  const buckets: number[][] = Array.from({ length: columns * rows }, () => []);

  const cellIndexOf = (particle: Particle): number => {
    const column = Math.min(columns - 1, Math.max(0, Math.floor((particle.x / BOX_WIDTH) * columns)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((particle.y / BOX_HEIGHT) * rows)));
    return row * columns + column;
  };

  for (let index = 0; index < particles.length; index += 1) {
    buckets[cellIndexOf(particles[index])].push(index);
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const here = buckets[row * columns + column];
      for (let dRow = 0; dRow <= 1; dRow += 1) {
        for (let dColumn = -1; dColumn <= 1; dColumn += 1) {
          if (dRow === 0 && dColumn < 0) {
            continue;
          }
          const neighbourRow = row + dRow;
          const neighbourColumn = column + dColumn;
          if (neighbourRow >= rows || neighbourColumn < 0 || neighbourColumn >= columns) {
            continue;
          }
          const there = buckets[neighbourRow * columns + neighbourColumn];
          const sameCell = dRow === 0 && dColumn === 0;
          for (let i = 0; i < here.length; i += 1) {
            const startJ = sameCell ? i + 1 : 0;
            for (let j = startJ; j < there.length; j += 1) {
              resolvePair(particles[here[i]], particles[there[j]]);
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
    }
    resolveCollisions(state.particles);
    for (const particle of state.particles) {
      impulse += reflectOffWalls(particle);
    }
  }

  state.wallImpulse = impulse;
  state.elapsedSeconds = targetSeconds;
}

// Pressure in 2D is force per unit length of wall: total impulse delivered per
// unit time, divided by the box perimeter. Returned raw; the lab smooths it over
// a time window before display.
export function instantaneousPressure(state: GasState): number {
  if (state.elapsedSeconds <= 1e-9) {
    return 0;
  }
  const perimeter = 2 * (BOX_WIDTH + BOX_HEIGHT);
  return state.wallImpulse / state.elapsedSeconds / perimeter;
}
