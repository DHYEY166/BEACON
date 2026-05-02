// src/types.ts — Shared TypeScript types for all services and screens

export interface GuidanceOutput {
  urgency: 'IMMEDIATE' | 'URGENT' | 'ROUTINE';
  situation_summary: string;
  containment_check?: string;
  immediate_actions: string[];
  do_not: string[];
  escalate_if: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source: string;  // WHO/SPHERE citation e.g. "WHO SPHERE Handbook §3.2"
}

export interface ChunkEntry {
  id: string | null;  // null for regular chunks; "ORT_FORMULA"/"CONTAINMENT_CHECK" for priority
  text: string;
  tag: 'triage' | 'outbreak' | 'trauma' | 'pediatric' | 'resource' | 'flood' | 'communication' | 'priority';
  embedding?: number[];
}

export interface Incident {
  id: string;           // uuid v4
  timestamp: string;    // ISO 8601
  transcript: string;
  language: string;
  guidance: GuidanceOutput;
  location: string;     // "lat, lon" or "[Location — tap to type]"
  patientCount: number;
  situationSummary: string;
}

export interface SMSMessage {
  body: string;
  location: string;
}

export interface STTResult {
  transcript: string;
  language: string;
  confidence: number;
  engine: 'apple' | 'whisper';
}

export interface RAGResult {
  context: string;
  is_outbreak: boolean;
}

export type Language = 'en' | 'sw' | 'hi' | 'fr' | 'ar' | 'es' | 'pt' | 'zh' | 'ha' | 'am';

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  sw: 'Swahili',
  hi: 'Hindi',
  fr: 'French',
  ar: 'Arabic',
  es: 'Spanish',
  pt: 'Portuguese',
  zh: 'Chinese',
  ha: 'Hausa',
  am: 'Amharic',
};

export const URGENCY_COLORS: Record<GuidanceOutput['urgency'], string> = {
  IMMEDIATE: '#D32F2F',
  URGENT: '#F57C00',
  ROUTINE: '#388E3C',
};
