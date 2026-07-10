import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
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

export function createCavityScene(): LigoSceneView {
  const group = new Group();
  const cavityStart = -205;
  const cavityEnd = 205;
  const cavityLength = cavityEnd - cavityStart;

  const tunnel = createCylinderBetween(
    new Vector3(cavityStart, 0, 0),
    new Vector3(cavityEnd, 0, 0),
    30,
    new MeshPhysicalMaterial({
      color: 0x234055,
      transparent: true,
      opacity: 0.24,
      transmission: 0.48,
      roughness: 0.14,
      metalness: 0.28,
    }),
    32,
  );
  group.add(tunnel);

  const mirrorMaterial = new MeshPhysicalMaterial({
    color: 0xdcefff,
    metalness: 0.8,
    roughness: 0.12,
    clearcoat: 1,
  });
  const inputMirror = new Mesh(new CylinderGeometry(28, 28, 7, 48), mirrorMaterial);
  const endMirror = new Mesh(new CylinderGeometry(28, 28, 7, 48), mirrorMaterial.clone());
  inputMirror.rotation.z = Math.PI / 2;
  endMirror.rotation.z = Math.PI / 2;
  inputMirror.position.x = cavityStart;
  endMirror.position.x = cavityEnd;
  group.add(inputMirror, endMirror);

  const beamHalo = createCylinderBetween(
    new Vector3(cavityStart, 0, 0),
    new Vector3(cavityEnd, 0, 0),
    11,
    createGlowMaterial(ligoColors.laser, 0.12),
    18,
  );
  const beamCore = createCylinderBetween(
    new Vector3(cavityStart, 0, 0),
    new Vector3(cavityEnd, 0, 0),
    1.8,
    createGlowMaterial(0xffdbe5, 0.96),
    12,
  );
  group.add(beamHalo, beamCore);

  const pulses: Mesh[] = [];
  const pulseGeometry = new SphereGeometry(4.6, 18, 12);
  for (let index = 0; index < 36; index += 1) {
    const pulse = new Mesh(
      pulseGeometry,
      createGlowMaterial(index % 3 === 0 ? 0xffffff : ligoColors.laser, 0.88),
    );
    pulses.push(pulse);
    group.add(pulse);
  }

  const passRings: Mesh[] = [];
  for (let index = 0; index < 9; index += 1) {
    const ring = new Mesh(
      new TorusGeometry(15 + index * 0.7, 0.65, 6, 48),
      new MeshBasicMaterial({
        color: ligoColors.laser,
        transparent: true,
        opacity: 0.15,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.x = cavityStart + (index / 8) * cavityLength;
    passRings.push(ring);
    group.add(ring);
  }

  const passesLabel = createLabelSprite(
    localizedThreeDimensionalText('about 300 round trips', '约 300 次往返'),
    '#ff6c94',
  );
  passesLabel.position.set(0, 76, -34);
  passesLabel.scale.set(190, 40, 1);
  const distanceLabel = createLabelSprite('4 km → ≈ 1200 km', '#76e5ff');
  distanceLabel.position.set(0, -62, 18);
  distanceLabel.scale.set(190, 40, 1);

  const ambient = new AmbientLight(0xd1e9ff, 0.38);
  const buildupLight = new PointLight(ligoColors.laser, 20, 520);
  buildupLight.position.set(0, 50, 50);
  group.add(passesLabel, distanceLabel, ambient, buildupLight);

  return {
    id: 'cavity',
    group,
    cameraPosition: [370, 180, 390],
    cameraTarget: [0, 0, 0],
    update: (elapsedSeconds) => {
      for (let index = 0; index < pulses.length; index += 1) {
        const progress = (elapsedSeconds * 0.24 + index / pulses.length) % 1;
        const roundTrip = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
        const pulse = pulses[index];
        if (!pulse) {
          continue;
        }
        pulse.position.x = cavityStart + roundTrip * cavityLength;
        pulse.position.y = Math.sin(index * 2.3) * 1.8;
        pulse.position.z = Math.cos(index * 1.7) * 1.8;
        pulse.scale.setScalar(0.7 + Math.sin(progress * Math.PI) * 0.65);
      }
      for (let index = 0; index < passRings.length; index += 1) {
        const ring = passRings[index];
        if (!ring) {
          continue;
        }
        const pulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 4.4 - index * 0.65);
        ring.scale.setScalar(0.82 + pulse * 0.42);
        (ring.material as MeshBasicMaterial).opacity = 0.06 + pulse * 0.22;
      }
      buildupLight.intensity = 16 + Math.sin(elapsedSeconds * 3.2) * 4;
    },
  };
}

function createChirpLine(baseY: number, color: number, phaseOffset: number): Line {
  const pointCount = 240;
  const positions = new Float32Array(pointCount * 3);
  for (let index = 0; index < pointCount; index += 1) {
    const progress = index / (pointCount - 1);
    const envelope = 3 + progress ** 2.6 * 29;
    const phase = Math.PI * 2 * (1.2 * progress + 5.8 * progress ** 3) + phaseOffset;
    positions[index * 3] = -235 + progress * 470;
    positions[index * 3 + 1] = baseY + Math.sin(phase) * envelope;
    positions[index * 3 + 2] = -98;
  }
  return new Line(
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3)),
    new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
}

export function createDetectionScene(): LigoSceneView {
  const group = new Group();
  const hanford = createInterferometerAssembly(110);
  const livingston = createInterferometerAssembly(110);
  hanford.group.scale.setScalar(0.68);
  livingston.group.scale.setScalar(0.68);
  hanford.group.position.set(-180, -78, 58);
  livingston.group.position.set(100, -78, 58);
  livingston.group.rotation.y = -0.46;
  hanford.group.rotation.y = 0.32;
  group.add(hanford.group, livingston.group);

  const hanfordLabel = createLabelSprite('Hanford · H1', '#55e6ff');
  hanfordLabel.position.set(-155, -34, 48);
  hanfordLabel.scale.set(130, 28, 1);
  const livingstonLabel = createLabelSprite('Livingston · L1', '#d98cff');
  livingstonLabel.position.set(145, -34, 48);
  livingstonLabel.scale.set(145, 28, 1);
  const delayLabel = createLabelSprite(
    localizedThreeDimensionalText('same chirp · 7 ms apart', '同一声 chirp · 相差 7 ms'),
    '#ffbf69',
  );
  delayLabel.position.set(0, 4, 0);
  delayLabel.scale.set(190, 40, 1);

  const hanfordWaveform = createChirpLine(-2, ligoColors.cyan, 0.55);
  const livingstonWaveform = createChirpLine(-56, ligoColors.magenta, 0);
  group.add(hanfordWaveform, livingstonWaveform);

  const cursorGeometry = new SphereGeometry(5, 18, 12);
  const hanfordCursor = new Mesh(cursorGeometry, createGlowMaterial(ligoColors.cyan));
  const livingstonCursor = new Mesh(cursorGeometry, createGlowMaterial(ligoColors.magenta));
  group.add(hanfordCursor, livingstonCursor);

  const blackHoleMaterial = new MeshPhysicalMaterial({
    color: 0x010204,
    roughness: 0.13,
    metalness: 0.72,
    clearcoat: 1,
  });
  const blackHoleA = new Mesh(new SphereGeometry(24, 40, 28), blackHoleMaterial);
  const blackHoleB = new Mesh(new SphereGeometry(20, 40, 28), blackHoleMaterial.clone());
  const accretionA = new Mesh(
    new TorusGeometry(31, 2.3, 10, 96),
    createGlowMaterial(ligoColors.amber, 0.86),
  );
  const accretionB = new Mesh(
    new TorusGeometry(27, 2, 10, 96),
    createGlowMaterial(ligoColors.laser, 0.82),
  );
  accretionA.rotation.x = 1.1;
  accretionB.rotation.x = 1.9;
  group.add(blackHoleA, blackHoleB, accretionA, accretionB);

  const mergerLight = new PointLight(ligoColors.amber, 22, 520);
  mergerLight.position.set(0, 145, 20);
  const ambient = new AmbientLight(0xbcdfff, 0.35);
  group.add(mergerLight, ambient, hanfordLabel, livingstonLabel, delayLabel);

  const waveRings: Mesh[] = [];
  for (let index = 0; index < 7; index += 1) {
    const ring = new Mesh(
      new TorusGeometry(32, 1.2, 8, 96),
      new MeshBasicMaterial({
        color: index % 2 === 0 ? ligoColors.cyan : ligoColors.magenta,
        transparent: true,
        opacity: 0.2,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 140;
    waveRings.push(ring);
    group.add(ring);
  }

  return {
    id: 'detection',
    group,
    cameraPosition: [400, 235, 440],
    cameraTarget: [0, 20, 0],
    update: (elapsedSeconds) => {
      const cycle = (elapsedSeconds % 8) / 8;
      const orbitalPhase = Math.PI * 2 * (1.2 * cycle + 5.8 * cycle ** 3);
      const separation = 92 * (1 - cycle) + 12;
      const blackHoleAY = 140 + Math.sin(orbitalPhase) * separation * 0.18;
      const blackHoleBY = 140 - Math.sin(orbitalPhase) * separation * 0.18;
      blackHoleA.position.set(Math.cos(orbitalPhase) * separation * 0.46, blackHoleAY, 16);
      blackHoleB.position.set(-Math.cos(orbitalPhase) * separation * 0.54, blackHoleBY, -16);
      accretionA.position.copy(blackHoleA.position);
      accretionB.position.copy(blackHoleB.position);

      const amplitude = 0.004 + cycle ** 2.4 * 0.055;
      const strain = Math.sin(orbitalPhase) * amplitude;
      hanford.setStrain(strain);
      livingston.setStrain(Math.sin(orbitalPhase - 0.55) * amplitude);

      const cursorX = -235 + cycle * 470;
      const envelope = 3 + cycle ** 2.6 * 29;
      hanfordCursor.position.set(cursorX, -2 + Math.sin(orbitalPhase + 0.55) * envelope, -98);
      livingstonCursor.position.set(cursorX, -56 + Math.sin(orbitalPhase) * envelope, -98);
      const cursorScale = 0.8 + cycle * 1.2;
      hanfordCursor.scale.setScalar(cursorScale);
      livingstonCursor.scale.setScalar(cursorScale);

      for (let index = 0; index < waveRings.length; index += 1) {
        const progress = (cycle * 2.4 + index / waveRings.length) % 1;
        const ring = waveRings[index];
        if (!ring) {
          continue;
        }
        ring.scale.setScalar(0.8 + progress * 6.5);
        (ring.material as MeshBasicMaterial).opacity = (1 - progress) * 0.24;
      }
      mergerLight.intensity = 12 + cycle ** 3 * 42;
    },
  };
}
