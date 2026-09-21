import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

// Pending: fetch real assignments from API
export default function AssignmentsScreen() {
  const router = useRouter();

  // TODO: Replace with real API call using responder JWT
  const { data, isLoading } = useQuery({
    queryKey: ['responder-assignments'],
    queryFn: async () => ({ data: [] as Assignment[] }),
    refetchInterval: 10000,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Assignments</Text>
      {isLoading ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : data?.data.length === 0 ? (
        <Text style={styles.empty}>No active assignments</Text>
      ) : (
        <FlatList
          data={data?.data ?? []}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/responder/assignment/${item.id}`)}
            >
              <Text style={styles.ticket}>{item.ticketNumber}</Text>
              <Text style={styles.type}>{item.incidentType}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

interface Assignment {
  id: string;
  ticketNumber: string;
  incidentType: string;
  status: string;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 24, marginTop: 16 },
  loading: { color: '#94A3B8' },
  empty: { color: '#475569', textAlign: 'center', marginTop: 60 },
  card: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 12 },
  ticket: { fontSize: 12, fontFamily: 'monospace', color: '#64748B', marginBottom: 4 },
  type: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  status: { fontSize: 13, color: '#94A3B8' },
});
