/**
 * Registration name fields for the ID check (MOD-01, plan §3 "Why the name is split", §4.2):
 * Last, First, Middle (optional), Suffix (optional), and the "matches your ID" indicator.
 * After a scan the parent fills these from the name the server read (prefillNameFromId); they stay
 * editable and the citizen checks the spelling. The match uses matchIdName from @agap/shared, the
 * same code the server decides with (the parent computes it).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { IdName, IdNameMatch } from '@agap/shared';
import { useTranslations } from '../../hooks/useAccessibility';
import { NAME_SUFFIXES, formatNameOnId, type NameFieldValues } from '../../lib/id-verification';

export type NameValues = NameFieldValues;

export const EMPTY_NAME: NameValues = { last: '', first: '', middle: '', suffix: '' };

interface Props {
  value: NameValues;
  onChange: (value: NameValues) => void;
  /** The fields were filled from the card: ask the citizen to check them instead of type them. */
  filledFromId?: boolean;
  /** The name the server read from the card; null when the scan went to staff review. */
  nameOnId: IdName | null;
  /** The match to show (set on blur and on submit); null hides the indicator. */
  shownMatch: IdNameMatch | null;
  /** A name field lost focus: the parent re-checks the match. */
  onNameBlur: () => void;
  reviewChosen: boolean;
  onReviewChange: (chosen: boolean) => void;
  errors?: { lastName?: string | undefined; firstName?: string | undefined };
}

type Field = 'last' | 'first' | 'middle';

export default function NameFields({
  value,
  onChange,
  filledFromId = false,
  nameOnId,
  shownMatch,
  onNameBlur,
  reviewChosen,
  onReviewChange,
  errors,
}: Props) {
  const t = useTranslations();
  const [focused, setFocused] = useState<Field | null>(null);

  const set = (field: keyof NameValues) => (text: string) => onChange({ ...value, [field]: text });

  function input(
    field: Field,
    label: string,
    placeholder: string,
    textContentType: 'familyName' | 'givenName' | 'middleName',
    error?: string,
  ) {
    return (
      <View style={styles.inputWrapper}>
        <Text style={styles.inputLabel}>{label}</Text>
        <View style={[styles.inputContainer, focused === field && styles.inputContainerFocused]}>
          <TextInput
            testID={`${field}name-input`}
            style={styles.textInput}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            value={value[field]}
            onChangeText={set(field)}
            onFocus={() => setFocused(field)}
            onBlur={() => {
              setFocused(null);
              onNameBlur();
            }}
            autoCapitalize="words"
            autoCorrect={false}
            textContentType={textContentType}
          />
        </View>
        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.block}>
      {filledFromId ? (
        <View testID="name-filled-from-id" style={[styles.notice, styles.noticeInfo]} accessibilityLiveRegion="polite">
          <Ionicons name="scan-outline" size={16} color="#0D6053" />
          <Text style={[styles.noticeText, { color: '#0D6053' }]}>{t.registration.nameFilledFromId}</Text>
        </View>
      ) : (
        <Text style={styles.helper}>{t.registration.nameHelper}</Text>
      )}

      {input('last', t.registration.lastName, t.registration.lastNamePlaceholder, 'familyName', errors?.lastName)}
      {input('first', t.registration.firstName, t.registration.firstNamePlaceholder, 'givenName', errors?.firstName)}
      {input('middle', t.registration.middleName, t.registration.middleNamePlaceholder, 'middleName')}

      <View style={styles.inputWrapper}>
        <Text style={styles.inputLabel}>{t.registration.suffix}</Text>
        <View style={styles.chips}>
          {NAME_SUFFIXES.map((suffix) => {
            const selected = value.suffix === suffix;
            return (
              <TouchableOpacity
                key={suffix || 'none'}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => {
                  onChange({ ...value, suffix });
                  onNameBlur();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{suffix || t.registration.suffixNone}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {!nameOnId ? (
        <View style={[styles.notice, styles.noticeInfo]} accessibilityLiveRegion="polite">
          <Ionicons name="people-outline" size={16} color="#0D6053" />
          <Text style={[styles.noticeText, { color: '#0D6053' }]}>{t.registration.nameReviewScan}</Text>
        </View>
      ) : shownMatch?.matches ? (
        <View testID="name-match-ok" style={[styles.notice, styles.noticeOk]} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={16} color="#15803D" />
          <Text style={[styles.noticeText, { color: '#15803D' }]}>{t.registration.nameMatches}</Text>
        </View>
      ) : shownMatch ? (
        <View testID="name-match-mismatch" style={[styles.notice, styles.noticeBad]} accessibilityLiveRegion="polite">
          <View style={styles.noticeRow}>
            <Ionicons name="close-circle" size={16} color="#DC2626" />
            <Text style={[styles.noticeText, { color: '#B91C1C' }]}>{t.registration.nameDoesNotMatch}</Text>
          </View>
          {/* The citizen's own card, so showing its name back is fine (plan §4.2). */}
          <Text style={styles.idShows}>
            {t.registration.nameIdShows} <Text style={styles.idName}>{formatNameOnId(nameOnId)}</Text>
          </Text>
          {reviewChosen ? (
            <>
              <Text style={styles.reviewChosen}>{t.registration.nameReviewChosen}</Text>
              <TouchableOpacity onPress={() => onReviewChange(false)} hitSlop={{ top: 8, bottom: 8 }}>
                <Text style={styles.link}>{t.registration.nameReviewUndo}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity testID="name-send-review-link" onPress={() => onReviewChange(true)} hitSlop={{ top: 8, bottom: 8 }}>
              <Text style={styles.link}>{t.registration.nameSendReviewLink}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 16 },
  helper: { fontSize: 13, color: '#4B5563', lineHeight: 19 },
  inputWrapper: { width: '100%' },
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#0D6053', marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    height: 52,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  inputContainerFocused: { borderColor: '#0D6053', backgroundColor: '#F4F9F8' },
  textInput: { flex: 1, fontSize: 15, color: '#111827', height: '100%' },
  fieldError: { fontSize: 12, color: '#EF4444', marginTop: 6, paddingHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: { borderColor: '#0D6053', backgroundColor: '#F0FBF9' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextSelected: { color: '#0D6053', fontWeight: '700' },
  notice: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, gap: 8 },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeOk: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  noticeBad: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  noticeInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FBF9', borderColor: '#CCEBE6' },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  idShows: { fontSize: 13, color: '#374151', lineHeight: 19 },
  idName: { fontWeight: '800', color: '#111827' },
  reviewChosen: { fontSize: 13, color: '#0D6053', lineHeight: 19 },
  link: { fontSize: 13, fontWeight: '700', color: '#0D6053', textDecorationLine: 'underline' },
});
