import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFontScale, useTranslations } from '@/src/hooks/useAccessibility';
import { colors, radius } from '@/src/theme/tokens';

/**
 * MOD-32: the reporter's consented profile photo, large enough to recognise them on
 * arrival. Always labelled as the REPORTER, who may not be the patient (rule 2).
 * Only rendered once the photo has loaded, so it never delays the assignment.
 */
export function ReporterPhotoCard({ uri }: { uri: string }) {
  const t = useTranslations().profilePhoto;
  const { fs } = useFontScale();
  return (
    <View style={styles.card}>
      <Image
        source={{ uri }}
        style={styles.photo}
        resizeMode="cover"
        accessibilityLabel={t.reporterImageLabel}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Ionicons name="person-circle-outline" size={16} color={colors.primary} />
          <Text style={[styles.title, { fontSize: fs(15) }]}>{t.reporterTitle}</Text>
        </View>
        <Text style={[styles.note, { fontSize: fs(12) }]}>{t.reporterNote}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginTop: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E3E9EF',
  },
  photo: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontWeight: '700', color: colors.text },
  note: { color: colors.textMuted, marginTop: 4, lineHeight: 17 },
});
