// Real Calculus, Complex Algebra & Calculus, and Vector Algebra & Calculus Engine
// Mirrors native C++20 openee::math (calculus_vector_complex.hpp)

export type Complex = Readonly<{ re: number; im: number }>;

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export const GL_NODES = [
  0.095012509837637440185, 0.281603550779258913230,
  0.458016777657227386342, 0.617876244402643748447,
  0.755404408355003033895, 0.865631202387831743880,
  0.944575023073232576078, 0.989400934991649932596,
] as const;

export const GL_WEIGHTS = [
  0.189450610455068496285, 0.182603415044923588867,
  0.169156519395002538189, 0.149595988816576732081,
  0.124628971255533872052, 0.095158511682492784810,
  0.062253523938647892863, 0.027152459411754094852,
] as const;

export function integrateGaussLegendre16(
  fn: (x: number) => number,
  a: number,
  b: number,
  panels = 64,
): number {
  if (a === b) return 0;
  let loBound = a;
  let hiBound = b;
  let sign = 1;
  if (hiBound < loBound) {
    [loBound, hiBound] = [hiBound, loBound];
    sign = -1;
  }
  const pCount = Math.max(1, Math.floor(panels));
  const h = (hiBound - loBound) / pCount;
  let total = 0;
  for (let p = 0; p < pCount; p++) {
    const mid = loBound + (p + 0.5) * h;
    const half = 0.5 * h;
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      const dx = half * GL_NODES[i]!;
      sum += GL_WEIGHTS[i]! * (fn(mid - dx) + fn(mid + dx));
    }
    total += half * sum;
  }
  return sign * total;
}

// 5-point Richardson-extrapolated first derivative f'(x)
export function derivative(fn: (x: number) => number, x: number, h = 1e-4): number {
  const d1 = (-fn(x + 2 * h) + 8 * fn(x + h) - 8 * fn(x - h) + fn(x - 2 * h)) / (12 * h);
  const h2 = 0.5 * h;
  const d2 = (-fn(x + 2 * h2) + 8 * fn(x + h2) - 8 * fn(x - h2) + fn(x - 2 * h2)) / (12 * h2);
  return (16 * d2 - d1) / 15;
}

export function secondDerivative(fn: (x: number) => number, x: number, h = 1e-3): number {
  return (-fn(x + 2 * h) + 16 * fn(x + h) - 30 * fn(x) + 16 * fn(x - h) - fn(x - 2 * h)) / (12 * h * h);
}

// Complex arithmetic & calculus
export const complexAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const complexSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const complexMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
export const complexDiv = (a: Complex, b: Complex): Complex => {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) return { re: 0, im: 0 };
  return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
};
export const complexAbs = (a: Complex): number => Math.hypot(a.re, a.im);
export const complexExp = (a: Complex): Complex => {
  const r = Math.exp(a.re);
  return { re: r * Math.cos(a.im), im: r * Math.sin(a.im) };
};

export function contourIntegral(
  f: (z: Complex) => Complex,
  zParam: (t: number) => Complex,
  a: number,
  b: number,
  panels = 64,
): Complex {
  const h = 1e-4;
  const zPrime = (t: number): Complex => {
    const p2 = zParam(t + 2 * h);
    const p1 = zParam(t + h);
    const m1 = zParam(t - h);
    const m2 = zParam(t - 2 * h);
    return {
      re: (-p2.re + 8 * p1.re - 8 * m1.re + m2.re) / (12 * h),
      im: (-p2.im + 8 * p1.im - 8 * m1.im + m2.im) / (12 * h),
    };
  };
  const re = integrateGaussLegendre16(t => complexMul(f(zParam(t)), zPrime(t)).re, a, b, panels);
  const im = integrateGaussLegendre16(t => complexMul(f(zParam(t)), zPrime(t)).im, a, b, panels);
  return { re, im };
}

export function wirtingerDerivatives(
  f: (z: Complex) => Complex,
  z: Complex,
  h = 1e-4,
): { dfDz: Complex; dfDzConj: Complex; cauchyRiemannResidual: number } {
  const dfDx = {
    re: (-f({ re: z.re + 2 * h, im: z.im }).re + 8 * f({ re: z.re + h, im: z.im }).re - 8 * f({ re: z.re - h, im: z.im }).re + f({ re: z.re - 2 * h, im: z.im }).re) / (12 * h),
    im: (-f({ re: z.re + 2 * h, im: z.im }).im + 8 * f({ re: z.re + h, im: z.im }).im - 8 * f({ re: z.re - h, im: z.im }).im + f({ re: z.re - 2 * h, im: z.im }).im) / (12 * h),
  };
  const dfDy = {
    re: (-f({ re: z.re, im: z.im + 2 * h }).re + 8 * f({ re: z.re, im: z.im + h }).re - 8 * f({ re: z.re, im: z.im - h }).re + f({ re: z.re, im: z.im - 2 * h }).re) / (12 * h),
    im: (-f({ re: z.re, im: z.im + 2 * h }).im + 8 * f({ re: z.re, im: z.im + h }).im - 8 * f({ re: z.re, im: z.im - h }).im + f({ re: z.re, im: z.im - 2 * h }).im) / (12 * h),
  };
  // i * dfDy = (-dfDy.im, dfDy.re)
  const iDfDy: Complex = { re: -dfDy.im, im: dfDy.re };
  const dfDz: Complex = { re: 0.5 * (dfDx.re - iDfDy.re), im: 0.5 * (dfDx.im - iDfDy.im) };
  const dfDzConj: Complex = { re: 0.5 * (dfDx.re + iDfDy.re), im: 0.5 * (dfDx.im + iDfDy.im) };
  return { dfDz, dfDzConj, cauchyRiemannResidual: complexAbs(dfDzConj) };
}

// Vector algebra & calculus
export const vecAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vecSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vecScale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const norm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: Vec3): Vec3 => {
  const n = norm(a);
  return n < 1e-15 ? { x: 0, y: 0, z: 0 } : vecScale(a, 1 / n);
};
export const project = (a: Vec3, onto: Vec3): Vec3 => {
  const d = dot(onto, onto);
  return d < 1e-15 ? { x: 0, y: 0, z: 0 } : vecScale(onto, dot(a, onto) / d);
};
export const scalarTriple = (a: Vec3, b: Vec3, c: Vec3): number => dot(a, cross(b, c));

export function gradient(phi: (p: Vec3) => number, p: Vec3, h = 1e-4): Vec3 {
  return {
    x: derivative(x => phi({ x, y: p.y, z: p.z }), p.x, h),
    y: derivative(y => phi({ x: p.x, y, z: p.z }), p.y, h),
    z: derivative(z => phi({ x: p.x, y: p.y, z }), p.z, h),
  };
}

export function laplacian(phi: (p: Vec3) => number, p: Vec3, h = 1e-3): number {
  return (
    secondDerivative(x => phi({ x, y: p.y, z: p.z }), p.x, h) +
    secondDerivative(y => phi({ x: p.x, y, z: p.z }), p.y, h) +
    secondDerivative(z => phi({ x: p.x, y: p.y, z }), p.z, h)
  );
}

export function divergence(F: (p: Vec3) => Vec3, p: Vec3, h = 1e-4): number {
  return (
    derivative(x => F({ x, y: p.y, z: p.z }).x, p.x, h) +
    derivative(y => F({ x: p.x, y, z: p.z }).y, p.y, h) +
    derivative(z => F({ x: p.x, y: p.y, z }).z, p.z, h)
  );
}

export function curl(F: (p: Vec3) => Vec3, p: Vec3, h = 1e-4): Vec3 {
  const dFzDy = derivative(y => F({ x: p.x, y, z: p.z }).z, p.y, h);
  const dFyDz = derivative(z => F({ x: p.x, y: p.y, z }).y, p.z, h);
  const dFxDz = derivative(z => F({ x: p.x, y: p.y, z }).x, p.z, h);
  const dFzDx = derivative(x => F({ x, y: p.y, z: p.z }).z, p.x, h);
  const dFyDx = derivative(x => F({ x, y: p.y, z: p.z }).y, p.x, h);
  const dFxDy = derivative(y => F({ x: p.x, y, z: p.z }).x, p.y, h);
  return { x: dFzDy - dFyDz, y: dFxDz - dFzDx, z: dFyDx - dFxDy };
}

export function vectorLineIntegral(
  F: (p: Vec3) => Vec3,
  curve: (t: number) => Vec3,
  a: number,
  b: number,
  panels = 64,
): number {
  const h = 1e-4;
  return integrateGaussLegendre16(t => {
    const rp: Vec3 = {
      x: derivative(u => curve(u).x, t, h),
      y: derivative(u => curve(u).y, t, h),
      z: derivative(u => curve(u).z, t, h),
    };
    return dot(F(curve(t)), rp);
  }, a, b, panels);
}

export function surfaceFluxIntegral(
  F: (p: Vec3) => Vec3,
  surface: (u: number, v: number) => Vec3,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  panels = 24,
): number {
  const h = 1e-4;
  return integrateGaussLegendre16(
    u =>
      integrateGaussLegendre16(v => {
        const ru: Vec3 = {
          x: derivative(uu => surface(uu, v).x, u, h),
          y: derivative(uu => surface(uu, v).y, u, h),
          z: derivative(uu => surface(uu, v).z, u, h),
        };
        const rv: Vec3 = {
          x: derivative(vv => surface(u, vv).x, v, h),
          y: derivative(vv => surface(u, vv).y, v, h),
          z: derivative(vv => surface(u, vv).z, v, h),
        };
        return dot(F(surface(u, v)), cross(ru, rv));
      }, v0, v1, panels),
    u0,
    u1,
    panels,
  );
}

// Analytical polynomial integration: int_a^b P(t) dt, int_a^b P(t) cos(w*t) dt, int_a^b P(t) sin(w*t) dt
function evalPolyAndDerivs(coeffs: readonly number[], t: number): number[] {
  const d = coeffs.length - 1;
  const vals = new Array<number>(d + 1).fill(0);
  // Derivative k of sum c_j t^j = sum_{j>=k} c_j * j!/(j-k)! * t^{j-k}
  const c = coeffs.slice();
  for (let k = 0; k <= d; k++) {
    let s = 0;
    for (let j = c.length - 1; j >= k; j--) {
      s = s * t + c[j]!;
    }
    vals[k] = s;
    for (let j = k + 1; j < c.length; j++) {
      c[j] = c[j]! * (j - k);
    }
  }
  return vals;
}

export function integratePoly(coeffs: readonly number[], a: number, b: number): number {
  let hi = 0;
  let lo = 0;
  let powHi = b;
  let powLo = a;
  for (let k = 0; k < coeffs.length; k++) {
    const term = coeffs[k]! / (k + 1);
    hi += term * powHi;
    lo += term * powLo;
    powHi *= b;
    powLo *= a;
  }
  return hi - lo;
}

export function integratePolyCos(coeffs: readonly number[], omega: number, a: number, b: number): number {
  if (Math.abs(omega) < 1e-14) return integratePoly(coeffs, a, b);
  const dA = evalPolyAndDerivs(coeffs, a);
  const dB = evalPolyAndDerivs(coeffs, b);
  const cosA = Math.cos(omega * a);
  const sinA = Math.sin(omega * a);
  const cosB = Math.cos(omega * b);
  const sinB = Math.sin(omega * b);
  let sum = 0;
  let wPow = omega;
  for (let k = 0; k < coeffs.length; k++) {
    const m = Math.floor(k / 2);
    const sign = m % 2 === 0 ? 1 : -1;
    const isCos = k % 2 === 1;
    const valB = dB[k]! * (isCos ? cosB : sinB);
    const valA = dA[k]! * (isCos ? cosA : sinA);
    sum += (sign * (valB - valA)) / wPow;
    wPow *= omega;
  }
  return sum;
}

export function integratePolySin(coeffs: readonly number[], omega: number, a: number, b: number): number {
  if (Math.abs(omega) < 1e-14) return 0;
  const dA = evalPolyAndDerivs(coeffs, a);
  const dB = evalPolyAndDerivs(coeffs, b);
  const cosA = Math.cos(omega * a);
  const sinA = Math.sin(omega * a);
  const cosB = Math.cos(omega * b);
  const sinB = Math.sin(omega * b);
  let sum = 0;
  let wPow = omega;
  for (let k = 0; k < coeffs.length; k++) {
    const m = Math.floor(k / 2);
    const isSin = k % 2 === 1;
    const sign = isSin ? (m % 2 === 0 ? 1 : -1) : (m % 2 === 0 ? -1 : 1);
    const valB = dB[k]! * (isSin ? sinB : cosB);
    const valA = dA[k]! * (isSin ? sinA : cosA);
    sum += (sign * (valB - valA)) / wPow;
    wPow *= omega;
  }
  return sum;
}

