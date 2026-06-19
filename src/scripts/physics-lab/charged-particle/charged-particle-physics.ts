// A charged particle moving in the plane under the Lorentz force
//   F = q (E + v × B).
//
// The magnetic field points straight through the page, so it is a single
// scalar Bz; the electric field lives in the plane, E = (Ex, Ey). With B = ẑ·Bz
// the cross product collapses to v × B = (vy·Bz, −vx·Bz), giving the
// acceleration a = (q/m)·(Ex + vy·Bz, Ey − vx·Bz).
//
// We advance with the Boris pusher rather than Euler/RK4. Boris splits each
// step into a half electric kick, a pure magnetic rotation, then a second half
// electric kick. The rotation is exact in magnitude, so in a pure magnetic
// field the speed — and therefore the energy — does not drift over long runs,
// which is exactly the regime (cyclotron, E×B drift) this lab lives in.

export type FieldParameters = {
  charge: number; // q
  mass: number; // m (kept strictly positive)
  magneticZ: number; // Bz, out of the page when positive
  electricX: number; // Ex
  electricY: number; // Ey
};

export type ParticleState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

// Physics runs in its own metres/second units; the renderer maps them to
// pixels. A small fixed sub-step keeps the rotation faithful even when the
// browser hands us a long frame.
export const SUB_STEP_SECONDS = 1 / 480;

// Mass divides into the acceleration, so a zero or negative value would yield
// Infinity/NaN. The lab clamps its slider to this floor, and the physics layer
// guards again here so direct callers stay safe; both sides share the constant
// to avoid a drifting magic number.
export const MINIMUM_MASS = 0.2;

const safeMass = (mass: number): number => Math.max(MINIMUM_MASS, mass);

export function createParticleState(
  x: number,
  y: number,
  speed: number,
  directionRadians: number,
): ParticleState {
  return {
    x,
    y,
    vx: speed * Math.cos(directionRadians),
    vy: speed * Math.sin(directionRadians),
  };
}

export function lorentzAcceleration(state: ParticleState, fields: FieldParameters): {
  x: number;
  y: number;
} {
  const chargeOverMass = fields.charge / safeMass(fields.mass);
  return {
    x: chargeOverMass * (fields.electricX + state.vy * fields.magneticZ),
    y: chargeOverMass * (fields.electricY - state.vx * fields.magneticZ),
  };
}

export function speedOf(state: ParticleState): number {
  return Math.hypot(state.vx, state.vy);
}

// Kinetic energy. With no scalar potential tracked here this is the full
// mechanical energy a pure magnetic field must conserve.
export function kineticEnergy(state: ParticleState, fields: FieldParameters): number {
  const speed = speedOf(state);
  return 0.5 * safeMass(fields.mass) * speed * speed;
}

// Cyclotron radius r_c = m·v / |q·Bz|. Returns null when there is effectively
// no magnetic field, so the readout can show a straight-line "∞".
export function cyclotronRadius(state: ParticleState, fields: FieldParameters): number | null {
  const denominator = Math.abs(fields.charge * fields.magneticZ);
  if (denominator < 1e-9) {
    return null;
  }
  return (safeMass(fields.mass) * speedOf(state)) / denominator;
}

// Cyclotron angular frequency ω_c = |q·Bz| / m. Returns null when there is
// effectively no magnetic field, mirroring cyclotronRadius so the readout can
// show a dash instead of a misleading 0.
export function cyclotronFrequency(fields: FieldParameters): number | null {
  const numerator = Math.abs(fields.charge * fields.magneticZ);
  if (numerator < 1e-9) {
    return null;
  }
  return numerator / safeMass(fields.mass);
}

// One Boris sub-step: half E kick → magnetic rotation → half E kick → drift.
function borisSubStep(state: ParticleState, fields: FieldParameters, h: number): ParticleState {
  const chargeOverMass = fields.charge / safeMass(fields.mass);
  const halfStep = 0.5 * h;

  // First half of the electric acceleration.
  const vMinusX = state.vx + chargeOverMass * fields.electricX * halfStep;
  const vMinusY = state.vy + chargeOverMass * fields.electricY * halfStep;

  // Magnetic rotation. t = (q/m)·Bz·(h/2); the rotation angle is 2·atan(t).
  const t = chargeOverMass * fields.magneticZ * halfStep;
  const s = (2 * t) / (1 + t * t);

  // v' = v⁻ + v⁻ × t̂ with t along +z, so the in-plane cross product is
  // (vy·t, −vx·t).
  const vPrimeX = vMinusX + vMinusY * t;
  const vPrimeY = vMinusY - vMinusX * t;

  // v⁺ = v⁻ + v' × ŝ, again with s along +z → (vy·s, −vx·s).
  const vPlusX = vMinusX + vPrimeY * s;
  const vPlusY = vMinusY - vPrimeX * s;

  // Second half of the electric acceleration.
  const vx = vPlusX + chargeOverMass * fields.electricX * halfStep;
  const vy = vPlusY + chargeOverMass * fields.electricY * halfStep;

  return {
    x: state.x + vx * h,
    y: state.y + vy * h,
    vx,
    vy,
  };
}

export function integrate(
  state: ParticleState,
  fields: FieldParameters,
  deltaSeconds: number,
): ParticleState {
  let current = state;
  let remaining = deltaSeconds;
  while (remaining > 1e-9) {
    const h = Math.min(SUB_STEP_SECONDS, remaining);
    current = borisSubStep(current, fields, h);
    remaining -= h;
  }
  return current;
}
