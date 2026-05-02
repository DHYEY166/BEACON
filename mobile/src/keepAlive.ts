// keepAlive.ts — Component 8 (Amara, Hours 1–2 test + 12–20 integration)
// iOS AVAudioSession keep-alive. Prevents OS from suspending and unloading Gemma 4.
// Call configureAudioSession() at app launch, before first query.
// Note: startWhisperRecording() also calls setAudioModeAsync — it includes
// staysActiveInBackground:true so keep-alive survives through recording cycles.

import { Platform } from 'react-native';
import { Audio } from 'expo-av';

export async function configureAudioSession(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckAndroid: false,
  });
}

// Fallback: if keep-alive fails (detected at Hour 2), call this to prevent screen lock
// while an active incident session is in progress.
export function requestScreenOnDuringSession(): void {
  // React Native doesn't expose screen-on lock directly.
  // Use react-native-keep-awake if keep-alive fails:
  // import KeepAwake from 'react-native-keep-awake'; KeepAwake.activate();
}
