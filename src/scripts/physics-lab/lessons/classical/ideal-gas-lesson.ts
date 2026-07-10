import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const idealGasLesson = definePhysicsLabLesson({
  zh: {
    title: '理想气体：宏观规律如何从碰撞涌现',
    background: '气体由大量持续碰撞的粒子组成。温度描述平均动能尺度，压强来自粒子向容器壁传递动量。',
    motivation: '它展示了不追踪每个粒子，也能从统计分布可靠预测宏观量。',
    focusQuestion: '随机碰撞为什么能产生稳定、可重复的压强和温度？',
    keyInsight: '单次碰撞不可预测，但大量独立事件的平均值会稳定下来。',
    formulas: [
      { title: '理想气体状态方程', expressionLatex: String.raw`PV=Nk_{\mathrm B}T`, explanation: '固定体积下，粒子数或温度增加都会提高压强。' },
      { title: '三维平均平动能', expressionLatex: String.raw`\langle K\rangle=\frac{3}{2}k_{\mathrm B}T`, explanation: '三个平动自由度各贡献 kBT/2。' },
    ],
    commonDifficulties: [
      { title: '温度不是每个粒子的速度', misconception: '同一温度下所有粒子速度相同。', resolution: '温度确定分布的能量尺度；个体速度仍覆盖很宽范围。' },
      { title: '压强不是粒子之间的排斥', misconception: '气体压强主要来自粒子互相推开。', resolution: '理想气体压强来自粒子碰壁时的动量通量。' },
    ],
    steps: [
      { title: '观察统计稳定', instruction: '选择“温热”，等待直方图稳定。', observation: '单个柱持续波动，整体分布却稳定。' },
      { title: '只改变温度', instruction: '固定粒子数并升温。', observation: '分布右移变宽，平均速率和压强上升。' },
      { title: '只改变粒子数', instruction: '固定温度并增加粒子。', observation: '平均速率近似不变，压强增加。' },
    ],
    takeaway: '热力学量是大量微观事件的稳定统计摘要。',
  },
  en: {
    title: 'Ideal gas: how macroscopic laws emerge from collisions',
    background: 'A gas contains many continually colliding particles. Temperature describes their mean energy scale, while pressure comes from momentum transferred to container walls.',
    motivation: 'It shows how statistical distributions predict macroscopic behavior without tracking every particle.',
    focusQuestion: 'Why do random collisions produce stable, repeatable pressure and temperature?',
    keyInsight: 'Individual collisions are unpredictable, but averages over many independent events become stable.',
    formulas: [
      { title: 'Ideal-gas equation', expressionLatex: String.raw`PV=Nk_{\mathrm B}T`, explanation: 'At fixed volume, increasing particle count or temperature raises pressure.' },
      { title: 'Mean translational energy in 3D', expressionLatex: String.raw`\langle K\rangle=\frac{3}{2}k_{\mathrm B}T`, explanation: 'Each of three translational degrees of freedom contributes kBT/2.' },
    ],
    commonDifficulties: [
      { title: 'Temperature is not one particle speed', misconception: 'All particles at one temperature move equally fast.', resolution: 'Temperature sets the energy scale of a broad speed distribution.' },
      { title: 'Pressure is not mutual repulsion', misconception: 'Gas pressure mainly comes from particles pushing each other apart.', resolution: 'Ideal-gas pressure is momentum flux from particles striking the walls.' },
    ],
    steps: [
      { title: 'Observe statistical stability', instruction: 'Choose Warm and let the histogram settle.', observation: 'Individual bins fluctuate while the overall distribution stabilizes.' },
      { title: 'Change only temperature', instruction: 'Hold count fixed and heat the gas.', observation: 'The distribution shifts and broadens while speed and pressure rise.' },
      { title: 'Change only particle count', instruction: 'Hold temperature fixed and add particles.', observation: 'Mean speed stays similar while pressure increases.' },
    ],
    takeaway: 'Thermodynamic variables are stable statistical summaries of many microscopic events.',
  },
});
