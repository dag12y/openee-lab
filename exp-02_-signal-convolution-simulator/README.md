# Signal Convolution Simulator

Standalone educational prototype contributed to OpenEE Lab. The main platform application is in `apps/web`; this experiment is not yet integrated into its navigation or shared simulation contracts.

## Run locally

Requires a Node.js version supporting TypeScript type stripping for the included test command.

```bash
npm install
npm run dev
npm run check
npm test
npm run build
```

The signal and image processing calculations are local; no Gemini API key is needed for these calculations.

## Modes

- Continuous-time convolution with numerical midpoint integration and analytical Dirac impulse sifting.
- Discrete-time finite-support convolution.
- 3D visualization of the overlap integrand (Dirac impulses are illustrated with Gaussian ridges, not exact distributions).
- Image filtering with 3×3 kernels, boundary choices, and per-pixel inspection.

## Mathematical conventions and limitations

Continuous regular signals are finite-window presets; integration uses the overlap of their supports. Numerical accuracy depends on the midpoint sample count and discontinuities. Discrete signals are finite-support presets and sums are bounded by their support. Image kernels are applied without reversal (cross-correlation convention); asymmetric custom kernels are therefore not strict mathematical convolution. Image values are mapped to 8-bit channels, which can clip signed responses.

The 3D mode is illustrative rather than an independent numerical solver. The experiment has not yet been integrated with the platform's shared contracts, worker execution, or validation framework. Run the checks and review the output before relying on numerical results.
