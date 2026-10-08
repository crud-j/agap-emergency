import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { OnboardProgressbar } from '../../src/components/ui/onbrd-progressbar';

// SVG logo — imported as a React component via react-native-svg-transformer.
import AgapLogoSvg from '../../assets/icons/agap-svg-icon.svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

function ContinueButton({ onPress }: { onPress: () => void }) {
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
        <Text style={styles.continueText}>Continue</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function OnboardingScreenThree() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.container}>
        {/* ── Top bar: dots centered (Step 3), Skip pinned right ── */}
        <View style={styles.topBar}>
          <OnboardProgressbar currentStep={3} totalSteps={4} />
          <TouchableOpacity
            onPress={() => router.push('/auth/login')}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            style={styles.skipButton}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* ── AGAP logo ── */}
        <View style={styles.logoBlock}>
          <AgapLogo />
        </View>

        {/* ── Illustration ── */}
        <Image
          source={require('../../assets/onboardingassets/3rd-onbrd-assets.png')}
          style={styles.illustration}
          resizeMode="contain"
        />

        {/* ── Heading & body ── */}
        <View style={styles.copyBlock}>
          <Text style={styles.heading}>
            {'Your Report Reaches\nthe Operations Center.'}
          </Text>
          <Text style={styles.body}>
            Your report is securely sent to the AGAP operations center, where it’s
            reviewed, coordinated, and matched with the right responder in your area.
          </Text>
        </View>

        {/* ── Continue button pinned to bottom ── */}
        <View style={styles.buttonBlock}>
          <ContinueButton onPress={() => router.push('/onboarding/fourth-onbrd')} />
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
    marginBottom: 20,
  },

  // ── Illustration ──────────────────────────────────────────
  illustration: {
    width: SCREEN_WIDTH - 40,
    height: (SCREEN_WIDTH - 40) * 0.72,
    alignSelf: 'center',
    marginBottom: 50, // <-- INCREASED from 28 to 50 to push the text block lower
  },

  // ── Copy block ───────────────────────────────────────────
  copyBlock: {
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 32,
  },
  heading: {
    fontSize: 30, 
    fontWeight: 'bold',
    color: '#0D3B3B',
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 14,
  },
  body: {
    fontSize: 15, 
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: '92%',
  },

  // ── Continue button ──────────────────────────────────────
  buttonBlock: {
    paddingHorizontal: 4,
    paddingBottom: 28,
    marginTop: 'auto',
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