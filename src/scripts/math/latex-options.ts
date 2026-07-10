import type { KatexOptions } from 'katex';

export const sharedLatexOptions = {
  errorColor: '#b42318',
  maxExpand: 1000,
  maxSize: 20,
  output: 'htmlAndMathml',
  strict: 'warn',
  trust: false,
} satisfies KatexOptions;
