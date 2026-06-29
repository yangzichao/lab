import { buildColumnDiagram } from '../diagram-layout';
import {
  formatCount,
  formatRate,
} from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative single-node teaching budgets (not vendor limits).
const bruteForceScoreBudget = 20_000_000; // candidate scores/s a brute-force scorer can do before ANN pays off
const rankingServerBudget = 200; // servers before ranking becomes its own scaling problem
const featureLookupsPerServerSecond = 50_000; // feature-store point reads/s a single node serves comfortably
const annIndexNodeCapacityItems = 50_000_000; // items one ANN index node holds comfortably in memory
const comfortableServingQps = 5_000; // requests/s one serving tier handles before fan-out coordination strains
const rankingScoresPerServerSecondBase = 50_000; // candidate scores/s a ranking server does at a 20 ms, ~10-feature baseline
const endToEndLatencyBudgetMs = 100; // fixed funnel budget the whole pipeline must fit under

// Soft-cap a raw overload ratio: identity at/under 1.0, log-compressed above so a 10,000x
// overload still renders as a readable, differentiating number instead of exploding the gauge.
function softCapRatio(rawRatio: number): number {
  if (rawRatio <= 1) {
    return rawRatio;
  }
  return 1 + Math.log10(rawRatio);
}

export const recommendationSystemLabDefinition: SystemDesignLabDefinition = {
  id: 'recommendation-system',
  eyebrow: '系统设计 Lab',
  title:
    '推荐系统是一个 funnel：廉价的 retrieval 把数百万 item 收窄到几百个，然后一个昂贵的 ranker 给幸存者打分。',
  summary:
    '调节用户数、catalog 大小、请求速率、每请求 retrieve 的 candidate 数、ranking 模型延迟、embedding 维度和 feature 数量。设计会从一个 popularity list，走到 collaborative filtering，再到带 ANN retrieval 的 two-tower embedding，然后是由 feature store 支撑的 ranking model，最后到 real-time feature 和规模化的完整 multi-stage serving。',
  controls: [
    {
      id: 'activeUsers',
      label: '活跃用户',
      help: '能够请求推荐的用户；驱动请求量和 per-user 状态。',
      min: 1_000,
      max: 2_000_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: '人',
      format: 'count',
    },
    {
      id: 'catalogItems',
      label: 'Catalog 大小',
      help: '可能被推荐的全部 item（视频、商品、帖子）。这是 retrieval 要在里面找的草垛。',
      min: 1_000,
      max: 5_000_000_000,
      defaultValue: 10_000_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'recsQps',
      label: '推荐请求速率',
      help: '每秒请求一个排好序的列表的请求数。主导的 online 流量。',
      min: 10,
      max: 2_000_000,
      defaultValue: 5_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'candidatesPerRequest',
      label: '每请求 candidate 数',
      help: 'retrieval 每请求交给 ranker 的 item 数。candidate 越多 recall 越好，但打分的活儿也越多。',
      min: 50,
      max: 50_000,
      defaultValue: 500,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'rankingLatencyMs',
      label: 'Ranking 模型延迟',
      help: 'ranking model 给一个 candidate batch 打分所需的时间。目标越紧，就越逼着用更小的模型或更多 server。',
      min: 2,
      max: 200,
      defaultValue: 30,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'embeddingDim',
      label: 'Embedding 维度',
      help: 'two-tower 的 user/item embedding 的向量宽度。向量越宽，内存和 ANN 计算成本越高。',
      min: 16,
      max: 1_024,
      defaultValue: 128,
      scale: 'log',
      unit: '维',
      format: 'count',
    },
    {
      id: 'featureCount',
      label: '每 candidate 的 feature 数',
      help: 'ranker 为每个 user-item pair 拉取的 feature 数。每一个都是 hot path 上的一次 feature-store lookup。',
      min: 5,
      max: 2_000,
      defaultValue: 100,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'realtimeFeatures',
      label: 'Real-time feature',
      help: '从实时交互（最近的点击、session）更新 feature，而不只是用 batch 算出来的那些。',
      defaultValue: false,
    },
    {
      id: 'twoTowerAnn',
      label: 'Two-tower ANN retrieval',
      help: '用 approximate nearest neighbor 在学到的 embedding 上 retrieve candidate，而不是用 popularity 或 co-visitation list。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'popularity-baseline',
      step: '01',
      title: 'Popularity baseline',
      summary: '所有人都从一个小 catalog 里拿到相同的 top item。',
      values: {
        activeUsers: 20_000,
        catalogItems: 5_000,
        recsQps: 50,
        candidatesPerRequest: 50,
        rankingLatencyMs: 50,
        embeddingDim: 16,
        featureCount: 5,
        realtimeFeatures: false,
        twoTowerAnn: false,
      },
    },
    {
      id: 'collaborative-filtering',
      step: '02',
      title: 'Collaborative filtering',
      summary: 'co-visitation 给出 per-user 列表，但 recall 很薄。',
      values: {
        activeUsers: 2_000_000,
        catalogItems: 500_000,
        recsQps: 2_000,
        candidatesPerRequest: 120,
        rankingLatencyMs: 40,
        embeddingDim: 32,
        featureCount: 20,
        realtimeFeatures: false,
        twoTowerAnn: false,
      },
    },
    {
      id: 'two-tower-ann',
      step: '03',
      title: 'Two-tower + ANN retrieval',
      summary: '学到的 embedding 在一个大 catalog 上 retrieve candidate。',
      values: {
        activeUsers: 50_000_000,
        catalogItems: 50_000_000,
        recsQps: 20_000,
        candidatesPerRequest: 150,
        rankingLatencyMs: 35,
        embeddingDim: 128,
        featureCount: 30,
        realtimeFeatures: false,
        twoTowerAnn: true,
      },
    },
    {
      id: 'ranking-feature-store',
      step: '04',
      title: 'Ranking model + feature store',
      summary: '一个重型 ranker 用大量存储的 feature 给 candidate 打分。',
      values: {
        activeUsers: 200_000_000,
        catalogItems: 300_000_000,
        recsQps: 150_000,
        candidatesPerRequest: 2_000,
        rankingLatencyMs: 20,
        embeddingDim: 256,
        featureCount: 400,
        realtimeFeatures: false,
        twoTowerAnn: true,
      },
    },
    {
      id: 'realtime-multistage',
      step: '05',
      title: '规模化的 real-time multi-stage',
      summary: '实时 feature、数十亿 item、整条 funnel 控制在 30 ms 以内。',
      values: {
        activeUsers: 1_500_000_000,
        catalogItems: 3_000_000_000,
        recsQps: 1_200_000,
        candidatesPerRequest: 10_000,
        rankingLatencyMs: 8,
        embeddingDim: 512,
        featureCount: 1_200,
        realtimeFeatures: true,
        twoTowerAnn: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: '推荐系统架构图',
    description:
      '白板风格的架构图，展示一个 multi-stage 推荐系统：客户端、serving API、用 two-tower model 和 ANN index 做的 candidate retrieval、带 feature store 的 ranking model、item index 和 feature store，以及一条异步的 interaction-logging 和训练数据路径。',
    columns: [
      {
        id: 'clients',
        label: '客户端',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'feed + 点击',
            kind: 'client',
            summary: '请求一个排好序的列表，并发出点击、观看等交互',
          },
        ],
      },
      {
        id: 'serving',
        label: 'Serving API',
        variant: 'edge',
        nodes: [
          {
            id: 'servingApi',
            title: 'Serving API',
            subtitle: '编排 funnel',
            kind: 'api',
            summary: '在 latency budget 内把一个请求扇过 retrieval、ranking 和 re-ranking',
          },
          {
            id: 'reranker',
            title: 'Re-ranker',
            subtitle: '规则 + diversity',
            kind: 'service',
            summary: '在返回前给排好序的列表施加业务规则、diversity 和新鲜度',
          },
        ],
      },
      {
        id: 'retrieval',
        label: 'Retrieval',
        variant: 'backbone',
        nodes: [
          {
            id: 'twoTower',
            title: 'Two-tower model',
            subtitle: 'user embedding',
            kind: 'gpu',
            summary: '把 user query 嵌入成向量，好按距离找到相似的 item 向量',
          },
          {
            id: 'annIndex',
            title: 'ANN search',
            subtitle: '最近的 item',
            kind: 'search',
            summary: '在数百万 item 上以毫秒级找到近似最近邻的 item 向量',
          },
        ],
      },
      {
        id: 'ranking',
        label: 'Ranking',
        variant: 'processing',
        nodes: [
          {
            id: 'rankingModel',
            title: 'Ranking model',
            subtitle: '给 candidate 打分',
            kind: 'gpu',
            summary: '用一个重型模型、借助大量 user-item feature 给每个 candidate 打分',
          },
          {
            id: 'featureStore',
            title: 'Feature store',
            subtitle: 'online feature',
            kind: 'cache',
            summary: '低延迟地为每个 user-item pair 提供预计算和实时的 feature',
          },
        ],
      },
      {
        id: 'stores',
        label: '存储',
        variant: 'storage',
        nodes: [
          {
            id: 'itemIndex',
            title: 'Item index',
            subtitle: '向量 + meta',
            kind: 'search',
            summary: '保存 item embedding 和 metadata，随 catalog 增长做 shard',
          },
          {
            id: 'featureDb',
            title: 'Feature DB',
            subtitle: 'feature 值',
            kind: 'db',
            summary: 'online feature store 背后的 batch 和 streaming feature 的 durable 存储',
          },
        ],
      },
      {
        id: 'async',
        label: '训练回路',
        variant: 'processing',
        nodes: [
          {
            id: 'interactionLog',
            title: 'Interaction log',
            subtitle: 'click stream',
            kind: 'stream',
            summary: '在 hot path 之外捕获 impression 和参与度，供训练和实时 feature 使用',
          },
          {
            id: 'trainer',
            title: 'Training job',
            subtitle: 'embedding + ranker',
            kind: 'compute',
            summary: '从记录的交互里重建 embedding 和 ranking model',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'servingApi', variant: 'primary' },
      { from: 'servingApi', to: 'twoTower', variant: 'primary' },
      { from: 'servingApi', to: 'reranker', variant: 'secondary' },
      { from: 'twoTower', to: 'annIndex', variant: 'primary' },
      { from: 'annIndex', to: 'rankingModel', variant: 'primary' },
      { from: 'rankingModel', to: 'featureStore', variant: 'primary' },
      { from: 'annIndex', to: 'itemIndex', variant: 'secondary' },
      { from: 'featureStore', to: 'featureDb', variant: 'secondary' },
      { from: 'servingApi', to: 'interactionLog', variant: 'direct' },
      { from: 'interactionLog', to: 'trainer', variant: 'primary' },
      { from: 'interactionLog', to: 'featureStore', variant: 'direct' },
    ],
  }),
  meters: [
    { id: 'retrievalLoad', label: 'Retrieval 扫描成本' },
    { id: 'rankingCompute', label: 'Ranking 计算' },
    { id: 'featureLoad', label: 'Feature-store 负载' },
    { id: 'indexMemory', label: 'Item index 内存' },
    { id: 'latencyBudget', label: '端到端延迟预算' },
  ],
  decisions: [
    { id: 'candidateGen', title: 'Candidate generation' },
    { id: 'rankingServing', title: 'Ranking model serving' },
    { id: 'featureStore', title: 'Feature store' },
    { id: 'annIndex', title: 'ANN index' },
    { id: 'reranking', title: 'Re-ranking + 业务规则' },
    { id: 'trainingLog', title: '训练数据 logging' },
  ],
  sourceBackedRules: [
    {
      title: 'Sampling-Bias-Corrected Neural Modeling (Yi et al., 2019)',
      source: 'Google Research',
      url: 'https://research.google/pubs/sampling-bias-corrected-neural-modeling-for-large-corpus-item-recommendations/',
      summary:
        '分开的 user tower 和 item tower 产出 embedding，其点积近似相关性，于是 retrieval 就变成在预计算好的 item 向量上做 nearest-neighbor 搜索。',
    },
    {
      title: 'ANN 搜索让 nearest-neighbor retrieval 扩展到数十亿向量',
      source: 'ScaNN (Google Research)',
      url: 'https://github.com/google-research/google-research/tree/master/scann',
      summary:
        'approximate nearest neighbor 库（ScaNN、FAISS）和 vector database 用一点点 recall 换来快几个数量级的相似度搜索，正是这点让 retrieval 能在毫秒内扫过一个巨大的 catalog。',
    },
    {
      title: 'feature store 在 online 和 offline 提供同一套 feature',
      source: 'Feast',
      url: 'https://docs.feast.dev/',
      summary:
        'feature store 为 serving 提供低延迟的 online feature lookup，为训练提供一致的历史 feature，从而避免 training/serving skew。',
    },
    {
      title: '大规模推荐是分阶段的：先 candidate generation 再 ranking',
      source: 'System Design Primer',
      url: 'https://github.com/donnemartin/system-design-primer',
      summary:
        '经典模式是先用一个廉价的 retrieval 阶段把巨大的 item 集合收窄，再让更昂贵的 ranking 阶段给幸存者打分，于是重型计算只触及几百个 item。',
    },
  ],
  teachingAssumptions: [
    'retrieval 成本被建模成一次 per-request 扫描，ANN 把它从随 catalog 大小线性变成大致对数级，所以 brute force 只在小 catalog 上还活得下去。',
    '每台 server 的 ranking throughput 会随模型延迟和 feature 数量下降；这些数字是保守的教学预算，不是厂商 benchmark。',
    'feature-store 负载按每请求每 candidate 每 feature 一次 lookup 来算，是 batching 和 caching 之前的最坏情况。',
  ],
  teachingWalkthrough: [
    {
      id: 'baseline',
      step: '01',
      focus: '所有人同一个列表',
      scenarioId: 'popularity-baseline',
      question:
        '每秒几个请求、5k 个 item，你只想要"够用"的推荐。你真的需要 embedding、ANN 或 ranking model 吗？',
      reveal:
        '不需要。一个预计算的 popularity 或 trending 列表，定期重算，就能从一个很小的 cache 里回答每个请求。这里没有 per-user 信号可建模，catalog 也没大到无法枚举——embedding 和 ranker 纯属额外开销。',
      takeaway: '从 popularity baseline 起步；personalization 只有在能打败它之后，才配得上它的复杂度。',
    },
    {
      id: 'cf',
      step: '02',
      focus: 'Per-user 列表',
      scenarioId: 'collaborative-filtering',
      question:
        '现在 2M 用户想要个性化列表。co-visitation（"看了 X 的人也看了 Y"）给每个用户一批 candidate。为什么 catalog 一变大这套就开始出问题？',
      reveal:
        'co-visitation 只推荐和用户已经接触过的东西共同出现的 item，所以 cold item 和长尾兴趣是看不见的，recall 一直很薄。它还需要一张很大的预计算 item-item 表。它能用，但没法像学到的 embedding 那样泛化。',
      takeaway: 'collaborative filtering 个性化便宜，但 recall 差，且无法泛化到 cold item。',
    },
    {
      id: 'twotower',
      step: '03',
      focus: '在数百万 item 上做 retrieval',
      scenarioId: 'two-tower-ann',
      question:
        'catalog 现在有 50M item。要找出最好的 candidate，你得拿 user 和每个 item 打分。哪里会崩，又用什么替掉 brute-force 扫描？',
      reveal:
        '每请求给 50M item 打分在 online 太昂贵了。two-tower model 把 user 和 item 嵌入到同一个空间，ANN index（HNSW、IVF）以大致对数级的时间找到近似最近邻。retrieval 在毫秒内把数百万收窄到几百个 candidate。',
      takeaway: 'two-tower embedding 加 ANN 把 retrieval 从全量扫描变成一次快速的 nearest-neighbor lookup。',
    },
    {
      id: 'ranking',
      step: '04',
      focus: '给幸存者打分',
      scenarioId: 'ranking-feature-store',
      question:
        'retrieval 给出 2,000 个 candidate。一个每 candidate 带 400 个 feature 的重型 ranking model 现在要在 20 ms 内给它们打分。这部分负载落在哪，为什么要单独一个阶段？',
      reveal:
        'ranking 太昂贵，没法在整个 catalog 上跑，这正是 retrieval 先行的原因。在几百个 candidate 上它还负担得起，但每个 candidate 都需要上百次 feature lookup，于是 hot path 上一个低延迟的 feature store 变得不可或缺，ranking server 也必须 fanout 才能守住 latency budget。',
      takeaway: 'ranking 是昂贵的那个阶段；它能成立只因为 retrieval 缩小了输入，而它的生死系于 feature store。',
    },
    {
      id: 'realtime',
      step: '05',
      focus: '实时、数十亿、30 ms 以内',
      scenarioId: 'realtime-multistage',
      question:
        '数十亿 item、来自当前 session 的 real-time feature，以及整条 funnel 控制在 30 ms 以内。加上实时 feature 会带来 batch feature 没有的什么成本？',
      reveal:
        'real-time feature 在数秒内闭合从 interaction log 到 feature store 的回路，于是 funnel 反映当前 session——但它在 hot path 上加了一条 streaming pipeline 和更紧的 feature-store 读写路径。item index 必须跨节点 shard，retrieval 和 ranking 都要 fanout，re-ranking 还要在同样紧的预算内执行 diversity 和业务规则。',
      takeaway: 'real-time feature 为新鲜度加了一条 streaming pipeline；到了规模阶段，每个阶段都 shard，latency budget 掌管整条 funnel。',
    },
  ],
  analyze: analyzeRecommendationWorkload,
};

function analyzeRecommendationWorkload(workload: WorkloadValues): LabAnalysis {
  const activeUsers = numericValue(workload, 'activeUsers');
  const catalogItems = numericValue(workload, 'catalogItems');
  const recsQps = numericValue(workload, 'recsQps');
  const candidatesPerRequest = numericValue(workload, 'candidatesPerRequest');
  const rankingLatencyMs = numericValue(workload, 'rankingLatencyMs');
  const embeddingDim = numericValue(workload, 'embeddingDim');
  const featureCount = numericValue(workload, 'featureCount');
  const realtimeFeatures = Boolean(workload.realtimeFeatures);
  const twoTowerAnn = Boolean(workload.twoTowerAnn);

  // Serving tier: requests come from recsQps directly plus a personalization-state pull that
  // scales with the active-user base, so a larger audience fans the serving tier out further.
  const impliedServingQps = recsQps + activeUsers / 50_000;
  const servingFanout = impliedServingQps / comfortableServingQps;

  // Retrieval. A non-embedding strategy (popularity cache or co-visitation table) answers from a
  // precomputed list, so its live cost scales with request rate, not catalog size. Two-tower + ANN
  // turns retrieval into a roughly logarithmic nearest-neighbor search. Brute-force scoring of the
  // whole catalog per request is the thing ANN replaces; its (infeasible) cost motivates the switch.
  const bruteForceScansPerSecond = catalogItems * recsQps;
  const needsAnn = bruteForceScansPerSecond > bruteForceScoreBudget;
  const listLookupCost = recsQps; // popularity / co-visitation point lookups
  const annScanCost = Math.log2(Math.max(catalogItems, 2)) * recsQps * (embeddingDim / 64);
  const retrievalCost = twoTowerAnn ? annScanCost : listLookupCost;
  const retrievalBudget = twoTowerAnn ? 1_300_000 : 1_000_000;

  // Ranking only enters once retrieval is two-tower (it scores what ANN retrieves) and the candidate
  // set or feature richness warrants a learned scorer. Per-server throughput falls as the model gets
  // tighter (lower latency) and pulls more features (sub-linear penalty).
  const rankingScoresPerSecond = recsQps * candidatesPerRequest;
  const needsRankingModel = twoTowerAnn && (candidatesPerRequest > 150 || featureCount > 30);
  const perServerScoreRate =
    rankingScoresPerServerSecondBase *
    (20 / Math.max(rankingLatencyMs, 2)) /
    Math.sqrt(Math.max(featureCount, 1) / 10);
  const rankingServersNeeded = rankingScoresPerSecond / Math.max(perServerScoreRate, 1);
  const needsRankingFanout = needsRankingModel && rankingServersNeeded > 1;

  // Feature store: one lookup per feature per candidate per request (worst case). Only on the hot
  // path once a ranking model is pulling features per candidate.
  const featureLookupsPerSecond = rankingScoresPerSecond * featureCount;
  const needsFeatureStore =
    needsRankingModel && (featureLookupsPerSecond > featureLookupsPerServerSecond || featureCount > 30);

  // Item index memory: catalog vectors + metadata. Only a vector index when retrieval is embedding-based.
  const itemIndexMemoryRatio = twoTowerAnn ? (catalogItems / annIndexNodeCapacityItems) * (embeddingDim / 128) : 0;
  const needsIndexSharding = twoTowerAnn && catalogItems > annIndexNodeCapacityItems;

  const needsReranking = needsRankingModel || (twoTowerAnn && candidatesPerRequest > 300);
  const needsTrainingLog = twoTowerAnn || needsRankingModel || realtimeFeatures;
  const personalizes = twoTowerAnn || needsRankingModel || activeUsers > 100_000;

  // Latency budget: pressure RISES with workload. More active funnel stages lengthen the serial
  // critical path, more candidates scored per request add work, and a higher serving fan-out adds
  // cross-tier coordination — all measured against a fixed end-to-end budget.
  const stagesActive =
    1 +
    (twoTowerAnn ? 1 : 0) +
    (needsRankingModel ? 1 : 0) +
    (needsReranking ? 1 : 0) +
    (realtimeFeatures ? 1 : 0);
  const candidateWorkFactor = Math.log2(Math.max(candidatesPerRequest, 2)) / Math.log2(50);
  const fanoutFactor = 1 + Math.max(0, Math.log10(Math.max(servingFanout, 0.0001))) * 0.18;
  const latencyPressure =
    (stagesActive / 3) *
    candidateWorkFactor *
    Math.max(fanoutFactor, 1) *
    (realtimeFeatures ? 1.15 : 1) *
    (needsRankingFanout ? 1.1 : 1);

  const flags = {
    needsAnn,
    twoTowerAnn,
    needsRankingModel,
    needsRankingFanout,
    needsFeatureStore,
    needsIndexSharding,
    needsReranking,
    needsTrainingLog,
    realtimeFeatures,
    personalizes,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      // Serving tier fans out with implied QPS; it never goes inactive (every request enters here).
      servingApi: servingFanout > 3 ? 'overloaded' : servingFanout > 1 ? 'warning' : 'ok',
      reranker: flags.needsReranking ? 'needed' : 'inactive',
      twoTower: flags.twoTowerAnn ? 'needed' : 'inactive',
      // ANN index only lights up behind the two-tower retrieval path, so its inbound edge is always active.
      annIndex: flags.twoTowerAnn ? (flags.needsIndexSharding ? 'warning' : 'needed') : 'inactive',
      rankingModel: flags.needsRankingModel ? (flags.needsRankingFanout ? 'warning' : 'needed') : 'inactive',
      featureStore: flags.needsFeatureStore ? 'needed' : 'inactive',
      itemIndex: flags.twoTowerAnn ? (flags.needsIndexSharding ? 'needed' : 'ok') : 'inactive',
      featureDb: flags.needsFeatureStore ? 'ok' : 'inactive',
      interactionLog: flags.needsTrainingLog ? 'needed' : 'inactive',
      trainer: flags.needsTrainingLog ? 'ok' : 'inactive',
    },
    flowStates: {
      // Every flow is gated on the SAME conditions that activate BOTH its source and target nodes,
      // so an active edge never originates from or points into an inactive node.
      clientToServingApi: 'active',
      servingApiToTwoTower: flags.twoTowerAnn ? 'active' : 'inactive',
      servingApiToReranker: flags.needsReranking ? 'active' : 'inactive',
      twoTowerToAnnIndex: flags.twoTowerAnn ? 'active' : 'inactive',
      annIndexToRankingModel: flags.needsRankingModel ? 'active' : 'inactive',
      rankingModelToFeatureStore: flags.needsFeatureStore ? 'active' : 'inactive',
      annIndexToItemIndex: flags.twoTowerAnn ? 'active' : 'inactive',
      featureStoreToFeatureDb: flags.needsFeatureStore ? 'active' : 'inactive',
      servingApiToInteractionLog: flags.needsTrainingLog ? 'active' : 'inactive',
      interactionLogToTrainer: flags.needsTrainingLog ? 'active' : 'inactive',
      interactionLogToFeatureStore: flags.realtimeFeatures && flags.needsFeatureStore ? 'active' : 'inactive',
    },
    meters: {
      retrievalLoad: {
        ratio: softCapRatio(retrievalCost / retrievalBudget),
        valueText: twoTowerAnn
          ? `ANN，~${formatCount(catalogItems)} 个 item`
          : `${formatRate(retrievalCost)} lookups/s`,
        copy: twoTowerAnn
          ? `在约 ${formatCount(catalogItems)} 个 item 向量上做 ANN search（ScaNN、FAISS 或 vector DB），让 retrieval 大致保持对数级，而不是把所有东西都扫一遍。`
          : needsAnn
            ? `一个预计算的列表能廉价地回答每个请求，但对全部 ${formatCount(catalogItems)} 个 item 做 brute-force 打分会是 ${formatRate(bruteForceScansPerSecond)} 次比较/s——远超预算，这正是规模逼着改用学到的 ANN retrieval 的原因。`
            : `一个预计算的 popularity 或 co-visitation 列表从一个小 cache 里回答每个请求；没有 per-request 的 catalog 扫描。`,
      },
      rankingCompute: {
        ratio: needsRankingModel
          ? softCapRatio(rankingServersNeeded / rankingServerBudget)
          : softCapRatio(rankingScoresPerSecond / (bruteForceScoreBudget / 4)),
        valueText: needsRankingModel
          ? `~${formatCount(Math.max(rankingServersNeeded, 1))} 台 server`
          : `${formatRate(rankingScoresPerSecond)} scores/s`,
        copy: needsRankingModel
          ? `以 ${Math.round(rankingLatencyMs)} ms、${formatCount(featureCount)} 个 feature 给 ${formatRate(rankingScoresPerSecond)} 个 candidate/s 打分，大约需要 ${formatCount(Math.max(rankingServersNeeded, 1))} 台 ranking server。`
          : `${formatRate(rankingScoresPerSecond)} 次 candidate 打分/s 足够轻，retrieval 的顺序（或一个简单 scorer）就够了。`,
      },
      featureLoad: {
        ratio: needsFeatureStore
          ? Math.min(softCapRatio(featureLookupsPerSecond / (featureLookupsPerServerSecond * 20)), 9)
          : 0.05,
        valueText: needsFeatureStore ? `${formatRate(featureLookupsPerSecond)} reads/s` : '还没有 ranker',
        copy: needsFeatureStore
          ? `每 candidate ${formatCount(featureCount)} 个 feature，就是 ${formatRate(featureLookupsPerSecond)} 次 online lookup/s；hot path 上需要一个低延迟的 feature store。`
          : `还没有 ranking model 在拉取 per-candidate 的 feature，所以 hot path 上没有 feature-store 负载。`,
      },
      indexMemory: {
        ratio: softCapRatio(itemIndexMemoryRatio),
        valueText: twoTowerAnn ? `${formatCount(catalogItems)} 个向量` : '没有 vector index',
        copy: needsIndexSharding
          ? `${formatCount(catalogItems)} 个 item 向量、${Math.round(embeddingDim)} 维，超过单个 index node 的容量；给 item index 做 shard。`
          : twoTowerAnn
            ? `${formatCount(catalogItems)} 个向量、${Math.round(embeddingDim)} 维，仍然能放进一个 ANN index node。`
            : `retrieval 不基于 embedding 时，不会构建 vector index。`,
      },
      latencyBudget: {
        ratio: latencyPressure,
        valueText: `${stagesActive} 阶段 funnel`,
        copy:
          latencyPressure > 1
            ? `${stagesActive} 个活跃阶段，以 ${formatRate(impliedServingQps)} req/s 给每请求 ${formatCount(candidatesPerRequest)} 个 candidate 打分，把 funnel 推过了它 ${endToEndLatencyBudgetMs} ms 的端到端预算；各阶段必须 fanout。`
            : `一个 ${stagesActive} 阶段的 funnel，每请求给 ${formatCount(candidatesPerRequest)} 个 candidate 打分，能舒适地待在 ${endToEndLatencyBudgetMs} ms 的端到端预算内。`,
      },
    },
    decisions: buildDecisions({ ...flags, activeUsers, catalogItems, recsQps, candidatesPerRequest, featureCount, rankingServersNeeded }),
    reasons: buildReasons({
      ...flags,
      activeUsers,
      catalogItems,
      recsQps,
      candidatesPerRequest,
      featureCount,
      rankingLatencyMs,
      embeddingDim,
      bruteForceScansPerSecond,
      rankingScoresPerSecond,
      featureLookupsPerSecond,
      rankingServersNeeded,
      impliedServingQps,
      servingFanout,
      latencyPressure,
      stagesActive,
    }),
  };
}

type ArchitectureFlags = {
  needsAnn: boolean;
  twoTowerAnn: boolean;
  needsRankingModel: boolean;
  needsRankingFanout: boolean;
  needsFeatureStore: boolean;
  needsIndexSharding: boolean;
  needsReranking: boolean;
  needsTrainingLog: boolean;
  realtimeFeatures: boolean;
  personalizes: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    activeUsers: number;
    catalogItems: number;
    recsQps: number;
    candidatesPerRequest: number;
    featureCount: number;
    rankingLatencyMs: number;
    embeddingDim: number;
    bruteForceScansPerSecond: number;
    rankingScoresPerSecond: number;
    featureLookupsPerSecond: number;
    rankingServersNeeded: number;
    impliedServingQps: number;
    servingFanout: number;
    latencyPressure: number;
    stagesActive: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  // 1. Retrieval — always describe the chosen strategy so there is always a retrieval reason.
  if (analysis.twoTowerAnn) {
    reasons.push({
      severity: 'ok',
      text: `Two-tower ANN retrieval（ScaNN/FAISS 或 vector DB）每请求以大致对数级的时间，把 ${formatCount(
        analysis.catalogItems,
      )} 个 item 收窄到 ${formatCount(analysis.candidatesPerRequest)} 个 candidate。`,
    });
  } else if (analysis.needsAnn) {
    reasons.push({
      severity: 'warning',
      text: `预计算的列表仍能回答每个请求，但对全部 ${formatCount(
        analysis.catalogItems,
      )} 个 item 做 brute-force 打分会是 ${formatRate(
        analysis.bruteForceScansPerSecond,
      )} 次比较/s——在这个规模，把 retrieval 换成 two-tower embedding + ANN。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `预计算的 popularity 或 co-visitation 列表从 cache 里回答每个请求；${formatCount(
        analysis.catalogItems,
      )} 个 item 小到可以 offline 枚举。`,
    });
  }

  // 2. Personalization posture — always present.
  reasons.push({
    severity: 'ok',
    text: analysis.personalizes
      ? `${formatCount(analysis.activeUsers)} 个活跃用户需要 per-user 的 candidate，所以 retrieval 是个性化的，而不是一个全局列表。`
      : `${formatCount(analysis.activeUsers)} 个用户，还没有强的 per-user 信号——一个共享列表胜过个性化模型的复杂度。`,
  });

  // 3. Ranking.
  if (analysis.needsRankingModel) {
    reasons.push({
      severity: analysis.needsRankingFanout ? 'warning' : 'ok',
      text: `一个 ranking model 以 ${Math.round(
        analysis.rankingLatencyMs,
      )} ms 给 ${formatRate(analysis.rankingScoresPerSecond)} 个 candidate/s 打分${
        analysis.needsRankingFanout
          ? `，并且必须 fanout 到约 ${formatCount(Math.max(analysis.rankingServersNeeded, 1))} 台 server`
          : ''
      }。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatRate(
        analysis.rankingScoresPerSecond,
      )} 次 candidate 打分/s 足够轻，retrieval 的顺序（或一个简单 scorer）就够用了——还不需要单独的 ranking model。`,
    });
  }

  // 4. Feature store.
  if (analysis.needsFeatureStore) {
    reasons.push({
      severity: analysis.featureLookupsPerSecond > featureLookupsPerServerSecond * 20 ? 'danger' : 'warning',
      text: `每 candidate ${formatCount(analysis.featureCount)} 个 feature，意味着 ${formatRate(
        analysis.featureLookupsPerSecond,
      )} 次 online lookup/s——一个低延迟的 feature store 坐在 hot path 上。`,
    });
  }

  // 5. Index sharding.
  if (analysis.needsIndexSharding) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.catalogItems)} 个 item 向量、${Math.round(
        analysis.embeddingDim,
      )} 维，超过单个 index node 的容量；给 ANN 的 item index 做 shard。`,
    });
  }

  // 6. Real-time features.
  if (analysis.realtimeFeatures) {
    reasons.push({
      severity: 'warning',
      text: 'real-time feature 加了一条从 interaction log 到 feature store 的 streaming 路径，好让 funnel 反映当前 session。',
    });
  }

  // 7. Latency / serving — always present, and it backfills small scenarios up to >=4 reasons.
  reasons.push({
    severity: analysis.latencyPressure > 1 ? 'warning' : 'ok',
    text:
      analysis.latencyPressure > 1
        ? `一个 ${analysis.stagesActive} 阶段的 funnel 在 ${formatRate(
            analysis.impliedServingQps,
          )} req/s 下已逼近它的端到端延迟预算；各阶段必须 fanout 并并行 serve。`
        : `一个 ${analysis.stagesActive} 阶段的 funnel 在 ${formatRate(
            analysis.impliedServingQps,
          )} req/s 下能舒适地待在它的端到端延迟预算内。`,
  });

  // Training log — only added if there is still room, so it never inflates a busy scenario past 7.
  if (analysis.needsTrainingLog && reasons.length < 7) {
    reasons.push({
      severity: 'ok',
      text: '交互被异步记录下来，用于重训 embedding 和 ranker，而不触碰 serving 的 hot path。',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    activeUsers: number;
    catalogItems: number;
    recsQps: number;
    candidatesPerRequest: number;
    featureCount: number;
    rankingServersNeeded: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    candidateGen: {
      state: flags.twoTowerAnn ? 'needed' : flags.personalizes ? 'tradeoff' : 'not-yet',
      copy: flags.twoTowerAnn
        ? `two-tower embedding + ANN 在 ${formatCount(flags.catalogItems)} 个 item 上 retrieve candidate，recall 高，还能泛化到 cold item。`
        : flags.personalizes
          ? 'collaborative filtering（co-visitation）个性化便宜，但 recall 薄，无法泛化到 cold item——embedding 是下一步。'
          : '一个预计算的 popularity 或 trending 列表就够了；还没有 per-user 信号可建模。',
    },
    rankingServing: {
      state: flags.needsRankingModel ? (flags.needsRankingFanout ? 'needed' : 'useful') : 'not-yet',
      copy: flags.needsRankingModel
        ? `在 retrieve 出来的 ${formatCount(flags.candidatesPerRequest)} 个 candidate 上 serve 一个 ranking model${flags.needsRankingFanout ? `，并 fanout 到约 ${formatCount(Math.max(flags.rankingServersNeeded, 1))} 台 server 以守住延迟` : ''}。`
        : '还不需要单独的 ranking model——对当前负载，retrieval 的顺序已经够好。',
    },
    featureStore: {
      state: flags.needsFeatureStore ? 'needed' : 'not-yet',
      copy: flags.needsFeatureStore
        ? `一个 online feature store 低延迟地为每 candidate 提供 ${formatCount(flags.featureCount)} 个 feature，并与 offline 训练 feature 保持一致。`
        : 'feature 少、打分量低，意味着不值得专门上一个 online feature store。',
    },
    annIndex: {
      state: flags.twoTowerAnn ? (flags.needsIndexSharding ? 'needed' : 'useful') : 'not-yet',
      copy: flags.twoTowerAnn
        ? flags.needsIndexSharding
          ? '用一个 sharded 的 ANN index（ScaNN、FAISS/HNSW/IVF 或托管 vector DB），让 item 向量和搜索能扩展到单节点之外。'
          : '在 item 向量上用单个 ANN index（ScaNN、FAISS/HNSW/IVF 或 vector DB）来 serve nearest-neighbor retrieval。'
        : 'retrieval 不基于 embedding 时不需要 vector index。',
    },
    reranking: {
      state: flags.needsReranking ? 'needed' : 'not-yet',
      copy: flags.needsReranking
        ? '在返回前，为 diversity、新鲜度和业务规则对打好分的列表做 re-rank。'
        : '还没有 re-ranking 层；直接返回 popularity 列表。',
    },
    trainingLog: {
      state: flags.needsTrainingLog ? (flags.realtimeFeatures ? 'tradeoff' : 'useful') : 'not-yet',
      copy: flags.needsTrainingLog
        ? flags.realtimeFeatures
          ? '把交互记录到一个 stream，同时喂给 offline 训练和 real-time feature——后者在 hot path 上加了一条低延迟 pipeline。'
          : '异步记录 impression 和参与度，用于重训 embedding 和 ranker。'
        : '还没有训练回路；popularity 列表按一个简单的计划重算。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.twoTowerAnn && !flags.needsRankingModel && !flags.personalizes) {
    return 'Popularity list';
  }
  if (flags.realtimeFeatures && flags.needsIndexSharding) {
    return '规模化的 real-time multi-stage funnel';
  }
  if (flags.twoTowerAnn && flags.needsRankingModel) {
    return 'Two-tower retrieval + ranking model';
  }
  if (flags.twoTowerAnn) {
    return 'Two-tower + ANN retrieval';
  }
  if (flags.personalizes) {
    return 'Collaborative filtering';
  }
  return 'Popularity list';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.twoTowerAnn && !flags.needsRankingModel && !flags.personalizes) {
    return '一个预计算的 popularity 或 trending 列表从 cache 里回答每个请求。现在还不值得做 per-user 模型。';
  }
  if (flags.realtimeFeatures && flags.needsIndexSharding) {
    return '一个 sharded 的 ANN index 在数十亿 item 上做 retrieve，一个 fanout 的 ranking model 借助由实时交互喂养的 online feature store 给 candidate 打分，re-ranking 在紧的 latency budget 内执行 diversity。';
  }
  if (flags.twoTowerAnn && flags.needsRankingModel) {
    return 'two-tower embedding 和一个 ANN index 做 retrieve candidate，然后一个 ranking model 用来自 online feature store 的 feature 给它们打分，响应前再做 re-ranking。';
  }
  if (flags.twoTowerAnn) {
    return 'two-tower embedding 喂给一个 ANN index，让 retrieval 在毫秒内把一个大 catalog 收窄到几百个 candidate。';
  }
  if (flags.personalizes) {
    return 'collaborative filtering 从 co-visitation 构建 per-user 的 candidate 列表，个性化便宜但 recall 有限。';
  }
  return '一个预计算的 popularity 列表仍然能覆盖这个工作负载。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.twoTowerAnn && !flags.needsRankingModel && !flags.personalizes) {
    return 'Request -> popularity cache';
  }
  if (flags.realtimeFeatures && flags.needsIndexSharding) {
    return 'Request -> two-tower -> sharded ANN -> ranking (fanout) -> feature store -> re-rank';
  }
  if (flags.twoTowerAnn && flags.needsRankingModel) {
    return 'Request -> two-tower -> ANN -> ranking -> feature store -> re-rank';
  }
  if (flags.twoTowerAnn) {
    return 'Request -> two-tower -> ANN -> candidates';
  }
  if (flags.personalizes) {
    return 'Request -> co-visitation candidates -> list';
  }
  return 'Request -> popularity cache';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
