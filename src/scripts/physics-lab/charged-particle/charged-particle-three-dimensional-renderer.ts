import {
  AdditiveBlending,
  AmbientLight,
  ArrowHelper,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PointLight,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { Point } from '../shared/stage';
import {
  createRadialGlowTexture,
  localizedThreeDimensionalText,
  setThreeDimensionalMaterialOpacity,
  ThreeDimensionalStage,
} from '../shared/three-dimensional-stage';
import {
  cyclotronRadius,
  lorentzAcceleration,
  speedOf,
  type FieldParameters,
  type ParticleState,
} from './charged-particle-physics';

export type ChargedParticleThreeDimensionalScene = {
  state: ParticleState;
  fields: FieldParameters;
  trail: Point[];
  showTrail: boolean;
  showVectors: boolean;
  showField: boolean;
};

const worldUnitsPerMetre = 5.2;
const fieldWidth = 700;
const fieldDepth = 430;
const velocityArrowScale = 3.2;
const forceArrowScale = 0.34;
const maximumArrowLength = 150;

const worldPosition = (point: Point, height = 7): Vector3 =>
  new Vector3(point.x * worldUnitsPerMetre, height, point.y * worldUnitsPerMetre);

export class ChargedParticleThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly particle: Mesh<SphereGeometry, MeshPhysicalMaterial>;
  private readonly particleHalo: Sprite;
  private readonly particleLight: PointLight;
  private readonly trailLine: Line<BufferGeometry, LineBasicMaterial>;
  private readonly cyclotronLine: Line<BufferGeometry, LineDashedMaterial>;
  private readonly magneticFieldGroup = new Group();
  private readonly electricFieldGroup = new Group();
  private readonly magneticFieldArrows: ArrowHelper[] = [];
  private readonly electricFieldArrows: ArrowHelper[] = [];
  private readonly velocityArrow = new ArrowHelper(
    new Vector3(1, 0, 0),
    new Vector3(),
    1,
    0x43e1c1,
  );
  private readonly forceArrow = new ArrowHelper(
    new Vector3(-1, 0, 0),
    new Vector3(),
    1,
    0xffb454,
  );

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x07131f,
      cameraPosition: [0, 350, 500],
      cameraTarget: [0, 0, 0],
      fog: { color: 0x07131f, near: 620, far: 980 },
      minimumCameraDistance: 285,
      maximumCameraDistance: 920,
      legend: [
        { color: '#43e1c1', label: 'v' },
        { color: '#ffb454', label: 'F' },
        { color: '#8bb9ff', label: localizedThreeDimensionalText('field', '场方向') },
      ],
    });

    const ambientLight = new AmbientLight(0xa9c7ff, 0.56);
    const fieldPlane = new Mesh(
      new CircleGeometry(430, 96),
      new MeshBasicMaterial({
        color: 0x153453,
        transparent: true,
        opacity: 0.16,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    fieldPlane.rotation.x = -Math.PI / 2;
    fieldPlane.position.y = -2.2;

    const grid = new GridHelper(760, 16, 0x315574, 0x18344e);
    grid.position.y = -1.5;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;

    this.particle = new Mesh(
      new SphereGeometry(10, 32, 24),
      new MeshPhysicalMaterial({
        color: 0x4e8fff,
        emissive: 0x17459b,
        emissiveIntensity: 1.5,
        metalness: 0.2,
        roughness: 0.28,
        clearcoat: 0.7,
        clearcoatRoughness: 0.18,
      }),
    );
    this.particleHalo = new Sprite(
      new SpriteMaterial({
        map: createRadialGlowTexture('#e5f2ff', 'rgba(72, 142, 255, 0.46)'),
        color: 0x4e8fff,
        transparent: true,
        opacity: 0.82,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.particleHalo.scale.set(58, 58, 1);
    this.particleLight = new PointLight(0x4e8fff, 2.6, 150, 1.8);

    this.trailLine = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: 0x4b8dff,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.cyclotronLine = new Line(
      new BufferGeometry(),
      new LineDashedMaterial({
        color: 0x43e1c1,
        dashSize: 6,
        gapSize: 6,
        transparent: true,
        opacity: 0.6,
      }),
    );

    this.buildFieldArrows();
    setThreeDimensionalMaterialOpacity(this.velocityArrow.line.material, 0.92);
    setThreeDimensionalMaterialOpacity(this.forceArrow.line.material, 0.92);

    this.stage.add(
      ambientLight,
      fieldPlane,
      grid,
      this.magneticFieldGroup,
      this.electricFieldGroup,
      this.cyclotronLine,
      this.trailLine,
      this.particleLight,
      this.particleHalo,
      this.particle,
      this.velocityArrow,
      this.forceArrow,
    );
  }

  draw(scene: ChargedParticleThreeDimensionalScene): void {
    const particlePosition = worldPosition(scene.state);
    this.particle.position.copy(particlePosition);
    this.particleHalo.position.copy(particlePosition);
    this.particleLight.position.copy(particlePosition);
    this.particle.rotation.y += 0.018;

    const chargeColor = scene.fields.charge < 0 ? 0xff6680 : 0x4e8fff;
    this.particle.material.color.setHex(chargeColor);
    this.particle.material.emissive.setHex(scene.fields.charge < 0 ? 0x8d1830 : 0x17459b);
    this.particleLight.color.setHex(chargeColor);

    this.updateFields(scene.fields, scene.showField);
    this.updateTrail(scene.trail, scene.showTrail);
    this.updateCyclotronCircle(scene.state, scene.fields);
    this.updateVectors(scene.state, scene.fields, scene.showVectors, particlePosition);
    this.stage.render();
  }

  dispose(): void {
    this.stage.dispose();
  }

  private buildFieldArrows(): void {
    const columns = 9;
    const rows = 6;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = -fieldWidth / 2 + (fieldWidth * column) / (columns - 1);
        const z = -fieldDepth / 2 + (fieldDepth * row) / (rows - 1);

        const magneticArrow = new ArrowHelper(
          new Vector3(0, 1, 0),
          new Vector3(x, 0, z),
          24,
          0x7b9fc8,
          7,
          4,
        );
        setThreeDimensionalMaterialOpacity(magneticArrow.line.material, 0.34);
        setThreeDimensionalMaterialOpacity(magneticArrow.cone.material, 0.48);
        this.magneticFieldArrows.push(magneticArrow);
        this.magneticFieldGroup.add(magneticArrow);

        if (column % 2 === 0 && row % 2 === 0) {
          const electricArrow = new ArrowHelper(
            new Vector3(1, 0, 0),
            new Vector3(x, 1, z),
            38,
            0xffb454,
            8,
            4,
          );
          setThreeDimensionalMaterialOpacity(electricArrow.line.material, 0.34);
          setThreeDimensionalMaterialOpacity(electricArrow.cone.material, 0.48);
          this.electricFieldArrows.push(electricArrow);
          this.electricFieldGroup.add(electricArrow);
        }
      }
    }
  }

  private updateFields(fields: FieldParameters, showField: boolean): void {
    const magneticMagnitude = Math.abs(fields.magneticZ);
    const magneticVisible = showField && magneticMagnitude > 1e-6;
    this.magneticFieldGroup.visible = magneticVisible;
    if (magneticVisible) {
      const direction = new Vector3(0, Math.sign(fields.magneticZ), 0);
      const length = 18 + Math.min(22, magneticMagnitude * 8);
      const color = fields.magneticZ >= 0 ? new Color(0x7fb7ff) : new Color(0xc69cff);
      for (const arrow of this.magneticFieldArrows) {
        arrow.setDirection(direction);
        arrow.setLength(length, 7, 4);
        arrow.setColor(color);
      }
    }

    const electricDirection = new Vector3(fields.electricX, 0, fields.electricY);
    const electricMagnitude = electricDirection.length();
    const electricVisible = showField && electricMagnitude > 1e-6;
    this.electricFieldGroup.visible = electricVisible;
    if (electricVisible) {
      electricDirection.normalize();
      const length = 28 + Math.min(26, electricMagnitude * 2.4);
      for (const arrow of this.electricFieldArrows) {
        arrow.setDirection(electricDirection);
        arrow.setLength(length, 8, 4);
      }
    }
  }

  private updateTrail(trail: Point[], showTrail: boolean): void {
    this.trailLine.visible = showTrail && trail.length > 1;
    if (!this.trailLine.visible) {
      return;
    }
    this.updateLine(
      this.trailLine,
      trail.map((point, index) =>
        worldPosition(point, 4.8 + (index / trail.length) * 1.5),
      ),
    );
  }

  private updateCyclotronCircle(state: ParticleState, fields: FieldParameters): void {
    const radiusMetres = cyclotronRadius(state, fields);
    const speed = speedOf(state);
    const isPureMagnetic =
      radiusMetres !== null &&
      speed > 1e-6 &&
      Math.abs(fields.magneticZ) > 1e-6 &&
      Math.hypot(fields.electricX, fields.electricY) < 1e-6;
    this.cyclotronLine.visible = isPureMagnetic;
    if (!isPureMagnetic || radiusMetres === null) {
      return;
    }

    const turnSign = fields.charge * fields.magneticZ > 0 ? 1 : -1;
    const centerX = state.x + turnSign * (state.vy / speed) * radiusMetres;
    const centerY = state.y - turnSign * (state.vx / speed) * radiusMetres;
    const points: Vector3[] = [];
    for (let index = 0; index <= 128; index += 1) {
      const angle = (index / 128) * Math.PI * 2;
      points.push(
        worldPosition(
          {
            x: centerX + radiusMetres * Math.cos(angle),
            y: centerY + radiusMetres * Math.sin(angle),
          },
          2.4,
        ),
      );
    }
    this.updateLine(this.cyclotronLine, points);
    this.cyclotronLine.computeLineDistances();
  }

  private updateVectors(
    state: ParticleState,
    fields: FieldParameters,
    visible: boolean,
    origin: Vector3,
  ): void {
    this.velocityArrow.visible = visible;
    this.forceArrow.visible = visible;
    if (!visible) {
      return;
    }

    const velocity = new Vector3(state.vx, 0, state.vy);
    if (velocity.lengthSq() > 1e-8) {
      const length = Math.min(maximumArrowLength, velocity.length() * velocityArrowScale);
      this.velocityArrow.position.copy(origin);
      this.velocityArrow.setDirection(velocity.normalize());
      this.velocityArrow.setLength(length, 12, 6);
    }

    const acceleration = lorentzAcceleration(state, fields);
    const force = new Vector3(acceleration.x, 0, acceleration.y);
    if (force.lengthSq() > 1e-8) {
      const length = Math.min(maximumArrowLength, force.length() * forceArrowScale);
      this.forceArrow.position.copy(origin);
      this.forceArrow.setDirection(force.normalize());
      this.forceArrow.setLength(length, 12, 6);
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
