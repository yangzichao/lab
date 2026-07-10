import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const qubitStateLesson = definePhysicsLabLesson({
  zh: {
    title: 'Qubit：状态不是答案，而是概率结构',
    background: '经典 bit 只能取 0 或 1；Qubit 用两个复振幅描述，并允许不同测量基读取同一状态。',
    motivation: '相位和测量基是量子算法获得干涉优势的核心，也是初学者最容易被“叠加就是同时为 0 和 1”误导的地方。',
    focusQuestion: '如果 Z 基概率始终是 50/50，相对相位变化还有什么物理意义？',
    keyInsight: '相位不改变当前基的概率，却改变状态与其他测量基的重叠。',
    formulas: [
      { title: 'Bloch 球参数化', expressionLatex: String.raw`|\psi\rangle=\cos\frac{\theta}{2}|0\rangle+e^{i\phi}\sin\frac{\theta}{2}|1\rangle`, explanation: 'θ 控制两个基态权重，φ 是可通过干涉读取的相对相位。' },
      { title: 'Z 基 Born 概率', expressionLatex: String.raw`P(0)=\cos^2\frac{\theta}{2},\qquad P(1)=\sin^2\frac{\theta}{2}`, explanation: '测量概率是对应振幅的模平方。' },
    ],
    commonDifficulties: [
      { title: '叠加不是隐藏的经典答案', misconception: 'Qubit 测量前其实已经是 0 或 1，只是我们不知道。', resolution: '一个状态必须同时预测多个不相容测量基；一般不存在一组预先固定的经典答案。' },
      { title: '整体相位与相对相位不同', misconception: '所有复相位都能改变实验结果。', resolution: '整体乘以 e^{iγ} 不改变概率；只有分量之间的相对相位可被干涉观测。' },
    ],
    steps: [
      { title: '改变振幅权重', instruction: '固定 φ，把 θ 从 0° 扫到 180°。', observation: 'P(0) 从 1 降到 0，Bloch 向量沿经线移动。' },
      { title: '只改变相位', instruction: '设 θ=90° 并扫描 φ。', observation: 'Z 基保持 50/50，但球面方位和其他基概率变化。' },
      { title: '旋转测量基', instruction: '固定状态并改变 β。', observation: '同一状态在不同基中给出不同分布。' },
    ],
    takeaway: 'Qubit 状态的完整信息存在于振幅大小和相对相位中。',
  },
  en: {
    title: 'Qubits: a state is a probability structure, not an answer',
    background: 'A classical bit is 0 or 1. A qubit uses two complex amplitudes and lets different measurement bases interrogate the same state.',
    motivation: 'Phase and measurement basis power quantum interference and are where the misleading phrase “both 0 and 1” causes the most confusion.',
    focusQuestion: 'If Z-basis probabilities stay 50/50, what physical meaning can changing relative phase have?',
    keyInsight: 'Phase may leave probabilities in one basis unchanged while changing overlap with every other basis.',
    formulas: [
      { title: 'Bloch-sphere parameterization', expressionLatex: String.raw`|\psi\rangle=\cos\frac{\theta}{2}|0\rangle+e^{i\phi}\sin\frac{\theta}{2}|1\rangle`, explanation: 'θ controls basis-state weights and φ is a relative phase readable through interference.' },
      { title: 'Z-basis Born probabilities', expressionLatex: String.raw`P(0)=\cos^2\frac{\theta}{2},\qquad P(1)=\sin^2\frac{\theta}{2}`, explanation: 'A measurement probability is the squared magnitude of its amplitude.' },
    ],
    commonDifficulties: [
      { title: 'Superposition is not a hidden classical answer', misconception: 'Before measurement the qubit is already 0 or 1 and we simply do not know which.', resolution: 'One state must predict multiple incompatible bases; in general there is no preassigned set of classical answers.' },
      { title: 'Global and relative phase differ', misconception: 'Every complex phase changes experimental results.', resolution: 'Multiplying the whole state by e^{iγ} changes no probability; only relative phase between components is observable.' },
    ],
    steps: [
      { title: 'Change amplitude weights', instruction: 'Hold φ fixed and sweep θ from 0 to 180 degrees.', observation: 'P(0) falls from 1 to 0 while the Bloch vector follows a meridian.' },
      { title: 'Change phase only', instruction: 'Set θ=90 degrees and sweep φ.', observation: 'Z stays 50/50 while azimuth and other-basis probabilities change.' },
      { title: 'Rotate the measurement basis', instruction: 'Hold the state fixed and vary β.', observation: 'The same state gives different distributions in different bases.' },
    ],
    takeaway: 'Complete qubit information lives in both amplitude magnitudes and relative phase.',
  },
});
