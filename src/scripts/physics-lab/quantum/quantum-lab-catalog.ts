import type {
  LocalizedPhysicsLabText,
  PhysicsLabEntry,
} from '../physics-lab-catalog';
import {
  defaultPhysicsLabLocale,
  normalizePhysicsLabLocale,
  type PhysicsLabLocale,
} from '../physics-lab-i18n';
import { getLocalizedQuantumLabPath } from './quantum-lab-i18n';

type QuantumLabDefinition = {
  slug: string;
  icon: string;
  text: Record<PhysicsLabLocale, LocalizedPhysicsLabText>;
};

const quantumLabDefinitions: QuantumLabDefinition[] = [
  {
    slug: 'qubit-state',
    icon: 'ph-sphere',
    text: {
      zh: {
        title: '量子态与测量',
        eyebrow: 'Quantum Lab 01 · 振幅与相位',
        tagline: '转动一个 qubit，观察振幅、相位与测量概率怎样联系起来。',
        description:
          '用 Bloch sphere 上的两个角控制一个纯量子态。左侧向量表示状态方向，右侧同时显示 Z 基和旋转测量基的结果概率。改变相位时，先观察什么不变，再转动测量基让干涉显现。',
        notice:
          '相对相位不会改变 Z 基中的 P(0) 和 P(1)，但它并没有消失。测量基一旦包含 |0⟩ 与 |1⟩ 的叠加，相位就会通过干涉改变结果概率。',
      },
      en: {
        title: 'Quantum State & Measurement',
        eyebrow: 'Quantum Lab 01 · amplitude and phase',
        tagline: 'Rotate one qubit and connect amplitudes, phase, and measurement probability.',
        description:
          'Two Bloch-sphere angles control a pure quantum state. The vector shows its direction while the readings compare the Z basis with a rotated measurement basis. Change phase, notice what stays fixed, then rotate the basis to reveal interference.',
        notice:
          'Relative phase does not change P(0) or P(1) in the Z basis, but it has not vanished. Once the measurement basis itself superposes |0⟩ and |1⟩, interference turns phase into a changed outcome probability.',
      },
    },
  },
  {
    slug: 'single-particle-interference',
    icon: 'ph-dots-nine',
    text: {
      zh: {
        title: '单粒子干涉',
        eyebrow: 'Quantum Lab 02 · 路径振幅',
        tagline: '一次发射一个粒子，看离散落点怎样长成干涉条纹。',
        description:
          '每个粒子只在屏幕上留下一个局部落点，但落点由两条路径的复振幅共同决定。持续发射后，单次不可预测的事件逐渐堆出稳定的概率分布。降低相干性，条纹会被洗掉。',
        notice:
          '这里相加的是路径振幅，不是两个“粒子走哪条缝”的概率。探测路径信息会降低相干性；哪怕不直接查看结果，只要路径在原则上可区分，干涉可见度就会下降。',
      },
      en: {
        title: 'Single-Particle Interference',
        eyebrow: 'Quantum Lab 02 · path amplitudes',
        tagline: 'Emit one particle at a time and watch discrete hits become fringes.',
        description:
          'Each particle leaves one localized hit, yet its landing distribution is set by complex amplitudes from both paths. Over many emissions, unpredictable events accumulate into a stable interference pattern. Reduce coherence and the fringes wash out.',
        notice:
          'Path amplitudes are added here, not probabilities for a particle secretly choosing one slit. Path information reduces coherence: even without reading it, making the alternatives distinguishable lowers fringe visibility.',
      },
    },
  },
  {
    slug: 'field-modes',
    icon: 'ph-waveform',
    text: {
      zh: {
        title: '场的模式与量子化',
        eyebrow: 'Quantum Lab 03 · 场论入口',
        tagline: '把连续的场拆成模式，再把每个模式读成一个量子振子。',
        description:
          '左侧画出一维空间中的模式函数，右侧是这个模式对应的量子谐振子能级。改变波数会改变模式形状与频率；改变占据数，则沿等间距能级加入一个个量子。',
        notice:
          '蓝色曲线是空间模式函数，不是粒子的轨迹。在固定粒子数的 Fock state 中，经典场的期望值可以为零；“粒子”指的是模式的离散激发，而不是曲线上移动的小球。',
      },
      en: {
        title: 'Field Modes & Quantization',
        eyebrow: 'Quantum Lab 03 · entry to field theory',
        tagline: 'Decompose a continuous field into modes, then read each mode as a quantum oscillator.',
        description:
          'The left side shows a spatial mode function; the right side shows the equally spaced oscillator levels associated with that mode. Changing wave number reshapes the mode and its frequency. Changing occupation adds quanta one level at a time.',
        notice:
          'The blue curve is a spatial mode function, not a particle trajectory. In a number-state Fock state the classical field expectation can be zero: a “particle” is a discrete excitation of a mode, not a bead moving along the curve.',
      },
    },
  },
];

function toQuantumLabEntry(
  definition: QuantumLabDefinition,
  locale: PhysicsLabLocale,
): PhysicsLabEntry {
  return {
    slug: definition.slug,
    href: getLocalizedQuantumLabPath(definition.slug, locale),
    icon: definition.icon,
    locale,
    ...definition.text[locale],
  };
}

export function getQuantumLabCatalog(
  locale = defaultPhysicsLabLocale,
): PhysicsLabEntry[] {
  const normalizedLocale = normalizePhysicsLabLocale(locale);
  return quantumLabDefinitions.map((definition) =>
    toQuantumLabEntry(definition, normalizedLocale),
  );
}

export function getQuantumLabSlugs(): string[] {
  return quantumLabDefinitions.map((definition) => definition.slug);
}

export function findQuantumLab(
  slug: string,
  locale = defaultPhysicsLabLocale,
): PhysicsLabEntry | undefined {
  const normalizedLocale = normalizePhysicsLabLocale(locale);
  const definition = quantumLabDefinitions.find((entry) => entry.slug === slug);
  return definition ? toQuantumLabEntry(definition, normalizedLocale) : undefined;
}

export const quantumLabCatalog = getQuantumLabCatalog(defaultPhysicsLabLocale);
