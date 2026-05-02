import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { GuidanceCard } from '../components/GuidanceCard';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { speak, stopSpeaking } from '../services/tts';
import { Incident } from '../types';

export default function GuidanceScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const incident: Incident = route.params?.incident;
  const autoSpeak: boolean = route.params?.autoSpeak ?? false;

  const buildTTSText = (inc: Incident) => {
    const steps = inc.guidance.immediate_actions.map((a, i) => `Step ${i + 1}. ${a}`).join('. ');
    return [
      `${inc.guidance.urgency}.`,
      inc.guidance.situation_summary,
      inc.guidance.containment_check ?? '',
      'Immediate actions:',
      steps,
    ].filter(Boolean).join(' ');
  };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (autoSpeak && incident) {
      timer = setTimeout(() => speak(buildTTSText(incident), incident.language), 400);
    }
    return () => {
      if (timer) clearTimeout(timer);
      stopSpeaking();
    };
  }, []);

  const handleTTSReplay = () => {
    stopSpeaking();
    speak(buildTTSText(incident), incident.language);
  };

  if (!incident) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No guidance available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BEACON GUIDANCE</Text>
        <OfflineIndicator />
      </View>

      <GuidanceCard guidance={incident.guidance} />

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.ttsBtn} onPress={handleTTSReplay}>
          <Text style={styles.btnIcon}>🔊</Text>
          <Text style={styles.ttsBtnText}>Read Aloud</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.smsBtn}
          onPress={() => navigation.navigate('SMSCompose', { incident })}
        >
          <Text style={styles.btnIcon}>📡</Text>
          <Text style={styles.smsBtnText}>SMS Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  errorText: { margin: 20, color: '#9E9E9E', fontSize: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    backgroundColor: '#1A1A2E',
  },
  backBtn: { padding: 4 },
  backText: { color: '#69F0AE', fontSize: 15, fontWeight: '700' },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  actionRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  ttsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1565C0',
  },
  smsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2E7D32',
  },
  btnIcon: { fontSize: 18 },
  ttsBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  smsBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
