// IncidentLogScreen.tsx — Aisha, Hours 12–20
// Scrollable log of past incidents with urgency badge and timestamp.

import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getIncidents } from '../services/storage';
import { Incident, URGENCY_COLORS } from '../types';

export default function IncidentLogScreen() {
  const navigation = useNavigation<any>();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getIncidents(100).then(data => {
      setIncidents(data);
      setLoading(false);
    });
  }, []);

  const renderItem = ({ item }: { item: Incident }) => {
    const color = URGENCY_COLORS[item.guidance.urgency];
    const date = new Date(item.timestamp).toLocaleString();
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('Guidance', { incident: item })}
      >
        <View style={[styles.urgencyStripe, { backgroundColor: color }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={[styles.urgencyLabel, { color }]}>{item.guidance.urgency}</Text>
            <Text style={styles.timestamp}>{date}</Text>
          </View>
          <Text style={styles.summary} numberOfLines={2}>
            {item.guidance.situation_summary}
          </Text>
          <Text style={styles.transcript} numberOfLines={1}>
            "{item.transcript}"
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Incident Log</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#1565C0" />
      ) : incidents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No incidents recorded yet.</Text>
        </View>
      ) : (
        <FlatList
          data={incidents}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#212121',
  },
  backText: { color: '#FFFFFF', fontSize: 16 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  loader: { marginTop: 60 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#9E9E9E', fontSize: 16 },
  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  urgencyStripe: { width: 6 },
  cardBody: { flex: 1, padding: 14 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  urgencyLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  timestamp: { fontSize: 12, color: '#9E9E9E' },
  summary: { fontSize: 15, color: '#212121', lineHeight: 20, marginBottom: 4 },
  transcript: { fontSize: 13, color: '#9E9E9E', fontStyle: 'italic' },
});
