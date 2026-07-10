import { clamp } from '../../shared/format';

export type InterferenceParameters = {
  slitSeparation: number;
  wavelength: number;
  coherence: number;
};

export type DetectionHit = {
  normalizedPosition: number;
  age: number;
};

export function interferenceIntensity(
  normalizedPosition: number,
  parameters: InterferenceParameters,
): number {
  const position = clamp(normalizedPosition, -1, 1);
  const envelope = Math.exp(-2.2 * position ** 2);
  // The visible detector spans ±(L / 7.5). Mapping the normalized canvas
  // coordinate back to physical screen position keeps Δy = λL/d while the
  // viewport still shows a readable number of fringes.
  const phase =
    (2 * Math.PI * parameters.slitSeparation * position) /
    Math.max(parameters.wavelength * 7.5, 0.01);
  return envelope * (1 + parameters.coherence * Math.cos(phase)) / 2;
}

export function fringeSpacing(parameters: InterferenceParameters): number {
  return parameters.wavelength / Math.max(parameters.slitSeparation, 0.01);
}

export function sampleDetectionPosition(
  parameters: InterferenceParameters,
  random: () => number = Math.random,
): number {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const candidate = random() * 2 - 1;
    if (random() <= interferenceIntensity(candidate, parameters)) {
      return candidate;
    }
  }
  return random() * 2 - 1;
}
