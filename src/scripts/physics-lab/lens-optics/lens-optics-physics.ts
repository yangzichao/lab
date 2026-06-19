// Thin-lens imaging in a single, explicit sign convention (no DOM here).
//
// Geometry: everything lives on a horizontal optical axis with the lens at the
// origin. We use the standard "real-is-positive" convention:
//   - object distance  do > 0  to the LEFT of the lens (objects are real)
//   - focal length      f  > 0  converging / convex lens
//                       f  < 0  diverging / concave lens
//   - image distance    di > 0  RIGHT of the lens (real image, inverted)
//                       di < 0  LEFT  of the lens (virtual image, upright)
//
// Imaging equation:   1/do + 1/di = 1/f   →   di = 1 / (1/f − 1/do)
// Magnification:       m = −di / do        (m < 0 inverted, |m| > 1 enlarged)
// Image height:        hi = m · ho

export type LensParameters = {
  focalLength: number; // f, signed (converging > 0, diverging < 0)
  objectDistance: number; // do > 0, left of the lens
  objectHeight: number; // ho > 0, above the axis
};

export type ImageType = 'real' | 'virtual';
export type Orientation = 'upright' | 'inverted';

export type LensImage = {
  imageDistance: number; // di, signed; +Infinity when the object sits at the focus
  magnification: number; // m, signed
  imageHeight: number; // hi = m · ho, signed
  imageType: ImageType;
  orientation: Orientation;
  atFocalPoint: boolean; // do ≈ |f| of a converging lens → rays leave parallel, image at infinity
};

// Tolerance (in the same length units as the distances) for detecting the
// singular case where the object sits on the focal point and 1/di → 0.
const focalSingularityTolerance = 1e-3;

export function solveLensImage(parameters: LensParameters): LensImage {
  const { focalLength, objectDistance, objectHeight } = parameters;

  // Singularity: do = f for a converging lens. The rays emerge parallel and the
  // image races off to infinity; flag it so the renderer can say so instead of
  // dividing by ~0.
  const reciprocalDifference = 1 / focalLength - 1 / objectDistance;
  const atFocalPoint = Math.abs(reciprocalDifference) < focalSingularityTolerance;

  if (atFocalPoint) {
    return {
      imageDistance: Number.POSITIVE_INFINITY,
      magnification: Number.POSITIVE_INFINITY,
      imageHeight: Number.POSITIVE_INFINITY,
      imageType: 'real',
      orientation: 'inverted',
      atFocalPoint: true,
    };
  }

  const imageDistance = 1 / reciprocalDifference;
  const magnification = -imageDistance / objectDistance;
  const imageHeight = magnification * objectHeight;

  return {
    imageDistance,
    magnification,
    imageHeight,
    imageType: imageDistance > 0 ? 'real' : 'virtual',
    orientation: magnification < 0 ? 'inverted' : 'upright',
    atFocalPoint: false,
  };
}
