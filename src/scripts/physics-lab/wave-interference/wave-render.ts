import {
  drawDashedLine,
  drawDisc,
  drawLabel,
  palette,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Point,
} from '../shared/stage';
import { amplitudeAt, fieldAt, pathDifference, type WaveParameters } from './wave-physics';

export const WAVE_CENTER: Point = { x: STAGE_WIDTH * 0.42, y: STAGE_HEIGHT / 2 };

const fieldWidth = 320;
const fieldHeight = Math.round((fieldWidth * STAGE_HEIGHT) / STAGE_WIDTH);
const screenX = STAGE_WIDTH - 132;
const stripX = STAGE_WIDTH - 104;
const stripWidth = 80;
const stripTop = 44;
const stripBottom = STAGE_HEIGHT - 44;

const baseColor: [number, number, number] = [245, 247, 243];
const crestColor: [number, number, number] = [220, 38, 38];
const troughColor: [number, number, number] = [37, 99, 235];

let fieldCanvas: HTMLCanvasElement | null = null;
let fieldContext: CanvasRenderingContext2D | null = null;

function ensureFieldBuffer(): CanvasRenderingContext2D | null {
  if (!fieldContext) {
    fieldCanvas = document.createElement('canvas');
    fieldCanvas.width = fieldWidth;
    fieldCanvas.height = fieldHeight;
    fieldContext = fieldCanvas.getContext('2d');
  }
  return fieldContext;
}

export type WaveSceneOptions = {
  parameters: WaveParameters;
  sources: [Point, Point];
  phaseTime: number;
  sample: Point;
  showWavefronts: boolean;
  showIntensity: boolean;
};

export function drawWaveInterference(
  context: CanvasRenderingContext2D,
  options: WaveSceneOptions,
): void {
  const buffer = ensureFieldBuffer();
  if (!buffer || !fieldCanvas) {
    return;
  }
  const { parameters, sources, phaseTime, sample, showWavefronts, showIntensity } = options;

  drawField(context, buffer, fieldCanvas, sources, parameters, phaseTime);

  if (showWavefronts) {
    drawWavefronts(context, sources, parameters, phaseTime);
  }

  drawSources(context, sources);
  drawProbe(context, sample, sources, parameters);

  if (showIntensity) {
    drawIntensityStrip(context, sources, parameters);
  }
}

function drawField(
  context: CanvasRenderingContext2D,
  buffer: CanvasRenderingContext2D,
  bufferCanvas: HTMLCanvasElement,
  sources: [Point, Point],
  parameters: WaveParameters,
  phaseTime: number,
): void {
  const image = buffer.createImageData(fieldWidth, fieldHeight);
  for (let y = 0; y < fieldHeight; y += 1) {
    for (let x = 0; x < fieldWidth; x += 1) {
      const point: Point = {
        x: (x / (fieldWidth - 1)) * STAGE_WIDTH,
        y: (y / (fieldHeight - 1)) * STAGE_HEIGHT,
      };
      const field = fieldAt(point, sources, parameters, phaseTime);
      const target = field >= 0 ? crestColor : troughColor;
      const amount = Math.min(Math.abs(field) * 0.72, 1);
      const offset = (y * fieldWidth + x) * 4;
      image.data[offset] = baseColor[0] + (target[0] - baseColor[0]) * amount;
      image.data[offset + 1] = baseColor[1] + (target[1] - baseColor[1]) * amount;
      image.data[offset + 2] = baseColor[2] + (target[2] - baseColor[2]) * amount;
      image.data[offset + 3] = 255;
    }
  }
  buffer.putImageData(image, 0, 0);
  context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  context.imageSmoothingEnabled = true;
  context.drawImage(bufferCanvas, 0, 0, STAGE_WIDTH, STAGE_HEIGHT);
}

function drawWavefronts(
  context: CanvasRenderingContext2D,
  sources: [Point, Point],
  parameters: WaveParameters,
  phaseTime: number,
): void {
  const wavelength = parameters.wavelength;
  const phaseRadius = (phaseTime * wavelength) / (Math.PI * 2);
  context.save();
  context.strokeStyle = 'rgba(22, 32, 28, 0.14)';
  context.lineWidth = 1;
  sources.forEach((source) => {
    const base = ((phaseRadius % wavelength) + wavelength) % wavelength;
    for (let ring = 0; ring < 14; ring += 1) {
      const radius = base + ring * wavelength;
      if (radius < 6) {
        continue;
      }
      context.beginPath();
      context.arc(source.x, source.y, radius, 0, Math.PI * 2);
      context.stroke();
    }
  });
  context.restore();
}

function drawSources(context: CanvasRenderingContext2D, sources: [Point, Point]): void {
  drawDisc(context, sources[0], 9, { fill: palette.red, stroke: '#ffffff', strokeWidth: 2.5 });
  drawDisc(context, sources[1], 9, { fill: palette.blue, stroke: '#ffffff', strokeWidth: 2.5 });
}

function drawProbe(
  context: CanvasRenderingContext2D,
  sample: Point,
  sources: [Point, Point],
  parameters: WaveParameters,
): void {
  drawDashedLine(context, sources[0], sample, 'rgba(22,32,28,0.4)');
  drawDashedLine(context, sources[1], sample, 'rgba(22,32,28,0.4)');

  context.strokeStyle = palette.ink;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(sample.x - 9, sample.y);
  context.lineTo(sample.x + 9, sample.y);
  context.moveTo(sample.x, sample.y - 9);
  context.lineTo(sample.x, sample.y + 9);
  context.stroke();

  const difference = pathDifference(sample, sources);
  const inWavelengths = difference / parameters.wavelength;
  const nearestInteger = Math.round(inWavelengths);
  const distanceFromInteger = Math.abs(inWavelengths - nearestInteger);
  const status =
    distanceFromInteger < 0.12
      ? 'constructive'
      : Math.abs(distanceFromInteger - 0.5) < 0.12
        ? 'destructive'
        : 'partial';
  const statusColor =
    status === 'constructive' ? palette.red : status === 'destructive' ? palette.blue : palette.muted;

  drawLabel(
    context,
    `Δ = ${inWavelengths.toFixed(2)} λ · ${status}`,
    sample.x + 14,
    sample.y - 12,
    { color: statusColor, size: 12, weight: 700, background: true },
  );
}

function drawIntensityStrip(
  context: CanvasRenderingContext2D,
  sources: [Point, Point],
  parameters: WaveParameters,
): void {
  drawDashedLine(
    context,
    { x: screenX, y: stripTop },
    { x: screenX, y: stripBottom },
    'rgba(22,32,28,0.3)',
  );

  context.save();
  context.fillStyle = 'rgba(255,255,255,0.86)';
  context.strokeStyle = palette.grid;
  context.lineWidth = 1;
  context.beginPath();
  context.rect(stripX, stripTop, stripWidth, stripBottom - stripTop);
  context.fill();
  context.stroke();

  const samples = 90;
  const maxAmplitude = 2;
  context.beginPath();
  for (let index = 0; index <= samples; index += 1) {
    const y = stripTop + ((stripBottom - stripTop) * index) / samples;
    const amplitude = amplitudeAt({ x: screenX, y }, sources, parameters);
    const x = stripX + Math.min(amplitude / maxAmplitude, 1) * stripWidth;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.strokeStyle = palette.teal;
  context.lineWidth = 2;
  context.stroke();
  context.restore();

  drawLabel(context, 'intensity', stripX + stripWidth / 2, stripTop - 8, {
    color: palette.muted,
    size: 11,
    weight: 700,
    align: 'center',
  });
}
