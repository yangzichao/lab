import {
  AdditiveBlending,
  AmbientLight,
  ArrowHelper,
  BufferGeometry,
  DirectionalLight,
  DoubleSide,
  Line,
  LineBasicMaterial,
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
import type { Point } from '../shared/stage';
import {
  createRadialGlowTexture,
  localizedThreeDimensionalText,
  setThreeDimensionalMaterialOpacity,
  ThreeDimensionalStage,
  createStarField,
} from '../shared/three-dimensional-stage';
import type { Body, ThreeBodyMetrics, ThreeBodyState } from './three-body-physics';

export type ThreeBodyThreeDimensionalScene = {
  state: ThreeBodyState;
  trails: [Point[], Point[], Point[]];
  metrics: ThreeBodyMetrics;
  showTrails: boolean;
  showVectors: boolean;
  showCenterOfMass: boolean;
  diverged: boolean;
};

const sceneScale = 165;
const velocityArrowScale = 70;
const maximumArrowLength = 130;
const bodyColors = [0x4f8dff, 0xff6178, 0xaf7dff] as const;
const bodyEmissiveColors = [0x17438f, 0x8d182c, 0x4b1a8a] as const;

const bodyWorldPosition = (body: Pick<Body, 'x' | 'y'>, height = 12): Vector3 =>
  new Vector3(body.x * sceneScale, height, -body.y * sceneScale);

export class ThreeBodyThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly potentialGeometry = new PlaneGeometry(680, 470, 42, 30);
  private readonly potentialSurface: Mesh<PlaneGeometry, MeshPhysicalMaterial>;
  private readonly potentialWireframe: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly potentialBaseCoordinates: Array<{ x: number; z: number }> = [];
  private readonly bodyMeshes: Array<Mesh<SphereGeometry, MeshPhysicalMaterial>> = [];
  private readonly bodyGlows: Sprite[] = [];
  private readonly bodyLights: PointLight[] = [];
  private readonly trailLines: Array<Line<BufferGeometry, LineBasicMaterial>> = [];
  private readonly velocityArrows: ArrowHelper[] = [];
  private readonly centerOfMassMarker: Mesh<RingGeometry, MeshBasicMaterial>;
  private frameCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x060d18,
      cameraPosition: [0, 270, 480],
      cameraTarget: [0, -8, 0],
      fog: { color: 0x060d18, near: 560, far: 1020 },
      minimumCameraDistance: 245,
      maximumCameraDistance: 880,
      legend: [
        { color: '#4f8dff', label: localizedThreeDimensionalText('body 1', '天体 1') },
        { color: '#ff6178', label: localizedThreeDimensionalText('body 2', '天体 2') },
        { color: '#af7dff', label: localizedThreeDimensionalText('body 3', '天体 3') },
      ],
    });

    this.potentialGeometry.rotateX(-Math.PI / 2);
    const position = this.potentialGeometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      this.potentialBaseCoordinates.push({ x: position.getX(index), z: position.getZ(index) });
    }

    this.potentialSurface = new Mesh(
      this.potentialGeometry,
      new MeshPhysicalMaterial({
        color: 0x173d58,
        emissive: 0x07182d,
        emissiveIntensity: 0.45,
        roughness: 0.72,
        metalness: 0.08,
        transparent: true,
        opacity: 0.46,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    this.potentialWireframe = new Mesh(
      this.potentialGeometry,
      new MeshBasicMaterial({
        color: 0x3b6b85,
        wireframe: true,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
    );

    const ambientLight = new AmbientLight(0xaec9ff, 0.48);
    const keyLight = new DirectionalLight(0xaed4ff, 1.5);
    keyLight.position.set(-180, 260, 190);
    const fillLight = new DirectionalLight(0xb58cff, 0.65);
    fillLight.position.set(220, 120, -160);

    for (let index = 0; index < 3; index += 1) {
      const body = new Mesh(
        new SphereGeometry(10, 32, 24),
        new MeshPhysicalMaterial({
          color: bodyColors[index],
          emissive: bodyEmissiveColors[index],
          emissiveIntensity: 1.55,
          roughness: 0.32,
          metalness: 0.1,
          clearcoat: 0.5,
          clearcoatRoughness: 0.18,
        }),
      );
      const color = `#${bodyColors[index].toString(16).padStart(6, '0')}`;
      const glow = new Sprite(
        new SpriteMaterial({
          map: createRadialGlowTexture('#ffffff', `${color}70`),
          color: bodyColors[index],
          transparent: true,
          opacity: 0.78,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      glow.scale.set(54, 54, 1);
      const light = new PointLight(bodyColors[index], 2.2, 135, 1.9);
      const trail = new Line(
        new BufferGeometry(),
        new LineBasicMaterial({
          color: bodyColors[index],
          transparent: true,
          opacity: 0.84,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      const velocityArrow = new ArrowHelper(
        new Vector3(1, 0, 0),
        new Vector3(),
        1,
        0x43e1c1,
        10,
        5,
      );
      setThreeDimensionalMaterialOpacity(velocityArrow.line.material, 0.88);

      this.bodyMeshes.push(body);
      this.bodyGlows.push(glow);
      this.bodyLights.push(light);
      this.trailLines.push(trail);
      this.velocityArrows.push(velocityArrow);
    }

    this.centerOfMassMarker = new Mesh(
      new RingGeometry(5, 9, 32),
      new MeshBasicMaterial({
        color: 0xc8d7e6,
        transparent: true,
        opacity: 0.74,
        side: DoubleSide,
      }),
    );
    this.centerOfMassMarker.rotation.x = -Math.PI / 2;

    this.stage.add(
      createStarField(360, 820, 0x90afd0, 23),
      ambientLight,
      keyLight,
      fillLight,
      this.potentialSurface,
      this.potentialWireframe,
      ...this.trailLines,
      ...this.bodyLights,
      ...this.bodyGlows,
      ...this.bodyMeshes,
      ...this.velocityArrows,
      this.centerOfMassMarker,
    );
  }

  draw(scene: ThreeBodyThreeDimensionalScene): void {
    this.frameCount += 1;
    this.updatePotentialSurface(scene.state.bodies, scene.diverged);

    for (let index = 0; index < 3; index += 1) {
      const body = scene.state.bodies[index];
      const position = bodyWorldPosition(body);
      this.bodyMeshes[index].position.copy(position);
      this.bodyMeshes[index].rotation.y += 0.012 + index * 0.003;
      this.bodyGlows[index].position.copy(position);
      this.bodyLights[index].position.copy(position);
      this.updateTrail(index, scene.trails[index], scene.showTrails);
      this.updateVelocityArrow(index, body, scene.showVectors, position);
    }

    this.centerOfMassMarker.visible = scene.showCenterOfMass;
    if (scene.showCenterOfMass) {
      this.centerOfMassMarker.position.copy(bodyWorldPosition(scene.metrics.centerOfMass, 4));
    }

    this.stage.render();
  }

  dispose(): void {
    this.stage.dispose();
  }

  private updatePotentialSurface(
    bodies: ThreeBodyState['bodies'],
    diverged: boolean,
  ): void {
    const position = this.potentialGeometry.attributes.position as BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const base = this.potentialBaseCoordinates[index];
      let depth = 0;
      for (const body of bodies) {
        const bodyX = body.x * sceneScale;
        const bodyZ = -body.y * sceneScale;
        const distance = Math.hypot(base.x - bodyX, base.z - bodyZ);
        depth -= (body.mass * 780) / (distance + 22);
      }
      position.setY(index, Math.max(-46, depth));
    }
    position.needsUpdate = true;
    if (this.frameCount % 3 === 0) {
      this.potentialGeometry.computeVertexNormals();
    }

    this.potentialSurface.material.color.setHex(diverged ? 0x542234 : 0x173d58);
    this.potentialWireframe.material.color.setHex(diverged ? 0xff6178 : 0x3b6b85);
  }

  private updateTrail(index: number, trail: Point[], visible: boolean): void {
    const line = this.trailLines[index];
    line.visible = visible && trail.length > 1;
    if (!line.visible) {
      return;
    }

    const sampleStride = Math.max(1, Math.floor(trail.length / 560));
    const points: Vector3[] = [];
    for (let pointIndex = 0; pointIndex < trail.length; pointIndex += sampleStride) {
      points.push(bodyWorldPosition(trail[pointIndex], 7.5));
    }
    const finalPoint = trail[trail.length - 1];
    if (finalPoint && (trail.length - 1) % sampleStride !== 0) {
      points.push(bodyWorldPosition(finalPoint, 7.5));
    }

    line.geometry.dispose();
    line.geometry = new BufferGeometry().setFromPoints(points);
  }

  private updateVelocityArrow(
    index: number,
    body: Body,
    visible: boolean,
    origin: Vector3,
  ): void {
    const arrow = this.velocityArrows[index];
    arrow.visible = visible;
    if (!visible) {
      return;
    }

    const velocity = new Vector3(body.vx, 0, -body.vy);
    if (velocity.lengthSq() < 1e-8) {
      arrow.visible = false;
      return;
    }
    const length = Math.min(maximumArrowLength, velocity.length() * velocityArrowScale);
    arrow.position.copy(origin);
    arrow.setDirection(velocity.normalize());
    arrow.setLength(length, 11, 5.5);
  }
}
