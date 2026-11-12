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
import { register, geoCheck, IdVerificationError } from '../../src/services/api/auth.api';
import { useIncidentStore } from '../../src/stores/incident.store';
import { DEFAULT_ID_DOCUMENT_TYPE, IdVerificationErrorCode, isCoordinateInBocaue, type IdDocumentType, type IdScanResponse } from '@agap/shared';
import IdScanStep, { type IdStep } from '../../src/components/registration/IdScanStep';
import NameFields, { EMPTY_NAME, type NameValues } from '../../src/components/registration/NameFields';
import PasswordStrengthMeter from '../../src/components/registration/PasswordStrengthMeter';
import {
  canCreateAccount,
  checkTypedName,
  prefillNameFromId,
  retryMessageKey,
  typedIdName,
} from '../../src/lib/id-verification';

// ─── Validation schema (address fields removed) ──────────────────────────────

const registerSchema = z.object({
  // MOD-01: the name in parts, checked against the chosen ID (plan §3).
  lastName:        z.string().min(1, 'Enter your last name.').max(100),
  firstName:       z.string().min(1, 'Enter your first name.').max(100),
  middleName:      z.string().max(100).optional(),
  suffix:          z.string().max(10).optional(),
  phoneNumber:     z.string().regex(/^(\+63|0)9\d{9}$/, 'Enter a valid Philippine mobile number.'),
  email:           z.string().email('Enter a valid email address.').optional().or(z.literal('')),
  password:        z.string()
    .min(8, 'Use at least 8 characters.')
    .max(128, 'Use no more than 128 characters.')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{8,128}$/,
      'Use at least 8 characters with uppercase, lowercase, a number, and a symbol.',
    ),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});


function normalizePhoneForOtp(value: string): string {
  const phone = value.trim();
  return phone.startsWith('+63') ? phone : `+63${phone.replace(/^0/, '')}`;
}

// ─── Registration step state machine ─────────────────────────────────────────

type RegistrationStep =
  | 'permission'   // initial: show rationale + "Allow" button
  | 'permission_request' // OS permission dialog is in progress
  | 'requesting'   // OS permission dialog in progress or GPS acquiring
  | 'denied'       // permission permanently denied
  | 'gps_error'    // GPS timeout / low-accuracy failure
  | 'checking'     // server-side geo-fence API call in progress
  | 'outside'      // geo-fence returned inside=false
  | 'geo_error'    // geo-check API threw an error
  | IdStep         // geo-fence passed → the ID: 'id_choose' | 'id_intro' | 'id_scanning' | 'id_retry'
  | 'form';        // ID scanned → registration form with the name-match indicator

const ID_STEPS: readonly RegistrationStep[] = ['id_choose', 'id_intro', 'id_scanning', 'id_retry'];

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
  const beginGuestReport = useIncidentStore((state) => state.beginGuestReport);
  const { loadFromStorage, setPreferences, language } = useAccessibilityStore();
  const t = useTranslations();

  // ── Location state ──
  const [step, setStep] = useState<RegistrationStep>('permission');
  const [capturedCoords, setCapturedCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // ── ID state (MOD-01, plan §3) ──
  /** Here rather than in the ID step, because that step unmounts on the form. Set on the chooser before it's used. */
  const [documentType, setDocumentType]       = useState<IdDocumentType>(DEFAULT_ID_DOCUMENT_TYPE);
  const [idScan, setIdScan]                   = useState<IdScanResponse | null>(null);
  const [idNotice, setIdNotice]               = useState<string | null>(null);
  const [reviewChosen, setReviewChosen]       = useState(false);
  /** Show the name-match indicator: set when a name field loses focus and on submit. */
  const [nameChecked, setNameChecked]         = useState(false);

  // ── Form state ──
  const [name, setName]                       = useState<NameValues>(EMPTY_NAME);
  /** What the last scan filled into the name fields; null when the citizen typed the name themselves. */
  const [nameFilled, setNameFilled]           = useState<NameValues | null>(null);
  const [mobileNumber, setMobileNumber]       = useState('');
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // The same matcher the server decides with. Live for the button; shown on blur / submit.
  const typedName = typedIdName(name);
  const nameMatch = checkTypedName(typedName, idScan?.nameOnId ?? null);
  const createEnabled = canCreateAccount({
    nameMatches: nameMatch?.matches === true,
    reviewChosen,
    reviewScan: idScan?.reviewRequired === true,
  });

  // ── UX state ──
  const [isPasswordVisible, setIsPasswordVisible]               = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [agreeTerms, setAgreeTerms]         = useState(true);
  const [focusedField, setFocusedField]     = useState<string | null>(null);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [isLoading, setIsLoading]           = useState(false);
  const [registrationSlow, setRegistrationSlow] = useState(false);
  const [fieldErrors, setFieldErrors]       = useState<Record<string, string>>({});
  const [apiError, setApiError]             = useState('');
  const [showModal, setShowModal]           = useState(false);
  const [isSuccess, setIsSuccess]           = useState(false);
  const [submittedPhone, setSubmittedPhone] = useState('');
  const checkScale  = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const continuedToOtp = useRef(false);

  useEffect(() => { loadFromStorage(); }, []);

  useEffect(() => {
    if (!isLoading || isSuccess) {
      setRegistrationSlow(false);
      return;
    }
    const timeout = setTimeout(() => setRegistrationSlow(true), 15_000);
    return () => clearTimeout(timeout);
  }, [isLoading, isSuccess]);

  // ── Location / geo-fence handlers ──────────────────────────────────────────

  async function handleGeoFenceCheck() {
    setStep('requesting');
    let location: Location.LocationObject;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          mayShowUserSettingsDialog: true,
        }),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('GPS_TIMEOUT')), 15_000);
        }),
      ]);
    } catch {
      setStep('gps_error');
      return;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    const { latitude, longitude } = location.coords;
    if (!isCoordinateInBocaue(latitude, longitude)) {
      setStep('outside');
      return;
    }

    setStep('checking');
    try {
      const result = await geoCheck(latitude, longitude);
      if (!result.inside) {
        setStep('outside');
        return;
      }
      setCapturedCoords({ latitude, longitude });
      // Inside Bocaue → choose and scan an ID before the form (plan §3).
      setStep('id_choose');
    } catch {
      setStep('geo_error');
    }
  }

  async function handleRequestPermission() {
    setStep('permission_request');
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        await handleGeoFenceCheck();
      } else if (!canAskAgain) {
        setStep('denied');
      } else {
        setStep('permission');
      }
    } catch {
      setStep('denied');
    }
  }

  // ── Registration submit ─────────────────────────────────────────────────────

  async function handleRegister() {
    setFieldErrors({});
    setApiError('');
    const phone = normalizePhoneForOtp(mobileNumber);

    const result = registerSchema.safeParse({
      lastName: name.last.trim(), firstName: name.first.trim(),
      middleName: name.middle.trim() || undefined, suffix: name.suffix || undefined,
      phoneNumber: phone,
      email: email.trim() || undefined, password, confirmPassword,
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setFieldErrors(errs);
      return;
    }
    if (!idScan) { resetIdScan(null); return; }
    // Same rule as the disabled button: the name matches, or the ID goes to MDRRMO review.
    setNameChecked(true);
    if (!createEnabled) { setApiError(t.registration.createDisabledHint); return; }
    if (!agreeTerms) { setApiError('You must agree to the Terms of Service and Privacy Policy.'); return; }

    checkScale.setValue(0);
    cardOpacity.setValue(0);
    setIsSuccess(false);
    setRegistrationSlow(false);
    continuedToOtp.current = false;
    setShowModal(true);
    setIsLoading(true);
    Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    try {
      await register({
        lastName:        name.last.trim(),
        firstName:       name.first.trim(),
        middleName:      name.middle.trim() || undefined,
        suffix:          name.suffix || undefined,
        idVerificationToken: idScan.token,
        requestReview:   idScan.reviewRequired || reviewChosen ? true : undefined,
        phoneNumber:     phone,
        email:           email.trim() || undefined,
        password,
        confirmPassword,
        latitude:        capturedCoords?.latitude,
        longitude:       capturedCoords?.longitude,
      });
      if (continuedToOtp.current) return;
      setSubmittedPhone(phone);
      setIsLoading(false);
      setIsSuccess(true);
      Animated.spring(checkScale, { toValue: 1, tension: 80, friction: 6, useNativeDriver: true }).start();
      setTimeout(() => {
        setShowModal(false);
        setIsSuccess(false);
        router.replace({ pathname: '/auth/verify-otp', params: { mode: 'register', phone } });
      }, 2400);
    } catch (e: any) {
      if (continuedToOtp.current) return;
      setShowModal(false);
      setIsLoading(false);
      if (e instanceof IdVerificationError) {
        switch (e.code) {
          case IdVerificationErrorCode.ID_SCAN_EXPIRED:
          case IdVerificationErrorCode.ID_VERIFICATION_REQUIRED:
            // The scan is gone (30 minutes passed, or already used): scan again.
            resetIdScan(t.registration.idScanExpired);
            return;
          case IdVerificationErrorCode.NAME_DOES_NOT_MATCH_ID:
            setNameChecked(true);
            setApiError(t.registration.createDisabledHint);
            return;
          case IdVerificationErrorCode.ID_ALREADY_REGISTERED:
            setApiError(t.registration[retryMessageKey('ID_ALREADY_REGISTERED', documentType)] as string);
            return;
          default:
            break;
        }
      }
      const msg: string = e.message ?? '';
      if (msg.toLowerCase().includes('phone') || msg.toLowerCase().includes('number')) {
        setApiError(t.registration.errorPhoneExists);
      } else if (msg.toLowerCase().includes('bocaue')) {
        // Server rejected the geo-fence — bounce back to outside screen
        setStep('outside');
      } else {
        setApiError(msg || t.common.error);
      }
    }
  }

  // ── ID handlers ─────────────────────────────────────────────────────────────

  function reportEmergencyAsGuest() {
    beginGuestReport();
    router.push('/emergency/location');
  }

  function handleIdVerified(result: IdScanResponse) {
    setIdScan(result);
    setIdNotice(null);
    setReviewChosen(false);
    // Fill the name from the card unless the citizen already typed their own; they check the spelling.
    const filled = prefillNameFromId(name, result.nameOnId, nameFilled);
    if (filled) {
      setName(filled);
      setNameFilled(filled);
    }
    // A filled name shows its match straight away, so a misread is visible before submit.
    setNameChecked(filled !== null);
    setStep('form');
  }

  /** Back to the ID intro for a fresh scan of the same ID; the typed name and the rest of the form are kept. */
  function resetIdScan(notice: string | null) {
    setIdScan(null);
    setReviewChosen(false);
    setNameChecked(false);
    setApiError('');
    setIdNotice(notice);
    setStep('id_intro');
  }

  function continueToOtp() {
    continuedToOtp.current = true;
    setShowModal(false);
    setIsLoading(false);
    router.replace({
      pathname: '/auth/verify-otp',
      params: { mode: 'register', phone: submittedPhone || normalizePhoneForOtp(mobileNumber) },
    });
  }

  // ── Render: ID steps (after the geo-fence passed) ──────────────────────────

  if (ID_STEPS.includes(step) && capturedCoords) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, styles.locationScreenContent]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoBlock}>
            <AgapLogo />
          </View>
          <IdScanStep
            step={step as IdStep}
            onStepChange={setStep}
            documentType={documentType}
            onDocumentTypeChange={(type) => {
              setDocumentType(type);
              setIdNotice(null); // "Your scan expired" was about the last ID, not the one just chosen.
            }}
            coords={capturedCoords}
            notice={idNotice}
            onVerified={handleIdVerified}
            onOutsideServiceArea={() => setStep('outside')}
            onReportEmergency={reportEmergencyAsGuest}
            onSignIn={() => router.push('/auth/login')}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render: location step screens ──────────────────────────────────────────

  if (step !== 'form' || !idScan) {
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
          {step === 'permission' && (
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
          {(step === 'permission_request' || step === 'requesting' || step === 'checking') && (
            <View style={styles.locationCard}>
              <View style={styles.locationSpinnerWrap}>
                <ActivityIndicator size="large" color="#0D6053" />
              </View>
              <Text style={styles.locationHeading}>
                {step === 'permission_request'
                  ? 'Requesting location access…'
                  : step === 'checking'
                    ? 'Verifying your location…'
                    : 'Detecting your location…'}
              </Text>
              <Text style={styles.locationBody}>
                {step === 'permission_request'
                  ? 'Allow location access in the prompt to check that you are within Bocaue.'
                  : 'Please wait a moment'}
              </Text>
            </View>
          )}

          {/* ── Permission permanently denied ── */}
          {step === 'denied' && (
            <View style={styles.locationCard}>
              <View style={[styles.locationIconWrap, styles.locationIconError]}>
                <Ionicons name="location-outline" size={40} color="#EF4444" />
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
                onPress={() => setStep('permission')}
              >
                <Text style={styles.locationSecondaryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── GPS timeout / signal error ── */}
          {step === 'gps_error' && (
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
                onPress={() => handleRequestPermission()}
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
          {step === 'outside' && (
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
                onPress={() => handleRequestPermission()}
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
          {step === 'geo_error' && (
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
                onPress={() => handleRequestPermission()}
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

          {/* ── ID scanned badge ── */}
          <View style={[styles.locationBadge, styles.idBadge]}>
            <Ionicons name={idScan.reviewRequired ? 'people-outline' : 'card-outline'} size={16} color="#0D6053" />
            <Text style={[styles.locationBadgeText, styles.idBadgeText]}>
              {idScan.reviewRequired
                ? t.registration.idDocument[documentType].reviewBadge
                : idScan.pinLast4
                  ? t.registration.idDocument[documentType].scannedBadge(idScan.pinLast4)
                  : t.registration.idDocument[documentType].scannedBadgeNoNumber}
            </Text>
            <TouchableOpacity onPress={() => resetIdScan(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.linkText}>{t.registration.idRescanLink}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Form Fields ── */}
          <View style={styles.formBlock}>

            {/* Name, checked against the chosen ID */}
            <NameFields
              value={name}
              onChange={(next) => {
                setName(next);
                setNameChecked(false);
              }}
              filledFromId={nameFilled !== null && idScan.nameOnId !== null}
              nameOnId={idScan.nameOnId}
              shownMatch={nameChecked ? nameMatch : null}
              onNameBlur={() => setNameChecked(typedName !== null)}
              reviewChosen={reviewChosen}
              onReviewChange={setReviewChosen}
              errors={{
                lastName: fieldErrors.lastName ? t.registration.errorLastName : undefined,
                firstName: fieldErrors.firstName ? t.registration.errorFirstName : undefined,
              }}
            />

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
              <PasswordStrengthMeter password={password} error={fieldErrors.password} />
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
              ) : confirmPassword.length > 0 ? (
                <Text style={[
                  styles.passwordMatch,
                  confirmPassword === password ? styles.passwordMatchMet : styles.passwordMatchPending,
                ]}>
                  {confirmPassword === password
                    ? t.registration.passwordsMatch
                    : t.registration.passwordsDoNotMatch}
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
              style={[styles.solidButtonContainer, !createEnabled && styles.solidButtonDisabled]}
              onPress={handleRegister}
              disabled={isLoading || !createEnabled}
              accessibilityState={{ disabled: isLoading || !createEnabled }}
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
            {!createEnabled && (
              <Text style={styles.createDisabledHint}>{t.registration.createDisabledHint}</Text>
            )}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.emergencyButtonContainer}
              onPress={() => {
                beginGuestReport();
                router.push('/emergency/location');
              }}
              accessibilityRole="button"
            >
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
            {!isSuccess && !registrationSlow ? (
              <>
                <View style={styles.modalSpinnerWrap}>
                  <ActivityIndicator size="large" color="#0D6053" />
                </View>
                <Text style={styles.modalTitle}>Creating your account…</Text>
                <Text style={styles.modalSubtext}>Please wait a moment</Text>
              </>
            ) : isSuccess ? (
              <>
                <Animated.View style={[styles.successCircle, { transform: [{ scale: checkScale }] }]}>
                  <Ionicons name="checkmark" size={40} color="#FFFFFF" />
                </Animated.View>
                <Text style={styles.modalTitle}>Account Created!</Text>
                <Text style={styles.modalName}>Welcome, {name.first.trim()}!</Text>
                <Text style={styles.modalSubtext}>We sent a 6-digit verification code to</Text>
                <Text style={styles.modalPhone}>{submittedPhone}</Text>
                <View style={styles.modalDivider} />
                <Text style={styles.modalFooter}>Redirecting to verification…</Text>
              </>
            ) : (
              <>
                <View style={[styles.locationIconWrap, styles.locationIconWarning]}>
                  <Ionicons name="time-outline" size={36} color="#D97706" />
                </View>
                <Text style={styles.modalTitle}>This is taking longer than expected</Text>
                <Text style={styles.modalSubtext}>
                  Your account request may still be processing. If you received a verification code, continue to enter it.
                </Text>
                <TouchableOpacity
                  style={styles.modalContinueBtn}
                  activeOpacity={0.85}
                  onPress={continueToOtp}
                >
                  <Text style={styles.modalContinueText}>Continue to verification</Text>
                </TouchableOpacity>
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
  idBadge: {
    marginTop: -12,
  },
  idBadgeText: {
    flex: 1,
  },
  createDisabledHint: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: -8,
  },
  solidButtonDisabled: {
    opacity: 0.55,
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
  passwordMatch: {
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  passwordMatchMet: {
    color: '#15803D',
  },
  passwordMatchPending: {
    color: '#B45309',
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
  modalContinueBtn: {
    width: '100%',
    minHeight: 48,
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: '#0D6053',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalContinueText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
