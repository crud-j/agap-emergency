import React from 'react';
import { View, Text, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { colors } from '../../src/theme/tokens';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { BottomNav } from '../../src/components/ui/bottom-nav';
import { IncidentHistoryList } from '../../src/components/incidents/incident-history-list';

/**
 * Incidents tab — the citizen's full list of reported incidents (MOD-42).
 * Shares the history list body with the pushed History screen; this entry
 * point keeps the bottom tab bar visible.
 */
export default function IncidentsScreen() {
  const router = useRouter();
  const t = useTranslations();

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

        <View style={styles.header}>
          <Text style={styles.title}>{t.history.title}</Text>
          <Text style={styles.subtitle}>{t.history.subtitle}</Text>
        </View>

        <IncidentHistoryList
          onOpenIncident={(id) =>
            router.push({ pathname: '/history/[id]', params: { id } } as any)
          }
          bottomPadding={120}
        />
      </SafeAreaView>
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 4, fontSize: 14, color: colors.textSub },
});
