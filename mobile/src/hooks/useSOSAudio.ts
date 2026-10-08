import { useCallback, useEffect } from 'react';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';

/** Compatible with expo-audio's local and remote audio sources. */
export type SoundSource = number | { uri: string } | null;

/**
 * Manages a looping alert sound for the SOS hold interaction.
 * Uses expo-audio, which is compatible with the React Native New Architecture.
 *
 * Sound file: mobile/assets/sounds/sos-alert.mp3
 * Pass source as:  require('@/assets/sounds/sos-alert.mp3')
 */
export function useSOSAudio(source: SoundSource) {
  const player = useAudioPlayer(source, {
    keepAudioSessionActive: false,
  });

  useEffect(() => {
    if (!source) return;

    player.loop = true;
    player.volume = 1;
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    });
  }, []);

  const startAudio = useCallback(() => {
    if (!source || !player.isLoaded) return;
    void player.seekTo(0).then(() => player.play());
  }, [player, source]);

  const stopAudio = useCallback(() => {
    if (!source) return;
    player.pause();
    void player.seekTo(0);
  }, [player, source]);

  return { startAudio, stopAudio };
}
