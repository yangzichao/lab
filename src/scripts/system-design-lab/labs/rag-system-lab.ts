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
  eyebrow: 'System Design Lab',
  title:
    'A RAG system is two pipelines — offline ingestion and an online retrieve-then-generate query path — and each force scales a different stage.',
  summary:
    'Change query rate, corpus size, chunk size, how many chunks you retrieve, the model context window, and embedding dimensions, then toggle reranking and hybrid search. The design moves from stuffing the prompt to a vector index with ANN retrieval, to chunking and reranking, to hybrid search plus caching, and finally a multi-tenant, continuously-ingesting platform.',
  controls: [
    {
      id: 'queriesPerSecond',
      label: 'Query rate',
      help: 'Online questions per second hitting the retrieve-then-generate path.',
      min: 0.1,
      max: 20_000,
      defaultValue: 20,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'documentsIndexed',
      label: 'Documents indexed',
      help: 'Source documents in the corpus; each is chunked and embedded into the vector index.',
      min: 5,
      max: 1_000_000_000,
      defaultValue: 100_000,
      scale: 'log',
      unit: 'docs',
      format: 'count',
    },
    {
      id: 'chunkSizeTokens',
      label: 'Chunk size',
      help: 'Tokens per chunk. Smaller chunks sharpen retrieval but multiply vectors and shrink context coverage.',
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
      help: 'Chunks pulled from the vector index per query before assembly and (optional) reranking.',
      min: 1,
      max: 200,
      defaultValue: 8,
      scale: 'log',
      unit: 'chunks',
      format: 'count',
    },
    {
      id: 'contextWindowTokens',
      label: 'Context window',
      help: 'Model context budget in tokens; retrieved chunks plus the prompt must fit inside it.',
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
      help: 'Vector width. Higher dimensions can lift recall but enlarge the index and slow ANN search.',
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
      help: 'How quickly a newly written document must become retrievable; tighter targets force streaming ingestion.',
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
      help: 'Run a cross-encoder over the top-k to reorder by relevance; higher quality, real latency and GPU cost.',
      defaultValue: false,
    },
    {
      id: 'hybridSearch',
      label: 'Hybrid (keyword + vector) search',
      help: 'Combine BM25 keyword matches with vector similarity to catch exact terms dense vectors miss.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'prompt-stuffing',
      step: '01',
      title: 'Stuff the prompt',
      summary: 'A handful of docs pasted straight into the context window.',
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
      title: 'Vector DB retrieval',
      summary: 'The corpus no longer fits the window, so retrieve top-k by similarity.',
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
      summary: 'Tighter chunks and a reranker lift answer quality.',
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
      summary: 'Keyword recall plus caching tame cost at higher load.',
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
      title: 'Multi-tenant, fresh, at scale',
      summary: 'Billions of chunks, near-real-time freshness, isolated tenants.',
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
    title: 'Retrieval-augmented generation architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a RAG system: clients, a RAG API, a retrieval stage embedding the query and searching a vector index, a rerank and context-assembly stage, LLM generation with a response cache, and an asynchronous ingestion pipeline that chunks and embeds documents.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'asks questions',
            summary: 'sends natural-language questions and renders grounded answers',
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
            subtitle: 'orchestrates query',
            summary: 'orchestrates embed, retrieve, rerank, assemble, and generate per query',
          },
          {
            id: 'responseCache',
            title: 'Response cache',
            subtitle: 'repeat queries',
            summary: 'returns cached answers for repeated or similar questions before any retrieval',
          },
        ],
      },
      {
        id: 'retrieval',
        label: 'Retrieval',
        variant: 'backbone',
        nodes: [
          {
            id: 'queryEmbedder',
            title: 'Query embedder',
            subtitle: 'text to vector',
            summary: 'embeds the question with the same model used at ingestion',
          },
          {
            id: 'vectorIndex',
            title: 'Vector index',
            subtitle: 'ANN top-k',
            summary: 'approximate-nearest-neighbour search returns the top-k candidate chunks',
          },
          {
            id: 'keywordIndex',
            title: 'Keyword index',
            subtitle: 'BM25 matches',
            summary: 'inverted index that catches exact terms dense vectors miss, for hybrid search',
          },
        ],
      },
      {
        id: 'assembly',
        label: 'Rerank + assemble',
        variant: 'processing',
        nodes: [
          {
            id: 'reranker',
            title: 'Reranker',
            subtitle: 'cross-encoder',
            summary: 'reorders candidates by query-chunk relevance before they enter the context',
          },
          {
            id: 'contextAssembler',
            title: 'Context assembler',
            subtitle: 'fit window',
            summary: 'packs the best chunks plus the prompt to fit within the context window',
          },
        ],
      },
      {
        id: 'generation',
        label: 'Generation',
        variant: 'storage',
        nodes: [
          {
            id: 'llm',
            title: 'LLM generator',
            subtitle: 'grounded answer',
            summary: 'generates the answer conditioned on the assembled context',
          },
        ],
      },
      {
        id: 'ingestion',
        label: 'Ingestion',
        variant: 'processing',
        nodes: [
          {
            id: 'chunker',
            title: 'Chunk + embed',
            subtitle: 'async pipeline',
            summary: 'splits new documents into chunks and embeds them off the query path',
          },
          {
            id: 'indexWriter',
            title: 'Index writer',
            subtitle: 'upsert vectors',
            summary: 'upserts chunk vectors into the index to keep retrieval fresh',
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
    { id: 'indexScale', label: 'Vector index scale' },
    { id: 'annLoad', label: 'ANN query load' },
    { id: 'rerankLoad', label: 'Rerank load' },
    { id: 'contextFit', label: 'Context window fit' },
    { id: 'ingestionFreshness', label: 'Ingestion / freshness' },
  ],
  decisions: [
    { id: 'chunking', title: 'Chunking strategy' },
    { id: 'vectorIndex', title: 'Vector index / ANN' },
    { id: 'hybrid', title: 'Hybrid search' },
    { id: 'rerank', title: 'Reranking' },
    { id: 'contextAssembly', title: 'Context assembly' },
    { id: 'ingestion', title: 'Ingestion / freshness' },
  ],
  sourceBackedRules: [
    {
      title: 'RAG conditions generation on retrieved passages instead of memorised weights',
      source: 'Lewis et al., 2020 (arXiv:2005.11401)',
      url: 'https://arxiv.org/abs/2005.11401',
      summary:
        'The original RAG paper retrieves relevant passages with a dense retriever and feeds them to a seq2seq generator, separating knowledge (the index) from the parametric model.',
    },
    {
      title: 'Billion-scale similarity search needs an ANN index, not brute force',
      source: 'FAISS',
      url: 'https://github.com/facebookresearch/faiss',
      summary:
        'FAISS provides quantised and graph-based indexes so nearest-neighbour search over very large vector sets stays fast and memory-feasible.',
    },
    {
      title: 'HNSW gives logarithmic-time approximate nearest-neighbour search',
      source: 'Malkov & Yashunin, 2016 (arXiv:1603.09320)',
      url: 'https://arxiv.org/abs/1603.09320',
      summary:
        'Hierarchical Navigable Small World graphs trade a tunable recall/latency knob for high-recall search that scales to large indexes, the default in most vector databases.',
    },
    {
      title: 'Vector databases manage embeddings, metadata filtering, and updates',
      source: 'pgvector',
      url: 'https://github.com/pgvector/pgvector',
      summary:
        'A production vector store handles index building, upserts for freshness, and metadata filters for multi-tenant isolation, beyond raw nearest-neighbour math.',
    },
  ],
  teachingAssumptions: [
    'Average documents split into a few chunks; total vectors are documents times chunks-per-doc scaled by chunk size.',
    'Freshness is modeled as new/changed docs (a small daily share of the corpus) being embedded and upserted, not a full-corpus re-embed; a tighter target forces a streaming pipeline.',
    'ANN, rerank, embedding, and generation per-node budgets are conservative teaching numbers, not vendor limits.',
    'Cache hit rate and recall are approximated; real systems tune HNSW parameters and rerankers empirically.',
  ],
  teachingWalkthrough: [
    {
      id: 'stuff',
      step: '01',
      focus: 'Stuff the prompt',
      scenarioId: 'prompt-stuffing',
      question:
        'You have a handful of short docs and a 32k-token window. Do you need a vector database at all, or can you just paste the docs into the prompt?',
      reveal:
        'Just paste them. When the whole corpus fits inside the context window, retrieval is pure overhead — no embedder, no index, no ANN. The simplest correct RAG is no retrieval at all.',
      takeaway: 'If the corpus fits the window, skip retrieval entirely.',
    },
    {
      id: 'retrieve',
      step: '02',
      focus: 'Corpus outgrows window',
      scenarioId: 'vector-retrieval',
      question:
        '100k docs is far larger than any context window. What lets you find the few relevant chunks without scanning every vector each query?',
      reveal:
        'Embed each chunk once at ingestion, store the vectors in an index, and at query time embed the question and pull the top-k by similarity. Exact search is too slow at this scale, so the index uses approximate nearest neighbour (HNSW/IVF) to return candidates in logarithmic time.',
      takeaway: 'Once the corpus exceeds the window, retrieve top-k via an ANN vector index.',
    },
    {
      id: 'rerank',
      step: '03',
      focus: 'Quality: chunk + rerank',
      scenarioId: 'chunk-and-rerank',
      question:
        'Answers cite the wrong passage even though the right one is sitting in the index. Why is the relevant chunk retrieved but not surfaced near the top, and how do you fix it without shrinking recall?',
      reveal:
        'Retrieve a wide top-k cheaply with the vector index, then run a cross-encoder reranker over those candidates to reorder by true query-chunk relevance, keeping only the best for the context. Smaller chunks also sharpen what each vector represents. Reranking adds GPU cost and latency, so it sits on the top-k, never the whole corpus.',
      takeaway: 'Retrieve wide and cheap, then rerank narrow and accurate.',
    },
    {
      id: 'hybrid',
      step: '04',
      focus: 'Recall + cost at load',
      scenarioId: 'hybrid-and-cache',
      question:
        'Dense retrieval keeps missing exact product codes and rare names, and 2k QPS is making generation the bill. Two different problems — what addresses each?',
      reveal:
        'Add a keyword (BM25) index and fuse its results with vector hits — hybrid search recovers exact-match terms dense embeddings blur. Separately, a response/semantic cache serves repeated and near-duplicate questions before any retrieval or generation, cutting the most expensive stage.',
      takeaway: 'Hybrid search fixes recall on exact terms; caching fixes cost on repeated queries.',
    },
    {
      id: 'platform',
      step: '05',
      focus: 'Multi-tenant, fresh, scaled',
      scenarioId: 'multi-tenant-fresh',
      question:
        'Billions of chunks, many tenants, and documents must be retrievable seconds after upload. What breaks first, and how do you keep tenants isolated and the index fresh?',
      reveal:
        'The index outgrows one node and must be sharded/replicated, with metadata filters or per-tenant namespaces for isolation. A daily batch rebuild cannot meet a seconds-level freshness target, so ingestion becomes a streaming pipeline that chunks, embeds, and upserts continuously off the query path.',
      takeaway: 'At platform scale, shard the index, isolate tenants by namespace, and stream ingestion for freshness.',
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
        valueText: needsRetrieval ? formatStorageGigabytes(indexGigabytes) : 'no index',
        copy: needsRetrieval
          ? `${formatCount(totalChunks)} chunk vectors at ${Math.round(embeddingDimensions)} dims (~${bytesPerFloat} bytes each).`
          : 'The corpus fits the context window, so there is no vector index yet.',
      },
      annLoad: {
        ratio: annRatio,
        valueText: needsRetrieval ? `${formatRate(effectiveAnnQps)} ANN/s` : 'n/a',
        copy: needsRetrieval
          ? `${formatRate(queriesPerSecond)}/s of queries search a ${formatCount(totalChunks)}-vector index at ${Math.round(embeddingDimensions)} dims; bigger indexes and wider vectors both touch more of the graph per hop.`
          : 'No approximate-nearest-neighbour search while everything fits the prompt.',
      },
      rerankLoad: {
        ratio: rerankRatio,
        valueText: reranking ? `${formatRate(rerankUnitsPerSecond)} rerank/s` : 'off',
        copy: reranking
          ? `A cross-encoder scores ${Math.round(topK)} candidates per query; cost scales with both QPS and top-k.`
          : 'Reranking is off, so retrieval order comes straight from the vector index.',
      },
      contextFit: {
        ratio: contextRatio,
        valueText: needsRetrieval
          ? `${formatCount(retrievedTokens)} / ${formatCount(contextWindowTokens)} tok`
          : `${formatCount(corpusTokens)} / ${formatCount(contextWindowTokens)} tok`,
        copy: contextOverflow
          ? 'Retrieved chunks overflow the usable window; lower top-k, shrink chunks, or compress context.'
          : 'Retrieved chunks fit the window with headroom for the prompt and answer.',
      },
      ingestionFreshness: {
        ratio: needsRetrieval ? ingestionRatio : 0,
        valueText: needsRetrieval ? `${formatRate(requiredEmbedOpsPerSecond)} embed/s` : 'n/a',
        copy: needsRetrieval
          ? `New and changed docs arrive at ~${formatRate(newChunksPerSecond)} chunks/s; a ${formatDuration(
              indexFreshnessSeconds,
            )} target streams them through embed-and-upsert at ~${formatRate(requiredEmbedOpsPerSecond)} embeddings/s.`
          : 'Nothing to ingest while the corpus is pasted directly into the prompt.',
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
      text: `${formatCount(analysis.documentsIndexed)} docs (~${formatCount(
        analysis.totalChunks,
      )} chunks) fit the context window, so you can stuff the prompt and skip retrieval entirely.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(analysis.documentsIndexed)} docs (~${formatCount(
        analysis.totalChunks,
      )} chunks) far exceed the window; retrieve top-k from a vector index instead of stuffing the prompt.`,
    });
  }

  // 2. Chunking + embedding geometry — always present.
  if (!analysis.needsRetrieval) {
    reasons.push({
      severity: 'ok',
      text: `Documents are short enough to pass whole into the prompt, so there is no chunking, embedding, or index to maintain yet.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `~${Math.round(analysis.chunkSizeTokens)}-token chunks at ${Math.round(
        analysis.embeddingDimensions,
      )} dims build a ~${formatStorageGigabytes(
        analysis.indexGigabytes,
      )} vector index; smaller chunks sharpen retrieval but multiply vectors.`,
    });
  }

  // 3. Context-window fit — always present (ok under budget, danger on overflow).
  if (analysis.contextOverflow) {
    reasons.push({
      severity: 'danger',
      text: `Top-k of ${Math.round(analysis.topK)} pulls ${formatCount(
        analysis.retrievedTokens,
      )} tokens, overflowing the usable ${formatCount(
        analysis.contextWindowTokens,
      )} window; trim k, shrink chunks, or compress context.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `Top-k of ${Math.round(analysis.topK)} fits ${formatCount(
        analysis.retrievedTokens,
      )} tokens inside the ${formatCount(
        analysis.contextWindowTokens,
      )} window with headroom for the prompt and answer.`,
    });
  }

  // 4. Generation / caching cost — always present.
  if (analysis.needsCache) {
    reasons.push({
      severity: analysis.generationRatio > 1 ? 'warning' : 'ok',
      text: `${formatRate(
        analysis.queriesPerSecond,
      )}/s makes generation the dominant cost; a response/semantic cache lets repeated questions skip retrieval and generation.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatRate(
        analysis.queriesPerSecond,
      )}/s of generation calls sit comfortably on one LLM tier, so no response cache is justified yet.`,
    });
  }

  // 5+. Scale-out forces, added only once they apply.
  if (analysis.needsAnnScaling) {
    reasons.push({
      severity: analysis.indexGigabytes > ramVectorBudgetGigabytes * 2 ? 'danger' : 'warning',
      text: `A ~${formatStorageGigabytes(analysis.indexGigabytes)} index at ${formatRate(
        analysis.queriesPerSecond,
      )}/s outgrows one ANN node; shard and replicate the vector index.`,
    });
  }

  if (analysis.needsRerank) {
    reasons.push({
      severity: 'warning',
      text: 'A cross-encoder reranker reorders the top-k for relevance; keep it on the candidates only, never the whole corpus.',
    });
  }

  if (analysis.needsHybrid) {
    reasons.push({
      severity: 'ok',
      text: 'Hybrid search fuses BM25 keyword hits with vector similarity to recover exact terms dense embeddings miss.',
    });
  }

  if (analysis.needsStreamingIngestion) {
    reasons.push({
      severity: 'warning',
      text: `Hitting a ${formatDuration(
        analysis.indexFreshnessSeconds,
      )} freshness target needs ~${formatRate(
        analysis.requiredEmbedOpsPerSecond,
      )} embeddings/s on new docs; move from batch rebuilds to a streaming ingest-and-upsert pipeline.`,
    });
  }

  if (analysis.needsMultiTenant) {
    reasons.push({
      severity: 'warning',
      text: 'At this scale tenants must be isolated by namespace or metadata filter, and the index sharded per tenant or shard key.',
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
        ? `Split documents into ~${Math.round(
            flags.chunkSizeTokens,
          )}-token chunks: smaller sharpens retrieval but multiplies vectors and tightens the context budget.`
        : 'No chunking yet — the documents are short enough to pass whole into the prompt.',
    },
    vectorIndex: {
      state: flags.needsAnnScaling ? 'needed' : flags.needsVectorIndex ? 'useful' : 'not-yet',
      copy: flags.needsVectorIndex
        ? flags.needsAnnScaling
          ? 'Shard and replicate an ANN index (HNSW/IVF, e.g. FAISS or a vector DB); a single node no longer holds or serves it.'
          : 'Store chunk vectors in an ANN index (HNSW) so top-k search stays sub-linear as the corpus grows.'
        : 'No vector index needed while the whole corpus fits the context window.',
    },
    hybrid: {
      state: flags.needsHybrid ? 'useful' : 'not-yet',
      copy: flags.needsHybrid
        ? 'Run BM25 keyword search alongside vector search and fuse the rankings to catch exact-term queries.'
        : 'Pure vector search is enough until exact-term recall (codes, names) becomes a problem.',
    },
    rerank: {
      state: flags.needsRerank ? 'tradeoff' : 'not-yet',
      copy: flags.needsRerank
        ? `Cross-encoder reranking lifts top-${Math.round(
            flags.topK,
          )} relevance at real GPU and latency cost; retrieve wide, then rerank narrow.`
        : 'Reranking is off; the bi-encoder ordering from the vector index goes straight to assembly.',
    },
    contextAssembly: {
      state: flags.needsRetrieval ? (flags.contextOverflow ? 'needed' : 'useful') : 'not-yet',
      copy: flags.needsRetrieval
        ? flags.contextOverflow
          ? 'Retrieved tokens exceed the window; cap top-k, dedupe, or compress chunks so the prompt and answer still fit.'
          : 'Pack the best chunks plus the prompt, leaving headroom for the answer within the window.'
        : 'The whole corpus is the context, so there is nothing to assemble.',
    },
    ingestion: {
      state: flags.needsStreamingIngestion ? 'needed' : flags.needsRetrieval ? 'useful' : 'not-yet',
      copy: flags.needsRetrieval
        ? flags.needsStreamingIngestion
          ? 'Stream new documents through chunk-embed-upsert continuously to hit the freshness target; batch rebuilds are too slow.'
          : 'A periodic batch job that chunks, embeds, and upserts new documents keeps the index fresh enough.'
        : 'No ingestion pipeline while documents are pasted into the prompt directly.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsRetrieval) {
    return 'Prompt stuffing (no retrieval)';
  }
  if (flags.needsMultiTenant) {
    return 'Multi-tenant RAG platform + streaming ingestion';
  }
  if (flags.needsHybrid && flags.needsCache) {
    return 'Hybrid retrieval + rerank + caching';
  }
  if (flags.needsRerank) {
    return 'Vector retrieval + reranking';
  }
  return 'Vector DB retrieval (top-k)';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsRetrieval) {
    return 'The whole corpus fits the context window, so the prompt is stuffed with the documents and the model answers directly. No index, embedder, or ingestion is justified.';
  }
  if (flags.needsMultiTenant) {
    return 'A sharded, replicated vector index with per-tenant namespaces serves ANN retrieval, a reranker sharpens the top-k, and a streaming pipeline chunks, embeds, and upserts new documents to keep retrieval near-real-time.';
  }
  if (flags.needsHybrid && flags.needsCache) {
    return 'Vector and keyword indexes are fused for recall, a reranker reorders candidates, and a response cache absorbs repeated queries before the costly generation step.';
  }
  if (flags.needsRerank) {
    return 'The vector index returns a wide top-k cheaply and a cross-encoder reranker reorders it for relevance before the best chunks are assembled into the context.';
  }
  return 'Documents are chunked and embedded into an ANN vector index; each query embeds, retrieves top-k by similarity, and the chunks are assembled into the prompt for generation.';
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
