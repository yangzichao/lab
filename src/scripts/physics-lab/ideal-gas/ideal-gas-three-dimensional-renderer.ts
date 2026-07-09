import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  EdgesGeometry,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  localizedThreeDimensionalText,
  ThreeDimensionalStage,
} from '../shared/three-dimensional-stage';
import {
  BOX_DEPTH,
  BOX_HEIGHT,
  BOX_WIDTH,
  maxwellSpeedDensity,
  type GasState,
} from './ideal-gas-physics';

export type IdealGasThreeDimensionalScene = {
  state: GasState;
  temperature: number;
  mostProbableSpeed: number;
  speedAxisMaximum: number;
  showHistogram: boolean;
  colorBySpeed: boolean;
};

const maximumParticleCount = 240;
const histogramBucketCount = 22;
const boxWidth = 300;
const boxHeight = 260;
const boxDepth = 300;
const boxCenterX = -105;
const histogramX = 245;
const histogramHeight = 190;
const histogramDepth = 300;
const histogramBaseline = 8;

export class IdealGasThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly particles: InstancedMesh<SphereGeometry, MeshPhysicalMaterial>;
  private readonly histogram = new Group();
  private readonly histogramBars: InstancedMesh<BoxGeometry, MeshPhysicalMaterial>;
  private readonly theoryCurve: Line<BufferGeometry, LineBasicMaterial>;
  private readonly mostProbableMarker: Line<BufferGeometry, LineDashedMaterial>;
  private readonly reusableTransform = new Object3D();
  private readonly coldColor = new Color(0x4f8dff);
  private readonly hotColor = new Color(0xff6178);
  private readonly neutralColor = new Color(0x43e1c1);
  private readonly reusableColor = new Color();

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x07121d,
      cameraPosition: [465, 330, 485],
      cameraTarget: [20, 105, 0],
      fog: { color: 0x07121d, near: 760, far: 1250 },
      minimumCameraDistance: 390,
      maximumCameraDistance: 1050,
      legend: [
        { color: '#4f8dff', label: localizedThreeDimensionalText('slow', '低速') },
        { color: '#ff6178', label: localizedThreeDimensionalText('fast', '高速') },
        { color: '#b58cff', label: localizedThreeDimensionalText('Maxwell curve', '麦克斯韦曲线') },
      ],
    });

    const ambientLight = new AmbientLight(0xb7d2ff, 0.72);
    const keyLight = new DirectionalLight(0xd5e6ff, 1.7);
    keyLight.position.set(260, 420, 290);
    const rimLight = new DirectionalLight(0xff8ca0, 0.7);
    rimLight.position.set(-280, 180, -260);

    const enclosure = new Mesh(
      new BoxGeometry(boxWidth, boxHeight, boxDepth),
      new MeshPhysicalMaterial({
        color: 0x173c59,
        transparent: true,
        opacity: 0.075,
        roughness: 0.28,
        metalness: 0.05,
        transmission: 0.12,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    enclosure.position.set(boxCenterX, boxHeight / 2, 0);
    const enclosureEdges = new LineSegments(
      new EdgesGeometry(enclosure.geometry),
      new LineBasicMaterial({ color: 0x82a9c8, transparent: true, opacity: 0.72 }),
    );
    enclosureEdges.position.copy(enclosure.position);

    const floor = new Mesh(
      new PlaneGeometry(760, 520),
      new MeshBasicMaterial({
        color: 0x0e2738,
        transparent: true,
        opacity: 0.58,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2;

    this.particles = new InstancedMesh(
      new SphereGeometry(5.2, 16, 12),
      new MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0x17375f,
        emissiveIntensity: 0.65,
        roughness: 0.3,
        metalness: 0.08,
        clearcoat: 0.54,
        clearcoatRoughness: 0.22,
      }),
      maximumParticleCount,
    );
    this.particles.instanceMatrix.setUsage(DynamicDrawUsage);

    this.histogramBars = new InstancedMesh(
      new BoxGeometry(14, 1, 1),
      new MeshPhysicalMaterial({
        color: 0xffffff,
        emissive: 0x10284d,
        emissiveIntensity: 0.5,
        roughness: 0.4,
        transparent: true,
        opacity: 0.88,
      }),
      histogramBucketCount,
    );
    this.histogramBars.instanceMatrix.setUsage(DynamicDrawUsage);

    this.theoryCurve = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({ color: 0xb58cff, transparent: true, opacity: 0.96 }),
    );
    this.mostProbableMarker = new Line(
      new BufferGeometry(),
      new LineDashedMaterial({
        color: 0xffc15c,
        dashSize: 5,
        gapSize: 5,
        transparent: true,
        opacity: 0.82,
      }),
    );

    const histogramFrame = new LineSegments(
      new BufferGeometry().setFromPoints([
        new Vector3(histogramX, histogramBaseline, -histogramDepth / 2),
        new Vector3(histogramX, histogramBaseline, histogramDepth / 2),
        new Vector3(histogramX, histogramBaseline, -histogramDepth / 2),
        new Vector3(histogramX, histogramBaseline + histogramHeight, -histogramDepth / 2),
      ]),
      new LineBasicMaterial({ color: 0x6b879f, transparent: true, opacity: 0.62 }),
    );
    this.histogram.add(
      histogramFrame,
      this.histogramBars,
      this.theoryCurve,
      this.mostProbableMarker,
    );

    this.stage.add(
      ambientLight,
      keyLight,
      rimLight,
      floor,
      enclosure,
      enclosureEdges,
      this.particles,
      this.histogram,
    );
  }

  draw(scene: IdealGasThreeDimensionalScene): void {
    this.updateParticles(scene);
    this.updateHistogram(scene);
    this.stage.render();
  }

  dispose(): void {
    this.stage.dispose();
  }

  private updateParticles(scene: IdealGasThreeDimensionalScene): void {
    this.particles.count = Math.min(scene.state.particles.length, maximumParticleCount);
    const safeSpeedMaximum = Math.max(scene.speedAxisMaximum, 1e-6);

    for (let index = 0; index < this.particles.count; index += 1) {
      const particle = scene.state.particles[index];
      this.reusableTransform.position.set(
        boxCenterX + (particle.x / BOX_WIDTH - 0.5) * boxWidth,
        (particle.y / BOX_HEIGHT) * boxHeight,
        (particle.z / BOX_DEPTH - 0.5) * boxDepth,
      );
      this.reusableTransform.scale.setScalar(1);
      this.reusableTransform.updateMatrix();
      this.particles.setMatrixAt(index, this.reusableTransform.matrix);

      const speedFraction = Math.min(
        Math.hypot(particle.vx, particle.vy, particle.vz) / safeSpeedMaximum,
        1,
      );
      const color = scene.colorBySpeed
        ? this.reusableColor.lerpColors(this.coldColor, this.hotColor, speedFraction)
        : this.neutralColor;
      this.particles.setColorAt(index, color);
    }
    this.particles.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) {
      this.particles.instanceColor.needsUpdate = true;
    }
  }

  private updateHistogram(scene: IdealGasThreeDimensionalScene): void {
    this.histogram.visible = scene.showHistogram;
    if (!scene.showHistogram) {
      return;
    }

    const safeSpeedMaximum = Math.max(scene.speedAxisMaximum, 1e-6);
    const bucketWidth = safeSpeedMaximum / histogramBucketCount;
    const counts = new Array<number>(histogramBucketCount).fill(0);
    for (const particle of scene.state.particles) {
      const speed = Math.hypot(particle.vx, particle.vy, particle.vz);
      const bucketIndex = Math.min(
        histogramBucketCount - 1,
        Math.floor(speed / bucketWidth),
      );
      counts[bucketIndex] += 1;
    }

    const particleCount = Math.max(scene.state.particles.length, 1);
    const peakProbability = Math.max(...counts.map((count) => count / particleCount));
    const peakDensity =
      maxwellSpeedDensity(scene.mostProbableSpeed, scene.temperature) * bucketWidth;
    const probabilityMaximum = Math.max(peakProbability, peakDensity, 1e-6) * 1.12;
    const barDepth = (histogramDepth / histogramBucketCount) * 0.72;

    for (let index = 0; index < histogramBucketCount; index += 1) {
      const probability = counts[index] / particleCount;
      const barHeight = Math.max(0.2, (probability / probabilityMaximum) * histogramHeight);
      const speedFraction = (index + 0.5) / histogramBucketCount;
      this.reusableTransform.position.set(
        histogramX,
        histogramBaseline + barHeight / 2,
        -histogramDepth / 2 + ((index + 0.5) / histogramBucketCount) * histogramDepth,
      );
      this.reusableTransform.scale.set(1, barHeight, barDepth);
      this.reusableTransform.updateMatrix();
      this.histogramBars.setMatrixAt(index, this.reusableTransform.matrix);
      this.histogramBars.setColorAt(
        index,
        this.reusableColor.lerpColors(this.coldColor, this.hotColor, speedFraction),
      );
    }
    this.histogramBars.instanceMatrix.needsUpdate = true;
    if (this.histogramBars.instanceColor) {
      this.histogramBars.instanceColor.needsUpdate = true;
    }

    const theoryPoints: Vector3[] = [];
    const curveSamples = 100;
    for (let index = 0; index <= curveSamples; index += 1) {
      const speedFraction = index / curveSamples;
      const speed = speedFraction * safeSpeedMaximum;
      const probability = maxwellSpeedDensity(speed, scene.temperature) * bucketWidth;
      theoryPoints.push(
        new Vector3(
          histogramX - 9,
          histogramBaseline + (probability / probabilityMaximum) * histogramHeight,
          -histogramDepth / 2 + speedFraction * histogramDepth,
        ),
      );
    }
    this.theoryCurve.geometry.dispose();
    this.theoryCurve.geometry = new BufferGeometry().setFromPoints(theoryPoints);

    const markerDepth =
      -histogramDepth / 2 +
      Math.min(scene.mostProbableSpeed / safeSpeedMaximum, 1) * histogramDepth;
    this.mostProbableMarker.geometry.dispose();
    this.mostProbableMarker.geometry = new BufferGeometry().setFromPoints([
      new Vector3(histogramX - 10, histogramBaseline, markerDepth),
      new Vector3(histogramX - 10, histogramBaseline + histogramHeight, markerDepth),
    ]);
    this.mostProbableMarker.computeLineDistances();
  }
}
