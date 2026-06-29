import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatRate } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative teaching budgets, not vendor limits.
const synchronousProviderBudgetMs = 200;
const comfortableQueueIngestPerSecond = 50_000;
const comfortableWorkerSendsPerSecond = 30_000;
const comfortableDlqShare = 0.05;
const comfortablePreferenceLookupsPerSecond = 100_000;

export const notificationSystemLabDefinition: SystemDesignLabDefinition = {
  id: 'notification-system',
  eyebrow: '系统设计 Lab',
  title: '通知系统是一条 fan-out 流水线，它最难的活儿是把快速的 producer 和慢且不可靠的 provider 解耦开。',
  summary:
    '调节请求速率、每条通知的 fan-out、每条通知的 channel 数、用户规模、provider latency、retry 次数和每用户发送上限。设计会从直接的同步发送演进到带 channel worker 的持久化 queue、多 channel 路由、dedup 加 rate limit 加偏好过滤，最后是带 dead-letter queue 和投递分析的大流量 retry。',
  controls: [
    {
      id: 'requestsPerSecond',
      label: '通知请求速率',
      help: 'ingest API 每秒接受的入站通知请求数。',
      min: 1,
      max: 200_000,
      defaultValue: 50,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'recipientsPerNotification',
      label: '每条通知的 fan-out',
      help: '单条请求展开成的收件人数（1 = 直接，大 = 广播）。',
      min: 1,
      max: 10_000_000,
      defaultValue: 1,
      scale: 'log',
      unit: '人',
      format: 'count',
    },
    {
      id: 'channelsPerNotification',
      label: '每条通知的 channel 数',
      help: '每条通知瞄准多少个投递 channel（push、email、SMS）。',
      min: 1,
      max: 3,
      defaultValue: 1,
      scale: 'linear',
      unit: '个',
      format: 'count',
    },
    {
      id: 'totalUsers',
      label: '总用户数',
      help: '存有设备、地址和偏好的注册用户数。',
      min: 1_000,
      max: 1_000_000_000,
      defaultValue: 100_000,
      scale: 'log',
      unit: '人',
      format: 'count',
    },
    {
      id: 'providerLatencyMs',
      label: 'Provider latency',
      help: '每次发送到外部 provider（APNs/FCM、SES、Twilio）的往返时间。',
      min: 20,
      max: 5_000,
      defaultValue: 300,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'retryAttempts',
      label: 'Retry 次数',
      help: '消息被丢进 dead-letter queue 前，按指数 backoff 的最大投递 retry 次数。',
      min: 0,
      max: 8,
      defaultValue: 2,
      scale: 'linear',
      unit: '次',
      format: 'count',
    },
    {
      id: 'perUserSendCap',
      label: '每用户发送上限',
      help: '每用户每分钟允许的最大通知数，超出后 rate limit 会把它们丢弃。',
      min: 1,
      max: 1_000,
      defaultValue: 60,
      scale: 'log',
      format: 'requests-per-minute',
    },
  ],
  toggles: [
    {
      id: 'dedupAndRateLimit',
      label: 'Dedup + rate limit',
      help: '折叠重复发送并强制每用户上限，这样突发流量就没法刷屏某个用户。',
      defaultValue: false,
    },
    {
      id: 'preferenceFiltering',
      label: '偏好过滤',
      help: '在尝试发送前尊重用户的退订、channel 选择和免打扰时段。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'direct-send',
      step: '01',
      title: '直接同步发送',
      summary: '少量单收件人的 push 内联发出去。',
      values: {
        requestsPerSecond: 20,
        recipientsPerNotification: 1,
        channelsPerNotification: 1,
        totalUsers: 20_000,
        providerLatencyMs: 250,
        retryAttempts: 0,
        perUserSendCap: 60,
        dedupAndRateLimit: false,
        preferenceFiltering: false,
      },
    },
    {
      id: 'queue-workers',
      step: '02',
      title: 'Queue + channel worker',
      summary: '慢 provider 逼着在 producer 和发送者之间加一个 queue。',
      values: {
        requestsPerSecond: 3_000,
        recipientsPerNotification: 1,
        channelsPerNotification: 1,
        totalUsers: 500_000,
        providerLatencyMs: 800,
        retryAttempts: 1,
        perUserSendCap: 60,
        dedupAndRateLimit: false,
        preferenceFiltering: false,
      },
    },
    {
      id: 'multi-channel',
      step: '03',
      title: '多 channel 路由',
      summary: '一条请求 fan-out 到 push、email 和 SMS。',
      values: {
        requestsPerSecond: 8_000,
        recipientsPerNotification: 1,
        channelsPerNotification: 3,
        totalUsers: 5_000_000,
        providerLatencyMs: 600,
        retryAttempts: 2,
        perUserSendCap: 30,
        dedupAndRateLimit: false,
        preferenceFiltering: false,
      },
    },
    {
      id: 'preferences-dedup',
      step: '04',
      title: 'Dedup、限流、偏好',
      summary: '营销轰炸需要退订、免打扰时段和上限。',
      values: {
        requestsPerSecond: 5_000,
        recipientsPerNotification: 1_000,
        channelsPerNotification: 2,
        totalUsers: 50_000_000,
        providerLatencyMs: 500,
        retryAttempts: 3,
        perUserSendCap: 10,
        dedupAndRateLimit: true,
        preferenceFiltering: true,
      },
    },
    {
      id: 'broadcast-retries',
      step: '05',
      title: '广播 + retry + DLQ',
      summary: '面对不稳定 provider 的大规模广播，外加投递分析。',
      values: {
        requestsPerSecond: 2_000,
        recipientsPerNotification: 2_000_000,
        channelsPerNotification: 3,
        totalUsers: 500_000_000,
        providerLatencyMs: 1_500,
        retryAttempts: 6,
        perUserSendCap: 5,
        dedupAndRateLimit: true,
        preferenceFiltering: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: '通知系统架构图',
    description:
      '多 channel 通知系统的白板风格架构图：producer、ingest API、带 channel worker 的解耦 queue、外部 provider adapter，以及一条异步 retry / dead-letter 加分析的路径。',
    columns: [
      {
        id: 'producers',
        label: 'Producer',
        variant: 'clients',
        nodes: [
          {
            id: 'producer',
            title: 'Producer',
            subtitle: '应用事件',
            kind: 'client',
            summary: '请求发出一条通知的各种服务和触发器',
          },
        ],
      },
      {
        id: 'ingest',
        label: 'Ingest API',
        variant: 'edge',
        nodes: [
          {
            id: 'ingestApi',
            title: 'Ingest API',
            subtitle: '接收 + 校验',
            kind: 'api',
            summary: '接收请求、校验它们，并快速返回，不会卡在某次发送上',
          },
          {
            id: 'preferenceStore',
            title: 'Preference store',
            subtitle: '退订 + 免打扰',
            kind: 'db',
            summary: '保存每用户的 channel 选择、退订和免打扰时间窗',
          },
        ],
      },
      {
        id: 'pipeline',
        label: 'Queue + worker',
        variant: 'backbone',
        nodes: [
          {
            id: 'queue',
            title: 'Message queue',
            subtitle: '解耦 producer',
            kind: 'queue',
            summary: '持久化缓冲，让 producer 永远不会卡在慢 provider 上',
          },
          {
            id: 'channelWorkers',
            title: 'Channel worker',
            subtitle: '路由 + dedup',
            kind: 'compute',
            summary: '拉取消息，做 dedup 和 rate limit，再按 channel 分发',
          },
        ],
      },
      {
        id: 'providers',
        label: 'Provider adapter',
        variant: 'processing',
        nodes: [
          {
            id: 'pushAdapter',
            title: 'Push adapter',
            subtitle: 'APNs / FCM',
            kind: 'external',
            summary: '通过 Apple 和 Google 的网关发送移动 push',
          },
          {
            id: 'emailAdapter',
            title: 'Email adapter',
            subtitle: 'SES',
            kind: 'external',
            summary: '通过一个事务型 email provider 发送邮件',
          },
          {
            id: 'smsAdapter',
            title: 'SMS adapter',
            subtitle: 'Twilio',
            kind: 'external',
            summary: '通过一个电信 provider 发送 SMS',
          },
        ],
      },
      {
        id: 'async',
        label: 'Retry + 分析',
        variant: 'storage',
        nodes: [
          {
            id: 'retryQueue',
            title: 'Retry + DLQ',
            subtitle: 'backoff + dead-letter',
            kind: 'queue',
            summary: '用 backoff 重试失败的发送，并把发不出去的停进一个 dead-letter queue',
          },
          {
            id: 'analytics',
            title: '投递分析',
            subtitle: '状态事件',
            kind: 'stream',
            summary: '在热路径之外收集投递、退信和失败事件供看板使用',
          },
        ],
      },
    ],
    flows: [
      { from: 'producer', to: 'ingestApi', variant: 'primary' },
      { from: 'ingestApi', to: 'preferenceStore', variant: 'secondary' },
      { from: 'ingestApi', to: 'queue', variant: 'primary' },
      { from: 'queue', to: 'channelWorkers', variant: 'primary' },
      { from: 'channelWorkers', to: 'pushAdapter', variant: 'primary' },
      { from: 'channelWorkers', to: 'emailAdapter', variant: 'secondary' },
      { from: 'channelWorkers', to: 'smsAdapter', variant: 'secondary' },
      { from: 'channelWorkers', to: 'retryQueue', variant: 'secondary' },
      { from: 'channelWorkers', to: 'analytics', variant: 'direct' },
      { from: 'retryQueue', to: 'channelWorkers', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'queueBacklog', label: 'Queue 积压压力' },
    { id: 'providerThroughput', label: 'Provider 受限的 throughput' },
    { id: 'fanOut', label: 'Fan-out 放大' },
    { id: 'retryPressure', label: 'Retry / DLQ 压力' },
    { id: 'guardLoad', label: 'Dedup / rate limit 负载' },
  ],
  decisions: [
    { id: 'queueModel', title: 'Queue + worker 模型' },
    { id: 'channelRouting', title: 'Channel 路由' },
    { id: 'guards', title: 'Dedup + rate limit' },
    { id: 'retry', title: 'Retry / backoff + DLQ' },
    { id: 'providerAbstraction', title: 'Provider 抽象' },
    { id: 'preferences', title: 'Preference store' },
  ],
  sourceBackedRules: [
    {
      title: 'queue 把快速的 producer 和慢速的 consumer 解耦开',
      source: 'AWS — Queue-Based Load Leveling',
      url: 'https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/queue-based-load-leveling.html',
      summary:
        '在 producer 和调用慢 provider 的发送者之间放一个持久化 queue，能抹平突发流量，并阻止某个 provider 卡顿堵住请求路径。',
    },
    {
      title: '失败的投递在 retry 之后该进 dead-letter queue',
      source: 'AWS SQS Dead-Letter Queues',
      url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html',
      summary:
        '在有限次处理失败后，消息会被挪到 dead-letter queue，这样 poison message 就堵不住主 queue，之后还能拿来排查。',
    },
    {
      title: '带 jitter 的指数 backoff 能避免 retry 风暴',
      source: 'AWS Architecture Blog',
      url: 'https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/',
      summary:
        '用指数增长、带抖动的延迟去重试失败的 provider 调用，可以防止同步的 retry 把一个本就吃力的 provider 彻底压垮。',
    },
    {
      title: 'APNs 和 FCM 是移动 push 的网关',
      source: 'Apple APNs Documentation',
      url: 'https://developer.apple.com/documentation/usernotifications/setting-up-a-remote-notification-server',
      summary:
        '移动 push 是经 provider 网关投递的（Apple 用 APNs，Android 用 FCM），而非直接发到设备，所以 push adapter 必须会说每种网关协议。',
    },
  ],
  teachingAssumptions: [
    '每次 channel 发送都建模成一次外部 provider 调用；总发送数 = 请求数 × fan-out × channel 数。',
    'provider 并发是有上限的，所以可达到的发送速率按「worker 并发 / provider latency」缩放；约束在 latency，不在 CPU。',
    'dedup 和 rate limit 近似为对每个候选发送做一次 per-user 计数器查询；偏好过滤则是分发前的一次 per-user 读取。',
  ],
  teachingWalkthrough: [
    {
      id: 'inline',
      step: '01',
      focus: '少量流量，内联发出',
      scenarioId: 'direct-send',
      question:
        '在约每秒 20 条单收件人 push 时，API 能不能直接调 APNs，等发送完成再返回？',
      reveal:
        '暂时可以。每秒 20 条的同步调用单个 provider 没问题。queue、worker、retry 和 DLQ 都会是没有负载支撑的多余零件。',
      takeaway: '从最简单的正确设计起步：接收请求，然后内联发送。',
    },
    {
      id: 'decouple',
      step: '02',
      focus: '慢 provider 会卡住',
      scenarioId: 'queue-workers',
      question:
        '现在每秒 3k 请求打到一个每次约 800 ms 的 provider。如果 API 还是内联发送，会怎样？',
      reveal:
        '请求路径会崩：每次 800 ms，同步 server 能同时在飞的发送就那么多，于是请求堆积并超时。在 API 和发送者之间放一个持久化 queue —— API 入队后毫秒级返回，一批 channel worker 按 provider 允许的速率把 queue 抽干。',
      takeaway: '用一个 queue 解耦，让慢 provider 永远卡不住 producer。',
    },
    {
      id: 'routing',
      step: '03',
      focus: '一条请求，三个 channel',
      scenarioId: 'multi-channel',
      question:
        '一条请求现在同时瞄准 push、email 和 SMS。该让一个 worker 顺序调用这三个 provider 吗？',
      reveal:
        '不该 —— 每个 channel 都有自己的 provider、latency 和失败模式。把消息 fan-out 给 per-channel 的 worker（或 per-channel 的 queue），藏在一个 provider 抽象后面，这样慢的 SMS provider 不会拖住 push，每个 channel 也能独立扩容自己的并发。',
      takeaway: '按 channel 在一个 adapter 后面路由，让各 channel 独立失败、独立扩容。',
    },
    {
      id: 'guards',
      step: '04',
      focus: '轰炸需要护栏',
      scenarioId: 'preferences-dedup',
      question:
        '一次营销轰炸每条 fan-out 给 1,000 个收件人。是什么挡住用户被刷屏、或退订后还被发消息？',
      reveal:
        '在分发前加上 dedup 和 per-user rate limit（一个按 user 作 key 的计数器），再加偏好过滤（退订、channel 选择、免打扰时段）。这些会丢弃或推迟用户根本不想要的发送，既砍掉 provider 成本，又保护你的发送者声誉。',
      takeaway: '在发送之前尊重偏好和上限，而不是等投诉之后。',
    },
    {
      id: 'broadcast',
      step: '05',
      focus: '广播 + 不稳定 provider',
      scenarioId: 'broadcast-retries',
      question:
        '一次广播在不稳定的 provider 上展开成数百万次发送。你怎么处理失败，又不丢消息、不把 provider 搞挂？',
      reveal:
        '用带 jitter 的指数 backoff 来 retry，给次数封顶，仍失败的就丢进 dead-letter queue，这样 poison message 不会堵住 queue。把投递和失败事件发到一条异步分析 stream，让你能看退信率却不拖慢发送者。',
      takeaway: '有上限的 backoff retry 加一个 DLQ，让大规模投递既持久又可观测。',
    },
  ],
  analyze: analyzeNotificationSystemWorkload,
};

function analyzeNotificationSystemWorkload(workload: WorkloadValues): LabAnalysis {
  const requestsPerSecond = numericValue(workload, 'requestsPerSecond');
  const recipientsPerNotification = numericValue(workload, 'recipientsPerNotification');
  const channelsPerNotification = numericValue(workload, 'channelsPerNotification');
  const totalUsers = numericValue(workload, 'totalUsers');
  const providerLatencyMs = numericValue(workload, 'providerLatencyMs');
  const retryAttempts = numericValue(workload, 'retryAttempts');
  const perUserSendCap = numericValue(workload, 'perUserSendCap');
  const dedupAndRateLimit = Boolean(workload.dedupAndRateLimit);
  const preferenceFiltering = Boolean(workload.preferenceFiltering);

  // Total external send attempts per second across all recipients and channels.
  const sendsPerSecond = requestsPerSecond * recipientsPerNotification * channelsPerNotification;
  // Retries multiply provider-bound work; each attempt is another provider call.
  const attemptsPerSecond = sendsPerSecond * (1 + retryAttempts * 0.5);

  const needsQueue = sendsPerSecond > 100 || providerLatencyMs > synchronousProviderBudgetMs;
  const needsRouting = channelsPerNotification > 1;
  const needsGuards = dedupAndRateLimit;
  const needsRetry = retryAttempts > 0 || providerLatencyMs > 700;
  const needsProviderAbstraction = needsRouting || sendsPerSecond > 100;
  const needsPreferences = preferenceFiltering;
  const isBroadcast = recipientsPerNotification > 1_000;

  const fanOutFactor = recipientsPerNotification * channelsPerNotification;
  const dlqShare = needsRetry ? Math.min(0.4, 0.02 + providerLatencyMs / 12_000) : 0;
  const guardLookupsPerSecond = needsGuards || needsPreferences ? sendsPerSecond : 0;

  const flags = {
    needsQueue,
    needsRouting,
    needsGuards,
    needsRetry,
    needsProviderAbstraction,
    needsPreferences,
    isBroadcast,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      producer: 'ok',
      ingestApi: needsQueue ? 'ok' : sendsPerSecond > 50 ? 'warning' : 'ok',
      preferenceStore: needsPreferences ? 'needed' : 'inactive',
      queue: needsQueue ? 'needed' : 'inactive',
      channelWorkers: needsQueue ? (attemptsPerSecond > comfortableWorkerSendsPerSecond ? 'warning' : 'needed') : 'inactive',
      pushAdapter: needsProviderAbstraction ? 'needed' : 'ok',
      emailAdapter: needsRouting ? 'needed' : 'inactive',
      smsAdapter: needsRouting ? 'needed' : 'inactive',
      retryQueue: needsRetry ? (dlqShare > comfortableDlqShare ? 'warning' : 'needed') : 'inactive',
      analytics: needsRetry || isBroadcast ? 'needed' : 'inactive',
    },
    flowStates: {
      producerToIngestApi: 'active',
      ingestApiToPreferenceStore: needsPreferences ? 'active' : 'inactive',
      ingestApiToQueue: needsQueue ? 'active' : 'inactive',
      queueToChannelWorkers: needsQueue ? 'active' : 'inactive',
      channelWorkersToPushAdapter: needsQueue ? 'active' : 'inactive',
      channelWorkersToEmailAdapter: needsRouting ? 'active' : 'inactive',
      channelWorkersToSmsAdapter: needsRouting ? 'active' : 'inactive',
      channelWorkersToRetryQueue: needsRetry ? 'active' : 'inactive',
      channelWorkersToAnalytics: needsRetry || isBroadcast ? 'active' : 'inactive',
      retryQueueToChannelWorkers: needsRetry ? 'active' : 'inactive',
    },
    meters: {
      queueBacklog: {
        ratio: attemptsPerSecond / comfortableQueueIngestPerSecond,
        valueText: `${formatRate(sendsPerSecond)}/s`,
        copy: needsQueue
          ? `一个持久化 queue 吸收 ${formatRate(sendsPerSecond)}/s 的发送，这样 ${Math.round(providerLatencyMs)} ms 的 provider 就堵不住 producer。`
          : '发送量足够低，API 可以不用 queue、内联调用 provider。',
      },
      providerThroughput: {
        ratio: attemptsPerSecond / comfortableWorkerSendsPerSecond,
        valueText: `${formatRate(attemptsPerSecond)}/s`,
        copy: `每次调用 ${Math.round(providerLatencyMs)} ms，要撑住 ${formatRate(attemptsPerSecond)}/s 的尝试，就需要同等数量的并发在飞发送。`,
      },
      fanOut: {
        ratio: fanOutFactor / 100_000,
        valueText: `${formatCount(fanOutFactor)}x`,
        copy: `每条请求展开成 ${formatCount(recipientsPerNotification)} 个收件人 × ${Math.round(channelsPerNotification)} 个 channel 的 provider 工作量。`,
      },
      retryPressure: {
        ratio: needsRetry ? dlqShare / comfortableDlqShare : 0,
        valueText: needsRetry ? `${Math.round(retryAttempts)} 次 retry` : '关闭',
        copy: needsRetry
          ? `每次发送最多 ${Math.round(retryAttempts)} 次 backoff retry；仍有约 ${formatPercent(dlqShare)} 失败并落进 dead-letter queue。`
          : '没配置 retry，所以失败的发送就直接丢弃。',
      },
      guardLoad: {
        ratio: Math.max(
          guardLookupsPerSecond / comfortablePreferenceLookupsPerSecond,
          (needsGuards || needsPreferences ? totalUsers : 0) / 200_000_000,
        ),
        valueText: needsGuards || needsPreferences ? `${formatRate(guardLookupsPerSecond)}/s` : '关闭',
        copy:
          needsGuards || needsPreferences
            ? `dedup、${Math.round(perUserSendCap)}/min 的上限和偏好检查，各自对 ${formatRate(guardLookupsPerSecond)}/s 的候选发送做一次 per-user 查询，背后是 ${formatCount(totalUsers)} 个用户的 per-user 状态。`
            : '还没有 dedup、rate limit 或偏好过滤，所以每条请求都原样分发。',
      },
    },
    decisions: buildDecisions({
      ...flags,
      sendsPerSecond,
      attemptsPerSecond,
      providerLatencyMs,
      retryAttempts,
      perUserSendCap,
      channelsPerNotification,
    }),
    reasons: buildReasons({
      ...flags,
      requestsPerSecond,
      sendsPerSecond,
      attemptsPerSecond,
      recipientsPerNotification,
      channelsPerNotification,
      providerLatencyMs,
      retryAttempts,
      dlqShare,
      perUserSendCap,
    }),
  };
}

type ArchitectureFlags = {
  needsQueue: boolean;
  needsRouting: boolean;
  needsGuards: boolean;
  needsRetry: boolean;
  needsProviderAbstraction: boolean;
  needsPreferences: boolean;
  isBroadcast: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    requestsPerSecond: number;
    sendsPerSecond: number;
    attemptsPerSecond: number;
    recipientsPerNotification: number;
    channelsPerNotification: number;
    providerLatencyMs: number;
    retryAttempts: number;
    dlqShare: number;
    perUserSendCap: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsQueue) {
    reasons.push({
      severity:
        analysis.attemptsPerSecond > comfortableQueueIngestPerSecond ? 'danger' : 'warning',
      text: `${formatRate(analysis.sendsPerSecond)}/s 的发送面对 ${Math.round(
        analysis.providerLatencyMs,
      )} ms 的 provider，必须走一个持久化 queue，这样 producer 永远不会卡在某次慢发送上。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '发送量和 provider latency 都足够低，可以不用 queue、内联调用 provider。',
    });
  }

  if (analysis.attemptsPerSecond > comfortableWorkerSendsPerSecond) {
    reasons.push({
      severity: 'danger',
      text: `在每次 ${Math.round(
        analysis.providerLatencyMs,
      )} ms 的情况下撑住 ${formatRate(
        analysis.attemptsPerSecond,
      )}/s 的 provider 调用，需要一个大而可扩展的 worker pool 以及 provider 侧的并发。`,
    });
  }

  if (analysis.needsRouting) {
    reasons.push({
      severity: 'warning',
      text: `每条通知 ${Math.round(
        analysis.channelsPerNotification,
      )} 个 channel，需要在一个 provider 抽象后面做 per-channel 路由，这样一个慢 channel 不会拖住其他的。`,
    });
  }

  if (analysis.isBroadcast) {
    reasons.push({
      severity: 'warning',
      text: `fan-out 给 ${formatCount(
        analysis.recipientsPerNotification,
      )} 个收件人，把一条请求放大成 ${formatRate(
        analysis.sendsPerSecond,
      )}/s 的发送；queue 和 worker 吸收这股突发。`,
    });
  }

  if (analysis.needsRetry) {
    reasons.push({
      severity: analysis.dlqShare > comfortableDlqShare ? 'danger' : 'ok',
      text: `最多 ${Math.round(
        analysis.retryAttempts,
      )} 次 backoff retry、约 ${formatPercent(
        analysis.dlqShare,
      )} 进 dead-letter queue，让不稳定 provider 的失败既不丢失也不堵住 queue。`,
    });
  }

  if (analysis.needsGuards) {
    reasons.push({
      severity: 'ok',
      text: `dedup 加一个 ${Math.round(
        analysis.perUserSendCap,
      )}/min 的 per-user 上限，挡住突发和重复刷屏某个用户、烧掉 provider 成本。`,
    });
  }

  if (analysis.needsPreferences) {
    reasons.push({
      severity: 'ok',
      text: '偏好过滤在发送前尊重退订、channel 选择和免打扰时段，保护发送者声誉。',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    sendsPerSecond: number;
    attemptsPerSecond: number;
    providerLatencyMs: number;
    retryAttempts: number;
    perUserSendCap: number;
    channelsPerNotification: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    queueModel: {
      state: flags.needsQueue ? 'needed' : 'not-yet',
      copy: flags.needsQueue
        ? `把每条请求入队，用一个 worker pool 抽干它；producer 毫秒级返回，由 worker 来吸收 ${Math.round(
            flags.providerLatencyMs,
          )} ms 的 provider latency。`
        : '暂时不用 queue —— 在量和 latency 都还低时，API 内联调用 provider。',
    },
    channelRouting: {
      state: flags.needsRouting ? 'needed' : 'not-yet',
      copy: flags.needsRouting
        ? `把这 ${Math.round(
            flags.channelsPerNotification,
          )} 个 channel 各自路由到自己的 worker/queue，这样一个慢 channel 没法拖住其他的。`
        : '单个 channel 暂时不需要路由层。',
    },
    guards: {
      state: flags.needsGuards ? 'needed' : 'not-yet',
      copy: flags.needsGuards
        ? `分发前用一个按 user 作 key 的计数器去 dedup 重复发送，并强制 ${Math.round(
            flags.perUserSendCap,
          )}/min 的 per-user 上限。`
        : '还没有 dedup 或 rate limit；每条请求都原样分发。',
    },
    retry: {
      state: flags.needsRetry ? 'needed' : 'not-yet',
      copy: flags.needsRetry
        ? `用带 jitter 的指数 backoff 重试失败的发送，封顶在 ${Math.round(
            flags.retryAttempts,
          )} 次，剩下的丢进 dead-letter queue，这样 poison message 堵不住 queue。`
        : '还没有 retry；失败的发送就直接丢弃。',
    },
    providerAbstraction: {
      state: flags.needsProviderAbstraction ? (flags.needsRouting ? 'needed' : 'useful') : 'not-yet',
      copy: flags.needsProviderAbstraction
        ? '把 APNs/FCM、SES 和 Twilio 藏在一个统一的 adapter 接口后面，让 channel 和 failover 可以随时替换。'
        : '量很小时，直接调用一个 provider 就够了。',
    },
    preferences: {
      state: flags.needsPreferences ? 'needed' : 'not-yet',
      copy: flags.needsPreferences
        ? '每次发送前，从一个 preference store 读取 per-user 的退订、channel 选择和免打扰时段。'
        : '还没有 preference store；发送是无条件的。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsQueue && !flags.needsRouting && !flags.needsRetry) {
    return '直接同步发送';
  }
  if (flags.isBroadcast && flags.needsRetry) {
    return 'Fan-out queue + worker + retry/DLQ';
  }
  if (flags.needsGuards || flags.needsPreferences) {
    return 'Queue + worker + dedup/偏好';
  }
  if (flags.needsRouting) {
    return 'Queue + 多 channel worker';
  }
  return 'Queue + channel worker';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsQueue && !flags.needsRouting && !flags.needsRetry) {
    return 'ingest API 内联调用单个 provider，等发送完成再返回。此外的东西暂时都不值当。';
  }
  if (flags.isBroadcast && flags.needsRetry) {
    return 'API 把每条请求入队，再 fan-out 给 per-channel 的 worker，由它们经 adapter 调用 provider，配上 backoff retry、一个 dead-letter queue，以及面向大规模广播的异步投递分析。';
  }
  if (flags.needsGuards || flags.needsPreferences) {
    return '一个 queue 把 producer 和慢 provider 解耦开，channel worker 在每次发送前做 dedup、per-user rate limit 和偏好过滤。';
  }
  if (flags.needsRouting) {
    return '一个 queue 把 producer 和 provider 解耦开，channel worker 把每条通知独立路由到 push、email 或 SMS 的 adapter。';
  }
  return '一个 queue 吸收突发，channel worker 按 provider 允许的速率把它抽干，这样 producer 永远不会卡在某次慢发送上。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsQueue && !flags.needsRouting && !flags.needsRetry) {
    return '请求 -> ingest API -> provider（内联）';
  }
  if (flags.isBroadcast && flags.needsRetry) {
    return '请求 -> ingest API -> queue -> channel worker -> adapter -> retry/DLQ + 分析';
  }
  if (flags.needsGuards || flags.needsPreferences) {
    return '请求 -> ingest API -> queue -> worker（dedup + 偏好）-> adapter';
  }
  if (flags.needsRouting) {
    return '请求 -> ingest API -> queue -> channel worker -> push/email/SMS adapter';
  }
  return '请求 -> ingest API -> queue -> channel worker -> provider';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
