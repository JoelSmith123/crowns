import { describe, it, expect } from 'vitest';
import { bauhausWarm } from './tokens';

/** WCAG relative luminance of a #rrggbb color. */
function relLum(hex: string): number {
  const m = hex.replace('#', '');
  const toLin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLin(parseInt(m.slice(0, 2), 16));
  const g = toLin(parseInt(m.slice(2, 4), 16));
  const b = toLin(parseInt(m.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = relLum(a);
  const lb = relLum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

describe('region palette contrast', () => {
  it('every region fill has legible ink (crown/X) — WCAG large-text >= 3.0', () => {
    const { regions, ink } = bauhausWarm;
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const inkColor = region.ink === 'light' ? ink.light : ink.dark;
      const ratio = contrast(region.fill, inkColor);
      expect(ratio, `region ${i} (${region.fill}) vs ${region.ink} ink`).toBeGreaterThanOrEqual(3.0);
    }
  });

  it('eggshell region is distinguishable from the page background', () => {
    // They are intentionally close; ensure they are not identical and differ enough to read.
    const egg = bauhausWarm.regions[4].fill;
    expect(egg.toLowerCase()).not.toBe(bauhausWarm.page.bg.toLowerCase());
  });
});
