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
