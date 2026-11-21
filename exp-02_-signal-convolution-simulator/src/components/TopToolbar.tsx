import React from 'react';
import { Image as ImageIcon, Maximize2, Minimize2, Pause, Play, RotateCcw } from 'lucide-react';
import {
  CONTINUOUS_DOMAIN_MAX,
  CONTINUOUS_DOMAIN_MIN,
  DISCRETE_DOMAIN_MAX,
  DISCRETE_DOMAIN_MIN,
  ViewMode,
} from '../math/convolution';

export const SPEED_OPTIONS = [0.5, 1, 2, 3.5] as const;

interface TopToolbarProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onResetCursor: () => void;
  tValue: number;
  nValue: number;
  onScrubT: (nextT: number) => void;
  onScrubN: (nextN: number) => void;
  speed: number;
  onSpeedChange: (nextSpeed: number) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  mode,
  onModeChange,
  isPlaying,
  onTogglePlay,
  onResetCursor,
  tValue,
  nValue,
  onScrubT,
  onScrubN,
  speed,
  onSpeedChange,
  isExpanded = false,
  onToggleExpand,
}) => {
  const isDark = mode === 'space3d';
  const isDiscrete = mode === 'discrete';

  const modeButtons: { id: ViewMode; label: string }[] = [
    { id: 'continuous', label: 'Continuous' },
    { id: 'discrete', label: 'Discrete' },
    { id: 'space3d', label: '3D Space' },
  ];

  return (
    <header
      className={`w-full border-b px-4 py-2.5 transition-colors duration-150 ${
        isDark
          ? 'bg-slate-900 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
        {/* Left: Brand + Segmented Mode Switcher */}
        <div className="flex items-center gap-4 min-w-0">
          <span
            className={`text-sm font-semibold tracking-tight whitespace-nowrap shrink-0 ${
              isDark ? 'text-slate-100' : 'text-slate-900'
            }`}
          >
            Signal Convolution
          </span>

          <nav
            aria-label="Simulation view mode"
            role="tablist"
            className={`flex items-center gap-1 rounded-lg p-1 ${
              isDark ? 'bg-slate-800' : 'bg-slate-100'
            }`}
          >
            {modeButtons.map((btn) => {
              const active = mode === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onModeChange(btn.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 ${
                    active
                      ? isDark
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'bg-white text-slate-900 shadow-sm'
                      : isDark
                        ? 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            aria-pressed={mode === 'image2d'}
            onClick={() => onModeChange('image2d')}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 ${
              mode === 'image2d'
                ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                : isDark
                  ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>Image Processing Example</span>
          </button>
        </div>

        {/* Right: Shared Playback, Scrubber & Speed Controls (1D/3D) + Expand */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {mode !== 'image2d' && (
            <>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onTogglePlay}
                  aria-label={isPlaying ? 'Pause sweep' : 'Play sweep'}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 ${
                    isPlaying
                      ? 'bg-teal-600 text-white hover:bg-teal-500'
                      : isDark
                        ? 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>

            <button
              type="button"
              onClick={onResetCursor}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 ${
                isDark
                  ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{isDiscrete ? 'Reset n' : 'Reset t'}</span>
            </button>
          </div>

          {/* Live Time / Sample Scrubber + Numeric Readout */}
          <div
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-1 ${
              isDark
                ? 'border-slate-700 bg-slate-800/80'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <label
              htmlFor="global-sweep-scrubber"
              className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              {isDiscrete ? 'Sample n' : 'Time t'}
            </label>
            <input
              id="global-sweep-scrubber"
              type="range"
              min={isDiscrete ? DISCRETE_DOMAIN_MIN : CONTINUOUS_DOMAIN_MIN}
              max={isDiscrete ? DISCRETE_DOMAIN_MAX : CONTINUOUS_DOMAIN_MAX}
              step={isDiscrete ? 1 : 0.02}
              value={isDiscrete ? nValue : tValue}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (isDiscrete) onScrubN(Math.round(v));
                else onScrubT(v);
              }}
              aria-label={isDiscrete ? 'Sample index n scrubber' : 'Time t scrubber'}
              className={`sim-slider w-28 sm:w-40 accent-teal-600 ${
                isDark
                  ? '[&::-webkit-slider-runnable-track]:bg-slate-700 [&::-webkit-slider-thumb]:bg-teal-400'
                  : '[&::-webkit-slider-runnable-track]:bg-slate-300 [&::-webkit-slider-thumb]:bg-teal-600'
              }`}
            />
            <span
              data-testid="global-cursor-readout"
              className={`font-mono-tabular w-14 text-right text-xs font-semibold whitespace-nowrap shrink-0 ${
                isDark ? 'text-teal-300' : 'text-teal-700'
              }`}
            >
              {isDiscrete
                ? `${nValue >= 0 ? '+' : ''}${nValue}`
                : `${tValue >= 0 ? '+' : ''}${tValue.toFixed(2)}`}
            </span>
          </div>

          {/* Quick Speed Buttons */}
          <div
            role="group"
            aria-label="Sweep speed multiplier"
            className={`flex items-center gap-0.5 rounded-lg p-1 ${
              isDark ? 'bg-slate-800' : 'bg-slate-100'
            }`}
          >
            {SPEED_OPTIONS.map((opt) => {
              const active = Math.abs(speed - opt) < 1e-6;
              return (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSpeedChange(opt)}
                  className={`font-mono-tabular px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 ${
                    active
                      ? isDark
                        ? 'bg-slate-700 text-teal-300'
                        : 'bg-white text-slate-900 shadow-sm'
                      : isDark
                        ? 'text-slate-400 hover:text-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt}×
                </button>
              );
            })}
          </div>
            </>
          )}

          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-pressed={isExpanded}
              aria-label={isExpanded ? 'Collapse view' : 'Expand view'}
              title={isExpanded ? 'Collapse view (Esc)' : 'Expand view full screen'}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 ${
                isDark
                  ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
