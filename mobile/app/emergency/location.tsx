import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useIncidentStore } from '@/src/stores/incident.store';

export default function LocationScreen() {
  const router = useRouter();
  const { setLocation } = useIncidentStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);

  async function captureLocation() {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied. You can still submit without location.');
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined });
      setCaptured(true);
    } catch {
      setError('Could not capture location. GPS is optional — you can still submit.');
    } finally {
      setLoading(false);
    }
  }

  function proceed() {
    router.push('/emergency/transmission');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Location</Text>
      <Text style={styles.subtitle}>
        GPS helps responders find you faster. If unavailable, you can describe your location.
      </Text>

      {!captured ? (
        <TouchableOpacity style={styles.button} onPress={captureLocation} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Capture Location</Text>}
        </TouchableOpacity>
      ) : (
        <View style={styles.success}>
          <Text style={styles.successText}>✓ Location captured</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.skipButton} onPress={proceed}>
        <Text style={styles.skipText}>{captured ? 'Continue →' : 'Skip (not recommended)'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', padding: 24, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#94A3B8', textAlign: 'center', marginBottom: 40 },
  button: { backgroundColor: '#1D4ED8', borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  success: { backgroundColor: '#14532D', borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 16 },
  successText: { color: '#4ADE80', fontSize: 17, fontWeight: 'bold' },
  error: { color: '#FCA5A5', textAlign: 'center', marginBottom: 16 },
  skipButton: { alignItems: 'center', padding: 16 },
  skipText: { color: '#64748B', fontSize: 16 },
});
