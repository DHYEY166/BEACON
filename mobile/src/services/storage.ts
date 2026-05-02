// services/storage.ts — AsyncStorage-based incident log (Expo Go compatible)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Incident } from '../types';

const KEY = 'beacon_incidents';

export async function saveIncident(incident: Incident): Promise<void> {
  const existing = await getIncidents();
  const updated = [incident, ...existing].slice(0, 200);
  await AsyncStorage.setItem(KEY, JSON.stringify(updated));
}

export async function getIncidents(limit = 50): Promise<Incident[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  const all: Incident[] = JSON.parse(raw);
  return all.slice(0, limit);
}
