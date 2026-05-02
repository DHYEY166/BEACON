import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { BACKEND_URL } from '../config';

export type STTState = 'idle' | 'recording' | 'processing' | 'error';

// Native recording state
let _recording: Audio.Recording | null = null;

// Web Speech Recognition state
let _webRec: any = null;
let _webParts: string[] = [];

export async function startRecording(language = 'en'): Promise<void> {
  if (Platform.OS === 'web') {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) throw new Error('Speech recognition not available in this browser. Use Chrome or Edge.');
    _webParts = [];
    const rec = new SR();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) _webParts.push(e.results[i][0].transcript);
      }
    };
    await new Promise<void>((resolve, reject) => {
      rec.onerror = (e: any) => reject(new Error(e.error));
      rec.onstart = () => resolve();
      rec.start();
    });
    _webRec = rec;
    return;
  }

  // Native
  await Audio.requestPermissionsAsync();
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  _recording = recording;
}

export async function stopRecordingAndTranscribe(language: string): Promise<string> {
  if (Platform.OS === 'web') {
    if (!_webRec) return '';
    return new Promise<string>((resolve, reject) => {
      _webRec.onerror = (e: any) => { _webRec = null; reject(new Error(e.error)); };
      _webRec.onend = () => {
        const text = _webParts.join(' ').trim();
        _webRec = null;
        resolve(text);
      };
      _webRec.stop();
    });
  }

  // Native — sends to /transcribe endpoint on the HF Space
  if (!_recording) throw new Error('No active recording');
  await _recording.stopAndUnloadAsync();
  const uri = _recording.getURI();
  _recording = null;
  if (!uri) throw new Error('No audio file produced');
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

  const formData = new FormData();
  formData.append('audio', { uri, name: 'recording.m4a', type: 'audio/m4a' } as any);
  formData.append('language', language);

  const response = await fetch(`${BACKEND_URL}/transcribe`, { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`Transcription failed: ${await response.text()}`);
  const data = await response.json();
  return data.transcript as string;
}

export async function cancelRecording(): Promise<void> {
  if (Platform.OS === 'web') {
    if (_webRec) {
      _webRec.onend = null;
      _webRec.onerror = null;
      try { _webRec.abort(); } catch { /* ignore */ }
      _webRec = null;
    }
    return;
  }
  if (_recording) {
    await _recording.stopAndUnloadAsync().catch(() => {});
    _recording = null;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  }
}
