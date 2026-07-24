import { buildColumnDiagram } from '../diagram-layout';
import {
  formatCount,
  formatDuration,
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

// Conservative teaching budgets. They expose the architectural inflection;
// they are not PostgreSQL, Redis, Kafka, or a cloud vendor benchmark.
const reactionBytesPerActiveRow = 112;
const comfortableSingleCounterWritesPerSecond = 1_000;
const comfortableCounterShardWritesPerSecond = 2_500;
const comfortableReactionWritesPerPartitionSecond = 50_000;
const asynchronousProjectionThresholdWritesPerSecond = 100_000;
const comfortableCountBackendReadsPerSecond = 50_000;
const comfortableCountShardReadsPerSecond = 1_000_000;
const asynchronousProjectionBaseLagSeconds = 0.5;
const countCacheTtlSeconds = 3;

export const youtubeLikeCounterLabDefinition: SystemDesignLabDefinition = {
  id: 'youtube-like-counter',
  eyebrow: '系统设计 Lab',
  title:
    'YouTube Like Counter 不是 blind INCR：先把 user-video reaction 保存为 source of truth，再让单行 counter、sharded counter 或异步 projection 承担不同规模下的公开计数。',
  summary:
    '调节 reaction rows、写入和 count-read QPS、热门视频流量占比、client retry、counter shard 数量、cache hit 与 freshness 预算。观察 Toggle 为什么不幂等、单行 counter 何时变成 hot row，以及什么时候应该把公开 count 拆成可重放的异步聚合。',
  controls: [
    {
      id: 'activeReactionRows',
      label: 'Active reaction rows',
      help: '当前非 NONE 的 user-video reaction 数量；这是可重算 aggregate 的 source of truth。',
      min: 100_000,
      max: 100_000_000_000,
      defaultValue: 10_000_000,
      scale: 'log',
      unit: 'rows',
      format: 'count',
    },
    {
      id: 'reactionWritesPerSecond',
      label: 'Reaction writes',
      help: 'LIKE、DISLIKE 和取消 reaction 的峰值逻辑写入速率，不包含网络 retry。',
      min: 10,
      max: 2_000_000,
      defaultValue: 2_000,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'countReadsPerSecond',
      label: 'Count-read QPS',
      help: '视频页面读取公开 Like / Dislike aggregate 的峰值速率。',
      min: 10,
      max: 20_000_000,
      defaultValue: 20_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'hotVideoWritePercent',
      label: '最热视频写入占比',
      help: '全部 reaction writes 中落到同一个爆款视频的比例；它比全局平均 QPS 更容易制造 hot key。',
      min: 0.01,
      max: 80,
      defaultValue: 1,
      scale: 'log',
      format: 'percentage',
    },
    {
      id: 'clientRetryPercent',
      label: 'Client retry rate',
      help: '超时或响应丢失后重复发送的请求比例；desired-state API 把它变成 no-op，toggle 会反转意图。',
      min: 0,
      max: 20,
      defaultValue: 1,
      scale: 'linear',
      format: 'percentage',
    },
    {
      id: 'counterShardCount',
      label: '每个热门视频的 counter shards',
      help: '用 hash(userId) 选择稳定 shard；更多 shards 降低写竞争，但增加 count-read fan-out。',
      min: 1,
      max: 1_024,
      defaultValue: 1,
      scale: 'log',
      unit: 'shards',
      format: 'count',
    },
    {
      id: 'countCacheHitPercent',
      label: 'Count cache hit rate',
      help: '公开 count read 命中同一热门 video key 的实测比例；cache 只保存 derived aggregate。',
      min: 0,
      max: 99.9,
      defaultValue: 0,
      scale: 'linear',
      format: 'percentage',
    },
    {
      id: 'freshnessBudgetSeconds',
      label: '公开 Count freshness 预算',
      help: '允许 aggregate 比 user reaction truth 落后多久；用户自己的 reaction 仍然 read-your-writes。',
      min: 0.1,
      max: 60,
      defaultValue: 5,
      scale: 'log',
      format: 'duration-seconds',
    },
  ],
  toggles: [
    {
      id: 'toggleStyleApi',
      label: '公开 API 使用 Toggle',
      help: '重试同一个 toggle 会再次翻转状态；打开后观察 retry 如何直接变成 correctness risk。',
      defaultValue: false,
    },
    {
      id: 'strictRealtimeCount',
      label: '公开 Count 必须同步精确',
      help: 'Reaction API 返回前必须更新可读取 count；这会把 hot counter 放回写入 latency 和 availability 路径。',
      defaultValue: true,
    },
    {
      id: 'multiRegionWrites',
      label: '允许 Multi-region 写入',
      help: '同一个 user-video key 可能在不同 region 并发更新，需要 key ownership 或 versioned winner。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'transactional-counter',
      step: '01',
      title: 'PostgreSQL Transaction',
      summary: '低流量时，reaction truth 与单行 counter 在一个 transaction 内提交。',
      values: {
        activeReactionRows: 1_000_000,
        reactionWritesPerSecond: 200,
        countReadsPerSecond: 2_000,
        hotVideoWritePercent: 1,
        clientRetryPercent: 1,
        counterShardCount: 1,
        countCacheHitPercent: 0,
        freshnessBudgetSeconds: 5,
        toggleStyleApi: false,
        strictRealtimeCount: true,
        multiRegionWrites: false,
      },
    },
    {
      id: 'toggle-retry-trap',
      step: '02',
      title: 'Toggle + Retry 陷阱',
      summary: '流量没有变化，但响应丢失后的 retry 会把已经成功的 Like 取消。',
      values: {
        activeReactionRows: 1_000_000,
        reactionWritesPerSecond: 200,
        countReadsPerSecond: 2_000,
        hotVideoWritePercent: 1,
        clientRetryPercent: 8,
        counterShardCount: 1,
        countCacheHitPercent: 0,
        freshnessBudgetSeconds: 5,
        toggleStyleApi: true,
        strictRealtimeCount: true,
        multiRegionWrites: false,
      },
    },
    {
      id: 'viral-video-hot-row',
      step: '03',
      title: '爆款视频 Hot Row',
      summary: '全局写入不算极端，但 20% 集中到一个视频，单 counter row 开始串行化。',
      values: {
        activeReactionRows: 100_000_000,
        reactionWritesPerSecond: 50_000,
        countReadsPerSecond: 20_000,
        hotVideoWritePercent: 20,
        clientRetryPercent: 1,
        counterShardCount: 1,
        countCacheHitPercent: 0,
        freshnessBudgetSeconds: 5,
        toggleStyleApi: false,
        strictRealtimeCount: true,
        multiRegionWrites: false,
      },
    },
    {
      id: 'synchronous-counter-shards',
      step: '04',
      title: '同步 Counter Shards',
      summary: '64 个稳定 shard 分散热门视频写入，同时继续提供同步精确 aggregate。',
      values: {
        activeReactionRows: 100_000_000,
        reactionWritesPerSecond: 50_000,
        countReadsPerSecond: 5_000,
        hotVideoWritePercent: 20,
        clientRetryPercent: 1,
        counterShardCount: 64,
        countCacheHitPercent: 0,
        freshnessBudgetSeconds: 5,
        toggleStyleApi: false,
        strictRealtimeCount: true,
        multiRegionWrites: false,
      },
    },
    {
      id: 'asynchronous-aggregate',
      step: '05',
      title: '异步 Aggregate',
      summary: 'Reaction truth 同步提交；Outbox、Event Log 和 Aggregator 在 5 秒预算内更新公开 count。',
      values: {
        activeReactionRows: 10_000_000_000,
        reactionWritesPerSecond: 400_000,
        countReadsPerSecond: 2_000_000,
        hotVideoWritePercent: 20,
        clientRetryPercent: 2,
        counterShardCount: 128,
        countCacheHitPercent: 95,
        freshnessBudgetSeconds: 5,
        toggleStyleApi: false,
        strictRealtimeCount: false,
        multiRegionWrites: false,
      },
    },
    {
      id: 'multi-region-state-ordering',
      step: '06',
      title: 'Multi-region 状态顺序',
      summary: '用户多设备跨 region 更新时，先决定 winning reaction，再异步投影 global count。',
      values: {
        activeReactionRows: 30_000_000_000,
        reactionWritesPerSecond: 800_000,
        countReadsPerSecond: 5_000_000,
        hotVideoWritePercent: 25,
        clientRetryPercent: 3,
        counterShardCount: 256,
        countCacheHitPercent: 98,
        freshnessBudgetSeconds: 5,
        toggleStyleApi: false,
        strictRealtimeCount: false,
        multiRegionWrites: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'YouTube Like Counter 架构图',
    description:
      '白板风格 Like Counter 架构：Reaction Store 保存 user-video truth；低流量时同步更新 counter，高流量时通过 Outbox、Event Log 和 Aggregator 产生 sharded aggregate，Count Cache 只服务公开读取。',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'viewer',
            title: 'Viewer',
            subtitle: 'set + read reaction',
            summary: '用 desired state 设置自己的 reaction，并读取公开 aggregate',
            kind: 'client',
          },
        ],
      },
      {
        id: 'apis',
        label: 'APIs',
        variant: 'edge',
        nodes: [
          {
            id: 'reactionApi',
            title: 'Reaction API',
            subtitle: 'idempotent set',
            summary: '按 user-video key 串行化 transition，返回用户自己的最新 reaction',
            kind: 'api',
          },
          {
            id: 'countApi',
            title: 'Count API',
            subtitle: 'serve aggregate',
            summary: '读取 cache 或聚合 counter shards，并标注 count 的 as-of 时间',
            kind: 'api',
          },
        ],
      },
      {
        id: 'truth',
        label: 'Source of truth',
        variant: 'storage',
        nodes: [
          {
            id: 'reactionStore',
            title: 'Reaction store',
            subtitle: '(video, user) state',
            summary: '保存当前 reaction、version 和 updated_at；复合主键阻止重复状态',
            kind: 'db',
          },
          {
            id: 'outbox',
            title: 'Outbox / CDC',
            subtitle: 'capture commits',
            summary: '把已提交的 reaction transition 可靠地交给异步 projection',
            kind: 'stream',
          },
        ],
      },
      {
        id: 'projection',
        label: 'Count projection',
        variant: 'processing',
        nodes: [
          {
            id: 'eventLog',
            title: 'Partitioned log',
            subtitle: 'order by user-video',
            summary: '同一个 user-video key 保持顺序，支持 retry、replay 和 backpressure',
            kind: 'queue',
          },
          {
            id: 'aggregator',
            title: 'Counter aggregator',
            subtitle: 'versioned transition',
            summary: '去重 event，并用 previous -> desired transition 更新 materialized count',
            kind: 'compute',
          },
          {
            id: 'shardedCounts',
            title: 'Counter shards',
            subtitle: 'video + user hash',
            summary: '分散热门视频写入；count read 对 shards 求和或读取 snapshot',
            kind: 'nosql',
          },
        ],
      },
      {
        id: 'serving',
        label: 'Serving',
        variant: 'backbone',
        nodes: [
          {
            id: 'countCache',
            title: 'Count cache',
            subtitle: 'short-lived snapshot',
            summary: '只缓存 derived aggregate；TTL、refresh 和 pipeline lag 一起决定 freshness',
            kind: 'cache',
          },
        ],
      },
    ],
    flows: [
      { from: 'viewer', to: 'reactionApi', variant: 'primary' },
      { from: 'viewer', to: 'countApi', variant: 'direct' },
      { from: 'reactionApi', to: 'reactionStore', variant: 'primary' },
      { from: 'reactionApi', to: 'shardedCounts', variant: 'direct' },
      { from: 'reactionStore', to: 'outbox', variant: 'secondary' },
      { from: 'outbox', to: 'eventLog', variant: 'secondary' },
      { from: 'eventLog', to: 'aggregator', variant: 'secondary' },
      { from: 'aggregator', to: 'shardedCounts', variant: 'secondary' },
      { from: 'countApi', to: 'countCache', variant: 'primary' },
      { from: 'countApi', to: 'shardedCounts', variant: 'direct' },
      { from: 'countCache', to: 'shardedCounts', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'retrySafety', label: 'Retry correctness' },
    { id: 'hotCounter', label: '最热 Counter shard 写入压力' },
    { id: 'reactionWritePath', label: 'Reaction truth 写入分区' },
    { id: 'countReadPath', label: 'Count backend read fan-out' },
    { id: 'freshness', label: '公开 Count freshness' },
    { id: 'truthStorage', label: 'Reaction truth storage' },
  ],
  decisions: [
    { id: 'desiredStateApi', title: 'Desired-state API' },
    { id: 'reactionTruth', title: 'User-video reaction truth' },
    { id: 'atomicTransition', title: 'Atomic state transition' },
    { id: 'counterShards', title: 'Per-video counter sharding' },
    { id: 'asyncProjection', title: 'Outbox + async projection' },
    { id: 'countCache', title: 'Public count cache' },
    { id: 'keyOwnership', title: 'Per-key ordering / region ownership' },
    { id: 'reconciliation', title: 'Reconciliation' },
  ],
  sourceBackedRules: [
    {
      title: '复合 Primary Key 可以强制一个 user-video pair 只有一行',
      source: 'PostgreSQL — Constraints',
      url: 'https://www.postgresql.org/docs/current/ddl-constraints.html',
      summary:
        'PostgreSQL 的 primary key 可以跨多列，并自动建立 unique B-tree index；(video_id, user_id) 因此既表达 identity，也在并发下保护唯一状态。',
    },
    {
      title: 'INSERT ... ON CONFLICT 提供确定的 upsert 路径',
      source: 'PostgreSQL — INSERT',
      url: 'https://www.postgresql.org/docs/current/sql-insert.html',
      summary:
        'Reaction 写入可以让复合 unique key 作为 conflict target，再结合 transaction、version 或 row lock 完成 previous -> desired transition。',
    },
    {
      title: 'Row-level lock 会阻塞同一 row 的并发 writer',
      source: 'PostgreSQL — Explicit Locking',
      url: 'https://www.postgresql.org/docs/current/explicit-locking.html',
      summary:
        '这能序列化同一个 reaction 或 counter row，也解释了为什么爆款视频的单 counter row 会成为 hot lock。',
    },
    {
      title: 'Redis INCR 是 O(1) 原子计数 primitive，但不知道业务 previous state',
      source: 'Redis — INCR',
      url: 'https://redis.io/docs/latest/commands/incr/',
      summary:
        'INCR 能原子增加一个整数；它不会判断请求是否 retry、用户是否已经 LIKE，或 LIKE -> DISLIKE 应该应用哪两个 delta。',
    },
    {
      title: '同一个 event key 放进同一 Kafka partition 可以保序',
      source: 'Apache Kafka — Introduction',
      url: 'https://kafka.apache.org/documentation/',
      summary:
        '把 (video_id, user_id) 作为 event key，可让 consumer 按写入顺序看到该用户对该视频的 transitions；系统不需要昂贵的全局顺序。',
    },
    {
      title: 'Outbox 把业务状态与待发布 event 放进同一个 transaction',
      source: 'Debezium — Outbox Event Router',
      url: 'https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html',
      summary:
        'Reaction row 与 outbox row 一起 commit；CDC / Relay 之后再发布 event，避免数据库成功而消息永久丢失的同步双写。',
    },
  ],
  teachingAssumptions: [
    '所有 throughput、latency 与 storage 公式只用于展示架构拐点，不是 PostgreSQL、Redis、Kafka 或任何云服务的性能承诺。',
    '单 counter row 的舒适教学预算设为 1k writes/s；counter shard 设为 2.5k writes/s。真实边界必须用 row-lock wait、p95 和 skew 压测。',
    'Reaction truth 每个 active row 按约 112 bytes 估算，包含 row、primary key 和基础存储放大；实际 schema、compression 与 replica 会改变结果。',
    '异步 projection 的基础 lag 设为 500ms；3 秒 count-cache TTL 会叠加到公开可见 freshness。',
    'Desired-state API 让网络 retry 成为幂等 no-op；它仍需要底层 transaction/version 来处理并发 winner。',
    '同一个 user-video key 映射到稳定 counter shard 和 event partition；公开 count 可以最终一致，用户自己的 reaction 始终读取 source of truth。',
    'Reconciliation 可以从 UserVideoReaction 重算 aggregate；任何不能重建的 count 都被错误地当成了 source of truth。',
  ],
  teachingWalkthrough: [
    {
      id: 'start-with-transaction',
      step: '01',
      focus: '先保存状态',
      scenarioId: 'transactional-counter',
      question:
        '只有 200 reaction writes/s。应该直接用 Redis INCR，还是先保存 `(video_id, user_id) -> reaction`？',
      reveal:
        '先保存 reaction truth。重复 LIKE 必须是 no-op，LIKE -> DISLIKE 要同时应用 -1/+1；blind INCR 看不到 previous state。低流量时，PostgreSQL transaction 可以同时更新 reaction row 和一个 per-video counter row。',
      takeaway: 'Like Counter 先是状态机，之后才是 counter。',
    },
    {
      id: 'remove-toggle',
      step: '02',
      focus: 'Retry 改变 API',
      scenarioId: 'toggle-retry-trap',
      question:
        '服务端成功执行 toggle，但响应丢失；8% 请求会 retry。第二次 toggle 代表同一个意图吗？',
      reveal:
        '不代表。它会把刚成功的 LIKE 再切回 NONE。公开 API 应表达 desired state：重复 set LIKE 仍是 LIKE。Request ID 可以补充去重，但不能修复 toggle 本身的含糊语义。',
      takeaway: '幂等从 API contract 开始，不是从 Queue 配置开始。',
    },
    {
      id: 'find-hot-row',
      step: '03',
      focus: 'Skew 接管容量',
      scenarioId: 'viral-video-hot-row',
      question:
        '50k global writes/s 中有 20% 落到一个视频。数据库还有 CPU，为什么 latency 仍会突然上升？',
      reveal:
        '这个视频的 10k writes/s 全部竞争同一个 counter row。全局扩容不能消除单 key serialization；应该先量化 hottest-video QPS，再决定 counter shards。',
      takeaway: 'Counter 的边界由最热 key 决定，不由平均 QPS 决定。',
    },
    {
      id: 'shard-counter',
      step: '04',
      focus: '写分散，读求和',
      scenarioId: 'synchronous-counter-shards',
      question:
        '把热门视频拆成 64 个 counter shards 后，怎样保证 Unlike 找到之前 Like 的同一个 shard？',
      reveal:
        '使用稳定的 hash(user_id) 选 shard；同一 user-video 的所有 transitions 永远落到同一 shard。写竞争下降到约 156 writes/s/shard，但 count read 需要 sum 64 行。',
      takeaway: '稳定 shard function 用读放大换走单行写竞争。',
    },
    {
      id: 'project-asynchronously',
      step: '05',
      focus: '拆开一致性边界',
      scenarioId: 'asynchronous-aggregate',
      question:
        '400k writes/s 下，用户自己的按钮状态和公开 count 是否必须使用同一种 consistency？',
      reveal:
        '不必。Reaction API 同步提交 user-video truth 与 outbox，保证 read-your-writes；Event Log 和 Aggregator 异步更新公开 count。Consumer 用 event ID、version 和 per-key order 抵抗 duplicate 与乱序。',
      takeaway: '同步用户意图，异步公共聚合。',
    },
    {
      id: 'order-multi-region-state',
      step: '06',
      focus: '先决定 Winner',
      scenarioId: 'multi-region-state-ordering',
      question:
        '手机在 Region A set LIKE，浏览器同时在 Region B set DISLIKE。两个 region 可以各自改 count 再合并吗？',
      reveal:
        '不能先合并 counter 再猜用户状态。先用 home-region ownership、single-writer partition 或 versioned conditional write 决定 winning reaction；只有 winning transitions 才进入 global aggregate。',
      takeaway: 'Multi-region 首先是 per-key ordering 问题，不是数字相加问题。',
    },
  ],
  analyze: analyzeYouTubeLikeCounterWorkload,
};

function analyzeYouTubeLikeCounterWorkload(workload: WorkloadValues): LabAnalysis {
  const activeReactionRows = numericValue(workload, 'activeReactionRows');
  const reactionWritesPerSecond = numericValue(workload, 'reactionWritesPerSecond');
  const countReadsPerSecond = numericValue(workload, 'countReadsPerSecond');
  const hotVideoWritePercent = numericValue(workload, 'hotVideoWritePercent');
  const clientRetryPercent = numericValue(workload, 'clientRetryPercent');
  const counterShardCount = Math.max(1, Math.round(numericValue(workload, 'counterShardCount')));
  const countCacheHitPercent = numericValue(workload, 'countCacheHitPercent');
  const freshnessBudgetSeconds = numericValue(workload, 'freshnessBudgetSeconds');
  const toggleStyleApi = Boolean(workload.toggleStyleApi);
  const strictRealtimeCount = Boolean(workload.strictRealtimeCount);
  const multiRegionWrites = Boolean(workload.multiRegionWrites);

  const retryRequestsPerSecond = reactionWritesPerSecond * (clientRetryPercent / 100);
  const receivedReactionRequestsPerSecond =
    reactionWritesPerSecond + retryRequestsPerSecond;
  const unsafeToggleTransitionsPerSecond = toggleStyleApi ? retryRequestsPerSecond : 0;

  const hotVideoWritesPerSecond =
    receivedReactionRequestsPerSecond * (hotVideoWritePercent / 100);
  const perCounterShardWritesPerSecond = hotVideoWritesPerSecond / counterShardCount;
  const singleCounterPressure =
    hotVideoWritesPerSecond / comfortableSingleCounterWritesPerSecond;
  const counterShardPressure =
    perCounterShardWritesPerSecond / comfortableCounterShardWritesPerSecond;
  const needsCounterShards = singleCounterPressure > 1;
  const configuredCounterShardsSufficient = counterShardPressure <= 1;

  const reactionPartitionCount = Math.max(
    1,
    Math.ceil(
      receivedReactionRequestsPerSecond /
        comfortableReactionWritesPerPartitionSecond,
    ),
  );
  const shouldUseAsyncProjection =
    !strictRealtimeCount &&
    (reactionWritesPerSecond >= asynchronousProjectionThresholdWritesPerSecond ||
      counterShardPressure > 1 ||
      multiRegionWrites);

  const cacheActive = countCacheHitPercent > 0;
  const backendCountReadsPerSecond =
    countReadsPerSecond * (1 - countCacheHitPercent / 100);
  const backendCountShardReadsPerSecond =
    backendCountReadsPerSecond * counterShardCount;
  const needsCountCache =
    countReadsPerSecond > comfortableCountBackendReadsPerSecond ||
    backendCountShardReadsPerSecond > comfortableCountShardReadsPerSecond;

  const asyncThroughputPressure = Math.max(
    1,
    reactionWritesPerSecond /
      asynchronousProjectionThresholdWritesPerSecond,
  );
  const asyncShardPressure = Math.max(1, counterShardPressure);
  const projectionLagSeconds = shouldUseAsyncProjection
    ? asynchronousProjectionBaseLagSeconds *
      Math.sqrt(asyncThroughputPressure * asyncShardPressure)
    : 0.02;
  const visibleCountFreshnessSeconds =
    projectionLagSeconds + (cacheActive ? countCacheTtlSeconds : 0);
  const countFreshnessViolated =
    visibleCountFreshnessSeconds > freshnessBudgetSeconds;

  const truthStorageGigabytes =
    (activeReactionRows * reactionBytesPerActiveRow) / 1_000_000_000;
  const synchronousWritePressure = Math.max(
    counterShardPressure,
    receivedReactionRequestsPerSecond /
      (reactionPartitionCount * comfortableReactionWritesPerPartitionSecond),
  );
  const strictSynchronousPathOverloaded =
    strictRealtimeCount && synchronousWritePressure > 1;

  const flags = {
    toggleStyleApi,
    unsafeToggleTransitionsPerSecond,
    strictRealtimeCount,
    needsCounterShards,
    configuredCounterShardsSufficient,
    shouldUseAsyncProjection,
    cacheActive,
    needsCountCache,
    countFreshnessViolated,
    multiRegionWrites,
    strictSynchronousPathOverloaded,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: shouldUseAsyncProjection
      ? cacheActive
        ? 'Reaction API -> Reaction Store + Outbox -> Event Log -> Aggregator -> Counter Shards -> Count Cache'
        : 'Reaction API -> Reaction Store + Outbox -> Event Log -> Aggregator -> Counter Shards'
      : cacheActive
        ? 'Reaction API -> Reaction Store + synchronous Counter Shards；Count API -> Count Cache -> shards on miss'
        : 'Reaction API -> one transaction: Reaction Store + synchronous Counter Shards；Count API -> shard sum',
    nodeStates: {
      viewer: 'ok',
      reactionApi: unsafeToggleTransitionsPerSecond > 0
        ? 'overloaded'
        : strictSynchronousPathOverloaded
          ? 'warning'
          : 'ok',
      countApi: countFreshnessViolated
        ? 'warning'
        : backendCountShardReadsPerSecond > comfortableCountShardReadsPerSecond
          ? 'overloaded'
          : 'ok',
      reactionStore: 'needed',
      outbox: shouldUseAsyncProjection ? 'needed' : 'inactive',
      eventLog: shouldUseAsyncProjection ? 'needed' : 'inactive',
      aggregator: shouldUseAsyncProjection
        ? countFreshnessViolated
          ? 'warning'
          : 'needed'
        : 'inactive',
      shardedCounts: needsCounterShards
        ? configuredCounterShardsSufficient
          ? 'needed'
          : 'overloaded'
        : 'ok',
      countCache: cacheActive
        ? countFreshnessViolated
          ? 'warning'
          : 'needed'
        : needsCountCache
          ? 'warning'
          : 'inactive',
    },
    flowStates: {
      viewerToReactionApi: 'active',
      viewerToCountApi: 'active',
      reactionApiToReactionStore: 'active',
      reactionApiToShardedCounts: shouldUseAsyncProjection ? 'inactive' : 'active',
      reactionStoreToOutbox: shouldUseAsyncProjection ? 'active' : 'inactive',
      outboxToEventLog: shouldUseAsyncProjection ? 'active' : 'inactive',
      eventLogToAggregator: shouldUseAsyncProjection ? 'active' : 'inactive',
      aggregatorToShardedCounts: shouldUseAsyncProjection ? 'active' : 'inactive',
      countApiToCountCache: cacheActive ? 'active' : 'inactive',
      countApiToShardedCounts: cacheActive ? 'inactive' : 'active',
      countCacheToShardedCounts: cacheActive ? 'active' : 'inactive',
    },
    meters: {
      retrySafety: {
        ratio: toggleStyleApi
          ? unsafeToggleTransitionsPerSecond / Math.max(1, reactionWritesPerSecond * 0.01)
          : 0,
        valueText: toggleStyleApi
          ? `${formatRate(unsafeToggleTransitionsPerSecond)} unsafe/s`
          : `${formatRate(retryRequestsPerSecond)} idempotent retries/s`,
        copy: toggleStyleApi
          ? `${formatPercent(clientRetryPercent)} retry 会再次执行 toggle，约 ${formatRate(
              unsafeToggleTransitionsPerSecond,
            )} requests/s 可能反转已经成功的用户意图。`
          : `PUT desired state 让 ${formatRate(
              retryRequestsPerSecond,
            )} retries/s 成为 no-op；底层仍用 version/transaction 决定并发 winner。`,
      },
      hotCounter: {
        ratio: counterShardPressure,
        valueText: `${formatRate(perCounterShardWritesPerSecond)} writes/s/shard`,
        copy: `${formatRate(
          receivedReactionRequestsPerSecond,
        )} received writes/s × ${formatPercent(
          hotVideoWritePercent,
        )} hot-video share ÷ ${formatCount(
          counterShardCount,
        )} shards = 约 ${formatRate(perCounterShardWritesPerSecond)} writes/s/shard。`,
      },
      reactionWritePath: {
        ratio:
          receivedReactionRequestsPerSecond /
          (reactionPartitionCount * comfortableReactionWritesPerPartitionSecond),
        valueText: `${formatCount(reactionPartitionCount)} truth partitions`,
        copy: `按 hash(video_id, user_id) 分散约 ${formatRate(
          receivedReactionRequestsPerSecond,
        )} requests/s；同一个 key 的 transition 仍然串行。`,
      },
      countReadPath: {
        ratio:
          backendCountShardReadsPerSecond /
          comfortableCountShardReadsPerSecond,
        valueText: `${formatRate(backendCountShardReadsPerSecond)} shard reads/s`,
        copy: cacheActive
          ? `${formatPercent(countCacheHitPercent)} cache hit 把 ${formatRate(
              countReadsPerSecond,
            )} incoming reads/s 降为 ${formatRate(
              backendCountReadsPerSecond,
            )} backend reads/s，再乘 ${formatCount(counterShardCount)} shards。`
          : `${formatRate(
              countReadsPerSecond,
            )} count reads/s 每次 sum ${formatCount(
              counterShardCount,
            )} shards；热门 read fan-out 尚未被 cache 吸收。`,
      },
      freshness: {
        ratio: visibleCountFreshnessSeconds / freshnessBudgetSeconds,
        valueText: shouldUseAsyncProjection || cacheActive
          ? `最坏约 ${formatDuration(visibleCountFreshnessSeconds)}`
          : 'transactional',
        copy: shouldUseAsyncProjection || cacheActive
          ? `${formatDuration(
              projectionLagSeconds,
            )} projection lag${cacheActive ? ` + ${countCacheTtlSeconds} 秒 cache TTL` : ''}；预算是 ${formatDuration(
              freshnessBudgetSeconds,
            )}。`
          : 'Reaction truth 与公开 count 在同一个 transaction 更新；当前没有异步或 cache lag。',
      },
      truthStorage: {
        ratio: truthStorageGigabytes / 1_000,
        valueText: `约 ${formatStorageGigabytes(truthStorageGigabytes)}`,
        copy: `${formatCount(activeReactionRows)} active rows × 约 ${reactionBytesPerActiveRow} bytes/row；replica、WAL 和历史 event storage 尚未计入。`,
      },
    },
    decisions: buildDecisions({
      ...flags,
      perCounterShardWritesPerSecond,
      counterShardCount,
      countCacheHitPercent,
      visibleCountFreshnessSeconds,
      freshnessBudgetSeconds,
      multiRegionWrites,
    }),
    reasons: buildReasons({
      ...flags,
      clientRetryPercent,
      hotVideoWritesPerSecond,
      perCounterShardWritesPerSecond,
      counterShardCount,
      backendCountShardReadsPerSecond,
      visibleCountFreshnessSeconds,
      freshnessBudgetSeconds,
      multiRegionWrites,
    }),
    nodeTitles: {
      shardedCounts:
        counterShardCount === 1
          ? 'Single counter row'
          : `Counter shards · ${formatCount(counterShardCount)}`,
      countCache: `Count cache · ${formatPercent(countCacheHitPercent)} hit`,
      reactionApi: toggleStyleApi ? 'Toggle Reaction API' : 'Set Reaction API',
    },
    nodeCopies: {
      reactionApi: toggleStyleApi
        ? '相同 retry 会再次翻转 reaction；API contract 本身不是幂等。'
        : 'PUT desired state；相同 retry 是 no-op，并用 version/transaction 处理并发。',
      shardedCounts:
        counterShardCount === 1
          ? '每个视频只有一个 aggregate row；简单，但爆款视频会形成 hot lock。'
          : `hash(user_id) 选择 ${formatCount(
              counterShardCount,
            )} 个稳定 shards；count read 求和或读取 snapshot。`,
      countCache: cacheActive
        ? `保存 derived count snapshot，TTL ${countCacheTtlSeconds} 秒；不是 reaction source of truth。`
        : '当前不缓存公开 count；Count API 直接读取或聚合 counter shards。',
    },
  };
}

type ArchitectureFlags = {
  toggleStyleApi: boolean;
  unsafeToggleTransitionsPerSecond: number;
  strictRealtimeCount: boolean;
  needsCounterShards: boolean;
  configuredCounterShardsSufficient: boolean;
  shouldUseAsyncProjection: boolean;
  cacheActive: boolean;
  needsCountCache: boolean;
  countFreshnessViolated: boolean;
  multiRegionWrites: boolean;
  strictSynchronousPathOverloaded: boolean;
};

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (flags.toggleStyleApi && flags.unsafeToggleTransitionsPerSecond > 0) {
    return '先修 API：Toggle + Retry 会反转用户意图';
  }
  if (flags.shouldUseAsyncProjection && flags.multiRegionWrites) {
    return 'Per-key ownership + 异步 Global Count Projection';
  }
  if (flags.shouldUseAsyncProjection) {
    return 'Reaction Truth + Outbox / Event Log + 异步 Aggregate';
  }
  if (flags.needsCounterShards && !flags.configuredCounterShardsSufficient) {
    return '同步 Counter Shards 不足，Hot Key 仍然过载';
  }
  if (flags.needsCounterShards) {
    return 'PostgreSQL Reaction Truth + 同步 Sharded Counters';
  }
  return 'PostgreSQL Transaction：Reaction + 单 Counter Row';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (flags.toggleStyleApi && flags.unsafeToggleTransitionsPerSecond > 0) {
    return '流量和数据库都不是当前第一问题。把 toggle 改成 idempotent set-reaction API，否则响应丢失后的合法 retry 会直接破坏用户状态与 count。';
  }
  if (flags.shouldUseAsyncProjection) {
    return flags.countFreshnessViolated
      ? 'Reaction truth 仍同步正确，但 projection lag 与 cache TTL 已超过公开 freshness 预算；需要增加 aggregator capacity、缩短 TTL 或放宽 SLO。'
      : 'User-video reaction 同步提交并提供 read-your-writes；公开 count 通过可重放、带 version 的异步 projection 在预算内收敛。';
  }
  if (flags.needsCounterShards) {
    return flags.configuredCounterShardsSufficient
      ? '稳定的 user hash 把一个热门视频的写入分散到多个 counter rows；公开 count 仍同步精确，但读取需要 sum shards。'
      : '单个或过少的 counter shards 仍在串行化热门视频写入；增加 shards，或在允许有界陈旧时拆出异步 aggregate。';
  }
  return '一份 PostgreSQL transaction 同时维护 user-video reaction truth 与 per-video aggregate；当前流量下不需要 Event Log 或 Cache。';
}

function buildDecisions(
  analysis: ArchitectureFlags & {
    perCounterShardWritesPerSecond: number;
    counterShardCount: number;
    countCacheHitPercent: number;
    visibleCountFreshnessSeconds: number;
    freshnessBudgetSeconds: number;
    multiRegionWrites: boolean;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    desiredStateApi: {
      state: analysis.toggleStyleApi ? 'tradeoff' : 'needed',
      copy: analysis.toggleStyleApi
        ? 'Toggle 把语义依赖于服务端当前状态；同一个 retry 会反转意图。改为 PUT LIKE / DISLIKE / NONE。'
        : '相同 desired state 可以安全重试；重复 set LIKE 不会再次增加 count。',
    },
    reactionTruth: {
      state: 'needed',
      copy: '(video_id, user_id) composite key 保存当前 reaction 与 version；aggregate 漂移时可以从这里重建。',
    },
    atomicTransition: {
      state: 'needed',
      copy: '读取 previous、决定 winner、应用 LIKE/DISLIKE deltas、写入 desired state 必须形成一个 serialization unit。',
    },
    counterShards: {
      state: analysis.needsCounterShards
        ? analysis.configuredCounterShardsSufficient
          ? 'needed'
          : 'tradeoff'
        : analysis.counterShardCount > 1
          ? 'useful'
          : 'not-yet',
      copy: analysis.needsCounterShards
        ? `${formatRate(
            analysis.perCounterShardWritesPerSecond,
          )} hot writes/s/shard；使用稳定 hash(user_id) 分散写入，并承担 count-read fan-out。`
        : '单 counter row 尚未达到教学压力边界；提前分片只会增加读放大和迁移复杂度。',
    },
    asyncProjection: {
      state: analysis.shouldUseAsyncProjection
        ? analysis.countFreshnessViolated
          ? 'tradeoff'
          : 'needed'
        : analysis.strictRealtimeCount && analysis.strictSynchronousPathOverloaded
          ? 'tradeoff'
          : 'not-yet',
      copy: analysis.shouldUseAsyncProjection
        ? 'Reaction + Outbox 同 transaction commit；Event Log 按 user-video key 保序，Aggregator 用 event ID/version 去重并更新 shards。'
        : analysis.strictRealtimeCount
          ? '公开 count 必须同步精确，因此继续留在 Reaction write path；需要接受 hot-shard latency 和 availability coupling。'
          : '当前同步路径仍简单且满足预算，不需要提前引入 Queue 与 consumer lag。',
    },
    countCache: {
      state: analysis.cacheActive
        ? analysis.countFreshnessViolated
          ? 'tradeoff'
          : 'useful'
        : analysis.needsCountCache
          ? 'needed'
          : 'not-yet',
      copy: analysis.cacheActive
        ? `${formatPercent(
            analysis.countCacheHitPercent,
          )} measured hit 保护热门读取；可见 freshness 约 ${formatDuration(
            analysis.visibleCountFreshnessSeconds,
          )}，预算是 ${formatDuration(analysis.freshnessBudgetSeconds)}。`
        : analysis.needsCountCache
          ? 'Count read 或 shard fan-out 已超过教学预算；缓存短期 aggregate snapshot，并使用 single-flight/soft TTL 防 stampede。'
          : '当前 Count API 可以直接读取 counter row 或少量 shards；Cache 不是必选层。',
    },
    keyOwnership: {
      state: analysis.multiRegionWrites ? 'needed' : 'useful',
      copy: analysis.multiRegionWrites
        ? '同一个 user-video key 使用 home region、single-writer partition 或 versioned winner；只有 winning transition 才投影到 count。'
        : '单 region transaction 已给同一个 key 排序；Event Log 仍应使用 user-video key 保持 replay 顺序。',
    },
    reconciliation: {
      state: 'needed',
      copy: '定期从 UserVideoReaction 重算每个 video/shard aggregate，监控 mismatch 并修复 materialized count。',
    },
  };
}

function buildReasons(
  analysis: ArchitectureFlags & {
    clientRetryPercent: number;
    hotVideoWritesPerSecond: number;
    perCounterShardWritesPerSecond: number;
    counterShardCount: number;
    backendCountShardReadsPerSecond: number;
    visibleCountFreshnessSeconds: number;
    freshnessBudgetSeconds: number;
    multiRegionWrites: boolean;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  reasons.push({
    severity: analysis.toggleStyleApi ? 'danger' : 'ok',
    text: analysis.toggleStyleApi
      ? `${formatPercent(
          analysis.clientRetryPercent,
        )} client retry 会重复 toggle；correctness 必须先通过 desired-state API 修复。`
      : 'Desired-state API 让重复 set 成为 no-op；retry 不再等于新的 reaction transition。',
  });

  reasons.push({
    severity: analysis.needsCounterShards
      ? analysis.configuredCounterShardsSufficient
        ? 'warning'
        : 'danger'
      : 'ok',
    text: `${formatRate(
      analysis.hotVideoWritesPerSecond,
    )} writes/s 落到最热视频；${formatCount(
      analysis.counterShardCount,
    )} shards 后约 ${formatRate(
      analysis.perCounterShardWritesPerSecond,
    )} writes/s/shard。`,
  });

  if (analysis.shouldUseAsyncProjection) {
    reasons.push({
      severity: analysis.countFreshnessViolated ? 'danger' : 'warning',
      text: `公开 aggregate 经异步 projection 与 cache 后最坏约 ${formatDuration(
        analysis.visibleCountFreshnessSeconds,
      )}；目标是 ${formatDuration(analysis.freshnessBudgetSeconds)}。`,
    });
  } else if (analysis.strictRealtimeCount) {
    reasons.push({
      severity: analysis.strictSynchronousPathOverloaded ? 'danger' : 'ok',
      text: analysis.strictSynchronousPathOverloaded
        ? '同步精确 count 把 hot counter 留在 Reaction API 的 latency 和 failure path 中。'
        : 'Reaction truth 与 aggregate 在同一 transaction 提交；当前同步写入压力仍可接受。',
    });
  }

  if (
    analysis.backendCountShardReadsPerSecond >
    comfortableCountShardReadsPerSecond
  ) {
    reasons.push({
      severity: analysis.cacheActive ? 'warning' : 'danger',
      text: `${formatRate(
        analysis.backendCountShardReadsPerSecond,
      )} backend shard reads/s；需要提高 cache hit、materialize shard sum 或减少读取 fan-out。`,
    });
  }

  if (analysis.multiRegionWrites) {
    reasons.push({
      severity: 'warning',
      text: 'Multi-region 并发写入必须先确定 per-key winner；不能让两个 region 各自改 counter 后再相加。',
    });
  }

  reasons.push({
    severity: 'ok',
    text: 'UserVideoReaction 始终是可重建的 source of truth；公开 count、counter shards 和 cache 都是 derived state。',
  });

  return reasons;
}

function formatPercent(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
