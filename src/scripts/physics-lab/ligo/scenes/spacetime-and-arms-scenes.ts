import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Float32BufferAttribute,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { localizedThreeDimensionalText } from '../../shared/three-dimensional-stage';
import type { LigoSceneView } from '../ligo-scene-types';
import {
  createInterferometerAssembly,
  createLabelSprite,
  ligoColors,
} from '../ligo-three-helpers';

type ParticleRing = {
  beads: Mesh[];
  outline: LineLoop;
  centerX: number;
  crossPolarized: boolean;
};

const particleCount = 28;
const ringRadius = 78;

function createParticleRing(
  group: Group,
  centerX: number,
  color: number,
  crossPolarized: boolean,
): ParticleRing {
  const beads: Mesh[] = [];
  const beadGeometry = new SphereGeometry(4.2, 18, 14);
  const beadMaterial = new MeshBasicMaterial({
    color,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  for (let index = 0; index < particleCount; index += 1) {
    const bead = new Mesh(beadGeometry, beadMaterial);
    beads.push(bead);
    group.add(bead);
  }

  const positions = new Float32Array(particleCount * 3);
  const outline = new LineLoop(
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3)),
    new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(outline);
  return { beads, outline, centerX, crossPolarized };
}

function updateParticleRing(ring: ParticleRing, strain: number): void {
  const positionAttribute = ring.outline.geometry.getAttribute('position');
  for (let index = 0; index < particleCount; index += 1) {
    const angle = (index / particleCount) * Math.PI * 2;
    const baseX = Math.cos(angle) * ringRadius;
    const baseZ = Math.sin(angle) * ringRadius;
    const deformedX = ring.crossPolarized
      ? baseX + strain * baseZ
      : baseX * (1 + strain);
    const deformedZ = ring.crossPolarized
      ? baseZ + strain * baseX
      : baseZ * (1 - strain);
    const x = ring.centerX + deformedX;
    const z = deformedZ;
    ring.beads[index]?.position.set(x, 0, z);
    positionAttribute.setXYZ(index, x, 0, z);
  }
  positionAttribute.needsUpdate = true;
}

function createDescendingWavefronts(group: Group, radius: number): Mesh[] {
  const wavefronts: Mesh[] = [];
  for (let index = 0; index < 5; index += 1) {
    const material = new MeshBasicMaterial({
      color: index % 2 === 0 ? ligoColors.cyan : ligoColors.magenta,
      transparent: true,
      opacity: 0.1,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const wavefront = new Mesh(new TorusGeometry(radius, 1.2, 8, 128), material);
    wavefront.rotation.x = Math.PI / 2;
    wavefronts.push(wavefront);
    group.add(wavefront);
  }
  return wavefronts;
}

function updateWavefronts(wavefronts: Mesh[], elapsedSeconds: number): void {
  for (let index = 0; index < wavefronts.length; index += 1) {
    const progress = (elapsedSeconds * 0.17 + index / wavefronts.length) % 1;
    const wavefront = wavefronts[index];
    if (!wavefront) {
      continue;
    }
    wavefront.position.y = 220 - progress * 440;
    const material = wavefront.material as MeshBasicMaterial;
    material.opacity = Math.sin(progress * Math.PI) * 0.17;
  }
}

export function createSpacetimeScene(): LigoSceneView {
  const group = new Group();
  const plusRing = createParticleRing(group, -112, ligoColors.cyan, false);
  const crossRing = createParticleRing(group, 112, ligoColors.magenta, true);
  const wavefronts = createDescendingWavefronts(group, 265);

  const plusLabel = createLabelSprite(
    localizedThreeDimensionalText('+ polarization', '+ 偏振'),
    '#55e6ff',
  );
  plusLabel.position.set(-112, 34, -112);
  const crossLabel = createLabelSprite(
    localizedThreeDimensionalText('× polarization', '× 偏振'),
    '#d98cff',
  );
  crossLabel.position.set(112, 34, -112);

  const grid = new GridHelper(490, 14, 0x35536b, 0x183043);
  grid.position.y = -10;
  const ambient = new AmbientLight(0xa9d7ff, 0.42);
  const point = new PointLight(0x8bdcff, 12, 620);
  point.position.set(0, 180, 80);
  group.add(plusLabel, crossLabel, grid, ambient, point);

  return {
    id: 'spacetime',
    group,
    cameraPosition: [370, 280, 390],
    cameraTarget: [0, 0, 0],
    update: (elapsedSeconds) => {
      const strain = Math.sin(elapsedSeconds * 1.55) * 0.26;
      updateParticleRing(plusRing, strain);
      updateParticleRing(crossRing, strain);
      updateWavefronts(wavefronts, elapsedSeconds);
      point.intensity = 10 + Math.sin(elapsedSeconds * 1.55) * 2;
    },
  };
}

export function createArmsScene(): LigoSceneView {
  const group = new Group();
  const interferometer = createInterferometerAssembly(250);
  const wavefronts = createDescendingWavefronts(group, 310);
  const grid = new GridHelper(620, 20, 0x35536b, 0x152b3c);
  grid.position.y = -12;

  const xLabel = createLabelSprite('Lx = L(1 + h/2)', '#55e6ff');
  xLabel.position.set(150, 42, -28);
  const zLabel = createLabelSprite('Ly = L(1 − h/2)', '#d98cff');
  zLabel.position.set(-42, 42, 155);
  zLabel.scale.set(175, 36, 1);

  const ambient = new AmbientLight(0xd2eaff, 0.52);
  const cyanLight = new PointLight(ligoColors.cyan, 11, 420);
  cyanLight.position.set(180, 100, -40);
  const magentaLight = new PointLight(ligoColors.magenta, 9, 420);
  magentaLight.position.set(-40, 110, 180);
  group.add(interferometer.group, grid, xLabel, zLabel, ambient, cyanLight, magentaLight);

  return {
    id: 'arms',
    group,
    cameraPosition: [390, 310, 425],
    cameraTarget: [70, 0, 70],
    update: (elapsedSeconds) => {
      const strain = Math.sin(elapsedSeconds * 1.45) * 0.055;
      interferometer.setStrain(strain);
      updateWavefronts(wavefronts, elapsedSeconds);
      xLabel.position.x = 150 + strain * 130;
      zLabel.position.z = 155 - strain * 130;
    },
  };
}
