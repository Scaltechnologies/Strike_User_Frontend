// Tab bar is hidden for Phase 1B — only a single home placeholder exists.
// Phase 3 adds the 5-tab bar (Home, Saved, Cards, History, Profile) with icons.

import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    />
  );
}
