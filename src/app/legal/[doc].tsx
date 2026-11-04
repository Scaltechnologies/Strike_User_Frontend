// Terms & Conditions / Privacy Policy reader — /legal/terms, /legal/privacy.
//
// Reachable while signed out (from the login screen) as well as signed in
// (from Profile), so AuthProvider's route guard lets the `legal` segment
// through for both states. Content lives in constants/legal.ts.

import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';

import { LEGAL_DOCUMENTS, type LegalBlock, type LegalDocumentKey } from '@/constants/legal';
import { ROUTES } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';

// ── Design tokens — matches settings/notifications.tsx ─────────────────────────

const C = {
  accent:    '#D63527',
  bg:        '#F2F2F7',
  surface:   '#FFFFFF',
  border:    '#E8E8ED',
  primary:   '#0D0D0D',
  secondary: '#5C5C5C',
  muted:     '#AEAEB2',
} as const;

// No `fontWeight` alongside Manrope families — on Android that combo can drop
// the custom font and fall back to the device's system font.

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
      </Pressable>
      <Text style={styles.topBarTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case 'p':
      return <Text style={styles.paragraph}>{block.text}</Text>;
    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.bullet}>{block.ordered ? `${i + 1}.` : '•'}</Text>
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case 'contact':
      return (
        <View style={styles.contact}>
          {block.rows.map((row) => (
            <Pressable
              key={row.label}
              disabled={!row.href}
              onPress={() => row.href && Linking.openURL(row.href).catch(() => {})}
              style={({ pressed }) => [styles.contactRow, pressed && styles.pressed]}
            >
              <Text style={styles.contactLabel}>{row.label}</Text>
              <Text style={[styles.contactValue, !!row.href && styles.link]}>{row.value}</Text>
            </Pressable>
          ))}
        </View>
      );
  }
}

export default function LegalScreen() {
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const document = LEGAL_DOCUMENTS[(doc as LegalDocumentKey)] ?? LEGAL_DOCUMENTS.terms;

  // Opened directly (no history, e.g. a deep link) — fall back to login, which
  // the route guard forwards to Home if the user is already signed in.
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.AUTH.LOGIN);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <TopBar title={document.title} onBack={handleBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>{document.title}</Text>
          {(document.effectiveDate || document.lastUpdated) && (
            <Text style={styles.meta}>
              {document.effectiveDate ? `Effective: ${document.effectiveDate}` : ''}
              {document.effectiveDate && document.lastUpdated ? '   ·   ' : ''}
              {document.lastUpdated ? `Last updated: ${document.lastUpdated}` : ''}
            </Text>
          )}

          {document.intro.map((block, i) => <Block key={`intro-${i}`} block={block} />)}

          {document.sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.blocks.map((block, i) => <Block key={i} block={block} />)}
            </View>
          ))}

          {!!document.footer && <Text style={styles.footer}>{document.footer}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.2,
  },
  topBarSpacer: { width: 36 },

  content: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },

  title: {
    fontSize: 22,
    fontFamily: ManropeWeights.extraBold,
    color: C.primary,
    marginBottom: 6,
  },
  meta: {
    fontSize: 12,
    fontFamily: ManropeWeights.medium,
    color: C.muted,
    marginBottom: 14,
  },

  section: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    marginBottom: 8,
  },

  paragraph: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: ManropeWeights.regular,
    color: C.secondary,
    marginTop: 8,
  },

  list: { marginTop: 8, gap: 6 },
  listRow: { flexDirection: 'row', paddingRight: 4 },
  bullet: {
    width: 22,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: ManropeWeights.semiBold,
    color: C.accent,
  },
  listText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: ManropeWeights.regular,
    color: C.secondary,
  },

  contact: {
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: C.bg,
    overflow: 'hidden',
  },
  contactRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pressed: { opacity: 0.6 },
  contactLabel: {
    fontSize: 11,
    fontFamily: ManropeWeights.semiBold,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  contactValue: {
    marginTop: 2,
    fontSize: 14,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
  },
  link: { color: C.accent },

  footer: {
    marginTop: 24,
    fontSize: 12,
    textAlign: 'center',
    fontFamily: ManropeWeights.regular,
    color: C.muted,
  },
});
