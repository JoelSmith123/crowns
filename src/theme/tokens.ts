/**
 * tokens.ts — the SINGLE source of truth for every style value in Crowns.
 *
 * Nothing else in the codebase contains a color literal or raw style magic
 * number; everything reads from a Theme, which `applyTheme` flattens to CSS
 * custom properties on :root. Swapping the whole look in the future is just
 * `applyTheme(someOtherTheme)` — no other code changes.
 */

/** A region fill plus which ink (light/dark) keeps crowns & X marks legible on it. */
export interface RegionColor {
  fill: string;
  ink: 'light' | 'dark';
}

export interface Theme {
  name: string;
  page: {
    /** App background — the negative space. */
    bg: string;
    text: string;
    /** Secondary text (captions, hints). */
    muted: string;
  };
  board: {
    border: string;
    borderWidth: string;
    /** Color shown in the gaps between cells == the grid lines. */
    grid: string;
    gridWidth: string;
    radius: string;
  };
  /** Gold highlight used for region hover, hint glow, feature glow and the win sweep. */
  accent: string;
  /** Crown / X colors, picked per region by luminance for contrast. */
  ink: {
    light: string;
    dark: string;
  };
  /** Opacity of X marks so they read as soft, same-hue tints rather than harsh ink. */
  xOpacity: number;
  /** Subtle error ring on crowns that currently break a rule. */
  conflict: string;
  control: {
    bg: string;
    bgHover: string;
    border: string;
    text: string;
    /** Active/selected control (e.g. the engaged half of the mode switch). */
    activeBg: string;
    activeText: string;
    radius: string;
    /** Edge length of the small square-ish controls. */
    size: string;
    gap: string;
  };
  font: {
    ui: string;
  };
  /**
   * Region palette — vivid, warm, mutually distinguishable Bauhaus hues.
   * Needs at least 15 entries (max board is 15x15 => 15 regions). 16 here gives
   * the color assigner one spare so adjacent regions can always differ in hue.
   */
  regions: RegionColor[];
}

export const bauhausWarm: Theme = {
  name: 'bauhaus-warm',
  page: {
    bg: '#ECE7D9',
    text: '#1B1B1B',
    muted: '#6B655A',
  },
  board: {
    border: '#1B1B1B',
    borderWidth: '6px',
    grid: '#1B1B1B',
    gridWidth: '2px',
    radius: '2px',
  },
  accent: '#F2C200',
  ink: {
    light: '#F7F4EC',
    dark: '#161616',
  },
  xOpacity: 0.5,
  conflict: '#D8352A',
  control: {
    bg: '#F4F0E6',
    bgHover: '#E7E1D0',
    border: '#1B1B1B',
    text: '#1B1B1B',
    activeBg: '#1B1B1B',
    activeText: '#F4F0E6',
    radius: '2px',
    size: '44px',
    gap: '10px',
  },
  font: {
    ui: "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', system-ui, sans-serif",
  },
  regions: [
    { fill: '#2D5BD0', ink: 'light' }, //  0 cobalt
    { fill: '#F2B100', ink: 'dark' }, //  1 amber
    { fill: '#D8352A', ink: 'light' }, //  2 vivid red
    { fill: '#2B2B2B', ink: 'light' }, //  3 charcoal
    { fill: '#DBD2B8', ink: 'dark' }, //  4 eggshell (cooler/darker than page bg)
    { fill: '#E8772E', ink: 'dark' }, //  5 orange
    { fill: '#6E3FA3', ink: 'light' }, //  6 purple
    { fill: '#2E8B57', ink: 'light' }, //  7 teal-green
    { fill: '#C9A227', ink: 'dark' }, //  8 ochre / mustard
    { fill: '#B5471F', ink: 'light' }, //  9 rust / terracotta
    { fill: '#6FA8DC', ink: 'dark' }, // 10 periwinkle / sky
    { fill: '#6B7A2E', ink: 'light' }, // 11 olive
    { fill: '#B5277B', ink: 'light' }, // 12 raspberry / magenta
    { fill: '#4C5B9A', ink: 'light' }, // 13 slate-blue
    { fill: '#B79A78', ink: 'dark' }, // 14 clay / taupe
    { fill: '#1F6F4A', ink: 'light' }, // 15 forest
  ],
};

/** The currently active theme. (No in-page toggle in v1; this is the future swap point.) */
export const activeTheme: Theme = bauhausWarm;
