'use client';

import React, { useState, useEffect, useRef } from 'react';

// --- Types ---
type PronunciationWord = {
  id: string;
  word: string;
  ipa: string;
  level: string;
  category: string;
  notes: string;
};

type MinimalPair = {
  word1: string;
  word2: string;
  ipa1: string;
  ipa2: string;
};

// --- Dicionário Estático Base (Cache Inicial Rápido) ---
const STATIC_IPA_CACHE: Record<string, { ipa: string; stress?: string[]; notes?: string }> = {
  'hello': { ipa: 'həˈloʊ', stress: ['he', 'LLO'], notes: 'Saudação comum. O "h" é aspirado.' },
  'world': { ipa: 'wɜːrld', stress: ['WORLD'], notes: 'Atenção ao "r" retroflexo e "l" velar.' },
  'teacher': { ipa: 'ˈtiːtʃər', stress: ['TEA', 'cher'], notes: 'Vogal longa /iː/ e dígrafo "ch" africado.' },
  'student': { ipa: 'ˈstjuːdnt', stress: ['STU', 'dent'], notes: 'Sem vogal de apoio antes do "st" (evitar "istudent").' },
  'english': { ipa: 'ˈɪŋɡlɪʃ', stress: ['ENG', 'lish'], notes: 'Som nasal velar /ŋ/ seguido de /ɡ/.' },
  'pronunciation': { ipa: 'prəˌnʌnsiˈeɪʃn', stress: ['pro', 'nun', 'ci', 'A', 'tion'], notes: 'Atenção: escreve-se "nunc" e não "nounc".' },
  'water': { ipa: 'ˈwɔːtər', stress: ['WA', 'ter'], notes: 'No inglês americano o "t" sofre flapping (/ˈwɑːt̬ɚ/).' },
  'bottle': { ipa: 'ˈbɑːtl', stress: ['BOT', 'tle'], notes: 'L syllabic no final.' },
  'school': { ipa: 'skuːl', stress: ['SCHOOL'], notes: 'Vogal /uː/ longa; evitar "ischool".' },
};

const MINIMAL_PAIRS: MinimalPair[] = [
  { word1: 'ship', word2: 'sheep', ipa1: '/ʃɪp/', ipa2: '/ʃiːp/' },
  { word1: 'bit', word2: 'beat', ipa1: '/bɪt/', ipa2: '/biːt/' },
  { word1: 'cat', word2: 'cut', ipa1: '/kæt/', ipa2: '/kʌt/' },
  { word1: 'desk', word2: 'disk', ipa1: '/dɛsk/', ipa2: '/dɪsk/' },
  { word1: 'pen', word2: 'pan', ipa1: '/pɛn/', ipa2: '/pæn/' },
  { word1: 'bad', word2: 'bed', ipa1: '/bæd/', ipa2: '/bɛd/' },
  { word1: 'sing', word2: 'thing', ipa1: '/sɪŋ/', ipa2: '/θɪŋ/' },
  { word1: 'tree', word2: 'three', ipa1: '/triː/', ipa2: '/θriː/' },
];

const RHYME_MOCK_MAP: Record<string, string[]> = {
  'cat': ['bat', 'rat', 'mat', 'hat', 'flat'],
  'dog': ['log', 'fog', 'frog', 'jog'],
  'day': ['say', 'play', 'may', 'way', 'stay'],
  'night': ['light', 'right', 'fight', 'sight', 'bright'],
};

export default function AudioPronunciation() {
  const [activeTab, setActiveTab] = useState<'pronunciation' | 'minimal' | 'dictation' | 'bank' | 'export'>('pronunciation');
  const [toast, setToast] = useState<string | null>(null);
  
  // Voices
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  
  // Tab: Pronunciation
  const [pronWord, setPronWord] = useState('');
  const [pronRate, setPronRate] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Dynamic IPA state
  const [dynamicIpaCache, setDynamicIpaCache] = useState<Record<string, { ipa: string; stress?: string[]; notes?: string }>>({});
  const [isFetchingIpa, setIsFetchingIpa] = useState(false);
  
  // Tab: Minimal Pairs
  const [mpIndex, setMpIndex] = useState(0);
  const [mpMode, setMpMode] = useState<'practice' | 'quiz'>('practice');
  
  // Tab: Dictation
  const [dictationList, setDictationList] = useState<string>('');
  const [dictInterval, setDictInterval] = useState<number>(3);
  const [dictStatus, setDictStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [dictCurrentIndex, setDictCurrentIndex] = useState(0);
  
  // Tab: Word Bank
  const [wordBank, setWordBank] = useState<PronunciationWord[]>([]);
  const [newBankWord, setNewBankWord] = useState({ word: '', ipa: '', level: 'A1', category: 'vowels', notes: '' });

  // Refs
  const dictTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Load voices
    const loadVoices = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const available = window.speechSynthesis.getVoices();
        const enVoices = available.filter(v => v.lang.startsWith('en'));
        setVoices(enVoices.length > 0 ? enVoices : available);
        if (enVoices.length > 0 && !selectedVoice) {
          setSelectedVoice(enVoices[0].name);
        }
      }
    };

    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Load Local Dynamic Cache & Word Bank
    try {
      const savedCache = localStorage.getItem('teacher_ipa_dynamic_cache');
      if (savedCache) setDynamicIpaCache(JSON.parse(savedCache));

      const savedBank = localStorage.getItem('teacher_pronunciation_bank');
      if (savedBank) setWordBank(JSON.parse(savedBank));
    } catch {}

    return () => {
      if (dictTimerRef.current) clearTimeout(dictTimerRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const speak = (text: string, rate: number = pronRate) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (!text.trim()) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    
    if (selectedVoice) {
      const voiceObj = voices.find(v => v.name === selectedVoice);
      if (voiceObj) utterance.voice = voiceObj;
    }

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
  };

  // ─── Consulta Dinâmica de IPA com IA ────────────────────────────────────
  const fetchDynamicIpa = async (word: string) => {
    const clean = word.trim().toLowerCase();
    if (!clean) return;

    // 1. Checa cache estático
    if (STATIC_IPA_CACHE[clean]) return;

    // 2. Checa cache dinâmico local
    if (dynamicIpaCache[clean]) return;

    setIsFetchingIpa(true);
    try {
      const prompt = `Você é um foneticista especializado em Língua Inglesa (Cambridge English / General American).
Gere a transcrição fonética IPA e a divisão silábica com ênfase tônica para a palavra em inglês "${clean}".
Retorne ESTRITAMENTE um objeto JSON no formato:
{
  "ipa": "/transcrição_ipa_aqui/",
  "stress": ["sílaba1", "SILABATONICA", "silaba3"],
  "notes": "Dica de pronúncia para estudantes brasileiros (ex: sons que não existem no português, flapping, vogais longas)"
}`;

      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await res.json();
      const raw = data?.reply || data?.content || '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const cleanIpa = parsed.ipa.replace(/^\/|\/$/g, '');
        const entry = {
          ipa: cleanIpa,
          stress: Array.isArray(parsed.stress) ? parsed.stress : [clean.toUpperCase()],
          notes: parsed.notes || 'Transcrição fonética obtida via motor IA.'
        };

        const updated = { ...dynamicIpaCache, [clean]: entry };
        setDynamicIpaCache(updated);
        try {
          localStorage.setItem('teacher_ipa_dynamic_cache', JSON.stringify(updated));
        } catch {}
      }
    } catch (err) {
      console.error('Erro ao buscar IPA dinâmico:', err);
    } finally {
      setIsFetchingIpa(false);
    }
  };

  const currentPhonetics = () => {
    const clean = pronWord.trim().toLowerCase();
    if (!clean) return null;
    return STATIC_IPA_CACHE[clean] || dynamicIpaCache[clean] || null;
  };

  const handleSaveToBank = () => {
    if (!newBankWord.word.trim()) return;
    const phon = STATIC_IPA_CACHE[newBankWord.word.toLowerCase()] || dynamicIpaCache[newBankWord.word.toLowerCase()];
    const newEntry: PronunciationWord = {
      id: Date.now().toString(),
      word: newBankWord.word.trim(),
      ipa: newBankWord.ipa || (phon ? `/${phon.ipa}/` : '(Áudio disponível)'),
      level: newBankWord.level,
      category: newBankWord.category,
      notes: newBankWord.notes || phon?.notes || ''
    };

    const updated = [...wordBank, newEntry];
    setWordBank(updated);
    localStorage.setItem('teacher_pronunciation_bank', JSON.stringify(updated));
    setNewBankWord({ word: '', ipa: '', level: 'A1', category: 'vowels', notes: '' });
    showToast('Palavra salva no banco de pronúncia!');
  };

  const handleDeleteFromBank = (id: string) => {
    const updated = wordBank.filter(w => w.id !== id);
    setWordBank(updated);
    localStorage.setItem('teacher_pronunciation_bank', JSON.stringify(updated));
  };

  const renderWaveform = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 40, margin: '16px 0' }}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
        <div key={i} style={{ width: 6, height: isPlaying ? '30px' : '10px', background: '#8b5e3c', borderRadius: 3, transition: 'height 0.2s' }} />
      ))}
    </div>
  );

  const phonData = currentPhonetics();

  return (
    <div style={{ padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf8f2', maxWidth: 1400, margin: '0 auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#8b5e3c', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
              LAB FONÉTICO DINÂMICO
            </span>
            <span style={{ fontSize: 13, color: '#7a6552' }}>Fonética IPA & Síntese de Voz Nativa</span>
          </div>
          <h1 style={{ margin: '4px 0 0 0', fontSize: 26, fontFamily: 'Fraunces, Georgia, serif', color: '#2c1a0e' }}>
            Pronúncia, Fonética IPA & Áudio
          </h1>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 6, background: '#fffcf8', padding: 4, borderRadius: 12, border: '1px solid #d5c0b0' }}>
          <button
            onClick={() => setActiveTab('pronunciation')}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeTab === 'pronunciation' ? '#8b5e3c' : 'transparent', color: activeTab === 'pronunciation' ? '#fff' : '#586e75', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            <i className="ti ti-microphone"></i> Análise Fonética
          </button>
          <button
            onClick={() => setActiveTab('minimal')}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeTab === 'minimal' ? '#8b5e3c' : 'transparent', color: activeTab === 'minimal' ? '#fff' : '#586e75', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            <i className="ti ti-arrows-diff"></i> Pares Mínimos
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: activeTab === 'bank' ? '#8b5e3c' : 'transparent', color: activeTab === 'bank' ? '#fff' : '#586e75', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            <i className="ti ti-books"></i> Banco de Vocabulário ({wordBank.length})
          </button>
        </div>
      </div>

      {/* Settings Bar */}
      <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 14, padding: '14px 20px', marginBottom: 24, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7a6552' }}>Voz em Inglês:</span>
          <select 
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            style={{ background: '#fdf8f2', border: '1px solid #d5c0b0', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#2c1a0e', outline: 'none' }}
          >
            {voices.map(v => (
              <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#7a6552' }}>Velocidade:</span>
          <select 
            value={pronRate}
            onChange={(e) => setPronRate(Number(e.target.value))}
            style={{ background: '#fdf8f2', border: '1px solid #d5c0b0', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#2c1a0e', outline: 'none' }}
          >
            <option value={1}>Normal (1.0x)</option>
            <option value={0.75}>Lento (0.75x)</option>
            <option value={0.5}>Muito Lento (0.5x)</option>
          </select>
        </div>
      </div>

      {/* Tab 1: Pronúncia & Análise Fonética Dinâmica */}
      {activeTab === 'pronunciation' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 480px) 1fr', gap: 24 }}>
          {/* Input Panel */}
          <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 24 }}>
            <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '1.2rem', color: '#2c1a0e', margin: '0 0 16px 0' }}>
              Pesquisar Palavra ou Frase
            </h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input 
                style={{ flex: 1, background: '#fdf8f2', border: '1px solid #d5c0b0', borderRadius: 10, padding: '10px 14px', fontSize: 14, color: '#2c1a0e', outline: 'none' }}
                placeholder="Ex: thorough, comfortable, schedule..."
                value={pronWord}
                onChange={(e) => setPronWord(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    speak(pronWord);
                    fetchDynamicIpa(pronWord);
                  }
                }}
              />
              <button
                onClick={() => {
                  speak(pronWord);
                  fetchDynamicIpa(pronWord);
                }}
                disabled={isFetchingIpa}
                style={{ background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <i className={isFetchingIpa ? 'ti ti-loader ti-spin' : 'ti ti-player-play-filled'}></i>
                {isFetchingIpa ? 'Buscando...' : 'Ouvir & Analisar'}
              </button>
            </div>

            {renderWaveform()}

            {pronWord && (
              <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                <button
                  onClick={() => fetchDynamicIpa(pronWord)}
                  disabled={isFetchingIpa}
                  style={{ flex: 1, padding: '8px 12px', background: '#fdf8f2', border: '1px solid #d5c0b0', borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: '#8b5e3c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <i className="ti ti-sparkles"></i> Consultar Fonética IA
                </button>
                <button 
                  onClick={() => {
                    setNewBankWord({ ...newBankWord, word: pronWord, ipa: phonData ? `/${phonData.ipa}/` : '' });
                    setActiveTab('bank');
                  }}
                  style={{ padding: '8px 14px', background: '#fdf8f2', border: '1px solid #d5c0b0', borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: '#4a382a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="ti ti-bookmark"></i> Salvar
                </button>
              </div>
            )}
          </div>

          {/* Result Panel: IPA & Sílaba Tônica */}
          <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 24 }}>
            {!pronWord ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a08060' }}>
                <i className="ti ti-microphone" style={{ fontSize: 48, opacity: 0.4, marginBottom: 12 }}></i>
                <p>Digite qualquer palavra ou frase para gerar a transcrição fonética IPA e divisão silábica.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Transcrição IPA */}
                <div style={{ background: '#fdf8f2', padding: 18, borderRadius: 12, border: '1px solid #e8decb' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Transcrição Fonética Internacional (IPA)
                  </span>
                  {phonData ? (
                    <div>
                      <div style={{ fontSize: '2.2rem', fontWeight: 800, fontFamily: "'Fira Code', monospace", color: '#8b5e3c', margin: '6px 0' }}>
                        /{phonData.ipa}/
                      </div>
                      {phonData.notes && (
                        <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#4a382a', lineHeight: 1.45 }}>
                          💡 <strong>Dica Pedagógica:</strong> {phonData.notes}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#7a6552' }}>
                        {isFetchingIpa ? 'Consultando dicionário fonético dinâmico via IA...' : 'Clique em "Consultar Fonética IA" para gerar a transcrição precisa deste termo.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Sílaba Tônica (Stress Visualizer) */}
                {phonData?.stress && (
                  <div style={{ background: '#fdf8f2', padding: 18, borderRadius: 12, border: '1px solid #e8decb' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#a08060', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Sílaba Tônica & Ritmo (Word Stress)
                    </span>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {phonData.stress.map((syl, i) => {
                        const isStressed = syl === syl.toUpperCase();
                        return (
                          <div 
                            key={i} 
                            style={{
                              padding: '8px 16px', borderRadius: 8,
                              background: isStressed ? '#8b5e3c' : '#fff', 
                              color: isStressed ? '#fff' : '#2c1a0e', 
                              border: isStressed ? 'none' : '1px solid #d5c0b0',
                              fontWeight: isStressed ? 800 : 500,
                              fontSize: isStressed ? 16 : 14
                            }}
                          >
                            {syl}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Pares Mínimos */}
      {activeTab === 'minimal' && (
        <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 24 }}>
          <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '1.2rem', color: '#2c1a0e', margin: '0 0 16px 0' }}>
            Treinamento de Pares Mínimos (Minimal Pairs)
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {MINIMAL_PAIRS.map((pair, idx) => (
              <div key={idx} style={{ background: '#fdf8f2', padding: 16, borderRadius: 12, border: '1px solid #e8decb', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button onClick={() => speak(pair.word1)} style={{ flex: 1, padding: '8px 12px', background: '#fff', border: '1px solid #d5c0b0', borderRadius: 8, fontWeight: 700, color: '#8b5e3c', cursor: 'pointer' }}>
                    🔊 {pair.word1} <span style={{ fontSize: 11, color: '#a08060' }}>{pair.ipa1}</span>
                  </button>
                  <span style={{ margin: '0 8px', fontWeight: 800, color: '#a08060' }}>vs</span>
                  <button onClick={() => speak(pair.word2)} style={{ flex: 1, padding: '8px 12px', background: '#fff', border: '1px solid #d5c0b0', borderRadius: 8, fontWeight: 700, color: '#8b5e3c', cursor: 'pointer' }}>
                    🔊 {pair.word2} <span style={{ fontSize: 11, color: '#a08060' }}>{pair.ipa2}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Banco de Palavras */}
      {activeTab === 'bank' && (
        <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.16)', borderRadius: 16, padding: 24 }}>
          <h2 style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: '1.2rem', color: '#2c1a0e', margin: '0 0 16px 0' }}>
            Banco de Vocabulário & Pronúncia
          </h2>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <input 
              placeholder="Palavra em inglês..."
              value={newBankWord.word}
              onChange={e => setNewBankWord({ ...newBankWord, word: e.target.value })}
              style={{ flex: 2, background: '#fdf8f2', border: '1px solid #d5c0b0', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
            />
            <input 
              placeholder="IPA (opcional)..."
              value={newBankWord.ipa}
              onChange={e => setNewBankWord({ ...newBankWord, ipa: e.target.value })}
              style={{ flex: 1, background: '#fdf8f2', border: '1px solid #d5c0b0', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
            />
            <button onClick={handleSaveToBank} style={{ background: '#8b5e3c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
              Adicionar ao Banco
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {wordBank.map(w => (
              <div key={w.id} style={{ background: '#fdf8f2', border: '1px solid #e8decb', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: 14, color: '#2c1a0e' }}>{w.word}</strong>
                  <div style={{ fontSize: 12, color: '#8b5e3c', fontFamily: 'monospace' }}>{w.ipa}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => speak(w.word)} style={{ background: '#fff', border: '1px solid #d5c0b0', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>
                    🔊
                  </button>
                  <button onClick={() => handleDeleteFromBank(w.id)} style={{ background: 'transparent', border: 'none', color: '#dc322f', cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#2c1a0e', color: '#fdf8f2', padding: '10px 18px', borderRadius: 8, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}