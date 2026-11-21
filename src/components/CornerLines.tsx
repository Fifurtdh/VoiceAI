import React from 'react';

interface CornerLinesProps {
  className?: string;
}

/**
 * Faint topographic contour line-pattern SVG for top corners,
 * adapted from the visual reference with ultra-light stroke opacity.
 */
export const CornerLines: React.FC<CornerLinesProps> = ({ className = '' }) => {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 280 220"
      fill="none"
      className={`pointer-events-none select-none ${className}`}
    >
      <g
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.12"
      >
        <path d="M40 -10 C 65 40, 110 85, 175 110 C 225 129, 255 155, 290 190" />
        <path d="M62 -14 C 86 34, 128 76, 188 99 C 232 116, 260 140, 292 172" />
        <path d="M84 -18 C 106 28, 146 66, 200 88 C 239 104, 265 125, 294 154" />
        <path d="M106 -20 C 127 22, 164 57, 212 77 C 246 91, 270 110, 296 136" />
        <path d="M128 -22 C 148 16, 182 48, 224 66 C 254 79, 275 95, 298 118" />
        <path d="M150 -22 C 169 11, 200 39, 236 55 C 261 66, 280 80, 300 100" />
        <path d="M172 -22 C 190 6, 218 30, 248 44 C 268 53, 284 66, 302 82" />
      </g>
    </svg>
  );
};
