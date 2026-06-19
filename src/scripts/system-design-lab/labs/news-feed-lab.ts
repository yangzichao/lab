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
  eyebrow: 'System Design Lab',
  title: 'A social news feed lives or dies on the fan-out choice: push posts into every follower at write time, or pull and merge at read time.',
  summary:
    'Change daily active users, posting rate, average and celebrity follower counts, feed reads, feed size, and ranking cost. The design moves from pull-on-read merges to push fan-out with a feed cache, a hybrid that special-cases celebrities, a ranking pipeline, and finally sharded stores across regions.',
  controls: [
    {
      id: 'dailyActiveUsers',
      label: 'Daily active users',
      help: 'People who open the app and load a feed on a given day.',
      min: 1_000,
      max: 2_000_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: 'users',
      format: 'count',
    },
    {
      id: 'postsPerSecond',
      label: 'Posting rate',
      help: 'New posts created per second; every post may fan out to followers.',
      min: 1,
      max: 1_000_000,
      defaultValue: 1_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'averageFollowers',
      label: 'Average followers',
      help: 'Typical follower count; the write fan-out multiplier for a normal post.',
      min: 10,
      max: 100_000,
      defaultValue: 300,
      scale: 'log',
      unit: 'followers',
      format: 'count',
    },
    {
      id: 'celebrityFollowers',
      label: 'Celebrity followers',
      help: 'Follower count of the largest accounts; this is what makes write fan-out explode.',
      min: 1_000,
      max: 200_000_000,
      defaultValue: 50_000,
      scale: 'log',
      unit: 'followers',
      format: 'count',
    },
    {
      id: 'feedReadsPerSecond',
      label: 'Feed reads',
      help: 'Feed load requests per second; the dominant read path users feel.',
      min: 10,
      max: 5_000_000,
      defaultValue: 50_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'feedSize',
      label: 'Feed window',
      help: 'Posts kept warm per user feed; larger windows cost more cache memory.',
      min: 20,
      max: 2_000,
      defaultValue: 200,
      scale: 'linear',
      unit: 'posts',
      format: 'count',
    },
    {
      id: 'rankingCost',
      label: 'Ranking cost',
      help: 'Relative work per feed item when scoring and ordering a ranked feed.',
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
      help: 'Score and reorder posts by relevance instead of pure reverse-chronological order.',
      defaultValue: false,
    },
    {
      id: 'celebrityHybrid',
      label: 'Celebrity hybrid fan-out',
      help: 'Skip write fan-out for huge accounts and merge their posts at read time instead.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'tiny-app',
      step: '01',
      title: 'Tiny social app',
      summary: 'Few posts, small follower counts; pull and merge on read.',
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
      title: 'Growth: push fan-out',
      summary: 'Reads dominate, so precompute feeds by pushing on write.',
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
      title: 'A celebrity joins',
      summary: 'One post must reach tens of millions of feeds.',
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
      summary: 'Relevance scoring replaces strict chronological order.',
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
      title: 'Global scale',
      summary: 'Sharded stores and regions for a worldwide audience.',
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
    title: 'Social news feed architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a social news feed: clients, edge and API gateway, a fan-out service with feed cache, a post store and follow graph, and ranking plus async workers.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'post + read',
            summary: 'creates posts and loads the home feed timeline',
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
            summary: 'routes post writes and feed reads to the right services',
          },
          {
            id: 'feedApi',
            title: 'Feed service',
            subtitle: 'assembles feed',
            summary: 'serves the home feed, reading the cache and merging extras',
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
            subtitle: 'push on write',
            summary: 'pushes each new post into every follower feed cache',
          },
          {
            id: 'feedCache',
            title: 'Feed cache',
            subtitle: 'per-user feeds',
            summary: 'holds precomputed feeds so reads are a single cache fetch',
          },
        ],
      },
      {
        id: 'stores',
        label: 'Stores',
        variant: 'storage',
        nodes: [
          {
            id: 'postStore',
            title: 'Post store',
            subtitle: 'posts + media',
            summary: 'durable store of every post sharded as volume grows',
          },
          {
            id: 'graphStore',
            title: 'Follow graph',
            subtitle: 'who follows whom',
            summary: 'follower and followee edges used to compute fan-out targets',
          },
        ],
      },
      {
        id: 'workers',
        label: 'Ranking / async',
        variant: 'processing',
        nodes: [
          {
            id: 'rankingService',
            title: 'Ranking service',
            subtitle: 'scores feed',
            summary: 'scores and reorders feed items by predicted relevance',
          },
          {
            id: 'celebrityMerge',
            title: 'Celebrity merge',
            subtitle: 'pull at read',
            summary: 'merges huge-account posts at read time instead of fanning out',
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
    { id: 'writeFanout', label: 'Write fan-out amplification' },
    { id: 'celebrityFanout', label: 'Celebrity fan-out cost' },
    { id: 'feedCacheMemory', label: 'Feed cache memory' },
    { id: 'readMerge', label: 'Read merge cost' },
    { id: 'postStorage', label: 'Post write throughput' },
  ],
  decisions: [
    { id: 'fanoutStrategy', title: 'Fan-out strategy' },
    { id: 'feedCache', title: 'Feed cache' },
    { id: 'celebrity', title: 'Celebrity special-casing' },
    { id: 'postSharding', title: 'Post-store sharding' },
    { id: 'ranking', title: 'Ranking pipeline' },
  ],
  sourceBackedRules: [
    {
      title: 'Feeds are usually fan-out-on-write, with a hybrid for celebrities',
      source: 'System Design Primer',
      url: 'https://github.com/donnemartin/system-design-primer',
      summary:
        'The canonical write-up precomputes feeds by pushing posts to followers at write time, then special-cases very high-follower accounts by merging their posts at read time.',
    },
    {
      title: 'Redis backs per-user feed caches as sorted lists',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/develop/',
      summary:
        'In-memory sorted structures hold each user feed so a feed read is a single fast range fetch instead of a database join.',
    },
    {
      title: 'Kafka decouples post writes from heavy fan-out work',
      source: 'Apache Kafka',
      url: 'https://kafka.apache.org/documentation/',
      summary:
        'A durable log lets the post write return immediately while fan-out workers consume events and push into follower feeds asynchronously.',
    },
    {
      title: 'DynamoDB-style partitioning scales the post and graph stores',
      source: 'AWS DynamoDB',
      url: 'https://aws.amazon.com/dynamodb/',
      summary:
        'Partitioning posts and follow edges by key spreads storage and write throughput across nodes as the dataset outgrows one machine.',
    },
  ],
  teachingAssumptions: [
    'Write fan-out is modeled as posts/s times average followers; read fan-out as feed reads/s times followees merged.',
    'Single-node fan-out, cache, and store budgets are conservative teaching numbers, not vendor limits.',
    'Celebrity hybrid removes the largest accounts from write fan-out and adds a small per-read merge instead.',
  ],
  teachingWalkthrough: [
    {
      id: 'pull-on-read',
      step: '01',
      focus: 'Pull on read',
      scenarioId: 'tiny-app',
      question:
        'A small app does ~5 posts/s and ~200 feed reads/s with small follower counts. Do you need to precompute feeds, or can you build each feed on the fly?',
      reveal:
        'Build it on the fly. With low read volume you can pull recent posts from the people each user follows and merge them at read time. A fan-out service and a feed cache would be precomputed infrastructure for traffic that does not exist yet.',
      takeaway: 'At low scale, fan-out-on-read (pull and merge) is the simplest correct design.',
    },
    {
      id: 'push-fanout',
      step: '02',
      focus: 'Reads dominate',
      scenarioId: 'growth',
      question:
        'Now 120k feed reads/s vastly outnumber 2k posts/s. If every read re-merges its followees live, what breaks, and what is the fix?',
      reveal:
        'Re-merging on every read repeats the same expensive join millions of times. Because reads dominate writes, flip the work to write time: a fan-out worker pushes each new post into every follower feed cache, so a read becomes a single cache fetch.',
      takeaway: 'When reads dominate, precompute feeds by fanning out on write into a feed cache.',
    },
    {
      id: 'celebrity',
      step: '03',
      focus: 'Celebrity fan-out explodes',
      scenarioId: 'celebrity-joins',
      question:
        'A celebrity with 40M followers posts. Pure push fan-out must write 40M feed entries for one post. Is that acceptable, and what would you change?',
      reveal:
        'It is not — one post triggers tens of millions of cache writes, a "hot key" storm that stalls everyone. The hybrid fix stops fanning out the largest accounts; their posts are instead pulled and merged at read time, so a follower pays a tiny per-read cost rather than the system paying a giant per-write cost.',
      takeaway: 'Celebrities break write fan-out; special-case them with read-time merge (hybrid fan-out).',
    },
    {
      id: 'ranking',
      step: '04',
      focus: 'Ranked instead of chronological',
      scenarioId: 'ranked-feed',
      question:
        'Product wants the most relevant posts first, not the newest. Can you just sort the cached feed by a score, or does ranking need its own pipeline?',
      reveal:
        'Relevance scoring needs features (engagement, recency, affinity) and model inference per item, which is far heavier than a timestamp sort. It belongs in a ranking service the feed call fans out to, often with precomputed candidate sets and feature stores so the read stays within budget.',
      takeaway: 'Ranking is a pipeline, not a sort: candidate generation, scoring, and reordering off the feed-cache fetch.',
    },
    {
      id: 'global',
      step: '05',
      focus: 'Global scale',
      scenarioId: 'global-scale',
      question:
        'At 400k posts/s and 4M feed reads/s worldwide, can one post store and one feed-cache cluster hold this?',
      reveal:
        'No — post storage, the follow graph, the feed cache, and fan-out throughput all exceed single clusters. Shard the post store and graph by key, partition the feed cache by user, run fan-out as a partitioned stream, and place caches in regions so reads resolve near the user.',
      takeaway: 'At global scale every tier is partitioned: sharded stores, partitioned caches, and regional placement.',
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
          ? `Each of ${formatRate(postsPerSecond)} posts/s fans out to ~${formatCount(
              averageFollowers,
            )} followers — about ${formatRate(writeFanoutPerSecond)} feed writes/s.`
          : 'Feeds are pulled on read, so there is no write fan-out yet.',
      },
      celebrityFanout: {
        ratio: celebrityFanoutBurst / comfortableCelebrityFanoutPerSecond,
        valueText: celebrityHybrid
          ? 'merged on read'
          : `${formatCount(celebrityFanoutBurst)} writes/post`,
        copy: celebrityHybrid
          ? 'Hybrid fan-out pulls huge-account posts at read time, so one celebrity post is not a write storm.'
          : `One ${formatCount(celebrityFollowers)}-follower post pushes that many feed entries at once — a hot-key fan-out storm.`,
      },
      feedCacheMemory: {
        ratio: feedCacheGigabytes / comfortableFeedCacheGigabytes,
        valueText: formatStorageGigabytes(feedCacheGigabytes),
        copy: needsFeedCache
          ? `${formatCount(dailyActiveUsers)} feeds of ${formatCount(
              feedSize,
            )} posts at ~${bytesPerFeedEntry} bytes each.`
          : 'No feed cache yet — feeds are assembled on demand.',
      },
      readMerge: {
        ratio: readMergeFanoutPerSecond / comfortableReadMergeFanoutPerSecond,
        valueText: `${formatRate(readMergeFanoutPerSecond)}/s`,
        copy: needsFanout
          ? celebrityHybrid
            ? 'Reads are cheap cache fetches plus a small merge of a few celebrity posts.'
            : 'Reads are single cache fetches; nothing is merged at read time.'
          : `Each of ${formatRate(feedReadsPerSecond)} reads/s merges ~${formatCount(
              averageFollowers,
            )} followees live.`,
      },
      postStorage: {
        ratio: postsPerSecond / comfortablePostStoreWritesPerSecond,
        valueText: `${formatRate(postsPerSecond)}/s`,
        copy: needsPostSharding
          ? `${formatRate(postsPerSecond)} posts/s and ${formatCount(
              dailyActiveUsers,
            )} users exceed one store; shard posts and the follow graph by key.`
          : `${formatRate(postsPerSecond)} posts/s fit in a single durable store for now.`,
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
      text: `Reads outnumber writes ~${Math.round(
        analysis.readWriteRatio,
      )}:1, so precompute feeds: push each post to followers (~${formatRate(
        analysis.writeFanoutPerSecond,
      )} feed writes/s) into a feed cache.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatRate(
        analysis.feedReadsPerSecond,
      )} feed reads/s is low enough to pull recent posts from followees and merge them on read.`,
    });
  }

  // Celebrity status: always reported once fan-out is on, otherwise a low-scale note.
  if (analysis.needsCelebrityCase) {
    reasons.push({
      severity: analysis.celebrityHybrid ? 'ok' : 'danger',
      text: analysis.celebrityHybrid
        ? `Celebrity posts (${formatCount(
            analysis.celebrityFollowers,
          )} followers) are merged at read time, avoiding a single-post fan-out storm.`
        : `A ${formatCount(
            analysis.celebrityFollowers,
          )}-follower post would push that many feed writes at once; switch the largest accounts to hybrid read-time merge.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `The largest accounts have ${formatCount(
        analysis.celebrityFollowers,
      )} followers — small enough that uniform fan-out is not yet a write storm.`,
    });
  }

  // Feed cache memory: always reported (warning only when it outgrows one cluster).
  if (analysis.feedCacheGigabytes > comfortableFeedCacheGigabytes) {
    reasons.push({
      severity: 'warning',
      text: `The feed cache needs ~${formatStorageGigabytes(
        analysis.feedCacheGigabytes,
      )} across ${formatCount(analysis.dailyActiveUsers)} users; partition it by user.`,
    });
  } else if (analysis.needsFeedCache) {
    reasons.push({
      severity: 'ok',
      text: `Precomputed feeds fit in ~${formatStorageGigabytes(
        analysis.feedCacheGigabytes,
      )} of cache, so a read is a single fetch.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'No feed cache is needed yet; feeds are assembled on demand from the post store.',
    });
  }

  // Ranking: always reported.
  if (analysis.needsRanking) {
    reasons.push({
      severity: 'warning',
      text: `A ranked feed scores ~${Math.round(
        analysis.rankingCost,
      )}x heavier than a timestamp sort; run scoring in a ranking pipeline off the feed-cache fetch.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'The feed stays reverse-chronological, so assembling it is an ordered merge with no scoring.',
    });
  }

  if (analysis.needsPostSharding) {
    reasons.push({
      severity: 'warning',
      text: `${formatRate(analysis.postsPerSecond)} posts/s and ${formatCount(
        analysis.dailyActiveUsers,
      )} users exceed one node; shard the post store and follow graph by key.`,
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
    ? 'Fan-out-on-read: pull recent posts from followees and merge at read time while volume is low.'
    : flags.celebrityHybrid
      ? 'Hybrid fan-out: push for normal accounts, pull-and-merge for the largest accounts at read time.'
      : `Fan-out-on-write: push each post to ~${formatCount(
          flags.averageFollowers,
        )} follower feeds so reads are single cache fetches.`;

  return {
    fanoutStrategy: {
      state: flags.needsFanout ? (flags.celebrityHybrid ? 'tradeoff' : 'needed') : 'useful',
      copy: fanoutStrategyCopy,
    },
    feedCache: {
      state: flags.needsFeedCache ? 'needed' : 'not-yet',
      copy: flags.needsFeedCache
        ? 'Keep each user feed as a precomputed list (Redis sorted set) so a read is one fetch.'
        : 'No feed cache yet — feeds are assembled on demand from the post store.',
    },
    celebrity: {
      state: flags.needsCelebrityCase ? (flags.celebrityHybrid ? 'needed' : 'tradeoff') : 'not-yet',
      copy: flags.needsCelebrityCase
        ? flags.celebrityHybrid
          ? `Skip write fan-out for ${formatCount(
              flags.celebrityFollowers,
            )}-follower accounts; merge their posts when the feed is read.`
          : `Pure push fan-out for a ${formatCount(
              flags.celebrityFollowers,
            )}-follower account is a write storm — special-case it.`
        : 'Follower counts are small enough that uniform fan-out is fine.',
    },
    postSharding: {
      state: flags.needsPostSharding ? 'needed' : 'not-yet',
      copy: flags.needsPostSharding
        ? 'Shard the post store and follow graph by key so storage and write throughput scale out.'
        : 'A single post store and graph hold the data while it fits on one node.',
    },
    ranking: {
      state: flags.needsRanking ? 'tradeoff' : 'not-yet',
      copy: flags.needsRanking
        ? `Score feed items in a ranking pipeline (~${Math.round(
            flags.rankingCost,
          )}x the cost of a sort); trades freshness and simplicity for relevance.`
        : 'The feed is reverse-chronological, so no ranking pipeline is needed yet.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsFanout && !flags.needsFeedCache && !flags.needsRanking) {
    return 'Pull-on-read feed';
  }
  if (flags.needsPostSharding && (flags.needsRanking || flags.needsCelebrityCase)) {
    return 'Sharded hybrid fan-out + ranking';
  }
  if (flags.needsRanking) {
    return 'Push fan-out + ranking pipeline';
  }
  if (flags.needsCelebrityCase) {
    return 'Hybrid fan-out + feed cache';
  }
  return 'Push fan-out + feed cache';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsFanout && !flags.needsFeedCache && !flags.needsRanking) {
    return 'Each feed is built on the fly by pulling recent posts from the people a user follows and merging them. Nothing is precomputed yet.';
  }
  if (flags.needsPostSharding && (flags.needsRanking || flags.needsCelebrityCase)) {
    return 'Normal posts fan out on write into a partitioned feed cache; huge accounts are merged at read time, a ranking pipeline reorders the feed, and the post store and graph are sharded across regions.';
  }
  if (flags.needsRanking) {
    return 'Posts fan out on write into a feed cache, and a ranking pipeline scores and reorders the cached items by relevance before the feed is returned.';
  }
  if (flags.needsCelebrityCase) {
    return 'Normal accounts fan out on write into a per-user feed cache, while the largest accounts are pulled and merged at read time so one post is not a write storm.';
  }
  return 'Posts fan out on write into per-user feed caches, so a feed read is a single fast cache fetch instead of a live merge.';
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
