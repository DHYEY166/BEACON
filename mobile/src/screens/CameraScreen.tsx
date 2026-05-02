import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import uuid from 'react-native-uuid';
import { queryBeaconWithImage } from '../services/inference';
import { saveIncident } from '../services/storage';

type State = 'idle' | 'loading' | 'error';

export default function CameraScreen() {
  const navigation = useNavigation<any>();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 ?? null);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === 'web') {
      await pickImage();
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setError('Camera permission denied.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setImageBase64(result.assets[0].base64 ?? null);
    }
  };

  const handleSubmit = async () => {
    if (!imageBase64) return;
    setState('loading');
    setError('');

    const transcript = note.trim() || 'Analyze this image and provide emergency guidance.';

    try {
      const guidance = await queryBeaconWithImage(transcript, imageBase64);

      const incident = {
        id: uuid.v4() as string,
        timestamp: new Date().toISOString(),
        transcript,
        language: 'en',
        guidance,
        location: '',
        patientCount: 1,
        situationSummary: guidance.situation_summary,
      };

      await saveIncident(incident);
      setState('idle');
      navigation.navigate('Guidance', { incident });
    } catch (e: any) {
      setState('error');
      setError('Could not get guidance. Check connection.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>VISUAL ASSESSMENT</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.subtitle}>
          Capture or upload a photo of the scene, wound, or patient for AI analysis.
        </Text>

        {imageUri ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
            <TouchableOpacity style={styles.retakeBtn} onPress={() => { setImageUri(null); setImageBase64(null); }}>
              <Text style={styles.retakeBtnText}>✕ Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.captureRow}>
            <TouchableOpacity style={styles.captureBtn} onPress={takePhoto}>
              <Text style={styles.captureIcon}>📷</Text>
              <Text style={styles.captureBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.captureBtn, styles.uploadBtn]} onPress={pickImage}>
              <Text style={styles.captureIcon}>🖼</Text>
              <Text style={styles.captureBtnText}>Upload</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.noteLabel}>ADDITIONAL CONTEXT (optional)</Text>
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Child age 4, fever for 2 days, rash visible..."
          placeholderTextColor="#9E9E9E"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ⚕ Images are analyzed by Gemma 4's vision model and are not stored or shared.
          </Text>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.submitBtn, (!imageBase64 || state === 'loading') && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!imageBase64 || state === 'loading'}
      >
        {state === 'loading' ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitBtnText}>Analyze Image →</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
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
  backText: { color: '#69F0AE', fontSize: 15, fontWeight: '700', width: 60 },
  headerTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 2 },

  body: { padding: 20, gap: 16 },
  subtitle: { fontSize: 15, color: '#6B7280', lineHeight: 22, textAlign: 'center' },

  captureRow: { flexDirection: 'row', gap: 12 },
  captureBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1A1A2E', borderRadius: 14, paddingVertical: 28, gap: 8,
  },
  uploadBtn: { backgroundColor: '#1565C0' },
  captureIcon: { fontSize: 32 },
  captureBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  previewContainer: { borderRadius: 14, overflow: 'hidden', position: 'relative' },
  preview: { width: '100%', height: 260, borderRadius: 14 },
  retakeBtn: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  retakeBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  noteLabel: { fontSize: 11, fontWeight: '800', color: '#9E9E9E', letterSpacing: 1.5 },
  noteInput: {
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 14,
    fontSize: 15, color: '#1A1A2E', borderWidth: 1, borderColor: '#E5E7EB', minHeight: 90,
  },

  errorText: { color: '#C62828', fontSize: 14, textAlign: 'center' },

  disclaimer: {
    backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#1565C0',
  },
  disclaimerText: { fontSize: 13, color: '#1E40AF', lineHeight: 18 },

  submitBtn: {
    margin: 16, paddingVertical: 16, borderRadius: 12,
    backgroundColor: '#1A1A2E', alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#9CA3AF' },
  submitBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});
