import { initChargedParticleLab } from './charged-particle/charged-particle-lab';
import { initCoupledOscillatorsLab } from './coupled-oscillators/coupled-oscillators-lab';
import { initDiffractionLab } from './diffraction/diffraction-lab';
import { initDoublePendulumLab } from './double-pendulum/double-pendulum-lab';
import { initElectricFieldLab } from './electric-field/electric-field-lab';
import { initFourierEpicyclesLab } from './fourier-epicycles/fourier-epicycles-lab';
import { initIdealGasLab } from './ideal-gas/ideal-gas-lab';
import { initLensOpticsLab } from './lens-optics/lens-optics-lab';
import { initOrbitLab } from './orbit/orbit-lab';
import { initThreeBodyLab } from './three-body/three-body-lab';
import { initWaveInterferenceLab } from './wave-interference/wave-lab';

const physicsLabInitializers: Record<string, () => void> = {
  'charged-particle': initChargedParticleLab,
  'coupled-oscillators': initCoupledOscillatorsLab,
  diffraction: initDiffractionLab,
  'double-pendulum': initDoublePendulumLab,
  'electric-field': initElectricFieldLab,
  'fourier-epicycles': initFourierEpicyclesLab,
  'ideal-gas': initIdealGasLab,
  'lens-optics': initLensOpticsLab,
  orbit: initOrbitLab,
  'three-body': initThreeBodyLab,
  'wave-interference': initWaveInterferenceLab,
};

export function initPhysicsLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab]');
  const slug = root?.dataset.lab;
  if (!slug) {
    return;
  }

  physicsLabInitializers[slug]?.();
}
