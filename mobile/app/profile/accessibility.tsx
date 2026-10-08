import React from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet, ScrollView } from 'react-native';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { useAccessibilityStore } from '../../src/stores/accessibility.store';
import type { AccessibilityPrefs, Language, TextSize } from '../../src/stores/accessibility.store';
import { useAuthStore } from '../../src/stores/auth.store';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { updateUserPreferences } from '../../src/services/api/users.api';

const LANGS = [
  { value: 'en', label: 'English' },
  { value: 'fil', label: 'Filipino' },
];
const SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

// MOD-04 — Accessibility and Multi-Language Support
export default function AccessibilityScreen() {
  const t = useTranslations();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { language, textSize, highContrast, reducedMotion, setPreferences } = useAccessibilityStore();

  // Persist locally (always) + best-effort server sync so preferences follow
  // the account. Never blocks the UI (offline-safe).
  async function save(p: Partial<AccessibilityPrefs>) {
    await setPreferences(p);
    if (!accessToken) return;
    try {
      await updateUserPreferences(
        {
          preferredLanguage: p.language,
          textSize: p.textSize,
          highContrast: p.highContrast,
          reducedMotion: p.reducedMotion,
        },
        accessToken,
      );
    } catch { /* offline-safe */ }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title={t.profile.accessibility} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Field title={t.onboarding4.language.title} subtitle={t.onboarding4.language.subtitle}>
          <Segmented
            options={LANGS}
            value={language}
            onChange={(v) => save({ language: v as Language })}
          />
        </Field>

        <Field title={t.onboarding4.textSize.title} subtitle={t.onboarding4.textSize.subtitle}>
          <Segmented
            options={SIZES}
            value={textSize}
            onChange={(v) => save({ textSize: v as TextSize })}
          />
        </Field>

        <ToggleField
          title={t.onboarding4.highContrast.title}
          subtitle={t.onboarding4.highContrast.subtitle}
          value={highContrast}
          onChange={(v) => save({ highContrast: v })}
        />

        <ToggleField
          title={t.onboarding4.reducedMotion.title}
          subtitle={t.onboarding4.reducedMotion.subtitle}
          value={reducedMotion}
          onChange={(v) => save({ reducedMotion: v })}
        />
      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldTitle}>{title}</Text>
      <Text style={styles.fieldSub}>{subtitle}</Text>
      {children}
    </View>
  );
}

function Segmented({
  options, value, onChange,
}: {
  options: { value: string; label: string }[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segBtn, active && styles.segBtnActive]}
            activeOpacity={0.7}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ToggleField({
  title, subtitle, value, onChange,
}: {
  title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={[styles.field, styles.toggleRow]}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={styles.fieldTitle}>{title}</Text>
        <Text style={[styles.fieldSub, { marginBottom: 0 }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#E5E7EB', true: '#0D6053' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { padding: 20 },
  field: { marginBottom: 24 },
  fieldTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  fieldSub: { fontSize: 13, color: '#6B7280', marginBottom: 12, lineHeight: 18 },
  segmented: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 10, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  segBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  segText: { fontSize: 13, fontWeight: '500', color: '#6B7280' },
  segTextActive: { color: '#0D6053', fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
});
