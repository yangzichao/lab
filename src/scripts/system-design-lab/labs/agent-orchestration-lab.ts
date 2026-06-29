import { buildColumnDiagram } from '../diagram-layout';
import { formatCount, formatRate } from '../lab-formatters';
import type {
  DecisionState,
  LabAnalysis,
  LabReason,
  SystemDesignLabDefinition,
  WorkloadValues,
} from '../lab-types';

// Conservative teaching budgets (not vendor limits).
const llmCallsPerSecondPerGatewayLane = 200; // sustained in-flight LLM calls one gateway lane handles before queueing.
const gatewayTokensPerSecondPerLane = 250_000; // tokens/s one gateway lane streams before it must batch and shed.
const sandboxExecutionsPerSecondPerWorker = 40; // tool executions one sandbox worker pool sustains.
const comfortableContextTokens = 32_000; // beyond this a single task's context needs active management.
const toolRegistryRoutingBudget = 30; // tools the model can reliably pick among in one prompt before routing helps.
const comfortableConcurrentSessions = 50; // sessions one runtime instance schedules before horizontal scaling.

export const agentOrchestrationLabDefinition: SystemDesignLabDefinition = {
  id: 'agent-orchestration',
  eyebrow: '系统设计 Lab',
  title:
    'LLM agent 本质上是一个 reason-act loop —— 它的成本、latency、影响半径，都随每个任务的 step 数一起涨。',
  summary:
    '调节并发 session 数、每个任务的 tool call 与 step 数、LLM latency、context 大小，以及注册了多少 tool。设计会从单次 tool call 演进成 reason-act loop，再加上 memory 和 planning、sandbox 后面的并行 tool execution，最后变成带全链路 tracing 的 multi-agent orchestration。',
  controls: [
    {
      id: 'concurrentSessions',
      label: 'Concurrent agent sessions',
      help: '同时跑各自 agent loop 的任务数。每个都持有 context，还可能有 tool call 正在飞行中。',
      min: 1,
      max: 50_000,
      defaultValue: 10,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'toolCallsPerTask',
      label: 'Tool calls per task',
      help: '一个任务在结束前平均发起多少次 tool 调用。',
      min: 0,
      max: 200,
      defaultValue: 4,
      scale: 'linear',
      unit: '次',
      format: 'count',
    },
    {
      id: 'maxStepsPerTask',
      label: 'Max steps per task',
      help: '一次 run 被截断前允许的 loop 迭代数（每次迭代是一个 LLM 决策）。',
      min: 1,
      max: 200,
      defaultValue: 8,
      scale: 'log',
      unit: 'steps',
      format: 'count',
    },
    {
      id: 'llmLatencyMs',
      label: 'Avg LLM call latency',
      help: '一次模型决策的耗时。串行的 loop 每个 step 都要付一次这个时间。',
      min: 200,
      max: 20_000,
      defaultValue: 1_500,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'contextTokens',
      label: 'Context window tokens',
      help: '每个任务的工作 context：system prompt、历史、tool 结果。每个 step 都会变大。',
      min: 2_000,
      max: 1_000_000,
      defaultValue: 16_000,
      scale: 'log',
      unit: 'tokens',
      format: 'count',
    },
    {
      id: 'toolsRegistered',
      label: 'Tools registered',
      help: 'agent 可选的不同 tool 数量。太多会挤爆 prompt、扰乱选择。',
      min: 1,
      max: 2_000,
      defaultValue: 8,
      scale: 'log',
      unit: '个',
      format: 'count',
    },
    {
      id: 'tokenThroughput',
      label: 'Aggregate token throughput',
      help: '所有 session 加起来、每秒推过 LLM gateway 的 token 数。',
      min: 100,
      max: 5_000_000,
      defaultValue: 5_000,
      scale: 'log',
      format: 'operations-per-second',
    },
  ],
  toggles: [
    {
      id: 'longTermMemory',
      label: 'Long-term memory (vector)',
      help: '通过 vector store 把事实跨任务持久化并取回，超出对话窗口的范围。',
      defaultValue: false,
    },
    {
      id: 'sandboxedExecution',
      label: 'Sandboxed tool execution',
      help: '把 tool（代码、shell、副作用）跑在隔离的 sandbox 里，让不可信操作伤不到 host。',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'single-tool',
      step: '01',
      title: 'Single tool call',
      summary: '一次模型调用挑一个 tool 然后返回。还没有 loop。',
      values: {
        concurrentSessions: 2,
        toolCallsPerTask: 1,
        maxStepsPerTask: 1,
        llmLatencyMs: 1_200,
        contextTokens: 4_000,
        toolsRegistered: 3,
        tokenThroughput: 500,
        longTermMemory: false,
        sandboxedExecution: false,
      },
    },
    {
      id: 'reason-act-loop',
      step: '02',
      title: 'Reason-act loop',
      summary: 'agent 开始迭代：决策、调一个 tool、观察、重复。',
      values: {
        concurrentSessions: 8,
        toolCallsPerTask: 5,
        maxStepsPerTask: 8,
        llmLatencyMs: 1_500,
        contextTokens: 16_000,
        toolsRegistered: 8,
        tokenThroughput: 5_000,
        longTermMemory: false,
        sandboxedExecution: true,
      },
    },
    {
      id: 'memory-and-planning',
      step: '03',
      title: 'Memory + planning',
      summary: '长 context 和跨任务记忆需要 memory management。',
      values: {
        concurrentSessions: 60,
        toolCallsPerTask: 6,
        maxStepsPerTask: 20,
        llmLatencyMs: 2_000,
        contextTokens: 120_000,
        toolsRegistered: 40,
        tokenThroughput: 60_000,
        longTermMemory: true,
        sandboxedExecution: true,
      },
    },
    {
      id: 'parallel-tools',
      step: '04',
      title: 'Parallel tools + sandbox',
      summary: '每个 step 的多个 tool 在隔离后面并发执行。',
      values: {
        concurrentSessions: 300,
        toolCallsPerTask: 40,
        maxStepsPerTask: 40,
        llmLatencyMs: 2_500,
        contextTokens: 250_000,
        toolsRegistered: 200,
        tokenThroughput: 600_000,
        longTermMemory: true,
        sandboxedExecution: true,
      },
    },
    {
      id: 'multi-agent-scale',
      step: '05',
      title: 'Multi-agent at scale',
      summary: '上千个 session、深 run、全链路 tracing 加 guardrail。',
      values: {
        concurrentSessions: 20_000,
        toolCallsPerTask: 120,
        maxStepsPerTask: 120,
        llmLatencyMs: 3_000,
        contextTokens: 800_000,
        toolsRegistered: 1_000,
        tokenThroughput: 4_000_000,
        longTermMemory: true,
        sandboxedExecution: true,
      },
    },
  ],
  diagram: buildColumnDiagram({
    title: 'LLM agent orchestration 架构图',
    description:
      '一个 LLM agent 系统的白板风格架构图：clients、跑着 reason-act loop 和 planner 的 agent runtime、带 sandboxed execution 的 tool registry、short-term 与 long-term vector memory 加上 LLM gateway，以及一条异步的 tracing 和 observability pipeline。',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: '任务 + 流式',
            kind: 'client',
            summary: '提交一个任务，并随 agent run 推进把过程流式返回',
          },
        ],
      },
      {
        id: 'runtime',
        label: 'Agent runtime',
        variant: 'edge',
        nodes: [
          {
            id: 'agentLoop',
            title: 'Agent loop',
            subtitle: 'reason + act',
            kind: 'scheduler',
            summary: '驱动 decide-call-observe 这个 loop，并对每个任务执行 step 预算',
          },
          {
            id: 'planner',
            title: 'Planner',
            subtitle: '拆解任务',
            kind: 'scheduler',
            summary: '把一个目标拆成子步骤，再把活儿串行排开或 fan out 出去',
          },
        ],
      },
      {
        id: 'tools',
        label: 'Tool execution',
        variant: 'backbone',
        nodes: [
          {
            id: 'toolRegistry',
            title: 'Tool registry',
            subtitle: 'schemas + routing',
            kind: 'service',
            summary: '存放 tool schema，并从一堆 tool 里把模型 route 到对的那个',
          },
          {
            id: 'sandbox',
            title: 'Sandbox',
            subtitle: '隔离执行',
            kind: 'container',
            summary: '在隔离的 worker pool 里跑不可信的 tool 代码和副作用',
          },
        ],
      },
      {
        id: 'memoryModel',
        label: 'Memory + LLM',
        variant: 'storage',
        nodes: [
          {
            id: 'shortTermMemory',
            title: 'Conversation',
            subtitle: 'short-term',
            kind: 'cache',
            summary: '保存工作 context，并做 summarization 或截断',
          },
          {
            id: 'vectorMemory',
            title: 'Vector memory',
            subtitle: 'long-term',
            kind: 'search',
            summary: '把事实 embed 后跨任务取回，超出 context window 的范围',
          },
          {
            id: 'llmGateway',
            title: 'LLM gateway',
            subtitle: '模型调用',
            kind: 'gpu',
            summary: '对每个 step 发出的大量模型调用做 batch、rate-limit 和 retry',
          },
        ],
      },
      {
        id: 'observability',
        label: 'Observability',
        variant: 'processing',
        nodes: [
          {
            id: 'tracing',
            title: 'Tracing',
            subtitle: 'async spans',
            kind: 'service',
            summary: '在 hot path 之外记录每个 step、tool call 和 token 成本',
          },
          {
            id: 'guardrails',
            title: 'Guardrails',
            subtitle: 'retry + 限额',
            kind: 'service',
            summary: '校验输出、对失败做 retry，并强制执行成本和 loop 上限',
          },
        ],
      },
    ],
    flows: [
      { from: 'client', to: 'agentLoop', variant: 'primary' },
      { from: 'agentLoop', to: 'planner', variant: 'secondary' },
      { from: 'agentLoop', to: 'toolRegistry', variant: 'primary' },
      { from: 'toolRegistry', to: 'sandbox', variant: 'primary' },
      { from: 'agentLoop', to: 'shortTermMemory', variant: 'secondary' },
      { from: 'agentLoop', to: 'llmGateway', variant: 'direct' },
      { from: 'shortTermMemory', to: 'vectorMemory', variant: 'secondary' },
      { from: 'sandbox', to: 'shortTermMemory', variant: 'secondary' },
      { from: 'agentLoop', to: 'tracing', variant: 'secondary' },
      { from: 'agentLoop', to: 'guardrails', variant: 'secondary' },
    ],
  }),
  meters: [
    { id: 'llmCallVolume', label: 'LLM call 量' },
    { id: 'taskLatency', label: '串行任务 latency' },
    { id: 'sandboxLoad', label: 'Sandbox execution 负载' },
    { id: 'contextPressure', label: 'Context window 压力' },
    { id: 'toolSelection', label: 'Tool selection 复杂度' },
  ],
  decisions: [
    { id: 'agentLoop', title: 'Agent loop / planning' },
    { id: 'toolRouting', title: 'Tool registry + routing' },
    { id: 'sandbox', title: 'Sandboxed execution' },
    { id: 'memory', title: 'Memory（short / long-term）' },
    { id: 'contextManagement', title: 'Context management' },
    { id: 'observability', title: 'Observability + guardrails' },
  ],
  sourceBackedRules: [
    {
      title: 'reason 和 act 交错，让 agent 去迭代，而不是只答一次',
      source: 'ReAct (Yao et al.)',
      url: 'https://arxiv.org/abs/2210.03629',
      summary:
        'ReAct 把 reasoning trace 和 action 交错起来，让模型决策、行动、观察、再重复 —— 所有按 step 数计的成本和 latency 都源自这个 loop 结构。',
    },
    {
      title: '模型可以被教会在 generation 过程中调用 tool/API',
      source: 'Toolformer (Schick et al.)',
      url: 'https://arxiv.org/abs/2302.04761',
      summary:
        'Toolformer 展示了模型自己学会何时、如何调用外部 tool，这正是为什么要有一个让模型去选的 tool registry，而不是写死的调用。',
    },
    {
      title: 'Tool-use API 定义了一个 registry，模型从这些 tool schema 里挑选',
      source: 'Anthropic tool use docs',
      url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview',
      summary:
        '生产环境的 tool calling 会把 JSON tool schema 传给模型；一个 prompt 里塞太多会让选择变差，这就是为什么 registry 一变大 routing 就重要起来。',
    },
    {
      title: '多 step 的 agent run 需要在每个 LLM 和 tool span 上做 tracing',
      source: 'OpenAI Agents SDK docs',
      url: 'https://developers.openai.com/docs/guides/agents',
      summary:
        'orchestration 的指南把 per-step tracing、retry 和 guardrail 当作一等公民，因为多 step 的 run 比单个请求难调试得多。',
    },
  ],
  teachingAssumptions: [
    '串行任务 latency 假设各 step 一个接一个跑；并行 tool 缩短的是 wall-clock，不是 LLM call 总数。',
    'per-lane 的 LLM 预算和 per-worker 的 sandbox 预算是保守的教学数字，不是 provider 的真实上限。',
    'Context 压力是拿当前工作窗口对比一个舒适的单任务预算；long-term 记忆被建模成一条独立的 vector 路径。',
  ],
  teachingWalkthrough: [
    {
      id: 'one-call',
      step: '01',
      focus: '一个 tool，一次 call',
      scenarioId: 'single-tool',
      question:
        '一个任务做单次模型调用，挑一个 tool 然后返回结果。这时候你需要 loop、memory 或 sandbox 吗？',
      reveal:
        '不需要。只有一个 step 时没什么可迭代的，context 不会变大，也没有不可信内容累积需要隔离。这就是挂了个 function call 的 request-response —— planner、vector memory、tracing 在这里都是没有负载撑得起的多余零件。',
      takeaway: '单次 tool call 还算不上 agent；等 loop 出现了再加机制。',
    },
    {
      id: 'the-loop',
      step: '02',
      focus: 'reason-act loop',
      scenarioId: 'reason-act-loop',
      question:
        '现在任务迭代约 8 个 step，每个是一次 LLM call 加一次 tool execution。如果一次模型调用是 1.5 s，用户看到的 latency 主要被什么主导？',
      reveal:
        '是那一串串行的 LLM call。8 个 step、每个约 1.5 s，光模型时间就约 12 s，还没算 tool 的活儿 —— latency 随 step 数线性增长。这也是你第一次需要隔离执行的地方：tool 现在会产生真实副作用，所以 sandbox 把不可信操作挡在 host 之外。',
      takeaway: 'latency 和成本随每个任务的 step 数增长；loop 才是你要优化的工作单元。',
    },
    {
      id: 'memory',
      step: '03',
      focus: 'Context 撑爆窗口',
      scenarioId: 'memory-and-planning',
      question:
        'run 现在到了 20 个 step、约 120k token 的累积历史。如果你只是一味把每个 tool 结果往 context 里追加，会坏在哪？',
      reveal:
        'context window 会被填满，每个 step 的成本也会涨，因为你每次 call 都把整段 transcript 重发一遍。你要用 summarization/截断 来管理 short-term memory，并把持久的事实推到 vector store，让它们跨任务存活，而不是把每个 prompt 撑大。planner 则让长 run 不至于跑偏。',
      takeaway: 'Context 是每个 step 的预算；把对话 summarize 掉，把要长期留存的事实卸载到 vector memory。',
    },
    {
      id: 'parallel',
      step: '04',
      focus: '把 tool fan out',
      scenarioId: 'parallel-tools',
      question:
        '一个 step 发出 40 次 tool call，而你注册了几百个 tool。怎么在不改变 LLM 决策次数的前提下压缩 wall-clock 时间？',
      reveal:
        '把相互独立的 tool call 在 sandbox pool 后面并行执行，这样一个 step 只等最慢的那个 tool，而不是所有时间之和。在几百个 tool 时，选择本身会变差，所以 registry 要 route（retrieval / namespacing）到一个相关子集，而不是把每个 schema 都塞进 prompt。',
      takeaway: '把独立的 tool 并行化来压缩 latency；给大 registry 做 route，让模型选得准。',
    },
    {
      id: 'scale',
      step: '05',
      focus: '很多 agent、深 run',
      scenarioId: 'multi-agent-scale',
      question:
        '两万个 session 跑 120 个 step 的任务，每秒推过几百万 token。除了加容量，现在什么是不可妥协的？',
      reveal:
        'observability 和 guardrail。到这个深度，没有 per-step tracing 一个失败的 run 根本没法调；失控的 loop 或成本飙升必须靠硬性的 step/预算上限和 retry 策略来封顶。LLM gateway 则变成所有 session 共享的、被 rate-limit 和 batch 的瓶颈。',
      takeaway: '到了规模化阶段，orchestration 层面的事 —— tracing、guardrail、gateway 上限 —— 比任何单次模型调用都更重要。',
    },
  ],
  analyze: analyzeAgentOrchestrationWorkload,
};

function analyzeAgentOrchestrationWorkload(workload: WorkloadValues): LabAnalysis {
  const concurrentSessions = numericValue(workload, 'concurrentSessions');
  const toolCallsPerTask = numericValue(workload, 'toolCallsPerTask');
  const maxStepsPerTask = numericValue(workload, 'maxStepsPerTask');
  const llmLatencyMs = numericValue(workload, 'llmLatencyMs');
  const contextTokens = numericValue(workload, 'contextTokens');
  const toolsRegistered = numericValue(workload, 'toolsRegistered');
  const tokenThroughput = numericValue(workload, 'tokenThroughput');
  const longTermMemory = Boolean(workload.longTermMemory);
  const sandboxedExecution = Boolean(workload.sandboxedExecution);

  // A task is a loop when it can take more than one step or makes more than one tool call.
  const isLoop = maxStepsPerTask > 1 || toolCallsPerTask > 1;
  // Approximate in-flight LLM calls/s: each session cycles one model call per llmLatencyMs.
  const llmCallsPerSecond = concurrentSessions / (llmLatencyMs / 1000);
  const sandboxExecPerSecond = sandboxedExecution
    ? (concurrentSessions * toolCallsPerTask) / Math.max(maxStepsPerTask, 1) / (llmLatencyMs / 1000)
    : 0;
  // Sequential wall-clock for one task: one LLM call per step.
  const sequentialTaskLatencySeconds = (maxStepsPerTask * llmLatencyMs) / 1000;

  const needsPlanner = maxStepsPerTask >= 10 || toolCallsPerTask >= 8;
  const needsRouting = toolsRegistered > toolRegistryRoutingBudget;
  const needsSandbox = sandboxedExecution;
  const needsLongTermMemory = longTermMemory;
  const needsContextManagement = contextTokens > comfortableContextTokens;
  const needsParallelTools = toolCallsPerTask >= 8 && maxStepsPerTask >= 1;
  // Observability/guardrails become non-negotiable with deep runs or large fleets.
  const needsObservability =
    maxStepsPerTask >= 20 ||
    concurrentSessions >= 500 ||
    tokenThroughput > 100_000;

  // The gateway saturates on whichever bites first: in-flight call count or raw
  // token throughput. Wiring tokenThroughput here makes the slider move the meter.
  const tokenThroughputRatio = tokenThroughput / gatewayTokensPerSecondPerLane;
  const llmRatio = Math.max(
    llmCallsPerSecond / llmCallsPerSecondPerGatewayLane,
    tokenThroughputRatio,
  );
  const sandboxRatio = needsSandbox
    ? sandboxExecPerSecond / sandboxExecutionsPerSecondPerWorker
    : 0;
  const contextRatio = contextTokens / comfortableContextTokens;
  const toolSelectionRatio = toolsRegistered / toolRegistryRoutingBudget;
  // Latency gets uncomfortable past ~10s of sequential model time.
  const latencyRatio = sequentialTaskLatencySeconds / 10;

  const flags = {
    isLoop,
    needsPlanner,
    needsRouting,
    needsSandbox,
    needsLongTermMemory,
    needsContextManagement,
    needsParallelTools,
    needsObservability,
  };

  const heavyLlm = llmRatio > 1;
  // `fleet` warns the agent-loop node once a single runtime instance is over its
  // session budget, before the run is deep enough to be full multi-agent.
  const fleet = concurrentSessions >= comfortableConcurrentSessions;
  // Multi-agent orchestration is only the headline when both the fleet is large
  // and runs are deep — otherwise the design is "loop + managed memory".
  const multiAgentScale = concurrentSessions >= 500 && maxStepsPerTask >= 40;

  return {
    architectureTitle: chooseArchitectureTitle(flags, multiAgentScale),
    architectureSummary: chooseArchitectureSummary(flags, multiAgentScale),
    architecturePath: chooseArchitecturePath(flags),
    nodeStates: {
      client: 'ok',
      agentLoop: isLoop ? (fleet ? 'warning' : 'ok') : 'ok',
      planner: needsPlanner ? 'needed' : 'inactive',
      toolRegistry: toolCallsPerTask > 0 ? (needsRouting ? 'needed' : 'ok') : 'inactive',
      sandbox: needsSandbox ? (sandboxRatio > 1 ? 'overloaded' : 'needed') : 'inactive',
      shortTermMemory: isLoop ? (needsContextManagement ? 'warning' : 'ok') : 'ok',
      vectorMemory: needsLongTermMemory ? 'needed' : 'inactive',
      llmGateway: heavyLlm ? 'overloaded' : 'ok',
      tracing: needsObservability ? 'needed' : 'inactive',
      guardrails: needsObservability ? 'needed' : 'inactive',
    },
    flowStates: {
      clientToAgentLoop: 'active',
      agentLoopToPlanner: needsPlanner ? 'active' : 'inactive',
      agentLoopToToolRegistry: toolCallsPerTask > 0 ? 'active' : 'inactive',
      toolRegistryToSandbox: needsSandbox && toolCallsPerTask > 0 ? (sandboxRatio > 1 ? 'warning' : 'active') : 'inactive',
      agentLoopToShortTermMemory: isLoop ? 'active' : 'inactive',
      agentLoopToLlmGateway: heavyLlm ? 'warning' : 'active',
      shortTermMemoryToVectorMemory: needsLongTermMemory ? 'active' : 'inactive',
      sandboxToShortTermMemory: needsSandbox && toolCallsPerTask > 0 ? 'active' : 'inactive',
      agentLoopToTracing: needsObservability ? 'active' : 'inactive',
      agentLoopToGuardrails: needsObservability ? 'active' : 'inactive',
    },
    meters: {
      llmCallVolume: {
        ratio: llmRatio,
        valueText: `${formatRate(llmCallsPerSecond)} calls/s · ${formatRate(tokenThroughput)} tok/s`,
        copy: heavyLlm
          ? `${formatCount(concurrentSessions)} 个 session 上约 ${formatRate(llmCallsPerSecond)} 次模型调用/s、${formatRate(tokenThroughput)} tokens/s，会打满一条 gateway lane；做 batch 和 rate-limit。`
          : `${formatCount(concurrentSessions)} 个 session 上大约 ${formatRate(llmCallsPerSecond)} 次模型调用/s、${formatRate(tokenThroughput)} tokens/s 正在飞行中。`,
      },
      taskLatency: {
        ratio: latencyRatio,
        valueText: formatSeconds(sequentialTaskLatencySeconds),
        copy: needsParallelTools
          ? `${Math.round(maxStepsPerTask)} 个串行 step，每个 ${formatCount(llmLatencyMs)} ms；并行 tool 砍掉的是 tool 等待，不是 LLM 这条链。`
          : `${Math.round(maxStepsPerTask)} 个 step 一个接一个跑，每个都付一次 ${formatCount(llmLatencyMs)} ms 的模型调用。`,
      },
      sandboxLoad: {
        ratio: sandboxRatio,
        valueText: needsSandbox ? `${formatRate(sandboxExecPerSecond)} exec/s` : 'off',
        copy: needsSandbox
          ? `Tool execution 隔离运行，约 ${formatRate(sandboxExecPerSecond)}/s；worker pool 随之扩容。`
          : 'tool 在进程内运行 —— 对可信 tool 没问题，一旦碰到不可信代码就不安全了。',
      },
      contextPressure: {
        ratio: contextRatio,
        valueText: `${formatCount(contextTokens)} tokens`,
        copy: needsContextManagement
          ? `每个任务 ${formatCount(contextTokens)} tokens 超过了舒适窗口；每个 step 都要 summarize 或截断。`
          : `${formatCount(contextTokens)} tokens 装得进单个窗口，不用主动管理。`,
      },
      toolSelection: {
        ratio: toolSelectionRatio,
        valueText: `${formatCount(toolsRegistered)} tools`,
        copy: needsRouting
          ? `${formatCount(toolsRegistered)} 个 tool 挤爆了 prompt；route 到一个相关子集，而不是把每个 schema 都发过去。`
          : `${formatCount(toolsRegistered)} 个 tool 装得进 prompt，模型可以直接挑。`,
      },
    },
    decisions: buildDecisions({
      ...flags,
      toolCallsPerTask,
      maxStepsPerTask,
      toolsRegistered,
      contextTokens,
      concurrentSessions,
    }),
    reasons: buildReasons({
      ...flags,
      heavyLlm,
      fleet,
      llmCallsPerSecond,
      sequentialTaskLatencySeconds,
      sandboxRatio,
      contextTokens,
      toolsRegistered,
      maxStepsPerTask,
      concurrentSessions,
      toolCallsPerTask,
    }),
  };
}

type ArchitectureFlags = {
  isLoop: boolean;
  needsPlanner: boolean;
  needsRouting: boolean;
  needsSandbox: boolean;
  needsLongTermMemory: boolean;
  needsContextManagement: boolean;
  needsParallelTools: boolean;
  needsObservability: boolean;
};

function buildReasons(
  analysis: ArchitectureFlags & {
    heavyLlm: boolean;
    fleet: boolean;
    llmCallsPerSecond: number;
    sequentialTaskLatencySeconds: number;
    sandboxRatio: number;
    contextTokens: number;
    toolsRegistered: number;
    maxStepsPerTask: number;
    concurrentSessions: number;
    toolCallsPerTask: number;
  },
): LabReason[] {
  // Critical reasons first (so slice(0,7) keeps the scale concerns on the
  // busiest scenarios), then guaranteed baselines, then top up to >= 4.
  const critical: LabReason[] = [];

  if (analysis.heavyLlm) {
    critical.push({
      severity: 'danger',
      text: `${formatCount(
        analysis.concurrentSessions,
      )} 个 session 上约 ${formatRate(
        analysis.llmCallsPerSecond,
      )} 次模型调用/s 打满了 gateway；集中做 batch、rate-limit 和 retry。`,
    });
  }

  if (analysis.needsObservability) {
    critical.push({
      severity: 'warning',
      text: '规模化的深 run 需要 per-step tracing 和硬性的 step/预算 guardrail，才能保持可调试、有边界。',
    });
  }

  if (analysis.sandboxRatio > 1) {
    critical.push({
      severity: 'danger',
      text: 'sandbox 里的 tool execution 超过了一个 worker pool 的承载；扩容 pool 才能安全隔离不可信副作用。',
    });
  }

  if (analysis.needsContextManagement) {
    critical.push({
      severity: 'warning',
      text: `每个任务 ${formatCount(
        analysis.contextTokens,
      )} tokens，逼着每个 step 都做 summarization 或截断，才能压住成本和窗口。`,
    });
  }

  if (analysis.needsParallelTools) {
    critical.push({
      severity: 'warning',
      text: `每个任务 ${Math.round(
        analysis.toolCallsPerTask,
      )} 次 tool call 应该并行跑，这样一个 step 只等最慢的 tool，而不是所有时间之和。`,
    });
  }

  if (analysis.needsRouting) {
    critical.push({
      severity: 'warning',
      text: `${formatCount(
        analysis.toolsRegistered,
      )} 个已注册 tool 挤爆了 prompt；把模型 route 到一个相关子集。`,
    });
  }

  if (analysis.needsLongTermMemory) {
    critical.push({
      severity: 'ok',
      text: 'long-term vector memory 跨任务取回持久的事实，而不是把每个 prompt 撑大。',
    });
  }

  // Always-present reasons describing the core of the loop, escalation-aware so
  // they read sensibly whether the workload is tiny or huge.
  const baseline: LabReason[] = [];

  if (!analysis.isLoop) {
    baseline.push({
      severity: 'ok',
      text: '只有一个 step，这就是挂了个 tool 的 request-response —— loop、memory、planner 现在都没必要。',
    });
  } else {
    baseline.push({
      severity: analysis.sequentialTaskLatencySeconds > 10 ? 'warning' : 'ok',
      text: `${Math.round(analysis.maxStepsPerTask)} 个串行 step 光模型时间就约 ${formatSeconds(
        analysis.sequentialTaskLatencySeconds,
      )}；latency 随 step 数线性增长。`,
    });
  }

  if (!analysis.heavyLlm) {
    baseline.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.concurrentSessions,
      )} 个 session 上约 ${formatRate(
        analysis.llmCallsPerSecond,
      )} 次模型调用/s，还在一条 gateway lane 之内；暂时没有 batching 压力。`,
    });
  }

  if (analysis.needsSandbox && analysis.sandboxRatio <= 1) {
    baseline.push({
      severity: 'ok',
      text: 'tool 跑在隔离的 sandbox 里，不可信代码和副作用都碰不到 host。',
    });
  } else if (!analysis.needsSandbox) {
    baseline.push({
      severity: 'warning',
      text: 'tool 在进程内运行 —— 只有在所有 tool 都可信时才能接受；不可信代码需要 sandboxing。',
    });
  }

  // Informational top-ups, only used if we are still short of four reasons.
  const fillers: LabReason[] = [];

  if (!analysis.needsContextManagement) {
    fillers.push({
      severity: 'ok',
      text: `每个任务 ${formatCount(
        analysis.contextTokens,
      )} tokens 还装得进一个窗口，所以追加 tool 结果不用主动管理。`,
    });
  }

  if (!analysis.needsRouting) {
    fillers.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.toolsRegistered,
      )} 个 tool schema 装得进 prompt，所以模型不用 routing 就能直接挑。`,
    });
  }

  const reasons = [...critical, ...baseline];
  for (const filler of fillers) {
    if (reasons.length >= 4) {
      break;
    }
    reasons.push(filler);
  }

  return reasons.slice(0, 7);
}

function buildDecisions(
  flags: ArchitectureFlags & {
    toolCallsPerTask: number;
    maxStepsPerTask: number;
    toolsRegistered: number;
    contextTokens: number;
    concurrentSessions: number;
  },
): Record<string, { state: DecisionState; copy: string }> {
  return {
    agentLoop: {
      state: flags.isLoop ? (flags.needsPlanner ? 'needed' : 'useful') : 'not-yet',
      copy: flags.isLoop
        ? flags.needsPlanner
          ? `又长又多 tool 的任务需要 planner 来拆解目标，并让 ${Math.round(
              flags.maxStepsPerTask,
            )} 个 step 的 run 不跑偏。`
          : 'reason-act loop 驱动 decide-call-observe；run 还短的时候 planner 是可选的。'
        : '只有一个 step，还没有 loop —— 这是挂了个 tool 的单次模型调用。',
    },
    toolRouting: {
      state: flags.toolCallsPerTask > 0 ? (flags.needsRouting ? 'needed' : 'useful') : 'not-yet',
      copy:
        flags.toolCallsPerTask > 0
          ? flags.needsRouting
            ? `在 ${formatCount(
                flags.toolsRegistered,
              )} 个 tool 里做 route（retrieval / namespacing）；一个 prompt 里 schema 太多会伤害选择。`
            : `${formatCount(flags.toolsRegistered)} 个 tool schema 直接装进 prompt 让模型挑。`
          : '还没有调用任何 tool，所以 registry 没用上。',
    },
    sandbox: {
      state: flags.needsSandbox ? 'needed' : 'tradeoff',
      copy: flags.needsSandbox
        ? '把 tool 代码和副作用跑在隔离的 sandbox 里，让不可信操作伤不到 host。'
        : '进程内执行更快，但对不可信 tool 不安全 —— 这是一个有意为之的信任权衡。',
    },
    memory: {
      state: flags.needsLongTermMemory ? 'needed' : flags.isLoop ? 'useful' : 'not-yet',
      copy: flags.needsLongTermMemory
        ? 'short-term 对话 memory，加上一个 vector store 做持久的跨任务记忆。'
        : flags.isLoop
          ? 'short-term 对话 memory 撑住这个 loop；long-term 记忆暂时还不需要。'
          : '单个 step 除了请求本身不需要任何 memory。',
    },
    contextManagement: {
      state: flags.needsContextManagement ? 'needed' : flags.isLoop ? 'useful' : 'not-yet',
      copy: flags.needsContextManagement
        ? `每个任务 ${formatCount(
            flags.contextTokens,
          )} tokens，要求每个 step 都做 summarization 或截断，来控住成本和窗口。`
        : flags.isLoop
          ? 'Context 还装得进窗口；眼下追加 tool 结果没问题。'
          : '单 step 的 context 不用管理。',
    },
    observability: {
      state: flags.needsObservability ? 'needed' : flags.isLoop ? 'useful' : 'not-yet',
      copy: flags.needsObservability
        ? '给每个 step 和 tool span 做 tracing，并对每个 run 强制执行 retry、step 和成本 guardrail。'
        : flags.isLoop
          ? 'run 还浅、fleet 还小的时候，基础 logging 就够了。'
          : '单次 call 很容易观测，不需要专门的 tracing。',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags, multiAgentScale: boolean): string {
  if (!flags.isLoop) {
    return '单次模型调用 + tool';
  }
  if (multiAgentScale && flags.needsObservability) {
    return 'Multi-agent orchestration + 全链路 tracing';
  }
  if (flags.needsParallelTools && flags.needsSandbox) {
    return 'Reason-act loop + 并行 sandboxed tool';
  }
  if (flags.needsContextManagement || flags.needsLongTermMemory) {
    return 'Reason-act loop + 受管 memory';
  }
  return 'Reason-act loop + tool registry';
}

function chooseArchitectureSummary(flags: ArchitectureFlags, multiAgentScale: boolean): string {
  if (!flags.isLoop) {
    return '单次模型调用挑一个 tool 然后返回。loop、memory、planner、tracing 现在都没必要。';
  }
  if (multiAgentScale && flags.needsObservability) {
    return '很多 agent session 跑深任务，带 planner、做过 route 的 tool registry、sandboxed 并行执行、short-term 与 long-term memory，以及在一条被 rate-limit 的 LLM gateway 上的 per-step tracing 加硬性 guardrail。';
  }
  if (flags.needsParallelTools && flags.needsSandbox) {
    return 'reason-act loop 把相互独立的 tool call 在 sandbox pool 后面并行 fan out，同时管理每个 step 不断变大的对话 context。';
  }
  if (flags.needsContextManagement || flags.needsLongTermMemory) {
    return '一个带 planner 的 reason-act loop 每个 step 都把对话 summarize 掉，并把持久的事实卸载到 vector store，让 context window 保持有界。';
  }
  return 'reason-act loop 在一个小 tool registry 上迭代 decide-call-observe，当 tool 碰到真实副作用时把执行隔离进 sandbox。';
}

function chooseArchitecturePath(flags: ArchitectureFlags): string {
  if (!flags.isLoop) {
    return 'Task -> model call -> tool -> result';
  }
  if (flags.needsParallelTools && flags.needsSandbox) {
    return 'Loop -> LLM -> registry -> parallel sandbox -> memory';
  }
  if (flags.needsContextManagement || flags.needsLongTermMemory) {
    return 'Loop -> LLM -> tools -> summarize + vector memory';
  }
  return 'Loop -> LLM -> tool registry -> sandbox -> observe';
}

function numericValue(workload: WorkloadValues, key: string): number {
  const value = workload[key];
  return typeof value === 'number' ? value : 0;
}

function formatSeconds(seconds: number): string {
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} min`;
  }
  if (seconds >= 10) {
    return `${Math.round(seconds)} s`;
  }
  return `${seconds.toFixed(1)} s`;
}
