import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const doublePendulumLesson = definePhysicsLabLesson({
  zh: {
    title: '双摆：从确定性运动到混沌',
    background: '单摆近似是一个频率稳定的振子；再接上一根摆杆后，两个角度通过重力和惯性非线性耦合。',
    motivation: '双摆是理解天气、轨道和复杂系统为何“方程明确却难以长期预测”的最小模型。',
    focusQuestion: '为什么两套几乎相同的双摆，最后会走向完全不同的轨迹？',
    keyInsight: '混沌不是随机，而是微小初始误差被非线性动力学指数放大。',
    formulas: [
      { title: '无阻尼时的能量约束', expressionLatex: String.raw`E=T+U\approx\text{constant}`, explanation: '动能与势能持续交换；总能量明显漂移通常来自阻尼或数值积分误差。' },
      { title: '邻近轨迹的分离', expressionLatex: String.raw`\delta(t)\approx\delta_0e^{\lambda_{\mathrm L}t}`, explanation: '正的 Lyapunov 指数 λL 表示初始差异会指数增长，并给出系统的可预测时间尺度。' },
    ],
    commonDifficulties: [
      { title: '混沌不等于随机', misconception: '轨迹看起来无规则，所以系统没有确定方程。', resolution: '每一时刻都由同一组方程决定；不确定性来自初态测量永远只有有限精度。' },
      { title: '能量守恒不保证周期运动', misconception: '只要总能量不变，轨迹就应重复。', resolution: '守恒量只限制状态所在区域，并不要求系统沿同一条闭合曲线返回。' },
    ],
    steps: [
      { title: '建立可预测基准', instruction: '选择“轻摆”，把阻尼降到零并重置。', observation: '总能量稳定，运动接近周期性。' },
      { title: '进入强非线性区', instruction: '切换到“混沌”，保留末端轨迹。', observation: '翻转与不重复轨迹开始出现。' },
      { title: '测量敏感依赖', instruction: '开启偏差仅 0.001° 的混沌孪生。', observation: '两套摆先重合，随后快速分离。' },
    ],
    takeaway: '方程的确定性与长期预测能力是两件不同的事。',
  },
  en: {
    title: 'Double pendulum: from deterministic motion to chaos',
    background: 'A simple pendulum is approximately a stable oscillator. Adding a second rod couples two angles nonlinearly through gravity and inertia.',
    motivation: 'It is the smallest useful model for seeing why weather, orbits, and complex systems can obey exact equations yet resist long-term prediction.',
    focusQuestion: 'Why do two nearly identical double pendulums eventually follow completely different paths?',
    keyInsight: 'Chaos is not randomness; nonlinear dynamics exponentially amplify tiny initial errors.',
    formulas: [
      { title: 'Energy constraint without damping', expressionLatex: String.raw`E=T+U\approx\text{constant}`, explanation: 'Kinetic and potential energy exchange continuously. Significant drift usually reveals damping or integration error.' },
      { title: 'Separation of nearby paths', expressionLatex: String.raw`\delta(t)\approx\delta_0e^{\lambda_{\mathrm L}t}`, explanation: 'A positive Lyapunov exponent makes initial differences grow exponentially and sets a prediction horizon.' },
    ],
    commonDifficulties: [
      { title: 'Chaos is not randomness', misconception: 'An irregular path means no deterministic equation exists.', resolution: 'The same equations govern every instant; uncertainty enters because initial conditions have finite precision.' },
      { title: 'Conserved energy does not imply periodicity', misconception: 'If total energy is fixed, the trajectory must repeat.', resolution: 'A conserved quantity restricts the accessible state space but does not force a closed path.' },
    ],
    steps: [
      { title: 'Build a predictable baseline', instruction: 'Choose Gentle, reduce damping to zero, and reset.', observation: 'Energy stays stable and motion is nearly periodic.' },
      { title: 'Enter the nonlinear regime', instruction: 'Switch to Chaotic and keep the tip trail visible.', observation: 'Flips and nonrepeating paths appear.' },
      { title: 'Measure sensitive dependence', instruction: 'Enable the twin offset by only 0.001 degrees.', observation: 'The systems overlap at first and then separate rapidly.' },
    ],
    takeaway: 'Deterministic equations and long-term predictability are different properties.',
  },
});
