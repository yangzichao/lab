import {
  clearStage,
  drawDashedLine,
  drawDotGrid,
  drawLabel,
  palette,
  setupStageCanvas,
} from '../../shared/stage';
import {
  modeFunction,
  type FieldModeParameters,
  type FieldModeReading,
} from './field-modes-physics';

type FieldModeLabels = {
  spatialMode: string;
  uncertainty: string;
  ladder: string;
  vacuum: string;
  quanta: string;
};

const plotLeft = 58;
const plotRight = 602;
const plotWidth = plotRight - plotLeft;
const plotCenterY = 286;
const ladderLeft = 690;
const ladderRight = 846;

export class FieldModesRenderer {
  private readonly context: CanvasRenderingContext2D | null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly labels: FieldModeLabels,
  ) {
    this.context = setupStageCanvas(canvas);
  }

  draw(
    parameters: FieldModeParameters,
    reading: FieldModeReading,
    phase: number,
  ): void {
    if (!this.context) return;
    const context = this.context;
    clearStage(context);
    drawDotGrid(context);
    this.drawModeFunction(context, parameters, reading, phase);
    this.drawEnergyLadder(context, parameters);
  }

  private drawModeFunction(
    context: CanvasRenderingContext2D,
    parameters: FieldModeParameters,
    reading: FieldModeReading,
    phase: number,
  ): void {
    drawLabel(context, this.labels.spatialMode, plotLeft, 48, {
      color: palette.muted,
      size: 12,
      weight: 800,
    });
    drawDashedLine(
      context,
      { x: plotLeft, y: plotCenterY },
      { x: plotRight, y: plotCenterY },
      palette.faint,
    );
    drawLabel(context, 'x = 0', plotLeft, plotCenterY + 25, {
      color: palette.muted,
      size: 10,
      weight: 700,
    });
    drawLabel(context, 'x = L', plotRight, plotCenterY + 25, {
      color: palette.muted,
      size: 10,
      weight: 700,
      align: 'right',
    });

    const baseAmplitude = 112;
    const uncertaintyAmplitude = Math.min(62, 22 + reading.uncertaintyScale * 20);
    context.fillStyle = 'rgba(124, 58, 237, 0.12)';
    context.beginPath();
    for (let sample = 0; sample <= 240; sample += 1) {
      const position = sample / 240;
      const x = plotLeft + position * plotWidth;
      const mode = modeFunction(parameters.modeNumber, position);
      const y = plotCenterY - mode * uncertaintyAmplitude;
      if (sample === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    for (let sample = 240; sample >= 0; sample -= 1) {
      const position = sample / 240;
      const x = plotLeft + position * plotWidth;
      const mode = modeFunction(parameters.modeNumber, position);
      context.lineTo(x, plotCenterY + mode * uncertaintyAmplitude);
    }
    context.closePath();
    context.fill();

    context.strokeStyle = palette.blue;
    context.lineWidth = 3;
    context.beginPath();
    for (let sample = 0; sample <= 240; sample += 1) {
      const position = sample / 240;
      const x = plotLeft + position * plotWidth;
      const value = modeFunction(parameters.modeNumber, position) * Math.cos(phase);
      const y = plotCenterY - value * baseAmplitude;
      if (sample === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    drawLabel(context, `u${Math.round(parameters.modeNumber)}(x)`, plotRight - 8, 115, {
      color: palette.blue,
      size: 15,
      weight: 800,
      align: 'right',
    });
    drawLabel(context, this.labels.uncertainty, plotLeft, 495, {
      color: palette.violet,
      size: 11,
      weight: 700,
    });
  }

  private drawEnergyLadder(
    context: CanvasRenderingContext2D,
    parameters: FieldModeParameters,
  ): void {
    drawLabel(context, this.labels.ladder, ladderLeft, 48, {
      color: palette.muted,
      size: 12,
      weight: 800,
    });
    const occupation = Math.max(0, Math.round(parameters.occupationNumber));
    for (let level = 0; level <= 8; level += 1) {
      const y = 472 - level * 48;
      const active = level === occupation;
      context.strokeStyle = active ? palette.violet : palette.gridStrong;
      context.lineWidth = active ? 4 : 1.5;
      context.beginPath();
      context.moveTo(ladderLeft, y);
      context.lineTo(ladderRight, y);
      context.stroke();
      drawLabel(context, `n=${level}`, ladderRight + 13, y + 4, {
        color: active ? palette.violet : palette.muted,
        size: 11,
        weight: active ? 800 : 600,
      });
      if (active) {
        for (let quantum = 0; quantum < occupation; quantum += 1) {
          context.fillStyle = palette.violet;
          context.beginPath();
          context.arc(ladderLeft + 14 + quantum * 15, y - 10, 4.2, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    drawLabel(context, occupation === 0 ? this.labels.vacuum : `${occupation} ${this.labels.quanta}`, ladderLeft, 522, {
      color: palette.ink,
      size: 12,
      weight: 800,
    });
  }
}
