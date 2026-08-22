// Shared empty-state shell — icon badge + title + optional subtitle/CTA,
// matching the visual pattern already used consistently (but independently
// reimplemented) on Home/History/Notifications. Used starting where a
// text-only empty block gets a proper icon (Store detail, Subscription
// detail) — the 3 existing working local implementations are left as-is.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ManropeWeights } from '@/constants/theme';
import { FadeInView } from '@/components/ui/FadeInView';

// Matches the palette shared verbatim across store/theme.ts and the
// subscriptions/[id].tsx, index.tsx local `C` objects.
const COLORS = {
  accent:     '#D63527',
  accentSoft: '#FEF2EF',
  bg:         '#F2F2F7',
  border:     '#E8E8ED',
  secondary:  '#6C6C6C',
  muted:      '#AEAEB2',
} as const;

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  return (
    <FadeInView>
      <View style={styles.wrap}>
        <View style={styles.iconWrap}>{icon}</View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable style={styles.actionBtn} onPress={onAction}>
            <Text style={styles.actionBtnText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 10,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 15,
    fontFamily: ManropeWeights.semiBold,
    color: COLORS.secondary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: ManropeWeights.regular,
  },
  actionBtn: {
    marginTop: 6,
    backgroundColor: COLORS.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: ManropeWeights.bold,
    color: COLORS.accent,
  },
});
