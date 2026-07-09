import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  CanvasTexture,
  Color,
  Fog,
  Plane,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  BufferGeometry,
  Float32BufferAttribute,
  type Material,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from './stage';

export type ThreeDimensionalLegendEntry = {
  color: string;
  label: string;
};

export type ThreeDimensionalStageOptions = {
  background: number;
  cameraPosition: [number, number, number];
  cameraTarget?: [number, number, number];
  fog?: { color: number; near: number; far: number };
  minimumCameraDistance?: number;
  maximumCameraDistance?: number;
  legend?: ThreeDimensionalLegendEntry[];
};

export class ThreeDimensionalStage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(38, STAGE_WIDTH / STAGE_HEIGHT, 0.1, 4000);
  readonly renderer: WebGLRenderer;
  readonly controls: OrbitControls;

  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLElement | null;
  private readonly cleanupCallbacks: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, options: ThreeDimensionalStageOptions) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(STAGE_WIDTH, STAGE_HEIGHT, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene.background = new Color(options.background);
    if (options.fog) {
      this.scene.fog = new Fog(options.fog.color, options.fog.near, options.fog.far);
    }

    this.camera.position.set(...options.cameraPosition);
    const target = options.cameraTarget ?? [0, 0, 0];
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(...target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = options.minimumCameraDistance ?? 220;
    this.controls.maxDistance = options.maximumCameraDistance ?? 1050;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minPolarAngle = Math.PI * 0.08;
    this.controls.update();
    const renderAfterCameraChange = (): void => {
      this.renderer.render(this.scene, this.camera);
    };
    this.controls.addEventListener('change', renderAfterCameraChange);
    this.cleanupCallbacks.push(() =>
      this.controls.removeEventListener('change', renderAfterCameraChange),
    );

    canvas.dataset.rendering = 'three-dimensional';
    canvas.style.cursor = 'grab';
    const markDragging = (): void => {
      canvas.style.cursor = 'grabbing';
    };
    const markIdle = (): void => {
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerdown', markDragging);
    window.addEventListener('pointerup', markIdle);
    this.cleanupCallbacks.push(
      () => canvas.removeEventListener('pointerdown', markDragging),
      () => window.removeEventListener('pointerup', markIdle),
    );

    this.overlay = this.createOverlay(options.legend ?? []);
  }

  add(...objects: Object3D[]): void {
    this.scene.add(...objects);
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setOrbitInteractionEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
    this.canvas.style.cursor = enabled ? 'grab' : 'grabbing';
  }

  projectPointerToHorizontalPlane(event: PointerEvent, height = 0): Vector3 | null {
    const bounds = this.canvas.getBoundingClientRect();
    const normalizedPointer = new Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const raycaster = new Raycaster();
    raycaster.setFromCamera(normalizedPointer, this.camera);
    return raycaster.ray.intersectPlane(
      new Plane(new Vector3(0, 1, 0), -height),
      new Vector3(),
    );
  }

  projectPointerToVerticalPlane(event: PointerEvent, depth = 0): Vector3 | null {
    const bounds = this.canvas.getBoundingClientRect();
    const normalizedPointer = new Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const raycaster = new Raycaster();
    raycaster.setFromCamera(normalizedPointer, this.camera);
    return raycaster.ray.intersectPlane(
      new Plane(new Vector3(0, 0, 1), -depth),
      new Vector3(),
    );
  }

  dispose(): void {
    this.controls.dispose();
    this.renderer.dispose();
    this.overlay?.remove();
    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
  }

  private createOverlay(legend: ThreeDimensionalLegendEntry[]): HTMLElement | null {
    const container = this.canvas.closest<HTMLElement>('.plab__stage');
    if (!container) {
      return null;
    }

    const overlay = document.createElement('div');
    overlay.className = 'plab__three-dimensional-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const interactionHint = document.createElement('span');
    interactionHint.className = 'plab__three-dimensional-hint';
    interactionHint.textContent = localizedThreeDimensionalText(
      'Drag to orbit · Scroll to zoom',
      '拖动旋转 · 滚轮缩放',
    );
    overlay.append(interactionHint);

    if (legend.length > 0) {
      const legendElement = document.createElement('span');
      legendElement.className = 'plab__three-dimensional-legend';
      for (const entry of legend) {
        const item = document.createElement('span');
        const swatch = document.createElement('i');
        swatch.style.setProperty('--plab-three-dimensional-color', entry.color);
        item.append(swatch, document.createTextNode(entry.label));
        legendElement.append(item);
      }
      overlay.append(legendElement);
    }

    container.append(overlay);
    return overlay;
  }
}

export function localizedThreeDimensionalText(english: string, chinese: string): string {
  return document.documentElement.lang.toLowerCase().startsWith('en') ? english : chinese;
}

export function setThreeDimensionalMaterialOpacity(
  materialOrMaterials: Material | Material[],
  opacity: number,
): void {
  const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
  for (const material of materials) {
    material.transparent = opacity < 1;
    material.opacity = opacity;
  }
}

export function createRadialGlowTexture(
  centerColor: string,
  middleColor: string,
  edgeColor = 'rgba(0, 0, 0, 0)',
): CanvasTexture {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, centerColor);
    gradient.addColorStop(0.28, middleColor);
    gradient.addColorStop(1, edgeColor);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(textureCanvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createStarField(
  count: number,
  radius: number,
  color = 0xa8c7ff,
  seed = 7,
): Points {
  const positions: number[] = [];
  let randomState = seed >>> 0;
  const random = (): number => {
    randomState = (1664525 * randomState + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };

  for (let index = 0; index < count; index += 1) {
    const inclination = Math.acos(2 * random() - 1);
    const azimuth = random() * Math.PI * 2;
    const distance = radius * (0.72 + random() * 0.28);
    positions.push(
      distance * Math.sin(inclination) * Math.cos(azimuth),
      Math.abs(distance * Math.cos(inclination)) * 0.72 + 18,
      distance * Math.sin(inclination) * Math.sin(azimuth),
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color,
    size: 1.8,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  return new Points(geometry, material);
}
