import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getAnnouncementById } from '@/src/services/api/announcements.api';

const TEAL = '#0D6053';

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  CRITICAL:      { color: '#D44858', bg: '#FDF0F1', icon: 'alert-circle',      label: 'Critical' },
  WARNING:       { color: '#D97706', bg: '#FFFBEB', icon: 'warning',            label: 'Warning' },
  ADVISORY:      { color: '#3B82F6', bg: '#EFF6FF', icon: 'information-circle', label: 'Advisory' },
  INFORMATIONAL: { color: '#0D6053', bg: '#EEF7F4', icon: 'megaphone',          label: 'Informational' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AnnouncementDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['announcement', id],
    queryFn: () => getAnnouncementById(id as string),
    enabled: !!id,
  });

  const cfg = SEVERITY_CONFIG[data?.severity ?? ''] ?? SEVERITY_CONFIG.INFORMATIONAL;

  async function handleShare() {
    if (!data) return;
    await Share.share({
      title: data.title,
      message: `[AGAP — Bocaue MDRRMO]\n${data.title}\n\n${data.body ?? ''}`,
    });
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {data?.category?.replace(/_/g, ' ') ?? 'Announcement'}
        </Text>
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={handleShare}
          accessibilityRole="button"
          accessibilityLabel="Share announcement"
          disabled={!data}
        >
          <Ionicons name="share-outline" size={22} color={data ? '#111827' : '#C4CDD6'} />
        </TouchableOpacity>
      </SafeAreaView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={TEAL} />
        </View>
      ) : isError || !data ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#C4CDD6" />
          <Text style={styles.errorText}>Announcement not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Severity badge — icon + color per spec (not color alone) */}
          <View style={[styles.severityBadge, { backgroundColor: cfg.bg, borderColor: cfg.color + '33' }]}>
            <Ionicons name={cfg.icon as any} size={16} color={cfg.color} style={{ marginRight: 6 }} />
            <Text style={[styles.severityLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>

          <Text style={styles.title}>{data.title}</Text>

          {/* Announcement image — full width, shown before body */}
          {data.image_url ? (
            <Image
              source={{ uri: data.image_url }}
              style={styles.heroImage}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              accessibilityLabel="Announcement image"
            />
          ) : null}

          {/* Metadata row */}
          <View style={styles.metaGrid}>
            <MetaItem icon="calendar-outline" label="Published" value={fmtDate(data.published_at)} />
            <MetaItem icon="location-outline" label="Scope" value={data.scope.replace(/_/g, ' ')} />
            {(data.target_barangays?.length ?? 0) > 0 && (
              <MetaItem
                icon="map-outline"
                label="Barangays"
                value={(data.target_barangays as string[]).join(', ')}
              />
            )}
          </View>

          <View style={styles.divider} />

          <Text style={styles.body}>{data.body}</Text>

          {/* One-way broadcast notice */}
          <View style={styles.notice}>
            <Ionicons name="radio-outline" size={14} color="#6B7280" style={{ marginRight: 8, marginTop: 1 }} />
            <Text style={styles.noticeText}>
              This is an official MDRRMO public information broadcast.{' '}
              <Text style={styles.noticeBold}>For emergencies, call 911 or the MDRRMO hotline immediately.</Text>
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function MetaItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon as any} size={13} color="#9CA3AF" style={{ marginRight: 5, marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168,181,193,0.18)',
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  shareBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#374151', textAlign: 'center' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: { fontSize: 15, color: '#6B7280', marginTop: 12, marginBottom: 16 },
  retryBtn: {
    backgroundColor: TEAL, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },

  severityBadge: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
    marginBottom: 14,
  },
  severityLabel: { fontSize: 13, fontWeight: '700' },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 30,
    marginBottom: 14,
  },
  heroImage: {
    width: '100%',
    height: 200,
    borderRadius: 14,
    marginBottom: 16,
    backgroundColor: '#F3F4F6',
  },

  metaGrid: { gap: 10, marginBottom: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'flex-start' },
  metaLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  metaValue: { fontSize: 13, color: '#374151', fontWeight: '500', marginTop: 1 },

  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 16 },

  body: { fontSize: 15, color: '#374151', lineHeight: 24 },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 24,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
  },
  noticeText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 18 },
  noticeBold: { fontWeight: '700', color: '#374151' },
});
