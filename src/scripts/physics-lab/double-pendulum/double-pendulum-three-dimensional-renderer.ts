import {
  AdditiveBlending,
  AmbientLight,
  ArrowHelper,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  GridHelper,
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
  Vector3,
} from 'three';
import {
  createRadialGlowTexture,
  localizedThreeDimensionalText,
  setThreeDimensionalMaterialOpacity,
  ThreeDimensionalStage,
} from '../shared/three-dimensional-stage';
import {
  pendulumBobPosition,
  pendulumBobVelocity,
  pendulumJointPosition,
  type PendulumCartesianPoint,
} from './double-pendulum-kinematics';
import type { PendulumState } from './double-pendulum-physics';

export type DoublePendulumThreeDimensionalScene = {
  state: PendulumState;
  twin: PendulumState | null;
  trail: PendulumCartesianPoint[];
  showTrail: boolean;
};

type PendulumPieces = {
  upperRod: Mesh<CylinderGeometry, MeshPhysicalMaterial>;
  lowerRod: Mesh<CylinderGeometry, MeshPhysicalMaterial>;
  joint: Mesh<SphereGeometry, MeshPhysicalMaterial>;
  bob: Mesh<SphereGeometry, MeshPhysicalMaterial>;
};

const metresToWorldUnits = 150;
const pivotPosition = new Vector3(0, 174, 0);
const twinPlaneDepth = -28;
const velocityArrowScale = 33;

function worldPosition(point: PendulumCartesianPoint, depth = 0): Vector3 {
  return new Vector3(
    point.x * metresToWorldUnits,
    pivotPosition.y - point.y * metresToWorldUnits,
    depth,
  );
}

export class DoublePendulumThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly mainPieces: PendulumPieces;
  private readonly twinPieces: PendulumPieces;
  private readonly pivot: Mesh<SphereGeometry, MeshPhysicalMaterial>;
  private readonly upperHalo: Sprite;
  private readonly lowerHalo: Sprite;
  private readonly trail = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  private readonly pivotVerticalGuide: Line<BufferGeometry, LineDashedMaterial>;
  private readonly jointVerticalGuide: Line<BufferGeometry, LineDashedMaterial>;
  private readonly upperAngleArc: Line<BufferGeometry, LineBasicMaterial>;
  private readonly lowerAngleArc: Line<BufferGeometry, LineBasicMaterial>;
  private readonly velocityArrow = new ArrowHelper(
    new Vector3(1, 0, 0),
    new Vector3(),
    1,
    0x43e1c1,
    11,
    6,
  );

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x06121e,
      cameraPosition: [410, 280, 560],
      cameraTarget: [0, 12, 0],
      fog: { color: 0x06121e, near: 720, far: 1160 },
      minimumCameraDistance: 350,
      maximumCameraDistance: 980,
      legend: [
        {
          color: '#5794ff',
          label: localizedThreeDimensionalText('upper joint', '上摆球'),
        },
        {
          color: '#ff6178',
          label: localizedThreeDimensionalText('lower bob', '下摆球'),
        },
        {
          color: '#b58cff',
          label: localizedThreeDimensionalText('chaotic twin', '混沌孪生'),
        },
        {
          color: '#43e1c1',
          label: localizedThreeDimensionalText('velocity', '速度'),
        },
      ],
    });

    const floor = new Mesh(
      new PlaneGeometry(760, 520),
      new MeshPhysicalMaterial({
        color: 0x10293b,
        roughness: 0.82,
        metalness: 0.1,
        transparent: true,
        opacity: 0.76,
        side: DoubleSide,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -190;

    const grid = new GridHelper(700, 18, 0x345873, 0x18364d);
    grid.position.y = -188;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;

    const motionPlane = new Mesh(
      new PlaneGeometry(470, 390),
      new MeshBasicMaterial({
        color: 0x3d76ad,
        transparent: true,
        opacity: 0.045,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    motionPlane.position.set(0, -2, twinPlaneDepth / 2);

    const supportMaterial = new MeshPhysicalMaterial({
      color: 0x71889b,
      metalness: 0.76,
      roughness: 0.28,
      clearcoat: 0.32,
    });
    const verticalSupportGeometry = new CylinderGeometry(8, 11, 410, 18);
    const leftSupport = new Mesh(verticalSupportGeometry, supportMaterial);
    leftSupport.position.set(-245, 15, -34);
    const rightSupport = new Mesh(verticalSupportGeometry, supportMaterial);
    rightSupport.position.set(245, 15, -34);
    const crossbar = new Mesh(
      new CylinderGeometry(9, 9, 510, 18),
      supportMaterial,
    );
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, 215, -34);
    const pivotBracket = new Mesh(
      new CylinderGeometry(13, 13, 76, 22),
      supportMaterial,
    );
    pivotBracket.rotation.x = Math.PI / 2;
    pivotBracket.position.copy(pivotPosition).setZ(-14);

    const mainRodMaterial = new MeshPhysicalMaterial({
      color: 0xb3c4d2,
      metalness: 0.66,
      roughness: 0.24,
      clearcoat: 0.46,
    });
    const upperBobMaterial = new MeshPhysicalMaterial({
      color: 0x5794ff,
      emissive: 0x173e8d,
      emissiveIntensity: 1.2,
      roughness: 0.24,
      metalness: 0.14,
      clearcoat: 0.68,
    });
    const lowerBobMaterial = new MeshPhysicalMaterial({
      color: 0xff6178,
      emissive: 0x8f1d36,
      emissiveIntensity: 1.25,
      roughness: 0.24,
      metalness: 0.14,
      clearcoat: 0.68,
    });
    this.mainPieces = this.createPendulumPieces(
      mainRodMaterial,
      upperBobMaterial,
      lowerBobMaterial,
      5.2,
    );

    const twinRodMaterial = new MeshPhysicalMaterial({
      color: 0xb58cff,
      emissive: 0x3f236f,
      emissiveIntensity: 0.58,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const twinJointMaterial = twinRodMaterial.clone();
    const twinBobMaterial = twinRodMaterial.clone();
    twinBobMaterial.opacity = 0.62;
    this.twinPieces = this.createPendulumPieces(
      twinRodMaterial,
      twinJointMaterial,
      twinBobMaterial,
      3.4,
    );

    this.pivot = new Mesh(
      new SphereGeometry(8, 24, 16),
      new MeshPhysicalMaterial({
        color: 0xe0ebf4,
        metalness: 0.82,
        roughness: 0.2,
      }),
    );
    this.pivot.position.copy(pivotPosition);

    const haloTexture = createRadialGlowTexture(
      '#ffffff',
      'rgba(92, 145, 255, 0.52)',
    );
    this.upperHalo = new Sprite(
      new SpriteMaterial({
        map: haloTexture,
        color: 0x5794ff,
        transparent: true,
        opacity: 0.68,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.upperHalo.scale.set(62, 62, 1);
    this.lowerHalo = new Sprite(
      new SpriteMaterial({
        map: haloTexture,
        color: 0xff6178,
        transparent: true,
        opacity: 0.72,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.lowerHalo.scale.set(76, 76, 1);

    this.pivotVerticalGuide = this.createDashedGuide();
    this.jointVerticalGuide = this.createDashedGuide();
    this.upperAngleArc = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: 0x5794ff,
        transparent: true,
        opacity: 0.82,
      }),
    );
    this.lowerAngleArc = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: 0xff6178,
        transparent: true,
        opacity: 0.82,
      }),
    );
    setThreeDimensionalMaterialOpacity(this.velocityArrow.line.material, 0.9);
    setThreeDimensionalMaterialOpacity(this.velocityArrow.cone.material, 0.95);

    const ambientLight = new AmbientLight(0xb4d2ff, 0.62);
    const keyLight = new DirectionalLight(0xe4efff, 1.8);
    keyLight.position.set(-260, 410, 330);
    const rimLight = new DirectionalLight(0xff8298, 0.76);
    rimLight.position.set(280, 150, -320);
    const bobLight = new PointLight(0x8e6fff, 1.8, 330, 1.8);
    bobLight.position.set(0, 40, 80);

    this.stage.add(
      ambientLight,
      keyLight,
      rimLight,
      bobLight,
      floor,
      grid,
      motionPlane,
      leftSupport,
      rightSupport,
      crossbar,
      pivotBracket,
      this.trail,
      this.pivotVerticalGuide,
      this.jointVerticalGuide,
      this.upperAngleArc,
      this.lowerAngleArc,
      this.twinPieces.upperRod,
      this.twinPieces.lowerRod,
      this.twinPieces.joint,
      this.twinPieces.bob,
      this.mainPieces.upperRod,
      this.mainPieces.lowerRod,
      this.mainPieces.joint,
      this.mainPieces.bob,
      this.upperHalo,
      this.lowerHalo,
      this.pivot,
      this.velocityArrow,
    );
  }

  draw(scene: DoublePendulumThreeDimensionalScene): void {
    const jointPosition = pendulumJointPosition(scene.state);
    const bobPosition = pendulumBobPosition(scene.state);
    const jointWorldPosition = worldPosition(jointPosition);
    const bobWorldPosition = worldPosition(bobPosition);
    this.updatePendulumPieces(
      this.mainPieces,
      jointWorldPosition,
      bobWorldPosition,
      0,
    );
    this.upperHalo.position.copy(jointWorldPosition);
    this.lowerHalo.position.copy(bobWorldPosition);
    const haloPulse = 1 + Math.sin(performance.now() * 0.004) * 0.055;
    this.lowerHalo.scale.setScalar(76 * haloPulse);

    this.updateTwin(scene.twin);
    this.updateTrail(scene.trail, scene.showTrail);
    this.updateGuidesAndAngles(scene.state, jointWorldPosition);
    this.updateVelocity(scene.state, bobWorldPosition);
    this.stage.render();
  }

  dispose(): void {
    this.stage.dispose();
  }

  private createPendulumPieces(
    rodMaterial: MeshPhysicalMaterial,
    jointMaterial: MeshPhysicalMaterial,
    bobMaterial: MeshPhysicalMaterial,
    rodRadius: number,
  ): PendulumPieces {
    return {
      upperRod: new Mesh(
        new CylinderGeometry(rodRadius, rodRadius, 1, 18),
        rodMaterial,
      ),
      lowerRod: new Mesh(
        new CylinderGeometry(rodRadius, rodRadius, 1, 18),
        rodMaterial,
      ),
      joint: new Mesh(new SphereGeometry(14, 28, 20), jointMaterial),
      bob: new Mesh(new SphereGeometry(18, 30, 22), bobMaterial),
    };
  }

  private createDashedGuide(): Line<BufferGeometry, LineDashedMaterial> {
    return new Line(
      new BufferGeometry(),
      new LineDashedMaterial({
        color: 0x718ba1,
        dashSize: 5,
        gapSize: 7,
        transparent: true,
        opacity: 0.5,
      }),
    );
  }

  private updatePendulumPieces(
    pieces: PendulumPieces,
    joint: Vector3,
    bob: Vector3,
    depth: number,
  ): void {
    const pivot = pivotPosition.clone().setZ(depth);
    this.updateRod(pieces.upperRod, pivot, joint);
    this.updateRod(pieces.lowerRod, joint, bob);
    pieces.joint.position.copy(joint);
    pieces.bob.position.copy(bob);
    pieces.joint.rotation.y += 0.018;
    pieces.bob.rotation.y += 0.022;
  }

  private updateRod(
    rod: Mesh<CylinderGeometry, MeshPhysicalMaterial>,
    start: Vector3,
    end: Vector3,
  ): void {
    const direction = new Vector3().subVectors(end, start);
    const length = direction.length();
    rod.position.copy(start).add(end).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(
      new Vector3(0, 1, 0),
      direction.normalize(),
    );
    rod.scale.set(1, length, 1);
  }

  private updateTwin(twin: PendulumState | null): void {
    const visible = twin !== null;
    this.twinPieces.upperRod.visible = visible;
    this.twinPieces.lowerRod.visible = visible;
    this.twinPieces.joint.visible = visible;
    this.twinPieces.bob.visible = visible;
    if (!twin) {
      return;
    }
    this.updatePendulumPieces(
      this.twinPieces,
      worldPosition(pendulumJointPosition(twin), twinPlaneDepth),
      worldPosition(pendulumBobPosition(twin), twinPlaneDepth),
      twinPlaneDepth,
    );
  }

  private updateTrail(
    trail: PendulumCartesianPoint[],
    showTrail: boolean,
  ): void {
    this.trail.visible = showTrail && trail.length > 1;
    if (!this.trail.visible) {
      return;
    }
    const positions: number[] = [];
    const colors: number[] = [];
    const oldestColor = new Color(0x102b3c);
    const newestColor = new Color(0x43e1c1);
    const color = new Color();
    trail.forEach((point, index) => {
      const world = worldPosition(point, 5);
      positions.push(world.x, world.y, world.z);
      const progress = index / Math.max(trail.length - 1, 1);
      color.lerpColors(oldestColor, newestColor, progress);
      colors.push(color.r, color.g, color.b);
    });
    this.trail.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.trail.geometry = geometry;
  }

  private updateGuidesAndAngles(
    state: PendulumState,
    joint: Vector3,
  ): void {
    this.updateLine(this.pivotVerticalGuide, [
      pivotPosition.clone(),
      pivotPosition.clone().add(new Vector3(0, -78, 0)),
    ]);
    this.updateLine(this.jointVerticalGuide, [
      joint.clone(),
      joint.clone().add(new Vector3(0, -68, 0)),
    ]);
    this.pivotVerticalGuide.computeLineDistances();
    this.jointVerticalGuide.computeLineDistances();
    this.updateAngleArc(this.upperAngleArc, pivotPosition, state.theta1, 48, 7);
    this.updateAngleArc(this.lowerAngleArc, joint, state.theta2, 38, 7);
  }

  private updateAngleArc(
    line: Line<BufferGeometry, LineBasicMaterial>,
    center: Vector3,
    angle: number,
    radius: number,
    depth: number,
  ): void {
    const wrappedAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
    const sampleCount = Math.max(12, Math.ceil(Math.abs(wrappedAngle) * 18));
    const points: Vector3[] = [];
    for (let index = 0; index <= sampleCount; index += 1) {
      const sampleAngle = wrappedAngle * (index / sampleCount);
      points.push(
        new Vector3(
          center.x + Math.sin(sampleAngle) * radius,
          center.y - Math.cos(sampleAngle) * radius,
          depth,
        ),
      );
    }
    this.updateLine(line, points);
  }

  private updateVelocity(state: PendulumState, bob: Vector3): void {
    const velocity = pendulumBobVelocity(state);
    const direction = new Vector3(velocity.x, -velocity.y, 0);
    const speed = direction.length();
    this.velocityArrow.visible = speed > 1e-4;
    if (!this.velocityArrow.visible) {
      return;
    }
    this.velocityArrow.position.copy(bob);
    this.velocityArrow.setDirection(direction.normalize());
    this.velocityArrow.setLength(
      Math.min(135, 18 + speed * velocityArrowScale),
      11,
      6,
    );
  }

  private updateLine(
    line: Line<BufferGeometry, LineBasicMaterial | LineDashedMaterial>,
    points: Vector3[],
  ): void {
    line.geometry.dispose();
    line.geometry = new BufferGeometry().setFromPoints(points);
  }
}
