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
import {
  fringeSpacing,
  sampleDetectionPosition,
  type DetectionHit,
  type InterferenceParameters,
} from './single-particle-interference-physics';
import { SingleParticleInterferenceRenderer } from './single-particle-interference-render';

const maximumHits = 1800;
const presets = {
  coherent: { slitSeparation: 6, wavelength: 0.6, coherence: 1 },
  marked: { slitSeparation: 6, wavelength: 0.6, coherence: 0.08 },
  longWave: { slitSeparation: 4.2, wavelength: 1.05, coherence: 1 },
};

export function initSingleParticleInterferenceLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="single-particle-interference"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!root || !canvas) return;

  const english = root.dataset.locale === 'en';
  const renderer = new SingleParticleInterferenceRenderer(canvas, {
    source: english ? 'ONE-PARTICLE SOURCE' : '单粒子源',
    alternatives: english ? 'TWO PATHS' : '两条路径',
    detector: english ? 'DETECTOR' : '探测屏',
    probability: english ? 'predicted probability density' : '预测概率密度',
  });
  const hits: DetectionHit[] = [];
  let emissionRemainder = 0;
  let totalParticleCount = 0;

  const readParameters = (): InterferenceParameters => ({
    slitSeparation: getRangeValue(root, 'slitSeparation', 6),
    wavelength: getRangeValue(root, 'wavelength', 0.6),
    coherence: getRangeValue(root, 'coherence', 1),
  });

  const render = (): void => {
    const parameters = readParameters();
    renderer.draw(parameters, hits);
    setReadout(root, 'particleCount', `${totalParticleCount}`);
    setReadout(root, 'visibility', `${Math.round(parameters.coherence * 100)}%`);
    setReadout(root, 'fringeSpacing', `${formatFixed(fringeSpacing(parameters), 3)} L`);
    setReadout(
      root,
      'regime',
      parameters.coherence > 0.75
        ? english ? 'Coherent' : '相干'
        : parameters.coherence > 0.25
          ? english ? 'Partial' : '部分相干'
          : english ? 'Path marked' : '路径可辨',
    );
  };

  const updateOutputs = (): void => {
    setOutput(root, 'slitSeparation', formatFixed(getRangeValue(root, 'slitSeparation', 6), 1));
    setOutput(root, 'wavelength', formatFixed(getRangeValue(root, 'wavelength', 0.6), 2));
    setOutput(root, 'coherence', formatFixed(getRangeValue(root, 'coherence', 1), 2));
    setOutput(root, 'emissionRate', `${Math.round(getRangeValue(root, 'emissionRate', 55))}/s`);
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    const emissionCount = getRangeValue(root, 'emissionRate', 55) * deltaSeconds + emissionRemainder;
    const wholeParticles = Math.floor(emissionCount);
    emissionRemainder = emissionCount - wholeParticles;
    const parameters = readParameters();
    for (let index = 0; index < wholeParticles; index += 1) {
      hits.push({ normalizedPosition: sampleDetectionPosition(parameters), age: 0 });
    }
    totalParticleCount += wholeParticles;
    hits.forEach((hit) => { hit.age = Math.min(1, hit.age + deltaSeconds * 3); });
    if (hits.length > maximumHits) hits.splice(0, hits.length - maximumHits);
    render();
  });

  bindAction(root, 'toggle', () => {
    if (loop.running) loop.stop();
    else loop.start();
    updatePlayPauseButton(root, loop.running);
  });
  bindAction(root, 'reset', () => {
    loop.stop();
    hits.length = 0;
    emissionRemainder = 0;
    totalParticleCount = 0;
    const preset = presets.coherent;
    Object.entries(preset).forEach(([id, value]) => setRangeValue(root, id, value));
    setRangeValue(root, 'emissionRate', 55);
    updateOutputs();
    render();
    updatePlayPauseButton(root, false);
  });
  bindPresets(root, (presetId) => {
    const preset = presets[presetId as keyof typeof presets];
    if (!preset) return;
    hits.length = 0;
    totalParticleCount = 0;
    Object.entries(preset).forEach(([id, value]) => setRangeValue(root, id, value));
    updateOutputs();
    render();
  });
  onControlInput(root, () => {
    hits.length = 0;
    totalParticleCount = 0;
    updateOutputs();
    render();
  });

  updateOutputs();
  render();
  updatePlayPauseButton(root, false);
}
