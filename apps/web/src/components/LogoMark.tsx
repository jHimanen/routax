interface LogoMarkProps {
  size?: number;
  variant?: "primary" | "monogram";
  fg?: string;
  accent?: string;
  ring?: boolean;
}

export function LogoMark({
  size = 28,
  variant = "primary",
  fg = "#2b2a26",
  accent = "#c2682a",
  ring = false,
}: LogoMarkProps): React.JSX.Element {
  if (variant === "monogram") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        style={{ display: "block" }}
        aria-hidden="true"
      >
        <rect x="6" y="6" width="188" height="188" rx="32" fill={fg} />
        <path
          d="M44 148 Q72 110 92 116 Q120 124 124 92 Q126 60 156 56"
          stroke="#f8f3e6"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="124" cy="92" r="10" fill={accent} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      style={{ display: "block" }}
      aria-hidden="true"
    >
      {ring && (
        <circle
          cx="100"
          cy="100"
          r="92"
          stroke={fg}
          strokeWidth="2"
          opacity=".22"
        />
      )}
      <path
        d="M44 148 Q72 110 92 116 Q120 124 124 92 Q126 60 156 56"
        stroke={accent}
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="124" cy="92" r="8" fill={fg} />
    </svg>
  );
}
