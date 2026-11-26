import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { markOnboardingComplete } from '@/src/lib/onboarding-status';

/**
 * Skip or Continue on the last step: remember onboarding is done, then go to sign-in.
 * `replace`, so Back from sign-in doesn't return into onboarding.
 */
export function useFinishOnboarding() {
  const router = useRouter();
  return useCallback(() => {
    void markOnboardingComplete().finally(() => router.replace('/auth/login'));
  }, [router]);
}
