// Single source of truth for the physics labs. Each simulation is now rendered
// through locale-aware dynamic pages; adding a new one is: write its module,
// add its localized metadata here, then add its controls in physics-lab-pages.

import {
  defaultPhysicsLabLocale,
  getLocalizedPhysicsLabPath,
  normalizePhysicsLabLocale,
  type PhysicsLabLocale,
} from './physics-lab-i18n';

export type LocalizedPhysicsLabText = {
  title: string;
  eyebrow: string;
  tagline: string;
  description: string;
  notice: string;
};

export type PhysicsLabDefinition = {
  slug: string;
  icon: string;
  text: Record<PhysicsLabLocale, LocalizedPhysicsLabText>;
};

export type PhysicsLabEntry = LocalizedPhysicsLabText & {
  slug: string;
  href: string;
  icon: string;
  locale: PhysicsLabLocale;
};

const physicsLabDefinitions: PhysicsLabDefinition[] = [
  {
    slug: 'double-pendulum',
    icon: 'ph-infinity',
    text: {
      zh: {
        title: 'Double Pendulum',
        eyebrow: '混沌 · 非线性动力学',
        tagline: '两根耦合的摆杆，运动出了名地无法预测。',
        description:
          '一套三维金属双摆由 RK4 实时积分，速度箭头和发光轨迹把末端运动留在空间中。紫色孪生摆从相差千分之一度的平行层出发——看它能跟原摆同步多久。',
        notice:
          '拖动空白处旋转机构，就能看清两根摆杆始终在同一运动平面内。把阻尼调到零，总能量近似不变；孪生摆逐渐分离则暴露出对初始条件的敏感依赖。',
      },
      en: {
        title: 'Double Pendulum',
        eyebrow: 'Chaos · nonlinear dynamics',
        tagline: 'Two coupled rods turn tiny initial changes into unpredictable motion.',
        description:
          'An RK4-integrated 3D metal mechanism, with a velocity arrow and luminous tip trail preserving the motion in space. A violet twin starts one-thousandth of a degree away on a parallel layer; watch how long it shadows the original.',
        notice:
          'Orbit the mechanism to see that both rods remain in one motion plane. Set damping to zero and total energy stays nearly fixed; the separating twin exposes sensitive dependence on initial conditions.',
      },
    },
  },
  {
    slug: 'orbit',
    icon: 'ph-planet',
    text: {
      zh: {
        title: 'Orbit Lab',
        eyebrow: '引力 · 有心力',
        tagline: '抛出一个天体，看它画出的 conic section。',
        description:
          '一个天体在平方反比引力下运动。青色箭头是速度，琥珀色箭头是引力——始终指向恒星——那条浅色椭圆就是当前状态预测出的轨道。',
        notice:
          '比能量决定形状：为负是闭合的 ellipse，为零是 parabola，为正就沿 hyperbola 逃逸。角动量保持不变，这正是为什么天体在相等时间里扫过相等面积。',
      },
      en: {
        title: 'Orbit Lab',
        eyebrow: 'Gravity · central forces',
        tagline: 'Launch a body and read the conic section it draws.',
        description:
          'A body moves under inverse-square gravity. The teal arrow is velocity, the amber arrow is the starward pull, and the pale curve is the orbit predicted by the current state.',
        notice:
          'Specific energy sets the shape: negative closes into an ellipse, zero becomes a parabola, and positive escapes along a hyperbola. Angular momentum stays fixed, so equal times sweep equal areas.',
      },
    },
  },
  {
    slug: 'wave-interference',
    icon: 'ph-wave-sine',
    text: {
      zh: {
        title: 'Wave Interference',
        eyebrow: '波 · 叠加',
        tagline: '两个相干波源，以及它们相遇处的条纹。',
        description:
          '两个点波源同步发射，曲面的高度就是瞬时场值。在光程差为整数个波长的地方它们相互增强；差半个波长时则相互抵消。右侧竖屏画出时间平均后的强度。',
        notice:
          '移动指针可以放置探针，拖动空白处则旋转视角。亮条纹落在光程差为 0、λ、2λ… 的地方；拉大波源间距会把条纹挤到一起，跟 double-slit 实验里一模一样。',
      },
      en: {
        title: 'Wave Interference',
        eyebrow: 'Waves · superposition',
        tagline: 'Two coherent sources and the fringes where their waves meet.',
        description:
          'Two point sources emit in sync, with surface height showing the instantaneous field. They reinforce at integer-wavelength path differences and cancel at half wavelengths. The upright screen shows time-averaged intensity.',
        notice:
          'Move the pointer to place the probe, or drag empty space to orbit. Bright fringes land at path differences of 0, lambda, 2 lambda, and so on; increasing source separation squeezes them just like a double-slit experiment.',
      },
    },
  },
  {
    slug: 'electric-field',
    icon: 'ph-lightning',
    text: {
      zh: {
        title: 'Electric Field',
        eyebrow: '场 · 静电学',
        tagline: '放下点电荷，看场在它们周围成形。',
        description:
          '在平面上放下正负电荷。曲面高度和颜色共同表示电势，streamline 描出场从正电荷流向负电荷的方向，等势线则沿相同高度环绕。',
        notice:
          '电场线永不相交，而且总是与等势线垂直相交。场是电势的 gradient，所以颜色变化越陡，场就越强。拖动一个电荷，看每条线瞬间重新连接。',
      },
      en: {
        title: 'Electric Field',
        eyebrow: 'Fields · electrostatics',
        tagline: 'Place point charges and watch the field form around them.',
        description:
          'Place positive and negative charges on the plane. Surface height and color encode electric potential, streamlines run from positive to negative, and equipotentials wrap around equal heights.',
        notice:
          'Electric field lines never cross, and they meet equipotential lines at right angles. The field is the gradient of potential, so steeper color changes mean stronger field. Drag a charge to see every line reconnect.',
      },
    },
  },
  {
    slug: 'fourier-epicycles',
    icon: 'ph-spiral',
    text: {
      zh: {
        title: 'Fourier Epicycles',
        eyebrow: 'Fourier series · 旋转矢量',
        tagline: '一串旋转的圆，能画出你给它的任意形状。',
        description:
          'Fourier series 的每一项都是一个旋转矢量；把它们首尾相接，最末端的尖就描出一条曲线。多加几项，原本晃动的近似就会咬合到目标上——方波、锯齿波、阶跃。',
        notice:
          '又大又慢的圆负责整体形状，又小又快的圆补上尖锐的拐角。这就是 spectrum 的全部精髓：任何周期信号都是一堆纯旋转之和，而各项系数说明了每个频率占多少。',
      },
      en: {
        title: 'Fourier Epicycles',
        eyebrow: 'Fourier series · rotating vectors',
        tagline: 'A chain of rotating circles can sketch almost any periodic shape.',
        description:
          'Each Fourier term is a rotating vector. Connect them head to tail and the final tip traces a curve; add more terms and a wobbly approximation locks onto the target wave.',
        notice:
          'Large, slow circles carry the broad shape; small, fast circles fill in sharp corners. That is the heart of a spectrum: any periodic signal is a stack of pure rotations, and the coefficients say how much each frequency contributes.',
      },
    },
  },
  {
    slug: 'ideal-gas',
    icon: 'ph-thermometer-simple',
    text: {
      zh: {
        title: 'Kinetic Theory',
        eyebrow: '热力学 · 分子运动论',
        tagline: '几百个相撞的硬球，以及从混沌里浮现的秩序。',
        description:
          '一盒三维硬球彼此之间、与六面盒壁之间都做弹性碰撞。单次碰撞看似随机，可它们的速率分布最终会落到三维 Maxwell–Boltzmann 曲线上——旁边的直方图实时跟着它走。',
        notice:
          '三维气体满足 ⟨KE⟩ = 3kT/2。给气体加热，整条速率分布会右移并展宽；压强读数是粒子撞击六面盒壁的稳定鼓点，PV = NkT 正是从这里来的。',
      },
      en: {
        title: 'Kinetic Theory',
        eyebrow: 'Thermodynamics · molecular motion',
        tagline: 'Hundreds of colliding spheres, with order emerging from chaos.',
        description:
          'Hard spheres bounce elastically off one another and all six box walls. Individual collisions look random, but their speeds settle toward the 3D Maxwell-Boltzmann distribution tracked by the live histogram.',
        notice:
          'A 3D gas obeys <KE> = 3kT/2. Heat it and the speed distribution shifts right and broadens; the pressure readout is the steady drumbeat of particles hitting all six walls, where PV = NkT comes from.',
      },
    },
  },
  {
    slug: 'coupled-oscillators',
    icon: 'ph-waveform',
    text: {
      zh: {
        title: 'Coupled Oscillators',
        eyebrow: '力学 · 简正模',
        tagline: '一排连在弹簧上的小球，以及藏在里面的纯净 mode。',
        description:
          '一串真正卷成螺旋的三维弹簧连接着小球，速度箭头标出每颗球下一刻的方向，悬浮的正弦曲线则显出藏在运动里的 normal mode。激发单个 mode，它会保持纯净；混入两个，就能看到拍频出现。',
        notice:
          '旋转视角可以看清弹簧怎样随横向位移拉伸。N 个小球恰好有 N 个 normal mode：最低模里所有小球一起动，最高模里相邻小球互相对着干。',
      },
      en: {
        title: 'Coupled Oscillators',
        eyebrow: 'Mechanics · normal modes',
        tagline: 'A row of spring-linked masses and the clean modes hidden inside.',
        description:
          'True 3D spring coils connect the masses, velocity arrows show where each bead is heading, and floating sine curves expose the normal modes hidden in the motion. Excite one mode and it stays pure; mix two and beats appear.',
        notice:
          'Orbit the view to see each spring stretch with transverse displacement. A system with N masses has exactly N normal modes: all masses move together in the lowest, while neighbors oppose each other in the highest.',
      },
    },
  },
  {
    slug: 'diffraction',
    icon: 'ph-circles-three',
    text: {
      zh: {
        title: 'Diffraction',
        eyebrow: '波 · 衍射',
        tagline: '让一束波穿过狭缝，读出它画出的图样。',
        description:
          '在三维光学台上，入射波穿过单缝、双缝或光栅，再展开到发光屏幕。屏上的彩色条纹和浮起的强度曲线会随缝宽、缝数与波长实时重排。',
        notice:
          '彩色光线标出可见的衍射级次，虚线曲线给出单缝包络。把缝收窄，图样反而铺开；增加缝数，亮纹就被锐化成光栅式的细线。',
      },
      en: {
        title: 'Diffraction',
        eyebrow: 'Waves · diffraction',
        tagline: 'Send a wave through slits and read the pattern it paints.',
        description:
          'On a 3D optical bench, an incident wave passes through one slit, two slits, or a grating and spreads onto a luminous screen. Colored fringes and a raised intensity profile rearrange as slit width, count, and wavelength change.',
        notice:
          'Colored paths mark visible diffraction orders while the dashed curve gives the single-slit envelope. Narrowing a slit spreads the pattern; adding slits sharpens bright fringes into grating-like lines.',
      },
    },
  },
  {
    slug: 'charged-particle',
    icon: 'ph-atom',
    text: {
      zh: {
        title: 'Charged Particle',
        eyebrow: '电磁学 · Lorentz force',
        tagline: '一个电荷在电场和磁场中弯曲前行。',
        description:
          '一个带电粒子在 Lorentz force F = q(E + v × B) 作用下运动。青色箭头是速度，琥珀色箭头是力。纯磁场把路径弯成圆；加上电场，这个圆就会向侧边漂移。',
        notice:
          '磁力始终垂直于速度，所以它只改变粒子方向、不改变速率——纯圆周运动。正交的 E 场和 B 场会产生 v = E / B 的稳定漂移，与电荷或质量都无关。',
      },
      en: {
        title: 'Charged Particle',
        eyebrow: 'Electromagnetism · Lorentz force',
        tagline: 'A charged particle bends through electric and magnetic fields.',
        description:
          'A particle moves under the Lorentz force F = q(E + v x B). The teal arrow is velocity and the amber arrow is force. A pure magnetic field curves the path into a circle; add an electric field and the circle drifts sideways.',
        notice:
          'Magnetic force is always perpendicular to velocity, so it changes direction without changing speed: pure circular motion. Crossed E and B fields produce a steady v = E / B drift that does not depend on charge or mass.',
      },
    },
  },
  {
    slug: 'three-body',
    icon: 'ph-orbit',
    text: {
      zh: {
        title: 'Three-Body Problem',
        eyebrow: '引力 · 混沌',
        tagline: '三个天体彼此牵引，没有闭式解轨道。',
        description:
          '三个天体在彼此的引力下一同积分。和两体不同，这里没有通用的闭式解——从著名的 figure-eight 编排出发，或者轻轻一拨，看运动如何跌入混沌。',
        notice:
          '起点上微小的改动就把系统送上天差地别的路径——敏感依赖，正是混沌的标志。figure-eight 是少数稳定的周期解之一；大多数初始条件最终都会把某个天体甩飞出去。',
      },
      en: {
        title: 'Three-Body Problem',
        eyebrow: 'Gravity · chaos',
        tagline: 'Three bodies pull on one another, with no general closed-form orbit.',
        description:
          'Three bodies are integrated under mutual gravity. Unlike the two-body case, there is no universal closed-form solution. Start from the famous figure-eight choreography, or nudge it and watch the motion fall into chaos.',
        notice:
          'Tiny starting changes send the system down wildly different paths, which is the signature of chaos. The figure-eight is one of the rare stable periodic solutions; most initial conditions eventually fling one body away.',
      },
    },
  },
  {
    slug: 'lens-optics',
    icon: 'ph-magnifying-glass',
    text: {
      zh: {
        title: 'Lenses & Refraction',
        eyebrow: '光学 · 光线追踪',
        tagline: '让光线穿过透镜弯折，看像如何成形。',
        description:
          '透明的三维透镜会随焦距符号在凸面与凹面间切换，三束主光线在空间中折射并定位像。拖动物体箭头或改变焦距，实像、虚像与放大率都会实时更新。',
        notice:
          '拖动空白处旋转视角，拖动绿色物体箭头改变物距与物高。物体越过焦点时，三束光的反向虚线延长线会汇成正立虚像。',
      },
      en: {
        title: 'Lenses & Refraction',
        eyebrow: 'Optics · ray tracing',
        tagline: 'Bend rays through a lens and watch an image take shape.',
        description:
          'A transparent 3D lens changes from convex to concave with the focal-length sign, while three spatial principal rays refract to locate the image. Drag the object arrow or change focal length to update real and virtual images in place.',
        notice:
          'Drag empty space to orbit, or drag the green object arrow to change its distance and height. When the object crosses the focus, dashed backward extensions meet at the upright virtual image.',
      },
    },
  },
];

function toPhysicsLabEntry(
  definition: PhysicsLabDefinition,
  locale: PhysicsLabLocale,
): PhysicsLabEntry {
  return {
    slug: definition.slug,
    href: getLocalizedPhysicsLabPath(definition.slug, locale),
    icon: definition.icon,
    locale,
    ...definition.text[locale],
  };
}

export function getPhysicsLabCatalog(locale = defaultPhysicsLabLocale): PhysicsLabEntry[] {
  const normalizedLocale = normalizePhysicsLabLocale(locale);
  return physicsLabDefinitions.map((definition) => toPhysicsLabEntry(definition, normalizedLocale));
}

export function getPhysicsLabSlugs(): string[] {
  return physicsLabDefinitions.map((definition) => definition.slug);
}

export function findPhysicsLab(
  slug: string,
  locale = defaultPhysicsLabLocale,
): PhysicsLabEntry | undefined {
  const normalizedLocale = normalizePhysicsLabLocale(locale);
  const definition = physicsLabDefinitions.find((entry) => entry.slug === slug);
  return definition ? toPhysicsLabEntry(definition, normalizedLocale) : undefined;
}

export const physicsLabCatalog = getPhysicsLabCatalog(defaultPhysicsLabLocale);
