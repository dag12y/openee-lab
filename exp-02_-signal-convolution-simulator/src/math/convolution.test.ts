import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultContinuousH,
  defaultContinuousX,
  defaultDiscreteH,
  defaultDiscreteX,
  evalContinuousConvolutionAt,
  evalContinuousRegular,
  evalDiscreteConvolutionAt,
  evalDiscreteSignal,
  getContinuousActiveControls,
  getDiscreteActiveControls,
  sample3DSurfaceGrid,
  sampleContinuousOutput,
} from './convolution';

test('Rect * Rect yields triangular convolution with exact peak and support', () => {
  const x = { ...defaultContinuousX(), preset: 'rect' as const, amplitude: 1, shift: 0, width: 2 };
  const h = { ...defaultContinuousH(), preset: 'rect' as const, amplitude: 1, shift: 0, width: 2 };

  // Peak at t = 0 should be W * A_x * A_h = 2
  const at0 = evalContinuousConvolutionAt(0, x, h);
  assert.ok(Math.abs(at0.value - 2.0) < 0.02, `expected ~2.0, got ${at0.value}`);

  // At t = 1, overlap of [-1, 1] and [0, 2] has length 1
  const at1 = evalContinuousConvolutionAt(1, x, h);
  assert.ok(Math.abs(at1.value - 1.0) < 0.02, `expected ~1.0, got ${at1.value}`);

  // Outside support |t| > 2 should be 0
  const at25 = evalContinuousConvolutionAt(2.5, x, h);
  assert.ok(Math.abs(at25.value) < 1e-6);
});

test('Analytical Dirac delta sifting: x * delta and delta * h', () => {
  const xRect = { ...defaultContinuousX(), preset: 'rect' as const, amplitude: 2, shift: 1, width: 2 };
  const hDelta = { ...defaultContinuousH(), preset: 'impulse' as const, amplitude: 1.5, shift: 0.5 };

  // (x * h)(t) = 1.5 * xRect(t - 0.5). xRect is centered at 1 with width 2 ([0, 2]),
  // so shifted result has value 3.0 on [0.5, 2.5].
  assert.equal(evalContinuousConvolutionAt(1.5, xRect, hDelta).value, 3.0);
  assert.equal(evalContinuousConvolutionAt(3.0, xRect, hDelta).value, 0);

  const xDelta = { ...defaultContinuousX(), preset: 'impulse' as const, amplitude: 2, shift: -1 };
  const hExp = { ...defaultContinuousH(), preset: 'exp' as const, amplitude: 1, shift: 0, width: 4, decay: 1 };

  // (xDelta * hExp)(t) = 2 * hExp(t + 1)
  assert.equal(evalContinuousConvolutionAt(-1, xDelta, hExp).value, 2.0);
  assert.ok(Math.abs(evalContinuousConvolutionAt(0, xDelta, hExp).value - 2 * Math.exp(-1)) < 1e-9);
  assert.equal(evalContinuousConvolutionAt(-1.5, xDelta, hExp).value, 0);
});

test('Analytical Dirac delta sifting: delta * delta', () => {
  const xDelta = { ...defaultContinuousX(), preset: 'impulse' as const, amplitude: 2.5, shift: 1.2 };
  const hDelta = { ...defaultContinuousH(), preset: 'impulse' as const, amplitude: -1.2, shift: -0.7 };

  const res = evalContinuousConvolutionAt(0, xDelta, hDelta);
  assert.ok(res.impulse !== null);
  assert.ok(Math.abs(res.impulse.position - 0.5) < 1e-9);
  assert.ok(Math.abs(res.impulse.weight - -3.0) < 1e-9);

  const curve = sampleContinuousOutput(xDelta, hDelta);
  assert.equal(curve.impulses.length, 1);
  assert.ok(Math.abs(curve.impulses[0].position - 0.5) < 1e-9);
});

test('Commutativity of continuous convolution', () => {
  const x = { ...defaultContinuousX(), preset: 'triangle' as const, amplitude: 1.5, shift: -0.5, width: 2.5 };
  const h = { ...defaultContinuousH(), preset: 'exp' as const, amplitude: 1.2, shift: 0.3, width: 4, decay: 0.8 };

  for (const t of [-2.5, -1, 0, 1.2, 3.0]) {
    const xy = evalContinuousConvolutionAt(t, x, h).value;
    const yx = evalContinuousConvolutionAt(t, h, x).value;
    assert.ok(Math.abs(xy - yx) < 0.025, `commutativity mismatch at t=${t}: ${xy} vs ${yx}`);
  }
});

test('Discrete convolution exactness and delta[n] sifting', () => {
  const x = { ...defaultDiscreteX(), preset: 'rect' as const, amplitude: 1, shift: 0, length: 3 }; // k = -1, 0, 1
  const h = { ...defaultDiscreteH(), preset: 'impulse' as const, amplitude: 2, shift: 2 }; // 2 * delta[k - 2]

  assert.equal(evalDiscreteConvolutionAt(0, x, h), 0);
  assert.equal(evalDiscreteConvolutionAt(1, x, h), 2);
  assert.equal(evalDiscreteConvolutionAt(2, x, h), 2);
  assert.equal(evalDiscreteConvolutionAt(3, x, h), 2);
  assert.equal(evalDiscreteConvolutionAt(4, x, h), 0);

  // Commutativity check
  const hExp = { ...defaultDiscreteH(), preset: 'exp' as const, amplitude: 1.5, shift: -1, length: 5, decay: 0.5 };
  for (let n = -8; n <= 8; n++) {
    assert.ok(
      Math.abs(evalDiscreteConvolutionAt(n, x, hExp) - evalDiscreteConvolutionAt(n, hExp, x)) < 1e-12,
    );
  }
});

test('Context-aware active controls match preset requirements', () => {
  assert.deepEqual(getContinuousActiveControls('impulse'), {
    amplitude: true,
    shift: true,
    width: false,
    frequency: false,
    decay: false,
  });
  assert.deepEqual(getContinuousActiveControls('exp'), {
    amplitude: true,
    shift: true,
    width: true,
    frequency: false,
    decay: true,
  });
  assert.deepEqual(getContinuousActiveControls('sinc'), {
    amplitude: true,
    shift: true,
    width: true,
    frequency: true,
    decay: false,
  });
  assert.deepEqual(getDiscreteActiveControls('sine'), {
    amplitude: true,
    shift: true,
    length: true,
    omega: true,
    decay: false,
  });
});

test('Sinc evaluates cleanly at origin without NaN', () => {
  const sinc = { ...defaultContinuousH(), preset: 'sinc' as const, amplitude: 2, shift: 0, width: 4, frequency: 1 };
  assert.equal(evalContinuousRegular(0, sinc), 2);
  assert.ok(Math.abs(evalContinuousRegular(0.5, sinc)) < 1e-9);
});

test('Discrete bipolar and double presets produce expected non-zero samples', () => {
  const bip = { ...defaultDiscreteX(), preset: 'bipolar' as const, amplitude: 2, shift: 0, length: 4 };
  assert.equal(evalDiscreteSignal(-1, bip), 2);
  assert.equal(evalDiscreteSignal(0, bip), -2);
  assert.equal(evalDiscreteSignal(1, bip), -2);

  const dbl = { ...defaultDiscreteX(), preset: 'double' as const, amplitude: 1, shift: 0, length: 5 };
  // Left and right pulses with central gap at 0
  assert.equal(evalDiscreteSignal(-2, dbl), 1);
  assert.equal(evalDiscreteSignal(0, dbl), 0);
  assert.equal(evalDiscreteSignal(2, dbl), 1);
});

test('3D surface grid generates finite heights and positive maxAbsHeight', () => {
  const grid = sample3DSurfaceGrid(defaultContinuousX(), defaultContinuousH(), 41);
  assert.equal(grid.heights.length, 41 * 41);
  assert.ok(grid.maxAbsHeight > 0.5);
  for (let i = 0; i < grid.heights.length; i++) {
    assert.ok(Number.isFinite(grid.heights[i]));
  }
});

test('Discrete convolution respects supports beyond legacy fixed summation limits', () => {
  const x = { ...defaultDiscreteX(), preset: 'impulse' as const, shift: 50, amplitude: 3 };
  const h = { ...defaultDiscreteH(), preset: 'impulse' as const, shift: -4, amplitude: 2 };
  assert.equal(evalDiscreteConvolutionAt(46, x, h), 6);
  assert.equal(evalDiscreteConvolutionAt(45, x, h), 0);
});

test('Continuous convolution integrates shifted pulses outside legacy bounds', () => {
  const x = { ...defaultContinuousX(), preset: 'rect' as const, shift: 30, width: 2, amplitude: 1 };
  const h = { ...defaultContinuousH(), preset: 'rect' as const, shift: -4, width: 2, amplitude: 1 };
  assert.ok(Math.abs(evalContinuousConvolutionAt(26, x, h).value - 2) < 0.02);
  assert.ok(Math.abs(evalContinuousConvolutionAt(27, x, h).value - 1) < 0.02);
});
