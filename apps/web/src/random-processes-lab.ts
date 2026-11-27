import { createScientificPlot } from "./scientific-plot";
import { element } from "./ui";
import { renderMathText } from "./math-text";
import {
  analyzeProcesses, defaultProcessConfig, distributionsAt, processKinds, processLabels,
  validateProcessConfig, type ProcessAnalysis, type ProcessConfig, type ProcessKind,
} from "./random-processes";

type NumericKey = Exclude<keyof ProcessConfig, "kind">;
type NumericSpec = { key: NumericKey; label: string; unit: string; min: number; max: number; step: number };

const parameterSpecs: Partial<Record<ProcessKind, readonly NumericSpec[]>> = {
  "random-phase": [{ key: "amplitude", label: "Amplitude", unit: "V", min: 0.01, max: 10, step: 0.1 },
    { key: "cycles", label: "Cycles in record", unit: "cycles", min: 1, max: 32, step: 1 }],
  binary: [{ key: "amplitude", label: "Level", unit: "V", min: 0.01, max: 10, step: 0.1 }],
  gaussian: [{ key: "kernelWidth", label: "Correlation width", unit: "samples", min: 1, max: 12, step: 0.5 },
    { key: "randomOffsetStd", label: "Random mean spread", unit: "V", min: 0, max: 2, step: 0.05 }],
  "random-walk": [{ key: "amplitude", label: "Step size", unit: "V", min: 0.01, max: 10, step: 0.1 }],
  wiener: [{ key: "amplitude", label: "Diffusion scale", unit: "V/√sample", min: 0.01, max: 10, step: 0.1 }],
  "poisson": [{ key: "rate", label: "Event rate", unit: "events / sample", min: 0.005, max: 1, step: 0.005 }],
  "shot-noise": [{ key: "rate", label: "Event rate", unit: "events / sample", min: 0.005, max: 1, step: 0.005 },
    { key: "amplitude", label: "Pulse height", unit: "V", min: 0.01, max: 10, step: 0.1 }],
  markov: [{ key: "p00", label: "Transition probability \\(p_{00}\\)", unit: "probability", min: 0.02, max: 0.98, step: 0.01 },
    { key: "p11", label: "Transition probability \\(p_{11}\\)", unit: "probability", min: 0.02, max: 0.98, step: 0.01 }],
  ar1: [{ key: "phi", label: "AR coefficient \\(\\phi\\)", unit: "1", min: -0.95, max: 0.95, step: 0.01 }],
  ma: [{ key: "theta", label: "MA coefficient \\(\\theta\\)", unit: "1", min: -0.95, max: 0.95, step: 0.01 }],
  arma: [{ key: "phi", label: "AR coefficient \\(\\phi\\)", unit: "1", min: -0.95, max: 0.95, step: 0.01 },
    { key: "theta", label: "MA coefficient \\(\\theta\\)", unit: "1", min: -0.95, max: 0.95, step: 0.01 }],
  cyclostationary: [{ key: "period", label: "Variance period", unit: "samples", min: 16, max: 256, step: 1 }],
};

const format = (value: number) => Number(value.toPrecision(3)).toString();
const outputUnits: Record<ProcessKind, string> = {
  "random-phase": "V",
  binary: "V",
  gaussian: "V",
  "white-noise": "normalized",
  "random-walk": "V",
  wiener: "V",
  poisson: "event counts",
  "shot-noise": "V",
  markov: "state",
  ar1: "normalized",
  ma: "normalized",
  arma: "normalized",
  cyclostationary: "normalized",
};

type LoopTrace = { label: string; values: Float64Array };

function createLoopingSignalPlot(title: string, xLabel: string, yLabel: string) {
  const root = element("figure", undefined, "plot looping-signal-plot");
  const caption = element("figcaption");
  const summary = element("p", "Generate an ensemble to view repeated realizations.", "summary");
  const legend = element("ul", undefined, "plot-legend");
  caption.append(renderMathText(element("strong"), title), summary, legend);
  const canvas = element("canvas");
  canvas.setAttribute("role", "img");
  root.append(caption, canvas);
  let traces: readonly LoopTrace[] = [];
  let phase = 0;
  let speed = 1;
  let playing = false;
  let disposed = false;
  let frame = 0;
  let previousTime: number | undefined;
  let width = 0;
  let height = 0;
  let dpr = 1;
  const colors: string[] = [];
  const left = 58, right = 14, top = 12, bottom = 36;

  function draw() {
    if (disposed || !traces.length) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    width = bounds.width;
    height = bounds.height;
    dpr = Math.min(3, devicePixelRatio || 1);
    const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue("--muted").trim();
    const border = css.getPropertyValue("--border").trim();
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const count = traces[0]!.values.length;
    let low = Infinity, high = -Infinity;
    for (const trace of traces) for (const value of trace.values) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    if (low === high) { low -= 1; high += 1; }
    const padding = (high - low) * 0.08;
    low -= padding;
    high += padding;
    const y = (value: number) => top + (high - value) / (high - low) * plotHeight;

    context.font = "11px system-ui";
    context.lineWidth = 1;
    context.strokeStyle = border;
    context.fillStyle = muted;
    context.textAlign = "right";
    for (let tick = 0; tick <= 4; tick++) {
      const fraction = tick / 4;
      const py = top + fraction * plotHeight;
      context.beginPath();
      context.moveTo(left, py);
      context.lineTo(left + plotWidth, py);
      context.stroke();
      context.fillText(format(high - fraction * (high - low)), left - 7, py + 4);
    }
    context.textAlign = "center";
    for (let tick = 0; tick <= 4; tick++) {
      const fraction = tick / 4;
      const px = left + fraction * plotWidth;
      context.beginPath();
      context.moveTo(px, top);
      context.lineTo(px, top + plotHeight);
      context.stroke();
      context.fillText(format(fraction * count), px, height - 19);
    }
    context.textAlign = "center";
    context.fillText(`${xLabel} · looping record`, left + plotWidth / 2, height - 3);

    traces.forEach((trace, series) => {
      const values = trace.values;
      const offset = phase * values.length;
      context.strokeStyle = colors[series]!;
      context.lineWidth = 1.8;
      context.beginPath();
      for (let index = 0; index < values.length; index++) {
        const sample = (index + offset) % values.length;
        const before = Math.floor(sample);
        const after = (before + 1) % values.length;
        const fraction = sample - before;
        const value = values[before]! * (1 - fraction) + values[after]! * fraction;
        const px = left + index / (values.length - 1) * plotWidth;
        if (index === 0) context.moveTo(px, y(value));
        else context.lineTo(px, y(value));
      }
      context.stroke();
    });
  }

  function animate(time: number) {
    frame = 0;
    if (!playing || disposed || document.hidden) return;
    if (previousTime !== undefined) phase = (phase + (time - previousTime) * speed / 6000) % 1;
    previousTime = time;
    draw();
    frame = requestAnimationFrame(animate);
  }

  function start() {
    if (!playing || disposed || document.hidden || frame) return;
    previousTime = undefined;
    frame = requestAnimationFrame(animate);
  }
  const resize = new ResizeObserver(draw);
  resize.observe(canvas);
  function visibilityChanged() {
    previousTime = undefined;
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else start();
  }
  document.addEventListener("visibilitychange", visibilityChanged);

  return {
    root,
    setTraces(next: readonly LoopTrace[]) {
      traces = next.filter(trace => trace.values.length > 1);
      const palette = [getComputedStyle(document.documentElement).getPropertyValue("--trace").trim(),
        "#ad6a2c", "#8064ae", "#2878a0", "#9d527f", "#718337"];
      colors.splice(0, colors.length, ...traces.map((_, index) => palette[index % palette.length]!));
      summary.textContent = `${traces.length} realizations · continuously repeated sample record`;
      legend.replaceChildren(...traces.map(trace => element("li", trace.label)));
      canvas.setAttribute("aria-label",
        `${title}. ${traces.length} realizations loop continuously across the chart. ${xLabel}; ${yLabel}.`);
      draw();
    },
    play() {
      playing = true;
      start();
    },
    pause() {
      playing = false;
      previousTime = undefined;
      cancelAnimationFrame(frame);
      frame = 0;
    },
    reset() {
      phase = 0;
      draw();
    },
    setSpeed(next: number) {
      speed = next;
    },
    dispose() {
      disposed = true;
      playing = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      document.removeEventListener("visibilitychange", visibilityChanged);
    },
  };
}

function createScatterPlot(title: string, xLabel: string, yLabel: string) {
  const root = element("figure", undefined, "random-scatter");
  const caption = element("figcaption");
  const summary = element("p", "Generate an ensemble to view paired samples.", "summary");
  caption.append(renderMathText(element("strong"), title), summary);
  const canvas = element("canvas");
  canvas.setAttribute("role", "img");
  root.append(caption, canvas);
  let xValues: Float64Array<ArrayBufferLike> = new Float64Array();
  let yValues: Float64Array<ArrayBufferLike> = new Float64Array();
  const observer = new ResizeObserver(draw);

  function draw() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(bounds.width * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const style = getComputedStyle(document.documentElement);
    const left = 48, right = 12, top = 12, bottom = 38;
    const plotWidth = bounds.width - left - right, plotHeight = bounds.height - top - bottom;
    let low = Math.min(...xValues, ...yValues), high = Math.max(...xValues, ...yValues);
    if (!Number.isFinite(low) || low === high) { low = (Number.isFinite(low) ? low : 0) - 0.5; high = low + 1; }
    const padding = (high - low) * 0.08;
    low -= padding;
    high += padding;
    const px = (value: number) => left + (value - low) / (high - low) * plotWidth;
    const py = (value: number) => top + (high - value) / (high - low) * plotHeight;
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.font = "11px system-ui";
    context.lineWidth = 1;
    context.strokeStyle = style.getPropertyValue("--border").trim();
    context.fillStyle = style.getPropertyValue("--muted").trim();
    for (let tick = 0; tick <= 4; tick++) {
      const fraction = tick / 4;
      const x = left + fraction * plotWidth, y = top + fraction * plotHeight;
      context.beginPath(); context.moveTo(x, top); context.lineTo(x, top + plotHeight); context.stroke();
      context.beginPath(); context.moveTo(left, y); context.lineTo(left + plotWidth, y); context.stroke();
      context.textAlign = "center";
      context.fillText(format(low + fraction * (high - low)), x, bounds.height - 20);
      context.textAlign = "right";
      context.fillText(format(high - fraction * (high - low)), left - 6, y + 4);
    }
    context.fillStyle = style.getPropertyValue("--trace").trim();
    context.globalAlpha = 0.72;
    for (let index = 0; index < xValues.length; index++) {
      context.beginPath();
      context.arc(px(xValues[index]!), py(yValues[index]!), 3.2, 0, 2 * Math.PI);
      context.fill();
    }
    context.globalAlpha = 1;
    context.textAlign = "center";
    context.fillStyle = style.getPropertyValue("--muted").trim();
    context.fillText(xLabel, left + plotWidth / 2, bounds.height - 3);
    context.save();
    context.translate(12, top + plotHeight / 2);
    context.rotate(-Math.PI / 2);
    context.fillText(yLabel, 0, 0);
    context.restore();
  }
  observer.observe(canvas);
  return {
    root,
    setPoints(x: Float64Array, y: Float64Array, description: string) {
      if (x.length !== y.length || x.some(value => !Number.isFinite(value)) ||
          y.some(value => !Number.isFinite(value)))
        throw new RangeError("Joint PDF points must be finite and aligned.");
      xValues = x;
      yValues = y;
      summary.textContent = description;
      canvas.setAttribute("aria-label", `${title}. ${description}`);
      draw();
    },
    dispose() {
      observer.disconnect();
    },
  };
}

function createPlot(title: string, yLabel: string, xLabel = "Sample n") {
  return createScientificPlot({ title, xLabel, yLabel });
}

function symmetricValues(values: Float64Array) {
  const maxLag = values.length - 1;
  return {
    axis: { start: -maxLag, step: 1 },
    values: Float64Array.from({ length: 2 * maxLag + 1 },
      (_, index) => values[Math.abs(index - maxLag)]!),
  };
}

function createProperty(label: string) {
  const root = element("div", undefined, "random-property");
  root.append(renderMathText(element("span"), label));
  const value = element("strong", "—");
  root.append(value);
  return { root, set(text: string, passed?: boolean) {
    value.textContent = text;
    root.dataset.state = passed === undefined ? "info" : passed ? "pass" : "fail";
  } };
}

export function mountRandomProcessesLab(root: HTMLElement): () => void {
  let mounted = true;
  let currentAnalysis: ProcessAnalysis | undefined;
  const numericInputs = new Map<NumericKey, HTMLInputElement>();
  const numericErrors = new Map<NumericKey, HTMLElement>();
  let activeConfig: ProcessConfig | undefined;
  let pending = 0;

  const heading = element("header", undefined, "lab-heading random-heading");
  heading.append(element("span", "Chapter 1 · S6", "eyebrow"),
    element("h1", "Random processes"),
    element("p", "Parameter changes update the ensemble automatically. Compare statistics, correlation and convergence.",
      "lede"));

  const workspace = element("div", undefined, "random-workspace");
  const visual = element("section", undefined, "random-main");
  const sidebar = element("form", undefined, "panel random-sidebar");
  sidebar.noValidate = true;
  const selectorLabel = element("label", "Process model", "random-label");
  const selector = element("select");
  selector.id = "rp-process";
  selector.setAttribute("aria-label", "Process model");
  for (const kind of processKinds) {
    const option = element("option", processLabels[kind]);
    option.value = kind;
    selector.append(option);
  }
  selector.value = defaultProcessConfig.kind;
  selectorLabel.append(selector);
  sidebar.append(element("h2", "Parameters"), selectorLabel);

  function addNumberField(key: NumericKey, label: string, unit: string, min: number,
    max: number, step: number, parent: HTMLElement = sidebar) {
    const field = element("div", undefined, "random-field");
    const caption = renderMathText(element("label"), label);
    const input = element("input");
    const id = `rp-${key}`;
    input.id = id;
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(defaultProcessConfig[key]);
    caption.htmlFor = id;
    const line = element("div", undefined, "random-input");
    line.append(input, element("span", unit));
    const error = element("small");
    error.id = `${id}-error`;
    input.setAttribute("aria-describedby", error.id);
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      error.textContent = "";
      if (animationPlaying) setAnimation(false);
    });
    field.append(caption, line, error);
    parent.append(field);
    numericInputs.set(key, input);
    numericErrors.set(key, error);
  }

  addNumberField("sampleCount", "Samples \\(N\\)", "N", 128, 1024, 1);
  addNumberField("realizations", "Realizations", "paths", 4, 40, 1);
  addNumberField("lag", "Correlation lag \\(\\ell\\)", "samples", 1, 64, 1);
  addNumberField("seed", "Seed", "integer", 0, 2_147_483_647, 1);
  const specifics = element("div", undefined, "random-specifics");
  sidebar.append(specifics);

  function renderSpecifics() {
    specifics.replaceChildren();
    for (const spec of parameterSpecs[selector.value as ProcessKind] ?? [])
      addNumberField(spec.key, spec.label, spec.unit, spec.min, spec.max, spec.step, specifics);
  }
  renderSpecifics();
  const pdfTimeControl = element("div", undefined, "pdf-time-control");
  const pdfTimeHeading = element("div", undefined, "pdf-time-heading");
  const pdfTimeLabel = renderMathText(element("label"), "PDF sample \\(n\\)");
  const pdfTime = element("input");
  const initialPdfSample = Math.floor(defaultProcessConfig.sampleCount / 2);
  pdfTime.id = "rp-pdf-time";
  pdfTime.type = "range";
  pdfTime.min = "0";
  pdfTime.max = String(defaultProcessConfig.sampleCount - defaultProcessConfig.lag - 1);
  pdfTime.value = String(initialPdfSample);
  pdfTime.setAttribute("aria-label", "PDF sample position");
  pdfTimeLabel.htmlFor = pdfTime.id;
  const pdfTimeValue = element("output", `n = ${initialPdfSample}`);
  const pdfTimeHelp = element("span", "Select n for the first- and second-order PDFs.", "pdf-time-help");
  pdfTimeHelp.id = "rp-pdf-time-help";
  pdfTime.setAttribute("aria-describedby", pdfTimeHelp.id);
  pdfTimeHeading.append(pdfTimeLabel, pdfTimeValue);
  pdfTimeControl.append(pdfTimeHeading, pdfTime, pdfTimeHelp);
  sidebar.append(pdfTimeControl);

  selector.addEventListener("change", () => {
    if (animationPlaying) setAnimation(false);
    numericInputs.forEach((_, key) => {
      if (!["sampleCount", "realizations", "lag", "seed"].includes(key))
        numericInputs.delete(key);
    });
    numericErrors.forEach((_, key) => {
      if (!["sampleCount", "realizations", "lag", "seed"].includes(key))
        numericErrors.delete(key);
    });
    renderSpecifics();
    scheduleAnalysis();
  });

  const status = element("p", "Ready to generate an ensemble.", "random-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const actionRow = element("div", undefined, "random-actions");
  const generate = element("button", "Generate ensemble", "primary");
  generate.type = "submit";
  const reseed = element("button", "New seed");
  reseed.type = "button";
  const reset = element("button", "Reset");
  reset.type = "button";
  actionRow.append(generate, reseed, reset);
  sidebar.append(actionRow, status);

  function cancelPending() {
    if (!pending) return;
    clearTimeout(pending);
    pending = 0;
    generate.disabled = false;
  }

  const tabNames = ["Ensemble", "Statistics", "Correlation", "Stationarity & ergodicity"] as const;
  const tabIds = ["ensemble", "statistics", "correlation", "stationarity"] as const;
  const tablist = element("div", undefined, "random-tabs");
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "Process views");
  const transport = element("div", undefined, "random-transport");
  const playAnimation = element("button", "Play signals", "primary");
  playAnimation.type = "button";
  playAnimation.setAttribute("aria-pressed", "false");
  const restartAnimation = element("button", "Restart animation");
  restartAnimation.type = "button";
  const animationSpeed = element("select");
  animationSpeed.setAttribute("aria-label", "Animation speed");
  for (const speed of ["0.5", "1", "2", "4"]) {
    const option = element("option", `${speed}×`);
    option.value = speed;
    animationSpeed.append(option);
  }
  animationSpeed.value = "1";
  const speedLabel = element("label", "Speed");
  speedLabel.append(animationSpeed);
  const animationStatus = element("span", "Ready to loop recorded signals", "animation-status");
  animationStatus.setAttribute("aria-live", "polite");
  transport.append(playAnimation, restartAnimation, speedLabel, animationStatus);
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];
  const tabContents = element("div", undefined, "random-tab-content");
  for (let index = 0; index < tabNames.length; index++) {
    const id = tabIds[index]!;
    const tab = element("button", tabNames[index], "random-tab");
    tab.type = "button";
    tab.id = `rp-tab-${id}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `rp-panel-${id}`);
    tab.setAttribute("aria-selected", String(index === 0));
    tab.tabIndex = index === 0 ? 0 : -1;
    const panel = element("section", undefined, "random-panel");
    panel.id = `rp-panel-${id}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = 0;
    panel.hidden = index !== 0;
    tabs.push(tab);
    panels.push(panel);
    tablist.append(tab);
    tabContents.append(panel);
  }
  function selectTab(index: number, focus = false) {
    tabs.forEach((tab, current) => {
      const selected = index === current;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[current]!.hidden = !selected;
    });
    if (focus) tabs[index]!.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(index));
    tab.addEventListener("keydown", event => {
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
        : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : -1;
      if (next >= 0) { event.preventDefault(); selectTab(next, true); }
    });
  });

  const pathPlot = createLoopingSignalPlot("Ensemble realizations", "Sample n", "Amplitude x[n]");
  panels[0]!.append(pathPlot.root);
  const meanPlot = createPlot("Mean function \\(\\mu_X[n]\\)", "\\(\\mu_X[n]\\)", "Sample n");
  const variancePlot = createPlot("Variance function \\(\\sigma_X^2[n]\\)", "\\(\\sigma_X^2[n]\\)", "Sample n");
  const pdfPlot = createPlot("First-order PDF \\(p_X(x;n)\\)", "\\(p_X(x;n)\\)", "Value x[n]");
  const jointPdf = createScatterPlot("Second-order PDF samples \\((X[n], X[n+\\ell])\\)", "Xₙ", "Xₙ₊ₗ");
  const statsGrid = element("div", undefined, "random-grid");
  statsGrid.append(meanPlot.root, variancePlot.root, pdfPlot.root, jointPdf.root);
  panels[1]!.append(statsGrid);

  const acfPlot = createPlot("Autocorrelation \\(R_X(\\tau)\\)", "Rₓ(τ)", "Lag τ (samples)");
  const covariancePlot = createPlot("Auto- and cross-covariance \\(C_X, C_{XY}\\)", "Covariance", "Lag τ (samples)");
  const coefficientPlot = createPlot("Correlation coefficient \\(\\rho_{XY}(\\tau)\\)", "ρ", "Lag τ (samples)");
  const crossPlot = createPlot("Cross-correlation \\(R_{XY}(\\tau)\\)", "Rₓᵧ(τ)", "Lag τ (samples)");
  const timeCorrelationPlot = createPlot("Two-time correlation \\(R_X(n, n + \\tau)\\)", "Rₓ(n, n + τ)", "Sample n");
  const correlationGrid = element("div", undefined, "random-grid");
  correlationGrid.append(acfPlot.root, covariancePlot.root, coefficientPlot.root, crossPlot.root, timeCorrelationPlot.root);
  const properties = element("section", undefined, "random-properties");
  properties.append(element("h2", "Autocorrelation checks"));
  const symmetry = createProperty("Symmetry \\(R_X(-\\tau)=R_X(\\tau)\\)");
  const maximum = createProperty("Maximum at \\(\\tau=0\\)");
  const power = createProperty("Power \\(R_X(0)\\)");
  const valid = createProperty("Positive semi-definite \\(\\mathbf{R}_X\\succeq 0\\)");
  properties.append(symmetry.root, maximum.root, power.root, valid.root);
  panels[2]!.append(correlationGrid, properties);

  const verdicts = element("div", undefined, "random-verdicts");
  const strict = createProperty("Strict-sense stationarity \\(\\text{SSS}\\)");
  const wide = createProperty("Wide-sense stationarity \\(\\text{WSS}\\)");
  const meanErgodic = createProperty("Mean ergodicity \\(\\bar X_N \\to \\mathbb{E}[X]\\)");
  const correlationErgodic = createProperty("ACF ergodicity \\(\\hat R_X(\\tau) \\to R_X(\\tau)\\)");
  verdicts.append(strict.root, wide.root, meanErgodic.root, correlationErgodic.root);
  const explanation = element("p", "", "random-explanation");
  const meanConvergencePlot = createPlot(
    "Time mean vs ensemble mean \\(\\bar X_N,\\;\\mathbb{E}[X]\\)", "Mean x", "Prefix length (samples)");
  const correlationConvergencePlot = createPlot(
    "Time ACF vs ensemble ACF \\(\\hat R_X(\\tau),\\;R_X(\\tau)\\)", "Rₓ(τ)", "Valid lagged pairs");
  const convergenceGrid = element("div", undefined, "random-grid");
  convergenceGrid.append(meanConvergencePlot.root, correlationConvergencePlot.root);
  panels[3]!.append(verdicts, explanation, convergenceGrid);

  visual.append(transport, tablist, tabContents);
  workspace.append(visual, sidebar);
  root.append(heading, workspace);

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let animationPlaying = false;
  function setAnimation(playing: boolean) {
    animationPlaying = playing && !reducedMotion.matches;
    pathPlot.setSpeed(Number(animationSpeed.value));
    if (animationPlaying) pathPlot.play();
    else pathPlot.pause();
    playAnimation.textContent = animationPlaying ? "Pause signals" : "Play signals";
    playAnimation.setAttribute("aria-pressed", String(animationPlaying));
    animationStatus.textContent = reducedMotion.matches
      ? "Animation disabled by reduced-motion setting"
      : animationPlaying ? "Looping recorded signal realizations" : "Signal playback paused";
  }
  playAnimation.addEventListener("click", () => setAnimation(!animationPlaying));
  animationSpeed.addEventListener("change", () => {
    pathPlot.setSpeed(Number(animationSpeed.value));
  });
  restartAnimation.addEventListener("click", () => {
    pathPlot.reset();
    animationStatus.textContent = animationPlaying ? "Restarted · looping signal" : "Signal loop reset";
  });
  function motionChanged() {
    if (reducedMotion.matches) setAnimation(false);
    playAnimation.disabled = reducedMotion.matches;
    animationStatus.textContent = reducedMotion.matches
      ? "Animation disabled by reduced-motion setting"
      : animationPlaying ? "Looping recorded signal realizations" : "Ready to loop recorded signals";
  }
  reducedMotion.addEventListener("change", motionChanged);
  motionChanged();

  function configFromInputs(focusInvalid = true): ProcessConfig | undefined {
    for (const [key, input] of numericInputs) {
      input.removeAttribute("aria-invalid");
      numericErrors.get(key)!.textContent = "";
      if (!Number.isFinite(input.valueAsNumber)) {
        input.setAttribute("aria-invalid", "true");
        numericErrors.get(key)!.textContent = "Enter a finite number.";
        status.textContent = "Check the highlighted parameter.";
        if (focusInvalid) input.focus();
        return;
      }
    }
    const number = (key: NumericKey) =>
      numericInputs.get(key)?.valueAsNumber ?? defaultProcessConfig[key];
    const config: ProcessConfig = {
      ...defaultProcessConfig,
      kind: selector.value as ProcessKind,
      sampleCount: number("sampleCount"),
      realizations: number("realizations"),
      lag: number("lag"),
      seed: number("seed"),
      amplitude: number("amplitude"),
      cycles: number("cycles"),
      kernelWidth: number("kernelWidth"),
      randomOffsetStd: number("randomOffsetStd"),
      rate: number("rate"),
      p00: number("p00"),
      p11: number("p11"),
      phi: number("phi"),
      theta: number("theta"),
      period: number("period"),
    };
    const error = validateProcessConfig(config);
    if (error) {
      status.textContent = error;
      const invalid = Array.from(numericInputs).find(([key, input]) => {
        const value = input.valueAsNumber;
        const max = key === "lag" ? Math.min(Number(input.max), config.sampleCount / 4) : Number(input.max);
        const integer = ["sampleCount", "realizations", "seed", "lag", "cycles", "period"].includes(key);
        return !Number.isFinite(value) || value < Number(input.min) || value > max ||
          (integer && !Number.isInteger(value));
      });
      if (invalid) {
        const [key, input] = invalid;
        input.setAttribute("aria-invalid", "true");
        numericErrors.get(key)!.textContent = error;
        if (focusInvalid) input.focus();
      }
      return;
    }
    return config;
  }

  function showAnalysis(config: ProcessConfig, analysis: ProcessAnalysis) {
    currentAnalysis = analysis;
    activeConfig = config;
    pathPlot.setTraces(analysis.paths.slice(0, 6).map((values, index) => ({
      label: `Path ${index + 1}`, values,
    })));
    meanPlot.setTraces([{ label: "Ensemble mean", axis: { start: 0, step: 1 }, values: analysis.mean, mode: "line" }]);
    variancePlot.setTraces([{ label: "Ensemble variance", axis: { start: 0, step: 1 }, values: analysis.variance, mode: "line" }]);
    pdfTime.max = String(config.sampleCount - config.lag - 1);
    pdfTime.value = String(Math.floor(config.sampleCount / 2));
    updatePdfTime();
    const symmetricAcf = symmetricValues(analysis.autocorrelation);
    const symmetricCovariance = symmetricValues(analysis.autocovariance);
    const symmetricCoefficient = symmetricValues(analysis.correlationCoefficient);
    acfPlot.setTraces([{ label: "Ensemble estimate", ...symmetricAcf, mode: "line" }]);
    covariancePlot.setTraces([
      { label: "Auto", ...symmetricCovariance, mode: "line" },
      { label: "Cross · Path 1 × Path 2", axis: { start: -config.lag, step: 1 },
        values: analysis.crossCovariance, mode: "line" },
    ]);
    coefficientPlot.setTraces([
      { label: "Auto", ...symmetricCoefficient, mode: "line" },
      { label: "Cross", axis: { start: -config.lag, step: 1 }, values: analysis.crossCoefficient, mode: "line" },
    ]);
    crossPlot.setTraces([{ label: "Path 1 × Path 2", axis: { start: -config.lag, step: 1 },
      values: analysis.crossCorrelation, mode: "line" }]);
    timeCorrelationPlot.setTraces([{
      label: `Ensemble · lag ${config.lag}`,
      axis: { start: 0, step: 1 },
      values: analysis.timeCorrelationAtLag,
      mode: "line",
    }]);

    symmetry.set("PASS", true);
    const maxPassed = analysis.autocorrelation.every(value =>
      Math.abs(value) <= Math.abs(analysis.zeroLagPower) + 1e-9 * Math.max(1, analysis.zeroLagPower));
    maximum.set(maxPassed ? "PASS" : "CHECK", maxPassed);
    power.set(format(analysis.zeroLagPower));
    valid.set(analysis.autocorrelationValid ? "PASS" : "FAIL", analysis.autocorrelationValid);

    strict.set(analysis.stationarity.strictSense ? "PASS · model" : "FAIL · model", analysis.stationarity.strictSense);
    wide.set(analysis.stationarity.wideSense ? "PASS · model" : "FAIL · model", analysis.stationarity.wideSense);
    meanErgodic.set(analysis.stationarity.meanErgodic === undefined
      ? "N/A · nonstationary"
      : analysis.stationarity.meanErgodic ? "LIKELY · model" : "NO · model", analysis.stationarity.meanErgodic);
    correlationErgodic.set(analysis.stationarity.correlationErgodic === undefined
      ? "N/A · nonstationary"
      : analysis.stationarity.correlationErgodic ? "LIKELY · model" : "NO · model",
    analysis.stationarity.correlationErgodic);
    let explanationText = analysis.stationarity.explanation;
    if (analysis.markovSteadyState)
      explanationText += `  Steady state: \\(\\pi_0=${format(analysis.markovSteadyState[0])}\\) · \\(\\pi_1=${format(analysis.markovSteadyState[1])}\\).`;
    renderMathText(explanation, explanationText);
    const nAxis = { start: 1, step: 1 };
    meanConvergencePlot.setTraces([
      { label: "Time mean · Path 1", axis: nAxis, values: analysis.meanConvergence, mode: "line" },
      { label: "Ensemble mean · running", axis: nAxis, values: analysis.ensembleMeanConvergence, mode: "line" },
    ]);
    const correlationAxis = { start: 1, step: 1 };
    correlationConvergencePlot.setTraces([
      { label: "Time ACF · Path 1", axis: correlationAxis,
        values: analysis.correlationConvergence.slice(config.lag), mode: "line" },
      { label: "Ensemble ACF · running", axis: correlationAxis,
        values: analysis.ensembleCorrelationConvergence.slice(config.lag), mode: "line" },
    ]);
    status.textContent = `${processLabels[config.kind]} · x in ${outputUnits[config.kind]} · ${config.realizations} paths · ${config.sampleCount} samples · seed ${config.seed}`;
  }

  function updatePdfTime() {
    if (!currentAnalysis || !activeConfig) return;
    const index = Number(pdfTime.value);
    const distributions = distributionsAt(currentAnalysis.paths, index, activeConfig.lag);
    const centers = distributions.meanPdf.centers;
    pdfPlot.setTraces([{
      label: `Ensemble PDF · n = ${index}`,
      axis: { start: centers[0]!, step: centers[1]! - centers[0]! },
      values: distributions.meanPdf.density, mode: "line",
    }]);
    jointPdf.setPoints(distributions.jointPdf.x, distributions.jointPdf.y,
      `${activeConfig.realizations} realization pairs · X[${index}] and X[${index + activeConfig.lag}].`);
    pdfTimeValue.value = `n = ${index}`;
  }

  pdfTime.addEventListener("input", updatePdfTime);

  function runAnalysis(focusInvalid: boolean) {
    cancelPending();
    const config = configFromInputs(focusInvalid);
    if (!config) return;
    if (animationPlaying) setAnimation(false);
    generate.disabled = true;
    status.textContent = "Generating ensemble…";
    pending = window.setTimeout(() => {
      pending = 0;
      if (!mounted) return;
      const analysis = analyzeProcesses(config);
      showAnalysis(config, analysis);
      generate.disabled = false;
    }, 0);
  }

  function scheduleAnalysis() {
    cancelPending();
    if (!mounted) return;
    status.textContent = currentAnalysis ? "Parameters changed · Updating…" : "Preparing ensemble…";
    pending = window.setTimeout(() => {
      pending = 0;
      runAnalysis(false);
    }, 250);
  }

  sidebar.addEventListener("submit", event => {
    event.preventDefault();
    runAnalysis(true);
  });
  reseed.addEventListener("click", () => {
    const input = numericInputs.get("seed")!;
    input.value = String((Number.isFinite(input.valueAsNumber) ? input.valueAsNumber + 1 : 43) % 2_147_483_648);
    sidebar.requestSubmit();
  });
  reset.addEventListener("click", () => {
    selector.value = defaultProcessConfig.kind;
    const shared = new Set<NumericKey>(["sampleCount", "realizations", "lag", "seed"]);
    for (const [key, input] of numericInputs) {
      if (shared.has(key)) {
        input.value = String(defaultProcessConfig[key]);
        input.removeAttribute("aria-invalid");
        numericErrors.get(key)!.textContent = "";
      } else {
        numericInputs.delete(key);
        numericErrors.delete(key);
      }
    }
    specifics.replaceChildren();
    renderSpecifics();
    sidebar.requestSubmit();
  });
  sidebar.addEventListener("input", event => {
    if (event.target instanceof HTMLInputElement && event.target !== pdfTime) scheduleAnalysis();
  });

  sidebar.requestSubmit();
  return () => {
    mounted = false;
    setAnimation(false);
    reducedMotion.removeEventListener("change", motionChanged);
    if (pending) clearTimeout(pending);
    for (const plot of [pathPlot, meanPlot, variancePlot, pdfPlot, acfPlot,
      covariancePlot, coefficientPlot, crossPlot, meanConvergencePlot, correlationConvergencePlot])
      plot.dispose();
    jointPdf.dispose();
  };
}
