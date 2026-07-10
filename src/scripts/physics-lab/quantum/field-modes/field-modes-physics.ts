export type FieldModeParameters = {
  modeNumber: number;
  occupationNumber: number;
};

export type FieldModeReading = {
  angularFrequency: number;
  wavelengthInBoxLengths: number;
  energyInHbarOmega: number;
  uncertaintyScale: number;
};

export function calculateFieldMode(
  parameters: FieldModeParameters,
): FieldModeReading {
  const modeNumber = Math.max(1, Math.round(parameters.modeNumber));
  const occupationNumber = Math.max(0, Math.round(parameters.occupationNumber));

  return {
    angularFrequency: modeNumber,
    wavelengthInBoxLengths: 2 / modeNumber,
    energyInHbarOmega: occupationNumber + 0.5,
    uncertaintyScale: Math.sqrt(occupationNumber + 0.5) / Math.sqrt(modeNumber),
  };
}

export function modeFunction(modeNumber: number, normalizedPosition: number): number {
  return Math.sin(Math.max(1, Math.round(modeNumber)) * Math.PI * normalizedPosition);
}
