export type PhysicsLabReadout = {
  id: string;
  label: string;
  initialValue: string;
};

export type PhysicsLabAction = {
  id: string;
  icon: string;
  label: string;
  primary?: boolean;
  runningLabel?: string;
  pausedLabel?: string;
};

export type PhysicsLabPreset = {
  id: string;
  label: string;
};

export type PhysicsLabToggle = {
  id: string;
  label: string;
  description: string;
  checked?: boolean;
};

export type PhysicsLabField = {
  id: string;
  label: string;
  symbolLatex?: string;
  outputValue: string;
  min: number;
  max: number;
  step: number;
  value: number;
};

export type PhysicsLabInlineNotice = {
  icon: string;
  text: string;
};

export type PhysicsLabControlPanel = {
  ariaLabel: string;
  eyebrow: string;
  title: string;
  actions: PhysicsLabAction[];
  presets?: PhysicsLabPreset[];
  toggles?: PhysicsLabToggle[];
  fields?: PhysicsLabField[];
  notices?: PhysicsLabInlineNotice[];
};

export type PhysicsLabPage = {
  slug: string;
  readouts: PhysicsLabReadout[];
  controls: PhysicsLabControlPanel;
};
