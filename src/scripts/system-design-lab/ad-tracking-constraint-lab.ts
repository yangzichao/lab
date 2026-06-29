type ScaleType = 'linear' | 'log';

type WorkloadValues = {
  eventsPerSecond: number;
  peakMultiplier: number;
  reportingQueriesPerMinute: number;
  retentionDays: number;
  hotCampaignShare: number;
  freshnessSeconds: number;
  duplicatePercent: number;
  billingGrade: boolean;
};

type DecisionState = 'not-yet' | 'useful' | 'needed' | 'tradeoff';
type NodeState = 'inactive' | 'ok' | 'warning' | 'needed' | 'overloaded';
type FlowState = 'inactive' | 'active' | 'warning';
type Severity = 'ok' | 'warning' | 'danger';
type ScenarioPreset = {
  id: string;
  values: WorkloadValues;
};

const capacityAssumptions = {
  singleHostEventsPerSecond: 1_200,
  sharedDatabaseEventsPerSecond: 5_500,
  logPartitionEventsPerSecond: 15_000,
  sharedDatabaseQueryBudgetPerMinute: 180,
  comfortableSingleStoreTerabytes: 0.6,
  eventSizeKilobytes: 1.2,
};

const scenarioPresets: ScenarioPreset[] = [
  {
    id: 'demo',
    values: {
      eventsPerSecond: 300,
      peakMultiplier: 1.5,
      reportingQueriesPerMinute: 12,
      retentionDays: 7,
      hotCampaignShare: 5,
      freshnessSeconds: 900,
      duplicatePercent: 0.4,
      billingGrade: false,
    },
  },
  {
    id: 'growth',
    values: {
      eventsPerSecond: 900,
      peakMultiplier: 2,
      reportingQueriesPerMinute: 30,
      retentionDays: 7,
      hotCampaignShare: 8,
      freshnessSeconds: 600,
      duplicatePercent: 0.6,
      billingGrade: false,
    },
  },
  {
    id: 'db-pressure',
    values: {
      eventsPerSecond: 1_500,
      peakMultiplier: 3,
      reportingQueriesPerMinute: 260,
      retentionDays: 3,
      hotCampaignShare: 8,
      freshnessSeconds: 300,
      duplicatePercent: 1,
      billingGrade: false,
    },
  },
  {
    id: 'launch-spike',
    values: {
      eventsPerSecond: 3_000,
      peakMultiplier: 6,
      reportingQueriesPerMinute: 120,
      retentionDays: 14,
      hotCampaignShare: 18,
      freshnessSeconds: 180,
      duplicatePercent: 2,
      billingGrade: false,
    },
  },
  {
    id: 'billing-realtime',
    values: {
      eventsPerSecond: 8_000,
      peakMultiplier: 8,
      reportingQueriesPerMinute: 500,
      retentionDays: 90,
      hotCampaignShare: 35,
      freshnessSeconds: 60,
      duplicatePercent: 4,
      billingGrade: true,
    },
  },
];

export function initAdTrackingConstraintLab(): void {
  document.querySelectorAll<HTMLElement>('[data-system-design-lab]').forEach((labElement) => {
    const rangeControls = Array.from(
      labElement.querySelectorAll<HTMLInputElement>('input[type="range"][data-control]'),
    );
    const billingGradeInput = labElement.querySelector<HTMLInputElement>(
      'input[type="checkbox"][data-control="billingGrade"]',
    );
    const scenarioButtons = Array.from(
      labElement.querySelectorAll<HTMLButtonElement>('[data-scenario-button]'),
    );

    if (rangeControls.length === 0 || !billingGradeInput) {
      return;
    }

    let activeScenarioId: string | null = 'demo';

    const render = (): void => {
      const workload = readWorkloadValues(rangeControls, billingGradeInput, labElement);
      const analysis = analyzeWorkload(workload);

      setText(labElement, '[data-architecture-title]', analysis.architectureTitle);
      setText(labElement, '[data-architecture-summary]', analysis.architectureSummary);
      setText(labElement, '[data-architecture-path]', analysis.architecturePath);

      updateNodes(labElement, analysis);
      updateFlows(labElement, analysis);
      updateMeters(labElement, analysis);
      updateReasons(labElement, analysis.reasons);
      updateDecisionCards(labElement, analysis);
      updateScenarioButtons(scenarioButtons, activeScenarioId);
    };

    const applyScenario = (scenarioId: string): void => {
      const scenario = scenarioPresets.find((preset) => preset.id === scenarioId);
      if (!scenario) {
        return;
      }

      rangeControls.forEach((inputElement) => {
        const controlId = inputElement.dataset.control as keyof Omit<WorkloadValues, 'billingGrade'>;
        inputElement.value = String(valueToSliderPosition(inputElement, scenario.values[controlId]));
      });
      billingGradeInput.checked = scenario.values.billingGrade;
      activeScenarioId = scenarioId;
      render();
    };

    scenarioButtons.forEach((buttonElement) => {
      buttonElement.addEventListener('click', () => {
        applyScenario(buttonElement.dataset.scenarioId ?? 'demo');
      });
    });

    rangeControls.forEach((inputElement) =>
      inputElement.addEventListener('input', () => {
        activeScenarioId = null;
        render();
      }),
    );
    billingGradeInput.addEventListener('change', () => {
      activeScenarioId = null;
      render();
    });

    applyScenario('demo');
  });
}

function readWorkloadValues(
  rangeControls: HTMLInputElement[],
  billingGradeInput: HTMLInputElement,
  labElement: HTMLElement,
): WorkloadValues {
  const values = {} as Record<keyof Omit<WorkloadValues, 'billingGrade'>, number>;

  rangeControls.forEach((inputElement) => {
    const controlId = inputElement.dataset.control as keyof Omit<WorkloadValues, 'billingGrade'>;
    const value = sliderPositionToValue(inputElement);
    values[controlId] = value;

    const outputElement = labElement.querySelector<HTMLOutputElement>(
      `[data-control-output="${controlId}"]`,
    );
    if (outputElement) {
      outputElement.value = formatControlValue(controlId, value, inputElement.dataset.unit ?? '');
    }
  });

  return {
    eventsPerSecond: values.eventsPerSecond,
    peakMultiplier: values.peakMultiplier,
    reportingQueriesPerMinute: values.reportingQueriesPerMinute,
    retentionDays: values.retentionDays,
    hotCampaignShare: values.hotCampaignShare,
    freshnessSeconds: values.freshnessSeconds,
    duplicatePercent: values.duplicatePercent,
    billingGrade: billingGradeInput.checked,
  };
}

function analyzeWorkload(workload: WorkloadValues) {
  const peakEventsPerSecond = workload.eventsPerSecond * workload.peakMultiplier;
  const gigabytesPerDay =
    (workload.eventsPerSecond * 86_400 * capacityAssumptions.eventSizeKilobytes) / 1_000_000;
  const retainedTerabytes = (gigabytesPerDay * workload.retentionDays) / 1_000;
  const hotCampaignEventsPerSecond = peakEventsPerSecond * (workload.hotCampaignShare / 100);

  const singleHostLoad = peakEventsPerSecond / capacityAssumptions.singleHostEventsPerSecond;
  const sharedDatabaseLoad =
    peakEventsPerSecond / capacityAssumptions.sharedDatabaseEventsPerSecond +
    workload.reportingQueriesPerMinute / capacityAssumptions.sharedDatabaseQueryBudgetPerMinute;
  const storageLoad = retainedTerabytes / capacityAssumptions.comfortableSingleStoreTerabytes;
  const hotPartitionLoad =
    hotCampaignEventsPerSecond / capacityAssumptions.logPartitionEventsPerSecond;
  const freshnessLoad = freshnessTargetToPressure(workload.freshnessSeconds);

  const needsMultiHost =
    singleHostLoad > 0.7 || workload.billingGrade || workload.peakMultiplier >= 8;
  const needsEventLog =
    sharedDatabaseLoad > 0.7 ||
    workload.peakMultiplier >= 6 ||
    workload.billingGrade ||
    workload.duplicatePercent >= 3;
  const needsPartitioning =
    peakEventsPerSecond > capacityAssumptions.logPartitionEventsPerSecond * 0.7 ||
    retainedTerabytes > 1 ||
    hotPartitionLoad > 0.65;
  const hotPartitionRisk = hotPartitionLoad > 0.65 || workload.hotCampaignShare >= 25;
  const needsStreaming =
    workload.freshnessSeconds <= 180 ||
    workload.duplicatePercent >= 2 ||
    (needsEventLog && workload.reportingQueriesPerMinute >= 60);
  const needsServingStores =
    workload.reportingQueriesPerMinute >= 120 ||
    (needsEventLog && retainedTerabytes >= 0.5) ||
    workload.retentionDays >= 45 ||
    workload.freshnessSeconds <= 120;

  const architecture = chooseArchitecture({
    needsMultiHost,
    needsEventLog,
    needsPartitioning,
    needsStreaming,
    needsServingStores,
  });

  const reasons = buildReasons({
    workload,
    peakEventsPerSecond,
    gigabytesPerDay,
    retainedTerabytes,
    hotCampaignEventsPerSecond,
    singleHostLoad,
    sharedDatabaseLoad,
    storageLoad,
    hotPartitionLoad,
    needsMultiHost,
    needsEventLog,
    needsPartitioning,
    hotPartitionRisk,
    needsStreaming,
    needsServingStores,
  });

  return {
    ...architecture,
    workload,
    peakEventsPerSecond,
    gigabytesPerDay,
    retainedTerabytes,
    hotCampaignEventsPerSecond,
    singleHostLoad,
    sharedDatabaseLoad,
    storageLoad,
    hotPartitionLoad,
    freshnessLoad,
    needsMultiHost,
    needsEventLog,
    needsPartitioning,
    hotPartitionRisk,
    needsStreaming,
    needsServingStores,
    reasons,
  };
}

function chooseArchitecture(flags: {
  needsMultiHost: boolean;
  needsEventLog: boolean;
  needsPartitioning: boolean;
  needsStreaming: boolean;
  needsServingStores: boolean;
}) {
  if (!flags.needsMultiHost && !flags.needsEventLog && !flags.needsPartitioning) {
    return {
      architectureTitle: '单机 collector + 一个 database',
      architecturePath: 'Ad events -> single collector -> shared database',
      architectureSummary:
        '最简单的设计依然站得住脚：一个服务校验 event 并写入本地或托管的 database。在 workload 真正证明需要之前，你都不必引入分布式协调。',
    };
  }

  if (flags.needsMultiHost && !flags.needsEventLog && !flags.needsPartitioning) {
    return {
      architectureTitle: '多个 collector + 共享 database',
      architecturePath: 'Ad events -> load balancer -> collector fleet -> shared database',
      architectureSummary:
        '第一步扩展是把无状态的 collector 放到 load balancer 后面。这解决了单机容量和可用性，但现在该盯着的是共享 database。',
    };
  }

  if (flags.needsEventLog && !flags.needsPartitioning) {
    return {
      architectureTitle: 'Collector 集群 + 持久化 event log',
      architecturePath: 'Ad events -> load balancer -> collector fleet -> event log -> reporting database',
      architectureSummary:
        '系统该停止把每个请求直接写进报表存储。先 append，再让 consumer 去 dedupe、聚合、retry，而不阻塞 ingest。',
    };
  }

  if (flags.needsPartitioning && !flags.needsServingStores && !flags.needsStreaming) {
    return {
      architectureTitle: '分区的 event log + 分区的 consumer',
      architecturePath:
        'Ad events -> collector fleet -> partitioned event log -> partitioned consumers -> reports',
      architectureSummary:
        '单个 stream 或单个 database shard 已经不够了。partitioning 分摊了 throughput 和存储，但现在 partition key 决定了 ordering、热点和 rebalance 的代价。',
    };
  }

  return {
    architectureTitle: '分区 pipeline + 实时 serving view',
    architecturePath:
      'Ad events -> collector fleet -> partitioned event log -> stream workers -> serving stores + warehouse',
    architectureSummary:
      'ingest、replay、聚合和报表需要各自不同的形态。原始 event 流经分区的 log；stream worker 构建快速 counter；OLAP 或 warehouse 存储扛更重的读。',
  };
}

function buildReasons(analysis: {
  workload: WorkloadValues;
  peakEventsPerSecond: number;
  gigabytesPerDay: number;
  retainedTerabytes: number;
  hotCampaignEventsPerSecond: number;
  singleHostLoad: number;
  sharedDatabaseLoad: number;
  storageLoad: number;
  hotPartitionLoad: number;
  needsMultiHost: boolean;
  needsEventLog: boolean;
  needsPartitioning: boolean;
  hotPartitionRisk: boolean;
  needsStreaming: boolean;
  needsServingStores: boolean;
}) {
  const reasons: Array<{ text: string; severity: Severity }> = [];

  if (analysis.needsMultiHost) {
    reasons.push({
      severity: analysis.singleHostLoad > 1 ? 'danger' : 'warning',
      text: `峰值负载是 ${formatRate(analysis.peakEventsPerSecond)}，相当于教学模型里单机 ingest 预算的 ${formatRatio(
        analysis.singleHostLoad,
      )}。上多机是被容量或可用性逼出来的，不是凭喜好。`,
    });
  } else {
    reasons.push({
      severity: 'ok',
      text: `峰值负载是 ${formatRate(analysis.peakEventsPerSecond)}，低于单机阈值。单台机器仍是合理的起点。`,
    });
  }

  if (analysis.sharedDatabaseLoad > 0.7) {
    reasons.push({
      severity: analysis.sharedDatabaseLoad > 1 ? 'danger' : 'warning',
      text: `把原始写入和报表查询合在一起后，共享 database 已经到了 ${formatRatio(
        analysis.sharedDatabaseLoad,
      )}。光加 collector 只会把瓶颈推进 database。`,
    });
  }

  if (analysis.workload.billingGrade) {
    reasons.push({
      severity: 'warning',
      text: 'Billing-grade 持久性意味着被接收的 event 需要审计和 replay。一条「请求直接写一行」的路径，撑不住 collector 重启和下游故障，太脆弱。',
    });
  }

  if (analysis.needsEventLog) {
    reasons.push({
      severity: 'warning',
      text: '持久化 event log 换来了缓冲、replay 和独立的 consumer。代价是 lag、consumer 的归属问题，以及报表里的 eventual consistency。',
    });
  }

  if (analysis.needsPartitioning) {
    reasons.push({
      severity: analysis.hotPartitionRisk ? 'danger' : 'warning',
      text: `在 ${formatRate(
        analysis.peakEventsPerSecond,
      )} 峰值、${formatStorage(analysis.retainedTerabytes)} 保留的原始数据下，partitioning 开始变得相关。它能扩 throughput，但逼你做 partition-key 的决定。`,
    });
  }

  if (analysis.hotPartitionRisk) {
    reasons.push({
      severity: 'danger',
      text: `最热的 campaign 大约要收 ${formatRate(
        analysis.hotCampaignEventsPerSecond,
      )}。按 campaign 分区能保住 campaign 内的聚合，但可能造出一个 hot partition；按 event id 分桶能摊平负载，却需要事后再做分组。`,
    });
  }

  if (analysis.needsStreaming) {
    reasons.push({
      severity: 'warning',
      text: `${formatFreshness(
        analysis.workload.freshnessSeconds,
      )} 的新鲜度目标，或是重复压力，让纯 batch 报表显得乏力。stream worker 能处理 dedupe window 和近实时的 counter。`,
    });
  }

  if (analysis.needsServingStores) {
    reasons.push({
      severity: 'warning',
      text: `${formatStorage(
        analysis.retainedTerabytes,
      )} 保留的原始数据，加上 ${formatQueries(
        analysis.workload.reportingQueriesPerMinute,
      )}，不该跟 ingest 路径抢资源。独立的 serving store 能让写入不受读的干扰。`,
    });
  }

  return reasons.slice(0, 7);
}

function updateNodes(labElement: HTMLElement, analysis: ReturnType<typeof analyzeWorkload>): void {
  setNodeState(labElement, 'source', 'ok');

  const collectorState = analysis.singleHostLoad > 1 && !analysis.needsMultiHost ? 'overloaded' : 'ok';
  setNodeState(labElement, 'collectors', analysis.needsMultiHost ? 'needed' : collectorState);
  setText(
    labElement,
    '[data-node-title="collectors"]',
    analysis.needsMultiHost ? 'Collector 集群' : '单机 collector',
  );
  setText(
    labElement,
    '[data-node-copy="collectors"]',
    analysis.needsMultiHost ? '无状态校验器' : '校验 + 写入',
  );

  setNodeState(labElement, 'loadBalancer', analysis.needsMultiHost ? 'needed' : 'inactive');

  let sharedDatabaseState: NodeState = 'ok';
  if (analysis.sharedDatabaseLoad > 1) {
    sharedDatabaseState = 'overloaded';
  } else if (analysis.sharedDatabaseLoad > 0.7) {
    sharedDatabaseState = 'warning';
  }
  if (analysis.needsServingStores) {
    sharedDatabaseState = 'inactive';
  }
  setNodeState(labElement, 'sharedDatabase', sharedDatabaseState);
  setText(
    labElement,
    '[data-node-copy="sharedDatabase"]',
    analysis.needsEventLog ? 'consumer sink' : '原始 event + 报表',
  );

  setNodeState(labElement, 'eventLog', analysis.needsEventLog ? 'needed' : 'inactive');
  setNodeState(labElement, 'partitioning', analysis.needsPartitioning ? 'needed' : 'inactive');
  setNodeState(labElement, 'streaming', analysis.needsStreaming ? 'needed' : 'inactive');
  setNodeState(labElement, 'servingStores', analysis.needsServingStores ? 'needed' : 'inactive');
  setNodeState(
    labElement,
    'warehouse',
    analysis.workload.retentionDays >= 45 || analysis.workload.billingGrade ? 'needed' : 'inactive',
  );
}

function updateFlows(labElement: HTMLElement, analysis: ReturnType<typeof analyzeWorkload>): void {
  setFlowState(labElement, 'clientToLoadBalancer', analysis.needsMultiHost ? 'active' : 'inactive');
  setFlowState(labElement, 'loadBalancerToCollectors', analysis.needsMultiHost ? 'active' : 'inactive');
  setFlowState(labElement, 'collectorsToDatabase', analysis.needsEventLog ? 'inactive' : 'active');
  setFlowState(labElement, 'collectorsToEventLog', analysis.needsEventLog ? 'active' : 'inactive');
  setFlowState(labElement, 'eventLogToStreaming', analysis.needsStreaming ? 'active' : 'inactive');
  setFlowState(labElement, 'streamingToServing', analysis.needsServingStores ? 'active' : 'inactive');
  setFlowState(labElement, 'eventLogToPartitioning', analysis.needsPartitioning ? 'active' : 'inactive');
  setFlowState(
    labElement,
    'partitioningToStreaming',
    analysis.hotPartitionRisk ? 'warning' : analysis.needsPartitioning ? 'active' : 'inactive',
  );
  setFlowState(labElement, 'streamingToWarehouse', analysis.needsServingStores ? 'active' : 'inactive');
  setFlowState(
    labElement,
    'streamingToArchive',
    analysis.workload.retentionDays >= 45 || analysis.workload.billingGrade ? 'active' : 'inactive',
  );
  setFlowState(labElement, 'clientToCollectors', analysis.needsMultiHost ? 'inactive' : 'active');
  setFlowState(
    labElement,
    'eventLogToDatabase',
    analysis.needsEventLog && !analysis.needsStreaming ? 'active' : 'inactive',
  );
  setFlowState(
    labElement,
    'streamingToDatabase',
    analysis.needsStreaming && !analysis.needsServingStores ? 'active' : 'inactive',
  );
}

function updateMeters(labElement: HTMLElement, analysis: ReturnType<typeof analyzeWorkload>): void {
  updateMeter(
    labElement,
    'singleHost',
    analysis.singleHostLoad,
    formatRatio(analysis.singleHostLoad),
    `${formatRate(analysis.peakEventsPerSecond)} 峰值 / ${formatRate(
      capacityAssumptions.singleHostEventsPerSecond,
    )} 单机教学预算。`,
  );
  updateMeter(
    labElement,
    'sharedDatabase',
    analysis.sharedDatabaseLoad,
    formatRatio(analysis.sharedDatabaseLoad),
    '把原始 event 写入和报表读取压在同一条共享 database 路径上。',
  );
  updateMeter(
    labElement,
    'storage',
    analysis.storageLoad,
    formatStorage(analysis.retainedTerabytes),
    `按当前常态速率，每天 ${formatGigabytes(analysis.gigabytesPerDay)}。`,
  );
  updateMeter(
    labElement,
    'hotPartition',
    analysis.hotPartitionLoad,
    formatRatio(analysis.hotPartitionLoad),
    `峰值流量里有 ${analysis.workload.hotCampaignShare.toFixed(0)}% 落在最热的 campaign 上。`,
  );
  updateMeter(
    labElement,
    'freshness',
    analysis.freshnessLoad,
    formatFreshness(analysis.workload.freshnessSeconds),
    '新鲜度目标越低，就越需要 streaming，而不是只靠 batch 事后修正。',
  );
}

function updateDecisionCards(
  labElement: HTMLElement,
  analysis: ReturnType<typeof analyzeWorkload>,
): void {
  setDecision(
    labElement,
    'multiHost',
    analysis.needsMultiHost ? 'needed' : 'not-yet',
    analysis.needsMultiHost
      ? '一旦单机没了余量、或可用性变重要，就需要它。代价：load balancing、健康检查，以及幂等的 retry。'
      : '先别加机器。在容量和可用性都还能接受时，单进程更容易推理。',
  );

  setDecision(
    labElement,
    'sharedDatabase',
    analysis.sharedDatabaseLoad > 0.7 ? 'tradeoff' : 'useful',
    analysis.sharedDatabaseLoad > 0.7
      ? '共享 DB 现在成了瓶颈。它简单，但写入和报表读取在抢同一份资源。'
      : '在这个负载下共享 DB 还能接受。在需要 replay 或 fanout 之前，它让系统保持简单。',
  );

  setDecision(
    labElement,
    'eventLog',
    analysis.needsEventLog ? 'needed' : 'not-yet',
    analysis.needsEventLog
      ? '用一条 append-only 的 log 来吸收尖峰、给 consumer 做 replay。代价：consumer lag 和 eventual consistency。'
      : '直写现在还行。在 log 带来足够价值之前，它只会增加运维面。',
  );

  setDecision(
    labElement,
    'partitioning',
    analysis.needsPartitioning ? 'needed' : 'not-yet',
    analysis.needsPartitioning
      ? '用 partition 来摊开写入和存储。取舍：key 决定了 ordering、分组，以及 hot-shard 的表现。'
      : '单个 partition 或 shard 还在模型承受范围内。在压力显现前别急着 sharding。',
  );

  setDecision(
    labElement,
    'streaming',
    analysis.needsStreaming ? 'needed' : 'not-yet',
    analysis.needsStreaming
      ? 'stream worker 维护 dedupe window 和滚动 counter。代价：late-event 的修正和状态管理。'
      : '在新鲜度和重复压力都还宽松时，batch 或简单查询就够了。',
  );

  setDecision(
    labElement,
    'servingStores',
    analysis.needsServingStores ? 'needed' : 'not-yet',
    analysis.needsServingStores
      ? '把 OLAP、billing、risk 和 warehouse view 拆开，别让读破坏 ingest。'
      : '一个存储还能撑起产品。等查询量或保留期把读路径压重了，再拆存储。',
  );
}

function updateReasons(
  labElement: HTMLElement,
  reasons: Array<{ text: string; severity: Severity }>,
): void {
  const reasonsElement = labElement.querySelector<HTMLUListElement>('[data-reasons]');
  if (!reasonsElement) {
    return;
  }

  reasonsElement.replaceChildren(
    ...reasons.map((reason) => {
      const itemElement = document.createElement('li');
      itemElement.textContent = reason.text;
      itemElement.dataset.severity = reason.severity;
      return itemElement;
    }),
  );
}

function updateScenarioButtons(
  scenarioButtons: HTMLButtonElement[],
  activeScenarioId: string | null,
): void {
  scenarioButtons.forEach((buttonElement) => {
    buttonElement.setAttribute(
      'aria-pressed',
      String(buttonElement.dataset.scenarioId === activeScenarioId),
    );
  });
}

function updateMeter(
  labElement: HTMLElement,
  meterId: string,
  ratio: number,
  valueText: string,
  copy: string,
): void {
  const fillElement = labElement.querySelector<HTMLElement>(`[data-meter="${meterId}"]`);
  const valueElement = labElement.querySelector<HTMLElement>(`[data-meter-value="${meterId}"]`);
  const copyElement = labElement.querySelector<HTMLElement>(`[data-meter-copy="${meterId}"]`);
  const severity = ratio > 1 ? 'danger' : ratio > 0.7 ? 'warning' : 'ok';

  fillElement?.style.setProperty('--meter-level', `${Math.min(ratio * 100, 100)}%`);
  if (fillElement) {
    fillElement.dataset.severity = severity;
  }
  if (valueElement) {
    valueElement.textContent = valueText;
  }
  if (copyElement) {
    copyElement.textContent = copy;
  }
}

function setNodeState(labElement: HTMLElement, nodeId: string, state: NodeState): void {
  const nodeElements = labElement.querySelectorAll<HTMLElement>(
    `[data-node="${nodeId}"], [data-mobile-node="${nodeId}"]`,
  );
  nodeElements.forEach((nodeElement) => {
    nodeElement.dataset.state = state;
  });
}

function setFlowState(labElement: HTMLElement, flowId: string, state: FlowState): void {
  const flowElement = labElement.querySelector<HTMLElement>(`[data-flow="${flowId}"]`);
  if (flowElement) {
    flowElement.dataset.state = state;
  }
}

function setDecision(
  labElement: HTMLElement,
  decisionId: string,
  state: DecisionState,
  copy: string,
): void {
  const decisionElement = labElement.querySelector<HTMLElement>(`[data-decision="${decisionId}"]`);
  const copyElement = labElement.querySelector<HTMLElement>(`[data-decision-copy="${decisionId}"]`);
  if (decisionElement) {
    decisionElement.dataset.state = state;
  }
  if (copyElement) {
    copyElement.textContent = copy;
  }
}

function setText(labElement: HTMLElement, selector: string, text: string): void {
  const element = labElement.querySelector<HTMLElement>(selector);
  if (element) {
    element.textContent = text;
  }
}

function sliderPositionToValue(inputElement: HTMLInputElement): number {
  const sliderPosition = Number(inputElement.value);
  const minValue = Number(inputElement.dataset.minValue ?? '0');
  const maxValue = Number(inputElement.dataset.maxValue ?? '100');
  const scale = (inputElement.dataset.scale ?? 'linear') as ScaleType;

  if (scale === 'log' && minValue > 0) {
    return minValue * Math.pow(maxValue / minValue, sliderPosition / 100);
  }

  return minValue + (maxValue - minValue) * (sliderPosition / 100);
}

function valueToSliderPosition(inputElement: HTMLInputElement, value: number): number {
  const minValue = Number(inputElement.dataset.minValue ?? '0');
  const maxValue = Number(inputElement.dataset.maxValue ?? '100');
  const scale = (inputElement.dataset.scale ?? 'linear') as ScaleType;

  if (scale === 'log' && minValue > 0) {
    return clamp((Math.log(value / minValue) / Math.log(maxValue / minValue)) * 100, 0, 100);
  }

  return clamp(((value - minValue) / (maxValue - minValue)) * 100, 0, 100);
}

function freshnessTargetToPressure(seconds: number): number {
  if (seconds <= 15) {
    return 1;
  }
  if (seconds <= 60) {
    return 0.82;
  }
  if (seconds <= 180) {
    return 0.62;
  }
  if (seconds <= 600) {
    return 0.34;
  }
  return 0.16;
}

function formatControlValue(controlId: string, value: number, unit: string): string {
  if (controlId === 'eventsPerSecond') {
    return formatRate(value);
  }
  if (controlId === 'reportingQueriesPerMinute') {
    return formatQueries(value);
  }
  if (controlId === 'freshnessSeconds') {
    return formatFreshness(value);
  }
  if (controlId === 'peakMultiplier') {
    return `${value.toFixed(value < 10 ? 1 : 0)}${unit}`;
  }
  if (controlId === 'retentionDays') {
    return `${Math.round(value)} ${unit}`;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)}${unit}`;
}

function formatRate(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M/s`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 1_000)}k/s`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k/s`;
  }
  return `${Math.round(value)}/s`;
}

function formatQueries(value: number): string {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k/min`;
  }
  return `${Math.round(value)}/min`;
}

function formatFreshness(seconds: number): string {
  if (seconds >= 3600) {
    return `${Math.round(seconds / 3600)} hr`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} min`;
  }
  return `${Math.round(seconds)} sec`;
}

function formatGigabytes(gigabytes: number): string {
  if (gigabytes >= 1_000) {
    return `${(gigabytes / 1_000).toFixed(1)} TB`;
  }
  if (gigabytes >= 10) {
    return `${Math.round(gigabytes)} GB`;
  }
  return `${gigabytes.toFixed(1)} GB`;
}

function formatStorage(terabytes: number): string {
  if (terabytes >= 1) {
    return `${terabytes.toFixed(1)} TB`;
  }
  return `${Math.round(terabytes * 1_000)} GB`;
}

function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
