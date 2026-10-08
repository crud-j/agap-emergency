import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { IncidentType } from '@agap/shared';
import { useIncidentStore } from '@/src/stores/incident.store';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORIES: {
  type: IncidentType;
  label: string;
  description: string;
  icon: IconName;
  iconColor: string;
  iconBg: string;
  cardBg: string;
}[] = [
  {
    type: IncidentType.ROAD_ACCIDENT,
    label: 'Road / Vehicle Accident',
    description: 'Car, motorcycle, or\nother vehicle accident',
    icon: 'car',
    iconColor: '#3B82F6',
    iconBg: '#DBEAFE',
    cardBg: '#EFF6FF',
  },
  {
    type: IncidentType.FIRE,
    label: 'Fire',
    description: 'Building, vehicle, or\nother fire incident',
    icon: 'flame',
    iconColor: '#F97316',
    iconBg: '#FEF3C7',
    cardBg: '#FFFBEB',
  },
  {
    type: IncidentType.FLOOD,
    label: 'Disaster / Weather',
    description: 'Flood, earthquake,\nor other natural disaster',
    icon: 'thunderstorm',
    iconColor: '#6B7280',
    iconBg: '#E5E7EB',
    cardBg: '#F9FAFB',
  },
];

export default function IncidentTypeScreen() {
  const router = useRouter();
  const { draft, setIncidentType } = useIncidentStore();

  const [type, setType] = useState<IncidentType | null>(draft.type ?? null);

  const isOddCount = CATEGORIES.length % 2 !== 0;

  function handleContinue() {
    if (type) setIncidentType(type);
    router.push('/emergency/incident-details');
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeTop}>
        <View style={styles.logoRow}>
          <Image
            source={require('@/assets/icons/agap-solo-icon.png')}
            style={styles.logoMark}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.logoName}>AGAP</Text>
            <Text style={styles.logoTagline}>Incident Management Platform</Text>
          </View>
        </View>
        <View style={styles.stepsRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.stepDot, i === 2 && styles.stepDotActive]} />
          ))}
        </View>
        <Text style={styles.stepLabel}>Incident Type</Text>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>What's{'\n'}happening?</Text>
        <Text style={styles.subtitle}>
          Select the incident type that best describes the situation.
        </Text>

        <View style={styles.grid}>
          {CATEGORIES.map((c, idx) => {
            const active = type === c.type;
            const isLastOdd = isOddCount && idx === CATEGORIES.length - 1;
            return (
              <TouchableOpacity
                key={c.type}
                style={[
                  styles.card,
                  { backgroundColor: active ? c.iconBg : c.cardBg },
                  active && styles.cardActive,
                  isLastOdd && styles.cardFull,
                ]}
                activeOpacity={0.8}
                onPress={() => setType(active ? null : c.type)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.iconCircle, { backgroundColor: active ? '#FFFFFF' : c.iconBg }]}>
                  <Ionicons name={c.icon} size={26} color={c.iconColor} />
                </View>
                <Text style={styles.cardLabel}>{c.label}</Text>
                <Text style={styles.cardDesc}>{c.description}</Text>
                {active && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark-circle" size={18} color="#0D6053" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, !type && styles.continueBtnMuted]}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.continueTxt}>Continue</Text>
        </TouchableOpacity>
        <View style={styles.skipRow}>
          <Ionicons name="information-circle-outline" size={14} color="#6B7280" style={{ marginRight: 6 }} />
          <Text style={styles.skipText}>You can still send the alert even if you skip these details</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  safeTop: { backgroundColor: '#FFFFFF', alignItems: 'center', paddingBottom: 4 },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 16 },
  logoMark: { width: 44, height: 44 },
  logoName: { fontSize: 20, fontWeight: '900', color: '#0D6053', letterSpacing: 0.5 },
  logoTagline: { fontSize: 10, color: '#6B7280', fontWeight: '500' },

  stepsRow: { flexDirection: 'row', gap: 6, marginBottom: 5 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
  stepDotActive: { width: 24, borderRadius: 4, backgroundColor: '#0D6053' },
  stepLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', letterSpacing: 0.3 },

  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  title: { fontSize: 34, fontWeight: '800', color: '#0D6053', lineHeight: 40, marginBottom: 10 },
  subtitle: { fontSize: 15, color: '#6B7280', lineHeight: 22, marginBottom: 28 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%', borderRadius: 18, padding: 16,
    borderWidth: 2, borderColor: 'transparent', minHeight: 140,
  },
  cardActive: { borderColor: '#0D6053' },
  cardFull: { width: '100%' },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  cardLabel: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  checkBadge: { position: 'absolute', top: 10, right: 10 },

  footer: {
    paddingHorizontal: 20, paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#FFFFFF',
  },
  continueBtn: { height: 56, borderRadius: 28, backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  continueBtnMuted: { backgroundColor: '#9BBDB9' },
  continueTxt: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  skipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 12, color: '#6B7280', textAlign: 'center', flex: 1 },
});
