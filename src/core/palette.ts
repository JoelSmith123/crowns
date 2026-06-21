/**
 * palette.ts — assign each region a palette color so neighbors look distinct.
 *
 * Pure and theme-agnostic: the caller passes how many palette slots exist and
 * (optionally) each slot's hue, so the assigner can maximize hue distance
 * between adjacent regions. Planarity guarantees ≥4 colors always avoid adjacent
 * repeats; we have ≥16, so assignment never fails.
 */
import type { Rng } from './rng';

/** Region adjacency (4-neighbor): adj[g] = set of regions touching g. */
export function buildRegionAdjacency(n: number, regionOf: ArrayLike<number>): Set<number>[] {
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < regionOf.length; i++) {
    const g = regionOf[i];
    const r = (i / n) | 0;
    const c = i % n;
    if (c + 1 < n) {
      const h = regionOf[i + 1];
      if (h !== g) {
        adj[g].add(h);
        adj[h].add(g);
      }
    }
    if (r + 1 < n) {
      const h = regionOf[i + n];
      if (h !== g) {
        adj[g].add(h);
        adj[h].add(g);
      }
    }
  }
  return adj;
}

/** Hue of a #rrggbb color in degrees [0, 360). */
export function hexToHue(hex: string): number {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Returns regionColors[g] = palette index for region g. Greedy graph coloring
 * by descending degree; among colors not used by colored neighbors, pick the
 * one most hue-distant from neighbors (or random if no hues given), with light
 * jitter for per-puzzle variety.
 */
export function assignRegionColors(
  n: number,
  regionOf: ArrayLike<number>,
  paletteSize: number,
  rng: Rng,
  hues?: number[],
): number[] {
  const adj = buildRegionAdjacency(n, regionOf);
  const order = Array.from({ length: n }, (_, g) => g).sort((a, b) => adj[b].size - adj[a].size);
  const color = new Array<number>(n).fill(-1);

  for (const g of order) {
    const used = new Set<number>();
    for (const h of adj[g]) {
      if (color[h] >= 0) used.add(color[h]);
    }
    const avail: number[] = [];
    for (let k = 0; k < paletteSize; k++) {
      if (!used.has(k)) avail.push(k);
    }
    if (avail.length === 0) {
      color[g] = Math.floor(rng() * paletteSize); // unreachable for our sizes
      continue;
    }
    if (hues) {
      let best = avail[0];
      let bestDist = -1;
      for (const k of avail) {
        let minD = 360;
        for (const h of adj[g]) {
          if (color[h] >= 0) minD = Math.min(minD, hueDist(hues[k], hues[color[h]]));
        }
        const d = (minD === 360 ? 180 : minD) + rng() * 8; // jitter for variety
        if (d > bestDist) {
          bestDist = d;
          best = k;
        }
      }
      color[g] = best;
    } else {
      color[g] = avail[Math.floor(rng() * avail.length)];
    }
  }

  return color;
}
