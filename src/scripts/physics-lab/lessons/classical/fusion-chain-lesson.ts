import { definePhysicsLabLesson } from '../physics-lab-lesson-types';

export const fusionChainLesson = definePhysicsLabLesson({
  zh: {
    title: '恒星核合成：为什么演化走向铁峰',
    background: '原子核每个核子的结合能随质量数先快速上升，在铁峰附近达到最大。轻核结合成更紧的核时释放质量亏损，但越过铁峰继续聚变反而需要输入能量。',
    motivation: '恒星的亮度、寿命、分层结构与最终命运都由这条能量地形控制。太阳只进行氢燃烧，而大质量恒星能依次点燃更高温、更短暂的燃烧阶段。',
    focusQuestion: '为什么恒星不是从氢一步聚变成铁，而必须经历越来越热、越来越快的多阶段燃烧？',
    keyInsight: '每增加一次核电荷，库仑势垒都更难穿透；前一阶段燃料耗尽后核心收缩升温，才可能打开下一组反应。铁峰停止提供新的收缩支撑。',
    formulas: [
      { title: '质量亏损释放能量', expressionLatex: String.raw`Q=(m_{\rm initial}-m_{\rm final})c^2`, explanation: '产物总质量更小时 Q>0，减少的静质量转化为粒子动能、光子和中微子能量。' },
      { title: '库仑势垒尺度', expressionLatex: String.raw`V_C(r)\approx\frac{Z_1Z_2e^2}{4\pi\varepsilon_0r}`, explanation: '核电荷越大，经典排斥越强，因此碳、氧、硅燃烧要求依次更高的核心温度。' },
    ],
    commonDifficulties: [
      { title: '元素顺序不是简单加一个质子', misconception: '恒星按元素周期表逐个合成所有元素。', resolution: '实际是分支反应网络；图中只保留主导燃烧阶段和代表性产物，许多同位素与副反应被省略。' },
      { title: '铁不是硅直接聚变一次得到', misconception: '硅燃烧就是两个硅核碰撞成铁核。', resolution: '高温下发生光致蜕变、俘获和核统计平衡，先富集 ⁵⁶Ni；它随后经放射性衰变走向 ⁵⁶Fe。' },
    ],
    steps: [
      { title: '验证类太阳恒星的终点', instruction: '选择“类太阳恒星”，逐步推进。', observation: '低质量与低温阻止碳燃烧；并非每颗恒星都能制造铁。' },
      { title: '打开大质量恒星反应链', instruction: '选择“大质量恒星”，依次点击下一阶段。', observation: '质量门槛满足，但仍需足够温度逐步点燃碳、氖、氧和硅燃烧。' },
      { title: '读结合能曲线', instruction: '推进到铁峰并观察红色标记。', observation: '每个放能阶段都沿单位核子结合能上坡移动；到铁后继续聚变不再提供能量。' },
    ],
    takeaway: '恒星演化不是一条反应式，而是“燃料耗尽 → 收缩升温 → 点燃下一阶段”的反馈链；铁峰终止这套放能机制。',
  },
  en: {
    title: 'Stellar nucleosynthesis: why evolution moves toward the iron peak',
    background: 'Binding energy per nucleon rises rapidly with mass number and peaks near iron. Combining light nuclei into more tightly bound products releases mass deficit, but fusion beyond the peak requires energy.',
    motivation: 'This energy landscape controls stellar luminosity, lifetime, shell structure, and fate. The Sun burns only light fuels, while massive stars ignite progressively hotter and shorter stages.',
    focusQuestion: 'Why can a star not fuse hydrogen directly into iron, instead passing through increasingly hot multi-stage burning?',
    keyInsight: 'Each increase in nuclear charge raises the Coulomb barrier. Exhausting one fuel lets the core contract and heat until the next reaction network opens; the iron peak ends this source of support.',
    formulas: [
      { title: 'Mass deficit releases energy', expressionLatex: String.raw`Q=(m_{\rm initial}-m_{\rm final})c^2`, explanation: 'When final rest mass is lower, Q is positive and the difference becomes particle kinetic energy, photons, and neutrinos.' },
      { title: 'Coulomb barrier scale', expressionLatex: String.raw`V_C(r)\approx\frac{Z_1Z_2e^2}{4\pi\varepsilon_0r}`, explanation: 'Larger nuclear charges repel more strongly, so carbon, oxygen, and silicon burning require successively hotter cores.' },
    ],
    commonDifficulties: [
      { title: 'The sequence is not one proton at a time', misconception: 'A star synthesizes every element in periodic-table order.', resolution: 'The real process is a branching reaction network. This lab keeps dominant burning stages and representative products while omitting many isotopes and side reactions.' },
      { title: 'Silicon does not fuse directly into iron once', misconception: 'Silicon burning is simply two silicon nuclei colliding into one iron nucleus.', resolution: 'Photodisintegration, captures, and nuclear statistical equilibrium first favor ⁵⁶Ni, which later decays through cobalt toward ⁵⁶Fe.' },
    ],
    steps: [
      { title: 'Test the endpoint of a Sun-like star', instruction: 'Choose Sun-like star and advance the chain.', observation: 'Low mass and temperature block carbon burning; not every star manufactures iron.' },
      { title: 'Open the massive-star chain', instruction: 'Choose Massive star and click through successive stages.', observation: 'The mass gate is met, but sufficient temperature is still required to ignite carbon, neon, oxygen, and silicon burning.' },
      { title: 'Read the binding-energy curve', instruction: 'Advance toward the iron peak and follow the red marker.', observation: 'Every exothermic stage climbs in binding energy per nucleon; beyond iron, fusion no longer supplies energy.' },
    ],
    takeaway: 'Stellar evolution is a feedback chain of fuel exhaustion, contraction, heating, and ignition. The iron peak terminates that exothermic mechanism.',
  },
});
