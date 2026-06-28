import { buildColumnDiagram } from '../diagram-layout';
import {
  formatCount,
  formatRate,
  formatRatio,
  formatStorageGigabytes,
} from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative teaching budgets, not vendor limits.
const pagesPerFetcherWorker = 12; // sustained fetches/s a single I/O-bound worker holds
const comfortableFetchThroughput = 200; // pages/s one un-pooled fetch loop manages
const comfortableFrontierDrainPerSecond = 5_000; // scheduler enqueue/dequeue budget per node
const seenSetBytesPerUrlExact = 64; // hash-set entry cost for an exact "seen URLs" set
const seenSetBytesPerUrlBloom = 1.5; // ~10 bits/key Bloom filter cost per URL
const comfortableSeenSetGigabytes = 32; // RAM one node can devote to the seen set
const dnsLookupsCachedShare = 0.97; // share of fetches answered from the DNS cache
const comfortableDnsLookupsPerSecond = 800; // un-cached resolver throughput before it stalls
const comfortableStorageTerabytes = 50; // single content store before it is sharded
const politeFetchesPerDomainPerSecond = 1; // typical per-domain rate cap when polite

export const webCrawlerLabDefinition: SystemDesignLabDefinition = {
  id: 'web-crawler',
  eyebrow: 'System Design Lab',
  title: 'A web crawler is throughput-bound at the fetcher and memory-bound at the "seen" set, with politeness capping how fast you may go.',
  summary:
    'Change the target crawl rate, how many pages you intend to fetch, the fetcher worker pool, average page size, how many distinct domains you span, and the dedup tolerance. The design moves from a single-threaded loop to a worker pool, a politeness-aware scheduler, a Bloom-filter "seen" set, and a partitioned frontier with sharded content storage.',
  controls: [
    {
      id: 'targetPagesPerSecond',
      label: 'Target crawl rate',
      help: 'Pages per second you want to fetch overall. This is the throughput the fetcher pool must sustain.',
      min: 1,
      max: 1_000_000,
      defaultValue: 50,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'totalPages',
      label: 'Pages to crawl',
      help: 'Total pages the crawl will visit; drives storage and the size of the seen-URL set.',
      min: 1_000,
      max: 100_000_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: 'pages',
      format: 'count',
    },
    {
      id: 'fetcherWorkers',
      label: 'Fetcher workers',
      help: 'Concurrent HTTP download workers. Each is I/O bound and holds a handful of fetches per second.',
      min: 1,
      max: 100_000,
      defaultValue: 8,
      scale: 'log',
      unit: 'workers',
      format: 'count',
    },
    {
      id: 'averagePageKilobytes',
      label: 'Average page size',
      help: 'Mean downloaded bytes per page; multiplies into content storage and fetch bandwidth.',
      min: 10,
      max: 5_000,
      defaultValue: 80,
      scale: 'log',
      format: 'kilobytes',
    },
    {
      id: 'uniqueDomains',
      label: 'Unique domains',
      help: 'Distinct hosts spanned. Few domains plus politeness throttles total throughput; many domains parallelize it.',
      min: 1,
      max: 100_000_000,
      defaultValue: 5_000,
      scale: 'log',
      unit: 'domains',
      format: 'count',
    },
    {
      id: 'dedupFalsePositiveRate',
      label: 'Dedup tolerance',
      help: 'Acceptable false-positive rate for the "seen" set. A looser rate lets a Bloom filter shrink memory.',
      min: 0.001,
      max: 5,
      defaultValue: 1,
      scale: 'log',
      format: 'percentage',
    },
  ],
  toggles: [
    {
      id: 'respectPoliteness',
      label: 'Respect politeness + robots.txt',
      help: 'Obey robots.txt and per-domain rate limits. Caps how fast a single domain may be hit.',
      defaultValue: true,
    },
    {
      id: 'contentDedup',
      label: 'Content deduplication',
      help: 'Fingerprint page bodies to skip near-duplicate content, not just already-seen URLs.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-threaded',
      step: '01',
      title: 'Single-threaded crawler',
      summary: 'One loop walks a small site sequentially.',
      values: {
        targetPagesPerSecond: 5,
        totalPages: 50_000,
        fetcherWorkers: 1,
        averagePageKilobytes: 60,
        uniqueDomains: 1,
        dedupFalsePositiveRate: 1,
        respectPoliteness: true,
        contentDedup: false,
      },
    },
    {
      id: 'worker-pool',
      step: '02',
      title: 'Concurrent worker pool',
      summary: 'Many workers fetch in parallel across sites.',
      values: {
        targetPagesPerSecond: 500,
        totalPages: 5_000_000,
        fetcherWorkers: 80,
        averagePageKilobytes: 70,
        uniqueDomains: 20_000,
        dedupFalsePositiveRate: 1,
        respectPoliteness: false,
        contentDedup: false,
      },
    },
    {
      id: 'politeness-scheduler',
      step: '03',
      title: 'Politeness scheduler',
      summary: 'Per-domain rate limits gate the fetch order.',
      values: {
        targetPagesPerSecond: 2_000,
        totalPages: 50_000_000,
        fetcherWorkers: 400,
        averagePageKilobytes: 80,
        uniqueDomains: 1_500,
        dedupFalsePositiveRate: 1,
        respectPoliteness: true,
        contentDedup: false,
      },
    },
    {
      id: 'dedup-at-scale',
      step: '04',
      title: 'Dedup at billions of URLs',
      summary: 'The seen-URL set no longer fits in RAM.',
      values: {
        targetPagesPerSecond: 20_000,
        totalPages: 5_000_000_000,
        fetcherWorkers: 4_000,
        averagePageKilobytes: 90,
        uniqueDomains: 2_000_000,
        dedupFalsePositiveRate: 0.1,
        respectPoliteness: true,
        contentDedup: true,
      },
    },
    {
      id: 'distributed-frontier',
      step: '05',
      title: 'Distributed, partitioned frontier',
      summary: 'A web-scale crawl sharded across machines.',
      values: {
        targetPagesPerSecond: 200_000,
        totalPages: 50_000_000_000,
        fetcherWorkers: 40_000,
        averagePageKilobytes: 120,
        uniqueDomains: 50_000_000,
        dedupFalsePositiveRate: 0.01,
        respectPoliteness: true,
        contentDedup: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'Distributed web crawler architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a distributed web crawler: seed URLs feeding a frontier, a politeness-aware scheduler with a DNS cache, a pool of fetcher workers, a parser with URL and content dedup, and a sharded content store.',
    columns: [
      {
        id: 'frontier',
        label: 'Seeds / Frontier',
        variant: 'clients',
        nodes: [
          {
            id: 'seeds',
            title: 'Seed URLs',
            subtitle: 'crawl roots',
            summary: 'starting URLs that prime the crawl before discovered links take over',
            kind: 'client',
          },
          {
            id: 'frontier',
            title: 'URL frontier',
            subtitle: 'priority queues',
            summary: 'holds URLs waiting to be fetched, ordered by priority and per-domain queues',
            kind: 'queue',
          },
        ],
      },
      {
        id: 'scheduler',
        label: 'Scheduler',
        variant: 'edge',
        nodes: [
          {
            id: 'scheduler',
            title: 'Scheduler',
            subtitle: 'politeness gate',
            summary: 'picks the next fetchable URL while honoring robots.txt and per-domain rate limits',
            kind: 'scheduler',
          },
          {
            id: 'dnsCache',
            title: 'DNS cache',
            subtitle: 'resolved hosts',
            summary: 'caches host-to-IP lookups so resolution does not become the hidden bottleneck',
            kind: 'cache',
          },
        ],
      },
      {
        id: 'fetchers',
        label: 'Fetchers',
        variant: 'backbone',
        nodes: [
          {
            id: 'fetcherPool',
            title: 'Fetcher pool',
            subtitle: 'HTTP downloads',
            summary: 'concurrent I/O-bound workers that download pages from the open web',
            kind: 'compute',
          },
        ],
      },
      {
        id: 'parsing',
        label: 'Parser / dedup',
        variant: 'processing',
        nodes: [
          {
            id: 'parser',
            title: 'Parser',
            subtitle: 'extract links',
            summary: 'parses fetched pages and extracts outgoing links to feed back to the frontier',
            kind: 'compute',
          },
          {
            id: 'seenSet',
            title: 'Seen set',
            subtitle: 'URL + content',
            summary: 'rejects already-seen URLs and near-duplicate content, often via a Bloom filter at scale',
            kind: 'cache',
          },
        ],
      },
      {
        id: 'storage',
        label: 'Content store',
        variant: 'storage',
        nodes: [
          {
            id: 'contentStore',
            title: 'Content store',
            subtitle: 'fetched pages',
            summary: 'durable store of downloaded page bodies for indexing and analysis',
            kind: 'objectstore',
          },
          {
            id: 'storeShards',
            title: 'Store shards',
            subtitle: 'partition pages',
            summary: 'spreads page bodies across nodes once one store can no longer hold the corpus',
            kind: 'objectstore',
          },
        ],
      },
    ],
    flows: [
      { from: 'seeds', to: 'frontier', variant: 'primary' },
      { from: 'frontier', to: 'scheduler', variant: 'primary' },
      { from: 'scheduler', to: 'dnsCache', variant: 'secondary' },
      { from: 'scheduler', to: 'fetcherPool', variant: 'primary' },
      { from: 'fetcherPool', to: 'parser', variant: 'primary' },
      { from: 'parser', to: 'seenSet', variant: 'secondary' },
      { from: 'parser', to: 'frontier', variant: 'direct' },
      { from: 'parser', to: 'contentStore', variant: 'primary' },
      { from: 'contentStore', to: 'storeShards', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'fetchThroughput', label: 'Fetch throughput vs target' },
    { id: 'frontierBacklog', label: 'Frontier / queue backlog' },
    { id: 'seenSetMemory', label: 'Seen-set memory' },
    { id: 'dnsPressure', label: 'DNS lookup pressure' },
    { id: 'contentStorage', label: 'Content storage' },
  ],
  decisions: [
    { id: 'frontierDesign', title: 'Frontier design' },
    { id: 'politeness', title: 'Politeness / rate control' },
    { id: 'dedup', title: 'URL + content dedup' },
    { id: 'dnsCaching', title: 'DNS caching' },
    { id: 'contentStorage', title: 'Content storage' },
    { id: 'coordination', title: 'Distributed coordination' },
  ],
  sourceBackedRules: [
    {
      title: 'A crawler must enforce politeness with per-host rate limits and robots.txt',
      source: 'Manning & Schütze, IR (Stanford NLP)',
      url: 'https://nlp.stanford.edu/IR-book/html/htmledition/the-url-frontier-1.html',
      summary:
        'The URL frontier must avoid hammering any one host; per-domain queues and back-off enforce a polite delay between requests to the same server.',
    },
    {
      title: 'DNS resolution is a hidden bottleneck and must be cached',
      source: 'Manning & Schütze, IR (Stanford NLP)',
      url: 'https://nlp.stanford.edu/IR-book/html/htmledition/dns-resolution-1.html',
      summary:
        'DNS lookups are a well-known bottleneck for a high-throughput crawler, so a custom cache (and asynchronous resolution) is standard practice.',
    },
    {
      title: 'A Bloom filter tests set membership in tiny space at the cost of false positives',
      source: 'Bloom, CACM 1970',
      url: 'https://dl.acm.org/doi/10.1145/362686.362692',
      summary:
        'Bloom filters answer "have I seen this URL?" using a few bits per element and never produce false negatives, making them the standard seen-set at billions of URLs.',
    },
    {
      title: 'A scalable crawler partitions the frontier and seen-set across machines',
      source: 'Olston & Najork (Google Research)',
      url: 'https://research.google/pubs/web-crawling/',
      summary:
        'The "Web Crawling" survey describes partitioning the URL frontier and duplicate-detection state across machines so a crawler can scale toward the whole web.',
    },
  ],
  teachingAssumptions: [
    'A fetcher worker is modeled as I/O bound; throughput scales with worker count until politeness or DNS caps it.',
    'Single-node throughput, DNS, memory, and storage budgets are conservative teaching numbers, not vendor limits.',
    'Seen-set memory uses ~64 bytes/URL for an exact hash set and ~1.5 bytes/URL for a Bloom filter at the chosen tolerance.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-loop',
      step: '01',
      focus: 'One loop, one site',
      scenarioId: 'single-threaded',
      question:
        'A single-threaded crawler fetches one page, parses it, then fetches the next, ~5 pages/s over one site. What is it spending almost all of its time doing?',
      reveal:
        'Waiting on the network. A fetch is I/O bound, so a sequential loop sits idle during each round trip. The seen set fits in a hash set and one store holds everything — no concurrency, no Bloom filter, no sharding is justified yet.',
      takeaway: 'A crawler is I/O bound; a sequential loop wastes nearly all its time waiting on the network.',
    },
    {
      id: 'concurrency',
      step: '02',
      focus: 'Add a worker pool',
      scenarioId: 'worker-pool',
      question:
        'You want 500 pages/s. With each worker holding ~12 fetches/s, how many workers do you need, and what is the first thing that breaks if you ignore politeness?',
      reveal:
        'About 80 concurrent workers overlap the I/O waits to hit the target. But if you point that pool at few domains with politeness off, you hammer those hosts — getting throttled or banned. Concurrency creates throughput and a politeness problem at the same time.',
      takeaway: 'Concurrency is how a crawler gets throughput — and exactly why politeness becomes mandatory.',
    },
    {
      id: 'politeness',
      step: '03',
      focus: 'Per-domain rate limits',
      scenarioId: 'politeness-scheduler',
      question:
        'Now respect ~1 fetch/domain/s across only ~1,500 domains while targeting 2,000 pages/s. Can the worker pool alone reach the target?',
      reveal:
        'No. Politeness caps you at roughly one fetch per domain per second, so ~1,500 domains ceil total throughput near 1,500 pages/s regardless of worker count. A scheduler with per-domain queues — not more workers — becomes the real throttle, and spreading across more domains is the only way to go faster.',
      takeaway: 'With politeness on, throughput is bounded by domains times the per-domain rate, not by worker count.',
    },
    {
      id: 'bloom',
      step: '04',
      focus: 'Seen set outgrows RAM',
      scenarioId: 'dedup-at-scale',
      question:
        'At 5 billion URLs, an exact hash set is ~64 bytes each — about 320 GB. Does that fit in one machine, and what shrinks it?',
      reveal:
        'No — an exact set blows past a single node. A Bloom filter at a small false-positive tolerance drops it to ~1.5 bytes/URL (a few GB), trading a tiny chance of skipping a new URL for fitting in memory. Content fingerprinting also skips near-duplicate bodies before they reach storage.',
      takeaway: 'At billions of URLs the seen set must become a Bloom filter; you trade exactness for fitting in RAM.',
    },
    {
      id: 'distributed',
      step: '05',
      focus: 'Partition the frontier',
      scenarioId: 'distributed-frontier',
      question:
        'A 50-billion-page crawl at 200k pages/s needs tens of thousands of workers. Can one frontier, one seen set, and one store coordinate that?',
      reveal:
        'No — the frontier, seen set, and content store all exceed one machine. Partition the frontier by host (so politeness stays local to each shard), shard the Bloom filter, and shard the content store. Coordination becomes the central design problem, as in Mercator-style crawlers.',
      takeaway: 'At web scale you partition the frontier by host and shard the seen set and store; coordination is the design.',
    },
  ],
  analyze: analyzeWebCrawlerWorkload,
};

function analyzeWebCrawlerWorkload(workload: WorkloadValues): LabAnalysis {
  const targetPagesPerSecond = numericValue(workload, 'targetPagesPerSecond');
  const totalPages = numericValue(workload, 'totalPages');
  const fetcherWorkers = numericValue(workload, 'fetcherWorkers');
  const averagePageKilobytes = numericValue(workload, 'averagePageKilobytes');
  const uniqueDomains = numericValue(workload, 'uniqueDomains');
  const dedupFalsePositiveRate = numericValue(workload, 'dedupFalsePositiveRate');
  const respectPoliteness = Boolean(workload.respectPoliteness);
  const contentDedup = Boolean(workload.contentDedup);

  // Achievable throughput: workers cap it from above; politeness caps it by domain count.
  const workerCeiling = fetcherWorkers * pagesPerFetcherWorker;
  const politenessCeiling = respectPoliteness
    ? uniqueDomains * politeFetchesPerDomainPerSecond
    : Number.POSITIVE_INFINITY;
  const achievableThroughput = Math.min(targetPagesPerSecond, workerCeiling, politenessCeiling);
  const throughputShortfall = targetPagesPerSecond - achievableThroughput;

  const needsWorkerPool = targetPagesPerSecond > comfortableFetchThroughput || fetcherWorkers > 1;
  const politenessBound = respectPoliteness && politenessCeiling < targetPagesPerSecond;
  // A separate politeness scheduler is only warranted once fetches run concurrently;
  // a single sequential loop enforces a per-domain delay with a simple sleep.
  const needsScheduler =
    respectPoliteness && needsWorkerPool && (politenessBound || targetPagesPerSecond > 500);

  // Seen-set memory: an exact set is the baseline; a Bloom filter is the fix above the budget.
  const exactSeenSetGigabytes = (totalPages * seenSetBytesPerUrlExact) / 1_000_000_000;
  const needsBloomFilter = exactSeenSetGigabytes > comfortableSeenSetGigabytes;
  const seenSetGigabytes = needsBloomFilter
    ? (totalPages * seenSetBytesPerUrlBloom) / 1_000_000_000
    : exactSeenSetGigabytes;

  // DNS: cached fetches are cheap; the cold-miss share is what stresses the resolver.
  const dnsLookupsPerSecond = achievableThroughput * (1 - dnsLookupsCachedShare);
  const dnsPressure = dnsLookupsPerSecond / comfortableDnsLookupsPerSecond;
  const needsDnsCache = targetPagesPerSecond > comfortableFetchThroughput || uniqueDomains > 1_000;

  const storageTerabytes = (totalPages * averagePageKilobytes) / 1_000_000_000;
  const needsStorageShards = storageTerabytes > comfortableStorageTerabytes;

  const needsCoordination =
    fetcherWorkers > comfortableFrontierDrainPerSecond / pagesPerFetcherWorker ||
    targetPagesPerSecond > comfortableFrontierDrainPerSecond ||
    needsStorageShards ||
    uniqueDomains > 1_000_000;
  const needsContentDedup = contentDedup;

  const flags = {
    needsWorkerPool,
    needsScheduler,
    needsBloomFilter,
    needsDnsCache,
    needsStorageShards,
    needsCoordination,
    needsContentDedup,
    politenessBound,
    respectPoliteness,
  };

  const fetchRatio = targetPagesPerSecond > 0 ? throughputShortfall / targetPagesPerSecond : 0;
  const frontierBacklogRatio = targetPagesPerSecond / comfortableFrontierDrainPerSecond;

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      seeds: 'ok',
      frontier: needsCoordination ? 'warning' : frontierBacklogRatio > 0.7 ? 'warning' : 'ok',
      scheduler: needsScheduler ? 'needed' : 'inactive',
      dnsCache: needsDnsCache ? 'needed' : 'inactive',
      fetcherPool: throughputShortfall > 0 ? 'overloaded' : needsWorkerPool ? 'ok' : 'ok',
      parser: 'ok',
      seenSet: needsBloomFilter ? 'needed' : 'ok',
      contentStore: needsStorageShards ? 'warning' : 'ok',
      storeShards: needsStorageShards ? 'needed' : 'inactive',
    },
    flowStates: {
      seedsToFrontier: 'active',
      frontierToScheduler: 'active',
      schedulerToDnsCache: needsDnsCache ? 'active' : 'inactive',
      schedulerToFetcherPool: throughputShortfall > 0 ? 'warning' : 'active',
      fetcherPoolToParser: 'active',
      parserToSeenSet: 'active',
      parserToFrontier: 'active',
      parserToContentStore: 'active',
      contentStoreToStoreShards: needsStorageShards ? 'active' : 'inactive',
    },
    meters: {
      fetchThroughput: {
        ratio: fetchRatio + (throughputShortfall > 0 ? 1 : 0),
        valueText: `${formatRate(achievableThroughput)}/s of ${formatRate(targetPagesPerSecond)}/s`,
        copy:
          throughputShortfall > 0
            ? politenessBound
              ? `Politeness caps you near ${formatRate(politenessCeiling)}/s across ${formatCount(uniqueDomains)} ${pluralize('domain', uniqueDomains)}; more workers will not help.`
              : `The worker pool tops out near ${formatRate(workerCeiling)}/s; add workers to close the gap to ${formatRate(targetPagesPerSecond)}/s.`
            : `The fetcher pool sustains the ${formatRate(targetPagesPerSecond)}/s target with headroom.`,
      },
      frontierBacklog: {
        ratio: frontierBacklogRatio,
        valueText: `${formatRate(targetPagesPerSecond)}/s enqueue`,
        copy: needsCoordination
          ? 'Enqueue/dequeue volume exceeds one frontier node; partition the frontier by host.'
          : 'A single frontier keeps up with the enqueue and dequeue rate.',
      },
      seenSetMemory: {
        ratio: seenSetGigabytes / comfortableSeenSetGigabytes,
        valueText: formatStorageGigabytes(seenSetGigabytes),
        copy: needsBloomFilter
          ? `An exact set would be ${formatStorageGigabytes(exactSeenSetGigabytes)}; a Bloom filter at ${formatPercent(dedupFalsePositiveRate)} false positives fits it in memory.`
          : `${formatCount(totalPages)} URLs at ~${seenSetBytesPerUrlExact} bytes each still fit an exact in-memory set.`,
      },
      dnsPressure: {
        ratio: dnsPressure,
        valueText: `${formatRate(dnsLookupsPerSecond)}/s misses`,
        copy: needsDnsCache
          ? `With ~${formatRatio(dnsLookupsCachedShare)} of lookups cached, only ${formatRate(dnsLookupsPerSecond)}/s reach the resolver.`
          : 'DNS volume is low enough to resolve inline without a dedicated cache.',
      },
      contentStorage: {
        ratio: storageTerabytes / comfortableStorageTerabytes,
        valueText: formatStorageGigabytes(storageTerabytes * 1_000),
        copy: `${formatCount(totalPages)} pages at ~${Math.round(averagePageKilobytes)} KB each.`,
      },
    },
    decisions: buildDecisions({
      ...flags,
      targetPagesPerSecond,
      uniqueDomains,
      politenessCeiling,
      dedupFalsePositiveRate,
    }),
    reasons: buildReasons({
      ...flags,
      targetPagesPerSecond,
      achievableThroughput,
      throughputShortfall,
      workerCeiling,
      politenessCeiling,
      fetcherWorkers,
      uniqueDomains,
      totalPages,
      exactSeenSetGigabytes,
      seenSetGigabytes,
      dedupFalsePositiveRate,
      storageTerabytes,
    }),
  };
}

type ArchitectureFlags = {
  needsWorkerPool: boolean;
  needsScheduler: boolean;
  needsBloomFilter: boolean;
  needsDnsCache: boolean;
  needsStorageShards: boolean;
  needsCoordination: boolean;
  needsContentDedup: boolean;
  politenessBound: boolean;
  respectPoliteness: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    targetPagesPerSecond: number;
    achievableThroughput: number;
    throughputShortfall: number;
    workerCeiling: number;
    politenessCeiling: number;
    fetcherWorkers: number;
    uniqueDomains: number;
    totalPages: number;
    exactSeenSetGigabytes: number;
    seenSetGigabytes: number;
    dedupFalsePositiveRate: number;
    storageTerabytes: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.throughputShortfall > 0) {
    reasons.push({
      severity: analysis.throughputShortfall > analysis.targetPagesPerSecond * 0.5 ? 'danger' : 'warning',
      text: analysis.politenessBound
        ? `Politeness caps throughput near ${formatRate(
            analysis.politenessCeiling,
          )}/s across ${formatCount(analysis.uniqueDomains)} ${pluralize(
            'domain',
            analysis.uniqueDomains,
          )}; only spanning more domains raises the ceiling.`
        : `${formatCount(analysis.fetcherWorkers)} ${pluralize(
            'worker',
            analysis.fetcherWorkers,
          )} top out near ${formatRate(analysis.workerCeiling)}/s, short of the ${formatRate(
            analysis.targetPagesPerSecond,
          )}/s target.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `The fetcher pool sustains ${formatRate(
        analysis.achievableThroughput,
      )}/s, meeting the crawl-rate target.`,
    });
  }

  if (analysis.needsWorkerPool) {
    reasons.push({
      severity: 'ok',
      text: 'Fetches are I/O bound, so a pool of concurrent workers overlaps network waits to raise throughput.',
    });
  }

  if (analysis.needsScheduler) {
    reasons.push({
      severity: 'warning',
      text: 'A politeness-aware scheduler with per-domain queues enforces robots.txt and rate limits, not just raw worker count.',
    });
  }

  if (analysis.needsBloomFilter) {
    reasons.push({
      severity: analysis.exactSeenSetGigabytes > comfortableSeenSetGigabytes * 4 ? 'danger' : 'warning',
      text: `${formatCount(analysis.totalPages)} URLs would need ~${formatStorageGigabytes(
        analysis.exactSeenSetGigabytes,
      )} as an exact set; a Bloom filter at ${formatPercent(
        analysis.dedupFalsePositiveRate,
      )} fits it in ~${formatStorageGigabytes(analysis.seenSetGigabytes)}.`,
    });
  }

  if (analysis.needsDnsCache) {
    reasons.push({
      severity: 'ok',
      text: 'DNS resolution is a hidden bottleneck at high fetch rates, so host lookups are cached and resolved asynchronously.',
    });
  }

  if (analysis.needsStorageShards) {
    reasons.push({
      severity: analysis.storageTerabytes > comfortableStorageTerabytes * 2 ? 'danger' : 'warning',
      text: `~${formatStorageGigabytes(
        analysis.storageTerabytes * 1_000,
      )} of page bodies exceeds one content store; shard the corpus across nodes.`,
    });
  }

  if (analysis.needsCoordination) {
    reasons.push({
      severity: 'warning',
      text: 'At this scale the frontier, seen set, and store all exceed one machine; partition by host and coordinate across shards.',
    });
  }

  if (analysis.needsContentDedup) {
    reasons.push({
      severity: 'ok',
      text: 'Content fingerprinting skips near-duplicate page bodies before they reach storage, on top of URL dedup.',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    targetPagesPerSecond: number;
    uniqueDomains: number;
    politenessCeiling: number;
    dedupFalsePositiveRate: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    frontierDesign: {
      state: flags.needsCoordination ? 'needed' : flags.needsScheduler ? 'useful' : 'not-yet',
      copy: flags.needsCoordination
        ? 'Partition the frontier by host across machines, each with priority and per-domain politeness queues.'
        : flags.needsScheduler
          ? 'Use a frontier with priority plus per-domain queues so the scheduler can order fetches fairly.'
          : 'A simple in-memory queue is enough for a single sequential crawler.',
    },
    politeness: {
      state: flags.respectPoliteness ? (flags.politenessBound ? 'needed' : 'useful') : 'tradeoff',
      copy: flags.respectPoliteness
        ? flags.politenessBound
          ? `Per-domain rate limits cap throughput near ${formatRate(
              flags.politenessCeiling,
            )}/s; spread across more domains to go faster while staying polite.`
          : 'Obey robots.txt and a per-domain delay; with many domains this rarely limits total throughput.'
        : 'Politeness is off — fast, but risks hammering hosts, getting throttled, or being banned.',
    },
    dedup: {
      state: flags.needsBloomFilter ? 'needed' : flags.needsContentDedup ? 'useful' : 'useful',
      copy: flags.needsBloomFilter
        ? `Use a Bloom filter for the seen-URL set at ${formatPercent(
            flags.dedupFalsePositiveRate,
          )} false positives${flags.needsContentDedup ? ', plus content fingerprints for near-duplicates' : ''}.`
        : flags.needsContentDedup
          ? 'An exact seen-URL set fits in memory; add content fingerprints to skip near-duplicate bodies.'
          : 'An exact in-memory seen-URL set is enough at this scale.',
    },
    dnsCaching: {
      state: flags.needsDnsCache ? 'needed' : 'not-yet',
      copy: flags.needsDnsCache
        ? 'Cache host-to-IP lookups and resolve asynchronously so DNS does not throttle the fetchers.'
        : 'DNS volume is low enough to resolve inline without a dedicated cache.',
    },
    contentStorage: {
      state: flags.needsStorageShards ? 'needed' : 'useful',
      copy: flags.needsStorageShards
        ? 'Shard page bodies across a distributed store; the access pattern is write-once, batch-read.'
        : 'A single object/blob store holds the fetched pages while the corpus fits on one node.',
    },
    coordination: {
      state: flags.needsCoordination ? 'needed' : 'not-yet',
      copy: flags.needsCoordination
        ? 'Coordinate a Mercator-style distributed crawler: partition frontier and seen-set by host across machines.'
        : 'One machine coordinates the whole crawl while throughput and corpus stay modest.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (
    !flags.needsWorkerPool &&
    !flags.needsScheduler &&
    !flags.needsBloomFilter &&
    !flags.needsStorageShards &&
    !flags.needsCoordination
  ) {
    return 'Single-threaded crawler';
  }
  if (flags.needsCoordination) {
    return 'Distributed, partitioned crawler';
  }
  if (flags.needsBloomFilter) {
    return 'Worker pool + Bloom-filter seen set';
  }
  if (flags.needsScheduler) {
    return 'Worker pool + politeness scheduler';
  }
  return 'Concurrent fetcher pool';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (
    !flags.needsWorkerPool &&
    !flags.needsScheduler &&
    !flags.needsBloomFilter &&
    !flags.needsStorageShards &&
    !flags.needsCoordination
  ) {
    return 'One loop fetches, parses, and stores pages in sequence. An in-memory queue and exact seen set are all that is justified.';
  }
  if (flags.needsCoordination) {
    return 'The frontier is partitioned by host across machines, the Bloom-filter seen set and content store are sharded, and a scheduler keeps each shard polite.';
  }
  if (flags.needsBloomFilter) {
    return 'A worker pool drives throughput, a politeness scheduler orders fetches, and a Bloom-filter seen set keeps billions of URLs in memory.';
  }
  if (flags.needsScheduler) {
    return 'A concurrent worker pool overlaps network waits while a politeness-aware scheduler enforces robots.txt and per-domain rate limits.';
  }
  return 'A pool of concurrent fetcher workers overlaps I/O waits to raise crawl throughput beyond a single loop.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (
    !flags.needsWorkerPool &&
    !flags.needsScheduler &&
    !flags.needsBloomFilter &&
    !flags.needsStorageShards &&
    !flags.needsCoordination
  ) {
    return 'Frontier -> fetch -> parse -> store';
  }
  if (flags.needsCoordination) {
    return 'Partitioned frontier -> scheduler -> fetcher pool -> parser + sharded Bloom set -> sharded store';
  }
  if (flags.needsBloomFilter) {
    return 'Frontier -> scheduler -> fetcher pool -> parser + Bloom seen set -> store';
  }
  if (flags.needsScheduler) {
    return 'Frontier -> scheduler -> fetcher pool -> parser -> store';
  }
  return 'Frontier -> fetcher pool -> parser -> store';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function pluralize(unit: string, value: number): string {
  return Math.round(value) === 1 ? unit : `${unit}s`;
}

function formatPercent(value: number): string {
  return value < 1 ? `${value}%` : `${value.toFixed(value < 10 ? 1 : 0)}%`;
}
