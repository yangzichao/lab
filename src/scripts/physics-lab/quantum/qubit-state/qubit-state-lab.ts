import { createAnimationLoop } from '../../shared/animation-loop';
import {
  bindAction,
  bindPresets,
  getRangeValue,
  onControlInput,
  setOutput,
  setRangeValue,
  setReadout,
  updatePlayPauseButton,
} from '../../shared/dom-controls';
import { formatFixed } from '../../shared/format';
import { calculateQubitState, normalizeDegrees } from './qubit-state-physics';
import { QubitStateRenderer } from './qubit-state-render';

const presets = {
  zero: { theta: 0, phase: 0, basis: 0 },
  plus: { theta: 90, phase: 0, basis: 0 },
  phase: { theta: 90, phase: 90, basis: 0 },
};

export function initQubitStateLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="qubit-state"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!root || !canvas) return;

  const english = root.dataset.locale === 'en';
  const renderer = new QubitStateRenderer(canvas, {
    sphere: english ? 'BLOCH-SPHERE VIEW' : 'BLOCH SPHERE · 状态方向',
    amplitudes: english ? 'Z-BASIS PROBABILITIES' : 'Z 基测量概率',
    selectedBasis: english ? 'ROTATED-BASIS INTERFERENCE' : '旋转测量基 · 干涉',
    phaseHint: english ? 'Phase appears when the basis mixes paths.' : '测量基混合两条路径后，相位才显现。',
  });

  const readParameters = () => ({
    thetaDegrees: getRangeValue(root, 'theta', 90),
    phaseDegrees: getRangeValue(root, 'phase', 45),
    basisDegrees: getRangeValue(root, 'basis', 0),
  });

  const render = (): void => {
    const parameters = readParameters();
    const reading = calculateQubitState(parameters);
    renderer.draw(parameters, reading);
    setReadout(root, 'probabilityZero', `${formatFixed(reading.probabilityZero * 100, 1)}%`);
    setReadout(root, 'probabilityOne', `${formatFixed(reading.probabilityOne * 100, 1)}%`);
    setReadout(root, 'probabilityPlus', `${formatFixed(reading.probabilityPlus * 100, 1)}%`);
    setReadout(root, 'relativePhase', `${Math.round(parameters.phaseDegrees)}°`);
  };

  const updateOutputs = (): void => {
    setOutput(root, 'theta', `${Math.round(getRangeValue(root, 'theta', 90))}°`);
    setOutput(root, 'phase', `${Math.round(getRangeValue(root, 'phase', 45))}°`);
    setOutput(root, 'basis', `${Math.round(getRangeValue(root, 'basis', 0))}°`);
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    const nextPhase = normalizeDegrees(getRangeValue(root, 'phase', 45) + 55 * deltaSeconds);
    setRangeValue(root, 'phase', nextPhase);
    updateOutputs();
    render();
  });

  bindAction(root, 'toggle', () => {
    if (loop.running) loop.stop();
    else loop.start();
    updatePlayPauseButton(root, loop.running);
  });
  bindAction(root, 'reset', () => {
    loop.stop();
    const preset = { theta: 90, phase: 45, basis: 0 };
    Object.entries(preset).forEach(([id, value]) => setRangeValue(root, id, value));
    updateOutputs();
    render();
    updatePlayPauseButton(root, false);
  });
  bindPresets(root, (presetId) => {
    const preset = presets[presetId as keyof typeof presets];
    if (!preset) return;
    Object.entries(preset).forEach(([id, value]) => setRangeValue(root, id, value));
    updateOutputs();
    render();
  });
  onControlInput(root, () => {
    updateOutputs();
    render();
  });

  updateOutputs();
  render();
  updatePlayPauseButton(root, false);
}
