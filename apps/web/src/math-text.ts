import katex from "katex";
import "katex/dist/katex.min.css";

const inlineMath = /\\\((.+?)\\\)/g;
const renderOptions = { throwOnError: true, output: "htmlAndMathml" as const };

export function renderMathText<T extends HTMLElement>(node: T, source: string): T {
  const parts = source.split(inlineMath);
  node.replaceChildren(...parts.map((part, index) => {
    if (index % 2 === 0) return document.createTextNode(part);
    const formula = document.createElement("span");
    katex.render(part, formula, renderOptions);
    return formula;
  }));
  return node;
}

export function plainMathText(source: string): string {
  return source.replace(inlineMath, (_, tex: string) => {
    const formula = document.createElement("span");
    katex.render(tex, formula, { ...renderOptions, output: "mathml" });
    const math = formula.querySelector("math");
    math?.querySelectorAll("annotation, annotation-xml").forEach(annotation => annotation.remove());
    return math?.textContent ?? tex;
  });
}
