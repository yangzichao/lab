import type { PhysicsLabLocale } from '../physics-lab-i18n';
import type { LigoSceneId } from './ligo-scene-types';

export type LigoCausalStep = {
  label: string;
  detail: string;
};

export type LigoVariableDefinition = {
  symbolLatex: string;
  definition: string;
};

export type LigoScientificExplanation = {
  question: string;
  answer: string;
  causalSteps: LigoCausalStep[];
  equationLatex: string;
  equationAriaLabel: string;
  variables: LigoVariableDefinition[];
  modelBoundary: string;
};

const scientificCopy: Record<
  PhysicsLabLocale,
  Record<LigoSceneId, LigoScientificExplanation>
> = {
  zh: {
    spacetime: {
      question: '图里的小球为什么会变成椭圆？',
      answer:
        '把小球想成彼此不相连、正在自由落体的测试质量。引力波从垂直于圆环的方向穿过时，小球并不是被某种风推着跑；改变的是它们之间的固有距离。+ 偏振让两个垂直方向一伸一缩，× 偏振是同一个形变旋转 45°。',
      causalSteps: [
        { label: '波穿过', detail: '横向的时空度规发生周期扰动' },
        { label: '距离改变', detail: 'x 方向变长时，y 方向同时变短' },
        { label: '圆环变形', detail: '半个周期后长短轴交换' },
      ],
      equationLatex:
        '\\begin{aligned} L_x(t) &\\approx L\\left[1 + \\frac{1}{2}h_{+}(t)\\right] \\\\ L_y(t) &\\approx L\\left[1 - \\frac{1}{2}h_{+}(t)\\right] \\end{aligned}',
      equationAriaLabel:
        'L x of t is approximately L times one plus one half h plus of t. L y of t is approximately L times one minus one half h plus of t.',
      variables: [
        { symbolLatex: 'L', definition: '没有引力波时的基准距离' },
        { symbolLatex: 'h_{+}(t)', definition: '+ 偏振的无量纲应变' },
        { symbolLatex: 'L_x,\\,L_y', definition: '两个垂直方向上的固有距离' },
      ],
      modelBoundary:
        '这里采用长波极限和 TT gauge 的标准教学图像；动画把应变夸大了约 10²⁰ 倍。测试质量的坐标可以保持不变，但固有距离会改变。',
    },
    arms: {
      question: '为什么一定要用两条互相垂直的长臂？',
      answer:
        'LIGO 不尝试测量某一面镜子的绝对位移，而是比较两条臂。对准双臂的 + 偏振经过时，x 臂增加 δLₓ，y 臂同时减少 δLᵧ。两个反号变化相减后会相加，而激光频率漂移等共同变化会被大幅抵消。',
      causalSteps: [
        { label: '端镜近似自由质量', detail: '多级悬挂隔离地面振动' },
        { label: '双臂反相响应', detail: '+δL 与 −δL 同时出现' },
        { label: '读取长度差', detail: '差分测量保留引力波，抑制共模噪声' },
      ],
      equationLatex:
        '\\begin{aligned} \\Delta L_{\\mathrm{diff}} &\\equiv \\delta L_x - \\delta L_y = h_{+}L \\\\ h_{+} &= \\frac{\\Delta L_{\\mathrm{diff}}}{L} \\end{aligned}',
      equationAriaLabel:
        'Delta L differential equals delta L x minus delta L y equals h plus times L. h plus equals delta L differential divided by L.',
      variables: [
        { symbolLatex: 'L', definition: '每条臂的基准长度，LIGO 为 4 km' },
        { symbolLatex: '\\Delta L_{\\mathrm{diff}}', definition: '两条臂的差分长度变化' },
        { symbolLatex: 'h_{+}', definition: '与双臂方向对齐时的 + 偏振应变' },
      ],
      modelBoundary:
        '公式对应“引力波垂直入射且 + 偏振与双臂对齐”的最清楚情形。一般天空方向与偏振需要乘上探测器响应 F₊、F×。',
    },
    laser: {
      question: '光为什么能把长度变化变成可测量的量？',
      answer:
        '激光具有稳定的波长和相位，因此可以当作光学尺。Beam splitter 从同一束相干光产生两条路径；光在端镜反射后回到分束镜。路径稍微变长，就会多积累一点相位，最终只需比较两束返回光的相对相位。',
      causalSteps: [
        { label: '同源分束', detail: '两束光拥有共同的初始相位' },
        { label: '分别往返', detail: '每束光记录对应臂的光程' },
        { label: '重新合束', detail: '返回光的相位差携带 ΔLdiff' },
      ],
      equationLatex:
        '\\begin{aligned} \\phi_{\\mathrm{rt}} &= \\frac{4\\pi L}{\\lambda} \\\\ \\Delta\\phi &= \\frac{4\\pi(L_x - L_y)}{\\lambda} \\end{aligned}',
      equationAriaLabel:
        'The round trip phase phi equals four pi L over lambda. Delta phi equals four pi times L x minus L y over lambda.',
      variables: [
        { symbolLatex: '\\lambda', definition: '激光真空波长' },
        { symbolLatex: '\\phi_{\\mathrm{rt}}', definition: '一次往返积累的光学相位' },
        { symbolLatex: '\\Delta\\phi', definition: '两条返回光之间的相位差' },
      ],
      modelBoundary:
        '这一幕先使用简单 Michelson interferometer。真实 LIGO 的 arm cavity 会让光重复采样同一臂，第五幕再加入这个增益。',
    },
    'dark-port': {
      question: '探测器为什么要从“几乎没有光”开始工作？',
      answer:
        '两条返回光被调到近似反相：一个波峰遇到另一个波谷，输出端口接近黑暗。引力波造成 Δφ 后，相消不再完整，少量光抵达 photodetector。这样暗背景上的微小变化比强光上的同等变化更容易分辨。',
      causalSteps: [
        { label: '接近相消', detail: '无信号时，两束返回光几乎抵消' },
        { label: '产生 Δφ', detail: '差分臂长让一束超前、另一束落后' },
        { label: '输出光变化', detail: 'photodetector 把光功率变成电信号' },
      ],
      equationLatex:
        '\\begin{aligned} E_{\\mathrm{out}} &\\propto E_0\\sin\\left(\\frac{\\Delta\\phi}{2}\\right) \\\\ I_{\\mathrm{out}} &\\propto \\sin^2\\left(\\frac{\\Delta\\phi}{2}\\right) \\end{aligned}',
      equationAriaLabel:
        'Output electric field is proportional to E zero times sine delta phi over two. Output intensity is proportional to sine squared delta phi over two.',
      variables: [
        { symbolLatex: 'E_{\\mathrm{out}}', definition: '输出端的光场振幅' },
        { symbolLatex: 'I_{\\mathrm{out}}', definition: 'photodetector 测得的光强' },
        { symbolLatex: '\\Delta\\phi', definition: '两条返回光的相位差' },
      ],
      modelBoundary:
        '图中先展示理想 dark fringe。Advanced LIGO 实际会引入很小的 DARM offset，让少量载波光充当 local oscillator，从而在线性区读取信号。',
    },
    cavity: {
      question: '4 km 仍然太短时，LIGO 怎样继续放大效应？',
      answer:
        '靠近 beam splitter 的 input test mass 与四公里外的 end test mass 构成 Fabry–Pérot cavity。共振光不会只走一趟就离开，而是在两面镜子之间反射约 300 次。每一次穿越都再次采样臂长，让极小相位变化累积。',
      causalSteps: [
        { label: '光进入共振腔', detail: '只有满足共振条件的场持续叠加' },
        { label: '反复穿越 4 km', detail: '同一个长度变化被重复采样' },
        { label: '相位信号增强', detail: '再返回分束镜进行差分比较' },
      ],
      equationLatex:
        '\\begin{aligned} L_{\\mathrm{effective}} &\\approx N L_{\\mathrm{arm}} \\\\ &\\approx 300 \\times 4\\,\\mathrm{km} \\approx 1200\\,\\mathrm{km} \\end{aligned}',
      equationAriaLabel:
        'Effective optical path is approximately N times the arm length, approximately three hundred times four kilometres, or twelve hundred kilometres.',
      variables: [
        { symbolLatex: 'N', definition: '教学近似中的有效穿越次数，约 300' },
        { symbolLatex: 'L_{\\mathrm{arm}}', definition: '实体 arm cavity 长度，4 km' },
        { symbolLatex: 'L_{\\mathrm{effective}}', definition: '用来理解灵敏度增益的有效光程' },
      ],
      modelBoundary:
        '“1200 km”是直观的路径长度说法；真实 cavity 增益还取决于 finesse、储存时间和引力波频率，不能在所有频率上简单等同于固定 N。',
    },
    detection: {
      question: '最后看到的 chirp 怎样证明来自同一次黑洞并合？',
      answer:
        '双黑洞辐射能量后逐渐靠近，轨道越来越快；主导的四极引力波频率约为轨道频率的两倍，振幅也迅速上升。相同形状的 chirp 先后出现在 Livingston 与 Hanford，而两个地点的本地噪声通常不会复制出同一段相关波形。',
      causalSteps: [
        { label: '轨道收缩', detail: '能量与角动量由引力波带走' },
        { label: '频率、振幅上升', detail: '形成 inspiral 的 chirp' },
        { label: '双站相关', detail: 'GW150914 在两站相差约 7 ms' },
      ],
      equationLatex:
        '\\begin{aligned} f_{\\mathrm{GW}} &\\approx 2f_{\\mathrm{orb}} \\\\ \\Delta t &= \\frac{\\hat{\\mathbf n}\\cdot(\\mathbf r_{\\mathrm H}-\\mathbf r_{\\mathrm L})}{c} \\approx 7\\,\\mathrm{ms} \\end{aligned}',
      equationAriaLabel:
        'Gravitational wave frequency is approximately twice the orbital frequency. Delta t equals n dot the Hanford minus Livingston baseline divided by c, approximately seven milliseconds.',
      variables: [
        { symbolLatex: 'f_{\\mathrm{GW}}', definition: '主导四极引力波的频率' },
        { symbolLatex: 'f_{\\mathrm{orb}}', definition: '双星轨道频率' },
        { symbolLatex: '\\Delta t', definition: '同一波前抵达两站的时间差' },
      ],
      modelBoundary:
        '画面中的 chirp 是教学波形，不是原始探测器数据。真实分析会校准 strain、估计噪声，并用完整 waveform model 与探测器网络做统计推断。',
    },
  },
  en: {
    spacetime: {
      question: 'Why does the ring of masses become an ellipse?',
      answer:
        'Treat the dots as disconnected test masses in free fall. A gravitational wave arriving perpendicular to the ring does not blow them outward; it changes their proper separations. Plus polarization stretches one transverse axis while squeezing the other. Cross polarization is the same pattern rotated by 45 degrees.',
      causalSteps: [
        { label: 'The wave passes', detail: 'The transverse spacetime metric oscillates' },
        { label: 'Distances change', detail: 'x grows while y shrinks' },
        { label: 'The ring deforms', detail: 'The long and short axes swap half a cycle later' },
      ],
      equationLatex:
        '\\begin{aligned} L_x(t) &\\approx L\\left[1 + \\frac{1}{2}h_{+}(t)\\right] \\\\ L_y(t) &\\approx L\\left[1 - \\frac{1}{2}h_{+}(t)\\right] \\end{aligned}',
      equationAriaLabel:
        'L x of t is approximately L times one plus one half h plus of t. L y of t is approximately L times one minus one half h plus of t.',
      variables: [
        { symbolLatex: 'L', definition: 'Reference separation with no wave' },
        { symbolLatex: 'h_{+}(t)', definition: 'Dimensionless plus-polarized strain' },
        { symbolLatex: 'L_x,\\,L_y', definition: 'Proper separations along two transverse axes' },
      ],
      modelBoundary:
        'This is the standard long-wavelength, TT-gauge teaching picture. The animation exaggerates strain by roughly 10²⁰. Coordinate positions may remain fixed while proper distances change.',
    },
    arms: {
      question: 'Why use two long, perpendicular arms?',
      answer:
        'LIGO does not try to measure the absolute displacement of one mirror. It compares two arms. For a plus-polarized wave aligned with the detector, one arm gains δL while the other loses δL. Subtracting the opposite responses adds the signal while suppressing common changes such as laser-frequency drift.',
      causalSteps: [
        { label: 'End mirrors approximate free masses', detail: 'Multi-stage suspensions isolate ground motion' },
        { label: 'The arms respond oppositely', detail: '+δL and −δL appear together' },
        { label: 'Read the difference', detail: 'Differential sensing retains strain and rejects common motion' },
      ],
      equationLatex:
        '\\begin{aligned} \\Delta L_{\\mathrm{diff}} &\\equiv \\delta L_x - \\delta L_y = h_{+}L \\\\ h_{+} &= \\frac{\\Delta L_{\\mathrm{diff}}}{L} \\end{aligned}',
      equationAriaLabel:
        'Delta L differential equals delta L x minus delta L y equals h plus times L. h plus equals delta L differential divided by L.',
      variables: [
        { symbolLatex: 'L', definition: 'Reference arm length; 4 km at LIGO' },
        { symbolLatex: '\\Delta L_{\\mathrm{diff}}', definition: 'Differential change between the arms' },
        { symbolLatex: 'h_{+}', definition: 'Plus strain aligned with the arms' },
      ],
      modelBoundary:
        'The equation shows the clearest case: normal incidence with plus polarization aligned to the arms. A general sky direction and polarization introduce detector responses F₊ and F×.',
    },
    laser: {
      question: 'How does light turn a length change into something measurable?',
      answer:
        'A laser has a stable wavelength and phase, so it acts as an optical ruler. The beam splitter creates two paths from the same coherent field. After reflection from the end mirrors, an extra path length appears as extra optical phase. Only the relative phase of the returning beams must be compared.',
      causalSteps: [
        { label: 'Split one source', detail: 'Both beams begin with a common phase' },
        { label: 'Make two round trips', detail: 'Each beam records one arm’s optical path' },
        { label: 'Recombine', detail: 'Relative phase carries ΔLdiff' },
      ],
      equationLatex:
        '\\begin{aligned} \\phi_{\\mathrm{rt}} &= \\frac{4\\pi L}{\\lambda} \\\\ \\Delta\\phi &= \\frac{4\\pi(L_x - L_y)}{\\lambda} \\end{aligned}',
      equationAriaLabel:
        'The round trip phase phi equals four pi L over lambda. Delta phi equals four pi times L x minus L y over lambda.',
      variables: [
        { symbolLatex: '\\lambda', definition: 'Laser wavelength in vacuum' },
        { symbolLatex: '\\phi_{\\mathrm{rt}}', definition: 'Optical phase accumulated in one round trip' },
        { symbolLatex: '\\Delta\\phi', definition: 'Phase difference between the returning beams' },
      ],
      modelBoundary:
        'This scene begins with a simple Michelson interferometer. Real LIGO arm cavities make the light sample an arm repeatedly; scene five adds that gain.',
    },
    'dark-port': {
      question: 'Why begin with an output that is almost dark?',
      answer:
        'The returning beams are tuned nearly out of phase, so a crest from one meets a trough from the other and the output port is almost dark. A gravitational-wave phase shift makes the cancellation incomplete, sending a small amount of light to the photodetector.',
      causalSteps: [
        { label: 'Near cancellation', detail: 'With no signal, the returning fields almost cancel' },
        { label: 'Create Δφ', detail: 'Differential arm length advances one phase and delays the other' },
        { label: 'Output power changes', detail: 'A photodetector converts light power to an electrical signal' },
      ],
      equationLatex:
        '\\begin{aligned} E_{\\mathrm{out}} &\\propto E_0\\sin\\left(\\frac{\\Delta\\phi}{2}\\right) \\\\ I_{\\mathrm{out}} &\\propto \\sin^2\\left(\\frac{\\Delta\\phi}{2}\\right) \\end{aligned}',
      equationAriaLabel:
        'Output electric field is proportional to E zero times sine delta phi over two. Output intensity is proportional to sine squared delta phi over two.',
      variables: [
        { symbolLatex: 'E_{\\mathrm{out}}', definition: 'Optical field amplitude at the output port' },
        { symbolLatex: 'I_{\\mathrm{out}}', definition: 'Light intensity measured by the photodetector' },
        { symbolLatex: '\\Delta\\phi', definition: 'Phase difference between the returning beams' },
      ],
      modelBoundary:
        'The picture first shows an ideal dark fringe. Advanced LIGO introduces a tiny DARM offset so a small carrier field acts as a local oscillator and provides a linear DC readout.',
    },
    cavity: {
      question: 'When 4 km is still too short, how does LIGO gain more signal?',
      answer:
        'The input test mass near the beam splitter and the end test mass 4 km away form a Fabry–Pérot cavity. Resonant light does not leave after one trip; it reflects between the mirrors about 300 times. Each traversal samples the arm length again, accumulating the tiny phase effect.',
      causalSteps: [
        { label: 'Enter a resonant cavity', detail: 'Fields satisfying the resonance condition build up' },
        { label: 'Traverse 4 km repeatedly', detail: 'The same arm change is sampled many times' },
        { label: 'Enhance phase response', detail: 'The stored field returns for differential comparison' },
      ],
      equationLatex:
        '\\begin{aligned} L_{\\mathrm{effective}} &\\approx N L_{\\mathrm{arm}} \\\\ &\\approx 300 \\times 4\\,\\mathrm{km} \\approx 1200\\,\\mathrm{km} \\end{aligned}',
      equationAriaLabel:
        'Effective optical path is approximately N times the arm length, approximately three hundred times four kilometres, or twelve hundred kilometres.',
      variables: [
        { symbolLatex: 'N', definition: 'Effective traversal count in this teaching approximation, about 300' },
        { symbolLatex: 'L_{\\mathrm{arm}}', definition: 'Physical arm-cavity length, 4 km' },
        { symbolLatex: 'L_{\\mathrm{effective}}', definition: 'Intuitive effective optical path' },
      ],
      modelBoundary:
        'The 1200 km figure is path-length intuition. Real cavity gain also depends on finesse, storage time, and gravitational-wave frequency; it is not a fixed N at every frequency.',
    },
    detection: {
      question: 'How does the chirp show that both sites saw the same merger?',
      answer:
        'As a binary loses energy, its orbit shrinks and speeds up. The dominant quadrupole gravitational-wave frequency is about twice the orbital frequency, and its amplitude rises rapidly. The same chirp shape appears at Livingston and Hanford, while local instrument noise is not expected to reproduce a correlated waveform at both sites.',
      causalSteps: [
        { label: 'The orbit shrinks', detail: 'Gravitational waves carry away energy and angular momentum' },
        { label: 'Frequency and amplitude rise', detail: 'The inspiral becomes a chirp' },
        { label: 'Two sites correlate', detail: 'GW150914 arrived about 7 ms apart' },
      ],
      equationLatex:
        '\\begin{aligned} f_{\\mathrm{GW}} &\\approx 2f_{\\mathrm{orb}} \\\\ \\Delta t &= \\frac{\\hat{\\mathbf n}\\cdot(\\mathbf r_{\\mathrm H}-\\mathbf r_{\\mathrm L})}{c} \\approx 7\\,\\mathrm{ms} \\end{aligned}',
      equationAriaLabel:
        'Gravitational wave frequency is approximately twice the orbital frequency. Delta t equals n dot the Hanford minus Livingston baseline divided by c, approximately seven milliseconds.',
      variables: [
        { symbolLatex: 'f_{\\mathrm{GW}}', definition: 'Dominant quadrupole gravitational-wave frequency' },
        { symbolLatex: 'f_{\\mathrm{orb}}', definition: 'Binary orbital frequency' },
        { symbolLatex: '\\Delta t', definition: 'Arrival-time difference between the sites' },
      ],
      modelBoundary:
        'The displayed chirp is a teaching waveform, not raw detector data. Real analysis calibrates strain, models noise, and performs statistical inference with full waveform models and the detector network.',
    },
  },
};

export function getLigoScientificExplanation(
  locale: PhysicsLabLocale,
  sceneId: LigoSceneId,
): LigoScientificExplanation {
  return scientificCopy[locale][sceneId];
}
