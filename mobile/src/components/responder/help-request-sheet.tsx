import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CrewHelpNeed, UnitFieldFlow } from '@agap/shared';
import { requestHelp } from '@/src/services/api/responders.api';
import { helpNeedsFor } from '@/src/lib/help-request';
import { generateUUID } from '@/src/lib/uuid';
import { useTranslations } from '@/src/hooks/useAccessibility';
import { colors, radius } from '@/src/theme/tokens';

const NOTE_MAX = 500;

/**
 * Crew "Request help" chooser (MOD-32, plan Phase 2 step 5). Tells dispatch what the
 * crew needs; dispatch decides what to send. Not a status step: it is never queued on
 * the phone and keeps its own busy state, so the status buttons stay usable while it sends.
 */
export function HelpRequestSheet({
  visible, dispatchId, token, flow, onClose,
}: {
  visible: boolean;
  dispatchId: string;
  token: string;
  flow: UnitFieldFlow;
  onClose: () => void;
}) {
  const t = useTranslations().helpRequest;
  const needs = helpNeedsFor(flow);
  const [need, setNeed] = useState<CrewHelpNeed>(needs[0]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per opening: a retry from the same sheet is the same request.
  const [clientRequestId, setClientRequestId] = useState(generateUUID);

  useEffect(() => {
    if (!visible) return;
    setNeed(helpNeedsFor(flow)[0]);
    setNote('');
    setError(null);
    setClientRequestId(generateUUID());
  }, [visible, flow]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const result = await requestHelp(dispatchId, { need, note, clientRequestId }, token);
      onClose();
      Alert.alert(result.deduplicated ? t.alreadySent : t.sent);
    } catch (err) {
      // The sheet stays open with the choice and the note, so the crew can retry.
      setError(err instanceof Error && err.message ? err.message : t.failedBody);
    } finally {
      setSending(false);
    }
  }

  return (
    // Stays open while sending, so a failure is always seen.
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!sending) onClose(); }}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{t.subtitle}</Text>

          {needs.map((option) => {
            const selected = option === need;
            return (
              <Pressable
                key={option}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => setNeed(option)}
                disabled={sending}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t.needs[option]}
              >
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selected ? colors.primary : colors.textSub}
                />
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{t.needs[option]}</Text>
              </Pressable>
            );
          })}

          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            placeholder={t.notePlaceholder}
            placeholderTextColor={colors.textSub}
            maxLength={NOTE_MAX}
            multiline
            editable={!sending}
            accessibilityLabel={t.notePlaceholder}
          />
          <Text style={styles.hint}>{t.noteHint}</Text>

          {error ? <Text style={styles.error}>{t.failed}: {error}</Text> : null}

          <Pressable
            style={[styles.send, sending && styles.sendDisabled]}
            onPress={() => void send()}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel={t.send}
          >
            {sending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendText}>{t.send}</Text>}
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose} disabled={sending} accessibilityRole="button">
            <Text style={styles.cancelText}>{t.cancel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '90%', backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: colors.textSub, marginTop: 4, marginBottom: 14, lineHeight: 19 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, marginBottom: 8,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  optionTextSelected: { color: colors.primary, fontWeight: '800' },
  note: {
    minHeight: 64, maxHeight: 120, marginTop: 6, paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    color: colors.text, textAlignVertical: 'top',
  },
  hint: { color: colors.textSub, fontSize: 12, marginTop: 6, lineHeight: 17 },
  error: { color: colors.danger, marginTop: 10, lineHeight: 18 },
  send: {
    marginTop: 14, height: 52, borderRadius: radius.lg, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: colors.track },
  sendText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: colors.textSub, fontWeight: '700' },
});
