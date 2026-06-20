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
  eyebrow: 'System Design Lab',
  title: 'LLM inference is autoregressive: the KV cache grows per token and dominates GPU memory, so batching and memory layout decide throughput.',
  summary:
    'Change request rate, prompt and output lengths, model size, GPU count, and the time-to-first-token target. Toggle continuous batching with paged attention and tensor parallelism. The design moves from one GPU serving one request at a time, to a KV cache with batching, to continuous batching plus paged attention, to tensor-parallel sharding for big models, and finally prefill/decode disaggregation at scale.',
  controls: [
    {
      id: 'requestsPerSecond',
      label: 'Request rate',
      help: 'New generation requests arriving per second. Each runs autoregressively until its output is complete.',
      min: 0.1,
      max: 5_000,
      defaultValue: 5,
      scale: 'log',
      format: 'requests-per-second',
    },
    {
      id: 'promptTokens',
      label: 'Avg prompt tokens',
      help: 'Input length processed in the prefill phase; sets the starting size of each KV cache.',
      min: 16,
      max: 128_000,
      defaultValue: 1_024,
      scale: 'log',
      unit: 'tokens',
      format: 'count',
    },
    {
      id: 'outputTokens',
      label: 'Avg output tokens',
      help: 'Tokens generated one at a time in the decode phase; the KV cache grows for each.',
      min: 8,
      max: 16_000,
      defaultValue: 256,
      scale: 'log',
      unit: 'tokens',
      format: 'count',
    },
    {
      id: 'modelParams',
      label: 'Model size',
      help: 'Parameter count. Weights at 16-bit take ~2 bytes each and must fit in GPU memory before any KV cache.',
      min: 1_000_000_000,
      max: 700_000_000_000,
      defaultValue: 13_000_000_000,
      scale: 'log',
      unit: 'params',
      format: 'count',
    },
    {
      id: 'gpuCount',
      label: 'GPU count',
      help: 'GPUs available to serve the model. More GPUs add memory and compute, via replicas or tensor-parallel shards.',
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
      help: 'Latency budget from request arrival to the first streamed token; the prefill phase must fit inside it.',
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
      help: 'In-flight batching admits and retires requests every step; paged attention stores the KV cache in fixed pages to avoid fragmentation.',
      defaultValue: true,
    },
    {
      id: 'tensorParallel',
      label: 'Tensor-parallel sharding',
      help: 'Split each layer across GPUs so a model larger than one GPU can run, at the cost of per-step collective communication.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-gpu',
      step: '01',
      title: 'One GPU, one request',
      summary: 'A small model serving the occasional request sequentially.',
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
      summary: 'Steady traffic batched in fixed groups; ragged finish times waste the GPU.',
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
      summary: 'High concurrency packed step-by-step with fragmentation-free KV memory.',
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
      title: 'Big model, tensor parallel',
      summary: 'A model too large for one GPU sharded across GPUs per layer.',
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
      summary: 'Long prompts and tight first-token targets split prefill from decode at fleet scale.',
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
    title: 'LLM inference serving architecture diagram',
    description:
      'Whiteboard-style architecture diagram for LLM inference: clients streaming tokens, an inference gateway, a continuous-batching scheduler, GPU workers holding the paged KV cache, tensor-parallel model shards, and an async metrics stream.',
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
            summary: 'sends a prompt and reads generated tokens as they stream back',
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
            summary: 'authenticates, queues requests, and streams tokens back over the connection',
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
            summary: 'admits and retires requests every decode step to keep the GPU busy',
          },
          {
            id: 'prefillPool',
            title: 'Prefill pool',
            subtitle: 'first token',
            summary: 'runs the compute-heavy prefill so long prompts do not block decode',
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
            summary: 'generates tokens autoregressively for the current batch',
          },
          {
            id: 'kvCache',
            title: 'Paged KV cache',
            subtitle: 'per-token state',
            summary: 'stores attention keys and values in fixed pages to avoid fragmentation',
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
            summary: 'splits each layer across GPUs so a large model fits and runs',
          },
          {
            id: 'metrics',
            title: 'Metrics stream',
            subtitle: 'async telemetry',
            summary: 'collects throughput and latency off the hot path for autoscaling',
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
    { id: 'kvMemory', label: 'KV cache pressure' },
    { id: 'weightMemory', label: 'Per-GPU weight footprint (falls as you shard)' },
    { id: 'throughput', label: 'Decode throughput vs capacity' },
    { id: 'batchEfficiency', label: 'Batch slot saturation' },
    { id: 'ttft', label: 'Time-to-first-token' },
  ],
  decisions: [
    { id: 'kvManagement', title: 'KV cache management' },
    { id: 'batching', title: 'Continuous batching' },
    { id: 'sharding', title: 'Tensor-parallel sharding' },
    { id: 'prefillSplit', title: 'Prefill/decode split' },
    { id: 'autoscaling', title: 'GPU autoscaling' },
    { id: 'streaming', title: 'Token streaming' },
  ],
  sourceBackedRules: [
    {
      title: 'PagedAttention stores the KV cache in fixed pages to eliminate fragmentation',
      source: 'vLLM (PagedAttention)',
      url: 'https://arxiv.org/abs/2309.06180',
      summary:
        'Borrowing OS virtual-memory paging, vLLM stores the KV cache in non-contiguous fixed-size blocks, cutting waste from fragmentation and raising serving throughput 2-4x.',
    },
    {
      title: 'vLLM combines continuous batching with paged attention for high-throughput serving',
      source: 'vLLM Docs',
      url: 'https://docs.vllm.ai/en/latest/',
      summary:
        'The documentation describes continuous (in-flight) batching and PagedAttention as the core mechanisms that keep the GPU busy across requests of different lengths.',
    },
    {
      title: 'TensorRT-LLM shards large models across GPUs with tensor and pipeline parallelism',
      source: 'NVIDIA TensorRT-LLM',
      url: 'https://github.com/NVIDIA/TensorRT-LLM',
      summary:
        'For models too large for one GPU, TensorRT-LLM splits each layer across devices and supports multi-GPU and multi-node parallelism plus disaggregated serving.',
    },
    {
      title: 'Triton Inference Server schedules and batches inference requests in production',
      source: 'NVIDIA Triton',
      url: 'https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/index.html',
      summary:
        'Triton documents dynamic and in-flight batching, scheduling, and multi-backend serving used to run LLM inference at scale behind a single endpoint.',
    },
  ],
  teachingAssumptions: [
    'Per-GPU memory, token throughput, and batching efficiency are conservative teaching numbers for one modern data-center GPU, not vendor benchmarks.',
    'KV cache size is approximated as proportional to sequence length and sub-linear in model scale; modern frontier models use Grouped-Query Attention (GQA/MQA) to share key/value heads, which shrinks the KV cache by roughly 8x and is folded into the coefficient here.',
    'Prefill is modeled as the compute-bound first-token phase and decode as the memory-bound token loop; their relative cost varies by hardware and kernel.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-request',
      step: '01',
      focus: 'One GPU, one request',
      scenarioId: 'single-gpu',
      question:
        'A 7B model serves about one request every two seconds. Do you need batching, paging, or multiple GPUs yet?',
      reveal:
        'No. The weights fit in one GPU and a single short generation barely touches memory or compute. Each request runs to completion before the next starts; batching machinery and sharding would add complexity with no load to justify them.',
      takeaway: 'Start with one GPU running requests sequentially when load and model size are both small.',
    },
    {
      id: 'static-batch',
      step: '02',
      focus: 'KV cache + static batching',
      scenarioId: 'kv-static-batch',
      question:
        'Traffic rises to several requests per second. If you batch a fixed group and run them together, why does the GPU still sit partly idle?',
      reveal:
        'Generations finish at different times, but a static batch waits for the slowest member. Short requests stall behind long ones, so effective utilisation is low. The KV cache also now holds growing per-token state for every active sequence, eating memory fast.',
      takeaway: 'Static batching wastes GPU because ragged finish times leave finished slots idle until the batch drains.',
    },
    {
      id: 'continuous',
      focus: 'Continuous + paged',
      step: '03',
      scenarioId: 'continuous-paged',
      question:
        'At high concurrency, what lets you pack many requests onto a GPU without running out of KV memory or stalling?',
      reveal:
        'Continuous (in-flight) batching admits and retires requests every decode step, so a finished sequence frees its slot immediately. Paged attention stores the KV cache in fixed pages, so memory is not fragmented and you fit many more concurrent sequences. Together they multiply throughput on the same hardware.',
      takeaway: 'Continuous batching plus paged attention is the workhorse: step-level scheduling with fragmentation-free KV memory.',
    },
    {
      id: 'tensor-parallel',
      step: '04',
      focus: 'Big model, tensor parallel',
      scenarioId: 'tensor-parallel-big',
      question:
        'A 175B model needs ~350 GB just for 16-bit weights. One 80 GB GPU cannot hold it — what changes?',
      reveal:
        'The model must be split. Tensor parallelism shards each layer across several GPUs so the weights and KV cache fit collectively, at the cost of a collective communication step every layer. Grouped-Query Attention (GQA) helps here too: by sharing key/value heads it shrinks the KV cache ~8x, so each shard holds far more concurrent sequences. You trade extra GPUs and inter-GPU bandwidth for the ability to run the model at all.',
      takeaway: 'When weights exceed one GPU, tensor-parallel sharding makes the model runnable but adds per-step communication.',
    },
    {
      id: 'disaggregated',
      step: '05',
      focus: 'Prefill/decode split',
      scenarioId: 'disaggregated-scale',
      question:
        'With 16k-token prompts and a 300 ms first-token target at fleet scale, why not run prefill and decode on the same GPUs?',
      reveal:
        'Prefill is compute-bound and bursty; decode is memory-bound and steady. Mixed on one pool, a long prefill blocks ongoing decodes and blows the time-to-first-token budget. Disaggregating prefill and decode onto separate GPU pools lets each scale and be tuned independently, protecting both first-token latency and decode throughput.',
      takeaway: 'At scale, separate prefill from decode so compute-heavy first tokens never stall the steady decode loop.',
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
          ? `~${formatCount(concurrentSequences)} concurrent sequences in paged KV memory; misses spill to recompute or eviction.`
          : `Naive KV allocation wastes ~${Math.round((1 - naiveKvUtilisation) * 100)}% to fragmentation while holding ${formatCount(concurrentSequences)} sequences.`,
      },
      weightMemory: {
        ratio: weightRatio,
        valueText: formatRatio(Math.min(weightRatio, 9.99)),
        copy: needsSharding
          ? tensorParallel
            ? `${formatCount(modelParams)} params split ${formatCount(shardCount)}-way drop the per-GPU weight footprint to ${formatRatio(weightRatio)} of a GPU, leaving room for the KV cache.`
            : `${formatCount(modelParams)} params at 16-bit exceed one GPU; tensor parallelism is required to fit the weights.`
          : `${formatCount(modelParams)} params at 16-bit occupy ${formatRatio(weightRatio)} of a single GPU before any KV cache.`,
      },
      throughput: {
        ratio: throughputRatio,
        valueText: `${formatRate(demandedTokensPerSecond)} tok/s`,
        copy: `${formatRate(requestsPerSecond)} req/s x ${formatCount(tokensPerRequest)} tokens demanded against ~${formatRate(fleetTokensPerSecond)} tok/s of capacity.`,
      },
      batchEfficiency: {
        ratio: batchSaturationRatio,
        valueText: `${formatRatio(batchSaturationRatio)} full`,
        copy: continuousBatching
          ? `Continuous batching packs ~${formatCount(concurrentSequences)} sequences into the batch slots, keeping the GPU near full utilisation.`
          : `Static batching wastes ~${Math.round((1 - decodeEfficiency) * 100)}% of the slots on ragged finish times, so the same ${formatCount(concurrentSequences)} sequences saturate it faster.`,
      },
      ttft: {
        ratio: ttftRatio,
        valueText: `~${Math.round(estimatedTtftMs)} ms`,
        copy: needsPrefillSplit
          ? 'Long prompts make prefill expensive; splitting prefill from decode protects the first-token budget.'
          : 'Prefill fits inside the first-token target on the shared pool.',
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
      text: `KV cache for ~${formatCount(analysis.concurrentSequences)} concurrent sequences is ${formatRatio(analysis.kvRatio)} of GPU memory; admit fewer, page the cache, or add GPUs.`,
    });
  } else if (analysis.kvRatio > 0.7) {
    reasons.push({
      severity: 'warning',
      text: `KV cache is filling GPU memory at ${formatRatio(analysis.kvRatio)} for ~${formatCount(analysis.concurrentSequences)} sequences; paged attention and admission control keep it from overflowing.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `KV cache fits comfortably (${formatRatio(analysis.kvRatio)} of memory) for ~${formatCount(analysis.concurrentSequences)} concurrent sequences, helped by GQA.`,
    });
  }

  // 2. Batching strategy (always emitted: either continuous, needs-to-be, or fine as-is).
  if (analysis.continuousBatching) {
    reasons.push({
      severity: 'ok',
      text: 'Continuous batching admits and retires requests every step, keeping GPU utilisation high across uneven request lengths.',
    });
  } else if (analysis.needsBatching) {
    reasons.push({
      severity: 'warning',
      text: `${formatRate(analysis.requestsPerSecond)} req/s with ragged generation lengths waste the GPU under static batching; turn on continuous batching.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Load is low enough to run requests one at a time; batching machinery is not justified yet.',
    });
  }

  // 3. Model fit / sharding (always emitted).
  if (analysis.needsSharding && !analysis.tensorParallel) {
    reasons.push({
      severity: 'danger',
      text: `${formatCount(analysis.modelParams)} params at 16-bit do not fit in one GPU; enable tensor-parallel sharding to run the model at all.`,
    });
  } else if (analysis.tensorParallel) {
    reasons.push({
      severity: 'ok',
      text: 'Each layer is sharded tensor-parallel so weights and KV fit collectively, at the cost of a per-step collective communication.',
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(analysis.modelParams)} params fit on a single GPU, so no sharding is needed yet.`,
    });
  }

  // 4. Decode throughput vs capacity (always emitted).
  if (analysis.throughputRatio > 1) {
    reasons.push({
      severity: 'danger',
      text: `Token demand (~${formatRate(analysis.demandedTokensPerSecond)} tok/s) exceeds fleet decode capacity at ${formatRatio(analysis.throughputRatio)}; add GPU replicas or autoscale.`,
    });
  } else if (analysis.throughputRatio > 0.7) {
    reasons.push({
      severity: 'warning',
      text: `Decode demand is ${formatRatio(analysis.throughputRatio)} of fleet capacity; headroom is thin, so plan to autoscale replicas.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `Decode capacity covers demand at ${formatRatio(analysis.throughputRatio)} of the fleet; throughput has room to spare.`,
    });
  }

  // 5. Time-to-first-token: prefill split when needed, otherwise a positive note.
  if (analysis.needsPrefillSplit) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(analysis.promptTokens)}-token prompts push first-token latency to ~${Math.round(analysis.estimatedTtftMs)} ms; disaggregate prefill from decode to protect the budget.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `Prefill resolves the first token in ~${Math.round(analysis.estimatedTtftMs)} ms on the shared pool, inside the latency budget.`,
    });
  }

  // 6. Autoscaling (only when warranted).
  if (analysis.needsAutoscaling) {
    reasons.push({
      severity: 'ok',
      text: 'Throughput and latency telemetry feed autoscaling so GPU replicas track the live request rate.',
    });
  }

  // 7. Streaming (only when long outputs make it worthwhile; fills toward the upper bound).
  if (analysis.streamingHelps) {
    reasons.push({
      severity: 'ok',
      text: `Stream the ~${formatCount(analysis.outputTokens)} output tokens as they generate so users see progress before completion.`,
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
        ? 'Paged attention stores the KV cache in fixed pages, so concurrency is bounded by memory, not fragmentation.'
        : 'Without paging, the KV cache is allocated contiguously and loses memory to fragmentation as sequences vary in length.',
    },
    batching: {
      state: flags.continuousBatching ? 'needed' : flags.needsBatching ? 'needed' : 'not-yet',
      copy: flags.continuousBatching
        ? 'Continuous (in-flight) batching schedules admissions and retirements every decode step for high utilisation.'
        : flags.needsBatching
          ? 'Static batching is leaving the GPU idle; move to continuous batching to pack uneven requests.'
          : 'Load is low enough to run requests one at a time without batching.',
    },
    sharding: {
      state: flags.tensorParallel ? 'needed' : flags.needsSharding ? 'needed' : 'not-yet',
      copy: flags.tensorParallel
        ? `Each layer is split across ${formatCount(flags.shardCount)} GPUs so a model larger than one GPU fits and runs.`
        : flags.needsSharding
          ? 'The model exceeds one GPU; enable tensor parallelism to shard the weights across devices.'
          : 'The model fits on a single GPU, so no sharding is needed yet.',
    },
    prefillSplit: {
      state: flags.needsPrefillSplit ? 'needed' : 'not-yet',
      copy: flags.needsPrefillSplit
        ? 'Disaggregate prefill and decode onto separate pools so long compute-bound prefills do not stall the decode loop.'
        : 'Prefill and decode share the same GPUs; prompts are short enough that first-token latency stays within budget.',
    },
    autoscaling: {
      state: flags.needsAutoscaling ? 'needed' : 'not-yet',
      copy: flags.needsAutoscaling
        ? `Autoscale GPU replicas from live telemetry to track ${formatRate(flags.requestsPerSecond)} req/s of demand.`
        : 'A fixed pool covers the load; autoscaling is not justified yet.',
    },
    streaming: {
      state: flags.streamingHelps ? 'useful' : 'not-yet',
      copy: flags.streamingHelps
        ? `Stream the ~${formatCount(flags.outputTokens)} output tokens as they are generated so users see progress before completion.`
        : 'Outputs are short enough that streaming adds little over returning the full response.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags, gpuCount: number): string {
  if (flags.needsPrefillSplit && (flags.tensorParallel || flags.needsSharding)) {
    return 'Disaggregated prefill/decode + tensor-parallel fleet';
  }
  if (flags.tensorParallel || flags.needsSharding) {
    return 'Tensor-parallel serving with continuous batching';
  }
  if (flags.continuousBatching) {
    const gpus = Math.max(1, Math.round(gpuCount));
    return gpus > 1
      ? `Continuous batching + paged attention across ${formatCount(gpus)} GPU replicas`
      : 'Continuous batching + paged attention on one GPU';
  }
  if (flags.needsBatching) {
    return 'Static batching with a KV cache';
  }
  return 'Single GPU, one request at a time';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (flags.needsPrefillSplit && (flags.tensorParallel || flags.needsSharding)) {
    return 'Prefill and decode run on separate GPU pools, the model is sharded tensor-parallel, and continuous batching with paged attention keeps each pool saturated.';
  }
  if (flags.tensorParallel || flags.needsSharding) {
    return 'The model is split across GPUs so it fits, and continuous batching with paged attention packs many concurrent sequences onto the shards.';
  }
  if (flags.continuousBatching) {
    return 'A single GPU runs continuous batching with paged attention, retiring and admitting requests every step so the KV cache never fragments.';
  }
  if (flags.needsBatching) {
    return 'A KV cache holds per-sequence state and requests are batched in fixed groups, but ragged finish times leave the GPU partly idle.';
  }
  return 'One GPU runs each request to completion before the next; no batching or sharding is justified yet.';
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
