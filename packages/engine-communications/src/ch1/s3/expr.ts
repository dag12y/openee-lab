import { derivative, integrateGaussLegendre16 } from "./calculus.js";

const TAU = 2 * Math.PI;

export type CompiledExpr = {
  readonly source: string;
  readonly normalized: string;
  readonly evaluate: (t: number, env?: Readonly<Record<string, number>>) => number;
};

type EvalEnv = Readonly<Record<string, number>>;
type EvalFn = (t: number, env?: EvalEnv) => number;

type Token =
  | { kind: "num"; value: number }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: string }
  | { kind: "paren"; value: "(" | ")" }
  | { kind: "brace"; value: "{" | "}" }
  | { kind: "comma" }
  | { kind: "qmark" }
  | { kind: "colon" };

export function normalizeMathInput(raw: string): string {
  let s = raw
    .replace(/π/g, "pi")
    .replace(/τ/g, "tau")
    .replace(/×|·/g, "*")
    .replace(/÷/g, "/")
    .replace(/−|–/g, "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/\b(sin|cos|tan|csc|sec|cot)(?:⁻¹|\^-1)\s*\(/gi, (_, fn: string) => `a${fn.toLowerCase()}(`)
    .replace(/log_([a-zA-Z0-9]+)\(/g, "logb($1, ");

  // Convert balanced |expr| into abs(expr)
  let depth = 0;
  let out = "";
  const barStack: boolean[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "|") {
      const prev = out.slice(-1);
      const isOpen =
        barStack.length === 0 ||
        prev === "" ||
        "+-*/^<(?:,{".includes(prev) ||
        /\s/.test(prev);
      if (isOpen && depth === barStack.length) {
        out += "abs(";
        barStack.push(true);
        depth++;
      } else if (barStack.length > 0) {
        out += ")";
        barStack.pop();
        depth = Math.max(0, depth - 1);
      } else {
        out += "abs(";
        barStack.push(true);
        depth++;
      }
    } else {
      out += ch;
    }
  }
  s = out;
  return s;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || (ch === "." && i + 1 < source.length && source[i + 1]! >= "0" && source[i + 1]! <= "9")) {
      const start = i;
      while (i < source.length && ((source[i]! >= "0" && source[i]! <= "9") || source[i] === ".")) i++;
      if (i < source.length && (source[i] === "e" || source[i] === "E")) {
        i++;
        if (i < source.length && (source[i] === "+" || source[i] === "-")) i++;
        while (i < source.length && source[i]! >= "0" && source[i]! <= "9") i++;
      }
      const value = Number(source.slice(start, i));
      if (!Number.isFinite(value)) throw new SyntaxError(`Invalid numeric literal near "${source.slice(start, i)}"`);
      tokens.push({ kind: "num", value });
      continue;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      const start = i;
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) i++;
      tokens.push({ kind: "ident", value: source.slice(start, i) });
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ kind: "paren", value: ch });
      i++;
      continue;
    }
    if (ch === "{" || ch === "}") {
      tokens.push({ kind: "brace", value: ch });
      i++;
      continue;
    }
    if (ch === ",") { tokens.push({ kind: "comma" }); i++; continue; }
    if (ch === "?") { tokens.push({ kind: "qmark" }); i++; continue; }
    if (ch === ":") { tokens.push({ kind: "colon" }); i++; continue; }
    const two = source.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "==") {
      tokens.push({ kind: "op", value: two });
      i += 2;
      continue;
    }
    if ("+-*/^<>".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    throw new SyntaxError(`Unexpected character "${ch}"`);
  }
  return tokens;
}

const FUNCTIONS: Record<string, (a: number, b?: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  csc: (a: number) => { const s = Math.sin(a); return Math.abs(s) < 1e-12 ? 0 : 1 / s; },
  sec: (a: number) => { const c = Math.cos(a); return Math.abs(c) < 1e-12 ? 0 : 1 / c; },
  cot: (a: number) => { const t = Math.tan(a); return Math.abs(t) < 1e-12 ? 0 : 1 / t; },
  asin: (a: number) => (Math.abs(a) <= 1 ? Math.asin(a) : 0),
  acos: (a: number) => (Math.abs(a) <= 1 ? Math.acos(a) : 0),
  atan: Math.atan,
  acsc: (a: number) => (Math.abs(a) >= 1 ? Math.asin(1 / a) : 0),
  asec: (a: number) => (Math.abs(a) >= 1 ? Math.acos(1 / a) : 0),
  acot: (a: number) => (a === 0 ? Math.PI / 2 : Math.atan(1 / a)),
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  csch: (a: number) => { const s = Math.sinh(a); return Math.abs(s) < 1e-12 ? 0 : 1 / s; },
  sech: (a: number) => 1 / Math.cosh(a),
  coth: (a: number) => { const t = Math.tanh(a); return Math.abs(t) < 1e-12 ? 0 : 1 / t; },
  exp: Math.exp,
  ln: (a: number) => (a > 0 ? Math.log(a) : 0),
  log: (a: number) => (a > 0 ? Math.log10(a) : 0),
  logb: (a: number, b?: number) => (b !== undefined && a > 0 && a !== 1 && b > 0 ? Math.log(b) / Math.log(a) : 0),
  sqrt: (a: number) => Math.sqrt(Math.max(0, a)),
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  sgn: Math.sign,
  step: (a: number) => (a >= 0 ? 1 : 0),
  u: (a: number) => (a >= 0 ? 1 : 0),
  rect: (a: number) => (Math.abs(a) < 0.5 ? 1 : Math.abs(a) === 0.5 ? 0.5 : 0),
  tri: (a: number) => Math.max(0, 1 - Math.abs(a)),
  sinc: (a: number) => (Math.abs(a) < 1e-12 ? 1 : Math.sin(Math.PI * a) / (Math.PI * a)),
  // Canonical periodic waveforms normalized to fundamental period 1 (or duty b):
  square: (a: number, b?: number) => {
    const duty = b === undefined ? 0.5 : Math.min(0.99, Math.max(0.01, b));
    const u = ((a % 1) + 1) % 1;
    return u < duty ? 1 : -1;
  },
  sawtooth: (a: number) => {
    const u = ((a % 1) + 1) % 1;
    return 2 * u - 1;
  },
  triangle: (a: number) => {
    const u = ((a % 1) + 1) % 1;
    return 1 - 4 * Math.abs(u - 0.5);
  },
  pulse: (a: number, b?: number) => {
    const duty = b === undefined ? 0.25 : Math.min(0.99, Math.max(0.01, b));
    const u = ((a % 1) + 1) % 1;
    return u < duty ? 1 : 0;
  },
  min: (a: number, b?: number) => (b === undefined ? a : Math.min(a, b)),
  max: (a: number, b?: number) => (b === undefined ? a : Math.max(a, b)),
};

const SPECIAL_OPERATORS = new Set(["deriv", "integ", "sum", "prod"]);

export function compileExpression(source: string): CompiledExpr {
  const trimmed = source.trim();
  if (trimmed.length === 0) throw new SyntaxError("Expression cannot be empty.");
  if (trimmed.length > 512) throw new SyntaxError("Expression exceeds 512-character limit.");
  const normalized = normalizeMathInput(trimmed);
  const tokens = tokenize(normalized);
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parsePiecewiseOrTernary(): EvalFn {
    const tok = peek();
    if (tok?.kind === "brace" && tok.value === "{") {
      consume();
      const branches: Array<{ cond?: EvalFn; value: EvalFn }> = [];
      for (;;) {
        const next = peek();
        if (!next) throw new SyntaxError("Unclosed '{' in piecewise block.");
        if (next.kind === "brace" && next.value === "}") {
          consume();
          break;
        }
        const first = parseTernary();
        if (peek()?.kind === "colon") {
          consume();
          const val = parseTernary();
          branches.push({ cond: first, value: val });
        } else {
          branches.push({ value: first });
        }
        if (peek()?.kind === "comma") {
          consume();
          continue;
        }
        if (peek()?.kind === "brace" && (peek() as { value: string }).value === "}") {
          consume();
          break;
        }
        throw new SyntaxError("Expected ',' or '}' in piecewise block.");
      }
      return (t, env) => {
        for (const br of branches) {
          if (!br.cond || br.cond(t, env) !== 0) return br.value(t, env);
        }
        return 0;
      };
    }
    return parseTernary();
  }

  function parseTernary(): EvalFn {
    const cond = parseCompare();
    if (peek()?.kind === "qmark") {
      consume();
      const whenTrue = parsePiecewiseOrTernary();
      if (peek()?.kind !== "colon") throw new SyntaxError("Expected ':' in conditional expression.");
      consume();
      const whenFalse = parsePiecewiseOrTernary();
      return (t, env) => (cond(t, env) !== 0 ? whenTrue(t, env) : whenFalse(t, env));
    }
    return cond;
  }

  function parseCompare(): EvalFn {
    const first = parseAdd();
    const chain: Array<{ op: string; rhs: EvalFn }> = [];
    while (peek()?.kind === "op" && ["<", "<=", ">", ">=", "=="].includes((peek() as { value: string }).value)) {
      const op = (consume() as { value: string }).value;
      const rhs = parseAdd();
      chain.push({ op, rhs });
    }
    if (chain.length === 0) return first;
    return (t, env) => {
      let lhs = first(t, env);
      for (const link of chain) {
        const rv = link.rhs(t, env);
        let ok = false;
        if (link.op === "<") ok = lhs < rv;
        else if (link.op === "<=") ok = lhs <= rv;
        else if (link.op === ">") ok = lhs > rv;
        else if (link.op === ">=") ok = lhs >= rv;
        else ok = lhs === rv;
        if (!ok) return 0;
        lhs = rv;
      }
      return 1;
    };
  }

  function parseAdd(): EvalFn {
    let lhs = parseMul();
    for (;;) {
      const next = peek();
      if (next?.kind !== "op" || (next.value !== "+" && next.value !== "-")) break;
      const op = next.value;
      consume();
      const rhs = parseMul();
      const prev = lhs;
      lhs = op === "+" ? (t, env) => prev(t, env) + rhs(t, env) : (t, env) => prev(t, env) - rhs(t, env);
    }
    return lhs;
  }

  function parseMul(): EvalFn {
    let lhs = parsePow();
    for (;;) {
      const next = peek();
      if (next?.kind === "op" && (next.value === "*" || next.value === "/")) {
        consume();
        const rhs = parsePow();
        const prev = lhs;
        lhs = next.value === "*"
          ? (t, env) => prev(t, env) * rhs(t, env)
          : (t, env) => { const d = rhs(t, env); return d === 0 ? 0 : prev(t, env) / d; };
      } else if (next && (next.kind === "ident" || (next.kind === "paren" && next.value === "("))) {
        const rhs = parsePow();
        const prev = lhs;
        lhs = (t, env) => prev(t, env) * rhs(t, env);
      } else {
        break;
      }
    }
    return lhs;
  }

  function parsePow(): EvalFn {
    const base = parseUnary();
    const next = peek();
    if (next?.kind === "op" && next.value === "^") {
      consume();
      const exp = parsePow();
      return (t, env) => Math.pow(base(t, env), exp(t, env));
    }
    return base;
  }

  function parseUnary(): EvalFn {
    const next = peek();
    if (next?.kind === "op" && next.value === "-") {
      consume();
      const inner = parseUnary();
      return (t, env) => -inner(t, env);
    }
    if (next?.kind === "op" && next.value === "+") {
      consume();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parseArgListTokens(): EvalFn[] {
    const args: EvalFn[] = [];
    if (peek()?.kind === "paren" && (peek() as { value: string }).value === ")") {
      consume();
      return args;
    }
    for (;;) {
      args.push(parsePiecewiseOrTernary());
      if (peek()?.kind === "comma") {
        consume();
        continue;
      }
      const close = consume();
      if (close?.kind !== "paren" || close.value !== ")") {
        throw new SyntaxError("Missing ')' after function arguments.");
      }
      return args;
    }
  }

  function extractIdentNameAtCurrent(): string | undefined {
    const tok = peek();
    if (tok?.kind === "ident") {
      consume();
      return tok.value.toLowerCase();
    }
    return undefined;
  }

  function parsePrimary(): EvalFn {
    const tok = peek();
    if (!tok) throw new SyntaxError("Unexpected end of expression.");
    if (tok.kind === "brace" && tok.value === "{") {
      return parsePiecewiseOrTernary();
    }
    if (tok.kind === "num") {
      consume();
      const val = tok.value;
      return () => val;
    }
    if (tok.kind === "paren" && tok.value === "(") {
      consume();
      const inner = parsePiecewiseOrTernary();
      const close = consume();
      if (close?.kind !== "paren" || close.value !== ")") {
        throw new SyntaxError("Missing closing parenthesis ')'.");
      }
      return inner;
    }
    if (tok.kind === "ident") {
      consume();
      const name = tok.value.toLowerCase();
      if (peek()?.kind === "paren" && (peek() as { value: string }).value === "(") {
        consume();

        // Inline calculus & finite series operators: deriv, integ, sum, prod
        if (SPECIAL_OPERATORS.has(name)) {
          if (name === "deriv") {
            const bodyFn = parsePiecewiseOrTernary();
            let varName = "t";
            if (peek()?.kind === "comma") {
              consume();
              const vName = extractIdentNameAtCurrent();
              if (!vName) throw new SyntaxError("deriv(expr, var) expects a variable name such as t or x.");
              varName = vName;
            }
            const close = consume();
            if (close?.kind !== "paren" || close.value !== ")") throw new SyntaxError("Missing ')' after deriv(...).");
            return (t, env) =>
              derivative(v => {
                if (varName === "t" || varName === "x") return bodyFn(v, env);
                return bodyFn(t, { ...env, [varName]: v });
              }, t);
          }

          if (name === "integ") {
            const bodyFn = parsePiecewiseOrTernary();
            if (peek()?.kind !== "comma") throw new SyntaxError("integ(expr, a, b) requires lower and upper bounds.");
            consume();
            const aFn = parsePiecewiseOrTernary();
            if (peek()?.kind !== "comma") throw new SyntaxError("integ(expr, a, b) requires an upper bound b.");
            consume();
            const bFn = parsePiecewiseOrTernary();
            const close = consume();
            if (close?.kind !== "paren" || close.value !== ")") throw new SyntaxError("Missing ')' after integ(...).");
            return (t, env) => integrateGaussLegendre16(v => bodyFn(v, env), aFn(t, env), bFn(t, env), 20);
          }

          // sum(expr, k, start, end) / prod(expr, k, start, end)
          const bodyFn = parsePiecewiseOrTernary();
          if (peek()?.kind !== "comma") throw new SyntaxError(`${name}(expr, k, a, b) expects index variable k.`);
          consume();
          const idxVar = extractIdentNameAtCurrent();
          if (!idxVar) throw new SyntaxError(`${name}(expr, k, a, b) expects an identifier for index variable k.`);
          if (peek()?.kind !== "comma") throw new SyntaxError(`${name}(expr, k, a, b) expects lower limit a.`);
          consume();
          const loFn = parsePiecewiseOrTernary();
          if (peek()?.kind !== "comma") throw new SyntaxError(`${name}(expr, k, a, b) expects upper limit b.`);
          consume();
          const hiFn = parsePiecewiseOrTernary();
          const close = consume();
          if (close?.kind !== "paren" || close.value !== ")") throw new SyntaxError(`Missing ')' after ${name}(...).`);
          return (t, env) => {
            const lo = Math.round(loFn(t, env));
            const hi = Math.min(lo + 500, Math.round(hiFn(t, env)));
            let acc = name === "sum" ? 0 : 1;
            for (let k = lo; k <= hi; k++) {
              const v = bodyFn(t, { ...env, [idxVar]: k });
              if (name === "sum") acc += v;
              else acc *= v;
            }
            return acc;
          };
        }

        const fn = FUNCTIONS[name];
        if (!fn) throw new SyntaxError(`Unsupported function "${tok.value}".`);
        const args = parseArgListTokens();
        if (args.length === 0) throw new SyntaxError(`${name}(...) expects at least 1 argument.`);
        if ((name === "min" || name === "max" || name === "logb") && args.length < 2) {
          throw new SyntaxError(`${name}(a, b) requires two arguments.`);
        }
        const arg1 = args[0]!;
        const arg2 = args[1];
        return arg2 ? (t, env) => fn(arg1(t, env), arg2(t, env)) : (t, env) => fn(arg1(t, env));
      }

      if (name === "pi") return () => Math.PI;
      if (name === "tau") return () => TAU;
      if (name === "e") return () => Math.E;
      // Allow scoped variables (like k in sum/prod, or integration variable x/t)
      return (t, env) => {
        if (env && name in env) return env[name]!;
        if (name === "t" || name === "x") return t;
        return 0;
      };
    }
    throw new SyntaxError("Unexpected token in expression.");
  }

  // Also check explicitly for unbound non-builtin single identifiers when not inside sum/prod scope:
  // Scan top-level identifiers not followed by '(' that aren't t, x, pi, tau, e or bound loop indices of sum/prod/deriv.
  validateIdentifiers(tokens);

  const root = parsePiecewiseOrTernary();
  if (pos < tokens.length) throw new SyntaxError("Unexpected trailing tokens in expression.");
  return {
    source: trimmed,
    normalized,
    evaluate(t: number, env?: EvalEnv): number {
      const value = root(t, env);
      return Number.isFinite(value) ? value : 0;
    },
  };
}

function validateIdentifiers(tokens: readonly Token[]) {
  const builtinConsts = new Set(["t", "x", "pi", "tau", "e"]);
  const boundIndices = new Set<string>();
  // Pre-scan bound loop variables from sum(expr, k, a, b) / prod(expr, k, a, b) / deriv(expr, var)
  for (let i = 0; i + 2 < tokens.length; i++) {
    const t0 = tokens[i]!;
    const t1 = tokens[i + 1]!;
    if (t0.kind === "ident" && (t0.value.toLowerCase() === "sum" || t0.value.toLowerCase() === "prod" || t0.value.toLowerCase() === "deriv") && t1.kind === "paren" && t1.value === "(") {
      let depth = 0;
      let commaCount = 0;
      for (let j = i + 2; j < tokens.length; j++) {
        const tj = tokens[j]!;
        if (tj.kind === "paren" && tj.value === "(") depth++;
        else if (tj.kind === "paren" && tj.value === ")") {
          if (depth === 0) break;
          depth--;
        } else if (tj.kind === "comma" && depth === 0) {
          commaCount++;
          const nextTok = tokens[j + 1];
          if (commaCount === 1 && nextTok?.kind === "ident") {
            boundIndices.add(nextTok.value.toLowerCase());
          }
        }
      }
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.kind !== "ident") continue;
    const next = tokens[i + 1];
    if (next?.kind === "paren" && next.value === "(") continue;
    const low = tok.value.toLowerCase();
    if (!builtinConsts.has(low) && !boundIndices.has(low)) {
      throw new SyntaxError(`Unknown identifier "${tok.value}".`);
    }
  }
}

function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of s) {
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function replaceBalancedCall(
  input: string,
  names: readonly string[],
  formatter: (name: string, args: string[], rawInner: string) => string,
): string {
  const re = new RegExp(`\\b(${names.join("|")})\\(`, "gi");
  let out = "";
  let cursor = 0;
  while (cursor < input.length) {
    re.lastIndex = cursor;
    const match = re.exec(input);
    if (!match) {
      out += input.slice(cursor);
      break;
    }
    const idx = match.index;
    const fnName = match[1]!.toLowerCase();
    const openIdx = idx + match[0].length - 1;
    let depth = 1;
    let j = openIdx + 1;
    while (j < input.length && depth > 0) {
      if (input[j] === "(") depth++;
      else if (input[j] === ")") depth--;
      j++;
    }
    if (depth !== 0) {
      // Incomplete call while typing: copy verbatim without breaking KaTeX
      out += input.slice(cursor, openIdx + 1);
      cursor = openIdx + 1;
      continue;
    }
    out += input.slice(cursor, idx);
    const rawInner = input.slice(openIdx + 1, j - 1);
    const args = splitTopLevelCommas(rawInner);
    out += formatter(fnName, args, rawInner);
    cursor = j;
  }
  return out;
}

export function expressionToLatex(raw: string): string {
  const s = raw.trim();
  if (!s) return "0";
  let norm = normalizeMathInput(s);

  // Convert top-level Desmos brace piecewise {cond: expr, ...} into \begin{cases}...\end{cases}
  if (norm.startsWith("{") && norm.endsWith("}")) {
    const parts = splitTopLevelCommas(norm.slice(1, -1));
    const rows = parts.map(part => {
      const colonIdx = part.indexOf(":");
      if (colonIdx === -1) return `${expressionToLatex(part)}, & \\text{else}`;
      const cond = part.slice(0, colonIdx).trim();
      const val = part.slice(colonIdx + 1).trim();
      return `${expressionToLatex(val)}, & ${expressionToLatex(cond)}`;
    });
    return String.raw`\begin{cases} ${rows.join(String.raw` \\ `)} \end{cases}`;
  }

  // Handle nested special calls recursively so inner parentheses never corrupt KaTeX braces
  norm = replaceBalancedCall(
    norm,
    ["sqrt", "abs", "deriv", "integ", "sum", "prod", "logb"],
    (fn, args, inner) => {
      if (fn === "sqrt") return `\\sqrt{${expressionToLatex(inner)}}`;
      if (fn === "abs") return `\\left|${expressionToLatex(inner)}\\right|`;
      if (fn === "deriv") {
        const body = expressionToLatex(args[0] ?? "0");
        const v = (args[1] ?? "t").trim();
        return `\\frac{d}{d${v}}\\left(${body}\\right)`;
      }
      if (fn === "integ" && args.length >= 3) {
        return `\\int_{${expressionToLatex(args[1]!)}}^{${expressionToLatex(args[2]!)}} ${expressionToLatex(args[0]!)}\\,dx`;
      }
      if ((fn === "sum" || fn === "prod") && args.length >= 4) {
        const op = fn === "sum" ? "\\sum" : "\\prod";
        return `${op}_{${args[1]!}=${expressionToLatex(args[2]!)}}^{${expressionToLatex(args[3]!)}} ${expressionToLatex(args[0]!)}`;
      }
      if (fn === "logb" && args.length >= 2) {
        return `\\log_{${expressionToLatex(args[0]!)}}\\left(${expressionToLatex(args[1]!)}\\right)`;
      }
      return `${fn}(${expressionToLatex(inner)})`;
    },
  );

  norm = norm
    .replace(/\bpi\b/gi, "\\pi ")
    .replace(/\btau\b/gi, "\\tau ")
    .replace(/\ba(sin|cos|tan|csc|sec|cot)\(/gi, (_, fn: string) => `\\${fn.toLowerCase()}^{-1}(`)
    .replace(/\b(csch|sech)\(/gi, (_, fn: string) => `\\operatorname{${fn.toLowerCase()}}(`)
    .replace(/\b(sinh|cosh|tanh|coth|sin|cos|tan|csc|sec|cot|ln|log|exp|max|min)\(/gi, (_, fn: string) => `\\${fn.toLowerCase()}(`)
    .replace(/\b(rect|tri|sinc|square|sawtooth|triangle|pulse|step|sgn|u)\(/gi, (_, fn: string) => `\\operatorname{${fn.toLowerCase()}}(`)
    .replace(/<=/g, "\\le ")
    .replace(/>=/g, "\\ge ")
    .replace(/\*/g, "\\cdot ");
  return norm;
}
