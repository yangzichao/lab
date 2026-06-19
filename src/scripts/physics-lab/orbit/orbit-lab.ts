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
import { formatCompact, formatFixed, formatSigned } from '../shared/format';
import type { Point } from '../shared/stage';
import { setupStageCanvas } from '../shared/stage';
import {
  BASE_MU,
  createOrbitState,
  integrateOrbit,
  orbitMetrics,
  type OrbitState,
} from './orbit-physics';
import { drawOrbit, planetScreenPosition } from './orbit-render';

const maximumTrailPoints = 900;
const minimumRadius = 18;
const maximumRadius = 980;

const presets: Record<
  string,
  { centralMass: number; launchRadius: number; launchSpeed: number; launchAngle: number }
> = {
  circle: { centralMass: 1, launchRadius: 180, launchSpeed: 1, launchAngle: 90 },
  ellipse: { centralMass: 1.2, launchRadius: 215, launchSpeed: 0.78, launchAngle: 90 },
  escape: { centralMass: 1, launchRadius: 165, launchSpeed: 1.43, launchAngle: 84 },
};

export function initOrbitLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="orbit"]');
  if (!root) {
    return;
  }
  const canvas = root.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!canvas) {
    return;
  }
  const context = setupStageCanvas(canvas);
  if (!context) {
    return;
  }

  const mu = (): number => BASE_MU * getRangeValue(root, 'centralMass', 1);

  const buildState = (): OrbitState =>
    createOrbitState(
      mu(),
      getRangeValue(root, 'launchRadius', 180),
      getRangeValue(root, 'launchSpeed', 1),
      getRangeValue(root, 'launchAngle', 90),
    );

  let state = buildState();
  let trail: Point[] = [];

  const render = (): void => {
    const metrics = orbitMetrics(state, mu());
    drawOrbit(context, {
      state,
      mu: mu(),
      trail,
      metrics,
      showTrail: isChecked(root, 'showTrail', true),
      showOrbit: isChecked(root, 'showOrbit', true),
      showVectors: isChecked(root, 'showVectors', true),
    });

    setReadout(root, 'classification', metrics.classification);
    setReadout(root, 'radius', `${formatCompact(metrics.radius, 0)} px`);
    setReadout(root, 'speed', formatFixed(metrics.speed, 2));
    setReadout(root, 'energy', formatSigned(metrics.energy, 1));
    setReadout(root, 'angularMomentum', formatCompact(metrics.angularMomentum, 0));
    setReadout(root, 'eccentricity', formatFixed(metrics.eccentricity, 3));
  };

  const updateOutputs = (): void => {
    setOutput(root, 'centralMass', `${formatFixed(getRangeValue(root, 'centralMass', 1), 2)}×`);
    setOutput(root, 'launchRadius', `${Math.round(getRangeValue(root, 'launchRadius', 180))} px`);
    setOutput(root, 'launchSpeed', `${formatFixed(getRangeValue(root, 'launchSpeed', 1), 2)}×`);
    setOutput(root, 'launchAngle', `${Math.round(getRangeValue(root, 'launchAngle', 90))}°`);
  };

  const relaunch = (): void => {
    state = buildState();
    trail = [];
    updateOutputs();
    render();
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    integrateOrbit(state, mu(), deltaSeconds);
    const radius = Math.hypot(state.x, state.y);
    if (radius < minimumRadius || radius > maximumRadius) {
      state = buildState();
      trail = [];
    } else {
      trail.push(planetScreenPosition(state));
      if (trail.length > maximumTrailPoints) {
        trail.splice(0, trail.length - maximumTrailPoints);
      }
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
  bindAction(root, 'reset', relaunch);

  bindPresets(root, (presetId) => {
    const preset = presets[presetId];
    if (!preset) {
      return;
    }
    setRangeValue(root, 'centralMass', preset.centralMass);
    setRangeValue(root, 'launchRadius', preset.launchRadius);
    setRangeValue(root, 'launchSpeed', preset.launchSpeed);
    setRangeValue(root, 'launchAngle', preset.launchAngle);
    relaunch();
  });

  onControlInput(root, (input) => {
    const id = input.dataset.control;
    updateOutputs();
    if (id === 'showTrail' || id === 'showOrbit' || id === 'showVectors') {
      render();
    } else {
      relaunch();
    }
  });

  relaunch();
  loop.start();
  updatePlayPauseButton(root, true);
}
