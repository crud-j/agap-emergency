import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import {
  listContacts,
  updateContact,
} from '../../src/services/api/contacts.api';

export default function EditContactScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['emergency-contacts'],
    queryFn: listContacts,
  });

  const contact = contacts?.find((c) => c.id === id);

  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notifyOnAlert, setNotifyOnAlert] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (contact) {
      setName(contact.contact_name);
      setRelationship(contact.relationship ?? '');
      setPhone(contact.phone_number);
      setEmail(contact.email ?? '');
      setNotifyOnAlert(contact.notify_on_alert);
    }
  }, [contact]);

  const mutation = useMutation({
    mutationFn: (dto: Parameters<typeof updateContact>[1]) => updateContact(id!, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emergency-contacts'] });
      router.back();
    },
    onError: (err: Error) => setError(err.message),
  });

  function submit() {
    setError('');
    if (!name.trim()) { setError('Name is required'); return; }
    if (!phone.trim()) { setError('Phone number is required'); return; }

    mutation.mutate({
      contactName: name.trim(),
      relationship: relationship.trim() || undefined,
      phoneNumber: phone.trim(),
      email: email.trim() || undefined,
      notifyOnAlert,
    });
  }

  if (isLoading) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Edit Contact" />
        <View style={styles.center}>
          <ActivityIndicator color="#0D6053" size="large" />
        </View>
      </View>
    );
  }

  if (!contact) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Edit Contact" />
        <View style={styles.center}>
          <Text style={styles.notFoundText}>Contact not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.root}>
        <ScreenHeader title="Edit Contact" />
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

          <Field label="Full Name *">
            <TextInput
              style={styles.input}
              placeholder="e.g. Maria dela Cruz"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </Field>

          <Field label="Relationship">
            <TextInput
              style={styles.input}
              placeholder="e.g. Spouse, Parent, Sibling"
              placeholderTextColor="#9CA3AF"
              value={relationship}
              onChangeText={setRelationship}
              autoCapitalize="words"
            />
          </Field>

          <Field label="Phone Number *">
            <TextInput
              style={styles.input}
              placeholder="e.g. 09171234567"
              placeholderTextColor="#9CA3AF"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </Field>

          <Field label="Email (optional)">
            <TextInput
              style={styles.input}
              placeholder="e.g. maria@example.com"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </Field>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Send SMS alert on emergency</Text>
              <Text style={styles.toggleDesc}>
                This contact will receive an SMS when you report an incident.
              </Text>
            </View>
            <Switch
              value={notifyOnAlert}
              onValueChange={setNotifyOnAlert}
              trackColor={{ true: '#0D6053', false: '#D1D5DB' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.saveBtn, mutation.isPending && styles.saveBtnDisabled]}
            onPress={submit}
            disabled={mutation.isPending}
            activeOpacity={0.85}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  notFoundText: { fontSize: 15, color: '#6B7280' },
  form: { padding: 20, gap: 4 },
  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 12,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  toggleDesc: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 13, color: '#DC2626' },
  saveBtn: {
    backgroundColor: '#0D6053',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
