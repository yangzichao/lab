import type { PhysicsLabLocale } from '../physics-lab-i18n';

export type PhysicsLabLessonFormula = {
  title: string;
  expressionLatex: string;
  explanation: string;
};

export type PhysicsLabLessonStep = {
  title: string;
  instruction: string;
  observation: string;
};

export type PhysicsLabLessonDifficulty = {
  title: string;
  misconception: string;
  resolution: string;
};

export type PhysicsLabLesson = {
  title: string;
  background: string;
  motivation: string;
  focusQuestion: string;
  keyInsight: string;
  formulas: PhysicsLabLessonFormula[];
  commonDifficulties: PhysicsLabLessonDifficulty[];
  steps: PhysicsLabLessonStep[];
  takeaway: string;
};

export type LocalizedPhysicsLabLesson = Record<PhysicsLabLocale, PhysicsLabLesson>;

export function definePhysicsLabLesson(
  lesson: LocalizedPhysicsLabLesson,
): LocalizedPhysicsLabLesson {
  return lesson;
}
