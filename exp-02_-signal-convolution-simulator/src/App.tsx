import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import {
  CONTINUOUS_DOMAIN_MAX,
  CONTINUOUS_DOMAIN_MIN,
  ContinuousSignalParams,
  DISCRETE_DOMAIN_MAX,
  DISCRETE_DOMAIN_MIN,
  DiscreteSignalParams,
  ViewMode,
  defaultContinuousH,
  defaultContinuousX,
  defaultDiscreteH,
  defaultDiscreteX,
  evalContinuousConvolutionAt,
  evalDiscreteConvolutionAt,
  sampleContinuousOutput,
  sampleContinuousOverlap,
  sampleContinuousSignal,
  sampleDiscreteOutput,
  sampleDiscreteOverlap,
  sampleDiscreteSignal,
} from './math/convolution';
import { TopToolbar } from './components/TopToolbar';
import { SignalPlot2D } from './components/SignalPlot2D';
import {
  ContinuousSignalControls,
  DiscreteSignalControls,
} from './components/SignalControls';
import { Convolution3DView } from './components/Convolution3DView';
import { ImageConvolutionView } from './components/ImageConvolutionView';

type ExpandedCard = 'x' | 'h' | 'y' | null;

export default function App() {
  const [mode, setMode] = useState<ViewMode>('continuous');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [isViewExpanded, setIsViewExpanded] = useState(false);
  const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null);

  // Continuous / 3D shared parameters
  const [contX, setContX] = useState<ContinuousSignalParams>(() => defaultContinuousX());
  const [contH, setContH] = useState<ContinuousSignalParams>(() => defaultContinuousH());
  const [tValue, setTValue] = useState<number>(0);

  // Discrete parameters
  const [discX, setDiscX] = useState<DiscreteSignalParams>(() => defaultDiscreteX());
  const [discH, setDiscH] = useState<DiscreteSignalParams>(() => defaultDiscreteH());
  const [nValue, setNValue] = useState<number>(0);

  useEffect(() => {
    if (!isViewExpanded && !expandedCard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsViewExpanded(false);
        setExpandedCard(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isViewExpanded, expandedCard]);

  // Playback loop refs
  const discreteAccumRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying || mode === 'image2d') return;
    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      if (mode === 'discrete') {
        discreteAccumRef.current += dt * 2.5 * speed;
        if (discreteAccumRef.current >= 1) {
          const steps = Math.floor(discreteAccumRef.current);
          discreteAccumRef.current -= steps;
          setNValue((prev) => {
            const next = prev + steps;
            return next > DISCRETE_DOMAIN_MAX ? DISCRETE_DOMAIN_MIN : next;
          });
        }
      } else {
        setTValue((prev) => {
          const next = prev + dt * 1.4 * speed;
          if (next > CONTINUOUS_DOMAIN_MAX) return CONTINUOUS_DOMAIN_MIN;
          return Number(next.toFixed(3));
        });
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, mode, speed]);

  const handleScrubT = useCallback((nextT: number) => {
    setTValue(Math.max(CONTINUOUS_DOMAIN_MIN, Math.min(CONTINUOUS_DOMAIN_MAX, nextT)));
  }, []);

  const handleScrubN = useCallback((nextN: number) => {
    setNValue(
      Math.max(DISCRETE_DOMAIN_MIN, Math.min(DISCRETE_DOMAIN_MAX, Math.round(nextN))),
    );
  }, []);

  const handleResetCursor = useCallback(() => {
    setIsPlaying(false);
    discreteAccumRef.current = 0;
    if (mode === 'discrete') {
      setNValue(0);
    } else {
      setTValue(0);
    }
  }, [mode]);

  // Continuous memoized sampled curves
  const contXCurve = useMemo(() => sampleContinuousSignal(contX), [contX]);
  const contHCurve = useMemo(() => sampleContinuousSignal(contH), [contH]);
  const contHShiftedCurve = useMemo(
    () => sampleContinuousSignal(contH, 361, CONTINUOUS_DOMAIN_MIN, CONTINUOUS_DOMAIN_MAX, tValue),
    [contH, tValue],
  );
  const contOverlapCurve = useMemo(
    () => sampleContinuousOverlap(tValue, contX, contH),
    [tValue, contX, contH],
  );
  const contOutputCurve = useMemo(
    () => sampleContinuousOutput(contX, contH),
    [contX, contH],
  );
  const contCurrentY = useMemo(
    () => evalContinuousConvolutionAt(tValue, contX, contH),
    [tValue, contX, contH],
  );

  // Discrete memoized sampled stems
  const discXStems = useMemo(() => sampleDiscreteSignal(discX), [discX]);
  const discHStems = useMemo(() => sampleDiscreteSignal(discH), [discH]);
  const discHShiftedStems = useMemo(
    () => sampleDiscreteSignal(discH, DISCRETE_DOMAIN_MIN, DISCRETE_DOMAIN_MAX, nValue),
    [discH, nValue],
  );
  const discOverlapStems = useMemo(
    () => sampleDiscreteOverlap(nValue, discX, discH),
    [nValue, discX, discH],
  );
  const discOutputStems = useMemo(
    () => sampleDiscreteOutput(discX, discH),
    [discX, discH],
  );
  const discCurrentY = useMemo(
    () => evalDiscreteConvolutionAt(nValue, discX, discH),
    [nValue, discX, discH],
  );

  const isBothContImpulse = contX.preset === 'impulse' && contH.preset === 'impulse';
  const contReadoutText = isBothContImpulse && contCurrentY.impulse
    ? `y(t) = ${contCurrentY.impulse.weight.toFixed(2)} δ(t ${
        contCurrentY.impulse.position >= 0 ? '−' : '+'
      } ${Math.abs(contCurrentY.impulse.position).toFixed(2)})`
    : `y(${tValue.toFixed(2)}) = ${contCurrentY.value.toFixed(3)}`;

  const discReadoutText = `y[${nValue}] = ${discCurrentY.toFixed(3)}`;

  return (
    <div
      data-mode={mode}
      className={`flex min-h-screen flex-col ${
        mode === 'space3d' ? 'h-screen overflow-hidden bg-[#04070E]' : 'bg-[#F4F6F9]'
      }`}
    >
      {!isViewExpanded && !expandedCard && (
        <TopToolbar
          mode={mode}
          onModeChange={(nextMode) => {
            setExpandedCard(null);
            setMode(nextMode);
          }}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onResetCursor={handleResetCursor}
          tValue={tValue}
          nValue={nValue}
          onScrubT={handleScrubT}
          onScrubN={handleScrubN}
          speed={speed}
          onSpeedChange={setSpeed}
          isExpanded={isViewExpanded}
          onToggleExpand={() => setIsViewExpanded((v) => !v)}
        />
      )}

      {mode === 'space3d' ? (
        <main className="relative flex-1 min-h-0">
          <Convolution3DView
            xParams={contX}
            hParams={contH}
            tValue={tValue}
            onChangeX={setContX}
            onChangeH={setContH}
            isExpanded={isViewExpanded}
            onToggleExpand={() => setIsViewExpanded((v) => !v)}
          />
        </main>
      ) : (
        <main
          className={`mx-auto w-full flex-1 px-4 py-4 ${
            isViewExpanded || expandedCard ? 'max-w-none flex flex-col' : 'max-w-[1520px]'
          }`}
        >
          {isViewExpanded && !expandedCard && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-xs">
              <span className="text-xs font-semibold text-slate-700">
                {mode === 'continuous'
                  ? 'Continuous Convolution — Expanded View'
                  : mode === 'discrete'
                    ? 'Discrete Convolution — Expanded View'
                    : 'Image Processing Example — Expanded View'}
              </span>
              <button
                type="button"
                onClick={() => setIsViewExpanded(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Collapse</span>
              </button>
            </div>
          )}

          {mode === 'image2d' ? (
            <ImageConvolutionView />
          ) : (

          <div className={expandedCard ? 'flex-1 flex flex-col' : 'space-y-4'}>
            {/* Top 2-Column Row: x & h Cards */}
            {(!expandedCard || expandedCard === 'x' || expandedCard === 'h') && (
              <div
                className={
                  expandedCard
                    ? 'flex-1 flex flex-col'
                    : 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch'
                }
              >
                {/* Top-Left Card (x + flipped shifted h + overlap) */}
                {(!expandedCard || expandedCard === 'x') && (
                  <section
                    aria-label="Input signal and flipped-shifted kernel overlap"
                    className={`flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs ${
                      expandedCard === 'x' ? 'flex-1' : ''
                    }`}
                  >
                    <div className="space-y-2.5 flex-1 flex flex-col">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-baseline gap-3">
                          <h2 className="text-sm font-semibold text-slate-900">
                            {mode === 'continuous'
                              ? 'Input x(τ) & Shifted h(t − τ)'
                              : 'Input x[k] & Shifted h[n − k]'}
                          </h2>
                          <div className="flex items-center gap-2.5 text-xs text-slate-500">
                            <span className="font-medium text-blue-600">
                              {mode === 'continuous' ? 'x(τ)' : 'x[k]'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-amber-600">
                              {mode === 'continuous' ? 'h(t − τ)' : 'h[n − k]'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-teal-600">Overlap</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              mode === 'continuous'
                                ? setContX(defaultContinuousX())
                                : setDiscX(defaultDiscreteX())
                            }
                            aria-label={mode === 'continuous' ? 'Reset x(τ)' : 'Reset x[k]'}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reset</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setExpandedCard((c) => (c === 'x' ? null : 'x'))}
                            aria-pressed={expandedCard === 'x'}
                            aria-label={expandedCard === 'x' ? 'Collapse x plot' : 'Expand x plot'}
                            title={expandedCard === 'x' ? 'Collapse (Esc)' : 'Expand plot'}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                          >
                            {expandedCard === 'x' ? (
                              <Minimize2 className="h-3 w-3" />
                            ) : (
                              <Maximize2 className="h-3 w-3" />
                            )}
                            <span>{expandedCard === 'x' ? 'Collapse' : 'Expand'}</span>
                          </button>
                        </div>
                      </div>

                      <SignalPlot2D
                        testId="plot-x-overlap"
                        ariaLabel={
                          mode === 'continuous'
                            ? 'Interactive overlap plot of x(tau) and h(t minus tau); drag horizontally to scrub t'
                            : 'Interactive overlap stem plot of x[k] and h[n minus k]; drag horizontally to scrub n'
                        }
                        domainType={mode === 'continuous' ? 'continuous' : 'discrete'}
                        xLabel={mode === 'continuous' ? 'τ' : 'k'}
                        heightClass={expandedCard === 'x' ? 'flex-1 min-h-[380px]' : isViewExpanded ? 'h-64' : 'h-48 sm:h-52'}
                        continuousOverlay={
                          mode === 'continuous'
                            ? {
                                xCurve: contXCurve,
                                hShiftedCurve: contHShiftedCurve,
                                overlapCurve: contOverlapCurve,
                                cursorT: tValue,
                              }
                            : undefined
                        }
                        discreteOverlay={
                          mode === 'discrete'
                            ? {
                                xStems: discXStems,
                                hShiftedStems: discHShiftedStems,
                                overlapStems: discOverlapStems,
                                cursorN: nValue,
                              }
                            : undefined
                        }
                        onScrub={mode === 'continuous' ? handleScrubT : handleScrubN}
                      />
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                      {mode === 'continuous' ? (
                        <ContinuousSignalControls
                          kind="x"
                          params={contX}
                          onChange={setContX}
                        />
                      ) : (
                        <DiscreteSignalControls
                          kind="x"
                          params={discX}
                          onChange={setDiscX}
                        />
                      )}
                    </div>
                  </section>
                )}

                {/* Top-Right Card (h) */}
                {(!expandedCard || expandedCard === 'h') && (
                  <section
                    aria-label="Impulse response signal"
                    className={`flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs ${
                      expandedCard === 'h' ? 'flex-1' : ''
                    }`}
                  >
                    <div className="space-y-2.5 flex-1 flex flex-col">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-baseline gap-3">
                          <h2 className="text-sm font-semibold text-slate-900">
                            {mode === 'continuous'
                              ? 'Impulse Response h(τ)'
                              : 'Impulse Response h[k]'}
                          </h2>
                          <span className="text-xs font-medium text-amber-600">
                            {mode === 'continuous' ? 'Kernel h(τ)' : 'Kernel h[k]'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              mode === 'continuous'
                                ? setContH(defaultContinuousH())
                                : setDiscH(defaultDiscreteH())
                            }
                            aria-label={mode === 'continuous' ? 'Reset h(τ)' : 'Reset h[k]'}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reset</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setExpandedCard((c) => (c === 'h' ? null : 'h'))}
                            aria-pressed={expandedCard === 'h'}
                            aria-label={expandedCard === 'h' ? 'Collapse h plot' : 'Expand h plot'}
                            title={expandedCard === 'h' ? 'Collapse (Esc)' : 'Expand plot'}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                          >
                            {expandedCard === 'h' ? (
                              <Minimize2 className="h-3 w-3" />
                            ) : (
                              <Maximize2 className="h-3 w-3" />
                            )}
                            <span>{expandedCard === 'h' ? 'Collapse' : 'Expand'}</span>
                          </button>
                        </div>
                      </div>

                      <SignalPlot2D
                        testId="plot-h-kernel"
                        ariaLabel={
                          mode === 'continuous'
                            ? 'Plot of impulse response h(tau)'
                            : 'Stem plot of impulse response h[k]'
                        }
                        domainType={mode === 'continuous' ? 'continuous' : 'discrete'}
                        xLabel={mode === 'continuous' ? 'τ' : 'k'}
                        heightClass={expandedCard === 'h' ? 'flex-1 min-h-[380px]' : isViewExpanded ? 'h-64' : 'h-48 sm:h-52'}
                        continuousSingle={
                          mode === 'continuous'
                            ? {
                                curve: contHCurve,
                                color: '#D97706',
                                fillColor: 'rgba(217, 119, 6, 0.10)',
                              }
                            : undefined
                        }
                        discreteSingle={
                          mode === 'discrete'
                            ? {
                                stems: discHStems,
                                color: '#D97706',
                              }
                            : undefined
                        }
                      />
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                      {mode === 'continuous' ? (
                        <ContinuousSignalControls
                          kind="h"
                          params={contH}
                          onChange={setContH}
                        />
                      ) : (
                        <DiscreteSignalControls
                          kind="h"
                          params={discH}
                          onChange={setDiscH}
                        />
                      )}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* Bottom Full-Width Card (y) */}
            {(!expandedCard || expandedCard === 'y') && (
              <section
                aria-label="Convolution output"
                className={`rounded-xl border border-slate-200 bg-white p-4 shadow-xs ${
                  expandedCard === 'y' ? 'flex-1 flex flex-col' : ''
                }`}
              >
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h2 className="text-sm font-semibold text-slate-900">
                      {mode === 'continuous'
                        ? 'Convolution Output y(t) = (x * h)(t)'
                        : 'Convolution Output y[n] = (x * h)[n]'}
                    </h2>
                    <span className="text-xs text-slate-500">
                      Drag horizontally on plot to scrub {mode === 'continuous' ? 't' : 'n'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      data-testid="output-y-readout"
                      className="font-mono-tabular text-sm font-semibold text-teal-700"
                    >
                      {mode === 'continuous' ? contReadoutText : discReadoutText}
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedCard((c) => (c === 'y' ? null : 'y'))}
                      aria-pressed={expandedCard === 'y'}
                      aria-label={expandedCard === 'y' ? 'Collapse y plot' : 'Expand y plot'}
                      title={expandedCard === 'y' ? 'Collapse (Esc)' : 'Expand plot'}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                    >
                      {expandedCard === 'y' ? (
                        <Minimize2 className="h-3 w-3" />
                      ) : (
                        <Maximize2 className="h-3 w-3" />
                      )}
                      <span>{expandedCard === 'y' ? 'Collapse' : 'Expand'}</span>
                    </button>
                  </div>
                </div>

                <SignalPlot2D
                  testId="plot-y-output"
                  ariaLabel={
                    mode === 'continuous'
                      ? 'Convolution output y(t) plot; drag horizontally to scrub t'
                      : 'Convolution output y[n] stem plot; drag horizontally to scrub n'
                  }
                  domainType={mode === 'continuous' ? 'continuous' : 'discrete'}
                  xLabel={mode === 'continuous' ? 't' : 'n'}
                  heightClass={expandedCard === 'y' ? 'flex-1 min-h-[420px]' : isViewExpanded ? 'h-64' : 'h-52 sm:h-56'}
                  continuousOutput={
                    mode === 'continuous'
                      ? {
                          curve: contOutputCurve,
                          cursorT: tValue,
                        }
                      : undefined
                  }
                  discreteOutput={
                    mode === 'discrete'
                      ? {
                          stems: discOutputStems,
                          cursorN: nValue,
                        }
                      : undefined
                  }
                  onScrub={mode === 'continuous' ? handleScrubT : handleScrubN}
                />
              </section>
            )}
          </div>
          )}
        </main>
      )}
    </div>
  );
}
