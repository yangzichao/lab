import type { SystemDesignLocale } from './system-design-i18n';

type SystemDesignLabUiCopy = {
  navAriaLabel: string;
  homeLink: string;
  languageSwitchPrefix: string;
  readSourceArticle: string;
  guidedWalkthroughAriaLabel: (title: string) => string;
  guidedWalkthroughEyebrow: string;
  guidedWalkthroughTitle: string;
  revealReasoning: string;
  hideReasoning: string;
  takeaway: string;
  walkthroughHint: string;
  previousStep: string;
  nextStep: string;
  walkthroughPosition: (index: number, total: number) => string;
  scenariosAriaLabel: (title: string) => string;
  scenariosTitle: string;
  scenariosDescription: string;
  controlsAriaLabel: (title: string) => string;
  controlsDescription: string;
  recommendedShape: string;
  diagramAriaLabel: string;
  architecturePath: string;
  mobileFlowAriaLabel: string;
  bottlenecks: string;
  whyThisChanges: string;
  decisionTradeoffs: string;
  sourceBackedRules: string;
  sourceBackedRulesDescription: string;
  verifiedRule: string;
  teachingAssumptions: string;
};

export const systemDesignLabUiCopy: Record<SystemDesignLocale, SystemDesignLabUiCopy> = {
  zh: {
    navAriaLabel: '系统设计 Lab 导航',
    homeLink: '首页',
    languageSwitchPrefix: 'Language',
    readSourceArticle: '阅读完整教程',
    guidedWalkthroughAriaLabel: (title) => `${title} 分步讲解`,
    guidedWalkthroughEyebrow: '分步讲解',
    guidedWalkthroughTitle: '一步一步把它想清楚',
    revealReasoning: '展开推理过程',
    hideReasoning: '收起推理过程',
    takeaway: '要点',
    walkthroughHint:
      '每一步都会设定下方的 workload —— 看着 diagram、meter 和各项 decision 随之变化。',
    previousStep: '上一步',
    nextStep: '下一步',
    walkthroughPosition: (index, total) => `第 ${index + 1} / ${total} 步`,
    scenariosAriaLabel: (title) => `${title} 场景`,
    scenariosTitle: '常规演进场景',
    scenariosDescription: '从左到右点击，就是预设的演示路径。每张卡片都会改变 workload 输入。',
    controlsAriaLabel: (title) => `${title} workload 控制`,
    controlsDescription: '这些是输入，不是预设好的架构阶段。',
    recommendedShape: '推荐形态',
    diagramAriaLabel: '推算出的架构图',
    architecturePath: '当前架构路径',
    mobileFlowAriaLabel: '推算出的移动端架构流程',
    bottlenecks: '瓶颈',
    whyThisChanges: '为什么会变',
    decisionTradeoffs: '决策权衡',
    sourceBackedRules: '有出处支撑的规则',
    sourceBackedRulesDescription:
      '这些是模型背后那些经得起时间考验的 system design 论断。而 slider 的具体阈值，则被刻意标注为教学用的假设。',
    verifiedRule: '已验证的规则',
    teachingAssumptions: '教学用假设',
  },
  en: {
    navAriaLabel: 'System Design Lab navigation',
    homeLink: 'Home',
    languageSwitchPrefix: '语言',
    readSourceArticle: 'Read the full tutorial',
    guidedWalkthroughAriaLabel: (title) => `${title} guided walkthrough`,
    guidedWalkthroughEyebrow: 'Guided walkthrough',
    guidedWalkthroughTitle: 'Reason about it one step at a time',
    revealReasoning: 'Reveal the reasoning',
    hideReasoning: 'Hide the reasoning',
    takeaway: 'Takeaway',
    walkthroughHint:
      'Each step sets the workload below - watch the diagram, meters, and decisions react.',
    previousStep: 'Prev',
    nextStep: 'Next',
    walkthroughPosition: (index, total) => `Step ${index + 1} / ${total}`,
    scenariosAriaLabel: (title) => `${title} scenarios`,
    scenariosTitle: 'Normal evolution scenarios',
    scenariosDescription:
      'Click left to right for the intended demo path. Each card changes the workload inputs.',
    controlsAriaLabel: (title) => `${title} workload controls`,
    controlsDescription: 'These are inputs, not preset architecture stages.',
    recommendedShape: 'Recommended shape',
    diagramAriaLabel: 'Calculated architecture diagram',
    architecturePath: 'Current architecture path',
    mobileFlowAriaLabel: 'Calculated mobile architecture flow',
    bottlenecks: 'Bottlenecks',
    whyThisChanges: 'Why this changes',
    decisionTradeoffs: 'Decision tradeoffs',
    sourceBackedRules: 'Source-backed rules',
    sourceBackedRulesDescription:
      'These are the durable system-design claims behind the model. The exact slider thresholds are deliberately labeled as teaching assumptions.',
    verifiedRule: 'Verified rule',
    teachingAssumptions: 'Teaching assumptions',
  },
};

export function getSystemDesignLabUiCopy(
  locale: SystemDesignLocale,
): SystemDesignLabUiCopy {
  return systemDesignLabUiCopy[locale];
}
