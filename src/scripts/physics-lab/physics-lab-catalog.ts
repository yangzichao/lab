// Single source of truth for the physics labs. Each simulation is now its own
// page; adding a new one is: write its module, then add an entry here. The root
// index and every lab header read from this list, so titles, taglines, and the
// teaching note never drift apart.

export type PhysicsLabEntry = {
  slug: string;
  href: string;
  icon: string;
  title: string;
  eyebrow: string;
  tagline: string;
  description: string;
  notice: string;
};

export const physicsLabCatalog: PhysicsLabEntry[] = [
  {
    slug: 'double-pendulum',
    href: '/physics/double-pendulum/',
    icon: 'ph-infinity',
    title: 'Double Pendulum',
    eyebrow: '混沌 · 非线性动力学',
    tagline: '两根耦合的摆杆，运动出了名地无法预测。',
    description:
      '用 RK4 积分的 double pendulum。一个浅色的孪生摆从相差千分之一度的地方出发——看它能跟原摆同步多久，再看混沌如何把两者撕开。',
    notice:
      '把阻尼调到零，总能量就稳稳不动——那个不变的数字正是积分器在证明它守恒能量。轻轻拨动一个初始角度，孪生摆就会暴露出对初始条件的敏感依赖。',
  },
  {
    slug: 'orbit',
    href: '/physics/orbit/',
    icon: 'ph-planet',
    title: 'Orbit Lab',
    eyebrow: '引力 · 有心力',
    tagline: '抛出一个天体，看它画出的 conic section。',
    description:
      '一个天体在平方反比引力下运动。青色箭头是速度，琥珀色箭头是引力——始终指向恒星——那条浅色椭圆就是当前状态预测出的轨道。',
    notice:
      '比能量决定形状：为负是闭合的 ellipse，为零是 parabola，为正就沿 hyperbola 逃逸。角动量保持不变，这正是为什么天体在相等时间里扫过相等面积。',
  },
  {
    slug: 'wave-interference',
    href: '/physics/wave-interference/',
    icon: 'ph-wave-sine',
    title: 'Wave Interference',
    eyebrow: '波 · 叠加',
    tagline: '两个相干波源，以及它们相遇处的条纹。',
    description:
      '两个点波源同步发射。在光程差为整数个波长的地方它们相互增强；差半个波长时则相互抵消。右侧的长条就是你在屏上会测到的强度。',
    notice:
      '在画布上拖动可以移动探针。亮条纹落在光程差为 0、λ、2λ… 的地方；拉大波源间距会把条纹挤到一起，跟 double-slit 实验里一模一样。',
  },
  {
    slug: 'electric-field',
    href: '/physics/electric-field/',
    icon: 'ph-lightning',
    title: 'Electric Field',
    eyebrow: '场 · 静电学',
    tagline: '放下点电荷，看场在它们周围成形。',
    description:
      '在平面上丢下正负电荷。streamline 描出场的走向——从正电荷出发、进入负电荷——背景的明暗是电势，等势线就画在电势齐平的地方。',
    notice:
      '电场线永不相交，而且总是与等势线垂直相交。场是电势的 gradient，所以颜色变化越陡，场就越强。拖动一个电荷，看每条线瞬间重新连接。',
  },
  {
    slug: 'fourier-epicycles',
    href: '/physics/fourier-epicycles/',
    icon: 'ph-spiral',
    title: 'Fourier Epicycles',
    eyebrow: 'Fourier series · 旋转矢量',
    tagline: '一串旋转的圆，能画出你给它的任意形状。',
    description:
      'Fourier series 的每一项都是一个旋转矢量；把它们首尾相接，最末端的尖就描出一条曲线。多加几项，原本晃动的近似就会咬合到目标上——方波、锯齿波、阶跃。',
    notice:
      '又大又慢的圆负责整体形状，又小又快的圆补上尖锐的拐角。这就是 spectrum 的全部精髓：任何周期信号都是一堆纯旋转之和，而各项系数说明了每个频率占多少。',
  },
  {
    slug: 'ideal-gas',
    href: '/physics/ideal-gas/',
    icon: 'ph-thermometer-simple',
    title: 'Kinetic Theory',
    eyebrow: '热力学 · 分子运动论',
    tagline: '几百个相撞的圆盘，以及从混沌里浮现的秩序。',
    description:
      '一盒硬圆盘彼此之间、与盒壁之间都做弹性碰撞。每次碰撞实际上都是随机的，可它们的速率分布最终会落到 Maxwell–Boltzmann 曲线上——直方图实时跟着它走。',
    notice:
      '温度不过是平均动能。给气体加热，整条速率分布就会整体右移并展宽；压强读数是粒子撞击盒壁的稳定鼓点，PV = NkT 正是从这里来的。',
  },
  {
    slug: 'coupled-oscillators',
    href: '/physics/coupled-oscillators/',
    icon: 'ph-waveform',
    title: 'Coupled Oscillators',
    eyebrow: '力学 · 简正模',
    tagline: '一排连在弹簧上的小球，以及藏在里面的纯净 mode。',
    description:
      '一串用弹簧连起来的小球。再杂乱的运动，也都是一组 normal mode 之和——在每个 mode 里，所有小球以同一个共享频率振动。激发单个 mode，它就保持纯净；混入两个，就能看到拍频出现。',
    notice:
      'N 个小球的系统恰好有 N 个 normal mode。最低的那个里所有小球一起动；最高的那个里相邻小球互相对着干。这是振动弦的离散版表亲，也是通往 phonon 和能带结构的门户。',
  },
  {
    slug: 'diffraction',
    href: '/physics/diffraction/',
    icon: 'ph-circles-three',
    title: 'Diffraction',
    eyebrow: '波 · 衍射',
    tagline: '让一束波穿过狭缝，读出它画出的图样。',
    description:
      '光穿过单缝、双缝，或一道光栅。屏上的强度是缝口上每一点的干涉叠加（Huygens），曲线会随着你拉宽缝、增加缝数、改变波长而实时更新。',
    notice:
      '把缝收窄，图样反而铺开——衍射其实是 uncertainty principle 的化身。缝越多，亮条纹就越被锐化成细线，这正是 diffraction grating 能把光分解成精密 spectrum 的原因。',
  },
  {
    slug: 'charged-particle',
    href: '/physics/charged-particle/',
    icon: 'ph-atom',
    title: 'Charged Particle',
    eyebrow: '电磁学 · Lorentz force',
    tagline: '一个电荷在电场和磁场中弯曲前行。',
    description:
      '一个带电粒子在 Lorentz force F = q(E + v × B) 作用下运动。青色箭头是速度，琥珀色箭头是力。纯磁场把路径弯成圆；加上电场，这个圆就会向侧边漂移。',
    notice:
      '磁力始终垂直于速度，所以它只改变粒子方向、不改变速率——纯圆周运动。正交的 E 场和 B 场会产生 v = E / B 的稳定漂移，与电荷或质量都无关。',
  },
  {
    slug: 'three-body',
    href: '/physics/three-body/',
    icon: 'ph-orbit',
    title: 'Three-Body Problem',
    eyebrow: '引力 · 混沌',
    tagline: '三个天体彼此牵引，没有闭式解轨道。',
    description:
      '三个天体在彼此的引力下一同积分。和两体不同，这里没有通用的闭式解——从著名的 figure-eight 编排出发，或者轻轻一拨，看运动如何跌入混沌。',
    notice:
      '起点上微小的改动就把系统送上天差地别的路径——敏感依赖，正是混沌的标志。figure-eight 是少数稳定的周期解之一；大多数初始条件最终都会把某个天体甩飞出去。',
  },
  {
    slug: 'lens-optics',
    href: '/physics/lens-optics/',
    icon: 'ph-magnifying-glass',
    title: 'Lenses & Refraction',
    eyebrow: '光学 · 光线追踪',
    tagline: '让光线穿过透镜弯折，看像如何成形。',
    description:
      '从物体发出的光线在薄透镜处折射，会聚成像。拖动物体或改变焦距，光线就会实时重描——展现实像与虚像、放大率，以及从会聚到发散的切换。',
    notice:
      '三条特殊光线定下像的位置：一条过镜心不偏折，一条先平行入射再过远焦点，一条先过近焦点再平行射出。当物体越过焦点，像就从倒立实像翻转为正立虚像。',
  },
];

export function findPhysicsLab(slug: string): PhysicsLabEntry | undefined {
  return physicsLabCatalog.find((entry) => entry.slug === slug);
}
