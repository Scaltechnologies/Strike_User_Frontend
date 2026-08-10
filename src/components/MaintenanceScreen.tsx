import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wrench } from 'lucide-react-native';

const C = {
  accent: '#D63527',
  accentSoft: '#FEF2EF',
  bg: '#F2F2F7',
  primary: '#0D0D0D',
  secondary: '#6C6C6C',
} as const;

interface MaintenanceScreenProps {
  message: string;
}

export function MaintenanceScreen({ message }: MaintenanceScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Wrench size={32} color={C.accent} strokeWidth={2} />
        </View>
        <Text style={styles.title}>We'll be right back</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: C.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontWeight: '400',
    color: C.secondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
});
