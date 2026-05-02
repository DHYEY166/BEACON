// services/sms.ts — GPS via expo-location, SMS via Linking
import * as Location from 'expo-location';
import { Linking } from 'react-native';
import { Incident, SMSMessage } from '../types';

const GPS_TIMEOUT_MS = 5000;

async function getLocationWithTimeout(): Promise<string> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return '[Location — tap to type]';

  const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), GPS_TIMEOUT_MS));

  const result = await Promise.race([locationPromise, timeoutPromise]);
  if (!result) return '[GPS timeout — tap to type]';
  return `${result.coords.latitude.toFixed(4)}, ${result.coords.longitude.toFixed(4)}`;
}

export async function composeSMS(incident: Incident): Promise<SMSMessage> {
  let locationStr = '[Location — tap to type]';
  try {
    locationStr = await getLocationWithTimeout();
  } catch {
    // GPS unavailable — use placeholder
  }

  const body =
    `BEACON — [${locationStr}] — ${incident.patientCount} affected. ` +
    `${incident.situationSummary}. ` +
    `Containment check in progress. ORT started. Request medical team.`;

  return { body, location: locationStr };
}

export async function sendSMS(body: string): Promise<void> {
  await Linking.openURL(`sms:?body=${encodeURIComponent(body)}`);
}
