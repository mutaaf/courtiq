/**
 * WCAG 2.1 color contrast utilities
 *
 * Implements the contrast ratio algorithm from:
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *
 * WCAG AA thresholds:
 *   - 4.5:1  — normal text (< 18pt, or < 14pt bold)
 *   - 3.0:1  — large text (≥ 18pt, or ≥ 14pt bold) and UI components
 *   - 3.0:1  — non-text contrast (icons, focus indicators, form borders)
 */

/** Parse a 6-digit hex color to [r, g, b] in 0–255 range. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) throw new Error(`Invalid hex color: ${hex}`);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Linearise a single sRGB channel value (0–255).
 * Applies the IEC 61966-2-1 transfer function inverse.
 */
export function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Compute the WCAG relative luminance of a hex color.
 * Returns a value in [0, 1] where 0 = black and 1 = white.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/**
 * Compute the WCAG contrast ratio between two hex colors.
 * Result is in [1, 21] — higher is better.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Round a ratio to 2 decimal places (matches browser devtools display). */
export function roundRatio(ratio: number): number {
  return Math.round(ratio * 100) / 100;
}

/** WCAG AA: normal text requires 4.5:1 */
export function passesAA(hex1: string, hex2: string): boolean {
  return contrastRatio(hex1, hex2) >= 4.5;
}

/** WCAG AA: large text (18pt+ / 14pt+ bold) and UI components require 3:1 */
export function passesAALarge(hex1: string, hex2: string): boolean {
  return contrastRatio(hex1, hex2) >= 3.0;
}

/** WCAG AAA: normal text requires 7:1 */
export function passesAAA(hex1: string, hex2: string): boolean {
  return contrastRatio(hex1, hex2) >= 7.0;
}

// ─── Design token palette ───────────────────────────────────────────────────
// Tailwind zinc scale used in the dark theme (exact CSS variables / Tailwind values)
export const PALETTE = {
  // Zinc scale
  zinc950: '#09090b',   // bg-zinc-950  — page background (dark)
  zinc900: '#18181b',   // bg-zinc-900  — card surfaces
  zinc800: '#27272a',   // bg-zinc-800  — secondary buttons, hover states
  zinc700: '#3f3f46',   // bg-zinc-700  — hover, borders
  zinc600: '#52525b',   // border-zinc-600 / muted text (light mode)
  zinc500: '#71717a',   // text-zinc-500 — placeholder, subtle text
  zinc400: '#a1a1aa',   // text-zinc-400 — muted text (dark theme)
  zinc300: '#d4d4d8',   // text-zinc-300 — ghost button text
  zinc200: '#e4e4e7',   // text-zinc-200 — secondary text (dark theme)
  zinc100: '#f4f4f5',   // text-zinc-100 — primary text (dark theme)
  white:   '#ffffff',
  black:   '#000000',

  // Orange accent
  orange500: '#f97316', // primary CTA / accent color
  orange600: '#ea580c', // hover state for orange buttons

  // Semantic colors
  red600:     '#dc2626', // destructive button bg
  emerald500: '#10b981', // success / health score
  blue500:    '#3b82f6', // info
  amber500:   '#f59e0b', // warning
  purple500:  '#8b5cf6', // special / violet
  teal500:    '#14b8a6', // teal

  // Light mode backgrounds
  white100:   '#ffffff', // light mode page bg
  zinc100Bg:  '#f4f4f5', // light mode card bg

  // High-contrast overrides
  hcBg:       '#000000', // high-contrast page bg
  hcSurface:  '#111111', // high-contrast card
  hcMuted:    '#cccccc', // high-contrast muted text
} as const;
