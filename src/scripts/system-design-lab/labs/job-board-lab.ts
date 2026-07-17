import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatDuration, formatRate } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative teaching budgets. They make the architectural inflection visible;
// they are not PostgreSQL, Elasticsearch, or OpenSearch vendor limits.
const comfortablePostgresCandidatesPerQuery = 50_000;
const comfortablePostgresCandidateScoresPerSecond = 50_000_000;
const searchDocumentsPerShard = 5_000_000;
const searchIndexUpdatesPerShardSecond = 5_000;

export const jobBoardLabDefinition: SystemDesignLabDefinition = {
  id: 'job-board',
  eyebrow: '系统设计 Lab',
  title:
    'Job Board 先用 PostgreSQL 完成全文检索与结构化过滤；只有候选打分、搜索功能或独立扩容成为主导约束时，Search Service 才成为单独的 component。',
  summary:
    '调节 active jobs、搜索 QPS、常见 keyword 的命中率、metadata filter 的选择性、职位更新率、latency 与 freshness 预算。观察 B-tree / GIN / GiST / partial index 何时足够，以及 Elasticsearch / OpenSearch 何时值得承担一份派生索引和异步 freshness。',
  controls: [
    {
      id: 'activeJobs',
      label: 'Active jobs',
      help: '真正进入在线搜索集合的职位数；closed history 已被 partial indexes 排除。',
      min: 10_000,
      max: 100_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: 'jobs',
      format: 'count',
    },
    {
      id: 'searchQps',
      label: 'Search QPS',
      help: '求职者执行 keyword + filters 查询的峰值速率。',
      min: 10,
      max: 100_000,
      defaultValue: 300,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'keywordMatchPercent',
      label: 'Keyword 命中率',
      help: 'GIN retrieval 后仍匹配 keyword 的 active jobs 比例；常见词会让这个值突然变大。',
      min: 0.01,
      max: 80,
      defaultValue: 1,
      scale: 'log',
      format: 'percentage',
    },
    {
      id: 'filterRetentionPercent',
      label: 'Filters 保留比例',
      help: 'location、company、salary 等结构化 filters 组合后留下多少 keyword candidates。',
      min: 0.1,
      max: 100,
      defaultValue: 5,
      scale: 'log',
      format: 'percentage',
    },
    {
      id: 'jobUpdatesPerSecond',
      label: '职位更新速率',
      help: '创建、编辑、暂停和关闭职位的总速率；独立 Search Service 必须消费同样的变化。',
      min: 1,
      max: 100_000,
      defaultValue: 20,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'latencyBudgetMs',
      label: 'Search p95 预算',
      help: '完整 Search API 的目标，不只是数据库或搜索集群内部耗时。',
      min: 50,
      max: 1_000,
      defaultValue: 500,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'freshnessBudgetSeconds',
      label: 'Search freshness 预算',
      help: 'Job commit 后，搜索结果允许落后多长时间；申请正确性仍回 PostgreSQL 校验。',
      min: 0.5,
      max: 60,
      defaultValue: 5,
      scale: 'log',
      format: 'duration-seconds',
    },
  ],
  toggles: [
    {
      id: 'advancedSearchFeatures',
      label: '需要 typo / synonyms / facets',
      help: '这些是专用 Search Service 的能力需求，不只是简单的 keyword match。',
      defaultValue: false,
    },
    {
      id: 'exactTotalCount',
      label: '要求精确 total count',
      help: '精确统计所有 matches 会削弱 Top-K early termination；通常应显示 1,000+。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'postgres-filtered-search',
      step: '01',
      title: 'PostgreSQL 起步',
      summary: 'Typed filters 很强，少量 candidates 直接在 PostgreSQL ranking。',
      values: {
        activeJobs: 200_000,
        searchQps: 80,
        keywordMatchPercent: 0.2,
        filterRetentionPercent: 2,
        jobUpdatesPerSecond: 5,
        latencyBudgetMs: 500,
        freshnessBudgetSeconds: 5,
        advancedSearchFeatures: false,
        exactTotalCount: false,
      },
    },
    {
      id: 'postgres-indexed-search',
      step: '02',
      title: 'GIN + typed filters',
      summary: '几百万 active jobs 仍可由 partial GIN、B-tree 和 GiST 组合。',
      values: {
        activeJobs: 3_000_000,
        searchQps: 300,
        keywordMatchPercent: 1,
        filterRetentionPercent: 5,
        jobUpdatesPerSecond: 20,
        latencyBudgetMs: 300,
        freshnessBudgetSeconds: 5,
        advancedSearchFeatures: false,
        exactTotalCount: false,
      },
    },
    {
      id: 'broad-keyword-boundary',
      step: '03',
      title: 'Common keyword 爆开',
      summary: '大量 candidates 需要动态打分，PostgreSQL 搜索路径开始压过预算。',
      values: {
        activeJobs: 10_000_000,
        searchQps: 1_000,
        keywordMatchPercent: 20,
        filterRetentionPercent: 20,
        jobUpdatesPerSecond: 50,
        latencyBudgetMs: 300,
        freshnessBudgetSeconds: 5,
        advancedSearchFeatures: false,
        exactTotalCount: false,
      },
    },
    {
      id: 'independent-search-service',
      step: '04',
      title: '独立 Search Service',
      summary: 'BM25、filters 和 Top-K 进入 Elasticsearch/OpenSearch，Job truth 留在 PostgreSQL。',
      values: {
        activeJobs: 20_000_000,
        searchQps: 5_000,
        keywordMatchPercent: 8,
        filterRetentionPercent: 15,
        jobUpdatesPerSecond: 100,
        latencyBudgetMs: 200,
        freshnessBudgetSeconds: 5,
        advancedSearchFeatures: true,
        exactTotalCount: false,
      },
    },
    {
      id: 'freshness-tradeoff',
      step: '05',
      title: 'Freshness 与 count 成本',
      summary: '高更新率、亚秒 freshness 和精确 count 暴露派生索引的真实代价。',
      values: {
        activeJobs: 20_000_000,
        searchQps: 5_000,
        keywordMatchPercent: 8,
        filterRetentionPercent: 15,
        jobUpdatesPerSecond: 30_000,
        latencyBudgetMs: 150,
        freshnessBudgetSeconds: 0.5,
        advancedSearchFeatures: true,
        exactTotalCount: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'Job Board 搜索架构图',
    description:
      '白板风格 Job Board 架构：PostgreSQL 保存 Job truth；CDC / Outbox 捕获 committed changes，Queue 负责缓冲和传输，Indexer 负责生成可搜索副本。',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'jobSeeker',
            title: 'Job seeker',
            subtitle: 'search + apply',
            summary: '提交 keyword、filters，并申请一个当前仍 active 的职位',
            kind: 'client',
          },
          {
            id: 'employer',
            title: 'Employer',
            subtitle: 'publish + close',
            summary: '创建、编辑、暂停或关闭 Job',
            kind: 'client',
          },
        ],
      },
      {
        id: 'services',
        label: 'APIs',
        variant: 'edge',
        nodes: [
          {
            id: 'searchApi',
            title: 'Search API',
            subtitle: 'retrieve + rank',
            summary: '查询 PostgreSQL indexes，或在独立 Search Service 中执行 BM25 + filters',
            kind: 'api',
          },
          {
            id: 'jobApi',
            title: 'Job API',
            subtitle: 'source writes',
            summary: '把职位变化写入 PostgreSQL source of truth',
            kind: 'api',
          },
          {
            id: 'applicationApi',
            title: 'Application API',
            subtitle: 'validate active',
            summary: '提交申请前回 PostgreSQL 校验最新 Job.status',
            kind: 'service',
          },
        ],
      },
      {
        id: 'postgresql',
        label: 'PostgreSQL',
        variant: 'storage',
        nodes: [
          {
            id: 'jobTable',
            title: 'Job table',
            subtitle: 'source of truth',
            summary: '保存 Job、status、version 和 typed search fields',
            kind: 'db',
          },
          {
            id: 'postgresIndexes',
            title: 'PG indexes',
            subtitle: 'B-tree + GIN + GiST',
            summary: '用 active-only partial indexes 检索、过滤并缩小 ranking candidates',
            kind: 'search',
          },
        ],
      },
      {
        id: 'derived-search',
        label: 'Derived search',
        variant: 'processing',
        nodes: [
          {
            id: 'changeCapture',
            title: 'CDC / Outbox',
            subtitle: 'capture commits',
            summary: 'CDC 读取 WAL，或 Relay 读取 transaction 内提交的 outbox event；只捕获已经 commit 的变化',
            kind: 'stream',
          },
          {
            id: 'eventQueue',
            title: 'Event log / Queue',
            subtitle: 'buffer + replay',
            summary: 'Kafka 一类的 durable log 负责缓冲、重试和 replay；它不是 CDC，也不是 source of truth',
            kind: 'queue',
          },
          {
            id: 'indexer',
            title: 'Indexer',
            subtitle: 'versioned upsert',
            summary: '消费事件并生成幂等、带 version 的 SearchDocument upsert',
            kind: 'compute',
          },
          {
            id: 'searchCluster',
            title: 'Search service',
            subtitle: 'BM25 + filters',
            summary: 'Elasticsearch/OpenSearch 独立保存和扩展派生的 inverted index',
            kind: 'search',
          },
        ],
      },
    ],
    flows: [
      { from: 'jobSeeker', to: 'searchApi', variant: 'primary' },
      { from: 'jobSeeker', to: 'applicationApi', variant: 'direct' },
      { from: 'employer', to: 'jobApi', variant: 'primary' },
      { from: 'searchApi', to: 'postgresIndexes', variant: 'direct' },
      { from: 'searchApi', to: 'searchCluster', variant: 'primary' },
      { from: 'jobApi', to: 'jobTable', variant: 'primary' },
      { from: 'applicationApi', to: 'jobTable', variant: 'primary' },
      { from: 'jobTable', to: 'postgresIndexes', variant: 'secondary' },
      { from: 'jobTable', to: 'changeCapture', variant: 'secondary' },
      { from: 'changeCapture', to: 'eventQueue', variant: 'secondary' },
      { from: 'eventQueue', to: 'indexer', variant: 'secondary' },
      { from: 'indexer', to: 'searchCluster', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'candidates', label: '每次查询需要 ranking 的 candidates' },
    { id: 'postgresPressure', label: 'PostgreSQL search CPU 压力' },
    { id: 'latency', label: 'Search latency vs p95 预算' },
    { id: 'freshness', label: 'Search freshness lag' },
    { id: 'resultWork', label: 'Top-K / total count 工作量' },
  ],
  decisions: [
    { id: 'typedFilters', title: 'Typed filters' },
    { id: 'postgresFts', title: 'PostgreSQL FTS' },
    { id: 'partialIndexes', title: 'Active-only partial indexes' },
    { id: 'searchService', title: '独立 Search Service' },
    { id: 'indexingPipeline', title: 'CDC / Outbox / Queue' },
    { id: 'applicationValidation', title: '申请时回源校验' },
  ],
  sourceBackedRules: [
    {
      title: 'GIN 是 PostgreSQL 全文搜索的首选 index type',
      source: 'PostgreSQL — Preferred Index Types for Text Search',
      url: 'https://www.postgresql.org/docs/current/textsearch-indexes.html',
      summary:
        'GIN 保存 lexeme 到 rows 的倒排关系，适合先做 keyword candidate retrieval；动态 relevance 仍由 ts_rank / ts_rank_cd 计算。',
    },
    {
      title: 'Partial index 只保存满足 predicate 的 rows',
      source: 'PostgreSQL — Partial Indexes',
      url: 'https://www.postgresql.org/docs/current/indexes-partial.html',
      summary:
        'active-only GIN、B-tree 和 GiST 可以排除多年 closed history，但 query predicate 必须能明确推出 index predicate。',
    },
    {
      title: 'OpenSearch keyword search 默认使用 BM25',
      source: 'OpenSearch — Keyword search',
      url: 'https://docs.opensearch.org/latest/search-plugins/keyword-search/',
      summary:
        '专用 Search Service 把全文 relevance、non-scoring filters 和 Top-K retrieval 当作核心 workload，而不是关系数据库中的附加能力。',
    },
    {
      title: 'CDC 捕获数据库已经提交的 row-level changes',
      source: 'Debezium — CDC Architecture',
      url: 'https://debezium.io/documentation/reference/architecture.html',
      summary:
        'CDC 是 change capture mechanism：connector 读取数据库 transaction log 并产生 change-event stream。Queue 是可选的传输与缓冲层，Indexer 才负责更新 SearchDocument。',
    },
    {
      title: 'Outbox 让业务状态与 event 在同一个 transaction 提交',
      source: 'Debezium — Outbox Event Router',
      url: 'https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html',
      summary:
        'Job API 同时写 Job row 与 outbox row；CDC connector 再捕获 outbox change。这样避免 PostgreSQL 成功、消息发送失败造成的同步双写分叉。',
    },
    {
      title: '独立 Search Index 是 near real-time，不是事务内立即可见',
      source: 'Elasticsearch — Near real-time search',
      url: 'https://www.elastic.co/docs/manage-data/data-store/near-real-time-search',
      summary:
        'document changes 经过 refresh 才进入可搜索 segments；所以搜索 freshness 与 Application API 的业务正确性必须分开。',
    },
  ],
  teachingAssumptions: [
    '候选数、latency 和 throughput 公式只是展示拐点的保守教学模型，不是 PostgreSQL、Elasticsearch 或 OpenSearch benchmark。',
    'Keyword 命中率与 filters 保留率应来自真实 query distribution；表的总行数本身不能决定是否迁移搜索。',
    'PostgreSQL indexes 与 Job row 在同一事务维护；独立 Search Service 被建模为约 1 秒 refresh，再叠加 indexing backlog。',
    '生产路径使用 Outbox / CDC -> durable Queue -> Indexer；小规模版本可以省略 Queue，但不能同步双写 PostgreSQL 与 Search Service。',
    '无论搜索读哪套 index，Application API 都以 PostgreSQL 当前 Job.status 作为最终正确性判断。',
  ],
  teachingWalkthrough: [
    {
      id: 'start-with-postgres',
      step: '01',
      focus: '先用一份数据',
      scenarioId: 'postgres-filtered-search',
      question:
        '只有 200k active jobs，而且 location 与 salary filters 把 keyword candidates 缩到个位数。你需要独立 Elasticsearch 吗？',
      reveal:
        '不需要。Job row 与 indexes 在同一事务中保持新鲜，B-tree / GIN / GiST 已经能完成 retrieval、filters 和简单 ranking。此时增加 Search Service 只会多出一份派生数据和同步边界。',
      takeaway: '先证明 PostgreSQL 的候选集和 latency 不够，再购买第二套系统的复杂度。',
    },
    {
      id: 'compose-indexes',
      step: '02',
      focus: '索引各做一件事',
      scenarioId: 'postgres-indexed-search',
      question:
        '3M active jobs 同时支持 keyword、location、company 和 salary。应该创建一个包含所有字段的巨型 composite index 吗？',
      reveal:
        '不应该。GIN 找 keyword candidates，B-tree 处理 location/company equality，GiST 只在真实语义是 range overlap 时使用；PostgreSQL 可以组合这些独立 indexes。所有在线索引再用 status = active 做 partial predicate。',
      takeaway: 'Index type 来自 operator；partial index 来自在线数据范围。',
    },
    {
      id: 'candidate-explosion',
      step: '03',
      focus: 'Candidate count 接管',
      scenarioId: 'broad-keyword-boundary',
      question:
        '表只有 10M active jobs，但 common keyword 在 filters 后仍留下 400k candidates。LIMIT 20 会让 PostgreSQL 只计算 20 个 score 吗？',
      reveal:
        '不会。GIN 不按当前 query 的动态 ts_rank 排序；为了得到精确 Top 20，PostgreSQL 仍可能给大量 candidates 打分。此时边界来自 candidate scoring 与 QPS，而不是表行数。',
      takeaway: '真正触发 Search Service 的是 broad-query ranking work，不是一个固定 row-count 门槛。',
    },
    {
      id: 'separate-search-service',
      step: '04',
      focus: 'Search 成为 component',
      scenarioId: 'independent-search-service',
      question:
        '加入 Elasticsearch/OpenSearch 后，它会替换 PostgreSQL 吗？Job API 和 Application API 应该读写哪里？',
      reveal:
        '不会替换。PostgreSQL 继续保存 Job truth；CDC / Outbox 只捕获 committed changes，Queue 负责缓冲和 replay，Indexer 才把可搜索副本写入 Search Service。Search API 读派生 index，而 Application API 提交前仍回 PostgreSQL 校验 active status。',
      takeaway: 'CDC 负责捕获，Queue 负责传输，Indexer 负责投影；Search Service 只是 derived read model。',
    },
    {
      id: 'freshness-boundary',
      step: '05',
      focus: 'Near real-time 的代价',
      scenarioId: 'freshness-tradeoff',
      question:
        '高更新率下仍要求亚秒可搜索，并且每次都精确 COUNT 全部 matches，会发生什么？',
      reveal:
        'refresh、segment merge、indexing backlog 和 exact count 都会增加成本。搜索可以接受有界的 lag 与 1,000+ count；不能接受 lag 的申请正确性则从不依赖 Search Service。',
      takeaway: '独立搜索换来更强 retrieval，也把 freshness 变成必须明确预算的系统属性。',
    },
  ],
  analyze: analyzeJobBoardWorkload,
};

function analyzeJobBoardWorkload(workload: WorkloadValues): LabAnalysis {
  const activeJobs = numericValue(workload, 'activeJobs');
  const searchQps = numericValue(workload, 'searchQps');
  const keywordMatchPercent = numericValue(workload, 'keywordMatchPercent');
  const filterRetentionPercent = numericValue(workload, 'filterRetentionPercent');
  const jobUpdatesPerSecond = numericValue(workload, 'jobUpdatesPerSecond');
  const latencyBudgetMs = numericValue(workload, 'latencyBudgetMs');
  const freshnessBudgetSeconds = numericValue(workload, 'freshnessBudgetSeconds');
  const advancedSearchFeatures = Boolean(workload.advancedSearchFeatures);
  const exactTotalCount = Boolean(workload.exactTotalCount);

  const keywordCandidates = activeJobs * (keywordMatchPercent / 100);
  const rankedCandidates = Math.max(1, keywordCandidates * (filterRetentionPercent / 100));
  const candidateScoresPerSecond = rankedCandidates * searchQps;
  const postgresPressure =
    candidateScoresPerSecond / comfortablePostgresCandidateScoresPerSecond;
  const postgresContentionMultiplier = Math.max(1, Math.sqrt(postgresPressure));
  const estimatedPostgresLatencyMs =
    (12 + rankedCandidates / 1_500) * postgresContentionMultiplier;

  const searchShardCount = Math.max(1, Math.ceil(activeJobs / searchDocumentsPerShard));
  const parallelSearchShards = Math.min(searchShardCount, 8);
  const estimatedSearchServiceLatencyMs =
    18 + rankedCandidates / (8_000 * parallelSearchShards) +
    (advancedSearchFeatures ? 12 : 0) +
    (exactTotalCount ? rankedCandidates / 4_000 : 0);

  const needsSearchService =
    advancedSearchFeatures ||
    estimatedPostgresLatencyMs > latencyBudgetMs * 0.8 ||
    postgresPressure > 1;

  const selectedLatencyMs = needsSearchService
    ? estimatedSearchServiceLatencyMs
    : estimatedPostgresLatencyMs;

  const indexingCapacity = searchShardCount * searchIndexUpdatesPerShardSecond;
  const indexingPressure = needsSearchService
    ? jobUpdatesPerSecond / indexingCapacity
    : jobUpdatesPerSecond / 20_000;
  const searchFreshnessSeconds = needsSearchService
    ? Math.max(1, indexingPressure) // refresh interval plus queueing pressure
    : 0.02;
  const resultWorkRatio = exactTotalCount
    ? rankedCandidates / comfortablePostgresCandidatesPerQuery
    : Math.min(rankedCandidates, 1_000) / comfortablePostgresCandidatesPerQuery;

  const flags = {
    needsSearchService,
    advancedSearchFeatures,
    exactTotalCount,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: needsSearchService
      ? 'Search API -> Search Service；Job change -> PostgreSQL -> CDC / Outbox -> Queue -> Indexer -> Search Service'
      : 'Search API -> PostgreSQL partial indexes -> ts_rank -> stable Top 20',
    nodeStates: {
      jobSeeker: 'ok',
      employer: 'ok',
      searchApi: selectedLatencyMs > latencyBudgetMs ? 'overloaded' : 'ok',
      jobApi: 'ok',
      applicationApi: 'needed',
      jobTable: 'ok',
      postgresIndexes: needsSearchService ? 'warning' : 'needed',
      changeCapture: needsSearchService ? 'needed' : 'inactive',
      eventQueue: needsSearchService ? 'needed' : 'inactive',
      indexer: needsSearchService ? 'needed' : 'inactive',
      searchCluster: needsSearchService ? 'needed' : 'inactive',
    },
    flowStates: {
      jobSeekerToSearchApi: 'active',
      jobSeekerToApplicationApi: 'active',
      employerToJobApi: 'active',
      searchApiToPostgresIndexes: needsSearchService ? 'inactive' : 'active',
      searchApiToSearchCluster: needsSearchService ? 'active' : 'inactive',
      jobApiToJobTable: 'active',
      applicationApiToJobTable: 'active',
      jobTableToPostgresIndexes: 'active',
      jobTableToChangeCapture: needsSearchService ? 'active' : 'inactive',
      changeCaptureToEventQueue: needsSearchService ? 'active' : 'inactive',
      eventQueueToIndexer: needsSearchService ? 'active' : 'inactive',
      indexerToSearchCluster: needsSearchService ? 'active' : 'inactive',
    },
    meters: {
      candidates: {
        ratio: rankedCandidates / comfortablePostgresCandidatesPerQuery,
        valueText: `${formatCount(rankedCandidates)} / query`,
        copy: `${formatCount(activeJobs)} active jobs × ${formatPercent(
          keywordMatchPercent,
        )} keyword match × ${formatPercent(
          filterRetentionPercent,
        )} filter retention = 约 ${formatCount(rankedCandidates)} 个 ranking candidates。`,
      },
      postgresPressure: {
        ratio: postgresPressure,
        valueText: `${formatRate(candidateScoresPerSecond)} scores/s`,
        copy: needsSearchService
          ? 'Broad-query ranking 与 QPS 已经适合从事务数据库中拆出，独立扩展搜索读路径。'
          : '候选打分吞吐仍在一套 PostgreSQL search indexes 的教学预算内。',
      },
      latency: {
        ratio: selectedLatencyMs / latencyBudgetMs,
        valueText: `约 ${Math.round(selectedLatencyMs)} ms / ${Math.round(latencyBudgetMs)} ms`,
        copy: needsSearchService
          ? `当前路径使用 ${formatCount(searchShardCount)} 个 Search shard 并行做 BM25 + filters；这是模型估算，不是厂商承诺。`
          : '当前路径直接使用 PostgreSQL GIN + typed filters；没有额外网络 hop 或派生索引。',
      },
      freshness: {
        ratio: searchFreshnessSeconds / freshnessBudgetSeconds,
        valueText: needsSearchService
          ? `约 ${formatDuration(searchFreshnessSeconds)} lag`
          : '事务内更新',
        copy: needsSearchService
          ? `${formatRate(jobUpdatesPerSecond)} updates/s 经过 CDC、Queue、Indexer 和 refresh；搜索 freshness 与申请正确性已成为两个边界。`
          : 'Job row 与 PostgreSQL indexes 在同一事务维护；新 statement 在 commit 后看到新状态。',
      },
      resultWork: {
        ratio: resultWorkRatio,
        valueText: exactTotalCount ? '精确 COUNT 全部' : 'Top 1,000 window',
        copy: exactTotalCount
          ? `即使只返回 Top 20，仍要求统计约 ${formatCount(rankedCandidates)} 个 matches，削弱 Top-K 优化。`
          : '每页 20 条、最多暴露 Top 1,000，并用 cursor 翻页；不为 UI 计算无界精确总数。',
      },
    },
    decisions: buildDecisions({
      ...flags,
      rankedCandidates,
      searchFreshnessSeconds,
      freshnessBudgetSeconds,
    }),
    reasons: buildReasons({
      ...flags,
      rankedCandidates,
      postgresPressure,
      estimatedPostgresLatencyMs,
      latencyBudgetMs,
      searchFreshnessSeconds,
      freshnessBudgetSeconds,
      exactTotalCount,
    }),
  };
}

type ArchitectureFlags = {
  needsSearchService: boolean;
  advancedSearchFeatures: boolean;
  exactTotalCount: boolean;
};

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (flags.needsSearchService && flags.advancedSearchFeatures) {
    return 'PostgreSQL source of truth + 独立 Search Service';
  }
  if (flags.needsSearchService) {
    return '把 broad-query ranking 拆到 Search Service';
  }
  return 'PostgreSQL GIN + typed partial indexes';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (flags.needsSearchService) {
    return 'Elasticsearch/OpenSearch 是一个独立 component：Search API 读取它的派生 inverted index；Job writes 与 Application correctness 仍由 PostgreSQL 负责。';
  }
  return '一份 PostgreSQL 数据同时承担 Job truth 和搜索：GIN 找 keyword candidates，B-tree/GiST 过滤，ts_rank 排序；此时不要提前引入第二套系统。';
}

function buildDecisions(
  analysis: ArchitectureFlags & {
    rankedCandidates: number;
    searchFreshnessSeconds: number;
    freshnessBudgetSeconds: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    typedFilters: {
      state: 'needed',
      copy: 'location_id、company_id 和 salary 使用 typed columns，让 equality / range operators 有明确 index。',
    },
    postgresFts: {
      state: analysis.needsSearchService ? 'useful' : 'needed',
      copy: analysis.needsSearchService
        ? 'PostgreSQL FTS 仍适合 fallback 或较小 query，但主搜索读路径已交给 Search Service。'
        : 'Generated tsvector + GIN 负责 keyword candidates，ts_rank / ts_rank_cd 负责第一版 relevance。',
    },
    partialIndexes: {
      state: 'needed',
      copy: '把在线 B-tree、GIN 和 GiST 都限制为 status = active，避免 closed history 扩大 working set。',
    },
    searchService: {
      state: analysis.needsSearchService ? 'needed' : 'not-yet',
      copy: analysis.needsSearchService
        ? `约 ${formatCount(
            analysis.rankedCandidates,
          )} candidates/query 或高级搜索需求已经值得独立 BM25、filters 与 horizontal scaling。`
        : '当前候选集和功能由 PostgreSQL 覆盖；第二套索引只会增加同步与运维成本。',
    },
    indexingPipeline: {
      state: analysis.needsSearchService
        ? analysis.searchFreshnessSeconds > analysis.freshnessBudgetSeconds
          ? 'tradeoff'
          : 'needed'
        : 'not-yet',
      copy: analysis.needsSearchService
        ? 'Job commit 后由 Outbox / CDC 捕获变化，Queue 缓冲并支持 replay，Indexer 做 versioned upsert；Queue 是 transport，不是 CDC。'
        : '只有一份 PostgreSQL searchable data，不需要异步 Indexer。',
    },
    applicationValidation: {
      state: 'needed',
      copy: 'Application API 永远回 PostgreSQL 校验当前 status = active；搜索结果不能决定是否接受申请。',
    },
  };
}

function buildReasons(
  analysis: ArchitectureFlags & {
    rankedCandidates: number;
    postgresPressure: number;
    estimatedPostgresLatencyMs: number;
    latencyBudgetMs: number;
    searchFreshnessSeconds: number;
    freshnessBudgetSeconds: number;
    exactTotalCount: boolean;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  reasons.push({
    severity:
      analysis.rankedCandidates > comfortablePostgresCandidatesPerQuery
        ? 'danger'
        : analysis.rankedCandidates > comfortablePostgresCandidatesPerQuery * 0.5
          ? 'warning'
          : 'ok',
    text: `${formatCount(
      analysis.rankedCandidates,
    )} candidates/query 决定 ranking 成本；LIMIT 20 不会自动让动态打分只检查 20 rows。`,
  });

  reasons.push({
    severity: analysis.postgresPressure > 1 ? 'danger' : 'ok',
    text: analysis.postgresPressure > 1
      ? `候选打分吞吐超过 PostgreSQL 教学预算；估算 p95 ${Math.round(
          analysis.estimatedPostgresLatencyMs,
        )} ms，目标是 ${Math.round(analysis.latencyBudgetMs)} ms。`
      : 'PostgreSQL search workload 尚未压过教学预算；先保持一份数据和事务内 freshness。',
  });

  if (analysis.advancedSearchFeatures) {
    reasons.push({
      severity: 'warning',
      text: 'Typo、synonyms 和 facets 已经让搜索成为独立产品能力，而不只是数据库上的一个 keyword predicate。',
    });
  }

  if (analysis.needsSearchService) {
    reasons.push({
      severity:
        analysis.searchFreshnessSeconds > analysis.freshnessBudgetSeconds
          ? 'danger'
          : 'warning',
      text: `派生 Search Index 约有 ${formatDuration(
        analysis.searchFreshnessSeconds,
      )} lag；freshness 目标是 ${formatDuration(analysis.freshnessBudgetSeconds)}。`,
    });
  }

  if (analysis.exactTotalCount) {
    reasons.push({
      severity: 'warning',
      text: '精确 total count 要继续统计所有 matches；若 UI 只展示 Top 1,000，应改成 1,000+。',
    });
  }

  reasons.push({
    severity: 'ok',
    text: 'Application API 始终回 PostgreSQL 校验 active status，所以 search lag 不会让 closed Job 成功接受申请。',
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
