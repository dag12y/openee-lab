import { element } from "./ui";

export type MathKeypadTarget = () => HTMLInputElement | undefined;

type KeyDef = {
  label: string;
  html?: string;
  insert: string;
  caretBack?: number;
  kind?: "op" | "fn" | "num" | "act";
  title?: string;
};

const CORE_KEYS: readonly KeyDef[] = [
  { label: "t", insert: "t" },
  { label: "π", insert: "pi" },
  { label: "|x|", insert: "abs()", caretBack: 1, kind: "fn" },
  { label: "x²", insert: "^2", kind: "op" },
  { label: "a^b", insert: "^", kind: "op" },
  { label: "√", insert: "sqrt()", caretBack: 1, kind: "fn" },
  { label: "7", insert: "7", kind: "num" },
  { label: "8", insert: "8", kind: "num" },
  { label: "9", insert: "9", kind: "num" },
  { label: "÷", insert: "/", kind: "op" },

  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "<", insert: " < ", kind: "op" },
  { label: "≤", insert: " <= ", kind: "op" },
  { label: "? :", insert: " ?  : ", caretBack: 3, kind: "op", title: "Ternary conditional" },
  { label: "{ : }", insert: "{0 <= t < 1: , 0}", caretBack: 4, kind: "fn", title: "Piecewise braces" },
  { label: "4", insert: "4", kind: "num" },
  { label: "5", insert: "5", kind: "num" },
  { label: "6", insert: "6", kind: "num" },
  { label: "×", insert: "*", kind: "op" },

  { label: "sin", insert: "sin()", caretBack: 1, kind: "fn" },
  { label: "cos", insert: "cos()", caretBack: 1, kind: "fn" },
  { label: "tan", insert: "tan()", caretBack: 1, kind: "fn" },
  { label: "rect", insert: "rect()", caretBack: 1, kind: "fn" },
  { label: "tri", insert: "tri()", caretBack: 1, kind: "fn" },
  { label: "u(t)", insert: "u()", caretBack: 1, kind: "fn" },
  { label: "1", insert: "1", kind: "num" },
  { label: "2", insert: "2", kind: "num" },
  { label: "3", insert: "3", kind: "num" },
  { label: "−", insert: "-", kind: "op" },

  { label: "square", insert: "square(t)", kind: "fn" },
  { label: "saw", insert: "sawtooth(t)", kind: "fn" },
  { label: "sinc", insert: "sinc()", caretBack: 1, kind: "fn" },
  { label: "e^x", insert: "exp()", caretBack: 1, kind: "fn" },
  { label: ",", insert: ", " },
  { label: "⌫", insert: "__BACK__", kind: "act" },
  { label: "0", insert: "0", kind: "num" },
  { label: ".", insert: ".", kind: "num" },
  { label: "Clear", insert: "__CLEAR__", kind: "act" },
  { label: "+", insert: "+", kind: "op" },
];

type CategoryId = "trig" | "inverse" | "hyperbolic" | "calculus";

const CATEGORY_TABS: ReadonlyArray<{ id: CategoryId; label: string; keys: readonly KeyDef[] }> = [
  {
    id: "inverse",
    label: "Inverse Trig",
    keys: [
      { label: "sin⁻¹", html: "sin<sup>−1</sup>", insert: "asin()", caretBack: 1, kind: "fn" },
      { label: "cos⁻¹", html: "cos<sup>−1</sup>", insert: "acos()", caretBack: 1, kind: "fn" },
      { label: "tan⁻¹", html: "tan<sup>−1</sup>", insert: "atan()", caretBack: 1, kind: "fn" },
      { label: "csc⁻¹", html: "csc<sup>−1</sup>", insert: "acsc()", caretBack: 1, kind: "fn" },
      { label: "sec⁻¹", html: "sec<sup>−1</sup>", insert: "asec()", caretBack: 1, kind: "fn" },
      { label: "cot⁻¹", html: "cot<sup>−1</sup>", insert: "acot()", caretBack: 1, kind: "fn" },
    ],
  },
  {
    id: "hyperbolic",
    label: "Hyperbolic",
    keys: [
      { label: "sinh", insert: "sinh()", caretBack: 1, kind: "fn" },
      { label: "cosh", insert: "cosh()", caretBack: 1, kind: "fn" },
      { label: "tanh", insert: "tanh()", caretBack: 1, kind: "fn" },
      { label: "csch", insert: "csch()", caretBack: 1, kind: "fn" },
      { label: "sech", insert: "sech()", caretBack: 1, kind: "fn" },
      { label: "coth", insert: "coth()", caretBack: 1, kind: "fn" },
    ],
  },
  {
    id: "calculus",
    label: "Calculus & Log",
    keys: [
      { label: "exp", insert: "exp()", caretBack: 1, kind: "fn" },
      { label: "ln", insert: "ln()", caretBack: 1, kind: "fn" },
      { label: "log", insert: "log()", caretBack: 1, kind: "fn" },
      { label: "logₐ", html: "log<sub>a</sub>", insert: "logb(2, )", caretBack: 1, kind: "fn", title: "Logarithm base a: logb(a, x)" },
      { label: "d/dx", html: "d/dx", insert: "deriv(, t)", caretBack: 4, kind: "fn", title: "Derivative d/dt" },
      { label: "f'", html: "f′", insert: "deriv(, t)", caretBack: 4, kind: "fn", title: "Derivative f'(t)" },
      { label: "∫", insert: "integ(, 0, t)", caretBack: 7, kind: "fn", title: "Definite integral integ(expr, a, b)" },
      { label: "Σ", insert: "sum(, k, 1, 5)", caretBack: 9, kind: "fn", title: "Summation sum(expr, k, a, b)" },
      { label: "Π", insert: "prod(, k, 1, 4)", caretBack: 9, kind: "fn", title: "Product prod(expr, k, a, b)" },
    ],
  },
  {
    id: "trig",
    label: "Trig & Signals",
    keys: [
      { label: "sin", insert: "sin()", caretBack: 1, kind: "fn" },
      { label: "cos", insert: "cos()", caretBack: 1, kind: "fn" },
      { label: "tan", insert: "tan()", caretBack: 1, kind: "fn" },
      { label: "csc", insert: "csc()", caretBack: 1, kind: "fn" },
      { label: "sec", insert: "sec()", caretBack: 1, kind: "fn" },
      { label: "cot", insert: "cot()", caretBack: 1, kind: "fn" },
    ],
  },
];

export function createMathKeypad(getTarget: MathKeypadTarget) {
  const root = element("div", undefined, "s3-keypad");
  root.hidden = true;
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Mathematical function keypad");

  let activeCat: CategoryId = "inverse";

  function applyKey(key: KeyDef) {
    const input = getTarget();
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    if (key.insert === "__CLEAR__") {
      input.value = "";
      delete input.dataset.replaceAll;
      input.setSelectionRange(0, 0);
    } else if (key.insert === "__BACK__") {
      delete input.dataset.replaceAll;
      if (start !== end) {
        input.value = input.value.slice(0, start) + input.value.slice(end);
        input.setSelectionRange(start, start);
      } else if (start > 0) {
        input.value = input.value.slice(0, start - 1) + input.value.slice(end);
        input.setSelectionRange(start - 1, start - 1);
      }
    } else {
      const isBinaryOp =
        key.insert === "^2" ||
        key.insert === "^" ||
        key.insert === "/" ||
        key.insert === "*" ||
        key.insert === "+" ||
        key.insert === " < " ||
        key.insert === " <= " ||
        key.insert === " ?  : " ||
        key.insert === ", ";
      const replaceWhole =
        (input.value.trim() === "0" && start === end && key.insert !== "." && !isBinaryOp) ||
        (input.dataset.replaceAll === "true" && start === end && !isBinaryOp);
      delete input.dataset.replaceAll;
      const offset = key.caretBack !== undefined ? key.insert.length - key.caretBack : key.insert.length;
      if (replaceWhole) {
        input.value = key.insert;
        input.setSelectionRange(offset, offset);
      } else {
        input.value = input.value.slice(0, start) + key.insert + input.value.slice(end);
        const pos = start + offset;
        input.setSelectionRange(pos, pos);
      }
    }
    input.focus();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function makeKeyBtn(key: KeyDef, cls = "s3-key"): HTMLButtonElement {
    const btn = element("button", undefined, `${cls} ${key.kind ? `s3-key-${key.kind}` : ""}`);
    btn.type = "button";
    if (key.html) btn.innerHTML = key.html;
    else btn.textContent = key.label;
    if (key.title) btn.title = key.title;
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => applyKey(key));
    return btn;
  }

  const coreGrid = element("div", undefined, "s3-keypad-grid");
  for (const key of CORE_KEYS) {
    coreGrid.append(makeKeyBtn(key));
  }

  // Categorized Advanced Function Drawer (Inverse Trig, Hyperbolic, Calculus & Log, Trig)
  const catBar = element("div", undefined, "s3-keypad-tabs");
  const catGrid = element("div", undefined, "s3-keypad-cat-grid");
  const tabBtns = new Map<CategoryId, HTMLButtonElement>();

  function renderCategory() {
    const cat = CATEGORY_TABS.find(c => c.id === activeCat)!;
    tabBtns.forEach((b, id) => b.classList.toggle("active", id === activeCat));
    catGrid.replaceChildren(...cat.keys.map(k => makeKeyBtn(k, "s3-key s3-fn-key")));
  }

  for (const cat of CATEGORY_TABS) {
    const b = element("button", cat.label, "s3-keypad-tab");
    b.type = "button";
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("click", () => {
      activeCat = cat.id;
      renderCategory();
    });
    tabBtns.set(cat.id, b);
    catBar.append(b);
  }
  renderCategory();

  root.append(coreGrid, catBar, catGrid);

  return {
    root,
    toggle(force?: boolean) {
      root.hidden = force === undefined ? !root.hidden : !force;
      return !root.hidden;
    },
    isOpen() {
      return !root.hidden;
    },
  };
}
