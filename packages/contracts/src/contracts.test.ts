import assert from "node:assert/strict";
import test from "node:test";
import {
  createValidatedInput, matchCapabilities, provenanceFor,
  type Cancellation, type Diagnostic, type DomainEngine, type RunOutcome, type RunContext,
} from "./index.js";

const modelRef = { domain: "communications", kind: "am", modelVersion: "1" };
const engine = { engineId: "built-in-am", engineVersion: "1" };
const diagnostic = {
  severity: "error", code: "am.invalid-parameter", message: "Enter a finite gain.",
  location: { field: "parameters.gain" }, remedy: "Replace the gain.",
} satisfies Diagnostic;
const resolved = () => ({
  modelRef, model: { parameters: { gain: 2 }, coefficients: [1, 2] },
  sampling: { sampleRate: { value: 8, unit: "Hz" }, sampleCount: 8,
    startTime: { value: 0, unit: "s" } },
  assumptions: ["zero phase"],
});

test("snapshot copies and freezes nested canonical data and metadata", () => {
  const source = resolved();
  const input = createValidatedInput(source);
  source.model.parameters.gain = 9;
  source.model.coefficients.fill(0);
  source.sampling.sampleRate.value = 20;
  source.assumptions.push("edited");
  assert.deepEqual(input.model, { parameters: { gain: 2 }, coefficients: [1, 2] });
  assert.equal(input.sampling?.sampleRate.value, 8);
  assert.deepEqual(input.assumptions, ["zero phase"]);
  assert.equal(Reflect.set(input.model.parameters, "gain", 8), false);
  assert.equal(Reflect.set(input.model.coefficients, "0", 8), false);
  assert.throws(() => createValidatedInput({ ...source,
    // @ts-expect-error Mutable buffers must be normalized before snapshot creation.
    model: new Float64Array([1, 2]) }), /plain records/);
});

test("fingerprint is derived from exact resolved values and forged envelopes are rejected", () => {
  const source = resolved();
  const input = createValidatedInput(source);
  for (const changed of [
    { ...source, modelRef: { ...modelRef, modelVersion: "2" } },
    { ...source, model: { ...source.model, parameters: { gain: 3 } } },
    { ...source, sampling: { ...source.sampling, sampleCount: 9 } },
    { ...source, assumptions: ["different phase"] },
  ]) assert.notEqual(createValidatedInput(changed).inputFingerprint, input.inputFingerprint);

  const supplied = { ...source, inputFingerprint: "caller-value" };
  assert.equal(createValidatedInput(supplied).inputFingerprint, input.inputFingerprint);
  assert.equal(createValidatedInput({ ...source, model: {
    coefficients: [1, 2], parameters: { gain: 2 },
  } }).inputFingerprint, input.inputFingerprint);
  assert.notEqual(createValidatedInput({ ...source, model: { gain: 0 } }).inputFingerprint,
    createValidatedInput({ ...source, model: { gain: -0 } }).inputFingerprint);
  assert.throws(() => provenanceFor({
    runId: "a", modelRevision: "1", engine, requestedOutputs: [],
    input: { ...input, inputFingerprint: "caller-value" },
  }), /locally validated/);
});

test("success retains exact provenance across distinct runs and revisions", () => {
  const input = createValidatedInput(resolved());
  const request = { runId: "a", modelRevision: "1", engine, input, requestedOutputs: ["waveform"] };
  const result = {
    status: "success", provenance: provenanceFor(request), outputs: [1, 2],
    outputUnits: { waveform: "V" }, diagnostics: [],
  } satisfies RunOutcome<number[]>;
  assert.equal(result.provenance.inputFingerprint, input.inputFingerprint);
  assert.equal(result.provenance.sampling, input.sampling);
  assert.equal(result.provenance.modelRef, input.modelRef);
  assert.deepEqual(result.provenance.engine, engine);
  assert.deepEqual(result.provenance.requestedOutputs, ["waveform"]);
  const later = provenanceFor({ ...request, runId: "b", modelRevision: "2" });
  assert.notEqual(later.runId, result.provenance.runId);
  assert.notEqual(later.modelRevision, result.provenance.modelRevision);
});

test("capabilities require exact engine, model version and model-specific outputs", () => {
  const descriptor = { engine, models: [{ model: modelRef, outputKinds: ["waveform"] }] };
  assert.equal(matchCapabilities(descriptor, engine, modelRef, ["waveform"]), "supported");
  assert.equal(matchCapabilities(descriptor, engine, modelRef, ["spectrum"]), "unsupported-output");
  assert.equal(matchCapabilities(descriptor, engine, { ...modelRef, modelVersion: "2" }, []), "unsupported-model");
  assert.equal(matchCapabilities(descriptor, { ...engine, engineVersion: "2" }, modelRef, []), "unsupported-engine");
});

test("requesting cancellation does not acknowledge it or hide a failure", () => {
  const context = { runId: "a", modelRevision: "1", modelRef, engine };
  const signal = { requested: false };
  const token: Cancellation = signal;
  const finish = (status: "cancelled" | "failed" | "rejected"): RunOutcome<number[]> =>
    ({ status, context, diagnostics: [diagnostic] });
  signal.requested = true;
  assert.equal(token.requested, true);
  assert.equal(finish("failed").status, "failed");
  assert.equal(finish("cancelled").status, "cancelled");
  for (const status of ["rejected", "cancelled", "failed"] as const) {
    const outcome = finish(status);
    assert.equal(Object.hasOwn(outcome, "outputs"), false);
    assert.equal(outcome.diagnostics[0]?.code, "am.invalid-parameter");
    assert.deepEqual(outcome.diagnostics[0]?.location, { field: "parameters.gain" });
  }
});

// Compile-only contract checks and domain compatibility examples.
export function checkTypes(
  am: DomainEngine<{ carrierHz: number }, { samples: Float64Array }>,
  circuit: DomainEngine<{ resistanceOhms: number }, { voltage: number }>,
  context: RunContext,
) {
  am.validate({ carrierHz: 2 }, modelRef);
  circuit.validate({ resistanceOhms: 1000 }, { domain: "circuit", kind: "resistor", modelVersion: "1" });
  // @ts-expect-error A success requires exact provenance.
  const missingProvenance: RunOutcome<number> = { status: "success", outputs: 1, outputUnits: {}, diagnostics: [] };
  // @ts-expect-error A success requires outputs.
  const missingOutputs: RunOutcome<number> = { status: "success", provenance: {} as never, outputUnits: {}, diagnostics: [] };
  for (const status of ["rejected", "cancelled", "failed"] as const) {
    // @ts-expect-error Unsuccessful outcomes cannot publish outputs.
    const partial: RunOutcome<number> = { status, context, diagnostics: [], outputs: 1 };
    void partial;
  }
  void [missingProvenance, missingOutputs];
}
