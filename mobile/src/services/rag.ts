/**
 * On-device RAG using BM25 keyword retrieval.
 *
 * @xenova/transformers requires WebAssembly which Hermes does not support.
 * BM25 is pure TypeScript, zero model download, works fully offline.
 * For production upgrade: replace with onnxruntime-react-native + multilingual-e5-small ONNX.
 *
 * Cross-lingual coverage: multilingual keyword synonyms for the top emergency terms
 * cover Swahili, Hindi, and Hausa queries against English chunks.
 */

const TOP_K = 5;
const K1 = 1.5;  // BM25 term frequency saturation
const B = 0.75;  // BM25 length normalisation

// ── Multilingual keyword synonyms → English ────────────────────────────────
// Maps non-English terms to their English equivalents so BM25 matches English chunks.
const SYNONYM_MAP: Record<string, string> = {
  // Swahili
  kuhara: 'diarrhea', kutapika: 'vomiting', maji: 'water', moto: 'fever',
  mtoto: 'child', watoto: 'children', damu: 'blood', jeraha: 'wound',
  maumivu: 'pain', pumzi: 'breathing', moyo: 'heart', maziwa: 'breastfeed',
  lishe: 'nutrition', chakula: 'food', homa: 'fever', kikohozi: 'cough',
  // Hindi
  दस्त: 'diarrhea', उल्टी: 'vomiting', बुखार: 'fever', बच्चा: 'child',
  पानी: 'water', खून: 'blood', सांस: 'breathing', दर्द: 'pain',
  // Hausa
  gudawa: 'diarrhea', amai: 'vomiting', zazzabi: 'fever', yaro: 'child',
  ruwa: 'water', jini: 'blood', numfashi: 'breathing',
  // French (common in West/Central Africa)
  diarrhée: 'diarrhea', vomissement: 'vomiting', fièvre: 'fever',
  enfant: 'child', eau: 'water', sang: 'blood', respiration: 'breathing',
  // Arabic
  إسهال: 'diarrhea', قيء: 'vomiting', حمى: 'fever', طفل: 'child',
  ماء: 'water', دم: 'blood', تنفس: 'breathing',
};

const OUTBREAK_KEYWORDS = new Set([
  'diarrhea', 'diarrhoea', 'vomiting', 'outbreak', 'spread', 'contaminated',
  'water source', 'shared', 'cholera',
  // Multilingual equivalents
  'kuhara', 'kutapika', 'दस्त', 'उल्टी', 'gudawa', 'amai', 'diarrhée', 'إسهال',
]);

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chunk {
  text: string;
  tag: string;
  id: string | null;
}

// ── Module state ──────────────────────────────────────────────────────────────

let _chunks: Chunk[] | null = null;
let _tokenisedChunks: string[][] | null = null;
let _idf: Record<string, number> = {};
let _avgLen = 0;

// ── Public API ────────────────────────────────────────────────────────────────

export async function initRAG(): Promise<void> {
  if (_chunks) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const meta = require('../../assets/chunk_metadata.json') as {
    chunks: Chunk[];
  };
  _chunks = meta.chunks;
  _tokenisedChunks = _chunks.map(c => _tokenise(_translateQuery(c.text)));
  _buildIDF(_tokenisedChunks);
  _avgLen = _tokenisedChunks.reduce((s, t) => s + t.length, 0) / _tokenisedChunks.length;
}

export interface RAGResult {
  context: string;
  isOutbreak: boolean;
}

export async function retrieve(transcript: string): Promise<RAGResult> {
  if (!_chunks || !_tokenisedChunks) {
    throw new Error('RAG not initialised — call initRAG() first');
  }

  const normalisedQuery = _translateQuery(transcript);
  const queryTokens = _tokenise(normalisedQuery);
  const scores = _bm25Scores(queryTokens);

  const isOutbreak = _isOutbreakQuery(transcript);
  const priorityIndices = _chunks
    .map((c, i) => (c.tag === 'priority' ? i : -1))
    .filter(i => i >= 0);

  const topIndices = _argsortDesc(scores, TOP_K);
  const finalIndices = isOutbreak
    ? _dedupe([...priorityIndices, ...topIndices]).slice(0, TOP_K + priorityIndices.length)
    : topIndices;

  const context = finalIndices.map(i => _chunks![i].text).join('\n\n---\n\n');
  return { context, isOutbreak };
}

// No-op: BM25 has no model to unload
export function unloadEmbedder(): void {}

// ── BM25 ──────────────────────────────────────────────────────────────────────

function _buildIDF(docs: string[][]): void {
  const df: Record<string, number> = {};
  const n = docs.length;
  for (const tokens of docs) {
    for (const t of new Set(tokens)) {
      df[t] = (df[t] ?? 0) + 1;
    }
  }
  _idf = {};
  for (const [term, freq] of Object.entries(df)) {
    _idf[term] = Math.log((n - freq + 0.5) / (freq + 0.5) + 1);
  }
}

function _bm25Scores(queryTokens: string[]): number[] {
  const n = _tokenisedChunks!.length;
  const scores = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const doc = _tokenisedChunks![i];
    const len = doc.length;
    const tf: Record<string, number> = {};
    for (const t of doc) tf[t] = (tf[t] ?? 0) + 1;
    for (const term of queryTokens) {
      const idf = _idf[term] ?? 0;
      const f = tf[term] ?? 0;
      scores[i] += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (len / _avgLen))));
    }
  }
  return scores;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s؀-ۿऀ-ॿ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function _translateQuery(text: string): string {
  let result = text;
  for (const [foreign, english] of Object.entries(SYNONYM_MAP)) {
    result = result.replace(new RegExp(foreign, 'gi'), english);
  }
  return result;
}

function _isOutbreakQuery(text: string): boolean {
  const lower = text.toLowerCase();
  for (const kw of OUTBREAK_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

function _argsortDesc(scores: number[], k: number): number[] {
  return Array.from({ length: scores.length }, (_, i) => i)
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, k);
}

function _dedupe(arr: number[]): number[] {
  return [...new Set(arr)];
}
