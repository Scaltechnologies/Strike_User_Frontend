import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { History } from 'lucide-react-native';

export default function HistoryScreen() {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>
      <View style={styles.center}>
        <View style={styles.iconWrap}>
          <History size={28} color="#AEAEB2" strokeWidth={1.4} />
        </View>
        <Text style={styles.heading}>Coming soon</Text>
        <Text style={styles.sub}>Your redemption and transaction history will appear here.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F2F2F7' },
  header:  {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8ED',
  },
  title:   { fontSize: 24, fontWeight: '700', color: '#0D0D0D', letterSpacing: -0.5 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  iconWrap:{
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  heading: { fontSize: 17, fontWeight: '700', color: '#0D0D0D', marginBottom: 8 },
  sub:     { fontSize: 14, color: '#6C6C6C', textAlign: 'center', lineHeight: 21 },
});
