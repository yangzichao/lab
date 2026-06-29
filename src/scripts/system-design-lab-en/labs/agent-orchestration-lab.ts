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
  eyebrow: 'System Design Lab',
  title:
    'An LLM agent is a reason-act loop whose cost, latency, and blast radius all grow with the number of steps per task.',
  summary:
    'Tune concurrent sessions, tool calls and steps per task, LLM latency, context size, and how many tools are registered. The design grows from a single tool call into a reason-act loop, then adds memory and planning, parallel tool execution behind a sandbox, and finally multi-agent orchestration with full tracing at scale.',
  controls: [
    {
      id: 'concurrentSessions',
      label: 'Concurrent agent sessions',
      help: 'Tasks running their agent loop at the same time. Each holds context and may have tool calls in flight.',
      min: 1,
      max: 50_000,
      defaultValue: 10,
      scale: 'log',
      unit: 'sessions',
      format: 'count',
    },
    {
      id: 'toolCallsPerTask',
      label: 'Tool calls per task',
      help: 'Average number of tool invocations a task makes before it finishes.',
      min: 0,
      max: 200,
      defaultValue: 4,
      scale: 'linear',
      unit: 'calls',
      format: 'count',
    },
    {
      id: 'maxStepsPerTask',
      label: 'Max steps per task',
      help: 'Loop iterations (each is an LLM decision) allowed before the run is cut off.',
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
      help: 'Time for one model decision. Sequential loops pay this once per step.',
      min: 200,
      max: 20_000,
      defaultValue: 1_500,
      scale: 'log',
      format: 'milliseconds',
    },
    {
      id: 'contextTokens',
      label: 'Context window tokens',
      help: 'Working context per task: system prompt, history, tool results. Grows every step.',
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
      help: 'Distinct tools the agent can choose from. Too many crowd the prompt and confuse selection.',
      min: 1,
      max: 2_000,
      defaultValue: 8,
      scale: 'log',
      unit: 'tools',
      format: 'count',
    },
    {
      id: 'tokenThroughput',
      label: 'Aggregate token throughput',
      help: 'Tokens per second pushed through the LLM gateway across all sessions.',
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
      help: 'Persist and retrieve facts across tasks via a vector store, beyond the conversation window.',
      defaultValue: false,
    },
    {
      id: 'sandboxedExecution',
      label: 'Sandboxed tool execution',
      help: 'Run tools (code, shell, side effects) in an isolated sandbox so untrusted actions cannot harm the host.',
      defaultValue: true,
    },
  ],
  scenarios: [
    {
      id: 'single-tool',
      step: '01',
      title: 'Single tool call',
      summary: 'One model call picks one tool and returns. No loop yet.',
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
      summary: 'The agent iterates: decide, call a tool, observe, repeat.',
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
      summary: 'Long context and cross-task recall require memory management.',
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
      summary: 'Many tools per step run concurrently behind isolation.',
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
      summary: 'Thousands of sessions, deep runs, full tracing and guardrails.',
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
    title: 'LLM agent orchestration architecture diagram',
    description:
      'Whiteboard-style architecture diagram for an LLM agent system: clients, an agent runtime running the reason-act loop and planner, a tool registry with sandboxed execution, short-term and long-term vector memory plus the LLM gateway, and an async tracing and observability pipeline.',
    columns: [
      {
        id: 'clients',
        label: 'Clients',
        variant: 'clients',
        nodes: [
          {
            id: 'client',
            title: 'Client',
            subtitle: 'task + stream',
            kind: 'client',
            summary: 'submits a task and streams the agent run back as it progresses',
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
            summary: 'drives the decide-call-observe loop and enforces the step budget per task',
          },
          {
            id: 'planner',
            title: 'Planner',
            subtitle: 'decompose tasks',
            kind: 'scheduler',
            summary: 'breaks a goal into sub-steps and sequences or fans out the work',
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
            summary: 'holds tool schemas and routes the model to the right tool from many',
          },
          {
            id: 'sandbox',
            title: 'Sandbox',
            subtitle: 'isolated exec',
            kind: 'container',
            summary: 'runs untrusted tool code and side effects in an isolated worker pool',
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
            summary: 'keeps the working context and applies summarization or truncation',
          },
          {
            id: 'vectorMemory',
            title: 'Vector memory',
            subtitle: 'long-term',
            kind: 'search',
            summary: 'embeds and retrieves facts across tasks beyond the context window',
          },
          {
            id: 'llmGateway',
            title: 'LLM gateway',
            subtitle: 'model calls',
            kind: 'gpu',
            summary: 'batches, rate-limits, and retries the many model calls every step makes',
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
            summary: 'records each step, tool call, and token cost off the hot path',
          },
          {
            id: 'guardrails',
            title: 'Guardrails',
            subtitle: 'retries + limits',
            kind: 'service',
            summary: 'validates outputs, retries failures, and enforces cost and loop limits',
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
    { id: 'llmCallVolume', label: 'LLM call volume' },
    { id: 'taskLatency', label: 'Sequential task latency' },
    { id: 'sandboxLoad', label: 'Sandbox execution load' },
    { id: 'contextPressure', label: 'Context window pressure' },
    { id: 'toolSelection', label: 'Tool selection complexity' },
  ],
  decisions: [
    { id: 'agentLoop', title: 'Agent loop / planning' },
    { id: 'toolRouting', title: 'Tool registry + routing' },
    { id: 'sandbox', title: 'Sandboxed execution' },
    { id: 'memory', title: 'Memory (short / long-term)' },
    { id: 'contextManagement', title: 'Context management' },
    { id: 'observability', title: 'Observability + guardrails' },
  ],
  sourceBackedRules: [
    {
      title: 'Reason-and-act interleaving makes agents iterate, not answer once',
      source: 'ReAct (Yao et al.)',
      url: 'https://arxiv.org/abs/2210.03629',
      summary:
        'ReAct interleaves reasoning traces with actions so the model decides, acts, observes, and repeats — the loop structure that all step-count cost and latency follow from.',
    },
    {
      title: 'Models can be taught to call tools/APIs as part of generation',
      source: 'Toolformer (Schick et al.)',
      url: 'https://arxiv.org/abs/2302.04761',
      summary:
        'Toolformer shows the model itself learning when and how to invoke external tools, motivating a tool registry the model selects from rather than hard-coded calls.',
    },
    {
      title: 'Tool-use APIs define a registry of tool schemas the model picks among',
      source: 'Anthropic tool use docs',
      url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview',
      summary:
        'Production tool calling passes JSON tool schemas to the model; too many crowded into one prompt degrade selection, which is why routing matters as the registry grows.',
    },
    {
      title: 'Multi-step agent runs need tracing across each LLM and tool span',
      source: 'OpenAI Agents SDK docs',
      url: 'https://developers.openai.com/docs/guides/agents',
      summary:
        'Orchestration guidance treats per-step tracing, retries, and guardrails as first-class, because a multi-step run is much harder to debug than a single request.',
    },
  ],
  teachingAssumptions: [
    'Sequential task latency assumes steps run one after another; parallel tools shorten wall-clock but not total LLM calls.',
    'Per-lane LLM and per-worker sandbox budgets are conservative teaching numbers, not provider limits.',
    'Context pressure compares the working window against a comfortable single-task budget; long-term recall is modeled as a separate vector path.',
  ],
  teachingWalkthrough: [
    {
      id: 'one-call',
      step: '01',
      focus: 'One tool, one call',
      scenarioId: 'single-tool',
      question:
        'A task makes a single model call that picks one tool and returns the result. Do you need a loop, memory, or a sandbox yet?',
      reveal:
        'No. With one step there is nothing to iterate over, no growing context, and no untrusted accumulation to isolate. This is request-response with a function call attached — a planner, vector memory, and tracing would all be moving parts with no load to justify them.',
      takeaway: 'A single tool call is not an agent yet; add machinery only when the loop appears.',
    },
    {
      id: 'the-loop',
      step: '02',
      focus: 'The reason-act loop',
      scenarioId: 'reason-act-loop',
      question:
        'Now the task iterates ~8 steps, each an LLM call plus a tool execution. If one model call is 1.5 s, what dominates the user-visible latency?',
      reveal:
        'The chain of sequential LLM calls. Eight steps at ~1.5 s is ~12 s of model time alone before any tool work — latency scales linearly with steps. This is also where you first isolate execution: tools now run real side effects, so a sandbox keeps untrusted actions off the host.',
      takeaway: 'Latency and cost scale with steps per task; the loop is the unit of work to optimize.',
    },
    {
      id: 'memory',
      step: '03',
      focus: 'Context outgrows the window',
      scenarioId: 'memory-and-planning',
      question:
        'Runs now reach 20 steps and ~120k tokens of accumulated history. What breaks if you just keep appending every tool result to the context?',
      reveal:
        'The context window fills and cost per step climbs because you re-send the whole transcript every call. You manage short-term memory with summarization/truncation, and push durable facts to a vector store so they survive across tasks instead of bloating every prompt. A planner keeps long runs from wandering.',
      takeaway: 'Context is a budget per step; summarize the conversation and offload lasting facts to vector memory.',
    },
    {
      id: 'parallel',
      step: '04',
      focus: 'Fan out the tools',
      scenarioId: 'parallel-tools',
      question:
        'A step issues 40 tool calls and you have hundreds of tools registered. How do you cut wall-clock time without changing the number of LLM decisions?',
      reveal:
        'Execute independent tool calls in parallel behind the sandbox pool, so a step waits for the slowest tool, not the sum. With hundreds of tools, selection itself degrades, so the registry routes (retrieval / namespacing) to a relevant subset instead of stuffing every schema into the prompt.',
      takeaway: 'Parallelize independent tools to compress latency; route a large registry so the model picks well.',
    },
    {
      id: 'scale',
      step: '05',
      focus: 'Many agents, deep runs',
      scenarioId: 'multi-agent-scale',
      question:
        'Twenty thousand sessions run 120-step tasks pushing millions of tokens/s. Beyond more capacity, what is now non-negotiable?',
      reveal:
        'Observability and guardrails. At this depth a failed run is impossible to debug without per-step tracing, and runaway loops or cost spikes must be capped by hard step/budget limits and retry policies. The LLM gateway becomes a shared, rate-limited, batched bottleneck across all sessions.',
      takeaway: 'At scale the orchestration concerns — tracing, guardrails, gateway limits — matter more than any single model call.',
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
          ? `About ${formatRate(llmCallsPerSecond)} model calls/s and ${formatRate(tokenThroughput)} tokens/s across ${formatCount(concurrentSessions)} sessions saturate a gateway lane; batch and rate-limit.`
          : `Roughly ${formatRate(llmCallsPerSecond)} model calls/s and ${formatRate(tokenThroughput)} tokens/s in flight across ${formatCount(concurrentSessions)} sessions.`,
      },
      taskLatency: {
        ratio: latencyRatio,
        valueText: formatSeconds(sequentialTaskLatencySeconds),
        copy: needsParallelTools
          ? `${Math.round(maxStepsPerTask)} sequential steps at ${formatCount(llmLatencyMs)} ms each; parallel tools cut tool wait but not the LLM chain.`
          : `${Math.round(maxStepsPerTask)} steps run back-to-back, each paying one ${formatCount(llmLatencyMs)} ms model call.`,
      },
      sandboxLoad: {
        ratio: sandboxRatio,
        valueText: needsSandbox ? `${formatRate(sandboxExecPerSecond)} exec/s` : 'off',
        copy: needsSandbox
          ? `Tool executions run isolated at about ${formatRate(sandboxExecPerSecond)}/s; the worker pool scales with this.`
          : 'Tools run in-process — fine for trusted tools, unsafe once they touch untrusted code.',
      },
      contextPressure: {
        ratio: contextRatio,
        valueText: `${formatCount(contextTokens)} tokens`,
        copy: needsContextManagement
          ? `${formatCount(contextTokens)} tokens per task exceeds the comfortable window; summarize or truncate each step.`
          : `${formatCount(contextTokens)} tokens fits a single window without active management.`,
      },
      toolSelection: {
        ratio: toolSelectionRatio,
        valueText: `${formatCount(toolsRegistered)} tools`,
        copy: needsRouting
          ? `${formatCount(toolsRegistered)} tools crowd the prompt; route to a relevant subset instead of sending every schema.`
          : `${formatCount(toolsRegistered)} tools fit in the prompt, so the model can pick directly.`,
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
      text: `~${formatRate(
        analysis.llmCallsPerSecond,
      )} model calls/s across ${formatCount(
        analysis.concurrentSessions,
      )} sessions saturate the gateway; batch, rate-limit, and retry centrally.`,
    });
  }

  if (analysis.needsObservability) {
    critical.push({
      severity: 'warning',
      text: 'Deep runs at scale need per-step tracing and hard step/budget guardrails to stay debuggable and bounded.',
    });
  }

  if (analysis.sandboxRatio > 1) {
    critical.push({
      severity: 'danger',
      text: 'Sandboxed tool executions exceed one worker pool; scale the pool to isolate untrusted side effects safely.',
    });
  }

  if (analysis.needsContextManagement) {
    critical.push({
      severity: 'warning',
      text: `${formatCount(
        analysis.contextTokens,
      )} tokens per task forces summarization or truncation each step to keep cost and window in check.`,
    });
  }

  if (analysis.needsParallelTools) {
    critical.push({
      severity: 'warning',
      text: `${Math.round(
        analysis.toolCallsPerTask,
      )} tool calls per task should run in parallel so a step waits for the slowest tool, not the sum.`,
    });
  }

  if (analysis.needsRouting) {
    critical.push({
      severity: 'warning',
      text: `${formatCount(
        analysis.toolsRegistered,
      )} registered tools crowd the prompt; route the model to a relevant subset.`,
    });
  }

  if (analysis.needsLongTermMemory) {
    critical.push({
      severity: 'ok',
      text: 'Long-term vector memory retrieves durable facts across tasks instead of bloating every prompt.',
    });
  }

  // Always-present reasons describing the core of the loop, escalation-aware so
  // they read sensibly whether the workload is tiny or huge.
  const baseline: LabReason[] = [];

  if (!analysis.isLoop) {
    baseline.push({
      severity: 'ok',
      text: 'A single step makes this request-response with a tool attached — no loop, memory, or planner is justified yet.',
    });
  } else {
    baseline.push({
      severity: analysis.sequentialTaskLatencySeconds > 10 ? 'warning' : 'ok',
      text: `${Math.round(analysis.maxStepsPerTask)} sequential steps take ~${formatSeconds(
        analysis.sequentialTaskLatencySeconds,
      )} of model time alone; latency scales linearly with steps.`,
    });
  }

  if (!analysis.heavyLlm) {
    baseline.push({
      severity: 'ok',
      text: `~${formatRate(
        analysis.llmCallsPerSecond,
      )} model calls/s across ${formatCount(
        analysis.concurrentSessions,
      )} sessions stay within one gateway lane; no batching pressure yet.`,
    });
  }

  if (analysis.needsSandbox && analysis.sandboxRatio <= 1) {
    baseline.push({
      severity: 'ok',
      text: 'Tools run in an isolated sandbox so untrusted code and side effects cannot reach the host.',
    });
  } else if (!analysis.needsSandbox) {
    baseline.push({
      severity: 'warning',
      text: 'Tools run in-process — acceptable only while every tool is trusted; untrusted code needs sandboxing.',
    });
  }

  // Informational top-ups, only used if we are still short of four reasons.
  const fillers: LabReason[] = [];

  if (!analysis.needsContextManagement) {
    fillers.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.contextTokens,
      )} tokens per task still fits one window, so appending tool results needs no active management.`,
    });
  }

  if (!analysis.needsRouting) {
    fillers.push({
      severity: 'ok',
      text: `${formatCount(
        analysis.toolsRegistered,
      )} tool schemas fit in the prompt, so the model can pick directly without routing.`,
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
          ? `Long, multi-tool tasks need a planner to decompose the goal and keep ${Math.round(
              flags.maxStepsPerTask,
            )}-step runs from wandering.`
          : 'A reason-act loop drives decide-call-observe; a planner is optional while runs stay short.'
        : 'One step means no loop yet — this is a single model call with a tool attached.',
    },
    toolRouting: {
      state: flags.toolCallsPerTask > 0 ? (flags.needsRouting ? 'needed' : 'useful') : 'not-yet',
      copy:
        flags.toolCallsPerTask > 0
          ? flags.needsRouting
            ? `Route among ${formatCount(
                flags.toolsRegistered,
              )} tools (retrieval / namespacing); too many schemas in one prompt hurt selection.`
            : `${formatCount(flags.toolsRegistered)} tool schemas fit directly in the prompt for the model to choose.`
          : 'No tools called yet, so the registry is unused.',
    },
    sandbox: {
      state: flags.needsSandbox ? 'needed' : 'tradeoff',
      copy: flags.needsSandbox
        ? 'Run tool code and side effects in an isolated sandbox so untrusted actions cannot harm the host.'
        : 'In-process execution is faster but unsafe for untrusted tools — a deliberate trust tradeoff.',
    },
    memory: {
      state: flags.needsLongTermMemory ? 'needed' : flags.isLoop ? 'useful' : 'not-yet',
      copy: flags.needsLongTermMemory
        ? 'Short-term conversation memory plus a vector store for durable cross-task recall.'
        : flags.isLoop
          ? 'Short-term conversation memory holds the loop; long-term recall is not needed yet.'
          : 'A single step needs no memory beyond the request itself.',
    },
    contextManagement: {
      state: flags.needsContextManagement ? 'needed' : flags.isLoop ? 'useful' : 'not-yet',
      copy: flags.needsContextManagement
        ? `${formatCount(
            flags.contextTokens,
          )} tokens per task requires summarization or truncation every step to control cost and window.`
        : flags.isLoop
          ? 'Context still fits the window; appending tool results is fine for now.'
          : 'Single-step context needs no management.',
    },
    observability: {
      state: flags.needsObservability ? 'needed' : flags.isLoop ? 'useful' : 'not-yet',
      copy: flags.needsObservability
        ? 'Trace every step and tool span and enforce retry, step, and cost guardrails on each run.'
        : flags.isLoop
          ? 'Basic logging suffices while runs are shallow and the fleet is small.'
          : 'A single call is trivial to observe without dedicated tracing.',
    },
  };
}

function chooseArchitectureTitle(flags: ArchitectureFlags, multiAgentScale: boolean): string {
  if (!flags.isLoop) {
    return 'Single model call + tool';
  }
  if (multiAgentScale && flags.needsObservability) {
    return 'Multi-agent orchestration + full tracing';
  }
  if (flags.needsParallelTools && flags.needsSandbox) {
    return 'Reason-act loop + parallel sandboxed tools';
  }
  if (flags.needsContextManagement || flags.needsLongTermMemory) {
    return 'Reason-act loop + managed memory';
  }
  return 'Reason-act loop + tool registry';
}

function chooseArchitectureSummary(flags: ArchitectureFlags, multiAgentScale: boolean): string {
  if (!flags.isLoop) {
    return 'A single model call selects one tool and returns. No loop, memory, planner, or tracing is justified yet.';
  }
  if (multiAgentScale && flags.needsObservability) {
    return 'Many agent sessions run deep tasks with a planner, routed tool registry, sandboxed parallel execution, short- and long-term memory, and per-step tracing with hard guardrails over a rate-limited LLM gateway.';
  }
  if (flags.needsParallelTools && flags.needsSandbox) {
    return 'The reason-act loop fans independent tool calls out in parallel behind a sandbox pool while managing the growing conversation context each step.';
  }
  if (flags.needsContextManagement || flags.needsLongTermMemory) {
    return 'A reason-act loop with a planner summarizes the conversation each step and offloads durable facts to a vector store so the context window stays bounded.';
  }
  return 'A reason-act loop iterates decide-call-observe over a small tool registry, isolating execution in a sandbox when tools touch real side effects.';
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
