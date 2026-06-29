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

const bytesPerMapping = 500;
const comfortableDbReadsPerSecond = 12_000;
const comfortableDbWritesPerSecond = 4_000;
const comfortableStorageGigabytes = 500;
const singleCounterCreateBudget = 2_000;

export const urlShortenerLabDefinition: SystemDesignLabDefinition = {
  id: 'url-shortener',
  eyebrow: '系统设计 Lab',
  title: 'URL shortener 本质是一个 read-heavy 的 key-value lookup，会先从读这一侧撑爆单机。',
  summary:
    '调节 redirect 和 create 的速率、存了多少 link、hot-link 倾斜程度、short-code 长度、latency 目标和 region 数量。设计会从单个 database 逐步演进到 cache-aside 读、专门的 key-generation 策略、sharded KV store，以及多 region 的 edge redirect。',
  controls: [
    {
      id: 'redirectQps',
      label: 'Redirect 速率',
      help: '读：查 short code 然后返回 301/302。这是占主导的流量。',
      min: 10,
      max: 5_000_000,
      defaultValue: 2_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'createQps',
      label: 'Create 速率',
      help: '写：提交新的 long URL 来缩短。',
      min: 1,
      max: 200_000,
      defaultValue: 20,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'totalUrls',
      label: '已存 link 数',
      help: '系统里保存的 short-code 到 long-URL 的 mapping 总数。',
      min: 10_000,
      max: 100_000_000_000,
      defaultValue: 10_000_000,
      scale: 'log',
      unit: '条',
      format: 'count',
    },
    {
      id: 'hotLinkShare',
      label: 'Hot-link 占比',
      help: 'redirect 中落在当前少数热门 link 上的比例。',
      min: 1,
      max: 99,
      defaultValue: 60,
      scale: 'linear',
      format: 'percentage',
    },
    {
      id: 'codeLength',
      label: 'Short-code 长度',
      help: 'base62 code 的字符数。keyspace 是 62^length。',
      min: 4,
      max: 12,
      defaultValue: 7,
      scale: 'linear',
      unit: '位',
      format: 'count',
    },
    {
      id: 'redirectLatencyMs',
      label: 'Redirect latency 目标',
      help: '发出 redirect 之前解析 short code 的时间预算。',
      min: 1,
      max: 200,
      defaultValue: 50,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'globalRegions',
      label: 'Region 数',
      help: '需要就近为用户提供 redirect 的 region 数量。',
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
      id: 'trackAnalytics',
      label: '记录点击 analytics',
      help: '为 dashboard 记录每次 redirect；但不应拖慢 redirect 本身。',
      defaultValue: false,
    },
    {
      id: 'customAliases',
      label: '允许自定义 alias',
      help: '让用户自己挑 code；这就排除了纯 auto-increment counter。',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'personal',
      step: '01',
      title: '个人小工具',
      summary: '在一张小表上每秒几次 redirect。',
      values: {
        redirectQps: 50,
        createQps: 2,
        totalUrls: 50_000,
        hotLinkShare: 30,
        codeLength: 7,
        redirectLatencyMs: 100,
        globalRegions: 1,
        trackAnalytics: false,
        customAliases: true,
      },
    },
    {
      id: 'going-viral',
      step: '02',
      title: '某个 link 爆火',
      summary: '一个 link 占据了大部分读流量高峰。',
      values: {
        redirectQps: 120_000,
        createQps: 30,
        totalUrls: 2_000_000,
        hotLinkShare: 85,
        codeLength: 7,
        redirectLatencyMs: 40,
        globalRegions: 1,
        trackAnalytics: true,
        customAliases: true,
      },
    },
    {
      id: 'public-api',
      step: '03',
      title: '公开的 shortener API',
      summary: '很多 writer 并发创建 link。',
      values: {
        redirectQps: 200_000,
        createQps: 20_000,
        totalUrls: 200_000_000,
        hotLinkShare: 50,
        codeLength: 7,
        redirectLatencyMs: 30,
        globalRegions: 2,
        trackAnalytics: true,
        customAliases: false,
      },
    },
    {
      id: 'billions-stored',
      step: '04',
      title: '数十亿条 link',
      summary: 'storage 和写入撑爆单个 database。',
      values: {
        redirectQps: 800_000,
        createQps: 50_000,
        totalUrls: 20_000_000_000,
        hotLinkShare: 60,
        codeLength: 8,
        redirectLatencyMs: 25,
        globalRegions: 3,
        trackAnalytics: true,
        customAliases: false,
      },
    },
    {
      id: 'global-fast',
      step: '05',
      title: '全球范围、个位数 ms',
      summary: '全球用户的 redirect 都必须就近解析。',
      values: {
        redirectQps: 3_000_000,
        createQps: 30_000,
        totalUrls: 50_000_000_000,
        hotLinkShare: 70,
        codeLength: 9,
        redirectLatencyMs: 8,
        globalRegions: 8,
        trackAnalytics: true,
        customAliases: false,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'URL shortener 架构图',
    description:
      '白板风格的 URL shortener 架构图：client、edge CDN 和应用服务器、key-generation service 和读 cache、带 shard 的主 mapping store，以及一条异步的 click-analytics stream。',
    columns: [
      {
        id: 'clients',
        label: 'Client',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'redirect + create',
            summary: '点开 short link，并提交新的 long URL 去缩短',
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
            id: 'cdn',
            title: 'Edge / CDN',
            subtitle: '缓存 redirect',
            summary: '就近为用户解析热门 redirect，不用回 origin',
            kind: 'cdn',
          },
          {
            id: 'appServer',
            title: 'App server',
            subtitle: 'redirect + shorten',
            summary: '为 redirect 查 code，并处理 create 请求',
            kind: 'api',
          },
        ],
      },
      {
        id: 'keys',
        label: 'Key + cache',
        variant: 'backbone',
        nodes: [
          {
            id: 'idService',
            title: 'Key service',
            subtitle: '唯一 code',
            summary: '分发无冲突的 short code（区间、Snowflake，或预生成的 key）',
            kind: 'service',
          },
          {
            id: 'cache',
            title: 'Read cache',
            subtitle: '热门 mapping',
            summary: '为热门 link 提供 code 到 URL 的 lookup，让 store 少受压',
            kind: 'cache',
          },
        ],
      },
      {
        id: 'store',
        label: 'Mapping store',
        variant: 'storage',
        nodes: [
          {
            id: 'db',
            title: 'Mapping DB',
            subtitle: 'code 到 URL',
            summary: '持久保存每个 short code 及其 long URL',
            kind: 'db',
          },
          {
            id: 'shards',
            title: 'KV shards',
            subtitle: '按 code 分区',
            summary: '把 mapping 分散到多个 node 上，以扩 storage 和写 throughput',
            kind: 'nosql',
          },
        ],
      },
      {
        id: 'analytics',
        label: 'Analytics',
        variant: 'processing',
        nodes: [
          {
            id: 'events',
            title: 'Click stream',
            subtitle: '异步 event',
            summary: '在 hot path 之外收集 redirect event 供 dashboard 用',
            kind: 'stream',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'cdn', variant: 'primary' },
      { from: 'cdn', to: 'appServer', variant: 'primary' },
      { from: 'appServer', to: 'cache', variant: 'primary' },
      { from: 'appServer', to: 'idService', variant: 'secondary' },
      { from: 'appServer', to: 'db', variant: 'direct' },
      { from: 'cache', to: 'db', variant: 'secondary' },
      { from: 'idService', to: 'db', variant: 'secondary' },
      { from: 'db', to: 'shards', variant: 'secondary' },
      { from: 'appServer', to: 'events', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'readPath', label: '读路径负载' },
    { id: 'writePath', label: '写路径负载' },
    { id: 'storage', label: 'Mapping storage' },
    { id: 'keyspace', label: 'Code keyspace 填充率' },
    { id: 'geoLatency', label: '全球 redirect latency' },
  ],
  decisions: [
    { id: 'cache', title: 'Read cache' },
    { id: 'idStrategy', title: 'Code 生成' },
    { id: 'store', title: 'Mapping store' },
    { id: 'sharding', title: 'Storage sharding' },
    { id: 'edge', title: 'Edge redirect' },
    { id: 'analytics', title: 'Click analytics' },
  ],
  sourceBackedRules: [
    {
      title: 'URL shortener 由读（redirect）主导，而不是写',
      source: 'System Design Primer',
      url: 'https://github.com/donnemartin/system-design-primer',
      summary:
        '经典写法把 redirect lookup 当成高流量路径，link 创建相对罕见，所以才先做读扩展。',
    },
    {
      title: 'Cache-aside 让热门读不打到 database',
      source: 'Azure Architecture',
      url: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside',
      summary:
        'cache-aside 模式按需把数据加载进 cache；对倾斜的 redirect 流量，一个小 cache 就能吸收掉大部分 lookup。',
    },
    {
      title: 'Redis 是热门 key-value lookup 常用的 in-memory store',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/develop/',
      summary:
        'in-memory 的 point lookup 能以亚毫秒 latency 服务热门 short code，远低于基于磁盘的 store。',
    },
    {
      title: 'CDN 从离用户近的位置提供可缓存的响应',
      source: 'AWS CloudFront',
      url: 'https://aws.amazon.com/cloudfront/',
      summary:
        '热门 link 的 redirect 可以在 edge 缓存，对全球用户能省掉跨 region 的往返。',
    },
  ],
  teachingAssumptions: [
    'redirect 被建模成可缓存的 point lookup；cache 命中率由 hot-link 占比估算。',
    '单 node 的读、写、storage 预算是保守的教学数字，不是厂商上限。',
    'Code keyspace 填充率用 base62^length 计算；真实系统还会给每个 ID server 预留 key 区间来避免冲突。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-box',
      step: '01',
      focus: '一个用户，一台机器',
      scenarioId: 'personal',
      question:
        '一个个人 shortener 在 50k link 上做约 50 redirects/s。除了一个 app server 加一个 database，你还需要别的吗？',
      reveal:
        '不需要。redirect 是一次 primary-key point lookup，50 reads/s 对一张带 index 的表来说微不足道。cache、key service 和 sharding 在这里都太超前——它们增加了零件，却没有负载能为之买单。',
      takeaway: '从最简单的正确设计开始：一个 app server 后面挂一张带 index 的表。',
    },
    {
      id: 'viral',
      step: '02',
      focus: '某个 link 爆火',
      scenarioId: 'going-viral',
      question:
        '一个 link 突然占据了 120k redirects/s 里的 85%。什么会先饱和，最便宜的解法是什么？',
      reveal:
        'database 的读路径会先饱和。但流量极度倾斜，所以一层 cache-aside（或 CDN edge）能以非常高的命中率吸收掉热门 link——store 只会看到长尾的 miss。',
      takeaway: 'redirect 是可缓存的；倾斜让一个小 cache 就能吃下大部分读流量。',
    },
    {
      id: 'writers',
      step: '03',
      focus: '公开 API，很多 writer',
      scenarioId: 'public-api',
      question:
        '现在有 20k 个新 link/s 从很多 server 涌来。为什么不让每个 server INSERT 一个随机 code、冲突就重试？',
      reveal:
        '随机加冲突检测会浪费往返，表越满竞态越严重。高 create 速率需要专门的策略：分给每个 server 的 counter 区间、Snowflake 风格的 ID，或一个预先铸 code 的 key-generation service。自定义 alias 仍然得单独检查唯一性。',
      takeaway: '在高 create 速率下，生成唯一 code 本身就变成了一个协调问题。',
    },
    {
      id: 'billions',
      step: '04',
      focus: '数十亿条 link',
      scenarioId: 'billions-stored',
      question:
        '200 亿条 mapping、每条约 500 bytes 就是约 10 TB，还有 50k writes/s。一个 database 装得下、扛得住吗？',
      reveal:
        '装不下——storage 和写 throughput 都超出单 node，所以你要按 code 做 shard，或换成可水平扩展的 KV store；纯 point-lookup 的访问模式正好完美契合 KV。在这个规模下 7 字符的 base62 code 也快填满了，所以要加长 code，让冲突保持罕见。',
      takeaway: '当 storage 和写都撑爆单 node 时，按 key 做 shard，落到一个为 point lookup 而生的 KV store。',
    },
    {
      id: 'global',
      step: '05',
      focus: '全球范围、个位数 ms',
      scenarioId: 'global-fast',
      question:
        '全球用户都期望低于 10 ms 的 redirect。单 region 里的一个 sharded KV store 够吗？',
      reveal:
        '不够——光是跨 region 的网络 latency 就把预算花光了。把 mapping replicate 到 edge/CDN cache 和多个 region，让 redirect 就近解析。create 可以保持集中，因为它罕见、也能容忍更高的 latency。',
      takeaway: '要做全球低 latency 的读，就把 mapping 推到 edge；把罕见的写留在容易保证 consistency 的地方。',
    },
  ],
  analyze: analyzeUrlShortenerWorkload,
};

function analyzeUrlShortenerWorkload(workload: WorkloadValues): LabAnalysis {
  const redirectQps = numericValue(workload, 'redirectQps');
  const createQps = numericValue(workload, 'createQps');
  const totalUrls = numericValue(workload, 'totalUrls');
  const hotLinkShare = numericValue(workload, 'hotLinkShare');
  const codeLength = numericValue(workload, 'codeLength');
  const redirectLatencyMs = numericValue(workload, 'redirectLatencyMs');
  const globalRegions = numericValue(workload, 'globalRegions');
  const trackAnalytics = Boolean(workload.trackAnalytics);
  const customAliases = Boolean(workload.customAliases);

  const needsCache = redirectQps > 3_000 || hotLinkShare >= 45;
  const needsCdn = globalRegions > 1 || redirectLatencyMs <= 20 || redirectQps > 150_000;
  const needsIdService = createQps > singleCounterCreateBudget;
  const keyspace = Math.pow(62, codeLength);
  const keyspaceFill = totalUrls / keyspace;
  const needsLongerCode = keyspaceFill > 0.25;
  const storageGigabytes = (totalUrls * bytesPerMapping) / 1_000_000_000;
  const needsSharding =
    storageGigabytes > comfortableStorageGigabytes ||
    createQps > comfortableDbWritesPerSecond ||
    totalUrls > 1_000_000_000;
  const needsEvents = trackAnalytics;

  const cacheServedShare = needsCache ? Math.min(hotLinkShare / 100, 0.985) : 0;
  const dbRedirectReads = redirectQps * (1 - cacheServedShare);
  const geoPressure = Math.max(
    (globalRegions - 1) / 3,
    redirectLatencyMs <= 30 ? 30 / redirectLatencyMs / 3 : 0,
  );

  const flags = {
    needsCache,
    needsCdn,
    needsIdService,
    needsSharding,
    needsLongerCode,
    needsEvents,
    customAliases,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      cdn: needsCdn ? 'needed' : 'inactive',
      appServer: 'ok',
      idService: needsIdService ? 'needed' : 'inactive',
      cache: needsCache ? 'needed' : 'inactive',
      db: needsSharding ? 'warning' : 'ok',
      shards: needsSharding ? 'needed' : 'inactive',
      events: needsEvents ? 'needed' : 'inactive',
    },
    flowStates: {
      clientToCdn: 'active',
      cdnToAppServer: 'active',
      appServerToCache: needsCache ? 'active' : 'inactive',
      appServerToIdService: needsIdService ? 'active' : 'inactive',
      appServerToDb: needsCache ? 'inactive' : 'active',
      cacheToDb: needsCache ? 'active' : 'inactive',
      idServiceToDb: needsIdService ? 'active' : 'inactive',
      dbToShards: needsSharding ? 'active' : 'inactive',
      appServerToEvents: needsEvents ? 'active' : 'inactive',
    },
    meters: {
      readPath: {
        ratio: dbRedirectReads / comfortableDbReadsPerSecond,
        valueText: `${formatRate(dbRedirectReads)}/s`,
        copy: needsCache
          ? `cache 吸收掉热门那部分；store 仍然会看到约 ${formatRate(dbRedirectReads)}/s 的 miss。`
          : '没有 cache 层时，每次 redirect 都直接打到 database。',
      },
      writePath: {
        ratio: createQps / comfortableDbWritesPerSecond,
        valueText: `${formatRate(createQps)}/s`,
        copy: '新 link 是持久写，外加一次唯一 code 的分配。',
      },
      storage: {
        ratio: storageGigabytes / comfortableStorageGigabytes,
        valueText: formatStorageGigabytes(storageGigabytes),
        copy: `${formatCount(totalUrls)} 条 mapping，每条约 ${bytesPerMapping} bytes。`,
      },
      keyspace: {
        ratio: keyspaceFill / 0.5,
        valueText: formatRatio(keyspaceFill),
        copy: `${formatCount(totalUrls)} 条 link 对应 62^${Math.round(codeLength)} 的 keyspace；越满冲突越多。`,
      },
      geoLatency: {
        ratio: geoPressure,
        valueText: `${formatCount(globalRegions)} 个 region`,
        copy:
          redirectLatencyMs <= 30 || globalRegions > 1
            ? '跨 region 的紧 latency 目标把 redirect 推向 edge 和 replicated 读。'
            : '单 region 加宽松的 latency 目标，暂时还不需要 edge replication。',
      },
    },
    decisions: buildDecisions({
      ...flags,
      redirectQps,
      hotLinkShare,
      createQps,
      codeLength,
    }),
    reasons: buildReasons({
      ...flags,
      redirectQps,
      hotLinkShare,
      createQps,
      dbRedirectReads,
      storageGigabytes,
      totalUrls,
      codeLength,
      keyspaceFill,
      globalRegions,
      redirectLatencyMs,
    }),
  };
}

type ArchitectureFlags = {
  needsCache: boolean;
  needsCdn: boolean;
  needsIdService: boolean;
  needsSharding: boolean;
  needsLongerCode: boolean;
  needsEvents: boolean;
  customAliases: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    redirectQps: number;
    hotLinkShare: number;
    createQps: number;
    dbRedirectReads: number;
    storageGigabytes: number;
    totalUrls: number;
    codeLength: number;
    keyspaceFill: number;
    globalRegions: number;
    redirectLatencyMs: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsCache) {
    reasons.push({
      severity: analysis.dbRedirectReads > comfortableDbReadsPerSecond ? 'danger' : 'warning',
      text: `${formatRate(analysis.redirectQps)}/s 的 redirect、配上 ${Math.round(
        analysis.hotLinkShare,
      )}% 的 hot-link 倾斜，应该由 cache 来服务；只有 miss 才打到 store。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '读量足够低，database 不用 cache 就能直接服务 redirect。',
    });
  }

  if (analysis.needsIdService) {
    reasons.push({
      severity: 'warning',
      text: `${formatRate(
        analysis.createQps,
      )}/s 的 create 需要一个真正的 code-generation 策略（counter 区间、Snowflake，或 key service），而不是随机加重试。`,
    });
  }

  if (analysis.customAliases) {
    reasons.push({
      severity: 'ok',
      text: '自定义 alias 排除了纯 auto-increment counter，所以 code 空间和唯一性检查必须并存。',
    });
  }

  if (analysis.needsSharding) {
    reasons.push({
      severity: analysis.storageGigabytes > comfortableStorageGigabytes * 2 ? 'danger' : 'warning',
      text: `${formatCount(analysis.totalUrls)} 条 mapping（约 ${formatStorageGigabytes(
        analysis.storageGigabytes,
      )}）加上写速率超出了单 node；按 code 做 shard，落进 KV store。`,
    });
  }

  if (analysis.needsLongerCode) {
    reasons.push({
      severity: 'warning',
      text: `${Math.round(analysis.codeLength)} 字符的 code 已经填到 ${formatRatio(
        analysis.keyspaceFill,
      )} 满了；加长 code，让生成保持无冲突。`,
    });
  }

  if (analysis.needsCdn) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.globalRegions)} 个 region 加上 ${Math.round(
        analysis.redirectLatencyMs,
      )} ms 的目标，把 redirect 推向 edge 和 replicated 读。`,
    });
  }

  if (analysis.needsEvents) {
    reasons.push({
      severity: 'ok',
      text: 'Click analytics 通过一条 event stream 异步写入，所以从不拖慢 redirect。',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    redirectQps: number;
    hotLinkShare: number;
    createQps: number;
    codeLength: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  const idStrategyCopy = flags.customAliases
    ? '同时允许自定义 alias 和生成的 code；两者都要做唯一性检查，所以光靠 counter 不行。'
    : flags.needsIdService
      ? `用 counter 区间、Snowflake 风格的 ID，或一个 key service 来生成 code，吸收 ${formatRate(
          flags.createQps,
        )}/s 的 create 而不产生争用。`
      : 'create 量低的时候，一个简单的 counter 或随机 base62 code 就够了。';

  return {
    cache: {
      state: flags.needsCache ? 'needed' : 'not-yet',
      copy: flags.needsCache
        ? '对热门 mapping 做 cache-aside（Redis）；只有 miss 才落到 store。'
        : '暂时没有 cache——database 直接服务这点读量。',
    },
    idStrategy: {
      state: flags.customAliases ? 'tradeoff' : flags.needsIdService ? 'needed' : 'useful',
      copy: idStrategyCopy,
    },
    store: {
      state: flags.needsSharding ? 'needed' : 'useful',
      copy: flags.needsSharding
        ? '用一个可水平扩展的 KV store；访问模式是纯粹按 code 的 point lookup。'
        : '只要还能装在单 node 上，一个 relational 或 KV store 就能放下所有 mapping。',
    },
    sharding: {
      state: flags.needsSharding ? 'needed' : 'not-yet',
      copy: flags.needsSharding
        ? '按 short code 做 shard，让 storage 和写 throughput 水平扩展。'
        : '在 storage 或写速率证明不够之前，单 node 就足够了。',
    },
    edge: {
      state: flags.needsCdn ? 'needed' : 'not-yet',
      copy: flags.needsCdn
        ? '从 CDN/edge cache 提供 redirect，并把 mapping replicate 到离用户近的地方。'
        : '只要 latency 目标宽松、流量本地化，单 region 就够了。',
    },
    analytics: {
      state: flags.needsEvents ? 'useful' : 'not-yet',
      copy: flags.needsEvents
        ? '把 redirect event 发到一条 stream 上离线聚合；让 hot path 不带同步开销。'
        : 'Click analytics 关着，所以 redirect 路径保持单次 lookup。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsCdn && !flags.needsIdService) {
    return '单 app + database';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsCache)) {
    return '多 region edge + sharded KV store';
  }
  if (flags.needsSharding) {
    return 'Cache-aside 读 + sharded KV store';
  }
  if (flags.needsCache) {
    return 'Cache-aside 读 + 单 database';
  }
  return '单 app + database';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsCdn && !flags.needsIdService) {
    return '一个 app server 加一张带 index 的表，就能解析每次 redirect 并存下每个新 link。其他东西暂时都还不必要。';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsCache)) {
    return '热门 redirect 在离用户近的 edge 解析，而 sharded KV store 加一套 code-generation 策略在中心统一处理规模和持久写。';
  }
  if (flags.needsSharding) {
    return '一个 cache 吸收倾斜的读流量，mapping store 按 code 做 shard，让 storage 和写都水平扩展。';
  }
  if (flags.needsCache) {
    return '一层 cache-aside 服务热门 link，于是单个 database 只用处理 miss 和这点写量。';
  }
  return '一个 app server 加一个 database 仍然能覆盖这份 workload。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsCdn && !flags.needsIdService) {
    return 'Redirect -> app server -> database';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsCache)) {
    return 'Redirect -> edge cache -> app server -> cache -> sharded KV';
  }
  if (flags.needsSharding) {
    return 'Redirect -> app server -> cache -> sharded KV（miss）';
  }
  if (flags.needsCache) {
    return 'Redirect -> app server -> cache -> database（miss）';
  }
  return 'Redirect -> app server -> database';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
