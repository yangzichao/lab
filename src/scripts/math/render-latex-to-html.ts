import katex from 'katex';
import { sharedLatexOptions } from './latex-options';

export function renderLatexToHtml(expression: string, displayMode = false): string {
  return katex.renderToString(expression, {
    ...sharedLatexOptions,
    displayMode,
    throwOnError: true,
  });
}
