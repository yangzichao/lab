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
import { createAnimationLoop } from '../shared/animation-loop';
import { formatFixed, formatSigned } from '../shared/format';
import { setupStageCanvas } from '../shared/stage';
import {
  createMagnusState,
  getMagnusSnapshot,
  stepMagnusState,
  type MagnusParameters,
} from './magnus-effect-physics';
import { drawMagnusScene } from './magnus-effect-render';

const defaults: MagnusParameters = { launchSpeed: 28, launchAngle: 15, spinRate: 900, ballDiameter: 22 };
const presets: Record<string, MagnusParameters> = {
  backspin: { ...defaults, spinRate: 1200 },
  topspin: { ...defaults, spinRate: -1200 },
  noSpin: { ...defaults, spinRate: 0 },
};

export function initMagnusEffectLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="magnus-effect"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!root || !canvas) return;
  const context = setupStageCanvas(canvas);
  if (!context) return;
  const english = document.documentElement.lang.startsWith('en');

  const parameters = (): MagnusParameters => ({
    launchSpeed: getRangeValue(root, 'launchSpeed', defaults.launchSpeed),
    launchAngle: getRangeValue(root, 'launchAngle', defaults.launchAngle),
    spinRate: getRangeValue(root, 'spinRate', defaults.spinRate),
    ballDiameter: getRangeValue(root, 'ballDiameter', defaults.ballDiameter),
  });
  let state = createMagnusState(parameters());

  const render = (): void => {
    const params = parameters();
    const snapshot = getMagnusSnapshot(state.velocity, params);
    drawMagnusScene(context, { state, parameters: params, snapshot, showFlow: isChecked(root, 'showFlow', true), showReference: isChecked(root, 'showReference', true), english });
    setReadout(root, 'flightTime', `${formatFixed(state.elapsedSeconds, 2)} s`);
    setReadout(root, 'speed', `${formatFixed(snapshot.speed, 1)} m/s`);
    setReadout(root, 'spinRatio', formatSigned(snapshot.spinRatio, 2));
    setReadout(root, 'liftForce', `${formatFixed(Math.abs(snapshot.liftForce), 1)} N ${snapshot.liftForce >= 0 ? '↑' : '↓'}`);
    setReadout(root, 'range', `${formatFixed(state.position.x, 1)} m`);
  };

  const updateOutputs = (): void => {
    const params = parameters();
    setOutput(root, 'launchSpeed', `${formatFixed(params.launchSpeed, 1)} m/s`);
    setOutput(root, 'spinRate', `${params.spinRate >= 0 ? '+' : '−'}${Math.abs(params.spinRate).toFixed(0)} rpm`);
    setOutput(root, 'launchAngle', `${params.launchAngle.toFixed(0)}°`);
    setOutput(root, 'ballDiameter', `${params.ballDiameter.toFixed(0)} cm`);
  };
  const reset = (): void => {
    state = createMagnusState(parameters());
    if (!loop.running) loop.start();
    updatePlayPauseButton(root, true);
    render();
  };
  const loop = createAnimationLoop((deltaSeconds) => {
    stepMagnusState(state, parameters(), deltaSeconds);
    render();
    if (state.landed) {
      loop.stop();
      updatePlayPauseButton(root, false);
    }
  });

  bindAction(root, 'toggle', () => {
    if (loop.running) loop.stop(); else if (state.landed) reset(); else loop.start();
    updatePlayPauseButton(root, loop.running);
  });
  bindAction(root, 'reset', reset);
  bindPresets(root, (id) => {
    const preset = presets[id];
    if (!preset) return;
    Object.entries(preset).forEach(([key, value]) => setRangeValue(root, key, value));
    updateOutputs();
    reset();
  });
  onControlInput(root, (input) => {
    updateOutputs();
    if (input.type !== 'checkbox') state = createMagnusState(parameters());
    render();
  });
  updateOutputs();
  render();
  loop.start();
}
