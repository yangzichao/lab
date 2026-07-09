import { createAnimationLoop } from '../shared/animation-loop';
import {
  bindAction,
  bindPresets,
  getRangeValue,
  isChecked,
  onControlInput,
  setOutput,
  setReadout,
  updatePlayPauseButton,
} from '../shared/dom-controls';
import { formatFixed, formatSigned } from '../shared/format';
import type { Point } from '../shared/stage';
import {
  createThreeBodyState,
  integrateThreeBody,
  threeBodyMetrics,
  type ThreeBodyMetrics,
  type ThreeBodyPresetId,
  type ThreeBodyState,
} from './three-body-physics';
import { ThreeBodyThreeDimensionalRenderer } from './three-body-three-dimensional-renderer';

const maximumTrailPoints = 1400;

const presetIds: ThreeBodyPresetId[] = ['figure8', 'chaos', 'triangle'];

function isPresetId(value: string): value is ThreeBodyPresetId {
  return (presetIds as string[]).includes(value);
}

export function initThreeBodyLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="three-body"]');
  if (!root) {
    return;
  }
  const canvas = root.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!canvas) {
    return;
  }
  const renderer = new ThreeBodyThreeDimensionalRenderer(canvas);
  window.addEventListener('pagehide', () => renderer.dispose(), { once: true });

  let activePreset: ThreeBodyPresetId = 'figure8';
  let state: ThreeBodyState = createThreeBodyState(activePreset, 0);
  let trails: [Point[], Point[], Point[]] = [[], [], []];
  let diverged = false;

  const perturbation = (): number => getRangeValue(root, 'perturbation', 0.5) / 100;
  const timeScale = (): number => getRangeValue(root, 'speed', 1);

  const render = (precomputedMetrics?: ThreeBodyMetrics): void => {
    const metrics = precomputedMetrics ?? threeBodyMetrics(state);
    renderer.draw({
      state,
      trails,
      metrics,
      showTrails: isChecked(root, 'showTrails', true),
      showVectors: isChecked(root, 'showVectors', false),
      showCenterOfMass: isChecked(root, 'showCenterOfMass', false),
      diverged,
    });

    setReadout(root, 'time', `${formatFixed(state.elapsed, 1)} s`);
    setReadout(root, 'energy', formatSigned(metrics.energy, 3));
    setReadout(root, 'momentum', formatFixed(metrics.momentum, 3));
    setReadout(root, 'status', diverged ? 'Diverged' : 'Bounded');
  };

  const updateOutputs = (): void => {
    setOutput(root, 'speed', `${formatFixed(timeScale(), 2)}×`);
    setOutput(root, 'perturbation', `${formatFixed(getRangeValue(root, 'perturbation', 0.5), 2)}%`);
  };

  const pushTrails = (): void => {
    for (let index = 0; index < 3; index += 1) {
      trails[index].push({ x: state.bodies[index].x, y: state.bodies[index].y });
      if (trails[index].length > maximumTrailPoints) {
        trails[index].splice(0, trails[index].length - maximumTrailPoints);
      }
    }
  };

  const reset = (): void => {
    state = createThreeBodyState(activePreset, perturbation());
    trails = [[], [], []];
    diverged = false;
    updateOutputs();
    render();
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    integrateThreeBody(state, deltaSeconds, timeScale());
    const metrics = threeBodyMetrics(state);
    if (metrics.diverged) {
      diverged = true;
      render(metrics);
      // Re-seed the same preset so the stage doesn't fly off to infinity.
      state = createThreeBodyState(activePreset, perturbation());
      trails = [[], [], []];
      return;
    }
    diverged = false;
    pushTrails();
    render(metrics);
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
    if (!isPresetId(presetId)) {
      return;
    }
    activePreset = presetId;
    reset();
  });

  onControlInput(root, (input) => {
    const id = input.dataset.control;
    updateOutputs();
    if (id === 'showTrails' || id === 'showVectors' || id === 'showCenterOfMass' || id === 'speed') {
      render();
    } else {
      reset();
    }
  });

  reset();
  loop.start();
  updatePlayPauseButton(root, true);
}
