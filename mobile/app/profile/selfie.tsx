import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, Image, Linking, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { goBack } from '@/src/lib/navigation';
import { useTranslations } from '@/src/hooks/useAccessibility';
import { useAccessibilityStore } from '@/src/stores/accessibility.store';
import { useAuthStore } from '@/src/stores/auth.store';
import { uploadProfilePhoto } from '@/src/services/api/users.api';
import { ApiError, NetworkError } from '@/src/services/api/http';
import { formatPhotoDate } from '@/src/lib/profile-photo';

/**
 * MOD-01: change the profile picture with a live selfie. Front camera only — there is
 * no gallery option. Steps: tips → camera → review. The server re-checks the 5-month
 * limit and re-encodes the photo.
 */

type Phase = 'intro' | 'camera' | 'review';
type McIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const GREEN = '#0D6053';
/** Long edge sent to the server; it stores a 640 px square. */
const UPLOAD_EDGE = 1080;

function deleteQuietly(uri: string | null) {
  if (!uri) return;
  try { new File(uri).delete(); } catch { /* temp file; the OS clears the cache */ }
}

export default function SelfieScreen() {
  const t = useTranslations().profilePhoto;
  const language = useAccessibilityStore((s) => s.language);
  const accessToken = useAuthStore((s) => s.accessToken);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [phase, setPhase] = useState<Phase>('intro');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const retake = useCallback(() => {
    deleteQuietly(photoUri);
    setPhotoUri(null);
    setPhase('camera');
  }, [photoUri]);

  // Android back steps back through the flow instead of leaving it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (saving) return true;
      if (phase === 'review') { retake(); return true; }
      if (phase === 'camera') { setPhase('intro'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [phase, saving, retake]);

  // Never leave a captured face in the cache when the screen closes.
  const photoRef = useRef<string | null>(null);
  photoRef.current = photoUri;
  useEffect(() => () => deleteQuietly(photoRef.current), []);

  async function save() {
    if (!photoUri || saving) return;
    if (!accessToken) { goBack('/auth/login'); return; }
    setSaving(true);
    try {
      const info = await uploadProfilePhoto(photoUri, accessToken);
      await updateUser(info);
      const date = info.profile_photo_next_change_at ? formatPhotoDate(info.profile_photo_next_change_at, language) : '';
      Alert.alert(t.savedTitle, date ? t.savedBody.replace('{date}', date) : undefined);
      goBack('/profile');
    } catch (err) {
      const body = err instanceof ApiError
        ? (err.body as { code?: string; nextChangeAt?: string; issues?: string[] } | undefined)
        : undefined;
      // The server's photo check refused it: say why and stay here to retake.
      if (err instanceof ApiError && body?.code === 'PROFILE_PHOTO_REJECTED') {
        const reasons = [
          body.issues?.includes('SUNGLASSES') && `• ${t.reasonSunglasses}`,
          body.issues?.includes('UNDRESSED') && `• ${t.reasonUndressed}`,
        ].filter(Boolean).join('\n');
        Alert.alert(t.rejectedTitle, reasons || t.errorGeneric, [{ text: t.retake, onPress: retake }]);
        return;
      }
      if (err instanceof ApiError && body?.code === 'PROFILE_PHOTO_CHECK_UNAVAILABLE') {
        Alert.alert(t.errorTitle, t.checkUnavailable);
        return;
      }
      if (err instanceof ApiError && err.status === 409 && body?.code === 'PROFILE_PHOTO_COOLDOWN' && body.nextChangeAt) {
        // Changed from another device: show the real date and keep the profile in step.
        await updateUser({ profile_photo_next_change_at: body.nextChangeAt });
        Alert.alert(t.modalTitle, t.lockedBody.replace('{date}', formatPhotoDate(body.nextChangeAt, language)));
        goBack('/profile');
        return;
      }
      const message = err instanceof NetworkError
        ? t.errorNetwork
        : err instanceof ApiError && err.status < 500 ? err.message : t.errorGeneric;
      Alert.alert(t.errorTitle, message);
    } finally {
      setSaving(false);
    }
  }

  if (phase === 'camera') {
    return (
      <SelfieCamera
        onClose={() => setPhase('intro')}
        onCaptured={(uri) => { setPhotoUri(uri); setPhase('review'); }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (phase === 'review' ? retake() : goBack('/profile'))}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={phase === 'review' ? t.retake : t.close}
        >
          <Ionicons name="chevron-back" size={24} color="#14231F" />
        </TouchableOpacity>
      </View>

      <Steps current={phase === 'intro' ? 1 : 3} label={t.stepLabel} />

      {phase === 'intro' ? (
        <>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.title} accessibilityRole="header">{t.selfieTitle}</Text>
            <Text style={styles.subtitle}>{t.selfieSubtitle}</Text>

            <View style={styles.tips}>
              <Tip icon="sunglasses" label={t.tipSunglasses} ok={false} />
              <Tip icon="hat-fedora" label={t.tipCap} ok={false} />
              <Tip icon="account-group-outline" label={t.tipFaces} ok={false} />
              <Tip icon="auto-fix" label={t.tipFilters} ok={false} />
              <Tip icon="tshirt-crew-outline" label={t.tipTop} ok />
              <Tip icon="face-recognition" label={t.tipCircle} ok />
              <Tip icon="lightbulb-on-outline" label={t.tipLight} ok />
              <Tip icon="checkbox-blank-outline" label={t.tipBackground} ok />
              <Tip icon="face-woman-outline" label={t.tipHeadCover} ok />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.consent}>{t.consent}</Text>
            <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={() => setPhase('camera')} accessibilityRole="button">
              <Ionicons name="camera" size={19} color="#FFFFFF" style={{ marginRight: 9 }} />
              <Text style={styles.primaryText}>{t.launchCamera}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={[styles.body, styles.reviewBody]} showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, styles.center]} accessibilityRole="header">{t.reviewTitle}</Text>
            <Text style={[styles.subtitle, styles.center]}>{t.reviewBody}</Text>
            <View style={styles.previewRing}>
              {photoUri && (
                <Image source={{ uri: photoUri }} style={styles.preview} accessibilityIgnoresInvertColors accessibilityLabel={t.avatarLabel} />
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryBtn, saving && styles.btnBusy]}
              activeOpacity={0.85}
              onPress={save}
              disabled={saving}
              accessibilityRole="button"
              accessibilityState={{ busy: saving, disabled: saving }}
            >
              {saving ? (
                <>
                  <ActivityIndicator color="#FFFFFF" style={{ marginRight: 9 }} />
                  <Text style={styles.primaryText}>{t.saving}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={19} color="#FFFFFF" style={{ marginRight: 9 }} />
                  <Text style={styles.primaryText}>{t.usePhoto}</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.7} onPress={retake} disabled={saving} accessibilityRole="button">
              <Ionicons name="refresh" size={17} color={GREEN} style={{ marginRight: 8 }} />
              <Text style={styles.secondaryText}>{t.retake}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

// ── Camera ────────────────────────────────────────────────────────────────────

function SelfieCamera({ onClose, onCaptured }: { onClose: () => void; onCaptured: (uri: string) => void }) {
  const t = useTranslations().profilePhoto;
  const { width, height } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const diameter = Math.round(Math.min(width * 0.74, 320));
  // A ring with a border wider than the screen: dims everything outside the circle.
  const maskBorder = Math.max(width, height);
  const circleTop = (height - diameter) / 2 - 30;

  async function capture() {
    if (!cameraRef.current || !ready || busy) return;
    setBusy(true);
    let raw: string | null = null;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) throw new Error('no photo');
      raw = photo.uri;
      const rendered = await ImageManipulator.manipulate(raw)
        .resize(photo.width >= photo.height ? { width: Math.min(photo.width, UPLOAD_EDGE) } : { height: Math.min(photo.height, UPLOAD_EDGE) })
        .renderAsync();
      try {
        const saved = await rendered.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
        onCaptured(saved.uri);
      } finally {
        rendered.release();
      }
    } catch {
      Alert.alert(t.errorTitle, t.errorGeneric);
    } finally {
      deleteQuietly(raw);
      setBusy(false);
    }
  }

  if (!permission) {
    return <View style={styles.cameraRoot}><ActivityIndicator color="#FFFFFF" /></View>;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel={t.close}>
            <Ionicons name="chevron-back" size={24} color="#14231F" />
          </TouchableOpacity>
        </View>
        <View style={styles.permission}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera-outline" size={34} color={GREEN} />
          </View>
          <Text style={[styles.title, styles.center]}>{t.cameraPermissionTitle}</Text>
          <Text style={[styles.subtitle, styles.center]}>{t.cameraPermissionBody}</Text>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.permissionBtn]}
            activeOpacity={0.85}
            onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{permission.canAskAgain ? t.allowCamera : t.openSettings}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.cameraRoot}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
        mode="picture"
        // Save it the way the person saw themselves in the preview.
        mirror
        onCameraReady={() => setReady(true)}
      />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View
          style={{
            position: 'absolute',
            left: (width - diameter) / 2 - maskBorder,
            top: circleTop - maskBorder,
            width: diameter + maskBorder * 2,
            height: diameter + maskBorder * 2,
            borderRadius: diameter / 2 + maskBorder,
            borderWidth: maskBorder,
            borderColor: 'rgba(8, 20, 17, 0.72)',
          }}
        />
        <View
          style={[
            styles.ring,
            { left: (width - diameter) / 2, top: circleTop, width: diameter, height: diameter, borderRadius: diameter / 2 },
          ]}
        />
        <View style={[styles.hintWrap, { top: circleTop + diameter + 22 }]}>
          <View style={styles.hint}>
            <Ionicons name="happy-outline" size={15} color="#FFFFFF" style={{ marginRight: 7 }} />
            <Text style={styles.hintText}>{t.cameraHint}</Text>
          </View>
        </View>
      </View>

      <SafeAreaView style={styles.cameraUi} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.cameraTop}>
          <TouchableOpacity style={styles.cameraIconBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel={t.close}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.cameraTitle}>{t.selfieTitle}</Text>
          <View style={styles.cameraIconSpacer} />
        </View>

        <View style={styles.shutterRow}>
          <TouchableOpacity
            style={[styles.shutter, (!ready || busy) && styles.shutterBusy]}
            activeOpacity={0.8}
            onPress={capture}
            disabled={!ready || busy}
            accessibilityRole="button"
            accessibilityLabel={t.capture}
            accessibilityState={{ busy, disabled: !ready || busy }}
          >
            {busy ? <ActivityIndicator color={GREEN} /> : <View style={styles.shutterInner} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Steps({ current, label }: { current: number; label: string }) {
  return (
    <View
      style={styles.steps}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label.replace('{n}', String(current))}
    >
      {[1, 2, 3].map((n) => (
        <View key={n} style={[styles.step, n <= current && styles.stepDone]} />
      ))}
    </View>
  );
}

function Tip({ icon, label, ok }: { icon: McIcon; label: string; ok: boolean }) {
  return (
    <View style={styles.tip}>
      <View style={[styles.tipCircle, ok ? styles.tipCircleOk : styles.tipCircleNo]}>
        <MaterialCommunityIcons name={icon} size={30} color={ok ? GREEN : '#9A3412'} />
        <View style={[styles.tipBadge, ok ? styles.tipBadgeOk : styles.tipBadgeNo]}>
          <Ionicons name={ok ? 'checkmark' : 'close'} size={12} color="#FFFFFF" />
        </View>
      </View>
      <Text style={styles.tipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F6F5' },
  center: { textAlign: 'center' },

  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },

  steps: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 22 },
  step: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#DCE5E1' },
  stepDone: { backgroundColor: GREEN },

  body: { paddingHorizontal: 20, paddingBottom: 24 },
  reviewBody: { alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#14231F', letterSpacing: -0.6, marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 20, color: '#5B6B66', marginBottom: 24 },

  tips: {
    flexDirection: 'row', flexWrap: 'wrap', rowGap: 22, backgroundColor: '#FFFFFF', borderRadius: 18,
    paddingVertical: 22, paddingHorizontal: 6, borderWidth: 1, borderColor: '#E1E8E5',
    ...Platform.select({ ios: { shadowColor: '#183A31', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10 }, android: { elevation: 1 } }),
  },
  tip: { width: '33.33%', alignItems: 'center', paddingHorizontal: 6 },
  tipCircle: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  tipCircleOk: { backgroundColor: '#EEF6F2' },
  tipCircleNo: { backgroundColor: '#FFF1EC' },
  tipBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF',
  },
  tipBadgeOk: { backgroundColor: GREEN },
  tipBadgeNo: { backgroundColor: '#DC2626' },
  tipLabel: { fontSize: 12, lineHeight: 16, color: '#3D5166', textAlign: 'center', fontWeight: '600' },

  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  consent: { fontSize: 11.5, lineHeight: 16, color: '#78847F', textAlign: 'center', marginBottom: 14 },
  primaryBtn: { flexDirection: 'row', height: 54, borderRadius: 14, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  btnBusy: { opacity: 0.8 },
  primaryText: { fontSize: 15.5, fontWeight: '800', color: '#FFFFFF' },
  secondaryBtn: {
    flexDirection: 'row', height: 50, borderRadius: 14, marginTop: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE5E1',
  },
  secondaryText: { fontSize: 15, fontWeight: '700', color: GREEN },

  previewRing: {
    width: 236, height: 236, borderRadius: 118, padding: 6, backgroundColor: '#FFFFFF', marginTop: 8,
    borderWidth: 3, borderColor: GREEN,
  },
  preview: { width: '100%', height: '100%', borderRadius: 112, backgroundColor: '#E2F0EA' },

  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 60 },
  permissionIcon: { width: 76, height: 76, borderRadius: 22, backgroundColor: '#EEF6F2', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  permissionBtn: { alignSelf: 'stretch', marginTop: 4 },

  cameraRoot: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: '#5CC9A7' },
  hintWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(13, 96, 83, 0.92)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  hintText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  cameraUi: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between' },
  cameraTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 6 },
  cameraIconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  cameraIconSpacer: { width: 44 },
  cameraTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  shutterRow: { alignItems: 'center', paddingBottom: 26 },
  shutter: {
    width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterBusy: { opacity: 0.6 },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' },
});
