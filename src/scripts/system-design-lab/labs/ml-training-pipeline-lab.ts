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
  eyebrow: 'System Design Lab',
  title:
    'An ML training platform starts as one notebook and grows the lifecycle around it: pipelines, tracking, a cluster, and a registry.',
  summary:
    'Change training jobs per day, dataset size, cluster GPUs, experiments tracked, model size, and pipeline stages. Toggle data-parallel distributed training and automated retraining. The design moves from a single notebook to a scheduled pipeline, versioned data and feature prep, a distributed training cluster, an experiment tracker, a model registry, and CI/CD that promotes models to serving.',
  controls: [
    {
      id: 'trainingJobsPerDay',
      label: 'Training jobs / day',
      help: 'Distinct training runs launched per day across the team (experiments, sweeps, retrains).',
      min: 1,
      max: 5_000,
      defaultValue: 6,
      scale: 'log',
      unit: 'jobs',
      format: 'count',
    },
    {
      id: 'datasetGigabytes',
      label: 'Dataset size',
      help: 'Size of the training dataset that must be versioned and read each run.',
      min: 1,
      max: 500_000,
      defaultValue: 20,
      scale: 'log',
      unit: 'GB',
      format: 'count',
    },
    {
      id: 'clusterGpus',
      label: 'Cluster GPUs',
      help: 'Accelerators available to the training workers. One host tops out around 8 GPUs.',
      min: 1,
      max: 1_024,
      defaultValue: 1,
      scale: 'log',
      unit: 'GPUs',
      format: 'count',
    },
    {
      id: 'experimentsTracked',
      label: 'Experiments tracked',
      help: 'Experiments/runs tracked (cumulative) whose params, metrics, and artifacts must be compared.',
      min: 1,
      max: 100_000,
      defaultValue: 10,
      scale: 'log',
      unit: 'experiments',
      format: 'count',
    },
    {
      id: 'modelParams',
      label: 'Model size',
      help: 'Trainable parameters. Past ~1B params one GPU can no longer hold model plus optimizer state.',
      min: 1_000_000,
      max: 200_000_000_000,
      defaultValue: 25_000_000,
      scale: 'log',
      unit: 'params',
      format: 'count',
    },
    {
      id: 'pipelineStages',
      label: 'Pipeline stages',
      help: 'Steps from raw data to a registered model: ingest, validate, features, train, evaluate, register.',
      min: 1,
      max: 20,
      defaultValue: 3,
      scale: 'linear',
      unit: 'stages',
      format: 'count',
    },
    {
      id: 'datasetVersions',
      label: 'Dataset versions / month',
      help: 'How often the dataset changes; high churn makes lineage and reproducibility hard by hand.',
      min: 1,
      max: 2_000,
      defaultValue: 4,
      scale: 'log',
      unit: 'versions',
      format: 'count',
    },
  ],
  toggles: [
    {
      id: 'distributedTraining',
      label: 'Data-parallel distributed training',
      help: 'Shard each batch across many GPUs/hosts and all-reduce gradients to train faster. Each replica still holds a full model copy, so this raises throughput but does not fit a model too big for one GPU.',
      defaultValue: false,
    },
    {
      id: 'automatedRetraining',
      label: 'Automated retraining + CI/CD',
      help: 'Trigger pipelines on new data or schedule, then promote passing models to serving automatically.',
      defaultValue: false,
    },
  ],
  scenarios: [
    {
      id: 'notebook',
      step: '01',
      title: 'One notebook',
      summary: 'A single researcher trains by hand on one machine.',
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
      summary: 'Runs are codified into a repeatable, scheduled DAG.',
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
      summary: 'A big model and dataset need many GPUs at once.',
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
      summary: 'Many experiments and models need governance.',
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
      summary: 'Pipelines retrain and promote models automatically at scale.',
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
    title: 'ML training pipeline architecture diagram',
    description:
      'Whiteboard-style architecture diagram for an ML training platform: authors submitting runs, a pipeline orchestrator, versioned data and feature prep, a distributed training cluster, and a model registry with experiment tracking and a serving/CI-CD handoff.',
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
            summary: 'writes training code and launches runs from a notebook or the CLI',
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
            summary: 'turns each run into a scheduled, repeatable DAG of stages',
          },
          {
            id: 'ciCd',
            title: 'CI/CD trigger',
            subtitle: 'retrain + promote',
            summary: 'fires pipelines on new data or schedule and promotes passing models',
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
            summary: 'pins an exact dataset version so every run is reproducible',
          },
          {
            id: 'featurePrep',
            title: 'Feature prep',
            subtitle: 'transform',
            summary: 'cleans and transforms raw data into training features',
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
            summary: 'runs the training loop on the GPUs of one machine',
          },
          {
            id: 'distributedWorkers',
            title: 'GPU cluster',
            subtitle: 'data-parallel',
            summary: 'shards batches across many GPUs and all-reduces gradients',
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
            summary: 'logs params, metrics, and artifacts so runs can be compared',
          },
          {
            id: 'modelRegistry',
            title: 'Model registry',
            subtitle: 'versioned models',
            summary: 'stores versioned models with stage and approval metadata',
          },
          {
            id: 'serving',
            title: 'Serving handoff',
            subtitle: 'deploy',
            summary: 'receives promoted models for online or batch inference',
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
    { id: 'orchestrationLoad', label: 'Orchestration load' },
    { id: 'dataThroughput', label: 'Data + lineage pressure' },
    { id: 'clusterCapacity', label: 'GPU cluster capacity' },
    { id: 'trackingScale', label: 'Experiment tracking scale' },
    { id: 'registryGovernance', label: 'Registry governance' },
  ],
  decisions: [
    { id: 'orchestration', title: 'Pipeline orchestration' },
    { id: 'dataVersioning', title: 'Data versioning + lineage' },
    { id: 'distributed', title: 'Distributed training' },
    { id: 'tracking', title: 'Experiment tracking' },
    { id: 'registry', title: 'Model registry' },
    { id: 'cicd', title: 'Automated retraining / CI-CD' },
  ],
  sourceBackedRules: [
    {
      title: 'A model registry manages the lifecycle of versioned models',
      source: 'MLflow Docs',
      url: 'https://mlflow.org/docs/latest/index.html',
      summary:
        'MLflow tracks params, metrics, and artifacts per run and registers versioned models with stage transitions, which is why tracking and a registry appear once many experiments and models exist.',
    },
    {
      title: 'Pipelines make ML workflows portable, scalable, and repeatable',
      source: 'Kubeflow Pipelines',
      url: 'https://www.kubeflow.org/docs/components/pipelines/',
      summary:
        'Kubeflow Pipelines orchestrates multi-step ML workflows as DAGs on Kubernetes, the reason ad-hoc scripts become a scheduled pipeline as stages and run volume grow.',
    },
    {
      title: 'Production ML platforms standardize data, training, and deployment components',
      source: 'TFX Guide',
      url: 'https://www.tensorflow.org/tfx/guide',
      summary:
        'TFX defines reusable components (ingest, validate, transform, train, evaluate, push) so the lifecycle from data validation to deployment is consistent and automatable.',
    },
    {
      title: 'Data versioning gives datasets git-like lineage and reproducibility',
      source: 'DVC Docs',
      url: 'https://dvc.org/doc',
      summary:
        'DVC version-controls large datasets and pipelines so any run can be reproduced from an exact data version, essential once the dataset changes frequently.',
    },
  ],
  teachingAssumptions: [
    'Single-host training tops out around 8 GPUs and roughly 1B parameters before model and optimizer state stop fitting on one accelerator.',
    'Orchestration, tracking, and storage budgets are conservative teaching numbers chosen to make the five scenarios progress, not vendor limits.',
    'Data-parallel distributed training is modeled as a throughput axis (more replicas finish faster); a model larger than one GPU instead needs model sharding (tensor/pipeline parallelism or FSDP/ZeRO), modeled as a separate sharding signal.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-notebook',
      step: '01',
      focus: 'One notebook',
      scenarioId: 'notebook',
      question:
        'One researcher runs ~4 training jobs a day on a 10 GB dataset and one GPU. Do you need a pipeline orchestrator, a tracker, or a registry yet?',
      reveal:
        'No. At this volume a notebook plus a results spreadsheet is honest. A scheduler, a feature store, and a registry are all moving parts with no load to justify them — the only real risk is forgetting which data and code produced a result.',
      takeaway: 'Start with the simplest correct setup: one notebook, one machine, and disciplined note-taking.',
    },
    {
      id: 'codify-pipeline',
      step: '02',
      focus: 'Codify the pipeline',
      scenarioId: 'scheduled-pipeline',
      question:
        'Now 40 runs a day over 6 stages, with the dataset changing 20 times a month. What breaks first when you do this by hand?',
      reveal:
        'Reproducibility breaks first. With frequent data changes you cannot tell which dataset produced which result, and re-running 6 manual steps is error-prone. The fix is a scheduled pipeline DAG plus data versioning so each run pins an exact dataset version and re-runs identically.',
      takeaway: 'Once data changes often and steps multiply, codify the workflow into a versioned, scheduled pipeline.',
    },
    {
      id: 'scale-cluster',
      step: '03',
      focus: 'Big model, many GPUs',
      scenarioId: 'distributed-cluster',
      question:
        'A 3B-parameter model on a 2 TB dataset will not fit on one GPU and will not finish in time on one host. Does data-parallel training across many GPUs solve both?',
      reveal:
        'Two different problems. To train FASTER on a big dataset, data-parallel training shards each batch across many GPUs and all-reduces gradients, dropping wall-clock time. But a 3B-param model does not FIT on one GPU, and data parallelism cannot help there — every replica holds a full model copy. Fitting a too-big model needs model sharding (tensor/pipeline parallelism or FSDP/ZeRO) that splits the parameters and optimizer state across GPUs.',
      takeaway: 'Data-parallel speeds up training; fitting a model bigger than one GPU needs model sharding (tensor/pipeline/FSDP), not more replicas.',
    },
    {
      id: 'track-and-register',
      step: '04',
      focus: 'Tracking + registry',
      scenarioId: 'tracked-registry',
      question:
        'With 8,000 live experiments and many candidate models, how do you know which model is in production and whether a new one is actually better?',
      reveal:
        'You cannot by memory. An experiment tracker logs every run\'s params, metrics, and artifacts for comparison, and a model registry versions models with stage and approval metadata. Together they give provenance and a controlled path from "trained" to "production".',
      takeaway: 'At experiment scale, tracking plus a versioned registry turn ad-hoc results into governed, comparable models.',
    },
    {
      id: 'continuous',
      step: '05',
      focus: 'Continuous MLOps',
      scenarioId: 'continuous-mlops',
      question:
        'At 3,000 jobs a day with data arriving constantly, can humans keep launching retrains and promoting models?',
      reveal:
        'No — the loop must close itself. CI/CD triggers retraining on new data or a schedule, runs evaluation gates, and promotes only passing models to serving automatically. Humans move to approving policies and watching for drift, not babysitting each run.',
      takeaway: 'At full scale the lifecycle becomes continuous: data triggers retraining, gates promote, and people govern the policy.',
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
        valueText: `${formatCount(trainingJobsPerDay)} ${pluralize('job', trainingJobsPerDay)}/day`,
        copy: needsOrchestration
          ? `${formatCount(trainingJobsPerDay)} jobs/day across ${Math.round(
              pipelineStages,
            )} stages need a scheduled DAG, not hand-run scripts.`
          : 'Run volume is low enough to launch by hand from a notebook.',
      },
      dataThroughput: {
        ratio: dataRatio,
        valueText: formatStorageGigabytes(datasetGigabytes),
        copy: needsDataVersioning
          ? `${formatStorageGigabytes(datasetGigabytes)} changing ${formatCount(
              datasetVersions,
            )}x/month needs pinned versions and lineage for reproducibility.`
          : 'A small, rarely-changing dataset can be read straight from disk.',
      },
      clusterCapacity: {
        ratio: clusterRatio,
        valueText: `${formatCount(clusterGpus)} ${pluralize('GPU', clusterGpus)}`,
        copy: needsModelSharding
          ? `A ${formatCount(
              modelParams,
            )}-param model exceeds one GPU (~${perGpuModelRatio.toFixed(
              1,
            )}x its memory); shard the model (tensor/pipeline/FSDP) across ${formatCount(
              effectiveGpuDemand,
            )} GPUs. Data parallelism only adds throughput.`
          : needsDistributed
            ? `${formatCount(
                clusterGpus,
              )} GPUs run data-parallel all-reduce to finish a ~${formatDurationShort(
                estimatedSingleHostSeconds,
              )} single-host run faster; each replica still holds a full model copy.`
            : 'The model and dataset fit on a single host, so one trainer suffices.',
      },
      trackingScale: {
        ratio: trackingRatio,
        valueText: `${formatCount(experimentsTracked)} ${pluralize('experiment', experimentsTracked)}`,
        copy: needsTracking
          ? `${formatCount(experimentsTracked)} experiments cannot be compared in a spreadsheet; log params and metrics to a tracker.`
          : 'A handful of experiments still fit in a notes file or spreadsheet.',
      },
      registryGovernance: {
        ratio: registryRatio,
        valueText: needsCiCd ? 'Continuous' : needsRegistry ? 'Versioned' : 'Ad-hoc',
        copy: needsCiCd
          ? 'Automated retraining promotes only models that pass evaluation gates, so a registry with stages is mandatory.'
          : needsRegistry
            ? 'Versioned models with stage and approval metadata give a controlled path to production.'
            : 'Few models means hand-tracking which artifact is live is still tolerable.',
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
      text: `${formatCount(analysis.trainingJobsPerDay)} jobs/day over ${Math.round(
        analysis.pipelineStages,
      )} stages should run as a scheduled, repeatable pipeline DAG.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Run volume and stage count are low enough to launch training by hand from a notebook.',
    });
  }

  // 2. Data + lineage.
  if (analysis.needsDataVersioning) {
    reasons.push({
      severity: analysis.datasetGigabytes > datasetGbPerSingleNode ? 'warning' : 'ok',
      text: `${formatStorageGigabytes(analysis.datasetGigabytes)} changing ${formatCount(
        analysis.datasetVersions,
      )}x/month needs pinned data versions and lineage so runs reproduce exactly.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'A small, rarely-changing dataset is read straight from disk with no versioning layer.',
    });
  }

  // 3. Training scale-out (throughput) vs model sharding (memory) — kept distinct.
  if (analysis.needsModelSharding) {
    reasons.push({
      severity: analysis.modelParams > modelParamsPerSingleGpu * 10 ? 'danger' : 'warning',
      text: `A ${formatCount(
        analysis.modelParams,
      )}-param model is too big for one GPU; shard the model itself (tensor/pipeline parallelism or FSDP/ZeRO) across the cluster — data parallelism alone cannot make it fit.`,
    });
  } else if (analysis.needsDistributed) {
    reasons.push({
      severity: analysis.effectiveGpuDemand > clusterScaleOutBudget ? 'danger' : 'warning',
      text: `${formatCount(
        analysis.clusterGpus,
      )} GPUs are past one host; data-parallel training all-reduces gradients across replicas to finish faster, each holding a full model copy.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'The model and dataset fit on one host, so a single trainer is enough — no distribution or sharding yet.',
    });
  }

  // 4. Experiment tracking.
  if (analysis.needsTracking) {
    reasons.push({
      severity: 'warning',
      text: `${formatCount(
        analysis.experimentsTracked,
      )} tracked runs cannot be compared by hand; log params, metrics, and artifacts to a tracker.`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.experimentsTracked,
      )} runs still fit in a notes file or spreadsheet without a tracker.`,
    });
  }

  // 5. Model registry.
  if (analysis.needsRegistry) {
    reasons.push({
      severity: 'ok',
      text: 'A model registry versions candidates with stage and approval metadata, giving a controlled path to production.',
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Few models means tracking which artifact is live by hand is still tolerable.',
    });
  }

  // 6. Automated retraining / CI-CD.
  if (analysis.needsCiCd) {
    reasons.push({
      severity: 'warning',
      text: 'Automated retraining fires pipelines on new data, runs evaluation gates, and promotes only passing models to serving.',
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: 'Retraining is manual, so a human still launches runs and promotes models deliberately.',
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
    ? `A ${formatCount(
        flags.modelParams,
      )}-param model is too big for one GPU; shard the model with tensor/pipeline parallelism or FSDP/ZeRO. Data parallelism raises throughput but does not make it fit.`
    : flags.needsDistributed
      ? `Coordinate ${formatCount(
          flags.clusterGpus,
        )} GPUs with data-parallel all-reduce so wall-clock time drops; each replica keeps a full model copy.`
      : 'One host holds the model and dataset, so a single trainer is enough.';

  return {
    orchestration: {
      state: flags.needsOrchestration ? 'needed' : 'not-yet',
      copy: flags.needsOrchestration
        ? `Run the ${Math.round(
            flags.pipelineStages,
          )}-stage workflow as a scheduled DAG (Kubeflow/TFX-style) so it repeats reliably.`
        : 'No orchestrator yet — a notebook launches the few daily runs directly.',
    },
    dataVersioning: {
      state: flags.needsDataVersioning ? 'needed' : 'not-yet',
      copy: flags.needsDataVersioning
        ? `Version the dataset (DVC-style) and capture lineage so any of the ${formatCount(
            flags.datasetVersions,
          )} monthly versions can be reproduced.`
        : 'A small, stable dataset is read straight from disk without version control.',
    },
    distributed: {
      state: flags.needsCluster ? 'needed' : 'not-yet',
      copy: distributedCopy,
    },
    tracking: {
      state: flags.needsTracking ? 'needed' : 'not-yet',
      copy: flags.needsTracking
        ? `Log params, metrics, and artifacts for ${formatCount(
            flags.experimentsTracked,
          )} experiments so runs are comparable and reproducible.`
        : 'A handful of experiments still fit in a spreadsheet or notes file.',
    },
    registry: {
      state: flags.needsRegistry ? (flags.needsCiCd ? 'needed' : 'useful') : 'not-yet',
      copy: flags.needsRegistry
        ? 'Register versioned models with stage and approval metadata so the live model is always known.'
        : 'Few models means tracking the live artifact by hand is still tolerable.',
    },
    cicd: {
      state: flags.needsCiCd ? 'needed' : flags.needsRegistry ? 'useful' : 'not-yet',
      copy: flags.needsCiCd
        ? 'Trigger retraining on new data, gate on evaluation, and promote passing models to serving automatically.'
        : flags.needsRegistry
          ? 'A manual promote-to-serving step is fine until retraining frequency forces automation.'
          : 'No deployment automation yet — models are handed off manually.',
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
    return 'Single notebook + one GPU';
  }
  if (flags.needsCiCd) {
    return 'Continuous MLOps platform';
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
    return 'One notebook on one machine trains and evaluates by hand. A pipeline, a cluster, and a registry are all premature.';
  }
  if (flags.needsCiCd) {
    return 'A scheduled pipeline pulls versioned data, trains data-parallel on the cluster, logs to a tracker, and CI/CD promotes gated models to serving automatically.';
  }
  if (flags.needsTracking || flags.needsRegistry) {
    return 'A scheduled pipeline over versioned data feeds the training cluster, while an experiment tracker and a versioned model registry give provenance and governance.';
  }
  if (flags.needsCluster) {
    return flags.needsModelSharding
      ? 'A scheduled pipeline pins data versions and shards a too-big model (tensor/pipeline/FSDP) across the cluster; data parallelism is added for throughput, not to make the model fit.'
      : 'A scheduled pipeline pins data versions and runs data-parallel training across many GPUs to finish faster than one host could.';
  }
  return 'Runs are codified into a scheduled DAG over versioned data so they repeat reliably as volume grows.';
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

function pluralize(unit: string, value: number): string {
  return Math.round(value) === 1 ? unit : `${unit}s`;
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
