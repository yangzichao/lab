export type LaserCavityParameters = {
  cavityLength: number;
  mirrorReflectivity: number;
  pumpRatio: number;
  gainBandwidth: number;
};

export type LaserCavityState = {
  phase: number;
  intracavityPower: number;
};

export type LaserCavitySnapshot = {
  longitudinalModeOrder: number;
  roundTripDetuning: number;
  resonanceFactor: number;
  targetPower: number;
  thresholdLogGain: number;
  state: 'below-threshold' | 'detuned' | 'lasing';
};

function wrappedPhase(phase: number): number {
  return Math.atan2(Math.sin(phase), Math.cos(phase));
}

export function getLaserCavitySnapshot(
  parameters: LaserCavityParameters,
): LaserCavitySnapshot {
  const roundTripPhase = 4 * Math.PI * parameters.cavityLength;
  const longitudinalModeOrder = Math.round(2 * parameters.cavityLength);
  const roundTripDetuning = wrappedPhase(roundTripPhase);
  const coefficient =
    (4 * parameters.mirrorReflectivity)
    / Math.max(1e-6, (1 - parameters.mirrorReflectivity) ** 2);
  const resonanceFactor =
    1 / (1 + coefficient * Math.sin(roundTripDetuning / 2) ** 2);
  const aboveThreshold = Math.max(0, parameters.pumpRatio - 1);
  const targetPower = Math.min(40, aboveThreshold * 42 * resonanceFactor);
  return {
    longitudinalModeOrder,
    roundTripDetuning,
    resonanceFactor,
    targetPower,
    thresholdLogGain: -Math.log(parameters.mirrorReflectivity),
    state:
      parameters.pumpRatio <= 1
        ? 'below-threshold'
        : resonanceFactor < 0.2
          ? 'detuned'
          : 'lasing',
  };
}

export function createLaserCavityState(): LaserCavityState {
  return { phase: 0, intracavityPower: 0.15 };
}

export function stepLaserCavity(
  state: LaserCavityState,
  parameters: LaserCavityParameters,
  deltaSeconds: number,
): LaserCavitySnapshot {
  const snapshot = getLaserCavitySnapshot(parameters);
  const relaxation = 1 - Math.exp(-deltaSeconds * 3.5);
  state.intracavityPower += (snapshot.targetPower - state.intracavityPower) * relaxation;
  state.phase = (state.phase + deltaSeconds * Math.PI * 2 * 0.8) % (Math.PI * 2);
  return snapshot;
}
