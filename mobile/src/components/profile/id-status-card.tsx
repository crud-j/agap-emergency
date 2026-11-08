import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/auth.store';
import { useTranslations } from '../../hooks/useAccessibility';
import { idStatusView } from '../../lib/id-verification';
import { getIdVerificationStatus } from '../../services/api/id-verification.api';

export const ID_STATUS_QUERY_KEY = ['id-verification-status'];

const TONE = {
  ok: { icon: 'checkmark-circle', color: '#0D6053', bg: '#E7F6F1' },
  info: { icon: 'time-outline', color: '#1D4ED8', bg: '#EFF6FF' },
  warn: { icon: 'alert-circle-outline', color: '#B45309', bg: '#FFF7ED' },
} as const;

/**
 * The citizen's ID status on their profile (plan §8). Shows nothing until it has an
 * answer, and nothing on a failed request: it is information, and never in the way of getting help.
 */
export function IdStatusCard() {
  const router = useRouter();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);

  const { data } = useQuery({
    queryKey: ID_STATUS_QUERY_KEY,
    queryFn: getIdVerificationStatus,
    enabled: !!token,
  });

  // The profile stays mounted under the screens it opens, so returning from a withdrawal in
  // Privacy & Consent, or a staff decision read in Notifications, must ask again.
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ID_STATUS_QUERY_KEY }, { cancelRefetch: false });
    }, [queryClient]),
  );

  if (!data) return null;

  const view = idStatusView(data.status);
  const tone = TONE[view.tone];

  return (
    <View testID="id-status-card" style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
        <Ionicons name={tone.icon} size={20} color={tone.color} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{t.profile.idStatusTitle}</Text>
        <Text style={[styles.status, { color: tone.color }]}>{t.profile[view.labelKey]}</Text>
      </View>
      {view.canScanAgain ? (
        <TouchableOpacity
          testID="id-scan-again-link"
          style={styles.action}
          activeOpacity={0.7}
          onPress={() => router.push('/profile/id-verification' as never)}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>{t.profile.idStatusScanAgain}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#DEE7E3',
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  text: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: '#1F302A' },
  status: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  action: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#EEF6F2', marginLeft: 8 },
  actionText: { fontSize: 12, fontWeight: '800', color: '#0D6053' },
});
