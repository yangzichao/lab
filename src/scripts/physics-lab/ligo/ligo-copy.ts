import type { PhysicsLabLocale } from '../physics-lab-i18n';
import type { LigoSceneId } from './ligo-scene-types';

export type LigoSceneCopy = {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  measurement: string;
  signal: string;
};

const ligoSceneCopy: Record<PhysicsLabLocale, Record<LigoSceneId, LigoSceneCopy>> = {
  zh: {
    spacetime: {
      number: '01 / 06',
      eyebrow: '引力波经过',
      title: '空间本身在呼吸',
      description: '自由质量没有被风吹走；它们之间的固有距离沿两个方向交替伸缩。左边是 + 偏振，右边是 × 偏振。',
      measurement: '固有距离',
      signal: 'h₊(t), h×(t)',
    },
    arms: {
      number: '02 / 06',
      eyebrow: '把应变变成长度差',
      title: '为什么探测器是 L 形',
      description: '引力波垂直穿过探测器时，一条臂伸长，另一条臂缩短；半个周期后互换。',
      measurement: 'ΔLₓ − ΔLᵧ',
      signal: 'h = ΔL / L',
    },
    laser: {
      number: '03 / 06',
      eyebrow: '用光当尺子',
      title: '一束激光，两条往返路径',
      description: 'Beam splitter 把同一束激光分成两束。它们分别沿垂直双臂往返，再回到同一点比较相位。',
      measurement: '往返光程',
      signal: 'φ = 4πL / λ',
    },
    'dark-port': {
      number: '04 / 06',
      eyebrow: '相消是最灵敏的起点',
      title: '黑暗端口突然亮了一点',
      description: '没有引力波时，两束返回光几乎完全相消。双臂长度差让相位错开，photodetector 便读到闪烁。',
      measurement: '相位差 Δφ',
      signal: 'I ∝ sin²(Δφ/2)',
    },
    cavity: {
      number: '05 / 06',
      eyebrow: '把极小效应积累起来',
      title: '光在四公里腔内往返数百次',
      description: 'Fabry–Pérot cavity 让光反复采样臂长。四公里实体臂因此得到约 1200 km 的有效光程。',
      measurement: '约 300 次往返',
      signal: '有效光程 ≈ 1200 km',
    },
    detection: {
      number: '06 / 06',
      eyebrow: '从闪烁到天体物理',
      title: '两个观测站听见同一声 chirp',
      description: '并合越接近，轨道越快，波形的频率和振幅一起升高。Livingston 比 Hanford 早约 7 ms 收到 GW150914。',
      measurement: '双站相关',
      signal: 'GW150914 · chirp',
    },
  },
  en: {
    spacetime: {
      number: '01 / 06',
      eyebrow: 'A gravitational wave passes',
      title: 'Space itself is breathing',
      description: 'The free masses are not blown outward. Their proper separations stretch and squeeze along alternating axes: plus on the left, cross on the right.',
      measurement: 'Proper distance',
      signal: 'h₊(t), h×(t)',
    },
    arms: {
      number: '02 / 06',
      eyebrow: 'Turn strain into a length difference',
      title: 'Why the detector is L-shaped',
      description: 'For a wave arriving perpendicular to the detector, one arm lengthens while the other shortens, then they swap half a cycle later.',
      measurement: 'ΔLₓ − ΔLᵧ',
      signal: 'h = ΔL / L',
    },
    laser: {
      number: '03 / 06',
      eyebrow: 'Use light as a ruler',
      title: 'One laser, two round trips',
      description: 'A beam splitter divides one laser into perpendicular paths. Both beams return to the same point, where their phases can be compared.',
      measurement: 'Round-trip path',
      signal: 'φ = 4πL / λ',
    },
    'dark-port': {
      number: '04 / 06',
      eyebrow: 'Cancellation is the sensitive starting point',
      title: 'The dark port flickers',
      description: 'With no wave, the returning beams nearly cancel. A differential arm change shifts their phases and the photodetector sees light.',
      measurement: 'Phase difference Δφ',
      signal: 'I ∝ sin²(Δφ/2)',
    },
    cavity: {
      number: '05 / 06',
      eyebrow: 'Accumulate the tiny effect',
      title: 'Light samples each four-kilometre arm hundreds of times',
      description: 'Fabry–Pérot cavities repeatedly sample the arm length, turning a physical 4 km arm into about 1200 km of effective optical path.',
      measurement: 'About 300 round trips',
      signal: 'Effective path ≈ 1200 km',
    },
    detection: {
      number: '06 / 06',
      eyebrow: 'From flicker to astrophysics',
      title: 'Two observatories hear the same chirp',
      description: 'As the merger accelerates, frequency and amplitude rise together. Livingston received GW150914 about 7 ms before Hanford.',
      measurement: 'Two-site correlation',
      signal: 'GW150914 · chirp',
    },
  },
};

export function getLigoSceneCopy(locale: PhysicsLabLocale, sceneId: LigoSceneId): LigoSceneCopy {
  return ligoSceneCopy[locale][sceneId];
}
