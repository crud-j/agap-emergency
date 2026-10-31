import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, cardShadow, radius } from '@/src/theme/tokens';

/**
 * The building blocks of the crew field forms (fire report, rescue trip; unit field
 * flow plan Phases 3–4): big chips and steppers for gloves and rain, and the save banner.
 */

export type SaveState = 'idle' | 'saving' | 'synced' | 'queued' | 'error';

export function SaveBanner({ state, errorText }: { state: SaveState; errorText: string | null }) {
  if (state === 'idle') return null;
  const cfg =
    state === 'saving'
      ? { bg: colors.infoSoft, fg: colors.info, icon: 'cloud-upload-outline' as const, text: 'Sending…' }
      : state === 'synced'
        ? { bg: colors.primarySoft, fg: colors.primary, icon: 'checkmark-circle' as const, text: 'Sent — dispatch can see it' }
        : state === 'queued'
          ? { bg: colors.amberSoft, fg: colors.amber, icon: 'time-outline' as const, text: 'Saved on this phone — sending when online' }
          : { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' as const, text: errorText ?? 'Not sent. Try again.' };
  return (
    <View style={[styles.banner, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon} size={16} color={cfg.fg} style={{ marginRight: 8 }} />
      <Text style={[styles.bannerText, { color: cfg.fg }]}>{cfg.text}</Text>
    </View>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Chips<T extends string>({
  options, selected, onPress, disabled, danger,
}: {
  options: { value: T; label: string }[];
  selected: readonly T[];
  onPress: (value: T) => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onPress(o.value)}
            disabled={disabled}
            style={[styles.chip, on && (danger ? styles.chipDanger : styles.chipOn)]}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Stepper({
  label, value, onChange, disabled,
}: {
  label: string;
  value: number | null;
  onChange: (delta: 1 | -1) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(-1)} disabled={disabled}
        accessibilityRole="button" accessibilityLabel={`${label}: fewer`}>
        <Ionicons name="remove" size={24} color={colors.primary} />
      </TouchableOpacity>
      <Text style={styles.stepValue} accessibilityLabel={`${label}: ${value ?? 'not set'}`}>{value ?? '—'}</Text>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(1)} disabled={disabled}
        accessibilityRole="button" accessibilityLabel={`${label}: more`}>
        <Ionicons name="add" size={24} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '700' },

  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 12, fontWeight: '800', color: colors.textSub,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 46, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.md,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, ...cardShadow,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  chipText: { color: colors.textMid, fontSize: 15, fontWeight: '700' },
  chipTextOn: { color: '#FFFFFF' },

  stepperRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, padding: 10,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  stepperLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  stepBtn: {
    width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  stepValue: { minWidth: 44, textAlign: 'center', color: colors.text, fontSize: 22, fontWeight: '800' },
});
