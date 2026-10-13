import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScreenHeader } from '../../src/components/ui/screen-header';
import { checkConsent, MEDICAL_CONSENT_TYPE } from '../../src/services/api/consent.api';
import {
  getMyMedicalProfile,
  createMedicalProfile,
  updateMedicalProfile,
  type MedicalProfile,
} from '../../src/services/api/medical.api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tagsToText(arr: string[]): string {
  return arr.join(', ');
}

function textToTags(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function MedicalScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const consent = useQuery({
    queryKey: ['consent', MEDICAL_CONSENT_TYPE],
    queryFn: () => checkConsent(MEDICAL_CONSENT_TYPE),
  });

  const granted = consent.data?.granted ?? false;

  const profileQuery = useQuery({
    queryKey: ['medical-profile'],
    queryFn: getMyMedicalProfile,
    enabled: granted,
    retry: false,
  });

  const exists = !profileQuery.isError && !!profileQuery.data;

  if (consent.isLoading) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Medical Profile" />
        <View style={styles.center}>
          <ActivityIndicator color="#0D6053" size="large" />
        </View>
      </View>
    );
  }

  if (!granted) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Medical Profile" />
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Ionicons name="pulse-outline" size={40} color="#0D6053" />
          </View>
          <Text style={styles.title}>Medical Profile</Text>
          <Text style={styles.desc}>
            Store optional medical info that responders can view in an emergency — with your consent.
          </Text>
          <View style={styles.gate}>
            <Ionicons name="lock-closed" size={18} color="#B45309" />
            <Text style={styles.gateText}>
              Grant medical data consent so responders can view this in an emergency.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => router.push('/profile/privacy')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Manage Consent</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Medical Profile" />
      {profileQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0D6053" size="large" />
        </View>
      ) : (
        <ProfileForm
          profile={profileQuery.data ?? null}
          exists={exists}
          onSaved={() => qc.invalidateQueries({ queryKey: ['medical-profile'] })}
        />
      )}
    </View>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function ProfileForm({
  profile,
  exists,
  onSaved,
}: {
  profile: MedicalProfile | null;
  exists: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!exists);
  const [bloodType, setBloodType] = useState(profile?.blood_type ?? '');
  const [allergies, setAllergies] = useState(tagsToText(profile?.allergies ?? []));
  const [medications, setMedications] = useState(tagsToText(profile?.current_medications ?? []));
  const [conditions, setConditions] = useState(tagsToText(profile?.medical_conditions ?? []));
  const [disabilities, setDisabilities] = useState(tagsToText(profile?.disabilities ?? []));
  const [notes, setNotes] = useState(profile?.responder_notes ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) {
      setBloodType(profile.blood_type ?? '');
      setAllergies(tagsToText(profile.allergies));
      setMedications(tagsToText(profile.current_medications));
      setConditions(tagsToText(profile.medical_conditions));
      setDisabilities(tagsToText(profile.disabilities));
      setNotes(profile.responder_notes ?? '');
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const dto = {
        bloodType: bloodType.trim() || undefined,
        allergies: textToTags(allergies),
        currentMedications: textToTags(medications),
        medicalConditions: textToTags(conditions),
        disabilities: textToTags(disabilities),
        responderNotes: notes.trim() || undefined,
      };
      return exists ? updateMedicalProfile(dto) : createMedicalProfile(dto);
    },
    onSuccess: () => {
      setEditing(false);
      onSaved();
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!editing && exists && profile) {
    return (
      <ScrollView contentContainerStyle={styles.form}>
        <View style={styles.consentChip}>
          <Ionicons name="shield-checkmark" size={14} color="#0D6053" />
          <Text style={styles.consentText}>Medical data sharing is ON</Text>
        </View>

        {profile.last_reviewed_at && (
          <Text style={styles.reviewedAt}>
            Last reviewed: {new Date(profile.last_reviewed_at).toLocaleDateString()}
          </Text>
        )}

        <ProfileField label="Blood Type" value={profile.blood_type} />
        <ProfileField label="Allergies" value={tagsToText(profile.allergies)} />
        <ProfileField label="Medications" value={tagsToText(profile.current_medications)} />
        <ProfileField label="Medical Conditions" value={tagsToText(profile.medical_conditions)} />
        <ProfileField label="Disabilities" value={tagsToText(profile.disabilities)} />
        <ProfileField label="Responder Notes" value={profile.responder_notes} />

        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => setEditing(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="pencil-outline" size={16} color="#0D6053" />
          <Text style={styles.editBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.formNote}>
          All fields are optional. This information is only shown to authorized responders during an
          active emergency.
        </Text>

        <FormField label="Blood Type">
          <TextInput
            style={styles.input}
            placeholder="e.g. O+"
            placeholderTextColor="#9CA3AF"
            value={bloodType}
            onChangeText={setBloodType}
            autoCapitalize="characters"
          />
        </FormField>

        <FormField label="Allergies" hint="Separate with commas">
          <TextInput
            style={styles.input}
            placeholder="e.g. Penicillin, Shellfish"
            placeholderTextColor="#9CA3AF"
            value={allergies}
            onChangeText={setAllergies}
          />
        </FormField>

        <FormField label="Current Medications" hint="Separate with commas">
          <TextInput
            style={styles.input}
            placeholder="e.g. Metformin, Amlodipine"
            placeholderTextColor="#9CA3AF"
            value={medications}
            onChangeText={setMedications}
          />
        </FormField>

        <FormField label="Medical Conditions" hint="Separate with commas">
          <TextInput
            style={styles.input}
            placeholder="e.g. Hypertension, Asthma"
            placeholderTextColor="#9CA3AF"
            value={conditions}
            onChangeText={setConditions}
          />
        </FormField>

        <FormField label="Disabilities" hint="Separate with commas">
          <TextInput
            style={styles.input}
            placeholder="e.g. Hearing impairment"
            placeholderTextColor="#9CA3AF"
            value={disabilities}
            onChangeText={setDisabilities}
          />
        </FormField>

        <FormField label="Responder Notes">
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Any additional information for first responders…"
            placeholderTextColor="#9CA3AF"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </FormField>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.btnRow}>
          {exists && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setEditing(false); setError(''); }}
              disabled={saveMutation.isPending}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.saveBtn, saveMutation.isPending && styles.saveBtnDisabled, exists && { flex: 1 }]}
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            activeOpacity={0.85}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>{exists ? 'Save Changes' : 'Create Profile'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ProfileField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue}>{value}</Text>
    </View>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldWrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#F0F7F4', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  desc: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  gate: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF7ED', padding: 14, borderRadius: 12, marginBottom: 16,
  },
  gateText: { flex: 1, fontSize: 13, color: '#B45309', lineHeight: 18 },
  btn: {
    height: 46, borderRadius: 12, backgroundColor: '#0D6053',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  btnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  // Form
  form: { padding: 20 },
  consentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E7F6F1', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, alignSelf: 'flex-start', marginBottom: 4,
  },
  consentText: { fontSize: 13, fontWeight: '700', color: '#0D6053' },
  reviewedAt: { fontSize: 12, color: '#9CA3AF', marginBottom: 16 },
  profileRow: { marginBottom: 14 },
  profileLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  profileValue: { fontSize: 15, color: '#111827' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#0D6053', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 20, alignSelf: 'flex-start', marginTop: 8,
  },
  editBtnText: { fontSize: 14, fontWeight: '700', color: '#0D6053' },

  formNote: { fontSize: 13, color: '#6B7280', lineHeight: 19, marginBottom: 20, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 10 },
  fieldWrap: { marginBottom: 16 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  hint: { fontSize: 11, color: '#9CA3AF' },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827',
  },
  textArea: { minHeight: 80 },
  errorBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { fontSize: 13, color: '#DC2626' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: '#374151', fontSize: 15, fontWeight: '700' },
  saveBtn: {
    flex: 2, backgroundColor: '#0D6053', borderRadius: 12,
    height: 50, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
