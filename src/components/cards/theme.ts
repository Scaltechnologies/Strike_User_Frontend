// Design tokens for card discovery components.
// Mirror the store/theme.ts palette so surfaces feel unified.

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

// Premium dark card backgrounds — deterministic from card name hash.
const CARD_DARKS = [
  '#1C1C2E',
  '#0A2342',
  '#1A1A2E',
  '#0D1B2A',
  '#1B1B2F',
  '#0F2027',
  '#16213E',
] as const;

export function cardBgColor(name: string): string {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % CARD_DARKS.length;
  return CARD_DARKS[idx];
}

export function formatCardPrice(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}
