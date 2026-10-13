import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { subscribeToSms } from '@/src/services/api/announcements.api';

const TEAL = '#0D6053';

// Key Bocaue barangays — flood-prone (Lolomboy, Bunlo, Igulot, Bambang) and
// industrial-risk (Bundukan, Biñang 1st) listed first per operational priority.
const BOCAUE_BARANGAYS = [
  'Lolomboy', 'Bunlo', 'Igulot', 'Bambang',
  'Bundukan', 'Biñang 1st',
  'Batia', 'Bolacan', 'Duhat', 'Ganap', 'Masile',
  'Panghulo', 'Pugad', 'Saog', 'Turo', 'Wakas',
  'Poblacion',
];

type Step = 'form' | 'success';

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('09') && digits.length === 11) {
    return '+63' + digits.slice(1);
  }
  if (digits.startsWith('639') && digits.length === 12) {
    return '+' + digits;
  }
  return raw.trim();
}

function isValidPHPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return (digits.startsWith('09') && digits.length === 11)
    || (digits.startsWith('639') && digits.length === 12);
}

export default function SmsSubscribeScreen() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('form');
  const [phone, setPhone] = useState('');
  const [barangay, setBarangay] = useState('');
  const [consented, setConsented] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBarangayPicker, setShowBarangayPicker] = useState(false);

  async function handleSubmit() {
    if (!phone.trim()) { setError('Please enter your mobile number.'); return; }
    if (!isValidPHPhone(phone)) {
      setError('Enter a valid Philippine mobile number (e.g. 09171234567).');
      return;
    }
    if (!consented) {
      setError('Please confirm you consent to receiving SMS from MDRRMO.');
      return;
    }
    try {
      setError(null);
      setLoading(true);
      await subscribeToSms(
        normalizePhone(phone),
        barangay || undefined,
      );
      setStep('success');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Subscription failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'success') {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SMS Subscription</Text>
          <View style={{ width: 40 }} />
        </SafeAreaView>

        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={56} color={TEAL} />
          </View>
          <Text style={styles.successTitle}>You're subscribed!</Text>
          <Text style={styles.successSub}>
            You'll receive official MDRRMO announcements via SMS at{' '}
            <Text style={{ fontWeight: '700' }}>{phone}</Text>.
          </Text>
          <Text style={styles.successHint}>
            Reply <Text style={{ fontWeight: '700' }}>STOP</Text> to any SMS to opt out at any time.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
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
        <SafeAreaView edges={['top']} style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SMS Subscription</Text>
          <View style={{ width: 40 }} />
        </SafeAreaView>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Info block */}
          <View style={styles.infoBlock}>
            <View style={styles.infoIcon}>
              <Ionicons name="chatbox-ellipses" size={20} color={TEAL} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>No account required</Text>
              <Text style={styles.infoBody}>
                Enter your Philippine mobile number to receive official Bocaue MDRRMO announcements by SMS — including flood alerts, evacuation orders, and class suspensions.
              </Text>
            </View>
          </View>

          {/* Phone number */}
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>
              Mobile Number <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.phoneRow}>
              <View style={styles.phonePrefix}>
                <Text style={styles.phonePrefixText}>🇵🇭 +63</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={(t) => { setPhone(t); setError(null); }}
                placeholder="9171234567"
                placeholderTextColor="#C4CDD6"
                keyboardType="phone-pad"
                maxLength={11}
                accessibilityLabel="Mobile number"
              />
            </View>
            <Text style={styles.fieldHint}>Enter as 09171234567 or 9171234567</Text>
          </View>

          {/* Barangay preference */}
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>
              Barangay <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TouchableOpacity
              style={styles.barangayPicker}
              onPress={() => setShowBarangayPicker(!showBarangayPicker)}
              accessibilityRole="button"
              accessibilityLabel="Select barangay"
            >
              <Text style={[styles.barangayText, !barangay && { color: '#C4CDD6' }]}>
                {barangay || 'All barangays (municipality-wide)'}
              </Text>
              <Ionicons name={showBarangayPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
            </TouchableOpacity>

            {showBarangayPicker && (
              <View style={styles.barangayList}>
                <TouchableOpacity
                  style={[styles.barangayOption, !barangay && styles.barangayOptionActive]}
                  onPress={() => { setBarangay(''); setShowBarangayPicker(false); }}
                >
                  <Text style={[styles.barangayOptionText, !barangay && styles.barangayOptionTextActive]}>
                    All barangays
                  </Text>
                  {!barangay && <Ionicons name="checkmark" size={14} color={TEAL} />}
                </TouchableOpacity>
                {BOCAUE_BARANGAYS.map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[styles.barangayOption, barangay === b && styles.barangayOptionActive]}
                    onPress={() => { setBarangay(b); setShowBarangayPicker(false); }}
                  >
                    <Text style={[styles.barangayOptionText, barangay === b && styles.barangayOptionTextActive]}>
                      {b}
                    </Text>
                    {barangay === b && <Ionicons name="checkmark" size={14} color={TEAL} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={styles.fieldHint}>
              Choose your barangay to receive locally relevant alerts. Leave blank for all announcements.
            </Text>
          </View>

          {/* Consent */}
          <TouchableOpacity
            style={styles.consentRow}
            onPress={() => { setConsented(!consented); setError(null); }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consented }}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, consented && styles.checkboxChecked]}>
              {consented && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
            </View>
            <Text style={styles.consentText}>
              I consent to receive SMS messages from the Bocaue MDRRMO regarding official public announcements. I understand I can reply <Text style={{ fontWeight: '700' }}>STOP</Text> to unsubscribe at any time.
            </Text>
          </TouchableOpacity>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={14} color="#D44858" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (loading || !consented) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading || !consented}
            accessibilityRole="button"
            accessibilityLabel="Subscribe to SMS alerts"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.submitText}>Subscribe to SMS Alerts</Text>
              </>
            )}
          </TouchableOpacity>

          {/* One-way notice */}
          <View style={styles.broadcastNotice}>
            <Ionicons name="radio-outline" size={13} color="#9CA3AF" style={{ marginRight: 6 }} />
            <Text style={styles.broadcastText}>
              One-way broadcast only. SMS will never include personal or health data.
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168,181,193,0.18)',
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center' },

  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },

  // Info block
  infoBlock: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#EEF7F4',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(13,96,83,0.15)',
    marginBottom: 24,
  },
  infoIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 4 },
  infoBody:  { fontSize: 12, color: '#6B7280', lineHeight: 17 },

  // Fields
  fieldWrap: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  required: { color: '#D44858' },
  optional: { color: '#9CA3AF', fontWeight: '400', textTransform: 'none' },
  fieldHint: { fontSize: 11, color: '#9CA3AF', marginTop: 5, lineHeight: 15 },

  phoneRow: { flexDirection: 'row', gap: 8 },
  phonePrefix: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(168,181,193,0.30)',
    backgroundColor: '#F9FAFB',
    alignItems: 'center', justifyContent: 'center',
  },
  phonePrefixText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  phoneInput: {
    flex: 1, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(168,181,193,0.30)',
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: '#111827', letterSpacing: 0.5,
    backgroundColor: '#FFFFFF',
  },

  barangayPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(168,181,193,0.30)',
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FFFFFF',
  },
  barangayText: { fontSize: 14, color: '#111827' },
  barangayList: {
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(168,181,193,0.30)',
    marginTop: 4, backgroundColor: '#FFFFFF', overflow: 'hidden',
  },
  barangayOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  barangayOptionActive: { backgroundColor: '#EEF7F4' },
  barangayOptionText:       { fontSize: 14, color: '#374151' },
  barangayOptionTextActive: { color: TEAL, fontWeight: '600' },

  // Consent
  consentRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    marginBottom: 20,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: TEAL, borderColor: TEAL },
  consentText: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 19 },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FDF0F1',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 16, borderWidth: 1, borderColor: 'rgba(212,72,88,0.18)',
  },
  errorText: { flex: 1, fontSize: 13, color: '#D44858' },

  // Submit
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: TEAL, borderRadius: 14,
    height: 54, marginBottom: 16,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Broadcast notice
  broadcastNotice: { flexDirection: 'row', alignItems: 'flex-start' },
  broadcastText:   { flex: 1, fontSize: 11, color: '#9CA3AF', lineHeight: 16 },

  // Success
  successWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#EEF7F4',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 10 },
  successSub:   { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 10 },
  successHint:  { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18, marginBottom: 28 },
  doneBtn: {
    backgroundColor: TEAL, borderRadius: 14,
    paddingHorizontal: 40, paddingVertical: 14,
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
