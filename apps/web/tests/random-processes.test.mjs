import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeProcesses, defaultProcessConfig, distributionsAt, isPositiveSemiDefinite, processKinds,
  validateProcessConfig,
} from "../src/random-processes.ts";

const config = { ...defaultProcessConfig, sampleCount: 128, realizations: 8, lag: 4 };

test("every process generator is deterministic, bounded, and returns finite analysis", () => {
  for (const kind of processKinds) {
    const settings = { ...config, kind };
    const first = analyzeProcesses(settings);
    const repeat = analyzeProcesses(settings);
    assert.deepEqual(first.paths, repeat.paths, kind);
    assert.equal(first.paths.length, settings.realizations, kind);
    assert.equal(first.paths[0].length, settings.sampleCount, kind);
    for (const values of [
      first.mean, first.variance, first.autocorrelation, first.autocovariance,
      first.correlationCoefficient, first.crossCorrelation, first.crossCovariance,
      first.crossCoefficient, first.meanConvergence, first.correlationConvergence,
      first.ensembleMeanConvergence, first.ensembleCorrelationConvergence,
      first.timeCorrelationAtLag,
    ]) assert.ok(values.every(Number.isFinite), kind);
    assert.ok(first.variance.every(value => value >= 0), kind);
    assert.equal(first.autocorrelationValid, true, kind);
    assert.equal(first.timeCorrelationAtLag.length, settings.sampleCount - settings.lag, kind);
  }
});

test("white noise ensemble moments and time-selected PDFs follow their normalization", () => {
  const result = analyzeProcesses({
    ...config, kind: "white-noise", sampleCount: 512, realizations: 32, lag: 8,
  });
  const mean = result.mean.reduce((sum, value) => sum + value, 0) / result.mean.length;
  const variance = result.variance.reduce((sum, value) => sum + value, 0) / result.variance.length;
  assert.ok(Math.abs(mean) < 0.06, `mean=${mean}`);
  assert.ok(variance > 0.85 && variance < 1.15, `variance=${variance}`);

  const distributions = distributionsAt(result.paths, 90, 8);
  const step = distributions.meanPdf.centers[1] - distributions.meanPdf.centers[0];
  const area = distributions.meanPdf.density.reduce((sum, value) => sum + value * step, 0);
  assert.ok(Math.abs(area - 1) < 1e-12);
  assert.equal(distributions.jointPdf.x.length, result.paths.length);
  assert.equal(distributions.jointPdf.y.length, result.paths.length);
  assert.ok(distributions.jointPdf.x.every(Number.isFinite));
  assert.ok(distributions.jointPdf.y.every(Number.isFinite));
  assert.throws(() => distributionsAt(result.paths, 510, 8), RangeError);
  assert.throws(() => distributionsAt(result.paths, 90, 8, 1), RangeError);
});

test("random-phase sinusoid autocorrelation matches its analytical finite-record estimate", () => {
  const settings = { ...defaultProcessConfig, kind: "random-phase", sampleCount: 320, realizations: 24, lag: 8 };
  const result = analyzeProcesses(settings);
  const expected = settings.amplitude ** 2 / 2 *
    Math.cos(2 * Math.PI * settings.cycles * settings.lag / settings.sampleCount) *
    (settings.sampleCount - settings.lag) / settings.sampleCount;
  assert.ok(Math.abs(result.zeroLagPower - settings.amplitude ** 2 / 2) < 1e-12);
  assert.ok(Math.abs(result.autocorrelation[settings.lag] - expected) < 0.01);
});

test("stationarity verdicts distinguish stationary, nonstationary, and nonergodic examples", () => {
  const stationary = analyzeProcesses({ ...config, kind: "markov" });
  assert.equal(stationary.stationarity.strictSense, true);
  assert.equal(stationary.stationarity.wideSense, true);
  assert.ok(Math.abs(stationary.markovSteadyState[0] + stationary.markovSteadyState[1] - 1) < 1e-12);
  const expectedState0 = (1 - config.p11) / (2 - config.p00 - config.p11);
  assert.ok(Math.abs(stationary.markovSteadyState[0] - expectedState0) < 1e-12);

  const randomWalk = analyzeProcesses({ ...config, kind: "random-walk" });
  assert.equal(randomWalk.stationarity.strictSense, false);
  assert.equal(randomWalk.stationarity.wideSense, false);
  assert.equal(randomWalk.stationarity.meanErgodic, undefined);
  assert.equal(randomWalk.stationarity.correlationErgodic, undefined);

  const randomMean = analyzeProcesses({ ...config, kind: "gaussian", randomOffsetStd: 0.5 });
  assert.equal(randomMean.stationarity.strictSense, true);
  assert.equal(randomMean.stationarity.meanErgodic, false);
  assert.equal(randomMean.stationarity.correlationErgodic, false);
});

test("positive-semidefinite checker accepts valid and rejects impossible correlations", () => {
  assert.equal(isPositiveSemiDefinite([1, 0.5, 0.25], 3), true);
  assert.equal(isPositiveSemiDefinite([1, 2], 2), false);
  assert.equal(isPositiveSemiDefinite([1], 0), false);
  assert.equal(isPositiveSemiDefinite([1, Number.NaN], 2), false);
});

test("sample, ensemble, and lag bounds are enforced before generation", () => {
  assert.match(validateProcessConfig({ ...config, sampleCount: 1025 }), /Samples/);
  assert.match(validateProcessConfig({ ...config, realizations: 41 }), /Realizations/);
  assert.match(validateProcessConfig({ ...config, sampleCount: 128, lag: 33 }), /Lag/);
  assert.equal(validateProcessConfig(config), undefined);
});
