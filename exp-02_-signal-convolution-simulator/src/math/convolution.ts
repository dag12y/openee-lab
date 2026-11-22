export type ViewMode = 'continuous' | 'discrete' | 'space3d' | 'image2d';

export type ContinuousPreset =
  | 'rect'
  | 'double'
  | 'triangle'
  | 'sine'
  | 'bipolar'
  | 'impulse'
  | 'exp'
  | 'sinc';

export type DiscretePreset =
  | 'rect'
  | 'double'
  | 'triangle'
  | 'sine'
  | 'bipolar'
  | 'impulse'
  | 'exp';

export interface ContinuousSignalParams {
  preset: ContinuousPreset;
  amplitude: number; // A
  shift: number; // t0
  width: number; // W
  frequency: number; // f
  decay: number; // alpha
}

export interface DiscreteSignalParams {
  preset: DiscretePreset;
  amplitude: number; // A
  shift: number; // n0 (integer)
  length: number; // L (integer)
  omega: number; // Omega0 (rad/sample)
  decay: number; // alpha
}

export interface ImpulseMarker {
  position: number;
  weight: number;
}

export interface ContinuousCurveData {
  ts: number[];
  values: number[];
  impulses: ImpulseMarker[];
}

export interface DiscreteStemData {
  ks: number[];
  values: number[];
}

export const CONTINUOUS_DOMAIN_MIN = -6;
export const CONTINUOUS_DOMAIN_MAX = 6;
export const DISCRETE_DOMAIN_MIN = -12;
export const DISCRETE_DOMAIN_MAX = 12;

export const CONTINUOUS_X_PRESETS: { id: ContinuousPreset; label: string }[] = [
  { id: 'rect', label: 'Rect' },
  { id: 'double', label: 'Double' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'sine', label: 'Sine' },
  { id: 'bipolar', label: 'Bipolar' },
  { id: 'impulse', label: 'Impulse δ' },
];

export const CONTINUOUS_H_PRESETS: { id: ContinuousPreset; label: string }[] = [
  { id: 'exp', label: 'Exp Decay' },
  { id: 'rect', label: 'Rect' },
  { id: 'impulse', label: 'Impulse δ' },
  { id: 'sinc', label: 'Sinc' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'bipolar', label: 'Bipolar' },
];

export const DISCRETE_X_PRESETS: { id: DiscretePreset; label: string }[] = [
  { id: 'rect', label: 'Rect' },
  { id: 'double', label: 'Double' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'sine', label: 'Sine' },
  { id: 'bipolar', label: 'Bipolar' },
  { id: 'impulse', label: 'Impulse δ[n]' },
];

export const DISCRETE_H_PRESETS: { id: DiscretePreset; label: string }[] = [
  { id: 'exp', label: 'Exp Decay' },
  { id: 'rect', label: 'Rect' },
  { id: 'double', label: 'Double' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'sine', label: 'Sine' },
  { id: 'bipolar', label: 'Bipolar' },
  { id: 'impulse', label: 'Impulse δ[n]' },
];

export function defaultContinuousX(): ContinuousSignalParams {
  return {
    preset: 'rect',
    amplitude: 1.0,
    shift: 0.0,
    width: 2.0,
    frequency: 0.8,
    decay: 1.0,
  };
}

export function defaultContinuousH(): ContinuousSignalParams {
  return {
    preset: 'exp',
    amplitude: 1.0,
    shift: 0.0,
    width: 4.0,
    frequency: 0.8,
    decay: 1.0,
  };
}

export function defaultDiscreteX(): DiscreteSignalParams {
  return {
    preset: 'rect',
    amplitude: 1.0,
    shift: 0,
    length: 5,
    omega: 0.8,
    decay: 0.45,
  };
}

export function defaultDiscreteH(): DiscreteSignalParams {
  return {
    preset: 'exp',
    amplitude: 1.0,
    shift: 0,
    length: 6,
    omega: 0.8,
    decay: 0.45,
  };
}

/**
 * Which sliders apply to a given continuous preset.
 */
export function getContinuousActiveControls(preset: ContinuousPreset) {
  return {
    amplitude: true,
    shift: true,
    width: preset !== 'impulse',
    frequency: preset === 'sine' || preset === 'sinc',
    decay: preset === 'exp',
  };
}

/**
 * Which sliders apply to a given discrete preset.
 */
export function getDiscreteActiveControls(preset: DiscretePreset) {
  return {
    amplitude: true,
    shift: true,
    length: preset !== 'impulse',
    omega: preset === 'sine',
    decay: preset === 'exp',
  };
}

/**
 * Evaluates the regular (non-Dirac) part of a continuous signal at tau.
 * For `impulse`, returns 0 (the Dirac delta is handled analytically via sifting).
 */
export function evalContinuousRegular(
  tau: number,
  params: ContinuousSignalParams,
): number {
  const { preset, amplitude: A, shift: t0, width: W, frequency: f, decay: alpha } = params;
  const u = tau - t0;
  const halfW = Math.max(0.05, W * 0.5);

  switch (preset) {
    case 'impulse':
      return 0;

    case 'rect':
      return Math.abs(u) <= halfW ? A : 0;

    case 'double': {
      // Two pulses symmetrically placed within [-W/2, W/2] with a clear central gap
      const subW = W * 0.34;
      const centerOffset = W * 0.33;
      const inLeft = Math.abs(u + centerOffset) <= subW * 0.5;
      const inRight = Math.abs(u - centerOffset) <= subW * 0.5;
      return inLeft || inRight ? A : 0;
    }

    case 'triangle': {
      const dist = Math.abs(u);
      return dist <= halfW ? A * (1 - dist / halfW) : 0;
    }

    case 'sine': {
      if (Math.abs(u) > halfW) return 0;
      return A * Math.sin(2 * Math.PI * f * u);
    }

    case 'bipolar': {
      if (Math.abs(u) > halfW || Math.abs(u) < 1e-9) return 0;
      return u < 0 ? A : -A;
    }

    case 'exp': {
      if (u < 0 || u > Math.max(0.1, W)) return 0;
      return A * Math.exp(-alpha * u);
    }

    case 'sinc': {
      if (Math.abs(u) > halfW) return 0;
      const arg = 2 * f * u;
      if (Math.abs(arg) < 1e-6) return A;
      return A * (Math.sin(Math.PI * arg) / (Math.PI * arg));
    }

    default:
      return 0;
  }
}

/**
 * Evaluates a continuous signal including any analytical Dirac delta impulse.
 */
export function evalContinuousSignal(
  tau: number,
  params: ContinuousSignalParams,
): { regular: number; impulse: ImpulseMarker | null } {
  if (params.preset === 'impulse') {
    return {
      regular: 0,
      impulse: { position: params.shift, weight: params.amplitude },
    };
  }
  return {
    regular: evalContinuousRegular(tau, params),
    impulse: null,
  };
}

/**
 * Evaluates the integrand x(tau) * h(t - tau) at a given (tau, t).
 * If either signal is a Dirac impulse, returns regular = 0 and the analytical impulse weight/position.
 */
export function evalContinuousIntegrandAt(
  tau: number,
  t: number,
  x: ContinuousSignalParams,
  h: ContinuousSignalParams,
): number {
  if (x.preset === 'impulse' || h.preset === 'impulse') {
    return 0;
  }
  return evalContinuousRegular(tau, x) * evalContinuousRegular(t - tau, h);
}

/**
 * Computes analytical or numerical convolution (x * h)(t) at a single time t.
 * Handles all Dirac delta cases via exact sifting:
 * - delta * delta -> impulse at t0_x + t0_h with weight A_x * A_h
 * - delta * h -> A_x * h(t - t0_x)
 * - x * delta -> A_h * x(t - t0_h)
 * - regular * regular -> composite midpoint integration over the intersection of finite supports
 */
/** Finite support of the regular continuous presets. */
export function continuousSupport(p: ContinuousSignalParams): [number, number] {
  if (p.preset === 'impulse') return [p.shift, p.shift];
  if (p.preset === 'exp') return [p.shift, p.shift + Math.max(0.1, p.width)];
  const halfWidth = p.preset === 'rect' || p.preset === 'triangle' ||
    p.preset === 'sine' || p.preset === 'bipolar' || p.preset === 'sinc'
    ? Math.max(0.05, p.width * 0.5)
    : p.width * 0.5;
  return [p.shift - halfWidth, p.shift + halfWidth];
}

/** Inclusive bounds containing every nonzero discrete sample for a preset. */
export function discreteSupport(p: DiscreteSignalParams): [number, number] {
  const center = Math.round(p.shift);
  if (p.preset === 'impulse') return [center, center];
  const len = Math.max(1, Math.round(p.length));
  if (p.preset === 'exp') return [center, center + len - 1];
  if (p.preset === 'double' && len === 2) return [center - 1, center + 1];
  return [center - Math.floor((len - 1) / 2), center + Math.ceil((len - 1) / 2)];
}

export function evalContinuousConvolutionAt(
  t: number,
  x: ContinuousSignalParams,
  h: ContinuousSignalParams,
  numSteps = 2400,
): { value: number; impulse: ImpulseMarker | null } {
  const xIsImpulse = x.preset === 'impulse';
  const hIsImpulse = h.preset === 'impulse';

  if (xIsImpulse && hIsImpulse) {
    return {
      value: 0,
      impulse: {
        position: x.shift + h.shift,
        weight: x.amplitude * h.amplitude,
      },
    };
  }

  if (xIsImpulse) {
    return {
      value: x.amplitude * evalContinuousRegular(t - x.shift, h),
      impulse: null,
    };
  }

  if (hIsImpulse) {
    return {
      value: h.amplitude * evalContinuousRegular(t - h.shift, x),
      impulse: null,
    };
  }

  // Integrate over the actual support of x and the shifted support of h.
  // All current regular presets have finite support.
  const xSupport = continuousSupport(x);
  const hSupport = continuousSupport(h);
  const intMin = Math.max(xSupport[0], t - hSupport[1]);
  const intMax = Math.min(xSupport[1], t - hSupport[0]);
  if (intMax <= intMin) return { value: 0, impulse: null };
  const dTau = (intMax - intMin) / numSteps;
  let sum = 0;
  for (let i = 0; i < numSteps; i++) {
    const tau = intMin + (i + 0.5) * dTau;
    sum += evalContinuousRegular(tau, x) * evalContinuousRegular(t - tau, h);
  }
  return { value: sum * dTau, impulse: null };
}

/**
 * Evaluates the overlap integrand curve x(tau) * h(t - tau) across tau in [-6, 6]
 * plus any Dirac impulse marker arising from sifting at time t.
 */
export function sampleContinuousOverlap(
  t: number,
  x: ContinuousSignalParams,
  h: ContinuousSignalParams,
  samples = 361,
  minTau = CONTINUOUS_DOMAIN_MIN,
  maxTau = CONTINUOUS_DOMAIN_MAX,
): ContinuousCurveData {
  const ts: number[] = new Array(samples);
  const values: number[] = new Array(samples);
  const impulses: ImpulseMarker[] = [];

  const xIsImpulse = x.preset === 'impulse';
  const hIsImpulse = h.preset === 'impulse';

  if (xIsImpulse && hIsImpulse) {
    // Impulse overlap only coincides when t == t0_x + t0_h
    if (Math.abs(t - (x.shift + h.shift)) < 0.08) {
      impulses.push({ position: x.shift, weight: x.amplitude * h.amplitude });
    }
  } else if (xIsImpulse) {
    const weight = x.amplitude * evalContinuousRegular(t - x.shift, h);
    if (Math.abs(weight) > 1e-6) {
      impulses.push({ position: x.shift, weight });
    }
  } else if (hIsImpulse) {
    // h(t - tau) = A_h * delta(t - tau - t0_h) => sifting at tau = t - t0_h
    const tauStar = t - h.shift;
    const weight = h.amplitude * evalContinuousRegular(tauStar, x);
    if (Math.abs(weight) > 1e-6) {
      impulses.push({ position: tauStar, weight });
    }
  }

  for (let i = 0; i < samples; i++) {
    const tau = minTau + (i / (samples - 1)) * (maxTau - minTau);
    ts[i] = tau;
    values[i] = evalContinuousIntegrandAt(tau, t, x, h);
  }

  return { ts, values, impulses };
}

/**
 * Samples full convolution output y(t) = (x * h)(t) over [minT, maxT].
 */
export function sampleContinuousOutput(
  x: ContinuousSignalParams,
  h: ContinuousSignalParams,
  samples = 241,
  minT = CONTINUOUS_DOMAIN_MIN,
  maxT = CONTINUOUS_DOMAIN_MAX,
): ContinuousCurveData {
  const ts: number[] = new Array(samples);
  const values: number[] = new Array(samples);
  const impulses: ImpulseMarker[] = [];

  if (x.preset === 'impulse' && h.preset === 'impulse') {
    impulses.push({
      position: x.shift + h.shift,
      weight: x.amplitude * h.amplitude,
    });
    for (let i = 0; i < samples; i++) {
      ts[i] = minT + (i / (samples - 1)) * (maxT - minT);
      values[i] = 0;
    }
    return { ts, values, impulses };
  }

  for (let i = 0; i < samples; i++) {
    const t = minT + (i / (samples - 1)) * (maxT - minT);
    ts[i] = t;
    values[i] = evalContinuousConvolutionAt(t, x, h, 1600).value;
  }

  return { ts, values, impulses };
}

/**
 * Samples a single continuous signal x(tau) or h(tau) (or flipped-shifted h(t - tau)) over [minTau, maxTau].
 */
export function sampleContinuousSignal(
  params: ContinuousSignalParams,
  samples = 361,
  minTau = CONTINUOUS_DOMAIN_MIN,
  maxTau = CONTINUOUS_DOMAIN_MAX,
  flippedShiftT?: number,
): ContinuousCurveData {
  const ts: number[] = new Array(samples);
  const values: number[] = new Array(samples);
  const impulses: ImpulseMarker[] = [];

  if (params.preset === 'impulse') {
    const pos =
      flippedShiftT !== undefined ? flippedShiftT - params.shift : params.shift;
    impulses.push({ position: pos, weight: params.amplitude });
  }

  for (let i = 0; i < samples; i++) {
    const tau = minTau + (i / (samples - 1)) * (maxTau - minTau);
    ts[i] = tau;
    const evalArg = flippedShiftT !== undefined ? flippedShiftT - tau : tau;
    values[i] = evalContinuousRegular(evalArg, params);
  }

  return { ts, values, impulses };
}

/**
 * Evaluates a discrete signal x[k] or h[k] at integer index k.
 */
export function evalDiscreteSignal(
  k: number,
  params: DiscreteSignalParams,
): number {
  const idx = Math.round(k);
  const { preset, amplitude: A, shift: n0, length: L, omega, decay: alpha } = params;
  const len = Math.max(1, Math.round(L));
  const u = idx - Math.round(n0);
  const leftHalf = Math.floor((len - 1) / 2);
  const rightHalf = Math.ceil((len - 1) / 2);

  switch (preset) {
    case 'impulse':
      return u === 0 ? A : 0;

    case 'rect':
      return u >= -leftHalf && u <= rightHalf ? A : 0;

    case 'double': {
      if (len === 1) return u === 0 ? A : 0;
      if (len === 2) return u === -1 || u === 1 ? A : 0;
      const subLen = Math.max(1, Math.floor(len / 3));
      const inLeft = u >= -leftHalf && u < -leftHalf + subLen;
      const inRight = u <= rightHalf && u > rightHalf - subLen;
      return inLeft || inRight ? A : 0;
    }

    case 'triangle': {
      if (len === 1) return u === 0 ? A : 0;
      if (u < -leftHalf || u > rightHalf) return 0;
      const radius = Math.max(leftHalf, rightHalf) + 1;
      return A * Math.max(0, 1 - Math.abs(u) / radius);
    }

    case 'sine': {
      if (u < -leftHalf || u > rightHalf) return 0;
      return A * Math.sin(omega * u);
    }

    case 'bipolar': {
      if (u < -leftHalf || u > rightHalf) return 0;
      if (len % 2 === 1 && u === 0) return 0;
      return u < 0 ? A : -A;
    }

    case 'exp': {
      if (u < 0 || u >= len) return 0;
      return A * Math.exp(-alpha * u);
    }

    default:
      return 0;
  }
}

/**
 * Computes finite-support discrete convolution y[n] = sum_k x[k] * h[n - k].
 */
export function evalDiscreteConvolutionAt(
  n: number,
  x: DiscreteSignalParams,
  h: DiscreteSignalParams,
): number {
  const nInt = Math.round(n);
  let sum = 0;
  const [xMin, xMax] = discreteSupport(x);
  const [hMin, hMax] = discreteSupport(h);
  const from = Math.max(xMin, nInt - hMax);
  const to = Math.min(xMax, nInt - hMin);
  for (let k = from; k <= to; k++) {
    sum += evalDiscreteSignal(k, x) * evalDiscreteSignal(nInt - k, h);
  }
  return sum;
}

export function sampleDiscreteSignal(
  params: DiscreteSignalParams,
  minK = DISCRETE_DOMAIN_MIN,
  maxK = DISCRETE_DOMAIN_MAX,
  flippedShiftN?: number,
): DiscreteStemData {
  const ks: number[] = [];
  const values: number[] = [];
  for (let k = minK; k <= maxK; k++) {
    ks.push(k);
    const arg = flippedShiftN !== undefined ? Math.round(flippedShiftN) - k : k;
    values.push(evalDiscreteSignal(arg, params));
  }
  return { ks, values };
}

export function sampleDiscreteOverlap(
  n: number,
  x: DiscreteSignalParams,
  h: DiscreteSignalParams,
  minK = DISCRETE_DOMAIN_MIN,
  maxK = DISCRETE_DOMAIN_MAX,
): DiscreteStemData {
  const nInt = Math.round(n);
  const ks: number[] = [];
  const values: number[] = [];
  for (let k = minK; k <= maxK; k++) {
    ks.push(k);
    values.push(evalDiscreteSignal(k, x) * evalDiscreteSignal(nInt - k, h));
  }
  return { ks, values };
}

export function sampleDiscreteOutput(
  x: DiscreteSignalParams,
  h: DiscreteSignalParams,
  minN = DISCRETE_DOMAIN_MIN,
  maxN = DISCRETE_DOMAIN_MAX,
): DiscreteStemData {
  const ks: number[] = [];
  const values: number[] = [];
  for (let n = minN; n <= maxN; n++) {
    ks.push(n);
    values.push(evalDiscreteConvolutionAt(n, x, h));
  }
  return { ks, values };
}

/**
 * Generates a 2D heightfield grid for the 3D integrand surface z(tau, t) = x(tau) * h(t - tau)
 * over (tau, t) in [-6, 6]^2.
 * Note: For Dirac delta impulses, renders a narrow Gaussian ridge so the sifting geometry is clearly visible in 3D.
 */
export interface SurfaceGridData {
  gridSize: number;
  minCoord: number;
  maxCoord: number;
  heights: Float32Array;
  maxAbsHeight: number;
}

export function sample3DSurfaceGrid(
  x: ContinuousSignalParams,
  h: ContinuousSignalParams,
  gridSize = 85,
  minCoord = CONTINUOUS_DOMAIN_MIN,
  maxCoord = CONTINUOUS_DOMAIN_MAX,
): SurfaceGridData {
  const heights = new Float32Array(gridSize * gridSize);
  let maxAbsHeight = 0.001;
  const sigma = 0.22;

  const evalFor3D = (arg: number, p: ContinuousSignalParams) => {
    if (p.preset === 'impulse') {
      const d = arg - p.shift;
      // Smooth narrow Gaussian spike representing Dirac impulse height in 3D space
      return p.amplitude * Math.exp(-(d * d) / (2 * sigma * sigma));
    }
    return evalContinuousRegular(arg, p);
  };

  for (let row = 0; row < gridSize; row++) {
    const t = minCoord + (row / (gridSize - 1)) * (maxCoord - minCoord);
    for (let col = 0; col < gridSize; col++) {
      const tau = minCoord + (col / (gridSize - 1)) * (maxCoord - minCoord);
      const val = evalFor3D(tau, x) * evalFor3D(t - tau, h);
      heights[row * gridSize + col] = val;
      const absV = Math.abs(val);
      if (absV > maxAbsHeight) maxAbsHeight = absV;
    }
  }

  return {
    gridSize,
    minCoord,
    maxCoord,
    heights,
    maxAbsHeight,
  };
}
