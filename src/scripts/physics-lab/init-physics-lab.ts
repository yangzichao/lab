type PhysicsLabInitializer = () => Promise<void>;

// Keep every lab behind its own dynamic import. The Three.js renderers are
// intentionally route-scoped so a visitor downloads only the active scene.
const physicsLabInitializers: Record<string, PhysicsLabInitializer> = {
  'charged-particle': async () => {
    const { initChargedParticleLab } = await import(
      './charged-particle/charged-particle-lab'
    );
    initChargedParticleLab();
  },
  'coupled-oscillators': async () => {
    const { initCoupledOscillatorsLab } = await import(
      './coupled-oscillators/coupled-oscillators-lab'
    );
    initCoupledOscillatorsLab();
  },
  diffraction: async () => {
    const { initDiffractionLab } = await import('./diffraction/diffraction-lab');
    initDiffractionLab();
  },
  'double-pendulum': async () => {
    const { initDoublePendulumLab } = await import('./double-pendulum/double-pendulum-lab');
    initDoublePendulumLab();
  },
  'electric-field': async () => {
    const { initElectricFieldLab } = await import('./electric-field/electric-field-lab');
    initElectricFieldLab();
  },
  'fourier-epicycles': async () => {
    const { initFourierEpicyclesLab } = await import(
      './fourier-epicycles/fourier-epicycles-lab'
    );
    initFourierEpicyclesLab();
  },
  'ideal-gas': async () => {
    const { initIdealGasLab } = await import('./ideal-gas/ideal-gas-lab');
    initIdealGasLab();
  },
  'lens-optics': async () => {
    const { initLensOpticsLab } = await import('./lens-optics/lens-optics-lab');
    initLensOpticsLab();
  },
  'ligo-interferometer': async () => {
    const { initLigoLab } = await import('./ligo/ligo-lab');
    initLigoLab();
  },
  orbit: async () => {
    const { initOrbitLab } = await import('./orbit/orbit-lab');
    initOrbitLab();
  },
  'three-body': async () => {
    const { initThreeBodyLab } = await import('./three-body/three-body-lab');
    initThreeBodyLab();
  },
  'wave-interference': async () => {
    const { initWaveInterferenceLab } = await import('./wave-interference/wave-lab');
    initWaveInterferenceLab();
  },
};

export async function initPhysicsLab(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-lab]');
  const slug = root?.dataset.lab;
  if (!slug) {
    return;
  }

  await physicsLabInitializers[slug]?.();
}
