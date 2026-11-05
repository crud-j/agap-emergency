/**
 * Fallback capture for phones without Google's document scanner (plan §4.3), e.g. newer Huawei
 * phones without Google Play services. A live camera with a card-shaped frame; the photo is
 * cropped to that frame before upload, because the server can only read a cropped card
 * (Phase 0 finding). The rest of the flow is the same as the scanner's.
 *
 * The guest "Report an emergency" button stays on this screen too (CLAUDE.md rule 14).
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useTranslations } from '../../hooks/useAccessibility';
import { frameToPhotoCrop, type CropRect } from '../../lib/id-verification';

/** ID-1 card (85.60 × 53.98 mm). */
const CARD_ASPECT = 85.6 / 53.98;
/** Share of the screen width the frame takes. */
const FRAME_WIDTH_SHARE = 0.86;

interface Size {
  width: number;
  height: number;
}

interface Props {
  onCaptured: (uri: string, crop: CropRect) => void;
  onCancel: () => void;
  onReportEmergency: () => void;
}

export default function IdCameraFallback({ onCaptured, onCancel, onReportEmergency }: Props) {
  const t = useTranslations();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [view, setView] = useState<Size | null>(null);
  const [capturing, setCapturing] = useState(false);

  const frame = view
    ? (() => {
        const width = view.width * FRAME_WIDTH_SHARE;
        const height = width / CARD_ASPECT;
        return { width, height, x: (view.width - width) / 2, y: (view.height - height) / 2 };
      })()
    : null;

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setView({ width, height });
  }

  async function capture() {
    if (!cameraRef.current || !view || !frame || capturing) return;
    setCapturing(true);
    try {
      // Processed (not skipProcessing) so the photo is upright, matching the preview.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) onCaptured(photo.uri, frameToPhotoCrop(view, frame, photo));
      else setCapturing(false);
    } catch {
      setCapturing(false);
    }
  }

  const emergencyButton = (
    <TouchableOpacity style={styles.emergencyBtn} activeOpacity={0.85} onPress={onReportEmergency} accessibilityRole="button">
      <Ionicons name="information-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
      <Text style={styles.emergencyText}>{t.registration.emergencyBtn}</Text>
    </TouchableOpacity>
  );

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.permissionRoot}>
        <Ionicons name="camera-outline" size={44} color="#0D6053" />
        <Text style={styles.permissionTitle}>{t.registration.idCameraTitle}</Text>
        <Text style={styles.permissionBody}>{t.registration.idCameraPermissionBody}</Text>
        <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={() => void requestPermission()}>
          <Text style={styles.primaryText}>{t.registration.idCameraAllow}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel}>
          <Text style={styles.secondaryText}>{t.registration.idCameraClose}</Text>
        </TouchableOpacity>
        {emergencyButton}
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root} onLayout={onLayout}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" mode="picture" />

      {frame && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {/* Dim everything outside the card frame. */}
          <View style={[styles.shade, { top: 0, left: 0, right: 0, height: frame.y }]} />
          <View style={[styles.shade, { top: frame.y + frame.height, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.shade, { top: frame.y, left: 0, width: frame.x, height: frame.height }]} />
          <View style={[styles.shade, { top: frame.y, right: 0, width: frame.x, height: frame.height }]} />
          <View style={[styles.frame, { top: frame.y, left: frame.x, width: frame.width, height: frame.height }]} />
        </View>
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={onCancel} accessibilityLabel={t.registration.idCameraClose}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>{t.registration.idCameraTitle}</Text>
        </View>

        <View style={styles.bottom}>
          <Text style={styles.hint}>{t.registration.idCameraHint}</Text>
          <TouchableOpacity
            style={styles.shutter}
            onPress={capture}
            disabled={capturing || !frame}
            accessibilityRole="button"
            accessibilityLabel={t.registration.idCameraCapture}
          >
            {capturing ? <ActivityIndicator color="#0D6053" /> : <View style={styles.shutterInner} />}
          </TouchableOpacity>
          {emergencyButton}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  frame: { position: 'absolute', borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  bottom: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 24, gap: 16 },
  hint: { color: '#FFFFFF', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
  emergencyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF5C6F',
  },
  emergencyText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  permissionRoot: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  permissionTitle: { fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center' },
  permissionBody: { fontSize: 15, color: '#4B5563', textAlign: 'center', lineHeight: 22 },
  primaryBtn: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0D6053',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12 },
  secondaryText: { color: '#0D6053', fontSize: 14, fontWeight: '600' },
});
