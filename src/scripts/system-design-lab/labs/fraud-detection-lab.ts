import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatRate } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative single-node teaching budgets (not vendor limits).
const comfortableScoringQpsPerNode = 5_000;
const comfortableFeatureLookupsPerSecond = 30_000;
const comfortableStreamStateEntries = 50_000_000;
const comfortableGraphEntities = 5_000_000;

export const fraudDetectionLabDefinition: SystemDesignLabDefinition = {
  id: 'fraud-detection',
  eyebrow: '系统设计 Lab',
  title:
    '实时 fraud detection 就是把 streaming features 和一个 model 裹进一个很紧的 synchronous latency 预算里。',
  summary:
    '调节交易速率、decision latency 预算、feature window、model inference 时间、追踪的 entity 数，以及 feedback 延迟。架构会从 static rules，演进到 batch ML scoring，再到带 synchronous scoring 的 streaming features，再到带 retraining 的 feedback loop，最终到大规模的 graph features。',
  controls: [
    {
      id: 'transactionsPerSecond',
      label: '交易速率',
      help: '到达 scoring 路径的交易；每一笔都需要一个 allow/deny/review 决策。',
      min: 10,
      max: 2_000_000,
      defaultValue: 5_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'decisionLatencyMs',
      label: 'Decision latency 目标',
      help: '在交易被卡住之前返回决策的端到端预算。',
      min: 5,
      max: 2_000,
      defaultValue: 200,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'featureWindowSeconds',
      label: 'Feature window',
      help: 'velocity 计数和聚合的回看窗口（比如最近 N 秒的消费额）。',
      min: 1,
      max: 604_800,
      defaultValue: 3_600,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'modelLatencyMs',
      label: 'Model latency',
      help: 'scoring model 在 decision 预算内每笔交易花的时间。',
      min: 1,
      max: 1_000,
      defaultValue: 30,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'entitiesTracked',
      label: '追踪的 entity 数',
      help: '带实时聚合状态的 distinct 卡、账户、设备和商户。',
      min: 10_000,
      max: 5_000_000_000,
      defaultValue: 5_000_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'feedbackDelaySeconds',
      label: 'Label feedback 延迟',
      help: '确认欺诈的 label（chargeback、争议）回流来 retrain 之前的延迟。',
      min: 60,
      max: 7_776_000,
      defaultValue: 86_400,
      scale: 'log',
      format: 'duration-seconds',
    },
  ],
  toggles: [
    {
      id: 'streamingAggregations',
      label: 'Streaming aggregations',
      help: '在 stream processor 里维护 velocity 计数，而不是每个请求都重算。',
      defaultValue: true,
    },
    {
      id: 'graphFeatures',
      label: 'Graph features',
      help: '把 entity（共享的设备、卡、地址）连起来，抓出有组织的 fraud ring。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'static-rules',
      step: '01',
      title: 'Static rule engine',
      summary: '在稀稀拉拉的交易上跑几条 hard rule。',
      values: {
        transactionsPerSecond: 50,
        decisionLatencyMs: 500,
        featureWindowSeconds: 60,
        modelLatencyMs: 5,
        entitiesTracked: 50_000,
        feedbackDelaySeconds: 604_800,
        streamingAggregations: false,
        graphFeatures: false,
      },
    },
    {
      id: 'batch-scoring',
      step: '02',
      title: 'Batch ML scoring',
      summary: '一个 model 给交易打分，但 feature 是 batch 算出来的。',
      values: {
        transactionsPerSecond: 800,
        decisionLatencyMs: 1_000,
        featureWindowSeconds: 86_400,
        modelLatencyMs: 60,
        entitiesTracked: 2_000_000,
        feedbackDelaySeconds: 259_200,
        streamingAggregations: false,
        graphFeatures: false,
      },
    },
    {
      id: 'realtime-streaming',
      step: '03',
      title: '实时 streaming features',
      summary: 'stream 里的 velocity 计数在很紧的预算下喂给一次 synchronous 打分。',
      values: {
        transactionsPerSecond: 6_000,
        decisionLatencyMs: 150,
        featureWindowSeconds: 3_600,
        modelLatencyMs: 30,
        entitiesTracked: 10_000_000,
        feedbackDelaySeconds: 172_800,
        streamingAggregations: true,
        graphFeatures: false,
      },
    },
    {
      id: 'feedback-loop',
      step: '04',
      title: 'Feedback loop + retraining',
      summary: '确认的 label 回流，针对漂移的 fraud 模式做 retrain。',
      values: {
        transactionsPerSecond: 120_000,
        decisionLatencyMs: 80,
        featureWindowSeconds: 86_400,
        modelLatencyMs: 25,
        entitiesTracked: 500_000_000,
        feedbackDelaySeconds: 21_600,
        streamingAggregations: true,
        graphFeatures: false,
      },
    },
    {
      id: 'graph-at-scale',
      step: '05',
      title: '大规模 graph features',
      summary: 'entity linking 抓出 ring，同时决策守在 25 ms 以内的预算。',
      values: {
        transactionsPerSecond: 1_000_000,
        decisionLatencyMs: 25,
        featureWindowSeconds: 86_400,
        modelLatencyMs: 12,
        entitiesTracked: 3_000_000_000,
        feedbackDelaySeconds: 3_600,
        streamingAggregations: true,
        graphFeatures: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: '实时 fraud detection 架构图',
    description:
      '实时 fraud detection 的白板式架构图：客户端、一个 synchronous scoring API、带 feature store 的 stream processor、一个 model 与 rules engine 加上可选的 graph store，以及一条异步的 label-feedback 与 retraining pipeline。',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Payment client',
            subtitle: '授权 txn',
            summary: '提交每一笔交易，等一个 allow、deny 或 review 决策',
            kind: 'client',
          },
        ],
      },
      {
        id: 'scoring',
        label: 'Scoring API',
        variant: 'edge',
        nodes: [
          {
            id: 'scoringApi',
            title: 'Scoring API',
            subtitle: 'sync 决策',
            summary: '在 latency 预算内编排这次 synchronous 决策',
            kind: 'api',
          },
          {
            id: 'decisionGate',
            title: 'Decision gate',
            subtitle: 'allow / deny / review',
            summary: '执行 fail-open 或 fail-closed 策略，返回最终裁决',
            kind: 'service',
          },
        ],
      },
      {
        id: 'features',
        label: 'Real-time features',
        variant: 'backbone',
        nodes: [
          {
            id: 'streamProcessor',
            title: 'Stream processor',
            subtitle: 'velocity 聚合',
            summary: '从 event stream 维护按窗口的 velocity 计数和聚合',
            kind: 'compute',
          },
          {
            id: 'featureStore',
            title: 'Feature store',
            subtitle: '快速 lookup',
            summary: '低延迟地把预算好的 per-entity feature 提供给 scorer',
            kind: 'cache',
          },
        ],
      },
      {
        id: 'model',
        label: 'Model + rules',
        variant: 'processing',
        nodes: [
          {
            id: 'rulesEngine',
            title: 'Rules engine',
            subtitle: 'hard rule',
            summary: '在 model 之前或并行地评估确定性 rule 和 hard block',
            kind: 'service',
          },
          {
            id: 'modelService',
            title: 'Model service',
            subtitle: 'risk score',
            summary: '返回一个欺诈概率，gate 把它和 rule 的裁决合并',
            kind: 'gpu',
          },
          {
            id: 'graphStore',
            title: 'Graph store',
            subtitle: 'entity linking',
            summary: '把共享的卡、设备和地址连起来，暴露有组织的 ring',
            kind: 'db',
          },
        ],
      },
      {
        id: 'feedback',
        label: 'Feedback + retrain',
        variant: 'storage',
        nodes: [
          {
            id: 'labelStore',
            title: 'Label store',
            subtitle: '确认的结果',
            summary: '把 chargeback 和争议结果收集为 ground-truth label',
            kind: 'db',
          },
          {
            id: 'trainingPipeline',
            title: 'Training pipeline',
            subtitle: 'retrain + 部署',
            summary: '用新 label 做 retrain 以跟上漂移的 fraud 模式，并发布新 model',
            kind: 'compute',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'scoringApi', variant: 'primary' },
      { from: 'scoringApi', to: 'decisionGate', variant: 'primary' },
      { from: 'scoringApi', to: 'featureStore', variant: 'primary' },
      { from: 'scoringApi', to: 'rulesEngine', variant: 'primary' },
      { from: 'scoringApi', to: 'modelService', variant: 'secondary' },
      { from: 'streamProcessor', to: 'featureStore', variant: 'secondary' },
      { from: 'modelService', to: 'graphStore', variant: 'secondary' },
      { from: 'scoringApi', to: 'labelStore', variant: 'direct' },
      { from: 'labelStore', to: 'trainingPipeline', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'scoringLoad', label: 'Scoring 路径负载' },
    { id: 'latencyBudget', label: 'Decision 预算余量' },
    { id: 'streamState', label: 'Stream state 体量' },
    { id: 'graphLoad', label: 'Graph linking 负载' },
    { id: 'modelFreshness', label: 'Model drift 风险' },
  ],
  decisions: [
    { id: 'streamingFeatures', title: '实时 feature 计算' },
    { id: 'scoringBudget', title: 'Synchronous scoring 预算' },
    { id: 'hybrid', title: 'Rules + model 混合' },
    { id: 'graph', title: 'Graph features' },
    { id: 'feedbackLoop', title: 'Feedback loop / retraining' },
    { id: 'failPolicy', title: 'Fail-open vs fail-closed' },
  ],
  sourceBackedRules: [
    {
      title: '有状态的 stream processing 实时维护按窗口的聚合',
      source: 'Apache Flink Docs',
      url: 'https://nightlies.apache.org/flink/flink-docs-stable/',
      summary:
        'Flink 为每个 entity 保留 keyed state 和窗口，于是 velocity 计数和聚合持续更新，而不是每个请求都重算。',
    },
    {
      title: '一个持久、可重放的 log 支撑 feature 和 feedback 这两条 stream',
      source: 'Apache Kafka Docs',
      url: 'https://kafka.apache.org/documentation/',
      summary:
        'Kafka 给交易和 label 两条 stream 提供了有序、可重放的骨干，正是它让 feature 能被重算、model 能从历史 retrain。',
    },
    {
      title: '一个 feature store 把同一套 feature 既低延迟地 online 服务，又 offline 供 training',
      source: 'Feast Docs',
      url: 'https://docs.feast.dev/',
      summary:
        'feature store 解决 online/offline skew：synchronous scorer 快速读到新鲜 feature，而 training 读到一致的历史值。',
    },
    {
      title: 'Fraud detection 是一个带 drift 的 anomaly / novelty-detection 问题',
      source: 'scikit-learn',
      url: 'https://scikit-learn.org/stable/modules/outlier_detection.html',
      summary:
        '欺诈很罕见、模式还随时间漂移，所以检测被框定为 outlier/novelty detection，需要新鲜 label 和频繁 retraining，而不是一个静态 model。',
    },
  ],
  teachingAssumptions: [
    'decision 预算被拆给 feature lookup、model inference 和 rules；剩余余量就是扣掉 model latency 之后还剩的部分。',
    '单节点的 scoring、feature-lookup 和 stream-state 预算都是保守的教学数字，不是厂商上限。',
    'graph linking 成本被建模为随追踪的 entity 数和交易速率一起增长；真实系统会把其中大部分 offline 预算好。',
  ],
  teachingWalkthrough: [
    {
      id: 'rules-only',
      step: '01',
      focus: '几条 hard rule',
      scenarioId: 'static-rules',
      question:
        '在 50 交易/s、500 ms 预算下，你真的需要 model、stream processor 或 feature store 吗？',
      reveal:
        '不需要。一台机器上几条确定性 rule（「新设备且金额 > X 就 deny」）就能抓住明显的情况。流量这么小、预算又宽松时，streaming 基础设施和 ML model 纯属累赘——而且 rule 对欺诈分析师仍然可解释。',
      takeaway: '从可解释的 static rule 起步；只有当 rule 抓不住足够多时才上 ML。',
    },
    {
      id: 'add-model',
      step: '02',
      focus: '加一个 ML model',
      scenarioId: 'batch-scoring',
      question:
        '你加了一个 model，但它的 feature 是每晚 batch 算的。为什么这会漏掉快速移动的欺诈？',
      reveal:
        'batch feature 滞后好几个小时。一张卡在一分钟里被试了十笔小额扣款，在昨晚算出来的 feature 看来一切正常。velocity 是最强的信号，所以你需要在最近窗口上的聚合——而 batch 在交易路径上给不了。',
      takeaway: '陈旧的 feature 让你看不见 velocity；最近窗口的聚合才是核心 fraud 信号。',
    },
    {
      id: 'go-realtime',
      step: '03',
      focus: 'Streaming + sync 打分',
      scenarioId: 'realtime-streaming',
      question:
        '现在 6k txn/s、150 ms 预算。你在哪里算 velocity 计数，又有什么必须留在预算之内？',
      reveal:
        '一个 stream processor 持续维护 per-entity 的窗口计数，并写进一个快速的 feature store。请求来时 scorer 读 feature 并 synchronous 跑 model——feature lookup 加 model inference 必须都塞进预算，所以 model 要保持小、store 放在内存里。',
      takeaway: '在 stream 里异步算 feature；请求上只做一次快速 lookup 加一次有上界的 model 调用。',
    },
    {
      id: 'feedback',
      step: '04',
      focus: '闭合这个 loop',
      scenarioId: 'feedback-loop',
      question:
        '骗子几天内就会变招。如果 label 6 小时后才到，你要搭什么让 model 跟得上？',
      reveal:
        '一个 feedback loop：确认的结果（chargeback、争议处理结果）落进 label store，一个 training pipeline 定期 retrain。label feedback 越快，你就能越早针对 drift 做 retrain。可重放的 stream 让你能为那些历史交易一致地重建 feature。',
      takeaway: '欺诈会漂移，所以 label-feedback loop 和定期 retraining 是系统的一部分，而不是事后补丁。',
    },
    {
      id: 'graph',
      step: '05',
      focus: '把 entity 连起来',
      scenarioId: 'graph-at-scale',
      question:
        '单笔交易看着都干净，但一个 ring 用一台设备跨很多张卡。你怎么在 25 ms 预算内抓到它？',
      reveal:
        'graph features 把 entity（共享的设备、卡、地址）连起来，于是哪怕每笔交易单看都正常，一个 ring 也会亮起来。昂贵的 linking 在 offline 预算好，connected-component 信号被推进 feature store，所以 synchronous 路径在紧预算下仍然只做一次快速 lookup。',
      takeaway: 'graph features 暴露有组织的 ring；把 linking offline 预算好，hot path 才能保持快。',
    },
  ],
  analyze: analyzeFraudDetectionWorkload,
};

function analyzeFraudDetectionWorkload(workload: WorkloadValues): LabAnalysis {
  const transactionsPerSecond = numericValue(workload, 'transactionsPerSecond');
  const decisionLatencyMs = numericValue(workload, 'decisionLatencyMs');
  const featureWindowSeconds = numericValue(workload, 'featureWindowSeconds');
  const modelLatencyMs = numericValue(workload, 'modelLatencyMs');
  const entitiesTracked = numericValue(workload, 'entitiesTracked');
  const feedbackDelaySeconds = numericValue(workload, 'feedbackDelaySeconds');
  const streamingAggregations = Boolean(workload.streamingAggregations);
  const graphFeatures = Boolean(workload.graphFeatures);

  // Streaming features are warranted once velocity must be maintained at rate:
  // the toggle is on, or traffic is high enough that recomputing per request is costly.
  const needsStreaming =
    streamingAggregations ||
    transactionsPerSecond > 1_000 ||
    (featureWindowSeconds <= 600 && transactionsPerSecond > 200);
  // A trained model is warranted past trivial scale or once features are real-time.
  const needsModel = needsStreaming || transactionsPerSecond > 500;
  // A tight budget forces synchronous, in-budget scoring.
  const tightBudget = decisionLatencyMs <= 250;
  // Feedback/retraining is wired once the real-time path exists and labels return
  // inside a few days, fast enough that retraining can chase drift.
  const needsFeedback = needsStreaming && feedbackDelaySeconds <= 86_400;
  // Graph features feed the model with link signals, so they only come online
  // once a model is in the loop; the graph flow originates from the model service.
  const needsGraph = graphFeatures && needsModel;
  // Fail-closed is risky under a tight synchronous budget at high volume.
  const failClosed = !tightBudget || transactionsPerSecond <= 1_000;

  const featureLookupsPerSecond = transactionsPerSecond * (needsStreaming ? 1 : 0.2);
  // When real-time velocity is required but streaming aggregations are turned off,
  // the scoring node must recompute windowed aggregates inline on every request,
  // which inflates the scoring-path cost. Keeping the toggle on (or low traffic)
  // pushes that work off the hot path.
  const recomputesInline = needsStreaming && !streamingAggregations;
  const scoringWorkMultiplier = recomputesInline ? 2.5 : 1;
  const effectiveScoringPerSecond = transactionsPerSecond * scoringWorkMultiplier;
  const budgetRemainingMs = decisionLatencyMs - modelLatencyMs;
  // Stream state grows with entities and how long the window must be retained.
  const streamStateEntries =
    entitiesTracked * Math.min(4, 1 + Math.log10(Math.max(featureWindowSeconds, 1)) / 2);
  const graphPressure = needsGraph
    ? Math.max(entitiesTracked / comfortableGraphEntities, transactionsPerSecond / 200_000)
    : 0;
  // Model freshness pressure: faster-arriving labels relieve drift risk; slow labels worsen it.
  const freshnessPressure = needsModel ? feedbackDelaySeconds / 172_800 : 0;

  const flags = {
    needsStreaming,
    needsModel,
    tightBudget,
    needsFeedback,
    needsGraph,
    failClosed,
    streamingAggregations,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      scoringApi: effectiveScoringPerSecond > comfortableScoringQpsPerNode ? 'warning' : 'ok',
      decisionGate: 'ok',
      streamProcessor: needsStreaming ? 'needed' : 'inactive',
      featureStore: needsStreaming ? 'needed' : 'inactive',
      rulesEngine: 'ok',
      modelService: needsModel
        ? budgetRemainingMs < 0
          ? 'overloaded'
          : 'needed'
        : 'inactive',
      graphStore: needsGraph ? 'needed' : 'inactive',
      labelStore: needsFeedback ? 'needed' : 'inactive',
      trainingPipeline: needsFeedback ? 'needed' : 'inactive',
    },
    flowStates: {
      clientToScoringApi: 'active',
      scoringApiToDecisionGate: 'active',
      scoringApiToFeatureStore: needsStreaming ? 'active' : 'inactive',
      scoringApiToRulesEngine: 'active',
      scoringApiToModelService: needsModel ? (budgetRemainingMs < 0 ? 'warning' : 'active') : 'inactive',
      streamProcessorToFeatureStore: needsStreaming ? 'active' : 'inactive',
      modelServiceToGraphStore: needsGraph ? 'active' : 'inactive',
      scoringApiToLabelStore: needsFeedback ? 'active' : 'inactive',
      labelStoreToTrainingPipeline: needsFeedback ? 'active' : 'inactive',
    },
    meters: {
      scoringLoad: {
        ratio: effectiveScoringPerSecond / comfortableScoringQpsPerNode,
        valueText: `${formatRate(transactionsPerSecond)}/s`,
        copy: recomputesInline
          ? '在请求里 inline 重算 velocity 聚合（streaming aggregations 关着）会成倍放大 scoring 路径的成本；打开 streaming 把它挪出 hot path。'
          : effectiveScoringPerSecond > comfortableScoringQpsPerNode
            ? 'scoring 路径必须跨节点 shard 才扛得住这个交易速率。'
            : '一个 scoring 节点就能从容处理这个交易速率。',
      },
      latencyBudget: {
        ratio: budgetRemainingMs <= 0 ? 2 : modelLatencyMs / decisionLatencyMs,
        valueText:
          budgetRemainingMs <= 0
            ? `超了 ${formatCount(-budgetRemainingMs)} ms`
            : `还剩 ${formatCount(budgetRemainingMs)} ms`,
        copy:
          budgetRemainingMs <= 0
            ? `光是 model latency（${formatCount(modelLatencyMs)} ms）就撑爆了 ${formatCount(
                decisionLatencyMs,
              )} ms 预算；model 得更小，或者把 feature 缓存起来。`
            : `model 占掉 ${formatCount(decisionLatencyMs)} ms 预算里的 ${formatCount(
                modelLatencyMs,
              )} ms，给 feature lookup 和 rules 留出了空间。`,
      },
      streamState: {
        ratio: needsStreaming ? streamStateEntries / comfortableStreamStateEntries : 0,
        valueText: needsStreaming ? `${formatCount(streamStateEntries)} 个 key` : '无 stream state',
        copy: needsStreaming
          ? `${formatCount(entitiesTracked)} 个 entity 在一个 ${formatWindow(
              featureWindowSeconds,
            )} 窗口里，在 stream processor 中保留 keyed state。`
          : '没有 streaming aggregations，就没有 keyed 窗口状态要保留。',
      },
      graphLoad: {
        ratio: graphPressure,
        valueText: needsGraph ? `连接 ${formatCount(entitiesTracked)} 个` : 'graph 关闭',
        copy: needsGraph
          ? '跨卡、设备和地址的 entity linking 必须 offline 预算好，才能不落在 hot path 上。'
          : 'graph features 关着，所以还不存在 entity-linking 的工作负载。',
      },
      modelFreshness: {
        ratio: freshnessPressure,
        valueText: needsModel ? `label 在 ${formatWindow(feedbackDelaySeconds)} 内回流` : '无 model',
        copy: needsModel
          ? feedbackDelaySeconds > 172_800
            ? `label 滞后 ${formatWindow(
                feedbackDelaySeconds,
              )}；model 还没来得及用确认的欺诈 retrain 就已经 drift 了。`
            : `label 在 ${formatWindow(feedbackDelaySeconds)} 内回来，快到足以针对 drift 做 retrain。`
          : '还没有 model，所以没什么可 retrain 的。',
      },
    },
    decisions: buildDecisions({
      ...flags,
      transactionsPerSecond,
      decisionLatencyMs,
      modelLatencyMs,
      budgetRemainingMs,
      feedbackDelaySeconds,
      entitiesTracked,
    }),
    reasons: buildReasons({
      ...flags,
      transactionsPerSecond,
      decisionLatencyMs,
      modelLatencyMs,
      budgetRemainingMs,
      featureWindowSeconds,
      entitiesTracked,
      feedbackDelaySeconds,
      featureLookupsPerSecond,
    }),
  };
}

type ArchitectureFlags = {
  needsStreaming: boolean;
  needsModel: boolean;
  tightBudget: boolean;
  needsFeedback: boolean;
  needsGraph: boolean;
  failClosed: boolean;
  streamingAggregations: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    transactionsPerSecond: number;
    decisionLatencyMs: number;
    modelLatencyMs: number;
    budgetRemainingMs: number;
    featureWindowSeconds: number;
    entitiesTracked: number;
    feedbackDelaySeconds: number;
    featureLookupsPerSecond: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsStreaming) {
    reasons.push({
      severity: analysis.featureLookupsPerSecond > comfortableFeatureLookupsPerSecond ? 'warning' : 'ok',
      text: `在一个 ${formatWindow(
        analysis.featureWindowSeconds,
      )} 窗口上算 velocity 需要 streaming 聚合；scorer 每秒大约做 ${formatRate(
        analysis.featureLookupsPerSecond,
      )} 次 feature lookup。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '流量和窗口都够小，feature 可以 inline 或 batch 算，不需要 stream processor。',
    });
  }

  if (analysis.budgetRemainingMs < 0) {
    reasons.push({
      severity: 'danger',
      text: `光是 model latency（${formatCount(
        analysis.modelLatencyMs,
      )} ms）就超过了 ${formatCount(
        analysis.decisionLatencyMs,
      )} ms 的 decision 预算；缩小 model，或预算更多 feature。`,
    });
  } else if (analysis.tightBudget && analysis.needsModel) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(
        analysis.decisionLatencyMs,
      )} ms 预算逼出 synchronous scoring：feature lookup 和一次有上界的 model 调用必须都塞得下。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.decisionLatencyMs,
      )} ms 预算很宽松，打分后还剩 ${formatCount(
        analysis.budgetRemainingMs,
      )} ms 余量留给 feature 处理和重试。`,
    });
  }

  if (analysis.transactionsPerSecond > comfortableScoringQpsPerNode) {
    reasons.push({
      severity: analysis.transactionsPerSecond > comfortableScoringQpsPerNode * 10 ? 'danger' : 'warning',
      text: `${formatRate(
        analysis.transactionsPerSecond,
      )}/s 超出单个 scoring 节点；把 scoring 路径和 stream 按 entity key 做 shard。`,
    });
  }

  if (analysis.needsFeedback) {
    reasons.push({
      severity: analysis.feedbackDelaySeconds > 172_800 ? 'warning' : 'ok',
      text: `确认的 label 在 ${formatWindow(
        analysis.feedbackDelaySeconds,
      )} 内回来；把它们回流去针对漂移的 fraud 模式做 retrain。`,
    });
  }

  if (analysis.needsGraph) {
    reasons.push({
      severity: 'warning',
      text: `graph features 连接 ${formatCount(
        analysis.entitiesTracked,
      )} 个 entity 来抓 ring；把 linking offline 预算好，让 synchronous 路径保持快。`,
    });
  }

  reasons.push({
    severity: 'ok',
    text: analysis.needsModel
      ? '混合的 decision gate 把可解释的 hard rule 和 model score 并排放着，于是即便 model 拿不准，确定性的 block 也仍然管用。'
      : '确定性的 rule 决定每一笔交易，对欺诈分析师完全可解释；目前还没有 model 参与。',
  });

  reasons.push({
    severity: analysis.failClosed ? 'ok' : 'warning',
    text: analysis.failClosed
      ? '有预算余量时 gate 可以 fail closed（出错就 deny），不过卡组织授权惯例往往仍然 fail open，事后通过 chargeback 抓欺诈，因为错误拒付对好客户的伤害更大。'
      : '在又紧又高量的预算下 gate 偏向 fail-open：打分超时就放行交易，以免挡住真实客户。',
  });

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    transactionsPerSecond: number;
    decisionLatencyMs: number;
    modelLatencyMs: number;
    budgetRemainingMs: number;
    feedbackDelaySeconds: number;
    entitiesTracked: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    streamingFeatures: {
      state: flags.needsStreaming ? 'needed' : 'not-yet',
      copy: flags.needsStreaming
        ? '在 stream processor 里维护按窗口的 velocity 计数，并从一个快速 feature store 提供出去。'
        : '量和窗口都还小，feature 就 inline 或 batch 算。',
    },
    scoringBudget: {
      state:
        flags.budgetRemainingMs < 0
          ? 'tradeoff'
          : flags.tightBudget && flags.needsModel
            ? 'needed'
            : 'useful',
      copy:
        flags.budgetRemainingMs < 0
          ? `${formatCount(
              flags.modelLatencyMs,
            )} ms 的 model 塞不进 ${formatCount(
              flags.decisionLatencyMs,
            )} ms 预算；拿 model 大小或预算好的 feature 去换 latency。`
          : `在 ${formatCount(
              flags.decisionLatencyMs,
            )} ms 预算内 synchronous 打分：快速 feature lookup 加一次有上界的 model 调用。`,
    },
    hybrid: {
      state: flags.needsModel ? 'needed' : 'useful',
      copy: flags.needsModel
        ? '在 decision gate 上把确定性 rule（hard block、可解释）和 model 的 risk score 结合起来。'
        : 'static rule 单独就覆盖了这个工作负载；目前还撑不起一个 model。',
    },
    graph: {
      state: flags.needsGraph ? 'needed' : 'not-yet',
      copy: flags.needsGraph
        ? `连接 ${formatCount(
            flags.entitiesTracked,
          )} 个 entity 来浮现有组织的 ring；把 linking offline 预算好。`
        : 'graph features 会增加成本，只有当有组织的 fraud ring 出现时才划算。',
    },
    feedbackLoop: {
      state: flags.needsFeedback ? 'needed' : 'not-yet',
      copy: flags.needsFeedback
        ? `收集确认的结果（label 在 ${formatWindow(
            flags.feedbackDelaySeconds,
          )} 内回来），并定期 retrain 来跟上 drift。`
        : '还没有 retraining loop；static rule 不会从结果里学习。',
    },
    failPolicy: {
      state: flags.failClosed ? 'useful' : 'tradeoff',
      copy: flags.failClosed
        ? '可以 fail closed（打分出错就 deny 或转人工 review），但卡组织授权惯例通常 fail open，靠 chargeback 善后，因为错误拒付的代价比偶尔漏掉一笔欺诈更大。'
        : '负载下 fail open：打分超时就放行交易，让预算永远不会挡住真实客户，代价是接受一点风险。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsModel && !flags.needsStreaming) {
    return 'Static rule engine';
  }
  if (flags.needsGraph) {
    return 'Streaming features + graph + sync scoring';
  }
  if (flags.needsFeedback) {
    return 'Streaming features + sync scoring + retraining';
  }
  if (flags.needsStreaming) {
    return 'Streaming features + synchronous scoring';
  }
  return 'Batch ML scoring';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsModel && !flags.needsStreaming) {
    return '一台机器上的几条确定性 rule 决定每一笔交易。目前还撑不起 model 或 streaming 基础设施。';
  }
  if (flags.needsGraph) {
    return 'streaming 聚合喂给一个快速 feature store，graph features 把 entity 连起来暴露 ring，一个小 model synchronous 打分，同时一个 feedback loop 针对 drift 做 retrain。';
  }
  if (flags.needsFeedback) {
    return '一个 stream processor 维护 velocity feature，rule 和一个小 model 的混合在预算内打分，确认的 label 回流来 retrain 这个 model。';
  }
  if (flags.needsStreaming) {
    return 'velocity 计数被保存在 stream processor 和一个快速 feature store 里，于是 scorer 读 feature 并在预算内 synchronous 跑一个有上界的 model。';
  }
  return '一个 model 给每笔交易打分，但 feature 是 batch 预算好的，所以快速移动的 velocity 欺诈可能溜过去。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsModel && !flags.needsStreaming) {
    return 'Txn -> rules engine -> 决策';
  }
  if (flags.needsGraph) {
    return 'Txn -> features + graph -> rules + model -> 决策 -> retrain';
  }
  if (flags.needsFeedback) {
    return 'Txn -> stream features -> rules + model -> 决策 -> labels -> retrain';
  }
  if (flags.needsStreaming) {
    return 'Txn -> stream features -> rules + model -> 决策';
  }
  return 'Txn -> batch features -> model -> 决策';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function formatWindow(seconds: number): string {
  if (seconds >= 86_400) {
    const days = seconds / 86_400;
    return `${days % 1 === 0 ? days : days.toFixed(1)} 天`;
  }
  if (seconds >= 3600) {
    const hours = seconds / 3600;
    return `${hours % 1 === 0 ? hours : hours.toFixed(1)} 小时`;
  }
  if (seconds >= 60) {
    const minutes = seconds / 60;
    return `${minutes % 1 === 0 ? minutes : minutes.toFixed(1)} 分`;
  }
  return `${Math.round(seconds)} 秒`;
}
