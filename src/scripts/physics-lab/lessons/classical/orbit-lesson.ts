import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const orbitLesson = definePhysicsLabLesson({
  zh: {
    title: '轨道：用能量读懂圆锥曲线',
    background: '平方反比引力始终指向中心天体。初始位置和速度把连续受力转化为圆、椭圆、抛物线或双曲线轨道。',
    motivation: '同一套判断方法可用于卫星变轨、行星轨道和航天器逃逸，不必先求出完整轨迹。',
    focusQuestion: '只看当前位置和速度，如何判断天体会返回还是逃逸？',
    keyInsight: '比能量决定是否束缚，角动量决定轨道的形状和近日点。',
    formulas: [
      { title: '中心引力', expressionLatex: String.raw`\ddot{\mathbf r}=-\frac{GM}{r^3}\mathbf r`, explanation: '加速度方向永远指向中心，大小按 1/r² 衰减。' },
      { title: '比机械能', expressionLatex: String.raw`\varepsilon=\frac{v^2}{2}-\frac{GM}{r}`, explanation: 'ε<0 为束缚椭圆，ε=0 是抛物线边界，ε>0 为双曲线逃逸。' },
    ],
    commonDifficulties: [
      { title: '有引力也可以逃逸', misconception: '只要引力一直存在，天体最终一定会回来。', resolution: '引力随距离减弱；若总能量为正，天体可在速度逐渐降低时仍逃到无穷远。' },
      { title: '圆轨道不是没有加速度', misconception: '速率不变意味着加速度为零。', resolution: '速度方向持续改变，因此存在始终指向中心的向心加速度。' },
    ],
    steps: [
      { title: '识别圆轨道条件', instruction: '选择“圆轨道”，比较速度与引力箭头。', observation: '两者近似垂直，半径稳定。' },
      { title: '改变能量', instruction: '保持发射半径，逐步提高发射速度。', observation: '轨道从椭圆变长并接近逃逸边界。' },
      { title: '跨过逃逸阈值', instruction: '选择“逃逸”并查看能量分类。', observation: '比能量转正，预测曲线不再闭合。' },
    ],
    takeaway: '判断轨道先看能量符号，再用角动量理解形状。',
  },
  en: {
    title: 'Orbits: read conic sections through energy',
    background: 'Inverse-square gravity always points toward the central body. Initial position and velocity turn that force into circles, ellipses, parabolas, or hyperbolas.',
    motivation: 'The same reasoning predicts satellite maneuvers, planetary orbits, and escape without first solving the full trajectory.',
    focusQuestion: 'From position and velocity alone, how can we tell whether a body returns or escapes?',
    keyInsight: 'Specific energy decides whether the orbit is bound; angular momentum sets its shape and periapsis.',
    formulas: [
      { title: 'Central gravity', expressionLatex: String.raw`\ddot{\mathbf r}=-\frac{GM}{r^3}\mathbf r`, explanation: 'Acceleration always points inward and its magnitude falls as 1/r².' },
      { title: 'Specific mechanical energy', expressionLatex: String.raw`\varepsilon=\frac{v^2}{2}-\frac{GM}{r}`, explanation: 'ε<0 is a bound ellipse, ε=0 is the parabolic boundary, and ε>0 escapes hyperbolically.' },
    ],
    commonDifficulties: [
      { title: 'Gravity does not guarantee return', misconception: 'A body must return because gravity never disappears.', resolution: 'Gravity weakens with distance. Positive total energy allows escape even while speed decreases.' },
      { title: 'Circular motion still accelerates', misconception: 'Constant speed means zero acceleration.', resolution: 'Velocity direction changes continuously, requiring inward centripetal acceleration.' },
    ],
    steps: [
      { title: 'Identify a circular orbit', instruction: 'Choose Circular and compare velocity with gravity.', observation: 'The arrows are nearly perpendicular and radius stays stable.' },
      { title: 'Change the energy', instruction: 'Hold launch radius fixed and increase speed.', observation: 'The ellipse lengthens toward the escape boundary.' },
      { title: 'Cross the escape threshold', instruction: 'Choose Escape and inspect the classification.', observation: 'Specific energy becomes positive and the predicted curve opens.' },
    ],
    takeaway: 'Check the sign of energy first, then use angular momentum to understand shape.',
  },
});
