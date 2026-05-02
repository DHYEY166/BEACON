'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { queryBeaconStream } from '@/lib/api';
import { GuidanceOutput, Language, LANGUAGE_LABELS, DEMO_QUERIES, URGENCY_COLORS } from '@/lib/types';

type AppState = 'idle' | 'loading' | 'streaming' | 'speaking' | 'listening' | 'done' | 'error';
const LANGUAGES: Language[] = ['sw', 'en', 'hi', 'fr', 'ar', 'ha'];
const BROWSER_LANG: Record<Language, string> = { en: 'en-US', sw: 'sw-KE', hi: 'hi-IN', fr: 'fr-FR', ar: 'ar-SA', ha: 'ha-NG' };

declare global { interface Window { SpeechRecognition: any; webkitSpeechRecognition: any; } }

const OPENAI_KEY = process.env.NEXT_PUBLIC_OPENAI_KEY!;
const LANG_NAMES: Record<Language, string> = { en: 'English', sw: 'Swahili', hi: 'Hindi', fr: 'French', ar: 'Arabic', ha: 'Hausa' };

const UI_LABELS: Record<Language, {
  describe: string; speak: string; stop: string; photo: string; reading: string;
  getGuidance: string; connecting: string; generating: string; speakingGuidance: string;
  tryDemo: string; newQuery: string; speakInLang: string; respondInLang: string;
}> = {
  en: { describe: 'Describe the situation', speak: '🎤 Speak', stop: '⏹ Stop', photo: '📷 Photo', reading: '⏳ Reading…', getGuidance: 'Get Guidance', connecting: 'Connecting…', generating: 'Generating…', speakingGuidance: 'Speaking guidance…', tryDemo: 'Try demo', newQuery: 'New query', speakInLang: 'Speak in which language?', respondInLang: 'Respond in which language?' },
  sw: { describe: 'Eleza hali', speak: '🎤 Zungumza', stop: '⏹ Simama', photo: '📷 Picha', reading: '⏳ Inasoma…', getGuidance: 'Pata Mwongozo', connecting: 'Inaunganika…', generating: 'Inaunda…', speakingGuidance: 'Inasema mwongozo…', tryDemo: 'Jaribu demo', newQuery: 'Swali jipya', speakInLang: 'Zungumza kwa lugha gani?', respondInLang: 'Jibu kwa lugha gani?' },
  hi: { describe: 'स्थिति बताएं', speak: '🎤 बोलें', stop: '⏹ रुकें', photo: '📷 फ़ोटो', reading: '⏳ पढ़ रहा है…', getGuidance: 'मार्गदर्शन पाएं', connecting: 'जोड़ रहा है…', generating: 'बना रहा है…', speakingGuidance: 'मार्गदर्शन बोल रहा है…', tryDemo: 'डेमो देखें', newQuery: 'नया प्रश्न', speakInLang: 'किस भाषा में बोलें?', respondInLang: 'किस भाषा में जवाब दें?' },
  fr: { describe: 'Décrivez la situation', speak: '🎤 Parler', stop: '⏹ Arrêter', photo: '📷 Photo', reading: '⏳ Lecture…', getGuidance: 'Obtenir des conseils', connecting: 'Connexion…', generating: 'Génération…', speakingGuidance: 'Conseils en cours…', tryDemo: 'Essayer la démo', newQuery: 'Nouvelle requête', speakInLang: 'Parler dans quelle langue ?', respondInLang: 'Répondre dans quelle langue ?' },
  ar: { describe: 'صف الوضع', speak: '🎤 تحدث', stop: '⏹ توقف', photo: '📷 صورة', reading: '⏳ جارٍ القراءة…', getGuidance: 'احصل على إرشادات', connecting: 'جارٍ الاتصال…', generating: 'جارٍ الإنشاء…', speakingGuidance: 'جارٍ نطق الإرشادات…', tryDemo: 'جرب العرض', newQuery: 'استعلام جديد', speakInLang: 'تحدث بأي لغة؟', respondInLang: 'الرد بأي لغة؟' },
  ha: { describe: 'Bayyana halin da ake ciki', speak: '🎤 Yi magana', stop: '⏹ Tsaya', photo: '📷 Hoto', reading: '⏳ Ana karanta…', getGuidance: 'Sami jagora', connecting: 'Ana haɗawa…', generating: 'Ana ƙirƙira…', speakingGuidance: 'Ana magana da jagora…', tryDemo: 'Gwada demo', newQuery: 'Saƙon sabon', speakInLang: 'Yi magana da wace harshe?', respondInLang: 'Amsa da wace harshe?' },
};

// ── Translate a single English string to target language ──────────────────────
async function translate(text: string, lang: Language): Promise<string> {
  if (lang === 'en') return text;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Translate the following emergency medical guidance to ${LANG_NAMES[lang]}. Keep it calm, clear, and compassionate. Return only the translated text, nothing else.` },
          { role: 'user', content: text },
        ],
        max_tokens: 600,
      }),
    });
    const d = await res.json();
    return d.choices?.[0]?.message?.content ?? text;
  } catch { return text; }
}

// ── Translate the full guidance panel display fields (one batched call) ────────
async function translateGuidance(g: GuidanceOutput, lang: Language): Promise<GuidanceOutput> {
  if (lang === 'en') return g;
  try {
    const payload = {
      situation_summary: g.situation_summary,
      containment_check: g.containment_check ?? '',
      immediate_actions: g.immediate_actions,
      do_not: g.do_not,
      escalate_if: g.escalate_if,
    };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Translate the following emergency medical guidance JSON to ${LANG_NAMES[lang]}. Keep medical terms accurate and tone calm. Return only valid JSON with the exact same structure and keys.` },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        max_tokens: 1200,
      }),
    });
    const d = await res.json();
    const raw = d.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw.replace(/^```json\n?|```$/g, '').trim());
    return {
      ...g,
      situation_summary: parsed.situation_summary ?? g.situation_summary,
      containment_check: parsed.containment_check || g.containment_check,
      immediate_actions: parsed.immediate_actions ?? g.immediate_actions,
      do_not: parsed.do_not ?? g.do_not,
      escalate_if: parsed.escalate_if ?? g.escalate_if,
    };
  } catch { return g; }
}

// ── Web Audio API context — unlocked once on first user gesture ───────────────
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return _audioCtx;
}
function unlockAudio() {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
}

// ── Fetch OpenAI TTS and return decoded AudioBuffer ───────────────────────────
async function fetchAudio(text: string): Promise<AudioBuffer> {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', input: text, voice: 'shimmer', response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error('TTS failed');
  const arrayBuffer = await res.arrayBuffer();
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') await ctx.resume();
  return ctx.decodeAudioData(arrayBuffer);
}

// ── Play a decoded AudioBuffer, returns a promise that resolves when done ─────
function playAudioBuffer(buffer: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getAudioCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => resolve();
    source.start(0);
  });
}

// ── Sequential audio queue — prefetches in parallel, plays in order ────────────
class AudioQueue {
  private queue: Promise<AudioBuffer>[] = [];
  private playing = false;
  private done = false;
  private onAllDone: () => void;
  private cancelled = false;

  constructor(onAllDone: () => void) { this.onAllDone = onAllDone; }

  push(audioPromise: Promise<AudioBuffer>) {
    this.queue.push(audioPromise);
    if (!this.playing) this.next();
  }

  streamDone() {
    this.done = true;
    if (!this.playing && this.queue.length === 0) this.onAllDone();
  }

  cancel() { this.cancelled = true; this.queue = []; }

  private async next() {
    if (this.cancelled || this.queue.length === 0) {
      this.playing = false;
      if (this.done) this.onAllDone();
      return;
    }
    this.playing = true;
    const buffer = await this.queue.shift()!.catch(() => null);
    if (this.cancelled || !buffer) { this.next(); return; }
    await playAudioBuffer(buffer).catch(() => {});
    this.next();
  }
}

// ── Describe a medical scene from an image using GPT-4o vision ───────────────
async function describeImage(base64: string, mimeType: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'low' } },
          { type: 'text', text: 'You are assisting a community first responder in the field. Describe the medical emergency, injury, or symptoms visible in this image in 2-3 clear sentences. Include visible signs like bleeding, unconsciousness, burns, swelling, or distress. If no medical situation is visible, say so briefly.' },
        ],
      }],
      max_tokens: 200,
    }),
  });
  const d = await res.json();
  return d.choices?.[0]?.message?.content?.trim() ?? '';
}

// ── Auto-detect language from input text ──────────────────────────────────────
async function detectLanguage(text: string): Promise<Language> {
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Detect the language of the text. Reply with exactly one of: en, sw, hi, fr, ar, ha. Nothing else.' },
          { role: 'user', content: text.slice(0, 200) },
        ],
        max_tokens: 5,
      }),
    });
    const d = await res.json();
    const lang = d.choices?.[0]?.message?.content?.trim().toLowerCase();
    if (['en', 'sw', 'hi', 'fr', 'ar', 'ha'].includes(lang)) return lang as Language;
  } catch {}
  return 'en';
}

// ── Detect individual spoken items as they complete in the partial stream ────────
// Fires per-item (not per-section) so TTS fetch starts immediately per action,
// keeping the audio pipeline full and eliminating gaps between sections.

const SECTION_HEADERS: Record<string, string> = {
  immediate_actions: 'Do the following immediately. ',
  do_not: 'Avoid the following. ',
  escalate_if: 'Get urgent help if: ',
};

function detectNewItems(partial: string, spokenKeys: Set<string>): string[] {
  const newItems: string[] = [];

  // containment_check — single string value
  const ccMatch = partial.match(/"containment_check"\s*:\s*"([^"]{10,})"/);
  if (ccMatch) {
    const key = 'cc';
    if (!spokenKeys.has(key)) { spokenKeys.add(key); newItems.push(ccMatch[1]); }
  }

  // Array sections — fire per completed item (string followed by , or ])
  for (const field of ['immediate_actions', 'do_not', 'escalate_if']) {
    const fieldIdx = partial.indexOf(`"${field}"`);
    if (fieldIdx === -1) continue;
    const arrayStart = partial.indexOf('[', fieldIdx);
    if (arrayStart === -1) continue;
    // Extract only this array's content (balanced brackets) to avoid matching items from later arrays
    let depth = 0, arrayEnd = arrayStart;
    for (let i = arrayStart; i < partial.length; i++) {
      if (partial[i] === '[') depth++;
      else if (partial[i] === ']') { depth--; if (depth === 0) { arrayEnd = i + 1; break; } }
    }
    const section = partial.slice(arrayStart, arrayEnd || partial.length);
    const itemRe = /"([^"\\]{6,}(?:\\.[^"\\]*)*)"\s*[,\]]/g;
    let m;
    while ((m = itemRe.exec(section)) !== null) {
      const text = m[1];
      const key = `${field}:${text}`;
      if (!spokenKeys.has(key)) {
        const isFirst = !Array.from(spokenKeys).some(k => k.startsWith(`${field}:`));
        spokenKeys.add(key);
        newItems.push(isFirst ? SECTION_HEADERS[field] + text : text);
      }
    }
  }

  return newItems;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [language, setLanguage]       = useState<Language>('sw');
  const [transcript, setTranscript]   = useState('');
  const [appState, setAppState]       = useState<AppState>('idle');
  const [guidance, setGuidance]       = useState<GuidanceOutput | null>(null);
  const [errorMsg, setErrorMsg]       = useState('');
  const [liveUrgency, setLiveUrgency] = useState<string | null>(null);
  const [, setLiveLabel]              = useState('Consulting Gemma 4 + WHO/SPHERE protocols…');

  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showVoiceLangPicker, setShowVoiceLangPicker] = useState(false);
  const [cycleIdx, setCycleIdx] = useState(0);
  const recognitionRef       = useRef<any>(null);
  const cameraInputRef       = useRef<HTMLInputElement>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const streamRef            = useRef('');
  const spokenKeysRef        = useRef(new Set<string>());
  const queueRef             = useRef<AudioQueue | null>(null);
  const cancelledRef         = useRef(false);
  const pendingResult        = useRef<GuidanceOutput | null>(null);
  const translatedResult     = useRef<GuidanceOutput | null>(null);

  // Auto-detect language as user types (debounced)
  useEffect(() => {
    if (transcript.trim().length < 8 || isProcessing) return;
    const t = setTimeout(() => {
      detectLanguage(transcript).then(setLanguage).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (forceLang?: Language) => {
    if (!transcript.trim() || ['loading','streaming','speaking'].includes(appState)) return;

    unlockAudio(); // must be called synchronously within user gesture for iOS
    setShowLangPicker(false);
    cancelledRef.current = true;
    queueRef.current?.cancel();
    cancelledRef.current = false;
    streamRef.current = '';
    spokenKeysRef.current = new Set();
    pendingResult.current = null;
    translatedResult.current = null;
    setAppState('loading');
    setLiveUrgency(null);
    setLiveLabel('Consulting Gemma 4 + WHO/SPHERE protocols…');
    setGuidance(null);
    setErrorMsg('');

    const lang = forceLang ?? language;

    const queue = new AudioQueue(() => {
      if (!cancelledRef.current) {
        setGuidance(translatedResult.current ?? pendingResult.current);
        setAppState('done');
      }
    });
    queueRef.current = queue;

    const pushGroup = (text: string) => {
      // Start translate + TTS fetch immediately (parallel to continued streaming)
      const audioPromise = translate(text, lang).then(t => fetchAudio(t)).catch(() => Promise.reject());
      queue.push(audioPromise);
      setAppState('streaming');
    };

    try {
      const result = await queryBeaconStream(transcript.trim(), (token) => {
        streamRef.current += token;
        if (appState !== 'streaming') setAppState('streaming');

        const newItems = detectNewItems(streamRef.current, spokenKeysRef.current);
        newItems.forEach(text => pushGroup(text));

        const urgencyM = streamRef.current.match(/"urgency"\s*:\s*"(IMMEDIATE|URGENT|ROUTINE)"/);
        if (urgencyM) { setLiveUrgency(urgencyM[1]); setLiveLabel('Speaking guidance…'); }
      });

      pendingResult.current = result;

      // Translate display fields in background while audio plays
      translateGuidance(result, lang).then(t => { translatedResult.current = t; }).catch(() => {});

      // Cache hit: no tokens fired, extract items from final result now
      if (spokenKeysRef.current.size === 0 && result) {
        const fakePartial = JSON.stringify(result);
        const items = detectNewItems(fakePartial, spokenKeysRef.current);
        items.forEach(text => pushGroup(text));
        if (result.urgency) setLiveUrgency(result.urgency);
        setLiveLabel('Speaking guidance…');
      }

      setAppState('speaking');
      queue.streamDone();
    } catch (e: any) {
      cancelledRef.current = true;
      queueRef.current?.cancel();
      setAppState('error');
      setErrorMsg(e.message ?? 'Cannot reach BEACON server.');
    }
  };

  const startVoice = useCallback((voiceLang: Language) => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) { setErrorMsg('Voice not supported. Try typing instead.'); return; }
    setShowVoiceLangPicker(false);
    const rec = new SR();
    rec.lang = BROWSER_LANG[voiceLang];
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript + ' ';
      }
      if (text.trim()) setTranscript(prev => prev ? `${prev} ${text.trim()}` : text.trim());
    };
    rec.onend = () => { if (recognitionRef.current === rec) setAppState('idle'); };
    rec.onerror = (e: any) => {
      setAppState('error');
      const reason = e?.error;
      if (reason === 'not-allowed') setErrorMsg('Microphone access denied. Allow it in browser settings and try again.');
      else if (reason === 'no-speech') setErrorMsg('No speech detected. Please speak clearly and try again.');
      else if (reason === 'network') setErrorMsg('Network error during voice capture. Try typing instead.');
      else setErrorMsg(`Voice error: ${reason ?? 'unknown'}. Try typing instead.`);
    };
    recognitionRef.current = rec;
    rec.start();
    setAppState('listening');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVoice = useCallback(() => {
    if (appState === 'listening') { recognitionRef.current?.stop(); setAppState('idle'); return; }
    setShowVoiceLangPicker(v => !v);
  }, [appState]);

  const handleCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraLoading(true);
    setErrorMsg('');
    setShowLangPicker(false);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const description = await describeImage(base64, file.type);
      if (description) { setTranscript(description); setShowLangPicker(true); }
      else setErrorMsg('Could not read the image. Please type your query.');
    } catch {
      setErrorMsg('Image processing failed. Please type your query.');
    } finally {
      setCameraLoading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleLangSelect = (lang: Language) => {
    setLanguage(lang);
    handleSubmit(lang);
  };

  const fillDemo = () => setTranscript(DEMO_QUERIES[language]);
  const reset = () => {
    cancelledRef.current = true;
    queueRef.current?.cancel();
    setGuidance(null); setAppState('idle'); setTranscript('');
    setErrorMsg(''); setLiveUrgency(null); setShowLangPicker(false); setShowVoiceLangPicker(false);
    streamRef.current = ''; spokenKeysRef.current = new Set();
  };

  const isProcessing = ['loading','streaming','speaking'].includes(appState);
  const urgencyColors = liveUrgency ? URGENCY_COLORS[liveUrgency as keyof typeof URGENCY_COLORS] : null;

  const CYCLE_MESSAGES: Record<Language, string[]> = {
    en: ['Analyzing situation…', 'Stay calm.', 'Help is being prepared.', 'Consulting WHO protocols…', 'Be patient.', 'Guidance is coming.', 'You are doing the right thing.', 'Stay with the patient.'],
    sw: ['Hali inachunguzwa…', 'Tulia.', 'Msaada unaandaliwa.', 'Inashauriana na itifaki za WHO…', 'Vumilia.', 'Mwongozo unakuja.', 'Unafanya jambo sahihi.', 'Kaa na mgonjwa.'],
    hi: ['स्थिति का विश्लेषण हो रहा है…', 'शांत रहें।', 'सहायता तैयार की जा रही है।', 'WHO प्रोटोकॉल से परामर्श…', 'धैर्य रखें।', 'मार्गदर्शन आ रहा है।', 'आप सही काम कर रहे हैं।', 'मरीज़ के साथ रहें।'],
    fr: ['Analyse de la situation…', 'Restez calme.', 'L\'aide est en cours de préparation.', 'Consultation des protocoles OMS…', 'Soyez patient.', 'Les conseils arrivent.', 'Vous faites ce qu\'il faut.', 'Restez avec le patient.'],
    ar: ['.جارٍ تحليل الوضع…', '.ابقَ هادئاً', '.المساعدة قيد التحضير', '…استشارة بروتوكولات منظمة الصحة العالمية', '.كن صبوراً', '.التوجيه في الطريق', '.أنت تفعل الشيء الصحيح', '.ابقَ مع المريض'],
    ha: ['Ana nazarin halin da ake ciki…', 'Kasance lafiya.', 'Ana shirya taimako.', 'Ana tuntubar ka\'idojin WHO…', 'Yi haƙuri.', 'Jagora yana zuwa.', 'Kana yin abu mai kyau.', 'Kasance tare da majiyyaci.'],
  };

  useEffect(() => {
    if (!isProcessing) { setCycleIdx(0); return; }
    const t = setInterval(() => setCycleIdx(i => (i + 1) % CYCLE_MESSAGES[language].length), 2500);
    return () => clearInterval(t);
  }, [isProcessing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      {/* Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-black tracking-[0.25em] text-white">BEACON</span>
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold tracking-wide uppercase">
            Field Guidance
          </span>
        </div>
        <span className="text-[11px] text-neutral-600">WHO/SPHERE · IMCI</span>
      </header>

      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-6 flex flex-col gap-5">

        {/* Input card */}
        <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
          <div className="p-4 pb-0">
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-2">{UI_LABELS[language].describe}</p>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Symptoms, number of patients, location…"
              rows={4}
              disabled={isProcessing}
              className="w-full bg-transparent text-white placeholder-neutral-600 resize-none focus:outline-none text-[15px] leading-relaxed"
            />
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-neutral-800 mt-2" />

          {/* Action buttons */}
          <div className="px-4 py-3 flex items-center gap-2">
            <button
              onClick={handleVoice}
              disabled={isProcessing || cameraLoading}
              className={`flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-sm font-semibold transition-all ${
                appState === 'listening'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-transparent'
              } disabled:opacity-40`}>
              {appState === 'listening' ? UI_LABELS[language].stop : UI_LABELS[language].speak}
            </button>

            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isProcessing || cameraLoading}
              className="flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-sm font-semibold bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-transparent transition-all disabled:opacity-40">
              {cameraLoading ? UI_LABELS[language].reading : UI_LABELS[language].photo}
            </button>

            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={handleCameraChange} />

            <button
              onClick={fillDemo}
              disabled={isProcessing || cameraLoading}
              className="ml-auto text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors disabled:opacity-30 underline underline-offset-2">
              {UI_LABELS[language].tryDemo}
            </button>
          </div>

          {/* Voice language picker */}
          {showVoiceLangPicker && (
            <div className="mx-4 mb-1 bg-neutral-800/60 border border-neutral-700 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">{UI_LABELS[language].speakInLang}</p>
              <div className="flex gap-2 flex-wrap">
                {LANGUAGES.map(lang => (
                  <button key={lang} onClick={() => startVoice(lang)}
                    className="px-3.5 h-9 rounded-lg text-sm font-semibold bg-neutral-700 text-neutral-200 hover:bg-emerald-500 hover:text-white transition-all">
                    {LANGUAGE_LABELS[lang]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="mx-4 mb-3 flex items-start gap-2.5 bg-red-950/40 border border-red-800/50 rounded-xl px-3.5 py-3">
              <span className="text-red-400 text-sm mt-px">⚠</span>
              <p className="text-red-300 text-sm leading-snug">{errorMsg}</p>
            </div>
          )}

          {/* Language picker (photo flow only) */}
          {showLangPicker && (
            <div className="mx-4 mb-3 bg-neutral-800/60 border border-emerald-800/40 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">{UI_LABELS[language].respondInLang}</p>
              <div className="flex gap-2 flex-wrap">
                {LANGUAGES.map(lang => (
                  <button key={lang} onClick={() => handleLangSelect(lang)}
                    className="px-3.5 h-9 rounded-lg text-sm font-semibold bg-neutral-700 text-neutral-200 hover:bg-emerald-500 hover:text-white transition-all">
                    {LANGUAGE_LABELS[lang]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Primary CTA */}
          {!showLangPicker && (
            <div className="px-4 pb-4">
              <button
                onClick={() => handleSubmit()}
                disabled={!transcript.trim() || isProcessing}
                className="w-full h-12 rounded-xl font-bold text-[15px] transition-all bg-white text-neutral-900 hover:bg-neutral-100 disabled:bg-neutral-800 disabled:text-neutral-600 active:scale-[0.99]">
                {appState === 'loading' ? UI_LABELS[language].connecting
                  : appState === 'streaming' ? UI_LABELS[language].generating
                  : appState === 'speaking' ? UI_LABELS[language].speakingGuidance
                  : UI_LABELS[language].getGuidance}
              </button>
            </div>
          )}
        </div>

        {/* Language support note */}
        <p className="text-[11px] text-neutral-600 text-center">
          {LANGUAGES.map(l => LANGUAGE_LABELS[l]).join(' · ')} · language auto-detected
        </p>

        {/* Processing state */}
        {isProcessing && (
          <div className={`rounded-2xl overflow-hidden border ${urgencyColors ? urgencyColors.border : 'border-neutral-800'}`}>
            {urgencyColors && (
              <div className={`${urgencyColors.bg} px-4 py-2 flex items-center gap-2`}>
                <span className="text-white font-bold text-xs tracking-widest uppercase">{liveUrgency}</span>
                <span className="text-white/50 text-xs">·</span>
                <span className="text-white/60 text-xs">guidance incoming</span>
              </div>
            )}
            <div className="bg-neutral-900 px-5 py-7 flex flex-col items-center gap-4">
              {urgencyColors ? (
                <div className="flex items-end gap-1 h-8">
                  {[0.4,0.7,1.0,0.6,0.9,0.5,0.8,0.4,0.75,0.55,0.9,0.65].map((h, i) => (
                    <div key={i}
                      className={urgencyColors.bg}
                      style={{ width: 4, height: `${h * 100}%`, borderRadius: 2,
                        animation: `wave 1.2s ease-in-out ${i * 0.1}s infinite alternate`, opacity: 0.9 }} />
                  ))}
                </div>
              ) : (
                <p
                  key={cycleIdx}
                  className="text-neutral-300 text-base font-medium text-center"
                  style={{ animation: 'fadein 0.6s ease' }}>
                  {CYCLE_MESSAGES[language][cycleIdx]}
                </p>
              )}
              {urgencyColors && (
                <p key={cycleIdx} className="text-neutral-400 text-sm font-medium text-center" style={{ animation: 'fadein 0.6s ease' }}>
                  {CYCLE_MESSAGES[language][cycleIdx]}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Guidance panel */}
        {guidance && appState === 'done' && <GuidancePanel guidance={guidance} onReset={reset} newQueryLabel={UI_LABELS[language].newQuery} />}

        {/* Disclaimer */}
        <p className="text-[11px] text-neutral-600 text-center pb-2 leading-relaxed">
          Decision support for trained responders · not a substitute for clinical judgment
        </p>
      </main>

      <style jsx global>{`
        @keyframes wave { from { transform: scaleY(0.3); } to { transform: scaleY(1.0); } }
        @keyframes fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function GuidancePanel({ guidance, onReset, newQueryLabel }: { guidance: GuidanceOutput; onReset: () => void; newQueryLabel: string }) {
  const colors = URGENCY_COLORS[guidance.urgency];
  return (
    <div className="bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
      {/* Urgency banner */}
      <div className={`${colors.bg} px-4 py-2.5 flex items-center justify-between`}>
        <span className="text-white font-bold text-xs tracking-widest uppercase">{guidance.urgency}</span>
        <span className="text-white/60 text-xs">Confidence: {guidance.confidence}</span>
      </div>

      <div className="p-5 flex flex-col gap-5">
        {/* Situation summary */}
        <p className="text-white text-base leading-relaxed">{guidance.situation_summary}</p>

        {/* Containment check */}
        {guidance.containment_check && !['N/A','null',''].includes(guidance.containment_check) && (
          <div className="bg-amber-500/5 border-l-[3px] border-amber-400 rounded-r-xl pl-4 pr-3 py-3">
            <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-1.5">Check for spread</p>
            <p className="text-amber-100/90 text-sm leading-relaxed">{guidance.containment_check}</p>
          </div>
        )}

        {/* Action sections */}
        <ActionSection
          title="Do now"
          items={guidance.immediate_actions}
          dotClass="bg-emerald-400"
          textClass="text-neutral-100"
        />
        <ActionSection
          title="Do not"
          items={guidance.do_not}
          dotClass="bg-red-400"
          textClass="text-neutral-200"
        />
        <ActionSection
          title="Escalate if"
          items={guidance.escalate_if}
          dotClass="bg-amber-400"
          textClass="text-neutral-200"
        />

        {/* Footer */}
        <div className="border-t border-neutral-800 pt-4 flex items-center justify-between gap-4">
          <p className="text-neutral-600 text-xs leading-snug flex-1">{guidance.source}</p>
          <button
            onClick={onReset}
            className="shrink-0 px-4 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-emerald-400 text-sm font-semibold transition-colors">
            {newQueryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionSection({ title, items, dotClass, textClass }: {
  title: string; items: string[]; dotClass: string; textClass: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{title}</p>
      <ul className="flex flex-col gap-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className={`${dotClass} mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full`} />
            <span className={`${textClass} text-sm leading-relaxed`}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
