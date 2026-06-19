import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatRate } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative teaching budgets, not vendor limits.
const synchronousProviderBudgetMs = 200;
const comfortableQueueIngestPerSecond = 50_000;
const comfortableWorkerSendsPerSecond = 30_000;
const comfortableDlqShare = 0.05;
const comfortablePreferenceLookupsPerSecond = 100_000;

export const notificationSystemLabDefinition: SystemDesignLabDefinition = {
  id: 'notification-system',
  eyebrow: 'System Design Lab',
  title: 'A notification system is a fan-out pipeline whose hardest job is decoupling fast producers from slow, unreliable providers.',
  summary:
    'Change the request rate, fan-out per notification, channels per notification, user base, provider latency, retry attempts, and per-user send cap. The design moves from a direct synchronous send to a durable queue with channel workers, multi-channel routing, dedup plus rate-limit plus preference filtering, and finally high-volume retries with a dead-letter queue and delivery analytics.',
  controls: [
    {
      id: 'requestsPerSecond',
      label: 'Notification requests',
      help: 'Inbound notification requests accepted by the ingest API per second.',
      min: 1,
      max: 200_000,
      defaultValue: 50,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'recipientsPerNotification',
      label: 'Fan-out per notification',
      help: 'Recipients a single request expands into (1 = direct, large = broadcast).',
      min: 1,
      max: 10_000_000,
      defaultValue: 1,
      scale: 'log',
      unit: 'recipients',
      format: 'count',
    },
    {
      id: 'channelsPerNotification',
      label: 'Channels per notification',
      help: 'How many delivery channels (push, email, SMS) each notification targets.',
      min: 1,
      max: 3,
      defaultValue: 1,
      scale: 'linear',
      unit: 'channels',
      format: 'count',
    },
    {
      id: 'totalUsers',
      label: 'Total users',
      help: 'Registered users whose devices, addresses, and preferences are stored.',
      min: 1_000,
      max: 1_000_000_000,
      defaultValue: 100_000,
      scale: 'log',
      unit: 'users',
      format: 'count',
    },
    {
      id: 'providerLatencyMs',
      label: 'Provider latency',
      help: 'Round-trip time to an external provider (APNs/FCM, SES, Twilio) per send.',
      min: 20,
      max: 5_000,
      defaultValue: 300,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'retryAttempts',
      label: 'Retry attempts',
      help: 'Max delivery retries with exponential backoff before a message is dead-lettered.',
      min: 0,
      max: 8,
      defaultValue: 2,
      scale: 'linear',
      unit: 'attempts',
      format: 'count',
    },
    {
      id: 'perUserSendCap',
      label: 'Per-user send cap',
      help: 'Maximum notifications allowed per user per minute before rate-limiting drops them.',
      min: 1,
      max: 1_000,
      defaultValue: 60,
      scale: 'log',
      format: 'requests-per-minute',
    },
  ],
  toggles: [
    {
      id: 'dedupAndRateLimit',
      label: 'Dedup + rate-limit',
      help: 'Collapse duplicate sends and enforce the per-user cap so bursts cannot spam a user.',
      defaultValue: false,
    },
    {
      id: 'preferenceFiltering',
      label: 'Preference filtering',
      help: 'Honour user opt-outs, channel choices, and quiet hours before a send is attempted.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'direct-send',
      step: '01',
      title: 'Direct synchronous send',
      summary: 'A trickle of single-recipient pushes sent inline.',
      values: {
        requestsPerSecond: 20,
        recipientsPerNotification: 1,
        channelsPerNotification: 1,
        totalUsers: 20_000,
        providerLatencyMs: 250,
        retryAttempts: 0,
        perUserSendCap: 60,
        dedupAndRateLimit: false,
        preferenceFiltering: false,
      },
    },
    {
      id: 'queue-workers',
      step: '02',
      title: 'Queue + channel workers',
      summary: 'Slow providers force a queue between producers and senders.',
      values: {
        requestsPerSecond: 3_000,
        recipientsPerNotification: 1,
        channelsPerNotification: 1,
        totalUsers: 500_000,
        providerLatencyMs: 800,
        retryAttempts: 1,
        perUserSendCap: 60,
        dedupAndRateLimit: false,
        preferenceFiltering: false,
      },
    },
    {
      id: 'multi-channel',
      step: '03',
      title: 'Multi-channel routing',
      summary: 'One request fans out across push, email, and SMS.',
      values: {
        requestsPerSecond: 8_000,
        recipientsPerNotification: 1,
        channelsPerNotification: 3,
        totalUsers: 5_000_000,
        providerLatencyMs: 600,
        retryAttempts: 2,
        perUserSendCap: 30,
        dedupAndRateLimit: false,
        preferenceFiltering: false,
      },
    },
    {
      id: 'preferences-dedup',
      step: '04',
      title: 'Dedup, limits, preferences',
      summary: 'Marketing blasts need opt-outs, quiet hours, and caps.',
      values: {
        requestsPerSecond: 5_000,
        recipientsPerNotification: 1_000,
        channelsPerNotification: 2,
        totalUsers: 50_000_000,
        providerLatencyMs: 500,
        retryAttempts: 3,
        perUserSendCap: 10,
        dedupAndRateLimit: true,
        preferenceFiltering: true,
      },
    },
    {
      id: 'broadcast-retries',
      step: '05',
      title: 'Broadcast + retries + DLQ',
      summary: 'Mass broadcasts with flaky providers and delivery analytics.',
      values: {
        requestsPerSecond: 2_000,
        recipientsPerNotification: 2_000_000,
        channelsPerNotification: 3,
        totalUsers: 500_000_000,
        providerLatencyMs: 1_500,
        retryAttempts: 6,
        perUserSendCap: 5,
        dedupAndRateLimit: true,
        preferenceFiltering: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'Notification system architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a multi-channel notification system: producers, an ingest API, a decoupling queue with channel workers, external provider adapters, and an async retry/dead-letter plus analytics path.',
    columns: [
      {
        id: 'producers',
        label: 'Producers',
        variant: 'clients',
        nodes: [
          {
            id: 'producer',
            title: 'Producers',
            subtitle: 'app events',
            summary: 'services and triggers that ask for a notification to be sent',
          },
        ],
      },
      {
        id: 'ingest',
        label: 'Ingest API',
        variant: 'edge',
        nodes: [
          {
            id: 'ingestApi',
            title: 'Ingest API',
            subtitle: 'accept + validate',
            summary: 'accepts requests, validates them, and returns fast without blocking on a send',
          },
          {
            id: 'preferenceStore',
            title: 'Preference store',
            subtitle: 'opt-outs + quiet hours',
            summary: 'holds per-user channel choices, opt-outs, and quiet-hour windows',
          },
        ],
      },
      {
        id: 'pipeline',
        label: 'Queue + workers',
        variant: 'backbone',
        nodes: [
          {
            id: 'queue',
            title: 'Message queue',
            subtitle: 'decouple producers',
            summary: 'durable buffer so producers never block on slow providers',
          },
          {
            id: 'channelWorkers',
            title: 'Channel workers',
            subtitle: 'route + dedup',
            summary: 'pull messages, apply dedup and rate-limit, and dispatch per channel',
          },
        ],
      },
      {
        id: 'providers',
        label: 'Provider adapters',
        variant: 'processing',
        nodes: [
          {
            id: 'pushAdapter',
            title: 'Push adapter',
            subtitle: 'APNs / FCM',
            summary: 'sends mobile push through Apple and Google gateways',
          },
          {
            id: 'emailAdapter',
            title: 'Email adapter',
            subtitle: 'SES',
            summary: 'sends email through a transactional email provider',
          },
          {
            id: 'smsAdapter',
            title: 'SMS adapter',
            subtitle: 'Twilio',
            summary: 'sends SMS through a telephony provider',
          },
        ],
      },
      {
        id: 'async',
        label: 'Retry + analytics',
        variant: 'storage',
        nodes: [
          {
            id: 'retryQueue',
            title: 'Retry + DLQ',
            subtitle: 'backoff + dead-letter',
            summary: 'retries failed sends with backoff and parks the unsendable in a dead-letter queue',
          },
          {
            id: 'analytics',
            title: 'Delivery analytics',
            subtitle: 'status events',
            summary: 'collects delivery, bounce, and failure events for dashboards off the hot path',
          },
        ],
      },
    ],
    flows: [
      { from: 'producer', to: 'ingestApi', variant: 'primary' },
      { from: 'ingestApi', to: 'preferenceStore', variant: 'secondary' },
      { from: 'ingestApi', to: 'queue', variant: 'primary' },
      { from: 'queue', to: 'channelWorkers', variant: 'primary' },
      { from: 'channelWorkers', to: 'pushAdapter', variant: 'primary' },
      { from: 'channelWorkers', to: 'emailAdapter', variant: 'secondary' },
      { from: 'channelWorkers', to: 'smsAdapter', variant: 'secondary' },
      { from: 'channelWorkers', to: 'retryQueue', variant: 'secondary' },
      { from: 'channelWorkers', to: 'analytics', variant: 'direct' },
      { from: 'retryQueue', to: 'channelWorkers', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'queueBacklog', label: 'Queue backlog pressure' },
    { id: 'providerThroughput', label: 'Provider-bound throughput' },
    { id: 'fanOut', label: 'Fan-out amplification' },
    { id: 'retryPressure', label: 'Retry / DLQ pressure' },
    { id: 'guardLoad', label: 'Dedup / rate-limit load' },
  ],
  decisions: [
    { id: 'queueModel', title: 'Queue + worker model' },
    { id: 'channelRouting', title: 'Channel routing' },
    { id: 'guards', title: 'Dedup + rate-limit' },
    { id: 'retry', title: 'Retry / backoff + DLQ' },
    { id: 'providerAbstraction', title: 'Provider abstraction' },
    { id: 'preferences', title: 'Preference store' },
  ],
  sourceBackedRules: [
    {
      title: 'A queue decouples fast producers from slow consumers',
      source: 'AWS — Queue-Based Load Leveling',
      url: 'https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/queue-based-load-leveling.html',
      summary:
        'Placing a durable queue between producers and the senders that call slow providers smooths bursts and stops a provider stall from blocking the request path.',
    },
    {
      title: 'Failed deliveries belong in a dead-letter queue after retries',
      source: 'AWS SQS Dead-Letter Queues',
      url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html',
      summary:
        'After a bounded number of failed processing attempts, messages are moved to a dead-letter queue so poison messages cannot block the main queue and can be inspected later.',
    },
    {
      title: 'Exponential backoff with jitter avoids retry storms',
      source: 'AWS Architecture Blog',
      url: 'https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/',
      summary:
        'Retrying failed provider calls with exponentially growing, jittered delays prevents synchronized retries from overwhelming an already struggling provider.',
    },
    {
      title: 'APNs and FCM are the gateways for mobile push',
      source: 'Apple APNs Documentation',
      url: 'https://developer.apple.com/documentation/usernotifications/setting-up-a-remote-notification-server',
      summary:
        'Mobile push is delivered through provider gateways (APNs for Apple, FCM for Android) rather than directly to devices, so a push adapter must speak each gateway protocol.',
    },
  ],
  teachingAssumptions: [
    'Each channel-send is modeled as one external provider call; total sends = requests x fan-out x channels.',
    'Provider concurrency is bounded, so the achievable send rate scales as worker concurrency / provider latency; latency, not CPU, is the binding constraint.',
    'Dedup and rate-limit are approximated as a per-user counter lookup on every candidate send; preference filtering is a per-user read before dispatch.',
  ],
  teachingWalkthrough: [
    {
      id: 'inline',
      step: '01',
      focus: 'A trickle, sent inline',
      scenarioId: 'direct-send',
      question:
        'At ~20 single-recipient pushes/s, can the API just call APNs directly and return when the send finishes?',
      reveal:
        'Yes, for now. At 20 sends/s a synchronous call to one provider is fine. A queue, workers, retries, and a DLQ would all be moving parts with no load to justify them.',
      takeaway: 'Start with the simplest correct design: accept the request and send inline.',
    },
    {
      id: 'decouple',
      step: '02',
      focus: 'Slow providers block',
      scenarioId: 'queue-workers',
      question:
        'Now 3k requests/s hit a provider that takes ~800 ms per call. What happens if the API still sends inline?',
      reveal:
        'The request path collapses: at 800 ms each, a synchronous server can only hold so many in-flight sends, so requests queue up and time out. Put a durable queue between the API and the senders — the API enqueues and returns in milliseconds, and a pool of channel workers drains the queue at the rate the provider allows.',
      takeaway: 'Decouple with a queue so a slow provider never blocks the producer.',
    },
    {
      id: 'routing',
      step: '03',
      focus: 'One request, three channels',
      scenarioId: 'multi-channel',
      question:
        'A request now targets push, email, and SMS at once. Should one worker call all three providers in sequence?',
      reveal:
        'No — each channel has its own provider, latency, and failure mode. Fan the message out to per-channel workers (or per-channel queues) behind a provider abstraction, so a slow SMS provider does not hold up push, and each channel scales its concurrency independently.',
      takeaway: 'Route per channel behind an adapter so channels fail and scale independently.',
    },
    {
      id: 'guards',
      step: '04',
      focus: 'Blasts need guardrails',
      scenarioId: 'preferences-dedup',
      question:
        'A marketing blast fans out to 1,000 recipients each. What stops a user being spammed or messaged after opting out?',
      reveal:
        'Add dedup and a per-user rate-limit (a counter keyed by user) plus preference filtering (opt-outs, channel choice, quiet hours) before dispatch. These drop or defer sends the user never wanted, cutting provider cost and protecting your sender reputation.',
      takeaway: 'Honour preferences and caps before the send, not after the complaint.',
    },
    {
      id: 'broadcast',
      step: '05',
      focus: 'Broadcast + flaky providers',
      scenarioId: 'broadcast-retries',
      question:
        'A broadcast expands to millions of sends across flaky providers. How do you handle failures without losing messages or melting the provider?',
      reveal:
        'Retry with exponential backoff and jitter, cap the attempts, and dead-letter what still fails so poison messages do not block the queue. Emit delivery and failure events to an async analytics stream so you can see bounce rates without slowing the senders.',
      takeaway: 'Bounded backoff retries plus a DLQ keep mass delivery durable and observable.',
    },
  ],
  analyze: analyzeNotificationSystemWorkload,
};

function analyzeNotificationSystemWorkload(workload: WorkloadValues): LabAnalysis {
  const requestsPerSecond = numericValue(workload, 'requestsPerSecond');
  const recipientsPerNotification = numericValue(workload, 'recipientsPerNotification');
  const channelsPerNotification = numericValue(workload, 'channelsPerNotification');
  const totalUsers = numericValue(workload, 'totalUsers');
  const providerLatencyMs = numericValue(workload, 'providerLatencyMs');
  const retryAttempts = numericValue(workload, 'retryAttempts');
  const perUserSendCap = numericValue(workload, 'perUserSendCap');
  const dedupAndRateLimit = Boolean(workload.dedupAndRateLimit);
  const preferenceFiltering = Boolean(workload.preferenceFiltering);

  // Total external send attempts per second across all recipients and channels.
  const sendsPerSecond = requestsPerSecond * recipientsPerNotification * channelsPerNotification;
  // Retries multiply provider-bound work; each attempt is another provider call.
  const attemptsPerSecond = sendsPerSecond * (1 + retryAttempts * 0.5);

  const needsQueue = sendsPerSecond > 100 || providerLatencyMs > synchronousProviderBudgetMs;
  const needsRouting = channelsPerNotification > 1;
  const needsGuards = dedupAndRateLimit;
  const needsRetry = retryAttempts > 0 || providerLatencyMs > 700;
  const needsProviderAbstraction = needsRouting || sendsPerSecond > 100;
  const needsPreferences = preferenceFiltering;
  const isBroadcast = recipientsPerNotification > 1_000;

  const fanOutFactor = recipientsPerNotification * channelsPerNotification;
  const dlqShare = needsRetry ? Math.min(0.4, 0.02 + providerLatencyMs / 12_000) : 0;
  const guardLookupsPerSecond = needsGuards || needsPreferences ? sendsPerSecond : 0;

  const flags = {
    needsQueue,
    needsRouting,
    needsGuards,
    needsRetry,
    needsProviderAbstraction,
    needsPreferences,
    isBroadcast,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      producer: 'ok',
      ingestApi: needsQueue ? 'ok' : sendsPerSecond > 50 ? 'warning' : 'ok',
      preferenceStore: needsPreferences ? 'needed' : 'inactive',
      queue: needsQueue ? 'needed' : 'inactive',
      channelWorkers: needsQueue ? (attemptsPerSecond > comfortableWorkerSendsPerSecond ? 'warning' : 'needed') : 'inactive',
      pushAdapter: needsProviderAbstraction ? 'needed' : 'ok',
      emailAdapter: needsRouting ? 'needed' : 'inactive',
      smsAdapter: needsRouting ? 'needed' : 'inactive',
      retryQueue: needsRetry ? (dlqShare > comfortableDlqShare ? 'warning' : 'needed') : 'inactive',
      analytics: needsRetry || isBroadcast ? 'needed' : 'inactive',
    },
    flowStates: {
      producerToIngestApi: 'active',
      ingestApiToPreferenceStore: needsPreferences ? 'active' : 'inactive',
      ingestApiToQueue: needsQueue ? 'active' : 'inactive',
      queueToChannelWorkers: needsQueue ? 'active' : 'inactive',
      channelWorkersToPushAdapter: needsQueue ? 'active' : 'inactive',
      channelWorkersToEmailAdapter: needsRouting ? 'active' : 'inactive',
      channelWorkersToSmsAdapter: needsRouting ? 'active' : 'inactive',
      channelWorkersToRetryQueue: needsRetry ? 'active' : 'inactive',
      channelWorkersToAnalytics: needsRetry || isBroadcast ? 'active' : 'inactive',
      retryQueueToChannelWorkers: needsRetry ? 'active' : 'inactive',
    },
    meters: {
      queueBacklog: {
        ratio: attemptsPerSecond / comfortableQueueIngestPerSecond,
        valueText: `${formatRate(sendsPerSecond)}/s`,
        copy: needsQueue
          ? `A durable queue absorbs ${formatRate(sendsPerSecond)}/s of sends so the ${Math.round(providerLatencyMs)} ms providers cannot block producers.`
          : 'Send volume is low enough that the API can call the provider inline without a queue.',
      },
      providerThroughput: {
        ratio: attemptsPerSecond / comfortableWorkerSendsPerSecond,
        valueText: `${formatRate(attemptsPerSecond)}/s`,
        copy: `At ${Math.round(providerLatencyMs)} ms per call, sustaining ${formatRate(attemptsPerSecond)}/s of attempts needs that many concurrent in-flight sends.`,
      },
      fanOut: {
        ratio: fanOutFactor / 100_000,
        valueText: `${formatCount(fanOutFactor)}x`,
        copy: `Each request expands to ${formatCount(recipientsPerNotification)} ${pluralize('recipient', recipientsPerNotification)} x ${Math.round(channelsPerNotification)} ${pluralize('channel', channelsPerNotification)} of provider work.`,
      },
      retryPressure: {
        ratio: needsRetry ? dlqShare / comfortableDlqShare : 0,
        valueText: needsRetry ? `${Math.round(retryAttempts)} ${pluralize('retry', retryAttempts)}` : 'off',
        copy: needsRetry
          ? `Up to ${Math.round(retryAttempts)} backoff ${pluralize('retry', retryAttempts)} per send; about ${formatPercent(dlqShare)} still fail and land in the dead-letter queue.`
          : 'No retries configured, so a failed send is simply dropped.',
      },
      guardLoad: {
        ratio: Math.max(
          guardLookupsPerSecond / comfortablePreferenceLookupsPerSecond,
          (needsGuards || needsPreferences ? totalUsers : 0) / 200_000_000,
        ),
        valueText: needsGuards || needsPreferences ? `${formatRate(guardLookupsPerSecond)}/s` : 'off',
        copy:
          needsGuards || needsPreferences
            ? `Dedup, the ${Math.round(perUserSendCap)}/min cap, and preference checks each do a per-user lookup on ${formatRate(guardLookupsPerSecond)}/s of candidate sends, backed by per-user state for ${formatCount(totalUsers)} users.`
            : 'No dedup, rate-limit, or preference filtering yet, so every request is dispatched as-is.',
      },
    },
    decisions: buildDecisions({
      ...flags,
      sendsPerSecond,
      attemptsPerSecond,
      providerLatencyMs,
      retryAttempts,
      perUserSendCap,
      channelsPerNotification,
    }),
    reasons: buildReasons({
      ...flags,
      requestsPerSecond,
      sendsPerSecond,
      attemptsPerSecond,
      recipientsPerNotification,
      channelsPerNotification,
      providerLatencyMs,
      retryAttempts,
      dlqShare,
      perUserSendCap,
    }),
  };
}

type ArchitectureFlags = {
  needsQueue: boolean;
  needsRouting: boolean;
  needsGuards: boolean;
  needsRetry: boolean;
  needsProviderAbstraction: boolean;
  needsPreferences: boolean;
  isBroadcast: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    requestsPerSecond: number;
    sendsPerSecond: number;
    attemptsPerSecond: number;
    recipientsPerNotification: number;
    channelsPerNotification: number;
    providerLatencyMs: number;
    retryAttempts: number;
    dlqShare: number;
    perUserSendCap: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsQueue) {
    reasons.push({
      severity:
        analysis.attemptsPerSecond > comfortableQueueIngestPerSecond ? 'danger' : 'warning',
      text: `${formatRate(analysis.sendsPerSecond)}/s of sends against ${Math.round(
        analysis.providerLatencyMs,
      )} ms providers must go through a durable queue so producers never block on a slow send.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Send volume and provider latency are low enough to call the provider inline without a queue.',
    });
  }

  if (analysis.attemptsPerSecond > comfortableWorkerSendsPerSecond) {
    reasons.push({
      severity: 'danger',
      text: `Sustaining ${formatRate(
        analysis.attemptsPerSecond,
      )}/s of provider calls at ${Math.round(
        analysis.providerLatencyMs,
      )} ms each demands a large, scalable worker pool and provider-side concurrency.`,
    });
  }

  if (analysis.needsRouting) {
    reasons.push({
      severity: 'warning',
      text: `${Math.round(
        analysis.channelsPerNotification,
      )} channels per notification need per-channel routing behind a provider abstraction so one slow channel does not stall the others.`,
    });
  }

  if (analysis.isBroadcast) {
    reasons.push({
      severity: 'warning',
      text: `Fan-out to ${formatCount(
        analysis.recipientsPerNotification,
      )} recipients amplifies one request into ${formatRate(
        analysis.sendsPerSecond,
      )}/s of sends; the queue and workers absorb the burst.`,
    });
  }

  if (analysis.needsRetry) {
    reasons.push({
      severity: analysis.dlqShare > comfortableDlqShare ? 'danger' : 'ok',
      text: `Up to ${Math.round(
        analysis.retryAttempts,
      )} backoff retries with about ${formatPercent(
        analysis.dlqShare,
      )} dead-lettered keep flaky-provider failures from being lost or blocking the queue.`,
    });
  }

  if (analysis.needsGuards) {
    reasons.push({
      severity: 'ok',
      text: `Dedup and a ${Math.round(
        analysis.perUserSendCap,
      )}/min per-user cap stop bursts and duplicates from spamming a user and burning provider cost.`,
    });
  }

  if (analysis.needsPreferences) {
    reasons.push({
      severity: 'ok',
      text: 'Preference filtering honours opt-outs, channel choice, and quiet hours before a send, protecting sender reputation.',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    sendsPerSecond: number;
    attemptsPerSecond: number;
    providerLatencyMs: number;
    retryAttempts: number;
    perUserSendCap: number;
    channelsPerNotification: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    queueModel: {
      state: flags.needsQueue ? 'needed' : 'not-yet',
      copy: flags.needsQueue
        ? `Enqueue every request and drain it with a worker pool; producers return in milliseconds while workers absorb the ${Math.round(
            flags.providerLatencyMs,
          )} ms provider latency.`
        : 'No queue yet — the API calls the provider inline while volume and latency stay low.',
    },
    channelRouting: {
      state: flags.needsRouting ? 'needed' : 'not-yet',
      copy: flags.needsRouting
        ? `Route each of the ${Math.round(
            flags.channelsPerNotification,
          )} channels to its own worker/queue so a slow channel cannot hold up the others.`
        : 'A single channel needs no routing layer yet.',
    },
    guards: {
      state: flags.needsGuards ? 'needed' : 'not-yet',
      copy: flags.needsGuards
        ? `Dedup duplicate sends and enforce the ${Math.round(
            flags.perUserSendCap,
          )}/min per-user cap with a counter keyed by user before dispatch.`
        : 'No dedup or rate-limit yet; every request is dispatched as-is.',
    },
    retry: {
      state: flags.needsRetry ? 'needed' : 'not-yet',
      copy: flags.needsRetry
        ? `Retry failed sends with exponential backoff and jitter, capped at ${Math.round(
            flags.retryAttempts,
          )} attempts, then dead-letter the rest so poison messages cannot block the queue.`
        : 'No retries yet; a failed send is simply dropped.',
    },
    providerAbstraction: {
      state: flags.needsProviderAbstraction ? (flags.needsRouting ? 'needed' : 'useful') : 'not-yet',
      copy: flags.needsProviderAbstraction
        ? 'Hide APNs/FCM, SES, and Twilio behind a uniform adapter interface so channels and failover are swappable.'
        : 'One provider called directly is fine while volume is tiny.',
    },
    preferences: {
      state: flags.needsPreferences ? 'needed' : 'not-yet',
      copy: flags.needsPreferences
        ? 'Read per-user opt-outs, channel choice, and quiet hours from a preference store before every send.'
        : 'No preference store yet; sends are unconditional.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsQueue && !flags.needsRouting && !flags.needsRetry) {
    return 'Direct synchronous send';
  }
  if (flags.isBroadcast && flags.needsRetry) {
    return 'Fan-out queue + workers + retry/DLQ';
  }
  if (flags.needsGuards || flags.needsPreferences) {
    return 'Queue + workers + dedup/preferences';
  }
  if (flags.needsRouting) {
    return 'Queue + multi-channel workers';
  }
  return 'Queue + channel workers';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsQueue && !flags.needsRouting && !flags.needsRetry) {
    return 'The ingest API calls a single provider inline and returns when the send finishes. Nothing else is justified yet.';
  }
  if (flags.isBroadcast && flags.needsRetry) {
    return 'The API enqueues each request and fans it out to per-channel workers that call providers behind adapters, with backoff retries, a dead-letter queue, and async delivery analytics for mass broadcasts.';
  }
  if (flags.needsGuards || flags.needsPreferences) {
    return 'A queue decouples producers from slow providers while channel workers apply dedup, per-user rate-limits, and preference filtering before each send.';
  }
  if (flags.needsRouting) {
    return 'A queue decouples producers from providers and channel workers route each notification to push, email, or SMS adapters independently.';
  }
  return 'A queue absorbs bursts and channel workers drain it at the rate the provider allows, so producers never block on a slow send.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsQueue && !flags.needsRouting && !flags.needsRetry) {
    return 'Request -> ingest API -> provider (inline)';
  }
  if (flags.isBroadcast && flags.needsRetry) {
    return 'Request -> ingest API -> queue -> channel workers -> adapters -> retry/DLQ + analytics';
  }
  if (flags.needsGuards || flags.needsPreferences) {
    return 'Request -> ingest API -> queue -> workers (dedup + preferences) -> adapters';
  }
  if (flags.needsRouting) {
    return 'Request -> ingest API -> queue -> channel workers -> push/email/SMS adapters';
  }
  return 'Request -> ingest API -> queue -> channel workers -> provider';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function pluralize(unit: string, value: number): string {
  if (Math.round(value) === 1) {
    return unit;
  }
  if (unit === 'retry') {
    return 'retries';
  }
  return `${unit}s`;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
