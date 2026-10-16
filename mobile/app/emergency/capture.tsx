import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIncidentStore } from '@/src/stores/incident.store';
import type { PhotoCaptureMeta } from '@/src/types/incident-capture';

type CaptureMode = 'photo' | 'video';

function fmtSec(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

/**
 * MOD-10 — Incident Photo and Evidence Capture.
 * Citizen captures a photo or short video clip (≤ 60 s) as evidence, then
 * continues to Rapid Incident Details (MOD-09). Both captures are OPTIONAL:
 * "Skip" always lets the report proceed so evidence capture never blocks help.
 */
export default function CaptureScreen() {
  const router  = useRouter();
  const { retake } = useLocalSearchParams<{ retake?: string }>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing,     setFacing]     = useState<'back' | 'front'>('back');
  const [mode,       setMode]       = useState<CaptureMode>('photo');
  const [capturing,  setCapturing]  = useState(false);
  const [recording,  setRecording]  = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const startSOS          = useIncidentStore((s) => s.startSOS);
  const setPhotos         = useIncidentStore((s) => s.setPhotos);
  const setVideoUri       = useIncidentStore((s) => s.setVideoUri);
  const setPhotoCaptureMeta = useIncidentStore((s) => s.setPhotoCaptureMeta);

  useEffect(() => {
    if (!retake) startSOS();
  }, [retake, startSOS]);

  // Recording timer — resets to 0 when recording stops
  useEffect(() => {
    if (!recording) { setElapsedSec(0); return; }
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  // ── Photo capture ──────────────────────────────────────────────────────────

  async function capturePhoto() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      if (photo?.uri) {
        setPhotos([photo.uri]);
        setVideoUri(null);
        const meta: PhotoCaptureMeta = { capturedAt: Date.now(), source: 'live-camera' };
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const last = await Location.getLastKnownPositionAsync();
            if (last) {
              meta.lat      = last.coords.latitude;
              meta.lng      = last.coords.longitude;
              meta.accuracy = last.coords.accuracy ?? undefined;
            }
          }
        } catch { /* GPS best-effort */ }
        setPhotoCaptureMeta(meta);
      }
      router.replace('/emergency/incident-details');
    } catch {
      setCapturing(false);
    }
  }

  // ── Video recording ────────────────────────────────────────────────────────

  async function startRecording() {
    if (!cameraRef.current || recording) return;
    setRecording(true);
    try {
      // recordAsync resolves when stopRecording() is called or maxDuration is hit.
      const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
      if (video?.uri) {
        setVideoUri(video.uri);
        setPhotos([]);
        setPhotoCaptureMeta({ capturedAt: Date.now(), source: 'live-camera' });
        router.replace('/emergency/incident-details');
      }
    } catch {
      // recording cancelled or permission revoked
    } finally {
      setRecording(false);
    }
  }

  function stopRecording() {
    setRecording(false);
    cameraRef.current?.stopRecording();
  }

  function handleShutter() {
    if (mode === 'video') {
      if (recording) stopRecording();
      else           startRecording();
    } else {
      capturePhoto();
    }
  }

  function handleModeSwitch(next: CaptureMode) {
    if (recording) stopRecording();
    setMode(next);
  }

  function skip() {
    if (recording) stopRecording();
    router.replace('/emergency/incident-details');
  }

  // ── Permission gates ─────────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permission}>
        <View style={styles.permissionIcon}>
          <Ionicons name="camera-outline" size={40} color="#0D6053" />
        </View>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          Allow camera access to capture the emergency. You can still report without a photo or video.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Enable camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={skip} activeOpacity={0.7}>
          <Text style={styles.skipBtnText}>Continue without media</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Live camera ──────────────────────────────────────────────────────────

  const isVideo     = mode === 'video';
  const shutterBusy = mode === 'photo' ? capturing : false;

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode={isVideo ? 'video' : 'picture'}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Recording indicator replaces the static hint while recording */}
          {recording ? (
            <View style={styles.recBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recBadgeText}>REC {fmtSec(elapsedSec)}</Text>
            </View>
          ) : (
            <View style={styles.captureHint}>
              <Ionicons name="alert-circle" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.captureHintText}>
                {isVideo ? 'Tap to start · tap again to stop' : 'Capture the emergency'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            accessibilityLabel="Flip camera"
            disabled={recording}
          >
            <Ionicons name="camera-reverse-outline" size={26} color={recording ? 'rgba(255,255,255,0.3)' : '#FFFFFF'} />
          </TouchableOpacity>
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomArea}>
          {/* Photo / Video mode toggle */}
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeBtn, !isVideo && styles.modeBtnActive]}
              onPress={() => handleModeSwitch('photo')}
              accessibilityLabel="Photo mode"
            >
              <Ionicons name="camera" size={18} color={!isVideo ? '#000000' : '#FFFFFF'} />
              <Text style={[styles.modeBtnText, !isVideo && styles.modeBtnTextActive]}>Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, isVideo && styles.modeBtnActive]}
              onPress={() => handleModeSwitch('video')}
              accessibilityLabel="Video mode"
            >
              <Ionicons name="videocam" size={18} color={isVideo ? '#000000' : '#FFFFFF'} />
              <Text style={[styles.modeBtnText, isVideo && styles.modeBtnTextActive]}>Video</Text>
            </TouchableOpacity>
          </View>

          {/* Shutter row */}
          <View style={styles.controls}>
            <TouchableOpacity style={styles.controlSide} onPress={skip} activeOpacity={0.7}>
              <Text style={styles.skipText}>{recording ? '' : 'Skip'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shutter, recording && styles.shutterRecording]}
              onPress={handleShutter}
              disabled={shutterBusy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={isVideo ? (recording ? 'Stop recording' : 'Start recording') : 'Capture photo'}
            >
              {shutterBusy ? (
                <ActivityIndicator color="#DC2626" />
              ) : recording ? (
                <View style={styles.stopIcon} />
              ) : (
                <View style={[styles.shutterInner, isVideo && styles.shutterInnerVideo]} />
              )}
            </TouchableOpacity>

            <View style={styles.controlSide} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000000' },
  center:  { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  captureHint: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(217,45,53,0.9)',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  captureHintText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  recBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(220,38,38,0.90)',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, gap: 6,
  },
  recDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF',
  },
  recBadgeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  // Bottom area
  bottomArea: { paddingBottom: 24, gap: 16 },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row', alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 24, padding: 4, gap: 4,
  },
  modeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  modeBtnActive:     { backgroundColor: '#FFFFFF' },
  modeBtnText:       { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  modeBtnTextActive: { color: '#000000' },

  // Shutter row
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32,
  },
  controlSide: { width: 60, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  shutter: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#FFFFFF',
  },
  shutterRecording: {
    borderColor: '#DC2626',
    backgroundColor: 'rgba(220,38,38,0.25)',
  },
  shutterInner: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF',
  },
  shutterInnerVideo: {
    backgroundColor: '#DC2626',
  },
  stopIcon: {
    width: 24, height: 24, borderRadius: 4, backgroundColor: '#FFFFFF',
  },

  // Permission state
  permission: {
    flex: 1, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  permissionIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#F0F7F4',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  permissionTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8 },
  permissionBody:  {
    fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 24,
  },
  primaryBtn: {
    width: '100%', height: 52, borderRadius: 26,
    backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  skipBtn: { marginTop: 14, paddingVertical: 10 },
  skipBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
});
