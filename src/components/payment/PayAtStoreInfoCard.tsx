// Explainer step shown before generating the QR/code — spec §9. Keeps the pitch short: what
// happens, why it's safe, what the user gets. No technical detail about tokens/hashing here —
// that's an implementation detail, not something the user needs to see.

import { FadeInView } from '@/components/ui/FadeInView';
import { CC, formatCardPrice } from '@/components/cards/theme';
import { ManropeWeights } from '@/constants/theme';
import { ChevronLeft, ChevronRight, KeyRound, QrCode, Store, Zap } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

const C = CC;

const BENEFITS = [
  { Icon: Zap, text: 'Instant card activation once confirmed', tint: C.accent, tintSoft: C.accentSoft },
  { Icon: QrCode, text: 'A unique QR code for the cashier to scan', tint: C.gold, tintSoft: C.goldSoft },
  { Icon: KeyRound, text: 'A backup 6-digit code if scanning isn’t possible', tint: C.gold, tintSoft: C.goldSoft },
] as const;

interface PayAtStoreInfoCardProps {
  amount: number;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

export function PayAtStoreInfoCard({ amount, busy, onConfirm, onBack }: PayAtStoreInfoCardProps) {
  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.backRow, pressed && styles.backRowPressed]}
        onPress={onBack}
        disabled={busy}
        hitSlop={8}
      >
        <ChevronLeft size={15} color={C.secondary} strokeWidth={2.4} />
        <Text style={styles.backText}>Change payment method</Text>
      </Pressable>

      <FadeInView translateYFrom={10} delay={0}>
        <View style={styles.heroIconWrap}>
          <Store size={22} color={C.gold} strokeWidth={2.2} />
        </View>
        <Text style={styles.eyebrow}>PAY AT STORE</Text>
        <Text style={styles.title}>Pay when you arrive</Text>
        <Text style={styles.body}>
          Your card activates only once the store confirms your payment in person.
        </Text>
      </FadeInView>

      <View style={styles.benefitsCard}>
        {BENEFITS.map(({ Icon, text, tint, tintSoft }, i) => (
          <FadeInView key={text} translateYFrom={8} delay={60 + i * 60}>
            <View style={[styles.benefitRow, i > 0 && styles.benefitRowBorder]}>
              <View style={[styles.benefitIconWrap, { backgroundColor: tintSoft }]}>
                <Icon size={16} color={tint} strokeWidth={2.2} />
              </View>
              <Text style={styles.benefitText}>{text}</Text>
            </View>
          </FadeInView>
        ))}
      </View>

      <FadeInView translateYFrom={10} delay={260}>
        <View style={styles.amountStrip}>
          <View>
            <Text style={styles.amountStripLabel}>YOU’LL PAY AT THE STORE</Text>
            <Text style={styles.amountStripSub}>Once confirmed, your card activates</Text>
          </View>
          <Text style={styles.amountStripValue}>{formatCardPrice(amount)}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.confirmBtn,
            pressed && styles.confirmBtnPressed,
            busy && styles.confirmBtnDisabled,
          ]}
          onPress={onConfirm}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Text style={styles.confirmBtnText}>Generate QR & Code</Text>
              <ChevronRight size={18} color="#FFF" strokeWidth={2.6} />
            </>
          )}
        </Pressable>

        <Text style={styles.secureHint}>Nothing is charged online — the store confirms in person</Text>
      </FadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  backRowPressed: { opacity: 0.6 },
  backText: {
    fontSize: 13,
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },

  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: C.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: ManropeWeights.bold,
    color: C.gold,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  title: {
    fontSize: 21,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.6,
  },
  body: {
    fontSize: 13.5,
    fontFamily: ManropeWeights.regular,
    color: C.secondary,
    lineHeight: 20,
    marginTop: 6,
  },

  benefitsCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  benefitRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  benefitIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: 13,
    fontFamily: ManropeWeights.medium,
    color: C.primary,
    lineHeight: 18,
  },

  amountStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.goldSoft,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  amountStripLabel: {
    fontSize: 9,
    fontFamily: ManropeWeights.bold,
    color: C.gold,
    letterSpacing: 0.8,
  },
  amountStripSub: {
    fontSize: 11,
    fontFamily: ManropeWeights.medium,
    color: C.secondary,
    marginTop: 3,
  },
  amountStripValue: {
    fontSize: 22,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.5,
  },

  confirmBtn: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 16,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 6,
  },
  confirmBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  confirmBtnDisabled: { opacity: 0.7 },
  confirmBtnText: {
    color: '#FFF',
    fontSize: 15.5,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
  secureHint: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: ManropeWeights.medium,
    color: C.muted,
    marginTop: 9,
  },
});
