import {
  bindAction,
  bindPresets,
  getRangeValue,
  isChecked,
  onControlInput,
  setOutput,
  setRangeValue,
  setReadout,
} from '../shared/dom-controls';
import { createAnimationLoop } from '../shared/animation-loop';
import { formatFixed, formatSigned } from '../shared/format';
import { setupStageCanvas } from '../shared/stage';
import { solveThickLens, type ThickLensParameters } from './thick-lens-physics';
import { drawThickLensScene } from './thick-lens-render';

const defaults: ThickLensParameters = { lensThickness: 28, objectDepth: 30, objectDistance: 260, refractiveIndex: 1.52, frontRadius: 110, rearRadius: -110 };
const presets: Record<string, ThickLensParameters> = {
  camera: defaults,
  ballLens: { lensThickness: 55, objectDepth: 30, objectDistance: 230, refractiveIndex: 1.62, frontRadius: 72, rearRadius: -72 },
  flatBack: { lensThickness: 22, objectDepth: 50, objectDistance: 300, refractiveIndex: 1.52, frontRadius: 95, rearRadius: -180 },
};

export function initThickLensLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="thick-lens-refraction"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!root || !canvas) return;
  const context = setupStageCanvas(canvas);
  if (!context) return;
  const english = document.documentElement.lang.startsWith('en');
  let visualPhase = 0;
  const parameters = (): ThickLensParameters => ({
    lensThickness: getRangeValue(root, 'lensThickness', defaults.lensThickness),
    objectDepth: getRangeValue(root, 'objectDepth', defaults.objectDepth),
    objectDistance: getRangeValue(root, 'objectDistance', defaults.objectDistance),
    refractiveIndex: getRangeValue(root, 'refractiveIndex', defaults.refractiveIndex),
    frontRadius: getRangeValue(root, 'frontRadius', defaults.frontRadius),
    rearRadius: getRangeValue(root, 'rearRadius', defaults.rearRadius),
  });
  const updateOutputs = (): void => {
    const value = parameters();
    setOutput(root, 'lensThickness', `${value.lensThickness.toFixed(0)} mm`);
    setOutput(root, 'objectDepth', `${value.objectDepth.toFixed(0)} mm`);
    setOutput(root, 'objectDistance', `${value.objectDistance.toFixed(0)} mm`);
    setOutput(root, 'refractiveIndex', value.refractiveIndex.toFixed(2));
    setOutput(root, 'frontRadius', `${formatSigned(value.frontRadius, 0)} mm`);
    setOutput(root, 'rearRadius', `${formatSigned(value.rearRadius, 0)} mm`);
  };
  const render = (): void => {
    const value = parameters();
    const solution = solveThickLens(value);
    drawThickLensScene(context, value, solution, { showNormals: isChecked(root, 'showNormals', true), showParaxial: isChecked(root, 'showParaxial', true), english, phase: visualPhase });
    const nearDistance = solution.nearBundle.image?.x;
    const farDistance = solution.farBundle.image?.x;
    setReadout(root, 'effectiveFocalLength', `${formatFixed(solution.effectiveFocalLength, 0)} mm`);
    setReadout(root, 'frontImage', nearDistance === undefined ? '—' : `${formatSigned(nearDistance - value.lensThickness, 0)} mm`);
    setReadout(root, 'rearImage', farDistance === undefined ? '—' : `${formatSigned(farDistance - value.lensThickness, 0)} mm`);
    setReadout(root, 'imageDepth', nearDistance === undefined || farDistance === undefined ? '—' : `${formatFixed(Math.abs(farDistance - nearDistance), 1)} mm`);
    setReadout(root, 'rayStatus', english ? `${solution.transmittedRayCount} rays transmitted` : `${solution.transmittedRayCount} 条光线透射`);
  };
  const reset = (): void => {
    Object.entries(defaults).forEach(([key, value]) => setRangeValue(root, key, value));
    updateOutputs();
    render();
  };
  bindAction(root, 'reset', reset);
  bindPresets(root, (id) => {
    const preset = presets[id];
    if (!preset) return;
    Object.entries(preset).forEach(([key, value]) => setRangeValue(root, key, value));
    updateOutputs();
    render();
  });
  onControlInput(root, () => { updateOutputs(); render(); });
  updateOutputs();
  render();
  createAnimationLoop((deltaSeconds) => {
    visualPhase = (visualPhase + deltaSeconds) % 1000;
    render();
  }).start();
}
