import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { GuidanceOutput } from '../types';

interface Props {
  urgency: GuidanceOutput['urgency'];
}

const CONFIG: Record<GuidanceOutput['urgency'], { bg: string; border: string; icon: string; label: string }> = {
  IMMEDIATE: { bg: '#C62828', border: '#FF1744', icon: '🚨', label: 'IMMEDIATE ACTION REQUIRED' },
  URGENT:    { bg: '#E65100', border: '#FF6D00', icon: '⚠️',  label: 'URGENT' },
  ROUTINE:   { bg: '#1B5E20', border: '#2E7D32', icon: '✓',   label: 'ROUTINE' },
};

export function UrgencyBadge({ urgency }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;
  const cfg = CONFIG[urgency];

  useEffect(() => {
    if (urgency !== 'IMMEDIATE') return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ])
    ).start();
    return () => pulse.stopAnimation();
  }, [urgency]);

  if (urgency === 'IMMEDIATE') {
    return (
      <Animated.View style={[styles.banner, { backgroundColor: cfg.bg, opacity: pulse }]}>
        <Text style={styles.bannerIcon}>{cfg.icon}</Text>
        <Text style={styles.bannerText}>{cfg.label}</Text>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={styles.badgeText}>{cfg.icon}  {cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 10,
    marginBottom: 4,
  },
  bannerIcon: { fontSize: 24 },
  bannerText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  badge: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 2,
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
});
