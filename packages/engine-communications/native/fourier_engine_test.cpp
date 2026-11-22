#include "fourier_engine.hpp"
#include <cassert>
#include <cmath>
#include <iostream>

using namespace openee::s3;

static void assert_near(double actual, double expected, double tol, const char* label) {
  double diff = std::abs(actual - expected);
  if (!(diff <= tol)) {
    std::cerr << "FAIL [" << label << "]: actual=" << actual << " expected=" << expected
              << " diff=" << diff << " tol=" << tol << "\n";
    std::exit(1);
  }
}

int main() {
  // 1. Analytical square wave: A=1, T=2, x(t) = +1 on (0,1), -1 on (1,2)
  auto square = [](double t) {
    double m = std::fmod(std::fmod(t, 2.0) + 2.0, 2.0);
    return m < 1.0 ? 1.0 : -1.0;
  };
  auto sq = compute_fourier_series(square, 0.0, 2.0, 50, 64);
  assert_near(sq.a0, 0.0, 1e-12, "square a0");
  assert_near(sq.harmonics[0].bn, 4.0 / kPi, 1e-12, "square b1");
  assert_near(sq.harmonics[1].bn, 0.0, 1e-12, "square b2");
  assert_near(sq.harmonics[2].bn, 4.0 / (3.0 * kPi), 1e-12, "square b3");
  assert_near(sq.total_power, 1.0, 1e-12, "square Parseval total power");

  // 2. Expression evaluator + piecewise ternary
  ExprEvaluator expr("t < 1 ? 2t : 2*(2 - t)");
  auto tri = compute_fourier_series([&](double t) { return expr.evaluate(t); }, 0.0, 2.0, 10, 64);
  assert_near(tri.a0, 1.0, 1e-12, "triangle expression a0");
  assert_near(tri.harmonics[0].an, -8.0 / (kPi * kPi), 1e-11, "triangle expression a1");

  // 3. Continuous Fourier Transform of rect(t / 2) at f = 0.25 Hz -> 2 * sinc(0.5) = 4/pi
  auto rect_fn = [](double t) { return std::abs(t) <= 1.0 ? 1.0 : 0.0; };
  auto xf = compute_continuous_fourier_transform(rect_fn, 0.25, 1.0, 64);
  assert_near(xf.real(), 4.0 / kPi, 1e-12, "rect FT Re(0.25)");
  assert_near(xf.imag(), 0.0, 1e-12, "rect FT Im(0.25)");

  // 4. Complex-plane epicycle DFT for unit circle z_m = exp(j 2pi m / M)
  const int M = 128;
  std::vector<std::complex<double>> circle;
  circle.reserve(M);
  for (int m = 0; m < M; ++m) {
    double ang = kTau * static_cast<double>(m) / static_cast<double>(M);
    circle.emplace_back(std::cos(ang), std::sin(ang));
  }
  auto epi = compute_epicycles(circle, 50);
  double k1_rad = 0.0;
  for (const auto& term : epi) {
    if (term.k == 1) k1_rad = term.radius;
    else assert_near(term.radius, 0.0, 1e-12, "circle non-fundamental epicycle");
  }
  assert_near(k1_rad, 1.0, 1e-12, "circle k=1 radius");

  // 5. Real calculus + extended ExprEvaluator operators (inverse trig, hyperbolic, logb, brace piecewise, deriv, integ, sum, prod)
  ExprEvaluator inv_hyp("acsc(2) + asec(2) + acot(1) + logb(2, 8) + sinh(0) + sech(0)");
  assert_near(inv_hyp.evaluate(0.0), (kPi / 6.0) + (kPi / 3.0) + (kPi / 4.0) + 3.0 + 0.0 + 1.0, 1e-12, "inverse trig + hyp + logb");

  ExprEvaluator brace("{0 <= t < 1: t^2, 1 <= t <= 2: -1, 0}");
  assert_near(brace.evaluate(0.5), 0.25, 1e-12, "brace piecewise branch 1");
  assert_near(brace.evaluate(1.5), -1.0, 1e-12, "brace piecewise branch 2");
  assert_near(brace.evaluate(-0.5), 0.0, 1e-12, "brace piecewise fallback");

  ExprEvaluator calc_op("deriv(t^3, t) + integ(x^2, 0, t) + sum(k, k, 1, 4) + prod(k, k, 1, 4)");
  // At t = 2: 3*4 + 8/3 + (1+2+3+4) + 24 = 12 + 2.666666... + 10 + 24 = 48.666666...
  assert_near(calc_op.evaluate(2.0), 46.0 + 8.0 / 3.0, 1e-9, "inline deriv/integ/sum/prod");

  // 6. Complex Algebra & Complex Calculus (Cauchy contour integral & Wirtinger Cauchy-Riemann)
  auto inv_z = [](std::complex<double> z) { return std::complex<double>(1.0, 0.0) / z; };
  auto unit_circle = [](double theta) { return std::complex<double>(std::cos(theta), std::sin(theta)); };
  auto res = openee::math::contour_integral(inv_z, unit_circle, 0.0, kTau, 64);
  assert_near(res.real(), 0.0, 1e-10, "contour integral Re{1/z}");
  assert_near(res.imag(), kTau, 1e-10, "contour integral Im{1/z} = 2*pi");

  auto w_holo = openee::math::wirtinger_derivatives([](std::complex<double> z) { return z * z; }, {3.0, 2.0});
  assert_near(w_holo.df_dz.real(), 6.0, 1e-9, "d(z^2)/dz Re");
  assert_near(w_holo.df_dz.imag(), 4.0, 1e-9, "d(z^2)/dz Im");
  assert_near(w_holo.cauchy_riemann_residual, 0.0, 1e-9, "holomorphic CR residual");

  auto w_non = openee::math::wirtinger_derivatives([](std::complex<double> z) {
    return std::complex<double>(std::norm(z), 0.0);  // |z|^2 = z * conj(z)
  }, {3.0, 2.0});
  assert_near(w_non.df_dz.real(), 3.0, 1e-9, "d(|z|^2)/dz Re == conj(z)");
  assert_near(w_non.df_dz.imag(), -2.0, 1e-9, "d(|z|^2)/dz Im == conj(z)");
  assert_near(w_non.df_dz_conj.real(), 3.0, 1e-9, "d(|z|^2)/dz* Re == z");
  assert_near(w_non.df_dz_conj.imag(), 2.0, 1e-9, "d(|z|^2)/dz* Im == z");

  // 7. Vector Algebra & Vector Calculus
  using openee::math::Vec3;
  Vec3 va{1.0, 2.0, 3.0}, vb{4.0, -5.0, 6.0}, vc{0.0, 0.0, 2.0};
  assert_near(openee::math::dot(va, vb), 12.0, 1e-12, "vec3 dot");
  Vec3 cr = openee::math::cross(va, vb);
  assert_near(cr.x, 27.0, 1e-12, "vec3 cross x");
  assert_near(cr.y, 6.0, 1e-12, "vec3 cross y");
  assert_near(cr.z, -13.0, 1e-12, "vec3 cross z");
  assert_near(openee::math::scalar_triple(va, vb, vc), -26.0, 1e-12, "scalar triple");

  auto phi = [](const Vec3& p) { return p.x * p.x + p.y * p.y + 2.0 * p.z * p.z; };
  Vec3 g = openee::math::gradient(phi, {1.0, -2.0, 3.0});
  assert_near(g.x, 2.0, 1e-9, "grad x");
  assert_near(g.y, -4.0, 1e-9, "grad y");
  assert_near(g.z, 12.0, 1e-9, "grad z");
  assert_near(openee::math::laplacian(phi, {1.0, -2.0, 3.0}), 8.0, 1e-7, "laplacian");

  // Magnetic rotation field F = (-y, x, 0): div = 0, curl = (0, 0, 2), circulation around unit circle = 2*pi
  auto rot_field = [](const Vec3& p) { return Vec3{-p.y, p.x, 0.0}; };
  assert_near(openee::math::divergence(rot_field, {2.0, 3.0, -1.0}), 0.0, 1e-9, "rot div");
  Vec3 c_vec = openee::math::curl(rot_field, {2.0, 3.0, -1.0});
  assert_near(c_vec.z, 2.0, 1e-9, "rot curl z");
  double circ = openee::math::vector_line_integral(
      rot_field,
      [](double t) { return Vec3{std::cos(t), std::sin(t), 0.0}; },
      0.0, kTau, 48);
  assert_near(circ, kTau, 1e-10, "line integral circulation");

  // Flux of F = (x, y, z) through disk z=1, r<=1 -> div=3, planar normal +z with F_z=1 -> flux = pi
  double disk_flux = openee::math::surface_flux_integral(
      [](const Vec3& p) { return p; },
      [](double r, double th) { return Vec3{r * std::cos(th), r * std::sin(th), 1.0}; },
      0.0, 1.0, 0.0, kTau, 16);
  assert_near(disk_flux, kPi, 1e-10, "surface flux integral");

  // 8. Analytical polynomial calculus & Fourier Series (P(t) = t^2 - 1 on [-pi, pi])
  openee::math::Polynomial p_t2_minus_1{{-1.0, 0.0, 1.0}}; // -1 + 0*t + 1*t^2
  auto p_series = compute_fourier_series_polynomial(p_t2_minus_1, -kPi, kPi, 6);
  assert_near(p_series.a0, (kPi * kPi / 3.0) - 1.0, 1e-12, "polynomial t^2-1 DC a0");
  assert_near(p_series.harmonics[0].an, -4.0, 1e-12, "polynomial t^2-1 a1 = -4");
  assert_near(p_series.harmonics[0].bn, 0.0, 1e-12, "polynomial t^2-1 b1 = 0");
  assert_near(p_series.harmonics[1].an, 1.0, 1e-12, "polynomial t^2-1 a2 = 1");
  assert_near(p_series.harmonics[2].an, -4.0 / 9.0, 1e-12, "polynomial t^2-1 a3 = -4/9");
  assert_near(p_series.harmonics[3].an, 1.0 / 4.0, 1e-12, "polynomial t^2-1 a4 = 1/4");

  // 9. Analytical continuous Fourier transform methods
  auto ft_r = openee::math::continuous_ft_rect(1.0, 2.0, 0.0, 0.25);
  assert_near(ft_r.real(), 4.0 / kPi, 1e-12, "analytical FT rect(t/2)");
  assert_near(ft_r.imag(), 0.0, 1e-12, "analytical FT rect(t/2) Im");

  auto ft_t = openee::math::continuous_ft_tri(1.0, 2.0, 0.0, 0.25);
  assert_near(ft_t.real(), 2.0 * (4.0 / (kPi * kPi)), 1e-12, "analytical FT tri(t/2)");

  auto ft_exp2 = openee::math::continuous_ft_exp_two_sided(1.0, 2.0, 0.5);
  // 2*A*a / (a^2 + (2*pi*f)^2) = 4 / (4 + pi^2)
  assert_near(ft_exp2.real(), 4.0 / (4.0 + kPi * kPi), 1e-12, "analytical FT exp(-2|t|)");

  std::cout << "C++20 S3 Fourier + Calculus/Complex/Vector engine tests passed (9/9 groups).\n";
  return 0;
}
