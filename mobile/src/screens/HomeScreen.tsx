import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import uuid from 'react-native-uuid';

import { queryBeacon } from '../services/inference';
import { saveIncident } from '../services/storage';
import { startRecording, stopRecordingAndTranscribe, cancelRecording } from '../services/stt';
import { stopSpeaking } from '../services/tts';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { Language, LANGUAGE_LABELS } from '../types';

type AppState = 'idle' | 'loading' | 'recording' | 'transcribing' | 'error';

const DEMO_LANGUAGES: Language[] = ['sw', 'en', 'hi', 'ha', 'fr', 'ar'];

const DEMO_QUERIES: Record<Language, string> = {
  sw: 'Nina familia — mama na watoto wanne — wana kuhara sana na kutapika. Wamekuwa hivi siku mbili.',
  en: 'Family — mother and four children — severe diarrhea and vomiting for two days.',
  hi: 'परिवार — माँ और चार बच्चे — दो दिनों से तेज दस्त और उल्टी।',
  ha: 'Iyali — uwa da yara hudu — gudawa mai tsanani da amai tsawon kwana biyu.',
  fr: 'Famille — mère et quatre enfants — diarrhée sévère et vomissements depuis deux jours.',
  ar: 'عائلة — أم وأربعة أطفال — إسهال شديد وقيء منذ يومين.',
  am: '', es: '', pt: '', zh: '',
};

const LOADING_PHRASES = [
  'Analyzing situation...',
  'Consulting IMCI protocols...',
  'Cross-referencing WHO guidelines...',
  'Preparing field guidance...',
  'Almost ready...',
];

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [language, setLanguage] = useState<Language>('sw');
  const [transcript, setTranscript] = useState('');
  const [appState, setAppState] = useState<AppState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingPhrase, setLoadingPhrase] = useState(LOADING_PHRASES[0]);
  const phraseIdxRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (appState === 'loading') {
      phraseIdxRef.current = 0;
      setLoadingPhrase(LOADING_PHRASES[0]);
      intervalRef.current = setInterval(() => {
        phraseIdxRef.current = (phraseIdxRef.current + 1) % LOADING_PHRASES.length;
        setLoadingPhrase(LOADING_PHRASES[phraseIdxRef.current]);
      }, 3000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [appState]);

  // Stop any ongoing speech when leaving this screen
  useEffect(() => () => { stopSpeaking(); }, []);

  const runQuery = async (text: string, autoSpeak: boolean) => {
    setAppState('loading');
    setErrorMsg('');
    try {
      const guidance = await queryBeacon(text, language);
      const incident = {
        id: uuid.v4() as string,
        timestamp: new Date().toISOString(),
        transcript: text,
        language,
        guidance,
        location: '',
        patientCount: 1,
        situationSummary: guidance.situation_summary,
      };
      await saveIncident(incident);
      setTranscript('');
      setAppState('idle');
      navigation.navigate('Guidance', { incident, autoSpeak });
    } catch (e: any) {
      setAppState('error');
      setErrorMsg(`Error: ${e?.message ?? String(e)}`);
    }
  };

  const handleSubmit = () => {
    const text = transcript.trim();
    if (!text || appState === 'loading') return;
    runQuery(text, false);
  };

  const handleMicPress = async () => {
    if (appState === 'recording') {
      setAppState('transcribing');
      try {
        const text = await stopRecordingAndTranscribe(language);
        if (text.trim()) {
          setTranscript(text);
          // Auto-submit and auto-speak when input came from mic
          await runQuery(text, true);
        } else {
          setTranscript('');
          setAppState('idle');
        }
      } catch {
        await cancelRecording();
        setAppState('error');
        setErrorMsg('Voice transcription failed. Type your query instead.');
      }
    } else if (appState === 'idle' || appState === 'error') {
      setErrorMsg('');
      try {
        await startRecording(language);
        setAppState('recording');
      } catch (e: any) {
        setAppState('error');
        setErrorMsg(e?.message ?? 'Microphone permission denied.');
      }
    }
  };

  const fillDemo = () => setTranscript(DEMO_QUERIES[language] || DEMO_QUERIES['en']);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>BEACON</Text>
            <Text style={styles.appTagline}>Emergency Field Guidance</Text>
          </View>
          <OfflineIndicator />
        </View>

        {/* Language selector */}
        <View style={styles.langBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langScroll}>
            {DEMO_LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang}
                onPress={() => setLanguage(lang)}
                style={[styles.langBtn, language === lang && styles.langBtnActive]}
              >
                <Text style={[styles.langText, language === lang && styles.langTextActive]}>
                  {LANGUAGE_LABELS[lang]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">

          {/* Input Card */}
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>DESCRIBE THE SITUATION</Text>
            <TextInput
              style={styles.textInput}
              value={transcript}
              onChangeText={setTranscript}
              placeholder="Number of patients, symptoms, duration, location..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={appState !== 'loading' && appState !== 'transcribing'}
            />

            {/* Action buttons row */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.iconBtn,
                  appState === 'recording' && styles.iconBtnRed,
                  appState === 'transcribing' && styles.iconBtnOrange,
                ]}
                onPress={handleMicPress}
                disabled={appState === 'loading' || appState === 'transcribing'}
              >
                {appState === 'transcribing' ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.iconBtnText}>
                    {appState === 'recording' ? '⏹' : '🎤'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.iconBtn, styles.iconBtnCamera]}
                onPress={() => navigation.navigate('Camera')}
                disabled={appState === 'loading'}
              >
                <Text style={styles.iconBtnText}>📷</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.demoBtn} onPress={fillDemo}>
                <Text style={styles.demoBtnText}>⚡ Demo</Text>
              </TouchableOpacity>
            </View>

            {appState === 'recording' && (
              <Text style={styles.recordingHint}>● Recording… tap ⏹ when done</Text>
            )}
            {appState === 'transcribing' && (
              <Text style={styles.transcribingHint}>Processing speech...</Text>
            )}
            {appState === 'error' && (
              <Text style={styles.errorText}>{errorMsg}</Text>
            )}
          </View>

          {/* Submit button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!transcript.trim() || appState === 'loading' || appState === 'transcribing') && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!transcript.trim() || appState === 'loading' || appState === 'transcribing'}
          >
            {appState === 'loading' ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.loadingPhraseText}>{loadingPhrase}</Text>
              </View>
            ) : (
              <Text style={styles.submitBtnText}>Get Guidance →</Text>
            )}
          </TouchableOpacity>

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              ⚕  Decision support for trained responders only — not a replacement for clinical judgment.
            </Text>
          </View>

          <TouchableOpacity style={styles.logLink} onPress={() => navigation.navigate('IncidentLog')}>
            <Text style={styles.logLinkText}>📋  View Incident Log</Text>
          </TouchableOpacity>

          <View style={styles.poweredBy}>
            <Text style={styles.poweredByText}>Powered by Gemma 4 · WHO SPHERE · IMCI</Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, backgroundColor: '#1A1A2E',
  },
  appName: { fontSize: 26, fontWeight: '900', color: '#FFFFFF', letterSpacing: 4 },
  appTagline: { fontSize: 11, color: '#69F0AE', letterSpacing: 1.5, marginTop: 2, fontWeight: '600' },

  langBar: { backgroundColor: '#1A1A2E', paddingBottom: 14 },
  langScroll: { paddingHorizontal: 16, gap: 8 },
  langBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#2D2D44',
  },
  langBtnActive: { backgroundColor: '#69F0AE' },
  langText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  langTextActive: { color: '#1A1A2E', fontWeight: '800' },

  body: { flex: 1 },

  inputCard: {
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  inputLabel: {
    fontSize: 11, fontWeight: '800', color: '#9E9E9E',
    letterSpacing: 1.5, marginBottom: 10,
  },
  textInput: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    padding: 14, fontSize: 16, color: '#1A1A2E', minHeight: 110,
    backgroundColor: '#FAFAFA',
  },

  actionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  iconBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center',
  },
  iconBtnRed: { backgroundColor: '#C62828' },
  iconBtnOrange: { backgroundColor: '#E65100' },
  iconBtnCamera: { backgroundColor: '#1565C0' },
  iconBtnText: { fontSize: 20 },
  demoBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#93C5FD',
  },
  demoBtnText: { fontSize: 13, color: '#1D4ED8', fontWeight: '700' },

  recordingHint: { marginTop: 8, fontSize: 13, color: '#C62828', fontWeight: '600' },
  transcribingHint: { marginTop: 8, fontSize: 13, color: '#E65100', fontWeight: '600' },
  errorText: { marginTop: 8, color: '#C62828', fontSize: 14 },

  submitBtn: {
    marginHorizontal: 16, marginBottom: 12, paddingVertical: 18,
    borderRadius: 14, backgroundColor: '#1A1A2E', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  submitBtnDisabled: { backgroundColor: '#D1D5DB', shadowOpacity: 0 },
  submitBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingPhraseText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', opacity: 0.9 },

  disclaimer: {
    marginHorizontal: 16, marginBottom: 8, padding: 12,
    backgroundColor: '#F1F5F9', borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: '#94A3B8',
  },
  disclaimerText: { fontSize: 12, color: '#64748B', lineHeight: 18 },

  logLink: { alignItems: 'center', paddingVertical: 12 },
  logLinkText: { fontSize: 14, color: '#1565C0', fontWeight: '600' },

  poweredBy: { alignItems: 'center', paddingBottom: 32, paddingTop: 4 },
  poweredByText: { fontSize: 11, color: '#CBD5E1', letterSpacing: 0.5 },
});
