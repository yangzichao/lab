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
  eyebrow: '系统设计 Lab',
  title:
    'LLM pretraining 受限于 GPU memory 和 GPU 间的 communication；两者都逼着你把模型切分到很多加速器上。',
  summary:
    '调整模型 parameter 数、GPU 数、global batch、sequence length、interconnect 带宽、checkpoint 间隔。设计会从单块 GPU 演进到带 all-reduce 的 data parallelism，再到为装下一个对单设备太大的模型而上的 tensor 和 pipeline parallelism，再到带 activation checkpointing 的完整 3D parallelism，最后到上千块 GPU——它们既要快的 collective，又要频繁的 checkpoint-and-recover。',
  controls: [
    {
      id: 'modelParams',
      label: '模型 parameter 数',
      help: '总的可训练 parameter 数。weights + gradients + optimizer state 决定了每设备的 memory 下限。',
      min: 0.1,
      max: 1_000,
      defaultValue: 3,
      scale: 'log',
      unit: 'B params',
      format: 'count',
    },
    {
      id: 'gpuCount',
      label: 'GPU 数',
      help: 'training mesh 里的加速器数量，会拆成 data x tensor x pipeline 的并行组。',
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
      help: '整个 mesh 上每个 optimizer step 处理的 token 数。batch 越大，需要的 activation memory 和 data throughput 越多。',
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
      help: '以 token 计的 context window。activation memory 随 sequence length 增长。',
      min: 512,
      max: 131_072,
      defaultValue: 4_096,
      scale: 'log',
      unit: 'tokens',
      format: 'count',
    },
    {
      id: 'interconnectBandwidth',
      label: 'Interconnect 带宽',
      help: '每块 GPU 的 collective 带宽（节点内是 NVLink，跨节点是 InfiniBand）。gradient all-reduce 和 tensor-parallel 流量都跑在它上面。',
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
      help: 'data loader 每秒能 stream 的 token 数（从 object storage 来的 tokenized shard）。必须喂得上整个 mesh。',
      min: 100_000,
      max: 200_000_000,
      defaultValue: 5_000_000,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'checkpointIntervalMin',
      label: 'Checkpoint 间隔',
      help: '两次完整 checkpoint 之间的计算分钟数。间隔越短，故障时丢的工作越少，但花的 store 带宽越多。',
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
      help: '把每一层 split 到多块 GPU 上（tensor），再把层切成多个 stage（pipeline），这样一个比单设备大的模型也能训练。',
      defaultValue: false,
    },
    {
      id: 'activationCheckpointing',
      label: 'Activation checkpointing',
      help: '在 backward pass 里重算 activation，而不是把它们存下来，用额外计算换大幅更低的 memory。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-gpu',
      step: '01',
      title: 'Single GPU',
      summary: '一个小模型，装进一块加速器还绰绰有余。',
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
      summary: '模型每设备仍能装下，靠 replicate 在更多 data 上更快训练。',
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
      title: '单块 GPU 装不下',
      summary: '模型不再能装进单设备，逼着上 tensor 和 pipeline 切分。',
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
      summary: '长 context 加大模型，即使切分了 memory 也会突破上限。',
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
      title: '上千块 GPU',
      summary: '一次 frontier run，故障是家常便饭，checkpoint-recover 主导 resilience。',
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
    title: 'LLM pretraining 基础设施图',
    description:
      '大规模 LLM pretraining 的白板风格架构图：放在 object storage 里的训练 dataset、sharded data loader、由 data/tensor/pipeline 组构成的 3D-parallel training mesh、collective-communication fabric 和 checkpoint store，以及异步的 metrics 和 fault recovery。',
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
            summary: '存在 object storage 里的 tokenized 训练 shard，run 期间被 stream 出来',
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
            summary: 'prefetch、shuffle 并打包 token batch，让 GPU 永远不会等输入',
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
            summary: '每个 replica 在 batch 的一片上训练，每步对 gradient 做 all-reduce',
          },
          {
            id: 'tensorParallel',
            title: 'Tensor-parallel',
            subtitle: 'split layers',
            kind: 'gpu',
            summary: '把每层矩阵 split 到多块 GPU 上，它们在节点内交换 activation',
          },
          {
            id: 'pipelineParallel',
            title: 'Pipeline-parallel',
            subtitle: 'layer stages',
            kind: 'gpu',
            summary: '把连续的层 stage 分配给各 GPU，在它们之间 stream micro-batch',
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
            summary: 'NVLink 和 InfiniBand 承载 gradient all-reduce 和 tensor-parallel 交换',
          },
          {
            id: 'checkpointStore',
            title: 'Checkpoint store',
            subtitle: 'sharded state',
            kind: 'objectstore',
            summary: '持久化 sharded 的 weights 和 optimizer state，好让 run 在故障后能恢复',
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
            summary: '在训练热路径之外记录 loss、throughput 和硬件健康状况',
          },
          {
            id: 'faultRecovery',
            title: 'Fault recovery',
            subtitle: 'restart mesh',
            kind: 'scheduler',
            summary: '检测挂掉的节点，并从最新的 checkpoint 重启 mesh',
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
    { id: 'deviceMemory', label: '每 GPU memory 压力' },
    { id: 'communication', label: 'Collective comms 负载' },
    { id: 'dataPipeline', label: 'Data pipeline 负载' },
    { id: 'activationMemory', label: 'Activation memory' },
    { id: 'checkpointResilience', label: 'Checkpoint / 故障暴露' },
  ],
  decisions: [
    { id: 'parallelism', title: 'Parallelism 策略' },
    { id: 'collectives', title: 'Gradient sync / collectives' },
    { id: 'activation', title: 'Activation memory' },
    { id: 'checkpointing', title: 'Checkpoint + fault tolerance' },
    { id: 'dataPipeline', title: 'Data pipeline throughput' },
    { id: 'interconnect', title: 'Interconnect topology' },
  ],
  sourceBackedRules: [
    {
      title: 'Tensor parallelism 把每层 split 到多块 GPU，训练对单设备太大的模型',
      source: 'Megatron-LM',
      url: 'https://github.com/NVIDIA/Megatron-LM',
      summary:
        'Megatron-LM 把 attention 和 MLP 矩阵切分到多块 GPU 上，让单个 transformer 层在合起来的设备 memory 里装得下，并通过快速的节点内 interconnect 交换 activation。',
    },
    {
      title: 'ZeRO 把 optimizer state、gradient、parameter 都 shard 开，降低每 GPU 的 memory 下限',
      source: 'DeepSpeed ZeRO (arXiv:1910.02054)',
      url: 'https://arxiv.org/abs/1910.02054',
      summary:
        '标准 data parallelism 会在每块 GPU 上复制完整的约 16 bytes/param 的 optimizer state；ZeRO 把这份 state 切分到各 data-parallel rank 上，让 memory 随设备数大致线性下降。',
    },
    {
      title: 'Pipeline parallelism 把层切成 stage，用 micro-batch 重叠让 GPU 忙起来',
      source: 'GPipe (arXiv:1811.06965)',
      url: 'https://arxiv.org/abs/1811.06965',
      summary:
        'GPipe 把连续的层 stage 分配给不同加速器，并让 micro-batch 流水穿过它们，配合 re-materialization（activation recompute）来约束每个 stage 的 activation memory。',
    },
    {
      title: '把 tensor、pipeline、data parallelism 组合起来，能把 transformer 训练扩到上千块 GPU',
      source: 'Megatron-LM scaling (arXiv:1909.08053)',
      url: 'https://arxiv.org/abs/1909.08053',
      summary:
        '高效的大模型训练把这三个 parallelism 维度组合起来（3D parallelism），把高带宽的 tensor-parallel 流量放在节点内，把较低带宽的 data-parallel all-reduce 放到跨节点。',
    },
  ],
  teachingAssumptions: [
    'memory 被建模成约 16 bytes/param（涵盖 weights、gradients、Adam optimizer state），再加一项随 batch 和 sequence length 增长的 activation 项；真实框架会随精度和 ZeRO sharding 变化。',
    '每 GPU memory 是一个固定的教学数字（80 GB），collective/data 的阈值都是凑整的数，不是 vendor benchmark。',
    'failure rate 被近似成与 GPU 数成正比，所以预期损失的工作量随 fleet 规模和 checkpoint 间隔一起放大。',
  ],
  teachingWalkthrough: [
    {
      id: 'fits-on-one',
      step: '01',
      focus: '装得进一块 GPU',
      scenarioId: 'single-gpu',
      question:
        '一个 1.5B 参数的模型在一块加速器上训练。你需要任何 parallelism、collective 或 recompute 吗？',
      reveal:
        '不需要。按约 16 bytes/param 算，1.5B 参数的 weights、gradient、optimizer state 需要约 24 GB——远低于一块 80 GB 设备——而且只有一块 GPU，没什么可 all-reduce 的。parallelism 和 activation checkpointing 只会徒增复杂度和开销，却没有任何约束要去缓解。',
      takeaway: '只要模型和一个 batch 装得进一块 GPU，最简单又正确的配置就是单设备、不要 collective。',
    },
    {
      id: 'replicate-and-reduce',
      step: '02',
      focus: 'Replicate，all-reduce',
      scenarioId: 'data-parallel',
      question:
        '一个 3B 模型每设备仍能装下，但你想在多得多的 token 上训练。怎么在不改模型布局的前提下用上 64 块 GPU？',
      reveal:
        'Data parallelism：把整个模型在每块 GPU 上 replicate，给每块一片不同的 global batch，每步对 gradient 做 all-reduce，让所有 replica 保持同步。瓶颈从 memory 转到了 gradient all-reduce，它的流量随 parameter 数增长，并受 interconnect 带宽限制。',
      takeaway: 'data parallelism 靠 replicate 模型来扩 throughput；新的瓶颈是 gradient all-reduce。',
    },
    {
      id: 'too-big',
      step: '03',
      focus: '把模型切开',
      scenarioId: 'tensor-pipeline',
      question:
        '一个 70B 模型光 weights 和 optimizer state 就要约 1.1 TB——远超一块 80 GB 的 GPU。光靠 data parallelism 能解决吗？',
      reveal:
        '不能。data parallelism 复制的是完整模型，所以当一份副本都装不下时它帮不上忙。你必须把模型本身切开：tensor parallelism 把每层切分到多块 GPU 上（节点内流量很重，所以走 NVLink），pipeline parallelism 把层切成 stage 跨节点分布。两者组合起来让一份副本能装进合起来的 memory。',
      takeaway: '当一份模型副本在单设备上装不下时，你必须用 tensor 和 pipeline parallelism 把模型 shard 开。',
    },
    {
      id: 'recompute',
      step: '04',
      focus: '重算 activation',
      scenarioId: 'three-d-parallel',
      question:
        '到了 175B 参数加 32k token 的 context，就算 weights 已经 shard 过，余量也很小，activation 还会爆。在买更多 GPU 之前，还剩什么 memory 杠杆？',
      reveal:
        'Activation checkpointing（re-materialization）：只存少数几个层边界，其余的在 backward pass 里重算，用约 30% 的额外计算换 activation memory 的大幅下降。再配合 3D parallelism（data x tensor x pipeline），就能让长 context、上千亿参数的模型装得下。',
      takeaway: 'activation checkpointing 用计算换 memory，是 weights 已经 shard 之后的关键杠杆。',
    },
    {
      id: 'fault-tolerance',
      step: '05',
      focus: '故障是家常便饭',
      scenarioId: 'thousands-of-gpus',
      question:
        '在 12,000 块 GPU 上，硬件故障频繁发生。在 15 分钟的 checkpoint 间隔下，决定 run 能不能按时跑完的主导因素是什么？',
      reveal:
        'Checkpoint-and-recover。在上千块 GPU 的规模下，故障间平均时间会降到几个小时，所以 run 会不断从上一个 checkpoint 重启。频繁、sharded、写得快的 checkpoint 再加上自动 mesh restart，能约束损失的工作量；collective fabric 也必须在这个规模下扛住 all-reduce，不能成为瓶颈。',
      takeaway: '到了上千块 GPU，fault tolerance——频繁 checkpoint 加快速恢复——决定 run 能不能跑完。',
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
          ? `weights 和 optimizer state 被 ${formatCount(modelParallelDegree)}-way model parallel 切分；每块 GPU 大约持有 ${formatBytesGb(totalBytesPerGpu)}。`
          : `一份完整模型副本加上 activation，每块 GPU 大约需要 ${formatBytesGb(totalBytesPerGpu)}，而设备只有 ${formatBytesGb(bytesPerGpuMemory)}。`,
      },
      communication: {
        ratio: communicationRatio,
        valueText: `${allReduceTimeSeconds.toFixed(2)} s/step`,
        copy: needsCollectives
          ? `Gradient all-reduce 在 ${formatCount(interconnectBandwidth)} GB/s 的链路上搬运约 ${gradientGb.toFixed(0)} GB${modelParallel ? '，此外还有 tensor-parallel 交换' : ''}。`
          : '单块 GPU 没什么要同步的，所以没有 collective 流量。',
      },
      dataPipeline: {
        ratio: dataPipelineRatio,
        valueText: `${formatRate(tokensConsumedPerSecond)} / ${formatRate(dataThroughput)} tok/s`,
        copy: dataStarved
          ? 'mesh 消费 token 的速度快过 loader 能 stream 的速度；GPU 会卡住等输入。'
          : 'data loader stream token 的速度足够喂饱整个 mesh。',
      },
      activationMemory: {
        ratio: activationRatio,
        valueText: formatBytesGb(activationBytesPerGpu),
        copy: activationCheckpointing
          ? 'Activation checkpointing 在 backward pass 里重算大部分 activation，把这部分 memory 砍掉约 5 倍。'
          : `一个 ${formatCount(sequenceLength)} token 的 context 加上这个 batch，activation 每块 GPU 大约消耗 ${formatBytesGb(activationBytesPerGpu)}。`,
      },
      checkpointResilience: {
        ratio: checkpointResilienceRatio,
        valueText: `~${(lostWorkExposure * 60).toFixed(0)} min lost/restart`,
        copy: needsCheckpointResilience
          ? `${formatCount(gpuCount)} 块 GPU 经常出故障；${formatCount(checkpointIntervalMin)} 分钟的间隔加上约 ${checkpointWriteSeconds.toFixed(0)} s 的写入，约束了每次重启损失的工作量。`
          : `在 ${formatCount(gpuCount)} 块 GPU 上故障很少，所以 ${formatCount(checkpointIntervalMin)} 分钟的 checkpoint 间隔绰绰有余。`,
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
      text: `一个 ${formatCount(analysis.modelParams)}B 参数的模型每块 GPU 需要约 ${formatBytesGb(
        analysis.totalBytesPerGpu,
      )}，在单设备上装不下；打开 tensor + pipeline parallel 把它切开。`,
    });
  } else if (analysis.modelParallel) {
    reasons.push({
      severity: analysis.deviceMemoryRatio > 1 ? 'danger' : analysis.deviceMemoryRatio > 0.7 ? 'warning' : 'ok',
      text: `Tensor + pipeline parallel 把模型 ${formatCount(
        analysis.modelParallelDegree,
      )}-way 切分，让每块 GPU 大约持有 ${formatBytesGb(analysis.totalBytesPerGpu)}。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `一份 ${formatCount(analysis.modelParams)}B 参数的副本能装进单设备的 memory，所以还不需要切分模型。`,
    });
  }

  if (analysis.needsDataParallel) {
    reasons.push({
      severity: analysis.communicationRatio > 1 ? 'danger' : analysis.communicationRatio > 0.7 ? 'warning' : 'ok',
      text: `${formatCount(
        analysis.gpuCount,
      )} 块 GPU 复制模型，并每步在 ${formatCount(
        analysis.interconnectBandwidth,
      )} GB/s 的链路上对 gradient 做 all-reduce。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '单块 GPU 没有 peer 要同步，所以没有 collective。',
    });
  }

  if (analysis.interconnectStrained) {
    reasons.push({
      severity: 'danger',
      text: `Collective 流量正在打满 ${formatCount(
        analysis.interconnectBandwidth,
      )} GB/s 的 interconnect；需要更快的 NVLink/InfiniBand 或更好的 topology，才能让 comms 不再主导每一步。`,
    });
  }

  if (analysis.needsActivationRecompute) {
    reasons.push({
      severity: analysis.activationCheckpointing ? 'ok' : 'warning',
      text: analysis.activationCheckpointing
        ? `Activation checkpointing 用约 30% 的额外计算，把一个 ${formatCount(
            analysis.sequenceLength,
          )} token 的 context 塞进 memory。`
        : `一个 ${formatCount(
            analysis.sequenceLength,
          )} token 的 context 把 activation memory 推过了设备上限；打开 activation checkpointing 用重算代替存储。`,
    });
  }

  if (analysis.dataStarved) {
    reasons.push({
      severity: analysis.dataPipelineRatio > 1.5 ? 'danger' : 'warning',
      text: 'data loader stream token 的速度跟不上喂饱 mesh；扩大输入 pipeline，否则 GPU 会卡住。',
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'data loader stream tokenized shard 的速度够快，GPU 永远不会等输入。',
    });
  }

  if (analysis.needsCheckpointResilience) {
    reasons.push({
      severity: 'warning',
      text: `在 ${formatCount(
        analysis.gpuCount,
      )} 块 GPU 上故障是家常便饭；${formatCount(
        analysis.checkpointIntervalMin,
      )} 分钟的 checkpoint 间隔加上自动 mesh restart，约束了损失的工作量。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `在 ${formatCount(
        analysis.gpuCount,
      )} 块 GPU 上故障很少，所以定期 checkpoint 就足够恢复了。`,
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
        ? `一份 ${formatCount(flags.modelParams)}B 的模型副本在单设备上装不下——把 data parallel 和 tensor + pipeline parallel 组合起来。`
        : flags.modelParallel
          ? `3D parallelism：${formatCount(flags.modelParallelDegree)}-way 的 tensor + pipeline 持有一份副本，data parallel 在其余 GPU 上把它复制开。`
          : flags.needsDataParallel
            ? 'Data parallel only：每块 GPU 持有一份完整副本，在不同的 batch 切片上训练。'
            : '一块 GPU 训练整个模型；还不需要任何 parallelism。',
    },
    collectives: {
      state: flags.interconnectStrained ? 'tradeoff' : flags.needsCollectives ? 'needed' : 'not-yet',
      copy: flags.needsCollectives
        ? `Gradient 在 ${formatCount(flags.interconnectBandwidth)} GB/s 的链路上通过 all-reduce 同步${flags.modelParallel ? '；tensor-parallel 交换共用同一套 fabric' : ''}。`
        : '单块 GPU 没什么可 all-reduce 的。',
    },
    activation: {
      state: flags.activationCheckpointing ? 'tradeoff' : flags.needsActivationRecompute ? 'needed' : 'not-yet',
      copy: flags.activationCheckpointing
        ? 'Activation checkpointing 在 backward pass 里重算 activation，用计算换 memory。'
        : flags.needsActivationRecompute
          ? 'Activation memory 超预算了——打开 checkpointing 用重算代替存储。'
          : 'activation 装得很宽裕，所以暂时不值得为重算多付计算。',
    },
    checkpointing: {
      state: flags.needsCheckpointResilience ? 'needed' : 'useful',
      copy: flags.needsCheckpointResilience
        ? `频繁的 sharded checkpoint（每 ${formatCount(flags.checkpointIntervalMin)} 分钟一次）加上自动 mesh restart，约束了节点故障时损失的工作量。`
        : '定期 checkpoint 就够了；在这个规模下故障很少。',
    },
    dataPipeline: {
      state: flags.dataStarved ? 'needed' : flags.needsDataParallel ? 'useful' : 'not-yet',
      copy: flags.dataStarved
        ? '扩大 data loader 和 prefetch，让 stream 出来的 token 永远不会成为瓶颈。'
        : 'loader stream token 的速度足够喂饱整个 mesh。',
    },
    interconnect: {
      state: flags.interconnectStrained ? 'needed' : flags.modelParallel ? 'tradeoff' : flags.needsCollectives ? 'useful' : 'not-yet',
      copy: flags.modelParallel
        ? '把 tensor-parallel 的 GPU 放在同一节点（NVLink），把 data-parallel all-reduce 跑在跨节点（InfiniBand）。'
        : flags.needsCollectives
          ? '只有 gradient 穿过 fabric 时，一个扁平的 all-reduce topology 就够用。'
          : '单块 GPU 没有 interconnect topology 要设计。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsCollectives) {
    return 'Single-GPU 训练';
  }
  if (flags.needsCheckpointResilience && flags.modelParallel) {
    return '3D-parallel mesh + checkpoint + fault recovery';
  }
  if (flags.modelParallel) {
    return 'Tensor + pipeline + data parallel mesh';
  }
  return '带 gradient all-reduce 的 data-parallel replica';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsCollectives) {
    return '一块 GPU 持有整个模型和 optimizer state，直接训练。还不需要任何 parallelism、collective 或 recompute。';
  }
  if (flags.needsCheckpointResilience && flags.modelParallel) {
    return '一套完整的 3D-parallel mesh 用 tensor 和 pipeline parallelism 把每份副本 shard 开，再 data-parallel 地复制它，同时频繁的 sharded checkpoint 加自动 mesh restart 让一次上千块 GPU 的 run 能在家常便饭般的故障中存活。';
  }
  if (flags.modelParallel) {
    return '模型对单设备来说太大，所以 tensor 和 pipeline parallelism 把一份副本切分到多块 GPU 上，再由 data parallelism 复制这份副本，collective 同时承载 gradient all-reduce 和 tensor-parallel 交换。';
  }
  return '每块 GPU 持有一份完整模型副本，在不同的 batch 切片上训练，每步通过 interconnect 上的 all-reduce 同步 gradient。';
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
