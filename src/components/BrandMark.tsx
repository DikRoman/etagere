import Link from "next/link";

interface Props {
  href?: string;
  className?: string;
  size?: "hero" | "nav";
  link?: boolean;
}

export function BrandMark({
  href = "/",
  className = "",
  size = "nav",
  link = true,
}: Props) {
  const inner = (
    <span className={`brand-lockup brand-lockup--${size} ${className}`.trim()}>
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
