import { buildPeriodicEvaluator, type HarmonicCoefficient, type SeriesAnalysis } from "./math.js";
import type { FourierSeriesConfig, FourierTransformConfig } from "./model.js";
import type { MathStep } from "./transform-symbolic.js";
import {
  tryParsePolynomial,
  derivePolynomialSeriesCalculus,
  deriveSquareWaveCalculus,
  deriveSawtoothCalculus,
  deriveTriangleCalculus,
  derivePiecewiseSeriesCalculus,
} from "./calculus-derivation.js";

export type { MathStep };

export const TAU = 2 * Math.PI;
export const PI = Math.PI;

export type ExactScalar = {
  value: number;
  tex: string;
  absTex: string;
  sign: 1 | -1 | 0;
  isUnity: boolean;
};

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

export function findRational(val: number, maxDenom = 120, tol = 1e-8): { p: number; q: number } | undefined {
  if (!Number.isFinite(val)) return undefined;
  const sign = val < 0 ? -1 : 1;
  const x = Math.abs(val);
  if (x < tol) return undefined;

  let bestP = Math.round(x);
  let bestQ = 1;
  let bestErr = Math.abs(x - bestP);
  for (let q = 1; q <= maxDenom; q++) {
    const p = Math.round(x * q);
    const err = Math.abs(x - p / q);
    if (err < bestErr) {
      bestErr = err;
      bestP = p;
      bestQ = q;
      if (err < tol) break;
    }
  }
  if (bestErr < tol && bestP > 0) {
    const g = gcd(bestP, bestQ);
    return { p: sign * (bestP / g), q: bestQ / g };
  }
  return undefined;
}

export function formatNumber(v: number): string {
  if (Math.abs(v) < 1e-7) return "0";
  return Number(v.toPrecision(4)).toString();
}

export function formatExactScalar(v: number): ExactScalar {
  if (Math.abs(v) < 1e-7) {
    return { value: 0, tex: "0", absTex: "0", sign: 0, isUnity: false };
  }
  const sign: 1 | -1 = v >= 0 ? 1 : -1;
  const absV = Math.abs(v);

  // Check rational p/q (strict pass then relaxed pass for 4-decimal user bounds like 3.1416)
  const rat = findRational(absV, 64, 1e-7) ?? findRational(absV, 16, 1e-4);
  if (rat) {
    const absTex = rat.q === 1 ? String(rat.p) : String.raw`\frac{${rat.p}}{${rat.q}}`;
    return {
      value: v,
      tex: sign < 0 ? `-${absTex}` : absTex,
      absTex,
      sign,
      isUnity: rat.p === 1 && rat.q === 1,
    };
  }

  // Check p * pi / q
  const ratPi = findRational(absV / PI, 48, 1e-7) ?? findRational(absV / PI, 16, 1e-4);
  if (ratPi) {
    const numTex = ratPi.p === 1 ? String.raw`\pi` : `${ratPi.p}\\pi`;
    const absTex = ratPi.q === 1 ? numTex : String.raw`\frac{${numTex}}{${ratPi.q}}`;
    return {
      value: v,
      tex: sign < 0 ? `-${absTex}` : absTex,
      absTex,
      sign,
      isUnity: false,
    };
  }

  // Check p / (q * pi)
  const ratInvPi = findRational(absV * PI, 48, 1e-7) ?? findRational(absV * PI, 16, 1e-4);
  if (ratInvPi) {
    const denTex = ratInvPi.q === 1 ? String.raw`\pi` : `${ratInvPi.q}\\pi`;
    const absTex = String.raw`\frac{${ratInvPi.p}}{${denTex}}`;
    return {
      value: v,
      tex: sign < 0 ? `-${absTex}` : absTex,
      absTex,
      sign,
      isUnity: false,
    };
  }

  // Check p * pi^2 / q
  const ratPi2 = findRational(absV / (PI * PI), 36, 1e-7) ?? findRational(absV / (PI * PI), 12, 1e-4);
  if (ratPi2) {
    const numTex = ratPi2.p === 1 ? String.raw`\pi^2` : `${ratPi2.p}\\pi^2`;
    const absTex = ratPi2.q === 1 ? numTex : String.raw`\frac{${numTex}}{${ratPi2.q}}`;
    return {
      value: v,
      tex: sign < 0 ? `-${absTex}` : absTex,
      absTex,
      sign,
      isUnity: false,
    };
  }

  // Check p / (q * pi^2)
  const ratInvPi2 = findRational(absV * PI * PI, 36, 1e-7) ?? findRational(absV * PI * PI, 12, 1e-4);
  if (ratInvPi2) {
    const denTex = ratInvPi2.q === 1 ? String.raw`\pi^2` : `${ratInvPi2.q}\\pi^2`;
    const absTex = String.raw`\frac{${ratInvPi2.p}}{${denTex}}`;
    return {
      value: v,
      tex: sign < 0 ? `-${absTex}` : absTex,
      absTex,
      sign,
      isUnity: false,
    };
  }

  // Check affine p * pi^2 / q + r / s (e.g. pi^2 / 3 - 1, 2 * pi^2 / 3 - 2)
  for (const s of [1, 2, 3, 4]) {
    for (let r = -8; r <= 8; r++) {
      if (r === 0) continue;
      const frac = (absV - r / s) / (PI * PI);
      for (const q of [1, 2, 3, 4, 6]) {
        const p = Math.round(frac * q);
        if (p > 0 && Math.abs(frac - p / q) < 1e-5) {
          const pi2Term = p === 1 && q === 1
            ? String.raw`\pi^2`
            : q === 1
              ? `${p}\\pi^2`
              : p === 1
                ? String.raw`\frac{\pi^2}{${q}}`
                : String.raw`\frac{${p}\pi^2}{${q}}`;
          const constFrac = s === 1 ? String(Math.abs(r)) : String.raw`\frac{${Math.abs(r)}}{${s}}`;
          const signPfx = r < 0 ? " - " : " + ";
          const baseTex = `${pi2Term}${signPfx}${constFrac}`;
          return {
            value: v,
            tex: sign < 0 ? `-\\left(${baseTex}\\right)` : baseTex,
            absTex: baseTex,
            sign,
            isUnity: false,
          };
        }
      }
    }
  }

  const dec = formatNumber(absV);
  return {
    value: v,
    tex: sign < 0 ? `-${dec}` : dec,
    absTex: dec,
    sign,
    isUnity: false,
  };
}

export function formatOmegaNT(omega0: number, indexSymbol = "n"): string {
  // CRITICAL: When indexSymbol is numeric ("" -> 1, "2" -> 2, ...), evaluate scalar product k * omega0
  // instead of concatenating strings (which previously caused "1.331" + "2" + "t" = "1.3312t").
  if (indexSymbol === "" || /^\d+$/.test(indexSymbol)) {
    const k = indexSymbol === "" ? 1 : Number(indexSymbol);
    const eff = k * omega0;
    const rat = findRational(eff, 24, 1e-7) ?? findRational(eff, 12, 1e-4);
    if (rat) {
      if (rat.q === 1) return rat.p === 1 ? "t" : `${rat.p}t`;
      return String.raw`\frac{${rat.p}}{${rat.q}}t`;
    }
    const ratPi = findRational(eff / PI, 24, 1e-7) ?? findRational(eff / PI, 12, 1e-4);
    if (ratPi) {
      const num = ratPi.p === 1 ? "\\pi" : `${ratPi.p}\\pi`;
      return ratPi.q === 1 ? `${num} t` : String.raw`\frac{${num}}{${ratPi.q}}t`;
    }
    return `${formatNumber(eff)}t`;
  }

  const rat = findRational(omega0, 24, 1e-7) ?? findRational(omega0, 12, 1e-4);
  if (rat) {
    if (rat.q === 1) return rat.p === 1 ? `${indexSymbol}t` : `${rat.p}${indexSymbol}t`;
    return String.raw`\frac{${rat.p === 1 ? "" : rat.p}${indexSymbol}}{${rat.q}}t`;
  }
  const ratPi = findRational(omega0 / PI, 24, 1e-7) ?? findRational(omega0 / PI, 12, 1e-4);
  if (ratPi) {
    const num = `${ratPi.p === 1 ? "" : ratPi.p}${indexSymbol}\\pi`;
    return ratPi.q === 1 ? `${num} t` : String.raw`\frac{${num}}{${ratPi.q}}t`;
  }
  return String.raw`${formatNumber(omega0)}\,${indexSymbol}t`;
}

function formatScaledN(scalar: number, indexSymbol = "n"): string {
  const rat = findRational(scalar, 24, 1e-7);
  if (rat) {
    const sign = rat.p < 0 ? "-" : "";
    const p = Math.abs(rat.p);
    if (rat.q === 1) return p === 1 ? `${sign}${indexSymbol}` : `${sign}${p}${indexSymbol}`;
    return String.raw`${sign}\frac{${p === 1 ? "" : p}${indexSymbol}}{${rat.q}}`;
  }
  const ratPi = findRational(scalar / PI, 24, 1e-7);
  if (ratPi) {
    const sign = ratPi.p < 0 ? "-" : "";
    const p = Math.abs(ratPi.p);
    const num = `${p === 1 ? "" : p}${indexSymbol}\\pi`;
    return ratPi.q === 1 ? `${sign}${num}` : String.raw`${sign}\frac{${num}}{${ratPi.q}}`;
  }
  return String.raw`${formatNumber(scalar)}${indexSymbol}`;
}

function formatLinearShift(tMinus: number, omega0: number, indexSymbol = "n"): string {
  const nw = formatScaledN(omega0, indexSymbol);
  if (Math.abs(tMinus) < 1e-7) return `${nw}t`;
  const mAbs = formatExactScalar(Math.abs(tMinus)).tex;
  const inner = tMinus > 0 ? `t - ${mAbs}` : `t + ${mAbs}`;
  return `${nw}(${inner})`;
}

export function formatAnglePi(rad: number): string {
  if (Math.abs(rad) < 1e-7) return "";
  const ratPi = findRational(rad / PI, 24, 1e-6);
  if (ratPi) {
    const signStr = ratPi.p < 0 ? "-" : "+";
    const pAbs = Math.abs(ratPi.p);
    const num = pAbs === 1 ? String.raw`\pi` : `${pAbs}\\pi`;
    const body = ratPi.q === 1 ? num : String.raw`\frac{${num}}{${ratPi.q}}`;
    return ` ${signStr} ${body}`;
  }
  return rad >= 0 ? ` + ${formatNumber(rad)}` : ` - ${formatNumber(Math.abs(rad))}`;
}

// ============================================================================
// CLOSED-FORM SEQUENCE RECOGNIZER
// ============================================================================

type ClosedTermPattern = {
  trigOuterFactor: ExactScalar;
  trigInnerNumerator: string;
  trigInnerDenom: string;
  sumLower: string;
  indexVar: string;
  freqMulExpr: string;
  verifyAt: (n: number) => number;
};

function matchClosedSequence(coeffs: readonly number[]): ClosedTermPattern | undefined {
  const M = coeffs.length;
  if (M < 12) return undefined;

  const isZero = (v: number) => Math.abs(v) < 1e-7;
  const evenZero = coeffs.every((v, i) => (i + 1) % 2 === 1 || isZero(v));
  const oddZero = coeffs.every((v, i) => (i + 1) % 2 === 0 || isZero(v));

  if (evenZero && !oddZero) {
    const oddVals = coeffs.filter((_, i) => (i + 1) % 2 === 1);
    for (const p of [1, 2, 3]) {
      const c0 = oddVals[0]!;
      const c1 = oddVals[1]! * Math.pow(3, p);
      if (Math.abs(c0) > 1e-8 && Math.abs(c1 - c0) < 1e-6 * Math.max(1, Math.abs(c0))) {
        const verify = (n: number) => (n % 2 === 1 ? c0 / Math.pow(n, p) : 0);
        if (coeffs.every((v, i) => Math.abs(v - verify(i + 1)) < 1e-6 * Math.max(1, Math.abs(c0)))) {
          const outer = formatExactScalar(c0);
          return {
            trigOuterFactor: outer,
            trigInnerNumerator: "1",
            trigInnerDenom: p === 1 ? "(2k-1)" : `(2k-1)^${p}`,
            sumLower: "k=1",
            indexVar: "k",
            freqMulExpr: "(2k-1)",
            verifyAt: verify,
          };
        }
      }
      const c1Alt = -oddVals[1]! * Math.pow(3, p);
      if (Math.abs(c0) > 1e-8 && Math.abs(c1Alt - c0) < 1e-6 * Math.max(1, Math.abs(c0))) {
        const verify = (n: number) => {
          if (n % 2 === 0) return 0;
          const k = (n + 1) / 2;
          return ((k % 2 === 1 ? 1 : -1) * c0) / Math.pow(n, p);
        };
        if (coeffs.every((v, i) => Math.abs(v - verify(i + 1)) < 1e-6 * Math.max(1, Math.abs(c0)))) {
          const outer = formatExactScalar(c0);
          return {
            trigOuterFactor: outer,
            trigInnerNumerator: "(-1)^{k+1}",
            trigInnerDenom: p === 1 ? "(2k-1)" : `(2k-1)^${p}`,
            sumLower: "k=1",
            indexVar: "k",
            freqMulExpr: "(2k-1)",
            verifyAt: verify,
          };
        }
      }
    }
  }

  if (oddZero && !evenZero) {
    const evenVals = coeffs.filter((_, i) => (i + 1) % 2 === 0);
    if (evenVals.length >= 4 && Math.abs(evenVals[0]!) > 1e-8) {
      const c4k2 = evenVals[0]! * 3;
      const verify4k = (n: number) => {
        if (n % 2 === 1) return 0;
        const k = n / 2;
        return c4k2 / (4 * k * k - 1);
      };
      if (coeffs.every((v, i) => Math.abs(v - verify4k(i + 1)) < 1e-6 * Math.max(1, Math.abs(c4k2)))) {
        const outer = formatExactScalar(c4k2);
        return {
          trigOuterFactor: outer,
          trigInnerNumerator: "1",
          trigInnerDenom: "4k^2 - 1",
          sumLower: "k=1",
          indexVar: "k",
          freqMulExpr: "2k",
          verifyAt: verify4k,
        };
      }
    }
  }

  for (const p of [1, 2, 3]) {
    const v1 = coeffs[0]!;
    const v2 = coeffs[1]!;
    if (Math.abs(v1) > 1e-8) {
      if (Math.abs(v2 * Math.pow(2, p) - v1) < 1e-6 * Math.max(1, Math.abs(v1))) {
        const verify = (n: number) => v1 / Math.pow(n, p);
        if (coeffs.every((v, i) => Math.abs(v - verify(i + 1)) < 1e-6 * Math.max(1, Math.abs(v1)))) {
          const outer = formatExactScalar(v1);
          return {
            trigOuterFactor: outer,
            trigInnerNumerator: "1",
            trigInnerDenom: p === 1 ? "n" : `n^${p}`,
            sumLower: "n=1",
            indexVar: "n",
            freqMulExpr: "n",
            verifyAt: verify,
          };
        }
      }
      if (Math.abs(-v2 * Math.pow(2, p) - v1) < 1e-6 * Math.max(1, Math.abs(v1))) {
        const verify = (n: number) => ((n % 2 === 1 ? 1 : -1) * v1) / Math.pow(n, p);
        if (coeffs.every((v, i) => Math.abs(v - verify(i + 1)) < 1e-6 * Math.max(1, Math.abs(v1)))) {
          const negSign = v1 < 0;
          const outer = formatExactScalar(Math.abs(v1));
          // At n = 1, (-1)^1 = -1 already carries the negative sign when v1 < 0!
          return {
            trigOuterFactor: outer,
            trigInnerNumerator: negSign ? "(-1)^{n}" : "(-1)^{n+1}",
            trigInnerDenom: p === 1 ? "n" : `n^${p}`,
            sumLower: "n=1",
            indexVar: "n",
            freqMulExpr: "n",
            verifyAt: verify,
          };
        }
      }
    }
  }

  if (Math.abs(coeffs[0]!) > 1e-8) {
    const cFull = coeffs[0]! * 3;
    const verifyFull = (n: number) => cFull / (4 * n * n - 1);
    if (coeffs.every((v, i) => Math.abs(v - verifyFull(i + 1)) < 1e-6 * Math.max(1, Math.abs(cFull)))) {
      const outer = formatExactScalar(cFull);
      return {
        trigOuterFactor: outer,
        trigInnerNumerator: "1",
        trigInnerDenom: "4n^2 - 1",
        sumLower: "n=1",
        indexVar: "n",
        freqMulExpr: "n",
        verifyAt: verifyFull,
      };
    }
  }

  return undefined;
}

function renderSumTerm(
  pat: ClosedTermPattern,
  trigFunc: "cos" | "sin",
  omega0: number,
  isLeading: boolean,
): string {
  const f = pat.trigOuterFactor;
  const signPrefix = isLeading ? (f.sign < 0 ? "-" : "") : f.sign < 0 ? " - " : " + ";
  const outerStr = f.isUnity ? "" : `${f.absTex}`;
  const arg = formatOmegaNT(omega0, pat.freqMulExpr);
  const bodyFrac = `\\frac{${pat.trigInnerNumerator}}{${pat.trigInnerDenom}}`;
  return `${signPrefix}${outerStr}\\sum_{${pat.sumLower}}^{\\infty} ${bodyFrac} \\${trigFunc}(${arg})`;
}

// ============================================================================
// GENERAL ANALYTICAL PIECEWISE / POLYNOMIAL SYMBOLIC FOURIER SOLVER
// ============================================================================

type PolyPiece = {
  u: number;
  v: number;
  // p(t) = c0 + c1*(t - u) + c2*(t - u)^2  (exact quadratic on [u, v))
  c0: number;
  c1: number;
  c2: number;
};

type JumpNode = {
  tau: number;
  d0: number; // x(tau+) - x(tau-)
  d1: number; // x'(tau+) - x'(tau-)
  d2: number; // x''(tau+) - x''(tau-)
};

function solvePiecewiseClosedForm(
  config: FourierSeriesConfig,
  a0: number,
  omega0: number,
  harmonics: readonly HarmonicCoefficient[],
): SimplifiedSeriesLatex | undefined {
  if (config.inputKind === "graphical") return undefined;

  const { evaluate, periodStart, period, breakpoints } = buildPeriodicEvaluator(config);
  const periodEnd = periodStart + period;
  const rawCuts = [periodStart, ...breakpoints.filter(b => b > periodStart + 1e-8 && b < periodEnd - 1e-8), periodEnd];
  const cuts: number[] = [];
  for (const c of rawCuts) {
    if (cuts.length === 0 || Math.abs(c - cuts[cuts.length - 1]!) > 1e-8) {
      cuts.push(c);
    }
  }
  if (cuts.length < 2) return undefined;

  // Fit each piece [u, v) to a quadratic polynomial and verify exactness across 7 interior probes
  const pieces: PolyPiece[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const u = cuts[i]!;
    const v = cuts[i + 1]!;
    const len = v - u;
    if (len < 1e-8) continue;

    const tA = u + 0.1 * len;
    const tB = u + 0.5 * len;
    const tC = u + 0.9 * len;
    const yA = evaluate(tA);
    const yB = evaluate(tB);
    const yC = evaluate(tC);

    // Lagrange quadratic fit in s = t - u
    const sA = tA - u;
    const sB = tB - u;
    const sC = tC - u;
    const denomA = (sA - sB) * (sA - sC);
    const denomB = (sB - sA) * (sB - sC);
    const denomC = (sC - sA) * (sC - sB);

    const evalPolyAt = (t: number) => {
      const s = t - u;
      return (
        yA * ((s - sB) * (s - sC)) / denomA +
        yB * ((s - sA) * (s - sC)) / denomB +
        yC * ((s - sA) * (s - sB)) / denomC
      );
    };

    const c0 = evalPolyAt(u);
    const c2 = yA / denomA + yB / denomB + yC / denomC;
    const c1 = -(yA * (sB + sC)) / denomA - (yB * (sA + sC)) / denomB - (yC * (sA + sB)) / denomC;

    // Verify polynomial match across 7 interior points
    let exactPoly = true;
    for (const frac of [0.05, 0.2, 0.35, 0.65, 0.8, 0.95]) {
      const tp = u + frac * len;
      if (Math.abs(evaluate(tp) - evalPolyAt(tp)) > 1e-6 * Math.max(1, Math.abs(yB))) {
        exactPoly = false;
        break;
      }
    }
    if (!exactPoly) return undefined;

    const normC0 = Math.abs(c0) < 1e-10 ? 0 : c0;
    const normC1 = Math.abs(c1) < 1e-10 ? 0 : c1;
    const normC2 = Math.abs(c2) < 1e-10 ? 0 : c2;
    const prev = pieces[pieces.length - 1];
    // Merge adjacent intervals if they belong to the same continuous polynomial (e.g. dummy cut at t = 0)
    if (
      prev &&
      Math.abs(normC2) < 1e-9 &&
      Math.abs(prev.c2) < 1e-9 &&
      Math.abs(normC1 - prev.c1) < 1e-8 &&
      Math.abs(normC0 - (prev.c0 + prev.c1 * (u - prev.u))) < 1e-8
    ) {
      pieces[pieces.length - 1] = { ...prev, v };
    } else {
      pieces.push({ u, v, c0: normC0, c1: normC1, c2: normC2 });
    }
  }
  if (pieces.length === 0) return undefined;

  // Special Case A: Pure 2-level rectangular / step function (arbitrary duty & offset!)
  if (
    pieces.length === 2 &&
    Math.abs(pieces[0]!.c1) < 1e-9 &&
    Math.abs(pieces[0]!.c2) < 1e-9 &&
    Math.abs(pieces[1]!.c1) < 1e-9 &&
    Math.abs(pieces[1]!.c2) < 1e-9
  ) {
    const p1 = pieces[0]!;
    const p2 = pieces[1]!;
    const delta = p1.c0 - p2.c0;
    const d = p1.v - p1.u;
    const mid = 0.5 * (p1.u + p1.v);
    const dcStr = formatExactScalar(a0);
    const dcLead = dcStr.sign === 0 ? "" : `${dcStr.tex} `;

    // Check against computed harmonics before emitting
    const checkVal = harmonics.slice(0, Math.min(8, harmonics.length)).every(h => {
      const theta0 = h.n * omega0 * p1.u;
      const theta1 = h.n * omega0 * p1.v;
      const anExp = (delta / (h.n * PI)) * (Math.sin(theta1) - Math.sin(theta0));
      const bnExp = (delta / (h.n * PI)) * (Math.cos(theta0) - Math.cos(theta1));
      return Math.abs(h.an - anExp) < 1e-5 && Math.abs(h.bn - bnExp) < 1e-5;
    });

    if (checkVal && Math.abs(delta) > 1e-9) {
      const kCompact = formatExactScalar((2 * delta) / PI);
      const kTrig = formatExactScalar(delta / PI);
      const kCpx = formatExactScalar((delta * d) / period);
      const alphaN = formatScaledN((PI * d) / period, "n");
      const argShift = formatLinearShift(mid, omega0, "n");
      const argNT = formatOmegaNT(omega0, "n");
      const u0N = formatScaledN(omega0 * p1.u, "n");
      const u1N = formatScaledN(omega0 * p1.v, "n");

      const cSign = kCompact.sign < 0 ? (dcLead ? "- " : "-") : (dcLead ? "+ " : "");
      const tSign = kTrig.sign < 0 ? (dcLead ? "- " : "-") : (dcLead ? "+ " : "");
      const xSign = kCpx.sign < 0 ? (dcLead ? "- " : "-") : (dcLead ? "+ " : "");

      const compact = String.raw`x(t) = ${dcLead}${cSign}${kCompact.isUnity ? "" : kCompact.absTex}\sum_{n=1}^{\infty} \frac{\sin(${alphaN})}{n}\cos\!\left(${argShift}\right)`;

      const cosComb = `\\sin(${u1N}) ${p1.u === 0 ? "" : `- \\sin(${u0N})`}`.trim();
      const sinComb = `${p1.u === 0 ? "1" : `\\cos(${u0N})`} - \\cos(${u1N})`;
      const trigonometric = String.raw`x(t) = ${dcLead}${tSign}${kTrig.isUnity ? "" : kTrig.absTex}\sum_{n=1}^{\infty} \frac{\left[${cosComb}\right]\cos(${argNT}) + \left[${sinComb}\right]\sin(${argNT})}{n}`;

      const sincArg = formatScaledN(d / period, "n");
      const phaseExp = Math.abs(mid) < 1e-7 ? "" : ` e^{${mid > 0 ? "-" : ""}j ${formatScaledN(Math.abs(omega0 * mid), "n")}}`;
      const complex = String.raw`x(t) = ${dcLead}${xSign}${kCpx.isUnity ? "" : kCpx.absTex}\sum_{\substack{n=-\infty \\ n\ne 0}}^{\infty} \operatorname{sinc}\!\left(${sincArg}\right)${phaseExp} e^{j ${argNT}}`;

      return {
        trigonometric,
        compact,
        complex,
        exactClosedForm: true,
      };
    }
  }

  // Special Case B: General M-piecewise polynomials (constants, ramps, quadratics) via jump boundary formula:
  // a_n cos + b_n sin = sum_j [
  //   (d0_j / (pi * n)) * sin(n*w0*(t - tau_j))
  //   - (2*d1_j / (T0 * w0^2 * n^2)) * cos(n*w0*(t - tau_j))
  //   - (2*d2_j / (T0 * w0^3 * n^3)) * sin(n*w0*(t - tau_j))
  // ]
  const jumps: JumpNode[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const prev = pieces[(i - 1 + pieces.length) % pieces.length]!;
    const cur = pieces[i]!;
    const prevLen = prev.v - prev.u;
    const prevVal = prev.c0 + prev.c1 * prevLen + prev.c2 * prevLen * prevLen;
    const prevSlope = prev.c1 + 2 * prev.c2 * prevLen;
    const prevCurv = 2 * prev.c2;

    const curVal = cur.c0;
    const curSlope = cur.c1;
    const curCurv = 2 * cur.c2;

    const d0 = Math.abs(curVal - prevVal) < 1e-8 ? 0 : curVal - prevVal;
    const d1 = Math.abs(curSlope - prevSlope) < 1e-8 ? 0 : curSlope - prevSlope;
    const d2 = Math.abs(curCurv - prevCurv) < 1e-8 ? 0 : curCurv - prevCurv;

    if (d0 !== 0 || d1 !== 0 || d2 !== 0) {
      jumps.push({ tau: cur.u, d0, d1, d2 });
    }
  }

  if (jumps.length === 0) return undefined;

  // Verify the boundary jump identity against computed harmonics
  const jumpCheck = harmonics.slice(0, Math.min(8, harmonics.length)).every(h => {
    const nw = h.n * omega0;
    let anPred = 0;
    let bnPred = 0;
    for (const jp of jumps) {
      const ph = nw * jp.tau;
      const cs = Math.cos(ph);
      const sn = Math.sin(ph);
      if (jp.d0 !== 0) {
        const k0 = jp.d0 / (PI * h.n);
        anPred += -k0 * sn;
        bnPred += k0 * cs;
      }
      if (jp.d1 !== 0) {
        const k1 = (-2 * jp.d1) / (period * nw * nw);
        anPred += k1 * cs;
        bnPred += k1 * sn;
      }
      if (jp.d2 !== 0) {
        const k2 = (-2 * jp.d2) / (period * nw * nw * nw);
        anPred += k2 * sn;
        bnPred += -k2 * cs;
      }
    }
    return Math.abs(h.an - anPred) < 1e-5 && Math.abs(h.bn - bnPred) < 1e-5;
  });

  if (!jumpCheck) return undefined;

  // Build concise, exact closed-form infinite series formulas valid for ALL n -> infty
  const dcStr = formatExactScalar(a0);
  const hasDc = dcStr.sign !== 0;
  const dcLead = hasDc ? `${dcStr.tex} ` : "";

  const sumPieces: string[] = [];
  const cpxPieces: string[] = [];
  for (const jp of jumps) {
    const argT = formatLinearShift(jp.tau, omega0, "n");
    const phShift = Math.abs(jp.tau) < 1e-7 ? "" : ` e^{${jp.tau > 0 ? "-" : ""}j ${formatScaledN(Math.abs(omega0 * jp.tau), "n")}}`;

    if (jp.d0 !== 0) {
      const k0 = formatExactScalar(jp.d0 / PI);
      const pfx = sumPieces.length === 0 ? (k0.sign < 0 ? "-" : "") : k0.sign < 0 ? " - " : " + ";
      sumPieces.push(String.raw`${pfx}\frac{${k0.isUnity ? "" : k0.absTex}\sin(${argT})}{n}`);
      const kc0 = formatExactScalar(jp.d0 / TAU);
      cpxPieces.push(String.raw`\frac{${kc0.tex}}{j n}${phShift}`);
    }
    if (jp.d1 !== 0) {
      const k1 = formatExactScalar((-2 * jp.d1) / (period * omega0 * omega0));
      const pfx = sumPieces.length === 0 ? (k1.sign < 0 ? "-" : "") : k1.sign < 0 ? " - " : " + ";
      sumPieces.push(String.raw`${pfx}\frac{${k1.isUnity ? "" : k1.absTex}\cos(${argT})}{n^2}`);
      const kc1 = formatExactScalar(-jp.d1 / (period * omega0 * omega0));
      cpxPieces.push(String.raw`\frac{${kc1.tex}}{n^2}${phShift}`);
    }
    if (jp.d2 !== 0) {
      const k2 = formatExactScalar((-2 * jp.d2) / (period * omega0 * omega0 * omega0));
      const pfx = sumPieces.length === 0 ? (k2.sign < 0 ? "-" : "") : k2.sign < 0 ? " - " : " + ";
      sumPieces.push(String.raw`${pfx}\frac{${k2.isUnity ? "" : k2.absTex}\sin(${argT})}{n^3}`);
      const kc2 = formatExactScalar(jp.d2 / (period * omega0 * omega0 * omega0));
      cpxPieces.push(String.raw`\frac{j(${kc2.tex})}{n^3}${phShift}`);
    }
  }

  const trigExpr = String.raw`x(t) = ${dcLead}${dcLead && !sumPieces[0]!.startsWith(" -") && !sumPieces[0]!.startsWith("-") ? "+ " : ""}\sum_{n=1}^{\infty} \left[${sumPieces.join("")}\right]`;
  const compactExpr = String.raw`x(t) = ${dcLead}${dcLead ? "+ " : ""}\sum_{n=1}^{\infty} C_n \cos\!\left(${formatOmegaNT(omega0, "n")} + \theta_n\right)`;
  const cpxBody = cpxPieces.join(" + ").replace(/\+ -/g, "- ");
  const complexExpr = String.raw`x(t) = ${dcLead}${dcLead ? "+ " : ""}\sum_{\substack{n=-\infty \\ n\ne 0}}^{\infty} \left(${cpxBody}\right) e^{j ${formatOmegaNT(omega0, "n")}}`;

  return {
    trigonometric: trigExpr,
    compact: compactExpr,
    complex: complexExpr,
    exactClosedForm: true,
  };
}

export type SimplifiedSeriesLatex = {
  trigonometric: string;
  compact: string;
  complex: string;
  exactClosedForm: boolean;
};

export function synthesizeSimplifiedSeriesLatex(
  config: FourierSeriesConfig,
  a0: number,
  omega0: number,
  harmonics: readonly HarmonicCoefficient[],
  capturedPower: number,
  totalPower: number,
): SimplifiedSeriesLatex {
  const dcScalar = formatExactScalar(a0);
  const hasDc = dcScalar.sign !== 0;

  // 1) Finite trigonometric polynomial (e.g. 3 + 2*cos(pi*t) - sin(3*pi*t))
  const nonZero = harmonics.filter(h => h.cnMag > 1e-7);
  const tailZero = harmonics.length >= 8 && harmonics.slice(-Math.min(8, harmonics.length)).every(h => h.cnMag < 1e-7);
  if (
    nonZero.length <= 8 &&
    tailZero &&
    (totalPower < 1e-12 || Math.abs(totalPower - capturedPower) / Math.max(1e-12, totalPower) < 1e-5)
  ) {
    if (nonZero.length === 0) {
      const val = dcScalar.tex;
      return {
        trigonometric: `x(t) = ${val}`,
        compact: `x(t) = ${val}`,
        complex: `x(t) = ${val}`,
        exactClosedForm: true,
      };
    }

    const trigParts: string[] = [];
    const compParts: string[] = [];
    const cpxParts: string[] = [];
    if (hasDc) {
      trigParts.push(dcScalar.tex);
      compParts.push(dcScalar.tex);
      cpxParts.push(dcScalar.tex);
    }

    for (const h of nonZero) {
      const arg = formatOmegaNT(omega0, h.n === 1 ? "" : String(h.n));
      if (Math.abs(h.an) > 1e-7) {
        const s = formatExactScalar(h.an);
        const coeff = s.isUnity ? "" : s.absTex;
        const pfx = trigParts.length === 0 ? (s.sign < 0 ? "-" : "") : s.sign < 0 ? " - " : " + ";
        trigParts.push(`${pfx}${coeff}\\cos(${arg})`);
      }
      if (Math.abs(h.bn) > 1e-7) {
        const s = formatExactScalar(h.bn);
        const coeff = s.isUnity ? "" : s.absTex;
        const pfx = trigParts.length === 0 ? (s.sign < 0 ? "-" : "") : s.sign < 0 ? " - " : " + ";
        trigParts.push(`${pfx}${coeff}\\sin(${arg})`);
      }
      const cMag = formatExactScalar(h.cnMag);
      const cCoeff = cMag.isUnity ? "" : cMag.absTex;
      const cPfx = compParts.length === 0 ? "" : " + ";
      compParts.push(`${cPfx}${cCoeff}\\cos(${arg}${formatAnglePi(h.thetaN)})`);

      const magC = formatExactScalar(Math.hypot(h.cPosRe, h.cPosIm));
      const coeffStr = magC.isUnity ? "" : magC.absTex;
      const angStr = formatAnglePi(Math.atan2(h.cPosIm, h.cPosRe));
      const phaseTerm = angStr
        ? `\\left(e^{j(${arg}${angStr})} + e^{-j(${arg}${angStr})}\\right)`
        : `\\left(e^{j${arg}} + e^{-j${arg}}\\right)`;
      const xPfx = cpxParts.length === 0 ? "" : " + ";
      cpxParts.push(`${xPfx}${coeffStr}${phaseTerm}`);
    }

    return {
      trigonometric: `x(t) = ${trigParts.join("")}`,
      compact: `x(t) = ${compParts.join("")}`,
      complex: `x(t) = ${cpxParts.join("")}`,
      exactClosedForm: true,
    };
  }

  // 2) Clean single-family Wolfram-style closed-form sequence recognition
  const checkN = Math.min(24, harmonics.length);
  const anList = harmonics.slice(0, checkN).map(h => h.an);
  const bnList = harmonics.slice(0, checkN).map(h => h.bn);

  const anWithout1 = [0, ...anList.slice(1)];
  const bnWithout1 = [0, ...bnList.slice(1)];
  const anAllZero = anList.every(v => Math.abs(v) < 1e-7);
  const bnAllZero = bnList.every(v => Math.abs(v) < 1e-7);
  const anTailZero = anList.slice(1).every(v => Math.abs(v) < 1e-7);
  const bnTailZero = bnList.slice(1).every(v => Math.abs(v) < 1e-7);

  const patA = anAllZero || anTailZero ? undefined : matchClosedSequence(anList) ?? (Math.abs(anList[0]!) > 1e-7 ? undefined : matchClosedSequence(anWithout1));
  const patB = bnAllZero || bnTailZero ? undefined : matchClosedSequence(bnList) ?? (Math.abs(bnList[0]!) > 1e-7 ? undefined : matchClosedSequence(bnWithout1));

  const standaloneA1 = !patA || Math.abs(anList[0]! - patA.verifyAt(1)) > 1e-6 ? (Math.abs(anList[0]!) > 1e-7 ? anList[0]! : 0) : 0;
  const standaloneB1 = !patB || Math.abs(bnList[0]! - patB.verifyAt(1)) > 1e-6 ? (Math.abs(bnList[0]!) > 1e-7 ? bnList[0]! : 0) : 0;

  if ((anAllZero || anTailZero || patA) && (bnAllZero || bnTailZero || patB)) {
    const trigTerms: string[] = [];
    if (hasDc) trigTerms.push(dcScalar.tex);
    if (standaloneA1 !== 0) {
      const s = formatExactScalar(standaloneA1);
      const pfx = trigTerms.length === 0 ? (s.sign < 0 ? "-" : "") : s.sign < 0 ? " - " : " + ";
      trigTerms.push(`${pfx}${s.isUnity ? "" : s.absTex}\\cos(${formatOmegaNT(omega0, "")})`);
    }
    if (standaloneB1 !== 0) {
      const s = formatExactScalar(standaloneB1);
      const pfx = trigTerms.length === 0 ? (s.sign < 0 ? "-" : "") : s.sign < 0 ? " - " : " + ";
      trigTerms.push(`${pfx}${s.isUnity ? "" : s.absTex}\\sin(${formatOmegaNT(omega0, "")})`);
    }
    if (patA) trigTerms.push(renderSumTerm(patA, "cos", omega0, trigTerms.length === 0));
    if (patB) trigTerms.push(renderSumTerm(patB, "sin", omega0, trigTerms.length === 0));

    const compTerms: string[] = [];
    if (hasDc) compTerms.push(dcScalar.tex);
    if (standaloneA1 !== 0 || standaloneB1 !== 0) {
      const c1 = formatExactScalar(Math.hypot(standaloneA1, standaloneB1));
      const th1 = formatAnglePi(Math.atan2(-standaloneB1, standaloneA1));
      const pfx = compTerms.length === 0 ? "" : " + ";
      compTerms.push(`${pfx}${c1.isUnity ? "" : c1.absTex}\\cos(${formatOmegaNT(omega0, "")}${th1})`);
    }
    if (patA && !patB) {
      const signPhase = patA.trigOuterFactor.sign < 0 ? " + \\pi" : "";
      const magOuter = formatExactScalar(Math.abs(patA.trigOuterFactor.value));
      const pfx = compTerms.length === 0 ? "" : " + ";
      const arg = formatOmegaNT(omega0, patA.freqMulExpr);
      compTerms.push(
        String.raw`${pfx}${magOuter.isUnity ? "" : magOuter.absTex}\sum_{${patA.sumLower}}^{\infty} \frac{${patA.trigInnerNumerator}}{${patA.trigInnerDenom}} \cos\!\left(${arg}${signPhase}\right)`,
      );
    } else if (patB && !patA) {
      const signPhase = patB.trigOuterFactor.sign < 0 ? " + \\frac{\\pi}{2}" : " - \\frac{\\pi}{2}";
      const magOuter = formatExactScalar(Math.abs(patB.trigOuterFactor.value));
      const pfx = compTerms.length === 0 ? "" : " + ";
      const arg = formatOmegaNT(omega0, patB.freqMulExpr);
      compTerms.push(
        String.raw`${pfx}${magOuter.isUnity ? "" : magOuter.absTex}\sum_{${patB.sumLower}}^{\infty} \frac{${patB.trigInnerNumerator}}{${patB.trigInnerDenom}} \cos\!\left(${arg}${signPhase}\right)`,
      );
    } else if (patA && patB) {
      compTerms.push(
        String.raw`${compTerms.length === 0 ? "" : " + "}\sum_{n=1}^{\infty} C_n \cos\!\left(${formatOmegaNT(omega0, "n")} + \theta_n\right)`,
      );
    }

    const cpxTerms: string[] = [];
    if (patA && !patB && standaloneA1 === 0 && standaloneB1 === 0) {
      const half = formatExactScalar(0.5 * patA.trigOuterFactor.value);
      const arg = formatOmegaNT(omega0, patA.freqMulExpr);
      const lead = hasDc ? `${dcScalar.tex} ${half.sign < 0 ? "-" : "+"} ` : (half.sign < 0 ? "-" : "");
      const sumSub = patA.indexVar === "k"
        ? "k=-\\infty"
        : String.raw`\substack{${patA.indexVar}=-\infty \\ ${patA.indexVar}\ne 0}`;
      cpxTerms.push(
        String.raw`x(t) = ${lead}${half.isUnity ? "" : half.absTex}\sum_{${sumSub}}^{\infty} \frac{${patA.trigInnerNumerator}}{${patA.trigInnerDenom}} e^{j ${arg}}`,
      );
    } else if (patB && !patA && standaloneA1 === 0 && standaloneB1 === 0) {
      const half = formatExactScalar(0.5 * Math.abs(patB.trigOuterFactor.value));
      const negJ = patB.trigOuterFactor.sign >= 0;
      const lead = hasDc ? `${dcScalar.tex} ${negJ ? "- " : "+ "}` : (negJ ? "-" : "");
      const arg = formatOmegaNT(omega0, patB.freqMulExpr);
      const sumSub = patB.indexVar === "k"
        ? "k=-\\infty"
        : String.raw`\substack{${patB.indexVar}=-\infty \\ ${patB.indexVar}\ne 0}`;
      cpxTerms.push(
        String.raw`x(t) = ${lead}j${half.isUnity ? "" : half.absTex}\sum_{${sumSub}}^{\infty} \frac{${patB.trigInnerNumerator}}{${patB.trigInnerDenom}} e^{j ${arg}}`,
      );
    } else {
      cpxTerms.push(
        String.raw`x(t) = \sum_{n=-\infty}^{\infty} c_n e^{j ${formatOmegaNT(omega0, "n")}}, \quad c_n = \frac{a_n - j b_n}{2}`,
      );
    }

    return {
      trigonometric: `x(t) = ${trigTerms.join("")}`,
      compact: `x(t) = ${compTerms.join("")}`,
      complex: cpxTerms.join(""),
      exactClosedForm: true,
    };
  }

  // 3) Analytical piecewise / polynomial closed-form solver for ANY arbitrary [t_start, t_end]
  const piecewiseClosed = solvePiecewiseClosedForm(config, a0, omega0, harmonics);
  if (piecewiseClosed) return piecewiseClosed;

  // 4) Exponential rational fit: c_n = R / (alpha + j n omega0)
  if (harmonics.length >= 6 && Math.abs(harmonics[0]!.an) > 1e-6 && Math.abs(harmonics[0]!.bn) > 1e-6) {
    const alpha1 = (1 * omega0 * harmonics[0]!.an) / harmonics[0]!.bn;
    const alpha2 = (2 * omega0 * harmonics[1]!.an) / harmonics[1]!.bn;
    if (Number.isFinite(alpha1) && Math.abs(alpha1) > 1e-5 && Math.abs(alpha1 - alpha2) < 1e-4 * Math.abs(alpha1)) {
      const scaleR = harmonics[0]!.an * (alpha1 * alpha1 + omega0 * omega0) / (2 * alpha1);
      const matchesAll = harmonics.slice(0, Math.min(12, harmonics.length)).every(h => {
        const nw = h.n * omega0;
        const denom = alpha1 * alpha1 + nw * nw;
        const expA = (2 * alpha1 * scaleR) / denom;
        const expB = (2 * nw * scaleR) / denom;
        return Math.abs(h.an - expA) < 1e-5 && Math.abs(h.bn - expB) < 1e-5;
      });
      if (matchesAll) {
        const aScalar = formatExactScalar(alpha1);
        const aStr = aScalar.tex;
        const rStr = formatExactScalar(scaleR).tex;
        const twoRStr = formatExactScalar(2 * scaleR).tex;
        const absTwoRStr = formatExactScalar(2 * Math.abs(scaleR)).tex;
        const nwTex = formatScaledN(omega0, "n");
        const cosLead = aScalar.isUnity ? "" : aStr;
        const aSqTex = aScalar.isUnity ? "1" : `(${aStr})^2`;
        const tanArg = aScalar.isUnity ? nwTex : String.raw`\frac{${nwTex}}{${aStr}}`;
        return {
          trigonometric: String.raw`x(t) = ${dcScalar.tex} + ${twoRStr}\sum_{n=1}^{\infty} \frac{${cosLead}\cos(${formatOmegaNT(omega0, "n")}) + ${nwTex}\sin(${formatOmegaNT(omega0, "n")})}{${aSqTex} + (${nwTex})^2}`,
          compact: String.raw`x(t) = ${dcScalar.tex} + ${absTwoRStr}\sum_{n=1}^{\infty} \frac{\cos\!\left(${formatOmegaNT(omega0, "n")} - \arctan(${tanArg})\right)}{\sqrt{${aSqTex} + (${nwTex})^2}}`,
          complex: String.raw`x(t) = ${rStr}\sum_{n=-\infty}^{\infty} \frac{1}{${aStr} + j ${nwTex}} e^{j ${formatOmegaNT(omega0, "n")}}`,
          exactClosedForm: true,
        };
      }
    }
  }

  // 5) Freehand / general non-elementary input fallback (fixed scalar frequency evaluation: NEVER string-concatenates n * w0!)
  const top = harmonics.filter(h => h.cnMag > 1e-5).slice(0, 5);
  const leadTrig: string[] = [];
  const leadComp: string[] = [];
  const leadCpx: string[] = [];
  if (hasDc) {
    leadTrig.push(dcScalar.tex);
    leadComp.push(dcScalar.tex);
    leadCpx.push(dcScalar.tex);
  }
  for (const h of top) {
    const arg = formatOmegaNT(omega0, String(h.n));
    if (Math.abs(h.an) > 1e-5) {
      const s = formatExactScalar(h.an);
      leadTrig.push(`${leadTrig.length === 0 ? (s.sign < 0 ? "-" : "") : s.sign < 0 ? " - " : " + "}${s.isUnity ? "" : s.absTex}\\cos(${arg})`);
    }
    if (Math.abs(h.bn) > 1e-5) {
      const s = formatExactScalar(h.bn);
      leadTrig.push(`${leadTrig.length === 0 ? (s.sign < 0 ? "-" : "") : s.sign < 0 ? " - " : " + "}${s.isUnity ? "" : s.absTex}\\sin(${arg})`);
    }
    const cm = formatExactScalar(h.cnMag);
    leadComp.push(`${leadComp.length === 0 ? "" : " + "}${cm.isUnity ? "" : cm.absTex}\\cos(${arg}${formatAnglePi(h.thetaN)})`);
    const cr = formatExactScalar(h.cPosRe);
    const ci = formatExactScalar(h.cPosIm);
    if (ci.sign === 0) {
      const pfx = leadCpx.length === 0 ? (cr.sign < 0 ? "-" : "") : cr.sign < 0 ? " - " : " + ";
      leadCpx.push(`${pfx}${cr.absTex}e^{j${arg}}`);
    } else {
      const cStr = cr.sign === 0
        ? `${ci.sign < 0 ? "-" : ""}${ci.isUnity ? "" : ci.absTex}j`
        : `(${cr.tex} ${ci.sign < 0 ? "-" : "+"} ${ci.isUnity ? "" : ci.absTex}j)`;
      leadCpx.push(`${leadCpx.length === 0 ? "" : " + "}${cStr}e^{j${arg}}`);
    }
  }
  const tail = config.harmonics > 5 ? " + \\cdots" : "";
  return {
    trigonometric: `x(t) \\approx ${leadTrig.join("")}${tail}`,
    compact: `x(t) \\approx ${leadComp.join("")}${tail}`,
    complex: `x(t) \\approx ${leadCpx.join("")}${tail}`,
    exactClosedForm: false,
  };
}

export function synthesizeTransformPairLatex(config: FourierTransformConfig): {
  signalFormula: string;
  transformFormula: string;
} {
  const A = formatExactScalar(config.amplitude).tex;
  const tau = formatExactScalar(config.width).tex;
  const t0 = config.shift;
  const shiftFactor = t0 === 0 ? "" : ` e^{-j 2\\pi f (${formatNumber(t0)})}`;
  const shiftedArg = t0 === 0 ? "t" : `(t ${t0 > 0 ? "-" : "+"} ${formatNumber(Math.abs(t0))})`;

  switch (config.signalId) {
    case "rect":
      return {
        signalFormula: String.raw`x(t) = ${A}\,\operatorname{rect}\!\left(\frac{${shiftedArg}}{${tau}}\right)`,
        transformFormula: String.raw`X(f) = ${A}\cdot ${tau}\,\operatorname{sinc}(${tau} f)${shiftFactor}`,
      };
    case "tri":
      return {
        signalFormula: String.raw`x(t) = ${A}\,\operatorname{tri}\!\left(\frac{${shiftedArg}}{${tau}}\right)`,
        transformFormula: String.raw`X(f) = ${A}\cdot ${tau}\,\operatorname{sinc}^2(${tau} f)${shiftFactor}`,
      };
    case "gaussian":
      return {
        signalFormula: String.raw`x(t) = ${A}\,e^{-\pi (${shiftedArg}/${tau})^2}`,
        transformFormula: String.raw`X(f) = ${A}\cdot ${tau}\,e^{-\pi (${tau} f)^2}${shiftFactor}`,
      };
    case "exponential": {
      const a = formatExactScalar(config.decayRate).tex;
      return {
        signalFormula: String.raw`x(t) = ${A}\,e^{-${a}${shiftedArg}} u(${shiftedArg})`,
        transformFormula: String.raw`X(f) = \frac{${A}}{${a} + j 2\pi f}${shiftFactor}`,
      };
    }
    case "modulated-rect": {
      const f0 = formatExactScalar(config.modFreqHz).tex;
      return {
        signalFormula: String.raw`x(t) = ${A}\,\operatorname{rect}\!\left(\frac{${shiftedArg}}{${tau}}\right)\cos(2\pi (${f0}) ${shiftedArg})`,
        transformFormula: String.raw`X(f) = \frac{${A}\cdot ${tau}}{2}\Big[\operatorname{sinc}(${tau}(f - ${f0})) + \operatorname{sinc}(${tau}(f + ${f0}))\Big]${shiftFactor}`,
      };
    }
    case "custom": {
      const clean = config.customExpr.trim();
      const expAbs = clean.match(/^(?:([0-9.]+)\s*\*?\s*)?exp\(\s*-\s*([0-9.]+)\s*\*?\s*abs\(\s*t\s*\)\s*\)$/i);
      if (expAbs) {
        const amp = expAbs[1] ? Number(expAbs[1]) : 1;
        const a = Number(expAbs[2]);
        const num = formatExactScalar(2 * amp * a).tex;
        const a2 = formatExactScalar(a * a).tex;
        return {
          signalFormula: String.raw`x(t) = ${amp === 1 ? "" : `${amp}\\,`}e^{-${a}|t|}`,
          transformFormula: String.raw`X(f) = \frac{${num}}{${a2} + (2\pi f)^2}`,
        };
      }
      const expAbsCos = clean.match(/^(?:([0-9.]+)\s*\*?\s*)?exp\(\s*-\s*([0-9.]+)\s*\*?\s*abs\(\s*t\s*\)\s*\)\s*\*\s*cos\(\s*2\s*\*?\s*pi\s*\*?\s*([0-9.]+)\s*\*?\s*t\s*\)$/i);
      if (expAbsCos) {
        const amp = expAbsCos[1] ? Number(expAbsCos[1]) : 1;
        const a = Number(expAbsCos[2]);
        const f0 = Number(expAbsCos[3]);
        const num = formatExactScalar(amp * a).tex;
        const a2 = formatExactScalar(a * a).tex;
        return {
          signalFormula: String.raw`x(t) = ${amp === 1 ? "" : `${amp}\\,`}e^{-${a}|t|}\cos(2\pi(${f0})t)`,
          transformFormula: String.raw`X(f) = \frac{${num}}{${a2} + 4\pi^2(f - ${f0})^2} + \frac{${num}}{${a2} + 4\pi^2(f + ${f0})^2}`,
        };
      }
      const rectExpr = clean.match(/^(?:([0-9.]+)\s*\*?\s*)?rect\(\s*t\s*(?:\/\s*([0-9.]+))?\s*\)$/i);
      if (rectExpr) {
        const amp = rectExpr[1] ? Number(rectExpr[1]) : 1;
        const w = rectExpr[2] ? Number(rectExpr[2]) : 1;
        const ampTex = formatExactScalar(amp).tex;
        const wTex = formatExactScalar(w).tex;
        return {
          signalFormula: String.raw`x(t) = ${amp === 1 ? "" : `${ampTex}\\,`}\operatorname{rect}\!\left(\frac{t}{${wTex}}\right)`,
          transformFormula: String.raw`X(f) = ${formatExactScalar(amp * w).tex}\,\operatorname{sinc}(${w === 1 ? "" : wTex} f)`,
        };
      }
      return {
        signalFormula: String.raw`x(t) = ${clean}`,
        transformFormula: String.raw`X(f) = \int_{-\infty}^{\infty} \left(${clean}\right) e^{-j 2\pi f t}\,dt`,
      };
    }
  }
}

export type SeriesMathStepsBundle = Readonly<{
  trig: readonly MathStep[];
  compact: readonly MathStep[];
  complex: readonly MathStep[];
}>;

export function buildSeriesMathSteps(
  config: FourierSeriesConfig,
  analysis: SeriesAnalysis,
  synth: SimplifiedSeriesLatex,
): SeriesMathStepsBundle {
  const T0 = analysis.period;
  const w0 = analysis.omega0;
  const T0Tex = formatExactScalar(T0).tex;
  const w0Tex = formatExactScalar(w0).tex;
  const w0n = formatOmegaNT(w0, "n");
  const cont = config.continuation ?? "periodic";
  const tStart = config.periodStart ?? 0;
  const tHalfEnd = tStart + config.period;
  const tFullStart = cont === "periodic" ? tStart : tStart - config.period;
  const tFullEnd = tStart + config.period;

  const H = analysis.symbolicProbeHarmonics;

  // 1) Real Analytical Polynomial Calculus Derivation (e.g. t^2 - 1, t^2, t, t^3, etc.)
  if (config.inputKind === "expression") {
    const poly = tryParsePolynomial(config.expression);
    if (poly) {
      const derived = derivePolynomialSeriesCalculus(poly, config.expression, tFullStart, tFullEnd, H);
      return {
        trig: derived.trigSteps,
        compact: derived.compactSteps,
        complex: derived.complexSteps,
      };
    }
  }

  // 2) Preset Analytical Derivations (Square, Sawtooth, Triangle)
  if (config.inputKind === "preset") {
    if (config.presetId === "square") {
      const sq = deriveSquareWaveCalculus(config.amplitude, config.period, H);
      return { trig: sq.trigSteps, compact: sq.compactSteps, complex: sq.complexSteps };
    }
    if (config.presetId === "sawtooth") {
      const saw = deriveSawtoothCalculus(config.amplitude, config.period, H);
      return { trig: saw.trigSteps, compact: saw.compactSteps, complex: saw.complexSteps };
    }
    if (config.presetId === "triangle") {
      const tri = deriveTriangleCalculus(config.amplitude, config.period, H);
      return { trig: tri.trigSteps, compact: tri.compactSteps, complex: tri.complexSteps };
    }
  }

  // 3) Piecewise Subintervals Derivation
  if (config.inputKind === "piecewise" && config.piecewiseSegments.length > 0) {
    const pw = derivePiecewiseSeriesCalculus(config.piecewiseSegments, T0, w0, H, analysis.a0);
    return { trig: pw.trigSteps, compact: pw.compactSteps, complex: pw.complexSteps };
  }

  const t1Tex = formatExactScalar(tFullStart).tex;
  const t2Tex = formatExactScalar(tFullEnd).tex;
  const thTex = formatExactScalar(tHalfEnd).tex;
  const invT0 = formatExactScalar(1 / T0).tex;
  const twoOverT0 = formatExactScalar(2 / T0).tex;
  const dcTex = formatExactScalar(analysis.a0).tex;

  const anList = H.map(h => h.an);
  const bnList = H.map(h => h.bn);
  const patA = anList.every(v => Math.abs(v) < 1e-7) ? undefined : matchClosedSequence(anList);
  const patB = bnList.every(v => Math.abs(v) < 1e-7) ? undefined : matchClosedSequence(bnList);

  const isOdd = H.slice(0, 8).every(h => Math.abs(h.an) < 1e-6) && H.some(h => Math.abs(h.bn) > 1e-6);
  const isEven = H.slice(0, 8).every(h => Math.abs(h.bn) < 1e-6) && H.some(h => Math.abs(h.an) > 1e-6);
  const nonZero = H.filter(h => h.cnMag > 1e-7);
  const isFiniteTrig =
    nonZero.length <= 8 &&
    H.length >= 8 &&
    H.slice(-Math.min(8, H.length)).every(h => h.cnMag < 1e-7);

  // Build subinterval evaluation step (Step 2) using continuous calculus
  let evalTrigStep: MathStep;
  let evalCpxStep: MathStep;

  if (cont === "even" || isEven) {
    evalTrigStep = {
      title: "Even Symmetry Simplification",
      latex: cont === "even"
        ? String.raw`x(-t)=x(t) \implies b_n = 0,\quad a_n = \frac{4}{${T0Tex}}\int_{${formatExactScalar(tStart).tex}}^{${thTex}} x(t)\cos(${w0n})\,dt`
        : String.raw`x(t)\text{ even around }t=0 \implies b_n = 0,\quad a_n = ${twoOverT0}\int_{${t1Tex}}^{${t2Tex}} x(t)\cos(${w0n})\,dt`,
    };
    evalCpxStep = {
      title: "Even Real-Part Cosine Reduction",
      latex: String.raw`b_n = 0 \implies c_n = \frac{a_n}{2} = ${invT0}\int_{${t1Tex}}^{${t2Tex}} x(t)\cos(${w0n})\,dt`,
    };
  } else if (cont === "odd" || isOdd) {
    evalTrigStep = {
      title: "Odd Symmetry Simplification",
      latex: cont === "odd"
        ? String.raw`x(-t)=-x(t) \implies a_0 = 0,\; a_n = 0,\quad b_n = \frac{4}{${T0Tex}}\int_{${formatExactScalar(tStart).tex}}^{${thTex}} x(t)\sin(${w0n})\,dt`
        : String.raw`x(t)\text{ odd} \implies a_0 = 0,\; a_n = 0,\quad b_n = ${twoOverT0}\int_{${t1Tex}}^{${t2Tex}} x(t)\sin(${w0n})\,dt`,
    };
    evalCpxStep = {
      title: "Odd Imaginary-Part Sine Reduction",
      latex: String.raw`a_n = 0 \implies c_n = \frac{-j b_n}{2} = \frac{-j}{${T0Tex}}\int_{${t1Tex}}^{${t2Tex}} x(t)\sin(${w0n})\,dt`,
    };
  } else if (isFiniteTrig) {
    evalTrigStep = {
      title: "Apply Continuous Orthogonality Relations",
      latex: String.raw`\int_{${t1Tex}}^{${t2Tex}}\cos(${w0n})\cos(m\omega_0 t)\,dt = \int_{${t1Tex}}^{${t2Tex}}\sin(${w0n})\sin(m\omega_0 t)\,dt = \frac{${T0Tex}}{2}\delta_{mn}`,
    };
    evalCpxStep = {
      title: "Apply Euler's Formula to Finite Modes",
      latex: String.raw`\cos\theta = \frac{e^{j\theta}+e^{-j\theta}}{2},\quad \sin\theta = \frac{e^{j\theta}-e^{-j\theta}}{2j}`,
    };
  } else if (config.inputKind === "piecewise" && config.piecewiseSegments.length > 0) {
    const segSum = config.piecewiseSegments
      .slice(0, 3)
      .map(s => String.raw`\int_{${formatExactScalar(s.start).tex}}^{${formatExactScalar(s.end).tex}} (\cdot)\,dt`)
      .join(" + ");
    evalTrigStep = {
      title: "Split Continuous Integral Across Piecewise Subintervals",
      latex: String.raw`\int_{${t1Tex}}^{${t2Tex}} x(t)\binom{\cos}{\sin}(${w0n})\,dt = ${segSum}${config.piecewiseSegments.length > 3 ? "+\\cdots" : ""}`,
    };
    evalCpxStep = {
      title: "Split Complex Integral Across Piecewise Subintervals",
      latex: String.raw`c_n = ${invT0}\left(${segSum}${config.piecewiseSegments.length > 3 ? "+\\cdots" : ""}\right)`,
    };
  } else if (config.inputKind === "preset" && config.presetId === "square") {
    const tMid = formatExactScalar(tStart + config.period / 2).tex;
    const A = formatExactScalar(config.amplitude).tex;
    evalTrigStep = {
      title: "Split Integral at Half-Period & Antidifferentiate",
      latex: String.raw`b_n = ${twoOverT0}\left[\int_{${t1Tex}}^{${tMid}} ${A}\sin(${w0n})\,dt - \int_{${tMid}}^{${t2Tex}} ${A}\sin(${w0n})\,dt\right] = \frac{${formatExactScalar(2 * config.amplitude).tex}(1-(-1)^n)}{n\pi}`,
    };
    evalCpxStep = {
      title: "Integrate e^{-j n ω₀ t} Over Half-Periods",
      latex: String.raw`c_n = ${invT0}\left[\int_{${t1Tex}}^{${tMid}} ${A}e^{-j${w0n}}\,dt - \int_{${tMid}}^{${t2Tex}} ${A}e^{-j${w0n}}\,dt\right] = \frac{${A}(1-(-1)^n)}{j n\pi}`,
    };
  } else if (config.inputKind === "preset" && (config.presetId === "sawtooth" || config.presetId === "triangle")) {
    evalTrigStep = {
      title: "Evaluate Continuous Integral by Parts",
      latex: String.raw`\int u\,dv = uv - \int v\,du \quad\text{with } u = x(t),\; dv = \binom{\cos}{\sin}(${w0n})\,dt`,
    };
    evalCpxStep = {
      title: "Evaluate Complex Exponential Integral by Parts",
      latex: String.raw`\int x(t)e^{-j${w0n}}\,dt = \frac{x(t)e^{-j${w0n}}}{-j n\omega_0} + \int \frac{x'(t)e^{-j${w0n}}}{j n\omega_0}\,dt`,
    };
  } else {
    evalTrigStep = {
      title: "Evaluate Continuous Orthogonality Integrals",
      latex: String.raw`\int_{${t1Tex}}^{${t2Tex}} x(t)\cos(${w0n})\,dt,\quad \int_{${t1Tex}}^{${t2Tex}} x(t)\sin(${w0n})\,dt \quad (\text{by parts / quadrature})`,
    };
    evalCpxStep = {
      title: "Evaluate Complex Fourier Integral",
      latex: String.raw`c_n = ${invT0}\int_{${t1Tex}}^{${t2Tex}} x(t)e^{-j ${w0n}}\,dt = \frac{a_n - j b_n}{2}`,
    };
  }

  // Step 3: General Closed-Form Coefficients for any n
  const fmtPat = (pat: ClosedTermPattern) => {
    const f = pat.trigOuterFactor;
    const pfx = f.sign < 0 ? "-" : "";
    const mult = f.isUnity ? "" : f.absTex;
    return String.raw`${pfx}${mult}\frac{${pat.trigInnerNumerator}}{${pat.trigInnerDenom}}`;
  };

  let anFormula = isOdd ? "0" : patA ? fmtPat(patA) : isFiniteTrig ? `\\text{nonzero at active modes } n` : `${twoOverT0}\\int_{${t1Tex}}^{${t2Tex}} x(t)\\cos(${w0n})\\,dt`;
  let bnFormula = isEven ? "0" : patB ? fmtPat(patB) : isFiniteTrig ? `\\text{nonzero at active modes } n` : `${twoOverT0}\\int_{${t1Tex}}^{${t2Tex}} x(t)\\sin(${w0n})\\,dt`;
  if (patA?.indexVar === "k") anFormula = `\\text{for } n=${patA.freqMulExpr}:\\; ${fmtPat(patA)}`;
  if (patB?.indexVar === "k") bnFormula = `\\text{for } n=${patB.freqMulExpr}:\\; ${fmtPat(patB)}`;

  const h1 = H[0];
  const cnSample = h1
    ? String.raw`\quad(|C_1| = ${formatExactScalar(h1.cnMag).tex},\; \theta_1 = ${formatAnglePi(h1.thetaN) || "0"})`
    : "";

  const trigCoeffStep: MathStep = {
    title: "Simplified General Coefficients (All n ≥ 1)",
    latex: String.raw`a_0 = ${dcTex},\quad a_n = ${anFormula},\quad b_n = ${bnFormula}`,
  };

  const compactCoeffStep: MathStep = {
    title: "Convert Rectangular (a_n, b_n) to Polar (C_n, θ_n)",
    latex: String.raw`C_0 = a_0 = ${dcTex},\quad C_n = \sqrt{a_n^2 + b_n^2},\quad \theta_n = \operatorname{atan2}(-b_n, a_n)${cnSample}`,
  };

  const cpxCoeffStep: MathStep = {
    title: "Convert to Two-Sided Complex Coefficients (n ≠ 0)",
    latex: String.raw`c_0 = ${dcTex},\quad c_n = \frac{a_n - j b_n}{2},\quad c_{-n} = c_n^{*}`,
  };

  return {
    trig: [
      {
        title: "Continuous Fourier Coefficient Integrals",
        latex: String.raw`T_0 = ${T0Tex},\; \omega_0 = ${w0Tex} \;\Longrightarrow\; a_0 = ${invT0}\int_{${t1Tex}}^{${t2Tex}} x(t)\,dt,\;\; \binom{a_n}{b_n} = ${twoOverT0}\int_{${t1Tex}}^{${t2Tex}} x(t)\binom{\cos}{\sin}(${w0n})\,dt`,
      },
      evalTrigStep,
      trigCoeffStep,
      {
        title: "Substitute into Trigonometric Fourier Series",
        latex: synth.trigonometric,
      },
    ],
    compact: [
      {
        title: "Continuous Fourier Coefficient Integrals",
        latex: String.raw`T_0 = ${T0Tex},\; \omega_0 = ${w0Tex},\quad a_0 = ${invT0}\int_{${t1Tex}}^{${t2Tex}} x(t)\,dt,\quad a_n = ${anFormula},\quad b_n = ${bnFormula}`,
      },
      evalTrigStep,
      compactCoeffStep,
      {
        title: "Substitute into Compact Cosine Series",
        latex: synth.compact,
      },
    ],
    complex: [
      {
        title: "Continuous Complex Exponential Integral",
        latex: String.raw`T_0 = ${T0Tex},\; \omega_0 = ${w0Tex} \;\Longrightarrow\; c_n = ${invT0}\int_{${t1Tex}}^{${t2Tex}} x(t)\,e^{-j ${w0n}}\,dt`,
      },
      evalCpxStep,
      cpxCoeffStep,
      {
        title: "Substitute into Complex Exponential Series",
        latex: synth.complex,
      },
    ],
  };
}

