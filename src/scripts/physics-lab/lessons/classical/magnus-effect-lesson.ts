import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const magnusEffectLesson = definePhysicsLabLesson({
  zh: {
    title: '马格努斯效应：旋转怎样改写球路',
    background: '飞行中的球同时受到重力、空气阻力和与速度垂直的气动力。旋转拖动边界层，使球两侧的相对流速与分离位置不再对称。',
    motivation: '足球弧线球、网球上旋、棒球曲球和高尔夫后旋都依赖同一个机制：运动员通过旋转控制力的方向，而不只控制出球方向。',
    focusQuestion: '为什么上旋让球提前下坠，而下旋能延长滞空时间？',
    keyInsight: '先用右手规则确定旋转轴，再看相对气流；Magnus 力同时垂直于速度与旋转轴，改变轨迹方向而不是简单“推着旋转方向走”。',
    formulas: [
      { title: 'Magnus 升力', expressionLatex: String.raw`F_M=\frac12\rho v^2 A C_L`, explanation: '动态压强、迎风面积和升力系数共同决定气动力大小。' },
      { title: '旋转比', expressionLatex: String.raw`S=\frac{\omega R}{v}`, explanation: '表面切向速度相对平动速度越大，流动不对称通常越明显；本实验用 C_L(S) 的经验近似。' },
    ],
    commonDifficulties: [
      { title: '不是伯努利一句话就结束', misconception: '球一侧转得快，所以那一侧空气必然更快，压强必然更低。', resolution: '真实关键还包括黏性边界层和分离点偏移；压强分布是整个绕流场的结果，伯努利关系只能沿合适流线使用。' },
      { title: '旋转方向不等于受力方向', misconception: '球向哪个方向旋转，就会向哪个方向移动。', resolution: '力方向由旋转轴与来流的叉积决定，并始终近似垂直于瞬时速度。' },
    ],
    steps: [
      { title: '建立无旋基线', instruction: '选择“无旋转”，记录落点和滞空时间。', observation: '轨迹只由重力和阻力决定，灰色参考线与主轨迹重合。' },
      { title: '比较同速上旋与下旋', instruction: '分别选择“上旋下坠”和“下旋上浮”。', observation: '转速只变号，Magnus 力方向就反转，落点和最高点明显分开。' },
      { title: '改变球尺寸', instruction: '保持转速和初速度，逐渐增大直径。', observation: '面积和半径同时增加，旋转比与气动力都改变；同 rpm 不代表同样的弯曲能力。' },
    ],
    takeaway: '判断旋转球路时，按“相对气流 → 旋转轴 → Magnus 力 → 与重力合成”的顺序思考。',
  },
  en: {
    title: 'Magnus effect: how spin rewrites a ball trajectory',
    background: 'A flying ball experiences gravity, drag, and an aerodynamic force transverse to its velocity. Spin drags the boundary layer, breaking the symmetry of surface flow and separation.',
    motivation: 'Soccer curl, tennis topspin, baseball breaking balls, and golf backspin all use the same control channel: athletes steer force through spin, not only through launch direction.',
    focusQuestion: 'Why does topspin make a ball dip early while backspin extends its flight?',
    keyInsight: 'Identify the spin axis with the right-hand rule, then inspect relative flow. Magnus force is transverse to both velocity and spin axis; it does not simply point where the surface rotates.',
    formulas: [
      { title: 'Magnus lift', expressionLatex: String.raw`F_M=\frac12\rho v^2 A C_L`, explanation: 'Dynamic pressure, frontal area, and lift coefficient set the aerodynamic-force scale.' },
      { title: 'Spin ratio', expressionLatex: String.raw`S=\frac{\omega R}{v}`, explanation: 'Larger surface speed relative to translation generally strengthens flow asymmetry; this lab uses an empirical approximation for C_L(S).' },
    ],
    commonDifficulties: [
      { title: 'Bernoulli alone is incomplete', misconception: 'The rotating side must move air faster, so its pressure is automatically lower.', resolution: 'Viscous boundary layers and shifted separation points matter. Pressure follows the complete flow field, and Bernoulli applies only along appropriate streamlines.' },
      { title: 'Spin direction is not force direction', misconception: 'The ball travels toward whichever way its surface rotates.', resolution: 'Force direction follows the cross product of spin axis and incoming flow, approximately perpendicular to instantaneous velocity.' },
    ],
    steps: [
      { title: 'Establish a no-spin baseline', instruction: 'Select No spin and record landing point and flight time.', observation: 'Gravity and drag alone set the path, so the gray reference overlaps the main trajectory.' },
      { title: 'Compare equal topspin and backspin', instruction: 'Switch between Topspin dip and Backspin lift.', observation: 'Changing only the spin sign reverses Magnus force and separates the apex and landing point.' },
      { title: 'Change ball size', instruction: 'Hold rpm and launch speed fixed while increasing diameter.', observation: 'Area and radius both grow, changing spin ratio and force; equal rpm does not imply equal curvature.' },
    ],
    takeaway: 'Reason in the order relative flow, spin axis, Magnus force, then vector addition with gravity.',
  },
});
