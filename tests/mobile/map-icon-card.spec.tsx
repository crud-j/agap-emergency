/// <reference types="jest" />

import React, { act } from 'react';
import { create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockUpdateUserSex = jest.fn();
const mockAlert = jest.fn();
type MockUser = { id: string; is_guest: boolean; sex: string | null };
const mockUpdateUser = jest.fn(async (partial: Partial<MockUser>) => {
  if (mockAuthState.user) mockAuthState.user = { ...mockAuthState.user, ...partial };
});
const mockAuthState: {
  user: MockUser | null;
  accessToken: string | null;
  updateUser: typeof mockUpdateUser;
} = {
  user: { id: 'user-1', is_guest: false, sex: null },
  accessToken: 'access-token',
  updateUser: mockUpdateUser,
};

jest.mock('react-native', () => {
  const React = require('react');
  const host = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    React.createElement(name, props, children);
  return {
    View: host('rn-view'),
    Text: host('rn-text'),
    TouchableOpacity: host('rn-button'),
    StyleSheet: { create: (styles: object) => styles },
    Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}));
jest.mock('@/src/stores/auth.store', () => ({
  useAuthStore: () => mockAuthState,
}));
jest.mock('@/src/services/api/users.api', () => ({
  updateUserSex: (...args: unknown[]) => mockUpdateUserSex(...args),
}));
jest.mock('@/src/hooks/useAccessibility', () => ({
  useTranslations: () => ({
    common: { error: 'Error' },
    profile: {
      mapIconTitle: 'Your map icon',
      mapIconPrompt: 'Choose your map icon',
      mapIconPromptBody: 'Helps responders identify your icon.',
      mapIconDismiss: 'Not now',
      mapIconNotMedical: 'Not medical information.',
      mapIconSaveError: 'Could not save your choice.',
    },
    registration: {
      sex: 'Map icon',
      sexHelp: 'Used for your map icon.',
      male: 'Male',
      female: 'Female',
      preferNotToSay: 'Prefer not to say',
    },
  }),
}));

import { MapIconCard } from '@/src/components/profile/map-icon-card';

let activeRenderer: ReactTestRenderer | null = null;

async function renderCard(promptOnce = false): Promise<ReactTestRenderer> {
  await act(async () => {
    activeRenderer = create(<MapIconCard promptOnce={promptOnce} />);
    await Promise.resolve();
  });
  return activeRenderer!;
}

function textNodes(root: ReactTestInstance): string[] {
  return root.findAll((node) => String(node.type) === 'rn-text')
    .map((node) => String(node.props.children));
}

describe('MapIconCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { id: 'user-1', is_guest: false, sex: null };
    mockAuthState.accessToken = 'access-token';
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue(undefined);
    mockUpdateUserSex.mockResolvedValue({ sex: 'FEMALE' });
  });

  afterEach(async () => {
    if (activeRenderer) {
      await act(async () => activeRenderer!.unmount());
      activeRenderer = null;
    }
  });

  it('shows the one-time prompt when no map icon choice has been saved', async () => {
    const renderer = await renderCard(true);

    expect(textNodes(renderer.root)).toContain('Choose your map icon');
    expect(mockGetItemAsync).toHaveBeenCalledWith('agap_map_icon_prompt_dismissed_user-1');
  });

  it('persists dismissal of the optional prompt', async () => {
    const renderer = await renderCard(true);
    const dismiss = renderer.root.findAll((node) => String(node.type) === 'rn-button').find((button) =>
      button.findAll((node) => String(node.type) === 'rn-text')
        .some((node) => node.props.children === 'Not now'),
    );

    await act(async () => dismiss!.props.onPress());

    expect(mockSetItemAsync).toHaveBeenCalledWith('agap_map_icon_prompt_dismissed_user-1', '1');
    expect(textNodes(renderer.root)).toContain('Your map icon');
  });

  it('saves the selected sex to the user profile, not a medical profile', async () => {
    const renderer = await renderCard();
    const femaleOption = renderer.root.findByProps({ testID: 'sex-option-FEMALE' });

    await act(async () => femaleOption.props.onPress());

    expect(mockUpdateUserSex).toHaveBeenCalledWith('FEMALE', 'access-token');
    expect(mockUpdateUser).toHaveBeenNthCalledWith(1, { sex: 'FEMALE' });
    expect(mockUpdateUser).toHaveBeenNthCalledWith(2, { sex: 'FEMALE' });
  });

  it('does not show the prompt again after the user chose prefer not to say', async () => {
    mockAuthState.user = { id: 'user-1', is_guest: false, sex: 'PREFER_NOT_TO_SAY' };
    const renderer = await renderCard(true);

    expect(textNodes(renderer.root)).toContain('Your map icon');
    expect(textNodes(renderer.root)).not.toContain('Choose your map icon');
  });
});
