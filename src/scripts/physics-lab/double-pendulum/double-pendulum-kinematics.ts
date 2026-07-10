import {
  LENGTH_1,
  LENGTH_2,
  type PendulumState,
} from './double-pendulum-physics';

export type PendulumCartesianPoint = {
  x: number;
  y: number;
};

export function pendulumJointPosition(
  state: PendulumState,
): PendulumCartesianPoint {
  return {
    x: LENGTH_1 * Math.sin(state.theta1),
    y: LENGTH_1 * Math.cos(state.theta1),
  };
}

export function pendulumBobPosition(
  state: PendulumState,
): PendulumCartesianPoint {
  const joint = pendulumJointPosition(state);
  return {
    x: joint.x + LENGTH_2 * Math.sin(state.theta2),
    y: joint.y + LENGTH_2 * Math.cos(state.theta2),
  };
}

export function pendulumBobVelocity(
  state: PendulumState,
): PendulumCartesianPoint {
  return {
    x:
      LENGTH_1 * state.omega1 * Math.cos(state.theta1) +
      LENGTH_2 * state.omega2 * Math.cos(state.theta2),
    y:
      -LENGTH_1 * state.omega1 * Math.sin(state.theta1) -
      LENGTH_2 * state.omega2 * Math.sin(state.theta2),
  };
}
