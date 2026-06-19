// Canvas drawing toolkit shared by every physics lab. The goal is a clean,
// light "blackboard" look: a crisp dot grid, vivid color-coded vectors, angle
// arcs, and legible on-canvas labels — the things that turn a moving dot into
// something you can actually read.

export type Point = { x: number; y: number };
export type RgbColor = [number, number, number];

// Logical drawing space. The backing store is scaled by devicePixelRatio so
// strokes stay crisp on retina displays; everything below draws in these units.
export const STAGE_WIDTH = 900;
export const STAGE_HEIGHT = 560;

export const palette = {
  ink: '#16201c',
  muted: '#5d6863',
  faint: '#9aa8a0',
  grid: '#e2e8e2',
  gridStrong: '#cfd8d0',
  surface: '#f5f7f3',
  paper: '#ffffff',
  blue: '#2563eb',
  red: '#dc2626',
  teal: '#0f766e',
  amber: '#d97706',
  green: '#15803d',
  violet: '#7c3aed',
} as const;

export const rgb = {
  teal: [15, 118, 110],
  blue: [37, 99, 235],
  red: [220, 38, 38],
  amber: [217, 119, 6],
  violet: [124, 58, 237],
} satisfies Record<string, RgbColor>;

const labelFont = 'Inter, system-ui, sans-serif';

export function setupStageCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(STAGE_WIDTH * ratio);
  canvas.height = Math.round(STAGE_HEIGHT * ratio);
  context.scale(ratio, ratio);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  return context;
}

export function clearStage(context: CanvasRenderingContext2D, fill: string = palette.surface): void {
  context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  context.fillStyle = fill;
  context.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
}

export function drawDotGrid(context: CanvasRenderingContext2D, spacing = 36): void {
  context.fillStyle = palette.grid;
  for (let x = spacing; x < STAGE_WIDTH; x += spacing) {
    for (let y = spacing; y < STAGE_HEIGHT; y += spacing) {
      context.beginPath();
      context.arc(x, y, 1.1, 0, Math.PI * 2);
      context.fill();
    }
  }
}

export function drawAxes(context: CanvasRenderingContext2D, center: Point): void {
  context.save();
  context.strokeStyle = palette.gridStrong;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(28, center.y);
  context.lineTo(STAGE_WIDTH - 28, center.y);
  context.moveTo(center.x, 28);
  context.lineTo(center.x, STAGE_HEIGHT - 28);
  context.stroke();
  context.restore();
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

export function drawDisc(
  context: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  options: { fill: string; stroke?: string; strokeWidth?: number; glow?: boolean } = { fill: palette.ink },
): void {
  if (options.glow) {
    const gradient = context.createRadialGradient(
      point.x,
      point.y,
      radius * 0.4,
      point.x,
      point.y,
      radius * 2.8,
    );
    gradient.addColorStop(0, hexToRgba(options.fill, 0.32));
    gradient.addColorStop(1, hexToRgba(options.fill, 0));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(point.x, point.y, radius * 2.8, 0, Math.PI * 2);
    context.fill();
  }

  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fillStyle = options.fill;
  context.fill();
  if (options.stroke) {
    context.lineWidth = options.strokeWidth ?? 3;
    context.strokeStyle = options.stroke;
    context.stroke();
  }
}

export function drawArrow(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  options: { color: string; width?: number; headSize?: number } = { color: palette.ink },
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1.5) {
    return;
  }

  const width = options.width ?? 2.6;
  const headSize = options.headSize ?? Math.min(11, 5 + length * 0.06);
  const angle = Math.atan2(dy, dx);
  const shaftEnd = {
    x: to.x - Math.cos(angle) * headSize * 0.9,
    y: to.y - Math.sin(angle) * headSize * 0.9,
  };

  context.strokeStyle = options.color;
  context.fillStyle = options.color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(shaftEnd.x, shaftEnd.y);
  context.stroke();

  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(
    to.x - headSize * Math.cos(angle - 0.42),
    to.y - headSize * Math.sin(angle - 0.42),
  );
  context.lineTo(
    to.x - headSize * Math.cos(angle + 0.42),
    to.y - headSize * Math.sin(angle + 0.42),
  );
  context.closePath();
  context.fill();
}

export function drawAngleArc(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  color: string,
): void {
  const anticlockwise = endAngle < startAngle;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(center.x, center.y, radius, startAngle, endAngle, anticlockwise);
  context.stroke();
}

export function drawDashedLine(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  dash: number[] = [5, 7],
): void {
  context.save();
  context.setLineDash(dash);
  context.strokeStyle = color;
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

export function drawFadingTrail(
  context: CanvasRenderingContext2D,
  trail: Point[],
  color: RgbColor,
  options: { width?: number; maxAlpha?: number; minAlpha?: number } = {},
): void {
  if (trail.length < 2) {
    return;
  }
  const width = options.width ?? 2.4;
  const maxAlpha = options.maxAlpha ?? 0.6;
  const minAlpha = options.minAlpha ?? 0.04;

  context.lineWidth = width;
  for (let index = 1; index < trail.length; index += 1) {
    const progress = index / trail.length;
    const alpha = minAlpha + progress * (maxAlpha - minAlpha);
    context.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
    context.beginPath();
    context.moveTo(trail[index - 1].x, trail[index - 1].y);
    context.lineTo(trail[index].x, trail[index].y);
    context.stroke();
  }
}

export type LabelOptions = {
  color?: string;
  size?: number;
  weight?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  background?: boolean;
};

export function drawLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: LabelOptions = {},
): void {
  const size = options.size ?? 13;
  const weight = options.weight ?? 600;
  context.save();
  context.font = `${weight} ${size}px ${labelFont}`;
  context.textAlign = options.align ?? 'left';
  context.textBaseline = options.baseline ?? 'alphabetic';

  if (options.background) {
    const metrics = context.measureText(text);
    const paddingX = 6;
    const paddingY = 4;
    const height = size + paddingY * 2;
    const width = metrics.width + paddingX * 2;
    let boxX = x - paddingX;
    if (context.textAlign === 'center') {
      boxX = x - width / 2;
    } else if (context.textAlign === 'right') {
      boxX = x - width + paddingX;
    }
    const boxY = y - size - paddingY + size * 0.18;
    roundedRectPath(context, boxX, boxY, width, height, 6);
    context.fillStyle = 'rgba(255, 255, 255, 0.82)';
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = palette.grid;
    context.stroke();
    context.textBaseline = 'alphabetic';
  }

  context.fillStyle = options.color ?? palette.ink;
  context.fillText(text, x, y);
  context.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized,
    16,
  );
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
