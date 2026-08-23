import { useEffect } from "react";
import { useReaderStore } from "@/store/reader";

function zoomModifier(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return e.metaKey || e.ctrlKey;
}

/** Cmd+wheel (macOS) or Ctrl+wheel (Windows) — reader page zoom, not the browser. */
export function applyReaderWheelZoom(e: WheelEvent): boolean {
  if (!zoomModifier(e)) return false;
  e.preventDefault();
  const dy = e.deltaY !== 0 ? e.deltaY : e.deltaX;
  if (!dy) return true;
  const scale = useReaderStore.getState().scale;
  useReaderStore.getState().setScale(scale * Math.exp(-dy * 0.0018));
  return true;
}

export function useReaderWheelZoom(): void {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest("input, textarea, [contenteditable=true]")
      ) {
        return;
      }
      applyReaderWheelZoom(e);
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, true);
  }, []);
}
