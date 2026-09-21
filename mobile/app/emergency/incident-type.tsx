import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { IncidentType } from '@agap/shared';
import { useIncidentStore } from '@/src/stores/incident.store';

const INCIDENT_TYPES: Array<{ type: IncidentType; label: string; emoji: string }> = [
  { type: IncidentType.MEDICAL, label: 'Medical Emergency', emoji: '🏥' },
  { type: IncidentType.FIRE, label: 'Fire', emoji: '🔥' },
  { type: IncidentType.ROAD_ACCIDENT, label: 'Road Accident', emoji: '🚗' },
  { type: IncidentType.FLOOD, label: 'Flood / Natural Disaster', emoji: '🌊' },
  { type: IncidentType.RESCUE, label: 'Rescue (Drowning, Collapse)', emoji: '🆘' },
  { type: IncidentType.INDUSTRIAL, label: 'Industrial / Hazmat', emoji: '☣️' },
  { type: IncidentType.DEBRIS, label: 'Debris / Obstruction', emoji: '🪨' },
  { type: IncidentType.OTHER, label: 'Other Emergency', emoji: '⚠️' },
];

export default function IncidentTypeScreen() {
  const router = useRouter();
  const { setIncidentType } = useIncidentStore();

  function select(type: IncidentType) {
    setIncidentType(type);
    router.push('/emergency/reporter-patient');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>What is the emergency?</Text>
      <FlatList
        data={INCIDENT_TYPES}
        keyExtractor={(i) => i.type}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.item} onPress={() => select(item.type)}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={styles.label}>{item.label}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 24, marginTop: 16 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 12 },
  emoji: { fontSize: 28, marginRight: 16 },
  label: { fontSize: 17, color: '#fff', fontWeight: '500' },
});
