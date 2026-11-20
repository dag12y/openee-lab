import assert from "node:assert/strict";
import test from "node:test";
import { analyticalSamples, coherentFixtures, invalidNumericCases, type Parameters } from "./fixtures.js";

// Arithmetic sanity threshold for this tiny reference harness, not an engine
// acceptance tolerance or D-01 decision.
function close(actual: number, expected: number, sampleCount: number): void {
  const arithmeticSlack = 128 * Number.EPSILON * Math.max(1, sampleCount, Math.abs(expected));
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= arithmeticSlack,
    `expected ${expected}, observed ${actual}, slack ${arithmeticSlack}`);
}

// Deliberately simple O(N^2) direct transform, independent of any future FFT.
// X[k] = sum_n x[n] exp(-i 2 pi k n/N) / N.
function normalizedDft(samples: readonly number[]): ReadonlyArray<number> {
  const count = samples.length;
  return Array.from({ length: count }, (_, bin) => {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < count; index++) {
      const angle = 2 * Math.PI * bin * index / count;
      real += samples[index]! * Math.cos(angle);
      imaginary -= samples[index]! * Math.sin(angle);
    }
    return Math.hypot(real / count, imaginary / count);
  });
}

function fixtureInputIssues(p: Parameters): string[] {
  const issues: string[] = [];
  if (!Number.isFinite(p.carrierAmplitude) || p.carrierAmplitude < 0) issues.push("carrier amplitude");
  if (!Number.isFinite(p.modulationIndex) || p.modulationIndex < 0) issues.push("modulation index");
  if (!Number.isFinite(p.messageFrequencyHz) || p.messageFrequencyHz < 0) issues.push("message frequency");
  if (!Number.isFinite(p.carrierFrequencyHz) || p.carrierFrequencyHz <= 0) issues.push("carrier frequency");
  if (!Number.isFinite(p.sampleRateHz) || p.sampleRateHz <= 0) issues.push("sample rate");
  if (!Number.isSafeInteger(p.sampleCount) || p.sampleCount <= 0) issues.push("sample count");
  return issues;
}

for (const fixture of coherentFixtures) {
  test(`T-05 ${fixture.id}: independently derived samples and spectral bins`, () => {
    const p = fixture.parameters;
    assert.deepEqual(fixtureInputIssues(p), []);
    assert.equal(Number.isInteger(p.sampleCount * p.carrierFrequencyHz / p.sampleRateHz), true);
    assert.equal(Number.isInteger(p.sampleCount * p.messageFrequencyHz / p.sampleRateHz), true);
    const samples = analyticalSamples(p);
    assert.equal(samples.length, p.sampleCount);
    for (const selected of fixture.selectedSamples) close(samples[selected.index]!, selected.value, p.sampleCount);

    const bins = normalizedDft(samples);
    const expectedByBin = new Map(fixture.expectedLines.map(line => [line.bin, line]));
    const nyquistBin = p.sampleCount % 2 === 0 ? p.sampleCount / 2 : -1;
    for (let bin = 0; bin <= Math.floor(p.sampleCount / 2); bin++) {
      const line = expectedByBin.get(bin);
      const twoSided = line?.twoSidedMagnitude ?? 0;
      close(bins[bin]!, twoSided, p.sampleCount);
      const oneSided = bin === 0 || bin === nyquistBin ? bins[bin]! : 2 * bins[bin]!;
      close(oneSided, line?.oneSidedPeak ?? 0, p.sampleCount);
      if (bin > 0 && bin !== nyquistBin) close(bins[p.sampleCount - bin]!, twoSided, p.sampleCount);
    }

    // Same reference input must produce the same finite record.
    assert.deepEqual(analyticalSamples(p), samples);
  });
}

test("T-05 distinct-line location and strict unaliased baseline", () => {
  const p = coherentFixtures.find(f => f.id === "under-modulation-distinct-sidebands")!.parameters;
  assert.equal(p.carrierFrequencyHz - p.messageFrequencyHz, 1);
  assert.equal(p.carrierFrequencyHz, 2);
  assert.equal(p.carrierFrequencyHz + p.messageFrequencyHz, 3);
  assert.ok(p.sampleRateHz > 2 * (p.carrierFrequencyHz + p.messageFrequencyHz));
  const nyquist = coherentFixtures.find(f => f.id === "nyquist-upper-sideband")!.parameters;
  assert.equal(nyquist.sampleRateHz, 2 * (nyquist.carrierFrequencyHz + nyquist.messageFrequencyHz));
  const aliased = coherentFixtures.find(f => f.id === "aliased-upper-collides-with-carrier")!.parameters;
  assert.ok(aliased.sampleRateHz < 2 * (aliased.carrierFrequencyHz + aliased.messageFrequencyHz));
});

test("T-05 message-amplitude mapping is defined only with stated sensitivity", () => {
  const messageAmplitudeVolts = 0.5;
  const sensitivityPerVolt = 1;
  const modulationIndex = sensitivityPerVolt * messageAmplitudeVolts;
  assert.equal(modulationIndex, 0.5);
  assert.equal(coherentFixtures[1]!.parameters.modulationIndex, modulationIndex);
});

test("T-05 invalid numeric fixtures are excluded from analytical evaluation", () => {
  for (const fixture of invalidNumericCases) {
    assert.ok(fixtureInputIssues(fixture.parameters).length > 0, fixture.id);
    assert.ok(fixture.reason.length > 0);
  }
});
