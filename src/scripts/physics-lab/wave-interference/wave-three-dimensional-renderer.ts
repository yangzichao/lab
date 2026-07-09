import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type BufferAttribute,
} from 'three';
import {
  stagePointToThreeDimensionalPlane,
  threeDimensionalPlaneToStagePoint,
  type ThreeDimensionalPlaneSize,
} from '../shared/three-dimensional-plane';
import { STAGE_HEIGHT, STAGE_WIDTH, type Point } from '../shared/stage';
import {
  createRadialGlowTexture,
  localizedThreeDimensionalText,
  ThreeDimensionalStage,
} from '../shared/three-dimensional-stage';
import { amplitudeAt, fieldAt, type WaveParameters } from './wave-physics';

export type WaveThreeDimensionalScene = {
  parameters: WaveParameters;
  sources: [Point, Point];
  phaseTime: number;
  sample: Point;
  showWavefronts: boolean;
  showIntensity: boolean;
};

const wavePlane: ThreeDimensionalPlaneSize = { width: 700, depth: 430 };
const surfaceColumns = 72;
const surfaceRows = 44;
const screenStageX = STAGE_WIDTH - 132;
const screenWorldX = (screenStageX / STAGE_WIDTH - 0.5) * wavePlane.width;
const displacementScale = 38;

function surfaceHeight(field: number): number {
  return field * displacementScale;
}

export class WaveThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly surfaceGeometry = new PlaneGeometry(
    wavePlane.width,
    wavePlane.depth,
    surfaceColumns,
    surfaceRows,
  );
  private readonly surface: Mesh<PlaneGeometry, MeshPhysicalMaterial>;
  private readonly wavefrontWireframe: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly baseCoordinates: Array<{ x: number; z: number }> = [];
  private readonly sourceMeshes: Array<Mesh<SphereGeometry, MeshPhysicalMaterial>> = [];
  private readonly sourceGlows: Sprite[] = [];
  private readonly probe: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly sourcePathLines: Array<Line<BufferGeometry, LineDashedMaterial>> = [];
  private readonly intensityGroup = new Group();
  private readonly intensityProfile: Line<BufferGeometry, LineBasicMaterial>;
  private frameCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x07121e,
      cameraPosition: [430, 330, 510],
      cameraTarget: [0, 0, 0],
      fog: { color: 0x07121e, near: 730, far: 1180 },
      minimumCameraDistance: 350,
      maximumCameraDistance: 980,
      legend: [
        { color: '#ff6178', label: localizedThreeDimensionalText('crest', '波峰') },
        { color: '#4f8dff', label: localizedThreeDimensionalText('trough', '波谷') },
        { color: '#43e1c1', label: localizedThreeDimensionalText('intensity', '强度') },
      ],
    });

    this.surfaceGeometry.rotateX(-Math.PI / 2);
    const positions = this.surfaceGeometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      this.baseCoordinates.push({ x: positions.getX(index), z: positions.getZ(index) });
    }
    this.surfaceGeometry.setAttribute(
      'color',
      new Float32BufferAttribute(new Float32Array(positions.count * 3), 3),
    );

    this.surface = new Mesh(
      this.surfaceGeometry,
      new MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.4,
        metalness: 0.08,
        clearcoat: 0.42,
        clearcoatRoughness: 0.25,
        side: DoubleSide,
      }),
    );
    this.wavefrontWireframe = new Mesh(
      this.surfaceGeometry,
      new MeshBasicMaterial({
        color: 0xc8dded,
        wireframe: true,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    );

    const sourceColors = [0xff6178, 0x4f8dff];
    for (let index = 0; index < 2; index += 1) {
      const source = new Mesh(
        new SphereGeometry(10, 28, 20),
        new MeshPhysicalMaterial({
          color: sourceColors[index],
          emissive: index === 0 ? 0x8d1c34 : 0x173f92,
          emissiveIntensity: 1.7,
          roughness: 0.26,
          clearcoat: 0.6,
        }),
      );
      const glow = new Sprite(
        new SpriteMaterial({
          map: createRadialGlowTexture(
            '#ffffff',
            index === 0 ? 'rgba(255, 97, 120, 0.55)' : 'rgba(79, 141, 255, 0.55)',
          ),
          color: sourceColors[index],
          transparent: true,
          opacity: 0.82,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.scale.set(58, 58, 1);
      const path = new Line(
        new BufferGeometry(),
        new LineDashedMaterial({
          color: sourceColors[index],
          dashSize: 5,
          gapSize: 7,
          transparent: true,
          opacity: 0.48,
        }),
      );
      this.sourceMeshes.push(source);
      this.sourceGlows.push(glow);
      this.sourcePathLines.push(path);
    }

    this.probe = new Mesh(
      new RingGeometry(7, 11, 32),
      new MeshBasicMaterial({ color: 0xeaf5ff, transparent: true, opacity: 0.96, side: DoubleSide }),
    );
    this.probe.rotation.x = -Math.PI / 2;

    const intensityScreen = new Mesh(
      new PlaneGeometry(wavePlane.depth * 0.9, 168),
      new MeshBasicMaterial({
        color: 0x102b3b,
        transparent: true,
        opacity: 0.52,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    intensityScreen.rotation.y = Math.PI / 2;
    intensityScreen.position.set(screenWorldX, 84, 0);
    const intensityScreenFrame = new LineSegments(
      new BufferGeometry().setFromPoints([
        new Vector3(screenWorldX, 0, -wavePlane.depth * 0.45),
        new Vector3(screenWorldX, 168, -wavePlane.depth * 0.45),
        new Vector3(screenWorldX, 168, -wavePlane.depth * 0.45),
        new Vector3(screenWorldX, 168, wavePlane.depth * 0.45),
        new Vector3(screenWorldX, 168, wavePlane.depth * 0.45),
        new Vector3(screenWorldX, 0, wavePlane.depth * 0.45),
      ]),
      new LineBasicMaterial({ color: 0x6f94a9, transparent: true, opacity: 0.68 }),
    );
    this.intensityProfile = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: 0x43e1c1,
        transparent: true,
        opacity: 0.96,
        blending: AdditiveBlending,
      }),
    );
    this.intensityGroup.add(intensityScreen, intensityScreenFrame, this.intensityProfile);

    const ambientLight = new AmbientLight(0xb7d3ff, 0.66);
    const keyLight = new DirectionalLight(0xd8eaff, 1.65);
    keyLight.position.set(-260, 380, 260);
    const rimLight = new DirectionalLight(0xff849a, 0.7);
    rimLight.position.set(260, 170, -240);
    const sourceLight = new PointLight(0xa971ff, 1.8, 260, 1.8);
    sourceLight.position.set(0, 90, 0);

    this.stage.add(
      ambientLight,
      keyLight,
      rimLight,
      sourceLight,
      this.surface,
      this.wavefrontWireframe,
      ...this.sourcePathLines,
      ...this.sourceGlows,
      ...this.sourceMeshes,
      this.probe,
      this.intensityGroup,
    );
  }

  draw(scene: WaveThreeDimensionalScene): void {
    this.frameCount += 1;
    this.updateSurface(scene);
    this.updateSourcesAndProbe(scene);
    this.updateIntensityProfile(scene);
    this.stage.render();
  }

  stagePointFromPointer(event: PointerEvent): Point | null {
    const intersection = this.stage.projectPointerToHorizontalPlane(event);
    if (!intersection) {
      return null;
    }
    const point = threeDimensionalPlaneToStagePoint(intersection, wavePlane);
    const inside =
      point.x >= 0 && point.x <= STAGE_WIDTH && point.y >= 0 && point.y <= STAGE_HEIGHT;
    return inside ? point : null;
  }

  dispose(): void {
    this.stage.dispose();
  }

  private updateSurface(scene: WaveThreeDimensionalScene): void {
    const positions = this.surfaceGeometry.attributes.position as BufferAttribute;
    const colors = this.surfaceGeometry.attributes.color as BufferAttribute;
    const neutral = new Color(0x17384d);
    const crest = new Color(0xff6178);
    const trough = new Color(0x4f8dff);
    const color = new Color();

    for (let index = 0; index < positions.count; index += 1) {
      const base = this.baseCoordinates[index];
      const point = threeDimensionalPlaneToStagePoint(
        new Vector3(base.x, 0, base.z),
        wavePlane,
      );
      const field = fieldAt(point, scene.sources, scene.parameters, scene.phaseTime);
      positions.setY(index, surfaceHeight(field));
      color.lerpColors(neutral, field >= 0 ? crest : trough, Math.min(Math.abs(field) * 0.72, 1));
      colors.setXYZ(index, color.r, color.g, color.b);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    if (this.frameCount % 3 === 0) {
      this.surfaceGeometry.computeVertexNormals();
    }
    this.wavefrontWireframe.visible = scene.showWavefronts;
  }

  private updateSourcesAndProbe(scene: WaveThreeDimensionalScene): void {
    for (let index = 0; index < 2; index += 1) {
      const sourcePosition = stagePointToThreeDimensionalPlane(scene.sources[index], wavePlane, 9);
      this.sourceMeshes[index].position.copy(sourcePosition);
      this.sourceGlows[index].position.copy(sourcePosition);
      this.sourceMeshes[index].rotation.y += 0.018;

      const pathPoints: Vector3[] = [];
      const pathSamples = 32;
      for (let sampleIndex = 0; sampleIndex <= pathSamples; sampleIndex += 1) {
        const fraction = sampleIndex / pathSamples;
        const point: Point = {
          x: scene.sources[index].x + (scene.sample.x - scene.sources[index].x) * fraction,
          y: scene.sources[index].y + (scene.sample.y - scene.sources[index].y) * fraction,
        };
        const field = fieldAt(point, scene.sources, scene.parameters, scene.phaseTime);
        pathPoints.push(
          stagePointToThreeDimensionalPlane(point, wavePlane, surfaceHeight(field) + 3.5),
        );
      }
      const path = this.sourcePathLines[index];
      path.geometry.dispose();
      path.geometry = new BufferGeometry().setFromPoints(pathPoints);
      path.computeLineDistances();
    }

    const probeField = fieldAt(scene.sample, scene.sources, scene.parameters, scene.phaseTime);
    this.probe.position.copy(
      stagePointToThreeDimensionalPlane(scene.sample, wavePlane, surfaceHeight(probeField) + 5),
    );
  }

  private updateIntensityProfile(scene: WaveThreeDimensionalScene): void {
    this.intensityGroup.visible = scene.showIntensity;
    if (!scene.showIntensity) {
      return;
    }
    const points: Vector3[] = [];
    const samples = 110;
    for (let index = 0; index <= samples; index += 1) {
      const stageY = (index / samples) * STAGE_HEIGHT;
      const amplitude = amplitudeAt(
        { x: screenStageX, y: stageY },
        scene.sources,
        scene.parameters,
      );
      points.push(
        new Vector3(
          screenWorldX - 5,
          Math.min(amplitude / 2, 1) * 156 + 6,
          (stageY / STAGE_HEIGHT - 0.5) * wavePlane.depth * 0.9,
        ),
      );
    }
    this.intensityProfile.geometry.dispose();
    this.intensityProfile.geometry = new BufferGeometry().setFromPoints(points);
  }
}
