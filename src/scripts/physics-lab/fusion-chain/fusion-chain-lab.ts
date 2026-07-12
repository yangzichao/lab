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
import { formatFixed } from '../shared/format';
import { setupStageCanvas } from '../shared/stage';
import {
  advanceFusionStage,
  canRunFusionStage,
  createFusionState,
  formatScientificTemperature,
  fusionStages,
  stepFusionState,
  type FusionParameters,
} from './fusion-chain-physics';
import { drawFusionChainScene } from './fusion-chain-render';

const defaults: FusionParameters = { logTemperature: 7.18, stellarMass: 15, evolutionSpeed: 1 };
const presets: Record<string, Pick<FusionParameters, 'logTemperature' | 'stellarMass'>> = {
  sun: { logTemperature: 7.2, stellarMass: 1 },
  redGiant: { logTemperature: 8.2, stellarMass: 1.2 },
  massiveStar: { logTemperature: 9.2, stellarMass: 15 },
  preCollapse: { logTemperature: 9.5, stellarMass: 25 },
};

export function initFusionChainLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="stellar-fusion-chain"]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!root || !canvas) return;
  const context = setupStageCanvas(canvas);
  if (!context) return;
  const english = document.documentElement.lang.startsWith('en');
  let state = createFusionState();
  const parameters = (): FusionParameters => ({
    logTemperature: getRangeValue(root, 'logTemperature', defaults.logTemperature),
    stellarMass: getRangeValue(root, 'stellarMass', defaults.stellarMass),
    evolutionSpeed: getRangeValue(root, 'evolutionSpeed', defaults.evolutionSpeed),
  });
  const render = (): void => {
    const params = parameters();
    const stage = fusionStages[state.stageIndex];
    const nextStage = fusionStages[Math.min(state.stageIndex + 1, fusionStages.length - 1)];
    const nextAllowed = state.stageIndex === fusionStages.length - 1 || canRunFusionStage(nextStage, params);
    drawFusionChainScene(context, state, params, { showEnergyCurve: isChecked(root, 'showEnergyCurve', true), showShells: isChecked(root, 'showShells', true), english });
    setReadout(root, 'stage', stage.name[english ? 'en' : 'zh']);
    setReadout(root, 'product', stage.product);
    setReadout(root, 'temperatureGate', `≥ ${formatScientificTemperature(stage.minimumTemperature)}`);
    setReadout(root, 'energyDirection', stage.energy === 'released' ? (english ? 'Released by fusion' : '聚变释放') : (english ? 'Released by decay' : '衰变释放'));
    setReadout(root, 'eligibility', nextAllowed ? (english ? 'Next stage available' : '可进入下一阶段') : (english ? 'Next stage blocked' : '下一阶段条件不足'));
  };
  const updateOutputs = (): void => {
    const params = parameters();
    setOutput(root, 'logTemperature', formatScientificTemperature(10 ** params.logTemperature));
    setOutput(root, 'stellarMass', `${formatFixed(params.stellarMass, 1)} M☉`);
    setOutput(root, 'evolutionSpeed', `${formatFixed(params.evolutionSpeed, 1)}×`);
  };
  const loop = createAnimationLoop((deltaSeconds) => {
    const advanced = stepFusionState(state, parameters(), deltaSeconds);
    render();
    if (!advanced && state.reactionProgress < 0.03) {
      loop.stop();
      updatePlayPauseButton(root, false);
    }
    if (state.stageIndex === fusionStages.length - 1 && state.reactionProgress > 0.98) {
      loop.stop();
      updatePlayPauseButton(root, false);
    }
  });
  bindAction(root, 'next', () => {
    advanceFusionStage(state, parameters());
    render();
  });
  bindAction(root, 'toggle', () => {
    if (loop.running) loop.stop(); else loop.start();
    updatePlayPauseButton(root, loop.running);
  });
  bindAction(root, 'reset', () => {
    loop.stop();
    state = createFusionState();
    updatePlayPauseButton(root, false);
    render();
  });
  bindPresets(root, (id) => {
    const preset = presets[id];
    if (!preset) return;
    setRangeValue(root, 'logTemperature', preset.logTemperature);
    setRangeValue(root, 'stellarMass', preset.stellarMass);
    updateOutputs();
    render();
  });
  onControlInput(root, () => { updateOutputs(); render(); });
  updateOutputs();
  render();
}
