// Shared design tokens for all store-detail components.
// Mirror the palette used in the home screen so the two surfaces feel unified.

export const C = {
  accent:      '#D63527',
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

export const BANNER_HEIGHT = 200;

// Fallback banner colours derived deterministically from the store name.
const FALLBACK_PALETTE = [
  '#E8EDF5', '#E5EFF5', '#EDF5E8',
  '#F5EEE8', '#EEE8F5', '#E8F2F5', '#F5EDE8',
] as const;

export function storeFallbackColor(name: string): string {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % FALLBACK_PALETTE.length;
  return FALLBACK_PALETTE[idx];
}

export function formatPrice(price: number): string {
  return price % 1 === 0 ? `₹${price}` : `₹${price.toFixed(2)}`;
}

