import {
  AdditiveBlending,
  AmbientLight,
  ArrowHelper,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PointLight,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { localizedThreeDimensionalText } from '../../shared/three-dimensional-stage';
import type { LigoSceneView } from '../ligo-scene-types';
import {
  createCylinderBetween,
  createGlowMaterial,
  createInterferometerAssembly,
  createLabelSprite,
  ligoColors,
} from '../ligo-three-helpers';

type LaserPulse = {
  mesh: Mesh;
  arm: 'x' | 'z';
  offset: number;
};

function createBeam(
  group: Group,
  start: Vector3,
  end: Vector3,
  radius: number,
  opacity: number,
): void {
  const halo = createCylinderBetween(
    start,
    end,
    radius * 3.4,
    createGlowMaterial(ligoColors.laser, opacity * 0.16),
    10,
  );
  const core = createCylinderBetween(
    start,
    end,
    radius,
    createGlowMaterial(0xffd7e2, opacity),
    10,
  );
  group.add(halo, core);
}

export function createLaserScene(): LigoSceneView {
  const group = new Group();
  const armLength = 245;
  const interferometer = createInterferometerAssembly(armLength);
  const grid = new GridHelper(620, 20, 0x35536b, 0x152b3c);
  grid.position.y = -12;
  group.add(interferometer.group, grid);

  const source = new Mesh(
    new CylinderGeometry(18, 24, 54, 28),
    new MeshPhysicalMaterial({
      color: 0x602439,
      emissive: 0xff174f,
      emissiveIntensity: 2.2,
      metalness: 0.72,
      roughness: 0.22,
    }),
  );
  source.rotation.z = Math.PI / 2;
  source.position.set(-115, 6, 0);
  group.add(source);

  createBeam(group, new Vector3(-88, 7, 0), new Vector3(0, 7, 0), 1.25, 0.96);
  createBeam(group, new Vector3(0, 7, 0), new Vector3(armLength, 7, 0), 1.25, 0.92);
  createBeam(group, new Vector3(0, 7, 0), new Vector3(0, 7, armLength), 1.25, 0.92);

  const pulses: LaserPulse[] = [];
  const pulseGeometry = new SphereGeometry(3.7, 14, 10);
  for (const arm of ['x', 'z'] as const) {
    for (let index = 0; index < 14; index += 1) {
      const pulse = new Mesh(pulseGeometry, createGlowMaterial(0xffe0e9, 0.95));
      pulses.push({ mesh: pulse, arm, offset: index / 14 });
      group.add(pulse);
    }
  }

  const splitLabel = createLabelSprite(
    localizedThreeDimensionalText('beam splitter · 50 / 50', '分束镜 · 50 / 50'),
    '#ff6c94',
  );
  splitLabel.position.set(10, 64, -45);
  const returnLabel = createLabelSprite(
    localizedThreeDimensionalText('same laser · two phases', '同一束激光 · 两个相位'),
    '#76e5ff',
  );
  returnLabel.position.set(128, 48, 128);

  const ambient = new AmbientLight(0xbcdfff, 0.46);
  const laserLight = new PointLight(0xff2d68, 12, 360);
  laserLight.position.set(0, 66, 0);
  group.add(splitLabel, returnLabel, ambient, laserLight);
  let returnPhase = false;

  return {
    id: 'laser',
    group,
    cameraPosition: [380, 245, 410],
    cameraTarget: [72, 5, 72],
    callouts: [
      {
        anchor: source,
        label: localizedThreeDimensionalText(
          'one coherent laser sets the ruler',
          '同一束相干激光定义光学尺',
        ),
        tone: 'laser',
      },
      {
        anchor: interferometer.beamSplitter,
        label: localizedThreeDimensionalText(
          'split here · compare here again',
          '在这里分束 · 也在这里重新比较',
        ),
        tone: 'amber',
      },
      {
        anchor: interferometer.xMirror,
        label: () =>
          returnPhase
            ? localizedThreeDimensionalText('returning light carries phase', '返回光携带累积相位')
            : localizedThreeDimensionalText('outbound light samples length', '去程光正在采样臂长'),
        tone: 'cyan',
      },
    ],
    update: (elapsedSeconds) => {
      const strain = Math.sin(elapsedSeconds * 1.35) * 0.035;
      interferometer.setStrain(strain);
      for (const pulse of pulses) {
        const progress = (elapsedSeconds * 0.27 + pulse.offset) % 1;
        const isReturning = progress >= 0.5;
        const roundTripProgress = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
        const distance = roundTripProgress * armLength;
        pulse.mesh.position.set(
          pulse.arm === 'x' ? distance * (1 + strain) : 0,
          7,
          pulse.arm === 'z' ? distance * (1 - strain) : 0,
        );
        const pulseScale = 0.72 + Math.sin(progress * Math.PI) * 0.55;
        pulse.mesh.scale.setScalar(pulseScale);
        (pulse.mesh.material as MeshBasicMaterial).color.setHex(
          isReturning
            ? pulse.arm === 'x'
              ? ligoColors.cyan
              : ligoColors.magenta
            : 0xffe0e9,
        );
      }
      returnPhase = (elapsedSeconds * 0.27) % 1 >= 0.5;
      laserLight.intensity = 10 + Math.sin(elapsedSeconds * 6) * 2;
    },
  };
}

type DynamicWaveLine = {
  line: Line<BufferGeometry, LineBasicMaterial>;
  positions: Float32BufferAttribute;
};

function createDynamicWaveLine(color: number, pointCount: number): DynamicWaveLine {
  const positions = new Float32BufferAttribute(new Float32Array(pointCount * 3), 3);
  const geometry = new BufferGeometry().setAttribute('position', positions);
  const line = new Line(
    geometry,
    new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.94,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  return { line, positions };
}

export function createDarkPortScene(): LigoSceneView {
  const group = new Group();
  const armLength = 225;
  const interferometer = createInterferometerAssembly(armLength);
  const grid = new GridHelper(580, 18, 0x35536b, 0x152b3c);
  grid.position.y = -12;
  group.add(interferometer.group, grid);

  const pointCount = 96;
  const xReturn = createDynamicWaveLine(ligoColors.cyan, pointCount);
  const zReturn = createDynamicWaveLine(ligoColors.magenta, pointCount);
  const output = createDynamicWaveLine(ligoColors.laser, pointCount);
  group.add(xReturn.line, zReturn.line, output.line);

  const detectorMaterial = new MeshPhysicalMaterial({
    color: 0x5d1e38,
    emissive: 0xff2f70,
    emissiveIntensity: 0.1,
    metalness: 0.6,
    roughness: 0.2,
  });
  const detector = new Mesh(new CylinderGeometry(31, 35, 14, 36), detectorMaterial);
  detector.rotation.x = Math.PI / 2;
  detector.position.set(0, 10, -228);

  const detectorHalo = new Mesh(
    new RingGeometry(36, 48, 64),
    new MeshBasicMaterial({
      color: ligoColors.laser,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  detectorHalo.position.set(0, 10, -219);

  const formula = createLabelSprite('I ∝ sin²(Δφ / 2)', '#ff6c94');
  formula.position.set(94, 70, -145);
  const detectorLabel = createLabelSprite(
    localizedThreeDimensionalText('photodetector · dark port', '光电探测器 · 暗端口'),
    '#ff6c94',
  );
  detectorLabel.position.set(-96, 50, -202);
  const phasorRing = new Mesh(
    new RingGeometry(42, 43.5, 72),
    new MeshBasicMaterial({
      color: 0xa7bfd2,
      transparent: true,
      opacity: 0.28,
      side: DoubleSide,
    }),
  );
  phasorRing.position.set(112, 92, -108);
  const phasorOrigin = phasorRing.position.clone();
  const xPhaseArrow = new ArrowHelper(
    new Vector3(1, 0, 0),
    phasorOrigin,
    40,
    ligoColors.cyan,
    9,
    5,
  );
  const zPhaseArrow = new ArrowHelper(
    new Vector3(-1, 0, 0),
    phasorOrigin,
    40,
    ligoColors.magenta,
    9,
    5,
  );

  const ambient = new AmbientLight(0xc8e5ff, 0.38);
  const detectorLight = new PointLight(ligoColors.laser, 0, 300);
  detectorLight.position.copy(detector.position).add(new Vector3(0, 35, 0));
  group.add(
    detector,
    detectorHalo,
    formula,
    detectorLabel,
    phasorRing,
    xPhaseArrow,
    zPhaseArrow,
    ambient,
    detectorLight,
  );
  let currentIntensity = 0;
  let currentPhaseDifference = 0;

  return {
    id: 'dark-port',
    group,
    cameraPosition: [330, 205, 350],
    cameraTarget: [18, 8, -28],
    callouts: [
      {
        anchor: phasorRing,
        label: () =>
          localizedThreeDimensionalText(
            `returning phases differ by ${Math.abs(currentPhaseDifference).toFixed(2)} rad`,
            `两束返回光相差 ${Math.abs(currentPhaseDifference).toFixed(2)} rad`,
          ),
        tone: 'cyan',
      },
      {
        anchor: detector,
        label: () =>
          localizedThreeDimensionalText(
            `photodetector power: ${(currentIntensity * 100).toFixed(0)}%`,
            `探测器光强：${(currentIntensity * 100).toFixed(0)}%`,
          ),
        tone: 'laser',
      },
      {
        anchor: interferometer.beamSplitter,
        label: localizedThreeDimensionalText(
          'destructive interference happens here',
          '两束光在这里发生相消干涉',
        ),
        tone: 'amber',
      },
    ],
    update: (elapsedSeconds) => {
      const strain = Math.sin(elapsedSeconds * 1.42) * 0.035;
      const phaseDifference = strain * 32;
      const intensity = Math.sin(phaseDifference / 2) ** 2;
      currentIntensity = intensity;
      currentPhaseDifference = phaseDifference;
      interferometer.setStrain(strain);

      for (let index = 0; index < pointCount; index += 1) {
        const progress = index / (pointCount - 1);
        const distance = armLength * (1 - progress);
        const carrier = progress * Math.PI * 11 - elapsedSeconds * 9;
        xReturn.positions.setXYZ(index, distance, 18 + Math.sin(carrier + phaseDifference / 2) * 7, 0);
        zReturn.positions.setXYZ(index, 0, 18 + Math.sin(carrier - phaseDifference / 2) * 7, distance);
        output.positions.setXYZ(
          index,
          Math.sin(carrier) * intensity * 6,
          18 + Math.cos(carrier) * intensity * 6,
          -progress * 210,
        );
      }
      xReturn.positions.needsUpdate = true;
      zReturn.positions.needsUpdate = true;
      output.positions.needsUpdate = true;
      output.line.material.opacity = 0.12 + intensity * 0.88;
      detectorMaterial.emissiveIntensity = 0.08 + intensity * 5.5;
      detectorLight.intensity = intensity * 20;
      const haloMaterial = detectorHalo.material as MeshBasicMaterial;
      haloMaterial.opacity = intensity * 0.82;
      detectorHalo.scale.setScalar(0.85 + intensity * 0.55);
      xPhaseArrow.setDirection(
        new Vector3(Math.cos(phaseDifference / 2), Math.sin(phaseDifference / 2), 0),
      );
      zPhaseArrow.setDirection(
        new Vector3(-Math.cos(phaseDifference / 2), Math.sin(-phaseDifference / 2), 0),
      );
    },
  };
}
