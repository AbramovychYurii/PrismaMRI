/**
 * AuroraSparkles — Sparkles icon with the same rainbow gradient
 * as the AI Findings pill button.
 *
 * The gradient is defined INSIDE the same <svg> element as the paths,
 * so url(#id) references always work — no cross-SVG issues.
 */

let idCounter = 0;

export function AuroraSparkles({
  size = 12,
  strokeWidth = 1.5,
  style,
}: {
  size?: number;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  // Unique id per instance so multiple renders don't conflict
  const id = `aurora-sp-${++idCounter}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff8a3c" />
          <stop offset="25%" stopColor="#ffd24a" />
          <stop offset="50%" stopColor="#7ee0c0" />
          <stop offset="75%" stopColor="#7aa7ff" />
          <stop offset="100%" stopColor="#c79bff" />
        </linearGradient>
      </defs>
      {/* Exact paths from lucide-react v0.460 Sparkles */}
      <path
        stroke={`url(#${id})`}
        d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
      />
      <path stroke={`url(#${id})`} d="M20 3v4" />
      <path stroke={`url(#${id})`} d="M22 5h-4" />
      <path stroke={`url(#${id})`} d="M4 17v2" />
      <path stroke={`url(#${id})`} d="M5 18H3" />
    </svg>
  );
}
