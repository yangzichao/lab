import { PerspectiveCamera, Vector3 } from 'three';
import type { LigoSceneCallout } from './ligo-scene-types';

type RenderedCallout = {
  definition: LigoSceneCallout;
  element: HTMLElement;
  label: HTMLElement;
};

export class LigoCalloutLayer {
  private readonly root = document.createElement('div');
  private readonly camera: PerspectiveCamera;
  private readonly projectedPosition = new Vector3();
  private renderedCallouts: RenderedCallout[] = [];

  constructor(stageElement: HTMLElement, camera: PerspectiveCamera) {
    this.camera = camera;
    this.root.className = 'ligo-callouts';
    this.root.setAttribute('aria-hidden', 'true');
    stageElement.append(this.root);
  }

  setCallouts(callouts: LigoSceneCallout[]): void {
    this.root.replaceChildren();
    this.renderedCallouts = callouts.map((definition) => {
      const element = document.createElement('span');
      element.className = 'ligo-callout';
      element.dataset.tone = definition.tone;
      const marker = document.createElement('i');
      const label = document.createElement('span');
      element.append(marker, label);
      this.root.append(element);
      return { definition, element, label };
    });
  }

  update(): void {
    for (const rendered of this.renderedCallouts) {
      rendered.definition.anchor.getWorldPosition(this.projectedPosition);
      this.projectedPosition.project(this.camera);
      const leftPercent = (this.projectedPosition.x * 0.5 + 0.5) * 100;
      const topPercent = (-this.projectedPosition.y * 0.5 + 0.5) * 100;
      const isVisible =
        this.projectedPosition.z > -1 &&
        this.projectedPosition.z < 1 &&
        leftPercent > 4 &&
        leftPercent < 96 &&
        topPercent > 8 &&
        topPercent < 70;
      rendered.element.hidden = !isVisible;
      if (!isVisible) {
        continue;
      }
      rendered.element.style.left = `${leftPercent}%`;
      rendered.element.style.top = `${topPercent}%`;
      rendered.element.dataset.side = leftPercent > 70 ? 'left' : 'right';
      const nextLabel =
        typeof rendered.definition.label === 'function'
          ? rendered.definition.label()
          : rendered.definition.label;
      if (rendered.label.textContent !== nextLabel) {
        rendered.label.textContent = nextLabel;
      }
    }
  }

  dispose(): void {
    this.root.remove();
    this.renderedCallouts = [];
  }
}
