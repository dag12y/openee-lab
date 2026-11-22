import React from 'react';
import {
  CONTINUOUS_H_PRESETS,
  CONTINUOUS_X_PRESETS,
  ContinuousPreset,
  ContinuousSignalParams,
  DISCRETE_H_PRESETS,
  DISCRETE_X_PRESETS,
  DiscretePreset,
  DiscreteSignalParams,
  getContinuousActiveControls,
  getDiscreteActiveControls,
} from '../math/convolution';

interface SliderRowProps {
  id: string;
  label: string;
  shortLabel?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  accent: 'blue' | 'amber';
  dark?: boolean;
  compact?: boolean;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  id,
  label,
  shortLabel,
  value,
  min,
  max,
  step,
  unit = '',
  decimals = 2,
  accent,
  dark = false,
  compact = false,
  onChange,
}) => {
  const thumbClass =
    accent === 'blue'
      ? dark
        ? '[&::-webkit-slider-thumb]:bg-sky-400'
        : '[&::-webkit-slider-thumb]:bg-blue-600'
      : dark
        ? '[&::-webkit-slider-thumb]:bg-orange-400'
        : '[&::-webkit-slider-thumb]:bg-amber-600';
  const trackClass = dark
    ? '[&::-webkit-slider-runnable-track]:bg-slate-700'
    : '[&::-webkit-slider-runnable-track]:bg-slate-200';

  const displayDecimals = compact && decimals === 2 ? 1 : decimals;
  const formatted = displayDecimals === 0 ? `${Math.round(value)}` : value.toFixed(displayDecimals);

  if (compact) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <label
          htmlFor={id}
          title={label}
          className="w-5 text-[11px] font-medium text-slate-400 whitespace-nowrap shrink-0"
        >
          {shortLabel ?? label}
        </label>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={`sim-slider flex-1 min-w-[54px] ${trackClass} ${thumbClass}`}
        />
        <span className="font-mono-tabular w-10 text-right text-[11px] font-medium text-slate-200 whitespace-nowrap shrink-0">
          {formatted}
          {unit === 's' ? 's' : unit ? ` ${unit}` : ''}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <label
        htmlFor={id}
        className={`w-24 text-xs font-medium whitespace-nowrap shrink-0 ${
          dark ? 'text-slate-300' : 'text-slate-600'
        }`}
      >
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`sim-slider flex-1 min-w-[80px] ${trackClass} ${thumbClass}`}
      />
      <span
        className={`font-mono-tabular w-16 text-right text-xs font-medium whitespace-nowrap shrink-0 ${
          dark ? 'text-slate-200' : 'text-slate-800'
        }`}
      >
        {formatted}
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
  );
};

interface ContinuousControlsProps {
  kind: 'x' | 'h';
  params: ContinuousSignalParams;
  onChange: (next: ContinuousSignalParams) => void;
  onReset?: () => void;
  dark?: boolean;
  compact?: boolean;
}

export const ContinuousSignalControls: React.FC<ContinuousControlsProps> = ({
  kind,
  params,
  onChange,
  onReset,
  dark = false,
  compact = false,
}) => {
  const presets = kind === 'x' ? CONTINUOUS_X_PRESETS : CONTINUOUS_H_PRESETS;
  const active = getContinuousActiveControls(params.preset);
  const accent = kind === 'x' ? 'blue' : 'amber';

  const update = (patch: Partial<ContinuousSignalParams>) => {
    onChange({ ...params, ...patch });
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      <div className={compact ? 'flex items-center justify-between gap-2' : ''}>
        {compact && (
          <span
            className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
              kind === 'x' ? 'text-sky-400' : 'text-orange-400'
            }`}
          >
            {kind === 'x' ? 'Input x(τ)' : 'Impulse h(τ)'}
          </span>
        )}
        <div
          role="group"
          aria-label={`${kind}(τ) preset selector`}
          className="flex flex-wrap items-center gap-1"
        >
          {presets.map((p) => {
            const isSelected = params.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => update({ preset: p.id as ContinuousPreset })}
                className={`${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 ${
                  isSelected
                    ? accent === 'blue'
                      ? dark
                        ? 'border-sky-500 bg-sky-500 text-white'
                        : 'border-blue-600 bg-blue-50 text-blue-700'
                      : dark
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-amber-600 bg-amber-50 text-amber-800'
                    : dark
                      ? 'border-slate-700/90 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            );
          })}
          {compact && onReset && (
            <button
              type="button"
              onClick={onReset}
              aria-label={kind === 'x' ? 'Reset x(τ)' : 'Reset h(τ)'}
              title={kind === 'x' ? 'Reset x(τ)' : 'Reset h(τ)'}
              className="ml-0.5 inline-flex items-center justify-center rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className={compact ? 'grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5' : 'grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2'}>
        {active.amplitude && (
          <SliderRow
            id={`${kind}-cont-amp`}
            label={params.preset === 'impulse' ? 'Weight A' : 'Amplitude A'}
            shortLabel="A"
            value={params.amplitude}
            min={-2.5}
            max={2.5}
            step={0.1}
            accent={accent}
            dark={dark}
            compact={compact}
            onChange={(amplitude) => update({ amplitude })}
          />
        )}
        {active.shift && (
          <SliderRow
            id={`${kind}-cont-shift`}
            label="Shift t₀"
            shortLabel="t₀"
            value={params.shift}
            min={-4.0}
            max={4.0}
            step={0.1}
            unit="s"
            accent={accent}
            dark={dark}
            compact={compact}
            onChange={(shift) => update({ shift })}
          />
        )}
        {active.width && (
          <SliderRow
            id={`${kind}-cont-width`}
            label="Width W"
            shortLabel="W"
            value={params.width}
            min={0.4}
            max={6.0}
            step={0.1}
            unit="s"
            accent={accent}
            dark={dark}
            compact={compact}
            onChange={(width) => update({ width })}
          />
        )}
        {active.frequency && (
          <SliderRow
            id={`${kind}-cont-freq`}
            label="Frequency f"
            shortLabel="f"
            value={params.frequency}
            min={0.2}
            max={2.5}
            step={0.05}
            unit="Hz"
            accent={accent}
            dark={dark}
            compact={compact}
            onChange={(frequency) => update({ frequency })}
          />
        )}
        {active.decay && (
          <SliderRow
            id={`${kind}-cont-decay`}
            label="Decay α"
            shortLabel="α"
            value={params.decay}
            min={0.2}
            max={3.0}
            step={0.05}
            accent={accent}
            dark={dark}
            compact={compact}
            onChange={(decay) => update({ decay })}
          />
        )}
      </div>
    </div>
  );
};

interface DiscreteControlsProps {
  kind: 'x' | 'h';
  params: DiscreteSignalParams;
  onChange: (next: DiscreteSignalParams) => void;
}

export const DiscreteSignalControls: React.FC<DiscreteControlsProps> = ({
  kind,
  params,
  onChange,
}) => {
  const presets = kind === 'x' ? DISCRETE_X_PRESETS : DISCRETE_H_PRESETS;
  const active = getDiscreteActiveControls(params.preset);
  const accent = kind === 'x' ? 'blue' : 'amber';

  const update = (patch: Partial<DiscreteSignalParams>) => {
    onChange({ ...params, ...patch });
  };

  return (
    <div className="space-y-2.5">
      <div
        role="group"
        aria-label={`${kind}[k] preset selector`}
        className="flex flex-wrap gap-1.5"
      >
        {presets.map((p) => {
          const isSelected = params.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => update({ preset: p.id as DiscretePreset })}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 ${
                isSelected
                  ? accent === 'blue'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-amber-600 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
        {active.amplitude && (
          <SliderRow
            id={`${kind}-disc-amp`}
            label={params.preset === 'impulse' ? 'Weight A' : 'Amplitude A'}
            value={params.amplitude}
            min={-2.5}
            max={2.5}
            step={0.1}
            accent={accent}
            onChange={(amplitude) => update({ amplitude })}
          />
        )}
        {active.shift && (
          <SliderRow
            id={`${kind}-disc-shift`}
            label="Shift n₀"
            value={params.shift}
            min={-6}
            max={6}
            step={1}
            decimals={0}
            accent={accent}
            onChange={(shift) => update({ shift: Math.round(shift) })}
          />
        )}
        {active.length && (
          <SliderRow
            id={`${kind}-disc-len`}
            label="Length L"
            value={params.length}
            min={1}
            max={9}
            step={1}
            decimals={0}
            accent={accent}
            onChange={(length) => update({ length: Math.round(length) })}
          />
        )}
        {active.omega && (
          <SliderRow
            id={`${kind}-disc-omega`}
            label="Freq Ω₀"
            value={params.omega}
            min={0.2}
            max={2.4}
            step={0.05}
            unit="rad"
            accent={accent}
            onChange={(omega) => update({ omega })}
          />
        )}
        {active.decay && (
          <SliderRow
            id={`${kind}-disc-decay`}
            label="Decay α"
            value={params.decay}
            min={0.1}
            max={1.5}
            step={0.05}
            accent={accent}
            onChange={(decay) => update({ decay })}
          />
        )}
      </div>
    </div>
  );
};
