export const palette = {
  // Existing brand primary (already used widely in the app)
  brandBrown: '#5e3f2d',

  // From the image you provided
  warmSurface: '#cdb094',
  mutedBrown: '#957e69',
  softGreen: '#93b5a5',
  // Updated per your latest request (the green you sent): 0x406154
  successGreen: '#406154',
} as const;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = String(hex || '').replace('#', '').trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

export function alpha(hex: string, a: number) {
  const rgb = hexToRgb(hex);
  const clamped = Math.max(0, Math.min(1, a));
  if (!rgb) return hex;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${clamped})`;
}

export const colors = {
  // Semantic roles
  primary: palette.brandBrown,
  primaryMuted: palette.mutedBrown,

  success: palette.successGreen,
  successMuted: palette.softGreen,

  surfaceWarm: palette.warmSurface,

  // Neutrals
  white: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
} as const;

