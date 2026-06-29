import {
  formatCount,
  formatDuration,
  formatRate,
  formatStorageGigabytes,
} from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  NodeState,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

const comfortableWorkerSlots = 250;
const resultLookupBudgetPerSecond = 50_000;
const testBlobReadBudgetPerSecond = 25_000;
const metadataRowsPerGigabyte = 1_200_000;

export const onlineJudgeLabDefinition: SystemDesignLabDefinition = {
  id: 'leetcode-online-judge',
  eyebrow: '系统设计 Lab',
  title: 'Online Judge 的扩展主要是 worker 经济学，而不是 API 流量。',
  summary:
    '把滑块从一个玩具 judge 推到接近 LeetCode 的工作负载。当 compilation 和 sandbox 执行成为主导时，设计就变了：异步提交、把活儿排进 queue、预热 container、缓存不可变的结果，并把重型 submit 和轻量 run-code 流量拆开。',
  articleHref: '/blog/system-design/leetcode-online-judge/',
  controls: [
    {
      id: 'submissionsPerMinute',
      label: '提交量',
      help: '进入 judge pipeline 的正式 submit 请求。',
      min: 1,
      max: 200_000,
      defaultValue: 240,
      scale: 'log',
      format: 'requests-per-minute',
    },
    {
      id: 'workerSecondsPerSubmission',
      label: 'Worker 时间',
      help: '一次 submission 的平均 compile 加测试执行时间。',
      min: 0.2,
      max: 60,
      defaultValue: 2,
      scale: 'log',
      format: 'duration-seconds',
    },
    {
      id: 'testCasesPerSubmission',
      label: 'Test case',
      help: '一次完整 submission 在出最终 verdict 前可能跑多少个测试。',
      min: 1,
      max: 500,
      defaultValue: 40,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'languageCount',
      label: '语言数',
      help: '每种语言往往需要自己的 runtime image 和 warm pool。',
      min: 1,
      max: 30,
      defaultValue: 6,
      scale: 'linear',
      unit: '种',
      format: 'count',
    },
    {
      id: 'resultPollsPerSubmission',
      label: 'Result poll 次数',
      help: '用户看到最终结果前，平均的 GET /submissions/{token} 调用次数。',
      min: 1,
      max: 30,
      defaultValue: 4,
      scale: 'linear',
      unit: '次',
      format: 'count',
    },
    {
      id: 'queueSlaSeconds',
      label: 'Queue 等待目标',
      help: '执行开始前，用户应该在 queue 里等多久。',
      min: 1,
      max: 600,
      defaultValue: 30,
      scale: 'log',
      format: 'duration-seconds',
    },
  ],
  toggles: [
    {
      id: 'strictSandbox',
      label: '严格 sandbox 隔离',
      help: '用户代码在 resource limit、文件系统隔离和拦截危险 syscall 的条件下运行。',
      defaultValue: true,
    },
    {
      id: 'persistEverySubmission',
      label: '持久化每一次 submission',
      help: '最终 verdict 和源码 metadata 必须能熬过 cache 过期和 worker 故障。',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'toy',
      step: '01',
      title: '玩具 judge',
      summary: '一个同步原型还行得通。',
      values: {
        submissionsPerMinute: 4,
        workerSecondsPerSubmission: 0.4,
        testCasesPerSubmission: 5,
        languageCount: 1,
        resultPollsPerSubmission: 1,
        queueSlaSeconds: 30,
        strictSandbox: false,
        persistEverySubmission: false,
      },
    },
    {
      id: 'async',
      step: '02',
      title: '异步 submit',
      summary: 'POST 返回一个 token；worker 稍后才完成。',
      values: {
        submissionsPerMinute: 240,
        workerSecondsPerSubmission: 2,
        testCasesPerSubmission: 40,
        languageCount: 6,
        resultPollsPerSubmission: 4,
        queueSlaSeconds: 30,
        strictSandbox: true,
        persistEverySubmission: true,
      },
    },
    {
      id: 'contest',
      step: '03',
      title: '比赛尖峰',
      summary: '决定用户等待时间的是 queue depth，而不是 API CPU。',
      values: {
        submissionsPerMinute: 8_000,
        workerSecondsPerSubmission: 3,
        testCasesPerSubmission: 80,
        languageCount: 8,
        resultPollsPerSubmission: 6,
        queueSlaSeconds: 20,
        strictSandbox: true,
        persistEverySubmission: true,
      },
    },
    {
      id: 'many-languages',
      step: '04',
      title: '多语言',
      summary: 'runtime image 和 cold start 把设计推向按语言划分的 pool。',
      values: {
        submissionsPerMinute: 18_000,
        workerSecondsPerSubmission: 4,
        testCasesPerSubmission: 120,
        languageCount: 20,
        resultPollsPerSubmission: 7,
        queueSlaSeconds: 18,
        strictSandbox: true,
        persistEverySubmission: true,
      },
    },
    {
      id: 'leetcode-scale',
      step: '05',
      title: 'LeetCode 规模',
      summary: 'worker、result cache、metadata partition 和 queue 隔离全都重要。',
      values: {
        submissionsPerMinute: 90_000,
        workerSecondsPerSubmission: 5,
        testCasesPerSubmission: 200,
        languageCount: 24,
        resultPollsPerSubmission: 8,
        queueSlaSeconds: 12,
        strictSandbox: true,
        persistEverySubmission: true,
      },
    },
  ],
  diagram: {
    title: 'Online Judge 架构图',
    description:
      '白板风格的架构图，展示异步代码提交、queueing、sandbox worker、result cache 和持久化的 submission metadata。',
    viewBox: '0 0 1040 560',
    zones: [
      { id: 'clients', label: '客户端', x: 20, y: 70, width: 150, height: 360, variant: 'clients' },
      { id: 'api', label: 'API', x: 210, y: 45, width: 185, height: 410, variant: 'edge' },
      { id: 'queue', label: 'Queueing', x: 435, y: 70, width: 170, height: 385, variant: 'backbone' },
      { id: 'execution', label: '执行', x: 645, y: 70, width: 185, height: 385, variant: 'processing' },
      { id: 'storage', label: '存储 + 结果', x: 870, y: 45, width: 150, height: 440, variant: 'storage' },
    ],
    flows: [
      { id: 'clientToApi', path: 'M155 245 C190 245 190 160 225 160', variant: 'primary' },
      { id: 'apiToQueue', path: 'M365 160 C405 160 405 205 450 205', variant: 'primary' },
      { id: 'queueToScheduler', path: 'M570 205 C615 205 615 175 660 175', variant: 'primary' },
      { id: 'schedulerToWorkers', path: 'M735 222 L735 285', variant: 'primary' },
      { id: 'workersToContainers', path: 'M735 365 L735 425', variant: 'primary' },
      { id: 'apiToMetadata', path: 'M365 175 C545 112 742 110 885 120', variant: 'secondary' },
      { id: 'workersToResultCache', path: 'M820 330 C850 315 852 270 885 270', variant: 'secondary' },
      { id: 'workersToMetadata', path: 'M820 315 C850 250 852 150 885 125', variant: 'secondary' },
      { id: 'workersToObjectStore', path: 'M820 355 C855 385 860 420 885 420', variant: 'secondary' },
      { id: 'pollToResultCache', path: 'M155 260 C420 500 720 300 885 270', variant: 'direct' },
      { id: 'syncDirect', path: 'M155 276 C420 210 540 325 660 325', variant: 'direct' },
    ],
    nodes: [
      { id: 'client', title: '用户', subtitle: 'submit + poll', x: 48, y: 210, width: 108, height: 92, kind: 'client' },
      { id: 'api', title: 'API server', subtitle: '202 token + 状态', x: 225, y: 125, width: 140, height: 92, kind: 'api' },
      { id: 'metadataDb', title: 'Submission DB', subtitle: 'append metadata', x: 885, y: 85, width: 120, height: 86, kind: 'db' },
      { id: 'queue', title: 'Queue', subtitle: 'backpressure', x: 450, y: 165, width: 120, height: 90, kind: 'queue' },
      { id: 'scheduler', title: 'Scheduler', subtitle: 'priority + fairness', x: 660, y: 135, width: 150, height: 92, kind: 'scheduler' },
      { id: 'workers', title: 'Worker pool', subtitle: 'compile + run', x: 660, y: 285, width: 150, height: 96, kind: 'compute' },
      { id: 'containers', title: 'Warm runner', subtitle: '按语言', x: 660, y: 420, width: 150, height: 82, kind: 'container' },
      { id: 'resultCache', title: 'Result cache', subtitle: '不可变 verdict', x: 885, y: 250, width: 120, height: 90, kind: 'cache' },
      { id: 'objectStore', title: 'Object store', subtitle: '代码 + 测试', x: 885, y: 400, width: 120, height: 82, kind: 'objectstore' },
    ],
    mobileStages: [
      {
        label: '客户端',
        nodes: [{ id: 'client', title: '用户', summary: '提交代码，并轮询不可变的 verdict' }],
      },
      {
        label: 'API',
        nodes: [{ id: 'api', title: 'API server', summary: '校验请求、存 metadata，并返回一个 token' }],
      },
      {
        label: 'Queueing',
        nodes: [{ id: 'queue', title: 'Queue', summary: '吸收尖峰，并给 worker 一个 pull-based 的 backlog' }],
      },
      {
        label: '执行',
        nodes: [
          { id: 'scheduler', title: 'Scheduler', summary: '施加 fairness、priority 和 queue 选择' },
          { id: 'workers', title: 'Worker pool', summary: 'CPU 和内存吃重的 compilation 与执行' },
          { id: 'containers', title: 'Warm runner', summary: '按语言划分的 sandbox container' },
        ],
      },
      {
        label: '存储 + 结果',
        nodes: [
          { id: 'metadataDb', title: 'Submission DB', summary: 'durable 的 append-only verdict 历史' },
          { id: 'resultCache', title: 'Result cache', summary: '带 TTL 的廉价轮询读取' },
          { id: 'objectStore', title: 'Object store', summary: '大块的源码、题目和 testcase blob' },
        ],
      },
    ],
  },
  meters: [
    { id: 'workerCapacity', label: 'Worker 容量' },
    { id: 'queuePressure', label: 'Queue 压力' },
    { id: 'resultLookup', label: 'Result lookup' },
    { id: 'sandboxPool', label: 'Sandbox pool' },
    { id: 'submissionStorage', label: 'Submission 存储' },
  ],
  decisions: [
    { id: 'asyncApi', title: '异步 API' },
    { id: 'messageQueue', title: 'Message queue' },
    { id: 'prewarmedContainers', title: '预热 runner' },
    { id: 'sandbox', title: 'Sandbox 隔离' },
    { id: 'resultCache', title: 'Result cache' },
    { id: 'runSubmitSplit', title: 'Run / submit 拆分' },
  ],
  sourceBackedRules: [
    {
      title: 'container 的 resource limit 是执行 TLE 和 MLE 的单位',
      source: 'Docker Docs',
      url: 'https://docs.docker.com/engine/containers/resource_constraints/',
      summary:
        'CPU 和内存 limit 给 worker 基础设施一个具体手段，去中止那些超出题目约束的 submission。',
    },
    {
      title: 'Seccomp 缩小了不可信代码的 syscall 攻击面',
      source: 'Docker Docs',
      url: 'https://docs.docker.com/engine/security/seccomp/',
      summary:
        'sandbox 应该拦截危险的 system call，而不是仅仅信任语言 runtime 或进程权限。',
    },
    {
      title: 'queue 把 submit 流量和 worker 执行解耦',
      source: 'AWS SQS Docs',
      url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html',
      summary:
        'queue 吸收突发流量，让 worker 按自己的节奏消费，这正好契合异步判题。',
    },
    {
      title: '带 TTL 的 key-value 结果让轮询很廉价',
      source: 'Redis Docs',
      url: 'https://redis.io/docs/latest/commands/expire/',
      summary:
        '最终 verdict 是不可变的，所以短轮询可以一直读一个小的缓存对象，直到这个 key 过期。',
    },
  ],
  teachingAssumptions: [
    'worker slot 的阈值是教学阈值；真实容量取决于语言组合、testcase 大小、CPU 型号和隔离开销。',
    'result cache 存的是最终或进行中的 verdict 对象，不是源码 blob。',
    '这里故意不要求 Kafka，除非设计需要 replay、分析 fanout 或多个 consumer。',
  ],
  teachingWalkthrough: [
    {
      id: 'toy',
      step: '01',
      focus: '一个原型',
      scenarioId: 'toy',
      question:
        '一个玩具 judge 只收到零星几次 submission。API 能不能就在同一个请求里 compile、运行并返回 verdict？',
      reveal:
        '在这个量级，可以——同步运行是最简单的正确设计。但要注意，现在请求要为数秒的不可信代码执行一直挂着，而这恰恰是流量一来就会崩的地方。',
      takeaway: '同步执行在玩具规模没问题，但它把请求时间和运行时间耦在了一起。',
    },
    {
      id: 'async',
      step: '02',
      focus: '解耦运行时间',
      scenarioId: 'async',
      question:
        'submission 上来了，单次运行要好几秒。为什么要立刻返回一个 token，而不是返回 verdict？',
      reveal:
        '把请求挂上好几秒会占着 API 容量，负载一高就 timeout。应该接收 submission、持久化 metadata、返回一个 token，让 worker 异步执行，客户端这边轮询。',
      takeaway: '把 submission 和执行解耦：快速接收、异步运行、轮询 verdict。',
    },
    {
      id: 'contest',
      step: '03',
      focus: '比赛尖峰',
      scenarioId: 'contest',
      question:
        '比赛一开始，submission 暴涨 50 倍。真正决定用户等多久的，是 API CPU 还是别的东西？',
      reveal:
        'API 很便宜；成本在 sandbox 执行上。queue 吸收尖峰，给 worker 一个 pull-based 的 backlog，于是用户等待时间由 queue depth 和 worker 数量决定，而不是 API throughput。',
      takeaway: '在 online judge 里，决定等待的是 queue depth 和 worker slot，而不是 API CPU。',
    },
    {
      id: 'many-languages',
      step: '04',
      focus: '多种 runtime',
      scenarioId: 'many-languages',
      question:
        '现在你要支持很多语言。为什么单一通用的 worker pool 反而会让延迟更糟？',
      reveal:
        '每种语言都需要自己的 runtime image，cold-start 错的那个会平白多出几秒。按语言划分的 warm pool 让 runner 保持热着，于是一次 submission 落到一个就绪的 sandbox 上，而不必付 cold start。',
      takeaway: '一旦 runtime 和 cold start 分化，按语言的 warm pool 就胜过单一通用 pool。',
    },
    {
      id: 'leetcode-scale',
      step: '05',
      focus: '完整平台规模',
      scenarioId: 'leetcode-scale',
      question:
        '到了平台规模，除了加 worker，还有什么必须扩展？',
      reveal:
        'verdict 是不可变的，所以 result cache 吸收轮询；submission metadata 做 partition；比赛流量拿到隔离的 queue，这样某个赛事的尖峰不会饿死所有人。',
      takeaway: '用缓存不可变 verdict、partition 的 metadata 和隔离的 queue 来扩展这个 judge。',
    },
  ],
  analyze: analyzeOnlineJudgeWorkload,
};

function analyzeOnlineJudgeWorkload(workload: WorkloadValues): LabAnalysis {
  const submissionsPerMinute = numericValue(workload, 'submissionsPerMinute');
  const workerSecondsPerSubmission = numericValue(workload, 'workerSecondsPerSubmission');
  const testCasesPerSubmission = numericValue(workload, 'testCasesPerSubmission');
  const languageCount = numericValue(workload, 'languageCount');
  const resultPollsPerSubmission = numericValue(workload, 'resultPollsPerSubmission');
  const queueSlaSeconds = numericValue(workload, 'queueSlaSeconds');
  const strictSandbox = Boolean(workload.strictSandbox);
  const persistEverySubmission = Boolean(workload.persistEverySubmission);

  const submissionsPerSecond = submissionsPerMinute / 60;
  const workerSlotDemand = submissionsPerSecond * workerSecondsPerSubmission;
  const workerPressure = workerSlotDemand / comfortableWorkerSlots;
  const pollingReadsPerSecond = submissionsPerSecond * resultPollsPerSubmission;
  const testBlobReadsPerSecond = submissionsPerSecond * testCasesPerSubmission;
  const dailySubmissions = submissionsPerMinute * 60 * 24;
  const submissionMetadataGigabytesPerDay = dailySubmissions / metadataRowsPerGigabyte;
  const coldStartRisk = languageCount / 8 + Math.max(0, 15 - queueSlaSeconds) / 15;

  const needsAsyncApi = workerSecondsPerSubmission > 0.8 || submissionsPerMinute >= 30;
  const needsQueue = needsAsyncApi || workerPressure > 0.05;
  const needsWorkers = workerSlotDemand >= 1 || languageCount > 1;
  const needsPrewarmedContainers =
    strictSandbox && (languageCount > 2 || queueSlaSeconds <= 45 || workerSlotDemand > 20);
  const needsResultCache = pollingReadsPerSecond >= 5 || resultPollsPerSubmission > 1;
  const needsPersistentMetadata = persistEverySubmission || submissionMetadataGigabytesPerDay >= 1;
  const needsPriorityScheduling = submissionsPerMinute >= 5_000 || queueSlaSeconds <= 20;
  const needsObjectStore = testCasesPerSubmission >= 10 || languageCount > 1;

  return {
    architectureTitle: chooseArchitectureTitle({
      needsAsyncApi,
      needsQueue,
      needsPrewarmedContainers,
      needsPriorityScheduling,
      needsResultCache,
    }),
    architectureSummary: chooseArchitectureSummary({
      needsAsyncApi,
      needsQueue,
      needsPrewarmedContainers,
      needsPriorityScheduling,
      needsResultCache,
    }),
    architecturePath: chooseArchitecturePath({
      needsAsyncApi,
      needsQueue,
      needsPrewarmedContainers,
      needsPriorityScheduling,
      needsResultCache,
    }),
    nodeStates: {
      client: 'ok',
      api: 'ok',
      metadataDb: stateFor(needsPersistentMetadata),
      queue: stateFor(needsQueue),
      scheduler: stateFor(needsPriorityScheduling),
      workers: needsWorkers ? (workerPressure > 1 ? 'overloaded' : 'needed') : 'inactive',
      containers: stateFor(needsPrewarmedContainers),
      resultCache: stateFor(needsResultCache),
      objectStore: stateFor(needsObjectStore),
    },
    flowStates: {
      clientToApi: 'active',
      apiToQueue: needsQueue ? 'active' : 'inactive',
      queueToScheduler: needsPriorityScheduling ? 'active' : needsQueue ? 'active' : 'inactive',
      schedulerToWorkers: needsQueue || needsWorkers ? 'active' : 'inactive',
      workersToContainers: needsPrewarmedContainers ? 'active' : 'inactive',
      apiToMetadata: needsPersistentMetadata ? 'active' : 'inactive',
      workersToResultCache: needsResultCache ? 'active' : 'inactive',
      workersToMetadata: needsPersistentMetadata ? 'active' : 'inactive',
      workersToObjectStore: needsObjectStore ? 'active' : 'inactive',
      pollToResultCache: needsResultCache ? 'active' : 'inactive',
      syncDirect: needsAsyncApi ? 'inactive' : 'active',
    },
    meters: {
      workerCapacity: {
        ratio: workerPressure,
        valueText: `${formatCount(workerSlotDemand)} 个 slot`,
        copy: `${formatRate(submissionsPerSecond)} submissions/s 乘以 ${formatDuration(
          workerSecondsPerSubmission,
        )} 的平均 worker 时间。`,
      },
      queuePressure: {
        ratio: workerPressure * (30 / Math.max(queueSlaSeconds, 1)),
        valueText: formatDuration(queueSlaSeconds),
        copy: 'queue 等待目标越紧，尖峰来临前需要预留的空闲 worker 余量就越多。',
      },
      resultLookup: {
        ratio: pollingReadsPerSecond / resultLookupBudgetPerSecond,
        valueText: `${formatRate(pollingReadsPerSecond)}/s`,
        copy: '当轮询只是对不可变 verdict 对象做一次 TTL key-value lookup 时，它就一直很廉价。',
      },
      sandboxPool: {
        ratio: coldStartRisk,
        valueText: `${formatCount(languageCount)} 种语言`,
        copy: '语言越多、等待目标越紧，cold start 就越会让用户感知到。',
      },
      submissionStorage: {
        ratio: submissionMetadataGigabytesPerDay / 50,
        valueText: `${formatStorageGigabytes(submissionMetadataGigabytesPerDay)}/day`,
        copy: `${formatCount(dailySubmissions)} 行/天的 submission row，这还不算源码和 testcase blob。`,
      },
    },
    decisions: buildDecisions({
      needsAsyncApi,
      needsQueue,
      needsPrewarmedContainers,
      needsPriorityScheduling,
      needsResultCache,
      strictSandbox,
      persistEverySubmission,
    }),
    reasons: buildReasons({
      submissionsPerSecond,
      workerSecondsPerSubmission,
      workerSlotDemand,
      workerPressure,
      pollingReadsPerSecond,
      testBlobReadsPerSecond,
      languageCount,
      queueSlaSeconds,
      needsAsyncApi,
      needsQueue,
      needsPrewarmedContainers,
      needsPriorityScheduling,
      needsResultCache,
      strictSandbox,
      persistEverySubmission,
    }),
  };
}

function buildReasons(analysis: {
  submissionsPerSecond: number;
  workerSecondsPerSubmission: number;
  workerSlotDemand: number;
  workerPressure: number;
  pollingReadsPerSecond: number;
  testBlobReadsPerSecond: number;
  languageCount: number;
  queueSlaSeconds: number;
  needsAsyncApi: boolean;
  needsQueue: boolean;
  needsPrewarmedContainers: boolean;
  needsPriorityScheduling: boolean;
  needsResultCache: boolean;
  strictSandbox: boolean;
  persistEverySubmission: boolean;
}): LabReason[] {
  const reasons: LabReason[] = [];

  if (analysis.needsAsyncApi) {
    reasons.push({
      severity: 'warning',
      text: `每次 submission 都会占用 worker 资源大约 ${formatDuration(
        analysis.workerSecondsPerSubmission,
      )}。返回 202 加一个 token，而不是把 API 请求一直挂着。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: '一个极小的原型可以同步运行，但一旦执行时间盖过请求时间，这种做法就不再有吸引力。',
    });
  }

  if (analysis.needsQueue) {
    reasons.push({
      severity: analysis.workerPressure > 1 ? 'danger' : 'warning',
      text: `这个工作负载大约需要 ${formatCount(
        analysis.workerSlotDemand,
      )} 个并发 worker slot。queue depth 是扩容的直接信号。`,
    });
  }

  if (analysis.needsPrewarmedContainers) {
    reasons.push({
      severity: 'warning',
      text: `支持 ${formatCount(
        analysis.languageCount,
      )} 种语言让 cold start 和 image 管理变得显眼。保留按语言划分的 warm runner pool。`,
    });
  }

  if (analysis.strictSandbox) {
    reasons.push({
      severity: 'warning',
      text: '对不可信代码来说，严格 sandbox 没有商量余地：resource limit、文件系统/网络隔离和 syscall 过滤都该在 worker 路径里。',
    });
  }

  if (analysis.needsResultCache) {
    reasons.push({
      severity: analysis.pollingReadsPerSecond > resultLookupBudgetPerSecond ? 'danger' : 'ok',
      text: `${formatRate(
        analysis.pollingReadsPerSecond,
      )} 次 result poll/s 应该是廉价的 key-value 读取。verdict 是不可变的，所以轮询不必打到 worker 或重型应用逻辑上。`,
    });
  }

  if (analysis.needsPriorityScheduling) {
    reasons.push({
      severity: 'warning',
      text: `在尖峰流量下，${formatDuration(
        analysis.queueSlaSeconds,
      )} 的 queue 目标需要 priority queue，或者拆分 Run Code / Submit pipeline。`,
    });
  }

  if (analysis.testBlobReadsPerSecond > testBlobReadBudgetPerSecond * 0.6) {
    reasons.push({
      severity: analysis.testBlobReadsPerSecond > testBlobReadBudgetPerSecond ? 'danger' : 'warning',
      text: `${formatRate(
        analysis.testBlobReadsPerSecond,
      )} 次 testcase 读取/s 应该来自 object storage 或本地 worker cache，而不是 metadata database。`,
    });
  }

  return reasons.slice(0, 7);
}

function buildDecisions(flags: {
  needsAsyncApi: boolean;
  needsQueue: boolean;
  needsPrewarmedContainers: boolean;
  needsPriorityScheduling: boolean;
  needsResultCache: boolean;
  strictSandbox: boolean;
  persistEverySubmission: boolean;
}): Record<string, { state: DecisionState; copy: string }> {
  return {
    asyncApi: {
      state: flags.needsAsyncApi ? 'needed' : 'not-yet',
      copy: flags.needsAsyncApi
        ? 'POST 应该返回 202 和一个 token，因为 compile 和执行远比 API 校验重得多。'
        : '只有在本地、任务极小的原型里，同步执行才可以接受。',
    },
    messageQueue: {
      state: flags.needsQueue ? 'needed' : 'not-yet',
      copy: flags.needsQueue
        ? '用一个 queue 来吸收尖峰、施加 backpressure，并让 worker 按自己的真实容量 pull。'
        : '在还没有像样的 backlog 或 worker pool 时，queue 价值不大。',
    },
    prewarmedContainers: {
      state: flags.needsPrewarmedContainers ? 'needed' : 'useful',
      copy: flags.needsPrewarmedContainers
        ? '预热按语言划分的 runner container，免得 cold start 变成虚假的延迟或 TLE 信号。'
        : '在语言数和延迟预期都还小时，cold start 是可以忍的。',
    },
    sandbox: {
      state: flags.strictSandbox ? 'needed' : 'tradeoff',
      copy: flags.strictSandbox
        ? '把不可信代码放进受约束的 container 里运行，带 CPU、内存、文件系统、网络和 syscall 边界。'
        : '只有在可信的课堂原型里，关掉 sandbox 才可以接受。',
    },
    resultCache: {
      state: flags.needsResultCache ? 'needed' : 'not-yet',
      copy: flags.needsResultCache
        ? '把进行中和最终的 verdict 对象存进带 TTL 的 cache，让轮询变成一次廉价的 lookup。'
        : '对玩具式的同步 judge，API 读自己的本地结果就行。',
    },
    runSubmitSplit: {
      state: flags.needsPriorityScheduling ? 'needed' : 'useful',
      copy: flags.needsPriorityScheduling
        ? '把 Run Code 和 Submit 拆开，免得轻量的样例运行挡住重型的判题 submission。'
        : '拆分 pipeline 以后有用，但在流量类别分化之前，一个 queue 就够了。',
    },
  };
}

function chooseArchitectureTitle(flags: {
  needsAsyncApi: boolean;
  needsQueue: boolean;
  needsPrewarmedContainers: boolean;
  needsPriorityScheduling: boolean;
  needsResultCache: boolean;
}): string {
  if (!flags.needsAsyncApi) {
    return '同步 API 原型';
  }
  if (!flags.needsQueue) {
    return '异步 API + 轻量 worker handoff';
  }
  if (!flags.needsPrewarmedContainers) {
    return '异步 submit + queue + worker pool';
  }
  if (!flags.needsPriorityScheduling && flags.needsResultCache) {
    return '基于 queue 的 judge + warm sandbox runner';
  }
  return 'priority queue + warm runner pool + 缓存的 verdict';
}

function chooseArchitectureSummary(flags: {
  needsAsyncApi: boolean;
  needsQueue: boolean;
  needsPrewarmedContainers: boolean;
  needsPriorityScheduling: boolean;
  needsResultCache: boolean;
}): string {
  if (!flags.needsAsyncApi) {
    return '对玩具工作负载，API 可以直接执行并返回结果。这用来验证判题逻辑还行，但不适合生产。';
  }
  if (!flags.needsQueue) {
    return 'API 应该不再把客户端请求挂着，但 worker 路径仍然简单到可以直接 handoff。';
  }
  if (!flags.needsPrewarmedContainers) {
    return 'queue 把用户流量和 worker throughput 解耦。扩展决策现在跟着 queue depth 和 worker slot 需求走。';
  }
  if (!flags.needsPriorityScheduling && flags.needsResultCache) {
    return 'worker 拉取任务，在 warm sandbox container 里运行代码，并把不可变的 verdict 写进 cache 供轮询。';
  }
  return '到了规模阶段，独立的 queue、公平调度、warm 语言 pool、result cache 和 durable metadata 让各类工作负载互不干扰。';
}

function chooseArchitecturePath(flags: {
  needsAsyncApi: boolean;
  needsQueue: boolean;
  needsPrewarmedContainers: boolean;
  needsPriorityScheduling: boolean;
  needsResultCache: boolean;
}): string {
  if (!flags.needsAsyncApi) {
    return 'Client -> API -> local judge -> response';
  }
  if (!flags.needsQueue) {
    return 'Client -> API 202 token -> worker -> status';
  }
  if (!flags.needsPrewarmedContainers) {
    return 'Client -> API -> queue -> worker pool -> metadata DB';
  }
  if (!flags.needsPriorityScheduling && flags.needsResultCache) {
    return 'Client -> API -> queue -> warm runner -> result cache + DB';
  }
  return 'Client -> API -> priority queues -> scheduler -> warm runners -> cache + DB + blobs';
}

function stateFor(needed: boolean): NodeState {
  return needed ? 'needed' : 'inactive';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}
