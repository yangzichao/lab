import {
  bindAction,
  bindPresets,
  getRangeValue,
  isChecked,
  onControlInput,
  setOutput,
  setRangeValue,
  setReadout,
} from '../shared/dom-controls';
import { formatFixed } from '../shared/format';
import { solveLensImage, type LensParameters } from './lens-optics-physics';
import { LensOpticsThreeDimensionalRenderer } from './lens-optics-three-dimensional-renderer';

const defaults = { focalLength: 150, objectDistance: 360, objectHeight: 110 };

// Each preset exercises a different regime of the imaging equation.
const presets: Record<string, { focalLength: number; objectDistance: number; objectHeight: number }> = {
  // do > 2f → reduced, inverted, real image.
  real: { focalLength: 130, objectDistance: 420, objectHeight: 110 },
  // do < f → enlarged, upright, virtual image (the magnifying-glass regime).
  magnifier: { focalLength: 200, objectDistance: 120, objectHeight: 80 },
  // f < 0 → diverging lens, always a reduced upright virtual image.
  diverging: { focalLength: -160, objectDistance: 320, objectHeight: 120 },
};

export function initLensOpticsLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="lens-optics"]');
  if (!root) {
    return;
  }
  const canvas = root.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!canvas) {
    return;
  }
  const renderer = new LensOpticsThreeDimensionalRenderer(canvas);

  const parameters = (): LensParameters => ({
    focalLength: getRangeValue(root, 'focalLength', defaults.focalLength),
    objectDistance: getRangeValue(root, 'objectDistance', defaults.objectDistance),
    objectHeight: getRangeValue(root, 'objectHeight', defaults.objectHeight),
  });

  const updateReadouts = (): void => {
    const image = solveLensImage(parameters());
    if (image.atFocalPoint) {
      setReadout(root, 'imageDistance', '∞');
      setReadout(root, 'magnification', '∞');
      setReadout(root, 'imageType', 'at infinity');
      setReadout(root, 'orientation', '—');
      return;
    }
    setReadout(root, 'imageDistance', `${formatFixed(image.imageDistance, 0)} px`);
    setReadout(root, 'magnification', `${formatFixed(image.magnification, 2)}×`);
    setReadout(root, 'imageType', image.imageType);
    setReadout(root, 'orientation', image.orientation);
  };

  const render = (): void => {
    const params = parameters();
    renderer.draw({
      parameters: params,
      image: solveLensImage(params),
      showRays: isChecked(root, 'showRays', true),
      showFoci: isChecked(root, 'showFoci', true),
    });
    updateReadouts();
  };

  const updateOutputs = (): void => {
    setOutput(root, 'focalLength', `${Math.round(getRangeValue(root, 'focalLength', defaults.focalLength))} px`);
    setOutput(root, 'objectDistance', `${Math.round(getRangeValue(root, 'objectDistance', defaults.objectDistance))} px`);
    setOutput(root, 'objectHeight', `${Math.round(getRangeValue(root, 'objectHeight', defaults.objectHeight))} px`);
  };

  // Dragging the object arrow moves it in the optical plane; dragging empty
  // space remains available to orbit the camera.
  const moveObjectFromPointer = (event: PointerEvent): void => {
    const nextParameters = renderer.objectParametersFromPointer(event);
    if (!nextParameters) {
      return;
    }
    setRangeValue(root, 'objectDistance', Math.round(nextParameters.objectDistance));
    setRangeValue(root, 'objectHeight', Math.round(nextParameters.objectHeight));
    updateOutputs();
    render();
  };

  let dragging = false;
  const onPointerDown = (event: PointerEvent): void => {
    if (!renderer.beginObjectDrag(event, parameters())) {
      return;
    }
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    moveObjectFromPointer(event);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (dragging) {
      moveObjectFromPointer(event);
    }
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (!dragging) {
      return;
    }
    dragging = false;
    renderer.endObjectDrag();
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const reset = (): void => {
    setRangeValue(root, 'focalLength', defaults.focalLength);
    setRangeValue(root, 'objectDistance', defaults.objectDistance);
    setRangeValue(root, 'objectHeight', defaults.objectHeight);
    updateOutputs();
    render();
  };

  bindAction(root, 'reset', reset);

  bindPresets(root, (presetId) => {
    const preset = presets[presetId];
    if (!preset) {
      return;
    }
    setRangeValue(root, 'focalLength', preset.focalLength);
    setRangeValue(root, 'objectDistance', preset.objectDistance);
    setRangeValue(root, 'objectHeight', preset.objectHeight);
    updateOutputs();
    render();
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  onControlInput(root, () => {
    updateOutputs();
    render();
  });

  updateOutputs();
  render();
}
