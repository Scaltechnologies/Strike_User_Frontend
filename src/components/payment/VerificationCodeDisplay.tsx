// The 6-digit fallback code, shown as individual boxed digits (grouped 3+3), with a copy button.
// Never shown alongside the raw QR token — this is the only "technical" detail the user needs.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Check, Copy, KeyRound } from 'lucide-react-native';
import { CC } from '@/components/cards/theme';
import { ManropeWeights } from '@/constants/theme';
import { FadeInView } from '@/components/ui/FadeInView';

const C = CC;
const COPIED_RESET_MS = 2000;

interface VerificationCodeDisplayProps {
  code: string;
}

export function VerificationCodeDisplay({ code }: VerificationCodeDisplayProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const digits = code.split('');

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  async function handleCopy() {
    await Clipboard.setStringAsync(code);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <KeyRound size={13} color={C.gold} strokeWidth={2.4} />
        </View>
        <Text style={styles.label}>Show this code to the store</Text>
      </View>

      <View style={styles.digitsRow}>
        {digits.map((d, i) => (
          <View key={i} style={[styles.digitBox, i === 2 && styles.digitGroupGap]}>
            <Text style={styles.digitText}>{d}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.copyBtn, copied && styles.copyBtnSuccess, pressed && styles.copyBtnPressed]}
        onPress={() => void handleCopy()}
      >
        <FadeInView key={copied ? 'copied' : 'copy'} translateYFrom={4} style={styles.copyBtnInner}>
          {copied ? (
            <>
              <Check size={14} color={C.successDark} strokeWidth={2.6} />
              <Text style={styles.copyBtnTextSuccess}>Copied to clipboard</Text>
            </>
          ) : (
            <>
              <Copy size={14} color={C.secondary} strokeWidth={2.2} />
              <Text style={styles.copyBtnText}>Copy code</Text>
            </>
          )}
        </FadeInView>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: C.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.bold,
    color: C.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  digitsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  digitBox: {
    width: 36,
    height: 46,
    borderRadius: 11,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitGroupGap: { marginRight: 10 },
  digitText: {
    fontSize: 21,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 168,
    borderRadius: 12,
    backgroundColor: C.bg,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  copyBtnSuccess: { backgroundColor: C.successSoft },
  copyBtnPressed: { opacity: 0.75 },
  copyBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  copyBtnText: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },
  copyBtnTextSuccess: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.bold,
    color: C.successDark,
  },
});
