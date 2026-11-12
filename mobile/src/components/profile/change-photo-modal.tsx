import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslations } from '../../hooks/useAccessibility';

interface Props {
  visible: boolean;
  /** When set, the photo can't be changed until this date (formatted for display). */
  lockedUntil?: string | null;
  onCancel: () => void;
  onProceed: () => void;
}

/**
 * "Change Profile Picture" confirmation (MOD-01). Explains the 5-month limit before
 * the live-selfie flow opens; inside the limit it says when the next change is allowed.
 */
export function ChangePhotoModal({ visible, lockedUntil, onCancel, onProceed }: Props) {
  const t = useTranslations().profilePhoto;
  const locked = !!lockedUntil;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel} accessibilityLabel={t.cancel}>
        {/* Stops taps on the card from closing it. */}
        <Pressable style={styles.card} onPress={() => undefined} accessibilityViewIsModal>
          <View style={[styles.iconWrap, locked && styles.iconWrapLocked]}>
            <Ionicons name={locked ? 'time-outline' : 'camera-outline'} size={28} color={locked ? '#B45309' : '#0D6053'} />
          </View>

          <Text style={styles.title} accessibilityRole="header">{t.modalTitle}</Text>
          <Text style={styles.body}>
            {locked ? t.lockedBody.replace('{date}', lockedUntil) : t.modalBody}
          </Text>

          {locked ? (
            <TouchableOpacity style={[styles.btn, styles.btnPrimary, styles.btnFull]} activeOpacity={0.85} onPress={onCancel} accessibilityRole="button">
              <Text style={styles.btnPrimaryText}>{t.ok}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} activeOpacity={0.7} onPress={onCancel} accessibilityRole="button">
                <Text style={styles.btnSecondaryText}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} activeOpacity={0.85} onPress={onProceed} accessibilityRole="button">
                <Text style={styles.btnPrimaryText}>{t.proceed}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(10, 24, 20, 0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: '#FFFFFF', borderRadius: 22, paddingTop: 26, paddingBottom: 20, paddingHorizontal: 22,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#0A1814', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 24 },
      android: { elevation: 12 },
    }),
  },
  iconWrap: { width: 60, height: 60, borderRadius: 18, backgroundColor: '#EEF6F2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  iconWrapLocked: { backgroundColor: '#FFF4E0' },
  title: { fontSize: 19, fontWeight: '800', color: '#14231F', textAlign: 'center', letterSpacing: -0.3, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, color: '#5B6B66', textAlign: 'center', marginBottom: 22 },
  actions: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: { flex: 1, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  btnFull: { flex: 0, width: '100%' },
  btnSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE5E1' },
  btnSecondaryText: { fontSize: 15, fontWeight: '700', color: '#3D5166' },
  btnPrimary: { backgroundColor: '#0D6053' },
  btnPrimaryText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
