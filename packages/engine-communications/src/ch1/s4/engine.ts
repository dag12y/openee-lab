/**
 * S4: Fourier Transform & Frequency Domain — domain engine.
 *
 * Issue: #13  Branch: feat/ch1-s4-fourier-transform
 *
 * Implements the T-06 DomainEngine contract for the Chapter 1 / S4 topic.
 * Computation is delegated entirely to packages/numerics `directDft`.
 */
import {
  createValidatedInput, matchCapabilities, provenanceFor,
  type Diagnostic, type DomainEngine, type EngineCapabilities,
  type RunOutcome,
} from "../../../../contracts/src/index.js";
import {
  binFrequencyHz, directDft, recordDuration, validateSignal,
  type RealSignal, type SpectrumSidedness,
} from "../../../../numerics/src/index.js";
import {
  maxComponents, maxFtSamples,
  type FtModel, type FtOutput, type FtOutputKind, type FtSpectrum,
} from "./model.js";

// ─── Identity ────────────────────────────────────────────────────────────────

export const ftModelRef = Object.freeze({
  domain: "chapter-1",
  kind: "fourier-transform",
  modelVersion: "1",
});

export const ftEngineRef = Object.freeze({
  engineId: "built-in-ft",
  engineVersion: "1",
});

// ─── Supported output kinds ───────────────────────────────────────────────────

const supportedOutputKinds: readonly FtOutputKind[] = ["waveform", "spectrum"];

const capabilities: EngineCapabilities = Object.freeze({
  engine: ftEngineRef,
  models: Object.freeze([
    Object.freeze({ model: ftModelRef, outputKinds: Object.freeze([...supportedOutputKinds]) }),
  ]),
});

// ─── Diagnostic helpers ───────────────────────────────────────────────────────

function mkError(
  code: string,
  message: string,
  field?: string,
): Diagnostic {
  return {
    severity: "error",
    code: `ft.${code}`,
    message,
    ...(field !== undefined ? { location: { field } } : {}),
  };
}

function mkWarning(code: string, message: string): Diagnostic {
  return { severity: "warning", code: `ft.${code}`, message };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateModel(model: FtModel): Diagnostic | undefined {
  // Sampling grid checks
  if (!Number.isFinite(model.sampleRateHz) || model.sampleRateHz <= 0) {
    return mkError("invalid-sampling", "Sample rate must be a finite positive number.", "sampleRateHz");
  }
  if (!Number.isSafeInteger(model.sampleCount) || model.sampleCount < 1) {
    return mkError("invalid-sampling", "Sample count must be a positive safe integer.", "sampleCount");
  }
  if (model.sampleCount > maxFtSamples) {
    return mkError(
      "resource-limit",
      `Sample count exceeds the S4 engine limit of ${maxFtSamples}.`,
      "sampleCount",
    );
  }
  if (!Number.isFinite(model.sampleCount / model.sampleRateHz) ||
      model.sampleRateHz / model.sampleCount === 0) {
    return mkError("invalid-sampling", "Record duration is not representable in Float64.", "sampleRateHz");
  }

  // Components
  if (!Array.isArray(model.components) || model.components.length < 1) {
    return mkError("invalid-components", "Provide at least one tone component.", "components");
  }
  if (model.components.length > maxComponents) {
    return mkError(
      "invalid-components",
      `At most ${maxComponents} components are supported.`,
      "components",
    );
  }
  for (let i = 0; i < model.components.length; i++) {
    const c = model.components[i]!;
    if (typeof c !== "object" || c === null) {
      return mkError("invalid-component", `Component ${i} is not an object.`, "components");
    }
    if (!Number.isFinite(c.amplitudeV) || c.amplitudeV < 0) {
      return mkError(
        "invalid-component",
        `Component ${i} amplitudeV must be a finite nonnegative number.`,
        "components",
      );
    }
    if (!Number.isFinite(c.frequencyHz) || c.frequencyHz < 0) {
      return mkError(
        "invalid-component",
        `Component ${i} frequencyHz must be a finite nonnegative number.`,
        "components",
      );
    }
  }

  // Sidedness
  if (model.sidedness !== "one-sided" && model.sidedness !== "two-sided") {
    return mkError("invalid-sidedness", "Sidedness must be \"one-sided\" or \"two-sided\".", "sidedness");
  }

  return undefined;
}

/** Produce advisory diagnostics after the model passes validation. */
function computeWarnings(model: FtModel): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const nyquist = model.sampleRateHz / 2;
  const binWidth = model.sampleRateHz / model.sampleCount;

  for (let i = 0; i < model.components.length; i++) {
    const { frequencyHz, amplitudeV } = model.components[i]!;
    if (amplitudeV === 0) continue;
    if (frequencyHz > nyquist) {
      diagnostics.push(mkWarning(
        "aliasing",
        `Component ${i} at ${frequencyHz} Hz exceeds Nyquist (${nyquist} Hz) and will alias.`,
      ));
    } else if (frequencyHz === nyquist) {
      diagnostics.push(mkWarning(
        "nyquist-boundary",
        `Component ${i} is at exactly Nyquist (${nyquist} Hz); the bin is undoubled.`,
      ));
    }
    // Coherence: a tone is coherent when (frequencyHz / binWidth) is an integer.
    const binsF = frequencyHz / binWidth;
    if (frequencyHz > 0 && !Number.isInteger(binsF)) {
      diagnostics.push(mkWarning(
        "spectral-leakage",
        `Component ${i} at ${frequencyHz} Hz is noncoherent (not an integer multiple of ` +
        `Δf = ${binWidth} Hz) and will leak across adjacent bins.`,
      ));
    }
  }

  return diagnostics;
}

// ─── Synthesis ────────────────────────────────────────────────────────────────

/**
 * Synthesise x[n] = Σ Aᵢ · cos(2π fᵢ n / fₛ) for n = 0 … N-1.
 *
 * Uses modulo-reduced frequency to keep phase arguments small and avoid
 * catastrophic cancellation for large n (same technique as the AM engine).
 */
function synthesise(model: FtModel): Float64Array {
  const { sampleRateHz, sampleCount, components } = model;
  const samples = new Float64Array(sampleCount);
  for (const { amplitudeV, frequencyHz } of components) {
    if (amplitudeV === 0) continue;
    const cycles = (frequencyHz % sampleRateHz) / sampleRateHz; // fractional cycles per sample
    for (let n = 0; n < sampleCount; n++) {
      samples[n]! += amplitudeV * Math.cos(2 * Math.PI * cycles * n);
    }
  }
  return samples;
}

// ─── Canonical snapshot type ─────────────────────────────────────────────────
// createValidatedInput requires SnapshotData (plain JSON-serialisable). FtModel
// satisfies that constraint, but TypeScript cannot prove it because of the array
// nesting.  We use a plain record alias that the compiler will accept.

type FtModelSnapshot = {
  readonly components: readonly { readonly amplitudeV: number; readonly frequencyHz: number }[];
  readonly sampleRateHz: number;
  readonly sampleCount: number;
  readonly sidedness: string;
};

// ─── Engine ───────────────────────────────────────────────────────────────────

/** The locally-validated input set, used to prevent replay of unvalidated payloads. */
const issued = new WeakSet<object>();

export const ftEngine: DomainEngine<FtModelSnapshot, FtOutput> = {
  capabilities,

  validate(model, ref) {
    if (matchCapabilities(capabilities, ftEngineRef, ref, []) !== "supported") {
      return {
        ok: false,
        diagnostics: [mkError("unsupported-model", "Unsupported Fourier-transform model identity or version.")],
      };
    }
    if (typeof model !== "object" || model === null || Array.isArray(model)) {
      return { ok: false, diagnostics: [mkError("invalid-model", "Provide a Fourier-transform parameter record.")] };
    }
    // Extract only the canonical fields; ignore extra editor metadata.
    const { components, sampleRateHz, sampleCount, sidedness } = model;
    // Validate sidedness before constructing the canonical model.
    if (sidedness !== "one-sided" && sidedness !== "two-sided") {
      return { ok: false, diagnostics: [mkError("invalid-sidedness", "Sidedness must be \"one-sided\" or \"two-sided\".", "sidedness")] };
    }
    // Reject malformed values before canonicalizing. Number(...) would otherwise
    // silently accept null, booleans, and numeric strings; null components throw.
    if (typeof sampleRateHz !== "number" || typeof sampleCount !== "number") {
      return { ok: false, diagnostics: [mkError("invalid-sampling", "Sampling values must be numbers.", "sampleRateHz")] };
    }
    if (!Array.isArray(components)) {
      return { ok: false, diagnostics: [mkError("invalid-components", "Components must be an array.", "components")] };
    }
    for (let i = 0; i < components.length; i++) {
      const c: unknown = components[i];
      if (typeof c !== "object" || c === null || Array.isArray(c) ||
          typeof (c as Record<string, unknown>).amplitudeV !== "number" ||
          typeof (c as Record<string, unknown>).frequencyHz !== "number") {
        return { ok: false, diagnostics: [mkError("invalid-component", `Component ${i} must contain numeric amplitudeV and frequencyHz.`, "components")] };
      }
    }
    const canonical: FtModel = {
      components: components.map(c => ({
        amplitudeV: c.amplitudeV,
        frequencyHz: c.frequencyHz,
      })),
      sampleRateHz,
      sampleCount,
      sidedness,
    };
    const issue = validateModel(canonical);
    if (issue) return { ok: false, diagnostics: [issue] };

    // Validate sampling grid via numerics helper (redundant but explicit).
    recordDuration({ sampleRateHz: canonical.sampleRateHz, sampleCount: canonical.sampleCount, startTimeSeconds: 0 });

    const snapshot: FtModelSnapshot = {
      components: canonical.components.map(c => ({ amplitudeV: c.amplitudeV, frequencyHz: c.frequencyHz })),
      sampleRateHz: canonical.sampleRateHz,
      sampleCount: canonical.sampleCount,
      sidedness: canonical.sidedness,
    };

    const input = createValidatedInput({
      modelRef: ref,
      model: snapshot,
      sampling: {
        sampleRate: { value: canonical.sampleRateHz, unit: "Hz" },
        sampleCount: canonical.sampleCount,
        startTime: { value: 0, unit: "s" },
      },
      assumptions: [
        "cosine signal components with zero initial phase",
        "exclusive record endpoint: t = n/fs for 0 <= n < N",
        "forward DFT sign convention: X[k] = (1/N) sum x[n] exp(-j 2pi kn/N)",
        "one-sided interior amplitudes are doubled; DC and Nyquist are undoubled",
      ],
    });
    issued.add(input);
    return { ok: true, input };
  },

  async run(request, cancellation): Promise<RunOutcome<FtOutput>> {
    const { input, runId, modelRevision, engine, requestedOutputs } = request;
    const local = issued.has(input);
    const contextBase = {
      runId,
      modelRevision,
      engine: Object.freeze({ ...engine }),
      modelRef: Object.freeze({ ...input?.modelRef }),
    };
    const context = local
      ? Object.freeze({ ...contextBase, inputFingerprint: input.inputFingerprint })
      : Object.freeze(contextBase);

    if (!local) {
      return { status: "rejected", context, diagnostics: [
        mkError("invalid-snapshot", "Validate the model locally before execution."),
      ] };
    }

    // Validate requested outputs
    const validOutputs = new Set<string>(supportedOutputKinds);
    if (!Array.isArray(requestedOutputs) || requestedOutputs.length < 1 ||
        requestedOutputs.length > supportedOutputKinds.length ||
        !Array.from(requestedOutputs).every(k => typeof k === "string" && validOutputs.has(k))) {
      return { status: "rejected", context, diagnostics: [
        mkError("unsupported-output", "Request waveform, spectrum, or both."),
      ] };
    }

    const match = matchCapabilities(capabilities, engine, input.modelRef, requestedOutputs);
    if (match !== "supported") {
      return { status: "rejected", context, diagnostics: [
        mkError(match, "The request does not match the built-in S4 engine capabilities."),
      ] };
    }

    // Re-validate the snapshot at execution entry (defence-in-depth).
    const rawModel = input.model;
    const model: FtModel = {
      components: (rawModel.components as { amplitudeV: number; frequencyHz: number }[]).map(c => ({
        amplitudeV: c.amplitudeV,
        frequencyHz: c.frequencyHz,
      })),
      sampleRateHz: rawModel.sampleRateHz,
      sampleCount: rawModel.sampleCount,
      sidedness: rawModel.sidedness === "one-sided" || rawModel.sidedness === "two-sided"
        ? rawModel.sidedness
        : "one-sided",
    };
    const issue = validateModel(model);
    if (issue) return { status: "rejected", context, diagnostics: [issue] };

    const cancelled = (): RunOutcome<FtOutput> => ({
      status: "cancelled",
      context,
      diagnostics: [{ severity: "info", code: "ft.cancelled", message: "S4 run cancelled." }],
    });

    try {
      const provenance = provenanceFor(request);
      if (cancellation.requested) return cancelled();

      const { sampleRateHz, sampleCount, sidedness } = model;
      const warnings = computeWarnings(model);

      // Synthesise time-domain signal
      const rawSamples = synthesise(model);
      if (cancellation.requested) return cancelled();

      const outputUnits: Record<string, string> = {};
      let waveform: Float64Array | undefined;
      let spectrum: FtSpectrum | undefined;

      if (provenance.requestedOutputs.includes("waveform")) {
        waveform = rawSamples;
        outputUnits["waveform"] = "V";
      }

      if (provenance.requestedOutputs.includes("spectrum")) {
        if (cancellation.requested) return cancelled();

        // Build RealSignal for the shared DFT helper.
        const signal: RealSignal = {
          grid: { sampleRateHz, sampleCount, startTimeSeconds: 0 },
          unit: "V",
          samples: rawSamples,
        };
        validateSignal(signal);

        const dft = directDft(signal, sidedness as SpectrumSidedness);
        if (cancellation.requested) return cancelled();

        const bins = dft.amplitude.length;
        const freqs = new Float64Array(bins);
        for (let k = 0; k < bins; k++) {
          freqs[k] = binFrequencyHz(signal.grid, k, sidedness as SpectrumSidedness);
        }
        spectrum = Object.freeze({
          sidedness,
          binFrequenciesHz: freqs,
          real: dft.real,
          imaginary: dft.imaginary,
          amplitude: dft.amplitude,
          binWidthHz: sampleRateHz / sampleCount,
        });
        outputUnits["spectrum"] = "V";
      }

      const outputs: FtOutput = {
        sampleRateHz,
        sampleCount,
        unit: "V",
        ...(waveform !== undefined ? { waveform } : {}),
        ...(spectrum !== undefined ? { spectrum } : {}),
      };

      return {
        status: "success",
        provenance,
        diagnostics: warnings,
        outputUnits,
        outputs,
      };
    } catch (err) {
      return {
        status: "failed",
        context,
        diagnostics: [mkError("execution-failed", `S4 engine execution failed: ${String(err)}`)],
      };
    }
  },
};
