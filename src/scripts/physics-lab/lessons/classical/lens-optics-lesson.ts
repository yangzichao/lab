import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const lensOpticsLesson = definePhysicsLabLesson({
  zh: {
    title: '透镜成像：用焦点组织所有光线',
    background: '真实透镜连续折射无数光线。薄透镜近似把折射集中到一个平面，并用焦距概括曲率与折射率。',
    motivation: '相机、眼睛、显微镜和望远镜的第一层分析都归结为像距、放大率和实虚像判断。',
    focusQuestion: '物体穿过焦点时，为什么像会突然从另一侧实像变成同侧虚像？',
    keyInsight: '焦点是平行光线会聚的几何尺度；物距相对焦距的位置决定出射光是否真正会聚。',
    formulas: [
      { title: '薄透镜公式', expressionLatex: String.raw`\frac{1}{f}=\frac{1}{d_o}+\frac{1}{d_i}`, explanation: '一致的符号约定让同一式子覆盖会聚、发散、实像和虚像。' },
      { title: '横向放大率', expressionLatex: String.raw`M=\frac{h_i}{h_o}=-\frac{d_i}{d_o}`, explanation: '绝对值给尺寸比例，符号区分正立和倒立。' },
    ],
    commonDifficulties: [
      { title: '虚像不是不存在的像', misconception: '虚像只是画图辅助，无法被人眼看见。', resolution: '虚像不能直接投到屏幕，却能被眼睛或另一透镜接收，因为光线看似来自该位置。' },
      { title: '三条主光线不是仅有的光', misconception: '物体只发出图中画出的三条光线。', resolution: '它们只是便于定位像的代表；所有近轴光线都遵守同一成像关系。' },
    ],
    steps: [
      { title: '形成缩小实像', instruction: '让物体位于 2F 之外。', observation: '光线在另一侧会聚成倒立缩小像。' },
      { title: '跨过焦点', instruction: '缓慢把物体移入 F 内。', observation: '像距发散并变号，像转为正立虚像。' },
      { title: '改用发散透镜', instruction: '把焦距设为负。', observation: '出射光发散，反向延长线形成缩小虚像。' },
    ],
    takeaway: '先判断物体相对 F 和 2F 的位置，再用符号化公式精确计算。',
  },
  en: {
    title: 'Lens imaging: organize all rays around the focus',
    background: 'A real lens continuously refracts infinitely many rays. The thin-lens approximation concentrates refraction into one plane and summarizes curvature and refractive index with focal length.',
    motivation: 'The first analysis of cameras, eyes, microscopes, and telescopes reduces to image distance, magnification, and real-versus-virtual image.',
    focusQuestion: 'Why does crossing the focal point suddenly move an image from a real image on one side to a virtual image on the other?',
    keyInsight: 'The focus is the geometric scale for parallel-ray convergence; object position relative to it decides whether outgoing rays truly meet.',
    formulas: [
      { title: 'Thin-lens equation', expressionLatex: String.raw`\frac{1}{f}=\frac{1}{d_o}+\frac{1}{d_i}`, explanation: 'One consistent sign convention covers converging, diverging, real, and virtual cases.' },
      { title: 'Transverse magnification', expressionLatex: String.raw`M=\frac{h_i}{h_o}=-\frac{d_i}{d_o}`, explanation: 'Magnitude gives size ratio while sign distinguishes upright from inverted.' },
    ],
    commonDifficulties: [
      { title: 'A virtual image is still observable', misconception: 'A virtual image is only a drawing aid and cannot be seen.', resolution: 'It cannot project directly onto a screen, but eyes or another lens receive rays that appear to originate there.' },
      { title: 'Principal rays are not the only rays', misconception: 'The object emits only the three rays drawn in the diagram.', resolution: 'They are convenient representatives for locating the image; all paraxial rays obey the same imaging relation.' },
    ],
    steps: [
      { title: 'Form a reduced real image', instruction: 'Place the object beyond 2F.', observation: 'Rays converge on the far side into an inverted smaller image.' },
      { title: 'Cross the focus', instruction: 'Move the object slowly inside F.', observation: 'Image distance diverges and changes sign, producing an upright virtual image.' },
      { title: 'Use a diverging lens', instruction: 'Set focal length negative.', observation: 'Outgoing rays diverge and backward extensions form a reduced virtual image.' },
    ],
    takeaway: 'Classify position relative to F and 2F first, then calculate with a consistent sign convention.',
  },
});
