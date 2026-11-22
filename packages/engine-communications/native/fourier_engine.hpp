#pragma once

#include "calculus_vector_complex.hpp"
#include <algorithm>
#include <cmath>
#include <complex>
#include <cctype>
#include <functional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace openee::s3 {

inline constexpr double kPi = 3.141592653589793238462643383279502884;
inline constexpr double kTau = 2.0 * kPi;

struct FourierCoefficient {
  int n = 0;
  double an = 0.0;
  double bn = 0.0;
  double cn_mag = 0.0;
  double theta_n = 0.0;
  std::complex<double> c_pos{0.0, 0.0};
  std::complex<double> c_neg{0.0, 0.0};
};

struct SeriesResult {
  double period = 1.0;
  double omega0 = kTau;
  double a0 = 0.0;
  std::vector<FourierCoefficient> harmonics;
  double total_power = 0.0;
  double captured_power = 0.0;
  double gibbs_overshoot_pct = 0.0;
};

struct EpicycleTerm {
  int k = 0;
  std::complex<double> coeff{0.0, 0.0};
  double radius = 0.0;
  double phase = 0.0;
};

// Recursive-descent mathematical expression evaluator supporting:
// +, -, *, /, ^, comparisons (<, <=, >, >=, ==), chained comparisons (0 <= t < 1),
// ternary (cond ? a : b), brace piecewise ({c1: v1, c2: v2, fallback}),
// variables (t, x, scoped index), constants (pi, e, tau), trig, inverse trig,
// hyperbolic, logarithms (ln, log, logb), engineering signals, and inline
// calculus operators: deriv(expr, var), integ(expr, a, b), sum(expr, k, a, b), prod(expr, k, a, b).
class ExprEvaluator {
 public:
  explicit ExprEvaluator(std::string source) : src_(std::move(source)) {}

  double evaluate(double t) const {
    Parser p(src_, t, nullptr, 0.0);
    double val = p.parse_piecewise_or_ternary();
    p.skip_ws();
    if (!p.at_end()) {
      throw std::runtime_error("Unexpected trailing characters in expression");
    }
    return val;
  }

  double evaluate_with(double t, const std::string& extra_var, double extra_val) const {
    Parser p(src_, t, &extra_var, extra_val);
    double val = p.parse_piecewise_or_ternary();
    p.skip_ws();
    if (!p.at_end()) {
      throw std::runtime_error("Unexpected trailing characters in expression");
    }
    return val;
  }

 private:
  std::string src_;

  class Parser {
   public:
    Parser(const std::string& s, double t, const std::string* extra_var, double extra_val)
        : s_(s), t_(t), extra_var_(extra_var), extra_val_(extra_val) {}

    void skip_ws() {
      while (pos_ < s_.size() && std::isspace(static_cast<unsigned char>(s_[pos_]))) {
        ++pos_;
      }
    }

    bool at_end() const { return pos_ >= s_.size(); }

    double parse_piecewise_or_ternary() {
      skip_ws();
      if (match('{')) {
        double result = 0.0;
        bool matched = false;
        while (!at_end()) {
          skip_ws();
          if (match('}')) return result;
          std::size_t branch_start = pos_;
          double first = parse_ternary();
          skip_ws();
          if (match(':')) {
            double val = parse_ternary();
            if (!matched && first != 0.0) {
              result = val;
              matched = true;
            }
          } else {
            if (!matched) {
              result = first;
              matched = true;
            }
          }
          skip_ws();
          if (match(',')) continue;
          if (match('}')) return result;
          (void)branch_start;
          throw std::runtime_error("Expected ',' or '}' in brace piecewise block");
        }
        throw std::runtime_error("Unclosed '{' in piecewise expression");
      }
      return parse_ternary();
    }

    double parse_ternary() {
      double cond = parse_compare();
      skip_ws();
      if (match('?')) {
        double a = parse_piecewise_or_ternary();
        skip_ws();
        if (!match(':')) throw std::runtime_error("Expected ':' in ternary expression");
        double b = parse_piecewise_or_ternary();
        return cond != 0.0 ? a : b;
      }
      return cond;
    }

   private:
    const std::string& s_;
    double t_;
    const std::string* extra_var_;
    double extra_val_;
    std::size_t pos_ = 0;

    bool match(char c) {
      skip_ws();
      if (pos_ < s_.size() && s_[pos_] == c) {
        ++pos_;
        return true;
      }
      return false;
    }

    bool match_str(const char* lit) {
      skip_ws();
      std::size_t len = std::char_traits<char>::length(lit);
      if (s_.compare(pos_, len, lit) == 0) {
        pos_ += len;
        return true;
      }
      return false;
    }

    // Extract raw parenthesis-balanced arguments string starting right after '('
    std::vector<std::string> capture_raw_args() {
      std::vector<std::string> args;
      int paren_depth = 0;
      int brace_depth = 0;
      std::size_t cur_start = pos_;
      while (pos_ < s_.size()) {
        char ch = s_[pos_];
        if (ch == '(') { ++paren_depth; ++pos_; }
        else if (ch == '{') { ++brace_depth; ++pos_; }
        else if (ch == '}') { if (brace_depth > 0) --brace_depth; ++pos_; }
        else if (ch == ')') {
          if (paren_depth == 0 && brace_depth == 0) {
            std::string seg = s_.substr(cur_start, pos_ - cur_start);
            args.push_back(seg);
            ++pos_;
            return args;
          }
          --paren_depth;
          ++pos_;
        } else if (ch == ',' && paren_depth == 0 && brace_depth == 0) {
          args.push_back(s_.substr(cur_start, pos_ - cur_start));
          ++pos_;
          cur_start = pos_;
        } else {
          ++pos_;
        }
      }
      throw std::runtime_error("Missing ')' in calculus/series operator");
    }

    static std::string trim_copy(std::string v) {
      auto is_sp = [](unsigned char c) { return std::isspace(c) != 0; };
      while (!v.empty() && is_sp(static_cast<unsigned char>(v.front()))) v.erase(v.begin());
      while (!v.empty() && is_sp(static_cast<unsigned char>(v.back()))) v.pop_back();
      return v;
    }

    double parse_compare() {
      double lhs = parse_expr();
      bool chained_ok = true;
      bool has_cmp = false;
      for (;;) {
        skip_ws();
        if (match_str("<=")) {
          has_cmp = true;
          double rhs = parse_expr();
          if (!(lhs <= rhs)) chained_ok = false;
          lhs = rhs;
        } else if (match_str(">=")) {
          has_cmp = true;
          double rhs = parse_expr();
          if (!(lhs >= rhs)) chained_ok = false;
          lhs = rhs;
        } else if (match_str("==")) {
          has_cmp = true;
          double rhs = parse_expr();
          if (!(lhs == rhs)) chained_ok = false;
          lhs = rhs;
        } else if (match('<')) {
          has_cmp = true;
          double rhs = parse_expr();
          if (!(lhs < rhs)) chained_ok = false;
          lhs = rhs;
        } else if (match('>')) {
          has_cmp = true;
          double rhs = parse_expr();
          if (!(lhs > rhs)) chained_ok = false;
          lhs = rhs;
        } else {
          break;
        }
      }
      return has_cmp ? (chained_ok ? 1.0 : 0.0) : lhs;
    }

    double parse_expr() {
      double val = parse_term();
      for (;;) {
        skip_ws();
        if (match('+')) val += parse_term();
        else if (match('-')) val -= parse_term();
        else break;
      }
      return val;
    }

    double parse_term() {
      double val = parse_power();
      for (;;) {
        skip_ws();
        if (match('*')) {
          val *= parse_power();
        } else if (match('/')) {
          double d = parse_power();
          val = (d == 0.0) ? 0.0 : (val / d);
        } else {
          if (pos_ < s_.size() && (std::isalpha(static_cast<unsigned char>(s_[pos_])) || s_[pos_] == '(')) {
            val *= parse_power();
          } else {
            break;
          }
        }
      }
      return val;
    }

    double parse_power() {
      double base = parse_unary();
      skip_ws();
      if (match('^')) {
        double exponent = parse_power();
        return std::pow(base, exponent);
      }
      return base;
    }

    double parse_unary() {
      skip_ws();
      if (match('-')) return -parse_unary();
      if (match('+')) return parse_unary();
      return parse_primary();
    }

    double parse_primary() {
      skip_ws();
      if (pos_ < s_.size() && s_[pos_] == '{') {
        return parse_piecewise_or_ternary();
      }
      if (match('(')) {
        double inner = parse_piecewise_or_ternary();
        if (!match(')')) throw std::runtime_error("Missing closing parenthesis");
        return inner;
      }
      if (pos_ < s_.size() && (std::isdigit(static_cast<unsigned char>(s_[pos_])) || s_[pos_] == '.')) {
        std::size_t start = pos_;
        while (pos_ < s_.size() &&
               (std::isdigit(static_cast<unsigned char>(s_[pos_])) || s_[pos_] == '.' ||
                s_[pos_] == 'e' || s_[pos_] == 'E' ||
                ((s_[pos_] == '+' || s_[pos_] == '-') && pos_ > start &&
                 (s_[pos_ - 1] == 'e' || s_[pos_ - 1] == 'E')))) {
          ++pos_;
        }
        return std::stod(s_.substr(start, pos_ - start));
      }
      if (pos_ < s_.size() && std::isalpha(static_cast<unsigned char>(s_[pos_]))) {
        std::size_t start = pos_;
        while (pos_ < s_.size() && (std::isalnum(static_cast<unsigned char>(s_[pos_])) || s_[pos_] == '_')) {
          ++pos_;
        }
        std::string ident = s_.substr(start, pos_ - start);
        if (extra_var_ && ident == *extra_var_) return extra_val_;
        if (ident == "t" || ident == "x") return t_;
        if (ident == "pi") return kPi;
        if (ident == "tau") return kTau;
        if (ident == "e") return std::exp(1.0);
        if (match('(')) {
          // Higher-order calculus / summation / product operators
          if (ident == "deriv" || ident == "integ" || ident == "sum" || ident == "prod") {
            auto raw_args = capture_raw_args();
            if (ident == "deriv") {
              if (raw_args.empty() || raw_args.size() > 2) {
                throw std::runtime_error("deriv(expr[, var]) expects 1 or 2 arguments");
              }
              std::string var_name = raw_args.size() == 2 ? trim_copy(raw_args[1]) : "t";
              ExprEvaluator sub(raw_args[0]);
              return openee::math::derivative([&](double v) {
                return (var_name == "t" || var_name == "x")
                    ? sub.evaluate_with(v, extra_var_ ? *extra_var_ : "", extra_val_)
                    : sub.evaluate_with(t_, var_name, v);
              }, t_);
            }
            if (ident == "integ") {
              if (raw_args.size() != 3) {
                throw std::runtime_error("integ(expr, a, b) expects 3 arguments");
              }
              ExprEvaluator sub(raw_args[0]);
              ExprEvaluator lo_ev(raw_args[1]);
              ExprEvaluator hi_ev(raw_args[2]);
              double a = lo_ev.evaluate(t_);
              double b = hi_ev.evaluate(t_);
              return openee::math::integrate_gl16([&](double v) {
                return sub.evaluate_with(v, extra_var_ ? *extra_var_ : "", extra_val_);
              }, a, b, 24);
            }
            if (ident == "sum" || ident == "prod") {
              if (raw_args.size() != 4) {
                throw std::runtime_error(ident + "(expr, var, start, end) expects 4 arguments");
              }
              ExprEvaluator sub(raw_args[0]);
              std::string var_name = trim_copy(raw_args[1]);
              int lo = static_cast<int>(std::llround(ExprEvaluator(raw_args[2]).evaluate(t_)));
              int hi = static_cast<int>(std::llround(ExprEvaluator(raw_args[3]).evaluate(t_)));
              int cap_hi = std::min(hi, lo + 500);
              double acc = (ident == "sum") ? 0.0 : 1.0;
              for (int k = lo; k <= cap_hi; ++k) {
                double v = sub.evaluate_with(t_, var_name, static_cast<double>(k));
                if (ident == "sum") acc += v;
                else acc *= v;
              }
              return acc;
            }
          }

          double arg = parse_piecewise_or_ternary();
          double arg2 = 0.0;
          bool has_arg2 = false;
          if (match(',')) {
            arg2 = parse_piecewise_or_ternary();
            has_arg2 = true;
          }
          if (!match(')')) throw std::runtime_error("Missing ')' after function argument");
          return apply_fn(ident, arg, arg2, has_arg2);
        }
        throw std::runtime_error("Unknown identifier: " + ident);
      }
      throw std::runtime_error("Unexpected token in expression");
    }

    static double apply_fn(const std::string& fn, double a, double b, bool has_b) {
      if (fn == "sin") return std::sin(a);
      if (fn == "cos") return std::cos(a);
      if (fn == "tan") return std::tan(a);
      if (fn == "csc") { double s = std::sin(a); return std::abs(s) < 1e-12 ? 0.0 : 1.0 / s; }
      if (fn == "sec") { double c = std::cos(a); return std::abs(c) < 1e-12 ? 0.0 : 1.0 / c; }
      if (fn == "cot") { double t = std::tan(a); return std::abs(t) < 1e-12 ? 0.0 : 1.0 / t; }
      if (fn == "asin") return std::abs(a) <= 1.0 ? std::asin(a) : 0.0;
      if (fn == "acos") return std::abs(a) <= 1.0 ? std::acos(a) : 0.0;
      if (fn == "atan") return std::atan(a);
      if (fn == "acsc") return std::abs(a) >= 1.0 ? std::asin(1.0 / a) : 0.0;
      if (fn == "asec") return std::abs(a) >= 1.0 ? std::acos(1.0 / a) : 0.0;
      if (fn == "acot") return a == 0.0 ? (kPi / 2.0) : std::atan(1.0 / a);
      if (fn == "sinh") return std::sinh(a);
      if (fn == "cosh") return std::cosh(a);
      if (fn == "tanh") return std::tanh(a);
      if (fn == "csch") { double s = std::sinh(a); return std::abs(s) < 1e-12 ? 0.0 : 1.0 / s; }
      if (fn == "sech") return 1.0 / std::cosh(a);
      if (fn == "coth") { double t = std::tanh(a); return std::abs(t) < 1e-12 ? 0.0 : 1.0 / t; }
      if (fn == "exp") return std::exp(a);
      if (fn == "ln") return a > 0.0 ? std::log(a) : 0.0;
      if (fn == "log") return a > 0.0 ? std::log10(a) : 0.0;
      if (fn == "logb" && has_b) return (a > 0.0 && a != 1.0 && b > 0.0) ? (std::log(b) / std::log(a)) : 0.0;
      if (fn == "sqrt") return std::sqrt(std::max(0.0, a));
      if (fn == "abs") return std::abs(a);
      if (fn == "floor") return std::floor(a);
      if (fn == "ceil") return std::ceil(a);
      if (fn == "sign" || fn == "sgn") return (a > 0.0) ? 1.0 : (a < 0.0 ? -1.0 : 0.0);
      if (fn == "step" || fn == "u") return (a >= 0.0) ? 1.0 : 0.0;
      if (fn == "rect") return (std::abs(a) < 0.5) ? 1.0 : (std::abs(a) == 0.5 ? 0.5 : 0.0);
      if (fn == "tri") return std::max(0.0, 1.0 - std::abs(a));
      if (fn == "sinc") return (std::abs(a) < 1e-12) ? 1.0 : std::sin(kPi * a) / (kPi * a);
      if (fn == "square") {
        double duty = has_b ? std::clamp(b, 0.01, 0.99) : 0.5;
        double u = std::fmod(std::fmod(a, 1.0) + 1.0, 1.0);
        return u < duty ? 1.0 : -1.0;
      }
      if (fn == "sawtooth") {
        double u = std::fmod(std::fmod(a, 1.0) + 1.0, 1.0);
        return 2.0 * u - 1.0;
      }
      if (fn == "triangle") {
        double u = std::fmod(std::fmod(a, 1.0) + 1.0, 1.0);
        return 1.0 - 4.0 * std::abs(u - 0.5);
      }
      if (fn == "pulse") {
        double duty = has_b ? std::clamp(b, 0.01, 0.99) : 0.25;
        double u = std::fmod(std::fmod(a, 1.0) + 1.0, 1.0);
        return u < duty ? 1.0 : 0.0;
      }
      if (fn == "min" && has_b) return std::min(a, b);
      if (fn == "max" && has_b) return std::max(a, b);
      throw std::runtime_error("Unsupported function: " + fn);
    }
  };
};

inline double integrate_gl16(const std::function<double(double)>& f, double a, double b, int panels = 64) {
  return openee::math::integrate_gl16(f, a, b, panels);
}

inline SeriesResult compute_fourier_series(
    const std::function<double(double)>& fn,
    double t_start,
    double period,
    int max_harmonics,
    int panels = 64) {
  SeriesResult res;
  res.period = period;
  res.omega0 = kTau / period;
  double t_end = t_start + period;

  res.a0 = (1.0 / period) * integrate_gl16(fn, t_start, t_end, panels);
  res.total_power = (1.0 / period) * integrate_gl16([&](double t) {
    double v = fn(t);
    return v * v;
  }, t_start, t_end, panels);
  res.captured_power = res.a0 * res.a0;

  res.harmonics.reserve(static_cast<std::size_t>(max_harmonics));
  for (int n = 1; n <= max_harmonics; ++n) {
    double nw = static_cast<double>(n) * res.omega0;
    double an = (2.0 / period) * integrate_gl16([&](double t) {
      return fn(t) * std::cos(nw * t);
    }, t_start, t_end, panels);
    double bn = (2.0 / period) * integrate_gl16([&](double t) {
      return fn(t) * std::sin(nw * t);
    }, t_start, t_end, panels);
    double mag = std::hypot(an, bn);
    double theta = (mag < 1e-13) ? 0.0 : std::atan2(-bn, an);

    FourierCoefficient coeff;
    coeff.n = n;
    coeff.an = an;
    coeff.bn = bn;
    coeff.cn_mag = mag;
    coeff.theta_n = theta;
    coeff.c_pos = std::complex<double>(0.5 * an, -0.5 * bn);
    coeff.c_neg = std::complex<double>(0.5 * an, 0.5 * bn);

    res.captured_power += 0.5 * (an * an + bn * bn);
    res.harmonics.push_back(coeff);
  }
  return res;
}

inline double evaluate_partial_sum(const SeriesResult& series, double t, int up_to_n) {
  double sum = series.a0;
  int limit = std::min(up_to_n, static_cast<int>(series.harmonics.size()));
  for (int i = 0; i < limit; ++i) {
    const auto& h = series.harmonics[static_cast<std::size_t>(i)];
    double angle = static_cast<double>(h.n) * series.omega0 * t;
    sum += h.an * std::cos(angle) + h.bn * std::sin(angle);
  }
  return sum;
}

inline std::complex<double> compute_continuous_fourier_transform(
    const std::function<double(double)>& fn,
    double freq_hz,
    double window_half_width,
    int panels = 96) {
  double omega = kTau * freq_hz;
  double re = integrate_gl16([&](double t) {
    return fn(t) * std::cos(omega * t);
  }, -window_half_width, window_half_width, panels);
  double im = integrate_gl16([&](double t) {
    return -fn(t) * std::sin(omega * t);
  }, -window_half_width, window_half_width, panels);
  return {re, im};
}

inline std::vector<EpicycleTerm> compute_epicycles(
    const std::vector<std::complex<double>>& contour_samples,
    int max_harmonic) {
  int m = static_cast<int>(contour_samples.size());
  std::vector<EpicycleTerm> terms;
  if (m == 0) return terms;
  int k_lim = std::min(max_harmonic, (m - 1) / 2);
  terms.reserve(static_cast<std::size_t>(2 * k_lim + 1));

  for (int k = -k_lim; k <= k_lim; ++k) {
    std::complex<double> acc{0.0, 0.0};
    for (int n = 0; n < m; ++n) {
      double angle = -kTau * static_cast<double>(k * n) / static_cast<double>(m);
      acc += contour_samples[static_cast<std::size_t>(n)] * std::complex<double>(std::cos(angle), std::sin(angle));
    }
    acc /= static_cast<double>(m);
    EpicycleTerm term;
    term.k = k;
    term.coeff = acc;
    term.radius = std::abs(acc);
    term.phase = std::arg(acc);
    terms.push_back(term);
  }
  std::sort(terms.begin(), terms.end(), [](const EpicycleTerm& a, const EpicycleTerm& b) {
    if (a.k == 0) return true;
    if (b.k == 0) return false;
    return a.radius > b.radius;
  });
  return terms;
}

// Analytical Fourier Series for any arbitrary polynomial P(t) using repeated integration by parts
inline SeriesResult compute_fourier_series_polynomial(
    const openee::math::Polynomial& poly,
    double a,
    double b,
    int harmonics) {
  double T0 = b - a;
  double w0 = kTau / T0;
  SeriesResult res;
  res.period = T0;
  res.omega0 = w0;
  res.a0 = (1.0 / T0) * poly.integrate(a, b);
  res.harmonics.reserve(harmonics);

  double captured = (res.a0 * 0.5) * (res.a0 * 0.5);
  for (int n = 1; n <= harmonics; ++n) {
    double an = (2.0 / T0) * poly.integrate_cos(n, w0, a, b);
    double bn = (2.0 / T0) * poly.integrate_sin(n, w0, a, b);
    FourierCoefficient fc;
    fc.n = n;
    fc.an = an;
    fc.bn = bn;
    fc.cn_mag = std::hypot(an, bn);
    fc.theta_n = std::atan2(-bn, an);
    fc.c_pos = {0.5 * an, -0.5 * bn};
    fc.c_neg = {0.5 * an, 0.5 * bn};
    captured += 0.5 * (an * an + bn * bn);
    res.harmonics.push_back(fc);
  }
  res.captured_power = captured;
  // Numerical Parseval power for reference
  res.total_power = (1.0 / T0) * openee::math::integrate_gl16(
      [&](double t) {
        double v = poly.evaluate(t);
        return v * v;
      },
      a, b, 64);
  return res;
}

}  // namespace openee::s3
