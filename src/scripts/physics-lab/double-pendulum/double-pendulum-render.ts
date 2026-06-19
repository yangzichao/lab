import {
  drawAngleArc,
  drawArrow,
  drawDashedLine,
  drawDisc,
  drawDotGrid,
  drawFadingTrail,
  drawLabel,
  palette,
  rgb,
  clearStage,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Point,
} from '../shared/stage';
import { LENGTH_1, LENGTH_2, type PendulumState } from './double-pendulum-physics';

const ORIGIN: Point = { x: STAGE_WIDTH / 2, y: 168 };
const SCALE = 150;
const velocityLookaheadSeconds = 0.16;

function project(physicsX: number, physicsY: number): Point {
  return { x: ORIGIN.x + SCALE * physicsX, y: ORIGIN.y + SCALE * physicsY };
}

export function jointPosition(state: PendulumState): Point {
  return project(LENGTH_1 * Math.sin(state.theta1), LENGTH_1 * Math.cos(state.theta1));
}

export function bobScreenPosition(state: PendulumState): Point {
  const jointX = LENGTH_1 * Math.sin(state.theta1);
  const jointY = LENGTH_1 * Math.cos(state.theta1);
  return project(jointX + LENGTH_2 * Math.sin(state.theta2), jointY + LENGTH_2 * Math.cos(state.theta2));
}

export function bobVelocity(state: PendulumState): Point {
  // Velocity of the lower bob in metres/second (y positive downward).
  const vx =
    LENGTH_1 * state.omega1 * Math.cos(state.theta1) +
    LENGTH_2 * state.omega2 * Math.cos(state.theta2);
  const vy =
    -LENGTH_1 * state.omega1 * Math.sin(state.theta1) -
    LENGTH_2 * state.omega2 * Math.sin(state.theta2);
  return { x: vx, y: vy };
}

export type PendulumSceneOptions = {
  state: PendulumState;
  twin: PendulumState | null;
  trail: Point[];
  showTrail: boolean;
};

export function drawDoublePendulum(
  context: CanvasRenderingContext2D,
  options: PendulumSceneOptions,
): void {
  const { state, twin, trail, showTrail } = options;
  clearStage(context);
  drawDotGrid(context);

  if (showTrail) {
    drawFadingTrail(context, trail, rgb.teal, { width: 2.6, maxAlpha: 0.6 });
  }

  if (twin) {
    drawArmGhost(context, twin);
  }

  const joint = jointPosition(state);
  const bob = bobScreenPosition(state);

  drawReferenceVerticals(context, joint);
  drawAngleArcs(context, joint, state);

  // Rods.
  context.lineWidth = 5;
  context.strokeStyle = palette.ink;
  context.beginPath();
  context.moveTo(ORIGIN.x, ORIGIN.y);
  context.lineTo(joint.x, joint.y);
  context.lineTo(bob.x, bob.y);
  context.stroke();

  // Velocity vector at the lower bob.
  const velocity = bobVelocity(state);
  drawArrow(
    context,
    bob,
    {
      x: bob.x + velocity.x * SCALE * velocityLookaheadSeconds,
      y: bob.y + velocity.y * SCALE * velocityLookaheadSeconds,
    },
    { color: palette.teal, width: 3 },
  );

  // Pivot + bobs.
  drawDisc(context, ORIGIN, 6, { fill: palette.ink });
  drawDisc(context, joint, 14, { fill: palette.blue, stroke: '#ffffff', strokeWidth: 3, glow: true });
  drawDisc(context, bob, 17, { fill: palette.red, stroke: '#ffffff', strokeWidth: 3, glow: true });

  drawLegend(context);
}

function drawArmGhost(context: CanvasRenderingContext2D, twin: PendulumState): void {
  const joint = jointPosition(twin);
  const bob = bobScreenPosition(twin);
  context.save();
  context.globalAlpha = 0.4;
  context.lineWidth = 4;
  context.strokeStyle = palette.violet;
  context.beginPath();
  context.moveTo(ORIGIN.x, ORIGIN.y);
  context.lineTo(joint.x, joint.y);
  context.lineTo(bob.x, bob.y);
  context.stroke();
  drawDisc(context, bob, 12, { fill: palette.violet });
  context.restore();
}

function drawReferenceVerticals(context: CanvasRenderingContext2D, joint: Point): void {
  drawDashedLine(context, ORIGIN, { x: ORIGIN.x, y: ORIGIN.y + 96 }, palette.faint);
  drawDashedLine(context, joint, { x: joint.x, y: joint.y + 84 }, palette.faint);
}

function drawAngleArcs(
  context: CanvasRenderingContext2D,
  joint: Point,
  state: PendulumState,
): void {
  const downward = Math.PI / 2;
  const rod1Angle = Math.atan2(Math.cos(state.theta1), Math.sin(state.theta1));
  const rod2Angle = Math.atan2(Math.cos(state.theta2), Math.sin(state.theta2));

  drawAngleArc(context, ORIGIN, 44, downward, rod1Angle, palette.blue);
  drawAngleArc(context, joint, 34, downward, rod2Angle, palette.red);

  const mid1 = (downward + rod1Angle) / 2;
  drawLabel(
    context,
    `θ₁ ${formatDegrees(state.theta1)}`,
    ORIGIN.x + Math.cos(mid1) * 70,
    ORIGIN.y + Math.sin(mid1) * 70,
    { color: palette.blue, size: 13, weight: 700, align: 'center', baseline: 'middle' },
  );
  const mid2 = (downward + rod2Angle) / 2;
  drawLabel(
    context,
    `θ₂ ${formatDegrees(state.theta2)}`,
    joint.x + Math.cos(mid2) * 58,
    joint.y + Math.sin(mid2) * 58,
    { color: palette.red, size: 13, weight: 700, align: 'center', baseline: 'middle' },
  );
}

function drawLegend(context: CanvasRenderingContext2D): void {
  drawLabel(context, '● upper joint', 24, STAGE_HEIGHT - 56, { color: palette.blue, size: 12, weight: 600 });
  drawLabel(context, '● lower bob', 24, STAGE_HEIGHT - 38, { color: palette.red, size: 12, weight: 600 });
  drawLabel(context, '→ velocity', 24, STAGE_HEIGHT - 20, { color: palette.teal, size: 12, weight: 600 });
}

function formatDegrees(radians: number): string {
  const degrees = (radians * 180) / Math.PI;
  const wrapped = ((degrees % 360) + 540) % 360 - 180;
  return `${Math.round(wrapped)}°`;
}
