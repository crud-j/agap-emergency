import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme/tokens';
import { useIncidentChat } from '@/src/hooks/useIncidentChat';
import type { IncidentMessage } from '@/src/services/api/communications.api';

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;
}

/**
 * Incident chat thread (MOD-33), pearl/green. Own messages are right-aligned in
 * deep-green (#0D6053); others show a role label. Live via WS; participants only.
 */
export function IncidentChat({ incidentId }: { incidentId: string }) {
  const { messages, loading, connected, sending, error, myUserId, send } = useIncidentChat(incidentId);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<IncidentMessage>>(null);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      await send(text);
    } catch {
      setDraft(text); // restore on failure so the responder can retry
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {!connected && (
        <View style={styles.offlineStrip}>
          <Ionicons name="cloud-offline-outline" size={13} color={colors.amber} style={{ marginRight: 6 }} />
          <Text style={styles.offlineText}>Reconnecting… messages send when back online</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubbles-outline" size={34} color={colors.textSub} />
              <Text style={styles.emptyText}>No messages yet.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const own = item.sender_id === myUserId;
            return (
              <View style={[styles.row, own ? styles.rowOwn : styles.rowOther]}>
                {!own && <Text style={styles.senderLabel}>{item.sender_label}</Text>}
                <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
                  <Text style={[styles.msgText, own && styles.msgTextOwn]}>{item.message_text}</Text>
                </View>
                <Text style={styles.time}>{timeAgo(item.sent_at)}</Text>
              </View>
            );
          }}
        />
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message participants…"
          placeholderTextColor={colors.textSub}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!draft.trim() || sending}
          activeOpacity={0.85}
        >
          {sending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons name="send" size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText: { color: colors.textSub, marginTop: 10 },

  offlineStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.amberSoft, paddingVertical: 6,
  },
  offlineText: { color: colors.amber, fontSize: 12, fontWeight: '600' },

  row: { maxWidth: '82%' },
  rowOwn: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  senderLabel: { color: colors.textSub, fontSize: 11, fontWeight: '700', marginBottom: 2, marginLeft: 4 },
  bubble: { borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  msgText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  msgTextOwn: { color: '#FFFFFF' },
  time: { color: colors.textSub, fontSize: 10, marginTop: 3, marginHorizontal: 4 },

  errorText: { color: colors.danger, fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10,
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, maxHeight: 120, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.track },
});
