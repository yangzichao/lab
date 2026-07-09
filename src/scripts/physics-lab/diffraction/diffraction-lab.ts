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
import { clamp, formatFixed } from '../shared/format';
import {
  effectiveSlitCount,
  firstOrderAngleDegrees,
  firstSingleSlitMinimumSinTheta,
  principalMaximumSpacingSinTheta,
  type ApertureMode,
  type DiffractionParameters,
} from './diffraction-physics';
import { DiffractionThreeDimensionalRenderer } from './diffraction-three-dimensional-renderer';

// Wavelength slider is in nanometres (visible band); the diffraction maths needs
// it in the same aperture units as a and d, so we scale nm → aperture units.
const NANOMETRES_TO_APERTURE_UNITS = 1 / 100;
const WAVELENGTH_SWEEP_NM_PER_SECOND = 60;
const WAVELENGTH_MIN_NM = 380;
const WAVELENGTH_MAX_NM = 720;

type DiffractionPreset = {
  mode: ApertureMode;
  slitWidth: number;
  slitSpacing: number;
  slitCount: number;
};

const presets: Record<string, DiffractionPreset> = {
  single: { mode: 'single', slitWidth: 6, slitSpacing: 18, slitCount: 1 },
  double: { mode: 'double', slitWidth: 4, slitSpacing: 18, slitCount: 2 },
  grating: { mode: 'grating', slitWidth: 3, slitSpacing: 16, slitCount: 6 },
};

export function initDiffractionLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="diffraction"]');
  if (!root) {
    return;
  }
  const canvas = root.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!canvas) {
    return;
  }
  const renderer = new DiffractionThreeDimensionalRenderer(canvas);

  // The mode is driven by presets rather than a slider, so the controller keeps
  // it as its own piece of state.
  let mode: ApertureMode = 'single';
  let sweepWavelength = false;
  let sweepDirection = 1;

  const wavelengthNanometres = (): number => getRangeValue(root, 'wavelength', 540);

  const readParameters = (): DiffractionParameters => ({
    mode,
    slitWidth: getRangeValue(root, 'slitWidth', 4),
    slitSpacing: getRangeValue(root, 'slitSpacing', 18),
    slitCount: getRangeValue(root, 'slitCount', 6),
    wavelength: wavelengthNanometres() * NANOMETRES_TO_APERTURE_UNITS,
  });

  const updateReadouts = (parameters: DiffractionParameters): void => {
    const firstMinimum = firstSingleSlitMinimumSinTheta(parameters);
    setReadout(
      root,
      'firstMinimum',
      firstMinimum === null ? '— (none)' : `sin θ = ${formatFixed(firstMinimum, 3)}`,
    );
    const slits = effectiveSlitCount(parameters);
    setReadout(
      root,
      'maximaSpacing',
      slits <= 1 ? '— (single)' : `Δ sin θ = ${formatFixed(principalMaximumSpacingSinTheta(parameters), 3)}`,
    );
    setReadout(root, 'slits', `${slits}`);
    const firstOrderAngle = firstOrderAngleDegrees(parameters);
    setReadout(
      root,
      'firstOrderAngle',
      slits <= 1
        ? '— (single)'
        : firstOrderAngle === null
          ? '— (none)'
          : `θ₁ = ${formatFixed(firstOrderAngle, 1)}°`,
    );
  };

  const render = (): void => {
    const parameters = readParameters();
    renderer.draw({
      parameters,
      wavelengthNanometres: wavelengthNanometres(),
      showEnvelope: isChecked(root, 'showEnvelope', true),
      showScreenBand: isChecked(root, 'showScreenBand', true),
    });
    updateReadouts(parameters);
  };

  const updateOutputs = (): void => {
    setOutput(root, 'slitWidth', `${formatFixed(getRangeValue(root, 'slitWidth', 4), 1)} µ`);
    setOutput(root, 'slitSpacing', `${formatFixed(getRangeValue(root, 'slitSpacing', 18), 1)} µ`);
    setOutput(root, 'slitCount', `${Math.round(getRangeValue(root, 'slitCount', 6))}`);
    setOutput(root, 'wavelength', `${Math.round(wavelengthNanometres())} nm`);
  };

  const reset = (): void => {
    mode = 'single';
    const preset = presets.single;
    setRangeValue(root, 'slitWidth', preset.slitWidth);
    setRangeValue(root, 'slitSpacing', preset.slitSpacing);
    setRangeValue(root, 'slitCount', preset.slitCount);
    setRangeValue(root, 'wavelength', 540);
    updateOutputs();
    render();
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    // Play slowly sweeps the wavelength to show dispersion: the band recolours
    // and the fringe spacing breathes as λ changes.
    let next = wavelengthNanometres() + sweepDirection * WAVELENGTH_SWEEP_NM_PER_SECOND * deltaSeconds;
    if (next >= WAVELENGTH_MAX_NM) {
      next = WAVELENGTH_MAX_NM;
      sweepDirection = -1;
    } else if (next <= WAVELENGTH_MIN_NM) {
      next = WAVELENGTH_MIN_NM;
      sweepDirection = 1;
    }
    setRangeValue(root, 'wavelength', clamp(Math.round(next), WAVELENGTH_MIN_NM, WAVELENGTH_MAX_NM));
    updateOutputs();
    render();
  });

  bindAction(root, 'toggle', () => {
    sweepWavelength = !sweepWavelength;
    if (sweepWavelength) {
      loop.start();
    } else {
      loop.stop();
    }
    updatePlayPauseButton(root, loop.running);
  });
  bindAction(root, 'reset', () => {
    loop.stop();
    sweepWavelength = false;
    sweepDirection = 1;
    updatePlayPauseButton(root, false);
    reset();
  });

  bindPresets(root, (presetId) => {
    const preset = presets[presetId];
    if (!preset) {
      return;
    }
    mode = preset.mode;
    setRangeValue(root, 'slitWidth', preset.slitWidth);
    setRangeValue(root, 'slitSpacing', preset.slitSpacing);
    setRangeValue(root, 'slitCount', preset.slitCount);
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
