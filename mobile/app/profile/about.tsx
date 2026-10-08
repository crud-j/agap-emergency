import { View, Text, StyleSheet, Image } from 'react-native';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { useTranslations } from '../../src/hooks/useAccessibility';

const APP_VERSION = '0.1.0';

// About AGAP — static app information
export default function AboutScreen() {
  const t = useTranslations();
  return (
    <View style={styles.root}>
      <ScreenHeader title={t.profile.about} />
      <View style={styles.body}>
        <Image
          source={require('../../assets/icons/agap-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        
        <Text style={styles.version}>Version {APP_VERSION}</Text>

        <Text style={styles.body2}>
          AGAP helps you reach the right responders faster with the correct
          information during an emergency in Bocaue, Bulacan.
        </Text>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{t.profile.hotlinesNote}</Text>
        </View>

        <Text style={styles.operator}>Bocaue MDRRMO · LGU Operations Center</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 40 },
  logo: { width: 200, height: 50, marginBottom: 16 },
  version: { fontSize: 13, color: '#9CA3AF', marginBottom: 24 },
  body2: { fontSize: 14, color: '#374151', textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  noteCard: { backgroundColor: '#F0F7F4', borderRadius: 12, padding: 14, marginBottom: 24 },
  noteText: { fontSize: 13, color: '#0D6053', textAlign: 'center', lineHeight: 19, fontWeight: '500' },
  operator: { fontSize: 12, color: '#C4C9D1', fontWeight: '600', textAlign: 'center' },
});
