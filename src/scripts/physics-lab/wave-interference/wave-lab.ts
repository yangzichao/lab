import { createAnimationLoop } from '../shared/animation-loop';
import {
  bindAction,
  getRangeValue,
  isChecked,
  onControlInput,
  setOutput,
  setReadout,
  updatePlayPauseButton,
} from '../shared/dom-controls';
import { degreesToRadians, formatCompact, formatFixed, formatSigned } from '../shared/format';
import { setupStageCanvas, STAGE_HEIGHT, STAGE_WIDTH, type Point } from '../shared/stage';
import { fieldAt, pathDifference, sourcePositions, type WaveParameters } from './wave-physics';
import { drawWaveInterference, WAVE_CENTER } from './wave-render';

const phaseSpeed = 4.2;
const screenDistance = STAGE_WIDTH - 132 - WAVE_CENTER.x;

export function initWaveInterferenceLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="wave-interference"]');
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

  let phaseTime = 0;
  let sample: Point = { x: STAGE_WIDTH * 0.7, y: STAGE_HEIGHT * 0.32 };

  const parameters = (): WaveParameters => ({
    wavelength: getRangeValue(root, 'wavelength', 48),
    sourceSeparation: getRangeValue(root, 'sourceSeparation', 160),
    phaseOffset: degreesToRadians(getRangeValue(root, 'phaseOffset', 0)),
    falloff: getRangeValue(root, 'falloff', 0.006),
  });

  const updateReadouts = (params: WaveParameters, sources: [Point, Point]): void => {
    const difference = pathDifference(sample, sources);
    const field = fieldAt(sample, sources, params, phaseTime);
    const fringeSpacing = (params.wavelength * screenDistance) / Math.max(params.sourceSeparation, 1);
    setReadout(root, 'pathDiff', `${formatFixed(difference, 1)} px`);
    setReadout(root, 'pathDiffLambda', `${formatFixed(difference / params.wavelength, 2)} λ`);
    setReadout(root, 'field', formatSigned(field, 2));
    setReadout(root, 'fringeScale', `${formatCompact(fringeSpacing, 0)} px`);
  };

  const render = (): void => {
    const params = parameters();
    const sources = sourcePositions(WAVE_CENTER, params.sourceSeparation);
    drawWaveInterference(context, {
      parameters: params,
      sources,
      phaseTime,
      sample,
      showWavefronts: isChecked(root, 'showWavefronts', true),
      showIntensity: isChecked(root, 'showIntensity', true),
    });
    updateReadouts(params, sources);
  };

  const updateOutputs = (): void => {
    setOutput(root, 'wavelength', `${Math.round(getRangeValue(root, 'wavelength', 48))} px`);
    setOutput(root, 'sourceSeparation', `${Math.round(getRangeValue(root, 'sourceSeparation', 160))} px`);
    setOutput(root, 'phaseOffset', `${Math.round(getRangeValue(root, 'phaseOffset', 0))}°`);
    setOutput(root, 'falloff', formatFixed(getRangeValue(root, 'falloff', 0.006), 3));
  };

  const moveSampleFromPointer = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    sample = {
      x: ((event.clientX - rect.left) / rect.width) * STAGE_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * STAGE_HEIGHT,
    };
    render();
  }

  const loop = createAnimationLoop((deltaSeconds) => {
    phaseTime += deltaSeconds * phaseSpeed;
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
  bindAction(root, 'reset', () => {
    phaseTime = 0;
    sample = { x: STAGE_WIDTH * 0.7, y: STAGE_HEIGHT * 0.32 };
    render();
  });

  canvas.addEventListener('pointermove', moveSampleFromPointer);
  canvas.addEventListener('pointerdown', moveSampleFromPointer);

  onControlInput(root, () => {
    updateOutputs();
    render();
  });

  updateOutputs();
  render();
  loop.start();
  updatePlayPauseButton(root, true);
}
