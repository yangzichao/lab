import type { Group } from 'three';

export const ligoSceneIds = [
  'spacetime',
  'arms',
  'laser',
  'dark-port',
  'cavity',
  'detection',
] as const;

export type LigoSceneId = (typeof ligoSceneIds)[number];

export type LigoSceneView = {
  id: LigoSceneId;
  group: Group;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  update: (elapsedSeconds: number) => void;
};

export function isLigoSceneId(value: string): value is LigoSceneId {
  return ligoSceneIds.includes(value as LigoSceneId);
}
