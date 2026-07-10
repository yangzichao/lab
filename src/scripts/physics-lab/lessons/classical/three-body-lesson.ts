import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const threeBodyLesson = definePhysicsLabLesson({
  zh: {
    title: '三体问题：简单定律为何没有简单轨道',
    background: '三个天体都同时改变另外两个天体的运动。两体问题可化为一个相对坐标，三体系统一般无法这样完全解耦。',
    motivation: '它解释了太阳系长期稳定性、恒星系统和航天任务为何依赖数值积分而不是一条闭式公式。',
    focusQuestion: 'Newton 引力公式很简单，为什么三体轨道通常写不成一个通用解析解？',
    keyInsight: '困难不在单次受力，而在每个天体不断改变其他天体未来受力的位置。',
    formulas: [
      { title: '多体加速度', expressionLatex: String.raw`\ddot{\mathbf r}_i=G\sum_{j\ne i}m_j\frac{\mathbf r_j-\mathbf r_i}{|\mathbf r_j-\mathbf r_i|^3}`, explanation: '每一步都要用所有天体的新位置重新计算两两引力。' },
      { title: '总动量守恒', expressionLatex: String.raw`\mathbf P=\sum_i m_i\mathbf v_i=\text{constant}`, explanation: '内部引力成对抵消，因此孤立系统质心应保持匀速。' },
    ],
    commonDifficulties: [
      { title: '无通用闭式解不等于无法计算', misconception: '既然没有公式，就不能预测三体运动。', resolution: '数值积分能在有限时间内高精度预测；缺少的是适用于任意初态的简单表达式。' },
      { title: '混沌不破坏守恒律', misconception: '轨迹不规则说明能量或动量不守恒。', resolution: '混沌轨迹仍受守恒量约束；守恒并不保证周期性。' },
    ],
    steps: [
      { title: '观察特殊周期解', instruction: '选择 8 字轨道并打开轨迹。', observation: '三个等质量天体依次走过同一闭合曲线。' },
      { title: '加入微扰', instruction: '从很小的 perturbation 逐步提高。', observation: '短期相似，长期接近顺序和轨迹完全分离。' },
      { title: '检查整体约束', instruction: '显示质心并观察能量、动量。', observation: '轨迹复杂，但整体守恒量近似稳定。' },
    ],
    takeaway: '局部定律简单，不代表多体反馈后的全局轨迹也简单。',
  },
  en: {
    title: 'Three bodies: why simple laws do not produce simple orbits',
    background: 'Each of three bodies continuously changes the motion of the other two. The two-body problem reduces to one relative coordinate; a general three-body system does not fully decouple.',
    motivation: 'It explains why long-term solar-system stability, stellar systems, and space missions rely on numerical integration rather than one closed formula.',
    focusQuestion: 'Newtonian gravity is simple, so why is there no general analytic formula for three-body paths?',
    keyInsight: 'The hard part is feedback: every body continually changes where the others will feel future forces.',
    formulas: [
      { title: 'Many-body acceleration', expressionLatex: String.raw`\ddot{\mathbf r}_i=G\sum_{j\ne i}m_j\frac{\mathbf r_j-\mathbf r_i}{|\mathbf r_j-\mathbf r_i|^3}`, explanation: 'Every step recomputes all pairwise forces using the new positions.' },
      { title: 'Conserved total momentum', expressionLatex: String.raw`\mathbf P=\sum_i m_i\mathbf v_i=\text{constant}`, explanation: 'Internal gravity cancels in pairs, so an isolated center of mass moves uniformly.' },
    ],
    commonDifficulties: [
      { title: 'No general closed form does not mean uncomputable', misconception: 'Without a formula, three-body motion cannot be predicted.', resolution: 'Numerical integration predicts finite intervals accurately; what is missing is one simple expression for arbitrary initial states.' },
      { title: 'Chaos does not break conservation', misconception: 'Irregular paths imply energy or momentum is not conserved.', resolution: 'Chaotic paths remain constrained by invariants; conservation does not imply periodicity.' },
    ],
    steps: [
      { title: 'Observe a special periodic solution', instruction: 'Choose Figure-eight and enable trails.', observation: 'Three equal masses follow one closed curve in sequence.' },
      { title: 'Add a perturbation', instruction: 'Increase perturbation from a very small value.', observation: 'Paths agree briefly, then encounter order and shape separate.' },
      { title: 'Check global constraints', instruction: 'Show the center of mass and inspect energy and momentum.', observation: 'Motion is complex while global invariants stay nearly stable.' },
    ],
    takeaway: 'Simple local laws do not guarantee simple global behavior after many-body feedback.',
  },
});
