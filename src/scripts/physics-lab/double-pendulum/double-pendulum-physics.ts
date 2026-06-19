// Double pendulum dynamics in real units (lengths in metres, mass in kg). The
// renderer maps metres to pixels, which keeps the motion lively and lets the
// energy readout carry a physical meaning. Integrated with classic RK4.

export type PendulumState = {
  theta1: number;
  theta2: number;
  omega1: number;
  omega2: number;
};

export const LENGTH_1 = 1;
export const LENGTH_2 = 1;
export const MASS_1 = 1;
export const MASS_2 = 1;
export const BASE_GRAVITY = 9.81;

type Derivative = {
  dTheta1: number;
  dTheta2: number;
  dOmega1: number;
  dOmega2: number;
};

export function createPendulumState(theta1: number, theta2: number): PendulumState {
  return { theta1, theta2, omega1: 0, omega2: 0 };
}

function derivative(state: PendulumState, gravity: number): Derivative {
  const { theta1, theta2, omega1, omega2 } = state;
  const delta = theta1 - theta2;
  const denominator = 2 * MASS_1 + MASS_2 - MASS_2 * Math.cos(2 * theta1 - 2 * theta2);

  const dOmega1 =
    (-gravity * (2 * MASS_1 + MASS_2) * Math.sin(theta1) -
      MASS_2 * gravity * Math.sin(theta1 - 2 * theta2) -
      2 *
        Math.sin(delta) *
        MASS_2 *
        (omega2 * omega2 * LENGTH_2 + omega1 * omega1 * LENGTH_1 * Math.cos(delta))) /
    (LENGTH_1 * denominator);

  const dOmega2 =
    (2 *
      Math.sin(delta) *
      (omega1 * omega1 * LENGTH_1 * (MASS_1 + MASS_2) +
        gravity * (MASS_1 + MASS_2) * Math.cos(theta1) +
        omega2 * omega2 * LENGTH_2 * MASS_2 * Math.cos(delta))) /
    (LENGTH_2 * denominator);

  return { dTheta1: omega1, dTheta2: omega2, dOmega1, dOmega2 };
}

function addScaled(state: PendulumState, derivativeStep: Derivative, factor: number): PendulumState {
  return {
    theta1: state.theta1 + derivativeStep.dTheta1 * factor,
    theta2: state.theta2 + derivativeStep.dTheta2 * factor,
    omega1: state.omega1 + derivativeStep.dOmega1 * factor,
    omega2: state.omega2 + derivativeStep.dOmega2 * factor,
  };
}

export function integrate(
  state: PendulumState,
  gravity: number,
  damping: number,
  deltaSeconds: number,
): PendulumState {
  const stepSeconds = 1 / 240;
  let current = state;
  let remaining = deltaSeconds;

  while (remaining > 0) {
    const h = Math.min(stepSeconds, remaining);
    const k1 = derivative(current, gravity);
    const k2 = derivative(addScaled(current, k1, h / 2), gravity);
    const k3 = derivative(addScaled(current, k2, h / 2), gravity);
    const k4 = derivative(addScaled(current, k3, h), gravity);

    const dampingFactor = Math.exp(-damping * h);
    current = {
      theta1: current.theta1 + (h / 6) * (k1.dTheta1 + 2 * k2.dTheta1 + 2 * k3.dTheta1 + k4.dTheta1),
      theta2: current.theta2 + (h / 6) * (k1.dTheta2 + 2 * k2.dTheta2 + 2 * k3.dTheta2 + k4.dTheta2),
      omega1:
        (current.omega1 + (h / 6) * (k1.dOmega1 + 2 * k2.dOmega1 + 2 * k3.dOmega1 + k4.dOmega1)) *
        dampingFactor,
      omega2:
        (current.omega2 + (h / 6) * (k1.dOmega2 + 2 * k2.dOmega2 + 2 * k3.dOmega2 + k4.dOmega2)) *
        dampingFactor,
    };
    remaining -= h;
  }

  return current;
}

export function totalEnergy(state: PendulumState, gravity: number): number {
  const { theta1, theta2, omega1, omega2 } = state;
  const delta = theta1 - theta2;
  const kinetic =
    0.5 * MASS_1 * LENGTH_1 * LENGTH_1 * omega1 * omega1 +
    0.5 *
      MASS_2 *
      (LENGTH_1 * LENGTH_1 * omega1 * omega1 +
        LENGTH_2 * LENGTH_2 * omega2 * omega2 +
        2 * LENGTH_1 * LENGTH_2 * omega1 * omega2 * Math.cos(delta));
  const potential =
    -(MASS_1 + MASS_2) * gravity * LENGTH_1 * Math.cos(theta1) -
    MASS_2 * gravity * LENGTH_2 * Math.cos(theta2);
  return kinetic + potential;
}
