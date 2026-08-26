// Thin, crash-safe wrapper around expo-haptics — the one place haptic
// feedback is triggered from, so every screen uses the same light-touch
// vocabulary instead of picking its own intensity. Haptics can throw on
// devices/simulators without a vibration engine, so every call is fired
// and forgotten.

import * as Haptics from 'expo-haptics';

/** Routine taps — nav items, list rows, card presses. */
export function tapLight(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Primary CTAs — Redeem Benefits, Activate Membership, confirming a purchase. */
export function tapMedium(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** A selection changing — segmented controls, tab switches, filter chips. */
export function tapSelect(): void {
  void Haptics.selectionAsync().catch(() => {});
}

/** An action just succeeded — redemption approved, purchase completed. */
export function tapSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** A destructive/blocking outcome — cancellation, rejection, error. */
export function tapWarning(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
