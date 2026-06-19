import type { BeachShow } from './geoduck-dig-types';
import type { DigSnapshot } from './dig-engine';
import { MAX_DEPTH_FT, WATER_TABLE_FT } from './geoduck-dig-config';

const SKY_HEIGHT = 46;
const BOTTOM_PAD = 14;

interface CrossSectionGeometry {
  surfaceY: number;
  sandBottomY: number;
  centerX: number;
  ftToY: (ft: number) => number;
}

function geometry(width: number, height: number): CrossSectionGeometry {
  const surfaceY = SKY_HEIGHT;
  const sandBottomY = height - BOTTOM_PAD;
  const usableHeight = sandBottomY - surfaceY;
  return {
    surfaceY,
    sandBottomY,
    centerX: Math.round(width * 0.54),
    ftToY: (ft: number) => surfaceY + (ft / MAX_DEPTH_FT) * usableHeight,
  };
}

interface ShaftWidths {
  top: number;
  bottom: number;
}

function shaftWidths(toolId: string): ShaftWidths {
  switch (toolId) {
    case 'shovel':
      return { top: 132, bottom: 58 };
    case 'steel-tube':
      return { top: 66, bottom: 66 };
    case 'clam-gun':
      return { top: 40, bottom: 40 };
    default:
      return { top: 80, bottom: 80 }; // pvc-tube
  }
}

function halfWidthAt(ftFraction: number, widths: ShaftWidths): number {
  return widths.top + (widths.bottom - widths.top) * ftFraction;
}

// ---------------------------------------------------------------------------
// Survey view — a top-down patch of tidal flat dotted with "shows".
// ---------------------------------------------------------------------------
export function drawSurvey(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shows: BeachShow[],
  hoverId: number | null,
): void {
  const flat = ctx.createLinearGradient(0, 0, 0, height);
  flat.addColorStop(0, '#c9b890');
  flat.addColorStop(1, '#a89066');
  ctx.fillStyle = flat;
  ctx.fillRect(0, 0, width, height);

  // Wet sheen ripples left behind by the retreating tide.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 7; i += 1) {
    const y = (height / 7) * i + 14;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 24) {
      const wobble = Math.sin(x * 0.03 + i) * 4;
      if (x === 0) {
        ctx.moveTo(x, y + wobble);
      } else {
        ctx.lineTo(x, y + wobble);
      }
    }
    ctx.stroke();
  }

  for (const show of shows) {
    const cx = show.x * width;
    const cy = show.y * height;
    const hovered = hoverId === show.id;

    // Damp halo around the show.
    ctx.fillStyle = 'rgba(60, 50, 30, 0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 26, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // The dimple / neck tip itself.
    ctx.fillStyle = show.inspected ? '#3f3320' : '#2c2516';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (hovered) {
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 30, 22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (show.inspected) {
      ctx.fillStyle = '#1f3b35';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(show.clam.label, cx, cy + 36);
    }
  }

  ctx.fillStyle = 'rgba(31, 41, 38, 0.7)';
  ctx.font = '600 13px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Click a show to inspect it.', 16, height - 16);
}

// ---------------------------------------------------------------------------
// Dig view — the vertical cross-section that is the heart of the game.
// ---------------------------------------------------------------------------
export function drawDig(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  snap: DigSnapshot,
): void {
  const geo = geometry(width, height);
  drawSkyAndWater(ctx, width, geo);
  drawSand(ctx, width, geo);
  drawWaterTable(ctx, width, geo);
  drawClam(ctx, geo, snap, false);
  drawHole(ctx, geo, snap);
  drawClam(ctx, geo, snap, true);
  drawGraspGlow(ctx, geo, snap);
  drawTubeWalls(ctx, geo, snap);
  drawDepthRuler(ctx, geo, snap);
}

function drawSkyAndWater(
  ctx: CanvasRenderingContext2D,
  width: number,
  geo: CrossSectionGeometry,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, geo.surfaceY);
  sky.addColorStop(0, '#dbe9ec');
  sky.addColorStop(1, '#c2d6da');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, geo.surfaceY);
}

function drawSand(ctx: CanvasRenderingContext2D, width: number, geo: CrossSectionGeometry): void {
  const sand = ctx.createLinearGradient(0, geo.surfaceY, 0, geo.sandBottomY);
  sand.addColorStop(0, '#d8c39a');
  sand.addColorStop(WATER_TABLE_FT / MAX_DEPTH_FT, '#b39d70');
  sand.addColorStop(0.55, '#8a784f');
  sand.addColorStop(1, '#5f5238');
  ctx.fillStyle = sand;
  ctx.fillRect(0, geo.surfaceY, width, geo.sandBottomY - geo.surfaceY);

  // A few gravel speckles for texture.
  ctx.fillStyle = 'rgba(40, 32, 18, 0.18)';
  for (let i = 0; i < 90; i += 1) {
    const x = (i * 97.13) % width;
    const y = geo.surfaceY + ((i * 53.7) % (geo.sandBottomY - geo.surfaceY));
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawWaterTable(
  ctx: CanvasRenderingContext2D,
  width: number,
  geo: CrossSectionGeometry,
): void {
  const y = geo.ftToY(WATER_TABLE_FT);
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(37, 99, 235, 0.7)';
  ctx.font = '600 11px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('water table', width - 10, y - 6);
}

function shaftBoundsAt(geo: CrossSectionGeometry, snap: DigSnapshot, ft: number): [number, number] {
  const widths = shaftWidths(snap.tool.id);
  const half = halfWidthAt(ft / MAX_DEPTH_FT, widths);
  return [geo.centerX - half, geo.centerX + half];
}

function drawHole(ctx: CanvasRenderingContext2D, geo: CrossSectionGeometry, snap: DigSnapshot): void {
  const dugY = geo.ftToY(snap.dugDepthFt);
  const widths = shaftWidths(snap.tool.id);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(geo.centerX - widths.top, geo.surfaceY);
  // Left wall down.
  const steps = 16;
  for (let i = 0; i <= steps; i += 1) {
    const ft = (snap.dugDepthFt * i) / steps;
    const half = halfWidthAt(ft / MAX_DEPTH_FT, widths);
    ctx.lineTo(geo.centerX - half, geo.ftToY(ft));
  }
  // Right wall up.
  for (let i = steps; i >= 0; i -= 1) {
    const ft = (snap.dugDepthFt * i) / steps;
    const half = halfWidthAt(ft / MAX_DEPTH_FT, widths);
    ctx.lineTo(geo.centerX + half, geo.ftToY(ft));
  }
  ctx.closePath();
  ctx.clip();

  // Open hole interior: shaded sand walls.
  const interior = ctx.createLinearGradient(0, geo.surfaceY, 0, dugY);
  interior.addColorStop(0, '#7d6b46');
  interior.addColorStop(1, '#4a3f2a');
  ctx.fillStyle = interior;
  ctx.fillRect(0, geo.surfaceY, ctx.canvas.width, dugY - geo.surfaceY + 40);

  // Water pooling in the bottom of the hole, deeper = more flooded.
  const floodFt = Math.max(0, snap.dugDepthFt - WATER_TABLE_FT);
  if (floodFt > 0) {
    const poolTop = geo.ftToY(Math.max(WATER_TABLE_FT, snap.dugDepthFt - floodFt * 0.6));
    const pool = ctx.createLinearGradient(0, poolTop, 0, dugY);
    pool.addColorStop(0, 'rgba(54, 105, 130, 0.55)');
    pool.addColorStop(1, 'rgba(28, 64, 86, 0.85)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, poolTop, ctx.canvas.width, dugY - poolTop + 6);
  }
  ctx.restore();

  // Crisp rim where the hole meets the surface.
  const [rimL, rimR] = shaftBoundsAt(geo, snap, 0);
  ctx.strokeStyle = 'rgba(40, 32, 18, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rimL, geo.surfaceY);
  ctx.lineTo(geo.centerX - widths.top, geo.surfaceY);
  ctx.moveTo(rimR, geo.surfaceY);
  ctx.lineTo(geo.centerX + widths.top, geo.surfaceY);
  ctx.stroke();
}

function drawClam(
  ctx: CanvasRenderingContext2D,
  geo: CrossSectionGeometry,
  snap: DigSnapshot,
  exposedPass: boolean,
): void {
  const { clam } = snap;
  const bodyY = geo.ftToY(clam.bodyDepthFt);
  const neckTopY = geo.ftToY(snap.neckTipFt);

  // Faded pass draws the clam sensed through sand; exposed pass redraws it
  // crisply but clipped to the dug-out shaft so it only shows once uncovered.
  const proximity = clamp01((snap.dugDepthFt - (clam.bodyDepthFt - 1.3)) / 1.1);
  const baseAlpha = exposedPass ? 1 : 0.18 + proximity * 0.5;

  ctx.save();
  if (exposedPass) {
    const dugY = geo.ftToY(snap.dugDepthFt);
    const widths = shaftWidths(snap.tool.id);
    ctx.beginPath();
    ctx.rect(geo.centerX - widths.top - 4, geo.surfaceY, widths.top * 2 + 8, dugY - geo.surfaceY + 6);
    ctx.clip();
  }
  ctx.globalAlpha = baseAlpha;

  const palette = clamColors(clam.species);

  // Siphon / neck — a tapered fleshy tube from the body up to the (retracted) tip.
  ctx.strokeStyle = palette.neck;
  ctx.lineCap = 'round';
  const neckWidth = clam.neckShape === 'round' ? 18 : clam.neckShape === 'short' ? 14 : 13;
  ctx.lineWidth = neckWidth;
  ctx.beginPath();
  ctx.moveTo(geo.centerX, bodyY - 6);
  const midY = (bodyY + neckTopY) / 2;
  ctx.bezierCurveTo(
    geo.centerX + 6,
    midY,
    geo.centerX - 5,
    midY,
    geo.centerX,
    neckTopY,
  );
  ctx.stroke();

  // Siphon tip detail: geoduck shows two holes; horse clam a leathery cap.
  if (clam.tip === 'leathery') {
    ctx.fillStyle = '#6f6450';
    ctx.beginPath();
    ctx.ellipse(geo.centerX, neckTopY, neckWidth * 0.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#3a2c25';
    ctx.beginPath();
    ctx.ellipse(geo.centerX - 3, neckTopY, 2, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(geo.centerX + 3, neckTopY, 2, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shell body — two cupped valves.
  const shellW = clam.species === 'geoduck' ? 48 : clam.species === 'horse-clam' ? 40 : 24;
  const shellH = clam.species === 'geoduck' ? 30 : clam.species === 'horse-clam' ? 26 : 18;
  ctx.fillStyle = palette.shell;
  ctx.strokeStyle = palette.shellEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(geo.centerX, bodyY, shellW, shellH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // For a geoduck the mantle bulges out past the shell — its hallmark.
  if (clam.species === 'geoduck') {
    ctx.fillStyle = palette.neck;
    ctx.beginPath();
    ctx.ellipse(geo.centerX, bodyY + 6, shellW * 0.7, shellH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Growth rings.
  ctx.strokeStyle = palette.shellEdge;
  ctx.lineWidth = 1;
  ctx.globalAlpha = baseAlpha * 0.5;
  for (let r = 0.5; r < 1; r += 0.25) {
    ctx.beginPath();
    ctx.ellipse(geo.centerX, bodyY, shellW * r, shellH * r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawGraspGlow(
  ctx: CanvasRenderingContext2D,
  geo: CrossSectionGeometry,
  snap: DigSnapshot,
): void {
  if (!snap.band.canGrasp) {
    return;
  }
  const bodyY = geo.ftToY(snap.clam.bodyDepthFt);
  const pulse = 0.45 + 0.25 * Math.sin(snap.elapsedSeconds * 5);
  ctx.strokeStyle = `rgba(15, 118, 110, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(geo.centerX, bodyY, 70, 50, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#0f766e';
  ctx.font = '700 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('within reach', geo.centerX, bodyY - 58);
}

function drawTubeWalls(
  ctx: CanvasRenderingContext2D,
  geo: CrossSectionGeometry,
  snap: DigSnapshot,
): void {
  if (snap.tool.id === 'shovel') {
    return; // an open pit has no wall
  }
  const widths = shaftWidths(snap.tool.id);
  // The tube is driven a little past the cleared depth.
  const tubeBottomFt = Math.min(MAX_DEPTH_FT, snap.dugDepthFt + 0.35);
  const topY = geo.surfaceY - 16;
  const bottomY = geo.ftToY(tubeBottomFt);

  const isSteel = snap.tool.id === 'steel-tube';
  for (const side of [-1, 1] as const) {
    const x = geo.centerX + side * widths.top;
    const grad = ctx.createLinearGradient(x - 4, 0, x + 4, 0);
    if (isSteel) {
      grad.addColorStop(0, '#9aa3ab');
      grad.addColorStop(0.5, '#eef2f5');
      grad.addColorStop(1, '#9aa3ab');
    } else {
      grad.addColorStop(0, '#cfd8db');
      grad.addColorStop(0.5, '#f4f7f8');
      grad.addColorStop(1, '#cfd8db');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x - 4, topY, 8, bottomY - topY);
  }

  // Reinforced rim you hammer on.
  ctx.fillStyle = isSteel ? '#7c858d' : '#b9c3c6';
  ctx.fillRect(geo.centerX - widths.top - 6, topY, widths.top * 2 + 12, 8);
}

function drawDepthRuler(
  ctx: CanvasRenderingContext2D,
  geo: CrossSectionGeometry,
  snap: DigSnapshot,
): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fillRect(0, geo.surfaceY, 30, geo.sandBottomY - geo.surfaceY);
  ctx.strokeStyle = 'rgba(31, 41, 38, 0.25)';
  ctx.fillStyle = '#1f2926';
  ctx.font = '600 10px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (let ft = 0; ft <= MAX_DEPTH_FT; ft += 1) {
    const y = geo.ftToY(ft);
    ctx.beginPath();
    ctx.moveTo(22, y);
    ctx.lineTo(30, y);
    ctx.stroke();
    ctx.fillText(`${ft}`, 12, y + 3);
  }

  // The live dug-depth marker.
  const dugY = geo.ftToY(snap.dugDepthFt);
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.moveTo(30, dugY);
  ctx.lineTo(22, dugY - 5);
  ctx.lineTo(22, dugY + 5);
  ctx.closePath();
  ctx.fill();
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

interface ClamPalette {
  shell: string;
  shellEdge: string;
  neck: string;
}

function clamColors(species: string): ClamPalette {
  switch (species) {
    case 'geoduck':
      return { shell: '#e4d8c2', shellEdge: '#9c8a64', neck: '#d6a892' };
    case 'horse-clam':
      return { shell: '#cdc6b4', shellEdge: '#897f63', neck: '#9f9580' };
    default:
      return { shell: '#d9c6a3', shellEdge: '#9b8456', neck: '#c2a98c' };
  }
}
