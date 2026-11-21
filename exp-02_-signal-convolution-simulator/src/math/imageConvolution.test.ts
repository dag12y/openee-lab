import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convolveImageRGBA,
  evalPatchConvolutionAt,
  generateSampleImage,
  getKernelPreset,
  toGrayscaleBuffer,
} from './imageConvolution';

function makeSolidPatch(w: number, h: number, r: number, g: number, b: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

test('Predefined kernels match required 3x3 weights and divisors', () => {
  const id = getKernelPreset('identity');
  assert.deepEqual(id.weights, [0, 0, 0, 0, 1, 0, 0, 0, 0]);
  assert.equal(id.divisor, 1);

  const gauss = getKernelPreset('gaussian');
  assert.deepEqual(gauss.weights, [1, 2, 1, 2, 4, 2, 1, 2, 1]);
  assert.equal(gauss.divisor, 16);

  const sobelX = getKernelPreset('sobelX');
  assert.deepEqual(sobelX.weights, [-1, 0, 1, -2, 0, 2, -1, 0, 1]);
  assert.equal(sobelX.divisor, 1);

  const sobelY = getKernelPreset('sobelY');
  assert.deepEqual(sobelY.weights, [-1, -2, -1, 0, 0, 0, 1, 2, 1]);
  assert.equal(sobelY.divisor, 1);

  const sharpen = getKernelPreset('sharpen');
  assert.deepEqual(sharpen.weights, [0, -1, 0, -1, 5, -1, 0, -1, 0]);
  assert.equal(sharpen.divisor, 1);
});

test('Identity kernel preserves RGB and grayscale images identically', () => {
  const img = generateSampleImage('shapes', 32, 24);
  const id = getKernelPreset('identity');
  const outRgb = convolveImageRGBA(img, id.weights, id.divisor, 'rgb', 'clamp', 'clamp');
  assert.deepEqual(Array.from(outRgb.data), Array.from(img.data));

  const gray = toGrayscaleBuffer(img);
  const outGray = convolveImageRGBA(img, id.weights, id.divisor, 'grayscale', 'clamp', 'clamp');
  assert.deepEqual(Array.from(outGray.data), Array.from(gray.data));
});

test('Gaussian Blur preserves flat region intensity and smooths sharp edge', () => {
  const flat = makeSolidPatch(9, 9, 120, 80, 200);
  const gauss = getKernelPreset('gaussian');
  const flatOut = convolveImageRGBA(flat, gauss.weights, gauss.divisor, 'rgb', 'clamp', 'clamp');
  const centerIdx = (4 * 9 + 4) * 4;
  assert.equal(flatOut.data[centerIdx], 120);
  assert.equal(flatOut.data[centerIdx + 1], 80);
  assert.equal(flatOut.data[centerIdx + 2], 200);

  // Step edge: left half 0, right half 160
  const edge = makeSolidPatch(8, 8, 0, 0, 0);
  for (let y = 0; y < 8; y++) {
    for (let x = 4; x < 8; x++) {
      const idx = (y * 8 + x) * 4;
      edge.data[idx] = edge.data[idx + 1] = edge.data[idx + 2] = 160;
    }
  }
  const blurEdge = convolveImageRGBA(edge, gauss.weights, gauss.divisor, 'grayscale', 'clamp', 'clamp');
  // At x=3 (just left of step): right column of 3x3 (1+2+1 = 4) has 160 -> 4*160/16 = 40
  assert.equal(blurEdge.data[(4 * 8 + 3) * 4], 40);
  // At x=4 (just right of step): center+right (4+2+2+1+1+2 = 12) has 160 -> 12*160/16 = 120
  assert.equal(blurEdge.data[(4 * 8 + 4) * 4], 120);
});

test('Sobel X responds to vertical edges and ignores horizontal edges; Sobel Y vice versa', () => {
  const vEdge = makeSolidPatch(7, 7, 0, 0, 0);
  for (let y = 0; y < 7; y++) {
    for (let x = 4; x < 7; x++) {
      const i = (y * 7 + x) * 4;
      vEdge.data[i] = vEdge.data[i + 1] = vEdge.data[i + 2] = 50;
    }
  }
  const sx = getKernelPreset('sobelX');
  const sy = getKernelPreset('sobelY');
  const outXOnV = convolveImageRGBA(vEdge, sx.weights, sx.divisor, 'grayscale', 'clamp', 'magnitude');
  const outYOnV = convolveImageRGBA(vEdge, sy.weights, sy.divisor, 'grayscale', 'clamp', 'magnitude');
  // At (3,3), right col is 50 -> (1+2+1)*50 = 200 for Sobel X, 0 for Sobel Y
  assert.equal(outXOnV.data[(3 * 7 + 3) * 4], 200);
  assert.equal(outYOnV.data[(3 * 7 + 3) * 4], 0);

  const hEdge = makeSolidPatch(7, 7, 0, 0, 0);
  for (let y = 4; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const i = (y * 7 + x) * 4;
      hEdge.data[i] = hEdge.data[i + 1] = hEdge.data[i + 2] = 50;
    }
  }
  const outXOnH = convolveImageRGBA(hEdge, sx.weights, sx.divisor, 'grayscale', 'clamp', 'magnitude');
  const outYOnH = convolveImageRGBA(hEdge, sy.weights, sy.divisor, 'grayscale', 'clamp', 'magnitude');
  assert.equal(outXOnH.data[(3 * 7 + 3) * 4], 0);
  assert.equal(outYOnH.data[(3 * 7 + 3) * 4], 200);
});

test('Boundary handling differentiates zero padding vs edge clamp at corner (0,0)', () => {
  const img = makeSolidPatch(5, 5, 160, 160, 160);
  const gauss = getKernelPreset('gaussian');
  const clamped = convolveImageRGBA(img, gauss.weights, gauss.divisor, 'grayscale', 'clamp', 'clamp');
  const zeroPadded = convolveImageRGBA(img, gauss.weights, gauss.divisor, 'grayscale', 'zero', 'clamp');
  assert.equal(clamped.data[0], 160);
  // At (0,0) with zero padding, only 4 weights (4+2+2+1 = 9) out of 16 hit 160 -> 90
  assert.equal(zeroPadded.data[0], 90);
});

test('evalPatchConvolutionAt matches full image convolution output and exposes exact products', () => {
  const img = generateSampleImage('architecture', 40, 30);
  const sharpen = getKernelPreset('sharpen');
  const fullOut = convolveImageRGBA(img, sharpen.weights, sharpen.divisor, 'rgb', 'clamp', 'clamp');
  const step = evalPatchConvolutionAt(img, 20, 15, sharpen.weights, sharpen.divisor, 'rgb', 'clamp', 'clamp', 'r');

  assert.equal(step.patchValues.length, 9);
  assert.equal(step.products.length, 9);
  const sumCheck = step.products.reduce((a, b) => a + b, 0);
  assert.equal(step.rawSum, sumCheck);

  const idx = (15 * 40 + 20) * 4;
  assert.deepEqual(step.outputRgb, [fullOut.data[idx], fullOut.data[idx + 1], fullOut.data[idx + 2]]);
});
