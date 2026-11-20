import type { Diagnostic } from "../../../packages/contracts/src/index.js";

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, text?: string, className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function numericField(key: string, label: string, unit: string, value: number, hint: string) {
  const root = element("div", undefined, "field");
  const name = element("label", label);
  const input = element("input");
  const note = element("small", hint);
  name.htmlFor = input.id = key;
  note.id = key + "-note";
  input.type = "number";
  input.step = "any";
  input.value = String(value);
  input.setAttribute("aria-describedby", note.id);
  const box = element("div", undefined, "input-box");
  box.append(input, element("span", unit));
  root.append(name, box, note);
  return { root, input, error(message?: string) {
    const text = message ?? hint;
    if (note.textContent !== text) note.textContent = text;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  } };
}

export function actions() {
  const run = element("button", "Run simulation", "primary");
  run.type = "submit";
  const reset = element("button", "Reset");
  const cancel = element("button", "Cancel run");
  reset.type = cancel.type = "button";
  cancel.hidden = true;
  const root = element("div", undefined, "actions");
  root.append(run, reset, cancel);
  return { root, run, reset, cancel };
}

export function diagnostics(container: HTMLElement, items: readonly Diagnostic[]) {
  container.replaceChildren(...items.map(item =>
    element("li", `${item.severity}: ${item.message}${item.remedy ? " " + item.remedy : ""}`, `diagnostic-${item.severity}`)));
}
