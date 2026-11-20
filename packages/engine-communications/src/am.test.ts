import assert from "node:assert/strict";
import test from "node:test";
import { createValidatedInput } from "../../contracts/src/index.js";
import { analyticalSamples, coherentFixtures, invalidNumericCases } from "../../../verification/am-reference/src/fixtures.js";
import { amEngine, amEngineRef, amModelRef, maxSamples, type AmModel } from "./index.js";

const baseline = coherentFixtures[1]!.parameters;
function request(model: AmModel = baseline, requestedOutputs: string[] = ["waveform", "spectrum"]) {
  const validation = amEngine.validate(model, amModelRef);
  assert.ok(validation.ok);
  return { input: validation.input, engine: amEngineRef, runId: "test", modelRevision: "r1", requestedOutputs };
}

// Tiny reference records (N <= 8) have bounded amplitudes and a few trig/sum
// operations per bin. Allow rounding at zero and in the independent expansion.
function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= 128 * Number.EPSILON * Math.max(1, Math.abs(expected)),
    `expected ${expected}, received ${actual}`);
}

const expectedWarnings: Record<string, string> = {
  "overmodulation-reference-only": "am.overmodulation",
  "nyquist-upper-sideband": "am.nyquist-boundary",
  "aliased-upper-collides-with-carrier": "am.aliasing",
  "zero-message-frequency-line-collision": "am.special-frequency",
  "carrier-equals-message-dc-collision": "am.special-frequency",
};

for (const fixture of coherentFixtures) {
  test(fixture.id, async () => {
    const run = request(fixture.parameters);
    const result = await amEngine.run(run, { requested: false });
    assert.equal(result.status, "success");
    const { waveform, spectrum, sampleRateHz, sampleCount, startTimeSeconds } = result.outputs;
    assert.ok(waveform instanceof Float64Array && spectrum);
    assert.equal(sampleRateHz, fixture.parameters.sampleRateHz);
    assert.equal(sampleCount, fixture.parameters.sampleCount);
    assert.equal(startTimeSeconds, 0);
    assert.equal(waveform.length, sampleCount);
    assert.equal(spectrum.binWidthHz, sampleRateHz / sampleCount);
    assert.equal(spectrum.peakAmplitude.length, Math.floor(sampleCount / 2) + 1);
    analyticalSamples(fixture.parameters).forEach((expected, n) => close(waveform[n]!, expected));
    fixture.selectedSamples.forEach(({ index, value }) => close(waveform[index]!, value));
    spectrum.peakAmplitude.forEach((value, bin) => {
      close(value, fixture.expectedLines.find(line => line.bin === bin)?.oneSidedPeak ?? 0);
    });
    const warning = expectedWarnings[fixture.id];
    if (warning) assert.ok(result.diagnostics.some(diagnostic => diagnostic.code === warning));
    else assert.deepEqual(result.diagnostics, []);
  });
}

test("invalid numerics and sampling are rejected before snapshot creation", () => {
  for (const model of [...invalidNumericCases.map(fixture => fixture.parameters),
    { ...baseline, sampleCount: 0 }, { ...baseline, sampleRateHz: Number.MIN_VALUE },
    { ...baseline, messageFrequencyHz: baseline.carrierFrequencyHz + 1 },
    { ...baseline, carrierAmplitude: Number.MAX_VALUE }]) {
    const result = amEngine.validate(model, amModelRef);
    assert.equal(result.ok, false);
    assert.equal(Object.hasOwn(result, "input"), false);
  }
});

test("resource guard rejects over-limit batches before snapshot creation", () => {
  assert.equal(amEngine.validate({ ...baseline, sampleCount: maxSamples }, amModelRef).ok, true);
  const result = amEngine.validate({ ...baseline, sampleCount: maxSamples + 1 }, amModelRef);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "am.resource-limit");
});

test("unsupported model identity, engine version and output selection are explicit", async () => {
  for (const ref of [{ ...amModelRef, modelVersion: "2" }, { ...amModelRef, domain: "circuits" },
    { ...amModelRef, kind: "ssb" }]) {
    const result = amEngine.validate(baseline, ref);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "am.unsupported-model");
  }
  const run = request();
  for (const [candidate, code] of [
    [{ ...run, engine: { ...amEngineRef, engineVersion: "2" } }, "am.unsupported-engine"],
    [{ ...run, requestedOutputs: ["psd"] }, "am.unsupported-output"],
  ] as const) {
    const result = await amEngine.run(candidate, { requested: false });
    assert.equal(result.status, "rejected");
    assert.equal(result.diagnostics[0]?.code, code);
    assert.equal(result.context.inputFingerprint, run.input.inputFingerprint);
    assert.equal(Object.hasOwn(result, "outputs"), false);
  }
});

test("only AM-issued snapshots are accepted", async () => {
  const run = request();
  for (const input of [
    { ...run.input, inputFingerprint: "forged" },
    createValidatedInput({ ...run.input, model: { ...baseline, sampleCount: maxSamples + 1 } }),
  ]) {
    const result = await amEngine.run({ ...run, input }, { requested: false });
    assert.equal(result.status, "rejected");
    assert.equal(result.diagnostics[0]?.code, "am.invalid-snapshot");
    assert.equal(result.context.inputFingerprint, undefined);
  }
});

test("repeat runs are deterministic and preserve correlation and exact input identity", async () => {
  const editable = { ...baseline };
  const first = request(editable, ["waveform"]);
  editable.carrierAmplitude = 99;
  const second = { ...first, runId: "second", modelRevision: "r2" };
  const a = await amEngine.run(first, { requested: false });
  const b = await amEngine.run(second, { requested: false });
  assert.equal(a.status, "success");
  assert.equal(b.status, "success");
  assert.deepEqual(a.outputs, b.outputs);
  assert.equal(a.outputs.waveform?.[0], 3);
  assert.equal(a.outputs.spectrum, undefined);
  assert.deepEqual(a.outputUnits, { waveform: "V" });
  assert.equal(a.provenance.inputFingerprint, first.input.inputFingerprint);
  assert.equal(b.provenance.inputFingerprint, a.provenance.inputFingerprint);
  assert.equal(b.provenance.runId, second.runId);
  assert.equal(b.provenance.modelRevision, second.modelRevision);
  assert.deepEqual(b.provenance.engine, amEngineRef);
});

test("noncoherent rectangular record has the expected finite-record leakage", async () => {
  // A 2 Hz unit cosine at 8 Hz yields [1, 0, -1] for N=3.
  // Its first positive coefficient has magnitude sqrt(3)/3.
  const run = request({ ...baseline, carrierAmplitude: 1, modulationIndex: 0, sampleCount: 3 }, ["spectrum"]);
  const result = await amEngine.run(run, { requested: false });
  assert.equal(result.status, "success");
  assert.equal(result.outputs.waveform, undefined);
  close(result.outputs.spectrum!.peakAmplitude[0]!, 0);
  close(result.outputs.spectrum!.peakAmplitude[1]!, 2 * Math.sqrt(3) / 3);
});

test("pre-run and in-run cancellation acknowledge without publishing outputs", async () => {
  const run = request();
  let polls = 0;
  for (const token of [{ requested: true }, { get requested() { return ++polls === 4; } }]) {
    const result = await amEngine.run(run, token);
    assert.equal(result.status, "cancelled");
    assert.equal(result.context.inputFingerprint, run.input.inputFingerprint);
    assert.equal(Object.hasOwn(result, "outputs"), false);
  }
});

test("unexpected execution errors return failed without outputs", async () => {
  const result = await amEngine.run(request(), { get requested(): boolean { throw new Error("token failure"); } });
  assert.equal(result.status, "failed");
  assert.equal(result.diagnostics[0]?.code, "am.execution-failed");
  assert.equal(Object.hasOwn(result, "outputs"), false);
});
