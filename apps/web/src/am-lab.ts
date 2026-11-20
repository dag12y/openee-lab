import { amEngine, amModelRef, maxSamples, type AmModel } from "../../../packages/engine-communications/src/index.js";
import { RunController } from "../../../packages/simulation-core/src/index.js";
import { createBrowserExecution } from "./browser-adapter";
import { createScientificPlot } from "./scientific-plot";
import { actions, diagnostics, element, numericField } from "./ui";

const previewDelayMs = 155;

const parameters = [
  ["carrierAmplitude", "Carrier amplitude", "V", 2, "Peak voltage, ≥ 0"],
  ["modulationIndex", "Modulation index", "1", 0.5, "Dimensionless, ≥ 0"],
  ["messageFrequencyHz", "Message frequency", "Hz", 50, "Between 0 and carrier frequency"],
  ["carrierFrequencyHz", "Carrier frequency", "Hz", 400, "Greater than 0"],
  ["sampleRateHz", "Sampling frequency", "Hz", 4000, "Greater than 0"],
  ["sampleCount", "Sample count", "samples", 320, `Integer from 1 to ${maxSamples}`],
] as const satisfies readonly (readonly [keyof AmModel, string, string, number, string])[];

export function mountAmLab(root: HTMLElement): () => void {
  const adapter = createBrowserExecution();
  const controller = new RunController(adapter.execute);
  let active: string | undefined;
  let mounted = true;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let hasResult = false;
  const scope = createScientificPlot({ title: "Waveform", xLabel: "Time (s)", yLabel: "Voltage (V)", playback: true });
  const analyzer = createScientificPlot({ title: "Amplitude spectrum", xLabel: "Frequency (Hz)", yLabel: "Peak amplitude (V)" });
  const details = element("div");

  const header = element("header", undefined, "lab-heading");
  const title = element("h1", "Conventional AM");
  const badge = element("span", "Chapter 2 · Communications", "eyebrow");
  header.append(badge, title, element("p", "Explore how a sinusoidal message changes a carrier’s envelope and spectrum.", "lede"));

  const layout = element("div", undefined, "workspace");
  const form = element("form", undefined, "panel parameters");
  form.noValidate = true;
  form.append(element("h2", "Parameters"));
  const fields = parameters.map(([key, label, unit, value, hint]) =>
    ({ key, label, unit, value, ...numericField(key, label, unit, value, hint) }));
  const modeLabel = element("label", "Simulation mode", "mode-control");
  const mode = element("select");
  for (const label of ["Live", "Manual"]) {
    const option = element("option", label);
    option.value = label.toLowerCase();
    mode.append(option);
  }
  modeLabel.append(mode);
  form.append(modeLabel);
  const sliders = fields.flatMap(field => {
    if (field.key !== "carrierAmplitude" && field.key !== "modulationIndex") return [];
    const slider = element("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = field.key === "carrierAmplitude" ? "10" : "2";
    slider.step = "any";
    slider.setAttribute("aria-label", field.label + " quick adjustment");
    const hint = element("small");
    field.root.append(slider, hint);
    slider.addEventListener("input", () => { field.input.value = slider.value; });
    return [{ field, slider, hint }];
  });
  fields.forEach(field => form.append(field.root));
  const buttons = actions();
  form.append(buttons.root);

  const right = element("div", undefined, "results");
  const model = element("section", undefined, "panel model");
  model.append(element("h2", "Signal model"),
    element("p", "s(t) = A꜀ [1 + μ cos(2π fₘ t)] cos(2π f꜀ t)", "equation"),
    element("p", "Single-tone message, zero initial phase and t₀ = 0. The endpoint N/fₛ is excluded.", "muted"));
  const feedback = element("p", "Ready. Run the simulation to view results.", "run-status");
  feedback.setAttribute("role", "status");
  const messages = element("ul", undefined, "diagnostics");
  messages.setAttribute("aria-live", "polite");
  const results = element("section", undefined, "panel traces");
  const traces = element("div");
  const stale = element("p", "Previous result · Parameters or run status changed.", "previous-result");
  stale.hidden = true;
  traces.setAttribute("aria-describedby", "am-result-status");
  stale.id = "am-result-status";
  results.append(element("h2", "Signal readout"), feedback, messages, stale, traces);
  const empty = (message: string) => traces.replaceChildren(element("p", message, "empty"));
  empty("Waveform and spectrum appear here after a run.");
  right.append(results, model);
  layout.append(form, right);
  root.append(header, layout);

  function clearPreview() {
    clearTimeout(pending);
    pending = undefined;
  }

  function status(text: string) {
    if (feedback.textContent !== text) feedback.textContent = text;
  }

  function setBusy(busy: boolean) {
    buttons.run.disabled = busy;
    if (!busy && document.activeElement === buttons.cancel) buttons.run.focus();
    buttons.cancel.hidden = !busy;
  }

  function syncSliders() {
    for (const { field, slider, hint } of sliders) {
      const value = field.input.valueAsNumber;
      slider.value = Number.isFinite(value) ? field.input.value : String(field.value);
      hint.textContent = Number.isFinite(value) && value > Number(slider.max)
        ? "Above the quick adjustment range. The exact value is used."
        : "";
    }
  }

  function readModel(focusError = false): AmModel | undefined {
    const invalid = fields.filter(({ input }) => !Number.isFinite(input.valueAsNumber));
    fields.forEach(field => field.error(invalid.includes(field) ? "Enter a finite number." : undefined));
    diagnostics(messages, []);
    if (invalid.length) {
      status("Check the highlighted parameters.");
      if (focusError) invalid[0]!.input.focus();
      return;
    }
    const values = Object.fromEntries(fields.map(field => [field.key, field.input.valueAsNumber])) as AmModel;
    const validation = amEngine.validate(values, amModelRef);
    if (!validation.ok) {
      status("Check the highlighted parameters.");
      let first: HTMLInputElement | undefined;
      for (const issue of validation.diagnostics) {
        const field = fields.find(candidate => candidate.key === issue.location?.field);
        if (field) { field.error(issue.message); first ??= field.input; }
      }
      if (!first) diagnostics(messages, validation.diagnostics);
      if (focusError) first?.focus();
      return;
    }
    return values;
  }

  function schedule(values: AmModel) {
    status("Updating preview…");
    pending = setTimeout(() => {
      pending = undefined;
      void execute(values);
    }, previewDelayMs);
  }

  function parametersChanged(manualText: string) {
    clearPreview();
    if (active) controller.cancel(active);
    active = undefined;
    controller.edit();
    setBusy(false);
    stale.hidden = !hasResult;
    syncSliders();
    const values = readModel();
    if (!values) return;
    if (mode.value === "live") schedule(values);
    else status(manualText);
  }

  form.addEventListener("input", event => {
    if (event.target !== mode) parametersChanged("Parameters changed. Run to update the results.");
  });
  mode.addEventListener("change", () => {
    clearPreview();
    if (active) return;
    if (mode.value === "manual") {
      if (controller.current) status("Manual mode. Current result shown.");
      else if (readModel()) status("Manual mode. Run when ready.");
    } else {
      const values = readModel();
      if (values) schedule(values);
    }
  });
  buttons.reset.addEventListener("click", () => {
    fields.forEach(field => { field.input.value = String(field.value); });
    parametersChanged("Defaults restored. Run to update the results.");
  });
  buttons.cancel.addEventListener("click", () => {
    if (!active) return;
    status("Stopping worker…");
    controller.cancel(active);
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (active) return;
    clearPreview();
    const values = readModel(true);
    if (values) void execute(values);
  });

  async function execute(values: AmModel) {
    if (!mounted || active) return;
    const run = controller.submit(values, ["waveform", "spectrum"]);
    active = run;
    setBusy(true);
    stale.hidden = !hasResult;
    status("Updating preview…");
    diagnostics(messages, []);
    const outcome = await controller.completed(run);
    if (!mounted || active !== run) return;
    active = undefined;
    setBusy(false);
    diagnostics(messages, outcome.diagnostics);
    const current = controller.current;
    if (outcome.status !== "success" || current?.provenance.runId !== run) {
      status(outcome.status === "cancelled" ? "Run cancelled." : "Run did not complete. Run again to retry.");
      return;
    }
    const { waveform, spectrum, sampleRateHz, sampleCount } = current.outputs;
    status(`Run ${run} · Revision ${current.provenance.modelRevision} · ${sampleCount} samples`);
    const metadata = element("dl", undefined, "metadata");
    fields.forEach(({ key, label, unit }) => {
      metadata.append(element("dt", label), element("dd", `${values[key]} ${unit}`));
    });
    if (waveform) scope.setTraces([{
      label: "AM signal", axis: { start: current.outputs.startTimeSeconds, step: 1 / sampleRateHz },
      values: waveform, mode: "line",
    }]);
    if (spectrum) analyzer.setTraces([{
      label: "AM spectrum", axis: { start: 0, step: spectrum.binWidthHz },
      values: spectrum.peakAmplitude, mode: "stems",
    }]);
    details.replaceChildren(element("p", "One-sided peak amplitudes · rectangular record.", "muted"),
      element("p", `Model ${current.provenance.modelRef.kind} v${current.provenance.modelRef.modelVersion} · Engine v${current.provenance.engine.engineVersion}`, "muted"),
      metadata);
    if (!hasResult) traces.replaceChildren(scope.root, analyzer.root, details);
    hasResult = true;
    stale.hidden = true;
  }

  syncSliders();
  const defaults = readModel();
  if (defaults) void execute(defaults);
  return () => {
    mounted = false;
    clearPreview();
    if (active) controller.cancel(active);
    adapter.dispose();
    scope.dispose();
    analyzer.dispose();
  };
}
