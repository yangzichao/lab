import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import {
  stagePointToThreeDimensionalPlane,
  threeDimensionalPlaneToStagePoint,
} from '../shared/three-dimensional-plane';
import type { Point } from '../shared/stage';
import {
  createRadialGlowTexture,
  localizedThreeDimensionalText,
  ThreeDimensionalStage,
} from '../shared/three-dimensional-stage';
import { potentialAt, type Charge } from './electric-field-physics';
import {
  createElectricEquipotentialGeometry,
  createElectricFieldLineGeometry,
  electricFieldPlane,
  electricPotentialHeight,
  isInsideElectricFieldStage,
  updateElectricPotentialSurface,
} from './electric-field-three-dimensional-surface';

export type ElectricFieldThreeDimensionalScene = {
  charges: Charge[];
  testCharge: Point;
  trail: Point[];
  showEquipotentials: boolean;
  showFieldLines: boolean;
};

const surfaceColumns = 54;
const surfaceRows = 34;
const chargeColors = { positive: 0xff6178, negative: 0x4f8dff } as const;

export class ElectricFieldThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly surfaceGeometry = new PlaneGeometry(
    electricFieldPlane.width,
    electricFieldPlane.depth,
    surfaceColumns,
    surfaceRows,
  );
  private readonly surface: Mesh<PlaneGeometry, MeshPhysicalMaterial>;
  private readonly equipotentialLines: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly fieldLines: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly chargeGroup = new Group();
  private readonly chargeMeshes: Array<Mesh<SphereGeometry, MeshPhysicalMaterial>> = [];
  private readonly chargeGlows: Sprite[] = [];
  private readonly testCharge: Mesh<SphereGeometry, MeshPhysicalMaterial>;
  private readonly testChargeGlow: Sprite;
  private readonly trail: Line<BufferGeometry, LineBasicMaterial>;
  private readonly baseCoordinates: Array<{ x: number; z: number }> = [];
  private lastStaticSceneKey = '';

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x07121e,
      cameraPosition: [430, 335, 500],
      cameraTarget: [0, 8, 0],
      fog: { color: 0x07121e, near: 720, far: 1180 },
      minimumCameraDistance: 340,
      maximumCameraDistance: 980,
      legend: [
        { color: '#ff6178', label: localizedThreeDimensionalText('+ potential', '正电势') },
        { color: '#4f8dff', label: localizedThreeDimensionalText('− potential', '负电势') },
        { color: '#43e1c1', label: localizedThreeDimensionalText('test charge', '试探电荷') },
      ],
    });

    this.surfaceGeometry.rotateX(-Math.PI / 2);
    const surfacePositions = this.surfaceGeometry.attributes.position;
    for (let index = 0; index < surfacePositions.count; index += 1) {
      this.baseCoordinates.push({
        x: surfacePositions.getX(index),
        z: surfacePositions.getZ(index),
      });
    }
    this.surfaceGeometry.setAttribute(
      'color',
      new Float32BufferAttribute(new Float32Array(surfacePositions.count * 3), 3),
    );

    this.surface = new Mesh(
      this.surfaceGeometry,
      new MeshPhysicalMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        roughness: 0.58,
        metalness: 0.08,
        clearcoat: 0.28,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    this.equipotentialLines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: 0xd4e3ef, transparent: true, opacity: 0.58 }),
    );
    this.fieldLines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: 0x93b8cc, transparent: true, opacity: 0.66 }),
    );

    const chargeGeometry = new SphereGeometry(12, 28, 20);
    for (let index = 0; index < 4; index += 1) {
      const chargeMesh = new Mesh(
        chargeGeometry,
        new MeshPhysicalMaterial({
          color: chargeColors.positive,
          emissive: 0x8c1f35,
          emissiveIntensity: 1.6,
          roughness: 0.28,
          clearcoat: 0.65,
          clearcoatRoughness: 0.16,
        }),
      );
      const chargeGlow = new Sprite(
        new SpriteMaterial({
          map: createRadialGlowTexture('#ffffff', 'rgba(255, 97, 120, 0.52)'),
          color: chargeColors.positive,
          transparent: true,
          opacity: 0.8,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      chargeGlow.scale.set(62, 62, 1);
      this.chargeMeshes.push(chargeMesh);
      this.chargeGlows.push(chargeGlow);
      this.chargeGroup.add(chargeGlow, chargeMesh);
    }

    this.testCharge = new Mesh(
      new SphereGeometry(7, 24, 16),
      new MeshPhysicalMaterial({
        color: 0x43e1c1,
        emissive: 0x0d6c60,
        emissiveIntensity: 1.8,
        roughness: 0.26,
      }),
    );
    this.testChargeGlow = new Sprite(
      new SpriteMaterial({
        map: createRadialGlowTexture('#e8fff9', 'rgba(67, 225, 193, 0.5)'),
        color: 0x43e1c1,
        transparent: true,
        opacity: 0.82,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.testChargeGlow.scale.set(46, 46, 1);
    this.trail = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: 0x43e1c1,
        transparent: true,
        opacity: 0.82,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );

    const ambientLight = new AmbientLight(0xb7d2ff, 0.64);
    const keyLight = new DirectionalLight(0xd8e9ff, 1.5);
    keyLight.position.set(-250, 360, 280);
    const fillLight = new DirectionalLight(0xff8fa1, 0.55);
    fillLight.position.set(260, 170, -220);
    const testChargeLight = new PointLight(0x43e1c1, 1.4, 115, 1.8);
    this.testCharge.add(testChargeLight);

    this.stage.add(
      ambientLight,
      keyLight,
      fillLight,
      this.surface,
      this.equipotentialLines,
      this.fieldLines,
      this.trail,
      this.chargeGroup,
      this.testChargeGlow,
      this.testCharge,
    );
  }

  draw(scene: ElectricFieldThreeDimensionalScene): void {
    const staticSceneKey = JSON.stringify({
      charges: scene.charges,
      equipotentials: scene.showEquipotentials,
      fieldLines: scene.showFieldLines,
    });
    if (staticSceneKey !== this.lastStaticSceneKey) {
      this.updateStaticField(scene);
      this.lastStaticSceneKey = staticSceneKey;
    }
    this.updateTestCharge(scene.testCharge, scene.trail, scene.charges);
    this.stage.render();
  }

  stagePointFromPointer(event: PointerEvent): Point | null {
    const intersection = this.stage.projectPointerToHorizontalPlane(event);
    if (!intersection) {
      return null;
    }
    const point = threeDimensionalPlaneToStagePoint(intersection, electricFieldPlane);
    return isInsideElectricFieldStage(point) ? point : null;
  }

  setChargeDragging(dragging: boolean): void {
    this.stage.setOrbitInteractionEnabled(!dragging);
  }

  dispose(): void {
    this.stage.dispose();
  }

  private updateStaticField(scene: ElectricFieldThreeDimensionalScene): void {
    updateElectricPotentialSurface(this.surfaceGeometry, this.baseCoordinates, scene.charges);
    this.updateChargeMarkers(scene.charges);
    this.equipotentialLines.visible = scene.showEquipotentials;
    if (scene.showEquipotentials) {
      this.equipotentialLines.geometry.dispose();
      this.equipotentialLines.geometry = createElectricEquipotentialGeometry(
        scene.charges,
        surfaceColumns,
        surfaceRows,
      );
    }
    this.fieldLines.visible = scene.showFieldLines;
    if (scene.showFieldLines) {
      this.fieldLines.geometry.dispose();
      this.fieldLines.geometry = createElectricFieldLineGeometry(scene.charges);
    }
  }

  private updateChargeMarkers(charges: Charge[]): void {
    for (let index = 0; index < this.chargeMeshes.length; index += 1) {
      const charge = charges[index];
      const mesh = this.chargeMeshes[index];
      const glow = this.chargeGlows[index];
      mesh.visible = Boolean(charge);
      glow.visible = Boolean(charge);
      if (!charge) {
        continue;
      }
      const worldPosition = stagePointToThreeDimensionalPlane(charge, electricFieldPlane, 8);
      mesh.position.copy(worldPosition);
      glow.position.copy(worldPosition);
      const positive = charge.charge >= 0;
      const color = positive ? chargeColors.positive : chargeColors.negative;
      mesh.material.color.setHex(color);
      mesh.material.emissive.setHex(positive ? 0x8c1f35 : 0x183f94);
      glow.material.color.setHex(color);
    }
  }

  private updateTestCharge(testCharge: Point, trail: Point[], charges: Charge[]): void {
    const testChargePosition = stagePointToThreeDimensionalPlane(
      testCharge,
      electricFieldPlane,
      electricPotentialHeight(potentialAt(testCharge, charges)) + 10,
    );
    this.testCharge.position.copy(testChargePosition);
    this.testChargeGlow.position.copy(testChargePosition);
    this.testCharge.rotation.y += 0.018;

    this.trail.visible = trail.length > 1;
    if (this.trail.visible) {
      const trailPoints = trail.map((point) =>
        stagePointToThreeDimensionalPlane(
          point,
          electricFieldPlane,
          electricPotentialHeight(potentialAt(point, charges)) + 6,
        ),
      );
      this.trail.geometry.dispose();
      this.trail.geometry = new BufferGeometry().setFromPoints(trailPoints);
    }
  }
}
