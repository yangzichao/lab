import { createAnimationLoop } from '../shared/animation-loop';
import {
  bindAction,
  bindPresets,
  getRangeValue,
  isChecked,
  onControlInput,
  setOutput,
  setRangeValue,
  setReadout,
  updatePlayPauseButton,
} from '../shared/dom-controls';
import { degreesToRadians, formatCompact, formatFixed } from '../shared/format';
import {
  pendulumBobPosition,
  pendulumBobVelocity,
  type PendulumCartesianPoint,
} from './double-pendulum-kinematics';
import {
  BASE_GRAVITY,
  createPendulumState,
  integrate,
  totalEnergy,
  type PendulumState,
} from './double-pendulum-physics';
import { DoublePendulumThreeDimensionalRenderer } from './double-pendulum-three-dimensional-renderer';

const maximumTrailPoints = 620;
const twinPerturbationRadians = degreesToRadians(0.001);

const presets: Record<string, { angle1: number; angle2: number; gravity: number; damping: number }> = {
  gentle: { angle1: 28, angle2: -16, gravity: 1, damping: 0.04 },
  chaotic: { angle1: 120, angle2: -150, gravity: 1, damping: 0 },
  overTop: { angle1: 170, angle2: 168, gravity: 1.4, damping: 0 },
};

export function initDoublePendulumLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="double-pendulum"]');
  if (!root) {
    return;
  }
  const canvas = root.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!canvas) {
    return;
  }
  const renderer = new DoublePendulumThreeDimensionalRenderer(canvas);

  const buildState = (): PendulumState =>
    createPendulumState(
      degreesToRadians(getRangeValue(root, 'angle1', 120)),
      degreesToRadians(getRangeValue(root, 'angle2', -35)),
    );

  const perturb = (base: PendulumState): PendulumState => ({
    ...base,
    theta1: base.theta1 + twinPerturbationRadians,
  });

  const gravity = (): number => BASE_GRAVITY * getRangeValue(root, 'gravity', 1);
  const damping = (): number => getRangeValue(root, 'damping', 0.04);

  let state = buildState();
  let twin = perturb(state);
  let trail: PendulumCartesianPoint[] = [];
  let elapsedSeconds = 0;

  const updateReadouts = (): void => {
    const velocity = pendulumBobVelocity(state);
    const speed = Math.hypot(velocity.x, velocity.y);
    const separation = Math.hypot(
      (state.theta1 - twin.theta1) * (180 / Math.PI),
      (state.theta2 - twin.theta2) * (180 / Math.PI),
    );
    setReadout(root, 'time', `${formatFixed(elapsedSeconds, 1)} s`);
    setReadout(root, 'energy', `${formatFixed(totalEnergy(state, gravity()), 2)} J`);
    setReadout(root, 'speed', `${formatFixed(speed, 2)} m/s`);
    setReadout(root, 'twinGap', `${formatCompact(separation, separation < 10 ? 2 : 0)}°`);
  };

  const render = (): void => {
    renderer.draw({
      state,
      twin: isChecked(root, 'showTwin', true) ? twin : null,
      trail,
      showTrail: isChecked(root, 'showTrail', true),
    });
    updateReadouts();
  };

  const updateOutputs = (): void => {
    setOutput(root, 'gravity', `${formatFixed(getRangeValue(root, 'gravity', 1), 2)}×`);
    setOutput(root, 'damping', formatFixed(damping(), 3));
    setOutput(root, 'angle1', `${Math.round(getRangeValue(root, 'angle1', 120))}°`);
    setOutput(root, 'angle2', `${Math.round(getRangeValue(root, 'angle2', -35))}°`);
  };

  const reset = (): void => {
    state = buildState();
    twin = perturb(state);
    trail = [];
    elapsedSeconds = 0;
    updateOutputs();
    render();
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    const g = gravity();
    const b = damping();
    state = integrate(state, g, b, deltaSeconds);
    twin = integrate(twin, g, b, deltaSeconds);
    elapsedSeconds += deltaSeconds;

    trail.push(pendulumBobPosition(state));
    if (trail.length > maximumTrailPoints) {
      trail.splice(0, trail.length - maximumTrailPoints);
    }
    render();
  });

  bindAction(root, 'toggle', () => {
    if (loop.running) {
      loop.stop();
    } else {
      loop.start();
    }
    updatePlayPauseButton(root, loop.running);
  });
  bindAction(root, 'reset', reset);

  bindPresets(root, (presetId) => {
    const preset = presets[presetId];
    if (!preset) {
      return;
    }
    setRangeValue(root, 'angle1', preset.angle1);
    setRangeValue(root, 'angle2', preset.angle2);
    setRangeValue(root, 'gravity', preset.gravity);
    setRangeValue(root, 'damping', preset.damping);
    reset();
  });

  onControlInput(root, (input) => {
    const id = input.dataset.control;
    updateOutputs();
    if (id === 'angle1' || id === 'angle2') {
      reset();
    } else {
      render();
    }
  });

  reset();
  loop.start();
  updatePlayPauseButton(root, true);
}
