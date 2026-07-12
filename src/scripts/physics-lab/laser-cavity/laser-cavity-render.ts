import {
  clearStage,
  drawArrow,
  drawDotGrid,
  drawLabel,
  palette,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from '../shared/stage';
import type {
  LaserCavityParameters,
  LaserCavitySnapshot,
  LaserCavityState,
} from './laser-cavity-physics';

const cavity = { left: 115, right: 785, axis: 235 };

function drawMirror(context: CanvasRenderingContext2D, x: number, outputCoupler: boolean): void {
  const gradient = context.createLinearGradient(x - 9, 0, x + 9, 0);
  gradient.addColorStop(0, '#64748b');
  gradient.addColorStop(0.5, '#f8fafc');
  gradient.addColorStop(1, '#475569');
  context.fillStyle = gradient;
  context.fillRect(x - 7, cavity.axis - 112, 14, 224);
  context.strokeStyle = outputCoupler ? palette.amber : palette.ink;
  context.lineWidth = 2;
  context.strokeRect(x - 7, cavity.axis - 112, 14, 224);
  drawLabel(context, outputCoupler ? 'M₂ / output' : 'M₁', x, cavity.axis - 128, { align: 'center', color: palette.muted, size: 11, weight: 700 });
}

function drawGainMedium(context: CanvasRenderingContext2D): void {
  const left = 345;
  const width = 210;
  context.fillStyle = 'rgba(15, 118, 110, 0.11)';
  context.strokeStyle = palette.teal;
  context.lineWidth = 1.5;
  context.fillRect(left, cavity.axis - 62, width, 124);
  context.strokeRect(left, cavity.axis - 62, width, 124);
  drawLabel(context, 'gain medium', left + width / 2, cavity.axis + 88, { color: palette.teal, align: 'center', size: 11, weight: 700 });
  for (let x = left + 20; x < left + width - 10; x += 34) {
    drawArrow(context, { x, y: cavity.axis + 48 }, { x, y: cavity.axis + 18 }, { color: palette.teal, width: 1.6, headSize: 7 });
  }
}

function drawField(
  context: CanvasRenderingContext2D,
  parameters: LaserCavityParameters,
  state: LaserCavityState,
  showTravelingWaves: boolean,
): void {
  const amplitude = 8 + Math.sqrt(Math.max(0, state.intracavityPower)) * 10;
  const samples = 360;
  const waveNumber = Math.PI * Math.round(2 * parameters.cavityLength) / (cavity.right - cavity.left);
  const drawWave = (color: string, alpha: number, evaluator: (x: number) => number, width: number): void => {
    context.save();
    context.strokeStyle = color;
    context.globalAlpha = alpha;
    context.lineWidth = width;
    context.beginPath();
    for (let index = 0; index <= samples; index += 1) {
      const x = cavity.left + (index / samples) * (cavity.right - cavity.left);
      const y = cavity.axis + evaluator(x) * amplitude;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
    context.restore();
  };
  if (showTravelingWaves) {
    drawWave(palette.blue, 0.35, (x) => Math.sin(waveNumber * (x - cavity.left) - state.phase), 1.2);
    drawWave(palette.amber, 0.35, (x) => Math.sin(waveNumber * (x - cavity.left) + state.phase), 1.2);
  }
  drawWave(palette.red, 0.9, (x) => Math.sin(waveNumber * (x - cavity.left)) * Math.cos(state.phase), 2.7);

  const outputLength = 90 + Math.min(85, state.intracavityPower * 3);
  const outputGradient = context.createLinearGradient(cavity.right, 0, cavity.right + outputLength, 0);
  outputGradient.addColorStop(0, 'rgba(220, 38, 38, 0.78)');
  outputGradient.addColorStop(1, 'rgba(220, 38, 38, 0)');
  context.strokeStyle = outputGradient;
  context.lineWidth = 3 + Math.min(8, state.intracavityPower * 0.25);
  context.beginPath();
  context.moveTo(cavity.right + 8, cavity.axis);
  context.lineTo(cavity.right + outputLength, cavity.axis);
  context.stroke();
}

function drawModeSpectrum(
  context: CanvasRenderingContext2D,
  parameters: LaserCavityParameters,
  snapshot: LaserCavitySnapshot,
  english: boolean,
): void {
  const panel = { left: 90, right: 810, top: 390, bottom: 505 };
  context.strokeStyle = palette.gridStrong;
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(panel.left, panel.bottom);
  context.lineTo(panel.right, panel.bottom);
  context.stroke();
  const center = (panel.left + panel.right) / 2;
  const sigma = parameters.gainBandwidth * 42;
  context.strokeStyle = palette.teal;
  context.lineWidth = 2.2;
  context.beginPath();
  for (let x = panel.left; x <= panel.right; x += 4) {
    const gain = Math.exp(-((x - center) ** 2) / (2 * sigma * sigma));
    const y = panel.bottom - gain * 82;
    if (x === panel.left) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();
  const modeSpacing = 58;
  for (let index = -6; index <= 6; index += 1) {
    const x = center + index * modeSpacing;
    const active = index === 0 && snapshot.resonanceFactor > 0.2;
    context.strokeStyle = active ? palette.red : palette.violet;
    context.lineWidth = active ? 3.5 : 1.6;
    context.beginPath();
    context.moveTo(x, panel.bottom);
    context.lineTo(x, panel.bottom - (active ? 78 : 48));
    context.stroke();
  }
  drawLabel(context, english ? 'gain bandwidth and allowed longitudinal modes' : '增益带宽与允许纵模', panel.left, panel.top - 10, { color: palette.muted, size: 11, weight: 700 });
}

export function drawLaserCavityScene(
  context: CanvasRenderingContext2D,
  parameters: LaserCavityParameters,
  state: LaserCavityState,
  snapshot: LaserCavitySnapshot,
  options: { showTravelingWaves: boolean; showModeSpectrum: boolean; english: boolean },
): void {
  clearStage(context);
  drawDotGrid(context);
  drawMirror(context, cavity.left, false);
  drawMirror(context, cavity.right, true);
  drawGainMedium(context);
  drawField(context, parameters, state, options.showTravelingWaves);
  drawLabel(context, `2L = ${snapshot.longitudinalModeOrder}λ`, STAGE_WIDTH / 2, 60, { align: 'center', color: palette.ink, size: 18, weight: 800, background: true });
  drawLabel(context, options.english ? 'phase condition' : '相位条件', 28, 30, { color: palette.muted, size: 11 });
  drawLabel(context, options.english ? 'gain > round-trip loss' : '增益 > 往返损耗', STAGE_WIDTH - 28, 30, { color: snapshot.state === 'lasing' ? palette.green : palette.red, size: 12, weight: 800, align: 'right' });
  if (options.showModeSpectrum) drawModeSpectrum(context, parameters, snapshot, options.english);
  else drawLabel(context, options.english ? 'Red: standing wave · blue/amber: traveling components' : '红色：驻波 · 蓝/琥珀：左右行波', 28, STAGE_HEIGHT - 22, { color: palette.muted, size: 12 });
}
