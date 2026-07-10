import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Quaternion,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
} from 'three';

export const ligoColors = {
  cyan: 0x55e6ff,
  magenta: 0xd98cff,
  laser: 0xff4b7d,
  amber: 0xffbf69,
  ice: 0xd9efff,
  navy: 0x07111d,
} as const;

export function createCylinderBetween(
  start: Vector3,
  end: Vector3,
  radius: number,
  material: Material,
  radialSegments = 12,
): Mesh<CylinderGeometry, Material> {
  const direction = end.clone().sub(start);
  const geometry = new CylinderGeometry(radius, radius, direction.length(), radialSegments);
  const mesh = new Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.copy(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()),
  );
  return mesh;
}

export function createGlowMaterial(
  color: ColorRepresentation,
  opacity = 1,
): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

export function createMetalMaterial(color: ColorRepresentation): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color,
    metalness: 0.72,
    roughness: 0.2,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
  });
}

export function createLabelSprite(text: string, accent = '#76e5ff'): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(4, 13, 24, 0.82)';
    context.beginPath();
    context.roundRect(12, 18, 744, 124, 34);
    context.fill();
    context.strokeStyle = accent;
    context.globalAlpha = 0.55;
    context.lineWidth = 3;
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = '#f1f7ff';
    context.font = '600 52px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 384, 81);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(
    new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(170, 36, 1);
  return sprite;
}

export type InterferometerAssembly = {
  group: Group;
  beamSplitter: Mesh;
  xArm: Mesh;
  zArm: Mesh;
  xMirror: Mesh;
  zMirror: Mesh;
  setStrain: (strain: number) => void;
};

export function createInterferometerAssembly(armLength = 230): InterferometerAssembly {
  const group = new Group();
  const tubeMaterial = new MeshPhysicalMaterial({
    color: 0x253a4b,
    metalness: 0.62,
    roughness: 0.28,
    transparent: true,
    opacity: 0.88,
  });
  const innerMaterial = new MeshBasicMaterial({
    color: 0x6d8da6,
    transparent: true,
    opacity: 0.12,
    side: DoubleSide,
  });
  const xArm = new Mesh(new BoxGeometry(1, 12, 16), tubeMaterial);
  const zArm = new Mesh(new BoxGeometry(16, 12, 1), tubeMaterial.clone());
  const xInner = new Mesh(new BoxGeometry(1, 5, 8), innerMaterial);
  const zInner = new Mesh(new BoxGeometry(8, 5, 1), innerMaterial.clone());
  const mirrorMaterial = createMetalMaterial(0xd7e9f6);
  const xMirror = new Mesh(new CylinderGeometry(21, 21, 7, 40), mirrorMaterial);
  const zMirror = new Mesh(new CylinderGeometry(21, 21, 7, 40), mirrorMaterial.clone());
  xMirror.rotation.z = Math.PI / 2;
  zMirror.rotation.x = Math.PI / 2;

  const beamSplitter = new Mesh(
    new BoxGeometry(28, 3, 28),
    new MeshPhysicalMaterial({
      color: 0x9ceeff,
      transmission: 0.72,
      transparent: true,
      opacity: 0.72,
      roughness: 0.05,
      metalness: 0.08,
      thickness: 4,
    }),
  );
  beamSplitter.rotation.y = Math.PI / 4;
  beamSplitter.position.y = 4;

  const vertex = new Mesh(
    new CylinderGeometry(34, 38, 10, 6),
    new MeshPhysicalMaterial({ color: 0x172736, metalness: 0.7, roughness: 0.32 }),
  );
  vertex.position.y = -4;

  const setStrain = (strain: number): void => {
    const xLength = armLength * (1 + strain);
    const zLength = armLength * (1 - strain);
    xArm.scale.x = xLength;
    xArm.position.set(xLength / 2, 0, 0);
    zArm.scale.z = zLength;
    zArm.position.set(0, 0, zLength / 2);
    xInner.scale.x = xLength;
    xInner.position.set(xLength / 2, 1, 0);
    zInner.scale.z = zLength;
    zInner.position.set(0, 1, zLength / 2);
    xMirror.position.set(xLength, 4, 0);
    zMirror.position.set(0, 4, zLength);
  };

  setStrain(0);
  group.add(xArm, zArm, xInner, zInner, xMirror, zMirror, beamSplitter, vertex);
  return { group, beamSplitter, xArm, zArm, xMirror, zMirror, setStrain };
}

export function disposeObjectTree(group: Group): void {
  group.traverse((object) => {
    if ('geometry' in object && object.geometry instanceof Object) {
      (object.geometry as BufferGeometry).dispose?.();
    }
    if (!('material' in object)) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials as Material[]) {
      if (material instanceof SpriteMaterial && material.map) {
        material.map.dispose();
      }
      material.dispose();
    }
  });
}
