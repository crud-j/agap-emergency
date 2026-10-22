import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.store';
import { useTranslations } from '../../hooks/useAccessibility';
import { getMyStanding, type ReporterStanding } from '../../services/api/incidents.api';

/**
 * The citizen's Verified Reporter standing: AGAP's thank-you for reports that end
 * in a closed incident. Refreshed by useLiveIncidentRefresh when an incident closes.
 */
export function useMyStanding() {
  const token = useAuthStore((s) => s.accessToken);
  const isGuest = useAuthStore((s) => !!s.user?.is_guest);
  return useQuery<ReporterStanding>({
    queryKey: ['reporter-standing'],
    queryFn: getMyStanding,
    enabled: !!token && !isGuest,
    staleTime: 60_000,
  });
}

function countLabel(t: ReturnType<typeof useTranslations>, n: number): string {
  return n === 1 ? t.reporter.verifiedOne : t.reporter.verifiedMany.replace('{n}', String(n));
}

/** Profile badge: the count once verified, or how to earn it. */
export function VerifiedReporterBadge() {
  const t = useTranslations();
  const { data } = useMyStanding();
  if (!data) return null;

  const verified = data.isVerifiedReporter;
  return (
    <View style={[styles.badge, !verified && styles.badgeMuted]} accessibilityRole="summary">
      <View style={[styles.iconWrap, !verified && styles.iconWrapMuted]}>
        <Ionicons name={verified ? 'shield-checkmark' : 'shield-outline'} size={20} color={verified ? '#FFFFFF' : '#71817A'} />
      </View>
      <View style={styles.badgeText}>
        <Text style={styles.badgeTitle}>{t.reporter.verifiedTitle}</Text>
        <Text style={styles.badgeSub}>
          {verified ? countLabel(t, data.verifiedReports) : t.reporter.notYet}
        </Text>
      </View>
    </View>
  );
}

/** Shown on a closed incident: thanks the reporter and shows the badge it earned. */
export function ReporterThanksCard() {
  const t = useTranslations();
  const isGuest = useAuthStore((s) => !!s.user?.is_guest);
  const { data } = useMyStanding();
  // Guests have no account to hold the badge.
  if (isGuest) return null;

  return (
    <View style={styles.thanks}>
      <View style={styles.thanksHeader}>
        <Ionicons name="heart" size={18} color="#0D6053" />
        <Text style={styles.thanksTitle}>{t.reporter.thanksTitle}</Text>
      </View>
      <Text style={styles.thanksBody}>{t.reporter.thanksBody}</Text>
      {data?.isVerifiedReporter && (
        <View style={styles.thanksChip}>
          <Ionicons name="shield-checkmark" size={13} color="#0D6053" />
          <Text style={styles.thanksChipText}>
            {t.reporter.verifiedTitle} · {countLabel(t, data.verifiedReports)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 17,
    padding: 15, marginBottom: 18, borderWidth: 1, borderColor: '#A8C9BB',
  },
  badgeMuted: { borderColor: '#DEE7E3' },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#0D6053',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  iconWrapMuted: { backgroundColor: '#EEF2F0' },
  badgeText: { flex: 1 },
  badgeTitle: { fontSize: 14, fontWeight: '800', color: '#21352F' },
  badgeSub: { fontSize: 12, color: '#5F6F69', marginTop: 2, lineHeight: 17 },

  thanks: {
    backgroundColor: '#EEF7F4', borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#A8C9BB',
  },
  thanksHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  thanksTitle: { fontSize: 15, fontWeight: '800', color: '#0D6053' },
  thanksBody: { fontSize: 13, color: '#31453F', lineHeight: 19 },
  thanksChip: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginTop: 10,
    backgroundColor: '#DDEFE8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9,
  },
  thanksChipText: { fontSize: 12, fontWeight: '800', color: '#0D6053' },
});
