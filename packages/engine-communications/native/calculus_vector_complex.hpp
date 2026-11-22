#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <complex>
#include <functional>
#include <stdexcept>
#include <vector>

namespace openee::math {

inline constexpr double kPi = 3.141592653589793238462643383279502884;
inline constexpr double kTau = 2.0 * kPi;

// ============================================================================
// 1. REAL & COMPLEX CALCULUS ENGINE
// ============================================================================

inline double integrate_gl16(const std::function<double(double)>& f, double a, double b, int panels = 64) {
  static constexpr double kNodes[8] = {
      0.095012509837637440185, 0.281603550779258913230,
      0.458016777657227386342, 0.617876244402643748447,
      0.755404408355003033895, 0.865631202387831743880,
      0.944575023073232576078, 0.989400934991649932596};
  static constexpr double kWeights[8] = {
      0.189450610455068496285, 0.182603415044923588867,
      0.169156519395002538189, 0.149595988816576732081,
      0.124628971255533872052, 0.095158511682492784810,
      0.062253523938647892863, 0.027152459411754094852};

  if (panels < 1) panels = 1;
  if (a == b) return 0.0;
  double sign = 1.0;
  if (b < a) {
    std::swap(a, b);
    sign = -1.0;
  }
  double h = (b - a) / static_cast<double>(panels);
  double total = 0.0;
  for (int p = 0; p < panels; ++p) {
    double lo = a + p * h;
    double mid = lo + 0.5 * h;
    double half = 0.5 * h;
    double sum = 0.0;
    for (int i = 0; i < 8; ++i) {
      double dx = half * kNodes[i];
      sum += kWeights[i] * (f(mid - dx) + f(mid + dx));
    }
    total += half * sum;
  }
  return sign * total;
}

// 5-point Richardson-extrapolated derivative f'(x)
inline double derivative(const std::function<double(double)>& f, double x, double h = 1e-4) {
  double d1 = (-f(x + 2.0 * h) + 8.0 * f(x + h) - 8.0 * f(x - h) + f(x - 2.0 * h)) / (12.0 * h);
  double h2 = h * 0.5;
  double d2 = (-f(x + 2.0 * h2) + 8.0 * f(x + h2) - 8.0 * f(x - h2) + f(x - 2.0 * h2)) / (12.0 * h2);
  return (16.0 * d2 - d1) / 15.0;
}

// Second derivative f''(x)
inline double second_derivative(const std::function<double(double)>& f, double x, double h = 1e-3) {
  return (-f(x + 2.0 * h) + 16.0 * f(x + h) - 30.0 * f(x) + 16.0 * f(x - h) - f(x - 2.0 * h)) / (12.0 * h * h);
}

// Complex contour integral: int_a^b f(z(t)) * z'(t) dt
inline std::complex<double> contour_integral(
    const std::function<std::complex<double>(std::complex<double>)>& f,
    const std::function<std::complex<double>(double)>& z_param,
    double a,
    double b,
    int panels = 64) {
  auto z_prime = [&](double t) -> std::complex<double> {
    double h = 1e-4;
    return (-z_param(t + 2.0 * h) + 8.0 * z_param(t + h) - 8.0 * z_param(t - h) + z_param(t - 2.0 * h)) / (12.0 * h);
  };
  double re = integrate_gl16([&](double t) {
    auto val = f(z_param(t)) * z_prime(t);
    return val.real();
  }, a, b, panels);
  double im = integrate_gl16([&](double t) {
    auto val = f(z_param(t)) * z_prime(t);
    return val.imag();
  }, a, b, panels);
  return {re, im};
}

// Wirtinger complex calculus derivatives: df/dz = 0.5*(df/dx - i df/dy), df/dz* = 0.5*(df/dx + i df/dy)
struct WirtingerDerivatives {
  std::complex<double> df_dz;
  std::complex<double> df_dz_conj;
  double cauchy_riemann_residual = 0.0;
};

inline WirtingerDerivatives wirtinger_derivatives(
    const std::function<std::complex<double>(std::complex<double>)>& f,
    std::complex<double> z,
    double h = 1e-4) {
  using C = std::complex<double>;
  C df_dx = (-f(z + C{2.0 * h, 0}) + 8.0 * f(z + C{h, 0}) - 8.0 * f(z - C{h, 0}) + f(z - C{2.0 * h, 0})) / (12.0 * h);
  C df_dy = (-f(z + C{0, 2.0 * h}) + 8.0 * f(z + C{0, h}) - 8.0 * f(z - C{0, h}) + f(z - C{0, 2.0 * h})) / (12.0 * h);
  C i{0.0, 1.0};
  C dz = 0.5 * (df_dx - i * df_dy);
  C dz_bar = 0.5 * (df_dx + i * df_dy);
  return {dz, dz_bar, std::abs(dz_bar)};
}

// Complex elementary extensions
inline std::complex<double> cpow_principal(std::complex<double> z, std::complex<double> w) {
  return std::pow(z, w);
}

// ============================================================================
// 2. VECTOR ALGEBRA & VECTOR CALCULUS ENGINE
// ============================================================================

struct Vec3 {
  double x = 0.0;
  double y = 0.0;
  double z = 0.0;

  constexpr Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
  constexpr Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
  constexpr Vec3 operator*(double s) const { return {x * s, y * s, z * s}; }
  constexpr Vec3 operator/(double s) const { return {x / s, y / s, z / s}; }
};

inline constexpr double dot(const Vec3& a, const Vec3& b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

inline constexpr Vec3 cross(const Vec3& a, const Vec3& b) {
  return {
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x};
}

inline double norm(const Vec3& a) {
  return std::sqrt(dot(a, a));
}

inline Vec3 normalize(const Vec3& a) {
  double n = norm(a);
  return n < 1e-15 ? Vec3{0, 0, 0} : (a / n);
}

inline Vec3 project(const Vec3& a, const Vec3& onto) {
  double d = dot(onto, onto);
  return d < 1e-15 ? Vec3{0, 0, 0} : onto * (dot(a, onto) / d);
}

inline double scalar_triple(const Vec3& a, const Vec3& b, const Vec3& c) {
  return dot(a, cross(b, c));
}

using ScalarField = std::function<double(const Vec3&)>;
using VectorField = std::function<Vec3(const Vec3&)>;

// Gradient of scalar field phi(x,y,z)
inline Vec3 gradient(const ScalarField& phi, const Vec3& p, double h = 1e-4) {
  double dx = derivative([&](double x) { return phi({x, p.y, p.z}); }, p.x, h);
  double dy = derivative([&](double y) { return phi({p.x, y, p.z}); }, p.y, h);
  double dz = derivative([&](double z) { return phi({p.x, p.y, z}); }, p.z, h);
  return {dx, dy, dz};
}

// Laplacian nabla^2 phi(x,y,z)
inline double laplacian(const ScalarField& phi, const Vec3& p, double h = 1e-3) {
  return second_derivative([&](double x) { return phi({x, p.y, p.z}); }, p.x, h) +
         second_derivative([&](double y) { return phi({p.x, y, p.z}); }, p.y, h) +
         second_derivative([&](double z) { return phi({p.x, p.y, z}); }, p.z, h);
}

// Divergence div F = dFx/dx + dFy/dy + dFz/dz
inline double divergence(const VectorField& F, const Vec3& p, double h = 1e-4) {
  double dFx = derivative([&](double x) { return F({x, p.y, p.z}).x; }, p.x, h);
  double dFy = derivative([&](double y) { return F({p.x, y, p.z}).y; }, p.y, h);
  double dFz = derivative([&](double z) { return F({p.x, p.y, z}).z; }, p.z, h);
  return dFx + dFy + dFz;
}

// Curl (nabla x F)
inline Vec3 curl(const VectorField& F, const Vec3& p, double h = 1e-4) {
  double dFz_dy = derivative([&](double y) { return F({p.x, y, p.z}).z; }, p.y, h);
  double dFy_dz = derivative([&](double z) { return F({p.x, p.y, z}).y; }, p.z, h);
  double dFx_dz = derivative([&](double z) { return F({p.x, p.y, z}).x; }, p.z, h);
  double dFz_dx = derivative([&](double x) { return F({x, p.y, p.z}).z; }, p.x, h);
  double dFy_dx = derivative([&](double x) { return F({x, p.y, p.z}).y; }, p.x, h);
  double dFx_dy = derivative([&](double y) { return F({p.x, y, p.z}).x; }, p.y, h);
  return {dFz_dy - dFy_dz, dFx_dz - dFz_dx, dFy_dx - dFx_dy};
}

// 3x3 Jacobian matrix of vector field F
inline std::array<std::array<double, 3>, 3> jacobian(const VectorField& F, const Vec3& p, double h = 1e-4) {
  auto dF_dx = [&](double x) { return F({x, p.y, p.z}); };
  auto dF_dy = [&](double y) { return F({p.x, y, p.z}); };
  auto dF_dz = [&](double z) { return F({p.x, p.y, z}); };
  return {{
      {derivative([&](double x) { return dF_dx(x).x; }, p.x, h),
       derivative([&](double y) { return dF_dy(y).x; }, p.y, h),
       derivative([&](double z) { return dF_dz(z).x; }, p.z, h)},
      {derivative([&](double x) { return dF_dx(x).y; }, p.x, h),
       derivative([&](double y) { return dF_dy(y).y; }, p.y, h),
       derivative([&](double z) { return dF_dz(z).y; }, p.z, h)},
      {derivative([&](double x) { return dF_dx(x).z; }, p.x, h),
       derivative([&](double y) { return dF_dy(y).z; }, p.y, h),
       derivative([&](double z) { return dF_dz(z).z; }, p.z, h)},
  }};
}

// Vector line integral: int_a^b F(r(t)) . r'(t) dt
inline double vector_line_integral(
    const VectorField& F,
    const std::function<Vec3(double)>& curve,
    double a,
    double b,
    int panels = 64) {
  auto r_prime = [&](double t) -> Vec3 {
    double h = 1e-4;
    Vec3 rp{
        derivative([&](double u) { return curve(u).x; }, t, h),
        derivative([&](double u) { return curve(u).y; }, t, h),
        derivative([&](double u) { return curve(u).z; }, t, h),
    };
    return rp;
  };
  return integrate_gl16([&](double t) { return dot(F(curve(t)), r_prime(t)); }, a, b, panels);
}

// Surface flux integral: int_{u0}^{u1} int_{v0}^{v1} F(r(u,v)) . (dr/du x dr/dv) dv du
inline double surface_flux_integral(
    const VectorField& F,
    const std::function<Vec3(double, double)>& surface,
    double u0,
    double u1,
    double v0,
    double v1,
    int panels = 24) {
  return integrate_gl16([&](double u) {
    return integrate_gl16([&](double v) {
      double h = 1e-4;
      Vec3 ru{
          derivative([&](double uu) { return surface(uu, v).x; }, u, h),
          derivative([&](double uu) { return surface(uu, v).y; }, u, h),
          derivative([&](double uu) { return surface(uu, v).z; }, u, h),
      };
      Vec3 rv{
          derivative([&](double vv) { return surface(u, vv).x; }, v, h),
          derivative([&](double vv) { return surface(u, vv).y; }, v, h),
          derivative([&](double vv) { return surface(u, vv).z; }, v, h),
      };
      return dot(F(surface(u, v)), cross(ru, rv));
    }, v0, v1, panels);
  }, u0, u1, panels);
}

// ============================================================================
// 3. ANALYTICAL POLYNOMIAL CALCULUS & CONTINUOUS TRANSFORMS
// ============================================================================

struct Polynomial {
  std::vector<double> coeffs;  // coeffs[k] is coefficient of t^k

  int degree() const {
    int deg = static_cast<int>(coeffs.size()) - 1;
    while (deg > 0 && std::abs(coeffs[deg]) < 1e-12) {
      --deg;
    }
    return std::max(0, deg);
  }

  double evaluate(double t) const {
    double res = 0.0;
    for (int k = static_cast<int>(coeffs.size()) - 1; k >= 0; --k) {
      res = res * t + coeffs[k];
    }
    return res;
  }

  Polynomial derivative() const {
    if (coeffs.size() <= 1) return Polynomial{{0.0}};
    std::vector<double> d(coeffs.size() - 1);
    for (std::size_t k = 1; k < coeffs.size(); ++k) {
      d[k - 1] = coeffs[k] * static_cast<double>(k);
    }
    return Polynomial{std::move(d)};
  }

  Polynomial antiderivative(double c = 0.0) const {
    std::vector<double> anti(coeffs.size() + 1, 0.0);
    anti[0] = c;
    for (std::size_t k = 0; k < coeffs.size(); ++k) {
      anti[k + 1] = coeffs[k] / static_cast<double>(k + 1);
    }
    return Polynomial{std::move(anti)};
  }

  double integrate(double a, double b) const {
    auto anti = antiderivative();
    return anti.evaluate(b) - anti.evaluate(a);
  }

  // Exact repeated integration by parts for int_a^b P(t) cos(n w0 t) dt
  double integrate_cos(int n, double w0, double a, double b) const {
    if (n == 0 || w0 == 0.0) return integrate(a, b);
    double nw = static_cast<double>(n) * w0;

    auto eval_bracket = [&](double t) {
      double sum = 0.0;
      Polynomial p = *this;
      int k = 0;
      double nw_pow = nw;
      while (p.coeffs.size() > 0 && !(p.degree() == 0 && std::abs(p.coeffs[0]) < 1e-12)) {
        double p_val = p.evaluate(t);
        int m = k / 2;
        int sign = (m % 2 == 0) ? 1 : -1;
        if (k % 2 == 0) {
          sum += sign * p_val * std::sin(nw * t) / nw_pow;
        } else {
          sum += sign * p_val * std::cos(nw * t) / nw_pow;
        }
        p = p.derivative();
        ++k;
        nw_pow *= nw;
        if (k > 20) break;
      }
      return sum;
    };

    return eval_bracket(b) - eval_bracket(a);
  }

  // Exact repeated integration by parts for int_a^b P(t) sin(n w0 t) dt
  double integrate_sin(int n, double w0, double a, double b) const {
    if (n == 0 || w0 == 0.0) return 0.0;
    double nw = static_cast<double>(n) * w0;

    auto eval_bracket = [&](double t) {
      double sum = 0.0;
      Polynomial p = *this;
      int k = 0;
      double nw_pow = nw;
      while (p.coeffs.size() > 0 && !(p.degree() == 0 && std::abs(p.coeffs[0]) < 1e-12)) {
        double p_val = p.evaluate(t);
        int m = k / 2;
        if (k % 2 == 0) {
          int sign = (m % 2 == 0) ? -1 : 1;
          sum += sign * p_val * std::cos(nw * t) / nw_pow;
        } else {
          int sign = (m % 2 == 0) ? 1 : -1;
          sum += sign * p_val * std::sin(nw * t) / nw_pow;
        }
        p = p.derivative();
        ++k;
        nw_pow *= nw;
        if (k > 20) break;
      }
      return sum;
    };

    return eval_bracket(b) - eval_bracket(a);
  }
};

// Analytical Continuous Fourier Transforms
inline std::complex<double> continuous_ft_rect(double A, double tau, double shift, double f) {
  double sinc_val = (std::abs(f) < 1e-15) ? 1.0 : std::sin(kPi * tau * f) / (kPi * tau * f);
  double mag = A * tau * sinc_val;
  double phase = -kTau * f * shift;
  return {mag * std::cos(phase), mag * std::sin(phase)};
}

inline std::complex<double> continuous_ft_tri(double A, double tau, double shift, double f) {
  double sinc_val = (std::abs(f) < 1e-15) ? 1.0 : std::sin(kPi * tau * f) / (kPi * tau * f);
  double mag = A * tau * sinc_val * sinc_val;
  double phase = -kTau * f * shift;
  return {mag * std::cos(phase), mag * std::sin(phase)};
}

inline std::complex<double> continuous_ft_exp_causal(double A, double a, double f) {
  double denom = a * a + kTau * kTau * f * f;
  return {A * a / denom, -A * kTau * f / denom};
}

inline std::complex<double> continuous_ft_exp_two_sided(double A, double a, double f) {
  double denom = a * a + kTau * kTau * f * f;
  return {2.0 * A * a / denom, 0.0};
}

inline std::complex<double> continuous_ft_gaussian(double A, double tau, double f) {
  double val = A * tau * std::exp(-kPi * (tau * f) * (tau * f));
  return {val, 0.0};
}

}  // namespace openee::math
