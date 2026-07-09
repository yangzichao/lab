import {
  AdditiveBlending,
  AmbientLight,
  ArrowHelper,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { clamp } from '../shared/format';
import {
  createRadialGlowTexture,
  localizedThreeDimensionalText,
  setThreeDimensionalMaterialOpacity,
  ThreeDimensionalStage,
} from '../shared/three-dimensional-stage';
import { createLensThreeDimensionalGeometry } from './lens-three-dimensional-geometry';
import type { LensImage, LensParameters } from './lens-optics-physics';

export type LensOpticsThreeDimensionalScene = {
  parameters: LensParameters;
  image: LensImage;
  showRays: boolean;
  showFoci: boolean;
};

const physicsToWorldScale = 0.82;
const opticalWorldExtent = 400;
const minimumObjectDistance = 30;
const maximumObjectDistance = 420;
const minimumObjectHeight = 20;
const maximumObjectHeight = 240;
const rayColors = [0x5794ff, 0x43e1c1, 0xffb454];

function worldPoint(physicsX: number, physicsY: number, depth = 0): Vector3 {
  return new Vector3(
    physicsX * physicsToWorldScale,
    physicsY * physicsToWorldScale,
    depth,
  );
}

export class LensOpticsThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly lens: Mesh<BufferGeometry, MeshPhysicalMaterial>;
  private readonly objectArrow = new ArrowHelper(
    new Vector3(0, 1, 0),
    new Vector3(),
    1,
    0x55e6b0,
    12,
    7,
  );
  private readonly imageArrow = new ArrowHelper(
    new Vector3(0, -1, 0),
    new Vector3(),
    1,
    0xff6680,
    12,
    7,
  );
  private readonly objectHalo: Sprite;
  private readonly imageHalo: Sprite;
  private readonly imagePlane: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly focalMarkers: Array<Mesh<SphereGeometry, MeshPhysicalMaterial>> = [];
  private readonly incomingRays: Array<Line<BufferGeometry, LineBasicMaterial>> = [];
  private readonly outgoingRays: Array<Line<BufferGeometry, LineBasicMaterial>> = [];
  private readonly virtualExtensions: Array<Line<BufferGeometry, LineDashedMaterial>> = [];
  private converging = true;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x06121f,
      cameraPosition: [470, 290, 590],
      cameraTarget: [0, 30, 0],
      fog: { color: 0x06121f, near: 760, far: 1220 },
      minimumCameraDistance: 390,
      maximumCameraDistance: 1060,
      legend: [
        {
          color: '#5794ff',
          label: localizedThreeDimensionalText('parallel ray', '平行光线'),
        },
        {
          color: '#43e1c1',
          label: localizedThreeDimensionalText('central ray', '镜心光线'),
        },
        {
          color: '#ffb454',
          label: localizedThreeDimensionalText('focal ray', '焦点光线'),
        },
      ],
    });

    const floor = new Mesh(
      new PlaneGeometry(900, 560),
      new MeshPhysicalMaterial({
        color: 0x102b3e,
        roughness: 0.8,
        metalness: 0.08,
        transparent: true,
        opacity: 0.72,
        side: DoubleSide,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -178;

    const opticalAxis = new Line(
      new BufferGeometry().setFromPoints([
        new Vector3(-opticalWorldExtent, 0, 0),
        new Vector3(opticalWorldExtent, 0, 0),
      ]),
      new LineDashedMaterial({
        color: 0x829bb0,
        dashSize: 7,
        gapSize: 8,
        transparent: true,
        opacity: 0.62,
      }),
    );
    opticalAxis.computeLineDistances();

    this.lens = new Mesh(
      createLensThreeDimensionalGeometry(true),
      new MeshPhysicalMaterial({
        color: 0x8bc9ff,
        emissive: 0x0d477c,
        emissiveIntensity: 0.48,
        roughness: 0.12,
        metalness: 0.02,
        transmission: 0.74,
        thickness: 2.2,
        transparent: true,
        opacity: 0.72,
        clearcoat: 0.8,
        clearcoatRoughness: 0.1,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    const lensRim = new Mesh(
      new TorusGeometry(150, 2.5, 10, 96),
      new MeshBasicMaterial({
        color: 0xb8e2ff,
        transparent: true,
        opacity: 0.8,
        blending: AdditiveBlending,
      }),
    );
    lensRim.rotation.y = Math.PI / 2;

    const haloTexture = createRadialGlowTexture(
      '#ffffff',
      'rgba(95, 175, 255, 0.48)',
    );
    this.objectHalo = new Sprite(
      new SpriteMaterial({
        map: haloTexture,
        color: 0x55e6b0,
        transparent: true,
        opacity: 0.78,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.objectHalo.scale.set(54, 54, 1);
    this.imageHalo = new Sprite(
      new SpriteMaterial({
        map: haloTexture,
        color: 0xff6680,
        transparent: true,
        opacity: 0.68,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.imageHalo.scale.set(50, 50, 1);

    this.imagePlane = new Mesh(
      new PlaneGeometry(190, 250),
      new MeshBasicMaterial({
        color: 0x4f8dff,
        transparent: true,
        opacity: 0.09,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    this.imagePlane.rotation.y = Math.PI / 2;

    for (let index = 0; index < 4; index += 1) {
      this.focalMarkers.push(
        new Mesh(
          new SphereGeometry(index % 2 === 0 ? 4.2 : 6, 18, 12),
          new MeshPhysicalMaterial({
            color: index % 2 === 0 ? 0x8aa6bb : 0xffc15c,
            emissive: index % 2 === 0 ? 0x263c4c : 0x9a5b13,
            emissiveIntensity: 1.2,
            roughness: 0.32,
          }),
        ),
      );
    }

    for (let index = 0; index < rayColors.length; index += 1) {
      const rayMaterial = new LineBasicMaterial({
        color: rayColors[index],
        transparent: true,
        opacity: 0.94,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      this.incomingRays.push(new Line(new BufferGeometry(), rayMaterial.clone()));
      this.outgoingRays.push(new Line(new BufferGeometry(), rayMaterial.clone()));
      this.virtualExtensions.push(
        new Line(
          new BufferGeometry(),
          new LineDashedMaterial({
            color: rayColors[index],
            dashSize: 6,
            gapSize: 6,
            transparent: true,
            opacity: 0.5,
          }),
        ),
      );
    }

    setThreeDimensionalMaterialOpacity(this.objectArrow.line.material, 0.92);
    setThreeDimensionalMaterialOpacity(this.imageArrow.line.material, 0.86);

    const ambientLight = new AmbientLight(0xb5d5ff, 0.64);
    const keyLight = new DirectionalLight(0xe5f2ff, 1.85);
    keyLight.position.set(-260, 390, 350);
    const rimLight = new DirectionalLight(0x79aaff, 0.72);
    rimLight.position.set(230, 160, -300);
    const lensLight = new PointLight(0x5faeff, 2.2, 340, 1.8);
    lensLight.position.set(0, 90, 25);

    this.stage.add(
      ambientLight,
      keyLight,
      rimLight,
      lensLight,
      floor,
      opticalAxis,
      this.imagePlane,
      ...this.focalMarkers,
      ...this.virtualExtensions,
      ...this.incomingRays,
      ...this.outgoingRays,
      lensRim,
      this.lens,
      this.objectArrow,
      this.imageArrow,
      this.objectHalo,
      this.imageHalo,
    );
  }

  draw(scene: LensOpticsThreeDimensionalScene): void {
    this.updateLens(scene.parameters);
    this.updateFocalMarkers(scene.parameters, scene.showFoci);
    this.updateObjectAndImage(scene);
    this.updateRays(scene);
    this.stage.render();
  }

  beginObjectDrag(event: PointerEvent, parameters: LensParameters): boolean {
    const intersection = this.stage.projectPointerToVerticalPlane(event);
    if (!intersection) {
      return false;
    }
    const objectX = -parameters.objectDistance * physicsToWorldScale;
    const objectHeight = parameters.objectHeight * physicsToWorldScale;
    const closeToArrow =
      Math.abs(intersection.x - objectX) < 34 &&
      intersection.y > -24 &&
      intersection.y < objectHeight + 34;
    if (closeToArrow) {
      this.stage.setOrbitInteractionEnabled(false);
    }
    return closeToArrow;
  }

  objectParametersFromPointer(
    event: PointerEvent,
  ): Pick<LensParameters, 'objectDistance' | 'objectHeight'> | null {
    const intersection = this.stage.projectPointerToVerticalPlane(event);
    if (!intersection) {
      return null;
    }
    return {
      objectDistance: clamp(
        -intersection.x / physicsToWorldScale,
        minimumObjectDistance,
        maximumObjectDistance,
      ),
      objectHeight: clamp(
        intersection.y / physicsToWorldScale,
        minimumObjectHeight,
        maximumObjectHeight,
      ),
    };
  }

  endObjectDrag(): void {
    this.stage.setOrbitInteractionEnabled(true);
  }

  dispose(): void {
    this.stage.dispose();
  }

  private updateLens(parameters: LensParameters): void {
    const nextConverging = parameters.focalLength >= 0;
    if (nextConverging === this.converging) {
      return;
    }
    this.converging = nextConverging;
    this.lens.geometry.dispose();
    this.lens.geometry = createLensThreeDimensionalGeometry(nextConverging);
    this.lens.material.color.setHex(nextConverging ? 0x8bc9ff : 0xb69cff);
    this.lens.material.emissive.setHex(nextConverging ? 0x0d477c : 0x462374);
  }

  private updateFocalMarkers(parameters: LensParameters, visible: boolean): void {
    const focalLength = Math.abs(parameters.focalLength);
    const positions = [-2 * focalLength, -focalLength, focalLength, 2 * focalLength];
    for (let index = 0; index < this.focalMarkers.length; index += 1) {
      const marker = this.focalMarkers[index];
      const worldX = positions[index] * physicsToWorldScale;
      marker.visible = visible && Math.abs(worldX) < opticalWorldExtent - 10;
      marker.position.set(worldX, 0, 0);
    }
  }

  private updateObjectAndImage(scene: LensOpticsThreeDimensionalScene): void {
    const objectPosition = worldPoint(-scene.parameters.objectDistance, 0);
    const objectTip = worldPoint(
      -scene.parameters.objectDistance,
      scene.parameters.objectHeight,
    );
    this.objectArrow.position.copy(objectPosition);
    this.objectArrow.setDirection(new Vector3(0, 1, 0));
    this.objectArrow.setLength(
      scene.parameters.objectHeight * physicsToWorldScale,
      13,
      7,
    );
    this.objectHalo.position.copy(objectTip);

    const imageInsideScene =
      !scene.image.atFocalPoint &&
      Math.abs(scene.image.imageDistance * physicsToWorldScale) < opticalWorldExtent &&
      Math.abs(scene.image.imageHeight * physicsToWorldScale) < 310;
    this.imageArrow.visible = imageInsideScene;
    this.imageHalo.visible = imageInsideScene;
    this.imagePlane.visible = imageInsideScene && scene.image.imageType === 'real';
    if (!imageInsideScene) {
      return;
    }

    const imageColor = scene.image.imageType === 'real' ? 0xff6680 : 0xb58cff;
    const imagePosition = worldPoint(scene.image.imageDistance, 0);
    const imageTip = worldPoint(scene.image.imageDistance, scene.image.imageHeight);
    this.imageArrow.position.copy(imagePosition);
    this.imageArrow.setDirection(
      new Vector3(0, Math.sign(scene.image.imageHeight) || 1, 0),
    );
    this.imageArrow.setLength(
      Math.abs(scene.image.imageHeight) * physicsToWorldScale,
      13,
      7,
    );
    this.imageArrow.setColor(new Color(imageColor));
    this.imageHalo.position.copy(imageTip);
    this.imageHalo.material.color.setHex(imageColor);
    this.imagePlane.position.set(imagePosition.x, 24, 0);
    this.imagePlane.material.color.setHex(imageColor);
  }

  private updateRays(scene: LensOpticsThreeDimensionalScene): void {
    for (const line of [
      ...this.incomingRays,
      ...this.outgoingRays,
      ...this.virtualExtensions,
    ]) {
      line.visible = false;
    }
    if (!scene.showRays) {
      return;
    }

    const objectTip = {
      x: -scene.parameters.objectDistance,
      y: scene.parameters.objectHeight,
    };
    const physicsRightEdge = opticalWorldExtent / physicsToWorldScale;
    const isFiniteImage = !scene.image.atFocalPoint;
    const lensHitHeights = [
      scene.parameters.objectHeight,
      0,
      isFiniteImage ? scene.image.imageHeight : null,
    ];

    for (let index = 0; index < lensHitHeights.length; index += 1) {
      const lensHitHeight = lensHitHeights[index];
      if (lensHitHeight === null) {
        continue;
      }
      const depth = 0;
      const incoming = this.incomingRays[index];
      incoming.visible = true;
      this.updateLine(incoming, [
        worldPoint(objectTip.x, objectTip.y, depth),
        worldPoint(0, lensHitHeight, depth),
      ]);

      const outgoing = this.outgoingRays[index];
      outgoing.visible = true;
      const slope = isFiniteImage
        ? (scene.image.imageHeight - lensHitHeight) / scene.image.imageDistance
        : -scene.parameters.objectHeight / scene.parameters.objectDistance;
      this.updateLine(outgoing, [
        worldPoint(0, lensHitHeight, depth),
        worldPoint(
          physicsRightEdge,
          lensHitHeight + slope * physicsRightEdge,
          depth,
        ),
      ]);

      const virtualExtension = this.virtualExtensions[index];
      virtualExtension.visible =
        isFiniteImage && scene.image.imageType === 'virtual';
      if (virtualExtension.visible) {
        this.updateLine(virtualExtension, [
          worldPoint(0, lensHitHeight, depth),
          worldPoint(
            scene.image.imageDistance,
            scene.image.imageHeight,
            depth,
          ),
        ]);
        virtualExtension.computeLineDistances();
      }
    }
  }

  private updateLine(
    line: Line<BufferGeometry, LineBasicMaterial | LineDashedMaterial>,
    points: Vector3[],
  ): void {
    line.geometry.dispose();
    line.geometry = new BufferGeometry().setFromPoints(points);
  }
}
