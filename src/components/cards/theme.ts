// Design tokens for card discovery components.
// Mirror the store/theme.ts palette so surfaces feel unified.
//
// Per-card color identity lives in @/utils/cardColorTheme — the single
// source of truth shared by Card Details, Membership and Vendor Available
// Cards, so the same card always renders the same color everywhere.

export const CC = {
  accent:      '#D63527',
  accentDeep:  '#A81F14',
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
  // Status tokens — shared across payment/redemption status UI (history.tsx and others had
  // each independently duplicated these; centralizing here so new status UI doesn't add a
  // fourth copy).
  success:     '#34C759',
  successSoft: '#EDFAF2',
  successDark: '#1A7A35',
  danger:      '#FF3B30',
  dangerSoft:  '#FEF0EE',
  dangerDark:  '#C0261A',
  warning:     '#FF9500',
  warningSoft: '#FFF5E0',
  warningDark: '#7A4500',
  info:        '#2563EB',
  infoSoft:    '#EEF4FF',
} as const;

export function formatCardPrice(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}
