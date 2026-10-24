"use client";

import { useEffect, useState } from "react";

/**
 * The book download screen: a cat sweeps books off a shelf, one per slice of
 * progress, walking along to the next one. 100% is an empty shelf.
 */

const SHELF_Y = 140;

/** x, width, height, colour — standing left to right on the shelf. */
const BOOKS = [
  [26, 15, 52, "#c0392b"],
  [43, 12, 44, "#2e86de"],
  [57, 18, 58, "#27ae60"],
  [77, 13, 47, "#f39c12"],
  [92, 16, 61, "#8e44ad"],
  [110, 12, 42, "#16a085"],
  [124, 17, 55, "#d35400"],
  [143, 14, 49, "#2c3e50"],
  [159, 15, 57, "#e84393"],
  [176, 13, 45, "#0984e3"],
] as const;

function formatMb(bytes: number, ru: boolean): string {
  const mb = bytes / (1024 * 1024);
  const n = mb >= 10 ? mb.toFixed(0) : mb.toFixed(1);
  return `${ru ? n.replace(".", ",") : n} ${ru ? "МБ" : "MB"}`;
}

interface Props {
  loaded: number;
  /** Bytes expected; 0 when unknown. */
  total: number;
  title?: string;
  locale: "ru" | "en";
}

export function BookLoader({ loaded, total, title, locale }: Props) {
  const ru = locale === "ru";
  // Without a size, ease towards 90% so the cat keeps working; the reader
  // opens the moment the download finishes anyway.
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (total > 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [total]);

  const share =
    total > 0
      ? Math.min(1, loaded / total)
      : 0.9 * (1 - Math.exp(-(now - startedAt) / 6000));
  const percent = Math.round(share * 100);

  // The cat clears the shelf from the right: book i falls once its slice of
  // the download is done.
  const fallen = Math.min(BOOKS.length, Math.floor(share * BOOKS.length + 1e-9));
  const standing = BOOKS.length - fallen;
  const next = BOOKS[standing - 1];
  // The cat sits just right of the next book it will knock over.
  const catX = next ? next[0] + next[1] + 34 : 46;

  return (
    <div className="book-loader" role="status" aria-live="polite">
      <svg className="book-loader-scene" viewBox="0 0 300 200" aria-hidden>
        {/* shelf */}
        <rect className="bl-shelf" x="14" y={SHELF_Y} width="272" height="10" rx="2" />
        <rect className="bl-bracket" x="40" y={SHELF_Y + 10} width="8" height="16" rx="1" />
        <rect className="bl-bracket" x="252" y={SHELF_Y + 10} width="8" height="16" rx="1" />

        {/* books */}
        {BOOKS.map(([x, w, h, color], i) => (
          <g
            key={i}
            className={`bl-book ${i >= standing ? "is-down" : ""}`}
            style={{ "--tilt": i % 2 ? "-74deg" : "-96deg" } as React.CSSProperties}
          >
            <rect x={x} y={SHELF_Y - h} width={w} height={h} rx="1.5" fill={color} />
            <rect x={x + 2} y={SHELF_Y - h + 6} width={w - 4} height="3" fill="rgba(255,255,255,.55)" />
            <rect x={x + 2} y={SHELF_Y - 12} width={w - 4} height="2" fill="rgba(255,255,255,.35)" />
          </g>
        ))}

        {/* cat, facing left, walking along as the shelf empties */}
        <g className="bl-cat" style={{ transform: `translateX(${catX}px)` }}>
          {/* The wag animates the path's CSS transform, which would replace an
              SVG transform attribute on the same element — so the offset lives
              on a wrapper group. */}
          <g transform={`translate(0 ${SHELF_Y - 14})`}>
            <path
              className="bl-tail"
              d="M24 -6 C 44 -4, 46 22, 34 34 C 30 38, 26 34, 30 30 C 38 20, 34 6, 22 2 Z"
            />
          </g>
          <ellipse className="bl-fur" cx="8" cy={SHELF_Y - 18} rx="24" ry="18" />
          <path className="bl-stripe" d={`M2 ${SHELF_Y - 34} q6 6 0 12 M12 ${SHELF_Y - 35} q6 7 0 14`} />
          <g className="bl-paw">
            <rect className="bl-fur" x="-30" y={SHELF_Y - 12} width="20" height="9" rx="4.5" />
          </g>
          <g className="bl-head">
            <circle className="bl-fur" cx="-16" cy={SHELF_Y - 40} r="15" />
            <path className="bl-fur" d={`M-29 ${SHELF_Y - 47} l2 -14 l9 9 Z`} />
            <path className="bl-fur" d={`M-12 ${SHELF_Y - 53} l8 -9 l3 13 Z`} />
            <path className="bl-ear-in" d={`M-26 ${SHELF_Y - 49} l1.4 -7 l4.6 4.6 Z`} />
            <ellipse className="bl-eye" cx="-22" cy={SHELF_Y - 41} rx="2" ry="3" />
            <ellipse className="bl-eye" cx="-12" cy={SHELF_Y - 41} rx="2" ry="3" />
            <path className="bl-nose" d={`M-18 ${SHELF_Y - 35} l2.5 0 l-1.25 1.8 Z`} />
          </g>
        </g>
      </svg>

      <p className="book-loader-percent">{percent}%</p>
      <p className="book-loader-title">
        {ru ? "Загружаю" : "Downloading"}
        {title ? ` «${title}»` : "…"}
      </p>
      {total > 0 ? (
        <p className="book-loader-bytes">
          {formatMb(loaded, ru)} {ru ? "из" : "of"} {formatMb(total, ru)}
        </p>
      ) : null}
    </div>
  );
}
