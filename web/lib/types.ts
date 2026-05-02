export type Urgency = 'IMMEDIATE' | 'URGENT' | 'ROUTINE';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type Language = 'en' | 'sw' | 'hi' | 'fr' | 'ar' | 'ha';

export interface GuidanceOutput {
  urgency: Urgency;
  situation_summary: string;
  containment_check?: string;
  immediate_actions: string[];
  do_not: string[];
  escalate_if: string[];
  confidence: Confidence;
  source: string;
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  sw: 'Kiswahili',
  hi: 'हिन्दी',
  fr: 'Français',
  ar: 'العربية',
  ha: 'Hausa',
};

export const DEMO_QUERIES: Record<Language, string> = {
  sw: 'Nina familia — mama na watoto wanne — wana kuhara sana na kutapika. Wamekuwa hivi siku mbili.',
  en: 'Family — mother and four children — severe diarrhea and vomiting for two days.',
  hi: 'परिवार — माँ और चार बच्चे — दो दिनों से तेज दस्त और उल्टी।',
  fr: 'Famille — mère et quatre enfants — diarrhée sévère et vomissements depuis deux jours.',
  ar: 'عائلة — أم وأربعة أطفال — إسهال شديد وقيء منذ يومين.',
  ha: 'Iyali — uwa da yara hudu — gudawa mai tsanani da amai tsawon kwana biyu.',
};

export const URGENCY_COLORS: Record<Urgency, { bg: string; text: string; border: string }> = {
  IMMEDIATE: { bg: 'bg-red-600',    text: 'text-red-600',    border: 'border-red-600' },
  URGENT:    { bg: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500' },
  ROUTINE:   { bg: 'bg-green-600',  text: 'text-green-600',  border: 'border-green-600' },
};
