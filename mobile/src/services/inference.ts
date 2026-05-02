import { GuidanceOutput } from '../types';
import { BACKEND_URL } from '../config';
import { retrieve } from './rag';

export { BACKEND_URL };

// Simple REST endpoint attached to Gradio's FastAPI app
async function callBeaconApi(transcript: string, context: string): Promise<GuidanceOutput> {
  const response = await fetch(`${BACKEND_URL}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, context }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Backend error: ${response.status} — ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  return _validate(data);
}

export async function queryBeacon(transcript: string, language = 'en'): Promise<GuidanceOutput> {
  let ragContext = '';
  try {
    const { context } = await retrieve(transcript);
    ragContext = context;
  } catch (e) {
    console.warn('[inference] RAG retrieval failed:', e);
  }

  return callBeaconApi(transcript, ragContext);
}

export async function queryBeaconWithImage(transcript: string, imageBase64: string): Promise<GuidanceOutput> {
  return callBeaconApi(transcript, '');
}

function _validate(data: any): GuidanceOutput {
  if (
    !data.urgency ||
    !['IMMEDIATE', 'URGENT', 'ROUTINE'].includes(data.urgency) ||
    !data.situation_summary ||
    !Array.isArray(data.immediate_actions)
  ) {
    throw new Error('Invalid response shape from backend');
  }
  return {
    urgency: data.urgency,
    situation_summary: data.situation_summary,
    containment_check: data.containment_check,
    immediate_actions: data.immediate_actions,
    do_not: data.do_not ?? [],
    escalate_if: data.escalate_if ?? [],
    confidence: data.confidence ?? 'MEDIUM',
    source: data.source ?? '',
  } as GuidanceOutput;
}
