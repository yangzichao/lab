import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatRate, formatStorageGigabytes } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative single-node teaching budgets, not vendor limits.
const comfortableTrieReadsPerSecond = 20_000;
const bytesPerTrieEntry = 80; // a query string plus its precomputed top-k pointers, amortized per node.
const comfortableTrieMemoryGigabytes = 32; // what one in-memory trie box can hold comfortably.
const batchRebuildLagMinutes = 60; // a periodic batch rebuild lands fresh top-k about once an hour.
const comfortableFanoutShards = 8; // shards a single coordinator can scatter/gather within the latency budget.

export const searchAutocompleteLabDefinition: SystemDesignLabDefinition = {
  id: 'search-autocomplete',
  eyebrow: 'System Design Lab',
  title:
    'Search autocomplete is a read-only top-k prefix lookup on a tight latency budget, fed by a separate aggregation pipeline — not a live write path.',
  summary:
    'Change keystroke query rate, vocabulary size, how many suggestions you return, the p99 latency budget, how fresh completions must be, and regions. The design moves from one in-memory trie to caching the hottest prefixes, sharding the trie by prefix, a streaming log-aggregation pipeline for freshness, and per-region personalization.',
  controls: [
    {
      id: 'prefixQps',
      label: 'Prefix query rate',
      help: 'Reads: every keystroke fires a lookup for the current prefix. This is the dominant traffic.',
      min: 10,
      max: 5_000_000,
      defaultValue: 2_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'vocabularySize',
      label: 'Vocabulary size',
      help: 'Distinct queries kept in the trie. More distinct queries means a larger, deeper prefix tree.',
      min: 10_000,
      max: 50_000_000_000,
      defaultValue: 5_000_000,
      scale: 'log',
      unit: 'queries',
      format: 'count',
    },
    {
      id: 'topKSuggestions',
      label: 'Suggestions returned',
      help: 'Top-k completions precomputed and stored at each trie node and returned per lookup.',
      min: 3,
      max: 20,
      defaultValue: 10,
      scale: 'linear',
      unit: 'suggestions',
      format: 'count',
    },
    {
      id: 'latencyBudgetMs',
      label: 'p99 latency budget',
      help: 'How fast a prefix lookup must return before the suggestion feels laggy mid-typing.',
      min: 5,
      max: 300,
      defaultValue: 100,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'freshnessMinutes',
      label: 'Update freshness',
      help: 'Acceptable lag between a query trending and it appearing in completions. Lower means a tighter pipeline.',
      min: 1,
      max: 1_440,
      defaultValue: 60,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'globalRegions',
      label: 'Regions',
      help: 'Regions that should serve completions close to the user within the latency budget.',
      min: 1,
      max: 20,
      defaultValue: 1,
      scale: 'linear',
      unit: 'regions',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'personalization',
      label: 'Personalize suggestions',
      help: 'Blend per-user history into ranking; rules out one shared global top-k per prefix.',
      defaultValue: false,
    },
    {
      id: 'typoTolerance',
      label: 'Typo / fuzzy tolerance',
      help: 'Match prefixes with small edits; widens each lookup beyond an exact trie walk.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'in-memory-trie',
      step: '01',
      title: 'One in-memory trie',
      summary: 'A small box answers every prefix from one trie.',
      values: {
        prefixQps: 200,
        vocabularySize: 200_000,
        topKSuggestions: 10,
        latencyBudgetMs: 150,
        freshnessMinutes: 720,
        globalRegions: 1,
        personalization: false,
        typoTolerance: false,
      },
    },
    {
      id: 'cache-hot-prefixes',
      step: '02',
      title: 'Cache the hot prefixes',
      summary: 'Keystroke traffic explodes, but few prefixes dominate.',
      values: {
        prefixQps: 150_000,
        vocabularySize: 2_000_000,
        topKSuggestions: 10,
        latencyBudgetMs: 80,
        freshnessMinutes: 360,
        globalRegions: 1,
        personalization: false,
        typoTolerance: false,
      },
    },
    {
      id: 'shard-the-trie',
      step: '03',
      title: 'Shard the trie',
      summary: 'A huge vocabulary no longer fits in one box.',
      values: {
        prefixQps: 600_000,
        vocabularySize: 2_000_000_000,
        topKSuggestions: 12,
        latencyBudgetMs: 60,
        freshnessMinutes: 120,
        globalRegions: 2,
        personalization: false,
        typoTolerance: true,
      },
    },
    {
      id: 'streaming-freshness',
      step: '04',
      title: 'Streaming freshness',
      summary: 'Trends must surface in minutes, not hours.',
      values: {
        prefixQps: 1_200_000,
        vocabularySize: 8_000_000_000,
        topKSuggestions: 12,
        latencyBudgetMs: 40,
        freshnessMinutes: 2,
        globalRegions: 3,
        personalization: false,
        typoTolerance: true,
      },
    },
    {
      id: 'global-personalized',
      step: '05',
      title: 'Global + personalized',
      summary: 'Per-user ranking near every user, single-digit ms.',
      values: {
        prefixQps: 3_000_000,
        vocabularySize: 20_000_000_000,
        topKSuggestions: 15,
        latencyBudgetMs: 10,
        freshnessMinutes: 1,
        globalRegions: 8,
        personalization: true,
        typoTolerance: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'Search autocomplete architecture diagram',
    description:
      'Whiteboard-style architecture diagram for search autocomplete: clients firing per-keystroke lookups, an edge/API layer with a hot-prefix cache, a prefix-sharded trie service holding precomputed top-k, an aggregation pipeline that rebuilds top-k from the query log, and the query-log store.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'per keystroke',
            summary: 'fires a prefix lookup on every keystroke and logs the chosen query',
            kind: 'client',
          },
        ],
      },
      {
        id: 'edge',
        label: 'Edge / API',
        variant: 'edge',
        nodes: [
          {
            id: 'apiGateway',
            title: 'API gateway',
            subtitle: 'lookup + log',
            summary: 'fans prefix lookups to the trie and forwards chosen queries to the log',
            kind: 'api',
          },
          {
            id: 'prefixCache',
            title: 'Prefix cache',
            subtitle: 'hot prefixes',
            summary: 'serves completions for the most common prefixes without touching the trie',
            kind: 'cache',
          },
        ],
      },
      {
        id: 'trie',
        label: 'Trie service',
        variant: 'backbone',
        nodes: [
          {
            id: 'trieService',
            title: 'Trie service',
            subtitle: 'precomputed top-k',
            summary: 'walks the prefix tree and returns the top-k stored at the matched node',
            kind: 'search',
          },
          {
            id: 'trieShards',
            title: 'Trie shards',
            subtitle: 'partition by prefix',
            summary: 'split the prefix tree across nodes so a huge vocabulary fits and scales',
            kind: 'search',
          },
        ],
      },
      {
        id: 'aggregation',
        label: 'Aggregation',
        variant: 'processing',
        nodes: [
          {
            id: 'aggregator',
            title: 'Aggregator',
            subtitle: 'rebuild top-k',
            summary: 'counts query frequencies and recomputes the top-k written back into the trie',
            kind: 'compute',
          },
          {
            id: 'streamProcessor',
            title: 'Stream processor',
            subtitle: 'fresh updates',
            summary: 'incrementally updates counts from the live log so trends surface within minutes',
            kind: 'compute',
          },
        ],
      },
      {
        id: 'storage',
        label: 'Query log',
        variant: 'storage',
        nodes: [
          {
            id: 'queryLog',
            title: 'Query log',
            subtitle: 'raw searches',
            summary: 'durably records every chosen query as the source of truth for ranking',
            kind: 'stream',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'apiGateway', variant: 'primary' },
      { from: 'apiGateway', to: 'prefixCache', variant: 'primary' },
      { from: 'apiGateway', to: 'trieService', variant: 'direct' },
      { from: 'prefixCache', to: 'trieService', variant: 'secondary' },
      { from: 'trieService', to: 'trieShards', variant: 'secondary' },
      { from: 'apiGateway', to: 'queryLog', variant: 'secondary' },
      { from: 'queryLog', to: 'aggregator', variant: 'secondary' },
      { from: 'queryLog', to: 'streamProcessor', variant: 'secondary' },
      { from: 'aggregator', to: 'trieService', variant: 'secondary' },
      { from: 'streamProcessor', to: 'trieService', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'readPath', label: 'Lookup vs latency budget' },
    { id: 'trieMemory', label: 'Trie memory' },
    { id: 'cachePressure', label: 'Hot-prefix cache pressure' },
    { id: 'updateLag', label: 'Update / freshness lag' },
    { id: 'fanout', label: 'Shard fan-out' },
  ],
  decisions: [
    { id: 'trie', title: 'Trie + precomputed top-k' },
    { id: 'cache', title: 'Hot-prefix cache' },
    { id: 'sharding', title: 'Prefix sharding' },
    { id: 'pipeline', title: 'Update pipeline' },
    { id: 'personalization', title: 'Personalized ranking' },
    { id: 'ranking', title: 'Ranking / typo tolerance' },
  ],
  sourceBackedRules: [
    {
      title: 'A trie answers prefix queries in time proportional to the prefix length',
      source: 'NIST Dictionary of Algorithms and Data Structures',
      url: 'https://xlinux.nist.gov/dads/HTML/trie.html',
      summary:
        'A trie keys on the characters of the prefix, so a completion lookup is O(prefix length) and independent of how many queries are stored, unlike scanning the vocabulary.',
    },
    {
      title: 'Query popularity is heavily skewed, so a small cache covers most lookups',
      source: 'Baeza-Yates et al., "The Impact of Caching on Search Engines" (SIGIR)',
      url: 'https://dl.acm.org/doi/10.1145/1277741.1277775',
      summary:
        'Search query streams follow a power-law: a small set of popular queries accounts for a large fraction of traffic, so caching the hottest prefixes absorbs most reads.',
    },
    {
      title: 'Precompute and store top-k at each node instead of ranking at query time',
      source: 'Redis Docs — autocomplete with sorted sets',
      url: 'https://redis.io/docs/latest/develop/use/patterns/',
      summary:
        'Maintaining the ranked completions ahead of time (e.g. in a sorted set per prefix) turns a lookup into a read of an already-sorted top-k rather than an on-the-fly aggregation.',
    },
    {
      title: 'Streaming aggregation produces low-latency updates from an unbounded log',
      source: 'Apache Flink Documentation',
      url: 'https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/',
      summary:
        'A stateful stream processor maintains running aggregates over the query log so updated top-k counts are available within seconds-to-minutes instead of waiting for a batch rebuild.',
    },
  ],
  teachingAssumptions: [
    'Completions are modeled as cacheable prefix lookups; cache coverage is approximated from query-popularity skew, not a measured hit rate.',
    'Single-node read throughput and in-memory trie capacity are conservative teaching numbers, not vendor limits.',
    'The trie is read-only on the hot path; freshness comes only from the separate aggregation pipeline, so search latency and update lag are independent budgets.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-trie',
      step: '01',
      focus: 'One in-memory trie',
      scenarioId: 'in-memory-trie',
      question:
        'A small site does ~200 prefix lookups/s over 200k distinct queries. Do you need a cache, shards, or a streaming pipeline yet?',
      reveal:
        'No. The whole trie fits in memory on one box, a lookup is O(prefix length) regardless of vocabulary size, and 200 reads/s is trivial. Refreshing top-k once or twice a day with a batch job over the query log is plenty. Everything else is premature.',
      takeaway: 'Start with one in-memory trie holding precomputed top-k; freshness can lag by hours.',
    },
    {
      id: 'cache-hot',
      step: '02',
      focus: 'Hot prefixes dominate',
      scenarioId: 'cache-hot-prefixes',
      question:
        'Traffic jumps to 150k lookups/s, but a handful of prefixes get most of them. What is the cheapest way to protect the trie?',
      reveal:
        'Cache the completions for the hottest prefixes. Query popularity is power-law skewed, so a small cache serves the bulk of lookups at memory speed and the trie only sees the long tail of misses — no need to shard yet.',
      takeaway: 'Skewed prefix popularity lets a small cache absorb most read traffic.',
    },
    {
      id: 'shard',
      step: '03',
      focus: 'Vocabulary outgrows one box',
      scenarioId: 'shard-the-trie',
      question:
        'The vocabulary grows to ~2 billion distinct queries. The cache still helps reads, but what breaks now?',
      reveal:
        'The trie no longer fits in one machine’s memory. Partition it by prefix across shards so each holds a slice of the tree; a lookup is routed by its leading characters. Fan-out stays small because one prefix lives on one shard.',
      takeaway: 'When the vocabulary outgrows one box, shard the trie by prefix so each lookup hits one shard.',
    },
    {
      id: 'streaming',
      step: '04',
      focus: 'Freshness in minutes',
      scenarioId: 'streaming-freshness',
      question:
        'A breaking-news query must appear in suggestions within ~2 minutes. Can an hourly batch rebuild deliver that?',
      reveal:
        'No — an hourly batch is far too slow. Replace (or augment) it with a stream processor that maintains running top-k counts from the live query log and writes incremental updates into the trie, so trends surface within minutes. Lookup latency is unaffected because the hot path stays read-only.',
      takeaway: 'Freshness is a pipeline property: stream the query log to update top-k in minutes, not hours.',
    },
    {
      id: 'global',
      step: '05',
      focus: 'Global + personalized',
      scenarioId: 'global-personalized',
      question:
        'Now users worldwide expect sub-10 ms, personalized completions. Is one shared global top-k per prefix, served from one region, enough?',
      reveal:
        'No on both counts. Sub-10 ms across continents needs the cache and trie replicated near users in each region, and personalization means ranking can no longer be a single shared top-k — you blend a global base ranking with per-user signals at request time. Personalization also dilutes cache effectiveness because results vary per user.',
      takeaway: 'Global low latency pushes the trie to the edge; personalization trades a shared cache for per-user ranking.',
    },
  ],
  analyze: analyzeSearchAutocompleteWorkload,
};

function analyzeSearchAutocompleteWorkload(workload: WorkloadValues): LabAnalysis {
  const prefixQps = numericValue(workload, 'prefixQps');
  const vocabularySize = numericValue(workload, 'vocabularySize');
  const topKSuggestions = numericValue(workload, 'topKSuggestions');
  const latencyBudgetMs = numericValue(workload, 'latencyBudgetMs');
  const freshnessMinutes = numericValue(workload, 'freshnessMinutes');
  const globalRegions = numericValue(workload, 'globalRegions');
  const personalization = Boolean(workload.personalization);
  const typoTolerance = Boolean(workload.typoTolerance);

  // Skew share: hot prefixes dominate, so a cache covers a large fraction of reads.
  const hotPrefixShare = 0.9;
  const needsCache = prefixQps > 5_000;
  const needsCdn = globalRegions > 1 || latencyBudgetMs <= 20 || prefixQps > 500_000;

  // Trie memory in GB; one box holds roughly comfortableTrieMemoryGigabytes.
  const trieMemoryGigabytes = (vocabularySize * bytesPerTrieEntry * (1 + topKSuggestions / 40)) / 1_000_000_000;
  const needsSharding = trieMemoryGigabytes > comfortableTrieMemoryGigabytes || vocabularySize > 1_000_000_000;

  // Freshness: a batch rebuild lands about once an hour; tighter than that needs streaming.
  const needsStreaming = freshnessMinutes < batchRebuildLagMinutes / 2;
  const effectiveLagMinutes = needsStreaming
    ? Math.max(freshnessMinutes / 2, 0.5)
    : batchRebuildLagMinutes;
  const updateLagRatio = effectiveLagMinutes / Math.max(freshnessMinutes, 0.5);

  // Cache effectiveness drops when personalization makes results per-user.
  const cacheServedShare = needsCache ? (personalization ? 0.35 : hotPrefixShare) : 0;
  const trieReadsPerSecond = prefixQps * (1 - cacheServedShare);
  // A wider lookup (typo tolerance) and a tighter latency budget raise effective read cost.
  const lookupCostMultiplier = (typoTolerance ? 1.6 : 1) * (latencyBudgetMs <= 20 ? 1.4 : 1);
  const effectiveTrieReads = trieReadsPerSecond * lookupCostMultiplier;

  // Shard fan-out pressure: more regions and a tight budget push beyond one coordinator's comfort.
  const shardCount = needsSharding
    ? Math.max(2, Math.ceil(trieMemoryGigabytes / comfortableTrieMemoryGigabytes))
    : 1;
  const fanoutPressure = Math.max(
    shardCount / comfortableFanoutShards,
    (globalRegions - 1) / 4,
    latencyBudgetMs <= 20 ? 20 / latencyBudgetMs / 4 : 0,
  );

  const cachePressureRatio = needsCache
    ? (effectiveTrieReads / comfortableTrieReadsPerSecond) * (personalization ? 1.4 : 1)
    : prefixQps / comfortableTrieReadsPerSecond;

  const flags = {
    needsCache,
    needsCdn,
    needsSharding,
    needsStreaming,
    personalization,
    typoTolerance,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      apiGateway: 'ok',
      prefixCache: needsCache ? 'needed' : 'inactive',
      trieService: needsSharding ? 'warning' : 'ok',
      trieShards: needsSharding ? 'needed' : 'inactive',
      aggregator: 'ok',
      streamProcessor: needsStreaming ? 'needed' : 'inactive',
      queryLog: 'ok',
    },
    flowStates: {
      clientToApiGateway: 'active',
      apiGatewayToPrefixCache: needsCache ? 'active' : 'inactive',
      apiGatewayToTrieService: needsCache ? 'inactive' : 'active',
      prefixCacheToTrieService: needsCache ? 'active' : 'inactive',
      trieServiceToTrieShards: needsSharding ? 'active' : 'inactive',
      apiGatewayToQueryLog: 'active',
      queryLogToAggregator: needsStreaming ? 'inactive' : 'active',
      queryLogToStreamProcessor: needsStreaming ? 'active' : 'inactive',
      aggregatorToTrieService: needsStreaming ? 'inactive' : 'active',
      streamProcessorToTrieService: needsStreaming ? 'active' : 'inactive',
    },
    meters: {
      readPath: {
        ratio: effectiveTrieReads / comfortableTrieReadsPerSecond,
        valueText: `${formatRate(effectiveTrieReads)}/s`,
        copy: needsCache
          ? `The hot-prefix cache absorbs most lookups; the trie still serves about ${formatRate(
              effectiveTrieReads,
            )}/s within a ${Math.round(latencyBudgetMs)} ms budget.`
          : `Every keystroke hits the trie directly — about ${formatRate(
              effectiveTrieReads,
            )}/s within a ${Math.round(latencyBudgetMs)} ms budget.`,
      },
      trieMemory: {
        ratio: trieMemoryGigabytes / comfortableTrieMemoryGigabytes,
        valueText: formatStorageGigabytes(trieMemoryGigabytes),
        copy: `${formatCount(vocabularySize)} distinct queries with top-${Math.round(
          topKSuggestions,
        )} stored per node take roughly ${formatStorageGigabytes(trieMemoryGigabytes)} in memory.`,
      },
      cachePressure: {
        ratio: cachePressureRatio,
        valueText: needsCache ? `${Math.round(cacheServedShare * 100)}% served` : 'no cache',
        copy: needsCache
          ? personalization
            ? 'Personalized results vary per user, so the hot-prefix cache covers far fewer lookups and pressure rises.'
            : 'Skewed prefix popularity lets a small cache cover the bulk of lookups at memory speed.'
          : 'Read volume is low enough that the trie answers every prefix directly without a cache.',
      },
      updateLag: {
        ratio: updateLagRatio,
        valueText: needsStreaming
          ? `~${formatLagMinutes(effectiveLagMinutes)} lag`
          : `~${formatLagMinutes(batchRebuildLagMinutes)} batch`,
        copy: needsStreaming
          ? `A ${formatLagMinutes(
              freshnessMinutes,
            )} freshness target needs streaming aggregation; an hourly batch rebuild is far too slow.`
          : `A ${formatLagMinutes(
              freshnessMinutes,
            )} freshness target is comfortably met by a periodic batch rebuild of top-k.`,
      },
      fanout: {
        ratio: fanoutPressure,
        valueText: needsSharding
          ? `${shardCount} ${pluralize('shard', shardCount)}`
          : '1 shard',
        copy: needsSharding
          ? `The trie is split into ${shardCount} prefix shards; each lookup is routed by its leading characters to one shard.`
          : 'The whole trie fits on one node, so a lookup never fans out across shards.',
      },
    },
    decisions: buildDecisions({
      ...flags,
      prefixQps,
      vocabularySize,
      freshnessMinutes,
      shardCount,
      globalRegions,
      latencyBudgetMs,
    }),
    reasons: buildReasons({
      ...flags,
      prefixQps,
      vocabularySize,
      trieMemoryGigabytes,
      effectiveTrieReads,
      freshnessMinutes,
      shardCount,
      globalRegions,
      latencyBudgetMs,
    }),
  };
}

type ArchitectureFlags = {
  needsCache: boolean;
  needsCdn: boolean;
  needsSharding: boolean;
  needsStreaming: boolean;
  personalization: boolean;
  typoTolerance: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    prefixQps: number;
    vocabularySize: number;
    trieMemoryGigabytes: number;
    effectiveTrieReads: number;
    freshnessMinutes: number;
    shardCount: number;
    globalRegions: number;
    latencyBudgetMs: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsCache) {
    reasons.push({
      severity: analysis.effectiveTrieReads > comfortableTrieReadsPerSecond ? 'danger' : 'warning',
      text: `${formatRate(
        analysis.prefixQps,
      )}/s of per-keystroke lookups should be served from a hot-prefix cache; only the long-tail misses reach the trie.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Read volume is low enough that one in-memory trie answers every prefix without a cache.',
    });
  }

  if (analysis.needsSharding) {
    reasons.push({
      severity:
        analysis.trieMemoryGigabytes > comfortableTrieMemoryGigabytes * 2 ? 'danger' : 'warning',
      text: `${formatCount(
        analysis.vocabularySize,
      )} distinct queries (~${formatStorageGigabytes(
        analysis.trieMemoryGigabytes,
      )}) exceed one box; partition the trie into ${analysis.shardCount} prefix shards.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `The whole trie (~${formatStorageGigabytes(
        analysis.trieMemoryGigabytes,
      )}) fits in one machine’s memory, so no sharding is justified yet.`,
    });
  }

  if (analysis.needsStreaming) {
    reasons.push({
      severity: 'warning',
      text: `A ${formatLagMinutes(
        analysis.freshnessMinutes,
      )} freshness target needs streaming log aggregation; a periodic batch rebuild cannot keep up.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Completions can lag by hours, so a periodic batch rebuild of top-k from the query log is enough.',
    });
  }

  if (analysis.needsCdn) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.globalRegions)} ${pluralize(
        'region',
        analysis.globalRegions,
      )} with a ${Math.round(
        analysis.latencyBudgetMs,
      )} ms budget push the cache and trie to replicas near each user.`,
    });
  }

  if (analysis.personalization) {
    reasons.push({
      severity: 'warning',
      text: 'Personalization replaces one shared global top-k with per-user ranking at request time, which also dilutes the hot-prefix cache.',
    });
  }

  if (analysis.typoTolerance) {
    reasons.push({
      severity: 'ok',
      text: 'Typo / fuzzy tolerance widens each lookup beyond an exact trie walk, raising per-query cost on the read path.',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    prefixQps: number;
    vocabularySize: number;
    freshnessMinutes: number;
    shardCount: number;
    globalRegions: number;
    latencyBudgetMs: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    trie: {
      // The trie + precomputed top-k is the core decision and is always the right base design.
      state: 'needed',
      copy: 'Serve completions from a trie with top-k precomputed and stored at each node, so a lookup is O(prefix length), not a scan.',
    },
    cache: {
      state: flags.needsCache ? (flags.personalization ? 'tradeoff' : 'needed') : 'not-yet',
      copy: flags.needsCache
        ? flags.personalization
          ? 'Cache the hottest non-personalized prefixes, but per-user ranking means the cache covers fewer lookups.'
          : 'Cache the completions for the hottest prefixes; skewed popularity lets a small cache serve most lookups.'
        : 'No cache yet — the trie serves the modest lookup volume directly.',
    },
    sharding: {
      state: flags.needsSharding ? 'needed' : 'not-yet',
      copy: flags.needsSharding
        ? `Partition the trie into ${flags.shardCount} shards by prefix so a huge vocabulary fits and each lookup hits one shard.`
        : 'One box holds the whole trie until the vocabulary or memory proves otherwise.',
    },
    pipeline: {
      state: flags.needsStreaming ? 'needed' : 'useful',
      copy: flags.needsStreaming
        ? `Stream the query log to update top-k incrementally so trends surface within ${formatLagMinutes(
            flags.freshnessMinutes,
          )}.`
        : 'A periodic batch job rebuilds top-k from the query log; freshness can lag by hours.',
    },
    personalization: {
      state: flags.personalization ? 'tradeoff' : 'not-yet',
      copy: flags.personalization
        ? 'Blend a global base ranking with per-user signals at request time; this trades a shared cache for relevance.'
        : 'A single shared global top-k per prefix serves everyone, which keeps the cache maximally effective.',
    },
    ranking: {
      state: flags.typoTolerance ? 'useful' : 'not-yet',
      copy: flags.typoTolerance
        ? 'Rank by historical frequency and tolerate small typos with fuzzy prefix matching at extra read cost.'
        : 'Rank completions by historical frequency with exact-prefix matching only.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsStreaming && !flags.needsCdn) {
    return 'Single in-memory trie';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsStreaming)) {
    return 'Global edge trie + streaming top-k';
  }
  if (flags.needsSharding && flags.needsStreaming) {
    return 'Sharded trie + streaming aggregation';
  }
  if (flags.needsSharding) {
    return 'Cached reads + prefix-sharded trie';
  }
  if (flags.needsCache) {
    return 'Hot-prefix cache + single trie';
  }
  return 'Single in-memory trie';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsStreaming && !flags.needsCdn) {
    return 'One in-memory trie holding precomputed top-k answers every prefix, refreshed by an occasional batch rebuild. Nothing else is justified yet.';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsStreaming)) {
    return 'Hot prefixes and the sharded trie are replicated near each user for single-digit-ms lookups, while a streaming pipeline keeps top-k fresh and ranking can fold in per-user signals.';
  }
  if (flags.needsSharding && flags.needsStreaming) {
    return 'A cache absorbs the skewed reads, the trie is sharded by prefix for the huge vocabulary, and a stream processor keeps top-k fresh within minutes.';
  }
  if (flags.needsSharding) {
    return 'A hot-prefix cache serves the bulk of lookups and the trie is partitioned by prefix so a large vocabulary fits across nodes.';
  }
  if (flags.needsCache) {
    return 'A hot-prefix cache serves the popular lookups so a single in-memory trie only handles the long tail of misses.';
  }
  return 'One in-memory trie still covers the workload.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsStreaming && !flags.needsCdn) {
    return 'Keystroke -> API -> trie';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsStreaming)) {
    return 'Keystroke -> edge cache -> sharded trie (miss); stream -> top-k';
  }
  if (flags.needsSharding && flags.needsStreaming) {
    return 'Keystroke -> cache -> sharded trie (miss); stream -> top-k';
  }
  if (flags.needsSharding) {
    return 'Keystroke -> cache -> sharded trie (miss)';
  }
  if (flags.needsCache) {
    return 'Keystroke -> cache -> trie (miss)';
  }
  return 'Keystroke -> API -> trie';
}

function formatLagMinutes(minutes: number): string {
  if (minutes >= 1_440) {
    return `${Math.round(minutes / 1_440)} day${Math.round(minutes / 1_440) === 1 ? '' : 's'}`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `${hours} hr${hours === 1 ? '' : 's'}`;
  }
  if (minutes >= 1) {
    return `${Math.round(minutes)} min`;
  }
  return `${Math.round(minutes * 60)} sec`;
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function pluralize(unit: string, value: number): string {
  return Math.round(value) === 1 ? unit : `${unit}s`;
}
