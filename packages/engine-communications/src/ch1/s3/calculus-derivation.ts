// Real Continuous Calculus & Fourier Derivation Engine
// Produces rigorous, step-by-step mathematical derivations matching exact analytical textbook
// and WolframAlpha workflows across Trigonometric, Compact Cosine, Complex Exponential, and Fourier Transform:
//   - Concrete integrand substitution with explicit integration bounds [a, b]
//   - Symmetry reductions (even/odd) over symmetric intervals
//   - Explicit antiderivatives in evaluation brackets \left[ \dots \right]_a^b
//   - Repeated tabular integration by parts for arbitrary polynomials (0 <= deg <= 6) and piecewise/preset signals
//   - Boundary substitutions with Euler identities e^{\pm j n \pi} = (-1)^n, sin(n*pi)=0, cos(n*pi)=(-1)^n
//   - Dynamic closed forms for a_0, a_0/2, a_n, b_n, C_n, theta_n, c_n (no hardcoded functions)
//   - Dynamic expanded harmonics and Wolfram-style partial sums table inside \begin{gathered}...\end{gathered}

import {
  PI,
  TAU,
  findRational,
  formatAnglePi,
  formatExactScalar,
  formatNumber,
  formatOmegaNT,
  type MathStep,
} from "./symbolic.js";
import type { FourierTransformConfig, PiecewiseSegment } from "./model.js";
import type { HarmonicCoefficient } from "./math.js";

// ============================================================================
// 0. SHARED LATEX & EXPANSION HELPERS (KaTeX strict-safe, zero warnings)
// ============================================================================

function gathered(lines: readonly string[], rowGap?: string): string {
  const clean = lines.map(l => l.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0]!;
  const sep = rowGap ? ` \\\\[${rowGap}] ` : String.raw` \\ `;
  return String.raw`\begin{gathered}${clean.join(sep)}\end{gathered}`;
}

function wArgTex(omega0: number, n: number | string = "n"): string {
  if (Math.abs(omega0 - 1) < 1e-6) return n === 1 ? "t" : `${n}t`;
  return formatOmegaNT(omega0, String(n));
}

function buildTrigExpanded(
  lhsTex: string,
  a0HalfVal: number,
  a0HalfTex: string,
  omega0: number,
  harmonics: readonly HarmonicCoefficient[],
  maxNonZero = 4,
): string {
  const parts: string[] = [];
  const hasDC = Math.abs(a0HalfVal) > 1e-7;
  if (hasDC) {
    parts.push(a0HalfTex.includes("+") || a0HalfTex.includes(" - ") ? `\\left(${a0HalfTex}\\right)` : a0HalfTex);
  }
  let added = 0;
  for (let i = 0; i < harmonics.length && added < maxNonZero; i++) {
    const h = harmonics[i]!;
    const arg = wArgTex(omega0, h.n);
    let used = false;
    if (Math.abs(h.an) > 1e-7) {
      const s = formatExactScalar(h.an);
      const pfx = parts.length === 0 ? (s.sign < 0 ? "-" : "") : s.sign < 0 ? " - " : " + ";
      parts.push(`${pfx}${s.isUnity ? "" : s.absTex}\\cos(${arg})`);
      used = true;
    }
    if (Math.abs(h.bn) > 1e-7) {
      const s = formatExactScalar(h.bn);
      const pfx = parts.length === 0 ? (s.sign < 0 ? "-" : "") : s.sign < 0 ? " - " : " + ";
      parts.push(`${pfx}${s.isUnity ? "" : s.absTex}\\sin(${arg})`);
      used = true;
    }
    if (used) added++;
  }
  if (parts.length === 0) return `${lhsTex} = 0`;
  return `${lhsTex} = ${parts.join("")} + \\cdots`;
}

function buildCompactExpanded(
  lhsTex: string,
  a0HalfVal: number,
  a0HalfTex: string,
  omega0: number,
  harmonics: readonly HarmonicCoefficient[],
  maxNonZero = 4,
): string {
  const parts: string[] = [];
  if (Math.abs(a0HalfVal) > 1e-7) {
    parts.push(a0HalfTex.includes("+") || a0HalfTex.includes(" - ") ? `\\left(${a0HalfTex}\\right)` : a0HalfTex);
  }
  let added = 0;
  for (let i = 0; i < harmonics.length && added < maxNonZero; i++) {
    const h = harmonics[i]!;
    if (h.cnMag <= 1e-7) continue;
    const s = formatExactScalar(h.cnMag);
    const pfx = parts.length === 0 ? "" : " + ";
    const arg = wArgTex(omega0, h.n);
    const ang = formatAnglePi(h.thetaN);
    parts.push(`${pfx}${s.isUnity ? "" : s.absTex}\\cos(${arg}${ang})`);
    added++;
  }
  if (parts.length === 0) return `${lhsTex} = 0`;
  return `${lhsTex} = ${parts.join("")} + \\cdots`;
}

function formatComplexPairCoeff(re: number, im: number, isNegOrder: boolean): { pfx: string; body: string } {
  const effIm = isNegOrder ? -im : im;
  const hasRe = Math.abs(re) > 1e-7;
  const hasIm = Math.abs(effIm) > 1e-7;
  if (!hasRe && !hasIm) return { pfx: "", body: "" };
  if (!hasIm) {
    const s = formatExactScalar(re);
    return { pfx: s.sign < 0 ? " - " : " + ", body: s.isUnity ? "" : s.absTex };
  }
  if (!hasRe) {
    const s = formatExactScalar(effIm);
    return { pfx: s.sign < 0 ? " - " : " + ", body: `${s.isUnity ? "" : s.absTex}j` };
  }
  const sRe = formatExactScalar(re);
  const sIm = formatExactScalar(effIm);
  const imPart = `${sIm.sign < 0 ? " - " : " + "}${sIm.isUnity ? "" : sIm.absTex}j`;
  return { pfx: " + ", body: `\\left(${sRe.tex}${imPart}\\right)` };
}

function buildWolframPartialSums(
  a0HalfVal: number,
  a0HalfTex: string,
  a0HalfTrailingTex: string,
  omega0: number,
  harmonics: readonly HarmonicCoefficient[],
  maxN = 3,
): string {
  const hasDC = Math.abs(a0HalfVal) > 1e-7;
  const rows: string[] = [`n = 0:\\quad ${hasDC ? a0HalfTex : "0"}`];
  const isUnitW0 = Math.abs(omega0 - 1) < 1e-6;
  let expBody = "";

  for (let n = 1; n <= maxN && n <= harmonics.length; n++) {
    const h = harmonics[n - 1]!;
    const cRe = 0.5 * h.an;
    const cIm = -0.5 * h.bn;
    const wN = isUnitW0 ? (n === 1 ? "it" : `${n}it`) : `j\\,${formatOmegaNT(omega0, String(n))}`;

    const negTerm = formatComplexPairCoeff(cRe, cIm, true);
    const posTerm = formatComplexPairCoeff(cRe, cIm, false);
    if (negTerm.body || Math.abs(cRe) > 1e-7) {
      const p1 = expBody === "" ? (negTerm.pfx === " - " ? "-" : "") : negTerm.pfx;
      expBody += `${p1}${negTerm.body}e^{-${wN}}${posTerm.pfx}${posTerm.body}e^{${wN}}`;
    }

    const dcTail = hasDC
      ? a0HalfTrailingTex.startsWith("-")
        ? ` ${a0HalfTrailingTex.replace(/^-/, "- ")}`
        : expBody === ""
          ? a0HalfTrailingTex
          : ` + ${a0HalfTrailingTex}`
      : "";
    rows.push(`n = ${n}:\\quad ${expBody || "0"}${dcTail}`);
  }
  return gathered(rows, "6pt");
}

// ============================================================================
// 1. POLYNOMIAL REPRESENTATION & EXACT PI-POLYNOMIAL ALGEBRA
// ============================================================================

export class SymbolicPolynomial {
  readonly coeffs: readonly number[]; // coeffs[k] is coefficient of t^k

  constructor(coeffs: readonly number[]) {
    let last = coeffs.length - 1;
    while (last > 0 && Math.abs(coeffs[last]!) < 1e-12) last--;
    this.coeffs = coeffs.slice(0, last + 1);
  }

  get degree(): number {
    return this.coeffs.length - 1;
  }
  get isZero(): boolean {
    return this.coeffs.length === 1 && Math.abs(this.coeffs[0]!) < 1e-12;
  }
  get isConstant(): boolean {
    return this.degree === 0;
  }
  get isEven(): boolean {
    for (let k = 1; k < this.coeffs.length; k += 2) {
      if (Math.abs(this.coeffs[k]!) > 1e-8) return false;
    }
    return true;
  }
  get isOdd(): boolean {
    for (let k = 0; k < this.coeffs.length; k += 2) {
      if (Math.abs(this.coeffs[k]!) > 1e-8) return false;
    }
    return true;
  }

  evaluate(t: number): number {
    let sum = 0;
    for (let k = this.coeffs.length - 1; k >= 0; k--) sum = sum * t + this.coeffs[k]!;
    return sum;
  }

  differentiate(): SymbolicPolynomial {
    if (this.coeffs.length <= 1) return new SymbolicPolynomial([0]);
    const d: number[] = [];
    for (let k = 1; k < this.coeffs.length; k++) d.push(this.coeffs[k]! * k);
    return new SymbolicPolynomial(d);
  }

  integrate(constant = 0): SymbolicPolynomial {
    const d: number[] = [constant];
    for (let k = 0; k < this.coeffs.length; k++) d.push(this.coeffs[k]! / (k + 1));
    return new SymbolicPolynomial(d);
  }

  scale(factor: number): SymbolicPolynomial {
    return new SymbolicPolynomial(this.coeffs.map(c => c * factor));
  }

  toLatex(variable = "t", ascending = false): string {
    if (this.isZero) return "0";
    const parts: string[] = [];
    const start = ascending ? 0 : this.coeffs.length - 1;
    const end = ascending ? this.coeffs.length : -1;
    const step = ascending ? 1 : -1;

    for (let k = start; k !== end; k += step) {
      const c = this.coeffs[k]!;
      if (Math.abs(c) < 1e-8) continue;
      const isNeg = c < 0;
      const absC = Math.abs(c);
      const absS = formatExactScalar(absC);
      const rat = findRational(absC, 48, 1e-6);

      const vPart = k === 0 ? "" : k === 1 ? variable : k < 10 ? `${variable}^${k}` : `${variable}^{${k}}`;
      let term = "";
      if (k === 0) {
        term = absS.tex;
      } else if (rat && rat.q > 1) {
        const numPart = rat.p === 1 ? vPart : `${rat.p}${vPart}`;
        term = String.raw`\frac{${numPart}}{${rat.q}}`;
      } else {
        term = absS.isUnity ? vPart : `${absS.tex}${vPart}`;
      }

      if (parts.length === 0) parts.push(isNeg ? `-${term}` : term);
      else parts.push(isNeg ? ` - ${term}` : ` + ${term}`);
    }
    return parts.join("") || "0";
  }
}

export function tryParsePolynomial(rawExpr: string): SymbolicPolynomial | null {
  const clean = rawExpr
    .trim()
    .replace(/\s+/g, "")
    .replace(/−|–/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3");
  if (!clean) return null;
  if (/[a-su-z]|abs|rect|tri|sinc|\?|:|\/t/i.test(clean)) return null;

  const matches = clean.match(/([+-]?[^+-]+)/g);
  if (!matches) return null;

  const maxDeg = 6;
  const coeffs = new Array<number>(maxDeg + 1).fill(0);
  for (const m of matches) {
    let s = m;
    let sign = 1;
    if (s.startsWith("+")) s = s.slice(1);
    else if (s.startsWith("-")) {
      sign = -1;
      s = s.slice(1);
    }
    if (!s) return null;

    if (!s.includes("t")) {
      const val = parseScalarLiteral(s);
      if (val === null) return null;
      coeffs[0] = (coeffs[0] ?? 0) + sign * val;
    } else {
      const tIdx = s.indexOf("t");
      const coeffPart = s.slice(0, tIdx).replace(/\*$/, "");
      const expPart = s.slice(tIdx + 1);
      let cVal = 1;
      if (coeffPart !== "") {
        const parsed = parseScalarLiteral(coeffPart);
        if (parsed === null) return null;
        cVal = parsed;
      }
      let deg = 1;
      if (expPart.startsWith("^")) {
        const dNum = parseInt(expPart.slice(1), 10);
        if (isNaN(dNum) || dNum < 0 || dNum > maxDeg) return null;
        deg = dNum;
      } else if (expPart !== "") return null;
      coeffs[deg] = (coeffs[deg] ?? 0) + sign * cVal;
    }
  }
  return new SymbolicPolynomial(coeffs);
}

function parseScalarLiteral(s: string): number | null {
  if (s === "pi" || s === "\\pi") return PI;
  if (s === "2pi" || s === "2*pi") return TAU;
  const frac = s.split("/");
  if (frac.length === 2) {
    const num = parseScalarLiteral(frac[0]!);
    const den = parseScalarLiteral(frac[1]!);
    if (num !== null && den !== null && den !== 0) return num / den;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Formats a rational coefficient c times a denominator token (e.g. "n^2", "n", "(n\pi)^2")
function formatCoeffOverDen(val: number, denTex: string): { sign: 1 | -1; absTex: string; signedTex: string } {
  const sign: 1 | -1 = val < 0 ? -1 : 1;
  const absV = Math.abs(val);
  const rat = findRational(absV, 48, 1e-6);
  let absTex = "";
  if (rat) {
    const denFull = rat.q === 1 ? denTex : `${rat.q}${denTex}`;
    absTex = String.raw`\frac{${rat.p}}{${denFull}}`;
  } else {
    absTex = String.raw`\frac{${formatExactScalar(absV).absTex}}{${denTex}}`;
  }
  return { sign, absTex, signedTex: sign < 0 ? `-${absTex}` : absTex };
}

function wrapParensIfCompound(tex: string): string {
  return tex.includes(" + ") || tex.includes(" - ") ? `\\left(${tex}\\right)` : tex;
}

function formatPolyTrigBracket(poly: SymbolicPolynomial, argVar: string, wVar: string, isCosTarget: boolean): string {
  const parts: string[] = [];
  let cur: SymbolicPolynomial | null = poly;
  let k = 0;
  while (cur && !cur.isZero && k <= 6) {
    const pTex = cur.toLatex("t");
    const nonZeroCount = cur.coeffs.filter(c => Math.abs(c) > 1e-8).length;
    const wrappedP = !cur.isConstant && nonZeroCount > 1 ? `(${pTex})` : pTex;
    const m = Math.floor(k / 2);
    const isTrigCos = isCosTarget ? k % 2 === 1 : k % 2 === 0;
    const sign = isCosTarget
      ? (m % 2 === 0 ? 1 : -1)
      : isTrigCos
        ? (m % 2 === 0 ? -1 : 1)
        : (m % 2 === 0 ? 1 : -1);
    const sPfx = parts.length === 0 ? (sign < 0 ? "-" : "") : sign < 0 ? " - " : " + ";
    const trigName = isTrigCos ? "\\cos" : "\\sin";
    const powStr = k === 0 ? wVar : `${wVar}^${k + 1}`;
    parts.push(`${sPfx}${wrappedP}\\frac{${trigName}(${argVar})}{${powStr}}`);
    cur = cur.differentiate();
    k++;
  }
  return parts.join("") || "0";
}

function formatPolyExpBracket(poly: SymbolicPolynomial, argVar: string, wVar: string): string {
  // int P(t) e^{-j w t} dt = e^{-j w t} * sum_{k=0}^d ( - P^(k)(t) / (j w)^{k+1} )
  const terms: string[] = [];
  let cur: SymbolicPolynomial | null = poly;
  let k = 0;
  while (cur && !cur.isZero && k <= 6) {
    const pTex = cur.toLatex("t");
    const nonZeroCount = cur.coeffs.filter(c => Math.abs(c) > 1e-8).length;
    const wrappedP = !cur.isConstant && nonZeroCount > 1 ? `(${pTex})` : pTex;
    const den = k === 0 ? `j ${wVar}` : `(j ${wVar})^${k + 1}`;
    terms.push(` - \\frac{${wrappedP}}{${den}}`);
    cur = cur.differentiate();
    k++;
  }
  const body = terms.join("").replace(/^ - /, "-");
  return String.raw`e^{-j ${argVar}}\left( ${body} \right)`;
}

// ============================================================================
// 2. STEP-BY-STEP FOURIER SERIES CALCULUS DERIVATION
// ============================================================================

export type FullSeriesDerivation = Readonly<{
  trigSteps: readonly MathStep[];
  compactSteps: readonly MathStep[];
  complexSteps: readonly MathStep[];
}>;

/**
 * Exact step-by-step calculus derivation for ANY polynomial P(t) on [t1, t2] across
 * Trigonometric, Compact Cosine, and Complex Exponential representations.
 */
export function derivePolynomialSeriesCalculus(
  poly: SymbolicPolynomial,
  _exprStr: string,
  t1: number,
  t2: number,
  harmonics: readonly HarmonicCoefficient[],
): FullSeriesDerivation {
  const T0 = t2 - t1;
  const L = T0 / 2;
  const w0 = TAU / T0;
  const isSym = Math.abs(t1 + t2) < 1e-4;
  const isPi = isSym && Math.abs(t2 - PI) < 0.005;
  const isZeroStart = Math.abs(t1) < 1e-6;

  const t1Tex = isPi ? "-\\pi" : formatExactScalar(t1).tex;
  const t2Tex = isPi ? "\\pi" : formatExactScalar(t2).tex;
  const T0Tex = isPi ? "2\\pi" : formatExactScalar(T0).tex;
  const invT0 = isPi ? String.raw`\frac{1}{2\pi}` : formatExactScalar(1 / T0).tex;
  const halfInvL = isPi ? String.raw`\frac{1}{\pi}` : formatExactScalar(1 / L).tex;
  const twoOverL = isPi ? String.raw`\frac{2}{\pi}` : formatExactScalar(2 / L).tex;
  const wVar = isPi ? "n" : "n\\omega_0";
  const argVar = isPi ? "nt" : "n\\omega_0 t";

  const sigTex = poly.toLatex("t");
  const isEvenFn = poly.isEven && isSym;
  const isOddFn = poly.isOdd && isSym;

  // --------------------------------------------------------------------------
  // Exact a_0 & a_0/2 Derivation
  // --------------------------------------------------------------------------
  const anti0 = poly.integrate();
  const anti0Tex = anti0.toLatex("t");
  let a0Val = 0;
  let a0Tex = "0";
  let a0HalfTex = "0";
  let a0HalfTrailingTex = "0";
  let a0SetupLatex = "";
  let a0EvalLatex = "";

  if (isOddFn) {
    a0SetupLatex = String.raw`a_0 = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\,dt = 0 \quad (\text{odd integrand on symmetric interval})`;
    a0EvalLatex = String.raw`a_0 = 0 \implies \frac{a_0}{2} = 0`;
  } else if (isEvenFn && isPi) {
    // Exact symbolic polynomial in pi for [t^{k+1}/(k+1)]_0^pi
    const evenPiPoly = new SymbolicPolynomial(anti0.coeffs.slice(1).map(c => 2 * c)); // (2/pi)*F(pi)
    const halfPiPoly = new SymbolicPolynomial(anti0.coeffs.slice(1)); // (1/pi)*F(pi)
    a0Val = (2 / L) * anti0.evaluate(t2);
    const upperSubTex = anti0.toLatex("\\pi");
    a0Tex = evenPiPoly.toLatex("\\pi");
    a0HalfTex = halfPiPoly.toLatex("\\pi");
    a0HalfTrailingTex = halfPiPoly.toLatex("\\pi", true);
    a0SetupLatex = String.raw`a_0 = ${halfInvL}\int_{-\pi}^{\pi} (${sigTex})\,dt = ${twoOverL}\int_0^\pi (${sigTex})\,dt`;
    a0EvalLatex = String.raw`a_0 = ${twoOverL}\left[ ${anti0Tex} \right]_0^\pi = ${twoOverL}\left(${upperSubTex}\right) = ${a0Tex}`;
  } else if (isPi) {
    // General polynomial on [-pi, pi]: (F(pi) - F(-pi))/pi = sum_{even m} 2*c_m*pi^m
    const halfPiCoeffs = poly.coeffs.map((c, k) => (k % 2 === 0 ? c / (k + 1) : 0));
    const halfPiPoly = new SymbolicPolynomial(halfPiCoeffs);
    const fullPiPoly = halfPiPoly.scale(2);
    a0Val = (1 / L) * (anti0.evaluate(t2) - anti0.evaluate(t1));
    a0Tex = fullPiPoly.toLatex("\\pi");
    a0HalfTex = halfPiPoly.toLatex("\\pi");
    a0HalfTrailingTex = halfPiPoly.toLatex("\\pi", true);
    a0SetupLatex = String.raw`a_0 = \frac{1}{\pi}\int_{-\pi}^{\pi} (${sigTex})\,dt`;
    a0EvalLatex = String.raw`a_0 = \frac{1}{\pi}\left[ ${anti0Tex} \right]_{-\pi}^{\pi} = ${a0Tex}`;
  } else {
    const upperVal = anti0.evaluate(t2);
    const lowerVal = anti0.evaluate(t1);
    a0Val = (isEvenFn ? 2 / L : 1 / L) * (isEvenFn ? upperVal : upperVal - lowerVal);
    a0Tex = formatExactScalar(a0Val).tex;
    a0HalfTex = formatExactScalar(a0Val / 2).tex;
    a0HalfTrailingTex = a0HalfTex;
    a0SetupLatex = isEvenFn
      ? String.raw`a_0 = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\,dt = ${twoOverL}\int_0^{${t2Tex}} (${sigTex})\,dt`
      : String.raw`a_0 = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\,dt`;
    const subExpr = isEvenFn
      ? `${twoOverL}\\left(${formatExactScalar(upperVal).tex}\\right)`
      : `${halfInvL}\\left(${formatExactScalar(upperVal).tex} - (${formatExactScalar(lowerVal).tex})\\right)`;
    a0EvalLatex = String.raw`a_0 = ${isEvenFn ? twoOverL : halfInvL}\left[ ${anti0Tex} \right]_{${isEvenFn ? "0" : t1Tex}}^{${t2Tex}} = ${subExpr} = ${a0Tex}`;
  }

  // --------------------------------------------------------------------------
  // Build Derivative List for Analytical Boundary Differences
  // --------------------------------------------------------------------------
  const derivs: SymbolicPolynomial[] = [poly];
  while (!derivs[derivs.length - 1]!.isConstant && derivs.length <= 6) {
    derivs.push(derivs[derivs.length - 1]!.differentiate());
  }

  // On [-pi, pi], Delta P^(k) / pi is an exact polynomial in pi!
  // Compute symbolic closed forms for a_n, b_n, c_n dynamically for any polynomial.
  let anClosedForm = "0";
  let anEvalLatex = "";
  let anAntiderivLatex = "";
  let anSetupLatex = "";
  let anTitle = "Derivation of Cosine Coefficients a_n";
  let anNonZeroCount = 0;

  let bnClosedForm = "0";
  let bnSetupLatex = "";
  let bnAntiderivLatex = "";
  let bnEvalLatex = "";
  let bnTitle = "Derivation of Sine Coefficients b_n";
  let bnNonZeroCount = 0;

  const cosBracket = formatPolyTrigBracket(poly, argVar, wVar, true);
  const sinBracket = formatPolyTrigBracket(poly, argVar, wVar, false);

  if (isOddFn) {
    anTitle = "Derivation of Cosine Coefficients a_n (Odd Symmetry)";
    anSetupLatex = String.raw`a_n = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\cos(${argVar})\,dt = 0`;
  } else {
    anTitle = "Derivation of Cosine Coefficients a_n (Integration by Parts)";
    anSetupLatex = isEvenFn
      ? String.raw`a_n = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\cos(${argVar})\,dt = ${twoOverL}\int_0^{${t2Tex}} (${sigTex})\cos(${argVar})\,dt`
      : String.raw`a_n = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\cos(${argVar})\,dt`;
    anAntiderivLatex = isEvenFn
      ? String.raw`a_n = ${twoOverL}\left[ ${cosBracket} \right]_0^{${t2Tex}}`
      : String.raw`a_n = ${halfInvL}\left[ ${cosBracket} \right]_{${t1Tex}}^{${t2Tex}}`;

    if (isPi) {
      // Exact terms from odd derivatives P^(2m+1): a_n = (1/pi)*sum (-1)^m [P^(2m+1)(pi) - P^(2m+1)(-pi)] * cos(n*pi) / n^{2m+2}
      const termList: Array<{ sign: 1 | -1; coeffPoly: SymbolicPolynomial; pow: number }> = [];
      for (let m = 0; 2 * m + 1 < derivs.length; m++) {
        const dp = derivs[2 * m + 1]!;
        // (P^(2m+1)(pi) - P^(2m+1)(-pi)) / pi = sum_{even j} 2 * dp.coeffs[j+1] * pi^j (Wait: odd pows give 2*c*pi^{2r+1}, divided by pi gives 2*c*pi^{2r})
        const piCoeffs: number[] = [];
        for (let r = 0; r < dp.coeffs.length; r++) {
          piCoeffs.push(r % 2 === 1 ? 2 * dp.coeffs[r]! : 0);
        }
        // shift down by 1 power of pi
        const divPi = new SymbolicPolynomial(piCoeffs.slice(1));
        if (!divPi.isZero) {
          termList.push({ sign: m % 2 === 0 ? 1 : -1, coeffPoly: divPi, pow: 2 * m + 2 });
        }
      }
      anNonZeroCount = termList.length;
      if (termList.length === 0) {
        anEvalLatex = String.raw`a_n = 0 \quad (\sin(n\pi) = 0,\; \Delta P' = 0)`;
        anClosedForm = "0";
      } else if (termList.length === 1 && termList[0]!.coeffPoly.isConstant) {
        const t0Term = termList[0]!;
        const cVal = t0Term.sign * t0Term.coeffPoly.coeffs[0]!;
        const powTex = `n^${t0Term.pow}`;
        const cAbs = Math.abs(cVal);
        const sSign = cVal < 0 ? "-" : "";
        const numAbsTex = formatExactScalar(cAbs).tex;
        const innerEval = isEvenFn
          ? String.raw`\frac{2}{\pi}\left(\frac{${formatExactScalar(cVal / 2).tex}\pi\cos(n\pi)}{${powTex}} - 0\right)`
          : String.raw`\frac{1}{\pi}\left(\frac{${formatExactScalar(cVal).tex}\pi\cos(n\pi)}{${powTex}}\right)`;
        anClosedForm = String.raw`${sSign}\frac{${numAbsTex}(-1)^n}{${powTex}}`;
        anEvalLatex = String.raw`a_n = ${innerEval} = ${sSign}\frac{${numAbsTex}\cos(n\pi)}{${powTex}} = ${anClosedForm}`;
      } else {
        const inner = termList
          .map((t, idx) => {
            const pSigned = t.coeffPoly.scale(t.sign);
            const isSingle = pSigned.isConstant;
            const num = isSingle ? pSigned.toLatex("\\pi") : `(${pSigned.toLatex("\\pi")})`;
            const body = String.raw`\frac{${num}}{n^${t.pow}}`;
            return idx === 0 ? body : ` + ${body}`;
          })
          .join("");
        anClosedForm = String.raw`(-1)^n\left(${inner}\right)`;
        anEvalLatex = String.raw`a_n = \cos(n\pi)\left(${inner}\right) = ${anClosedForm}`;
      }
    } else if (isZeroStart) {
      const terms: string[] = [];
      for (let m = 0; 2 * m + 1 < derivs.length; m++) {
        const dp = derivs[2 * m + 1]!;
        const diff = (2 / T0) * (dp.evaluate(t2) - dp.evaluate(t1)) * (m % 2 === 0 ? 1 : -1);
        if (Math.abs(diff) > 1e-8) {
          const f = formatCoeffOverDen(diff, `(n\\omega_0)^${2 * m + 2}`);
          terms.push(terms.length === 0 ? f.signedTex : ` ${f.sign < 0 ? "-" : "+"} ${f.absTex}`);
        }
      }
      anNonZeroCount = terms.length;
      anClosedForm = terms.length > 0 ? terms.join("") : "0";
      anEvalLatex = String.raw`a_n = ${anClosedForm} \quad (\sin(2\pi n) = \sin(0) = 0,\; \cos(2\pi n) = 1)`;
    } else {
      const d1Cos = derivs.slice(1).filter((_, i) => i % 2 === 0).map(d => d.evaluate(t2) - d.evaluate(t1));
      const anyNonZero = d1Cos.some(v => Math.abs(v) > 1e-8) || !poly.isConstant;
      anNonZeroCount = anyNonZero ? 1 : 0;
      const num1 = harmonics[0] ? formatExactScalar(harmonics[0].an).tex : "a_1";
      anClosedForm = anyNonZero ? String.raw`a_n` : "0";
      anEvalLatex = anyNonZero
        ? String.raw`a_n\text{ via boundary evaluation at }[${t1Tex},\, ${t2Tex}],\quad a_1 = ${num1}`
        : String.raw`a_n = 0`;
    }
  }

  // b_n exact calculation
  if (isEvenFn) {
    bnTitle = "Derivation of Sine Coefficients b_n (Odd Integrand)";
    bnSetupLatex = String.raw`b_n = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\sin(${argVar})\,dt = 0`;
  } else {
    bnTitle = "Derivation of Sine Coefficients b_n (Integration by Parts)";
    bnSetupLatex = isOddFn
      ? String.raw`b_n = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\sin(${argVar})\,dt = ${twoOverL}\int_0^{${t2Tex}} (${sigTex})\sin(${argVar})\,dt`
      : String.raw`b_n = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\sin(${argVar})\,dt`;
    bnAntiderivLatex = isOddFn
      ? String.raw`b_n = ${twoOverL}\left[ ${sinBracket} \right]_0^{${t2Tex}}`
      : String.raw`b_n = ${halfInvL}\left[ ${sinBracket} \right]_{${t1Tex}}^{${t2Tex}}`;

    if (isPi) {
      // b_n = (1/pi)*sum (-1)^{m+1} [P^(2m)(pi) - P^(2m)(-pi)] * (-1)^n / n^{2m+1}
      const termList: Array<{ sign: 1 | -1; coeffPoly: SymbolicPolynomial; pow: number }> = [];
      for (let m = 0; 2 * m < derivs.length; m++) {
        const dp = derivs[2 * m]!;
        const piCoeffs: number[] = [];
        for (let r = 0; r < dp.coeffs.length; r++) {
          piCoeffs.push(r % 2 === 1 ? 2 * dp.coeffs[r]! : 0);
        }
        const divPi = new SymbolicPolynomial(piCoeffs.slice(1));
        if (!divPi.isZero) {
          // factor out (-1)^{n+1} = -(-1)^n; (-1)^{m+1} * (-1)^n = (-1)^m * (-1)^{n+1}
          termList.push({ sign: m % 2 === 0 ? 1 : -1, coeffPoly: divPi, pow: 2 * m + 1 });
        }
      }
      bnNonZeroCount = termList.length;
      if (termList.length === 0) {
        bnEvalLatex = String.raw`b_n = 0`;
        bnClosedForm = "0";
      } else if (termList.length === 1 && termList[0]!.coeffPoly.isConstant) {
        const t0Term = termList[0]!;
        const cVal = t0Term.sign * t0Term.coeffPoly.coeffs[0]!;
        const powTex = t0Term.pow === 1 ? "n" : `n^${t0Term.pow}`;
        const cAbs = Math.abs(cVal);
        const sSign = cVal < 0 ? "-" : "";
        const numAbsTex = formatExactScalar(cAbs).tex;
        const innerEval = isOddFn
          ? String.raw`\frac{2}{\pi}\left(-\frac{${formatExactScalar(cVal / 2).tex}\pi\cos(n\pi)}{${powTex}}\right)`
          : String.raw`\frac{1}{\pi}\left(-\frac{${formatExactScalar(cVal).tex}\pi\cos(n\pi)}{${powTex}}\right)`;
        bnClosedForm = String.raw`${sSign}\frac{${numAbsTex}(-1)^{n+1}}{${powTex}}`;
        bnEvalLatex = String.raw`b_n = ${innerEval} = ${bnClosedForm}`;
      } else {
        const inner = termList
          .map((t, idx) => {
            const pSigned = t.coeffPoly.scale(t.sign);
            const num = pSigned.isConstant ? pSigned.toLatex("\\pi") : `(${pSigned.toLatex("\\pi")})`;
            const powTex = t.pow === 1 ? "n" : `n^${t.pow}`;
            const body = String.raw`\frac{${num}}{${powTex}}`;
            return idx === 0 ? body : ` + ${body}`;
          })
          .join("");
        bnClosedForm = String.raw`(-1)^{n+1}\left(${inner}\right)`;
        bnEvalLatex = String.raw`b_n = (-1)^{n+1}\left(${inner}\right)`;
      }
    } else if (isZeroStart) {
      const terms: string[] = [];
      for (let m = 0; 2 * m < derivs.length; m++) {
        const dp = derivs[2 * m]!;
        const diff = (2 / T0) * (dp.evaluate(t2) - dp.evaluate(t1)) * (m % 2 === 0 ? -1 : 1);
        if (Math.abs(diff) > 1e-8) {
          const den = m === 0 ? "n\\omega_0" : `(n\\omega_0)^${2 * m + 1}`;
          const f = formatCoeffOverDen(diff, den);
          terms.push(terms.length === 0 ? f.signedTex : ` ${f.sign < 0 ? "-" : "+"} ${f.absTex}`);
        }
      }
      bnNonZeroCount = terms.length;
      bnClosedForm = terms.length > 0 ? terms.join("") : "0";
      bnEvalLatex = String.raw`b_n = ${bnClosedForm} \quad (\sin(2\pi n) = \sin(0) = 0,\; \cos(2\pi n) = 1)`;
    } else {
      const anyNonZero = !poly.isConstant;
      bnNonZeroCount = anyNonZero ? 1 : 0;
      const num1 = harmonics[0] ? formatExactScalar(harmonics[0].bn).tex : "b_1";
      bnClosedForm = anyNonZero ? String.raw`b_n` : "0";
      bnEvalLatex = anyNonZero
        ? String.raw`b_n\text{ via boundary evaluation at }[${t1Tex},\, ${t2Tex}],\quad b_1 = ${num1}`
        : String.raw`b_n = 0`;
    }
  }

  // --------------------------------------------------------------------------
  // 1. TRIGONOMETRIC SERIES STEPS (6 steps)
  // --------------------------------------------------------------------------
  const a0HalfPrefix = Math.abs(a0Val) < 1e-7 ? "" : `${wrapParensIfCompound(a0HalfTex)} + `;
  const infiniteTrigLatex = isEvenFn || bnClosedForm === "0"
    ? String.raw`f(t) = ${a0HalfPrefix}\sum_{n=1}^\infty ${anClosedForm}\cos(${argVar})`
    : isOddFn || anClosedForm === "0"
      ? String.raw`f(t) = ${a0HalfPrefix}\sum_{n=1}^\infty ${bnClosedForm}\sin(${argVar})`
      : String.raw`f(t) = ${a0HalfPrefix}\sum_{n=1}^\infty \left[ ${anClosedForm}\cos(${argVar}) + ${bnClosedForm}\sin(${argVar}) \right]`;

  const expandedTrigLatex = buildTrigExpanded(sigTex, a0Val / 2, a0HalfTex, w0, harmonics);

  const trigSteps: MathStep[] = [
    {
      title: "Signal Definition & Continuous Fourier Integrals",
      latex: String.raw`f(t) = ${sigTex}, \quad t \in [${t1Tex}, ${t2Tex}] \;\Longrightarrow\; a_0 = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\,dt,\;\; \binom{a_n}{b_n} = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\binom{\cos}{\sin}(${argVar})\,dt`,
    },
    {
      title: "Derivation of DC Component a₀ and a₀/2",
      latex: gathered([a0SetupLatex, String.raw`${a0EvalLatex} \implies \frac{a_0}{2} = ${a0HalfTex}`]),
    },
    {
      title: anTitle,
      latex: gathered([anSetupLatex, anAntiderivLatex, anEvalLatex]),
    },
    {
      title: bnTitle,
      latex: gathered([bnSetupLatex, bnAntiderivLatex, bnEvalLatex]),
    },
    {
      title: "Synthesized Infinite Fourier Series",
      latex: infiniteTrigLatex,
    },
    {
      title: "Expanded Fourier Series (First Harmonics)",
      latex: expandedTrigLatex,
    },
  ];

  // --------------------------------------------------------------------------
  // 2. COMPACT POLAR COSINE STEPS (6 steps — full parity with Trigonometric)
  // --------------------------------------------------------------------------
  let cnPolarClosed = "";
  let cnPolarDeriv = "";
  let thetaPolarClosed = "";

  if (bnClosedForm === "0" && anClosedForm !== "0") {
    // Pure cosine case
    const h1 = harmonics[0]?.an ?? 0;
    const h2 = harmonics[1]?.an ?? 0;
    if (anNonZeroCount === 1 && isPi) {
      // a_n = (+/- c)(-1)^n / n^p -> |a_n| strips sign and (-1)^n
      cnPolarClosed = anClosedForm.replace(/^-/, "").replace(/\(-1\)\^n/g, "");
    } else if (isZeroStart && !anClosedForm.includes("(-1)")) {
      cnPolarClosed = anClosedForm.startsWith("-") ? anClosedForm.slice(1) : anClosedForm;
    } else {
      cnPolarClosed = String.raw`\left|${anClosedForm}\right|`;
    }
    cnPolarDeriv = String.raw`C_n = \sqrt{a_n^2 + b_n^2} = \sqrt{\left(${anClosedForm}\right)^2 + 0} = ${cnPolarClosed}`;
    if (h1 * h2 < -1e-9) {
      const oddPhase = h1 < 0 ? "-\\pi" : "0";
      const evenPhase = h2 < 0 ? "-\\pi" : "0";
      thetaPolarClosed = String.raw`\theta_n = \operatorname{atan2}(-b_n, a_n) = \begin{cases} ${oddPhase}, & n\text{ odd} \\ ${evenPhase}, & n\text{ even} \end{cases}`;
    } else {
      const constPhase = h1 < 0 ? "-\\pi" : "0";
      thetaPolarClosed = String.raw`\theta_n = \operatorname{atan2}(-b_n, a_n) = ${constPhase}`;
    }
  } else if (anClosedForm === "0" && bnClosedForm !== "0") {
    // Pure sine case
    const h1 = harmonics[0]?.bn ?? 0;
    const h2 = harmonics[1]?.bn ?? 0;
    if (bnNonZeroCount === 1 && isPi) {
      cnPolarClosed = bnClosedForm.replace(/^-/, "").replace(/\(-1\)\^\{n\+1\}/g, "");
    } else {
      cnPolarClosed = String.raw`\left|${bnClosedForm}\right|`;
    }
    cnPolarDeriv = String.raw`C_n = \sqrt{0 + b_n^2} = \sqrt{\left(${bnClosedForm}\right)^2} = ${cnPolarClosed}`;
    if (h1 * h2 < -1e-9) {
      const oddPhase = h1 > 0 ? String.raw`-\frac{\pi}{2}` : String.raw`\frac{\pi}{2}`;
      const evenPhase = h2 > 0 ? String.raw`-\frac{\pi}{2}` : String.raw`\frac{\pi}{2}`;
      thetaPolarClosed = String.raw`\theta_n = \operatorname{atan2}(-b_n, 0) = \begin{cases} ${oddPhase}, & n\text{ odd} \\ ${evenPhase}, & n\text{ even} \end{cases}`;
    } else {
      const constPhase = h1 > 0 ? String.raw`-\frac{\pi}{2}` : String.raw`\frac{\pi}{2}`;
      thetaPolarClosed = String.raw`\theta_n = \operatorname{atan2}(-b_n, 0) = ${constPhase}`;
    }
  } else {
    cnPolarClosed = String.raw`\sqrt{\left(${anClosedForm}\right)^2 + \left(${bnClosedForm}\right)^2}`;
    cnPolarDeriv = String.raw`C_n = \sqrt{a_n^2 + b_n^2} = ${cnPolarClosed}`;
    thetaPolarClosed = String.raw`\theta_n = \operatorname{atan2}(-b_n, a_n)`;
  }

  const expandedCompactLatex = buildCompactExpanded(sigTex, a0Val / 2, a0HalfTex, w0, harmonics);
  const compactSteps: MathStep[] = [
    {
      title: "Compact Polar Cosine Series & Continuous Integrals",
      latex: String.raw`f(t) = C_0 + \sum_{n=1}^\infty C_n\cos(${argVar} + \theta_n), \quad C_0 = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\,dt,\;\; \binom{a_n}{b_n} = ${halfInvL}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\binom{\cos}{\sin}(${argVar})\,dt`,
    },
    {
      title: "Derivation of DC Component C₀ = a₀/2",
      latex: gathered([a0SetupLatex, String.raw`${a0EvalLatex} \implies C_0 = \frac{a_0}{2} = ${a0HalfTex}`]),
    },
    {
      title: "Derivation of Rectangular Components (a_n, b_n) by Integration by Parts",
      latex: gathered([anAntiderivLatex || anSetupLatex, anEvalLatex, bnAntiderivLatex || bnSetupLatex, bnEvalLatex]),
    },
    {
      title: "Conversion from Rectangular (a_n, b_n) to Polar (C_n, θ_n)",
      latex: gathered([String.raw`C_0 = ${a0HalfTex}`, cnPolarDeriv, thetaPolarClosed]),
    },
    {
      title: "Synthesized Compact Cosine Series",
      latex: String.raw`f(t) = ${a0HalfPrefix}\sum_{n=1}^\infty ${cnPolarClosed}\cos(${argVar} + \theta_n)`,
    },
    {
      title: "Expanded Polar Harmonics",
      latex: expandedCompactLatex,
    },
  ];

  // --------------------------------------------------------------------------
  // 3. COMPLEX EXPONENTIAL STEPS (6 steps — full parity with Trigonometric)
  // --------------------------------------------------------------------------
  const expBracket = formatPolyExpBracket(poly, argVar, wVar);
  const c0EvalLatex = isOddFn
    ? String.raw`c_0 = ${invT0}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\,dt = 0 \quad (\text{odd integrand})`
    : String.raw`c_0 = ${invT0}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})\,dt = ${invT0}\left[ ${anti0Tex} \right]_{${t1Tex}}^{${t2Tex}} = ${a0HalfTex}`;

  let cnClosedForm = "";
  let cnEvalStep = "";
  if (bnClosedForm === "0" && anClosedForm !== "0") {
    // c_n = a_n / 2
    if (isPi && anNonZeroCount === 1 && poly.degree === 2) {
      const lead = poly.coeffs[2]!;
      const c2 = 2 * lead;
      const numStr = c2 < 0 ? String.raw`-\frac{${Math.abs(c2)}(-1)^n}{n^2}` : String.raw`\frac{${c2}(-1)^n}{n^2}`;
      cnClosedForm = numStr;
      cnEvalStep = gathered([
        String.raw`e^{\mp j n\pi} = (-1)^n,\quad (jn)^2 = -n^2 \implies c_n = \frac{(-1)^n}{2\pi}\left(\frac{${formatExactScalar(4 * lead).tex}\pi}{n^2}\right) = ${cnClosedForm}`,
        String.raw`\text{Check via Euler: } c_n = \frac{a_n - j b_n}{2} = \frac{1}{2}\left(${anClosedForm}\right) = ${cnClosedForm}`,
      ]);
    } else {
      cnClosedForm = String.raw`\frac{1}{2}\left(${anClosedForm}\right)`;
      cnEvalStep = String.raw`e^{\mp j n\pi} = (-1)^n \implies c_n = \frac{a_n - j b_n}{2} = ${cnClosedForm}`;
    }
  } else if (anClosedForm === "0" && bnClosedForm !== "0") {
    if (isPi && bnNonZeroCount === 1 && poly.degree === 1) {
      const slope = poly.coeffs[1]!;
      const absS = Math.abs(slope);
      const sfx = slope < 0 ? "" : "-";
      const absTex = absS === 1 ? "" : formatExactScalar(absS).tex;
      cnClosedForm = String.raw`\frac{${sfx}j${absTex}(-1)^{n+1}}{n}`;
      cnEvalStep = gathered([
        String.raw`e^{\mp j n\pi} = (-1)^n \implies c_n = \frac{(-1)^n}{2\pi}\left(-\frac{${formatExactScalar(2 * slope).tex}\pi}{jn}\right) = ${cnClosedForm}`,
        String.raw`\text{Check via Euler: } c_n = \frac{-j b_n}{2} = ${cnClosedForm}`,
      ]);
    } else {
      cnClosedForm = String.raw`-\frac{j}{2}\left(${bnClosedForm}\right)`;
      cnEvalStep = String.raw`c_n = \frac{a_n - j b_n}{2} = ${cnClosedForm}`;
    }
  } else {
    cnClosedForm = String.raw`\frac{1}{2}\left(${anClosedForm} - j\,${bnClosedForm}\right)`;
    cnEvalStep = String.raw`c_n = \frac{a_n - j b_n}{2} = ${cnClosedForm}`;
  }

  const cpxInfiniteLatex = String.raw`f(t) = ${a0HalfPrefix}\sum_{\substack{n=-\infty \\ n\ne 0}}^\infty \left(${cnClosedForm}\right) e^{j ${argVar}}`;
  const wolframLatex = buildWolframPartialSums(a0Val / 2, a0HalfTex, a0HalfTrailingTex, w0, harmonics, 3);

  const complexSteps: MathStep[] = [
    {
      title: "Complex Exponential Fourier Series Definition",
      latex: String.raw`f(t) = \sum_{n=-\infty}^\infty c_n e^{j ${argVar}}, \quad c_n = \frac{1}{T_0}\int_{${t1Tex}}^{${t2Tex}} f(t)e^{-j ${argVar}}\,dt \quad (T_0 = ${T0Tex})`,
    },
    {
      title: "Derivation of DC Complex Coefficient c₀",
      latex: c0EvalLatex,
    },
    {
      title: "Complex Integration by Parts Antiderivative (n ≠ 0)",
      latex: gathered([
        String.raw`c_n = ${invT0}\int_{${t1Tex}}^{${t2Tex}} (${sigTex})e^{-j ${argVar}}\,dt`,
        String.raw`c_n = ${invT0}\left[ ${expBracket} \right]_{${t1Tex}}^{${t2Tex}}`,
      ]),
    },
    {
      title: "Boundary Substitution & Euler Simplification",
      latex: cnEvalStep,
    },
    {
      title: "Synthesized Complex Exponential Series",
      latex: cpxInfiniteLatex,
    },
    {
      title: "Wolfram-Style Partial Sums Values Table",
      latex: wolframLatex,
    },
  ];

  return { trigSteps, compactSteps, complexSteps };
}

// ============================================================================
// 3. STEP-BY-STEP FOURIER TRANSFORM CALCULUS DERIVATION
// ============================================================================

export function buildTransformCalculusDerivation(config: FourierTransformConfig): readonly MathStep[] {
  const A = config.amplitude;
  const tau = config.width;
  const t0 = config.shift;
  const ATex = formatExactScalar(A).tex;
  const tauTex = formatExactScalar(tau).tex;
  const shiftExpF = t0 === 0 ? "" : ` e^{-j 2\\pi f (${formatNumber(t0)})}`;

  switch (config.signalId) {
    case "rect": {
      const halfTauTex = formatExactScalar(tau / 2).tex;
      const areaTex = formatExactScalar(A * tau).tex;
      return [
        {
          title: "Continuous Fourier Transform Definition",
          latex: String.raw`X(f) = \int_{-\infty}^{\infty} x(t) e^{-j 2\pi f t}\,dt`,
        },
        {
          title: "Concrete Interval Bounds for Rectangular Pulse",
          latex: String.raw`x(t) = ${ATex}\operatorname{rect}\!\left(\frac{t}{${tauTex}}\right) = \begin{cases} ${ATex}, & -${halfTauTex} \le t \le ${halfTauTex} \\ 0, & \text{otherwise} \end{cases} \implies X(f) = \int_{-${halfTauTex}}^{${halfTauTex}} ${ATex} e^{-j 2\pi f t}\,dt`,
        },
        {
          title: "Antiderivative in Evaluation Brackets",
          latex: String.raw`X(f) = ${ATex}\left[ \frac{e^{-j 2\pi f t}}{-j 2\pi f} \right]_{-${halfTauTex}}^{${halfTauTex}} = ${ATex}\left( \frac{e^{-j \pi f (${tauTex})} - e^{j \pi f (${tauTex})}}{-j 2\pi f} \right)`,
        },
        {
          title: "Apply Euler Identity: e^{jθ} - e^{-jθ} = 2j sin(θ)",
          latex: String.raw`X(f) = ${ATex}\left( \frac{e^{j \pi f (${tauTex})} - e^{-j \pi f (${tauTex})}}{2j \cdot \pi f} \right) = ${ATex}\frac{\sin(\pi f (${tauTex}))}{\pi f} = ${areaTex}\frac{\sin(\pi (${tauTex}) f)}{\pi (${tauTex}) f}`,
        },
        {
          title: "Normalized Sinc Closed Form",
          latex: String.raw`X(f) = ${areaTex}\operatorname{sinc}(${tau === 1 ? "" : `${tauTex}\\,`}f)${shiftExpF}`,
        },
      ];
    }

    case "exponential": {
      const a = config.decayRate;
      const aTex = formatExactScalar(a).tex;
      return [
        {
          title: "One-Sided Causal Exponential Transform Integral",
          latex: String.raw`X(f) = \int_0^\infty ${ATex} e^{-${aTex} t} e^{-j 2\pi f t}\,dt = ${ATex}\int_0^\infty e^{-(${aTex} + j 2\pi f)t}\,dt`,
        },
        {
          title: "Antiderivative in Evaluation Brackets",
          latex: String.raw`X(f) = ${ATex}\left[ \frac{e^{-(${aTex} + j 2\pi f)t}}{-(${aTex} + j 2\pi f)} \right]_0^\infty = ${ATex}\left( 0 - \frac{1}{-(${aTex} + j 2\pi f)} \right)`,
        },
        {
          title: "Concise Rational Closed Form",
          latex: String.raw`X(f) = \frac{${ATex}}{${aTex} + j 2\pi f}${shiftExpF}`,
        },
        {
          title: "Magnitude & Phase Spectra Decomposition",
          latex: String.raw`|X(f)| = \frac{${ATex}}{\sqrt{(${aTex})^2 + (2\pi f)^2}}, \quad \angle X(f) = -\arctan\!\left(\frac{2\pi f}{${aTex}}\right)`,
        },
      ];
    }

    case "tri": {
      const areaTex = formatExactScalar(A * tau).tex;
      return [
        {
          title: "Continuous Transform Definition on Triangular Support",
          latex: String.raw`x(t) = ${ATex}\left(1 - \frac{|t|}{${tauTex}}\right)\operatorname{rect}\!\left(\frac{t}{2(${tauTex})}\right) \implies X(f) = 2\int_0^{${tauTex}} ${ATex}\left(1 - \frac{t}{${tauTex}}\right)\cos(2\pi f t)\,dt`,
        },
        {
          title: "Integration by Parts in Evaluation Brackets",
          latex: String.raw`X(f) = 2(${ATex})\left[ \left(1 - \frac{t}{${tauTex}}\right)\frac{\sin(2\pi f t)}{2\pi f} - \frac{1}{${tauTex}}\frac{\cos(2\pi f t)}{(2\pi f)^2} \right]_0^{${tauTex}} = \frac{2(${ATex})}{${tauTex}(2\pi f)^2}\left(1 - \cos(2\pi f (${tauTex}))\right)`,
        },
        {
          title: "Trigonometric Half-Angle Identity: 1 - cos(2θ) = 2 sin²(θ)",
          latex: String.raw`1 - \cos(2\pi f (${tauTex})) = 2\sin^2(\pi f (${tauTex})) \implies X(f) = ${ATex}(${tauTex})\left(\frac{\sin(\pi f (${tauTex}))}{\pi f (${tauTex})}\right)^2`,
        },
        {
          title: "Squared Sinc Closed Form",
          latex: String.raw`X(f) = ${areaTex}\operatorname{sinc}^2(${tau === 1 ? "" : `${tauTex}\\,`}f)${shiftExpF}`,
        },
      ];
    }

    case "gaussian": {
      const areaTex = formatExactScalar(A * tau).tex;
      return [
        {
          title: "Gaussian Fourier Integral",
          latex: String.raw`X(f) = \int_{-\infty}^\infty ${ATex} e^{-\pi(t/${tauTex})^2} e^{-j 2\pi f t}\,dt = ${ATex}\int_{-\infty}^\infty e^{-\frac{\pi}{(${tauTex})^2}\left(t^2 + j 2(${tauTex})^2 f t\right)}\,dt`,
        },
        {
          title: "Complete the Square in Exponent",
          latex: String.raw`t^2 + j 2(${tauTex})^2 f t = \left(t + j (${tauTex})^2 f\right)^2 + (${tauTex})^4 f^2 \implies X(f) = ${ATex} e^{-\pi (${tauTex} f)^2}\int_{-\infty}^\infty e^{-\frac{\pi}{(${tauTex})^2}\left(t + j (${tauTex})^2 f\right)^2}\,dt`,
        },
        {
          title: "Euler-Poisson Gaussian Integral Identity",
          latex: String.raw`\int_{-\infty}^\infty e^{-a u^2}\,du = \sqrt{\frac{\pi}{a}} \quad\text{with } a = \frac{\pi}{(${tauTex})^2} \implies \sqrt{\frac{\pi}{\pi/(${tauTex})^2}} = ${tauTex}`,
        },
        {
          title: "Self-Dual Gaussian Closed Form",
          latex: String.raw`X(f) = ${areaTex} e^{-\pi (${tau === 1 ? "" : `${tauTex}\\,`}f)^2}${shiftExpF}`,
        },
      ];
    }

    case "modulated-rect": {
      const f0Tex = formatExactScalar(config.modFreqHz).tex;
      const halfArea = formatExactScalar(0.5 * A * tau).tex;
      return [
        {
          title: "Baseband Pulse Transform Pair",
          latex: String.raw`x_0(t) = ${ATex}\operatorname{rect}\!\left(\frac{t}{${tauTex}}\right) \;\Longleftrightarrow\; X_0(f) = ${formatExactScalar(A * tau).tex}\operatorname{sinc}(${tauTex} f)`,
        },
        {
          title: "Euler Modulation Property",
          latex: String.raw`x(t) = x_0(t)\cos(2\pi f_0 t) = x_0(t)\left(\frac{e^{j 2\pi f_0 t} + e^{-j 2\pi f_0 t}}{2}\right) \;\Longleftrightarrow\; X(f) = \frac{1}{2}\left[ X_0(f - f_0) + X_0(f + f_0) \right]`,
        },
        {
          title: "Carrier Modulation Closed Form",
          latex: String.raw`X(f) = ${halfArea}\Big[\operatorname{sinc}(${tauTex}(f - ${f0Tex})) + \operatorname{sinc}(${tauTex}(f + ${f0Tex}))\Big]${shiftExpF}`,
        },
      ];
    }

    case "custom": {
      const clean = config.customExpr.trim();
      const expAbs = clean.match(/^(?:([0-9.]+)\s*\*?\s*)?exp\(\s*-\s*([0-9.]+)\s*\*?\s*abs\(\s*t\s*\)\s*\)$/i);
      if (expAbs) {
        const amp = expAbs[1] ? Number(expAbs[1]) : 1;
        const a = Number(expAbs[2]);
        const ampTex = formatExactScalar(amp).tex;
        const aTex = formatExactScalar(a).tex;
        const num = formatExactScalar(2 * amp * a).tex;
        const a2 = formatExactScalar(a * a).tex;
        return [
          {
            title: "Split Two-Sided Exponential Integral across t = 0",
            latex: String.raw`X(f) = \int_{-\infty}^0 ${ampTex} e^{${aTex} t} e^{-j 2\pi f t}\,dt + \int_0^\infty ${ampTex} e^{-${aTex} t} e^{-j 2\pi f t}\,dt`,
          },
          {
            title: "Antiderivatives in Evaluation Brackets",
            latex: String.raw`X(f) = ${ampTex}\left[ \frac{e^{(${aTex} - j 2\pi f)t}}{${aTex} - j 2\pi f} \right]_{-\infty}^0 + ${ampTex}\left[ \frac{e^{-(${aTex} + j 2\pi f)t}}{-(${aTex} + j 2\pi f)} \right]_0^\infty`,
          },
          {
            title: "Evaluate Boundary Limits",
            latex: String.raw`X(f) = ${ampTex}\left( \frac{1 - 0}{${aTex} - j 2\pi f} \right) + ${ampTex}\left( 0 - \frac{1}{-(${aTex} + j 2\pi f)} \right) = \frac{${ampTex}}{${aTex} - j 2\pi f} + \frac{${ampTex}}{${aTex} + j 2\pi f}`,
          },
          {
            title: "Combine Fractions over Common Denominator",
            latex: String.raw`X(f) = \frac{${ampTex}(${aTex} + j 2\pi f) + ${ampTex}(${aTex} - j 2\pi f)}{(${aTex})^2 + (2\pi f)^2} = \frac{${num}}{${a2} + 4\pi^2 f^2}`,
          },
        ];
      }

      const poly = tryParsePolynomial(clean);
      if (poly) {
        const tMinTex = formatExactScalar(config.timeMin).tex;
        const tMaxTex = formatExactScalar(config.timeMax).tex;
        const polyTex = poly.toLatex("t");
        const expBracket = formatPolyExpBracket(poly, String.raw`2\pi f t`, String.raw`2\pi f`);
        return [
          {
            title: "Fourier Integral on Finite Window",
            latex: String.raw`X(f) = \int_{${tMinTex}}^{${tMaxTex}} (${polyTex}) e^{-j 2\pi f t}\,dt`,
          },
          {
            title: "Complex Integration by Parts in Evaluation Brackets",
            latex: String.raw`X(f) = \left[ ${expBracket} \right]_{${tMinTex}}^{${tMaxTex}}`,
          },
          {
            title: "Real & Imaginary Quadrature Decomposition",
            latex: String.raw`X(f) = \int_{${tMinTex}}^{${tMaxTex}} (${polyTex})\cos(2\pi f t)\,dt - j\int_{${tMinTex}}^{${tMaxTex}} (${polyTex})\sin(2\pi f t)\,dt`,
          },
        ];
      }

      return [];
    }
  }
}

// ============================================================================
// 4. PRESET & PIECEWISE STEP-BY-STEP FOURIER SERIES CALCULUS DERIVATIONS
// ============================================================================

export function deriveSquareWaveCalculus(
  amplitude: number,
  period: number,
  harmonics: readonly HarmonicCoefficient[],
): FullSeriesDerivation {
  const A = amplitude;
  const T0 = period;
  const w0 = TAU / T0;
  const ATex = formatExactScalar(A).tex;
  const fourA = formatExactScalar(4 * A).tex;
  const twoA = formatExactScalar(2 * A).tex;
  const w0Tex = formatExactScalar(w0).tex;
  const halfT0 = formatExactScalar(T0 / 2).tex;
  const T0Tex = formatExactScalar(T0).tex;
  const wArg = wArgTex(w0);

  const a0Step = String.raw`a_0 = \frac{1}{${T0Tex}}\left( \int_0^{${halfT0}} ${ATex}\,dt - \int_{${halfT0}}^{${T0Tex}} ${ATex}\,dt \right) = \frac{${ATex}}{${T0Tex}}\left( [t]_0^{${halfT0}} - [t]_{${halfT0}}^{${T0Tex}} \right) = 0 \implies \frac{a_0}{2} = 0`;
  const anStep = String.raw`f(-t) = -f(t) \implies a_n = \frac{2}{${T0Tex}}\int_0^{${T0Tex}} f(t)\cos(${wArg})\,dt = 0`;
  const bnLines = [
    String.raw`b_n = \frac{2}{${T0Tex}}\left[ \int_0^{${halfT0}} ${ATex}\sin(${wArg})\,dt - \int_{${halfT0}}^{${T0Tex}} ${ATex}\sin(${wArg})\,dt \right]`,
    String.raw`b_n = \frac{2(${ATex})}{${T0Tex}}\left( \left[ -\frac{\cos(${wArg})}{${w0 === 1 ? "n" : "n\\omega_0"}} \right]_0^{${halfT0}} - \left[ -\frac{\cos(${wArg})}{${w0 === 1 ? "n" : "n\\omega_0"}} \right]_{${halfT0}}^{${T0Tex}} \right)`,
    String.raw`b_n = \frac{${twoA}(1 - (-1)^n)}{n\pi} = \begin{cases} \frac{${fourA}}{n\pi}, & n\text{ odd} \\ 0, & n\text{ even} \end{cases}`,
  ];

  const trigSteps: MathStep[] = [
    {
      title: "Signal Definition & Continuous Fourier Integrals",
      latex: String.raw`f(t) = \begin{cases} ${ATex}, & 0 \le t < ${halfT0} \\ -${ATex}, & ${halfT0} \le t < ${T0Tex} \end{cases} \;\Longrightarrow\; \binom{a_n}{b_n} = \frac{2}{${T0Tex}}\int_0^{${T0Tex}} f(t)\binom{\cos}{\sin}(${wArg})\,dt`,
    },
    { title: "Derivation of DC Component a₀ (Zero Average)", latex: a0Step },
    { title: "Derivation of Cosine Coefficients a_n (Odd Symmetry)", latex: anStep },
    { title: "Derivation of Sine Coefficients b_n (Integration Across Half-Periods)", latex: gathered(bnLines) },
    {
      title: "Synthesized Infinite Fourier Series",
      latex: String.raw`f(t) = \sum_{k=1}^\infty \frac{${fourA}}{(2k-1)\pi} \sin\!\left(${wArgTex(w0, "(2k-1)")}\right) \quad\text{with } \omega_0 = ${w0Tex}`,
    },
    {
      title: "Expanded Fourier Series (First Harmonics)",
      latex: buildTrigExpanded("f(t)", 0, "0", w0, harmonics),
    },
  ];

  const compactSteps: MathStep[] = [
    {
      title: "Compact Polar Cosine Series & Continuous Integrals",
      latex: String.raw`f(t) = C_0 + \sum_{n=1}^\infty C_n\cos(${wArg} + \theta_n), \quad C_n = \sqrt{a_n^2 + b_n^2},\;\; \theta_n = \operatorname{atan2}(-b_n, a_n)`,
    },
    { title: "Derivation of DC Component C₀ = a₀/2", latex: a0Step },
    {
      title: "Derivation of Rectangular Components (a_n, b_n) Across Half-Periods",
      latex: gathered([anStep, ...bnLines]),
    },
    {
      title: "Conversion from Rectangular to Polar",
      latex: gathered([
        String.raw`C_0 = 0`,
        String.raw`C_n = |b_n| = \frac{${fourA}}{n\pi} \quad (n\text{ odd})`,
        String.raw`\theta_n = \operatorname{atan2}(-b_n, 0) = -\frac{\pi}{2}`,
      ]),
    },
    {
      title: "Synthesized Compact Cosine Series",
      latex: String.raw`f(t) = \sum_{k=1}^\infty \frac{${fourA}}{(2k-1)\pi} \cos\!\left(${wArgTex(w0, "(2k-1)")} - \frac{\pi}{2}\right)`,
    },
    {
      title: "Expanded Polar Harmonics",
      latex: buildCompactExpanded("f(t)", 0, "0", w0, harmonics),
    },
  ];

  const complexSteps: MathStep[] = [
    {
      title: "Complex Exponential Fourier Series Definition",
      latex: String.raw`f(t) = \sum_{n=-\infty}^\infty c_n e^{j ${wArg}}, \quad c_n = \frac{1}{${T0Tex}}\int_0^{${T0Tex}} f(t)e^{-j ${wArg}}\,dt`,
    },
    {
      title: "Derivation of DC Complex Coefficient c₀",
      latex: String.raw`c_0 = \frac{1}{${T0Tex}}\left(\int_0^{${halfT0}} ${ATex}\,dt - \int_{${halfT0}}^{${T0Tex}} ${ATex}\,dt\right) = 0`,
    },
    {
      title: "Complex Half-Period Integration Brackets (n ≠ 0)",
      latex: gathered([
        String.raw`c_n = \frac{1}{${T0Tex}}\left( \int_0^{${halfT0}} ${ATex}e^{-j ${wArg}}\,dt - \int_{${halfT0}}^{${T0Tex}} ${ATex}e^{-j ${wArg}}\,dt \right)`,
        String.raw`c_n = \frac{${ATex}}{${T0Tex}}\left( \left[ \frac{e^{-j ${wArg}}}{-j n\omega_0} \right]_0^{${halfT0}} - \left[ \frac{e^{-j ${wArg}}}{-j n\omega_0} \right]_{${halfT0}}^{${T0Tex}} \right)`,
      ]),
    },
    {
      title: "Boundary Substitution & Euler Simplification",
      latex: gathered([
        String.raw`e^{-j n\omega_0 T_0/2} = e^{-j n\pi} = (-1)^n,\quad e^{-j n\omega_0 T_0} = 1`,
        String.raw`c_n = \frac{${ATex}(1 - (-1)^n)}{j n\pi} = \begin{cases} \frac{${twoA}}{j n\pi}, & n\text{ odd} \\ 0, & n\text{ even} \end{cases}`,
      ]),
    },
    {
      title: "Synthesized Two-Sided Complex Series",
      latex: String.raw`f(t) = \sum_{k=-\infty}^\infty \frac{${twoA}}{j (2k-1)\pi} e^{j ${wArgTex(w0, "(2k-1)")}}`,
    },
    {
      title: "Wolfram-Style Partial Sums Values Table",
      latex: buildWolframPartialSums(0, "0", "0", w0, harmonics, 3),
    },
  ];

  return { trigSteps, compactSteps, complexSteps };
}

export function deriveSawtoothCalculus(
  amplitude: number,
  period: number,
  harmonics: readonly HarmonicCoefficient[],
): FullSeriesDerivation {
  const A = amplitude;
  const T0 = period;
  const w0 = TAU / T0;
  const ATex = formatExactScalar(A).tex;
  const twoA = formatExactScalar(2 * A).tex;
  const w0Tex = formatExactScalar(w0).tex;
  const T0Tex = formatExactScalar(T0).tex;
  const wArg = wArgTex(w0);
  const rampTex = String.raw`\frac{2(${ATex})}{${T0Tex}}t - ${ATex}`;

  const a0Step = String.raw`a_0 = \frac{1}{${T0Tex}}\int_0^{${T0Tex}} \left(${rampTex}\right)dt = \frac{1}{${T0Tex}}\left[ \frac{${ATex}}{${T0Tex}}t^2 - ${ATex} t \right]_0^{${T0Tex}} = 0 \implies \frac{a_0}{2} = 0`;
  const anLines = [
    String.raw`a_n = \frac{2}{${T0Tex}}\int_0^{${T0Tex}} \left(${rampTex}\right)\cos(${wArg})\,dt`,
    String.raw`a_n = \frac{4(${ATex})}{(${T0Tex})^2}\left[ t\frac{\sin(${wArg})}{n\omega_0} + \frac{\cos(${wArg})}{(n\omega_0)^2} \right]_0^{${T0Tex}} = 0`,
  ];
  const bnLines = [
    String.raw`b_n = \frac{2}{${T0Tex}}\int_0^{${T0Tex}} \left(${rampTex}\right)\sin(${wArg})\,dt`,
    String.raw`b_n = \frac{4(${ATex})}{(${T0Tex})^2}\left[ -t\frac{\cos(${wArg})}{n\omega_0} + \frac{\sin(${wArg})}{(n\omega_0)^2} \right]_0^{${T0Tex}} - \frac{2(${ATex})}{${T0Tex}}\left[ -\frac{\cos(${wArg})}{n\omega_0} \right]_0^{${T0Tex}} = -\frac{${twoA}}{n\pi}`,
  ];

  const trigSteps: MathStep[] = [
    {
      title: "Signal Definition & Continuous Fourier Integrals",
      latex: String.raw`f(t) = ${rampTex}, \quad t \in [0, ${T0Tex}) \;\Longrightarrow\; \binom{a_n}{b_n} = \frac{2}{${T0Tex}}\int_0^{${T0Tex}} f(t)\binom{\cos}{\sin}(${wArg})\,dt`,
    },
    { title: "Derivation of DC Component a₀", latex: a0Step },
    { title: "Derivation of Cosine Coefficients a_n (Integration by Parts)", latex: gathered(anLines) },
    { title: "Derivation of Sine Coefficients b_n (Integration by Parts)", latex: gathered(bnLines) },
    {
      title: "Synthesized Infinite Fourier Series",
      latex: String.raw`f(t) = \sum_{n=1}^\infty -\frac{${twoA}}{n\pi}\sin(${wArg}) \quad\text{with } \omega_0 = ${w0Tex}`,
    },
    {
      title: "Expanded Fourier Series (First Harmonics)",
      latex: buildTrigExpanded("f(t)", 0, "0", w0, harmonics),
    },
  ];

  const compactSteps: MathStep[] = [
    {
      title: "Compact Polar Cosine Series & Continuous Integrals",
      latex: String.raw`f(t) = C_0 + \sum_{n=1}^\infty C_n\cos(${wArg} + \theta_n), \quad C_n = \sqrt{a_n^2 + b_n^2},\;\; \theta_n = \operatorname{atan2}(-b_n, a_n)`,
    },
    { title: "Derivation of DC Component C₀ = a₀/2", latex: a0Step },
    { title: "Derivation of Rectangular Components (a_n, b_n) by Integration by Parts", latex: gathered([...anLines, ...bnLines]) },
    {
      title: "Conversion from Rectangular to Polar",
      latex: gathered([
        String.raw`C_0 = 0`,
        String.raw`C_n = |b_n| = \frac{${twoA}}{n\pi}`,
        String.raw`\theta_n = \operatorname{atan2}(-b_n, 0) = \frac{\pi}{2}`,
      ]),
    },
    {
      title: "Synthesized Compact Cosine Series",
      latex: String.raw`f(t) = \sum_{n=1}^\infty \frac{${twoA}}{n\pi}\cos\!\left(${wArg} + \frac{\pi}{2}\right)`,
    },
    {
      title: "Expanded Polar Harmonics",
      latex: buildCompactExpanded("f(t)", 0, "0", w0, harmonics),
    },
  ];

  const complexSteps: MathStep[] = [
    {
      title: "Complex Exponential Fourier Series Definition",
      latex: String.raw`f(t) = \sum_{n=-\infty}^\infty c_n e^{j ${wArg}}, \quad c_n = \frac{1}{${T0Tex}}\int_0^{${T0Tex}} f(t)e^{-j ${wArg}}\,dt`,
    },
    {
      title: "Derivation of DC Complex Coefficient c₀",
      latex: String.raw`c_0 = \frac{1}{${T0Tex}}\int_0^{${T0Tex}} \left(${rampTex}\right)dt = \frac{1}{${T0Tex}}\left[ \frac{${ATex}}{${T0Tex}}t^2 - ${ATex}t \right]_0^{${T0Tex}} = 0`,
    },
    {
      title: "Complex Integration by Parts Antiderivative (n ≠ 0)",
      latex: gathered([
        String.raw`c_n = \frac{1}{${T0Tex}}\int_0^{${T0Tex}} \left(${rampTex}\right)e^{-j ${wArg}}\,dt`,
        String.raw`c_n = \frac{1}{${T0Tex}}\left[ e^{-j ${wArg}}\left( -\frac{${rampTex}}{j n\omega_0} - \frac{2(${ATex})/${T0Tex}}{(j n\omega_0)^2} \right) \right]_0^{${T0Tex}}`,
      ]),
    },
    {
      title: "Boundary Substitution & Euler Simplification",
      latex: gathered([
        String.raw`e^{-j n\omega_0 ${T0Tex}} = e^{-j 2\pi n} = 1,\quad \omega_0 T_0 = 2\pi`,
        String.raw`c_n = \frac{1}{${T0Tex}}\left( -\frac{2(${ATex})\cdot ${T0Tex}}{j 2\pi n} \right) = \frac{j ${ATex}}{n\pi} \quad (n\ne 0)`,
      ]),
    },
    {
      title: "Synthesized Two-Sided Complex Series",
      latex: String.raw`f(t) = \sum_{\substack{n=-\infty \\ n\ne 0}}^\infty \frac{j ${ATex}}{n\pi} e^{j ${wArg}}`,
    },
    {
      title: "Wolfram-Style Partial Sums Values Table",
      latex: buildWolframPartialSums(0, "0", "0", w0, harmonics, 3),
    },
  ];

  return { trigSteps, compactSteps, complexSteps };
}

export function deriveTriangleCalculus(
  amplitude: number,
  period: number,
  harmonics: readonly HarmonicCoefficient[],
): FullSeriesDerivation {
  const A = amplitude;
  const T0 = period;
  const w0 = TAU / T0;
  const ATex = formatExactScalar(A).tex;
  const eightA = formatExactScalar(8 * A).tex;
  const fourA = formatExactScalar(4 * A).tex;
  const w0Tex = formatExactScalar(w0).tex;
  const halfT0 = formatExactScalar(T0 / 2).tex;
  const T0Tex = formatExactScalar(T0).tex;
  const wArg = wArgTex(w0);
  const triHalfTex = String.raw`${ATex}\left(1 - \frac{4t}{${T0Tex}}\right)`;

  const a0Step = String.raw`a_0 = \frac{2}{${T0Tex}}\int_0^{${halfT0}} ${triHalfTex}\,dt = \frac{2(${ATex})}{${T0Tex}}\left[ t - \frac{2t^2}{${T0Tex}} \right]_0^{${halfT0}} = 0 \implies \frac{a_0}{2} = 0`;
  const anLines = [
    String.raw`a_n = \frac{4}{${T0Tex}}\int_0^{${halfT0}} ${triHalfTex}\cos(${wArg})\,dt`,
    String.raw`a_n = \frac{4(${ATex})}{${T0Tex}}\left[ \left(1 - \frac{4t}{${T0Tex}}\right)\frac{\sin(${wArg})}{n\omega_0} - \frac{4}{${T0Tex}}\frac{\cos(${wArg})}{(n\omega_0)^2} \right]_0^{${halfT0}}`,
    String.raw`a_n = \frac{${fourA}}{\pi^2 n^2}(1 - (-1)^n) = \begin{cases} \frac{${eightA}}{\pi^2 n^2}, & n\text{ odd} \\ 0, & n\text{ even} \end{cases}`,
  ];
  const bnStep = String.raw`f(-t) = f(t) \implies b_n = \frac{2}{${T0Tex}}\int_{-T_0/2}^{T_0/2} f(t)\sin(${wArg})\,dt = 0`;

  const trigSteps: MathStep[] = [
    {
      title: "Signal Definition & Continuous Fourier Integrals",
      latex: String.raw`f(t) = ${triHalfTex}\;\text{on }[0, ${halfT0}]\;\text{(even)} \;\Longrightarrow\; a_n = \frac{4}{${T0Tex}}\int_0^{${halfT0}} f(t)\cos(${wArg})\,dt`,
    },
    { title: "Derivation of DC Component a₀", latex: a0Step },
    { title: "Derivation of Cosine Coefficients a_n (Integration by Parts)", latex: gathered(anLines) },
    { title: "Derivation of Sine Coefficients b_n (Even Symmetry)", latex: bnStep },
    {
      title: "Synthesized Infinite Fourier Series",
      latex: String.raw`f(t) = \sum_{k=1}^\infty \frac{${eightA}}{\pi^2 (2k-1)^2} \cos\!\left(${wArgTex(w0, "(2k-1)")}\right) \quad\text{with } \omega_0 = ${w0Tex}`,
    },
    {
      title: "Expanded Fourier Series (First Harmonics)",
      latex: buildTrigExpanded("f(t)", 0, "0", w0, harmonics),
    },
  ];

  const compactSteps: MathStep[] = [
    {
      title: "Compact Polar Cosine Series & Continuous Integrals",
      latex: String.raw`f(t) = C_0 + \sum_{n=1}^\infty C_n\cos(${wArg} + \theta_n), \quad C_n = \sqrt{a_n^2 + b_n^2},\;\; \theta_n = \operatorname{atan2}(-b_n, a_n)`,
    },
    { title: "Derivation of DC Component C₀ = a₀/2", latex: a0Step },
    { title: "Derivation of Rectangular Components (a_n, b_n) by Integration by Parts", latex: gathered([...anLines, bnStep]) },
    {
      title: "Conversion from Rectangular to Polar",
      latex: gathered([
        String.raw`C_0 = 0`,
        String.raw`C_n = |a_n| = \frac{${eightA}}{\pi^2 n^2} \quad (n\text{ odd})`,
        String.raw`\theta_n = \operatorname{atan2}(0, a_n) = 0`,
      ]),
    },
    {
      title: "Synthesized Compact Cosine Series",
      latex: String.raw`f(t) = \sum_{k=1}^\infty \frac{${eightA}}{\pi^2 (2k-1)^2} \cos\!\left(${wArgTex(w0, "(2k-1)")}\right)`,
    },
    {
      title: "Expanded Polar Harmonics",
      latex: buildCompactExpanded("f(t)", 0, "0", w0, harmonics),
    },
  ];

  const complexSteps: MathStep[] = [
    {
      title: "Complex Exponential Fourier Series Definition",
      latex: String.raw`f(t) = \sum_{n=-\infty}^\infty c_n e^{j ${wArg}}, \quad c_n = \frac{1}{${T0Tex}}\int_0^{${T0Tex}} f(t)e^{-j ${wArg}}\,dt`,
    },
    { title: "Derivation of DC Complex Coefficient c₀", latex: String.raw`c_0 = \frac{a_0}{2} = 0` },
    {
      title: "Complex Integration by Parts (Even Cosine Reduction, n ≠ 0)",
      latex: gathered([
        String.raw`c_n = \frac{2}{${T0Tex}}\int_0^{${halfT0}} ${triHalfTex}\cos(${wArg})\,dt`,
        String.raw`c_n = \frac{2(${ATex})}{${T0Tex}}\left[ \left(1 - \frac{4t}{${T0Tex}}\right)\frac{\sin(${wArg})}{n\omega_0} - \frac{4}{${T0Tex}}\frac{\cos(${wArg})}{(n\omega_0)^2} \right]_0^{${halfT0}}`,
      ]),
    },
    {
      title: "Boundary Substitution & Euler Simplification",
      latex: String.raw`\cos(n\pi) = (-1)^n \implies c_n = \frac{a_n}{2} = \begin{cases} \frac{${fourA}}{\pi^2 n^2}, & n\text{ odd} \\ 0, & n\text{ even} \end{cases}`,
    },
    {
      title: "Synthesized Two-Sided Complex Series",
      latex: String.raw`f(t) = \sum_{k=-\infty}^\infty \frac{${fourA}}{\pi^2 (2k-1)^2} e^{j ${wArgTex(w0, "(2k-1)")}}`,
    },
    {
      title: "Wolfram-Style Partial Sums Values Table",
      latex: buildWolframPartialSums(0, "0", "0", w0, harmonics, 3),
    },
  ];

  return { trigSteps, compactSteps, complexSteps };
}

export function derivePiecewiseSeriesCalculus(
  segments: readonly PiecewiseSegment[],
  T0: number,
  omega0: number,
  harmonics: readonly HarmonicCoefficient[],
  a0Val = 0,
): FullSeriesDerivation {
  const T0Tex = formatExactScalar(T0).tex;
  const w0Tex = formatExactScalar(omega0).tex;
  const invT0 = formatExactScalar(1 / T0).tex;
  const twoOverT0 = formatExactScalar(2 / T0).tex;
  const wArg = wArgTex(omega0);
  const wVar = Math.abs(omega0 - 1) < 1e-6 ? "n" : "n\\omega_0";
  const a0Half = a0Val / 2;
  const a0Tex = formatExactScalar(a0Val).tex;
  const a0HalfTex = formatExactScalar(a0Half).tex;

  const segIntegralsA0 = segments
    .map(s => String.raw`\int_{${formatExactScalar(s.start).tex}}^{${formatExactScalar(s.end).tex}} \left(${s.expr}\right)\,dt`)
    .join(" + ");
  const segIntegralsAn = segments
    .map(s => String.raw`\int_{${formatExactScalar(s.start).tex}}^{${formatExactScalar(s.end).tex}} \left(${s.expr}\right)\cos(${wArg})\,dt`)
    .join(" + ");
  const segIntegralsBn = segments
    .map(s => String.raw`\int_{${formatExactScalar(s.start).tex}}^{${formatExactScalar(s.end).tex}} \left(${s.expr}\right)\sin(${wArg})\,dt`)
    .join(" + ");
  const segIntegralsCn = segments
    .map(s => String.raw`\int_{${formatExactScalar(s.start).tex}}^{${formatExactScalar(s.end).tex}} \left(${s.expr}\right)e^{-j ${wArg}}\,dt`)
    .join(" + ");

  // Analytical bracket antiderivatives for polynomial segments (or symbolic F_k if non-polynomial)
  const a0Brackets = segments.map(s => {
    const a = formatExactScalar(s.start).tex;
    const b = formatExactScalar(s.end).tex;
    const poly = tryParsePolynomial(s.expr);
    if (!poly) return String.raw`\left[ F(t) \right]_{${a}}^{${b}}`;
    const anti = poly.integrate();
    return String.raw`\left[ ${anti.toLatex("t")} \right]_{${a}}^{${b}}`;
  });

  const trigBrackets = segments.slice(0, 3).map(s => {
    const a = formatExactScalar(s.start).tex;
    const b = formatExactScalar(s.end).tex;
    const poly = tryParsePolynomial(s.expr);
    if (!poly) return String.raw`\left[ F_{\text{IBP}}(t) \right]_{${a}}^{${b}}`;
    return String.raw`\left[ ${formatPolyTrigBracket(poly, wArg, wVar, true)} \right]_{${a}}^{${b}}`;
  });

  const cpxBrackets = segments.slice(0, 3).map(s => {
    const a = formatExactScalar(s.start).tex;
    const b = formatExactScalar(s.end).tex;
    const poly = tryParsePolynomial(s.expr);
    if (!poly) return String.raw`\left[ F_{\mathbb{C}}(t) \right]_{${a}}^{${b}}`;
    return String.raw`\left[ ${formatPolyExpBracket(poly, wArg, wVar)} \right]_{${a}}^{${b}}`;
  });

  const sampleList = harmonics.slice(0, 3)
    .map(h => String.raw`a_${h.n} = ${formatExactScalar(h.an).tex},\; b_${h.n} = ${formatExactScalar(h.bn).tex}`)
    .join(String.raw`,\quad `);

  const trigSteps: MathStep[] = [
    {
      title: "Split Continuous Fourier Integrals Across Piecewise Subintervals",
      latex: gathered([
        String.raw`T_0 = ${T0Tex},\quad \omega_0 = ${w0Tex}`,
        String.raw`a_0 = ${invT0}\left( ${segIntegralsA0} \right)`,
        String.raw`\binom{a_n}{b_n} = ${twoOverT0}\left( ${segIntegralsAn}\;;\; ${segIntegralsBn} \right)`,
      ]),
    },
    {
      title: "Derivation of DC Component a₀ and a₀/2",
      latex: String.raw`a_0 = ${invT0}\left( ${a0Brackets.join(" + ")} \right) = ${a0Tex} \implies \frac{a_0}{2} = ${a0HalfTex}`,
    },
    {
      title: "Subinterval Antiderivatives in Evaluation Brackets (a_n, b_n)",
      latex: gathered([
        String.raw`a_n = ${twoOverT0}\left( ${trigBrackets.join(" + ")}${segments.length > 3 ? " + \\cdots" : ""} \right)`,
        sampleList,
      ]),
    },
    {
      title: "Synthesized Infinite Fourier Series",
      latex: String.raw`f(t) = ${Math.abs(a0Half) > 1e-7 ? `${a0HalfTex} + ` : ""}\sum_{n=1}^\infty \left[ a_n \cos(${wArg}) + b_n \sin(${wArg}) \right] \quad\text{with } \omega_0 = ${w0Tex}`,
    },
    {
      title: "Expanded Fourier Series (First Harmonics)",
      latex: buildTrigExpanded("f(t)", a0Half, a0HalfTex, omega0, harmonics),
    },
  ];

  const compactSample = harmonics.slice(0, 3)
    .map(h => String.raw`C_${h.n} = ${formatExactScalar(h.cnMag).tex},\; \theta_${h.n} = ${formatAnglePi(h.thetaN) || "0"}`)
    .join(String.raw`,\quad `);

  const compactSteps: MathStep[] = [
    {
      title: "Compact Polar Cosine Series & Subinterval Integrals",
      latex: String.raw`f(t) = C_0 + \sum_{n=1}^\infty C_n\cos(${wArg} + \theta_n), \quad a_0 = ${invT0}\left(${segIntegralsA0}\right)`,
    },
    {
      title: "Derivation of DC Component C₀ = a₀/2",
      latex: String.raw`C_0 = \frac{a_0}{2} = ${invT0}\left( ${a0Brackets.join(" + ")} \right) \cdot \frac{1}{2} = ${a0HalfTex}`,
    },
    {
      title: "Subinterval Evaluation Brackets & Rectangular-to-Polar Conversion",
      latex: gathered([
        String.raw`C_n = \sqrt{a_n^2 + b_n^2},\quad \theta_n = \operatorname{atan2}(-b_n, a_n)`,
        compactSample,
      ]),
    },
    {
      title: "Synthesized Compact Cosine Series",
      latex: String.raw`f(t) = ${Math.abs(a0Half) > 1e-7 ? `${a0HalfTex} + ` : ""}\sum_{n=1}^\infty C_n \cos(${wArg} + \theta_n)`,
    },
    {
      title: "Expanded Polar Harmonics",
      latex: buildCompactExpanded("f(t)", a0Half, a0HalfTex, omega0, harmonics),
    },
  ];

  const complexSteps: MathStep[] = [
    {
      title: "Split Complex Exponential Integrals Across Subintervals",
      latex: String.raw`c_n = ${invT0}\left( ${segIntegralsCn} \right)`,
    },
    {
      title: "Derivation of DC Complex Coefficient c₀",
      latex: String.raw`c_0 = \frac{a_0}{2} = ${a0HalfTex}`,
    },
    {
      title: "Subinterval Complex Antiderivatives in Evaluation Brackets",
      latex: gathered([
        String.raw`c_n = ${invT0}\left( ${cpxBrackets.join(" + ")}${segments.length > 3 ? " + \\cdots" : ""} \right)`,
        String.raw`c_n = \frac{a_n - j b_n}{2},\quad c_{-n} = c_n^*`,
      ]),
    },
    {
      title: "Synthesized Complex Exponential Series",
      latex: String.raw`f(t) = \sum_{n=-\infty}^\infty c_n e^{j ${wArg}}`,
    },
    {
      title: "Wolfram-Style Partial Sums Values Table",
      latex: buildWolframPartialSums(a0Half, a0HalfTex, a0HalfTex, omega0, harmonics, 3),
    },
  ];

  return { trigSteps, compactSteps, complexSteps };
}
