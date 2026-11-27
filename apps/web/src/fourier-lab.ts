import {
  buildEpicycleApproximationStep,
  buildSeriesApproximationStep,
  buildTransformApproximationStep,
  compileExpression,
  createDefaultFourierModel,
  epicycleShapeCatalog,
  expressionToLatex,
  inspectSingleHarmonic,
  inspectTransformFrequency,
  maxEpicycleHarmonics,
  maxSeriesHarmonics,
  sampleInverseTransformBandwidth,
  sampleSeriesViewport,
  sampleTransformTime,
  sampleTransformViewport,
  type EpicyclesAnalysis,
  type EpicycleShapeId,
  type FourierModel,
  type FourierOutput,
  type MathStep,
  type PiecewiseSegment,
  type SeriesAnalysis,
  type TransformAnalysis,
  type TransformSignalId,
} from "../../../packages/engine-communications/src/ch1/s3/index.js";
import type { RunOutcome } from "../../../packages/contracts/src/index.js";
import { createDesmosPlot, type DesmosTrace } from "./desmos-plot";
import { createEpicyclesView } from "./epicycles-view";
import type { FourierWorkerRequest } from "./fourier.worker";
import { createFunctionStudio } from "./function-studio";
import { renderLatex } from "./latex-ui";
import { createMathKeypad } from "./math-keypad";
import { createScientificPlot } from "./scientific-plot";
import { createSeriesEpicycleView } from "./series-epicycle-view";
import { diagnostics, element } from "./ui";

const TRANSFORM_PRESET_CHIPS: ReadonlyArray<{ id: Exclude<TransformSignalId, "custom">; label: string }> = [
  { id: "rect", label: "rect(t/τ)" },
  { id: "tri", label: "tri(t/τ)" },
  { id: "gaussian", label: "Gaussian" },
  { id: "exponential", label: "e⁻ᵃᵗu(t)" },
  { id: "modulated-rect", label: "Modulated" },
];

const TRANSFORM_CUSTOM_CHIPS: ReadonlyArray<{ label: string; expr: string; timeMin: number; timeMax: number }> = [
  { label: "e⁻ᵃ|ᵗ|cos", expr: "exp(-2 * abs(t)) * cos(2 * pi * 2 * t)", timeMin: -3, timeMax: 3 },
  { label: "t·e⁻²ᵗu(t)", expr: "t * exp(-2 * t) * u(t)", timeMin: -1, timeMax: 5 },
  { label: "{Piecewise}", expr: "{-1 <= t < 0: 1 + t, 0 <= t <= 1: 1 - t, 0}", timeMin: -3, timeMax: 3 },
  { label: "sinc(2t)", expr: "sinc(2 * t)", timeMin: -4, timeMax: 4 },
];

function canonicalTransformExpr(tf: FourierModel["transform"]): string {
  const A = fmt(tf.amplitude);
  const tau = fmt(tf.width);
  const t0 = tf.shift;
  const shifted = Math.abs(t0) < 1e-10 ? "t" : t0 > 0 ? `(t - ${fmt(t0)})` : `(t + ${fmt(Math.abs(t0))})`;
  switch (tf.signalId) {
    case "rect":
      return `${A} * rect(${shifted} / ${tau})`;
    case "tri":
      return `${A} * tri(${shifted} / ${tau})`;
    case "gaussian":
      return `${A} * exp(-pi * (${shifted} / ${tau})^2)`;
    case "exponential":
      return `${A} * exp(-${fmt(tf.decayRate)} * ${shifted}) * u(${shifted})`;
    case "modulated-rect":
      return `${A} * rect(${shifted} / ${tau}) * cos(2 * pi * ${fmt(tf.modFreqHz)} * ${shifted})`;
    case "custom":
      return tf.customExpr;
  }
}

function tfSegmentsToBraceExpr(segs: readonly PiecewiseSegment[]): string {
  if (segs.length === 0) return "0";
  const body = segs
    .map(s => `${fmt(Number.isFinite(s.start) ? s.start : 0)} <= t < ${fmt(Number.isFinite(s.end) ? s.end : 1)}: ${s.expr.trim() || "0"}`)
    .join(", ");
  return `{${body}, 0}`;
}

function parseTfBraceToSegments(raw: string): PiecewiseSegment[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return undefined;
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
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
  const out: PiecewiseSegment[] = [];
  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx < 0) continue; // Ignore trailing default branch like ", 0"
    const cond = part.slice(0, colonIdx).trim();
    const expr = part.slice(colonIdx + 1).trim();
    const m = cond.match(/^(-?\d+(?:\.\d+)?)\s*<=?\s*t\s*<=?\s*(-?\d+(?:\.\d+)?)$/);
    if (!m || !expr) return undefined;
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
    out.push({ start, end, expr });
  }
  return out.length > 0 ? out : undefined;
}

function renderStepsContainer(container: HTMLElement, steps: readonly MathStep[]) {
  container.replaceChildren();
  steps.forEach((step, idx) => {
    const item = element("div", undefined, "s3-step-item");
    const head = element("div", `${idx + 1}. ${step.title}`, "s3-step-title");
    item.append(head);
    if (step.note) {
      item.append(element("p", step.note, "s3-step-note"));
    }
    const math = element("div", undefined, "s3-step-math");
    renderLatex(math, step.latex, true);
    item.append(math);
    container.append(item);
  });
}

export function mountFourierLab(root: HTMLElement): () => void {
  let model = createDefaultFourierModel();
  let currentSeriesAnalysis: SeriesAnalysis | undefined;
  let showErrorOverlay = false;
  let showTargetOverlay = true;
  type FormTab = "trig" | "compact" | "complex";
  let activeFormTab: FormTab = "trig";
  let showSeriesMath = false;
  let showEpiMath = false;
  let showTfMath = false;
  let spectrumSides: "one" | "two" = "one";
  let spectrumScale: "linear" | "db" = "linear";
  let spectrumView: "magnitude" | "phase" | "both" = "magnitude";
  let showSpecTable = false;
  let tfAxisMode: "hz" | "rad" = "hz";
  let tfDisplayMode: "mag-re" | "re-im" = "mag-re";
  let tfSpecView: "magnitude" | "phase" | "both" = "magnitude";
  let tfShowIftOverlay = false;
  let tfIftBandwidthHz = 3.0;
  let tfInspectF = 0;

  let runSeq = 0;
  let revision = 0;
  let activeRunId: string | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let worker: Worker | undefined;
  let disposed = false;

  const header = element("header", undefined, "lab-heading s3-heading");
  header.append(
    element("span", "Chapter 1 · S3", "eyebrow"),
    element("h1", "Fourier Series & Transform"),
  );

  // Clean Mode Switcher Tabs
  const modeTabs = element("div", undefined, "s3-tabs");
  modeTabs.setAttribute("role", "tablist");
  const modeButtons: Record<FourierModel["mode"], HTMLButtonElement> = {
    series: element("button", "1. Fourier Series", "s3-tab"),
    epicycles: element("button", "2. Fourier Series Drawing", "s3-tab"),
    transform: element("button", "3. Fourier Transform", "s3-tab"),
  };
  (Object.entries(modeButtons) as Array<[FourierModel["mode"], HTMLButtonElement]>).forEach(([m, btn]) => {
    btn.type = "button";
    btn.setAttribute("role", "tab");
    btn.addEventListener("click", () => {
      model = { ...model, mode: m };
      syncVisibility();
      scheduleRun(0);
    });
    modeTabs.append(btn);
  });

  // Quiet inline error diagnostics only when inputs are invalid
  const diagList = element("ul", undefined, "diagnostics");
  diagList.setAttribute("aria-live", "polite");

  // ============================================================================
  // TAB 1: FOURIER SERIES
  // ============================================================================
  const seriesSection = element("div", undefined, "s3-section");

  // Row 1: Unified Function Input Studio
  const studio = createFunctionStudio(model.series, (nextSeries, delayMs) => {
    model = { ...model, series: nextSeries };
    scheduleRun(delayMs);
  });

  // Row 2: Waveform Controls right next to Desmos Zoom/Pan Partial Sum Graph
  const waveWorkspace = element("div", undefined, "workspace s3-workspace");
  const waveControls = element("section", undefined, "panel s3-control-group");
  waveControls.append(element("h2", "Series Approximation"));

  const harmSliderBox = element("div", undefined, "field");
  const harmLabel = element("label", `Harmonics N = ${model.series.harmonics}`);
  harmLabel.htmlFor = "s3-harmonics";
  const harmSlider = element("input");
  harmSlider.id = "s3-harmonics";
  harmSlider.type = "range";
  harmSlider.min = "1";
  harmSlider.max = String(maxSeriesHarmonics);
  harmSlider.value = String(model.series.harmonics);
  harmSlider.addEventListener("input", () => {
    const n = Number(harmSlider.value);
    harmLabel.textContent = `Harmonics N = ${n}`;
    model = { ...model, series: { ...model.series, harmonics: n } };
    scheduleRun(40);
  });
  harmSliderBox.append(harmLabel, harmSlider);

  const toggleRow = element("div", undefined, "plot-controls");
  const targetToggleBtn = element("button", "Original x(t): On");
  targetToggleBtn.type = "button";
  targetToggleBtn.classList.add("active");
  targetToggleBtn.addEventListener("click", () => {
    showTargetOverlay = !showTargetOverlay;
    targetToggleBtn.textContent = showTargetOverlay ? "Original x(t): On" : "Original x(t): Off";
    targetToggleBtn.classList.toggle("active", showTargetOverlay);
    seriesPlot.refresh();
  });

  const errorToggleBtn = element("button", "Error e(t): Off");
  errorToggleBtn.type = "button";
  errorToggleBtn.addEventListener("click", () => {
    showErrorOverlay = !showErrorOverlay;
    errorToggleBtn.textContent = showErrorOverlay ? "Error e(t): On" : "Error e(t): Off";
    errorToggleBtn.classList.toggle("active", showErrorOverlay);
    seriesPlot.refresh();
  });
  toggleRow.append(targetToggleBtn, errorToggleBtn);

  const metricsBox = element("div", undefined, "s3-metrics-list");
  waveControls.append(harmSliderBox, toggleRow, metricsBox);

  const wavePlotPanel = element("section", undefined, "panel");
  const seriesPlot = createDesmosPlot({
    title: "Periodic Partial Sum x_N(t)",
    xLabel: "Time t (s)",
    yLabel: "Amplitude (V)",
    initialXMin: model.series.viewMin,
    initialXMax: model.series.viewMax,
    onViewportChange(xMin, xMax) {
      if (!currentSeriesAnalysis) return [];
      const vp = sampleSeriesViewport(model.series, currentSeriesAnalysis, xMin, xMax, model.sampleCount);
      const traces: DesmosTrace[] = [
        { label: `x_N(t) (N=${model.series.harmonics})`, mode: "line", values: vp.approx, xStart: xMin, xStep: vp.step },
      ];
      if (showTargetOverlay) {
        traces.push({ label: "x(t)", mode: "line", dashed: true, values: vp.exact, xStart: xMin, xStep: vp.step });
      }
      if (showErrorOverlay) {
        traces.push({ label: "e(t)", mode: "line", color: "#b91c1c", values: vp.error, xStart: xMin, xStep: vp.step });
      }
      return traces;
    },
  });
  wavePlotPanel.append(seriesPlot.root);
  waveWorkspace.append(waveControls, wavePlotPanel);

  // Row 3: Symbolic Series Representations + Show Math + Arbitrary n Inspector
  const latexCard = element("section", undefined, "panel s3-latex-panel");
  const latexHeader = element("div", undefined, "s3-latex-header");
  latexHeader.append(element("h2", "Fourier Series Representation"));
  const formTabs = element("div", undefined, "plot-controls");
  const formButtons: Record<FormTab, HTMLButtonElement> = {
    trig: element("button", "Trigonometric"),
    compact: element("button", "Compact Cosine"),
    complex: element("button", "Complex Exponential"),
  };
  (Object.entries(formButtons) as Array<[FormTab, HTMLButtonElement]>).forEach(([tab, b]) => {
    b.type = "button";
    b.addEventListener("click", () => {
      activeFormTab = tab;
      updateSeriesLatexPanel();
    });
    formTabs.append(b);
  });

  const seriesShowMathBtn = element("button", "Show Math", "s3-keypad-toggle");
  seriesShowMathBtn.type = "button";
  seriesShowMathBtn.addEventListener("click", () => {
    showSeriesMath = !showSeriesMath;
    seriesShowMathBtn.classList.toggle("active", showSeriesMath);
    seriesShowMathBtn.textContent = showSeriesMath ? "Hide Math" : "Show Math";
    seriesStepsList.hidden = !showSeriesMath;
    updateSeriesLatexPanel();
  });

  const inspectWrap = element("div", undefined, "s3-inspect-inline");
  const inspectLab = element("label", "Inspect n =");
  inspectLab.htmlFor = "s3-inspect-n";
  const inspectIn = element("input");
  inspectIn.id = "s3-inspect-n";
  inspectIn.type = "number";
  inspectIn.min = "0";
  inspectIn.step = "1";
  inspectIn.value = String(model.series.inspectN);
  inspectIn.addEventListener("input", () => {
    const v = inspectIn.valueAsNumber;
    if (!Number.isFinite(v)) return;
    const n = Math.max(0, Math.round(v));
    model = { ...model, series: { ...model.series, inspectN: n } };
    if (
      currentSeriesAnalysis &&
      model.series.inputKind === "preset" &&
      (model.series.periodStart ?? 0) === 0 &&
      (model.series.continuation ?? "periodic") === "periodic"
    ) {
      const inspected = inspectSingleHarmonic(model.series, n);
      const signIm = inspected.cPosIm >= 0 ? `+ ${fmt(inspected.cPosIm)}` : `- ${fmt(Math.abs(inspected.cPosIm))}`;
      const tex = n === 0
        ? String.raw`n = 0:\quad a_0 = C_0 = c_0 = ${fmt(inspected.an)}`
        : String.raw`n = ${n}:\quad a_{${n}} = ${fmt(inspected.an)},\; b_{${n}} = ${fmt(inspected.bn)},\; C_{${n}} = ${fmt(inspected.cnMag)},\; \theta_{${n}} = ${fmt(inspected.thetaN)}\text{ rad},\; c_{${n}} = ${fmt(inspected.cPosRe)} ${signIm}j`;
      if (lastLatexBundle) {
        lastLatexBundle = { ...lastLatexBundle, inspectedTerm: tex };
        renderLatex(inspectedTermBox, tex, false);
      }
    } else {
      scheduleRun(100);
    }
  });
  inspectWrap.append(inspectLab, inspectIn);
  const seriesHeadActions = element("div", undefined, "s3-studio-actions");
  seriesHeadActions.append(formTabs, seriesShowMathBtn, inspectWrap);
  latexHeader.append(seriesHeadActions);

  const generalLatexBox = element("div", undefined, "s3-math-block s3-math-hero");
  const inspectedTermBox = element("div", undefined, "s3-math-block");
  const seriesStepsList = element("div", undefined, "s3-steps-list");
  seriesStepsList.hidden = true;
  latexCard.append(latexHeader, generalLatexBox, inspectedTermBox, seriesStepsList);

  // Row 4: Spectra (Magnitude/Phase/Both + Tabular Values) & Epicycle Phasors
  const dualRow = element("div", undefined, "s3-dual-grid");

  const spectraCard = element("section", undefined, "panel s3-side-card");
  const specHead = element("div", undefined, "s3-card-head");
  specHead.append(element("h3", "Harmonic Spectrum"));

  const specHeadRight = element("div", undefined, "s3-studio-actions");
  const specViewTabs = element("div", undefined, "s3-seg-tabs");
  const specViewBtns: Record<"magnitude" | "phase" | "both", HTMLButtonElement> = {
    magnitude: element("button", "Magnitude"),
    phase: element("button", "Phase"),
    both: element("button", "Both"),
  };
  (Object.entries(specViewBtns) as Array<["magnitude" | "phase" | "both", HTMLButtonElement]>).forEach(([v, b]) => {
    b.type = "button";
    b.addEventListener("click", () => {
      spectrumView = v;
      syncSpectrumView();
      updateSpectrumPlots();
    });
    specViewTabs.append(b);
  });

  const specTableBtn = element("button", "Table", "s3-keypad-toggle");
  specTableBtn.type = "button";
  specTableBtn.addEventListener("click", () => {
    showSpecTable = !showSpecTable;
    syncSpectrumView();
    updateSpectrumTable();
  });
  specHeadRight.append(specViewTabs, specTableBtn);
  specHead.append(specHeadRight);

  const specControls = element("div", undefined, "plot-controls");
  const oneSideBtn = element("button", "One-sided |C_n|");
  oneSideBtn.type = "button";
  oneSideBtn.classList.add("active");
  const twoSideBtn = element("button", "Two-sided |c_n|");
  twoSideBtn.type = "button";
  const linScaleBtn = element("button", "Linear");
  linScaleBtn.type = "button";
  linScaleBtn.classList.add("active");
  const dbScaleBtn = element("button", "dB");
  dbScaleBtn.type = "button";

  oneSideBtn.addEventListener("click", () => {
    spectrumSides = "one";
    oneSideBtn.classList.add("active");
    twoSideBtn.classList.remove("active");
    updateSpectrumPlots();
    updateSpectrumTable();
  });
  twoSideBtn.addEventListener("click", () => {
    spectrumSides = "two";
    twoSideBtn.classList.add("active");
    oneSideBtn.classList.remove("active");
    updateSpectrumPlots();
    updateSpectrumTable();
  });
  linScaleBtn.addEventListener("click", () => {
    spectrumScale = "linear";
    linScaleBtn.classList.add("active");
    dbScaleBtn.classList.remove("active");
    updateSpectrumPlots();
    updateSpectrumTable();
  });
  dbScaleBtn.addEventListener("click", () => {
    spectrumScale = "db";
    dbScaleBtn.classList.add("active");
    linScaleBtn.classList.remove("active");
    updateSpectrumPlots();
    updateSpectrumTable();
  });
  specControls.append(oneSideBtn, twoSideBtn, linScaleBtn, dbScaleBtn);

  const spectrumPlot = createScientificPlot({ title: "Magnitude", xLabel: "Frequency (Hz)", yLabel: "Amplitude" });
  const phasePlot = createScientificPlot({ title: "Phase", xLabel: "Frequency (Hz)", yLabel: "Phase (rad)" });
  const specTableWrap = element("div", undefined, "s3-spec-table-wrap");
  specTableWrap.hidden = true;

  function syncSpectrumView() {
    (Object.entries(specViewBtns) as Array<["magnitude" | "phase" | "both", HTMLButtonElement]>).forEach(([v, b]) => {
      b.classList.toggle("active", v === spectrumView);
    });
    specTableBtn.classList.toggle("active", showSpecTable);
    spectrumPlot.root.hidden = spectrumView === "phase";
    phasePlot.root.hidden = spectrumView === "magnitude";
    specTableWrap.hidden = !showSpecTable;
    linScaleBtn.hidden = spectrumView === "phase" && !showSpecTable;
    dbScaleBtn.hidden = spectrumView === "phase" && !showSpecTable;
  }
  syncSpectrumView();

  spectraCard.append(specHead, specControls, spectrumPlot.root, phasePlot.root, specTableWrap);

  const seriesEpicycleView = createSeriesEpicycleView();
  dualRow.append(spectraCard, seriesEpicycleView.root);

  seriesSection.append(studio.root, waveWorkspace, latexCard, dualRow);

  // ============================================================================
  // TAB 2: FOURIER SERIES DRAWING
  // ============================================================================
  const epiSection = element("div", undefined, "workspace s3-workspace");
  const epiControls = element("section", undefined, "panel s3-control-group");
  const epiHead = element("div", undefined, "s3-card-head");
  epiHead.append(element("h2", "Fourier Series Drawing"));
  const epiShowMathBtn = element("button", "Show Math", "s3-keypad-toggle");
  epiShowMathBtn.type = "button";
  epiHead.append(epiShowMathBtn);

  const shapeSel = makeSelect("Closed contour", [
    ...epicycleShapeCatalog.map(s => ({ value: s.id, label: s.label })),
    { value: "custom", label: "Draw custom shape" },
  ], model.epicycles.shapeId, val => {
    const id = val as EpicycleShapeId;
    model = { ...model, epicycles: { ...model.epicycles, shapeId: id } };
    if (id === "custom") {
      epicyclesView.enterDrawMode();
    } else {
      scheduleRun(20);
    }
  });

  const epiHarmBox = element("div", undefined, "field");
  const epiHarmLabel = element("label", `Harmonics K = ${model.epicycles.harmonics} (${2 * model.epicycles.harmonics + 1} rotating terms)`);
  epiHarmLabel.htmlFor = "s3-epi-k";
  const epiHarmSlider = element("input");
  epiHarmSlider.id = "s3-epi-k";
  epiHarmSlider.type = "range";
  epiHarmSlider.min = "1";
  epiHarmSlider.max = String(maxEpicycleHarmonics);
  epiHarmSlider.value = String(model.epicycles.harmonics);
  epiHarmSlider.addEventListener("input", () => {
    const k = Number(epiHarmSlider.value);
    epiHarmLabel.textContent = `Harmonics K = ${k} (${2 * k + 1} rotating terms)`;
    model = { ...model, epicycles: { ...model.epicycles, harmonics: k } };
    scheduleRun(40);
  });
  epiHarmBox.append(epiHarmLabel, epiHarmSlider);

  const redrawBtn = element("button", "Draw custom loop");
  redrawBtn.type = "button";
  redrawBtn.addEventListener("click", () => {
    shapeSel.select.value = "custom";
    model = { ...model, epicycles: { ...model.epicycles, shapeId: "custom" } };
    epicyclesView.enterDrawMode();
  });

  const epiLatexBox = element("div", undefined, "s3-math-block");
  const epiStepsList = element("div", undefined, "s3-steps-list");
  epiStepsList.hidden = true;
  let lastEpiSteps: readonly MathStep[] = [];
  let lastEpiAnalysis: EpicyclesAnalysis | undefined;

  function renderEpicycleMathPanel() {
    const steps: MathStep[] = lastEpiAnalysis
      ? [...lastEpiSteps, buildEpicycleApproximationStep(model.epicycles, lastEpiAnalysis)]
      : [...lastEpiSteps];
    renderStepsContainer(epiStepsList, steps);
    if (!lastEpiAnalysis) return;
    const item = element("div", undefined, "s3-step-item");
    const kMax = lastEpiAnalysis.terms.reduce((acc, t) => Math.max(acc, Math.abs(t.k)), 0);
    const head = element(
      "div",
      `${steps.length + 1}. Constituent Phasor Vectors (${lastEpiAnalysis.terms.length} vectors up to K = ${kMax})`,
      "s3-step-title",
    );
    const formula = element("div", undefined, "s3-step-math");
    renderLatex(
      formula,
      String.raw`\vec{v}_k(t) = c_k e^{j 2\pi k t} = (c_{k,x} + j\,c_{k,y})\,e^{j 2\pi k t}, \quad k \in [-${kMax},\, ${kMax}]`,
      true,
    );
    const wrap = element("div", undefined, "s3-spec-table-wrap");
    const table = element("table", undefined, "s3-spec-table");
    const thead = document.createElement("thead");
    const hRow = document.createElement("tr");
    for (const label of ["#", "k", "c_k (x + jy)", "|c_k|", "∠c_k (rad)", "Angle (°)"]) {
      hRow.append(element("th", label));
    }
    thead.append(hRow);
    const tbody = document.createElement("tbody");
    lastEpiAnalysis.terms.forEach((term, idx) => {
      const tr = document.createElement("tr");
      const imAbs = fmt(Math.abs(term.im));
      const sign = term.im < -1e-10 ? "-" : "+";
      const kLabel = term.k > 0 ? `+${term.k}` : String(term.k);
      const deg = (term.phase * 180) / Math.PI;
      tr.append(
        element("td", String(idx + 1)),
        element("td", kLabel),
        element("td", `${fmt(term.re)} ${sign} ${imAbs}j`),
        element("td", fmt(term.radius)),
        element("td", fmt(term.phase)),
        element("td", `${fmt(deg)}°`),
      );
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    item.append(head, formula, wrap);
    epiStepsList.append(item);
  }

  epiShowMathBtn.addEventListener("click", () => {
    showEpiMath = !showEpiMath;
    epiShowMathBtn.classList.toggle("active", showEpiMath);
    epiShowMathBtn.textContent = showEpiMath ? "Hide Math" : "Show Math";
    epiStepsList.hidden = !showEpiMath;
    if (showEpiMath) renderEpicycleMathPanel();
  });

  epiControls.append(epiHead, shapeSel.root, epiHarmBox, redrawBtn, epiLatexBox, epiStepsList);

  const epiCanvasPanel = element("section", undefined, "panel");
  const epicyclesView = createEpicyclesView(pts => {
    model = { ...model, epicycles: { ...model.epicycles, shapeId: "custom", customPath: pts } };
    scheduleRun(10);
  });
  epiCanvasPanel.append(epicyclesView.root);
  epiSection.append(epiControls, epiCanvasPanel);

  // ============================================================================
  // TAB 3: FOURIER TRANSFORM (Function + Piecewise Builder + Pairs + Spectra Choice)
  // ============================================================================
  const tfSection = element("div", undefined, "s3-section");

  const tfTopWorkspace = element("div", undefined, "workspace s3-workspace s3-tf-workspace");
  const tfControls = element("section", undefined, "panel s3-control-group");
  const tfControlsHead = element("div", undefined, "s3-card-head");
  tfControlsHead.append(element("h2", "Input Signal x(t)"));
  const tfKeypadToggle = element("button", "Keypad", "s3-keypad-toggle");
  tfKeypadToggle.type = "button";
  tfControlsHead.append(tfKeypadToggle);

  let tfSelectAllOnNextFocus = model.transform.signalId !== "custom";
  let tfPendingMouseSelect = false;
  let tfMouseDownX = 0;
  let tfActiveInput: HTMLInputElement | undefined;
  let tfShowPiecewiseRows = false;
  let tfPiecewiseSegments: PiecewiseSegment[] = [
    { start: -1, end: 0, expr: "1 + t" },
    { start: 0, end: 1, expr: "1 - t" },
  ];

  const tfExprBar = element("div", undefined, "s3-expr-bar");
  const tfExprInput = element("input");
  tfExprInput.id = "tf-expr";
  tfExprInput.type = "text";
  tfExprInput.className = "s3-expr-input";
  tfExprInput.value = canonicalTransformExpr(model.transform);
  tfExprInput.placeholder = "e.g. exp(-abs(t)), rect(t), or {-1<=t<0: 1+t, 0}";
  if (tfSelectAllOnNextFocus) tfExprInput.dataset.replaceAll = "true";
  tfExprInput.setAttribute("aria-label", "Fourier transform input expression x(t)");
  tfActiveInput = tfExprInput;

  const tfValid = element("span", "✓", "s3-valid-mark ok");
  const tfClearBtn = element("button", "Clear", "s3-clear-btn");
  tfClearBtn.type = "button";
  tfExprBar.append(element("span", "x(t) =", "s3-expr-prefix"), tfExprInput, tfValid, tfClearBtn);

  const tfPreviewMath = element("div", undefined, "s3-formula-preview");
  const tfExprErr = element("p", "", "s3-inline-err");
  const tfKeypad = createMathKeypad(() => tfActiveInput);
  tfKeypadToggle.addEventListener("click", () => {
    const open = tfKeypad.toggle();
    tfKeypadToggle.classList.toggle("active", open);
  });

  const tfChipRow = element("div", undefined, "s3-chip-row");
  const tfPresetBtns = new Map<Exclude<TransformSignalId, "custom">, HTMLButtonElement>();
  for (const p of TRANSFORM_PRESET_CHIPS) {
    const b = element("button", p.label, "s3-chip");
    b.type = "button";
    b.addEventListener("click", () => {
      tfShowPiecewiseRows = false;
      model = { ...model, transform: { ...model.transform, signalId: p.id } };
      tfExprInput.value = canonicalTransformExpr(model.transform);
      tfSelectAllOnNextFocus = true;
      tfExprInput.dataset.replaceAll = "true";
      syncVisibility();
      tfTimePlot.refresh();
      scheduleRun(30);
    });
    tfPresetBtns.set(p.id, b);
    tfChipRow.append(b);
  }
  const tfCustomBtns = new Map<string, HTMLButtonElement>();
  for (const ex of TRANSFORM_CUSTOM_CHIPS) {
    const b = element("button", ex.label, "s3-chip");
    b.type = "button";
    b.addEventListener("click", () => {
      tfShowPiecewiseRows = false;
      tfExprInput.value = ex.expr;
      tfSelectAllOnNextFocus = true;
      tfExprInput.dataset.replaceAll = "true";
      model = {
        ...model,
        transform: {
          ...model.transform,
          signalId: "custom",
          customExpr: ex.expr,
          timeMin: ex.timeMin,
          timeMax: ex.timeMax,
        },
      };
      syncVisibility();
      tfTimePlot.refresh();
      scheduleRun(30);
    });
    tfCustomBtns.set(ex.expr, b);
    tfChipRow.append(b);
  }

  // Transform Interactive Piecewise Interval Rows (matching Series)
  const tfPwToggleRow = element("div", undefined, "plot-controls");
  const tfPwExpandBtn = element("button", "+ Piecewise intervals");
  tfPwExpandBtn.type = "button";
  const tfPwWrap = element("div", undefined, "s3-subpanel");
  const tfSegList = element("div", undefined, "s3-seg-list");
  const tfAddSegBtn = element("button", "+ Add interval");
  tfAddSegBtn.type = "button";

  function applyTfPiecewiseSegments(segs: PiecewiseSegment[], delayMs = 120) {
    tfPiecewiseSegments = segs;
    const braceExpr = tfSegmentsToBraceExpr(segs);
    tfExprInput.value = braceExpr;
    tfSelectAllOnNextFocus = false;
    delete tfExprInput.dataset.replaceAll;
    model = {
      ...model,
      transform: { ...model.transform, signalId: "custom", customExpr: braceExpr },
    };
    updateTfExprPreview();
    tfTimePlot.refresh();
    scheduleRun(segs.some(s => s.expr.trim() === "") ? 0 : delayMs);
  }

  function renderTfPiecewiseRows() {
    tfSegList.replaceChildren();
    tfPiecewiseSegments.forEach((seg, idx) => {
      const row = element("div", undefined, "s3-seg-row");
      const sIn = element("input");
      sIn.type = "number"; sIn.step = "any"; sIn.value = String(seg.start); sIn.ariaLabel = `Transform segment ${idx + 1} start`;
      const eIn = element("input");
      eIn.type = "number"; eIn.step = "any"; eIn.value = String(seg.end); eIn.ariaLabel = `Transform segment ${idx + 1} end`;
      const exIn = element("input");
      exIn.type = "text"; exIn.value = seg.expr; exIn.ariaLabel = `Transform segment ${idx + 1} expression`;
      exIn.addEventListener("focus", () => { tfActiveInput = exIn; });

      const del = element("button", "×");
      del.type = "button";
      del.title = "Remove interval";
      const onRowEdit = () => {
        const next = tfPiecewiseSegments.map((item, i) =>
          i === idx ? { start: Number(sIn.value), end: Number(eIn.value), expr: exIn.value } : item,
        );
        applyTfPiecewiseSegments(next, 130);
      };
      sIn.addEventListener("input", onRowEdit);
      eIn.addEventListener("input", onRowEdit);
      exIn.addEventListener("input", onRowEdit);
      del.addEventListener("click", () => {
        if (tfPiecewiseSegments.length <= 1) return;
        const next = tfPiecewiseSegments.filter((_, i) => i !== idx);
        applyTfPiecewiseSegments(next, 70);
        renderTfPiecewiseRows();
      });
      row.append(sIn, element("span", "≤ t <"), eIn, exIn, del);
      tfSegList.append(row);
    });
  }

  tfPwExpandBtn.addEventListener("click", () => {
    tfShowPiecewiseRows = !tfShowPiecewiseRows;
    if (tfShowPiecewiseRows) {
      const parsed = parseTfBraceToSegments(tfExprInput.value);
      if (parsed) {
        tfPiecewiseSegments = parsed;
      } else if (model.transform.signalId === "custom" && tfExprInput.value.trim() !== "" && tfExprInput.value.trim() !== "0" && !tfExprInput.value.trim().startsWith("{")) {
        tfPiecewiseSegments = [{ start: -1, end: 1, expr: tfExprInput.value.trim() }];
      }
      renderTfPiecewiseRows();
      applyTfPiecewiseSegments(tfPiecewiseSegments, 40);
    }
    syncVisibility();
  });

  tfAddSegBtn.addEventListener("click", () => {
    const lastEnd = tfPiecewiseSegments.length > 0 ? tfPiecewiseSegments[tfPiecewiseSegments.length - 1]!.end : 1;
    const next = [...tfPiecewiseSegments, { start: lastEnd, end: lastEnd + 1, expr: "0" }];
    applyTfPiecewiseSegments(next, 80);
    renderTfPiecewiseRows();
    syncVisibility();
  });

  tfPwToggleRow.append(tfPwExpandBtn);
  tfPwWrap.append(tfSegList, tfAddSegBtn);
  tfPwWrap.hidden = true;
  renderTfPiecewiseRows();

  const tfParamGrid = element("div", undefined, "s3-param-row");
  const syncTfFormulaFromParams = () => {
    tfExprInput.value = canonicalTransformExpr(model.transform);
    tfSelectAllOnNextFocus = true;
    tfExprInput.dataset.replaceAll = "true";
    updateTfExprPreview();
  };
  const tfAmp = makeNumberField("tf-amp", "Amplitude A", "V", model.transform.amplitude, v => {
    model = { ...model, transform: { ...model.transform, amplitude: v } };
    syncTfFormulaFromParams();
    tfTimePlot.refresh();
    scheduleRun(50);
  });
  const tfWidth = makeNumberField("tf-width", "Width τ / σ", "s", model.transform.width, v => {
    model = { ...model, transform: { ...model.transform, width: v } };
    syncTfFormulaFromParams();
    tfTimePlot.refresh();
    scheduleRun(50);
  });
  const tfShift = makeNumberField("tf-shift", "Time shift t₀", "s", model.transform.shift, v => {
    model = { ...model, transform: { ...model.transform, shift: v } };
    syncTfFormulaFromParams();
    tfTimePlot.refresh();
    scheduleRun(50);
  });
  const tfMod = makeNumberField("tf-mod", "Carrier f₀", "Hz", model.transform.modFreqHz, v => {
    model = { ...model, transform: { ...model.transform, modFreqHz: v } };
    syncTfFormulaFromParams();
    tfTimePlot.refresh();
    scheduleRun(50);
  });
  const tfDecay = makeNumberField("tf-decay", "Decay rate a", "s⁻¹", model.transform.decayRate, v => {
    model = { ...model, transform: { ...model.transform, decayRate: v } };
    syncTfFormulaFromParams();
    tfTimePlot.refresh();
    scheduleRun(50);
  });
  tfParamGrid.append(tfAmp.root, tfWidth.root, tfShift.root, tfMod.root, tfDecay.root);

  function updateTfExprPreview() {
    if (tfShowPiecewiseRows) {
      try {
        for (const s of tfPiecewiseSegments) {
          if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start) {
            throw new Error("Each interval requires end > start.");
          }
          if (s.expr.trim() !== "") compileExpression(s.expr);
        }
        const rows = tfPiecewiseSegments
          .map(s => `${s.expr.trim() === "" ? "\\_" : expressionToLatex(s.expr)}, & ${fmt(s.start)} \\le t < ${fmt(s.end)}`)
          .join(String.raw` \\ `);
        renderLatex(tfPreviewMath, String.raw`x(t) = \begin{cases} ${rows} \\ 0, & \text{else} \end{cases}`, false);
        const hasEmpty = tfPiecewiseSegments.some(s => s.expr.trim() === "");
        tfValid.textContent = hasEmpty ? "" : "✓";
        tfValid.className = hasEmpty ? "s3-valid-mark" : "s3-valid-mark ok";
        tfExprErr.textContent = "";
      } catch (e) {
        tfValid.textContent = "!";
        tfValid.className = "s3-valid-mark err";
        tfExprErr.textContent = e instanceof Error ? e.message : "Syntax error";
      }
      return;
    }
    if (tfExprInput.value.trim() === "") {
      tfValid.textContent = "";
      tfValid.className = "s3-valid-mark";
      tfExprErr.textContent = "";
      renderLatex(tfPreviewMath, String.raw`x(t) = \;`, false);
      return;
    }
    try {
      compileExpression(tfExprInput.value);
      tfValid.textContent = "✓";
      tfValid.className = "s3-valid-mark ok";
      tfExprErr.textContent = "";
      renderLatex(tfPreviewMath, `x(t) = ${expressionToLatex(tfExprInput.value)}`, false);
    } catch (e) {
      tfValid.textContent = "!";
      tfValid.className = "s3-valid-mark err";
      tfExprErr.textContent = e instanceof Error ? e.message : "Syntax error";
    }
  }

  tfClearBtn.addEventListener("click", () => {
    tfShowPiecewiseRows = false;
    tfSelectAllOnNextFocus = false;
    delete tfExprInput.dataset.replaceAll;
    tfExprInput.value = "";
    model = { ...model, transform: { ...model.transform, signalId: "custom", customExpr: "" } };
    syncVisibility();
    tfTimePlot.refresh();
    tfExprInput.focus();
    scheduleRun(0);
  });

  tfExprInput.addEventListener("mousedown", e => {
    tfMouseDownX = e.clientX;
    if (document.activeElement === tfExprInput) {
      tfSelectAllOnNextFocus = false;
      delete tfExprInput.dataset.replaceAll;
    }
  });
  tfExprInput.addEventListener("focus", () => {
    tfActiveInput = tfExprInput;
    if ((tfSelectAllOnNextFocus || tfExprInput.value.trim() === "0") && tfExprInput.value.length > 0) {
      tfExprInput.select();
      tfPendingMouseSelect = true;
      tfSelectAllOnNextFocus = false;
    }
  });
  tfExprInput.addEventListener("mouseup", e => {
    if (tfPendingMouseSelect) {
      tfPendingMouseSelect = false;
      if (Math.abs(e.clientX - tfMouseDownX) < 4) {
        e.preventDefault();
      }
    }
  });
  tfExprInput.addEventListener("input", () => {
    tfShowPiecewiseRows = false;
    tfSelectAllOnNextFocus = false;
    delete tfExprInput.dataset.replaceAll;
    model = { ...model, transform: { ...model.transform, signalId: "custom", customExpr: tfExprInput.value } };
    syncVisibility();
    tfTimePlot.refresh();
    scheduleRun(tfExprInput.value.trim() === "" ? 0 : 130);
  });

  tfControls.append(tfControlsHead, tfExprBar, tfPreviewMath, tfExprErr, tfChipRow, tfParamGrid, tfPwToggleRow, tfPwWrap, tfKeypad.root);

  const tfInputPlotCard = element("section", undefined, "panel");
  const tfTimePlot = createDesmosPlot({
    title: "Input Signal x(t) (Before Transform)",
    xLabel: "Time t (s)",
    yLabel: "Amplitude (V)",
    initialXMin: model.transform.timeMin,
    initialXMax: model.transform.timeMax,
    onViewportChange(xMin, xMax) {
      if (model.transform.signalId === "custom" && model.transform.customExpr.trim() === "") return [];
      try {
        const res = sampleTransformTime({ ...model.transform, timeMin: xMin, timeMax: xMax }, model.sampleCount);
        const traces: DesmosTrace[] = [
          { label: "x(t)", mode: "line", values: res.timeSamples, xStart: xMin, xStep: res.timeStep },
        ];
        if (tfShowIftOverlay) {
          const ift = sampleInverseTransformBandwidth(model.transform, tfIftBandwidthHz, xMin, xMax, model.sampleCount);
          traces.push({ label: `x_B(t) (B=${tfIftBandwidthHz.toFixed(1)} Hz)`, mode: "line", dashed: true, values: ift, xStart: xMin, xStep: res.timeStep });
        }
        return traces;
      } catch {
        return [];
      }
    },
  });
  tfInputPlotCard.append(tfTimePlot.root);
  tfTopWorkspace.append(tfControls, tfInputPlotCard);

  // Middle: Transform Pair LaTeX + Show Math + Inspect f
  const tfLatexCard = element("section", undefined, "panel s3-latex-panel");
  const tfLatexHeader = element("div", undefined, "s3-latex-header");
  tfLatexHeader.append(element("h2", "Fourier Transform Pair"));

  const tfLatexActions = element("div", undefined, "s3-studio-actions");
  const tfShowMathBtn = element("button", "Show Math", "s3-keypad-toggle");
  tfShowMathBtn.type = "button";

  const tfInspectWrap = element("div", undefined, "s3-inspect-inline");
  const tfInspectLab = element("label", "Inspect f =");
  tfInspectLab.htmlFor = "tf-inspect-f";
  const tfInspectIn = element("input");
  tfInspectIn.id = "tf-inspect-f";
  tfInspectIn.type = "number";
  tfInspectIn.step = "any";
  tfInspectIn.value = String(tfInspectF);
  const tfInspectUnit = element("span", "Hz", "muted");
  tfInspectWrap.append(tfInspectLab, tfInspectIn, tfInspectUnit);
  tfLatexActions.append(tfShowMathBtn, tfInspectWrap);
  tfLatexHeader.append(tfLatexActions);

  const tfPairBox = element("div", undefined, "s3-math-block s3-math-hero");
  const tfInspectBox = element("div", undefined, "s3-math-block");
  const tfStepsList = element("div", undefined, "s3-steps-list");
  tfStepsList.hidden = true;

  let lastTransformLatex: NonNullable<FourierOutput["transform"]>["latex"] | undefined;
  let lastTransformAnalysis: TransformAnalysis | undefined;

  function updateTfInspectBox() {
    if (model.transform.signalId === "custom" && model.transform.customExpr.trim() === "") return;
    try {
      const fQuery = tfAxisMode === "rad" ? tfInspectF / (2 * Math.PI) : tfInspectF;
      const val = inspectTransformFrequency(model.transform, fQuery);
      const imSign = val.im >= 0 ? `+ ${fmt(val.im)}` : `- ${fmt(Math.abs(val.im))}`;
      const argTex = tfAxisMode === "rad" ? `\\omega = ${fmt(tfInspectF)}\\text{ rad/s}` : `f = ${fmt(tfInspectF)}\\text{ Hz}`;
      const symTex = tfAxisMode === "rad" ? `X(${fmt(tfInspectF)})` : `X(${fmt(tfInspectF)})`;
      renderLatex(
        tfInspectBox,
        String.raw`${argTex}:\quad ${symTex} = ${fmt(val.re)} ${imSign}j,\quad |X| = ${fmt(val.mag)}\text{ V}\cdot\text{s},\quad \angle X = ${fmt(val.phase)}\text{ rad}`,
        false,
      );
    } catch {
      tfInspectBox.textContent = "";
    }
  }

  function updateTfLatexPanel() {
    if (!lastTransformLatex) return;
    const eq = tfAxisMode === "rad" ? lastTransformLatex.transformOmegaFormula : lastTransformLatex.transformFormula;
    renderLatex(tfPairBox, `${lastTransformLatex.signalFormula} \\quad\\Longleftrightarrow\\quad ${eq}`, true);
    if (showTfMath) {
      renderStepsContainer(tfStepsList, [
        ...lastTransformLatex.steps,
        buildTransformApproximationStep(model.transform, lastTransformAnalysis),
      ]);
    }
    updateTfInspectBox();
  }

  tfShowMathBtn.addEventListener("click", () => {
    showTfMath = !showTfMath;
    tfShowMathBtn.classList.toggle("active", showTfMath);
    tfShowMathBtn.textContent = showTfMath ? "Hide Math" : "Show Math";
    tfStepsList.hidden = !showTfMath;
    updateTfLatexPanel();
  });

  tfInspectIn.addEventListener("input", () => {
    const v = tfInspectIn.valueAsNumber;
    if (!Number.isFinite(v)) return;
    tfInspectF = v;
    updateTfInspectBox();
  });

  tfLatexCard.append(tfLatexHeader, tfPairBox, tfInspectBox, tfStepsList);

  // Bottom pair: Transform Spectrum Controls right next to Spectrum / Phase Choice
  const tfSpecWorkspace = element("div", undefined, "workspace s3-workspace");
  const tfSpecControls = element("section", undefined, "panel s3-control-group");
  tfSpecControls.append(element("h2", "Spectrum Settings"));

  const tfAxisSel = makeSelect("Frequency axis", [
    { value: "hz", label: "Frequency f (Hz)" },
    { value: "rad", label: "Angular ω (rad/s)" },
  ], tfAxisMode, val => {
    tfAxisMode = val as "hz" | "rad";
    tfInspectLab.textContent = tfAxisMode === "rad" ? "Inspect ω =" : "Inspect f =";
    tfInspectUnit.textContent = tfAxisMode === "rad" ? "rad/s" : "Hz";
    tfMagPlot.refresh();
    tfPhasePlot.refresh();
    updateTfLatexPanel();
  });

  const tfDispSel = makeSelect("Components", [
    { value: "mag-re", label: "|X| & Re{X}" },
    { value: "re-im", label: "Re{X} & Im{X}" },
  ], tfDisplayMode, val => {
    tfDisplayMode = val as "mag-re" | "re-im";
    tfMagPlot.refresh();
  });

  const tfIftBox = element("div", undefined, "s3-subpanel");
  const tfIftBtn = element("button", "IFT Overlay x_B(t): Off", "s3-keypad-toggle");
  tfIftBtn.type = "button";
  const tfBwWrap = element("div", undefined, "field");
  const tfBwLabel = element("label", `Bandwidth B = ${tfIftBandwidthHz.toFixed(1)} Hz`);
  tfBwLabel.htmlFor = "tf-bw";
  const tfBwSlider = element("input");
  tfBwSlider.id = "tf-bw";
  tfBwSlider.type = "range";
  tfBwSlider.min = "0.2";
  tfBwSlider.max = "10";
  tfBwSlider.step = "0.1";
  tfBwSlider.value = String(tfIftBandwidthHz);
  tfBwWrap.append(tfBwLabel, tfBwSlider);
  tfBwWrap.hidden = true;

  tfIftBtn.addEventListener("click", () => {
    tfShowIftOverlay = !tfShowIftOverlay;
    tfIftBtn.classList.toggle("active", tfShowIftOverlay);
    tfIftBtn.textContent = tfShowIftOverlay ? "IFT Overlay x_B(t): On" : "IFT Overlay x_B(t): Off";
    tfBwWrap.hidden = !tfShowIftOverlay;
    tfTimePlot.refresh();
  });
  tfBwSlider.addEventListener("input", () => {
    tfIftBandwidthHz = Number(tfBwSlider.value);
    tfBwLabel.textContent = `Bandwidth B = ${tfIftBandwidthHz.toFixed(1)} Hz`;
    tfTimePlot.refresh();
  });
  tfIftBox.append(tfIftBtn, tfBwWrap);

  const tfEnergyBox = element("div", undefined, "s3-metrics-list");
  tfSpecControls.append(tfAxisSel.root, tfDispSel.root, tfIftBox, tfEnergyBox);

  const tfPlotsPanel = element("section", undefined, "panel");
  const tfPlotsHead = element("div", undefined, "s3-card-head");
  tfPlotsHead.append(element("h3", "Transform Spectrum View"));
  const tfSpecViewTabs = element("div", undefined, "s3-seg-tabs");
  const tfSpecViewBtns: Record<"magnitude" | "phase" | "both", HTMLButtonElement> = {
    magnitude: element("button", "Magnitude"),
    phase: element("button", "Phase"),
    both: element("button", "Both"),
  };
  (Object.entries(tfSpecViewBtns) as Array<["magnitude" | "phase" | "both", HTMLButtonElement]>).forEach(([v, b]) => {
    b.type = "button";
    b.addEventListener("click", () => {
      tfSpecView = v;
      syncTfSpectrumView();
    });
    tfSpecViewTabs.append(b);
  });
  tfPlotsHead.append(tfSpecViewTabs);

  let tfSpecCacheKey = "";
  let tfSpecCacheVal: TransformAnalysis | undefined;
  function getTransformSpectrumCached(fMin: number, fMax: number): TransformAnalysis {
    const tf = model.transform;
    const key = `${tf.signalId}|${tf.amplitude}|${tf.width}|${tf.shift}|${tf.modFreqHz}|${tf.decayRate}|${tf.customExpr}|${fMin}|${fMax}|${model.sampleCount}`;
    if (tfSpecCacheKey === key && tfSpecCacheVal) return tfSpecCacheVal;
    const res = sampleTransformViewport({ ...tf, freqMin: fMin, freqMax: fMax }, model.sampleCount);
    tfSpecCacheKey = key;
    tfSpecCacheVal = res;
    return res;
  }

  const tfMagPlot = createDesmosPlot({
    title: "Continuous Transform Spectrum",
    xLabel: "Frequency (Hz or rad/s)",
    yLabel: "Spectral Density (V·s)",
    initialXMin: model.transform.freqMin,
    initialXMax: model.transform.freqMax,
    onViewportChange(xMin, xMax) {
      if (model.transform.signalId === "custom" && model.transform.customExpr.trim() === "") return [];
      try {
        const scale = tfAxisMode === "rad" ? 1 / (2 * Math.PI) : 1;
        const res = getTransformSpectrumCached(xMin * scale, xMax * scale);
        const step = (xMax - xMin) / Math.max(1, model.sampleCount - 1);
        if (tfDisplayMode === "mag-re") {
          return [
            { label: "|X|", mode: "line", values: res.freqMagnitude, xStart: xMin, xStep: step },
            { label: "Re{X}", mode: "line", dashed: true, values: res.freqReal, xStart: xMin, xStep: step },
          ];
        }
        return [
          { label: "Re{X}", mode: "line", values: res.freqReal, xStart: xMin, xStep: step },
          { label: "Im{X}", mode: "line", dashed: true, values: res.freqImag, xStart: xMin, xStep: step },
        ];
      } catch {
        return [];
      }
    },
  });
  const tfPhasePlot = createDesmosPlot({
    title: "Phase Spectrum ∠X",
    xLabel: "Frequency (Hz or rad/s)",
    yLabel: "Phase (rad)",
    initialXMin: model.transform.freqMin,
    initialXMax: model.transform.freqMax,
    onViewportChange(xMin, xMax) {
      if (model.transform.signalId === "custom" && model.transform.customExpr.trim() === "") return [];
      try {
        const scale = tfAxisMode === "rad" ? 1 / (2 * Math.PI) : 1;
        const res = getTransformSpectrumCached(xMin * scale, xMax * scale);
        const step = (xMax - xMin) / Math.max(1, model.sampleCount - 1);
        return [{ label: "∠X", mode: "line", values: res.freqPhase, xStart: xMin, xStep: step }];
      } catch {
        return [];
      }
    },
  });

  function syncTfSpectrumView() {
    (Object.entries(tfSpecViewBtns) as Array<["magnitude" | "phase" | "both", HTMLButtonElement]>).forEach(([v, b]) => {
      b.classList.toggle("active", v === tfSpecView);
    });
    tfMagPlot.root.hidden = tfSpecView === "phase";
    tfPhasePlot.root.hidden = tfSpecView === "magnitude";
    tfDispSel.root.hidden = tfSpecView === "phase";
  }
  syncTfSpectrumView();

  tfPlotsPanel.append(tfPlotsHead, tfMagPlot.root, tfPhasePlot.root);
  tfSpecWorkspace.append(tfSpecControls, tfPlotsPanel);

  tfSection.append(tfTopWorkspace, tfLatexCard, tfSpecWorkspace);

  root.append(header, modeTabs, diagList, seriesSection, epiSection, tfSection);

  let lastLatexBundle: NonNullable<FourierOutput["series"]>["latex"] | undefined;
  let lastSeriesStats: SeriesAnalysis | undefined;

  function updateSpectrumPlots() {
    if (!currentSeriesAnalysis) return;
    const H = currentSeriesAnalysis.harmonics;
    const f0 = currentSeriesAnalysis.fundamentalHz;
    const toScale = (v: number) => (spectrumScale === "db" ? 20 * Math.log10(Math.max(1e-5, v)) : v);

    if (spectrumSides === "one") {
      const mags = new Float64Array(H.length + 1);
      const phases = new Float64Array(H.length + 1);
      mags[0] = toScale(Math.abs(currentSeriesAnalysis.a0));
      phases[0] = currentSeriesAnalysis.a0 >= 0 ? 0 : Math.PI;
      for (let i = 0; i < H.length; i++) {
        mags[i + 1] = toScale(H[i]!.cnMag);
        phases[i + 1] = H[i]!.thetaN;
      }
      spectrumPlot.setTraces([{ label: spectrumScale === "db" ? "|C_n| (dB)" : "|C_n|", axis: { start: 0, step: f0 }, values: mags, mode: "stems" }]);
      phasePlot.setTraces([{ label: "θ_n", axis: { start: 0, step: f0 }, values: phases, mode: "stems" }]);
    } else {
      const N = H.length;
      const len = 2 * N + 1;
      const mags = new Float64Array(len);
      const phases = new Float64Array(len);
      mags[N] = toScale(Math.abs(currentSeriesAnalysis.a0));
      phases[N] = currentSeriesAnalysis.a0 >= 0 ? 0 : Math.PI;
      for (let k = 1; k <= N; k++) {
        const coef = H[k - 1]!;
        const cMag = Math.hypot(coef.cPosRe, coef.cPosIm);
        const cPhase = cMag > 1e-11 ? Math.atan2(coef.cPosIm, coef.cPosRe) : 0;
        mags[N + k] = toScale(cMag);
        phases[N + k] = cPhase;
        mags[N - k] = toScale(cMag);
        phases[N - k] = -cPhase;
      }
      spectrumPlot.setTraces([{ label: spectrumScale === "db" ? "|c_n| (dB)" : "|c_n|", axis: { start: -N * f0, step: f0 }, values: mags, mode: "stems" }]);
      phasePlot.setTraces([{ label: "∠c_n", axis: { start: -N * f0, step: f0 }, values: phases, mode: "stems" }]);
    }
  }

  function updateSpectrumTable() {
    if (!showSpecTable || !currentSeriesAnalysis) return;
    const H = currentSeriesAnalysis.harmonics;
    const f0 = currentSeriesAnalysis.fundamentalHz;
    const table = element("table", undefined, "s3-spec-table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const magHeader = spectrumSides === "one"
      ? (spectrumScale === "db" ? "|C_n| (dB)" : "|C_n| (V)")
      : (spectrumScale === "db" ? "|c_n| (dB)" : "|c_n| (V)");
    const phaseHeader = spectrumSides === "one" ? "∠C_n (rad)" : "∠c_n (rad)";
    for (const h of ["n", "f_n (Hz)", magHeader, phaseHeader, "Phase (°)"]) {
      const th = document.createElement("th");
      th.textContent = h;
      headRow.append(th);
    }
    thead.append(headRow);

    const tbody = document.createElement("tbody");
    const addRow = (n: number, freq: number, magRaw: number, phaseRad: number) => {
      const tr = document.createElement("tr");
      const magVal = spectrumScale === "db" ? 20 * Math.log10(Math.max(1e-5, magRaw)) : magRaw;
      const deg = (phaseRad * 180) / Math.PI;
      for (const cell of [String(n), fmt(freq), fmt(magVal), fmt(phaseRad), `${fmt(deg)}°`]) {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.append(td);
      }
      tbody.append(tr);
    };

    if (spectrumSides === "one") {
      addRow(0, 0, Math.abs(currentSeriesAnalysis.a0), currentSeriesAnalysis.a0 >= 0 ? 0 : Math.PI);
      for (const c of H) {
        addRow(c.n, c.n * f0, c.cnMag, c.thetaN);
      }
    } else {
      for (let i = H.length - 1; i >= 0; i--) {
        const c = H[i]!;
        const cMag = Math.hypot(c.cPosRe, c.cPosIm);
        const cPh = cMag > 1e-11 ? Math.atan2(c.cPosIm, c.cPosRe) : 0;
        addRow(-c.n, -c.n * f0, cMag, -cPh);
      }
      addRow(0, 0, Math.abs(currentSeriesAnalysis.a0), currentSeriesAnalysis.a0 >= 0 ? 0 : Math.PI);
      for (const c of H) {
        const cMag = Math.hypot(c.cPosRe, c.cPosIm);
        const cPh = cMag > 1e-11 ? Math.atan2(c.cPosIm, c.cPosRe) : 0;
        addRow(c.n, c.n * f0, cMag, cPh);
      }
    }

    table.append(thead, tbody);
    specTableWrap.replaceChildren(table);
  }

  function updateSeriesLatexPanel() {
    (Object.entries(formButtons) as Array<[FormTab, HTMLButtonElement]>).forEach(([tab, b]) => {
      b.classList.toggle("active", tab === activeFormTab);
    });
    if (!lastLatexBundle || !lastSeriesStats) return;
    const tex = activeFormTab === "trig"
      ? lastLatexBundle.trigonometricGeneral
      : activeFormTab === "compact"
        ? lastLatexBundle.compactGeneral
        : lastLatexBundle.complexGeneral;
    renderLatex(generalLatexBox, tex, true);
    renderLatex(inspectedTermBox, lastLatexBundle.inspectedTerm, false);
    if (showSeriesMath) {
      renderStepsContainer(seriesStepsList, [
        ...lastLatexBundle.steps[activeFormTab],
        buildSeriesApproximationStep(model.series, lastSeriesStats),
      ]);
    }

    const gibbs = lastSeriesStats.hasJumpDiscontinuity
      ? `${lastSeriesStats.gibbsOvershootPct.toFixed(2)}% (limit 8.95%)`
      : "0% (continuous)";
    metricsBox.replaceChildren(
      metricLine("f₀", `${fmt(lastSeriesStats.fundamentalHz)} Hz`),
      metricLine("Energy", `${lastSeriesStats.capturedPowerPct.toFixed(2)}%`),
      metricLine("RMS Error", `${fmt(lastSeriesStats.rmsError)} V`),
      metricLine("Gibbs", gibbs),
    );
  }

  function syncVisibility() {
    (Object.entries(modeButtons) as Array<[FourierModel["mode"], HTMLButtonElement]>).forEach(([m, btn]) => {
      const active = model.mode === m;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    seriesSection.hidden = model.mode !== "series";
    epiSection.hidden = model.mode !== "epicycles";
    tfSection.hidden = model.mode !== "transform";
    seriesEpicycleView.setActive(model.mode === "series");
    epicyclesView.setActive(model.mode === "epicycles");

    const tfKind = model.transform.signalId;
    tfParamGrid.hidden = tfKind === "custom";
    tfMod.root.hidden = tfKind !== "modulated-rect";
    tfDecay.root.hidden = tfKind !== "exponential";
    tfWidth.root.hidden = tfKind === "exponential" || tfKind === "custom";
    tfPwWrap.hidden = !tfShowPiecewiseRows;
    tfPwExpandBtn.classList.toggle("active", tfShowPiecewiseRows);
    tfPwExpandBtn.textContent = tfShowPiecewiseRows ? "− Hide piecewise rows" : "+ Piecewise intervals";
    tfPresetBtns.forEach((btn, id) => btn.classList.toggle("active", tfKind === id));
    tfCustomBtns.forEach((btn, expr) => btn.classList.toggle("active", tfKind === "custom" && model.transform.customExpr === expr));
    updateTfExprPreview();
  }

  function ensureWorker(): Worker {
    if (worker) return worker;
    worker = new Worker(new URL("./fourier.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<RunOutcome<FourierOutput>>) => {
      if (disposed) return;
      const outcome = event.data;
      const actualId = outcome.status === "success" ? outcome.provenance.runId : outcome.context.runId;
      if (actualId !== activeRunId) return;
      diagnostics(diagList, outcome.diagnostics.filter(d => d.severity === "error"));
      if (outcome.status !== "success") return;

      const { outputs } = outcome;
      if (outputs.mode === "series" && outputs.series) {
        currentSeriesAnalysis = outputs.series.analysis;
        lastSeriesStats = outputs.series.analysis;
        lastLatexBundle = outputs.series.latex;
        updateSeriesLatexPanel();
        seriesPlot.refresh();
        updateSpectrumPlots();
        updateSpectrumTable();
        seriesEpicycleView.setAnalysis(outputs.series.analysis);
      } else if (outputs.mode === "transform" && outputs.transform) {
        lastTransformLatex = outputs.transform.latex;
        lastTransformAnalysis = outputs.transform.analysis;
        updateTfLatexPanel();
        tfEnergyBox.replaceChildren(metricLine("Total Energy E", `${fmt(outputs.transform.analysis.totalEnergy)} V²·s`));
        tfTimePlot.refresh();
        tfMagPlot.refresh();
        tfPhasePlot.refresh();
      } else if (outputs.mode === "epicycles" && outputs.epicycles) {
        renderLatex(epiLatexBox, outputs.epicycles.latex, true);
        lastEpiAnalysis = outputs.epicycles.analysis;
        lastEpiSteps = outputs.epicycles.steps;
        if (showEpiMath) renderEpicycleMathPanel();
        epicyclesView.setAnalysis(outputs.epicycles.analysis);
      }
    };
    worker.onerror = () => {
      if (disposed) return;
      worker?.terminate();
      worker = undefined;
    };
    return worker;
  }

  function dispatchNow() {
    if (disposed) return;
    const isEmptySeriesExpr =
      model.mode === "series" &&
      model.series.inputKind === "expression" &&
      model.series.expression.trim() === "";
    const isEmptyPiecewise =
      model.mode === "series" &&
      model.series.inputKind === "piecewise" &&
      model.series.piecewiseSegments.some(s => s.expr.trim() === "");
    const isEmptyTfExpr =
      model.mode === "transform" &&
      model.transform.signalId === "custom" &&
      model.transform.customExpr.trim() === "";
    if (isEmptySeriesExpr || isEmptyPiecewise || isEmptyTfExpr) {
      diagnostics(diagList, []);
      return;
    }
    revision++;
    const runId = String(++runSeq);
    activeRunId = runId;
    const req: FourierWorkerRequest = {
      runId,
      modelRevision: String(revision),
      model,
      outputs: model.mode === "epicycles" ? ["epicycles"] : ["waveform", "spectrum"],
    };
    ensureWorker().postMessage(req);
  }

  function scheduleRun(delayMs: number) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(dispatchNow, delayMs);
  }

  syncVisibility();
  dispatchNow();

  return () => {
    disposed = true;
    clearTimeout(debounceTimer);
    worker?.terminate();
    studio.dispose();
    seriesPlot.dispose();
    spectrumPlot.dispose();
    phasePlot.dispose();
    seriesEpicycleView.dispose();
    tfTimePlot.dispose();
    tfMagPlot.dispose();
    tfPhasePlot.dispose();
    epicyclesView.dispose();
  };
}

function fmt(v: number): string {
  if (Math.abs(v) < 1e-10) return "0";
  return Number(v.toPrecision(4)).toString();
}

function metricLine(label: string, value: string): HTMLElement {
  const row = element("div", undefined, "s3-metric-row");
  row.append(element("span", label, "muted"), element("strong", value));
  return row;
}

function makeSelect(
  label: string,
  options: ReadonlyArray<{ value: string; label: string }>,
  initial: string,
  onChange: (value: string) => void,
) {
  const root = element("div", undefined, "field");
  const lab = element("label", label);
  const select = element("select");
  select.className = "s3-select";
  for (const opt of options) {
    const o = element("option", opt.label);
    o.value = opt.value;
    select.append(o);
  }
  select.value = initial;
  select.addEventListener("change", () => onChange(select.value));
  root.append(lab, select);
  return { root, select };
}

function makeNumberField(
  id: string,
  label: string,
  unit: string,
  initial: number,
  onValid: (val: number) => void,
) {
  const root = element("div", undefined, "field");
  const lab = element("label", label);
  lab.htmlFor = id;
  const box = element("div", undefined, "input-box");
  const input = element("input");
  input.id = id;
  input.type = "number";
  input.step = "any";
  input.value = String(initial);
  input.addEventListener("input", () => {
    const v = input.valueAsNumber;
    if (Number.isFinite(v)) {
      input.removeAttribute("aria-invalid");
      onValid(v);
    } else {
      input.setAttribute("aria-invalid", "true");
    }
  });
  box.append(input, element("span", unit));
  root.append(lab, box);
  return { root, input };
}
