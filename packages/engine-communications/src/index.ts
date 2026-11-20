import {
  createValidatedInput, matchCapabilities, provenanceFor,
  type Diagnostic, type DomainEngine, type EngineCapabilities, type RunContext,
} from "../../contracts/src/index.js";

export type AmModel = Readonly<{
  carrierAmplitude: number;
  modulationIndex: number;
  messageFrequencyHz: number;
  carrierFrequencyHz: number;
  sampleRateHz: number;
  sampleCount: number;
}>;

export type AmOutput = Readonly<{
  sampleRateHz: number;
  sampleCount: number;
  startTimeSeconds: 0;
  waveform?: Float64Array;
  spectrum?: Readonly<{ binWidthHz: number; peakAmplitude: Float64Array }>;
}>;

export const amModelRef = Object.freeze({
  domain: "communications", kind: "conventional-am", modelVersion: "1",
});
export const amEngineRef = Object.freeze({ engineId: "built-in-am", engineVersion: "1" });
export const maxSamples = 2048;

const capabilities: EngineCapabilities = Object.freeze({
  engine: amEngineRef,
  models: Object.freeze([Object.freeze({
    model: amModelRef, outputKinds: Object.freeze(["waveform", "spectrum"]),
  })]),
});
const issued = new WeakSet<object>();
const tau = 2 * Math.PI;

function error(code: string, message: string, field?: keyof AmModel): Diagnostic {
  return { severity: "error", code: `am.${code}`, message,
    ...(field === undefined ? {} : { location: { field } }) };
}

function validateValues(model: AmModel): Diagnostic | undefined {
  const { carrierAmplitude, modulationIndex, messageFrequencyHz, carrierFrequencyHz,
    sampleRateHz, sampleCount } = model;
  const fields = { carrierAmplitude, modulationIndex, messageFrequencyHz, carrierFrequencyHz,
    sampleRateHz, sampleCount } satisfies Record<keyof AmModel, number>;
  for (const field of Object.keys(fields) as (keyof AmModel)[]) {
    if (!Number.isFinite(fields[field]) || fields[field] < 0) {
      return error("invalid-model", "Use a finite nonnegative value.", field);
    }
  }
  if (carrierFrequencyHz === 0) return error("invalid-model", "Carrier frequency must be positive.", "carrierFrequencyHz");
  if (messageFrequencyHz > carrierFrequencyHz) {
    return error("invalid-model", "Message frequency must not exceed carrier frequency.", "messageFrequencyHz");
  }
  if (sampleRateHz === 0 || !Number.isFinite(sampleCount / sampleRateHz) || sampleRateHz / sampleCount === 0) {
    return error("invalid-sampling", "Use a positive sample rate with finite record duration.", "sampleRateHz");
  }
  if (!Number.isSafeInteger(sampleCount) || sampleCount === 0) {
    return error("invalid-sampling", "Use a positive safe integer sample count.", "sampleCount");
  }
  if (sampleCount > maxSamples) {
    return error("resource-limit", `This batch is limited to ${maxSamples} samples.`, "sampleCount");
  }
  if (!Number.isFinite(carrierAmplitude * (1 + modulationIndex))) {
    return error("invalid-model", "The peak waveform bound must be representable in Float64.", "carrierAmplitude");
  }
}

function warnings(model: AmModel): Diagnostic[] {
  const { carrierAmplitude, modulationIndex, carrierFrequencyHz: fc,
    messageFrequencyHz: fm, sampleRateHz: fs } = model;
  const diagnostics: Diagnostic[] = [];
  const warn = (code: string, message: string) =>
    diagnostics.push({ severity: "warning", code: `am.${code}`, message });
  if (modulationIndex > 1 && fm > 0) warn("overmodulation", "The signed envelope crosses zero.");
  if (fm === 0 || fm === fc) warn("special-frequency", "The distinct three-line interpretation does not apply.");
  if (carrierAmplitude === 0) return diagnostics;
  const highest = modulationIndex === 0 ? fc : fc + fm;
  if (highest === fs / 2) warn("nyquist-boundary", "The highest occupied line is at Nyquist.");
  if (highest > fs / 2) warn("aliasing", "The sampled spectrum folds frequencies above Nyquist.");
  return diagnostics;
}

export const amEngine: DomainEngine<AmModel, AmOutput> = {
  capabilities,
  validate(model, ref) {
    if (matchCapabilities(capabilities, amEngineRef, ref, []) !== "supported") {
      return { ok: false, diagnostics: [error("unsupported-model", "Unsupported conventional AM model identity or version.")] };
    }
    if (typeof model !== "object" || model === null || Array.isArray(model)) {
      return { ok: false, diagnostics: [error("invalid-model", "Provide a conventional AM parameter record.")] };
    }
    // Read only the canonical scalar fields. Arbitrary editor metadata is outside this model.
    const { carrierAmplitude, modulationIndex, messageFrequencyHz, carrierFrequencyHz,
      sampleRateHz, sampleCount } = model;
    const canonical = { carrierAmplitude, modulationIndex, messageFrequencyHz, carrierFrequencyHz,
      sampleRateHz, sampleCount };
    const issue = validateValues(canonical);
    if (issue) return { ok: false, diagnostics: [issue] };
    const input = createValidatedInput({
      model: canonical, modelRef: amModelRef,
      sampling: { sampleRate: { value: sampleRateHz, unit: "Hz" }, sampleCount,
        startTime: { value: 0, unit: "s" } },
      assumptions: ["single-tone message", "zero initial phases", "carrier peak amplitude in V"],
    });
    issued.add(input);
    return { ok: true, input };
  },
  async run(request, cancellation) {
    const { input, runId, modelRevision, engine, requestedOutputs } = request;
    const local = issued.has(input);
    const context: RunContext = {
      runId, modelRevision, engine: { ...engine }, modelRef: { ...input?.modelRef },
      ...(local ? { inputFingerprint: input.inputFingerprint } : {}),
    };
    if (!local) return { status: "rejected", context, diagnostics: [
      error("invalid-snapshot", "Validate the model locally before execution."),
    ] };
    if (!Array.isArray(requestedOutputs) || requestedOutputs.length > 2 ||
        requestedOutputs.length === 0 || !Array.from(requestedOutputs).every(
          kind => kind === "waveform" || kind === "spectrum")) {
      return { status: "rejected", context, diagnostics: [
        error("unsupported-output", "Request waveform, spectrum, or both."),
      ] };
    }
    const match = matchCapabilities(capabilities, engine, input.modelRef, requestedOutputs);
    if (match !== "supported") return { status: "rejected", context, diagnostics: [
      error(match, "The request does not match the built-in engine capabilities."),
    ] };
    const issue = validateValues(input.model);
    if (issue) return { status: "rejected", context, diagnostics: [issue] };
    const cancelled = () => ({ status: "cancelled" as const, context, diagnostics: [
      { severity: "info" as const, code: "am.cancelled", message: "Batch cancellation acknowledged." },
    ] });

    try {
      const provenance = provenanceFor(request);
      if (cancellation.requested) return cancelled();
      const { sampleCount, sampleRateHz, carrierAmplitude, modulationIndex,
        messageFrequencyHz, carrierFrequencyHz } = input.model;
      const samples = new Float64Array(sampleCount);
      // Frequency modulo the sample rate keeps angles small and preserves sampled cosine values.
      const messageCycles = (messageFrequencyHz % sampleRateHz) / sampleRateHz;
      const carrierCycles = (carrierFrequencyHz % sampleRateHz) / sampleRateHz;
      for (let n = 0; n < sampleCount; n++) {
        if (n % 64 === 0 && cancellation.requested) return cancelled();
        samples[n] = carrierAmplitude * (1 + modulationIndex * Math.cos(tau * messageCycles * n)) *
          Math.cos(tau * carrierCycles * n);
      }

      const outputUnits: Record<string, string> = {};
      let spectrum: AmOutput["spectrum"];
      if (provenance.requestedOutputs.includes("spectrum")) {
        const peakAmplitude = new Float64Array(Math.floor(sampleCount / 2) + 1);
        for (let k = 0; k < peakAmplitude.length; k++) {
          if (cancellation.requested) return cancelled();
          let real = 0;
          let imaginary = 0;
          for (let n = 0; n < sampleCount; n++) {
            const angle = tau * ((k * n) % sampleCount) / sampleCount;
            const value = samples[n]! / sampleCount;
            real += value * Math.cos(angle);
            imaginary -= value * Math.sin(angle);
          }
          const amplitude = Math.hypot(real, imaginary) * (k === 0 || 2 * k === sampleCount ? 1 : 2);
          if (!Number.isFinite(amplitude)) throw new RangeError("Spectrum amplitude overflow");
          peakAmplitude[k] = amplitude;
        }
        spectrum = { binWidthHz: sampleRateHz / sampleCount, peakAmplitude };
        outputUnits.spectrum = "V";
      }
      const waveform = provenance.requestedOutputs.includes("waveform") ? samples : undefined;
      if (waveform) outputUnits.waveform = "V";
      if (cancellation.requested) return cancelled();
      return { status: "success", provenance, outputUnits, diagnostics: warnings(input.model),
        outputs: { sampleRateHz, sampleCount, startTimeSeconds: 0,
          ...(waveform ? { waveform } : {}), ...(spectrum ? { spectrum } : {}) } };
    } catch {
      return { status: "failed", context, diagnostics: [
        error("execution-failed", "The conventional AM batch could not complete."),
      ] };
    }
  },
};
