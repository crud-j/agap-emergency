import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomNav } from '../../src/components/ui/bottom-nav';

export default function AnnouncementsScreen() {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.content} edges={['top']}>
        <Text style={styles.title}>Announcements</Text>
        <Text style={styles.sub}>MDRRMO announcements will appear here.</Text>
      </SafeAreaView>
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  sub: { fontSize: 14, color: '#9CA3AF' },
});
