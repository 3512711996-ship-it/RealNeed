import type { SVGProps } from "react";

export function RealNeedLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false" {...props}>
      <g stroke="currentColor" strokeLinecap="round">
        <path d="M50 16a34 34 0 0 1 29 17" strokeWidth="4" opacity=".3" />
        <path d="M83 50a34 34 0 0 1-17 29" strokeWidth="4" opacity=".78" />
        <path d="M50 84a34 34 0 0 1-29-17" strokeWidth="4" opacity=".42" />
        <path d="M17 50a34 34 0 0 1 17-29" strokeWidth="4" opacity=".78" />
        <path d="M32 37c10 5 17 12 23 24" strokeWidth="3" opacity=".55" />
        <path d="M66 34c-6 9-8 18-7 27" strokeWidth="3" opacity=".45" />
        <path d="M35 68c8-4 15-5 24-7" strokeWidth="3" />
      </g>
      <circle cx="32" cy="37" r="5.5" fill="currentColor" />
      <circle cx="66" cy="34" r="5" fill="currentColor" />
      <circle cx="35" cy="68" r="4.5" fill="currentColor" opacity=".62" />
      <circle cx="59" cy="61" r="8.5" fill="currentColor" />
    </svg>
  );
}
