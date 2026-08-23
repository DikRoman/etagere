import Link from "next/link";

interface Props {
  href?: string;
  className?: string;
  size?: "hero" | "nav";
  link?: boolean;
  /** Show shelf mark icon before the wordmark */
  withMark?: boolean;
}

export function BrandMark({
  href = "/",
  className = "",
  size = "nav",
  link = true,
  withMark = true,
}: Props) {
  const markSize = size === "hero" ? 64 : 28;
  const inner = (
    <span className={`brand-lockup brand-lockup--${size} ${className}`.trim()}>
      {withMark && (
        <span className="brand-mark-icon" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/mark.svg"
            alt=""
            width={markSize}
            height={markSize}
          />
        </span>
      )}
      <span className="brand-latin">Étagère</span>
      <span className="brand-sep" aria-hidden>
        <span className="brand-dot" />
      </span>
      <span className="brand-cyr">Этажер</span>
    </span>
  );

  if (link) {
    return (
      <Link href={href} className="brand-link">
        {inner}
      </Link>
    );
  }
  return inner;
}
