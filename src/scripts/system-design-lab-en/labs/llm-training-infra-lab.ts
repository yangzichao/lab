import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatRate } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Teaching constants (conservative, round numbers — not vendor SLAs).
const bytesPerGpuMemory = 80_000_000_000; // 80 GB high-end accelerator.
// Mixed-precision training holds, per parameter: weights, gradients, and
// optimizer state (Adam: fp32 master + 2 moments). ~16 bytes/param is the
// standard back-of-envelope without sharding.
const bytesPerParamFullState = 16;
// Activation memory grows with batch x sequence; rough per-token-per-param-ish
// teaching coefficient so the sequence-length slider bites.
const activationBytesPerTokenBillionParams = 1_700; // bytes per token, per 1B params.
const checkpointWriteSecondsPerGb = 0.04; // store throughput for the checkpoint blob.

export const llmTrainingInfraLabDefinition: SystemDesignLabDefinition = {
  id: 'llm-training-infra',
  eyebrow: 'System Design Lab',
  title:
    'LLM pretraining is bounded by GPU memory and inter-GPU communication; both force you to split the model across many accelerators.',
  summary:
    'Scale model parameters, GPU count, global batch, sequence length, interconnect bandwidth, and checkpoint interval. The design moves from a single GPU to data parallelism with all-reduce, to tensor and pipeline parallelism for a model too big for one device, to full 3D parallelism with activation checkpointing, and finally to thousands of GPUs that demand fast collectives plus frequent checkpoint-and-recover.',
  controls: [
    {
      id: 'modelParams',
      label: 'Model parameters',
      help: 'Total trainable parameters. Weights + gradients + optimizer state set the per-device memory floor.',
      min: 0.1,
      max: 1_000,
      defaultValue: 3,
      scale: 'log',
      unit: 'B params',
      format: 'count',
    },
    {
      id: 'gpuCount',
      label: 'GPU count',
      help: 'Accelerators in the training mesh, factored into data x tensor x pipeline parallel groups.',
      min: 1,
      max: 16_384,
      defaultValue: 8,
      scale: 'log',
      unit: 'GPUs',
      format: 'count',
    },
    {
      id: 'globalBatchTokens',
      label: 'Global batch',
      help: 'Tokens processed per optimizer step across the whole mesh. Larger batches need more activation memory and data throughput.',
      min: 32_768,
      max: 16_000_000,
      defaultValue: 2_000_000,
      scale: 'log',
      unit: 'tokens',
      format: 'count',
    },
    {
      id: 'sequenceLength',
      label: 'Sequence length',
      help: 'Context window in tokens. Activation memory scales with sequence length.',
      min: 512,
      max: 131_072,
      defaultValue: 4_096,
      scale: 'log',
      unit: 'tokens',
      format: 'count',
    },
    {
      id: 'interconnectBandwidth',
      label: 'Interconnect bandwidth',
      help: 'Per-GPU collective bandwidth (NVLink within a node, InfiniBand across nodes). Gradient all-reduce and tensor-parallel traffic ride on it.',
      min: 10,
      max: 900,
      defaultValue: 200,
      scale: 'log',
      unit: 'GB/s',
      format: 'count',
    },
    {
      id: 'dataThroughput',
      label: 'Data pipeline throughput',
      help: 'Tokens per second the data loaders can stream (tokenized shards from object storage). Must keep the mesh fed.',
      min: 100_000,
      max: 200_000_000,
      defaultValue: 5_000_000,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'checkpointIntervalMin',
      label: 'Checkpoint interval',
      help: 'Minutes of compute between full checkpoints. Shorter loses less work on a failure but costs more store bandwidth.',
      min: 5,
      max: 240,
      defaultValue: 60,
      scale: 'log',
      format: 'duration-seconds',
    },
  ],
  toggles: [
    {
      id: 'modelParallel',
      label: 'Tensor + pipeline parallel (3D)',
      help: 'Split each layer across GPUs (tensor) and split layers into stages (pipeline) so a model larger than one device can train.',
      defaultValue: false,
    },
    {
      id: 'activationCheckpointing',
      label: 'Activation checkpointing',
      help: 'Recompute activations in the backward pass instead of storing them, trading extra compute for much lower memory.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-gpu',
      step: '01',
      title: 'Single GPU',
      summary: 'A small model that fits in one accelerator with room to spare.',
      values: {
        modelParams: 1.5,
        gpuCount: 1,
        globalBatchTokens: 131_072,
        sequenceLength: 2_048,
        interconnectBandwidth: 200,
        dataThroughput: 2_000_000,
        checkpointIntervalMin: 60,
        modelParallel: false,
        activationCheckpointing: false,
      },
    },
    {
      id: 'data-parallel',
      step: '02',
      title: 'Data parallel',
      summary: 'A model that still fits per device, replicated to train faster on more data.',
      values: {
        modelParams: 3,
        gpuCount: 64,
        globalBatchTokens: 2_000_000,
        sequenceLength: 4_096,
        interconnectBandwidth: 200,
        dataThroughput: 12_000_000,
        checkpointIntervalMin: 60,
        modelParallel: false,
        activationCheckpointing: false,
      },
    },
    {
      id: 'tensor-pipeline',
      step: '03',
      title: 'Too big for one GPU',
      summary: 'The model no longer fits on a single device, forcing tensor and pipeline splits.',
      values: {
        modelParams: 70,
        gpuCount: 512,
        globalBatchTokens: 4_000_000,
        sequenceLength: 8_192,
        interconnectBandwidth: 400,
        dataThroughput: 16_000_000,
        checkpointIntervalMin: 45,
        modelParallel: true,
        activationCheckpointing: false,
      },
    },
    {
      id: 'three-d-parallel',
      step: '04',
      title: '3D parallel + recompute',
      summary: 'Long context and a large model push memory past the limit even when split.',
      values: {
        modelParams: 175,
        gpuCount: 2_048,
        globalBatchTokens: 6_000_000,
        sequenceLength: 32_768,
        interconnectBandwidth: 600,
        dataThroughput: 18_000_000,
        checkpointIntervalMin: 30,
        modelParallel: true,
        activationCheckpointing: true,
      },
    },
    {
      id: 'thousands-of-gpus',
      step: '05',
      title: 'Thousands of GPUs',
      summary: 'A frontier run where failures are routine and checkpoint-recover dominates resilience.',
      values: {
        modelParams: 540,
        gpuCount: 12_288,
        globalBatchTokens: 12_000_000,
        sequenceLength: 32_768,
        interconnectBandwidth: 800,
        dataThroughput: 22_000_000,
        checkpointIntervalMin: 15,
        modelParallel: true,
        activationCheckpointing: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'LLM pretraining infrastructure diagram',
    description:
      'Whiteboard-style architecture diagram for large-scale LLM pretraining: training dataset in object storage, sharded data loaders, a 3D-parallel training mesh of data, tensor, and pipeline groups, the collective-communication fabric and checkpoint store, and asynchronous metrics and fault recovery.',
    columns: [
      {
        id: 'data',
        label: 'Dataset',
        variant: 'clients',
        nodes: [
          {
            id: 'corpus',
            title: 'Token corpus',
            subtitle: 'object storage',
            kind: 'objectstore',
            summary: 'tokenized training shards held in object storage and streamed during the run',
          },
        ],
      },
      {
        id: 'loaders',
        label: 'Data loaders',
        variant: 'edge',
        nodes: [
          {
            id: 'loader',
            title: 'Data loaders',
            subtitle: 'stream + shuffle',
            kind: 'compute',
            summary: 'prefetch, shuffle, and pack token batches so GPUs never wait on input',
          },
        ],
      },
      {
        id: 'mesh',
        label: 'Training mesh',
        variant: 'processing',
        nodes: [
          {
            id: 'dataParallel',
            title: 'Data-parallel',
            subtitle: 'replicas',
            kind: 'gpu',
            summary: 'replicas each train on a slice of the batch and all-reduce gradients each step',
          },
          {
            id: 'tensorParallel',
            title: 'Tensor-parallel',
            subtitle: 'split layers',
            kind: 'gpu',
            summary: 'splits each layer matrix across GPUs that exchange activations within a node',
          },
          {
            id: 'pipelineParallel',
            title: 'Pipeline-parallel',
            subtitle: 'layer stages',
            kind: 'gpu',
            summary: 'assigns contiguous layer stages to GPUs and streams micro-batches between them',
          },
        ],
      },
      {
        id: 'fabric',
        label: 'Comms + checkpoint',
        variant: 'backbone',
        nodes: [
          {
            id: 'collectives',
            title: 'Collective fabric',
            subtitle: 'all-reduce',
            kind: 'service',
            summary: 'NVLink and InfiniBand carry gradient all-reduce and tensor-parallel exchanges',
          },
          {
            id: 'checkpointStore',
            title: 'Checkpoint store',
            subtitle: 'sharded state',
            kind: 'objectstore',
            summary: 'persists sharded weights and optimizer state so a run can resume after a failure',
          },
        ],
      },
      {
        id: 'async',
        label: 'Ops',
        variant: 'storage',
        nodes: [
          {
            id: 'metrics',
            title: 'Metrics',
            subtitle: 'loss + throughput',
            kind: 'service',
            summary: 'logs loss, throughput, and hardware health off the training hot path',
          },
          {
            id: 'faultRecovery',
            title: 'Fault recovery',
            subtitle: 'restart mesh',
            kind: 'scheduler',
            summary: 'detects dead nodes and restarts the mesh from the latest checkpoint',
          },
        ],
      },
    ],
    flows: [
      { from: 'corpus', to: 'loader', variant: 'primary' },
      { from: 'loader', to: 'dataParallel', variant: 'primary' },
      { from: 'dataParallel', to: 'tensorParallel', variant: 'secondary' },
      { from: 'tensorParallel', to: 'pipelineParallel', variant: 'secondary' },
      { from: 'dataParallel', to: 'collectives', variant: 'primary' },
      { from: 'tensorParallel', to: 'collectives', variant: 'secondary' },
      { from: 'pipelineParallel', to: 'checkpointStore', variant: 'secondary' },
      { from: 'dataParallel', to: 'checkpointStore', variant: 'direct' },
      { from: 'collectives', to: 'metrics', variant: 'secondary' },
      { from: 'checkpointStore', to: 'faultRecovery', variant: 'primary' },
    ],
  }),
  meters: [
    { id: 'deviceMemory', label: 'Per-GPU memory pressure' },
    { id: 'communication', label: 'Collective comms load' },
    { id: 'dataPipeline', label: 'Data pipeline load' },
    { id: 'activationMemory', label: 'Activation memory' },
    { id: 'checkpointResilience', label: 'Checkpoint / failure exposure' },
  ],
  decisions: [
    { id: 'parallelism', title: 'Parallelism strategy' },
    { id: 'collectives', title: 'Gradient sync / collectives' },
    { id: 'activation', title: 'Activation memory' },
    { id: 'checkpointing', title: 'Checkpoint + fault tolerance' },
    { id: 'dataPipeline', title: 'Data pipeline throughput' },
    { id: 'interconnect', title: 'Interconnect topology' },
  ],
  sourceBackedRules: [
    {
      title: 'Tensor parallelism splits each layer across GPUs to train models too big for one device',
      source: 'Megatron-LM',
      url: 'https://github.com/NVIDIA/Megatron-LM',
      summary:
        'Megatron-LM partitions the attention and MLP matrices across GPUs so a single transformer layer fits in aggregate device memory, exchanging activations over the fast intra-node interconnect.',
    },
    {
      title: 'ZeRO shards optimizer state, gradients, and parameters to cut the per-GPU memory floor',
      source: 'DeepSpeed ZeRO (arXiv:1910.02054)',
      url: 'https://arxiv.org/abs/1910.02054',
      summary:
        'Standard data parallelism replicates the full ~16 bytes/param of optimizer state on every GPU; ZeRO partitions that state across data-parallel ranks so memory falls roughly linearly with the number of devices.',
    },
    {
      title: 'Pipeline parallelism splits layers into stages and overlaps micro-batches to keep GPUs busy',
      source: 'GPipe (arXiv:1811.06965)',
      url: 'https://arxiv.org/abs/1811.06965',
      summary:
        'GPipe assigns contiguous layer stages to different accelerators and pipelines micro-batches through them, with re-materialization (activation recompute) to bound the activation memory per stage.',
    },
    {
      title: 'Combining tensor, pipeline, and data parallelism scales transformer training to thousands of GPUs',
      source: 'Megatron-LM scaling (arXiv:1909.08053)',
      url: 'https://arxiv.org/abs/1909.08053',
      summary:
        'Efficient large-model training composes the three parallelism axes (3D parallelism), placing high-bandwidth tensor-parallel traffic within a node and lower-bandwidth data-parallel all-reduce across nodes.',
    },
  ],
  teachingAssumptions: [
    'Memory is modeled as ~16 bytes/param for weights, gradients, and Adam optimizer state, plus an activation term that grows with batch and sequence length; real frameworks vary with precision and ZeRO sharding.',
    'Per-GPU memory is a fixed teaching figure (80 GB) and collective/data thresholds are round numbers, not vendor benchmarks.',
    'Failure rate is approximated as proportional to GPU count, so expected lost work scales with both fleet size and checkpoint interval.',
  ],
  teachingWalkthrough: [
    {
      id: 'fits-on-one',
      step: '01',
      focus: 'Fits on one GPU',
      scenarioId: 'single-gpu',
      question:
        'A 1.5B-parameter model trains on one accelerator. Do you need any parallelism, collectives, or recompute at all?',
      reveal:
        'No. At ~16 bytes/param, 1.5B parameters need ~24 GB for weights, gradients, and optimizer state — well under an 80 GB device — and there is only one GPU, so there is nothing to all-reduce. Parallelism and activation checkpointing would add complexity and overhead with no constraint to relieve.',
      takeaway: 'If the model and a batch fit on one GPU, the simplest correct setup is a single device with no collectives.',
    },
    {
      id: 'replicate-and-reduce',
      step: '02',
      focus: 'Replicate, all-reduce',
      scenarioId: 'data-parallel',
      question:
        'A 3B model still fits per device, but you want to train on far more tokens. How do you use 64 GPUs without changing the model layout?',
      reveal:
        'Data parallelism: replicate the whole model on every GPU, give each a different slice of the global batch, and all-reduce the gradients each step so every replica stays in sync. The binding cost shifts from memory to the gradient all-reduce, whose volume scales with parameter count and is bounded by interconnect bandwidth.',
      takeaway: 'Data parallelism scales throughput by replicating the model; the new bottleneck is the gradient all-reduce.',
    },
    {
      id: 'too-big',
      step: '03',
      focus: 'Split the model',
      scenarioId: 'tensor-pipeline',
      question:
        'A 70B model needs ~1.1 TB just for weights and optimizer state — far more than one 80 GB GPU. Can data parallelism alone fix this?',
      reveal:
        'No. Data parallelism replicates the full model, so it cannot help when one copy does not fit. You must split the model itself: tensor parallelism partitions each layer across GPUs (heavy intra-node traffic, so it rides NVLink), and pipeline parallelism splits layers into stages across nodes. The two combine to make a copy fit in aggregate memory.',
      takeaway: 'When one model copy will not fit on a device, you must shard the model with tensor and pipeline parallelism.',
    },
    {
      id: 'recompute',
      step: '04',
      focus: 'Recompute activations',
      scenarioId: 'three-d-parallel',
      question:
        'At 175B params with a 32k-token context, even sharded weights leave little room and activations explode. What memory lever is left before buying more GPUs?',
      reveal:
        'Activation checkpointing (re-materialization): store only a few layer boundaries and recompute the rest during the backward pass, trading ~30% extra compute for a large drop in activation memory. Combined with 3D parallelism (data x tensor x pipeline), it lets long-context, hundred-billion-parameter models fit.',
      takeaway: 'Activation checkpointing trades compute for memory, the key lever once weights are already sharded.',
    },
    {
      id: 'fault-tolerance',
      step: '05',
      focus: 'Failures are routine',
      scenarioId: 'thousands-of-gpus',
      question:
        'On 12,000 GPUs a hardware failure happens often. With a 15-minute checkpoint interval, what dominates whether the run finishes on time?',
      reveal:
        'Checkpoint-and-recover. At thousands of GPUs the mean time between failures drops to hours, so the run constantly restarts from the last checkpoint. Frequent, sharded, fast-to-write checkpoints plus automatic mesh restart bound the lost work; the collective fabric must also sustain all-reduce at this scale without becoming the bottleneck.',
      takeaway: 'At thousands of GPUs, fault tolerance — frequent checkpoints and fast recovery — governs whether the run completes.',
    },
  ],
  analyze: analyzeLlmTrainingWorkload,
};

function analyzeLlmTrainingWorkload(workload: WorkloadValues): LabAnalysis {
  const modelParams = numericValue(workload, 'modelParams'); // billions
  const gpuCount = numericValue(workload, 'gpuCount');
  const globalBatchTokens = numericValue(workload, 'globalBatchTokens');
  const sequenceLength = numericValue(workload, 'sequenceLength');
  const interconnectBandwidth = numericValue(workload, 'interconnectBandwidth'); // GB/s
  const dataThroughput = numericValue(workload, 'dataThroughput'); // tokens/s
  const checkpointIntervalMin = numericValue(workload, 'checkpointIntervalMin');
  const modelParallel = Boolean(workload.modelParallel);
  const activationCheckpointing = Boolean(workload.activationCheckpointing);

  const paramCount = modelParams * 1_000_000_000;
  const fullStateBytes = paramCount * bytesPerParamFullState;

  // How many GPUs share one model copy. Data parallelism alone => one copy per
  // GPU (shardFactor 1). Model parallelism spreads a copy over a tensor x
  // pipeline group sized to fit the weights with margin, capped by the fleet.
  const modelParallelDegree = modelParallel ? modelParallelGroupSize(paramCount, gpuCount) : 1;
  const weightBytesPerGpu = fullStateBytes / modelParallelDegree;

  // Activations: scale with the per-replica batch (in tokens) and grow worse
  // with sequence length because attention activations rise with context. With
  // data parallelism the global batch is spread across replicas.
  const dataParallelReplicas = Math.max(1, Math.floor(gpuCount / modelParallelDegree));
  const tokensPerReplicaStep = globalBatchTokens / dataParallelReplicas;
  // Sequence-length penalty: longer contexts cost extra activation memory per
  // token (attention scratch grows with context), modeled at least linearly so
  // the sequence-length slider bites activation memory.
  const sequenceLengthPenalty = Math.max(sequenceLength, 512) / 2_048;
  const rawActivationBytes =
    tokensPerReplicaStep *
    modelParams *
    activationBytesPerTokenBillionParams *
    sequenceLengthPenalty;
  // Tensor/pipeline splitting shards activations only partially: each pipeline
  // stage keeps a stage's worth resident, so divide by sqrt(degree), not the
  // full degree. This keeps per-GPU activation pressure rising as the model and
  // context grow instead of over-sharding it away.
  const activationShardFactor = modelParallel ? Math.sqrt(modelParallelDegree) : 1;
  const activationBytesPerGpu =
    (rawActivationBytes / activationShardFactor) * (activationCheckpointing ? 0.4 : 1);

  const totalBytesPerGpu = weightBytesPerGpu + activationBytesPerGpu;
  const deviceMemoryRatio = totalBytesPerGpu / bytesPerGpuMemory;

  // Gradient all-reduce volume ~ 2 bytes/param (bf16 gradients). In pure data
  // parallelism every rank participates in a ring all-reduce over the full
  // gradient, so per-step comms time scales with model size over bandwidth and
  // grows with the number of data-parallel ranks (more hops, more straggler
  // exposure). Tensor parallelism adds heavy per-step intra-node exchange.
  const gradientGb = (paramCount * 2) / 1_000_000_000;
  // (a) Data-parallel gradient all-reduce: each rank reduces its gradient shard
  // over the ring. Sharding the model only partially relieves all-reduce volume
  // (sqrt of the group), and latency grows with the number of participating
  // ranks (more hops and straggler exposure across nodes).
  const gradientShardGb = gradientGb / Math.sqrt(modelParallelDegree);
  const dataParallelScalePenalty = 1 + Math.log2(Math.max(dataParallelReplicas, 1)) / 2;
  const allReduceSeconds =
    ((gradientShardGb * 2) / Math.max(interconnectBandwidth, 1)) * dataParallelScalePenalty;
  // (b) Tensor-parallel exchange: every micro-step swaps activations across the
  // tensor-parallel group. This traffic does NOT shrink with the group size and
  // scales with model size over bandwidth — it is the dominant cost at scale.
  const tensorParallelSeconds = modelParallel
    ? (gradientGb * 0.5) / Math.max(interconnectBandwidth, 1)
    : 0;
  const communicationRatio =
    (allReduceSeconds + tensorParallelSeconds) / comfortableStepCommsSeconds;
  const allReduceTimeSeconds = allReduceSeconds + tensorParallelSeconds;

  // Data pipeline must feed the whole mesh: tokens consumed per second roughly
  // tracks the fleet throughput. Use global batch over a nominal step time.
  const tokensConsumedPerSecond = (globalBatchTokens / nominalStepSeconds) * (gpuCount > 1 ? 1 : 0.5);
  const dataPipelineRatio = tokensConsumedPerSecond / Math.max(dataThroughput, 1);

  const activationRatio = activationBytesPerGpu / (bytesPerGpuMemory * 0.6);

  // Failure exposure: expected lost work ~ failure rate (∝ GPU count) x
  // checkpoint interval. Normalize against a comfortable single-node baseline.
  const failuresPerHour = gpuCount / failureMtbfGpuHours;
  const lostWorkExposure = failuresPerHour * (checkpointIntervalMin / 60);
  const checkpointResilienceRatio = lostWorkExposure / comfortableLostWorkExposure;

  const checkpointBlobGb = fullStateBytes / 1_000_000_000;
  const checkpointWriteSeconds = checkpointBlobGb * checkpointWriteSecondsPerGb;

  const needsDataParallel = gpuCount > 1;
  const needsModelSplit = weightBytesPerGpu > bytesPerGpuMemory || (modelParallel && deviceMemoryRatio > 0.6);
  const modelTooBigUnsharded = fullStateBytes > bytesPerGpuMemory;
  const needsCollectives = needsDataParallel || modelParallel;
  const needsActivationRecompute = activationCheckpointing || activationRatio > 1;
  const needsCheckpointResilience = checkpointResilienceRatio > 1 || gpuCount >= 256;
  const dataStarved = dataPipelineRatio > 1;
  const interconnectStrained = communicationRatio > 1 || (modelParallel && interconnectBandwidth < 200);

  const flags = {
    needsDataParallel,
    needsModelSplit,
    modelTooBigUnsharded,
    modelParallel,
    needsCollectives,
    needsActivationRecompute,
    activationCheckpointing,
    needsCheckpointResilience,
    dataStarved,
    interconnectStrained,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      corpus: 'ok',
      loader: dataStarved ? 'overloaded' : 'ok',
      // The training replicas are always present (a single GPU is a degree-1
      // replica), so this node is the always-active entry into the mesh.
      dataParallel: deviceMemoryRatio > 1 ? 'warning' : 'ok',
      tensorParallel: modelParallel ? (needsModelSplit ? 'needed' : 'ok') : 'inactive',
      pipelineParallel: modelParallel ? 'needed' : 'inactive',
      collectives: needsCollectives
        ? interconnectStrained
          ? 'overloaded'
          : communicationRatio > 0.7
            ? 'warning'
            : 'ok'
        : 'inactive',
      // A run always writes checkpoints; the store is always active.
      checkpointStore: needsCheckpointResilience ? 'needed' : 'ok',
      metrics: 'ok',
      faultRecovery: needsCheckpointResilience ? 'needed' : 'inactive',
    },
    flowStates: {
      // corpus, loader, dataParallel, checkpointStore, metrics are always active;
      // tensor/pipeline gate on modelParallel; collectives on needsCollectives;
      // faultRecovery on needsCheckpointResilience. Every flow below is gated on
      // the SAME condition that activates BOTH its endpoints, so no active or
      // warning flow ever touches an inactive node.
      corpusToLoader: 'active',
      loaderToDataParallel: dataStarved ? 'warning' : 'active',
      dataParallelToTensorParallel: modelParallel ? 'active' : 'inactive',
      tensorParallelToPipelineParallel: modelParallel ? 'active' : 'inactive',
      dataParallelToCollectives: needsCollectives
        ? communicationRatio > 1
          ? 'warning'
          : 'active'
        : 'inactive',
      tensorParallelToCollectives: modelParallel ? (interconnectStrained ? 'warning' : 'active') : 'inactive',
      pipelineParallelToCheckpointStore: modelParallel ? 'active' : 'inactive',
      // Data-parallel / single-GPU runs write the full checkpoint directly; when
      // model-parallel, the pipeline path above carries the sharded write.
      dataParallelToCheckpointStore: modelParallel ? 'inactive' : 'active',
      collectivesToMetrics: needsCollectives ? 'active' : 'inactive',
      checkpointStoreToFaultRecovery: needsCheckpointResilience ? 'active' : 'inactive',
    },
    meters: {
      deviceMemory: {
        ratio: deviceMemoryRatio,
        valueText: `${formatBytesGb(totalBytesPerGpu)} / ${formatBytesGb(bytesPerGpuMemory)}`,
        copy: modelParallel
          ? `Weights and optimizer state are sharded across ${formatCount(modelParallelDegree)}-way model parallel; each GPU holds about ${formatBytesGb(totalBytesPerGpu)}.`
          : `A full model copy plus activations needs about ${formatBytesGb(totalBytesPerGpu)} per GPU against an ${formatBytesGb(bytesPerGpuMemory)} device.`,
      },
      communication: {
        ratio: communicationRatio,
        valueText: `${allReduceTimeSeconds.toFixed(2)} s/step`,
        copy: needsCollectives
          ? `Gradient all-reduce moves about ${gradientGb.toFixed(0)} GB over ${formatCount(interconnectBandwidth)} GB/s links${modelParallel ? ', on top of tensor-parallel exchanges' : ''}.`
          : 'A single GPU has nothing to synchronize, so there is no collective traffic.',
      },
      dataPipeline: {
        ratio: dataPipelineRatio,
        valueText: `${formatRate(tokensConsumedPerSecond)} / ${formatRate(dataThroughput)} tok/s`,
        copy: dataStarved
          ? 'The mesh consumes tokens faster than the loaders can stream them; GPUs stall waiting on input.'
          : 'Data loaders stream tokens fast enough to keep the mesh fed.',
      },
      activationMemory: {
        ratio: activationRatio,
        valueText: formatBytesGb(activationBytesPerGpu),
        copy: activationCheckpointing
          ? 'Activation checkpointing recomputes most activations in the backward pass, cutting this memory by roughly 5x.'
          : `Activations for a ${formatCount(sequenceLength)}-token context and this batch consume about ${formatBytesGb(activationBytesPerGpu)} per GPU.`,
      },
      checkpointResilience: {
        ratio: checkpointResilienceRatio,
        valueText: `~${(lostWorkExposure * 60).toFixed(0)} min lost/restart`,
        copy: needsCheckpointResilience
          ? `${formatCount(gpuCount)} GPUs fail often; a ${formatCount(checkpointIntervalMin)}-minute interval and a ~${checkpointWriteSeconds.toFixed(0)} s write bound the lost work per restart.`
          : `Failures are rare at ${formatCount(gpuCount)} GPUs, so a ${formatCount(checkpointIntervalMin)}-minute checkpoint interval is plenty.`,
      },
    },
    decisions: buildDecisions({
      ...flags,
      gpuCount,
      modelParams,
      interconnectBandwidth,
      checkpointIntervalMin,
      modelParallelDegree,
    }),
    reasons: buildReasons({
      ...flags,
      modelParams,
      gpuCount,
      totalBytesPerGpu,
      deviceMemoryRatio,
      communicationRatio,
      interconnectBandwidth,
      sequenceLength,
      checkpointIntervalMin,
      dataPipelineRatio,
      modelParallelDegree,
    }),
  };
}

// Teaching thresholds.
const comfortableStepCommsSeconds = 0.5; // tolerable per-step all-reduce time.
const nominalStepSeconds = 2; // assumed optimizer step duration for data-rate math.
const failureMtbfGpuHours = 6_000; // GPU-hours between failures (teaching figure).
const comfortableLostWorkExposure = 0.5; // baseline expected lost-work units.
const modelParallelTargetFraction = 0.45; // weights should fit in ~45% of a device.

function modelParallelGroupSize(paramCount: number, gpuCount: number): number {
  // Choose a tensor x pipeline group just large enough to hold one copy's
  // weights + optimizer state in ~45% of device memory, capped by the fleet.
  // Sizing it tightly (no power-of-two over-rounding) keeps per-GPU memory
  // pressure rising as the model grows, instead of over-sharding it away.
  const fullStateBytes = paramCount * bytesPerParamFullState;
  const minGpus = Math.ceil(fullStateBytes / (bytesPerGpuMemory * modelParallelTargetFraction));
  return Math.max(2, Math.min(gpuCount, minGpus));
}

type ArchitectureFlags = {
  needsDataParallel: boolean;
  needsModelSplit: boolean;
  modelTooBigUnsharded: boolean;
  modelParallel: boolean;
  needsCollectives: boolean;
  needsActivationRecompute: boolean;
  activationCheckpointing: boolean;
  needsCheckpointResilience: boolean;
  dataStarved: boolean;
  interconnectStrained: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    modelParams: number;
    gpuCount: number;
    totalBytesPerGpu: number;
    deviceMemoryRatio: number;
    communicationRatio: number;
    interconnectBandwidth: number;
    sequenceLength: number;
    checkpointIntervalMin: number;
    dataPipelineRatio: number;
    modelParallelDegree: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.modelTooBigUnsharded && !analysis.modelParallel) {
    reasons.push({
      severity: 'danger',
      text: `A ${formatCount(analysis.modelParams)}B-param model needs about ${formatBytesGb(
        analysis.totalBytesPerGpu,
      )} per GPU and will not fit on one device; turn on tensor + pipeline parallel to split it.`,
    });
  } else if (analysis.modelParallel) {
    reasons.push({
      severity: analysis.deviceMemoryRatio > 1 ? 'danger' : analysis.deviceMemoryRatio > 0.7 ? 'warning' : 'ok',
      text: `Tensor + pipeline parallel shards the model ${formatCount(
        analysis.modelParallelDegree,
      )} ways so each GPU holds about ${formatBytesGb(analysis.totalBytesPerGpu)}.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `A ${formatCount(analysis.modelParams)}B-param copy fits in one device's memory, so no model split is needed yet.`,
    });
  }

  if (analysis.needsDataParallel) {
    reasons.push({
      severity: analysis.communicationRatio > 1 ? 'danger' : analysis.communicationRatio > 0.7 ? 'warning' : 'ok',
      text: `${formatCount(
        analysis.gpuCount,
      )} GPUs replicate the model and all-reduce gradients each step over ${formatCount(
        analysis.interconnectBandwidth,
      )} GB/s links.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'A single GPU has no peers to synchronize with, so there are no collectives.',
    });
  }

  if (analysis.interconnectStrained) {
    reasons.push({
      severity: 'danger',
      text: `Collective traffic is saturating the ${formatCount(
        analysis.interconnectBandwidth,
      )} GB/s interconnect; faster NVLink/InfiniBand or a better topology is needed to stop comms dominating each step.`,
    });
  }

  if (analysis.needsActivationRecompute) {
    reasons.push({
      severity: analysis.activationCheckpointing ? 'ok' : 'warning',
      text: analysis.activationCheckpointing
        ? `Activation checkpointing trades ~30% extra compute to fit a ${formatCount(
            analysis.sequenceLength,
          )}-token context in memory.`
        : `A ${formatCount(
            analysis.sequenceLength,
          )}-token context pushes activation memory past the device; enable activation checkpointing to recompute instead of store.`,
    });
  }

  if (analysis.dataStarved) {
    reasons.push({
      severity: analysis.dataPipelineRatio > 1.5 ? 'danger' : 'warning',
      text: 'The data loaders cannot stream tokens fast enough to keep the mesh fed; scale the input pipeline or GPUs will stall.',
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Data loaders stream tokenized shards fast enough that the GPUs never wait on input.',
    });
  }

  if (analysis.needsCheckpointResilience) {
    reasons.push({
      severity: 'warning',
      text: `At ${formatCount(
        analysis.gpuCount,
      )} GPUs failures are routine; a ${formatCount(
        analysis.checkpointIntervalMin,
      )}-minute checkpoint interval plus automatic mesh restart bounds the lost work.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `Failures are rare at ${formatCount(
        analysis.gpuCount,
      )} GPUs, so periodic checkpoints are enough for recovery.`,
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    gpuCount: number;
    modelParams: number;
    interconnectBandwidth: number;
    checkpointIntervalMin: number;
    modelParallelDegree: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  const parallelismState: DecisionState = flags.needsModelSplit || flags.modelTooBigUnsharded
    ? 'needed'
    : flags.modelParallel
      ? 'tradeoff'
      : flags.needsDataParallel
        ? 'useful'
        : 'not-yet';

  return {
    parallelism: {
      state: parallelismState,
      copy: flags.modelTooBigUnsharded && !flags.modelParallel
        ? `A ${formatCount(flags.modelParams)}B model copy will not fit on one device — combine data parallel with tensor + pipeline parallel.`
        : flags.modelParallel
          ? `3D parallelism: ${formatCount(flags.modelParallelDegree)}-way tensor + pipeline holds a copy, data parallel replicates it across the rest.`
          : flags.needsDataParallel
            ? 'Data parallel only: each GPU holds a full copy and trains on a different batch slice.'
            : 'One GPU trains the whole model; no parallelism is needed yet.',
    },
    collectives: {
      state: flags.interconnectStrained ? 'tradeoff' : flags.needsCollectives ? 'needed' : 'not-yet',
      copy: flags.needsCollectives
        ? `Gradients sync via all-reduce over ${formatCount(flags.interconnectBandwidth)} GB/s links${flags.modelParallel ? '; tensor-parallel exchanges share the same fabric' : ''}.`
        : 'A single GPU has nothing to all-reduce.',
    },
    activation: {
      state: flags.activationCheckpointing ? 'tradeoff' : flags.needsActivationRecompute ? 'needed' : 'not-yet',
      copy: flags.activationCheckpointing
        ? 'Activation checkpointing recomputes activations in the backward pass to trade compute for memory.'
        : flags.needsActivationRecompute
          ? 'Activation memory is over budget — enable checkpointing to recompute instead of store.'
          : 'Activations fit comfortably, so recompute is not worth the extra compute yet.',
    },
    checkpointing: {
      state: flags.needsCheckpointResilience ? 'needed' : 'useful',
      copy: flags.needsCheckpointResilience
        ? `Frequent sharded checkpoints (every ${formatCount(flags.checkpointIntervalMin)} min) and automatic mesh restart bound lost work when nodes fail.`
        : 'Periodic checkpoints are enough; failures are rare at this scale.',
    },
    dataPipeline: {
      state: flags.dataStarved ? 'needed' : flags.needsDataParallel ? 'useful' : 'not-yet',
      copy: flags.dataStarved
        ? 'Scale data loaders and prefetch so streamed tokens never become the bottleneck.'
        : 'Loaders stream tokens fast enough to keep the mesh fed.',
    },
    interconnect: {
      state: flags.interconnectStrained ? 'needed' : flags.modelParallel ? 'tradeoff' : flags.needsCollectives ? 'useful' : 'not-yet',
      copy: flags.modelParallel
        ? 'Place tensor-parallel GPUs on the same node (NVLink) and run data-parallel all-reduce across nodes (InfiniBand).'
        : flags.needsCollectives
          ? 'A flat all-reduce topology is fine while only gradients cross the fabric.'
          : 'No interconnect topology to design for a single GPU.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsCollectives) {
    return 'Single-GPU training';
  }
  if (flags.needsCheckpointResilience && flags.modelParallel) {
    return '3D-parallel mesh with checkpoint + fault recovery';
  }
  if (flags.modelParallel) {
    return 'Tensor + pipeline + data parallel mesh';
  }
  return 'Data-parallel replicas with gradient all-reduce';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsCollectives) {
    return 'One GPU holds the whole model and optimizer state and trains directly. No parallelism, collectives, or recompute is justified yet.';
  }
  if (flags.needsCheckpointResilience && flags.modelParallel) {
    return 'A full 3D-parallel mesh shards each copy with tensor and pipeline parallelism and replicates it data-parallel, while frequent sharded checkpoints and automatic mesh restart keep a thousands-of-GPU run alive through routine failures.';
  }
  if (flags.modelParallel) {
    return 'The model is too big for one device, so tensor and pipeline parallelism split a copy across GPUs and data parallelism replicates that copy, with collectives carrying both gradient all-reduce and tensor-parallel exchanges.';
  }
  return 'Each GPU holds a full model copy and trains on a different batch slice, synchronizing gradients with an all-reduce every step over the interconnect.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsCollectives) {
    return 'Data -> loader -> single GPU';
  }
  if (flags.needsCheckpointResilience && flags.modelParallel) {
    return 'Loaders -> 3D mesh -> collectives -> checkpoint -> recover';
  }
  if (flags.modelParallel) {
    return 'Loaders -> tensor/pipeline mesh -> collectives -> checkpoint';
  }
  return 'Loaders -> data-parallel replicas -> all-reduce';
}

function formatBytesGb(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1_000) {
    return `${(gb / 1_000).toFixed(1)} TB`;
  }
  if (gb >= 10) {
    return `${Math.round(gb)} GB`;
  }
  return `${gb.toFixed(1)} GB`;
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
