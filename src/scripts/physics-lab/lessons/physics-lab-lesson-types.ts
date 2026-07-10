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

export type PhysicsLabLesson = {
  title: string;
  introduction: string;
  formulas: PhysicsLabLessonFormula[];
  steps: PhysicsLabLessonStep[];
  takeaway: string;
};
