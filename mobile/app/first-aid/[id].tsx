import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { getGuideById } from '../../src/data/first-aid';
import { useTranslations, useFontScale } from '../../src/hooks/useAccessibility';
import { useAccessibilityStore } from '../../src/stores/accessibility.store';
import type { Language } from '../../src/stores/accessibility.store';

const URGENCY_COLOR = {
  critical: { bg: '#FEF2F2', fg: '#DC2626' },
  important: { bg: '#FFF7ED', fg: '#B45309' },
  info: { bg: '#F0F7F4', fg: '#0D6053' },
} as const;

const EMERGENCY_NUMBER = '911';

/**
 * Full first-aid guide: numbered steps (caution steps flagged), Do / Don't
 * lists, and when to escalate. Includes a per-screen EN/FIL view toggle and a
 * persistent emergency-call banner.
 */
export default function FirstAidGuideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const { fs } = useFontScale();
  const storeLang = useAccessibilityStore((s) => s.language);
  const [lang, setLang] = useState<Language>(storeLang);

  const guide = getGuideById(id ?? '');

  if (!guide) {
    return (
      <View style={styles.root}>
        <ScreenHeader title={t.firstAid.screenTitle} />
        <View style={styles.notFound}>
          <Ionicons name="alert-circle-outline" size={40} color="#9CA3AF" />
          <Text style={[styles.notFoundText, { fontSize: fs(15) }]}>{t.firstAid.notFound}</Text>
        </View>
      </View>
    );
  }

  const u = URGENCY_COLOR[guide.urgency];
  const urgencyLabel =
    guide.urgency === 'critical'
      ? t.firstAid.urgencyCritical
      : guide.urgency === 'important'
      ? t.firstAid.urgencyImportant
      : t.firstAid.urgencyInfo;

  function callEmergency() {
    Linking.openURL(`tel:${EMERGENCY_NUMBER}`).catch(() => undefined);
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={guide.title[lang]}
        right={
          <View style={styles.langToggle}>
            {(['en', 'fil'] as Language[]).map((l) => (
              <TouchableOpacity
                key={l}
                style={[styles.langBtn, lang === l && styles.langBtnActive]}
                onPress={() => setLang(l)}
                activeOpacity={0.8}
              >
                <Text style={[styles.langText, lang === l && styles.langTextActive]}>
                  {l === 'en' ? 'EN' : 'FIL'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Urgency + framing */}
        <View style={[styles.urgencyTag, { backgroundColor: u.bg }]}>
          <Text style={[styles.urgencyText, { color: u.fg, fontSize: fs(12) }]}>{urgencyLabel}</Text>
        </View>
        <Text style={[styles.whileWaiting, { fontSize: fs(13) }]}>{t.firstAid.whileWaiting}</Text>
        <Text style={[styles.summary, { fontSize: fs(16) }]}>{guide.summary[lang]}</Text>

        {/* Emergency call banner */}
        <TouchableOpacity style={styles.callBanner} onPress={callEmergency} activeOpacity={0.85}>
          <Ionicons name="call" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={[styles.callBannerText, { fontSize: fs(14) }]}>{t.firstAid.callButton}</Text>
        </TouchableOpacity>

        {/* Steps */}
        <Text style={[styles.sectionTitle, { fontSize: fs(16) }]}>{t.firstAid.stepsTitle}</Text>
        {guide.steps.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={[styles.stepNum, step.caution && styles.stepNumCaution]}>
              <Text style={[styles.stepNumText, step.caution && styles.stepNumTextCaution]}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepText, { fontSize: fs(15) }]}>{step.text[lang]}</Text>
              {step.caution && (
                <View style={styles.cautionRow}>
                  <Ionicons name="warning" size={13} color="#B45309" style={{ marginRight: 4 }} />
                  <Text style={[styles.cautionText, { fontSize: fs(11) }]}>
                    {t.firstAid.urgencyImportant}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))}

        {/* Do */}
        <Text style={[styles.sectionTitle, { fontSize: fs(16) }]}>{t.firstAid.dosTitle}</Text>
        {guide.dos.map((item, i) => (
          <View key={i} style={styles.listItem}>
            <Ionicons name="checkmark-circle" size={18} color="#0D6053" style={styles.listIcon} />
            <Text style={[styles.listText, { fontSize: fs(15) }]}>{item[lang]}</Text>
          </View>
        ))}

        {/* Don't */}
        <Text style={[styles.sectionTitle, { fontSize: fs(16) }]}>{t.firstAid.dontsTitle}</Text>
        {guide.donts.map((item, i) => (
          <View key={i} style={styles.listItem}>
            <Ionicons name="close-circle" size={18} color="#DC2626" style={styles.listIcon} />
            <Text style={[styles.listText, { fontSize: fs(15) }]}>{item[lang]}</Text>
          </View>
        ))}

        {/* Escalate */}
        <View style={styles.escalateBox}>
          <Text style={[styles.escalateTitle, { fontSize: fs(14) }]}>{t.firstAid.escalateTitle}</Text>
          {guide.whenToEscalate.map((item, i) => (
            <View key={i} style={styles.escalateItem}>
              <Text style={[styles.escalateBullet, { fontSize: fs(15) }]}>•</Text>
              <Text style={[styles.escalateText, { fontSize: fs(15) }]}>{item[lang]}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.disclaimer, { fontSize: fs(12) }]}>{t.firstAid.disclaimer}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },

  langToggle: { flexDirection: 'row', backgroundColor: '#EDF1F4', borderRadius: 14, padding: 2 },
  langBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  langBtnActive: { backgroundColor: '#FFFFFF' },
  langText: { fontSize: 12, fontWeight: '700', color: '#8795A3' },
  langTextActive: { color: '#0D6053' },

  urgencyTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginBottom: 12 },
  urgencyText: { fontWeight: '800', letterSpacing: 0.4 },
  whileWaiting: { color: '#0D6053', fontWeight: '700', marginBottom: 6 },
  summary: { color: '#111827', fontWeight: '600', lineHeight: 24, marginBottom: 16 },

  callBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 48, borderRadius: 24, backgroundColor: '#DC2626', marginBottom: 24,
  },
  callBannerText: { color: '#FFFFFF', fontWeight: '700' },

  sectionTitle: { fontWeight: '800', color: '#111827', marginTop: 8, marginBottom: 12 },

  stepRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0F7F4', alignItems: 'center', justifyContent: 'center' },
  stepNumCaution: { backgroundColor: '#FFF7ED' },
  stepNumText: { fontSize: 13, fontWeight: '800', color: '#0D6053' },
  stepNumTextCaution: { color: '#B45309' },
  stepText: { color: '#1F2937', lineHeight: 22 },
  cautionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  cautionText: { color: '#B45309', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  listItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  listIcon: { marginRight: 10, marginTop: 1 },
  listText: { flex: 1, color: '#1F2937', lineHeight: 22 },

  escalateBox: {
    marginTop: 16, padding: 16, borderRadius: 14,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
  },
  escalateTitle: { color: '#991B1B', fontWeight: '800', marginBottom: 10 },
  escalateItem: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  escalateBullet: { color: '#DC2626', fontWeight: '800', lineHeight: 22 },
  escalateText: { flex: 1, color: '#991B1B', lineHeight: 22 },

  disclaimer: { color: '#9CA3AF', textAlign: 'center', lineHeight: 17, marginTop: 24 },

  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { color: '#6B7280', fontWeight: '600' },
});
