import { amEngine, amModelRef, maxSamples, type AmModel } from "../../../packages/engine-communications/src/index.js";
import { RunController } from "../../../packages/simulation-core/src/index.js";
import { createBrowserExecution } from "./browser-adapter";
import { plot } from "./plot";
import { actions, diagnostics, element, numericField } from "./ui";

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

  const header = element("header", undefined, "lab-heading");
  const title = element("h1", "Conventional AM");
  const badge = element("span", "Chapter 2 · Communications", "eyebrow");
  header.append(badge, title, element("p", "Explore how a sinusoidal message changes a carrier’s envelope and spectrum.", "lede"));

  const layout = element("div", undefined, "workspace");
  const form = element("form", undefined, "panel parameters");
  form.noValidate = true;
  form.append(element("h2", "Parameters"));
  const fields = parameters.map(([key, label, unit, value, hint]) =>
    ({ key, label, value, ...numericField(key, label, unit, value, hint) }));
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
  results.append(element("h2", "Signal readout"), feedback, messages, traces);
  const empty = (message: string) => traces.replaceChildren(element("p", message, "empty"));
  empty("Waveform and spectrum appear here after a run.");
  right.append(results, model);
  layout.append(form, right);
  root.append(header, layout);

  function invalidate(text: string) {
    if (active) controller.cancel(active);
    active = undefined;
    controller.edit();
    buttons.run.disabled = false;
    buttons.cancel.hidden = true;
    diagnostics(messages, []);
    fields.forEach(field => field.error());
    feedback.textContent = text;
    empty("Run the current parameters to view results.");
  }

  form.addEventListener("input", () => invalidate("Parameters changed. Run again for current results."));
  buttons.reset.addEventListener("click", () => {
    fields.forEach(field => { field.input.value = String(field.value); });
    invalidate("Defaults restored. Run to inspect the default signal.");
  });
  buttons.cancel.addEventListener("click", () => {
    if (!active) return;
    feedback.textContent = "Stopping worker…";
    controller.cancel(active);
    buttons.run.focus();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (active) return;
    const invalid = fields.filter(({ input }) => !Number.isFinite(input.valueAsNumber));
    fields.forEach(field => field.error(invalid.includes(field) ? "Enter a finite number." : undefined));
    if (invalid.length) {
      feedback.textContent = "Check the highlighted parameters.";
      invalid[0]!.input.focus();
      return;
    }
    const values = Object.fromEntries(fields.map(field => [field.key, field.input.valueAsNumber])) as AmModel;
    const validation = amEngine.validate(values, amModelRef);
    if (!validation.ok) {
      feedback.textContent = "Check the highlighted parameters.";
      diagnostics(messages, validation.diagnostics);
      let first: HTMLInputElement | undefined;
      for (const issue of validation.diagnostics) {
        const field = fields.find(candidate => candidate.key === issue.location?.field);
        if (field) { field.error(issue.message); first ??= field.input; }
      }
      first?.focus();
      return;
    }
    const run = controller.submit(values, ["waveform", "spectrum"]);
    active = run;
    buttons.run.disabled = true;
    buttons.cancel.hidden = false;
    feedback.textContent = "Running simulation…";
    diagnostics(messages, []);
    empty("Computing waveform and spectrum.");
    const outcome = await controller.completed(run);
    if (!mounted || active !== run) return;
    active = undefined;
    buttons.run.disabled = false;
    if (document.activeElement === buttons.cancel) buttons.run.focus();
    buttons.cancel.hidden = true;
    diagnostics(messages, outcome.diagnostics);
    const current = controller.current;
    if (outcome.status !== "success" || current?.provenance.runId !== run) {
      feedback.textContent = outcome.status === "cancelled" ? "Run cancelled." : "Run did not complete.";
      empty("Run the simulation to view results.");
      return;
    }
    const { waveform, spectrum, sampleRateHz, sampleCount } = current.outputs;
    feedback.textContent = `Run ${run} · Revision ${current.provenance.modelRevision} · ${sampleCount} samples`;
    const metadata = element("dl", undefined, "metadata");
    fields.forEach(({ key, label }) => {
      const unit = parameters.find(parameter => parameter[0] === key)![2];
      metadata.append(element("dt", label), element("dd", `${values[key]} ${unit}`));
    });
    const views: HTMLElement[] = [];
    if (waveform) views.push(plot({ title: "Waveform", xLabel: "Time (s)", yLabel: "Voltage (V)",
      step: 1 / sampleRateHz, values: waveform, mode: "line" }));
    if (spectrum) views.push(plot({ title: "Amplitude spectrum", xLabel: "Frequency (Hz)", yLabel: "Peak amplitude (V)",
      step: spectrum.binWidthHz, values: spectrum.peakAmplitude, mode: "stems" }));
    views.push(element("p", "One-sided peak amplitudes · rectangular record · DC and Nyquist undoubled.", "muted"),
      element("p", `Model ${current.provenance.modelRef.kind} v${current.provenance.modelRef.modelVersion} · Engine v${current.provenance.engine.engineVersion}`, "muted"),
      metadata);
    traces.replaceChildren(...views);
  });
  return () => {
    mounted = false;
    if (active) controller.cancel(active);
    adapter.dispose();
  };
}
