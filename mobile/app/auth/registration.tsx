import React, { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  Animated,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import * as Location from 'expo-location';
import { useAccessibilityStore } from '../../src/stores/accessibility.store';
import type { Language } from '../../src/stores/accessibility.store';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { register, geoCheck } from '../../src/services/api/auth.api';

// ─── Validation schema (address fields removed) ──────────────────────────────

const registerSchema = z.object({
  fullName:        z.string().min(2, 'Full name must be at least 2 characters.'),
  phoneNumber:     z.string().regex(/^(\+63|0)9\d{9}$/, 'Enter a valid Philippine mobile number.'),
  email:           z.string().email('Enter a valid email address.').optional().or(z.literal('')),
  password:        z.string().min(8, 'Password must be at least 8 characters.'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

// ─── Geo-fence ───────────────────────────────────────────────────────────────

// Rough bounding box used as a fast-fail before the server-side PostGIS check.
// The server check is the authoritative gate; this just avoids a network round-trip
// for coordinates that are clearly outside Bocaue.
const BOCAUE_BOUNDS = {
  minLat: 14.770, maxLat: 14.840,
  minLng: 120.885, maxLng: 120.980,
};
function isInBocaueBoundingBox(lat: number, lng: number): boolean {
  return (
    lat >= BOCAUE_BOUNDS.minLat && lat <= BOCAUE_BOUNDS.maxLat &&
    lng >= BOCAUE_BOUNDS.minLng && lng <= BOCAUE_BOUNDS.maxLng
  );
}

// ─── Location step state machine ─────────────────────────────────────────────

type LocationStep =
  | 'permission'   // initial: show rationale + "Allow" button
  | 'requesting'   // OS permission dialog in progress or GPS acquiring
  | 'denied'       // permission permanently denied
  | 'gps_error'    // GPS timeout / low-accuracy failure
  | 'checking'     // server-side geo-fence API call in progress
  | 'outside'      // geo-fence returned inside=false
  | 'geo_error'    // geo-check API threw an error
  | 'inside';      // geo-fence passed → show registration form

// ─── SVG logo fallback ───────────────────────────────────────────────────────

import AgapLogoSvg from '../../assets/icons/agap-svg-icon.svg';

const LOGO_W = 160;
const LOGO_H = 38;

const LANG_DISPLAY: Record<Language, string> = { en: 'English', fil: 'Filipino' };
const LANG_OPTIONS: Language[] = ['en', 'fil'];

const isSvgComponent =
  typeof AgapLogoSvg === 'function' ||
  (typeof AgapLogoSvg === 'object' && AgapLogoSvg !== null);

function AgapLogo() {
  if (isSvgComponent) {
    const Logo = AgapLogoSvg as React.ComponentType<{ width: number; height: number }>;
    return <Logo width={LOGO_W} height={LOGO_H} />;
  }
  return (
    <Image
      source={require('../../assets/icons/agap-icon.png')}
      style={{ width: LOGO_W, height: LOGO_H }}
      resizeMode="contain"
    />
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RegistrationScreen() {
  const router = useRouter();
  const { loadFromStorage, setPreferences, language } = useAccessibilityStore();
  const t = useTranslations();

  // ── Location state ──
  const [locationStep, setLocationStep] = useState<LocationStep>('permission');
  const [capturedCoords, setCapturedCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // ── Form state ──
  const [fullName, setFullName]               = useState('');
  const [mobileNumber, setMobileNumber]       = useState('');
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ── UX state ──
  const [isPasswordVisible, setIsPasswordVisible]               = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [agreeTerms, setAgreeTerms]         = useState(true);
  const [focusedField, setFocusedField]     = useState<string | null>(null);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [isLoading, setIsLoading]           = useState(false);
  const [fieldErrors, setFieldErrors]       = useState<Record<string, string>>({});
  const [apiError, setApiError]             = useState('');
  const [showModal, setShowModal]           = useState(false);
  const [isSuccess, setIsSuccess]           = useState(false);
  const [submittedPhone, setSubmittedPhone] = useState('');
  const checkScale  = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => { loadFromStorage(); }, []);

  // ── Location / geo-fence handlers ──────────────────────────────────────────

  async function handleGeoFenceCheck(skipBoundingBox = false) {
    // Dev-only bypass: set EXPO_PUBLIC_DEV_SKIP_GEO_FENCE=true in .env.development
    if (process.env.EXPO_PUBLIC_DEV_SKIP_GEO_FENCE === 'true') {
      setCapturedCoords({ latitude: 14.7977, longitude: 120.9374 });
      setLocationStep('inside');
      return;
    }

    setLocationStep('requesting');
    try {
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10_000),
      );
      const location = await Promise.race([locationPromise, timeoutPromise]);
      const { latitude, longitude } = location.coords;

      // Client-side bounding box fast-fail (skipped when explicitly retrying after an outside result)
      if (!skipBoundingBox && !isInBocaueBoundingBox(latitude, longitude)) {
        setLocationStep('outside');
        return;
      }

      setLocationStep('checking');
      const result = await geoCheck(latitude, longitude);
      if (result.inside) {
        setCapturedCoords({ latitude, longitude });
        setLocationStep('inside');
      } else {
        setLocationStep('outside');
      }
    } catch (e: any) {
      if (e?.message === 'timeout') {
        setLocationStep('gps_error');
      } else if (e?.message?.toLowerCase().includes('location')) {
        setLocationStep('gps_error');
      } else {
        setLocationStep('geo_error');
      }
    }
  }

  async function handleRequestPermission() {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      await handleGeoFenceCheck();
    } else if (!canAskAgain) {
      setLocationStep('denied');
    } else {
      // Denied but can re-ask: treat as denied for this session
      setLocationStep('denied');
    }
  }

  // ── Registration submit ─────────────────────────────────────────────────────

  async function handleRegister() {
    setFieldErrors({});
    setApiError('');
    const phone = mobileNumber.trim().startsWith('+63')
      ? mobileNumber.trim()
      : `+63${mobileNumber.trim().replace(/^0/, '')}`;

    const result = registerSchema.safeParse({
      fullName: fullName.trim(), phoneNumber: phone,
      email: email.trim() || undefined, password, confirmPassword,
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setFieldErrors(errs);
      return;
    }
    if (!agreeTerms) { setApiError('You must agree to the Terms of Service and Privacy Policy.'); return; }

    checkScale.setValue(0);
    cardOpacity.setValue(0);
    setIsSuccess(false);
    setShowModal(true);
    setIsLoading(true);
    Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    try {
      await register({
        fullName:        fullName.trim(),
        phoneNumber:     phone,
        email:           email.trim() || undefined,
        password,
        confirmPassword,
        latitude:        capturedCoords?.latitude,
        longitude:       capturedCoords?.longitude,
      });
      setSubmittedPhone(phone);
      setIsLoading(false);
      setIsSuccess(true);
      Animated.spring(checkScale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }).start();
      setTimeout(() => {
        setShowModal(false);
        setIsSuccess(false);
        router.push({ pathname: '/auth/verify-otp', params: { mode: 'register', phone } });
      }, 2400);
    } catch (e: any) {
      setShowModal(false);
      setIsLoading(false);
      const msg: string = e.message ?? '';
      if (msg.toLowerCase().includes('phone') || msg.toLowerCase().includes('number')) {
        setApiError(t.registration.errorPhoneExists);
      } else if (msg.toLowerCase().includes('bocaue')) {
        // Server rejected the geo-fence — bounce back to outside screen
        setLocationStep('outside');
      } else {
        setApiError(msg || t.common.error);
      }
    }
  }

  // ── Render: location step screens ──────────────────────────────────────────

  if (locationStep !== 'inside') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, styles.locationScreenContent]}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoBlock}>
            <AgapLogo />
          </View>

          {/* ── Permission rationale ── */}
          {locationStep === 'permission' && (
            <View style={styles.locationCard}>
              <View style={styles.locationIconWrap}>
                <Ionicons name="location-outline" size={40} color="#0D6053" />
              </View>
              <Text style={styles.locationHeading}>Location Required</Text>
              <Text style={styles.locationBody}>
                AGAP is available only within{' '}
                <Text style={styles.locationEmphasis}>Bocaue, Bulacan</Text>. We need your
                precise location to confirm you are within the service area.
              </Text>
              <Text style={styles.locationSubtext}>
                Your location is used only for this one-time check and is not stored or shared.
              </Text>
              <TouchableOpacity
                testID="allow-location-btn"
                style={styles.locationPrimaryBtn}
                activeOpacity={0.85}
                onPress={handleRequestPermission}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', '#0A5448']}
                  locations={[0, 0.38, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.gradientOverlay}
                >
                  <Ionicons name="navigate-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.solidButtonText}>Allow Location Access</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.locationSecondaryBtn}
                activeOpacity={0.7}
                onPress={() => router.push('/auth/login')}
              >
                <Text style={styles.locationSecondaryText}>Already have an account? Sign in</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── GPS acquiring / server check loading ── */}
          {(locationStep === 'requesting' || locationStep === 'checking') && (
            <View style={styles.locationCard}>
              <View style={styles.locationSpinnerWrap}>
                <ActivityIndicator size="large" color="#0D6053" />
              </View>
              <Text style={styles.locationHeading}>
                {locationStep === 'checking' ? 'Verifying your location…' : 'Detecting your location…'}
              </Text>
              <Text style={styles.locationBody}>Please wait a moment</Text>
            </View>
          )}

          {/* ── Permission permanently denied ── */}
          {locationStep === 'denied' && (
            <View style={styles.locationCard}>
              <View style={[styles.locationIconWrap, styles.locationIconError]}>
                <Ionicons name="location-off-outline" size={40} color="#EF4444" />
              </View>
              <Text style={styles.locationHeading}>Permission Required</Text>
              <Text style={styles.locationBody}>
                Location access was denied. Please enable it in your device settings to continue.
              </Text>
              <TouchableOpacity
                style={styles.locationPrimaryBtn}
                activeOpacity={0.85}
                onPress={() => Linking.openSettings()}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', '#0A5448']}
                  locations={[0, 0.38, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.gradientOverlay}
                >
                  <Ionicons name="settings-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.solidButtonText}>Open Settings</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.locationSecondaryBtn}
                activeOpacity={0.7}
                onPress={() => setLocationStep('permission')}
              >
                <Text style={styles.locationSecondaryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── GPS timeout / signal error ── */}
          {locationStep === 'gps_error' && (
            <View style={styles.locationCard}>
              <View style={[styles.locationIconWrap, styles.locationIconError]}>
                <Ionicons name="wifi-outline" size={40} color="#F59E0B" />
              </View>
              <Text style={styles.locationHeading}>Weak GPS Signal</Text>
              <Text style={styles.locationBody}>
                We couldn't determine your location. Move to an open area for a better signal and try again.
              </Text>
              <TouchableOpacity
                style={styles.locationPrimaryBtn}
                activeOpacity={0.85}
                onPress={() => handleGeoFenceCheck()}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', '#0A5448']}
                  locations={[0, 0.38, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.gradientOverlay}
                >
                  <Ionicons name="refresh-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.solidButtonText}>Retry</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Outside Bocaue ── */}
          {locationStep === 'outside' && (
            <View style={styles.locationCard}>
              <View style={[styles.locationIconWrap, styles.locationIconWarning]}>
                <Ionicons name="map-outline" size={40} color="#DC2626" />
              </View>
              <Text style={styles.locationHeading}>Service Not Available in Your Area</Text>
              <Text style={styles.locationBody}>
                AGAP is currently only available to residents and workers within{' '}
                <Text style={styles.locationEmphasis}>Bocaue, Bulacan</Text>.
              </Text>
              <Text style={styles.locationSubtext}>
                If you need emergency help right now, please call:
              </Text>
              <TouchableOpacity onPress={() => Linking.openURL('tel:911')}>
                <Text style={styles.emergencyPhoneLink}>911 — National Emergency Hotline</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openURL('tel:+6344691-1830')}>
                <Text style={styles.emergencyPhoneLink}>Bocaue MDRRMO Hotline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.locationPrimaryBtn, { marginTop: 24 }]}
                activeOpacity={0.85}
                onPress={() => handleGeoFenceCheck(true)}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', '#0A5448']}
                  locations={[0, 0.38, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.gradientOverlay}
                >
                  <Ionicons name="refresh-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.solidButtonText}>Try Again</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Geo-check API error ── */}
          {locationStep === 'geo_error' && (
            <View style={styles.locationCard}>
              <View style={[styles.locationIconWrap, styles.locationIconError]}>
                <Ionicons name="cloud-offline-outline" size={40} color="#EF4444" />
              </View>
              <Text style={styles.locationHeading}>Unable to Verify Location</Text>
              <Text style={styles.locationBody}>
                We couldn't connect to our verification service. Please check your internet connection and try again.
              </Text>
              <TouchableOpacity
                style={styles.locationPrimaryBtn}
                activeOpacity={0.85}
                onPress={() => handleGeoFenceCheck()}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', '#0A5448']}
                  locations={[0, 0.38, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.gradientOverlay}
                >
                  <Ionicons name="refresh-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.solidButtonText}>Retry</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render: registration form (geo-fence passed) ────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Top Bar: Language Selector ── */}
          <View style={styles.topBar}>
            <View style={styles.langContainer}>
              <TouchableOpacity
                style={styles.langSelector}
                activeOpacity={0.7}
                onPress={() => setShowLangDropdown(v => !v)}
              >
                <Ionicons name="globe-outline" size={16} color="#111827" />
                <Text style={styles.langText}>{LANG_DISPLAY[language]}</Text>
                <Ionicons
                  name={showLangDropdown ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={16}
                  color="#111827"
                />
              </TouchableOpacity>
              {showLangDropdown && (
                <View style={styles.langDropdown}>
                  {LANG_OPTIONS.map((lang) => (
                    <TouchableOpacity
                      key={lang}
                      style={[styles.langOption, language === lang && styles.langOptionSelected]}
                      onPress={() => {
                        void setPreferences({ language: lang });
                        setShowLangDropdown(false);
                      }}
                    >
                      {language === lang && (
                        <Ionicons name="checkmark" size={14} color="#0D6053" style={{ marginRight: 6 }} />
                      )}
                      <Text style={[styles.langOptionText, language === lang && styles.langOptionTextSelected]}>
                        {LANG_DISPLAY[lang]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* ── Logo ── */}
          <View style={styles.logoBlock}>
            <AgapLogo />
          </View>

          {/* ── Header Texts ── */}
          <View style={styles.textBlock}>
            <MaskedView maskElement={<Text style={styles.heading}>{t.registration.heading}</Text>}>
              <LinearGradient
                colors={['#098B81', '#004141']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.heading, { opacity: 0 }]}>{t.registration.heading}</Text>
              </LinearGradient>
            </MaskedView>
            <Text style={styles.body}>{t.registration.body}</Text>
          </View>

          {/* ── Location confirmed badge ── */}
          <View style={styles.locationBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#0D6053" />
            <Text style={styles.locationBadgeText}>Location confirmed — Bocaue, Bulacan</Text>
          </View>

          {/* ── Form Fields ── */}
          <View style={styles.formBlock}>

            {/* Full Name */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>{t.registration.fullName}</Text>
              <View style={[styles.inputContainer, focusedField === 'name' && styles.inputContainerFocused]}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={focusedField === 'name' ? '#0D6053' : '#9CA3AF'}
                  style={styles.inputIconLeft}
                />
                <TextInput
                  testID="fullname-input"
                  style={styles.textInput}
                  placeholder={t.registration.fullNamePlaceholder}
                  placeholderTextColor="#9CA3AF"
                  value={fullName}
                  onChangeText={setFullName}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Mobile Number */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>{t.registration.mobile}</Text>
              <View style={[styles.inputContainer, focusedField === 'mobile' && styles.inputContainerFocused]}>
                <Ionicons
                  name="phone-portrait-outline"
                  size={20}
                  color={focusedField === 'mobile' ? '#0D6053' : '#9CA3AF'}
                  style={styles.inputIconLeft}
                />
                <Text style={styles.countryCodeText}>+63</Text>
                <View style={styles.verticalDivider} />
                <TextInput
                  testID="phone-input"
                  style={styles.textInput}
                  placeholder="9XX XXX XXXX"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={mobileNumber}
                  onChangeText={setMobileNumber}
                  onFocus={() => setFocusedField('mobile')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              {fieldErrors.phoneNumber ? (
                <Text style={styles.fieldError}>{fieldErrors.phoneNumber}</Text>
              ) : (
                <Text style={styles.helperText}>{t.registration.mobileHelper}</Text>
              )}
            </View>

            {/* Email */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>{t.registration.email}</Text>
              <View style={[styles.inputContainer, focusedField === 'email' && styles.inputContainerFocused]}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={focusedField === 'email' ? '#0D6053' : '#9CA3AF'}
                  style={styles.inputIconLeft}
                />
                <TextInput
                  testID="email-input"
                  style={styles.textInput}
                  placeholder={t.registration.emailPlaceholder}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              {fieldErrors.email ? (
                <Text style={styles.fieldError}>{fieldErrors.email}</Text>
              ) : (
                <Text style={styles.helperText}>{t.registration.emailHelper}</Text>
              )}
            </View>

            {/* Password */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>{t.registration.password}</Text>
              <View style={[styles.inputContainer, focusedField === 'password' && styles.inputContainerFocused]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={focusedField === 'password' ? '#0D6053' : '#9CA3AF'}
                  style={styles.inputIconLeft}
                />
                <TextInput
                  testID="password-input"
                  style={styles.textInput}
                  placeholder={t.registration.passwordPlaceholder}
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!isPasswordVisible}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity
                  onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                  style={styles.inputIconRight}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
                    size={22}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>
              {fieldErrors.password ? (
                <Text style={styles.fieldError}>{fieldErrors.password}</Text>
              ) : (
                <Text style={styles.helperText}>{t.registration.passwordHelper}</Text>
              )}
            </View>

            {/* Confirm Password */}
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>{t.registration.confirmPassword}</Text>
              <View style={[styles.inputContainer, focusedField === 'confirm' && styles.inputContainerFocused]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={focusedField === 'confirm' ? '#0D6053' : '#9CA3AF'}
                  style={styles.inputIconLeft}
                />
                <TextInput
                  testID="confirm-password-input"
                  style={styles.textInput}
                  placeholder={t.registration.confirmPlaceholder}
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!isConfirmPasswordVisible}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity
                  onPress={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)}
                  style={styles.inputIconRight}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={isConfirmPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
                    size={22}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
              </View>
              {fieldErrors.confirmPassword ? (
                <Text style={[styles.fieldError, { marginTop: 6, paddingHorizontal: 4 }]}>
                  {fieldErrors.confirmPassword}
                </Text>
              ) : null}
            </View>

            {/* Terms */}
            <View style={styles.termsBlock}>
              <TouchableOpacity
                style={styles.checkboxWrapper}
                onPress={() => setAgreeTerms(!agreeTerms)}
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
              >
                <View style={[styles.checkbox, agreeTerms && styles.checkboxActive]}>
                  {agreeTerms && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                </View>
              </TouchableOpacity>
              <View style={styles.termsTextContent}>
                <Text style={styles.termsPrimaryText}>
                  I have read and agree to the{' '}
                  <Text style={styles.linkText}>Terms of Service</Text> and{' '}
                  <Text style={styles.linkText}>Privacy Policy.</Text>
                </Text>
                <Text style={styles.termsSubText}>
                  Your information will be used only for emergency response and will be kept secure and confidential.
                </Text>
              </View>
            </View>
          </View>

          {/* ── Error banner ── */}
          {apiError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={styles.errorBannerText}>{apiError}</Text>
            </View>
          ) : null}

          {/* ── Action Buttons ── */}
          <View style={styles.actionBlock}>
            <TouchableOpacity
              testID="register-submit-btn"
              activeOpacity={0.85}
              style={styles.solidButtonContainer}
              onPress={handleRegister}
              disabled={isLoading}
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
                  : <Text style={styles.solidButtonText}>{t.registration.createBtn}</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity activeOpacity={0.85} style={styles.emergencyButtonContainer}>
              <LinearGradient
                colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.05)']}
                locations={[0, 0.4, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.gradientOverlay}
              >
                <Ionicons name="information-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.solidButtonText}>{t.registration.emergencyBtn}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* ── Footer Link ── */}
          <TouchableOpacity
            style={styles.footerLinkRow}
            activeOpacity={0.7}
            onPress={() => router.push('/auth/login')}
            hitSlop={{ top: 15, bottom: 15 }}
          >
            <Text style={styles.footerText}>
              {t.registration.alreadyHave}{' '}
              <Text style={styles.footerLinkText}>{t.registration.signIn}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Registration Status Modal ── */}
      <Modal visible={showModal} transparent animationType="none" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalCard, { opacity: cardOpacity }]}>
            {!isSuccess ? (
              <>
                <View style={styles.modalSpinnerWrap}>
                  <ActivityIndicator size="large" color="#0D6053" />
                </View>
                <Text style={styles.modalTitle}>Creating your account…</Text>
                <Text style={styles.modalSubtext}>Please wait a moment</Text>
              </>
            ) : (
              <>
                <Animated.View style={[styles.successCircle, { transform: [{ scale: checkScale }] }]}>
                  <Ionicons name="checkmark" size={40} color="#FFFFFF" />
                </Animated.View>
                <Text style={styles.modalTitle}>Account Created!</Text>
                <Text style={styles.modalName}>Welcome, {fullName.trim()}!</Text>
                <Text style={styles.modalSubtext}>We sent a 6-digit verification code to</Text>
                <Text style={styles.modalPhone}>{submittedPhone}</Text>
                <View style={styles.modalDivider} />
                <Text style={styles.modalFooter}>Redirecting to verification…</Text>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  locationScreenContent: {
    justifyContent: 'center',
    minHeight: '100%',
  },

  // ── Location step screens ──
  locationCard: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 8,
    gap: 12,
  },
  locationIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0FBF9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  locationIconError: {
    backgroundColor: '#FEF2F2',
  },
  locationIconWarning: {
    backgroundColor: '#FEF2F2',
  },
  locationSpinnerWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0FBF9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  locationHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  locationBody: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 22,
  },
  locationEmphasis: {
    fontWeight: '700',
    color: '#0D6053',
  },
  locationSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 19,
  },
  locationPrimaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0D6053',
    overflow: 'hidden',
    marginTop: 8,
  },
  locationSecondaryBtn: {
    marginTop: 4,
    paddingVertical: 12,
  },
  locationSecondaryText: {
    fontSize: 14,
    color: '#0D6053',
    fontWeight: '600',
    textAlign: 'center',
  },
  emergencyPhoneLink: {
    fontSize: 15,
    color: '#DC2626',
    fontWeight: '700',
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: 4,
  },

  // ── Location confirmed badge (inside form) ──
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FBF9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
    gap: 8,
  },
  locationBadgeText: {
    fontSize: 13,
    color: '#0D6053',
    fontWeight: '600',
  },

  // ── Top Bar ──
  topBar: {
    alignItems: 'flex-end',
    marginBottom: 16,
    zIndex: 20,
  },
  langContainer: {
    position: 'relative',
    zIndex: 20,
  },
  langSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  langText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },
  langDropdown: {
    position: 'absolute',
    top: 36,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
    minWidth: 130,
    overflow: 'hidden',
    zIndex: 30,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  langOptionSelected: {
    backgroundColor: '#F4F9F8',
  },
  langOptionText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  langOptionTextSelected: {
    color: '#0D6053',
    fontWeight: '700',
  },

  // ── Header & Logo ──
  logoBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  textBlock: {
    marginBottom: 24,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },

  // ── Form ──
  formBlock: {
    marginBottom: 24,
    gap: 16,
  },
  inputWrapper: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D6053',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    height: 52,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  inputContainerFocused: {
    borderColor: '#0D6053',
    backgroundColor: '#F4F9F8',
  },
  inputIconLeft: {
    marginRight: 10,
  },
  inputIconRight: {
    padding: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    height: '100%',
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0D6053',
    marginRight: 12,
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
    marginRight: 12,
  },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
    paddingHorizontal: 4,
  },
  fieldError: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
    paddingHorizontal: 4,
  },

  // ── Terms ──
  termsBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  checkboxWrapper: {
    marginTop: 2,
    marginRight: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: '#0D6053',
    borderColor: '#0D6053',
  },
  termsTextContent: {
    flex: 1,
  },
  termsPrimaryText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 4,
  },
  linkText: {
    color: '#0D6053',
    fontWeight: '600',
  },
  termsSubText: {
    fontSize: 11,
    color: '#9CA3AF',
    lineHeight: 16,
  },

  // ── Error banner ──
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#EF4444',
    lineHeight: 18,
  },

  // ── Buttons ──
  actionBlock: {
    gap: 16,
    marginBottom: 32,
  },
  solidButtonContainer: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0D6053',
    overflow: 'hidden',
  },
  emergencyButtonContainer: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FF5C6F',
    overflow: 'hidden',
  },
  gradientOverlay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },

  // ── Footer ──
  footerLinkRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  footerText: {
    fontSize: 14,
    color: '#4B5563',
  },
  footerLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D6053',
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 40,
    paddingHorizontal: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  modalSpinnerWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F0FBF9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0D6053',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0D6053',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalPhone: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 4,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  modalDivider: {
    width: 40,
    height: 2,
    backgroundColor: '#E5E7EB',
    borderRadius: 1,
    marginVertical: 16,
  },
  modalFooter: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
