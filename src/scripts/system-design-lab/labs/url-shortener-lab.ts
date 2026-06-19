import { buildColumnDiagram } from '../diagram-layout';
import {
  formatCount,
  formatRate,
  formatRatio,
  formatStorageGigabytes,
} from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

const bytesPerMapping = 500;
const comfortableDbReadsPerSecond = 12_000;
const comfortableDbWritesPerSecond = 4_000;
const comfortableStorageGigabytes = 500;
const singleCounterCreateBudget = 2_000;

export const urlShortenerLabDefinition: SystemDesignLabDefinition = {
  id: 'url-shortener',
  eyebrow: 'System Design Lab',
  title: 'A URL shortener is a read-heavy key-value lookup that outgrows one box from the read side first.',
  summary:
    'Change redirect and create rates, how many links are stored, hot-link skew, the short-code length, latency target, and regions. The design moves from a single database to cache-aside reads, a dedicated key-generation strategy, a sharded KV store, and multi-region edge redirects.',
  controls: [
    {
      id: 'redirectQps',
      label: 'Redirect rate',
      help: 'Reads: short code looked up and 301/302 returned. This is the dominant traffic.',
      min: 10,
      max: 5_000_000,
      defaultValue: 2_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'createQps',
      label: 'Create rate',
      help: 'Writes: new long URLs submitted to be shortened.',
      min: 1,
      max: 200_000,
      defaultValue: 20,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'totalUrls',
      label: 'Stored links',
      help: 'Total short-code to long-URL mappings kept in the system.',
      min: 10_000,
      max: 100_000_000_000,
      defaultValue: 10_000_000,
      scale: 'log',
      unit: 'links',
      format: 'count',
    },
    {
      id: 'hotLinkShare',
      label: 'Hot-link share',
      help: 'Share of redirects that target the small set of currently popular links.',
      min: 1,
      max: 99,
      defaultValue: 60,
      scale: 'linear',
      format: 'percentage',
    },
    {
      id: 'codeLength',
      label: 'Short-code length',
      help: 'Characters in the base62 code. Keyspace is 62^length.',
      min: 4,
      max: 12,
      defaultValue: 7,
      scale: 'linear',
      unit: 'chars',
      format: 'count',
    },
    {
      id: 'redirectLatencyMs',
      label: 'Redirect latency target',
      help: 'Budget for resolving a short code before the redirect is sent.',
      min: 1,
      max: 200,
      defaultValue: 50,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'globalRegions',
      label: 'Regions',
      help: 'Regions that should serve redirects close to the user.',
      min: 1,
      max: 20,
      defaultValue: 1,
      scale: 'linear',
      unit: 'regions',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'trackAnalytics',
      label: 'Track click analytics',
      help: 'Record each redirect for dashboards; should not slow the redirect itself.',
      defaultValue: false,
    },
    {
      id: 'customAliases',
      label: 'Allow custom aliases',
      help: 'Let users pick their own code; rules out a pure auto-increment counter.',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'personal',
      step: '01',
      title: 'Personal tool',
      summary: 'A few redirects per second over a small table.',
      values: {
        redirectQps: 50,
        createQps: 2,
        totalUrls: 50_000,
        hotLinkShare: 30,
        codeLength: 7,
        redirectLatencyMs: 100,
        globalRegions: 1,
        trackAnalytics: false,
        customAliases: true,
      },
    },
    {
      id: 'going-viral',
      step: '02',
      title: 'A link goes viral',
      summary: 'One link owns most of a heavy read spike.',
      values: {
        redirectQps: 120_000,
        createQps: 30,
        totalUrls: 2_000_000,
        hotLinkShare: 85,
        codeLength: 7,
        redirectLatencyMs: 40,
        globalRegions: 1,
        trackAnalytics: true,
        customAliases: true,
      },
    },
    {
      id: 'public-api',
      step: '03',
      title: 'Public shortener API',
      summary: 'Many writers create links concurrently.',
      values: {
        redirectQps: 200_000,
        createQps: 20_000,
        totalUrls: 200_000_000,
        hotLinkShare: 50,
        codeLength: 7,
        redirectLatencyMs: 30,
        globalRegions: 2,
        trackAnalytics: true,
        customAliases: false,
      },
    },
    {
      id: 'billions-stored',
      step: '04',
      title: 'Billions of links',
      summary: 'Storage and writes outgrow one database.',
      values: {
        redirectQps: 800_000,
        createQps: 50_000,
        totalUrls: 20_000_000_000,
        hotLinkShare: 60,
        codeLength: 8,
        redirectLatencyMs: 25,
        globalRegions: 3,
        trackAnalytics: true,
        customAliases: false,
      },
    },
    {
      id: 'global-fast',
      step: '05',
      title: 'Global, single-digit ms',
      summary: 'Redirects must resolve near the user worldwide.',
      values: {
        redirectQps: 3_000_000,
        createQps: 30_000,
        totalUrls: 50_000_000_000,
        hotLinkShare: 70,
        codeLength: 9,
        redirectLatencyMs: 8,
        globalRegions: 8,
        trackAnalytics: true,
        customAliases: false,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'URL shortener architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a URL shortener: clients, edge CDN and application servers, a key-generation service and read cache, a primary mapping store with shards, and an async click-analytics stream.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'redirect + create',
            summary: 'follows short links and submits new long URLs to shorten',
          },
        ],
      },
      {
        id: 'edge',
        label: 'Edge / API',
        variant: 'edge',
        nodes: [
          {
            id: 'cdn',
            title: 'Edge / CDN',
            subtitle: 'caches redirects',
            summary: 'resolves hot redirects close to the user without hitting the origin',
          },
          {
            id: 'appServer',
            title: 'App server',
            subtitle: 'redirect + shorten',
            summary: 'looks up codes for redirects and handles create requests',
          },
        ],
      },
      {
        id: 'keys',
        label: 'Keys + cache',
        variant: 'backbone',
        nodes: [
          {
            id: 'idService',
            title: 'Key service',
            subtitle: 'unique codes',
            summary: 'hands out collision-free short codes (ranges, Snowflake, or pre-generated keys)',
          },
          {
            id: 'cache',
            title: 'Read cache',
            subtitle: 'hot mappings',
            summary: 'serves code to URL lookups for popular links so the store is spared',
          },
        ],
      },
      {
        id: 'store',
        label: 'Mapping store',
        variant: 'storage',
        nodes: [
          {
            id: 'db',
            title: 'Mapping DB',
            subtitle: 'code to URL',
            summary: 'durable store of every short code and its long URL',
          },
          {
            id: 'shards',
            title: 'KV shards',
            subtitle: 'partition by code',
            summary: 'spreads mappings across nodes for storage and write throughput',
          },
        ],
      },
      {
        id: 'analytics',
        label: 'Analytics',
        variant: 'processing',
        nodes: [
          {
            id: 'events',
            title: 'Click stream',
            subtitle: 'async events',
            summary: 'collects redirect events for dashboards off the hot path',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'cdn', variant: 'primary' },
      { from: 'cdn', to: 'appServer', variant: 'primary' },
      { from: 'appServer', to: 'cache', variant: 'primary' },
      { from: 'appServer', to: 'idService', variant: 'secondary' },
      { from: 'appServer', to: 'db', variant: 'direct' },
      { from: 'cache', to: 'db', variant: 'secondary' },
      { from: 'idService', to: 'db', variant: 'secondary' },
      { from: 'db', to: 'shards', variant: 'secondary' },
      { from: 'appServer', to: 'events', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'readPath', label: 'Read path load' },
    { id: 'writePath', label: 'Write path load' },
    { id: 'storage', label: 'Mapping storage' },
    { id: 'keyspace', label: 'Code keyspace fill' },
    { id: 'geoLatency', label: 'Global redirect latency' },
  ],
  decisions: [
    { id: 'cache', title: 'Read cache' },
    { id: 'idStrategy', title: 'Code generation' },
    { id: 'store', title: 'Mapping store' },
    { id: 'sharding', title: 'Storage sharding' },
    { id: 'edge', title: 'Edge redirects' },
    { id: 'analytics', title: 'Click analytics' },
  ],
  sourceBackedRules: [
    {
      title: 'A URL shortener is dominated by reads (redirects), not writes',
      source: 'System Design Primer',
      url: 'https://github.com/donnemartin/system-design-primer',
      summary:
        'The canonical write-up treats redirect lookups as the high-volume path and link creation as comparatively rare, which is why read scaling comes first.',
    },
    {
      title: 'Cache-aside keeps hot reads off the database',
      source: 'Azure Architecture',
      url: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside',
      summary:
        'The cache-aside pattern loads items into a cache on demand; for skewed redirect traffic a small cache absorbs most lookups.',
    },
    {
      title: 'Redis is a common in-memory store for hot key-value lookups',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/develop/',
      summary:
        'In-memory point lookups serve popular short codes at sub-millisecond latency, far below a disk-backed store.',
    },
    {
      title: 'A CDN serves cacheable responses from locations near the user',
      source: 'AWS CloudFront',
      url: 'https://aws.amazon.com/cloudfront/',
      summary:
        'Redirects for popular links are cacheable at the edge, cutting cross-region round trips for a global audience.',
    },
  ],
  teachingAssumptions: [
    'Redirects are modeled as cacheable point lookups; cache hit rate is approximated from the hot-link share.',
    'Single-node read, write, and storage budgets are conservative teaching numbers, not vendor limits.',
    'Code keyspace fill uses base62^length; real systems also reserve key ranges per ID server to avoid collisions.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-box',
      step: '01',
      focus: 'One user, one box',
      scenarioId: 'personal',
      question:
        'A personal shortener does ~50 redirects/s over 50k links. Do you need anything beyond one app server and one database?',
      reveal:
        'No. A redirect is a primary-key point lookup, and 50 reads/s is trivial for an indexed table. A cache, a key service, and sharding would all be premature — they add moving parts with no load to justify them.',
      takeaway: 'Start with the simplest correct design: one indexed table behind one app server.',
    },
    {
      id: 'viral',
      step: '02',
      focus: 'A link goes viral',
      scenarioId: 'going-viral',
      question:
        'One link suddenly takes 85% of 120k redirects/s. What saturates first, and what is the cheapest fix?',
      reveal:
        'The database read path saturates. But the traffic is extremely skewed, so a cache-aside layer (or the CDN edge) absorbs the hot links at a very high hit rate — the store only sees the long tail of misses.',
      takeaway: 'Redirects are cacheable; skew lets a small cache soak up most of the read traffic.',
    },
    {
      id: 'writers',
      step: '03',
      focus: 'Public API, many writers',
      scenarioId: 'public-api',
      question:
        'Now 20k new links/s arrive from many servers. Why not let each server INSERT a random code and retry on conflict?',
      reveal:
        'Random-plus-collision-check wastes round trips and races as the table fills. High create rates want a dedicated strategy: counter ranges handed to each server, Snowflake-style IDs, or a key-generation service that pre-mints codes. Custom aliases must still be checked separately.',
      takeaway: 'At high create rates, generating unique codes becomes its own coordination problem.',
    },
    {
      id: 'billions',
      step: '04',
      focus: 'Billions of links',
      scenarioId: 'billions-stored',
      question:
        '20 billion mappings at ~500 bytes each is ~10 TB, with 50k writes/s. Can one database hold and serve that?',
      reveal:
        'No — storage and write throughput exceed a single node, so you shard by code or move to a horizontally scalable KV store; the pure point-lookup access pattern fits KV perfectly. A 7-char base62 code is also filling up at this scale, so the code lengthens to keep collisions rare.',
      takeaway: 'When storage and writes outgrow one node, shard by key into a KV store built for point lookups.',
    },
    {
      id: 'global',
      step: '05',
      focus: 'Global, single-digit ms',
      scenarioId: 'global-fast',
      question:
        'Users worldwide expect sub-10 ms redirects. Is a sharded KV store in one region enough?',
      reveal:
        'No — cross-region network latency alone blows the budget. Replicate the mapping to edge/CDN caches and multiple regions so redirects resolve near the user. Creates can stay centralized because they are rare and tolerate higher latency.',
      takeaway: 'For global low-latency reads, push the mapping to the edge; keep the rare writes where consistency is easy.',
    },
  ],
  analyze: analyzeUrlShortenerWorkload,
};

function analyzeUrlShortenerWorkload(workload: WorkloadValues): LabAnalysis {
  const redirectQps = numericValue(workload, 'redirectQps');
  const createQps = numericValue(workload, 'createQps');
  const totalUrls = numericValue(workload, 'totalUrls');
  const hotLinkShare = numericValue(workload, 'hotLinkShare');
  const codeLength = numericValue(workload, 'codeLength');
  const redirectLatencyMs = numericValue(workload, 'redirectLatencyMs');
  const globalRegions = numericValue(workload, 'globalRegions');
  const trackAnalytics = Boolean(workload.trackAnalytics);
  const customAliases = Boolean(workload.customAliases);

  const needsCache = redirectQps > 3_000 || hotLinkShare >= 45;
  const needsCdn = globalRegions > 1 || redirectLatencyMs <= 20 || redirectQps > 150_000;
  const needsIdService = createQps > singleCounterCreateBudget;
  const keyspace = Math.pow(62, codeLength);
  const keyspaceFill = totalUrls / keyspace;
  const needsLongerCode = keyspaceFill > 0.25;
  const storageGigabytes = (totalUrls * bytesPerMapping) / 1_000_000_000;
  const needsSharding =
    storageGigabytes > comfortableStorageGigabytes ||
    createQps > comfortableDbWritesPerSecond ||
    totalUrls > 1_000_000_000;
  const needsEvents = trackAnalytics;

  const cacheServedShare = needsCache ? Math.min(hotLinkShare / 100, 0.985) : 0;
  const dbRedirectReads = redirectQps * (1 - cacheServedShare);
  const geoPressure = Math.max(
    (globalRegions - 1) / 3,
    redirectLatencyMs <= 30 ? 30 / redirectLatencyMs / 3 : 0,
  );

  const flags = {
    needsCache,
    needsCdn,
    needsIdService,
    needsSharding,
    needsLongerCode,
    needsEvents,
    customAliases,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      cdn: needsCdn ? 'needed' : 'inactive',
      appServer: 'ok',
      idService: needsIdService ? 'needed' : 'inactive',
      cache: needsCache ? 'needed' : 'inactive',
      db: needsSharding ? 'warning' : 'ok',
      shards: needsSharding ? 'needed' : 'inactive',
      events: needsEvents ? 'needed' : 'inactive',
    },
    flowStates: {
      clientToCdn: 'active',
      cdnToAppServer: 'active',
      appServerToCache: needsCache ? 'active' : 'inactive',
      appServerToIdService: needsIdService ? 'active' : 'inactive',
      appServerToDb: needsCache ? 'inactive' : 'active',
      cacheToDb: needsCache ? 'active' : 'inactive',
      idServiceToDb: needsIdService ? 'active' : 'inactive',
      dbToShards: needsSharding ? 'active' : 'inactive',
      appServerToEvents: needsEvents ? 'active' : 'inactive',
    },
    meters: {
      readPath: {
        ratio: dbRedirectReads / comfortableDbReadsPerSecond,
        valueText: `${formatRate(dbRedirectReads)}/s`,
        copy: needsCache
          ? `Cache absorbs the hot share; the store still sees about ${formatRate(dbRedirectReads)}/s of misses.`
          : 'Every redirect hits the database directly while there is no cache layer.',
      },
      writePath: {
        ratio: createQps / comfortableDbWritesPerSecond,
        valueText: `${formatRate(createQps)}/s`,
        copy: 'New links are durable writes plus a unique-code allocation.',
      },
      storage: {
        ratio: storageGigabytes / comfortableStorageGigabytes,
        valueText: formatStorageGigabytes(storageGigabytes),
        copy: `${formatCount(totalUrls)} mappings at roughly ${bytesPerMapping} bytes each.`,
      },
      keyspace: {
        ratio: keyspaceFill / 0.5,
        valueText: formatRatio(keyspaceFill),
        copy: `${formatCount(totalUrls)} links against a 62^${Math.round(codeLength)} keyspace; collisions rise as it fills.`,
      },
      geoLatency: {
        ratio: geoPressure,
        valueText: `${formatCount(globalRegions)} ${pluralize('region', globalRegions)}`,
        copy:
          redirectLatencyMs <= 30 || globalRegions > 1
            ? 'A tight latency target across regions pushes redirects toward edge and replicated reads.'
            : 'A single region with a relaxed latency target needs no edge replication yet.',
      },
    },
    decisions: buildDecisions({
      ...flags,
      redirectQps,
      hotLinkShare,
      createQps,
      codeLength,
    }),
    reasons: buildReasons({
      ...flags,
      redirectQps,
      hotLinkShare,
      createQps,
      dbRedirectReads,
      storageGigabytes,
      totalUrls,
      codeLength,
      keyspaceFill,
      globalRegions,
      redirectLatencyMs,
    }),
  };
}

type ArchitectureFlags = {
  needsCache: boolean;
  needsCdn: boolean;
  needsIdService: boolean;
  needsSharding: boolean;
  needsLongerCode: boolean;
  needsEvents: boolean;
  customAliases: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    redirectQps: number;
    hotLinkShare: number;
    createQps: number;
    dbRedirectReads: number;
    storageGigabytes: number;
    totalUrls: number;
    codeLength: number;
    keyspaceFill: number;
    globalRegions: number;
    redirectLatencyMs: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsCache) {
    reasons.push({
      severity: analysis.dbRedirectReads > comfortableDbReadsPerSecond ? 'danger' : 'warning',
      text: `${formatRate(analysis.redirectQps)}/s of redirects with ${Math.round(
        analysis.hotLinkShare,
      )}% hot-link skew should be served from a cache; only misses reach the store.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Read volume is low enough that the database can serve redirects directly without a cache.',
    });
  }

  if (analysis.needsIdService) {
    reasons.push({
      severity: 'warning',
      text: `${formatRate(
        analysis.createQps,
      )}/s of creates need a real code-generation strategy (counter ranges, Snowflake, or a key service), not random-and-retry.`,
    });
  }

  if (analysis.customAliases) {
    reasons.push({
      severity: 'ok',
      text: 'Custom aliases rule out a pure auto-increment counter, so the code space and a uniqueness check must coexist.',
    });
  }

  if (analysis.needsSharding) {
    reasons.push({
      severity: analysis.storageGigabytes > comfortableStorageGigabytes * 2 ? 'danger' : 'warning',
      text: `${formatCount(analysis.totalUrls)} mappings (~${formatStorageGigabytes(
        analysis.storageGigabytes,
      )}) and the write rate exceed one node; shard by code into a KV store.`,
    });
  }

  if (analysis.needsLongerCode) {
    reasons.push({
      severity: 'warning',
      text: `A ${Math.round(analysis.codeLength)}-char code is ${formatRatio(
        analysis.keyspaceFill,
      )} full; lengthen the code to keep generation collision-free.`,
    });
  }

  if (analysis.needsCdn) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.globalRegions)} ${pluralize(
        'region',
        analysis.globalRegions,
      )} with a ${Math.round(
        analysis.redirectLatencyMs,
      )} ms target push redirects to the edge and replicated reads.`,
    });
  }

  if (analysis.needsEvents) {
    reasons.push({
      severity: 'ok',
      text: 'Click analytics is written asynchronously through an event stream so it never slows the redirect.',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    redirectQps: number;
    hotLinkShare: number;
    createQps: number;
    codeLength: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  const idStrategyCopy = flags.customAliases
    ? 'Allow custom aliases plus generated codes; both need a uniqueness check, so a counter alone will not do.'
    : flags.needsIdService
      ? `Generate codes with counter ranges, Snowflake-style IDs, or a key service to absorb ${formatRate(
          flags.createQps,
        )}/s of creates without contention.`
      : 'A simple counter or random base62 code is fine while create volume is low.';

  return {
    cache: {
      state: flags.needsCache ? 'needed' : 'not-yet',
      copy: flags.needsCache
        ? 'Cache-aside the hot mappings (Redis); only misses fall through to the store.'
        : 'No cache yet — the database serves the modest read volume directly.',
    },
    idStrategy: {
      state: flags.customAliases ? 'tradeoff' : flags.needsIdService ? 'needed' : 'useful',
      copy: idStrategyCopy,
    },
    store: {
      state: flags.needsSharding ? 'needed' : 'useful',
      copy: flags.needsSharding
        ? 'Use a horizontally scalable KV store; the access pattern is pure point lookups by code.'
        : 'A single relational or KV store holds every mapping while it fits on one node.',
    },
    sharding: {
      state: flags.needsSharding ? 'needed' : 'not-yet',
      copy: flags.needsSharding
        ? 'Shard by short code so storage and write throughput scale horizontally.'
        : 'One node is enough until storage or write rate proves otherwise.',
    },
    edge: {
      state: flags.needsCdn ? 'needed' : 'not-yet',
      copy: flags.needsCdn
        ? 'Serve redirects from CDN/edge caches and replicate mappings near users.'
        : 'A single region is fine while latency targets are relaxed and traffic is local.',
    },
    analytics: {
      state: flags.needsEvents ? 'useful' : 'not-yet',
      copy: flags.needsEvents
        ? 'Emit redirect events to a stream and aggregate offline; keep the hot path synchronous-free.'
        : 'Click analytics is off, so the redirect path stays a single lookup.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsCdn && !flags.needsIdService) {
    return 'Single app + database';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsCache)) {
    return 'Multi-region edge + sharded KV store';
  }
  if (flags.needsSharding) {
    return 'Cache-aside reads + sharded KV store';
  }
  if (flags.needsCache) {
    return 'Cache-aside reads + single database';
  }
  return 'Single app + database';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsCdn && !flags.needsIdService) {
    return 'One app server and one indexed table resolve every redirect and store every new link. Nothing else is justified yet.';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsCache)) {
    return 'Hot redirects resolve at the edge near each user, while a sharded KV store and a code-generation strategy handle scale and durable writes centrally.';
  }
  if (flags.needsSharding) {
    return 'A cache absorbs the skewed read traffic and the mapping store is sharded by code so storage and writes scale horizontally.';
  }
  if (flags.needsCache) {
    return 'A cache-aside layer serves the popular links so a single database only handles misses and the modest write volume.';
  }
  return 'One app server and one database still cover the workload.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsCache && !flags.needsSharding && !flags.needsCdn && !flags.needsIdService) {
    return 'Redirect -> app server -> database';
  }
  if (flags.needsCdn && (flags.needsSharding || flags.needsCache)) {
    return 'Redirect -> edge cache -> app server -> cache -> sharded KV';
  }
  if (flags.needsSharding) {
    return 'Redirect -> app server -> cache -> sharded KV (miss)';
  }
  if (flags.needsCache) {
    return 'Redirect -> app server -> cache -> database (miss)';
  }
  return 'Redirect -> app server -> database';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function pluralize(unit: string, value: number): string {
  return Math.round(value) === 1 ? unit : `${unit}s`;
}
