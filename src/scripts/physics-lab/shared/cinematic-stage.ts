import { STAGE_HEIGHT, STAGE_WIDTH, type Point } from './stage';

export const cinematicPalette = {
  text: '#f4fbff',
  muted: '#9bb1c5',
  cyan: '#42e8ff',
  blue: '#5b8cff',
  teal: '#36f1cd',
  amber: '#ffbd4a',
  orange: '#ff7a45',
  red: '#ff4f68',
  violet: '#b88cff',
  green: '#75f0a5',
} as const;

type BackdropTheme = 'aerodynamics' | 'optics' | 'laser' | 'fusion';

const backdrops: Record<BackdropTheme, { top: string; bottom: string; glow: string }> = {
  aerodynamics: { top: '#071923', bottom: '#0a2525', glow: 'rgba(54, 241, 205, 0.16)' },
  optics: { top: '#071426', bottom: '#071c2d', glow: 'rgba(66, 232, 255, 0.18)' },
  laser: { top: '#080716', bottom: '#130a20', glow: 'rgba(255, 79, 104, 0.18)' },
  fusion: { top: '#160910', bottom: '#080b1a', glow: 'rgba(255, 122, 69, 0.2)' },
};

export function drawCinematicBackdrop(
  context: CanvasRenderingContext2D,
  theme: BackdropTheme,
  timeSeconds: number,
): void {
  const colors = backdrops[theme];
  context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  const background = context.createLinearGradient(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  background.addColorStop(0, colors.top);
  background.addColorStop(1, colors.bottom);
  context.fillStyle = background;
  context.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  const movingGlowX = STAGE_WIDTH * (0.5 + Math.sin(timeSeconds * 0.18) * 0.16);
  const glow = context.createRadialGradient(movingGlowX, 210, 8, movingGlowX, 210, 430);
  glow.addColorStop(0, colors.glow);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  context.save();
  for (let index = 0; index < 70; index += 1) {
    const x = (index * 137.5 + 31) % STAGE_WIDTH;
    const y = (index * 73.7 + 19) % STAGE_HEIGHT;
    const pulse = 0.14 + 0.1 * Math.sin(timeSeconds * 0.9 + index * 1.7);
    context.fillStyle = `rgba(195, 225, 255, ${Math.max(0.04, pulse)})`;
    context.beginPath();
    context.arc(x, y, index % 9 === 0 ? 1.4 : 0.75, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export function drawGlowLine(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  width = 2,
  glow = 12,
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.shadowColor = color;
  context.shadowBlur = glow;
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

export function drawGlowPath(
  context: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  width = 2.5,
  glow = 14,
): void {
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.shadowColor = color;
  context.shadowBlur = glow;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
  context.restore();
}

export function drawGlowDisc(
  context: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  color: string,
  coreColor = '#ffffff',
): void {
  const halo = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 3.4);
  halo.addColorStop(0, color);
  halo.addColorStop(0.22, color);
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.save();
  context.globalAlpha = 0.34;
  context.fillStyle = halo;
  context.beginPath();
  context.arc(point.x, point.y, radius * 3.4, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = coreColor;
  context.shadowColor = color;
  context.shadowBlur = 14;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function drawHudPanel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  context.save();
  context.fillStyle = 'rgba(5, 14, 24, 0.62)';
  context.strokeStyle = 'rgba(155, 190, 215, 0.2)';
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, width, height, 10);
  context.fill();
  context.stroke();
  context.restore();
}

export function drawPerspectiveGrid(
  context: CanvasRenderingContext2D,
  horizonY: number,
  color = 'rgba(90, 190, 185, 0.15)',
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1;
  for (let index = 0; index <= 12; index += 1) {
    const x = (index / 12) * STAGE_WIDTH;
    context.beginPath();
    context.moveTo(STAGE_WIDTH / 2, horizonY);
    context.lineTo(x, STAGE_HEIGHT);
    context.stroke();
  }
  for (let index = 0; index < 8; index += 1) {
    const progress = index / 8;
    const y = horizonY + (progress * progress) * (STAGE_HEIGHT - horizonY);
    context.globalAlpha = 0.25 + progress * 0.55;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(STAGE_WIDTH, y);
    context.stroke();
  }
  context.restore();
}
