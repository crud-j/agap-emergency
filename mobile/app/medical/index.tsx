import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { checkConsent, MEDICAL_CONSENT_TYPE } from '../../src/services/api/consent.api';

// MOD-03 — Medical Profile (sensitive; requires consent before access — MOD-48).
export default function MedicalScreen() {
  const t = useTranslations();
  const router = useRouter();

  const consent = useQuery({
    queryKey: ['consent', MEDICAL_CONSENT_TYPE],
    queryFn: () => checkConsent(MEDICAL_CONSENT_TYPE),
  });

  const granted = consent.data?.granted ?? false;

  return (
    <View style={styles.root}>
      <ScreenHeader title={t.profile.medicalProfile} />
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="pulse-outline" size={40} color="#0D6053" />
        </View>
        <Text style={styles.title}>{t.profile.medicalProfile}</Text>
        <Text style={styles.desc}>{t.profile.medicalProfileSub}</Text>

        {consent.isLoading ? (
          <ActivityIndicator color="#0D6053" style={{ marginTop: 16 }} />
        ) : granted ? (
          <View style={styles.statusChip}>
            <Ionicons name="shield-checkmark" size={14} color="#0D6053" />
            <Text style={styles.statusText}>Medical data sharing is ON</Text>
          </View>
        ) : (
          <>
            <View style={styles.gate}>
              <Ionicons name="lock-closed" size={18} color="#B45309" />
              <Text style={styles.gateText}>
                Grant medical data consent so responders can view this in an emergency.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => router.push('/profile/privacy')}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Manage Consent</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#F0F7F4', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  desc: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E7F6F1', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  statusText: { fontSize: 13, fontWeight: '700', color: '#0D6053' },
  gate: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF7ED', padding: 14, borderRadius: 12, marginBottom: 16 },
  gateText: { flex: 1, fontSize: 13, color: '#B45309', lineHeight: 18 },
  btn: { height: 46, borderRadius: 12, backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
