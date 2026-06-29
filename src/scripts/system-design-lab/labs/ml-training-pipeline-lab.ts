import { buildColumnDiagram } from '../diagram-layout';
import {
  formatCount,
  formatStorageGigabytes,
} from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative single-node / small-team teaching budgets (not vendor limits).
const jobsPerNotebookPerDay = 8;
const jobsPerSchedulerPerDay = 400;
const datasetGbPerSingleNode = 200;
const gpusPerSingleHost = 8;
const experimentsPerSpreadsheet = 50;
const modelParamsPerSingleGpu = 1_000_000_000;
const stagesPerAdHocScript = 3;
// Whole-cluster scale-out budget the GPU-capacity meter is normalized against.
const clusterScaleOutBudget = 256;
// Rough single-host step time used to estimate a per-run training-time signal.
const secondsPerStepBase = 0.4;

export const mlTrainingPipelineLabDefinition: SystemDesignLabDefinition = {
  id: 'ml-training-pipeline',
  eyebrow: '系统设计 Lab',
  title:
    'ML 训练平台一开始只是一个 notebook，然后围绕它把整个生命周期长出来：pipeline、tracking、一个 cluster、还有一个 registry。',
  summary:
    '调整每天的训练 job 数、dataset 大小、cluster GPU 数、tracked 的 experiment 数、模型大小、pipeline 阶段数。切换 data-parallel distributed training 和自动 retraining。设计会从单个 notebook 演进到一条 scheduled pipeline、versioned data 加 feature prep、一个 distributed training cluster、一个 experiment tracker、一个 model registry，以及把模型 promote 到 serving 的 CI/CD。',
  controls: [
    {
      id: 'trainingJobsPerDay',
      label: '每天训练 job 数',
      help: '团队每天启动的不同训练 run 数（experiment、sweep、retrain）。',
      min: 1,
      max: 5_000,
      defaultValue: 6,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'datasetGigabytes',
      label: 'Dataset 大小',
      help: '每次 run 都要 version 并读取的训练 dataset 的大小。',
      min: 1,
      max: 500_000,
      defaultValue: 20,
      scale: 'log',
      unit: 'GB',
      format: 'count',
    },
    {
      id: 'clusterGpus',
      label: 'Cluster GPU 数',
      help: '训练 worker 能用的加速器数量。单台 host 顶多约 8 块 GPU。',
      min: 1,
      max: 1_024,
      defaultValue: 1,
      scale: 'log',
      unit: 'GPU',
      format: 'count',
    },
    {
      id: 'experimentsTracked',
      label: 'Tracked experiment 数',
      help: '累计 tracked 的 experiment/run 数，它们的 param、metric、artifact 都要拿来对比。',
      min: 1,
      max: 100_000,
      defaultValue: 10,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'modelParams',
      label: '模型大小',
      help: '可训练 parameter 数。超过约 1B params 后，单块 GPU 就装不下模型加 optimizer state 了。',
      min: 1_000_000,
      max: 200_000_000_000,
      defaultValue: 25_000_000,
      scale: 'log',
      unit: 'params',
      format: 'count',
    },
    {
      id: 'pipelineStages',
      label: 'Pipeline 阶段数',
      help: '从原始 data 到 registered 模型的步骤：ingest、validate、features、train、evaluate、register。',
      min: 1,
      max: 20,
      defaultValue: 3,
      scale: 'linear',
      unit: '个',
      format: 'count',
    },
    {
      id: 'datasetVersions',
      label: '每月 dataset version 数',
      help: 'dataset 多久变一次；churn 高时，手工维护 lineage 和 reproducibility 就很难了。',
      min: 1,
      max: 2_000,
      defaultValue: 4,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'distributedTraining',
      label: 'Data-parallel distributed training',
      help: '把每个 batch shard 到很多 GPU/host 上，再 all-reduce gradient 来加速训练。每个 replica 仍然保留一份完整模型副本，所以这能提高 throughput，但装不下一个对单块 GPU 来说太大的模型。',
      defaultValue: false,
    },
    {
      id: 'automatedRetraining',
      label: '自动 retraining + CI/CD',
      help: '在有新 data 或按 schedule 时触发 pipeline，然后自动把通过的模型 promote 到 serving。',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'notebook',
      step: '01',
      title: '一个 notebook',
      summary: '单个研究员在一台机器上手工训练。',
      values: {
        trainingJobsPerDay: 4,
        datasetGigabytes: 10,
        clusterGpus: 1,
        experimentsTracked: 8,
        modelParams: 20_000_000,
        pipelineStages: 3,
        datasetVersions: 2,
        distributedTraining: false,
        automatedRetraining: false,
      },
    },
    {
      id: 'scheduled-pipeline',
      step: '02',
      title: 'Scheduled pipeline',
      summary: '把 run 固化成一条可重复、scheduled 的 DAG。',
      values: {
        trainingJobsPerDay: 40,
        datasetGigabytes: 80,
        clusterGpus: 2,
        experimentsTracked: 60,
        modelParams: 60_000_000,
        pipelineStages: 6,
        datasetVersions: 20,
        distributedTraining: false,
        automatedRetraining: false,
      },
    },
    {
      id: 'distributed-cluster',
      step: '03',
      title: 'Distributed cluster',
      summary: '大模型加大 dataset 需要同时用很多 GPU。',
      values: {
        trainingJobsPerDay: 150,
        datasetGigabytes: 2_000,
        clusterGpus: 32,
        experimentsTracked: 400,
        modelParams: 3_000_000_000,
        pipelineStages: 8,
        datasetVersions: 60,
        distributedTraining: true,
        automatedRetraining: false,
      },
    },
    {
      id: 'tracked-registry',
      step: '04',
      title: 'Tracking + registry',
      summary: '大量 experiment 和模型需要 governance。',
      values: {
        trainingJobsPerDay: 800,
        datasetGigabytes: 20_000,
        clusterGpus: 128,
        experimentsTracked: 8_000,
        modelParams: 15_000_000_000,
        pipelineStages: 12,
        datasetVersions: 300,
        distributedTraining: true,
        automatedRetraining: false,
      },
    },
    {
      id: 'continuous-mlops',
      step: '05',
      title: 'Continuous MLOps',
      summary: 'Pipeline 在规模化下自动 retrain 并 promote 模型。',
      values: {
        trainingJobsPerDay: 3_000,
        datasetGigabytes: 200_000,
        clusterGpus: 512,
        experimentsTracked: 50_000,
        modelParams: 70_000_000_000,
        pipelineStages: 16,
        datasetVersions: 1_200,
        distributedTraining: true,
        automatedRetraining: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'ML training pipeline 架构图',
    description:
      'ML 训练平台的白板风格架构图：author 提交 run、一个 pipeline orchestrator、versioned data 加 feature prep、一个 distributed training cluster，以及带 experiment tracking 的 model registry 和到 serving/CI-CD 的交接。',
    columns: [
      {
        id: 'authors',
        label: 'Authors',
        variant: 'clients',
        nodes: [
          {
            id: 'author',
            title: 'ML author',
            subtitle: 'notebook + code',
            kind: 'client',
            summary: '写训练代码，并从 notebook 或 CLI 启动 run',
          },
        ],
      },
      {
        id: 'orchestration',
        label: 'Orchestration',
        variant: 'edge',
        nodes: [
          {
            id: 'scheduler',
            title: 'Pipeline scheduler',
            subtitle: 'DAG runs',
            kind: 'scheduler',
            summary: '把每个 run 变成一条 scheduled、可重复的、由各 stage 组成的 DAG',
          },
          {
            id: 'ciCd',
            title: 'CI/CD trigger',
            subtitle: 'retrain + promote',
            kind: 'scheduler',
            summary: '在有新 data 或按 schedule 时触发 pipeline，并 promote 通过的模型',
          },
        ],
      },
      {
        id: 'data',
        label: 'Data + features',
        variant: 'backbone',
        nodes: [
          {
            id: 'dataVersioning',
            title: 'Data versioning',
            subtitle: 'lineage',
            kind: 'objectstore',
            summary: 'pin 住一个确切的 dataset version，让每次 run 都可 reproduce',
          },
          {
            id: 'featurePrep',
            title: 'Feature prep',
            subtitle: 'transform',
            kind: 'compute',
            summary: '把原始 data 清洗并 transform 成训练 feature',
          },
        ],
      },
      {
        id: 'cluster',
        label: 'Training cluster',
        variant: 'processing',
        nodes: [
          {
            id: 'trainerWorker',
            title: 'Training worker',
            subtitle: 'single host',
            kind: 'gpu',
            summary: '在一台机器的 GPU 上跑 training loop',
          },
          {
            id: 'distributedWorkers',
            title: 'GPU cluster',
            subtitle: 'data-parallel',
            kind: 'gpu',
            summary: '把 batch shard 到很多 GPU 上，并 all-reduce gradient',
          },
        ],
      },
      {
        id: 'registry',
        label: 'Registry + tracking',
        variant: 'storage',
        nodes: [
          {
            id: 'experimentTracker',
            title: 'Experiment tracker',
            subtitle: 'params + metrics',
            kind: 'db',
            summary: '记录 param、metric、artifact，让各次 run 能对比',
          },
          {
            id: 'modelRegistry',
            title: 'Model registry',
            subtitle: 'versioned models',
            kind: 'objectstore',
            summary: '存储带 stage 和 approval metadata 的 versioned 模型',
          },
          {
            id: 'serving',
            title: 'Serving handoff',
            subtitle: 'deploy',
            kind: 'gpu',
            summary: '接收 promote 过来的模型，做 online 或 batch inference',
          },
        ],
      },
    ],
    flows: [
      { from: 'author', to: 'scheduler', variant: 'primary' },
      { from: 'scheduler', to: 'dataVersioning', variant: 'primary' },
      { from: 'dataVersioning', to: 'featurePrep', variant: 'primary' },
      { from: 'featurePrep', to: 'trainerWorker', variant: 'primary' },
      { from: 'featurePrep', to: 'distributedWorkers', variant: 'secondary' },
      { from: 'trainerWorker', to: 'experimentTracker', variant: 'secondary' },
      { from: 'distributedWorkers', to: 'experimentTracker', variant: 'secondary' },
      { from: 'trainerWorker', to: 'modelRegistry', variant: 'secondary' },
      { from: 'distributedWorkers', to: 'modelRegistry', variant: 'secondary' },
      { from: 'modelRegistry', to: 'ciCd', variant: 'secondary' },
      { from: 'ciCd', to: 'serving', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'orchestrationLoad', label: 'Orchestration 负载' },
    { id: 'dataThroughput', label: 'Data + lineage 压力' },
    { id: 'clusterCapacity', label: 'GPU cluster 容量' },
    { id: 'trackingScale', label: 'Experiment tracking 规模' },
    { id: 'registryGovernance', label: 'Registry governance' },
  ],
  decisions: [
    { id: 'orchestration', title: 'Pipeline orchestration' },
    { id: 'dataVersioning', title: 'Data versioning + lineage' },
    { id: 'distributed', title: 'Distributed training' },
    { id: 'tracking', title: 'Experiment tracking' },
    { id: 'registry', title: 'Model registry' },
    { id: 'cicd', title: '自动 retraining / CI-CD' },
  ],
  sourceBackedRules: [
    {
      title: 'Model registry 管理 versioned 模型的生命周期',
      source: 'MLflow Docs',
      url: 'https://mlflow.org/docs/latest/index.html',
      summary:
        'MLflow 按 run 记录 param、metric、artifact，并以 stage transition 来 register versioned 模型——这正是为什么当 experiment 和模型一多，tracking 和 registry 就会出现。',
    },
    {
      title: 'Pipeline 让 ML workflow 可移植、可扩展、可重复',
      source: 'Kubeflow Pipelines',
      url: 'https://www.kubeflow.org/docs/components/pipelines/',
      summary:
        'Kubeflow Pipelines 在 Kubernetes 上把多步 ML workflow 编排成 DAG——这正是为什么随着 stage 和 run 量增长，ad-hoc 脚本会变成一条 scheduled pipeline。',
    },
    {
      title: '生产级 ML 平台把 data、training、deployment 组件标准化',
      source: 'TFX Guide',
      url: 'https://www.tensorflow.org/tfx/guide',
      summary:
        'TFX 定义了可复用的组件（ingest、validate、transform、train、evaluate、push），让从 data validation 到 deployment 的整个生命周期保持一致且可自动化。',
    },
    {
      title: 'Data versioning 给 dataset 类似 git 的 lineage 和 reproducibility',
      source: 'DVC Docs',
      url: 'https://dvc.org/doc',
      summary:
        'DVC 对大 dataset 和 pipeline 做版本控制，让任何一次 run 都能从一个确切的 data version 重现——一旦 dataset 经常变，这就是必需品。',
    },
  ],
  teachingAssumptions: [
    '单 host 训练顶多约 8 块 GPU、大约 1B 参数，再多模型加 optimizer state 就装不进一块加速器了。',
    'orchestration、tracking、storage 的预算都是保守的教学数字，用来让这五个 scenario 有递进，并非 vendor 的真实上限。',
    'data-parallel distributed training 被建模成一个 throughput 维度（replica 越多越快完成）；而一个比单块 GPU 还大的模型需要的是 model sharding（tensor/pipeline parallelism 或 FSDP/ZeRO），它被建模成一个单独的 sharding 信号。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-notebook',
      step: '01',
      focus: '一个 notebook',
      scenarioId: 'notebook',
      question:
        '一个研究员每天在一个 10 GB dataset 和一块 GPU 上跑约 4 个训练 job。现在你需要 pipeline orchestrator、tracker 或 registry 吗？',
      reveal:
        '不需要。在这个量级下，一个 notebook 加一张结果 spreadsheet 是诚实的做法。scheduler、feature store、registry 都是没有负载支撑的额外活动件——唯一真实的风险是忘了某个结果是哪份 data 和哪段代码产出的。',
      takeaway: '从最简单又正确的配置起步：一个 notebook、一台机器，加上有纪律的记笔记。',
    },
    {
      id: 'codify-pipeline',
      step: '02',
      focus: '把 pipeline 固化下来',
      scenarioId: 'scheduled-pipeline',
      question:
        '现在每天 40 个 run、6 个 stage，dataset 每月变 20 次。手工做的话，最先崩的是什么？',
      reveal:
        '最先崩的是 reproducibility。data 频繁变动时，你说不清哪份 dataset 产出了哪个结果，而手动重跑 6 个步骤又很容易出错。解法是一条 scheduled pipeline DAG 加 data versioning，让每次 run 都 pin 住一个确切的 dataset version 并以完全相同的方式重跑。',
      takeaway: '一旦 data 经常变、步骤又增多，就把 workflow 固化成一条 versioned、scheduled 的 pipeline。',
    },
    {
      id: 'scale-cluster',
      step: '03',
      focus: '大模型，多 GPU',
      scenarioId: 'distributed-cluster',
      question:
        '一个 3B 参数的模型跑在 2 TB dataset 上，既装不进一块 GPU，也没法在单 host 上按时跑完。跨多 GPU 的 data-parallel training 能同时解决这两件事吗？',
      reveal:
        '这是两个不同的问题。要在大 dataset 上训练得更快，data-parallel training 把每个 batch shard 到很多 GPU 上、再 all-reduce gradient，从而压低 wall-clock 时间。但一个 3B 参数的模型装不进一块 GPU，data parallelism 在这里帮不上忙——每个 replica 都保留一份完整模型副本。要装下一个过大的模型，需要 model sharding（tensor/pipeline parallelism 或 FSDP/ZeRO），把 parameter 和 optimizer state 切分到各 GPU 上。',
      takeaway: 'data-parallel 加快训练；要装下一个比单块 GPU 还大的模型，需要的是 model sharding（tensor/pipeline/FSDP），不是更多 replica。',
    },
    {
      id: 'track-and-register',
      step: '04',
      focus: 'Tracking + registry',
      scenarioId: 'tracked-registry',
      question:
        '有 8,000 个在跑的 experiment 和一堆候选模型时，你怎么知道哪个模型在 production、新模型是不是真的更好？',
      reveal:
        '靠记忆是做不到的。experiment tracker 记录每次 run 的 param、metric、artifact 供对比，model registry 用 stage 和 approval metadata 给模型 version。两者合起来给出 provenance，以及一条从「trained」到「production」的受控路径。',
      takeaway: '到了 experiment 的规模，tracking 加 versioned registry 能把 ad-hoc 结果变成受 governance、可对比的模型。',
    },
    {
      id: 'continuous',
      step: '05',
      focus: 'Continuous MLOps',
      scenarioId: 'continuous-mlops',
      question:
        '每天 3,000 个 job、data 还源源不断地来，人还跟得上手动启动 retrain、promote 模型吗？',
      reveal:
        '跟不上——这个 loop 必须自己闭环。CI/CD 在有新 data 或按 schedule 时触发 retraining，跑 evaluation gate，只把通过的模型自动 promote 到 serving。人转去审批 policy、盯 drift，而不是看着每一次 run。',
      takeaway: '到了满规模，生命周期会变成 continuous：data 触发 retraining、gate 负责 promote、人来 govern policy。',
    },
  ],
  analyze: analyzeMlTrainingPipelineWorkload,
};

function analyzeMlTrainingPipelineWorkload(workload: WorkloadValues): LabAnalysis {
  const trainingJobsPerDay = numericValue(workload, 'trainingJobsPerDay');
  const datasetGigabytes = numericValue(workload, 'datasetGigabytes');
  const clusterGpus = numericValue(workload, 'clusterGpus');
  const experimentsTracked = numericValue(workload, 'experimentsTracked');
  const modelParams = numericValue(workload, 'modelParams');
  const pipelineStages = numericValue(workload, 'pipelineStages');
  const datasetVersions = numericValue(workload, 'datasetVersions');
  const distributedTraining = Boolean(workload.distributedTraining);
  const automatedRetraining = Boolean(workload.automatedRetraining);

  const needsOrchestration =
    trainingJobsPerDay > jobsPerNotebookPerDay || pipelineStages > stagesPerAdHocScript;

  // A model larger than one GPU does NOT get fixed by data parallelism (each
  // replica holds a full copy); it needs model sharding (tensor/pipeline/FSDP).
  const modelTooBigForOneGpu = modelParams > modelParamsPerSingleGpu;
  const needsModelSharding = modelTooBigForOneGpu;
  // Data parallelism is a THROUGHPUT axis: more GPUs / an explicit toggle.
  const needsDistributed = distributedTraining || clusterGpus > gpusPerSingleHost;
  // Either scaling axis means the workload has outgrown a single trainer host.
  const needsCluster = needsDistributed || needsModelSharding;

  // Feature prep / versioned data become a real stage whenever the workflow is
  // orchestrated OR a cluster is running (the cluster cannot be fed from a bare
  // notebook). Gate the featurePrep node and BOTH of its flows on this one
  // condition so no active edge ever touches an inactive node.
  const needsDataPipeline = needsOrchestration || needsCluster;
  const needsDataVersioning =
    datasetVersions > 8 ||
    datasetGigabytes > datasetGbPerSingleNode ||
    needsDataPipeline;
  const needsTracking = experimentsTracked > experimentsPerSpreadsheet;
  const needsRegistry = needsTracking || automatedRetraining || trainingJobsPerDay > 100;
  const needsCiCd = automatedRetraining;

  // Orchestration pressure: run volume against scheduler budget, amplified by stage count.
  const orchestrationRatio =
    (trainingJobsPerDay / jobsPerSchedulerPerDay) * Math.max(1, pipelineStages / 6);
  // Data + lineage pressure: soft-capped so the dataset that spans five orders of
  // magnitude (10 GB -> 200 TB) still differentiates the top scenarios instead of
  // pinning the meter at thousands. log10 of the size-vs-budget ratio, lifted by
  // a gentle version-churn term.
  const dataSizeRatio = datasetGigabytes / datasetGbPerSingleNode;
  const dataRatio =
    Math.max(0, Math.log10(Math.max(dataSizeRatio, 0.01)) + 1) / 2.2 +
    Math.log10(Math.max(datasetVersions, 1)) / 8;

  // GPU cluster capacity: how far the WHOLE cluster scales out, normalized to a
  // fixed budget so the meter rises monotonically as GPUs (and a too-big model's
  // minimum GPU count) grow. The denominator never swaps with the toggle.
  const gpusToShardModel = needsModelSharding
    ? Math.ceil(modelParams / modelParamsPerSingleGpu)
    : 1;
  const effectiveGpuDemand = Math.max(clusterGpus, gpusToShardModel);
  // Explicit data-parallel all-reduce adds a collective-communication tax on top
  // of the raw scale-out, so toggling it always moves cluster pressure. The tax
  // only ever raises later (already-distributed) scenarios, so the meter stays
  // monotonic across the five scenarios.
  const communicationOverhead = distributedTraining ? 1.15 : 1;
  const clusterRatio = (effectiveGpuDemand / clusterScaleOutBudget) * communicationOverhead;
  // Per-GPU memory pressure: under data parallelism each GPU holds a FULL model
  // copy, so memory pressure tracks model size directly until sharding splits it.
  const perGpuShardFactor = needsModelSharding
    ? Math.min(effectiveGpuDemand, gpusToShardModel)
    : 1;
  const perGpuModelRatio =
    modelParams / modelParamsPerSingleGpu / Math.max(perGpuShardFactor, 1);
  // Estimated single-host training-time signal (steps scale with data size).
  const estimatedStepCount = (datasetGigabytes / Math.max(datasetGbPerSingleNode, 1)) * 1000;
  const estimatedSingleHostSeconds = estimatedStepCount * secondsPerStepBase;

  const trackingRatio = experimentsTracked / experimentsPerSpreadsheet;
  const registryRatio = needsRegistry
    ? (trainingJobsPerDay / jobsPerSchedulerPerDay) + (automatedRetraining ? 0.6 : 0)
    : trainingJobsPerDay / (jobsPerSchedulerPerDay * 2);

  const flags = {
    needsOrchestration,
    needsDataPipeline,
    needsDataVersioning,
    needsDistributed,
    needsCluster,
    needsModelSharding,
    needsTracking,
    needsRegistry,
    needsCiCd,
    modelTooBigForOneGpu,
    distributedTraining,
    automatedRetraining,
  };

  return {
    architectureTitle: chooseArchitectureTitle(flags),
    architectureSummary: chooseArchitectureSummary(flags),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      author: 'ok',
      // The scheduler launches the pipeline; it is active whenever the data
      // pipeline runs (orchestrated volume or a cluster that must be fed).
      scheduler: needsDataPipeline ? 'needed' : 'inactive',
      ciCd: needsCiCd ? 'needed' : 'inactive',
      // dataVersioning sits upstream of featurePrep; when data is versioned but
      // the pipeline stage is not active, still mark it so its only inbound flow
      // (scheduler) and outbound flow (featurePrep) stay coherent below.
      dataVersioning: needsDataVersioning ? 'needed' : 'inactive',
      // featurePrep and its in/out flows are all gated on needsDataPipeline.
      featurePrep: needsDataPipeline ? 'ok' : 'inactive',
      // The single-host trainer is the active worker until the workload scales
      // out (more GPUs OR a model too big for one GPU), when the cluster takes over.
      trainerWorker: needsCluster ? 'inactive' : 'ok',
      distributedWorkers: needsCluster
        ? needsModelSharding
          ? 'warning'
          : 'needed'
        : 'inactive',
      experimentTracker: needsTracking ? 'needed' : 'inactive',
      modelRegistry: needsRegistry ? 'needed' : 'inactive',
      serving: needsCiCd ? 'needed' : 'inactive',
    },
    flowStates: {
      authorToScheduler: needsDataPipeline ? 'active' : 'inactive',
      // The scheduler -> dataVersioning -> featurePrep chain is one pipeline; gate
      // it on needsDataPipeline. needsDataVersioning is always true when the
      // pipeline is active (it includes needsOrchestration), so dataVersioning is
      // guaranteed active here and neither edge dangles.
      schedulerToDataVersioning: needsDataPipeline ? 'active' : 'inactive',
      dataVersioningToFeaturePrep: needsDataPipeline ? 'active' : 'inactive',
      featurePrepToTrainerWorker: needsDataPipeline && !needsCluster ? 'active' : 'inactive',
      featurePrepToDistributedWorkers: needsDataPipeline && needsCluster ? 'active' : 'inactive',
      trainerWorkerToExperimentTracker:
        needsTracking && !needsCluster ? 'active' : 'inactive',
      distributedWorkersToExperimentTracker:
        needsTracking && needsCluster ? 'active' : 'inactive',
      trainerWorkerToModelRegistry: needsRegistry && !needsCluster ? 'active' : 'inactive',
      distributedWorkersToModelRegistry: needsRegistry && needsCluster ? 'active' : 'inactive',
      modelRegistryToCiCd: needsCiCd ? 'active' : 'inactive',
      ciCdToServing: needsCiCd ? 'active' : 'inactive',
    },
    meters: {
      orchestrationLoad: {
        ratio: orchestrationRatio,
        valueText: `${formatCount(trainingJobsPerDay)} 个 job/day`,
        copy: needsOrchestration
          ? `每天 ${formatCount(trainingJobsPerDay)} 个 job、跨 ${Math.round(
              pipelineStages,
            )} 个 stage，需要一条 scheduled DAG，而不是手跑的脚本。`
          : 'run 量足够低，从 notebook 手动启动就行。',
      },
      dataThroughput: {
        ratio: dataRatio,
        valueText: formatStorageGigabytes(datasetGigabytes),
        copy: needsDataVersioning
          ? `${formatStorageGigabytes(datasetGigabytes)} 每月变 ${formatCount(
              datasetVersions,
            )} 次，需要 pin 住的 version 和 lineage 来保证 reproducibility。`
          : '一个小而很少变的 dataset 可以直接从磁盘读。',
      },
      clusterCapacity: {
        ratio: clusterRatio,
        valueText: `${formatCount(clusterGpus)} 块 GPU`,
        copy: needsModelSharding
          ? `一个 ${formatCount(
              modelParams,
            )} 参数的模型超出了一块 GPU（约其显存的 ${perGpuModelRatio.toFixed(
              1,
            )} 倍）；把模型 shard（tensor/pipeline/FSDP）到 ${formatCount(
              effectiveGpuDemand,
            )} 块 GPU 上。data parallelism 只增加 throughput。`
          : needsDistributed
            ? `${formatCount(
                clusterGpus,
              )} 块 GPU 跑 data-parallel all-reduce，让一个约 ${formatDurationShort(
                estimatedSingleHostSeconds,
              )} 的单 host run 更快完成；每个 replica 仍然保留一份完整模型副本。`
            : '模型和 dataset 都能装进单 host，所以一个 trainer 就够了。',
      },
      trackingScale: {
        ratio: trackingRatio,
        valueText: `${formatCount(experimentsTracked)} 个 experiment`,
        copy: needsTracking
          ? `${formatCount(experimentsTracked)} 个 experiment 没法在 spreadsheet 里对比；把 param 和 metric 记到 tracker 里。`
          : '寥寥几个 experiment 还能放在一个笔记文件或 spreadsheet 里。',
      },
      registryGovernance: {
        ratio: registryRatio,
        valueText: needsCiCd ? 'Continuous' : needsRegistry ? 'Versioned' : 'Ad-hoc',
        copy: needsCiCd
          ? '自动 retraining 只 promote 通过 evaluation gate 的模型，所以一个带 stage 的 registry 是必须的。'
          : needsRegistry
            ? '带 stage 和 approval metadata 的 versioned 模型，给出一条通往 production 的受控路径。'
            : '模型少的时候，手工追踪哪个 artifact 在线还能接受。',
      },
    },
    decisions: buildDecisions({
      ...flags,
      trainingJobsPerDay,
      pipelineStages,
      datasetGigabytes,
      datasetVersions,
      clusterGpus,
      modelParams,
      experimentsTracked,
    }),
    reasons: buildReasons({
      ...flags,
      trainingJobsPerDay,
      pipelineStages,
      datasetGigabytes,
      datasetVersions,
      clusterGpus,
      modelParams,
      experimentsTracked,
      effectiveGpuDemand,
    }),
  };
}

type ArchitectureFlags = {
  needsOrchestration: boolean;
  needsDataPipeline: boolean;
  needsDataVersioning: boolean;
  needsDistributed: boolean;
  needsCluster: boolean;
  needsModelSharding: boolean;
  needsTracking: boolean;
  needsRegistry: boolean;
  needsCiCd: boolean;
  modelTooBigForOneGpu: boolean;
  distributedTraining: boolean;
  automatedRetraining: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    trainingJobsPerDay: number;
    pipelineStages: number;
    datasetGigabytes: number;
    datasetVersions: number;
    clusterGpus: number;
    modelParams: number;
    experimentsTracked: number;
    effectiveGpuDemand: number;
  },
): LabReason[] {
  const reasons: LabReason[] = [];

  // Six axes, one reason each (with an ok/not-yet branch), so every reachable
  // scenario yields exactly six reasons — within the required 4-7 band.

  // 1. Orchestration.
  if (analysis.needsOrchestration) {
    reasons.push({
      severity:
        analysis.trainingJobsPerDay > jobsPerSchedulerPerDay ? 'warning' : 'ok',
      text: `每天 ${formatCount(analysis.trainingJobsPerDay)} 个 job、跨 ${Math.round(
        analysis.pipelineStages,
      )} 个 stage，应该作为一条 scheduled、可重复的 pipeline DAG 来跑。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'run 量和 stage 数都足够低，从 notebook 手动启动训练就行。',
    });
  }

  // 2. Data + lineage.
  if (analysis.needsDataVersioning) {
    reasons.push({
      severity: analysis.datasetGigabytes > datasetGbPerSingleNode ? 'warning' : 'ok',
      text: `${formatStorageGigabytes(analysis.datasetGigabytes)} 每月变 ${formatCount(
        analysis.datasetVersions,
      )} 次，需要 pin 住的 data version 和 lineage，让各次 run 能精确 reproduce。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '一个小而很少变的 dataset 直接从磁盘读，不需要 versioning 层。',
    });
  }

  // 3. Training scale-out (throughput) vs model sharding (memory) — kept distinct.
  if (analysis.needsModelSharding) {
    reasons.push({
      severity: analysis.modelParams > modelParamsPerSingleGpu * 10 ? 'danger' : 'warning',
      text: `一个 ${formatCount(
        analysis.modelParams,
      )} 参数的模型对一块 GPU 来说太大了；把模型本身 shard（tensor/pipeline parallelism 或 FSDP/ZeRO）到整个 cluster 上——光靠 data parallelism 没法让它装下。`,
    });
  } else if (analysis.needsDistributed) {
    reasons.push({
      severity: analysis.effectiveGpuDemand > clusterScaleOutBudget ? 'danger' : 'warning',
      text: `${formatCount(
        analysis.clusterGpus,
      )} 块 GPU 已经超出一台 host；data-parallel training 在各 replica 间 all-reduce gradient 来更快完成，每个 replica 都持有一份完整模型副本。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '模型和 dataset 都能装进一台 host，所以一个 trainer 就够了——还不需要 distribution 或 sharding。',
    });
  }

  // 4. Experiment tracking.
  if (analysis.needsTracking) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(
        analysis.experimentsTracked,
      )} 个 tracked 的 run 没法手工对比；把 param、metric、artifact 记到 tracker 里。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.experimentsTracked,
      )} 个 run 还能放进一个笔记文件或 spreadsheet，不用 tracker。`,
    });
  }

  // 5. Model registry.
  if (analysis.needsRegistry) {
    reasons.push({
      severity: 'ok',
      text: 'model registry 用 stage 和 approval metadata 给候选模型 version，给出一条通往 production 的受控路径。',
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '模型少的时候，手工追踪哪个 artifact 在线还能接受。',
    });
  }

  // 6. Automated retraining / CI-CD.
  if (analysis.needsCiCd) {
    reasons.push({
      severity: 'warning',
      text: '自动 retraining 在有新 data 时触发 pipeline，跑 evaluation gate，只把通过的模型 promote 到 serving。',
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'retraining 是手动的，所以仍由人来有意识地启动 run、promote 模型。',
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    trainingJobsPerDay: number;
    pipelineStages: number;
    datasetGigabytes: number;
    datasetVersions: number;
    clusterGpus: number;
    modelParams: number;
    experimentsTracked: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  const distributedCopy = flags.needsModelSharding
    ? `一个 ${formatCount(
        flags.modelParams,
      )} 参数的模型对一块 GPU 来说太大了；用 tensor/pipeline parallelism 或 FSDP/ZeRO 把模型 shard 开。data parallelism 提高 throughput，但没法让它装下。`
    : flags.needsDistributed
      ? `用 data-parallel all-reduce 协调 ${formatCount(
          flags.clusterGpus,
        )} 块 GPU，让 wall-clock 时间下降；每个 replica 保留一份完整模型副本。`
      : '一台 host 就能装下模型和 dataset，所以一个 trainer 就够了。';

  return {
    orchestration: {
      state: flags.needsOrchestration ? 'needed' : 'not-yet',
      copy: flags.needsOrchestration
        ? `把这个 ${Math.round(
            flags.pipelineStages,
          )} 阶段的 workflow 作为一条 scheduled DAG（Kubeflow/TFX 风格）来跑，让它可靠地重复。`
        : '还不需要 orchestrator——一个 notebook 直接启动每天那几个 run。',
    },
    dataVersioning: {
      state: flags.needsDataVersioning ? 'needed' : 'not-yet',
      copy: flags.needsDataVersioning
        ? `给 dataset 做 version（DVC 风格）并记录 lineage，让每月 ${formatCount(
            flags.datasetVersions,
          )} 个 version 中的任意一个都能 reproduce。`
        : '一个小而稳定的 dataset 直接从磁盘读，不做版本控制。',
    },
    distributed: {
      state: flags.needsCluster ? 'needed' : 'not-yet',
      copy: distributedCopy,
    },
    tracking: {
      state: flags.needsTracking ? 'needed' : 'not-yet',
      copy: flags.needsTracking
        ? `给 ${formatCount(
            flags.experimentsTracked,
          )} 个 experiment 记录 param、metric、artifact，让各次 run 可对比、可 reproduce。`
        : '寥寥几个 experiment 还能放进一个 spreadsheet 或笔记文件。',
    },
    registry: {
      state: flags.needsRegistry ? (flags.needsCiCd ? 'needed' : 'useful') : 'not-yet',
      copy: flags.needsRegistry
        ? '把 versioned 模型连同 stage 和 approval metadata 一起 register，让线上模型始终明确可知。'
        : '模型少的时候，手工追踪线上 artifact 还能接受。',
    },
    cicd: {
      state: flags.needsCiCd ? 'needed' : flags.needsRegistry ? 'useful' : 'not-yet',
      copy: flags.needsCiCd
        ? '在有新 data 时触发 retraining，用 evaluation 做 gate，自动把通过的模型 promote 到 serving。'
        : flags.needsRegistry
          ? '手动 promote 到 serving 这一步还行，直到 retraining 频率逼着你上自动化。'
          : '还没有 deployment 自动化——模型靠手工交接。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags): string {
  if (
    !flags.needsOrchestration &&
    !flags.needsCluster &&
    !flags.needsTracking &&
    !flags.needsRegistry
  ) {
    return '单个 notebook + 一块 GPU';
  }
  if (flags.needsCiCd) {
    return 'Continuous MLOps 平台';
  }
  if (flags.needsTracking || flags.needsRegistry) {
    return 'Pipeline + tracking + registry';
  }
  if (flags.needsCluster) {
    return flags.needsModelSharding
      ? 'Scheduled pipeline + model-sharded cluster'
      : 'Scheduled pipeline + distributed cluster';
  }
  return 'Scheduled training pipeline';
}

function chooseArchitectureSummary(flags: ArchitectureFlags): string {
  if (
    !flags.needsOrchestration &&
    !flags.needsCluster &&
    !flags.needsTracking &&
    !flags.needsRegistry
  ) {
    return '一台机器上的一个 notebook 手工训练和 evaluate。pipeline、cluster、registry 现在都为时过早。';
  }
  if (flags.needsCiCd) {
    return '一条 scheduled pipeline 拉取 versioned data，在 cluster 上做 data-parallel 训练，记录到 tracker，CI/CD 把通过 gate 的模型自动 promote 到 serving。';
  }
  if (flags.needsTracking || flags.needsRegistry) {
    return '一条跑在 versioned data 上的 scheduled pipeline 喂给 training cluster，同时一个 experiment tracker 和一个 versioned model registry 提供 provenance 和 governance。';
  }
  if (flags.needsCluster) {
    return flags.needsModelSharding
      ? '一条 scheduled pipeline pin 住 data version，并把一个过大的模型 shard（tensor/pipeline/FSDP）到整个 cluster 上；data parallelism 是为了 throughput 加上的，不是为了让模型装下。'
      : '一条 scheduled pipeline pin 住 data version，并跨多块 GPU 做 data-parallel 训练，比单 host 更快完成。';
  }
  return '把 run 固化成一条跑在 versioned data 上的 scheduled DAG，让它随着量增长仍能可靠地重复。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (
    !flags.needsOrchestration &&
    !flags.needsCluster &&
    !flags.needsTracking &&
    !flags.needsRegistry
  ) {
    return 'Notebook -> single GPU -> saved model';
  }
  if (flags.needsCiCd) {
    return 'Trigger -> pipeline -> versioned data -> GPU cluster -> tracker -> registry -> serving';
  }
  if (flags.needsTracking || flags.needsRegistry) {
    return 'Pipeline -> versioned data -> cluster -> tracker -> registry';
  }
  if (flags.needsCluster) {
    return flags.needsModelSharding
      ? 'Pipeline -> versioned data -> model-sharded cluster'
      : 'Pipeline -> versioned data -> data-parallel cluster';
  }
  return 'Author -> scheduler -> versioned data -> trainer';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

/** Compact human duration for the training-time estimate signal. */
function formatDurationShort(seconds: number): string {
  if (seconds >= 86_400) {
    return `${Math.round(seconds / 86_400)} days`;
  }
  if (seconds >= 3_600) {
    return `${Math.round(seconds / 3_600)} hr`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} min`;
  }
  return `${Math.max(1, Math.round(seconds))} sec`;
}
