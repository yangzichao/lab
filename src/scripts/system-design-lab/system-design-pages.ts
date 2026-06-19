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
    slug: 'rate-limiter',
    navLabel: 'Rate Limiter',
    cardTitle: 'Rate Limiter Lab',
    cardDescription:
      'Move a latency-sensitive rate limiter from a local counter to Redis/Lua, sharding, and a global quota service as correctness demands grow.',
    pageTitle: 'Rate Limiter — System Design Lab | Zichao Yang',
    metaDescription:
      'Constraint-driven rate limiter playground: trace the path from an in-process counter to atomic Redis/Lua state, sharding, and a strict global quota service.',
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
