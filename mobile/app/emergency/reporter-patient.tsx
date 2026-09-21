import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useIncidentStore } from '@/src/stores/incident.store';

export default function ReporterPatientScreen() {
  const router = useRouter();
  const { setPatientIsReporter } = useIncidentStore();

  function selectSelf() {
    setPatientIsReporter(true);
    router.push('/emergency/location');
  }

  function selectOther() {
    setPatientIsReporter(false);
    router.push('/emergency/patient');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Who needs help?</Text>
      <Text style={styles.subtitle}>
        This helps us provide the right assistance
      </Text>

      <TouchableOpacity style={styles.option} onPress={selectSelf}>
        <Text style={styles.optionEmoji}>🙋</Text>
        <Text style={styles.optionTitle}>Me</Text>
        <Text style={styles.optionDesc}>I am the one who needs help</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.option, styles.optionOther]} onPress={selectOther}>
        <Text style={styles.optionEmoji}>👥</Text>
        <Text style={styles.optionTitle}>Someone Else</Text>
        <Text style={styles.optionDesc}>Another person needs emergency assistance</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', padding: 24, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#94A3B8', textAlign: 'center', marginBottom: 48 },
  option: { backgroundColor: '#1E293B', borderRadius: 16, padding: 24, marginBottom: 16, alignItems: 'center' },
  optionOther: { backgroundColor: '#1E3A5F' },
  optionEmoji: { fontSize: 40, marginBottom: 8 },
  optionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  optionDesc: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },
});
