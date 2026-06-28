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
  eyebrow: 'System Design Lab',
  title:
    'A payment ledger is bound by correctness, not QPS: money must never be created, lost, or double-charged.',
  summary:
    'Change payment rate, idempotency-key TTL, external provider latency, total ledger entries, the reconciliation window, and regions. The design adds correctness mechanisms first — idempotency keys, a double-entry append-only ledger, ACID writes, an async PSP state machine — and only partitions by account once integrity is locked down.',
  controls: [
    {
      id: 'paymentsPerSecond',
      label: 'Payment rate',
      help: 'Payment attempts submitted per second; each may write balanced ledger entries.',
      min: 1,
      max: 200_000,
      defaultValue: 50,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'idempotencyTtlSeconds',
      label: 'Idempotency-key TTL',
      help: 'How long a stored idempotency key dedupes a retried request before expiring.',
      min: 60,
      max: 604_800,
      defaultValue: 86_400,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'pspLatencyMs',
      label: 'Provider latency',
      help: 'Round-trip latency to the external PSP/bank for authorize and capture; slow and variable.',
      min: 50,
      max: 30_000,
      defaultValue: 800,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'totalLedgerEntries',
      label: 'Ledger entries',
      help: 'Total append-only double-entry rows ever written; the immutable source of truth.',
      min: 100_000,
      max: 500_000_000_000,
      defaultValue: 50_000_000,
      scale: 'log',
      unit: 'entries',
      format: 'count',
    },
    {
      id: 'reconciliationWindowSeconds',
      label: 'Reconciliation window',
      help: 'How often you re-fetch provider records and re-balance them against the ledger.',
      min: 60,
      max: 604_800,
      defaultValue: 86_400,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'retryAttempts',
      label: 'Capture retry attempts',
      help: 'Retries against the PSP before a capture is sent to the dead-letter queue.',
      min: 1,
      max: 10,
      defaultValue: 3,
      scale: 'linear',
      unit: 'attempts',
      format: 'count',
    },
    {
      id: 'regions',
      label: 'Regions',
      help: 'Regions that accept payments; more regions strain a single balanced ledger.',
      min: 1,
      max: 12,
      defaultValue: 1,
      scale: 'linear',
      unit: 'regions',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'strongConsistencyLedger',
      label: 'Synchronous strong-consistency ledger',
      help: 'Commit balanced debits/credits in one ACID transaction before acknowledging the payment.',
      defaultValue: true,
    },
    {
      id: 'externalPspIntegration',
      label: 'Integrate an external PSP / bank',
      help: 'Capture funds through a slow, unreliable provider instead of an internal-only ledger.',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'single-db',
      step: '01',
      title: 'Single ACID database',
      summary: 'Low volume; one transactional database is the whole system.',
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
      title: 'Retries cause double charges',
      summary: 'Clients retry on timeout; the same payment lands twice.',
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
      title: 'Double-entry source of truth',
      summary: 'Balances must be auditable, so every move is balanced debits/credits.',
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
      title: 'Slow, unreliable PSP',
      summary: 'Capture can take seconds and fail, so it cannot block the request.',
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
      title: 'Global ledger at scale',
      summary: 'Partition by account, reconcile continuously, keep a full audit trail.',
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
    title: 'Payment ledger architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a payment + ledger system: clients, a payment API with an idempotency layer, a double-entry ledger service, an ACID datastore with account partitions, and an async tier of PSP adapter, reconciliation, and audit log.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'submits + retries',
            summary: 'submits payments and retries on timeout, sometimes resending the same request',
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
            subtitle: 'request handling',
            summary: 'validates payment requests and owns the payment state machine',
            kind: 'api',
          },
          {
            id: 'idempotency',
            title: 'Idempotency layer',
            subtitle: 'dedup retries',
            summary: 'stores idempotency keys so a retried request is processed exactly once',
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
            summary: 'records balanced debits and credits as the immutable source of truth',
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
            summary: 'commits balanced entries atomically and durably',
            kind: 'db',
          },
          {
            id: 'partitions',
            title: 'Account shards',
            subtitle: 'partition by account',
            summary: 'partitions the ledger by account so writes scale without breaking balance',
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
            subtitle: 'async capture',
            summary: 'authorizes and captures through the slow external provider with retries and a DLQ',
            kind: 'external',
          },
          {
            id: 'reconciliation',
            title: 'Reconciliation',
            subtitle: 'match records',
            summary: 're-fetches provider records and re-balances them against the ledger',
            kind: 'compute',
          },
          {
            id: 'auditLog',
            title: 'Audit log',
            subtitle: 'event trail',
            summary: 'keeps an append-only event trail of every state transition for compliance',
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
    { id: 'transactionThroughput', label: 'Ledger write load' },
    { id: 'idempotencyLoad', label: 'Idempotency-store load' },
    { id: 'pspBacklog', label: 'PSP-bound async backlog' },
    { id: 'ledgerStorage', label: 'Ledger storage growth' },
    { id: 'reconciliationLag', label: 'Reconciliation lag' },
  ],
  decisions: [
    { id: 'idempotency', title: 'Idempotency layer' },
    { id: 'doubleEntry', title: 'Double-entry ledger' },
    { id: 'consistency', title: 'Transaction model' },
    { id: 'pspIntegration', title: 'PSP integration' },
    { id: 'reconciliation', title: 'Reconciliation' },
    { id: 'audit', title: 'Audit / event log' },
  ],
  sourceBackedRules: [
    {
      title: 'Idempotency keys make a retried payment request safe to replay',
      source: 'Stripe Docs',
      url: 'https://docs.stripe.com/api/idempotent_requests',
      summary:
        'Stripe lets clients attach an idempotency key so retries from network failures return the original result instead of creating a second charge.',
    },
    {
      title: 'Capture funds asynchronously because the provider is slow and can fail',
      source: 'Stripe Docs',
      url: 'https://docs.stripe.com/payments/paymentintents/lifecycle',
      summary:
        'A PaymentIntent moves through requires_action, processing, and succeeded states; treating capture as an async state machine tolerates provider latency and failures.',
    },
    {
      title: 'A double-entry, append-only ledger is the immutable source of truth',
      source: 'martinfowler.com',
      url: 'https://martinfowler.com/eaaDev/AccountingNarrative.html',
      summary:
        'Modeling money as balanced postings to accounts keeps the ledger auditable and self-checking, so balances are derived rather than mutated in place.',
    },
    {
      title: 'Event sourcing keeps a full, replayable audit trail of state changes',
      source: 'martinfowler.com',
      url: 'https://martinfowler.com/eaaDev/EventSourcing.html',
      summary:
        'Persisting every state transition as an immutable event gives a complete audit log and lets balances be rebuilt by replaying history.',
    },
  ],
  teachingAssumptions: [
    'Correctness is the binding constraint; single-node throughput and storage budgets are conservative teaching numbers, not vendor limits.',
    'Each payment is modeled as one balanced double-entry write; the idempotency store sees roughly one lookup per attempt including retries.',
    'PSP-bound backlog is approximated from payment rate times provider latency, i.e. the in-flight captures waiting on the external provider.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-db',
      step: '01',
      focus: 'One ACID database',
      scenarioId: 'single-db',
      question:
        'At ~20 payments/s with no external provider, do you need anything beyond one ACID database?',
      reveal:
        'No. A single transactional database commits each payment atomically and durably. With low volume and no retries-at-scale or external PSP, idempotency keys, async capture, and sharding are all premature — correctness is already guaranteed by one ACID write.',
      takeaway: 'Start with one ACID database: correctness first, complexity only when load demands it.',
    },
    {
      id: 'idempotency',
      step: '02',
      focus: 'Retries double-charge',
      scenarioId: 'retries-storm',
      question:
        'Clients retry on timeout and the same payment arrives twice. What stops the second one from charging again?',
      reveal:
        'An idempotency layer. The client sends an idempotency key with the request; the first attempt stores the key and result, and any retry with the same key returns the original outcome instead of writing a second charge. Without it, network retries silently create duplicate money movements.',
      takeaway: 'Idempotency keys turn an unreliable network into exactly-once payment processing.',
    },
    {
      id: 'ledger',
      step: '03',
      focus: 'Double-entry source of truth',
      scenarioId: 'double-entry',
      question:
        'Auditors must trust every balance. Why not just store one balance column and add or subtract from it?',
      reveal:
        'A mutable balance loses history and cannot be audited. A double-entry, append-only ledger records every movement as balanced debits and credits, so the ledger is self-checking and balances are derived by summing entries. Money can never be silently created or lost because debits must always equal credits.',
      takeaway: 'A double-entry append-only ledger is the immutable, self-checking source of truth.',
    },
    {
      id: 'async',
      step: '04',
      focus: 'Slow unreliable PSP',
      scenarioId: 'async-psp',
      question:
        'The external provider can take seconds and sometimes fails. Should the API call it synchronously inside the payment request?',
      reveal:
        'No. A synchronous PSP call ties up the request for seconds and fails whenever the provider does. Capture becomes an async state machine: authorize, then capture through a PSP adapter with retries and a dead-letter queue. The ledger records intent first; the captured state is reconciled when the provider responds.',
      takeaway: 'External capture is an async, retrying state machine — never a blocking synchronous call.',
    },
    {
      id: 'scale',
      focus: 'Global ledger at scale',
      step: '05',
      scenarioId: 'global-scale',
      question:
        'Now 80k payments/s across regions. Can you freely shard the ledger the way you shard a key-value store?',
      reveal:
        'Not freely — a balanced ledger constrains sharding, so you partition by account (keeping each account fully on one shard) so balanced writes stay atomic. Reconciliation runs continuously against provider records, and an append-only audit log captures every transition for compliance. Correctness mechanisms come on before horizontal scale.',
      takeaway: 'Partition by account, reconcile continuously, audit everything — integrity gates scale.',
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
          ? `Each payment is a balanced ACID write; the synchronous ledger budget is about ${formatRate(writeBudget)}/s per node.`
          : `Relaxing strong consistency raises raw write headroom to about ${formatRate(writeBudget)}/s, but weakens correctness guarantees.`,
      },
      idempotencyLoad: {
        ratio: Math.max(
          idempotencyLookups / comfortableIdempotencyLookupsPerSecond,
          idempotencyStoreKeys / 2_000_000_000,
        ),
        valueText: needsIdempotency ? `${formatRate(idempotencyLookups)}/s` : 'off',
        copy: needsIdempotency
          ? `Every attempt and retry checks the idempotency store first to dedupe (~${formatRate(idempotencyLookups)}/s); a ${formatDuration(idempotencyTtlSeconds)} TTL keeps about ${formatCount(idempotencyStoreKeys)} keys live.`
          : 'No idempotency layer yet; retries would write duplicate charges.',
      },
      pspBacklog: {
        ratio: externalPspIntegration ? pspBacklog / comfortablePspBacklog : 0,
        valueText: externalPspIntegration ? `${formatCount(pspBacklog)} in flight` : 'no PSP',
        copy: externalPspIntegration
          ? `About ${formatCount(pspBacklog)} captures are in flight against a ${formatMs(pspLatencyMs)} provider; they must drain off the request path.`
          : 'No external provider; capture is internal and immediate.',
      },
      ledgerStorage: {
        ratio: storageGigabytes / comfortableLedgerStorageGigabytes,
        valueText: formatStorageGigabytes(storageGigabytes),
        copy: `${formatCount(totalLedgerEntries)} append-only entries at roughly ${bytesPerLedgerEntry} bytes each; the ledger only grows.`,
      },
      reconciliationLag: {
        ratio: reconciliationLagRatio,
        valueText: formatDuration(reconciliationWindowSeconds),
        copy: needsReconciliation
          ? `Provider records are re-balanced against the ledger every ${formatDuration(reconciliationWindowSeconds)}; tighter windows catch drift sooner.`
          : 'Reconciliation is relaxed while there is no external provider to drift from.',
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
      )}/s of payments with up to ${Math.round(
        analysis.retryAttempts,
      )} retries must dedupe on an idempotency key, or retries become duplicate charges.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Volume and retries are low enough that a single ACID write keeps payments correct without an idempotency layer.',
    });
  }

  if (analysis.needsDoubleEntry) {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.totalLedgerEntries,
      )} entries must be auditable; record every movement as balanced debits and credits in an append-only ledger.`,
    });
  }

  if (analysis.externalPspIntegration && analysis.needsAsyncPsp) {
    reasons.push({
      severity: analysis.pspLatencyMs > 5_000 ? 'danger' : 'warning',
      text: `A ${formatMs(
        analysis.pspLatencyMs,
      )} provider can fail, so capture must run as an async state machine with retries and a DLQ (~${formatCount(
        analysis.pspBacklog,
      )} in flight).`,
    });
  } else if (analysis.externalPspIntegration) {
    reasons.push({
      severity: 'ok',
      text: 'An external provider is in the loop; capture should stay off the synchronous request path even at low volume.',
    });
  }

  if (analysis.needsPartitioning) {
    reasons.push({
      severity: analysis.storageGigabytes > comfortableLedgerStorageGigabytes * 2 ? 'danger' : 'warning',
      text: `${formatCount(
        analysis.totalLedgerEntries,
      )} entries (~${formatStorageGigabytes(
        analysis.storageGigabytes,
      )}) and the write rate exceed one node; partition by account so balanced writes stay atomic.`,
    });
  }

  if (analysis.needsReconciliation) {
    reasons.push({
      severity: 'warning',
      text: `Re-balance provider records against the ledger every ${formatDuration(
        analysis.reconciliationWindowSeconds,
      )} to catch drift before it compounds.`,
    });
  }

  if (analysis.needsAudit) {
    reasons.push({
      severity: 'ok',
      text: 'An append-only audit / event log captures every state transition for compliance and lets balances be replayed.',
    });
  }

  if (!analysis.strongConsistencyLedger) {
    reasons.push({
      severity: 'danger',
      text: 'Dropping the synchronous strong-consistency commit buys write headroom but risks unbalanced or lost money; correctness should gate this.',
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
        ? `Require an idempotency key per request so the ${formatRate(
            flags.paymentsPerSecond,
          )}/s of attempts and retries are processed exactly once.`
        : 'No idempotency layer yet; low volume and few retries make accidental duplicates unlikely.',
    },
    doubleEntry: {
      state: flags.needsDoubleEntry ? 'needed' : 'useful',
      copy: flags.needsDoubleEntry
        ? 'Record balanced debits and credits in an append-only ledger so money can never be created or lost.'
        : 'A simple transactional table is enough while volume is tiny, but double-entry pays off as soon as balances must be audited.',
    },
    consistency: {
      state: flags.strongConsistencyLedger
        ? flags.needsPartitioning
          ? 'tradeoff'
          : 'needed'
        : 'tradeoff',
      copy: flags.strongConsistencyLedger
        ? flags.needsPartitioning
          ? 'Keep ACID per account: partition by account so each balanced write stays in one transaction even as you scale.'
          : 'Commit balanced debits and credits in a single ACID transaction before acknowledging the payment.'
        : 'Eventual consistency raises throughput but risks unbalanced money; for a ledger, strong consistency is the safer default.',
    },
    pspIntegration: {
      state: flags.externalPspIntegration ? (flags.needsAsyncPsp ? 'needed' : 'useful') : 'not-yet',
      copy: flags.externalPspIntegration
        ? flags.needsAsyncPsp
          ? `Capture through the ${formatMs(
              flags.pspLatencyMs,
            )} provider as an async state machine with up to ${Math.round(
              flags.retryAttempts,
            )} retries and a dead-letter queue.`
          : 'An external provider is integrated; even now, keep capture asynchronous so provider latency never blocks the request.'
        : 'No external provider; capture is internal, so there is no slow async tier to manage yet.',
    },
    reconciliation: {
      state: flags.needsReconciliation ? 'needed' : flags.externalPspIntegration ? 'useful' : 'not-yet',
      copy: flags.needsReconciliation
        ? `Reconcile provider records against the ledger every ${formatDuration(
            flags.reconciliationWindowSeconds,
          )} so drift is caught before it compounds.`
        : flags.externalPspIntegration
          ? 'A daily reconciliation pass is enough while volume is low, but tighten the window as money flow grows.'
          : 'Nothing external to reconcile against while the ledger is the only system of record.',
    },
    audit: {
      state: flags.needsAudit ? 'needed' : 'useful',
      copy: flags.needsAudit
        ? 'Keep an append-only audit / event log of every transition for compliance and replayable balances.'
        : 'Even small ledgers benefit from an event log; it becomes mandatory once balances must be audited.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsIdempotency && !flags.needsDoubleEntry && !flags.needsAsyncPsp && !flags.needsPartitioning) {
    return 'Single ACID database';
  }
  if (flags.needsPartitioning && flags.needsAsyncPsp) {
    return 'Account-partitioned ledger + async PSP + reconciliation';
  }
  if (flags.needsAsyncPsp) {
    return 'Idempotent double-entry ledger + async PSP capture';
  }
  if (flags.needsDoubleEntry) {
    return 'Idempotent double-entry ledger';
  }
  return 'Single ACID database';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsIdempotency && !flags.needsDoubleEntry && !flags.needsAsyncPsp && !flags.needsPartitioning) {
    return 'One ACID database commits every payment atomically and durably. Idempotency, async capture, and partitioning are not justified yet.';
  }
  if (flags.needsPartitioning && flags.needsAsyncPsp) {
    return 'Idempotency dedupes retries, a double-entry ledger partitioned by account stays the source of truth, and an async PSP adapter with retries plus continuous reconciliation and an audit log handle the unreliable provider at scale.';
  }
  if (flags.needsAsyncPsp) {
    return 'An idempotency layer makes retries safe, a double-entry ACID ledger is the source of truth, and capture runs as an async state machine against the slow external provider.';
  }
  if (flags.needsDoubleEntry) {
    return 'An idempotency layer dedupes retries and a double-entry, append-only ledger commits balanced debits and credits as the auditable source of truth.';
  }
  return 'One ACID database still keeps every payment correct.';
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
