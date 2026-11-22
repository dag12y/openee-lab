import katex from "katex";
import "katex/dist/katex.min.css";

export function renderLatex(container: HTMLElement, tex: string, displayMode = true): void {
  katex.render(tex, container, {
    displayMode,
    throwOnError: false,
    strict: false,
  });
}
