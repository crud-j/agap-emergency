import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FirstAidGuide } from '../../data/first-aid/types';
import type { Language } from '../../stores/accessibility.store';
import { useTranslations, useFontScale } from '../../hooks/useAccessibility';

const URGENCY_COLOR = {
  critical: { bg: '#FEF2F2', fg: '#DC2626' },
  important: { bg: '#FFF7ED', fg: '#B45309' },
  info: { bg: '#F0F7F4', fg: '#0D6053' },
} as const;

/**
 * Tappable summary card for one first-aid guide, used in the hub list.
 * Colour-codes the urgency and honours the user's text-size preference.
 */
export function GuideCard({
  guide,
  lang,
  onPress,
}: {
  guide: FirstAidGuide;
  lang: Language;
  onPress: () => void;
}) {
  const t = useTranslations();
  const { fs } = useFontScale();
  const u = URGENCY_COLOR[guide.urgency];
  const urgencyLabel =
    guide.urgency === 'critical'
      ? t.firstAid.urgencyCritical
      : guide.urgency === 'important'
      ? t.firstAid.urgencyImportant
      : t.firstAid.urgencyInfo;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={guide.title[lang]}
    >
      <View style={[styles.iconWrap, { backgroundColor: u.bg }]}>
        <Ionicons name={guide.icon} size={24} color={u.fg} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { fontSize: fs(15) }]} numberOfLines={2}>
          {guide.title[lang]}
        </Text>
        <Text style={[styles.summary, { fontSize: fs(13) }]} numberOfLines={2}>
          {guide.summary[lang]}
        </Text>
        <View style={[styles.tag, { backgroundColor: u.bg }]}>
          <Text style={[styles.tagText, { color: u.fg, fontSize: fs(11) }]}>{urgencyLabel}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#C4CBD4" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    backgroundColor: '#FFFFFF',
  },
  iconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { fontWeight: '800', color: '#111827', marginBottom: 3 },
  summary: { color: '#6B7280', lineHeight: 18, marginBottom: 8 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tagText: { fontWeight: '700', letterSpacing: 0.3 },
});
