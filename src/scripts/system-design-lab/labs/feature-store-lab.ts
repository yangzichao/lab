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
  eyebrow: '系统设计 Lab',
  title:
    'feature store 本质是两个 store 共用一套 schema：难点在于让 training 和 serving 用完全一致的方式算出同一个 feature。',
  summary:
    '调节 serving lookup、feature 数和 entity 数、online latency 目标、training 行数、streaming 新鲜度，再开关 streaming features 和 point-in-time correctness。架构会从 feature 在请求路径里现算，演进到 offline batch store，再到带 parity 的 online/offline split，再到 point-in-time training join，最终到大规模的 streaming materialization。',
  controls: [
    {
      id: 'servingLookupsPerSecond',
      label: 'Serving lookup',
      help: '推理时每秒的 online feature 读取量：每次预测都按 entity key 取一行 feature。',
      min: 1,
      max: 2_000_000,
      defaultValue: 500,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'featureCount',
      label: 'Feature 数',
      help: '对外服务并 materialize 的 feature 列数。feature 越多，行越宽，要保持 parity 的 transform 也越多。',
      min: 5,
      max: 50_000,
      defaultValue: 200,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'entityCount',
      label: 'Entity 数',
      help: '带 feature 值的 distinct key 数（用户、物品、会话）。决定 online store 的体量和 key 的基数。',
      min: 1_000,
      max: 5_000_000_000,
      defaultValue: 5_000_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'onlineLatencyTargetMs',
      label: 'Online latency 目标',
      help: 'serving 时返回一个 feature vector 的 p99 预算。预算越紧，越需要一个专门的低延迟 online store。',
      min: 1,
      max: 500,
      defaultValue: 25,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'trainingRows',
      label: 'Training 行数',
      help: '带 label 的行，join 上历史 feature 来构建 training set。决定 offline join 和扫描的开销。',
      min: 10_000,
      max: 50_000_000_000,
      defaultValue: 5_000_000,
      scale: 'log',
      unit: '行',
      format: 'count',
    },
    {
      id: 'streamFreshnessSeconds',
      label: '新鲜度延迟',
      help: '一个 online feature 最多能有多旧。秒级新鲜度就排除了周期性的 batch materialization。',
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
      help: '从 event stream 近实时更新 feature，而不是只靠周期性的 batch job。',
      defaultValue: false,
    },
    {
      id: 'pointInTimeCorrectness',
      label: 'Point-in-time correctness',
      help: '把每个 label join 到它在 label 时间点上当时的 feature 值，防止未来数据泄漏进 training。',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'inline',
      step: '01',
      title: 'Feature 在请求路径里现算',
      summary: '一个模型在请求路径里、对一小撮 key 现场重算 feature。',
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
      title: 'Offline batch feature',
      summary: '每晚的 job 把 feature 预算好写进 warehouse 供 training 用。',
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
      summary: '低延迟 serving 需要一个专门的 online store，并和 offline 保持 parity。',
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
      title: 'Point-in-time training join',
      summary: '大的 training set 必须按每个 label 的 as-of 时点 join feature，才能避免泄漏。',
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
      title: '大规模 streaming features',
      summary: '在数十亿 key、高 serving QPS 下做到秒级新鲜的 feature。',
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
    title: 'Feature store 架构图',
    description:
      'ML feature store 的白板式架构图：模型与 training 客户端、serving API 和 feature registry、低延迟 online store、batch 和 stream materialization、offline warehouse，以及一个 point-in-time training-join job。',
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
            summary: '每次预测都按 entity key 要一个 feature vector',
            kind: 'client',
          },
          {
            id: 'trainingJob',
            title: 'Training job',
            subtitle: '构建数据集',
            summary: '请求 join 到 label 的历史 feature 来训练模型',
            kind: 'client',
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
            summary: '为 online inference 低延迟地取出 feature vector',
            kind: 'api',
          },
          {
            id: 'registry',
            title: 'Feature registry',
            subtitle: '定义',
            summary: 'feature 定义和 transform 逻辑的 single source of truth',
            kind: 'service',
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
            summary: '按 entity 做 key，在个位数 ms 内返回最新的 feature 值',
            kind: 'nosql',
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
            subtitle: '周期性计算',
            summary: '按计划重算 feature，并写进两个 store',
            kind: 'compute',
          },
          {
            id: 'streamJob',
            title: 'Stream job',
            subtitle: '近实时',
            summary: '从 event stream 更新 feature，做到秒级新鲜度',
            kind: 'compute',
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
            summary: '持久保存历史 feature 值，供 training 和 backfill 用',
            kind: 'db',
          },
          {
            id: 'pitJoin',
            title: 'Point-in-time join',
            subtitle: 'as-of training',
            summary: '把每个 label join 到它时间点上的 feature 值，杜绝泄漏',
            kind: 'compute',
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
    { id: 'onlineRead', label: 'Online lookup 负载' },
    { id: 'onlineLatency', label: 'Online latency 压力' },
    { id: 'onlineStorage', label: 'Online store 体量' },
    { id: 'freshness', label: '新鲜度 vs 延迟预算' },
    { id: 'trainingJoin', label: 'Training join 开销' },
  ],
  decisions: [
    { id: 'storeSplit', title: 'Online/offline split' },
    { id: 'materialization', title: 'Materialization 模式' },
    { id: 'pointInTime', title: 'Point-in-time join' },
    { id: 'onlineStoreChoice', title: 'Online store 选型' },
    { id: 'registry', title: 'Feature registry' },
    { id: 'freshness', title: '新鲜度策略' },
  ],
  sourceBackedRules: [
    {
      title: 'feature store 把低延迟的 online store 和可扩展的 offline store 拆开',
      source: 'Feast Docs',
      url: 'https://docs.feast.dev/',
      summary:
        'Feast 把 feature materialize 进 online store 供 serving，又保留一个 offline store 做历史检索，于是同一套 feature 定义同时支撑两条路径。',
    },
    {
      title: 'Online/offline parity 才是 feature store 真正要解决的核心问题',
      source: 'Uber Michelangelo',
      url: 'https://www.uber.com/blog/michelangelo-machine-learning-platform/',
      summary:
        'Michelangelo 把 feature 只算一次，并在 training 和 serving 间共享，让模型在两边看到相同的值，避免 training/serving skew。',
    },
    {
      title: 'Training join 必须 point-in-time correct，才能避免 label 泄漏',
      source: 'Feast Point-in-Time Joins',
      url: 'https://docs.feast.dev/getting-started/concepts/point-in-time-joins',
      summary:
        'feature 必须按预测时间点 join 到 label；用 label 之后的值会泄漏未来信息，把 offline 指标虚高。',
    },
    {
      title: 'in-memory key-value store 能在亚毫秒延迟下服务 online feature',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/develop/',
      summary:
        '从 in-memory store 按 entity key 做 point lookup，能满足 warehouse 扫描达不到的紧 serving 预算。',
    },
  ],
  teachingAssumptions: [
    'online lookup 被建模为按 entity key 读一行 feature 的 point read；每次取回完整的 feature vector。',
    '单节点的读取、延迟、存储、join 预算都是保守的教学数字，不是厂商上限。',
    'online store 体量约等于 entity 数 x feature 数 x ~32 字节；真实系统还要加上 TTL、索引和 replication 开销。',
  ],
  teachingWalkthrough: [
    {
      id: 'inline',
      step: '01',
      focus: 'Feature 在请求路径里现算',
      scenarioId: 'inline',
      question:
        '单个模型在请求路径里、对 50k 个 key、以 20 lookup/s 算 15 个 feature。这时候你真的需要 feature store 吗？',
      reveal:
        '不需要。在这个量级下，模型可以直接从源数据里 inline 算出 feature。只有当 feature 必须跨模型共享、并在 training 里被以完全一致的方式复用时，feature store 才值回票价——而这些压力现在都还不存在。',
      takeaway: 'feature store 是复用和 parity 的基础设施；没有共享需求时，inline 计算更简单。',
    },
    {
      id: 'offline-batch',
      step: '02',
      focus: 'Offline batch feature',
      scenarioId: 'offline-batch',
      question:
        '现在你在 20M 行上做 training，想要可复现的 feature。第一块该加什么，为什么先从 offline 开始？',
      reveal:
        '用一个 batch job 把 feature 预算好写进 offline warehouse。training 读回这些值以保证可复现，同一份 transform 代码也就成了别人复用的定义。serving 这时仍然容忍慢，所以还不需要 online store。',
      takeaway: 'offline batch materialization 先来：它让 feature 在 serving 变严格之前就先做到可复现、可复用。',
    },
    {
      id: 'online-offline-split',
      step: '03',
      focus: 'Online/offline split',
      scenarioId: 'online-offline-split',
      question:
        'serving 现在要 30k lookup/s、控制在 25 ms 以内。撑 training 的那个 warehouse 还能顺带回答 online 读取吗？',
      reveal:
        '不行——在那个 QPS 下，warehouse 扫描满足不了 25 ms 的 point-read 预算。你要拆出一个低延迟的 online KV store，并把同样的 feature materialize 进去。硬性要求是 parity：两个 store 必须反映同一份计算，否则模型会看到 training/serving skew。',
      takeaway: '紧的 serving latency 逼出一个独立的 online store；整件事的活儿就是让它和 offline 保持 parity。',
    },
    {
      id: 'point-in-time',
      focus: 'Point-in-time join',
      step: '04',
      scenarioId: 'point-in-time',
      question:
        '在 5B 行上 training，你图省事把最新的 feature 值 join 到每个 label 上。什么东西会悄无声息地坏掉？',
      reveal:
        'label 泄漏。最新值反映的是 label 之后的数据，于是模型在用未来训练，offline 指标看着很漂亮，到生产里却崩盘。你需要一个 as-of（point-in-time）join，挑出每个 label 时间点上当时的 feature 值，而这比普通 join 贵得多。',
      takeaway: 'join 最新值会泄漏未来；point-in-time join 是换来正确 training 数据的代价。',
    },
    {
      id: 'streaming-scale',
      step: '05',
      focus: '大规模 streaming features',
      scenarioId: 'streaming-scale',
      question:
        '现在 feature 要在数十亿 key 上做到 5 秒新鲜。把 batch 跑得更频繁能做到吗？',
      reveal:
        '不行——就算 batch job 跑得再勤，新鲜度缺口也是分钟级的。秒级新鲜需要一条 streaming pipeline，从 event stream 更新 online store；而同一份计算还必须能在 offline 重放，才能让 training 和 serving 保持 parity。',
      takeaway: '秒级新鲜的 feature 需要 streaming，而 streaming 必须能 offline 重放，才能维持 parity。',
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
          ? `online store 按 entity key 每秒回答 ${formatRate(servingLookupsPerSecond)} 次 point lookup。`
          : 'serving 流量足够低，feature 可以现算或 inline 读取。',
      },
      onlineLatency: {
        ratio: latencyRatio,
        valueText: `${Math.round(onlineLatencyTargetMs)} ms 目标`,
        copy:
          onlineLatencyTargetMs < comfortableOnlineLatencyMs * 3
            ? `${Math.round(onlineLatencyTargetMs)} ms 的 p99 预算排除了 warehouse 读取；必须上一个 in-memory online store。`
            : `${Math.round(onlineLatencyTargetMs)} ms 的预算够宽松，通用数据库的一次读取就能满足；但 warehouse 仍然不行。`,
      },
      onlineStorage: {
        ratio: onlineStorageRatio,
        valueText: formatStorageGigabytes(onlineStorageGigabytes),
        copy: `${formatCount(entityCount)} 个 entity x ${formatCount(featureCount)} 个 feature，每个约 ${bytesPerFeatureValue} 字节。`,
      },
      freshness: {
        ratio: freshnessRatio,
        valueText: formatFreshness(streamFreshnessSeconds),
        copy:
          streamFreshnessSeconds < comfortableStreamFreshnessSeconds
            ? `${formatFreshness(streamFreshnessSeconds)} 的新鲜度预算低于周期性 batch 能给的水平；改成 stream 更新。`
            : `${formatFreshness(streamFreshnessSeconds)} 的新鲜度预算对定时 batch materialization 来说很从容。`,
      },
      trainingJoin: {
        ratio: trainingJoinRatio,
        valueText: `${formatCount(trainingRows)} 行`,
        copy: needsPointInTime
          ? `在 ${formatCount(trainingRows)} 行上做 point-in-time join，要用 as-of 查找扫描约 ${formatStorageGigabytes(trainingScanGigabytes)} 的历史。`
          : `在 ${formatCount(trainingRows)} 行上做普通 join，读取约 ${formatStorageGigabytes(trainingScanGigabytes)} 的 feature。`,
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
      text: `feature 被预算进 offline store，于是 ${formatCount(
        analysis.trainingRows,
      )} 行 training 数据读到的是可复现的值，同一份 transform 代码也成了共享的定义。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '只有一个模型、training set 又很小，feature 可以从源数据 inline 算出来——还没到 offline store 值回票价的时候。',
    });
  }

  if (analysis.needsOnlineStore) {
    reasons.push({
      severity: analysis.needsOnlineScaleOut ? 'danger' : 'warning',
      text: `在 ${Math.round(
        analysis.onlineLatencyTargetMs,
      )} ms 预算下做 ${formatRate(
        analysis.servingLookupsPerSecond,
      )} lookup/s，需要一个专门的低延迟 online store，和 warehouse 分开。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'serving 的负载和延迟都够宽松，feature 可以现算或 inline 读取，不需要 online store。',
    });
  }

  if (analysis.needsOnlineStore) {
    reasons.push({
      severity: 'warning',
      text: 'online 和 offline 两个 store 必须反映同一份计算，否则模型会遇到 training/serving skew——parity 是核心约束。',
    });
  }

  if (analysis.needsPointInTime) {
    reasons.push({
      severity: analysis.trainingJoinRatio > 1 ? 'danger' : 'warning',
      text: `在 ${formatCount(
        analysis.trainingRows,
      )} 行上做 training 必须用 point-in-time（as-of）join；用最新值会把未来数据泄漏进 training。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'training set 很小，普通的 feature join 还能接受，但一旦 label 横跨时间就要当心泄漏。',
    });
  }

  if (analysis.needsStreaming) {
    reasons.push({
      severity: 'warning',
      text: `${formatFreshness(
        analysis.streamFreshnessSeconds,
      )} 的新鲜度目标超出了 batch 的能力；把更新 stream 进 online store，并保持它在 offline 可重放。`,
    });
  } else if (analysis.needsOffline) {
    reasons.push({
      severity: 'ok',
      text: `${formatFreshness(
        analysis.streamFreshnessSeconds,
      )} 的新鲜度预算对定时 batch materialization 来说很从容，所以暂时不需要 streaming pipeline。`,
    });
  }

  if (analysis.needsOnlineScaleOut) {
    reasons.push({
      severity: 'danger',
      text: `${formatStorageGigabytes(
        analysis.onlineStorageGigabytes,
      )} 的 online 值（${formatCount(analysis.entityCount)} 个 entity x ${formatCount(
        analysis.featureCount,
      )} 个 feature）加上读取速率，已经超出单节点；把 online store 做 shard。`,
    });
  }

  if (analysis.needsRegistry) {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.featureCount,
      )} 个共享 feature 需要一个 registry，让定义和 transform 逻辑被复用，而不是每个模型各写一遍。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.featureCount,
      )} 个 feature、又只有一个消费方，feature registry 目前是额外负担；等 feature 跨模型共享了再回头看。`,
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
        ? '把低延迟 online store 从 offline warehouse 里拆出来；两者都从同一套 feature 定义 materialize。'
        : '一个 store 就够——serving 容忍走 training 读取的同一条路径。',
    },
    materialization: {
      state: flags.needsStreaming ? 'tradeoff' : flags.needsOffline ? 'useful' : 'not-yet',
      copy: flags.needsStreaming
        ? `跑 batch 做 backfill，再加一个 stream job 来满足 ${formatFreshness(
            flags.streamFreshnessSeconds,
          )} 的新鲜度目标；这条 stream 必须能在 offline 重放。`
        : flags.needsOffline
          ? '周期性的 batch job 把 feature 预算进各个 store；新鲜度很从容。'
          : '还不需要 materialization——feature 在请求时 inline 算出来。',
    },
    pointInTime: {
      state: flags.needsPointInTime ? 'needed' : 'not-yet',
      copy: flags.needsPointInTime
        ? `在 ${formatCount(
            flags.trainingRows,
          )} 行上，按每个 label 时间点 as-of join feature，让模型永远不会用未来训练。`
        : 'training set 还小、label 也不横跨时间时，普通 join 可以接受。',
    },
    onlineStoreChoice: {
      state: flags.needsOnlineScaleOut ? 'tradeoff' : flags.needsOnlineStore ? 'needed' : 'not-yet',
      copy: flags.needsOnlineScaleOut
        ? '用一个做了 shard 的 in-memory KV store（Redis 一类），按读取速率和值的体量来定规模。'
        : flags.needsOnlineStore
          ? `一个 in-memory KV store 能在 ${Math.round(flags.onlineLatencyTargetMs)} ms 预算内服务 ${formatRate(
              flags.servingLookupsPerSecond,
            )} lookup/s。`
          : '还没有 online store，所以也没有 online 引擎可选。',
    },
    registry: {
      state: flags.needsRegistry ? 'useful' : 'not-yet',
      copy: flags.needsRegistry
        ? `用一个 registry 来治理 ${formatCount(
            flags.featureCount,
          )} 个 feature 定义，让 training 和 serving 共享同一个 source of truth。`
        : 'feature 少、又只有一个模型——registry 目前是额外负担。',
    },
    freshness: {
      state: flags.needsStreaming ? 'needed' : flags.needsOffline ? 'useful' : 'not-yet',
      copy: flags.needsStreaming
        ? `近实时 stream feature，把过期程度压到 ${formatFreshness(flags.streamFreshnessSeconds)}。`
        : flags.needsOffline
          ? '定时 batch 让 feature 的新鲜度对当前预算来说足够。'
          : 'feature 还在 inline 计算时，新鲜度无关紧要。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsOnlineStore && !flags.needsOffline) {
    return 'Inline feature 计算';
  }
  if (flags.needsStreaming && flags.needsOnlineScaleOut) {
    return 'Streaming materialization + 分片 online store';
  }
  if (flags.needsOnlineStore && flags.needsPointInTime) {
    return 'Online/offline split + point-in-time training join';
  }
  if (flags.needsOnlineStore) {
    return 'Online/offline store split';
  }
  return 'Offline batch feature store';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsOnlineStore && !flags.needsOffline) {
    return '单个模型从源数据 inline 算 feature。没什么可共享的，所以现在还撑不起一个 feature store。';
  }
  if (flags.needsStreaming && flags.needsOnlineScaleOut) {
    return '一条 streaming pipeline 把分片的 online store 保持在秒级新鲜，同时同一份计算在 offline 重放，再用 point-in-time join 构建正确的 training set。';
  }
  if (flags.needsOnlineStore && flags.needsPointInTime) {
    return '一个低延迟 online store 与 offline warehouse 保持 parity 地服务 feature，training set 用 point-in-time join 构建以避免泄漏。';
  }
  if (flags.needsOnlineStore) {
    return '一个专门的 online store 低延迟地服务 feature，offline warehouse 保存历史；两者从同一套定义 materialize 以保证 parity。';
  }
  return 'batch job 把 feature 预算进 offline warehouse，让 training 可复现、transform 可复用。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsOnlineStore && !flags.needsOffline) {
    return 'Model -> inline 算 feature';
  }
  if (flags.needsStreaming && flags.needsOnlineScaleOut) {
    return 'Model -> serving API -> 分片 online store；stream + batch -> offline -> point-in-time join';
  }
  if (flags.needsOnlineStore && flags.needsPointInTime) {
    return 'Serving -> online store；training -> point-in-time join -> offline store';
  }
  if (flags.needsOnlineStore) {
    return 'Serving -> online store；batch -> online + offline store';
  }
  return 'Training -> batch job -> offline store';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function formatFreshness(seconds: number): string {
  if (seconds >= 86_400) {
    return `${Math.round(seconds / 86_400)} 天`;
  }
  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)} 小时`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} 分`;
  }
  return `${Math.round(seconds)} 秒`;
}
