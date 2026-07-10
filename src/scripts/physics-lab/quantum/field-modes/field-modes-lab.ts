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
import { calculateFieldMode } from './field-modes-physics';
import { FieldModesRenderer } from './field-modes-render';

const presets = {
  vacuum: { mode: 1, occupation: 0 },
  oneQuantum: { mode: 1, occupation: 1 },
  manyQuanta: { mode: 3, occupation: 6 },
};

export function initFieldModesLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="field-modes"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!root || !canvas) return;

  const english = root.dataset.locale === 'en';
  const renderer = new FieldModesRenderer(canvas, {
    spatialMode: english ? 'SPATIAL MODE FUNCTION' : '空间模式函数',
    uncertainty: english ? 'violet band: quadrature uncertainty scale' : '紫色区域：正交分量的不确定度尺度',
    ladder: english ? 'ONE MODE = ONE OSCILLATOR' : '一个模式 = 一个量子振子',
    vacuum: english ? 'vacuum state · zero-point energy remains' : '真空态 · 仍有零点能',
    quanta: english ? 'quanta in this mode' : '个模式量子',
  });
  let phase = 0;

  const readParameters = () => ({
    modeNumber: Math.round(getRangeValue(root, 'mode', 1)),
    occupationNumber: Math.round(getRangeValue(root, 'occupation', 1)),
  });

  const render = (): void => {
    const parameters = readParameters();
    const reading = calculateFieldMode(parameters);
    renderer.draw(parameters, reading, phase);
    setReadout(root, 'mode', `k = ${parameters.modeNumber}`);
    setReadout(root, 'occupation', `n = ${parameters.occupationNumber}`);
    setReadout(root, 'energy', `${formatFixed(reading.energyInHbarOmega, 2)} ℏω`);
    setReadout(root, 'wavelength', `${formatFixed(reading.wavelengthInBoxLengths, 2)} L`);
  };

  const updateOutputs = (): void => {
    setOutput(root, 'mode', `${Math.round(getRangeValue(root, 'mode', 1))}`);
    setOutput(root, 'occupation', `${Math.round(getRangeValue(root, 'occupation', 1))}`);
    setOutput(root, 'speed', `${formatFixed(getRangeValue(root, 'speed', 1), 2)}×`);
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    const mode = Math.round(getRangeValue(root, 'mode', 1));
    const speed = getRangeValue(root, 'speed', 1);
    phase = (phase + deltaSeconds * mode * speed * 1.6) % (Math.PI * 2);
    render();
  });

  bindAction(root, 'toggle', () => {
    if (loop.running) loop.stop();
    else loop.start();
    updatePlayPauseButton(root, loop.running);
  });
  bindAction(root, 'reset', () => {
    loop.stop();
    phase = 0;
    setRangeValue(root, 'mode', 1);
    setRangeValue(root, 'occupation', 1);
    setRangeValue(root, 'speed', 1);
    updateOutputs();
    render();
    updatePlayPauseButton(root, false);
  });
  bindPresets(root, (presetId) => {
    const preset = presets[presetId as keyof typeof presets];
    if (!preset) return;
    Object.entries(preset).forEach(([id, value]) => setRangeValue(root, id, value));
    phase = 0;
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
