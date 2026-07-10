import type { Group, Object3D } from 'three';

export const ligoSceneIds = [
  'spacetime',
  'arms',
  'laser',
  'dark-port',
  'cavity',
  'detection',
] as const;

export type LigoSceneId = (typeof ligoSceneIds)[number];

export type LigoSceneCalloutTone = 'cyan' | 'magenta' | 'laser' | 'amber';

export type LigoSceneCallout = {
  anchor: Object3D;
  label: string | (() => string);
  tone: LigoSceneCalloutTone;
};

export type LigoSceneView = {
  id: LigoSceneId;
  group: Group;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  callouts: LigoSceneCallout[];
  update: (elapsedSeconds: number) => void;
};

export function isLigoSceneId(value: string): value is LigoSceneId {
  return ligoSceneIds.includes(value as LigoSceneId);
}
