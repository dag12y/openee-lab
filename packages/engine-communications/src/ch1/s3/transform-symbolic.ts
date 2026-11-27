import { compileExpression, expressionToLatex } from "./expr.js";
import type { FourierTransformConfig } from "./model.js";
import { formatExactScalar, formatNumber } from "./symbolic.js";

const PI = Math.PI;
const TAU = 2 * PI;

export type MathStep = Readonly<{
  title: string;
  latex: string;
  note?: string;
}>;

export type TransformSymbolicResult = Readonly<{
  signalFormula: string;
  transformFormula: string;
  transformOmegaFormula: string;
  steps: readonly MathStep[];
}>;

function unityPrefix(val: number): string {
  const s = formatExactScalar(val);
  if (s.isUnity) return s.sign < 0 ? "-" : "";
  return `${s.tex}\\,`;
}

function mulVar(coeff: number, variable: string): string {
  const s = formatExactScalar(coeff);
  if (s.sign === 0) return "0";
  if (s.isUnity) return s.sign < 0 ? `-${variable}` : variable;
  const needSpace = /\\[a-zA-Z]+$/.test(s.tex) && /^[a-zA-Z]/.test(variable);
  return needSpace ? `${s.tex} ${variable}` : `${s.tex}${variable}`;
}

function formatShiftExp(t0: number, varSym: "f" | "\\omega"): string {
  if (Math.abs(t0) < 1e-8) return "";
  const sign = t0 > 0 ? "-" : "+";
  if (varSym === "f") {
    const twoT0 = formatExactScalar(2 * Math.abs(t0));
    const twoPiTerm = twoT0.isUnity ? "\\pi" : `${twoT0.tex}\\pi`;
    return `e^{${sign}j ${twoPiTerm} f}`;
  }
  const tAbs = formatExactScalar(Math.abs(t0));
  const coeff = tAbs.isUnity ? "" : tAbs.absTex;
  return `e^{${sign}j ${coeff}\\omega}`;
}

function formatShiftedVar(t0: number, tau = 1): string {
  const arg = Math.abs(t0) < 1e-8
    ? "t"
    : `(t ${t0 > 0 ? "-" : "+"} ${formatExactScalar(Math.abs(t0)).absTex})`;
  if (Math.abs(tau - 1) < 1e-8) return arg;
  const cleanT = Math.abs(t0) < 1e-8
    ? "t"
    : `t ${t0 > 0 ? "-" : "+"} ${formatExactScalar(Math.abs(t0)).absTex}`;
  return String.raw`\frac{${cleanT}}{${formatExactScalar(tau).absTex}}`;
}

function splitTopLevelAddSub(raw: string): Array<{ sign: 1 | -1; term: string }> | undefined {
  const s = raw.trim();
  if (!s || s.startsWith("{")) return undefined;
  const parts: Array<{ sign: 1 | -1; term: string }> = [];
  let depthParen = 0;
  let depthBrace = 0;
  let start = 0;
  let curSign: 1 | -1 = 1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(") depthParen++;
    else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
    else if (ch === "{") depthBrace++;
    else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);
    else if ((ch === "+" || ch === "-") && depthParen === 0 && depthBrace === 0) {
      if (i === start) {
        if (ch === "-") curSign = (curSign * -1) as 1 | -1;
        start = i + 1;
        continue;
      }
      const prev = s.slice(0, i).trimEnd().slice(-1);
      if ("*/^eE(".includes(prev)) continue;
      const chunk = s.slice(start, i).trim();
      if (chunk) parts.push({ sign: curSign, term: chunk });
      curSign = ch === "-" ? -1 : 1;
      start = i + 1;
    }
  }
  const tail = s.slice(start).trim();
  if (tail) parts.push({ sign: curSign, term: tail });
  return parts.length > 1 ? parts : undefined;
}

function parseLinearArgT(argRaw: string): { shift: number; scale: number } | undefined {
  const s = argRaw.replace(/\s+/g, "");
  let m = s.match(/^\(?t(?:([+-])([0-9.]+))?\)?$/i);
  if (m) {
    const t0 = m[1] ? (m[1] === "-" ? Number(m[2]) : -Number(m[2])) : 0;
    return Number.isFinite(t0) ? { shift: t0, scale: 1 } : undefined;
  }
  m = s.match(/^\(?t(?:([+-])([0-9.]+))?\)?\/([0-9.]+)$/i);
  if (m) {
    const t0 = m[1] ? (m[1] === "-" ? Number(m[2]) : -Number(m[2])) : 0;
    const w = Number(m[3]);
    return Number.isFinite(t0) && Number.isFinite(w) && w > 0 ? { shift: t0, scale: 1 / w } : undefined;
  }
  m = s.match(/^([0-9.]+)\*?\(?t(?:([+-])([0-9.]+))?\)?$/i);
  if (m) {
    const b = Number(m[1]);
    const t0 = m[2] ? (m[2] === "-" ? Number(m[3]) : -Number(m[3])) : 0;
    return Number.isFinite(b) && b > 0 && Number.isFinite(t0) ? { shift: t0, scale: b } : undefined;
  }
  return undefined;
}

function parseOmegaCoeff(rawInner: string): { f0: number; w0: number; isTwoPi: boolean } | undefined {
  const s = rawInner.replace(/\s+/g, "");
  // Match 2*pi*f0*t or 2*pi*t
  let m = s.match(/^2\*?pi\*(?:([0-9.]+)\*?)?t$/i);
  if (m) {
    const f0 = m[1] ? Number(m[1]) : 1;
    return Number.isFinite(f0) ? { f0, w0: TAU * f0, isTwoPi: true } : undefined;
  }
  // Match a*pi*t or pi*t
  m = s.match(/^(?:([0-9.]+)\*?)?pi\*?t$/i);
  if (m) {
    const k = m[1] ? Number(m[1]) : 1;
    return Number.isFinite(k) ? { f0: k / 2, w0: k * PI, isTwoPi: false } : undefined;
  }
  // Match w0*t or t
  m = s.match(/^(?:([0-9.]+)\*?)?t$/i);
  if (m) {
    const w0 = m[1] ? Number(m[1]) : 1;
    return Number.isFinite(w0) ? { f0: w0 / TAU, w0, isTwoPi: false } : undefined;
  }
  return undefined;
}

function factorial(n: number): number {
  let acc = 1;
  for (let i = 2; i <= n; i++) acc *= i;
  return acc;
}

function solveElementaryTransformTerm(termRaw: string): {
  sigTex: string;
  fTex: string;
  wTex: string;
  ruleTitle: string;
  ruleLatex: string;
} | undefined {
  let clean = termRaw.trim();
  let leadAmp = 1;
  const ampMatch = clean.match(/^([+-]?\d+(?:\.\d+)?)\s*\*\s*(.+)$/);
  if (ampMatch) {
    leadAmp = Number(ampMatch[1]);
    clean = ampMatch[2]!.trim();
  }
  if (!Number.isFinite(leadAmp) || Math.abs(leadAmp) < 1e-12) return undefined;
  const ampScalar = formatExactScalar(leadAmp);
  const ampPrefix = unityPrefix(leadAmp);

  // 1) A * rect(...)
  const rectM = clean.match(/^rect\(([^)]+)\)$/i);
  if (rectM) {
    const lin = parseLinearArgT(rectM[1]!);
    if (lin) {
      const tau = 1 / lin.scale;
      const t0 = lin.shift;
      const sigArg = formatShiftedVar(t0, tau);
      const fSincArg = mulVar(tau, "f");
      const wSincArg = String.raw`\frac{${mulVar(tau, "\\omega")}}{2\pi}`;
      const eF = formatShiftExp(t0, "f");
      const eW = formatShiftExp(t0, "\\omega");
      const areaPrefix = unityPrefix(leadAmp * tau);
      const a0 = formatExactScalar(-tau / 2).tex;
      const b0 = formatExactScalar(tau / 2).tex;
      return {
        sigTex: String.raw`${ampPrefix}\operatorname{rect}\!\left(${sigArg}\right)`,
        fTex: String.raw`${areaPrefix}\operatorname{sinc}(${fSincArg})${eF ? `\\,${eF}` : ""}`,
        wTex: String.raw`${areaPrefix}\operatorname{sinc}\!\left(${wSincArg}\right)${eW ? `\\,${eW}` : ""}`,
        ruleTitle: "Integrate Rectangular Support & Time-Shift",
        ruleLatex: String.raw`X(f) = ${eF ? `${eF}` : ""}\int_{${a0}}^{${b0}} ${ampScalar.tex}e^{-j2\pi ft}\,dt = ${formatExactScalar(leadAmp * tau).tex}\,\frac{\sin(\pi ${fSincArg})}{\pi ${fSincArg}}${eF ? `\\,${eF}` : ""}`,
      };
    }
  }

  // 2) A * rect(...) * cos(...)
  const rectCosM = clean.match(/^rect\(([^)]+)\)\s*\*\s*(cos|sin)\(([^)]+)\)$/i);
  if (rectCosM) {
    const lin = parseLinearArgT(rectCosM[1]!);
    const fnName = rectCosM[2]!.toLowerCase();
    const om = parseOmegaCoeff(rectCosM[3]!);
    if (lin && om) {
      const tau = 1 / lin.scale;
      const t0 = lin.shift;
      const halfArea = formatExactScalar(0.5 * leadAmp * tau);
      const halfLead = halfArea.isUnity ? (halfArea.sign < 0 ? "-" : "") : halfArea.tex;
      const f0S = formatExactScalar(om.f0).tex;
      const w0S = formatExactScalar(om.w0).tex;
      const tauPrefix = formatExactScalar(tau).isUnity ? "" : formatExactScalar(tau).absTex;
      const eF = formatShiftExp(t0, "f");
      const eW = formatShiftExp(t0, "\\omega");
      const fMinus = `${tauPrefix}(f - ${f0S})`;
      const fPlus = `${tauPrefix}(f + ${f0S})`;
      const wMinus = String.raw`\frac{${tauPrefix}(\omega - ${w0S})}{2\pi}`;
      const wPlus = String.raw`\frac{${tauPrefix}(\omega + ${w0S})}{2\pi}`;
      if (fnName === "cos") {
        return {
          sigTex: String.raw`${ampPrefix}\operatorname{rect}\!\left(${formatShiftedVar(t0, tau)}\right)\cos(${mulVar(om.w0, "t")})`,
          fTex: String.raw`${halfLead}\Big[\operatorname{sinc}\!\left(${fMinus}\right) + \operatorname{sinc}\!\left(${fPlus}\right)\Big]${eF ? `\\,${eF}` : ""}`,
          wTex: String.raw`${halfLead}\Big[\operatorname{sinc}\!\left(${wMinus}\right) + \operatorname{sinc}\!\left(${wPlus}\right)\Big]${eW ? `\\,${eW}` : ""}`,
          ruleTitle: "Modulation Property (Euler Cosine)",
          ruleLatex: String.raw`\cos(\omega_0 t) = \frac{e^{j\omega_0 t}+e^{-j\omega_0 t}}{2} \implies X(f) = \frac{1}{2}\big[X_0(f-f_0) + X_0(f+f_0)\big]`,
        };
      }
      return {
        sigTex: String.raw`${ampPrefix}\operatorname{rect}\!\left(${formatShiftedVar(t0, tau)}\right)\sin(${mulVar(om.w0, "t")})`,
        fTex: String.raw`\frac{${formatExactScalar(leadAmp * tau).tex}}{2j}\Big[\operatorname{sinc}\!\left(${fMinus}\right) - \operatorname{sinc}\!\left(${fPlus}\right)\Big]${eF ? `\\,${eF}` : ""}`,
        wTex: String.raw`\frac{${formatExactScalar(leadAmp * tau).tex}}{2j}\Big[\operatorname{sinc}\!\left(${wMinus}\right) - \operatorname{sinc}\!\left(${wPlus}\right)\Big]${eW ? `\\,${eW}` : ""}`,
        ruleTitle: "Modulation Property (Euler Sine)",
        ruleLatex: String.raw`\sin(\omega_0 t) = \frac{e^{j\omega_0 t}-e^{-j\omega_0 t}}{2j} \implies X(f) = \frac{1}{2j}\big[X_0(f-f_0) - X_0(f+f_0)\big]`,
      };
    }
  }

  // 3) A * tri(...)
  const triM = clean.match(/^tri\(([^)]+)\)$/i);
  if (triM) {
    const lin = parseLinearArgT(triM[1]!);
    if (lin) {
      const tau = 1 / lin.scale;
      const t0 = lin.shift;
      const sigArg = formatShiftedVar(t0, tau);
      const fSincArg = mulVar(tau, "f");
      const wSincArg = String.raw`\frac{${mulVar(tau, "\\omega")}}{2\pi}`;
      const eF = formatShiftExp(t0, "f");
      const eW = formatShiftExp(t0, "\\omega");
      const areaPrefix = unityPrefix(leadAmp * tau);
      return {
        sigTex: String.raw`${ampPrefix}\operatorname{tri}\!\left(${sigArg}\right)`,
        fTex: String.raw`${areaPrefix}\operatorname{sinc}^2(${fSincArg})${eF ? `\\,${eF}` : ""}`,
        wTex: String.raw`${areaPrefix}\operatorname{sinc}^2\!\left(${wSincArg}\right)${eW ? `\\,${eW}` : ""}`,
        ruleTitle: "Convolution Identity: tri = rect * rect",
        ruleLatex: String.raw`\operatorname{tri}(t/\tau) = \frac{1}{\tau}\operatorname{rect}(t/\tau)*\operatorname{rect}(t/\tau) \implies X(f) = ${areaPrefix}\operatorname{sinc}^2(${fSincArg})${eF ? `\\,${eF}` : ""}`,
      };
    }
  }

  // 4) A * sinc(B*(t-t0))^2
  const sincSqM = clean.match(/^sinc\(([^)]+)\)\s*\^\s*2$/i);
  if (sincSqM) {
    const lin = parseLinearArgT(sincSqM[1]!);
    if (lin) {
      const B = lin.scale;
      const invB = unityPrefix(leadAmp / B);
      const triArgF = Math.abs(B - 1) < 1e-8 ? "f" : String.raw`\frac{f}{${formatExactScalar(B).absTex}}`;
      const triArgW = String.raw`\frac{\omega}{${formatExactScalar(TAU * B).tex}}`;
      const eF = formatShiftExp(lin.shift, "f");
      const eW = formatShiftExp(lin.shift, "\\omega");
      return {
        sigTex: String.raw`${ampPrefix}\operatorname{sinc}^2(${mulVar(B, lin.shift === 0 ? "t" : `(t ${lin.shift > 0 ? "-" : "+"} ${formatExactScalar(Math.abs(lin.shift)).absTex})`)})`,
        fTex: String.raw`${invB}\operatorname{tri}\!\left(${triArgF}\right)${eF ? `\\,${eF}` : ""}`,
        wTex: String.raw`${invB}\operatorname{tri}\!\left(${triArgW}\right)${eW ? `\\,${eW}` : ""}`,
        ruleTitle: "Duality Theorem (tri ↔ sinc²)",
        ruleLatex: String.raw`\operatorname{tri}\!\left(\frac{t}{\tau}\right) \leftrightarrow \tau\operatorname{sinc}^2(\tau f) \;\Longrightarrow\; \operatorname{sinc}^2(Bt) \leftrightarrow \frac{1}{|B|}\operatorname{tri}\!\left(\frac{f}{B}\right)`,
      };
    }
  }

  // 5) A * sinc(B * (t - t0))
  const sincM = clean.match(/^sinc\(([^)]+)\)$/i);
  if (sincM) {
    const lin = parseLinearArgT(sincM[1]!);
    if (lin) {
      const B = lin.scale;
      const invB = unityPrefix(leadAmp / B);
      const t0 = lin.shift;
      const tArg = Math.abs(t0) < 1e-8 ? "t" : `(t ${t0 > 0 ? "-" : "+"} ${formatExactScalar(Math.abs(t0)).absTex})`;
      const eF = formatShiftExp(t0, "f");
      const eW = formatShiftExp(t0, "\\omega");
      const rectArgF = Math.abs(B - 1) < 1e-8 ? "f" : String.raw`\frac{f}{${formatExactScalar(B).absTex}}`;
      const rectArgW = String.raw`\frac{\omega}{${formatExactScalar(TAU * B).tex}}`;
      return {
        sigTex: String.raw`${ampPrefix}\operatorname{sinc}(${mulVar(B, tArg)})`,
        fTex: String.raw`${invB}\operatorname{rect}\!\left(${rectArgF}\right)${eF ? `\\,${eF}` : ""}`,
        wTex: String.raw`${invB}\operatorname{rect}\!\left(${rectArgW}\right)${eW ? `\\,${eW}` : ""}`,
        ruleTitle: "Duality Theorem (rect ↔ sinc)",
        ruleLatex: String.raw`\operatorname{rect}\!\left(\frac{t}{\tau}\right) \leftrightarrow \tau\,\operatorname{sinc}(\tau f) \;\Longrightarrow\; \operatorname{sinc}(Bt) \leftrightarrow \frac{1}{|B|}\operatorname{rect}\!\left(\frac{f}{B}\right)`,
      };
    }
  }

  // 6) A * exp(-a * |t - t0|)
  const expAbs = clean.match(/^exp\(\s*-\s*(?:([0-9.]+)\s*\*?\s*)?abs\(([^)]+)\)\s*\)$/i);
  if (expAbs) {
    const a = expAbs[1] ? Number(expAbs[1]) : 1;
    const lin = parseLinearArgT(expAbs[2]!);
    if (a > 0 && lin && Math.abs(lin.scale - 1) < 1e-8) {
      const aS = formatExactScalar(a);
      const num = formatExactScalar(2 * leadAmp * a).tex;
      const a2 = formatExactScalar(a * a).tex;
      const t0 = lin.shift;
      const absArg = Math.abs(t0) < 1e-8 ? "t" : `t ${t0 > 0 ? "-" : "+"} ${formatExactScalar(Math.abs(t0)).absTex}`;
      const eF = formatShiftExp(t0, "f");
      const eW = formatShiftExp(t0, "\\omega");
      return {
        sigTex: String.raw`${ampPrefix}e^{-${aS.isUnity ? "" : aS.tex}|${absArg}|}`,
        fTex: String.raw`\frac{${num}}{${a2} + (2\pi f)^2}${eF ? `\\,${eF}` : ""}`,
        wTex: String.raw`\frac{${num}}{${a2} + \omega^2}${eW ? `\\,${eW}` : ""}`,
        ruleTitle: "Split Bilateral Exponential at Symmetry Center",
        ruleLatex: String.raw`X(f) = ${eF ? `${eF}` : ""}\left(\int_{-\infty}^0 ${ampScalar.tex}e^{(${aS.tex}-j2\pi f)u}du + \int_0^{\infty} ${ampScalar.tex}e^{-(${aS.tex}+j2\pi f)u}du\right) = \frac{${num}}{${a2} + (2\pi f)^2}${eF ? `\\,${eF}` : ""}`,
      };
    }
  }

  // 7) A * exp(-a * |t|) * (cos|sin)(w0 * t)
  const expAbsTrig = clean.match(/^exp\(\s*-\s*(?:([0-9.]+)\s*\*?\s*)?abs\(\s*t\s*\)\s*\)\s*\*\s*(cos|sin)\(([^)]+)\)$/i);
  if (expAbsTrig) {
    const a = expAbsTrig[1] ? Number(expAbsTrig[1]) : 1;
    const fnName = expAbsTrig[2]!.toLowerCase();
    const om = parseOmegaCoeff(expAbsTrig[3]!);
    if (a > 0 && om) {
      const num = formatExactScalar(leadAmp * a).tex;
      const a2 = formatExactScalar(a * a).tex;
      const f0Tex = formatExactScalar(om.f0).tex;
      const w0Tex = formatExactScalar(om.w0).tex;
      if (fnName === "cos") {
        return {
          sigTex: String.raw`${ampPrefix}e^{-${formatExactScalar(a).isUnity ? "" : formatExactScalar(a).tex}|t|}\cos(${mulVar(om.w0, "t")})`,
          fTex: String.raw`\frac{${num}}{${a2} + 4\pi^2(f - ${f0Tex})^2} + \frac{${num}}{${a2} + 4\pi^2(f + ${f0Tex})^2}`,
          wTex: String.raw`\frac{${num}}{${a2} + (\omega - ${w0Tex})^2} + \frac{${num}}{${a2} + (\omega + ${w0Tex})^2}`,
          ruleTitle: "Modulate Bilateral Exponential (Euler Cosine)",
          ruleLatex: String.raw`x(t) = x_0(t)\frac{e^{j\omega_0 t}+e^{-j\omega_0 t}}{2} \implies X(f) = \frac{1}{2}\big[X_0(f - f_0) + X_0(f + f_0)\big]`,
        };
      }
      return {
        sigTex: String.raw`${ampPrefix}e^{-${formatExactScalar(a).isUnity ? "" : formatExactScalar(a).tex}|t|}\sin(${mulVar(om.w0, "t")})`,
        fTex: String.raw`j\left(\frac{${num}}{${a2} + 4\pi^2(f + ${f0Tex})^2} - \frac{${num}}{${a2} + 4\pi^2(f - ${f0Tex})^2}\right)`,
        wTex: String.raw`j\left(\frac{${num}}{${a2} + (\omega + ${w0Tex})^2} - \frac{${num}}{${a2} + (\omega - ${w0Tex})^2}\right)`,
        ruleTitle: "Modulate Bilateral Exponential (Euler Sine)",
        ruleLatex: String.raw`x(t) = x_0(t)\frac{e^{j\omega_0 t}-e^{-j\omega_0 t}}{2j} \implies X(f) = \frac{1}{2j}\big[X_0(f - f_0) - X_0(f + f_0)\big]`,
      };
    }
  }

  // 8) A * exp(-pi * ((t-t0) / tau)^2) or A * exp(-alpha * (t-t0)^2)
  const gaussPi = clean.match(/^exp\(\s*-\s*pi\s*\*?\s*(?:\(([^)]+)\)|t)\s*\^\s*2\s*\)$/i);
  if (gaussPi) {
    const lin = gaussPi[1] ? parseLinearArgT(gaussPi[1]) : { shift: 0, scale: 1 };
    if (lin) {
      const tau = 1 / lin.scale;
      const tauS = formatExactScalar(tau);
      const outPrefix = unityPrefix(leadAmp * tau);
      const eF = formatShiftExp(lin.shift, "f");
      const eW = formatShiftExp(lin.shift, "\\omega");
      const fArg = mulVar(tau, "f");
      return {
        sigTex: String.raw`${ampPrefix}e^{-\pi(${formatShiftedVar(lin.shift, tau)})^2}`,
        fTex: String.raw`${outPrefix}e^{-\pi(${fArg})^2}${eF ? `\\,${eF}` : ""}`,
        wTex: String.raw`${outPrefix}e^{-\frac{(${mulVar(tau, "\\omega")})^2}{4\pi}}${eW ? `\\,${eW}` : ""}`,
        ruleTitle: "Complete the Square in Normalized Gaussian",
        ruleLatex: String.raw`\int_{-\infty}^{\infty} e^{-\pi(u/\tau)^2 - j2\pi fu}\,du = \tau e^{-\pi(\tau f)^2}\underbrace{\int_{-\infty}^{\infty}e^{-\pi v^2}dv}_{1}`,
      };
    }
  }
  const gaussAlpha = clean.match(/^exp\(\s*-\s*(?:([0-9.]+)\s*\*?\s*)?(?:t|\(([^)]+)\))\s*\^\s*2\s*\)$/i);
  if (gaussAlpha) {
    const alpha = gaussAlpha[1] ? Number(gaussAlpha[1]) : 1;
    const lin = gaussAlpha[2] ? parseLinearArgT(gaussAlpha[2]) : { shift: 0, scale: 1 };
    if (alpha > 0 && lin && Math.abs(lin.scale - 1) < 1e-8) {
      const alphaS = formatExactScalar(alpha);
      const sqrtRatio = formatExactScalar(leadAmp * Math.sqrt(PI / alpha));
      const ratioTex = alphaS.isUnity ? String.raw`\sqrt{\pi}` : String.raw`\sqrt{\frac{\pi}{${alphaS.tex}}}`;
      const leadOut = sqrtRatio.tex === formatNumber(leadAmp * Math.sqrt(PI / alpha))
        ? (leadAmp === 1 ? ratioTex : `${ampScalar.tex}${ratioTex}`)
        : sqrtRatio.tex;
      const eF = formatShiftExp(lin.shift, "f");
      const eW = formatShiftExp(lin.shift, "\\omega");
      const expF = alphaS.isUnity ? String.raw`\pi^2 f^2` : String.raw`\frac{\pi^2 f^2}{${alphaS.tex}}`;
      return {
        sigTex: String.raw`${ampPrefix}e^{-${alphaS.isUnity ? "" : alphaS.tex}${formatShiftedVar(lin.shift, 1)}^2}`,
        fTex: String.raw`${leadOut}\,e^{-${expF}}${eF ? `\\,${eF}` : ""}`,
        wTex: String.raw`${leadOut}\,e^{-\frac{\omega^2}{${formatExactScalar(4 * alpha).tex}}}${eW ? `\\,${eW}` : ""}`,
        ruleTitle: "Gaussian Integral via Completing the Square",
        ruleLatex: String.raw`\int_{-\infty}^{\infty} e^{-\alpha u^2 - j\omega u}\,du = \sqrt{\frac{\pi}{\alpha}}\,e^{-\omega^2/(4\alpha)} \quad (\alpha=${alphaS.tex},\; \omega=2\pi f)`,
      };
    }
  }

  // 9) Causal damped sine/cosine: A * exp(-a*t) * (cos|sin)(w0*t) * u(t)
  const expCausalTrig = clean.match(/^exp\(\s*-\s*(?:([0-9.]+)\s*\*?\s*)?t\s*\)\s*\*\s*(cos|sin)\(([^)]+)\)\s*\*\s*u\(\s*t\s*\)$/i);
  if (expCausalTrig) {
    const a = expCausalTrig[1] ? Number(expCausalTrig[1]) : 1;
    const fnName = expCausalTrig[2]!.toLowerCase();
    const om = parseOmegaCoeff(expCausalTrig[3]!);
    if (a > 0 && om) {
      const aS = formatExactScalar(a);
      const w0S = formatExactScalar(om.w0);
      const w02 = formatExactScalar(om.w0 * om.w0);
      const jwDen = (v: string) => (v === "1" ? "" : v);
      if (fnName === "cos") {
        return {
          sigTex: String.raw`${ampPrefix}e^{-${jwDen(aS.tex)}t}\cos(${mulVar(om.w0, "t")})u(t)`,
          fTex: String.raw`\frac{${ampPrefix}(${aS.tex} + j2\pi f)}{(${aS.tex} + j2\pi f)^2 + ${w02.tex}}`,
          wTex: String.raw`\frac{${ampPrefix}(${aS.tex} + j\omega)}{(${aS.tex} + j\omega)^2 + ${w02.tex}}`,
          ruleTitle: "One-Sided Causal Damped Cosine Integral",
          ruleLatex: String.raw`\int_0^{\infty} e^{-at}\cos(\omega_0 t)e^{-j\omega t}\,dt = \frac{1}{2}\!\left(\frac{1}{a+j(\omega-\omega_0)} + \frac{1}{a+j(\omega+\omega_0)}\right) = \frac{a+j\omega}{(a+j\omega)^2+\omega_0^2}`,
        };
      }
      return {
        sigTex: String.raw`${ampPrefix}e^{-${jwDen(aS.tex)}t}\sin(${mulVar(om.w0, "t")})u(t)`,
        fTex: String.raw`\frac{${formatExactScalar(leadAmp * om.w0).tex}}{(${aS.tex} + j2\pi f)^2 + ${w02.tex}}`,
        wTex: String.raw`\frac{${formatExactScalar(leadAmp * om.w0).tex}}{(${aS.tex} + j\omega)^2 + ${w02.tex}}`,
        ruleTitle: "One-Sided Causal Damped Sine Integral",
        ruleLatex: String.raw`\int_0^{\infty} e^{-at}\sin(${w0S.tex}t)e^{-j\omega t}\,dt = \frac{${w0S.tex}}{(${aS.tex}+j\omega)^2 + ${w02.tex}}`,
      };
    }
  }

  // 10) Causal polynomial exponential: A * t^n * exp(-a*(t-t0)) * u(t-t0) or A * exp(-a*(t-t0)) * u(t-t0)
  const expCausal = clean.match(/^exp\(\s*-\s*(?:([0-9.]+)\s*\*?\s*)?([^)]+)\)\s*\*?\s*u\(([^)]+)\)$/i);
  if (expCausal) {
    const a = expCausal[1] ? Number(expCausal[1]) : 1;
    const linE = parseLinearArgT(expCausal[2]!);
    const linU = parseLinearArgT(expCausal[3]!);
    if (a > 0 && linE && linU && Math.abs(linE.shift - linU.shift) < 1e-8 && Math.abs(linE.scale - 1) < 1e-8) {
      const aS = formatExactScalar(a);
      const t0 = linU.shift;
      const uArg = Math.abs(t0) < 1e-8 ? "t" : `t ${t0 > 0 ? "-" : "+"} ${formatExactScalar(Math.abs(t0)).absTex}`;
      const eF = formatShiftExp(t0, "f");
      const eW = formatShiftExp(t0, "\\omega");
      return {
        sigTex: String.raw`${ampPrefix}e^{-${aS.isUnity ? "" : aS.tex}${Math.abs(t0) < 1e-8 ? "t" : `(${uArg})`}}u(${uArg})`,
        fTex: String.raw`\frac{${ampScalar.tex}}{${aS.tex} + j2\pi f}${eF ? `\\,${eF}` : ""}`,
        wTex: String.raw`\frac{${ampScalar.tex}}{${aS.tex} + j\omega}${eW ? `\\,${eW}` : ""}`,
        ruleTitle: "Causal Exponential Integral (u(t−t₀) sets lower bound)",
        ruleLatex: String.raw`X(f) = ${eF ? `${eF}` : ""}\int_0^{\infty} ${ampScalar.tex}e^{-(${aS.tex}+j2\pi f)u}\,du = \frac{${ampScalar.tex}}{${aS.tex} + j2\pi f}${eF ? `\\,${eF}` : ""}`,
      };
    }
  }

  const tnExpCausal = clean.match(/^t(?:\s*\^\s*(\d+))?\s*\*?\s*exp\(\s*-\s*(?:([0-9.]+)\s*\*?\s*)?t\s*\)\s*\*?\s*u\(\s*t\s*\)$/i);
  if (tnExpCausal) {
    const nPow = tnExpCausal[1] ? Number(tnExpCausal[1]) : 1;
    const a = tnExpCausal[2] ? Number(tnExpCausal[2]) : 1;
    if (nPow >= 1 && nPow <= 8 && a > 0) {
      const aS = formatExactScalar(a);
      const nFact = factorial(nPow);
      const numTex = formatExactScalar(leadAmp * nFact).tex;
      const tPow = nPow === 1 ? "t" : `t^{${nPow}}`;
      return {
        sigTex: String.raw`${ampPrefix}${tPow}\,e^{-${aS.isUnity ? "" : aS.tex}t}u(t)`,
        fTex: String.raw`\frac{${numTex}}{(${aS.tex} + j2\pi f)^{${nPow + 1}}}`,
        wTex: String.raw`\frac{${numTex}}{(${aS.tex} + j\omega)^{${nPow + 1}}}`,
        ruleTitle: "Frequency-Differentiation Property",
        ruleLatex: String.raw`t^{n} x(t) \leftrightarrow \left(\frac{j}{2\pi}\frac{d}{df}\right)^n X(f) \implies \frac{${nPow}!}{(${aS.tex}+j2\pi f)^{${nPow + 1}}}`,
      };
    }
  }

  return undefined;
}

type PolyPieceFull = {
  u: number;
  v: number;
  c0: number;
  c1: number;
  c2: number;
  c3: number;
};

type KnotJump = { tau: number; d0: number; d1: number; d2: number; d3: number };

function formatSingleKnotTerms(
  k: KnotJump,
  varSym: "f" | "\\omega",
  signFlip = 1,
): string {
  const jw = varSym === "f" ? "j2\\pi f" : "j\\omega";
  const wSq = varSym === "f" ? "(2\\pi f)^2" : "\\omega^2";
  const jw3 = varSym === "f" ? "j(2\\pi f)^3" : "j\\omega^3";
  const w4 = varSym === "f" ? "(2\\pi f)^4" : "\\omega^4";
  const inner: string[] = [];
  const pushTerm = (val: number, denom: string) => {
    if (Math.abs(val) < 1e-8) return;
    const s = formatExactScalar(val * signFlip);
    inner.push(String.raw`${s.sign < 0 ? "-" : inner.length ? "+ " : ""}\frac{${s.absTex}}{${denom}}`);
  };
  pushTerm(k.d0, jw);
  pushTerm(-k.d1, wSq);
  pushTerm(-k.d2, jw3);
  pushTerm(k.d3, w4);
  if (inner.length === 0) return "";
  return inner.length > 1 ? String.raw`\left(${inner.join(" ")}\right)` : inner[0]!;
}

function solveSymmetricEulerKnotSum(
  jumps: readonly KnotJump[],
  tc: number,
  varSym: "f" | "\\omega",
): string | undefined {
  // Re-index knots by offset delta = tau - tc
  const byDelta = jumps.map(j => ({ ...j, delta: j.tau - tc }));
  const matched = new Array<boolean>(byDelta.length).fill(false);
  const cos = varSym === "f" ? (d: number) => `\\cos(${mulVar(TAU * d, "f")})` : (d: number) => `\\cos(${mulVar(d, "\\omega")})`;
  const sin = varSym === "f" ? (d: number) => `\\sin(${mulVar(TAU * d, "f")})` : (d: number) => `\\sin(${mulVar(d, "\\omega")})`;
  const w = varSym === "f" ? "2\\pi f" : "\\omega";
  const wSq = varSym === "f" ? "(2\\pi f)^2" : "\\omega^2";
  const w3 = varSym === "f" ? "(2\\pi f)^3" : "\\omega^3";
  const w4 = varSym === "f" ? "(2\\pi f)^4" : "\\omega^4";

  const outTerms: string[] = [];
  let pureD0Center = 0;
  let pairedCosD0: { delta: number; c: number } | undefined;

  for (let i = 0; i < byDelta.length; i++) {
    if (matched[i]) continue;
    const a = byDelta[i]!;
    if (Math.abs(a.delta) < 1e-7) {
      matched[i] = true;
      const s0 = formatSingleKnotTerms(a, varSym);
      if (s0) outTerms.push(s0);
      if (a.d0 !== 0 && a.d1 === 0 && a.d2 === 0 && a.d3 === 0) pureD0Center = a.d0;
      continue;
    }
    const partnerIdx = byDelta.findIndex((b, idx) => !matched[idx] && idx !== i && Math.abs(b.delta + a.delta) < 1e-7);
    if (partnerIdx < 0) return undefined; // Asymmetric knot layout -> use general builder
    matched[i] = true;
    matched[partnerIdx] = true;

    const negK = a.delta < 0 ? a : byDelta[partnerIdx]!;
    const posK = a.delta < 0 ? byDelta[partnerIdx]! : a;
    const d = Math.abs(posK.delta);
    const cTrig = cos(d);
    const sTrig = sin(d);

    // Combine each derivative order m via Euler e^{±j w d}
    const combineOrder = (
      valNeg: number,
      valPos: number,
      evenDenom: string,
      oddEvenRealDenom: string,
      oddSign: 1 | -1,
    ) => {
      if (Math.abs(valNeg) < 1e-8 && Math.abs(valPos) < 1e-8) return true;
      if (Math.abs(valNeg - valPos) < 1e-8) {
        const s = formatExactScalar(2 * valNeg);
        outTerms.push(String.raw`\frac{${s.tex}${cTrig}}{${evenDenom}}`);
        return true;
      }
      if (Math.abs(valNeg + valPos) < 1e-8) {
        const coeff = 2 * valNeg * oddSign;
        const isPureImag = oddEvenRealDenom.startsWith("j");
        const cleanDen = isPureImag ? oddEvenRealDenom.slice(1) : oddEvenRealDenom;
        const jPfx = isPureImag ? "j" : "";
        const s = formatExactScalar(coeff);
        outTerms.push(String.raw`${s.sign < 0 ? "-" : ""}${jPfx}\frac{${s.isUnity ? "" : s.absTex}${sTrig}}{${cleanDen}}`);
        return true;
      }
      return false;
    };

    if (!combineOrder(negK.d0, posK.d0, `j${w}`, w, 1)) return undefined;
    if (Math.abs(negK.d0 - posK.d0) < 1e-8 && negK.d0 !== 0 && byDelta.length === 3 && d > 0) {
      pairedCosD0 = { delta: d, c: negK.d0 };
    }
    if (!combineOrder(-negK.d1, -posK.d1, wSq, `j${wSq}`, 1)) return undefined;
    if (!combineOrder(-negK.d2, -posK.d2, `j${w3}`, w3, -1)) return undefined;
    if (!combineOrder(negK.d3, posK.d3, w4, `j${w4}`, 1)) return undefined;
  }

  // Collapse bipolar step pattern: d0(+/-d) = c, d0(0) = -2c => -j*2c * pi*f * d^2 * sinc^2(...)
  if (
    pairedCosD0 &&
    Math.abs(pureD0Center + 2 * pairedCosD0.c) < 1e-7 &&
    jumps.every(j => j.d1 === 0 && j.d2 === 0 && j.d3 === 0)
  ) {
    const d = pairedCosD0.delta;
    const amp = -pairedCosD0.c; // For {-1 on [-d,0), +1 on [0,d)}: c = -1 -> amp = +1
    const eShift = formatShiftExp(tc, varSym);
    if (varSym === "f") {
      const kF = formatExactScalar(2 * amp * d * d);
      const sincArg = mulVar(d, "f");
      return String.raw`${kF.sign < 0 ? "" : "-"}j${kF.isUnity ? "" : kF.absTex}\pi f\,\operatorname{sinc}^2(${sincArg})${eShift ? `\\,${eShift}` : ""}`;
    }
    const kW = formatExactScalar(amp * d * d);
    const sincArgW = String.raw`\frac{${mulVar(d, "\\omega")}}{2\pi}`;
    return String.raw`${kW.sign < 0 ? "" : "-"}j${kW.isUnity ? "" : kW.absTex}\omega\,\operatorname{sinc}^2\!\left(${sincArgW}\right)${eShift ? `\\,${eShift}` : ""}`;
  }

  const joined = outTerms
    .map((t, idx) => (idx === 0 ? t : t.startsWith("-") ? ` - ${t.slice(1)}` : ` + ${t}`))
    .join("");
  const eShift = formatShiftExp(tc, varSym);
  if (!eShift) return joined;
  return outTerms.length > 1 ? String.raw`\left(${joined}\right)${eShift}` : `${joined}\\,${eShift}`;
}

function solvePiecewiseTransformSymbolic(rawExpr: string): TransformSymbolicResult | undefined {
  const trimmed = rawExpr.trim();
  if (!trimmed.startsWith("{")) return undefined;

  let compiled: ReturnType<typeof compileExpression>;
  try {
    compiled = compileExpression(trimmed);
  } catch {
    return undefined;
  }

  const pts = new Set<number>();
  const numPattern = /-?\d+(?:\.\d+)?/g;
  const condMatches = trimmed.match(/[^?:,{]+(?=[?:])/g) ?? [];
  for (const chunk of condMatches) {
    if (chunk.includes("<") || chunk.includes(">") || chunk.includes("=")) {
      for (const ns of chunk.match(numPattern) ?? []) {
        const val = Number(ns);
        if (Number.isFinite(val)) pts.add(val);
      }
    }
  }
  const cuts = Array.from(pts).sort((a, b) => a - b);
  if (cuts.length < 2) return undefined;

  const minCut = cuts[0]!;
  const maxCut = cuts[cuts.length - 1]!;
  for (const outT of [minCut - 5, minCut - 1, minCut - 0.1, maxCut + 0.1, maxCut + 1, maxCut + 5]) {
    if (Math.abs(compiled.evaluate(outT)) > 1e-8) return undefined;
  }

  const pieces: PolyPieceFull[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const u = cuts[i]!;
    const v = cuts[i + 1]!;
    const len = v - u;
    if (len < 1e-8) continue;

    const fracs = [0.1, 0.35, 0.65, 0.9];
    const xs = fracs.map(f => f * len);
    const ys = xs.map(s => compiled.evaluate(u + s));

    const evalPoly = (s: number) => {
      let acc = 0;
      for (let j = 0; j < 4; j++) {
        let num = 1;
        let den = 1;
        for (let m = 0; m < 4; m++) {
          if (m !== j) {
            num *= s - xs[m]!;
            den *= xs[j]! - xs[m]!;
          }
        }
        acc += ys[j]! * (num / den);
      }
      return acc;
    };

    for (const chk of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const s = chk * len;
      if (Math.abs(compiled.evaluate(u + s) - evalPoly(s)) > 1e-6 * Math.max(1, Math.abs(ys[1]!))) {
        return undefined;
      }
    }

    const h = len * 0.25;
    const f0 = evalPoly(0);
    const f1 = evalPoly(h);
    const f2 = evalPoly(2 * h);
    const f3 = evalPoly(3 * h);
    const d1 = f1 - f0;
    const d2 = f2 - 2 * f1 + f0;
    const d3 = f3 - 3 * f2 + 3 * f1 - f0;
    const c0 = Math.abs(f0) < 1e-9 ? 0 : f0;
    const c3 = Math.abs(d3 / (6 * h * h * h)) < 1e-9 ? 0 : d3 / (6 * h * h * h);
    const c2 = Math.abs(d2 / (2 * h * h) - 3 * c3 * h) < 1e-9 ? 0 : d2 / (2 * h * h) - 3 * c3 * h;
    const c1 = Math.abs(d1 / h - c2 * h - c3 * h * h) < 1e-9 ? 0 : d1 / h - c2 * h - c3 * h * h;
    pieces.push({ u, v, c0, c1, c2, c3 });
  }
  if (pieces.length === 0) return undefined;

  const sigTex = expressionToLatex(trimmed);

  // Special case 1: Single rectangular pulse on [u, v]
  if (pieces.length === 1 && pieces[0]!.c1 === 0 && pieces[0]!.c2 === 0 && pieces[0]!.c3 === 0) {
    const p = pieces[0]!;
    const w = p.v - p.u;
    const mid = 0.5 * (p.u + p.v);
    const areaPfx = unityPrefix(p.c0 * w);
    const wArg = mulVar(w, "f");
    const eF = formatShiftExp(mid, "f");
    const eW = formatShiftExp(mid, "\\omega");
    return {
      signalFormula: `x(t) = ${sigTex}`,
      transformFormula: String.raw`X(f) = ${areaPfx}\operatorname{sinc}(${wArg})${eF ? `\\,${eF}` : ""}`,
      transformOmegaFormula: String.raw`X(\omega) = ${areaPfx}\operatorname{sinc}\!\left(\frac{${mulVar(w, "\\omega")}}{2\pi}\right)${eW ? `\\,${eW}` : ""}`,
      steps: [
        { title: "Continuous Transform Definition", latex: String.raw`X(f) = \int_{${formatExactScalar(p.u).tex}}^{${formatExactScalar(p.v).tex}} ${formatExactScalar(p.c0).tex}\,e^{-j2\pi f t}\,dt` },
        { title: "Evaluate Complex Exponential Antiderivative", latex: String.raw`X(f) = ${formatExactScalar(p.c0).tex}\left[\frac{e^{-j2\pi f t}}{-j2\pi f}\right]_{${formatExactScalar(p.u).tex}}^{${formatExactScalar(p.v).tex}} = ${eF ? `${eF}` : ""}\frac{e^{j\pi ${wArg}} - e^{-j\pi ${wArg}}}{j2\pi f}` },
        { title: "Factor Midpoint & Apply Euler's Sine Identity", latex: String.raw`X(f) = ${areaPfx}\operatorname{sinc}(${wArg})${eF ? `\\,${eF}` : ""}` },
      ],
    };
  }

  // Special case 2: Continuous symmetric triangle
  if (
    pieces.length === 2 &&
    pieces[0]!.c2 === 0 && pieces[0]!.c3 === 0 &&
    pieces[1]!.c2 === 0 && pieces[1]!.c3 === 0 &&
    Math.abs(pieces[0]!.c0) < 1e-8 &&
    Math.abs((pieces[0]!.v - pieces[0]!.u) - (pieces[1]!.v - pieces[1]!.u)) < 1e-8 &&
    Math.abs(pieces[0]!.c1 + pieces[1]!.c1) < 1e-8 &&
    Math.abs((pieces[0]!.c1 * (pieces[0]!.v - pieces[0]!.u)) - pieces[1]!.c0) < 1e-8
  ) {
    const tau = pieces[0]!.v - pieces[0]!.u;
    const peak = pieces[1]!.c0;
    const t0 = pieces[0]!.v;
    const tauS = formatExactScalar(tau);
    const areaPfx = unityPrefix(peak * tau);
    const wArg = mulVar(tau, "f");
    const eF = formatShiftExp(t0, "f");
    const eW = formatShiftExp(t0, "\\omega");
    return {
      signalFormula: `x(t) = ${sigTex}`,
      transformFormula: String.raw`X(f) = ${areaPfx}\operatorname{sinc}^2(${wArg})${eF ? `\\,${eF}` : ""}`,
      transformOmegaFormula: String.raw`X(\omega) = ${areaPfx}\operatorname{sinc}^2\!\left(\frac{${mulVar(tau, "\\omega")}}{2\pi}\right)${eW ? `\\,${eW}` : ""}`,
      steps: [
        { title: "Recognize Triangular Window", latex: String.raw`x(t) = ${unityPrefix(peak)}\operatorname{tri}\!\left(${formatShiftedVar(t0, tau)}\right) \quad (\tau = ${tauS.tex})` },
        { title: "Integration by Parts (Slope Jumps)", latex: String.raw`\Delta x'(${formatExactScalar(t0 - tau).tex}) = ${formatExactScalar(pieces[0]!.c1).tex},\quad \Delta x'(${formatExactScalar(t0).tex}) = ${formatExactScalar(pieces[1]!.c1 - pieces[0]!.c1).tex},\quad \Delta x'(${formatExactScalar(t0 + tau).tex}) = ${formatExactScalar(-pieces[1]!.c1).tex}` },
        { title: "Euler Cosine Identity → Concise sinc² Form", latex: String.raw`X(f) = ${areaPfx}\frac{1 - \cos(2\pi ${wArg})}{2(\pi ${wArg})^2}${eF ? `\\,${eF}` : ""} = ${areaPfx}\operatorname{sinc}^2(${wArg})${eF ? `\\,${eF}` : ""}` },
      ],
    };
  }

  // Special case 3: Single linear ramp starting at 0 on [u, v]
  if (pieces.length === 1 && pieces[0]!.c2 === 0 && pieces[0]!.c3 === 0) {
    const p = pieces[0]!;
    const tau = p.v - p.u;
    const vVal = p.c0 + p.c1 * tau;
    if (Math.abs(p.c0) < 1e-8) {
      // Rising ramp from 0 at u to vVal at v
      const kTex = unityPrefix(vVal / tau);
      const eU_F = formatShiftExp(p.u, "f");
      const eV_F = formatShiftExp(p.v, "f");
      const eU_W = formatShiftExp(p.u, "\\omega");
      const eV_W = formatShiftExp(p.v, "\\omega");
      const termU_F = eU_F || "1";
      const termU_W = eU_W || "1";
      const fClosed = String.raw`${kTex}\frac{(1 + j${mulVar(TAU * tau, "f")})${eV_F} - ${termU_F}}{(2\pi f)^2}`;
      const wClosed = String.raw`${kTex}\frac{(1 + j${mulVar(tau, "\\omega")})${eV_W} - ${termU_W}}{\omega^2}`;
      return {
        signalFormula: `x(t) = ${sigTex}`,
        transformFormula: `X(f) = ${fClosed}`,
        transformOmegaFormula: `X(\\omega) = ${wClosed}`,
        steps: [
          { title: "Continuous Transform Integral", latex: String.raw`X(f) = \int_{${formatExactScalar(p.u).tex}}^{${formatExactScalar(p.v).tex}} ${kTex}(t${p.u === 0 ? "" : `-${formatExactScalar(p.u).tex}`})\,e^{-j2\pi ft}\,dt` },
          { title: "Integration by Parts (u = x(t), dv = e^{-j2πft}dt)", latex: String.raw`X(f) = \left[\frac{x(t)e^{-j2\pi ft}}{-j2\pi f} + \frac{x'(t)e^{-j2\pi ft}}{(2\pi f)^2}\right]_{${formatExactScalar(p.u).tex}}^{${formatExactScalar(p.v).tex}}` },
          { title: "Combine Terms Over Common Denominator", latex: `X(f) = ${fClosed}` },
        ],
      };
    }
  }

  // General Piecewise Cubic: boundary derivative-jump formula with Euler pairing when symmetric
  const allKnots = cuts;
  const evalDerivAt = (p: PolyPieceFull | undefined, t: number, m: 0 | 1 | 2 | 3): number => {
    if (!p) return 0;
    const s = t - p.u;
    if (m === 0) return p.c0 + p.c1 * s + p.c2 * s * s + p.c3 * s * s * s;
    if (m === 1) return p.c1 + 2 * p.c2 * s + 3 * p.c3 * s * s;
    if (m === 2) return 2 * p.c2 + 6 * p.c3 * s;
    return 6 * p.c3;
  };
  const jumps: KnotJump[] = [];
  for (let i = 0; i < allKnots.length; i++) {
    const tau = allKnots[i]!;
    const leftP = i > 0 ? pieces[i - 1] : undefined;
    const rightP = i < pieces.length ? pieces[i] : undefined;
    const d0 = evalDerivAt(rightP, tau, 0) - evalDerivAt(leftP, tau, 0);
    const d1 = evalDerivAt(rightP, tau, 1) - evalDerivAt(leftP, tau, 1);
    const d2 = evalDerivAt(rightP, tau, 2) - evalDerivAt(leftP, tau, 2);
    const d3 = evalDerivAt(rightP, tau, 3) - evalDerivAt(leftP, tau, 3);
    const z = (v: number) => (Math.abs(v) < 1e-8 ? 0 : v);
    if (z(d0) || z(d1) || z(d2) || z(d3)) {
      jumps.push({ tau, d0: z(d0), d1: z(d1), d2: z(d2), d3: z(d3) });
    }
  }
  if (jumps.length === 0) return undefined;

  const tc = 0.5 * (minCut + maxCut);
  const symF = solveSymmetricEulerKnotSum(jumps, Math.abs(tc) < 1e-8 ? 0 : tc, "f");
  const symW = solveSymmetricEulerKnotSum(jumps, Math.abs(tc) < 1e-8 ? 0 : tc, "\\omega");

  const formatRawKnotSum = (varSym: "f" | "\\omega"): string => {
    const parts: string[] = [];
    for (const k of jumps) {
      const bracket = formatSingleKnotTerms(k, varSym);
      if (!bracket) continue;
      const expTerm = formatShiftExp(k.tau, varSym);
      parts.push(`${bracket}${expTerm}`);
    }
    return parts.join(" + ").replace(/\+ -/g, "- ");
  };

  const fFormula = symF ?? formatRawKnotSum("f");
  const wFormula = symW ?? formatRawKnotSum("\\omega");
  const jumpSummary = jumps
    .map(j => {
      const items: string[] = [];
      if (j.d0) items.push(`\\Delta x=${formatExactScalar(j.d0).tex}`);
      if (j.d1) items.push(`\\Delta x'=${formatExactScalar(j.d1).tex}`);
      if (j.d2) items.push(`\\Delta x''=${formatExactScalar(j.d2).tex}`);
      if (j.d3) items.push(`\\Delta x'''=${formatExactScalar(j.d3).tex}`);
      return `t=${formatExactScalar(j.tau).tex}:\\;${items.join(",\\;")}`;
    })
    .join(String.raw` \;\cdot\; `);

  return {
    signalFormula: `x(t) = ${sigTex}`,
    transformFormula: `X(f) = ${fFormula}`,
    transformOmegaFormula: `X(\\omega) = ${wFormula}`,
    steps: [
      {
        title: "Split Continuous Integral Across Active Subintervals",
        latex: String.raw`X(f) = \sum_{k} \int_{a_k}^{b_k} P_k(t)\,e^{-j2\pi f t}\,dt`,
      },
      {
        title: "Integration-by-Parts Antiderivative Formula",
        latex: String.raw`\int P(t)e^{-j\omega t}\,dt = -e^{-j\omega t}\left(\frac{P(t)}{j\omega} + \frac{P'(t)}{(j\omega)^2} + \frac{P''(t)}{(j\omega)^3} + \frac{P'''(t)}{(j\omega)^4}\right)`,
      },
      {
        title: "Evaluate Knot Derivative Jumps",
        latex: jumpSummary,
      },
      {
        title: symF ? "Pair Symmetric Knots via Euler Identities" : "Closed-Form Transform Result",
        latex: `X(f) = ${fFormula}`,
      },
    ],
  };
}

export function synthesizeTransformSymbolic(config: FourierTransformConfig): TransformSymbolicResult {
  const A = formatExactScalar(config.amplitude).tex;
  const aPfx = unityPrefix(config.amplitude);
  const tau = formatExactScalar(config.width).tex;
  const tauIsOne = Math.abs(config.width - 1) < 1e-8;
  const t0 = config.shift;
  const shiftFactorF = formatShiftExp(t0, "f");
  const shiftFactorW = formatShiftExp(t0, "\\omega");
  const shiftedVar = formatShiftedVar(t0, config.width);
  const shiftedU = formatShiftedVar(t0, 1);

  switch (config.signalId) {
    case "rect": {
      const areaPfx = unityPrefix(config.amplitude * config.width);
      const areaTex = formatExactScalar(config.amplitude * config.width).tex;
      const fArg = mulVar(config.width, "f");
      const wArg = String.raw`\frac{${mulVar(config.width, "\\omega")}}{2\pi}`;
      const halfTau = formatExactScalar(config.width / 2).tex;
      const sig = String.raw`x(t) = ${aPfx}\operatorname{rect}\!\left(${shiftedVar}\right)`;
      const fTex = String.raw`X(f) = ${areaPfx}\operatorname{sinc}(${fArg})${shiftFactorF ? `\\,${shiftFactorF}` : ""}`;
      const wTex = String.raw`X(\omega) = ${areaPfx}\operatorname{sinc}\!\left(${wArg}\right)${shiftFactorW ? `\\,${shiftFactorW}` : ""}`;
      return {
        signalFormula: sig,
        transformFormula: fTex,
        transformOmegaFormula: wTex,
        steps: [
          { title: "Continuous Transform Integral", latex: String.raw`X(f) = ${shiftFactorF ? `${shiftFactorF}` : ""}\int_{-${halfTau}}^{${halfTau}} ${A}e^{-j2\pi f u}\,du` },
          { title: "Integrate Complex Exponential & Apply Euler's Sine Identity", latex: String.raw`X(f) = ${shiftFactorF ? `${shiftFactorF}` : ""}${aPfx}\frac{e^{j\pi ${fArg}} - e^{-j\pi ${fArg}}}{j2\pi f} = ${areaTex}\,\frac{\sin(\pi ${fArg})}{\pi ${fArg}}${shiftFactorF ? `\\,${shiftFactorF}` : ""}` },
          { title: "Concise Closed Form", latex: fTex },
        ],
      };
    }
    case "tri": {
      const areaPfx = unityPrefix(config.amplitude * config.width);
      const fArg = mulVar(config.width, "f");
      const wArg = String.raw`\frac{${mulVar(config.width, "\\omega")}}{2\pi}`;
      const sig = String.raw`x(t) = ${aPfx}\operatorname{tri}\!\left(${shiftedVar}\right)`;
      const fTex = String.raw`X(f) = ${areaPfx}\operatorname{sinc}^2(${fArg})${shiftFactorF ? `\\,${shiftFactorF}` : ""}`;
      const wTex = String.raw`X(\omega) = ${areaPfx}\operatorname{sinc}^2\!\left(${wArg}\right)${shiftFactorW ? `\\,${shiftFactorW}` : ""}`;
      return {
        signalFormula: sig,
        transformFormula: fTex,
        transformOmegaFormula: wTex,
        steps: [
          { title: "Convolution Representation", latex: String.raw`\operatorname{tri}\!\left(${tauIsOne ? "t" : `t/${tau}`}\right) = ${tauIsOne ? "" : `\\frac{1}{${tau}}`}\operatorname{rect}\!\left(${tauIsOne ? "t" : `t/${tau}`}\right)*\operatorname{rect}\!\left(${tauIsOne ? "t" : `t/${tau}`}\right)` },
          { title: "Convolution → Multiplication Theorem", latex: String.raw`\mathcal{F}\{g * h\} = G(f)\,H(f) = ${tauIsOne ? "" : `\\frac{1}{${tau}}`}\big(${tauIsOne ? "" : tau}\operatorname{sinc}(${fArg})\big)^2` },
          { title: "Apply Amplitude A & Time Shift t₀", latex: fTex },
        ],
      };
    }
    case "gaussian": {
      const areaPfx = unityPrefix(config.amplitude * config.width);
      const sig = String.raw`x(t) = ${aPfx}e^{-\pi ${tauIsOne && Math.abs(t0) < 1e-8 ? "t^2" : `(${shiftedVar})^2`}}`;
      const fTex = String.raw`X(f) = ${areaPfx}e^{-\pi ${tauIsOne ? "f^2" : `(${tau} f)^2`}}${shiftFactorF ? `\\,${shiftFactorF}` : ""}`;
      const wTex = String.raw`X(\omega) = ${areaPfx}e^{-\frac{${tauIsOne ? "\\omega^2" : `(${tau}\\omega)^2`}}{4\pi}}${shiftFactorW ? `\\,${shiftFactorW}` : ""}`;
      return {
        signalFormula: sig,
        transformFormula: fTex,
        transformOmegaFormula: wTex,
        steps: [
          { title: "Gaussian Integral Setup", latex: String.raw`X(f) = ${shiftFactorF ? `${shiftFactorF}` : ""}\int_{-\infty}^{\infty} ${aPfx}e^{-\pi(u/${tau})^2 - j2\pi fu}\,du` },
          { title: "Complete the Square in the Exponent", latex: String.raw`-\pi\left(\frac{u}{${tau}}\right)^2 - j2\pi fu = -\pi\left(\frac{u}{${tau}} + j${tau}f\right)^2 - \pi(${tau}f)^2` },
          { title: "Normalized Gaussian Area ∫e^{-πv²}dv = 1", latex: fTex },
        ],
      };
    }
    case "exponential": {
      const a = formatExactScalar(config.decayRate);
      const sig = String.raw`x(t) = ${aPfx}e^{-${a.isUnity ? "" : a.tex}${shiftedU}} u(${shiftedU.replace(/^\(|\)$/g, "")})`;
      const fTex = String.raw`X(f) = \frac{${A}}{${a.tex} + j 2\pi f}${shiftFactorF ? `\\,${shiftFactorF}` : ""}`;
      const wTex = String.raw`X(\omega) = \frac{${A}}{${a.tex} + j\omega}${shiftFactorW ? `\\,${shiftFactorW}` : ""}`;
      return {
        signalFormula: sig,
        transformFormula: fTex,
        transformOmegaFormula: wTex,
        steps: [
          { title: "Apply Causal Support (u(t) = 0 for t < 0)", latex: String.raw`X(f) = ${shiftFactorF ? `${shiftFactorF}` : ""}\int_0^{\infty} ${aPfx}e^{-(${a.tex} + j2\pi f)u}\,du` },
          { title: "Evaluate Convergent Exponential Integral", latex: String.raw`\left[\frac{-${A}e^{-(${a.tex}+j2\pi f)u}}{${a.tex}+j2\pi f}\right]_0^{\infty} = \frac{${A}}{${a.tex} + j2\pi f} \quad (${a.tex} > 0)` },
          { title: "Closed-Form Frequency Response", latex: fTex },
        ],
      };
    }
    case "modulated-rect": {
      const f0 = formatExactScalar(config.modFreqHz).tex;
      const halfArea = formatExactScalar(0.5 * config.amplitude * config.width);
      const halfPfx = halfArea.isUnity ? (halfArea.sign < 0 ? "-" : "") : `${halfArea.tex}\\,`;
      const tauPfx = tauIsOne ? "" : tau;
      const sig = String.raw`x(t) = ${aPfx}\operatorname{rect}\!\left(${shiftedVar}\right)\cos(${mulVar(TAU * config.modFreqHz, shiftedU)})`;
      const fTex = String.raw`X(f) = ${halfPfx}\Big[\operatorname{sinc}(${tauPfx}(f - ${f0})) + \operatorname{sinc}(${tauPfx}(f + ${f0}))\Big]${shiftFactorF ? `\\,${shiftFactorF}` : ""}`;
      const w0 = formatExactScalar(TAU * config.modFreqHz).tex;
      const wTex = String.raw`X(\omega) = ${halfPfx}\Big[\operatorname{sinc}\!\left(\frac{${tauPfx}(\omega - ${w0})}{2\pi}\right) + \operatorname{sinc}\!\left(\frac{${tauPfx}(\omega + ${w0})}{2\pi}\right)\Big]${shiftFactorW ? `\\,${shiftFactorW}` : ""}`;
      return {
        signalFormula: sig,
        transformFormula: fTex,
        transformOmegaFormula: wTex,
        steps: [
          { title: "Baseband Window Transform", latex: String.raw`x_0(t) = ${aPfx}\operatorname{rect}(${tauIsOne ? "t" : `t/${tau}`}) \;\longleftrightarrow\; X_0(f) = ${unityPrefix(config.amplitude * config.width)}\operatorname{sinc}(${mulVar(config.width, "f")})` },
          { title: "Euler Modulation Property", latex: String.raw`x_0(t)\cos(2\pi f_0 t) \;\longleftrightarrow\; \frac{1}{2}\big[X_0(f - f_0) + X_0(f + f_0)\big]` },
          { title: "Combine Shift t₀ & Carrier f₀", latex: fTex },
        ],
      };
    }
    case "custom": {
      const clean = config.customExpr.trim();
      const single = solveElementaryTransformTerm(clean);
      if (single) {
        return {
          signalFormula: `x(t) = ${single.sigTex}`,
          transformFormula: `X(f) = ${single.fTex}`,
          transformOmegaFormula: `X(\\omega) = ${single.wTex}`,
          steps: [
            { title: "Continuous Transform Definition", latex: String.raw`X(f) = \int_{-\infty}^{\infty} \left(${single.sigTex}\right)e^{-j2\pi f t}\,dt` },
            { title: single.ruleTitle, latex: single.ruleLatex },
            { title: "Concise Closed Form", latex: `X(f) = ${single.fTex}` },
          ],
        };
      }

      const piecewiseSolved = solvePiecewiseTransformSymbolic(clean);
      if (piecewiseSolved) return piecewiseSolved;

      const terms = splitTopLevelAddSub(clean);
      if (terms) {
        const solved = terms.map(t => ({ sign: t.sign, res: solveElementaryTransformTerm(t.term) }));
        if (solved.every(s => s.res !== undefined)) {
          const joinParts = (arr: Array<{ sign: 1 | -1; tex: string }>) =>
            arr
              .map((it, idx) => `${idx === 0 ? (it.sign < 0 ? "-" : "") : it.sign < 0 ? " - " : " + "}${it.tex}`)
              .join("");
          const sigJoin = joinParts(solved.map(s => ({ sign: s.sign, tex: s.res!.sigTex })));
          const fJoin = joinParts(solved.map(s => ({ sign: s.sign, tex: s.res!.fTex })));
          const wJoin = joinParts(solved.map(s => ({ sign: s.sign, tex: s.res!.wTex })));
          return {
            signalFormula: `x(t) = ${sigJoin}`,
            transformFormula: `X(f) = ${fJoin}`,
            transformOmegaFormula: `X(\\omega) = ${wJoin}`,
            steps: [
              { title: "Linearity of the Fourier Transform", latex: String.raw`\mathcal{F}\!\left\{\sum_k a_k x_k(t)\right\} = \sum_k a_k X_k(f)` },
              { title: "Transform Individual Components", latex: solved.map(s => String.raw`${s.res!.sigTex} \leftrightarrow ${s.res!.fTex}`).join(String.raw` \;\cdot\; `) },
              { title: "Simplified Linear Combination", latex: `X(f) = ${fJoin}` },
            ],
          };
        }
      }

      const exprTex = expressionToLatex(clean || "0");
      return {
        signalFormula: `x(t) = ${exprTex}`,
        transformFormula: String.raw`X(f) = \int_{-\infty}^{\infty} \left(${exprTex}\right) e^{-j 2\pi f t}\,dt`,
        transformOmegaFormula: String.raw`X(\omega) = \int_{-\infty}^{\infty} \left(${exprTex}\right) e^{-j \omega t}\,dt`,
        steps: [
          { title: "Continuous Fourier Integral", latex: String.raw`X(f) = \int_{-\infty}^{\infty} \left(${exprTex}\right) e^{-j2\pi f t}\,dt` },
          { title: "Real & Imaginary Quadrature Split", latex: String.raw`X(f) = \int x(t)\cos(2\pi f t)\,dt - j\int x(t)\sin(2\pi f t)\,dt` },
          { title: "Composite Gauss-Legendre Evaluation", latex: String.raw`|X(f)| = \sqrt{\operatorname{Re}^2 + \operatorname{Im}^2},\quad \angle X(f) = \operatorname{atan2}(\operatorname{Im}, \operatorname{Re})` },
        ],
      };
    }
  }
}
