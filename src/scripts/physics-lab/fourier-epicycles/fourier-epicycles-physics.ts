// Fourier-series synthesis with no DOM. A periodic target wave is written as a
// sum of pure rotations: each term is a vector of length |amplitude| spinning at
// angular frequency n·ω. Stack the vectors tip-to-tail and the chain's final tip
// traces the wave — the classic "epicycles draw a shape" picture (3b1b).
//
// We use the sine series of three odd/standard textbook waves, so every term is
//   amplitude · sin(n·ω·t + phase)
// with phase 0 (these particular series are pure sines). The vertical projection
// of the tip equals the synthesised value at time t.

export type WaveformKind = 'square' | 'sawtooth' | 'triangle';

// How many harmonics stand in for the "ideal" infinite series when drawing the
// muted dashed target curve. Kept modest: with 240 samples across the window a
// much higher count aliases into a fake sawtooth on the target's flat tops.
export const REFERENCE_HARMONIC_COUNT = 96;

// One rotating vector (epicycle). `harmonic` is n (the integer multiple of the
// base frequency ω), `amplitude` is signed so the projection direction is right.
export type Harmonic = {
  harmonic: number;
  amplitude: number;
  phase: number;
};

// One link of the tip-to-tail chain, evaluated at a given time.
export type ChainLink = {
  harmonic: number;
  amplitude: number;
  angle: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

// Build the first `count` non-zero harmonics of the chosen waveform. Closed-form
// coefficients straight from the Fourier sine series of each classic wave.
export function buildHarmonics(kind: WaveformKind, count: number): Harmonic[] {
  const harmonics: Harmonic[] = [];
  const safeCount = Math.max(1, Math.round(count));

  if (kind === 'square') {
    // (4/π) Σ_{n=1,3,5,…} (1/n) sin(nωt)
    for (let index = 0; index < safeCount; index += 1) {
      const n = 2 * index + 1;
      harmonics.push({ harmonic: n, amplitude: (4 / Math.PI) * (1 / n), phase: 0 });
    }
    return harmonics;
  }

  if (kind === 'sawtooth') {
    // (2/π) Σ_{n=1,2,3,…} (−1)^{n+1} (1/n) sin(nωt)
    for (let index = 0; index < safeCount; index += 1) {
      const n = index + 1;
      const sign = (n + 1) % 2 === 0 ? 1 : -1;
      harmonics.push({ harmonic: n, amplitude: (2 / Math.PI) * sign * (1 / n), phase: 0 });
    }
    return harmonics;
  }

  // triangle: (8/π²) Σ_{n=1,3,5,…} (−1)^{(n−1)/2} (1/n²) sin(nωt)
  for (let index = 0; index < safeCount; index += 1) {
    const n = 2 * index + 1;
    const sign = (index % 2 === 0) ? 1 : -1;
    harmonics.push({ harmonic: n, amplitude: (8 / (Math.PI * Math.PI)) * sign * (1 / (n * n)), phase: 0 });
  }
  return harmonics;
}

// The synthesised value f(t) = Σ amplitude · sin(nωt + phase). This is exactly
// the vertical displacement reached by the tip-to-tail chain at time t.
export function synthesizeValue(harmonics: Harmonic[], baseFrequency: number, time: number): number {
  let total = 0;
  for (const term of harmonics) {
    total += term.amplitude * Math.sin(term.harmonic * baseFrequency * time + term.phase);
  }
  return total;
}

// Walk the rotating vectors tip-to-tail starting from `origin`, returning each
// link plus the final tip. Each vector points at angle (nωt + phase); a positive
// amplitude with a sine term means the *vertical* component is amplitude·sin(…),
// so we draw the vector as (cos·amp horizontal, sin·amp vertical). Screen y grows
// downward, so the caller subtracts to put "up" on top — but the math here keeps
// the projection consistent with synthesizeValue.
export function buildChain(
  harmonics: Harmonic[],
  baseFrequency: number,
  time: number,
  origin: { x: number; y: number },
): { links: ChainLink[]; tip: { x: number; y: number } } {
  const links: ChainLink[] = [];
  let current = { x: origin.x, y: origin.y };

  for (const term of harmonics) {
    const angle = term.harmonic * baseFrequency * time + term.phase;
    // Horizontal carries cos so the chain swings sideways; vertical carries sin so
    // the tip's vertical offset equals amplitude·sin(angle) — the synthesised term.
    const next = {
      x: current.x + term.amplitude * Math.cos(angle),
      y: current.y + term.amplitude * Math.sin(angle),
    };
    links.push({
      harmonic: term.harmonic,
      amplitude: term.amplitude,
      angle,
      from: { x: current.x, y: current.y },
      to: { x: next.x, y: next.y },
    });
    current = next;
  }

  return { links, tip: current };
}

// Sample the ideal waveform (infinite series truncated at REFERENCE_HARMONIC_COUNT)
// across one or more periods, for drawing the muted dashed target curve.
export function sampleTargetWave(
  kind: WaveformKind,
  baseFrequency: number,
  startTime: number,
  endTime: number,
  sampleCount: number,
): { time: number; value: number }[] {
  const referenceHarmonics = buildHarmonics(kind, REFERENCE_HARMONIC_COUNT);
  const samples: { time: number; value: number }[] = [];
  const span = endTime - startTime;
  for (let index = 0; index <= sampleCount; index += 1) {
    const time = startTime + (span * index) / sampleCount;
    samples.push({ time, value: synthesizeValue(referenceHarmonics, baseFrequency, time) });
  }
  return samples;
}
