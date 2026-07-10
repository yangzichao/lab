import {
  defaultPhysicsLabLocale,
  normalizePhysicsLabLocale,
  type PhysicsLabLocale,
} from './physics-lab-i18n';

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
  label?: string;
  labelHtml?: string;
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

const labels = {
  zh: {
    controls: '控制',
    pause: '暂停',
    play: '播放',
    reset: '重置',
    launch: '发射',
  },
  en: {
    controls: 'Controls',
    pause: 'Pause',
    play: 'Play',
    reset: 'Reset',
    launch: 'Launch',
  },
} satisfies Record<PhysicsLabLocale, Record<string, string>>;

function playPauseAction(locale: PhysicsLabLocale, initialState: 'running' | 'paused' = 'running'): PhysicsLabAction {
  return {
    id: 'toggle',
    icon: initialState === 'running' ? 'ph-pause' : 'ph-play',
    label: initialState === 'running' ? labels[locale].pause : labels[locale].play,
    primary: initialState === 'running',
    runningLabel: labels[locale].pause,
    pausedLabel: labels[locale].play,
  };
}

function resetAction(locale: PhysicsLabLocale, label = labels[locale].reset, icon = 'ph-arrow-counter-clockwise'): PhysicsLabAction {
  return {
    id: 'reset',
    icon,
    label,
  };
}

function getLocalizedPhysicsLabPages(locale: PhysicsLabLocale): PhysicsLabPage[] {
  const common = labels[locale];

  return [
    {
      slug: 'double-pendulum',
      readouts: [
        { id: 'time', label: locale === 'en' ? 'Time' : '时间', initialValue: '0.0 s' },
        { id: 'energy', label: locale === 'en' ? 'Total energy' : '总能量', initialValue: '0.00 J' },
        { id: 'speed', label: locale === 'en' ? 'Tip speed' : '末端速度', initialValue: '0.00 m/s' },
        { id: 'twinGap', label: locale === 'en' ? 'Twin gap' : '孪生偏差', initialValue: '0.00°' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Double pendulum controls' : '双摆控制',
        eyebrow: common.controls,
        title: 'Double Pendulum',
        actions: [playPauseAction(locale), resetAction(locale)],
        presets: [
          { id: 'gentle', label: locale === 'en' ? 'Gentle' : '轻摆' },
          { id: 'chaotic', label: locale === 'en' ? 'Chaotic' : '混沌' },
          { id: 'overTop', label: locale === 'en' ? 'Over the top' : '翻越顶端' },
        ],
        toggles: [
          {
            id: 'showTrail',
            label: locale === 'en' ? 'Trace the tip' : '描摹末端',
            description: locale === 'en' ? 'A luminous path from the lower bob.' : '下摆球在空间中留下的发光轨迹。',
            checked: true,
          },
          {
            id: 'showTwin',
            label: locale === 'en' ? 'Show chaotic twin' : '显示混沌孪生',
            description: locale === 'en' ? 'A violet copy offset by 0.001 degrees.' : '平行层中偏离 0.001° 的紫色副本。',
            checked: true,
          },
        ],
        fields: [
          { id: 'gravity', label: locale === 'en' ? 'Gravity' : '重力', outputValue: '1.00×', min: 0.4, max: 2.2, step: 0.05, value: 1 },
          { id: 'damping', label: locale === 'en' ? 'Damping' : '阻尼', outputValue: '0.040', min: 0, max: 0.16, step: 0.005, value: 0.04 },
          { id: 'angle1', label: locale === 'en' ? 'Upper angle theta1' : '上摆角 θ₁', outputValue: '120°', min: -179, max: 179, step: 1, value: 120 },
          { id: 'angle2', label: locale === 'en' ? 'Lower angle theta2' : '下摆角 θ₂', outputValue: '-35°', min: -179, max: 179, step: 1, value: -35 },
        ],
      },
    },
    {
      slug: 'orbit',
      readouts: [
        { id: 'classification', label: locale === 'en' ? 'Orbit' : '轨道', initialValue: 'Bound ellipse' },
        { id: 'radius', label: locale === 'en' ? 'Radius r' : '半径 r', initialValue: '180 px' },
        { id: 'speed', label: locale === 'en' ? 'Speed v' : '速度 v', initialValue: '0.00' },
        { id: 'energy', label: locale === 'en' ? 'Energy epsilon' : '能量 ε', initialValue: '+0.0' },
        { id: 'angularMomentum', label: locale === 'en' ? 'Angular momentum L' : '角动量 L', initialValue: '0' },
        { id: 'eccentricity', label: locale === 'en' ? 'Eccentricity e' : '偏心率 e', initialValue: '0.000' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Orbit lab controls' : '轨道 Lab 控制',
        eyebrow: common.controls,
        title: 'Orbit Lab',
        actions: [playPauseAction(locale), resetAction(locale, common.launch, 'ph-crosshair')],
        presets: [
          { id: 'circle', label: locale === 'en' ? 'Circular' : '圆轨道' },
          { id: 'ellipse', label: locale === 'en' ? 'Elliptical' : '椭圆轨道' },
          { id: 'escape', label: locale === 'en' ? 'Escape' : '逃逸' },
        ],
        toggles: [
          {
            id: 'showVectors',
            label: locale === 'en' ? 'Velocity and gravity' : '速度与引力',
            description: locale === 'en' ? 'Teal is v; amber is starward gravity.' : 'teal 是 v，amber 是指向恒星的引力。',
            checked: true,
          },
          {
            id: 'showOrbit',
            label: locale === 'en' ? 'Predicted orbit' : '预测轨道',
            description: locale === 'en' ? 'The conic section implied by the current state.' : '当前状态所对应的 conic section。',
            checked: true,
          },
          {
            id: 'showTrail',
            label: locale === 'en' ? 'Trace path' : '描摹轨迹',
            description: locale === 'en' ? 'Leave a path behind the body.' : '在天体身后留下轨迹。',
            checked: true,
          },
        ],
        fields: [
          { id: 'centralMass', label: locale === 'en' ? 'Central mass' : '中心质量', outputValue: '1.00×', min: 0.4, max: 2.4, step: 0.05, value: 1 },
          { id: 'launchRadius', label: locale === 'en' ? 'Launch radius' : '发射半径', outputValue: '180 px', min: 120, max: 255, step: 1, value: 180 },
          { id: 'launchSpeed', label: locale === 'en' ? 'Launch speed' : '发射速度', outputValue: '1.00×', min: 0.55, max: 1.55, step: 0.01, value: 1 },
          { id: 'launchAngle', label: locale === 'en' ? 'Launch angle' : '发射角', outputValue: '90°', min: 45, max: 135, step: 1, value: 90 },
        ],
      },
    },
    {
      slug: 'wave-interference',
      readouts: [
        { id: 'pathDiff', label: locale === 'en' ? 'Path difference' : '光程差', initialValue: '0.0 px' },
        { id: 'pathDiffLambda', label: locale === 'en' ? 'In wavelengths' : '以波长计', initialValue: '0.00 λ' },
        { id: 'field', label: locale === 'en' ? 'Probe field' : '探针处场值', initialValue: '+0.00' },
        { id: 'fringeScale', label: locale === 'en' ? 'Fringe spacing' : '条纹间距', initialValue: '0 px' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Wave interference controls' : '波的干涉控制',
        eyebrow: common.controls,
        title: 'Wave Interference',
        actions: [playPauseAction(locale), resetAction(locale)],
        toggles: [
          {
            id: 'showWavefronts',
            label: locale === 'en' ? 'Wavefronts' : '波前',
            description: locale === 'en' ? 'Crests expanding from each source.' : '从每个波源扩张的波峰。',
            checked: true,
          },
          {
            id: 'showIntensity',
            label: locale === 'en' ? 'Screen intensity' : '屏上强度',
            description: locale === 'en' ? 'The fringe pattern along the right edge.' : '沿右边缘呈现的条纹图样。',
            checked: true,
          },
        ],
        fields: [
          { id: 'wavelength', label: locale === 'en' ? 'Wavelength λ' : '波长 λ', outputValue: '48 px', min: 24, max: 88, step: 1, value: 48 },
          { id: 'sourceSeparation', label: locale === 'en' ? 'Source separation d' : '波源间距 d', outputValue: '160 px', min: 48, max: 260, step: 1, value: 160 },
          { id: 'phaseOffset', label: locale === 'en' ? 'Phase offset' : '相位差', outputValue: '0°', min: -180, max: 180, step: 1, value: 0 },
          { id: 'falloff', label: locale === 'en' ? 'Falloff' : '衰减', outputValue: '0.006', min: 0.001, max: 0.014, step: 0.001, value: 0.006 },
        ],
      },
    },
    {
      slug: 'electric-field',
      readouts: [
        { id: 'potential', label: locale === 'en' ? 'Potential V' : '电势 V', initialValue: '+0.0' },
        { id: 'fieldStrength', label: locale === 'en' ? 'Field strength |E|' : '场强 |E|', initialValue: '0.00' },
        { id: 'charges', label: locale === 'en' ? 'Charges' : '电荷数', initialValue: '2' },
        { id: 'netCharge', label: locale === 'en' ? 'Net charge' : '净电荷', initialValue: '0' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Electric field controls' : '电场控制',
        eyebrow: common.controls,
        title: 'Electric Field',
        actions: [playPauseAction(locale), resetAction(locale)],
        presets: [
          { id: 'dipole', label: locale === 'en' ? 'Dipole' : '偶极子' },
          { id: 'like', label: locale === 'en' ? 'Like charges' : '同号电荷对' },
          { id: 'quadrupole', label: locale === 'en' ? 'Quadrupole' : '四极子' },
        ],
        toggles: [
          {
            id: 'showEquipotentials',
            label: locale === 'en' ? 'Equipotentials' : '等势线',
            description: locale === 'en' ? 'Contour lines where potential is equal.' : '电势相等处的等高线。',
            checked: true,
          },
          {
            id: 'showFieldLines',
            label: locale === 'en' ? 'Field lines' : '电场线',
            description: locale === 'en' ? 'Streamlines flowing from + toward -.' : '从 + 流向 − 的流线。',
            checked: true,
          },
        ],
        notices: [
          {
            icon: 'ph-hand-pointing',
            text:
              locale === 'en'
                ? 'Drag any charge on the canvas to reshape the field. Teal dots are positive test charges drifting along E.'
                : '在画布上拖动任意电荷即可重塑场。teal 色圆点是沿 E 漂移的正测试电荷。',
          },
        ],
      },
    },
    {
      slug: 'fourier-epicycles',
      readouts: [
        { id: 'waveform', label: locale === 'en' ? 'Target wave' : '目标波形', initialValue: 'Square' },
        { id: 'terms', label: locale === 'en' ? 'Terms (N)' : '项数 (N)', initialValue: '6' },
        { id: 'baseFrequency', label: locale === 'en' ? 'Base frequency ω' : '基频 ω', initialValue: '1.00 rad/s' },
        { id: 'value', label: locale === 'en' ? 'Composite value' : '合成值', initialValue: '+0.00' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Fourier epicycle controls' : 'Fourier 周转圆控制',
        eyebrow: common.controls,
        title: 'Fourier Epicycles',
        actions: [playPauseAction(locale), resetAction(locale)],
        presets: [
          { id: 'square', label: locale === 'en' ? 'Square' : '方波' },
          { id: 'sawtooth', label: locale === 'en' ? 'Sawtooth' : '锯齿波' },
          { id: 'triangle', label: locale === 'en' ? 'Triangle' : '三角波' },
        ],
        toggles: [
          {
            id: 'showCircles',
            label: locale === 'en' ? 'Show circles' : '显示圆',
            description: locale === 'en' ? 'Pale guide circles behind each rotating vector.' : '每个旋转矢量背后的淡色引导圆。',
            checked: true,
          },
          {
            id: 'showTarget',
            label: locale === 'en' ? 'Show target wave' : '显示目标波',
            description: locale === 'en' ? 'The ideal dashed waveform for comparison.' : '理想波形，虚线，用于对比。',
            checked: true,
          },
        ],
        fields: [
          { id: 'terms', label: locale === 'en' ? 'Harmonics N' : '谐波数 N', outputValue: '6', min: 1, max: 40, step: 1, value: 6 },
          { id: 'speed', label: locale === 'en' ? 'Speed' : '速度', outputValue: '1.00×', min: 0.1, max: 3, step: 0.05, value: 1 },
        ],
      },
    },
    {
      slug: 'ideal-gas',
      readouts: [
        { id: 'count', label: locale === 'en' ? 'Particles' : '粒子数', initialValue: '170' },
        { id: 'temperature', label: locale === 'en' ? 'Temperature' : '温度', initialValue: '1.00' },
        { id: 'pressure', label: locale === 'en' ? 'Pressure' : '压强', initialValue: '0.00' },
        { id: 'meanSpeed', label: locale === 'en' ? 'Mean speed' : '平均速率', initialValue: '0.00' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Kinetic theory controls' : '分子运动论控制',
        eyebrow: common.controls,
        title: 'Kinetic Theory',
        actions: [playPauseAction(locale), resetAction(locale)],
        presets: [
          { id: 'cold', label: locale === 'en' ? 'Cold' : '低温' },
          { id: 'warm', label: locale === 'en' ? 'Warm' : '温热' },
          { id: 'hot', label: locale === 'en' ? 'Hot' : '高温' },
        ],
        toggles: [
          {
            id: 'showHistogram',
            label: locale === 'en' ? 'Show speed distribution' : '显示速率分布',
            description:
              locale === 'en'
                ? 'A live histogram overlaid with the Maxwell-Boltzmann curve.'
                : '实时直方图，叠加 Maxwell–Boltzmann 曲线。',
            checked: true,
          },
          {
            id: 'colorBySpeed',
            label: locale === 'en' ? 'Color by speed' : '按速率着色',
            description: locale === 'en' ? 'Blue is slow and cold; red is fast and hot.' : '蓝色慢而冷，红色快而热。',
            checked: true,
          },
        ],
        fields: [
          { id: 'count', label: locale === 'en' ? 'Particle count' : '粒子数', outputValue: '170', min: 60, max: 240, step: 2, value: 170 },
          { id: 'temperature', label: locale === 'en' ? 'Temperature' : '温度', outputValue: '1.00×', min: 0.1, max: 4, step: 0.05, value: 1 },
        ],
      },
    },
    {
      slug: 'coupled-oscillators',
      readouts: [
        { id: 'count', label: locale === 'en' ? 'Masses' : '珠子数', initialValue: '6' },
        { id: 'mode', label: locale === 'en' ? 'Excited mode' : '激发模式', initialValue: 'p = 1' },
        { id: 'frequency', label: locale === 'en' ? 'Frequency' : '频率', initialValue: '0.000 rad/s' },
        { id: 'energy', label: locale === 'en' ? 'Total energy' : '总能量', initialValue: '0.000' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Coupled oscillator controls' : '耦合振子控制',
        eyebrow: common.controls,
        title: 'Coupled Oscillators',
        actions: [playPauseAction(locale), resetAction(locale)],
        presets: [
          { id: 'mode1', label: locale === 'en' ? 'Mode 1' : '模式 1' },
          { id: 'mode2', label: locale === 'en' ? 'Mode 2' : '模式 2' },
          { id: 'mode3', label: locale === 'en' ? 'Mode 3' : '模式 3' },
          { id: 'beats', label: locale === 'en' ? 'Beats' : '拍频' },
        ],
        toggles: [
          {
            id: 'showEnvelopes',
            label: locale === 'en' ? 'Show mode envelopes' : '显示模式包络',
            description:
              locale === 'en'
                ? 'Floating dashed sine shapes for the excited modes, sin(pπx/(N+1)).'
                : '悬浮的虚线正弦形显示各激发 mode：sin(pπx/(N+1))。',
            checked: true,
          },
          {
            id: 'showSprings',
            label: locale === 'en' ? 'Show springs' : '显示弹簧',
            description: locale === 'en' ? 'Spring coils between neighboring masses and the walls.' : '相邻珠子之间以及与墙之间的弹簧圈。',
            checked: true,
          },
        ],
        fields: [
          { id: 'count', label: locale === 'en' ? 'Mass count N' : '珠子数 N', outputValue: '6', min: 3, max: 12, step: 1, value: 6 },
          { id: 'speed', label: locale === 'en' ? 'Speed' : '速度', outputValue: '1.00×', min: 0.2, max: 3, step: 0.1, value: 1 },
        ],
      },
    },
    {
      slug: 'diffraction',
      readouts: [
        { id: 'firstMinimum', label: locale === 'en' ? 'First single-slit minimum' : '单缝首个极小', initialValue: 'sin θ = 0.000' },
        { id: 'maximaSpacing', label: locale === 'en' ? 'Principal maxima spacing' : '主极大间距', initialValue: '— (single)' },
        { id: 'slits', label: locale === 'en' ? 'Slits' : '缝数', initialValue: '1' },
        { id: 'firstOrderAngle', label: locale === 'en' ? 'First-order angle' : '一级衍射角', initialValue: '— (single)' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Diffraction controls' : '衍射控制',
        eyebrow: common.controls,
        title: 'Diffraction',
        actions: [playPauseAction(locale, 'paused'), resetAction(locale)],
        presets: [
          { id: 'single', label: locale === 'en' ? 'Single slit' : '单缝' },
          { id: 'double', label: locale === 'en' ? 'Double slit' : '双缝' },
          { id: 'grating', label: locale === 'en' ? 'Grating' : '光栅' },
        ],
        fields: [
          { id: 'slitWidth', label: locale === 'en' ? 'Slit width a' : '缝宽 a', outputValue: '10.0 µ', min: 1, max: 14, step: 0.5, value: 10 },
          { id: 'slitSpacing', label: locale === 'en' ? 'Slit spacing d' : '缝间距 d', outputValue: '18.0 µ', min: 6, max: 40, step: 0.5, value: 18 },
          { id: 'slitCount', label: locale === 'en' ? 'Slit count N' : '缝数 N', outputValue: '6', min: 2, max: 12, step: 1, value: 6 },
          { id: 'wavelength', label: locale === 'en' ? 'Wavelength λ' : '波长 λ', outputValue: '540 nm', min: 380, max: 720, step: 1, value: 540 },
        ],
        toggles: [
          {
            id: 'showEnvelope',
            label: locale === 'en' ? 'Single-slit envelope' : '单缝包络',
            description: locale === 'en' ? 'A raised dashed sinc² envelope over the screen profile.' : '悬在屏幕强度曲线上的虚线 sinc² 包络。',
            checked: true,
          },
          {
            id: 'showScreenBand',
            label: locale === 'en' ? 'Screen color band' : '屏幕色带',
            description: locale === 'en' ? 'Light the 3D screen with the color your eye would see.' : '用肉眼可见的颜色点亮三维屏幕。',
            checked: true,
          },
        ],
      },
    },
    {
      slug: 'charged-particle',
      readouts: [
        { id: 'speed', label: locale === 'en' ? 'Speed' : '速度', initialValue: '0.00 m/s' },
        { id: 'radius', label: locale === 'en' ? 'Cyclotron radius' : '回旋半径', initialValue: '∞' },
        { id: 'frequency', label: locale === 'en' ? 'Cyclotron frequency' : '回旋频率', initialValue: '0.00 rad/s' },
        { id: 'energy', label: locale === 'en' ? 'Kinetic energy' : '动能', initialValue: '0.00 J' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Charged particle controls' : '带电粒子控制',
        eyebrow: common.controls,
        title: 'Charged Particle',
        actions: [playPauseAction(locale), resetAction(locale)],
        presets: [
          { id: 'cyclotron', label: locale === 'en' ? 'Cyclotron' : '回旋' },
          { id: 'drift', label: locale === 'en' ? 'E x B drift' : 'E×B 漂移' },
          { id: 'accelerate', label: locale === 'en' ? 'Accelerate' : '加速' },
        ],
        toggles: [
          {
            id: 'showVectors',
            label: locale === 'en' ? 'Show vectors' : '显示矢量',
            description: locale === 'en' ? 'Velocity in teal and Lorentz force in amber.' : '速度（teal）与 Lorentz force（amber）。',
            checked: true,
          },
          {
            id: 'showField',
            label: locale === 'en' ? 'Show field grid' : '显示场网格',
            description: locale === 'en' ? 'B uses ⊙/⊗ symbols; E uses amber arrows.' : 'B 用 ⊙/⊗ 符号，E 用 amber 箭头。',
            checked: true,
          },
          {
            id: 'showTrail',
            label: locale === 'en' ? 'Trace path' : '描摹轨迹',
            description: locale === 'en' ? 'A fading trail behind the particle.' : '粒子的渐隐轨迹。',
            checked: true,
          },
        ],
        fields: [
          { id: 'charge', label: locale === 'en' ? 'Charge q' : '电荷 q', outputValue: '+1.0 C', min: -3, max: 3, step: 0.1, value: 1 },
          { id: 'mass', label: locale === 'en' ? 'Mass m' : '质量 m', outputValue: '1.0 kg', min: 0.2, max: 4, step: 0.1, value: 1 },
          { id: 'magneticZ', labelHtml: locale === 'en' ? 'Magnetic field B<sub>z</sub>' : '磁场 B<sub>z</sub>', outputValue: '+2.0 T', min: -4, max: 4, step: 0.1, value: 2 },
          { id: 'electricX', labelHtml: locale === 'en' ? 'Electric field E<sub>x</sub>' : '电场 E<sub>x</sub>', outputValue: '+0.0', min: -10, max: 10, step: 0.5, value: 0 },
          { id: 'electricY', labelHtml: locale === 'en' ? 'Electric field E<sub>y</sub>' : '电场 E<sub>y</sub>', outputValue: '+0.0', min: -10, max: 10, step: 0.5, value: 0 },
          { id: 'speed', label: locale === 'en' ? 'Initial speed' : '初速度', outputValue: '14 m/s', min: 2, max: 30, step: 1, value: 14 },
        ],
      },
    },
    {
      slug: 'three-body',
      readouts: [
        { id: 'time', label: locale === 'en' ? 'Time' : '时间', initialValue: '0.0 s' },
        { id: 'energy', label: locale === 'en' ? 'Total energy' : '总能量', initialValue: '+0.000' },
        { id: 'momentum', label: locale === 'en' ? 'Total momentum' : '总动量', initialValue: '0.000' },
        { id: 'status', label: locale === 'en' ? 'Status' : '状态', initialValue: 'Bounded' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Three-body controls' : '三体控制',
        eyebrow: common.controls,
        title: 'Three-Body Problem',
        actions: [playPauseAction(locale), resetAction(locale)],
        presets: [
          { id: 'figure8', label: locale === 'en' ? 'Figure-eight' : '8 字轨道' },
          { id: 'chaos', label: locale === 'en' ? 'Chaos' : '混沌' },
          { id: 'triangle', label: locale === 'en' ? 'Triangle' : '三角' },
        ],
        toggles: [
          {
            id: 'showTrails',
            label: locale === 'en' ? 'Show trails' : '显示轨迹',
            description: locale === 'en' ? 'Fading trails behind each body.' : '每个天体身后留下的渐隐轨迹。',
            checked: true,
          },
          {
            id: 'showVectors',
            label: locale === 'en' ? 'Show velocity vectors' : '显示速度矢量',
            description: locale === 'en' ? 'One teal arrow for each body.' : '每个天体一支 teal 箭头。',
          },
          {
            id: 'showCenterOfMass',
            label: locale === 'en' ? 'Show center of mass' : '显示质心',
            description: locale === 'en' ? 'It should stay fixed because momentum is conserved.' : '应保持不动——动量守恒。',
          },
        ],
        fields: [
          { id: 'speed', label: locale === 'en' ? 'Speed' : '速度', outputValue: '1.00×', min: 0.2, max: 3, step: 0.05, value: 1 },
          { id: 'perturbation', label: locale === 'en' ? 'Perturbation' : '扰动', outputValue: '0.50%', min: 0, max: 5, step: 0.05, value: 0.5 },
        ],
      },
    },
    {
      slug: 'lens-optics',
      readouts: [
        { id: 'imageDistance', label: locale === 'en' ? 'Image distance' : '像距', initialValue: '0 px' },
        { id: 'magnification', label: locale === 'en' ? 'Magnification' : '放大率', initialValue: '0.00×' },
        { id: 'imageType', label: locale === 'en' ? 'Image type' : '像的类型', initialValue: 'real' },
        { id: 'orientation', label: locale === 'en' ? 'Orientation' : '朝向', initialValue: 'inverted' },
      ],
      controls: {
        ariaLabel: locale === 'en' ? 'Lens optics controls' : '透镜光学控制',
        eyebrow: common.controls,
        title: 'Lenses & Refraction',
        actions: [resetAction(locale)],
        presets: [
          { id: 'real', label: locale === 'en' ? 'Real image' : '实像' },
          { id: 'magnifier', label: locale === 'en' ? 'Magnifier' : '放大镜' },
          { id: 'diverging', label: locale === 'en' ? 'Diverging' : '发散' },
        ],
        toggles: [
          {
            id: 'showRays',
            label: locale === 'en' ? 'Principal rays' : '主光线',
            description: locale === 'en' ? 'Three spatial rays that locate the image.' : '在空间中确定像位置的三条光线。',
            checked: true,
          },
          {
            id: 'showFoci',
            label: locale === 'en' ? 'Focus markers' : '焦点标记',
            description: locale === 'en' ? 'Mark F and 2F on both sides.' : '在两侧标出 F 和 2F。',
            checked: true,
          },
        ],
        fields: [
          { id: 'focalLength', label: locale === 'en' ? 'Focal length f' : '焦距 f', outputValue: '150 px', min: -260, max: 260, step: 2, value: 150 },
          { id: 'objectDistance', labelHtml: locale === 'en' ? 'Object distance d<sub>o</sub>' : '物距 d<sub>o</sub>', outputValue: '360 px', min: 30, max: 420, step: 2, value: 360 },
          { id: 'objectHeight', labelHtml: locale === 'en' ? 'Object height h<sub>o</sub>' : '物高 h<sub>o</sub>', outputValue: '110 px', min: 20, max: 240, step: 2, value: 110 },
        ],
      },
    },
  ];
}

export function getPhysicsLabPages(locale = defaultPhysicsLabLocale): PhysicsLabPage[] {
  return getLocalizedPhysicsLabPages(normalizePhysicsLabLocale(locale));
}

export function getPhysicsLabPage(
  slug: string,
  locale = defaultPhysicsLabLocale,
): PhysicsLabPage | undefined {
  return getPhysicsLabPages(locale).find((page) => page.slug === slug);
}
