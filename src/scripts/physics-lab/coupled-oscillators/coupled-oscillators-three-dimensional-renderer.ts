import {
  AdditiveBlending,
  AmbientLight,
  ArrowHelper,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshPhysicalMaterial,
  PlaneGeometry,
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
import { modeShape } from './coupled-oscillators-physics';

export type CoupledOscillatorsThreeDimensionalScene = {
  beadCount: number;
  displacements: number[];
  velocities: number[];
  activeModeNumbers: number[];
  envelopeAmplitudes: number[];
  showEnvelopes: boolean;
  showSprings: boolean;
};

const maximumBeadCount = 12;
const maximumEnvelopeCount = 4;
const chainLeftX = -330;
const chainRightX = 330;
const chainWidth = chainRightX - chainLeftX;
const equilibriumHeight = 24;
const displacementScale = 145;
const modeColors = [0x5794ff, 0xff6680, 0xb58cff, 0xffbd58];

export class CoupledOscillatorsThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly beads: Array<Mesh<SphereGeometry, MeshPhysicalMaterial>> = [];
  private readonly halos: Sprite[] = [];
  private readonly velocityArrows: ArrowHelper[] = [];
  private readonly springLines: Array<Line<BufferGeometry, LineBasicMaterial>> = [];
  private readonly envelopeLines: Array<Line<BufferGeometry, LineDashedMaterial>> = [];
  private readonly connectingLine = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: 0x86a2ba,
      transparent: true,
      opacity: 0.75,
    }),
  );
  private readonly risingColor = new Color(0x43e1c1);
  private readonly fallingColor = new Color(0xff6178);
  private readonly restingColor = new Color(0x89a2b8);

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x07131f,
      cameraPosition: [430, 300, 570],
      cameraTarget: [0, 20, 0],
      fog: { color: 0x07131f, near: 760, far: 1220 },
      minimumCameraDistance: 380,
      maximumCameraDistance: 1040,
      legend: [
        {
          color: '#43e1c1',
          label: localizedThreeDimensionalText('moving up', '向上运动'),
        },
        {
          color: '#ff6178',
          label: localizedThreeDimensionalText('moving down', '向下运动'),
        },
        {
          color: '#8f9fff',
          label: localizedThreeDimensionalText('mode shape', '简正模形状'),
        },
      ],
    });

    const floor = new Mesh(
      new PlaneGeometry(850, 500),
      new MeshPhysicalMaterial({
        color: 0x102b3d,
        roughness: 0.78,
        metalness: 0.12,
        transparent: true,
        opacity: 0.72,
        side: DoubleSide,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -142;

    const grid = new GridHelper(720, 18, 0x345977, 0x19384f);
    grid.position.y = -140;
    grid.material.transparent = true;
    grid.material.opacity = 0.48;

    const equilibriumLine = new Line(
      new BufferGeometry().setFromPoints([
        new Vector3(chainLeftX, equilibriumHeight, 0),
        new Vector3(chainRightX, equilibriumHeight, 0),
      ]),
      new LineDashedMaterial({
        color: 0x647f97,
        dashSize: 6,
        gapSize: 9,
        transparent: true,
        opacity: 0.5,
      }),
    );
    equilibriumLine.computeLineDistances();

    const wallGeometry = new CylinderGeometry(9, 12, 230, 18);
    const wallMaterial = new MeshPhysicalMaterial({
      color: 0x91a9bd,
      metalness: 0.72,
      roughness: 0.27,
      clearcoat: 0.35,
    });
    const leftWall = new Mesh(wallGeometry, wallMaterial);
    leftWall.position.set(chainLeftX, equilibriumHeight, 0);
    const rightWall = new Mesh(wallGeometry, wallMaterial);
    rightWall.position.set(chainRightX, equilibriumHeight, 0);

    const haloTexture = createRadialGlowTexture(
      '#ffffff',
      'rgba(108, 166, 255, 0.5)',
    );
    for (let index = 0; index < maximumBeadCount; index += 1) {
      const bead = new Mesh(
        new SphereGeometry(12, 28, 20),
        new MeshPhysicalMaterial({
          color: 0x89a2b8,
          emissive: 0x173b5a,
          emissiveIntensity: 1.15,
          roughness: 0.25,
          metalness: 0.16,
          clearcoat: 0.66,
          clearcoatRoughness: 0.18,
        }),
      );
      const halo = new Sprite(
        new SpriteMaterial({
          map: haloTexture,
          color: 0x80aaff,
          transparent: true,
          opacity: 0.62,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      halo.scale.set(52, 52, 1);
      const velocityArrow = new ArrowHelper(
        new Vector3(0, 1, 0),
        new Vector3(),
        1,
        0x43e1c1,
        8,
        4,
      );
      setThreeDimensionalMaterialOpacity(velocityArrow.line.material, 0.78);
      setThreeDimensionalMaterialOpacity(velocityArrow.cone.material, 0.9);
      this.beads.push(bead);
      this.halos.push(halo);
      this.velocityArrows.push(velocityArrow);
    }

    for (let index = 0; index <= maximumBeadCount; index += 1) {
      this.springLines.push(
        new Line(
          new BufferGeometry(),
          new LineBasicMaterial({
            color: 0xa8bed0,
            transparent: true,
            opacity: 0.82,
          }),
        ),
      );
    }

    for (let index = 0; index < maximumEnvelopeCount; index += 1) {
      const envelope = new Line(
        new BufferGeometry(),
        new LineDashedMaterial({
          color: modeColors[index],
          dashSize: 7,
          gapSize: 7,
          transparent: true,
          opacity: 0.72,
        }),
      );
      this.envelopeLines.push(envelope);
    }

    const ambientLight = new AmbientLight(0xb6d5ff, 0.62);
    const keyLight = new DirectionalLight(0xe1edff, 1.8);
    keyLight.position.set(-220, 420, 310);
    const rimLight = new DirectionalLight(0xff8da4, 0.72);
    rimLight.position.set(260, 160, -300);

    this.stage.add(
      ambientLight,
      keyLight,
      rimLight,
      floor,
      grid,
      equilibriumLine,
      leftWall,
      rightWall,
      ...this.envelopeLines,
      ...this.springLines,
      this.connectingLine,
      ...this.halos,
      ...this.beads,
      ...this.velocityArrows,
    );
  }

  draw(scene: CoupledOscillatorsThreeDimensionalScene): void {
    const beadPositions = this.updateBeads(scene);
    this.updateConnections(scene, beadPositions);
    this.updateEnvelopes(scene);
    this.stage.render();
  }

  dispose(): void {
    this.stage.dispose();
  }

  private beadPosition(
    beadIndex: number,
    beadCount: number,
    displacement: number,
  ): Vector3 {
    return new Vector3(
      chainLeftX + (chainWidth * beadIndex) / (beadCount + 1),
      equilibriumHeight + displacement * displacementScale,
      0,
    );
  }

  private updateBeads(scene: CoupledOscillatorsThreeDimensionalScene): Vector3[] {
    const positions: Vector3[] = [];
    for (let index = 0; index < maximumBeadCount; index += 1) {
      const visible = index < scene.beadCount;
      const bead = this.beads[index];
      const halo = this.halos[index];
      const arrow = this.velocityArrows[index];
      bead.visible = visible;
      halo.visible = visible;
      arrow.visible = visible;
      if (!visible) {
        continue;
      }

      const displacement = scene.displacements[index] ?? 0;
      const velocity = scene.velocities[index] ?? 0;
      const position = this.beadPosition(index + 1, scene.beadCount, displacement);
      positions.push(position);
      bead.position.copy(position);
      halo.position.copy(position);
      bead.rotation.y += 0.022;

      const moving = Math.abs(velocity) > 1e-4;
      const color = !moving
        ? this.restingColor
        : velocity > 0
          ? this.risingColor
          : this.fallingColor;
      bead.material.color.copy(color);
      bead.material.emissive.copy(color).multiplyScalar(0.28);
      halo.material.color.copy(color);
      halo.scale.setScalar(48 + Math.min(Math.abs(velocity) * 10, 18));

      arrow.visible = moving;
      if (moving) {
        arrow.position.copy(position);
        arrow.setDirection(new Vector3(0, Math.sign(velocity), 0));
        arrow.setLength(Math.min(72, 16 + Math.abs(velocity) * 30), 9, 4.5);
        arrow.setColor(color);
      }
    }
    return positions;
  }

  private updateConnections(
    scene: CoupledOscillatorsThreeDimensionalScene,
    beadPositions: Vector3[],
  ): void {
    const connectionPoints = [
      new Vector3(chainLeftX, equilibriumHeight, 0),
      ...beadPositions,
      new Vector3(chainRightX, equilibriumHeight, 0),
    ];

    for (let index = 0; index < this.springLines.length; index += 1) {
      const line = this.springLines[index];
      const visible = scene.showSprings && index < connectionPoints.length - 1;
      line.visible = visible;
      if (!visible) {
        continue;
      }
      line.geometry.dispose();
      line.geometry = new BufferGeometry().setFromPoints(
        this.springPoints(connectionPoints[index], connectionPoints[index + 1]),
      );
    }

    this.connectingLine.visible = !scene.showSprings;
    if (this.connectingLine.visible) {
      this.connectingLine.geometry.dispose();
      this.connectingLine.geometry = new BufferGeometry().setFromPoints(connectionPoints);
    }
  }

  private springPoints(from: Vector3, to: Vector3): Vector3[] {
    const direction = new Vector3().subVectors(to, from);
    const length = direction.length();
    if (length < 1e-6) {
      return [from.clone(), to.clone()];
    }
    direction.normalize();
    const firstNormal = new Vector3().crossVectors(direction, new Vector3(0, 0, 1));
    if (firstNormal.lengthSq() < 1e-6) {
      firstNormal.set(0, 1, 0);
    } else {
      firstNormal.normalize();
    }
    const secondNormal = new Vector3().crossVectors(direction, firstNormal).normalize();
    const points: Vector3[] = [];
    const samples = 46;
    const leadFraction = 0.13;
    const turns = 8;
    for (let index = 0; index <= samples; index += 1) {
      const fraction = index / samples;
      const point = from.clone().lerp(to, fraction);
      if (fraction > leadFraction && fraction < 1 - leadFraction) {
        const coilFraction =
          (fraction - leadFraction) / (1 - leadFraction * 2);
        const phase = coilFraction * turns * Math.PI * 2;
        point
          .addScaledVector(firstNormal, Math.cos(phase) * 7)
          .addScaledVector(secondNormal, Math.sin(phase) * 7);
      }
      points.push(point);
    }
    return points;
  }

  private updateEnvelopes(scene: CoupledOscillatorsThreeDimensionalScene): void {
    for (let index = 0; index < this.envelopeLines.length; index += 1) {
      const line = this.envelopeLines[index];
      const modeNumber = scene.activeModeNumbers[index];
      const visible = scene.showEnvelopes && modeNumber !== undefined;
      line.visible = visible;
      if (!visible) {
        continue;
      }
      const amplitude = scene.envelopeAmplitudes[index] ?? 0;
      const points: Vector3[] = [];
      const samples = 180;
      for (let sample = 0; sample <= samples; sample += 1) {
        const fraction = sample / samples;
        const continuousIndex = (scene.beadCount + 1) * fraction;
        points.push(
          new Vector3(
            chainLeftX + chainWidth * fraction,
            equilibriumHeight +
              amplitude *
                modeShape(modeNumber, continuousIndex, scene.beadCount) *
                displacementScale,
            -24 - index * 13,
          ),
        );
      }
      line.geometry.dispose();
      line.geometry = new BufferGeometry().setFromPoints(points);
      line.computeLineDistances();
    }
  }
}
