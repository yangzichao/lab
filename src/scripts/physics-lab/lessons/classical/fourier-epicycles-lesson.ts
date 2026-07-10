import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const fourierEpicyclesLesson = definePhysicsLabLesson({
  zh: {
    title: 'Fourier 级数：把复杂波形拆成频率',
    background: '任何满足适当条件的周期信号，都能表示为不同整数倍频率的正弦和余弦之和。周转圆是复平面中的同一分解。',
    motivation: '频谱让声音、图像、振动和通信信号从“形状问题”变成“每个频率占多少”的问题。',
    focusQuestion: '为什么一串只做匀速圆周运动的矢量，能画出带尖角的方波？',
    keyInsight: '大而慢的分量决定整体轮廓，小而快的分量补足边缘细节。',
    formulas: [
      { title: 'Fourier 级数', expressionLatex: String.raw`f(t)=\frac{a_0}{2}+\sum_{n=1}^{\infty}\left[a_n\cos(n\omega_0t)+b_n\sin(n\omega_0t)\right]`, explanation: '每个 n 是一个独立谐波，系数决定振幅和相位。' },
      { title: '方波的奇次谐波', expressionLatex: String.raw`f_N(t)=\frac{4}{\pi}\sum_{n=1,3,5}^{N}\frac{\sin(n\omega_0t)}{n}`, explanation: '方波只含奇次谐波，振幅按 1/n 衰减。' },
    ],
    commonDifficulties: [
      { title: '更多项不消除所有过冲', misconception: 'N 足够大时，跳变处会处处平滑收敛。', resolution: 'Gibbs 过冲的宽度缩小，但相对高度不会简单降为零。' },
      { title: '频率与圆的大小是两回事', misconception: '转得越快的圆一定越大。', resolution: '转速由谐波编号决定，半径由 Fourier 系数决定。' },
    ],
    steps: [
      { title: '只保留基频', instruction: '选择方波并把 N 调到 1。', observation: '输出只是平滑正弦波。' },
      { title: '逐步补高频', instruction: '缓慢增加 N。', observation: '平顶和陡边逐渐形成，小圆负责细节。' },
      { title: '比较系数衰减', instruction: '切换方波、锯齿波和三角波。', observation: '越平滑的波形，高频分量衰减越快。' },
    ],
    takeaway: 'Fourier 分析的核心不是画圆，而是用频率尺度组织复杂变化。',
  },
  en: {
    title: 'Fourier series: decompose shape into frequency',
    background: 'Under broad conditions, a periodic signal can be represented as a sum of sines and cosines at integer multiples of a base frequency. Epicycles show the same decomposition in the complex plane.',
    motivation: 'A spectrum turns sound, images, vibration, and communication from shape problems into questions about how much of each frequency is present.',
    focusQuestion: 'How can vectors moving only in uniform circles draw a square wave with sharp corners?',
    keyInsight: 'Large slow components carry the broad shape; small fast components supply edge detail.',
    formulas: [
      { title: 'Fourier series', expressionLatex: String.raw`f(t)=\frac{a_0}{2}+\sum_{n=1}^{\infty}\left[a_n\cos(n\omega_0t)+b_n\sin(n\omega_0t)\right]`, explanation: 'Each n is an independent harmonic whose coefficients set magnitude and phase.' },
      { title: 'Odd harmonics of a square wave', expressionLatex: String.raw`f_N(t)=\frac{4}{\pi}\sum_{n=1,3,5}^{N}\frac{\sin(n\omega_0t)}{n}`, explanation: 'A square wave uses odd harmonics with amplitudes falling as 1/n.' },
    ],
    commonDifficulties: [
      { title: 'More terms do not remove all overshoot', misconception: 'A sufficiently large N makes convergence smooth everywhere.', resolution: 'Gibbs overshoot becomes narrower near a jump, but its relative height does not simply vanish.' },
      { title: 'Frequency and circle size are separate', misconception: 'A faster circle must also be larger.', resolution: 'Harmonic number sets rotation rate; the Fourier coefficient sets radius.' },
    ],
    steps: [
      { title: 'Keep only the fundamental', instruction: 'Choose Square and set N to 1.', observation: 'The output is only a smooth sine wave.' },
      { title: 'Add high frequencies', instruction: 'Increase N slowly.', observation: 'Flat tops and steep edges emerge as small circles add detail.' },
      { title: 'Compare coefficient decay', instruction: 'Switch among square, sawtooth, and triangle waves.', observation: 'Smoother waveforms lose high-frequency content faster.' },
    ],
    takeaway: 'Fourier analysis is not fundamentally about circles; it organizes complexity by frequency scale.',
  },
});
