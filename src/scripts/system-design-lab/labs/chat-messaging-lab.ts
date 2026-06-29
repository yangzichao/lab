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

const bytesPerConnection = 20_000; // kernel + app buffers + session state per live socket
const connectionsPerGatewayNode = 250_000; // comfortable live sockets one gateway box holds
const comfortableRoutingFanoutPerSecond = 200_000; // delivered messages one router fans out per second
const comfortableInboxWritesPerSecond = 50_000; // durable inbox appends one store node absorbs
const bytesPerStoredMessage = 1_000; // body + metadata per persisted message
const comfortablePresenceUpdatesPerSecond = 300_000; // presence/heartbeat events one presence node tracks

export const chatMessagingLabDefinition: SystemDesignLabDefinition = {
  id: 'chat-messaging',
  eyebrow: '系统设计 Lab',
  title: '聊天后端首先是个连接问题：得追踪上百万条活跃 socket，再把一条消息 fan-out 给所有该收到它的人。',
  summary:
    '调节并发连接数、消息速率、群组大小、在线比例、历史保留时长、每用户设备数和 region 数。设计会从单台 socket server 演进到带 session registry 的 connection gateway 集群、带 presence service 的路由与 fan-out 层、持久化的 per-user inbox，最后是跨 region 路由加 offline push。',
  controls: [
    {
      id: 'concurrentConnections',
      label: '并发连接数',
      help: '同时保持打开的活跃 WebSocket / 长连接 TCP socket。它决定了 gateway 的内存下限。',
      min: 100,
      max: 500_000_000,
      defaultValue: 50_000,
      scale: 'log',
      unit: '条',
      format: 'count',
    },
    {
      id: 'messagesPerSecond',
      label: '消息发送速率',
      help: '群组放大之前的每秒入站消息数。每条都可能 fan-out 给很多收件人。',
      min: 1,
      max: 50_000_000,
      defaultValue: 5_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'averageGroupSize',
      label: '平均群组大小',
      help: '每条消息的收件人数。1:1 聊天是 2 人；大群会把每次发送放大成很多次投递。',
      min: 2,
      max: 100_000,
      defaultValue: 2,
      scale: 'log',
      unit: '人',
      format: 'count',
    },
    {
      id: 'onlineRatio',
      label: '在线比例',
      help: '当前已连接的收件人占比。其余的得写进持久化 inbox 留待之后投递。',
      min: 1,
      max: 100,
      defaultValue: 60,
      scale: 'linear',
      format: 'percentage',
    },
    {
      id: 'historyRetentionSeconds',
      label: '历史保留时长',
      help: '消息保留多久，好让离线和多设备用户之后能同步它们。',
      min: 3_600,
      max: 315_360_000,
      defaultValue: 2_592_000,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'devicesPerUser',
      label: '每用户设备数',
      help: '每个账号的活跃设备数。每次投递都会被翻倍，好让每台设备都保持同步。',
      min: 1,
      max: 10,
      defaultValue: 1,
      scale: 'linear',
      unit: '台',
      format: 'count',
    },
    {
      id: 'globalRegions',
      label: 'Region 数',
      help: '在靠近用户处终结连接的 region；跨 region 的发送必须在它们之间路由。',
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
      id: 'endToEndEncryption',
      label: 'End-to-end encryption',
      help: '在设备上加密，服务端只路由密文；它没法靠读取内容来做 fan-out。',
      defaultValue: false,
    },
    {
      id: 'readReceipts',
      label: '已读回执',
      help: '按收件人和设备追踪已送达 / 已读状态，给每条消息加一个回传事件。',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'small-1on1',
      step: '01',
      title: '小型 1:1 应用',
      summary: '几千条 socket 互发直接消息。',
      values: {
        concurrentConnections: 5_000,
        messagesPerSecond: 200,
        averageGroupSize: 2,
        onlineRatio: 80,
        historyRetentionSeconds: 604_800,
        devicesPerUser: 1,
        globalRegions: 1,
        endToEndEncryption: false,
        readReceipts: true,
      },
    },
    {
      id: 'many-connections',
      step: '02',
      title: '百万级连接',
      summary: '活跃 socket 数超出了单台 server 能容纳的量。',
      values: {
        concurrentConnections: 5_000_000,
        messagesPerSecond: 80_000,
        averageGroupSize: 2,
        onlineRatio: 70,
        historyRetentionSeconds: 2_592_000,
        devicesPerUser: 1,
        globalRegions: 1,
        endToEndEncryption: false,
        readReceipts: true,
      },
    },
    {
      id: 'large-groups',
      step: '03',
      title: '大群聊',
      summary: '一次发送 fan-out 给数千名成员。',
      values: {
        concurrentConnections: 20_000_000,
        messagesPerSecond: 200_000,
        averageGroupSize: 2_000,
        onlineRatio: 65,
        historyRetentionSeconds: 7_776_000,
        devicesPerUser: 2,
        globalRegions: 1,
        endToEndEncryption: false,
        readReceipts: true,
      },
    },
    {
      id: 'offline-multidevice',
      step: '04',
      title: '离线 + 多设备',
      summary: '大多数收件人都离线，或者用着好几台设备。',
      values: {
        concurrentConnections: 60_000_000,
        messagesPerSecond: 1_000_000,
        averageGroupSize: 500,
        onlineRatio: 25,
        historyRetentionSeconds: 31_536_000,
        devicesPerUser: 4,
        globalRegions: 2,
        endToEndEncryption: true,
        readReceipts: true,
      },
    },
    {
      id: 'global-messenger',
      step: '05',
      title: '全球级 messenger',
      summary: '跨多个 region 的数亿条 socket。',
      values: {
        concurrentConnections: 300_000_000,
        messagesPerSecond: 20_000_000,
        averageGroupSize: 1_000,
        onlineRatio: 40,
        historyRetentionSeconds: 157_680_000,
        devicesPerUser: 5,
        globalRegions: 10,
        endToEndEncryption: true,
        readReceipts: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: '实时聊天 / 消息架构图',
    description:
      '聊天后端的白板风格架构图：持久 socket 上的 client、带 session registry 的 connection gateway 集群、带 presence service 的路由与 fan-out 层、持久化的消息存储和 per-user inbox，以及面向离线设备的异步 push 层。',
    columns: [
      {
        id: 'clients',
        label: 'Client',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: '持久 socket',
            summary: '保持一条长连接 WebSocket，用来实时收发消息',
            kind: 'client',
          },
        ],
      },
      {
        id: 'gateway',
        label: 'Connection gateway',
        variant: 'edge',
        nodes: [
          {
            id: 'gateway',
            title: 'WS gateway',
            subtitle: '持有 socket',
            summary: '终结持久连接，把每条活跃 socket 保存在内存里',
            kind: 'lb',
          },
          {
            id: 'sessionRegistry',
            title: 'Session registry',
            subtitle: '用户到 server',
            summary: '把每个在线 user/device 映射到持有其 socket 的 gateway 节点',
            kind: 'scheduler',
          },
        ],
      },
      {
        id: 'routing',
        label: '路由 + presence',
        variant: 'backbone',
        nodes: [
          {
            id: 'router',
            title: 'Router / fan-out',
            subtitle: '消息到成员',
            summary: '把一次发送展开给每个群成员，并各自路由到对应的 gateway',
            kind: 'service',
          },
          {
            id: 'presence',
            title: 'Presence',
            subtitle: '在线 + 回执',
            summary: '追踪谁在线，并传播已送达 / 已读回执',
            kind: 'service',
          },
        ],
      },
      {
        id: 'storage',
        label: '消息存储',
        variant: 'storage',
        nodes: [
          {
            id: 'messageStore',
            title: '消息存储',
            subtitle: '持久日志',
            summary: '持久化每条消息，让历史能熬过重启和迟到的同步',
            kind: 'db',
          },
          {
            id: 'inbox',
            title: 'Per-user inbox',
            subtitle: '离线队列',
            summary: '按收件设备排队消息，直到它重连并拉取',
            kind: 'queue',
          },
        ],
      },
      {
        id: 'push',
        label: 'Offline push',
        variant: 'processing',
        nodes: [
          {
            id: 'pushService',
            title: 'Push service',
            subtitle: '唤醒设备',
            summary: '发 APNs/FCM 通知唤醒离线设备，让它们去同步',
            kind: 'external',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'gateway', variant: 'primary' },
      { from: 'gateway', to: 'sessionRegistry', variant: 'secondary' },
      { from: 'gateway', to: 'router', variant: 'primary' },
      { from: 'router', to: 'presence', variant: 'secondary' },
      { from: 'router', to: 'messageStore', variant: 'primary' },
      { from: 'router', to: 'inbox', variant: 'secondary' },
      { from: 'inbox', to: 'pushService', variant: 'secondary' },
      { from: 'router', to: 'pushService', variant: 'direct' },
    ],
  }),
  meters: [
    { id: 'connectionMemory', label: '连接内存' },
    { id: 'fanoutRate', label: '消息 fan-out 速率' },
    { id: 'inboxStorage', label: 'Inbox + 历史存储' },
    { id: 'presenceCost', label: 'Presence + 回执开销' },
    { id: 'crossRegion', label: '跨 region 路由' },
  ],
  decisions: [
    { id: 'connectionLayer', title: '连接 / session 层' },
    { id: 'routing', title: '消息路由' },
    { id: 'fanout', title: '群组 fan-out' },
    { id: 'inbox', title: 'Offline inbox' },
    { id: 'presence', title: 'Presence service' },
    { id: 'encryption', title: 'End-to-end encryption' },
  ],
  sourceBackedRules: [
    {
      title: 'WebSocket 是一条服务端必须保持打开的持久全双工连接',
      source: 'MDN Web Docs',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API',
      summary:
        '每个聊天 client 都持有一条长连接，所以 gateway 层的规模取决于它能在内存里保持多少条打开的 socket，而不是请求速率。',
    },
    {
      title: 'Publish/subscribe 把发送者和消息的众多收件人解耦开',
      source: 'Google Cloud Pub/Sub',
      url: 'https://cloud.google.com/pubsub/docs/overview',
      summary:
        'fan-out 给一个群天然就是个 pub/sub 问题：一次 publish 投递给每个 subscriber，router 正是这样把一次发送展开给众多成员的。',
    },
    {
      title: '持久化的 message queue 让离线收件人之后还能收到消息',
      source: 'AWS SQS',
      url: 'https://aws.amazon.com/sqs/',
      summary:
        'per-user inbox queue 为掉线或多设备用户暂存消息，直到每台设备重连并把它的 queue 抽干。',
    },
    {
      title: 'End-to-end encryption 意味着服务端路由的是它读不了的密文',
      source: 'Signal Protocol',
      url: 'https://signal.org/docs/',
      summary:
        '有了 E2EE，服务端能 fan-out 和存储消息，但没法窥探内容，所以服务端的功能只能基于密文和 metadata 来做。',
    },
  ],
  teachingAssumptions: [
    '每条活跃 socket 按一份固定的内存预算计费（内核加 app buffer 加 session state）；真实成本因技术栈而异。',
    'fan-out 速率 = 每秒消息数 × 平均群组大小 × 每用户设备数；presence 和回执还会在此之上叠加回传事件。',
    '单节点的 gateway、路由、inbox 写入和 presence 预算都是保守的教学数字，不是厂商上限。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-socket-server',
      step: '01',
      focus: '几千条 socket',
      scenarioId: 'small-1on1',
      question:
        '一个小型 1:1 应用维持着约 5k 条连接，每秒 200 条直接消息。除了一台 socket server 和一个 database，你还需要别的吗？',
      reveal:
        '不需要。5k 条打开的 socket 一台机器就能装下，1:1 发送也只 fan-out 给对方一个人。session registry、专门的 fan-out 层、offline push 全都为时过早 —— 这台 server 本来就知道两条 socket 都在哪。',
      takeaway: '从最简开始：一台 socket server 既能持有连接、又能在它们之间路由。',
    },
    {
      id: 'connection-fleet',
      step: '02',
      focus: '百万级连接',
      scenarioId: 'many-connections',
      question:
        '现在有 5,000,000 条 socket 必须保持打开。什么会最先耗尽？它又会逼着设计变成什么样？',
      reveal:
        '连接内存远在 CPU 之前先耗尽。上百万条活跃 socket 一台机器装不下，所以你需要一个 gateway 集群 —— 而一旦连接横跨多个节点，一次发送就得找出哪个节点持有收件人，这就逼出一个把 user/device 映射到 gateway 的 session registry。',
      takeaway: '要持有上百万条 socket，就得用 gateway 集群加一个 session registry 在它们之间路由。',
    },
    {
      id: 'group-fanout',
      step: '03',
      focus: '大群聊',
      scenarioId: 'large-groups',
      question:
        '每秒 200k 次发送进入约 2,000 人的群。为什么按入站消息速率来扩容是个错的数？',
      reveal:
        '因为群聊会放大：每次发送变成「群大小」次投递，所以每秒 200k 次进入 2,000 人的群，就是每秒数亿次投递。这该交给一个专门的路由 / fan-out 层（pub/sub 式）把一次 publish 展开给每个成员，而不是让发送者内联做 N 次写入。',
      takeaway: '按 fan-out（消息数 × 群大小）扩容，而不是按原始的入站消息速率。',
    },
    {
      id: 'offline-inbox',
      step: '04',
      focus: '离线 + 多设备',
      scenarioId: 'offline-multidevice',
      question:
        '只有约 25% 的收件人在线，且每个用户有约 4 台设备。给那离线的大多数人的消息去哪了？',
      reveal:
        '进一个持久化的 per-user inbox queue，每台设备一个 cursor，这样每台设备重连时就能拉取它错过的内容。多设备会把每次投递翻倍，离线设备靠异步 push（APNs/FCM）唤醒，而不是靠活跃 socket。现在 fan-out 大多是往 inbox 写入，而非实时发送。',
      takeaway: '离线和多设备用户需要持久化的 per-device inbox 加异步 push，光靠实时投递不够。',
    },
    {
      id: 'global-regions',
      step: '05',
      focus: '全球、多 region',
      scenarioId: 'global-messenger',
      question:
        '数亿条 socket 终结在 10 个 region。在单个 region 里搞一个 gateway 集群加 inbox 就够了吗？',
      reveal:
        '不够。你要在离每个用户最近的 region 终结连接，好把往返时延压短，再用一条跨 region 路由 backbone 把消息送到收件人当前连着的地方。session registry 和 inbox 变成按 region 分区，presence 和回执也必须跨 region 传播。',
      takeaway: '在全球范围，按 region 终结 socket，再经一条 backbone 把消息路由到收件人所在处。',
    },
  ],
  analyze: analyzeChatMessagingWorkload,
};

function analyzeChatMessagingWorkload(workload: WorkloadValues): LabAnalysis {
  const concurrentConnections = numericValue(workload, 'concurrentConnections');
  const messagesPerSecond = numericValue(workload, 'messagesPerSecond');
  const averageGroupSize = numericValue(workload, 'averageGroupSize');
  const onlineRatio = numericValue(workload, 'onlineRatio');
  const historyRetentionSeconds = numericValue(workload, 'historyRetentionSeconds');
  const devicesPerUser = numericValue(workload, 'devicesPerUser');
  const globalRegions = numericValue(workload, 'globalRegions');
  const endToEndEncryption = Boolean(workload.endToEndEncryption);
  const readReceipts = Boolean(workload.readReceipts);

  // Deliveries before online/offline split: each send hits every group member, on every device.
  const deliveriesPerSecond = messagesPerSecond * averageGroupSize * devicesPerUser;
  const onlineFraction = onlineRatio / 100;
  const liveDeliveriesPerSecond = deliveriesPerSecond * onlineFraction;
  const offlineDeliveriesPerSecond = deliveriesPerSecond * (1 - onlineFraction);

  // Presence churn + read receipts: receipts add a return event per live delivery.
  const presenceUpdatesPerSecond =
    concurrentConnections * 0.05 + (readReceipts ? liveDeliveriesPerSecond : 0);

  const connectionMemoryGigabytes = (concurrentConnections * bytesPerConnection) / 1_000_000_000;
  const storedMessagesPerRegion =
    (messagesPerSecond * historyRetentionSeconds) / Math.max(globalRegions, 1);
  const storageGigabytes = (storedMessagesPerRegion * bytesPerStoredMessage) / 1_000_000_000;

  const needsGatewayFleet = concurrentConnections > connectionsPerGatewayNode;
  const needsSessionRegistry = needsGatewayFleet || globalRegions > 1;
  const needsFanout =
    averageGroupSize > 8 || deliveriesPerSecond > comfortableRoutingFanoutPerSecond;
  const needsInbox =
    onlineRatio < 90 || devicesPerUser > 1 || offlineDeliveriesPerSecond > comfortableInboxWritesPerSecond;
  const needsPresence =
    presenceUpdatesPerSecond > comfortablePresenceUpdatesPerSecond || readReceipts || needsGatewayFleet;
  const needsCrossRegion = globalRegions > 1;
  const needsPush = needsInbox;

  const flags = {
    needsGatewayFleet,
    needsSessionRegistry,
    needsFanout,
    needsInbox,
    needsPresence,
    needsCrossRegion,
    needsPush,
    endToEndEncryption,
    readReceipts,
  };

  const crossRegionPressure = globalRegions > 1 ? (globalRegions - 1) / 4 : 0;
  const gigabytesPerGatewayNode = (connectionsPerGatewayNode * bytesPerConnection) / 1_000_000_000;
  const gatewayState = !needsGatewayFleet
    ? 'ok'
    : connectionMemoryGigabytes > gigabytesPerGatewayNode * 8
      ? 'overloaded'
      : 'needed';

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      gateway: gatewayState,
      sessionRegistry: needsSessionRegistry ? 'needed' : 'inactive',
      router: needsFanout ? 'needed' : 'ok',
      presence: needsPresence ? 'needed' : 'inactive',
      messageStore: 'ok',
      inbox: needsInbox ? 'needed' : 'inactive',
      pushService: needsPush ? 'needed' : 'inactive',
    },
    flowStates: {
      clientToGateway: 'active',
      gatewayToSessionRegistry: needsSessionRegistry ? 'active' : 'inactive',
      gatewayToRouter: 'active',
      routerToPresence: needsPresence ? 'active' : 'inactive',
      routerToMessageStore: 'active',
      routerToInbox: needsInbox ? 'active' : 'inactive',
      inboxToPushService: needsPush ? 'active' : 'inactive',
      routerToPushService: needsPush ? 'warning' : 'inactive',
    },
    meters: {
      connectionMemory: {
        ratio: connectionMemoryGigabytes / gigabytesPerGatewayNode,
        valueText: formatStorageGigabytes(connectionMemoryGigabytes),
        copy: needsGatewayFleet
          ? `${formatCount(concurrentConnections)} 条活跃 socket 需要一个 gateway 集群；单个节点大约容纳 ${formatCount(connectionsPerGatewayNode)} 条。`
          : `${formatCount(concurrentConnections)} 条活跃 socket 一台 gateway 机器就能轻松装下。`,
      },
      fanoutRate: {
        ratio: deliveriesPerSecond / comfortableRoutingFanoutPerSecond,
        valueText: `${formatRate(deliveriesPerSecond)}/s`,
        copy: needsFanout
          ? `每次发送命中约 ${formatCount(averageGroupSize)} 名成员、横跨 ${formatCount(devicesPerUser)} 台 device，所以 ${formatRate(messagesPerSecond)}/s 变成 ${formatRate(deliveriesPerSecond)}/s 的投递。`
          : `小群让投递量贴近 ${formatRate(messagesPerSecond)}/s 的发送速率。`,
      },
      inboxStorage: {
        ratio: storageGigabytes / 2_000,
        valueText: formatStorageGigabytes(storageGigabytes),
        copy: `${formatCount(messagesPerSecond)}/s 保留 ${formatDurationDays(historyRetentionSeconds)}，大约是每个 region ${formatStorageGigabytes(storageGigabytes)} 的历史和 inbox。`,
      },
      presenceCost: {
        ratio: presenceUpdatesPerSecond / comfortablePresenceUpdatesPerSecond,
        valueText: `${formatRate(presenceUpdatesPerSecond)}/s`,
        copy: readReceipts
          ? `presence 变动加上每次投递的一条已读回执，带来约 ${formatRate(presenceUpdatesPerSecond)}/s 的状态事件。`
          : `光是 presence 变动就带来约 ${formatRate(presenceUpdatesPerSecond)}/s 的状态事件。`,
      },
      crossRegion: {
        ratio: crossRegionPressure,
        valueText: `${formatCount(globalRegions)} 个 region`,
        copy:
          globalRegions > 1
            ? 'socket 按 region 终结，所以需要一条路由 backbone 把消息送到收件人当前连着的地方。'
            : '单个 region 终结所有连接，所以暂时不需要跨 region 路由。',
      },
    },
    decisions: buildDecisions({
      ...flags,
      concurrentConnections,
      averageGroupSize,
      deliveriesPerSecond,
      onlineRatio,
      devicesPerUser,
      globalRegions,
    }),
    reasons: buildReasons({
      ...flags,
      concurrentConnections,
      connectionMemoryGigabytes,
      messagesPerSecond,
      averageGroupSize,
      deliveriesPerSecond,
      offlineDeliveriesPerSecond,
      onlineRatio,
      devicesPerUser,
      storageGigabytes,
      globalRegions,
    }),
  };
}

type ArchitectureFlags = {
  needsGatewayFleet: boolean;
  needsSessionRegistry: boolean;
  needsFanout: boolean;
  needsInbox: boolean;
  needsPresence: boolean;
  needsCrossRegion: boolean;
  needsPush: boolean;
  endToEndEncryption: boolean;
  readReceipts: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    concurrentConnections: number;
    connectionMemoryGigabytes: number;
    messagesPerSecond: number;
    averageGroupSize: number;
    deliveriesPerSecond: number;
    offlineDeliveriesPerSecond: number;
    onlineRatio: number;
    devicesPerUser: number;
    storageGigabytes: number;
    globalRegions: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsGatewayFleet) {
    reasons.push({
      severity: analysis.connectionMemoryGigabytes > connectionsPerGatewayNode * bytesPerConnection / 1_000_000_000 * 4 ? 'danger' : 'warning',
      text: `${formatCount(
        analysis.concurrentConnections,
      )} 条活跃 socket（约 ${formatStorageGigabytes(
        analysis.connectionMemoryGigabytes,
      )} 的 buffer）超出了一台机器；把它们摊到一个 gateway 集群上。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '连接数一台 socket server 就能装下，所以暂时不需要 gateway 集群。',
    });
  }

  if (analysis.needsSessionRegistry) {
    reasons.push({
      severity: 'warning',
      text: 'socket 摊到多个节点后，一次发送必须查出哪个 gateway 持有收件人，所以用一个 session registry 把每个 user/device 映射到它的 server。',
    });
  }

  if (analysis.needsFanout) {
    reasons.push({
      severity: analysis.deliveriesPerSecond > comfortableRoutingFanoutPerSecond * 4 ? 'danger' : 'warning',
      text: `${formatRate(
        analysis.messagesPerSecond,
      )}/s 进入约 ${formatCount(
        analysis.averageGroupSize,
      )} 人的群，是 ${formatRate(
        analysis.deliveriesPerSecond,
      )}/s 的投递；用一个专门的路由 / fan-out 层来展开每次发送。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `约 ${formatCount(
        analysis.averageGroupSize,
      )} 人的群让投递量贴近 ${formatRate(
        analysis.messagesPerSecond,
      )}/s 的发送速率，所以 server 可以内联路由每条消息。`,
    });
  }

  reasons.push({
    severity: analysis.storageGigabytes > 2_000 ? 'warning' : 'ok',
    text: `保留 ${formatRate(
      analysis.messagesPerSecond,
    )}/s 的消息，会为离线和多设备同步留下每个 region 约 ${formatStorageGigabytes(
      analysis.storageGigabytes,
    )} 的历史。`,
  });

  if (analysis.needsInbox) {
    reasons.push({
      severity: 'warning',
      text: `只有 ${Math.round(
        analysis.onlineRatio,
      )}% 在线、每用户 ${formatCount(
        analysis.devicesPerUser,
      )} 台 device，意味着大多数投递都是持久化的 inbox 写入，等重连时再拉取。`,
    });
  }

  if (analysis.readReceipts) {
    reasons.push({
      severity: 'ok',
      text: '已读回执给每个收件人和设备各加一个已送达 / 已读事件，把 presence service 承载的状态流量翻了一倍。',
    });
  }

  if (analysis.endToEndEncryption) {
    reasons.push({
      severity: 'ok',
      text: 'End-to-end encryption 意味着服务端只路由和存储密文；fan-out 基于收件人列表和 metadata，而非消息内容。',
    });
  }

  if (analysis.needsCrossRegion) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(
        analysis.globalRegions,
      )} 个 region 各自就近终结连接，所以用一条跨 region backbone 把每条消息路由到它收件人连着的地方。`,
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    concurrentConnections: number;
    averageGroupSize: number;
    deliveriesPerSecond: number;
    onlineRatio: number;
    devicesPerUser: number;
    globalRegions: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    connectionLayer: {
      state: flags.needsGatewayFleet ? 'needed' : 'useful',
      copy: flags.needsGatewayFleet
        ? `为 ${formatCount(flags.concurrentConnections)} 条 socket 跑一个 gateway 集群，并维护一个把每个 user/device 映射到其节点的 session registry。`
        : '连接数还小时，一台 socket server 就能持有所有连接。',
    },
    routing: {
      state: flags.needsFanout ? 'needed' : flags.needsSessionRegistry ? 'useful' : 'not-yet',
      copy: flags.needsFanout
        ? '通过一个 pub/sub 式的 fan-out 层路由，让一次 publish 触达每个成员，而不用发送者做 N 次内联写入。'
        : flags.needsSessionRegistry
          ? '一个轻量 router 用 session registry 把每条消息转发给持有它的 gateway。'
          : '单台 server 在它已经持有的两条 socket 之间直接路由。',
    },
    fanout: {
      state: flags.needsFanout ? 'needed' : 'not-yet',
      copy: flags.needsFanout
        ? `群组放大把发送变成 ${formatRate(flags.deliveriesPerSecond)}/s 的投递，所以 fan-out 必须自成一层。`
        : '群很小，所以一次发送只内联展开给寥寥几个收件人。',
    },
    inbox: {
      state: flags.needsInbox ? 'needed' : 'not-yet',
      copy: flags.needsInbox
        ? '给每台收件设备一个带自己 cursor 的持久化 inbox queue，让它重连时能同步错过的消息。'
        : '几乎所有人都在单台设备上在线，所以实时投递就够了，不需要持久化 inbox。',
    },
    presence: {
      state: flags.needsPresence ? 'needed' : 'not-yet',
      copy: flags.needsPresence
        ? '一个 presence service 追踪在线状态，并跨 gateway 传播已送达 / 已读回执。'
        : 'presence 和回执还轻量，暂时放在单台 server 上即可。',
    },
    encryption: {
      state: flags.endToEndEncryption ? 'tradeoff' : 'not-yet',
      copy: flags.endToEndEncryption
        ? 'End-to-end encryption 拿掉了服务端对内容的访问权；路由、search 和服务端预览都得改成适配密文。'
        : '消息在传输和落盘时加密，但服务端可读，让 fan-out 和各项功能保持简单。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsGatewayFleet && !flags.needsFanout && !flags.needsInbox && !flags.needsCrossRegion) {
    return '单台 socket server + database';
  }
  if (flags.needsCrossRegion) {
    return '多 region gateway + 跨 region 路由';
  }
  if (flags.needsInbox && flags.needsFanout) {
    return 'Gateway 集群 + fan-out + 持久化 inbox';
  }
  if (flags.needsFanout) {
    return 'Gateway 集群 + 路由 / fan-out 层';
  }
  if (flags.needsGatewayFleet) {
    return 'Gateway 集群 + session registry';
  }
  return '单台 socket server + database';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsGatewayFleet && !flags.needsFanout && !flags.needsInbox && !flags.needsCrossRegion) {
    return '一台 socket server 持有所有连接，并在一次聊天的两条 socket 之间直接路由。此外的东西暂时都不值当。';
  }
  if (flags.needsCrossRegion) {
    return '连接在离每个用户最近的 region 终结，一条跨 region backbone 把消息路由到收件人连着的地方，持久化 inbox 加异步 push 让离线的多设备用户保持同步。';
  }
  if (flags.needsInbox && flags.needsFanout) {
    return '一个 gateway 集群持有 socket，一个 fan-out 层把每次发送展开给每个成员，持久化的 per-device inbox 加 push 投递给离线的大多数人。';
  }
  if (flags.needsFanout) {
    return '一个 gateway 集群加一个 session registry 定位收件人，一个路由 / fan-out 层把每次发送展开给每个群成员。';
  }
  if (flags.needsGatewayFleet) {
    return '一个 gateway 集群把 socket 摊到多个节点上，一个 session registry 把每个 user/device 映射到持有其连接的节点。';
  }
  return '一台 socket server 仍能覆盖这份负载。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsGatewayFleet && !flags.needsFanout && !flags.needsInbox && !flags.needsCrossRegion) {
    return '发送 -> socket server -> 收件人 socket';
  }
  if (flags.needsCrossRegion) {
    return '发送 -> 区域 gateway -> 跨 region router -> fan-out -> inbox / 活跃 socket';
  }
  if (flags.needsInbox && flags.needsFanout) {
    return '发送 -> gateway -> router/fan-out -> 活跃 socket + per-device inbox -> push';
  }
  if (flags.needsFanout) {
    return '发送 -> gateway -> session registry -> router/fan-out -> 成员 gateway';
  }
  if (flags.needsGatewayFleet) {
    return '发送 -> gateway -> session registry -> 收件人 gateway';
  }
  return '发送 -> socket server -> 收件人 socket';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function formatDurationDays(seconds: number): string {
  const days = seconds / 86_400;
  if (days >= 365) {
    return `${(days / 365).toFixed(days >= 730 ? 0 : 1)} 年`;
  }
  if (days >= 1) {
    return `${Math.round(days)} 天`;
  }
  return `${Math.round(seconds / 3600)} 小时`;
}
