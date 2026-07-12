import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const laserCavityLesson = definePhysicsLabLesson({
  zh: {
    title: '激光谐振腔：选模与阈值是两件事',
    background: '激光器由增益介质和光学反馈共同工作。两面镜子让光多次通过增益介质，同时只让往返后相位自洽的频率持续叠加。',
    motivation: '普通受激辐射只说明“同频同相复制光子”的可能性；真正得到窄线宽、定向、稳定的激光，还需要谐振腔选模和泵浦超过阈值。',
    focusQuestion: '为什么腔长满足整数半波条件仍可能没有激光，而泵浦很强也可能因失谐无法建立腔内场？',
    keyInsight: '相位条件回答“哪一个模式能回来同相相加”，阈值条件回答“每次往返后这个模式是增长还是衰减”。两者必须同时满足。',
    formulas: [
      { title: '纵模条件', expressionLatex: String.raw`2L=m\lambda,\qquad \nu_m=\frac{mc}{2L}`, explanation: '镜间往返必须积累整数个 2π 相位，允许频率间隔为自由光谱范围 c/(2L)。' },
      { title: '往返阈值', expressionLatex: String.raw`e^{2gL}R_1R_2\ge 1`, explanation: '增益补偿两面镜和腔内损耗后，光场才不会逐次衰减；饱和最终限制稳定功率。' },
    ],
    commonDifficulties: [
      { title: '共振不等于激光振荡', misconception: '只要 2L=mλ，腔中一定出现强激光。', resolution: '无足够反转粒子数时，腔只是一只被动 Fabry–Pérot 滤波器，场仍会衰减。' },
      { title: '驻波不是静止不动的光', misconception: '驻波图形不平移，所以能量没有传播。', resolution: '驻波由相反方向的行波叠加；输出耦合镜仍让一部分能量形成向外传播的激光束。' },
    ],
    steps: [
      { title: '隔离阈值条件', instruction: '选择“精确共振”，把泵浦慢慢从 1 以下升到 1 以上。', observation: '纵模位置不变，但腔内功率只在越过阈值后明显建立。' },
      { title: '隔离相位条件', instruction: '保持泵浦高于阈值，连续微调腔长。', observation: '离开整数半波条件后，往返相位失配使功率快速下降。' },
      { title: '改变反射率', instruction: '提高镜面反射率并观察共振峰。', observation: '光子寿命和腔内增强提高，同时共振允许范围变窄，对失谐更敏感。' },
    ],
    takeaway: '分析激光器时始终分两问：允许哪些腔模，以及哪个腔模的净往返增益大于一。',
  },
  en: {
    title: 'Laser cavities: mode selection and threshold are different jobs',
    background: 'A laser combines an optical gain medium with feedback. Mirrors send light repeatedly through the gain while preserving only frequencies whose round trips return with self-consistent phase.',
    motivation: 'Stimulated emission only makes coherent photon copying possible. Narrow, directional, stable laser output additionally requires cavity mode selection and pump above threshold.',
    focusQuestion: 'Why can an integer half-wave cavity still produce no laser, while strong pumping can fail when the cavity is detuned?',
    keyInsight: 'The phase condition asks which mode returns in phase; the threshold condition asks whether that mode grows or decays after each round trip. Both must hold.',
    formulas: [
      { title: 'Longitudinal modes', expressionLatex: String.raw`2L=m\lambda,\qquad \nu_m=\frac{mc}{2L}`, explanation: 'A round trip must accumulate an integer 2π phase, and adjacent modes are separated by the free spectral range c/(2L).' },
      { title: 'Round-trip threshold', expressionLatex: String.raw`e^{2gL}R_1R_2\ge 1`, explanation: 'Gain must replace mirror and intracavity loss before the field stops decaying; saturation later limits steady power.' },
    ],
    commonDifficulties: [
      { title: 'Resonance is not laser oscillation', misconception: 'Whenever 2L=mλ, strong laser light must appear.', resolution: 'Without enough population inversion, the cavity is only a passive Fabry-Perot filter and its field still decays.' },
      { title: 'A standing wave is not motionless light', misconception: 'Because the pattern does not translate, no energy propagates.', resolution: 'Opposite traveling waves form the standing pattern, while the output coupler still releases a propagating laser beam.' },
    ],
    steps: [
      { title: 'Isolate threshold', instruction: 'Choose On resonance and raise pump slowly through 1.', observation: 'Mode position stays fixed, but intracavity power builds only after crossing threshold.' },
      { title: 'Isolate phase', instruction: 'Keep pump above threshold and tune cavity length continuously.', observation: 'Leaving the integer half-wave condition causes round-trip phase mismatch and a sharp power drop.' },
      { title: 'Change reflectivity', instruction: 'Increase mirror reflectivity and inspect the resonance.', observation: 'Photon lifetime and buildup rise, while the allowed resonance narrows and becomes more detuning-sensitive.' },
    ],
    takeaway: 'Always ask two separate questions: which cavity modes are allowed, and which mode has net round-trip gain above one?',
  },
});
