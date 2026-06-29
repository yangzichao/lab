import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatRate, formatRatio } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative teaching budgets for a single modern data-center GPU (e.g. ~80 GB HBM class).
const gpuMemoryBytes = 80 * 1_000_000_000;
const bytesPerParam = 2; // 16-bit weights.
// Leave headroom for weights on a shard before counting a GPU as full: weights target <=70%.
const weightFitFraction = 0.7;
// KV cache size grows with sequence length but only sub-linearly with model scale, because
// modern frontier models use Grouped-Query Attention (GQA/MQA) to share K/V heads and shrink
// the cache ~8x. The coefficient (bytes/token) and a sub-linear params exponent fold that in.
const kvBytesPerTokenCoefficient = 8_000;
const kvModelParamExponent = 0.4;
// Aggregate generated tokens/sec a single GPU sustains across a densely packed batch.
const singleGpuTokensPerSecond = 200_000;
// A single in-flight sequence streams to its user at roughly this rate; this sets how long a
// request stays resident (and therefore how many sequences are concurrently in the KV cache).
const perStreamDecodeTokensPerSecond = 60;
// Without continuous batching, GPU utilisation on ragged batches is badly under-used.
const staticBatchingEfficiency = 0.35;
const continuousBatchingEfficiency = 0.85;
// Effective concurrent batch slots a single replica group sustains under perfect (continuous)
// batching; static batching wastes slots, so the usable count scales by the batching efficiency.
const batchSlotsPerReplicaGroup = 400;
// Naive (non-paged) KV allocation wastes memory to internal fragmentation.
const pagedKvUtilisation = 0.95;
const naiveKvUtilisation = 0.45;
// Prefill (first-token) compute cost per prompt token per billion params, in milliseconds.
const prefillMsPerTokenPerBillionParams = 0.02;
// A dedicated, compute-optimised prefill pool resolves first tokens this many times faster than
// sharing the decode GPUs, which is the whole point of prefill/decode disaggregation.
const prefillPoolSpeedup = 4;

export const llmInferenceLabDefinition: SystemDesignLabDefinition = {
  id: 'llm-inference',
  eyebrow: '系统设计 Lab',
  title: 'LLM inference 是 autoregressive 的：KV cache 每个 token 都在长，主导着 GPU memory，所以 batching 和 memory 布局决定了 throughput。',
  summary:
    '调整 request rate、prompt 和 output 长度、模型大小、GPU 数，以及 time-to-first-token 目标。切换带 paged attention 的 continuous batching 和 tensor parallelism。设计会从一块 GPU 一次只服务一个 request，演进到带 batching 的 KV cache，再到 continuous batching 加 paged attention，再到为大模型做 tensor-parallel sharding，最后在规模化下做 prefill/decode disaggregation。',
  controls: [
    {
      id: 'requestsPerSecond',
      label: 'Request rate',
      help: '每秒到达的新生成 request 数。每个都 autoregressive 地跑，直到它的 output 完成。',
      min: 0.1,
      max: 5_000,
      defaultValue: 5,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'promptTokens',
      label: '平均 prompt token 数',
      help: 'prefill 阶段处理的输入长度；决定了每个 KV cache 的起始大小。',
      min: 16,
      max: 128_000,
      defaultValue: 1_024,
      scale: 'log',
      unit: 'tokens',
      format: 'count',
    },
    {
      id: 'outputTokens',
      label: '平均 output token 数',
      help: 'decode 阶段一次生成一个的 token；KV cache 为每个 token 增长。',
      min: 8,
      max: 16_000,
      defaultValue: 256,
      scale: 'log',
      unit: 'tokens',
      format: 'count',
    },
    {
      id: 'modelParams',
      label: '模型大小',
      help: 'parameter 数。16-bit 的 weights 每个约 2 bytes，必须先装进 GPU memory，才轮到任何 KV cache。',
      min: 1_000_000_000,
      max: 700_000_000_000,
      defaultValue: 13_000_000_000,
      scale: 'log',
      unit: 'params',
      format: 'count',
    },
    {
      id: 'gpuCount',
      label: 'GPU 数',
      help: '可用来服务模型的 GPU 数。更多 GPU 通过 replica 或 tensor-parallel shard 增加 memory 和算力。',
      min: 1,
      max: 256,
      defaultValue: 1,
      scale: 'log',
      unit: 'GPUs',
      format: 'count',
    },
    {
      id: 'ttftTargetMs',
      label: 'p99 time-to-first-token',
      help: '从 request 到达到第一个 stream 出来的 token 的延迟预算；prefill 阶段必须卡在它以内。',
      min: 50,
      max: 10_000,
      defaultValue: 1_000,
      scale: 'log',
      format: 'milliseconds',
    },
  ],
  toggles: [
    {
      id: 'continuousBatching',
      label: 'Continuous batching + paged attention',
      help: 'in-flight batching 每步都 admit 和 retire request；paged attention 把 KV cache 存在固定大小的 page 里，避免碎片化。',
      defaultValue: true,
    },
    {
      id: 'tensorParallel',
      label: 'Tensor-parallel sharding',
      help: '把每层 split 到多块 GPU 上，让一个比单块 GPU 大的模型也能跑，代价是每步的 collective communication。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-gpu',
      step: '01',
      title: '一块 GPU，一个 request',
      summary: '一个小模型顺序地服务偶尔来的 request。',
      values: {
        requestsPerSecond: 0.5,
        promptTokens: 256,
        outputTokens: 128,
        modelParams: 7_000_000_000,
        gpuCount: 1,
        ttftTargetMs: 3_000,
        continuousBatching: false,
        tensorParallel: false,
      },
    },
    {
      id: 'kv-static-batch',
      step: '02',
      title: 'KV cache + static batching',
      summary: '稳定流量按固定组 batch；参差不齐的完成时间浪费 GPU。',
      values: {
        requestsPerSecond: 6,
        promptTokens: 1_024,
        outputTokens: 256,
        modelParams: 13_000_000_000,
        gpuCount: 1,
        ttftTargetMs: 2_000,
        continuousBatching: false,
        tensorParallel: false,
      },
    },
    {
      id: 'continuous-paged',
      step: '03',
      title: 'Continuous batching + paged attention',
      summary: '高并发被逐步打包，配上无碎片的 KV memory。',
      values: {
        requestsPerSecond: 90,
        promptTokens: 2_048,
        outputTokens: 512,
        modelParams: 13_000_000_000,
        gpuCount: 4,
        ttftTargetMs: 800,
        continuousBatching: true,
        tensorParallel: false,
      },
    },
    {
      id: 'tensor-parallel-big',
      step: '04',
      title: '大模型，tensor parallel',
      summary: '一个对单块 GPU 太大的模型，按层 shard 到多块 GPU 上。',
      values: {
        requestsPerSecond: 150,
        promptTokens: 4_096,
        outputTokens: 1_024,
        modelParams: 175_000_000_000,
        gpuCount: 32,
        ttftTargetMs: 600,
        continuousBatching: true,
        tensorParallel: true,
      },
    },
    {
      id: 'disaggregated-scale',
      step: '05',
      title: 'Prefill/decode disaggregation',
      summary: '长 prompt 加严苛的 first-token 目标，在 fleet 规模下把 prefill 和 decode 拆开。',
      values: {
        requestsPerSecond: 220,
        promptTokens: 8_000,
        outputTokens: 2_048,
        modelParams: 405_000_000_000,
        gpuCount: 128,
        ttftTargetMs: 300,
        continuousBatching: true,
        tensorParallel: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'LLM inference serving 架构图',
    description:
      'LLM inference 的白板风格架构图：client stream token、一个 inference gateway、一个 continuous-batching scheduler、持有 paged KV cache 的 GPU worker、tensor-parallel 的 model shard，以及一条异步 metrics stream。',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'streams tokens',
            summary: '发送一个 prompt，并在生成的 token stream 回来时读取它们',
            kind: 'client',
          },
        ],
      },
      {
        id: 'gateway',
        label: 'Gateway',
        variant: 'edge',
        nodes: [
          {
            id: 'gateway',
            title: 'Inference gateway',
            subtitle: 'admits + streams',
            summary: '做鉴权、把 request 排队，并通过连接把 token stream 回去',
            kind: 'api',
          },
        ],
      },
      {
        id: 'scheduler',
        label: 'Scheduler',
        variant: 'backbone',
        nodes: [
          {
            id: 'scheduler',
            title: 'Scheduler',
            subtitle: 'continuous batching',
            summary: '每个 decode step 都 admit 和 retire request，让 GPU 一直忙着',
            kind: 'scheduler',
          },
          {
            id: 'prefillPool',
            title: 'Prefill pool',
            subtitle: 'first token',
            summary: '跑计算量大的 prefill，让长 prompt 不会卡住 decode',
            kind: 'gpu',
          },
        ],
      },
      {
        id: 'workers',
        label: 'GPU workers',
        variant: 'processing',
        nodes: [
          {
            id: 'gpuWorker',
            title: 'GPU worker',
            subtitle: 'decode loop',
            summary: '为当前 batch autoregressive 地生成 token',
            kind: 'gpu',
          },
          {
            id: 'kvCache',
            title: 'Paged KV cache',
            subtitle: 'per-token state',
            summary: '把 attention 的 key 和 value 存在固定 page 里，避免碎片化',
            kind: 'cache',
          },
        ],
      },
      {
        id: 'shards',
        label: 'Model + async',
        variant: 'storage',
        nodes: [
          {
            id: 'modelShards',
            title: 'Model shards',
            subtitle: 'tensor parallel',
            summary: '把每层 split 到多块 GPU 上，让大模型装得下也跑得动',
            kind: 'gpu',
          },
          {
            id: 'metrics',
            title: 'Metrics stream',
            subtitle: 'async telemetry',
            summary: '在热路径之外收集 throughput 和 latency，供 autoscaling 用',
            kind: 'stream',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'gateway', variant: 'primary' },
      { from: 'gateway', to: 'scheduler', variant: 'primary' },
      { from: 'scheduler', to: 'prefillPool', variant: 'secondary' },
      { from: 'scheduler', to: 'gpuWorker', variant: 'primary' },
      { from: 'prefillPool', to: 'gpuWorker', variant: 'secondary' },
      { from: 'gpuWorker', to: 'kvCache', variant: 'primary' },
      { from: 'gpuWorker', to: 'modelShards', variant: 'secondary' },
      { from: 'gateway', to: 'metrics', variant: 'direct' },
    ],
  }),
  meters: [
    { id: 'kvMemory', label: 'KV cache 压力' },
    { id: 'weightMemory', label: '每 GPU weight 占用（shard 后会下降）' },
    { id: 'throughput', label: 'Decode throughput vs 容量' },
    { id: 'batchEfficiency', label: 'Batch slot 饱和度' },
    { id: 'ttft', label: 'Time-to-first-token' },
  ],
  decisions: [
    { id: 'kvManagement', title: 'KV cache 管理' },
    { id: 'batching', title: 'Continuous batching' },
    { id: 'sharding', title: 'Tensor-parallel sharding' },
    { id: 'prefillSplit', title: 'Prefill/decode split' },
    { id: 'autoscaling', title: 'GPU autoscaling' },
    { id: 'streaming', title: 'Token streaming' },
  ],
  sourceBackedRules: [
    {
      title: 'PagedAttention 把 KV cache 存在固定 page 里，消除碎片化',
      source: 'vLLM (PagedAttention)',
      url: 'https://arxiv.org/abs/2309.06180',
      summary:
        '借用 OS 虚拟内存的 paging，vLLM 把 KV cache 存在不连续的固定大小块里，削掉碎片化造成的浪费，把 serving throughput 提高 2-4 倍。',
    },
    {
      title: 'vLLM 把 continuous batching 和 paged attention 结合起来做高 throughput serving',
      source: 'vLLM Docs',
      url: 'https://docs.vllm.ai/en/latest/',
      summary:
        '文档把 continuous（in-flight）batching 和 PagedAttention 描述为核心机制，让 GPU 在不同长度的 request 之间一直忙着。',
    },
    {
      title: 'TensorRT-LLM 用 tensor 和 pipeline parallelism 把大模型 shard 到多块 GPU 上',
      source: 'NVIDIA TensorRT-LLM',
      url: 'https://github.com/NVIDIA/TensorRT-LLM',
      summary:
        '对于太大、一块 GPU 装不下的模型，TensorRT-LLM 把每层切分到多设备上，支持 multi-GPU、multi-node parallelism 以及 disaggregated serving。',
    },
    {
      title: 'Triton Inference Server 在生产中调度并 batch inference request',
      source: 'NVIDIA Triton',
      url: 'https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/index.html',
      summary:
        'Triton 记录了 dynamic 和 in-flight batching、调度，以及 multi-backend serving，用于在单个 endpoint 背后大规模运行 LLM inference。',
    },
  ],
  teachingAssumptions: [
    '每 GPU memory、token throughput、batching 效率都是针对一块现代数据中心 GPU 的保守教学数字，不是 vendor benchmark。',
    'KV cache 大小被近似成与 sequence length 成正比、对模型规模 sub-linear；现代 frontier 模型用 Grouped-Query Attention（GQA/MQA）共享 key/value head，把 KV cache 缩小约 8 倍，这里已经折进系数里了。',
    'prefill 被建模成 compute-bound 的 first-token 阶段，decode 被建模成 memory-bound 的 token loop；它们的相对成本随硬件和 kernel 而变。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-request',
      step: '01',
      focus: '一块 GPU，一个 request',
      scenarioId: 'single-gpu',
      question:
        '一个 7B 模型大约每两秒服务一个 request。现在你需要 batching、paging 或多块 GPU 吗？',
      reveal:
        '不需要。weights 装得进一块 GPU，单个短生成几乎碰不到 memory 或算力。每个 request 跑完才开始下一个；batching 那套机制和 sharding 只会徒增复杂度，却没有负载来支撑它们。',
      takeaway: '当负载和模型大小都小的时候，就用一块 GPU 顺序地跑 request。',
    },
    {
      id: 'static-batch',
      step: '02',
      focus: 'KV cache + static batching',
      scenarioId: 'kv-static-batch',
      question:
        '流量涨到每秒好几个 request。如果你把固定一组 batch 起来一起跑，为什么 GPU 还是会有一部分闲着？',
      reveal:
        '各个生成在不同时刻完成，但 static batch 要等最慢的那个成员。短 request 卡在长 request 后面，所以有效利用率很低。而且现在 KV cache 还要为每个活跃 sequence 持有不断增长的 per-token state，吃 memory 很快。',
      takeaway: 'static batching 浪费 GPU，因为参差不齐的完成时间让已完成的 slot 一直闲到整个 batch 排空。',
    },
    {
      id: 'continuous',
      focus: 'Continuous + paged',
      step: '03',
      scenarioId: 'continuous-paged',
      question:
        '在高并发下，是什么让你能把很多 request 塞进一块 GPU，又不会耗尽 KV memory 或卡住？',
      reveal:
        'Continuous（in-flight）batching 每个 decode step 都 admit 和 retire request，所以一个完成的 sequence 会立刻释放它的 slot。Paged attention 把 KV cache 存在固定 page 里，所以 memory 不会碎片化，你能塞下多得多的并发 sequence。两者合起来在同样的硬件上把 throughput 翻好几倍。',
      takeaway: 'continuous batching 加 paged attention 是主力：step 级的调度配上无碎片的 KV memory。',
    },
    {
      id: 'tensor-parallel',
      step: '04',
      focus: '大模型，tensor parallel',
      scenarioId: 'tensor-parallel-big',
      question:
        '一个 175B 模型光 16-bit weights 就要约 350 GB。一块 80 GB 的 GPU 装不下它——要变什么？',
      reveal:
        '模型必须切开。Tensor parallelism 把每层 shard 到几块 GPU 上，让 weights 和 KV cache 合起来装得下，代价是每层都有一次 collective communication。Grouped-Query Attention（GQA）在这里也帮得上忙：靠共享 key/value head 把 KV cache 缩小约 8 倍，所以每个 shard 能容纳多得多的并发 sequence。你用额外的 GPU 和 GPU 间带宽，换来「模型能跑起来」本身。',
      takeaway: '当 weights 超出一块 GPU 时，tensor-parallel sharding 让模型能跑，但加上了每步的 communication。',
    },
    {
      id: 'disaggregated',
      step: '05',
      focus: 'Prefill/decode split',
      scenarioId: 'disaggregated-scale',
      question:
        '在 fleet 规模下，有 16k token 的 prompt 和 300 ms 的 first-token 目标，为什么不把 prefill 和 decode 跑在同一批 GPU 上？',
      reveal:
        'prefill 是 compute-bound 且突发的；decode 是 memory-bound 且平稳的。混在一个 pool 里，一个长 prefill 会卡住正在进行的 decode，把 time-to-first-token 预算冲爆。把 prefill 和 decode disaggregate 到各自独立的 GPU pool，让两者能独立扩容和调优，同时保住 first-token 延迟和 decode throughput。',
      takeaway: '到了规模化，把 prefill 和 decode 分开，让计算量大的 first token 永远不会卡住平稳的 decode loop。',
    },
  ],
  analyze: analyzeLlmInferenceWorkload,
};

function analyzeLlmInferenceWorkload(workload: WorkloadValues): LabAnalysis {
  const requestsPerSecond = numericValue(workload, 'requestsPerSecond');
  const promptTokens = numericValue(workload, 'promptTokens');
  const outputTokens = numericValue(workload, 'outputTokens');
  const modelParams = numericValue(workload, 'modelParams');
  const gpuCount = numericValue(workload, 'gpuCount');
  const ttftTargetMs = numericValue(workload, 'ttftTargetMs');
  const continuousBatching = Boolean(workload.continuousBatching);
  const tensorParallel = Boolean(workload.tensorParallel);

  const modelBillions = modelParams / 1_000_000_000;
  const tokensPerRequest = promptTokens + outputTokens;

  // --- Replicas vs tensor-parallel group ---------------------------------------------------
  // A tensor-parallel deployment splits one model copy across `shardCount` GPUs (enough to hold
  // the weights), then runs as many such groups (`replicaGroups`) as the GPU budget allows.
  // Without TP, every GPU is an independent replica. We apply this SAME notion of replicas to
  // both throughput and KV budget so the two meters stay consistent.
  const weightBytesTotal = modelParams * bytesPerParam;
  const modelFitsOneGpu = weightBytesTotal <= gpuMemoryBytes;
  const needsSharding = !modelFitsOneGpu;
  const shardCount = tensorParallel
    ? Math.max(1, Math.ceil(weightBytesTotal / (gpuMemoryBytes * weightFitFraction)))
    : 1;
  const replicaGroups = tensorParallel
    ? Math.max(1, Math.floor(gpuCount / shardCount))
    : Math.max(1, gpuCount);
  const gpusInUse = replicaGroups * shardCount;

  // Per-GPU weight footprint: falls as TP shards the weights across more GPUs.
  const weightBytesPerGpu = weightBytesTotal / shardCount;
  const weightRatio = weightBytesPerGpu / gpuMemoryBytes;

  // --- Decode throughput vs capacity -------------------------------------------------------
  const decodeEfficiency = continuousBatching ? continuousBatchingEfficiency : staticBatchingEfficiency;
  const perGpuTokensPerSecond = singleGpuTokensPerSecond * decodeEfficiency;
  // A TP group's aggregate throughput is one GPU's worth; capacity scales with replica groups.
  const fleetTokensPerSecond = perGpuTokensPerSecond * replicaGroups;
  const demandedTokensPerSecond = requestsPerSecond * tokensPerRequest;
  const throughputRatio = demandedTokensPerSecond / Math.max(fleetTokensPerSecond, 1);

  // --- Concurrency and KV cache pressure ---------------------------------------------------
  // Residency time is driven by the per-user stream rate, not aggregate batch throughput.
  const generationSeconds = outputTokens / perStreamDecodeTokensPerSecond;
  const concurrentSequences = Math.max(1, requestsPerSecond * generationSeconds);
  const kvUtilisation = continuousBatching ? pagedKvUtilisation : naiveKvUtilisation;
  // GQA makes per-sequence KV sub-linear in model scale (see teaching assumption).
  const kvBytesPerSequence =
    tokensPerRequest * kvBytesPerTokenCoefficient * Math.pow(modelBillions, kvModelParamExponent);
  const kvBytesNeeded = (concurrentSequences * kvBytesPerSequence) / kvUtilisation;
  // KV budget is the free memory (after weights) summed across every GPU actually in use.
  const kvMemoryBudgetPerGpu = Math.max(gpuMemoryBytes - weightBytesPerGpu, gpuMemoryBytes * 0.05);
  const kvMemoryBudgetFleet = kvMemoryBudgetPerGpu * gpusInUse;
  const kvRatio = kvBytesNeeded / Math.max(kvMemoryBudgetFleet, 1);

  // --- Batch saturation (load meter, grows with scale) -------------------------------------
  // How full the batch slots are: concurrent sequences vs the effective slots across replica
  // groups. Static batching wastes slots (lower efficiency -> fewer usable slots -> more
  // saturation), so this grows with both load and a worse batching strategy, never inverting.
  const effectiveBatchSlots = batchSlotsPerReplicaGroup * decodeEfficiency * replicaGroups;
  const batchSaturationRatio = concurrentSequences / Math.max(effectiveBatchSlots, 1);

  // --- Time-to-first-token -----------------------------------------------------------------
  // Prefill cost scales with prompt length and model size, reduced by tensor-parallel compute.
  const prefillSpeedup = tensorParallel ? Math.min(shardCount, 8) : 1;
  const prefillComputeMs = (promptTokens * modelBillions * prefillMsPerTokenPerBillionParams) / prefillSpeedup;
  const baseQueueMs = continuousBatching ? 30 : 90;
  // Decide whether prefill must be disaggregated using the cost BEFORE a dedicated pool helps.
  const ttftWithoutSplitMs = prefillComputeMs + baseQueueMs;
  const needsPrefillSplit = promptTokens > 4_000 && ttftWithoutSplitMs / Math.max(ttftTargetMs, 1) > 0.7;
  // A dedicated prefill pool speeds up first tokens once disaggregated.
  const estimatedTtftMs = prefillComputeMs / (needsPrefillSplit ? prefillPoolSpeedup : 1) + baseQueueMs;
  const ttftRatio = estimatedTtftMs / Math.max(ttftTargetMs, 1);

  const needsBatching = !continuousBatching && (requestsPerSecond > 2 || concurrentSequences > 4);
  const needsAutoscaling = requestsPerSecond > 50 || gpuCount > 4 || throughputRatio > 0.7;
  const streamingHelps = outputTokens > 64;

  const flags = {
    continuousBatching,
    tensorParallel,
    needsSharding,
    needsBatching,
    needsPrefillSplit,
    needsAutoscaling,
    streamingHelps,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags, gpuCount),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      gateway: 'ok',
      scheduler: continuousBatching ? 'needed' : needsBatching ? 'warning' : 'ok',
      prefillPool: needsPrefillSplit ? 'needed' : 'inactive',
      gpuWorker: throughputRatio > 1 ? 'overloaded' : throughputRatio > 0.7 ? 'warning' : 'ok',
      kvCache:
        kvRatio > 1
          ? 'overloaded'
          : kvRatio > 0.7
            ? 'warning'
            : continuousBatching || concurrentSequences <= 4
              ? 'ok'
              : 'needed',
      modelShards: needsSharding || tensorParallel ? 'needed' : 'inactive',
      metrics: needsAutoscaling ? 'needed' : 'inactive',
    },
    flowStates: {
      clientToGateway: 'active',
      gatewayToScheduler: 'active',
      schedulerToPrefillPool: needsPrefillSplit ? 'active' : 'inactive',
      schedulerToGpuWorker: throughputRatio > 1 ? 'warning' : 'active',
      prefillPoolToGpuWorker: needsPrefillSplit ? 'active' : 'inactive',
      gpuWorkerToKvCache: kvRatio > 1 ? 'warning' : 'active',
      gpuWorkerToModelShards: needsSharding || tensorParallel ? 'active' : 'inactive',
      gatewayToMetrics: needsAutoscaling ? 'active' : 'inactive',
    },
    meters: {
      kvMemory: {
        ratio: kvRatio,
        valueText: formatRatio(Math.min(kvRatio, 9.99)),
        copy: continuousBatching
          ? `约 ${formatCount(concurrentSequences)} 个并发 sequence 在 paged KV memory 里；miss 会回退到重算或 eviction。`
          : `Naive KV 分配在持有 ${formatCount(concurrentSequences)} 个 sequence 时，因碎片化浪费约 ${Math.round((1 - naiveKvUtilisation) * 100)}%。`,
      },
      weightMemory: {
        ratio: weightRatio,
        valueText: formatRatio(Math.min(weightRatio, 9.99)),
        copy: needsSharding
          ? tensorParallel
            ? `${formatCount(modelParams)} 个 param 做 ${formatCount(shardCount)}-way 切分，把每 GPU 的 weight 占用降到一块 GPU 的 ${formatRatio(weightRatio)}，给 KV cache 腾出空间。`
            : `${formatCount(modelParams)} 个 16-bit param 超出了一块 GPU；需要 tensor parallelism 才能装下 weights。`
          : `${formatCount(modelParams)} 个 16-bit param 在还没算 KV cache 之前就占了单块 GPU 的 ${formatRatio(weightRatio)}。`,
      },
      throughput: {
        ratio: throughputRatio,
        valueText: `${formatRate(demandedTokensPerSecond)} tok/s`,
        copy: `${formatRate(requestsPerSecond)} req/s x ${formatCount(tokensPerRequest)} token 的需求，对上约 ${formatRate(fleetTokensPerSecond)} tok/s 的容量。`,
      },
      batchEfficiency: {
        ratio: batchSaturationRatio,
        valueText: `${formatRatio(batchSaturationRatio)} full`,
        copy: continuousBatching
          ? `Continuous batching 把约 ${formatCount(concurrentSequences)} 个 sequence 塞进 batch slot，让 GPU 接近满负荷。`
          : `Static batching 因参差不齐的完成时间浪费约 ${Math.round((1 - decodeEfficiency) * 100)}% 的 slot，所以同样的 ${formatCount(concurrentSequences)} 个 sequence 会更快把它打满。`,
      },
      ttft: {
        ratio: ttftRatio,
        valueText: `~${Math.round(estimatedTtftMs)} ms`,
        copy: needsPrefillSplit
          ? '长 prompt 让 prefill 很贵；把 prefill 和 decode 拆开能保住 first-token 预算。'
          : 'prefill 在共享 pool 上就能卡进 first-token 目标。',
      },
    },
    decisions: buildDecisions({
      ...flags,
      requestsPerSecond,
      modelParams,
      shardCount,
      concurrentSequences,
      outputTokens,
    }),
    reasons: buildReasons({
      ...flags,
      requestsPerSecond,
      promptTokens,
      outputTokens,
      modelParams,
      gpuCount,
      kvRatio,
      throughputRatio,
      ttftRatio,
      concurrentSequences,
      estimatedTtftMs,
      ttftTargetMs,
      demandedTokensPerSecond,
      fleetTokensPerSecond,
    }),
  };
}

type ArchitectureFlags = {
  continuousBatching: boolean;
  tensorParallel: boolean;
  needsSharding: boolean;
  needsBatching: boolean;
  needsPrefillSplit: boolean;
  needsAutoscaling: boolean;
  streamingHelps: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    requestsPerSecond: number;
    promptTokens: number;
    outputTokens: number;
    modelParams: number;
    gpuCount: number;
    kvRatio: number;
    throughputRatio: number;
    ttftRatio: number;
    concurrentSequences: number;
    estimatedTtftMs: number;
    ttftTargetMs: number;
    demandedTokensPerSecond: number;
    fleetTokensPerSecond: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  // 1. KV cache pressure (always emitted).
  if (analysis.kvRatio > 1) {
    reasons.push({
      severity: 'danger',
      text: `约 ${formatCount(analysis.concurrentSequences)} 个并发 sequence 的 KV cache 占了 GPU memory 的 ${formatRatio(analysis.kvRatio)}；少 admit 一些、给 cache 上 paging，或者加 GPU。`,
    });
  } else if (analysis.kvRatio > 0.7) {
    reasons.push({
      severity: 'warning',
      text: `KV cache 正在填满 GPU memory，约 ${formatCount(analysis.concurrentSequences)} 个 sequence 时占到 ${formatRatio(analysis.kvRatio)}；paged attention 和 admission control 让它不至于溢出。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `约 ${formatCount(analysis.concurrentSequences)} 个并发 sequence 的 KV cache 装得很宽裕（占 memory 的 ${formatRatio(analysis.kvRatio)}），GQA 也帮了忙。`,
    });
  }

  // 2. Batching strategy (always emitted: either continuous, needs-to-be, or fine as-is).
  if (analysis.continuousBatching) {
    reasons.push({
      severity: 'ok',
      text: 'Continuous batching 每步都 admit 和 retire request，让 GPU 利用率在长短不一的 request 之间保持高位。',
    });
  } else if (analysis.needsBatching) {
    reasons.push({
      severity: 'warning',
      text: `${formatRate(analysis.requestsPerSecond)} req/s 加上参差不齐的生成长度，在 static batching 下浪费 GPU；打开 continuous batching。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '负载足够低，可以一次跑一个 request；batching 那套机制还不值得上。',
    });
  }

  // 3. Model fit / sharding (always emitted).
  if (analysis.needsSharding && !analysis.tensorParallel) {
    reasons.push({
      severity: 'danger',
      text: `${formatCount(analysis.modelParams)} 个 16-bit param 装不进一块 GPU；打开 tensor-parallel sharding，模型才跑得起来。`,
    });
  } else if (analysis.tensorParallel) {
    reasons.push({
      severity: 'ok',
      text: '每层都做 tensor-parallel sharding，让 weights 和 KV 合起来装得下，代价是每步一次 collective communication。',
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(analysis.modelParams)} 个 param 能装进单块 GPU，所以还不需要 sharding。`,
    });
  }

  // 4. Decode throughput vs capacity (always emitted).
  if (analysis.throughputRatio > 1) {
    reasons.push({
      severity: 'danger',
      text: `token 需求（约 ${formatRate(analysis.demandedTokensPerSecond)} tok/s）超出 fleet 的 decode 容量，达到 ${formatRatio(analysis.throughputRatio)}；加 GPU replica 或 autoscale。`,
    });
  } else if (analysis.throughputRatio > 0.7) {
    reasons.push({
      severity: 'warning',
      text: `decode 需求是 fleet 容量的 ${formatRatio(analysis.throughputRatio)}；余量很薄，所以要规划 autoscale replica。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `decode 容量覆盖需求，占 fleet 的 ${formatRatio(analysis.throughputRatio)}；throughput 还有余量。`,
    });
  }

  // 5. Time-to-first-token: prefill split when needed, otherwise a positive note.
  if (analysis.needsPrefillSplit) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.promptTokens)} token 的 prompt 把 first-token 延迟推到约 ${Math.round(analysis.estimatedTtftMs)} ms；把 prefill 和 decode disaggregate 开来保住预算。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `prefill 在共享 pool 上约 ${Math.round(analysis.estimatedTtftMs)} ms 就解出第一个 token，卡在延迟预算以内。`,
    });
  }

  // 6. Autoscaling (only when warranted).
  if (analysis.needsAutoscaling) {
    reasons.push({
      severity: 'ok',
      text: 'throughput 和 latency 的 telemetry 喂给 autoscaling，让 GPU replica 跟上实时的 request rate。',
    });
  }

  // 7. Streaming (only when long outputs make it worthwhile; fills toward the upper bound).
  if (analysis.streamingHelps) {
    reasons.push({
      severity: 'ok',
      text: `把约 ${formatCount(analysis.outputTokens)} 个 output token 边生成边 stream，让用户在完成前就看到进展。`,
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    requestsPerSecond: number;
    modelParams: number;
    shardCount: number;
    concurrentSequences: number;
    outputTokens: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    kvManagement: {
      state: flags.continuousBatching ? 'needed' : 'useful',
      copy: flags.continuousBatching
        ? 'Paged attention 把 KV cache 存在固定 page 里，所以并发由 memory 决定，而不是碎片化。'
        : '不做 paging 的话，KV cache 是连续分配的，随着 sequence 长度不一会因碎片化损失 memory。',
    },
    batching: {
      state: flags.continuousBatching ? 'needed' : flags.needsBatching ? 'needed' : 'not-yet',
      copy: flags.continuousBatching
        ? 'Continuous（in-flight）batching 每个 decode step 都调度 admit 和 retire，达到高利用率。'
        : flags.needsBatching
          ? 'Static batching 正让 GPU 闲着；改用 continuous batching 来打包长短不一的 request。'
          : '负载足够低，可以一次跑一个 request，不用 batching。',
    },
    sharding: {
      state: flags.tensorParallel ? 'needed' : flags.needsSharding ? 'needed' : 'not-yet',
      copy: flags.tensorParallel
        ? `每层都 split 到 ${formatCount(flags.shardCount)} 块 GPU 上，让一个比单块 GPU 大的模型装得下也跑得动。`
        : flags.needsSharding
          ? '模型超出了一块 GPU；打开 tensor parallelism 把 weights 切分到多设备上。'
          : '模型能装进单块 GPU，所以还不需要 sharding。',
    },
    prefillSplit: {
      state: flags.needsPrefillSplit ? 'needed' : 'not-yet',
      copy: flags.needsPrefillSplit
        ? '把 prefill 和 decode disaggregate 到各自独立的 pool，让长的、compute-bound 的 prefill 不会卡住 decode loop。'
        : 'prefill 和 decode 共用同一批 GPU；prompt 足够短，first-token 延迟还在预算以内。',
    },
    autoscaling: {
      state: flags.needsAutoscaling ? 'needed' : 'not-yet',
      copy: flags.needsAutoscaling
        ? `根据实时 telemetry autoscale GPU replica，跟上 ${formatRate(flags.requestsPerSecond)} req/s 的需求。`
        : '一个固定 pool 就能覆盖负载；autoscaling 还不值得上。',
    },
    streaming: {
      state: flags.streamingHelps ? 'useful' : 'not-yet',
      copy: flags.streamingHelps
        ? `把约 ${formatCount(flags.outputTokens)} 个 output token 边生成边 stream，让用户在完成前就看到进展。`
        : 'output 足够短，stream 相比直接返回完整响应没多大意义。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags, gpuCount: number): string {
  if (flags.needsPrefillSplit && (flags.tensorParallel || flags.needsSharding)) {
    return 'Disaggregated prefill/decode + tensor-parallel fleet';
  }
  if (flags.tensorParallel || flags.needsSharding) {
    return '带 continuous batching 的 tensor-parallel serving';
  }
  if (flags.continuousBatching) {
    const gpus = Math.max(1, Math.round(gpuCount));
    return gpus > 1
      ? `Continuous batching + paged attention，跨 ${formatCount(gpus)} 个 GPU replica`
      : '一块 GPU 上的 continuous batching + paged attention';
  }
  if (flags.needsBatching) {
    return '带 KV cache 的 static batching';
  }
  return '单块 GPU，一次一个 request';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (flags.needsPrefillSplit && (flags.tensorParallel || flags.needsSharding)) {
    return 'prefill 和 decode 跑在各自独立的 GPU pool 上，模型做 tensor-parallel sharding，带 paged attention 的 continuous batching 让每个 pool 都保持饱和。';
  }
  if (flags.tensorParallel || flags.needsSharding) {
    return '模型被 split 到多块 GPU 上才装得下，带 paged attention 的 continuous batching 把很多并发 sequence 塞到各 shard 上。';
  }
  if (flags.continuousBatching) {
    return '一块 GPU 跑带 paged attention 的 continuous batching，每步 retire 和 admit request，让 KV cache 永远不碎片化。';
  }
  if (flags.needsBatching) {
    return '一个 KV cache 持有 per-sequence 的 state，request 按固定组 batch，但参差不齐的完成时间让 GPU 有一部分闲着。';
  }
  return '一块 GPU 把每个 request 跑完才开始下一个；还不需要任何 batching 或 sharding。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (flags.needsPrefillSplit && (flags.tensorParallel || flags.needsSharding)) {
    return 'Client -> gateway -> scheduler -> prefill pool / decode shards (TP)';
  }
  if (flags.tensorParallel || flags.needsSharding) {
    return 'Client -> gateway -> scheduler -> GPU workers -> tensor-parallel shards';
  }
  if (flags.continuousBatching) {
    return 'Client -> gateway -> scheduler -> GPU worker (paged KV)';
  }
  if (flags.needsBatching) {
    return 'Client -> gateway -> static batch -> GPU + KV cache';
  }
  return 'Client -> gateway -> GPU (one request)';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
