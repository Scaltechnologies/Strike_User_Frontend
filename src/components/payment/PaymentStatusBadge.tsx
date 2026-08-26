// Status pill for a PaymentStatus — mirrors the STATUS_CFG table pattern already used in
// (tabs)/history.tsx for RedemptionStatus, now sourced from the shared CC status tokens instead
// of a local duplicate palette.

import { StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react-native';
import { CC } from '@/components/cards/theme';
import { ManropeWeights } from '@/constants/theme';
import type { PaymentStatus } from '@/types/payment';

const C = CC;

type IconType = React.ComponentType<{ size: number; color: string; strokeWidth: number }>;

const STATUS_CFG: Record<PaymentStatus, { label: string; color: string; bg: string; Icon: IconType }> = {
  CREATED:                       { label: 'Starting…',              color: C.warningDark, bg: C.warningSoft, Icon: Clock },
  PENDING:                       { label: 'Waiting for the store',  color: C.warningDark, bg: C.warningSoft, Icon: Clock },
  PROCESSING:                    { label: 'Processing',             color: C.warningDark, bg: C.warningSoft, Icon: Loader2 },
  AWAITING_VENDOR_CONFIRMATION:  { label: 'Confirming payment',     color: C.info,        bg: C.infoSoft,    Icon: Loader2 },
  SUCCESS:                       { label: 'Payment confirmed',      color: C.successDark, bg: C.successSoft, Icon: CheckCircle2 },
  FAILED:                        { label: 'Payment failed',         color: C.dangerDark,  bg: C.dangerSoft,  Icon: XCircle },
  CANCELLED:                     { label: 'Payment cancelled',      color: C.muted,       bg: C.bg,          Icon: XCircle },
  EXPIRED:                       { label: 'Session expired',        color: C.dangerDark,  bg: C.dangerSoft,  Icon: XCircle },
};

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
}

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  const cfg = STATUS_CFG[status];
  const { Icon } = cfg;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Icon size={13} color={cfg.color} strokeWidth={2.4} />
      <Text style={[styles.text, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  text: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.semiBold,
  },
});
