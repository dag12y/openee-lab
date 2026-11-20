import assert from "node:assert/strict";
import test from "node:test";
import {
  binFrequencyHz, directDft, maxDftSamples, maxSignalSamples, recordDuration,
  sampleTime, validateSignal, type RealSignal,
} from "./index.js";

function signal(values: number[], sampleRateHz = 8): RealSignal {
  return { grid: { sampleRateHz, sampleCount: values.length, startTimeSeconds: 2 },
    unit: "V", samples: Float64Array.from(values) };
}

// Short, unit-scale analytical examples allow a few dozen floating-point operations.
function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= 64 * Number.EPSILON * Math.max(1, Math.abs(expected)),
    `expected ${expected}, got ${actual}`);
}

test("time origin, exclusive endpoint and even and odd signed bin coordinates", () => {
  const { grid } = signal([0, 0, 0, 0]);
  assert.equal(recordDuration(grid), 0.5);
  assert.deepEqual([0, 1, 2, 3].map(n => sampleTime(grid, n)), [2, 2.125, 2.25, 2.375]);
  assert.throws(() => sampleTime(grid, 4), RangeError);
  assert.deepEqual([0, 1, 2, 3].map(k => binFrequencyHz(grid, k, "two-sided")), [0, 2, -4, -2]);
  assert.equal(binFrequencyHz(grid, 2, "one-sided"), 4);
  const odd = signal([0, 0, 0], 6).grid;
  assert.deepEqual([0, 1, 2].map(k => binFrequencyHz(odd, k, "two-sided")), [0, 2, -2]);
  assert.throws(() => binFrequencyHz(grid, 3, "one-sided"), RangeError);
});

test("coherent sine has opposite signed imaginary coefficients", () => {
  const input = signal([0, 1, 0, -1]);
  const two = directDft(input, "two-sided");
  const one = directDft(input, "one-sided");
  assert.equal(one.unit, "V");
  [-0, -0.5, 0, 0.5].forEach((value, k) => close(two.imaginary[k]!, value));
  two.real.forEach(value => close(value, 0));
  [0, 0.5, 0, 0.5].forEach((value, k) => close(two.amplitude[k]!, value));
  [0, 1, 0].forEach((value, k) => close(one.amplitude[k]!, value));
  close(one.imaginary[1]!, -0.5);
});

test("DC and Nyquist amplitudes are undoubled and retain coefficient sign", () => {
  // 2 - 3(-1)^n
  const result = directDft(signal([-1, 5, -1, 5]), "one-sided");
  [2, 0, 3].forEach((value, k) => close(result.amplitude[k]!, value));
  close(result.real[2]!, -3);
});

test("noncoherent cosine leaks according to a three-sample analytical sum", () => {
  // Sample a 2 Hz cosine at 8 Hz for three points, not an integral number of cycles.
  const result = directDft(signal([1, 0, -1]), "one-sided");
  close(result.amplitude[0]!, 0);
  close(result.amplitude[1]!, 2 * Math.sqrt(3) / 3);
});

test("sampled real cosines at 2 Hz and 6 Hz alias at 8 Hz", () => {
  const grid = signal([0, 0, 0, 0]).grid;
  for (const hz of [2, 6]) {
    const input = signal([0, 1, 2, 3].map(n => Math.cos(2 * Math.PI * hz *
      (sampleTime(grid, n) - grid.startTimeSeconds))));
    const spectrum = directDft(input, "one-sided");
    assert.equal(binFrequencyHz(grid, 1, "one-sided"), 2);
    [0, 1, 0].forEach((value, k) => close(spectrum.amplitude[k]!, value));
  }
});

test("invalid grids, units and buffers fail before transform", () => {
  const good = signal([1, 2]);
  for (const grid of [
    { ...good.grid, sampleRateHz: 0 }, { ...good.grid, sampleRateHz: Infinity },
    { ...good.grid, startTimeSeconds: NaN }, { ...good.grid, sampleCount: 1.5 },
    { ...good.grid, sampleCount: maxSignalSamples + 1 },
  ]) assert.throws(() => recordDuration(grid), RangeError);
  assert.throws(() => validateSignal({ ...good, unit: "" }), TypeError);
  assert.throws(() => validateSignal({ ...good, samples: new Float64Array(1) }), TypeError);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.throws(() => directDft(signal([1, invalid]), "one-sided"), RangeError);
  }
  assert.throws(() => directDft({
    ...good, grid: { ...good.grid, sampleCount: maxDftSamples + 1 },
  }, "two-sided"), /work limit/);
});

test("repeat runs are deterministic and constant subnormal signals preserve DC", () => {
  const input = signal([Number.MIN_VALUE, Number.MIN_VALUE]);
  const actual = directDft(input, "one-sided");
  assert.deepEqual(actual, directDft(input, "one-sided"));
  assert.equal(actual.amplitude[0], Number.MIN_VALUE);
  assert.equal(actual.amplitude[1], 0);
});
