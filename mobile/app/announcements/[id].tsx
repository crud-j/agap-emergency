import React, { useState } from 'react';
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
import {
  getAnnouncementById,
  announcementImageSource,
  type Announcement,
} from '@/src/services/api/announcements.api';

const TEAL = '#0D6053';

// Severity → the format standard's priority. Icon + words always accompany
// colour, so urgency never depends on colour alone.
const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: string; label: string; priority: string }> = {
  CRITICAL:      { color: '#B4232F', bg: '#FDF0F1', icon: 'alert-circle',       label: 'Critical', priority: 'Urgent' },
  WARNING:       { color: '#B45309', bg: '#FFFBEB', icon: 'warning',            label: 'Warning',  priority: 'Important' },
  ADVISORY:      { color: '#1D4ED8', bg: '#EFF6FF', icon: 'information-circle', label: 'Advisory', priority: 'Important' },
  INFORMATIONAL: { color: '#0D6053', bg: '#EEF7F4', icon: 'megaphone',          label: 'Info',     priority: 'Routine' },
};

const CATEGORY_LABELS: Record<string, string> = {
  FLOOD_ALERT: 'Flood',
  WEATHER_ADVISORY: 'Weather',
  EVACUATION_ORDER: 'Evacuation',
  CLASS_SUSPENSION: 'Class suspension',
  ROAD_CLOSURE: 'Traffic',
  PUBLIC_ADVISORY: 'Public advisory',
  MUNICIPAL_SERVICE: 'Municipal service',
  FIRE_ADVISORY: 'Fire',
  INDUSTRIAL_HAZARD: 'Industrial hazard',
  POST_DISASTER_UPDATE: 'Post-disaster',
  RESCUE_UPDATE: 'Rescue',
  GENERAL_INFORMATION: 'General',
};

/** Always shown in Bocaue time, whatever the phone's zone setting. */
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function areaLabel(a: Announcement): string {
  return a.scope === 'MUNICIPALITY_WIDE' || a.target_barangays.length === 0
    ? 'All of Bocaue'
    : `Brgy. ${a.target_barangays.join(', ')}`;
}

/** Split the plain-text notice into paragraphs; all-caps lines render as headings. */
function NoticeBody({ text }: { text: string }) {
  return (
    <View style={{ gap: 12 }}>
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split('\n');
        return (
          <Text key={i} style={styles.body}>
            {lines.map((line, j) => {
              const heading = line.length > 3 && line === line.toUpperCase() && /[A-Z]/.test(line);
              return (
                <Text key={j} style={heading ? styles.bodyHeading : undefined}>
                  {j > 0 ? '\n' : ''}
                  {line}
                </Text>
              );
            })}
          </Text>
        );
      })}
    </View>
  );
}

export default function AnnouncementDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [imageFailed, setImageFailed] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['announcement', id],
    queryFn: () => getAnnouncementById(id as string),
    enabled: !!id,
  });

  const cfg = SEVERITY_CONFIG[data?.severity ?? ''] ?? SEVERITY_CONFIG.INFORMATIONAL;
  const image = data ? announcementImageSource(data) : null;
  const cancelled = data?.status === 'CANCELLED';
  const actions = (data?.action_required ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  async function handleShare() {
    if (!data) return;
    await Share.share({
      title: data.title,
      message: `[${data.issuing_office ?? 'Bocaue'}]\n${data.title}\n\n${data.summary ?? data.body ?? ''}`,
    });
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {data ? CATEGORY_LABELS[data.category] ?? 'Announcement' : 'Announcement'}
        </Text>
        <TouchableOpacity
          style={styles.iconBtn}
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
          <Text style={styles.errorText}>This announcement could not be loaded.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} style={styles.ghostBtn} accessibilityRole="button">
              <Text style={styles.ghostText}>Go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Correction status — shown first so nobody acts on a withdrawn notice */}
          {cancelled && (
            <View style={styles.cancelBox} accessibilityRole="alert">
              <Ionicons name="close-circle" size={18} color="#B4232F" style={{ marginRight: 8, marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cancelTitle}>This announcement was cancelled</Text>
                {data.correction_note ? <Text style={styles.cancelNote}>{data.correction_note}</Text> : null}
                {data.cancelled_at ? <Text style={styles.cancelMeta}>{fmtDate(data.cancelled_at)}</Text> : null}
              </View>
            </View>
          )}

          {/* Category + priority labels */}
          <View style={styles.labelRow}>
            <View style={[styles.severityBadge, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon as any} size={14} color={cfg.color} style={{ marginRight: 5 }} />
              <Text style={[styles.severityLabel, { color: cfg.color }]}>
                {cfg.label} · {cfg.priority}
              </Text>
            </View>
          </View>

          <Text style={[styles.title, cancelled && styles.titleCancelled]} accessibilityRole="header">
            {data.title}
          </Text>

          {data.summary ? <Text style={styles.summary}>{data.summary}</Text> : null}

          {/* Key details */}
          <View style={styles.detailsCard}>
            <Detail icon="location-outline" label="Affected area" value={areaLabel(data)} />
            {data.effective_start_at ? (
              <Detail
                icon="time-outline"
                label={data.effective_end_at ? 'Effective' : 'Effective from'}
                value={`${fmtDate(data.effective_start_at)}${data.effective_end_at ? ` – ${fmtDate(data.effective_end_at)}` : ''}`}
              />
            ) : null}
            <Detail icon="calendar-outline" label="Published" value={fmtDate(data.published_at)} />
          </View>

          {/* Required action */}
          {actions.length > 0 && !cancelled && (
            <View style={styles.actionsCard}>
              <Text style={styles.sectionLabel}>What you need to do</Text>
              {actions.map((a, i) => (
                <View key={i} style={styles.actionRow}>
                  <Ionicons name="checkmark-circle" size={16} color={TEAL} style={{ marginRight: 8, marginTop: 1 }} />
                  <Text style={styles.actionText}>{a}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Attachment */}
          {image && !imageFailed ? (
            <Image
              source={image}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
              accessible
              accessibilityIgnoresInvertColors
              accessibilityLabel={data.image_alt_text ?? 'Announcement image'}
            />
          ) : null}
          {image && imageFailed ? (
            <View style={styles.imageFallback}>
              <Ionicons name="image-outline" size={18} color="#9CA3AF" />
              <Text style={styles.imageFallbackText}>The attached image could not be loaded. Check your connection and reopen this notice.</Text>
            </View>
          ) : null}

          {/* Full notice */}
          <Text style={styles.sectionLabel}>Full announcement</Text>
          <NoticeBody text={data.body} />

          {/* Issuing office and source */}
          <View style={styles.sourceCard}>
            <Detail icon="business-outline" label="Issued by" value={data.issuing_office ?? 'Municipality of Bocaue'} />
            {data.source_reference ? <Detail icon="document-text-outline" label="Source" value={data.source_reference} /> : null}
            {data.contact_info ? <Detail icon="call-outline" label="Contact" value={data.contact_info} /> : null}
          </View>

          {/* One-way broadcast notice */}
          <View style={styles.notice}>
            <Ionicons name="radio-outline" size={14} color="#6B7280" style={{ marginRight: 8, marginTop: 1 }} />
            <Text style={styles.noticeText}>
              Official public information broadcast.{' '}
              <Text style={styles.noticeBold}>For emergencies, call 911 or the MDRRMO hotline immediately.</Text>
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Detail({ icon, label, value }: { icon: string; label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon as any} size={15} color="#6B7280" style={{ marginRight: 10, marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
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
  iconBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#374151', textAlign: 'center' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: { fontSize: 15, color: '#6B7280', marginTop: 12, marginBottom: 16, textAlign: 'center' },
  retryBtn: { backgroundColor: TEAL, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  ghostBtn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: '#DCE3E9' },
  ghostText: { color: '#374151', fontWeight: '700', fontSize: 14 },

  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },

  cancelBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FDF0F1',
    borderWidth: 1,
    borderColor: 'rgba(180,35,47,0.25)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  cancelTitle: { fontSize: 14, fontWeight: '800', color: '#B4232F' },
  cancelNote:  { fontSize: 13, color: '#374151', lineHeight: 19, marginTop: 4 },
  cancelMeta:  { fontSize: 11, color: '#6B7280', marginTop: 4 },

  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  severityBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8,
  },
  severityLabel: { fontSize: 12, fontWeight: '800' },

  title: { fontSize: 22, fontWeight: '800', color: '#111827', lineHeight: 29, marginBottom: 8 },
  titleCancelled: { color: '#6B7280', textDecorationLine: 'line-through' },
  summary: { fontSize: 15, color: '#1F2937', lineHeight: 22, fontWeight: '500', marginBottom: 16 },

  detailsCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 16,
  },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9 },
  detailLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  detailValue: { fontSize: 14, color: '#111827', fontWeight: '500', marginTop: 1, lineHeight: 19 },

  actionsCard: {
    backgroundColor: '#EEF7F4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 },
  actionText: { flex: 1, fontSize: 14, color: '#1F2937', lineHeight: 20 },

  heroImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginBottom: 18,
    backgroundColor: '#EDF1F4',
  },
  imageFallback: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginBottom: 18,
  },
  imageFallbackText: { flex: 1, fontSize: 12, color: '#6B7280' },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  body: { fontSize: 15, color: '#374151', lineHeight: 23 },
  bodyHeading: { fontWeight: '800', color: '#111827', fontSize: 13, letterSpacing: 0.3 },

  sourceCard: {
    marginTop: 22,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 2,
  },
  noticeText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 18 },
  noticeBold: { fontWeight: '700', color: '#374151' },
});
