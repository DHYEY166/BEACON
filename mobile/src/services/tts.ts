import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

// BCP-47 codes for speech synthesis / recognition
export const LANG_BCP47: Record<string, string> = {
  en: 'en-US', sw: 'sw-KE', hi: 'hi-IN', fr: 'fr-FR',
  ar: 'ar-SA', es: 'es-ES', pt: 'pt-BR', zh: 'zh-CN',
  ha: 'ha', am: 'am-ET',
};

async function pickVoice(bcp47: string): Promise<SpeechSynthesisVoice | null> {
  const voices: SpeechSynthesisVoice[] = await new Promise(resolve => {
    const v = window.speechSynthesis.getVoices();
    if (v.length > 0) return resolve(v);
    window.speechSynthesis.addEventListener('voiceschanged', () => resolve(window.speechSynthesis.getVoices()), { once: true });
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 800);
  });

  const lang2 = bcp47.split('-')[0];
  // Prefer online (non-local) voices — higher quality in Chrome/Edge
  return (
    voices.find(v => v.lang === bcp47 && !v.localService) ??
    voices.find(v => v.lang.startsWith(lang2) && !v.localService) ??
    voices.find(v => v.lang === bcp47) ??
    voices.find(v => v.lang.startsWith(lang2)) ??
    null
  );
}

export async function speak(text: string, language = 'en'): Promise<void> {
  const bcp47 = LANG_BCP47[language] ?? language;

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const voice = await pickVoice(bcp47);
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = bcp47;
    utt.rate = 0.88;
    utt.pitch = 1.0;
    if (voice) utt.voice = voice;
    window.speechSynthesis.speak(utt);
  } else {
    Speech.speak(text, { language: bcp47, rate: 0.88 });
  }
}

export function stopSpeaking(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.speechSynthesis?.cancel();
  } else {
    Speech.stop();
  }
}
