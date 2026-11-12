import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useAuthStore } from '../../stores/auth.store';
import { useTranslations } from '../../hooks/useAccessibility';
import { fetchProfilePhotoDataUri, getMe } from '../../services/api/users.api';

// One download per photo version, shared by every avatar on screen. In memory only:
// it is the person's face, so it is never written to disk and is dropped on sign-out.
let cached: { key: string; uri: string | null } | null = null;
const inFlight = new Map<string, Promise<string | null>>();
// Login responses don't carry the photo fields; fetch them once per signed-in user.
let syncedUserId: string | null = null;

/** Development builds only: why the avatar fell back to the initial (never the image itself). */
function devWarn(what: string, err?: unknown) {
  if (!__DEV__) return;
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : err == null ? '' : String(err);
  console.warn(`[profile-photo] ${what}${detail ? ` — ${detail}` : ''}`);
}

/** The signed-in user's profile picture as a displayable URI, or null (none, loading, or offline). */
export function useProfilePhotoUri(): string | null {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const key = user && !user.is_guest && user.has_profile_photo
    ? `${user.id}:${user.profile_photo_updated_at ?? ''}`
    : null;
  const [uri, setUri] = useState<string | null>(() => (key && cached?.key === key ? cached.uri : null));

  const userId = user?.id;
  const isGuest = !!user?.is_guest;
  const photoKnown = user?.has_profile_photo !== undefined;
  useEffect(() => {
    if (!userId) {
      cached = null; // signed out
      syncedUserId = null;
      return;
    }
    if (isGuest || photoKnown || syncedUserId === userId) return;
    syncedUserId = userId;
    getMe()
      .then((me) => updateUser({
        has_profile_photo: !!me.has_profile_photo,
        profile_photo_updated_at: me.profile_photo_updated_at ?? null,
        profile_photo_next_change_at: me.profile_photo_next_change_at ?? null,
        profile_photo_shared_with_responders: !!me.profile_photo_shared_with_responders,
      }))
      .catch((err: unknown) => {
        syncedUserId = null; // offline: try again next time
        devWarn('could not load the profile (GET /users/me)', err);
      });
  }, [userId, isGuest, photoKnown, updateUser]);

  useEffect(() => {
    if (!key) { setUri(null); return; }
    if (cached?.key === key) { setUri(cached.uri); return; }
    let cancelled = false;
    let request = inFlight.get(key);
    if (!request) {
      const version = key.slice(key.indexOf(':') + 1);
      request = fetchProfilePhotoDataUri(version).finally(() => inFlight.delete(key));
      inFlight.set(key, request);
    }
    request
      .then((data) => {
        cached = { key, uri: data };
        if (!cancelled) setUri(data);
        if (!data) devWarn('the server says there is no profile photo (404)');
      })
      // Offline or server error: keep the initial, retry on next mount.
      .catch((err: unknown) => devWarn('could not download the profile photo (GET /users/me/photo)', err));
    return () => { cancelled = true; };
  }, [key]);

  return key ? uri : null;
}

/**
 * The signed-in user's avatar: their profile picture, or their initial while it loads
 * or when they have none. `style` is the avatar circle (size, radius, colours, shadow).
 */
export function ProfileAvatar({
  style, textStyle, initial,
}: {
  style: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
  initial: string;
}) {
  const uri = useProfilePhotoUri();
  const label = useTranslations().profilePhoto.avatarLabel;
  const [failedUri, setFailedUri] = useState<string | null>(null);
  // Rounded on the image itself, not with overflow: hidden, so the circle keeps its shadow.
  const radius = StyleSheet.flatten(style)?.borderRadius;

  return (
    <View style={style}>
      {uri && uri !== failedUri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius: typeof radius === 'number' ? radius : 0 }]}
          onError={(e) => {
            setFailedUri(uri);
            devWarn('the downloaded photo could not be displayed', e.nativeEvent?.error);
          }}
          accessibilityIgnoresInvertColors
          accessibilityLabel={label}
        />
      ) : (
        <Text style={textStyle}>{initial}</Text>
      )}
    </View>
  );
}
