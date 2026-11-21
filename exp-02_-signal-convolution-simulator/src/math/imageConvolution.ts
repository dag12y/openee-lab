export type KernelPresetId =
  | 'identity'
  | 'gaussian'
  | 'sobelX'
  | 'sobelY'
  | 'sharpen'
  | 'custom';

export type SampleImageId = 'shapes' | 'architecture' | 'circuit' | 'testpattern';

export type ImageChannelMode = 'rgb' | 'grayscale';

export type BoundaryMode = 'clamp' | 'zero' | 'reflect';

export type SignedOutputMode = 'magnitude' | 'offset128' | 'clamp';

export interface KernelPreset {
  id: Exclude<KernelPresetId, 'custom'>;
  label: string;
  weights: number[]; // length 9, row-major 3x3
  divisor: number;
  defaultSignedMode: SignedOutputMode;
  summary: string;
  mathInsight: string;
}

export interface SampleImageDescriptor {
  id: SampleImageId;
  label: string;
  description: string;
}

export interface RawImageBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA length = width * height * 4
}

export interface PatchStepDetail {
  centerX: number;
  centerY: number;
  patchValues: number[]; // 9 values (0-255)
  patchColors: [number, number, number][]; // 9 RGB swatches for visual clarity
  kernelWeights: number[]; // 9 weights
  divisor: number;
  products: number[]; // 9 element-by-element products (patchValues[i] * kernelWeights[i])
  rawSum: number;
  normalizedValue: number;
  outputPixelValue: number; // 0-255 final mapped scalar
  outputRgb: [number, number, number];
}

export const IMAGE_WIDTH = 160;
export const IMAGE_HEIGHT = 120;

export const KERNEL_PRESETS: KernelPreset[] = [
  {
    id: 'identity',
    label: 'Identity',
    weights: [0, 0, 0, 0, 1, 0, 0, 0, 0],
    divisor: 1,
    defaultSignedMode: 'clamp',
    summary: 'Leaves the image unchanged by copying the center pixel with weight 1.',
    mathInsight:
      'Acts as the 2D discrete unit impulse δ[m, n]. Only the center product survives; all 8 neighbors are multiplied by 0.',
  },
  {
    id: 'gaussian',
    label: 'Gaussian Blur',
    weights: [1, 2, 1, 2, 4, 2, 1, 2, 1],
    divisor: 16,
    defaultSignedMode: 'clamp',
    summary: 'Smooths noise and sharp transitions using a weighted bell-shaped average.',
    mathInsight:
      'Low-pass spatial filter: weights sum to 16 and are divided by 16 (Σ = 1), preserving overall brightness while attenuating high-frequency detail.',
  },
  {
    id: 'sobelX',
    label: 'Sobel X (Vertical Edges)',
    weights: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
    divisor: 1,
    defaultSignedMode: 'magnitude',
    summary: 'Detects vertical edges by measuring horizontal intensity gradients (∂I/∂x).',
    mathInsight:
      'Weights sum to 0, so uniform regions output 0 (black). Strong left-to-right brightness jumps yield large positive or negative derivatives.',
  },
  {
    id: 'sobelY',
    label: 'Sobel Y (Horizontal Edges)',
    weights: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
    divisor: 1,
    defaultSignedMode: 'magnitude',
    summary: 'Detects horizontal edges by measuring vertical intensity gradients (∂I/∂y).',
    mathInsight:
      'Weights sum to 0 while smoothing horizontally. Top-to-bottom intensity transitions produce strong gradient responses along horizontal boundaries.',
  },
  {
    id: 'sharpen',
    label: 'Sharpening',
    weights: [0, -1, 0, -1, 5, -1, 0, -1, 0],
    divisor: 1,
    defaultSignedMode: 'clamp',
    summary: 'Enhances crisp edges and fine texture by boosting local contrast.',
    mathInsight:
      'Equivalent to Original + (Original − Neighbors). Weights sum to 1 so flat areas remain identical while edges overshoot slightly for visual crispness.',
  },
];

export const SAMPLE_IMAGE_DESCRIPTORS: SampleImageDescriptor[] = [
  {
    id: 'shapes',
    label: 'Geometric Shapes',
    description: 'High-contrast primitives, diagonal edges, ramp, and checkerboard',
  },
  {
    id: 'architecture',
    label: 'Building Facade',
    description: 'Columns, horizontal lintels, windows, and pitched roof lines',
  },
  {
    id: 'circuit',
    label: 'PCB Circuit',
    description: 'Copper traces, IC pins, pads, and 45° routing paths',
  },
  {
    id: 'testpattern',
    label: 'Rings & Grain',
    description: 'Concentric frequency rings, step bars, and noisy patch',
  },
];

export function getKernelPreset(id: Exclude<KernelPresetId, 'custom'>): KernelPreset {
  return KERNEL_PRESETS.find((k) => k.id === id) ?? KERNEL_PRESETS[0];
}

function setPx(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  const idx = (y * w + x) * 4;
  data[idx] = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = 255;
}

function fillRect(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  r: number,
  g: number,
  b: number,
) {
  const x0 = Math.max(0, Math.floor(rx));
  const y0 = Math.max(0, Math.floor(ry));
  const x1 = Math.min(w, Math.ceil(rx + rw));
  const y1 = Math.min(h, Math.ceil(ry + rh));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      setPx(data, w, h, x, y, r, g, b);
    }
  }
}

export function generateSampleImage(
  id: SampleImageId,
  width = IMAGE_WIDTH,
  height = IMAGE_HEIGHT,
): RawImageBuffer {
  const data = new Uint8ClampedArray(width * height * 4);

  if (id === 'shapes') {
    // Clean studio gradient backdrop
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bg = Math.round(28 + (y / height) * 26);
        setPx(data, width, height, x, y, bg, bg + 6, bg + 16);
      }
    }

    // Crisp bright square
    fillRect(data, width, height, 18, 18, 38, 38, 240, 244, 248);
    fillRect(data, width, height, 26, 26, 22, 22, 37, 99, 235);

    // Warm orange circle
    const cx = 112;
    const cy = 38;
    const rad = 22;
    for (let y = cy - rad; y <= cy + rad; y++) {
      for (let x = cx - rad; x <= cx + rad; x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 <= rad * rad) {
          const shade = 1 - Math.sqrt(d2) / (rad * 2.5);
          setPx(
            data,
            width,
            height,
            x,
            y,
            Math.round(245 * shade),
            Math.round(145 * shade),
            Math.round(32 * shade),
          );
        }
      }
    }

    // Rotated teal diamond
    const dx = 72;
    const dy = 74;
    for (let y = dy - 22; y <= dy + 22; y++) {
      for (let x = dx - 22; x <= dx + 22; x++) {
        if (Math.abs(x - dx) + Math.abs(y - dy) <= 20) {
          setPx(data, width, height, x, y, 20, 184, 166);
        }
      }
    }

    // Fine 4x4 checkerboard for testing Gaussian Blur & Sharpening
    for (let y = 74; y < 106; y++) {
      for (let x = 104; x < 144; x++) {
        const isWhite = (Math.floor((x - 104) / 4) + Math.floor((y - 74) / 4)) % 2 === 0;
        const v = isWhite ? 236 : 24;
        setPx(data, width, height, x, y, v, v, v);
      }
    }

    // Smooth horizontal gradient bar at bottom-left
    for (let y = 78; y < 102; y++) {
      for (let x = 16; x < 48; x++) {
        const t = (x - 16) / 31;
        setPx(data, width, height, x, y, Math.round(30 + 210 * t), Math.round(60 + 170 * t), 220);
      }
    }
  } else if (id === 'architecture') {
    // Dusk sky gradient
    for (let y = 0; y < height; y++) {
      const t = y / height;
      const r = Math.round(24 + 80 * t);
      const g = Math.round(52 + 100 * t);
      const b = Math.round(108 + 90 * t);
      for (let x = 0; x < width; x++) {
        setPx(data, width, height, x, y, r, g, b);
      }
    }

    // Ground plaza
    fillRect(data, width, height, 0, 96, width, 24, 52, 58, 68);

    // Pitched triangular pediment roof
    for (let y = 18; y < 40; y++) {
      const halfSpan = Math.round(((y - 18) / 22) * 56);
      for (let x = 80 - halfSpan; x <= 80 + halfSpan; x++) {
        setPx(data, width, height, x, y, 198, 92, 68);
      }
    }

    // Main stone building body
    fillRect(data, width, height, 28, 40, 104, 56, 224, 220, 212);
    // Horizontal cornice & lintel bands (strong Sobel Y response)
    fillRect(data, width, height, 24, 38, 112, 4, 172, 168, 160);
    fillRect(data, width, height, 26, 66, 108, 3, 168, 164, 156);

    // Vertical columns & lit windows (strong Sobel X response)
    for (const colX of [34, 56, 78, 100, 120]) {
      fillRect(data, width, height, colX, 42, 6, 54, 244, 241, 235);
    }
    for (const winX of [44, 66, 88, 110]) {
      fillRect(data, width, height, winX, 46, 8, 14, 32, 64, 112);
      fillRect(data, width, height, winX, 74, 8, 16, 250, 204, 92);
    }
  } else if (id === 'circuit') {
    // Deep emerald PCB substrate
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        setPx(data, width, height, x, y, 12, 62, 44);
      }
    }

    // Horizontal & vertical copper traces
    for (const ty of [22, 34, 46, 74, 86, 98]) {
      fillRect(data, width, height, 14, ty, 44, 3, 22, 168, 102);
      fillRect(data, width, height, 102, ty, 44, 3, 22, 168, 102);
    }
    for (const tx of [24, 134]) {
      fillRect(data, width, height, tx, 14, 3, 92, 22, 168, 102);
    }

    // Diagonal 45-degree bus traces
    for (let k = 0; k < 28; k++) {
      fillRect(data, width, height, 36 + k, 34 + k, 2, 2, 245, 194, 66);
      fillRect(data, width, height, 122 - k, 34 + k, 2, 2, 245, 194, 66);
    }

    // Central IC chip package + silver pins
    fillRect(data, width, height, 58, 36, 44, 48, 28, 32, 38);
    fillRect(data, width, height, 62, 40, 36, 40, 44, 50, 60);
    for (let py = 42; py <= 76; py += 8) {
      fillRect(data, width, height, 52, py, 6, 4, 226, 232, 240);
      fillRect(data, width, height, 102, py, 6, 4, 226, 232, 240);
    }

    // Gold circular mounting pads
    for (const [px, py] of [
      [18, 18],
      [142, 18],
      [18, 102],
      [142, 102],
    ]) {
      for (let y = py - 6; y <= py + 6; y++) {
        for (let x = px - 6; x <= px + 6; x++) {
          const d2 = (x - px) ** 2 + (y - py) ** 2;
          if (d2 <= 36 && d2 >= 6) {
            setPx(data, width, height, x, y, 245, 186, 54);
          }
        }
      }
    }
  } else {
    // Concentric rings + step bars + deterministic grain patch
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - 58;
        const dy = y - 60;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let val = Math.round(128 + 112 * Math.cos(dist * 0.42));

        // Vertical intensity bars on right side
        if (x >= 112) {
          const band = Math.floor((y / height) * 5);
          val = [24, 78, 132, 190, 242][Math.min(4, band)];
          // Add deterministic high-frequency noise on lower-right bars
          if (y >= 62) {
            const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
            const noise = (hash - Math.floor(hash) - 0.5) * 90;
            val = Math.max(0, Math.min(255, Math.round(val + noise)));
          }
        }
        setPx(data, width, height, x, y, val, val, val);
      }
    }
    // Crisp crosshair
    fillRect(data, width, height, 57, 10, 2, 100, 239, 68, 68);
    fillRect(data, width, height, 12, 59, 92, 2, 56, 189, 248);
  }

  return { width, height, data };
}

export function toGrayscaleBuffer(source: RawImageBuffer): RawImageBuffer {
  const out = new Uint8ClampedArray(source.data.length);
  for (let i = 0; i < source.data.length; i += 4) {
    const luma = Math.round(
      0.299 * source.data[i] +
        0.587 * source.data[i + 1] +
        0.114 * source.data[i + 2],
    );
    out[i] = luma;
    out[i + 1] = luma;
    out[i + 2] = luma;
    out[i + 3] = 255;
  }
  return { width: source.width, height: source.height, data: out };
}

export function sampleCoordWithBoundary(
  coord: number,
  limit: number,
  boundary: BoundaryMode,
): number {
  if (coord >= 0 && coord < limit) return coord;
  if (boundary === 'zero') return -1;
  if (boundary === 'clamp') {
    return coord < 0 ? 0 : limit - 1;
  }
  // reflect
  let c = coord;
  if (c < 0) c = -c;
  if (c >= limit) c = limit - 1 - (c - limit);
  return Math.max(0, Math.min(limit - 1, c));
}

export function mapRawConvolutionOutput(
  normalizedValue: number,
  signedMode: SignedOutputMode,
): number {
  if (signedMode === 'magnitude') {
    return Math.max(0, Math.min(255, Math.round(Math.abs(normalizedValue))));
  }
  if (signedMode === 'offset128') {
    return Math.max(0, Math.min(255, Math.round(128 + normalizedValue)));
  }
  return Math.max(0, Math.min(255, Math.round(normalizedValue)));
}

export function convolveImageRGBA(
  source: RawImageBuffer,
  weights: number[],
  divisor: number,
  channelMode: ImageChannelMode,
  boundary: BoundaryMode,
  signedMode: SignedOutputMode,
): RawImageBuffer {
  const { width, height } = source;
  const srcData = channelMode === 'grayscale' ? toGrayscaleBuffer(source).data : source.data;
  const out = new Uint8ClampedArray(srcData.length);
  const safeDiv = Math.abs(divisor) < 1e-6 ? 1 : divisor;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      for (let ky = -1; ky <= 1; ky++) {
        const sy = sampleCoordWithBoundary(y + ky, height, boundary);
        for (let kx = -1; kx <= 1; kx++) {
          const sx = sampleCoordWithBoundary(x + kx, width, boundary);
          if (sy === -1 || sx === -1) continue;

          const w = weights[(ky + 1) * 3 + (kx + 1)];
          if (w === 0) continue;

          const sIdx = (sy * width + sx) * 4;
          sumR += srcData[sIdx] * w;
          if (channelMode === 'rgb') {
            sumG += srcData[sIdx + 1] * w;
            sumB += srcData[sIdx + 2] * w;
          }
        }
      }

      const dIdx = (y * width + x) * 4;
      const outR = mapRawConvolutionOutput(sumR / safeDiv, signedMode);
      if (channelMode === 'grayscale') {
        out[dIdx] = outR;
        out[dIdx + 1] = outR;
        out[dIdx + 2] = outR;
      } else {
        out[dIdx] = outR;
        out[dIdx + 1] = mapRawConvolutionOutput(sumG / safeDiv, signedMode);
        out[dIdx + 2] = mapRawConvolutionOutput(sumB / safeDiv, signedMode);
      }
      out[dIdx + 3] = 255;
    }
  }

  return { width, height, data: out };
}

export function evalPatchConvolutionAt(
  source: RawImageBuffer,
  centerX: number,
  centerY: number,
  weights: number[],
  divisor: number,
  channelMode: ImageChannelMode,
  boundary: BoundaryMode,
  signedMode: SignedOutputMode,
  inspectChannel: 'luma' | 'r' | 'g' | 'b' = 'luma',
): PatchStepDetail {
  const { width, height } = source;
  const cx = Math.max(0, Math.min(width - 1, Math.round(centerX)));
  const cy = Math.max(0, Math.min(height - 1, Math.round(centerY)));
  const srcData = channelMode === 'grayscale' ? toGrayscaleBuffer(source).data : source.data;
  const safeDiv = Math.abs(divisor) < 1e-6 ? 1 : divisor;

  const patchValues: number[] = [];
  const patchColors: [number, number, number][] = [];
  const products: number[] = [];

  let rawSum = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let ky = -1; ky <= 1; ky++) {
    const sy = sampleCoordWithBoundary(cy + ky, height, boundary);
    for (let kx = -1; kx <= 1; kx++) {
      const sx = sampleCoordWithBoundary(cx + kx, width, boundary);
      const kIdx = (ky + 1) * 3 + (kx + 1);
      const weight = weights[kIdx];

      let r = 0;
      let g = 0;
      let b = 0;
      if (sy !== -1 && sx !== -1) {
        const sIdx = (sy * width + sx) * 4;
        r = srcData[sIdx];
        g = srcData[sIdx + 1];
        b = srcData[sIdx + 2];
      }

      const scalarVal =
        channelMode === 'grayscale'
          ? r
          : inspectChannel === 'r'
            ? r
            : inspectChannel === 'g'
              ? g
              : inspectChannel === 'b'
                ? b
                : Math.round(0.299 * r + 0.587 * g + 0.114 * b);

      const prod = scalarVal * weight;
      patchValues.push(scalarVal);
      patchColors.push([r, g, b]);
      products.push(prod);
      rawSum += prod;

      sumR += r * weight;
      sumG += g * weight;
      sumB += b * weight;
    }
  }

  const normalizedValue = rawSum / safeDiv;
  const outputPixelValue = mapRawConvolutionOutput(normalizedValue, signedMode);
  const outR = mapRawConvolutionOutput(sumR / safeDiv, signedMode);
  const outG = channelMode === 'grayscale' ? outR : mapRawConvolutionOutput(sumG / safeDiv, signedMode);
  const outB = channelMode === 'grayscale' ? outR : mapRawConvolutionOutput(sumB / safeDiv, signedMode);

  return {
    centerX: cx,
    centerY: cy,
    patchValues,
    patchColors,
    kernelWeights: weights.slice(0, 9),
    divisor: safeDiv,
    products,
    rawSum,
    normalizedValue,
    outputPixelValue,
    outputRgb: [outR, outG, outB],
  };
}
