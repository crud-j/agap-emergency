import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GuestReportStatusCard } from '@/src/components/guest-report/GuestReportStatusCard';
import {
  clearSavedGuestReport, loadSavedGuestReport, type SavedGuestReport,
} from '@/src/services/guest-report/saved-guest-report';
import { setGuestReportPushToken } from '@/src/services/api/guest-report.api';
import { useAuthStore } from '@/src/stores/auth.store';
import { MDRRMO_HOTLINE, MDRRMO_HOTLINE_DISPLAY } from '@/src/config/hotlines';
import { colors, radius } from '@/src/theme/tokens';

function callNumber(number: string) {
  void Linking.openURL(`tel:${number}`).catch(() => undefined);
}

/**
 * The guest report this phone follows (no account, MOD-42). Opened from a status push
 * or from the sign-in screen. Hotlines stay one tap away (Rule 9).
 */
export default function GuestStatusScreen() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [saved, setSaved] = useState<SavedGuestReport | null | undefined>(undefined);

  useEffect(() => {
    void loadSavedGuestReport().then(setSaved);
  }, []);

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace((isAuthenticated ? '/home' : '/auth/login') as never);
  }

  function stopFollowing() {
    if (!saved) return;
    Alert.alert(
      'Stop following this report?',
      'This phone will stop showing its status and getting notifications about it. Your report stays with MDRRMO.',
      [
        { text: 'Keep following', style: 'cancel' },
        {
          text: 'Stop following',
          style: 'destructive',
          onPress: () => {
            // Best effort: the token expires on its own anyway.
            void setGuestReportPushToken(saved.token, null).catch(() => undefined);
            void clearSavedGuestReport().then(leave);
          },
        },
      ],
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={leave} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your report</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {saved === undefined && <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />}

          {saved === null && (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={32} color={colors.textSub} />
              <Text style={styles.emptyText}>
                There is no report to follow on this phone. Reports sent without an account can be followed for up to 7 days.
              </Text>
            </View>
          )}

          {saved && (
            <>
              <Text style={styles.reference}>Report reference: {saved.publicReference}</Text>
              <GuestReportStatusCard token={saved.token} onExpired={() => void clearSavedGuestReport()} />
              <Text style={styles.hint}>
                Give this reference if you call MDRRMO about this emergency.
              </Text>
            </>
          )}

          <TouchableOpacity style={[styles.btn, styles.callBtn]} onPress={() => callNumber('911')} accessibilityRole="button">
            <Ionicons name="call" size={18} color={colors.white} style={{ marginRight: 8 }} />
            <Text style={styles.callBtnText}>Call 911</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.ghostBtn]}
            onPress={() => callNumber(MDRRMO_HOTLINE)}
            accessibilityRole="button"
            accessibilityLabel={`Call MDRRMO hotline ${MDRRMO_HOTLINE_DISPLAY}`}
          >
            <Text style={styles.ghostBtnText}>Call MDRRMO · {MDRRMO_HOTLINE_DISPLAY}</Text>
          </TouchableOpacity>
          {saved && (
            <TouchableOpacity style={[styles.btn, styles.ghostBtn]} onPress={stopFollowing} accessibilityRole="button">
              <Text style={styles.ghostBtnText}>Stop following this report</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  reference: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: 8 },
  hint: { fontSize: 12, fontWeight: '500', color: colors.textSub, marginTop: 8, marginBottom: 8 },
  empty: { alignItems: 'center', gap: 12, marginTop: 24, marginBottom: 16 },
  emptyText: { fontSize: 14, fontWeight: '500', color: colors.textMid, textAlign: 'center', lineHeight: 21 },
  btn: {
    width: '100%', minHeight: 50, borderRadius: radius.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10,
  },
  callBtn: { backgroundColor: colors.danger },
  callBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  ghostBtn: { borderWidth: 1, borderColor: 'rgba(64,83,109,0.25)', backgroundColor: colors.white },
  ghostBtnText: { fontSize: 15, fontWeight: '600', color: colors.textMid },
});
