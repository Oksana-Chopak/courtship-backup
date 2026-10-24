import { initialOf, monogramColors } from "@/lib/courtship";

export function Avatar({
  src,
  name,
  seed,
  size = 56,
  className = "",
}: {
  src?: string | null;
  name: string;
  seed: string;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={{ width: size, height: size }}
        className={`object-cover rounded-full border-2 border-[var(--ink)] ${className}`}
      />
    );
  }
  const [bg, fg] = monogramColors(seed);
  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: size * 0.45,
      }}
      className={`rounded-full border-2 border-[var(--ink)] flex items-center justify-center font-display ${className}`}
      aria-label={`${name} avatar`}
    >
      {initialOf(name)}
    </div>
  );
}