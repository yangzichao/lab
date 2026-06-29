import {
  formatCount,
  formatDuration,
  formatKilobytes,
  formatRate,
  formatStorageGigabytes,
} from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  NodeState,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

const roomOperationBudgetPerSecond = 2_000;
const presenceFanoutBudgetPerSecond = 10_000;
const fastRecoveryLogBudgetMegabytes = 64;
const operationBytes = 240;

export const googleDocsLabDefinition: SystemDesignLabDefinition = {
  id: 'google-docs',
  eyebrow: '系统设计 Lab',
  title: '当 edit ordering 成为约束时，Google Docs 的设计就会改变形态。',
  summary:
    '从一篇可编辑的文档开始。逐步增加协作者、offline 时长和读者 fanout，看看为什么这套设计需要 WebSocket 路由、一个 document room、OT/CRDT、一条 operation log、snapshot，以及一条独立的 presence 路径。',
  articleHref: '/blog/system-design/google-docs/',
  controls: [
    {
      id: 'concurrentEditors',
      label: '并发编辑者',
      help: '正在同时编辑同一篇文档的人数，不是文档的总浏览者。',
      min: 1,
      max: 2_000,
      defaultValue: 4,
      scale: 'log',
      unit: '人',
      format: 'count',
    },
    {
      id: 'operationsPerEditorSecond',
      label: '每位编辑者的编辑速率',
      help: '小型 operation，比如 insert、delete、format，或者输入法 composition 批次。',
      min: 0.2,
      max: 10,
      defaultValue: 2,
      scale: 'linear',
      format: 'operations-per-second',
    },
    {
      id: 'documentSizeKilobytes',
      label: '文档大小',
      help: '当前 snapshot 的大小；operation 历史可能比它大得多。',
      min: 4,
      max: 50_000,
      defaultValue: 100,
      scale: 'log',
      format: 'kilobytes',
    },
    {
      id: 'offlineSeconds',
      label: 'Offline 编辑窗口',
      help: '客户端在重连之前可以在本地持续编辑多久。',
      min: 0,
      max: 86_400,
      defaultValue: 300,
      scale: 'linear',
      format: 'duration-seconds',
    },
    {
      id: 'presenceUpdatesSecond',
      label: 'Presence 更新速率',
      help: '每位活跃编辑者的光标、选区和正在输入指示。',
      min: 0,
      max: 20,
      defaultValue: 2,
      scale: 'linear',
      format: 'operations-per-second',
    },
    {
      id: 'viewerFanout',
      label: '被动浏览者',
      help: '只看文档、不主动编辑的用户；对 hot document 很关键。',
      min: 1,
      max: 100_000,
      defaultValue: 8,
      scale: 'log',
      unit: '人',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'durableAck',
      label: 'durable append 后再 ack',
      help: '只有当 operation 已写入可恢复的 log 后，server 才确认这次编辑。',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'solo',
      step: '01',
      title: '单人草稿',
      summary: '只保存最新的文档正文还够用。',
      values: {
        concurrentEditors: 1,
        operationsPerEditorSecond: 0.5,
        documentSizeKilobytes: 24,
        offlineSeconds: 0,
        presenceUpdatesSecond: 0,
        viewerFanout: 1,
        durableAck: false,
      },
    },
    {
      id: 'team',
      step: '02',
      title: '小团队',
      summary: 'WebSocket 路由和单一 document owner 开始有用了。',
      values: {
        concurrentEditors: 4,
        operationsPerEditorSecond: 2,
        documentSizeKilobytes: 100,
        offlineSeconds: 300,
        presenceUpdatesSecond: 2,
        viewerFanout: 8,
        durableAck: true,
      },
    },
    {
      id: 'offline',
      step: '03',
      title: 'Offline 编辑',
      summary: 'base version 漂移了，于是 transformation 或 merge 逻辑变得重要。',
      values: {
        concurrentEditors: 24,
        operationsPerEditorSecond: 3,
        documentSizeKilobytes: 480,
        offlineSeconds: 10_800,
        presenceUpdatesSecond: 2,
        viewerFanout: 30,
        durableAck: true,
      },
    },
    {
      id: 'public-doc',
      step: '04',
      title: '公开文档',
      summary: 'presence 和 broadcast fanout 不该把 edit room 压垮。',
      values: {
        concurrentEditors: 220,
        operationsPerEditorSecond: 2,
        documentSizeKilobytes: 900,
        offlineSeconds: 1800,
        presenceUpdatesSecond: 4,
        viewerFanout: 18_000,
        durableAck: true,
      },
    },
    {
      id: 'hot-doc',
      step: '05',
      title: 'Hot document',
      summary: '一个 room 仍是 ordering point，但读取和 presence 需要 fanout 层。',
      values: {
        concurrentEditors: 900,
        operationsPerEditorSecond: 4,
        documentSizeKilobytes: 2_000,
        offlineSeconds: 3600,
        presenceUpdatesSecond: 6,
        viewerFanout: 70_000,
        durableAck: true,
      },
    },
  ],
  diagram: {
    title: 'Google Docs 协同编辑架构图',
    description:
      '白板风格的架构图，展示实时文档协作中的 room ordering、operation transform、log、snapshot 和 presence fanout。',
    viewBox: '0 0 1040 560',
    zones: [
      { id: 'clients', label: '客户端', x: 20, y: 65, width: 150, height: 370, variant: 'clients' },
      { id: 'edge', label: '实时 edge', x: 210, y: 45, width: 180, height: 430, variant: 'edge' },
      { id: 'coordination', label: '文档协调', x: 430, y: 70, width: 205, height: 380, variant: 'backbone' },
      { id: 'reliability', label: '恢复', x: 675, y: 70, width: 165, height: 380, variant: 'processing' },
      { id: 'serving', label: '存储 + fanout', x: 875, y: 45, width: 145, height: 430, variant: 'storage' },
    ],
    flows: [
      { id: 'clientsToGateway', path: 'M155 238 C190 238 190 150 225 150', variant: 'primary' },
      { id: 'gatewayToRoom', path: 'M365 185 C400 185 405 205 445 205', variant: 'primary' },
      { id: 'roomToTransform', path: 'M535 250 L535 315', variant: 'primary' },
      { id: 'transformToLog', path: 'M620 352 C655 352 660 212 690 212', variant: 'primary' },
      { id: 'logToSnapshot', path: 'M770 252 L770 330', variant: 'secondary' },
      { id: 'snapshotToStore', path: 'M835 365 C858 365 858 380 890 380', variant: 'secondary' },
      { id: 'roomToStore', path: 'M620 205 C715 120 800 120 890 120', variant: 'secondary' },
      { id: 'roomToPresence', path: 'M620 235 C750 250 792 260 890 260', variant: 'secondary' },
      { id: 'presenceToGateway', path: 'M890 285 C720 470 390 470 300 220', variant: 'secondary' },
      { id: 'directToStore', path: 'M155 255 C390 175 640 135 890 120', variant: 'direct' },
    ],
    nodes: [
      { id: 'clients', title: 'Browser', subtitle: '本地乐观编辑', kind: 'client', x: 48, y: 205, width: 108, height: 92 },
      { id: 'gateway', title: 'WebSocket', subtitle: 'auth + 文档路由', kind: 'lb', x: 225, y: 125, width: 140, height: 92 },
      { id: 'room', title: 'Doc room', subtitle: '权威顺序', kind: 'scheduler', x: 445, y: 165, width: 175, height: 96 },
      { id: 'transform', title: 'OT / CRDT', subtitle: '修复过期位置', kind: 'service', x: 445, y: 315, width: 175, height: 88 },
      { id: 'operationLog', title: 'Op log', subtitle: 'durable 版本', kind: 'stream', x: 690, y: 175, width: 130, height: 88 },
      { id: 'snapshot', title: 'Snapshotter', subtitle: '快速恢复', kind: 'compute', x: 690, y: 330, width: 130, height: 82 },
      { id: 'documentStore', title: 'Doc store', subtitle: 'metadata + blob', kind: 'db', x: 890, y: 85, width: 112, height: 82 },
      { id: 'presence', title: 'Presence', subtitle: 'best-effort fanout', kind: 'service', x: 890, y: 250, width: 112, height: 92 },
      { id: 'archive', title: '历史', subtitle: '版本 + audit', kind: 'objectstore', x: 890, y: 375, width: 112, height: 82 },
    ],
    mobileStages: [
      {
        label: '客户端',
        nodes: [{ id: 'clients', title: 'Browser', summary: '乐观地应用本地编辑并发送 operation' }],
      },
      {
        label: '实时 edge',
        nodes: [{ id: 'gateway', title: 'WebSocket gateway', summary: '维持连接，并按 document id 路由' }],
      },
      {
        label: '文档协调',
        nodes: [
          { id: 'room', title: 'Document room', summary: '为单篇文档的 operation 串行排序' },
          { id: 'transform', title: 'OT / CRDT', summary: '修复过期位置，或合并 offline 编辑' },
        ],
      },
      {
        label: '恢复',
        nodes: [
          { id: 'operationLog', title: 'Operation log', summary: 'durable 的有序历史' },
          { id: 'snapshot', title: 'Snapshotter', summary: '定期做整篇文档的 checkpoint' },
        ],
      },
      {
        label: '存储 + fanout',
        nodes: [
          { id: 'documentStore', title: 'Document store', summary: 'metadata、权限和当前正文 blob' },
          { id: 'presence', title: 'Presence fanout', summary: '短暂的光标和浏览者 broadcast' },
          { id: 'archive', title: '历史', summary: '版本历史和恢复数据' },
        ],
      },
    ],
  },
  meters: [
    { id: 'roomThroughput', label: 'Room throughput' },
    { id: 'staleOperations', label: 'stale-operation 风险' },
    { id: 'operationLog', label: 'Operation log' },
    { id: 'presenceFanout', label: 'Presence fanout' },
    { id: 'recoveryCost', label: '恢复成本' },
  ],
  decisions: [
    { id: 'websocket', title: 'WebSocket edge' },
    { id: 'documentRoom', title: 'Document room' },
    { id: 'otOrCrdt', title: 'OT / CRDT' },
    { id: 'durableLog', title: 'Durable op log' },
    { id: 'snapshot', title: 'Snapshot' },
    { id: 'presence', title: 'Presence 路径' },
  ],
  sourceBackedRules: [
    {
      title: 'WebSocket 适合低延迟的双向协作',
      source: 'MDN Web Docs',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API',
      summary:
        'browser 和 server 都需要发消息，而不必为每次编辑或光标更新都开一个新的 HTTP 请求。',
    },
    {
      title: '每个文件一个权威方，能让协作的 ordering 保持可理解',
      source: 'Figma Engineering',
      url: 'https://www.figma.com/blog/how-figmas-multiplayer-technology-works/',
      summary:
        'Figma 介绍了把同一个文件的所有客户端都路由到一台 multiplayer server，从而让系统对该文件有一个清晰的协调点。',
    },
    {
      title: 'OT 会对那些基于旧版本生成的 operation 做变换',
      source: 'TinyMCE',
      url: 'https://www.tiny.cloud/blog/real-time-collaboration-ot-vs-crdt/',
      summary:
        'operational transform 会把进来的 operation 相对已经发生的改动做调整，正好对应这个 lab 里的 stale-position 风险。',
    },
    {
      title: 'CRDT 用可合并的数据结构换掉了中心化的 transform',
      source: 'System Design Sandbox',
      url: 'https://www.systemdesignsandbox.com/learn/ot-vs-crdt',
      summary:
        '基于 CRDT 的编辑器会附带稳定的 ordering metadata，于是即便 operation 以不同顺序到达，各 replica 也能合并编辑并最终收敛。',
    },
  ],
  teachingAssumptions: [
    '这些阈值是教学用的阈值，不是 Google 的生产数字。',
    '单个 document room 是编辑的 ordering point；大规模的读取或 presence fanout 可以从这个 room 拆出去。',
    'presence 被建模成 best effort，因为光标更新是短暂的，跟文档 operation 不一样。',
  ],
  teachingWalkthrough: [
    {
      id: 'solo',
      step: '01',
      focus: '单一作者',
      scenarioId: 'solo',
      question:
        '一个人独自编辑一篇文档。现在你需要 operational transform、WebSocket，或者任何 ordering 机制吗？',
      reveal:
        '不需要。只有一个作者时，没有 concurrent edit 要去调和，所以定期保存最新的文档正文就是对的。只有当编辑可能冲突时，那套协作机制才值得引入。',
      takeaway: '没有并发就没有 ordering 问题——只要持久化最新版本即可。',
    },
    {
      id: 'team',
      step: '02',
      focus: '几个编辑者',
      scenarioId: 'team',
      question:
        '现在一个小团队在实时一起编辑。你加的第一个组件是什么，为什么一篇文档需要单一的 owner？',
      reveal:
        '一个 WebSocket 层实时推送改动，并且每篇文档都有一个权威 room，把 operation 串行成单一顺序——没有这个 ordering point，两个客户端就会发散。',
      takeaway: '实时协作需要每篇文档一个权威的 ordering point。',
    },
    {
      id: 'offline',
      step: '03',
      focus: '基于过期 base 的编辑',
      scenarioId: 'offline',
      question:
        '一位编辑者离线后改的是旧版本，然后重连。为什么你不能直接把他的 operation 追加上去？',
      reveal:
        '他的 operation 是基于一个之后已经变化的 base 写的，所以位置都过期了。你必须把这些 operation 相对期间发生的一切做 transform（OT）或 merge（CRDT），否则编辑会落到错误的位置。',
      takeaway: '基于漂移 base 的编辑需要 transform/merge，而不是盲目追加。',
    },
    {
      id: 'public-doc',
      step: '04',
      focus: '大量浏览者',
      scenarioId: 'public-doc',
      question:
        '一篇文档被广泛分享，大多数连接只是在看。presence 和 broadcast 该不该走 edit room？',
      reveal:
        '不该——presence 和浏览 fanout 量大且是 best-effort，而 edit room 是稀缺的 ordering point。把 presence/broadcast 拆到它们自己的层，这样旁观者永远不会拖慢权威的 ordering。',
      takeaway: '让 best-effort fanout 远离稀缺的 ordering 路径。',
    },
    {
      id: 'hot-doc',
      step: '05',
      focus: '一篇 hot document',
      scenarioId: 'hot-doc',
      question:
        '一篇文档极其火爆。room 仍然给编辑排序——那它周围有什么必须扩展？',
      reveal:
        '那个单一的 ordering room 依旧权威，但读取、presence 和 broadcast 都需要 fanout 层，而且 op log 需要 snapshot，好让新加入者快速恢复，而不是重放整段历史。',
      takeaway: 'ordering point 保持单一；读取、presence 和恢复都在它周围 fanout。',
    },
  ],
  analyze: analyzeGoogleDocsWorkload,
};

function analyzeGoogleDocsWorkload(workload: WorkloadValues): LabAnalysis {
  const concurrentEditors = numericValue(workload, 'concurrentEditors');
  const operationsPerEditorSecond = numericValue(workload, 'operationsPerEditorSecond');
  const documentSizeKilobytes = numericValue(workload, 'documentSizeKilobytes');
  const offlineSeconds = numericValue(workload, 'offlineSeconds');
  const offlineMinutes = offlineSeconds / 60;
  const presenceUpdatesSecond = numericValue(workload, 'presenceUpdatesSecond');
  const viewerFanout = numericValue(workload, 'viewerFanout');
  const durableAck = Boolean(workload.durableAck);

  const editOperationsPerSecond = concurrentEditors * operationsPerEditorSecond;
  const presenceMessagesPerSecond =
    concurrentEditors * presenceUpdatesSecond * Math.max(1, Math.log10(viewerFanout + 1));
  const staleOperationRisk = Math.min(1.6, (offlineMinutes / 90) + (concurrentEditors / 80));
  const operationLogMegabytesPerHour =
    (editOperationsPerSecond * 3600 * operationBytes) / (1024 * 1024);
  const recoveryMegabytes =
    documentSizeKilobytes / 1024 + operationLogMegabytesPerHour * Math.max(1, offlineMinutes / 60);

  const needsRealtimeGateway = concurrentEditors > 1 || editOperationsPerSecond >= 2;
  const needsDocumentRoom = concurrentEditors > 1 || editOperationsPerSecond >= 5;
  const needsTransform = concurrentEditors > 1 || offlineMinutes > 0;
  const needsDurableLog = durableAck || concurrentEditors > 2 || offlineMinutes > 0;
  const needsSnapshot = recoveryMegabytes > fastRecoveryLogBudgetMegabytes || documentSizeKilobytes > 1024;
  const needsPresenceFanout =
    presenceMessagesPerSecond > presenceFanoutBudgetPerSecond * 0.35 || viewerFanout >= 2_000;
  const needsHistoryArchive = needsDurableLog && (offlineMinutes >= 30 || documentSizeKilobytes >= 512);

  return {
    architectureTitle: chooseArchitectureTitle({
      needsRealtimeGateway,
      needsDocumentRoom,
      needsTransform,
      needsDurableLog,
      needsSnapshot,
      needsPresenceFanout,
    }),
    architectureSummary: chooseArchitectureSummary({
      needsRealtimeGateway,
      needsDocumentRoom,
      needsTransform,
      needsDurableLog,
      needsSnapshot,
      needsPresenceFanout,
    }),
    architecturePath: chooseArchitecturePath({
      needsRealtimeGateway,
      needsDocumentRoom,
      needsTransform,
      needsDurableLog,
      needsSnapshot,
      needsPresenceFanout,
    }),
    nodeStates: {
      clients: 'ok',
      gateway: stateWhen(needsRealtimeGateway),
      room: stateWhen(needsDocumentRoom),
      transform: stateWhen(needsTransform),
      operationLog: durableAck ? 'needed' : stateWhen(needsDurableLog),
      snapshot: stateWhen(needsSnapshot),
      documentStore: 'ok',
      presence: stateWhen(needsPresenceFanout || presenceUpdatesSecond > 0),
      archive: stateWhen(needsHistoryArchive),
    },
    flowStates: {
      clientsToGateway: needsRealtimeGateway ? 'active' : 'inactive',
      gatewayToRoom: needsDocumentRoom ? 'active' : 'inactive',
      roomToTransform: needsTransform ? 'active' : 'inactive',
      transformToLog: needsDurableLog ? 'active' : 'inactive',
      logToSnapshot: needsSnapshot ? 'active' : 'inactive',
      snapshotToStore: needsSnapshot ? 'active' : 'inactive',
      roomToStore: needsDurableLog ? 'active' : 'inactive',
      roomToPresence: needsPresenceFanout || presenceUpdatesSecond > 0 ? 'active' : 'inactive',
      presenceToGateway: needsPresenceFanout ? 'warning' : presenceUpdatesSecond > 0 ? 'active' : 'inactive',
      directToStore: needsRealtimeGateway ? 'inactive' : 'active',
    },
    meters: {
      roomThroughput: {
        ratio: editOperationsPerSecond / roomOperationBudgetPerSecond,
        valueText: `${formatRate(editOperationsPerSecond)} ops/s`,
        copy: `${formatCount(concurrentEditors)} 位活跃编辑者，每人 ${operationsPerEditorSecond.toFixed(
          1,
        )} 次 operation/秒。`,
      },
      staleOperations: {
        ratio: staleOperationRisk,
        valueText: offlineMinutes === 0 ? '仅实时' : formatDuration(offlineSeconds),
        copy: '编辑者越多、offline 窗口越长，baseVersion 过期的概率就越大。',
      },
      operationLog: {
        ratio: operationLogMegabytesPerHour / fastRecoveryLogBudgetMegabytes,
        valueText: `${formatStorageGigabytes(operationLogMegabytesPerHour / 1024)}/hr`,
        copy: '即便当前文档正文很小，append-only 的 operation 历史也会随编辑速率增长。',
      },
      presenceFanout: {
        ratio: presenceMessagesPerSecond / presenceFanoutBudgetPerSecond,
        valueText: `${formatRate(presenceMessagesPerSecond)} msg/s`,
        copy: '光标和选区更新会随编辑者和浏览者翻倍，所以它们应该保持 best-effort。',
      },
      recoveryCost: {
        ratio: recoveryMegabytes / fastRecoveryLogBudgetMegabytes,
        valueText: `${formatStorageGigabytes(recoveryMegabytes / 1024)}`,
        copy: `${formatKilobytes(documentSizeKilobytes)} 的文档，加上自上一个有用 checkpoint 以来的 operation 重放。`,
      },
    },
    decisions: buildDecisions({
      needsRealtimeGateway,
      needsDocumentRoom,
      needsTransform,
      needsDurableLog,
      needsSnapshot,
      needsPresenceFanout,
      durableAck,
      offlineMinutes,
    }),
    reasons: buildReasons({
      concurrentEditors,
      editOperationsPerSecond,
      offlineMinutes,
      operationLogMegabytesPerHour,
      presenceMessagesPerSecond,
      needsRealtimeGateway,
      needsDocumentRoom,
      needsTransform,
      needsDurableLog,
      needsSnapshot,
      needsPresenceFanout,
      durableAck,
    }),
  };
}

function buildReasons(analysis: {
  concurrentEditors: number;
  editOperationsPerSecond: number;
  offlineMinutes: number;
  operationLogMegabytesPerHour: number;
  presenceMessagesPerSecond: number;
  needsRealtimeGateway: boolean;
  needsDocumentRoom: boolean;
  needsTransform: boolean;
  needsDurableLog: boolean;
  needsSnapshot: boolean;
  needsPresenceFanout: boolean;
  durableAck: boolean;
}): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsDocumentRoom) {
    reasons.push({
      severity: analysis.concurrentEditors > 100 ? 'warning' : 'ok',
      text: `${formatCount(
        analysis.concurrentEditors,
      )} 位编辑者产生 ${formatRate(
        analysis.editOperationsPerSecond,
      )} ops/s。一篇文档的所有 operation 在 broadcast 前都需要一个权威顺序。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '只有一个编辑者、没有实时 fanout 时，保存最新正文仍是个说得过去的起点。',
    });
  }

  if (analysis.needsTransform) {
    reasons.push({
      severity: analysis.offlineMinutes >= 60 ? 'danger' : 'warning',
      text: `operation 可能带着过期的 base version 到达${
        analysis.offlineMinutes > 0 ? `（offline 了 ${Math.round(analysis.offlineMinutes)} 分钟之后）` : ''
      }。系统需要 OT 式的 transform 或 CRDT 式的 merge 规则。`,
    });
  }

  if (analysis.needsDurableLog) {
    reasons.push({
      severity: analysis.durableAck ? 'warning' : 'ok',
      text: analysis.durableAck
        ? 'append 后再 ack 能保护已确认的编辑不被 room 崩溃丢掉，代价是在关键路径上多一次 durable 写。'
        : '一旦历史、重试或 offline 对账变得重要，operation log 就有用了。',
    });
  }

  if (analysis.needsSnapshot) {
    reasons.push({
      severity: 'warning',
      text: `每小时 ${formatStorageGigabytes(
        analysis.operationLogMegabytesPerHour / 1024,
      )} 的 operation 历史会让仅靠重放的恢复变慢。snapshot 能给打开和恢复时间封顶。`,
    });
  }

  if (analysis.needsPresenceFanout) {
    reasons.push({
      severity: analysis.presenceMessagesPerSecond > presenceFanoutBudgetPerSecond ? 'danger' : 'warning',
      text: `在教学模型里，presence 流量大约 ${formatRate(
        analysis.presenceMessagesPerSecond,
      )} messages/s。光标更新应该是 best-effort，并从 durable 的文档 operation 中拆出去。`,
    });
  }

  return reasons.slice(0, 6);
}

function buildDecisions(flags: {
  needsRealtimeGateway: boolean;
  needsDocumentRoom: boolean;
  needsTransform: boolean;
  needsDurableLog: boolean;
  needsSnapshot: boolean;
  needsPresenceFanout: boolean;
  durableAck: boolean;
  offlineMinutes: number;
}): Record<string, { state: DecisionState; copy: string }> {
  return {
    websocket: {
      state: flags.needsRealtimeGateway ? 'needed' : 'not-yet',
      copy: flags.needsRealtimeGateway
        ? '用一个 WebSocket edge，因为客户端和 server 都在持续推送编辑和光标更新。'
        : '在另一个协作者需要低延迟更新之前，普通的 save/load 请求就够了。',
    },
    documentRoom: {
      state: flags.needsDocumentRoom ? 'needed' : 'not-yet',
      copy: flags.needsDocumentRoom
        ? '把一篇文档路由到一个 room 或 actor，让 operation 获得一个权威的 version 顺序。'
        : '先别加 owner 进程；对单人编辑来说，single-writer 的 save 路径更简单。',
    },
    otOrCrdt: {
      state: flags.needsTransform ? 'needed' : 'not-yet',
      copy: flags.needsTransform
        ? `用 OT 或 CRDT 规则，因为 operation 可能基于旧版本${
            flags.offlineMinutes > 0 ? '（在 offline 编辑之后）' : ''
          }。`
        : '没有 concurrent edit，就还没有 stale-position 问题需要解决。',
    },
    durableLog: {
      state: flags.needsDurableLog ? 'needed' : 'not-yet',
      copy: flags.durableAck
        ? '先 append 再 ack，这样 room 崩溃后已确认的编辑能被重放。'
        : '只要丢掉一次未确认的编辑还能接受、且历史很小，log 就是可选的。',
    },
    snapshot: {
      state: flags.needsSnapshot ? 'needed' : 'useful',
      copy: flags.needsSnapshot
        ? '定期做 snapshot，这样打开、重放和恢复就不必扫描整段 operation 历史。'
        : '只要文档和历史还小，snapshot 虽有用但可以不那么频繁。',
    },
    presence: {
      state: flags.needsPresenceFanout ? 'tradeoff' : 'useful',
      copy: flags.needsPresenceFanout
        ? '把 presence 拆到一条 best-effort 的 fanout 路径，这样光标不会和 durable 编辑抢资源。'
        : '在 fanout 还小时 presence 可以共用 room，但它仍应留在 durable log 之外。',
    },
  };
}

function chooseArchitectureTitle(flags: {
  needsRealtimeGateway: boolean;
  needsDocumentRoom: boolean;
  needsTransform: boolean;
  needsDurableLog: boolean;
  needsSnapshot: boolean;
  needsPresenceFanout: boolean;
}): string {
  if (!flags.needsRealtimeGateway) {
    return '单个 document service + document store';
  }
  if (!flags.needsTransform && !flags.needsDurableLog) {
    return 'WebSocket gateway + document room';
  }
  if (!flags.needsSnapshot && !flags.needsPresenceFanout) {
    return 'Document room + OT + durable operation log';
  }
  if (!flags.needsPresenceFanout) {
    return 'Document room + operation log + snapshot';
  }
  return 'Document room + durable 编辑 + 独立的 presence fanout';
}

function chooseArchitectureSummary(flags: {
  needsRealtimeGateway: boolean;
  needsDocumentRoom: boolean;
  needsTransform: boolean;
  needsDurableLog: boolean;
  needsSnapshot: boolean;
  needsPresenceFanout: boolean;
}): string {
  if (!flags.needsRealtimeGateway) {
    return '最简单的系统可以加载一篇文档、接受一个 writer、保存最新正文。现在还不值得做实时协调。';
  }
  if (!flags.needsTransform && !flags.needsDurableLog) {
    return '低延迟协作需要一条持久通道和一个 room 来 broadcast 编辑，但历史和恢复仍然很轻。';
  }
  if (!flags.needsSnapshot && !flags.needsPresenceFanout) {
    return 'room 给 operation 排序，transform 逻辑修复过期位置，一条 log 让客户端能重放错过的编辑。';
  }
  if (!flags.needsPresenceFanout) {
    return '随着文档演进，operation 历史现在需要 snapshot，好让打开和恢复时间保持有界。';
  }
  return 'edit room 仍是 ordering 权威，而 snapshot、durable log 和 best-effort 的 presence fanout 各自独立扩展不同的关注点。';
}

function chooseArchitecturePath(flags: {
  needsRealtimeGateway: boolean;
  needsDocumentRoom: boolean;
  needsTransform: boolean;
  needsDurableLog: boolean;
  needsSnapshot: boolean;
  needsPresenceFanout: boolean;
}): string {
  if (!flags.needsRealtimeGateway) {
    return 'Browser -> document service -> document store';
  }
  if (!flags.needsDocumentRoom) {
    return 'Browser -> WebSocket gateway -> document store';
  }
  if (!flags.needsTransform) {
    return 'Browser -> WebSocket gateway -> document room -> document store';
  }
  if (!flags.needsSnapshot && !flags.needsPresenceFanout) {
    return 'Browser -> gateway -> document room -> OT -> operation log';
  }
  if (!flags.needsPresenceFanout) {
    return 'Browser -> gateway -> room -> OT -> op log -> snapshots';
  }
  return 'Browser -> gateway -> room -> durable edits + presence fanout + snapshots';
}

function stateWhen(needed: boolean): NodeState {
  return needed ? 'needed' : 'inactive';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
