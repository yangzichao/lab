import type {
  ClamProfile,
  DigInput,
  DigOutcome,
  DigPhase,
  DigResult,
  ToolSpec,
} from './geoduck-dig-types';
import {
  GRASP_MARGIN_FT,
  MAX_DEPTH_FT,
  PULL_RISE_PER_SECOND,
  SNAP_TENSION,
  WATER_TABLE_FT,
} from './geoduck-dig-config';

const NECK_RETRACT_PER_SECOND = 0.13;
const SUCTION_RELAX_IDLE = 0.06;
const ROCK_RELIEF = 0.55;
const DIG_SUCTION_PENALTY = 0.42; // how much full suction slows excavation
const WET_CAVE_MULTIPLIER = 2.3; // saturated sand below the water table slumps faster
const SHOVEL_CRUSH_CHANCE = 0.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export interface SafeBand {
  greenStart: number;
  greenEnd: number;
  canGrasp: boolean;
  looseness: number;
}

export interface DigSnapshot {
  phase: DigPhase;
  dugDepthFt: number;
  neckTipFt: number;
  suction: number;
  tension: number;
  elapsedSeconds: number;
  band: SafeBand;
  tool: ToolSpec;
  clam: ClamProfile;
  belowWaterTable: boolean;
}

/**
 * One geoduck dig: the sand column fights you with cave-in and suction while the
 * tide clock (owned by the caller) runs down. Reach the body, relieve suction,
 * then pull inside the safe band to lift it intact.
 */
export class DigSession {
  readonly tool: ToolSpec;
  readonly clam: ClamProfile;

  private phase: DigPhase = 'digging';
  private dugDepthFt = 0;
  /** Deepest the shaft has ever been cleared to — once you reach the body you
   * keep your grip even as loose sand caves back over the hole. */
  private maxDugDepthFt = 0;
  private neckTipFt = 0;
  private suction = 0;
  private tension = 0;
  private elapsedSeconds = 0;
  private wasPulling = false;
  private result: DigResult | null = null;
  /** A transient hint shown when a pull fails to dislodge the clam. */
  private nudgeMessage = '';

  constructor(tool: ToolSpec, clam: ClamProfile) {
    this.tool = tool;
    this.clam = clam;
  }

  private graspStartFt(): number {
    return this.clam.bodyDepthFt - GRASP_MARGIN_FT;
  }

  /** Live safe band for the extraction pull, driven by depth and suction.
   * Grasp and looseness use the deepest point reached, not the current
   * (cave-filled) depth, so sand slumping back never unfairly tears the neck. */
  computeBand(): SafeBand {
    const graspStart = this.graspStartFt();
    const looseness = clamp01((this.maxDugDepthFt - graspStart) / 0.65);
    const greenStart = 0.32;
    const greenEnd = clamp(
      0.42 + this.tool.pullTolerance * 0.45 + looseness * 0.32 - this.suction * 0.4,
      greenStart + 0.05,
      1.0,
    );
    return {
      greenStart,
      greenEnd,
      canGrasp: this.maxDugDepthFt >= graspStart,
      looseness,
    };
  }

  private caveMultiplier(): number {
    // Smoothly ramp the slump rate as the hole crosses the water table.
    const wetness = clamp01((this.dugDepthFt - WATER_TABLE_FT) / 0.6 + 0.5);
    return 1 + wetness * (WET_CAVE_MULTIPLIER - 1);
  }

  private digRate(): number {
    const belowWater = this.dugDepthFt > WATER_TABLE_FT;
    const wetGain = belowWater ? this.tool.wetBonus : -0.25 * Math.max(0, this.tool.wetBonus - 0.3);
    const suctionDrag = 1 - this.suction * DIG_SUCTION_PENALTY;
    return this.tool.digRatePerSecond * (1 + wetGain) * suctionDrag;
  }

  update(dt: number, input: DigInput): void {
    if (this.phase === 'resolved') {
      return;
    }
    this.elapsedSeconds += dt;
    this.nudgeMessage = '';

    // Suction: rocking the tube relieves it instantly; otherwise it bleeds off slowly.
    if (input.rock) {
      this.suction = Math.max(0, this.suction - ROCK_RELIEF);
    }
    this.suction = clamp01(this.suction - SUCTION_RELAX_IDLE * dt);

    // The siphon retracts toward the body the whole time — but never past it.
    const neckFloor = Math.max(0, this.clam.bodyDepthFt - 0.25);
    this.neckTipFt = Math.min(neckFloor, this.neckTipFt + NECK_RETRACT_PER_SECOND * dt);

    // Sand always seeps back; a good tube wall holds most of it.
    const caveIn =
      this.tool.caveInBasePerSecond * (1 - this.tool.retainFactor) * this.caveMultiplier();
    this.dugDepthFt = clamp(this.dugDepthFt - caveIn * dt, 0, MAX_DEPTH_FT);

    this.handlePull(dt, input);
    // handlePull may resolve the dig; bail before any further excavation.
    if (this.result) {
      return;
    }

    if (this.phase === 'digging' && input.digging) {
      this.dugDepthFt = clamp(this.dugDepthFt + this.digRate() * dt, 0, MAX_DEPTH_FT);
      this.maxDugDepthFt = Math.max(this.maxDugDepthFt, this.dugDepthFt);
      this.suction = clamp01(this.suction + this.tool.suctionBuildPerSecond * dt);
    }
  }

  private handlePull(dt: number, input: DigInput): void {
    if (input.pulling) {
      if (this.phase === 'digging') {
        this.phase = 'extracting';
        this.tension = 0;
      }
      this.tension += PULL_RISE_PER_SECOND * dt;
      if (this.tension >= SNAP_TENSION) {
        this.resolvePull(SNAP_TENSION);
      }
    } else if (this.wasPulling && this.phase === 'extracting') {
      // Released the pull — judge it.
      this.resolvePull(this.tension);
    }
    this.wasPulling = input.pulling;
  }

  private resolvePull(tension: number): void {
    const band = this.computeBand();

    if (!band.canGrasp) {
      this.finish('snapped');
      return;
    }
    if (tension < band.greenStart) {
      // Not enough — the clam slips back. Keep digging and try again.
      this.tension = 0;
      this.phase = 'digging';
      this.suction = clamp01(this.suction + 0.12);
      this.nudgeMessage = "It didn't budge — loosen it deeper, then pull harder.";
      return;
    }
    if (tension <= band.greenEnd) {
      // A clean lift. The wide-open shovel pit can still crush or sever it.
      if (this.tool.id === 'shovel' && Math.random() < SHOVEL_CRUSH_CHANCE) {
        this.finish('crushed');
      } else {
        this.finish('intact');
      }
      return;
    }
    // Yanked past the safe band — the neck tears off the shell.
    this.finish('snapped');
  }

  private finish(outcome: DigOutcome): void {
    this.phase = 'resolved';
    this.result = {
      outcome,
      species: this.clam.species,
      weightLb: this.clam.weightLb,
      elapsedSeconds: this.elapsedSeconds,
      message: buildResultMessage(outcome, this.clam),
    };
  }

  /** Walk away from this show (e.g. realising it is a horse clam). */
  abandon(): void {
    if (this.phase !== 'resolved') {
      this.finish('abandoned');
    }
  }

  /** The tide came in mid-dig. */
  forceTideOut(): void {
    if (this.phase !== 'resolved') {
      this.finish('tide-out');
    }
  }

  getResult(): DigResult | null {
    return this.result;
  }

  getNudge(): string {
    return this.nudgeMessage;
  }

  snapshot(): DigSnapshot {
    return {
      phase: this.phase,
      dugDepthFt: this.dugDepthFt,
      neckTipFt: this.neckTipFt,
      suction: this.suction,
      tension: this.tension,
      elapsedSeconds: this.elapsedSeconds,
      band: this.computeBand(),
      tool: this.tool,
      clam: this.clam,
      belowWaterTable: this.dugDepthFt > WATER_TABLE_FT,
    };
  }
}

function buildResultMessage(outcome: DigOutcome, clam: ClamProfile): string {
  const name = clam.label.toLowerCase();
  switch (outcome) {
    case 'intact':
      if (clam.species === 'geoduck') {
        return `Clean lift! A ${clam.weightLb.toFixed(1)} lb geoduck, neck and all.`;
      }
      if (clam.species === 'horse-clam') {
        return `Out it comes — but it's a horse clam. Tasty, just not the prize.`;
      }
      return `Just a little cockle. Toss it back.`;
    case 'crushed':
      return `The open pit caved and cracked the shell — a damaged ${name}.`;
    case 'snapped':
      return `Snap. You pulled the neck off the shell and lost the ${name}.`;
    case 'tide-out':
      return `The tide beat you to it — water floods the hole. Walk away.`;
    case 'abandoned':
      return `You leave the ${name} and move on.`;
  }
}
