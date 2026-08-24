// Design tokens for card discovery components.
// Mirror the store/theme.ts palette so surfaces feel unified.
//
// Per-card color identity lives in @/utils/cardColorTheme — the single
// source of truth shared by Card Details, Membership and Vendor Available
// Cards, so the same card always renders the same color everywhere.

export const CC = {
  accent:      '#D63527',
  accentSoft:  '#FEF2EF',
  bg:          '#F2F2F7',
  surface:     '#FFFFFF',
  border:      '#E8E8ED',
  primary:     '#0D0D0D',
  secondary:   '#6C6C6C',
  muted:       '#AEAEB2',
  skeleton:    '#E5E5EA',
  gold:        '#C9973A',
  goldSoft:    '#FDF6E8',
} as const;

export function formatCardPrice(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}
