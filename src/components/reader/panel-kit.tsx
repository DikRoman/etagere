"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Toolbar popover plumbing: keeps the panel under its button, fully inside the
 * window, and closes it on outside clicks or Escape.
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const anchor = button.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = panel;
    const edge = 8;
    const left = Math.min(
      Math.max(edge, anchor.right - width),
      Math.max(edge, window.innerWidth - width - edge),
    );
    const below = anchor.bottom + 6;
    const top =
      below + height > window.innerHeight - edge
        ? Math.max(edge, window.innerHeight - height - edge)
        : below;
    setSpot({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return { open, setOpen, spot, buttonRef, panelRef };
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`type-row ${disabled ? "is-off" : ""}`}>
      <span className="type-row-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="type-row-value">{format(value)}</span>
    </label>
  );
}
