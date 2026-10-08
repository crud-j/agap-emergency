import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { resetPassword } from '../../src/services/api/auth.api';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { otp } = useLocalSearchParams<{ otp: string }>();
  const t = useTranslations();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isNewVisible, setIsNewVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  function getStrength(): { label: string; color: string; width: string } {
    const len = newPassword.length;
    const hasSpecial = /[^a-zA-Z0-9]/.test(newPassword);
    const hasMixed = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
    if (len < 8) return { label: 'Weak', color: '#EF4444', width: '25%' };
    if (len >= 8 && (hasSpecial || hasMixed)) return { label: 'Good', color: '#F59E0B', width: '60%' };
    if (len >= 10 && hasSpecial && hasMixed) return { label: 'Strong', color: '#10B981', width: '100%' };
    return { label: 'Fair', color: '#F59E0B', width: '45%' };
  }

  async function handleReset() {
    if (newPassword.length < 8) { setError(t.resetPassword.errorWeak); return; }
    if (newPassword !== confirmPassword) { setError(t.resetPassword.errorMismatch); return; }
    setIsLoading(true);
    setError('');
    try {
      await resetPassword({ token: otp, newPassword });
      router.replace('/auth/login');
    } catch (e: any) {
      setError(e.message ?? t.common.error);
    } finally {
      setIsLoading(false);
    }
  }

  const strength = getStrength();
  const canSubmit = newPassword.length >= 8 && confirmPassword.length >= 8;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>

          <View style={styles.textBlock}>
            <Text style={styles.heading}>{t.resetPassword.heading}</Text>
            <Text style={styles.body}>{t.resetPassword.body}</Text>
          </View>

          {/* New password */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>{t.resetPassword.newPasswordLabel}</Text>
            <View style={[styles.inputContainer, focusedField === 'new' && styles.inputFocused]}>
              <Ionicons name="lock-closed-outline" size={20} color={focusedField === 'new' ? '#0D6053' : '#9CA3AF'} style={styles.iconLeft} />
              <TextInput
                style={styles.input}
                placeholder={t.resetPassword.newPasswordPlaceholder}
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!isNewVisible}
                value={newPassword}
                onChangeText={(v) => { setNewPassword(v); setError(''); }}
                onFocus={() => setFocusedField('new')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity onPress={() => setIsNewVisible(!isNewVisible)} style={styles.iconRight}>
                <Ionicons name={isNewVisible ? 'eye-outline' : 'eye-off-outline'} size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            {/* Strength bar */}
            {newPassword.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthTrack}>
                  <View style={[styles.strengthFill, { width: strength.width as any, backgroundColor: strength.color }]} />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
              </View>
            )}
          </View>

          {/* Confirm password */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>{t.resetPassword.confirmLabel}</Text>
            <View style={[styles.inputContainer, focusedField === 'confirm' && styles.inputFocused]}>
              <Ionicons name="lock-closed-outline" size={20} color={focusedField === 'confirm' ? '#0D6053' : '#9CA3AF'} style={styles.iconLeft} />
              <TextInput
                style={styles.input}
                placeholder={t.resetPassword.confirmPlaceholder}
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!isConfirmVisible}
                value={confirmPassword}
                onChangeText={(v) => { setConfirmPassword(v); setError(''); }}
                onFocus={() => setFocusedField('confirm')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity onPress={() => setIsConfirmVisible(!isConfirmVisible)} style={styles.iconRight}>
                <Ionicons name={isConfirmVisible ? 'eye-outline' : 'eye-off-outline'} size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.resetBtn, !canSubmit && styles.resetBtnDisabled]}
            onPress={handleReset}
            disabled={!canSubmit || isLoading}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', '#0A5448']}
              locations={[0, 0.38, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.gradientOverlay}
            >
              {isLoading
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.resetBtnText}>{t.resetPassword.resetBtn}</Text>}
            </LinearGradient>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 },
  backBtn: { marginBottom: 24, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  textBlock: { marginBottom: 32 },
  heading: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 10 },
  body: { fontSize: 15, color: '#6B7280', lineHeight: 22 },
  inputWrapper: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#0D6053', marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderColor: '#D1D5DB', borderRadius: 12, height: 52,
    backgroundColor: '#FFFFFF', paddingHorizontal: 14,
  },
  inputFocused: { borderColor: '#0D6053', backgroundColor: '#F4F9F8' },
  iconLeft: { marginRight: 10 },
  iconRight: { padding: 4 },
  input: { flex: 1, fontSize: 15, color: '#111827', height: '100%' },
  strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
  strengthTrack: { flex: 1, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: '600', width: 48 },
  errorText: { fontSize: 13, color: '#EF4444', marginBottom: 16, paddingHorizontal: 4 },
  resetBtn: { width: '100%', height: 52, borderRadius: 26, backgroundColor: '#0D6053', overflow: 'hidden' },
  resetBtnDisabled: { opacity: 0.5 },
  gradientOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  resetBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
