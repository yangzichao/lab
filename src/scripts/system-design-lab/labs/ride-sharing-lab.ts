import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatRate, formatStorageGigabytes } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

const bytesPerDriverCell = 200;
const comfortableIngestWritesPerSecond = 50_000;
const comfortableGeoQueriesPerSecond = 20_000;
const comfortableMatchingQpsPerNode = 8_000;
const comfortableTripStateWritesPerSecond = 12_000;
const comfortableGeoIndexGigabytes = 64;
const comfortableDriversPerCity = 50_000;

export const rideSharingLabDefinition: SystemDesignLabDefinition = {
  id: 'ride-sharing',
  eyebrow: 'System Design Lab',
  title: 'Ride matching is bound by ingesting high-frequency driver GPS and answering nearest-driver queries fast, not by request volume.',
  summary:
    'Tune how many drivers are online, how often each one reports GPS, the ride-request rate, the search radius, and how many cities you serve. The design moves from one service to a dedicated location-ingest path, an in-memory geospatial index for nearest-driver queries, a durable trip-state store, and per-geo sharding with surge pricing.',
  controls: [
    {
      id: 'activeDrivers',
      label: 'Active drivers',
      help: 'Drivers currently online and reporting GPS. Each one is a continuous write stream.',
      min: 100,
      max: 5_000_000,
      defaultValue: 20_000,
      scale: 'log',
      unit: 'drivers',
      format: 'count',
    },
    {
      id: 'locationUpdateHz',
      label: 'GPS update frequency',
      help: 'How often each driver reports a new location. This sets the ingest write rate.',
      min: 0.1,
      max: 4,
      defaultValue: 0.25,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'rideRequestsPerSecond',
      label: 'Ride requests',
      help: 'Riders asking to be matched. Each one triggers a nearest-driver geo query.',
      min: 1,
      max: 500_000,
      defaultValue: 200,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'searchRadiusMeters',
      label: 'Search radius',
      help: 'How far to look for available drivers. Wider radius scans more index cells per query.',
      min: 200,
      max: 10_000,
      defaultValue: 1_500,
      scale: 'log',
      unit: 'meters',
      format: 'count',
    },
    {
      id: 'driversPerCell',
      label: 'Drivers per cell',
      help: 'Density of drivers in a geohash/S2 cell. Hot dense cells cost more per query.',
      min: 5,
      max: 5_000,
      defaultValue: 60,
      scale: 'log',
      unit: 'drivers',
      format: 'count',
    },
    {
      id: 'cities',
      label: 'Cities / regions',
      help: 'Independent geographies served. Each can be a natural shard boundary.',
      min: 1,
      max: 600,
      defaultValue: 1,
      scale: 'log',
      unit: 'cities',
      format: 'count',
    },
    {
      id: 'matchLatencyMs',
      label: 'Match latency target',
      help: 'Budget to find candidate drivers and return a match to the rider.',
      min: 50,
      max: 5_000,
      defaultValue: 1_500,
      scale: 'log',
      format: 'milliseconds',
    },
  ],
  toggles: [
    {
      id: 'surgePricing',
      label: 'Surge pricing',
      help: 'Compute demand/supply ratio per area to raise prices; runs as its own engine.',
      defaultValue: false,
    },
    {
      id: 'etaPrediction',
      label: 'ETA / route prediction',
      help: 'Predict arrival and route per candidate; adds compute to every match.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'one-city',
      step: '01',
      title: 'One small city',
      summary: 'A few thousand drivers, a handful of requests per second.',
      values: {
        activeDrivers: 2_000,
        locationUpdateHz: 0.2,
        rideRequestsPerSecond: 20,
        searchRadiusMeters: 1_500,
        driversPerCell: 40,
        cities: 1,
        matchLatencyMs: 3_000,
        surgePricing: false,
        etaPrediction: false,
      },
    },
    {
      id: 'ingest-spike',
      step: '02',
      title: 'GPS firehose',
      summary: 'More drivers reporting faster floods the ingest write path.',
      values: {
        activeDrivers: 80_000,
        locationUpdateHz: 1,
        rideRequestsPerSecond: 600,
        searchRadiusMeters: 1_500,
        driversPerCell: 80,
        cities: 1,
        matchLatencyMs: 2_000,
        surgePricing: false,
        etaPrediction: false,
      },
    },
    {
      id: 'fast-nearest',
      step: '03',
      title: 'Fast nearest-driver',
      summary: 'A wide radius over dense cells makes geo queries the bottleneck.',
      values: {
        activeDrivers: 200_000,
        locationUpdateHz: 1,
        rideRequestsPerSecond: 6_000,
        searchRadiusMeters: 4_000,
        driversPerCell: 400,
        cities: 1,
        matchLatencyMs: 800,
        surgePricing: false,
        etaPrediction: true,
      },
    },
    {
      id: 'durable-trips',
      step: '04',
      title: 'Durable trip state',
      summary: 'Matching and the trip-state machine run at high, sustained QPS.',
      values: {
        activeDrivers: 600_000,
        locationUpdateHz: 2,
        rideRequestsPerSecond: 40_000,
        searchRadiusMeters: 3_000,
        driversPerCell: 500,
        cities: 8,
        matchLatencyMs: 500,
        surgePricing: true,
        etaPrediction: true,
      },
    },
    {
      id: 'global-surge',
      step: '05',
      title: 'Many cities + surge',
      summary: 'Hundreds of cities worldwide, sharded by geo, with live surge.',
      values: {
        activeDrivers: 3_000_000,
        locationUpdateHz: 2,
        rideRequestsPerSecond: 200_000,
        searchRadiusMeters: 3_000,
        driversPerCell: 800,
        cities: 400,
        matchLatencyMs: 300,
        surgePricing: true,
        etaPrediction: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'Ride-sharing matching architecture diagram',
    description:
      'Whiteboard-style architecture diagram for ride matching: drivers and riders, a location-ingest path and API gateway, an in-memory geospatial index with a matching service, a durable trip-state store, and an async pricing and analytics pipeline.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'driverApp',
            title: 'Driver app',
            subtitle: 'GPS stream',
            summary: 'reports its location every few seconds while online',
            kind: 'client',
          },
          {
            id: 'riderApp',
            title: 'Rider app',
            subtitle: 'requests rides',
            summary: 'asks to be matched with the nearest available driver',
            kind: 'client',
          },
        ],
      },
      {
        id: 'ingest',
        label: 'Ingest / gateway',
        variant: 'edge',
        nodes: [
          {
            id: 'gateway',
            title: 'API gateway',
            subtitle: 'rider requests',
            summary: 'authenticates riders and routes match requests to the matching service',
            kind: 'lb',
          },
          {
            id: 'locationIngest',
            title: 'Location ingest',
            subtitle: 'high write rate',
            summary: 'absorbs the firehose of driver GPS updates and feeds the geo index',
            kind: 'compute',
          },
        ],
      },
      {
        id: 'geo',
        label: 'Geo + matching',
        variant: 'backbone',
        nodes: [
          {
            id: 'geoIndex',
            title: 'Geo index',
            subtitle: 'in-memory cells',
            summary: 'keeps live driver positions in geohash/quadtree/S2 cells for nearest queries',
            kind: 'search',
          },
          {
            id: 'matcher',
            title: 'Matching service',
            subtitle: 'pairs + state',
            summary: 'queries the index for candidates and pairs a rider to a driver',
            kind: 'compute',
          },
        ],
      },
      {
        id: 'state',
        label: 'Trip state',
        variant: 'storage',
        nodes: [
          {
            id: 'tripStore',
            title: 'Trip-state store',
            subtitle: 'state machine',
            summary: 'durably tracks each trip from requested to matched to en route to complete',
            kind: 'db',
          },
          {
            id: 'geoShards',
            title: 'Geo shards',
            subtitle: 'by city / cell',
            summary: 'partitions drivers and trips by geography so each region scales independently',
            kind: 'nosql',
          },
        ],
      },
      {
        id: 'async',
        label: 'Pricing / analytics',
        variant: 'processing',
        nodes: [
          {
            id: 'pricing',
            title: 'Surge engine',
            subtitle: 'demand / supply',
            summary: 'computes per-area surge multipliers off the hot matching path',
            kind: 'compute',
          },
          {
            id: 'analytics',
            title: 'Event stream',
            subtitle: 'async events',
            summary: 'collects trip and location events for analytics and ML offline',
            kind: 'stream',
          },
        ],
      },
    ],
    flows: [
      { from: 'driverApp', to: 'locationIngest', variant: 'primary' },
      { from: 'riderApp', to: 'gateway', variant: 'primary' },
      { from: 'locationIngest', to: 'geoIndex', variant: 'primary' },
      { from: 'gateway', to: 'matcher', variant: 'primary' },
      { from: 'matcher', to: 'geoIndex', variant: 'secondary' },
      { from: 'matcher', to: 'tripStore', variant: 'primary' },
      { from: 'geoIndex', to: 'geoShards', variant: 'secondary' },
      { from: 'tripStore', to: 'geoShards', variant: 'secondary' },
      { from: 'matcher', to: 'pricing', variant: 'secondary' },
      { from: 'locationIngest', to: 'analytics', variant: 'direct' },
    ],
  }),
  meters: [
    { id: 'ingestThroughput', label: 'Location write throughput' },
    { id: 'geoQueryLoad', label: 'Geo-query load' },
    { id: 'geoIndexMemory', label: 'Geo-index memory' },
    { id: 'matchingQps', label: 'Matching + trip-state QPS' },
    { id: 'shardPressure', label: 'Cross-city / shard pressure' },
  ],
  decisions: [
    { id: 'ingestPath', title: 'Location ingest path' },
    { id: 'geoIndexChoice', title: 'Geospatial index' },
    { id: 'matching', title: 'Matching service' },
    { id: 'tripState', title: 'Trip-state store' },
    { id: 'pricingEngine', title: 'Surge pricing engine' },
    { id: 'sharding', title: 'Shard by city / geo' },
  ],
  sourceBackedRules: [
    {
      title: 'Uber matches riders to drivers using S2 geospatial cells',
      source: 'Uber Engineering',
      url: 'https://www.uber.com/en-US/blog/h3/',
      summary:
        'Uber indexes the world with hierarchical cells (H3, building on Google S2) so nearest-driver lookups become bounded scans over a small set of cells.',
    },
    {
      title: 'Geohashing turns proximity search into prefix range scans',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/develop/data-types/geospatial/',
      summary:
        'Encoding lat/long as a geohash lets nearby points share a prefix, so a radius query becomes a small set of in-memory sorted-set range reads.',
    },
    {
      title: 'High-frequency location ingest is a write-heavy streaming problem',
      source: 'Apache Kafka',
      url: 'https://kafka.apache.org/documentation/',
      summary:
        'A continuous flood of per-driver GPS events is best absorbed by a partitioned log that decouples ingest from the index and downstream consumers.',
    },
    {
      title: 'Quadtrees answer 2D nearest-neighbour queries efficiently',
      source: 'Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Quadtree',
      summary:
        'A quadtree recursively subdivides space so a region query only visits the cells that overlap the search area instead of every point.',
    },
  ],
  teachingAssumptions: [
    'Location ingest write rate is modeled as active drivers times GPS update frequency; real systems batch and dedup updates.',
    'Single-node ingest, geo-query, and trip-state budgets are conservative teaching numbers, not vendor limits.',
    'Geo-query cost grows with search radius and cell density; the in-memory index memory scales with active drivers.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-service',
      step: '01',
      focus: 'One city, one service',
      scenarioId: 'one-city',
      question:
        'A small city has ~2k drivers and ~20 ride requests/s. Do you need a dedicated geo index, ingest path, or sharding yet?',
      reveal:
        'No. At a few hundred GPS writes/s and 20 queries/s, one service can keep driver positions in memory and scan them on each request. A separate ingest tier, a partitioned index, and per-city shards would all be premature.',
      takeaway: 'Start with one service holding driver positions in memory; the binding constraint has not appeared yet.',
    },
    {
      id: 'firehose',
      step: '02',
      focus: 'GPS firehose',
      scenarioId: 'ingest-spike',
      question:
        '80k drivers each reporting once a second is ~80k location writes/s. What saturates first — request handling or location ingest?',
      reveal:
        'Location ingest. Ride requests are still modest, but the continuous GPS stream dominates: it is the binding constraint. Split ingest onto its own path (a partitioned log/stream) so it never blocks matching, and write positions into the index asynchronously.',
      takeaway: 'The bottleneck is ingesting GPS, not handling requests; give ingest its own write-optimized path.',
    },
    {
      id: 'nearest',
      step: '03',
      focus: 'Fast nearest-driver',
      scenarioId: 'fast-nearest',
      question:
        '6k requests/s each scan a 4 km radius over cells holding 400 drivers. Why not just filter the full driver table per request?',
      reveal:
        'A full scan is O(drivers) per query and blows the latency budget. A geospatial index (geohash, quadtree, or S2 cells) kept hot in memory turns each query into a bounded scan of a few nearby cells, so cost depends on radius and density, not total fleet size.',
      takeaway: 'A hot in-memory geo index makes nearest-driver cost depend on radius and density, not fleet size.',
    },
    {
      id: 'trips',
      step: '04',
      focus: 'Durable trip state',
      scenarioId: 'durable-trips',
      question:
        'At 40k requests/s with live trips, where does trip status (requested -> matched -> en route -> complete) live so a crash never loses a ride?',
      reveal:
        'Matching alone is stateless and scales out, but the trip is a state machine that must survive failures. Persist it in a durable, low-latency store keyed by trip/region, and run matching as horizontally scaled workers in front of it. Surge can now run as its own engine off the hot path.',
      takeaway: 'Keep matching stateless and scalable; push the trip state machine into a durable per-region store.',
    },
    {
      id: 'global',
      step: '05',
      focus: 'Many cities + surge',
      scenarioId: 'global-surge',
      question:
        'Hundreds of cities and millions of drivers worldwide. Can one global geo index and one trip store hold all of it?',
      reveal:
        'No — memory, ingest, and query load exceed any single node. Shard by city or geo cell: rides are inherently local, so a driver in one city never matches a rider in another. Each shard owns its index, trips, and surge, and the system scales by adding shards.',
      takeaway: 'Rides are local, so shard by city/geo cell; each region runs its own index, trips, and surge.',
    },
  ],
  analyze: analyzeRideSharingWorkload,
};

function analyzeRideSharingWorkload(workload: WorkloadValues): LabAnalysis {
  const activeDrivers = numericValue(workload, 'activeDrivers');
  const locationUpdateHz = numericValue(workload, 'locationUpdateHz');
  const rideRequestsPerSecond = numericValue(workload, 'rideRequestsPerSecond');
  const searchRadiusMeters = numericValue(workload, 'searchRadiusMeters');
  const driversPerCell = numericValue(workload, 'driversPerCell');
  const cities = numericValue(workload, 'cities');
  const matchLatencyMs = numericValue(workload, 'matchLatencyMs');
  const surgePricing = Boolean(workload.surgePricing);
  const etaPrediction = Boolean(workload.etaPrediction);

  const ingestWritesPerSecond = activeDrivers * locationUpdateHz;
  // Wider radius and denser cells mean each query touches more candidate cells/drivers.
  const radiusCellFactor = Math.max(1, searchRadiusMeters / 1_500);
  const densityFactor = Math.max(1, driversPerCell / 50);
  const etaFactor = etaPrediction ? 1.5 : 1;
  const effectiveGeoQueriesPerSecond =
    rideRequestsPerSecond * radiusCellFactor * Math.sqrt(densityFactor) * etaFactor;
  const geoIndexGigabytes = (activeDrivers * bytesPerDriverCell) / 1_000_000_000;
  // Matching pairs riders and drives the trip state machine; ETA adds compute.
  const matchingWorkPerSecond = rideRequestsPerSecond * etaFactor;
  const tripStateWritesPerSecond = rideRequestsPerSecond * 4; // requested/matched/en route/complete

  const needsDedicatedIngest = ingestWritesPerSecond > comfortableIngestWritesPerSecond;
  const needsGeoIndex =
    effectiveGeoQueriesPerSecond > 200 ||
    activeDrivers > 20_000 ||
    matchLatencyMs <= 1_000;
  const needsMatchingTier =
    matchingWorkPerSecond > comfortableMatchingQpsPerNode ||
    tripStateWritesPerSecond > comfortableTripStateWritesPerSecond;
  const needsDurableTripStore = needsMatchingTier || rideRequestsPerSecond > 2_000;
  const needsSharding =
    cities > 4 ||
    activeDrivers > comfortableDriversPerCity * 6 ||
    geoIndexGigabytes > comfortableGeoIndexGigabytes ||
    ingestWritesPerSecond > comfortableIngestWritesPerSecond * 4;
  const needsPricing = surgePricing;

  const shardCount = needsSharding ? Math.max(cities, Math.ceil(activeDrivers / comfortableDriversPerCity)) : 1;
  const shardPressure = needsSharding
    ? Math.max(
        cities / 4,
        activeDrivers / (comfortableDriversPerCity * 6),
        geoIndexGigabytes / comfortableGeoIndexGigabytes,
      )
    : Math.max(cities / 5, ingestWritesPerSecond / (comfortableIngestWritesPerSecond * 4));

  const flags = {
    needsDedicatedIngest,
    needsGeoIndex,
    needsMatchingTier,
    needsDurableTripStore,
    needsSharding,
    needsPricing,
    etaPrediction,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      driverApp: 'ok',
      riderApp: 'ok',
      gateway: 'ok',
      locationIngest: needsDedicatedIngest
        ? ingestWritesPerSecond > comfortableIngestWritesPerSecond * 4
          ? 'overloaded'
          : 'needed'
        : ingestWritesPerSecond > comfortableIngestWritesPerSecond * 0.7
          ? 'warning'
          : 'ok',
      geoIndex: needsGeoIndex
        ? effectiveGeoQueriesPerSecond > comfortableGeoQueriesPerSecond
          ? 'overloaded'
          : 'needed'
        : 'inactive',
      matcher: needsMatchingTier ? 'needed' : needsGeoIndex ? 'ok' : 'inactive',
      tripStore: needsDurableTripStore
        ? tripStateWritesPerSecond > comfortableTripStateWritesPerSecond
          ? 'warning'
          : 'needed'
        : 'inactive',
      geoShards: needsSharding ? 'needed' : 'inactive',
      pricing: needsPricing ? 'needed' : 'inactive',
      analytics: 'ok',
    },
    flowStates: {
      driverAppToLocationIngest: 'active',
      riderAppToGateway: 'active',
      locationIngestToGeoIndex: needsGeoIndex ? 'active' : 'inactive',
      gatewayToMatcher: needsGeoIndex ? 'active' : 'inactive',
      matcherToGeoIndex: needsGeoIndex ? 'active' : 'inactive',
      matcherToTripStore: needsDurableTripStore ? 'active' : 'inactive',
      geoIndexToGeoShards: needsSharding ? 'active' : 'inactive',
      tripStoreToGeoShards: needsSharding ? 'active' : 'inactive',
      matcherToPricing: needsPricing ? 'active' : 'inactive',
      locationIngestToAnalytics: 'active',
    },
    meters: {
      ingestThroughput: {
        ratio: ingestWritesPerSecond / comfortableIngestWritesPerSecond,
        valueText: `${formatRate(ingestWritesPerSecond)}/s`,
        copy: needsDedicatedIngest
          ? `${formatRate(ingestWritesPerSecond)}/s of GPS writes need a dedicated ingest path off the matching workers.`
          : `${formatCount(activeDrivers)} drivers at ${locationUpdateHz.toFixed(2)} Hz produce ${formatRate(ingestWritesPerSecond)}/s of writes.`,
      },
      geoQueryLoad: {
        ratio: effectiveGeoQueriesPerSecond / comfortableGeoQueriesPerSecond,
        valueText: `${formatRate(effectiveGeoQueriesPerSecond)}/s`,
        copy: needsGeoIndex
          ? `A ${formatCount(searchRadiusMeters)} m radius over ~${formatCount(driversPerCell)}-driver cells makes each query a bounded index scan.`
          : 'Query volume is low enough to scan in-memory positions without a dedicated geo index.',
      },
      geoIndexMemory: {
        ratio: geoIndexGigabytes / comfortableGeoIndexGigabytes,
        valueText: formatStorageGigabytes(geoIndexGigabytes),
        copy: `${formatCount(activeDrivers)} live driver positions held hot at roughly ${bytesPerDriverCell} bytes each.`,
      },
      matchingQps: {
        ratio: tripStateWritesPerSecond / comfortableTripStateWritesPerSecond,
        valueText: `${formatRate(tripStateWritesPerSecond)}/s`,
        copy: needsDurableTripStore
          ? `${formatRate(rideRequestsPerSecond)}/s of matches drive ~${formatRate(tripStateWritesPerSecond)}/s of trip-state transitions.`
          : 'Matching and trip state fit comfortably in one service at this request rate.',
      },
      shardPressure: {
        ratio: shardPressure,
        valueText: needsSharding
          ? `${formatCount(shardCount)} ${pluralize('shard', shardCount)}`
          : `${formatCount(cities)} ${pluralize('city', cities)}`,
        copy: needsSharding
          ? 'Drivers and trips are partitioned by city/geo cell so each region scales on its own.'
          : 'A single region holds the index, trips, and pricing without geo sharding.',
      },
    },
    decisions: buildDecisions({
      ...flags,
      ingestWritesPerSecond,
      effectiveGeoQueriesPerSecond,
      rideRequestsPerSecond,
      tripStateWritesPerSecond,
      cities,
      shardCount,
    }),
    reasons: buildReasons({
      ...flags,
      activeDrivers,
      locationUpdateHz,
      ingestWritesPerSecond,
      effectiveGeoQueriesPerSecond,
      searchRadiusMeters,
      driversPerCell,
      rideRequestsPerSecond,
      tripStateWritesPerSecond,
      geoIndexGigabytes,
      cities,
      shardCount,
      matchLatencyMs,
    }),
  };
}

type ArchitectureFlags = {
  needsDedicatedIngest: boolean;
  needsGeoIndex: boolean;
  needsMatchingTier: boolean;
  needsDurableTripStore: boolean;
  needsSharding: boolean;
  needsPricing: boolean;
  etaPrediction: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    activeDrivers: number;
    locationUpdateHz: number;
    ingestWritesPerSecond: number;
    effectiveGeoQueriesPerSecond: number;
    searchRadiusMeters: number;
    driversPerCell: number;
    rideRequestsPerSecond: number;
    tripStateWritesPerSecond: number;
    geoIndexGigabytes: number;
    cities: number;
    shardCount: number;
    matchLatencyMs: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsDedicatedIngest) {
    reasons.push({
      severity:
        analysis.ingestWritesPerSecond > comfortableIngestWritesPerSecond * 4 ? 'danger' : 'warning',
      text: `${formatCount(analysis.activeDrivers)} drivers at ${analysis.locationUpdateHz.toFixed(
        2,
      )} Hz produce ~${formatRate(
        analysis.ingestWritesPerSecond,
      )}/s of GPS writes — the binding constraint; give ingest its own write-optimized path.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `Location ingest is only ~${formatRate(
        analysis.ingestWritesPerSecond,
      )}/s, so one service can absorb the GPS stream directly.`,
    });
  }

  if (analysis.needsGeoIndex) {
    reasons.push({
      severity: analysis.effectiveGeoQueriesPerSecond > comfortableGeoQueriesPerSecond ? 'danger' : 'warning',
      text: `Nearest-driver queries over a ${formatCount(
        analysis.searchRadiusMeters,
      )} m radius need an in-memory geospatial index (geohash/quadtree/S2), not a full-fleet scan.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Query volume and fleet size are small enough to scan in-memory positions without a dedicated geo index.',
    });
  }

  if (analysis.needsDurableTripStore) {
    reasons.push({
      severity: analysis.tripStateWritesPerSecond > comfortableTripStateWritesPerSecond ? 'warning' : 'ok',
      text: `${formatRate(
        analysis.rideRequestsPerSecond,
      )}/s of matches drive a trip state machine that must survive failures; persist it in a durable per-region store.`,
    });
  }

  if (analysis.needsMatchingTier) {
    reasons.push({
      severity: 'warning',
      text: 'Keep matching stateless and horizontally scaled in front of the trip store so a worker crash never loses a ride.',
    });
  }

  if (analysis.etaPrediction) {
    reasons.push({
      severity: 'ok',
      text: 'ETA/route prediction adds compute to every candidate, so it runs inside matching workers that scale out.',
    });
  }

  if (analysis.needsSharding) {
    reasons.push({
      severity: analysis.cities > 4 ? 'warning' : 'ok',
      text: `Rides are local, so shard by city/geo cell into ~${formatCount(
        analysis.shardCount,
      )} ${pluralize('shard', analysis.shardCount)}; a driver never matches a rider in another region.`,
    });
  }

  if (analysis.needsPricing) {
    reasons.push({
      severity: 'ok',
      text: 'Surge pricing computes per-area demand/supply as its own engine off the hot matching path.',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    ingestWritesPerSecond: number;
    effectiveGeoQueriesPerSecond: number;
    rideRequestsPerSecond: number;
    tripStateWritesPerSecond: number;
    cities: number;
    shardCount: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    ingestPath: {
      state: flags.needsDedicatedIngest ? 'needed' : 'not-yet',
      copy: flags.needsDedicatedIngest
        ? `Absorb ~${formatRate(
            flags.ingestWritesPerSecond,
          )}/s of GPS on a dedicated, partitioned write path (stream/log) that feeds the index asynchronously.`
        : 'One service ingests the GPS stream directly while the write rate stays modest.',
    },
    geoIndexChoice: {
      state: flags.needsGeoIndex ? 'needed' : 'not-yet',
      copy: flags.needsGeoIndex
        ? 'Keep driver positions hot in a geohash/quadtree/S2 index so nearest-driver queries are bounded cell scans.'
        : 'Scanning in-memory positions is fine until query volume or fleet size grows.',
    },
    matching: {
      state: flags.needsMatchingTier ? 'needed' : flags.needsGeoIndex ? 'useful' : 'not-yet',
      copy: flags.needsMatchingTier
        ? 'Run matching as stateless, horizontally scaled workers that query the index and pair riders to drivers.'
        : flags.needsGeoIndex
          ? 'A single matching service queries the index and pairs riders to drivers.'
          : 'Matching is a simple in-process scan while load is low.',
    },
    tripState: {
      state: flags.needsDurableTripStore ? 'needed' : 'not-yet',
      copy: flags.needsDurableTripStore
        ? `Persist the requested -> matched -> en route -> complete state machine (~${formatRate(
            flags.tripStateWritesPerSecond,
          )}/s) in a durable, low-latency store.`
        : 'Trip state can live in the matching service while there are few concurrent rides.',
    },
    pricingEngine: {
      state: flags.needsPricing ? 'useful' : 'not-yet',
      copy: flags.needsPricing
        ? 'Compute per-area surge multipliers in a separate engine off the hot path and feed prices back to matching.'
        : 'Surge pricing is off, so matching returns a flat fare with no demand computation.',
    },
    sharding: {
      state: flags.needsSharding ? 'needed' : 'not-yet',
      copy: flags.needsSharding
        ? `Shard by city/geo cell into ~${formatCount(
            flags.shardCount,
          )} ${pluralize('shard', flags.shardCount)}; each owns its index, trips, and surge.`
        : 'One region is enough until cities, fleet size, or index memory prove otherwise.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (
    !flags.needsDedicatedIngest &&
    !flags.needsGeoIndex &&
    !flags.needsMatchingTier &&
    !flags.needsSharding
  ) {
    return 'Single matching service';
  }
  if (flags.needsSharding) {
    return 'Geo-sharded ingest + in-memory index + durable trips';
  }
  if (flags.needsMatchingTier || flags.needsDurableTripStore) {
    return 'Dedicated ingest + geo index + matching tier + trip store';
  }
  if (flags.needsGeoIndex) {
    return 'Dedicated ingest + in-memory geo index';
  }
  return 'Single matching service';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (
    !flags.needsDedicatedIngest &&
    !flags.needsGeoIndex &&
    !flags.needsMatchingTier &&
    !flags.needsSharding
  ) {
    return 'One service holds driver positions in memory, scans them per request, and tracks trips inline. Nothing else is justified yet.';
  }
  if (flags.needsSharding) {
    return 'Drivers and trips are partitioned by city/geo cell; each shard runs its own ingest path, in-memory geo index, matching workers, durable trip store, and surge engine.';
  }
  if (flags.needsMatchingTier || flags.needsDurableTripStore) {
    return 'A dedicated ingest path feeds an in-memory geo index, stateless matching workers query it to pair rides, and a durable store holds the trip state machine.';
  }
  if (flags.needsGeoIndex) {
    return 'A dedicated ingest path absorbs the GPS firehose and feeds an in-memory geospatial index so nearest-driver queries stay bounded.';
  }
  return 'One matching service still covers the workload.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (
    !flags.needsDedicatedIngest &&
    !flags.needsGeoIndex &&
    !flags.needsMatchingTier &&
    !flags.needsSharding
  ) {
    return 'Request -> matching service (in-memory positions)';
  }
  if (flags.needsSharding) {
    return 'GPS -> ingest -> geo index (per shard) -> matching -> trip store; request -> shard';
  }
  if (flags.needsMatchingTier || flags.needsDurableTripStore) {
    return 'GPS -> ingest -> geo index; request -> matching -> trip store';
  }
  if (flags.needsGeoIndex) {
    return 'GPS -> ingest -> geo index; request -> matching -> geo index';
  }
  return 'Request -> matching service';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function pluralize(unit: string, value: number): string {
  if (Math.round(value) === 1) {
    return unit;
  }
  if (unit === 'city') {
    return 'cities';
  }
  return `${unit}s`;
}
