import {
  clearStage,
  drawDashedLine,
  drawDotGrid,
  drawLabel,
  palette,
  setupStageCanvas,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from '../../shared/stage';
import {
  interferenceIntensity,
  type DetectionHit,
  type InterferenceParameters,
} from './single-particle-interference-physics';

type InterferenceLabels = {
  source: string;
  alternatives: string;
  detector: string;
  probability: string;
};

const sourceX = 90;
const slitX = 335;
const detectorX = 690;
const centerY = STAGE_HEIGHT / 2;
const detectorTop = 62;
const detectorBottom = STAGE_HEIGHT - 62;
const detectorHeight = detectorBottom - detectorTop;

export class SingleParticleInterferenceRenderer {
  private readonly context: CanvasRenderingContext2D | null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly labels: InterferenceLabels,
  ) {
    this.context = setupStageCanvas(canvas);
  }

  draw(parameters: InterferenceParameters, hits: DetectionHit[]): void {
    if (!this.context) return;
    const context = this.context;
    clearStage(context);
    drawDotGrid(context);
    this.drawApparatus(context, parameters);
    this.drawProbability(context, parameters);
    this.drawHits(context, hits);
  }

  private drawApparatus(
    context: CanvasRenderingContext2D,
    parameters: InterferenceParameters,
  ): void {
    drawLabel(context, this.labels.source, sourceX, 42, {
      color: palette.muted,
      size: 11,
      weight: 800,
      align: 'center',
    });
    context.fillStyle = palette.violet;
    context.beginPath();
    context.arc(sourceX, centerY, 12, 0, Math.PI * 2);
    context.fill();

    const slitOffset = 26 + parameters.slitSeparation * 4.2;
    const upperSlitY = centerY - slitOffset;
    const lowerSlitY = centerY + slitOffset;
    context.strokeStyle = palette.ink;
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(slitX, detectorTop);
    context.lineTo(slitX, upperSlitY - 13);
    context.moveTo(slitX, upperSlitY + 13);
    context.lineTo(slitX, lowerSlitY - 13);
    context.moveTo(slitX, lowerSlitY + 13);
    context.lineTo(slitX, detectorBottom);
    context.stroke();

    drawDashedLine(context, { x: sourceX + 14, y: centerY }, { x: slitX, y: upperSlitY }, palette.violet);
    drawDashedLine(context, { x: sourceX + 14, y: centerY }, { x: slitX, y: lowerSlitY }, palette.violet);
    drawDashedLine(context, { x: slitX, y: upperSlitY }, { x: detectorX, y: centerY }, palette.blue);
    drawDashedLine(context, { x: slitX, y: lowerSlitY }, { x: detectorX, y: centerY }, palette.red);
    drawLabel(context, this.labels.alternatives, slitX, 42, {
      color: palette.muted,
      size: 11,
      weight: 800,
      align: 'center',
    });

    context.strokeStyle = palette.ink;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(detectorX, detectorTop);
    context.lineTo(detectorX, detectorBottom);
    context.stroke();
    drawLabel(context, this.labels.detector, detectorX, 42, {
      color: palette.muted,
      size: 11,
      weight: 800,
      align: 'center',
    });
  }

  private drawProbability(
    context: CanvasRenderingContext2D,
    parameters: InterferenceParameters,
  ): void {
    const graphLeft = 730;
    const maximumWidth = STAGE_WIDTH - graphLeft - 28;
    context.fillStyle = 'rgba(37, 99, 235, 0.12)';
    context.beginPath();
    context.moveTo(graphLeft, detectorTop);
    for (let sample = 0; sample <= 180; sample += 1) {
      const normalized = -1 + (2 * sample) / 180;
      const y = detectorTop + ((normalized + 1) / 2) * detectorHeight;
      const x = graphLeft + interferenceIntensity(normalized, parameters) * maximumWidth;
      context.lineTo(x, y);
    }
    context.lineTo(graphLeft, detectorBottom);
    context.closePath();
    context.fill();

    context.strokeStyle = palette.blue;
    context.lineWidth = 2;
    context.beginPath();
    for (let sample = 0; sample <= 180; sample += 1) {
      const normalized = -1 + (2 * sample) / 180;
      const y = detectorTop + ((normalized + 1) / 2) * detectorHeight;
      const x = graphLeft + interferenceIntensity(normalized, parameters) * maximumWidth;
      if (sample === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    drawLabel(context, this.labels.probability, graphLeft, STAGE_HEIGHT - 32, {
      color: palette.muted,
      size: 10,
      weight: 700,
    });
  }

  private drawHits(context: CanvasRenderingContext2D, hits: DetectionHit[]): void {
    hits.forEach((hit, index) => {
      const y = detectorTop + ((hit.normalizedPosition + 1) / 2) * detectorHeight;
      const jitter = ((index * 47) % 23) - 11;
      const alpha = Math.min(0.9, 0.25 + hit.age * 0.75);
      context.fillStyle = `rgba(124, 58, 237, ${alpha})`;
      context.beginPath();
      context.arc(detectorX + jitter, y, 2.2, 0, Math.PI * 2);
      context.fill();
    });
  }
}
