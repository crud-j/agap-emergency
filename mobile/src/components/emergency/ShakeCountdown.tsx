import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import * as Haptics from 'expo-haptics';

interface ShakeCountdownProps {
  visible: boolean;
  onCancel: () => void;
  onSend: () => void;
}

const COUNTDOWN_SECONDS = 5;

export function ShakeCountdown({ visible, onCancel, onSend }: ShakeCountdownProps) {
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!visible) {
      setRemaining(COUNTDOWN_SECONDS);
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {
      Vibration.vibrate(150);
    });
    const interval = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) return 0;
        Vibration.vibrate(80);
        return value - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible]);

  useEffect(() => {
    if (visible && remaining === 0) onSend();
  }, [onSend, remaining, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Shake detected</Text>
          <Text style={styles.body}>Your emergency alert will be sent in</Text>
          <Text style={styles.countdown}>{remaining}</Text>
          <Text style={styles.body}>Make sure you need help before sending.</Text>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendButton} onPress={onSend} accessibilityRole="button">
            <Text style={styles.sendText}>Send now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' },
  card: { width: '100%', maxWidth: 380, alignItems: 'center', borderRadius: 24, padding: 28, backgroundColor: '#FFFFFF' },
  title: { marginBottom: 10, color: '#1C2B3A', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { color: '#687786', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  countdown: { marginVertical: 12, color: '#0D6053', fontSize: 64, fontWeight: '800' },
  cancelButton: { width: '100%', minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 22, borderRadius: 14, backgroundColor: '#F1F3F5' },
  cancelText: { color: '#344454', fontSize: 16, fontWeight: '700' },
  sendButton: { width: '100%', minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 14, backgroundColor: '#D44858' },
  sendText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
