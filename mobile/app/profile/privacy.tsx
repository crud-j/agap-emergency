import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import {
  checkConsent, grantConsent, revokeConsent, getAccessLog, exportMyData,
  MEDICAL_CONSENT_TYPE, type AccessLogEntry,
} from '../../src/services/api/consent.api';

// MOD-48 — Privacy, Consent and Medical Data Protection.
export default function PrivacyScreen() {
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);

  const consent = useQuery({
    queryKey: ['consent', MEDICAL_CONSENT_TYPE],
    queryFn: () => checkConsent(MEDICAL_CONSENT_TYPE),
  });

  const log = useQuery({
    queryKey: ['privacy-access-log'],
    queryFn: getAccessLog,
  });

  const grant = useMutation({
    mutationFn: () => grantConsent(MEDICAL_CONSENT_TYPE),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent', MEDICAL_CONSENT_TYPE] }),
    onError: (e: unknown) => Alert.alert('Could not grant consent', e instanceof Error ? e.message : 'Please try again.'),
  });

  const revoke = useMutation({
    mutationFn: () => revokeConsent(MEDICAL_CONSENT_TYPE),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent', MEDICAL_CONSENT_TYPE] }),
    onError: (e: unknown) => Alert.alert('Could not withdraw consent', e instanceof Error ? e.message : 'Please try again.'),
  });

  function confirmRevoke() {
    Alert.alert(
      'Withdraw medical data consent?',
      'Responders will no longer be able to view your medical profile in an emergency. You can grant it again anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Withdraw', style: 'destructive', onPress: () => revoke.mutate() },
      ],
    );
  }

  async function handleExport() {
    setExporting(true);
    try {
      const payload = await exportMyData();
      await Share.share({
        title: 'My AGAP data export',
        message: JSON.stringify(payload, null, 2),
      });
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
  }

  const granted = consent.data?.granted ?? false;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Privacy & Consent" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Medical data consent (MOD-48) */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.iconWrap, { backgroundColor: granted ? '#E7F6F1' : '#FEF3F2' }]}>
              <Ionicons name={granted ? 'shield-checkmark' : 'shield-outline'} size={22} color={granted ? '#0D6053' : '#B42318'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Medical Data Sharing</Text>
              <Text style={styles.cardSub}>
                {consent.isLoading
                  ? 'Checking…'
                  : granted
                    ? 'Granted — responders can view your medical profile during an emergency.'
                    : 'Not granted — your medical profile is hidden from responders.'}
              </Text>
            </View>
          </View>

          <Text style={styles.legal}>
            Your blood type, allergies, and conditions are sensitive medical data. We only reveal
            them to responders assigned to your active incident, and every access is logged below.
          </Text>

          {granted ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={confirmRevoke}
              disabled={revoke.isPending}
              activeOpacity={0.85}
            >
              {revoke.isPending
                ? <ActivityIndicator color="#B42318" />
                : <Text style={styles.btnDangerText}>Withdraw Consent</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => grant.mutate()}
              disabled={grant.isPending}
              activeOpacity={0.85}
            >
              {grant.isPending
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.btnPrimaryText}>Grant Consent</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* Data export */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.iconWrap, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="download-outline" size={22} color="#1D4ED8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Export My Data</Text>
              <Text style={styles.cardSub}>Download a copy of your profile, contacts, and consent history.</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            onPress={handleExport}
            disabled={exporting}
            activeOpacity={0.85}
          >
            {exporting
              ? <ActivityIndicator color="#0D6053" />
              : <Text style={styles.btnSecondaryText}>Export Data</Text>}
          </TouchableOpacity>
        </View>

        {/* Access log */}
        <Text style={styles.sectionTitle}>Access Log</Text>
        <Text style={styles.sectionSub}>Who viewed your sensitive data, most recent first.</Text>

        {log.isLoading ? (
          <ActivityIndicator color="#0D6053" style={{ marginTop: 16 }} />
        ) : (log.data?.length ?? 0) === 0 ? (
          <View style={styles.emptyLog}>
            <Ionicons name="lock-closed-outline" size={28} color="#9CA3AF" />
            <Text style={styles.emptyText}>No one has accessed your sensitive data.</Text>
          </View>
        ) : (
          (log.data ?? []).map((entry: AccessLogEntry) => (
            <View key={entry.id} style={styles.logRow}>
              <Ionicons name="eye-outline" size={16} color="#6B7280" style={{ marginRight: 10, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.logType}>{entry.data_type.replace(/_/g, ' ')}</Text>
                {entry.purpose ? <Text style={styles.logPurpose}>{entry.purpose}</Text> : null}
                <Text style={styles.logTime}>{new Date(entry.accessed_at).toLocaleString()}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#EEF2F6',
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  cardSub: { fontSize: 13, color: '#6B7280', marginTop: 2, lineHeight: 18 },
  legal: { fontSize: 12, color: '#9CA3AF', lineHeight: 17, marginBottom: 14 },
  btn: { height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: '#0D6053' },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  btnSecondary: { backgroundColor: '#E7F6F1' },
  btnSecondaryText: { color: '#0D6053', fontSize: 15, fontWeight: '800' },
  btnDanger: { backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#FECDCA' },
  btnDangerText: { color: '#B42318', fontSize: 15, fontWeight: '800' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 6 },
  sectionSub: { fontSize: 13, color: '#6B7280', marginTop: 2, marginBottom: 12 },
  emptyLog: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyText: { fontSize: 13, color: '#9CA3AF' },
  logRow: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: '#EEF2F6',
  },
  logType: { fontSize: 14, fontWeight: '700', color: '#111827', textTransform: 'capitalize' },
  logPurpose: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  logTime: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
});
