import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const diffractionLesson = definePhysicsLabLesson({
  zh: {
    title: '衍射：孔径如何重排传播方向',
    background: '波通过有限孔径后，每个孔径位置都像次级波源。远处图样是这些贡献在不同方向上的相位叠加。',
    motivation: '衍射同时决定显微镜和望远镜分辨率，也让光栅能够把不同波长分开。',
    focusQuestion: '为什么狭缝越窄，透过后的光反而展开得越宽？',
    keyInsight: '空间限制越强，传播方向分布越宽；更多周期孔径则让允许方向更尖锐。',
    formulas: [
      { title: '多缝强度', expressionLatex: String.raw`I(\theta)=I_0\left(\frac{\sin\beta}{\beta}\right)^2\left(\frac{\sin N\alpha}{\sin\alpha}\right)^2`, explanation: '第一因子是单缝包络，第二因子是 N 缝干涉细结构。' },
      { title: '极小与主极大', expressionLatex: String.raw`a\sin\theta=m\lambda,\qquad d\sin\theta=m\lambda`, explanation: '缝宽 a 控制包络，缝距 d 控制主极大方向。' },
    ],
    commonDifficulties: [
      { title: '衍射不是光碰到边缘后反弹', misconception: '只有靠近狭缝边缘的光线发生弯折。', resolution: '整个孔径上的波共同叠加；图样来自有限空间范围的相位关系。' },
      { title: '包络与细条纹来自不同尺度', misconception: '改变缝距会同样改变单缝包络宽度。', resolution: 'a 决定宽包络，d 和 N 决定其中的条纹位置与尖锐度。' },
    ],
    steps: [
      { title: '收窄单缝', instruction: '选择单缝并减小 a。', observation: '中央亮斑变宽，首个极小向外移动。' },
      { title: '加入第二缝', instruction: '切换双缝并改变 d。', observation: '包络近似不变，内部条纹间距改变。' },
      { title: '增加缝数', instruction: '选择光栅并提高 N。', observation: '主极大位置稳定，但亮线变窄。' },
    ],
    takeaway: '孔径尺寸控制展开范围，周期性和孔径数量控制方向选择性。',
  },
  en: {
    title: 'Diffraction: how apertures redistribute direction',
    background: 'After a wave passes through a finite aperture, every point across the opening acts like a secondary source. The distant pattern adds their phases in each direction.',
    motivation: 'Diffraction limits microscope and telescope resolution while allowing gratings to separate wavelengths.',
    focusQuestion: 'Why does a narrower slit make the transmitted wave spread more widely?',
    keyInsight: 'Tighter spatial confinement broadens direction; more periodic apertures sharpen the allowed directions.',
    formulas: [
      { title: 'Multi-slit intensity', expressionLatex: String.raw`I(\theta)=I_0\left(\frac{\sin\beta}{\beta}\right)^2\left(\frac{\sin N\alpha}{\sin\alpha}\right)^2`, explanation: 'The first factor is the single-slit envelope; the second is fine structure from N slits.' },
      { title: 'Minima and principal maxima', expressionLatex: String.raw`a\sin\theta=m\lambda,\qquad d\sin\theta=m\lambda`, explanation: 'Slit width a controls the envelope while spacing d controls principal directions.' },
    ],
    commonDifficulties: [
      { title: 'Diffraction is not edge reflection', misconception: 'Only rays touching the slit edges bend.', resolution: 'The entire aperture contributes; the pattern comes from phase relations across a finite spatial range.' },
      { title: 'Envelope and fringes use different scales', misconception: 'Changing slit spacing should equally change the single-slit envelope.', resolution: 'a sets the broad envelope; d and N set fringe positions and sharpness inside it.' },
    ],
    steps: [
      { title: 'Narrow one slit', instruction: 'Choose Single slit and reduce a.', observation: 'The central maximum widens and the first minimum moves outward.' },
      { title: 'Add a second slit', instruction: 'Switch to Double slit and vary d.', observation: 'The envelope stays similar while internal spacing changes.' },
      { title: 'Add more slits', instruction: 'Choose Grating and raise N.', observation: 'Principal positions remain while bright lines sharpen.' },
    ],
    takeaway: 'Aperture size controls spread; periodicity and aperture count control directional selectivity.',
  },
});
