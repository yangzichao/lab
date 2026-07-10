import katex from 'katex';
import { sharedLatexOptions } from './latex-options';

export function renderLatexIntoElement(
  element: HTMLElement | null,
  expression: string,
  displayMode = false,
): void {
  if (!element) {
    return;
  }

  katex.render(expression, element, {
    ...sharedLatexOptions,
    displayMode,
    throwOnError: false,
  });
}
