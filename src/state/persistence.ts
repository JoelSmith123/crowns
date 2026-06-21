/**
 * persistence.ts — localStorage for SETTINGS ONLY (no board state, no scores).
 * Wrapped in try/catch so private-mode / disabled storage degrades to defaults.
 */

export interface Settings {
  cursorMode: 'crown' | 'block';
  autoBlock: boolean;
  /** Reserved for a future theme swap; no in-page toggle in v1. */
  themeName: string;
}

const KEY = 'crowns.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  cursorMode: 'block',
  autoBlock: true,
  themeName: 'bauhaus-warm',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      cursorMode: p.cursorMode === 'block' ? 'block' : 'crown',
      autoBlock: p.autoBlock !== false, // default true
      themeName: typeof p.themeName === 'string' ? p.themeName : DEFAULT_SETTINGS.themeName,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — keep settings in memory only */
  }
}
