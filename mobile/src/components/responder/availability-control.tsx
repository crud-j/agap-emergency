import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ResponderAvailability } from '@agap/shared';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useUpdateAvailability } from '../../hooks/useResponderSummary';

const OPTIONS: Array<{ value: ResponderAvailability; label: string; color: string }> = [
  { value: ResponderAvailability.AVAILABLE,   label: 'Available',   color: '#0D6053' },
  { value: ResponderAvailability.OFF_DUTY,    label: 'Off Duty',    color: '#8795A3' },
  { value: ResponderAvailability.UNAVAILABLE, label: 'Unavailable', color: '#D44858' },
];

interface Props {
  /** Server-confirmed current status from useResponderSummary */
  currentStatus: string;
}

/**
 * Three-state availability selector (AVAILABLE / OFF_DUTY / UNAVAILABLE).
 * Disabled while a mutation is in flight or the device is offline.
 * Shows inline error text on 409 ACTIVE_ASSIGNMENT without changing the
 * displayed state (server-confirmed status is the only source of truth).
 */
export function AvailabilityControl({ currentStatus }: Props) {
  const mutation    = useUpdateAvailability();
  const { isOnline } = useNetworkStatus();
  const isDisabled  = mutation.isPending || !isOnline;
  const isConflict  = mutation.isError && mutation.error?.message === 'ACTIVE_ASSIGNMENT';
  const isGenericError = mutation.isError && !isConflict;

  return (
    <View>
      <View style={styles.row}>
        {OPTIONS.map((opt) => {
          const active = currentStatus === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.chip,
                active && { backgroundColor: `${opt.color}18`, borderColor: opt.color },
                !active && isDisabled && styles.chipDisabled,
              ]}
              onPress={() => {
                if (!active && !isDisabled) mutation.mutate({ status: opt.value });
              }}
              disabled={isDisabled && !active}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: isDisabled }}
              accessibilityLabel={opt.label}
            >
              <View style={[styles.dot, { backgroundColor: opt.color }]} />
              <Text style={[styles.chipText, active && { color: opt.color, fontWeight: '700' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {mutation.isPending && (
          <ActivityIndicator size="small" color="#8795A3" style={styles.spinner} />
        )}
      </View>

      {isConflict && (
        <Text style={styles.errorText}>
          Cannot change status while an assignment is active.
        </Text>
      )}
      {isGenericError && (
        <Text style={styles.errorText}>Update failed — please try again.</Text>
      )}
      {!isOnline && (
        <Text style={styles.offlineText}>
          Duty changes require a network connection.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(168,181,193,0.40)',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 6,
    backgroundColor: '#FFFFFF',
    shadowColor: '#8795A3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 1,
  },
  chipDisabled: { opacity: 0.45 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 11, fontWeight: '600', color: '#40536D' },
  spinner: { marginLeft: 4 },
  errorText: { marginTop: 6, fontSize: 12, color: '#D44858' },
  offlineText: { marginTop: 6, fontSize: 12, color: '#D97706' },
});
