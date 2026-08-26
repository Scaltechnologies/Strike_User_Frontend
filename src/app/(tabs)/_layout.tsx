import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { CreditCard, History, Home, User } from 'lucide-react-native';
import { PendingRedemptionBar } from '@/components/redemptions/PendingRedemptionBar';
import { PayAtStorePendingBar } from '@/components/payment/PayAtStorePendingBar';
import { usePendingRedemptions } from '@/hooks/useRedemptions';
import { useAuthStore } from '@/store/authStore';
import { ManropeWeights } from '@/constants/theme';

// A bar's own height (icon row + padding) plus the 10px gap PendingRedemptionBar/
// PayAtStorePendingBar each sit above their `bottomOffset` — used to stack the second bar
// above the first without them overlapping when both a redemption and a Pay-at-Store payment
// happen to be pending at once (rare, but both are independent trackers).
const BAR_STACK_HEIGHT = 66;

const ACCENT  = '#D63527';
const MUTED   = '#AEAEB2';
const SURFACE = '#FFFFFF';
const BORDER  = '#E8E8ED';
const TAB_BAR_HEIGHT = Platform.select({ ios: 82, android: 64 })!;

function TabIcon({
  Icon,
  focused,
}: {
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Icon size={22} color={focused ? ACCENT : MUTED} strokeWidth={focused ? 2.2 : 1.8} />
    </View>
  );
}

export default function TabsLayout() {
  const userId = useAuthStore((s) => s.userId);
  const { pending } = usePendingRedemptions(userId);
  const redemptionBarVisible = pending.length > 0;

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: MUTED,
          tabBarLabelStyle: styles.label,
          tabBarItemStyle: styles.tabItem,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => <TabIcon Icon={Home} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="cards"
          options={{
            title: 'My Cards',
            tabBarIcon: ({ focused }) => <TabIcon Icon={CreditCard} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: ({ focused }) => <TabIcon Icon={History} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} />,
          }}
        />
      </Tabs>

      {/* Persistent tracker — floats above the tab bar on every tab while a
          redemption request is awaiting vendor approval. */}
      <PendingRedemptionBar bottomOffset={TAB_BAR_HEIGHT} />

      {/* Persistent tracker for an in-flight Pay-at-Store payment — stacks above the
          redemption bar (rather than overlapping it) on the rare occasion both are pending. */}
      <PayAtStorePendingBar
        bottomOffset={TAB_BAR_HEIGHT + (redemptionBarVisible ? BAR_STACK_HEIGHT : 0)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabBar: {
    backgroundColor: SURFACE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    height: Platform.select({ ios: 82, android: 64 }),
    paddingBottom: Platform.select({ ios: 24, android: 8 }),
    paddingTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  tabItem: {
    paddingTop: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    marginTop: 2,
  },
  iconWrap: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  iconWrapActive: {
    backgroundColor: '#FEF2EF',
  },
});
