// Normal-mode dynamics of a 1-D spring chain: N equal masses in a row, every
// mass tied to its neighbours and the two end masses tied to fixed walls by an
// identical spring. We follow the transverse displacement yᵢ of each mass.
//
// The trick that keeps the motion energy-perfect is to never integrate. A chain
// of N masses has exactly N normal modes; mode p has the spatial shape
//   Aᵢ⁽ᵖ⁾ ∝ sin(p·π·i / (N+1)),   i = 1..N
// and oscillates at the single frequency
//   ωₚ = 2·√(k/m)·sin(p·π / (2(N+1))).
// Project the initial displacement onto this (orthogonal) sine basis to get a
// modal amplitude cₚ for each mode, evolve each mode analytically as
// cₚ·cos(ωₚ·t), then reconstruct the masses every frame. No numerical damping,
// no drift — energy is conserved exactly and each mode stays pure.

export const SPRING_CONSTANT = 1; // k
export const MASS = 1; // m

export type ChainConfiguration = {
  beadCount: number; // N
  // Modal amplitudes cₚ for p = 1..N (index 0 is mode 1). These are fixed once
  // the initial state is set; only their cosine phase advances with time.
  modalAmplitudes: number[];
};

// Spatial shape of mode p (1-based) sampled at bead i (1-based), beadCount = N.
export function modeShape(modeNumber: number, beadIndex: number, beadCount: number): number {
  return Math.sin((modeNumber * Math.PI * beadIndex) / (beadCount + 1));
}

// Angular frequency of mode p (1-based) for a chain of N beads.
export function modeFrequency(modeNumber: number, beadCount: number): number {
  return 2 * Math.sqrt(SPRING_CONSTANT / MASS) * Math.sin((modeNumber * Math.PI) / (2 * (beadCount + 1)));
}

// Build a configuration directly from a chosen set of modal amplitudes. Any
// entry beyond beadCount is ignored; missing entries default to 0.
export function createConfigurationFromModes(
  beadCount: number,
  amplitudesByMode: Record<number, number>,
): ChainConfiguration {
  const modalAmplitudes: number[] = [];
  for (let modeNumber = 1; modeNumber <= beadCount; modeNumber += 1) {
    modalAmplitudes.push(amplitudesByMode[modeNumber] ?? 0);
  }
  return { beadCount, modalAmplitudes };
}

// Reconstruct every bead's transverse displacement at time t:
//   yᵢ(t) = Σₚ cₚ·cos(ωₚ·t)·sin(p·π·i / (N+1))
// Returns an array of length N (bead i = 1..N maps to index i-1).
export function beadDisplacements(configuration: ChainConfiguration, timeSeconds: number): number[] {
  const { beadCount, modalAmplitudes } = configuration;
  const displacements: number[] = [];
  for (let beadIndex = 1; beadIndex <= beadCount; beadIndex += 1) {
    let sum = 0;
    for (let modeNumber = 1; modeNumber <= beadCount; modeNumber += 1) {
      const amplitude = modalAmplitudes[modeNumber - 1];
      if (amplitude === 0) {
        continue;
      }
      sum +=
        amplitude *
        Math.cos(modeFrequency(modeNumber, beadCount) * timeSeconds) *
        modeShape(modeNumber, beadIndex, beadCount);
    }
    displacements.push(sum);
  }
  return displacements;
}

// Transverse velocity of every bead at time t (derivative of the reconstruction):
//   ẏᵢ(t) = Σₚ -cₚ·ωₚ·sin(ωₚ·t)·sin(p·π·i / (N+1))
export function beadVelocities(configuration: ChainConfiguration, timeSeconds: number): number[] {
  const { beadCount, modalAmplitudes } = configuration;
  const velocities: number[] = [];
  for (let beadIndex = 1; beadIndex <= beadCount; beadIndex += 1) {
    let sum = 0;
    for (let modeNumber = 1; modeNumber <= beadCount; modeNumber += 1) {
      const amplitude = modalAmplitudes[modeNumber - 1];
      if (amplitude === 0) {
        continue;
      }
      const frequency = modeFrequency(modeNumber, beadCount);
      sum += -amplitude * frequency * Math.sin(frequency * timeSeconds) * modeShape(modeNumber, beadIndex, beadCount);
    }
    velocities.push(sum);
  }
  return velocities;
}

// Total energy is a constant of motion. In the modal basis the modes are
// independent harmonic oscillators with effective mass M = m·(N+1)/2 (from the
// sine basis normalisation Σᵢ sin²(pπi/(N+1)) = (N+1)/2). The energy of mode p
// is ½·M·ωₚ²·cₚ², and the total is the sum — time-independent, which makes it a
// clean conservation check on screen.
export function totalEnergy(configuration: ChainConfiguration): number {
  const { beadCount, modalAmplitudes } = configuration;
  const effectiveMass = (MASS * (beadCount + 1)) / 2;
  let energy = 0;
  for (let modeNumber = 1; modeNumber <= beadCount; modeNumber += 1) {
    const amplitude = modalAmplitudes[modeNumber - 1];
    if (amplitude === 0) {
      continue;
    }
    const frequency = modeFrequency(modeNumber, beadCount);
    energy += 0.5 * effectiveMass * frequency * frequency * amplitude * amplitude;
  }
  return energy;
}

// Which single mode is excited, or null when it is a mixture. Used for the
// readout and for deciding whether to draw a single clean envelope.
export function dominantSingleMode(configuration: ChainConfiguration): number | null {
  let active = 0;
  let activeMode = 0;
  for (let modeNumber = 1; modeNumber <= configuration.beadCount; modeNumber += 1) {
    if (Math.abs(configuration.modalAmplitudes[modeNumber - 1] ?? 0) > 1e-9) {
      active += 1;
      activeMode = modeNumber;
    }
  }
  return active === 1 ? activeMode : null;
}

// Modes carrying non-negligible amplitude (1-based), for drawing each envelope.
export function activeModes(configuration: ChainConfiguration): number[] {
  const modes: number[] = [];
  for (let modeNumber = 1; modeNumber <= configuration.beadCount; modeNumber += 1) {
    if (Math.abs(configuration.modalAmplitudes[modeNumber - 1] ?? 0) > 1e-9) {
      modes.push(modeNumber);
    }
  }
  return modes;
}
