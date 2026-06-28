/**
 * Build-time hand-drawn (Excalidraw-style) SVG rendering via rough.js.
 *
 * This module runs only inside the Astro component frontmatter (server / build),
 * so rough.js never ships to the client. Each shape is roughened with a stable
 * seed derived from its id, so the sketch is deterministic across builds and the
 * geometry never re-wobbles when interactive state recolours a node.
 *
 * Colours are intentionally left to CSS: the hachure fill and the sketchy
 * outline are emitted as plain `<path>` elements whose stroke is driven by
 * `--node-*` custom properties, so the lab's live state (ok / needed /
 * overloaded …) recolours the same baked geometry.
 */
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import type { ShapePrimitive } from './architecture-shapes';

type RoughGenerator = ReturnType<typeof rough.generator>;

let generatorSingleton: RoughGenerator | null = null;

function generator(): RoughGenerator {
  if (!generatorSingleton) {
    generatorSingleton = rough.generator();
  }
  return generatorSingleton;
}

/** Stable FNV-1a hash → positive seed, so a given id always sketches the same. */
export function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 2_000_000_000) + 1;
}

function primitivePaths(primitive: ShapePrimitive, options: Options) {
  const gen = generator();
  const drawable =
    primitive.t === 'ellipse'
      ? gen.ellipse(primitive.cx, primitive.cy, primitive.w, primitive.h, options)
      : gen.path(primitive.d, options);
  return gen.toPaths(drawable);
}

function emit(paths: ReturnType<RoughGenerator['toPaths']>, className: string): string {
  return paths.map((path) => `<path class="${className}" d="${path.d}" />`).join('');
}

/** Hachure fill for the body shapes (recoloured by state via CSS). */
export function roughFillMarkup(primitives: ShapePrimitive[], seed: number): string {
  const options: Options = {
    fill: '#888888',
    fillStyle: 'hachure',
    fillWeight: 1.3,
    hachureGap: 7,
    hachureAngle: -41,
    stroke: 'none',
    seed,
    roughness: 0.9,
  };
  return primitives.map((primitive) => emit(primitivePaths(primitive, options), 'system-lab__rough-fill')).join('');
}

/** Sketchy double-stroke outline for the silhouette. */
export function roughStrokeMarkup(primitives: ShapePrimitive[], seed: number): string {
  const options: Options = {
    fill: 'none',
    stroke: '#1e1e1e',
    strokeWidth: 1.35,
    seed,
    roughness: 1,
    bowing: 0.8,
  };
  return primitives.map((primitive) => emit(primitivePaths(primitive, options), 'system-lab__rough-stroke')).join('');
}

/** Faint sketchy container for a swim-lane zone. */
export function roughZoneMarkup(
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
): string {
  const gen = generator();
  const radius = 12;
  const d =
    `M ${x + radius} ${y} L ${x + width - radius} ${y} Q ${x + width} ${y} ${x + width} ${y + radius} ` +
    `L ${x + width} ${y + height - radius} Q ${x + width} ${y + height} ${x + width - radius} ${y + height} ` +
    `L ${x + radius} ${y + height} Q ${x} ${y + height} ${x} ${y + height - radius} ` +
    `L ${x} ${y + radius} Q ${x} ${y} ${x + radius} ${y} Z`;
  const drawable = gen.path(d, {
    fill: 'none',
    stroke: '#9aa3ac',
    strokeWidth: 0.9,
    seed,
    roughness: 0.7,
    bowing: 0.4,
  });
  return emit(gen.toPaths(drawable), 'system-lab__zone-stroke');
}

/** Sketchy connector; the double stroke reads like a hand-drawn line. */
export function roughFlowMarkup(d: string, seed: number): string {
  const gen = generator();
  const drawable = gen.path(d, {
    fill: 'none',
    stroke: '#1e1e1e',
    strokeWidth: 1.5,
    seed,
    roughness: 1,
    bowing: 1,
  });
  return emit(gen.toPaths(drawable), 'system-lab__sketch-flow');
}
