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
import { setupStageCanvas } from '../shared/stage';
import {
  buildHarmonics,
  synthesizeValue,
  type WaveformKind,
} from './fourier-epicycles-physics';
import { drawFourierEpicycles } from './fourier-epicycles-render';

const waveformLabels: Record<WaveformKind, string> = {
  square: 'Square',
  sawtooth: 'Sawtooth',
  triangle: 'Triangle',
};

const isWaveformKind = (value: string): value is WaveformKind =>
  value === 'square' || value === 'sawtooth' || value === 'triangle';

export function initFourierEpicyclesLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="fourier-epicycles"]');
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

  // The base angular frequency is fixed; the speed slider just scales how fast
  // simulated time advances, which keeps every harmonic an exact integer multiple.
  const baseFrequency = 1;

  let waveform: WaveformKind = 'square';
  let time = 0;

  // ---- Helpers (arrow consts so the non-null narrowing of root/context holds) ----

  const harmonicCount = (): number => Math.round(getRangeValue(root, 'terms', 6));
  const speed = (): number => getRangeValue(root, 'speed', 1);

  const currentHarmonics = () => buildHarmonics(waveform, harmonicCount());

  const updateReadouts = (): void => {
    const harmonics = currentHarmonics();
    const value = synthesizeValue(harmonics, baseFrequency, time);
    setReadout(root, 'terms', `${harmonicCount()}`);
    setReadout(root, 'baseFrequency', `${formatFixed(baseFrequency, 2)} rad/s`);
    setReadout(root, 'value', formatSigned(value, 2));
    setReadout(root, 'waveform', waveformLabels[waveform]);
  };

  const render = (): void => {
    drawFourierEpicycles(context, {
      kind: waveform,
      harmonics: currentHarmonics(),
      baseFrequency,
      time,
      showCircles: isChecked(root, 'showCircles', true),
      showTarget: isChecked(root, 'showTarget', true),
    });
    updateReadouts();
  };

  const updateOutputs = (): void => {
    setOutput(root, 'terms', `${harmonicCount()}`);
    setOutput(root, 'speed', `${formatFixed(speed(), 2)}×`);
  };

  const reset = (): void => {
    time = 0;
    updateOutputs();
    render();
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    time += deltaSeconds * speed();
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
    if (isWaveformKind(presetId)) {
      waveform = presetId;
      reset();
    }
  });

  onControlInput(root, () => {
    updateOutputs();
    render();
  });

  reset();
  loop.start();
  updatePlayPauseButton(root, true);
}
