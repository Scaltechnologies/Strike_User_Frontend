// Canonical per-card visual identity — the ONE place this mapping lives in
// the User App. Every screen that shows a card (My Cards, Card Details,
// Membership, Vendor Available Cards, and the smaller preview/reveal spots)
// imports getCardColorTheme from here rather than keeping its own copy, so
// the same card always renders the same color everywhere.
//
// CARD_FAMILIES is the approved premium Strike card palette — burnt orange,
// terracotta, garnet, burgundy, espresso, antique gold, olive, teal. There
// is no backend color field, so the assignment mechanism (hash the card
// name into this fixed list) is the same deterministic approach already
// used throughout this codebase — a given card name always lands on the
// same entry. Text/decoration are derived from each family's own gradient
// (never shifted to an unrelated hue), including automatic light/dark text
// selection so a lighter entry like Antique Gold stays readable.

const CARD_FAMILIES: readonly (readonly [string, string])[] = [
  ['#C65A22', '#7E2D18'], // burnt orange
  ['#A9472D', '#64251D'], // deep terracotta
  ['#9D3045', '#571827'], // garnet red
  ['#7F2B3D', '#421722'], // wine / burgundy
  ['#634036', '#32201C'], // roasted espresso
  ['#B4862C', '#634613'], // antique gold
  ['#64602F', '#33331D'], // deep olive
  ['#2D686C', '#183B3E'], // deep teal
] as const;

// Subtle warm highlight overlay, layered on top of every card's own
// gradient — the "premium shine" (never metallic/glittery), same two-stop
// treatment everywhere so every card representation reads as one family.
export const CARD_SHINE = ['rgba(255,225,190,0.10)', 'rgba(255,255,255,0)'] as const;

// Shared card footprint — every card component (My Cards, Membership, Card
// Details, Vendor Available Cards) targets this same radius/height so the
// same card reads as the same size everywhere, regardless of screen.
export const CARD_RADIUS = 20;
export const CARD_HEIGHT = 172;

export interface CardColorTheme {
  gradient: readonly [string, string];
  /** Progress-bar / accent fill — legible against this card's own track. */
  glow: string;
  /** True when the base color is light enough to need dark text/decor. */
  isLight: boolean;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Decorative circle tints, derived from this card's own color. */
  decor1: string;
  decor2: string;
  chipBg: string;
  /** Progress-bar track background, legible under `glow`. */
  trackBg: string;
}

function hashName(name: string): number {
  return name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}

// Blend toward black — a hue-tinted "ink" for text/decoration on light cards.
function darken(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}

// Blend toward white — a legible highlight within the same hue.
function lighten(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Standard perceived-luminance check (0 = black, 1 = white) to decide
// whether a base color needs dark or light text/decoration on top of it.
// Threshold sits at 0.5 rather than the more common 0.55 specifically
// because Antique Gold's base (~0.54) reads as too warm/bright for white
// text in practice even though it's only moderately light by the numbers.
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Fallback only for the rare card with no name at all — never a stand-in
// for a missing backend value, just enough to keep the UI from breaking.
const FALLBACK_NAME = 'Strike';

export function getCardColorTheme(cardName: string | null | undefined): CardColorTheme {
  const key = cardName && cardName.length > 0 ? cardName : FALLBACK_NAME;
  const [base, deep] = CARD_FAMILIES[hashName(key) % CARD_FAMILIES.length];
  const isLight = relativeLuminance(base) > 0.5;

  if (isLight) {
    const ink = darken(base, 0.8); // near-black, tinted with this card's own hue
    return {
      gradient: [base, deep],
      glow: darken(base, 0.35),
      isLight,
      textPrimary: ink,
      textSecondary: rgba(ink, 0.62),
      textMuted: rgba(ink, 0.42),
      decor1: rgba(ink, 0.08),
      decor2: rgba(ink, 0.05),
      chipBg: rgba(ink, 0.10),
      trackBg: rgba(ink, 0.14),
    };
  }

  return {
    gradient: [base, deep],
    glow: lighten(base, 0.45),
    isLight,
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255,255,255,0.58)',
    textMuted: 'rgba(255,255,255,0.42)',
    decor1: 'rgba(255,255,255,0.07)',
    decor2: 'rgba(255,255,255,0.045)',
    chipBg: 'rgba(255,255,255,0.13)',
    trackBg: 'rgba(255,255,255,0.16)',
  };
}
