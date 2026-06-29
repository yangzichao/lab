import { buildColumnDiagram } from '../diagram-layout';
import {
  formatCount,
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
const sourceMegabytesPerMinute = 50; // a single mezzanine/source minute on disk
const renditionSizeFactor = 0.6; // all renditions together vs one source copy
const transcodeMinutesPerSourceMinute = 4; // wall-clock compute per profile per source minute
const comfortableTranscodeMinutesPerWorker = 60; // a worker chews ~60 source-min/min of work
const comfortableOriginEgressGbps = 40; // one origin region before CDN offload hurts
const comfortableMetadataQps = 30_000; // a single metadata DB node
const comfortableObjectStorageTerabytes = 500; // one storage tier before it must shard/tier
const megabitsPerViewerStream = 5; // average adaptive stream bitrate

export const videoStreamingLabDefinition: SystemDesignLabDefinition = {
  id: 'video-streaming',
  eyebrow: '系统设计 Lab',
  title:
    '视频平台其实是两个系统：ingest 端是计算密集的 transcode pipeline，playback 端是读极重的 CDN。',
  summary:
    '调整每天上传量、平均视频时长、并发观众、catalog 大小、每个视频编码多少个 bitrate rendition、峰值倍数，以及 region 数。设计会从一台直接服务文件的单机，演进到 CDN offload、queue 加 transcode worker farm、sharded object storage 配独立 metadata store，最后到 multi-region multi-CDN 分发。',
  controls: [
    {
      id: 'uploadsPerDay',
      label: '每天上传量',
      help: '每天提交的新源视频；每个都会按 profile fan-out 成一批 transcode job。',
      min: 10,
      max: 5_000_000,
      defaultValue: 1_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'avgVideoMinutes',
      label: '平均视频时长',
      help: '源视频的平均时长；同时决定存储大小和 transcode 计算量。',
      min: 1,
      max: 180,
      defaultValue: 10,
      scale: 'log',
      unit: 'min',
      format: 'count',
    },
    {
      id: 'concurrentViewers',
      label: '并发观众',
      help: '同时在播放的 session；这是主导的、读极重的分发负载。',
      min: 10,
      max: 50_000_000,
      defaultValue: 5_000,
      scale: 'log',
      unit: '人',
      format: 'count',
    },
    {
      id: 'catalogSize',
      label: 'Catalog 大小',
      help: '所有 rendition 算在内存下来的视频总数；决定 object storage 和 metadata 行数。',
      min: 1_000,
      max: 10_000_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'transcodeProfiles',
      label: 'Bitrate rendition 数',
      help: '每个视频编码的分辨率/码率档（如 240p…4K）；成倍放大 ingest 计算量。',
      min: 1,
      max: 12,
      defaultValue: 5,
      scale: 'linear',
      unit: '档',
      format: 'count',
    },
    {
      id: 'peakViewerMultiplier',
      label: '峰值倍数',
      help: '峰值时并发观众相对平均值能飙多高（黄金时段、一个爆款）。',
      min: 1,
      max: 20,
      defaultValue: 3,
      scale: 'linear',
      format: 'multiplier',
    },
    {
      id: 'globalRegions',
      label: 'Region 数',
      help: '需要就近为观众提供 playback、压低启动延迟的 region 数。',
      min: 1,
      max: 20,
      defaultValue: 1,
      scale: 'linear',
      unit: '个',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'adaptiveBitrate',
      label: 'Adaptive bitrate (ABR)',
      help: '把 HLS/DASH segment 打包好，让 player 按带宽切换 rendition。',
      defaultValue: true,
    },
    {
      id: 'liveStreaming',
      label: 'Live streaming',
      help: '实时 ingest 并 transcode 直播，没有重新编码的第二次机会。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-box',
      step: '01',
      title: 'Clips on one box',
      summary: '少量上传、零星几个观众，直接从一台服务器服务。',
      values: {
        uploadsPerDay: 50,
        avgVideoMinutes: 5,
        concurrentViewers: 200,
        catalogSize: 5_000,
        transcodeProfiles: 1,
        peakViewerMultiplier: 2,
        globalRegions: 1,
        adaptiveBitrate: false,
        liveStreaming: false,
      },
    },
    {
      id: 'viewers-grow',
      step: '02',
      title: 'Viewers take off',
      summary: 'Playback 把 ingest 衬得微不足道；origin 一家撑不住 egress。',
      values: {
        uploadsPerDay: 500,
        avgVideoMinutes: 8,
        concurrentViewers: 200_000,
        catalogSize: 50_000,
        transcodeProfiles: 3,
        peakViewerMultiplier: 4,
        globalRegions: 1,
        adaptiveBitrate: true,
        liveStreaming: false,
      },
    },
    {
      id: 'uploads-grow',
      step: '03',
      title: 'Uploads flood in',
      summary: '一波创作者把 inline transcoding 压垮。',
      values: {
        uploadsPerDay: 200_000,
        avgVideoMinutes: 12,
        concurrentViewers: 1_500_000,
        catalogSize: 5_000_000,
        transcodeProfiles: 6,
        peakViewerMultiplier: 4,
        globalRegions: 2,
        adaptiveBitrate: true,
        liveStreaming: false,
      },
    },
    {
      id: 'huge-catalog',
      step: '04',
      title: 'Huge catalog',
      summary: 'Storage 和 metadata 都超出单节点。',
      values: {
        uploadsPerDay: 1_500_000,
        avgVideoMinutes: 20,
        concurrentViewers: 8_000_000,
        catalogSize: 800_000_000,
        transcodeProfiles: 8,
        peakViewerMultiplier: 5,
        globalRegions: 3,
        adaptiveBitrate: true,
        liveStreaming: false,
      },
    },
    {
      id: 'global-live',
      step: '05',
      title: 'Global + live',
      summary: '全球数千万人观看，包含实时直播活动。',
      values: {
        uploadsPerDay: 4_000_000,
        avgVideoMinutes: 30,
        concurrentViewers: 40_000_000,
        catalogSize: 5_000_000_000,
        transcodeProfiles: 10,
        peakViewerMultiplier: 10,
        globalRegions: 10,
        adaptiveBitrate: true,
        liveStreaming: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: '视频流媒体平台架构图',
    description:
      '白板风格的视频平台架构图：客户端、edge CDN 分发、upload 和 API 层、带 worker farm 的 transcode queue，以及 object storage 配 metadata 数据库。',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'viewer',
            title: 'Viewer',
            subtitle: 'playback',
            kind: 'client',
            summary: '请求 manifest 并流式拉取视频 segment，随带宽变化切换 bitrate',
          },
          {
            id: 'uploader',
            title: 'Uploader',
            subtitle: '创作者',
            kind: 'client',
            summary: '提交一个新源视频去 transcode 并发布',
          },
        ],
      },
      {
        id: 'edge',
        label: 'Edge / CDN',
        variant: 'edge',
        nodes: [
          {
            id: 'cdn',
            title: 'CDN',
            subtitle: '服务 segment',
            kind: 'cdn',
            summary: '在 edge 缓存视频 segment，让 origin 省下绝大部分 playback egress',
          },
          {
            id: 'multiCdn',
            title: 'Multi-CDN',
            subtitle: '全球分发',
            kind: 'cdn',
            summary: '把分发铺到多个 region 和厂商，换取容量和低启动延迟',
          },
        ],
      },
      {
        id: 'api',
        label: 'Upload + API',
        variant: 'backbone',
        nodes: [
          {
            id: 'uploadApi',
            title: 'Upload + API',
            subtitle: 'ingest + playback',
            kind: 'api',
            summary: '接收上传、服务 manifest，并为 playback 解析 metadata',
          },
          {
            id: 'packager',
            title: 'Packager',
            subtitle: 'HLS / DASH',
            kind: 'compute',
            summary: '把 rendition 切片并打包成 adaptive manifest 供 player 用',
          },
        ],
      },
      {
        id: 'transcode',
        label: 'Transcode',
        variant: 'processing',
        nodes: [
          {
            id: 'queue',
            title: 'Job queue',
            subtitle: '异步工作',
            kind: 'queue',
            summary: '缓冲 transcode job，让 ingest 峰值永远不会阻塞上传或 playback',
          },
          {
            id: 'workers',
            title: 'Worker farm',
            subtitle: '编码 rendition',
            kind: 'compute',
            summary: '把一个源视频并行 fan-out 成每一个 bitrate rendition',
          },
          {
            id: 'liveEncoder',
            title: 'Live encoder',
            subtitle: '实时',
            kind: 'compute',
            summary: '实时 transcode 直播 ingest，没有重新编码的机会',
          },
        ],
      },
      {
        id: 'storage',
        label: 'Storage',
        variant: 'storage',
        nodes: [
          {
            id: 'objectStore',
            title: 'Object store',
            subtitle: '视频文件',
            kind: 'objectstore',
            summary: '作为 playback origin，持久存放源视频和每一个编码出的 rendition',
          },
          {
            id: 'metadataDb',
            title: 'Metadata DB',
            subtitle: 'catalog 行',
            kind: 'db',
            summary: '存放标题、manifest，以及 playback 要查的每个视频的 metadata',
          },
        ],
      },
    ],
    flows: [
      { from: 'viewer', to: 'cdn', variant: 'primary' },
      { from: 'cdn', to: 'uploadApi', variant: 'secondary' },
      { from: 'cdn', to: 'multiCdn', variant: 'secondary' },
      { from: 'uploader', to: 'uploadApi', variant: 'primary' },
      { from: 'uploadApi', to: 'queue', variant: 'primary' },
      { from: 'uploadApi', to: 'metadataDb', variant: 'direct' },
      { from: 'uploadApi', to: 'packager', variant: 'secondary' },
      { from: 'queue', to: 'workers', variant: 'primary' },
      { from: 'queue', to: 'liveEncoder', variant: 'secondary' },
      { from: 'workers', to: 'objectStore', variant: 'primary' },
      { from: 'cdn', to: 'objectStore', variant: 'direct' },
    ],
  }),
  meters: [
    { id: 'cdnOffload', label: 'CDN offload / origin egress' },
    { id: 'transcodeBacklog', label: 'Transcode 积压' },
    { id: 'objectStorage', label: 'Object storage 大小' },
    { id: 'metadataQps', label: 'Metadata QPS' },
    { id: 'deliveryLatency', label: '全球分发延迟' },
  ],
  decisions: [
    { id: 'cdn', title: 'CDN 分发' },
    { id: 'transcodePipeline', title: 'Transcode pipeline' },
    { id: 'adaptiveBitrate', title: 'Adaptive bitrate' },
    { id: 'objectStorage', title: 'Object storage' },
    { id: 'metadataStore', title: 'Metadata store' },
    { id: 'multiRegion', title: 'Multi-region / multi-CDN' },
  ],
  sourceBackedRules: [
    {
      title: '流媒体视频从 CDN cache 分发，而不是 origin',
      source: 'AWS CloudFront',
      url: 'https://aws.amazon.com/cloudfront/',
      summary:
        'CDN 在靠近观众的 edge 节点缓存 segment；origin 只服务 cache miss，这是 playback egress 唯一能扩展的方式。',
    },
    {
      title: 'Adaptive bitrate streaming 打包多个 rendition 供 player 切换',
      source: 'Apple HTTP Live Streaming',
      url: 'https://developer.apple.com/streaming/',
      summary:
        'HLS（和 DASH）用一份切好片的 rendition media playlist，让 player 挑一个适配当前带宽的 bitrate；这正是 ingest 必须编码好几档 profile 的原因。',
    },
    {
      title: 'Transcoding 作为异步 job 跑在由 queue 喂料的 worker farm 上',
      source: 'AWS Elemental MediaConvert',
      url: 'https://aws.amazon.com/mediaconvert/',
      summary:
        '基于文件的 transcoding 以 job 形式提交，由弹性 worker 处理，于是上传峰值排队而不是阻塞请求路径。',
    },
    {
      title: 'Object storage 是媒体文件持久、可扩展的 origin',
      source: 'Amazon S3',
      url: 'https://aws.amazon.com/s3/',
      summary:
        '源视频和每一个 rendition 都放在 object storage 里，它的存储和持久性独立于计算和服务层扩展。',
    },
  ],
  teachingAssumptions: [
    'Playback 带宽按 concurrentViewers x 峰值倍数 x ~5 Mbps 建模；CDN offload 假设热门内容在 edge 缓存命中率高。',
    'Transcode 计算量近似为 profile 数 x 源分钟数 x 每 worker 的固定系数；真实 encoder 随 codec 和分辨率而变。',
    'Storage 算上每个视频的源加 rendition；单节点的 QPS、egress 和存储预算都是保守的教学数字，不是厂商上限。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-box',
      step: '01',
      focus: 'Clips on one box',
      scenarioId: 'single-box',
      question:
        '一个小站点每天 50 个上传、一档 rendition、~200 个观众。现在需要 CDN、queue 或 worker farm 吗？',
      reveal:
        '不需要。一台服务器就能 inline transcode 几个短 clip 并直接服务文件；200 个观众、每人几 Mbps，远低于单机 egress。CDN、job queue 和 worker farm 此刻都还早——多出来的部件却没有负载来支撑它们。',
      takeaway: '从简单开始：小规模下一台机器 inline transcode 加直接服务文件就是对的。',
    },
    {
      id: 'viewers',
      step: '02',
      focus: 'Viewers take off',
      scenarioId: 'viewers-grow',
      question:
        '上传量还不大，但并发观众跳到 20 万、4 倍峰值。什么先饱和，最便宜的解法是什么？',
      reveal:
        'Origin egress 远早于其它东西先饱和——峰值 20 万观众就是几百 Gbps。Playback segment 极易缓存，所以一个 CDN 几乎把它全 offload 掉，origin 只服务 miss。这也逼出 adaptive bitrate，让弱连接也能播。',
      takeaway: 'Playback 是读重且可缓存的；靠 CDN 而不是更大的 origin 来扩展分发。',
    },
    {
      id: 'uploads',
      step: '03',
      focus: 'Uploads flood in',
      scenarioId: 'uploads-grow',
      question:
        '现在每天 20 万上传，每个 fan-out 成 6 档 rendition。为什么不在 API server 上把每个上传都 inline transcode 掉？',
      reveal:
        'Transcoding 计算密集又突发：6 档 profile x 视频分钟数 x 海量上传，远超 inline 容量，一个峰值就会阻塞请求路径。把 job 放到 queue 上，交给弹性 worker farm 处理，这样 ingest 峰值随时间慢慢消化，而不是让上传失败。',
      takeaway: '把 ingest 和计算解耦：queue 加 worker farm 异步吸收 transcode 峰值。',
    },
    {
      id: 'catalog',
      step: '04',
      focus: 'Huge catalog',
      scenarioId: 'huge-catalog',
      question:
        '8 亿视频 x 好几档 rendition 就是 PB 级，metadata 查询又随观众增长。一个存储节点加一个 DB 装得下吗？',
      reveal:
        '装不下。媒体该放在独立于计算扩展的 object storage 里，而 metadata——标题、manifest、观看状态——超出单个数据库，所以要 shard 或迁到一个可横向扩展的 store。只有 metadata 打到你的 DB；字节留在 CDN 后面的 object storage 里。',
      takeaway: '把字节和 metadata 分开：文件放 object storage，catalog 行放 sharded store。',
    },
    {
      id: 'global',
      step: '05',
      focus: 'Global + live',
      scenarioId: 'global-live',
      question:
        '全球数千万人观看，还有 10 倍峰值的直播活动。一个 region 后面挂一个 CDN 够吗？',
      reveal:
        '不够——单个 region 既给不了全球的启动延迟，也吸收不了爆款/直播峰值，所以你要复制到多个 region，并把分发铺到多个 CDN。Live 又多出一条没有重编码兜底的实时编码路径，所以它跑在自己专属的低延迟 pipeline 上。',
      takeaway: '要全球低延迟加直播，就上 multi-region、multi-CDN，并给 live 一条专属的实时路径。',
    },
  ],
  analyze: analyzeVideoStreamingWorkload,
};

function analyzeVideoStreamingWorkload(workload: WorkloadValues): LabAnalysis {
  const uploadsPerDay = numericValue(workload, 'uploadsPerDay');
  const avgVideoMinutes = numericValue(workload, 'avgVideoMinutes');
  const concurrentViewers = numericValue(workload, 'concurrentViewers');
  const catalogSize = numericValue(workload, 'catalogSize');
  const transcodeProfiles = numericValue(workload, 'transcodeProfiles');
  const peakViewerMultiplier = numericValue(workload, 'peakViewerMultiplier');
  const globalRegions = numericValue(workload, 'globalRegions');
  const adaptiveBitrate = Boolean(workload.adaptiveBitrate);
  const liveStreaming = Boolean(workload.liveStreaming);

  // --- Playback / delivery ---
  const peakViewers = concurrentViewers * peakViewerMultiplier;
  const peakEgressGbps = (peakViewers * megabitsPerViewerStream) / 1_000;
  const needsCdn = peakEgressGbps > comfortableOriginEgressGbps || globalRegions > 1;
  // With a CDN, a high cache offload spares the origin; without one, origin sees it all.
  const cdnOffloadShare = needsCdn ? 0.95 : 0;
  const originEgressGbps = peakEgressGbps * (1 - cdnOffloadShare);

  // --- Ingest / transcode ---
  const sourceMinutesPerDay = uploadsPerDay * avgVideoMinutes;
  const transcodeMinutesPerDay =
    sourceMinutesPerDay * transcodeProfiles * transcodeMinutesPerSourceMinute;
  // Convert daily compute into a sustained per-second worker-minutes demand.
  const transcodeMinutesPerSecond = transcodeMinutesPerDay / 86_400;
  const requiredWorkers = transcodeMinutesPerSecond / comfortableTranscodeMinutesPerWorker;
  const needsTranscodePipeline = requiredWorkers > 1 || liveStreaming;

  // --- Storage ---
  const megabytesPerSource = avgVideoMinutes * sourceMegabytesPerMinute;
  const megabytesPerVideo =
    megabytesPerSource * (1 + transcodeProfiles * renditionSizeFactor);
  const objectStorageTerabytes = (catalogSize * megabytesPerVideo) / 1_000_000_000;
  const needsObjectStorage =
    objectStorageTerabytes > comfortableObjectStorageTerabytes || catalogSize > 50_000_000;

  // --- Metadata ---
  // A manifest fetch plus a metadata read per fresh playback session.
  const metadataQps = peakViewers * 0.2 + catalogSize / 1_000_000;
  const needsMetadataShard = metadataQps > comfortableMetadataQps || catalogSize > 100_000_000;

  // --- Geo / multi-CDN ---
  const needsMultiRegion = globalRegions > 1 || peakEgressGbps > comfortableOriginEgressGbps * 20;
  const geoPressure = Math.max(
    (globalRegions - 1) / 4,
    peakEgressGbps / (comfortableOriginEgressGbps * 40),
  );

  const flags = {
    needsCdn,
    needsTranscodePipeline,
    adaptiveBitrate,
    needsObjectStorage,
    needsMetadataShard,
    needsMultiRegion,
    liveStreaming,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      viewer: 'ok',
      uploader: 'ok',
      cdn: needsCdn ? 'needed' : 'inactive',
      multiCdn: needsMultiRegion ? 'needed' : 'inactive',
      uploadApi: 'ok',
      packager: adaptiveBitrate ? 'needed' : 'inactive',
      queue: needsTranscodePipeline ? 'needed' : 'inactive',
      workers: needsTranscodePipeline ? (requiredWorkers > 200 ? 'overloaded' : 'needed') : 'inactive',
      liveEncoder: liveStreaming ? 'needed' : 'inactive',
      objectStore: needsObjectStorage ? 'warning' : 'ok',
      metadataDb: needsMetadataShard ? 'warning' : 'ok',
    },
    flowStates: {
      viewerToCdn: needsCdn ? 'active' : 'inactive',
      cdnToUploadApi: needsCdn ? 'active' : 'inactive',
      cdnToMultiCdn: needsMultiRegion ? 'active' : 'inactive',
      uploaderToUploadApi: 'active',
      uploadApiToQueue: needsTranscodePipeline ? 'active' : 'inactive',
      uploadApiToMetadataDb: 'active',
      uploadApiToPackager: adaptiveBitrate ? 'active' : 'inactive',
      queueToWorkers: needsTranscodePipeline ? 'active' : 'inactive',
      queueToLiveEncoder: liveStreaming ? 'active' : 'inactive',
      workersToObjectStore: needsTranscodePipeline ? 'active' : 'inactive',
      cdnToObjectStore: needsCdn ? 'active' : 'inactive',
    },
    meters: {
      cdnOffload: {
        ratio: originEgressGbps / comfortableOriginEgressGbps,
        valueText: `${formatRate(originEgressGbps)} Gbps origin`,
        copy: needsCdn
          ? `CDN 服务可缓存的大头；峰值 ${formatRate(peakEgressGbps)} Gbps 里，origin 仍要推大约 ${formatRate(originEgressGbps)} Gbps 的 miss。`
          : `每个观众都从 origin 拉流：峰值 ${formatRate(peakEgressGbps)} Gbps，没有 edge 来 offload。`,
      },
      transcodeBacklog: {
        ratio: requiredWorkers / 1,
        valueText: `${formatCount(Math.ceil(requiredWorkers))} 个 worker`,
        copy: needsTranscodePipeline
          ? `每天 ${formatCount(uploadsPerDay)} 上传 x ${Math.round(transcodeProfiles)} 档 profile，需要 ~${formatCount(Math.ceil(requiredWorkers))} 个编码 worker 来消化一个 queue。`
          : 'Ingest 足够轻，可以 inline transcode；还用不上 queue 或 worker farm。',
      },
      objectStorage: {
        ratio: objectStorageTerabytes / comfortableObjectStorageTerabytes,
        valueText: formatStorageGigabytes(objectStorageTerabytes * 1_000),
        copy: `${formatCount(catalogSize)} 个视频 x 源加 ${Math.round(transcodeProfiles)} 档 rendition，都落进 object storage。`,
      },
      metadataQps: {
        ratio: metadataQps / comfortableMetadataQps,
        valueText: `${formatRate(metadataQps)}/s`,
        copy: needsMetadataShard
          ? `${formatCount(catalogSize)} 行之上 ${formatRate(metadataQps)}/s 的 manifest 和 metadata 读，超出单个 DB 节点。`
          : `Metadata 读在 ${formatRate(metadataQps)}/s 上下——单个数据库轻松撑住。`,
      },
      deliveryLatency: {
        ratio: geoPressure,
        valueText: `${formatCount(globalRegions)} 个 region`,
        copy:
          needsMultiRegion
            ? '全球受众加峰值尖峰，把分发推向多个 region 和 CDN，换取启动延迟和容量。'
            : '单个 region、本地流量，暂时不需要 multi-region 或 multi-CDN 分发。',
      },
    },
    decisions: buildDecisions({
      ...flags,
      requiredWorkers,
      peakEgressGbps,
      originEgressGbps,
      metadataQps,
      objectStorageTerabytes,
      uploadsPerDay,
      transcodeProfiles,
    }),
    reasons: buildReasons({
      ...flags,
      requiredWorkers,
      peakEgressGbps,
      originEgressGbps,
      peakViewers,
      metadataQps,
      objectStorageTerabytes,
      catalogSize,
      uploadsPerDay,
      transcodeProfiles,
      globalRegions,
    }),
  };
}

type ArchitectureFlags = {
  needsCdn: boolean;
  needsTranscodePipeline: boolean;
  adaptiveBitrate: boolean;
  needsObjectStorage: boolean;
  needsMetadataShard: boolean;
  needsMultiRegion: boolean;
  liveStreaming: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    requiredWorkers: number;
    peakEgressGbps: number;
    originEgressGbps: number;
    peakViewers: number;
    metadataQps: number;
    objectStorageTerabytes: number;
    catalogSize: number;
    uploadsPerDay: number;
    transcodeProfiles: number;
    globalRegions: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsCdn) {
    reasons.push({
      severity: analysis.peakEgressGbps > comfortableOriginEgressGbps * 10 ? 'danger' : 'warning',
      text: `${formatCount(analysis.peakViewers)} 峰值观众推出 ~${formatRate(
        analysis.peakEgressGbps,
      )} Gbps；用 CDN 服务可缓存的 segment，让 origin 只处理 miss。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Playback egress 足够低，origin 不用 CDN 也能直接服务视频文件。',
    });
  }

  if (analysis.needsTranscodePipeline) {
    reasons.push({
      severity: analysis.requiredWorkers > 200 ? 'danger' : 'warning',
      text: `每天 ${formatCount(analysis.uploadsPerDay)} 上传 x ${Math.round(
        analysis.transcodeProfiles,
      )} 档 rendition，需要 ~${formatCount(
        Math.ceil(analysis.requiredWorkers),
      )} 个编码 worker 挂在 queue 后面，而非 inline transcoding。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Ingest 量足够小，可以 inline transcode；还用不上 job queue 或 worker farm。',
    });
  }

  if (analysis.adaptiveBitrate) {
    reasons.push({
      severity: 'ok',
      text: 'Adaptive bitrate 把 rendition 打包成 HLS/DASH，让 player 按带宽切换画质。',
    });
  }

  if (analysis.needsObjectStorage) {
    reasons.push({
      severity: analysis.objectStorageTerabytes > comfortableObjectStorageTerabytes * 4 ? 'danger' : 'warning',
      text: `${formatCount(analysis.catalogSize)} 个视频连同所有 rendition 达到 ~${formatStorageGigabytes(
        analysis.objectStorageTerabytes * 1_000,
      )}；把字节留在独立于计算扩展的 object storage 里。`,
    });
  }

  if (analysis.needsMetadataShard) {
    reasons.push({
      severity: 'warning',
      text: `大 catalog 之上 ${formatRate(
        analysis.metadataQps,
      )}/s 的 manifest 和 metadata 读超出单个 DB 节点；shard 或迁到一个可扩展的 store。`,
    });
  }

  if (analysis.needsMultiRegion) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.globalRegions)} 个 region 加峰值尖峰，把分发推向多个 region 和 CDN，换取启动延迟和容量。`,
    });
  }

  if (analysis.liveStreaming) {
    reasons.push({
      severity: 'warning',
      text: 'Live streaming 需要一条没有重编码机会的实时编码路径，独立于批处理的文件 pipeline。',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    requiredWorkers: number;
    peakEgressGbps: number;
    originEgressGbps: number;
    metadataQps: number;
    objectStorageTerabytes: number;
    uploadsPerDay: number;
    transcodeProfiles: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    cdn: {
      state: flags.needsCdn ? 'needed' : 'not-yet',
      copy: flags.needsCdn
        ? `在 edge 缓存 segment；CDN 吸收可缓存的大头，origin 只服务 ~${formatRate(
            flags.originEgressGbps,
          )} Gbps 的 miss。`
        : '还不需要 CDN——origin 直接服务这点不大的 playback egress。',
    },
    transcodePipeline: {
      state: flags.needsTranscodePipeline ? 'needed' : 'not-yet',
      copy: flags.needsTranscodePipeline
        ? `把 transcode job 入队，跑 ~${formatCount(
            Math.ceil(flags.requiredWorkers),
          )} 个弹性编码 worker，让 ingest 峰值异步消化。`
        : '上传少时 inline transcoding 没问题；queue 和 worker farm 还为时过早。',
    },
    adaptiveBitrate: {
      state: flags.adaptiveBitrate ? 'useful' : 'not-yet',
      copy: flags.adaptiveBitrate
        ? '把 HLS/DASH rendition 打包好，让 player 切换 bitrate 适配每个观众的带宽。'
        : '单档 rendition 原样服务；不需要切画质时就不做 ABR 打包。',
    },
    objectStorage: {
      state: flags.needsObjectStorage ? 'needed' : 'useful',
      copy: flags.needsObjectStorage
        ? `把源和 rendition（~${formatStorageGigabytes(
            flags.objectStorageTerabytes * 1_000,
          )}）放进 object storage，它的存储和持久性独立于计算扩展。`
        : 'Object storage 存源和 rendition；体量还能轻松放进单层。',
    },
    metadataStore: {
      state: flags.needsMetadataShard ? 'needed' : 'useful',
      copy: flags.needsMetadataShard
        ? `Shard metadata store（或用一个可横向扩展的 DB）来吸收 ${formatRate(
            flags.metadataQps,
          )}/s 的 manifest 和 catalog 读。`
        : 'QPS 和行数都还不大时，单个 metadata 数据库就能服务 manifest 和 catalog 查询。',
    },
    multiRegion: {
      state: flags.needsMultiRegion ? 'needed' : 'not-yet',
      copy: flags.needsMultiRegion
        ? '复制到多个 region，并把分发铺到多个 CDN，换取全球启动延迟和峰值容量。'
        : '受众本地、峰值不大时，一个 region 后面挂一个 CDN 就够了。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsCdn && !flags.needsTranscodePipeline && !flags.needsObjectStorage) {
    return 'Single box: transcode + serve';
  }
  if (flags.needsMultiRegion && (flags.needsObjectStorage || flags.needsMetadataShard)) {
    return 'Multi-region CDN + transcode farm + sharded storage';
  }
  if (flags.needsTranscodePipeline && flags.needsObjectStorage) {
    return 'CDN delivery + transcode farm + object storage';
  }
  if (flags.needsCdn) {
    return 'CDN offload + single origin';
  }
  return 'Single box: transcode + serve';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsCdn && !flags.needsTranscodePipeline && !flags.needsObjectStorage) {
    return '一台服务器 inline transcode 上传并直接服务文件。这个规模下再多就没必要了。';
  }
  if (flags.needsMultiRegion && (flags.needsObjectStorage || flags.needsMetadataShard)) {
    return 'Multi-region multi-CDN 分发挡在一个由 queue 喂料的 transcode farm 前面，媒体放 object storage、catalog 行放 sharded metadata store；live 跑在自己专属的实时路径上。';
  }
  if (flags.needsTranscodePipeline && flags.needsObjectStorage) {
    return 'CDN offload 掉 playback，同时 queue 加 worker farm 把上传异步 transcode 进 object storage，与 metadata 数据库分开。';
  }
  if (flags.needsCdn) {
    return 'CDN 吸收可缓存的 playback 流量，于是单个 origin 只服务 miss，并处理这点不大的 ingest。';
  }
  return '一台服务器仍然兼管 ingest 和 playback。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsCdn && !flags.needsTranscodePipeline && !flags.needsObjectStorage) {
    return 'Upload -> transcode inline -> serve from one box';
  }
  if (flags.needsMultiRegion && (flags.needsObjectStorage || flags.needsMetadataShard)) {
    return 'Play -> multi-CDN -> origin (miss); Upload -> queue -> workers -> object store';
  }
  if (flags.needsTranscodePipeline && flags.needsObjectStorage) {
    return 'Play -> CDN -> origin (miss); Upload -> queue -> workers -> object store';
  }
  if (flags.needsCdn) {
    return 'Play -> CDN -> origin (miss); Upload -> API -> transcode';
  }
  return 'Upload -> transcode inline -> serve from one box';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
