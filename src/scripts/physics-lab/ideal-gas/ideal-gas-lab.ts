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
import { clamp, formatFixed } from '../shared/format';
import { setupStageCanvas } from '../shared/stage';
import {
  advance,
  createGasState,
  instantaneousPressure,
  meanSpeed,
  mostProbableSpeed,
  setTemperature,
  temperature,
  type GasState,
} from './ideal-gas-physics';
import { drawIdealGas, speedAxisFor } from './ideal-gas-render';

// The temperature slider reads as a target mean kinetic energy. These bounds keep
// the gas lively without letting particles tunnel through walls between steps.
const MINIMUM_TEMPERATURE = 0.1;
const MAXIMUM_TEMPERATURE = 4;

const DEFAULT_PARTICLE_COUNT = 170;
const DEFAULT_TEMPERATURE = 1;

// Exponential smoothing for the noisy raw pressure signal, plus a slow-moving
// speed axis so the histogram frame does not jitter every frame.
const PRESSURE_SMOOTHING = 0.06;
const SPEED_AXIS_SMOOTHING = 0.04;

const presets: Record<string, { temperature: number }> = {
  cold: { temperature: 0.3 },
  warm: { temperature: 1 },
  hot: { temperature: 2.8 },
};

export function initIdealGasLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="ideal-gas"]');
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

  const readParticleCount = (): number => Math.round(getRangeValue(root, 'count', DEFAULT_PARTICLE_COUNT));
  const readTargetTemperature = (): number =>
    clamp(getRangeValue(root, 'temperature', DEFAULT_TEMPERATURE), MINIMUM_TEMPERATURE, MAXIMUM_TEMPERATURE);

  let state: GasState = createGasState(readParticleCount(), readTargetTemperature());
  let smoothedPressure = 0;
  let smoothedSpeedAxis = speedAxisFor(mostProbableSpeed(state));

  const updateReadouts = (): void => {
    setReadout(root, 'count', String(state.particles.length));
    setReadout(root, 'temperature', formatFixed(temperature(state), 2));
    setReadout(root, 'pressure', formatFixed(smoothedPressure, 2));
    setReadout(root, 'meanSpeed', formatFixed(meanSpeed(state), 2));
  };

  const render = (): void => {
    const gasTemperature = temperature(state);
    drawIdealGas(context, {
      state,
      temperature: gasTemperature,
      mostProbableSpeed: mostProbableSpeed(state),
      speedAxisMaximum: smoothedSpeedAxis,
      showHistogram: isChecked(root, 'showHistogram', true),
      colorBySpeed: isChecked(root, 'colorBySpeed', true),
    });
    updateReadouts();
  };

  const updateOutputs = (): void => {
    setOutput(root, 'count', String(readParticleCount()));
    setOutput(root, 'temperature', `${formatFixed(readTargetTemperature(), 2)}×`);
  };

  const rebuild = (): void => {
    state = createGasState(readParticleCount(), readTargetTemperature());
    smoothedPressure = 0;
    smoothedSpeedAxis = speedAxisFor(mostProbableSpeed(state));
    updateOutputs();
    render();
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    advance(state, deltaSeconds);
    const rawPressure = instantaneousPressure(state);
    smoothedPressure += (rawPressure - smoothedPressure) * PRESSURE_SMOOTHING;
    const targetAxis = speedAxisFor(mostProbableSpeed(state));
    smoothedSpeedAxis += (targetAxis - smoothedSpeedAxis) * SPEED_AXIS_SMOOTHING;
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
  bindAction(root, 'reset', rebuild);

  bindPresets(root, (presetId) => {
    const preset = presets[presetId];
    if (!preset) {
      return;
    }
    setRangeValue(root, 'temperature', preset.temperature);
    // Heat or cool the existing gas in place rather than reshuffling positions,
    // so the histogram visibly slides and spreads toward the new curve.
    setTemperature(state, preset.temperature);
    updateOutputs();
    render();
  });

  onControlInput(root, (input) => {
    const id = input.dataset.control;
    updateOutputs();
    if (id === 'count') {
      rebuild();
    } else if (id === 'temperature') {
      // Rescale velocities to the new target energy — heating/cooling in place.
      setTemperature(state, readTargetTemperature());
      render();
    } else {
      render();
    }
  });

  rebuild();
  loop.start();
  updatePlayPauseButton(root, true);
}
