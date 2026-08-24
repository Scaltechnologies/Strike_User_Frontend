// Shown when a single wallet-grid box is split between more than one
// redemption (e.g. two small orders together crossed one box's ₹ boundary).
// A single box can only open one RedemptionDetailSheet at a time, so this
// sits in between: a short list of the contributing redemptions: tapping
// one closes this and opens the full detail sheet for it.
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, X } from 'lucide-react-native';
import { ManropeWeights } from '@/constants/theme';
import type { Redemption } from '@/types/redemption';

const C = {
  bg:        '#F2F2F7',
  surface:   '#FFFFFF',
  border:    '#E8E8ED',
  primary:   '#0D0D0D',
  secondary: '#6C6C6C',
  muted:     '#AEAEB2',
  accent:    '#D63527',
} as const;

function fmt(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

// redemption-service returns createdAt as a naive local (IST) timestamp —
// parsed as-is, never with a 'Z' appended (that would shift it by the IST offset).
function fmtTime(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const timePart = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${datePart} · ${timePart}`;
}

export interface CellRedemptionChooserProps {
  visible: boolean;
  onClose: () => void;
  redemptions: Redemption[];
  onSelect: (redemption: Redemption) => void;
}

export function CellRedemptionChooser({
  visible,
  onClose,
  redemptions,
  onSelect,
}: CellRedemptionChooserProps) {
  if (redemptions.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>This box covers {redemptions.length} orders</Text>
              <Text style={styles.sheetSubtitle}>Pick one to see its details</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
              <X size={18} color={C.secondary} strokeWidth={2.5} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.card}>
              {redemptions.map((r, idx) => {
                const names = r.items
                  .map((i) => (i.quantity > 1 ? `${i.menuItemName} ×${i.quantity}` : i.menuItemName))
                  .join(', ');
                return (
                  <Pressable
                    key={r.id}
                    style={({ pressed }) => [
                      styles.row,
                      idx < redemptions.length - 1 && styles.rowBorder,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={() => onSelect(r)}
                  >
                    <View style={styles.rowLeft}>
                      <Text style={styles.rowItems} numberOfLines={1}>{names || 'Redemption'}</Text>
                      <Text style={styles.rowTime}>{fmtTime(r.createdAt)}</Text>
                    </View>
                    <Text style={styles.rowAmount}>−{fmt(r.totalAmount)}</Text>
                    <ChevronRight size={16} color={C.muted} strokeWidth={2} />
                  </Pressable>
                );
              })}
            </View>
            <View style={{ height: 8 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '70%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.15, shadowRadius: 24 },
      android: { elevation: 24 },
    }),
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },

  sheetHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingVertical: 14, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  sheetTitle: {
    fontSize: 16, fontFamily: ManropeWeights.bold, color: C.primary, letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 12.5, fontFamily: ManropeWeights.medium, color: C.muted, marginTop: 2,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.border, justifyContent: 'center', alignItems: 'center',
  },

  sheetScroll: { flexGrow: 0 },
  sheetContent: { padding: 16 },

  card: {
    backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  rowPressed: { backgroundColor: C.bg },
  rowLeft: { flex: 1, gap: 2 },
  rowItems: { fontSize: 14, fontFamily: ManropeWeights.semiBold, color: C.primary },
  rowTime: { fontSize: 12, color: C.muted, fontFamily: ManropeWeights.medium },
  rowAmount: { fontSize: 14, fontFamily: ManropeWeights.bold, color: C.accent },
});
