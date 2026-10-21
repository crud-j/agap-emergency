import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@/src/theme/tokens';
import { useTranslations } from '@/src/hooks/useAccessibility';
import type { UserSexValue } from '@/src/services/api/auth.api';

const OPTIONS: Array<{ value: UserSexValue; labelKey: 'male' | 'female' | 'preferNotToSay' }> = [
  { value: 'MALE', labelKey: 'male' },
  { value: 'FEMALE', labelKey: 'female' },
  { value: 'PREFER_NOT_TO_SAY', labelKey: 'preferNotToSay' },
];

/**
 * Optional Male / Female / Prefer-not-to-say radio row (MOD-01).
 *
 * Only picks the REPORTER's map icon, so it never blocks a form. Tapping the
 * selected card again clears it back to "not chosen" (null).
 */
export function SexPicker({
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
}: {
  value: UserSexValue | null;
  onChange: (next: UserSexValue | null) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const t = useTranslations();

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {OPTIONS.map(({ value: option, labelKey }) => {
        const checked = value === option;
        return (
          <TouchableOpacity
            key={option}
            testID={`sex-option-${option}`}
            style={[styles.card, checked && styles.cardChecked, disabled && styles.cardDisabled]}
            activeOpacity={0.8}
            disabled={disabled}
            onPress={() => onChange(checked ? null : option)}
            accessibilityRole="radio"
            accessibilityState={{ checked, disabled }}
            accessibilityLabel={t.registration[labelKey]}
          >
            <View style={[styles.radio, checked && styles.radioChecked]}>
              {checked && <View style={styles.radioDot} />}
            </View>
            <Text
              style={[styles.label, checked && styles.labelChecked]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {t.registration[labelKey]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  card: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: colors.white,
  },
  cardChecked: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  cardDisabled: { opacity: 0.6 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioChecked: { borderColor: colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  label: { flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' },
  labelChecked: { color: colors.primary, fontWeight: '700' },
});
