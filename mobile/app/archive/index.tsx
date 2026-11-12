import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BottomNav } from '@/src/components/ui/bottom-nav';
import { IncidentHistoryList } from '@/src/components/incidents/incident-history-list';
import { PastAnnouncementsList } from '@/src/components/announcements/past-announcements-list';

type ArchiveTab = 'incidents' | 'announcements';

const TEAL = '#0D6053';

export default function ArchiveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<ArchiveTab>(
    params.tab === 'announcements' ? 'announcements' : 'incidents',
  );
  useEffect(() => {
    if (params.tab === 'announcements' || params.tab === 'incidents') {
      setTab(params.tab);
    }
  }, [params.tab]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Archives</Text>
          <Text style={styles.subtitle}>Your incident history and past public notices.</Text>
        </View>

        <View style={styles.tabs} accessibilityRole="tablist">
          <ArchiveTabButton
            label="Incident history"
            icon="document-text-outline"
            selected={tab === 'incidents'}
            onPress={() => setTab('incidents')}
          />
          <ArchiveTabButton
            label="Announcements"
            icon="megaphone-outline"
            selected={tab === 'announcements'}
            onPress={() => setTab('announcements')}
          />
        </View>

        {tab === 'incidents' ? (
          <IncidentHistoryList
            onOpenIncident={(id) =>
              router.push({ pathname: '/history/[id]', params: { id } } as never)
            }
            bottomPadding={120}
          />
        ) : (
          <PastAnnouncementsList bottomPadding={120} />
        )}
      </SafeAreaView>
      <BottomNav />
    </View>
  );
}

function ArchiveTabButton({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabButton, selected && styles.tabButtonSelected]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      <Ionicons name={icon} size={16} color={selected ? TEAL : '#718096'} />
      <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F5F8' },
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  title: { fontSize: 25, fontWeight: '800', color: '#14231F', letterSpacing: -0.5 },
  subtitle: { marginTop: 4, fontSize: 13, color: '#718096' },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 5,
    borderRadius: 15,
    backgroundColor: '#E7ECEF',
  },
  tabButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 11,
  },
  tabButtonSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#172B26',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  tabText: { fontSize: 12, fontWeight: '600', color: '#718096' },
  tabTextSelected: { color: TEAL, fontWeight: '800' },
});
