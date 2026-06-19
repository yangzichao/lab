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
  eyebrow: 'System Design Lab',
  title:
    'A video platform is really two systems: a compute-heavy transcode pipeline on ingest and a massively read-heavy CDN on playback.',
  summary:
    'Change uploads per day, average video length, concurrent viewers, catalog size, how many bitrate renditions you encode, the peak multiplier, and regions. The design moves from a single box that serves files directly, to CDN offload, to a queue plus a transcode worker farm, to sharded object storage with a separate metadata store, and finally to multi-region multi-CDN delivery.',
  controls: [
    {
      id: 'uploadsPerDay',
      label: 'Uploads per day',
      help: 'New source videos submitted daily; each one fans out into a transcode job per profile.',
      min: 10,
      max: 5_000_000,
      defaultValue: 1_000,
      scale: 'log',
      unit: 'videos',
      format: 'count',
    },
    {
      id: 'avgVideoMinutes',
      label: 'Average video length',
      help: 'Mean runtime of a source video; drives both storage size and transcode compute.',
      min: 1,
      max: 180,
      defaultValue: 10,
      scale: 'log',
      unit: 'min',
      format: 'count',
    },
    {
      id: 'concurrentViewers',
      label: 'Concurrent viewers',
      help: 'Playback sessions streaming at once; the dominant, read-heavy delivery load.',
      min: 10,
      max: 50_000_000,
      defaultValue: 5_000,
      scale: 'log',
      unit: 'viewers',
      format: 'count',
    },
    {
      id: 'catalogSize',
      label: 'Catalog size',
      help: 'Total videos stored across all renditions; drives object storage and metadata rows.',
      min: 1_000,
      max: 10_000_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: 'videos',
      format: 'count',
    },
    {
      id: 'transcodeProfiles',
      label: 'Bitrate renditions',
      help: 'Resolutions/bitrates encoded per video (e.g. 240p…4K); multiplies ingest compute.',
      min: 1,
      max: 12,
      defaultValue: 5,
      scale: 'linear',
      unit: 'profiles',
      format: 'count',
    },
    {
      id: 'peakViewerMultiplier',
      label: 'Peak multiplier',
      help: 'How much concurrent viewers spike at peak over the average (prime time, a viral hit).',
      min: 1,
      max: 20,
      defaultValue: 3,
      scale: 'linear',
      format: 'multiplier',
    },
    {
      id: 'globalRegions',
      label: 'Regions',
      help: 'Regions that should serve playback close to the viewer with low startup latency.',
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
      id: 'adaptiveBitrate',
      label: 'Adaptive bitrate (ABR)',
      help: 'Package HLS/DASH segments so players switch renditions to match bandwidth.',
      defaultValue: true,
    },
    {
      id: 'liveStreaming',
      label: 'Live streaming',
      help: 'Ingest and transcode live in real time, with no second chance to re-encode.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-box',
      step: '01',
      title: 'Clips on one box',
      summary: 'A few uploads and a handful of viewers served straight from one server.',
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
      summary: 'Playback dwarfs ingest; the origin cannot push the egress alone.',
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
      summary: 'A wave of creators overwhelms inline transcoding.',
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
      summary: 'Storage and metadata both outgrow a single node.',
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
      summary: 'Tens of millions watch worldwide, including real-time live events.',
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
    title: 'Video streaming platform architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a video platform: clients, edge CDN delivery, an upload and API tier, a transcode queue with a worker farm, and object storage with a metadata database.',
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
            summary: 'requests a manifest and streams video segments, switching bitrate as bandwidth changes',
          },
          {
            id: 'uploader',
            title: 'Uploader',
            subtitle: 'creator',
            summary: 'submits a new source video to be transcoded and published',
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
            subtitle: 'serves segments',
            summary: 'caches video segments at the edge so the origin is spared the bulk of playback egress',
          },
          {
            id: 'multiCdn',
            title: 'Multi-CDN',
            subtitle: 'global delivery',
            summary: 'spreads delivery across regions and providers for capacity and low startup latency',
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
            summary: 'accepts uploads, serves manifests, and resolves metadata for playback',
          },
          {
            id: 'packager',
            title: 'Packager',
            subtitle: 'HLS / DASH',
            summary: 'segments and packages renditions into adaptive manifests for the player',
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
            subtitle: 'async work',
            summary: 'buffers transcode jobs so ingest spikes never block uploads or playback',
          },
          {
            id: 'workers',
            title: 'Worker farm',
            subtitle: 'encode renditions',
            summary: 'fans one source video into every bitrate rendition in parallel',
          },
          {
            id: 'liveEncoder',
            title: 'Live encoder',
            subtitle: 'real-time',
            summary: 'transcodes live ingest in real time with no chance to re-encode',
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
            subtitle: 'video files',
            summary: 'durably holds source videos and every encoded rendition as the playback origin',
          },
          {
            id: 'metadataDb',
            title: 'Metadata DB',
            subtitle: 'catalog rows',
            summary: 'stores titles, manifests, and per-video metadata that playback looks up',
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
    { id: 'transcodeBacklog', label: 'Transcode backlog' },
    { id: 'objectStorage', label: 'Object storage size' },
    { id: 'metadataQps', label: 'Metadata QPS' },
    { id: 'deliveryLatency', label: 'Global delivery latency' },
  ],
  decisions: [
    { id: 'cdn', title: 'CDN delivery' },
    { id: 'transcodePipeline', title: 'Transcode pipeline' },
    { id: 'adaptiveBitrate', title: 'Adaptive bitrate' },
    { id: 'objectStorage', title: 'Object storage' },
    { id: 'metadataStore', title: 'Metadata store' },
    { id: 'multiRegion', title: 'Multi-region / multi-CDN' },
  ],
  sourceBackedRules: [
    {
      title: 'Streaming video is delivered from CDN caches, not the origin',
      source: 'AWS CloudFront',
      url: 'https://aws.amazon.com/cloudfront/',
      summary:
        'A CDN caches segments at edge locations near viewers; the origin only serves cache misses, which is the only way playback egress scales.',
    },
    {
      title: 'Adaptive bitrate streaming packages multiple renditions for the player to switch between',
      source: 'Apple HTTP Live Streaming',
      url: 'https://developer.apple.com/streaming/',
      summary:
        'HLS (and DASH) describe a media playlist of segmented renditions so the player picks a bitrate that fits current bandwidth; this is why ingest must encode several profiles.',
    },
    {
      title: 'Transcoding is run as asynchronous jobs on a worker farm fed by a queue',
      source: 'AWS Elemental MediaConvert',
      url: 'https://aws.amazon.com/mediaconvert/',
      summary:
        'File-based transcoding is submitted as jobs and processed by elastic workers, so upload spikes queue up instead of blocking the request path.',
    },
    {
      title: 'Object storage is the durable, scalable origin for media files',
      source: 'Amazon S3',
      url: 'https://aws.amazon.com/s3/',
      summary:
        'Source videos and every rendition live in object storage, which scales storage and durability independently of the compute and serving tiers.',
    },
  ],
  teachingAssumptions: [
    'Playback bandwidth is modeled as concurrentViewers x peak multiplier x ~5 Mbps; CDN offload assumes hot content caches well at the edge.',
    'Transcode compute is approximated as profiles x source minutes x a fixed factor per worker; real encoders vary by codec and resolution.',
    'Storage counts source plus renditions per video; single-node QPS, egress, and storage budgets are conservative teaching numbers, not vendor limits.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-box',
      step: '01',
      focus: 'Clips on one box',
      scenarioId: 'single-box',
      question:
        'A small site has 50 uploads/day, one rendition, and ~200 viewers. Do you need a CDN, a queue, or a worker farm yet?',
      reveal:
        'No. One server can transcode a few short clips inline and serve the files directly; 200 viewers at a few Mbps is well under one box of egress. A CDN, a job queue, and a worker farm would all be premature — moving parts with no load to justify them.',
      takeaway: 'Start simple: one box that transcodes inline and serves files directly is correct at small scale.',
    },
    {
      id: 'viewers',
      step: '02',
      focus: 'Viewers take off',
      scenarioId: 'viewers-grow',
      question:
        'Uploads are still modest, but concurrent viewers jump to 200k at a 4x peak. What saturates first, and what is the cheapest fix?',
      reveal:
        'Origin egress saturates long before anything else — 200k viewers at peak is hundreds of Gbps. Playback segments are highly cacheable, so a CDN offloads almost all of it and the origin only serves misses. This also forces adaptive bitrate so weak connections still play.',
      takeaway: 'Playback is read-heavy and cacheable; a CDN, not bigger origins, is how delivery scales.',
    },
    {
      id: 'uploads',
      step: '03',
      focus: 'Uploads flood in',
      scenarioId: 'uploads-grow',
      question:
        'Now 200k uploads/day arrive, each fanned into 6 renditions. Why not just transcode every upload inline on the API server?',
      reveal:
        'Transcoding is compute-heavy and bursty: 6 profiles x minutes of video x many uploads far exceeds inline capacity, and a spike would block the request path. Put jobs on a queue and process them on an elastic worker farm, so ingest spikes drain over time instead of failing uploads.',
      takeaway: 'Decouple ingest from compute: a queue plus a worker farm absorbs transcode spikes asynchronously.',
    },
    {
      id: 'catalog',
      step: '04',
      focus: 'Huge catalog',
      scenarioId: 'huge-catalog',
      question:
        '800M videos x several renditions is petabytes, and metadata lookups climb with viewers. Can one storage node and one DB hold that?',
      reveal:
        'No. Media belongs in object storage that scales independently of compute, and the metadata — titles, manifests, view state — outgrows a single database, so it shards or moves to a horizontally scalable store. Only metadata hits your DB; the bytes stay in object storage behind the CDN.',
      takeaway: 'Separate the bytes from the metadata: object storage for files, a sharded store for catalog rows.',
    },
    {
      id: 'global',
      step: '05',
      focus: 'Global + live',
      scenarioId: 'global-live',
      question:
        'Tens of millions watch worldwide, including live events with a 10x peak. Is one region behind one CDN enough?',
      reveal:
        'No — a single region cannot serve global startup latency or absorb a viral/live peak, so you replicate to multiple regions and spread delivery across multiple CDNs. Live adds a real-time encoding path with no re-encode safety net, which is why it runs on its own low-latency pipeline.',
      takeaway: 'For global low-latency and live, go multi-region, multi-CDN, and give live its own real-time path.',
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
          ? `The CDN serves the cacheable bulk; the origin still pushes about ${formatRate(originEgressGbps)} Gbps of misses out of ${formatRate(peakEgressGbps)} Gbps at peak.`
          : `Every viewer streams from the origin: ${formatRate(peakEgressGbps)} Gbps at peak with no edge to offload it.`,
      },
      transcodeBacklog: {
        ratio: requiredWorkers / 1,
        valueText: `${formatCount(Math.ceil(requiredWorkers))} ${pluralize('worker', requiredWorkers)}`,
        copy: needsTranscodePipeline
          ? `${formatCount(uploadsPerDay)} uploads/day x ${Math.round(transcodeProfiles)} profiles needs ~${formatCount(Math.ceil(requiredWorkers))} encode ${pluralize('worker', requiredWorkers)} draining a queue.`
          : 'Ingest is light enough to transcode inline; no queue or worker farm is justified yet.',
      },
      objectStorage: {
        ratio: objectStorageTerabytes / comfortableObjectStorageTerabytes,
        valueText: formatStorageGigabytes(objectStorageTerabytes * 1_000),
        copy: `${formatCount(catalogSize)} videos x source plus ${Math.round(transcodeProfiles)} renditions land in object storage.`,
      },
      metadataQps: {
        ratio: metadataQps / comfortableMetadataQps,
        valueText: `${formatRate(metadataQps)}/s`,
        copy: needsMetadataShard
          ? `${formatRate(metadataQps)}/s of manifest and metadata reads over ${formatCount(catalogSize)} rows outgrows one DB node.`
          : `Metadata reads sit around ${formatRate(metadataQps)}/s — comfortable for a single database.`,
      },
      deliveryLatency: {
        ratio: geoPressure,
        valueText: `${formatCount(globalRegions)} ${pluralize('region', globalRegions)}`,
        copy:
          needsMultiRegion
            ? 'A global audience and peak spikes push delivery toward multiple regions and CDNs for startup latency and capacity.'
            : 'A single region with local traffic needs no multi-region or multi-CDN delivery yet.',
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
      text: `${formatCount(analysis.peakViewers)} peak viewers push ~${formatRate(
        analysis.peakEgressGbps,
      )} Gbps; serve cacheable segments from a CDN so the origin only handles misses.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Playback egress is low enough that the origin can serve video files directly without a CDN.',
    });
  }

  if (analysis.needsTranscodePipeline) {
    reasons.push({
      severity: analysis.requiredWorkers > 200 ? 'danger' : 'warning',
      text: `${formatCount(analysis.uploadsPerDay)} uploads/day x ${Math.round(
        analysis.transcodeProfiles,
      )} renditions needs ~${formatCount(
        Math.ceil(analysis.requiredWorkers),
      )} encode workers behind a queue, not inline transcoding.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Ingest volume is small enough to transcode inline; no job queue or worker farm is justified yet.',
    });
  }

  if (analysis.adaptiveBitrate) {
    reasons.push({
      severity: 'ok',
      text: 'Adaptive bitrate packages renditions into HLS/DASH so players switch quality to match bandwidth.',
    });
  }

  if (analysis.needsObjectStorage) {
    reasons.push({
      severity: analysis.objectStorageTerabytes > comfortableObjectStorageTerabytes * 4 ? 'danger' : 'warning',
      text: `${formatCount(analysis.catalogSize)} videos with all renditions reach ~${formatStorageGigabytes(
        analysis.objectStorageTerabytes * 1_000,
      )}; keep the bytes in object storage that scales apart from compute.`,
    });
  }

  if (analysis.needsMetadataShard) {
    reasons.push({
      severity: 'warning',
      text: `${formatRate(
        analysis.metadataQps,
      )}/s of manifest and metadata reads over a large catalog outgrows one DB node; shard or move to a scalable store.`,
    });
  }

  if (analysis.needsMultiRegion) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.globalRegions)} ${pluralize(
        'region',
        analysis.globalRegions,
      )} and peak spikes push delivery to multiple regions and CDNs for startup latency and capacity.`,
    });
  }

  if (analysis.liveStreaming) {
    reasons.push({
      severity: 'warning',
      text: 'Live streaming needs a real-time encoding path with no chance to re-encode, separate from the batch file pipeline.',
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
        ? `Cache segments at the edge; the CDN absorbs the cacheable bulk and the origin only serves ~${formatRate(
            flags.originEgressGbps,
          )} Gbps of misses.`
        : 'No CDN yet — the origin serves the modest playback egress directly.',
    },
    transcodePipeline: {
      state: flags.needsTranscodePipeline ? 'needed' : 'not-yet',
      copy: flags.needsTranscodePipeline
        ? `Queue transcode jobs and run ~${formatCount(
            Math.ceil(flags.requiredWorkers),
          )} elastic encode workers so ingest spikes drain asynchronously.`
        : 'Inline transcoding is fine while uploads are few; a queue and worker farm would be premature.',
    },
    adaptiveBitrate: {
      state: flags.adaptiveBitrate ? 'useful' : 'not-yet',
      copy: flags.adaptiveBitrate
        ? 'Package HLS/DASH renditions so the player switches bitrate to match each viewer’s bandwidth.'
        : 'A single rendition is served as-is; no ABR packaging while quality switching is not needed.',
    },
    objectStorage: {
      state: flags.needsObjectStorage ? 'needed' : 'useful',
      copy: flags.needsObjectStorage
        ? `Store source and renditions (~${formatStorageGigabytes(
            flags.objectStorageTerabytes * 1_000,
          )}) in object storage that scales storage and durability apart from compute.`
        : 'Object storage holds source and renditions; the footprint still fits comfortably on one tier.',
    },
    metadataStore: {
      state: flags.needsMetadataShard ? 'needed' : 'useful',
      copy: flags.needsMetadataShard
        ? `Shard the metadata store (or use a horizontally scalable DB) to absorb ${formatRate(
            flags.metadataQps,
          )}/s of manifest and catalog reads.`
        : 'A single metadata database serves manifest and catalog lookups while QPS and row count stay modest.',
    },
    multiRegion: {
      state: flags.needsMultiRegion ? 'needed' : 'not-yet',
      copy: flags.needsMultiRegion
        ? 'Replicate to multiple regions and spread delivery across CDNs for global startup latency and peak capacity.'
        : 'A single region behind one CDN is enough while the audience is local and peaks are modest.',
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
    return 'One server transcodes uploads inline and serves the files directly. Nothing more is justified at this scale.';
  }
  if (flags.needsMultiRegion && (flags.needsObjectStorage || flags.needsMetadataShard)) {
    return 'Multi-region multi-CDN delivery fronts a queue-fed transcode farm, with media in object storage and catalog rows in a sharded metadata store; live runs on its own real-time path.';
  }
  if (flags.needsTranscodePipeline && flags.needsObjectStorage) {
    return 'A CDN offloads playback while a queue and worker farm transcode uploads asynchronously into object storage, separate from the metadata database.';
  }
  if (flags.needsCdn) {
    return 'A CDN absorbs the cacheable playback traffic so a single origin only serves misses and handles the modest ingest.';
  }
  return 'One server still covers both ingest and playback.';
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

function pluralize(unit: string, value: number): string {
  return Math.round(value) === 1 ? unit : `${unit}s`;
}
