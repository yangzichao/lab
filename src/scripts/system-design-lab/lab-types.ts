export type ScaleType = 'linear' | 'log';

export type ControlValueFormat =
  | 'count'
  | 'duration-seconds'
  | 'kilobytes'
  | 'milliseconds'
  | 'multiplier'
  | 'operations-per-second'
  | 'percentage'
  | 'requests-per-second'
  | 'requests-per-minute';

export type NodeState = 'inactive' | 'ok' | 'warning' | 'needed' | 'overloaded';
export type FlowState = 'inactive' | 'active' | 'warning';
export type DecisionState = 'not-yet' | 'useful' | 'needed' | 'tradeoff';
export type Severity = 'ok' | 'warning' | 'danger';

export type WorkloadValues = Record<string, number | boolean>;

export type WorkloadControlDefinition = {
  id: string;
  label: string;
  help: string;
  min: number;
  max: number;
  defaultValue: number;
  scale: ScaleType;
  unit?: string;
  format: ControlValueFormat;
};

export type ToggleControlDefinition = {
  id: string;
  label: string;
  help: string;
  defaultValue: boolean;
};

export type ScenarioDefinition = {
  id: string;
  step: string;
  title: string;
  summary: string;
  values: WorkloadValues;
};

/**
 * One step of the guided ("循循善诱") walkthrough. The learner is asked to
 * predict an outcome, the step applies the matching workload `scenario` so the
 * diagram and meters react live, and the reasoning is revealed on demand.
 */
export type TeachingStep = {
  id: string;
  /** Two-digit step marker, e.g. "01". */
  step: string;
  /** Short framing of what changes at this step, e.g. "Traffic 10x". */
  focus: string;
  /** Id of the {@link ScenarioDefinition} this step applies on entry. */
  scenarioId: string;
  /** Socratic prompt: what should the learner predict before revealing? */
  question: string;
  /** The reasoning revealed after the learner has formed a guess. */
  reveal: string;
  /** One durable, quotable insight to carry forward. */
  takeaway: string;
};

export type DiagramZoneDefinition = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  variant?: string;
};

export type DiagramFlowDefinition = {
  id: string;
  path: string;
  variant?: 'primary' | 'secondary' | 'direct';
};

/**
 * Recognizable system-design component types. The diagram renders a distinct
 * whiteboard silhouette + glyph per kind (cylinder for a database, bucket for
 * object storage, stack for a scaled pool, browser frame for a client, …).
 */
export type ComponentKind =
  | 'client'
  | 'cdn'
  | 'lb'
  | 'api'
  | 'service'
  | 'compute'
  | 'container'
  | 'queue'
  | 'stream'
  | 'cache'
  | 'db'
  | 'nosql'
  | 'objectstore'
  | 'search'
  | 'scheduler'
  | 'external'
  | 'gpu';

export type DiagramNodeDefinition = {
  id: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Component type that selects the silhouette + glyph; defaults to a plain box. */
  kind?: ComponentKind;
};

export type MobileDiagramNodeDefinition = {
  id: string;
  title: string;
  summary: string;
};

export type MobileDiagramStageDefinition = {
  label: string;
  nodes: MobileDiagramNodeDefinition[];
};

export type DiagramDefinition = {
  title: string;
  description: string;
  viewBox: string;
  zones: DiagramZoneDefinition[];
  flows: DiagramFlowDefinition[];
  nodes: DiagramNodeDefinition[];
  mobileStages: MobileDiagramStageDefinition[];
};

export type MeterDefinition = {
  id: string;
  label: string;
};

export type DecisionDefinition = {
  id: string;
  title: string;
};

export type SourceBackedRule = {
  title: string;
  source: string;
  url: string;
  summary: string;
};

export type LabReason = {
  text: string;
  severity: Severity;
};

export type MeterAnalysis = {
  ratio: number;
  valueText: string;
  copy: string;
};

export type DecisionAnalysis = {
  state: DecisionState;
  copy: string;
};

export type LabAnalysis = {
  architectureTitle: string;
  architectureSummary: string;
  architecturePath: string;
  nodeStates: Record<string, NodeState>;
  flowStates: Record<string, FlowState>;
  meters: Record<string, MeterAnalysis>;
  decisions: Record<string, DecisionAnalysis>;
  reasons: LabReason[];
  nodeTitles?: Record<string, string>;
  nodeCopies?: Record<string, string>;
};

export type SystemDesignLabDefinition = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  articleHref?: string;
  controls: WorkloadControlDefinition[];
  toggles: ToggleControlDefinition[];
  scenarios: ScenarioDefinition[];
  diagram: DiagramDefinition;
  meters: MeterDefinition[];
  decisions: DecisionDefinition[];
  sourceBackedRules: SourceBackedRule[];
  teachingAssumptions: string[];
  /** Optional guided Socratic walkthrough; each step applies a scenario by id. */
  teachingWalkthrough?: TeachingStep[];
  analyze: (workload: WorkloadValues) => LabAnalysis;
};
