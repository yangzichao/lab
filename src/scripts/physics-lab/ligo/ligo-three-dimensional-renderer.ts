import { Vector2, Vector3 } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ThreeDimensionalStage, createStarField } from '../shared/three-dimensional-stage';
import { createCavityScene, createDetectionScene } from './scenes/cavity-and-detection-scenes';
import { createDarkPortScene, createLaserScene } from './scenes/laser-and-dark-port-scenes';
import { createArmsScene, createSpacetimeScene } from './scenes/spacetime-and-arms-scenes';
import { LigoCalloutLayer } from './ligo-callout-layer';
import type { LigoSceneId, LigoSceneView } from './ligo-scene-types';
import { disposeObjectTree } from './ligo-three-helpers';

const transitionDurationSeconds = 1.15;

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export class LigoThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly composer: EffectComposer;
  private readonly calloutLayer: LigoCalloutLayer;
  private readonly scenes: Map<LigoSceneId, LigoSceneView>;
  private readonly prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private activeScene: LigoSceneView;
  private transitionElapsedSeconds = transitionDurationSeconds;
  private transitionStartPosition = new Vector3();
  private transitionStartTarget = new Vector3();
  private transitionEndPosition = new Vector3();
  private transitionEndTarget = new Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x030914,
      cameraPosition: [370, 280, 390],
      cameraTarget: [0, 0, 0],
      fog: { color: 0x030914, near: 760, far: 1500 },
      minimumCameraDistance: 260,
      maximumCameraDistance: 920,
      legend: [],
    });
    this.stage.controls.maxPolarAngle = Math.PI * 0.52;
    const stageElement = canvas.closest<HTMLElement>('.plab__stage');
    if (!stageElement) {
      throw new Error('LIGO renderer requires a .plab__stage container.');
    }
    this.calloutLayer = new LigoCalloutLayer(stageElement, this.stage.camera);

    const sceneViews = [
      createSpacetimeScene(),
      createArmsScene(),
      createLaserScene(),
      createDarkPortScene(),
      createCavityScene(),
      createDetectionScene(),
    ];
    this.scenes = new Map(sceneViews.map((sceneView) => [sceneView.id, sceneView]));
    this.activeScene = sceneViews[0]!;
    for (const sceneView of sceneViews) {
      sceneView.group.visible = sceneView === this.activeScene;
      this.stage.add(sceneView.group);
    }
    this.stage.add(createStarField(900, 780, 0x87bfff, 41));

    this.composer = new EffectComposer(this.stage.renderer);
    this.composer.addPass(new RenderPass(this.stage.scene, this.stage.camera));
    this.composer.addPass(
      new UnrealBloomPass(new Vector2(900, 560), 0.88, 0.72, 0.24),
    );

    this.calloutLayer.setCallouts(this.activeScene.callouts);
    this.stage.controls.addEventListener('change', this.updateCallouts);
    this.jumpToSceneCamera(this.activeScene);
  }

  setScene(sceneId: LigoSceneId, animate = true): void {
    const nextScene = this.scenes.get(sceneId);
    if (!nextScene || nextScene === this.activeScene) {
      return;
    }

    this.activeScene.group.visible = false;
    nextScene.group.visible = true;
    this.activeScene = nextScene;
    this.calloutLayer.setCallouts(nextScene.callouts);
    this.transitionStartPosition.copy(this.stage.camera.position);
    this.transitionStartTarget.copy(this.stage.controls.target);
    this.transitionEndPosition.set(...nextScene.cameraPosition);
    this.transitionEndTarget.set(...nextScene.cameraTarget);
    this.transitionElapsedSeconds =
      animate && !this.prefersReducedMotion ? 0 : transitionDurationSeconds;
    this.stage.controls.enabled = this.transitionElapsedSeconds >= transitionDurationSeconds;
    if (this.transitionElapsedSeconds >= transitionDurationSeconds) {
      this.jumpToSceneCamera(nextScene);
    }
  }

  draw(elapsedSeconds: number, deltaSeconds: number): void {
    this.activeScene.update(elapsedSeconds);
    if (this.transitionElapsedSeconds < transitionDurationSeconds) {
      this.transitionElapsedSeconds = Math.min(
        transitionDurationSeconds,
        this.transitionElapsedSeconds + deltaSeconds,
      );
      const progress = easeInOutCubic(
        this.transitionElapsedSeconds / transitionDurationSeconds,
      );
      this.stage.camera.position.lerpVectors(
        this.transitionStartPosition,
        this.transitionEndPosition,
        progress,
      );
      this.stage.controls.target.lerpVectors(
        this.transitionStartTarget,
        this.transitionEndTarget,
        progress,
      );
      if (this.transitionElapsedSeconds >= transitionDurationSeconds) {
        this.stage.controls.enabled = true;
      }
    }
    this.stage.controls.update();
    this.calloutLayer.update();
    this.composer.render();
  }

  renderStatic(elapsedSeconds: number): void {
    this.activeScene.update(elapsedSeconds);
    this.stage.controls.update();
    this.calloutLayer.update();
    this.composer.render();
  }

  dispose(): void {
    for (const sceneView of this.scenes.values()) {
      disposeObjectTree(sceneView.group);
    }
    this.stage.controls.removeEventListener('change', this.updateCallouts);
    this.calloutLayer.dispose();
    this.composer.dispose();
    this.stage.dispose();
  }

  private jumpToSceneCamera(sceneView: LigoSceneView): void {
    this.stage.camera.position.set(...sceneView.cameraPosition);
    this.stage.controls.target.set(...sceneView.cameraTarget);
    this.stage.controls.update();
    this.calloutLayer.update();
  }

  private readonly updateCallouts = (): void => {
    this.calloutLayer.update();
  };
}
