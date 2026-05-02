// SMSComposeScreen.tsx — GPS via expo-location, opens native SMS app
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { composeSMS, sendSMS } from '../services/sms';
import { Incident } from '../types';

export default function SMSComposeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const incident: Incident = route.params?.incident;

  const [messageBody, setMessageBody] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [patientCount, setPatientCount] = useState(String(incident?.patientCount ?? 1));

  useEffect(() => {
    (async () => {
      const count = parseInt(patientCount) || 1;
      const sms = await composeSMS({ ...incident, patientCount: count });
      setMessageBody(sms.body);
      setLocation(sms.location);
      setLoading(false);
    })();
  }, []);

  const handleSend = async () => {
    await sendSMS(messageBody);
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Getting GPS location…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>SMS Report</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>LOCATION</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="[Location — tap to type]"
          placeholderTextColor="#9E9E9E"
        />

        <Text style={styles.label}>PATIENT COUNT</Text>
        <TextInput
          style={[styles.input, { width: 80 }]}
          value={patientCount}
          onChangeText={setPatientCount}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>MESSAGE</Text>
        <TextInput
          style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
          value={messageBody}
          onChangeText={setMessageBody}
          multiline
          numberOfLines={6}
        />

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            ℹ You will tap Send in your SMS app. BEACON never sends automatically.
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
        <Text style={styles.sendBtnText}>Open SMS App →</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#616161' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, backgroundColor: '#212121',
  },
  backText: { color: '#FFFFFF', fontSize: 16 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  body: { flex: 1, padding: 20 },
  label: { fontSize: 11, fontWeight: '700', color: '#9E9E9E', letterSpacing: 1, marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8,
    padding: 12, fontSize: 16, color: '#212121',
  },
  noteBox: {
    marginTop: 16, padding: 12, backgroundColor: '#E3F2FD',
    borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#1565C0',
  },
  noteText: { fontSize: 13, color: '#1565C0' },
  sendBtn: {
    margin: 20, paddingVertical: 16, borderRadius: 10,
    backgroundColor: '#2E7D32', alignItems: 'center',
  },
  sendBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
});
