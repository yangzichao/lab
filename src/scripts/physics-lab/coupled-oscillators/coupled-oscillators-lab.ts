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
  activeModes,
  beadDisplacements,
  beadVelocities,
  createConfigurationFromModes,
  dominantSingleMode,
  modeFrequency,
  totalEnergy,
  type ChainConfiguration,
} from './coupled-oscillators-physics';
import { drawCoupledOscillators } from './coupled-oscillators-render';

// Each preset describes which modes to excite and with what amplitude, plus an
// optional bead count it forces first. The amplitudes are chosen so the chain
// swings noticeably without leaving the stage. "beats" needs two *nearly equal*
// frequencies, and the dispersion ωₚ = 2√(k/m)·sin(pπ/(2(N+1))) only flattens at
// the Brillouin-zone edge — so it pushes N up to 12 and excites the top adjacent
// pair p = N−1 and p = N (ω ratio ≈ 1.02). The two close frequencies interfere
// into a slow amplitude envelope that waxes and wanes: the classic beat.
type Preset = {
  beadCount?: number;
  modes: Record<number, number>;
};

const presets: Record<string, Preset> = {
  mode1: { modes: { 1: 0.9 } },
  mode2: { modes: { 2: 0.9 } },
  mode3: { modes: { 3: 0.9 } },
  beats: { beadCount: 12, modes: { 11: 0.7, 12: 0.7 } },
};

const defaultPreset = 'mode1';
const defaultBeadCount = 6;

export function initCoupledOscillatorsLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="coupled-oscillators"]');
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

  let beadCount = defaultBeadCount;
  let selectedPreset = defaultPreset;
  let configuration: ChainConfiguration = createConfigurationFromModes(beadCount, presets[defaultPreset].modes);
  let elapsedSeconds = 0;

  const timeScale = (): number => getRangeValue(root, 'speed', 1);

  // Signed amplitude cₚ·cos(ωₚ·t) for each currently active mode, in the same
  // order as activeModes — this is what the envelope overlay breathes with.
  const envelopeAmplitudesNow = (modeNumbers: number[]): number[] =>
    modeNumbers.map((modeNumber) => {
      const baseAmplitude = configuration.modalAmplitudes[modeNumber - 1] ?? 0;
      return baseAmplitude * Math.cos(modeFrequency(modeNumber, beadCount) * elapsedSeconds);
    });

  const updateReadouts = (): void => {
    const single = dominantSingleMode(configuration);
    setReadout(root, 'count', String(beadCount));
    setReadout(root, 'mode', single === null ? 'mixed' : `p = ${single}`);
    setReadout(
      root,
      'frequency',
      single === null ? '—' : `${formatFixed(modeFrequency(single, beadCount), 3)} rad/s`,
    );
    setReadout(root, 'energy', formatFixed(totalEnergy(configuration), 3));
  };

  const render = (): void => {
    const modeNumbers = activeModes(configuration);
    drawCoupledOscillators(context, {
      beadCount,
      displacements: beadDisplacements(configuration, elapsedSeconds),
      velocities: beadVelocities(configuration, elapsedSeconds),
      activeModeNumbers: modeNumbers,
      envelopeAmplitudes: envelopeAmplitudesNow(modeNumbers),
      showEnvelopes: isChecked(root, 'showEnvelopes', true),
      showSprings: isChecked(root, 'showSprings', true),
    });
    updateReadouts();
  };

  const updateOutputs = (): void => {
    setOutput(root, 'count', String(beadCount));
    setOutput(root, 'speed', `${formatFixed(timeScale(), 2)}×`);
  };

  // Rebuild the chain from the current bead count + selected preset, back to t=0.
  // Modes the preset asks for that don't exist at the current N are simply
  // dropped (createConfigurationFromModes ignores entries beyond beadCount).
  const rebuild = (): void => {
    const preset = presets[selectedPreset] ?? presets[defaultPreset];
    beadCount = Math.round(getRangeValue(root, 'count', defaultBeadCount));
    configuration = createConfigurationFromModes(beadCount, preset.modes);
    elapsedSeconds = 0;
    updateOutputs();
    render();
  };

  // Apply a preset: if it forces a specific N (e.g. "beats" needs N=12 so its top
  // adjacent modes p=11,12 exist and sit close in frequency for a slow beat),
  // sync the count slider first — its input event flows through onControlInput,
  // which rebuilds the chain. Otherwise rebuild with the current N.
  const applyPreset = (): void => {
    const preset = presets[selectedPreset] ?? presets[defaultPreset];
    const currentCount = Math.round(getRangeValue(root, 'count', defaultBeadCount));
    if (preset.beadCount !== undefined && preset.beadCount !== currentCount) {
      setRangeValue(root, 'count', preset.beadCount);
    } else {
      rebuild();
    }
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    elapsedSeconds += deltaSeconds * timeScale();
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
    if (!presets[presetId]) {
      return;
    }
    selectedPreset = presetId;
    applyPreset();
  });

  onControlInput(root, (input) => {
    const id = input.dataset.control;
    updateOutputs();
    if (id === 'count') {
      rebuild();
    } else {
      render();
    }
  });

  rebuild();
  loop.start();
  updatePlayPauseButton(root, true);
}
