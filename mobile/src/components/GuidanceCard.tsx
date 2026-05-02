import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { GuidanceOutput } from '../types';
import { UrgencyBadge } from './UrgencyBadge';
import { ActionList } from './ActionList';

interface Props {
  guidance: GuidanceOutput;
}

export function GuidanceCard({ guidance }: Props) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <UrgencyBadge urgency={guidance.urgency} />

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>SITUATION ASSESSMENT</Text>
        <Text style={styles.summary}>{guidance.situation_summary}</Text>
      </View>

      {guidance.containment_check ? (
        <View style={styles.containmentCard}>
          <View style={styles.containmentHeader}>
            <Text style={styles.containmentIcon}>🔍</Text>
            <Text style={styles.containmentTitle}>CHECK SPREAD FIRST</Text>
          </View>
          <Text style={styles.containmentText}>{guidance.containment_check}</Text>
        </View>
      ) : null}

      <ActionList
        title="Do Now"
        items={guidance.immediate_actions}
        bulletColor="#1565C0"
        numbered
      />

      <ActionList
        title="Do Not"
        items={guidance.do_not}
        bulletColor="#C62828"
        bulletSymbol="✕"
        cardBg="#FFF5F5"
      />

      <ActionList
        title="Escalate If"
        items={guidance.escalate_if}
        bulletColor="#E65100"
        bulletSymbol="!"
        cardBg="#FFF8F0"
      />

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Text style={styles.footerLabel}>SOURCE</Text>
          <Text style={styles.footerValue}>{guidance.source}</Text>
        </View>
        <View style={styles.footerRow}>
          <Text style={styles.footerLabel}>CONFIDENCE</Text>
          <View style={[
            styles.confidencePill,
            { backgroundColor: guidance.confidence === 'HIGH' ? '#E8F5E9' : guidance.confidence === 'MEDIUM' ? '#FFF8E1' : '#FFEBEE' }
          ]}>
            <Text style={[
              styles.confidenceText,
              { color: guidance.confidence === 'HIGH' ? '#2E7D32' : guidance.confidence === 'MEDIUM' ? '#F57F17' : '#C62828' }
            ]}>{guidance.confidence}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 40, gap: 12 },

  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#1565C0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9E9E9E',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  summary: {
    fontSize: 16,
    color: '#1A1A2E',
    lineHeight: 24,
    fontWeight: '500',
  },

  containmentCard: {
    backgroundColor: '#FFFDE7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  containmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  containmentIcon: { fontSize: 18 },
  containmentTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F57F17',
    letterSpacing: 1,
  },
  containmentText: { fontSize: 15, color: '#1A1A2E', lineHeight: 22 },

  footer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  footerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9E9E9E',
    letterSpacing: 1.5,
  },
  footerValue: {
    fontSize: 13,
    color: '#424242',
    flex: 1,
    textAlign: 'right',
  },
  confidencePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
