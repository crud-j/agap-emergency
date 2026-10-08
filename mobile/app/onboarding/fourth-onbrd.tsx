import React, { useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OnboardProgressbar } from '../../src/components/ui/onbrd-progressbar';
import { useAccessibilityStore } from '../../src/stores/accessibility.store';
import type { Language, TextSize } from '../../src/stores/accessibility.store';
import { useTranslations, useFontScale } from '../../src/hooks/useAccessibility';

// SVG logo — imported as a React component via react-native-svg-transformer.
import AgapLogoSvg from '../../assets/icons/agap-svg-icon.svg';

const { width: _SCREEN_WIDTH } = Dimensions.get('window');

const LOGO_W = 209;
const LOGO_H = 50;

const isSvgComponent =
  typeof AgapLogoSvg === 'function' ||
  (typeof AgapLogoSvg === 'object' && AgapLogoSvg !== null);

function AgapLogo() {
  if (isSvgComponent) {
    const Logo = AgapLogoSvg as React.ComponentType<{ width: number; height: number }>;
    return <Logo width={LOGO_W} height={LOGO_H} />;
  }
  // Fallback: PNG
  return (
    <Image
      source={require('../../assets/icons/agap-icon.png')}
      style={{ width: LOGO_W, height: LOGO_H }}
      resizeMode="contain"
    />
  );
}

function ContinueButton({ onPress, label, fontSize }: { onPress: () => void; label: string; fontSize: number }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Continue"
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', '#0A5448']}
        locations={[0, 0.38, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.continueButton}
      >
        <Text style={[styles.continueText, { fontSize }]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const LANG_TO_DISPLAY: Record<Language, 'English' | 'Filipino'> = {
  en: 'English',
  fil: 'Filipino',
};
const DISPLAY_TO_LANG: Record<'English' | 'Filipino', Language> = {
  English: 'en',
  Filipino: 'fil',
};
const SIZE_TO_DISPLAY: Record<TextSize, 'Small' | 'Medium' | 'Large'> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};
const DISPLAY_TO_SIZE: Record<'Small' | 'Medium' | 'Large', TextSize> = {
  Small: 'small',
  Medium: 'medium',
  Large: 'large',
};

export default function OnboardingScreenFour() {
  const router = useRouter();
  const {
    loadFromStorage,
    setPreferences,
    language: storedLang,
    textSize: storedSize,
    highContrast,
    reducedMotion,
  } = useAccessibilityStore();

  const t = useTranslations();
  const { fs } = useFontScale();

  // Derive display values from stored ISO codes — no local state needed.
  const language = LANG_TO_DISPLAY[storedLang] ?? 'Filipino';
  const textSize = SIZE_TO_DISPLAY[storedSize] ?? 'Medium';

  useEffect(() => {
    loadFromStorage();
  }, []);

  function handleSelectLanguage(lang: 'English' | 'Filipino') {
    void setPreferences({ language: DISPLAY_TO_LANG[lang] });
  }

  function handleSelectTextSize(size: 'Small' | 'Medium' | 'Large') {
    void setPreferences({ textSize: DISPLAY_TO_SIZE[size] });
  }

  function handleContinue() {
    router.push('/auth/login');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.container}>
        {/* ── Top bar: dots centered (Step 4), Skip pinned right ── */}
        <View style={styles.topBar}>
          <OnboardProgressbar currentStep={4} totalSteps={4} />
          <TouchableOpacity
            onPress={() => router.push('/auth/login')}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            style={styles.skipButton}
          >
            <Text style={[styles.skipText, { fontSize: fs(16) }]}>{t.common.skip}</Text>
          </TouchableOpacity>
        </View>

        {/* ── AGAP logo ── */}
        <View style={styles.logoBlock}>
          <AgapLogo />
        </View>

        {/* ── Scrollable Content Area ── */}
        <ScrollView 
          style={styles.scrollArea} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── Headings ── */}
          <View style={styles.headerBlock}>
            <Text style={[styles.subHeading, { fontSize: fs(12) }]}>{t.onboarding4.label}</Text>
            <Text style={[styles.heading, { fontSize: fs(28), lineHeight: fs(36) }]}>
              {t.onboarding4.heading}
            </Text>
            <Text style={[styles.body, { fontSize: fs(15), lineHeight: fs(24) }]}>
              {t.onboarding4.body}
            </Text>
          </View>

          {/* ── Cards Section ── */}
          <View style={styles.cardsContainer}>
            
            {/* Language Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconCircle}>
                  <Ionicons name="globe-outline" size={20} color="#0D3B3B" />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { fontSize: fs(16) }]}>{t.onboarding4.language.title}</Text>
                  <Text style={[styles.cardSubtitle, { fontSize: fs(13) }]}>{t.onboarding4.language.subtitle}</Text>
                </View>
              </View>
              <View style={styles.pillRow}>
                {['English', 'Filipino'].map((lang) => {
                  const isSelected = language === lang;
                  return (
                    <TouchableOpacity
                      key={lang}
                      style={[styles.pill, isSelected ? styles.pillSelected : styles.pillUnselected]}
                      onPress={() => handleSelectLanguage(lang as 'English' | 'Filipino')}
                    >
                      <Text style={[styles.pillText, isSelected ? styles.pillTextSelected : styles.pillTextUnselected]}>
                        {lang}
                      </Text>
                      {isSelected && (
                         <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Text Size Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.iconCircle}>
                  <Text style={{ fontSize: fs(16), fontWeight: 'bold', color: '#0D3B3B' }}>Aa</Text>
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { fontSize: fs(16) }]}>{t.onboarding4.textSize.title}</Text>
                  <Text style={[styles.cardSubtitle, { fontSize: fs(13) }]}>{t.onboarding4.textSize.subtitle}</Text>
                </View>
              </View>
              <View style={styles.pillRow}>
                {['Small', 'Medium', 'Large'].map((size) => {
                  const isSelected = textSize === size;
                  return (
                    <TouchableOpacity
                      key={size}
                      style={[styles.pill, isSelected ? styles.pillSelected : styles.pillUnselected, { paddingHorizontal: 0, flex: 1, marginHorizontal: 4 }]}
                      onPress={() => handleSelectTextSize(size as 'Small' | 'Medium' | 'Large')}
                    >
                      <Text style={[styles.pillText, isSelected ? styles.pillTextSelected : styles.pillTextUnselected]}>
                        {size}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* High Contrast Toggle */}
            <View style={styles.toggleCard}>
              <View style={styles.toggleCardLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="contrast-outline" size={20} color="#0D3B3B" />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { fontSize: fs(16) }]}>{t.onboarding4.highContrast.title}</Text>
                  <Text style={[styles.cardSubtitle, { fontSize: fs(13) }]}>{t.onboarding4.highContrast.subtitle}</Text>
                </View>
              </View>
              <Switch
                trackColor={{ false: '#D1D5DB', true: '#0D6053' }}
                thumbColor={'#FFFFFF'}
                ios_backgroundColor="#D1D5DB"
                onValueChange={(v) => void setPreferences({ highContrast: v })}
                value={highContrast}
              />
            </View>

            {/* Reduced Motion Toggle */}
            <View style={styles.toggleCard}>
              <View style={styles.toggleCardLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="aperture-outline" size={20} color="#0D3B3B" />
                </View>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.cardTitle, { fontSize: fs(16) }]}>{t.onboarding4.reducedMotion.title}</Text>
                  <Text style={[styles.cardSubtitle, { fontSize: fs(13) }]}>{t.onboarding4.reducedMotion.subtitle}</Text>
                </View>
              </View>
              <Switch
                trackColor={{ false: '#D1D5DB', true: '#0D6053' }}
                thumbColor={'#FFFFFF'}
                ios_backgroundColor="#D1D5DB"
                onValueChange={(v) => void setPreferences({ reducedMotion: v })}
                value={reducedMotion}
              />
            </View>

          </View>
        </ScrollView>

        {/* ── Continue button pinned to bottom ── */}
        <View style={styles.buttonBlock}>
          <ContinueButton onPress={handleContinue} label={t.common.continue} fontSize={fs(16)} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  // ── Top bar ──────────────────────────────────────────────
  topBar: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    marginBottom: 24,
  },
  skipButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 16, 
    color: '#0D6053',
    fontWeight: '600',
  },

  // ── Logo ─────────────────────────────────────────────────
  logoBlock: {
    alignItems: 'center',
    marginBottom: 16,
  },

  // ── Scroll Area ──────────────────────────────────────────
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // ── Copy block (Left aligned for step 4) ─────────────────
  headerBlock: {
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  subHeading: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0D6053',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  heading: {
    fontSize: 28, 
    fontWeight: 'bold',
    color: '#0D3B3B',
    textAlign: 'left',
    lineHeight: 36,
    marginBottom: 12,
  },
  body: {
    fontSize: 15, 
    color: '#4B5563',
    textAlign: 'left',
    lineHeight: 24,
  },

  // ── Cards ────────────────────────────────────────────────
  cardsContainer: {
    gap: 12,
    paddingHorizontal: 2,
  },
  card: {
    backgroundColor: '#F4F9F8',
    borderRadius: 16,
    padding: 16,
  },
  toggleCard: {
    backgroundColor: '#F4F9F8',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DDECE9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardHeaderText: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D3B3B',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#4B5563',
  },
  pillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pillSelected: {
    backgroundColor: '#0D6053',
    borderColor: '#0D6053',
  },
  pillUnselected: {
    backgroundColor: 'transparent',
    borderColor: '#D1D5DB',
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pillTextSelected: {
    color: '#FFFFFF',
  },
  pillTextUnselected: {
    color: '#0D3B3B',
  },

  // ── Continue button ──────────────────────────────────────
  buttonBlock: {
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 28,
  },
  continueButton: {
    width: '100%',
    height: 50, 
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D6053',
    overflow: 'hidden',
  },
  continueText: {
    fontSize: 16, 
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});