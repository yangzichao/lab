type QuantumLabInitializer = () => Promise<void>;

const quantumLabInitializers: Record<string, QuantumLabInitializer> = {
  'qubit-state': async () => {
    const { initQubitStateLab } = await import('./qubit-state/qubit-state-lab');
    initQubitStateLab();
  },
  'single-particle-interference': async () => {
    const { initSingleParticleInterferenceLab } = await import(
      './single-particle-interference/single-particle-interference-lab'
    );
    initSingleParticleInterferenceLab();
  },
  'field-modes': async () => {
    const { initFieldModesLab } = await import('./field-modes/field-modes-lab');
    initFieldModesLab();
  },
};

export async function initQuantumLab(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-lab-suite="quantum"]');
  const slug = root?.dataset.lab;
  if (!slug) {
    return;
  }

  await quantumLabInitializers[slug]?.();
}
