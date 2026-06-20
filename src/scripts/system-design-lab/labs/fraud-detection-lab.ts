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
  eyebrow: 'System Design Lab',
  title:
    'Real-time fraud detection is a tight synchronous latency budget wrapped around streaming features and a model.',
  summary:
    'Tune transaction rate, the decision latency budget, the feature window, model inference time, entities tracked, and feedback delay. The design evolves from static rules, to batch ML scoring, to streaming features with synchronous scoring, to a feedback loop with retraining, and finally to graph features at scale.',
  controls: [
    {
      id: 'transactionsPerSecond',
      label: 'Transaction rate',
      help: 'Transactions arriving on the scoring path; every one needs an allow/deny/review decision.',
      min: 10,
      max: 2_000_000,
      defaultValue: 5_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'decisionLatencyMs',
      label: 'Decision latency target',
      help: 'End-to-end budget to return a decision before the transaction is held up.',
      min: 5,
      max: 2_000,
      defaultValue: 200,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'featureWindowSeconds',
      label: 'Feature window',
      help: 'Lookback for velocity counts and aggregates (e.g. spend in the last N seconds).',
      min: 1,
      max: 604_800,
      defaultValue: 3_600,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'modelLatencyMs',
      label: 'Model latency',
      help: 'Time the scoring model spends per transaction inside the decision budget.',
      min: 1,
      max: 1_000,
      defaultValue: 30,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'entitiesTracked',
      label: 'Entities tracked',
      help: 'Distinct cards, accounts, devices, and merchants with live aggregate state.',
      min: 10_000,
      max: 5_000_000_000,
      defaultValue: 5_000_000,
      scale: 'log',
      unit: 'entities',
      format: 'count',
    },
    {
      id: 'feedbackDelaySeconds',
      label: 'Label feedback delay',
      help: 'Lag before confirmed-fraud labels (chargebacks, disputes) come back to retrain.',
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
      help: 'Maintain velocity counts in a stream processor instead of recomputing per request.',
      defaultValue: true,
    },
    {
      id: 'graphFeatures',
      label: 'Graph features',
      help: 'Link entities (shared device, card, address) to catch coordinated fraud rings.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'static-rules',
      step: '01',
      title: 'Static rule engine',
      summary: 'A handful of hard rules on a trickle of transactions.',
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
      summary: 'A model scores transactions, but features are computed in batch.',
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
      title: 'Real-time streaming features',
      summary: 'Velocity counts in a stream feed a synchronous score under a tight budget.',
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
      summary: 'Confirmed labels flow back to retrain against drifting fraud patterns.',
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
      title: 'Graph features at scale',
      summary: 'Entity linking catches rings while the decision stays within a sub-25 ms budget.',
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
    title: 'Real-time fraud detection architecture diagram',
    description:
      'Whiteboard-style architecture diagram for real-time fraud detection: clients, a synchronous scoring API, a stream processor with a feature store, a model and rules engine with an optional graph store, and an async label-feedback and retraining pipeline.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Payment client',
            subtitle: 'authorize txn',
            summary: 'submits each transaction and waits for an allow, deny, or review decision',
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
            subtitle: 'sync decision',
            summary: 'orchestrates the synchronous decision within the latency budget',
          },
          {
            id: 'decisionGate',
            title: 'Decision gate',
            subtitle: 'allow / deny / review',
            summary: 'applies fail-open or fail-closed policy and returns the verdict',
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
            subtitle: 'velocity aggregates',
            summary: 'maintains windowed velocity counts and aggregates from the event stream',
          },
          {
            id: 'featureStore',
            title: 'Feature store',
            subtitle: 'fast lookup',
            summary: 'serves precomputed per-entity features at low latency to the scorer',
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
            subtitle: 'hard rules',
            summary: 'evaluates deterministic rules and hard blocks before or beside the model',
          },
          {
            id: 'modelService',
            title: 'Model service',
            subtitle: 'risk score',
            summary: 'returns a fraud probability the gate combines with the rules verdict',
          },
          {
            id: 'graphStore',
            title: 'Graph store',
            subtitle: 'entity linking',
            summary: 'links shared cards, devices, and addresses to expose coordinated rings',
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
            subtitle: 'confirmed outcomes',
            summary: 'collects chargebacks and dispute outcomes as ground-truth labels',
          },
          {
            id: 'trainingPipeline',
            title: 'Training pipeline',
            subtitle: 'retrain + deploy',
            summary: 'retrains on fresh labels to track drifting fraud patterns and ships new models',
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
    { id: 'scoringLoad', label: 'Scoring path load' },
    { id: 'latencyBudget', label: 'Decision budget headroom' },
    { id: 'streamState', label: 'Stream state size' },
    { id: 'graphLoad', label: 'Graph linking load' },
    { id: 'modelFreshness', label: 'Model drift risk' },
  ],
  decisions: [
    { id: 'streamingFeatures', title: 'Real-time feature computation' },
    { id: 'scoringBudget', title: 'Synchronous scoring budget' },
    { id: 'hybrid', title: 'Rules + model hybrid' },
    { id: 'graph', title: 'Graph features' },
    { id: 'feedbackLoop', title: 'Feedback loop / retraining' },
    { id: 'failPolicy', title: 'Fail-open vs fail-closed' },
  ],
  sourceBackedRules: [
    {
      title: 'Stateful stream processing maintains windowed aggregates in real time',
      source: 'Apache Flink Docs',
      url: 'https://nightlies.apache.org/flink/flink-docs-stable/',
      summary:
        'Flink keeps keyed state and windows per entity so velocity counts and aggregates update continuously instead of being recomputed per request.',
    },
    {
      title: 'A durable, replayable log backs the feature and feedback streams',
      source: 'Apache Kafka Docs',
      url: 'https://kafka.apache.org/documentation/',
      summary:
        'Kafka gives the transaction and label streams an ordered, replayable backbone, which is what lets features be recomputed and models retrained from history.',
    },
    {
      title: 'A feature store serves the same features online at low latency and offline for training',
      source: 'Feast Docs',
      url: 'https://docs.feast.dev/',
      summary:
        'A feature store solves online/offline skew: the synchronous scorer reads fresh features fast while training reads consistent historical values.',
    },
    {
      title: 'Fraud detection is an anomaly / novelty-detection problem with drift',
      source: 'scikit-learn',
      url: 'https://scikit-learn.org/stable/modules/outlier_detection.html',
      summary:
        'Fraud is rare and the patterns shift over time, so detection is framed as outlier/novelty detection that needs fresh labels and frequent retraining rather than one static model.',
    },
  ],
  teachingAssumptions: [
    'The decision budget is split across feature lookup, model inference, and rules; remaining headroom is what is left after model latency.',
    'Single-node scoring, feature-lookup, and stream-state budgets are conservative teaching numbers, not vendor limits.',
    'Graph linking cost is modeled as growing with both entities tracked and transaction rate; real systems precompute much of it offline.',
  ],
  teachingWalkthrough: [
    {
      id: 'rules-only',
      step: '01',
      focus: 'A few hard rules',
      scenarioId: 'static-rules',
      question:
        'At 50 transactions/s with a 500 ms budget, do you need a model, a stream processor, or a feature store at all?',
      reveal:
        'No. A handful of deterministic rules ("deny if amount > X from a new device") on one box catches the obvious cases. With this little traffic and a relaxed budget, streaming infra and an ML model are pure overhead — and rules stay explainable to fraud analysts.',
      takeaway: 'Start with explainable static rules; reach for ML only when rules stop catching enough.',
    },
    {
      id: 'add-model',
      step: '02',
      focus: 'Add an ML model',
      scenarioId: 'batch-scoring',
      question:
        'You add a model but compute its features in a nightly batch. Why does that miss fast-moving fraud?',
      reveal:
        'Batch features are stale by hours. A card tested with ten tiny charges in a minute looks fine to features computed last night. Velocity is the strongest signal, so you need aggregates over a recent window — which batch cannot provide on the transaction path.',
      takeaway: 'Stale features blind you to velocity; recent-window aggregates are the core fraud signal.',
    },
    {
      id: 'go-realtime',
      step: '03',
      focus: 'Streaming + sync score',
      scenarioId: 'realtime-streaming',
      question:
        'Now 6k txn/s with a 150 ms budget. Where do you compute velocity counts, and what must stay inside the budget?',
      reveal:
        'A stream processor maintains per-entity windowed counts continuously and writes them to a fast feature store. On the request the scorer reads features and runs the model synchronously — feature lookup plus model inference must both fit under the budget, so the model is kept small and the store is in-memory.',
      takeaway: 'Compute features async in a stream; on the request only do a fast lookup plus a bounded model call.',
    },
    {
      id: 'feedback',
      step: '04',
      focus: 'Close the loop',
      scenarioId: 'feedback-loop',
      question:
        'Fraudsters adapt within days. If labels arrive 6 hours later, what do you build so the model keeps up?',
      reveal:
        'A feedback loop: confirmed outcomes (chargebacks, dispute resolutions) land in a label store and a training pipeline retrains regularly. Faster label feedback means you can retrain sooner against drift. The replayable stream lets you rebuild features for those historical transactions consistently.',
      takeaway: 'Fraud drifts, so a label-feedback loop and regular retraining are part of the system, not an afterthought.',
    },
    {
      id: 'graph',
      step: '05',
      focus: 'Link the entities',
      scenarioId: 'graph-at-scale',
      question:
        'Individual transactions look clean but a ring shares one device across many cards. How do you catch it within a 25 ms budget?',
      reveal:
        'Graph features link entities (shared device, card, address) so a ring lights up even when each transaction looks fine alone. The expensive linking is precomputed offline and the connected-component signals are pushed into the feature store, so the synchronous path still just does a fast lookup under the tight budget.',
      takeaway: 'Graph features expose coordinated rings; precompute the linking offline to keep the hot path fast.',
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
          ? 'Recomputing velocity aggregates inline (streaming aggregations off) multiplies the scoring-path cost; turn on streaming to push it off the hot path.'
          : effectiveScoringPerSecond > comfortableScoringQpsPerNode
            ? 'The scoring path must shard across nodes to hold this transaction rate.'
            : 'One scoring node comfortably handles the transaction rate.',
      },
      latencyBudget: {
        ratio: budgetRemainingMs <= 0 ? 2 : modelLatencyMs / decisionLatencyMs,
        valueText:
          budgetRemainingMs <= 0
            ? `over by ${formatCount(-budgetRemainingMs)} ms`
            : `${formatCount(budgetRemainingMs)} ms left`,
        copy:
          budgetRemainingMs <= 0
            ? `Model latency (${formatCount(modelLatencyMs)} ms) alone blows the ${formatCount(
                decisionLatencyMs,
              )} ms budget; the model must be smaller or features cached.`
            : `Model takes ${formatCount(modelLatencyMs)} ms of the ${formatCount(
                decisionLatencyMs,
              )} ms budget, leaving room for feature lookup and rules.`,
      },
      streamState: {
        ratio: needsStreaming ? streamStateEntries / comfortableStreamStateEntries : 0,
        valueText: needsStreaming ? `${formatCount(streamStateEntries)} keys` : 'no stream state',
        copy: needsStreaming
          ? `${formatCount(entitiesTracked)} entities over a ${formatWindow(
              featureWindowSeconds,
            )} window keep keyed state in the stream processor.`
          : 'Without streaming aggregations there is no keyed window state to hold.',
      },
      graphLoad: {
        ratio: graphPressure,
        valueText: needsGraph ? `${formatCount(entitiesTracked)} linked` : 'graph off',
        copy: needsGraph
          ? 'Entity linking across cards, devices, and addresses must be precomputed offline to stay off the hot path.'
          : 'Graph features are off, so no entity-linking workload exists yet.',
      },
      modelFreshness: {
        ratio: freshnessPressure,
        valueText: needsModel ? `labels in ${formatWindow(feedbackDelaySeconds)}` : 'no model',
        copy: needsModel
          ? feedbackDelaySeconds > 172_800
            ? `Labels lag ${formatWindow(
                feedbackDelaySeconds,
              )}; the model drifts before it can be retrained on confirmed fraud.`
            : `Labels return in ${formatWindow(feedbackDelaySeconds)}, fast enough to retrain against drift.`
          : 'No model yet, so there is nothing to retrain.',
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
      text: `Velocity over a ${formatWindow(
        analysis.featureWindowSeconds,
      )} window needs streaming aggregates; the scorer does about ${formatRate(
        analysis.featureLookupsPerSecond,
      )}/s of feature lookups.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Traffic and window are small enough to compute features inline or in batch without a stream processor.',
    });
  }

  if (analysis.budgetRemainingMs < 0) {
    reasons.push({
      severity: 'danger',
      text: `Model latency (${formatCount(
        analysis.modelLatencyMs,
      )} ms) exceeds the ${formatCount(
        analysis.decisionLatencyMs,
      )} ms decision budget on its own; shrink the model or precompute more features.`,
    });
  } else if (analysis.tightBudget && analysis.needsModel) {
    reasons.push({
      severity: 'warning',
      text: `A ${formatCount(
        analysis.decisionLatencyMs,
      )} ms budget forces synchronous scoring: feature lookup and a bounded model call must both fit.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `A ${formatCount(
        analysis.decisionLatencyMs,
      )} ms budget is relaxed, leaving ${formatCount(
        analysis.budgetRemainingMs,
      )} ms of headroom after scoring for feature work and retries.`,
    });
  }

  if (analysis.transactionsPerSecond > comfortableScoringQpsPerNode) {
    reasons.push({
      severity: analysis.transactionsPerSecond > comfortableScoringQpsPerNode * 10 ? 'danger' : 'warning',
      text: `${formatRate(
        analysis.transactionsPerSecond,
      )}/s exceeds one scoring node; shard the scoring path and the stream by entity key.`,
    });
  }

  if (analysis.needsFeedback) {
    reasons.push({
      severity: analysis.feedbackDelaySeconds > 172_800 ? 'warning' : 'ok',
      text: `Confirmed labels return in ${formatWindow(
        analysis.feedbackDelaySeconds,
      )}; feed them back to retrain against drifting fraud patterns.`,
    });
  }

  if (analysis.needsGraph) {
    reasons.push({
      severity: 'warning',
      text: `Graph features link ${formatCount(
        analysis.entitiesTracked,
      )} entities to catch rings; precompute the linking offline to keep the synchronous path fast.`,
    });
  }

  reasons.push({
    severity: 'ok',
    text: analysis.needsModel
      ? 'A hybrid decision gate keeps explainable hard rules alongside the model score, so deterministic blocks survive even when the model is uncertain.'
      : 'Deterministic rules decide every transaction and stay fully explainable to fraud analysts; no model is involved yet.',
  });

  reasons.push({
    severity: analysis.failClosed ? 'ok' : 'warning',
    text: analysis.failClosed
      ? 'With budget headroom the gate could fail closed (deny on error), though card-auth convention often still fails open and catches fraud later via chargebacks, since false declines hurt good customers more.'
      : 'Under a tight high-volume budget the gate leans fail-open: a scoring timeout allows the transaction to avoid blocking real customers.',
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
        ? 'Maintain windowed velocity counts in a stream processor and serve them from a fast feature store.'
        : 'Compute features inline or in batch while volume and window are small.',
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
          ? `The ${formatCount(
              flags.modelLatencyMs,
            )} ms model does not fit the ${formatCount(
              flags.decisionLatencyMs,
            )} ms budget; trade model size or precomputed features for latency.`
          : `Score synchronously inside the ${formatCount(
              flags.decisionLatencyMs,
            )} ms budget: fast feature lookup plus a bounded model call.`,
    },
    hybrid: {
      state: flags.needsModel ? 'needed' : 'useful',
      copy: flags.needsModel
        ? 'Combine deterministic rules (hard blocks, explainable) with a model risk score at the decision gate.'
        : 'Static rules alone cover the workload; a model is not justified yet.',
    },
    graph: {
      state: flags.needsGraph ? 'needed' : 'not-yet',
      copy: flags.needsGraph
        ? `Link ${formatCount(
            flags.entitiesTracked,
          )} entities to surface coordinated rings; precompute linking offline.`
        : 'Graph features add cost and only pay off once coordinated fraud rings appear.',
    },
    feedbackLoop: {
      state: flags.needsFeedback ? 'needed' : 'not-yet',
      copy: flags.needsFeedback
        ? `Collect confirmed outcomes (labels in ${formatWindow(
            flags.feedbackDelaySeconds,
          )}) and retrain regularly to track drift.`
        : 'No retraining loop yet; static rules do not learn from outcomes.',
    },
    failPolicy: {
      state: flags.failClosed ? 'useful' : 'tradeoff',
      copy: flags.failClosed
        ? 'Could fail closed (deny or route to review on a scoring error), but card-auth convention usually fails open and recovers via chargebacks, since false declines cost more than the rare missed fraud.'
        : 'Fail open under load: a scoring timeout allows the transaction so the budget never blocks real customers, accepting some risk.',
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
    return 'A handful of deterministic rules on one box decide each transaction. No model or streaming infrastructure is justified yet.';
  }
  if (flags.needsGraph) {
    return 'Streaming aggregates feed a fast feature store, graph features link entities to expose rings, and a small model scores synchronously while a feedback loop retrains against drift.';
  }
  if (flags.needsFeedback) {
    return 'A stream processor maintains velocity features, a hybrid of rules and a small model scores within the budget, and confirmed labels flow back to retrain the model.';
  }
  if (flags.needsStreaming) {
    return 'Velocity counts are kept in a stream processor and a fast feature store so the scorer reads features and runs a bounded model synchronously under the budget.';
  }
  return 'A model scores each transaction, but features are precomputed in batch, so fast-moving velocity fraud can slip through.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsModel && !flags.needsStreaming) {
    return 'Txn -> rules engine -> decision';
  }
  if (flags.needsGraph) {
    return 'Txn -> features + graph -> rules + model -> decision -> retrain';
  }
  if (flags.needsFeedback) {
    return 'Txn -> stream features -> rules + model -> decision -> labels -> retrain';
  }
  if (flags.needsStreaming) {
    return 'Txn -> stream features -> rules + model -> decision';
  }
  return 'Txn -> batch features -> model -> decision';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function formatWindow(seconds: number): string {
  if (seconds >= 86_400) {
    const days = seconds / 86_400;
    return `${days % 1 === 0 ? days : days.toFixed(1)} ${Math.round(days) === 1 ? 'day' : 'days'}`;
  }
  if (seconds >= 3600) {
    const hours = seconds / 3600;
    return `${hours % 1 === 0 ? hours : hours.toFixed(1)} ${Math.round(hours) === 1 ? 'hour' : 'hours'}`;
  }
  if (seconds >= 60) {
    const minutes = seconds / 60;
    return `${minutes % 1 === 0 ? minutes : minutes.toFixed(1)} min`;
  }
  return `${Math.round(seconds)} sec`;
}
