import {
  clearStage,
  drawArrow,
  drawDotGrid,
  drawLabel,
  palette,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from '../shared/stage';
import {
  bindingEnergyPoints,
  fusionStages,
  type FusionParameters,
  type FusionState,
} from './fusion-chain-physics';

const stageColors = ['#dc2626', '#d97706', '#ca8a04', '#65a30d', '#0f766e', '#2563eb', '#475569'];

function drawReaction(context: CanvasRenderingContext2D, state: FusionState, english: boolean): void {
  const stage = fusionStages[state.stageIndex];
  const centerY = 185;
  const progress = Math.min(1, state.reactionProgress);
  const reactantCount = stage.id === 'hydrogen' ? 4 : stage.id === 'helium' ? 3 : 2;
  const spread = (1 - progress) * 90 + 18;
  for (let index = 0; index < reactantCount; index += 1) {
    const angle = (index / reactantCount) * Math.PI * 2 + progress * 1.8;
    const x = 300 + Math.cos(angle) * spread;
    const y = centerY + Math.sin(angle) * spread * 0.55;
    context.fillStyle = index % 2 === 0 ? palette.red : palette.blue;
    context.beginPath();
    context.arc(x, y, 10, 0, Math.PI * 2);
    context.fill();
  }
  drawArrow(context, { x: 420, y: centerY }, { x: 520, y: centerY }, { color: palette.muted, width: 2.4, headSize: 10 });
  const productRadius = 24 + state.stageIndex * 3;
  context.fillStyle = stageColors[state.stageIndex];
  context.beginPath();
  context.arc(610, centerY, productRadius, 0, Math.PI * 2);
  context.fill();
  drawLabel(context, stage.reactants, 300, 292, { align: 'center', color: palette.ink, size: 15, weight: 800 });
  drawLabel(context, stage.product, 610, 292, { align: 'center', color: stageColors[state.stageIndex], size: 17, weight: 800 });
  drawLabel(context, stage.reaction, STAGE_WIDTH / 2, 70, { align: 'center', color: palette.ink, size: 18, weight: 800, background: true });
  drawLabel(context, stage.energy === 'released' ? (english ? 'higher binding energy → energy released' : '单位核子结合能上升 → 释放能量') : (english ? 'radioactive decay, not another fusion step' : '放射性衰变，不是下一次聚变'), STAGE_WIDTH / 2, 330, { align: 'center', color: stage.energy === 'released' ? palette.green : palette.violet, size: 12, weight: 700 });
}

function drawBindingEnergyCurve(context: CanvasRenderingContext2D, state: FusionState, english: boolean): void {
  const panel = { left: 80, right: 820, top: 390, bottom: 510 };
  const minEnergy = 6.8;
  const pointPosition = (mass: number, energy: number) => ({
    x: panel.left + (Math.log(mass) / Math.log(56)) * (panel.right - panel.left),
    y: panel.bottom - ((Math.max(minEnergy, energy) - minEnergy) / (8.85 - minEnergy)) * (panel.bottom - panel.top),
  });
  context.strokeStyle = palette.gridStrong;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(panel.left, panel.top);
  context.lineTo(panel.left, panel.bottom);
  context.lineTo(panel.right, panel.bottom);
  context.stroke();
  context.strokeStyle = palette.teal;
  context.lineWidth = 2.5;
  context.beginPath();
  bindingEnergyPoints.forEach((point, index) => {
    const projected = pointPosition(point.mass, point.energy);
    if (index === 0) context.moveTo(projected.x, panel.bottom); else context.lineTo(projected.x, projected.y);
  });
  context.stroke();
  bindingEnergyPoints.forEach((point, index) => {
    const projected = pointPosition(point.mass, point.energy);
    context.fillStyle = index === Math.min(state.stageIndex + 1, bindingEnergyPoints.length - 1) ? palette.red : palette.teal;
    context.beginPath();
    context.arc(projected.x, projected.y, index === Math.min(state.stageIndex + 1, bindingEnergyPoints.length - 1) ? 5 : 3, 0, Math.PI * 2);
    context.fill();
    drawLabel(context, point.symbol, projected.x, projected.y - 9, { align: 'center', color: palette.muted, size: 10, weight: 700 });
  });
  drawLabel(context, english ? 'binding energy per nucleon' : '单位核子结合能', panel.left, panel.top - 10, { color: palette.muted, size: 11, weight: 700 });
  drawLabel(context, english ? 'fusion releases energy → iron peak' : '聚变放能方向 → 铁峰', panel.right, panel.top - 10, { color: palette.green, size: 11, weight: 700, align: 'right' });
}

function drawOnionShell(context: CanvasRenderingContext2D, state: FusionState): void {
  const center = { x: 785, y: 190 };
  for (let index = 6; index >= 0; index -= 1) {
    const radius = 18 + index * 10;
    context.fillStyle = stageColors[index];
    context.globalAlpha = index === fusionStages[state.stageIndex].shellIndex ? 0.9 : 0.16;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  drawLabel(context, 'stellar shells', center.x, center.y + 98, { align: 'center', color: palette.muted, size: 10, weight: 700 });
}

export function drawFusionChainScene(
  context: CanvasRenderingContext2D,
  state: FusionState,
  _parameters: FusionParameters,
  options: { showEnergyCurve: boolean; showShells: boolean; english: boolean },
): void {
  clearStage(context);
  drawDotGrid(context);
  drawReaction(context, state, options.english);
  if (options.showShells) drawOnionShell(context, state);
  if (options.showEnergyCurve) drawBindingEnergyCurve(context, state, options.english);
  else drawLabel(context, options.english ? 'Iron is the endpoint of exothermic stellar fusion.' : '铁峰是恒星放能聚变的终点。', 28, STAGE_HEIGHT - 22, { color: palette.red, size: 13, weight: 800 });
}
