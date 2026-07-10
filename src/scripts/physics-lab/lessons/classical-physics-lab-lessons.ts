import type { PhysicsLabLocale } from '../physics-lab-i18n';
import type { PhysicsLabLesson } from './physics-lab-lesson-types';

const classicalPhysicsLabLessons: Record<
  PhysicsLabLocale,
  Record<string, PhysicsLabLesson>
> = {
  zh: {
    'double-pendulum': {
      title: '从能量守恒到确定性混沌',
      introduction: '双摆不是随机系统。它遵守确定的运动方程，但两个转角的非线性耦合会把极小的初态差异迅速放大。',
      formulas: [
        {
          title: '系统总能量',
          expressionLatex: String.raw`E=T+U`,
          explanation: '无阻尼时，动能 T 与势能 U 持续交换，而总能量 E 应近似守恒。数值积分的误差会表现为能量缓慢漂移。',
        },
        {
          title: '初态误差的放大',
          expressionLatex: String.raw`\delta(t)\approx\delta_0 e^{\lambda_{\mathrm L}t}`,
          explanation: '正的 Lyapunov 指数 λL 表示相邻轨迹指数分离。这限制了长期预测，却不违反确定性。',
        },
      ],
      steps: [
        { title: '建立基准', instruction: '选择“轻摆”，将阻尼降到零并重置。', observation: '总能量读数只有很小波动，运动近似周期性。' },
        { title: '进入非线性区', instruction: '切换到“混沌”，保留末端轨迹。', observation: '摆球翻转并形成不重复的空间轨迹。' },
        { title: '比较孪生轨迹', instruction: '开启混沌孪生，等待两套摆从重合逐渐分开。', observation: '0.001° 的初始差最终变成宏观差异。' },
      ],
      takeaway: '混沌意味着预测期限有限，而不是运动没有规律；守恒量与局部方程仍然成立。',
    },
    orbit: {
      title: '用能量读懂圆锥曲线轨道',
      introduction: '平方反比引力把位置与加速度联系起来；初始半径和速度共同决定轨道是圆、椭圆还是逃逸曲线。',
      formulas: [
        {
          title: '中心引力运动方程',
          expressionLatex: String.raw`\ddot{\mathbf r}=-\frac{GM}{r^3}\mathbf r`,
          explanation: '加速度始终指向中心天体，大小按 1/r² 衰减。它改变速度方向并在近日点显著增强。',
        },
        {
          title: '比机械能',
          expressionLatex: String.raw`\varepsilon=\frac{v^2}{2}-\frac{GM}{r}`,
          explanation: 'ε<0 对应束缚椭圆，ε=0 是抛物线逃逸边界，ε>0 对应双曲线逃逸。',
        },
      ],
      steps: [
        { title: '校准圆轨道', instruction: '选择“圆轨道”，观察速度箭头与半径方向。', observation: '速度近似切向，引力近似径向，两者接近垂直。' },
        { title: '降低或提高速度', instruction: '改变发射速度但保持发射半径不变。', observation: '轨道偏心率和近日点位置随能量变化。' },
        { title: '越过逃逸速度', instruction: '选择“逃逸”并查看能量分类。', observation: '比能量转正，预测轨道不再闭合。' },
      ],
      takeaway: '轨道形状不是由“引力强弱”单独决定，而是由当前位置上的能量和角动量共同决定。',
    },
    'wave-interference': {
      title: '从场叠加到明暗条纹',
      introduction: '干涉发生在场振幅层面。探测器记录的强度与合成振幅的平方成正比，因此相位差会被转换成明暗结构。',
      formulas: [
        {
          title: '两个相干波的叠加',
          expressionLatex: String.raw`u=u_1+u_2,\qquad I\propto\langle u^2\rangle_t`,
          explanation: '两个场先相加，再取平方和时间平均。路径差为整数波长时增强，为半整数波长时相消。',
        },
        {
          title: '远场条纹间距',
          expressionLatex: String.raw`\Delta y\approx\frac{\lambda L}{d}`,
          explanation: 'λ 是波长，L 是屏距，d 是波源间距。增大 d 会压缩条纹，增大 λ 会拉宽条纹。',
        },
      ],
      steps: [
        { title: '找到中央亮纹', instruction: '保持两源同相，将探针移到两源中垂线上。', observation: '两条路径等长，路径差为零，场稳定增强。' },
        { title: '改变波长', instruction: '逐步增大波长并观察右侧强度屏。', observation: '波峰间距与亮纹间距同时增大。' },
        { title: '改变源间距', instruction: '保持波长不变，增大波源间距。', observation: '亮纹变密，符合 Δy 与 d 成反比。' },
      ],
      takeaway: '条纹是相位信息的空间地图；只要保持相干性，几何路径差就能直接控制强度。',
    },
    'electric-field': {
      title: '电势是地形，电场是最陡下坡',
      introduction: '点电荷的电势可以线性叠加。电场由电势的空间变化决定，因此等势线与电场线必然正交。',
      formulas: [
        {
          title: '多个点电荷的电势',
          expressionLatex: String.raw`V(\mathbf r)=\frac{1}{4\pi\varepsilon_0}\sum_i\frac{q_i}{|\mathbf r-\mathbf r_i|}`,
          explanation: '每个电荷贡献一个按距离反比衰减的标量势；正电荷抬高地形，负电荷压低地形。',
        },
        {
          title: '由电势得到电场',
          expressionLatex: String.raw`\mathbf E=-\nabla V`,
          explanation: '负梯度指向电势下降最快的方向。电势变化越陡，场强 |E| 越大。',
        },
      ],
      steps: [
        { title: '观察偶极子', instruction: '选择“偶极子”，同时显示场线和等势线。', observation: '场线从正电荷出发并终止于负电荷，与等势线近似垂直。' },
        { title: '比较同号电荷', instruction: '切换到“同号电荷对”。', observation: '两电荷中点处电势相加，但电场矢量可能相消。' },
        { title: '移动一个电荷', instruction: '拖动任意电荷改变几何布局。', observation: '电势面、等势线与场线同步重构。' },
      ],
      takeaway: '电势是标量，便于叠加；电场是它的梯度，负责决定测试电荷受到的力。',
    },
    'fourier-epicycles': {
      title: '把复杂波形拆成纯频率',
      introduction: 'Fourier 级数把周期函数写成正弦和余弦的加权和。周转圆是同一数学在复平面中的几何表示。',
      formulas: [
        {
          title: '实数 Fourier 级数',
          expressionLatex: String.raw`f(t)=\frac{a_0}{2}+\sum_{n=1}^{\infty}\left[a_n\cos(n\omega_0t)+b_n\sin(n\omega_0t)\right]`,
          explanation: '每个 n 对应一个频率为 nω₀ 的谐波，系数 an、bn 决定该旋转分量的大小与相位。',
        },
        {
          title: '方波的奇次谐波',
          expressionLatex: String.raw`f_N(t)=\frac{4}{\pi}\sum_{n=1,3,5}^{N}\frac{\sin(n\omega_0t)}{n}`,
          explanation: '方波只需要奇次谐波，振幅按 1/n 衰减。有限项在跳变附近保留 Gibbs 过冲。',
        },
      ],
      steps: [
        { title: '从单一频率开始', instruction: '选择方波并把谐波数调到 1。', observation: '输出只是一条平滑正弦波，无法形成尖角。' },
        { title: '逐项增加谐波', instruction: '缓慢提高 N，观察小圆如何补充细节。', observation: '平坦区和陡边越来越接近目标。' },
        { title: '比较不同频谱', instruction: '在方波、锯齿波和三角波之间切换。', observation: '系数衰减越快，所需高频越少，波形越平滑。' },
      ],
      takeaway: '频谱说明信号由哪些尺度构成；高频分量负责快速变化和尖锐边缘。',
    },
    'ideal-gas': {
      title: '从粒子碰撞推导宏观气体定律',
      introduction: '压强和温度不是单个粒子的属性，而是大量微观碰撞的统计结果。粒子越快，动量传递越频繁。',
      formulas: [
        {
          title: '理想气体状态方程',
          expressionLatex: String.raw`PV=Nk_{\mathrm B}T`,
          explanation: 'P 是压强，V 是体积，N 是粒子数。固定体积下，提高粒子数或温度都会提高压强。',
        },
        {
          title: '三维平均平动能',
          expressionLatex: String.raw`\left\langle K\right\rangle=\frac{3}{2}k_{\mathrm B}T`,
          explanation: '三个平动自由度各贡献 kBT/2。温度控制的是能量分布，而不是所有粒子具有同一速度。',
        },
      ],
      steps: [
        { title: '观察热平衡', instruction: '选择“温热”，等待速率直方图稳定。', observation: '瞬时柱高有噪声，但整体轮廓接近 Maxwell–Boltzmann 分布。' },
        { title: '只改变温度', instruction: '保持粒子数不变，将温度从低调到高。', observation: '平均速率和压强上升，分布向右移动并变宽。' },
        { title: '只改变粒子数', instruction: '保持温度不变，增加粒子数。', observation: '平均速率近似不变，但碰壁频率和压强增加。' },
      ],
      takeaway: '热力学量来自统计平均；宏观规律在粒子数增加时更稳定、更少受瞬时涨落影响。',
    },
    'coupled-oscillators': {
      title: '耦合如何产生简正模',
      introduction: '相邻振子的位移通过弹簧耦合。特殊的集体运动形状会保持不变，只按单一频率振荡，这就是简正模。',
      formulas: [
        {
          title: '离散弹簧链方程',
          expressionLatex: String.raw`m\ddot{x}_j=k\left(x_{j+1}-2x_j+x_{j-1}\right)`,
          explanation: '第 j 个质量受到左右弹簧的净恢复力。二阶差分衡量局部形状的弯曲程度。',
        },
        {
          title: '固定端简正频率',
          expressionLatex: String.raw`\omega_p=2\sqrt{\frac{k}{m}}\sin\!\left(\frac{p\pi}{2(N+1)}\right)`,
          explanation: 'N 个质量有 N 个离散频率；模式编号 p 越高，相邻质量的相位变化越快。',
        },
      ],
      steps: [
        { title: '激发最低模', instruction: '选择“模式 1”并显示模式包络。', observation: '所有质量大体同向运动，节点只出现在固定端。' },
        { title: '提高模式编号', instruction: '比较模式 2 和模式 3。', observation: '内部节点增加，频率上升，相邻质量更容易反向。' },
        { title: '制造拍频', instruction: '选择“拍频”并观察总振幅。', observation: '两个相近频率周期性增强和抵消，形成慢包络。' },
      ],
      takeaway: '任意小振动都能分解为简正模之和；耦合系统的复杂运动由一组独立频率组织。',
    },
    diffraction: {
      title: '孔径如何重新分配波的方向',
      introduction: '每条狭缝都可看成次级波源。单缝宽度决定宽包络，多缝间距和缝数决定包络内的细条纹。',
      formulas: [
        {
          title: '有限多缝强度',
          expressionLatex: String.raw`I(\theta)=I_0\left(\frac{\sin\beta}{\beta}\right)^2\left(\frac{\sin N\alpha}{\sin\alpha}\right)^2`,
          explanation: 'β=πa sinθ/λ 给出单缝包络，α=πd sinθ/λ 给出多缝干涉；N 增大时主极大变窄。',
        },
        {
          title: '极小与主极大条件',
          expressionLatex: String.raw`a\sin\theta=m\lambda,\qquad d\sin\theta=m\lambda`,
          explanation: '第一式定位单缝极小，第二式定位多缝主极大。a 是缝宽，d 是中心间距。',
        },
      ],
      steps: [
        { title: '测量单缝包络', instruction: '选择“单缝”，逐步减小缝宽 a。', observation: '首个极小向外移动，中央亮斑变宽。' },
        { title: '加入第二条缝', instruction: '切换到“双缝”，改变缝间距 d。', observation: '包络尺度近似不变，但内部条纹间距改变。' },
        { title: '形成光栅', instruction: '选择“光栅”并增加缝数 N。', observation: '主极大位置基本不变，但亮线更尖锐。' },
      ],
      takeaway: '更窄的孔径产生更宽的角分布；更多相干孔径则提高方向选择性。',
    },
    'charged-particle': {
      title: '用 Lorentz 力控制带电粒子轨迹',
      introduction: '电场沿自身方向做功，磁场则施加垂直于速度的力。二者组合可以形成回旋、加速和横向漂移。',
      formulas: [
        {
          title: 'Lorentz 力',
          expressionLatex: String.raw`\mathbf F=q\left(\mathbf E+\mathbf v\times\mathbf B\right)`,
          explanation: '电场项可改变速率；磁场项与 v 垂直，只弯曲轨迹。改变 q 的符号会反转受力方向。',
        },
        {
          title: '回旋尺度与漂移',
          expressionLatex: String.raw`r_c=\frac{mv_\perp}{|q|B},\qquad \mathbf v_D=\frac{\mathbf E\times\mathbf B}{B^2}`,
          explanation: '质量或垂直速度越大，回旋半径越大；E×B 漂移与电荷符号和质量无关。',
        },
      ],
      steps: [
        { title: '建立纯回旋', instruction: '选择“回旋”，保持电场为零。', observation: '速率和动能近似不变，轨迹为圆或螺旋投影。' },
        { title: '反转电荷或磁场', instruction: '将 q 或 Bz 的符号反转一次。', observation: '回旋方向反转；同时反转两者则方向恢复。' },
        { title: '观察 E×B 漂移', instruction: '选择“E×B 漂移”并调整场强。', observation: '回旋中心以近似 E/B 的速度平移。' },
      ],
      takeaway: '磁场负责转向，电场负责能量交换；场的几何关系比单纯的强度更重要。',
    },
    'three-body': {
      title: '守恒定律约束下的三体混沌',
      introduction: '每个天体同时受到另外两个天体的引力。方程简单且确定，但一般不存在可写成有限公式的轨道解。',
      formulas: [
        {
          title: '第 i 个天体的加速度',
          expressionLatex: String.raw`\ddot{\mathbf r}_i=G\sum_{j\ne i}m_j\frac{\mathbf r_j-\mathbf r_i}{|\mathbf r_j-\mathbf r_i|^3}`,
          explanation: '所有两两引力矢量相加。近距离相遇时分母迅速变小，使数值积分和长期预测都更困难。',
        },
        {
          title: '孤立系统总动量',
          expressionLatex: String.raw`\mathbf P=\sum_i m_i\mathbf v_i=\text{constant}`,
          explanation: '内部引力成对出现并相互抵消，因此质心做匀速运动。质心漂移常提示积分误差。',
        },
      ],
      steps: [
        { title: '识别周期解', instruction: '选择“8 字轨道”并打开轨迹。', observation: '三个等质量天体沿同一条闭合曲线依次运行。' },
        { title: '加入微小扰动', instruction: '从很小的扰动开始逐步提高百分比。', observation: '短期轨迹仍相似，长期形状和接近次序明显分离。' },
        { title: '检查守恒量', instruction: '显示质心并同时观察能量、总动量读数。', observation: '轨迹可以复杂，但孤立系统的整体守恒量应近似稳定。' },
      ],
      takeaway: '守恒律能约束运动，却不足以给出唯一的简单轨道；混沌存在于这些约束之内。',
    },
    'lens-optics': {
      title: '用三条主光线定位透镜成像',
      introduction: '薄透镜模型把复杂折射压缩到一个平面。焦距和物距决定像的位置、正倒和放大率。',
      formulas: [
        {
          title: '薄透镜公式',
          expressionLatex: String.raw`\frac{1}{f}=\frac{1}{d_o}+\frac{1}{d_i}`,
          explanation: 'f 是焦距，do 是物距，di 是像距。符号约定区分会聚与发散透镜、实像与虚像。',
        },
        {
          title: '横向放大率',
          expressionLatex: String.raw`M=\frac{h_i}{h_o}=-\frac{d_i}{d_o}`,
          explanation: 'M 的绝对值给出尺寸比例，负号表示倒立实像，正号通常对应正立虚像。',
        },
      ],
      steps: [
        { title: '形成缩小实像', instruction: '选择“实像”，让物体位于 2F 之外。', observation: '三条折射光线在透镜另一侧会聚，像倒立且缩小。' },
        { title: '穿过焦点', instruction: '逐步减小物距，让物体从焦点外移到焦点内。', observation: '像距发散后改变符号，实像转为正立虚像。' },
        { title: '切换发散透镜', instruction: '选择“发散”或把焦距调为负值。', observation: '出射光线发散，反向延长线在物体一侧形成缩小虚像。' },
      ],
      takeaway: '主光线是几何构图工具；真正控制成像的是薄透镜方程和一致的符号约定。',
    },
  },
  en: {
    'double-pendulum': {
      title: 'From energy conservation to deterministic chaos',
      introduction: 'A double pendulum is not random. It follows deterministic equations, but nonlinear coupling between its two angles rapidly amplifies tiny differences in initial state.',
      formulas: [
        { title: 'Total system energy', expressionLatex: String.raw`E=T+U`, explanation: 'Without damping, kinetic energy T and potential energy U exchange continuously while total energy E should remain nearly constant. Slow drift reveals numerical error.' },
        { title: 'Growth of initial error', expressionLatex: String.raw`\delta(t)\approx\delta_0 e^{\lambda_{\mathrm L}t}`, explanation: 'A positive Lyapunov exponent λL makes nearby trajectories separate exponentially. This limits long-term prediction without violating determinism.' },
      ],
      steps: [
        { title: 'Establish a baseline', instruction: 'Choose Gentle, reduce damping to zero, and reset.', observation: 'Total energy fluctuates only slightly and the motion is nearly periodic.' },
        { title: 'Enter the nonlinear regime', instruction: 'Switch to Chaotic and keep the tip trail visible.', observation: 'The bobs flip over and draw a nonrepeating path through space.' },
        { title: 'Compare the chaotic twin', instruction: 'Enable the twin and wait as the two systems separate.', observation: 'An initial difference of 0.001 degrees eventually becomes macroscopic.' },
      ],
      takeaway: 'Chaos means prediction has a finite horizon, not that motion lacks laws; local equations and conservation principles still apply.',
    },
    orbit: {
      title: 'Read conic orbits through energy',
      introduction: 'Inverse-square gravity connects position to acceleration. Initial radius and velocity together determine whether an orbit is circular, elliptical, or unbound.',
      formulas: [
        { title: 'Central-force equation', expressionLatex: String.raw`\ddot{\mathbf r}=-\frac{GM}{r^3}\mathbf r`, explanation: 'Acceleration always points toward the central mass and falls as 1/r². It turns the velocity and becomes strongest near periapsis.' },
        { title: 'Specific mechanical energy', expressionLatex: String.raw`\varepsilon=\frac{v^2}{2}-\frac{GM}{r}`, explanation: 'ε<0 gives a bound ellipse, ε=0 is the parabolic escape boundary, and ε>0 gives a hyperbolic escape.' },
      ],
      steps: [
        { title: 'Calibrate a circle', instruction: 'Choose Circular and compare the velocity arrow with the radius.', observation: 'Velocity is nearly tangential while gravity is radial, so the vectors are close to perpendicular.' },
        { title: 'Change launch speed', instruction: 'Vary speed while keeping launch radius fixed.', observation: 'Orbital eccentricity and periapsis change with energy.' },
        { title: 'Cross escape speed', instruction: 'Choose Escape and inspect the energy classification.', observation: 'Specific energy becomes positive and the predicted path no longer closes.' },
      ],
      takeaway: 'Orbit shape is not set by gravity strength alone; energy and angular momentum at the current state determine the conic.',
    },
    'wave-interference': {
      title: 'From field superposition to fringes',
      introduction: 'Interference occurs at the field-amplitude level. Detectors record intensity proportional to the squared combined amplitude, converting phase difference into bright and dark structure.',
      formulas: [
        { title: 'Superposition of coherent waves', expressionLatex: String.raw`u=u_1+u_2,\qquad I\propto\langle u^2\rangle_t`, explanation: 'Fields add before squaring and time averaging. Integer-wavelength path differences reinforce; half-integer differences cancel.' },
        { title: 'Far-field fringe spacing', expressionLatex: String.raw`\Delta y\approx\frac{\lambda L}{d}`, explanation: 'λ is wavelength, L is screen distance, and d is source separation. Larger d compresses fringes; larger λ spreads them.' },
      ],
      steps: [
        { title: 'Find the central maximum', instruction: 'Keep the sources in phase and move the probe onto their perpendicular bisector.', observation: 'The paths are equal, so path difference is zero and the fields reinforce.' },
        { title: 'Change wavelength', instruction: 'Increase wavelength gradually while watching the intensity screen.', observation: 'Both wavefront spacing and bright-fringe spacing increase.' },
        { title: 'Change source separation', instruction: 'Hold wavelength fixed and increase source separation.', observation: 'Fringes become denser, consistent with Δy being inversely proportional to d.' },
      ],
      takeaway: 'Fringes are a spatial map of phase information; with coherence preserved, geometry directly controls intensity.',
    },
    'electric-field': {
      title: 'Potential is terrain; field is steepest descent',
      introduction: 'Point-charge potentials add linearly. The field comes from spatial variation in that potential, forcing field lines and equipotentials to meet at right angles.',
      formulas: [
        { title: 'Potential of point charges', expressionLatex: String.raw`V(\mathbf r)=\frac{1}{4\pi\varepsilon_0}\sum_i\frac{q_i}{|\mathbf r-\mathbf r_i|}`, explanation: 'Each charge contributes a scalar potential that falls as inverse distance. Positive charges raise the terrain and negative charges lower it.' },
        { title: 'Field from potential', expressionLatex: String.raw`\mathbf E=-\nabla V`, explanation: 'The negative gradient points down the steepest potential slope. A steeper change means a larger field magnitude |E|.' },
      ],
      steps: [
        { title: 'Inspect a dipole', instruction: 'Choose Dipole and show both field lines and equipotentials.', observation: 'Lines leave the positive charge, end on the negative charge, and cross equipotentials nearly perpendicularly.' },
        { title: 'Compare like charges', instruction: 'Switch to Like charges.', observation: 'Potential adds at the midpoint while the field vectors can cancel there.' },
        { title: 'Move one charge', instruction: 'Drag a charge to change the geometry.', observation: 'The potential surface, contours, and field lines reconstruct together.' },
      ],
      takeaway: 'Potential is a scalar that is easy to superpose; its gradient is the field that determines force on a test charge.',
    },
    'fourier-epicycles': {
      title: 'Decompose a complex waveform into pure frequencies',
      introduction: 'A Fourier series writes a periodic function as a weighted sum of sines and cosines. Epicycles show the same mathematics geometrically in the complex plane.',
      formulas: [
        { title: 'Real Fourier series', expressionLatex: String.raw`f(t)=\frac{a_0}{2}+\sum_{n=1}^{\infty}\left[a_n\cos(n\omega_0t)+b_n\sin(n\omega_0t)\right]`, explanation: 'Each n is a harmonic at frequency nω₀. Coefficients an and bn set the magnitude and phase of that rotating component.' },
        { title: 'Odd harmonics of a square wave', expressionLatex: String.raw`f_N(t)=\frac{4}{\pi}\sum_{n=1,3,5}^{N}\frac{\sin(n\omega_0t)}{n}`, explanation: 'A square wave uses only odd harmonics with amplitude falling as 1/n. A finite sum retains Gibbs overshoot near a jump.' },
      ],
      steps: [
        { title: 'Start with one frequency', instruction: 'Choose Square and set harmonics to 1.', observation: 'The result is a smooth sine wave with no sharp corners.' },
        { title: 'Add terms one at a time', instruction: 'Increase N slowly and watch the smaller circles add detail.', observation: 'Flat regions and steep edges move closer to the target.' },
        { title: 'Compare spectra', instruction: 'Switch among square, sawtooth, and triangle waves.', observation: 'Faster coefficient decay needs less high-frequency content and produces smoother shapes.' },
      ],
      takeaway: 'A spectrum reveals the scales inside a signal; high frequencies carry rapid changes and sharp edges.',
    },
    'ideal-gas': {
      title: 'Derive gas laws from particle collisions',
      introduction: 'Pressure and temperature are statistical properties, not attributes of one particle. Faster particles transfer momentum to the walls more frequently.',
      formulas: [
        { title: 'Ideal-gas equation of state', expressionLatex: String.raw`PV=Nk_{\mathrm B}T`, explanation: 'P is pressure, V is volume, and N is particle count. At fixed volume, increasing either count or temperature raises pressure.' },
        { title: 'Mean translational energy in 3D', expressionLatex: String.raw`\left\langle K\right\rangle=\frac{3}{2}k_{\mathrm B}T`, explanation: 'Each translational degree of freedom contributes kBT/2. Temperature sets an energy distribution, not one speed shared by all particles.' },
      ],
      steps: [
        { title: 'Observe equilibrium', instruction: 'Choose Warm and wait for the speed histogram to settle.', observation: 'Individual bins fluctuate, but the envelope approaches a Maxwell-Boltzmann distribution.' },
        { title: 'Change only temperature', instruction: 'Keep count fixed and move from low to high temperature.', observation: 'Mean speed and pressure rise while the distribution shifts right and broadens.' },
        { title: 'Change only particle count', instruction: 'Keep temperature fixed and increase particle count.', observation: 'Mean speed remains similar while wall-collision rate and pressure increase.' },
      ],
      takeaway: 'Thermodynamic quantities emerge from statistical averages and become steadier as the number of particles grows.',
    },
    'coupled-oscillators': {
      title: 'How coupling creates normal modes',
      introduction: 'Neighboring oscillator displacements are coupled by springs. Special collective shapes remain unchanged while oscillating at one frequency; these are normal modes.',
      formulas: [
        { title: 'Discrete spring-chain equation', expressionLatex: String.raw`m\ddot{x}_j=k\left(x_{j+1}-2x_j+x_{j-1}\right)`, explanation: 'Mass j feels the net restoring force from its two neighbors. The second difference measures local curvature of the chain.' },
        { title: 'Fixed-end normal frequencies', expressionLatex: String.raw`\omega_p=2\sqrt{\frac{k}{m}}\sin\!\left(\frac{p\pi}{2(N+1)}\right)`, explanation: 'N masses have N discrete frequencies. Higher mode number p produces faster phase changes between neighboring masses.' },
      ],
      steps: [
        { title: 'Excite the lowest mode', instruction: 'Choose Mode 1 and show mode envelopes.', observation: 'All masses move broadly together, with nodes only at the fixed ends.' },
        { title: 'Raise the mode number', instruction: 'Compare Mode 2 and Mode 3.', observation: 'Internal nodes appear, frequency rises, and neighbors more often move oppositely.' },
        { title: 'Create beats', instruction: 'Choose Beats and watch the total amplitude.', observation: 'Two nearby frequencies alternate between reinforcement and cancellation under a slow envelope.' },
      ],
      takeaway: 'Any small motion can be decomposed into normal modes; a set of independent frequencies organizes the coupled dynamics.',
    },
    diffraction: {
      title: 'How an aperture redistributes wave direction',
      introduction: 'Treat each slit as a secondary source. Slit width sets a broad envelope, while spacing and slit count set the fine fringes inside it.',
      formulas: [
        { title: 'Finite multi-slit intensity', expressionLatex: String.raw`I(\theta)=I_0\left(\frac{\sin\beta}{\beta}\right)^2\left(\frac{\sin N\alpha}{\sin\alpha}\right)^2`, explanation: 'β=πa sinθ/λ gives the single-slit envelope and α=πd sinθ/λ gives multi-slit interference. Larger N narrows principal maxima.' },
        { title: 'Minima and principal maxima', expressionLatex: String.raw`a\sin\theta=m\lambda,\qquad d\sin\theta=m\lambda`, explanation: 'The first relation locates single-slit minima; the second locates multi-slit principal maxima. a is width and d is center spacing.' },
      ],
      steps: [
        { title: 'Measure the single-slit envelope', instruction: 'Choose Single slit and reduce width a.', observation: 'The first minimum moves outward and the central maximum widens.' },
        { title: 'Add a second slit', instruction: 'Switch to Double slit and vary spacing d.', observation: 'The broad envelope stays similar while internal fringe spacing changes.' },
        { title: 'Build a grating', instruction: 'Choose Grating and increase slit count N.', observation: 'Principal maxima stay nearly fixed but sharpen into thinner lines.' },
      ],
      takeaway: 'Narrower apertures spread waves across more angles; more coherent apertures increase directional selectivity.',
    },
    'charged-particle': {
      title: 'Control charged-particle paths with the Lorentz force',
      introduction: 'An electric field does work along its direction, while a magnetic field applies a force perpendicular to velocity. Together they produce gyration, acceleration, and drift.',
      formulas: [
        { title: 'Lorentz force', expressionLatex: String.raw`\mathbf F=q\left(\mathbf E+\mathbf v\times\mathbf B\right)`, explanation: 'The electric term can change speed; the magnetic term is perpendicular to v and only bends the path. Reversing q reverses force.' },
        { title: 'Gyroradius and drift', expressionLatex: String.raw`r_c=\frac{mv_\perp}{|q|B},\qquad \mathbf v_D=\frac{\mathbf E\times\mathbf B}{B^2}`, explanation: 'Greater mass or perpendicular speed gives a larger orbit. E×B drift is independent of charge sign and mass.' },
      ],
      steps: [
        { title: 'Establish pure gyration', instruction: 'Choose Cyclotron and keep the electric field at zero.', observation: 'Speed and kinetic energy stay nearly fixed while the path curves into a circle.' },
        { title: 'Reverse charge or field', instruction: 'Reverse the sign of either q or Bz once.', observation: 'The gyration direction reverses; reversing both restores it.' },
        { title: 'Observe E×B drift', instruction: 'Choose E x B drift and adjust field strengths.', observation: 'The orbit center translates at a speed close to E/B.' },
      ],
      takeaway: 'Magnetic fields turn motion and electric fields exchange energy; field geometry matters as much as magnitude.',
    },
    'three-body': {
      title: 'Three-body chaos inside conservation laws',
      introduction: 'Each body feels gravity from the other two. The equations are simple and deterministic, yet there is no general orbit expressible by a finite closed formula.',
      formulas: [
        { title: 'Acceleration of body i', expressionLatex: String.raw`\ddot{\mathbf r}_i=G\sum_{j\ne i}m_j\frac{\mathbf r_j-\mathbf r_i}{|\mathbf r_j-\mathbf r_i|^3}`, explanation: 'All pairwise gravity vectors add. During a close encounter the denominator shrinks rapidly, making integration and long-term prediction harder.' },
        { title: 'Total momentum of an isolated system', expressionLatex: String.raw`\mathbf P=\sum_i m_i\mathbf v_i=\text{constant}`, explanation: 'Internal forces occur in canceling pairs, so the center of mass moves uniformly. Center drift often reveals integration error.' },
      ],
      steps: [
        { title: 'Identify a periodic solution', instruction: 'Choose Figure-eight and enable trails.', observation: 'Three equal masses follow the same closed curve in sequence.' },
        { title: 'Add a small perturbation', instruction: 'Start near zero and gradually raise the perturbation.', observation: 'Paths look similar at first but later separate in shape and encounter order.' },
        { title: 'Check conserved quantities', instruction: 'Show the center of mass and inspect energy and momentum.', observation: 'Trajectories can be complex while global invariants remain nearly stable.' },
      ],
      takeaway: 'Conservation laws constrain motion without selecting one simple orbit; chaos unfolds inside those constraints.',
    },
    'lens-optics': {
      title: 'Locate lens images with three principal rays',
      introduction: 'The thin-lens model compresses complex refraction into one plane. Focal length and object distance determine image position, orientation, and magnification.',
      formulas: [
        { title: 'Thin-lens equation', expressionLatex: String.raw`\frac{1}{f}=\frac{1}{d_o}+\frac{1}{d_i}`, explanation: 'f is focal length, do is object distance, and di is image distance. A consistent sign convention distinguishes real and virtual images.' },
        { title: 'Transverse magnification', expressionLatex: String.raw`M=\frac{h_i}{h_o}=-\frac{d_i}{d_o}`, explanation: '|M| is the size ratio. A negative sign gives an inverted real image; positive usually indicates an upright virtual image.' },
      ],
      steps: [
        { title: 'Form a reduced real image', instruction: 'Choose Real image and place the object beyond 2F.', observation: 'The three refracted rays converge on the far side to an inverted, smaller image.' },
        { title: 'Cross the focal point', instruction: 'Reduce object distance from outside to inside the focus.', observation: 'Image distance diverges and changes sign as the real image becomes an upright virtual image.' },
        { title: 'Switch to a diverging lens', instruction: 'Choose Diverging or set focal length negative.', observation: 'Outgoing rays diverge and backward extensions meet in a reduced virtual image.' },
      ],
      takeaway: 'Principal rays are a construction tool; the thin-lens equation and a consistent sign convention control the image.',
    },
  },
};

export function getClassicalPhysicsLabLesson(
  slug: string,
  locale: PhysicsLabLocale,
): PhysicsLabLesson | undefined {
  return classicalPhysicsLabLessons[locale][slug];
}
