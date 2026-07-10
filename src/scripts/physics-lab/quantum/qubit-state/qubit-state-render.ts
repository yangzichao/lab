import {
  clearStage,
  drawArrow,
  drawDashedLine,
  drawDotGrid,
  drawLabel,
  palette,
  setupStageCanvas,
  STAGE_HEIGHT,
  type Point,
} from '../../shared/stage';
import type { QubitStateParameters, QubitStateReading } from './qubit-state-physics';

type QubitStateLabels = {
  sphere: string;
  amplitudes: string;
  selectedBasis: string;
  phaseHint: string;
};

const sphereCenter: Point = { x: 270, y: 282 };
const sphereRadius = 190;
const readingLeft = 540;
const barWidth = 285;

export class QubitStateRenderer {
  private readonly context: CanvasRenderingContext2D | null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly labels: QubitStateLabels,
  ) {
    this.context = setupStageCanvas(canvas);
  }

  draw(parameters: QubitStateParameters, reading: QubitStateReading): void {
    if (!this.context) return;
    const context = this.context;

    clearStage(context);
    drawDotGrid(context);
    this.drawBlochSphere(context, parameters, reading);
    this.drawProbabilityBars(context, parameters, reading);
  }

  private drawBlochSphere(
    context: CanvasRenderingContext2D,
    parameters: QubitStateParameters,
    reading: QubitStateReading,
  ): void {
    drawLabel(context, this.labels.sphere, 48, 46, {
      color: palette.muted,
      size: 12,
      weight: 800,
    });

    context.save();
    context.strokeStyle = palette.gridStrong;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(sphereCenter.x, sphereCenter.y, sphereRadius, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.ellipse(
      sphereCenter.x,
      sphereCenter.y,
      sphereRadius,
      sphereRadius * 0.34,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
    context.restore();

    drawDashedLine(
      context,
      { x: sphereCenter.x, y: sphereCenter.y - sphereRadius - 14 },
      { x: sphereCenter.x, y: sphereCenter.y + sphereRadius + 14 },
      palette.faint,
    );
    drawLabel(context, '|0⟩', sphereCenter.x, sphereCenter.y - sphereRadius - 22, {
      color: palette.blue,
      size: 14,
      weight: 800,
      align: 'center',
    });
    drawLabel(context, '|1⟩', sphereCenter.x, sphereCenter.y + sphereRadius + 28, {
      color: palette.red,
      size: 14,
      weight: 800,
      align: 'center',
    });

    const projected = {
      x: sphereCenter.x + sphereRadius * (reading.bloch.x * 0.83 + reading.bloch.y * 0.34),
      y: sphereCenter.y - sphereRadius * (reading.bloch.z * 0.86 + reading.bloch.y * 0.22),
    };
    drawArrow(context, sphereCenter, projected, {
      color: palette.violet,
      width: 4,
      headSize: 13,
    });
    drawDashedLine(
      context,
      projected,
      { x: projected.x, y: sphereCenter.y },
      palette.violet,
      [4, 5],
    );
    drawLabel(context, '|ψ⟩', projected.x + 12, projected.y - 8, {
      color: palette.violet,
      size: 16,
      weight: 800,
    });
    drawLabel(
      context,
      `θ = ${Math.round(parameters.thetaDegrees)}°   φ = ${Math.round(parameters.phaseDegrees)}°`,
      sphereCenter.x,
      STAGE_HEIGHT - 35,
      { color: palette.muted, size: 12, weight: 700, align: 'center' },
    );
  }

  private drawProbabilityBars(
    context: CanvasRenderingContext2D,
    parameters: QubitStateParameters,
    reading: QubitStateReading,
  ): void {
    drawLabel(context, this.labels.amplitudes, readingLeft, 46, {
      color: palette.muted,
      size: 12,
      weight: 800,
    });

    this.drawBar(context, 116, 'P(0)', reading.probabilityZero, palette.blue);
    this.drawBar(context, 185, 'P(1)', reading.probabilityOne, palette.red);

    drawLabel(context, this.labels.selectedBasis, readingLeft, 282, {
      color: palette.muted,
      size: 12,
      weight: 800,
    });
    this.drawBar(context, 335, 'P(+β)', reading.probabilityPlus, palette.violet);
    this.drawBar(context, 404, 'P(−β)', reading.probabilityMinus, palette.amber);
    drawLabel(
      context,
      `β = ${Math.round(parameters.basisDegrees)}°`,
      readingLeft,
      473,
      { color: palette.ink, size: 13, weight: 800 },
    );
    drawLabel(context, this.labels.phaseHint, readingLeft, 505, {
      color: palette.muted,
      size: 11,
      weight: 600,
    });
  }

  private drawBar(
    context: CanvasRenderingContext2D,
    y: number,
    label: string,
    probability: number,
    color: string,
  ): void {
    drawLabel(context, label, readingLeft, y - 11, {
      color: palette.ink,
      size: 12,
      weight: 800,
    });
    drawLabel(context, `${(probability * 100).toFixed(1)}%`, readingLeft + barWidth, y - 11, {
      color,
      size: 12,
      weight: 800,
      align: 'right',
    });
    context.fillStyle = palette.grid;
    context.fillRect(readingLeft, y, barWidth, 20);
    context.fillStyle = color;
    context.fillRect(readingLeft, y, barWidth * probability, 20);
  }
}
