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
import { formatFixed, formatSigned } from '../shared/format';
import { setupStageCanvas } from '../shared/stage';
import {
  createLaserCavityState,
  getLaserCavitySnapshot,
  stepLaserCavity,
  type LaserCavityParameters,
} from './laser-cavity-physics';
import { drawLaserCavityScene } from './laser-cavity-render';

const defaults: LaserCavityParameters = { cavityLength: 12, mirrorReflectivity: 0.96, pumpRatio: 1.35, gainBandwidth: 3 };
const presets: Record<string, LaserCavityParameters> = {
  resonant: defaults,
  detuned: { ...defaults, cavityLength: 12.23 },
  belowThreshold: { ...defaults, pumpRatio: 0.72 },
};

export function initLaserCavityLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="laser-resonant-cavity"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!root || !canvas) return;
  const context = setupStageCanvas(canvas);
  if (!context) return;
  const english = document.documentElement.lang.startsWith('en');
  let state = createLaserCavityState();
  const parameters = (): LaserCavityParameters => ({
    cavityLength: getRangeValue(root, 'cavityLength', defaults.cavityLength),
    mirrorReflectivity: getRangeValue(root, 'mirrorReflectivity', defaults.mirrorReflectivity),
    pumpRatio: getRangeValue(root, 'pumpRatio', defaults.pumpRatio),
    gainBandwidth: getRangeValue(root, 'gainBandwidth', defaults.gainBandwidth),
  });
  const stateLabel = (stateName: ReturnType<typeof getLaserCavitySnapshot>['state']): string => {
    if (stateName === 'lasing') return english ? 'Lasing mode selected' : '激光模式建立';
    if (stateName === 'detuned') return english ? 'Off resonance' : '偏离共振';
    return english ? 'Below threshold' : '低于阈值';
  };
  const render = (): void => {
    const params = parameters();
    const snapshot = getLaserCavitySnapshot(params);
    drawLaserCavityScene(context, params, state, snapshot, { showTravelingWaves: isChecked(root, 'showTravelingWaves', true), showModeSpectrum: isChecked(root, 'showModeSpectrum', true), english });
    setReadout(root, 'modeOrder', String(snapshot.longitudinalModeOrder));
    setReadout(root, 'detuning', `${formatSigned(snapshot.roundTripDetuning, 2)} rad`);
    setReadout(root, 'threshold', `gₜₕL = ${formatFixed(snapshot.thresholdLogGain, 3)}`);
    setReadout(root, 'intracavityPower', `${formatFixed(state.intracavityPower, 1)} a.u.`);
    setReadout(root, 'laserState', stateLabel(snapshot.state));
  };
  const updateOutputs = (): void => {
    const params = parameters();
    setOutput(root, 'cavityLength', `${formatFixed(params.cavityLength, 2)} λ`);
    setOutput(root, 'mirrorReflectivity', `${formatFixed(params.mirrorReflectivity * 100, 1)}%`);
    setOutput(root, 'pumpRatio', `${formatFixed(params.pumpRatio, 2)}×`);
    setOutput(root, 'gainBandwidth', `${formatFixed(params.gainBandwidth, 1)} modes`);
  };
  const loop = createAnimationLoop((deltaSeconds) => {
    stepLaserCavity(state, parameters(), deltaSeconds);
    render();
  });
  const reset = (): void => {
    state = createLaserCavityState();
    render();
  };
  bindAction(root, 'toggle', () => {
    if (loop.running) loop.stop(); else loop.start();
    updatePlayPauseButton(root, loop.running);
  });
  bindAction(root, 'reset', reset);
  bindPresets(root, (id) => {
    const preset = presets[id];
    if (!preset) return;
    Object.entries(preset).forEach(([key, value]) => setRangeValue(root, key, value));
    state = createLaserCavityState();
    updateOutputs();
    render();
  });
  onControlInput(root, () => { updateOutputs(); render(); });
  updateOutputs();
  render();
  loop.start();
}
