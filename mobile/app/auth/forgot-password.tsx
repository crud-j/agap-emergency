import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { forgotPassword } from '../../src/services/api/auth.api';

const PHONE_REGEX = /^(\+63|0)9\d{9}$/;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const t = useTranslations();

  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  async function handleSend() {
    const normalized = phone.trim().startsWith('+63') ? phone.trim() : `+63${phone.trim().replace(/^0/, '')}`;
    if (!PHONE_REGEX.test(phone.trim()) && !phone.trim().startsWith('+63')) {
      setError('Enter a valid Philippine mobile number (e.g. 09XX XXX XXXX).');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await forgotPassword(normalized);
      router.push({ pathname: '/auth/verify-otp', params: { mode: 'forgot-password', phone: normalized } });
    } catch {
      // Generic message — backend intentionally doesn't reveal if account exists
      router.push({ pathname: '/auth/verify-otp', params: { mode: 'forgot-password', phone: normalized } });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>

          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>

          <View style={styles.textBlock}>
            <Text style={styles.heading}>{t.forgotPassword.heading}</Text>
            <Text style={styles.body}>{t.forgotPassword.body}</Text>
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>{t.forgotPassword.mobileLabel}</Text>
            <View style={[styles.inputContainer, isFocused && styles.inputFocused]}>
              <Ionicons name="phone-portrait-outline" size={20} color={isFocused ? '#0D6053' : '#9CA3AF'} style={styles.iconLeft} />
              <Text style={styles.countryCode}>+63</Text>
              <View style={styles.divider} />
              <TextInput
                style={styles.input}
                placeholder={t.forgotPassword.mobilePlaceholder}
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(v) => { setPhone(v); setError(''); }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.sendBtn}
            onPress={handleSend}
            disabled={isLoading || !phone.trim()}
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
                : <Text style={styles.sendBtnText}>{t.forgotPassword.sendBtn}</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/auth/login')}>
            <Text style={styles.backLinkText}>{t.forgotPassword.backToLogin}</Text>
          </TouchableOpacity>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 12 },
  backBtn: { marginBottom: 24, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  textBlock: { marginBottom: 32 },
  heading: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 10 },
  body: { fontSize: 15, color: '#6B7280', lineHeight: 22 },
  inputWrapper: { marginBottom: 24 },
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#0D6053', marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderColor: '#D1D5DB', borderRadius: 12, height: 52,
    backgroundColor: '#FFFFFF', paddingHorizontal: 14,
  },
  inputFocused: { borderColor: '#0D6053', backgroundColor: '#F4F9F8' },
  iconLeft: { marginRight: 10 },
  countryCode: { fontSize: 15, fontWeight: '600', color: '#0D6053', marginRight: 12 },
  divider: { width: 1, height: 24, backgroundColor: '#E5E7EB', marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: '#111827', height: '100%' },
  errorText: { fontSize: 13, color: '#EF4444', marginTop: 6, paddingHorizontal: 4 },
  sendBtn: { width: '100%', height: 52, borderRadius: 26, backgroundColor: '#0D6053', overflow: 'hidden', marginBottom: 16 },
  gradientOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  backLink: { alignItems: 'center', paddingVertical: 12 },
  backLinkText: { fontSize: 14, fontWeight: '600', color: '#0D6053' },
});
