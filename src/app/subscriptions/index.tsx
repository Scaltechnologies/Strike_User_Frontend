// Phase 5 — Subscriptions list redirects to (tabs)/cards.
import { Redirect } from 'expo-router';

export default function SubscriptionsIndex() {
  return <Redirect href="/cards" />;
}
