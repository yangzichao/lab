import type { PhysicsLabDefinition } from '../physics-lab-catalog-types';
import type { PhysicsLabLocale } from '../physics-lab-i18n';
import type { PhysicsLabPage } from '../physics-lab-page-types';

export const fusionChainDefinition: PhysicsLabDefinition = {
  slug: 'stellar-fusion-chain',
  icon: 'ph-atom',
  text: {
    zh: {
      title: 'Stellar Fusion: Hydrogen to Iron',
      eyebrow: '核物理 · 恒星演化',
      tagline: '恒星逐层升温，把轻核一路加工到铁峰。',
      description: '逐步推进 pp 链、三氦过程、碳燃烧、氖燃烧、氧燃烧、硅燃烧和镍衰变；每一步都显示温度门槛、主要产物与能量方向。',
      notice: '这是恒星核合成的教学化反应网络，不是逐粒子的核反应计算。太阳质量恒星不会走完整条链；只有大质量恒星能在核心塌缩前建立洋葱状燃烧层并接近铁峰。',
    },
    en: {
      title: 'Stellar Fusion: Hydrogen to Iron',
      eyebrow: 'Nuclear physics · stellar evolution',
      tagline: 'Successive hotter cores process light nuclei toward the iron peak.',
      description: 'Step through the proton-proton chain, triple-alpha, carbon, neon, oxygen, and silicon burning, followed by nickel decay, with each temperature gate and energy direction visible.',
      notice: 'This is a teaching reaction network, not a particle-by-particle nuclear calculation. Sun-like stars never complete the chain; only massive stars build onion-shell burning stages toward the iron peak before core collapse.',
    },
  },
};

export function createFusionChainPage(locale: PhysicsLabLocale): PhysicsLabPage {
  const english = locale === 'en';
  return {
    slug: 'stellar-fusion-chain',
    readouts: [
      { id: 'stage', label: english ? 'Current stage' : '当前阶段', initialValue: english ? 'Hydrogen burning' : '氢燃烧' },
      { id: 'product', label: english ? 'Main product' : '主要产物', initialValue: '⁴He' },
      { id: 'temperatureGate', label: english ? 'Temperature gate' : '温度门槛', initialValue: '≥ 1.5×10⁷ K' },
      { id: 'energyDirection', label: english ? 'Energy result' : '能量结果', initialValue: english ? 'Released' : '释放' },
      { id: 'eligibility', label: english ? 'Core condition' : '核心条件', initialValue: english ? 'Reaction active' : '反应可进行' },
    ],
    controls: {
      ariaLabel: english ? 'Stellar fusion chain controls' : '恒星核聚变链控制',
      eyebrow: english ? 'Guided simulation' : '引导模拟',
      title: english ? 'Build nuclei toward iron' : '逐步构造铁峰核素',
      actions: [
        { id: 'next', icon: 'ph-arrow-right', label: english ? 'Next stage' : '下一阶段', primary: true },
        { id: 'toggle', icon: 'ph-play', label: english ? 'Auto evolve' : '自动演化', runningLabel: english ? 'Pause evolution' : '暂停演化', pausedLabel: english ? 'Auto evolve' : '自动演化' },
        { id: 'reset', icon: 'ph-arrow-counter-clockwise', label: english ? 'Start over' : '重新开始' },
      ],
      presets: [
        { id: 'sun', label: english ? 'Sun-like star' : '类太阳恒星' },
        { id: 'redGiant', label: english ? 'Red-giant core' : '红巨星核心' },
        { id: 'massiveStar', label: english ? 'Massive star' : '大质量恒星' },
        { id: 'preCollapse', label: english ? 'Pre-collapse core' : '塌缩前核心' },
      ],
      toggles: [
        { id: 'showEnergyCurve', label: english ? 'Binding-energy curve' : '结合能曲线', description: english ? 'Show why fusion releases energy only up to the iron peak.' : '显示为什么聚变只有到铁峰前才放能。', checked: true },
        { id: 'showShells', label: english ? 'Onion-shell star' : '洋葱状燃烧层', description: english ? 'Relate the selected reaction to its layer inside a massive star.' : '把当前反应对应到大质量恒星内部燃烧层。', checked: true },
      ],
      fields: [
        { id: 'logTemperature', label: english ? 'Core temperature' : '核心温度', symbolLatex: '\\log_{10}T', outputValue: '1.5×10⁷ K', min: 7, max: 9.6, step: 0.05, value: 7.18 },
        { id: 'stellarMass', label: english ? 'Initial stellar mass' : '恒星初始质量', symbolLatex: 'M/M_\\odot', outputValue: '15 M☉', min: 0.8, max: 30, step: 0.2, value: 15 },
        { id: 'evolutionSpeed', label: english ? 'Evolution speed' : '演化速度', outputValue: '1.0×', min: 0.5, max: 3, step: 0.25, value: 1 },
      ],
      notices: [{ icon: 'ph-warning-circle', text: english ? 'Raise temperature or choose a stellar preset when the next reaction is blocked.' : '下一步被阻止时，请提高核心温度或选择恒星预设。' }],
    },
  };
}
