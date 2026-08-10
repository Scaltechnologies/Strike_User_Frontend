import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Hash,
  Store,
  X,
  XCircle,
} from 'lucide-react-native';
import type { Redemption, RedemptionStatus } from '@/types/redemption';

// ── Design tokens (mirrors history.tsx light theme) ─────────────────────────────

const C = {
  accent:      '#D63527',
  bg:          '#F2F2F7',
  surface:     '#FFFFFF',
  border:      '#E8E8ED',
  primary:     '#0D0D0D',
  secondary:   '#6C6C6C',
  muted:       '#AEAEB2',
  success:     '#34C759',
  successSoft: '#EDFAF2',
  successDark: '#1A7A35',
  danger:      '#FF3B30',
  dangerSoft:  '#FEF0EE',
  dangerDark:  '#C0261A',
  warningSoft: '#FFF5E0',
  warningDark: '#7A4500',
} as const;

const STATUS_CFG: Record<RedemptionStatus, {
  label: string;
  color: string;
  bg: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}> = {
  APPROVED:  { label: 'Redeemed', color: C.successDark, bg: C.successSoft, Icon: CheckCircle2 },
  COMPLETED: { label: 'Redeemed', color: C.successDark, bg: C.successSoft, Icon: CheckCircle2 },
  REVERSED:  { label: 'Reversed', color: C.muted,       bg: C.bg,          Icon: Clock       },
  FAILED:    { label: 'Failed',   color: C.dangerDark,  bg: C.dangerSoft,  Icon: XCircle     },
  REJECTED:  { label: 'Rejected', color: C.dangerDark,  bg: C.dangerSoft,  Icon: XCircle     },
  PENDING:   { label: 'Pending',  color: C.warningDark,  bg: C.warningSoft, Icon: Clock       },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

function fmtFullDateTime(iso: string): string {
  const withZone = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  const d = new Date(withZone);
  const datePart = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${datePart} · ${timePart}`;
}

// ── Detail row ─────────────────────────────────────────────────────────────────

function DetailRow({
  Icon,
  label,
  value,
  isLast,
}: {
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !isLast && styles.detailRowBorder]}>
      <View style={styles.detailLabelWrap}>
        <Icon size={14} color={C.muted} strokeWidth={2} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ── Sheet ──────────────────────────────────────────────────────────────────────

export interface RedemptionDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  redemption: Redemption | null;
  cardName: string;
  storeName: string;
}

export function RedemptionDetailSheet({
  visible,
  onClose,
  redemption,
  cardName,
  storeName,
}: RedemptionDetailSheetProps) {
  if (!redemption) return null;

  const cfg = STATUS_CFG[redemption.status];
  const { Icon } = cfg;
  const isCredit = redemption.status === 'REVERSED';
  const showBalance = redemption.status === 'APPROVED' || redemption.status === 'COMPLETED';

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

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Redemption Details</Text>
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
            {/* Status hero */}
            <View style={styles.heroWrap}>
              <View style={[styles.heroIconWrap, { backgroundColor: cfg.bg }]}>
                <Icon size={30} color={cfg.color} strokeWidth={2} />
              </View>
              <Text style={[styles.heroStatus, { color: cfg.color }]}>{cfg.label}</Text>
              <Text style={styles.heroAmount}>
                {isCredit ? '+' : '−'}{fmt(redemption.totalAmount)}
              </Text>
              <Text style={styles.heroTime}>{fmtFullDateTime(redemption.createdAt)}</Text>
            </View>

            {/* Rejection reason */}
            {redemption.status === 'REJECTED' && redemption.rejectionReason ? (
              <View style={styles.warningBanner}>
                <AlertTriangle size={16} color={C.dangerDark} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warningTitle}>Reason for rejection</Text>
                  <Text style={styles.warningText}>{redemption.rejectionReason}</Text>
                </View>
              </View>
            ) : null}

            {/* Items */}
            <Text style={styles.blockLabel}>
              Items ({redemption.items.length})
            </Text>
            <View style={styles.card}>
              {redemption.items.map((item, idx, arr) => (
                <View
                  key={item.menuItemId}
                  style={[styles.itemRow, idx < arr.length - 1 && styles.detailRowBorder]}
                >
                  <View style={styles.itemNameWrap}>
                    <Text style={styles.itemName} numberOfLines={2}>{item.menuItemName}</Text>
                    <Text style={styles.itemMeta}>
                      {item.quantity} × {fmt(item.unitPrice)}
                    </Text>
                  </View>
                  <Text style={styles.itemPrice}>{fmt(item.totalPrice)}</Text>
                </View>
              ))}
            </View>

            {/* Amount summary */}
            <Text style={styles.blockLabel}>Amount</Text>
            <View style={styles.card}>
              <DetailRow
                Icon={Hash}
                label={isCredit ? 'Amount Credited' : 'Amount Deducted'}
                value={`${isCredit ? '+' : '−'}${fmt(redemption.totalAmount)}`}
                isLast={!showBalance}
              />
              {showBalance ? (
                <DetailRow
                  Icon={Hash}
                  label="Balance After"
                  value={fmt(redemption.remainingBalance)}
                  isLast
                />
              ) : null}
            </View>

            {/* Details */}
            <Text style={styles.blockLabel}>Details</Text>
            <View style={styles.card}>
              <DetailRow Icon={CreditCard} label="Membership" value={cardName} />
              <DetailRow Icon={Store} label="Store" value={storeName || '—'} />
              <DetailRow Icon={Calendar} label="Date & Time" value={fmtFullDateTime(redemption.createdAt)} />
              <DetailRow Icon={Hash} label="Redemption ID" value={`#${redemption.id}`} isLast />
            </View>

            <View style={{ height: 8 }} />
          </ScrollView>

          <SafeAreaView edges={['bottom']} style={styles.sheetActions}>
            <Pressable style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Close</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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
    maxHeight: '90%',
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  sheetTitle: {
    flex: 1, fontSize: 17, fontWeight: '700', color: C.primary, letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.border, justifyContent: 'center', alignItems: 'center',
  },

  sheetScroll: { flexGrow: 0 },
  sheetContent: { padding: 20, paddingBottom: 8, gap: 8 },

  // Hero
  heroWrap: { alignItems: 'center', gap: 4, marginBottom: 12 },
  heroIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  heroStatus: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  heroAmount: { fontSize: 30, fontWeight: '800', color: C.primary, letterSpacing: -1, marginTop: 2 },
  heroTime: { fontSize: 13, color: C.muted, fontWeight: '500', marginTop: 2 },

  // Warning banner
  warningBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: C.dangerSoft, borderRadius: 14, padding: 14,
    marginBottom: 4,
  },
  warningTitle: { fontSize: 12.5, fontWeight: '700', color: C.dangerDark, marginBottom: 2 },
  warningText: { fontSize: 13, color: C.dangerDark, lineHeight: 18 },

  // Blocks
  blockLabel: {
    fontSize: 11, fontWeight: '700', color: C.muted,
    letterSpacing: 0.6, textTransform: 'uppercase',
    marginTop: 8, marginBottom: 2,
  },
  card: {
    backgroundColor: C.surface, borderRadius: 16, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },

  // Item rows
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  itemNameWrap: { flex: 1, gap: 2 },
  itemName: { fontSize: 14.5, fontWeight: '600', color: C.primary, lineHeight: 20 },
  itemMeta: { fontSize: 12, color: C.muted, fontWeight: '500' },
  itemPrice: { fontSize: 14.5, fontWeight: '700', color: C.primary, flexShrink: 0 },

  // Detail rows
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  detailRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  detailLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailLabel: { fontSize: 13.5, color: C.secondary, fontWeight: '500' },
  detailValue: {
    fontSize: 13.5, fontWeight: '700', color: C.primary,
    textAlign: 'right', flexShrink: 1, maxWidth: '58%',
  },

  // Footer
  sheetActions: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  doneBtn: {
    backgroundColor: C.primary, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', marginBottom: 8,
  },
  doneBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
});
