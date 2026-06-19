// Two coherent point sources and the field they produce. `fieldAt` is the
// instantaneous displacement used for the heat-map; `amplitudeAt` is the
// time-averaged envelope used for the fringe / intensity readout — the thing a
// screen would actually record.

import type { Point } from '../shared/stage';

export type WaveParameters = {
  wavelength: number;
  sourceSeparation: number;
  phaseOffset: number;
  falloff: number;
};

export function sourcePositions(center: Point, separation: number): [Point, Point] {
  return [
    { x: center.x - separation / 2, y: center.y },
    { x: center.x + separation / 2, y: center.y },
  ];
}

function attenuation(distance: number, falloff: number): number {
  return 1 / Math.sqrt(1 + falloff * distance);
}

export function fieldAt(
  point: Point,
  sources: [Point, Point],
  parameters: WaveParameters,
  phaseTime: number,
): number {
  const waveNumber = (Math.PI * 2) / parameters.wavelength;
  const firstDistance = Math.max(Math.hypot(point.x - sources[0].x, point.y - sources[0].y), 1);
  const secondDistance = Math.max(Math.hypot(point.x - sources[1].x, point.y - sources[1].y), 1);
  return (
    Math.sin(waveNumber * firstDistance - phaseTime) * attenuation(firstDistance, parameters.falloff) +
    Math.sin(waveNumber * secondDistance - phaseTime + parameters.phaseOffset) *
      attenuation(secondDistance, parameters.falloff)
  );
}

// Time-averaged amplitude envelope from adding two phasors of amplitude a1, a2
// with phase difference Δφ:  sqrt(a1² + a2² + 2·a1·a2·cos Δφ).
export function amplitudeAt(
  point: Point,
  sources: [Point, Point],
  parameters: WaveParameters,
): number {
  const waveNumber = (Math.PI * 2) / parameters.wavelength;
  const firstDistance = Math.max(Math.hypot(point.x - sources[0].x, point.y - sources[0].y), 1);
  const secondDistance = Math.max(Math.hypot(point.x - sources[1].x, point.y - sources[1].y), 1);
  const a1 = attenuation(firstDistance, parameters.falloff);
  const a2 = attenuation(secondDistance, parameters.falloff);
  const phaseDifference = waveNumber * (secondDistance - firstDistance) + parameters.phaseOffset;
  return Math.sqrt(Math.max(a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(phaseDifference), 0));
}

export function pathDifference(point: Point, sources: [Point, Point]): number {
  const firstDistance = Math.hypot(point.x - sources[0].x, point.y - sources[0].y);
  const secondDistance = Math.hypot(point.x - sources[1].x, point.y - sources[1].y);
  return secondDistance - firstDistance;
}
