/**
 * WCAG AA Color Contrast Verification
 *
 * Verifies that all key color pairs used throughout the SportsIQ dark-theme UI
 * meet WCAG 2.1 Success Criterion 1.4.3 (Contrast Minimum, Level AA):
 *   - 4.5:1  — normal text
 *   - 3.0:1  — large text (≥18pt / ≥14pt bold) and interactive components
 *
 * Also validates the contrast utility functions themselves.
 *
 * Reference palette lives in src/lib/color-contrast.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  linearise,
  relativeLuminance,
  contrastRatio,
  roundRatio,
  passesAA,
  passesAALarge,
  passesAAA,
  PALETTE as P,
} from '@/lib/color-contrast';

// ─── Utility function tests ──────────────────────────────────────────────────

describe('hexToRgb', () => {
  it('parses white', () => expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]));
  it('parses black', () => expect(hexToRgb('#000000')).toEqual([0, 0, 0]));
  it('parses orange-500', () => expect(hexToRgb('#f97316')).toEqual([249, 115, 22]));
  it('parses zinc-950 (near-black)', () => expect(hexToRgb('#09090b')).toEqual([9, 9, 11]));
  it('throws on invalid length', () => expect(() => hexToRgb('#fff')).toThrow());
});

describe('linearise', () => {
  it('maps 0 → 0', () => expect(linearise(0)).toBe(0));
  it('maps 255 → 1', () => expect(linearise(255)).toBeCloseTo(1, 4));
  // Below the 0.04045 threshold (≤ 10 out of 255), use linear division
  it('uses linear path for low values', () => {
    expect(linearise(10)).toBeCloseTo(10 / 255 / 12.92, 6);
  });
  // Above threshold, use gamma expansion
  it('uses gamma path for mid values', () => {
    const c = 128 / 255;
    expect(linearise(128)).toBeCloseTo(Math.pow((c + 0.055) / 1.055, 2.4), 6);
  });
});

describe('relativeLuminance', () => {
  it('white has luminance 1.0', () => expect(relativeLuminance('#ffffff')).toBeCloseTo(1.0, 4));
  it('black has luminance 0.0', () => expect(relativeLuminance('#000000')).toBeCloseTo(0.0, 4));
  it('orange-500 luminance is ~0.324', () =>
    expect(relativeLuminance('#f97316')).toBeCloseTo(0.324, 2));
  it('zinc-950 luminance is near-zero', () =>
    expect(relativeLuminance('#09090b')).toBeCloseTo(0.003, 3));
  it('zinc-100 luminance is near-white', () =>
    expect(relativeLuminance('#f4f4f5')).toBeGreaterThan(0.9));
});

describe('contrastRatio', () => {
  it('black on white is 21:1', () =>
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0));
  it('same color has ratio 1:1', () =>
    expect(contrastRatio('#f97316', '#f97316')).toBeCloseTo(1, 2));
  it('is commutative (order of args does not matter)', () => {
    const ab = contrastRatio('#f97316', '#09090b');
    const ba = contrastRatio('#09090b', '#f97316');
    expect(ab).toBeCloseTo(ba, 6);
  });
  it('result is always ≥ 1', () => {
    expect(contrastRatio('#18181b', '#27272a')).toBeGreaterThanOrEqual(1);
  });
});

describe('roundRatio', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundRatio(4.5678)).toBe(4.57);
    expect(roundRatio(7.1)).toBe(7.1);
    expect(roundRatio(21)).toBe(21);
  });
});

// ─── WCAG AA: dark theme text pairs ─────────────────────────────────────────

describe('Dark theme — primary text on backgrounds', () => {
  it('zinc-100 text on zinc-950 bg passes AA normal (≥4.5:1)', () =>
    expect(passesAA(P.zinc100, P.zinc950)).toBe(true));

  it('zinc-100 text on zinc-900 bg passes AA normal', () =>
    expect(passesAA(P.zinc100, P.zinc900)).toBe(true));

  it('zinc-200 text on zinc-950 bg passes AA normal', () =>
    expect(passesAA(P.zinc200, P.zinc950)).toBe(true));

  it('zinc-300 text on zinc-950 bg passes AA normal', () =>
    expect(passesAA(P.zinc300, P.zinc950)).toBe(true));

  it('zinc-300 text on zinc-900 bg passes AA normal', () =>
    expect(passesAA(P.zinc300, P.zinc900)).toBe(true));
});

describe('Dark theme — muted text on backgrounds', () => {
  it('zinc-400 (muted) on zinc-950 passes AA normal', () =>
    expect(passesAA(P.zinc400, P.zinc950)).toBe(true));

  it('zinc-400 (muted) on zinc-900 passes AA normal', () =>
    expect(passesAA(P.zinc400, P.zinc900)).toBe(true));

  it('zinc-500 on zinc-950 passes AA large/component (≥3:1)', () =>
    expect(passesAALarge(P.zinc500, P.zinc950)).toBe(true));

  it('zinc-500 contrast ratio on zinc-950 is known value', () => {
    expect(roundRatio(contrastRatio(P.zinc500, P.zinc950))).toBeGreaterThan(3.0);
  });
});

// ─── Orange accent color ─────────────────────────────────────────────────────

describe('Orange accent — text usage on dark backgrounds', () => {
  it('orange-500 text on zinc-950 bg passes AA normal', () =>
    expect(passesAA(P.orange500, P.zinc950)).toBe(true));

  it('orange-500 text on zinc-900 bg passes AA normal', () =>
    expect(passesAA(P.orange500, P.zinc900)).toBe(true));

  it('orange-500 text on zinc-950 passes AAA (≥7:1)', () =>
    expect(passesAAA(P.orange500, P.zinc950)).toBe(true));
});

describe('Orange button — primary CTA (bg-orange-500, text-zinc-950)', () => {
  it('zinc-950 on orange-500 passes AA normal (button variant=default fix)', () =>
    expect(passesAA(P.zinc950, P.orange500)).toBe(true));

  it('zinc-950 on orange-500 passes AAA', () =>
    expect(passesAAA(P.zinc950, P.orange500)).toBe(true));

  it('zinc-950 on orange-500 ratio is ≥7:1', () =>
    expect(contrastRatio(P.zinc950, P.orange500)).toBeGreaterThanOrEqual(7.0));

  it('WHITE on orange-500 fails AA (documents the failing case we fixed)', () =>
    expect(passesAA(P.white, P.orange500)).toBe(false));

  it('WHITE on orange-500 fails large-text AA too (ratio < 3)', () =>
    expect(passesAALarge(P.white, P.orange500)).toBe(false));

  it('zinc-950 on orange-600 (hover) passes AA normal', () =>
    expect(passesAA(P.zinc950, P.orange600)).toBe(true));
});

// ─── Button variants ─────────────────────────────────────────────────────────

describe('Button variants — all text/bg combos', () => {
  it('destructive: white on red-600 passes AA normal', () =>
    expect(passesAA(P.white, P.red600)).toBe(true));

  it('outline: zinc-100 on zinc-950 passes AA normal', () =>
    expect(passesAA(P.zinc100, P.zinc950)).toBe(true));

  it('secondary: zinc-100 on zinc-800 passes AA normal', () =>
    expect(passesAA(P.zinc100, P.zinc800)).toBe(true));

  it('ghost: zinc-300 on zinc-950 passes AA normal', () =>
    expect(passesAA(P.zinc300, P.zinc950)).toBe(true));

  it('link: orange-500 on zinc-950 passes AA normal', () =>
    expect(passesAA(P.orange500, P.zinc950)).toBe(true));
});

// ─── Light mode ──────────────────────────────────────────────────────────────

describe('Light mode — text on backgrounds', () => {
  it('zinc-950 on white passes AAA', () =>
    expect(passesAAA(P.zinc950, P.white100)).toBe(true));

  it('zinc-600 (#52525b) on white passes AA normal', () => {
    expect(passesAA('#52525b', P.white100)).toBe(true);
  });

  it('zinc-600 (#52525b) on zinc-100 card bg passes AA normal', () => {
    expect(passesAA('#52525b', P.zinc100Bg)).toBe(true);
  });

  // orange-500 on white is only 2.8:1 — fails. Use orange-700 (#c2410c) for light-mode text.
  it('orange-500 on white FAILS large-text AA (documents limitation)', () =>
    expect(passesAALarge(P.orange500, P.white100)).toBe(false));

  it('orange-700 (#c2410c) on white passes AA normal (light-mode safe orange)', () =>
    expect(passesAA('#c2410c', P.white100)).toBe(true));
});

// ─── High contrast mode ──────────────────────────────────────────────────────

describe('High contrast mode — all pairs pass AAA', () => {
  it('white on hcBg (#000) is 21:1', () =>
    expect(contrastRatio(P.white, P.hcBg)).toBeCloseTo(21, 0));

  it('hcMuted (#ccc) on hcBg (#000) passes AA normal', () =>
    expect(passesAA(P.hcMuted, P.hcBg)).toBe(true));

  it('hcMuted (#ccc) on hcSurface (#111) passes AA normal', () =>
    expect(passesAA(P.hcMuted, P.hcSurface)).toBe(true));

  it('orange-500 on hcBg (#000) passes AAA', () =>
    expect(passesAAA(P.orange500, P.hcBg)).toBe(true));
});

// ─── Focus indicator ─────────────────────────────────────────────────────────

describe('Focus ring — orange-500 outline on zinc-950 page bg', () => {
  it('orange-500 focus ring on zinc-950 bg meets non-text contrast (≥3:1)', () =>
    expect(passesAALarge(P.orange500, P.zinc950)).toBe(true));

  // orange-500 on white is 2.8:1 — fails. Light mode uses orange-700 (#c2410c) per globals.css fix.
  it('orange-700 focus ring on white bg meets non-text contrast (light mode fix)', () =>
    expect(passesAALarge('#c2410c', P.white100)).toBe(true));
});

// ─── Skip-to-content link ────────────────────────────────────────────────────

describe('Skip-to-content link (bg-orange-500, color-zinc-950)', () => {
  it('zinc-950 text on orange-500 passes AA normal', () =>
    expect(passesAA(P.zinc950, P.orange500)).toBe(true));
});

// ─── Semantic status colors on dark backgrounds ───────────────────────────────

describe('Semantic colors on zinc-950 background', () => {
  it('emerald-500 passes AA large/component', () =>
    expect(passesAALarge(P.emerald500, P.zinc950)).toBe(true));

  it('amber-500 passes AA large/component', () =>
    expect(passesAALarge(P.amber500, P.zinc950)).toBe(true));
});
