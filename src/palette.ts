/**
 * Colour resolution.
 *
 * Themes are the other half of the "worked once, then stopped working" problem:
 * a palette tuned for a dark theme is invisible on a light one and washed out in
 * high contrast. Indentyl resolves a palette per theme kind and rebuilds its
 * decoration types when the theme changes.
 */

export type ThemeKind = 'light' | 'dark' | 'highContrast' | 'highContrastLight';

export interface PaletteInput {
  colors: string[];
  colorsLight: string[];
  colorsDark: string[];
  colorsHighContrast: string[];
  errorColor: string;
  tabmixColor: string;
  opacity: number;
}

export interface Palette {
  levels: string[];
  error: string;
  tabmix: string;
}

const FALLBACK = [
  'rgba(255,255,64,0.07)',
  'rgba(127,255,127,0.07)',
  'rgba(255,127,255,0.07)',
  'rgba(79,236,236,0.07)',
];

/**
 * Multiply a colour's alpha channel.
 *
 * Handles `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()`.
 * Anything else — a named colour, a VS Code theme colour id — is returned
 * unchanged, because rewriting something we do not understand is worse than
 * leaving the user's own value alone.
 */
export function applyOpacity(color: string, opacity: number): string {
  const factor = Math.min(1, Math.max(0, opacity));
  if (factor === 1) {
    return color;
  }
  const value = color.trim();

  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(value);
  if (hex) {
    const digits = hex[1]!;
    let r: number, g: number, b: number, a = 1;
    if (digits.length === 3 || digits.length === 4) {
      r = parseInt(digits[0]! + digits[0]!, 16);
      g = parseInt(digits[1]! + digits[1]!, 16);
      b = parseInt(digits[2]! + digits[2]!, 16);
      if (digits.length === 4) {
        a = parseInt(digits[3]! + digits[3]!, 16) / 255;
      }
    } else if (digits.length === 6 || digits.length === 8) {
      r = parseInt(digits.slice(0, 2), 16);
      g = parseInt(digits.slice(2, 4), 16);
      b = parseInt(digits.slice(4, 6), 16);
      if (digits.length === 8) {
        a = parseInt(digits.slice(6, 8), 16) / 255;
      }
    } else {
      return value;
    }
    return `rgba(${r},${g},${b},${round(a * factor)})`;
  }

  const rgb = /^rgba?\(\s*([^)]+)\)$/i.exec(value);
  if (rgb) {
    const parts = rgb[1]!.split(/[,/]/).map((part) => part.trim()).filter((part) => part.length > 0);
    if (parts.length === 3 || parts.length === 4) {
      const alpha = parts.length === 4 ? Number.parseFloat(parts[3]!) : 1;
      if (Number.isFinite(alpha)) {
        return `rgba(${parts[0]},${parts[1]},${parts[2]},${round(alpha * factor)})`;
      }
    }
  }
  return value;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The palette for a theme kind, with the generic list as the fallback. */
export function resolvePalette(input: PaletteInput, theme: ThemeKind): Palette {
  const specific =
    theme === 'light' ? input.colorsLight
    : theme === 'dark' ? input.colorsDark
    : input.colorsHighContrast;

  const chosen =
    specific.length > 0 ? specific
    : input.colors.length > 0 ? input.colors
    : FALLBACK;

  return {
    levels: chosen.map((color) => applyOpacity(color, input.opacity)),
    error: applyOpacity(input.errorColor, input.opacity),
    tabmix: applyOpacity(input.tabmixColor, input.opacity),
  };
}

/** Compile the ignore patterns, dropping any that are not valid regular expressions. */
export function compilePatterns(patterns: readonly string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (const pattern of patterns) {
    try {
      compiled.push(new RegExp(pattern));
    } catch {
      // An invalid regex in settings must not take the extension down with it.
    }
  }
  return compiled;
}
