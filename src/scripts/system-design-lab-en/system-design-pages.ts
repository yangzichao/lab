/**
 * Single source of truth for the standalone System Design Lab pages.
 *
 * Each entry maps a URL slug under `/system-design/<slug>/` to the metadata used
 * by the page itself (`<title>` + meta description), the shared cross-lab nav,
 * and the home index card. Adding a lab here wires it into all three at once.
 */
export type SystemDesignLabPage = {
  /** URL slug; the page lives at `/system-design/<slug>/`. */
  slug: string;
  /** Short label used in the cross-lab navigation bar. */
  navLabel: string;
  /** Card title shown on the lab index. */
  cardTitle: string;
  /** Card description shown on the lab index. */
  cardDescription: string;
  /** Full `<title>` for the standalone page. */
  pageTitle: string;
  /** Meta description for the standalone page. */
  metaDescription: string;
};

export const systemDesignLabPages: SystemDesignLabPage[] = [
  {
    slug: 'url-shortener',
    navLabel: 'URL Shortener',
    cardTitle: 'URL Shortener Lab',
    cardDescription:
      'Grow a read-heavy URL shortener from one database to cache-aside reads, a code-generation strategy, a sharded KV store, and multi-region edge redirects.',
    pageTitle: 'URL Shortener — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven URL shortener playground with a guided walkthrough: scale a read-heavy key-value lookup through caching, code generation, sharding, and edge redirects.',
  },
  {
    slug: 'rate-limiter',
    navLabel: 'Rate Limiter',
    cardTitle: 'Rate Limiter Lab',
    cardDescription:
      'Move a latency-sensitive rate limiter from a local counter to Redis/Lua, sharding, and a global quota service as correctness demands grow.',
    pageTitle: 'Rate Limiter — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven rate limiter playground: trace the path from an in-process counter to atomic Redis/Lua state, sharding, and a strict global quota service.',
  },
  {
    slug: 'news-feed',
    navLabel: 'News Feed',
    cardTitle: 'News Feed Lab',
    cardDescription:
      'Watch a social timeline flip between fan-out-on-write and fan-out-on-read, then go hybrid when one celebrity’s followers blow up write amplification.',
    pageTitle: 'News Feed — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven news feed playground with a guided walkthrough: trade fan-out-on-write against fan-out-on-read, handle the celebrity problem, then add ranking and sharding.',
  },
  {
    slug: 'chat-messaging',
    navLabel: 'Chat',
    cardTitle: 'Chat / Messaging Lab',
    cardDescription:
      'Scale real-time chat from one server to a connection-gateway fleet, group fan-out, durable offline inboxes, and multi-region routing.',
    pageTitle: 'Chat / Messaging — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven chat system playground with a guided walkthrough: manage millions of persistent connections, message fan-out, presence, and offline inboxes.',
  },
  {
    slug: 'notification-system',
    navLabel: 'Notifications',
    cardTitle: 'Notification System Lab',
    cardDescription:
      'Decouple a multi-channel notification pipeline from slow push/email/SMS providers with queues, dedup, rate limits, retries, and a dead-letter queue.',
    pageTitle: 'Notification System — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven notification system playground with a guided walkthrough: fan out across push, email, and SMS with queues, dedup, rate limiting, and retries.',
  },
  {
    slug: 'search-autocomplete',
    navLabel: 'Autocomplete',
    cardTitle: 'Search Autocomplete Lab',
    cardDescription:
      'Serve top-k typeahead suggestions under a tight latency budget with a trie, hot-prefix caching, prefix sharding, and a streaming log-aggregation pipeline.',
    pageTitle: 'Search Autocomplete — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven search autocomplete playground with a guided walkthrough: precomputed top-k tries, hot-prefix caching, prefix sharding, and near-real-time updates.',
  },
  {
    slug: 'job-board',
    navLabel: 'Job Board',
    cardTitle: 'Job Board Search Lab',
    cardDescription:
      'Start with PostgreSQL B-tree / GIN / GiST / partial indexes, then let candidate scoring, QPS, and search features decide when Elasticsearch/OpenSearch earns its place as a separate component.',
    pageTitle: 'Job Board Search — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven Job Board search playground: compose PostgreSQL full-text and typed indexes, expose common-keyword candidate explosion, and split out a Search Service only when evidence demands it.',
  },
  {
    slug: 'web-crawler',
    navLabel: 'Web Crawler',
    cardTitle: 'Web Crawler Lab',
    cardDescription:
      'Grow a crawler from a single loop to a distributed frontier with politeness scheduling, Bloom-filter dedup, DNS caching, and sharded content storage.',
    pageTitle: 'Web Crawler — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven web crawler playground with a guided walkthrough: URL frontier, per-domain politeness, Bloom-filter dedup, DNS caching, and a distributed fetcher fleet.',
  },
  {
    slug: 'video-streaming',
    navLabel: 'Video Streaming',
    cardTitle: 'Video Streaming Lab',
    cardDescription:
      'Split a video platform into an async transcode pipeline and a CDN-delivered playback path as uploads, viewers, and catalog size grow.',
    pageTitle: 'Video Streaming — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven video streaming playground with a guided walkthrough: upload-and-transcode pipelines, object storage, adaptive bitrate, and CDN delivery.',
  },
  {
    slug: 'file-sync',
    navLabel: 'File Sync',
    cardTitle: 'File Sync Lab',
    cardDescription:
      'Build a Dropbox-style sync service with content-addressed chunking, dedup, a separate metadata service, change notifications, and conflict handling.',
    pageTitle: 'File Sync — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven file sync playground with a guided walkthrough: chunking and dedup, metadata vs block storage, change notification, and conflict resolution.',
  },
  {
    slug: 'ride-sharing',
    navLabel: 'Ride Sharing',
    cardTitle: 'Ride Sharing Lab',
    cardDescription:
      'Handle a firehose of driver GPS updates and fast nearest-driver queries with an in-memory geospatial index, matching, trip state, and geo-sharding.',
    pageTitle: 'Ride Sharing — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven ride-sharing playground with a guided walkthrough: high-frequency location ingest, geohash/quadtree indexing, matching, trip state, and surge.',
  },
  {
    slug: 'kv-store',
    navLabel: 'KV Store',
    cardTitle: 'Key-Value Store Lab',
    cardDescription:
      'Trace a Dynamo-style key-value store from one node to a consistent-hash ring with replication, tunable R/W quorums, and cross-region anti-entropy.',
    pageTitle: 'Key-Value Store — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven distributed key-value store playground with a guided walkthrough: consistent hashing, replication factor, quorum tuning, and the CAP tradeoff.',
  },
  {
    slug: 'payment-ledger',
    navLabel: 'Payments',
    cardTitle: 'Payment Ledger Lab',
    cardDescription:
      'Put correctness first: idempotency keys, a double-entry append-only ledger, ACID writes, async PSP integration, and reconciliation before horizontal scale.',
    pageTitle: 'Payment Ledger — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven payment and ledger playground with a guided walkthrough: idempotency, double-entry ledgers, ACID transactions, async PSP capture, and reconciliation.',
  },
  {
    slug: 'google-docs',
    navLabel: 'Google Docs',
    cardTitle: 'Google Docs Lab',
    cardDescription:
      'See how a collaborative document backend changes shape when concurrent edit ordering — not raw traffic — becomes the binding constraint.',
    pageTitle: 'Google Docs — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven Google Docs collaboration playground: watch the architecture shift as concurrent editors, edit ordering, and offline merge constraints take over.',
  },
  {
    slug: 'online-judge',
    navLabel: 'Online Judge',
    cardTitle: 'Online Judge Lab',
    cardDescription:
      'Scale a LeetCode-style online judge where the real cost is sandboxed worker economics, not API request volume.',
    pageTitle: 'Online Judge — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven Online Judge playground: see why scaling a code-execution judge is mostly sandboxed worker economics and queue depth, not API traffic.',
  },
  {
    slug: 'ad-tracking',
    navLabel: 'Ad Tracking',
    cardTitle: 'Ad Click Tracking Lab',
    cardDescription:
      'Watch an ad click/impression pipeline grow from one collector to partitioned streaming as traffic spikes, freshness, and billing-grade durability force each step.',
    pageTitle: 'Ad Click Tracking — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven ad click and impression tracking playground: scale from a single collector to a partitioned, streaming, billing-grade pipeline as the workload forces it.',
  },
  {
    slug: 'recommendation-system',
    navLabel: 'Recommender',
    cardTitle: 'Recommendation System Lab',
    cardDescription:
      'Grow a recommender from a popularity list to two-tower ANN retrieval, a ranking model fed by a feature store, and a real-time multi-stage funnel.',
    pageTitle: 'Recommendation System — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven recommendation system playground with a guided walkthrough: candidate generation, two-tower embeddings, approximate nearest-neighbour retrieval, ranking, and a feature store.',
  },
  {
    slug: 'feature-store',
    navLabel: 'Feature Store',
    cardTitle: 'Feature Store Lab',
    cardDescription:
      'Split features into online and offline stores with training/serving parity, point-in-time-correct training joins, and streaming freshness at scale.',
    pageTitle: 'Feature Store — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven feature store playground with a guided walkthrough: online/offline parity, low-latency serving lookups, point-in-time training joins, and streaming features.',
  },
  {
    slug: 'model-serving',
    navLabel: 'Model Serving',
    cardTitle: 'Model Serving Lab',
    cardDescription:
      'Take a model endpoint from one box to dynamic batching, GPU autoscaling, a versioned registry with canary rollout, and multi-model packing under a p99 budget.',
    pageTitle: 'Model Serving — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven ML model serving playground with a guided walkthrough: request batching, GPU vs CPU autoscaling, model registry and canary deploys, and p99 latency under load.',
  },
  {
    slug: 'fraud-detection',
    navLabel: 'Fraud Detection',
    cardTitle: 'Fraud Detection Lab',
    cardDescription:
      'Move from static rules to real-time streaming features and synchronous model scoring inside a tight decision budget, then add a label-feedback retraining loop and graph features.',
    pageTitle: 'Real-time Fraud Detection — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven real-time fraud detection playground with a guided walkthrough: streaming feature aggregation, synchronous scoring under a latency budget, feedback loops, and graph features.',
  },
  {
    slug: 'ml-training-pipeline',
    navLabel: 'Training Pipeline',
    cardTitle: 'ML Training Pipeline Lab',
    cardDescription:
      'Turn notebook training into a reproducible pipeline with data versioning, distributed training, experiment tracking, a model registry, and automated retraining.',
    pageTitle: 'ML Training Pipeline — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven ML training pipeline playground with a guided walkthrough: orchestrated data and training stages, data versioning, distributed training, experiment tracking, and a model registry.',
  },
  {
    slug: 'llm-training-infra',
    navLabel: 'LLM Training',
    cardTitle: 'LLM Pretraining Infra Lab',
    cardDescription:
      'Scale LLM pretraining from one GPU to data parallelism, then tensor + pipeline (3D) parallelism for a model too big for one GPU, with activation checkpointing and fault-tolerant checkpoints.',
    pageTitle: 'LLM Pretraining Infrastructure — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven LLM pretraining playground with a guided walkthrough: data, tensor, and pipeline parallelism, gradient collectives over fast interconnect, activation checkpointing, and fault tolerance.',
  },
  {
    slug: 'llm-inference',
    navLabel: 'LLM Inference',
    cardTitle: 'LLM Inference Lab',
    cardDescription:
      'Serve token generation from a single GPU through KV-cache batching, continuous batching with paged attention, tensor-parallel sharding, and prefill/decode disaggregation.',
    pageTitle: 'LLM Inference Serving — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven LLM inference playground with a guided walkthrough: KV cache growth, continuous (in-flight) batching, paged attention, tensor parallelism, and prefill/decode disaggregation.',
  },
  {
    slug: 'rag-system',
    navLabel: 'RAG',
    cardTitle: 'RAG System Lab',
    cardDescription:
      'Replace prompt-stuffing with vector retrieval: chunk and embed documents, ANN top-k search, reranking, hybrid search, caching, and context assembly within the window.',
    pageTitle: 'RAG System — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven retrieval-augmented generation playground with a guided walkthrough: chunking, embeddings, vector-index ANN retrieval, reranking, hybrid search, and context-window assembly.',
  },
  {
    slug: 'rlhf-pipeline',
    navLabel: 'RLHF',
    cardTitle: 'RLHF Pipeline Lab',
    cardDescription:
      'Walk the alignment pipeline from supervised fine-tuning to a reward model and a PPO rollout loop where generation throughput bottlenecks, plus the DPO alternative.',
    pageTitle: 'RLHF / Alignment Pipeline — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven RLHF playground with a guided walkthrough: supervised fine-tuning, reward modelling, the PPO rollout loop with a KL-constrained reference model, and the DPO alternative.',
  },
  {
    slug: 'agent-orchestration',
    navLabel: 'Agents',
    cardTitle: 'Agent Orchestration Lab',
    cardDescription:
      'Build an LLM agent from a single tool call to a reason-act loop with memory and planning, parallel sandboxed tool execution, and multi-agent orchestration with tracing.',
    pageTitle: 'LLM Agent Orchestration — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven LLM agent orchestration playground with a guided walkthrough: the reason-act loop, tool registry and sandboxing, short- and long-term memory, context management, and observability.',
  },
];

export const systemDesignLabPagesBySlug: Record<string, SystemDesignLabPage> =
  Object.fromEntries(systemDesignLabPages.map((page) => [page.slug, page]));

export function getSystemDesignLabPage(slug: string): SystemDesignLabPage {
  const page = systemDesignLabPagesBySlug[slug];
  if (!page) {
    throw new Error(`Unknown system design lab page slug: ${slug}`);
  }
  return page;
}
