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
  eyebrow: '系统设计 Lab',
  title: 'web crawler 在 fetcher 处受 throughput 约束、在 "seen" set 处受内存约束，而 politeness 决定了你能跑多快。',
  summary:
    '调整目标 crawl rate、打算抓多少页、fetcher worker pool、平均页面大小、覆盖多少个不同 domain，以及 dedup 容忍度。设计会从单线程循环演进到 worker pool、politeness-aware scheduler、Bloom-filter "seen" set，再到 partitioned frontier 配 sharded 内容存储。',
  controls: [
    {
      id: 'targetPagesPerSecond',
      label: '目标 crawl rate',
      help: '整体上每秒想抓取的页面数。这是 fetcher pool 必须撑住的 throughput。',
      min: 1,
      max: 1_000_000,
      defaultValue: 50,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'totalPages',
      label: '要抓取的页数',
      help: '这次 crawl 总共会访问的页面数；决定存储量和 seen-URL set 的大小。',
      min: 1_000,
      max: 100_000_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: '页',
      format: 'count',
    },
    {
      id: 'fetcherWorkers',
      label: 'Fetcher worker',
      help: '并发的 HTTP 下载 worker。每个都是 I/O bound，每秒只能撑住少量 fetch。',
      min: 1,
      max: 100_000,
      defaultValue: 8,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'averagePageKilobytes',
      label: '平均页面大小',
      help: '每页平均下载的字节数；乘起来就是内容存储量和 fetch 带宽。',
      min: 10,
      max: 5_000,
      defaultValue: 80,
      scale: 'log',
      format: 'kilobytes',
    },
    {
      id: 'uniqueDomains',
      label: '不同 domain 数',
      help: '覆盖的不同 host 数。domain 少加上 politeness 会压低总 throughput；domain 多则能并行化。',
      min: 1,
      max: 100_000_000,
      defaultValue: 5_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'dedupFalsePositiveRate',
      label: 'Dedup 容忍度',
      help: '"seen" set 可接受的 false-positive rate。容忍度越松，Bloom filter 越能压缩内存。',
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
      label: '遵守 politeness + robots.txt',
      help: '遵守 robots.txt 和 per-domain rate limit。限制单个 domain 被打多快。',
      defaultValue: true,
    },
    {
      id: 'contentDedup',
      label: '内容 dedup',
      help: '对页面正文做指纹来跳过近似重复内容，不只是已见过的 URL。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-threaded',
      step: '01',
      title: 'Single-threaded crawler',
      summary: '一个循环顺序遍历一个小站点。',
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
      summary: '众多 worker 跨站点并行抓取。',
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
      summary: 'Per-domain rate limit 把控 fetch 顺序。',
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
      summary: 'seen-URL set 已经塞不进 RAM。',
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
      summary: 'web 规模的 crawl，跨机器 sharded。',
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
    title: '分布式 web crawler 架构图',
    description:
      '白板风格的分布式 web crawler 架构图：seed URL 喂给 frontier，带 DNS cache 的 politeness-aware scheduler，一组 fetcher worker，做 URL 和内容 dedup 的 parser，以及一个 sharded 内容存储。',
    columns: [
      {
        id: 'frontier',
        label: 'Seeds / Frontier',
        variant: 'clients',
        nodes: [
          {
            id: 'seeds',
            title: 'Seed URL',
            subtitle: 'crawl 起点',
            summary: '启动 crawl 的初始 URL，之后由发现到的 link 接力',
            kind: 'client',
          },
          {
            id: 'frontier',
            title: 'URL frontier',
            subtitle: 'priority queue',
            summary: '存放待抓取的 URL，按优先级和 per-domain queue 排序',
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
            subtitle: 'politeness 关卡',
            summary: '挑选下一个可抓取的 URL，同时遵守 robots.txt 和 per-domain rate limit',
            kind: 'scheduler',
          },
          {
            id: 'dnsCache',
            title: 'DNS cache',
            subtitle: '已解析的 host',
            summary: '缓存 host 到 IP 的查询，让解析不致成为隐藏瓶颈',
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
            subtitle: 'HTTP 下载',
            summary: '从开放 web 下载页面的并发 I/O-bound worker',
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
            subtitle: '抽取 link',
            summary: '解析抓回的页面，抽取出站 link 回灌给 frontier',
            kind: 'compute',
          },
          {
            id: 'seenSet',
            title: 'Seen set',
            subtitle: 'URL + 内容',
            summary: '拒掉已见过的 URL 和近似重复内容，规模大时通常用 Bloom filter',
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
            subtitle: '抓回的页面',
            summary: '持久存放下载的页面正文，供索引和分析',
            kind: 'objectstore',
          },
          {
            id: 'storeShards',
            title: 'Store shard',
            subtitle: '页面分片',
            summary: '当单个 store 装不下整个语料时，把页面正文分散到多个节点',
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
    { id: 'fetchThroughput', label: 'Fetch throughput vs 目标' },
    { id: 'frontierBacklog', label: 'Frontier / queue 积压' },
    { id: 'seenSetMemory', label: 'Seen-set 内存' },
    { id: 'dnsPressure', label: 'DNS 查询压力' },
    { id: 'contentStorage', label: '内容存储' },
  ],
  decisions: [
    { id: 'frontierDesign', title: 'Frontier 设计' },
    { id: 'politeness', title: 'Politeness / rate 控制' },
    { id: 'dedup', title: 'URL + 内容 dedup' },
    { id: 'dnsCaching', title: 'DNS caching' },
    { id: 'contentStorage', title: '内容存储' },
    { id: 'coordination', title: '分布式协调' },
  ],
  sourceBackedRules: [
    {
      title: 'crawler 必须用 per-host rate limit 和 robots.txt 来执行 politeness',
      source: 'Manning & Schütze, IR (Stanford NLP)',
      url: 'https://nlp.stanford.edu/IR-book/html/htmledition/the-url-frontier-1.html',
      summary:
        'URL frontier 必须避免猛打任何单个 host；per-domain queue 和 back-off 在对同一服务器的请求之间强制一段礼貌延迟。',
    },
    {
      title: 'DNS 解析是隐藏瓶颈，必须 cache',
      source: 'Manning & Schütze, IR (Stanford NLP)',
      url: 'https://nlp.stanford.edu/IR-book/html/htmledition/dns-resolution-1.html',
      summary:
        '对高 throughput 的 crawler 来说，DNS lookup 是众所周知的瓶颈，所以自建 cache（加异步解析）是标准做法。',
    },
    {
      title: 'Bloom filter 以极小空间检测集合成员关系，代价是 false positive',
      source: 'Bloom, CACM 1970',
      url: 'https://dl.acm.org/doi/10.1145/362686.362692',
      summary:
        'Bloom filter 用每个元素几个 bit 来回答"这个 URL 见过吗？"，而且从不产生 false negative，因此在数十亿 URL 规模下成为标准的 seen-set。',
    },
    {
      title: '可扩展的 crawler 把 frontier 和 seen-set 跨机器 partition',
      source: 'Olston & Najork (Google Research)',
      url: 'https://research.google/pubs/web-crawling/',
      summary:
        '"Web Crawling" 这篇综述描述了如何把 URL frontier 和去重状态跨机器 partition，让 crawler 能向整个 web 规模扩展。',
    },
  ],
  teachingAssumptions: [
    'fetcher worker 被建模为 I/O bound；throughput 随 worker 数量线性增长，直到 politeness 或 DNS 把它封顶。',
    '单节点的 throughput、DNS、内存和存储预算都是保守的教学数字，不是厂商上限。',
    'Seen-set 内存按 exact hash set 每 URL ~64 bytes、给定容忍度下 Bloom filter 每 URL ~1.5 bytes 计算。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-loop',
      step: '01',
      focus: '一个循环，一个站点',
      scenarioId: 'single-threaded',
      question:
        '单线程 crawler 抓一页、解析、再抓下一页，在一个站点上 ~5 pages/s。它几乎所有时间都花在做什么？',
      reveal:
        '等网络。fetch 是 I/O bound，所以顺序循环在每次往返时都在空转。seen set 装得进一个 hash set，一个 store 存得下全部——还没到需要并发、Bloom filter 或 sharding 的时候。',
      takeaway: 'crawler 是 I/O bound；顺序循环几乎把所有时间都浪费在等网络上。',
    },
    {
      id: 'concurrency',
      step: '02',
      focus: '加一个 worker pool',
      scenarioId: 'worker-pool',
      question:
        '你想要 500 pages/s。每个 worker 撑住 ~12 fetches/s，你需要多少个 worker？如果不管 politeness，第一个崩的是什么？',
      reveal:
        '大约 80 个并发 worker 把 I/O 等待重叠起来就能打到目标。但如果你把这个 pool 对准少数 domain 还关掉 politeness，就会猛打那些 host——被限速或封禁。并发同时带来 throughput 和一个 politeness 问题。',
      takeaway: '并发是 crawler 获得 throughput 的方式——也正因如此 politeness 变成必须的。',
    },
    {
      id: 'politeness',
      step: '03',
      focus: 'Per-domain rate limit',
      scenarioId: 'politeness-scheduler',
      question:
        '现在在只有 ~1,500 个 domain 上遵守 ~1 fetch/domain/s，目标却是 2,000 pages/s。光靠 worker pool 能打到目标吗？',
      reveal:
        '不能。politeness 把你限制在大约每 domain 每秒一次 fetch，所以无论多少 worker，~1,500 个 domain 都把总 throughput 封顶在 ~1,500 pages/s 附近。真正的瓶颈变成带 per-domain queue 的 scheduler——而不是更多 worker——想更快的唯一办法是铺到更多 domain。',
      takeaway: 'politeness 开着时，throughput 受 domain 数乘以 per-domain rate 约束，而非 worker 数。',
    },
    {
      id: 'bloom',
      step: '04',
      focus: 'Seen set 撑爆 RAM',
      scenarioId: 'dedup-at-scale',
      question:
        '到 50 亿 URL 时，exact hash set 每个 ~64 bytes——大约 320 GB。这装得进一台机器吗？什么能把它缩小？',
      reveal:
        '装不下——exact set 远远超出单节点。容忍一点小 false-positive 的 Bloom filter 把它压到 ~1.5 bytes/URL（几 GB），用极小概率漏掉新 URL 换取塞进内存。内容指纹还能在页面正文到达存储前就跳过近似重复的。',
      takeaway: '到数十亿 URL 时 seen set 必须变成 Bloom filter；你用精确性换取塞进 RAM。',
    },
    {
      id: 'distributed',
      step: '05',
      focus: 'Partition frontier',
      scenarioId: 'distributed-frontier',
      question:
        '500 亿页、200k pages/s 的 crawl 需要数万个 worker。一个 frontier、一个 seen set、一个 store 协调得了吗？',
      reveal:
        '协调不了——frontier、seen set 和 content store 都超出一台机器。按 host 给 frontier 做 partition（让 politeness 留在每个 shard 内部本地处理），把 Bloom filter 分片，把 content store 分片。协调成了核心设计问题，就像 Mercator 风格的 crawler 那样。',
      takeaway: '到 web 规模你按 host partition frontier 并把 seen set 和 store 分片；协调本身就是设计。',
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
        valueText: `${formatRate(achievableThroughput)}/s，目标 ${formatRate(targetPagesPerSecond)}/s`,
        copy:
          throughputShortfall > 0
            ? politenessBound
              ? `Politeness 把你限在 ${formatRate(politenessCeiling)}/s 附近，跨 ${formatCount(uniqueDomains)} 个 domain；加 worker 也没用。`
              : `Worker pool 在 ${formatRate(workerCeiling)}/s 见顶；加 worker 来补上到 ${formatRate(targetPagesPerSecond)}/s 的缺口。`
            : `Fetcher pool 撑住 ${formatRate(targetPagesPerSecond)}/s 目标还有余量。`,
      },
      frontierBacklog: {
        ratio: frontierBacklogRatio,
        valueText: `${formatRate(targetPagesPerSecond)}/s 入队`,
        copy: needsCoordination
          ? '入队/出队量超过单个 frontier 节点；按 host 给 frontier 做 partition。'
          : '单个 frontier 跟得上入队和出队速率。',
      },
      seenSetMemory: {
        ratio: seenSetGigabytes / comfortableSeenSetGigabytes,
        valueText: formatStorageGigabytes(seenSetGigabytes),
        copy: needsBloomFilter
          ? `Exact set 要 ${formatStorageGigabytes(exactSeenSetGigabytes)}；${formatPercent(dedupFalsePositiveRate)} false positive 的 Bloom filter 能把它塞进内存。`
          : `${formatCount(totalPages)} 个 URL 每个 ~${seenSetBytesPerUrlExact} bytes，仍装得进内存里的 exact set。`,
      },
      dnsPressure: {
        ratio: dnsPressure,
        valueText: `${formatRate(dnsLookupsPerSecond)}/s miss`,
        copy: needsDnsCache
          ? `~${formatRatio(dnsLookupsCachedShare)} 的 lookup 命中 cache，只有 ${formatRate(dnsLookupsPerSecond)}/s 真正打到 resolver。`
          : 'DNS 量足够低，可以内联解析，不需要专门的 cache。',
      },
      contentStorage: {
        ratio: storageTerabytes / comfortableStorageTerabytes,
        valueText: formatStorageGigabytes(storageTerabytes * 1_000),
        copy: `${formatCount(totalPages)} 页，每页 ~${Math.round(averagePageKilobytes)} KB。`,
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
        ? `Politeness 把 throughput 限在 ${formatRate(
            analysis.politenessCeiling,
          )}/s 附近，跨 ${formatCount(analysis.uniqueDomains)} 个 domain；只有铺到更多 domain 才能抬高这个上限。`
        : `${formatCount(analysis.fetcherWorkers)} 个 worker 在 ${formatRate(
            analysis.workerCeiling,
          )}/s 见顶，达不到 ${formatRate(
            analysis.targetPagesPerSecond,
          )}/s 的目标。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `Fetcher pool 撑住 ${formatRate(
        analysis.achievableThroughput,
      )}/s，达到了 crawl-rate 目标。`,
    });
  }

  if (analysis.needsWorkerPool) {
    reasons.push({
      severity: 'ok',
      text: 'Fetch 是 I/O bound，所以一组并发 worker 把网络等待重叠起来抬高 throughput。',
    });
  }

  if (analysis.needsScheduler) {
    reasons.push({
      severity: 'warning',
      text: '带 per-domain queue 的 politeness-aware scheduler 来执行 robots.txt 和 rate limit，而不只是靠堆 worker 数。',
    });
  }

  if (analysis.needsBloomFilter) {
    reasons.push({
      severity: analysis.exactSeenSetGigabytes > comfortableSeenSetGigabytes * 4 ? 'danger' : 'warning',
      text: `${formatCount(analysis.totalPages)} 个 URL 作为 exact set 要 ~${formatStorageGigabytes(
        analysis.exactSeenSetGigabytes,
      )}；${formatPercent(
        analysis.dedupFalsePositiveRate,
      )} 的 Bloom filter 能把它压进 ~${formatStorageGigabytes(analysis.seenSetGigabytes)}。`,
    });
  }

  if (analysis.needsDnsCache) {
    reasons.push({
      severity: 'ok',
      text: '高 fetch rate 下 DNS 解析是隐藏瓶颈，所以 host lookup 要 cache 并异步解析。',
    });
  }

  if (analysis.needsStorageShards) {
    reasons.push({
      severity: analysis.storageTerabytes > comfortableStorageTerabytes * 2 ? 'danger' : 'warning',
      text: `~${formatStorageGigabytes(
        analysis.storageTerabytes * 1_000,
      )} 的页面正文超出单个 content store；把语料跨节点分片。`,
    });
  }

  if (analysis.needsCoordination) {
    reasons.push({
      severity: 'warning',
      text: '到这个规模，frontier、seen set 和 store 都超出一台机器；按 host partition 并跨 shard 协调。',
    });
  }

  if (analysis.needsContentDedup) {
    reasons.push({
      severity: 'ok',
      text: '在 URL dedup 之上，内容指纹在页面正文到达存储前就跳过近似重复的。',
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
        ? '按 host 把 frontier 跨机器 partition，每片各带优先级和 per-domain politeness queue。'
        : flags.needsScheduler
          ? '用一个带优先级加 per-domain queue 的 frontier，让 scheduler 能公平地排 fetch 顺序。'
          : '单个顺序 crawler 用一个简单的内存 queue 就够了。',
    },
    politeness: {
      state: flags.respectPoliteness ? (flags.politenessBound ? 'needed' : 'useful') : 'tradeoff',
      copy: flags.respectPoliteness
        ? flags.politenessBound
          ? `Per-domain rate limit 把 throughput 限在 ${formatRate(
              flags.politenessCeiling,
            )}/s 附近；想更快又保持礼貌，就铺到更多 domain。`
          : '遵守 robots.txt 和 per-domain 延迟；domain 多时这很少会限制总 throughput。'
        : 'Politeness 关着——快，但有猛打 host、被限速或被封禁的风险。',
    },
    dedup: {
      state: flags.needsBloomFilter ? 'needed' : flags.needsContentDedup ? 'useful' : 'useful',
      copy: flags.needsBloomFilter
        ? `seen-URL set 用 ${formatPercent(
            flags.dedupFalsePositiveRate,
          )} false positive 的 Bloom filter${flags.needsContentDedup ? '，再加内容指纹来挡近似重复' : ''}。`
        : flags.needsContentDedup
          ? 'Exact seen-URL set 装得进内存；再加内容指纹来跳过近似重复的正文。'
          : '这个规模下内存里的 exact seen-URL set 就够了。',
    },
    dnsCaching: {
      state: flags.needsDnsCache ? 'needed' : 'not-yet',
      copy: flags.needsDnsCache
        ? '缓存 host 到 IP 的 lookup 并异步解析，别让 DNS 拖慢 fetcher。'
        : 'DNS 量足够低，可以内联解析，不需要专门的 cache。',
    },
    contentStorage: {
      state: flags.needsStorageShards ? 'needed' : 'useful',
      copy: flags.needsStorageShards
        ? '把页面正文跨一个分布式 store 分片；访问模式是 write-once、batch-read。'
        : '语料还装得下单节点时，一个 object/blob store 就能存下抓回的页面。',
    },
    coordination: {
      state: flags.needsCoordination ? 'needed' : 'not-yet',
      copy: flags.needsCoordination
        ? '协调一个 Mercator 风格的分布式 crawler：按 host 把 frontier 和 seen-set 跨机器 partition。'
        : 'throughput 和语料都还不大时，一台机器协调整个 crawl。',
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
    return '一个循环顺序地 fetch、parse、存页面。一个内存 queue 加 exact seen set 就是全部所需。';
  }
  if (flags.needsCoordination) {
    return 'Frontier 按 host 跨机器 partition，Bloom-filter seen set 和 content store 都分片，scheduler 让每个 shard 保持礼貌。';
  }
  if (flags.needsBloomFilter) {
    return 'Worker pool 拉起 throughput，politeness scheduler 排 fetch 顺序，Bloom-filter seen set 把数十亿 URL 留在内存里。';
  }
  if (flags.needsScheduler) {
    return '并发 worker pool 重叠网络等待，同时 politeness-aware scheduler 执行 robots.txt 和 per-domain rate limit。';
  }
  return '一组并发 fetcher worker 重叠 I/O 等待，把 crawl throughput 抬到单循环之上。';
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

function formatPercent(value: number): string {
  return value < 1 ? `${value}%` : `${value.toFixed(value < 10 ? 1 : 0)}%`;
}
