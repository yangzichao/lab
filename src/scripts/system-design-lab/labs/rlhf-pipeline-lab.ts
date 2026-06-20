import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatRate } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative single-node teaching budgets, not vendor limits.
const rolloutTokensPerGeneration = 512;
const policyParamsFitOnOneGpu = 7_000_000_000;
const comfortableRewardModelParams = 7_000_000_000;
// Effective generation work a single rollout worker absorbs per step before the loop bottlenecks.
const comfortableRolloutTokensPerStep = 180_000;
// Below this many preference pairs the pipeline is still SFT-only.
const preferenceDataThreshold = 5_000;
// Rollouts per step at/above which the online RL loop is genuinely running (vs offline RM training).
const rolloutLoopThreshold = 64;

export const rlhfPipelineLabDefinition: SystemDesignLabDefinition = {
  id: 'rlhf-pipeline',
  eyebrow: 'System Design Lab',
  title:
    'An RLHF pipeline is a training loop where rollout generation, reward scoring, and policy updates fight over the same GPUs.',
  summary:
    'Change the preference dataset, how many rollouts each PPO step generates, the policy and reward-model sizes, the PPO epochs per batch, the KL penalty, and how often you eval. The design moves from SFT-only, to adding a reward model, to a full PPO rollout loop, to scaling rollout generation (the usual bottleneck), to eval gates and a DPO alternative that drops the RL loop entirely.',
  controls: [
    {
      id: 'preferencePairs',
      label: 'Preference pairs',
      help: 'Human comparison pairs (chosen vs rejected) used to train the reward model or, under DPO, the policy directly.',
      min: 1_000,
      max: 10_000_000,
      defaultValue: 50_000,
      scale: 'log',
      unit: 'pairs',
      format: 'count',
    },
    {
      id: 'rolloutsPerStep',
      label: 'Rollouts per step',
      help: 'Completions the policy generates each PPO step; every one must be scored by the reward model and the reference model.',
      min: 8,
      max: 8_192,
      defaultValue: 256,
      scale: 'log',
      unit: 'rollouts',
      format: 'count',
    },
    {
      id: 'policyParams',
      label: 'Policy model size',
      help: 'Parameters in the policy being optimized; it must run both generation (inference) and gradient updates.',
      min: 100_000_000,
      max: 700_000_000_000,
      defaultValue: 7_000_000_000,
      scale: 'log',
      unit: 'params',
      format: 'count',
    },
    {
      id: 'rewardModelParams',
      label: 'Reward model size',
      help: 'Parameters in the reward model that scores each rollout; runs as an inference forward pass in the loop.',
      min: 100_000_000,
      max: 700_000_000_000,
      defaultValue: 7_000_000_000,
      scale: 'log',
      unit: 'params',
      format: 'count',
    },
    {
      id: 'ppoEpochs',
      label: 'PPO epochs per batch',
      help: 'Optimization passes the policy takes over each batch of scored rollouts before generating again.',
      min: 1,
      max: 16,
      defaultValue: 4,
      scale: 'linear',
      unit: 'epochs',
      format: 'count',
    },
    {
      id: 'klCoefficient',
      label: 'KL penalty coefficient',
      help: 'Strength of the KL constraint pulling the policy back toward the frozen reference model; too low and the policy reward-hacks.',
      min: 0.001,
      max: 1,
      defaultValue: 0.05,
      scale: 'log',
      format: 'multiplier',
    },
    {
      id: 'evalFrequency',
      label: 'Eval frequency',
      help: 'How often a held-out eval and safety check runs, measured in steps between evals (lower means more frequent).',
      min: 1,
      max: 1_000,
      defaultValue: 100,
      scale: 'log',
      unit: 'steps',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'useDpo',
      label: 'Use DPO (no RL loop)',
      help: 'Direct Preference Optimization trains the policy straight from preference pairs, removing the rollout-generation loop and online reward model.',
      defaultValue: false,
    },
    {
      id: 'separateRewardModel',
      label: 'Separate reward model',
      help: 'Host the reward model on its own devices instead of co-locating it with the policy; isolates scoring throughput.',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'sft-only',
      step: '01',
      title: 'SFT only',
      summary: 'Supervised fine-tuning on demonstrations, no reward model or RL yet.',
      values: {
        preferencePairs: 1_000,
        rolloutsPerStep: 8,
        policyParams: 1_300_000_000,
        rewardModelParams: 100_000_000,
        ppoEpochs: 1,
        klCoefficient: 0.05,
        evalFrequency: 300,
        useDpo: false,
        separateRewardModel: false,
      },
    },
    {
      id: 'add-reward-model',
      step: '02',
      title: 'Add a reward model',
      summary: 'Train a reward model from preference comparisons before any RL.',
      values: {
        preferencePairs: 50_000,
        rolloutsPerStep: 32,
        policyParams: 7_000_000_000,
        rewardModelParams: 7_000_000_000,
        ppoEpochs: 1,
        klCoefficient: 0.05,
        evalFrequency: 200,
        useDpo: false,
        separateRewardModel: true,
      },
    },
    {
      id: 'ppo-loop',
      step: '03',
      title: 'PPO rollout loop',
      summary: 'Policy generates rollouts, the reward model scores them, KL holds it to the reference.',
      values: {
        preferencePairs: 200_000,
        rolloutsPerStep: 256,
        policyParams: 13_000_000_000,
        rewardModelParams: 7_000_000_000,
        ppoEpochs: 4,
        klCoefficient: 0.02,
        evalFrequency: 100,
        useDpo: false,
        separateRewardModel: true,
      },
    },
    {
      id: 'scale-rollouts',
      step: '04',
      title: 'Scale rollout generation',
      summary: 'Many rollouts per step on a large policy; generation throughput is the bottleneck.',
      values: {
        preferencePairs: 1_000_000,
        rolloutsPerStep: 2_048,
        policyParams: 70_000_000_000,
        rewardModelParams: 70_000_000_000,
        ppoEpochs: 4,
        klCoefficient: 0.01,
        evalFrequency: 50,
        useDpo: false,
        separateRewardModel: true,
      },
    },
    {
      id: 'dpo-at-scale',
      step: '05',
      title: 'DPO alternative at scale',
      summary: 'Drop the RL loop: optimize a frontier policy directly on a huge preference set with tight eval gates.',
      values: {
        preferencePairs: 5_000_000,
        rolloutsPerStep: 8,
        policyParams: 175_000_000_000,
        rewardModelParams: 100_000_000,
        ppoEpochs: 1,
        klCoefficient: 0.1,
        evalFrequency: 10,
        useDpo: true,
        separateRewardModel: false,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'RLHF pipeline architecture diagram',
    description:
      'Whiteboard-style architecture diagram for an RLHF post-training pipeline: training data, an SFT stage with preference data, a reward model, the RL loop of rollout generation, policy update, and a frozen reference model, and finally eval, a model registry, and async logging.',
    columns: [
      {
        id: 'data',
        label: 'Data',
        variant: 'clients',
        nodes: [
          {
            id: 'demoData',
            title: 'Demonstrations',
            subtitle: 'SFT corpus',
            summary: 'human-written prompts and ideal responses used for supervised fine-tuning',
          },
          {
            id: 'prefData',
            title: 'Preference data',
            subtitle: 'chosen vs rejected',
            summary: 'human comparison pairs that define which responses are better',
          },
        ],
      },
      {
        id: 'sft',
        label: 'SFT',
        variant: 'edge',
        nodes: [
          {
            id: 'sftTrainer',
            title: 'SFT trainer',
            subtitle: 'base to policy',
            summary: 'fine-tunes the base model on demonstrations to seed the policy',
          },
        ],
      },
      {
        id: 'reward',
        label: 'Reward model',
        variant: 'backbone',
        nodes: [
          {
            id: 'rmTrainer',
            title: 'RM trainer',
            subtitle: 'fit preferences',
            summary: 'trains a reward model to score responses from preference pairs',
          },
          {
            id: 'rewardModel',
            title: 'Reward model',
            subtitle: 'scores rollouts',
            summary: 'serves a scalar reward for each generated rollout in the loop',
          },
        ],
      },
      {
        id: 'rl',
        label: 'RL loop',
        variant: 'processing',
        nodes: [
          {
            id: 'rolloutGen',
            title: 'Rollout gen',
            subtitle: 'policy inference',
            summary: 'the policy generates many completions per step; usually the bottleneck',
          },
          {
            id: 'policyUpdate',
            title: 'Policy update',
            subtitle: 'PPO / DPO',
            summary: 'gradient step that pushes the policy toward higher reward',
          },
          {
            id: 'refModel',
            title: 'Reference model',
            subtitle: 'KL anchor',
            summary: 'frozen reference whose KL divergence keeps the policy from drifting',
          },
        ],
      },
      {
        id: 'release',
        label: 'Eval + registry',
        variant: 'storage',
        nodes: [
          {
            id: 'evalHarness',
            title: 'Eval harness',
            subtitle: 'safety + quality',
            summary: 'runs held-out and safety evals to gate checkpoints',
          },
          {
            id: 'registry',
            title: 'Model registry',
            subtitle: 'versioned checkpoints',
            summary: 'stores and versions promoted policy checkpoints',
          },
          {
            id: 'logStream',
            title: 'Metrics log',
            subtitle: 'async telemetry',
            summary: 'collects reward, KL, and rollout metrics off the training path',
          },
        ],
      },
    ],
    flows: [
      { from: 'demoData', to: 'sftTrainer', variant: 'primary' },
      { from: 'prefData', to: 'rmTrainer', variant: 'primary' },
      { from: 'sftTrainer', to: 'rolloutGen', variant: 'direct' },
      { from: 'rmTrainer', to: 'rewardModel', variant: 'primary' },
      { from: 'rolloutGen', to: 'rewardModel', variant: 'secondary' },
      { from: 'rewardModel', to: 'policyUpdate', variant: 'primary' },
      { from: 'refModel', to: 'policyUpdate', variant: 'secondary' },
      { from: 'policyUpdate', to: 'rolloutGen', variant: 'primary' },
      { from: 'prefData', to: 'policyUpdate', variant: 'direct' },
      { from: 'policyUpdate', to: 'evalHarness', variant: 'primary' },
      { from: 'evalHarness', to: 'registry', variant: 'primary' },
      { from: 'rolloutGen', to: 'logStream', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'rolloutThroughput', label: 'Rollout generation load' },
    { id: 'scoringLoad', label: 'Reward + reference scoring' },
    { id: 'policyMemory', label: 'Policy training memory' },
    { id: 'klStability', label: 'KL drift risk' },
    { id: 'evalCoverage', label: 'Eval / safety coverage demand' },
  ],
  decisions: [
    { id: 'sftVsPref', title: 'SFT vs preference data' },
    { id: 'rewardModel', title: 'Reward model vs DPO' },
    { id: 'rolloutScaling', title: 'Rollout-generation throughput' },
    { id: 'distributedPolicy', title: 'Distributed policy training' },
    { id: 'klControl', title: 'KL / reference control' },
    { id: 'evalSafety', title: 'Eval + safety gating' },
  ],
  sourceBackedRules: [
    {
      title: 'InstructGPT: SFT, then a reward model, then PPO against a KL-penalized reference',
      source: 'Ouyang et al., 2022 (InstructGPT)',
      url: 'https://arxiv.org/abs/2203.02155',
      summary:
        'The canonical RLHF recipe fine-tunes on demonstrations, trains a reward model from comparisons, and optimizes the policy with PPO using a per-token KL penalty against the SFT reference.',
    },
    {
      title: 'DPO removes the explicit reward model and RL rollout loop',
      source: 'Rafailov et al., 2023 (DPO)',
      url: 'https://arxiv.org/abs/2305.18290',
      summary:
        'Direct Preference Optimization shows the RLHF objective can be optimized with a simple classification loss on preference pairs, eliminating online sampling and a separate reward model.',
    },
    {
      title: 'PPO is the clipped policy-gradient algorithm used in the RL stage',
      source: 'Schulman et al., 2017 (PPO)',
      url: 'https://arxiv.org/abs/1707.06347',
      summary:
        'Proximal Policy Optimization takes several optimization epochs over each batch of sampled trajectories with a clipped objective, which is why rollouts are reused across PPO epochs.',
    },
    {
      title: 'Online RLHF couples generation and training; generation throughput dominates',
      source: 'vLLM docs',
      url: 'https://docs.vllm.ai/',
      summary:
        'High-throughput batched inference engines are used to generate rollouts because, in the online RL loop, sampling completions from the policy is the throughput bottleneck.',
    },
  ],
  teachingAssumptions: [
    'Single-GPU rollout-generation throughput and memory budgets are conservative teaching numbers, not vendor limits.',
    'Reward and reference scoring cost is modeled as one inference forward pass per rollout each; PPO reuses each rollout for the chosen number of epochs.',
    'KL drift risk is approximated from the KL coefficient and rollout volume; real runs also track measured KL and reward-hacking signals directly.',
  ],
  teachingWalkthrough: [
    {
      id: 'sft-step',
      step: '01',
      focus: 'Start with SFT',
      scenarioId: 'sft-only',
      question:
        'You have demonstrations and a base model. Before any reward model or RL, why fine-tune supervised first instead of going straight to preference optimization?',
      reveal:
        'SFT gives the policy a competent starting point that already follows the instruction format, so later preference signal can refine behavior instead of teaching it from scratch. With no rollouts, reward model, or reference model in play, this stage is just ordinary supervised training on one model.',
      takeaway: 'SFT seeds a usable policy; the alignment loop refines it, it does not bootstrap it.',
    },
    {
      id: 'rm-step',
      step: '02',
      focus: 'Train a reward model',
      scenarioId: 'add-reward-model',
      question:
        'You now have 50k human comparison pairs. Why train a separate reward model from them instead of hand-writing a reward function?',
      reveal:
        'Human preferences over full responses are hard to express as a rule, so you fit a reward model that generalizes the comparisons to a scalar score. It is trained offline here, but in the RL loop it will run as an inference service scoring every rollout, so its size directly costs throughput.',
      takeaway: 'A learned reward model turns sparse human comparisons into a dense score the RL loop can optimize.',
    },
    {
      id: 'ppo-step',
      step: '03',
      focus: 'Close the PPO loop',
      scenarioId: 'ppo-loop',
      question:
        'The policy now generates rollouts, the reward model scores them, and PPO updates the policy. With KL low and four PPO epochs per batch, what new failure modes appear that SFT never had?',
      reveal:
        'Three models are now live at once (policy, reward model, reference) and the loop is online. Two risks emerge: reward hacking when the KL penalty is too weak to hold the policy near the reference, and that every rollout must be both generated and scored, so generation throughput starts gating step time.',
      takeaway: 'The RL loop couples generation, scoring, and training; KL is the leash that keeps reward optimization honest.',
    },
    {
      id: 'scale-step',
      step: '04',
      focus: 'Rollouts dominate',
      scenarioId: 'scale-rollouts',
      question:
        '2,048 rollouts per step on a 70B policy. Which part of the loop saturates first, and what do you scale to fix it?',
      reveal:
        'Rollout generation saturates first: sampling thousands of completions from a 70B policy is far more expensive than the gradient step. You scale generation with batched, distributed inference (and the policy itself needs tensor/pipeline parallelism to fit and train), often on dedicated inference replicas separate from the trainer.',
      takeaway: 'In online RLHF, generation throughput is the bottleneck, so you scale rollout inference before anything else.',
    },
    {
      id: 'dpo-step',
      step: '05',
      focus: 'DPO drops the loop',
      scenarioId: 'dpo-at-scale',
      question:
        'A frontier-size policy on 5M preference pairs. If rollout generation is the bottleneck, what does switching to DPO buy you, and what do you give up?',
      reveal:
        'DPO optimizes the policy directly from preference pairs with a classification-style loss, so there is no rollout generation, no online reward model, and no separate reference serving in the loop, removing the dominant cost. You give up the flexibility of online exploration and an explicit reward signal, and you lean harder on dataset quality and tight eval gates.',
      takeaway: 'DPO trades the expensive online RL loop for a simpler offline objective bounded by preference-data quality.',
    },
  ],
  analyze: analyzeRlhfPipelineWorkload,
};

function analyzeRlhfPipelineWorkload(workload: WorkloadValues): LabAnalysis {
  const preferencePairs = numericValue(workload, 'preferencePairs');
  const rolloutsPerStep = numericValue(workload, 'rolloutsPerStep');
  const policyParams = numericValue(workload, 'policyParams');
  const rewardModelParams = numericValue(workload, 'rewardModelParams');
  const ppoEpochs = numericValue(workload, 'ppoEpochs');
  const klCoefficient = numericValue(workload, 'klCoefficient');
  const evalFrequency = numericValue(workload, 'evalFrequency');
  const useDpo = Boolean(workload.useDpo);
  const separateRewardModel = Boolean(workload.separateRewardModel);

  // Preference data is used once you collect a meaningful comparison set (for a reward model under
  // PPO), and is ALWAYS the training signal under DPO regardless of how many pairs you have, since
  // DPO consumes the pairs directly to update the policy. Below the threshold on the PPO path the
  // pipeline is still SFT-only.
  const usesPreferenceData = preferencePairs >= preferenceDataThreshold || useDpo;
  // A reward model is trained only on the PPO path with preference data.
  const needsRewardModel = usesPreferenceData && !useDpo;
  // The online RL rollout loop runs only under PPO, once a reward model exists and rollouts are
  // generated at a training scale. DPO removes the loop entirely.
  const hasRlLoop = needsRewardModel && rolloutsPerStep >= rolloutLoopThreshold;

  // Rollout generation cost scales with rollouts and (sublinearly) with policy size:
  // a larger policy generates fewer tokens/s, so its effective work per token is higher.
  const policySizeFactor = Math.sqrt(policyParams / policyParamsFitOnOneGpu);
  const rolloutTokensPerStep = rolloutsPerStep * rolloutTokensPerGeneration;
  const effectiveRolloutWork = rolloutTokensPerStep * Math.max(policySizeFactor, 1);
  const rolloutThroughputRatio = hasRlLoop
    ? effectiveRolloutWork / comfortableRolloutTokensPerStep
    : 0;

  // Reward + reference model scoring: two inference passes per rollout, scaled by RM size.
  const rmSizeFactor = rewardModelParams / comfortableRewardModelParams;
  const scoringPasses = hasRlLoop ? rolloutsPerStep * (1 + rmSizeFactor) : 0;
  const scoringRatio = hasRlLoop
    ? (scoringPasses / 512) * (separateRewardModel ? 0.6 : 1)
    : 0;

  // Policy training memory: PPO holds policy + reference (+ optionally reward model) in the loop.
  const modelsResident = useDpo ? 1 : separateRewardModel ? 2 : 3;
  const policyMemoryRatio = (policyParams / policyParamsFitOnOneGpu) * (modelsResident / 2) * Math.sqrt(ppoEpochs);

  // KL drift risk: low KL coefficient with high rollout volume invites reward hacking (PPO only).
  const klStabilityRatio = hasRlLoop
    ? (0.05 / Math.max(klCoefficient, 0.001)) * Math.min(rolloutsPerStep / 256, 4)
    : 0.2;

  // Eval coverage DEMAND: how much eval/safety gating this design needs, relative to what the
  // current eval frequency supplies. The DEMAND grows with policy scale, the online RL loop (reward
  // hacking is a moving target), and the DPO path (which is bounded by dataset quality and so leans
  // hard on eval gates). Evaluating more often (lower steps-between-evals) closes the gap, but with
  // diminishing returns — a frontier-size policy still demands heavy coverage even when gated often,
  // so the meter rises with scale instead of collapsing at the most-scaled scenario.
  const evalScalePressure = Math.min(Math.sqrt(policyParams / comfortableRewardModelParams), 5);
  const evalDemand = evalScalePressure * (hasRlLoop ? 1.25 : 1) * (useDpo ? 1.4 : 1);
  // Frequency credit: capped at 0.7 so tight eval helps but can never zero out the demand.
  const evalFrequencyCredit = Math.min(Math.max(Math.log10(300 / Math.max(evalFrequency, 1)), 0) * 0.32, 0.7);
  const evalRiskRatio = (evalDemand * (1 - evalFrequencyCredit)) / 2;

  const needsRolloutScaling = hasRlLoop && rolloutThroughputRatio > 1;
  const needsDistributedPolicy = policyParams > policyParamsFitOnOneGpu;
  const needsKlControl = hasRlLoop && klStabilityRatio > 0.7;
  const needsTightEval = evalRiskRatio > 0.7;

  const flags = {
    hasRlLoop,
    useDpo,
    separateRewardModel,
    needsRewardModel,
    needsRolloutScaling,
    needsDistributedPolicy,
    needsKlControl,
    needsTightEval,
    usesPreferenceData,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      demoData: 'ok',
      prefData: usesPreferenceData ? 'ok' : 'inactive',
      sftTrainer: 'ok',
      rmTrainer: needsRewardModel ? 'ok' : 'inactive',
      rewardModel: hasRlLoop ? (needsRolloutScaling ? 'warning' : 'needed') : needsRewardModel ? 'ok' : 'inactive',
      rolloutGen: hasRlLoop ? (needsRolloutScaling ? 'overloaded' : 'needed') : 'inactive',
      policyUpdate: needsDistributedPolicy ? 'needed' : 'ok',
      refModel: hasRlLoop ? 'needed' : 'inactive',
      evalHarness: needsTightEval ? 'needed' : 'ok',
      registry: 'ok',
      logStream: hasRlLoop ? 'ok' : 'inactive',
    },
    flowStates: {
      demoDataToSftTrainer: 'active',
      prefDataToRmTrainer: needsRewardModel ? 'active' : 'inactive',
      sftTrainerToRolloutGen: hasRlLoop ? 'active' : 'inactive',
      rmTrainerToRewardModel: needsRewardModel ? 'active' : 'inactive',
      rolloutGenToRewardModel: hasRlLoop ? (needsRolloutScaling ? 'warning' : 'active') : 'inactive',
      rewardModelToPolicyUpdate: hasRlLoop ? 'active' : 'inactive',
      refModelToPolicyUpdate: hasRlLoop ? 'active' : 'inactive',
      policyUpdateToRolloutGen: hasRlLoop ? (needsRolloutScaling ? 'warning' : 'active') : 'inactive',
      prefDataToPolicyUpdate: useDpo ? 'active' : 'inactive',
      policyUpdateToEvalHarness: 'active',
      evalHarnessToRegistry: 'active',
      rolloutGenToLogStream: hasRlLoop ? 'active' : 'inactive',
    },
    meters: {
      rolloutThroughput: {
        ratio: rolloutThroughputRatio,
        valueText: hasRlLoop
          ? `${formatCount(rolloutsPerStep)} rollouts/step`
          : useDpo
            ? `no rollout loop (${formatCount(rolloutsPerStep)} rollouts/step idle)`
            : 'no rollout loop',
        copy: hasRlLoop
          ? `Generating ${formatCount(rolloutsPerStep)} rollouts (~${formatRate(
              rolloutTokensPerStep,
            )} tokens) from a ${formatCount(policyParams)}-param policy each step; this usually gates step time.`
          : useDpo
            ? `DPO removes the online rollout loop, so the ${formatCount(rolloutsPerStep)} rollouts/step setting is inert — there is no online generation cost per step.`
            : 'No online RL loop yet — generation only starts once PPO rollouts run at scale.',
      },
      scoringLoad: {
        ratio: scoringRatio,
        valueText: hasRlLoop
          ? `${formatCount(scoringPasses)} passes/step`
          : useDpo
            ? `${formatCount(preferencePairs)} pairs direct (${formatCount(rewardModelParams)} RM${separateRewardModel ? ', isolated' : ', co-located'} idle)`
            : 'no online scoring',
        copy: hasRlLoop
          ? `Each rollout needs a reward-model and reference forward pass; a ${formatCount(
              rewardModelParams,
            )}-param reward model${separateRewardModel ? ' on its own devices' : ' co-located with the policy'} carries the scoring load.`
          : useDpo
            ? `No reward model runs in the loop under DPO; the ${formatCount(rewardModelParams)}-param reward-model${separateRewardModel ? ' (on its own devices)' : ' (co-located)'} setting is inert because preference pairs are consumed directly.`
            : needsRewardModel
              ? 'The reward model is trained offline here; online scoring load appears once the RL loop runs.'
              : 'No reward model yet — the pipeline is still supervised fine-tuning only.',
      },
      policyMemory: {
        ratio: policyMemoryRatio,
        valueText: `${formatCount(policyParams)} params, ${modelsResident} model${modelsResident === 1 ? '' : 's'}`,
        copy: useDpo
          ? `DPO keeps just ${modelsResident} model resident (the policy, with an implicit reference term) instead of PPO's 2-3, but a ${formatCount(policyParams)}-param policy is still very large in absolute terms and must be sharded to fit and train.`
          : hasRlLoop
            ? `PPO holds ${modelsResident} large models in the loop across ${Math.round(ppoEpochs)} epochs per batch.`
            : `Training a single ${formatCount(policyParams)}-param model so far; the RL loop will add the reward and reference models.`,
      },
      klStability: {
        ratio: klStabilityRatio,
        valueText: hasRlLoop
          ? `KL coef ${klCoefficient.toFixed(3)}`
          : useDpo
            ? `implicit beta ${klCoefficient.toFixed(3)}`
            : 'no online KL',
        copy: hasRlLoop
          ? klStabilityRatio > 0.7
            ? 'A weak KL penalty against the reference invites reward hacking as rollout volume grows.'
            : 'The KL penalty holds the policy close enough to the reference to keep reward optimization honest.'
          : useDpo
            ? `DPO bakes the reference into its loss as an implicit beta (set here from the ${klCoefficient.toFixed(3)} coefficient), so there is no separate online KL term to tune in a loop.`
            : 'No online RL loop yet, so there is no reference KL penalty to manage.',
      },
      evalCoverage: {
        ratio: evalRiskRatio,
        valueText: `every ${formatCount(evalFrequency)} step${Math.round(evalFrequency) === 1 ? '' : 's'}`,
        copy:
          evalRiskRatio > 0.7
            ? `A ${formatCount(policyParams)}-param policy${useDpo ? ' optimized by DPO' : hasRlLoop ? ' in an online RL loop' : ''} demands heavy eval coverage; evaluating every ${formatCount(evalFrequency)} steps still leaves a gap — gate checkpoints more often.`
            : `Eval demand at this scale is comfortably met: gating every ${formatCount(evalFrequency)} steps catches regressions before promotion.`,
      },
    },
    decisions: buildDecisions({
      ...flags,
      rolloutsPerStep,
      policyParams,
      rewardModelParams,
      preferencePairs,
      evalFrequency,
      klCoefficient,
    }),
    reasons: buildReasons({
      ...flags,
      rolloutsPerStep,
      policyParams,
      rewardModelParams,
      preferencePairs,
      klCoefficient,
      evalFrequency,
      rolloutThroughputRatio,
      ppoEpochs,
    }),
  };
}

type ArchitectureFlags = {
  hasRlLoop: boolean;
  useDpo: boolean;
  separateRewardModel: boolean;
  needsRewardModel: boolean;
  needsRolloutScaling: boolean;
  needsDistributedPolicy: boolean;
  needsKlControl: boolean;
  needsTightEval: boolean;
  usesPreferenceData: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    rolloutsPerStep: number;
    policyParams: number;
    rewardModelParams: number;
    preferencePairs: number;
    klCoefficient: number;
    evalFrequency: number;
    rolloutThroughputRatio: number;
    ppoEpochs: number;
  },
): LabReason[] {
  // High-priority warnings/dangers first so the slice(0, 7) below never drops a real risk.
  const priority: LabReason[] = [];
  // Lower-priority always-on context, appended after, trimmed first when over budget.
  const context: LabReason[] = [];

  // --- status headline (always exactly one) ---
  if (analysis.useDpo) {
    priority.push({
      severity: 'ok',
      text: `DPO optimizes the policy directly from ${formatCount(
        analysis.preferencePairs,
      )} preference pairs, removing rollout generation and the online reward model entirely.`,
    });
  } else if (analysis.hasRlLoop) {
    priority.push({
      severity: 'ok',
      text: `PPO runs an online loop: the policy generates ${formatCount(
        analysis.rolloutsPerStep,
      )} rollouts per step, scored by a reward model and anchored by a frozen reference.`,
    });
  } else if (analysis.needsRewardModel) {
    priority.push({
      severity: 'ok',
      text: `A reward model is being trained from ${formatCount(
        analysis.preferencePairs,
      )} preference pairs; the online RL loop has not started yet.`,
    });
  } else {
    priority.push({
      severity: 'ok',
      text: 'Supervised fine-tuning only: no preference data, reward model, or RL loop is in play yet.',
    });
  }

  // --- scale warnings/dangers (kept ahead of the slice) ---
  if (analysis.needsRolloutScaling) {
    priority.push({
      severity: analysis.rolloutThroughputRatio > 2 ? 'danger' : 'warning',
      text: `Generating ${formatCount(
        analysis.rolloutsPerStep,
      )} rollouts from a ${formatCount(
        analysis.policyParams,
      )}-param policy each step dominates step time; scale rollout generation with batched, distributed inference.`,
    });
  }
  if (analysis.needsKlControl) {
    priority.push({
      severity: 'danger',
      text: `A KL coefficient of ${analysis.klCoefficient.toFixed(
        3,
      )} is too weak for this rollout volume; the policy can reward-hack away from the reference.`,
    });
  }
  if (analysis.needsDistributedPolicy) {
    priority.push({
      severity: 'warning',
      text: `A ${formatCount(
        analysis.policyParams,
      )}-param policy must be sharded with tensor/pipeline parallelism to fit and train across GPUs.`,
    });
  }
  if (analysis.needsTightEval) {
    priority.push({
      severity: 'warning',
      text: `A ${formatCount(
        analysis.policyParams,
      )}-param policy demands heavy eval coverage; evaluating only every ${formatCount(
        analysis.evalFrequency,
      )} steps still leaves a gap — tighten safety gates before promotion.`,
    });
  }
  if (analysis.hasRlLoop) {
    priority.push({
      severity: analysis.rewardModelParams > comfortableRewardModelParams ? 'warning' : 'ok',
      text: `A ${formatCount(
        analysis.rewardModelParams,
      )}-param reward model scores every rollout${analysis.separateRewardModel ? ' on dedicated devices' : ' co-located with the policy'}; its size is part of the per-step cost.`,
    });
  }

  // --- always-applicable context so every scenario clears the 4-reason floor ---
  context.push({
    severity: 'ok',
    text: 'SFT on demonstrations seeds a competent policy first; preference signal then refines that policy rather than teaching it from scratch.',
  });
  if (analysis.usesPreferenceData) {
    context.push({
      severity: 'ok',
      text: analysis.useDpo
        ? `${formatCount(
            analysis.preferencePairs,
          )} preference pairs are the sole training signal under DPO, so data quality and coverage bound the result.`
        : `${formatCount(
            analysis.preferencePairs,
          )} preference comparisons train the reward model that the RL loop optimizes against.`,
    });
  } else {
    context.push({
      severity: 'ok',
      text: 'No preference comparisons are collected yet, so the pipeline cannot train a reward model or run preference optimization.',
    });
  }
  context.push({
    severity: 'ok',
    text: analysis.useDpo
      ? `DPO keeps one model resident instead of PPO's two-to-three, easing the model count even though a ${formatCount(
          analysis.policyParams,
        )}-param policy stays large in absolute memory.`
      : analysis.hasRlLoop
        ? `The online loop holds the policy, reward model, and frozen reference at once over ${Math.round(
            analysis.ppoEpochs,
          )} PPO epochs per batch.`
        : `Only a single ${formatCount(
            analysis.policyParams,
          )}-param model is resident so far; the RL loop would add the reward and reference models.`,
  });
  if (!analysis.useDpo && analysis.ppoEpochs > 1) {
    context.push({
      severity: 'ok',
      text: `PPO reuses each batch of rollouts for ${Math.round(
        analysis.ppoEpochs,
      )} optimization epochs, amortizing the expensive generation step.`,
    });
  }

  const reasons = [...priority, ...context];
  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    rolloutsPerStep: number;
    policyParams: number;
    rewardModelParams: number;
    preferencePairs: number;
    evalFrequency: number;
    klCoefficient: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    sftVsPref: {
      state: flags.usesPreferenceData ? 'needed' : 'useful',
      copy: flags.usesPreferenceData
        ? `SFT seeds the policy on demonstrations; ${formatCount(
            flags.preferencePairs,
          )} preference pairs then drive ${flags.useDpo ? 'DPO directly' : 'the reward model'}.`
        : 'Only supervised fine-tuning so far; preference data is not yet collected or used.',
    },
    rewardModel: {
      state: flags.useDpo ? 'tradeoff' : flags.needsRewardModel ? 'needed' : 'not-yet',
      copy: flags.useDpo
        ? 'DPO removes the explicit reward model, trading online flexibility for a simpler offline objective.'
        : flags.needsRewardModel
          ? `Train and serve a ${formatCount(
              flags.rewardModelParams,
            )}-param reward model to score rollouts in the PPO loop.`
          : 'No reward model yet; the pipeline stops at supervised fine-tuning.',
    },
    rolloutScaling: {
      state: !flags.hasRlLoop ? 'not-yet' : flags.needsRolloutScaling ? 'needed' : 'useful',
      copy: !flags.hasRlLoop
        ? flags.useDpo
          ? 'DPO has no rollout loop, so there is nothing to scale on the generation side.'
          : 'No online RL loop yet, so there is no rollout generation to scale.'
        : flags.needsRolloutScaling
          ? `Generating ${formatCount(
              flags.rolloutsPerStep,
            )} rollouts per step is the bottleneck; use batched, distributed inference replicas.`
          : 'Rollout volume is modest enough that one generation worker keeps up.',
    },
    distributedPolicy: {
      state: flags.needsDistributedPolicy ? 'needed' : 'not-yet',
      copy: flags.needsDistributedPolicy
        ? `A ${formatCount(
            flags.policyParams,
          )}-param policy needs tensor/pipeline parallelism to fit and update across devices.`
        : 'The policy fits on a single accelerator, so no model sharding is required yet.',
    },
    klControl: {
      state: !flags.hasRlLoop ? 'not-yet' : flags.needsKlControl ? 'needed' : 'useful',
      copy: !flags.hasRlLoop
        ? flags.useDpo
          ? 'DPO folds the reference into its loss, so there is no separate online KL term to manage.'
          : 'No online RL loop yet, so the KL / reference constraint is not active.'
        : flags.needsKlControl
          ? `Raise the KL coefficient (now ${flags.klCoefficient.toFixed(
              3,
            )}) to keep the policy near the reference and prevent reward hacking.`
          : 'The KL penalty against the frozen reference is holding the policy in a safe region.',
    },
    evalSafety: {
      state: flags.needsTightEval ? 'needed' : 'useful',
      copy: flags.needsTightEval
        ? `Evaluating every ${formatCount(
            flags.evalFrequency,
          )} steps is too sparse here; gate checkpoints on held-out and safety evals more often.`
        : 'Eval and safety checks run frequently enough to catch regressions before a checkpoint is promoted.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (flags.useDpo) {
    return 'DPO: direct preference optimization, no RL loop';
  }
  if (!flags.needsRewardModel) {
    return 'SFT only';
  }
  if (!flags.hasRlLoop) {
    return 'SFT + reward model (RL loop not started)';
  }
  if (flags.needsRolloutScaling || flags.needsDistributedPolicy) {
    return 'PPO with scaled, distributed rollout generation';
  }
  return 'PPO RLHF loop with reward + reference models';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (flags.useDpo) {
    return 'The policy is optimized directly from preference pairs with a classification-style loss; there is no rollout generation, no online reward model, and no separate reference serving in the loop.';
  }
  if (!flags.needsRewardModel) {
    return 'Supervised fine-tuning on demonstrations only. No reward model, rollout loop, or reference model is justified yet.';
  }
  if (!flags.hasRlLoop) {
    return 'A reward model is trained offline from preference comparisons, but the online PPO rollout loop has not started; this stage is still ordinary supervised-style training.';
  }
  if (flags.needsRolloutScaling || flags.needsDistributedPolicy) {
    return 'A sharded policy generates rollouts on distributed inference replicas, a reward model scores them, and a KL-penalized reference keeps the PPO updates honest; generation throughput is the dominant cost.';
  }
  return 'The policy generates rollouts, a reward model scores each one, and PPO updates the policy under a KL penalty against the frozen reference model.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (flags.useDpo) {
    return 'SFT -> preference pairs -> DPO policy update -> eval';
  }
  if (!flags.needsRewardModel) {
    return 'Demonstrations -> SFT -> eval';
  }
  if (!flags.hasRlLoop) {
    return 'SFT -> reward model (offline) -> eval';
  }
  if (flags.needsRolloutScaling || flags.needsDistributedPolicy) {
    return 'SFT -> reward model -> distributed rollouts -> PPO update (KL) -> eval';
  }
  return 'SFT -> reward model -> rollouts -> PPO update (KL) -> eval';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
