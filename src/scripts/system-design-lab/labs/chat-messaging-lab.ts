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
  eyebrow: 'System Design Lab',
  title: 'A chat backend is a connection problem first: millions of live sockets must be tracked, then a message fanned out to everyone who should receive it.',
  summary:
    'Change concurrent connections, message rate, group size, the online ratio, history retention, devices per user, and regions. The design moves from a single socket server to a gateway fleet with a session registry, a routing and fan-out tier with a presence service, durable per-user inboxes, and finally cross-region routing with offline push.',
  controls: [
    {
      id: 'concurrentConnections',
      label: 'Concurrent connections',
      help: 'Live WebSocket/long-lived TCP sockets held open at once. This sets the gateway memory floor.',
      min: 100,
      max: 500_000_000,
      defaultValue: 50_000,
      scale: 'log',
      unit: 'connections',
      format: 'count',
    },
    {
      id: 'messagesPerSecond',
      label: 'Messages sent',
      help: 'Inbound messages per second before group amplification. Each one may fan out to many recipients.',
      min: 1,
      max: 50_000_000,
      defaultValue: 5_000,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'averageGroupSize',
      label: 'Average group size',
      help: 'Recipients per message. A 1:1 chat is 2; a large group multiplies every send into many deliveries.',
      min: 2,
      max: 100_000,
      defaultValue: 2,
      scale: 'log',
      unit: 'members',
      format: 'count',
    },
    {
      id: 'onlineRatio',
      label: 'Online ratio',
      help: 'Share of recipients currently connected. The rest must be written to a durable inbox for later.',
      min: 1,
      max: 100,
      defaultValue: 60,
      scale: 'linear',
      format: 'percentage',
    },
    {
      id: 'historyRetentionSeconds',
      label: 'History retention',
      help: 'How long messages are kept so offline and multi-device users can sync them later.',
      min: 3_600,
      max: 315_360_000,
      defaultValue: 2_592_000,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'devicesPerUser',
      label: 'Devices per user',
      help: 'Active devices per account. Every delivery is multiplied so each device stays in sync.',
      min: 1,
      max: 10,
      defaultValue: 1,
      scale: 'linear',
      unit: 'devices',
      format: 'count',
    },
    {
      id: 'globalRegions',
      label: 'Regions',
      help: 'Regions terminating connections close to users; cross-region sends must be routed between them.',
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
      id: 'endToEndEncryption',
      label: 'End-to-end encryption',
      help: 'Encrypt on the device so the server only routes ciphertext; it cannot fan out by reading content.',
      defaultValue: false,
    },
    {
      id: 'readReceipts',
      label: 'Read receipts',
      help: 'Track delivered/read state per recipient and device, adding a return event for every message.',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'small-1on1',
      step: '01',
      title: 'Small 1:1 app',
      summary: 'A few thousand sockets exchanging direct messages.',
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
      title: 'Millions of connections',
      summary: 'Live sockets outgrow what one server can hold.',
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
      title: 'Large group chats',
      summary: 'One send fans out to thousands of members.',
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
      title: 'Offline + multi-device',
      summary: 'Most recipients are offline or on several devices.',
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
      title: 'Global messenger',
      summary: 'Hundreds of millions of sockets across regions.',
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
    title: 'Real-time chat / messaging architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a chat backend: clients on persistent sockets, a connection gateway fleet with a session registry, a routing and fan-out tier with a presence service, durable message and per-user inbox stores, and an async push tier for offline devices.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'persistent socket',
            summary: 'holds a long-lived WebSocket to send and receive messages in real time',
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
            subtitle: 'holds sockets',
            summary: 'terminates persistent connections and keeps each live socket in memory',
          },
          {
            id: 'sessionRegistry',
            title: 'Session registry',
            subtitle: 'user to server',
            summary: 'maps each online user/device to the gateway node that holds its socket',
          },
        ],
      },
      {
        id: 'routing',
        label: 'Routing + presence',
        variant: 'backbone',
        nodes: [
          {
            id: 'router',
            title: 'Router / fan-out',
            subtitle: 'message to members',
            summary: 'expands a send to every group member and routes each to the right gateway',
          },
          {
            id: 'presence',
            title: 'Presence',
            subtitle: 'online + receipts',
            summary: 'tracks who is online and propagates delivered/read receipts',
          },
        ],
      },
      {
        id: 'storage',
        label: 'Message store',
        variant: 'storage',
        nodes: [
          {
            id: 'messageStore',
            title: 'Message store',
            subtitle: 'durable log',
            summary: 'persists every message so history survives restarts and late syncs',
          },
          {
            id: 'inbox',
            title: 'Per-user inbox',
            subtitle: 'offline queue',
            summary: 'queues messages per recipient device until it reconnects and pulls them',
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
            subtitle: 'wake devices',
            summary: 'sends APNs/FCM notifications to wake offline devices so they sync',
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
    { id: 'connectionMemory', label: 'Connection memory' },
    { id: 'fanoutRate', label: 'Message fan-out rate' },
    { id: 'inboxStorage', label: 'Inbox + history storage' },
    { id: 'presenceCost', label: 'Presence + receipt cost' },
    { id: 'crossRegion', label: 'Cross-region routing' },
  ],
  decisions: [
    { id: 'connectionLayer', title: 'Connection / session layer' },
    { id: 'routing', title: 'Message routing' },
    { id: 'fanout', title: 'Group fan-out' },
    { id: 'inbox', title: 'Offline inbox' },
    { id: 'presence', title: 'Presence service' },
    { id: 'encryption', title: 'End-to-end encryption' },
  ],
  sourceBackedRules: [
    {
      title: 'A WebSocket is a persistent, full-duplex connection the server must keep open',
      source: 'MDN Web Docs',
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API',
      summary:
        'Each chat client holds one long-lived connection, so the gateway tier is sized by how many open sockets it can keep in memory, not by request rate.',
    },
    {
      title: 'Publish/subscribe decouples senders from the many recipients of a message',
      source: 'Google Cloud Pub/Sub',
      url: 'https://cloud.google.com/pubsub/docs/overview',
      summary:
        'Fan-out to a group is naturally a pub/sub problem: one publish is delivered to every subscriber, which is how a router expands a send to many members.',
    },
    {
      title: 'A durable message queue lets offline recipients receive messages later',
      source: 'AWS SQS',
      url: 'https://aws.amazon.com/sqs/',
      summary:
        'A per-user inbox queue holds messages for disconnected or multi-device users until each device reconnects and drains its queue.',
    },
    {
      title: 'End-to-end encryption means the server routes ciphertext it cannot read',
      source: 'Signal Protocol',
      url: 'https://signal.org/docs/',
      summary:
        'With E2EE the server can fan out and store messages but cannot inspect content, so server-side features must work on ciphertext and metadata only.',
    },
  ],
  teachingAssumptions: [
    'Each live socket is charged a fixed memory budget (kernel plus app buffers plus session state); real costs vary by stack.',
    'Fan-out rate is messages per second times average group size times devices per user; presence and receipts add return events on top.',
    'Single-node gateway, routing, inbox-write, and presence budgets are conservative teaching numbers, not vendor limits.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-socket-server',
      step: '01',
      focus: 'A few thousand sockets',
      scenarioId: 'small-1on1',
      question:
        'A small 1:1 app holds ~5k connections doing 200 direct messages/s. Do you need anything beyond one socket server and one database?',
      reveal:
        'No. 5k open sockets fit in one box, and a 1:1 send fans out to just the other party. A session registry, a dedicated fan-out tier, and offline push are all premature — the one server already knows where both sockets are.',
      takeaway: 'Start simplest: one socket server can both hold the connections and route between them.',
    },
    {
      id: 'connection-fleet',
      step: '02',
      focus: 'Millions of connections',
      scenarioId: 'many-connections',
      question:
        'Now 5,000,000 sockets must stay open. What runs out first, and what does that force into the design?',
      reveal:
        'Connection memory runs out long before CPU. Millions of live sockets cannot fit on one box, so you need a gateway fleet — and the moment connections span many nodes, a send must find which node holds the recipient, which forces a session registry mapping user/device to gateway.',
      takeaway: 'Holding millions of sockets forces a gateway fleet plus a session registry to route between them.',
    },
    {
      id: 'group-fanout',
      step: '03',
      focus: 'Large group chats',
      scenarioId: 'large-groups',
      question:
        '200k sends/s into groups of ~2,000 members. Why is the inbound message rate the wrong number to scale on?',
      reveal:
        'Because group chat amplifies: each send becomes group-size deliveries, so 200k/s into 2,000-member groups is hundreds of millions of deliveries per second. That belongs in a dedicated routing/fan-out tier (pub/sub-style) that expands one publish to every member, instead of the sender doing N writes inline.',
      takeaway: 'Scale on fan-out (messages times group size), not on raw inbound message rate.',
    },
    {
      id: 'offline-inbox',
      step: '04',
      focus: 'Offline + multi-device',
      scenarioId: 'offline-multidevice',
      question:
        'Only ~25% of recipients are online and each user has ~4 devices. Where do messages for the offline majority go?',
      reveal:
        'Into a durable per-user inbox queue, one cursor per device, so each device pulls what it missed when it reconnects. Multi-device multiplies every delivery, and offline devices are woken by an async push (APNs/FCM) rather than a live socket. Fan-out is now mostly writes to inboxes, not live sends.',
      takeaway: 'Offline and multi-device users need durable per-device inboxes plus async push, not just live delivery.',
    },
    {
      id: 'global-regions',
      step: '05',
      focus: 'Global, many regions',
      scenarioId: 'global-messenger',
      question:
        'Hundreds of millions of sockets terminate across 10 regions. Is a gateway fleet plus inbox in one region enough?',
      reveal:
        'No. You terminate connections in the region nearest each user to keep round trips short, and a cross-region routing backbone moves a message to wherever the recipients are connected. The session registry and inboxes become regionally partitioned, and presence and receipts must propagate across regions too.',
      takeaway: 'Globally, terminate sockets per region and route messages across a backbone to where recipients live.',
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
          ? `${formatCount(concurrentConnections)} live sockets need a gateway fleet; one node holds about ${formatCount(connectionsPerGatewayNode)}.`
          : `${formatCount(concurrentConnections)} live sockets fit comfortably on one gateway box.`,
      },
      fanoutRate: {
        ratio: deliveriesPerSecond / comfortableRoutingFanoutPerSecond,
        valueText: `${formatRate(deliveriesPerSecond)}/s`,
        copy: needsFanout
          ? `Each send hits ~${formatCount(averageGroupSize)} members across ${formatCount(devicesPerUser)} ${pluralize('device', devicesPerUser)}, so ${formatRate(messagesPerSecond)}/s becomes ${formatRate(deliveriesPerSecond)}/s of deliveries.`
          : `Small groups keep deliveries close to the ${formatRate(messagesPerSecond)}/s send rate.`,
      },
      inboxStorage: {
        ratio: storageGigabytes / 2_000,
        valueText: formatStorageGigabytes(storageGigabytes),
        copy: `${formatCount(messagesPerSecond)}/s retained for ${formatDurationDays(historyRetentionSeconds)} is about ${formatStorageGigabytes(storageGigabytes)} per region of history and inbox.`,
      },
      presenceCost: {
        ratio: presenceUpdatesPerSecond / comfortablePresenceUpdatesPerSecond,
        valueText: `${formatRate(presenceUpdatesPerSecond)}/s`,
        copy: readReceipts
          ? `Presence churn plus a read receipt per delivery drives about ${formatRate(presenceUpdatesPerSecond)}/s of status events.`
          : `Presence churn alone drives about ${formatRate(presenceUpdatesPerSecond)}/s of status events.`,
      },
      crossRegion: {
        ratio: crossRegionPressure,
        valueText: `${formatCount(globalRegions)} ${pluralize('region', globalRegions)}`,
        copy:
          globalRegions > 1
            ? 'Sockets terminate per region, so a routing backbone moves messages to wherever recipients are connected.'
            : 'A single region terminates every connection, so no cross-region routing is needed yet.',
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
      )} live sockets (~${formatStorageGigabytes(
        analysis.connectionMemoryGigabytes,
      )} of buffers) exceed one box; spread them across a gateway fleet.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'The connection count fits on a single socket server, so no gateway fleet is needed yet.',
    });
  }

  if (analysis.needsSessionRegistry) {
    reasons.push({
      severity: 'warning',
      text: 'With sockets spread across nodes, a send must look up which gateway holds the recipient, so a session registry maps each user/device to its server.',
    });
  }

  if (analysis.needsFanout) {
    reasons.push({
      severity: analysis.deliveriesPerSecond > comfortableRoutingFanoutPerSecond * 4 ? 'danger' : 'warning',
      text: `${formatRate(
        analysis.messagesPerSecond,
      )}/s into ~${formatCount(
        analysis.averageGroupSize,
      )}-member groups is ${formatRate(
        analysis.deliveriesPerSecond,
      )}/s of deliveries; a dedicated routing/fan-out tier expands each send.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `Groups of ~${formatCount(
        analysis.averageGroupSize,
      )} keep deliveries near the ${formatRate(
        analysis.messagesPerSecond,
      )}/s send rate, so the server can route each message inline.`,
    });
  }

  reasons.push({
    severity: analysis.storageGigabytes > 2_000 ? 'warning' : 'ok',
    text: `Retaining ${formatRate(
      analysis.messagesPerSecond,
    )}/s of messages keeps about ${formatStorageGigabytes(
      analysis.storageGigabytes,
    )} of history per region for offline and multi-device sync.`,
  });

  if (analysis.needsInbox) {
    reasons.push({
      severity: 'warning',
      text: `Only ${Math.round(
        analysis.onlineRatio,
      )}% online and ${formatCount(
        analysis.devicesPerUser,
      )} ${pluralize(
        'device',
        analysis.devicesPerUser,
      )} per user means most deliveries are durable inbox writes pulled on reconnect.`,
    });
  }

  if (analysis.readReceipts) {
    reasons.push({
      severity: 'ok',
      text: 'Read receipts add a delivered/read event per recipient and device, doubling the status traffic the presence service carries.',
    });
  }

  if (analysis.endToEndEncryption) {
    reasons.push({
      severity: 'ok',
      text: 'End-to-end encryption means the server routes and stores ciphertext only; fan-out works on recipient lists and metadata, not message content.',
    });
  }

  if (analysis.needsCrossRegion) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(
        analysis.globalRegions,
      )} regions terminate connections locally, so a cross-region backbone routes each message to where its recipients are connected.`,
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
        ? `Run a gateway fleet for ${formatCount(flags.concurrentConnections)} sockets and keep a session registry mapping each user/device to its node.`
        : 'One socket server can hold every connection while the count is small.',
    },
    routing: {
      state: flags.needsFanout ? 'needed' : flags.needsSessionRegistry ? 'useful' : 'not-yet',
      copy: flags.needsFanout
        ? 'Route through a pub/sub-style fan-out tier so one publish reaches every member without the sender doing N inline writes.'
        : flags.needsSessionRegistry
          ? 'A thin router uses the session registry to forward each message to the holding gateway.'
          : 'The single server routes directly between the two sockets it already holds.',
    },
    fanout: {
      state: flags.needsFanout ? 'needed' : 'not-yet',
      copy: flags.needsFanout
        ? `Group amplification turns sends into ${formatRate(flags.deliveriesPerSecond)}/s of deliveries, so fan-out must be its own tier.`
        : 'Groups are small, so a send expands to only a couple of recipients inline.',
    },
    inbox: {
      state: flags.needsInbox ? 'needed' : 'not-yet',
      copy: flags.needsInbox
        ? 'Give each recipient device a durable inbox queue with its own cursor so it can sync missed messages on reconnect.'
        : 'Nearly everyone is online on one device, so live delivery is enough without durable inboxes.',
    },
    presence: {
      state: flags.needsPresence ? 'needed' : 'not-yet',
      copy: flags.needsPresence
        ? 'A presence service tracks online state and propagates delivered/read receipts across gateways.'
        : 'Presence and receipts are light enough to keep on the single server for now.',
    },
    encryption: {
      state: flags.endToEndEncryption ? 'tradeoff' : 'not-yet',
      copy: flags.endToEndEncryption
        ? 'End-to-end encryption removes server-side content access; routing, search, and server-side previews must adapt to ciphertext.'
        : 'Messages are encrypted in transit and at rest but readable by the server, keeping fan-out and features simple.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsGatewayFleet && !flags.needsFanout && !flags.needsInbox && !flags.needsCrossRegion) {
    return 'Single socket server + database';
  }
  if (flags.needsCrossRegion) {
    return 'Multi-region gateways + cross-region routing';
  }
  if (flags.needsInbox && flags.needsFanout) {
    return 'Gateway fleet + fan-out + durable inboxes';
  }
  if (flags.needsFanout) {
    return 'Gateway fleet + routing / fan-out tier';
  }
  if (flags.needsGatewayFleet) {
    return 'Gateway fleet + session registry';
  }
  return 'Single socket server + database';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsGatewayFleet && !flags.needsFanout && !flags.needsInbox && !flags.needsCrossRegion) {
    return 'One socket server holds every connection and routes directly between the two sockets in a chat. Nothing else is justified yet.';
  }
  if (flags.needsCrossRegion) {
    return 'Connections terminate in the region nearest each user, a cross-region backbone routes messages to where recipients are connected, and durable inboxes plus async push keep offline multi-device users in sync.';
  }
  if (flags.needsInbox && flags.needsFanout) {
    return 'A gateway fleet holds the sockets, a fan-out tier expands each send to every member, and durable per-device inboxes plus push deliver to the offline majority.';
  }
  if (flags.needsFanout) {
    return 'A gateway fleet plus a session registry locate recipients, and a routing/fan-out tier expands each send to every group member.';
  }
  if (flags.needsGatewayFleet) {
    return 'A gateway fleet spreads the sockets across many nodes, and a session registry maps each user/device to the node holding its connection.';
  }
  return 'One socket server still covers the workload.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsGatewayFleet && !flags.needsFanout && !flags.needsInbox && !flags.needsCrossRegion) {
    return 'Send -> socket server -> recipient socket';
  }
  if (flags.needsCrossRegion) {
    return 'Send -> regional gateway -> cross-region router -> fan-out -> inbox / live socket';
  }
  if (flags.needsInbox && flags.needsFanout) {
    return 'Send -> gateway -> router/fan-out -> live sockets + per-device inboxes -> push';
  }
  if (flags.needsFanout) {
    return 'Send -> gateway -> session registry -> router/fan-out -> member gateways';
  }
  if (flags.needsGatewayFleet) {
    return 'Send -> gateway -> session registry -> recipient gateway';
  }
  return 'Send -> socket server -> recipient socket';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function pluralize(unit: string, value: number): string {
  return Math.round(value) === 1 ? unit : `${unit}s`;
}

function formatDurationDays(seconds: number): string {
  const days = seconds / 86_400;
  if (days >= 365) {
    return `${(days / 365).toFixed(days >= 730 ? 0 : 1)} ${Math.round(days / 365) === 1 ? 'year' : 'years'}`;
  }
  if (days >= 1) {
    return `${Math.round(days)} ${Math.round(days) === 1 ? 'day' : 'days'}`;
  }
  return `${Math.round(seconds / 3600)} hr`;
}
