/** 手描き棚の線。作品画像には掛けない。 */

export function HanddrawnBack() {
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M14 18 C 70 12, 140 22, 210 14 C 280 8, 340 20, 386 16 L 388 280 C 330 288, 250 274, 180 284 C 110 292, 50 276, 12 282 Z"
        fill="#f7efdf"
      />
      <path
        d="M18 22 C 90 16, 160 26, 230 18 C 300 12, 350 22, 380 18"
        fill="none"
        stroke="#c4a57a"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M16 28 C 40 70, 22 120, 28 170"
        fill="none"
        stroke="#b08960"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.35"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M382 26 C 360 80, 374 140, 366 190"
        fill="none"
        stroke="#b08960"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.28"
        vectorEffect="non-scaling-stroke"
      />
      <ellipse cx="200" cy="150" rx="150" ry="90" fill="#e7d3b4" opacity="0.28" />
    </svg>
  );
}

export function HanddrawnSide() {
  return (
    <svg viewBox="0 0 36 640" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M8 10 C 14 70, 4 130, 12 200 C 18 270, 5 340, 11 410 C 16 480, 6 550, 12 630 L 27 626 C 22 560, 32 490, 24 420 C 18 350, 30 280, 23 200 C 18 130, 28 70, 24 12 Z"
        fill="#f0e2cc"
        stroke="#8d6a45"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M14 24 C 18 90, 10 160, 16 230 C 20 310, 12 390, 17 470 C 20 540, 14 590, 16 620"
        fill="none"
        stroke="#c4a078"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function HanddrawnPlank() {
  return (
    <svg viewBox="0 0 800 56" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M10 30 C 80 26, 140 36, 220 28 C 300 20, 380 34, 470 26 C 560 18, 650 32, 740 26 C 770 24, 788 28, 792 30 L 788 44 C 720 50, 640 40, 550 48 C 460 54, 370 42, 280 50 C 190 56, 100 44, 16 50 Z"
        fill="#d7b48a"
        opacity="0.35"
      />
      <path
        d="M8 14 C 60 8, 120 18, 190 12 C 270 5, 340 18, 420 11 C 510 4, 590 17, 670 10 C 730 6, 770 14, 792 12 L 790 34 C 730 42, 660 30, 580 38 C 490 46, 400 32, 310 40 C 220 48, 130 34, 50 42 C 28 45, 14 36, 10 34 Z"
        fill="#f3e4cc"
        stroke="#8a6842"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M24 20 C 100 16, 180 24, 270 18 C 360 12, 450 22, 540 16 C 640 10, 720 18, 778 15"
        fill="none"
        stroke="#e7d3b0"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.9"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
