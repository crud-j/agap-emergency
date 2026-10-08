import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useIncidentStore } from '@/src/stores/incident.store';

export default function SOSScreen() {
  const router = useRouter();
  const { startSOS } = useIncidentStore();

  function handleSOS() {
    Alert.alert(
      'Confirm Emergency',
      'Are you sure you want to report an emergency?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Report Emergency',
          style: 'destructive',
          onPress: () => {
            startSOS();
            router.push('/emergency/location');
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AGAP Emergency</Text>
      <Text style={styles.subtitle}>Press and hold to report an emergency</Text>

      <TouchableOpacity
        style={styles.sosButton}
        onLongPress={handleSOS}
        activeOpacity={0.7}
      >
        <Text style={styles.sosText}>SOS</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>Long press the button to activate</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#94A3B8', marginBottom: 60, textAlign: 'center' },
  sosButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#FCA5A5',
  },
  sosText: { fontSize: 48, fontWeight: 'bold', color: '#fff' },
  hint: { fontSize: 13, color: '#475569', marginTop: 24 },
});
