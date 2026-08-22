// Shared design tokens for all store-detail components.
// Mirror the palette used in the home screen so the two surfaces feel unified.

export const C = {
  accent:      '#D63527',
  accentDeep:  '#8E1F15',
  accentSoft:  '#FEF2EF',
  bg:          '#F2F2F7',
  surface:     '#FFFFFF',
  border:      '#E8E8ED',
  divider:     '#F0F0F5',
  primary:     '#0D0D0D',
  secondary:   '#6C6C6C',
  muted:       '#AEAEB2',
  success:     '#34C759',
  successBg:   '#EDFAF2',
  successText: '#1A7A35',
  danger:      '#FF3B30',
  dangerBg:    '#FEF0EE',
  dangerText:  '#C0261A',
  skeleton:    '#E5E5EA',
  warning:     '#FF9500',
  warningBg:   '#FFF5E0',
  warningText: '#92540A',
} as const;

// No photo banner — header is a plain text block. This is how far the user
// scrolls past it before the top-bar title fades in.
export const HEADER_FADE_OFFSET = 96;

// Size of the small square map thumbnail beside the store name — a compact
// preview, not a banner.
export const MAP_THUMB_SIZE = 92;

export function formatPrice(price: number): string {
  return price % 1 === 0 ? `₹${price}` : `₹${price.toFixed(2)}`;
}

