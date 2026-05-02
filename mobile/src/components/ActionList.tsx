import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  title: string;
  items: string[];
  bulletColor?: string;
  bulletSymbol?: string;
  numbered?: boolean;
  cardBg?: string;
}

export function ActionList({
  title, items, bulletColor = '#1565C0', bulletSymbol = '→', numbered = false, cardBg,
}: Props) {
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: bulletColor }]}>{title.toUpperCase()}</Text>
      {items.map((item, i) => (
        <View key={i} style={[styles.card, cardBg ? { backgroundColor: cardBg } : null]}>
          <View style={[styles.bullet, { backgroundColor: bulletColor }]}>
            <Text style={styles.bulletText}>
              {numbered ? String(i + 1) : bulletSymbol}
            </Text>
          </View>
          <Text style={styles.item}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  bullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  bulletText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  item: {
    fontSize: 15,
    color: '#1A1A2E',
    lineHeight: 22,
    flex: 1,
  },
});
