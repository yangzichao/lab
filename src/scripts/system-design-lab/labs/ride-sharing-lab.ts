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
  eyebrow: '系统设计 Lab',
  title: 'Ride matching 的瓶颈在于高频吞下司机 GPS、并快速回答 nearest-driver 查询，而不在请求量本身。',
  summary:
    '调节有多少司机在线、每个司机上报 GPS 的频率、ride-request 速率、搜索半径，以及服务多少个城市。设计会从单个 service 逐步演进到专门的 location-ingest 路径、用于 nearest-driver 查询的 in-memory geospatial index、durable 的 trip-state store，以及按 geo 分片加 surge pricing。',
  controls: [
    {
      id: 'activeDrivers',
      label: '在线司机数',
      help: '当前在线、正在上报 GPS 的司机。每个都是一条持续的写入 stream。',
      min: 100,
      max: 5_000_000,
      defaultValue: 20_000,
      scale: 'log',
      unit: '名',
      format: 'count',
    },
    {
      id: 'locationUpdateHz',
      label: 'GPS 上报频率',
      help: '每个司机上报新位置的频率。这决定了 ingest 的写入速率。',
      min: 0.1,
      max: 4,
      defaultValue: 0.25,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'rideRequestsPerSecond',
      label: 'Ride request 速率',
      help: '乘客发起 matching 请求。每个请求都会触发一次 nearest-driver 的 geo 查询。',
      min: 1,
      max: 500_000,
      defaultValue: 200,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'searchRadiusMeters',
      label: '搜索半径',
      help: '找可用司机时往外搜多远。半径越宽，每次查询要扫的 index cell 越多。',
      min: 200,
      max: 10_000,
      defaultValue: 1_500,
      scale: 'log',
      unit: '米',
      format: 'count',
    },
    {
      id: 'driversPerCell',
      label: '每个 cell 的司机数',
      help: '一个 geohash/S2 cell 内的司机密度。又热又密的 cell 每次查询代价更高。',
      min: 5,
      max: 5_000,
      defaultValue: 60,
      scale: 'log',
      unit: '名',
      format: 'count',
    },
    {
      id: 'cities',
      label: '城市 / region 数',
      help: '服务的独立地理区域。每个都可以是天然的 shard 边界。',
      min: 1,
      max: 600,
      defaultValue: 1,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'matchLatencyMs',
      label: 'Match latency 目标',
      help: '从找候选司机到把 match 返回给乘客的延迟预算。',
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
      help: '按区域算 demand/supply 比例来抬价；作为独立 engine 运行。',
      defaultValue: false,
    },
    {
      id: 'etaPrediction',
      label: 'ETA / 路线预测',
      help: '为每个候选预测到达时间和路线；给每次 match 增加计算量。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'one-city',
      step: '01',
      title: '一个小城市',
      summary: '几千名司机，每秒几个请求。',
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
      summary: '更多司机更快地上报，把 ingest 写入路径冲垮。',
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
      title: '快速找最近司机',
      summary: '宽半径加上密集 cell，让 geo 查询成为瓶颈。',
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
      title: 'Durable 的 trip state',
      summary: 'Matching 和 trip-state machine 在持续的高 QPS 下运行。',
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
      title: '多城市 + surge',
      summary: '全球数百个城市，按 geo 分片，配合实时 surge。',
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
    title: 'Ride-sharing matching 架构图',
    description:
      'Ride matching 的白板风格架构图：司机和乘客、location-ingest 路径与 API gateway、带 matching service 的 in-memory geospatial index、durable 的 trip-state store，以及异步的 pricing 与 analytics pipeline。',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'driverApp',
            title: '司机 app',
            subtitle: 'GPS stream',
            summary: '在线时每隔几秒上报一次自己的位置',
            kind: 'client',
          },
          {
            id: 'riderApp',
            title: '乘客 app',
            subtitle: '发起叫车',
            summary: '请求和最近的可用司机进行 match',
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
            subtitle: '乘客请求',
            summary: '给乘客做鉴权，并把 match 请求路由到 matching service',
            kind: 'lb',
          },
          {
            id: 'locationIngest',
            title: 'Location ingest',
            subtitle: '高写入速率',
            summary: '吸收司机 GPS 更新的 firehose，并喂给 geo index',
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
            subtitle: 'in-memory cell',
            summary: '把司机的实时位置保存在 geohash/quadtree/S2 cell 里，用于 nearest 查询',
            kind: 'search',
          },
          {
            id: 'matcher',
            title: 'Matching service',
            subtitle: '配对 + 状态',
            summary: '查 index 拿候选，把乘客和司机配对起来',
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
            summary: '持久化追踪每段行程，从 requested 到 matched 到 en route 再到 complete',
            kind: 'db',
          },
          {
            id: 'geoShards',
            title: 'Geo shards',
            subtitle: '按城市 / cell',
            summary: '按地理把司机和行程分片，让每个 region 独立扩展',
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
            summary: '在 matching 热路径之外，按区域计算 surge 倍率',
            kind: 'compute',
          },
          {
            id: 'analytics',
            title: 'Event stream',
            subtitle: '异步事件',
            summary: '收集行程和位置事件，供离线的 analytics 与 ML 使用',
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
    { id: 'ingestThroughput', label: 'Location 写入吞吐' },
    { id: 'geoQueryLoad', label: 'Geo-query 负载' },
    { id: 'geoIndexMemory', label: 'Geo-index 内存' },
    { id: 'matchingQps', label: 'Matching + trip-state QPS' },
    { id: 'shardPressure', label: '跨城市 / shard 压力' },
  ],
  decisions: [
    { id: 'ingestPath', title: 'Location ingest 路径' },
    { id: 'geoIndexChoice', title: 'Geospatial index' },
    { id: 'matching', title: 'Matching service' },
    { id: 'tripState', title: 'Trip-state store' },
    { id: 'pricingEngine', title: 'Surge pricing engine' },
    { id: 'sharding', title: '按城市 / geo 分片' },
  ],
  sourceBackedRules: [
    {
      title: 'Uber 用 S2 geospatial cell 把乘客匹配给司机',
      source: 'Uber Engineering',
      url: 'https://www.uber.com/en-US/blog/h3/',
      summary:
        'Uber 用层级化的 cell（H3，构建在 Google S2 之上）给整个世界建 index，让 nearest-driver 查找变成只扫一小撮 cell 的有界 scan。',
    },
    {
      title: 'Geohashing 把临近搜索变成 prefix range scan',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/develop/data-types/geospatial/',
      summary:
        '把经纬度编码成 geohash，让邻近的点共享同一个 prefix，于是一次半径查询就变成对 in-memory sorted-set 的一小组 range 读取。',
    },
    {
      title: '高频 location ingest 是一个 write-heavy 的 streaming 问题',
      source: 'Apache Kafka',
      url: 'https://kafka.apache.org/documentation/',
      summary:
        '持续涌入的逐司机 GPS 事件，最好用一个 partitioned log 来吸收，把 ingest 与 index 和下游 consumer 解耦开。',
    },
    {
      title: 'Quadtree 能高效回答 2D 的 nearest-neighbour 查询',
      source: 'Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Quadtree',
      summary:
        'Quadtree 递归地划分空间，于是一次区域查询只访问和搜索区域有重叠的 cell，而不是每个点都看。',
    },
  ],
  teachingAssumptions: [
    'Location ingest 的写入速率按「在线司机数 × GPS 上报频率」建模；真实系统会对更新做 batch 和 dedup。',
    '单节点的 ingest、geo-query 和 trip-state 预算是保守的教学数字，不是厂商上限。',
    'Geo-query 代价随搜索半径和 cell 密度增长；in-memory index 的内存随在线司机数增长。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-service',
      step: '01',
      focus: '一个城市，一个 service',
      scenarioId: 'one-city',
      question:
        '一个小城市有约 2k 名司机、约 20 个 ride request/s。现在需要专门的 geo index、ingest 路径或分片吗？',
      reveal:
        '不需要。在每秒几百个 GPS 写入、20 个查询的量级下，一个 service 就能把司机位置放在内存里，每次请求扫一遍。单独的 ingest 层、partitioned index、按城市的 shard，现在都为时过早。',
      takeaway: '从一个把司机位置放在内存里的 service 起步；真正的瓶颈还没出现。',
    },
    {
      id: 'firehose',
      step: '02',
      focus: 'GPS firehose',
      scenarioId: 'ingest-spike',
      question:
        '8 万名司机每秒各上报一次，就是约 80k location 写入/s。先被打满的是请求处理，还是 location ingest？',
      reveal:
        '是 location ingest。Ride request 还不大，但持续的 GPS stream 才是主导：它就是瓶颈。把 ingest 拆到自己的路径上（一个 partitioned log/stream），让它永远不阻塞 matching，再异步地把位置写进 index。',
      takeaway: '瓶颈是吞 GPS，不是处理请求；给 ingest 一条专门为写入优化的路径。',
    },
    {
      id: 'nearest',
      step: '03',
      focus: '快速找最近司机',
      scenarioId: 'fast-nearest',
      question:
        '6k 请求/s，每个都要在装着 400 名司机的 cell 上扫 4 km 半径。为什么不干脆每个请求都过一遍整张司机表？',
      reveal:
        '全表扫描每次查询是 O(drivers)，会撑爆 latency 预算。一个 hot 在内存里的 geospatial index（geohash、quadtree 或 S2 cell）把每次查询变成对附近几个 cell 的有界 scan，于是代价取决于半径和密度，而不是司机总规模。',
      takeaway: 'Hot 的 in-memory geo index 让 nearest-driver 的代价取决于半径和密度，而不是车队规模。',
    },
    {
      id: 'trips',
      step: '04',
      focus: 'Durable 的 trip state',
      scenarioId: 'durable-trips',
      question:
        '在 40k 请求/s、有实时行程的情况下，trip 状态（requested -> matched -> en route -> complete）该放在哪，才能让崩溃永远不丢单？',
      reveal:
        'Matching 本身是 stateless 的、可以横向扩，但 trip 是一台必须扛过故障的 state machine。把它持久化到一个 durable、低延迟、按 trip/region 做 key 的 store 里，再让 matching 作为横向扩展的 worker 跑在它前面。Surge 现在可以作为独立 engine 跑在热路径之外。',
      takeaway: '让 matching 保持 stateless、可扩展；把 trip state machine 推进一个 durable 的按 region 的 store。',
    },
    {
      id: 'global',
      step: '05',
      focus: '多城市 + surge',
      scenarioId: 'global-surge',
      question:
        '全球数百个城市、数百万名司机。一个全局 geo index 加一个 trip store 装得下全部吗？',
      reveal:
        '装不下——内存、ingest 和查询负载都超过任何单节点。按城市或 geo cell 分片：叫车天然是本地的，一个城市的司机永远不会和另一个城市的乘客 match。每个 shard 拥有自己的 index、trips 和 surge，系统靠加 shard 来扩展。',
      takeaway: '叫车是本地的，所以按城市/geo cell 分片；每个 region 跑自己的 index、trips 和 surge。',
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
          ? `${formatRate(ingestWritesPerSecond)}/s 的 GPS 写入需要一条独立的 ingest 路径，和 matching worker 分开。`
          : `${formatCount(activeDrivers)} 名司机在 ${locationUpdateHz.toFixed(2)} Hz 下产生 ${formatRate(ingestWritesPerSecond)}/s 的写入。`,
      },
      geoQueryLoad: {
        ratio: effectiveGeoQueriesPerSecond / comfortableGeoQueriesPerSecond,
        valueText: `${formatRate(effectiveGeoQueriesPerSecond)}/s`,
        copy: needsGeoIndex
          ? `在装着约 ${formatCount(driversPerCell)} 名司机的 cell 上扫 ${formatCount(searchRadiusMeters)} m 半径，让每次查询成为一次有界的 index scan。`
          : '查询量足够低，不用专门的 geo index，直接扫内存里的位置即可。',
      },
      geoIndexMemory: {
        ratio: geoIndexGigabytes / comfortableGeoIndexGigabytes,
        valueText: formatStorageGigabytes(geoIndexGigabytes),
        copy: `${formatCount(activeDrivers)} 个实时司机位置 hot 保存在内存里，每个约 ${bytesPerDriverCell} 字节。`,
      },
      matchingQps: {
        ratio: tripStateWritesPerSecond / comfortableTripStateWritesPerSecond,
        valueText: `${formatRate(tripStateWritesPerSecond)}/s`,
        copy: needsDurableTripStore
          ? `${formatRate(rideRequestsPerSecond)}/s 的 match 带来约 ${formatRate(tripStateWritesPerSecond)}/s 的 trip-state 状态转换。`
          : '在这个请求速率下，matching 和 trip state 都能舒服地放进一个 service。',
      },
      shardPressure: {
        ratio: shardPressure,
        valueText: needsSharding
          ? `${formatCount(shardCount)} 个 shard`
          : `${formatCount(cities)} 个城市`,
        copy: needsSharding
          ? '司机和行程按城市/geo cell 分片，让每个 region 各自扩展。'
          : '单个 region 就装下了 index、trips 和 pricing，不需要 geo 分片。',
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
      text: `${formatCount(analysis.activeDrivers)} 名司机在 ${analysis.locationUpdateHz.toFixed(
        2,
      )} Hz 下产生约 ${formatRate(
        analysis.ingestWritesPerSecond,
      )}/s 的 GPS 写入——这就是瓶颈；给 ingest 一条专门为写入优化的路径。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `Location ingest 只有约 ${formatRate(
        analysis.ingestWritesPerSecond,
      )}/s，所以一个 service 就能直接吸收 GPS stream。`,
    });
  }

  if (analysis.needsGeoIndex) {
    reasons.push({
      severity: analysis.effectiveGeoQueriesPerSecond > comfortableGeoQueriesPerSecond ? 'danger' : 'warning',
      text: `在 ${formatCount(
        analysis.searchRadiusMeters,
      )} m 半径内做 nearest-driver 查询，需要一个 in-memory geospatial index（geohash/quadtree/S2），而不是全车队扫描。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '查询量和车队规模都够小，直接扫内存里的位置即可，不用专门的 geo index。',
    });
  }

  if (analysis.needsDurableTripStore) {
    reasons.push({
      severity: analysis.tripStateWritesPerSecond > comfortableTripStateWritesPerSecond ? 'warning' : 'ok',
      text: `${formatRate(
        analysis.rideRequestsPerSecond,
      )}/s 的 match 驱动着一台必须扛过故障的 trip state machine；把它持久化到一个 durable 的按 region 的 store。`,
    });
  }

  if (analysis.needsMatchingTier) {
    reasons.push({
      severity: 'warning',
      text: '让 matching 保持 stateless、横向扩展，跑在 trip store 前面，这样 worker 崩溃也永远不丢单。',
    });
  }

  if (analysis.etaPrediction) {
    reasons.push({
      severity: 'ok',
      text: 'ETA/路线预测给每个候选都加了计算量，所以它跑在可横向扩展的 matching worker 里。',
    });
  }

  if (analysis.needsSharding) {
    reasons.push({
      severity: analysis.cities > 4 ? 'warning' : 'ok',
      text: `叫车是本地的，所以按城市/geo cell 分成约 ${formatCount(
        analysis.shardCount,
      )} 个 shard；一个司机永远不会和另一个 region 的乘客 match。`,
    });
  }

  if (analysis.needsPricing) {
    reasons.push({
      severity: 'ok',
      text: 'Surge pricing 在 matching 热路径之外，作为独立 engine 按区域计算 demand/supply。',
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
        ? `用一条独立的、partitioned 的写入路径（stream/log）吸收约 ${formatRate(
            flags.ingestWritesPerSecond,
          )}/s 的 GPS，并异步喂给 index。`
        : '写入速率还不大时，一个 service 直接吸收 GPS stream 即可。',
    },
    geoIndexChoice: {
      state: flags.needsGeoIndex ? 'needed' : 'not-yet',
      copy: flags.needsGeoIndex
        ? '把司机位置 hot 保存在 geohash/quadtree/S2 index 里，让 nearest-driver 查询变成有界的 cell scan。'
        : '在查询量或车队规模变大之前，扫内存里的位置就够了。',
    },
    matching: {
      state: flags.needsMatchingTier ? 'needed' : flags.needsGeoIndex ? 'useful' : 'not-yet',
      copy: flags.needsMatchingTier
        ? '把 matching 跑成 stateless、可横向扩展的 worker，去查 index 并把乘客和司机配对。'
        : flags.needsGeoIndex
          ? '单个 matching service 查 index 并把乘客和司机配对。'
          : '负载低时，matching 就是一次进程内的简单扫描。',
    },
    tripState: {
      state: flags.needsDurableTripStore ? 'needed' : 'not-yet',
      copy: flags.needsDurableTripStore
        ? `把 requested -> matched -> en route -> complete 这台 state machine（约 ${formatRate(
            flags.tripStateWritesPerSecond,
          )}/s）持久化到一个 durable、低延迟的 store。`
        : '并发行程不多时，trip state 可以放在 matching service 里。',
    },
    pricingEngine: {
      state: flags.needsPricing ? 'useful' : 'not-yet',
      copy: flags.needsPricing
        ? '在一个独立 engine 里、热路径之外按区域计算 surge 倍率，再把价格反馈给 matching。'
        : 'Surge pricing 关闭，所以 matching 返回固定车费，不做需求计算。',
    },
    sharding: {
      state: flags.needsSharding ? 'needed' : 'not-yet',
      copy: flags.needsSharding
        ? `按城市/geo cell 分成约 ${formatCount(
            flags.shardCount,
          )} 个 shard；每个拥有自己的 index、trips 和 surge。`
        : '在城市数、车队规模或 index 内存证明之前，一个 region 就够了。',
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
    return '单个 matching service';
  }
  if (flags.needsSharding) {
    return 'Geo 分片的 ingest + in-memory index + durable trips';
  }
  if (flags.needsMatchingTier || flags.needsDurableTripStore) {
    return '专门的 ingest + geo index + matching 层 + trip store';
  }
  if (flags.needsGeoIndex) {
    return '专门的 ingest + in-memory geo index';
  }
  return '单个 matching service';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (
    !flags.needsDedicatedIngest &&
    !flags.needsGeoIndex &&
    !flags.needsMatchingTier &&
    !flags.needsSharding
  ) {
    return '一个 service 把司机位置放在内存里，每次请求扫一遍，并就地追踪行程。其它一切都还没有必要。';
  }
  if (flags.needsSharding) {
    return '司机和行程按城市/geo cell 分片；每个 shard 跑自己的 ingest 路径、in-memory geo index、matching worker、durable trip store 和 surge engine。';
  }
  if (flags.needsMatchingTier || flags.needsDurableTripStore) {
    return '一条专门的 ingest 路径喂给 in-memory geo index，stateless 的 matching worker 查它来配对行程，一个 durable store 保存着 trip state machine。';
  }
  if (flags.needsGeoIndex) {
    return '一条专门的 ingest 路径吸收 GPS firehose 并喂给 in-memory geospatial index，让 nearest-driver 查询保持有界。';
  }
  return '一个 matching service 仍然能覆盖这个负载。';
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
