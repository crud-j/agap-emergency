import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from './screen-header';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Consistent scaffold for module screens that are wired into navigation but
 * whose full feature set is delivered by their own module. Renders a real,
 * on-brand empty state (never a router "not-found") so the profile hub has no
 * dead links.
 */
export function PlaceholderScreen({
  title, icon, description, note = 'In development',
}: {
  title: string; icon: IconName; description: string; note?: string;
}) {
  return (
    <View style={styles.root}>
      <ScreenHeader title={title} />
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={40} color="#0D6053" />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{description}</Text>
        <View style={styles.chip}>
          <View style={styles.chipDot} />
          <Text style={styles.chipText}>{note}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#F0F7F4', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  desc: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7ED', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B', marginRight: 6 },
  chipText: { fontSize: 12, fontWeight: '700', color: '#B45309' },
});
