/* eslint-disable @typescript-eslint/no-explicit-any */
import { GuidanceOutput } from './types';
import { BACKEND_URL } from './config';

function parseResult(data: any): GuidanceOutput {
  if (!data.urgency || !['IMMEDIATE', 'URGENT', 'ROUTINE'].includes(data.urgency)) {
    throw new Error('Invalid response from backend');
  }
  return {
    urgency: data.urgency,
    situation_summary: data.situation_summary,
    containment_check: data.containment_check,
    immediate_actions: data.immediate_actions ?? [],
    do_not: data.do_not ?? [],
    escalate_if: data.escalate_if ?? [],
    confidence: data.confidence ?? 'MEDIUM',
    source: data.source ?? '',
  };
}

export async function queryBeaconStream(
  transcript: string,
  onToken: (raw: string) => void,
): Promise<GuidanceOutput> {
  const res = await fetch(`${BACKEND_URL}/api/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, context: '' }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Backend error: ${res.status} — ${body.slice(0, 200)}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = JSON.parse(line.slice(6));
      if (payload.error) throw new Error(payload.error);
      if (payload.token) onToken(payload.token);
      if (payload.done) return parseResult(payload.result);
    }
  }

  throw new Error('Stream ended without a result');
}

// Keep non-streaming fallback
export async function queryBeacon(transcript: string): Promise<GuidanceOutput> {
  const res = await fetch(`${BACKEND_URL}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, context: '' }),
  });
  if (!res.ok) throw new Error(`Backend error: ${res.status}`);
  return parseResult(await res.json());
}
