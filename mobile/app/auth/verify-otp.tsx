import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { useAuthStore } from '../../src/stores/auth.store';
import { verifyPhoneOtp, loginWithPhone } from '../../src/services/api/auth.api';
import { homeRouteForRole } from '../../src/lib/role-routing';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `+63 *** *** ${digits.slice(-4)}`;
}

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { mode, phone } = useLocalSearchParams<{ mode: 'register' | 'login' | 'forgot-password'; phone: string }>();
  const t = useTranslations();
  const login = useAuthStore((s) => s.login);

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  function handleChange(value: string, index: number) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setError('');
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleResend() {
    if (!phone || countdown > 0) return;
    try {
      await loginWithPhone(phone);
      setCountdown(RESEND_SECONDS);
      setOtp(Array(OTP_LENGTH).fill(''));
      setError('');
      inputRefs.current[0]?.focus();
    } catch {
      setError(t.common.error);
    }
  }

  async function handleVerify() {
    const code = otp.join('');
    if (code.length < OTP_LENGTH || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsLoading(true);
    setError('');
    try {
      if (mode === 'forgot-password') {
        router.push({ pathname: '/auth/reset-password', params: { phone, otp: code } });
        return;
      }
      const res = await verifyPhoneOtp(phone, code);
      if (!res?.accessToken || !res?.refreshToken) {
        // Backend responded 2xx but without tokens — treat as a real failure
        // instead of silently stranding the user on this screen.
        throw new Error('Verification response was incomplete. Please try again.');
      }
      await login({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.user);
      // Proceed immediately. The root AuthGuard also redirects on auth state
      // change, but navigating here guarantees the screen advances even if the
      // guard has not re-run yet. Route by role (rescuers → responder flow).
      router.replace(homeRouteForRole(res.user.role) as never);
    } catch (e: any) {
      const msg = e.message?.toLowerCase() ?? '';
      const status = typeof e?.status === 'number' ? e.status : undefined;
      if (
        (status !== undefined && status >= 500) ||
        msg.includes('unavailable') ||
        msg.includes('try again in a moment')
      ) {
        setError(t.verifyOtp.errorService);
      } else if (msg.includes('expired')) {
        setError(t.verifyOtp.errorExpired);
      } else if (status !== undefined && status >= 400 && status < 500) {
        setError(t.verifyOtp.errorInvalid);
      } else if (msg.includes('invalid') || msg.includes('incorrect')) {
        setError(t.verifyOtp.errorInvalid);
      } else {
        setError(t.common.error);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
    }
  }

  const codeFilled = otp.every((d) => d !== '');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>

          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>

          <View style={styles.textBlock}>
            <Text style={styles.heading}>{t.verifyOtp.heading}</Text>
            <Text style={styles.body}>
              {t.verifyOtp.body}{' '}
              <Text style={styles.phoneHighlight}>{maskPhone(phone ?? '')}</Text>
            </Text>
          </View>

          {/* OTP boxes */}
          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                testID={`otp-input-${i}`}
                ref={(r) => { inputRefs.current[i] = r; }}
                style={[styles.otpBox, digit ? styles.otpBoxFilled : null, error ? styles.otpBoxError : null]}
                value={digit}
                onChangeText={(v) => handleChange(v, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                textAlign="center"
              />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendPrompt}>{t.verifyOtp.resendPrompt} </Text>
            {countdown > 0 ? (
              <Text style={styles.resendCountdown}>{t.verifyOtp.resendIn} {countdown}s</Text>
            ) : (
              <TouchableOpacity testID="resend-btn" onPress={handleResend}>
                <Text style={styles.resendLink}>{t.verifyOtp.resendBtn}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Verify button */}
          <TouchableOpacity
            testID="verify-submit-btn"
            activeOpacity={0.85}
            style={[styles.verifyBtn, !codeFilled && styles.verifyBtnDisabled]}
            onPress={handleVerify}
            disabled={!codeFilled || isLoading}
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
                : <Text style={styles.verifyBtnText}>{t.verifyOtp.verifyBtn}</Text>}
            </LinearGradient>
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
  textBlock: { marginBottom: 36 },
  heading: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 10 },
  body: { fontSize: 15, color: '#6B7280', lineHeight: 22 },
  phoneHighlight: { fontWeight: '700', color: '#0D6053' },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  otpBox: {
    width: 48, height: 56, borderRadius: 12, borderWidth: 1.5,
    borderColor: '#D1D5DB', backgroundColor: '#FFFFFF',
    fontSize: 22, fontWeight: '700', color: '#111827',
    textAlign: 'center',
  },
  otpBoxFilled: { borderColor: '#0D6053', backgroundColor: '#F4F9F8' },
  otpBoxError: { borderColor: '#EF4444' },
  errorText: { fontSize: 13, color: '#EF4444', textAlign: 'center', marginBottom: 12 },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  resendPrompt: { fontSize: 14, color: '#6B7280' },
  resendCountdown: { fontSize: 14, color: '#9CA3AF' },
  resendLink: { fontSize: 14, fontWeight: '700', color: '#0D6053' },
  verifyBtn: { width: '100%', height: 52, borderRadius: 26, backgroundColor: '#0D6053', overflow: 'hidden' },
  verifyBtnDisabled: { opacity: 0.5 },
  gradientOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  verifyBtnText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
