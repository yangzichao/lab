import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const singleParticleInterferenceLesson = definePhysicsLabLesson({
  zh: {
    title: '单粒子干涉：一次一个，仍然形成条纹',
    background: '探测器每次只记录一个局域落点，但到达该点的概率振幅可同时包含两条不可区分路径。',
    motivation: '它最直接地显示量子理论叠加的是概率振幅，而不是大量粒子形成的经典波。',
    focusQuestion: '粒子一次只发射一个，没有粒子彼此碰撞，条纹从哪里来？',
    keyInsight: '每个事件按两条路径振幅之和的模平方采样；条纹是许多独立事件显出的概率分布。',
    formulas: [
      { title: '路径振幅叠加', expressionLatex: String.raw`P(x)=|\psi_1(x)+\psi_2(x)|^2`, explanation: '交叉项携带相对相位，并产生明暗调制。' },
      { title: '条纹可见度', expressionLatex: String.raw`\mathcal V=\frac{I_{\max}-I_{\min}}{I_{\max}+I_{\min}}`, explanation: 'V 从 1 降到 0 表示相干干涉逐渐消失。' },
    ],
    commonDifficulties: [
      { title: '条纹不是粒子互相碰撞造成', misconception: '必须同时有许多粒子通过狭缝才能干涉。', resolution: '即使事件间隔很长，单个事件的路径振幅仍可自干涉。' },
      { title: '路径探测不只是机械扰动', misconception: '条纹消失仅因为探测器撞偏了粒子。', resolution: '只要路径信息原则上可区分，路径与环境纠缠就会压低交叉项。' },
    ],
    steps: [
      { title: '逐点建立分布', instruction: '低速发射完全相干的粒子。', observation: '单点不可预测，累计后出现稳定条纹。' },
      { title: '降低相干度', instruction: '缓慢把 V 从 1 调到 0。', observation: '落点仍然出现，但明暗对比逐步消失。' },
      { title: '改变几何尺度', instruction: '分别改变 λ 和 d。', observation: '增大 λ 拉宽条纹，增大 d 压缩条纹。' },
    ],
    takeaway: '量子干涉存在于单次事件的概率规则中，而不是粒子之间。',
  },
  en: {
    title: 'Single-particle interference: one at a time, still fringes',
    background: 'A detector records one localized hit at a time, but the probability amplitude for that hit can include two indistinguishable paths.',
    motivation: 'It shows most directly that quantum theory superposes probability amplitudes, not a classical wave made from many particles.',
    focusQuestion: 'If particles are emitted one at a time and never collide, where does the fringe pattern come from?',
    keyInsight: 'Each event samples the squared sum of two path amplitudes; many independent events reveal that probability distribution.',
    formulas: [
      { title: 'Path-amplitude superposition', expressionLatex: String.raw`P(x)=|\psi_1(x)+\psi_2(x)|^2`, explanation: 'The cross term carries relative phase and creates bright-dark modulation.' },
      { title: 'Fringe visibility', expressionLatex: String.raw`\mathcal V=\frac{I_{\max}-I_{\min}}{I_{\max}+I_{\min}}`, explanation: 'As V falls from 1 to 0, coherent interference disappears.' },
    ],
    commonDifficulties: [
      { title: 'Particles do not need to collide', misconception: 'Many particles must pass simultaneously for interference to occur.', resolution: 'Even widely separated events can show self-interference between path amplitudes.' },
      { title: 'Path detection is not merely a mechanical kick', misconception: 'Fringes vanish only because the detector knocks particles aside.', resolution: 'If paths become distinguishable in principle, entanglement with the environment suppresses the cross term.' },
    ],
    steps: [
      { title: 'Build a distribution hit by hit', instruction: 'Emit fully coherent particles at a low rate.', observation: 'Individual hits are unpredictable while the accumulated pattern becomes stable.' },
      { title: 'Reduce coherence', instruction: 'Move V slowly from 1 to 0.', observation: 'Hits continue while bright-dark contrast fades.' },
      { title: 'Change geometric scales', instruction: 'Vary λ and d separately.', observation: 'Larger λ spreads fringes; larger d compresses them.' },
    ],
    takeaway: 'Quantum interference is built into the probability rule for each event, not into interactions between particles.',
  },
});
