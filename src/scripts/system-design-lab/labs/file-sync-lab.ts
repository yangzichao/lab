import { buildColumnDiagram } from '../diagram-layout';
import {
  formatCount,
  formatKilobytes,
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

const metadataBytesPerFile = 1_000;
const comfortableMetadataReadsPerSecond = 30_000;
const comfortableMetadataStorageGigabytes = 800;
const comfortableNotificationFanout = 50_000;
const comfortableBlockStorageGigabytes = 400_000;
const dedupSavingsFraction = 0.4;

export const fileSyncLabDefinition: SystemDesignLabDefinition = {
  id: 'file-sync',
  eyebrow: 'System Design Lab',
  title:
    'File sync is two systems wearing one coat: a chatty metadata service and a fat block store that scale on different axes.',
  summary:
    'Change active users, files per user, file size, edit rate, devices per user, chunk size, and regions. The design grows from one box to a notification service that pushes changes to every device, content-addressed chunking with dedup, a sharded metadata database, and multi-region block replication for sharing and collaboration.',
  controls: [
    {
      id: 'activeUsers',
      label: 'Active users',
      help: 'Users actively syncing files; each runs one or more devices that poll or hold a connection.',
      min: 100,
      max: 500_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: 'users',
      format: 'count',
    },
    {
      id: 'filesPerUser',
      label: 'Files per user',
      help: 'Average tracked files per user; drives metadata rows and the file tree the client mirrors.',
      min: 50,
      max: 1_000_000,
      defaultValue: 5_000,
      scale: 'log',
      unit: 'files',
      format: 'count',
    },
    {
      id: 'avgFileSizeKb',
      label: 'Average file size',
      help: 'Mean file size; large files are why we split into chunks instead of storing whole blobs.',
      min: 4,
      max: 4_194_304,
      defaultValue: 512,
      scale: 'log',
      format: 'kilobytes',
    },
    {
      id: 'editsPerSecond',
      label: 'Edits per second',
      help: 'Global rate of saves and uploads; each edit writes chunks and fans a change out to other devices.',
      min: 1,
      max: 2_000_000,
      defaultValue: 5_000,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'devicesPerUser',
      label: 'Devices per user',
      help: 'Laptops, phones, and tablets per user; each must be told when a file changes.',
      min: 1,
      max: 12,
      defaultValue: 3,
      scale: 'linear',
      unit: 'devices',
      format: 'count',
    },
    {
      id: 'chunkSizeKb',
      label: 'Chunk size',
      help: 'Size of each content-addressed block; smaller chunks dedup better but multiply metadata.',
      min: 64,
      max: 16_384,
      defaultValue: 4_096,
      scale: 'log',
      format: 'kilobytes',
    },
    {
      id: 'globalRegions',
      label: 'Regions',
      help: 'Regions that should hold replicas so devices upload and download close to home.',
      min: 1,
      max: 16,
      defaultValue: 1,
      scale: 'linear',
      unit: 'regions',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'blockLevelDedup',
      label: 'Block-level dedup',
      help: 'Store each unique chunk once across users and versions; trades a chunk index for big storage savings.',
      defaultValue: true,
    },
    {
      id: 'fileSharing',
      label: 'Sharing + collaboration',
      help: 'Let users share folders and edit concurrently; introduces permissions and conflict versioning.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'personal-sync',
      step: '01',
      title: 'Personal sync',
      summary: 'One user, one device, a folder kept in sync.',
      values: {
        activeUsers: 500,
        filesPerUser: 2_000,
        avgFileSizeKb: 256,
        editsPerSecond: 5,
        devicesPerUser: 1,
        chunkSizeKb: 4_096,
        globalRegions: 1,
        blockLevelDedup: false,
        fileSharing: false,
      },
    },
    {
      id: 'many-devices',
      step: '02',
      title: 'Many devices',
      summary: 'Every user runs several devices that all want updates fast.',
      values: {
        activeUsers: 200_000,
        filesPerUser: 4_000,
        avgFileSizeKb: 512,
        editsPerSecond: 2_000,
        devicesPerUser: 4,
        chunkSizeKb: 4_096,
        globalRegions: 1,
        blockLevelDedup: false,
        fileSharing: false,
      },
    },
    {
      id: 'large-files',
      step: '03',
      title: 'Large files',
      summary: 'Big media files make whole-blob uploads wasteful.',
      values: {
        activeUsers: 2_000_000,
        filesPerUser: 8_000,
        avgFileSizeKb: 65_536,
        editsPerSecond: 40_000,
        devicesPerUser: 4,
        chunkSizeKb: 4_096,
        globalRegions: 2,
        blockLevelDedup: true,
        fileSharing: false,
      },
    },
    {
      id: 'metadata-at-scale',
      step: '04',
      title: 'Metadata at scale',
      summary: 'Billions of files crush one metadata database.',
      values: {
        activeUsers: 50_000_000,
        filesPerUser: 20_000,
        avgFileSizeKb: 8_192,
        editsPerSecond: 400_000,
        devicesPerUser: 5,
        chunkSizeKb: 4_096,
        globalRegions: 3,
        blockLevelDedup: true,
        fileSharing: false,
      },
    },
    {
      id: 'shared-global',
      step: '05',
      title: 'Shared + global',
      summary: 'Shared folders, concurrent edits, users worldwide.',
      values: {
        activeUsers: 300_000_000,
        filesPerUser: 40_000,
        avgFileSizeKb: 16_384,
        editsPerSecond: 1_500_000,
        devicesPerUser: 6,
        chunkSizeKb: 4_096,
        globalRegions: 8,
        blockLevelDedup: true,
        fileSharing: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'File sync and sharing architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a file sync service: client devices, a sync API and notification service, a metadata service with a chunk index, block and object storage, and an async indexing and notification fan-out path.',
    columns: [
      {
        id: 'clients',
        label: 'Devices',
        variant: 'clients',
        nodes: [
          {
            id: 'device',
            title: 'Client device',
            subtitle: 'watch + sync',
            summary: 'watches the local folder, uploads changed chunks, and applies remote changes',
          },
        ],
      },
      {
        id: 'edge',
        label: 'Sync API',
        variant: 'edge',
        nodes: [
          {
            id: 'syncApi',
            title: 'Sync API',
            subtitle: 'upload + download',
            summary: 'handles chunk uploads and downloads and commits file changes',
          },
          {
            id: 'notifier',
            title: 'Notification',
            subtitle: 'long-poll + push',
            summary: 'tells every other device of a user when a file changes so it can pull',
          },
        ],
      },
      {
        id: 'metadata',
        label: 'Metadata',
        variant: 'backbone',
        nodes: [
          {
            id: 'metadataService',
            title: 'Metadata svc',
            subtitle: 'tree + versions',
            summary: 'stores the file tree, versions, and permissions; the chatty source of truth',
          },
          {
            id: 'chunkIndex',
            title: 'Chunk index',
            subtitle: 'hash to block',
            summary: 'maps content hashes to stored blocks so identical chunks are stored once',
          },
        ],
      },
      {
        id: 'storage',
        label: 'Block store',
        variant: 'storage',
        nodes: [
          {
            id: 'blockStore',
            title: 'Block store',
            subtitle: 'object storage',
            summary: 'durable content-addressed store of every unique file chunk',
          },
          {
            id: 'replicas',
            title: 'Replicas',
            subtitle: 'multi-region',
            summary: 'copies blocks across regions so uploads and downloads stay local',
          },
        ],
      },
      {
        id: 'async',
        label: 'Async',
        variant: 'processing',
        nodes: [
          {
            id: 'indexer',
            title: 'Indexer',
            subtitle: 'fan-out + search',
            summary: 'fans change events to devices and builds search and sharing indexes off the hot path',
          },
        ],
      },
    ],
    flows: [
      { from: 'device', to: 'syncApi', variant: 'primary' },
      { from: 'syncApi', to: 'metadataService', variant: 'primary' },
      { from: 'syncApi', to: 'chunkIndex', variant: 'secondary' },
      { from: 'syncApi', to: 'blockStore', variant: 'direct' },
      { from: 'chunkIndex', to: 'blockStore', variant: 'secondary' },
      { from: 'blockStore', to: 'replicas', variant: 'secondary' },
      { from: 'metadataService', to: 'indexer', variant: 'secondary' },
      { from: 'notifier', to: 'indexer', variant: 'secondary' },
      { from: 'device', to: 'notifier', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'metadataQps', label: 'Metadata QPS' },
    { id: 'notificationFanout', label: 'Notification fan-out' },
    { id: 'blockStorage', label: 'Block storage' },
    { id: 'dedupSavings', label: 'Bytes saved by dedup' },
    { id: 'conflictPressure', label: 'Conflict / version pressure' },
  ],
  decisions: [
    { id: 'chunking', title: 'Chunking + dedup' },
    { id: 'storeSplit', title: 'Metadata vs block split' },
    { id: 'notification', title: 'Sync notification' },
    { id: 'metadataSharding', title: 'Metadata sharding' },
    { id: 'replication', title: 'Block replication' },
    { id: 'sharing', title: 'Sharing + conflicts' },
  ],
  sourceBackedRules: [
    {
      title: 'Dropbox separates a metadata service from block storage',
      source: 'Dropbox Engineering',
      url: 'https://dropbox.tech/infrastructure/inside-the-magic-pocket',
      summary:
        'Dropbox runs Magic Pocket as a dedicated exabyte-scale block store while file metadata lives in a separate, differently scaled service.',
    },
    {
      title: 'Files are split into content-addressed blocks',
      source: 'Content-addressable storage',
      url: 'https://en.wikipedia.org/wiki/Content-addressable_storage',
      summary:
        'Content-addressable storage names each block by a hash of its contents, so identical blocks are stored once — the basis for block-level dedup.',
    },
    {
      title: 'Content-defined chunking enables cross-file deduplication',
      source: 'LBFS (SOSP 2001)',
      url: 'https://pdos.csail.mit.edu/papers/lbfs:sosp01/lbfs.pdf',
      summary:
        'The Low-Bandwidth File System showed that hashing variable-size content chunks lets a sync system transfer and store only the chunks that actually changed.',
    },
    {
      title: 'Long-polling lets clients learn of changes promptly without busy polling',
      source: 'MDN Web Docs',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events',
      summary:
        'A held-open request (long-poll or server-sent stream) lets the server notify a device of a change as it happens instead of the device polling on a timer.',
    },
  ],
  teachingAssumptions: [
    'Metadata QPS is approximated from edits and the devices that must be notified per change, not measured traffic.',
    'Single-node metadata read and storage budgets are conservative teaching numbers, not vendor limits.',
    'Dedup savings use a flat fraction of total bytes; real savings depend heavily on how much content is actually shared.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-box',
      step: '01',
      focus: 'One user, one box',
      scenarioId: 'personal-sync',
      question:
        'One person syncs a folder from a single laptop at a few edits per second. Do you need chunking, a notification service, or a separate block store?',
      reveal:
        'No. With one device there is nobody else to notify, edit volume is trivial, and whole-file uploads to one store with metadata in the same database are perfectly fine. Chunking, dedup, and a notification fan-out are all premature.',
      takeaway: 'Start with one app and one store; sync complexity only appears once a second device exists.',
    },
    {
      id: 'devices',
      step: '02',
      focus: 'Many devices per user',
      scenarioId: 'many-devices',
      question:
        'Now each user runs four devices that all expect a changed file within seconds. How should the other devices find out a file changed?',
      reveal:
        'Having every device poll the metadata service on a tight timer multiplies read load by the device count for almost no new data. A notification service (long-poll or push) holds a connection per device and tells it exactly when to pull, so reads track real changes instead of the polling interval.',
      takeaway: 'Push changes through a notification service; do not let idle devices poll the metadata DB.',
    },
    {
      id: 'chunks',
      step: '03',
      focus: 'Large files arrive',
      scenarioId: 'large-files',
      question:
        'Users start syncing large media files and editing a few bytes at a time. Why is re-uploading and re-storing the whole file the wrong move?',
      reveal:
        'Whole-file transfer wastes bandwidth and storage when only one block changed. Split files into content-addressed chunks: the client uploads only changed chunks, and a chunk index lets identical blocks across users and versions be stored once. This is also where metadata and block storage clearly want to be separate systems.',
      takeaway: 'Chunk files by content and dedup blocks; transfer and store only what actually changed.',
    },
    {
      id: 'metadata',
      step: '04',
      focus: 'Metadata at scale',
      scenarioId: 'metadata-at-scale',
      question:
        '50 million users with tens of thousands of files each is a trillion metadata rows and hundreds of thousands of edits per second. Can one metadata database hold and serve that?',
      reveal:
        'No. The block store scales by adding capacity, but the metadata service is the chatty bottleneck: too many rows and too high a QPS for one node. Shard the metadata database (by user or namespace) so the file-tree reads and version writes scale horizontally, independent of block storage.',
      takeaway: 'Metadata and blocks scale on different axes; shard the chatty metadata service first.',
    },
    {
      id: 'global',
      step: '05',
      focus: 'Shared + global',
      scenarioId: 'shared-global',
      question:
        'Shared folders let two people edit the same file at once, and users span the globe. What two new problems appear, and how do you handle them?',
      reveal:
        'Concurrent edits create conflicts: resolve them with versioning (keep both, mark a conflicted copy) rather than silently losing a write, and add permissions for shared folders. Global users need block replicas near them so uploads and downloads stay local while the metadata source of truth stays consistent.',
      takeaway: 'Resolve concurrent edits with versioning, and replicate blocks per region for local transfers.',
    },
  ],
  analyze: analyzeFileSyncWorkload,
};

function analyzeFileSyncWorkload(workload: WorkloadValues): LabAnalysis {
  const activeUsers = numericValue(workload, 'activeUsers');
  const filesPerUser = numericValue(workload, 'filesPerUser');
  const avgFileSizeKb = numericValue(workload, 'avgFileSizeKb');
  const editsPerSecond = numericValue(workload, 'editsPerSecond');
  const devicesPerUser = numericValue(workload, 'devicesPerUser');
  const chunkSizeKb = numericValue(workload, 'chunkSizeKb');
  const globalRegions = numericValue(workload, 'globalRegions');
  const blockLevelDedup = Boolean(workload.blockLevelDedup);
  const fileSharing = Boolean(workload.fileSharing);

  const totalFiles = activeUsers * filesPerUser;
  // Each edit notifies the user's other devices; metadata also serves change polls.
  const notificationFanout = editsPerSecond * Math.max(devicesPerUser - 1, 0);
  const metadataQps = editsPerSecond + notificationFanout;

  const rawBlockStorageGigabytes = (totalFiles * avgFileSizeKb) / 1_000_000;
  const dedupActive = blockLevelDedup;
  const dedupSavedGigabytes = dedupActive ? rawBlockStorageGigabytes * dedupSavingsFraction : 0;
  const blockStorageGigabytes = rawBlockStorageGigabytes - dedupSavedGigabytes;

  const metadataStorageGigabytes = (totalFiles * metadataBytesPerFile) / 1_000_000_000;

  const needsNotification = devicesPerUser > 1 && (editsPerSecond > 50 || activeUsers > 5_000);
  const largeFiles = avgFileSizeKb > chunkSizeKb * 4;
  const needsChunking = largeFiles || blockLevelDedup || editsPerSecond > 10_000;
  const needsMetadataSharding =
    metadataStorageGigabytes > comfortableMetadataStorageGigabytes ||
    metadataQps > comfortableMetadataReadsPerSecond ||
    totalFiles > 5_000_000_000;
  const needsReplication = globalRegions > 1 || blockStorageGigabytes > comfortableBlockStorageGigabytes;
  const needsSharing = fileSharing;
  const conflictPressure = fileSharing ? (editsPerSecond * devicesPerUser) / 4_000_000 : 0;

  const flags = {
    needsNotification,
    needsChunking,
    needsMetadataSharding,
    needsReplication,
    needsSharing,
    dedupActive,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      device: 'ok',
      syncApi: 'ok',
      notifier: needsNotification ? 'needed' : 'inactive',
      metadataService: needsMetadataSharding ? 'warning' : 'ok',
      chunkIndex: needsChunking ? 'needed' : 'inactive',
      blockStore: 'ok',
      replicas: needsReplication ? 'needed' : 'inactive',
      indexer: needsNotification || needsSharing ? 'needed' : 'inactive',
    },
    flowStates: {
      deviceToSyncApi: 'active',
      syncApiToMetadataService: 'active',
      syncApiToChunkIndex: needsChunking ? 'active' : 'inactive',
      syncApiToBlockStore: needsChunking ? 'inactive' : 'active',
      chunkIndexToBlockStore: needsChunking ? 'active' : 'inactive',
      blockStoreToReplicas: needsReplication ? 'active' : 'inactive',
      metadataServiceToIndexer: needsNotification || needsSharing ? 'active' : 'inactive',
      notifierToIndexer: needsNotification ? 'active' : 'inactive',
      deviceToNotifier: needsNotification ? 'active' : 'inactive',
    },
    meters: {
      metadataQps: {
        ratio: metadataQps / comfortableMetadataReadsPerSecond,
        valueText: `${formatRate(metadataQps)}/s`,
        copy: needsNotification
          ? `Edits plus per-device change notifications drive about ${formatRate(metadataQps)}/s against the metadata service.`
          : 'The metadata service serves the file tree and version reads directly at low volume.',
      },
      notificationFanout: {
        ratio: notificationFanout / comfortableNotificationFanout,
        valueText: `${formatRate(notificationFanout)}/s`,
        copy:
          devicesPerUser > 1
            ? `Each edit must reach the user's other ${Math.round(devicesPerUser - 1)} ${pluralize(
                'device',
                devicesPerUser - 1,
              )}, fanning out to ${formatRate(notificationFanout)}/s of pushes.`
            : 'A single device per user means nothing to fan out; no notification service is needed.',
      },
      blockStorage: {
        ratio: blockStorageGigabytes / comfortableBlockStorageGigabytes,
        valueText: formatStorageGigabytes(blockStorageGigabytes),
        copy: `${formatCount(totalFiles)} files at ~${formatKilobytes(avgFileSizeKb)} each${
          dedupActive ? ', after block-level dedup.' : '; dedup is off so every copy is stored.'
        }`,
      },
      dedupSavings: {
        ratio: dedupActive ? 0.5 : rawBlockStorageGigabytes > comfortableBlockStorageGigabytes ? 1.1 : 0.2,
        valueText: dedupActive
          ? `${formatStorageGigabytes(dedupSavedGigabytes)} saved`
          : '0 GB saved',
        copy: dedupActive
          ? `Storing each unique chunk once removes roughly ${formatRatio(
              dedupSavingsFraction,
            )} of raw bytes.`
          : 'Block-level dedup is off, so duplicate chunks across users and versions are stored repeatedly.',
      },
      conflictPressure: {
        ratio: conflictPressure,
        valueText: needsSharing ? `${formatRate(editsPerSecond)}/s shared edits` : 'no sharing',
        copy: needsSharing
          ? 'Shared folders mean concurrent edits to the same file; versioning resolves conflicts instead of losing writes.'
          : 'Sharing is off, so every file has a single writer and conflicts cannot occur.',
      },
    },
    decisions: buildDecisions({
      ...flags,
      editsPerSecond,
      devicesPerUser,
      avgFileSizeKb,
      chunkSizeKb,
      globalRegions,
      metadataQps,
    }),
    reasons: buildReasons({
      ...flags,
      activeUsers,
      totalFiles,
      editsPerSecond,
      devicesPerUser,
      notificationFanout,
      metadataQps,
      blockStorageGigabytes,
      dedupSavedGigabytes,
      avgFileSizeKb,
      chunkSizeKb,
      globalRegions,
    }),
  };
}

type ArchitectureFlags = {
  needsNotification: boolean;
  needsChunking: boolean;
  needsMetadataSharding: boolean;
  needsReplication: boolean;
  needsSharing: boolean;
  dedupActive: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    activeUsers: number;
    totalFiles: number;
    editsPerSecond: number;
    devicesPerUser: number;
    notificationFanout: number;
    metadataQps: number;
    blockStorageGigabytes: number;
    dedupSavedGigabytes: number;
    avgFileSizeKb: number;
    chunkSizeKb: number;
    globalRegions: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsNotification) {
    reasons.push({
      severity: analysis.notificationFanout > comfortableNotificationFanout ? 'danger' : 'warning',
      text: `${Math.round(analysis.devicesPerUser)} devices per user turn ${formatRate(
        analysis.editsPerSecond,
      )}/s of edits into ${formatRate(
        analysis.notificationFanout,
      )}/s of pushes; use a notification service, not tight polling.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'With one device per user there is nothing to fan out, so devices can sync on a simple poll.',
    });
  }

  if (analysis.needsChunking) {
    reasons.push({
      severity: 'warning',
      text: `Files average ${formatKilobytes(
        analysis.avgFileSizeKb,
      )} against ${formatKilobytes(
        analysis.chunkSizeKb,
      )} chunks; split by content so only changed blocks are transferred and stored.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Files are small enough to upload whole; chunking would add a chunk index for little gain.',
    });
  }

  if (analysis.dedupActive) {
    reasons.push({
      severity: 'ok',
      text: `Block-level dedup stores each unique chunk once, saving about ${formatStorageGigabytes(
        analysis.dedupSavedGigabytes,
      )} of block storage.`,
    });
  }

  if (analysis.needsMetadataSharding) {
    reasons.push({
      severity: analysis.metadataQps > comfortableMetadataReadsPerSecond * 2 ? 'danger' : 'warning',
      text: `${formatCount(analysis.totalFiles)} files and ${formatRate(
        analysis.metadataQps,
      )}/s of metadata traffic exceed one node; shard the metadata DB by user or namespace.`,
    });
  }

  if (analysis.needsReplication) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.globalRegions)} ${pluralize(
        'region',
        analysis.globalRegions,
      )} mean blocks should be replicated so uploads and downloads stay local.`,
    });
  }

  if (analysis.needsSharing) {
    reasons.push({
      severity: 'warning',
      text: 'Shared folders allow concurrent edits, so the design needs permissions and version-based conflict resolution.',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    editsPerSecond: number;
    devicesPerUser: number;
    avgFileSizeKb: number;
    chunkSizeKb: number;
    globalRegions: number;
    metadataQps: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    chunking: {
      state: flags.needsChunking ? (flags.dedupActive ? 'needed' : 'useful') : 'not-yet',
      copy: flags.needsChunking
        ? `Split files into ${formatKilobytes(
            flags.chunkSizeKb,
          )} content-addressed chunks${
            flags.dedupActive ? ' and dedup identical blocks across users and versions.' : '; turn on dedup to store each block once.'
          }`
        : 'Whole-file uploads are fine while files are small and edit volume is low.',
    },
    storeSplit: {
      state: flags.needsChunking || flags.needsMetadataSharding ? 'needed' : 'useful',
      copy:
        flags.needsChunking || flags.needsMetadataSharding
          ? 'Run the metadata service and the block store as separate systems; they scale on different axes.'
          : 'Metadata and blobs can share one store while the workload is tiny.',
    },
    notification: {
      state: flags.needsNotification ? 'needed' : 'not-yet',
      copy: flags.needsNotification
        ? `Hold a long-poll or push connection per device so a change reaches the user's other ${Math.round(
            flags.devicesPerUser - 1,
          )} ${pluralize('device', flags.devicesPerUser - 1)} within seconds.`
        : 'A single device per user can poll for changes; no notification service is justified yet.',
    },
    metadataSharding: {
      state: flags.needsMetadataSharding ? 'needed' : 'not-yet',
      copy: flags.needsMetadataSharding
        ? `Shard the metadata DB by user or namespace to absorb ${formatRate(
            flags.metadataQps,
          )}/s and the file-tree row count.`
        : 'One metadata node holds the file tree and version history for now.',
    },
    replication: {
      state: flags.needsReplication ? 'needed' : 'not-yet',
      copy: flags.needsReplication
        ? `Replicate blocks across ${formatCount(
            flags.globalRegions,
          )} ${pluralize('region', flags.globalRegions)} so transfers stay close to each device.`
        : 'A single region serves all blocks while users are regional.',
    },
    sharing: {
      state: flags.needsSharing ? 'tradeoff' : 'not-yet',
      copy: flags.needsSharing
        ? 'Add folder permissions and resolve concurrent edits with versioning (keep a conflicted copy rather than lose a write).'
        : 'Sharing is off, so each file has one writer and there are no conflicts to resolve.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (
    !flags.needsNotification &&
    !flags.needsChunking &&
    !flags.needsMetadataSharding &&
    !flags.needsReplication
  ) {
    return 'Single app + combined store';
  }
  if (flags.needsReplication && (flags.needsMetadataSharding || flags.needsChunking)) {
    return 'Multi-region chunks + sharded metadata';
  }
  if (flags.needsMetadataSharding) {
    return 'Chunked storage + sharded metadata';
  }
  if (flags.needsChunking) {
    return 'Chunked block store + metadata service';
  }
  return 'Sync API + notification service';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (
    !flags.needsNotification &&
    !flags.needsChunking &&
    !flags.needsMetadataSharding &&
    !flags.needsReplication
  ) {
    return 'One app server stores whole files and their metadata together. With a single device there is nobody to notify, so nothing else is justified yet.';
  }
  if (flags.needsReplication && (flags.needsMetadataSharding || flags.needsChunking)) {
    return 'Files are chunked and deduped into a replicated block store near each user, while a sharded metadata service and a notification fan-out keep every device current.';
  }
  if (flags.needsMetadataSharding) {
    return 'Content-addressed chunks land in a block store while the chatty metadata service is sharded so the file tree and versions scale independently.';
  }
  if (flags.needsChunking) {
    return 'Files are split into content-addressed chunks stored separately from a metadata service, and a notification service pushes changes to other devices.';
  }
  return 'A notification service pushes file changes to a user\'s other devices while one metadata service and block store still cover the volume.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (
    !flags.needsNotification &&
    !flags.needsChunking &&
    !flags.needsMetadataSharding &&
    !flags.needsReplication
  ) {
    return 'Device -> sync API -> store';
  }
  if (flags.needsReplication && (flags.needsMetadataSharding || flags.needsChunking)) {
    return 'Device -> sync API -> chunk index -> replicated block store; notify other devices';
  }
  if (flags.needsMetadataSharding) {
    return 'Device -> sync API -> sharded metadata + chunk index -> block store';
  }
  if (flags.needsChunking) {
    return 'Device -> sync API -> chunk index -> block store; metadata service tracks versions';
  }
  return 'Device -> sync API -> metadata + block store; notifier pushes to other devices';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function pluralize(unit: string, value: number): string {
  return Math.round(value) === 1 ? unit : `${unit}s`;
}
