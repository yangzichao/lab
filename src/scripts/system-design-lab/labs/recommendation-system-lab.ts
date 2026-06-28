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
  eyebrow: 'System Design Lab',
  title:
    'A recommendation system is a funnel: cheap retrieval narrows millions of items to hundreds, then an expensive ranker scores what survives.',
  summary:
    'Change users, catalog size, request rate, candidates retrieved per request, ranking-model latency, embedding dimensions, and feature count. The design moves from a popularity list to collaborative filtering, then two-tower embeddings with ANN retrieval, then a ranking model backed by a feature store, and finally real-time features and full multi-stage serving at scale.',
  controls: [
    {
      id: 'activeUsers',
      label: 'Active users',
      help: 'Users who can request recommendations; drives request volume and per-user state.',
      min: 1_000,
      max: 2_000_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: 'users',
      format: 'count',
    },
    {
      id: 'catalogItems',
      label: 'Catalog size',
      help: 'Total items (videos, products, posts) that could be recommended. This is the haystack retrieval searches.',
      min: 1_000,
      max: 5_000_000_000,
      defaultValue: 10_000_000,
      scale: 'log',
      unit: 'items',
      format: 'count',
    },
    {
      id: 'recsQps',
      label: 'Recommendation rate',
      help: 'Requests per second asking for a ranked list. The dominant online traffic.',
      min: 10,
      max: 2_000_000,
      defaultValue: 5_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'candidatesPerRequest',
      label: 'Candidates per request',
      help: 'Items retrieval hands to the ranker per request. More candidates means better recall but more scoring work.',
      min: 50,
      max: 50_000,
      defaultValue: 500,
      scale: 'log',
      unit: 'candidates',
      format: 'count',
    },
    {
      id: 'rankingLatencyMs',
      label: 'Ranking model latency',
      help: 'Time the ranking model needs to score one candidate batch. Tighter targets force smaller models or more servers.',
      min: 2,
      max: 200,
      defaultValue: 30,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'embeddingDim',
      label: 'Embedding dimensions',
      help: 'Vector width for two-tower user/item embeddings. Wider vectors cost more memory and ANN compute.',
      min: 16,
      max: 1_024,
      defaultValue: 128,
      scale: 'log',
      unit: 'dims',
      format: 'count',
    },
    {
      id: 'featureCount',
      label: 'Features per candidate',
      help: 'Features the ranker pulls per user-item pair. Each one is a feature-store lookup on the hot path.',
      min: 5,
      max: 2_000,
      defaultValue: 100,
      scale: 'log',
      unit: 'features',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'realtimeFeatures',
      label: 'Real-time features',
      help: 'Update features from live interactions (last clicks, session) instead of only batch-computed ones.',
      defaultValue: false,
    },
    {
      id: 'twoTowerAnn',
      label: 'Two-tower ANN retrieval',
      help: 'Retrieve candidates by approximate nearest neighbor over learned embeddings instead of a popularity or co-visitation list.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'popularity-baseline',
      step: '01',
      title: 'Popularity baseline',
      summary: 'Everyone gets the same top items from a small catalog.',
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
      summary: 'Co-visitation gives per-user lists, but recall is thin.',
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
      summary: 'Learned embeddings retrieve candidates across a large catalog.',
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
      summary: 'A heavy ranker scores candidates with many stored features.',
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
      title: 'Real-time multi-stage at scale',
      summary: 'Live features, billions of items, sub-30 ms full funnel.',
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
    title: 'Recommendation system architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a multi-stage recommender: clients, a serving API, candidate retrieval with a two-tower model and an ANN index, a ranking model with a feature store, the item index and feature store, and an async interaction-logging and training-data path.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'feed + clicks',
            kind: 'client',
            summary: 'requests a ranked list and emits clicks, watches, and other interactions',
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
            subtitle: 'orchestrates funnel',
            kind: 'api',
            summary: 'fans a request through retrieval, ranking, and re-ranking under a latency budget',
          },
          {
            id: 'reranker',
            title: 'Re-ranker',
            subtitle: 'rules + diversity',
            kind: 'service',
            summary: 'applies business rules, diversity, and freshness to the ranked list before returning it',
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
            summary: 'embeds the user query so similar item vectors can be found by distance',
          },
          {
            id: 'annIndex',
            title: 'ANN search',
            subtitle: 'nearest items',
            kind: 'search',
            summary: 'finds approximate nearest item vectors over millions of items in milliseconds',
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
            subtitle: 'scores candidates',
            kind: 'gpu',
            summary: 'scores each candidate with a heavy model using many user-item features',
          },
          {
            id: 'featureStore',
            title: 'Feature store',
            subtitle: 'online features',
            kind: 'cache',
            summary: 'serves precomputed and live features for each user-item pair at low latency',
          },
        ],
      },
      {
        id: 'stores',
        label: 'Stores',
        variant: 'storage',
        nodes: [
          {
            id: 'itemIndex',
            title: 'Item index',
            subtitle: 'vectors + meta',
            kind: 'search',
            summary: 'holds item embeddings and metadata, sharded as the catalog grows',
          },
          {
            id: 'featureDb',
            title: 'Feature DB',
            subtitle: 'feature values',
            kind: 'db',
            summary: 'durable store of batch and streaming features behind the online feature store',
          },
        ],
      },
      {
        id: 'async',
        label: 'Training loop',
        variant: 'processing',
        nodes: [
          {
            id: 'interactionLog',
            title: 'Interaction log',
            subtitle: 'click stream',
            kind: 'stream',
            summary: 'captures impressions and engagement off the hot path for training and live features',
          },
          {
            id: 'trainer',
            title: 'Training jobs',
            subtitle: 'embeddings + ranker',
            kind: 'compute',
            summary: 'rebuilds embeddings and the ranking model from logged interactions',
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
    { id: 'retrievalLoad', label: 'Retrieval scan cost' },
    { id: 'rankingCompute', label: 'Ranking compute' },
    { id: 'featureLoad', label: 'Feature-store load' },
    { id: 'indexMemory', label: 'Item index memory' },
    { id: 'latencyBudget', label: 'End-to-end latency budget' },
  ],
  decisions: [
    { id: 'candidateGen', title: 'Candidate generation' },
    { id: 'rankingServing', title: 'Ranking model serving' },
    { id: 'featureStore', title: 'Feature store' },
    { id: 'annIndex', title: 'ANN index' },
    { id: 'reranking', title: 'Re-ranking + business rules' },
    { id: 'trainingLog', title: 'Training-data logging' },
  ],
  sourceBackedRules: [
    {
      title: 'Sampling-Bias-Corrected Neural Modeling (Yi et al., 2019)',
      source: 'Google Research',
      url: 'https://research.google/pubs/sampling-bias-corrected-neural-modeling-for-large-corpus-item-recommendations/',
      summary:
        'Separate user and item towers produce embeddings whose dot product approximates relevance, so retrieval becomes a nearest-neighbor search over precomputed item vectors.',
    },
    {
      title: 'ANN search makes nearest-neighbor retrieval scale to billions of vectors',
      source: 'ScaNN (Google Research)',
      url: 'https://github.com/google-research/google-research/tree/master/scann',
      summary:
        'Approximate nearest neighbor libraries (ScaNN, FAISS) and vector databases trade a little recall for orders-of-magnitude faster similarity search, which is what lets retrieval scan a huge catalog in milliseconds.',
    },
    {
      title: 'A feature store serves the same features online and offline',
      source: 'Feast',
      url: 'https://docs.feast.dev/',
      summary:
        'A feature store provides low-latency online feature lookups for serving and consistent historical features for training, avoiding training/serving skew.',
    },
    {
      title: 'Large-scale recommendation is staged: candidate generation then ranking',
      source: 'System Design Primer',
      url: 'https://github.com/donnemartin/system-design-primer',
      summary:
        'The canonical pattern narrows a huge item set with a cheap retrieval stage before a more expensive ranking stage scores the survivors, so heavy compute only touches a few hundred items.',
    },
  ],
  teachingAssumptions: [
    'Retrieval cost is modeled as a per-request scan that ANN turns from linear in catalog size into roughly logarithmic, so brute force only survives on small catalogs.',
    'Ranking throughput per server scales down with model latency and feature count; the numbers are conservative teaching budgets, not vendor benchmarks.',
    'Feature-store load counts one lookup per feature per candidate per request, the worst case before batching and caching.',
  ],
  teachingWalkthrough: [
    {
      id: 'baseline',
      step: '01',
      focus: 'Same list for everyone',
      scenarioId: 'popularity-baseline',
      question:
        'A few requests per second over 5k items, and you just want "good enough" recs. Do you need embeddings, ANN, or a ranking model at all?',
      reveal:
        'No. A precomputed popularity or trending list, recomputed periodically, answers every request from a tiny cache. There is no per-user signal to model and no catalog too big to enumerate — embeddings and a ranker would be pure overhead.',
      takeaway: 'Start with a popularity baseline; personalization only earns its complexity once it beats it.',
    },
    {
      id: 'cf',
      step: '02',
      focus: 'Per-user lists',
      scenarioId: 'collaborative-filtering',
      question:
        'Now 2M users want personalized lists. Co-visitation ("people who watched X watched Y") gives each user candidates. Why does this start to hurt as the catalog grows?',
      reveal:
        'Co-visitation only recommends items that co-occur with what a user already touched, so cold items and long-tail interests are invisible and recall stays thin. It also needs a big precomputed item-item table. It works, but it cannot generalize the way a learned embedding can.',
      takeaway: 'Collaborative filtering personalizes cheaply but has poor recall and no generalization to cold items.',
    },
    {
      id: 'twotower',
      step: '03',
      focus: 'Retrieval over millions',
      scenarioId: 'two-tower-ann',
      question:
        'The catalog is now 50M items. To find the best candidates you would score the user against every item. What breaks, and what replaces the brute-force scan?',
      reveal:
        'Scoring 50M items per request is far too expensive online. A two-tower model embeds users and items into the same space, and an ANN index (HNSW, IVF) finds approximate nearest neighbors in roughly logarithmic time. Retrieval narrows millions to a few hundred candidates in milliseconds.',
      takeaway: 'Two-tower embeddings plus ANN turn retrieval from a full scan into a fast nearest-neighbor lookup.',
    },
    {
      id: 'ranking',
      step: '04',
      focus: 'Scoring the survivors',
      scenarioId: 'ranking-feature-store',
      question:
        'Retrieval gives 2,000 candidates. A heavy ranking model with 400 features per candidate now scores them under 20 ms. Where does that load land, and why a separate stage?',
      reveal:
        'Ranking is far too expensive to run on the whole catalog, which is exactly why retrieval went first. On a few hundred candidates it is affordable, but each candidate needs hundreds of feature lookups, so a low-latency feature store on the hot path becomes essential and ranking servers must be fanned out to hold the latency budget.',
      takeaway: 'Ranking is the expensive stage; it only works because retrieval shrank the input, and it lives or dies on the feature store.',
    },
    {
      id: 'realtime',
      step: '05',
      focus: 'Live, billions, sub-30 ms',
      scenarioId: 'realtime-multistage',
      question:
        'Billions of items, real-time features from the current session, and a sub-30 ms full funnel. What does adding live features cost that batch features did not?',
      reveal:
        'Real-time features close the loop from interaction log to feature store within seconds, so the funnel reflects the current session — but it adds a streaming pipeline and tighter feature-store write/read paths on the hot path. The item index must shard across nodes, retrieval and ranking both fan out, and re-ranking enforces diversity and business rules within the same tight budget.',
      takeaway: 'Real-time features add a streaming pipeline for freshness; at scale every stage shards and the latency budget governs the whole funnel.',
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
          ? `ANN, ~${formatCount(catalogItems)} items`
          : `${formatRate(retrievalCost)} lookups/s`,
        copy: twoTowerAnn
          ? `ANN search (ScaNN, FAISS, or a vector DB) over ~${formatCount(catalogItems)} item vectors keeps retrieval roughly logarithmic instead of scanning everything.`
          : needsAnn
            ? `A precomputed list answers each request cheaply, but brute-force scoring all ${formatCount(catalogItems)} items would be ${formatRate(bruteForceScansPerSecond)} comparisons/s — far past budget, which is why scale forces learned ANN retrieval.`
            : `A precomputed popularity or co-visitation list answers each request from a small cache; no per-request catalog scan.`,
      },
      rankingCompute: {
        ratio: needsRankingModel
          ? softCapRatio(rankingServersNeeded / rankingServerBudget)
          : softCapRatio(rankingScoresPerSecond / (bruteForceScoreBudget / 4)),
        valueText: needsRankingModel
          ? `~${formatCount(Math.max(rankingServersNeeded, 1))} servers`
          : `${formatRate(rankingScoresPerSecond)} scores/s`,
        copy: needsRankingModel
          ? `Scoring ${formatRate(rankingScoresPerSecond)} candidates/s at ${Math.round(rankingLatencyMs)} ms with ${formatCount(featureCount)} features needs about ${formatCount(Math.max(rankingServersNeeded, 1))} ranking servers.`
          : `${formatRate(rankingScoresPerSecond)} candidate scores/s is light enough that retrieval order (or a trivial scorer) suffices.`,
      },
      featureLoad: {
        ratio: needsFeatureStore
          ? Math.min(softCapRatio(featureLookupsPerSecond / (featureLookupsPerServerSecond * 20)), 9)
          : 0.05,
        valueText: needsFeatureStore ? `${formatRate(featureLookupsPerSecond)} reads/s` : 'no ranker yet',
        copy: needsFeatureStore
          ? `${formatCount(featureCount)} features per candidate is ${formatRate(featureLookupsPerSecond)} online lookups/s; a low-latency feature store on the hot path is required.`
          : `No ranking model is pulling per-candidate features yet, so there is no feature-store load on the hot path.`,
      },
      indexMemory: {
        ratio: softCapRatio(itemIndexMemoryRatio),
        valueText: twoTowerAnn ? `${formatCount(catalogItems)} vectors` : 'no vector index',
        copy: needsIndexSharding
          ? `${formatCount(catalogItems)} item vectors at ${Math.round(embeddingDim)} dims exceed one index node; shard the item index.`
          : twoTowerAnn
            ? `${formatCount(catalogItems)} vectors at ${Math.round(embeddingDim)} dims still fit one ANN index node.`
            : `No vector index is built while retrieval is non-embedding.`,
      },
      latencyBudget: {
        ratio: latencyPressure,
        valueText: `${stagesActive}-stage funnel`,
        copy:
          latencyPressure > 1
            ? `${stagesActive} active stages scoring ${formatCount(candidatesPerRequest)} candidates/request at ${formatRate(impliedServingQps)} req/s push the funnel past its ${endToEndLatencyBudgetMs} ms end-to-end budget; stages must fan out.`
            : `A ${stagesActive}-stage funnel scoring ${formatCount(candidatesPerRequest)} candidates/request fits comfortably inside the ${endToEndLatencyBudgetMs} ms end-to-end budget.`,
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
      text: `Two-tower ANN retrieval (ScaNN/FAISS or a vector DB) narrows ${formatCount(
        analysis.catalogItems,
      )} items to ${formatCount(analysis.candidatesPerRequest)} candidates in roughly logarithmic time per request.`,
    });
  } else if (analysis.needsAnn) {
    reasons.push({
      severity: 'warning',
      text: `A precomputed list still answers each request, but brute-force scoring all ${formatCount(
        analysis.catalogItems,
      )} items would be ${formatRate(
        analysis.bruteForceScansPerSecond,
      )} comparisons/s — at this scale, move retrieval to two-tower embeddings + ANN.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `A precomputed popularity or co-visitation list answers every request from cache; ${formatCount(
        analysis.catalogItems,
      )} items is small enough to enumerate offline.`,
    });
  }

  // 2. Personalization posture — always present.
  reasons.push({
    severity: 'ok',
    text: analysis.personalizes
      ? `${formatCount(analysis.activeUsers)} active users need per-user candidates, so retrieval is personalized rather than one global list.`
      : `${formatCount(analysis.activeUsers)} users with no strong per-user signal yet — a shared list beats the complexity of a personalized model.`,
  });

  // 3. Ranking.
  if (analysis.needsRankingModel) {
    reasons.push({
      severity: analysis.needsRankingFanout ? 'warning' : 'ok',
      text: `A ranking model scores ${formatRate(analysis.rankingScoresPerSecond)} candidates/s at ${Math.round(
        analysis.rankingLatencyMs,
      )} ms${
        analysis.needsRankingFanout
          ? ` and must fan out to ~${formatCount(Math.max(analysis.rankingServersNeeded, 1))} servers`
          : ''
      }.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatRate(
        analysis.rankingScoresPerSecond,
      )} candidate scores/s is light enough that retrieval order (or a trivial scorer) is good enough — no separate ranking model yet.`,
    });
  }

  // 4. Feature store.
  if (analysis.needsFeatureStore) {
    reasons.push({
      severity: analysis.featureLookupsPerSecond > featureLookupsPerServerSecond * 20 ? 'danger' : 'warning',
      text: `${formatCount(analysis.featureCount)} features per candidate means ${formatRate(
        analysis.featureLookupsPerSecond,
      )} online lookups/s — a low-latency feature store sits on the hot path.`,
    });
  }

  // 5. Index sharding.
  if (analysis.needsIndexSharding) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.catalogItems)} item vectors at ${Math.round(
        analysis.embeddingDim,
      )} dims exceed one index node; shard the ANN item index.`,
    });
  }

  // 6. Real-time features.
  if (analysis.realtimeFeatures) {
    reasons.push({
      severity: 'warning',
      text: 'Real-time features add a streaming path from the interaction log into the feature store so the funnel reflects the current session.',
    });
  }

  // 7. Latency / serving — always present, and it backfills small scenarios up to >=4 reasons.
  reasons.push({
    severity: analysis.latencyPressure > 1 ? 'warning' : 'ok',
    text:
      analysis.latencyPressure > 1
        ? `A ${analysis.stagesActive}-stage funnel at ${formatRate(
            analysis.impliedServingQps,
          )} req/s is at the edge of its end-to-end latency budget; stages must fan out and serve in parallel.`
        : `A ${analysis.stagesActive}-stage funnel at ${formatRate(
            analysis.impliedServingQps,
          )} req/s fits comfortably inside its end-to-end latency budget.`,
  });

  // Training log — only added if there is still room, so it never inflates a busy scenario past 7.
  if (analysis.needsTrainingLog && reasons.length < 7) {
    reasons.push({
      severity: 'ok',
      text: 'Interactions are logged asynchronously to retrain embeddings and the ranker without touching the serving hot path.',
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
        ? `Two-tower embeddings + ANN retrieve candidates across ${formatCount(flags.catalogItems)} items with high recall and generalization to cold items.`
        : flags.personalizes
          ? 'Collaborative filtering (co-visitation) personalizes cheaply but has thin recall and cannot generalize to cold items — embeddings are the next step.'
          : 'A precomputed popularity or trending list is enough; there is no per-user signal to model yet.',
    },
    rankingServing: {
      state: flags.needsRankingModel ? (flags.needsRankingFanout ? 'needed' : 'useful') : 'not-yet',
      copy: flags.needsRankingModel
        ? `Serve a ranking model over the ${formatCount(flags.candidatesPerRequest)} retrieved candidates${flags.needsRankingFanout ? `, fanned out to ~${formatCount(Math.max(flags.rankingServersNeeded, 1))} servers to hold latency` : ''}.`
        : 'No separate ranking model yet — retrieval order is good enough for the load.',
    },
    featureStore: {
      state: flags.needsFeatureStore ? 'needed' : 'not-yet',
      copy: flags.needsFeatureStore
        ? `An online feature store serves ${formatCount(flags.featureCount)} features per candidate at low latency, kept consistent with offline training features.`
        : 'Few features and low scoring volume mean no dedicated online feature store is justified.',
    },
    annIndex: {
      state: flags.twoTowerAnn ? (flags.needsIndexSharding ? 'needed' : 'useful') : 'not-yet',
      copy: flags.twoTowerAnn
        ? flags.needsIndexSharding
          ? 'Use a sharded ANN index (ScaNN, FAISS/HNSW/IVF, or a managed vector DB) so item vectors and search scale beyond one node.'
          : 'A single ANN index (ScaNN, FAISS/HNSW/IVF, or a vector DB) over item vectors serves nearest-neighbor retrieval.'
        : 'No vector index needed while retrieval is non-embedding.',
    },
    reranking: {
      state: flags.needsReranking ? 'needed' : 'not-yet',
      copy: flags.needsReranking
        ? 'Re-rank the scored list for diversity, freshness, and business rules before returning it.'
        : 'No re-ranking layer yet; the popularity list is returned directly.',
    },
    trainingLog: {
      state: flags.needsTrainingLog ? (flags.realtimeFeatures ? 'tradeoff' : 'useful') : 'not-yet',
      copy: flags.needsTrainingLog
        ? flags.realtimeFeatures
          ? 'Log interactions to a stream that feeds both offline training and real-time features — the latter adds a low-latency pipeline on the hot path.'
          : 'Log impressions and engagement asynchronously to retrain embeddings and the ranker.'
        : 'No training loop yet; the popularity list is recomputed on a simple schedule.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.twoTowerAnn && !flags.needsRankingModel && !flags.personalizes) {
    return 'Popularity list';
  }
  if (flags.realtimeFeatures && flags.needsIndexSharding) {
    return 'Real-time multi-stage funnel at scale';
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
    return 'A precomputed popularity or trending list answers every request from cache. No per-user model is justified yet.';
  }
  if (flags.realtimeFeatures && flags.needsIndexSharding) {
    return 'A sharded ANN index retrieves over billions of items, a fanned-out ranking model scores candidates with an online feature store fed by real-time interactions, and re-ranking enforces diversity within a tight latency budget.';
  }
  if (flags.twoTowerAnn && flags.needsRankingModel) {
    return 'Two-tower embeddings and an ANN index retrieve candidates, then a ranking model scores them using features from an online feature store, with re-ranking before the response.';
  }
  if (flags.twoTowerAnn) {
    return 'Two-tower embeddings feed an ANN index so retrieval narrows a large catalog to a few hundred candidates in milliseconds.';
  }
  if (flags.personalizes) {
    return 'Collaborative filtering builds per-user candidate lists from co-visitation, personalizing cheaply but with limited recall.';
  }
  return 'A precomputed popularity list still covers the workload.';
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
