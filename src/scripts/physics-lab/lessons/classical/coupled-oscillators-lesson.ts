import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const coupledOscillatorsLesson = definePhysicsLabLesson({
  zh: {
    title: '耦合振子：在复杂运动中找到简正模',
    background: '弹簧把相邻质量的位移联系起来。某些特殊集体形状会保持不变，只以一个频率整体振荡。',
    motivation: '分子振动、晶格声子、建筑振动和量子场都依赖同一思想：把耦合自由度变成独立模式。',
    focusQuestion: '为什么 N 个互相影响的小球，仍能被拆成 N 个互不干扰的纯运动？',
    keyInsight: '选择正确的集体坐标后，耦合系统会变成一组独立简谐振子。',
    formulas: [
      { title: '离散弹簧链', expressionLatex: String.raw`m\ddot{x}_j=k(x_{j+1}-2x_j+x_{j-1})`, explanation: '第 j 个质量受到左右弹簧恢复力之和。' },
      { title: '固定端简正频率', expressionLatex: String.raw`\omega_p=2\sqrt{\frac{k}{m}}\sin\!\left(\frac{p\pi}{2(N+1)}\right)`, explanation: '每个模式 p 有独立频率和固定节点结构。' },
    ],
    commonDifficulties: [
      { title: '模式不是某一颗球', misconception: '模式 2 表示第二颗球的运动。', resolution: '一个模式是所有质量共同参与的位移形状。' },
      { title: '拍频不是新频率', misconception: '振幅慢慢起伏说明系统产生了额外低频模式。', resolution: '拍频是两个接近频率叠加后的包络，不是新的固有频率。' },
    ],
    steps: [
      { title: '识别最低模', instruction: '选择模式 1 并显示包络。', observation: '所有质量大体同向运动。' },
      { title: '数节点', instruction: '比较模式 2 和模式 3。', observation: '模式编号越高，内部节点越多、频率越高。' },
      { title: '叠加两个模式', instruction: '选择“拍频”。', observation: '快速振荡外出现缓慢强弱包络。' },
    ],
    takeaway: '简正模是让耦合问题变简单的坐标系。',
  },
  en: {
    title: 'Coupled oscillators: find normal modes inside complex motion',
    background: 'Springs connect neighboring displacements. Certain collective shapes retain their form and oscillate at one frequency.',
    motivation: 'Molecular vibration, phonons, structural motion, and quantum fields all use the same move: replace coupled coordinates with independent modes.',
    focusQuestion: 'Why can N interacting masses still be decomposed into N independent pure motions?',
    keyInsight: 'In the right collective coordinates, a coupled system becomes a set of independent harmonic oscillators.',
    formulas: [
      { title: 'Discrete spring chain', expressionLatex: String.raw`m\ddot{x}_j=k(x_{j+1}-2x_j+x_{j-1})`, explanation: 'Mass j feels the sum of restoring forces from its two neighbors.' },
      { title: 'Fixed-end normal frequencies', expressionLatex: String.raw`\omega_p=2\sqrt{\frac{k}{m}}\sin\!\left(\frac{p\pi}{2(N+1)}\right)`, explanation: 'Each mode p has its own frequency and fixed node pattern.' },
    ],
    commonDifficulties: [
      { title: 'A mode is not one mass', misconception: 'Mode 2 means the motion of the second mass.', resolution: 'One mode is a displacement pattern involving every mass.' },
      { title: 'Beats are not a new eigenfrequency', misconception: 'A slow amplitude pulse means a new low-frequency mode appeared.', resolution: 'The beat is an envelope created by adding two nearby frequencies.' },
    ],
    steps: [
      { title: 'Identify the lowest mode', instruction: 'Choose Mode 1 and show the envelope.', observation: 'All masses move broadly in the same direction.' },
      { title: 'Count nodes', instruction: 'Compare Mode 2 with Mode 3.', observation: 'Higher mode number adds internal nodes and raises frequency.' },
      { title: 'Superpose two modes', instruction: 'Choose Beats.', observation: 'A slow amplitude envelope surrounds fast oscillation.' },
    ],
    takeaway: 'Normal modes are the coordinate system that makes coupling simple.',
  },
});
