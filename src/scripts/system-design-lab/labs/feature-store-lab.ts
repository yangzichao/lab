import { buildColumnDiagram } from '../diagram-layout';
import {
  formatCount,
  formatRate,
  formatStorageGigabytes,
} from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative single-node teaching budgets (not vendor limits).
const comfortableOnlineLookupsPerSecond = 50_000; // point reads from one online-store node
const comfortableOnlineLatencyMs = 10; // a relaxed online SLA a general-purpose DB read could meet
const comfortableStreamFreshnessSeconds = 60; // batch materialization can keep this fresh
const comfortableTrainingRows = 50_000_000; // single-machine point-in-time join ceiling
const bytesPerFeatureValue = 32; // stored value footprint per feature per entity
const warehouseScanBudgetGigabytes = 2_000; // offline scan a single warehouse handles comfortably

export const featureStoreLabDefinition: SystemDesignLabDefinition = {
  id: 'feature-store',
  eyebrow: 'System Design Lab',
  title:
    'A feature store is two stores wearing one schema: the hard part is computing the same feature identically for training and serving.',
  summary:
    'Change serving lookups, feature and entity counts, the online latency target, training rows, and streaming freshness, and toggle streaming features and point-in-time correctness. The design evolves from features computed inline, to an offline batch store, to an online/offline split with parity, to point-in-time training joins, and finally to streaming materialization at scale.',
  controls: [
    {
      id: 'servingLookupsPerSecond',
      label: 'Serving lookups',
      help: 'Online feature reads per second at inference: each prediction fetches a row of features by entity key.',
      min: 1,
      max: 2_000_000,
      defaultValue: 500,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'featureCount',
      label: 'Features',
      help: 'Distinct feature columns served and materialized. More features means wider rows and more transforms to keep in parity.',
      min: 5,
      max: 50_000,
      defaultValue: 200,
      scale: 'log',
      unit: 'features',
      format: 'count',
    },
    {
      id: 'entityCount',
      label: 'Entities',
      help: 'Distinct keys (users, items, sessions) with feature values. Sets the online store size and key cardinality.',
      min: 1_000,
      max: 5_000_000_000,
      defaultValue: 5_000_000,
      scale: 'log',
      unit: 'keys',
      format: 'count',
    },
    {
      id: 'onlineLatencyTargetMs',
      label: 'Online latency target',
      help: 'p99 budget to return a feature vector at serving. Tight budgets force a dedicated low-latency online store.',
      min: 1,
      max: 500,
      defaultValue: 25,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'trainingRows',
      label: 'Training rows',
      help: 'Labeled rows joined to historical features to build a training set. Drives the offline join and scan cost.',
      min: 10_000,
      max: 50_000_000_000,
      defaultValue: 5_000_000,
      scale: 'log',
      unit: 'rows',
      format: 'count',
    },
    {
      id: 'streamFreshnessSeconds',
      label: 'Freshness lag',
      help: 'How stale an online feature is allowed to be. Seconds-level freshness rules out periodic batch materialization.',
      min: 1,
      max: 86_400,
      defaultValue: 3_600,
      scale: 'log',
      format: 'duration-seconds',
    },
  ],
  toggles: [
    {
      id: 'streamingFeatures',
      label: 'Streaming features',
      help: 'Update features from an event stream in near-real-time instead of only periodic batch jobs.',
      defaultValue: false,
    },
    {
      id: 'pointInTimeCorrectness',
      label: 'Point-in-time correctness',
      help: 'Join each label to feature values as they were at the label timestamp, preventing future data from leaking into training.',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'inline',
      step: '01',
      title: 'Features computed inline',
      summary: 'A model recomputes features in the request path over a small key set.',
      values: {
        servingLookupsPerSecond: 20,
        featureCount: 15,
        entityCount: 50_000,
        onlineLatencyTargetMs: 200,
        trainingRows: 100_000,
        streamFreshnessSeconds: 86_400,
        streamingFeatures: false,
        pointInTimeCorrectness: false,
      },
    },
    {
      id: 'offline-batch',
      step: '02',
      title: 'Offline batch features',
      summary: 'Nightly jobs precompute features into a warehouse for training.',
      values: {
        servingLookupsPerSecond: 200,
        featureCount: 80,
        entityCount: 2_000_000,
        onlineLatencyTargetMs: 150,
        trainingRows: 20_000_000,
        streamFreshnessSeconds: 86_400,
        streamingFeatures: false,
        pointInTimeCorrectness: false,
      },
    },
    {
      id: 'online-offline-split',
      step: '03',
      title: 'Online/offline split',
      summary: 'Low-latency serving needs a dedicated online store kept in parity with offline.',
      values: {
        servingLookupsPerSecond: 30_000,
        featureCount: 400,
        entityCount: 50_000_000,
        onlineLatencyTargetMs: 25,
        trainingRows: 40_000_000,
        streamFreshnessSeconds: 21_600,
        streamingFeatures: false,
        pointInTimeCorrectness: false,
      },
    },
    {
      id: 'point-in-time',
      step: '04',
      title: 'Point-in-time training joins',
      summary: 'Large training sets must join features as-of each label to avoid leakage.',
      values: {
        servingLookupsPerSecond: 120_000,
        featureCount: 2_000,
        entityCount: 300_000_000,
        onlineLatencyTargetMs: 15,
        trainingRows: 5_000_000_000,
        streamFreshnessSeconds: 3_600,
        streamingFeatures: false,
        pointInTimeCorrectness: true,
      },
    },
    {
      id: 'streaming-scale',
      step: '05',
      title: 'Streaming features at scale',
      summary: 'Seconds-fresh features over billions of keys at high serving QPS.',
      values: {
        servingLookupsPerSecond: 1_000_000,
        featureCount: 12_000,
        entityCount: 3_000_000_000,
        onlineLatencyTargetMs: 5,
        trainingRows: 30_000_000_000,
        streamFreshnessSeconds: 5,
        streamingFeatures: true,
        pointInTimeCorrectness: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'Feature store architecture diagram',
    description:
      'Whiteboard-style architecture diagram for an ML feature store: models and training clients, a serving API and feature registry, a low-latency online store, batch and stream materialization, an offline warehouse, and a point-in-time training-join job.',
    columns: [
      {
        id: 'clients',
        label: 'Models',
        variant: 'clients',
        nodes: [
          {
            id: 'servingModel',
            title: 'Serving model',
            subtitle: 'online inference',
            summary: 'asks for a feature vector by entity key on every prediction',
          },
          {
            id: 'trainingJob',
            title: 'Training job',
            subtitle: 'builds datasets',
            summary: 'requests historical features joined to labels to train models',
          },
        ],
      },
      {
        id: 'api',
        label: 'Serving + registry',
        variant: 'edge',
        nodes: [
          {
            id: 'servingApi',
            title: 'Serving API',
            subtitle: 'feature lookup',
            summary: 'fetches feature vectors at low latency for online inference',
          },
          {
            id: 'registry',
            title: 'Feature registry',
            subtitle: 'definitions',
            summary: 'single source of truth for feature definitions and transform logic',
          },
        ],
      },
      {
        id: 'online',
        label: 'Online store',
        variant: 'backbone',
        nodes: [
          {
            id: 'onlineStore',
            title: 'Online store',
            subtitle: 'low-latency KV',
            summary: 'serves the latest feature values keyed by entity in single-digit ms',
          },
        ],
      },
      {
        id: 'materialization',
        label: 'Materialization',
        variant: 'processing',
        nodes: [
          {
            id: 'batchJob',
            title: 'Batch job',
            subtitle: 'periodic compute',
            summary: 'recomputes features on a schedule and writes them to both stores',
          },
          {
            id: 'streamJob',
            title: 'Stream job',
            subtitle: 'near-real-time',
            summary: 'updates features from an event stream for seconds-level freshness',
          },
        ],
      },
      {
        id: 'offline',
        label: 'Offline',
        variant: 'storage',
        nodes: [
          {
            id: 'offlineStore',
            title: 'Offline store',
            subtitle: 'warehouse',
            summary: 'durable historical feature values for training and backfills',
          },
          {
            id: 'pitJoin',
            title: 'Point-in-time join',
            subtitle: 'as-of training',
            summary: 'joins each label to feature values as of its timestamp to stop leakage',
          },
        ],
      },
    ],
    flows: [
      { from: 'servingModel', to: 'servingApi', variant: 'primary' },
      { from: 'servingApi', to: 'onlineStore', variant: 'primary' },
      { from: 'servingApi', to: 'registry', variant: 'secondary' },
      { from: 'batchJob', to: 'onlineStore', variant: 'secondary' },
      { from: 'streamJob', to: 'onlineStore', variant: 'secondary' },
      { from: 'batchJob', to: 'offlineStore', variant: 'primary' },
      { from: 'streamJob', to: 'offlineStore', variant: 'secondary' },
      { from: 'trainingJob', to: 'pitJoin', variant: 'direct' },
      { from: 'pitJoin', to: 'offlineStore', variant: 'primary' },
    ],
  }),
  meters: [
    { id: 'onlineRead', label: 'Online lookup load' },
    { id: 'onlineLatency', label: 'Online latency pressure' },
    { id: 'onlineStorage', label: 'Online store size' },
    { id: 'freshness', label: 'Freshness vs lag budget' },
    { id: 'trainingJoin', label: 'Training join cost' },
  ],
  decisions: [
    { id: 'storeSplit', title: 'Online/offline split' },
    { id: 'materialization', title: 'Materialization mode' },
    { id: 'pointInTime', title: 'Point-in-time joins' },
    { id: 'onlineStoreChoice', title: 'Online store choice' },
    { id: 'registry', title: 'Feature registry' },
    { id: 'freshness', title: 'Freshness strategy' },
  ],
  sourceBackedRules: [
    {
      title: 'A feature store splits a low-latency online store from a scalable offline store',
      source: 'Feast Docs',
      url: 'https://docs.feast.dev/',
      summary:
        'Feast materializes features into an online store for serving and keeps an offline store for historical retrieval, so the same feature definitions back both paths.',
    },
    {
      title: 'Online/offline parity is the core problem a feature store solves',
      source: 'Uber Michelangelo',
      url: 'https://www.uber.com/blog/michelangelo-machine-learning-platform/',
      summary:
        'Michelangelo computes features once and shares them across training and serving so the model sees the same values in both, avoiding training/serving skew.',
    },
    {
      title: 'Training joins must be point-in-time correct to avoid label leakage',
      source: 'Feast Point-in-Time Joins',
      url: 'https://docs.feast.dev/getting-started/concepts/point-in-time-joins',
      summary:
        'Features must be joined to labels as of the prediction timestamp; using values from after the label leaks future information and inflates offline metrics.',
    },
    {
      title: 'In-memory key-value stores serve online features at sub-millisecond latency',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/develop/',
      summary:
        'Point lookups by entity key from an in-memory store meet tight serving budgets that a warehouse scan cannot.',
    },
  ],
  teachingAssumptions: [
    'Online lookups are modeled as point reads of one feature row per entity key; each fetch returns the full feature vector.',
    'Single-node read, latency, storage, and join budgets are conservative teaching numbers, not vendor limits.',
    'Online store size approximates entities x features x ~32 bytes; real systems add TTLs, indexes, and replication overhead.',
  ],
  teachingWalkthrough: [
    {
      id: 'inline',
      step: '01',
      focus: 'Features computed inline',
      scenarioId: 'inline',
      question:
        'A single model computes 15 features in the request path over 50k keys at 20 lookups/s. Do you need a feature store at all yet?',
      reveal:
        'No. At this volume the model can compute features inline from the source data. A feature store earns its keep only when features must be shared across models and reused identically in training — none of that pressure exists yet.',
      takeaway: 'A feature store is reuse and parity infrastructure; without sharing, inline computation is simpler.',
    },
    {
      id: 'offline-batch',
      step: '02',
      focus: 'Offline batch features',
      scenarioId: 'offline-batch',
      question:
        'You now train on 20M rows and want repeatable features. What is the first piece to add, and why offline first?',
      reveal:
        'Precompute features with a batch job into an offline warehouse. Training reads them back for reproducibility, and the same transform code becomes the definition others reuse. Serving is still slow-tolerant, so no online store is needed yet.',
      takeaway: 'Offline batch materialization comes first: it makes features reproducible and reusable before serving gets strict.',
    },
    {
      id: 'online-offline-split',
      step: '03',
      focus: 'Online/offline split',
      scenarioId: 'online-offline-split',
      question:
        'Serving now needs 30k lookups/s under 25 ms. Can the warehouse that backs training also answer online reads?',
      reveal:
        'No — a warehouse scan cannot meet a 25 ms point-read budget at that QPS. You split out a low-latency online KV store and materialize the same features into it. The hard requirement is parity: both stores must reflect the same computation, or the model sees training/serving skew.',
      takeaway: 'Tight serving latency forces a separate online store; the whole job is keeping it in parity with offline.',
    },
    {
      id: 'point-in-time',
      focus: 'Point-in-time joins',
      step: '04',
      scenarioId: 'point-in-time',
      question:
        'Training on 5B rows, you naively join the latest feature value to each label. What silently breaks?',
      reveal:
        'Label leakage. The latest value reflects data from after the label, so the model trains on the future and offline metrics look great but collapse in production. You need an as-of (point-in-time) join that picks the feature value as it was at each label timestamp, which is far more expensive than a plain join.',
      takeaway: 'Joining the latest value leaks the future; point-in-time joins are the price of correct training data.',
    },
    {
      id: 'streaming-scale',
      step: '05',
      focus: 'Streaming features at scale',
      scenarioId: 'streaming-scale',
      question:
        'Features must now be 5 seconds fresh over billions of keys. Can a faster batch schedule deliver that?',
      reveal:
        'No — even frequent batch jobs leave a freshness gap measured in minutes. Seconds-level freshness requires a streaming pipeline that updates the online store from an event stream, and that same computation must still be replayable offline so training and serving stay in parity.',
      takeaway: 'Seconds-fresh features need streaming, and streaming must stay replayable offline to preserve parity.',
    },
  ],
  analyze: analyzeFeatureStoreWorkload,
};

function analyzeFeatureStoreWorkload(workload: WorkloadValues): LabAnalysis {
  const servingLookupsPerSecond = numericValue(workload, 'servingLookupsPerSecond');
  const featureCount = numericValue(workload, 'featureCount');
  const entityCount = numericValue(workload, 'entityCount');
  const onlineLatencyTargetMs = numericValue(workload, 'onlineLatencyTargetMs');
  const trainingRows = numericValue(workload, 'trainingRows');
  const streamFreshnessSeconds = numericValue(workload, 'streamFreshnessSeconds');
  const streamingFeatures = Boolean(workload.streamingFeatures);
  const pointInTimeCorrectness = Boolean(workload.pointInTimeCorrectness);

  // Online store size: entities x features x bytes/value.
  const onlineStorageGigabytes =
    (entityCount * featureCount * bytesPerFeatureValue) / 1_000_000_000;

  // A dedicated low-latency online store is needed once serving traffic, a tight
  // latency budget, or a large key set rules out reading from the warehouse.
  const needsOnlineStore =
    servingLookupsPerSecond > 1_000 ||
    onlineLatencyTargetMs < comfortableOnlineLatencyMs * 3 ||
    entityCount > 5_000_000;

  // Streaming materialization: explicit toggle or a freshness budget batch cannot meet.
  const needsStreaming = streamingFeatures || streamFreshnessSeconds < comfortableStreamFreshnessSeconds;

  // Point-in-time joins: explicit toggle or large training sets where leakage matters.
  const needsPointInTime = pointInTimeCorrectness || trainingRows > comfortableTrainingRows;

  // Registry/governance matters once many features must be shared and reused.
  const needsRegistry = featureCount > 100 || needsOnlineStore;

  // Offline warehouse appears as soon as training is non-trivial, an online store
  // must be kept in parity, streaming must stay replayable, or point-in-time joins
  // run. Gating downstream offline flows on this keeps the diagram coherent: no
  // active edge ever points into an inactive offline store.
  const needsOffline =
    trainingRows > 1_000_000 ||
    needsOnlineStore ||
    needsStreaming ||
    needsPointInTime;

  // Online scaling pressure: lookups and storage past one node.
  const onlineReadRatio = servingLookupsPerSecond / comfortableOnlineLookupsPerSecond;
  const onlineStorageRatio = onlineStorageGigabytes / 200; // one online node ~200 GB
  const needsOnlineScaleOut = onlineReadRatio > 1 || onlineStorageRatio > 1;

  // Latency headroom: how the target compares to what a single online node can hold.
  // Tighter target -> higher ratio (closer to or past the budget).
  const latencyRatio = comfortableOnlineLatencyMs / Math.max(onlineLatencyTargetMs, 0.5);

  // Freshness: required lag vs what batch can deliver. Smaller required lag -> higher ratio.
  const freshnessRatio = comfortableStreamFreshnessSeconds / Math.max(streamFreshnessSeconds, 1);

  // Training join cost grows with rows and is multiplied by point-in-time work.
  const trainingScanGigabytes =
    (trainingRows * featureCount * bytesPerFeatureValue) / 1_000_000_000;
  const pitMultiplier = needsPointInTime ? 4 : 1;
  const trainingJoinRatio = (trainingScanGigabytes * pitMultiplier) / warehouseScanBudgetGigabytes;

  const flags = {
    needsOnlineStore,
    needsStreaming,
    needsPointInTime,
    needsRegistry,
    needsOffline,
    needsOnlineScaleOut,
    streamingFeatures,
    pointInTimeCorrectness,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      servingModel: 'ok',
      trainingJob: needsOffline ? 'ok' : 'inactive',
      servingApi: needsOnlineStore ? 'ok' : 'inactive',
      registry: needsRegistry ? 'needed' : 'inactive',
      onlineStore: needsOnlineStore
        ? needsOnlineScaleOut
          ? 'overloaded'
          : 'needed'
        : 'inactive',
      batchJob: needsOffline ? 'needed' : 'inactive',
      streamJob: needsStreaming ? 'needed' : 'inactive',
      offlineStore: needsOffline ? (trainingJoinRatio > 1 ? 'warning' : 'ok') : 'inactive',
      pitJoin: needsPointInTime ? (trainingJoinRatio > 1 ? 'overloaded' : 'needed') : 'inactive',
    },
    flowStates: {
      servingModelToServingApi: needsOnlineStore ? 'active' : 'inactive',
      servingApiToOnlineStore: needsOnlineStore
        ? needsOnlineScaleOut
          ? 'warning'
          : 'active'
        : 'inactive',
      servingApiToRegistry: needsRegistry ? 'active' : 'inactive',
      batchJobToOnlineStore: needsOnlineStore ? 'active' : 'inactive',
      streamJobToOnlineStore: needsStreaming && needsOnlineStore ? 'active' : 'inactive',
      batchJobToOfflineStore: needsOffline ? 'active' : 'inactive',
      streamJobToOfflineStore: needsStreaming && needsOffline ? 'active' : 'inactive',
      trainingJobToPitJoin: needsPointInTime ? 'active' : 'inactive',
      pitJoinToOfflineStore: needsPointInTime ? (trainingJoinRatio > 1 ? 'warning' : 'active') : 'inactive',
    },
    meters: {
      onlineRead: {
        ratio: onlineReadRatio,
        valueText: `${formatRate(servingLookupsPerSecond)} ops/s`,
        copy: needsOnlineStore
          ? `The online store answers ${formatRate(servingLookupsPerSecond)} point lookups/s by entity key.`
          : 'Serving traffic is low enough to recompute or read features inline.',
      },
      onlineLatency: {
        ratio: latencyRatio,
        valueText: `${Math.round(onlineLatencyTargetMs)} ms target`,
        copy:
          onlineLatencyTargetMs < comfortableOnlineLatencyMs * 3
            ? `A ${Math.round(onlineLatencyTargetMs)} ms p99 budget rules out warehouse reads; an in-memory online store is required.`
            : `A ${Math.round(onlineLatencyTargetMs)} ms budget is relaxed enough that a general-purpose database read could meet it; a warehouse still cannot.`,
      },
      onlineStorage: {
        ratio: onlineStorageRatio,
        valueText: formatStorageGigabytes(onlineStorageGigabytes),
        copy: `${formatCount(entityCount)} entities x ${formatCount(featureCount)} features at ~${bytesPerFeatureValue} bytes each.`,
      },
      freshness: {
        ratio: freshnessRatio,
        valueText: formatFreshness(streamFreshnessSeconds),
        copy:
          streamFreshnessSeconds < comfortableStreamFreshnessSeconds
            ? `A ${formatFreshness(streamFreshnessSeconds)} freshness budget is below what periodic batch can deliver; stream the updates.`
            : `A ${formatFreshness(streamFreshnessSeconds)} freshness budget is comfortable for scheduled batch materialization.`,
      },
      trainingJoin: {
        ratio: trainingJoinRatio,
        valueText: `${formatCount(trainingRows)} rows`,
        copy: needsPointInTime
          ? `Point-in-time joins over ${formatCount(trainingRows)} rows scan ~${formatStorageGigabytes(trainingScanGigabytes)} of history with as-of lookups.`
          : `A plain join over ${formatCount(trainingRows)} rows reads ~${formatStorageGigabytes(trainingScanGigabytes)} of features.`,
      },
    },
    decisions: buildDecisions({
      ...flags,
      servingLookupsPerSecond,
      onlineLatencyTargetMs,
      streamFreshnessSeconds,
      trainingRows,
      featureCount,
    }),
    reasons: buildReasons({
      ...flags,
      servingLookupsPerSecond,
      onlineLatencyTargetMs,
      onlineStorageGigabytes,
      entityCount,
      featureCount,
      streamFreshnessSeconds,
      trainingRows,
      trainingJoinRatio,
    }),
  };
}

type ArchitectureFlags = {
  needsOnlineStore: boolean;
  needsStreaming: boolean;
  needsPointInTime: boolean;
  needsRegistry: boolean;
  needsOffline: boolean;
  needsOnlineScaleOut: boolean;
  streamingFeatures: boolean;
  pointInTimeCorrectness: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    servingLookupsPerSecond: number;
    onlineLatencyTargetMs: number;
    onlineStorageGigabytes: number;
    entityCount: number;
    featureCount: number;
    streamFreshnessSeconds: number;
    trainingRows: number;
    trainingJoinRatio: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsOffline) {
    reasons.push({
      severity: 'ok',
      text: `Features are precomputed into an offline store so ${formatCount(
        analysis.trainingRows,
      )} training rows read reproducible values and the same transform code becomes the shared definition.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'With one model and a tiny training set, features can be computed inline from source data — no offline store earns its keep yet.',
    });
  }

  if (analysis.needsOnlineStore) {
    reasons.push({
      severity: analysis.needsOnlineScaleOut ? 'danger' : 'warning',
      text: `${formatRate(
        analysis.servingLookupsPerSecond,
      )} lookups/s under a ${Math.round(
        analysis.onlineLatencyTargetMs,
      )} ms budget need a dedicated low-latency online store, separate from the warehouse.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Serving load and latency are relaxed enough that features can be computed or read inline without an online store.',
    });
  }

  if (analysis.needsOnlineStore) {
    reasons.push({
      severity: 'warning',
      text: 'The online and offline stores must reflect the same computation, or the model sees training/serving skew — parity is the central constraint.',
    });
  }

  if (analysis.needsPointInTime) {
    reasons.push({
      severity: analysis.trainingJoinRatio > 1 ? 'danger' : 'warning',
      text: `Training over ${formatCount(
        analysis.trainingRows,
      )} rows must use point-in-time (as-of) joins; the latest value would leak future data into training.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Training sets are small and a plain feature join is acceptable, but watch for leakage as soon as labels span time.',
    });
  }

  if (analysis.needsStreaming) {
    reasons.push({
      severity: 'warning',
      text: `A ${formatFreshness(
        analysis.streamFreshnessSeconds,
      )} freshness target exceeds batch; stream updates into the online store and keep them replayable offline.`,
    });
  } else if (analysis.needsOffline) {
    reasons.push({
      severity: 'ok',
      text: `A ${formatFreshness(
        analysis.streamFreshnessSeconds,
      )} freshness budget is comfortable for scheduled batch materialization, so no streaming pipeline is needed yet.`,
    });
  }

  if (analysis.needsOnlineScaleOut) {
    reasons.push({
      severity: 'danger',
      text: `${formatStorageGigabytes(
        analysis.onlineStorageGigabytes,
      )} of online values (${formatCount(analysis.entityCount)} entities x ${formatCount(
        analysis.featureCount,
      )} features) and the read rate exceed one node; shard the online store.`,
    });
  }

  if (analysis.needsRegistry) {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.featureCount,
      )} shared features need a registry so definitions and transform logic are reused, not re-implemented per model.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.featureCount,
      )} features and a single consumer mean a feature registry is overhead for now; revisit it once features are shared across models.`,
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    servingLookupsPerSecond: number;
    onlineLatencyTargetMs: number;
    streamFreshnessSeconds: number;
    trainingRows: number;
    featureCount: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    storeSplit: {
      state: flags.needsOnlineStore ? 'needed' : 'not-yet',
      copy: flags.needsOnlineStore
        ? 'Split a low-latency online store from the offline warehouse; both materialize from the same feature definitions.'
        : 'One store is fine — serving tolerates the same path that training reads from.',
    },
    materialization: {
      state: flags.needsStreaming ? 'tradeoff' : flags.needsOffline ? 'useful' : 'not-yet',
      copy: flags.needsStreaming
        ? `Run batch for backfills plus a stream job for the ${formatFreshness(
            flags.streamFreshnessSeconds,
          )} freshness target; the stream must stay replayable offline.`
        : flags.needsOffline
          ? 'Periodic batch jobs precompute features into the stores; freshness is comfortable.'
          : 'No materialization yet — features are computed inline at request time.',
    },
    pointInTime: {
      state: flags.needsPointInTime ? 'needed' : 'not-yet',
      copy: flags.needsPointInTime
        ? `Join features as-of each label timestamp over ${formatCount(
            flags.trainingRows,
          )} rows so the model never trains on the future.`
        : 'A plain join is acceptable while training sets are small and labels do not span time.',
    },
    onlineStoreChoice: {
      state: flags.needsOnlineScaleOut ? 'tradeoff' : flags.needsOnlineStore ? 'needed' : 'not-yet',
      copy: flags.needsOnlineScaleOut
        ? 'Use a sharded in-memory KV store (Redis-class) sized for the read rate and value footprint.'
        : flags.needsOnlineStore
          ? `An in-memory KV store serves ${formatRate(
              flags.servingLookupsPerSecond,
            )} lookups/s within a ${Math.round(flags.onlineLatencyTargetMs)} ms budget.`
          : 'No online store yet, so no online engine decision to make.',
    },
    registry: {
      state: flags.needsRegistry ? 'useful' : 'not-yet',
      copy: flags.needsRegistry
        ? `Govern ${formatCount(
            flags.featureCount,
          )} feature definitions in a registry so training and serving share one source of truth.`
        : 'Few features and one model — a registry is overhead for now.',
    },
    freshness: {
      state: flags.needsStreaming ? 'needed' : flags.needsOffline ? 'useful' : 'not-yet',
      copy: flags.needsStreaming
        ? `Stream features near-real-time to hit ${formatFreshness(flags.streamFreshnessSeconds)} of staleness.`
        : flags.needsOffline
          ? 'Scheduled batch keeps features fresh enough for the current budget.'
          : 'Freshness is irrelevant while features are computed inline.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsOnlineStore && !flags.needsOffline) {
    return 'Inline feature computation';
  }
  if (flags.needsStreaming && flags.needsOnlineScaleOut) {
    return 'Streaming materialization + sharded online store';
  }
  if (flags.needsOnlineStore && flags.needsPointInTime) {
    return 'Online/offline split + point-in-time training joins';
  }
  if (flags.needsOnlineStore) {
    return 'Online/offline store split';
  }
  return 'Offline batch feature store';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsOnlineStore && !flags.needsOffline) {
    return 'A single model computes features inline from source data. There is nothing to share, so a feature store is not justified yet.';
  }
  if (flags.needsStreaming && flags.needsOnlineScaleOut) {
    return 'A streaming pipeline keeps a sharded online store seconds-fresh while the same computation is replayed offline, and point-in-time joins build correct training sets.';
  }
  if (flags.needsOnlineStore && flags.needsPointInTime) {
    return 'A low-latency online store serves features in parity with the offline warehouse, and training sets are built with point-in-time joins to avoid leakage.';
  }
  if (flags.needsOnlineStore) {
    return 'A dedicated online store serves features at low latency while the offline warehouse holds history; both materialize from the same definitions for parity.';
  }
  return 'Batch jobs precompute features into an offline warehouse so training is reproducible and the transforms are reused.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsOnlineStore && !flags.needsOffline) {
    return 'Model -> compute features inline';
  }
  if (flags.needsStreaming && flags.needsOnlineScaleOut) {
    return 'Model -> serving API -> sharded online store; stream + batch -> offline -> point-in-time join';
  }
  if (flags.needsOnlineStore && flags.needsPointInTime) {
    return 'Serving -> online store; training -> point-in-time join -> offline store';
  }
  if (flags.needsOnlineStore) {
    return 'Serving -> online store; batch -> online + offline store';
  }
  return 'Training -> batch job -> offline store';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function formatFreshness(seconds: number): string {
  if (seconds >= 86_400) {
    return `${Math.round(seconds / 86_400)} day${Math.round(seconds / 86_400) === 1 ? '' : 's'}`;
  }
  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)} hr`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} min`;
  }
  return `${Math.round(seconds)} sec`;
}
