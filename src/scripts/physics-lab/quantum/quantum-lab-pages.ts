import type { PhysicsLabLocale } from '../physics-lab-i18n';
import type {
  PhysicsLabAction,
  PhysicsLabPage,
} from '../physics-lab-pages';

function playAction(
  locale: PhysicsLabLocale,
  pausedLabel?: string,
): PhysicsLabAction {
  return {
    id: 'toggle',
    icon: 'ph-play',
    label: pausedLabel ?? (locale === 'en' ? 'Play' : '播放'),
    pausedLabel: pausedLabel ?? (locale === 'en' ? 'Play' : '播放'),
    runningLabel: locale === 'en' ? 'Pause' : '暂停',
  };
}

function resetAction(locale: PhysicsLabLocale): PhysicsLabAction {
  return {
    id: 'reset',
    icon: 'ph-arrow-counter-clockwise',
    label: locale === 'en' ? 'Reset' : '重置',
  };
}

export function getQuantumLabPages(locale: PhysicsLabLocale): PhysicsLabPage[] {
  const controls = locale === 'en' ? 'Controls' : '控制';

  return [
    {
      slug: 'qubit-state',
      readouts: [
        { id: 'probabilityZero', label: locale === 'en' ? 'P(0) · Z basis' : 'P(0) · Z 基', initialValue: '50.0%' },
        { id: 'probabilityOne', label: locale === 'en' ? 'P(1) · Z basis' : 'P(1) · Z 基', initialValue: '50.0%' },
        { id: 'probabilityPlus', label: 'P(+β)', initialValue: '85.4%' },
        { id: 'relativePhase', label: locale === 'en' ? 'Relative phase' : '相对相位', initialValue: '45°' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Quantum state controls' : '量子态控制',
        eyebrow: controls,
        title: locale === 'en' ? 'State parameters' : '状态参数',
        actions: [playAction(locale, locale === 'en' ? 'Sweep phase' : '扫描相位'), resetAction(locale)],
        presets: [
          { id: 'zero', label: '|0⟩' },
          { id: 'plus', label: '|+⟩' },
          { id: 'phase', label: '|+i⟩' },
        ],
        fields: [
          { id: 'theta', label: locale === 'en' ? 'Mixing angle θ' : '混合角 θ', outputValue: '90°', min: 0, max: 180, step: 1, value: 90 },
          { id: 'phase', label: locale === 'en' ? 'Relative phase φ' : '相对相位 φ', outputValue: '45°', min: -180, max: 180, step: 1, value: 45 },
          { id: 'basis', label: locale === 'en' ? 'Measurement basis β' : '测量基 β', outputValue: '0°', min: -180, max: 180, step: 1, value: 0 },
        ],
      },
    },
    {
      slug: 'single-particle-interference',
      readouts: [
        { id: 'particleCount', label: locale === 'en' ? 'Detected particles' : '已探测粒子', initialValue: '0' },
        { id: 'visibility', label: locale === 'en' ? 'Fringe visibility' : '条纹可见度', initialValue: '100%' },
        { id: 'fringeSpacing', label: locale === 'en' ? 'Fringe spacing' : '条纹间距', initialValue: '0.100 L' },
        { id: 'regime', label: locale === 'en' ? 'Regime' : '当前状态', initialValue: locale === 'en' ? 'Coherent' : '相干' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Single-particle interference controls' : '单粒子干涉控制',
        eyebrow: controls,
        title: locale === 'en' ? 'Emission & paths' : '发射与路径',
        actions: [playAction(locale, locale === 'en' ? 'Emit particles' : '发射粒子'), resetAction(locale)],
        presets: [
          { id: 'coherent', label: locale === 'en' ? 'Coherent' : '完全相干' },
          { id: 'marked', label: locale === 'en' ? 'Path marked' : '路径可辨' },
          { id: 'longWave', label: locale === 'en' ? 'Long λ' : '长波长' },
        ],
        fields: [
          { id: 'slitSeparation', label: locale === 'en' ? 'Slit separation d' : '缝间距 d', outputValue: '6.0', min: 2, max: 12, step: 0.1, value: 6 },
          { id: 'wavelength', label: locale === 'en' ? 'Wavelength λ' : '波长 λ', outputValue: '0.60', min: 0.3, max: 1.2, step: 0.01, value: 0.6 },
          { id: 'coherence', label: locale === 'en' ? 'Coherence V' : '相干度 V', outputValue: '1.00', min: 0, max: 1, step: 0.01, value: 1 },
          { id: 'emissionRate', label: locale === 'en' ? 'Emission rate' : '发射速率', outputValue: '55/s', min: 5, max: 140, step: 1, value: 55 },
        ],
      },
    },
    {
      slug: 'field-modes',
      readouts: [
        { id: 'mode', label: locale === 'en' ? 'Mode number' : '模式编号', initialValue: 'k = 1' },
        { id: 'occupation', label: locale === 'en' ? 'Occupation' : '占据数', initialValue: 'n = 1' },
        { id: 'energy', label: locale === 'en' ? 'Mode energy' : '模式能量', initialValue: '1.50 ℏω' },
        { id: 'wavelength', label: locale === 'en' ? 'Wavelength' : '波长', initialValue: '2.00 L' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Quantum field mode controls' : '量子场模式控制',
        eyebrow: controls,
        title: locale === 'en' ? 'Mode & occupation' : '模式与占据',
        actions: [playAction(locale), resetAction(locale)],
        presets: [
          { id: 'vacuum', label: locale === 'en' ? 'Vacuum' : '真空态' },
          { id: 'oneQuantum', label: locale === 'en' ? 'One quantum' : '单量子' },
          { id: 'manyQuanta', label: locale === 'en' ? 'Many quanta' : '多量子' },
        ],
        fields: [
          { id: 'mode', label: locale === 'en' ? 'Wave number k' : '波数 k', outputValue: '1', min: 1, max: 6, step: 1, value: 1 },
          { id: 'occupation', label: locale === 'en' ? 'Occupation number n' : '占据数 n', outputValue: '1', min: 0, max: 8, step: 1, value: 1 },
          { id: 'speed', label: locale === 'en' ? 'Phase speed' : '相位速度', outputValue: '1.00×', min: 0.2, max: 2, step: 0.05, value: 1 },
        ],
      },
    },
  ];
}

export function getQuantumLabPage(
  slug: string,
  locale: PhysicsLabLocale,
): PhysicsLabPage | undefined {
  return getQuantumLabPages(locale).find((page) => page.slug === slug);
}
