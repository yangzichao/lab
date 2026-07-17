import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatDuration, formatRate } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative teaching budgets. They expose the architectural inflection;
// they are not PostgreSQL, Elasticsearch, or OpenSearch vendor limits.
const comfortablePostgresCandidatesPerQuery = 50_000;
const comfortablePostgresCandidateScoresPerSecond = 50_000_000;
const searchDocumentsPerShard = 5_000_000;
const searchIndexUpdatesPerShardSecond = 5_000;

export const jobBoardLabDefinition: SystemDesignLabDefinition = {
  id: 'job-board',
  eyebrow: 'System Design Lab',
  title:
    'A Job Board starts with PostgreSQL full-text retrieval and typed filters. A Search Service becomes a separate component only when candidate scoring, search features, or independent scaling becomes the binding constraint.',
  summary:
    'Adjust active jobs, search QPS, common-keyword match rate, metadata-filter selectivity, job updates, latency, and freshness. Watch B-tree / GIN / GiST / partial indexes remain sufficient—or make Elasticsearch / OpenSearch earn the cost of a derived index and an asynchronous freshness boundary.',
  controls: [
    {
      id: 'activeJobs',
      label: 'Active jobs',
      help: 'Jobs in the online search corpus; closed history is excluded by partial indexes.',
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
      help: 'Peak rate of job-seeker keyword + filter queries.',
      min: 10,
      max: 100_000,
      defaultValue: 300,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'keywordMatchPercent',
      label: 'Keyword match rate',
      help: 'Share of active jobs left after GIN retrieval; common terms make this jump.',
      min: 0.01,
      max: 80,
      defaultValue: 1,
      scale: 'log',
      format: 'percentage',
    },
    {
      id: 'filterRetentionPercent',
      label: 'Filter retention',
      help: 'Share of keyword candidates left after location, company, and salary filters.',
      min: 0.1,
      max: 100,
      defaultValue: 5,
      scale: 'log',
      format: 'percentage',
    },
    {
      id: 'jobUpdatesPerSecond',
      label: 'Job update rate',
      help: 'Creates, edits, pauses, and closes; a derived Search Service must consume the same changes.',
      min: 1,
      max: 100_000,
      defaultValue: 20,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'latencyBudgetMs',
      label: 'Search p95 budget',
      help: 'Budget for the complete Search API, not only database or search-cluster time.',
      min: 50,
      max: 1_000,
      defaultValue: 500,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'freshnessBudgetSeconds',
      label: 'Search freshness budget',
      help: 'Allowed lag after a Job commit; application correctness still revalidates against PostgreSQL.',
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
      label: 'Need typo / synonyms / facets',
      help: 'These are dedicated search-product requirements, not only a keyword predicate.',
      defaultValue: false,
    },
    {
      id: 'exactTotalCount',
      label: 'Require an exact total count',
      help: 'Counting every match weakens Top-K early termination; most UIs should show 1,000+.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'postgres-filtered-search',
      step: '01',
      title: 'Start with PostgreSQL',
      summary: 'Typed filters are selective, leaving only a few candidates to rank in PostgreSQL.',
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
      summary: 'Millions of active jobs still fit partial GIN, B-tree, and GiST index composition.',
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
      title: 'A common keyword explodes',
      summary: 'Dynamic scoring across a large candidate set pushes PostgreSQL beyond the budget.',
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
      title: 'Independent Search Service',
      summary: 'BM25, filters, and Top-K move to Elasticsearch/OpenSearch; Job truth stays in PostgreSQL.',
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
      title: 'Freshness and count cost',
      summary: 'High updates, sub-second freshness, and exact counts expose the derived index cost.',
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
    title: 'Job Board search architecture',
    description:
      'Whiteboard Job Board architecture: PostgreSQL stores Job truth; CDC / Outbox captures committed changes, a Queue buffers and transports them, and an Indexer builds the searchable copy.',
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
            summary: 'Submits keywords and filters, then applies to a currently active job',
            kind: 'client',
          },
          {
            id: 'employer',
            title: 'Employer',
            subtitle: 'publish + close',
            summary: 'Creates, edits, pauses, or closes a Job',
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
            summary: 'Queries PostgreSQL indexes or runs BM25 + filters in a dedicated Search Service',
            kind: 'api',
          },
          {
            id: 'jobApi',
            title: 'Job API',
            subtitle: 'source writes',
            summary: 'Writes Job changes to the PostgreSQL source of truth',
            kind: 'api',
          },
          {
            id: 'applicationApi',
            title: 'Application API',
            subtitle: 'validate active',
            summary: 'Rechecks the latest Job.status in PostgreSQL before accepting an application',
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
            summary: 'Stores Job, status, version, and typed search fields',
            kind: 'db',
          },
          {
            id: 'postgresIndexes',
            title: 'PG indexes',
            subtitle: 'B-tree + GIN + GiST',
            summary: 'Active-only partial indexes retrieve, filter, and shrink ranking candidates',
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
            summary: 'CDC reads WAL, or a Relay reads outbox events committed in the Job transaction',
            kind: 'stream',
          },
          {
            id: 'eventQueue',
            title: 'Event log / Queue',
            subtitle: 'buffer + replay',
            summary: 'A durable log such as Kafka buffers, retries, and replays events; it is neither CDC nor source of truth',
            kind: 'queue',
          },
          {
            id: 'indexer',
            title: 'Indexer',
            subtitle: 'versioned upsert',
            summary: 'Consumes events and builds idempotent, versioned SearchDocument upserts',
            kind: 'compute',
          },
          {
            id: 'searchCluster',
            title: 'Search service',
            subtitle: 'BM25 + filters',
            summary: 'Elasticsearch/OpenSearch independently stores and scales a derived inverted index',
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
    { id: 'candidates', label: 'Candidates ranked per query' },
    { id: 'postgresPressure', label: 'PostgreSQL search CPU pressure' },
    { id: 'latency', label: 'Search latency vs p95 budget' },
    { id: 'freshness', label: 'Search freshness lag' },
    { id: 'resultWork', label: 'Top-K / total-count work' },
  ],
  decisions: [
    { id: 'typedFilters', title: 'Typed filters' },
    { id: 'postgresFts', title: 'PostgreSQL FTS' },
    { id: 'partialIndexes', title: 'Active-only partial indexes' },
    { id: 'searchService', title: 'Independent Search Service' },
    { id: 'indexingPipeline', title: 'CDC / Outbox / Queue' },
    { id: 'applicationValidation', title: 'Application-time validation' },
  ],
  sourceBackedRules: [
    {
      title: 'GIN is the preferred PostgreSQL full-text index type',
      source: 'PostgreSQL — Preferred Index Types for Text Search',
      url: 'https://www.postgresql.org/docs/current/textsearch-indexes.html',
      summary:
        'GIN stores lexeme-to-row inverted relationships for candidate retrieval; dynamic relevance is still computed by ts_rank / ts_rank_cd.',
    },
    {
      title: 'A partial index stores only rows satisfying its predicate',
      source: 'PostgreSQL — Partial Indexes',
      url: 'https://www.postgresql.org/docs/current/indexes-partial.html',
      summary:
        'Active-only GIN, B-tree, and GiST indexes exclude years of closed history, but the query predicate must imply the index predicate.',
    },
    {
      title: 'OpenSearch keyword search uses BM25 by default',
      source: 'OpenSearch — Keyword search',
      url: 'https://docs.opensearch.org/latest/search-plugins/keyword-search/',
      summary:
        'A dedicated Search Service treats full-text relevance, non-scoring filters, and Top-K retrieval as the primary workload rather than an add-on to a relational database.',
    },
    {
      title: 'CDC captures committed row-level database changes',
      source: 'Debezium — CDC Architecture',
      url: 'https://debezium.io/documentation/reference/architecture.html',
      summary:
        'CDC is the change-capture mechanism: a connector reads the database transaction log and emits a change-event stream. A Queue is an optional transport and buffer; the Indexer updates SearchDocuments.',
    },
    {
      title: 'Outbox commits business state and its event in one transaction',
      source: 'Debezium — Outbox Event Router',
      url: 'https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html',
      summary:
        'Job API writes the Job row and outbox row together; a CDC connector then captures the outbox change. This avoids a PostgreSQL-success/message-send-failure dual-write split.',
    },
    {
      title: 'A derived Search Index is near-real-time, not transactionally visible',
      source: 'Elasticsearch — Near real-time search',
      url: 'https://www.elastic.co/docs/manage-data/data-store/near-real-time-search',
      summary:
        'Document changes become searchable after refresh, so search freshness and Application API business correctness must remain separate boundaries.',
    },
  ],
  teachingAssumptions: [
    'Candidate, latency, and throughput formulas are conservative teaching models that expose an inflection point—not PostgreSQL, Elasticsearch, or OpenSearch benchmarks.',
    'Keyword match rate and filter retention should come from the real query distribution; total row count alone cannot decide a search migration.',
    'PostgreSQL indexes update in the Job transaction; a separate Search Service is modeled with an approximately one-second refresh plus indexing backlog.',
    'The production path uses Outbox / CDC -> durable Queue -> Indexer. A small system may omit the Queue, but it must not synchronously dual-write PostgreSQL and the Search Service.',
    'Regardless of which index serves search, the Application API uses current PostgreSQL Job.status for the final correctness decision.',
  ],
  teachingWalkthrough: [
    {
      id: 'start-with-postgres',
      step: '01',
      focus: 'Start with one copy',
      scenarioId: 'postgres-filtered-search',
      question:
        'There are only 200k active jobs, and location plus salary filters reduce keyword candidates to single digits. Do you need Elasticsearch?',
      reveal:
        'No. The Job row and indexes stay fresh in one transaction, and B-tree / GIN / GiST already cover retrieval, filters, and simple ranking. A Search Service would only add a derived copy and a synchronization boundary.',
      takeaway: 'Prove PostgreSQL candidate work and latency are insufficient before buying a second system.',
    },
    {
      id: 'compose-indexes',
      step: '02',
      focus: 'One job per index',
      scenarioId: 'postgres-indexed-search',
      question:
        'Three million active jobs support keyword, location, company, and salary. Should one giant composite index contain every field?',
      reveal:
        'No. GIN retrieves keyword candidates, B-tree handles location/company equality, and GiST is used only when salary really means range overlap. PostgreSQL can combine those focused indexes, each limited by status = active.',
      takeaway: 'Index type comes from the operator; a partial index comes from the online row set.',
    },
    {
      id: 'candidate-explosion',
      step: '03',
      focus: 'Candidate count takes over',
      scenarioId: 'broad-keyword-boundary',
      question:
        'The table has 10M active jobs, but a common keyword still leaves 400k candidates after filters. Does LIMIT 20 make PostgreSQL score only 20 rows?',
      reveal:
        'No. GIN is not ordered by the current query’s dynamic ts_rank. To find the exact Top 20, PostgreSQL may still score a large candidate set. Candidate scoring times QPS—not row count—becomes the boundary.',
      takeaway: 'Broad-query ranking work, not a fixed row threshold, earns a Search Service.',
    },
    {
      id: 'separate-search-service',
      step: '04',
      focus: 'Search becomes a component',
      scenarioId: 'independent-search-service',
      question:
        'After adding Elasticsearch/OpenSearch, does it replace PostgreSQL? Where should the Job API and Application API read and write?',
      reveal:
        'It does not replace PostgreSQL. PostgreSQL stores Job truth; CDC / Outbox captures committed changes, the Queue buffers and replays them, and the Indexer writes the searchable copy. Search API reads the derived index, while Application API rechecks active status in PostgreSQL.',
      takeaway: 'CDC captures, the Queue transports, and the Indexer projects; the Search Service is only a derived read model.',
    },
    {
      id: 'freshness-boundary',
      step: '05',
      focus: 'The near-real-time cost',
      scenarioId: 'freshness-tradeoff',
      question:
        'What happens when update volume is high, search must be sub-second fresh, and every query requires an exact count of all matches?',
      reveal:
        'Refresh, segment merge, indexing backlog, and exact counting all add work. Search should accept bounded lag and a 1,000+ count; application correctness never depends on the Search Service.',
      takeaway: 'Dedicated search improves retrieval but turns freshness into an explicit system budget.',
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
  const searchFreshnessSeconds = needsSearchService ? Math.max(1, indexingPressure) : 0.02;
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
      ? 'Search API -> Search Service; Job change -> PostgreSQL -> CDC / Outbox -> Queue -> Indexer -> Search Service'
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
        )} filter retention = about ${formatCount(rankedCandidates)} ranking candidates.`,
      },
      postgresPressure: {
        ratio: postgresPressure,
        valueText: `${formatRate(candidateScoresPerSecond)} scores/s`,
        copy: needsSearchService
          ? 'Broad-query ranking times QPS is now worth separating from the transactional database.'
          : 'Candidate-scoring throughput remains inside the teaching budget for one PostgreSQL search path.',
      },
      latency: {
        ratio: selectedLatencyMs / latencyBudgetMs,
        valueText: `~${Math.round(selectedLatencyMs)} ms / ${Math.round(latencyBudgetMs)} ms`,
        copy: needsSearchService
          ? `The selected path uses ${formatCount(searchShardCount)} Search shards for parallel BM25 + filters; this is a model, not a vendor promise.`
          : 'The selected path uses PostgreSQL GIN + typed filters with no extra network hop or derived index.',
      },
      freshness: {
        ratio: searchFreshnessSeconds / freshnessBudgetSeconds,
        valueText: needsSearchService
          ? `~${formatDuration(searchFreshnessSeconds)} lag`
          : 'transactional',
        copy: needsSearchService
          ? `${formatRate(jobUpdatesPerSecond)} updates/s pass through CDC, Queue, Indexer, and refresh; search freshness and application correctness are now separate boundaries.`
          : 'The Job row and PostgreSQL indexes update in one transaction; a new statement sees committed state.',
      },
      resultWork: {
        ratio: resultWorkRatio,
        valueText: exactTotalCount ? 'exact count of all hits' : 'Top 1,000 window',
        copy: exactTotalCount
          ? `Even with Top 20 output, the system must count about ${formatCount(rankedCandidates)} matches, weakening Top-K optimization.`
          : 'Return 20 per page, expose at most Top 1,000, and use a cursor instead of computing an unbounded exact total.',
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
    return 'PostgreSQL source of truth + independent Search Service';
  }
  if (flags.needsSearchService) {
    return 'Move broad-query ranking to a Search Service';
  }
  return 'PostgreSQL GIN + typed partial indexes';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (flags.needsSearchService) {
    return 'Elasticsearch/OpenSearch is an independent component: Search API reads its derived inverted index; Job writes and Application correctness stay in PostgreSQL.';
  }
  return 'One PostgreSQL copy serves Job truth and search: GIN retrieves keyword candidates, B-tree/GiST filter them, and ts_rank orders them. Do not add a second system yet.';
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
      copy: 'Keep location_id, company_id, and salary in typed columns so equality and range operators have clear indexes.',
    },
    postgresFts: {
      state: analysis.needsSearchService ? 'useful' : 'needed',
      copy: analysis.needsSearchService
        ? 'PostgreSQL FTS can remain as fallback or for smaller queries, but the main read path now uses the Search Service.'
        : 'Generated tsvector + GIN retrieves keyword candidates; ts_rank / ts_rank_cd provides first-version relevance.',
    },
    partialIndexes: {
      state: 'needed',
      copy: 'Limit online B-tree, GIN, and GiST indexes to status = active so closed history does not grow the working set.',
    },
    searchService: {
      state: analysis.needsSearchService ? 'needed' : 'not-yet',
      copy: analysis.needsSearchService
        ? `About ${formatCount(
            analysis.rankedCandidates,
          )} candidates/query or advanced features now justify independent BM25, filters, and horizontal scaling.`
        : 'PostgreSQL covers the current candidate set and feature scope; a second index would only add synchronization and operations cost.',
    },
    indexingPipeline: {
      state: analysis.needsSearchService
        ? analysis.searchFreshnessSeconds > analysis.freshnessBudgetSeconds
          ? 'tradeoff'
          : 'needed'
        : 'not-yet',
      copy: analysis.needsSearchService
        ? 'After Job commit, Outbox / CDC captures the change, a Queue buffers and supports replay, and the Indexer performs versioned upserts. The Queue is transport, not CDC.'
        : 'One PostgreSQL searchable copy needs no asynchronous Indexer.',
    },
    applicationValidation: {
      state: 'needed',
      copy: 'Application API always checks current status = active in PostgreSQL; search results cannot decide whether to accept an application.',
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
    )} candidates/query determines ranking cost; LIMIT 20 does not automatically score only 20 rows.`,
  });

  reasons.push({
    severity: analysis.postgresPressure > 1 ? 'danger' : 'ok',
    text: analysis.postgresPressure > 1
      ? `Candidate-scoring throughput exceeds the PostgreSQL teaching budget; estimated p95 is ${Math.round(
          analysis.estimatedPostgresLatencyMs,
        )} ms against ${Math.round(analysis.latencyBudgetMs)} ms.`
      : 'PostgreSQL search work is still inside the teaching budget; keep one copy and transactional freshness.',
  });

  if (analysis.advancedSearchFeatures) {
    reasons.push({
      severity: 'warning',
      text: 'Typos, synonyms, and facets make search a product capability rather than one database keyword predicate.',
    });
  }

  if (analysis.needsSearchService) {
    reasons.push({
      severity:
        analysis.searchFreshnessSeconds > analysis.freshnessBudgetSeconds
          ? 'danger'
          : 'warning',
      text: `The derived Search Index has about ${formatDuration(
        analysis.searchFreshnessSeconds,
      )} lag against a ${formatDuration(analysis.freshnessBudgetSeconds)} target.`,
    });
  }

  if (analysis.exactTotalCount) {
    reasons.push({
      severity: 'warning',
      text: 'An exact total count keeps counting every match; if the UI exposes only Top 1,000, return 1,000+ instead.',
    });
  }

  reasons.push({
    severity: 'ok',
    text: 'Application API always rechecks active status in PostgreSQL, so search lag cannot accept an application to a closed Job.',
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
