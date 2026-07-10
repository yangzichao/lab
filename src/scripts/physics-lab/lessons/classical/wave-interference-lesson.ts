import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const waveInterferenceLesson = definePhysicsLabLesson({
  zh: {
    title: '波的干涉：相位如何变成明暗条纹',
    background: '线性波在相遇时先叠加振幅。探测器记录振幅平方的时间平均，因此路径差会转换为强度差。',
    motivation: '干涉是测量微小距离、折射率和相位变化的精密工具，也是理解量子振幅的桥梁。',
    focusQuestion: '两个波源都在发波，为什么某些位置反而一直很暗？',
    keyInsight: '能量不是直接相加；先相加带符号的场振幅，再对结果平方。',
    formulas: [
      { title: '场与强度', expressionLatex: String.raw`u=u_1+u_2,\qquad I\propto\langle u^2\rangle_t`, explanation: '同相振幅增强，反相振幅抵消；强度始终非负。' },
      { title: '远场条纹间距', expressionLatex: String.raw`\Delta y\approx\frac{\lambda L}{d}`, explanation: '波长 λ 越大条纹越宽，波源间距 d 越大条纹越密。' },
    ],
    commonDifficulties: [
      { title: '相消不表示能量消失', misconception: '暗纹处能量被两个波互相消灭。', resolution: '干涉重新分配能量；暗区减少的能量出现在相邻亮区。' },
      { title: '需要稳定相位关系', misconception: '任意两个同频波源都会形成稳定条纹。', resolution: '只有相对相位在观测时间内稳定，时间平均后条纹才不会被洗掉。' },
    ],
    steps: [
      { title: '找到零路径差', instruction: '保持两源同相，把探针放在中垂线上。', observation: '路径差为零，中央区域持续增强。' },
      { title: '拉长波长', instruction: '逐步增大 λ。', observation: '波前与亮纹间距同时增大。' },
      { title: '拉开波源', instruction: '固定 λ，增大 d。', observation: '屏上的条纹变得更密。' },
    ],
    takeaway: '干涉图样是一张把路径差编码成亮度的相位地图。',
  },
  en: {
    title: 'Wave interference: how phase becomes fringes',
    background: 'Linear waves add amplitudes when they meet. A detector records the time average of the squared result, turning path difference into intensity contrast.',
    motivation: 'Interference measures tiny changes in distance, refractive index, and phase, and prepares the intuition needed for quantum amplitudes.',
    focusQuestion: 'If both sources emit waves, why do some locations remain dark?',
    keyInsight: 'Energies do not add first; signed field amplitudes add first, and the result is then squared.',
    formulas: [
      { title: 'Field and intensity', expressionLatex: String.raw`u=u_1+u_2,\qquad I\propto\langle u^2\rangle_t`, explanation: 'In-phase amplitudes reinforce and opposite amplitudes cancel, while intensity remains nonnegative.' },
      { title: 'Far-field fringe spacing', expressionLatex: String.raw`\Delta y\approx\frac{\lambda L}{d}`, explanation: 'Larger wavelength λ spreads fringes; larger source separation d compresses them.' },
    ],
    commonDifficulties: [
      { title: 'Cancellation does not destroy energy', misconception: 'The two waves erase energy at a dark fringe.', resolution: 'Interference redistributes energy; what is missing from dark regions appears in neighboring bright regions.' },
      { title: 'Stable phase is required', misconception: 'Any two equal-frequency sources make a stable pattern.', resolution: 'Relative phase must remain stable during observation or time averaging washes the pattern out.' },
    ],
    steps: [
      { title: 'Find zero path difference', instruction: 'Keep the sources in phase and place the probe on their bisector.', observation: 'Path difference is zero and the central region reinforces.' },
      { title: 'Lengthen the wavelength', instruction: 'Increase λ gradually.', observation: 'Wavefront and bright-fringe spacing both grow.' },
      { title: 'Separate the sources', instruction: 'Hold λ fixed and increase d.', observation: 'The screen fringes become denser.' },
    ],
    takeaway: 'An interference pattern is a phase map that encodes path difference as brightness.',
  },
});
