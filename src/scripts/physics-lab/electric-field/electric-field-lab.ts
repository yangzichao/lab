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
import { STAGE_HEIGHT, STAGE_WIDTH, type Point } from '../shared/stage';
import {
  clonePreset,
  fieldAt,
  fieldMagnitude,
  nearestChargeIndex,
  netCharge,
  potentialAt,
  type Charge,
} from './electric-field-physics';
import { ElectricFieldThreeDimensionalRenderer } from './electric-field-three-dimensional-renderer';

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
  const renderer = new ElectricFieldThreeDimensionalRenderer(canvas);
  window.addEventListener('pagehide', () => renderer.dispose(), { once: true });

  let charges: Charge[] = clonePreset(initialPreset);
  let testCharge: Point = releasePoint();
  let trail: Point[] = [];
  let draggingIndex = -1;

  const updateReadouts = (): void => {
    const potential = potentialAt(testCharge, charges);
    const magnitude = fieldMagnitude(testCharge, charges);
    setReadout(root, 'potential', formatSigned(potential, 1));
    setReadout(root, 'fieldStrength', formatFixed(magnitude, 2));
    setReadout(root, 'charges', `${charges.length}`);
    setReadout(root, 'netCharge', formatCompact(netCharge(charges), 0));
  };

  const render = (): void => {
    renderer.draw({
      charges,
      testCharge,
      trail,
      showEquipotentials: isChecked(root, 'showEquipotentials', true),
      showFieldLines: isChecked(root, 'showFieldLines', true),
    });
    updateReadouts();
  };

  const resetTestCharge = (): void => {
    testCharge = releasePoint();
    trail = [];
  };

  const reset = (): void => {
    charges = clonePreset(initialPreset);
    resetTestCharge();
    render();
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
    const point = renderer.stagePointFromPointer(event);
    if (!point) {
      return;
    }
    const nearest = nearestChargeIndex(point, charges);
    if (nearest.index >= 0 && nearest.distance < 28) {
      draggingIndex = nearest.index;
      renderer.setChargeDragging(true);
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (draggingIndex < 0) {
      return;
    }
    const point = renderer.stagePointFromPointer(event);
    if (!point) {
      return;
    }
    charges[draggingIndex] = {
      ...charges[draggingIndex],
      x: Math.max(12, Math.min(STAGE_WIDTH - 12, point.x)),
      y: Math.max(12, Math.min(STAGE_HEIGHT - 12, point.y)),
    };
    resetTestCharge();
    render();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (draggingIndex >= 0) {
      canvas.releasePointerCapture(event.pointerId);
      draggingIndex = -1;
      renderer.setChargeDragging(false);
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
    render();
  });

  onControlInput(root, () => {
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
