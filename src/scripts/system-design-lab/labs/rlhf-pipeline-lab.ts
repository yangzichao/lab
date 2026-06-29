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
  eyebrow: '系统设计 Lab',
  title:
    'RLHF pipeline 是一个训练循环，rollout generation、reward scoring 和 policy update 在抢同一批 GPU。',
  summary:
    '调节 preference 数据集、每个 PPO step 生成多少 rollout、policy 和 reward model 的规模、每个 batch 的 PPO epoch 数、KL penalty，以及多久 eval 一次。设计会从只有 SFT，演进到加上 reward model，再到完整的 PPO rollout loop，再到扩展 rollout generation（通常的瓶颈），最后到 eval gate 和一条把 RL loop 整个砍掉的 DPO 路线。',
  controls: [
    {
      id: 'preferencePairs',
      label: 'Preference pairs',
      help: '人类比较出来的成对数据（chosen vs rejected），用来训练 reward model，或在 DPO 下直接训练 policy。',
      min: 1_000,
      max: 10_000_000,
      defaultValue: 50_000,
      scale: 'log',
      unit: '对',
      format: 'count',
    },
    {
      id: 'rolloutsPerStep',
      label: 'Rollouts per step',
      help: 'policy 在每个 PPO step 生成的 completion 数；每一个都要被 reward model 和 reference model 打分。',
      min: 8,
      max: 8_192,
      defaultValue: 256,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'policyParams',
      label: 'Policy model size',
      help: '正在被优化的 policy 的参数量；它既要跑 generation（inference）也要做 gradient update。',
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
      help: '给每个 rollout 打分的 reward model 的参数量；在 loop 里作为一次 inference forward pass 运行。',
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
      help: 'policy 在重新生成之前，对每一批打过分的 rollout 做多少轮优化遍历。',
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
      help: 'KL 约束把 policy 往冻结的 reference model 拉回去的强度；太低 policy 就会 reward-hack。',
      min: 0.001,
      max: 1,
      defaultValue: 0.05,
      scale: 'log',
      format: 'multiplier',
    },
    {
      id: 'evalFrequency',
      label: 'Eval frequency',
      help: '一次 held-out eval 加 safety check 多久跑一次，以两次 eval 之间相隔的 step 数计（越小越频繁）。',
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
      help: 'Direct Preference Optimization 直接从 preference pair 训练 policy，去掉了 rollout-generation loop 和在线的 reward model。',
      defaultValue: false,
    },
    {
      id: 'separateRewardModel',
      label: 'Separate reward model',
      help: '把 reward model 放在自己的设备上，而不是和 policy 共置；把 scoring throughput 隔离开。',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'sft-only',
      step: '01',
      title: 'SFT only',
      summary: '在 demonstration 上做 supervised fine-tuning，还没有 reward model 或 RL。',
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
      title: '加一个 reward model',
      summary: '在做任何 RL 之前，先从 preference 比较里训练一个 reward model。',
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
      summary: 'policy 生成 rollout，reward model 给它们打分，KL 把它拽在 reference 附近。',
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
      title: '扩展 rollout generation',
      summary: '大 policy 上每个 step 跑大量 rollout；generation throughput 成了瓶颈。',
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
      title: '规模化的 DPO 路线',
      summary: '砍掉 RL loop：在巨大的 preference 数据集上直接优化一个 frontier policy，配上严格的 eval gate。',
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
    title: 'RLHF pipeline 架构图',
    description:
      'RLHF 后训练 pipeline 的白板式架构图：训练数据、带 preference 数据的 SFT 阶段、一个 reward model、由 rollout generation、policy update 和冻结的 reference model 组成的 RL loop，最后是 eval、一个 model registry 和异步 logging。',
    columns: [
      {
        id: 'data',
        label: '数据 Data',
        variant: 'clients',
        nodes: [
          {
            id: 'demoData',
            title: 'Demonstrations',
            subtitle: 'SFT corpus',
            summary: '人工写的 prompt 和理想回答，用于 supervised fine-tuning',
            kind: 'objectstore',
          },
          {
            id: 'prefData',
            title: 'Preference data',
            subtitle: 'chosen vs rejected',
            summary: '人类比较出来的成对数据，定义哪个回答更好',
            kind: 'objectstore',
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
            subtitle: 'base 到 policy',
            summary: '在 demonstration 上 fine-tune base model，给 policy 打底',
            kind: 'gpu',
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
            subtitle: '拟合 preference',
            summary: '从 preference pair 训练一个 reward model 来给回答打分',
            kind: 'gpu',
          },
          {
            id: 'rewardModel',
            title: 'Reward model',
            subtitle: '给 rollout 打分',
            summary: '在 loop 里为每个生成的 rollout 给出一个标量 reward',
            kind: 'gpu',
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
            summary: 'policy 每个 step 生成大量 completion；通常是瓶颈',
            kind: 'gpu',
          },
          {
            id: 'policyUpdate',
            title: 'Policy update',
            subtitle: 'PPO / DPO',
            summary: '把 policy 推向更高 reward 的 gradient step',
            kind: 'gpu',
          },
          {
            id: 'refModel',
            title: 'Reference model',
            subtitle: 'KL 锚点',
            summary: '冻结的 reference，用 KL divergence 防止 policy 漂移',
            kind: 'gpu',
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
            subtitle: 'safety + 质量',
            summary: '跑 held-out 和 safety eval 来给 checkpoint 把关',
            kind: 'service',
          },
          {
            id: 'registry',
            title: 'Model registry',
            subtitle: '带版本的 checkpoint',
            summary: '存储并管理已晋升的 policy checkpoint 的版本',
            kind: 'objectstore',
          },
          {
            id: 'logStream',
            title: 'Metrics log',
            subtitle: '异步 telemetry',
            summary: '在训练路径之外收集 reward、KL 和 rollout 指标',
            kind: 'stream',
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
    { id: 'rolloutThroughput', label: 'Rollout generation 负载' },
    { id: 'scoringLoad', label: 'Reward + reference scoring' },
    { id: 'policyMemory', label: 'Policy 训练显存' },
    { id: 'klStability', label: 'KL 漂移风险' },
    { id: 'evalCoverage', label: 'Eval / safety 覆盖需求' },
  ],
  decisions: [
    { id: 'sftVsPref', title: 'SFT vs preference data' },
    { id: 'rewardModel', title: 'Reward model vs DPO' },
    { id: 'rolloutScaling', title: 'Rollout-generation throughput' },
    { id: 'distributedPolicy', title: '分布式 policy 训练' },
    { id: 'klControl', title: 'KL / reference 控制' },
    { id: 'evalSafety', title: 'Eval + safety 把关' },
  ],
  sourceBackedRules: [
    {
      title: 'InstructGPT：先 SFT，再 reward model，再用 PPO 对着一个带 KL penalty 的 reference 优化',
      source: 'Ouyang et al., 2022 (InstructGPT)',
      url: 'https://arxiv.org/abs/2203.02155',
      summary:
        '经典的 RLHF 配方：在 demonstration 上 fine-tune，从比较数据训练一个 reward model，再用 PPO 优化 policy，并对 SFT reference 施加 per-token 的 KL penalty。',
    },
    {
      title: 'DPO 去掉了显式的 reward model 和 RL rollout loop',
      source: 'Rafailov et al., 2023 (DPO)',
      url: 'https://arxiv.org/abs/2305.18290',
      summary:
        'Direct Preference Optimization 证明 RLHF 目标可以用 preference pair 上一个简单的 classification loss 来优化，从而省掉了在线采样和单独的 reward model。',
    },
    {
      title: 'PPO 是 RL 阶段用的 clipped policy-gradient 算法',
      source: 'Schulman et al., 2017 (PPO)',
      url: 'https://arxiv.org/abs/1707.06347',
      summary:
        'Proximal Policy Optimization 用一个 clipped objective 对每一批采样出的 trajectory 做几轮优化 epoch，这正是 rollout 会在多个 PPO epoch 间被复用的原因。',
    },
    {
      title: 'Online RLHF 把 generation 和 training 耦合在一起；generation throughput 是主导',
      source: 'vLLM docs',
      url: 'https://docs.vllm.ai/',
      summary:
        '之所以用高吞吐的 batched inference engine 来生成 rollout，是因为在 online RL loop 里，从 policy 采样 completion 才是 throughput 瓶颈。',
    },
  ],
  teachingAssumptions: [
    '单 GPU 的 rollout-generation throughput 和显存预算都是保守的教学数字，不是厂商上限。',
    'reward 和 reference 的 scoring 成本各建模成每个 rollout 一次 inference forward pass；PPO 会把每个 rollout 复用所选的 epoch 数。',
    'KL 漂移风险由 KL coefficient 和 rollout 量近似得出；真实训练还会直接跟踪实测的 KL 和 reward-hacking 信号。',
  ],
  teachingWalkthrough: [
    {
      id: 'sft-step',
      step: '01',
      focus: '从 SFT 起步',
      scenarioId: 'sft-only',
      question:
        '你手上有 demonstration 和一个 base model。在上任何 reward model 或 RL 之前，为什么要先做 supervised fine-tune，而不是直接上 preference optimization？',
      reveal:
        'SFT 给 policy 一个像样的起点，让它已经会遵循指令格式，这样后面的 preference 信号是去打磨行为，而不是从零教起。这一阶段没有 rollout、reward model 或 reference model 参与，就是对单个模型做普通的 supervised 训练。',
      takeaway: 'SFT 给出一个能用的 policy；alignment loop 是去打磨它，而不是从头 bootstrap 它。',
    },
    {
      id: 'rm-step',
      step: '02',
      focus: '训练一个 reward model',
      scenarioId: 'add-reward-model',
      question:
        '你现在有 5 万对人类比较数据。为什么要从它们训练一个单独的 reward model，而不是手写一个 reward function？',
      reveal:
        '人类对整段回答的偏好很难写成规则，所以你拟合一个 reward model，把这些比较泛化成一个标量分数。这里它是离线训练的，但在 RL loop 里它会作为一个 inference service 给每个 rollout 打分，所以它的规模直接吃掉 throughput。',
      takeaway: '一个学出来的 reward model 把稀疏的人类比较变成 RL loop 能优化的 dense 分数。',
    },
    {
      id: 'ppo-step',
      step: '03',
      focus: '闭合 PPO loop',
      scenarioId: 'ppo-loop',
      question:
        '现在 policy 生成 rollout、reward model 给它们打分、PPO 更新 policy。在 KL 偏低、每个 batch 四个 PPO epoch 的情况下，会冒出哪些 SFT 从来没有过的新失败模式？',
      reveal:
        '现在同时有三个模型在线（policy、reward model、reference），而且 loop 是在线的。两个风险随之出现：当 KL penalty 太弱、拽不住 policy 靠近 reference 时会出现 reward hacking；以及每个 rollout 都既要生成又要打分，于是 generation throughput 开始卡住 step time。',
      takeaway: 'RL loop 把 generation、scoring、training 耦合在一起；KL 是那根让 reward optimization 不跑偏的牵绳。',
    },
    {
      id: 'scale-step',
      step: '04',
      focus: 'Rollout 成为主导',
      scenarioId: 'scale-rollouts',
      question:
        '一个 70B policy 上每个 step 跑 2,048 个 rollout。loop 里哪一部分最先打满，你要扩展什么来修它？',
      reveal:
        'rollout generation 最先打满：从一个 70B policy 采样几千个 completion，远比 gradient step 贵。你用 batched、distributed inference 来扩展 generation（而 policy 本身也需要 tensor/pipeline parallelism 才能装下并训练），通常放在和 trainer 分开的专用 inference replica 上。',
      takeaway: '在 online RLHF 里，generation throughput 是瓶颈，所以你要优先扩展 rollout inference。',
    },
    {
      id: 'dpo-step',
      step: '05',
      focus: 'DPO 砍掉 loop',
      scenarioId: 'dpo-at-scale',
      question:
        '一个 frontier 规模的 policy，配 500 万对 preference pair。如果 rollout generation 是瓶颈，换成 DPO 能换来什么，又要放弃什么？',
      reveal:
        'DPO 用一个 classification 式的 loss 直接从 preference pair 优化 policy，所以 loop 里没有 rollout generation、没有在线的 reward model、也不用单独 serve reference，把那个主导成本拿掉了。代价是放弃了在线探索的灵活性和一个显式的 reward 信号，转而更依赖数据集质量和严格的 eval gate。',
      takeaway: 'DPO 用一个更简单、上限由 preference 数据质量决定的离线目标，换掉了昂贵的 online RL loop。',
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
            ? `无 rollout loop（${formatCount(rolloutsPerStep)} rollouts/step 闲置）`
            : '无 rollout loop',
        copy: hasRlLoop
          ? `每个 step 从一个 ${formatCount(policyParams)} 参数的 policy 生成 ${formatCount(rolloutsPerStep)} 个 rollout（约 ${formatRate(
              rolloutTokensPerStep,
            )} token）；这通常会卡住 step time。`
          : useDpo
            ? `DPO 去掉了在线的 rollout loop，所以 ${formatCount(rolloutsPerStep)} rollouts/step 这个设置是失效的 —— 每个 step 没有在线 generation 成本。`
            : '还没有 online RL loop —— generation 要等 PPO rollout 规模化跑起来才开始。',
      },
      scoringLoad: {
        ratio: scoringRatio,
        valueText: hasRlLoop
          ? `${formatCount(scoringPasses)} passes/step`
          : useDpo
            ? `${formatCount(preferencePairs)} 对直接用（${formatCount(rewardModelParams)} RM${separateRewardModel ? '，隔离' : '，共置'}闲置）`
            : '无在线 scoring',
        copy: hasRlLoop
          ? `每个 rollout 都需要一次 reward-model 和一次 reference 的 forward pass；一个 ${formatCount(
              rewardModelParams,
            )} 参数的 reward model${separateRewardModel ? '（在自己的设备上）' : '（和 policy 共置）'}承担这份 scoring 负载。`
          : useDpo
            ? `DPO 下没有 reward model 在 loop 里跑；${formatCount(rewardModelParams)} 参数的 reward model${separateRewardModel ? '（在自己的设备上）' : '（共置）'}这个设置是失效的，因为 preference pair 被直接消费了。`
            : needsRewardModel
              ? '这里 reward model 是离线训练的；在线 scoring 负载要等 RL loop 跑起来才出现。'
              : '还没有 reward model —— pipeline 仍然只是 supervised fine-tuning。',
      },
      policyMemory: {
        ratio: policyMemoryRatio,
        valueText: `${formatCount(policyParams)} params，${modelsResident} 个 model`,
        copy: useDpo
          ? `DPO 只让 ${modelsResident} 个 model 常驻（policy，加一个隐式的 reference 项），而不是 PPO 的 2-3 个，但一个 ${formatCount(policyParams)} 参数的 policy 绝对体量上仍然很大，必须 shard 才能装下并训练。`
          : hasRlLoop
            ? `PPO 在 loop 里同时持有 ${modelsResident} 个大模型，每个 batch 跨 ${Math.round(ppoEpochs)} 个 epoch。`
            : `目前只在训练单个 ${formatCount(policyParams)} 参数的模型；RL loop 会再加上 reward 和 reference 模型。`,
      },
      klStability: {
        ratio: klStabilityRatio,
        valueText: hasRlLoop
          ? `KL coef ${klCoefficient.toFixed(3)}`
          : useDpo
            ? `隐式 beta ${klCoefficient.toFixed(3)}`
            : '无在线 KL',
        copy: hasRlLoop
          ? klStabilityRatio > 0.7
            ? '对 reference 的 KL penalty 偏弱，随着 rollout 量增长会招来 reward hacking。'
            : 'KL penalty 把 policy 拽得离 reference 足够近，让 reward optimization 不跑偏。'
          : useDpo
            ? `DPO 把 reference 作为一个隐式 beta 烤进了它的 loss（这里由 ${klCoefficient.toFixed(3)} 这个系数设定），所以没有单独的在线 KL 项要在 loop 里调。`
            : '还没有 online RL loop，所以没有 reference KL penalty 要管理。',
      },
      evalCoverage: {
        ratio: evalRiskRatio,
        valueText: `每 ${formatCount(evalFrequency)} 个 step`,
        copy:
          evalRiskRatio > 0.7
            ? `一个 ${formatCount(policyParams)} 参数的 policy${useDpo ? '（由 DPO 优化）' : hasRlLoop ? '（处在 online RL loop 中）' : ''}需要很重的 eval 覆盖；每 ${formatCount(evalFrequency)} 个 step eval 一次仍留有缺口 —— 更频繁地给 checkpoint 把关。`
            : `这个规模下的 eval 需求被轻松满足：每 ${formatCount(evalFrequency)} 个 step 把关一次，能在晋升前抓住回退。`,
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
      text: `DPO 直接从 ${formatCount(
        analysis.preferencePairs,
      )} 对 preference pair 优化 policy，把 rollout generation 和在线的 reward model 整个去掉了。`,
    });
  } else if (analysis.hasRlLoop) {
    priority.push({
      severity: 'ok',
      text: `PPO 跑一个在线 loop：policy 每个 step 生成 ${formatCount(
        analysis.rolloutsPerStep,
      )} 个 rollout，由 reward model 打分、被一个冻结的 reference 锚住。`,
    });
  } else if (analysis.needsRewardModel) {
    priority.push({
      severity: 'ok',
      text: `正在从 ${formatCount(
        analysis.preferencePairs,
      )} 对 preference pair 训练一个 reward model；online RL loop 还没开始。`,
    });
  } else {
    priority.push({
      severity: 'ok',
      text: '只有 supervised fine-tuning：还没有 preference 数据、reward model 或 RL loop 参与。',
    });
  }

  // --- scale warnings/dangers (kept ahead of the slice) ---
  if (analysis.needsRolloutScaling) {
    priority.push({
      severity: analysis.rolloutThroughputRatio > 2 ? 'danger' : 'warning',
      text: `每个 step 从一个 ${formatCount(
        analysis.policyParams,
      )} 参数的 policy 生成 ${formatCount(
        analysis.rolloutsPerStep,
      )} 个 rollout，主导了 step time；用 batched、distributed inference 扩展 rollout generation。`,
    });
  }
  if (analysis.needsKlControl) {
    priority.push({
      severity: 'danger',
      text: `${analysis.klCoefficient.toFixed(
        3,
      )} 的 KL coefficient 对这个 rollout 量来说太弱了；policy 可能 reward-hack 漂离 reference。`,
    });
  }
  if (analysis.needsDistributedPolicy) {
    priority.push({
      severity: 'warning',
      text: `一个 ${formatCount(
        analysis.policyParams,
      )} 参数的 policy 必须用 tensor/pipeline parallelism 做 shard，才能跨 GPU 装下并训练。`,
    });
  }
  if (analysis.needsTightEval) {
    priority.push({
      severity: 'warning',
      text: `一个 ${formatCount(
        analysis.policyParams,
      )} 参数的 policy 需要很重的 eval 覆盖；每 ${formatCount(
        analysis.evalFrequency,
      )} 个 step 才 eval 一次仍留有缺口 —— 晋升前收紧 safety gate。`,
    });
  }
  if (analysis.hasRlLoop) {
    priority.push({
      severity: analysis.rewardModelParams > comfortableRewardModelParams ? 'warning' : 'ok',
      text: `一个 ${formatCount(
        analysis.rewardModelParams,
      )} 参数的 reward model${analysis.separateRewardModel ? '在专用设备上' : '和 policy 共置'}给每个 rollout 打分；它的规模是每个 step 成本的一部分。`,
    });
  }

  // --- always-applicable context so every scenario clears the 4-reason floor ---
  context.push({
    severity: 'ok',
    text: '先在 demonstration 上做 SFT，给出一个像样的 policy；preference 信号随后去打磨这个 policy，而不是从零教它。',
  });
  if (analysis.usesPreferenceData) {
    context.push({
      severity: 'ok',
      text: analysis.useDpo
        ? `DPO 下 ${formatCount(
            analysis.preferencePairs,
          )} 对 preference pair 是唯一的训练信号，所以数据质量和覆盖面决定了结果的上限。`
        : `${formatCount(
            analysis.preferencePairs,
          )} 组 preference 比较训练出 RL loop 要对着优化的那个 reward model。`,
    });
  } else {
    context.push({
      severity: 'ok',
      text: '还没收集任何 preference 比较，所以 pipeline 既训练不了 reward model，也跑不了 preference optimization。',
    });
  }
  context.push({
    severity: 'ok',
    text: analysis.useDpo
      ? `DPO 只让一个 model 常驻，而不是 PPO 的两到三个，缓解了模型数量，尽管一个 ${formatCount(
          analysis.policyParams,
        )} 参数的 policy 在绝对显存上仍然很大。`
      : analysis.hasRlLoop
        ? `在线 loop 同时持有 policy、reward model 和冻结的 reference，每个 batch 跨 ${Math.round(
            analysis.ppoEpochs,
          )} 个 PPO epoch。`
        : `目前只有单个 ${formatCount(
            analysis.policyParams,
          )} 参数的模型常驻；RL loop 会再加上 reward 和 reference 模型。`,
  });
  if (!analysis.useDpo && analysis.ppoEpochs > 1) {
    context.push({
      severity: 'ok',
      text: `PPO 把每一批 rollout 复用 ${Math.round(
        analysis.ppoEpochs,
      )} 个优化 epoch，摊薄那个昂贵的 generation step。`,
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
        ? `SFT 在 demonstration 上给 policy 打底；${formatCount(
            flags.preferencePairs,
          )} 对 preference pair 随后驱动${flags.useDpo ? '直接的 DPO' : ' reward model'}。`
        : '目前只有 supervised fine-tuning；preference 数据还没收集或使用。',
    },
    rewardModel: {
      state: flags.useDpo ? 'tradeoff' : flags.needsRewardModel ? 'needed' : 'not-yet',
      copy: flags.useDpo
        ? 'DPO 去掉显式的 reward model，用一个更简单的离线目标换掉在线的灵活性。'
        : flags.needsRewardModel
          ? `训练并 serve 一个 ${formatCount(
              flags.rewardModelParams,
            )} 参数的 reward model，在 PPO loop 里给 rollout 打分。`
          : '还没有 reward model；pipeline 止步于 supervised fine-tuning。',
    },
    rolloutScaling: {
      state: !flags.hasRlLoop ? 'not-yet' : flags.needsRolloutScaling ? 'needed' : 'useful',
      copy: !flags.hasRlLoop
        ? flags.useDpo
          ? 'DPO 没有 rollout loop，所以 generation 这一侧没什么可扩展的。'
          : '还没有 online RL loop，所以没有 rollout generation 要扩展。'
        : flags.needsRolloutScaling
          ? `每个 step 生成 ${formatCount(
              flags.rolloutsPerStep,
            )} 个 rollout 是瓶颈；用 batched、distributed 的 inference replica。`
          : 'rollout 量还算适中，一个 generation worker 就跟得上。',
    },
    distributedPolicy: {
      state: flags.needsDistributedPolicy ? 'needed' : 'not-yet',
      copy: flags.needsDistributedPolicy
        ? `一个 ${formatCount(
            flags.policyParams,
          )} 参数的 policy 需要 tensor/pipeline parallelism 才能跨设备装下并更新。`
        : 'policy 装得进单个 accelerator，所以暂时不需要 model sharding。',
    },
    klControl: {
      state: !flags.hasRlLoop ? 'not-yet' : flags.needsKlControl ? 'needed' : 'useful',
      copy: !flags.hasRlLoop
        ? flags.useDpo
          ? 'DPO 把 reference 折进它的 loss，所以没有单独的在线 KL 项要管理。'
          : '还没有 online RL loop，所以 KL / reference 约束没有启用。'
        : flags.needsKlControl
          ? `调高 KL coefficient（现在是 ${flags.klCoefficient.toFixed(
              3,
            )}），把 policy 拽在 reference 附近、防止 reward hacking。`
          : '对冻结 reference 的 KL penalty 正把 policy 守在一个安全区域里。',
    },
    evalSafety: {
      state: flags.needsTightEval ? 'needed' : 'useful',
      copy: flags.needsTightEval
        ? `每 ${formatCount(
            flags.evalFrequency,
          )} 个 step eval 一次在这里太稀了；更频繁地用 held-out 和 safety eval 给 checkpoint 把关。`
        : 'eval 和 safety check 跑得够勤，能在 checkpoint 晋升前抓住回退。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (flags.useDpo) {
    return 'DPO：direct preference optimization，无 RL loop';
  }
  if (!flags.needsRewardModel) {
    return 'SFT only';
  }
  if (!flags.hasRlLoop) {
    return 'SFT + reward model（RL loop 未启动）';
  }
  if (flags.needsRolloutScaling || flags.needsDistributedPolicy) {
    return '带扩展、分布式 rollout generation 的 PPO';
  }
  return '带 reward + reference 模型的 PPO RLHF loop';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (flags.useDpo) {
    return 'policy 用一个 classification 式的 loss 直接从 preference pair 优化；loop 里没有 rollout generation、没有在线 reward model、也不用单独 serve reference。';
  }
  if (!flags.needsRewardModel) {
    return '只在 demonstration 上做 supervised fine-tuning。还不需要 reward model、rollout loop 或 reference model。';
  }
  if (!flags.hasRlLoop) {
    return '从 preference 比较离线训练出一个 reward model，但在线的 PPO rollout loop 还没开始；这一阶段仍是普通的 supervised 式训练。';
  }
  if (flags.needsRolloutScaling || flags.needsDistributedPolicy) {
    return '一个 shard 过的 policy 在 distributed inference replica 上生成 rollout，一个 reward model 给它们打分，一个带 KL penalty 的 reference 让 PPO 更新不跑偏；generation throughput 是主导成本。';
  }
  return 'policy 生成 rollout，一个 reward model 给每个打分，PPO 在对冻结 reference model 的 KL penalty 约束下更新 policy。';
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
