import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

interface Props {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(exitOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => onDone());
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: exitOpacity }]}>
      <Animated.View style={{ opacity }}>
        <Text style={styles.title}>BEACON</Text>
        <Text style={styles.tagline}>Emergency field guidance</Text>
        <Text style={styles.sub}>Powered by Gemma 4 · WHO/SPHERE</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#212121',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 52,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 8,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 18,
    color: '#69F0AE',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  sub: {
    fontSize: 13,
    color: '#757575',
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 0.5,
  },
});
