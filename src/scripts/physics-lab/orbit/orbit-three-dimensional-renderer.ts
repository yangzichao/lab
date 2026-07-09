import {
  AdditiveBlending,
  AmbientLight,
  ArrowHelper,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  PolarGridHelper,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { Point } from '../shared/stage';
import {
  createRadialGlowTexture,
  createStarField,
  localizedThreeDimensionalText,
  setThreeDimensionalMaterialOpacity,
  ThreeDimensionalStage,
} from '../shared/three-dimensional-stage';
import { gravityAcceleration, type OrbitMetrics, type OrbitState } from './orbit-physics';

export type OrbitThreeDimensionalScene = {
  state: OrbitState;
  mu: number;
  trail: Point[];
  metrics: OrbitMetrics;
  showTrail: boolean;
  showOrbit: boolean;
  showVectors: boolean;
};

const velocityArrowScale = 6;
const gravityArrowScale = 240;
const maximumArrowLength = 140;

const worldPosition = (point: Point, height = 1.5): Vector3 =>
  new Vector3(point.x, height, point.y);

export class OrbitThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly star: Mesh<SphereGeometry, MeshStandardMaterial>;
  private readonly starHalo: Sprite;
  private readonly planet: Mesh<SphereGeometry, MeshStandardMaterial>;
  private readonly planetHalo: Sprite;
  private readonly trailLine: Line<BufferGeometry, LineBasicMaterial>;
  private readonly predictedOrbitLine: Line<BufferGeometry, LineDashedMaterial>;
  private readonly radiusLine: Line<BufferGeometry, LineDashedMaterial>;
  private readonly velocityArrow = new ArrowHelper(
    new Vector3(1, 0, 0),
    new Vector3(),
    1,
    0x43e1c1,
  );
  private readonly gravityArrow = new ArrowHelper(
    new Vector3(-1, 0, 0),
    new Vector3(),
    1,
    0xffb454,
  );
  private readonly periapsisMarker: Mesh<SphereGeometry, MeshBasicMaterial>;
  private readonly apoapsisMarker: Mesh<SphereGeometry, MeshBasicMaterial>;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x06101d,
      cameraPosition: [0, 300, 485],
      cameraTarget: [0, 0, 0],
      fog: { color: 0x06101d, near: 560, far: 1080 },
      minimumCameraDistance: 250,
      maximumCameraDistance: 900,
      legend: [
        { color: '#43e1c1', label: localizedThreeDimensionalText('velocity', '速度') },
        { color: '#ffb454', label: localizedThreeDimensionalText('gravity', '引力') },
        { color: '#79a9ff', label: localizedThreeDimensionalText('predicted orbit', '预测轨道') },
      ],
    });

    const ambientLight = new AmbientLight(0x9ebfff, 0.42);
    const starLight = new PointLight(0xffc45d, 4.8, 680, 1.6);
    starLight.position.set(0, 28, 0);

    const orbitalPlane = new Mesh(
      new CircleGeometry(430, 96),
      new MeshBasicMaterial({
        color: 0x173453,
        transparent: true,
        opacity: 0.12,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    orbitalPlane.rotation.x = -Math.PI / 2;
    orbitalPlane.position.y = -4;

    const polarGrid = new PolarGridHelper(430, 16, 9, 64, 0x244767, 0x162d46);
    polarGrid.position.y = -2.5;
    setThreeDimensionalMaterialOpacity(polarGrid.material, 0.55);

    this.star = new Mesh(
      new SphereGeometry(18, 40, 28),
      new MeshStandardMaterial({
        color: 0xffc04d,
        emissive: 0xff7a16,
        emissiveIntensity: 2.6,
        roughness: 0.74,
      }),
    );
    this.star.position.y = 12;
    this.starHalo = new Sprite(
      new SpriteMaterial({
        map: createRadialGlowTexture('#fff7c8', 'rgba(255, 168, 58, 0.62)'),
        color: 0xffa02b,
        transparent: true,
        opacity: 0.92,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.starHalo.position.y = 12;
    this.starHalo.scale.set(118, 118, 1);

    this.planet = new Mesh(
      new SphereGeometry(10, 32, 24),
      new MeshStandardMaterial({
        color: 0x4f8dff,
        emissive: 0x153f93,
        emissiveIntensity: 1.15,
        metalness: 0.08,
        roughness: 0.42,
      }),
    );
    this.planetHalo = new Sprite(
      new SpriteMaterial({
        map: createRadialGlowTexture('#d6e8ff', 'rgba(68, 135, 255, 0.42)'),
        color: 0x4b8dff,
        transparent: true,
        opacity: 0.7,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.planetHalo.scale.set(52, 52, 1);

    this.trailLine = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: 0x397ef6,
        transparent: true,
        opacity: 0.82,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.predictedOrbitLine = new Line(
      new BufferGeometry(),
      new LineDashedMaterial({
        color: 0x79a9ff,
        dashSize: 7,
        gapSize: 6,
        transparent: true,
        opacity: 0.62,
      }),
    );
    this.radiusLine = new Line(
      new BufferGeometry(),
      new LineDashedMaterial({
        color: 0x6e89a3,
        dashSize: 4,
        gapSize: 7,
        transparent: true,
        opacity: 0.46,
      }),
    );

    const markerGeometry = new SphereGeometry(3.5, 16, 12);
    this.periapsisMarker = new Mesh(
      markerGeometry,
      new MeshBasicMaterial({ color: 0x43e1c1 }),
    );
    this.apoapsisMarker = new Mesh(
      markerGeometry,
      new MeshBasicMaterial({ color: 0xb58cff }),
    );

    setThreeDimensionalMaterialOpacity(this.velocityArrow.line.material, 0.9);
    setThreeDimensionalMaterialOpacity(this.gravityArrow.line.material, 0.9);

    this.stage.add(
      createStarField(430, 880, 0x8db9ef, 11),
      ambientLight,
      starLight,
      orbitalPlane,
      polarGrid,
      this.starHalo,
      this.star,
      this.predictedOrbitLine,
      this.trailLine,
      this.radiusLine,
      this.planetHalo,
      this.planet,
      this.velocityArrow,
      this.gravityArrow,
      this.periapsisMarker,
      this.apoapsisMarker,
    );
  }

  draw(scene: OrbitThreeDimensionalScene): void {
    const planetPosition = worldPosition(scene.state, 7);
    this.planet.position.copy(planetPosition);
    this.planetHalo.position.copy(planetPosition);
    this.planet.rotation.y += 0.012;

    const pulse = 1 + Math.sin(performance.now() * 0.0024) * 0.06;
    this.starHalo.scale.setScalar(118 * pulse);
    this.star.rotation.y += 0.002;

    this.updateLine(this.radiusLine, [new Vector3(0, 1.5, 0), planetPosition]);
    this.radiusLine.computeLineDistances();

    this.trailLine.visible = scene.showTrail && scene.trail.length > 1;
    if (this.trailLine.visible) {
      this.updateLine(
        this.trailLine,
        scene.trail.map((point, index) =>
          worldPosition(point, 2.3 + (index / scene.trail.length) * 0.9),
        ),
      );
    }

    this.updatePredictedOrbit(scene.metrics, scene.showOrbit);
    this.updateVectors(scene, planetPosition);
    this.stage.render();
  }

  dispose(): void {
    this.stage.dispose();
  }

  private updatePredictedOrbit(metrics: OrbitMetrics, showOrbit: boolean): void {
    const visible = showOrbit && metrics.bound && Number.isFinite(metrics.semiMajor);
    this.predictedOrbitLine.visible = visible;
    this.periapsisMarker.visible = visible;
    this.apoapsisMarker.visible = visible;
    if (!visible) {
      return;
    }

    const cosAngle = Math.cos(metrics.periapsisAngle);
    const sinAngle = Math.sin(metrics.periapsisAngle);
    const focusOffset = metrics.semiMajor * metrics.eccentricity;
    const centerX = -focusOffset * cosAngle;
    const centerY = -focusOffset * sinAngle;
    const points: Vector3[] = [];
    for (let index = 0; index <= 180; index += 1) {
      const angle = (index / 180) * Math.PI * 2;
      const ellipseX = metrics.semiMajor * Math.cos(angle);
      const ellipseY = metrics.semiMinor * Math.sin(angle);
      const x = centerX + ellipseX * cosAngle - ellipseY * sinAngle;
      const y = centerY + ellipseX * sinAngle + ellipseY * cosAngle;
      points.push(worldPosition({ x, y }, 1.3));
    }
    this.updateLine(this.predictedOrbitLine, points);
    this.predictedOrbitLine.computeLineDistances();

    this.periapsisMarker.position.copy(
      worldPosition({ x: metrics.periapsis * cosAngle, y: metrics.periapsis * sinAngle }, 2),
    );
    this.apoapsisMarker.position.copy(
      worldPosition({ x: -metrics.apoapsis * cosAngle, y: -metrics.apoapsis * sinAngle }, 2),
    );
  }

  private updateVectors(scene: OrbitThreeDimensionalScene, origin: Vector3): void {
    this.velocityArrow.visible = scene.showVectors;
    this.gravityArrow.visible = scene.showVectors;
    if (!scene.showVectors) {
      return;
    }

    const velocity = new Vector3(scene.state.vx, 0, scene.state.vy);
    const velocityLength = Math.min(maximumArrowLength, velocity.length() * velocityArrowScale);
    if (velocity.lengthSq() > 1e-8) {
      this.velocityArrow.position.copy(origin);
      this.velocityArrow.setDirection(velocity.normalize());
      this.velocityArrow.setLength(velocityLength, 12, 6);
    }

    const gravity = gravityAcceleration(scene.state, scene.mu);
    const gravityVector = new Vector3(gravity.x, 0, gravity.y);
    const gravityLength = Math.min(maximumArrowLength, gravityVector.length() * gravityArrowScale);
    if (gravityVector.lengthSq() > 1e-8) {
      this.gravityArrow.position.copy(origin);
      this.gravityArrow.setDirection(gravityVector.normalize());
      this.gravityArrow.setLength(gravityLength, 12, 6);
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
