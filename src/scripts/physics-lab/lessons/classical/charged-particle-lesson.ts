import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const chargedParticleLesson = definePhysicsLabLesson({
  zh: {
    title: '带电粒子：电场改变能量，磁场改变方向',
    background: '带电粒子同时响应电场和磁场。电场力沿 E，磁场力由速度与 B 的叉积决定。',
    motivation: '质谱仪、回旋加速器、等离子体约束和霍尔效应都建立在同一 Lorentz 力上。',
    focusQuestion: '为什么纯磁场能把路径弯成圆，却不能让粒子越跑越快？',
    keyInsight: '磁力始终垂直于速度，所以不做功；电场才直接改变动能。',
    formulas: [
      { title: 'Lorentz 力', expressionLatex: String.raw`\mathbf F=q(\mathbf E+\mathbf v\times\mathbf B)`, explanation: '叉积同时决定磁力大小与方向，电荷符号会反转总受力。' },
      { title: '回旋与漂移尺度', expressionLatex: String.raw`r_c=\frac{mv_\perp}{|q|B},\qquad\mathbf v_D=\frac{\mathbf E\times\mathbf B}{B^2}`, explanation: '质量和垂直速度增大使轨道变大；E×B 漂移与质量、电荷符号无关。' },
    ],
    commonDifficulties: [
      { title: '磁场不提高速率', misconception: '只要粒子持续受力，速率就一定增加。', resolution: '垂直力只旋转速度向量；功率 q(v×B)·v 恒为零。' },
      { title: '负电荷要反转右手定则结果', misconception: 'v×B 直接就是所有粒子的受力方向。', resolution: 'v×B 给出正电荷方向；q<0 时方向完全反转。' },
    ],
    steps: [
      { title: '建立纯回旋', instruction: '选择“回旋”并把 E 设为零。', observation: '速率稳定，路径弯曲成圆。' },
      { title: '反转符号', instruction: '只反转 q 或 Bz。', observation: '回旋方向反转，半径近似不变。' },
      { title: '加入正交电场', instruction: '选择 E×B 漂移并改变 E/B。', observation: '圆周中心出现稳定横向平移。' },
    ],
    takeaway: '判断带电粒子运动时，先区分改变能量的力和只改变方向的力。',
  },
  en: {
    title: 'Charged particles: electric fields change energy, magnetic fields turn motion',
    background: 'A charged particle responds to electric and magnetic fields. Electric force follows E, while magnetic force comes from the cross product of velocity and B.',
    motivation: 'Mass spectrometers, cyclotrons, plasma confinement, and the Hall effect all use the same Lorentz force.',
    focusQuestion: 'Why can a pure magnetic field bend a path into a circle without making the particle faster?',
    keyInsight: 'Magnetic force stays perpendicular to velocity and does no work; the electric field directly changes kinetic energy.',
    formulas: [
      { title: 'Lorentz force', expressionLatex: String.raw`\mathbf F=q(\mathbf E+\mathbf v\times\mathbf B)`, explanation: 'The cross product sets magnetic magnitude and direction; charge sign reverses the total force.' },
      { title: 'Gyration and drift scales', expressionLatex: String.raw`r_c=\frac{mv_\perp}{|q|B},\qquad\mathbf v_D=\frac{\mathbf E\times\mathbf B}{B^2}`, explanation: 'Mass and perpendicular speed enlarge the orbit; E×B drift is independent of mass and charge sign.' },
    ],
    commonDifficulties: [
      { title: 'A magnetic field does not increase speed', misconception: 'Any sustained force must make the particle faster.', resolution: 'A perpendicular force rotates velocity; power q(v×B)·v is always zero.' },
      { title: 'Negative charge reverses the right-hand result', misconception: 'v×B is the force direction for every particle.', resolution: 'v×B gives the direction for positive charge; q<0 reverses it.' },
    ],
    steps: [
      { title: 'Establish pure gyration', instruction: 'Choose Cyclotron and set E to zero.', observation: 'Speed stays fixed while the path becomes circular.' },
      { title: 'Reverse one sign', instruction: 'Reverse only q or Bz.', observation: 'Rotation reverses while radius stays similar.' },
      { title: 'Add a perpendicular electric field', instruction: 'Choose E x B drift and vary E/B.', observation: 'The orbit center develops steady sideways motion.' },
    ],
    takeaway: 'First separate forces that change energy from forces that only change direction.',
  },
});
