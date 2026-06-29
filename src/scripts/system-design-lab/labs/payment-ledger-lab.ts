import { buildColumnDiagram } from '../diagram-layout';
import {
  formatCount,
  formatDuration,
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

const bytesPerLedgerEntry = 600;
const comfortableAcidWritesPerSecond = 3_000;
const comfortableIdempotencyLookupsPerSecond = 30_000;
const comfortableLedgerStorageGigabytes = 800;
const singleNodeReconciliationEntries = 20_000_000;

export const paymentLedgerLabDefinition: SystemDesignLabDefinition = {
  id: 'payment-ledger',
  eyebrow: '系统设计 Lab',
  title:
    'Payment ledger 的瓶颈是 correctness，不是 QPS：钱绝不能被凭空造出、丢失或被 double-charge。',
  summary:
    '调节支付速率、idempotency-key TTL、外部 provider 的 latency、ledger entry 总数、reconciliation 窗口和 region 数。设计会先加上保证 correctness 的机制——idempotency key、append-only 的 double-entry ledger、ACID 写入、异步的 PSP state machine——只有在 integrity 锁定之后，才按 account 分区。',
  controls: [
    {
      id: 'paymentsPerSecond',
      label: '支付速率',
      help: '每秒提交的支付尝试数；每个都可能写入一组配平的 ledger entry。',
      min: 1,
      max: 200_000,
      defaultValue: 50,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'idempotencyTtlSeconds',
      label: 'Idempotency-key TTL',
      help: '一个存下来的 idempotency key 在过期前能为重试请求去重多久。',
      min: 60,
      max: 604_800,
      defaultValue: 86_400,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'pspLatencyMs',
      label: 'Provider latency',
      help: '向外部 PSP/银行做 authorize 和 capture 的往返 latency；又慢又不稳。',
      min: 50,
      max: 30_000,
      defaultValue: 800,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'totalLedgerEntries',
      label: 'Ledger entry 数',
      help: '历来写入的 append-only double-entry 行总数；不可变的 source of truth。',
      min: 100_000,
      max: 500_000_000_000,
      defaultValue: 50_000_000,
      scale: 'log',
      unit: '条',
      format: 'count',
    },
    {
      id: 'reconciliationWindowSeconds',
      label: 'Reconciliation 窗口',
      help: '多久重新拉一次 provider 的记录、并和 ledger 重新对账配平。',
      min: 60,
      max: 604_800,
      defaultValue: 86_400,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'retryAttempts',
      label: 'Capture 重试次数',
      help: '在把一次 capture 送进 dead-letter queue 之前，对 PSP 的重试次数。',
      min: 1,
      max: 10,
      defaultValue: 3,
      scale: 'linear',
      unit: '次',
      format: 'count',
    },
    {
      id: 'regions',
      label: 'Region 数',
      help: '接受支付的 region；region 越多，单个配平 ledger 的压力越大。',
      min: 1,
      max: 12,
      defaultValue: 1,
      scale: 'linear',
      unit: '个',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'strongConsistencyLedger',
      label: '同步的强一致 ledger',
      help: '在确认支付之前，把配平的 debit/credit 在一个 ACID transaction 里提交。',
      defaultValue: true,
    },
    {
      id: 'externalPspIntegration',
      label: '接入外部 PSP / 银行',
      help: '通过一个又慢又不可靠的 provider 来 capture 资金，而不是只用内部 ledger。',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'single-db',
      step: '01',
      title: '单个 ACID database',
      summary: '量很低；一个 transactional database 就是整个系统。',
      values: {
        paymentsPerSecond: 20,
        idempotencyTtlSeconds: 3_600,
        pspLatencyMs: 400,
        totalLedgerEntries: 500_000,
        reconciliationWindowSeconds: 86_400,
        retryAttempts: 2,
        regions: 1,
        strongConsistencyLedger: true,
        externalPspIntegration: false,
      },
    },
    {
      id: 'retries-storm',
      step: '02',
      title: '重试导致 double charge',
      summary: 'client 超时就重试；同一笔支付落库两次。',
      values: {
        paymentsPerSecond: 800,
        idempotencyTtlSeconds: 86_400,
        pspLatencyMs: 1_200,
        totalLedgerEntries: 5_000_000,
        reconciliationWindowSeconds: 86_400,
        retryAttempts: 3,
        regions: 1,
        strongConsistencyLedger: true,
        externalPspIntegration: false,
      },
    },
    {
      id: 'double-entry',
      step: '03',
      title: 'Double-entry 作为 source of truth',
      summary: '余额必须可审计，所以每一次资金移动都是配平的 debit/credit。',
      values: {
        paymentsPerSecond: 3_000,
        idempotencyTtlSeconds: 86_400,
        pspLatencyMs: 1_500,
        totalLedgerEntries: 80_000_000,
        reconciliationWindowSeconds: 43_200,
        retryAttempts: 3,
        regions: 1,
        strongConsistencyLedger: true,
        externalPspIntegration: true,
      },
    },
    {
      id: 'async-psp',
      step: '04',
      title: '又慢又不可靠的 PSP',
      summary: 'Capture 可能要好几秒还会失败，所以不能阻塞请求。',
      values: {
        paymentsPerSecond: 12_000,
        idempotencyTtlSeconds: 172_800,
        pspLatencyMs: 6_000,
        totalLedgerEntries: 2_000_000_000,
        reconciliationWindowSeconds: 21_600,
        retryAttempts: 5,
        regions: 2,
        strongConsistencyLedger: true,
        externalPspIntegration: true,
      },
    },
    {
      id: 'global-scale',
      step: '05',
      title: '规模化的全球 ledger',
      summary: '按 account 分区，持续 reconciliation，保留完整的审计 trail。',
      values: {
        paymentsPerSecond: 80_000,
        idempotencyTtlSeconds: 604_800,
        pspLatencyMs: 12_000,
        totalLedgerEntries: 200_000_000_000,
        reconciliationWindowSeconds: 300,
        retryAttempts: 8,
        regions: 6,
        strongConsistencyLedger: true,
        externalPspIntegration: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'Payment ledger 架构图',
    description:
      'payment + ledger 系统的白板风格架构图：clients、带 idempotency layer 的 payment API、double-entry 的 ledger service、带 account 分区的 ACID datastore，以及由 PSP adapter、reconciliation 和 audit log 组成的异步层。',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: '提交 + 重试',
            summary: '提交支付，超时就重试，有时会重发同一个请求',
            kind: 'client',
          },
        ],
      },
      {
        id: 'api',
        label: 'Payment API',
        variant: 'edge',
        nodes: [
          {
            id: 'paymentApi',
            title: 'Payment API',
            subtitle: '请求处理',
            summary: '校验支付请求，并掌管支付的 state machine',
            kind: 'api',
          },
          {
            id: 'idempotency',
            title: 'Idempotency layer',
            subtitle: '去重重试',
            summary: '存下 idempotency key，让重试请求只被处理 exactly once',
            kind: 'service',
          },
        ],
      },
      {
        id: 'ledger',
        label: 'Ledger',
        variant: 'backbone',
        nodes: [
          {
            id: 'ledgerService',
            title: 'Ledger service',
            subtitle: 'double-entry',
            summary: '把配平的 debit 和 credit 记录为不可变的 source of truth',
            kind: 'service',
          },
        ],
      },
      {
        id: 'store',
        label: 'Datastore',
        variant: 'storage',
        nodes: [
          {
            id: 'acidStore',
            title: 'ACID store',
            subtitle: 'transactional',
            summary: '原子且持久地提交配平的 entry',
            kind: 'db',
          },
          {
            id: 'partitions',
            title: 'Account shards',
            subtitle: '按 account 分区',
            summary: '把 ledger 按 account 分区，让写入扩展又不破坏配平',
            kind: 'nosql',
          },
        ],
      },
      {
        id: 'async',
        label: 'Async + audit',
        variant: 'processing',
        nodes: [
          {
            id: 'pspAdapter',
            title: 'PSP adapter',
            subtitle: '异步 capture',
            summary: '通过又慢的外部 provider 做 authorize 和 capture，配合重试和 DLQ',
            kind: 'external',
          },
          {
            id: 'reconciliation',
            title: 'Reconciliation',
            subtitle: '对账匹配',
            summary: '重新拉取 provider 记录，并和 ledger 重新配平',
            kind: 'compute',
          },
          {
            id: 'auditLog',
            title: 'Audit log',
            subtitle: '事件 trail',
            summary: '为合规保留一条 append-only 的事件 trail，记录每一次状态转换',
            kind: 'stream',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'paymentApi', variant: 'primary' },
      { from: 'paymentApi', to: 'idempotency', variant: 'primary' },
      { from: 'paymentApi', to: 'ledgerService', variant: 'primary' },
      { from: 'ledgerService', to: 'acidStore', variant: 'primary' },
      { from: 'acidStore', to: 'partitions', variant: 'secondary' },
      { from: 'paymentApi', to: 'pspAdapter', variant: 'direct' },
      { from: 'ledgerService', to: 'reconciliation', variant: 'secondary' },
      { from: 'ledgerService', to: 'auditLog', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'transactionThroughput', label: 'Ledger 写入负载' },
    { id: 'idempotencyLoad', label: 'Idempotency-store 负载' },
    { id: 'pspBacklog', label: 'PSP 相关的异步 backlog' },
    { id: 'ledgerStorage', label: 'Ledger 存储增长' },
    { id: 'reconciliationLag', label: 'Reconciliation 延迟' },
  ],
  decisions: [
    { id: 'idempotency', title: 'Idempotency layer' },
    { id: 'doubleEntry', title: 'Double-entry ledger' },
    { id: 'consistency', title: 'Transaction 模型' },
    { id: 'pspIntegration', title: 'PSP 集成' },
    { id: 'reconciliation', title: 'Reconciliation' },
    { id: 'audit', title: 'Audit / event log' },
  ],
  sourceBackedRules: [
    {
      title: 'Idempotency key 让重试的支付请求可以安全重放',
      source: 'Stripe Docs',
      url: 'https://docs.stripe.com/api/idempotent_requests',
      summary:
        'Stripe 让 client 在请求上带一个 idempotency key，于是网络故障引发的重试会返回原始结果，而不是再创建一次 charge。',
    },
    {
      title: '异步地 capture 资金，因为 provider 又慢又可能失败',
      source: 'Stripe Docs',
      url: 'https://docs.stripe.com/payments/paymentintents/lifecycle',
      summary:
        '一个 PaymentIntent 会经过 requires_action、processing 和 succeeded 状态；把 capture 当成异步的 state machine，就能容忍 provider 的 latency 和失败。',
    },
    {
      title: 'append-only 的 double-entry ledger 是不可变的 source of truth',
      source: 'martinfowler.com',
      url: 'https://martinfowler.com/eaaDev/AccountingNarrative.html',
      summary:
        '把钱建模成往 account 上配平记账，让 ledger 可审计、能自校验，于是余额是推算出来的，而不是就地改动的。',
    },
    {
      title: 'Event sourcing 保留一条完整、可重放的状态变更审计 trail',
      source: 'martinfowler.com',
      url: 'https://martinfowler.com/eaaDev/EventSourcing.html',
      summary:
        '把每一次状态转换都持久化成一个不可变事件，就得到了一份完整的审计 log，还能通过重放历史来重建余额。',
    },
  ],
  teachingAssumptions: [
    'Correctness 才是瓶颈；单节点的吞吐和存储预算是保守的教学数字，不是厂商上限。',
    '每笔支付都按一次配平的 double-entry 写入建模；idempotency store 大约每次尝试（含重试）看到一次查找。',
    'PSP 相关的 backlog 按「支付速率 × provider latency」估算，也就是在等外部 provider 的 in-flight capture 数。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-db',
      step: '01',
      focus: '一个 ACID database',
      scenarioId: 'single-db',
      question:
        '在约 20 笔支付/s、没有外部 provider 的情况下，需要在一个 ACID database 之外再加东西吗？',
      reveal:
        '不需要。一个 transactional database 就能原子且持久地提交每笔支付。量低、没有大规模重试、也没有外部 PSP 时，idempotency key、异步 capture 和分片都为时过早——一次 ACID 写入已经保证了 correctness。',
      takeaway: '从一个 ACID database 起步：correctness 优先，只有负载逼出来时才加复杂度。',
    },
    {
      id: 'idempotency',
      step: '02',
      focus: '重试导致 double charge',
      scenarioId: 'retries-storm',
      question:
        'client 超时就重试，同一笔支付到达两次。什么能阻止第二次再扣一遍款？',
      reveal:
        '一个 idempotency layer。client 随请求发一个 idempotency key；第一次尝试存下 key 和结果，之后任何带相同 key 的重试都返回原始结果，而不是再写一笔 charge。没有它，网络重试会悄悄制造重复的资金移动。',
      takeaway: 'Idempotency key 把不可靠的网络变成 exactly-once 的支付处理。',
    },
    {
      id: 'ledger',
      step: '03',
      focus: 'Double-entry 作为 source of truth',
      scenarioId: 'double-entry',
      question:
        '审计员必须信任每一个余额。为什么不干脆存一个余额列，往上加减就好？',
      reveal:
        '可变的余额会丢失历史、无法审计。一个 append-only 的 double-entry ledger 把每一次资金移动都记录成配平的 debit 和 credit，于是 ledger 能自校验，余额由 entry 汇总推算出来。钱永远不会被悄悄造出或丢失，因为 debit 必须始终等于 credit。',
      takeaway: 'append-only 的 double-entry ledger 是不可变、能自校验的 source of truth。',
    },
    {
      id: 'async',
      step: '04',
      focus: '又慢又不可靠的 PSP',
      scenarioId: 'async-psp',
      question:
        '外部 provider 可能要好几秒、有时还失败。API 该在支付请求里同步调用它吗？',
      reveal:
        '不该。同步的 PSP 调用会把请求占住好几秒，provider 一挂它就跟着挂。Capture 要变成一台异步的 state machine：先 authorize，再通过带重试和 dead-letter queue 的 PSP adapter 去 capture。ledger 先记录意图；capture 后的状态等 provider 响应了再 reconcile。',
      takeaway: '外部 capture 是一台异步、会重试的 state machine——绝不是一个阻塞的同步调用。',
    },
    {
      id: 'scale',
      focus: '规模化的全球 ledger',
      step: '05',
      scenarioId: 'global-scale',
      question:
        '现在跨 region 有 80k 笔支付/s。能像分片 key-value store 那样随意分片 ledger 吗？',
      reveal:
        '不能随意——配平的 ledger 约束了分片方式，所以按 account 分区（让每个 account 完整落在一个 shard 上），让配平写入保持原子。Reconciliation 持续地对着 provider 记录跑，append-only 的 audit log 为合规记录每一次转换。保证 correctness 的机制要在横向扩展之前先上。',
      takeaway: '按 account 分区、持续 reconciliation、什么都审计——integrity 是扩展的前置闸门。',
    },
  ],
  analyze: analyzePaymentLedgerWorkload,
};

function analyzePaymentLedgerWorkload(workload: WorkloadValues): LabAnalysis {
  const paymentsPerSecond = numericValue(workload, 'paymentsPerSecond');
  const idempotencyTtlSeconds = numericValue(workload, 'idempotencyTtlSeconds');
  const pspLatencyMs = numericValue(workload, 'pspLatencyMs');
  const totalLedgerEntries = numericValue(workload, 'totalLedgerEntries');
  const reconciliationWindowSeconds = numericValue(workload, 'reconciliationWindowSeconds');
  const retryAttempts = numericValue(workload, 'retryAttempts');
  const regions = numericValue(workload, 'regions');
  const strongConsistencyLedger = Boolean(workload.strongConsistencyLedger);
  const externalPspIntegration = Boolean(workload.externalPspIntegration);

  const needsIdempotency = paymentsPerSecond > 200 || retryAttempts >= 3;
  const needsDoubleEntry = totalLedgerEntries > 1_000_000 || paymentsPerSecond > 200;
  const needsAsyncPsp = externalPspIntegration && (pspLatencyMs > 500 || paymentsPerSecond > 1_000);
  const storageGigabytes = (totalLedgerEntries * bytesPerLedgerEntry) / 1_000_000_000;
  const needsPartitioning =
    paymentsPerSecond > comfortableAcidWritesPerSecond ||
    storageGigabytes > comfortableLedgerStorageGigabytes ||
    totalLedgerEntries > 1_000_000_000 ||
    regions > 1;
  const needsReconciliation =
    externalPspIntegration && (reconciliationWindowSeconds < 86_400 || paymentsPerSecond > 1_000);
  const needsAudit = needsDoubleEntry || totalLedgerEntries > 10_000_000 || regions > 1;

  // In-flight captures waiting on the slow external provider.
  const pspBacklog = externalPspIntegration
    ? paymentsPerSecond * (pspLatencyMs / 1_000) * Math.max(1, retryAttempts / 3)
    : 0;
  const comfortablePspBacklog = 5_000;

  const idempotencyLookups = needsIdempotency ? paymentsPerSecond * (1 + retryAttempts * 0.2) : 0;
  // Idempotency keys are retained for their TTL, so the store holds roughly rate x TTL keys.
  const idempotencyStoreKeys = needsIdempotency ? paymentsPerSecond * idempotencyTtlSeconds : 0;

  // Effective write budget halves without a synchronous strong-consistency commit
  // (eventual consistency trades correctness guarantees for headroom).
  const writeBudget = strongConsistencyLedger
    ? comfortableAcidWritesPerSecond
    : comfortableAcidWritesPerSecond * 2;

  const reconciliationLagRatio = needsReconciliation
    ? Math.max(
        reconciliationWindowSeconds / 3_600,
        totalLedgerEntries / singleNodeReconciliationEntries,
      )
    : reconciliationWindowSeconds / 86_400;

  const flags = {
    needsIdempotency,
    needsDoubleEntry,
    needsAsyncPsp,
    needsPartitioning,
    needsReconciliation,
    needsAudit,
    strongConsistencyLedger,
    externalPspIntegration,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      paymentApi: 'ok',
      idempotency: needsIdempotency ? 'needed' : 'inactive',
      ledgerService: needsDoubleEntry ? 'needed' : 'ok',
      acidStore: needsPartitioning ? 'warning' : 'ok',
      partitions: needsPartitioning ? 'needed' : 'inactive',
      pspAdapter: needsAsyncPsp ? 'needed' : externalPspIntegration ? 'ok' : 'inactive',
      reconciliation: needsReconciliation ? 'needed' : 'inactive',
      auditLog: needsAudit ? 'needed' : 'inactive',
    },
    flowStates: {
      clientToPaymentApi: 'active',
      paymentApiToIdempotency: needsIdempotency ? 'active' : 'inactive',
      paymentApiToLedgerService: 'active',
      ledgerServiceToAcidStore: 'active',
      acidStoreToPartitions: needsPartitioning ? 'active' : 'inactive',
      paymentApiToPspAdapter: externalPspIntegration ? (needsAsyncPsp ? 'active' : 'warning') : 'inactive',
      ledgerServiceToReconciliation: needsReconciliation ? 'active' : 'inactive',
      ledgerServiceToAuditLog: needsAudit ? 'active' : 'inactive',
    },
    meters: {
      transactionThroughput: {
        ratio: paymentsPerSecond / writeBudget,
        valueText: `${formatRate(paymentsPerSecond)}/s`,
        copy: strongConsistencyLedger
          ? `每笔支付都是一次配平的 ACID 写入；同步 ledger 的预算大约是每节点 ${formatRate(writeBudget)}/s。`
          : `放松强一致把原始写入余量抬到约 ${formatRate(writeBudget)}/s，但削弱了 correctness 保证。`,
      },
      idempotencyLoad: {
        ratio: Math.max(
          idempotencyLookups / comfortableIdempotencyLookupsPerSecond,
          idempotencyStoreKeys / 2_000_000_000,
        ),
        valueText: needsIdempotency ? `${formatRate(idempotencyLookups)}/s` : 'off',
        copy: needsIdempotency
          ? `每次尝试和重试都先查一遍 idempotency store 来去重（约 ${formatRate(idempotencyLookups)}/s）；${formatDuration(idempotencyTtlSeconds)} 的 TTL 让大约 ${formatCount(idempotencyStoreKeys)} 个 key 保持存活。`
          : '还没有 idempotency layer；重试会写出重复的 charge。',
      },
      pspBacklog: {
        ratio: externalPspIntegration ? pspBacklog / comfortablePspBacklog : 0,
        valueText: externalPspIntegration ? `${formatCount(pspBacklog)} 个 in flight` : '无 PSP',
        copy: externalPspIntegration
          ? `大约有 ${formatCount(pspBacklog)} 个 capture 正在对着一个 ${formatMs(pspLatencyMs)} 的 provider 进行中；它们必须从请求路径上排空。`
          : '没有外部 provider；capture 是内部的、即时完成。',
      },
      ledgerStorage: {
        ratio: storageGigabytes / comfortableLedgerStorageGigabytes,
        valueText: formatStorageGigabytes(storageGigabytes),
        copy: `${formatCount(totalLedgerEntries)} 条 append-only entry，每条约 ${bytesPerLedgerEntry} 字节；ledger 只增不减。`,
      },
      reconciliationLag: {
        ratio: reconciliationLagRatio,
        valueText: formatDuration(reconciliationWindowSeconds),
        copy: needsReconciliation
          ? `每隔 ${formatDuration(reconciliationWindowSeconds)} 就把 provider 记录和 ledger 重新配平一次；窗口越紧，越早抓到 drift。`
          : '没有外部 provider 会产生 drift，所以 reconciliation 放松着。',
      },
    },
    decisions: buildDecisions({
      ...flags,
      paymentsPerSecond,
      retryAttempts,
      pspLatencyMs,
      reconciliationWindowSeconds,
    }),
    reasons: buildReasons({
      ...flags,
      paymentsPerSecond,
      retryAttempts,
      pspLatencyMs,
      pspBacklog,
      storageGigabytes,
      totalLedgerEntries,
      reconciliationWindowSeconds,
      regions,
    }),
  };
}

type ArchitectureFlags = {
  needsIdempotency: boolean;
  needsDoubleEntry: boolean;
  needsAsyncPsp: boolean;
  needsPartitioning: boolean;
  needsReconciliation: boolean;
  needsAudit: boolean;
  strongConsistencyLedger: boolean;
  externalPspIntegration: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    paymentsPerSecond: number;
    retryAttempts: number;
    pspLatencyMs: number;
    pspBacklog: number;
    storageGigabytes: number;
    totalLedgerEntries: number;
    reconciliationWindowSeconds: number;
    regions: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsIdempotency) {
    reasons.push({
      severity: analysis.retryAttempts >= 3 ? 'danger' : 'warning',
      text: `${formatRate(
        analysis.paymentsPerSecond,
      )}/s 的支付、最多 ${Math.round(
        analysis.retryAttempts,
      )} 次重试，必须靠 idempotency key 去重，否则重试就会变成重复的 charge。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '量和重试都够低，一次 ACID 写入就能让支付保持正确，不需要 idempotency layer。',
    });
  }

  if (analysis.needsDoubleEntry) {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.totalLedgerEntries,
      )} 条 entry 必须可审计；在 append-only ledger 里把每一次资金移动记录成配平的 debit 和 credit。`,
    });
  }

  if (analysis.externalPspIntegration && analysis.needsAsyncPsp) {
    reasons.push({
      severity: analysis.pspLatencyMs > 5_000 ? 'danger' : 'warning',
      text: `一个 ${formatMs(
        analysis.pspLatencyMs,
      )} 的 provider 可能失败，所以 capture 必须跑成一台带重试和 DLQ 的异步 state machine（约 ${formatCount(
        analysis.pspBacklog,
      )} 个 in flight）。`,
    });
  } else if (analysis.externalPspIntegration) {
    reasons.push({
      severity: 'ok',
      text: '回路里有一个外部 provider；即便量很低，capture 也应该留在同步请求路径之外。',
    });
  }

  if (analysis.needsPartitioning) {
    reasons.push({
      severity: analysis.storageGigabytes > comfortableLedgerStorageGigabytes * 2 ? 'danger' : 'warning',
      text: `${formatCount(
        analysis.totalLedgerEntries,
      )} 条 entry（约 ${formatStorageGigabytes(
        analysis.storageGigabytes,
      )}）加上写入速率，超过了单节点；按 account 分区，让配平写入保持原子。`,
    });
  }

  if (analysis.needsReconciliation) {
    reasons.push({
      severity: 'warning',
      text: `每隔 ${formatDuration(
        analysis.reconciliationWindowSeconds,
      )} 就把 provider 记录和 ledger 重新配平一次，在 drift 累积之前抓住它。`,
    });
  }

  if (analysis.needsAudit) {
    reasons.push({
      severity: 'ok',
      text: 'append-only 的 audit / event log 为合规记录每一次状态转换，并让余额可以重放。',
    });
  }

  if (!analysis.strongConsistencyLedger) {
    reasons.push({
      severity: 'danger',
      text: '砍掉同步的强一致提交能换来写入余量，但有 money 不配平或丢失的风险；correctness 应该是这件事的前置闸门。',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    paymentsPerSecond: number;
    retryAttempts: number;
    pspLatencyMs: number;
    reconciliationWindowSeconds: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    idempotency: {
      state: flags.needsIdempotency ? 'needed' : 'not-yet',
      copy: flags.needsIdempotency
        ? `要求每个请求带一个 idempotency key，让 ${formatRate(
            flags.paymentsPerSecond,
          )}/s 的尝试和重试被处理 exactly once。`
        : '还没有 idempotency layer；量低、重试少，意外重复不太可能发生。',
    },
    doubleEntry: {
      state: flags.needsDoubleEntry ? 'needed' : 'useful',
      copy: flags.needsDoubleEntry
        ? '在 append-only ledger 里记录配平的 debit 和 credit，让钱永远不会被造出或丢失。'
        : '量很小时一张简单的 transactional 表就够了，但一旦余额必须可审计，double-entry 就开始划算。',
    },
    consistency: {
      state: flags.strongConsistencyLedger
        ? flags.needsPartitioning
          ? 'tradeoff'
          : 'needed'
        : 'tradeoff',
      copy: flags.strongConsistencyLedger
        ? flags.needsPartitioning
          ? '让 ACID 维持在每个 account 内：按 account 分区，这样即便扩展，每次配平写入仍留在一个 transaction 里。'
          : '在确认支付之前，把配平的 debit 和 credit 在一个 ACID transaction 里提交。'
        : '最终一致能抬高吞吐，但有钱不配平的风险；对 ledger 来说，强一致才是更安全的默认。',
    },
    pspIntegration: {
      state: flags.externalPspIntegration ? (flags.needsAsyncPsp ? 'needed' : 'useful') : 'not-yet',
      copy: flags.externalPspIntegration
        ? flags.needsAsyncPsp
          ? `通过 ${formatMs(
              flags.pspLatencyMs,
            )} 的 provider 做 capture，跑成一台带最多 ${Math.round(
              flags.retryAttempts,
            )} 次重试和 dead-letter queue 的异步 state machine。`
          : '已接入一个外部 provider；即便现在，也让 capture 保持异步，使 provider latency 永远不阻塞请求。'
        : '没有外部 provider；capture 是内部的，所以暂时没有慢的异步层要管。',
    },
    reconciliation: {
      state: flags.needsReconciliation ? 'needed' : flags.externalPspIntegration ? 'useful' : 'not-yet',
      copy: flags.needsReconciliation
        ? `每隔 ${formatDuration(
            flags.reconciliationWindowSeconds,
          )} 就把 provider 记录和 ledger 对账一次，在 drift 累积之前抓住它。`
        : flags.externalPspIntegration
          ? '量低时每天跑一次 reconciliation 就够了，但随着资金流增长要收紧窗口。'
          : '当 ledger 是唯一的记录系统时，没有外部东西可对账。',
    },
    audit: {
      state: flags.needsAudit ? 'needed' : 'useful',
      copy: flags.needsAudit
        ? '保留一条 append-only 的 audit / event log，记录每一次转换，用于合规和可重放的余额。'
        : '即便是小 ledger 也能从 event log 受益；一旦余额必须可审计，它就成了必需品。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsIdempotency && !flags.needsDoubleEntry && !flags.needsAsyncPsp && !flags.needsPartitioning) {
    return '单个 ACID database';
  }
  if (flags.needsPartitioning && flags.needsAsyncPsp) {
    return '按 account 分区的 ledger + 异步 PSP + reconciliation';
  }
  if (flags.needsAsyncPsp) {
    return 'Idempotent 的 double-entry ledger + 异步 PSP capture';
  }
  if (flags.needsDoubleEntry) {
    return 'Idempotent 的 double-entry ledger';
  }
  return '单个 ACID database';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsIdempotency && !flags.needsDoubleEntry && !flags.needsAsyncPsp && !flags.needsPartitioning) {
    return '一个 ACID database 原子且持久地提交每笔支付。Idempotency、异步 capture 和分区现在都还没必要。';
  }
  if (flags.needsPartitioning && flags.needsAsyncPsp) {
    return 'Idempotency 去重重试，一个按 account 分区的 double-entry ledger 仍是 source of truth，带重试的异步 PSP adapter 加上持续的 reconciliation 和 audit log，在规模下应对不可靠的 provider。';
  }
  if (flags.needsAsyncPsp) {
    return '一个 idempotency layer 让重试安全，一个 double-entry 的 ACID ledger 是 source of truth，capture 跑成一台对着慢的外部 provider 的异步 state machine。';
  }
  if (flags.needsDoubleEntry) {
    return '一个 idempotency layer 去重重试，一个 append-only 的 double-entry ledger 把配平的 debit 和 credit 提交为可审计的 source of truth。';
  }
  return '一个 ACID database 仍然能让每笔支付保持正确。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsIdempotency && !flags.needsDoubleEntry && !flags.needsAsyncPsp && !flags.needsPartitioning) {
    return 'Payment -> API -> ACID database';
  }
  if (flags.needsPartitioning && flags.needsAsyncPsp) {
    return 'Payment -> idempotency -> ledger -> account shards; async PSP capture + reconciliation + audit';
  }
  if (flags.needsAsyncPsp) {
    return 'Payment -> idempotency -> double-entry ledger -> ACID store; async PSP capture';
  }
  if (flags.needsDoubleEntry) {
    return 'Payment -> idempotency -> double-entry ledger -> ACID store';
  }
  return 'Payment -> API -> ACID database';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function formatMs(milliseconds: number): string {
  if (milliseconds >= 1_000) {
    return `${(milliseconds / 1_000).toFixed(1)}s`;
  }
  return `${Math.round(milliseconds)} ms`;
}
