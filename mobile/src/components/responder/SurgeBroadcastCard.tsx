import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/src/stores/auth.store';
import { getNotifications } from '@/src/services/api/notifications.api';

const SHOW_HOURS = 24;
const SHOW_MAX = 3;

/**
 * MOD-52 — the Supervisor's surge broadcasts on the responder home screen. They
 * arrive as in-app notices; the responder app has no notification list, so this
 * card is where they're read. Hidden when there is nothing from the last 24 hours.
 */
export function SurgeBroadcastCard() {
  const token = useAuthStore((s) => s.accessToken);
  const { data } = useQuery({
    queryKey: ['responder-surge-broadcasts'],
    queryFn: () => getNotifications(token!),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const since = Date.now() - SHOW_HOURS * 60 * 60 * 1000;
  const broadcasts = (data?.data ?? [])
    .filter((n) => n.event_type === 'SURGE_BROADCAST' && new Date(n.created_at).getTime() >= since)
    .slice(0, SHOW_MAX);
  if (broadcasts.length === 0) return null;

  return (
    <View style={styles.card} accessibilityRole="alert">
      <View style={styles.header}>
        <Ionicons name="megaphone" size={16} color="#B45309" />
        <Text style={styles.headerText}>Surge broadcast</Text>
      </View>
      {broadcasts.map((n) => (
        <View key={n.id} style={styles.item}>
          {n.title ? <Text style={styles.title}>{n.title}</Text> : null}
          <Text style={styles.body}>{n.body}</Text>
          <Text style={styles.time}>{new Date(n.created_at).toLocaleTimeString()}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: '#FCD34D', backgroundColor: '#FFFBEB', padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  headerText: { color: '#92400E', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  item: { paddingTop: 8, borderTopWidth: 1, borderTopColor: '#FDE68A', marginTop: 4 },
  title: { color: '#78350F', fontSize: 13, fontWeight: '700' },
  body: { color: '#1C2B3A', fontSize: 14, lineHeight: 20, marginTop: 2 },
  time: { color: '#92400E', fontSize: 11, marginTop: 4 },
});
