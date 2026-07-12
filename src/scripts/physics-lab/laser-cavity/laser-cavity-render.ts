import {
  cinematicPalette,
  drawCinematicBackdrop,
  drawGlowDisc,
  drawGlowLine,
  drawHudPanel,
} from '../shared/cinematic-stage';
import { drawArrow, drawLabel, STAGE_HEIGHT, STAGE_WIDTH } from '../shared/stage';
import type { LaserCavityParameters, LaserCavitySnapshot, LaserCavityState } from './laser-cavity-physics';

const cavity = { left: 112, right: 788, axis: 226 };

function drawMirror(
  context: CanvasRenderingContext2D,
  x: number,
  outputCoupler: boolean,
  power: number,
): void {
  const mirrorGradient = context.createLinearGradient(x - 11, 0, x + 11, 0);
  mirrorGradient.addColorStop(0, '#18324c');
  mirrorGradient.addColorStop(0.35, '#d8f4ff');
  mirrorGradient.addColorStop(0.52, '#ffffff');
  mirrorGradient.addColorStop(0.72, '#7aa3c0');
  mirrorGradient.addColorStop(1, '#14243a');
  context.save();
  context.shadowColor = outputCoupler ? cinematicPalette.amber : cinematicPalette.cyan;
  context.shadowBlur = 12 + Math.min(18, power);
  context.fillStyle = mirrorGradient;
  context.beginPath();
  context.roundRect(x - 7, cavity.axis - 118, 14, 236, 7);
  context.fill();
  context.strokeStyle = outputCoupler ? cinematicPalette.amber : cinematicPalette.cyan;
  context.globalAlpha = 0.8;
  context.lineWidth = 1.5;
  context.stroke();
  context.restore();
  drawLabel(context, outputCoupler ? 'M₂ · OUTPUT' : 'M₁ · HR', x, cavity.axis - 134, {
    align: 'center',
    color: cinematicPalette.muted,
    size: 9,
    weight: 800,
  });
}

function drawGainMedium(
  context: CanvasRenderingContext2D,
  parameters: LaserCavityParameters,
  state: LaserCavityState,
): void {
  const left = 338;
  const width = 224;
  const height = 126;
  const glowStrength = Math.min(0.52, 0.12 + parameters.pumpRatio * 0.12);
  const fill = context.createLinearGradient(left, cavity.axis - height / 2, left + width, cavity.axis + height / 2);
  fill.addColorStop(0, `rgba(91, 140, 255, ${glowStrength})`);
  fill.addColorStop(0.5, `rgba(184, 140, 255, ${glowStrength + 0.08})`);
  fill.addColorStop(1, `rgba(255, 79, 104, ${glowStrength})`);
  context.save();
  context.fillStyle = fill;
  context.strokeStyle = 'rgba(185, 220, 255, 0.58)';
  context.shadowColor = cinematicPalette.violet;
  context.shadowBlur = 22;
  context.beginPath();
  context.roundRect(left, cavity.axis - height / 2, width, height, 13);
  context.fill();
  context.stroke();
  context.restore();

  for (let index = 0; index < 22; index += 1) {
    const x = left + 14 + ((index * 47) % (width - 28));
    const y = cavity.axis - height / 2 + 15 + ((index * 31) % (height - 30));
    const excited = (index + Math.floor(state.phase * 2)) % 3 !== 0;
    const atomColor = excited ? cinematicPalette.violet : cinematicPalette.blue;
    context.save();
    context.globalAlpha = excited ? 0.82 : 0.34;
    drawGlowDisc(context, { x, y }, excited ? 2.2 : 1.6, atomColor);
    if (excited) {
      drawArrow(context, { x: x - 4, y: y + 7 }, { x: x - 4, y: y - 7 }, { color: cinematicPalette.green, width: 1, headSize: 4 });
    }
    context.restore();
  }
  drawLabel(context, 'GAIN MEDIUM', left + width / 2, cavity.axis + 88, { color: cinematicPalette.violet, align: 'center', size: 9, weight: 800 });
}

function drawWave(
  context: CanvasRenderingContext2D,
  color: string,
  alpha: number,
  amplitude: number,
  evaluator: (x: number) => number,
  width: number,
): void {
  context.save();
  context.strokeStyle = color;
  context.globalAlpha = alpha;
  context.lineWidth = width;
  context.shadowColor = color;
  context.shadowBlur = width > 2 ? 18 : 8;
  context.beginPath();
  for (let index = 0; index <= 420; index += 1) {
    const x = cavity.left + (index / 420) * (cavity.right - cavity.left);
    const y = cavity.axis + evaluator(x) * amplitude;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();
  context.restore();
}

function drawOpticalField(
  context: CanvasRenderingContext2D,
  state: LaserCavityState,
  snapshot: LaserCavitySnapshot,
  showTravelingWaves: boolean,
): void {
  const powerEnvelope = Math.min(1, Math.sqrt(Math.max(0, state.intracavityPower)) / 4.5);
  const amplitude = 10 + powerEnvelope * 56;
  const modeOrder = Math.max(1, snapshot.longitudinalModeOrder);
  const spatialPhase = Math.PI * modeOrder / (cavity.right - cavity.left);

  if (showTravelingWaves) {
    drawWave(context, cinematicPalette.blue, 0.34, amplitude * 0.68, (x) => Math.sin(spatialPhase * (x - cavity.left) - state.phase), 1.3);
    drawWave(context, cinematicPalette.amber, 0.34, amplitude * 0.68, (x) => Math.sin(spatialPhase * (x - cavity.left) + state.phase + snapshot.roundTripDetuning), 1.3);
  }
  drawWave(
    context,
    snapshot.state === 'lasing' ? cinematicPalette.red : cinematicPalette.violet,
    snapshot.state === 'lasing' ? 0.96 : 0.52,
    amplitude,
    (x) => Math.sin(spatialPhase * (x - cavity.left)) * Math.cos(state.phase),
    snapshot.state === 'lasing' ? 3 : 2,
  );

  const photonCount = 4 + Math.round(powerEnvelope * 10);
  for (let index = 0; index < photonCount; index += 1) {
    const direction = index % 2 === 0 ? 1 : -1;
    const progress = (state.phase / (Math.PI * 2) + index / photonCount) % 1;
    const x = direction > 0
      ? cavity.left + progress * (cavity.right - cavity.left)
      : cavity.right - progress * (cavity.right - cavity.left);
    const y = cavity.axis + Math.sin(spatialPhase * (x - cavity.left)) * amplitude * 0.38;
    drawGlowDisc(context, { x, y }, 1.8 + powerEnvelope * 1.8, direction > 0 ? cinematicPalette.red : cinematicPalette.amber);
  }

  const outputPower = powerEnvelope * snapshot.resonanceFactor;
  const beamLength = 90 + outputPower * 86;
  if (outputPower > 0.01) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    drawGlowLine(context, { x: cavity.right + 7, y: cavity.axis }, { x: cavity.right + beamLength, y: cavity.axis }, cinematicPalette.red, 10 + outputPower * 12, 34);
    drawGlowLine(context, { x: cavity.right + 7, y: cavity.axis }, { x: cavity.right + beamLength, y: cavity.axis }, '#fff8f3', 1.8, 8);
    context.restore();
  }
}

function drawModeSpectrum(
  context: CanvasRenderingContext2D,
  parameters: LaserCavityParameters,
  snapshot: LaserCavitySnapshot,
  english: boolean,
): void {
  const panel = { left: 78, right: 822, top: 388, bottom: 510 };
  drawHudPanel(context, panel.left - 15, panel.top - 22, panel.right - panel.left + 30, panel.bottom - panel.top + 37);
  const center = (panel.left + panel.right) / 2;
  const sigma = parameters.gainBandwidth * 42;
  const gainFill = context.createLinearGradient(0, panel.top, 0, panel.bottom);
  gainFill.addColorStop(0, 'rgba(184, 140, 255, 0.3)');
  gainFill.addColorStop(1, 'rgba(184, 140, 255, 0)');
  context.beginPath();
  context.moveTo(panel.left, panel.bottom);
  for (let x = panel.left; x <= panel.right; x += 3) {
    const gain = Math.exp(-((x - center) ** 2) / (2 * sigma * sigma));
    context.lineTo(x, panel.bottom - gain * 82);
  }
  context.lineTo(panel.right, panel.bottom);
  context.closePath();
  context.fillStyle = gainFill;
  context.fill();
  context.strokeStyle = cinematicPalette.violet;
  context.lineWidth = 2;
  context.stroke();

  const modeSpacing = 58;
  for (let index = -6; index <= 6; index += 1) {
    const x = center + index * modeSpacing;
    const active = index === 0 && snapshot.resonanceFactor > 0.2 && parameters.pumpRatio > 1;
    drawGlowLine(
      context,
      { x, y: panel.bottom },
      { x, y: panel.bottom - (active ? 78 : 44) },
      active ? cinematicPalette.red : cinematicPalette.blue,
      active ? 3.4 : 1.4,
      active ? 16 : 5,
    );
  }
  drawLabel(context, english ? 'GAIN ENVELOPE + LONGITUDINAL MODES' : '增益包络 + 纵模', panel.left, panel.top - 3, { color: cinematicPalette.muted, size: 9, weight: 800 });
  drawLabel(context, english ? 'selected mode' : '选中模式', center + 8, panel.top + 18, { color: cinematicPalette.red, size: 10, weight: 800 });
}

export function drawLaserCavityScene(
  context: CanvasRenderingContext2D,
  parameters: LaserCavityParameters,
  state: LaserCavityState,
  snapshot: LaserCavitySnapshot,
  options: { showTravelingWaves: boolean; showModeSpectrum: boolean; english: boolean },
): void {
  drawCinematicBackdrop(context, 'laser', state.phase);
  drawGlowLine(context, { x: cavity.left, y: cavity.axis }, { x: cavity.right, y: cavity.axis }, 'rgba(184, 140, 255, 0.3)', 1, 6);
  drawGainMedium(context, parameters, state);
  drawOpticalField(context, state, snapshot, options.showTravelingWaves);
  drawMirror(context, cavity.left, false, state.intracavityPower);
  drawMirror(context, cavity.right, true, state.intracavityPower);

  drawHudPanel(context, 26, 20, 300, 58);
  drawLabel(context, options.english ? 'CAVITY LOCK' : '谐振腔锁定状态', 42, 42, { color: cinematicPalette.muted, size: 9, weight: 800 });
  drawLabel(context, `2L = ${snapshot.longitudinalModeOrder}λ`, 42, 66, { color: cinematicPalette.text, size: 17, weight: 800 });
  drawLabel(
    context,
    options.english
      ? (snapshot.state === 'lasing' ? 'PHASE LOCKED · GAIN ABOVE LOSS' : snapshot.state === 'detuned' ? 'PHASES CANCEL · DETUNED' : 'NO BUILD-UP · BELOW THRESHOLD')
      : (snapshot.state === 'lasing' ? '相位锁定 · 增益超过损耗' : snapshot.state === 'detuned' ? '相位相消 · 腔长失谐' : '无法建立 · 低于阈值'),
    STAGE_WIDTH - 28,
    42,
    {
      color: snapshot.state === 'lasing' ? cinematicPalette.green : cinematicPalette.red,
      size: 10,
      weight: 800,
      align: 'right',
    },
  );
  if (options.showModeSpectrum) drawModeSpectrum(context, parameters, snapshot, options.english);
  else drawLabel(context, options.english ? 'blue / amber: traveling waves · red: standing wave' : '蓝 / 琥珀：行波 · 红：驻波', 28, STAGE_HEIGHT - 22, { color: cinematicPalette.muted, size: 11 });
}
