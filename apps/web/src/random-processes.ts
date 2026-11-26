export const processKinds = [
  "random-phase", "binary", "gaussian", "white-noise", "random-walk", "wiener",
  "poisson", "shot-noise", "markov", "ar1", "ma", "arma", "cyclostationary",
] as const;

export type ProcessKind = typeof processKinds[number];

export const processLabels: Record<ProcessKind, string> = {
  "random-phase": "Random-phase sinusoid",
  binary: "Random binary wave",
  gaussian: "Gaussian process",
  "white-noise": "White noise",
  "random-walk": "Random walk",
  wiener: "Wiener process",
  poisson: "Poisson process",
  "shot-noise": "Shot noise",
  markov: "Markov chain",
  ar1: "AR(1)",
  ma: "MA(1)",
  arma: "ARMA(1,1)",
  cyclostationary: "Cyclostationary",
};

export type ProcessConfig = {
  kind: ProcessKind;
  sampleCount: number;
  realizations: number;
  seed: number;
  lag: number;
  amplitude: number;
  cycles: number;
  kernelWidth: number;
  randomOffsetStd: number;
  rate: number;
  p00: number;
  p11: number;
  phi: number;
  theta: number;
  period: number;
};

export const defaultProcessConfig: ProcessConfig = {
  kind: "random-phase",
  sampleCount: 320,
  realizations: 24,
  seed: 42,
  lag: 8,
  amplitude: 1,
  cycles: 6,
  kernelWidth: 5,
  randomOffsetStd: 0.65,
  rate: 0.06,
  p00: 0.85,
  p11: 0.8,
  phi: 0.8,
  theta: 0.65,
  period: 64,
};

export type Histogram = { centers: Float64Array; density: Float64Array };
export type StationarityCheck = {
  strictSense: boolean;
  wideSense: boolean;
  meanErgodic: boolean | undefined;
  correlationErgodic: boolean | undefined;
  explanation: string;
};

export type ProcessAnalysis = {
  paths: Float64Array[];
  mean: Float64Array;
  variance: Float64Array;
  lags: Float64Array;
  autocorrelation: Float64Array;
  autocovariance: Float64Array;
  correlationCoefficient: Float64Array;
  crossCorrelation: Float64Array;
  crossCovariance: Float64Array;
  crossCoefficient: Float64Array;
  crossLags: Float64Array;
  meanConvergence: Float64Array;
  correlationConvergence: Float64Array;
  ensembleMeanConvergence: Float64Array;
  ensembleCorrelationConvergence: Float64Array;
  meanPdf: Histogram;
  jointPdf: { x: Float64Array; y: Float64Array };
  timeCorrelationAtLag: Float64Array;
  zeroLagPower: number;
  autocorrelationValid: boolean;
  stationarity: StationarityCheck;
  markovSteadyState?: readonly [number, number];
};

export function validateProcessConfig(config: ProcessConfig): string | undefined {
  if (!processKinds.includes(config.kind)) return "Choose a supported process.";
  if (!Number.isInteger(config.sampleCount) || config.sampleCount < 128 || config.sampleCount > 1024)
    return "Samples must be an integer from 128 to 1024.";
  if (!Number.isInteger(config.realizations) || config.realizations < 4 || config.realizations > 40)
    return "Realizations must be an integer from 4 to 40.";
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 2_147_483_647)
    return "Seed must be an integer from 0 to 2147483647.";
  if (!Number.isInteger(config.lag) || config.lag < 1 || config.lag > Math.min(64, config.sampleCount / 4))
    return "Lag must be an integer from 1 to 64 and no more than one quarter of the sample count.";
  if (!Number.isFinite(config.amplitude) || config.amplitude <= 0 || config.amplitude > 10)
    return "Amplitude must be greater than 0 and no more than 10.";
  if (!Number.isInteger(config.cycles) || config.cycles < 1 || config.cycles > 32)
    return "Cycles must be an integer from 1 to 32.";
  if (!Number.isFinite(config.kernelWidth) || config.kernelWidth < 1 || config.kernelWidth > 12)
    return "Kernel width must be from 1 to 12 samples.";
  if (!Number.isFinite(config.randomOffsetStd) || config.randomOffsetStd < 0 || config.randomOffsetStd > 2)
    return "Random offset standard deviation must be from 0 to 2.";
  if (!Number.isFinite(config.rate) || config.rate < 0.005 || config.rate > 1)
    return "Event rate must be from 0.005 to 1 per sample.";
  if (!Number.isFinite(config.p00) || config.p00 < 0.02 || config.p00 > 0.98 ||
      !Number.isFinite(config.p11) || config.p11 < 0.02 || config.p11 > 0.98)
    return "Markov self-transition probabilities must be from 0.02 to 0.98.";
  if (!Number.isFinite(config.phi) || Math.abs(config.phi) > 0.95)
    return "AR coefficient must be from -0.95 to 0.95.";
  if (!Number.isFinite(config.theta) || Math.abs(config.theta) > 0.95)
    return "MA coefficient must be from -0.95 to 0.95.";
  if (!Number.isInteger(config.period) || config.period < 16 || config.period > 256)
    return "Period must be an integer from 16 to 256 samples.";
}

function randomSource(seed: number) {
  let state = seed >>> 0;
  let spare: number | undefined;
  const uniform = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
  const normal = () => {
    if (spare !== undefined) {
      const value = spare;
      spare = undefined;
      return value;
    }
    const radius = Math.sqrt(-2 * Math.log(Math.max(uniform(), Number.MIN_VALUE)));
    const angle = 2 * Math.PI * uniform();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
  return { uniform, normal };
}

function poissonSample(rate: number, uniform: () => number): number {
  const threshold = Math.exp(-rate);
  let product = 1;
  let count = 0;
  do {
    count++;
    product *= uniform();
  } while (product > threshold);
  return count - 1;
}

function generatePath(config: ProcessConfig, random: ReturnType<typeof randomSource>): Float64Array {
  const { sampleCount: count, kind } = config;
  const path = new Float64Array(count);
  const { uniform, normal } = random;

  switch (kind) {
    case "random-phase": {
      const phase = uniform() * 2 * Math.PI;
      for (let n = 0; n < count; n++)
        path[n] = config.amplitude * Math.sin(2 * Math.PI * config.cycles * n / count + phase);
      break;
    }
    case "binary":
      for (let n = 0; n < count; n++) path[n] = (uniform() < 0.5 ? -1 : 1) * config.amplitude;
      break;
    case "gaussian": {
      const width = 21;
      const weights = Float64Array.from({ length: width }, (_, i) =>
        Math.exp(-0.5 * (i / config.kernelWidth) ** 2));
      const norm = Math.sqrt(weights.reduce((sum, value) => sum + value * value, 0));
      const innovations = Float64Array.from({ length: count + width }, normal);
      const offset = config.randomOffsetStd * normal();
      for (let n = 0; n < count; n++) {
        let value = offset;
        for (let j = 0; j < width; j++) value += weights[j]! * innovations[n + width - j]! / norm;
        path[n] = value;
      }
      break;
    }
    case "white-noise":
      for (let n = 0; n < count; n++) path[n] = normal();
      break;
    case "random-walk": {
      let value = 0;
      for (let n = 0; n < count; n++) {
        value += (uniform() < 0.5 ? -1 : 1) * config.amplitude;
        path[n] = value;
      }
      break;
    }
    case "wiener": {
      let value = 0;
      for (let n = 0; n < count; n++) {
        value += config.amplitude * Math.sqrt(0.1) * normal();
        path[n] = value;
      }
      break;
    }
    case "poisson": {
      let countAtTime = 0;
      for (let n = 0; n < count; n++) {
        countAtTime += poissonSample(config.rate, uniform);
        path[n] = countAtTime;
      }
      break;
    }
    case "shot-noise": {
      let value = 0;
      for (let n = -120; n < count; n++) {
        value = 0.92 * value + config.amplitude * poissonSample(config.rate, uniform);
        if (n >= 0) path[n] = value;
      }
      break;
    }
    case "markov": {
      const state0 = (1 - config.p11) / (2 - config.p00 - config.p11);
      let state = uniform() < state0 ? 0 : 1;
      for (let n = 0; n < count; n++) {
        path[n] = state === 0 ? -1 : 1;
        state = uniform() < (state === 0 ? config.p00 : config.p11) ? state : 1 - state;
      }
      break;
    }
    case "ar1": {
      let value = 0;
      const innovationScale = Math.sqrt(1 - config.phi * config.phi);
      for (let n = -240; n < count; n++) {
        value = config.phi * value + innovationScale * normal();
        if (n >= 0) path[n] = value;
      }
      break;
    }
    case "ma": {
      let previous = normal();
      const norm = Math.sqrt(1 + config.theta * config.theta);
      for (let n = 0; n < count; n++) {
        const innovation = normal();
        path[n] = (innovation + config.theta * previous) / norm;
        previous = innovation;
      }
      break;
    }
    case "arma": {
      let value = 0;
      let previousInnovation = 0;
      const innovationScale = Math.sqrt(1 - config.phi * config.phi);
      for (let n = -240; n < count; n++) {
        const innovation = normal() * innovationScale;
        value = config.phi * value + innovation + config.theta * previousInnovation;
        previousInnovation = innovation;
        if (n >= 0) path[n] = value;
      }
      break;
    }
    case "cyclostationary":
      for (let n = 0; n < count; n++) {
        const envelope = 1 + 0.7 * Math.cos(2 * Math.PI * n / config.period);
        path[n] = envelope * normal();
      }
      break;
  }
  return path;
}

function histogram(values: readonly Float64Array[], index: number, bins: number): Histogram {
  const samples = values.map(path => path[index]!);
  let low = Math.min(...samples), high = Math.max(...samples);
  if (low === high) { low -= 0.5; high += 0.5; }
  const width = (high - low) / bins;
  const counts = new Float64Array(bins);
  for (const sample of samples) {
    const bin = Math.min(bins - 1, Math.floor((sample - low) / width));
    counts[bin]!++;
  }
  const centers = Float64Array.from({ length: bins }, (_, i) => low + (i + 0.5) * width);
  return { centers, density: Float64Array.from(counts, value => value / (samples.length * width)) };
}

export function distributionsAt(paths: readonly Float64Array[], index: number, lag: number, bins = 16) {
  if (!Number.isInteger(bins) || bins < 2 || bins > 64)
    throw new RangeError("Histogram bins must be an integer from 2 to 64.");
  if (!paths.length || !Number.isInteger(index) || !Number.isInteger(lag) || lag < 0 ||
      index < 0 || paths.some(path => index + lag >= path.length))
    throw new RangeError("PDF sample and lag must fit within every realization.");
  return {
    meanPdf: histogram(paths, index, bins),
    jointPdf: {
      x: Float64Array.from(paths, path => path[index]!),
      y: Float64Array.from(paths, path => path[index + lag]!),
    },
  };
}

function isPositiveSemiDefinite(values: ArrayLike<number>, order: number): boolean {
  if (!Number.isInteger(order) || order < 1 || order > values.length) return false;
  for (let index = 0; index < order; index++) if (!Number.isFinite(values[index])) return false;
  const size = order;
  const matrix = Array.from({ length: size }, (_, row) =>
    Float64Array.from({ length: size }, (_, column) => values[Math.abs(row - column)]!));
  const scale = Math.max(1, Math.abs(values[0]!));
  const tolerance = 1e-10 * scale;
  for (let iteration = 0; iteration < size * size * 20; iteration++) {
    let p = 0, q = 0, largest = 0;
    for (let row = 0; row < size; row++) for (let column = row + 1; column < size; column++) {
      const value = Math.abs(matrix[row]![column]!);
      if (value > largest) { largest = value; p = row; q = column; }
    }
    if (largest <= tolerance) break;
    const app = matrix[p]![p]!, aqq = matrix[q]![q]!, apq = matrix[p]![q]!;
    const tau = (aqq - app) / (2 * apq);
    const tangent = (tau < 0 ? -1 : 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const cosine = 1 / Math.sqrt(1 + tangent * tangent), sine = tangent * cosine;
    matrix[p]![p] = app - tangent * apq;
    matrix[q]![q] = aqq + tangent * apq;
    matrix[p]![q] = matrix[q]![p] = 0;
    for (let index = 0; index < size; index++) {
      if (index === p || index === q) continue;
      const aip = matrix[index]![p]!, aiq = matrix[index]![q]!;
      matrix[index]![p] = matrix[p]![index] = cosine * aip - sine * aiq;
      matrix[index]![q] = matrix[q]![index] = sine * aip + cosine * aiq;
    }
  }
  return matrix.every((row, index) => row[index]! >= -tolerance);
}

function stationarityFor(config: ProcessConfig): StationarityCheck {
  const nonstationary = ["random-walk", "wiener", "poisson", "cyclostationary"].includes(config.kind);
  const meanErgodic = nonstationary ? undefined : config.kind !== "gaussian" || config.randomOffsetStd === 0;
  const correlationErgodic = meanErgodic;
  let explanation: string;
  if (config.kind === "gaussian")
    explanation = meanErgodic
      ? "Jointly Gaussian · \\(\\text{WSS} \\Rightarrow \\text{SSS}\\). The stationary filter is ergodic."
      : "Jointly Gaussian · \\(\\text{WSS} \\Rightarrow \\text{SSS}\\). The random offset prevents mean and ACF ergodicity.";
  else if (nonstationary) explanation = "Ergodicity is not assessed for a nonstationary model.";
  else if (config.kind === "shot-noise") explanation = "Stationary Poisson arrivals with a finite warm-up.";
  else if (config.kind === "markov") explanation = "Initialized from the chain’s steady-state distribution.";
  else explanation = "The generator uses stationary initial conditions.";
  return { strictSense: !nonstationary, wideSense: !nonstationary, meanErgodic, correlationErgodic, explanation };
}

export function analyzeProcesses(config: ProcessConfig): ProcessAnalysis {
  const validation = validateProcessConfig(config);
  if (validation) throw new RangeError(validation);

  const random = randomSource(config.seed);
  const paths = Array.from({ length: config.realizations }, () => generatePath(config, random));
  const { sampleCount: count, realizations } = config;
  const mean = new Float64Array(count), variance = new Float64Array(count);
  for (let n = 0; n < count; n++) {
    for (const path of paths) mean[n]! += path[n]! / realizations;
    for (const path of paths) variance[n]! += (path[n]! - mean[n]!) ** 2 / realizations;
  }

  const maxLag = Math.min(config.lag, 64, Math.floor(count / 4));
  const lags = Float64Array.from({ length: maxLag + 1 }, (_, index) => index);
  const autocorrelation = new Float64Array(maxLag + 1);
  const autocovariance = new Float64Array(maxLag + 1);
  const correlationCoefficient = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let raw = 0, covariance = 0, varianceStart = 0, varianceEnd = 0;
    for (const path of paths) for (let n = 0; n < count - lag; n++) {
      raw += path[n]! * path[n + lag]! / (realizations * count);
      covariance += (path[n]! - mean[n]!) * (path[n + lag]! - mean[n + lag]!) / (realizations * count);
      varianceStart += variance[n]! / (realizations * count);
      varianceEnd += variance[n + lag]! / (realizations * count);
    }
    autocorrelation[lag] = raw;
    autocovariance[lag] = covariance;
    const denominator = Math.sqrt(varianceStart * varianceEnd);
    correlationCoefficient[lag] = denominator > 0 ? covariance / denominator : 0;
  }

  const crossLags = Float64Array.from({ length: 2 * maxLag + 1 }, (_, index) => index - maxLag);
  const crossCorrelation = new Float64Array(crossLags.length);
  const crossCovariance = new Float64Array(crossLags.length);
  const crossCoefficient = new Float64Array(crossLags.length);
  const first = paths[0]!, second = paths[1]!;
  for (let index = 0; index < crossLags.length; index++) {
    const lag = crossLags[index]!;
    const start = Math.max(0, -lag), end = Math.min(count, count - lag);
    let raw = 0, covariance = 0, varianceFirst = 0, varianceSecond = 0;
    for (let n = start; n < end; n++) {
      const m = n + lag;
      raw += first[n]! * second[m]!;
      covariance += (first[n]! - mean[n]!) * (second[m]! - mean[m]!);
      varianceFirst += variance[n]!;
      varianceSecond += variance[m]!;
    }
    const pairCount = end - start;
    crossCorrelation[index] = raw / pairCount;
    crossCovariance[index] = covariance / pairCount;
    const denominator = Math.sqrt(varianceFirst * varianceSecond) / pairCount;
    crossCoefficient[index] = denominator > 0 ? crossCovariance[index]! / denominator : 0;
  }

  const meanConvergence = new Float64Array(count);
  const correlationConvergence = new Float64Array(count);
  const ensembleMeanConvergence = new Float64Array(count);
  const ensembleCorrelationConvergence = new Float64Array(count);
  let sum = 0, productSum = 0, ensembleSum = 0, ensembleProductSum = 0;
  for (let n = 0; n < count; n++) {
    sum += first[n]!;
    meanConvergence[n] = sum / (n + 1);
    ensembleSum += mean[n]!;
    ensembleMeanConvergence[n] = ensembleSum / (n + 1);
    if (n >= maxLag) {
      productSum += first[n]! * first[n - maxLag]!;
      correlationConvergence[n] = productSum / (n - maxLag + 1);
      let ensembleProduct = 0;
      for (const path of paths) ensembleProduct += path[n]! * path[n - maxLag]! / realizations;
      ensembleProductSum += ensembleProduct;
      ensembleCorrelationConvergence[n] = ensembleProductSum / (n - maxLag + 1);
    }
  }
  const middle = Math.floor(count / 2);
  const { meanPdf, jointPdf } = distributionsAt(paths, middle, maxLag);
  const timeCorrelationAtLag = new Float64Array(count - maxLag);
  for (let n = 0; n < timeCorrelationAtLag.length; n++)
    for (const path of paths)
      timeCorrelationAtLag[n]! += path[n]! * path[n + maxLag]! / realizations;

  const markovSteadyState = config.kind === "markov"
    ? [(1 - config.p11) / (2 - config.p00 - config.p11), (1 - config.p00) / (2 - config.p00 - config.p11)] as const
    : undefined;
  const analysis: ProcessAnalysis = {
    paths, mean, variance, lags, autocorrelation, autocovariance, correlationCoefficient,
    crossCorrelation, crossCovariance, crossCoefficient, crossLags, meanConvergence,
    correlationConvergence, ensembleMeanConvergence, ensembleCorrelationConvergence,
    meanPdf, jointPdf, timeCorrelationAtLag, zeroLagPower: autocorrelation[0]!,
    autocorrelationValid: isPositiveSemiDefinite(autocorrelation, Math.min(12, autocorrelation.length)),
    stationarity: stationarityFor(config),
  };
  if (markovSteadyState) analysis.markovSteadyState = markovSteadyState;
  return analysis;
}

export { isPositiveSemiDefinite };
