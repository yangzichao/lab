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

const comfortableOpsPerNode = 30_000;
const comfortableStorageGigabytesPerNode = 1_000;
const bytesOverheadPerKey = 64;

export const keyValueStoreLabDefinition: SystemDesignLabDefinition = {
  id: 'kv-store',
  eyebrow: 'System Design Lab',
  title: 'A distributed key-value store trades consistency, latency, and availability by tuning how many replicas must agree.',
  summary:
    'Change throughput, key count, value size, replication factor N, read quorum R, write quorum W, and cluster size. The design moves from a single node to a consistent-hash ring, to replication, to quorum tuning (the CAP tradeoff made concrete), and finally to multi-region with anti-entropy. This mirrors Amazon Dynamo and Apache Cassandra.',
  controls: [
    {
      id: 'opsPerSecond',
      label: 'Throughput',
      help: 'Total get and put operations per second across the whole cluster.',
      min: 100,
      max: 5_000_000,
      defaultValue: 20_000,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'totalKeys',
      label: 'Stored keys',
      help: 'Total number of distinct keys held by the store.',
      min: 100_000,
      max: 100_000_000_000,
      defaultValue: 50_000_000,
      scale: 'log',
      unit: 'keys',
      format: 'count',
    },
    {
      id: 'valueSizeBytes',
      label: 'Average value size',
      help: 'Mean serialized size of a stored value, in kilobytes.',
      min: 0.1,
      max: 1_024,
      defaultValue: 4,
      scale: 'log',
      format: 'kilobytes',
    },
    {
      id: 'replicationFactor',
      label: 'Replication factor (N)',
      help: 'How many nodes hold a copy of each key. Higher N survives more failures but amplifies writes.',
      min: 1,
      max: 7,
      defaultValue: 3,
      scale: 'linear',
      unit: 'replicas',
      format: 'count',
    },
    {
      id: 'readQuorum',
      label: 'Read quorum (R)',
      help: 'Replicas that must respond to a read. R+W>N gives strong-ish consistency; smaller R is faster.',
      min: 1,
      max: 7,
      defaultValue: 2,
      scale: 'linear',
      unit: 'replicas',
      format: 'count',
    },
    {
      id: 'writeQuorum',
      label: 'Write quorum (W)',
      help: 'Replicas that must acknowledge a write. R+W>N gives strong-ish consistency; smaller W is faster.',
      min: 1,
      max: 7,
      defaultValue: 2,
      scale: 'linear',
      unit: 'replicas',
      format: 'count',
    },
    {
      id: 'clusterNodes',
      label: 'Cluster nodes',
      help: 'Physical nodes in the ring. More nodes spread load and storage but increase membership chatter.',
      min: 1,
      max: 1_000,
      defaultValue: 6,
      scale: 'log',
      unit: 'nodes',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'strongConsistency',
      label: 'Enforce strong consistency',
      help: 'Require R+W>N so every read sees the latest acknowledged write, at the cost of latency and availability.',
      defaultValue: false,
    },
    {
      id: 'multiRegion',
      label: 'Replicate across regions',
      help: 'Place replicas in multiple regions for locality and disaster survival; adds cross-region latency and conflicts.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-node',
      step: '01',
      title: 'Single node',
      summary: 'One box holds every key with no replication.',
      values: {
        opsPerSecond: 5_000,
        totalKeys: 1_000_000,
        valueSizeBytes: 2,
        replicationFactor: 1,
        readQuorum: 1,
        writeQuorum: 1,
        clusterNodes: 1,
        strongConsistency: false,
        multiRegion: false,
      },
    },
    {
      id: 'partitioned-ring',
      step: '02',
      title: 'Partitioned ring',
      summary: 'Keys outgrow one node and spread across a hash ring.',
      values: {
        opsPerSecond: 120_000,
        totalKeys: 500_000_000,
        valueSizeBytes: 4,
        replicationFactor: 1,
        readQuorum: 1,
        writeQuorum: 1,
        clusterNodes: 12,
        strongConsistency: false,
        multiRegion: false,
      },
    },
    {
      id: 'replicated',
      step: '03',
      title: 'Replicated for durability',
      summary: 'Each key is copied to N nodes to survive failures.',
      values: {
        opsPerSecond: 300_000,
        totalKeys: 2_000_000_000,
        valueSizeBytes: 8,
        replicationFactor: 3,
        readQuorum: 1,
        writeQuorum: 1,
        clusterNodes: 30,
        strongConsistency: false,
        multiRegion: false,
      },
    },
    {
      id: 'quorum-tuned',
      step: '04',
      title: 'Quorum-tuned consistency',
      summary: 'R and W are raised so reads see the latest write.',
      values: {
        opsPerSecond: 800_000,
        totalKeys: 8_000_000_000,
        valueSizeBytes: 8,
        replicationFactor: 3,
        readQuorum: 2,
        writeQuorum: 2,
        clusterNodes: 80,
        strongConsistency: true,
        multiRegion: false,
      },
    },
    {
      id: 'multi-region',
      step: '05',
      title: 'Multi-region + anti-entropy',
      summary: 'Replicas span regions; gossip and read repair heal them.',
      values: {
        opsPerSecond: 3_000_000,
        totalKeys: 40_000_000_000,
        valueSizeBytes: 16,
        replicationFactor: 5,
        readQuorum: 2,
        writeQuorum: 2,
        clusterNodes: 400,
        strongConsistency: false,
        multiRegion: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'Distributed key-value store architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a Dynamo-style key-value store: clients, a coordinator that hashes the key onto a ring, partitions on a consistent-hash ring, the N replica nodes that hold each key, and an async anti-entropy layer of gossip membership and read repair.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'get + put',
            kind: 'client',
            summary: 'issues get and put operations keyed by an opaque key',
          },
        ],
      },
      {
        id: 'coordinator',
        label: 'Coordinator',
        variant: 'edge',
        nodes: [
          {
            id: 'coordinator',
            title: 'Coordinator',
            subtitle: 'hash + route',
            kind: 'scheduler',
            summary: 'hashes the key, finds its position on the ring, and fans the request out to replicas',
          },
          {
            id: 'quorum',
            title: 'Quorum logic',
            subtitle: 'R + W gate',
            kind: 'service',
            summary: 'waits for R reads or W write acks before answering the client',
          },
        ],
      },
      {
        id: 'ring',
        label: 'Hash ring',
        variant: 'backbone',
        nodes: [
          {
            id: 'ring',
            title: 'Consistent ring',
            subtitle: 'virtual nodes',
            kind: 'scheduler',
            summary: 'maps key hashes to partitions; virtual nodes keep load balanced as the cluster changes',
          },
        ],
      },
      {
        id: 'replicas',
        label: 'Replicas',
        variant: 'storage',
        nodes: [
          {
            id: 'primaryReplica',
            title: 'Primary replica',
            subtitle: 'first owner',
            kind: 'nosql',
            summary: 'the first of the N nodes responsible for a key on the ring',
          },
          {
            id: 'extraReplicas',
            title: 'Extra replicas',
            subtitle: 'next N-1 nodes',
            kind: 'nosql',
            summary: 'the next nodes clockwise that each hold a copy for durability and availability',
          },
          {
            id: 'hintedHandoff',
            title: 'Hinted handoff',
            subtitle: 'failover writes',
            kind: 'nosql',
            summary: 'a stand-in node temporarily stores writes for a down replica and replays them later',
          },
        ],
      },
      {
        id: 'antiEntropy',
        label: 'Anti-entropy',
        variant: 'processing',
        nodes: [
          {
            id: 'gossip',
            title: 'Gossip',
            subtitle: 'membership',
            kind: 'scheduler',
            summary: 'nodes exchange membership and health so the ring converges without a master',
          },
          {
            id: 'readRepair',
            title: 'Read repair',
            subtitle: 'heal divergence',
            kind: 'compute',
            summary: 'reconciles stale replicas found during reads and via background Merkle-tree syncs',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'coordinator', variant: 'primary' },
      { from: 'coordinator', to: 'quorum', variant: 'primary' },
      { from: 'coordinator', to: 'ring', variant: 'primary' },
      { from: 'ring', to: 'primaryReplica', variant: 'primary' },
      { from: 'primaryReplica', to: 'extraReplicas', variant: 'secondary' },
      { from: 'quorum', to: 'extraReplicas', variant: 'direct' },
      { from: 'extraReplicas', to: 'hintedHandoff', variant: 'secondary' },
      { from: 'extraReplicas', to: 'gossip', variant: 'secondary' },
      { from: 'extraReplicas', to: 'readRepair', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'perNodeLoad', label: 'Per-node op load' },
    { id: 'perNodeStorage', label: 'Storage per node' },
    { id: 'writeAmplification', label: 'Write amplification' },
    { id: 'consistencyPressure', label: 'Quorum / consistency' },
    { id: 'crossRegionCost', label: 'Cross-region + anti-entropy' },
  ],
  decisions: [
    { id: 'partitioning', title: 'Partitioning' },
    { id: 'replication', title: 'Replication factor' },
    { id: 'quorum', title: 'Quorum tuning' },
    { id: 'conflicts', title: 'Conflict resolution' },
    { id: 'failure', title: 'Failure handling' },
    { id: 'membership', title: 'Membership' },
  ],
  sourceBackedRules: [
    {
      title: 'Consistent hashing partitions keys and limits reshuffling on membership change',
      source: 'Amazon Dynamo (SOSP 2007)',
      url: 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf',
      summary:
        'Dynamo places keys on a ring by hash and uses virtual nodes so that adding or removing a node only moves a fraction of the keys, keeping load balanced.',
    },
    {
      title: 'Quorum R+W>N gives read-your-writes; smaller quorums favor latency and availability',
      source: 'Amazon Dynamo (SOSP 2007)',
      url: 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf',
      summary:
        'Dynamo exposes N, R, and W as tunable knobs; R+W>N makes the read and write sets overlap so a read sees the latest write, trading off latency and availability.',
    },
    {
      title: 'Hinted handoff and read repair keep the store available and eventually consistent',
      source: 'Apache Cassandra Docs',
      url: 'https://cassandra.apache.org/doc/',
      summary:
        'Cassandra stores hints for unreachable replicas and repairs divergence during reads and via background anti-entropy, so failures do not block writes.',
    },
    {
      title: 'DynamoDB is a managed key-value store with tunable, region-scoped replication',
      source: 'AWS DynamoDB',
      url: 'https://aws.amazon.com/dynamodb/',
      summary:
        'DynamoDB offers eventually and strongly consistent reads and global tables that replicate across regions, the same N/R/W tradeoffs as a managed service.',
    },
  ],
  teachingAssumptions: [
    'Per-node op and storage budgets are conservative teaching numbers; real nodes vary widely by hardware and value size.',
    'Write amplification is modeled simply as the replication factor N — every put is applied to N replicas.',
    'Consistency pressure compares R+W to N; it abstracts away clock skew, sloppy quorums, and hinted writes.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-box',
      step: '01',
      focus: 'One node, no replicas',
      scenarioId: 'single-node',
      question:
        'A million keys and 5k ops/s fit comfortably on one machine. Do you need a ring, replication, or quorums yet?',
      reveal:
        'No. One node serves every read and write directly. There is nothing to partition and nothing to keep in sync, so a hash ring, replicas, and quorum logic would all be pure overhead.',
      takeaway: 'Start with one node; distribution is a response to load and failure, not a default.',
    },
    {
      id: 'partition',
      step: '02',
      focus: 'Keys outgrow one node',
      scenarioId: 'partitioned-ring',
      question:
        'Now 500M keys and 120k ops/s no longer fit on one box. How do you spread them so adding capacity is cheap?',
      reveal:
        'Hash each key onto a consistent-hash ring and assign ranges to nodes, using virtual nodes for balance. Consistent hashing means adding a node only moves a fraction of the keys, instead of rehashing everything.',
      takeaway: 'Consistent hashing partitions keys so the cluster grows by moving only a slice of the data.',
    },
    {
      id: 'replicate',
      step: '03',
      focus: 'Surviving node failure',
      scenarioId: 'replicated',
      question:
        'With one copy per key, losing a node loses its data. You set N=3. What does that cost on every write?',
      reveal:
        'Each put must now be applied to 3 replicas, so write traffic and storage are amplified roughly N times. In exchange any single node (and soon any two) can fail without losing the key, and reads have more places to go.',
      takeaway: 'Replication buys durability and availability by paying an N-times write and storage cost.',
    },
    {
      id: 'quorum',
      step: '04',
      focus: 'Consistency vs latency',
      scenarioId: 'quorum-tuned',
      question:
        'With N=3, a fast write to W=1 can be missed by a read of R=1. You want reads to see the latest write — what R and W?',
      reveal:
        'Pick R and W so R+W>N — for example R=2, W=2 over N=3. The read and write quorums then overlap on at least one up-to-date replica, so a read sees the latest acknowledged write. The price is higher latency and lower availability, because more replicas must respond. That is the CAP tradeoff made concrete.',
      takeaway: 'R+W>N overlaps the quorums for read-your-writes, trading latency and availability for consistency.',
    },
    {
      id: 'global',
      step: '05',
      focus: 'Multi-region + healing',
      scenarioId: 'multi-region',
      question:
        'Replicas now span regions and nodes fail constantly at 400-node scale. How do writes survive failures and how do replicas converge?',
      reveal:
        'Use hinted handoff so a stand-in node accepts writes for a down replica, and read repair plus background Merkle-tree anti-entropy to reconcile divergence. Gossip tracks membership without a master. Conflicting versions are resolved by vector clocks or last-write-wins. Cross-region links make latency and conflicts the dominant cost.',
      takeaway: 'At global scale, gossip, hinted handoff, and read repair keep an always-on store eventually consistent.',
    },
  ],
  analyze: analyzeKeyValueStoreWorkload,
};

function analyzeKeyValueStoreWorkload(workload: WorkloadValues): LabAnalysis {
  const opsPerSecond = numericValue(workload, 'opsPerSecond');
  const totalKeys = numericValue(workload, 'totalKeys');
  const valueSizeBytes = numericValue(workload, 'valueSizeBytes') * 1024;
  const replicationFactor = numericValue(workload, 'replicationFactor');
  const readQuorum = numericValue(workload, 'readQuorum');
  const writeQuorum = numericValue(workload, 'writeQuorum');
  const clusterNodes = Math.max(1, numericValue(workload, 'clusterNodes'));
  const strongConsistency = Boolean(workload.strongConsistency);
  const multiRegion = Boolean(workload.multiRegion);

  const effectiveReplication = Math.min(replicationFactor, clusterNodes);
  const needsPartitioning = clusterNodes > 1;
  const needsReplication = effectiveReplication > 1;
  const quorumOverlaps = readQuorum + writeQuorum > effectiveReplication;
  const wantsStrong = strongConsistency || quorumOverlaps;
  // A miss is asking for strong consistency without the quorum overlap to back it.
  const consistencyMisconfigured = strongConsistency && !quorumOverlaps && effectiveReplication > 1;
  const needsConflictResolution = needsReplication && !quorumOverlaps;
  const needsAntiEntropy = needsReplication;
  const needsMultiRegion = multiRegion;

  // Per-node op load: each write is applied to N replicas, reads to R replicas.
  // Approximate the cluster-wide amplified op rate, spread over the nodes.
  const amplifiedOps = opsPerSecond * Math.max(1, effectiveReplication);
  const perNodeOps = amplifiedOps / clusterNodes;

  const totalStorageGigabytes =
    (totalKeys * (valueSizeBytes + bytesOverheadPerKey) * effectiveReplication) / 1_000_000_000;
  const perNodeStorageGigabytes = totalStorageGigabytes / clusterNodes;

  const consistencyRatio = effectiveReplication > 1 ? (readQuorum + writeQuorum) / (effectiveReplication + 1) : 0;
  const crossRegionPressure = Math.max(
    needsMultiRegion ? 0.85 : 0,
    needsAntiEntropy ? effectiveReplication / 7 : 0,
  );

  const flags = {
    needsPartitioning,
    needsReplication,
    quorumOverlaps,
    wantsStrong,
    consistencyMisconfigured,
    needsConflictResolution,
    needsAntiEntropy,
    needsMultiRegion,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      coordinator: needsPartitioning ? 'needed' : 'ok',
      quorum: needsReplication ? (consistencyMisconfigured ? 'warning' : 'needed') : 'inactive',
      ring: needsPartitioning ? 'needed' : 'inactive',
      primaryReplica: 'ok',
      extraReplicas: needsReplication ? 'needed' : 'inactive',
      hintedHandoff: needsReplication ? 'needed' : 'inactive',
      gossip: needsPartitioning ? 'needed' : 'inactive',
      readRepair: needsAntiEntropy ? (needsConflictResolution ? 'warning' : 'needed') : 'inactive',
    },
    flowStates: {
      clientToCoordinator: 'active',
      coordinatorToQuorum: needsReplication ? 'active' : 'inactive',
      coordinatorToRing: needsPartitioning ? 'active' : 'inactive',
      ringToPrimaryReplica: needsPartitioning ? 'active' : 'inactive',
      primaryReplicaToExtraReplicas: needsReplication ? 'active' : 'inactive',
      quorumToExtraReplicas: needsReplication ? (consistencyMisconfigured ? 'warning' : 'active') : 'inactive',
      extraReplicasToHintedHandoff: needsReplication ? 'active' : 'inactive',
      extraReplicasToGossip: needsPartitioning ? 'active' : 'inactive',
      extraReplicasToReadRepair: needsAntiEntropy ? 'active' : 'inactive',
    },
    meters: {
      perNodeLoad: {
        ratio: perNodeOps / comfortableOpsPerNode,
        valueText: `${formatRate(perNodeOps)} ops/s`,
        copy: needsPartitioning
          ? `${formatRate(amplifiedOps)} ops/s of replica work spread over ${formatCount(clusterNodes)} ${pluralize('node', clusterNodes)}.`
          : `All ${formatRate(amplifiedOps)} ops/s land on the single node.`,
      },
      perNodeStorage: {
        ratio: perNodeStorageGigabytes / comfortableStorageGigabytesPerNode,
        valueText: formatStorageGigabytes(perNodeStorageGigabytes),
        copy: `${formatCount(totalKeys)} keys x N=${Math.round(effectiveReplication)} over ${formatCount(clusterNodes)} ${pluralize('node', clusterNodes)}.`,
      },
      writeAmplification: {
        ratio: effectiveReplication / 5,
        valueText: `${Math.round(effectiveReplication)}x`,
        copy: needsReplication
          ? `Every put is applied to N=${Math.round(effectiveReplication)} replicas, so write and storage cost scale with N.`
          : 'No replication yet, so each put is written exactly once.',
      },
      consistencyPressure: {
        ratio: consistencyRatio,
        valueText:
          effectiveReplication > 1
            ? `R+W=${Math.round(readQuorum + writeQuorum)} vs N=${Math.round(effectiveReplication)}`
            : 'N=1',
        copy: consistencyMisconfigured
          ? 'Strong consistency is requested but R+W is not greater than N, so reads can still miss the latest write.'
          : quorumOverlaps
            ? 'R+W>N: the read and write quorums overlap, so a read sees the latest acknowledged write.'
            : effectiveReplication > 1
              ? 'R+W<=N: small quorums favor latency and availability over read-your-writes consistency.'
              : 'A single replica is trivially consistent with itself.',
      },
      crossRegionCost: {
        ratio: crossRegionPressure,
        valueText: needsMultiRegion ? 'multi-region' : `${Math.round(effectiveReplication)} replicas`,
        copy: needsMultiRegion
          ? 'Cross-region replication adds WAN latency and more conflicting versions to reconcile.'
          : needsAntiEntropy
            ? 'Gossip and read repair run continuously to keep the replicas converged.'
            : 'A single copy needs no anti-entropy or cross-region traffic.',
      },
    },
    decisions: buildDecisions({
      ...flags,
      effectiveReplication,
      readQuorum,
      writeQuorum,
      strongConsistency,
    }),
    reasons: buildReasons({
      ...flags,
      opsPerSecond,
      perNodeOps,
      perNodeStorageGigabytes,
      totalKeys,
      clusterNodes,
      effectiveReplication,
      readQuorum,
      writeQuorum,
      strongConsistency,
    }),
  };
}

type ArchitectureFlags = {
  needsPartitioning: boolean;
  needsReplication: boolean;
  quorumOverlaps: boolean;
  wantsStrong: boolean;
  consistencyMisconfigured: boolean;
  needsConflictResolution: boolean;
  needsAntiEntropy: boolean;
  needsMultiRegion: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    opsPerSecond: number;
    perNodeOps: number;
    perNodeStorageGigabytes: number;
    totalKeys: number;
    clusterNodes: number;
    effectiveReplication: number;
    readQuorum: number;
    writeQuorum: number;
    strongConsistency: boolean;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsPartitioning) {
    reasons.push({
      severity: analysis.perNodeOps > comfortableOpsPerNode ? 'danger' : 'ok',
      text: `${formatCount(analysis.totalKeys)} keys and ${formatRate(
        analysis.opsPerSecond,
      )} ops/s are spread across ${formatCount(analysis.clusterNodes)} ${pluralize(
        'node',
        analysis.clusterNodes,
      )} by consistent hashing on a ring.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'The whole keyspace fits on one node, so there is nothing to partition yet.',
    });
  }

  if (analysis.perNodeStorageGigabytes > comfortableStorageGigabytesPerNode) {
    reasons.push({
      severity: 'danger',
      text: `Each node holds ~${formatStorageGigabytes(
        analysis.perNodeStorageGigabytes,
      )}, above a comfortable per-node budget; add nodes or lower N.`,
    });
  }

  if (analysis.needsReplication) {
    reasons.push({
      severity: 'warning',
      text: `N=${Math.round(
        analysis.effectiveReplication,
      )} copies each key for durability, so every put is amplified ${Math.round(
        analysis.effectiveReplication,
      )}x in writes and storage.`,
    });
  }

  if (analysis.consistencyMisconfigured) {
    reasons.push({
      severity: 'danger',
      text: `Strong consistency is on but R+W=${Math.round(
        analysis.readQuorum + analysis.writeQuorum,
      )} is not greater than N=${Math.round(
        analysis.effectiveReplication,
      )}; raise R or W so the quorums overlap.`,
    });
  } else if (analysis.quorumOverlaps) {
    reasons.push({
      severity: 'ok',
      text: `R+W=${Math.round(analysis.readQuorum + analysis.writeQuorum)} > N=${Math.round(
        analysis.effectiveReplication,
      )}: reads and writes overlap, so a read returns the latest acknowledged write.`,
    });
  } else if (analysis.needsReplication) {
    reasons.push({
      severity: 'warning',
      text: `R+W=${Math.round(analysis.readQuorum + analysis.writeQuorum)} <= N=${Math.round(
        analysis.effectiveReplication,
      )}: small quorums cut latency but reads may miss a recent write (eventual consistency).`,
    });
  }

  if (analysis.needsConflictResolution) {
    reasons.push({
      severity: 'warning',
      text: 'Concurrent writes under loose quorums can diverge, so versions are reconciled with vector clocks or last-write-wins.',
    });
  }

  if (analysis.needsMultiRegion) {
    reasons.push({
      severity: 'warning',
      text: 'Replicas spanning regions add WAN latency and more conflicts; hinted handoff and read repair keep the store available and converging.',
    });
  } else if (analysis.needsAntiEntropy) {
    reasons.push({
      severity: 'ok',
      text: 'Gossip tracks membership and read repair plus background anti-entropy heal stale replicas without a master.',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    effectiveReplication: number;
    readQuorum: number;
    writeQuorum: number;
    strongConsistency: boolean;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    partitioning: {
      state: flags.needsPartitioning ? 'needed' : 'not-yet',
      copy: flags.needsPartitioning
        ? 'Hash keys onto a consistent-hash ring with virtual nodes so growth only reshuffles a fraction of the keys.'
        : 'One node holds everything; no ring is needed until keys or load outgrow a single box.',
    },
    replication: {
      state: flags.needsReplication ? 'needed' : 'not-yet',
      copy: flags.needsReplication
        ? `Copy each key to N=${Math.round(
            flags.effectiveReplication,
          )} nodes so the store survives node loss, at an N-times write and storage cost.`
        : 'A single copy per key is enough until durability or availability demands more.',
    },
    quorum: {
      state: flags.consistencyMisconfigured
        ? 'tradeoff'
        : flags.quorumOverlaps
          ? 'needed'
          : flags.needsReplication
            ? 'useful'
            : 'not-yet',
      copy: flags.consistencyMisconfigured
        ? 'Strong consistency is requested but R+W is not greater than N; raise R or W to make the quorums overlap.'
        : flags.quorumOverlaps
          ? `R=${Math.round(flags.readQuorum)}, W=${Math.round(
              flags.writeQuorum,
            )} over N=${Math.round(
              flags.effectiveReplication,
            )} gives R+W>N for read-your-writes, trading latency for consistency.`
          : flags.needsReplication
            ? 'Small R and W favor low latency and high availability at the cost of possibly stale reads.'
            : 'With one replica, there is no quorum to tune.',
    },
    conflicts: {
      state: flags.needsConflictResolution ? 'needed' : flags.needsReplication ? 'useful' : 'not-yet',
      copy: flags.needsReplication
        ? 'Resolve divergent versions with vector clocks (causal merge) or last-write-wins (simpler, may drop updates).'
        : 'A single copy never conflicts, so no reconciliation is needed.',
    },
    failure: {
      state: flags.needsReplication ? 'needed' : 'not-yet',
      copy: flags.needsReplication
        ? 'Use hinted handoff so a stand-in node accepts writes for a down replica and replays them when it returns.'
        : 'With one node there is no failover; its loss is total, so this stays off until replication is added.',
    },
    membership: {
      state: flags.needsPartitioning ? 'needed' : 'not-yet',
      copy: flags.needsPartitioning
        ? 'Track node membership and health with gossip so the ring converges without a central master.'
        : 'A single node needs no membership protocol.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsPartitioning && !flags.needsReplication) {
    return 'Single node';
  }
  if (flags.needsMultiRegion) {
    return 'Multi-region replicated ring + anti-entropy';
  }
  if (flags.needsReplication && flags.quorumOverlaps) {
    return 'Replicated ring with quorum consistency';
  }
  if (flags.needsReplication) {
    return 'Replicated consistent-hash ring';
  }
  return 'Partitioned consistent-hash ring';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsPartitioning && !flags.needsReplication) {
    return 'One node holds every key and serves every get and put directly. No ring, replication, or quorum logic is justified yet.';
  }
  if (flags.needsMultiRegion) {
    return 'Keys are partitioned on a consistent-hash ring and replicated across regions; gossip, hinted handoff, and read repair keep an always-on store eventually consistent.';
  }
  if (flags.needsReplication && flags.quorumOverlaps) {
    return 'Each key is copied to N nodes on the ring, and R+W>N quorums make reads see the latest write, trading latency and availability for consistency.';
  }
  if (flags.needsReplication) {
    return 'Each key is replicated to N nodes for durability, with loose quorums favoring low latency and high availability over read-your-writes consistency.';
  }
  return 'Keys are hashed onto a consistent-hash ring so storage and throughput scale across nodes, but each key still has a single copy.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsPartitioning && !flags.needsReplication) {
    return 'get/put -> single node';
  }
  if (flags.needsMultiRegion) {
    return 'get/put -> coordinator -> ring -> N replicas across regions -> gossip + read repair';
  }
  if (flags.needsReplication) {
    return 'get/put -> coordinator -> ring -> N replicas (R/W quorum)';
  }
  return 'get/put -> coordinator -> ring -> partition node';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function pluralize(unit: string, value: number): string {
  return Math.round(value) === 1 ? unit : `${unit}s`;
}
