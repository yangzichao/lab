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
  eyebrow: 'System Design Lab',
  title:
    'Real-time model serving is a throughput-vs-tail-latency problem: batching and GPUs buy capacity, but every gain spends part of your p99 budget.',
  summary:
    'Change request rate, per-request model latency, the batch window, how many replicas and how many models you host, and your p99 target. Toggle dynamic batching and GPU acceleration. The design moves from a single model endpoint to dynamic batching, GPU-backed autoscaling replicas, a model registry with canary rollout, and finally multi-model packing at high throughput.',
  controls: [
    {
      id: 'requestsPerSecond',
      label: 'Inference rate',
      help: 'Prediction requests arriving per second across all hosted models.',
      min: 1,
      max: 500_000,
      defaultValue: 200,
      scale: 'log',
      format: 'operations-per-second',
    },
    {
      id: 'modelLatencyMs',
      label: 'Model compute latency',
      help: 'Time for one forward pass of the model on a single request, before batching or queueing.',
      min: 1,
      max: 500,
      defaultValue: 20,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'batchWindowMs',
      label: 'Batch window',
      help: 'How long the server waits to collect requests into one batch. Larger windows raise throughput but add queueing delay.',
      min: 0,
      max: 100,
      defaultValue: 5,
      scale: 'linear',
      format: 'milliseconds',
    },
    {
      id: 'replicaCount',
      label: 'Model server replicas',
      help: 'Parallel model-server instances (GPU or CPU) the gateway can route across.',
      min: 1,
      max: 500,
      defaultValue: 2,
      scale: 'log',
      unit: 'replicas',
      format: 'count',
    },
    {
      id: 'modelsHosted',
      label: 'Models hosted',
      help: 'Distinct models (or versions) the platform serves concurrently.',
      min: 1,
      max: 500,
      defaultValue: 1,
      scale: 'log',
      unit: 'models',
      format: 'count',
    },
    {
      id: 'p99TargetMs',
      label: 'p99 latency target',
      help: 'End-to-end budget the 99th-percentile request must stay under, including queueing.',
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
      help: 'Coalesce concurrent requests into one padded batch to use the accelerator efficiently; trades a little latency for throughput.',
      defaultValue: true,
    },
    {
      id: 'gpuAcceleration',
      label: 'GPU acceleration',
      help: 'Run replicas on GPUs. Far higher throughput, but only paid off when requests can be batched.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'single-endpoint',
      step: '01',
      title: 'Single model endpoint',
      summary: 'One model, light traffic, one CPU replica.',
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
      summary: 'Traffic climbs; coalesce requests to use hardware.',
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
      summary: 'A heavier model needs GPUs and more replicas.',
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
      summary: 'Multiple versions roll out safely behind the router.',
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
      title: 'Multi-model at scale',
      summary: 'Many models, huge throughput, tight tail latency.',
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
    title: 'Model serving platform architecture diagram',
    description:
      'Whiteboard-style architecture diagram for a real-time model serving platform: clients, an inference gateway that routes and splits traffic, batching model-server replicas, a model registry and GPU pool, and an async metrics and shadow-traffic path.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'predict calls',
            summary: 'sends real-time feature vectors and waits for a prediction under a tight deadline',
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
            subtitle: 'route + version',
            summary: 'routes each request to the right model and version and enforces timeouts',
          },
          {
            id: 'trafficSplit',
            title: 'Traffic split',
            subtitle: 'canary + A/B',
            summary: 'sends a slice of traffic to a new version for canary and A/B comparison',
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
            subtitle: 'coalesce requests',
            summary: 'collects concurrent requests within a window into one padded batch',
          },
          {
            id: 'replicas',
            title: 'Server replicas',
            subtitle: 'autoscaled',
            summary: 'parallel model-server instances the gateway load-balances across',
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
            subtitle: 'versions + artifacts',
            summary: 'stores versioned model artifacts and the mapping of names to deployed versions',
          },
          {
            id: 'gpuPool',
            title: 'GPU pool',
            subtitle: 'accelerators',
            summary: 'pooled GPUs the replicas schedule onto for high-throughput inference',
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
            subtitle: 'p99 monitoring',
            summary: 'collects per-model latency and accuracy metrics off the hot path',
          },
          {
            id: 'shadow',
            title: 'Shadow traffic',
            subtitle: 'offline eval',
            summary: 'mirrors live requests to candidate models for evaluation without serving their output',
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
    { id: 'capacity', label: 'Serving capacity' },
    { id: 'tailLatency', label: 'p99 latency budget' },
    { id: 'gpuEfficiency', label: 'Accelerator efficiency' },
    { id: 'fleetSize', label: 'Replica fleet pressure' },
    { id: 'multiModel', label: 'Multi-model packing' },
  ],
  decisions: [
    { id: 'batching', title: 'Dynamic batching' },
    { id: 'hardware', title: 'Hardware + autoscaling' },
    { id: 'registry', title: 'Model registry' },
    { id: 'rollout', title: 'A/B + canary' },
    { id: 'packing', title: 'Multi-model packing' },
    { id: 'latencyTradeoff', title: 'p99 vs throughput' },
  ],
  sourceBackedRules: [
    {
      title: 'Dynamic batching trades latency for accelerator throughput',
      source: 'NVIDIA Triton Inference Server',
      url: 'https://github.com/triton-inference-server/server',
      summary:
        'Triton coalesces individual inference requests into a batch within a configurable delay so the GPU processes many requests per kernel launch, raising throughput at the cost of added queueing latency.',
    },
    {
      title: 'A serving system should version models and serve them behind a stable name',
      source: 'TensorFlow Serving',
      url: 'https://www.tensorflow.org/tfx/guide/serving',
      summary:
        'TF Serving loads versioned model artifacts from a registry/model store and can serve multiple versions of a model so traffic can move between versions without redeploying the server.',
    },
    {
      title: 'KServe provides canary rollout and autoscaling for inference',
      source: 'KServe',
      url: 'https://kserve.github.io/website/',
      summary:
        'KServe exposes a model-serving control plane with traffic splitting for canary rollouts and request-driven autoscaling (scale to and from zero) so replicas track load.',
    },
    {
      title: 'Tail latency, not the mean, governs interactive serving SLAs',
      source: 'The Tail at Scale (Dean & Barroso)',
      url: 'https://research.google/pubs/the-tail-at-scale/',
      summary:
        'In fan-out and high-throughput systems the 99th-percentile response time dominates user-visible latency, so capacity and batching must be sized against p99 rather than average latency.',
    },
  ],
  teachingAssumptions: [
    'Per-replica capacity is a teaching approximation: CPU sustains a small fixed ops/s, a GPU replica clears several times more, and batching multiplies throughput only when traffic is concurrent enough to fill a batch. Batch gain rises with both the window and the model latency, because heavier models amortize more kernel-launch and memory-transfer overhead per batched call.',
    'p99 is modeled as model compute time plus the batch window plus a queueing penalty that grows as utilization approaches saturation; the penalty is divided by a square-root-staffing factor in the replica count to approximate M/M/c rather than M/M/1, so spreading the same load over more replicas genuinely lowers the tail. Real tails also depend on GC, padding, and cold starts.',
    'Hosting many models is treated as needing either more replicas or model packing once distinct models exceed what one replica can hot-load without thrashing.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-model',
      step: '01',
      focus: 'One model, light load',
      scenarioId: 'single-endpoint',
      question:
        'A single ranking model takes 15 ms and gets 50 requests/s. Do you need batching, GPUs, or autoscaling?',
      reveal:
        'No. At 50 req/s a single CPU replica is far below saturation and the 15 ms compute fits a 200 ms p99 budget with room to spare. Batching would only add queueing delay, and a GPU would sit idle. Ship one endpoint behind one replica.',
      takeaway: 'Start with one replica and no batching; add machinery only when load or the p99 budget demands it.',
    },
    {
      id: 'batch-it',
      step: '02',
      focus: 'Traffic 60x',
      scenarioId: 'batching',
      question:
        'Traffic jumps to 3k req/s on the same CPU model. Adding replicas one-for-one is expensive — what cheaper lever raises throughput first?',
      reveal:
        'Dynamic batching. With enough concurrent requests, coalescing them into one padded batch amortizes per-call overhead and lets each replica clear several times more work. The cost is the batch window added to latency, so the window must stay small against the p99 target.',
      takeaway: 'Batching buys throughput from concurrency you already have, but every millisecond of window is spent from p99.',
    },
    {
      id: 'go-gpu',
      step: '03',
      focus: 'Heavier model',
      scenarioId: 'gpu-autoscale',
      question:
        'The model grows to 60 ms and traffic hits 25k req/s. Batching on CPU is no longer enough — do you just keep adding CPU replicas?',
      reveal:
        'A heavy, batchable model is exactly what GPUs are for: batched GPU inference clears far more per replica than CPU, so you move to GPUs and let an autoscaler track load. GPUs only pay off because batching keeps them busy — an unbatched GPU is wasted money.',
      takeaway: 'GPUs + autoscaling scale heavy batchable models; without batching the accelerator is underused.',
    },
    {
      id: 'versions',
      step: '04',
      focus: 'Many versions, safe rollout',
      scenarioId: 'registry-canary',
      question:
        'You now host 8 models/versions and want to ship a new one without risking a regression. How does traffic reach the right version safely?',
      reveal:
        'A model registry stores versioned artifacts and the name-to-version mapping; the gateway routes by name and splits a small canary slice (or A/B arms) to the new version while shadow traffic evaluates candidates offline. You promote only after metrics confirm the new version, with instant rollback by flipping the split.',
      takeaway: 'A registry plus traffic splitting turns model releases into reversible canaries, not redeploys.',
    },
    {
      id: 'pack-it',
      step: '05',
      focus: 'Many models at scale',
      scenarioId: 'multi-model-scale',
      question:
        '120 models at 300k req/s with a 50 ms p99. A dedicated GPU fleet per model is bankrupting — how do you serve them all under tail latency?',
      reveal:
        'Pack multiple models per replica/GPU and let the gateway route by model, so idle models share hardware instead of each holding a reserved fleet. At a tight 50 ms p99 the batch window must shrink and utilization headroom must grow, so you trade some batch efficiency back to protect the tail.',
      takeaway: 'At scale, multi-model packing reclaims idle accelerators, but a tight p99 caps how aggressively you can batch and pack.',
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
          ? `Demand is ${Math.round(utilization * 100)}% of fleet capacity; replicas saturate and the tail blows up.`
          : `The fleet sustains the load at about ${Math.round(utilization * 100)}% utilization.`,
      },
      tailLatency: {
        ratio: estimatedP99Ms / Math.max(1, p99TargetMs),
        valueText: `~${Math.round(estimatedP99Ms)} / ${Math.round(p99TargetMs)} ms`,
        copy: tailMissed
          ? `Estimated p99 of ${Math.round(estimatedP99Ms)} ms breaches the ${Math.round(p99TargetMs)} ms budget; shrink the batch window or add capacity.`
          : `Estimated p99 of ${Math.round(estimatedP99Ms)} ms fits inside the ${Math.round(p99TargetMs)} ms budget.`,
      },
      gpuEfficiency: {
        ratio: gpuAcceleration ? (batchActive ? 0.85 : 1.4) : needsGpu ? 1.2 : 0.3,
        valueText: gpuAcceleration ? (batchActive ? `${Math.round(batchMultiplier * 10) / 10}x batched` : 'unbatched') : 'CPU',
        copy: gpuAcceleration
          ? batchActive
            ? `Batching fills the GPU at roughly ${Math.round(batchMultiplier * 10) / 10}x per replica.`
            : 'A GPU without batching is mostly idle — turn on dynamic batching to pay for it.'
          : needsGpu
            ? 'A heavy model at this rate wants a GPU; CPU replicas will not keep up.'
            : 'CPU replicas are fine for this light, fast model.',
      },
      fleetSize: {
        ratio: replicaCount / 100,
        valueText: `${formatCount(replicaCount)} ${replicaCount === 1 ? 'replica' : 'replicas'}`,
        copy: needsAutoscale
          ? `A fleet of ${formatCount(replicaCount)} replicas needs an autoscaler tracking request load.`
          : 'A small static replica count is enough for this load.',
      },
      multiModel: {
        ratio: packingPressure,
        valueText: `${formatCount(modelsHosted)} ${modelsHosted === 1 ? 'model' : 'models'}`,
        copy: needsPacking
          ? `${formatCount(modelsHosted)} models across ${formatCount(replicaCount)} replicas forces packing multiple models per replica.`
          : `${formatCount(modelsHosted)} ${modelsHosted === 1 ? 'model fits' : 'models fit'} comfortably on the fleet.`,
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
      text: `${formatRate(a.requestsPerSecond)} ops/s is ${Math.round(a.utilization * 100)}% of a ${formatRate(
        a.fleetCapacity,
      )} ops/s fleet; add replicas, GPUs, or batching before the tail collapses.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `The fleet absorbs ${formatRate(a.requestsPerSecond)} ops/s at ${Math.round(a.utilization * 100)}% utilization with headroom.`,
    });
  }

  if (a.tailMissed) {
    reasons.push({
      severity: 'danger',
      text: `Estimated p99 of ${Math.round(a.estimatedP99Ms)} ms exceeds the ${Math.round(
        a.p99TargetMs,
      )} ms target; queueing near saturation and the batch window are the usual culprits.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `Estimated p99 of ${Math.round(a.estimatedP99Ms)} ms fits the ${Math.round(a.p99TargetMs)} ms budget.`,
    });
  }

  if (a.dynamicBatching) {
    reasons.push({
      severity: a.batchActive ? 'ok' : 'warning',
      text: a.batchActive
        ? `Dynamic batching with a ${Math.round(a.batchWindowMs)} ms window amortizes accelerator cost across concurrent requests.`
        : 'Dynamic batching is on but the batch window is 0 ms, so no requests are coalesced — set a window.',
    });
  } else if (a.needsBatching) {
    reasons.push({
      severity: 'warning',
      text: `At ${formatRate(a.requestsPerSecond)} ops/s, coalescing requests into batches would raise per-replica throughput sharply.`,
    });
  }

  if (a.gpuAcceleration && !a.batchActive) {
    reasons.push({
      severity: 'warning',
      text: 'GPUs are enabled without effective batching, so the accelerator runs far below its throughput potential.',
    });
  } else if (a.needsGpu) {
    reasons.push({
      severity: 'warning',
      text: `A ${Math.round(a.modelLatencyMs)} ms model at this rate is a batchable, compute-heavy workload that GPUs serve far more cheaply than CPUs.`,
    });
  }

  if (a.needsCanary) {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(a.modelsHosted)} models/versions need a registry plus canary/A-B traffic splitting to roll out safely with instant rollback.`,
    });
  }

  if (a.needsPacking) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(a.modelsHosted)} models over ${formatCount(
        a.replicaCount,
      )} replicas means packing multiple models per accelerator instead of a dedicated fleet each.`,
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
            ? `A ${formatCount(a.replicaCount)}-replica fleet at this load needs a request-driven autoscaler so capacity tracks demand instead of a fixed count.`
            : `A small fleet of ${formatCount(a.replicaCount)} replicas comfortably covers this load with a static count.`,
        }
      : {
          severity: 'ok',
          text: 'A single replica covers this load, so there is no fleet to autoscale or load-balance across yet.',
        };

  const headroomMs = a.p99TargetMs - a.estimatedP99Ms;
  const headroomReason: LabReason = a.tightTail
    ? {
        severity: 'warning',
        text: `A tight ${Math.round(a.p99TargetMs)} ms p99 leaves only ${Math.round(
          Math.max(0, headroomMs),
        )} ms of headroom, so the batch window has to stay small and utilization headroom has to grow.`,
      }
    : {
        severity: 'ok',
        text: `Roughly ${Math.round(Math.max(0, headroomMs))} ms of slack sits under the ${Math.round(
          a.p99TargetMs,
        )} ms p99 budget, leaving room to widen the batch window for more throughput.`,
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
          ? `Coalesce requests within a ${Math.round(d.batchWindowMs)} ms window so each accelerator call clears many requests.`
          : 'Batching is on but the window is 0 ms; widen the window so requests actually batch.'
        : d.needsBatching
          ? 'Turn on dynamic batching to lift throughput before paying for more replicas.'
          : 'No batching yet — load is low enough that the added queueing delay is not worth it.',
    },
    hardware: {
      state: d.gpuAcceleration ? 'needed' : d.needsGpu ? 'needed' : d.needsAutoscale ? 'useful' : 'not-yet',
      copy: d.gpuAcceleration
        ? 'GPU replicas behind a request-driven autoscaler scale the heavy batchable workload.'
        : d.needsGpu
          ? 'Move the heavy model to GPUs; CPU replicas cannot meet this throughput affordably.'
          : d.needsAutoscale
            ? 'Keep CPU replicas but add an autoscaler so the fleet tracks request load.'
            : 'A single static CPU replica is enough for now.',
    },
    registry: {
      state: d.needsRegistry ? 'needed' : 'not-yet',
      copy: d.needsRegistry
        ? 'Store versioned artifacts in a model registry and route by name so versions move without redeploys.'
        : 'A single model can ship without a full registry, though versioning is still good hygiene.',
    },
    rollout: {
      state: d.needsCanary ? 'needed' : d.needsRegistry ? 'useful' : 'not-yet',
      copy: d.needsCanary
        ? 'Split a canary/A-B slice to new versions and mirror shadow traffic before promoting, with instant rollback.'
        : d.needsRegistry
          ? 'With two versions you can already canary new releases behind the gateway split.'
          : 'One version means rollout is just a deploy; no traffic splitting needed yet.',
    },
    packing: {
      state: d.needsPacking ? 'needed' : d.modelsHosted > 1 ? 'useful' : 'not-yet',
      copy: d.needsPacking
        ? 'Pack multiple models per replica/GPU and route by model so idle models share hardware.'
        : d.modelsHosted > 1
          ? 'A few models can each get replicas; packing only pays once models outnumber the fleet.'
          : 'A single model owns the fleet, so packing is irrelevant.',
    },
    latencyTradeoff: {
      state: d.tightTail ? 'tradeoff' : d.estimatedP99Ms > d.p99TargetMs ? 'needed' : 'useful',
      copy: d.tightTail
        ? `A tight ${Math.round(d.p99TargetMs)} ms p99 caps the batch window and demands utilization headroom, trading some throughput for the tail.`
        : d.estimatedP99Ms > d.p99TargetMs
          ? 'The current p99 misses the target; shrink the batch window or add capacity to recover the tail.'
          : 'There is slack between estimated p99 and the target, so throughput levers have room to push.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (!flags.needsBatching && !flags.needsGpu && !flags.needsRegistry && !flags.needsAutoscale) {
    return 'Single model endpoint';
  }
  if (flags.needsPacking) {
    return 'Multi-model packed fleet + canary rollout';
  }
  if (flags.needsRegistry && flags.needsGpu) {
    return 'GPU autoscaling fleet + registry + canary';
  }
  if (flags.needsGpu) {
    return 'GPU + dynamic batching + autoscaling';
  }
  if (flags.needsBatching) {
    return 'Dynamic batching on CPU replicas';
  }
  return 'Single model endpoint';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (!flags.needsBatching && !flags.needsGpu && !flags.needsRegistry && !flags.needsAutoscale) {
    return 'One model server replica resolves every prediction directly. Batching, GPUs, a registry, and autoscaling are all premature at this load.';
  }
  if (flags.needsPacking) {
    return 'Many models share a packed GPU fleet routed by name, with canary/A-B splits and shadow traffic for safe rollout, while a tight p99 caps how aggressively requests batch.';
  }
  if (flags.needsRegistry && flags.needsGpu) {
    return 'A registry holds versioned artifacts that the gateway routes and canaries onto an autoscaling GPU fleet, with dynamic batching keeping the accelerators busy.';
  }
  if (flags.needsGpu) {
    return 'A heavy, batchable model runs on an autoscaling GPU fleet, with dynamic batching filling the accelerators and the gateway load-balancing replicas.';
  }
  if (flags.needsBatching) {
    return 'Dynamic batching coalesces concurrent requests across a handful of CPU replicas to raise throughput without yet paying for GPUs.';
  }
  return 'One model server still covers the workload.';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.needsBatching && !flags.needsGpu && !flags.needsRegistry && !flags.needsAutoscale) {
    return 'Predict -> gateway -> single replica';
  }
  if (flags.needsPacking) {
    return 'Predict -> gateway (route + canary) -> packed GPU fleet -> registry';
  }
  if (flags.needsRegistry && flags.needsGpu) {
    return 'Predict -> gateway -> batcher -> GPU replicas -> registry';
  }
  if (flags.needsGpu) {
    return 'Predict -> gateway -> batcher -> GPU replicas';
  }
  if (flags.needsBatching) {
    return 'Predict -> gateway -> batcher -> CPU replicas';
  }
  return 'Predict -> gateway -> single replica';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
