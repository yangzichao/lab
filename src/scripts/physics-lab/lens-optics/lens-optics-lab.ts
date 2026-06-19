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
import { clamp, formatFixed } from '../shared/format';
import { setupStageCanvas, STAGE_HEIGHT, STAGE_WIDTH } from '../shared/stage';
import { solveLensImage, type LensParameters } from './lens-optics-physics';
import { AXIS_Y, drawLensScene, LENS_X } from './lens-optics-render';

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

// Drag bounds keep the object on the left side of the lens and inside the stage.
const minObjectDistance = 30;
const maxObjectDistance = LENS_X - 30;
const maxObjectHeight = (STAGE_HEIGHT / 2) - 30;

export function initLensOpticsLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="lens-optics"]');
  if (!root) {
    return;
  }
  const canvas = root.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
  if (!canvas) {
    return;
  }
  const context = setupStageCanvas(canvas);
  if (!context) {
    return;
  }

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
    drawLensScene(context, {
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

  // Pointer drag on the canvas moves the object: x sets do, y sets ho.
  const moveObjectFromPointer = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const stageX = ((event.clientX - rect.left) / rect.width) * STAGE_WIDTH;
    const stageY = ((event.clientY - rect.top) / rect.height) * STAGE_HEIGHT;
    const objectDistance = clamp(LENS_X - stageX, minObjectDistance, maxObjectDistance);
    const objectHeight = clamp(AXIS_Y - stageY, 10, maxObjectHeight);
    setRangeValue(root, 'objectDistance', Math.round(objectDistance));
    setRangeValue(root, 'objectHeight', Math.round(objectHeight));
    updateOutputs();
    render();
  };

  let dragging = false;
  const onPointerDown = (event: PointerEvent): void => {
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
    dragging = false;
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

  onControlInput(root, () => {
    updateOutputs();
    render();
  });

  updateOutputs();
  render();
}
