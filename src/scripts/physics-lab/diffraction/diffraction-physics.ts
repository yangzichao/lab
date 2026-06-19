// Fraunhofer (far-field) diffraction. Everything here is pure math — no DOM, no
// canvas — so the renderer and controller can sample intensities freely.
//
// We sweep the diffraction angle θ and parameterise by u = sinθ. With slit width
// a, slit spacing d, slit count N, and wavelength λ (all in the same length unit):
//
//   β = (π·a/λ)·sinθ        — half phase across a single slit
//   δ = (π·d/λ)·sinθ        — half phase between adjacent slits
//
//   single  : I/I₀ = sinc²(β)
//   double  : I/I₀ = sinc²(β)·cos²(δ)
//   grating : I/I₀ = sinc²(β)·[ sin(Nδ) / (N·sin δ) ]²
//
// where sinc(x) = sin(x)/x (→ 1 as x → 0). The bracket → 1 as δ → 0, so every
// pattern is already normalised to a peak of 1 at θ = 0.

export type ApertureMode = 'single' | 'double' | 'grating';

export type DiffractionParameters = {
  mode: ApertureMode;
  slitWidth: number; // a, aperture units
  slitSpacing: number; // d, aperture units
  slitCount: number; // N, used by the grating mode
  wavelength: number; // λ, aperture units
};

// Effective number of slits for the active mode: single → 1, double → 2,
// grating → the chosen N. Lets the controller and renderer share one truth.
export function effectiveSlitCount(parameters: DiffractionParameters): number {
  if (parameters.mode === 'single') {
    return 1;
  }
  if (parameters.mode === 'double') {
    return 2;
  }
  return Math.max(2, Math.round(parameters.slitCount));
}

// sin(x)/x with the removable singularity at 0 filled in.
export function sinc(x: number): number {
  if (Math.abs(x) < 1e-9) {
    return 1;
  }
  return Math.sin(x) / x;
}

// Single-slit envelope sinc²(β). The renderer overlays this dashed to show how
// it modulates the finer multi-slit fringes.
export function singleSlitEnvelope(sinTheta: number, parameters: DiffractionParameters): number {
  const beta = (Math.PI * parameters.slitWidth * sinTheta) / parameters.wavelength;
  const s = sinc(beta);
  return s * s;
}

// Multi-slit (grating) interference factor [ sin(Nδ) / (N·sin δ) ]², normalised
// to a peak of 1. N = 1 collapses to a flat 1 (a single slit has no interference
// factor, only its envelope).
export function multiSlitFactor(sinTheta: number, parameters: DiffractionParameters): number {
  const slits = effectiveSlitCount(parameters);
  if (slits <= 1) {
    return 1;
  }
  const delta = (Math.PI * parameters.slitSpacing * sinTheta) / parameters.wavelength;
  const sinDelta = Math.sin(delta);
  if (Math.abs(sinDelta) < 1e-9) {
    // δ → mπ: both numerator and denominator vanish; the limit is 1 (a principal
    // maximum, where every slit is in phase).
    return 1;
  }
  const ratio = Math.sin(slits * delta) / (slits * sinDelta);
  return ratio * ratio;
}

// Full relative intensity I/I₀ for the active mode, peak normalised to 1.
export function relativeIntensity(sinTheta: number, parameters: DiffractionParameters): number {
  return singleSlitEnvelope(sinTheta, parameters) * multiSlitFactor(sinTheta, parameters);
}

// First single-slit minimum: sinc²(β) = 0 first at β = π, i.e. sinθ = λ/a.
// Returns null when no real minimum exists in [-1, 1] (a so wide the first zero
// would need |sinθ| > 1).
export function firstSingleSlitMinimumSinTheta(parameters: DiffractionParameters): number | null {
  const value = parameters.wavelength / parameters.slitWidth;
  return value <= 1 ? value : null;
}

// Spacing between adjacent principal maxima in sinθ: d·sinθ = mλ ⇒ Δ(sinθ) = λ/d.
export function principalMaximumSpacingSinTheta(parameters: DiffractionParameters): number {
  return parameters.wavelength / parameters.slitSpacing;
}

// First-order diffraction angle θ₁ in degrees, from d·sinθ = λ (m = 1). Returns
// null when λ/d > 1, i.e. no real first order exists (slits too close together).
export function firstOrderAngleDegrees(parameters: DiffractionParameters): number | null {
  const sinTheta = parameters.wavelength / parameters.slitSpacing;
  if (sinTheta > 1) {
    return null;
  }
  return (Math.asin(sinTheta) * 180) / Math.PI;
}

// A principal maximum is "missing" when it coincides with a single-slit envelope
// zero: that happens when d/a is an integer and the order m is a (nonzero)
// multiple of it (mλ/d = nλ/a ⇒ m = n·d/a). Those orders sit at zero intensity,
// so the renderer must not tick/label them. Returns null when d/a is not an
// integer (no exact coincidence) — m = 0 is never missing.
export function missingOrderPeriod(parameters: DiffractionParameters): number | null {
  const ratio = parameters.slitSpacing / parameters.slitWidth;
  const rounded = Math.round(ratio);
  if (rounded >= 2 && Math.abs(ratio - rounded) < 1e-6) {
    return rounded;
  }
  return null;
}

// Orders m whose principal maximum d·sinθ = mλ falls inside |sinθ| ≤ sinMax,
// returned with their sinθ position so the renderer can label m = 0, ±1, ±2…
// Missing orders (those landing on an envelope zero) are skipped — there is no
// visible peak there to label.
export function principalMaxima(
  parameters: DiffractionParameters,
  sinMax: number,
): { order: number; sinTheta: number }[] {
  if (effectiveSlitCount(parameters) <= 1) {
    return [{ order: 0, sinTheta: 0 }];
  }
  const spacing = principalMaximumSpacingSinTheta(parameters);
  const maxOrder = Math.floor(sinMax / spacing);
  const period = missingOrderPeriod(parameters);
  const result: { order: number; sinTheta: number }[] = [];
  for (let order = -maxOrder; order <= maxOrder; order += 1) {
    const isMissing = period !== null && order !== 0 && order % period === 0;
    if (isMissing) {
      continue;
    }
    result.push({ order, sinTheta: order * spacing });
  }
  return result;
}

// Map a visible wavelength (in nanometres) to an approximate sRGB colour. Used to
// tint the on-screen brightness band so the spectrum reads at a glance.
export function wavelengthNanometresToRgb(nanometres: number): [number, number, number] {
  const wl = nanometres;
  let r = 0;
  let g = 0;
  let b = 0;
  if (wl >= 380 && wl < 440) {
    r = -(wl - 440) / (440 - 380);
    b = 1;
  } else if (wl >= 440 && wl < 490) {
    g = (wl - 440) / (490 - 440);
    b = 1;
  } else if (wl >= 490 && wl < 510) {
    g = 1;
    b = -(wl - 510) / (510 - 490);
  } else if (wl >= 510 && wl < 580) {
    r = (wl - 510) / (580 - 510);
    g = 1;
  } else if (wl >= 580 && wl < 645) {
    r = 1;
    g = -(wl - 645) / (645 - 580);
  } else if (wl >= 645 && wl <= 780) {
    r = 1;
  }
  // Fade intensity near the limits of human vision.
  let factor = 1;
  if (wl >= 380 && wl < 420) {
    factor = 0.3 + (0.7 * (wl - 380)) / (420 - 380);
  } else if (wl > 700 && wl <= 780) {
    factor = 0.3 + (0.7 * (780 - wl)) / (780 - 700);
  } else if (wl < 380 || wl > 780) {
    factor = 0;
  }
  const gamma = 0.8;
  const channel = (value: number): number =>
    value <= 0 ? 0 : Math.round(255 * Math.pow(value * factor, gamma));
  return [channel(r), channel(g), channel(b)];
}
