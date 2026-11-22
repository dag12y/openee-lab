import React, { useEffect, useRef } from 'react';
import {
  CONTINUOUS_DOMAIN_MAX,
  CONTINUOUS_DOMAIN_MIN,
  ContinuousCurveData,
  DISCRETE_DOMAIN_MAX,
  DISCRETE_DOMAIN_MIN,
  DiscreteStemData,
  ImpulseMarker,
} from '../math/convolution';

export interface PlotSeriesContinuous {
  data: ContinuousCurveData;
  color: string;
  fillColor?: string;
  lineWidth?: number;
  dashed?: boolean;
}

interface SignalPlot2DProps {
  ariaLabel: string;
  testId: string;
  heightClass?: string;
  domainType: 'continuous' | 'discrete';
  xLabel: string;
  // Continuous series
  continuousOverlay?: {
    xCurve: ContinuousCurveData;
    hShiftedCurve: ContinuousCurveData;
    overlapCurve: ContinuousCurveData;
    cursorT: number;
  };
  continuousSingle?: {
    curve: ContinuousCurveData;
    color: string;
    fillColor?: string;
  };
  continuousOutput?: {
    curve: ContinuousCurveData;
    cursorT: number;
  };
  // Discrete series
  discreteOverlay?: {
    xStems: DiscreteStemData;
    hShiftedStems: DiscreteStemData;
    overlapStems: DiscreteStemData;
    cursorN: number;
  };
  discreteSingle?: {
    stems: DiscreteStemData;
    color: string;
  };
  discreteOutput?: {
    stems: DiscreteStemData;
    cursorN: number;
  };
  // Interactive horizontal scrubbing
  onScrub?: (domainVal: number) => void;
}

const PAD = { top: 18, right: 30, bottom: 28, left: 42 };

function computeContinuousYRange(curves: ContinuousCurveData[]): [number, number] {
  let minVal = -0.25;
  let maxVal = 1.25;
  for (const c of curves) {
    for (let i = 0; i < c.values.length; i++) {
      const v = c.values[i];
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
    for (const imp of c.impulses) {
      if (imp.weight < minVal) minVal = imp.weight;
      if (imp.weight > maxVal) maxVal = imp.weight;
    }
  }
  const span = Math.max(1.2, maxVal - minVal);
  const pad = span * 0.16;
  return [Math.min(-0.2, minVal - pad), Math.max(0.5, maxVal + pad)];
}

function computeDiscreteYRange(stemsList: DiscreteStemData[]): [number, number] {
  let minVal = -0.25;
  let maxVal = 1.25;
  for (const s of stemsList) {
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i];
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }
  const span = Math.max(1.2, maxVal - minVal);
  const pad = span * 0.16;
  return [Math.min(-0.2, minVal - pad), Math.max(0.5, maxVal + pad)];
}

function drawImpulseMarkers(
  ctx: CanvasRenderingContext2D,
  impulses: ImpulseMarker[],
  toX: (u: number) => number,
  toY: (y: number) => number,
  yZero: number,
  color: string,
  minX: number,
  maxX: number,
  labelPrefix = 'δ',
) {
  for (const imp of impulses) {
    if (imp.position < minX || imp.position > maxX) continue;
    const px = toX(imp.position);
    const py = toY(imp.weight);
    const dir = imp.weight >= 0 ? -1 : 1; // screen Y is inverted

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;

    ctx.beginPath();
    ctx.moveTo(px, yZero);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Arrowhead
    const headLen = 8;
    const headWidth = 5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - headWidth, py - dir * headLen);
    ctx.lineTo(px + headWidth, py - dir * headLen);
    ctx.closePath();
    ctx.fill();

    // Weight label
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = imp.weight >= 0 ? 'bottom' : 'top';
    const textY = imp.weight >= 0 ? Math.max(14, py - 4) : py + 4;
    ctx.fillText(`${imp.weight.toFixed(2)} ${labelPrefix}`, px + 6, textY);
    ctx.restore();
  }
}

export const SignalPlot2D: React.FC<SignalPlot2DProps> = ({
  ariaLabel,
  testId,
  heightClass = 'h-48',
  domainType,
  xLabel,
  continuousOverlay,
  continuousSingle,
  continuousOutput,
  discreteOverlay,
  discreteSingle,
  discreteOutput,
  onScrub,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const minDomain =
    domainType === 'continuous' ? CONTINUOUS_DOMAIN_MIN : DISCRETE_DOMAIN_MIN;
  const maxDomain =
    domainType === 'continuous' ? CONTINUOUS_DOMAIN_MAX : DISCRETE_DOMAIN_MAX;

  const draw = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear crisp background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    const plotW = Math.max(10, width - PAD.left - PAD.right);
    const plotH = Math.max(10, height - PAD.top - PAD.bottom);

    // Compute Y range
    let yMin = -1;
    let yMax = 2;
    if (continuousOverlay) {
      [yMin, yMax] = computeContinuousYRange([
        continuousOverlay.xCurve,
        continuousOverlay.hShiftedCurve,
        continuousOverlay.overlapCurve,
      ]);
    } else if (continuousSingle) {
      [yMin, yMax] = computeContinuousYRange([continuousSingle.curve]);
    } else if (continuousOutput) {
      [yMin, yMax] = computeContinuousYRange([continuousOutput.curve]);
    } else if (discreteOverlay) {
      [yMin, yMax] = computeDiscreteYRange([
        discreteOverlay.xStems,
        discreteOverlay.hShiftedStems,
        discreteOverlay.overlapStems,
      ]);
    } else if (discreteSingle) {
      [yMin, yMax] = computeDiscreteYRange([discreteSingle.stems]);
    } else if (discreteOutput) {
      [yMin, yMax] = computeDiscreteYRange([discreteOutput.stems]);
    }

    const toX = (u: number) =>
      PAD.left + ((u - minDomain) / (maxDomain - minDomain)) * plotW;
    const toY = (v: number) =>
      PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

    const yZero = toY(0);

    // Grid lines (vertical)
    ctx.lineWidth = 1;
    const xStep = domainType === 'continuous' ? 2 : 3;
    ctx.font = '400 10.5px "IBM Plex Mono", monospace';
    for (let u = minDomain; u <= maxDomain; u += xStep) {
      const px = Math.round(toX(u)) + 0.5;
      ctx.strokeStyle = u === 0 ? '#CBD5E1' : '#F1F5F9';
      ctx.beginPath();
      ctx.moveTo(px, PAD.top);
      ctx.lineTo(px, PAD.top + plotH);
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(String(u), px, PAD.top + plotH + 6);
    }

    // Horizontal grid lines (nice step)
    const rawStep = (yMax - yMin) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const niceStep =
      (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const startTick = Math.ceil(yMin / niceStep) * niceStep;

    for (let v = startTick; v <= yMax + 1e-6; v += niceStep) {
      const py = Math.round(toY(v)) + 0.5;
      const isZero = Math.abs(v) < 1e-6;
      ctx.strokeStyle = isZero ? '#94A3B8' : '#F1F5F9';
      ctx.beginPath();
      ctx.moveTo(PAD.left, py);
      ctx.lineTo(PAD.left + plotW, py);
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const label = Math.abs(v) < 1e-6 ? '0' : v.toFixed(niceStep < 1 ? 1 : 0);
      ctx.fillText(label, PAD.left - 6, py);
    }

    // Ensure y=0 baseline is drawn clearly
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, Math.round(yZero) + 0.5);
    ctx.lineTo(PAD.left + plotW, Math.round(yZero) + 0.5);
    ctx.stroke();

    // Axis label cleanly positioned at the right end of the y=0 baseline
    ctx.fillStyle = '#475569';
    ctx.font = '600 11.5px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(xLabel, PAD.left + plotW + 8, yZero);

    // Clip drawing inside plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, PAD.top - 4, plotW, plotH + 8);
    ctx.clip();

    // --- CONTINUOUS RENDERING ---
    const drawContinuousCurve = (
      curve: ContinuousCurveData,
      strokeColor: string,
      fillColor?: string,
      lineWidth = 2.2,
      dashed = false,
      maxTClip?: number,
    ) => {
      const { ts, values, impulses } = curve;
      if (ts.length > 0) {
        let endIdx = ts.length - 1;
        if (maxTClip !== undefined) {
          endIdx = -1;
          for (let i = 0; i < ts.length; i++) {
            if (ts[i] <= maxTClip + 1e-6) endIdx = i;
          }
        }

        if (endIdx >= 1) {
          if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            ctx.moveTo(toX(ts[0]), yZero);
            for (let i = 0; i <= endIdx; i++) {
              ctx.lineTo(toX(ts[i]), toY(values[i]));
            }
            if (maxTClip !== undefined && endIdx < ts.length - 1) {
              const t0 = ts[endIdx];
              const t1 = ts[endIdx + 1];
              const alpha = (maxTClip - t0) / Math.max(1e-6, t1 - t0);
              const vInterp = values[endIdx] + alpha * (values[endIdx + 1] - values[endIdx]);
              ctx.lineTo(toX(maxTClip), toY(vInterp));
              ctx.lineTo(toX(maxTClip), yZero);
            } else {
              ctx.lineTo(toX(ts[endIdx]), yZero);
            }
            ctx.closePath();
            ctx.fill();
          }

          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = lineWidth;
          ctx.setLineDash(dashed ? [5, 4] : []);
          ctx.beginPath();
          ctx.moveTo(toX(ts[0]), toY(values[0]));
          for (let i = 1; i <= endIdx; i++) {
            ctx.lineTo(toX(ts[i]), toY(values[i]));
          }
          if (maxTClip !== undefined && endIdx < ts.length - 1) {
            const t0 = ts[endIdx];
            const t1 = ts[endIdx + 1];
            const alpha = (maxTClip - t0) / Math.max(1e-6, t1 - t0);
            const vInterp = values[endIdx] + alpha * (values[endIdx + 1] - values[endIdx]);
            ctx.lineTo(toX(maxTClip), toY(vInterp));
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      if (impulses.length > 0) {
        const filtered =
          maxTClip !== undefined
            ? impulses.filter((imp) => imp.position <= maxTClip + 0.05)
            : impulses;
        drawImpulseMarkers(
          ctx,
          filtered,
          toX,
          toY,
          yZero,
          strokeColor,
          minDomain,
          maxDomain,
        );
      }
    };

    if (continuousOverlay) {
      const { xCurve, hShiftedCurve, overlapCurve, cursorT } = continuousOverlay;
      // 1. Shaded overlap product first
      drawContinuousCurve(overlapCurve, '#0D9488', 'rgba(13, 148, 136, 0.24)', 1.5);
      // 2. x(tau)
      drawContinuousCurve(xCurve, '#2563EB', 'rgba(37, 99, 235, 0.08)', 2.2);
      // 3. Flipped & shifted h(t - tau)
      drawContinuousCurve(hShiftedCurve, '#D97706', undefined, 2.0, true);

      // Cursor guide at t
      const cx = toX(cursorT);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, PAD.top);
      ctx.lineTo(cx, PAD.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (continuousSingle) {
      drawContinuousCurve(
        continuousSingle.curve,
        continuousSingle.color,
        continuousSingle.fillColor,
        2.3,
      );
    } else if (continuousOutput) {
      const { curve, cursorT } = continuousOutput;
      // Full-span subtle preview curve
      drawContinuousCurve(
        curve,
        'rgba(13, 148, 136, 0.30)',
        undefined,
        1.6,
        true,
      );
      // Swept curve up to cursorT
      drawContinuousCurve(
        curve,
        '#0D9488',
        'rgba(13, 148, 136, 0.16)',
        2.6,
        false,
        cursorT,
      );

      // Evaluation cursor line and active dot
      const cx = toX(cursorT);
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(cx, PAD.top);
      ctx.lineTo(cx, PAD.top + plotH);
      ctx.stroke();

      // Interpolate y(cursorT) from sampled curve
      let yVal = 0;
      const { ts, values } = curve;
      if (ts.length >= 2) {
        const clamped = Math.max(ts[0], Math.min(ts[ts.length - 1], cursorT));
        const ratio = (clamped - ts[0]) / (ts[ts.length - 1] - ts[0]);
        const fIdx = ratio * (ts.length - 1);
        const i0 = Math.floor(fIdx);
        const i1 = Math.min(ts.length - 1, i0 + 1);
        const frac = fIdx - i0;
        yVal = values[i0] + frac * (values[i1] - values[i0]);
      }

      const cy = toY(yVal);
      ctx.fillStyle = '#0D9488';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // --- DISCRETE STEM RENDERING ---
    const drawDiscreteStems = (
      stems: DiscreteStemData,
      color: string,
      options?: {
        hollow?: boolean;
        xOffsetPx?: number;
        radius?: number;
        lineWidth?: number;
        barFill?: string;
        dimAfterN?: number;
      },
    ) => {
      const {
        hollow = false,
        xOffsetPx = 0,
        radius = 4,
        lineWidth = 2,
        barFill,
        dimAfterN,
      } = options || {};

      for (let i = 0; i < stems.ks.length; i++) {
        const k = stems.ks[i];
        const v = stems.values[i];
        const px = toX(k) + xOffsetPx;
        const py = toY(v);
        const isDimmed = dimAfterN !== undefined && k > dimAfterN;
        const activeColor = isDimmed ? 'rgba(13, 148, 136, 0.26)' : color;

        if (barFill && Math.abs(v) > 1e-6) {
          ctx.fillStyle = barFill;
          const barW = 8;
          const topY = Math.min(py, yZero);
          const barH = Math.abs(py - yZero);
          ctx.fillRect(px - barW / 2, topY, barW, barH);
        }

        if (Math.abs(v) > 1e-6 || !barFill) {
          ctx.strokeStyle = activeColor;
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          ctx.moveTo(px, yZero);
          ctx.lineTo(px, py);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          if (hollow) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = activeColor;
            ctx.lineWidth = 2;
            ctx.stroke();
          } else {
            ctx.fillStyle = activeColor;
            ctx.fill();
          }
        }
      }
    };

    if (discreteOverlay) {
      const { xStems, hShiftedStems, overlapStems, cursorN } = discreteOverlay;
      // 1. Overlap bars behind stems
      drawDiscreteStems(overlapStems, '#0D9488', {
        barFill: 'rgba(13, 148, 136, 0.25)',
        radius: 2.5,
        lineWidth: 1.5,
      });
      // 2. x[k] blue solid stems
      drawDiscreteStems(xStems, '#2563EB', { xOffsetPx: -2.5, radius: 4 });
      // 3. h[n-k] amber hollow ring stems slightly offset for legibility
      drawDiscreteStems(hShiftedStems, '#D97706', {
        hollow: true,
        xOffsetPx: 2.5,
        radius: 4,
      });

      // Vertical marker at n
      const cx = toX(cursorN);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, PAD.top);
      ctx.lineTo(cx, PAD.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (discreteSingle) {
      drawDiscreteStems(discreteSingle.stems, discreteSingle.color, {
        radius: 4,
      });
    } else if (discreteOutput) {
      const { stems, cursorN } = discreteOutput;
      drawDiscreteStems(stems, '#0D9488', {
        radius: 4.5,
        lineWidth: 2.2,
        dimAfterN: cursorN,
      });

      const cx = toX(cursorN);
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(cx, PAD.top);
      ctx.lineTo(cx, PAD.top + plotH);
      ctx.stroke();

      const idx = stems.ks.indexOf(Math.round(cursorN));
      if (idx !== -1) {
        const cy = toY(stems.values[idx]);
        ctx.fillStyle = '#0D9488';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore(); // end clip
    ctx.restore(); // end dpr scale
  };

  useEffect(() => {
    draw();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      draw();
    });
    ro.observe(container);
    return () => ro.disconnect();
  });

  const scrubFromPointer = (clientX: number) => {
    if (!onScrub || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const plotW = Math.max(10, rect.width - PAD.left - PAD.right);
    const ratio = (clientX - rect.left - PAD.left) / plotW;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const val = minDomain + clampedRatio * (maxDomain - minDomain);
    onScrub(domainType === 'discrete' ? Math.round(val) : Number(val.toFixed(2)));
  };

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      className={`relative w-full ${heightClass} select-none ${
        onScrub ? 'cursor-ew-resize' : ''
      }`}
      onPointerDown={(e) => {
        if (!onScrub) return;
        draggingRef.current = true;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        scrubFromPointer(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current || !onScrub) return;
        scrubFromPointer(e.clientX);
      }}
      onPointerUp={(e) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      }}
    >
      <canvas
        ref={canvasRef}
        role={onScrub ? 'slider' : 'img'}
        aria-label={ariaLabel}
        aria-valuemin={onScrub ? minDomain : undefined}
        aria-valuemax={onScrub ? maxDomain : undefined}
        aria-valuenow={
          onScrub
            ? continuousOverlay?.cursorT ??
              continuousOutput?.cursorT ??
              discreteOverlay?.cursorN ??
              discreteOutput?.cursorN
            : undefined
        }
        className="block h-full w-full rounded-md"
      />
    </div>
  );
};
