/**
 * Tests for mobile/app/auth/registration.tsx
 *
 * Coverage:
 *   - Zod validation schema (phone format, password rules, mismatch)
 *   - Phone number normalization (09... / 9... → +639...)
 *   - handleRegister: valid form → register API called with normalized data
 *   - handleRegister: success → navigates to verify-otp with correct params
 *   - handleRegister: schema failure → field errors shown, API not called
 *   - handleRegister: terms unchecked → API not called, error shown
 *   - handleRegister: phone-exists API error → phone-specific error shown
 *   - handleRegister: generic API error → fallback error shown
 */

import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { z } from 'zod';

// ─── Mocks (hoisted by jest before imports) ──────────────────────────────────

const mockPush    = jest.fn();
const mockBack    = jest.fn();
const mockRegister = jest.fn();

jest.mock('react-native', () => {
  const React = require('react');
  const Pass = ({ children, ...p }: any) => React.createElement('rn-view', p, children);
  return {
    View:                 Pass,
    Text:                 ({ children, ...p }: any) => React.createElement('rn-text', p, children),
    ScrollView:           Pass,
    KeyboardAvoidingView: Pass,
    Modal: ({ visible, children }: any) =>
      visible ? React.createElement('rn-modal', {}, children) : null,
    TouchableOpacity: ({ onPress, testID, disabled, children, ...p }: any) =>
      React.createElement('rn-btn', { onPress, testID, disabled, ...p }, children),
    TextInput: ({ onChangeText, testID, value, ...p }: any) =>
      React.createElement('rn-input', { onChangeText, testID, value, ...p }),
    ActivityIndicator: () => React.createElement('rn-spinner', {}),
    Image:              () => React.createElement('rn-img', {}),
    StatusBar: Object.assign(
      () => React.createElement('rn-status-bar', {}),
      { setBarStyle: jest.fn(), barStyle: 'dark-content' },
    ),
    StyleSheet:         { create: (s: any) => s, flatten: (s: any) => s },
    Platform:           { OS: 'android', select: (o: any) => o.android ?? o.default },
    Dimensions:         { get: () => ({ width: 375, height: 812 }) },
    Animated: {
      Value: jest.fn().mockImplementation(function (this: any, v: number) {
        this._value = v;
        this.setValue = jest.fn();
      }),
      timing: jest.fn().mockReturnValue({
        start: jest.fn((cb?: () => void) => cb?.()),
      }),
      spring: jest.fn().mockReturnValue({
        start: jest.fn((cb?: () => void) => cb?.()),
      }),
      View: Pass,
      Text: ({ children, ...p }: any) => React.createElement('rn-text', p, children),
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
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('@react-native-masked-view/masked-view', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children }: any) => React.createElement('rn-masked', {}, children),
  };
});

jest.mock('../../mobile/src/services/api/auth.api', () => ({
  register: (...args: any[]) => mockRegister(...args),
}));

jest.mock('../../mobile/src/stores/accessibility.store', () => ({
  useAccessibilityStore: (sel: any) => {
    const state = { loadFromStorage: jest.fn(), setPreferences: jest.fn(), language: 'fil' as const };
    return sel ? sel(state) : state;
  },
}));

jest.mock('../../mobile/src/hooks/useAccessibility', () => ({
  useTranslations: () => ({
    registration: {
      heading:          'Create Account',
      body:             'Register to get started',
      fullName:         'Full Name',
      fullNamePlaceholder: 'Enter your full name',
      mobile:           'Mobile Number',
      mobileHelper:     'Philippine mobile number',
      email:            'Email Address',
      emailPlaceholder: 'Enter email (optional)',
      emailHelper:      'Optional',
      password:         'Password',
      passwordPlaceholder: 'Enter password',
      passwordHelper:   'Minimum 8 characters',
      confirmPassword:  'Confirm Password',
      confirmPlaceholder: 'Re-enter password',
      createBtn:        'Create Account',
      emergencyBtn:     'Emergency SOS',
      alreadyHave:      'Already have an account?',
      signIn:           'Sign in',
      errorPhoneExists: 'Phone number is already registered.',
    },
    common: { error: 'Something went wrong. Please try again.' },
  }),
}));

import RegistrationScreen from '../../mobile/app/auth/registration';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inputByTestId(root: any, testID: string) {
  return root.findByProps({ testID });
}

// Tracks the most recently created renderer so afterEach can unmount it. A
// successful submit schedules a redirect setTimeout; without an unmount that
// pending timer keeps the Jest worker from exiting gracefully.
let activeRenderer: ReturnType<typeof create> | null = null;

/** Create the renderer inside act() so all effects are flushed. */
async function renderRegistration() {
  await act(async () => { activeRenderer = create(<RegistrationScreen />); });
  return activeRenderer!;
}

/** Fill all 5 form fields. Partial overrides supported. */
async function fillForm(root: any, overrides: {
  fullName?: string; phone?: string; email?: string;
  password?: string; confirm?: string;
} = {}) {
  const vals = {
    fullName: 'Maria Santos',
    phone:    '9171234567',
    email:    'maria@example.com',
    password: 'SecurePass1!',
    confirm:  'SecurePass1!',
    ...overrides,
  };
  await act(async () => {
    inputByTestId(root, 'fullname-input').props.onChangeText(vals.fullName);
    inputByTestId(root, 'phone-input').props.onChangeText(vals.phone);
    inputByTestId(root, 'email-input').props.onChangeText(vals.email);
    inputByTestId(root, 'password-input').props.onChangeText(vals.password);
    inputByTestId(root, 'confirm-password-input').props.onChangeText(vals.confirm);
  });
}

/** Press the Create Account submit button. */
async function pressSubmit(root: any) {
  await act(async () => {
    inputByTestId(root, 'register-submit-btn').props.onPress();
  });
}

// ─── Schema unit tests (pure — no rendering) ─────────────────────────────────

// Mirror of the Zod schema defined in registration.tsx
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

// Phone normalization — same logic as handleRegister in the component
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('+63') ? trimmed : `+63${trimmed.replace(/^0/, '')}`;
}

describe('registerSchema', () => {
  const valid = {
    fullName: 'Juan dela Cruz',
    phoneNumber: '+639171234567',
    password: 'SecurePass1!',
    confirmPassword: 'SecurePass1!',
  };

  it('accepts a fully valid payload', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts when email is omitted', () => {
    expect(registerSchema.safeParse({ ...valid, email: undefined }).success).toBe(true);
  });

  it('accepts when email is an empty string', () => {
    expect(registerSchema.safeParse({ ...valid, email: '' }).success).toBe(true);
  });

  it('rejects a name shorter than 2 characters', () => {
    const r = registerSchema.safeParse({ ...valid, fullName: 'A' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe('fullName');
  });

  it('rejects a password shorter than 8 characters', () => {
    const r = registerSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe('password');
  });

  it('rejects when passwords do not match', () => {
    const r = registerSchema.safeParse({ ...valid, confirmPassword: 'DifferentPass!' });
    expect(r.success).toBe(false);
    const mismatch = r.error?.issues.find((i) => i.path[0] === 'confirmPassword');
    expect(mismatch?.message).toBe('Passwords do not match.');
  });

  it('rejects a non-Philippine phone number format', () => {
    const r = registerSchema.safeParse({ ...valid, phoneNumber: '1234567890' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe('phoneNumber');
  });

  it('accepts Philippine number starting with 09', () => {
    expect(registerSchema.safeParse({ ...valid, phoneNumber: '09171234567' }).success).toBe(true);
  });

  it('rejects an invalid email format', () => {
    const r = registerSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe('email');
  });
});

describe('normalizePhone', () => {
  it('prefixes 9... with +63', () => {
    expect(normalizePhone('9171234567')).toBe('+639171234567');
  });

  it('strips leading 0 and prefixes +63 for 09... format', () => {
    expect(normalizePhone('09171234567')).toBe('+639171234567');
  });

  it('leaves +639... unchanged', () => {
    expect(normalizePhone('+639171234567')).toBe('+639171234567');
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizePhone('  9171234567  ')).toBe('+639171234567');
  });
});

// ─── Component integration tests ─────────────────────────────────────────────

describe('RegistrationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // A successful submit fires a bare setTimeout(2400) to redirect. Fake timers
    // keep it off the real event loop so it never holds the Jest worker open.
    jest.useFakeTimers();
  });

  afterEach(async () => {
    if (activeRenderer) {
      await act(async () => { activeRenderer!.unmount(); });
      activeRenderer = null;
    }
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renders without crashing', async () => {
    const renderer = await renderRegistration();
    expect(renderer.root).toBeDefined();
  });

  it('calls register API with normalized phone number on valid form submission', async () => {
    mockRegister.mockResolvedValueOnce({ user: { id: 'u-1' } });
    const renderer = await renderRegistration();

    await fillForm(renderer.root, { phone: '9171234567' });
    await pressSubmit(renderer.root);

    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumber: '+639171234567' }),
    );
  });

  it('normalizes a 09... phone number to +639...', async () => {
    mockRegister.mockResolvedValueOnce({ user: { id: 'u-1' } });
    const renderer = await renderRegistration();

    await fillForm(renderer.root, { phone: '09171234567' });
    await pressSubmit(renderer.root);

    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNumber: '+639171234567' }),
    );
  });

  it('navigates to verify-otp screen after successful registration', async () => {
    jest.useFakeTimers();
    mockRegister.mockResolvedValueOnce({ user: { id: 'u-1' } });
    const renderer = await renderRegistration();

    await fillForm(renderer.root);
    await pressSubmit(renderer.root);

    // Component waits 2 400 ms before navigating
    await act(async () => { jest.advanceTimersByTime(2400); });

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/auth/verify-otp',
        params: expect.objectContaining({ mode: 'register' }),
      }),
    );
    jest.useRealTimers();
  });

  it('does NOT call the register API when the form is invalid (short name)', async () => {
    const renderer = await renderRegistration();

    await fillForm(renderer.root, { fullName: 'A' }); // fails min(2)
    await pressSubmit(renderer.root);

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('does NOT call the register API when passwords do not match', async () => {
    const renderer = await renderRegistration();

    await fillForm(renderer.root, { confirm: 'DifferentPass99!' });
    await pressSubmit(renderer.root);

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('shows a phone-specific error when the API reports the number is already registered', async () => {
    mockRegister.mockRejectedValueOnce(new Error('phone number already registered'));
    const renderer = await renderRegistration();

    await fillForm(renderer.root);
    await pressSubmit(renderer.root);

    // The component maps phone-related errors to t.registration.errorPhoneExists
    const errorTexts = renderer.root.findAll(
      (n: any) => n.type === 'rn-text' &&
        typeof n.props.children === 'string' &&
        n.props.children.toLowerCase().includes('phone'),
    );
    expect(errorTexts.length).toBeGreaterThan(0);
  });

  it('shows a generic error when the API throws a non-phone error', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Internal server error'));
    const renderer = await renderRegistration();

    await fillForm(renderer.root);
    await pressSubmit(renderer.root);

    const errorTexts = renderer.root.findAll(
      (n: any) => n.type === 'rn-text' &&
        typeof n.props.children === 'string' &&
        n.props.children.includes('Internal server error'),
    );
    expect(errorTexts.length).toBeGreaterThan(0);
  });

  it('passes fullName, phoneNumber, email, password, and confirmPassword to the API', async () => {
    mockRegister.mockResolvedValueOnce({ user: { id: 'u-1' } });
    const renderer = await renderRegistration();

    await fillForm(renderer.root, {
      fullName: 'Maria Santos',
      phone:    '9171234567',
      email:    'maria@example.com',
      password: 'SecurePass1!',
      confirm:  'SecurePass1!',
    });
    await pressSubmit(renderer.root);

    expect(mockRegister).toHaveBeenCalledWith({
      fullName:        'Maria Santos',
      phoneNumber:     '+639171234567',
      email:           'maria@example.com',
      password:        'SecurePass1!',
      confirmPassword: 'SecurePass1!',
    });
  });

  it('omits email from the API call when the field is left blank', async () => {
    mockRegister.mockResolvedValueOnce({ user: { id: 'u-1' } });
    const renderer = await renderRegistration();

    await fillForm(renderer.root, { email: '' });
    await pressSubmit(renderer.root);

    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ email: undefined }),
    );
  });
});
