/**
 * Single source of truth for the standalone System Design Lab pages.
 *
 * Each entry maps a URL slug under `/system-design/<slug>/` to the metadata used
 * by the page itself (`<title>` + meta description), the shared cross-lab nav,
 * and the home index card. Adding a lab here wires it into all three at once.
 */
import {
  defaultSystemDesignLocale,
  normalizeSystemDesignLocale,
  type SystemDesignLocale,
} from './system-design-i18n';
import { systemDesignLabPages as englishSystemDesignLabPages } from '../system-design-lab-en/system-design-pages';

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
      '把一个读多写少的 URL shortener 从单库一路成长到 cache-aside 读取、code generation 策略、sharded KV store，以及多 region 的 edge redirect。',
    pageTitle: 'URL Shortener — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 URL shortener 实验场，带逐步教学：让一个读多写少的 key-value 查询经过 caching、code generation、sharding 和 edge redirect 一路扩容。',
  },
  {
    slug: 'rate-limiter',
    navLabel: 'Rate Limiter',
    cardTitle: 'Rate Limiter Lab',
    cardDescription:
      '随着正确性要求提高，把一个对 latency 敏感的 rate limiter 从本地计数器迁到 Redis/Lua、sharding，再到全局 quota service。',
    pageTitle: 'Rate Limiter — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 rate limiter 实验场：跟着从进程内计数器走到原子化的 Redis/Lua 状态、sharding，再到严格的全局 quota service。',
  },
  {
    slug: 'news-feed',
    navLabel: 'News Feed',
    cardTitle: 'News Feed Lab',
    cardDescription:
      '看一条社交 timeline 在 fan-out-on-write 和 fan-out-on-read 之间来回切换，等某个大 V 的粉丝把 write amplification 炸开后再转向 hybrid。',
    pageTitle: 'News Feed — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 news feed 实验场，带逐步教学：权衡 fan-out-on-write 与 fan-out-on-read，应对 celebrity problem，再加上 ranking 和 sharding。',
  },
  {
    slug: 'chat-messaging',
    navLabel: 'Chat',
    cardTitle: 'Chat / Messaging Lab',
    cardDescription:
      '把实时 chat 从单台 server 扩到 connection-gateway 集群、群组 fan-out、持久化的离线 inbox，以及多 region 路由。',
    pageTitle: 'Chat / Messaging — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 chat 系统实验场，带逐步教学：管理上百万条持久连接、消息 fan-out、presence 和离线 inbox。',
  },
  {
    slug: 'notification-system',
    navLabel: 'Notifications',
    cardTitle: 'Notification System Lab',
    cardDescription:
      '用 queue、dedup、rate limit、retry 和 dead-letter queue，把多渠道 notification pipeline 和慢吞吞的 push/email/SMS provider 解耦。',
    pageTitle: 'Notification System — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 notification 系统实验场，带逐步教学：用 queue、dedup、rate limiting 和 retry，把消息 fan out 到 push、email 和 SMS。',
  },
  {
    slug: 'search-autocomplete',
    navLabel: 'Autocomplete',
    cardTitle: 'Search Autocomplete Lab',
    cardDescription:
      '在紧绷的 latency 预算下，用 trie、热门前缀 caching、prefix sharding 和一条 streaming 日志聚合 pipeline，吐出 top-k 的 typeahead 候选。',
    pageTitle: 'Search Autocomplete — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 search autocomplete 实验场，带逐步教学：预计算的 top-k trie、热门前缀 caching、prefix sharding，以及准实时更新。',
  },
  {
    slug: 'web-crawler',
    navLabel: 'Web Crawler',
    cardTitle: 'Web Crawler Lab',
    cardDescription:
      '把 crawler 从单个循环成长到分布式 frontier，配上 politeness 调度、Bloom filter 去重、DNS caching 和 sharded 内容存储。',
    pageTitle: 'Web Crawler — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 web crawler 实验场，带逐步教学：URL frontier、按域名的 politeness、Bloom filter 去重、DNS caching，以及分布式 fetcher 集群。',
  },
  {
    slug: 'video-streaming',
    navLabel: 'Video Streaming',
    cardTitle: 'Video Streaming Lab',
    cardDescription:
      '随着上传量、观众数和片库规模增长，把视频平台拆成一条异步 transcode pipeline 和一条由 CDN 分发的播放链路。',
    pageTitle: 'Video Streaming — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 video streaming 实验场，带逐步教学：上传与 transcode pipeline、object storage、adaptive bitrate，以及 CDN 分发。',
  },
  {
    slug: 'file-sync',
    navLabel: 'File Sync',
    cardTitle: 'File Sync Lab',
    cardDescription:
      '搭一个 Dropbox 式的 sync 服务，用 content-addressed chunking、dedup、独立的 metadata service、变更通知和冲突处理。',
    pageTitle: 'File Sync — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 file sync 实验场，带逐步教学：chunking 与 dedup、metadata 与 block storage 的分离、变更通知，以及冲突解决。',
  },
  {
    slug: 'ride-sharing',
    navLabel: 'Ride Sharing',
    cardTitle: 'Ride Sharing Lab',
    cardDescription:
      '用内存里的地理空间索引、matching、行程状态和 geo-sharding，扛住司机 GPS 更新的洪流和高速的最近司机查询。',
    pageTitle: 'Ride Sharing — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 ride-sharing 实验场，带逐步教学：高频位置 ingest、geohash/quadtree 索引、matching、行程状态，以及 surge。',
  },
  {
    slug: 'kv-store',
    navLabel: 'KV Store',
    cardTitle: 'Key-Value Store Lab',
    cardDescription:
      '跟着一个 Dynamo 式的 key-value store 从单节点走到 consistent-hash ring，配上 replication、可调的 R/W quorum，以及跨 region 的 anti-entropy。',
    pageTitle: 'Key-Value Store — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的分布式 key-value store 实验场，带逐步教学：consistent hashing、replication factor、quorum 调优，以及 CAP 取舍。',
  },
  {
    slug: 'payment-ledger',
    navLabel: 'Payments',
    cardTitle: 'Payment Ledger Lab',
    cardDescription:
      '正确性优先：在考虑横向扩展之前，先搞定 idempotency key、double-entry 的 append-only ledger、ACID 写入、异步 PSP 集成和对账。',
    pageTitle: 'Payment Ledger — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的支付与 ledger 实验场，带逐步教学：idempotency、double-entry ledger、ACID 事务、异步 PSP capture，以及对账。',
  },
  {
    slug: 'google-docs',
    navLabel: 'Google Docs',
    cardTitle: 'Google Docs Lab',
    cardDescription:
      '看协同文档后端在“并发编辑的排序”而非裸流量成为关键约束时，会变成什么形状。',
    pageTitle: 'Google Docs — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 Google Docs 协同实验场：看着架构在并发编辑者、编辑排序和离线合并约束接管后逐步变形。',
  },
  {
    slug: 'online-judge',
    navLabel: 'Online Judge',
    cardTitle: 'Online Judge Lab',
    cardDescription:
      '扩展一个 LeetCode 式的 online judge，真正的成本在 sandbox worker 的经济账，而不是 API 请求量。',
    pageTitle: 'Online Judge — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 Online Judge 实验场：搞清楚扩展一个跑代码的 judge，主要拼的是 sandbox worker 的经济账和 queue 深度，而非 API 流量。',
  },
  {
    slug: 'ad-tracking',
    navLabel: 'Ad Tracking',
    cardTitle: 'Ad Click Tracking Lab',
    cardDescription:
      '看一条广告 click/impression pipeline 从单个 collector 长成分区 streaming —— 流量峰值、新鲜度和计费级持久性逼着每一步往前走。',
    pageTitle: 'Ad Click Tracking — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的广告 click 与 impression 追踪实验场：在负载的逼迫下，从单个 collector 扩到分区、streaming、计费级的 pipeline。',
  },
  {
    slug: 'recommendation-system',
    navLabel: 'Recommender',
    cardTitle: 'Recommendation System Lab',
    cardDescription:
      '把一个 recommender 从热门榜单成长到 two-tower 的 ANN retrieval、由 feature store 喂数据的 ranking model，以及实时的多阶段漏斗。',
    pageTitle: 'Recommendation System — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 recommendation 系统实验场，带逐步教学：candidate generation、two-tower embedding、ANN（近似最近邻）retrieval、ranking，以及 feature store。',
  },
  {
    slug: 'feature-store',
    navLabel: 'Feature Store',
    cardTitle: 'Feature Store Lab',
    cardDescription:
      '把 feature 拆成 online 和 offline 两套 store，保证 training/serving parity、point-in-time 正确的训练 join，以及大规模下的 streaming 新鲜度。',
    pageTitle: 'Feature Store — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 feature store 实验场，带逐步教学：online/offline parity、低 latency 的 serving 查询、point-in-time 的训练 join，以及 streaming feature。',
  },
  {
    slug: 'model-serving',
    navLabel: 'Model Serving',
    cardTitle: 'Model Serving Lab',
    cardDescription:
      '在 p99 预算下，把一个 model endpoint 从单机带到 dynamic batching、GPU autoscaling、带 canary 发布的版本化 registry，以及多模型打包。',
    pageTitle: 'Model Serving — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 ML model serving 实验场，带逐步教学：请求 batching、GPU 与 CPU 的 autoscaling、model registry 与 canary 部署，以及负载下的 p99 latency。',
  },
  {
    slug: 'fraud-detection',
    navLabel: 'Fraud Detection',
    cardTitle: 'Fraud Detection Lab',
    cardDescription:
      '从静态规则走到实时 streaming feature 和紧绷决策预算内的同步 model scoring，再加上 label 反馈的重训 loop 和 graph feature。',
    pageTitle: 'Real-time Fraud Detection — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的实时 fraud detection 实验场，带逐步教学：streaming feature 聚合、latency 预算内的同步 scoring、feedback loop，以及 graph feature。',
  },
  {
    slug: 'ml-training-pipeline',
    navLabel: 'Training Pipeline',
    cardTitle: 'ML Training Pipeline Lab',
    cardDescription:
      '把 notebook 里的训练变成可复现的 pipeline，配上 data versioning、distributed training、experiment tracking、model registry 和自动重训。',
    pageTitle: 'ML Training Pipeline — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 ML training pipeline 实验场，带逐步教学：编排好的数据与训练阶段、data versioning、distributed training、experiment tracking，以及 model registry。',
  },
  {
    slug: 'llm-training-infra',
    navLabel: 'LLM Training',
    cardTitle: 'LLM Pretraining Infra Lab',
    cardDescription:
      '把 LLM pretraining 从单卡 GPU 扩到 data parallelism，再为放不下单卡的模型上 tensor + pipeline（3D）parallelism，配上 activation checkpointing 和容错 checkpoint。',
    pageTitle: 'LLM Pretraining Infrastructure — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 LLM pretraining 实验场，带逐步教学：data、tensor 和 pipeline parallelism、在高速 interconnect 上做 gradient collective、activation checkpointing，以及容错。',
  },
  {
    slug: 'llm-inference',
    navLabel: 'LLM Inference',
    cardTitle: 'LLM Inference Lab',
    cardDescription:
      '把 token 生成从单卡 GPU 一路做到 KV-cache batching、带 paged attention 的 continuous batching、tensor-parallel sharding，以及 prefill/decode 分离。',
    pageTitle: 'LLM Inference Serving — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 LLM inference 实验场，带逐步教学：KV cache 增长、continuous（in-flight）batching、paged attention、tensor parallelism，以及 prefill/decode 分离。',
  },
  {
    slug: 'rag-system',
    navLabel: 'RAG',
    cardTitle: 'RAG System Lab',
    cardDescription:
      '用 vector retrieval 取代往 prompt 里硬塞：把文档 chunk 并 embed、做 ANN 的 top-k 检索、reranking、hybrid search、caching，以及在 context window 内拼装。',
    pageTitle: 'RAG System — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 retrieval-augmented generation 实验场，带逐步教学：chunking、embedding、vector-index 的 ANN retrieval、reranking、hybrid search，以及 context window 的拼装。',
  },
  {
    slug: 'rlhf-pipeline',
    navLabel: 'RLHF',
    cardTitle: 'RLHF Pipeline Lab',
    cardDescription:
      '走一遍 alignment pipeline：从 supervised fine-tuning 到 reward model，再到生成 throughput 成为瓶颈的 PPO rollout loop，外加 DPO 这条替代路线。',
    pageTitle: 'RLHF / Alignment Pipeline — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 RLHF 实验场，带逐步教学：supervised fine-tuning、reward modeling、带 KL 约束参考模型的 PPO rollout loop，以及 DPO 替代方案。',
  },
  {
    slug: 'agent-orchestration',
    navLabel: 'Agents',
    cardTitle: 'Agent Orchestration Lab',
    cardDescription:
      '把一个 LLM agent 从单次 tool call 搭到带 memory 和 planning 的 reason-act loop、并行的 sandbox 工具执行，以及带 tracing 的多 agent 编排。',
    pageTitle: 'LLM Agent Orchestration — 系统设计 Lab | Zichao Yang',
    metaDescription:
      '约束驱动的 LLM agent 编排实验场，带逐步教学：reason-act loop、tool registry 与 sandboxing、短期和长期 memory、context 管理，以及 observability。',
  },
];

export const systemDesignLabPagesBySlug: Record<string, SystemDesignLabPage> =
  Object.fromEntries(systemDesignLabPages.map((page) => [page.slug, page]));

const englishSystemDesignLabPagesBySlug: Record<string, SystemDesignLabPage> =
  Object.fromEntries(englishSystemDesignLabPages.map((page) => [page.slug, page]));

export const systemDesignLabPagesByLocale: Record<SystemDesignLocale, SystemDesignLabPage[]> = {
  zh: systemDesignLabPages,
  en: englishSystemDesignLabPages,
};

const systemDesignLabPagesBySlugByLocale: Record<
  SystemDesignLocale,
  Record<string, SystemDesignLabPage>
> = {
  zh: systemDesignLabPagesBySlug,
  en: englishSystemDesignLabPagesBySlug,
};

export function getSystemDesignLabPages(
  locale: SystemDesignLocale | string | undefined = defaultSystemDesignLocale,
): SystemDesignLabPage[] {
  return systemDesignLabPagesByLocale[normalizeSystemDesignLocale(locale)];
}

export function getSystemDesignLabPage(
  slug: string,
  locale: SystemDesignLocale | string | undefined = defaultSystemDesignLocale,
): SystemDesignLabPage {
  const page = systemDesignLabPagesBySlugByLocale[normalizeSystemDesignLocale(locale)][slug];
  if (!page) {
    throw new Error(`Unknown system design lab page slug: ${slug}`);
  }
  return page;
}
