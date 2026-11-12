import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { goBack } from '@/src/lib/navigation';
import { PastAnnouncementsList } from '@/src/components/announcements/past-announcements-list';

/** Past public notices, opened from the Announcements feed. Read-only for residents. */
export default function PastAnnouncementsScreen() {

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} accessibilityRole="header">Past announcements</Text>
          <Text style={styles.headerSub}>Withdrawn, replaced or ended notices</Text>
        </View>
      </SafeAreaView>
      <View style={styles.body}>
        <PastAnnouncementsList bottomPadding={40} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F5F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168,181,193,0.18)',
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  body: { flex: 1, paddingTop: 12 },
});
