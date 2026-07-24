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
// they are not PostgreSQL, Redis, Kafka, or cloud-vendor benchmarks.
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
  eyebrow: 'System Design Lab',
  title:
    'A YouTube Like Counter is not a blind INCR. Store user-video reaction state as the source of truth, then let a single counter, sharded counters, or an async projection serve public counts at different scales.',
  summary:
    'Adjust reaction rows, write and count-read QPS, hot-video skew, client retries, counter shards, cache hit rate, and freshness. See why Toggle is not idempotent, when one counter row becomes hot, and when the public count should become a replayable asynchronous projection.',
  controls: [
    {
      id: 'activeReactionRows',
      label: 'Active reaction rows',
      help: 'Current non-NONE user-video reactions; this is the source of truth from which aggregates can be rebuilt.',
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
      help: 'Peak logical LIKE, DISLIKE, and removal transitions, excluding network retries.',
      min: 10,
      max: 2_000_000,
      defaultValue: 2_000,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'countReadsPerSecond',
      label: 'Count-read QPS',
      help: 'Peak video-page requests for the public Like / Dislike aggregate.',
      min: 10,
      max: 20_000_000,
      defaultValue: 20_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'hotVideoWritePercent',
      label: 'Hottest-video write share',
      help: 'Share of all reaction writes landing on one viral video; this creates hot keys even when global QPS looks healthy.',
      min: 0.01,
      max: 80,
      defaultValue: 1,
      scale: 'log',
      format: 'percentage',
    },
    {
      id: 'clientRetryPercent',
      label: 'Client retry rate',
      help: 'Requests repeated after a timeout or lost response; desired state makes them no-ops, while Toggle reverses intent.',
      min: 0,
      max: 20,
      defaultValue: 1,
      scale: 'linear',
      format: 'percentage',
    },
    {
      id: 'counterShardCount',
      label: 'Counter shards per hot video',
      help: 'A stable hash(userId) selects a shard; more shards reduce write contention but amplify count reads.',
      min: 1,
      max: 1_024,
      defaultValue: 1,
      scale: 'log',
      unit: 'shards',
      format: 'count',
    },
    {
      id: 'countCacheHitPercent',
      label: 'Count-cache hit rate',
      help: 'Measured share of public reads hitting the same popular video key; the cache stores only a derived aggregate.',
      min: 0,
      max: 99.9,
      defaultValue: 0,
      scale: 'linear',
      format: 'percentage',
    },
    {
      id: 'freshnessBudgetSeconds',
      label: 'Public-count freshness budget',
      help: 'Allowed aggregate lag behind reaction truth; the user’s own reaction still provides read-your-writes.',
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
      label: 'Expose a Toggle API',
      help: 'Retrying the same toggle flips state again; enable this to see retries become a correctness risk.',
      defaultValue: false,
    },
    {
      id: 'strictRealtimeCount',
      label: 'Require a synchronous exact public count',
      help: 'Reaction API must update the readable count before returning, putting the hot counter back in its latency and availability path.',
      defaultValue: true,
    },
    {
      id: 'multiRegionWrites',
      label: 'Allow multi-region writes',
      help: 'The same user-video key may be updated concurrently across regions and needs ownership or a versioned winner.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'transactional-counter',
      step: '01',
      title: 'PostgreSQL transaction',
      summary: 'At low traffic, reaction truth and one counter row commit in the same transaction.',
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
      title: 'Toggle + retry trap',
      summary: 'Traffic is unchanged, but retrying after a lost response removes the Like that already succeeded.',
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
      title: 'Viral-video hot row',
      summary: 'Global writes are moderate, but 20% converge on one video and serialize through one counter row.',
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
      title: 'Synchronous counter shards',
      summary: 'Sixty-four stable shards spread hot-video writes while preserving a synchronous exact aggregate.',
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
      title: 'Asynchronous aggregate',
      summary: 'Reaction truth commits synchronously; Outbox, Event Log, and Aggregator update the public count inside a five-second budget.',
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
      title: 'Multi-region state ordering',
      summary: 'When user devices update across regions, choose the winning reaction before projecting a global count.',
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
    title: 'YouTube Like Counter architecture',
    description:
      'Whiteboard-style Like Counter architecture: the Reaction Store keeps user-video truth; low traffic updates a counter synchronously, while high traffic uses Outbox, Event Log, and Aggregator to build a sharded aggregate. Count Cache serves only public reads.',
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
            summary: 'Set a desired reaction and read the public aggregate',
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
            summary: 'Serialize each user-video transition and return the user’s latest reaction',
            kind: 'api',
          },
          {
            id: 'countApi',
            title: 'Count API',
            subtitle: 'serve aggregate',
            summary: 'Read a cache or aggregate counter shards and return an as-of timestamp',
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
            summary: 'Store reaction, version, and updated_at; a composite key prevents duplicate current state',
            kind: 'db',
          },
          {
            id: 'outbox',
            title: 'Outbox / CDC',
            subtitle: 'capture commits',
            summary: 'Reliably hand committed reaction transitions to the asynchronous projection',
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
            summary: 'Preserve order for each user-video key and support retry, replay, and backpressure',
            kind: 'queue',
          },
          {
            id: 'aggregator',
            title: 'Counter aggregator',
            subtitle: 'versioned transition',
            summary: 'Deduplicate events and apply previous-to-desired transitions to materialized counts',
            kind: 'compute',
          },
          {
            id: 'shardedCounts',
            title: 'Counter shards',
            subtitle: 'video + user hash',
            summary: 'Spread hot-video writes; count reads sum shards or consume a snapshot',
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
            summary: 'Cache only a derived aggregate; TTL, refresh, and pipeline lag all contribute to freshness',
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
    { id: 'hotCounter', label: 'Hottest counter-shard write pressure' },
    { id: 'reactionWritePath', label: 'Reaction-truth write partitions' },
    { id: 'countReadPath', label: 'Count backend read fan-out' },
    { id: 'freshness', label: 'Public-count freshness' },
    { id: 'truthStorage', label: 'Reaction-truth storage' },
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
      title: 'A composite primary key enforces one row per user-video pair',
      source: 'PostgreSQL — Constraints',
      url: 'https://www.postgresql.org/docs/current/ddl-constraints.html',
      summary:
        'PostgreSQL primary keys can span columns and automatically create a unique B-tree index. (video_id, user_id) expresses identity and protects one current state under concurrency.',
    },
    {
      title: 'INSERT ... ON CONFLICT provides a deterministic upsert path',
      source: 'PostgreSQL — INSERT',
      url: 'https://www.postgresql.org/docs/current/sql-insert.html',
      summary:
        'Reaction writes can target the composite unique key, then combine the upsert with a transaction, version, or row lock to apply a previous-to-desired transition.',
    },
    {
      title: 'Row-level locks block concurrent writers to the same row',
      source: 'PostgreSQL — Explicit Locking',
      url: 'https://www.postgresql.org/docs/current/explicit-locking.html',
      summary:
        'That can serialize one reaction or counter row, and also explains why a viral video’s single counter row becomes a hot lock.',
    },
    {
      title: 'Redis INCR is an O(1) atomic counter primitive, but it does not know prior business state',
      source: 'Redis — INCR',
      url: 'https://redis.io/docs/latest/commands/incr/',
      summary:
        'INCR atomically increments an integer. It does not know whether a request is a retry, whether the user already liked the video, or which two deltas a LIKE-to-DISLIKE switch requires.',
    },
    {
      title: 'The same event key in one Kafka partition preserves order',
      source: 'Apache Kafka — Introduction',
      url: 'https://kafka.apache.org/documentation/',
      summary:
        'Using (video_id, user_id) as the event key lets consumers observe that user’s transitions in write order. The system does not need expensive global ordering.',
    },
    {
      title: 'Outbox commits business state and a publishable event together',
      source: 'Debezium — Outbox Event Router',
      url: 'https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html',
      summary:
        'The reaction row and outbox row commit in one transaction. CDC / Relay publishes later, avoiding a synchronous dual write where the database succeeds and the message is permanently lost.',
    },
  ],
  teachingAssumptions: [
    'All throughput, latency, and storage formulas expose architectural inflection points; they are not PostgreSQL, Redis, Kafka, or cloud-vendor performance promises.',
    'The teaching budget is 1k writes/s for one counter row and 2.5k writes/s per counter shard. Real boundaries require row-lock wait, p95, and skew load tests.',
    'Reaction truth uses roughly 112 bytes per active row including the row, primary key, and basic storage amplification. Schema, compression, and replicas change this.',
    'The async projection starts at 500ms of lag; a three-second count-cache TTL adds to public visible staleness.',
    'A desired-state API makes network retries idempotent no-ops. The underlying transaction/version still chooses a concurrent winner.',
    'The same user-video key maps to a stable counter shard and event partition. Public counts may be eventually consistent; the user’s own reaction always reads the source of truth.',
    'Reconciliation can rebuild aggregates from UserVideoReaction. A count that cannot be rebuilt has been incorrectly treated as a source of truth.',
  ],
  teachingWalkthrough: [
    {
      id: 'start-with-transaction',
      step: '01',
      focus: 'Store state first',
      scenarioId: 'transactional-counter',
      question:
        'At only 200 reaction writes/s, should you call Redis INCR directly, or first store `(video_id, user_id) -> reaction`?',
      reveal:
        'Store reaction truth first. Repeating LIKE must be a no-op, and LIKE-to-DISLIKE applies -1/+1 together; blind INCR cannot see previous state. At low traffic, one PostgreSQL transaction can update the reaction row and a per-video counter row.',
      takeaway: 'A Like Counter is a state machine before it is a counter.',
    },
    {
      id: 'remove-toggle',
      step: '02',
      focus: 'Retries change the API',
      scenarioId: 'toggle-retry-trap',
      question:
        'The server commits a toggle but the response is lost, and 8% of requests retry. Does the second toggle represent the same intent?',
      reveal:
        'No. It flips the successful LIKE back to NONE. The public API should express desired state: retrying set LIKE remains LIKE. A request ID can supplement deduplication, but it cannot repair Toggle’s ambiguous semantics.',
      takeaway: 'Idempotency starts at the API contract, not in Queue configuration.',
    },
    {
      id: 'find-hot-row',
      step: '03',
      focus: 'Skew takes over',
      scenarioId: 'viral-video-hot-row',
      question:
        'Twenty percent of 50k global writes/s land on one video. The database still has spare CPU, so why does latency jump?',
      reveal:
        'That video’s 10k writes/s all compete for one counter row. Global scale-out cannot remove single-key serialization; quantify hottest-video QPS before choosing counter shards.',
      takeaway: 'A counter’s boundary is set by its hottest key, not average QPS.',
    },
    {
      id: 'shard-counter',
      step: '04',
      focus: 'Spread writes, sum reads',
      scenarioId: 'synchronous-counter-shards',
      question:
        'After splitting a hot video into 64 counter shards, how does Unlike find the same shard used by the earlier Like?',
      reveal:
        'Use a stable hash(user_id). Every transition for the same user-video pair always lands on one shard. Write contention drops to about 156 writes/s/shard, while count reads now sum 64 rows.',
      takeaway: 'A stable shard function trades read amplification for lower single-row contention.',
    },
    {
      id: 'project-asynchronously',
      step: '05',
      focus: 'Split consistency boundaries',
      scenarioId: 'asynchronous-aggregate',
      question:
        'At 400k writes/s, must the user’s own button state and the public count use the same consistency model?',
      reveal:
        'No. Reaction API synchronously commits user-video truth plus an outbox for read-your-writes. Event Log and Aggregator update the public count asynchronously. Event ID, version, and per-key order defend against duplicates and reordering.',
      takeaway: 'Synchronize user intent; project the public aggregate asynchronously.',
    },
    {
      id: 'order-multi-region-state',
      step: '06',
      focus: 'Choose the winner first',
      scenarioId: 'multi-region-state-ordering',
      question:
        'A phone in Region A sets LIKE while a browser in Region B sets DISLIKE. Can both regions update counts independently and merge later?',
      reveal:
        'Do not merge counters before deciding user state. First use home-region ownership, a single-writer partition, or a versioned conditional write to choose the winning reaction. Only winning transitions enter the global aggregate.',
      takeaway: 'Multi-region is first a per-key ordering problem, not an addition problem.',
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
        ? 'Reaction API -> Reaction Store + synchronous Counter Shards; Count API -> Count Cache -> shards on miss'
        : 'Reaction API -> one transaction: Reaction Store + synchronous Counter Shards; Count API -> shard sum',
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
          ? `${formatPercent(clientRetryPercent)} retries execute Toggle again, so about ${formatRate(
              unsafeToggleTransitionsPerSecond,
            )} requests/s may reverse an already committed intent.`
          : `PUT desired state turns ${formatRate(
              retryRequestsPerSecond,
            )} retries/s into no-ops; version/transaction still chooses concurrent winners.`,
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
        )} shards = about ${formatRate(perCounterShardWritesPerSecond)} writes/s/shard.`,
      },
      reactionWritePath: {
        ratio:
          receivedReactionRequestsPerSecond /
          (reactionPartitionCount * comfortableReactionWritesPerPartitionSecond),
        valueText: `${formatCount(reactionPartitionCount)} truth partitions`,
        copy: `hash(video_id, user_id) spreads about ${formatRate(
          receivedReactionRequestsPerSecond,
        )} requests/s while serializing transitions for the same key.`,
      },
      countReadPath: {
        ratio:
          backendCountShardReadsPerSecond /
          comfortableCountShardReadsPerSecond,
        valueText: `${formatRate(backendCountShardReadsPerSecond)} shard reads/s`,
        copy: cacheActive
          ? `${formatPercent(countCacheHitPercent)} cache hits reduce ${formatRate(
              countReadsPerSecond,
            )} incoming reads/s to ${formatRate(
              backendCountReadsPerSecond,
            )} backend reads/s, then multiply by ${formatCount(counterShardCount)} shards.`
          : `${formatRate(
              countReadsPerSecond,
            )} count reads/s each sum ${formatCount(
              counterShardCount,
            )} shards; no cache absorbs the hot read fan-out.`,
      },
      freshness: {
        ratio: visibleCountFreshnessSeconds / freshnessBudgetSeconds,
        valueText: shouldUseAsyncProjection || cacheActive
          ? `worst ~${formatDuration(visibleCountFreshnessSeconds)}`
          : 'transactional',
        copy: shouldUseAsyncProjection || cacheActive
          ? `${formatDuration(
              projectionLagSeconds,
            )} projection lag${cacheActive ? ` + ${countCacheTtlSeconds}-second cache TTL` : ''}; budget is ${formatDuration(
              freshnessBudgetSeconds,
            )}.`
          : 'Reaction truth and public count update in one transaction; there is no async or cache lag.',
      },
      truthStorage: {
        ratio: truthStorageGigabytes / 1_000,
        valueText: `~${formatStorageGigabytes(truthStorageGigabytes)}`,
        copy: `${formatCount(activeReactionRows)} active rows × about ${reactionBytesPerActiveRow} bytes/row; replicas, WAL, and event history are not included.`,
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
        ? 'The same retry flips the reaction again; the API contract itself is not idempotent.'
        : 'PUT desired state; identical retries are no-ops, while version/transaction resolves concurrency.',
      shardedCounts:
        counterShardCount === 1
          ? 'One aggregate row per video is simple, but a viral video creates a hot lock.'
          : `hash(user_id) selects ${formatCount(
              counterShardCount,
            )} stable shards; count reads sum them or consume a snapshot.`,
      countCache: cacheActive
        ? `Stores a derived count snapshot with a ${countCacheTtlSeconds}-second TTL; it is not reaction truth.`
        : 'No public-count cache; Count API reads or aggregates counter shards directly.',
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
    return 'Fix the API first: Toggle + retry reverses user intent';
  }
  if (flags.shouldUseAsyncProjection && flags.multiRegionWrites) {
    return 'Per-key ownership + asynchronous global count projection';
  }
  if (flags.shouldUseAsyncProjection) {
    return 'Reaction truth + Outbox / Event Log + async aggregate';
  }
  if (flags.needsCounterShards && !flags.configuredCounterShardsSufficient) {
    return 'Too few synchronous counter shards; the hot key is still overloaded';
  }
  if (flags.needsCounterShards) {
    return 'PostgreSQL reaction truth + synchronous sharded counters';
  }
  return 'PostgreSQL transaction: reaction + one counter row';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (flags.toggleStyleApi && flags.unsafeToggleTransitionsPerSecond > 0) {
    return 'Traffic and the database are not the first problem. Replace Toggle with an idempotent set-reaction API, or a legitimate retry after a lost response directly corrupts user state and counts.';
  }
  if (flags.shouldUseAsyncProjection) {
    return flags.countFreshnessViolated
      ? 'Reaction truth remains correct, but projection lag plus cache TTL exceeds the public freshness budget. Add aggregator capacity, shorten TTL, or relax the SLO.'
      : 'User-video reaction commits synchronously and provides read-your-writes; a replayable, versioned projection converges the public count inside budget.';
  }
  if (flags.needsCounterShards) {
    return flags.configuredCounterShardsSufficient
      ? 'A stable user hash spreads one hot video across counter rows. The public count remains synchronously exact, but reads must sum the shards.'
      : 'One or too few counter shards still serialize hot-video writes. Add shards, or split out an async aggregate when bounded staleness is acceptable.';
  }
  return 'One PostgreSQL transaction maintains user-video reaction truth and a per-video aggregate. Current load does not justify an Event Log or Cache.';
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
        ? 'Toggle depends on current server state, so retrying the same intent reverses it. Use PUT LIKE / DISLIKE / NONE.'
        : 'The same desired state is safe to retry; repeating set LIKE does not increment the count again.',
    },
    reactionTruth: {
      state: 'needed',
      copy: '(video_id, user_id) stores current reaction and version; aggregates can be rebuilt from it after drift.',
    },
    atomicTransition: {
      state: 'needed',
      copy: 'Reading previous state, choosing a winner, applying LIKE/DISLIKE deltas, and storing desired state must form one serialization unit.',
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
          )} hot writes/s/shard; use stable hash(user_id) to spread writes and accept count-read fan-out.`
        : 'One counter row is still below the teaching pressure boundary; premature sharding only adds read amplification and migration work.',
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
        ? 'Reaction + Outbox commit together. Event Log orders by user-video key, and Aggregator uses event ID/version to deduplicate and update shards.'
        : analysis.strictRealtimeCount
          ? 'Public count must be synchronously exact, so it stays in the Reaction write path and inherits hot-shard latency and availability coupling.'
          : 'The synchronous path is still simple and within budget; do not add Queue and consumer lag early.',
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
          )} measured hits protect hot reads; visible freshness is about ${formatDuration(
            analysis.visibleCountFreshnessSeconds,
          )} against a ${formatDuration(analysis.freshnessBudgetSeconds)} budget.`
        : analysis.needsCountCache
          ? 'Count reads or shard fan-out exceed the teaching budget. Cache short-lived aggregate snapshots and use single-flight / soft TTL against stampedes.'
          : 'Count API can currently read one counter row or a few shards directly; Cache is not mandatory.',
    },
    keyOwnership: {
      state: analysis.multiRegionWrites ? 'needed' : 'useful',
      copy: analysis.multiRegionWrites
        ? 'Use a home region, single-writer partition, or versioned winner for each user-video key. Only winning transitions project into the count.'
        : 'A single-region transaction already orders one key; Event Log should still use the user-video key for replay order.',
    },
    reconciliation: {
      state: 'needed',
      copy: 'Periodically recompute video/shard aggregates from UserVideoReaction, monitor mismatches, and repair the materialized count.',
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
        )} client retries execute Toggle twice; correctness must first be repaired with a desired-state API.`
      : 'Desired state makes repeated sets no-ops; a retry is no longer a new reaction transition.',
  });

  reasons.push({
    severity: analysis.needsCounterShards
      ? analysis.configuredCounterShardsSufficient
        ? 'warning'
        : 'danger'
      : 'ok',
    text: `${formatRate(
      analysis.hotVideoWritesPerSecond,
    )} writes/s land on the hottest video; ${formatCount(
      analysis.counterShardCount,
    )} shards leave about ${formatRate(
      analysis.perCounterShardWritesPerSecond,
    )} writes/s/shard.`,
  });

  if (analysis.shouldUseAsyncProjection) {
    reasons.push({
      severity: analysis.countFreshnessViolated ? 'danger' : 'warning',
      text: `The public aggregate is worst-case about ${formatDuration(
        analysis.visibleCountFreshnessSeconds,
      )} stale after projection and cache, against a ${formatDuration(
        analysis.freshnessBudgetSeconds,
      )} target.`,
    });
  } else if (analysis.strictRealtimeCount) {
    reasons.push({
      severity: analysis.strictSynchronousPathOverloaded ? 'danger' : 'ok',
      text: analysis.strictSynchronousPathOverloaded
        ? 'A synchronous exact count keeps the hot counter in Reaction API’s latency and failure path.'
        : 'Reaction truth and aggregate commit in one transaction; current synchronous write pressure is acceptable.',
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
      )} backend shard reads/s; raise cache hit rate, materialize a shard sum, or reduce read fan-out.`,
    });
  }

  if (analysis.multiRegionWrites) {
    reasons.push({
      severity: 'warning',
      text: 'Concurrent multi-region writes must choose a per-key winner before updating counts; independent regional counters cannot simply be added.',
    });
  }

  reasons.push({
    severity: 'ok',
    text: 'UserVideoReaction remains the rebuildable source of truth; public counts, counter shards, and cache are all derived state.',
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
