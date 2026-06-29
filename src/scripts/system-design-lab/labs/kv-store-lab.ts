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
  eyebrow: '系统设计 Lab',
  title: '分布式 key-value store 通过调节「多少个 replica 必须达成一致」，在 consistency、latency 和 availability 之间做权衡。',
  summary:
    '调节吞吐、key 数量、value 大小、replication factor N、read quorum R、write quorum W，以及集群规模。设计会从单节点逐步演进到 consistent-hash ring、replication、quorum 调优（把 CAP 权衡变得具体），最后到带 anti-entropy 的多 region。这对应 Amazon Dynamo 和 Apache Cassandra。',
  controls: [
    {
      id: 'opsPerSecond',
      label: '吞吐',
      help: '整个集群每秒的 get 和 put 操作总数。',
      min: 100,
      max: 5_000_000,
      defaultValue: 20_000,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'totalKeys',
      label: '已存 key 数',
      help: 'store 里保存的不同 key 的总数。',
      min: 100_000,
      max: 100_000_000_000,
      defaultValue: 50_000_000,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'valueSizeBytes',
      label: '平均 value 大小',
      help: '一个 value 序列化后的平均大小，单位 kilobytes。',
      min: 0.1,
      max: 1_024,
      defaultValue: 4,
      scale: 'log',
      format: 'kilobytes',
    },
    {
      id: 'replicationFactor',
      label: 'Replication factor (N)',
      help: '每个 key 由多少个 node 各持一份副本。N 越大能扛越多故障，但会放大写入。',
      min: 1,
      max: 7,
      defaultValue: 3,
      scale: 'linear',
      unit: '个',
      format: 'count',
    },
    {
      id: 'readQuorum',
      label: 'Read quorum (R)',
      help: '一次读必须有多少个 replica 响应。R+W>N 给出接近强一致；R 越小越快。',
      min: 1,
      max: 7,
      defaultValue: 2,
      scale: 'linear',
      unit: '个',
      format: 'count',
    },
    {
      id: 'writeQuorum',
      label: 'Write quorum (W)',
      help: '一次写必须有多少个 replica 确认。R+W>N 给出接近强一致；W 越小越快。',
      min: 1,
      max: 7,
      defaultValue: 2,
      scale: 'linear',
      unit: '个',
      format: 'count',
    },
    {
      id: 'clusterNodes',
      label: '集群节点数',
      help: 'ring 上的物理 node。node 越多越能摊开负载和存储，但 membership 通信也越多。',
      min: 1,
      max: 1_000,
      defaultValue: 6,
      scale: 'log',
      unit: '台',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'strongConsistency',
      label: '强制强一致',
      help: '要求 R+W>N，让每次读都能看到最新已确认的写，代价是 latency 和 availability。',
      defaultValue: false,
    },
    {
      id: 'multiRegion',
      label: '跨 region 复制',
      help: '把 replica 放在多个 region，换取就近访问和灾难存活；会引入跨 region 的 latency 和冲突。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-node',
      step: '01',
      title: '单节点',
      summary: '一台机器装下所有 key，没有 replication。',
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
      summary: 'key 数超出单节点，分散到一个 hash ring 上。',
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
      title: '为 durability 做 replication',
      summary: '每个 key 复制到 N 个 node 上以扛过故障。',
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
      title: 'Quorum 调优的一致性',
      summary: '调高 R 和 W，让读能看到最新的写。',
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
      summary: 'replica 跨越多个 region；gossip 和 read repair 来修复它们。',
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
    title: '分布式 key-value store 架构图',
    description:
      'Dynamo 风格 key-value store 的白板风格架构图：clients、把 key hash 到 ring 上的 coordinator、consistent-hash ring 上的 partition、各持一份 key 的 N 个 replica node，以及由 gossip membership 和 read repair 组成的异步 anti-entropy 层。',
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
            summary: '用一个不透明的 key 发起 get 和 put 操作',
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
            subtitle: 'hash + 路由',
            kind: 'scheduler',
            summary: '对 key 做 hash，找到它在 ring 上的位置，并把请求 fan-out 给各个 replica',
          },
          {
            id: 'quorum',
            title: 'Quorum logic',
            subtitle: 'R + W 闸门',
            kind: 'service',
            summary: '等到 R 个读响应或 W 个写 ack 之后再回复 client',
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
            subtitle: 'virtual node',
            kind: 'scheduler',
            summary: '把 key 的 hash 映射到 partition；virtual node 让集群变化时负载保持均衡',
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
            subtitle: '第一个 owner',
            kind: 'nosql',
            summary: 'ring 上为某个 key 负责的 N 个 node 中的第一个',
          },
          {
            id: 'extraReplicas',
            title: 'Extra replicas',
            subtitle: '接下来 N-1 个 node',
            kind: 'nosql',
            summary: '顺时针往下的几个 node，各持一份副本以提供 durability 和 availability',
          },
          {
            id: 'hintedHandoff',
            title: 'Hinted handoff',
            subtitle: 'failover 写入',
            kind: 'nosql',
            summary: '一个替补 node 临时替挂掉的 replica 存下写入，之后再回放给它',
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
            summary: 'node 之间交换 membership 和健康状态，让 ring 不靠 master 也能收敛',
          },
          {
            id: 'readRepair',
            title: 'Read repair',
            subtitle: '修复 divergence',
            kind: 'compute',
            summary: '修复读取时发现的过期 replica，以及通过后台 Merkle-tree 同步来调和差异',
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
    { id: 'perNodeLoad', label: '每节点操作负载' },
    { id: 'perNodeStorage', label: '每节点存储' },
    { id: 'writeAmplification', label: 'Write amplification' },
    { id: 'consistencyPressure', label: 'Quorum / 一致性' },
    { id: 'crossRegionCost', label: '跨 region + anti-entropy' },
  ],
  decisions: [
    { id: 'partitioning', title: 'Partitioning' },
    { id: 'replication', title: 'Replication factor' },
    { id: 'quorum', title: 'Quorum 调优' },
    { id: 'conflicts', title: '冲突解决' },
    { id: 'failure', title: '故障处理' },
    { id: 'membership', title: 'Membership' },
  ],
  sourceBackedRules: [
    {
      title: 'Consistent hashing 把 key 分区，并把 membership 变化时的搬迁量限制在很小范围',
      source: 'Amazon Dynamo (SOSP 2007)',
      url: 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf',
      summary:
        'Dynamo 用 hash 把 key 放到 ring 上，并用 virtual node，使得加入或移除一个 node 只搬动一小部分 key，从而保持负载均衡。',
    },
    {
      title: 'Quorum R+W>N 给出 read-your-writes；更小的 quorum 偏向 latency 和 availability',
      source: 'Amazon Dynamo (SOSP 2007)',
      url: 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf',
      summary:
        'Dynamo 把 N、R、W 暴露成可调旋钮；R+W>N 让读集合和写集合产生重叠，于是一次读能看到最新的写，代价是 latency 和 availability。',
    },
    {
      title: 'Hinted handoff 和 read repair 让 store 保持 available 和最终一致',
      source: 'Apache Cassandra Docs',
      url: 'https://cassandra.apache.org/doc/',
      summary:
        'Cassandra 为不可达的 replica 存下 hint，并在读取时以及通过后台 anti-entropy 修复差异，所以故障不会阻塞写入。',
    },
    {
      title: 'DynamoDB 是一个托管的 key-value store，带可调、按 region 范围的 replication',
      source: 'AWS DynamoDB',
      url: 'https://aws.amazon.com/dynamodb/',
      summary:
        'DynamoDB 提供最终一致和强一致的读，以及跨 region 复制的 global table，把同样的 N/R/W 权衡变成了托管服务。',
    },
  ],
  teachingAssumptions: [
    '每节点的操作和存储预算是保守的教学数字；真实 node 会因硬件和 value 大小差异很大。',
    'Write amplification 简单地按 replication factor N 建模——每个 put 都施加到 N 个 replica 上。',
    '一致性压力用 R+W 和 N 做对比；它抽象掉了 clock skew、sloppy quorum 和 hinted write。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-box',
      step: '01',
      focus: '单节点，没有 replica',
      scenarioId: 'single-node',
      question:
        '一百万个 key、5k ops/s，舒舒服服地装在一台机器上。现在需要 ring、replication 或 quorum 吗？',
      reveal:
        '不需要。一个 node 直接服务所有读和写。没有东西要分区，也没有东西要保持同步，所以 hash ring、replica 和 quorum logic 都纯属额外开销。',
      takeaway: '从单节点起步；分布式是对负载和故障的回应，不是默认选项。',
    },
    {
      id: 'partition',
      step: '02',
      focus: 'key 数超出单节点',
      scenarioId: 'partitioned-ring',
      question:
        '现在 500M 个 key、120k ops/s，单台机器装不下了。怎么摊开它们，才能让加容量很便宜？',
      reveal:
        '把每个 key hash 到一个 consistent-hash ring 上，给各个 node 分配 range，用 virtual node 来平衡。Consistent hashing 意味着加一个 node 只搬动一小部分 key，而不是把所有东西重新 hash 一遍。',
      takeaway: 'Consistent hashing 把 key 分区，让集群只搬动一小片数据就能扩容。',
    },
    {
      id: 'replicate',
      step: '03',
      focus: '扛过节点故障',
      scenarioId: 'replicated',
      question:
        '每个 key 只有一份副本时，丢一个 node 就丢了它的数据。你把 N 设成 3。这在每次写入上要付出什么代价？',
      reveal:
        '现在每个 put 都必须施加到 3 个 replica 上，所以写入流量和存储被放大了大约 N 倍。换来的是任何单个 node（很快是任何两个）都能挂掉而不丢 key，而且读也有更多地方可去。',
      takeaway: 'Replication 用 N 倍的写入和存储代价，换来 durability 和 availability。',
    },
    {
      id: 'quorum',
      step: '04',
      focus: '一致性 vs latency',
      scenarioId: 'quorum-tuned',
      question:
        'N=3 时，一次只写 W=1 的快写，可能被 R=1 的读漏掉。你想让读看到最新的写——R 和 W 该取多少？',
      reveal:
        '选 R 和 W 让 R+W>N——比如 N=3 下取 R=2、W=2。这样 read quorum 和 write quorum 就在至少一个最新 replica 上重叠，于是一次读能看到最新已确认的写。代价是更高的 latency 和更低的 availability，因为要更多 replica 响应。这就是把 CAP 权衡变得具体。',
      takeaway: 'R+W>N 让两个 quorum 重叠以实现 read-your-writes，用 latency 和 availability 换 consistency。',
    },
    {
      id: 'global',
      step: '05',
      focus: 'Multi-region + 自愈',
      scenarioId: 'multi-region',
      question:
        '现在 replica 跨越多个 region，在 400 个 node 的规模下 node 不停地挂。写入怎么扛过故障，replica 又怎么收敛？',
      reveal:
        '用 hinted handoff，让替补 node 替挂掉的 replica 接收写入，再用 read repair 加后台 Merkle-tree anti-entropy 来调和差异。Gossip 不靠 master 也能追踪 membership。冲突的版本用 vector clock 或 last-write-wins 解决。跨 region 链路让 latency 和冲突成为主导成本。',
      takeaway: '全球规模下，gossip、hinted handoff 和 read repair 让一个常在线的 store 保持最终一致。',
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
          ? `${formatRate(amplifiedOps)} ops/s 的 replica 工作量摊在 ${formatCount(clusterNodes)} 台 node 上。`
          : `全部 ${formatRate(amplifiedOps)} ops/s 都落在这单个 node 上。`,
      },
      perNodeStorage: {
        ratio: perNodeStorageGigabytes / comfortableStorageGigabytesPerNode,
        valueText: formatStorageGigabytes(perNodeStorageGigabytes),
        copy: `${formatCount(totalKeys)} 个 key × N=${Math.round(effectiveReplication)}，分布在 ${formatCount(clusterNodes)} 台 node 上。`,
      },
      writeAmplification: {
        ratio: effectiveReplication / 5,
        valueText: `${Math.round(effectiveReplication)}x`,
        copy: needsReplication
          ? `每个 put 都施加到 N=${Math.round(effectiveReplication)} 个 replica 上，所以写入和存储成本随 N 增长。`
          : '还没有 replication，所以每个 put 只写一次。',
      },
      consistencyPressure: {
        ratio: consistencyRatio,
        valueText:
          effectiveReplication > 1
            ? `R+W=${Math.round(readQuorum + writeQuorum)} vs N=${Math.round(effectiveReplication)}`
            : 'N=1',
        copy: consistencyMisconfigured
          ? '请求了强一致，但 R+W 并没有大于 N，所以读仍然可能漏掉最新的写。'
          : quorumOverlaps
            ? 'R+W>N：read quorum 和 write quorum 重叠，所以一次读能看到最新已确认的写。'
            : effectiveReplication > 1
              ? 'R+W<=N：小 quorum 偏向 latency 和 availability，而非 read-your-writes 一致性。'
              : '单个 replica 对自己来说天然一致。',
      },
      crossRegionCost: {
        ratio: crossRegionPressure,
        valueText: needsMultiRegion ? 'multi-region' : `${Math.round(effectiveReplication)} 个 replica`,
        copy: needsMultiRegion
          ? '跨 region 复制会引入 WAN latency，以及更多需要调和的冲突版本。'
          : needsAntiEntropy
            ? 'Gossip 和 read repair 持续运行，让各个 replica 保持收敛。'
            : '单份副本不需要 anti-entropy，也没有跨 region 流量。',
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
      text: `${formatCount(analysis.totalKeys)} 个 key 和 ${formatRate(
        analysis.opsPerSecond,
      )} ops/s，通过 ring 上的 consistent hashing 摊到 ${formatCount(analysis.clusterNodes)} 台 node 上。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '整个 keyspace 装得进一个 node，所以现在还没有东西要分区。',
    });
  }

  if (analysis.perNodeStorageGigabytes > comfortableStorageGigabytesPerNode) {
    reasons.push({
      severity: 'danger',
      text: `每个 node 要装约 ${formatStorageGigabytes(
        analysis.perNodeStorageGigabytes,
      )}，超过了舒适的每节点预算；加 node 或调低 N。`,
    });
  }

  if (analysis.needsReplication) {
    reasons.push({
      severity: 'warning',
      text: `N=${Math.round(
        analysis.effectiveReplication,
      )} 给每个 key 存这么多份以保 durability，所以每个 put 在写入和存储上都被放大了 ${Math.round(
        analysis.effectiveReplication,
      )} 倍。`,
    });
  }

  if (analysis.consistencyMisconfigured) {
    reasons.push({
      severity: 'danger',
      text: `强一致开着，但 R+W=${Math.round(
        analysis.readQuorum + analysis.writeQuorum,
      )} 并没有大于 N=${Math.round(
        analysis.effectiveReplication,
      )}；调高 R 或 W 让两个 quorum 重叠。`,
    });
  } else if (analysis.quorumOverlaps) {
    reasons.push({
      severity: 'ok',
      text: `R+W=${Math.round(analysis.readQuorum + analysis.writeQuorum)} > N=${Math.round(
        analysis.effectiveReplication,
      )}：读和写重叠，所以一次读会返回最新已确认的写。`,
    });
  } else if (analysis.needsReplication) {
    reasons.push({
      severity: 'warning',
      text: `R+W=${Math.round(analysis.readQuorum + analysis.writeQuorum)} <= N=${Math.round(
        analysis.effectiveReplication,
      )}：小 quorum 降低了 latency，但读可能漏掉一个近期的写（最终一致）。`,
    });
  }

  if (analysis.needsConflictResolution) {
    reasons.push({
      severity: 'warning',
      text: '宽松 quorum 下的并发写可能产生分歧，所以版本用 vector clock 或 last-write-wins 来调和。',
    });
  }

  if (analysis.needsMultiRegion) {
    reasons.push({
      severity: 'warning',
      text: 'replica 跨 region 会引入 WAN latency 和更多冲突；hinted handoff 和 read repair 让 store 保持 available 和收敛。',
    });
  } else if (analysis.needsAntiEntropy) {
    reasons.push({
      severity: 'ok',
      text: 'Gossip 追踪 membership，read repair 加后台 anti-entropy 不靠 master 就能修复过期的 replica。',
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
        ? '把 key hash 到带 virtual node 的 consistent-hash ring 上，让扩容只重排一小部分 key。'
        : '一个 node 装下所有东西；在 key 或负载超出单台机器之前，不需要 ring。',
    },
    replication: {
      state: flags.needsReplication ? 'needed' : 'not-yet',
      copy: flags.needsReplication
        ? `把每个 key 复制到 N=${Math.round(
            flags.effectiveReplication,
          )} 个 node，让 store 能扛过 node 丢失，代价是 N 倍的写入和存储。`
        : '在 durability 或 availability 提出更高要求之前，每个 key 一份副本就够了。',
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
        ? '请求了强一致，但 R+W 并没有大于 N；调高 R 或 W 让两个 quorum 重叠。'
        : flags.quorumOverlaps
          ? `N=${Math.round(
              flags.effectiveReplication,
            )} 下取 R=${Math.round(flags.readQuorum)}、W=${Math.round(
              flags.writeQuorum,
            )}，给出 R+W>N 以实现 read-your-writes，用 latency 换 consistency。`
          : flags.needsReplication
            ? '小的 R 和 W 偏向低 latency 和高 availability，代价是读可能拿到过期数据。'
            : '只有一个 replica 时，没有 quorum 可调。',
    },
    conflicts: {
      state: flags.needsConflictResolution ? 'needed' : flags.needsReplication ? 'useful' : 'not-yet',
      copy: flags.needsReplication
        ? '用 vector clock（因果合并）或 last-write-wins（更简单，但可能丢更新）来解决分歧的版本。'
        : '单份副本永远不会冲突，所以不需要调和。',
    },
    failure: {
      state: flags.needsReplication ? 'needed' : 'not-yet',
      copy: flags.needsReplication
        ? '用 hinted handoff，让替补 node 替挂掉的 replica 接收写入，等它回来再回放。'
        : '只有一个 node 时没有 failover；它一丢就全丢，所以在加上 replication 之前这一项关闭。',
    },
    membership: {
      state: flags.needsPartitioning ? 'needed' : 'not-yet',
      copy: flags.needsPartitioning
        ? '用 gossip 追踪 node 的 membership 和健康，让 ring 不靠中心 master 也能收敛。'
        : '单个 node 不需要 membership 协议。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsPartitioning && !flags.needsReplication) {
    return '单节点';
  }
  if (flags.needsMultiRegion) {
    return '多 region 复制的 ring + anti-entropy';
  }
  if (flags.needsReplication && flags.quorumOverlaps) {
    return '带 quorum 一致性的复制 ring';
  }
  if (flags.needsReplication) {
    return '复制的 consistent-hash ring';
  }
  return 'Partitioned 的 consistent-hash ring';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsPartitioning && !flags.needsReplication) {
    return '一个 node 装下所有 key，直接服务每个 get 和 put。ring、replication、quorum logic 现在都还没必要。';
  }
  if (flags.needsMultiRegion) {
    return 'key 在 consistent-hash ring 上分区，并跨 region 复制；gossip、hinted handoff 和 read repair 让一个常在线的 store 保持最终一致。';
  }
  if (flags.needsReplication && flags.quorumOverlaps) {
    return '每个 key 复制到 ring 上的 N 个 node，R+W>N 的 quorum 让读看到最新的写，用 latency 和 availability 换 consistency。';
  }
  if (flags.needsReplication) {
    return '每个 key 复制到 N 个 node 以保 durability，宽松的 quorum 偏向低 latency 和高 availability，而非 read-your-writes 一致性。';
  }
  return 'key 被 hash 到一个 consistent-hash ring 上，让存储和吞吐跨 node 扩展，但每个 key 仍然只有一份副本。';
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
