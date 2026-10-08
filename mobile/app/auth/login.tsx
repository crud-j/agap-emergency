import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { useAccessibilityStore } from '../../src/stores/accessibility.store';
import type { Language } from '../../src/stores/accessibility.store';
import { useTranslations } from '../../src/hooks/useAccessibility';
import { useAuthStore } from '../../src/stores/auth.store';
import {
  loginWithPassword,
  loginWithPhone,
  passkeyBeginAuth,
  passkeyCompleteAuth,
} from '../../src/services/api/auth.api';
import { getPasskey, isPasskeySupported, PasskeyError } from '../../src/services/passkey/passkey.service';
import { homeRouteForRole } from '../../src/lib/role-routing';

const phoneSchema = z.string().regex(/^(\+63|0)9\d{9}$/, 'Enter a valid Philippine mobile number.');
const emailSchema = z.string().email('Enter a valid email address.');
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters.');

// SVG logo fallback pattern
import AgapLogoSvg from '../../assets/icons/agap-svg-icon.svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const LANG_DISPLAY: Record<Language, string> = { en: 'English', fil: 'Filipino' };
const LANG_OPTIONS: Language[] = ['en', 'fil'];
const LOGO_W = 160;
const LOGO_H = 38;

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

export default function LoginScreen() {
  const router = useRouter();
  const { loadFromStorage, setPreferences, language } = useAccessibilityStore();
  const t = useTranslations();

  const loginStore = useAuthStore((s) => s.login);

  // Passkeys need a native build (not Expo Go) on Android 9+ / iOS 15+;
  // everywhere else the screen falls back to password login only.
  const [passkeySupported] = useState(isPasskeySupported);

  // Form State
  const [loginMode, setLoginMode] = useState<'passkey' | 'password'>(
    passkeySupported ? 'passkey' : 'password',
  );
  const [loginIdentifier, setLoginIdentifier] = useState<'mobile' | 'email'>('mobile');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    loadFromStorage();
  }, []);

  async function handlePasswordLogin() {
    setFieldError('');
    setApiError('');
    const identifier = loginIdentifier === 'mobile' ? mobileNumber.trim() : email.trim();
    const idCheck = loginIdentifier === 'mobile'
      ? phoneSchema.safeParse(identifier)
      : emailSchema.safeParse(identifier);
    if (!idCheck.success) { setFieldError(idCheck.error.issues[0].message); return; }
    const pwCheck = passwordSchema.safeParse(password);
    if (!pwCheck.success) { setFieldError(pwCheck.error.issues[0].message); return; }

    setIsLoading(true);
    try {
      const res = await loginWithPassword({ identifier, password });
      await loginStore({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.user);
      router.replace(homeRouteForRole(res.user.role) as never);
    } catch (e: any) {
      setApiError(mapAuthError(e));
    } finally {
      setIsLoading(false);
    }
  }

  // Username-first flow: the user types their phone/email, and the ceremony is
  // scoped to that account so the OS prompts for that user's passkey.
  async function handlePasskeyLogin() {
    setFieldError('');
    setApiError('');
    const identifier = loginIdentifier === 'mobile' ? mobileNumber.trim() : email.trim();
    const idCheck = loginIdentifier === 'mobile'
      ? phoneSchema.safeParse(identifier)
      : emailSchema.safeParse(identifier);
    if (!idCheck.success) { setFieldError(idCheck.error.issues[0].message); return; }

    setIsLoading(true);
    try {
      const { challengeId, options } = await passkeyBeginAuth(identifier);
      const response = await getPasskey(options);
      const res = await passkeyCompleteAuth({ challengeId, response });
      await loginStore({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.user);
      router.replace(homeRouteForRole(res.user.role) as never);
    } catch (e: any) {
      if (e instanceof PasskeyError) {
        if (e.reason === 'cancelled') return;
        if (e.reason === 'unsupported') { setLoginMode('password'); return; }
        setApiError(e.reason === 'no-credentials' ? t.login.passkeyNone : t.login.passkeyFailed);
        return;
      }
      const status: number | undefined = typeof e?.status === 'number' ? e.status : undefined;
      if (status === undefined) setApiError(t.login.errorNetwork);
      else if (status === 400 || status === 401) setApiError(t.login.passkeyFailed);
      else setApiError(t.common.error);
    } finally {
      setIsLoading(false);
    }
  }

  // Map an auth failure to a user-facing message. Only a thrown fetch (no HTTP
  // status) is a genuine connectivity problem; any HTTP response means the
  // request reached the server, so it must never say "Could not connect".
  function mapAuthError(e: any): string {
    const status: number | undefined = typeof e?.status === 'number' ? e.status : undefined;
    if (status === undefined) return t.login.errorNetwork;      // fetch failed
    if (status === 400 || status === 401) return t.login.errorInvalidCredentials;
    return t.common.error;                                      // 5xx / other server error
  }

  async function handlePhoneOtpLogin() {
    setFieldError('');
    setApiError('');
    const check = phoneSchema.safeParse(mobileNumber.trim());
    if (!check.success) { setFieldError(check.error.issues[0].message); return; }
    setIsLoading(true);
    try {
      await loginWithPhone(mobileNumber.trim());
      router.push({ pathname: '/auth/verify-otp', params: { mode: 'login', phone: mobileNumber.trim() } });
    } catch (e: any) {
      const status = typeof e?.status === 'number' ? e.status : undefined;
      setApiError(status === undefined ? t.login.errorNetwork : t.common.error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Background Tree Graphic (Increased height to be "more on top") ── */}
      <Image
        source={require('../../assets/auth/login-assets-tree.png')}
        style={styles.treeBackground}
        resizeMode="cover"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── FIXED TOP SECTION ── */}
        <View style={styles.fixedHeader}>
          {/* Language selector pinned top-right */}
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
          <View style={styles.logoBlock}>
            <AgapLogo />
          </View>
        </View>

        {/* ── SCROLLABLE BODY SECTION ── */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Texts with Gradient applied to "Welcome back" */}
          <View style={styles.textBlock}>
            <MaskedView
              maskElement={<Text style={styles.heading}>{t.login.heading}</Text>}
            >
              <LinearGradient
                colors={['#098B81', '#004141']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.heading, { opacity: 0 }]}>{t.login.heading}</Text>
              </LinearGradient>
            </MaskedView>

            <Text style={styles.body}>{t.login.body}</Text>
          </View>

          {/* Form Fields — identifier shown in both modes; password only in password mode */}
          <View style={styles.formBlock}>
            {/* Mobile / Email Toggle + Input */}
            <View style={styles.inputWrapper}>
              {/* Segmented toggle */}
              <View style={styles.identifierToggle}>
                <TouchableOpacity
                  style={[styles.identifierTab, loginIdentifier === 'mobile' && styles.identifierTabActive]}
                  onPress={() => setLoginIdentifier('mobile')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="call-outline"
                    size={14}
                    color={loginIdentifier === 'mobile' ? '#0D6053' : '#9CA3AF'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.identifierTabText, loginIdentifier === 'mobile' && styles.identifierTabTextActive]}>
                    {t.login.identifierMobile}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.identifierTab, loginIdentifier === 'email' && styles.identifierTabActive]}
                  onPress={() => setLoginIdentifier('email')}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="mail-outline"
                    size={14}
                    color={loginIdentifier === 'email' ? '#0D6053' : '#9CA3AF'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.identifierTabText, loginIdentifier === 'email' && styles.identifierTabTextActive]}>
                    {t.login.identifierEmail}
                  </Text>
                </TouchableOpacity>
              </View>

              {loginIdentifier === 'mobile' ? (
                <View style={styles.inputContainer}>
                  <Ionicons name="call-outline" size={20} color="#9CA3AF" style={styles.inputIconLeft} />
                  <TextInput
                    style={styles.textInput}
                    placeholder={t.login.mobilePlaceholder}
                    placeholderTextColor="#9CA3AF"
                    keyboardType="phone-pad"
                    value={mobileNumber}
                    onChangeText={setMobileNumber}
                    autoCapitalize="none"
                  />
                </View>
              ) : (
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={styles.inputIconLeft} />
                  <TextInput
                    style={styles.textInput}
                    placeholder={t.login.emailPlaceholder}
                    placeholderTextColor="#9CA3AF"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
              )}
            </View>

            {/* Passkey mode: short hint under the identifier */}
            {loginMode === 'passkey' && (
              <View style={[styles.passkeyHintRow, { marginTop: 16 }]}>
                <Ionicons name="finger-print-outline" size={22} color="#0D6053" style={{ marginRight: 10 }} />
                <Text style={styles.passkeyHintText}>{t.login.passkeyHint}</Text>
              </View>
            )}

            {/* Password mode: password field + account helpers */}
            {loginMode === 'password' && (
              <>
                <View style={[styles.inputWrapper, { marginTop: 16 }]}>
                  <Text style={styles.inputLabel}>{t.login.passwordLabel}</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputIconLeft} />
                    <TextInput
                      style={styles.textInput}
                      placeholder={t.login.passwordPlaceholder}
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!isPasswordVisible}
                      value={password}
                      onChangeText={setPassword}
                    />
                    <TouchableOpacity onPress={() => setIsPasswordVisible(!isPasswordVisible)} style={styles.inputIconRight}>
                      <Ionicons name={isPasswordVisible ? "eye-outline" : "eye-off-outline"} size={22} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Remember Me & Forgot Password */}
                <View style={styles.rowBetween}>
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setRememberMe(!rememberMe)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                      {rememberMe && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.checkboxText}>{t.login.rememberMe}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => router.push('/auth/forgot-password')}>
                    <Text style={styles.forgotPasswordText}>{t.login.forgotPassword}</Text>
                  </TouchableOpacity>
                </View>

                {loginIdentifier === 'mobile' && (
                  <TouchableOpacity
                    style={styles.smsCodeLink}
                    onPress={handlePhoneOtpLogin}
                    disabled={isLoading}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbox-ellipses-outline" size={16} color="#0D6053" style={{ marginRight: 6 }} />
                    <Text style={styles.forgotPasswordText}>{t.login.useSmsCode}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* Field / API errors */}
          {(fieldError || apiError) ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={16} color="#EF4444" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{fieldError || apiError}</Text>
            </View>
          ) : null}

          {/* Primary Actions */}
          <View style={styles.actionBlock}>
            {loginMode === 'passkey' ? (
              <>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.solidButtonContainer}
                  onPress={handlePasskeyLogin}
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
                      : <>
                          <Ionicons name="finger-print-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                          <Text style={styles.solidButtonText}>{t.login.passkeyBtn}</Text>
                        </>}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.outlinedButton}
                  onPress={() => { setLoginMode('password'); setFieldError(''); setApiError(''); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="lock-closed" size={18} color="#0D6053" style={{ marginRight: 8 }} />
                  <Text style={styles.outlinedButtonText}>{t.login.usePassword}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.solidButtonContainer}
                  onPress={handlePasswordLogin}
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
                      : <Text style={styles.solidButtonText}>{t.login.loginBtn}</Text>}
                  </LinearGradient>
                </TouchableOpacity>

                {passkeySupported && (
                  <TouchableOpacity
                    style={styles.outlinedButton}
                    onPress={() => { setLoginMode('passkey'); setFieldError(''); setApiError(''); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="finger-print-outline" size={18} color="#0D6053" style={{ marginRight: 8 }} />
                    <Text style={styles.outlinedButtonText}>{t.login.usePasskey}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t.login.noAccount}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Secondary Actions */}
          <View style={styles.secondaryActionBlock}>
            {/* Transparent Outlined Secondary Button */}
            <TouchableOpacity style={styles.createAccountButton} activeOpacity={0.7} onPress={() => router.push('/auth/registration')}>
              <Text style={styles.createAccountText}>{t.login.createAccount}</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.85} style={styles.emergencyButtonContainer}>
              <LinearGradient
                // White highlight overlaid on red base background
                colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.05)']}
                locations={[0, 0.4, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.gradientOverlay}
              >
                <Ionicons name="information-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.solidButtonText}>{t.login.guestReport}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Fixed Footer: anchored outside KeyboardAvoidingView so it never moves ── */}
      <TouchableOpacity style={styles.helpLinkRow} activeOpacity={0.7}>
        <Ionicons name="headset" size={22} color="#0D6053" style={{ marginRight: 8 }} />
        <Text style={styles.helpLinkText}>{t.common.needHelp}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  
  // ── Tree Graphic ──
  treeBackground: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: 450,
    zIndex: 0,
    opacity: 1,
    pointerEvents: 'none',
  },

  // ── Fixed Top Header ──
  fixedHeader: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  topBar: {
    alignItems: 'flex-end',
    marginBottom: 12,
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
  logoBlock: {
    alignItems: 'center',
  },

  // ── Scrollable Content ──
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 15,
    paddingBottom: 24,
    zIndex: 10,
  },
  textBlock: {
    marginBottom: 20,
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },

  // ── Form Elements ──
  formBlock: {
    marginBottom: 24,
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
  identifierToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
  },
  identifierTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  identifierTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  identifierTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  identifierTabTextActive: {
    color: '#0D6053',
    fontWeight: '700',
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
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: '#0D6053',
    borderColor: '#0D6053',
  },
  checkboxText: {
    fontSize: 14,
    color: '#6B7280',
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0D6053',
  },
  smsCodeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  passkeyHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F7F4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  passkeyHintText: {
    flex: 1,
    fontSize: 14,
    color: '#0D6053',
    lineHeight: 20,
    fontWeight: '500',
  },

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
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#EF4444',
    lineHeight: 18,
  },

  // ── Button Containers ──
  actionBlock: {
    gap: 16,
    marginBottom: 24,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  outlinedButton: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent', // Perfectly transparent with only an edge stroke
  },
  outlinedButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0D6053',
  },

  // ── Divider ──
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#6B7280',
  },

  // ── Secondary Actions ──
  secondaryActionBlock: {
    gap: 16,
    marginBottom: 32,
  },
  createAccountButton: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent', // Perfectly transparent with only an edge stroke
  },
  createAccountText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0D6053',
  },

  // ── Footer ──
  helpLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  helpLinkText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0D6053',
  },
});