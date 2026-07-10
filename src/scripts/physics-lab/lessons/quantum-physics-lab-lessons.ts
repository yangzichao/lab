import type { PhysicsLabLocale } from '../physics-lab-i18n';
import type { PhysicsLabLesson } from './physics-lab-lesson-types';

const quantumPhysicsLabLessons: Record<
  PhysicsLabLocale,
  Record<string, PhysicsLabLesson>
> = {
  zh: {
    'qubit-state': {
      title: '从态矢量到测量概率',
      introduction: 'Qubit 的状态由两个复振幅描述。Bloch 球把归一化和不可观测的整体相位消去，只留下混合角与相对相位。',
      formulas: [
        {
          title: '纯 Qubit 状态',
          expressionLatex: String.raw`|\psi\rangle=\cos\frac{\theta}{2}|0\rangle+e^{i\phi}\sin\frac{\theta}{2}|1\rangle`,
          explanation: 'θ 决定两个基态的权重，φ 决定相对相位。整体相位不会改变任何测量概率。',
        },
        {
          title: 'Z 基测量概率',
          expressionLatex: String.raw`P(0)=\cos^2\frac{\theta}{2},\qquad P(1)=\sin^2\frac{\theta}{2}`,
          explanation: 'Born 规则要求对振幅取模平方。相对相位 φ 不影响 Z 基概率，却会影响旋转后的测量基。',
        },
      ],
      steps: [
        { title: '沿经线改变概率', instruction: '固定 φ，缓慢把 θ 从 0° 扫到 180°。', observation: 'Bloch 向量从北极到南极，P(0) 从 1 连续降到 0。' },
        { title: '只扫描相位', instruction: '设置 θ=90°，播放相位扫描。', observation: 'Z 基概率保持 50/50，但球面方位角与其他基的概率变化。' },
        { title: '旋转测量基', instruction: '固定状态并改变测量基 β。', observation: '同一个量子态在不同基中给出不同结果分布。' },
      ],
      takeaway: '量子态不是预先隐藏的 0 或 1；它规定了对每个测量基可能得到的概率分布。',
    },
    'single-particle-interference': {
      title: '单粒子如何累积出干涉条纹',
      introduction: '每次探测只出现一个局域点，但到达屏幕的概率振幅来自两条不可区分路径之和。大量事件才显出条纹。',
      formulas: [
        {
          title: '路径振幅叠加',
          expressionLatex: String.raw`P(x)=|\psi_1(x)+\psi_2(x)|^2`,
          explanation: '先加复振幅再取模平方，会产生交叉项。若路径信息可辨，交叉项消失，条纹被抹平。',
        },
        {
          title: '条纹可见度',
          expressionLatex: String.raw`\mathcal V=\frac{I_{\max}-I_{\min}}{I_{\max}+I_{\min}}`,
          explanation: 'V=1 表示明暗对比完整，V=0 表示没有干涉。模拟中的相干度直接控制这一对比。',
        },
      ],
      steps: [
        { title: '逐粒子建立图样', instruction: '选择“完全相干”，以较低速率发射粒子。', observation: '单个落点不可预测，但累计分布逐渐形成稳定条纹。' },
        { title: '标记路径', instruction: '切换到“路径可辨”或把相干度降到零。', observation: '粒子仍逐个到达，但明暗调制消失。' },
        { title: '改变几何尺度', instruction: '分别改变波长 λ 与缝间距 d。', observation: '增大 λ 会拉宽条纹，增大 d 会压缩条纹。' },
      ],
      takeaway: '量子干涉来自概率振幅而不是粒子彼此碰撞；哪条路径信息会破坏相干交叉项。',
    },
    'field-modes': {
      title: '把量子场读成一组谐振子',
      introduction: '有限区域中的场只能采用满足边界条件的驻波形状。量子化后，每个模式都是能量离散的独立谐振子。',
      formulas: [
        {
          title: '固定边界驻波',
          expressionLatex: String.raw`u_k(x)=A\sin\!\left(\frac{k\pi x}{L}\right),\qquad \omega_k=\frac{k\pi c}{L}`,
          explanation: '整数 k 计算区间内的半波数。更高 k 具有更短波长和更多节点。',
        },
        {
          title: '模式的量子化能量',
          expressionLatex: String.raw`E_{n,k}=\hbar\omega_k\left(n+\frac{1}{2}\right)`,
          explanation: '占据数 n 每增加 1，能量增加一份 ℏωk；即使 n=0，仍保留零点能 ℏωk/2。',
        },
      ],
      steps: [
        { title: '查看空间模式', instruction: '保持 n=1，逐步把 k 从 1 提高到 6。', observation: '节点数增加，波长缩短，模式频率上升。' },
        { title: '进入真空态', instruction: '选择“真空态”或把 n 调到 0。', observation: '没有可计数的量子，但场仍显示零点涨落尺度。' },
        { title: '增加占据数', instruction: '固定 k 并提高 n。', observation: '空间节点位置不变，振幅和能量按量子份额增加。' },
      ],
      takeaway: '粒子可以理解为场模式中的离散激发；模式由边界决定，能量份额由量子化决定。',
    },
  },
  en: {
    'qubit-state': {
      title: 'From a state vector to measurement probabilities',
      introduction: 'A qubit state uses two complex amplitudes. The Bloch sphere removes normalization and unobservable global phase, leaving a mixing angle and a relative phase.',
      formulas: [
        { title: 'Pure qubit state', expressionLatex: String.raw`|\psi\rangle=\cos\frac{\theta}{2}|0\rangle+e^{i\phi}\sin\frac{\theta}{2}|1\rangle`, explanation: 'θ sets the weights of the basis states and φ sets their relative phase. A global phase changes no measurement probability.' },
        { title: 'Z-basis probabilities', expressionLatex: String.raw`P(0)=\cos^2\frac{\theta}{2},\qquad P(1)=\sin^2\frac{\theta}{2}`, explanation: 'The Born rule takes the squared magnitude of each amplitude. Relative phase does not change Z probabilities but affects rotated bases.' },
      ],
      steps: [
        { title: 'Change probability along a meridian', instruction: 'Hold φ fixed and sweep θ from 0 to 180 degrees.', observation: 'The Bloch vector moves north to south while P(0) falls continuously from 1 to 0.' },
        { title: 'Sweep phase only', instruction: 'Set θ=90 degrees and play the phase sweep.', observation: 'Z probabilities remain 50/50 while azimuth and probabilities in other bases change.' },
        { title: 'Rotate the measurement basis', instruction: 'Hold the state fixed and vary basis β.', observation: 'The same quantum state produces different outcome distributions in different bases.' },
      ],
      takeaway: 'A quantum state is not a hidden pre-existing 0 or 1; it specifies probability distributions for every possible measurement basis.',
    },
    'single-particle-interference': {
      title: 'How single particles accumulate an interference pattern',
      introduction: 'Each detection is one localized point, but its arrival probability comes from adding amplitudes for two indistinguishable paths. Many events reveal the fringe pattern.',
      formulas: [
        { title: 'Path-amplitude superposition', expressionLatex: String.raw`P(x)=|\psi_1(x)+\psi_2(x)|^2`, explanation: 'Complex amplitudes add before taking magnitude squared, creating a cross term. Distinguishable paths remove that term and wash out fringes.' },
        { title: 'Fringe visibility', expressionLatex: String.raw`\mathcal V=\frac{I_{\max}-I_{\min}}{I_{\max}+I_{\min}}`, explanation: 'V=1 means full bright-dark contrast and V=0 means no interference. The simulation coherence control directly sets this contrast.' },
      ],
      steps: [
        { title: 'Build the pattern particle by particle', instruction: 'Choose Coherent and emit particles at a low rate.', observation: 'Individual hits are unpredictable, but their accumulated distribution develops stable fringes.' },
        { title: 'Mark the path', instruction: 'Choose Path marked or reduce coherence to zero.', observation: 'Particles still arrive one by one, but bright-dark modulation disappears.' },
        { title: 'Change geometric scales', instruction: 'Vary wavelength λ and slit separation d independently.', observation: 'Larger λ spreads fringes while larger d compresses them.' },
      ],
      takeaway: 'Quantum interference comes from probability amplitudes, not particles colliding with each other; path information destroys the coherent cross term.',
    },
    'field-modes': {
      title: 'Read a quantum field as a set of oscillators',
      introduction: 'A field in a finite region can only adopt standing-wave shapes allowed by its boundaries. After quantization, each mode is an independent oscillator with discrete energy.',
      formulas: [
        { title: 'Fixed-boundary standing waves', expressionLatex: String.raw`u_k(x)=A\sin\!\left(\frac{k\pi x}{L}\right),\qquad \omega_k=\frac{k\pi c}{L}`, explanation: 'Integer k counts half-waves across the interval. Higher k has shorter wavelength, more nodes, and higher frequency.' },
        { title: 'Quantized mode energy', expressionLatex: String.raw`E_{n,k}=\hbar\omega_k\left(n+\frac{1}{2}\right)`, explanation: 'Each increase of occupation n adds one quantum ℏωk. Even at n=0, zero-point energy ℏωk/2 remains.' },
      ],
      steps: [
        { title: 'Inspect spatial modes', instruction: 'Keep n=1 and raise k from 1 to 6.', observation: 'Node count rises, wavelength shortens, and mode frequency increases.' },
        { title: 'Enter the vacuum state', instruction: 'Choose Vacuum or set n to 0.', observation: 'No countable quanta remain, but a zero-point fluctuation scale is still shown.' },
        { title: 'Increase occupation', instruction: 'Hold k fixed and raise n.', observation: 'Node positions stay fixed while amplitude and energy grow in quantum-sized steps.' },
      ],
      takeaway: 'Particles can be understood as discrete excitations of field modes; boundaries choose the modes and quantization chooses the energy steps.',
    },
  },
};

export function getQuantumPhysicsLabLesson(
  slug: string,
  locale: PhysicsLabLocale,
): PhysicsLabLesson | undefined {
  return quantumPhysicsLabLessons[locale][slug];
}
