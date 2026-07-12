import type { PhysicsLabDefinition } from '../physics-lab-catalog-types';
import type { PhysicsLabLocale } from '../physics-lab-i18n';
import type { PhysicsLabPage } from '../physics-lab-page-types';

export const magnusEffectDefinition: PhysicsLabDefinition = {
  slug: 'magnus-effect',
  icon: 'ph-soccer-ball',
  text: {
    zh: {
      title: 'Magnus Effect',
      eyebrow: '流体力学 · 旋转球体',
      tagline: '旋转改变边界层速度，压强差把球路掰弯。',
      description: '让一颗旋转球穿过空气。轨迹、相对气流、上下表面速度、压强区和 Magnus 力同步显示，直接连接旋转方向与弯曲方向。',
      notice: '正转速表示下旋，Magnus 力向上；负转速表示上旋，球会更快下坠。这里采用常用升力系数模型，适合解释趋势而非预测某一颗真实足球的精确落点。',
    },
    en: {
      title: 'Magnus Effect',
      eyebrow: 'Fluid dynamics · spinning balls',
      tagline: 'Spin changes boundary-layer speed, and pressure imbalance bends the flight.',
      description: 'Launch a spinning ball through air while its path, relative flow, surface speeds, pressure regions, and Magnus force remain synchronized.',
      notice: 'Positive spin is backspin and produces upward lift; negative spin is topspin and steepens the drop. The lift-coefficient model explains trends rather than predicting one specific real ball exactly.',
    },
  },
};

export function createMagnusEffectPage(locale: PhysicsLabLocale): PhysicsLabPage {
  const english = locale === 'en';
  return {
    slug: 'magnus-effect',
    readouts: [
      { id: 'flightTime', label: english ? 'Flight time' : '飞行时间', initialValue: '0.00 s' },
      { id: 'speed', label: english ? 'Ball speed' : '球速', initialValue: '28.0 m/s' },
      { id: 'spinRatio', label: english ? 'Spin ratio S' : '旋转比 S', initialValue: '0.19' },
      { id: 'liftForce', label: english ? 'Magnus force' : 'Magnus 力', initialValue: '2.8 N ↑' },
      { id: 'range', label: english ? 'Horizontal range' : '水平距离', initialValue: '0.0 m' },
    ],
    controls: {
      ariaLabel: english ? 'Magnus effect controls' : '马格努斯效应控制',
      eyebrow: english ? 'Controls' : '控制',
      title: english ? 'Spin the ball' : '让球旋转',
      actions: [
        { id: 'toggle', icon: 'ph-pause', label: english ? 'Pause' : '暂停', primary: true, runningLabel: english ? 'Pause' : '暂停', pausedLabel: english ? 'Play' : '播放' },
        { id: 'reset', icon: 'ph-crosshair', label: english ? 'Launch again' : '重新发球' },
      ],
      presets: [
        { id: 'backspin', label: english ? 'Backspin lift' : '下旋上浮' },
        { id: 'topspin', label: english ? 'Topspin dip' : '上旋下坠' },
        { id: 'noSpin', label: english ? 'No spin' : '无旋转' },
      ],
      toggles: [
        { id: 'showFlow', label: english ? 'Relative airflow' : '相对气流', description: english ? 'Streamlines and surface-speed arrows around the ball.' : '显示球周围流线与表面速度。', checked: true },
        { id: 'showReference', label: english ? 'No-spin reference' : '无旋转参考', description: english ? 'Compare against the same launch without Magnus force.' : '和同一次发球的无 Magnus 轨迹比较。', checked: true },
      ],
      fields: [
        { id: 'launchSpeed', label: english ? 'Launch speed' : '初速度', symbolLatex: 'v_0', outputValue: '28.0 m/s', min: 10, max: 45, step: 0.5, value: 28 },
        { id: 'spinRate', label: english ? 'Spin rate' : '转速', symbolLatex: '\\omega', outputValue: '+900 rpm', min: -1800, max: 1800, step: 50, value: 900 },
        { id: 'launchAngle', label: english ? 'Launch angle' : '发射角', symbolLatex: '\\theta', outputValue: '15°', min: 0, max: 40, step: 1, value: 15 },
        { id: 'ballDiameter', label: english ? 'Ball diameter' : '球直径', symbolLatex: 'D', outputValue: '22 cm', min: 6, max: 24, step: 1, value: 22 },
      ],
    },
  };
}
