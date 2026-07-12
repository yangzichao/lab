export type FusionStage = {
  id: string;
  name: { zh: string; en: string };
  reactants: string;
  product: string;
  reaction: string;
  minimumTemperature: number;
  minimumStellarMass: number;
  energy: 'released' | 'decay';
  shellIndex: number;
};

export type FusionParameters = {
  logTemperature: number;
  stellarMass: number;
  evolutionSpeed: number;
};

export type FusionState = {
  stageIndex: number;
  reactionProgress: number;
};

export const fusionStages: readonly FusionStage[] = [
  { id: 'hydrogen', name: { zh: '氢燃烧 · pp 链', en: 'Hydrogen burning · pp chain' }, reactants: '4 ¹H', product: '⁴He', reaction: '4 ¹H → ⁴He + 2e⁺ + 2νₑ', minimumTemperature: 1.5e7, minimumStellarMass: 0.08, energy: 'released', shellIndex: 6 },
  { id: 'helium', name: { zh: '氦燃烧 · 三氦过程', en: 'Helium burning · triple-alpha' }, reactants: '3 ⁴He', product: '¹²C', reaction: '3 ⁴He → ¹²C + γ', minimumTemperature: 1e8, minimumStellarMass: 0.8, energy: 'released', shellIndex: 5 },
  { id: 'carbon', name: { zh: '碳燃烧', en: 'Carbon burning' }, reactants: '¹²C + ¹²C', product: '²⁰Ne + ⁴He', reaction: '¹²C + ¹²C → ²⁰Ne + ⁴He', minimumTemperature: 6e8, minimumStellarMass: 8, energy: 'released', shellIndex: 4 },
  { id: 'neon', name: { zh: '氖燃烧', en: 'Neon burning' }, reactants: '²⁰Ne + ⁴He', product: '²⁴Mg', reaction: '²⁰Ne + ⁴He → ²⁴Mg + γ', minimumTemperature: 1.2e9, minimumStellarMass: 8, energy: 'released', shellIndex: 3 },
  { id: 'oxygen', name: { zh: '氧燃烧', en: 'Oxygen burning' }, reactants: '¹⁶O + ¹⁶O', product: '²⁸Si + ⁴He', reaction: '¹⁶O + ¹⁶O → ²⁸Si + ⁴He', minimumTemperature: 1.5e9, minimumStellarMass: 8, energy: 'released', shellIndex: 2 },
  { id: 'silicon', name: { zh: '硅燃烧 · 核统计平衡', en: 'Silicon burning · NSE' }, reactants: 'Si-group nuclei', product: '⁵⁶Ni', reaction: 'Si-group → ⁵⁶Ni + γ', minimumTemperature: 2.7e9, minimumStellarMass: 8, energy: 'released', shellIndex: 1 },
  { id: 'iron', name: { zh: '镍衰变到铁峰', en: 'Nickel decay to the iron peak' }, reactants: '⁵⁶Ni', product: '⁵⁶Fe', reaction: '⁵⁶Ni → ⁵⁶Co → ⁵⁶Fe', minimumTemperature: 2.7e9, minimumStellarMass: 8, energy: 'decay', shellIndex: 0 },
] as const;

export const bindingEnergyPoints = [
  { mass: 1, symbol: 'H', energy: 0 },
  { mass: 4, symbol: 'He', energy: 7.07 },
  { mass: 12, symbol: 'C', energy: 7.68 },
  { mass: 16, symbol: 'O', energy: 7.98 },
  { mass: 20, symbol: 'Ne', energy: 8.03 },
  { mass: 24, symbol: 'Mg', energy: 8.26 },
  { mass: 28, symbol: 'Si', energy: 8.45 },
  { mass: 56, symbol: 'Fe', energy: 8.79 },
] as const;

export function createFusionState(): FusionState {
  return { stageIndex: 0, reactionProgress: 0 };
}

export function canRunFusionStage(stage: FusionStage, parameters: FusionParameters): boolean {
  return 10 ** parameters.logTemperature >= stage.minimumTemperature
    && parameters.stellarMass >= stage.minimumStellarMass;
}

export function advanceFusionStage(state: FusionState, parameters: FusionParameters): boolean {
  if (state.stageIndex >= fusionStages.length - 1) return false;
  const nextStage = fusionStages[state.stageIndex + 1];
  if (!canRunFusionStage(nextStage, parameters)) return false;
  state.stageIndex += 1;
  state.reactionProgress = 0;
  return true;
}

export function stepFusionState(
  state: FusionState,
  parameters: FusionParameters,
  deltaSeconds: number,
): boolean {
  state.reactionProgress += deltaSeconds * parameters.evolutionSpeed / 2.5;
  if (state.reactionProgress < 1) return false;
  state.reactionProgress %= 1;
  return advanceFusionStage(state, parameters);
}

export function formatScientificTemperature(temperature: number): string {
  const exponent = Math.floor(Math.log10(temperature));
  const coefficient = temperature / 10 ** exponent;
  return `${coefficient.toFixed(coefficient >= 9.95 ? 0 : 1)}×10${String(exponent).replace(/./g, (digit) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(digit)])} K`;
}
