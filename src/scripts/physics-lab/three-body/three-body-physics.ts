// Three masses under mutual Newtonian gravity. There is no general closed-form
// solution, so we integrate the system numerically. Each body feels the pull of
// the other two:
//   aᵢ = G · Σ_{j≠i} mⱼ · (rⱼ − rᵢ) / (|rⱼ − rᵢ|² + ε²)^{3/2}
// The ε (softening) term keeps the acceleration finite during close passes so a
// near-collision can't blow the integrator up. We advance with velocity-Verlet
// at a fixed sub-step (the same scheme the orbit lab uses to keep orbits closed
// rather than spiralling), taking many sub-steps per frame for stability — the
// figure-eight in particular needs a small step to stay periodic.

export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
};

export type ThreeBodyState = {
  bodies: [Body, Body, Body];
  elapsed: number;
};

export type ThreeBodyMetrics = {
  energy: number;
  momentum: number;
  centerOfMass: { x: number; y: number };
  diverged: boolean;
};

// Gravitational constant in scene units. With G = 1 and unit masses the famous
// figure-eight initial data below closes into a stable orbit.
export const GRAVITY_CONSTANT = 1;

// Softening length: small relative to the orbit, large enough to tame the
// singularity when two bodies graze each other.
const SOFTENING = 0.02;

// Wall-clock seconds → simulation time. The figure-eight has period ≈ 6.32 in
// these units, so a modest scale keeps the choreography moving at a readable
// pace.
export const THREE_BODY_TIME_SCALE = 1.1;

// Fixed integrator sub-step. Small enough that velocity-Verlet stays stable and
// energy stays nearly flat even through the close approaches of the figure-eight.
const SUB_STEP = 0.0016;

// If any body wanders this far from the centre of mass the run has effectively
// ejected a body; we report it so the lab can flag divergence and reset.
const DIVERGENCE_RADIUS = 12;

export type ThreeBodyPresetId = 'figure8' | 'chaos' | 'triangle';

type PresetBuilder = (perturbation: number) => ThreeBodyState;

// The canonical Chenciner–Montgomery figure-eight: G = 1, three equal unit
// masses. Body 3 starts at the origin; bodies 1 and 2 are mirror images, each
// carrying minus half of body 3's velocity so total momentum is zero.
const FIGURE_EIGHT_VELOCITY = { x: 0.93240737, y: 0.86473146 };

function makeFigureEight(): ThreeBodyState {
  return {
    elapsed: 0,
    bodies: [
      {
        x: -0.97000436,
        y: 0.24308753,
        vx: -0.5 * FIGURE_EIGHT_VELOCITY.x,
        vy: -0.5 * FIGURE_EIGHT_VELOCITY.y,
        mass: 1,
      },
      {
        x: 0.97000436,
        y: -0.24308753,
        vx: -0.5 * FIGURE_EIGHT_VELOCITY.x,
        vy: -0.5 * FIGURE_EIGHT_VELOCITY.y,
        mass: 1,
      },
      {
        x: 0,
        y: 0,
        vx: FIGURE_EIGHT_VELOCITY.x,
        vy: FIGURE_EIGHT_VELOCITY.y,
        mass: 1,
      },
    ],
  };
}

// Chaos preset: the same figure-eight, but body 3's velocity is nudged by a tiny
// fraction. Sensitive dependence means even a 0.5% kick eventually tips the
// choreography into a wildly different, aperiodic trajectory.
function makeChaos(perturbation: number): ThreeBodyState {
  const state = makeFigureEight();
  const kick = 1 + perturbation;
  state.bodies[2].vx *= kick;
  state.bodies[2].vy *= kick;
  // The kick gives the system a net momentum, which would make the centre of
  // mass drift off across the stage. Subtract the centre-of-mass velocity from
  // every body so total momentum is zero again — the chaos then comes purely
  // from sensitive dependence on initial conditions, not a drifting frame.
  // (Figure-8 and triangle are already zero-momentum, so this is a no-op there.)
  let momentumX = 0;
  let momentumY = 0;
  let totalMass = 0;
  for (const body of state.bodies) {
    momentumX += body.mass * body.vx;
    momentumY += body.mass * body.vy;
    totalMass += body.mass;
  }
  const comVelocityX = momentumX / totalMass;
  const comVelocityY = momentumY / totalMass;
  for (const body of state.bodies) {
    body.vx -= comVelocityX;
    body.vy -= comVelocityY;
  }
  return state;
}

// A symmetric Lagrange-type configuration: three equal masses on an equilateral
// triangle, each given a tangential velocity so the whole arrangement rotates as
// a rigid body — a rare exact periodic solution of the three-body problem.
function makeTriangle(): ThreeBodyState {
  const radius = 1;
  const angularSpeed = Math.sqrt((GRAVITY_CONSTANT * 3) / (Math.sqrt(3) * radius * radius * radius));
  const angles = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];
  const bodies = angles.map((angle) => {
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    // Velocity is perpendicular to the radius for rigid rotation: v = ω × r.
    return {
      x,
      y,
      vx: -angularSpeed * y,
      vy: angularSpeed * x,
      mass: 1,
    };
  });
  return { elapsed: 0, bodies: [bodies[0], bodies[1], bodies[2]] };
}

const presetBuilders: Record<ThreeBodyPresetId, PresetBuilder> = {
  figure8: () => makeFigureEight(),
  chaos: (perturbation) => makeChaos(perturbation),
  triangle: () => makeTriangle(),
};

export function createThreeBodyState(
  presetId: ThreeBodyPresetId,
  perturbation: number,
): ThreeBodyState {
  const builder = presetBuilders[presetId] ?? presetBuilders.figure8;
  return builder(perturbation);
}

function accelerations(bodies: [Body, Body, Body]): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      if (i === j) {
        continue;
      }
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const distanceSquared = dx * dx + dy * dy + SOFTENING * SOFTENING;
      const inverseCube = 1 / (distanceSquared * Math.sqrt(distanceSquared));
      const scale = GRAVITY_CONSTANT * bodies[j].mass * inverseCube;
      result[i].x += scale * dx;
      result[i].y += scale * dy;
    }
  }
  return result;
}

// One velocity-Verlet sub-step: kick velocities a half step on the current
// acceleration, drift positions a full step, recompute acceleration, then kick
// the second half. Symplectic, so energy stays bounded over long runs.
function verletStep(bodies: [Body, Body, Body], step: number): void {
  const a0 = accelerations(bodies);
  for (let i = 0; i < 3; i += 1) {
    bodies[i].vx += 0.5 * a0[i].x * step;
    bodies[i].vy += 0.5 * a0[i].y * step;
    bodies[i].x += bodies[i].vx * step;
    bodies[i].y += bodies[i].vy * step;
  }
  const a1 = accelerations(bodies);
  for (let i = 0; i < 3; i += 1) {
    bodies[i].vx += 0.5 * a1[i].x * step;
    bodies[i].vy += 0.5 * a1[i].y * step;
  }
}

export function integrateThreeBody(
  state: ThreeBodyState,
  deltaSeconds: number,
  timeScale: number,
): void {
  let remaining = deltaSeconds * THREE_BODY_TIME_SCALE * timeScale;
  while (remaining > 0) {
    const step = Math.min(remaining, SUB_STEP);
    verletStep(state.bodies, step);
    state.elapsed += step;
    remaining -= step;
  }
}

export function threeBodyMetrics(state: ThreeBodyState): ThreeBodyMetrics {
  const { bodies } = state;
  let totalMass = 0;
  let kinetic = 0;
  let momentumX = 0;
  let momentumY = 0;
  let comX = 0;
  let comY = 0;

  for (const body of bodies) {
    const speedSquared = body.vx * body.vx + body.vy * body.vy;
    kinetic += 0.5 * body.mass * speedSquared;
    momentumX += body.mass * body.vx;
    momentumY += body.mass * body.vy;
    comX += body.mass * body.x;
    comY += body.mass * body.y;
    totalMass += body.mass;
  }

  let potential = 0;
  for (let i = 0; i < 3; i += 1) {
    for (let j = i + 1; j < 3; j += 1) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const distance = Math.sqrt(dx * dx + dy * dy + SOFTENING * SOFTENING);
      potential -= (GRAVITY_CONSTANT * bodies[i].mass * bodies[j].mass) / distance;
    }
  }

  const centerOfMass = { x: comX / totalMass, y: comY / totalMass };
  let diverged = false;
  for (const body of bodies) {
    const distance = Math.hypot(body.x - centerOfMass.x, body.y - centerOfMass.y);
    if (distance > DIVERGENCE_RADIUS) {
      diverged = true;
    }
  }

  return {
    energy: kinetic + potential,
    momentum: Math.hypot(momentumX, momentumY),
    centerOfMass,
    diverged,
  };
}
