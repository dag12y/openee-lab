import { GL_NODES, GL_WEIGHTS, integrateGaussLegendre16 } from "./calculus.js";
import { compileExpression } from "./expr.js";
import {
  maxSeriesEpicyclePhasors,
  type FourierSeriesConfig,
  type FourierTransformConfig,
  type EpicyclesConfig,
  type PresetWaveformId,
} from "./model.js";
import { getShapeContour, type Point2D } from "./shapes.js";
import { wasmKernel } from "./wasm-kernel.js";

const TAU = 2 * Math.PI;
const WILBRAHAM_GIBBS_PCT = 8.948987223608364; // (1/pi)*Si(pi) - 0.5

export { integrateGaussLegendre16 as integrateGL16 };

export function wrapPeriodic(t: number, start: number, period: number): number {
  const offset = t - start;
  const wrapped = ((offset % period) + period) % period;
  return start + wrapped;
}

function evaluateGraphical(
  points: readonly Point2D[],
  interp: FourierSeriesConfig["graphicalInterp"],
  u: number, // normalized in [0, 1)
): number {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!.y;

  const n = sorted.length;
  const ptAt = (idx: number): Point2D => {
    const wrapped = ((idx % n) + n) % n;
    const shift = Math.floor(idx / n);
    return { x: sorted[wrapped]!.x + shift, y: sorted[wrapped]!.y };
  };

  let seg = -1;
  for (let i = 0; i < n; i++) {
    if (u >= sorted[i]!.x) seg = i;
  }
  const p0 = ptAt(seg);
  const p1 = ptAt(seg + 1);
  const span = p1.x - p0.x;
  const alpha = span > 1e-12 ? (u - p0.x) / span : 0;

  if (interp === "step") return p0.y;
  if (interp === "linear") return p0.y + alpha * (p1.y - p0.y);

  const pm1 = ptAt(seg - 1);
  const p2 = ptAt(seg + 2);
  const a2 = alpha * alpha;
  const a3 = a2 * alpha;
  return 0.5 * (
    2 * p0.y +
    (-pm1.y + p1.y) * alpha +
    (2 * pm1.y - 5 * p0.y + 4 * p1.y - p2.y) * a2 +
    (-pm1.y + 3 * p0.y - 3 * p1.y + p2.y) * a3
  );
}

export function buildPeriodicEvaluator(config: FourierSeriesConfig): {
  evaluateBase: (tInRegion: number) => number;
  evaluate: (t: number) => number;
  regionStart: number;
  regionLength: number;
  periodStart: number;
  period: number;
  breakpoints: readonly number[];
} {
  const regionStart = config.periodStart ?? 0;
  const regionLength = config.period;
  const continuation = config.continuation ?? "periodic";

  let evaluateBase: (t: number) => number;
  let breakpoints: number[] = [];

  if (config.inputKind === "preset") {
    const { presetId, amplitude: A, dutyCycle: D, dcOffset: dc } = config;
    evaluateBase = (t: number): number => {
      const u = (((t - regionStart) / regionLength % 1) + 1) % 1;
      switch (presetId) {
        case "square":
          return dc + (u < 0.5 ? A : -A);
        case "sawtooth":
          return dc + A * (2 * u - 1);
        case "triangle":
          return dc + A * (1 - 4 * Math.abs(u - 0.5));
        case "half-rectified":
          return dc + A * Math.max(0, Math.sin(TAU * u));
        case "full-rectified":
          return dc + A * Math.abs(Math.sin(Math.PI * u));
        case "pulse":
          return dc + (u < D ? A : 0);
      }
    };
  } else if (config.inputKind === "expression") {
    const compiled = compileExpression(config.expression);
    evaluateBase = (t: number) => compiled.evaluate(t);
    const pts = new Set<number>();
    if (regionStart < 0 && regionStart + regionLength > 0) pts.add(0);
    // Extract condition thresholds like `t < 1`, `0 <= t < 1.5`, etc. inside [regionStart, regionStart + regionLength)
    const numPattern = /-?\d+(?:\.\d+)?/g;
    const condMatches = config.expression.match(/[^?:,{]+(?=[?:])/g) ?? [];
    for (const chunk of condMatches) {
      if (chunk.includes("<") || chunk.includes(">") || chunk.includes("=")) {
        const nums = chunk.match(numPattern) ?? [];
        for (const ns of nums) {
          const val = Number(ns);
          if (Number.isFinite(val) && val > regionStart + 1e-9 && val < regionStart + regionLength - 1e-9) {
            pts.add(val);
          }
        }
      }
    }
    breakpoints = Array.from(pts).sort((a, b) => a - b);
  } else if (config.inputKind === "piecewise") {
    const segs = config.piecewiseSegments.map(seg => ({
      start: seg.start,
      end: seg.end,
      fn: compileExpression(seg.expr).evaluate,
    }));
    const pts = new Set<number>();
    for (const seg of segs) {
      if (seg.start > regionStart && seg.start < regionStart + regionLength) pts.add(seg.start);
      if (seg.end > regionStart && seg.end < regionStart + regionLength) pts.add(seg.end);
    }
    breakpoints = Array.from(pts).sort((a, b) => a - b);
    evaluateBase = (t: number) => {
      for (const seg of segs) {
        if (t >= seg.start && t < seg.end) return seg.fn(t);
      }
      return 0;
    };
  } else {
    const pts = config.graphicalPoints;
    const interp = config.graphicalInterp;
    const amp = config.amplitude;
    const dc = config.dcOffset;
    evaluateBase = (t: number) => {
      const u = (((t - regionStart) / regionLength % 1) + 1) % 1;
      return dc + amp * evaluateGraphical(pts, interp, u);
    };
  }

  if (continuation === "periodic") {
    return {
      evaluateBase,
      evaluate: (t: number) => evaluateBase(wrapPeriodic(t, regionStart, regionLength)),
      regionStart,
      regionLength,
      periodStart: regionStart,
      period: regionLength,
      breakpoints,
    };
  }

  // Even or Odd continuation across [regionStart - regionLength, regionStart + regionLength)
  const fullPeriod = 2 * regionLength;
  const fullStart = regionStart - regionLength;
  const fullBreaks = [
    ...breakpoints.map(b => 2 * regionStart - b),
    regionStart,
    ...breakpoints,
  ].sort((a, b) => a - b);

  return {
    evaluateBase,
    evaluate: (t: number) => {
      const tw = wrapPeriodic(t, fullStart, fullPeriod);
      if (tw >= regionStart) {
        return evaluateBase(tw);
      }
      const reflected = 2 * regionStart - tw;
      const val = evaluateBase(reflected);
      return continuation === "even" ? val : -val;
    },
    regionStart,
    regionLength,
    periodStart: fullStart,
    period: fullPeriod,
    breakpoints: fullBreaks,
  };
}

type QuadratureGrid = Readonly<{
  tNodes: Float64Array;
  fVals: Float64Array;
  wf: Float64Array;
  count: number;
}>;

function buildQuadratureGrid(
  fn: (t: number) => number,
  a: number,
  b: number,
  breakpoints: readonly number[],
  panelsTotal: number,
): QuadratureGrid {
  const cuts = [a, ...breakpoints.filter(x => x > a + 1e-12 && x < b - 1e-12), b];
  const span = Math.max(1e-12, b - a);
  const segPanels: number[] = [];
  let totalPanels = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const p = Math.max(8, Math.round((panelsTotal * (cuts[i + 1]! - cuts[i]!)) / span));
    segPanels.push(p);
    totalPanels += p;
  }
  const count = totalPanels * 16;
  const tNodes = new Float64Array(count);
  const fVals = new Float64Array(count);
  const wf = new Float64Array(count);

  let idx = 0;
  for (let s = 0; s < segPanels.length; s++) {
    const lo = cuts[s]!;
    const hi = cuts[s + 1]!;
    const pCount = segPanels[s]!;
    const h = (hi - lo) / pCount;
    const half = 0.5 * h;
    for (let p = 0; p < pCount; p++) {
      const mid = lo + (p + 0.5) * h;
      for (let i = 0; i < 8; i++) {
        const dx = half * GL_NODES[i]!;
        const w = half * GL_WEIGHTS[i]!;
        const tMinus = mid - dx;
        const fMinus = fn(tMinus);
        tNodes[idx] = tMinus;
        fVals[idx] = fMinus;
        wf[idx] = w * fMinus;
        idx++;

        const tPlus = mid + dx;
        const fPlus = fn(tPlus);
        tNodes[idx] = tPlus;
        fVals[idx] = fPlus;
        wf[idx] = w * fPlus;
        idx++;
      }
    }
  }
  return { tNodes, fVals, wf, count };
}

function integratePiecewiseSafe(
  fn: (t: number) => number,
  a: number,
  b: number,
  breakpoints: readonly number[],
  panelsTotal: number,
): number {
  const cuts = [a, ...breakpoints.filter(x => x > a + 1e-12 && x < b - 1e-12), b];
  let sum = 0;
  const span = b - a;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const lo = cuts[i]!;
    const hi = cuts[i + 1]!;
    const p = Math.max(8, Math.round((panelsTotal * (hi - lo)) / span));
    sum += integrateGaussLegendre16(fn, lo, hi, p);
  }
  return sum;
}

export type HarmonicCoefficient = Readonly<{
  n: number;
  an: number;
  bn: number;
  cnMag: number;
  thetaN: number;
  cPosRe: number;
  cPosIm: number;
}>;

export function analyticalPresetCoefficient(
  presetId: PresetWaveformId,
  A: number,
  D: number,
  dc: number,
  n: number,
): HarmonicCoefficient {
  if (n === 0) {
    let a0 = dc;
    if (presetId === "half-rectified") a0 = dc + A / Math.PI;
    else if (presetId === "full-rectified") a0 = dc + (2 * A) / Math.PI;
    else if (presetId === "pulse") a0 = dc + A * D;
    return {
      n: 0, an: a0, bn: 0, cnMag: Math.abs(a0),
      thetaN: a0 >= 0 ? 0 : Math.PI, cPosRe: a0, cPosIm: 0,
    };
  }

  let an = 0;
  let bn = 0;
  switch (presetId) {
    case "square":
      bn = n % 2 === 1 ? (4 * A) / (n * Math.PI) : 0;
      break;
    case "sawtooth":
      bn = (-2 * A) / (n * Math.PI);
      break;
    case "triangle":
      an = n % 2 === 1 ? (8 * A) / (n * n * Math.PI * Math.PI) : 0;
      break;
    case "half-rectified":
      if (n === 1) bn = A / 2;
      else if (n % 2 === 0) an = (-2 * A) / (Math.PI * (n * n - 1));
      break;
    case "full-rectified":
      an = (-4 * A) / (Math.PI * (4 * n * n - 1));
      break;
    case "pulse": {
      const ang = TAU * n * D;
      an = (A / (n * Math.PI)) * Math.sin(ang);
      bn = (A / (n * Math.PI)) * (1 - Math.cos(ang));
      break;
    }
  }

  const cnMag = Math.hypot(an, bn);
  const thetaN = cnMag < 1e-13 ? 0 : Math.atan2(-bn, an);
  return {
    n,
    an,
    bn,
    cnMag,
    thetaN,
    cPosRe: 0.5 * an,
    cPosIm: -0.5 * bn,
  };
}

export type SeriesAnalysis = Readonly<{
  period: number;
  omega0: number;
  fundamentalHz: number;
  a0: number;
  harmonics: readonly HarmonicCoefficient[];
  symbolicProbeHarmonics: readonly HarmonicCoefficient[];
  epicycleHarmonics: readonly HarmonicCoefficient[];
  totalPower: number;
  capturedPower: number;
  capturedPowerPct: number;
  rmsError: number;
  gibbsOvershootPct: number;
  theoreticalGibbsPct: number;
  hasJumpDiscontinuity: boolean;
}>;

export function analyzeFourierSeries(config: FourierSeriesConfig): SeriesAnalysis {
  const { evaluate, periodStart, period, breakpoints } = buildPeriodicEvaluator(config);
  const omega0 = TAU / period;
  const N = config.harmonics;
  const probeN = Math.max(N, maxSeriesEpicyclePhasors);
  const usePresetShortcut =
    config.inputKind === "preset" &&
    (config.periodStart ?? 0) === 0 &&
    (config.continuation ?? "periodic") === "periodic";

  let a0 = 0;
  const anArr = new Float64Array(N);
  const bnArr = new Float64Array(N);
  const allHarmonics: HarmonicCoefficient[] = [];
  let totalPower = 0;
  let capturedPower = 0;

  if (usePresetShortcut) {
    const dcCoeff = analyticalPresetCoefficient(config.presetId, config.amplitude, config.dutyCycle, config.dcOffset, 0);
    a0 = dcCoeff.an;
    capturedPower = a0 * a0;
    for (let n = 1; n <= probeN; n++) {
      const c = analyticalPresetCoefficient(config.presetId, config.amplitude, config.dutyCycle, config.dcOffset, n);
      allHarmonics.push(c);
      if (n <= N) {
        anArr[n - 1] = c.an;
        bnArr[n - 1] = c.bn;
        capturedPower += 0.5 * (c.an * c.an + c.bn * c.bn);
      }
    }
    totalPower = (1 / period) * integratePiecewiseSafe(t => {
      const v = evaluate(t);
      return v * v;
    }, periodStart, periodStart + period, breakpoints, 64);
  } else {
    // Evaluate f(t) ONCE across the Gauss-Legendre grid and reuse for a0, totalPower, and all N harmonics
    const grid = buildQuadratureGrid(evaluate, periodStart, periodStart + period, breakpoints, 96);
    const invP = 1 / period;
    const twoOverP = 2 * invP;
    let sumF = 0;
    let sumF2 = 0;
    for (let k = 0; k < grid.count; k++) {
      const wfk = grid.wf[k]!;
      sumF += wfk;
      sumF2 += wfk * grid.fVals[k]!;
    }
    a0 = invP * sumF;
    totalPower = invP * sumF2;
    capturedPower = a0 * a0;

    for (let n = 1; n <= probeN; n++) {
      const nw = n * omega0;
      let sumCos = 0;
      let sumSin = 0;
      for (let k = 0; k < grid.count; k++) {
        const ang = nw * grid.tNodes[k]!;
        const wfk = grid.wf[k]!;
        sumCos += wfk * Math.cos(ang);
        sumSin += wfk * Math.sin(ang);
      }
      const an = twoOverP * sumCos;
      const bn = twoOverP * sumSin;
      const cnMag = Math.hypot(an, bn);
      const thetaN = cnMag < 1e-13 ? 0 : Math.abs(bn) < 1e-11 ? (an < 0 ? -Math.PI : 0) : Math.atan2(-bn, an);
      const coeff: HarmonicCoefficient = {
        n, an, bn, cnMag, thetaN, cPosRe: 0.5 * an, cPosIm: -0.5 * bn,
      };
      allHarmonics.push(coeff);
      if (n <= N) {
        anArr[n - 1] = an;
        bnArr[n - 1] = bn;
        capturedPower += 0.5 * (an * an + bn * bn);
      }
    }
  }

  const harmonics = allHarmonics.slice(0, N);
  const symbolicProbeHarmonics = allHarmonics.slice(0, 24);
  const epicycleHarmonics = allHarmonics;

  // Evaluate over one full period with WASM kernel to compute RMS error & Gibbs overshoot
  const probeCount = 1024;
  const step = period / probeCount;
  const approx = wasmKernel.evalTrigSeries(periodStart, step, probeCount, omega0, a0, anArr, bnArr, N);
  const exact = new Float64Array(probeCount);
  let sqErr = 0;
  let maxJump = 0;
  for (let i = 0; i < probeCount; i++) {
    const t = periodStart + i * step;
    exact[i] = evaluate(t);
    const diff = exact[i]! - approx[i]!;
    sqErr += diff * diff;
  }
  for (let i = 0; i < probeCount; i++) {
    const next = exact[(i + 1) % probeCount]!;
    const jump = Math.abs(next - exact[i]!);
    if (jump > maxJump) maxJump = jump;
  }

  let rangeMin = Infinity;
  let rangeMax = -Infinity;
  for (let i = 0; i < probeCount; i++) {
    if (exact[i]! < rangeMin) rangeMin = exact[i]!;
    if (exact[i]! > rangeMax) rangeMax = exact[i]!;
  }
  const signalSpan = Math.max(1e-9, rangeMax - rangeMin);
  const hasJump = maxJump > 0.12 * signalSpan;

  let gibbsOvershootPct = 0;
  if (hasJump) {
    let approxMin = Infinity;
    let approxMax = -Infinity;
    for (let i = 0; i < probeCount; i++) {
      if (approx[i]! < approxMin) approxMin = approx[i]!;
      if (approx[i]! > approxMax) approxMax = approx[i]!;
    }
    const overTop = Math.max(0, approxMax - rangeMax);
    const overBot = Math.max(0, rangeMin - approxMin);
    gibbsOvershootPct = (Math.max(overTop, overBot) / maxJump) * 100;
  }

  const rmsError = Math.sqrt(sqErr / probeCount);
  const capturedPowerPct = totalPower > 1e-14 ? Math.min(100, (capturedPower / totalPower) * 100) : 100;

  return {
    period,
    omega0,
    fundamentalHz: 1 / period,
    a0,
    harmonics,
    symbolicProbeHarmonics,
    epicycleHarmonics,
    totalPower,
    capturedPower,
    capturedPowerPct,
    rmsError,
    gibbsOvershootPct,
    theoreticalGibbsPct: hasJump ? WILBRAHAM_GIBBS_PCT : 0,
    hasJumpDiscontinuity: hasJump,
  };
}

export function inspectSingleHarmonic(config: FourierSeriesConfig, n: number): HarmonicCoefficient {
  if (
    config.inputKind === "preset" &&
    (config.periodStart ?? 0) === 0 &&
    (config.continuation ?? "periodic") === "periodic"
  ) {
    return analyticalPresetCoefficient(config.presetId, config.amplitude, config.dutyCycle, config.dcOffset, n);
  }
  const { evaluate, periodStart, period, breakpoints } = buildPeriodicEvaluator(config);
  const panels = n > 200 ? 128 : 64;
  if (n === 0) {
    const a0 = (1 / period) * integratePiecewiseSafe(evaluate, periodStart, periodStart + period, breakpoints, panels);
    return {
      n: 0, an: a0, bn: 0, cnMag: Math.abs(a0),
      thetaN: a0 >= 0 ? 0 : Math.PI, cPosRe: a0, cPosIm: 0,
    };
  }
  const nw = (n * TAU) / period;
  const an = (2 / period) * integratePiecewiseSafe(t => evaluate(t) * Math.cos(nw * t), periodStart, periodStart + period, breakpoints, panels);
  const bn = (2 / period) * integratePiecewiseSafe(t => evaluate(t) * Math.sin(nw * t), periodStart, periodStart + period, breakpoints, panels);
  const cnMag = Math.hypot(an, bn);
  const thetaN = cnMag < 1e-13 ? 0 : Math.abs(bn) < 1e-11 ? (an < 0 ? -Math.PI : 0) : Math.atan2(-bn, an);
  return { n, an, bn, cnMag, thetaN, cPosRe: 0.5 * an, cPosIm: -0.5 * bn };
}

export function sampleSeriesViewport(
  config: FourierSeriesConfig,
  analysis: SeriesAnalysis,
  viewMin: number,
  viewMax: number,
  sampleCount: number,
): {
  exact: Float64Array;
  approx: Float64Array;
  error: Float64Array;
  step: number;
} {
  const { evaluate } = buildPeriodicEvaluator(config);
  const step = (viewMax - viewMin) / Math.max(1, sampleCount - 1);
  const N = analysis.harmonics.length;
  const anArr = new Float64Array(N);
  const bnArr = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    anArr[i] = analysis.harmonics[i]!.an;
    bnArr[i] = analysis.harmonics[i]!.bn;
  }
  const approx = wasmKernel.evalTrigSeries(viewMin, step, sampleCount, analysis.omega0, analysis.a0, anArr, bnArr, N);
  const exact = new Float64Array(sampleCount);
  const error = new Float64Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = viewMin + i * step;
    const v = evaluate(t);
    exact[i] = v;
    error[i] = v - approx[i]!;
  }
  return { exact, approx, error, step };
}

export function sampleInputRegion(
  config: FourierSeriesConfig,
  viewMin: number,
  viewMax: number,
  sampleCount: number,
): {
  baseRegion: Float64Array;
  extended: Float64Array;
  step: number;
} {
  const { evaluateBase, evaluate } = buildPeriodicEvaluator(config);
  const step = (viewMax - viewMin) / Math.max(1, sampleCount - 1);
  const baseRegion = new Float64Array(sampleCount);
  const extended = new Float64Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = viewMin + i * step;
    baseRegion[i] = evaluateBase(t);
    extended[i] = evaluate(t);
  }
  return { baseRegion, extended, step };
}

export type TransformAnalysis = Readonly<{
  timeStep: number;
  timeSamples: Float64Array;
  freqStep: number;
  freqMagnitude: Float64Array;
  freqReal: Float64Array;
  freqImag: Float64Array;
  freqPhase: Float64Array;
  totalEnergy: number;
}>;

const sinc = (x: number): number => (Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

function extractTransformBreakpoints(expr: string): number[] {
  const pts = new Set<number>([0]);
  const numPattern = /-?\d+(?:\.\d+)?/g;
  const condMatches = expr.match(/[^?:,{]+(?=[?:])/g) ?? [];
  for (const chunk of condMatches) {
    if (chunk.includes("<") || chunk.includes(">") || chunk.includes("=")) {
      for (const ns of chunk.match(numPattern) ?? []) {
        const val = Number(ns);
        if (Number.isFinite(val)) pts.add(val);
      }
    }
  }
  const rectMatch = expr.match(/rect\(\s*(?:\(?\s*t\s*([+-]\s*[0-9.]+)?\)?\s*(?:\/\s*([0-9.]+))?)\s*\)/gi) ?? [];
  for (const r of rectMatch) {
    const inner = r.slice(5, -1);
    const shiftM = inner.match(/([+-])\s*([0-9.]+)/);
    const divM = inner.match(/\/\s*([0-9.]+)/);
    const t0 = shiftM ? (shiftM[1] === "-" ? Number(shiftM[2]) : -Number(shiftM[2])) : 0;
    const w = divM ? Number(divM[1]) : 1;
    if (Number.isFinite(t0) && Number.isFinite(w) && w > 0) {
      pts.add(t0 - w / 2);
      pts.add(t0 + w / 2);
    }
  }
  const triMatch = expr.match(/tri\(\s*(?:\(?\s*t\s*([+-]\s*[0-9.]+)?\)?\s*(?:\/\s*([0-9.]+))?)\s*\)/gi) ?? [];
  for (const r of triMatch) {
    const inner = r.slice(4, -1);
    const shiftM = inner.match(/([+-])\s*([0-9.]+)/);
    const divM = inner.match(/\/\s*([0-9.]+)/);
    const t0 = shiftM ? (shiftM[1] === "-" ? Number(shiftM[2]) : -Number(shiftM[2])) : 0;
    const w = divM ? Number(divM[1]) : 1;
    if (Number.isFinite(t0) && Number.isFinite(w) && w > 0) {
      pts.add(t0 - w);
      pts.add(t0);
      pts.add(t0 + w);
    }
  }
  return Array.from(pts).sort((a, b) => a - b);
}

function buildTransformEvaluator(config: FourierTransformConfig) {
  const { signalId, amplitude: A, width: tau, shift: t0, modFreqHz: f0, decayRate: a, customExpr } = config;
  const customFn = signalId === "custom" ? compileExpression(customExpr).evaluate : undefined;
  const customBreaks = signalId === "custom" ? extractTransformBreakpoints(customExpr) : [];
  const customSpan = Math.max(12, Math.abs(config.timeMin), Math.abs(config.timeMax), 4 * tau);

  const evalTime = (t: number): number => {
    const u = t - t0;
    switch (signalId) {
      case "rect":
        return Math.abs(u) <= tau / 2 ? A : 0;
      case "tri":
        return Math.abs(u) <= tau ? A * (1 - Math.abs(u) / tau) : 0;
      case "gaussian":
        return A * Math.exp(-Math.PI * (u / tau) * (u / tau));
      case "exponential":
        return u >= 0 ? A * Math.exp(-a * u) : 0;
      case "modulated-rect":
        return (Math.abs(u) <= tau / 2 ? A : 0) * Math.cos(TAU * f0 * u);
      case "custom":
        return customFn!(t);
    }
  };

  const evalFreq = (f: number): [number, number] => {
    if (signalId === "custom") {
      const omega = TAU * f;
      const re = integratePiecewiseSafe(t => customFn!(t) * Math.cos(omega * t), -customSpan, customSpan, customBreaks, 80);
      const im = integratePiecewiseSafe(t => -customFn!(t) * Math.sin(omega * t), -customSpan, customSpan, customBreaks, 80);
      return [re, im];
    }
    let baseRe = 0;
    let baseIm = 0;
    switch (signalId) {
      case "rect":
        baseRe = A * tau * sinc(f * tau);
        break;
      case "tri": {
        const s = sinc(f * tau);
        baseRe = A * tau * s * s;
        break;
      }
      case "gaussian":
        baseRe = A * tau * Math.exp(-Math.PI * (f * tau) * (f * tau));
        break;
      case "exponential": {
        const omega = TAU * f;
        const denom = a * a + omega * omega;
        baseRe = (A * a) / denom;
        baseIm = (-A * omega) / denom;
        break;
      }
      case "modulated-rect":
        baseRe = 0.5 * A * tau * (sinc((f - f0) * tau) + sinc((f + f0) * tau));
        break;
    }
    const phaseShift = -TAU * f * t0;
    const cs = Math.cos(phaseShift);
    const sn = Math.sin(phaseShift);
    return [baseRe * cs - baseIm * sn, baseRe * sn + baseIm * cs];
  };

  return { evalTime, evalFreq, customBreaks, customSpan };
}

export function inspectTransformFrequency(
  config: FourierTransformConfig,
  f: number,
): Readonly<{ f: number; re: number; im: number; mag: number; phase: number }> {
  const { evalFreq } = buildTransformEvaluator(config);
  const [re, im] = evalFreq(f);
  const mag = Math.hypot(re, im);
  const phase = mag > 1e-12 ? Math.atan2(im, re) : 0;
  return { f, re, im, mag, phase };
}

export function sampleInverseTransformBandwidth(
  config: FourierTransformConfig,
  bandwidthHz: number,
  xMin: number,
  xMax: number,
  sampleCount: number,
): Float64Array {
  const { evalFreq } = buildTransformEvaluator(config);
  const B = Math.max(0.05, bandwidthHz);
  // Pre-sample X(f) using 6 panels x 16 GL nodes = 96 quadrature points on [0, B]
  const panels = 6;
  const h = B / panels;
  const fNodes: number[] = [];
  const fWeights: number[] = [];
  const reNodes: number[] = [];
  const imNodes: number[] = [];
  for (let p = 0; p < panels; p++) {
    const mid = (p + 0.5) * h;
    const half = 0.5 * h;
    for (let i = 0; i < 8; i++) {
      const dx = half * GL_NODES[i]!;
      const w = half * GL_WEIGHTS[i]!;
      for (const f of [mid - dx, mid + dx]) {
        const [re, im] = evalFreq(f);
        fNodes.push(f);
        fWeights.push(w);
        reNodes.push(re);
        imNodes.push(im);
      }
    }
  }

  const out = new Float64Array(sampleCount);
  const step = (xMax - xMin) / Math.max(1, sampleCount - 1);
  for (let idx = 0; idx < sampleCount; idx++) {
    const t = xMin + idx * step;
    let sum = 0;
    for (let k = 0; k < fNodes.length; k++) {
      const ang = TAU * fNodes[k]! * t;
      sum += fWeights[k]! * (reNodes[k]! * Math.cos(ang) - imNodes[k]! * Math.sin(ang));
    }
    out[idx] = 2 * sum;
  }
  return out;
}

export function sampleTransformTime(
  config: FourierTransformConfig,
  sampleCount: number,
): Readonly<{ timeStep: number; timeSamples: Float64Array }> {
  const { evalTime } = buildTransformEvaluator(config);
  const timeStep = (config.timeMax - config.timeMin) / Math.max(1, sampleCount - 1);
  const timeSamples = new Float64Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    timeSamples[i] = evalTime(config.timeMin + i * timeStep);
  }
  return { timeStep, timeSamples };
}

export function sampleTransformViewport(
  config: FourierTransformConfig,
  sampleCount: number,
): TransformAnalysis {
  const { signalId, amplitude: A, width: tau, shift: t0, decayRate: a, customExpr } = config;
  const { evalTime, evalFreq, customBreaks, customSpan } = buildTransformEvaluator(config);

  const timeStep = (config.timeMax - config.timeMin) / Math.max(1, sampleCount - 1);
  const timeSamples = new Float64Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    timeSamples[i] = evalTime(config.timeMin + i * timeStep);
  }

  const freqStep = (config.freqMax - config.freqMin) / Math.max(1, sampleCount - 1);
  const freqMagnitude = new Float64Array(sampleCount);
  const freqReal = new Float64Array(sampleCount);
  const freqImag = new Float64Array(sampleCount);
  const freqPhase = new Float64Array(sampleCount);

  let totalEnergy = 0;
  if (signalId === "custom") {
    // Evaluate customExpr ONCE across [-customSpan, customSpan] instead of 2 * sampleCount * 1280 times
    const customFn = compileExpression(customExpr).evaluate;
    const grid = buildQuadratureGrid(customFn, -customSpan, customSpan, customBreaks, 80);
    for (let k = 0; k < grid.count; k++) {
      totalEnergy += grid.wf[k]! * grid.fVals[k]!;
    }
    for (let i = 0; i < sampleCount; i++) {
      const f = config.freqMin + i * freqStep;
      const omega = TAU * f;
      let re = 0;
      let im = 0;
      for (let k = 0; k < grid.count; k++) {
        const ang = omega * grid.tNodes[k]!;
        const wfk = grid.wf[k]!;
        re += wfk * Math.cos(ang);
        im -= wfk * Math.sin(ang);
      }
      freqReal[i] = re;
      freqImag[i] = im;
      const mag = Math.hypot(re, im);
      freqMagnitude[i] = mag;
      freqPhase[i] = mag > 1e-12 ? Math.atan2(im, re) : 0;
    }
  } else {
    for (let i = 0; i < sampleCount; i++) {
      const f = config.freqMin + i * freqStep;
      const [re, im] = evalFreq(f);
      freqReal[i] = re;
      freqImag[i] = im;
      const mag = Math.hypot(re, im);
      freqMagnitude[i] = mag;
      freqPhase[i] = mag > 1e-12 ? Math.atan2(im, re) : 0;
    }
    switch (signalId) {
      case "rect": totalEnergy = A * A * tau; break;
      case "tri": totalEnergy = (2 * A * A * tau) / 3; break;
      case "gaussian": totalEnergy = (A * A * tau) / Math.SQRT2; break;
      case "exponential": totalEnergy = (A * A) / (2 * a); break;
      case "modulated-rect": totalEnergy = integrateGaussLegendre16(t => { const v = evalTime(t); return v * v; }, t0 - tau, t0 + tau, 48); break;
    }
  }

  return {
    timeStep, timeSamples, freqStep, freqMagnitude, freqReal, freqImag, freqPhase, totalEnergy,
  };
}

export type EpicycleTerm = Readonly<{
  k: number;
  re: number;
  im: number;
  radius: number;
  phase: number;
}>;

export type EpicyclesAnalysis = Readonly<{
  targetContour: readonly Point2D[];
  terms: readonly EpicycleTerm[];
  reconstructed: readonly Point2D[];
}>;

export function solveEpicycles(config: EpicyclesConfig): EpicyclesAnalysis {
  const targetContour = getShapeContour(config.shapeId, config.customPath, 512);
  const M = targetContour.length;
  const xs = new Float64Array(M);
  const ys = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    xs[i] = targetContour[i]!.x;
    ys[i] = targetContour[i]!.y;
  }

  const K = config.harmonics;
  const { re, im } = wasmKernel.evalComplexDft(xs, ys, -K, K);
  const terms: EpicycleTerm[] = [];
  for (let idx = 0; idx <= 2 * K; idx++) {
    const k = -K + idx;
    const cRe = re[idx]!;
    const cIm = im[idx]!;
    terms.push({
      k,
      re: cRe,
      im: cIm,
      radius: Math.hypot(cRe, cIm),
      phase: Math.atan2(cIm, cRe),
    });
  }

  terms.sort((a, b) => {
    if (a.k === 0) return -1;
    if (b.k === 0) return 1;
    return b.radius - a.radius;
  });

  const reconstructed: Point2D[] = [];
  for (let m = 0; m < M; m++) {
    const t = m / M;
    let px = 0;
    let py = 0;
    for (const term of terms) {
      const ang = TAU * term.k * t;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      px += term.re * cs - term.im * sn;
      py += term.re * sn + term.im * cs;
    }
    reconstructed.push({ x: px, y: py });
  }

  return { targetContour, terms, reconstructed };
}
