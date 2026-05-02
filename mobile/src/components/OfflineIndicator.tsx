import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BACKEND_URL } from '../services/inference';

type ConnStatus = 'checking' | 'online' | 'offline';

export function OfflineIndicator() {
  const [status, setStatus] = useState<ConnStatus>('checking');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(`${BACKEND_URL}/`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!cancelled) setStatus(res.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) setStatus('offline');
      }
    }

    check();
    const interval = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const isOnline = status === 'online';
  const label = status === 'checking' ? 'CHECKING' : isOnline ? 'SERVER OK' : 'OFFLINE';
  const dotColor = status === 'checking' ? '#FFD740' : isOnline ? '#69F0AE' : '#FF5252';
  const bgColor = status === 'checking' ? '#4E342E' : isOnline ? '#1B5E20' : '#B71C1C';
  const textColor = dotColor;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
});
