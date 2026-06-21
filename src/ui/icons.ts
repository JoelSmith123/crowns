/**
 * icons.ts — inline SVG glyph strings. All use `currentColor` so the cell's
 * contrast-aware ink (or a control's text color) drives the fill/stroke.
 */

export const crownSvg = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.6 7.5 L7 12 L12 4.6 L17 12 L21.4 7.5 L19.2 18 L4.8 18 Z"/><rect x="4.8" y="19.3" width="14.4" height="2.5"/></svg>`;

export const xSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M7 7 L17 17 M17 7 L7 17"/></svg>`;

export const undoSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7 L4 11 L9 15"/><path d="M4 11 H14 a5 5 0 0 1 5 5 v1"/></svg>`;

export const hintSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18 h6"/><path d="M10 21 h4"/><path d="M12 3 a6 6 0 0 0 -4 10.5 c0.8 0.8 1 1.5 1 2.5 h6 c0-1 0.2-1.7 1-2.5 A6 6 0 0 0 12 3 Z"/></svg>`;

/** The row/column auto-block feature: a line sweeping across with X's. */
export const featureSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9 H21"/><path d="M5.5 13 l3 3 M8.5 13 l-3 3" stroke-width="1.6"/><path d="M11 13 l3 3 M14 13 l-3 3" stroke-width="1.6"/><path d="M16.5 13 l3 3 M19.5 13 l-3 3" stroke-width="1.6"/></svg>`;
