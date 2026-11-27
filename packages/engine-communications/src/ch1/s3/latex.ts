import type { FourierSeriesConfig, FourierTransformConfig, EpicyclesConfig } from "./model.js";
import type { HarmonicCoefficient, SeriesAnalysis, EpicyclesAnalysis, TransformAnalysis } from "./math.js";
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

export function buildSeriesApproximationStep(
  config: FourierSeriesConfig,
  analysis: SeriesAnalysis,
): MathStep {
  const N = config.harmonics;
  const cont = config.continuation ?? "periodic";
  const tStart = config.periodStart ?? 0;
  const usePresetShortcut =
    config.inputKind === "preset" && tStart === 0 && cont === "periodic";

  const lines: string[] = [];
  let inputDesc = "";

  if (config.inputKind === "graphical") {
    const ptCount = config.graphicalPoints.length;
    const interp = config.graphicalInterp;
    if (interp === "step") {
      inputDesc = `Graphical draw (${ptCount} control points) is converted into a continuous function using zero-order hold (piecewise constant) interpolation across normalized phase u in [0, 1).`;
      lines.push(String.raw`x(t) = y_i \quad\text{on}\quad u_i \le u < u_{i+1}, \quad u = \frac{t - t_0}{L} \bmod 1`);
    } else if (interp === "linear") {
      inputDesc = `Graphical draw (${ptCount} control points) is converted into a continuous function using piecewise linear interpolation between consecutive drawn vertices.`;
      lines.push(String.raw`x(t) = y_i + \alpha(y_{i+1} - y_i), \quad \alpha = \frac{u - u_i}{u_{i+1} - u_i} \in [0, 1)`);
    } else {
      inputDesc = `Graphical draw (${ptCount} control points) is smoothed into a C^1 continuous curve using periodic Catmull-Rom cubic spline interpolation over 4 neighboring points (p_{-1}, p_0, p_1, p_2).`;
      lines.push(String.raw`x(u) = \frac{1}{2}\Big[2y_0 + (-y_{-1}+y_1)\alpha + (2y_{-1}-5y_0+4y_1-y_2)\alpha^2 + (-y_{-1}+3y_0-3y_1+y_2)\alpha^3\Big]`);
    }
  } else if (config.inputKind === "piecewise") {
    inputDesc = `The ${config.piecewiseSegments.length} piecewise interval formulas are evaluated directly on each subinterval and extended (${cont}) to period T0 = ${fmt(analysis.period)} s.`;
  } else if (config.inputKind === "expression") {
    inputDesc = `The expression x(t) is evaluated continuously on [${fmt(tStart)}, ${fmt(tStart + config.period)}) and extended (${cont}) to period T0 = ${fmt(analysis.period)} s.`;
  } else {
    inputDesc = `The preset waveform x(t) is evaluated analytically on [${fmt(tStart)}, ${fmt(tStart + config.period)}) with ${cont} extension (T0 = ${fmt(analysis.period)} s).`;
  }

  const quadDesc = usePresetShortcut
    ? "Fourier coefficients (a_n, b_n) are computed from exact closed-form integrals, while signal power is checked via breakpoint-split 16-point Gauss-Legendre quadrature."
    : "Fourier coefficients (a_0, a_n, b_n) are integrated across every continuous subinterval [u_m, u_{m+1}] (splitting at breakpoints to avoid smoothing across jumps) using 16-point composite Gauss-Legendre quadrature (96 panels = 1536 nodes, exact for polynomials up to degree 31 per panel).";

  if (!usePresetShortcut) {
    lines.push(String.raw`\int_{t_a}^{t_b} g(t)\,dt \approx \sum_{p=1}^{P}\frac{h_p}{2}\sum_{i=1}^{16} w_i\,g\!\left(t_{p,\text{mid}} + \frac{h_p}{2}\xi_i\right)`);
  }

  lines.push(
    String.raw`\|x - x_{${N}}\|_{\mathrm{RMS}} = \sqrt{\frac{1}{T_0}\int_{t_0}^{t_0+T_0} |x(t) - x_{${N}}(t)|^2\,dt} = ${fmt(analysis.rmsError)}\text{ V}, \quad \frac{P_{${N}}}{P_{\text{total}}} = ${analysis.capturedPowerPct.toFixed(2)}\%`,
  );

  return {
    title: `How the Input Graph & Partial Sum x_${N}(t) Are Approximated`,
    note: `${inputDesc} ${quadDesc} The plotted curve x_${N}(t) is the minimum-L^2 orthogonal projection onto harmonics n <= ${N}.`,
    latex: String.raw`\begin{gathered}${lines.join(String.raw` \\ `)}\end{gathered}`,
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

export function buildTransformApproximationStep(
  config: FourierTransformConfig,
  analysis?: TransformAnalysis,
): MathStep {
  const isCustom = config.signalId === "custom";
  const span = Math.max(8, Math.abs(config.timeMin), Math.abs(config.timeMax), 2 * config.width + Math.abs(config.shift));
  const energyLine = analysis
    ? String.raw` \quad E = \int |x(t)|^2 dt \approx ${fmt(analysis.totalEnergy)}\text{ V}^2\!\cdot\text{s}`
    : "";

  if (!isCustom) {
    return {
      title: "How the Input Signal, Spectrum & IFT Graph Are Approximated",
      note: "For preset signals, x(t) and X(f) are evaluated directly from exact analytical Fourier transform pairs across the plotted grid. When the bandlimited IFT overlay x_B(t) is enabled, the truncated inverse integral over [-B, B] is approximated by 6-panel 16-point Gauss-Legendre quadrature (96 frequency nodes on [0, B]).",
      latex: String.raw`\begin{gathered}X(f)\text{ exact closed form}; \quad x_B(t) = 2\operatorname{Re}\!\left[\int_0^B X(f)e^{j2\pi f t}\,df\right] \approx 2\operatorname{Re}\!\sum_{m=1}^{96} w_m X(f_m)e^{j2\pi f_m t}${energyLine}\end{gathered}`,
    };
  }

  return {
    title: "How the Custom Input Graph & Spectrum X(f) Are Approximated",
    note: `Custom and piecewise inputs are integrated over a finite support window [-${fmt(span)}, ${fmt(span)}] split at every piecewise breakpoint using single-pass 16-point composite Gauss-Legendre quadrature (80 panels = 1280 nodes). When enabled, the bandlimited inverse transform x_B(t) uses 96-node Gauss-Legendre quadrature on [0, B].`,
    latex: String.raw`\begin{gathered}X(f) \approx \int_{-${fmt(span)}}^{${fmt(span)}} x(t)e^{-j2\pi f t}\,dt \approx \sum_{k=1}^{1280} w_k\,x(t_k)e^{-j2\pi f t_k}${energyLine} \\ x_B(t) = 2\operatorname{Re}\!\int_0^B X(f)e^{j2\pi f t}\,df \approx 2\operatorname{Re}\!\sum_{m=1}^{96} w_m X(f_m)e^{j2\pi f_m t}\end{gathered}`,
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

export function buildEpicycleApproximationStep(
  config: EpicyclesConfig,
  analysis: EpicyclesAnalysis,
): MathStep {
  const K = config.harmonics;
  const M = analysis.targetContour.length;
  let sqErr = 0;
  let totalContourPow = 0;
  for (let m = 0; m < M; m++) {
    const tgt = analysis.targetContour[m]!;
    const rec = analysis.reconstructed[m]!;
    const dx = tgt.x - rec.x;
    const dy = tgt.y - rec.y;
    sqErr += dx * dx + dy * dy;
    totalContourPow += tgt.x * tgt.x + tgt.y * tgt.y;
  }
  const rmse = M > 0 ? Math.sqrt(sqErr / M) : 0;
  const avgPow = M > 0 ? totalContourPow / M : 0;
  const capturedPow = analysis.terms.reduce((acc, t) => acc + t.radius * t.radius, 0);
  const energyPct = avgPow > 1e-12 ? Math.min(100, (capturedPow / avgPow) * 100) : 100;

  return {
    title: `How the Input Contour Is Parameterized & Approximated (K = ${K})`,
    note: `The input shape (cubic Beziers, polygon segments, or freehand mouse points) is closed into a loop, measured by cumulative Euclidean arc length s_i, linearly resampled into M = ${M} constant-speed samples z_m, centered at its centroid, and normalized to unit max radius. The continuous integral c_k is approximated by the M-point periodic trapezoidal rule, and summing |k| <= ${K} gives the minimum-L^2 curve approximation.`,
    latex: String.raw`\begin{gathered}z_m = \frac{P(s_m) - \bar{P}}{R_{\max}}, \quad s_m = \frac{m}{${M}}L \quad\Longrightarrow\quad c_k \approx \frac{1}{${M}}\sum_{m=0}^{${M - 1}} z_m\,e^{-j 2\pi k m / ${M}} \\ \|z - z_{${K}}\|_{\mathrm{RMS}} = ${fmt(rmse)}, \quad \frac{\sum_{|k|\le ${K}} |c_k|^2}{\frac{1}{${M}}\sum |z_m|^2} = ${energyPct.toFixed(2)}\%\end{gathered}`,
  };
}

