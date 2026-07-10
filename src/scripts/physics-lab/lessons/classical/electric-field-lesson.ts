import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const electricFieldLesson = definePhysicsLabLesson({
  zh: {
    title: '电场：从电势地形到受力方向',
    background: '电势是每个位置上单位电荷具有的势能。多个点电荷的电势可直接相加，再由空间变化得到电场。',
    motivation: '先求标量电势通常比直接叠加矢量场更简单，并能立刻解释等势线、屏蔽和电压。',
    focusQuestion: '为什么场线总与等势线垂直，而且颜色变化越快的地方场越强？',
    keyInsight: '把电势看成地形，电场就是指向最陡下降方向的负梯度。',
    formulas: [
      { title: '点电荷电势叠加', expressionLatex: String.raw`V(\mathbf r)=\frac{1}{4\pi\varepsilon_0}\sum_i\frac{q_i}{|\mathbf r-\mathbf r_i|}`, explanation: '正电荷抬高电势，负电荷降低电势，标量贡献直接求和。' },
      { title: '由电势得到电场', expressionLatex: String.raw`\mathbf E=-\nabla V`, explanation: '梯度给出最陡上升，负号让电场指向电势下降方向。' },
    ],
    commonDifficulties: [
      { title: '电势为零不等于电场为零', misconception: '某点 V=0，所以测试电荷不受力。', resolution: '电势值取决于参考零点；受力取决于附近电势变化，即梯度。' },
      { title: '场线不是粒子轨迹', misconception: '释放电荷后，它一定沿一条场线运动。', resolution: '场线只给出瞬时受力方向；惯性会让真实速度不必始终与场平行。' },
    ],
    steps: [
      { title: '读取偶极子', instruction: '选择“偶极子”，同时显示场线与等势线。', observation: '两组线近似正交，场线由正指向负。' },
      { title: '比较中点', instruction: '切换到同号电荷对并观察中心。', observation: '电势相加，但对称位置的电场可相消。' },
      { title: '改变几何', instruction: '拖动一个电荷。', observation: '电势面、等势线和场线同步重构。' },
    ],
    takeaway: '先理解电势的空间形状，就能用梯度读出电场。',
  },
  en: {
    title: 'Electric fields: from potential terrain to force',
    background: 'Electric potential is potential energy per unit charge at each position. Point-charge potentials add directly, and their spatial variation gives the field.',
    motivation: 'Solving for a scalar potential is often easier than summing vector fields and immediately explains voltage, equipotentials, and shielding.',
    focusQuestion: 'Why are field lines perpendicular to equipotentials, and why is the field stronger where color changes faster?',
    keyInsight: 'Treat potential as terrain: the electric field is its steepest downhill direction, the negative gradient.',
    formulas: [
      { title: 'Superposed point-charge potential', expressionLatex: String.raw`V(\mathbf r)=\frac{1}{4\pi\varepsilon_0}\sum_i\frac{q_i}{|\mathbf r-\mathbf r_i|}`, explanation: 'Positive charges raise potential, negative charges lower it, and scalar contributions add.' },
      { title: 'Field from potential', expressionLatex: String.raw`\mathbf E=-\nabla V`, explanation: 'The gradient points uphill; the minus sign makes the field point toward decreasing potential.' },
    ],
    commonDifficulties: [
      { title: 'Zero potential does not mean zero field', misconception: 'A test charge feels no force wherever V=0.', resolution: 'Potential depends on the chosen reference; force depends on nearby change, the gradient.' },
      { title: 'Field lines are not particle paths', misconception: 'A released charge must trace one field line.', resolution: 'Field lines give instantaneous force direction; inertia means velocity need not stay parallel to the field.' },
    ],
    steps: [
      { title: 'Read a dipole', instruction: 'Choose Dipole and show field lines with equipotentials.', observation: 'The line families are nearly orthogonal and field lines run positive to negative.' },
      { title: 'Compare the midpoint', instruction: 'Switch to Like charges and inspect the center.', observation: 'Potential adds while symmetric field vectors can cancel.' },
      { title: 'Change the geometry', instruction: 'Drag one charge.', observation: 'Potential surface, contours, and field lines rebuild together.' },
    ],
    takeaway: 'Understand the shape of potential first, then read the field from its gradient.',
  },
});
