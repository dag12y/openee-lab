import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import {
  BoundaryMode,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  ImageChannelMode,
  KERNEL_PRESETS,
  KernelPresetId,
  RawImageBuffer,
  SAMPLE_IMAGE_DESCRIPTORS,
  SampleImageId,
  SignedOutputMode,
  convolveImageRGBA,
  evalPatchConvolutionAt,
  generateSampleImage,
  getKernelPreset,
  toGrayscaleBuffer,
} from '../math/imageConvolution';

type ComparisonLayout = 'sideBySide' | 'split';
type InspectChannel = 'luma' | 'r' | 'g' | 'b';

const DEFAULT_SAMPLE: SampleImageId = 'shapes';
const DEFAULT_KERNEL: Exclude<KernelPresetId, 'custom'> = 'sobelX';
// Pick a sharp boundary pixel by default so the 3x3 walkthrough immediately shows interesting gradients
const DEFAULT_CURSOR_BY_SAMPLE: Record<SampleImageId, { x: number; y: number }> = {
  shapes: { x: 56, y: 36 },
  architecture: { x: 44, y: 50 },
  circuit: { x: 58, y: 42 },
  testpattern: { x: 74, y: 60 },
};

function drawBufferToCanvas(
  canvas: HTMLCanvasElement,
  buffer: RawImageBuffer,
  highlight?: {
    x: number;
    y: number;
    mode: 'patch3x3' | 'pixel1x1';
    scanProgressIndex?: number; // If defined, pixels > scanProgressIndex are dimmed to show progressive generation
    baselineBuffer?: RawImageBuffer;
  },
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height, data } = buffer;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const imgData = ctx.createImageData(width, height);
  if (
    highlight?.scanProgressIndex !== undefined &&
    highlight.scanProgressIndex < width * height - 1
  ) {
    const limit = highlight.scanProgressIndex;
    const baseData = highlight.baselineBuffer?.data;
    for (let p = 0; p < width * height; p++) {
      const i = p * 4;
      if (p <= limit) {
        imgData.data[i] = data[i];
        imgData.data[i + 1] = data[i + 1];
        imgData.data[i + 2] = data[i + 2];
        imgData.data[i + 3] = 255;
      } else if (baseData) {
        imgData.data[i] = Math.round(baseData[i] * 0.35);
        imgData.data[i + 1] = Math.round(baseData[i + 1] * 0.35);
        imgData.data[i + 2] = Math.round(baseData[i + 2] * 0.35);
        imgData.data[i + 3] = 255;
      } else {
        imgData.data[i] = 15;
        imgData.data[i + 1] = 23;
        imgData.data[i + 2] = 42;
        imgData.data[i + 3] = 255;
      }
    }
  } else {
    imgData.data.set(data);
  }
  ctx.putImageData(imgData, 0, 0);

  if (highlight) {
    const { x, y, mode } = highlight;
    if (mode === 'patch3x3') {
      // Dark outer halo + bright amber 3x3 bounding frame + center pixel dot
      ctx.save();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.lineWidth = 2.4;
      ctx.strokeRect(x - 1.5, y - 1.5, 4, 4);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.1;
      ctx.strokeRect(x - 1.5, y - 1.5, 4, 4);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(x - 0.1, y - 0.1, 1.2, 1.2);
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.lineWidth = 2.2;
      ctx.strokeRect(x - 0.6, y - 0.6, 2.2, 2.2);
      ctx.strokeStyle = '#14B8A6';
      ctx.lineWidth = 1.0;
      ctx.strokeRect(x - 0.5, y - 0.5, 2.0, 2.0);
      ctx.restore();
    }
  }
}

export const ImageConvolutionView: React.FC = () => {
  const [sampleId, setSampleId] = useState<SampleImageId>(DEFAULT_SAMPLE);
  const [customImage, setCustomImage] = useState<{ name: string; buffer: RawImageBuffer } | null>(null);
  const [channelMode, setChannelMode] = useState<ImageChannelMode>('rgb');
  const [boundaryMode, setBoundaryMode] = useState<BoundaryMode>('clamp');

  const initialPreset = getKernelPreset(DEFAULT_KERNEL);
  const [presetId, setPresetId] = useState<KernelPresetId>(DEFAULT_KERNEL);
  const [activeWeights, setActiveWeights] = useState<number[]>(() => [...initialPreset.weights]);
  const [activeDivisor, setActiveDivisor] = useState<number>(initialPreset.divisor);
  const [draftWeights, setDraftWeights] = useState<string[]>(() =>
    initialPreset.weights.map((w) => String(w)),
  );
  const [draftDivisor, setDraftDivisor] = useState<string>(String(initialPreset.divisor));
  const [signedMode, setSignedMode] = useState<SignedOutputMode>(initialPreset.defaultSignedMode);

  // Comparison view state
  const [compareLayout, setCompareLayout] = useState<ComparisonLayout>('sideBySide');
  const [splitRatio, setSplitRatio] = useState<number>(0.5);

  // Interactive 3x3 walkthrough & scan animation state
  const [cursor, setCursor] = useState<{ x: number; y: number }>(
    () => DEFAULT_CURSOR_BY_SAMPLE[DEFAULT_SAMPLE],
  );
  const [inspectChannel, setInspectChannel] = useState<InspectChannel>('luma');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [hasActiveScanFrontier, setHasActiveScanFrontier] = useState<boolean>(false);
  const [scanSpeed, setScanSpeed] = useState<number>(12); // pixels per animation frame

  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const splitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Source image buffer (either built-in procedural or uploaded)
  const rawSourceBuffer = useMemo(() => {
    if (customImage) return customImage.buffer;
    return generateSampleImage(sampleId, IMAGE_WIDTH, IMAGE_HEIGHT);
  }, [sampleId, customImage]);

  const displayOriginalBuffer = useMemo(() => {
    return channelMode === 'grayscale' ? toGrayscaleBuffer(rawSourceBuffer) : rawSourceBuffer;
  }, [rawSourceBuffer, channelMode]);

  const processedBuffer = useMemo(() => {
    return convolveImageRGBA(
      rawSourceBuffer,
      activeWeights,
      activeDivisor,
      channelMode,
      boundaryMode,
      signedMode,
    );
  }, [rawSourceBuffer, activeWeights, activeDivisor, channelMode, boundaryMode, signedMode]);

  const hasUnappliedEdits = useMemo(() => {
    const parsedDiv = parseFloat(draftDivisor);
    if (!Number.isFinite(parsedDiv) || Math.abs(parsedDiv - activeDivisor) > 1e-6) return true;
    for (let i = 0; i < 9; i++) {
      const v = parseFloat(draftWeights[i]);
      if (!Number.isFinite(v) || Math.abs(v - activeWeights[i]) > 1e-6) return true;
    }
    return false;
  }, [draftWeights, draftDivisor, activeWeights, activeDivisor]);

  const patchDetail = useMemo(() => {
    return evalPatchConvolutionAt(
      rawSourceBuffer,
      cursor.x,
      cursor.y,
      activeWeights,
      activeDivisor,
      channelMode,
      boundaryMode,
      signedMode,
      inspectChannel,
    );
  }, [
    rawSourceBuffer,
    cursor.x,
    cursor.y,
    activeWeights,
    activeDivisor,
    channelMode,
    boundaryMode,
    signedMode,
    inspectChannel,
  ]);

  // Select predefined kernel preset
  const handleSelectPreset = useCallback((id: Exclude<KernelPresetId, 'custom'>) => {
    const preset = getKernelPreset(id);
    setPresetId(id);
    setActiveWeights([...preset.weights]);
    setActiveDivisor(preset.divisor);
    setDraftWeights(preset.weights.map((w) => String(w)));
    setDraftDivisor(String(preset.divisor));
    setSignedMode(preset.defaultSignedMode);
  }, []);

  // Apply custom/edited draft weights
  const handleApplyKernel = useCallback(() => {
    const nextWeights = draftWeights.map((raw, i) => {
      const v = parseFloat(raw);
      return Number.isFinite(v) ? v : activeWeights[i];
    });
    const parsedDiv = parseFloat(draftDivisor);
    const nextDiv = Number.isFinite(parsedDiv) && Math.abs(parsedDiv) >= 1e-4 ? parsedDiv : 1;
    setActiveWeights(nextWeights);
    setActiveDivisor(nextDiv);
    setDraftWeights(nextWeights.map((w) => String(w)));
    setDraftDivisor(String(nextDiv));

    // Check if matches any preset
    const matched = KERNEL_PRESETS.find(
      (p) =>
        Math.abs(p.divisor - nextDiv) < 1e-6 &&
        p.weights.every((pw, idx) => Math.abs(pw - nextWeights[idx]) < 1e-6),
    );
    setPresetId(matched ? matched.id : 'custom');
  }, [draftWeights, draftDivisor, activeWeights]);

  // Reset kernel to selected preset default (or Identity if custom)
  const handleResetKernel = useCallback(() => {
    const targetId = presetId === 'custom' ? DEFAULT_KERNEL : presetId;
    handleSelectPreset(targetId);
  }, [presetId, handleSelectPreset]);

  const handleSelectSample = useCallback((id: SampleImageId) => {
    setCustomImage(null);
    setSampleId(id);
    setIsScanning(false);
    setHasActiveScanFrontier(false);
    setCursor(DEFAULT_CURSOR_BY_SAMPLE[id]);
  }, []);

  const handleUploadFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = IMAGE_WIDTH;
        off.height = IMAGE_HEIGHT;
        const ctx = off.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
        const raw = ctx.getImageData(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
        setCustomImage({
          name: file.name,
          buffer: {
            width: IMAGE_WIDTH,
            height: IMAGE_HEIGHT,
            data: new Uint8ClampedArray(raw.data),
          },
        });
        setIsScanning(false);
        setHasActiveScanFrontier(false);
        setCursor({ x: Math.floor(IMAGE_WIDTH / 2), y: Math.floor(IMAGE_HEIGHT / 2) });
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // Raster scan animation loop
  useEffect(() => {
    if (!isScanning) return;
    let rafId = 0;
    const totalPixels = displayOriginalBuffer.width * displayOriginalBuffer.height;

    const tick = () => {
      setCursor((prev) => {
        const currentIdx = prev.y * displayOriginalBuffer.width + prev.x;
        const nextIdx = currentIdx + scanSpeed;
        if (nextIdx >= totalPixels - 1) {
          setIsScanning(false);
          setHasActiveScanFrontier(false);
          return {
            x: displayOriginalBuffer.width - 1,
            y: displayOriginalBuffer.height - 1,
          };
        }
        return {
          x: nextIdx % displayOriginalBuffer.width,
          y: Math.floor(nextIdx / displayOriginalBuffer.width),
        };
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isScanning, scanSpeed, displayOriginalBuffer.width, displayOriginalBuffer.height]);

  const handleToggleScan = () => {
    if (isScanning) {
      setIsScanning(false);
      return;
    }
    const totalPixels = displayOriginalBuffer.width * displayOriginalBuffer.height;
    const idx = cursor.y * displayOriginalBuffer.width + cursor.x;
    if (!hasActiveScanFrontier || idx >= totalPixels - 2) {
      setCursor({ x: 0, y: 0 });
    }
    setHasActiveScanFrontier(true);
    setIsScanning(true);
  };

  const handleStepScan = () => {
    setIsScanning(false);
    setHasActiveScanFrontier(true);
    const total = displayOriginalBuffer.width * displayOriginalBuffer.height;
    setCursor((prev) => {
      const next = (prev.y * displayOriginalBuffer.width + prev.x + 1) % total;
      return {
        x: next % displayOriginalBuffer.width,
        y: Math.floor(next / displayOriginalBuffer.width),
      };
    });
  };

  const handleResetScan = () => {
    setIsScanning(false);
    setHasActiveScanFrontier(false);
    setCursor(customImage ? { x: 80, y: 60 } : DEFAULT_CURSOR_BY_SAMPLE[sampleId]);
  };

  // Render side-by-side canvases
  useEffect(() => {
    const scanIdx = hasActiveScanFrontier
      ? cursor.y * displayOriginalBuffer.width + cursor.x
      : undefined;

    if (origCanvasRef.current) {
      drawBufferToCanvas(origCanvasRef.current, displayOriginalBuffer, {
        x: cursor.x,
        y: cursor.y,
        mode: 'patch3x3',
      });
    }
    if (procCanvasRef.current) {
      drawBufferToCanvas(procCanvasRef.current, processedBuffer, {
        x: cursor.x,
        y: cursor.y,
        mode: 'pixel1x1',
        scanProgressIndex: scanIdx,
        baselineBuffer: displayOriginalBuffer,
      });
    }
  }, [displayOriginalBuffer, processedBuffer, cursor.x, cursor.y, hasActiveScanFrontier, compareLayout]);

  // Render split slider canvas
  useEffect(() => {
    if (compareLayout !== 'split' || !splitCanvasRef.current) return;
    const canvas = splitCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = displayOriginalBuffer;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const splitX = Math.round(splitRatio * width);
    const merged = new Uint8ClampedArray(displayOriginalBuffer.data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const src = x < splitX ? displayOriginalBuffer.data : processedBuffer.data;
        merged[i] = src[i];
        merged[i + 1] = src[i + 1];
        merged[i + 2] = src[i + 2];
        merged[i + 3] = 255;
      }
    }
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(merged);
    ctx.putImageData(imgData, 0, 0);

    // Draw crisp split divider
    ctx.save();
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(splitX - 1, 0, 2, height);
    ctx.fillStyle = '#14B8A6';
    ctx.fillRect(splitX - 0.5, 0, 1, height);
    ctx.restore();
  }, [compareLayout, splitRatio, displayOriginalBuffer, processedBuffer]);

  // Pointer handler to inspect any pixel by clicking/dragging on Original or Processed image
  const handleCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons === 0 && e.type === 'pointermove') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = Math.max(0, Math.min(0.9999, (e.clientX - rect.left) / rect.width));
    const ry = Math.max(0, Math.min(0.9999, (e.clientY - rect.top) / rect.height));
    const px = Math.floor(rx * displayOriginalBuffer.width);
    const py = Math.floor(ry * displayOriginalBuffer.height);
    setIsScanning(false);
    setHasActiveScanFrontier(false);
    setCursor({ x: px, y: py });
  };

  const activePresetInfo = presetId === 'custom' ? null : getKernelPreset(presetId);

  return (
    <div className="space-y-4">
      {/* Top Options Strip: Sample Images, Color Mode, Boundary & Edge Mapping */}
      <section
        aria-label="Image processing configuration"
        className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Sample Image Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 mr-1">Sample Image</span>
            <div role="group" aria-label="Built-in sample images" className="flex flex-wrap items-center gap-1.5">
              {SAMPLE_IMAGE_DESCRIPTORS.map((sample) => {
                const active = !customImage && sampleId === sample.id;
                return (
                  <button
                    key={sample.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelectSample(sample.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'border-teal-600 bg-teal-50 text-teal-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {sample.label}
                  </button>
                );
              })}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleUploadFile}
                className="hidden"
                aria-label="Upload custom image"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  customImage
                    ? 'border-teal-600 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Upload className="h-3 w-3" />
                <span>{customImage ? customImage.name : 'Upload Image'}</span>
              </button>
            </div>
          </div>

          {/* Channel / Boundary / Signed Output Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Color channel mode">
              {(['rgb', 'grayscale'] as ImageChannelMode[]).map((cm) => {
                const active = channelMode === cm;
                return (
                  <button
                    key={cm}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setChannelMode(cm)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cm === 'rgb' ? 'RGB Color' : 'Grayscale'}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <label htmlFor="boundary-select" className="text-xs font-medium text-slate-500">
                Boundary
              </label>
              <select
                id="boundary-select"
                value={boundaryMode}
                onChange={(e) => setBoundaryMode(e.target.value as BoundaryMode)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:outline-2 focus:outline-teal-500"
              >
                <option value="clamp">Edge Clamp</option>
                <option value="zero">Zero Pad</option>
                <option value="reflect">Reflect</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label htmlFor="signed-mode-select" className="text-xs font-medium text-slate-500">
                Output Map
              </label>
              <select
                id="signed-mode-select"
                value={signedMode}
                onChange={(e) => setSignedMode(e.target.value as SignedOutputMode)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:outline-2 focus:outline-teal-500"
              >
                <option value="magnitude">|Σ| Magnitude</option>
                <option value="offset128">Signed (+128)</option>
                <option value="clamp">Clamp [0, 255]</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Main 2-Column Workspace: Left = Visual Comparison, Right = Kernel Editor & Filter Guide */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* Left: Visual Comparison + Kernel Preset Strip (7 cols on xl) */}
        <section
          aria-label="Original and processed image comparison"
          className="xl:col-span-7 rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                2D Spatial Convolution Comparison
              </h2>
              <p className="text-xs text-slate-500">
                Click or drag across either image to inspect any 3×3 neighborhood · ({cursor.x}, {cursor.y})
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Comparison layout">
              <button
                type="button"
                aria-pressed={compareLayout === 'sideBySide'}
                onClick={() => setCompareLayout('sideBySide')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  compareLayout === 'sideBySide'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Side-by-Side
              </button>
              <button
                type="button"
                aria-pressed={compareLayout === 'split'}
                onClick={() => setCompareLayout('split')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  compareLayout === 'split'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Split Slider
              </button>
            </div>
          </div>

          {/* Filter Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 border-y border-slate-100 py-2.5" role="group" aria-label="Convolution filter presets">
            {KERNEL_PRESETS.map((preset) => {
              const active = presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
            {presetId === 'custom' && (
              <span className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-amber-300 bg-amber-50 text-amber-800">
                Custom Kernel
              </span>
            )}
          </div>

          {/* Image Canvases */}
          {compareLayout === 'sideBySide' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">Original Image</span>
                  <span className="font-mono-tabular text-[11px] text-amber-600">
                    3×3 Input Window
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950 aspect-[4/3]">
                  <canvas
                    ref={origCanvasRef}
                    data-testid="image-original-canvas"
                    onPointerDown={handleCanvasPointer}
                    onPointerMove={handleCanvasPointer}
                    className="h-full w-full cursor-crosshair [image-rendering:pixelated]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">Processed Image</span>
                  <span className="font-mono-tabular text-[11px] text-teal-600">
                    y[{cursor.y}, {cursor.x}] = {patchDetail.outputPixelValue}
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950 aspect-[4/3]">
                  <canvas
                    ref={procCanvasRef}
                    data-testid="image-processed-canvas"
                    onPointerDown={handleCanvasPointer}
                    onPointerMove={handleCanvasPointer}
                    className="h-full w-full cursor-crosshair [image-rendering:pixelated]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950 aspect-[4/3] max-h-[420px] mx-auto">
                <canvas
                  ref={splitCanvasRef}
                  data-testid="image-split-canvas"
                  className="h-full w-full [image-rendering:pixelated]"
                />
                <span className="pointer-events-none absolute top-2.5 left-2.5 rounded bg-slate-950/80 px-2 py-0.5 text-[11px] font-medium text-white">
                  Original
                </span>
                <span className="pointer-events-none absolute top-2.5 right-2.5 rounded bg-teal-900/85 px-2 py-0.5 text-[11px] font-medium text-teal-100">
                  Processed
                </span>
              </div>
              <div className="flex items-center gap-3 px-1">
                <span className="text-xs font-medium text-slate-500">Original</span>
                <input
                  type="range"
                  min={0.05}
                  max={0.95}
                  step={0.01}
                  value={splitRatio}
                  onChange={(e) => setSplitRatio(parseFloat(e.target.value))}
                  aria-label="Original vs Processed split comparison slider"
                  className="sim-slider flex-1 [&::-webkit-slider-runnable-track]:bg-slate-200 [&::-webkit-slider-thumb]:bg-teal-600"
                />
                <span className="text-xs font-medium text-teal-700">Processed</span>
                <span className="font-mono-tabular w-10 text-right text-xs font-medium text-slate-600">
                  {Math.round(splitRatio * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Scan Animation Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleScan}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  isScanning
                    ? 'bg-teal-600 text-white hover:bg-teal-500'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {isScanning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span>{isScanning ? 'Pause Scan' : 'Animate Kernel Scan'}</span>
              </button>

              <button
                type="button"
                onClick={handleStepScan}
                aria-label="Step kernel one pixel"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <SkipForward className="h-3.5 w-3.5" />
                <span>Step</span>
              </button>

              <button
                type="button"
                onClick={handleResetScan}
                aria-label="Reset kernel scan"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Speed</span>
              {[4, 12, 36].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  aria-pressed={scanSpeed === spd}
                  onClick={() => setScanSpeed(spd)}
                  className={`font-mono-tabular px-2 py-0.5 rounded border text-xs font-medium cursor-pointer ${
                    scanSpeed === spd
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {spd === 4 ? '1×' : spd === 12 ? '3×' : '9×'}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right: Interactive 3x3 Kernel Editor + Educational Explanation (5 cols on xl) */}
        <section
          aria-label="Interactive 3x3 kernel editor and filter guide"
          className="xl:col-span-5 rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Interactive 3×3 Kernel Editor
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleResetKernel}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Kernel</span>
              </button>

              <button
                type="button"
                onClick={handleApplyKernel}
                data-testid="apply-kernel-btn"
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  hasUnappliedEdits
                    ? 'bg-teal-600 text-white hover:bg-teal-500 shadow-xs'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                Apply Kernel
              </button>
            </div>
          </div>

          {/* 3x3 Editable Grid + Divisor */}
          <div className="flex flex-wrap items-center justify-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono-tabular text-xs font-semibold text-slate-500">
                1 /
              </span>
              <input
                type="number"
                step="1"
                value={draftDivisor}
                aria-label="Kernel divisor"
                onChange={(e) => setDraftDivisor(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyKernel()}
                className="font-mono-tabular w-14 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-center text-sm font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label="3 by 3 kernel weights"
              className="grid grid-cols-3 gap-2 border-x-2 border-slate-400 px-3 py-1 rounded-sm"
            >
              {draftWeights.map((val, idx) => (
                <input
                  key={idx}
                  type="number"
                  step="0.5"
                  value={val}
                  aria-label={`Kernel cell row ${Math.floor(idx / 3) + 1} col ${(idx % 3) + 1}`}
                  onChange={(e) => {
                    const next = [...draftWeights];
                    next[idx] = e.target.value;
                    setDraftWeights(next);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyKernel()}
                  className="font-mono-tabular w-16 rounded-md border border-slate-300 bg-white px-1.5 py-1.5 text-center text-sm font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              ))}
            </div>
          </div>

          {hasUnappliedEdits && (
            <div className="text-center text-xs font-medium text-amber-700">
              Kernel values modified — click <strong>Apply Kernel</strong> or press Enter to update image.
            </div>
          )}

          {/* Educational Explanation Box */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">
                {activePresetInfo ? activePresetInfo.label : 'Custom Kernel Filter'}
              </span>
              <span className="font-mono-tabular text-[11px] font-medium text-slate-500">
                Σ Weights = {(activeWeights.reduce((a, b) => a + b, 0) / activeDivisor).toFixed(2)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-700">
              {activePresetInfo
                ? activePresetInfo.summary
                : 'A custom 3×3 filter replaces each pixel with a weighted linear combination of its 3×3 neighborhood divided by the normalization factor.'}
            </p>
            <p className="text-xs leading-relaxed text-slate-500">
              {activePresetInfo
                ? activePresetInfo.mathInsight
                : 'Kernels whose normalized sum equals 1 preserve average brightness; zero-sum kernels isolate edges and spatial gradients.'}
            </p>
          </div>
        </section>
      </div>

      {/* Bottom Educational 6-Step 3x3 Convolution Walkthrough */}
      <section
        aria-label="Step-by-step 3x3 convolution walkthrough"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Step-by-Step 2D Convolution at Pixel ({patchDetail.centerX}, {patchDetail.centerY})
            </h2>
            <p className="text-xs text-slate-500">
              Visualizing element-by-element multiplication, summation, and output pixel calculation
            </p>
          </div>

          {channelMode === 'rgb' && (
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Inspected channel for walkthrough">
              {(['luma', 'r', 'g', 'b'] as InspectChannel[]).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  aria-pressed={inspectChannel === ch}
                  onClick={() => setInspectChannel(ch)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    inspectChannel === ch
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {ch === 'luma' ? 'Luma' : ch.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 5 Visual Blocks: 3x3 Input Patch x 3x3 Kernel = 3x3 Products -> Sum -> Output Pixel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* 1. Highlighted 3x3 Image Patch */}
          <div className="lg:col-span-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
            <div className="text-xs font-semibold text-amber-900">
              1. 3×3 Image Patch
            </div>
            <div className="grid grid-cols-3 gap-1.5" data-testid="walkthrough-patch-grid">
              {patchDetail.patchValues.map((val, i) => {
                const [r, g, b] = patchDetail.patchColors[i];
                const isCenter = i === 4;
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                const textCol = lum > 135 ? 'text-slate-950' : 'text-white';
                return (
                  <div
                    key={i}
                    className={`font-mono-tabular flex h-10 items-center justify-center rounded border text-xs font-semibold ${textCol} ${
                      isCenter ? 'ring-2 ring-sky-500 border-white' : 'border-slate-300/60'
                    }`}
                    style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
                    title={`RGB(${r}, ${g}, ${b})`}
                  >
                    {val}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="hidden lg:flex lg:col-span-1 justify-center text-lg font-bold text-slate-400">
            ×
          </div>

          {/* 2. 3x3 Kernel Weights */}
          <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="text-xs font-semibold text-slate-800">
              2. Kernel {activeDivisor !== 1 ? `(÷ ${activeDivisor})` : ''}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {patchDetail.kernelWeights.map((w, i) => (
                <div
                  key={i}
                  className={`font-mono-tabular flex h-10 items-center justify-center rounded border text-xs font-semibold ${
                    w > 0
                      ? 'border-teal-200 bg-teal-50 text-teal-800'
                      : w < 0
                        ? 'border-rose-200 bg-rose-50 text-rose-800'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  {w}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:flex lg:col-span-1 justify-center text-lg font-bold text-slate-400">
            =
          </div>

          {/* 3. Element-by-Element Products */}
          <div className="lg:col-span-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
            <div className="text-xs font-semibold text-blue-900">
              3. Element-wise Products
            </div>
            <div className="grid grid-cols-3 gap-1.5" data-testid="walkthrough-products-grid">
              {patchDetail.products.map((prod, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center justify-center rounded border border-blue-200/80 bg-white py-1 text-center"
                >
                  <span className="font-mono-tabular text-[10px] text-slate-400">
                    {patchDetail.patchValues[i]}×{patchDetail.kernelWeights[i]}
                  </span>
                  <span className="font-mono-tabular text-xs font-semibold text-slate-900">
                    {Number.isInteger(prod) ? prod : prod.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 4 & 5. Summation & Resulting Output Pixel */}
          <div className="lg:col-span-2 rounded-lg border border-teal-200 bg-teal-50/50 p-3 space-y-2.5">
            <div className="text-xs font-semibold text-teal-900">
              4. Sum → 5. Output
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Raw Σ</span>
                <span className="font-mono-tabular font-semibold text-slate-900" data-testid="walkthrough-raw-sum">
                  {Number.isInteger(patchDetail.rawSum) ? patchDetail.rawSum : patchDetail.rawSum.toFixed(2)}
                </span>
              </div>
              {patchDetail.divisor !== 1 && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>÷ {patchDetail.divisor}</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {patchDetail.normalizedValue.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 rounded-md border border-teal-300 bg-white p-2">
              <div
                className="h-9 w-9 shrink-0 rounded border border-slate-300"
                style={{
                  backgroundColor: `rgb(${patchDetail.outputRgb[0]}, ${patchDetail.outputRgb[1]}, ${patchDetail.outputRgb[2]})`,
                }}
              />
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500">Output Pixel</div>
                <div className="font-mono-tabular text-sm font-bold text-teal-700" data-testid="walkthrough-output-val">
                  {patchDetail.outputPixelValue}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Full Summation Equation Line */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono-tabular text-xs text-slate-700">
          <span className="font-semibold text-slate-500 mr-2">Σ =</span>
          {patchDetail.products.map((p, idx) => (
            <span key={idx}>
              {idx > 0 && (p >= 0 ? ' + ' : ' − ')}
              {idx === 0 && p < 0 ? '−' : ''}
              {Math.abs(Number.isInteger(p) ? p : Number(p.toFixed(1)))}
            </span>
          ))}
          <span className="font-semibold text-slate-900">
            {' = '}
            {Number.isInteger(patchDetail.rawSum) ? patchDetail.rawSum : patchDetail.rawSum.toFixed(2)}
          </span>
          {patchDetail.divisor !== 1 && (
            <span className="text-slate-600">
              {' → ÷ '}
              {patchDetail.divisor}
              {' = '}
              {patchDetail.normalizedValue.toFixed(2)}
            </span>
          )}
          <span className="ml-2 font-semibold text-teal-700">
            → Output ({signedMode === 'magnitude' ? '|Σ|' : signedMode === 'offset128' ? '128+Σ' : 'clamp'}) = {patchDetail.outputPixelValue}
          </span>
        </div>
      </section>
    </div>
  );
};
