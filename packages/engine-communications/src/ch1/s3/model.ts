import type { Diagnostic, ModelRef, EngineRef } from "../../../../contracts/src/index.js";
import { compileExpression } from "./expr.js";
import type { EpicycleShapeId, Point2D } from "./shapes.js";

export type PresetWaveformId =
  | "square"
  | "sawtooth"
  | "triangle"
  | "half-rectified"
  | "full-rectified"
  | "pulse";

export type TransformSignalId =
  | "rect"
  | "tri"
  | "gaussian"
  | "exponential"
  | "modulated-rect"
  | "custom";

export type PiecewiseSegment = Readonly<{
  start: number;
  end: number;
  expr: string;
}>;

export type SeriesInputKind = "preset" | "expression" | "piecewise" | "graphical";
export type GraphicalInterpolation = "linear" | "smooth" | "step";
export type PeriodicContinuation = "periodic" | "even" | "odd";

export type FourierSeriesConfig = Readonly<{
  inputKind: SeriesInputKind;
  presetId: PresetWaveformId;
  amplitude: number;
  periodStart: number;
  period: number;
  continuation: PeriodicContinuation;
  dutyCycle: number;
  dcOffset: number;
  expression: string;
  piecewiseStart: number;
  piecewiseSegments: readonly PiecewiseSegment[];
  graphicalPoints: readonly Point2D[];
  graphicalInterp: GraphicalInterpolation;
  harmonics: number;
  inspectN: number;
  viewMin: number;
  viewMax: number;
}>;

export type FourierTransformConfig = Readonly<{
  signalId: TransformSignalId;
  amplitude: number;
  width: number;
  shift: number;
  modFreqHz: number;
  decayRate: number;
  customExpr: string;
  timeMin: number;
  timeMax: number;
  freqMin: number;
  freqMax: number;
}>;

export type EpicyclesConfig = Readonly<{
  shapeId: EpicycleShapeId;
  customPath: readonly Point2D[];
  harmonics: number;
}>;

export type FourierModel = Readonly<{
  mode: "series" | "transform" | "epicycles";
  sampleCount: number;
  series: FourierSeriesConfig;
  transform: FourierTransformConfig;
  epicycles: EpicyclesConfig;
}>;

export const fourierModelRef: ModelRef = Object.freeze({
  domain: "communications",
  kind: "fourier-series-transform",
  modelVersion: "1",
});

export const fourierEngineRef: EngineRef = Object.freeze({
  engineId: "built-in-fourier-s3",
  engineVersion: "1",
});

export const maxSeriesHarmonics = 400;
export const maxSeriesEpicyclePhasors = 200;
export const maxEpicycleHarmonics = 100;
export const maxPlotSamples = 2048;

export const defaultFourierModel: FourierModel = {
  mode: "series",
  sampleCount: 640,
  series: {
    inputKind: "preset",
    presetId: "square",
    amplitude: 1,
    periodStart: 0,
    period: 2,
    continuation: "periodic",
    dutyCycle: 0.5,
    dcOffset: 0,
    expression: "t < 1 ? 1 : -1",
    piecewiseStart: 0,
    piecewiseSegments: [
      { start: 0, end: 1, expr: "1" },
      { start: 1, end: 2, expr: "-1" },
    ],
    graphicalPoints: [
      { x: 0.0, y: 0.0 },
      { x: 0.15, y: 0.9 },
      { x: 0.35, y: 0.8 },
      { x: 0.5, y: 0.0 },
      { x: 0.65, y: -0.8 },
      { x: 0.85, y: -0.9 },
    ],
    graphicalInterp: "linear",
    harmonics: 9,
    inspectN: 5,
    viewMin: -2,
    viewMax: 4,
  },
  transform: {
    signalId: "rect",
    amplitude: 1,
    width: 1,
    shift: 0,
    modFreqHz: 3,
    decayRate: 1.5,
    customExpr: "exp(-2 * abs(t)) * cos(2 * pi * 2 * t)",
    timeMin: -3,
    timeMax: 3,
    freqMin: -6,
    freqMax: 6,
  },
  epicycles: {
    shapeId: "pi",
    customPath: [],
    harmonics: 50,
  },
};

function diag(code: string, message: string, field?: string): Diagnostic {
  return {
    severity: "error",
    code: `fourier.${code}`,
    message,
    ...(field === undefined ? {} : { location: { field } }),
  };
}

export function validateFourierModel(model: FourierModel): Diagnostic[] {
  const issues: Diagnostic[] = [];
  if (!Number.isSafeInteger(model.sampleCount) || model.sampleCount < 32 || model.sampleCount > maxPlotSamples) {
    issues.push(diag("invalid-sampling", `Sample count must be an integer between 32 and ${maxPlotSamples}.`, "sampleCount"));
  }

  if (model.mode === "series") {
    const s = model.series;
    if (!Number.isFinite(s.amplitude) || Math.abs(s.amplitude) > 1e6) {
      issues.push(diag("invalid-amplitude", "Enter a finite amplitude within ±10⁶ V.", "amplitude"));
    }
    if (!Number.isFinite(s.periodStart) || Math.abs(s.periodStart) > 1e6) {
      issues.push(diag("invalid-period-start", "Region start t_start must be finite.", "periodStart"));
    }
    if (!Number.isFinite(s.period) || s.period <= 0 || s.period > 1e6) {
      issues.push(diag("invalid-period", "Period T₀ must be strictly positive and finite.", "period"));
    }
    if (!Number.isFinite(s.dutyCycle) || s.dutyCycle <= 0.01 || s.dutyCycle >= 0.99) {
      issues.push(diag("invalid-duty", "Duty cycle must be strictly between 0.01 and 0.99.", "dutyCycle"));
    }
    if (!Number.isFinite(s.dcOffset) || Math.abs(s.dcOffset) > 1e6) {
      issues.push(diag("invalid-offset", "DC offset must be finite.", "dcOffset"));
    }
    if (!Number.isSafeInteger(s.harmonics) || s.harmonics < 1 || s.harmonics > maxSeriesHarmonics) {
      issues.push(diag("invalid-harmonics", `Harmonics N must be an integer from 1 to ${maxSeriesHarmonics}.`, "harmonics"));
    }
    if (!Number.isSafeInteger(s.inspectN) || s.inspectN < 0 || s.inspectN > 1_000_000) {
      issues.push(diag("invalid-inspect-n", "Inspected harmonic n must be a non-negative integer ≤ 1,000,000.", "inspectN"));
    }
    if (!Number.isFinite(s.viewMin) || !Number.isFinite(s.viewMax) || s.viewMax <= s.viewMin) {
      issues.push(diag("invalid-viewport", "Time viewport requires viewMax > viewMin.", "viewMax"));
    }
    if (s.inputKind === "expression") {
      try {
        compileExpression(s.expression);
      } catch (err) {
        issues.push(diag("invalid-expression", err instanceof Error ? err.message : "Invalid mathematical expression.", "expression"));
      }
    } else if (s.inputKind === "piecewise") {
      if (s.piecewiseSegments.length === 0 || s.piecewiseSegments.length > 24) {
        issues.push(diag("invalid-piecewise", "Provide 1 to 24 piecewise segments.", "piecewiseSegments"));
      }
      for (let i = 0; i < s.piecewiseSegments.length; i++) {
        const seg = s.piecewiseSegments[i]!;
        if (!Number.isFinite(seg.start) || !Number.isFinite(seg.end) || seg.end <= seg.start) {
          issues.push(diag("invalid-segment", `Segment ${i + 1} must have end > start.`, "piecewiseSegments"));
        }
        try {
          compileExpression(seg.expr);
        } catch (err) {
          issues.push(diag("invalid-segment-expr", `Segment ${i + 1}: ${err instanceof Error ? err.message : "Invalid expression"}`, "piecewiseSegments"));
        }
      }
    } else if (s.inputKind === "graphical") {
      if (s.graphicalPoints.length < 2 || s.graphicalPoints.length > 512) {
        issues.push(diag("invalid-graphical", "Draw at least 2 points across the period.", "graphicalPoints"));
      }
    }
  } else if (model.mode === "transform") {
    const tf = model.transform;
    if (!Number.isFinite(tf.amplitude) || Math.abs(tf.amplitude) > 1e6) {
      issues.push(diag("invalid-amplitude", "Amplitude must be finite.", "amplitude"));
    }
    if (!Number.isFinite(tf.width) || tf.width <= 0 || tf.width > 1e4) {
      issues.push(diag("invalid-width", "Pulse width τ / σ must be strictly positive.", "width"));
    }
    if (!Number.isFinite(tf.shift) || Math.abs(tf.shift) > 1e4) {
      issues.push(diag("invalid-shift", "Time shift t₀ must be finite.", "shift"));
    }
    if (!Number.isFinite(tf.decayRate) || tf.decayRate <= 0 || tf.decayRate > 1e4) {
      issues.push(diag("invalid-decay", "Decay rate a must be strictly positive.", "decayRate"));
    }
    if (!Number.isFinite(tf.modFreqHz) || Math.abs(tf.modFreqHz) > 1e5) {
      issues.push(diag("invalid-mod-freq", "Modulation frequency must be finite.", "modFreqHz"));
    }
    if (!Number.isFinite(tf.timeMin) || !Number.isFinite(tf.timeMax) || tf.timeMax <= tf.timeMin) {
      issues.push(diag("invalid-time-window", "Time viewport requires timeMax > timeMin.", "timeMax"));
    }
    if (!Number.isFinite(tf.freqMin) || !Number.isFinite(tf.freqMax) || tf.freqMax <= tf.freqMin) {
      issues.push(diag("invalid-freq-window", "Frequency viewport requires freqMax > freqMin.", "freqMax"));
    }
    if (tf.signalId === "custom") {
      try {
        compileExpression(tf.customExpr);
      } catch (err) {
        issues.push(diag("invalid-expression", err instanceof Error ? err.message : "Invalid transform expression.", "customExpr"));
      }
    }
  } else if (model.mode === "epicycles") {
    const ep = model.epicycles;
    if (!Number.isSafeInteger(ep.harmonics) || ep.harmonics < 1 || ep.harmonics > maxEpicycleHarmonics) {
      issues.push(diag("invalid-epicycles", `Epicycle harmonics K must be an integer from 1 to ${maxEpicycleHarmonics}.`, "harmonics"));
    }
    if (ep.shapeId === "custom" && ep.customPath.length < 3) {
      issues.push(diag("invalid-shape", "Draw a closed loop with at least 3 points for custom epicycles.", "customPath"));
    }
  }

  return issues;
}
