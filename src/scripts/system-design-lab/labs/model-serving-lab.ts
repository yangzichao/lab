import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatRate } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative single-replica teaching budgets (not vendor limits).
const cpuOpsPerCore = 1_000; // effective inferences/s a single CPU replica sustains on a small model
const gpuThroughputMultiplier = 8; // a GPU replica clears this many times more work than a CPU replica
const batchAmortizationCeiling = 6; // largest realistic throughput multiplier from batching one model
const safeUtilization = 0.75; // keep replicas below this to protect p99 under load
const modelsPerReplicaBudget = 4; // distinct models one replica can hot-load without thrash

export const modelServingLabDefinition: SystemDesignLabDefinition = {
  id: 'model-serving',
  eyebrow: '系统设计 Lab',
  title:
    '实时 model serving 是一道 throughput 对 tail latency 的权衡题：batching 和 GPU 买来容量，但每一分收益都要从你的 p99 预算里掏。',
  summary:
    '调节请求速率、单请求的 model latency、batch window、host 多少 replica 和多少 model，以及你的 p99 目标。开关 dynamic batching 和 GPU acceleration。架构会从单个 model endpoint，演进到 dynamic batching、GPU 加持的 autoscaling replica、带 canary rollout 的 model registry，最终到高 throughput 下的多 model packing。',
  controls: [
    {
      id: 'requestsPerSecond',
      label: 'Inference 速率',
      help: '所有 host 的 model 上，每秒到达的预测请求数。',
      min: 1,
      max: 500_000,
      defaultValue: 200,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'modelLatencyMs',
      label: 'Model 计算延迟',
      help: '单个请求做一次 forward pass 的时间，不含 batching 和排队。',
      min: 1,
      max: 500,
      defaultValue: 20,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'batchWindowMs',
      label: 'Batch window',
      help: 'server 等多久把请求攒成一个 batch。window 越大 throughput 越高，但会增加排队延迟。',
      min: 0,
      max: 100,
      defaultValue: 5,
      scale: 'linear',
      format: 'milliseconds',
    },
    {
      id: 'replicaCount',
      label: 'Model server replica 数',
      help: 'gateway 可以路由到的并行 model-server 实例（GPU 或 CPU）。',
      min: 1,
      max: 500,
      defaultValue: 2,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'modelsHosted',
      label: 'Host 的 model 数',
      help: '平台同时对外服务的 distinct model（或版本）数。',
      min: 1,
      max: 500,
      defaultValue: 1,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'p99TargetMs',
      label: 'p99 latency 目标',
      help: '第 99 百分位请求必须守住的端到端预算，含排队。',
      min: 5,
      max: 1_000,
      defaultValue: 100,
      scale: 'log',
      format: 'milliseconds',
    },
  ],
  toggles: [
    {
      id: 'dynamicBatching',
      label: 'Dynamic batching',
      help: '把并发请求合并成一个 padded batch 来高效利用 accelerator；拿一点延迟换 throughput。',
      defaultValue: true,
    },
    {
      id: 'gpuAcceleration',
      label: 'GPU acceleration',
      help: '让 replica 跑在 GPU 上。throughput 高得多，但只有请求能 batch 起来才回得了本。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-endpoint',
      step: '01',
      title: '单个 model endpoint',
      summary: '一个 model、流量很轻、一个 CPU replica。',
      values: {
        requestsPerSecond: 50,
        modelLatencyMs: 15,
        batchWindowMs: 0,
        replicaCount: 1,
        modelsHosted: 1,
        p99TargetMs: 200,
        dynamicBatching: false,
        gpuAcceleration: false,
      },
    },
    {
      id: 'batching',
      step: '02',
      title: 'Dynamic batching',
      summary: '流量上来了；合并请求以用满硬件。',
      values: {
        requestsPerSecond: 3_000,
        modelLatencyMs: 20,
        batchWindowMs: 10,
        replicaCount: 4,
        modelsHosted: 1,
        p99TargetMs: 150,
        dynamicBatching: true,
        gpuAcceleration: false,
      },
    },
    {
      id: 'gpu-autoscale',
      step: '03',
      title: 'GPU + autoscaling',
      summary: '更重的 model 需要 GPU 和更多 replica。',
      values: {
        requestsPerSecond: 25_000,
        modelLatencyMs: 60,
        batchWindowMs: 15,
        replicaCount: 5,
        modelsHosted: 1,
        p99TargetMs: 130,
        dynamicBatching: true,
        gpuAcceleration: true,
      },
    },
    {
      id: 'registry-canary',
      step: '04',
      title: 'Registry + canary',
      summary: '多个版本在 router 背后安全地灰度上线。',
      values: {
        requestsPerSecond: 60_000,
        modelLatencyMs: 50,
        batchWindowMs: 12,
        replicaCount: 13,
        modelsHosted: 8,
        p99TargetMs: 100,
        dynamicBatching: true,
        gpuAcceleration: true,
      },
    },
    {
      id: 'multi-model-scale',
      step: '05',
      title: '大规模多 model',
      summary: '很多 model、巨大 throughput、紧的 tail latency。',
      values: {
        requestsPerSecond: 300_000,
        modelLatencyMs: 40,
        batchWindowMs: 8,
        replicaCount: 70,
        modelsHosted: 120,
        p99TargetMs: 70,
        dynamicBatching: true,
        gpuAcceleration: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'Model serving 平台架构图',
    description:
      '实时 model serving 平台的白板式架构图：客户端、负责路由和切流的 inference gateway、做 batching 的 model-server replica、model registry 和 GPU pool，以及一条异步的 metrics 与 shadow-traffic 路径。',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'predict 调用',
            kind: 'client',
            summary: '发送实时 feature vector，并在很紧的截止时间内等一个预测结果',
          },
        ],
      },
      {
        id: 'gateway',
        label: 'Gateway',
        variant: 'edge',
        nodes: [
          {
            id: 'router',
            title: 'Inference gateway',
            subtitle: '路由 + 版本',
            kind: 'lb',
            summary: '把每个请求路由到对的 model 和版本，并强制 timeout',
          },
          {
            id: 'trafficSplit',
            title: 'Traffic split',
            subtitle: 'canary + A/B',
            kind: 'lb',
            summary: '把一部分流量切到新版本，做 canary 和 A/B 对比',
          },
        ],
      },
      {
        id: 'servers',
        label: 'Model servers',
        variant: 'backbone',
        nodes: [
          {
            id: 'batcher',
            title: 'Dynamic batcher',
            subtitle: '合并请求',
            kind: 'queue',
            summary: '在一个 window 内把并发请求攒成一个 padded batch',
          },
          {
            id: 'replicas',
            title: 'Server replicas',
            subtitle: 'autoscaled',
            kind: 'compute',
            summary: 'gateway 在其间做负载均衡的并行 model-server 实例',
          },
        ],
      },
      {
        id: 'compute',
        label: 'Registry + GPU',
        variant: 'storage',
        nodes: [
          {
            id: 'registry',
            title: 'Model registry',
            subtitle: '版本 + artifact',
            kind: 'objectstore',
            summary: '存放带版本的 model artifact，以及名字到已部署版本的映射',
          },
          {
            id: 'gpuPool',
            title: 'GPU pool',
            subtitle: 'accelerator',
            kind: 'gpu',
            summary: 'replica 调度上去做高 throughput inference 的 GPU 池',
          },
        ],
      },
      {
        id: 'async',
        label: 'Async',
        variant: 'processing',
        nodes: [
          {
            id: 'metrics',
            title: 'Metrics + latency',
            subtitle: 'p99 监控',
            kind: 'service',
            summary: '在 hot path 之外采集每个 model 的 latency 和 accuracy 指标',
          },
          {
            id: 'shadow',
            title: 'Shadow traffic',
            subtitle: 'offline eval',
            kind: 'compute',
            summary: '把线上请求镜像给候选 model 做评估，但不对外返回它们的输出',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'router', variant: 'primary' },
      { from: 'router', to: 'trafficSplit', variant: 'secondary' },
      { from: 'router', to: 'batcher', variant: 'primary' },
      { from: 'router', to: 'replicas', variant: 'direct' },
      { from: 'batcher', to: 'replicas', variant: 'primary' },
      { from: 'replicas', to: 'gpuPool', variant: 'secondary' },
      { from: 'replicas', to: 'registry', variant: 'secondary' },
      { from: 'trafficSplit', to: 'shadow', variant: 'direct' },
      { from: 'replicas', to: 'metrics', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'capacity', label: 'Serving 容量' },
    { id: 'tailLatency', label: 'p99 latency 预算' },
    { id: 'gpuEfficiency', label: 'Accelerator 效率' },
    { id: 'fleetSize', label: 'Replica 机群压力' },
    { id: 'multiModel', label: '多 model packing' },
  ],
  decisions: [
    { id: 'batching', title: 'Dynamic batching' },
    { id: 'hardware', title: '硬件 + autoscaling' },
    { id: 'registry', title: 'Model registry' },
    { id: 'rollout', title: 'A/B + canary' },
    { id: 'packing', title: '多 model packing' },
    { id: 'latencyTradeoff', title: 'p99 vs throughput' },
  ],
  sourceBackedRules: [
    {
      title: 'Dynamic batching 用 latency 换 accelerator throughput',
      source: 'NVIDIA Triton Inference Server',
      url: 'https://github.com/triton-inference-server/server',
      summary:
        'Triton 在一个可配置的延迟内把单个 inference 请求合并成一个 batch，让 GPU 每次 kernel launch 处理很多请求，以增加排队延迟为代价换来更高 throughput。',
    },
    {
      title: 'serving 系统应该给 model 做版本管理，并在一个稳定的名字背后对外服务',
      source: 'TensorFlow Serving',
      url: 'https://www.tensorflow.org/tfx/guide/serving',
      summary:
        'TF Serving 从 registry/model store 加载带版本的 model artifact，能同时服务一个 model 的多个版本，于是流量可以在版本间迁移而不必重新部署 server。',
    },
    {
      title: 'KServe 为 inference 提供 canary rollout 和 autoscaling',
      source: 'KServe',
      url: 'https://kserve.github.io/website/',
      summary:
        'KServe 暴露一个 model-serving 控制面，带 traffic splitting 做 canary rollout，以及请求驱动的 autoscaling（可缩到 0 也可从 0 拉起），让 replica 跟随负载。',
    },
    {
      title: '决定交互式 serving SLA 的是 tail latency，不是均值',
      source: 'The Tail at Scale (Dean & Barroso)',
      url: 'https://research.google/pubs/the-tail-at-scale/',
      summary:
        '在 fan-out 和高 throughput 的系统里，第 99 百分位的响应时间主导了用户可感知的延迟，所以容量和 batching 要按 p99 来定规模，而不是平均延迟。',
    },
  ],
  teachingAssumptions: [
    '单 replica 容量是教学近似：CPU 维持一个小的固定 ops/s，一个 GPU replica 清理掉数倍的工作量，而 batching 只有在流量并发到足以填满一个 batch 时才会成倍提升 throughput。batch 增益随 window 和 model latency 一起上升，因为更重的 model 每次 batch 调用能 amortize 掉更多 kernel-launch 和内存传输开销。',
    'p99 被建模为 model 计算时间 + batch window + 一个随 utilization 逼近饱和而增长的排队惩罚；惩罚再除以一个关于 replica 数的平方根人力配置因子，用 M/M/c 而非 M/M/1 来近似，于是把同样的负载摊到更多 replica 上真的能压低 tail。真实的 tail 还取决于 GC、padding 和 cold start。',
    'host 很多 model 被处理为：一旦 distinct model 超出单个 replica 能无抖动 hot-load 的数量，就需要更多 replica 或 model packing。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-model',
      step: '01',
      focus: '一个 model、轻负载',
      scenarioId: 'single-endpoint',
      question:
        '一个 ranking model 耗时 15 ms、收到 50 请求/s。你需要 batching、GPU 或 autoscaling 吗？',
      reveal:
        '不需要。在 50 req/s 下，单个 CPU replica 离饱和还很远，15 ms 的计算放进 200 ms 的 p99 预算还绰绰有余。batching 只会徒增排队延迟，GPU 则会闲着。一个 replica 背后挂一个 endpoint 就发车。',
      takeaway: '从一个 replica、不做 batching 起步；只在负载或 p99 预算逼你时才加机制。',
    },
    {
      id: 'batch-it',
      step: '02',
      focus: '流量涨 60 倍',
      scenarioId: 'batching',
      question:
        '同一个 CPU model 上，流量跳到 3k req/s。一比一加 replica 很贵——先动哪个更便宜的杠杆能拉高 throughput？',
      reveal:
        'Dynamic batching。在足够多的并发请求下，把它们合并成一个 padded batch 能 amortize 掉每次调用的开销，让每个 replica 清理掉数倍的工作量。代价是 batch window 加进了延迟，所以这个 window 必须相对 p99 目标保持很小。',
      takeaway: 'batching 把你手上已有的并发变成 throughput，但 window 里的每一毫秒都是从 p99 里掏的。',
    },
    {
      id: 'go-gpu',
      step: '03',
      focus: '更重的 model',
      scenarioId: 'gpu-autoscale',
      question:
        'model 涨到 60 ms、流量冲到 25k req/s。CPU 上 batching 已经不够了——你就一直加 CPU replica 吗？',
      reveal:
        '又重又能 batch 的 model 正是 GPU 的用武之地：batch 起来的 GPU inference 每个 replica 清理的工作量远超 CPU，所以你换到 GPU，让 autoscaler 跟随负载。GPU 回本全靠 batching 让它一直忙——一个不 batch 的 GPU 就是在烧钱。',
      takeaway: 'GPU + autoscaling 撑得起又重又能 batch 的 model；没有 batching，accelerator 就被浪费了。',
    },
    {
      id: 'versions',
      step: '04',
      focus: '多版本、安全上线',
      scenarioId: 'registry-canary',
      question:
        '现在你 host 8 个 model/版本，想发一个新版本又不想冒回归的险。流量怎么才能安全地命中对的版本？',
      reveal:
        'model registry 存放带版本的 artifact 和名字到版本的映射；gateway 按名字路由，把一小撮 canary 流量（或 A/B 分支）切给新版本，同时 shadow traffic 在 offline 评估候选。只有指标确认新版本后才推全，靠翻转切流就能即时回滚。',
      takeaway: 'registry 加 traffic splitting 把 model 发布变成可回退的 canary，而不是重新部署。',
    },
    {
      id: 'pack-it',
      step: '05',
      focus: '大规模多 model',
      scenarioId: 'multi-model-scale',
      question:
        '120 个 model、300k req/s、50 ms p99。给每个 model 配一支专属 GPU 机群会破产——你怎么在 tail latency 之内把它们全服务好？',
      reveal:
        '把多个 model packing 进同一个 replica/GPU，让 gateway 按 model 路由，于是闲着的 model 共享硬件，而不是各自占着一支预留机群。在紧的 50 ms p99 下，batch window 必须收窄、utilization 余量必须加大，所以你要交回一些 batch 效率来保住 tail。',
      takeaway: '规模上来后，多 model packing 把闲置 accelerator 收回来用，但紧的 p99 限制了你能多激进地 batch 和 pack。',
    },
  ],
  analyze: analyzeModelServingWorkload,
};

type ArchitectureFlags = {
  needsBatching: boolean;
  needsGpu: boolean;
  needsAutoscale: boolean;
  needsRegistry: boolean;
  needsCanary: boolean;
  needsPacking: boolean;
  tightTail: boolean;
};

function analyzeModelServingWorkload(workload: WorkloadValues): LabAnalysis {
  const requestsPerSecond = numericValue(workload, 'requestsPerSecond');
  const modelLatencyMs = numericValue(workload, 'modelLatencyMs');
  const batchWindowMs = numericValue(workload, 'batchWindowMs');
  const replicaCount = Math.max(1, numericValue(workload, 'replicaCount'));
  const modelsHosted = Math.max(1, numericValue(workload, 'modelsHosted'));
  const p99TargetMs = numericValue(workload, 'p99TargetMs');
  const dynamicBatching = Boolean(workload.dynamicBatching);
  const gpuAcceleration = Boolean(workload.gpuAcceleration);

  // Effective per-replica throughput.
  // Batching only helps if a window is actually set and concurrency can fill batches.
  const batchActive = dynamicBatching && batchWindowMs > 0;
  // Batch gain scales with how much work a window can pack: a wider window AND a heavier
  // model both let one accelerator call amortize more per-call overhead, so heavier models
  // benefit MORE from batching (larger kernel launches / memory transfers amortized), not less.
  const batchMultiplier = batchActive
    ? Math.min(batchAmortizationCeiling, 1 + (batchWindowMs * modelLatencyMs) / 200)
    : 1;
  const hardwareMultiplier = gpuAcceleration ? gpuThroughputMultiplier : 1;
  const baseOpsPerReplica = cpuOpsPerCore * (15 / Math.max(1, modelLatencyMs));
  const perReplicaThroughput = baseOpsPerReplica * hardwareMultiplier * batchMultiplier;
  const fleetCapacity = perReplicaThroughput * replicaCount;
  const utilization = requestsPerSecond / Math.max(1, fleetCapacity);

  // Tail latency model: compute + window + queueing penalty that explodes near saturation.
  // The raw term is an M/M/1 waiting factor at the (balanced) per-server utilization. Spreading
  // the same load over many replicas is M/M/c, not M/M/1: at a fixed per-server utilization the
  // chance of queueing falls as the fleet grows, so we divide by a square-root-staffing factor in
  // replicaCount. This is a deliberate simplification of Erlang-C (see teachingAssumptions).
  const mmcQueueingRelief = Math.sqrt(replicaCount);
  const rawQueueingMs = modelLatencyMs * (utilization / Math.max(0.01, 1 - Math.min(0.99, utilization)));
  const queueingPenaltyMs = rawQueueingMs / mmcQueueingRelief;
  const windowPenaltyMs = batchActive ? batchWindowMs : 0;
  const estimatedP99Ms = modelLatencyMs + windowPenaltyMs + Math.min(queueingPenaltyMs, modelLatencyMs * 8);

  const tightTail = p99TargetMs <= 60;
  const needsBatching = requestsPerSecond > cpuOpsPerCore && !tightTail
    ? true
    : requestsPerSecond > 2_000;
  const needsGpu = modelLatencyMs >= 40 && requestsPerSecond > 5_000;
  const needsAutoscale = requestsPerSecond > 5_000 || replicaCount > 5;
  const needsRegistry = modelsHosted > 1;
  const needsCanary = modelsHosted > 2;
  const distinctModelLoad = modelsHosted / (replicaCount * modelsPerReplicaBudget);
  // Packing pressure rises with the absolute model count and with models-per-replica density.
  const packingPressure = Math.max(distinctModelLoad, modelsHosted / 60);
  const needsPacking = modelsHosted > replicaCount || distinctModelLoad > 0.5 || modelsHosted > 20;

  const flags: ArchitectureFlags = {
    needsBatching: dynamicBatching || needsBatching,
    needsGpu: gpuAcceleration || needsGpu,
    needsAutoscale,
    needsRegistry,
    needsCanary,
    needsPacking,
    tightTail,
  };

  const overCapacity = utilization > safeUtilization;
  const tailMissed = estimatedP99Ms > p99TargetMs;

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      router: 'ok',
      trafficSplit: needsCanary ? 'needed' : 'inactive',
      batcher: dynamicBatching ? (batchActive ? 'ok' : 'warning') : needsBatching ? 'needed' : 'inactive',
      replicas: overCapacity ? 'overloaded' : utilization > safeUtilization * 0.8 ? 'warning' : 'ok',
      gpuPool: gpuAcceleration ? 'ok' : needsGpu ? 'needed' : 'inactive',
      registry: needsRegistry ? 'needed' : 'inactive',
      metrics: tailMissed ? 'warning' : 'ok',
      shadow: needsCanary ? 'needed' : 'inactive',
    },
    flowStates: {
      clientToRouter: 'active',
      routerToTrafficSplit: needsCanary ? 'active' : 'inactive',
      routerToBatcher: dynamicBatching || needsBatching ? 'active' : 'inactive',
      routerToReplicas: dynamicBatching || needsBatching ? 'inactive' : 'active',
      batcherToReplicas: dynamicBatching || needsBatching ? 'active' : 'inactive',
      replicasToGpuPool: gpuAcceleration || needsGpu ? 'active' : 'inactive',
      replicasToRegistry: needsRegistry ? 'active' : 'inactive',
      trafficSplitToShadow: needsCanary ? 'active' : 'inactive',
      replicasToMetrics: tailMissed ? 'warning' : 'active',
    },
    meters: {
      capacity: {
        ratio: utilization / safeUtilization,
        valueText: `${formatRate(requestsPerSecond)} / ${formatRate(fleetCapacity)} ops/s`,
        copy: overCapacity
          ? `需求达到机群容量的 ${Math.round(utilization * 100)}%；replica 饱和，tail 直接炸。`
          : `机群在约 ${Math.round(utilization * 100)}% 的 utilization 下扛住了负载。`,
      },
      tailLatency: {
        ratio: estimatedP99Ms / Math.max(1, p99TargetMs),
        valueText: `~${Math.round(estimatedP99Ms)} / ${Math.round(p99TargetMs)} ms`,
        copy: tailMissed
          ? `估算 p99 为 ${Math.round(estimatedP99Ms)} ms，突破了 ${Math.round(p99TargetMs)} ms 预算；收窄 batch window 或加容量。`
          : `估算 p99 为 ${Math.round(estimatedP99Ms)} ms，落在 ${Math.round(p99TargetMs)} ms 预算之内。`,
      },
      gpuEfficiency: {
        ratio: gpuAcceleration ? (batchActive ? 0.85 : 1.4) : needsGpu ? 1.2 : 0.3,
        valueText: gpuAcceleration ? (batchActive ? `${Math.round(batchMultiplier * 10) / 10}x batched` : 'unbatched') : 'CPU',
        copy: gpuAcceleration
          ? batchActive
            ? `batching 把 GPU 填到每个 replica 约 ${Math.round(batchMultiplier * 10) / 10}x。`
            : '不 batch 的 GPU 大半时间在闲着——打开 dynamic batching 才回得了本。'
          : needsGpu
            ? '这个速率下的重 model 想要 GPU；CPU replica 跟不上。'
            : '这个又轻又快的 model 用 CPU replica 就够。',
      },
      fleetSize: {
        ratio: replicaCount / 100,
        valueText: `${formatCount(replicaCount)} 个 replica`,
        copy: needsAutoscale
          ? `${formatCount(replicaCount)} 个 replica 的机群需要一个跟随请求负载的 autoscaler。`
          : '这点负载用一个小的静态 replica 数就够。',
      },
      multiModel: {
        ratio: packingPressure,
        valueText: `${formatCount(modelsHosted)} 个 model`,
        copy: needsPacking
          ? `${formatCount(modelsHosted)} 个 model 分布在 ${formatCount(replicaCount)} 个 replica 上，逼得每个 replica 要 pack 多个 model。`
          : `${formatCount(modelsHosted)} 个 model 在机群上放得很从容。`,
      },
    },
    decisions: buildDecisions({
      ...flags,
      dynamicBatching,
      gpuAcceleration,
      batchActive,
      batchWindowMs,
      modelsHosted,
      replicaCount,
      p99TargetMs,
      estimatedP99Ms,
    }),
    reasons: buildReasons({
      ...flags,
      requestsPerSecond,
      modelLatencyMs,
      batchWindowMs,
      replicaCount,
      modelsHosted,
      p99TargetMs,
      estimatedP99Ms,
      utilization,
      overCapacity,
      tailMissed,
      dynamicBatching,
      gpuAcceleration,
      batchActive,
      fleetCapacity,
    }),
  };
}

function buildReasons(
  a: ArchitectureFlags & {
    requestsPerSecond: number;
    modelLatencyMs: number;
    batchWindowMs: number;
    replicaCount: number;
    modelsHosted: number;
    p99TargetMs: number;
    estimatedP99Ms: number;
    utilization: number;
    overCapacity: boolean;
    tailMissed: boolean;
    dynamicBatching: boolean;
    gpuAcceleration: boolean;
    batchActive: boolean;
    fleetCapacity: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (a.overCapacity) {
    reasons.push({
      severity: a.utilization > 1 ? 'danger' : 'warning',
      text: `${formatRate(a.requestsPerSecond)} ops/s 已是一个 ${formatRate(
        a.fleetCapacity,
      )} ops/s 机群的 ${Math.round(a.utilization * 100)}%；趁 tail 还没崩，加 replica、GPU 或 batching。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `机群在 ${Math.round(a.utilization * 100)}% utilization 下吃下 ${formatRate(a.requestsPerSecond)} ops/s，还有余量。`,
    });
  }

  if (a.tailMissed) {
    reasons.push({
      severity: 'danger',
      text: `估算 p99 为 ${Math.round(a.estimatedP99Ms)} ms，超出 ${Math.round(
        a.p99TargetMs,
      )} ms 目标；逼近饱和时的排队和 batch window 通常是元凶。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `估算 p99 为 ${Math.round(a.estimatedP99Ms)} ms，符合 ${Math.round(a.p99TargetMs)} ms 预算。`,
    });
  }

  if (a.dynamicBatching) {
    reasons.push({
      severity: a.batchActive ? 'ok' : 'warning',
      text: a.batchActive
        ? `带 ${Math.round(a.batchWindowMs)} ms window 的 dynamic batching 把 accelerator 成本 amortize 到并发请求上。`
        : 'dynamic batching 开着，但 batch window 是 0 ms，所以没有请求被合并——设一个 window。',
    });
  } else if (a.needsBatching) {
    reasons.push({
      severity: 'warning',
      text: `在 ${formatRate(a.requestsPerSecond)} ops/s 下，把请求合并成 batch 会大幅拉高单 replica 的 throughput。`,
    });
  }

  if (a.gpuAcceleration && !a.batchActive) {
    reasons.push({
      severity: 'warning',
      text: 'GPU 开了却没有有效的 batching，于是 accelerator 跑在远低于其 throughput 潜力的水平。',
    });
  } else if (a.needsGpu) {
    reasons.push({
      severity: 'warning',
      text: `这个速率下一个 ${Math.round(a.modelLatencyMs)} ms 的 model 是可 batch 的计算密集型工作负载，GPU 服务它比 CPU 便宜得多。`,
    });
  }

  if (a.needsCanary) {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(a.modelsHosted)} 个 model/版本需要一个 registry 加 canary/A-B traffic splitting，才能安全上线并即时回滚。`,
    });
  }

  if (a.needsPacking) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(a.modelsHosted)} 个 model 摊在 ${formatCount(
        a.replicaCount,
      )} 个 replica 上，意味着每个 accelerator 要 pack 多个 model，而不是各配一支专属机群。`,
    });
  }

  // Supplementary always-on reasons so every reachable workload yields at least 4 reasons.
  // Fleet sizing always says something; the latency-headroom note is only added when there is
  // still room under the 7-reason cap, keeping every scenario in the required 4-7 band.
  const fleetReason: LabReason =
    a.replicaCount > 1
      ? {
          severity: a.needsAutoscale ? 'warning' : 'ok',
          text: a.needsAutoscale
            ? `这个负载下一个 ${formatCount(a.replicaCount)} 个 replica 的机群需要请求驱动的 autoscaler，让容量跟随需求而不是固定数。`
            : `一个 ${formatCount(a.replicaCount)} 个 replica 的小机群用静态数量就能从容覆盖这点负载。`,
        }
      : {
          severity: 'ok',
          text: '单个 replica 就能覆盖这点负载，所以目前还没有需要 autoscale 或负载均衡的机群。',
        };

  const headroomMs = a.p99TargetMs - a.estimatedP99Ms;
  const headroomReason: LabReason = a.tightTail
    ? {
        severity: 'warning',
        text: `紧的 ${Math.round(a.p99TargetMs)} ms p99 只留下 ${Math.round(
          Math.max(0, headroomMs),
        )} ms 余量，所以 batch window 得保持很小、utilization 余量得加大。`,
      }
    : {
        severity: 'ok',
        text: `${Math.round(a.p99TargetMs)} ms 的 p99 预算下大约还有 ${Math.round(Math.max(0, headroomMs))} ms 的余量，有空间把 batch window 拉宽来换更多 throughput。`,
      };

  reasons.push(fleetReason);
  if (reasons.length < 7) {
    reasons.push(headroomReason);
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  d: ArchitectureFlags & {
    dynamicBatching: boolean;
    gpuAcceleration: boolean;
    batchActive: boolean;
    batchWindowMs: number;
    modelsHosted: number;
    replicaCount: number;
    p99TargetMs: number;
    estimatedP99Ms: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    batching: {
      state: d.dynamicBatching ? (d.batchActive ? 'needed' : 'tradeoff') : d.needsBatching ? 'needed' : 'not-yet',
      copy: d.dynamicBatching
        ? d.batchActive
          ? `在一个 ${Math.round(d.batchWindowMs)} ms window 内合并请求，让每次 accelerator 调用清理掉很多请求。`
          : 'batching 开着但 window 是 0 ms；把 window 拉宽，请求才真的会 batch。'
        : d.needsBatching
          ? '在掏钱加更多 replica 之前，先打开 dynamic batching 来抬高 throughput。'
          : '还不需要 batching——负载够低，多出来的排队延迟不划算。',
    },
    hardware: {
      state: d.gpuAcceleration ? 'needed' : d.needsGpu ? 'needed' : d.needsAutoscale ? 'useful' : 'not-yet',
      copy: d.gpuAcceleration
        ? '请求驱动的 autoscaler 背后的 GPU replica 撑起这个又重又能 batch 的工作负载。'
        : d.needsGpu
          ? '把重 model 搬到 GPU；CPU replica 无法以可承受的成本达到这个 throughput。'
          : d.needsAutoscale
            ? '保留 CPU replica，但加一个 autoscaler 让机群跟随请求负载。'
            : '目前一个静态 CPU replica 就够。',
    },
    registry: {
      state: d.needsRegistry ? 'needed' : 'not-yet',
      copy: d.needsRegistry
        ? '把带版本的 artifact 存进 model registry，按名字路由，版本迁移就不必重新部署。'
        : '单个 model 没有完整 registry 也能发，不过做版本管理仍是好习惯。',
    },
    rollout: {
      state: d.needsCanary ? 'needed' : d.needsRegistry ? 'useful' : 'not-yet',
      copy: d.needsCanary
        ? '把一撮 canary/A-B 流量切给新版本，推全前先用 shadow traffic 镜像，并能即时回滚。'
        : d.needsRegistry
          ? '有两个版本时，你已经能在 gateway 切流背后给新发布做 canary。'
          : '只有一个版本，上线就是一次部署；暂时不需要 traffic splitting。',
    },
    packing: {
      state: d.needsPacking ? 'needed' : d.modelsHosted > 1 ? 'useful' : 'not-yet',
      copy: d.needsPacking
        ? '把多个 model packing 进每个 replica/GPU，按 model 路由，让闲着的 model 共享硬件。'
        : d.modelsHosted > 1
          ? '几个 model 可以各自分到 replica；只有当 model 数超过机群规模，packing 才划算。'
          : '单个 model 独占机群，所以 packing 无关紧要。',
    },
    latencyTradeoff: {
      state: d.tightTail ? 'tradeoff' : d.estimatedP99Ms > d.p99TargetMs ? 'needed' : 'useful',
      copy: d.tightTail
        ? `紧的 ${Math.round(d.p99TargetMs)} ms p99 卡住了 batch window、又要 utilization 余量，是拿一些 throughput 换 tail。`
        : d.estimatedP99Ms > d.p99TargetMs
          ? '当前 p99 没达标；收窄 batch window 或加容量来把 tail 拉回来。'
          : '估算 p99 和目标之间还有余量，所以 throughput 这些杠杆还有空间往上推。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsBatching && !flags.needsGpu && !flags.needsRegistry && !flags.needsAutoscale) {
    return '单个 model endpoint';
  }
  if (flags.needsPacking) {
    return '多 model packed 机群 + canary rollout';
  }
  if (flags.needsRegistry && flags.needsGpu) {
    return 'GPU autoscaling 机群 + registry + canary';
  }
  if (flags.needsGpu) {
    return 'GPU + dynamic batching + autoscaling';
  }
  if (flags.needsBatching) {
    return 'CPU replica 上的 dynamic batching';
  }
  return '单个 model endpoint';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsBatching && !flags.needsGpu && !flags.needsRegistry && !flags.needsAutoscale) {
    return '一个 model server replica 直接解决每一次预测。在这个负载下，batching、GPU、registry 和 autoscaling 都还为时过早。';
  }
  if (flags.needsPacking) {
    return '很多 model 共享一支 packed GPU 机群、按名字路由，用 canary/A-B 切流和 shadow traffic 做安全上线，而紧的 p99 限制了请求能多激进地 batch。';
  }
  if (flags.needsRegistry && flags.needsGpu) {
    return '一个 registry 存放带版本的 artifact，由 gateway 路由并 canary 到一支 autoscaling GPU 机群上，dynamic batching 让 accelerator 一直忙着。';
  }
  if (flags.needsGpu) {
    return '一个又重又能 batch 的 model 跑在一支 autoscaling GPU 机群上，dynamic batching 填满 accelerator，gateway 在 replica 间做负载均衡。';
  }
  if (flags.needsBatching) {
    return 'dynamic batching 把并发请求合并到几个 CPU replica 上来抬高 throughput，暂时还不必为 GPU 掏钱。';
  }
  return '一个 model server 仍然撑得住这个工作负载。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsBatching && !flags.needsGpu && !flags.needsRegistry && !flags.needsAutoscale) {
    return 'Predict -> gateway -> 单个 replica';
  }
  if (flags.needsPacking) {
    return 'Predict -> gateway（路由 + canary）-> packed GPU 机群 -> registry';
  }
  if (flags.needsRegistry && flags.needsGpu) {
    return 'Predict -> gateway -> batcher -> GPU replica -> registry';
  }
  if (flags.needsGpu) {
    return 'Predict -> gateway -> batcher -> GPU replica';
  }
  if (flags.needsBatching) {
    return 'Predict -> gateway -> batcher -> CPU replica';
  }
  return 'Predict -> gateway -> 单个 replica';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
