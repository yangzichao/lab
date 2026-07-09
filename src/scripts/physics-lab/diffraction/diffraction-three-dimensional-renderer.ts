import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  Vector3,
} from 'three';
import {
  localizedThreeDimensionalText,
  ThreeDimensionalStage,
} from '../shared/three-dimensional-stage';
import {
  effectiveSlitCount,
  principalMaxima,
  relativeIntensity,
  singleSlitEnvelope,
  wavelengthNanometresToRgb,
  type DiffractionParameters,
} from './diffraction-physics';

export type DiffractionThreeDimensionalScene = {
  parameters: DiffractionParameters;
  wavelengthNanometres: number;
  showEnvelope: boolean;
  showScreenBand: boolean;
};

const apertureX = -90;
const screenX = 310;
const screenWidth = 390;
const screenHeight = 270;
const screenCenterY = 42;
const diffractionSinMaximum = 0.6;
const textureWidth = 512;
const textureHeight = 72;

export class DiffractionThreeDimensionalRenderer {
  private readonly stage: ThreeDimensionalStage;
  private readonly apertureGroup = new Group();
  private readonly diffractionRayGroup = new Group();
  private readonly wavefronts = new Group();
  private readonly screenTextureCanvas = document.createElement('canvas');
  private readonly screenTexture: CanvasTexture;
  private readonly screenGlow: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly intensityCurve: Line<BufferGeometry, LineBasicMaterial>;
  private readonly envelopeCurve: Line<BufferGeometry, LineDashedMaterial>;
  private apertureKey = '';

  constructor(canvas: HTMLCanvasElement) {
    this.stage = new ThreeDimensionalStage(canvas, {
      background: 0x06111d,
      cameraPosition: [530, 330, 590],
      cameraTarget: [-5, 30, 0],
      fog: { color: 0x06111d, near: 830, far: 1320 },
      minimumCameraDistance: 430,
      maximumCameraDistance: 1120,
      legend: [
        {
          color: '#f4f8ff',
          label: localizedThreeDimensionalText('aperture', '孔径'),
        },
        {
          color: '#72a7ff',
          label: localizedThreeDimensionalText('diffracted orders', '衍射级次'),
        },
        {
          color: '#ff79aa',
          label: localizedThreeDimensionalText('screen intensity', '屏上强度'),
        },
      ],
    });

    this.screenTextureCanvas.width = textureWidth;
    this.screenTextureCanvas.height = textureHeight;
    this.screenTexture = new CanvasTexture(this.screenTextureCanvas);
    this.screenTexture.colorSpace = SRGBColorSpace;

    const floor = new Mesh(
      new PlaneGeometry(860, 610),
      new MeshPhysicalMaterial({
        color: 0x0d2638,
        roughness: 0.82,
        metalness: 0.08,
        transparent: true,
        opacity: 0.78,
        side: DoubleSide,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -112;

    const opticalAxis = new Line(
      new BufferGeometry().setFromPoints([
        new Vector3(-390, -2, 0),
        new Vector3(screenX + 12, -2, 0),
      ]),
      new LineDashedMaterial({
        color: 0x718da6,
        dashSize: 7,
        gapSize: 8,
        transparent: true,
        opacity: 0.5,
      }),
    );
    opticalAxis.computeLineDistances();

    const screenBacking = new Mesh(
      new PlaneGeometry(screenWidth, screenHeight),
      new MeshPhysicalMaterial({
        color: 0x132c3c,
        emissive: 0x071522,
        emissiveIntensity: 0.5,
        roughness: 0.45,
        metalness: 0.12,
        side: DoubleSide,
      }),
    );
    screenBacking.rotation.y = Math.PI / 2;
    screenBacking.position.set(screenX, screenCenterY, 0);

    this.screenGlow = new Mesh(
      new PlaneGeometry(screenWidth - 12, screenHeight - 12),
      new MeshBasicMaterial({
        map: this.screenTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.98,
        blending: AdditiveBlending,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    this.screenGlow.rotation.y = Math.PI / 2;
    this.screenGlow.position.set(screenX + 1.8, screenCenterY, 0);

    this.intensityCurve = new Line(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.96,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.envelopeCurve = new Line(
      new BufferGeometry(),
      new LineDashedMaterial({
        color: 0xc0d3e4,
        dashSize: 7,
        gapSize: 7,
        transparent: true,
        opacity: 0.68,
      }),
    );

    this.buildIncomingWavefronts();

    const ambientLight = new AmbientLight(0xb9d4ff, 0.52);
    const keyLight = new DirectionalLight(0xe2edff, 1.8);
    keyLight.position.set(-220, 420, 330);
    const screenLight = new PointLight(0x769eff, 2.2, 460, 1.8);
    screenLight.position.set(screenX - 80, 120, 0);

    this.stage.add(
      ambientLight,
      keyLight,
      screenLight,
      floor,
      opticalAxis,
      this.wavefronts,
      this.apertureGroup,
      this.diffractionRayGroup,
      screenBacking,
      this.screenGlow,
      this.envelopeCurve,
      this.intensityCurve,
    );
  }

  draw(scene: DiffractionThreeDimensionalScene): void {
    this.updateAperture(scene.parameters);
    this.updateWavelengthColor(scene.wavelengthNanometres);
    this.updateScreen(scene);
    this.updateDiffractionRays(scene.parameters, scene.wavelengthNanometres);
    this.stage.render();
  }

  dispose(): void {
    this.screenTexture.dispose();
    this.stage.dispose();
  }

  private buildIncomingWavefronts(): void {
    const wavefrontGeometry = new PlaneGeometry(300, 230);
    for (let index = 0; index < 5; index += 1) {
      const wavefront = new Mesh(
        wavefrontGeometry,
        new MeshBasicMaterial({
          color: 0x7da9ff,
          transparent: true,
          opacity: 0.08 + index * 0.018,
          side: DoubleSide,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      wavefront.rotation.y = Math.PI / 2;
      wavefront.position.set(-360 + index * 58, 36, 0);
      this.wavefronts.add(wavefront);
    }
  }

  private updateAperture(parameters: DiffractionParameters): void {
    const slitCount = effectiveSlitCount(parameters);
    const nextKey = [
      slitCount,
      parameters.slitWidth,
      parameters.slitSpacing,
    ].join(':');
    if (nextKey === this.apertureKey) {
      return;
    }
    this.apertureKey = nextKey;
    this.disposeGroupChildren(this.apertureGroup);

    const barrierWidth = 390;
    const apertureHeight = 276;
    const arraySpan =
      (slitCount - 1) * parameters.slitSpacing + parameters.slitWidth;
    const unitScale = Math.min(9, 270 / Math.max(arraySpan, 1));
    const slitWidth = Math.max(4, parameters.slitWidth * unitScale);
    const spacing = parameters.slitSpacing * unitScale;
    const slitCenters = Array.from({ length: slitCount }, (_, index) =>
      -((slitCount - 1) * spacing) / 2 + index * spacing,
    );
    const openings = slitCenters.map((center) => ({
      start: center - slitWidth / 2,
      end: center + slitWidth / 2,
    }));

    let segmentStart = -barrierWidth / 2;
    for (const opening of openings) {
      this.addBarrierSegment(segmentStart, opening.start, apertureHeight);
      segmentStart = opening.end;
      const openingGlow = new Mesh(
        new BoxGeometry(7, apertureHeight - 18, slitWidth),
        new MeshBasicMaterial({
          color: 0xc8ddff,
          transparent: true,
          opacity: 0.46,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      openingGlow.position.set(apertureX + 1, 38, (opening.start + opening.end) / 2);
      this.apertureGroup.add(openingGlow);
    }
    this.addBarrierSegment(segmentStart, barrierWidth / 2, apertureHeight);
  }

  private addBarrierSegment(startZ: number, endZ: number, height: number): void {
    const depth = endZ - startZ;
    if (depth <= 0.5) {
      return;
    }
    const segment = new Mesh(
      new BoxGeometry(12, height, depth),
      new MeshPhysicalMaterial({
        color: 0x263b4c,
        metalness: 0.72,
        roughness: 0.28,
        clearcoat: 0.25,
      }),
    );
    segment.position.set(apertureX, 38, (startZ + endZ) / 2);
    this.apertureGroup.add(segment);
  }

  private updateWavelengthColor(wavelengthNanometres: number): void {
    const [red, green, blue] = wavelengthNanometresToRgb(wavelengthNanometres);
    const color = new Color(red / 255, green / 255, blue / 255);
    for (const child of this.wavefronts.children) {
      const mesh = child as Mesh<PlaneGeometry, MeshBasicMaterial>;
      mesh.material.color.copy(color);
    }
    this.intensityCurve.material.color.copy(color);
  }

  private updateScreen(scene: DiffractionThreeDimensionalScene): void {
    const context = this.screenTextureCanvas.getContext('2d');
    if (!context) {
      return;
    }
    const [red, green, blue] = wavelengthNanometresToRgb(
      scene.wavelengthNanometres,
    );
    context.fillStyle = '#02060a';
    context.fillRect(0, 0, textureWidth, textureHeight);

    for (let pixelX = 0; pixelX < textureWidth; pixelX += 1) {
      const fraction = pixelX / (textureWidth - 1) - 0.5;
      const sinTheta = fraction * diffractionSinMaximum * 2;
      const intensity = Math.min(
        relativeIntensity(sinTheta, scene.parameters),
        1,
      );
      const verticalGradient = context.createLinearGradient(0, 0, 0, textureHeight);
      verticalGradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 0.05)`);
      verticalGradient.addColorStop(
        0.5,
        `rgba(${Math.round(red * intensity)}, ${Math.round(green * intensity)}, ${Math.round(blue * intensity)}, ${0.3 + intensity * 0.7})`,
      );
      verticalGradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0.05)`);
      context.fillStyle = verticalGradient;
      context.fillRect(pixelX, 0, 1, textureHeight);
    }
    this.screenTexture.needsUpdate = true;
    this.screenGlow.visible = scene.showScreenBand;

    this.updateProfileLine(
      this.intensityCurve,
      (sinTheta) => relativeIntensity(sinTheta, scene.parameters),
    );
    this.intensityCurve.visible = scene.showScreenBand;
    this.updateProfileLine(
      this.envelopeCurve,
      (sinTheta) => singleSlitEnvelope(sinTheta, scene.parameters),
    );
    this.envelopeCurve.visible = scene.showEnvelope;
    this.envelopeCurve.computeLineDistances();
  }

  private updateProfileLine(
    line: Line<BufferGeometry, LineBasicMaterial | LineDashedMaterial>,
    intensityAt: (sinTheta: number) => number,
  ): void {
    const points: Vector3[] = [];
    const samples = 220;
    for (let index = 0; index <= samples; index += 1) {
      const fraction = index / samples;
      const sinTheta = (fraction - 0.5) * diffractionSinMaximum * 2;
      const intensity = intensityAt(sinTheta);
      points.push(
        new Vector3(
          screenX + 4,
          -76 + intensity * 210,
          (fraction - 0.5) * (screenWidth - 18),
        ),
      );
    }
    line.geometry.dispose();
    line.geometry = new BufferGeometry().setFromPoints(points);
  }

  private updateDiffractionRays(
    parameters: DiffractionParameters,
    wavelengthNanometres: number,
  ): void {
    this.disposeGroupChildren(this.diffractionRayGroup);
    const [red, green, blue] = wavelengthNanometresToRgb(wavelengthNanometres);
    const color = new Color(red / 255, green / 255, blue / 255);
    for (const maximum of principalMaxima(parameters, diffractionSinMaximum)) {
      const intensity = relativeIntensity(maximum.sinTheta, parameters);
      if (intensity < 0.012) {
        continue;
      }
      const line = new Line(
        new BufferGeometry().setFromPoints([
          new Vector3(apertureX + 8, 0, 0),
          new Vector3(
            screenX - 6,
            0,
            (maximum.sinTheta / diffractionSinMaximum) * (screenWidth / 2),
          ),
        ]),
        new LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.12 + intensity * 0.32,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.diffractionRayGroup.add(line);
    }
  }

  private disposeGroupChildren(group: Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof Mesh || child instanceof Line) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const material of materials) {
          material.dispose();
        }
      }
    }
  }
}
