import type { PhysicsLabDefinition } from '../physics-lab-catalog-types';
import type { PhysicsLabLocale } from '../physics-lab-i18n';
import type { PhysicsLabPage } from '../physics-lab-page-types';

export const laserCavityDefinition: PhysicsLabDefinition = {
  slug: 'laser-resonant-cavity',
  icon: 'ph-laser',
  text: {
    zh: {
      title: 'Laser Resonant Cavity',
      eyebrow: '激光物理 · 受激辐射',
      tagline: '只有相位对齐且增益战胜损耗，腔内光才会建立。',
      description: '两面反射镜筛选纵模，增益介质补偿每次往返的损耗。驻波、往返相位、增益曲线和允许纵模在同一画面中同步变化。',
      notice: '谐振条件决定哪些频率能留在腔中；阈值条件决定这些模式能否增长。满足其中一个条件并不自动意味着产生稳定激光。',
    },
    en: {
      title: 'Laser Resonant Cavity',
      eyebrow: 'Laser physics · stimulated emission',
      tagline: 'Intracavity light builds only when phase aligns and gain beats loss.',
      description: 'Two mirrors select longitudinal modes while a gain medium replaces round-trip loss. Standing wave, round-trip phase, gain profile, and allowed modes update together.',
      notice: 'Resonance decides which frequencies remain in the cavity; threshold decides whether those modes grow. Satisfying one condition alone does not guarantee stable laser output.',
    },
  },
};

export function createLaserCavityPage(locale: PhysicsLabLocale): PhysicsLabPage {
  const english = locale === 'en';
  return {
    slug: 'laser-resonant-cavity',
    readouts: [
      { id: 'modeOrder', label: english ? 'Nearest mode m' : '最近纵模 m', initialValue: '12' },
      { id: 'detuning', label: english ? 'Round-trip detuning' : '往返失谐', initialValue: '0.00 rad' },
      { id: 'threshold', label: english ? 'Threshold pump' : '阈值泵浦', initialValue: '1.00×' },
      { id: 'intracavityPower', label: english ? 'Intracavity power' : '腔内功率', initialValue: '0.0 a.u.' },
      { id: 'laserState', label: english ? 'Cavity state' : '谐振腔状态', initialValue: english ? 'Building' : '正在建立' },
    ],
    controls: {
      ariaLabel: english ? 'Laser cavity controls' : '激光谐振腔控制',
      eyebrow: english ? 'Controls' : '控制',
      title: english ? 'Phase and threshold' : '相位与阈值',
      actions: [
        { id: 'toggle', icon: 'ph-pause', label: english ? 'Pause field' : '暂停光场', primary: true, runningLabel: english ? 'Pause field' : '暂停光场', pausedLabel: english ? 'Animate field' : '播放光场' },
        { id: 'reset', icon: 'ph-arrow-counter-clockwise', label: english ? 'Reset' : '重置' },
      ],
      presets: [
        { id: 'resonant', label: english ? 'On resonance' : '精确共振' },
        { id: 'detuned', label: english ? 'Detuned' : '失谐' },
        { id: 'belowThreshold', label: english ? 'Below threshold' : '低于阈值' },
      ],
      toggles: [
        { id: 'showTravelingWaves', label: english ? 'Traveling components' : '行波分量', description: english ? 'Separate right- and left-moving waves behind the standing wave.' : '显示组成驻波的左右行波。', checked: true },
        { id: 'showModeSpectrum', label: english ? 'Mode spectrum' : '纵模频谱', description: english ? 'Compare cavity modes with the gain bandwidth.' : '比较允许纵模与增益带宽。', checked: true },
      ],
      fields: [
        { id: 'cavityLength', label: english ? 'Cavity length' : '腔长', symbolLatex: 'L/\\lambda', outputValue: '12.00 λ', min: 9.5, max: 14.5, step: 0.01, value: 12 },
        { id: 'mirrorReflectivity', label: english ? 'Mirror reflectivity' : '反射率', symbolLatex: 'R', outputValue: '96.0%', min: 0.8, max: 0.995, step: 0.005, value: 0.96 },
        { id: 'pumpRatio', label: english ? 'Pump / threshold' : '泵浦 / 阈值', symbolLatex: 'P/P_{th}', outputValue: '1.35×', min: 0.2, max: 2.2, step: 0.05, value: 1.35 },
        { id: 'gainBandwidth', label: english ? 'Gain bandwidth' : '增益带宽', symbolLatex: '\\Delta \\nu_g', outputValue: '3.0 modes', min: 1, max: 6, step: 0.25, value: 3 },
      ],
    },
  };
}
