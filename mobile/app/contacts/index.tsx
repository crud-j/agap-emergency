import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import {
  listContacts,
  removeContact,
  type EmergencyContact,
} from '../../src/services/api/contacts.api';

export default function ContactsScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: contacts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['emergency-contacts'],
    queryFn: listContacts,
  });

  const deleteMutation = useMutation({
    mutationFn: removeContact,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emergency-contacts'] }),
  });

  function confirmDelete(contact: EmergencyContact) {
    Alert.alert(
      'Remove Contact',
      `Remove ${contact.contact_name} from your emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(contact.id),
        },
      ],
    );
  }

  if (isLoading) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Emergency Contacts" />
        <View style={styles.center}>
          <ActivityIndicator color="#0D6053" size="large" />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Emergency Contacts" />
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>Could not load contacts</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Emergency Contacts" />

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={contacts.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={36} color="#0D6053" />
            </View>
            <Text style={styles.emptyTitle}>No emergency contacts yet</Text>
            <Text style={styles.emptyDesc}>
              Add trusted contacts who will receive an SMS alert when you report an emergency.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <ContactCard
            contact={item}
            rank={index + 1}
            onEdit={() => router.push(`/contacts/${item.id}`)}
            onDelete={() => confirmDelete(item)}
            deleting={deleteMutation.isPending && deleteMutation.variables === item.id}
          />
        )}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/contacts/add')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

function ContactCard({
  contact,
  rank,
  onEdit,
  onDelete,
  deleting,
}: {
  contact: EmergencyContact;
  rank: number;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const rankColors = ['#0D6053', '#1D7A6A', '#2E9478'];
  const rankColor = rankColors[Math.min(rank - 1, rankColors.length - 1)];

  return (
    <View style={styles.card}>
      <View style={[styles.rankBadge, { backgroundColor: rankColor }]}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.contactName}>{contact.contact_name}</Text>
          {contact.notify_on_alert && (
            <View style={styles.notifyBadge}>
              <Ionicons name="notifications" size={11} color="#0D6053" />
              <Text style={styles.notifyText}>Alert</Text>
            </View>
          )}
        </View>

        {contact.relationship ? (
          <Text style={styles.relationship}>{contact.relationship}</Text>
        ) : null}

        <View style={styles.phoneRow}>
          <Ionicons name="call-outline" size={13} color="#6B7280" />
          <Text style={styles.phoneText}>{contact.phone_number}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={onEdit} hitSlop={8}>
          <Ionicons name="pencil-outline" size={18} color="#0D6053" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onDelete} hitSlop={8} disabled={deleting}>
          {deleting ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyContainer: { flexGrow: 1 },
  list: { padding: 16, gap: 12 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E7F6F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#0D6053', borderRadius: 10 },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  cardBody: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  contactName: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  notifyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E7F6F1',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  notifyText: { fontSize: 11, fontWeight: '700', color: '#0D6053' },
  relationship: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phoneText: { fontSize: 13, color: '#374151' },
  actions: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  actionBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0D6053',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
