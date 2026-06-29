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
  eyebrow: '系统设计 Lab',
  title:
    'Search autocomplete 是在紧绷 latency 预算下的只读 top-k prefix 查询，由一条独立的聚合 pipeline 喂养 —— 而不是一条实时写路径。',
  summary:
    '调节按键查询速率、词表大小、返回多少条建议、p99 latency 预算、completion 要多新鲜，以及 region 数。设计会从单个内存 trie 演进到 cache 最热的 prefix、按 prefix 给 trie 分片、用一条流式 log 聚合 pipeline 保新鲜，再到 per-region 个性化。',
  controls: [
    {
      id: 'prefixQps',
      label: 'Prefix 查询速率',
      help: '读：每次按键都会为当前 prefix 发起一次查询。这是主导流量。',
      min: 10,
      max: 5_000_000,
      defaultValue: 2_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'vocabularySize',
      label: '词表大小',
      help: '存在 trie 里的去重查询数。去重查询越多，prefix 树就越大越深。',
      min: 10_000,
      max: 50_000_000_000,
      defaultValue: 5_000_000,
      scale: 'log',
      unit: '条',
      format: 'count',
    },
    {
      id: 'topKSuggestions',
      label: '返回的建议数',
      help: '在每个 trie 节点预计算并存好的 top-k completion，每次查询返回这么多条。',
      min: 3,
      max: 20,
      defaultValue: 10,
      scale: 'linear',
      unit: '条',
      format: 'count',
    },
    {
      id: 'latencyBudgetMs',
      label: 'p99 latency 预算',
      help: 'prefix 查询得多快返回，建议在打字中途才不会显得卡。',
      min: 5,
      max: 300,
      defaultValue: 100,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'freshnessMinutes',
      label: '更新新鲜度',
      help: '一个查询开始火起来到它出现在 completion 里之间可接受的滞后。越低意味着 pipeline 越紧。',
      min: 1,
      max: 1_440,
      defaultValue: 60,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'globalRegions',
      label: 'Region 数',
      help: '应在 latency 预算内、就近为用户提供 completion 的 region。',
      min: 1,
      max: 20,
      defaultValue: 1,
      scale: 'linear',
      unit: '个',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'personalization',
      label: '个性化建议',
      help: '把 per-user 历史混进 ranking；这就排除了每个 prefix 一份共享的全局 top-k。',
      defaultValue: false,
    },
    {
      id: 'typoTolerance',
      label: '错字 / fuzzy 容忍',
      help: '允许带少量编辑的 prefix 匹配；让每次查询超出一次精确的 trie 行走、范围更宽。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'in-memory-trie',
      step: '01',
      title: '单个内存 trie',
      summary: '一台小机器用一个 trie 回答每个 prefix。',
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
      title: 'Cache 热门 prefix',
      summary: '按键流量暴涨，但少数 prefix 占了大头。',
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
      title: '给 trie 分片',
      summary: '庞大的词表在一台机器里装不下了。',
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
      title: '流式新鲜度',
      summary: '趋势必须几分钟内浮现，而不是几小时。',
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
      title: '全球 + 个性化',
      summary: '在每个用户身边做 per-user ranking，个位数 ms。',
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
    title: 'Search autocomplete 架构图',
    description:
      'search autocomplete 的白板风格架构图：每次按键发起查询的 client、带 hot-prefix cache 的 edge/API 层、持有预计算 top-k 的 prefix-sharded trie service、从 query log 重建 top-k 的聚合 pipeline，以及 query-log 存储。',
    columns: [
      {
        id: 'clients',
        label: 'Client',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: '每次按键',
            summary: '每次按键发起一次 prefix 查询，并记录被选中的 query',
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
            subtitle: '查询 + 记录',
            summary: '把 prefix 查询分发给 trie，并把被选中的 query 转发到 log',
            kind: 'api',
          },
          {
            id: 'prefixCache',
            title: 'Prefix cache',
            subtitle: '热门 prefix',
            summary: '为最常见的 prefix 提供 completion，不碰 trie',
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
            subtitle: '预计算 top-k',
            summary: '行走 prefix 树，返回匹配节点上存好的 top-k',
            kind: 'search',
          },
          {
            id: 'trieShards',
            title: 'Trie shard',
            subtitle: '按 prefix 分片',
            summary: '把 prefix 树拆到多个节点上，让庞大词表既装得下又能扩展',
            kind: 'search',
          },
        ],
      },
      {
        id: 'aggregation',
        label: '聚合',
        variant: 'processing',
        nodes: [
          {
            id: 'aggregator',
            title: 'Aggregator',
            subtitle: '重建 top-k',
            summary: '统计 query 频率，重新算出 top-k 并写回 trie',
            kind: 'compute',
          },
          {
            id: 'streamProcessor',
            title: 'Stream processor',
            subtitle: '新鲜更新',
            summary: '从实时 log 增量更新计数，让趋势在几分钟内浮现',
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
            subtitle: '原始搜索',
            summary: '持久记录每个被选中的 query，作为 ranking 的 source of truth',
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
    { id: 'readPath', label: '查询 vs latency 预算' },
    { id: 'trieMemory', label: 'Trie 内存' },
    { id: 'cachePressure', label: 'Hot-prefix cache 压力' },
    { id: 'updateLag', label: '更新 / 新鲜度滞后' },
    { id: 'fanout', label: 'Shard fan-out' },
  ],
  decisions: [
    { id: 'trie', title: 'Trie + 预计算 top-k' },
    { id: 'cache', title: 'Hot-prefix cache' },
    { id: 'sharding', title: 'Prefix sharding' },
    { id: 'pipeline', title: '更新 pipeline' },
    { id: 'personalization', title: '个性化 ranking' },
    { id: 'ranking', title: 'Ranking / 错字容忍' },
  ],
  sourceBackedRules: [
    {
      title: 'trie 回答 prefix 查询的耗时与 prefix 长度成正比',
      source: 'NIST Dictionary of Algorithms and Data Structures',
      url: 'https://xlinux.nist.gov/dads/HTML/trie.html',
      summary:
        'trie 以 prefix 的字符为 key，所以一次 completion 查询是 O(prefix 长度)，与存了多少 query 无关 —— 不像扫描整个词表那样。',
    },
    {
      title: 'query 热度高度倾斜，所以一个小 cache 就能覆盖大多数查询',
      source: 'Baeza-Yates et al., "The Impact of Caching on Search Engines" (SIGIR)',
      url: 'https://dl.acm.org/doi/10.1145/1277741.1277775',
      summary:
        '搜索 query 流服从幂律：一小撮热门 query 占了很大一部分流量，所以 cache 最热的 prefix 就能吸收大多数读。',
    },
    {
      title: '在每个节点预计算并存好 top-k，而不是在查询时才 ranking',
      source: 'Redis Docs — autocomplete with sorted sets',
      url: 'https://redis.io/docs/latest/develop/use/patterns/',
      summary:
        '提前把排好序的 completion 维护好（比如每个 prefix 一个 sorted set），就把一次查询变成读取一份已排序的 top-k，而不是临时聚合。',
    },
    {
      title: '流式聚合能从一条无界 log 产出低延迟更新',
      source: 'Apache Flink Documentation',
      url: 'https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/',
      summary:
        '一个有状态的 stream processor 在 query log 上维护滚动聚合，让更新后的 top-k 计数在数秒到数分钟内可用，而不用等一次批量重建。',
    },
  ],
  teachingAssumptions: [
    'completion 被建模成可缓存的 prefix 查询；cache 覆盖率是从 query 热度倾斜近似出来的，不是实测的命中率。',
    '单节点读 throughput 和内存 trie 容量都是保守的教学数字，不是厂商上限。',
    '在热路径上 trie 是只读的；新鲜度只来自那条独立的聚合 pipeline，所以搜索 latency 和更新滞后是各自独立的预算。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-trie',
      step: '01',
      focus: '单个内存 trie',
      scenarioId: 'in-memory-trie',
      question:
        '一个小站点在 200k 条去重 query 上做约每秒 200 次 prefix 查询。你现在需要 cache、shard 或流式 pipeline 吗？',
      reveal:
        '不需要。整个 trie 在一台机器的内存里就装得下，一次查询是 O(prefix 长度)、与词表大小无关，每秒 200 次读微不足道。每天用一个批量作业在 query log 上刷新一两次 top-k 就绰绰有余。其余一切都为时过早。',
      takeaway: '从单个持有预计算 top-k 的内存 trie 起步；新鲜度可以滞后几个小时。',
    },
    {
      id: 'cache-hot',
      step: '02',
      focus: '热门 prefix 占大头',
      scenarioId: 'cache-hot-prefixes',
      question:
        '流量跳到每秒 150k 次查询，但其中大多数落在少数几个 prefix 上。保护 trie 最便宜的办法是什么？',
      reveal:
        'cache 最热那几个 prefix 的 completion。query 热度呈幂律倾斜，所以一个小 cache 能以内存速度服务大部分查询，trie 只看到那条 miss 的长尾 —— 暂时不用分片。',
      takeaway: '倾斜的 prefix 热度让一个小 cache 就能吸收大多数读流量。',
    },
    {
      id: 'shard',
      step: '03',
      focus: '词表超出一台机器',
      scenarioId: 'shard-the-trie',
      question:
        '词表涨到约 20 亿条去重 query。cache 对读还有帮助，但现在什么会撑不住？',
      reveal:
        'trie 在一台机器的内存里装不下了。按 prefix 把它分到各个 shard 上，每个持有树的一片；一次查询按它的起始字符路由。fan-out 仍很小，因为一个 prefix 只住在一个 shard 上。',
      takeaway: '当词表超出一台机器时，按 prefix 给 trie 分片，让每次查询只命中一个 shard。',
    },
    {
      id: 'streaming',
      step: '04',
      focus: '分钟级新鲜度',
      scenarioId: 'streaming-freshness',
      question:
        '一个突发新闻 query 必须在约 2 分钟内出现在建议里。每小时一次的批量重建能做到吗？',
      reveal:
        '做不到 —— 每小时一次太慢了。用一个 stream processor 来替换（或增强）它：从实时 query log 维护滚动的 top-k 计数，并把增量更新写进 trie，让趋势在几分钟内浮现。查询 latency 不受影响，因为热路径仍是只读的。',
      takeaway: '新鲜度是 pipeline 的属性：把 query log 流式处理，几分钟而非几小时就能更新 top-k。',
    },
    {
      id: 'global',
      step: '05',
      focus: '全球 + 个性化',
      scenarioId: 'global-personalized',
      question:
        '现在全球用户都期待 10 ms 以内的个性化 completion。每个 prefix 一份共享的全局 top-k、只从一个 region 提供，够吗？',
      reveal:
        '两点都不够。跨洲做到 10 ms 以内，需要把 cache 和 trie 复制到每个 region 里用户身边；而个性化意味着 ranking 不再能是单一共享的 top-k —— 你要在请求时把一份全局基准 ranking 和 per-user 信号混合。个性化还会稀释 cache 效果，因为结果因人而异。',
      takeaway: '全球低延迟把 trie 推到 edge；个性化则拿共享 cache 换来 per-user ranking。',
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
          ? `hot-prefix cache 吸收了大多数查询；trie 仍要在 ${Math.round(latencyBudgetMs)} ms 预算内服务约 ${formatRate(
              effectiveTrieReads,
            )}/s。`
          : `每次按键都直接命中 trie —— 在 ${Math.round(latencyBudgetMs)} ms 预算内约 ${formatRate(
              effectiveTrieReads,
            )}/s。`,
      },
      trieMemory: {
        ratio: trieMemoryGigabytes / comfortableTrieMemoryGigabytes,
        valueText: formatStorageGigabytes(trieMemoryGigabytes),
        copy: `${formatCount(vocabularySize)} 条去重 query、每个节点存 top-${Math.round(
          topKSuggestions,
        )}，在内存里大约占 ${formatStorageGigabytes(trieMemoryGigabytes)}。`,
      },
      cachePressure: {
        ratio: cachePressureRatio,
        valueText: needsCache ? `${Math.round(cacheServedShare * 100)}% 由 cache 命中` : '无 cache',
        copy: needsCache
          ? personalization
            ? '个性化结果因人而异，所以 hot-prefix cache 能覆盖的查询少得多，压力随之上升。'
            : '倾斜的 prefix 热度让一个小 cache 就能以内存速度覆盖大部分查询。'
          : '读量足够低，trie 不用 cache 就能直接回答每个 prefix。',
      },
      updateLag: {
        ratio: updateLagRatio,
        valueText: needsStreaming
          ? `约 ${formatLagMinutes(effectiveLagMinutes)} 滞后`
          : `约 ${formatLagMinutes(batchRebuildLagMinutes)} 批量`,
        copy: needsStreaming
          ? `${formatLagMinutes(
              freshnessMinutes,
            )} 的新鲜度目标需要流式聚合；每小时一次的批量重建太慢了。`
          : `${formatLagMinutes(
              freshnessMinutes,
            )} 的新鲜度目标，靠周期性批量重建 top-k 就能轻松满足。`,
      },
      fanout: {
        ratio: fanoutPressure,
        valueText: needsSharding
          ? `${shardCount} 个 shard`
          : '1 个 shard',
        copy: needsSharding
          ? `trie 被拆成 ${shardCount} 个 prefix shard；每次查询按其起始字符路由到一个 shard。`
          : '整个 trie 在一个节点上就装得下，所以一次查询从不跨 shard 做 fan-out。',
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
      )}/s 的逐键查询应当由一个 hot-prefix cache 来服务；只有长尾 miss 才会打到 trie。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '读量足够低，一个内存 trie 不用 cache 就能回答每个 prefix。',
    });
  }

  if (analysis.needsSharding) {
    reasons.push({
      severity:
        analysis.trieMemoryGigabytes > comfortableTrieMemoryGigabytes * 2 ? 'danger' : 'warning',
      text: `${formatCount(
        analysis.vocabularySize,
      )} 条去重 query（约 ${formatStorageGigabytes(
        analysis.trieMemoryGigabytes,
      )}）超出了一台机器；把 trie 分成 ${analysis.shardCount} 个 prefix shard。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `整个 trie（约 ${formatStorageGigabytes(
        analysis.trieMemoryGigabytes,
      )}）在一台机器的内存里就装得下，所以暂时不必分片。`,
    });
  }

  if (analysis.needsStreaming) {
    reasons.push({
      severity: 'warning',
      text: `${formatLagMinutes(
        analysis.freshnessMinutes,
      )} 的新鲜度目标需要流式 log 聚合；周期性的批量重建跟不上。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'completion 可以滞后几个小时，所以从 query log 周期性批量重建 top-k 就够了。',
    });
  }

  if (analysis.needsCdn) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.globalRegions)} 个 region 加上 ${Math.round(
        analysis.latencyBudgetMs,
      )} ms 的预算，把 cache 和 trie 推到每个用户身边的副本上。`,
    });
  }

  if (analysis.personalization) {
    reasons.push({
      severity: 'warning',
      text: '个性化用请求时的 per-user ranking 取代了单一共享的全局 top-k，这也会稀释 hot-prefix cache。',
    });
  }

  if (analysis.typoTolerance) {
    reasons.push({
      severity: 'ok',
      text: '错字 / fuzzy 容忍让每次查询超出一次精确的 trie 行走，抬高了读路径上每条 query 的成本。',
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
      copy: '用一个在每个节点都预计算并存好 top-k 的 trie 来提供 completion，这样一次查询是 O(prefix 长度)，而不是扫描。',
    },
    cache: {
      state: flags.needsCache ? (flags.personalization ? 'tradeoff' : 'needed') : 'not-yet',
      copy: flags.needsCache
        ? flags.personalization
          ? 'cache 最热的非个性化 prefix，但 per-user ranking 意味着 cache 能覆盖的查询变少。'
          : 'cache 最热那些 prefix 的 completion；倾斜的热度让一个小 cache 就能服务大多数查询。'
        : '暂时不用 cache —— trie 直接服务这点不大的查询量。',
    },
    sharding: {
      state: flags.needsSharding ? 'needed' : 'not-yet',
      copy: flags.needsSharding
        ? `按 prefix 把 trie 分成 ${flags.shardCount} 个 shard，让庞大词表既装得下、又让每次查询只命中一个 shard。`
        : '在词表或内存证明不行之前，一台机器就持有整个 trie。',
    },
    pipeline: {
      state: flags.needsStreaming ? 'needed' : 'useful',
      copy: flags.needsStreaming
        ? `把 query log 流式处理来增量更新 top-k，让趋势在 ${formatLagMinutes(
            flags.freshnessMinutes,
          )} 内浮现。`
        : '一个周期性批量作业从 query log 重建 top-k；新鲜度可以滞后几个小时。',
    },
    personalization: {
      state: flags.personalization ? 'tradeoff' : 'not-yet',
      copy: flags.personalization
        ? '在请求时把一份全局基准 ranking 和 per-user 信号混合；这是拿共享 cache 换相关性。'
        : '每个 prefix 一份共享的全局 top-k 服务所有人，让 cache 保持最大效果。',
    },
    ranking: {
      state: flags.typoTolerance ? 'useful' : 'not-yet',
      copy: flags.typoTolerance
        ? '按历史频率 ranking，并用 fuzzy prefix 匹配容忍少量错字，代价是额外的读成本。'
        : '只用精确 prefix 匹配，按历史频率给 completion 做 ranking。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsStreaming && !flags.needsCdn) {
    return '单个内存 trie';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsStreaming)) {
    return '全球 edge trie + 流式 top-k';
  }
  if (flags.needsSharding && flags.needsStreaming) {
    return '分片 trie + 流式聚合';
  }
  if (flags.needsSharding) {
    return '缓存读 + prefix-sharded trie';
  }
  if (flags.needsCache) {
    return 'Hot-prefix cache + 单个 trie';
  }
  return '单个内存 trie';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsStreaming && !flags.needsCdn) {
    return '一个持有预计算 top-k 的内存 trie 回答每个 prefix，靠偶尔一次批量重建来刷新。此外的东西暂时都不值当。';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsStreaming)) {
    return '热门 prefix 和分片后的 trie 被复制到每个用户身边，做到个位数 ms 的查询，同时一条流式 pipeline 让 top-k 保持新鲜，ranking 还能折入 per-user 信号。';
  }
  if (flags.needsSharding && flags.needsStreaming) {
    return '一个 cache 吸收倾斜的读，trie 按 prefix 为庞大词表分片，一个 stream processor 让 top-k 在几分钟内保持新鲜。';
  }
  if (flags.needsSharding) {
    return '一个 hot-prefix cache 服务大部分查询，trie 按 prefix 分区，让大词表能跨多个节点装下。';
  }
  if (flags.needsCache) {
    return '一个 hot-prefix cache 服务热门查询，让单个内存 trie 只处理那条 miss 的长尾。';
  }
  return '一个内存 trie 仍能覆盖这份负载。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsStreaming && !flags.needsCdn) {
    return '按键 -> API -> trie';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsStreaming)) {
    return '按键 -> edge cache -> 分片 trie（miss）；stream -> top-k';
  }
  if (flags.needsSharding && flags.needsStreaming) {
    return '按键 -> cache -> 分片 trie（miss）；stream -> top-k';
  }
  if (flags.needsSharding) {
    return '按键 -> cache -> 分片 trie（miss）';
  }
  if (flags.needsCache) {
    return '按键 -> cache -> trie（miss）';
  }
  return '按键 -> API -> trie';
}

function formatLagMinutes(minutes: number): string {
  if (minutes >= 1_440) {
    return `${Math.round(minutes / 1_440)} 天`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `${hours} 小时`;
  }
  if (minutes >= 1) {
    return `${Math.round(minutes)} 分钟`;
  }
  return `${Math.round(minutes * 60)} 秒`;
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
