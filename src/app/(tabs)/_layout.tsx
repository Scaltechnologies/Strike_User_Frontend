import { Tabs } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditCard, History, Home, User } from 'lucide-react-native';
import { PendingRedemptionBar } from '@/components/redemptions/PendingRedemptionBar';
import { PayAtStorePendingBar } from '@/components/payment/PayAtStorePendingBar';
import { usePendingRedemptions } from '@/hooks/useRedemptions';
import { useAuthStore } from '@/store/authStore';
import { ManropeWeights } from '@/constants/theme';
import { tapSelect } from '@/utils/haptics';

// A bar's own height (icon row + padding) plus the 10px gap PendingRedemptionBar/
// PayAtStorePendingBar each sit above their `bottomOffset` — used to stack the second bar
// above the first without them overlapping when both a redemption and a Pay-at-Store payment
// happen to be pending at once (rare, but both are independent trackers).
const BAR_STACK_HEIGHT = 66;

const ACCENT  = '#D63527';
const MUTED   = '#AEAEB2';
const SURFACE = '#FFFFFF';
const BORDER  = '#E8E8ED';

// Height of the tab bar's own content — icon row + its top padding — not
// counting the bottom inset. SDK 56 renders edge-to-edge on Android
// unconditionally, so the OS draws the app behind the gesture pill/3-button
// nav bar instead of reserving space for it; without adding
// `insets.bottom` ourselves the tab bar (and anything anchored to its
// height) ends up drawn under the system nav bar — hidden, or with its
// labels clipped, whenever the user has 3-button navigation on (its inset
// is much taller than the gesture pill's).
const TAB_BAR_CONTENT_HEIGHT = Platform.select({ ios: 50, android: 56 })!;
const TAB_BAR_TOP_PADDING = 8;
// Floor so the bar still has breathing room on devices that report a 0
// bottom inset (old 3-button-less Android skins, or edge-to-edge off).
const MIN_BOTTOM_PADDING = Platform.select({ ios: 24, android: 8 })!;

// Icon + label stay in their familiar stacked layout on every tab, always
// visible — the only thing that changes on selection is a small solid
// accent circle fading/scaling in behind the active icon (white icon on
// top of it), instead of an icon+label that visually reads the same way
// on every tab all the time.
function TabIcon({
  Icon,
  focused,
}: {
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  focused: boolean;
}) {
  const activeAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(activeAnim, {
      toValue: focused ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focused, activeAnim]);

  const circleScale = activeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <View style={styles.iconWrap}>
      <Animated.View
        style={[styles.iconCircle, { opacity: activeAnim, transform: [{ scale: circleScale }] }]}
      />
      <Icon size={20} color={focused ? '#FFFFFF' : MUTED} strokeWidth={focused ? 2.2 : 1.8} />
    </View>
  );
}

export default function TabsLayout() {
  const userId = useAuthStore((s) => s.userId);
  const { pending } = usePendingRedemptions(userId);
  const redemptionBarVisible = pending.length > 0;

  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, MIN_BOTTOM_PADDING);
  const tabBarHeight = TAB_BAR_CONTENT_HEIGHT + TAB_BAR_TOP_PADDING + bottomPadding;

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: [
            styles.tabBar,
            { height: tabBarHeight, paddingBottom: bottomPadding },
          ],
          tabBarActiveTintColor: ACCENT,
          tabBarInactiveTintColor: MUTED,
          tabBarLabelStyle: styles.label,
          tabBarItemStyle: styles.tabItem,
        }}
        screenListeners={{ tabPress: () => tapSelect() }}
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
      <PendingRedemptionBar bottomOffset={tabBarHeight} />

      {/* Persistent tracker for an in-flight Pay-at-Store payment — stacks above the
          redemption bar (rather than overlapping it) on the rare occasion both are pending. */}
      <PayAtStorePendingBar
        bottomOffset={tabBarHeight + (redemptionBarVisible ? BAR_STACK_HEIGHT : 0)}
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
    // height/paddingBottom are set dynamically per-render from safe-area
    // insets (see TabsLayout) so the bar clears the system nav bar.
    paddingTop: TAB_BAR_TOP_PADDING,
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
    marginTop: 4,
  },
  iconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ACCENT,
  },
});
