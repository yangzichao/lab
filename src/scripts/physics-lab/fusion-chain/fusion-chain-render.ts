import {
  cinematicPalette,
  drawCinematicBackdrop,
  drawGlowDisc,
  drawGlowLine,
  drawHudPanel,
} from '../shared/cinematic-stage';
import { drawArrow, drawLabel, STAGE_HEIGHT, STAGE_WIDTH, type Point } from '../shared/stage';
import { bindingEnergyPoints, fusionStages, type FusionParameters, type FusionState } from './fusion-chain-physics';

const stageColors = ['#ff4f68', '#ff8b45', '#ffbd4a', '#d8e85c', '#36f1cd', '#5b8cff', '#b8c6d5'];

function drawStageTimeline(context: CanvasRenderingContext2D, state: FusionState): void {
  const left = 72;
  const right = 828;
  const y = 54;
  drawGlowLine(context, { x: left, y }, { x: right, y }, 'rgba(155, 177, 197, 0.25)', 1, 4);
  fusionStages.forEach((stage, index) => {
    const x = left + index / (fusionStages.length - 1) * (right - left);
    const complete = index < state.stageIndex;
    const active = index === state.stageIndex;
    const color = active ? stageColors[index] : complete ? cinematicPalette.green : '#516274';
    drawGlowDisc(context, { x, y }, active ? 6 : 3.5, color, active ? '#ffffff' : color);
    drawLabel(context, stage.product.replace(/\s\+.*/, ''), x, y + 22, { color: active ? cinematicPalette.text : cinematicPalette.muted, align: 'center', size: 9, weight: 800 });
  });
}

function nucleusParticlePosition(index: number, count: number, center: Point, radius: number): Point {
  if (count === 1) return center;
  const ring = Math.floor(Math.sqrt(index));
  const angle = index * 2.399963 + ring * 0.38;
  const distance = radius * Math.sqrt((index + 0.5) / count);
  return { x: center.x + Math.cos(angle) * distance, y: center.y + Math.sin(angle) * distance };
}

function drawNucleus(
  context: CanvasRenderingContext2D,
  center: Point,
  nucleonCount: number,
  radius: number,
  alpha = 1,
): void {
  const visibleCount = Math.min(34, Math.max(2, nucleonCount));
  context.save();
  context.globalAlpha = alpha;
  for (let index = 0; index < visibleCount; index += 1) {
    const point = nucleusParticlePosition(index, visibleCount, center, radius * 0.72);
    const proton = index % 2 === 0;
    drawGlowDisc(
      context,
      point,
      Math.max(2.7, radius / Math.sqrt(visibleCount) * 0.9),
      proton ? cinematicPalette.red : cinematicPalette.blue,
      proton ? '#ff9ca9' : '#a6c3ff',
    );
  }
  context.restore();
}

function stageNucleonCounts(stageIndex: number): { reactants: number[]; product: number } {
  return [
    { reactants: [1, 1, 1, 1], product: 4 },
    { reactants: [4, 4, 4], product: 12 },
    { reactants: [12, 12], product: 24 },
    { reactants: [20, 4], product: 24 },
    { reactants: [16, 16], product: 32 },
    { reactants: [28, 28], product: 56 },
    { reactants: [56], product: 56 },
  ][stageIndex];
}

function drawReactionChamber(
  context: CanvasRenderingContext2D,
  state: FusionState,
  parameters: FusionParameters,
  english: boolean,
): void {
  const stage = fusionStages[state.stageIndex];
  const counts = stageNucleonCounts(state.stageIndex);
  const progress = Math.min(1, state.reactionProgress);
  const collisionProgress = Math.min(1, progress / 0.62);
  const reactionCenter = { x: 405, y: 225 };
  const startRadius = 112;

  const plasma = context.createRadialGradient(reactionCenter.x, reactionCenter.y, 0, reactionCenter.x, reactionCenter.y, 150);
  plasma.addColorStop(0, `rgba(255, 189, 74, ${0.13 + parameters.logTemperature * 0.012})`);
  plasma.addColorStop(0.45, 'rgba(255, 79, 104, 0.08)');
  plasma.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = plasma;
  context.beginPath();
  context.arc(reactionCenter.x, reactionCenter.y, 150, 0, Math.PI * 2);
  context.fill();

  for (let index = 0; index < 26; index += 1) {
    const angle = index * 2.14 + progress * (1.6 + index % 3);
    const orbit = 50 + (index * 17) % 100;
    const point = {
      x: reactionCenter.x + Math.cos(angle) * orbit,
      y: reactionCenter.y + Math.sin(angle) * orbit * 0.52,
    };
    context.fillStyle = index % 3 === 0 ? 'rgba(255, 189, 74, 0.55)' : 'rgba(255, 79, 104, 0.28)';
    context.beginPath();
    context.arc(point.x, point.y, index % 4 === 0 ? 1.8 : 1, 0, Math.PI * 2);
    context.fill();
  }

  counts.reactants.forEach((nucleons, index) => {
    const angle = index / counts.reactants.length * Math.PI * 2 + progress * 1.2;
    const approach = startRadius * (1 - collisionProgress) + 15 * collisionProgress;
    const center = {
      x: reactionCenter.x + Math.cos(angle) * approach,
      y: reactionCenter.y + Math.sin(angle) * approach * 0.62,
    };
    drawNucleus(context, center, nucleons, 9 + Math.sqrt(nucleons) * 2.2, 1 - Math.max(0, (progress - 0.57) / 0.14));
  });

  const productAlpha = Math.max(0, Math.min(1, (progress - 0.58) / 0.15));
  if (productAlpha > 0) {
    const productPulse = 1 + Math.sin(progress * 28) * 0.06;
    drawNucleus(context, reactionCenter, counts.product, (23 + state.stageIndex * 2.3) * productPulse, productAlpha);
    const flashRadius = 18 + productAlpha * 76;
    const flash = context.createRadialGradient(reactionCenter.x, reactionCenter.y, 0, reactionCenter.x, reactionCenter.y, flashRadius);
    flash.addColorStop(0, `rgba(255, 255, 255, ${0.58 * (1 - productAlpha * 0.7)})`);
    flash.addColorStop(0.18, `rgba(255, 189, 74, ${0.42 * (1 - productAlpha * 0.5)})`);
    flash.addColorStop(1, 'rgba(255, 79, 104, 0)');
    context.fillStyle = flash;
    context.beginPath();
    context.arc(reactionCenter.x, reactionCenter.y, flashRadius, 0, Math.PI * 2);
    context.fill();

    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2 + 0.2;
      const distance = 34 + productAlpha * 84;
      drawGlowLine(
        context,
        { x: reactionCenter.x + Math.cos(angle) * 25, y: reactionCenter.y + Math.sin(angle) * 25 },
        { x: reactionCenter.x + Math.cos(angle) * distance, y: reactionCenter.y + Math.sin(angle) * distance },
        index % 2 === 0 ? cinematicPalette.amber : cinematicPalette.violet,
        1.4,
        9,
      );
    }
  }

  drawHudPanel(context, 182, 88, 446, 56);
  drawLabel(context, stage.reaction, 405, 115, { align: 'center', color: cinematicPalette.text, size: 16, weight: 800 });
  drawLabel(context, stage.name[english ? 'en' : 'zh'], 405, 135, { align: 'center', color: stageColors[state.stageIndex], size: 10, weight: 800 });
  drawLabel(context, stage.reactants, 218, 345, { align: 'center', color: cinematicPalette.muted, size: 12, weight: 800 });
  drawArrow(context, { x: 322, y: 340 }, { x: 482, y: 340 }, { color: cinematicPalette.amber, width: 1.8, headSize: 8 });
  drawLabel(context, stage.product, 575, 346, { align: 'center', color: stageColors[state.stageIndex], size: 16, weight: 800 });
}

function drawBindingEnergyCurve(context: CanvasRenderingContext2D, state: FusionState, english: boolean): void {
  const panel = { left: 78, right: 652, top: 410, bottom: 522 };
  drawHudPanel(context, panel.left - 14, panel.top - 20, panel.right - panel.left + 28, panel.bottom - panel.top + 30);
  const minimumEnergy = 6.8;
  const pointPosition = (mass: number, energy: number) => ({
    x: panel.left + Math.log(mass) / Math.log(56) * (panel.right - panel.left),
    y: panel.bottom - (Math.max(minimumEnergy, energy) - minimumEnergy) / (8.85 - minimumEnergy) * (panel.bottom - panel.top),
  });
  const gradient = context.createLinearGradient(panel.left, 0, panel.right, 0);
  gradient.addColorStop(0, cinematicPalette.red);
  gradient.addColorStop(0.55, cinematicPalette.amber);
  gradient.addColorStop(1, cinematicPalette.green);
  context.strokeStyle = gradient;
  context.lineWidth = 2.6;
  context.shadowColor = cinematicPalette.amber;
  context.shadowBlur = 8;
  context.beginPath();
  bindingEnergyPoints.forEach((point, index) => {
    const projected = pointPosition(point.mass, point.energy);
    if (index === 0) context.moveTo(projected.x, panel.bottom); else context.lineTo(projected.x, projected.y);
  });
  context.stroke();
  context.shadowBlur = 0;
  bindingEnergyPoints.forEach((point, index) => {
    const projected = pointPosition(point.mass, point.energy);
    const active = index === Math.min(state.stageIndex + 1, bindingEnergyPoints.length - 1);
    drawGlowDisc(context, projected, active ? 4.3 : 2.2, active ? cinematicPalette.red : cinematicPalette.teal);
    drawLabel(context, point.symbol, projected.x, projected.y - 9, { align: 'center', color: active ? cinematicPalette.text : cinematicPalette.muted, size: 9, weight: 800 });
  });
  drawLabel(context, english ? 'BINDING ENERGY / NUCLEON' : '单位核子结合能', panel.left, panel.top - 3, { color: cinematicPalette.muted, size: 9, weight: 800 });
  drawLabel(context, english ? 'energy downhill → iron peak' : '能量下坡 → 铁峰', panel.right, panel.top - 3, { color: cinematicPalette.green, size: 9, weight: 800, align: 'right' });
}

function drawOnionShell(context: CanvasRenderingContext2D, state: FusionState, progress: number): void {
  const center = { x: 774, y: 458 };
  const pulse = 1 + Math.sin(progress * Math.PI * 2) * 0.025;
  for (let index = 6; index >= 0; index -= 1) {
    const radius = (13 + index * 9) * pulse;
    const active = index === fusionStages[state.stageIndex].shellIndex;
    context.save();
    context.globalAlpha = active ? 0.88 : 0.19;
    context.fillStyle = stageColors[index];
    context.shadowColor = stageColors[index];
    context.shadowBlur = active ? 18 : 0;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  drawLabel(context, 'ONION SHELLS', center.x, 542, { align: 'center', color: cinematicPalette.muted, size: 9, weight: 800 });
}

export function drawFusionChainScene(
  context: CanvasRenderingContext2D,
  state: FusionState,
  parameters: FusionParameters,
  options: { showEnergyCurve: boolean; showShells: boolean; english: boolean },
): void {
  drawCinematicBackdrop(context, 'fusion', state.reactionProgress * 4 + state.stageIndex);
  drawStageTimeline(context, state);
  drawReactionChamber(context, state, parameters, options.english);
  if (options.showEnergyCurve) drawBindingEnergyCurve(context, state, options.english);
  if (options.showShells) drawOnionShell(context, state, state.reactionProgress);
  if (!options.showEnergyCurve) {
    drawLabel(context, options.english ? 'Exothermic fusion climbs toward the iron peak.' : '放能聚变沿结合能曲线走向铁峰。', 28, STAGE_HEIGHT - 20, { color: cinematicPalette.amber, size: 12, weight: 800 });
  }
  drawLabel(context, `10^${parameters.logTemperature.toFixed(2)} K`, STAGE_WIDTH - 28, 24, { color: cinematicPalette.amber, size: 11, weight: 800, align: 'right' });
}
