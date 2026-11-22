import {
  compileExpression,
  expressionToLatex,
  sampleInputRegion,
  type FourierSeriesConfig,
  type GraphicalInterpolation,
  type PeriodicContinuation,
  type PiecewiseSegment,
  type Point2D,
  type PresetWaveformId,
} from "../../../packages/engine-communications/src/ch1/s3/index.js";
import { renderLatex } from "./latex-ui";
import { createMathKeypad } from "./math-keypad";
import { element } from "./ui";
import { attachClickZoomGuard } from "./zoom-guard";

const PRESET_LIST: ReadonlyArray<{ id: PresetWaveformId; label: string; canonicalExpr: string }> = [
  { id: "square", label: "Square", canonicalExpr: "square(t / 2)" },
  { id: "sawtooth", label: "Sawtooth", canonicalExpr: "sawtooth(t / 2)" },
  { id: "triangle", label: "Triangle", canonicalExpr: "triangle(t / 2)" },
  { id: "half-rectified", label: "Half-sine", canonicalExpr: "max(0, sin(pi * t))" },
  { id: "full-rectified", label: "Full-sine", canonicalExpr: "abs(sin(pi * t / 2))" },
  { id: "pulse", label: "Pulse", canonicalExpr: "pulse(t / 2, 0.25)" },
];

const FORMULA_EXAMPLES: ReadonlyArray<{ label: string; expr: string; start: number; end: number }> = [
  { label: "t", expr: "t", start: -3.1416, end: 3.1416 },
  { label: "t²", expr: "t^2", start: -3.1416, end: 3.1416 },
  { label: "|t|", expr: "|t|", start: -3.1416, end: 3.1416 },
  { label: "e⁻ᵗ", expr: "exp(-t)", start: 0, end: 2 },
  { label: "Step", expr: "t < 1 ? 1 : -1", start: 0, end: 2 },
  { label: "{Piecewise}", expr: "{0 <= t < 1: 2*t, 1 <= t <= 2: 2*(2 - t), 0}", start: 0, end: 2 },
  { label: "Trig sum", expr: "3 + 2*cos(pi*t) - sin(3*pi*t)", start: 0, end: 2 },
];

const fmt = (v: number) => {
  if (Math.abs(v) < 1e-12) return "0";
  return Number(v.toPrecision(4)).toString();
};

function niceStep(span: number, targetTicks: number): number {
  const raw = span / Math.max(2, targetTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const mult = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return mult * mag;
}

function segmentsToBraceExpr(segs: readonly PiecewiseSegment[]): string {
  if (segs.length === 0) return "0";
  return `{${segs.map(s => `${fmt(Number.isFinite(s.start) ? s.start : 0)} <= t < ${fmt(Number.isFinite(s.end) ? s.end : 1)}: ${s.expr.trim() || "0"}`).join(", ")}}`;
}

function parseBraceToSegments(raw: string): PiecewiseSegment[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return undefined;
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  const out: PiecewiseSegment[] = [];
  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx < 0) continue;
    const cond = part.slice(0, colonIdx).trim();
    const expr = part.slice(colonIdx + 1).trim();
    const m = cond.match(/^(-?\d+(?:\.\d+)?)\s*<=?\s*t\s*<=?\s*(-?\d+(?:\.\d+)?)$/);
    if (!m || !expr) return undefined;
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
    out.push({ start, end, expr });
  }
  return out.length > 0 ? out : undefined;
}

export function createFunctionStudio(
  initial: FourierSeriesConfig,
  onChange: (next: FourierSeriesConfig, delayMs: number) => void,
) {
  let config = initial;
  let activeTextInput: HTMLInputElement | undefined;
  let customPeriodOpen = false;
  let showPiecewiseRows = initial.inputKind === "piecewise";
  let selectAllOnNextFocus = initial.inputKind === "preset";
  let pendingMouseSelect = false;
  let mouseDownX = 0;
  let disposed = false;

  // Persistent continuous viewport for the preview graph — NEVER auto-rescaled while dragging handles
  let previewMin = -4;
  let previewMax = 4;
  let canvasWidth = 620;
  let canvasHeight = 250;
  let dpr = 1;

  const root = element("section", undefined, "panel s3-studio");

  // Top bar of Function Studio: unified 2-mode switch + Custom Period toggle + Keypad toggle
  const studioHead = element("div", undefined, "s3-studio-head");
  const titleWrap = element("div", undefined, "s3-studio-title");
  titleWrap.append(element("h2", "Function Input & Periodic Region"));
  const regionMeta = element("span", "", "s3-region-meta");
  titleWrap.append(regionMeta);

  const modeBar = element("div", undefined, "s3-seg-tabs");
  modeBar.setAttribute("role", "tablist");
  const fnTabBtn = element("button", "Function x(t)");
  fnTabBtn.type = "button";
  fnTabBtn.setAttribute("role", "tab");
  const drawTabBtn = element("button", "Graphical draw");
  drawTabBtn.type = "button";
  drawTabBtn.setAttribute("role", "tab");
  modeBar.append(fnTabBtn, drawTabBtn);

  const periodToggleBtn = element("button", "Custom period: Off", "s3-keypad-toggle");
  periodToggleBtn.type = "button";
  const keypadBtn = element("button", "Keypad", "s3-keypad-toggle");
  keypadBtn.type = "button";

  const rightActions = element("div", undefined, "s3-studio-actions");
  rightActions.append(modeBar, periodToggleBtn, keypadBtn);
  studioHead.append(titleWrap, rightActions);

  fnTabBtn.addEventListener("click", () => {
    const nextKind = config.inputKind === "graphical" ? "expression" : config.inputKind;
    config = { ...config, inputKind: nextKind };
    syncUI();
    schedulePreview();
    onChange(config, 40);
  });

  drawTabBtn.addEventListener("click", () => {
    config = { ...config, inputKind: "graphical" };
    syncUI();
    schedulePreview();
    onChange(config, 40);
  });

  periodToggleBtn.addEventListener("click", () => {
    customPeriodOpen = !customPeriodOpen;
    if (!customPeriodOpen && config.inputKind !== "graphical") {
      // Restore canonical defaults gently when closing custom period
      if (config.inputKind === "preset") {
        config = { ...config, periodStart: 0, period: 2, continuation: "periodic" };
      }
      onChange(config, 40);
    }
    syncUI();
    schedulePreview();
  });

  // Two-column studio body: Left = unified input controls, Right = Continuous Zoom/Pan Preview Canvas
  const body = element("div", undefined, "s3-studio-grid");
  const leftCol = element("div", undefined, "s3-studio-left");
  const rightCol = element("div", undefined, "s3-studio-right");

  // --- Unified Function x(t) Panel (Formula + Piecewise + Presets unified) ---
  const fnSec = element("div", undefined, "s3-subpanel");

  const exprBar = element("div", undefined, "s3-expr-bar");
  const exprPrefix = element("span", "x(t) =", "s3-expr-prefix");
  const exprInput = element("input");
  exprInput.id = "s3-expr";
  exprInput.type = "text";
  exprInput.className = "s3-expr-input";
  exprInput.value = config.inputKind === "preset"
    ? PRESET_LIST.find(p => p.id === config.presetId)?.canonicalExpr ?? config.expression
    : config.expression;
  exprInput.placeholder = "e.g. sin(pi*t), t^2, or {0 <= t < 1: t, 0}";
  if (selectAllOnNextFocus) exprInput.dataset.replaceAll = "true";
  exprInput.setAttribute("aria-label", "Function or piecewise expression x(t)");
  activeTextInput = exprInput;

  const validBadge = element("span", "✓", "s3-valid-mark ok");
  const clearExprBtn = element("button", "Clear", "s3-clear-btn");
  clearExprBtn.type = "button";
  clearExprBtn.addEventListener("click", () => {
    showPiecewiseRows = false;
    selectAllOnNextFocus = false;
    delete exprInput.dataset.replaceAll;
    exprInput.value = "";
    config = { ...config, inputKind: "expression", expression: "" };
    syncUI();
    schedulePreview();
    exprInput.focus();
    onChange(config, 0);
  });
  exprBar.append(exprPrefix, exprInput, validBadge, clearExprBtn);

  const exprLatexPreview = element("div", undefined, "s3-formula-preview");
  const exprErr = element("p", "", "s3-inline-err");

  // Unified quick preset & formula chips row
  const chipRow = element("div", undefined, "s3-chip-row");
  const presetBtns = new Map<PresetWaveformId, HTMLButtonElement>();
  for (const p of PRESET_LIST) {
    const b = element("button", p.label, "s3-chip");
    b.type = "button";
    b.addEventListener("click", () => {
      showPiecewiseRows = false;
      exprInput.value = p.canonicalExpr;
      selectAllOnNextFocus = true;
      exprInput.dataset.replaceAll = "true";
      config = { ...config, inputKind: "preset", presetId: p.id, periodStart: 0, period: 2, continuation: "periodic" };
      previewMin = -3.5;
      previewMax = 3.5;
      syncUI();
      schedulePreview();
      onChange(config, 30);
    });
    presetBtns.set(p.id, b);
    chipRow.append(b);
  }

  const exampleBtns = new Map<string, HTMLButtonElement>();
  for (const ex of FORMULA_EXAMPLES) {
    const b = element("button", ex.label, "s3-chip");
    b.type = "button";
    b.addEventListener("click", () => {
      showPiecewiseRows = false;
      exprInput.value = ex.expr;
      selectAllOnNextFocus = true;
      exprInput.dataset.replaceAll = "true";
      const pLen = Number((ex.end - ex.start).toFixed(4));
      config = {
        ...config,
        inputKind: "expression",
        expression: ex.expr,
        periodStart: Number(ex.start.toFixed(4)),
        period: pLen,
        continuation: "periodic",
      };
      previewMin = ex.start - pLen * 0.45;
      previewMax = ex.end + pLen * 0.45;
      syncUI();
      schedulePreview();
      onChange(config, 30);
    });
    exampleBtns.set(ex.expr, b);
    chipRow.append(b);
  }

  // Inline preset amplitude/offset/duty controls (only active when a preset is selected)
  const ampRow = element("div", undefined, "s3-param-row");
  const ampField = makeCompactNum("fs-amp", "Amplitude A", "V", config.amplitude, v => {
    config = { ...config, amplitude: v };
    schedulePreview();
    onChange(config, 80);
  });
  const dcField = makeCompactNum("fs-dc", "Offset", "V", config.dcOffset, v => {
    config = { ...config, dcOffset: v };
    schedulePreview();
    onChange(config, 80);
  });
  const dutyField = makeCompactNum("fs-duty", "Duty D", "0..1", config.dutyCycle, v => {
    config = { ...config, dutyCycle: v };
    schedulePreview();
    onChange(config, 80);
  });
  ampRow.append(ampField.root, dcField.root, dutyField.root);

  // Unified Piecewise Interval Rows inside Function x(t)
  const pwToggleRow = element("div", undefined, "plot-controls");
  const pwExpandBtn = element("button", "+ Piecewise intervals");
  pwExpandBtn.type = "button";
  pwExpandBtn.addEventListener("click", () => {
    showPiecewiseRows = !showPiecewiseRows;
    if (showPiecewiseRows && config.inputKind !== "piecewise") {
      const parsedFromExpr = parseBraceToSegments(exprInput.value);
      let segs = config.piecewiseSegments;
      if (parsedFromExpr) {
        segs = parsedFromExpr;
      } else if (config.inputKind === "expression" && exprInput.value.trim() !== "" && exprInput.value.trim() !== "0") {
        segs = [{ start: config.periodStart, end: config.periodStart + config.period, expr: exprInput.value.trim() }];
      }
      const pStart = segs[0]?.start ?? config.periodStart;
      const pEnd = segs[segs.length - 1]?.end ?? (config.periodStart + config.period);
      const braceExpr = segmentsToBraceExpr(segs);
      config = {
        ...config,
        inputKind: "piecewise",
        expression: braceExpr,
        piecewiseSegments: segs,
        periodStart: pStart,
        period: Math.max(0.1, pEnd - pStart),
      };
      exprInput.value = braceExpr;
      selectAllOnNextFocus = false;
      delete exprInput.dataset.replaceAll;
      renderPiecewiseRows();
      onChange(config, 40);
    } else if (!showPiecewiseRows && config.inputKind === "piecewise") {
      config = { ...config, inputKind: "expression", expression: exprInput.value };
      onChange(config, 40);
    }
    syncUI();
    schedulePreview();
  });
  pwToggleRow.append(pwExpandBtn);

  const pwWrap = element("div", undefined, "s3-subpanel");
  const segList = element("div", undefined, "s3-seg-list");
  const addSegBtn = element("button", "+ Add interval");
  addSegBtn.type = "button";
  addSegBtn.addEventListener("click", () => {
    const segs = [...config.piecewiseSegments];
    const lastEnd = segs.length > 0 ? segs[segs.length - 1]!.end : config.periodStart + config.period;
    const nextEnd = lastEnd + 1;
    segs.push({ start: lastEnd, end: nextEnd, expr: "0" });
    const pStart = segs[0]!.start;
    const braceExpr = segmentsToBraceExpr(segs);
    config = {
      ...config,
      inputKind: "piecewise",
      expression: braceExpr,
      piecewiseSegments: segs,
      periodStart: pStart,
      period: Math.max(0.1, nextEnd - pStart),
    };
    exprInput.value = braceExpr;
    selectAllOnNextFocus = false;
    delete exprInput.dataset.replaceAll;
    renderPiecewiseRows();
    syncUI();
    schedulePreview();
    onChange(config, 100);
  });
  pwWrap.append(segList, addSegBtn);

  function renderPiecewiseRows() {
    segList.replaceChildren();
    config.piecewiseSegments.forEach((seg, idx) => {
      const row = element("div", undefined, "s3-seg-row");
      const sIn = element("input");
      sIn.type = "number"; sIn.step = "any"; sIn.value = String(seg.start); sIn.ariaLabel = `Segment ${idx + 1} start`;
      const eIn = element("input");
      eIn.type = "number"; eIn.step = "any"; eIn.value = String(seg.end); eIn.ariaLabel = `Segment ${idx + 1} end`;
      const exIn = element("input");
      exIn.type = "text"; exIn.value = seg.expr; exIn.ariaLabel = `Segment ${idx + 1} expression`;
      exIn.addEventListener("focus", () => { activeTextInput = exIn; });

      const del = element("button", "×");
      del.type = "button";
      del.title = "Remove interval";
      const update = () => {
        const next: PiecewiseSegment[] = config.piecewiseSegments.map((item, i) =>
          i === idx ? { start: Number(sIn.value), end: Number(eIn.value), expr: exIn.value } : item,
        );
        const minS = Math.min(...next.map(s => (Number.isFinite(s.start) ? s.start : 0)));
        const maxE = Math.max(...next.map(s => (Number.isFinite(s.end) ? s.end : 1)));
        const braceExpr = segmentsToBraceExpr(next);
        config = {
          ...config,
          inputKind: "piecewise",
          expression: braceExpr,
          piecewiseSegments: next,
          periodStart: Number(minS.toFixed(4)),
          period: Math.max(0.05, Number((maxE - minS).toFixed(4))),
        };
        exprInput.value = braceExpr;
        selectAllOnNextFocus = false;
        delete exprInput.dataset.replaceAll;
        updateExprPreview();
        syncRegionLabels();
        schedulePreview();
        onChange(config, next.some(s => s.expr.trim() === "") ? 0 : 140);
      };
      sIn.addEventListener("input", update);
      eIn.addEventListener("input", update);
      exIn.addEventListener("input", update);
      del.addEventListener("click", () => {
        if (config.piecewiseSegments.length <= 1) return;
        const next = config.piecewiseSegments.filter((_, i) => i !== idx);
        const minS = Math.min(...next.map(s => s.start));
        const maxE = Math.max(...next.map(s => s.end));
        const braceExpr = segmentsToBraceExpr(next);
        config = {
          ...config,
          inputKind: "piecewise",
          expression: braceExpr,
          piecewiseSegments: next,
          periodStart: Number(minS.toFixed(4)),
          period: Math.max(0.05, Number((maxE - minS).toFixed(4))),
        };
        exprInput.value = braceExpr;
        selectAllOnNextFocus = false;
        delete exprInput.dataset.replaceAll;
        renderPiecewiseRows();
        updateExprPreview();
        syncRegionLabels();
        schedulePreview();
        onChange(config, 80);
      });
      row.append(sIn, element("span", "≤ t <"), eIn, exIn, del);
      segList.append(row);
    });
  }
  renderPiecewiseRows();

  function updateExprPreview() {
    if (config.inputKind === "piecewise") {
      try {
        for (const s of config.piecewiseSegments) {
          if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start) {
            throw new Error("Each interval requires end > start.");
          }
          if (s.expr.trim() !== "") compileExpression(s.expr);
        }
        const rows = config.piecewiseSegments
          .map(s => `${s.expr.trim() === "" ? "\\_" : expressionToLatex(s.expr)}, & ${fmt(s.start)} \\le t < ${fmt(s.end)}`)
          .join(String.raw` \\ `);
        renderLatex(exprLatexPreview, String.raw`x(t) = \begin{cases} ${rows} \end{cases}`, false);
        const hasEmpty = config.piecewiseSegments.some(s => s.expr.trim() === "");
        validBadge.textContent = hasEmpty ? "" : "✓";
        validBadge.className = hasEmpty ? "s3-valid-mark" : "s3-valid-mark ok";
        exprErr.textContent = "";
      } catch (e) {
        validBadge.textContent = "!";
        validBadge.className = "s3-valid-mark err";
        exprErr.textContent = e instanceof Error ? e.message : "Syntax error";
      }
      return;
    }
    if (exprInput.value.trim() === "") {
      validBadge.textContent = "";
      validBadge.className = "s3-valid-mark";
      exprErr.textContent = "";
      renderLatex(exprLatexPreview, String.raw`x(t) = \;`, false);
      return;
    }
    try {
      compileExpression(exprInput.value);
      validBadge.textContent = "✓";
      validBadge.className = "s3-valid-mark ok";
      exprErr.textContent = "";
      renderLatex(exprLatexPreview, `x(t) = ${expressionToLatex(exprInput.value)}`, false);
    } catch (e) {
      validBadge.textContent = "!";
      validBadge.className = "s3-valid-mark err";
      exprErr.textContent = e instanceof Error ? e.message : "Syntax error";
    }
  }

  exprInput.addEventListener("mousedown", e => {
    mouseDownX = e.clientX;
    if (document.activeElement === exprInput) {
      selectAllOnNextFocus = false;
      delete exprInput.dataset.replaceAll;
    }
  });
  exprInput.addEventListener("focus", () => {
    activeTextInput = exprInput;
    if ((selectAllOnNextFocus || exprInput.value.trim() === "0") && exprInput.value.length > 0) {
      exprInput.select();
      pendingMouseSelect = true;
      selectAllOnNextFocus = false;
    }
  });
  exprInput.addEventListener("mouseup", e => {
    if (pendingMouseSelect) {
      pendingMouseSelect = false;
      if (Math.abs(e.clientX - mouseDownX) < 4) {
        e.preventDefault();
      }
    }
  });
  exprInput.addEventListener("input", () => {
    showPiecewiseRows = false;
    selectAllOnNextFocus = false;
    delete exprInput.dataset.replaceAll;
    config = { ...config, inputKind: "expression", expression: exprInput.value };
    updateExprPreview();
    syncUI();
    schedulePreview();
    onChange(config, exprInput.value.trim() === "" ? 0 : 140);
  });

  fnSec.append(exprBar, exprLatexPreview, exprErr, chipRow, ampRow, pwToggleRow, pwWrap);

  // --- Graphical Draw Controls ---
  const graphSec = element("div", undefined, "s3-subpanel");
  const graphBar = element("div", undefined, "plot-controls");
  const interpSel = element("select");
  interpSel.ariaLabel = "Graphical interpolation";
  for (const [val, lab] of [["linear", "Linear"], ["smooth", "Smooth spline"], ["step", "Step hold"]] as const) {
    const o = element("option", lab);
    o.value = val;
    interpSel.append(o);
  }
  interpSel.value = config.graphicalInterp;
  interpSel.addEventListener("change", () => {
    config = { ...config, graphicalInterp: interpSel.value as GraphicalInterpolation };
    schedulePreview();
    onChange(config, 40);
  });
  graphBar.append(interpSel);

  const gPreset = (label: string, fn: () => Point2D[]) => {
    const b = element("button", label);
    b.type = "button";
    b.addEventListener("click", () => {
      config = { ...config, graphicalPoints: fn() };
      schedulePreview();
      onChange(config, 40);
    });
    graphBar.append(b);
  };
  gPreset("Sine", () => Array.from({ length: 24 }, (_, i) => ({ x: i / 24, y: Math.sin(2 * Math.PI * (i / 24)) })));
  gPreset("Step", () => [{ x: 0, y: 1 }, { x: 0.49, y: 1 }, { x: 0.5, y: -1 }, { x: 0.99, y: -1 }]);
  gPreset("Ramp", () => [{ x: 0, y: -1 }, { x: 0.5, y: 0 }, { x: 0.99, y: 1 }]);
  gPreset("Spike", () => [{ x: 0, y: 0 }, { x: 0.25, y: 0 }, { x: 0.35, y: 1 }, { x: 0.45, y: 0 }, { x: 0.95, y: 0 }]);

  const gAmpField = makeCompactNum("gr-amp", "Amplitude A", "V", config.amplitude, v => {
    config = { ...config, amplitude: v };
    schedulePreview();
    onChange(config, 80);
  });
  graphSec.append(graphBar, gAmpField.root, element("small", "Draw directly inside the shaded fundamental region on the right."));

  // --- Optional Custom Period [t_start, t_end], Gentle Period Slider & Continuation ---
  const regionBox = element("div", undefined, "s3-region-box");
  const periodSliderWrap = element("div", undefined, "field");
  const periodSliderLabel = element("label", `Period width T₀ = ${config.period.toFixed(2)} s`);
  periodSliderLabel.htmlFor = "s3-period-slider";
  const periodSlider = element("input");
  periodSlider.id = "s3-period-slider";
  periodSlider.type = "range";
  periodSlider.min = "0.5";
  periodSlider.max = "10";
  periodSlider.step = "0.05";
  periodSlider.value = String(config.period);
  periodSlider.addEventListener("input", () => {
    const val = Number(periodSlider.value);
    config = { ...config, period: val };
    periodSliderLabel.textContent = `Period width T₀ = ${val.toFixed(2)} s`;
    tEndField.input.value = String(Number((config.periodStart + val).toFixed(3)));
    syncRegionLabels();
    schedulePreview();
    onChange(config, 80);
  });
  periodSliderWrap.append(periodSliderLabel, periodSlider);

  const regionGrid = element("div", undefined, "s3-param-row");
  const tStartField = makeCompactNum("reg-start", "Start (t_start)", "s", config.periodStart, v => {
    const tEnd = config.periodStart + config.period;
    if (tEnd - v > 0.05) {
      config = { ...config, periodStart: v, period: Number((tEnd - v).toFixed(4)) };
      syncUI();
      schedulePreview();
      onChange(config, 100);
    }
  });
  const tEndField = makeCompactNum("reg-end", "End (t_end)", "s", config.periodStart + config.period, v => {
    const newPeriod = v - config.periodStart;
    if (newPeriod > 0.05) {
      config = { ...config, period: Number(newPeriod.toFixed(4)) };
      syncUI();
      schedulePreview();
      onChange(config, 100);
    }
  });
  regionGrid.append(tStartField.root, tEndField.root);

  const contRow = element("div", undefined, "s3-cont-row");
  const contBtns: Record<PeriodicContinuation, HTMLButtonElement> = {
    periodic: element("button", "Periodic Tile"),
    even: element("button", "Even Extension"),
    odd: element("button", "Odd Extension"),
  };
  (Object.entries(contBtns) as Array<[PeriodicContinuation, HTMLButtonElement]>).forEach(([c, btn]) => {
    btn.type = "button";
    btn.addEventListener("click", () => {
      config = { ...config, continuation: c };
      syncUI();
      schedulePreview();
      onChange(config, 40);
    });
    contRow.append(btn);
  });
  regionBox.append(periodSliderWrap, regionGrid, contRow);

  // Categorized Math Keypad Drawer
  const keypad = createMathKeypad(() => activeTextInput);
  keypadBtn.addEventListener("click", () => {
    const open = keypad.toggle();
    keypadBtn.classList.toggle("active", open);
  });

  leftCol.append(fnSec, graphSec, regionBox, keypad.root);

  // --- Right Column: Continuous Pan/Zoom Input Signal Preview x(t) ---
  const canvasHead = element("div", undefined, "s3-canvas-head");
  const canvasTitle = element("strong", "Input Signal Preview x(t)");
  const canvasControls = element("div", undefined, "plot-controls s3-mini-nav");

  function previewZoom(factor: number, centerFrac = 0.5) {
    const span = previewMax - previewMin;
    const nextSpan = Math.max(0.05, Math.min(2000, span * factor));
    const anchor = previewMin + centerFrac * span;
    previewMin = anchor - centerFrac * nextSpan;
    previewMax = anchor + (1 - centerFrac) * nextSpan;
    schedulePreview();
  }
  function previewPan(frac: number) {
    const shift = (previewMax - previewMin) * frac;
    previewMin += shift;
    previewMax += shift;
    schedulePreview();
  }
  function makeNavBtn(txt: string, fn: () => void) {
    const b = element("button", txt);
    b.type = "button";
    b.addEventListener("click", fn);
    canvasControls.append(b);
  }
  makeNavBtn("+", () => previewZoom(0.65));
  makeNavBtn("−", () => previewZoom(1.5));
  makeNavBtn("←", () => previewPan(-0.25));
  makeNavBtn("→", () => previewPan(0.25));
  makeNavBtn("Reset", () => {
    const span = Math.max(4, config.period * 2.2);
    const mid = config.periodStart + config.period * 0.5;
    previewMin = mid - span * 0.5;
    previewMax = mid + span * 0.5;
    schedulePreview();
  });

  canvasHead.append(canvasTitle, canvasControls);

  const canvas = element("canvas");
  canvas.className = "s3-region-canvas";
  canvas.width = 620;
  canvas.height = 250;

  const canvasFoot = element("p", "", "plot-readout");
  rightCol.append(canvasHead, canvas, canvasFoot);

  body.append(leftCol, rightCol);
  root.append(studioHead, body);

  // --- Pointer & Wheel Interactions (Continuous Pan/Zoom + Smooth Fixed-Scale Handle Drag) ---
  let dragMode: "none" | "start" | "end" | "pan" | "draw" = "none";
  let panStartClientX = 0;
  let panOrigMin = 0;
  let panOrigMax = 0;
  let drawStroke: Point2D[] = [];

  const padL = 44;
  const padR = 14;
  const padT = 18;
  const padB = 28;

  function pointerToTimeAmp(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const plotW = Math.max(1, rect.width - padL - padR);
    const plotH = Math.max(1, rect.height - padT - padB);
    const xFrac = (e.clientX - rect.left - padL) / plotW;
    const yFrac = Math.min(1, Math.max(0, (e.clientY - rect.top - padT) / plotH));
    const tVal = previewMin + xFrac * (previewMax - previewMin);
    const yVal = 1 - 2 * yFrac;
    return { tVal, yVal, px: e.clientX - rect.left, plotW };
  }

  canvas.addEventListener("pointerdown", e => {
    const pos = pointerToTimeAmp(e);
    const tStart = config.periodStart;
    const tEnd = config.periodStart + config.period;

    if (customPeriodOpen) {
      const xStartPx = padL + ((tStart - previewMin) / (previewMax - previewMin)) * pos.plotW;
      const xEndPx = padL + ((tEnd - previewMin) / (previewMax - previewMin)) * pos.plotW;
      if (Math.abs(pos.px - xStartPx) <= 12) {
        dragMode = "start";
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (Math.abs(pos.px - xEndPx) <= 12) {
        dragMode = "end";
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    if (config.inputKind === "graphical") {
      dragMode = "draw";
      const u = (pos.tVal - tStart) / config.period;
      drawStroke = [{ x: Math.min(0.995, Math.max(0, u)), y: pos.yVal }];
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Continuous background pan!
    dragMode = "pan";
    panStartClientX = e.clientX;
    panOrigMin = previewMin;
    panOrigMax = previewMax;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", e => {
    const pos = pointerToTimeAmp(e);
    const tStart = config.periodStart;
    const tEnd = config.periodStart + config.period;

    if (dragMode === "none") {
      if (customPeriodOpen) {
        const xStartPx = padL + ((tStart - previewMin) / (previewMax - previewMin)) * pos.plotW;
        const xEndPx = padL + ((tEnd - previewMin) / (previewMax - previewMin)) * pos.plotW;
        if (Math.abs(pos.px - xStartPx) <= 12 || Math.abs(pos.px - xEndPx) <= 12) {
          canvas.style.cursor = "ew-resize";
          return;
        }
      }
      canvas.style.cursor = config.inputKind === "graphical" ? "crosshair" : "grab";
      return;
    }

    if (dragMode === "pan") {
      canvas.style.cursor = "grabbing";
      const dx = e.clientX - panStartClientX;
      const span = panOrigMax - panOrigMin;
      const deltaT = -(dx / pos.plotW) * span;
      previewMin = panOrigMin + deltaT;
      previewMax = panOrigMax + deltaT;
      schedulePreview();
      return;
    }

    // Handle drags keep previewMin / previewMax strictly LOCKED so handle tracks cursor 1:1
    if (dragMode === "start") {
      const nextStart = Math.min(tEnd - 0.1, Number(pos.tVal.toFixed(2)));
      config = { ...config, periodStart: nextStart, period: Number((tEnd - nextStart).toFixed(2)) };
      syncUI();
      schedulePreview();
      onChange(config, 90);
    } else if (dragMode === "end") {
      const nextEnd = Math.max(tStart + 0.1, Number(pos.tVal.toFixed(2)));
      config = { ...config, period: Number((nextEnd - tStart).toFixed(2)) };
      syncUI();
      schedulePreview();
      onChange(config, 90);
    } else if (dragMode === "draw") {
      const u = (pos.tVal - tStart) / config.period;
      drawStroke.push({ x: Math.min(0.995, Math.max(0, u)), y: Math.max(-1, Math.min(1, pos.yVal)) });
      drawCanvas(drawStroke);
    }
  });

  const finishDrag = () => {
    if (dragMode === "draw" && drawStroke.length >= 2) {
      const bins = 32;
      const sumY = new Float64Array(bins);
      const cnt = new Int32Array(bins);
      for (const p of drawStroke) {
        const idx = Math.min(bins - 1, Math.max(0, Math.floor(p.x * bins)));
        sumY[idx]! += p.y;
        cnt[idx]! += 1;
      }
      const nextPts: Point2D[] = [];
      for (let i = 0; i < bins; i++) {
        const x = i / bins;
        if (cnt[i]! > 0) {
          nextPts.push({ x, y: sumY[i]! / cnt[i]! });
        } else {
          const nearest = config.graphicalPoints.reduce(
            (best, cur) => (Math.abs(cur.x - x) < Math.abs(best.x - x) ? cur : best),
            config.graphicalPoints[0] ?? { x, y: 0 },
          );
          nextPts.push({ x, y: nearest.y });
        }
      }
      config = { ...config, graphicalPoints: nextPts };
      drawStroke = [];
      schedulePreview();
      onChange(config, 30);
    }
    dragMode = "none";
    canvas.style.cursor = config.inputKind === "graphical" ? "crosshair" : "grab";
  };

  const zoomGuard = attachClickZoomGuard(canvas, {
    onStateChange: () => syncRegionLabels(),
  });

  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);

  canvas.addEventListener("wheel", e => {
    if (!zoomGuard.isActive()) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const plotW = Math.max(1, rect.width - padL - padR);
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left - padL) / plotW));
    previewZoom(e.deltaY < 0 ? 0.82 : 1.22, frac);
  }, { passive: false });

  let previewFrame = 0;
  function schedulePreview() {
    if (!previewFrame && !disposed) {
      previewFrame = requestAnimationFrame(() => {
        previewFrame = 0;
        drawCanvas();
      });
    }
  }

  function syncRegionLabels() {
    const effPeriod = config.continuation === "periodic" ? config.period : 2 * config.period;
    const w0 = (2 * Math.PI) / effPeriod;
    const f0 = 1 / effPeriod;
    regionMeta.textContent = `T₀ = ${effPeriod.toFixed(2)} s · f₀ = ${f0.toFixed(2)} Hz · ω₀ = ${w0.toFixed(2)} rad/s`;
    const zoomHint = zoomGuard.isActive() ? "Scroll-zoom active (click outside to scroll page)" : "Drag to pan, click plot to scroll-zoom";
    canvasFoot.textContent = customPeriodOpen
      ? `Window [${fmt(previewMin)}, ${fmt(previewMax)}] s · Fundamental [${config.periodStart.toFixed(2)}, ${(config.periodStart + config.period).toFixed(2)}] s · ${zoomHint}`
      : `Continuous map [${fmt(previewMin)}, ${fmt(previewMax)}] s · ${zoomHint}`;
  }

  function drawCanvas(previewStroke?: readonly Point2D[]) {
    if (disposed) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    dpr = Math.min(3, devicePixelRatio || 1);
    const pw = Math.round(canvasWidth * dpr);
    const ph = Math.round(canvasHeight * dpr);
    if (pw < 1 || ph < 1 || canvasWidth <= padL + padR || canvasHeight <= padT + padB) return;
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }

    const w = canvasWidth;
    const h = canvasHeight;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const css = getComputedStyle(document.documentElement);
    const trace = css.getPropertyValue("--trace").trim() || "#087a75";
    const muted = css.getPropertyValue("--muted").trim() || "#465b70";
    const border = css.getPropertyValue("--border").trim() || "#c9d4df";
    const ink = css.getPropertyValue("--ink").trim() || "#17283b";

    ctx.clearRect(0, 0, w, h);

    const tStart = config.periodStart;
    const tEnd = config.periodStart + config.period;

    let extended: Float64Array;
    const sampleN = 480;
    if (config.inputKind === "expression" && config.expression.trim() === "") {
      extended = new Float64Array(sampleN);
    } else {
      try {
        const sampled = sampleInputRegion(config, previewMin, previewMax, sampleN);
        extended = sampled.extended;
      } catch {
        extended = new Float64Array(sampleN);
      }
    }

    let yLo = -1;
    let yHi = 1;
    for (let i = 0; i < extended.length; i++) {
      const v = extended[i]!;
      if (v < yLo) yLo = v;
      if (v > yHi) yHi = v;
    }
    const ySpan = Math.max(1e-3, yHi - yLo);
    yLo -= ySpan * 0.14;
    yHi += ySpan * 0.14;

    const toPx = (tv: number) => padL + ((tv - previewMin) / (previewMax - previewMin)) * plotW;
    const toPy = (yv: number) => padT + ((yHi - yv) / (yHi - yLo)) * plotH;

    // Subtle shaded fundamental region inside clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    const x1 = toPx(tStart);
    const x2 = toPx(tEnd);
    ctx.fillStyle = "rgba(8, 122, 117, 0.09)";
    ctx.fillRect(x1, padT, Math.max(2, x2 - x1), plotH);
    ctx.restore();

    // Adaptive Desmos grid + labels
    ctx.strokeStyle = border;
    ctx.fillStyle = muted;
    ctx.font = "11px system-ui";
    ctx.lineWidth = 1;
    const xTick = niceStep(previewMax - previewMin, 6);
    const firstX = Math.ceil(previewMin / xTick) * xTick;
    ctx.beginPath();
    for (let xv = firstX; xv <= previewMax + xTick * 1e-6; xv += xTick) {
      const px = toPx(xv);
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.textAlign = "center";
      ctx.fillText(fmt(xv), px, padT + plotH + 15);
    }
    const yTick = niceStep(yHi - yLo, 4);
    const firstY = Math.ceil(yLo / yTick) * yTick;
    for (let yv = firstY; yv <= yHi + yTick * 1e-6; yv += yTick) {
      const py = toPy(yv);
      ctx.moveTo(padL, py);
      ctx.lineTo(padL + plotW, py);
      ctx.textAlign = "right";
      ctx.fillText(fmt(yv), padL - 6, py + 4);
    }
    ctx.stroke();

    // Principal x=0 and y=0 axes
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    if (previewMin <= 0 && previewMax >= 0) {
      const p0 = toPx(0);
      ctx.moveTo(p0, padT);
      ctx.lineTo(p0, padT + plotH);
    }
    if (yLo <= 0 && yHi >= 0) {
      const p0y = toPy(0);
      ctx.moveTo(padL, p0y);
      ctx.lineTo(padL + plotW, p0y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Clipped waveforms
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    // Full infinite periodic continuation across entire zoomed/panned map
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let i = 0; i < extended.length; i++) {
      const tv = previewMin + (i / (extended.length - 1)) * (previewMax - previewMin);
      const px = toPx(tv);
      const py = toPy(extended[i]!);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Emphasized solid primary period segment
    ctx.strokeStyle = trace;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < extended.length; i++) {
      const tv = previewMin + (i / (extended.length - 1)) * (previewMax - previewMin);
      if (tv < tStart || tv > tEnd) continue;
      const px = toPx(tv);
      const py = toPy(extended[i]!);
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    if (previewStroke && previewStroke.length > 1) {
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 2;
      ctx.beginPath();
      previewStroke.forEach((pt, idx) => {
        const px = toPx(tStart + pt.x * config.period);
        const py = toPy(pt.y * config.amplitude + config.dcOffset);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    ctx.restore();

    // Show draggable red boundary handles ONLY when Custom period mode is toggled On
    if (customPeriodOpen) {
      for (const [bx, tag] of [[x1, `t₁=${tStart.toFixed(2)}`], [x2, `t₂=${tEnd.toFixed(2)}`]] as const) {
        if (bx < padL - 2 || bx > padL + plotW + 2) continue;
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(bx, padT);
        ctx.lineTo(bx, padT + plotH);
        ctx.stroke();

        ctx.fillStyle = "#dc2626";
        ctx.beginPath();
        ctx.arc(bx, padT, 5, 0, 2 * Math.PI);
        ctx.arc(bx, padT + plotH, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.font = "11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(tag, bx, padT + plotH + 25);
      }
    }

    syncRegionLabels();
  }

  const resize = new ResizeObserver(([entry]) => {
    if (!entry) return;
    canvasWidth = entry.contentRect.width;
    canvasHeight = entry.contentRect.height;
    schedulePreview();
  });
  resize.observe(canvas);

  function syncUI() {
    const isGraph = config.inputKind === "graphical";
    fnTabBtn.classList.toggle("active", !isGraph);
    fnTabBtn.setAttribute("aria-selected", String(!isGraph));
    drawTabBtn.classList.toggle("active", isGraph);
    drawTabBtn.setAttribute("aria-selected", String(isGraph));

    fnSec.hidden = isGraph;
    graphSec.hidden = !isGraph;

    periodToggleBtn.classList.toggle("active", customPeriodOpen);
    periodToggleBtn.textContent = customPeriodOpen ? "Custom period: On" : "Custom period: Off";
    regionBox.hidden = !customPeriodOpen;

    ampRow.hidden = config.inputKind !== "preset";
    dutyField.root.hidden = config.presetId !== "pulse";
    pwWrap.hidden = !showPiecewiseRows;
    pwExpandBtn.classList.toggle("active", showPiecewiseRows);
    pwExpandBtn.textContent = showPiecewiseRows ? "− Hide piecewise rows" : "+ Piecewise intervals";

    presetBtns.forEach((btn, id) => btn.classList.toggle("active", config.inputKind === "preset" && config.presetId === id));
    exampleBtns.forEach((btn, expr) => btn.classList.toggle("active", config.inputKind === "expression" && config.expression === expr));

    (Object.entries(contBtns) as Array<[PeriodicContinuation, HTMLButtonElement]>).forEach(([c, b]) => {
      b.classList.toggle("active", (config.continuation ?? "periodic") === c);
    });

    tStartField.input.value = String(config.periodStart);
    tEndField.input.value = String(Number((config.periodStart + config.period).toFixed(4)));
    periodSlider.value = String(Math.min(10, Math.max(0.5, config.period)));
    periodSliderLabel.textContent = `Period width T₀ = ${config.period.toFixed(2)} s`;

    if (!isGraph) updateExprPreview();
    syncRegionLabels();
  }

  syncUI();
  schedulePreview();

  return {
    root,
    getConfig: () => config,
    dispose() {
      disposed = true;
      cancelAnimationFrame(previewFrame);
      zoomGuard.dispose();
      resize.disconnect();
    },
  };
}

function makeCompactNum(
  id: string,
  label: string,
  unit: string,
  initial: number,
  onValid: (val: number) => void,
) {
  const root = element("div", undefined, "field s3-compact-field");
  const lab = element("label", label);
  lab.htmlFor = id;
  const box = element("div", undefined, "input-box");
  const input = element("input");
  input.id = id;
  input.type = "number";
  input.step = "any";
  input.value = String(initial);
  input.addEventListener("input", () => {
    const v = input.valueAsNumber;
    if (Number.isFinite(v)) {
      input.removeAttribute("aria-invalid");
      onValid(v);
    } else {
      input.setAttribute("aria-invalid", "true");
    }
  });
  box.append(input, element("span", unit));
  root.append(lab, box);
  return { root, input };
}
