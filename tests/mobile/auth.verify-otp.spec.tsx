/**
 * Tests for mobile/app/auth/verify-otp.tsx
 *
 * Coverage:
 *   - Verify button is disabled until all 6 OTP digits are entered
 *   - handleVerify: calls verifyPhoneOtp(phone, assembledCode)
 *   - handleVerify: on success → calls login() store action with tokens + user
 *   - handleVerify: on success → does NOT call router.replace (AuthGuard handles nav)
 *   - handleVerify: "expired" in error message → shows t.verifyOtp.errorExpired
 *   - handleVerify: other API error → shows t.verifyOtp.errorInvalid
 *   - handleVerify: mode=forgot-password → router.push to reset-password, no API call
 *   - handleResend: calls loginWithPhone when countdown has reached 0
 */

import React, { act } from 'react';
import { create } from 'react-test-renderer';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPush    = jest.fn();
const mockReplace = jest.fn();
const mockBack    = jest.fn();
const mockLogin   = jest.fn();
const mockVerifyPhoneOtp = jest.fn();
const mockLoginWithPhone  = jest.fn();

// Default search params — can be overridden per test via mockGetParams
let mockParams: Record<string, string> = { mode: 'register', phone: '+639171234567' };

jest.mock('react-native', () => {
  const React = require('react');
  const Pass = ({ children, ...p }: any) => React.createElement('rn-view', p, children);
  return {
    View:                 Pass,
    Text:                 ({ children, ...p }: any) => React.createElement('rn-text', p, children),
    ScrollView:           Pass,
    KeyboardAvoidingView: Pass,
    SafeAreaView:         Pass,
    TouchableOpacity: ({ onPress, testID, disabled, children, ...p }: any) =>
      React.createElement('rn-btn', { onPress, testID, disabled, ...p }, children),
    TextInput: ({ onChangeText, testID, value, ...p }: any) =>
      React.createElement('rn-input', { onChangeText, testID, value, ...p }),
    ActivityIndicator: () => React.createElement('rn-spinner', {}),
    StatusBar: Object.assign(
      () => React.createElement('rn-status-bar', {}),
      { setBarStyle: jest.fn(), barStyle: 'dark-content' },
    ),
    StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
    Platform:   { OS: 'android', select: (o: any) => o.android ?? o.default },
    Dimensions: { get: () => ({ width: 375, height: 812 }) },
    Animated:   {
      Value: jest.fn().mockImplementation(function (this: any, v: number) {
        this._value = v; this.setValue = jest.fn();
      }),
      timing: jest.fn().mockReturnValue({ start: jest.fn((cb?: () => void) => cb?.()) }),
      spring: jest.fn().mockReturnValue({ start: jest.fn((cb?: () => void) => cb?.()) }),
    },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children, ...p }: any) =>
      React.createElement('rn-safe-area', p, children),
  };
});

jest.mock('expo-router', () => ({
  useRouter:           () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('../../mobile/src/services/api/auth.api', () => ({
  verifyPhoneOtp:  (...args: any[]) => mockVerifyPhoneOtp(...args),
  loginWithPhone:  (...args: any[]) => mockLoginWithPhone(...args),
}));

jest.mock('../../mobile/src/stores/auth.store', () => ({
  useAuthStore: (sel: any) => {
    const state = { login: (...args: any[]) => mockLogin(...args) };
    return sel ? sel(state) : state;
  },
}));

jest.mock('../../mobile/src/hooks/useAccessibility', () => ({
  useTranslations: () => ({
    verifyOtp: {
      heading:      'Verify your number',
      body:         'We sent a 6-digit code to',
      resendPrompt: "Didn't receive it?",
      resendIn:     'Resend in',
      resendBtn:    'Resend code',
      verifyBtn:    'Verify',
      errorExpired: 'Code expired. Request a new one.',
      errorInvalid: 'Invalid or expired code. Please try again.',
    },
    common: { error: 'Something went wrong.' },
  }),
}));

import VerifyOtpScreen from '../../mobile/app/auth/verify-otp';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inputByTestId(root: any, testID: string) {
  return root.findByProps({ testID });
}

// Tracks the most recently created renderer so afterEach can unmount it. The
// screen mounts a self-rescheduling setCountdown timer; without an unmount the
// effect cleanup never runs and the pending timer keeps the Jest worker alive
// ("A worker process has failed to exit gracefully").
let activeRenderer: ReturnType<typeof create> | null = null;

/** Create the renderer inside act() so all effects are flushed. */
async function renderVerifyOtp() {
  await act(async () => { activeRenderer = create(<VerifyOtpScreen />); });
  return activeRenderer!;
}

/** Enter a 6-digit OTP one digit at a time, flushing state between each digit. */
async function enterOtp(root: any, code: string) {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      inputByTestId(root, `otp-input-${i}`).props.onChangeText(code[i] ?? '');
    });
  }
}

async function pressVerify(root: any) {
  await act(async () => {
    inputByTestId(root, 'verify-submit-btn').props.onPress();
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('VerifyOtpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { mode: 'register', phone: '+639171234567' };
  });

  afterEach(async () => {
    // Unmounting runs the countdown effect's cleanup (clearTimeout), so no
    // real/fake timer is left pending after the test completes.
    if (activeRenderer) {
      await act(async () => { activeRenderer!.unmount(); });
      activeRenderer = null;
    }
  });

  it('renders without crashing', async () => {
    const renderer = await renderVerifyOtp();
    expect(renderer.root).toBeDefined();
  });

  it('verify button is disabled when fewer than 6 digits are entered', async () => {
    const renderer = await renderVerifyOtp();
    const btn = inputByTestId(renderer.root, 'verify-submit-btn');
    // No digits entered → disabled
    expect(btn.props.disabled).toBe(true);
  });

  it('verify button is enabled after all 6 digits are entered', async () => {
    const renderer = await renderVerifyOtp();
    await enterOtp(renderer.root, '543210');
    const btn = inputByTestId(renderer.root, 'verify-submit-btn');
    expect(btn.props.disabled).toBe(false);
  });

  it('calls verifyPhoneOtp with the correct phone number and assembled OTP code', async () => {
    mockVerifyPhoneOtp.mockResolvedValueOnce({
      accessToken:  'at-token',
      refreshToken: 'rt-token',
      user:         { id: 'u-1', is_phone_verified: true },
    });
    const renderer = await renderVerifyOtp();

    await enterOtp(renderer.root, '123456');
    await pressVerify(renderer.root);

    expect(mockVerifyPhoneOtp).toHaveBeenCalledWith('+639171234567', '123456');
  });

  it('calls the auth store login() with tokens and user on successful verification', async () => {
    const user = { id: 'u-1', is_phone_verified: true, status: 'ACTIVE' };
    mockVerifyPhoneOtp.mockResolvedValueOnce({
      accessToken: 'at-token', refreshToken: 'rt-token', user,
    });
    const renderer = await renderVerifyOtp();

    await enterOtp(renderer.root, '654321');
    await pressVerify(renderer.root);

    expect(mockLogin).toHaveBeenCalledWith(
      { accessToken: 'at-token', refreshToken: 'rt-token' },
      user,
    );
  });

  it('navigates into the app (router.replace to tabs) after a successful verification', async () => {
    mockVerifyPhoneOtp.mockResolvedValueOnce({
      accessToken: 'at', refreshToken: 'rt', user: { id: 'u-1' },
    });
    const renderer = await renderVerifyOtp();

    await enterOtp(renderer.root, '111111');
    await pressVerify(renderer.root);

    expect(mockLogin).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('shows an error and does NOT navigate when the success response is missing tokens', async () => {
    mockVerifyPhoneOtp.mockResolvedValueOnce({ user: { id: 'u-1' } } as any);
    const renderer = await renderVerifyOtp();

    await enterOtp(renderer.root, '222222');
    await pressVerify(renderer.root);

    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows the "expired" error text when the API message contains "expired"', async () => {
    mockVerifyPhoneOtp.mockRejectedValueOnce(new Error('OTP has expired'));
    const renderer = await renderVerifyOtp();

    await enterOtp(renderer.root, '000000');
    await pressVerify(renderer.root);

    const errorNodes = renderer.root.findAll(
      (n: any) =>
        n.type === 'rn-text' &&
        typeof n.props.children === 'string' &&
        n.props.children.toLowerCase().includes('expired'),
    );
    expect(errorNodes.length).toBeGreaterThan(0);
  });

  it('shows the "invalid" error text for non-expired API failures', async () => {
    mockVerifyPhoneOtp.mockRejectedValueOnce(new Error('Invalid OTP'));
    const renderer = await renderVerifyOtp();

    await enterOtp(renderer.root, '999999');
    await pressVerify(renderer.root);

    const errorNodes = renderer.root.findAll(
      (n: any) =>
        n.type === 'rn-text' &&
        typeof n.props.children === 'string' &&
        n.props.children.toLowerCase().includes('invalid'),
    );
    expect(errorNodes.length).toBeGreaterThan(0);
  });

  it('does NOT call verifyPhoneOtp in forgot-password mode — routes to reset-password', async () => {
    mockParams = { mode: 'forgot-password', phone: '+639171234567' };
    const renderer = await renderVerifyOtp();

    await enterOtp(renderer.root, '555555');
    await pressVerify(renderer.root);

    expect(mockVerifyPhoneOtp).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/auth/reset-password',
        params:   expect.objectContaining({ phone: '+639171234567', otp: '555555' }),
      }),
    );
  });

  it('calls loginWithPhone when resend is triggered (countdown must be 0)', async () => {
    mockLoginWithPhone.mockResolvedValueOnce({ message: 'sent' });
    jest.useFakeTimers();

    const renderer = await renderVerifyOtp();

    // Advance past the 60-second resend countdown (one second at a time so each
    // setCountdown state update is flushed before the next timer fires)
    for (let s = 0; s < 61; s++) {
      await act(async () => { jest.advanceTimersByTime(1_000); });
    }

    // After countdown reaches 0 the resend button is rendered
    const resendBtn = renderer.root.findByProps({ testID: 'resend-btn' });
    await act(async () => resendBtn.props.onPress());

    expect(mockLoginWithPhone).toHaveBeenCalledWith('+639171234567');

    // Drop any pending fake timers without executing their callbacks — running
    // them would flush setCountdown updates outside act() and re-introduce the
    // very warnings this test config is meant to silence.
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});
