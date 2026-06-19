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
import { degreesToRadians, formatFixed, formatSigned } from '../shared/format';
import { setupStageCanvas, type Point } from '../shared/stage';
import {
  createParticleState,
  cyclotronFrequency,
  cyclotronRadius,
  integrate,
  kineticEnergy,
  MINIMUM_MASS,
  speedOf,
  type FieldParameters,
  type ParticleState,
} from './charged-particle-physics';
import { drawChargedParticle, particleScreenPosition } from './charged-particle-render';

const maximumTrailPoints = 720;

// Launch direction (degrees, y down) is fixed so the presets read cleanly; the
// speed slider sets the magnitude.
const launchDirectionRadians = degreesToRadians(0);

type ChargedPreset = {
  charge: number;
  mass: number;
  magneticZ: number;
  electricX: number;
  electricY: number;
  speed: number;
};

const presets: Record<string, ChargedPreset> = {
  // Pure B: a clean circle.
  cyclotron: { charge: 1, mass: 1, magneticZ: 2, electricX: 0, electricY: 0, speed: 14 },
  // Crossed E and B: the loops drift sideways at v = E / B.
  drift: { charge: 1, mass: 1, magneticZ: 2, electricX: 0, electricY: 8, speed: 6 },
  // Pure E: a parabola, like projectile motion.
  accelerate: { charge: 1, mass: 1, magneticZ: 0, electricX: 7, electricY: 0, speed: 8 },
};

export function initChargedParticleLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="charged-particle"]');
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

  const readFields = (): FieldParameters => ({
    charge: getRangeValue(root, 'charge', 1),
    mass: Math.max(MINIMUM_MASS, getRangeValue(root, 'mass', 1)),
    magneticZ: getRangeValue(root, 'magneticZ', 2),
    electricX: getRangeValue(root, 'electricX', 0),
    electricY: getRangeValue(root, 'electricY', 0),
  });

  const buildState = (): ParticleState =>
    createParticleState(0, 0, getRangeValue(root, 'speed', 14), launchDirectionRadians);

  let state = buildState();
  let trail: Point[] = [];

  const updateReadouts = (): void => {
    const fields = readFields();
    const radius = cyclotronRadius(state, fields);
    const frequency = cyclotronFrequency(fields);
    setReadout(root, 'speed', `${formatFixed(speedOf(state), 2)} m/s`);
    setReadout(root, 'radius', radius === null ? '∞' : `${formatFixed(radius, 2)} m`);
    setReadout(root, 'frequency', frequency === null ? '—' : `${formatFixed(frequency, 2)} rad/s`);
    setReadout(root, 'energy', `${formatFixed(kineticEnergy(state, fields), 2)} J`);
  };

  const render = (): void => {
    drawChargedParticle(context, {
      state,
      fields: readFields(),
      trail,
      showTrail: isChecked(root, 'showTrail', true),
      showVectors: isChecked(root, 'showVectors', true),
      showField: isChecked(root, 'showField', true),
    });
    updateReadouts();
  };

  const updateOutputs = (): void => {
    setOutput(root, 'charge', `${formatSigned(getRangeValue(root, 'charge', 1), 1)} C`);
    setOutput(root, 'mass', `${formatFixed(getRangeValue(root, 'mass', 1), 1)} kg`);
    setOutput(root, 'magneticZ', `${formatSigned(getRangeValue(root, 'magneticZ', 2), 1)} T`);
    setOutput(root, 'electricX', formatSigned(getRangeValue(root, 'electricX', 0), 1));
    setOutput(root, 'electricY', formatSigned(getRangeValue(root, 'electricY', 0), 1));
    setOutput(root, 'speed', `${formatFixed(getRangeValue(root, 'speed', 14), 0)} m/s`);
  };

  const reset = (): void => {
    state = buildState();
    trail = [];
    updateOutputs();
    render();
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    state = integrate(state, readFields(), deltaSeconds);
    trail.push(particleScreenPosition(state));
    if (trail.length > maximumTrailPoints) {
      trail.splice(0, trail.length - maximumTrailPoints);
    }
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
    const preset = presets[presetId];
    if (!preset) {
      return;
    }
    setRangeValue(root, 'charge', preset.charge);
    setRangeValue(root, 'mass', preset.mass);
    setRangeValue(root, 'magneticZ', preset.magneticZ);
    setRangeValue(root, 'electricX', preset.electricX);
    setRangeValue(root, 'electricY', preset.electricY);
    setRangeValue(root, 'speed', preset.speed);
    reset();
  });

  onControlInput(root, (input) => {
    const id = input.dataset.control;
    updateOutputs();
    // Changing what the particle starts with restarts the run; field tweaks and
    // view toggles just repaint the current frame.
    if (id === 'speed') {
      reset();
    } else {
      render();
    }
  });

  reset();
  loop.start();
  updatePlayPauseButton(root, true);
}
