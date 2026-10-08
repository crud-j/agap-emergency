import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/src/theme/tokens';
import { IncidentChat } from '@/src/components/chat/incident-chat';

/**
 * Incident chat screen (MOD-33 / WS-5.2). Reached from the citizen's active
 * incident (tracking) screen and the responder assignment screen. Participants
 * only — enforced server-side.
 */
export default function IncidentChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.title}>Incident Chat</Text>
          <Text style={styles.sub}>Participants only</Text>
        </View>
        <View style={styles.iconBtn} />
      </SafeAreaView>

      {id ? (
        <IncidentChat incidentId={id as string} />
      ) : (
        <View style={styles.center}>
          <Text style={styles.sub}>No incident selected.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10, backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  sub: { fontSize: 11, color: colors.textSub },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
