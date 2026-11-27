export type ClickZoomGuard = Readonly<{
  isActive: () => boolean;
  setActive: (next: boolean) => void;
  dispose: () => void;
}>;

export function attachClickZoomGuard(
  canvas: HTMLCanvasElement,
  options?: {
    signal?: AbortSignal;
    onStateChange?: (active: boolean) => void;
  },
): ClickZoomGuard {
  let active = false;
  const ac = new AbortController();
  const signal = options?.signal
    ? AbortSignal.any([ac.signal, options.signal])
    : ac.signal;

  function setActive(next: boolean) {
    if (active === next) return;
    active = next;
    canvas.classList.toggle("s3-zoom-active", active);
    options?.onStateChange?.(active);
  }

  canvas.addEventListener("pointerdown", () => setActive(true), { signal });
  document.addEventListener(
    "pointerdown",
    e => {
      if (!active) return;
      const target = e.target as Node | null;
      if (!target || !canvas.contains(target)) {
        setActive(false);
      }
    },
    { capture: true, signal },
  );
  document.addEventListener(
    "keydown",
    e => {
      if (active && e.key === "Escape") setActive(false);
    },
    { signal },
  );

  return {
    isActive: () => active,
    setActive,
    dispose: () => {
      canvas.classList.remove("s3-zoom-active");
      ac.abort();
    },
  };
}
