import { degreesToRadians } from '../../shared/format';

export type QubitStateParameters = {
  thetaDegrees: number;
  phaseDegrees: number;
  basisDegrees: number;
};

export type QubitStateReading = {
  amplitudeZero: number;
  amplitudeOne: number;
  probabilityZero: number;
  probabilityOne: number;
  probabilityPlus: number;
  probabilityMinus: number;
  bloch: { x: number; y: number; z: number };
};

export function normalizeDegrees(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

export function calculateQubitState(
  parameters: QubitStateParameters,
): QubitStateReading {
  const theta = degreesToRadians(parameters.thetaDegrees);
  const phase = degreesToRadians(parameters.phaseDegrees);
  const basis = degreesToRadians(parameters.basisDegrees);
  const amplitudeZero = Math.cos(theta / 2);
  const amplitudeOne = Math.sin(theta / 2);
  const probabilityZero = amplitudeZero ** 2;
  const probabilityOne = amplitudeOne ** 2;
  const probabilityPlus =
    (1 + Math.sin(theta) * Math.cos(phase - basis)) / 2;

  return {
    amplitudeZero,
    amplitudeOne,
    probabilityZero,
    probabilityOne,
    probabilityPlus,
    probabilityMinus: 1 - probabilityPlus,
    bloch: {
      x: Math.sin(theta) * Math.cos(phase),
      y: Math.sin(theta) * Math.sin(phase),
      z: Math.cos(theta),
    },
  };
}
