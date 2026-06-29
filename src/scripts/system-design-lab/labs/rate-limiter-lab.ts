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

const atomicStoreBudgetPerSecond = 120_000;
const hotKeyComfortableRps = 5_000;
const stateBytesPerKey = 112;
const comfortableStateGigabytes = 4;

export const rateLimiterLabDefinition: SystemDesignLabDefinition = {
  id: 'rate-limiter',
  eyebrow: '系统设计 Lab',
  title: 'Rate limiter 设计本质是一个对 latency 敏感的 atomic state 问题。',
  summary:
    '调节请求量、quota、burst 容忍度、key cardinality、hot-key 倾斜、region 数量和 latency 目标。架构会从本地 counter 逐步演进到 Redis/Lua、sharded state、本地 pre-check，当全局正确性变得重要时再加上一个 quota service。',
  articleHref: '/blog/system-design/rate-limiter/',
  controls: [
    {
      id: 'requestsPerSecond',
      label: '请求速率',
      help: 'enforcement 路径上同步的 allow/deny 判定。',
      min: 10,
      max: 1_000_000,
      defaultValue: 500,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'quotaPerMinute',
      label: '每个 key 的 quota',
      help: '一个 enforcement key 在一分钟窗口内允许的请求数。',
      min: 1,
      max: 100_000,
      defaultValue: 60,
      scale: 'log',
      format: 'requests-per-minute',
    },
    {
      id: 'burstAllowanceSeconds',
      label: 'Burst 容忍度',
      help: '在稳态 quota 之上，能容忍多少短时 burst。',
      min: 0,
      max: 300,
      defaultValue: 10,
      scale: 'linear',
      format: 'duration-seconds',
    },
    {
      id: 'apiServerCount',
      label: 'API server 数',
      help: '各自独立做 allow/deny 判定的 server。',
      min: 1,
      max: 500,
      defaultValue: 4,
      scale: 'log',
      unit: '台',
      format: 'count',
    },
    {
      id: 'keyCardinality',
      label: '活跃 key 数',
      help: '带 limiter state 的不同用户、IP、API key、设备或广告主账户数。',
      min: 100,
      max: 50_000_000,
      defaultValue: 25_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'hottestKeyShare',
      label: '最热 key 占比',
      help: '一个滥用或热门 key 能占据多少总流量。',
      min: 0.1,
      max: 80,
      defaultValue: 3,
      scale: 'linear',
      format: 'percentage',
    },
    {
      id: 'globalRegions',
      label: 'Region 数',
      help: '必须参与 enforcement 的 region 数量。',
      min: 1,
      max: 20,
      defaultValue: 1,
      scale: 'linear',
      unit: '个',
      format: 'count',
    },
    {
      id: 'decisionLatencyMs',
      label: 'Decision latency 目标',
      help: '在 backend 请求继续之前，limiter 判定的时间预算。',
      min: 1,
      max: 200,
      defaultValue: 10,
      scale: 'log',
      format: 'milliseconds',
    },
  ],
  toggles: [
    {
      id: 'strictGlobalQuota',
      label: '严格全局 quota',
      help: '所有 region 共享一个精确 quota，而不是各 region 大致分配预算。',
      defaultValue: false,
    },
    {
      id: 'failClosedOnStoreError',
      label: 'store 出错时 fail closed',
      help: 'limiter state 不可用时拒绝请求；对滥用更安全，但对可用性更冒险。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-process',
      step: '01',
      title: '单进程',
      summary: '对小服务来说，本地内存就够了。',
      values: {
        requestsPerSecond: 80,
        quotaPerMinute: 60,
        burstAllowanceSeconds: 10,
        apiServerCount: 1,
        keyCardinality: 500,
        hottestKeyShare: 5,
        globalRegions: 1,
        decisionLatencyMs: 20,
        strictGlobalQuota: false,
        failClosedOnStoreError: false,
      },
    },
    {
      id: 'api-fleet',
      step: '02',
      title: 'API 集群',
      summary: '多台 server 需要一条 atomic 的 check-and-update 路径。',
      values: {
        requestsPerSecond: 5_000,
        quotaPerMinute: 600,
        burstAllowanceSeconds: 20,
        apiServerCount: 12,
        keyCardinality: 120_000,
        hottestKeyShare: 2,
        globalRegions: 1,
        decisionLatencyMs: 10,
        strictGlobalQuota: false,
        failClosedOnStoreError: true,
      },
    },
    {
      id: 'bursty-api',
      step: '03',
      title: '突发型公开 API',
      summary: 'token bucket 行为加本地 pre-check 降低 latency。',
      values: {
        requestsPerSecond: 80_000,
        quotaPerMinute: 1_200,
        burstAllowanceSeconds: 60,
        apiServerCount: 80,
        keyCardinality: 2_000_000,
        hottestKeyShare: 3,
        globalRegions: 2,
        decisionLatencyMs: 5,
        strictGlobalQuota: false,
        failClosedOnStoreError: false,
      },
    },
    {
      id: 'hot-key-abuse',
      step: '04',
      title: 'Hot key 滥用',
      summary: '一个 key 若不隔离或分桶，就能把一个 shard 压垮。',
      values: {
        requestsPerSecond: 140_000,
        quotaPerMinute: 120,
        burstAllowanceSeconds: 10,
        apiServerCount: 120,
        keyCardinality: 800_000,
        hottestKeyShare: 40,
        globalRegions: 2,
        decisionLatencyMs: 8,
        strictGlobalQuota: false,
        failClosedOnStoreError: true,
      },
    },
    {
      id: 'global-strict',
      step: '05',
      title: '全局严格 quota',
      summary: '精确的跨 region enforcement，用 latency 换正确性。',
      values: {
        requestsPerSecond: 300_000,
        quotaPerMinute: 600,
        burstAllowanceSeconds: 2,
        apiServerCount: 220,
        keyCardinality: 6_000_000,
        hottestKeyShare: 8,
        globalRegions: 6,
        decisionLatencyMs: 20,
        strictGlobalQuota: true,
        failClosedOnStoreError: true,
      },
    },
  ],
  diagram: {
    title: 'Rate limiter 架构图',
    description:
      '白板风格的架构图，展示同步的 rate-limit enforcement、本地 pre-check、Redis Lua state、sharding、quota service、转发到 backend，以及 analytics event。',
    viewBox: '0 0 1040 560',
    zones: [
      { id: 'clients', label: 'Client', x: 20, y: 70, width: 150, height: 360, variant: 'clients' },
      { id: 'edge', label: 'Edge / API', x: 210, y: 45, width: 190, height: 410, variant: 'edge' },
      { id: 'state', label: 'Limiter state', x: 440, y: 70, width: 190, height: 385, variant: 'backbone' },
      { id: 'quota', label: '协调', x: 670, y: 70, width: 165, height: 385, variant: 'processing' },
      { id: 'service', label: 'Service + analytics', x: 875, y: 45, width: 145, height: 440, variant: 'storage' },
    ],
    flows: [
      { id: 'clientToGateway', path: 'M155 245 C190 245 190 155 225 155', variant: 'primary' },
      { id: 'gatewayToLocal', path: 'M300 195 L300 260', variant: 'primary' },
      { id: 'localToRedis', path: 'M375 310 C415 310 420 210 455 210', variant: 'primary' },
      { id: 'redisToShardRouter', path: 'M540 255 L540 330', variant: 'secondary' },
      { id: 'shardsToQuotaService', path: 'M620 370 C650 370 650 250 685 250', variant: 'secondary' },
      { id: 'quotaToBackend', path: 'M820 250 C850 250 850 160 890 160', variant: 'primary' },
      { id: 'gatewayToBackend', path: 'M375 165 C560 112 735 118 890 160', variant: 'direct' },
      { id: 'gatewayToEvents', path: 'M360 332 C520 455 730 438 890 420', variant: 'secondary' },
      { id: 'redisToBackend', path: 'M620 210 C720 172 790 160 890 160', variant: 'primary' },
      { id: 'quotaToEvents', path: 'M760 295 C805 360 840 405 890 420', variant: 'secondary' },
    ],
    nodes: [
      { id: 'client', title: 'Client', subtitle: '请求 burst', kind: 'client', x: 48, y: 210, width: 108, height: 92 },
      { id: 'gateway', title: 'API gateway', subtitle: '在 app 之前 enforce', kind: 'lb', x: 225, y: 120, width: 150, height: 90 },
      { id: 'localLimiter', title: 'Local check', subtitle: '廉价预过滤', kind: 'service', x: 225, y: 260, width: 150, height: 88 },
      { id: 'redis', title: 'Redis Lua', subtitle: 'atomic state 更新', kind: 'cache', x: 455, y: 175, width: 140, height: 90 },
      { id: 'shards', title: 'Shard router', subtitle: 'key -> state shard', kind: 'scheduler', x: 455, y: 330, width: 140, height: 88 },
      { id: 'quotaService', title: 'Quota service', subtitle: '全局预算', kind: 'service', x: 685, y: 220, width: 130, height: 92 },
      { id: 'backend', title: 'Backend', subtitle: '只放行允许的流量', kind: 'api', x: 890, y: 125, width: 112, height: 86 },
      { id: 'events', title: 'Events', subtitle: '滥用 + 调优', kind: 'stream', x: 890, y: 400, width: 112, height: 82 },
    ],
    mobileStages: [
      {
        label: 'Client',
        nodes: [{ id: 'client', title: 'Client', summary: '发出必须得到同步 allow 或 deny 的流量' }],
      },
      {
        label: 'Edge / API',
        nodes: [
          { id: 'gateway', title: 'API gateway', summary: '在调用 backend 之前执行 enforcement' },
          { id: 'localLimiter', title: 'Local pre-check', summary: '对低风险或已缓存 state 的快速进程内检查' },
        ],
      },
      {
        label: 'Limiter state',
        nodes: [
          { id: 'redis', title: 'Redis Lua', summary: '为分布式 server 提供 atomic 的 check-and-update' },
          { id: 'shards', title: 'Shard router', summary: '分散 key state 并隔离 hot key' },
        ],
      },
      {
        label: '协调',
        nodes: [{ id: 'quotaService', title: 'Quota service', summary: '协调严格全局或各 region 的预算' }],
      },
      {
        label: 'Service + analytics',
        nodes: [
          { id: 'backend', title: 'Backend', summary: '只接收允许的流量' },
          { id: 'events', title: 'Events', summary: '记录判定结果，供滥用分析和调优' },
        ],
      },
    ],
  },
  meters: [
    { id: 'atomicPath', label: 'Atomic 路径负载' },
    { id: 'hotKey', label: 'Hot-key 压力' },
    { id: 'stateMemory', label: 'State 内存' },
    { id: 'crossRegion', label: '跨 region 正确性' },
    { id: 'latencyBudget', label: 'Latency 预算' },
  ],
  decisions: [
    { id: 'algorithm', title: 'Limiter 算法' },
    { id: 'localMemory', title: '本地内存' },
    { id: 'redisLua', title: 'Redis + Lua' },
    { id: 'sharding', title: 'State sharding' },
    { id: 'globalQuota', title: '全局 quota' },
    { id: 'failMode', title: 'Fail 模式' },
  ],
  sourceBackedRules: [
    {
      title: 'atomic 自增加上过期是最简单的 rate-limiter 基线',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/commands/incr/',
      summary:
        'Redis 文档用 INCR 和 key 过期描述了基于 counter 的 rate limiter 模式，正好对应单窗口的基线。',
    },
    {
      title: 'Lua 脚本让 check-and-update 在单个 Redis shard 上 atomic',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/develop/programmability/eval-intro/',
      summary:
        '当很多 API server 在竞争时，limiter 不应该把读、算、写做成各自独立的网络操作。',
    },
    {
      title: '生产环境的 rate limiting 通常在 origin 之前执行',
      source: 'Cloudflare Docs',
      url: 'https://developers.cloudflare.com/waf/rate-limiting-rules/',
      summary:
        'edge enforcement 在花费 origin 资源之前就判定请求能否继续，从而保护 backend。',
    },
    {
      title: '分布式 rate limiting 有明确的 local 对 global 权衡',
      source: 'Envoy Docs',
      url: 'https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_features/global_rate_limiting',
      summary:
        'global rate limiting 把判定集中起来，而 local 检查更快，但跨多 instance 或多 region 时不够精确。',
    },
  ],
  teachingAssumptions: [
    '这个 lab 建模的是同步 enforcement 路径；Kafka 风格的 event stream 用于 analytics、滥用调查和调优。',
    'Hot-key 阈值刻意保守，因为即使总 QPS 看起来安全，一个滥用 key 也可能主导一个 shard。',
    '跨 region 的严格全局 quota 被建模成一种正确性选择，它会花掉 latency 和可用性预算。',
  ],
  teachingWalkthrough: [
    {
      id: 'single',
      step: '01',
      focus: '一台 server',
      scenarioId: 'single-process',
      question:
        '一个单服务对 500 个 key 做约 80 checks/s。counter 放哪里？还需要别的吗？',
      reveal:
        '只要每个判定都由一个进程独占，进程内的 map 既正确又最快——没有跨 instance 的竞态，所以 Redis、sharding 和 quota service 在这里都太超前。',
      takeaway: '只有一个决策者时，本地 in-memory counter 就是正确的基线。',
    },
    {
      id: 'fleet',
      step: '02',
      focus: '多台 server 在竞争',
      scenarioId: 'api-fleet',
      question:
        '现在有 12 台 server 对同一个 key 做 enforcement。为什么各进程的 counter 会给出错误答案，最小的修复是什么？',
      reveal:
        '各自独立的 counter 每个都放行完整 quota，于是真实上限被集群规模乘了一遍。你需要一份共享的 atomic check-and-update——Redis 配 Lua 脚本把读-判定-写变成单个操作，而不是一场竞态。',
      takeaway: '分布式 enforcement 需要一份 atomic 的 check-and-update，而不是各进程各自的 state。',
    },
    {
      id: 'bursty',
      step: '03',
      focus: 'Burst + 紧 latency',
      scenarioId: 'bursty-api',
      question:
        '一个公开 API 允许短时 burst，并希望个位数 ms 的判定。算法和路径要变什么？',
      reveal:
        'token bucket 能容忍 burst 直到 refill 上限；而紧的 latency 预算倾向于在访问远端 store 之前先做一次本地 pre-check（或缓存的授权），让大部分请求都不用付那次网络往返。',
      takeaway: '紧 latency 把工作推到本地；burst 容忍度决定算法（token bucket）。',
    },
    {
      id: 'hot-key',
      step: '04',
      focus: '一个 key 被狂打',
      scenarioId: 'hot-key-abuse',
      question:
        '总 QPS 看起来安全，但一个滥用 key 占了其中的 40%。按 key 做 sharding 能解决这个问题吗？',
      reveal:
        'sharding 分散的是总负载，但单个 hot key 仍然映射到一个 shard，照样能把它压垮。hot key 需要在 sharding 之上再加隔离、本地预过滤，或按 key 分桶。',
      takeaway: 'sharding 扩展的是总量，不是倾斜；hot key 需要自己的处理方式。',
    },
    {
      id: 'global',
      step: '05',
      focus: '精确的全局 quota',
      scenarioId: 'global-strict',
      question:
        '六个 region 必须共享一个精确 quota。为什么这是最贵的选项，什么时候才值得？',
      reveal:
        '精确的全局计数需要跨 region 协调（或预先分配各 region 的预算），这会花掉 latency 和可用性。只有当超额代价高昂时才值得；否则各 region 的近似 enforcement 更快、也更可用。',
      takeaway: '严格的全局正确性是用 latency 和可用性换来的——要有意识地选择它。',
    },
  ],
  analyze: analyzeRateLimiterWorkload,
};

function analyzeRateLimiterWorkload(workload: WorkloadValues): LabAnalysis {
  const requestsPerSecond = numericValue(workload, 'requestsPerSecond');
  const quotaPerMinute = numericValue(workload, 'quotaPerMinute');
  const burstAllowanceSeconds = numericValue(workload, 'burstAllowanceSeconds');
  const apiServerCount = numericValue(workload, 'apiServerCount');
  const keyCardinality = numericValue(workload, 'keyCardinality');
  const hottestKeyShare = numericValue(workload, 'hottestKeyShare');
  const globalRegions = numericValue(workload, 'globalRegions');
  const decisionLatencyMs = numericValue(workload, 'decisionLatencyMs');
  const strictGlobalQuota = Boolean(workload.strictGlobalQuota);
  const failClosedOnStoreError = Boolean(workload.failClosedOnStoreError);

  const allowedPerKeySecond = Math.max(quotaPerMinute / 60, 0.1);
  const hotKeyRequestsPerSecond = requestsPerSecond * (hottestKeyShare / 100);
  const burstTokens = allowedPerKeySecond * burstAllowanceSeconds;
  const stateGigabytes = (keyCardinality * stateBytesPerKey) / 1_000_000_000;
  const distributedServers = apiServerCount > 1;
  const latencyPressure = (distributedServers ? 4 : 1) / Math.max(decisionLatencyMs, 1);
  const crossRegionPressure = strictGlobalQuota
    ? globalRegions / 3
    : Math.max(0, globalRegions - 1) / 10;

  const needsLocalOnly =
    !distributedServers && requestsPerSecond < 1_000 && keyCardinality < 20_000 && !strictGlobalQuota;
  const needsRedisLua = !needsLocalOnly;
  const needsTokenBucket = burstAllowanceSeconds >= 5;
  const needsSlidingWindow = burstAllowanceSeconds < 5 || strictGlobalQuota;
  const needsSharding =
    requestsPerSecond > atomicStoreBudgetPerSecond * 0.55 ||
    keyCardinality > 1_000_000 ||
    hotKeyRequestsPerSecond > hotKeyComfortableRps;
  const needsLocalPrecheck =
    requestsPerSecond > 80_000 || decisionLatencyMs <= 5 || hotKeyRequestsPerSecond > hotKeyComfortableRps;
  const needsGlobalQuotaService = strictGlobalQuota && globalRegions > 1;
  const needsEvents = requestsPerSecond > 5_000 || hottestKeyShare >= 10;

  return {
    architectureTitle: chooseArchitectureTitle({
      needsLocalOnly,
      needsRedisLua,
      needsSharding,
      needsLocalPrecheck,
      needsGlobalQuotaService,
    }),
    architectureSummary: chooseArchitectureSummary({
      needsLocalOnly,
      needsRedisLua,
      needsSharding,
      needsLocalPrecheck,
      needsGlobalQuotaService,
    }),
    architecturePath: chooseArchitecturePath({
      needsLocalOnly,
      needsRedisLua,
      needsSharding,
      needsLocalPrecheck,
      needsGlobalQuotaService,
    }),
    nodeStates: {
      client: 'ok',
      gateway: 'ok',
      localLimiter: needsLocalOnly || needsLocalPrecheck ? 'needed' : 'inactive',
      redis: needsRedisLua ? 'needed' : 'inactive',
      shards: needsSharding ? 'needed' : 'inactive',
      quotaService: needsGlobalQuotaService ? 'needed' : 'inactive',
      backend: 'ok',
      events: needsEvents ? 'needed' : 'inactive',
    },
    flowStates: {
      clientToGateway: 'active',
      gatewayToLocal: needsLocalOnly || needsLocalPrecheck ? 'active' : 'inactive',
      localToRedis: needsRedisLua ? 'active' : 'inactive',
      redisToShardRouter: needsSharding ? 'active' : 'inactive',
      shardsToQuotaService: needsGlobalQuotaService ? 'active' : 'inactive',
      quotaToBackend: needsGlobalQuotaService ? 'active' : 'inactive',
      gatewayToBackend: needsRedisLua ? 'inactive' : 'active',
      gatewayToEvents: needsEvents ? 'active' : 'inactive',
      redisToBackend: needsRedisLua && !needsGlobalQuotaService ? 'active' : 'inactive',
      quotaToEvents: needsGlobalQuotaService && needsEvents ? 'active' : 'inactive',
    },
    meters: {
      atomicPath: {
        ratio: requestsPerSecond / atomicStoreBudgetPerSecond,
        valueText: `${formatRate(requestsPerSecond)}/s`,
        copy: '每个请求都需要一次同步判定；远端的 atomic store 可能成为 critical path。',
      },
      hotKey: {
        ratio: hotKeyRequestsPerSecond / Math.max(hotKeyComfortableRps, allowedPerKeySecond),
        valueText: `${formatRate(hotKeyRequestsPerSecond)}/s`,
        copy: `${hottestKeyShare.toFixed(1)}% 的总流量都映射到一个 enforcement key 上。`,
      },
      stateMemory: {
        ratio: stateGigabytes / comfortableStateGigabytes,
        valueText: formatStorageGigabytes(stateGigabytes),
        copy: `${formatCount(keyCardinality)} 个活跃 key，每个约 ${stateBytesPerKey} bytes 的 limiter state。`,
      },
      crossRegion: {
        ratio: crossRegionPressure,
        valueText: `${formatCount(globalRegions)} 个 region`,
        copy: strictGlobalQuota
          ? '严格全局 quota 需要跨 region 协调，或预先分配各 region 的预算。'
          : '各 region 的近似 enforcement 更快，但可能短暂超过全局 quota。',
      },
      latencyBudget: {
        ratio: latencyPressure,
        valueText: `${Math.round(decisionLatencyMs)} ms`,
        copy: '更低的 latency 目标会推向本地 pre-check、就近部署的 Redis shard，或近似 enforcement。',
      },
    },
    decisions: buildDecisions({
      needsLocalOnly,
      needsRedisLua,
      needsSharding,
      needsLocalPrecheck,
      needsGlobalQuotaService,
      needsTokenBucket,
      needsSlidingWindow,
      strictGlobalQuota,
      failClosedOnStoreError,
      burstTokens,
    }),
    reasons: buildReasons({
      requestsPerSecond,
      apiServerCount,
      allowedPerKeySecond,
      hotKeyRequestsPerSecond,
      hottestKeyShare,
      keyCardinality,
      globalRegions,
      decisionLatencyMs,
      needsLocalOnly,
      needsRedisLua,
      needsSharding,
      needsLocalPrecheck,
      needsGlobalQuotaService,
      strictGlobalQuota,
      failClosedOnStoreError,
    }),
  };
}

function buildReasons(analysis: {
  requestsPerSecond: number;
  apiServerCount: number;
  allowedPerKeySecond: number;
  hotKeyRequestsPerSecond: number;
  hottestKeyShare: number;
  keyCardinality: number;
  globalRegions: number;
  decisionLatencyMs: number;
  needsLocalOnly: boolean;
  needsRedisLua: boolean;
  needsSharding: boolean;
  needsLocalPrecheck: boolean;
  needsGlobalQuotaService: boolean;
  strictGlobalQuota: boolean;
  failClosedOnStoreError: boolean;
}): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsLocalOnly) {
    reasons.push({
      severity: 'ok',
      text: '一台 API server 可以把 limiter state 放在内存里，因为目前还没有跨 instance 的竞态。',
    });
  } else {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(
        analysis.apiServerCount,
      )} 台 API server 需要一条共享的 atomic check-and-update 路径；各进程的 counter 会各执一词。`,
    });
  }

  if (analysis.needsRedisLua) {
    reasons.push({
      severity: analysis.requestsPerSecond > atomicStoreBudgetPerSecond ? 'danger' : 'warning',
      text: `${formatRate(
        analysis.requestsPerSecond,
      )} limiter checks/s 应该是一个 atomic 操作，而不是在并发下相互竞态的独立读、写调用。`,
    });
  }

  if (analysis.needsSharding) {
    reasons.push({
      severity: analysis.hotKeyRequestsPerSecond > hotKeyComfortableRps ? 'danger' : 'warning',
      text: `最热的 key 大约收到 ${formatRate(
        analysis.hotKeyRequestsPerSecond,
      )}/s。按 key 做 sharding 有助于总 throughput，但 hot key 可能仍需隔离、分桶或特殊策略。`,
    });
  }

  if (analysis.needsLocalPrecheck) {
    reasons.push({
      severity: 'warning',
      text: `${Math.round(
        analysis.decisionLatencyMs,
      )} ms 的判定预算倾向于在访问远端 state store 之前先做本地 pre-check 或用缓存的 quota 授权。`,
    });
  }

  if (analysis.needsGlobalQuotaService) {
    reasons.push({
      severity: 'danger',
      text: `${formatCount(
        analysis.globalRegions,
      )} 个 region 加严格全局 quota，用 latency 和可用性换取精确的 enforcement。`,
    });
  }

  if (analysis.failClosedOnStoreError) {
    reasons.push({
      severity: 'warning',
      text: 'fail-closed 保护对滥用敏感的接口，但在 limiter store 故障期间可能拒绝正常流量。',
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'fail-open 偏向产品可用性，但系统应该发出 event，让滥用和 quota 超额事后能被纠正。',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(flags: {
  needsLocalOnly: boolean;
  needsRedisLua: boolean;
  needsSharding: boolean;
  needsLocalPrecheck: boolean;
  needsGlobalQuotaService: boolean;
  needsTokenBucket: boolean;
  needsSlidingWindow: boolean;
  strictGlobalQuota: boolean;
  failClosedOnStoreError: boolean;
  burstTokens: number;
}): Record<string, { state: DecisionState; copy: string }> {
  const algorithmCopy = flags.needsSlidingWindow
    ? '当平滑度和精确的窗口语义比 burst 容忍度更重要时，用 sliding-window counter 或 log。'
    : `用 token bucket 来允许短时 burst；这个场景下每个 key 大约给 ${formatCount(
        flags.burstTokens,
      )} 个 burst token。`;

  return {
    algorithm: {
      state: flags.needsSlidingWindow && flags.needsTokenBucket ? 'tradeoff' : 'needed',
      copy: algorithmCopy,
    },
    localMemory: {
      state: flags.needsLocalOnly || flags.needsLocalPrecheck ? 'needed' : 'not-yet',
      copy: flags.needsLocalOnly
        ? '只要所有判定都由一个进程独占，本地 map 就是最简单的正确设计。'
        : flags.needsLocalPrecheck
          ? '用本地 pre-check 或缓存的 quota 授权来保护 latency，但要和共享 state 对账。'
          : '一旦多台 server 对同一个 key 做 enforcement，单靠本地 counter 就不正确了。',
    },
    redisLua: {
      state: flags.needsRedisLua ? 'needed' : 'not-yet',
      copy: flags.needsRedisLua
        ? '用 Redis 加 Lua 脚本，让 check 和 update 在单个 shard 上 atomic 完成。'
        : '只要一个进程能独占完整的 limiter state，就不需要 Redis。',
    },
    sharding: {
      state: flags.needsSharding ? 'needed' : 'not-yet',
      copy: flags.needsSharding
        ? '按 enforcement key 把 limiter state 做 shard；留意那些仍会压垮单个 shard 的 hot key。'
        : '在 QPS、key 数量或 hot-key 倾斜证明不够之前，一个 state store 就够了。',
    },
    globalQuota: {
      state: flags.needsGlobalQuotaService ? 'needed' : flags.strictGlobalQuota ? 'tradeoff' : 'not-yet',
      copy: flags.needsGlobalQuotaService
        ? '当精确的全局上限比 latency 更重要时，用 quota service 或各 region 预算分配器。'
        : flags.strictGlobalQuota
          ? '虽然要求严格全局正确性，但单个 region 仍可在本地完成 enforcement。'
          : '当可用性和 latency 比精确的全局总量更重要时，优先用各 region 或近似的 enforcement。',
    },
    failMode: {
      state: flags.failClosedOnStoreError ? 'tradeoff' : 'useful',
      copy: flags.failClosedOnStoreError
        ? '对滥用敏感的操作选 fail closed；代价是 state store 出事时会有误拒。'
        : '为可用性选 fail open；发出 limiter event，让滥用和超额在恢复后能被分析。',
    },
  };
}

function chooseArchitectureTitle(flags: {
  needsLocalOnly: boolean;
  needsRedisLua: boolean;
  needsSharding: boolean;
  needsLocalPrecheck: boolean;
  needsGlobalQuotaService: boolean;
}): string {
  if (flags.needsLocalOnly) {
    return '进程内 limiter map';
  }
  if (flags.needsGlobalQuotaService) {
    return '各 region enforcement + 全局 quota service';
  }
  if (flags.needsSharding && flags.needsLocalPrecheck) {
    return '本地 pre-check + sharded Redis Lua state';
  }
  if (flags.needsSharding) {
    return 'Sharded Redis Lua limiter';
  }
  if (flags.needsRedisLua) {
    return '共享 Redis Lua limiter';
  }
  return 'Gateway limiter';
}

function chooseArchitectureSummary(flags: {
  needsLocalOnly: boolean;
  needsRedisLua: boolean;
  needsSharding: boolean;
  needsLocalPrecheck: boolean;
  needsGlobalQuotaService: boolean;
}): string {
  if (flags.needsLocalOnly) {
    return '单个服务 instance 可以把每个 key 的 counter 或 bucket 放在内存里。在多 instance 开始竞态之前，这既简单又正确。';
  }
  if (flags.needsGlobalQuotaService) {
    return '每个 region 都需要快速的本地 enforcement，但严格全局 quota 需要一个协调 service，或预先分配各 region 的预算。';
  }
  if (flags.needsSharding && flags.needsLocalPrecheck) {
    return 'limiter 把快速的本地检查和 sharded 的 atomic state 结合起来，让 latency 保持低，同时分布式 server 对 quota 达成一致。';
  }
  if (flags.needsSharding) {
    return 'limiter state 按 enforcement key 分区。这扩展了总 QPS 和内存，但 hot key 需要特殊处理。';
  }
  if (flags.needsRedisLua) {
    return '多台 API server 共享 Redis state 并用 Lua，让 allow/deny 加 counter 更新是 atomic 的。';
  }
  return 'gateway 可以在把允许的流量传给 backend 之前先执行限流。';
}

function chooseArchitecturePath(flags: {
  needsLocalOnly: boolean;
  needsRedisLua: boolean;
  needsSharding: boolean;
  needsLocalPrecheck: boolean;
  needsGlobalQuotaService: boolean;
}): string {
  if (flags.needsLocalOnly) {
    return 'Request -> API gateway -> local bucket -> backend';
  }
  if (flags.needsGlobalQuotaService) {
    return 'Request -> gateway -> local check -> shard -> quota service -> backend';
  }
  if (flags.needsSharding && flags.needsLocalPrecheck) {
    return 'Request -> gateway -> local pre-check -> sharded Redis Lua -> backend';
  }
  if (flags.needsSharding) {
    return 'Request -> gateway -> shard router -> Redis Lua shard -> backend';
  }
  if (flags.needsRedisLua) {
    return 'Request -> gateway -> Redis Lua check -> backend';
  }
  return 'Request -> gateway -> backend';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
