/**
 * S4: Fourier Transform & Frequency Domain — independent analytical tests.
 *
 * Issue #13 / Branch: feat/ch1-s4-fourier-transform
 *
 * Every expected value is computed from closed-form expressions independent of
 * the implementation under test. The DFT convention used here matches
 * packages/numerics (forward sign −, 1/N normalization, one-sided interior
 * amplitudes doubled).
 *
 * Test categories
 * ───────────────
 * 1. Coherent single-tone: amplitude concentrated in one bin, correct magnitude.
 * 2. DC component: amplitude in bin 0, undoubled, real coefficient equals amplitude.
 * 3. Nyquist tone: amplitude at Nyquist bin, undoubled, warning emitted.
 * 4. Aliasing: a tone above Nyquist aliases to the same bin as fₛ − f.
 * 5. Noncoherent leakage: energy spreads; Parseval's theorem verified.
 * 6. Superposition: two coherent tones appear independently in their own bins.
 * 7. Two-sided spectrum: negative-frequency bins have correct signed frequency.
 * 8. Waveform output: exact sample values for a 1 Hz cosine.
 * 9. Spectrum-only output: waveform absent when not requested.
 * 10. Invalid-input rejection: bad grid, negative amplitude/frequency, etc.
 * 11. Cancellation: a pre-cancelled run returns status "cancelled".
 * 12. Zero-amplitude component: spectrum is all zeros.
 * 13. Bin width metadata: Δf = fₛ / N.
 * 14. DC + tone superposition: bins isolated correctly.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ftEngine, ftModelRef, ftEngineRef } from "./engine.js";
import type { FtModel } from "./model.js";
import { maxComponents, maxFtSamples } from "./model.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Tolerance: 64 machine epsilons scaled by the expected magnitude (≥ 1). */
function close(actual: number, expected: number, label = "") {
  const tol = 64 * Number.EPSILON * Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected}, got ${actual} (tolerance ${tol})`,
  );
}

/** Validate the model and run it; asserts success and returns outputs. */
async function runOk(model: FtModel, outputs: ("waveform" | "spectrum")[]) {
  const v = ftEngine.validate(model, ftModelRef);
  assert.ok(v.ok, `validate failed: ${JSON.stringify((v as { diagnostics: unknown }).diagnostics)}`);
  if (!v.ok) throw new Error("unreachable");
  const request = {
    runId: "t",
    modelRevision: "0",
    engine: ftEngineRef,
    input: v.input,
    requestedOutputs: outputs,
  };
  const result = await ftEngine.run(request, { requested: false });
  assert.equal(result.status, "success", `expected success, got ${result.status}`);
  if (result.status !== "success") throw new Error("unreachable");
  return result.outputs;
}

// ─── 1. Coherent single cosine ────────────────────────────────────────────────
// x[n] = cos(2π · 1 · n / 8), N=8, fₛ=8 Hz → tone at bin 1 (1 Hz), A=1 V.
// One-sided: amplitude[1] should equal 1 V (interior bin, doubled 0.5 coefficient).

test("coherent 1 Hz cosine at 8 Hz/8 samples: amplitude at bin 1 equals 1 V", async () => {
  const model: FtModel = {
    components: [{ amplitudeV: 1, frequencyHz: 1 }],
    sampleRateHz: 8,
    sampleCount: 8,
    sidedness: "one-sided",
  };
  const out = await runOk(model, ["spectrum"]);
  assert.ok(out.spectrum, "spectrum missing");
  const { amplitude, binFrequenciesHz } = out.spectrum;
  // Bin 0 (DC) and bin 2 (2 Hz) should be near zero.
  close(amplitude[0]!, 0, "DC");
  close(amplitude[1]!, 1, "1 Hz bin");
  close(amplitude[2]!, 0, "2 Hz bin");
  // Bin frequencies
  close(binFrequenciesHz[0]!, 0, "bin0 freq");
  close(binFrequenciesHz[1]!, 1, "bin1 freq");
  close(binFrequenciesHz[2]!, 2, "bin2 freq");
});

// ─── 2. DC component ──────────────────────────────────────────────────────────
// x[n] = 3 V (DC). One-sided: amplitude[0] = 3, all others = 0.

test("DC component: amplitude[0] equals the DC level, undoubled", async () => {
  const model: FtModel = {
    components: [{ amplitudeV: 3, frequencyHz: 0 }],
    sampleRateHz: 8,
    sampleCount: 8,
    sidedness: "one-sided",
  };
  const out = await runOk(model, ["spectrum"]);
  assert.ok(out.spectrum);
  const { amplitude, real } = out.spectrum;
  close(amplitude[0]!, 3, "DC amplitude");
  for (let k = 1; k < amplitude.length; k++) {
    close(amplitude[k]!, 0, `bin ${k}`);
  }
  // Real coefficient at bin 0 equals the DC mean.
  close(real[0]!, 3, "DC real coefficient");
});

// ─── 3. Nyquist tone ──────────────────────────────────────────────────────────
// x[n] = 2·cos(π n) = 2·(-1)^n, N=4, fₛ=8 → tone at Nyquist 4 Hz.
// One-sided: amplitude[2] = 2 V (Nyquist bin, undoubled from coefficient −2).

test("Nyquist tone: amplitude at Nyquist bin equals 2 V, undoubled, warning emitted", async () => {
  const model: FtModel = {
    components: [{ amplitudeV: 2, frequencyHz: 4 }],
    sampleRateHz: 8,
    sampleCount: 4,
    sidedness: "one-sided",
  };
  const v = ftEngine.validate(model, ftModelRef);
  assert.ok(v.ok);
  if (!v.ok) throw new Error();
  const r = await ftEngine.run({ runId: "t", modelRevision: "0", engine: ftEngineRef, input: v.input, requestedOutputs: ["spectrum"] }, { requested: false });
  assert.equal(r.status, "success");
  if (r.status !== "success") throw new Error();
  const { amplitude } = r.outputs.spectrum!;
  // Bins: 0 Hz, 2 Hz, 4 Hz (Nyquist)
  close(amplitude[0]!, 0, "DC");
  close(amplitude[1]!, 0, "2 Hz");
  close(amplitude[2]!, 2, "Nyquist 4 Hz");
  // Warning about Nyquist boundary should appear
  const hasNyquistWarn = r.diagnostics.some(d => d.code === "ft.nyquist-boundary");
  assert.ok(hasNyquistWarn, "expected nyquist-boundary warning");
});

// ─── 4. Aliasing ─────────────────────────────────────────────────────────────
// A 6 Hz cosine sampled at 8 Hz aliases to 2 Hz (since 8 − 6 = 2).
// For N=4 samples (Δf = 2 Hz): bin 1 → 2 Hz. Both should give amplitude[1] = 1 V.

test("6 Hz cosine aliases to same bin as 2 Hz at 8 Hz sample rate", async () => {
  const twoHz: FtModel = {
    components: [{ amplitudeV: 1, frequencyHz: 2 }],
    sampleRateHz: 8,
    sampleCount: 4,
    sidedness: "one-sided",
  };
  const sixHz: FtModel = {
    components: [{ amplitudeV: 1, frequencyHz: 6 }],
    sampleRateHz: 8,
    sampleCount: 4,
    sidedness: "one-sided",
  };
  const out2 = await runOk(twoHz, ["spectrum"]);
  const out6 = await runOk(sixHz, ["spectrum"]);
  // Both should produce identical amplitude spectra (aliasing theorem).
  const amp2 = out2.spectrum!.amplitude;
  const amp6 = out6.spectrum!.amplitude;
  for (let k = 0; k < amp2.length; k++) {
    close(amp6[k]!, amp2[k]!, `bin ${k}`);
  }
  // Aliasing warning must be emitted for the 6 Hz model.
  const v = ftEngine.validate(sixHz, ftModelRef);
  assert.ok(v.ok);
  if (!v.ok) throw new Error();
  const r = await ftEngine.run({ runId: "t", modelRevision: "0", engine: ftEngineRef, input: v.input, requestedOutputs: ["spectrum"] }, { requested: false });
  if (r.status !== "success") throw new Error(`expected success, got ${r.status}`);
  assert.ok(r.diagnostics.some(d => d.code === "ft.aliasing"), "expected aliasing warning");
});

// ─── 5. Noncoherent leakage / Parseval's theorem ─────────────────────────────
// 1.5 Hz cosine at 8 Hz for N=8 samples: not an integer multiple of Δf=1 Hz.
// Parseval (two-sided, 1/N normalization):
//   (1/N) Σ|x[n]|² = Σ|X[k]|² where X[k] = complex DFT coefficient.

test("noncoherent 1.5 Hz tone: leakage warning and Parseval energy conservation", async () => {
  const N = 8;
  const model: FtModel = {
    components: [{ amplitudeV: 1, frequencyHz: 1.5 }],
    sampleRateHz: 8,
    sampleCount: N,
    sidedness: "two-sided",
  };
  const out = await runOk(model, ["waveform", "spectrum"]);

  // Leakage warning present
  const v = ftEngine.validate(model, ftModelRef);
  assert.ok(v.ok);
  if (!v.ok) throw new Error();
  const r = await ftEngine.run({ runId: "t", modelRevision: "0", engine: ftEngineRef, input: v.input, requestedOutputs: ["waveform", "spectrum"] }, { requested: false });
  if (r.status !== "success") throw new Error(`expected success, got ${r.status}`);
  assert.ok(r.diagnostics.some(d => d.code === "ft.spectral-leakage"), "expected leakage warning");

  // Parseval: (1/N) Σ|x[n]|² = Σ(real[k]² + imaginary[k]²)
  let timePower = 0;
  for (let n = 0; n < N; n++) timePower += (out.waveform![n]!) ** 2;
  timePower /= N;

  const { real, imaginary } = out.spectrum!;
  let freqPower = 0;
  for (let k = 0; k < N; k++) {
    freqPower += (real[k]!) ** 2 + (imaginary[k]!) ** 2;
  }
  close(freqPower, timePower, "Parseval");
});

// ─── 6. Superposition of two coherent tones ───────────────────────────────────
// 1 Hz at A=1 V and 2 Hz at A=0.5 V, N=8, fₛ=8 Hz.
// Expected one-sided: amplitude[1]=1 V, amplitude[2]=0.5 V, amplitude[0]=0.

test("superposition: two coherent tones appear in independent bins", async () => {
  const model: FtModel = {
    components: [
      { amplitudeV: 1, frequencyHz: 1 },
      { amplitudeV: 0.5, frequencyHz: 2 },
    ],
    sampleRateHz: 8,
    sampleCount: 8,
    sidedness: "one-sided",
  };
  const out = await runOk(model, ["spectrum"]);
  const { amplitude } = out.spectrum!;
  close(amplitude[0]!, 0, "DC");
  close(amplitude[1]!, 1, "1 Hz");
  close(amplitude[2]!, 0.5, "2 Hz");
  close(amplitude[3]!, 0, "3 Hz");
  close(amplitude[4]!, 0, "4 Hz (Nyquist)");
});

// ─── 7. Two-sided spectrum ────────────────────────────────────────────────────
// 1 Hz cosine, N=8, fₛ=8: two-sided bins at k=1 (1 Hz) and k=7 (-1 Hz).
// Two-sided amplitudes are the raw coefficient magnitudes (not doubled).

test("two-sided: symmetric negative-frequency bins for real cosine", async () => {
  const model: FtModel = {
    components: [{ amplitudeV: 1, frequencyHz: 1 }],
    sampleRateHz: 8,
    sampleCount: 8,
    sidedness: "two-sided",
  };
  const out = await runOk(model, ["spectrum"]);
  const { amplitude, binFrequenciesHz } = out.spectrum!;
  // For 1 Hz cosine, two-sided magnitude at k=1 and k=7 each = 0.5 V.
  close(amplitude[1]!, 0.5, "positive freq bin k=1");
  close(amplitude[7]!, 0.5, "negative freq bin k=7");
  // Signed frequencies
  close(binFrequenciesHz[1]!, 1, "positive freq");
  close(binFrequenciesHz[7]!, -1, "negative freq");
});

// ─── 8. Waveform output ───────────────────────────────────────────────────────
// 1 Hz cosine, N=8, fₛ=8: x[n] = cos(2π n/8), exact values known.

test("waveform: x[n] = cos(2pi n/8) matches analytical values", async () => {
  const model: FtModel = {
    components: [{ amplitudeV: 1, frequencyHz: 1 }],
    sampleRateHz: 8,
    sampleCount: 8,
    sidedness: "one-sided",
  };
  const out = await runOk(model, ["waveform"]);
  assert.ok(out.waveform, "waveform missing");
  assert.equal(out.spectrum, undefined, "spectrum should be absent");
  for (let n = 0; n < 8; n++) {
    close(out.waveform[n]!, Math.cos(2 * Math.PI * n / 8), `x[${n}]`);
  }
});

// ─── 9. Spectrum-only output ──────────────────────────────────────────────────

test("spectrum-only: waveform absent, spectrum present", async () => {
  const model: FtModel = {
    components: [{ amplitudeV: 1, frequencyHz: 2 }],
    sampleRateHz: 8,
    sampleCount: 8,
    sidedness: "one-sided",
  };
  const out = await runOk(model, ["spectrum"]);
  assert.equal(out.waveform, undefined, "waveform should be absent");
  assert.ok(out.spectrum, "spectrum missing");
  close(out.spectrum.amplitude[2]!, 1, "2 Hz bin");
});

// ─── 10. Invalid inputs ───────────────────────────────────────────────────────

test("invalid: negative sample rate rejected", () => {
  const bad = { components: [{ amplitudeV: 1, frequencyHz: 1 }], sampleRateHz: -1, sampleCount: 8, sidedness: "one-sided" };
  const r = ftEngine.validate(bad, ftModelRef);
  assert.equal(r.ok, false);
});

test("invalid: sample count 0 rejected", () => {
  const bad = { components: [{ amplitudeV: 1, frequencyHz: 1 }], sampleRateHz: 8, sampleCount: 0, sidedness: "one-sided" };
  const r = ftEngine.validate(bad, ftModelRef);
  assert.equal(r.ok, false);
});

test("invalid: sample count exceeds maxFtSamples rejected", () => {
  const bad = { components: [{ amplitudeV: 1, frequencyHz: 1 }], sampleRateHz: 8, sampleCount: maxFtSamples + 1, sidedness: "one-sided" };
  const r = ftEngine.validate(bad, ftModelRef);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.diagnostics[0]?.code.includes("resource-limit"));
});

test("invalid: empty components array rejected", () => {
  const bad = { components: [], sampleRateHz: 8, sampleCount: 8, sidedness: "one-sided" };
  const r = ftEngine.validate(bad, ftModelRef);
  assert.equal(r.ok, false);
});

test("invalid: too many components rejected", () => {
  const components = Array.from({ length: maxComponents + 1 }, () => ({ amplitudeV: 1, frequencyHz: 1 }));
  const bad = { components, sampleRateHz: 8, sampleCount: 8, sidedness: "one-sided" };
  const r = ftEngine.validate(bad, ftModelRef);
  assert.equal(r.ok, false);
});

test("invalid: negative amplitude rejected", () => {
  const bad = { components: [{ amplitudeV: -1, frequencyHz: 1 }], sampleRateHz: 8, sampleCount: 8, sidedness: "one-sided" };
  const r = ftEngine.validate(bad, ftModelRef);
  assert.equal(r.ok, false);
});

test("invalid: negative frequency rejected", () => {
  const bad = { components: [{ amplitudeV: 1, frequencyHz: -1 }], sampleRateHz: 8, sampleCount: 8, sidedness: "one-sided" };
  const r = ftEngine.validate(bad, ftModelRef);
  assert.equal(r.ok, false);
});

test("invalid: NaN frequency rejected", () => {
  const bad = { components: [{ amplitudeV: 1, frequencyHz: NaN }], sampleRateHz: 8, sampleCount: 8, sidedness: "one-sided" };
  const r = ftEngine.validate(bad, ftModelRef);
  assert.equal(r.ok, false);
});

test("invalid: Infinity sample rate rejected", () => {
  const bad = { components: [{ amplitudeV: 1, frequencyHz: 1 }], sampleRateHz: Infinity, sampleCount: 8, sidedness: "one-sided" };
  const r = ftEngine.validate(bad, ftModelRef);
  assert.equal(r.ok, false);
});

test("invalid: bad sidedness rejected", () => {
  const bad = { components: [{ amplitudeV: 1, frequencyHz: 1 }], sampleRateHz: 8, sampleCount: 8, sidedness: "invalid" };
  const r = ftEngine.validate(bad, ftModelRef);
  assert.equal(r.ok, false);
});

test("invalid: wrong model ref rejected", () => {
  const model = { components: [{ amplitudeV: 1, frequencyHz: 1 }], sampleRateHz: 8, sampleCount: 8, sidedness: "one-sided" };
  const r = ftEngine.validate(model, { domain: "wrong", kind: "wrong", modelVersion: "1" });
  assert.equal(r.ok, false);
});

test("invalid: unsupported output kind rejected at run", async () => {
  const model: FtModel = { components: [{ amplitudeV: 1, frequencyHz: 1 }], sampleRateHz: 8, sampleCount: 8, sidedness: "one-sided" };
  const v = ftEngine.validate(model, ftModelRef);
  assert.ok(v.ok);
  if (!v.ok) throw new Error();
  const r = await ftEngine.run({ runId: "t", modelRevision: "0", engine: ftEngineRef, input: v.input, requestedOutputs: ["unknown-output" as "waveform"] }, { requested: false });
  assert.equal(r.status, "rejected");
});

// ─── 11. Cancellation ────────────────────────────────────────────────────────

test("cancellation: pre-cancelled run returns status cancelled", async () => {
  const model: FtModel = { components: [{ amplitudeV: 1, frequencyHz: 1 }], sampleRateHz: 8, sampleCount: 8, sidedness: "one-sided" };
  const v = ftEngine.validate(model, ftModelRef);
  assert.ok(v.ok);
  if (!v.ok) throw new Error();
  const r = await ftEngine.run({ runId: "t", modelRevision: "0", engine: ftEngineRef, input: v.input, requestedOutputs: ["spectrum"] }, { requested: true });
  assert.equal(r.status, "cancelled");
});

// ─── 12. Zero-amplitude component ────────────────────────────────────────────
// A zero-amplitude component contributes nothing; spectrum should be all zeros.

test("zero amplitude component: spectrum is all zeros", async () => {
  const model: FtModel = {
    components: [{ amplitudeV: 0, frequencyHz: 1 }],
    sampleRateHz: 8,
    sampleCount: 8,
    sidedness: "one-sided",
  };
  const out = await runOk(model, ["spectrum"]);
  const { amplitude } = out.spectrum!;
  for (let k = 0; k < amplitude.length; k++) {
    assert.equal(amplitude[k], 0, `bin ${k} should be 0`);
  }
});

// ─── 13. Bin width metadata ───────────────────────────────────────────────────

test("bin width equals fₛ / N", async () => {
  const model: FtModel = {
    components: [{ amplitudeV: 1, frequencyHz: 2 }],
    sampleRateHz: 100,
    sampleCount: 50,
    sidedness: "one-sided",
  };
  const out = await runOk(model, ["spectrum"]);
  close(out.spectrum!.binWidthHz, 100 / 50, "binWidthHz");
});

// ─── 14. DC + tone superposition ─────────────────────────────────────────────
// 2 V DC + 1 Hz cosine at 1 V: amplitude[0]=2, amplitude[1]=1.

test("DC plus coherent tone: bins isolated correctly", async () => {
  const model: FtModel = {
    components: [
      { amplitudeV: 2, frequencyHz: 0 },
      { amplitudeV: 1, frequencyHz: 1 },
    ],
    sampleRateHz: 8,
    sampleCount: 8,
    sidedness: "one-sided",
  };
  const out = await runOk(model, ["spectrum"]);
  const { amplitude } = out.spectrum!;
  close(amplitude[0]!, 2, "DC");
  close(amplitude[1]!, 1, "1 Hz");
  close(amplitude[2]!, 0, "2 Hz");
});
