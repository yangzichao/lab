import { buildColumnDiagram } from '../diagram-layout';
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

const bytesPerFeedEntry = 200;
const comfortableFanoutWritesPerSecond = 1_000_000;
const comfortableCelebrityFanoutPerSecond = 2_000_000;
const comfortableFeedCacheGigabytes = 2_000;
const comfortableReadMergeFanoutPerSecond = 5_000_000;
const comfortablePostStoreWritesPerSecond = 50_000;
const celebrityThreshold = 100_000;

export const newsFeedLabDefinition: SystemDesignLabDefinition = {
  id: 'news-feed',
  eyebrow: '系统设计 Lab',
  title: '社交 news feed 的成败系于 fan-out 的取舍：写入时把帖子推进每个 follower，还是读取时拉取再合并。',
  summary:
    '调节日活用户、发帖速率、平均 follower 数和 celebrity follower 数、feed 读取量、feed 大小和 ranking 成本。设计会从读取时 pull 合并，演进到带 feed cache 的 push fan-out、对 celebrity 特殊处理的混合方案、ranking pipeline，最后是跨 region 的 sharded store。',
  controls: [
    {
      id: 'dailyActiveUsers',
      label: '日活用户',
      help: '某一天打开 app 并加载 feed 的人数。',
      min: 1_000,
      max: 2_000_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: '人',
      format: 'count',
    },
    {
      id: 'postsPerSecond',
      label: '发帖速率',
      help: '每秒新创建的帖子数；每条帖子都可能 fan out 到 follower。',
      min: 1,
      max: 1_000_000,
      defaultValue: 1_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'averageFollowers',
      label: '平均 follower 数',
      help: '典型的 follower 数；一条普通帖子的写 fan-out 倍数。',
      min: 10,
      max: 100_000,
      defaultValue: 300,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'celebrityFollowers',
      label: 'Celebrity follower 数',
      help: '最大账号的 follower 数；正是它让写 fan-out 爆炸。',
      min: 1_000,
      max: 200_000_000,
      defaultValue: 50_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'feedReadsPerSecond',
      label: 'Feed 读取量',
      help: '每秒的 feed 加载请求；用户最能感知的主导读路径。',
      min: 10,
      max: 5_000_000,
      defaultValue: 50_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'feedSize',
      label: 'Feed 窗口',
      help: '每个用户 feed 里保持热的帖子数；窗口越大占用的 cache 内存越多。',
      min: 20,
      max: 2_000,
      defaultValue: 200,
      scale: 'linear',
      unit: '条',
      format: 'count',
    },
    {
      id: 'rankingCost',
      label: 'Ranking 成本',
      help: '为 ranked feed 打分和排序时，每个 feed item 的相对工作量。',
      min: 1,
      max: 50,
      defaultValue: 1,
      scale: 'log',
      format: 'multiplier',
    },
  ],
  toggles: [
    {
      id: 'rankedFeed',
      label: 'Ranked feed',
      help: '按相关性给帖子打分并重排，而不是纯粹的倒序时间排列。',
      defaultValue: false,
    },
    {
      id: 'celebrityHybrid',
      label: 'Celebrity 混合 fan-out',
      help: '对超大账号跳过写 fan-out，改为在读取时合并它们的帖子。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'tiny-app',
      step: '01',
      title: '小型社交 app',
      summary: '帖子少、follower 数小；读取时 pull 再合并。',
      values: {
        dailyActiveUsers: 20_000,
        postsPerSecond: 5,
        averageFollowers: 80,
        celebrityFollowers: 3_000,
        feedReadsPerSecond: 200,
        feedSize: 100,
        rankingCost: 1,
        rankedFeed: false,
        celebrityHybrid: false,
      },
    },
    {
      id: 'growth',
      step: '02',
      title: '增长期：push fan-out',
      summary: '读占主导，所以在写入时 push 来预计算 feed。',
      values: {
        dailyActiveUsers: 5_000_000,
        postsPerSecond: 2_000,
        averageFollowers: 400,
        celebrityFollowers: 80_000,
        feedReadsPerSecond: 120_000,
        feedSize: 200,
        rankingCost: 1,
        rankedFeed: false,
        celebrityHybrid: false,
      },
    },
    {
      id: 'celebrity-joins',
      step: '03',
      title: '一位 celebrity 入驻',
      summary: '一条帖子要触达数千万个 feed。',
      values: {
        dailyActiveUsers: 50_000_000,
        postsPerSecond: 8_000,
        averageFollowers: 500,
        celebrityFollowers: 40_000_000,
        feedReadsPerSecond: 600_000,
        feedSize: 150,
        rankingCost: 1,
        rankedFeed: false,
        celebrityHybrid: true,
      },
    },
    {
      id: 'ranked-feed',
      step: '04',
      title: 'Ranked feed',
      summary: '相关性打分取代严格的时间排序。',
      values: {
        dailyActiveUsers: 200_000_000,
        postsPerSecond: 20_000,
        averageFollowers: 600,
        celebrityFollowers: 80_000_000,
        feedReadsPerSecond: 1_500_000,
        feedSize: 500,
        rankingCost: 12,
        rankedFeed: true,
        celebrityHybrid: true,
      },
    },
    {
      id: 'global-scale',
      step: '05',
      title: '全球规模',
      summary: '为全球用户准备 sharded store 和多 region。',
      values: {
        dailyActiveUsers: 1_500_000_000,
        postsPerSecond: 400_000,
        averageFollowers: 800,
        celebrityFollowers: 150_000_000,
        feedReadsPerSecond: 4_000_000,
        feedSize: 800,
        rankingCost: 30,
        rankedFeed: true,
        celebrityHybrid: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: '社交 news feed 架构图',
    description:
      '白板风格的社交 news feed 架构图：client、edge 和 API gateway、带 feed cache 的 fan-out service、post store 和 follow graph，以及 ranking 加异步 worker。',
    columns: [
      {
        id: 'clients',
        label: 'Client',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'post + read',
            summary: '创建帖子，并加载首页 feed 时间线',
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
            id: 'gateway',
            title: 'API gateway',
            subtitle: 'post + feed',
            summary: '把帖子写入和 feed 读取路由到对应的 service',
            kind: 'api',
          },
          {
            id: 'feedApi',
            title: 'Feed service',
            subtitle: '组装 feed',
            summary: '提供首页 feed，读 cache 并合并额外内容',
            kind: 'service',
          },
        ],
      },
      {
        id: 'fanout',
        label: 'Fan-out + cache',
        variant: 'backbone',
        nodes: [
          {
            id: 'fanoutWorker',
            title: 'Fan-out worker',
            subtitle: '写入时 push',
            summary: '把每条新帖子推进每个 follower 的 feed cache',
            kind: 'compute',
          },
          {
            id: 'feedCache',
            title: 'Feed cache',
            subtitle: '每个用户的 feed',
            summary: '保存预计算好的 feed，让读取只需一次 cache fetch',
            kind: 'cache',
          },
        ],
      },
      {
        id: 'stores',
        label: 'Store',
        variant: 'storage',
        nodes: [
          {
            id: 'postStore',
            title: 'Post store',
            subtitle: '帖子 + 媒体',
            summary: '持久保存每条帖子，随量增长做 shard',
            kind: 'db',
          },
          {
            id: 'graphStore',
            title: 'Follow graph',
            subtitle: '谁关注了谁',
            summary: 'follower 和 followee 的边，用来算 fan-out 的目标',
            kind: 'nosql',
          },
        ],
      },
      {
        id: 'workers',
        label: 'Ranking / 异步',
        variant: 'processing',
        nodes: [
          {
            id: 'rankingService',
            title: 'Ranking service',
            subtitle: '给 feed 打分',
            summary: '按预测的相关性给 feed item 打分并重排',
            kind: 'service',
          },
          {
            id: 'celebrityMerge',
            title: 'Celebrity merge',
            subtitle: '读取时 pull',
            summary: '在读取时合并超大账号的帖子，而不是做 fan-out',
            kind: 'service',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'gateway', variant: 'primary' },
      { from: 'gateway', to: 'feedApi', variant: 'primary' },
      { from: 'gateway', to: 'postStore', variant: 'direct' },
      { from: 'feedApi', to: 'feedCache', variant: 'primary' },
      { from: 'fanoutWorker', to: 'feedCache', variant: 'primary' },
      { from: 'fanoutWorker', to: 'graphStore', variant: 'secondary' },
      { from: 'postStore', to: 'fanoutWorker', variant: 'secondary' },
      { from: 'feedApi', to: 'rankingService', variant: 'secondary' },
      { from: 'feedApi', to: 'celebrityMerge', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'writeFanout', label: '写 fan-out 放大' },
    { id: 'celebrityFanout', label: 'Celebrity fan-out 成本' },
    { id: 'feedCacheMemory', label: 'Feed cache 内存' },
    { id: 'readMerge', label: '读取合并成本' },
    { id: 'postStorage', label: '帖子写 throughput' },
  ],
  decisions: [
    { id: 'fanoutStrategy', title: 'Fan-out 策略' },
    { id: 'feedCache', title: 'Feed cache' },
    { id: 'celebrity', title: 'Celebrity 特殊处理' },
    { id: 'postSharding', title: 'Post-store sharding' },
    { id: 'ranking', title: 'Ranking pipeline' },
  ],
  sourceBackedRules: [
    {
      title: 'Feed 通常用 fan-out-on-write，对 celebrity 用混合方案',
      source: 'System Design Primer',
      url: 'https://github.com/donnemartin/system-design-primer',
      summary:
        '经典写法在写入时把帖子 push 给 follower 来预计算 feed，再对超高 follower 数的账号特殊处理：在读取时合并它们的帖子。',
    },
    {
      title: 'Redis 用 sorted list 支撑每个用户的 feed cache',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/develop/',
      summary:
        'in-memory 的有序结构保存每个用户的 feed，于是一次 feed 读取就是一次快速的 range fetch，而不是一次 database join。',
    },
    {
      title: 'Kafka 把帖子写入和繁重的 fan-out 工作解耦',
      source: 'Apache Kafka',
      url: 'https://kafka.apache.org/documentation/',
      summary:
        '一个持久 log 让帖子写入能立刻返回，而 fan-out worker 异步消费 event，把内容 push 进 follower 的 feed。',
    },
    {
      title: 'DynamoDB 风格的 partition 扩展 post store 和 graph store',
      source: 'AWS DynamoDB',
      url: 'https://aws.amazon.com/dynamodb/',
      summary:
        '当数据集撑爆单机时，按 key 给帖子和 follow 边做 partition，把 storage 和写 throughput 分散到多个 node 上。',
    },
  ],
  teachingAssumptions: [
    '写 fan-out 建模为 posts/s 乘以平均 follower 数；读 fan-out 建模为 feed reads/s 乘以合并的 followee 数。',
    '单 node 的 fan-out、cache 和 store 预算是保守的教学数字，不是厂商上限。',
    'Celebrity 混合方案把最大的账号从写 fan-out 中移除，改成每次读取时加一点小合并。',
  ],
  teachingWalkthrough: [
    {
      id: 'pull-on-read',
      step: '01',
      focus: '读取时 pull',
      scenarioId: 'tiny-app',
      question:
        '一个小 app 做约 5 posts/s 和约 200 feed reads/s，follower 数也不大。你需要预计算 feed，还是可以即时拼出每个 feed？',
      reveal:
        '即时拼。读量低的时候，你可以从每个用户关注的人那里拉取最近的帖子，在读取时合并。fan-out service 和 feed cache 会是为还不存在的流量准备的预计算基础设施。',
      takeaway: '在小规模下，fan-out-on-read（pull 再合并）就是最简单的正确设计。',
    },
    {
      id: 'push-fanout',
      step: '02',
      focus: '读占主导',
      scenarioId: 'growth',
      question:
        '现在 120k feed reads/s 远多于 2k posts/s。如果每次读取都实时重新合并它的 followee，会出什么问题，怎么修？',
      reveal:
        '每次读取都重新合并，等于把同一个昂贵的 join 重复几百万次。既然读远多于写，就把工作翻到写入时：一个 fan-out worker 把每条新帖子推进每个 follower 的 feed cache，于是一次读取就变成一次 cache fetch。',
      takeaway: '当读占主导时，在写入时 fan out 进 feed cache 来预计算 feed。',
    },
    {
      id: 'celebrity',
      step: '03',
      focus: 'Celebrity fan-out 爆炸',
      scenarioId: 'celebrity-joins',
      question:
        '一位有 4000 万 follower 的 celebrity 发帖。纯 push fan-out 一条帖子就要写 4000 万条 feed entry。这能接受吗，你会改什么？',
      reveal:
        '不能——一条帖子触发数千万次 cache 写入，是一场让所有人卡住的「hot key」风暴。混合方案的修法是不再给最大的账号做 fan-out；它们的帖子改在读取时 pull 再合并，于是 follower 付一点每次读取的小成本，而不是系统付一笔巨大的每次写入成本。',
      takeaway: 'celebrity 会击垮写 fan-out；用读取时合并（混合 fan-out）对它们特殊处理。',
    },
    {
      id: 'ranking',
      step: '04',
      focus: '按相关性而非时间排序',
      scenarioId: 'ranked-feed',
      question:
        '产品想把最相关的帖子排在前面，而不是最新的。你能直接按某个 score 给缓存的 feed 排序，还是 ranking 需要自己的 pipeline？',
      reveal:
        '相关性打分需要 feature（互动、新鲜度、亲密度）和每个 item 的模型推理，这比按时间戳排序重得多。它属于一个 feed 调用会 fan out 过去的 ranking service，常常配合预计算的候选集和 feature store，让读取保持在预算之内。',
      takeaway: 'Ranking 是 pipeline，不是排序：候选生成、打分、重排，都从 feed-cache fetch 上分出去做。',
    },
    {
      id: 'global',
      step: '05',
      focus: '全球规模',
      scenarioId: 'global-scale',
      question:
        '全球 400k posts/s、4M feed reads/s，一个 post store 加一个 feed-cache 集群装得下吗？',
      reveal:
        '装不下——帖子 storage、follow graph、feed cache 和 fan-out throughput 全都超出单个集群。按 key 给 post store 和 graph 做 shard，按用户给 feed cache 做 partition，把 fan-out 跑成一条 partition 化的 stream，并把 cache 放到各 region，让读取就近解析。',
      takeaway: '到全球规模时每一层都要 partition：sharded store、partition 化的 cache，以及就近的 region 部署。',
    },
  ],
  analyze: analyzeNewsFeedWorkload,
};

function analyzeNewsFeedWorkload(workload: WorkloadValues): LabAnalysis {
  const dailyActiveUsers = numericValue(workload, 'dailyActiveUsers');
  const postsPerSecond = numericValue(workload, 'postsPerSecond');
  const averageFollowers = numericValue(workload, 'averageFollowers');
  const celebrityFollowers = numericValue(workload, 'celebrityFollowers');
  const feedReadsPerSecond = numericValue(workload, 'feedReadsPerSecond');
  const feedSize = numericValue(workload, 'feedSize');
  const rankingCost = numericValue(workload, 'rankingCost');
  const rankedFeed = Boolean(workload.rankedFeed);
  const celebrityHybrid = Boolean(workload.celebrityHybrid);

  // Reads vs writes decide whether to precompute feeds at all.
  const readWriteRatio = postsPerSecond > 0 ? feedReadsPerSecond / postsPerSecond : feedReadsPerSecond;
  const needsFanout = feedReadsPerSecond > 5_000 && readWriteRatio > 10;
  const needsFeedCache = needsFanout || feedReadsPerSecond > 20_000;

  // Write fan-out amplification = posts/s * average followers.
  const writeFanoutPerSecond = postsPerSecond * averageFollowers;

  // Celebrity fan-out: a single celebrity post writes celebrityFollowers entries.
  const celebrityIsHuge = celebrityFollowers >= celebrityThreshold;
  const needsCelebrityCase = celebrityIsHuge && needsFanout;
  // Per celebrity post the burst is celebrityFollowers; the hybrid avoids it.
  const celebrityFanoutBurst = celebrityHybrid ? 0 : celebrityFollowers;

  // Read merge cost rises when we pull (no fan-out) or merge celebrity posts.
  const followeesMergedPerRead = needsFanout ? (celebrityHybrid ? 5 : 0) : averageFollowers;
  const readMergeFanoutPerSecond = feedReadsPerSecond * followeesMergedPerRead;

  // Feed cache memory = active users * feed window * bytes per entry.
  const feedCacheGigabytes = needsFeedCache
    ? (dailyActiveUsers * feedSize * bytesPerFeedEntry) / 1_000_000_000
    : 0;

  const needsRanking = rankedFeed;
  const rankingLoad = needsRanking ? (feedReadsPerSecond * feedSize * rankingCost) / 50_000_000 : 0;

  const needsPostSharding =
    postsPerSecond > comfortablePostStoreWritesPerSecond ||
    dailyActiveUsers > 100_000_000 ||
    feedCacheGigabytes > comfortableFeedCacheGigabytes;

  const flags = {
    needsFanout,
    needsFeedCache,
    needsCelebrityCase,
    needsRanking,
    needsPostSharding,
    celebrityHybrid,
    rankedFeed,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      gateway: 'ok',
      feedApi: 'ok',
      fanoutWorker: needsFanout
        ? writeFanoutPerSecond > comfortableFanoutWritesPerSecond
          ? 'overloaded'
          : 'needed'
        : 'inactive',
      feedCache: needsFeedCache
        ? feedCacheGigabytes > comfortableFeedCacheGigabytes
          ? 'warning'
          : 'needed'
        : 'inactive',
      postStore: needsPostSharding ? 'warning' : 'ok',
      graphStore: needsFanout ? 'ok' : needsFeedCache ? 'ok' : 'inactive',
      rankingService: needsRanking
        ? rankingLoad > 1
          ? 'overloaded'
          : 'needed'
        : 'inactive',
      celebrityMerge: needsCelebrityCase ? 'needed' : 'inactive',
    },
    flowStates: {
      clientToGateway: 'active',
      gatewayToFeedApi: 'active',
      gatewayToPostStore: 'active',
      feedApiToFeedCache: needsFeedCache ? 'active' : 'inactive',
      fanoutWorkerToFeedCache: needsFanout
        ? writeFanoutPerSecond > comfortableFanoutWritesPerSecond
          ? 'warning'
          : 'active'
        : 'inactive',
      fanoutWorkerToGraphStore: needsFanout ? 'active' : 'inactive',
      postStoreToFanoutWorker: needsFanout ? 'active' : 'inactive',
      feedApiToRankingService: needsRanking
        ? rankingLoad > 1
          ? 'warning'
          : 'active'
        : 'inactive',
      feedApiToCelebrityMerge: needsCelebrityCase ? 'active' : 'inactive',
    },
    meters: {
      writeFanout: {
        ratio: writeFanoutPerSecond / comfortableFanoutWritesPerSecond,
        valueText: `${formatRate(writeFanoutPerSecond)}/s`,
        copy: needsFanout
          ? `${formatRate(postsPerSecond)} posts/s 里的每一条都 fan out 到约 ${formatCount(
              averageFollowers,
            )} 个 follower——大约 ${formatRate(writeFanoutPerSecond)} feed writes/s。`
          : 'feed 在读取时 pull，所以暂时没有写 fan-out。',
      },
      celebrityFanout: {
        ratio: celebrityFanoutBurst / comfortableCelebrityFanoutPerSecond,
        valueText: celebrityHybrid
          ? '读取时合并'
          : `${formatCount(celebrityFanoutBurst)} writes/帖`,
        copy: celebrityHybrid
          ? '混合 fan-out 在读取时 pull 超大账号的帖子，所以一条 celebrity 帖子不会成为写风暴。'
          : `一条 ${formatCount(celebrityFollowers)} follower 的帖子一次性 push 那么多 feed entry——一场 hot-key 的 fan-out 风暴。`,
      },
      feedCacheMemory: {
        ratio: feedCacheGigabytes / comfortableFeedCacheGigabytes,
        valueText: formatStorageGigabytes(feedCacheGigabytes),
        copy: needsFeedCache
          ? `${formatCount(dailyActiveUsers)} 个 feed，每个 ${formatCount(
              feedSize,
            )} 条帖子、每条约 ${bytesPerFeedEntry} bytes。`
          : '暂时没有 feed cache——feed 按需拼装。',
      },
      readMerge: {
        ratio: readMergeFanoutPerSecond / comfortableReadMergeFanoutPerSecond,
        valueText: `${formatRate(readMergeFanoutPerSecond)}/s`,
        copy: needsFanout
          ? celebrityHybrid
            ? '读取是廉价的 cache fetch，外加合并少数几条 celebrity 帖子。'
            : '读取是单次 cache fetch；读取时不合并任何东西。'
          : `${formatRate(feedReadsPerSecond)} reads/s 里的每一次都实时合并约 ${formatCount(
              averageFollowers,
            )} 个 followee。`,
      },
      postStorage: {
        ratio: postsPerSecond / comfortablePostStoreWritesPerSecond,
        valueText: `${formatRate(postsPerSecond)}/s`,
        copy: needsPostSharding
          ? `${formatRate(postsPerSecond)} posts/s 加 ${formatCount(
              dailyActiveUsers,
            )} 个用户超出了单个 store；按 key 给帖子和 follow graph 做 shard。`
          : `${formatRate(postsPerSecond)} posts/s 目前能放进单个持久 store。`,
      },
    },
    decisions: buildDecisions({
      ...flags,
      postsPerSecond,
      averageFollowers,
      celebrityFollowers,
      feedReadsPerSecond,
      rankingCost,
    }),
    reasons: buildReasons({
      ...flags,
      postsPerSecond,
      averageFollowers,
      celebrityFollowers,
      feedReadsPerSecond,
      readWriteRatio,
      writeFanoutPerSecond,
      readMergeFanoutPerSecond,
      feedCacheGigabytes,
      dailyActiveUsers,
      rankingCost,
    }),
  };
}

type ArchitectureFlags = {
  needsFanout: boolean;
  needsFeedCache: boolean;
  needsCelebrityCase: boolean;
  needsRanking: boolean;
  needsPostSharding: boolean;
  celebrityHybrid: boolean;
  rankedFeed: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    postsPerSecond: number;
    averageFollowers: number;
    celebrityFollowers: number;
    feedReadsPerSecond: number;
    readWriteRatio: number;
    writeFanoutPerSecond: number;
    readMergeFanoutPerSecond: number;
    feedCacheGigabytes: number;
    dailyActiveUsers: number;
    rankingCost: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsFanout) {
    reasons.push({
      severity:
        analysis.writeFanoutPerSecond > comfortableFanoutWritesPerSecond ? 'danger' : 'warning',
      text: `读比写多约 ${Math.round(
        analysis.readWriteRatio,
      )}:1，所以预计算 feed：把每条帖子 push 给 follower（约 ${formatRate(
        analysis.writeFanoutPerSecond,
      )} feed writes/s）进 feed cache。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatRate(
        analysis.feedReadsPerSecond,
      )} feed reads/s 足够低，可以从 followee 那里拉取最近的帖子，在读取时合并。`,
    });
  }

  // Celebrity status: always reported once fan-out is on, otherwise a low-scale note.
  if (analysis.needsCelebrityCase) {
    reasons.push({
      severity: analysis.celebrityHybrid ? 'ok' : 'danger',
      text: analysis.celebrityHybrid
        ? `Celebrity 帖子（${formatCount(
            analysis.celebrityFollowers,
          )} 个 follower）在读取时合并，避免单条帖子引发 fan-out 风暴。`
        : `一条 ${formatCount(
            analysis.celebrityFollowers,
          )} follower 的帖子会一次性 push 那么多 feed 写入；把最大的账号切换到混合的读取时合并。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `最大的账号有 ${formatCount(
        analysis.celebrityFollowers,
      )} 个 follower——还小到统一 fan-out 暂时不会成为写风暴。`,
    });
  }

  // Feed cache memory: always reported (warning only when it outgrows one cluster).
  if (analysis.feedCacheGigabytes > comfortableFeedCacheGigabytes) {
    reasons.push({
      severity: 'warning',
      text: `feed cache 在 ${formatCount(analysis.dailyActiveUsers)} 个用户上需要约 ${formatStorageGigabytes(
        analysis.feedCacheGigabytes,
      )}；按用户给它做 partition。`,
    });
  } else if (analysis.needsFeedCache) {
    reasons.push({
      severity: 'ok',
      text: `预计算的 feed 能放进约 ${formatStorageGigabytes(
        analysis.feedCacheGigabytes,
      )} 的 cache，所以一次读取就是一次 fetch。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '暂时不需要 feed cache；feed 从 post store 按需拼装。',
    });
  }

  // Ranking: always reported.
  if (analysis.needsRanking) {
    reasons.push({
      severity: 'warning',
      text: `ranked feed 的打分大约比按时间戳排序重 ${Math.round(
        analysis.rankingCost,
      )}x；把打分放进一条从 feed-cache fetch 分出去的 ranking pipeline 里跑。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'feed 保持倒序时间排列，所以拼装它就是一次有序合并，不带打分。',
    });
  }

  if (analysis.needsPostSharding) {
    reasons.push({
      severity: 'warning',
      text: `${formatRate(analysis.postsPerSecond)} posts/s 加 ${formatCount(
        analysis.dailyActiveUsers,
      )} 个用户超出了单 node；按 key 给 post store 和 follow graph 做 shard。`,
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    postsPerSecond: number;
    averageFollowers: number;
    celebrityFollowers: number;
    feedReadsPerSecond: number;
    rankingCost: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  const fanoutStrategyCopy = !flags.needsFanout
    ? 'Fan-out-on-read：量小的时候从 followee 那里拉取最近的帖子，在读取时合并。'
    : flags.celebrityHybrid
      ? 'Hybrid fan-out：普通账号用 push，最大的账号在读取时 pull 再合并。'
      : `Fan-out-on-write：把每条帖子 push 进约 ${formatCount(
          flags.averageFollowers,
        )} 个 follower 的 feed，让读取是单次 cache fetch。`;

  return {
    fanoutStrategy: {
      state: flags.needsFanout ? (flags.celebrityHybrid ? 'tradeoff' : 'needed') : 'useful',
      copy: fanoutStrategyCopy,
    },
    feedCache: {
      state: flags.needsFeedCache ? 'needed' : 'not-yet',
      copy: flags.needsFeedCache
        ? '把每个用户的 feed 存成预计算好的 list（Redis sorted set），让一次读取就是一次 fetch。'
        : '暂时没有 feed cache——feed 从 post store 按需拼装。',
    },
    celebrity: {
      state: flags.needsCelebrityCase ? (flags.celebrityHybrid ? 'needed' : 'tradeoff') : 'not-yet',
      copy: flags.needsCelebrityCase
        ? flags.celebrityHybrid
          ? `对 ${formatCount(
              flags.celebrityFollowers,
            )} follower 的账号跳过写 fan-out；在读取 feed 时合并它们的帖子。`
          : `对一个 ${formatCount(
              flags.celebrityFollowers,
            )} follower 的账号做纯 push fan-out 就是一场写风暴——对它特殊处理。`
        : 'follower 数还小到统一 fan-out 没问题。',
    },
    postSharding: {
      state: flags.needsPostSharding ? 'needed' : 'not-yet',
      copy: flags.needsPostSharding
        ? '按 key 给 post store 和 follow graph 做 shard，让 storage 和写 throughput 扩展出去。'
        : '只要还能放进单 node，一个 post store 加一个 graph 就能存下数据。',
    },
    ranking: {
      state: flags.needsRanking ? 'tradeoff' : 'not-yet',
      copy: flags.needsRanking
        ? `在 ranking pipeline 里给 feed item 打分（约为排序成本的 ${Math.round(
            flags.rankingCost,
          )}x）；用新鲜度和简单性换相关性。`
        : 'feed 是倒序时间排列，所以暂时不需要 ranking pipeline。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsFanout && !flags.needsFeedCache && !flags.needsRanking) {
    return '读取时 pull 的 feed';
  }
  if (flags.needsPostSharding && (flags.needsRanking || flags.needsCelebrityCase)) {
    return 'Sharded 混合 fan-out + ranking';
  }
  if (flags.needsRanking) {
    return 'Push fan-out + ranking pipeline';
  }
  if (flags.needsCelebrityCase) {
    return '混合 fan-out + feed cache';
  }
  return 'Push fan-out + feed cache';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsFanout && !flags.needsFeedCache && !flags.needsRanking) {
    return '每个 feed 都即时拼出来：从一个用户关注的人那里拉取最近的帖子并合并。暂时什么都不预计算。';
  }
  if (flags.needsPostSharding && (flags.needsRanking || flags.needsCelebrityCase)) {
    return '普通帖子在写入时 fan out 进一个 partition 化的 feed cache；超大账号在读取时合并，一条 ranking pipeline 重排 feed，post store 和 graph 跨 region 做 shard。';
  }
  if (flags.needsRanking) {
    return '帖子在写入时 fan out 进 feed cache，一条 ranking pipeline 在返回 feed 之前按相关性给缓存的 item 打分并重排。';
  }
  if (flags.needsCelebrityCase) {
    return '普通账号在写入时 fan out 进每个用户的 feed cache，而最大的账号在读取时 pull 再合并，让一条帖子不会成为写风暴。';
  }
  return '帖子在写入时 fan out 进每个用户的 feed cache，于是一次 feed 读取就是一次快速的 cache fetch，而不是实时合并。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsFanout && !flags.needsFeedCache && !flags.needsRanking) {
    return 'Read -> feed service -> pull + merge followees';
  }
  if (flags.needsPostSharding && (flags.needsRanking || flags.needsCelebrityCase)) {
    return 'Post -> fan-out -> feed cache -> ranking -> read (+ celebrity merge)';
  }
  if (flags.needsRanking) {
    return 'Post -> fan-out -> feed cache -> ranking -> read';
  }
  if (flags.needsCelebrityCase) {
    return 'Post -> fan-out -> feed cache -> read (+ celebrity merge)';
  }
  return 'Post -> fan-out -> feed cache -> read';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
