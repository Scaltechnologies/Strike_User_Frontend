// Phase 1B home placeholder — shows auth state and logout.
// Full home screen (store discovery, hero cards) comes in Phase 3.

import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '@/store/authStore';

export default function HomeTab() {
  const { userId, clearAuth } = useAuthStore();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Logo */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>S</Text>
        </View>

        <Text style={styles.heading}>Welcome to Strike</Text>

        {/* Auth info card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>AUTHENTICATED AS</Text>
          <Text style={styles.userId} numberOfLines={2}>
            {userId ?? '—'}
          </Text>
          <View style={styles.statusPill}>
            <View style={styles.dot} />
            <Text style={styles.statusText}>Session active</Text>
          </View>
        </View>

        <Text style={styles.note}>
          Phase 1B complete.{'\n'}Full home screen arrives in Phase 3.
        </Text>

        <View style={styles.spacer} />

        <Pressable style={styles.logoutBtn} onPress={clearAuth}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FFF0E6',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#C0392B',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#C0392B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  badgeText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 28,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8D5CC',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#999999',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  userId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#27AE60',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#27AE60',
  },
  note: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 20,
  },
  spacer: {
    flex: 1,
  },
  logoutBtn: {
    width: '100%',
    height: 52,
    borderWidth: 1.5,
    borderColor: '#C0392B',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#C0392B',
  },
});
