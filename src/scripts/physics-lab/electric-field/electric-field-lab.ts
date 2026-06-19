import { createAnimationLoop } from '../shared/animation-loop';
import {
  bindAction,
  bindPresets,
  isChecked,
  onControlInput,
  setReadout,
  updatePlayPauseButton,
} from '../shared/dom-controls';
import { formatCompact, formatFixed, formatSigned } from '../shared/format';
import { clearStage, setupStageCanvas, STAGE_HEIGHT, STAGE_WIDTH, type Point } from '../shared/stage';
import {
  clonePreset,
  fieldAt,
  fieldMagnitude,
  nearestChargeIndex,
  netCharge,
  potentialAt,
  type Charge,
} from './electric-field-physics';
import { renderDynamicLayer, renderStaticFieldLayer } from './electric-field-render';

const maximumTrailPoints = 260;
const testChargeSpeed = 90; // pixels/second the test charge travels along E
const initialPreset = 'dipole';

const releasePoint = (): Point => ({ x: STAGE_WIDTH * 0.18, y: STAGE_HEIGHT * 0.32 });

export function initElectricFieldLab(): void {
  const root = document.querySelector<HTMLElement>('[data-lab="electric-field"]');
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

  // Offscreen cache for the static field layer (heatmap + equipotentials +
  // streamlines). It only depends on the resting charge layout and the toggle
  // state, so it is rebuilt on a dirty flag rather than every frame.
  const fieldCacheCanvas = document.createElement('canvas');
  const fieldCacheContext = setupStageCanvas(fieldCacheCanvas);
  if (!fieldCacheContext) {
    return;
  }
  let fieldCacheDirty = true;

  let charges: Charge[] = clonePreset(initialPreset);
  let testCharge: Point = releasePoint();
  let trail: Point[] = [];
  let draggingIndex = -1;

  const markFieldDirty = (): void => {
    fieldCacheDirty = true;
  };

  const updateReadouts = (): void => {
    const potential = potentialAt(testCharge, charges);
    const magnitude = fieldMagnitude(testCharge, charges);
    setReadout(root, 'potential', formatSigned(potential, 1));
    setReadout(root, 'fieldStrength', formatFixed(magnitude, 2));
    setReadout(root, 'charges', `${charges.length}`);
    setReadout(root, 'netCharge', formatCompact(netCharge(charges), 0));
  };

  const rebuildFieldCache = (): void => {
    renderStaticFieldLayer(fieldCacheContext, {
      charges,
      showEquipotentials: isChecked(root, 'showEquipotentials', true),
      showFieldLines: isChecked(root, 'showFieldLines', true),
    });
    fieldCacheDirty = false;
  };

  const render = (): void => {
    if (fieldCacheDirty) {
      rebuildFieldCache();
    }
    clearStage(context);
    context.drawImage(fieldCacheCanvas, 0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    renderDynamicLayer(context, testCharge, trail, charges);
    updateReadouts();
  };

  const resetTestCharge = (): void => {
    testCharge = releasePoint();
    trail = [];
  };

  const reset = (): void => {
    charges = clonePreset(initialPreset);
    resetTestCharge();
    markFieldDirty();
    render();
  };

  const pointerToStage = (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * STAGE_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * STAGE_HEIGHT,
    };
  };

  const advanceTestCharge = (deltaSeconds: number): void => {
    const field = fieldAt(testCharge, charges);
    const magnitude = Math.hypot(field.x, field.y);
    if (magnitude < 1e-6) {
      return;
    }
    // A positive test charge drifts along E (high to low potential). We move it
    // at a steady visual pace so the direction reads clearly even far from a
    // charge where the field is weak.
    testCharge = {
      x: testCharge.x + (field.x / magnitude) * testChargeSpeed * deltaSeconds,
      y: testCharge.y + (field.y / magnitude) * testChargeSpeed * deltaSeconds,
    };
    trail.push({ ...testCharge });
    if (trail.length > maximumTrailPoints) {
      trail.splice(0, trail.length - maximumTrailPoints);
    }

    const outOfBounds =
      testCharge.x < 2 || testCharge.x > STAGE_WIDTH - 2 || testCharge.y < 2 || testCharge.y > STAGE_HEIGHT - 2;
    const nearest = nearestChargeIndex(testCharge, charges);
    const absorbed = nearest.index >= 0 && charges[nearest.index].charge < 0 && nearest.distance < 14;
    if (outOfBounds || absorbed) {
      resetTestCharge();
    }
  };

  const loop = createAnimationLoop((deltaSeconds) => {
    advanceTestCharge(deltaSeconds);
    render();
  });

  const onPointerDown = (event: PointerEvent): void => {
    const point = pointerToStage(event);
    const nearest = nearestChargeIndex(point, charges);
    if (nearest.index >= 0 && nearest.distance < 28) {
      draggingIndex = nearest.index;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (draggingIndex < 0) {
      return;
    }
    const point = pointerToStage(event);
    charges[draggingIndex] = {
      ...charges[draggingIndex],
      x: Math.max(12, Math.min(STAGE_WIDTH - 12, point.x)),
      y: Math.max(12, Math.min(STAGE_HEIGHT - 12, point.y)),
    };
    resetTestCharge();
    markFieldDirty();
    render();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (draggingIndex >= 0) {
      canvas.releasePointerCapture(event.pointerId);
      draggingIndex = -1;
    }
  };

  bindAction(root, 'toggle', () => {
    if (loop.running) {
      loop.stop();
    } else {
      loop.start();
    }
    updatePlayPauseButton(root, loop.running);
  });
  bindAction(root, 'reset', reset);

  bindPresets(root, (presetId) => {
    charges = clonePreset(presetId);
    resetTestCharge();
    markFieldDirty();
    render();
  });

  onControlInput(root, () => {
    // Toggles change which static layers are drawn, so the cache must rebuild.
    markFieldDirty();
    render();
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  render();
  loop.start();
  updatePlayPauseButton(root, true);
}
