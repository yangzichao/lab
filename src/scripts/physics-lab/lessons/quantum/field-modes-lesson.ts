import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const fieldModesLesson = definePhysicsLabLesson({
  zh: {
    title: '量子场模式：粒子是场的离散激发',
    background: '边界条件只允许某些驻波形状。量子化后，每个允许模式都像一个能量只能按固定份额变化的谐振子。',
    motivation: '这一步把“粒子是什么”连接到腔体光子、声子和量子场论：粒子数就是模式占据数。',
    focusQuestion: '真空中没有粒子，为什么模式能量仍不为零？',
    keyInsight: '边界决定有哪些模式，量子化决定每个模式只能按 ℏω 增减能量。',
    formulas: [
      { title: '固定边界驻波', expressionLatex: String.raw`u_k(x)=A\sin\!\left(\frac{k\pi x}{L}\right),\qquad\omega_k=\frac{k\pi c}{L}`, explanation: '整数 k 决定节点数、波长和模式频率。' },
      { title: '量子化模式能量', expressionLatex: String.raw`E_{n,k}=\hbar\omega_k\left(n+\frac12\right)`, explanation: '占据数每增加 1 就增加 ℏωk，并保留不可去掉的零点能。' },
    ],
    commonDifficulties: [
      { title: '模式编号不是粒子编号', misconception: 'k=3 表示场中有三个粒子。', resolution: 'k 标记空间形状；粒子数由独立的占据数 n 表示。' },
      { title: '真空不是经典意义的完全静止', misconception: 'n=0 时场振幅和能量都必须严格为零。', resolution: '量子谐振子基态仍有 ℏω/2 的零点涨落。' },
    ],
    steps: [
      { title: '改变空间模式', instruction: '固定 n=1，把 k 从 1 提高到 6。', observation: '节点增加、波长缩短、频率提高。' },
      { title: '进入真空态', instruction: '把 n 调到 0。', observation: '没有可计数激发，但仍保留零点尺度。' },
      { title: '增加占据数', instruction: '固定 k 并提高 n。', observation: '节点位置不变，能量按固定份额增加。' },
    ],
    takeaway: '模式回答“场能怎样振动”，占据数回答“这个模式里有多少量子”。',
  },
  en: {
    title: 'Quantum field modes: particles are discrete field excitations',
    background: 'Boundary conditions allow only certain standing-wave shapes. After quantization, each allowed mode behaves like an oscillator whose energy changes in fixed units.',
    motivation: 'This connects the question “what is a particle?” to cavity photons, phonons, and quantum field theory: particle number is mode occupation.',
    focusQuestion: 'If the vacuum contains no particles, why does a mode still have nonzero energy?',
    keyInsight: 'Boundaries choose which modes exist; quantization lets each mode gain or lose energy only in units of ℏω.',
    formulas: [
      { title: 'Fixed-boundary standing waves', expressionLatex: String.raw`u_k(x)=A\sin\!\left(\frac{k\pi x}{L}\right),\qquad\omega_k=\frac{k\pi c}{L}`, explanation: 'Integer k determines node count, wavelength, and mode frequency.' },
      { title: 'Quantized mode energy', expressionLatex: String.raw`E_{n,k}=\hbar\omega_k\left(n+\frac12\right)`, explanation: 'Each increase of occupation adds ℏωk, while unavoidable zero-point energy remains.' },
    ],
    commonDifficulties: [
      { title: 'Mode number is not particle number', misconception: 'k=3 means there are three particles in the field.', resolution: 'k labels spatial shape; the independent occupation number n counts excitations.' },
      { title: 'Vacuum is not classically motionless', misconception: 'At n=0 both field amplitude and energy must be exactly zero.', resolution: 'The quantum oscillator ground state retains zero-point fluctuation energy ℏω/2.' },
    ],
    steps: [
      { title: 'Change spatial mode', instruction: 'Hold n=1 and raise k from 1 to 6.', observation: 'Nodes increase, wavelength shortens, and frequency rises.' },
      { title: 'Enter the vacuum state', instruction: 'Set n to 0.', observation: 'No countable excitation remains, but a zero-point scale persists.' },
      { title: 'Increase occupation', instruction: 'Hold k fixed and raise n.', observation: 'Node positions stay fixed while energy grows in equal units.' },
    ],
    takeaway: 'Mode answers how the field can vibrate; occupation answers how many quanta excite that mode.',
  },
});
