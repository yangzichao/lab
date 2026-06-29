import { buildColumnDiagram } from '../diagram-layout';
import {
  formatCount,
  formatDuration,
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

// Conservative teaching budgets, not vendor limits.
const bytesPerFloat = 4; // float32 vector storage per dimension
const chunksPerDocument = 4; // average chunks a document is split into
const ramVectorBudgetGigabytes = 64; // in-memory ANN index that fits one node
const comfortableEmbedOpsPerSecond = 4_000; // single embedding-server throughput (tokens aside)
const comfortableAnnQpsPerNode = 2_000; // ANN lookups one index node serves well
const comfortableRerankQps = 300; // cross-encoder reranks one GPU sustains
const comfortableGenerationQps = 800; // generation calls one LLM tier sustains
const contextSafetyFraction = 0.6; // share of the window retrieved chunks may fill
const dailyDocChurnFraction = 0.1; // share of the corpus that is new/changed per day
const referenceEmbeddingDimensions = 768; // baseline width; wider vectors cost more per ANN hop
const streamingFreshnessSeconds = 3_600; // tighter than this and batch rebuilds stop keeping up

export const ragSystemLabDefinition: SystemDesignLabDefinition = {
  id: 'rag-system',
  eyebrow: '系统设计 Lab',
  title:
    'RAG system 其实是两条 pipeline —— 离线的 ingestion，和在线的 retrieve-then-generate 查询路径 —— 每一个负载都会撑大不同的 stage。',
  summary:
    '调节 query rate、corpus 规模、chunk size、每次 retrieve 多少 chunk、模型的 context window、以及 embedding 维度，再切换 reranking 和 hybrid search。设计会从直接 stuff prompt，演进到带 ANN retrieval 的 vector index，再到 chunking 加 reranking，再到 hybrid search 配 caching，最后变成多租户、持续 ingest 的平台。',
  controls: [
    {
      id: 'queriesPerSecond',
      label: 'Query rate',
      help: '每秒打到 retrieve-then-generate 路径上的在线提问数。',
      min: 0.1,
      max: 20_000,
      defaultValue: 20,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'documentsIndexed',
      label: 'Documents indexed',
      help: 'corpus 里的源文档数；每篇都会被 chunk 切分并 embed 进 vector index。',
      min: 5,
      max: 1_000_000_000,
      defaultValue: 100_000,
      scale: 'log',
      unit: '篇',
      format: 'count',
    },
    {
      id: 'chunkSizeTokens',
      label: 'Chunk size',
      help: '每个 chunk 多少 token。chunk 越小 retrieval 越精准，但 vector 数量翻倍、context 覆盖面缩小。',
      min: 64,
      max: 2_048,
      defaultValue: 512,
      scale: 'log',
      unit: 'tokens',
      format: 'count',
    },
    {
      id: 'topK',
      label: 'Top-k retrieved',
      help: '每次 query 从 vector index 拉出、在 assemble 和（可选）reranking 之前的 chunk 数。',
      min: 1,
      max: 200,
      defaultValue: 8,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'contextWindowTokens',
      label: 'Context window',
      help: '模型的 context 预算（以 token 计）；retrieve 到的 chunk 加上 prompt 必须塞得进去。',
      min: 2_048,
      max: 1_000_000,
      defaultValue: 16_000,
      scale: 'log',
      unit: 'tokens',
      format: 'count',
    },
    {
      id: 'embeddingDimensions',
      label: 'Embedding dimensions',
      help: 'vector 的宽度。维度越高 recall 可能越好，但 index 变大、ANN search 变慢。',
      min: 128,
      max: 4_096,
      defaultValue: 768,
      scale: 'log',
      unit: 'dims',
      format: 'count',
    },
    {
      id: 'indexFreshnessSeconds',
      label: 'Index freshness target',
      help: '一篇刚写入的文档要多快变得可被 retrieve；目标越紧，就越逼着上 streaming ingestion。',
      min: 1,
      max: 604_800,
      defaultValue: 86_400,
      scale: 'log',
      format: 'duration-seconds',
    },
  ],
  toggles: [
    {
      id: 'reranking',
      label: 'Rerank retrieved chunks',
      help: '用 cross-encoder 跑一遍 top-k，按 relevance 重排；质量更高，但有实打实的 latency 和 GPU 开销。',
      defaultValue: false,
    },
    {
      id: 'hybridSearch',
      label: 'Hybrid (keyword + vector) search',
      help: '把 BM25 关键词匹配和 vector similarity 结合起来，抓住 dense vector 漏掉的精确词。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'prompt-stuffing',
      step: '01',
      title: '直接 stuff prompt',
      summary: '寥寥几篇文档，直接贴进 context window。',
      values: {
        queriesPerSecond: 0.5,
        documentsIndexed: 8,
        chunkSizeTokens: 1_024,
        topK: 3,
        contextWindowTokens: 64_000,
        embeddingDimensions: 384,
        indexFreshnessSeconds: 604_800,
        reranking: false,
        hybridSearch: false,
      },
    },
    {
      id: 'vector-retrieval',
      step: '02',
      title: 'Vector DB 检索',
      summary: 'corpus 已经塞不进 window 了，于是按 similarity 取 top-k。',
      values: {
        queriesPerSecond: 20,
        documentsIndexed: 100_000,
        chunkSizeTokens: 512,
        topK: 10,
        contextWindowTokens: 16_000,
        embeddingDimensions: 768,
        indexFreshnessSeconds: 86_400,
        reranking: false,
        hybridSearch: false,
      },
    },
    {
      id: 'chunk-and-rerank',
      step: '03',
      title: 'Chunk + rerank',
      summary: '更细的 chunk 加上一个 reranker，把答案质量拉上去。',
      values: {
        queriesPerSecond: 200,
        documentsIndexed: 5_000_000,
        chunkSizeTokens: 256,
        topK: 24,
        contextWindowTokens: 16_000,
        embeddingDimensions: 1_024,
        indexFreshnessSeconds: 86_400,
        reranking: true,
        hybridSearch: false,
      },
    },
    {
      id: 'hybrid-and-cache',
      step: '04',
      title: 'Hybrid search + caching',
      summary: '关键词 recall 加上 caching，在更高负载下把成本压住。',
      values: {
        queriesPerSecond: 2_000,
        documentsIndexed: 50_000_000,
        chunkSizeTokens: 256,
        topK: 80,
        contextWindowTokens: 24_000,
        embeddingDimensions: 1_024,
        indexFreshnessSeconds: 300,
        reranking: true,
        hybridSearch: true,
      },
    },
    {
      id: 'multi-tenant-fresh',
      step: '05',
      title: '多租户、新鲜、规模化',
      summary: '数十亿 chunk、近实时的 freshness、彼此隔离的租户。',
      values: {
        queriesPerSecond: 12_000,
        documentsIndexed: 500_000_000,
        chunkSizeTokens: 256,
        topK: 160,
        contextWindowTokens: 32_000,
        embeddingDimensions: 1_536,
        indexFreshnessSeconds: 5,
        reranking: true,
        hybridSearch: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'Retrieval-augmented generation 架构图',
    description:
      'RAG system 的白板式架构图：clients、一个 RAG API、负责把 query 做 embed 并在 vector index 上搜索的 retrieval 阶段、rerank 与 context-assembly 阶段、带 response cache 的 LLM generation，以及一条异步的 ingestion pipeline 来对文档做 chunk 和 embed。',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: '发起提问',
            kind: 'client',
            summary: '发送自然语言提问，并渲染有出处支撑的答案',
          },
        ],
      },
      {
        id: 'api',
        label: 'RAG API',
        variant: 'edge',
        nodes: [
          {
            id: 'ragApi',
            title: 'RAG API',
            subtitle: '编排 query',
            kind: 'api',
            summary: '为每次 query 编排 embed、retrieve、rerank、assemble 和 generate',
          },
          {
            id: 'responseCache',
            title: 'Response cache',
            subtitle: '重复 query',
            kind: 'cache',
            summary: '在做任何 retrieval 之前，对重复或相似的提问直接返回缓存的答案',
          },
        ],
      },
      {
        id: 'retrieval',
        label: '检索 Retrieval',
        variant: 'backbone',
        nodes: [
          {
            id: 'queryEmbedder',
            title: 'Query embedder',
            subtitle: '文本转 vector',
            kind: 'gpu',
            summary: '用 ingestion 时同一个模型把提问 embed 成向量',
          },
          {
            id: 'vectorIndex',
            title: 'Vector index',
            subtitle: 'ANN top-k',
            kind: 'search',
            summary: 'approximate-nearest-neighbour 搜索返回 top-k 候选 chunk',
          },
          {
            id: 'keywordIndex',
            title: 'Keyword index',
            subtitle: 'BM25 匹配',
            kind: 'search',
            summary: '用于 hybrid search 的 inverted index，抓住 dense vector 漏掉的精确词',
          },
        ],
      },
      {
        id: 'assembly',
        label: 'Rerank + 组装',
        variant: 'processing',
        nodes: [
          {
            id: 'reranker',
            title: 'Reranker',
            subtitle: 'cross-encoder',
            kind: 'gpu',
            summary: '在候选进入 context 之前，按 query-chunk relevance 重新排序',
          },
          {
            id: 'contextAssembler',
            title: 'Context assembler',
            subtitle: '塞进 window',
            kind: 'service',
            summary: '把最好的 chunk 连同 prompt 一起打包，正好塞进 context window',
          },
        ],
      },
      {
        id: 'generation',
        label: '生成 Generation',
        variant: 'storage',
        nodes: [
          {
            id: 'llm',
            title: 'LLM generator',
            subtitle: '有据可依的答案',
            kind: 'gpu',
            summary: '以 assemble 好的 context 为条件生成答案',
          },
        ],
      },
      {
        id: 'ingestion',
        label: '摄入 Ingestion',
        variant: 'processing',
        nodes: [
          {
            id: 'chunker',
            title: 'Chunk + embed',
            subtitle: '异步 pipeline',
            kind: 'compute',
            summary: '在 query 路径之外，把新文档切成 chunk 并做 embed',
          },
          {
            id: 'indexWriter',
            title: 'Index writer',
            subtitle: 'upsert 向量',
            kind: 'compute',
            summary: '把 chunk 向量 upsert 进 index，让 retrieval 保持新鲜',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'ragApi', variant: 'primary' },
      { from: 'ragApi', to: 'responseCache', variant: 'secondary' },
      { from: 'ragApi', to: 'queryEmbedder', variant: 'primary' },
      { from: 'queryEmbedder', to: 'vectorIndex', variant: 'primary' },
      { from: 'ragApi', to: 'keywordIndex', variant: 'secondary' },
      { from: 'vectorIndex', to: 'reranker', variant: 'primary' },
      { from: 'reranker', to: 'contextAssembler', variant: 'primary' },
      { from: 'contextAssembler', to: 'llm', variant: 'primary' },
      { from: 'chunker', to: 'indexWriter', variant: 'secondary' },
      { from: 'indexWriter', to: 'vectorIndex', variant: 'direct' },
    ],
  }),
  meters: [
    { id: 'indexScale', label: 'Vector index 规模' },
    { id: 'annLoad', label: 'ANN query 负载' },
    { id: 'rerankLoad', label: 'Rerank 负载' },
    { id: 'contextFit', label: 'Context window 占用' },
    { id: 'ingestionFreshness', label: 'Ingestion / freshness' },
  ],
  decisions: [
    { id: 'chunking', title: 'Chunking 策略' },
    { id: 'vectorIndex', title: 'Vector index / ANN' },
    { id: 'hybrid', title: 'Hybrid search' },
    { id: 'rerank', title: 'Reranking' },
    { id: 'contextAssembly', title: 'Context 组装' },
    { id: 'ingestion', title: 'Ingestion / freshness' },
  ],
  sourceBackedRules: [
    {
      title: 'RAG 让生成以 retrieve 到的段落为条件，而不是靠记在权重里的知识',
      source: 'Lewis et al., 2020 (arXiv:2005.11401)',
      url: 'https://arxiv.org/abs/2005.11401',
      summary:
        '最初的 RAG 论文用 dense retriever 取出相关段落、喂给一个 seq2seq generator，把知识（index）和参数化模型分离开。',
    },
    {
      title: '十亿级别的 similarity search 需要 ANN index，不能用暴力扫描',
      source: 'FAISS',
      url: 'https://github.com/facebookresearch/faiss',
      summary:
        'FAISS 提供 quantised 和 graph-based 的 index，让超大向量集上的 nearest-neighbour search 既快又能装进内存。',
    },
    {
      title: 'HNSW 把 approximate nearest-neighbour search 做到对数时间',
      source: 'Malkov & Yashunin, 2016 (arXiv:1603.09320)',
      url: 'https://arxiv.org/abs/1603.09320',
      summary:
        'Hierarchical Navigable Small World 图用一个可调的 recall/latency 旋钮，换来能扩展到大 index 的 high-recall 搜索，是大多数 vector database 的默认选择。',
    },
    {
      title: 'Vector database 管的是 embedding、metadata 过滤和更新',
      source: 'pgvector',
      url: 'https://github.com/pgvector/pgvector',
      summary:
        '一个生产级的 vector store 不只是干 nearest-neighbour 的数学，还要负责 index 构建、为 freshness 做 upsert、以及用 metadata filter 做多租户隔离。',
    },
  ],
  teachingAssumptions: [
    '平均每篇文档切成几个 chunk；总向量数 = 文档数 × 每篇 chunk 数，再按 chunk size 缩放。',
    'freshness 建模成：只有新增/改动的文档（corpus 中每天一小部分）被 embed 和 upsert，而不是整个 corpus 重新 embed；目标越紧就越逼出 streaming pipeline。',
    'ANN、rerank、embedding、generation 的单节点预算都是保守的教学数字，不是厂商上限。',
    'cache 命中率和 recall 都是近似值；真实系统会凭经验调 HNSW 参数和 reranker。',
  ],
  teachingWalkthrough: [
    {
      id: 'stuff',
      step: '01',
      focus: '直接 stuff prompt',
      scenarioId: 'prompt-stuffing',
      question:
        '你手上只有寥寥几篇短文档，加一个 32k-token 的 window。你真的需要一个 vector database 吗，还是直接把文档贴进 prompt 就行？',
      reveal:
        '直接贴就好。当整个 corpus 都塞得进 context window 时，retrieval 纯属多余 —— 不用 embedder、不用 index、不用 ANN。最简单又正确的 RAG，就是压根不做 retrieval。',
      takeaway: '只要 corpus 装得进 window，就整个跳过 retrieval。',
    },
    {
      id: 'retrieve',
      step: '02',
      focus: 'Corpus 撑爆 window',
      scenarioId: 'vector-retrieval',
      question:
        '10 万篇文档远比任何 context window 都大。靠什么能在不必每次 query 都扫遍每一个向量的前提下，找到那少数几个相关 chunk？',
      reveal:
        '在 ingestion 时把每个 chunk embed 一次、把向量存进 index，到 query 时再把问题 embed 出来，按 similarity 取 top-k。这个规模下精确搜索太慢，所以 index 用 approximate nearest neighbour（HNSW/IVF）在对数时间里返回候选。',
      takeaway: '一旦 corpus 超过 window，就用 ANN vector index 取 top-k。',
    },
    {
      id: 'rerank',
      step: '03',
      focus: '质量：chunk + rerank',
      scenarioId: 'chunk-and-rerank',
      question:
        '正确的段落明明就在 index 里，答案却引用了错的那一段。为什么相关 chunk 被 retrieve 到了、却没排到靠前的位置，又怎么在不牺牲 recall 的前提下修好它？',
      reveal:
        '先用 vector index 廉价地 retrieve 一个较宽的 top-k，再用一个 cross-encoder reranker 跑这批候选，按真正的 query-chunk relevance 重排，只把最好的留进 context。更小的 chunk 也能让每个向量表示得更精准。reranking 会带来 GPU 开销和 latency，所以它只作用在 top-k 上，绝不跑整个 corpus。',
      takeaway: '先宽而廉价地 retrieve，再窄而精准地 rerank。',
    },
    {
      id: 'hybrid',
      step: '04',
      focus: '高负载下的 recall + 成本',
      scenarioId: 'hybrid-and-cache',
      question:
        'dense retrieval 老是漏掉精确的产品编号和生僻名字，而 2k QPS 又让 generation 成了账单大头。这是两个不同的问题 —— 各自该怎么解？',
      reveal:
        '加一个关键词（BM25）index，把它的结果和 vector 命中融合起来 —— hybrid search 能找回 dense embedding 模糊掉的精确匹配词。另一边，一个 response/semantic cache 在做任何 retrieval 或 generation 之前，就把重复和近似重复的提问接住，砍掉最贵的那一段。',
      takeaway: 'hybrid search 修复精确词上的 recall；caching 修复重复 query 上的成本。',
    },
    {
      id: 'platform',
      step: '05',
      focus: '多租户、新鲜、规模化',
      scenarioId: 'multi-tenant-fresh',
      question:
        '数十亿 chunk、众多租户，文档上传后必须几秒内就能被 retrieve。最先撑不住的是什么，又怎么保证租户隔离、index 保持新鲜？',
      reveal:
        'index 撑爆了单个节点，必须 shard/replicate，并用 metadata filter 或 per-tenant namespace 做隔离。每日一次的 batch rebuild 满足不了秒级的 freshness 目标，于是 ingestion 变成一条 streaming pipeline，在 query 路径之外持续地 chunk、embed、upsert。',
      takeaway: '到平台规模，就把 index 做 shard、用 namespace 隔离租户、用 streaming ingestion 保 freshness。',
    },
  ],
  analyze: analyzeRagWorkload,
};

function analyzeRagWorkload(workload: WorkloadValues): LabAnalysis {
  const queriesPerSecond = numericValue(workload, 'queriesPerSecond');
  const documentsIndexed = numericValue(workload, 'documentsIndexed');
  const chunkSizeTokens = numericValue(workload, 'chunkSizeTokens');
  const topK = numericValue(workload, 'topK');
  const contextWindowTokens = numericValue(workload, 'contextWindowTokens');
  const embeddingDimensions = numericValue(workload, 'embeddingDimensions');
  const indexFreshnessSeconds = numericValue(workload, 'indexFreshnessSeconds');
  const reranking = Boolean(workload.reranking);
  const hybridSearch = Boolean(workload.hybridSearch);

  // Smaller chunks => more chunks per document; scale the few-chunk baseline by chunk size.
  const chunksScale = 512 / Math.max(chunkSizeTokens, 1);
  const totalChunks = documentsIndexed * chunksPerDocument * chunksScale;
  const indexBytes = totalChunks * embeddingDimensions * bytesPerFloat;
  const indexGigabytes = indexBytes / 1_000_000_000;

  // The whole corpus fits the window only when it is tiny — then retrieval is unnecessary.
  const corpusTokens = totalChunks * chunkSizeTokens;
  const fitsInWindow = corpusTokens <= contextWindowTokens * contextSafetyFraction;
  const needsRetrieval = !fitsInWindow;

  // ANN load grows with QPS, with the index size (search touches more graph), and with
  // vector width (each distance comparison along the search path costs more per dimension).
  const indexScaleRatio = indexGigabytes / ramVectorBudgetGigabytes;
  const widthPenalty = embeddingDimensions / referenceEmbeddingDimensions;
  const annDifficulty =
    (1 + Math.log10(Math.max(totalChunks, 10) / 10) * 0.15) * widthPenalty;
  const effectiveAnnQps = needsRetrieval ? queriesPerSecond * annDifficulty : 0;
  const annRatio = effectiveAnnQps / comfortableAnnQpsPerNode;

  // Context budget: retrieved chunks must fit the window with headroom for the prompt + answer.
  const retrievedTokens = topK * chunkSizeTokens;
  const contextRatio = needsRetrieval
    ? retrievedTokens / (contextWindowTokens * contextSafetyFraction)
    : corpusTokens / (contextWindowTokens * contextSafetyFraction);

  // Reranking runs a cross-encoder over the top-k per query: cost scales with QPS and k.
  const rerankUnitsPerSecond = reranking ? queriesPerSecond * (topK / 10) : 0;
  const rerankRatio = reranking ? rerankUnitsPerSecond / comfortableRerankQps : 0;

  // Generation load (informs platform need); cache trims repeated queries.
  const generationRatio = queriesPerSecond / comfortableGenerationQps;

  // Ingestion: freshness is a write-latency property of INCOMING documents, not a full-corpus
  // reindex. Only the new/changed slice of the corpus is (re-)embedded, and a tighter freshness
  // target forces a continuous streaming pipeline whose per-chunk overhead the steady embed rate
  // must absorb (you can no longer batch and amortize).
  const newChunksPerSecond = (totalChunks * dailyDocChurnFraction) / 86_400;
  const freshnessTightness = Math.sqrt(
    clampNumber(streamingFreshnessSeconds / Math.max(indexFreshnessSeconds, 1), 1, 10_000),
  );
  const requiredEmbedOpsPerSecond = newChunksPerSecond * freshnessTightness;
  const ingestionRatio = needsRetrieval
    ? requiredEmbedOpsPerSecond / comfortableEmbedOpsPerSecond
    : 0;

  const needsVectorIndex = needsRetrieval;
  const needsAnnScaling = needsRetrieval && (indexScaleRatio > 1 || annRatio > 1);
  const needsRerank = reranking;
  const needsHybrid = hybridSearch;
  const contextOverflow = contextRatio > 1;
  const needsCache = generationRatio > 0.7 || queriesPerSecond >= 1_000;
  const needsStreamingIngestion = needsRetrieval && ingestionRatio > 1;
  const needsMultiTenant = documentsIndexed >= 100_000_000 || queriesPerSecond >= 5_000;

  const flags = {
    needsRetrieval,
    needsVectorIndex,
    needsAnnScaling,
    needsRerank,
    needsHybrid,
    contextOverflow,
    needsCache,
    needsStreamingIngestion,
    needsMultiTenant,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      ragApi: 'ok',
      responseCache: needsCache ? 'needed' : 'inactive',
      queryEmbedder: needsRetrieval ? 'ok' : 'inactive',
      vectorIndex: needsAnnScaling ? 'overloaded' : needsVectorIndex ? 'needed' : 'inactive',
      keywordIndex: needsHybrid ? 'needed' : 'inactive',
      reranker: needsRerank ? (rerankRatio > 1 ? 'overloaded' : 'needed') : 'inactive',
      contextAssembler: needsRetrieval ? (contextOverflow ? 'warning' : 'ok') : 'inactive',
      llm: generationRatio > 1 ? 'warning' : 'ok',
      chunker: needsRetrieval ? (needsStreamingIngestion ? 'needed' : 'ok') : 'inactive',
      indexWriter: needsRetrieval ? (needsStreamingIngestion ? 'needed' : 'ok') : 'inactive',
    },
    flowStates: {
      clientToRagApi: 'active',
      ragApiToResponseCache: needsCache ? 'active' : 'inactive',
      ragApiToQueryEmbedder: needsRetrieval ? 'active' : 'inactive',
      queryEmbedderToVectorIndex: needsRetrieval ? (needsAnnScaling ? 'warning' : 'active') : 'inactive',
      ragApiToKeywordIndex: needsHybrid ? 'active' : 'inactive',
      vectorIndexToReranker: needsRerank ? (rerankRatio > 1 ? 'warning' : 'active') : 'inactive',
      rerankerToContextAssembler: needsRerank ? 'active' : 'inactive',
      contextAssemblerToLlm: needsRetrieval ? (contextOverflow ? 'warning' : 'active') : 'inactive',
      chunkerToIndexWriter: needsRetrieval ? 'active' : 'inactive',
      indexWriterToVectorIndex: needsRetrieval ? (needsStreamingIngestion ? 'warning' : 'active') : 'inactive',
    },
    meters: {
      indexScale: {
        ratio: needsRetrieval ? indexScaleRatio : 0,
        valueText: needsRetrieval ? formatStorageGigabytes(indexGigabytes) : '无 index',
        copy: needsRetrieval
          ? `${formatCount(totalChunks)} 个 chunk 向量，每个 ${Math.round(embeddingDimensions)} 维（约 ${bytesPerFloat} 字节/维）。`
          : 'corpus 塞得进 context window，所以暂时还没有 vector index。',
      },
      annLoad: {
        ratio: annRatio,
        valueText: needsRetrieval ? `${formatRate(effectiveAnnQps)} ANN/s` : 'n/a',
        copy: needsRetrieval
          ? `${formatRate(queriesPerSecond)}/s 的 query 在一个 ${formatCount(totalChunks)} 向量、${Math.round(embeddingDimensions)} 维的 index 上搜索；index 越大、向量越宽，每跳触及的图就越多。`
          : '一切都塞得进 prompt 时，无需做 approximate-nearest-neighbour search。',
      },
      rerankLoad: {
        ratio: rerankRatio,
        valueText: reranking ? `${formatRate(rerankUnitsPerSecond)} rerank/s` : '关闭',
        copy: reranking
          ? `一个 cross-encoder 每次 query 给 ${Math.round(topK)} 个候选打分；成本随 QPS 和 top-k 一起涨。`
          : 'reranking 关着，所以检索顺序直接来自 vector index。',
      },
      contextFit: {
        ratio: contextRatio,
        valueText: needsRetrieval
          ? `${formatCount(retrievedTokens)} / ${formatCount(contextWindowTokens)} tok`
          : `${formatCount(corpusTokens)} / ${formatCount(contextWindowTokens)} tok`,
        copy: contextOverflow
          ? 'retrieve 到的 chunk 溢出了可用 window；调低 top-k、缩小 chunk，或压缩 context。'
          : 'retrieve 到的 chunk 塞得进 window，还给 prompt 和答案留了余量。',
      },
      ingestionFreshness: {
        ratio: needsRetrieval ? ingestionRatio : 0,
        valueText: needsRetrieval ? `${formatRate(requiredEmbedOpsPerSecond)} embed/s` : 'n/a',
        copy: needsRetrieval
          ? `新增和改动的文档以约 ${formatRate(newChunksPerSecond)} chunks/s 的速度到来；一个 ${formatDuration(
              indexFreshnessSeconds,
            )} 的目标会以约 ${formatRate(requiredEmbedOpsPerSecond)} embeddings/s 把它们 streaming 过 embed-and-upsert。`
          : 'corpus 直接贴进 prompt 时，没有任何东西要 ingest。',
      },
    },
    decisions: buildDecisions({
      ...flags,
      topK,
      chunkSizeTokens,
      queriesPerSecond,
      indexFreshnessSeconds,
    }),
    reasons: buildReasons({
      ...flags,
      queriesPerSecond,
      documentsIndexed,
      totalChunks,
      indexGigabytes,
      retrievedTokens,
      contextWindowTokens,
      topK,
      chunkSizeTokens,
      embeddingDimensions,
      generationRatio,
      requiredEmbedOpsPerSecond,
      indexFreshnessSeconds,
    }),
  };
}

type ArchitectureFlags = {
  needsRetrieval: boolean;
  needsVectorIndex: boolean;
  needsAnnScaling: boolean;
  needsRerank: boolean;
  needsHybrid: boolean;
  contextOverflow: boolean;
  needsCache: boolean;
  needsStreamingIngestion: boolean;
  needsMultiTenant: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    queriesPerSecond: number;
    documentsIndexed: number;
    totalChunks: number;
    indexGigabytes: number;
    retrievedTokens: number;
    contextWindowTokens: number;
    topK: number;
    chunkSizeTokens: number;
    embeddingDimensions: number;
    generationRatio: number;
    requiredEmbedOpsPerSecond: number;
    indexFreshnessSeconds: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  // 1. Retrieval vs. prompt-stuffing — always present.
  if (!analysis.needsRetrieval) {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(analysis.documentsIndexed)} 篇文档（约 ${formatCount(
        analysis.totalChunks,
      )} 个 chunk）塞得进 context window，所以可以直接 stuff prompt，整个跳过 retrieval。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(analysis.documentsIndexed)} 篇文档（约 ${formatCount(
        analysis.totalChunks,
      )} 个 chunk）远超 window；从 vector index 取 top-k，而不是 stuff prompt。`,
    });
  }

  // 2. Chunking + embedding geometry — always present.
  if (!analysis.needsRetrieval) {
    reasons.push({
      severity: 'ok',
      text: `文档够短，可以整篇塞进 prompt，所以暂时没有 chunking、embedding 或 index 要维护。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `约 ${Math.round(analysis.chunkSizeTokens)}-token 的 chunk、${Math.round(
        analysis.embeddingDimensions,
      )} 维，建出一个约 ${formatStorageGigabytes(
        analysis.indexGigabytes,
      )} 的 vector index；chunk 越小 retrieval 越精准，但向量数量翻倍。`,
    });
  }

  // 3. Context-window fit — always present (ok under budget, danger on overflow).
  if (analysis.contextOverflow) {
    reasons.push({
      severity: 'danger',
      text: `top-k 取 ${Math.round(analysis.topK)} 拉出 ${formatCount(
        analysis.retrievedTokens,
      )} token，溢出了可用的 ${formatCount(
        analysis.contextWindowTokens,
      )} window；调小 k、缩小 chunk，或压缩 context。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `top-k 取 ${Math.round(analysis.topK)} 的 ${formatCount(
        analysis.retrievedTokens,
      )} token 塞得进 ${formatCount(
        analysis.contextWindowTokens,
      )} window，还给 prompt 和答案留了余量。`,
    });
  }

  // 4. Generation / caching cost — always present.
  if (analysis.needsCache) {
    reasons.push({
      severity: analysis.generationRatio > 1 ? 'warning' : 'ok',
      text: `${formatRate(
        analysis.queriesPerSecond,
      )}/s 让 generation 成为主导成本；一个 response/semantic cache 能让重复提问跳过 retrieval 和 generation。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatRate(
        analysis.queriesPerSecond,
      )}/s 的 generation 调用，单个 LLM tier 就能轻松扛住，所以暂时没必要上 response cache。`,
    });
  }

  // 5+. Scale-out forces, added only once they apply.
  if (analysis.needsAnnScaling) {
    reasons.push({
      severity: analysis.indexGigabytes > ramVectorBudgetGigabytes * 2 ? 'danger' : 'warning',
      text: `约 ${formatStorageGigabytes(analysis.indexGigabytes)} 的 index 在 ${formatRate(
        analysis.queriesPerSecond,
      )}/s 下撑爆了单个 ANN 节点；把 vector index 做 shard 和 replicate。`,
    });
  }

  if (analysis.needsRerank) {
    reasons.push({
      severity: 'warning',
      text: '一个 cross-encoder reranker 按 relevance 重排 top-k；只让它作用在候选上，绝不跑整个 corpus。',
    });
  }

  if (analysis.needsHybrid) {
    reasons.push({
      severity: 'ok',
      text: 'hybrid search 把 BM25 关键词命中和 vector similarity 融合起来，找回 dense embedding 漏掉的精确词。',
    });
  }

  if (analysis.needsStreamingIngestion) {
    reasons.push({
      severity: 'warning',
      text: `要达到 ${formatDuration(
        analysis.indexFreshnessSeconds,
      )} 的 freshness 目标，新文档上需要约 ${formatRate(
        analysis.requiredEmbedOpsPerSecond,
      )} embeddings/s；从 batch rebuild 转向一条 streaming 的 ingest-and-upsert pipeline。`,
    });
  }

  if (analysis.needsMultiTenant) {
    reasons.push({
      severity: 'warning',
      text: '到这个规模，租户必须用 namespace 或 metadata filter 隔离，index 也要按租户或 shard key 做 shard。',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    topK: number;
    chunkSizeTokens: number;
    queriesPerSecond: number;
    indexFreshnessSeconds: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    chunking: {
      state: flags.needsRetrieval ? (flags.contextOverflow ? 'tradeoff' : 'needed') : 'not-yet',
      copy: flags.needsRetrieval
        ? `把文档切成约 ${Math.round(
            flags.chunkSizeTokens,
          )}-token 的 chunk：越小 retrieval 越精准，但向量数量翻倍、context 预算也更紧。`
        : '暂时不用 chunking —— 文档够短，可以整篇塞进 prompt。',
    },
    vectorIndex: {
      state: flags.needsAnnScaling ? 'needed' : flags.needsVectorIndex ? 'useful' : 'not-yet',
      copy: flags.needsVectorIndex
        ? flags.needsAnnScaling
          ? '把 ANN index（HNSW/IVF，比如 FAISS 或某个 vector DB）做 shard 和 replicate；单个节点已经放不下也服务不动它了。'
          : '把 chunk 向量存进 ANN index（HNSW），让 top-k 搜索在 corpus 增长时保持亚线性。'
        : '整个 corpus 都塞得进 context window 时，不需要 vector index。',
    },
    hybrid: {
      state: flags.needsHybrid ? 'useful' : 'not-yet',
      copy: flags.needsHybrid
        ? '在 vector search 旁边再跑 BM25 关键词搜索，把两边的排名融合起来，抓住精确词的 query。'
        : '在精确词 recall（编号、名字）还没成为问题之前，纯 vector search 就够了。',
    },
    rerank: {
      state: flags.needsRerank ? 'tradeoff' : 'not-yet',
      copy: flags.needsRerank
        ? `cross-encoder reranking 以实打实的 GPU 和 latency 成本，把 top-${Math.round(
            flags.topK,
          )} 的 relevance 拉上去；先宽地 retrieve，再窄地 rerank。`
        : 'reranking 关着；vector index 给出的 bi-encoder 排序直接进入 assembly。',
    },
    contextAssembly: {
      state: flags.needsRetrieval ? (flags.contextOverflow ? 'needed' : 'useful') : 'not-yet',
      copy: flags.needsRetrieval
        ? flags.contextOverflow
          ? 'retrieve 到的 token 超出了 window；限制 top-k、去重，或压缩 chunk，好让 prompt 和答案仍塞得下。'
          : '把最好的 chunk 连同 prompt 一起打包，在 window 内给答案留出余量。'
        : '整个 corpus 就是 context，没有什么要 assemble 的。',
    },
    ingestion: {
      state: flags.needsStreamingIngestion ? 'needed' : flags.needsRetrieval ? 'useful' : 'not-yet',
      copy: flags.needsRetrieval
        ? flags.needsStreamingIngestion
          ? '把新文档持续地 streaming 过 chunk-embed-upsert 来命中 freshness 目标；batch rebuild 太慢了。'
          : '一个定期的 batch 任务来 chunk、embed、upsert 新文档，就能让 index 保持足够新鲜。'
        : '文档直接贴进 prompt 时，没有 ingestion pipeline。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsRetrieval) {
    return 'Prompt stuffing（不做 retrieval）';
  }
  if (flags.needsMultiTenant) {
    return '多租户 RAG 平台 + streaming ingestion';
  }
  if (flags.needsHybrid && flags.needsCache) {
    return 'Hybrid retrieval + rerank + caching';
  }
  if (flags.needsRerank) {
    return 'Vector retrieval + reranking';
  }
  return 'Vector DB retrieval（top-k）';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsRetrieval) {
    return '整个 corpus 都塞得进 context window，于是直接把文档 stuff 进 prompt、让模型作答。没必要上 index、embedder 或 ingestion。';
  }
  if (flags.needsMultiTenant) {
    return '一个 shard、replicate 过、带 per-tenant namespace 的 vector index 提供 ANN retrieval，一个 reranker 把 top-k 磨精准，一条 streaming pipeline 持续 chunk、embed、upsert 新文档，让 retrieval 近乎实时。';
  }
  if (flags.needsHybrid && flags.needsCache) {
    return 'vector 和 keyword index 融合起来提升 recall，一个 reranker 重排候选，一个 response cache 在昂贵的 generation 步骤之前把重复 query 接住。';
  }
  if (flags.needsRerank) {
    return 'vector index 廉价地返回一个较宽的 top-k，一个 cross-encoder reranker 按 relevance 重排，再把最好的 chunk assemble 进 context。';
  }
  return '文档被 chunk 并 embed 进一个 ANN vector index；每次 query 都做 embed、按 similarity 取 top-k，再把这些 chunk assemble 进 prompt 去 generate。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsRetrieval) {
    return 'Query -> stuff prompt -> LLM';
  }
  if (flags.needsMultiTenant) {
    return 'Query -> embed -> sharded ANN -> rerank -> assemble -> LLM';
  }
  if (flags.needsHybrid && flags.needsCache) {
    return 'Query -> cache -> embed + BM25 -> rerank -> assemble -> LLM';
  }
  if (flags.needsRerank) {
    return 'Query -> embed -> ANN top-k -> rerank -> assemble -> LLM';
  }
  return 'Query -> embed -> ANN top-k -> assemble -> LLM';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
