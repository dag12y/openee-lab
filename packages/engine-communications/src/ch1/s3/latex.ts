import type { FourierSeriesConfig, FourierTransformConfig, EpicyclesConfig } from "./model.js";
import type { HarmonicCoefficient, SeriesAnalysis, EpicyclesAnalysis } from "./math.js";
import { expressionToLatex } from "./expr.js";
import {
  buildSeriesMathSteps,
  formatExactScalar,
  formatNumber,
  synthesizeSimplifiedSeriesLatex,
  type SeriesMathStepsBundle,
} from "./symbolic.js";
import { synthesizeTransformSymbolic, type MathStep } from "./transform-symbolic.js";
import { buildTransformCalculusDerivation } from "./calculus-derivation.js";

const fmt = formatNumber;
const fmtSigned = (v: number): string => (v >= 0 ? `+ ${fmt(v)}` : `- ${fmt(Math.abs(v))}`);

export type SeriesLatexBundle = Readonly<{
  inputDef: string;
  trigonometricGeneral: string;
  compactGeneral: string;
  complexGeneral: string;
  inspectedTerm: string;
  decayNote: string;
  steps: SeriesMathStepsBundle;
}>;

export function buildSeriesLatex(
  config: FourierSeriesConfig,
  analysis: SeriesAnalysis,
  inspected: HarmonicCoefficient,
): SeriesLatexBundle {
  const T0 = fmt(analysis.period);
  const nVal = inspected.n;
  const cont = config.continuation ?? "periodic";
  const tStart = config.periodStart ?? 0;
  const tEnd = tStart + config.period;

  let inputDef = "";
  let trigFormula = "";
  let compactFormula = "";
  let complexFormula = "";
  let decayNote = "";

  if (config.inputKind === "expression") {
    const exprTex = expressionToLatex(config.expression);
    const contTag = cont === "periodic" ? "" : cont === "even" ? String.raw`\text{ (even ext.)}` : String.raw`\text{ (odd ext.)}`;
    inputDef = String.raw`x(t) = ${exprTex}, \quad t \in [${fmt(tStart)}, ${fmt(tEnd)})${contTag}`;
  } else if (config.inputKind === "piecewise") {
    const rows = config.piecewiseSegments
      .map(s => `${expressionToLatex(s.expr)}, & ${fmt(s.start)} \\le t < ${fmt(s.end)}`)
      .join(String.raw` \\ `);
    inputDef = String.raw`x(t) = \begin{cases} ${rows} \end{cases}, \quad T_0 = ${T0}`;
  } else if (config.inputKind === "graphical") {
    inputDef = String.raw`x(t) = \text{Drawn}(t), \quad t \in [${fmt(tStart)}, ${fmt(tEnd)}),\; T_0 = ${T0}`;
  } else {
    const A = formatExactScalar(config.amplitude).tex;
    const halfT = fmt(tStart + config.period / 2);
    switch (config.presetId) {
      case "square":
        inputDef = String.raw`x(t) = \begin{cases} ${A}, & ${fmt(tStart)} \le t < ${halfT} \\ -${A}, & ${halfT} \le t < ${fmt(tEnd)} \end{cases}`;
        break;
      case "sawtooth":
        inputDef = String.raw`x(t) = ${A}\!\left(\frac{2(t - ${fmt(tStart)})}{${fmt(config.period)}} - 1\right), \quad t \in [${fmt(tStart)}, ${fmt(tEnd)})`;
        break;
      case "triangle":
        inputDef = String.raw`x(t) = ${A}\!\left(1 - 4\left|\frac{t - ${fmt(tStart)}}{${fmt(config.period)}} - \frac{1}{2}\right|\right)`;
        break;
      case "half-rectified":
        inputDef = String.raw`x(t) = \max\!\left(0,\, ${A}\sin\!\left(\frac{2\pi t}{${fmt(config.period)}}\right)\right)`;
        break;
      case "full-rectified":
        inputDef = String.raw`x(t) = ${A}\left|\sin\!\left(\frac{\pi t}{${fmt(config.period)}}\right)\right|`;
        break;
      case "pulse":
        inputDef = String.raw`x(t) = \begin{cases} ${A}, & ${fmt(tStart)} \le t < ${fmt(tStart + config.dutyCycle * config.period)} \\ 0, & \text{else} \end{cases}`;
        break;
    }
  }

  // Synthesize the most simplified closed-form expression
  const synth = synthesizeSimplifiedSeriesLatex(
    config,
    analysis.a0,
    analysis.omega0,
    analysis.symbolicProbeHarmonics,
    analysis.capturedPower,
    analysis.totalPower,
  );
  const steps = buildSeriesMathSteps(config, analysis, synth);
  trigFormula = synth.trigonometric;
  compactFormula = synth.compact;
  complexFormula = synth.complex;
  decayNote = analysis.hasJumpDiscontinuity ? String.raw`O(1/n)\text{ decay}` : String.raw`O(1/n^2)\text{ / smooth}`;

  const inspectedTerm = nVal === 0
    ? String.raw`n = 0:\quad a_0 = C_0 = c_0 = ${formatExactScalar(inspected.an).tex}`
    : String.raw`n = ${nVal}:\quad a_{${nVal}} = ${formatExactScalar(inspected.an).tex},\; b_{${nVal}} = ${formatExactScalar(inspected.bn).tex},\; C_{${nVal}} = ${formatExactScalar(inspected.cnMag).tex},\; \theta_{${nVal}} = ${fmt(inspected.thetaN)}\text{ rad},\; c_{${nVal}} = ${fmt(inspected.cPosRe)} ${fmtSigned(inspected.cPosIm)}j`;

  return {
    inputDef,
    trigonometricGeneral: trigFormula,
    compactGeneral: compactFormula,
    complexGeneral: complexFormula,
    inspectedTerm,
    decayNote,
    steps,
  };
}

export type TransformLatexBundle = Readonly<{
  generalPair: string;
  signalFormula: string;
  transformFormula: string;
  transformOmegaFormula: string;
  properties: string;
  steps: readonly MathStep[];
}>;

export function buildTransformLatex(config: FourierTransformConfig): TransformLatexBundle {
  const { signalFormula, transformFormula, transformOmegaFormula, steps } = synthesizeTransformSymbolic(config);
  const calcSteps = buildTransformCalculusDerivation(config);
  return {
    generalPair: String.raw`X(f) = \int_{-\infty}^{\infty} x(t) e^{-j 2\pi f t}\,dt \;\Longleftrightarrow\; x(t) = \int_{-\infty}^{\infty} X(f) e^{j 2\pi f t}\,df`,
    signalFormula,
    transformFormula,
    transformOmegaFormula,
    properties: String.raw`x(at) \leftrightarrow \frac{1}{|a|}X\!\left(\frac{f}{a}\right) \quad\cdot\quad x(t-t_0) \leftrightarrow e^{-j 2\pi f t_0}X(f) \quad\cdot\quad E = \int |x(t)|^2 dt = \int |X(f)|^2 df`,
    steps: calcSteps && calcSteps.length > 0 ? calcSteps : steps,
  };
}

export function buildEpicycleLatex(config: EpicyclesConfig, analysis: EpicyclesAnalysis): string {
  const K = config.harmonics;
  const topTerms = analysis.terms.slice(0, 3)
    .map(t => `(${fmt(t.re)} ${fmtSigned(t.im)}j)e^{j 2\\pi (${t.k}) t}`)
    .join(" + ");
  return String.raw`z_{${K}}(t) = \sum_{k=-${K}}^{${K}} c_k e^{j 2\pi k t} \approx ${topTerms} + \cdots, \quad c_k = \int_0^1 z(t) e^{-j 2\pi k t}\,dt`;
}

export function buildEpicycleMathSteps(config: EpicyclesConfig, analysis: EpicyclesAnalysis): readonly MathStep[] {
  const K = config.harmonics;
  const dominant = analysis.terms.slice(0, 3)
    .map(t => `|c_{${t.k}}| = ${fmt(t.radius)}`)
    .join(String.raw`,\quad `);
  return [
    {
      title: "Arc-Length Complex Contour Parameterization",
      latex: String.raw`z(t) = x(t) + j\,y(t), \quad t \in [0, 1), \quad \left|\frac{dz}{dt}\right| = \text{const}`,
    },
    {
      title: "Continuous Complex Fourier Coefficient Integral",
      latex: String.raw`c_k = \int_0^1 z(t)\,e^{-j2\pi k t}\,dt \quad (k = -${K},\dots,${K})`,
    },
    {
      title: "Order Phasors by Radius & Sum Tip-to-Tail",
      latex: String.raw`z_{${K}}(t) = c_0 + \sum_{1 \le |k| \le ${K}} |c_k|\,e^{j(2\pi k t + \angle c_k)} \quad\text{with}\quad ${dominant}`,
    },
  ];
}
