import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIncidentStore } from '@/src/stores/incident.store';

/**
 * MOD-10 — Incident Photo and Evidence Capture.
 * Citizen captures the emergency, then continues to Rapid Incident Details
 * (MOD-09). The photo is OPTIONAL: "Skip" always lets the report proceed so
 * evidence capture never blocks getting help.
 */
export default function CaptureScreen() {
  const router = useRouter();
  const { retake } = useLocalSearchParams<{ retake?: string }>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [capturing, setCapturing] = useState(false);

  const startSOS = useIncidentStore((s) => s.startSOS);
  const setPhotos = useIncidentStore((s) => s.setPhotos);

  // Start a fresh incident draft (new idempotency key, cleared of any previous
  // report) when opening the camera for a new report. When re-taking the photo
  // we keep the draft so details already entered aren't lost.
  useEffect(() => {
    if (!retake) startSOS();
  }, [retake, startSOS]);

  async function capture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      if (photo?.uri) setPhotos([photo.uri]);
      router.replace('/emergency/incident-details');
    } catch {
      setCapturing(false);
    }
  }

  function skip() {
    router.replace('/emergency/incident-details');
  }

  // ── Permission gates ────────────────────────────────────────────────────
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
          Allow camera access to capture the emergency. You can still report without a photo.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Enable camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={skip} activeOpacity={0.7}>
          <Text style={styles.skipBtnText}>Continue without photo</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Live camera ─────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.captureHint}>
            <Ionicons name="alert-circle" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.captureHintText}>Capture the emergency</Text>
          </View>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            accessibilityLabel="Flip camera"
          >
            <Ionicons name="camera-reverse-outline" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Bottom controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlSide} onPress={skip} activeOpacity={0.7}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shutter}
            onPress={capture}
            disabled={capturing}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Capture photo"
          >
            {capturing ? <ActivityIndicator color="#DC2626" /> : <View style={styles.shutterInner} />}
          </TouchableOpacity>

          <View style={styles.controlSide} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between' },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  captureHint: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(217,45,53,0.9)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  captureHintText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32, paddingBottom: 24 },
  controlSide: { width: 60, alignItems: 'center', justifyContent: 'center' },
  skipText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  shutter: { width: 78, height: 78, borderRadius: 39, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#FFFFFF' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFFFF' },

  // Permission state
  permission: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  permissionIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#F0F7F4', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  permissionTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8 },
  permissionBody: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  primaryBtn: { width: '100%', height: 52, borderRadius: 26, backgroundColor: '#0D6053', alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  skipBtn: { marginTop: 14, paddingVertical: 10 },
  skipBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
});
