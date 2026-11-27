import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticalPresetCoefficient,
  analyzeFourierSeries,
  buildSeriesLatex,
  compileExpression,
  createDefaultFourierModel,
  fourierEngine,
  fourierEngineRef,
  fourierModelRef,
  inspectSingleHarmonic,
  maxEpicycleHarmonics,
  sampleSeriesViewport,
  sampleTransformViewport,
  solveEpicycles,
  wasmKernel,
} from "./index.js";

test("WASM kernel validates and matches analytical square wave partial sums", () => {
  assert.equal(wasmKernel.active, true);
  const an = Float64Array.of(0, 0, 0);
  const bn = Float64Array.of(4 / Math.PI, 0, 4 / (3 * Math.PI));
  const out = wasmKernel.evalTrigSeries(0, 0.25, 5, Math.PI, 0, an, bn, 3);
  for (let i = 0; i < 5; i++) {
    const t = i * 0.25;
    const expected = (4 / Math.PI) * Math.sin(Math.PI * t) + (4 / (3 * Math.PI)) * Math.sin(3 * Math.PI * t);
    assert.ok(Math.abs(out[i]! - expected) < 1e-12);
  }
});

test("Analytical presets agree with 16-point Gauss-Legendre numerical expression evaluation", () => {
  const model = createDefaultFourierModel();
  const presetAnalysis = analyzeFourierSeries({
    ...model.series,
    inputKind: "preset",
    presetId: "square",
    amplitude: 3,
    period: 2,
    harmonics: 15,
  });
  const exprAnalysis = analyzeFourierSeries({
    ...model.series,
    inputKind: "expression",
    expression: "t < 1 ? 3 : -3",
    period: 2,
    harmonics: 15,
  });

  assert.ok(Math.abs(presetAnalysis.a0 - exprAnalysis.a0) < 1e-12);
  for (let i = 0; i < 15; i++) {
    assert.ok(Math.abs(presetAnalysis.harmonics[i]!.an - exprAnalysis.harmonics[i]!.an) < 1e-10);
    assert.ok(Math.abs(presetAnalysis.harmonics[i]!.bn - exprAnalysis.harmonics[i]!.bn) < 1e-10);
  }

  // Verify arbitrary large n (n = 501) closed-form accuracy
  const c501 = analyticalPresetCoefficient("square", 3, 0.5, 0, 501);
  assert.ok(Math.abs(c501.bn - 12 / (501 * Math.PI)) < 1e-15);
});

test("Piecewise expression, Parseval power, and Gibbs overshoot match theoretical bounds", () => {
  const model = createDefaultFourierModel();
  // Triangle wave via piecewise definition: 0..1 -> 2t, 1..2 -> 2*(2-t)
  const tri = analyzeFourierSeries({
    ...model.series,
    inputKind: "piecewise",
    period: 2,
    piecewiseSegments: [
      { start: 0, end: 1, expr: "2*t" },
      { start: 1, end: 2, expr: "2*(2 - t)" },
    ],
    harmonics: 25,
  });
  assert.ok(Math.abs(tri.a0 - 1) < 1e-12);
  assert.ok(Math.abs(tri.harmonics[0]!.an - (-8 / (Math.PI * Math.PI))) < 1e-10);
  assert.ok(tri.capturedPowerPct > 99.99);
  assert.equal(tri.hasJumpDiscontinuity, false);

  // Square wave at N=80 exhibits Wilbraham-Gibbs overshoot (~8.95% of jump height)
  const sq = analyzeFourierSeries({
    ...model.series,
    inputKind: "preset",
    presetId: "square",
    amplitude: 1,
    period: 2,
    harmonics: 80,
  });
  assert.equal(sq.hasJumpDiscontinuity, true);
  assert.ok(sq.gibbsOvershootPct > 8.5 && sq.gibbsOvershootPct < 9.5);
});

test("Desmos viewport extension continues periodic waveform accurately beyond [0, T0]", () => {
  const model = createDefaultFourierModel();
  const analysis = analyzeFourierSeries(model.series);
  const vp = sampleSeriesViewport(model.series, analysis, -6.5, 8.5, 301);
  assert.equal(vp.exact.length, 301);
  assert.equal(vp.approx.length, 301);
  // Check exact values at t = -5.5 (equivalent to +0.5 -> +1) and t = 5.5 (equivalent to 1.5 -> -1)
  const idxNeg = Math.round((-5.5 - (-6.5)) / vp.step);
  const idxPos = Math.round((5.5 - (-6.5)) / vp.step);
  assert.equal(vp.exact[idxNeg], 1);
  assert.equal(vp.exact[idxPos], -1);
});

test("Continuous Fourier Transform pairs verify rect/sinc, time-shift phase, and Parseval energy", () => {
  const model = createDefaultFourierModel();
  const tf = sampleTransformViewport({
    ...model.transform,
    signalId: "rect",
    amplitude: 2,
    width: 0.5,
    shift: 0,
    freqMin: -4,
    freqMax: 4,
  }, 801);
  // At f = 0 (index 400), |X(0)| = A * tau = 2 * 0.5 = 1
  assert.ok(Math.abs(tf.freqMagnitude[400]! - 1.0) < 1e-12);
  // First zero crossing at f = 1/tau = 2 Hz (index 600)
  assert.ok(Math.abs(tf.freqMagnitude[600]!) < 1e-12);
  // Parseval energy E = A^2 * tau = 4 * 0.5 = 2
  assert.ok(Math.abs(tf.totalEnergy - 2.0) < 1e-12);

  // Time shift t0 = 0.25 changes phase at f = 1 Hz to -pi/2 without changing magnitude
  const shifted = sampleTransformViewport({
    ...model.transform,
    signalId: "rect",
    amplitude: 2,
    width: 0.5,
    shift: 0.25,
    freqMin: -4,
    freqMax: 4,
  }, 801);
  const f1Idx = 500; // f = 1 Hz
  assert.ok(Math.abs(shifted.freqMagnitude[f1Idx]! - tf.freqMagnitude[f1Idx]!) < 1e-12);
  assert.ok(Math.abs(shifted.freqPhase[f1Idx]! - (-Math.PI / 2)) < 1e-12);
});

test("3B1B Epicycles solve up to 50 harmonics cleanly and reconstruct closed contours", () => {
  const model = createDefaultFourierModel();
  const res = solveEpicycles({
    ...model.epicycles,
    shapeId: "pi",
    harmonics: maxEpicycleHarmonics,
  });
  assert.equal(res.terms.length, 2 * maxEpicycleHarmonics + 1);
  assert.equal(res.targetContour.length, 512);
  assert.equal(res.reconstructed.length, 512);
  // Verify descending radius ordering after k = 0
  for (let i = 1; i + 1 < res.terms.length; i++) {
    assert.ok(res.terms[i]!.radius >= res.terms[i + 1]!.radius - 1e-15);
  }
  // Mean distance between reconstructed 50-harmonic Pi contour and target should be tight
  let errSum = 0;
  for (let i = 0; i < 512; i++) {
    errSum += Math.hypot(
      res.reconstructed[i]!.x - res.targetContour[i]!.x,
      res.reconstructed[i]!.y - res.targetContour[i]!.y,
    );
  }
  assert.ok(errSum / 512 < 0.03);
});

test("T-06 DomainEngine validation, provenance, cancellation, and arbitrary inspectN work", async () => {
  const model = createDefaultFourierModel();
  const v = fourierEngine.validate(model, fourierModelRef);
  assert.equal(v.ok, true);
  if (!v.ok) return;

  const outcome = await fourierEngine.run({
    runId: "r1",
    modelRevision: "1",
    engine: fourierEngineRef,
    input: v.input,
    requestedOutputs: ["waveform", "spectrum"],
  }, { requested: false });
  assert.equal(outcome.status, "success");
  if (outcome.status === "success") {
    assert.equal(outcome.outputs.wasmAccelerated, true);
    assert.equal(outcome.provenance.inputFingerprint, v.input.inputFingerprint);
  }

  const cancelled = await fourierEngine.run({
    runId: "r2",
    modelRevision: "1",
    engine: fourierEngineRef,
    input: v.input,
    requestedOutputs: ["waveform"],
  }, { requested: true });
  assert.equal(cancelled.status, "cancelled");

  const invalid = fourierEngine.validate({
    ...model,
    epicycles: { ...model.epicycles, harmonics: 101 },
    mode: "epicycles",
  }, fourierModelRef);
  assert.equal(invalid.ok, false);

  assert.throws(() => compileExpression("unknown_fn(t)"), SyntaxError);
  const h = inspectSingleHarmonic({ ...model.series, inputKind: "preset", presetId: "sawtooth", amplitude: 2 }, 100);
  assert.ok(Math.abs(h.bn - (-4 / (100 * Math.PI))) < 1e-15);
});

test("Symbolic engine simplifies expressions to clean infinite series and finite sums without 1.3312t bug", async () => {
  const { formatOmegaNT, synthesizeSimplifiedSeriesLatex, integrateGaussLegendre16, wirtingerDerivatives, curl, dot, cross } = await import("./index.js");
  const model = createDefaultFourierModel();

  // Fix verification: numeric index multiplies omega0 instead of string concatenation ("1.3312t")
  assert.equal(formatOmegaNT(1.331, "2"), "2.662t");
  assert.equal(formatOmegaNT(1.331, "3"), "3.993t");
  assert.equal(formatOmegaNT(Math.PI, "2"), "2\\pi t");

  // f(t) = t on [-pi, pi] => 2 * sum_{n=1}^{infty} (-1)^{n+1}/n sin(nt)
  const rampCfg = {
    ...model.series,
    inputKind: "expression" as const,
    expression: "t",
    periodStart: -Math.PI,
    period: 2 * Math.PI,
    harmonics: 8,
  };
  const rampAnalysis = analyzeFourierSeries(rampCfg);
  const rampLatex = buildSeriesLatex(rampCfg, rampAnalysis, rampAnalysis.harmonics[0]!);
  assert.match(rampLatex.trigonometricGeneral, /2\\sum_\{n=1\}\^\{\\infty\} \\frac\{\(-1\)\^\{n\+1\}\}\{n\} \\sin\(nt\)/);

  // Half-range even continuation of f(t) = t on [0, pi] gives pure cosine series
  const evenCfg = {
    ...model.series,
    inputKind: "expression" as const,
    expression: "t",
    periodStart: 0,
    period: Math.PI,
    continuation: "even" as const,
    harmonics: 10,
  };
  const evenAnalysis = analyzeFourierSeries(evenCfg);
  assert.ok(evenAnalysis.harmonics.every(h => Math.abs(h.bn) < 1e-10));
  const evenLatex = buildSeriesLatex(evenCfg, evenAnalysis, evenAnalysis.harmonics[0]!);
  assert.match(evenLatex.trigonometricGeneral, /\\frac\{\\pi\}\{2\}/);
  assert.match(evenLatex.trigonometricGeneral, /\\cos\(\(2k-1\)t\)/);

  // Finite trig polynomial collapses to exact finite sum without infinite sigma
  const finiteCfg = {
    ...model.series,
    inputKind: "expression" as const,
    expression: "3 + 2*cos(pi*t) - sin(3*pi*t)",
    periodStart: 0,
    period: 2,
    harmonics: 12,
  };
  const finiteAnalysis = analyzeFourierSeries(finiteCfg);
  const finiteLatex = buildSeriesLatex(finiteCfg, finiteAnalysis, finiteAnalysis.harmonics[0]!);
  assert.doesNotMatch(finiteLatex.trigonometricGeneral, /\\sum/);
  assert.match(finiteLatex.trigonometricGeneral, /3 \+ 2\\cos/);

  // Shifted asymmetric ternary `t < 1 ? 1 : -1` on [-2.72, 2.00] produces EXACT closed-form sum in n, NEVER decimal approx!
  const shiftedStepCfg = {
    ...model.series,
    inputKind: "expression" as const,
    expression: "t < 1 ? 1 : -1",
    periodStart: -2.72,
    period: 4.72,
    harmonics: 9,
  };
  const shiftedAnalysis = analyzeFourierSeries(shiftedStepCfg);
  const shiftedSynth = synthesizeSimplifiedSeriesLatex(
    shiftedStepCfg,
    shiftedAnalysis.a0,
    shiftedAnalysis.omega0,
    shiftedAnalysis.symbolicProbeHarmonics,
    shiftedAnalysis.capturedPower,
    shiftedAnalysis.totalPower,
  );
  assert.equal(shiftedSynth.exactClosedForm, true);
  assert.match(shiftedSynth.trigonometric, /\\sum_\{n=1\}\^\{\\infty\}/);
  assert.doesNotMatch(shiftedSynth.trigonometric, /1\.3312t/);

  // Extended operators: inverse trig, hyperbolic, logb, brace piecewise, deriv, integ, sum, prod
  const extExpr = compileExpression("acsc(2) + asec(2) + acot(1) + logb(2, 8) + sech(0)");
  assert.ok(Math.abs(extExpr.evaluate(0) - (Math.PI / 6 + Math.PI / 3 + Math.PI / 4 + 3 + 1)) < 1e-12);

  const braceExpr = compileExpression("{0 <= t < 1: t^2, 1 <= t <= 2: -1, 0}");
  assert.ok(Math.abs(braceExpr.evaluate(0.5) - 0.25) < 1e-12);
  assert.equal(braceExpr.evaluate(1.5), -1);
  assert.equal(braceExpr.evaluate(-1), 0);

  const calcExpr = compileExpression("deriv(t^3, t) + integ(x^2, 0, t) + sum(k, k, 1, 4) + prod(k, k, 1, 4)");
  assert.ok(Math.abs(calcExpr.evaluate(2) - (46 + 8 / 3)) < 1e-9);

  // High-harmonic stress check: 400 series harmonics cleanly evaluated in WASM kernel
  const hiAnalysis = analyzeFourierSeries({ ...model.series, harmonics: 400 });
  assert.equal(hiAnalysis.harmonics.length, 400);

  // Calculus / Complex / Vector TS module checks
  assert.ok(Math.abs(integrateGaussLegendre16(x => x * x, 0, 3, 16) - 9) < 1e-12);
  const wd = wirtingerDerivatives(z => ({ re: z.re * z.re - z.im * z.im, im: 2 * z.re * z.im }), { re: 2, im: -1 });
  assert.ok(wd.cauchyRiemannResidual < 1e-9);
  assert.equal(dot({ x: 1, y: 2, z: 3 }, { x: 4, y: -5, z: 6 }), 12);
  assert.deepEqual(cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: 1 });
  const cVec = curl(p => ({ x: -p.y, y: p.x, z: 0 }), { x: 2, y: 3, z: 0 });
  assert.ok(Math.abs(cVec.z - 2) < 1e-9);
});

test("Concise Fourier Transform symbolic solver, Show Math continuous steps, and IFT reconstruction", async () => {
  const {
    buildEpicycleMathSteps,
    buildTransformLatex,
    inspectTransformFrequency,
    sampleInverseTransformBandwidth,
    synthesizeTransformSymbolic,
  } = await import("./index.js");
  const model = createDefaultFourierModel();

  // Concise default rect transform (no redundant 1\, or /1)
  const rectRes = synthesizeTransformSymbolic(model.transform);
  assert.equal(rectRes.signalFormula, String.raw`x(t) = \operatorname{rect}\!\left(t\right)`);
  assert.equal(rectRes.transformFormula, String.raw`X(f) = \operatorname{sinc}(f)`);
  assert.ok(rectRes.steps.length >= 3);

  // Piecewise triangle -> sinc^2
  const triPw = synthesizeTransformSymbolic({
    ...model.transform,
    signalId: "custom",
    customExpr: "{-1 <= t < 0: 1 + t, 0 <= t <= 1: 1 - t, 0}",
  });
  assert.equal(triPw.transformFormula, String.raw`X(f) = \operatorname{sinc}^2(f)`);

  // Piecewise bipolar pulse -> -j 2 pi f sinc^2(f)
  const bipolarPw = synthesizeTransformSymbolic({
    ...model.transform,
    signalId: "custom",
    customExpr: "{-1 <= t < 0: -1, 0 <= t < 1: 1, 0}",
  });
  assert.match(bipolarPw.transformFormula, /\\operatorname\{sinc\}\^2\(f\)/);

  // Piecewise ramp {0 <= t < 1: t, 0} -> concise closed form
  const rampPw = synthesizeTransformSymbolic({
    ...model.transform,
    signalId: "custom",
    customExpr: "{0 <= t < 1: t, 0}",
  });
  assert.match(rampPw.transformFormula, /1 \+ j2\\pi f/);

  // Damped sine & t^n * exp(-a*t)*u(t)
  const dampSin = synthesizeTransformSymbolic({
    ...model.transform,
    signalId: "custom",
    customExpr: "exp(-2*t)*sin(3*t)*u(t)",
  });
  assert.match(dampSin.transformOmegaFormula, /\(2 \+ j\\omega\)\^2 \+ 9/);

  const t2Exp = synthesizeTransformSymbolic({
    ...model.transform,
    signalId: "custom",
    customExpr: "t^2 * exp(-3*t) * u(t)",
  });
  assert.match(t2Exp.transformFormula, /\\frac\{2\}\{\(3 \+ j2\\pi f\)\^\{?3\}?\}/);

  // Continuous Fourier series Show Math steps use integrals (\int), never DFT
  const sqAnalysis = analyzeFourierSeries(model.series);
  const sqLatex = buildSeriesLatex(model.series, sqAnalysis, sqAnalysis.harmonics[0]!);
  assert.ok(sqLatex.steps.trig.length >= 3 && sqLatex.steps.compact.length >= 3 && sqLatex.steps.complex.length >= 3);
  assert.match(sqLatex.steps.trig[0]!.latex, /\\int/);
  assert.match(sqLatex.steps.complex[0]!.latex, /\\int/);

  // Epicycles continuous Show Math steps
  const epiRes = solveEpicycles({ ...model.epicycles, harmonics: 10 });
  const epiSteps = buildEpicycleMathSteps({ ...model.epicycles, harmonics: 10 }, epiRes);
  assert.equal(epiSteps.length, 3);
  assert.match(epiSteps[1]!.latex, /\\int_0\^1/);

  // Transform latex bundle has X(omega) and steps
  const tfLatex = buildTransformLatex(model.transform);
  assert.ok(tfLatex.transformOmegaFormula.includes("X(\\omega)"));
  assert.ok(tfLatex.steps.length >= 3);

  // Inspect frequency & IFT bandwidth approximation
  const f0 = inspectTransformFrequency(model.transform, 0);
  assert.ok(Math.abs(f0.re - 1) < 1e-12 && Math.abs(f0.im) < 1e-12);
  const ift = sampleInverseTransformBandwidth(model.transform, 8, -1, 1, 21);
  // At t = 0 (index 10), rect(t) = 1 -> high-B IFT closely approximates 1
  assert.ok(Math.abs(ift[10]! - 1) < 0.15);
});

test("Exact step-by-step calculus derivation matches image 45e7196a and WolframAlpha image f09e7a5f across Trig, Compact, and Complex", async () => {
  const {
    analyzeFourierSeries,
    buildSeriesLatex,
    createDefaultFourierModel,
  } = await import("./index.js");

  const model = createDefaultFourierModel();
  const polySeriesConfig = {
    ...model.series,
    inputKind: "expression" as const,
    expression: "t^2 - 1",
    periodStart: -Math.PI,
    period: 2 * Math.PI,
    harmonics: 10,
  };

  const analysis = analyzeFourierSeries(polySeriesConfig);
  const bundle = buildSeriesLatex(polySeriesConfig, analysis, analysis.harmonics[0]!);

  // Verify Trigonometric Steps (6 steps, Image 45e7196a line-by-line)
  const trig = bundle.steps.trig;
  assert.equal(trig.length, 6);
  assert.match(trig[0]!.latex, /f\(t\) = t\^2 - 1/);
  assert.match(trig[0]!.latex, /t \\in \[-\\pi, \\pi\]/);
  assert.match(trig[1]!.latex, /\\frac\{2\}\{\\pi\}\\int_0\^\{?\\pi\}? \(t\^2 - 1\)/);
  assert.match(trig[1]!.latex, /\\left\[ \\frac\{t\^3\}\{3\} - t \\right\]_0\^\{?\\pi\}?/);
  assert.match(trig[1]!.latex, /\\frac\{2\\pi\^2\}\{3\} - 2/);
  assert.match(trig[1]!.latex, /\\frac\{a_0\}\{2\} = \\frac\{\\pi\^2\}\{3\} - 1/);
  assert.match(trig[2]!.latex, /\\left\[ \(t\^2 - 1\)\\frac\{\\sin\(nt\)\}\{n\} \+ 2t\\frac\{\\cos\(nt\)\}\{n\^2\} - 2\\frac\{\\sin\(nt\)\}\{n\^3\} \\right\]_0\^\{?\\pi\}?/);
  assert.match(trig[2]!.latex, /\\frac\{4\(-1\)\^n\}\{n\^2\}/);
  assert.match(trig[3]!.latex, /b_n = \\frac\{1\}\{\\pi\}\\int_\{-\\pi\}\^\{?\\pi\}? \(t\^2 - 1\)\\sin\(nt\)\\,dt = 0/);
  assert.match(trig[4]!.latex, /f\(t\) = \\left\(\\frac\{\\pi\^2\}\{3\} - 1\\right\) \+ \\sum_\{n=1\}\^\\infty \\frac\{4\(-1\)\^n\}\{n\^2\}\\cos\(nt\)/);
  assert.match(trig[5]!.latex, /t\^2 - 1 = \\left\(\\frac\{\\pi\^2\}\{3\} - 1\\right\) - 4\\cos\(t\) \+ \\cos\(2t\) - \\frac\{4\}\{9\}\\cos\(3t\) \+ \\frac\{1\}\{4\}\\cos\(4t\) \+ \\cdots/);

  // Verify Compact Cosine Steps (6 steps, full parity with Trig)
  const compact = bundle.steps.compact;
  assert.equal(compact.length, 6);
  assert.match(compact[1]!.latex, /C_0 = \\frac\{a_0\}\{2\} = \\frac\{\\pi\^2\}\{3\} - 1/);
  assert.match(compact[2]!.latex, /\\left\[ \(t\^2 - 1\)\\frac\{\\sin\(nt\)\}\{n\}/);
  assert.match(compact[3]!.latex, /C_n = \\sqrt\{a_n\^2 \+ b_n\^2\} = \\sqrt\{\\left\(\\frac\{4\(-1\)\^n\}\{n\^2\}\\right\)\^2 \+ 0\} = \\frac\{4\}\{n\^2\}/);
  assert.match(compact[4]!.latex, /\\sum_\{n=1\}\^\\infty \\frac\{4\}\{n\^2\}\\cos\(nt \+ \\theta_n\)/);
  assert.match(compact[5]!.latex, /4\\cos\(t - \\pi\) \+ \\cos\(2t\) \+ \\frac\{4\}\{9\}\\cos\(3t - \\pi\)/);

  // Verify Complex Exponential Steps & WolframAlpha Values Table (6 steps, Image f09e7a5f)
  const cpx = bundle.steps.complex;
  assert.equal(cpx.length, 6);
  assert.match(cpx[1]!.latex, /c_0 = \\frac\{1\}\{2\\pi\}\\int_\{-\\pi\}\^\{\\pi\} \(t\^2 - 1\)\\,dt/);
  assert.match(cpx[2]!.latex, /e\^\{-j nt\}/);
  assert.match(cpx[3]!.latex, /\\frac\{2\(-1\)\^n\}\{n\^2\}/);
  const wolframStep = cpx[5]!;
  assert.match(wolframStep.latex, /\\begin\{gathered\}/);
  assert.match(wolframStep.latex, /n = 0:\\quad \\frac\{\\pi\^2\}\{3\} - 1/);
  assert.match(wolframStep.latex, /n = 1:\\quad -2e\^\{-it\} - 2e\^\{it\} - 1 \+ \\frac\{\\pi\^2\}\{3\}/);
  assert.match(wolframStep.latex, /n = 2:\\quad -2e\^\{-it\} - 2e\^\{it\} \+ \\frac\{1\}\{2\}e\^\{-2it\} \+ \\frac\{1\}\{2\}e\^\{2it\} - 1 \+ \\frac\{\\pi\^2\}\{3\}/);
  assert.match(wolframStep.latex, /n = 3:\\quad -2e\^\{-it\} - 2e\^\{it\} \+ \\frac\{1\}\{2\}e\^\{-2it\} \+ \\frac\{1\}\{2\}e\^\{2it\} - \\frac\{2\}\{9\}e\^\{-3it\} - \\frac\{2\}\{9\}e\^\{3it\} - 1 \+ \\frac\{\\pi\^2\}\{3\}/);

  // Verify NON-HARDCODED general polynomials (2*t^2 and t on [-pi, pi]) across all 3 forms
  const twoT2Cfg = { ...polySeriesConfig, expression: "2*t^2" };
  const twoT2An = analyzeFourierSeries(twoT2Cfg);
  const twoT2Bundle = buildSeriesLatex(twoT2Cfg, twoT2An, twoT2An.harmonics[0]!);
  assert.match(twoT2Bundle.steps.compact[3]!.latex, /\\frac\{8\}\{n\^2\}/);
  assert.match(twoT2Bundle.steps.compact[5]!.latex, /8\\cos\(t - \\pi\)/);
  assert.match(twoT2Bundle.steps.complex[3]!.latex, /\\frac\{4\(-1\)\^n\}\{n\^2\}/);
  assert.match(twoT2Bundle.steps.complex[5]!.latex, /-4e\^\{-it\} - 4e\^\{it\}/);

  const oddTCfg = { ...polySeriesConfig, expression: "t" };
  const oddTAn = analyzeFourierSeries(oddTCfg);
  const oddTBundle = buildSeriesLatex(oddTCfg, oddTAn, oddTAn.harmonics[0]!);
  assert.equal(oddTBundle.steps.compact.length, 6);
  assert.equal(oddTBundle.steps.complex.length, 6);
  assert.match(oddTBundle.steps.compact[3]!.latex, /\\frac\{2\}\{n\}/);
  assert.match(oddTBundle.steps.compact[5]!.latex, /2\\cos\(t - \\frac\{\\pi\}\{2\}\)/);
  assert.match(oddTBundle.steps.complex[3]!.latex, /\\frac\{-j\(-1\)\^\{n\+1\}\}\{n\}/);
  assert.match(oddTBundle.steps.complex[5]!.latex, /j ?e\^\{-it\} - j ?e\^\{it\}/);
});

test("Show Math mathematical approximation explanations cover graphical splines, GL16 quadrature, epicycles, and transform", async () => {
  const {
    analyzeFourierSeries,
    buildEpicycleApproximationStep,
    buildSeriesApproximationStep,
    buildTransformApproximationStep,
    createDefaultFourierModel,
    sampleTransformViewport,
    solveEpicycles,
  } = await import("./index.js");

  const model = createDefaultFourierModel();

  // 1) Graphical draw (Catmull-Rom spline, linear, step)
  for (const interp of ["smooth", "linear", "step"] as const) {
    const gCfg = {
      ...model.series,
      inputKind: "graphical" as const,
      graphicalInterp: interp,
    };
    const gAn = analyzeFourierSeries(gCfg);
    const gStep = buildSeriesApproximationStep(gCfg, gAn);
    assert.ok(gStep.note && gStep.note.includes("Gauss-Legendre"));
    assert.match(gStep.latex, /\\mathrm\{RMS\}/);
  }

  // 2) Epicycle contour parameterization & periodic trapezoidal rule + RMSE
  const epiCfg = { ...model.epicycles, harmonics: 15 };
  const epiAn = solveEpicycles(epiCfg);
  const epiApproxStep = buildEpicycleApproximationStep(epiCfg, epiAn);
  assert.ok(epiApproxStep.note && epiApproxStep.note.includes("512"));
  assert.match(epiApproxStep.latex, /\\sum_\{m=0\}\^\{511\}/);
  assert.match(epiApproxStep.latex, /\\mathrm\{RMS\}/);

  // 3) Transform preset & custom quadrature approximation steps
  const tfPresetStep = buildTransformApproximationStep(model.transform, sampleTransformViewport(model.transform, 128));
  assert.ok(tfPresetStep.note && tfPresetStep.note.includes("Gauss-Legendre"));
  assert.match(tfPresetStep.latex, /\\sum_\{m=1\}\^\{96\}/);

  const tfCustomCfg = { ...model.transform, signalId: "custom" as const, customExpr: "exp(-abs(t))" };
  const tfCustomStep = buildTransformApproximationStep(tfCustomCfg, sampleTransformViewport(tfCustomCfg, 128));
  assert.ok(tfCustomStep.note && tfCustomStep.note.includes("1280"));
  assert.match(tfCustomStep.latex, /\\sum_\{k=1\}\^\{1280\}/);
});




