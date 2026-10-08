import React from 'react';
import { View, Text, TouchableOpacity, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '../../src/theme/tokens';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { IncidentHistoryList } from '../../src/components/incidents/incident-history-list';

/**
 * MOD-42 — Incident History. Reached from the home "Incident History" quick
 * action, so it presents as a pushed screen with a back button. The list body
 * is shared with the Incidents tab.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const t = useTranslations();

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>{t.history.title}</Text>
          <View style={styles.iconBtn} />
        </View>

        <IncidentHistoryList
          onOpenIncident={(id) =>
            router.push({ pathname: '/history/[id]', params: { id } } as any)
          }
          ListHeader={<Text style={styles.subtitle}>{t.history.subtitle}</Text>}
          bottomPadding={32}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  topBar: {
    minHeight: 56,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSub, marginTop: 8, marginBottom: 4 },
});
