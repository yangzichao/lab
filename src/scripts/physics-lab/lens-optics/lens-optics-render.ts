import {
  clearStage,
  drawArrow,
  drawDashedLine,
  drawDisc,
  drawDotGrid,
  drawLabel,
  palette,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Point,
} from '../shared/stage';
import type { LensImage, LensParameters } from './lens-optics-physics';

// The lens sits at the centre of the stage; the optical axis is the horizontal
// midline. Physics distances (in scene units) map to pixels through SCALE, with
// +x to the right of the lens and +y upward (canvas y grows downward, hence the
// minus sign in `project`).
export const LENS_X = STAGE_WIDTH / 2;
export const AXIS_Y = STAGE_HEIGHT / 2;
const SCALE = 1; // distances are already chosen in pixels by the controller
const RAY_REACH = STAGE_WIDTH; // how far to extend rays/extensions across the stage
const lensHalfHeight = 150;

// Object-space x for an object that sits a distance `do` to the LEFT of the lens.
function project(physicsX: number, physicsY: number): Point {
  return { x: LENS_X + SCALE * physicsX, y: AXIS_Y - SCALE * physicsY };
}

export type LensSceneOptions = {
  parameters: LensParameters;
  image: LensImage;
  showRays: boolean;
  showFoci: boolean;
};

export function drawLensScene(context: CanvasRenderingContext2D, options: LensSceneOptions): void {
  const { parameters, image, showRays, showFoci } = options;
  const { focalLength, objectDistance, objectHeight } = parameters;
  const converging = focalLength >= 0;

  clearStage(context);
  drawDotGrid(context);
  drawOpticalAxis(context);
  drawLens(context, converging);

  if (showFoci) {
    drawFocalPoints(context, Math.abs(focalLength));
  }

  const objectTip = project(-objectDistance, objectHeight);
  const objectBase = project(-objectDistance, 0);

  if (showRays) {
    drawPrincipalRays(context, objectTip, image);
  }

  if (!image.atFocalPoint) {
    drawImageArrow(context, image);
  }

  drawObjectArrow(context, objectBase, objectTip, objectDistance, objectHeight);
  drawLegend(context, image, converging);
}

function drawOpticalAxis(context: CanvasRenderingContext2D): void {
  context.save();
  context.strokeStyle = palette.gridStrong;
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(24, AXIS_Y);
  context.lineTo(STAGE_WIDTH - 24, AXIS_Y);
  context.stroke();
  context.restore();
}

function drawLens(context: CanvasRenderingContext2D, converging: boolean): void {
  const top = AXIS_Y - lensHalfHeight;
  const bottom = AXIS_Y + lensHalfHeight;

  // Faint vertical lens plane.
  context.save();
  context.strokeStyle = palette.faint;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(LENS_X, top);
  context.lineTo(LENS_X, bottom);
  context.stroke();

  // Symbolic lens: converging = outward double arrows (↕ with heads out),
  // diverging = inward double arrows (heads pointing in toward the axis).
  context.strokeStyle = palette.ink;
  context.fillStyle = palette.ink;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(LENS_X, top + 6);
  context.lineTo(LENS_X, bottom - 6);
  context.stroke();
  context.restore();

  const headLength = 14;
  const headWidth = 9;
  if (converging) {
    drawArrowHead(context, { x: LENS_X, y: top + 6 }, -1, headLength, headWidth); // points up/out
    drawArrowHead(context, { x: LENS_X, y: bottom - 6 }, 1, headLength, headWidth); // points down/out
  } else {
    drawArrowHead(context, { x: LENS_X, y: top + 6 + headLength }, 1, headLength, headWidth); // points down/in
    drawArrowHead(context, { x: LENS_X, y: bottom - 6 - headLength }, -1, headLength, headWidth); // points up/in
  }

  drawLabel(context, converging ? 'converging lens' : 'diverging lens', LENS_X, top - 12, {
    color: palette.muted,
    size: 12,
    weight: 600,
    align: 'center',
  });
}

// A vertical arrow head at `tip`, pointing up (dir = -1) or down (dir = +1).
function drawArrowHead(
  context: CanvasRenderingContext2D,
  tip: Point,
  dir: number,
  length: number,
  width: number,
): void {
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(tip.x - width, tip.y + dir * length);
  context.lineTo(tip.x + width, tip.y + dir * length);
  context.closePath();
  context.fill();
}

function drawFocalPoints(context: CanvasRenderingContext2D, focalMagnitude: number): void {
  const positions: { x: number; label: string }[] = [
    { x: LENS_X - focalMagnitude, label: 'F' },
    { x: LENS_X + focalMagnitude, label: 'F' },
    { x: LENS_X - 2 * focalMagnitude, label: '2F' },
    { x: LENS_X + 2 * focalMagnitude, label: '2F' },
  ];
  for (const { x, label } of positions) {
    if (x < 28 || x > STAGE_WIDTH - 28) {
      continue;
    }
    drawDisc(context, { x, y: AXIS_Y }, 3.5, { fill: palette.muted });
    drawLabel(context, label, x, AXIS_Y + 22, {
      color: palette.muted,
      size: 12,
      weight: 700,
      align: 'center',
    });
  }
}

// The three textbook rays. Each is computed in physics space then projected.
//   1) parallel in  → refracts through the far focus (blue)
//   2) through lens centre → undeviated (teal)
//   3) through the near focus in → emerges parallel to the axis (amber)
// When the lens is diverging (or the image is virtual), the outgoing rays
// diverge; their backward dashed extensions meet at the virtual image.
function drawPrincipalRays(
  context: CanvasRenderingContext2D,
  objectTip: Point,
  image: LensImage,
): void {
  const imageTip = image.atFocalPoint
    ? null
    : projectImageTip(image);

  // Ray 1: parallel to axis until the lens, then bends to (through) the far focus.
  // After the lens it heads toward the image tip (real) or away from it (virtual,
  // dashed backward extension). We draw segment to lens, then segment after lens.
  const lensHit1: Point = { x: LENS_X, y: objectTip.y };
  drawRaySegment(context, objectTip, lensHit1, palette.blue);
  drawOutgoingRay(context, lensHit1, imageTip, image, palette.blue);

  // Ray 2: straight through the lens centre, undeviated.
  const lensCentre: Point = { x: LENS_X, y: AXIS_Y };
  drawRaySegment(context, objectTip, lensCentre, palette.teal);
  drawCentreContinuation(context, objectTip, lensCentre, imageTip, image, palette.teal);

  // Ray 3: aimed through the near focus, then parallel after the lens.
  // The lens-plane height for this ray is determined by the line from object tip
  // through the near focus; after the lens it travels horizontally.
  const nearFocusY = lensPlaneHeightThroughNearFocus(objectTip, image);
  const lensHit3: Point = { x: LENS_X, y: nearFocusY };
  drawRaySegment(context, objectTip, lensHit3, palette.amber);
  drawParallelAfterLens(context, lensHit3, imageTip, image, palette.amber);
}

function projectImageTip(image: LensImage): Point {
  return { x: LENS_X + image.imageDistance, y: AXIS_Y - image.imageHeight };
}

function drawRaySegment(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

// After the lens, ray 1 passes through the far focus. All three principal rays
// (or their backward extensions) meet at the image tip, so the robust
// construction is simply to aim this outgoing ray at the analytic image tip:
// real → solid forward; virtual → solid forward plus a dashed backward
// extension to the image on the object side.
function drawOutgoingRay(
  context: CanvasRenderingContext2D,
  lensHit: Point,
  imageTip: Point | null,
  image: LensImage,
  color: string,
): void {
  if (!imageTip) {
    return;
  }
  // Unit vector along the line through the lens hit and the image tip. For a
  // real image this points toward the image (to the right); for a virtual image
  // the tip sits on the object side, so it points to the left.
  const direction = { x: imageTip.x - lensHit.x, y: imageTip.y - lensHit.y };
  const length = Math.hypot(direction.x, direction.y) || 1;
  const unit = { x: direction.x / length, y: direction.y / length };

  if (image.imageType === 'virtual') {
    // The real refracted ray leaves the lens heading to the RIGHT (+x); only its
    // dashed backward extension runs left to the virtual image on the object
    // side. The image-tip direction points left here, so the solid forward ray
    // is the reverse of `unit`.
    const forwardEnd = { x: lensHit.x - unit.x * RAY_REACH, y: lensHit.y - unit.y * RAY_REACH };
    drawRaySegment(context, lensHit, forwardEnd, color);
    drawDashedLine(context, lensHit, imageTip, hexToFaded(color));
    return;
  }

  // Real image: the solid ray runs forward (to the right) through the image tip.
  const forwardEnd = { x: lensHit.x + unit.x * RAY_REACH, y: lensHit.y + unit.y * RAY_REACH };
  drawRaySegment(context, lensHit, forwardEnd, color);
}

// Ray 2 continues in a straight line through the centre. Forward to the image
// tip (and beyond); dashed backward extension for a virtual image.
function drawCentreContinuation(
  context: CanvasRenderingContext2D,
  objectTip: Point,
  lensCentre: Point,
  imageTip: Point | null,
  image: LensImage,
  color: string,
): void {
  const direction = { x: lensCentre.x - objectTip.x, y: lensCentre.y - objectTip.y };
  const length = Math.hypot(direction.x, direction.y) || 1;
  const unit = { x: direction.x / length, y: direction.y / length };
  const forwardEnd = { x: lensCentre.x + unit.x * RAY_REACH, y: lensCentre.y + unit.y * RAY_REACH };
  drawRaySegment(context, lensCentre, forwardEnd, color);

  if (image.imageType === 'virtual' && imageTip) {
    drawDashedLine(context, lensCentre, imageTip, hexToFaded(color));
  }
}

// Lens-plane crossing height for ray 3 (the one through the near focus).
// For a converging lens the near focus is on the object side at -|f|; the ray
// from the object tip through that focus crosses the lens plane at some y. After
// the lens it runs parallel to the axis at that y.
function lensPlaneHeightThroughNearFocus(objectTip: Point, image: LensImage): number {
  // The outgoing parallel ray sits at the image-tip height (since after the lens
  // it is horizontal and must pass through the image tip). This holds for both
  // real and virtual images under this construction.
  if (image.atFocalPoint) {
    return objectTip.y;
  }
  return AXIS_Y - image.imageHeight;
}

// Ray 3 after the lens: horizontal at the lens-hit height.
function drawParallelAfterLens(
  context: CanvasRenderingContext2D,
  lensHit: Point,
  imageTip: Point | null,
  image: LensImage,
  color: string,
): void {
  const forwardEnd = { x: STAGE_WIDTH - 24, y: lensHit.y };
  drawRaySegment(context, lensHit, forwardEnd, color);

  if (image.imageType === 'virtual' && imageTip) {
    // Backward dashed extension to the virtual image on the object side.
    const backEnd = { x: 24, y: lensHit.y };
    drawDashedLine(context, lensHit, backEnd, hexToFaded(color));
  }
}

function drawObjectArrow(
  context: CanvasRenderingContext2D,
  base: Point,
  tip: Point,
  objectDistance: number,
  objectHeight: number,
): void {
  drawArrow(context, base, tip, { color: palette.ink, width: 3 });
  drawDisc(context, tip, 6, { fill: palette.green, stroke: '#ffffff', strokeWidth: 2 });
  drawLabel(context, 'object', base.x, base.y + 20, {
    color: palette.ink,
    size: 12,
    weight: 700,
    align: 'center',
  });
  drawLabel(context, `do = ${Math.round(objectDistance)} · ho = ${Math.round(objectHeight)}`, base.x, base.y + 38, {
    color: palette.muted,
    size: 11,
    weight: 600,
    align: 'center',
  });
}

function drawImageArrow(context: CanvasRenderingContext2D, image: LensImage): void {
  const tip = projectImageTip(image);
  const base: Point = { x: tip.x, y: AXIS_Y };
  const color = image.imageType === 'real' ? palette.red : palette.violet;

  if (image.imageType === 'real') {
    drawArrow(context, base, tip, { color, width: 3 });
  } else {
    // Virtual image: dashed arrow on the object side. The short solid head must
    // point FROM the base (on the axis) TOWARD the tip, so an upright image
    // (tip above the axis) reads as an upward arrow. Place the tail on the base
    // side of the tip — `Math.sign(base.y - tip.y)` is +1 when the tip is above
    // the axis, putting the tail below the tip and the head pointing up.
    drawDashedLine(context, base, tip, color, [6, 5]);
    const tail = { x: tip.x, y: tip.y + Math.sign(base.y - tip.y) * 18 };
    drawArrow(context, tail, tip, { color, width: 2.4 });
  }

  const labelY = tip.y < AXIS_Y ? tip.y - 12 : AXIS_Y - 26;
  drawLabel(context, `${image.imageType} image`, tip.x, labelY, {
    color,
    size: 12,
    weight: 700,
    align: 'center',
    background: true,
  });
  drawLabel(
    context,
    `di = ${Math.round(image.imageDistance)} · m = ${image.magnification.toFixed(2)}`,
    base.x,
    AXIS_Y + (image.imageType === 'real' ? 38 : -42),
    { color, size: 11, weight: 600, align: 'center' },
  );
}

function drawLegend(context: CanvasRenderingContext2D, image: LensImage, converging: boolean): void {
  drawLabel(context, '— parallel → far focus', 24, STAGE_HEIGHT - 56, {
    color: palette.blue,
    size: 12,
    weight: 600,
  });
  drawLabel(context, '— through centre', 24, STAGE_HEIGHT - 38, {
    color: palette.teal,
    size: 12,
    weight: 600,
  });
  // For a converging lens this ray crosses the near (object-side) focus; for a
  // diverging lens it is aimed at the far virtual focus F′ and emerges parallel.
  drawLabel(
    context,
    converging ? '— through near focus → parallel' : '— toward far focus F′ → parallel',
    24,
    STAGE_HEIGHT - 20,
    {
      color: palette.amber,
      size: 12,
      weight: 600,
    },
  );

  if (image.atFocalPoint) {
    drawLabel(context, 'object at focus — rays parallel, image at infinity', LENS_X, AXIS_Y - lensHalfHeight - 30, {
      color: palette.red,
      size: 13,
      weight: 700,
      align: 'center',
      background: true,
    });
  }
}

// Fade a solid hex colour for the dashed virtual-extension lines.
function hexToFaded(hex: string): string {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, 0.5)`;
}
