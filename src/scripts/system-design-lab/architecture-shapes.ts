/**
 * Classic system-design component geometry for the hand-drawn (Excalidraw-style)
 * architecture diagram.
 *
 * Each node carries a `kind` (database, cache, queue, client, …). This module
 * returns the *geometry primitives* for the recognizable whiteboard silhouettes
 * — a cylinder for a database, a bucket for object storage, a browser frame for
 * a client, a stack for a horizontally-scaled pool, a cloud for a CDN. The rough
 * renderer ({@link ./architecture-rough}) turns these primitives into sketchy,
 * hand-drawn SVG. Glyphs and thin structural details stay crisp for legibility.
 */
import type { ComponentKind, DiagramNodeDefinition } from './lab-types';

export type { ComponentKind };

/** A fillable / strokable geometry primitive the rough renderer can sketch. */
export type ShapePrimitive =
  | { t: 'path'; d: string }
  | { t: 'ellipse'; cx: number; cy: number; w: number; h: number };

type Geometry = Pick<DiagramNodeDefinition, 'x' | 'y' | 'width' | 'height'>;

type Silhouette = 'rounded' | 'cylinder' | 'bucket' | 'browser' | 'stacked' | 'cloud';

const KIND_SILHOUETTE: Record<ComponentKind, Silhouette> = {
  client: 'browser',
  cdn: 'cloud',
  external: 'cloud',
  lb: 'rounded',
  api: 'rounded',
  service: 'rounded',
  compute: 'stacked',
  container: 'stacked',
  queue: 'rounded',
  stream: 'rounded',
  cache: 'cylinder',
  db: 'cylinder',
  nosql: 'cylinder',
  objectstore: 'bucket',
  search: 'rounded',
  scheduler: 'rounded',
  gpu: 'rounded',
};

const DEFAULT_KIND: ComponentKind = 'service';

export function nodeKind(node: DiagramNodeDefinition): ComponentKind {
  const kind = node.kind as ComponentKind | undefined;
  return kind && kind in KIND_SILHOUETTE ? kind : DEFAULT_KIND;
}

/** Closed shapes that receive the hachure fill (the body of the component). */
export function nodeFillPrimitives(node: DiagramNodeDefinition): ShapePrimitive[] {
  const geo: Geometry = { x: node.x, y: node.y, width: node.width, height: node.height };
  switch (KIND_SILHOUETTE[nodeKind(node)]) {
    case 'cylinder':
      return [{ t: 'path', d: cylinderBodyPath(geo) }];
    case 'bucket':
      return [{ t: 'path', d: bucketBodyPath(geo) }];
    case 'cloud':
      return [{ t: 'path', d: cloudPath(geo) }];
    case 'stacked':
      return [{ t: 'path', d: roundedRectPath(geo.x, geo.y, geo.width, geo.height, 10) }];
    default:
      return [{ t: 'path', d: roundedRectPath(geo.x, geo.y, geo.width, geo.height, 11) }];
  }
}

/** All shapes that receive the sketchy outline stroke (body + rims + stack shadows). */
export function nodeOutlinePrimitives(node: DiagramNodeDefinition): ShapePrimitive[] {
  const geo: Geometry = { x: node.x, y: node.y, width: node.width, height: node.height };
  const { x, y, width: w, height: h } = geo;

  switch (KIND_SILHOUETTE[nodeKind(node)]) {
    case 'cylinder': {
      const ry = clamp(h * 0.16, 7, 12);
      return [
        { t: 'path', d: cylinderBodyPath(geo) },
        { t: 'ellipse', cx: x + w / 2, cy: y + ry, w, h: ry * 2 },
      ];
    }
    case 'bucket': {
      const ry = clamp(h * 0.13, 6, 10);
      return [
        { t: 'path', d: bucketBodyPath(geo) },
        { t: 'ellipse', cx: x + w / 2, cy: y + ry, w, h: ry * 2 },
      ];
    }
    case 'cloud':
      return [{ t: 'path', d: cloudPath(geo) }];
    case 'stacked': {
      const off = 5;
      return [
        { t: 'path', d: roundedRectPath(x + off * 2, y + off * 2, w, h, 10) },
        { t: 'path', d: roundedRectPath(x + off, y + off, w, h, 10) },
        { t: 'path', d: roundedRectPath(x, y, w, h, 10) },
      ];
    }
    default:
      return [{ t: 'path', d: roundedRectPath(x, y, w, h, 11) }];
  }
}

/** Crisp thin structural detail drawn on top (browser chrome bar + window dots). */
export function nodeDetailMarkup(node: DiagramNodeDefinition): string {
  if (KIND_SILHOUETTE[nodeKind(node)] !== 'browser') {
    return '';
  }
  const { x, y, width: w } = node;
  const barY = y + 17;
  const dotY = y + 9.5;
  return (
    `<path class="system-lab__shape-detail" d="M ${r(x)} ${r(barY)} L ${r(x + w)} ${r(barY)}" />` +
    `<circle class="system-lab__shape-dot" cx="${r(x + 16)}" cy="${r(dotY)}" r="2.3" />` +
    `<circle class="system-lab__shape-dot" cx="${r(x + 25)}" cy="${r(dotY)}" r="2.3" />` +
    `<circle class="system-lab__shape-dot" cx="${r(x + 34)}" cy="${r(dotY)}" r="2.3" />`
  );
}

/** Title baseline (centered layout: glyph on top, label below). */
export function nodeTextTop(node: DiagramNodeDefinition): number {
  const silhouette = KIND_SILHOUETTE[nodeKind(node)];
  if (silhouette === 'cylinder' || silhouette === 'browser') {
    return node.y + 54;
  }
  return node.y + 52;
}

// ---------------------------------------------------------------------------
// Geometry paths
// ---------------------------------------------------------------------------

function roundedRectPath(x: number, y: number, w: number, h: number, radius: number): string {
  const rad = Math.min(radius, w / 2, h / 2);
  return (
    `M ${r(x + rad)} ${r(y)} ` +
    `L ${r(x + w - rad)} ${r(y)} Q ${r(x + w)} ${r(y)} ${r(x + w)} ${r(y + rad)} ` +
    `L ${r(x + w)} ${r(y + h - rad)} Q ${r(x + w)} ${r(y + h)} ${r(x + w - rad)} ${r(y + h)} ` +
    `L ${r(x + rad)} ${r(y + h)} Q ${r(x)} ${r(y + h)} ${r(x)} ${r(y + h - rad)} ` +
    `L ${r(x)} ${r(y + rad)} Q ${r(x)} ${r(y)} ${r(x + rad)} ${r(y)} Z`
  );
}

function cylinderBodyPath(geo: Geometry): string {
  const { x, y, width: w, height: h } = geo;
  const ry = clamp(h * 0.16, 7, 12);
  const top = y + ry;
  const bottom = y + h - ry;
  const rx = w / 2;
  return (
    `M ${r(x)} ${r(top)} L ${r(x)} ${r(bottom)} ` +
    `A ${r(rx)} ${r(ry)} 0 0 0 ${r(x + w)} ${r(bottom)} ` +
    `L ${r(x + w)} ${r(top)} ` +
    `A ${r(rx)} ${r(ry)} 0 0 0 ${r(x)} ${r(top)} Z`
  );
}

function bucketBodyPath(geo: Geometry): string {
  const { x, y, width: w, height: h } = geo;
  const ry = clamp(h * 0.13, 6, 10);
  const top = y + ry;
  const inset = w * 0.08;
  return (
    `M ${r(x)} ${r(top)} ` +
    `L ${r(x + inset)} ${r(y + h - ry)} ` +
    `A ${r(w / 2 - inset)} ${r(ry)} 0 0 0 ${r(x + w - inset)} ${r(y + h - ry)} ` +
    `L ${r(x + w)} ${r(top)} ` +
    `A ${r(w / 2)} ${r(ry)} 0 0 0 ${r(x)} ${r(top)} Z`
  );
}

function cloudPath(geo: Geometry): string {
  const { x, y, width: w, height: h } = geo;
  const baseY = y + h - 8;
  return (
    `M ${r(x + w * 0.2)} ${r(baseY)} ` +
    `C ${r(x - 2)} ${r(baseY)} ${r(x - 2)} ${r(y + h * 0.45)} ${r(x + w * 0.16)} ${r(y + h * 0.42)} ` +
    `C ${r(x + w * 0.16)} ${r(y + 4)} ${r(x + w * 0.5)} ${r(y - 4)} ${r(x + w * 0.55)} ${r(y + h * 0.26)} ` +
    `C ${r(x + w * 0.72)} ${r(y + 2)} ${r(x + w + 2)} ${r(y + 6)} ${r(x + w * 0.86)} ${r(y + h * 0.46)} ` +
    `C ${r(x + w + 4)} ${r(y + h * 0.5)} ${r(x + w + 2)} ${r(baseY)} ${r(x + w * 0.8)} ${r(baseY)} Z`
  );
}

// ---------------------------------------------------------------------------
// Glyphs — small line icons, authored in a 24×24 box, placed top-left.
// ---------------------------------------------------------------------------

const GLYPHS: Record<ComponentKind, string> = {
  client: '<circle cx="12" cy="8.5" r="3.4" /><path d="M5.5 19 C6 14.5 18 14.5 18.5 19" />',
  cdn: '<circle cx="12" cy="12" r="8" /><path d="M4 12 H20 M12 4 C8 7 8 17 12 20 C16 17 16 7 12 4" />',
  external: '<circle cx="12" cy="12" r="8" /><path d="M4 12 H20 M12 4 C8 7 8 17 12 20 C16 17 16 7 12 4" />',
  lb: '<path d="M3 12 H9 M9 12 L19 5 M9 12 H19 M9 12 L19 19" /><circle cx="20" cy="5" r="1.8" /><circle cx="20" cy="12" r="1.8" /><circle cx="20" cy="19" r="1.8" /><circle cx="4" cy="12" r="1.8" />',
  api: '<path d="M9 7 L4 12 L9 17 M15 7 L20 12 L15 17" />',
  service: '<rect x="4" y="5" width="16" height="6" rx="1.5" /><rect x="4" y="13" width="16" height="6" rx="1.5" /><circle cx="7.5" cy="8" r="1" /><circle cx="7.5" cy="16" r="1" />',
  compute: '<rect x="4" y="5" width="16" height="6" rx="1.5" /><rect x="4" y="13" width="16" height="6" rx="1.5" /><circle cx="7.5" cy="8" r="1" /><circle cx="7.5" cy="16" r="1" />',
  container: '<path d="M12 3 L20 7 L12 11 L4 7 Z M4 7 V16 L12 20 L20 16 V7 M12 11 V20" />',
  queue: '<path d="M4 7 H20 M4 12 H20 M4 17 H14" /><path d="M16 17 L20 17 M18.5 15.5 L20 17 L18.5 18.5" />',
  stream: '<path d="M3 14 C6 8 9 8 12 14 C15 20 18 20 21 14" /><path d="M3 9 C6 4 9 4 12 9" />',
  cache: '<path d="M13 3 L5 13 H11 L9 21 L19 10 H12 Z" />',
  db: '<ellipse cx="12" cy="6" rx="7" ry="2.6" /><path d="M5 6 V18 C5 19.5 8 20.6 12 20.6 C16 20.6 19 19.5 19 18 V6 M5 12 C5 13.5 8 14.6 12 14.6 C16 14.6 19 13.5 19 12" />',
  nosql: '<path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z" /><path d="M12 3 V21 M4 7.5 L12 12 L20 7.5" />',
  objectstore: '<path d="M5 7 H19 L17 19 H7 Z" /><ellipse cx="12" cy="7" rx="7" ry="2.2" />',
  search: '<circle cx="10.5" cy="10.5" r="6" /><path d="M15 15 L20.5 20.5" />',
  scheduler: '<circle cx="12" cy="12" r="8" /><path d="M12 7 V12 L15.5 14.5" />',
  gpu: '<rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="9.5" y="9.5" width="5" height="5" /><path d="M9 6 V3 M15 6 V3 M9 18 V21 M15 18 V21 M6 9 H3 M6 15 H3 M18 9 H21 M18 15 H21" />',
};

/** Raw SVG for the node's kind glyph, placed at the node's top-left. */
export function nodeGlyphMarkup(node: DiagramNodeDefinition): string {
  const kind = nodeKind(node);
  const glyph = GLYPHS[kind];
  if (!glyph) {
    return '';
  }
  const silhouette = KIND_SILHOUETTE[kind];
  const scale = 0.84;
  // Glyph centered horizontally near the top; label sits centered below it.
  const gx = node.x + node.width / 2 - 12 * scale;
  const gy = node.y + (silhouette === 'cylinder' ? 16 : silhouette === 'browser' ? 23 : 14);
  return `<g class="system-lab__shape-glyph" transform="translate(${r(gx)} ${r(gy)}) scale(${scale})">${glyph}</g>`;
}

// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function r(value: number): number {
  return Math.round(value * 10) / 10;
}
