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
  eyebrow: '系统设计 Lab',
  title:
    '文件同步其实是两套系统套了一件外衣：一个话痨般的 metadata service，和一个体量庞大的 block store，两者沿着完全不同的轴扩展。',
  summary:
    '调一调活跃用户、每人文件数、文件大小、编辑速率、每人设备数、chunk 大小和 region 数。设计会从一个盒子，长成一个把变更 push 给每台设备的 notification service、带 dedup 的 content-addressed chunking、一个分片的 metadata 数据库，以及为共享与协作做的多 region block replication。',
  controls: [
    {
      id: 'activeUsers',
      label: '活跃用户',
      help: '正在同步文件的用户；每人跑一台或多台设备，要么轮询、要么挂着一条长连接。',
      min: 100,
      max: 500_000_000,
      defaultValue: 1_000_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'filesPerUser',
      label: '每人文件数',
      help: '每个用户平均被追踪的文件数；决定了 metadata 行数，以及客户端镜像的那棵 file tree。',
      min: 50,
      max: 1_000_000,
      defaultValue: 5_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'avgFileSizeKb',
      label: '平均文件大小',
      help: '文件大小的均值；正是大文件让我们选择切成 chunk，而不是整块 blob 地存。',
      min: 4,
      max: 4_194_304,
      defaultValue: 512,
      scale: 'log',
      format: 'kilobytes',
    },
    {
      id: 'editsPerSecond',
      label: '每秒编辑数',
      help: '全局的保存与上传速率；每次编辑都会写入 chunk，并把这次变更 fan-out 给其他设备。',
      min: 1,
      max: 2_000_000,
      defaultValue: 5_000,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'devicesPerUser',
      label: '每人设备数',
      help: '每个用户的笔记本、手机和平板；文件一变，每台都得被通知到。',
      min: 1,
      max: 12,
      defaultValue: 3,
      scale: 'linear',
      unit: '台',
      format: 'count',
    },
    {
      id: 'chunkSizeKb',
      label: 'Chunk 大小',
      help: '每个 content-addressed block 的大小；chunk 越小 dedup 效果越好，但 metadata 也会成倍增长。',
      min: 64,
      max: 16_384,
      defaultValue: 4_096,
      scale: 'log',
      format: 'kilobytes',
    },
    {
      id: 'globalRegions',
      label: 'Region 数',
      help: '需要放 replica 的 region，好让设备就近上传和下载。',
      min: 1,
      max: 16,
      defaultValue: 1,
      scale: 'linear',
      unit: '个',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'blockLevelDedup',
      label: 'Block-level dedup',
      help: '让每个唯一 chunk 跨用户、跨版本只存一份；用一个 chunk index 换来可观的存储节省。',
      defaultValue: true,
    },
    {
      id: 'fileSharing',
      label: '共享 + 协作',
      help: '让用户共享文件夹、并发编辑；这会引入权限和冲突 versioning。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'personal-sync',
      step: '01',
      title: 'Personal sync',
      summary: '一个用户、一台设备，一个保持同步的文件夹。',
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
      summary: '每个用户都跑好几台设备，全都想尽快拿到更新。',
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
      summary: '大块的媒体文件，让整块 blob 上传变得很浪费。',
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
      summary: '几十亿个文件，把单个 metadata 数据库压垮。',
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
      summary: '共享文件夹、并发编辑，用户遍布全球。',
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
    title: '文件同步与共享架构图',
    description:
      '一张白板风格的文件同步服务架构图：客户端设备、一个 sync API 和 notification service、带 chunk index 的 metadata service、block 与 object storage，以及一条异步索引和 notification fan-out 的链路。',
    columns: [
      {
        id: 'clients',
        label: '设备',
        variant: 'clients',
        nodes: [
          {
            id: 'device',
            title: '客户端设备',
            subtitle: 'watch + sync',
            kind: 'client',
            summary: '监视本地文件夹，上传变更的 chunk，并应用远端的变更',
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
            kind: 'api',
            summary: '处理 chunk 的上传与下载，并提交文件变更',
          },
          {
            id: 'notifier',
            title: 'Notification',
            subtitle: 'long-poll + push',
            kind: 'service',
            summary: '文件一变，就告诉该用户的每台其他设备，好让它们去拉取',
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
            subtitle: '文件树 + 版本',
            kind: 'db',
            summary: '存放 file tree、版本和权限；那个话痨般的 source of truth',
          },
          {
            id: 'chunkIndex',
            title: 'Chunk index',
            subtitle: 'hash 到 block',
            kind: 'nosql',
            summary: '把内容 hash 映射到存好的 block，让相同的 chunk 只存一份',
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
            kind: 'objectstore',
            summary: '一个持久的 content-addressed 存储，装着每一个唯一的文件 chunk',
          },
          {
            id: 'replicas',
            title: 'Replicas',
            subtitle: 'multi-region',
            kind: 'objectstore',
            summary: '把 block 跨 region 复制，让上传和下载都就近完成',
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
            kind: 'compute',
            summary: '把变更事件 fan-out 给设备，并在 hot path 之外构建搜索和共享索引',
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
    { id: 'blockStorage', label: 'Block 存储' },
    { id: 'dedupSavings', label: 'Dedup 省下的字节' },
    { id: 'conflictPressure', label: '冲突 / 版本压力' },
  ],
  decisions: [
    { id: 'chunking', title: 'Chunking + dedup' },
    { id: 'storeSplit', title: 'Metadata 与 block 拆分' },
    { id: 'notification', title: '同步通知' },
    { id: 'metadataSharding', title: 'Metadata sharding' },
    { id: 'replication', title: 'Block replication' },
    { id: 'sharing', title: '共享 + 冲突' },
  ],
  sourceBackedRules: [
    {
      title: 'Dropbox 把 metadata service 和 block storage 分了开',
      source: 'Dropbox Engineering',
      url: 'https://dropbox.tech/infrastructure/inside-the-magic-pocket',
      summary:
        'Dropbox 用 Magic Pocket 作为专门的 exabyte 级 block store，而文件 metadata 则放在另一个、按不同维度扩展的服务里。',
    },
    {
      title: '文件被切成 content-addressed block',
      source: 'Content-addressable storage',
      url: 'https://en.wikipedia.org/wiki/Content-addressable_storage',
      summary:
        'Content-addressable storage 用内容的 hash 给每个 block 命名，于是相同的 block 只存一份——这正是 block-level dedup 的基础。',
    },
    {
      title: 'Content-defined chunking 让跨文件去重成为可能',
      source: 'LBFS (SOSP 2001)',
      url: 'https://pdos.csail.mit.edu/papers/lbfs:sosp01/lbfs.pdf',
      summary:
        'Low-Bandwidth File System 证明了：对变长的内容 chunk 做 hash，能让同步系统只传输、只存储真正变化过的那些 chunk。',
    },
    {
      title: 'Long-polling 让客户端不必忙轮询也能及时得知变更',
      source: 'MDN Web Docs',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events',
      summary:
        '一条挂着不放的请求（long-poll 或 server-sent stream）让服务端在变更发生的当下就通知设备，而不是让设备按定时器轮询。',
    },
  ],
  teachingAssumptions: [
    'Metadata QPS 是由编辑数、加上每次变更要通知的设备数估算出来的，不是实测流量。',
    '单节点的 metadata 读取和存储预算是偏保守的教学数字，不是厂商的真实上限。',
    'Dedup 省下的量用的是总字节的一个固定比例；真实节省高度取决于内容实际被共享了多少。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-box',
      step: '01',
      focus: '一个用户，一个盒子',
      scenarioId: 'personal-sync',
      question:
        '一个人从单台笔记本同步一个文件夹，每秒就那么几次编辑。你需要 chunking、notification service，或者单独的 block store 吗？',
      reveal:
        '不需要。只有一台设备，就没别人要通知，编辑量微不足道；整文件上传到一个 store、metadata 放在同一个数据库里，完全够用。Chunking、dedup 和 notification fan-out 此时都太早了。',
      takeaway: '从一个 app 加一个 store 起步；只有出现第二台设备，同步的复杂度才会冒出来。',
    },
    {
      id: 'devices',
      step: '02',
      focus: '每个用户多台设备',
      scenarioId: 'many-devices',
      question:
        '现在每个用户跑四台设备，全都指望几秒内拿到变更过的文件。其他设备该怎么知道某个文件变了？',
      reveal:
        '让每台设备都用紧凑的定时器去轮询 metadata service，会把读负载乘上设备数，却几乎换不来新数据。一个 notification service（long-poll 或 push）为每台设备挂一条连接，精确地告诉它何时去拉取，于是读取跟着真实变更走，而不是跟着轮询间隔走。',
      takeaway: '用 notification service 把变更 push 出去；别让空闲设备去轮询 metadata DB。',
    },
    {
      id: 'chunks',
      step: '03',
      focus: '大文件来了',
      scenarioId: 'large-files',
      question:
        '用户开始同步大块的媒体文件，每次只改动几个字节。为什么重新上传、重新存储整个文件是个错招？',
      reveal:
        '只有一个 block 变了，却整文件传输，会白白浪费带宽和存储。把文件切成 content-addressed chunk：客户端只上传变更的 chunk，而一个 chunk index 让跨用户、跨版本相同的 block 只存一份。这里也正是 metadata 和 block storage 明显该拆成两套系统的地方。',
      takeaway: '按内容把文件切 chunk、对 block 做 dedup；只传输、只存储真正变化过的部分。',
    },
    {
      id: 'metadata',
      step: '04',
      focus: 'Metadata 到了规模',
      scenarioId: 'metadata-at-scale',
      question:
        '5 千万用户、每人几万个文件，就是上万亿行 metadata、每秒几十万次编辑。一个 metadata 数据库扛得住、也供得动吗？',
      reveal:
        '扛不住。Block store 靠加容量就能扩展，但 metadata service 才是那个话痨般的瓶颈：行太多、QPS 太高，单节点撑不住。把 metadata 数据库分片（按用户或 namespace），让 file-tree 读取和版本写入能横向扩展，独立于 block storage。',
      takeaway: 'Metadata 和 block 沿不同的轴扩展；先给那个话痨般的 metadata service 做 sharding。',
    },
    {
      id: 'global',
      step: '05',
      focus: '共享 + 全球',
      scenarioId: 'shared-global',
      question:
        '共享文件夹让两个人同时编辑同一个文件，而用户遍布全球。会冒出哪两个新问题，你又怎么应对？',
      reveal:
        '并发编辑会制造冲突：用 versioning 来化解（两份都留，标一个 conflicted copy），而不是悄悄丢掉一次写入，并为共享文件夹加上权限。全球用户需要就近的 block replica，让上传和下载都留在本地，同时 metadata 这个 source of truth 保持一致。',
      takeaway: '用 versioning 化解并发编辑，并按 region 复制 block，让传输就近完成。',
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
          ? `编辑加上每设备的变更通知，对 metadata service 大约打出 ${formatRate(metadataQps)}/s。`
          : 'Metadata service 在低流量下直接供给 file tree 和版本读取。',
      },
      notificationFanout: {
        ratio: notificationFanout / comfortableNotificationFanout,
        valueText: `${formatRate(notificationFanout)}/s`,
        copy:
          devicesPerUser > 1
            ? `每次编辑都得送到该用户的其他 ${Math.round(devicesPerUser - 1)} 台 device，fan-out 成 ${formatRate(notificationFanout)}/s 的 push。`
            : '每个用户只有一台设备，就没什么可 fan-out 的；不需要 notification service。',
      },
      blockStorage: {
        ratio: blockStorageGigabytes / comfortableBlockStorageGigabytes,
        valueText: formatStorageGigabytes(blockStorageGigabytes),
        copy: `${formatCount(totalFiles)} 个文件，每个约 ${formatKilobytes(avgFileSizeKb)}${
          dedupActive ? '，已做 block-level dedup。' : '；dedup 关着，所以每一份副本都会被存下。'
        }`,
      },
      dedupSavings: {
        ratio: dedupActive ? 0.5 : rawBlockStorageGigabytes > comfortableBlockStorageGigabytes ? 1.1 : 0.2,
        valueText: dedupActive
          ? `省下 ${formatStorageGigabytes(dedupSavedGigabytes)}`
          : '省下 0 GB',
        copy: dedupActive
          ? `每个唯一 chunk 只存一份，大约能去掉 ${formatRatio(
              dedupSavingsFraction,
            )} 的原始字节。`
          : 'Block-level dedup 关着，于是跨用户、跨版本重复的 chunk 会被反复存储。',
      },
      conflictPressure: {
        ratio: conflictPressure,
        valueText: needsSharing ? `${formatRate(editsPerSecond)}/s 共享编辑` : '无共享',
        copy: needsSharing
          ? '共享文件夹意味着对同一文件的并发编辑；versioning 来化解冲突，而不是丢掉写入。'
          : '共享关着，所以每个文件只有单一 writer，不会发生冲突。',
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
      text: `每个用户 ${Math.round(analysis.devicesPerUser)} 台设备，把 ${formatRate(
        analysis.editsPerSecond,
      )}/s 的编辑变成 ${formatRate(
        analysis.notificationFanout,
      )}/s 的 push；用 notification service，别用紧凑轮询。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '每个用户只有一台设备，没什么可 fan-out 的，所以设备靠简单的轮询同步就行。',
    });
  }

  if (analysis.needsChunking) {
    reasons.push({
      severity: 'warning',
      text: `文件平均 ${formatKilobytes(
        analysis.avgFileSizeKb,
      )}，而 chunk 是 ${formatKilobytes(
        analysis.chunkSizeKb,
      )}；按内容切分，只传输和存储变更过的 block。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '文件足够小，可以整块上传；chunking 只会平添一个 chunk index，收益甚微。',
    });
  }

  if (analysis.dedupActive) {
    reasons.push({
      severity: 'ok',
      text: `Block-level dedup 让每个唯一 chunk 只存一份，省下约 ${formatStorageGigabytes(
        analysis.dedupSavedGigabytes,
      )} 的 block storage。`,
    });
  }

  if (analysis.needsMetadataSharding) {
    reasons.push({
      severity: analysis.metadataQps > comfortableMetadataReadsPerSecond * 2 ? 'danger' : 'warning',
      text: `${formatCount(analysis.totalFiles)} 个文件、${formatRate(
        analysis.metadataQps,
      )}/s 的 metadata 流量已超出单节点；按用户或 namespace 给 metadata DB 做 sharding。`,
    });
  }

  if (analysis.needsReplication) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.globalRegions)} 个 region 意味着 block 应当被复制，好让上传和下载都留在本地。`,
    });
  }

  if (analysis.needsSharing) {
    reasons.push({
      severity: 'warning',
      text: '共享文件夹允许并发编辑，所以设计需要权限和基于版本的 conflict resolution。',
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
        ? `把文件切成 ${formatKilobytes(
            flags.chunkSizeKb,
          )} 的 content-addressed chunk${
            flags.dedupActive ? '，并跨用户、跨版本 dedup 掉相同的 block。' : '；打开 dedup 让每个 block 只存一份。'
          }`
        : '只要文件小、编辑量低，整文件上传就够了。',
    },
    storeSplit: {
      state: flags.needsChunking || flags.needsMetadataSharding ? 'needed' : 'useful',
      copy:
        flags.needsChunking || flags.needsMetadataSharding
          ? '把 metadata service 和 block store 当作两套独立系统来跑；它们沿不同的轴扩展。'
          : '负载还很小的时候，metadata 和 blob 可以共用一个 store。',
    },
    notification: {
      state: flags.needsNotification ? 'needed' : 'not-yet',
      copy: flags.needsNotification
        ? `为每台设备挂一条 long-poll 或 push 连接，让变更在几秒内送达该用户的其他 ${Math.round(
            flags.devicesPerUser - 1,
          )} 台 device。`
        : '每个用户只有一台设备，轮询变更即可；目前还谈不上需要 notification service。',
    },
    metadataSharding: {
      state: flags.needsMetadataSharding ? 'needed' : 'not-yet',
      copy: flags.needsMetadataSharding
        ? `按用户或 namespace 给 metadata DB 做 sharding，以吸收 ${formatRate(
            flags.metadataQps,
          )}/s 和 file-tree 的行数。`
        : '眼下一个 metadata 节点就能装下 file tree 和版本历史。',
    },
    replication: {
      state: flags.needsReplication ? 'needed' : 'not-yet',
      copy: flags.needsReplication
        ? `把 block 跨 ${formatCount(
            flags.globalRegions,
          )} 个 region 复制，让传输都贴近每台设备。`
        : '用户还集中在一个地区时，单个 region 就能供给所有 block。',
    },
    sharing: {
      state: flags.needsSharing ? 'tradeoff' : 'not-yet',
      copy: flags.needsSharing
        ? '加上文件夹权限，并用 versioning 化解并发编辑（留一个 conflicted copy，而不是丢掉一次写入）。'
        : '共享关着，所以每个文件只有一个 writer，没有冲突要化解。',
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
    return '一个 app server 把整文件和它们的 metadata 存在一起。只有一台设备，就没人要通知，所以暂时也用不上别的什么。';
  }
  if (flags.needsReplication && (flags.needsMetadataSharding || flags.needsChunking)) {
    return '文件被 chunk 化、dedup 后存入贴近每个用户的 replicated block store，同时一个分片的 metadata service 和一条 notification fan-out 让每台设备都保持最新。';
  }
  if (flags.needsMetadataSharding) {
    return 'Content-addressed chunk 落进 block store，而那个话痨般的 metadata service 被分片，让 file tree 和版本能独立扩展。';
  }
  if (flags.needsChunking) {
    return '文件被切成 content-addressed chunk，与 metadata service 分开存储，再由一个 notification service 把变更 push 给其他设备。';
  }
  return '一个 notification service 把文件变更 push 给用户的其他设备，而此时单个 metadata service 和 block store 还扛得住这个量。';
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
