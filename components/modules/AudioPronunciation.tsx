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

// --- Mock Data ---
const IPA_MOCK_MAP: Record<string, string> = {
  'hello': 'həˈloʊ',
  'world': 'wɜːrld',
  'teacher': 'ˈtiːtʃər',
  'student': 'ˈstjuːdnt',
  'english': 'ˈɪŋɡlɪʃ',
  'pronunciation': 'prəˌnʌnsiˈeɪʃn',
  'water': 'ˈwɔːtər',
  'bottle': 'ˈbɑːtl',
  'school': 'skuːl',
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

const STRESS_PATTERNS: Record<string, string[]> = {
  'photograph': ['PHO', 'to', 'graph'],
  'photography': ['pho', 'TOG', 'ra', 'phy'],
  'photographic': ['pho', 'to', 'GRAPH', 'ic'],
  'information': ['in', 'for', 'MA', 'tion'],
  'banana': ['ba', 'NA', 'na'],
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
    // Inject keyframes for fake waveform and slideIn
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes wave { 0% { height: 10px; } 50% { height: 40px; } 100% { height: 10px; } }
      .bar { width: 6px; background-color: #8b5e3c; border-radius: 3px; }
      .bar.active { animation: wave 1s infinite ease-in-out; }
      .bar:nth-child(1) { animation-delay: 0.0s; }
      .bar:nth-child(2) { animation-delay: 0.1s; }
      .bar:nth-child(3) { animation-delay: 0.2s; }
      .bar:nth-child(4) { animation-delay: 0.3s; }
      .bar:nth-child(5) { animation-delay: 0.4s; }
      .bar:nth-child(6) { animation-delay: 0.5s; }
      .bar:nth-child(7) { animation-delay: 0.6s; }
      
      @media print {
        body * { visibility: hidden; }
        #printable-export, #printable-export * { visibility: visible; }
        #printable-export { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; padding: 20px; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(styleEl);

    // Load voices
    const loadVoices = () => {
      let availableVoices = window.speechSynthesis.getVoices();
      availableVoices = availableVoices.filter(v => v.lang.startsWith('en'));
      setVoices(availableVoices);
      if (availableVoices.length > 0 && !selectedVoice) {
        const usVoice = availableVoices.find(v => v.lang === 'en-US');
        const gbVoice = availableVoices.find(v => v.lang === 'en-GB');
        setSelectedVoice(usVoice ? usVoice.name : (gbVoice ? gbVoice.name : availableVoices[0].name));
      }
    };
    
    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    // Load Word Bank
    const savedBank = localStorage.getItem('teacher_pronunciation_bank');
    if (savedBank) {
      try { setWordBank(JSON.parse(savedBank)); } catch (e) {}
    }

    return () => {
      document.head.removeChild(styleEl);
      if (dictTimerRef.current) clearTimeout(dictTimerRef.current);
      window.speechSynthesis.cancel();
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const speak = (text: string, rate: number = pronRate, onEnd?: () => void) => {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) {
      const voice = voices.find(v => v.name === selectedVoice);
      if (voice) utterance.voice = voice;
    }
    utterance.rate = rate;
    
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => {
      setIsPlaying(false);
      if (onEnd) onEnd();
    };
    utterance.onerror = () => setIsPlaying(false);
    
    window.speechSynthesis.speak(utterance);
  };

  // --- Dictation Logic ---
  const handleDictationToggle = () => {
    const items = dictationList.split('\\n').filter(l => l.trim().length > 0);
    if (items.length === 0) return showToast('Please enter some words or phrases.');

    if (dictStatus === 'playing') {
      setDictStatus('paused');
      window.speechSynthesis.cancel();
      if (dictTimerRef.current) clearTimeout(dictTimerRef.current);
    } else {
      setDictStatus('playing');
      if (dictStatus === 'idle') setDictCurrentIndex(0);
      playDictationItem(dictStatus === 'idle' ? 0 : dictCurrentIndex, items);
    }
  };

  const playDictationItem = (index: number, items: string[]) => {
    if (index >= items.length) {
      setDictStatus('idle');
      showToast('Dictation finished!');
      return;
    }
    setDictCurrentIndex(index);
    speak(items[index], pronRate, () => {
      if (dictTimerRef.current) clearTimeout(dictTimerRef.current);
      dictTimerRef.current = setTimeout(() => {
        playDictationItem(index + 1, items);
      }, dictInterval * 1000);
    });
  };

  // --- Word Bank Logic ---
  const saveToBank = () => {
    if (!newBankWord.word) return;
    const newWord: PronunciationWord = {
      ...newBankWord,
      id: Date.now().toString(),
      ipa: newBankWord.ipa || IPA_MOCK_MAP[newBankWord.word.toLowerCase()] || 'N/A'
    };
    const updated = [...wordBank, newWord];
    setWordBank(updated);
    localStorage.setItem('teacher_pronunciation_bank', JSON.stringify(updated));
    setNewBankWord({ word: '', ipa: '', level: 'A1', category: 'vowels', notes: '' });
    showToast('Word saved to bank!');
  };

  const removeWord = (id: string) => {
    const updated = wordBank.filter(w => w.id !== id);
    setWordBank(updated);
    localStorage.setItem('teacher_pronunciation_bank', JSON.stringify(updated));
    showToast('Word removed.');
  };

  // --- UI Helpers ---
  const renderWaveform = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 60, margin: '16px 0' }}>
      {[...Array(7)].map((_, i) => (
        <div key={i} className={`bar ${isPlaying ? 'active' : ''}`} />
      ))}
    </div>
  );

  return (
    <div style={{ background: '#fdf8f2', minHeight: '100vh', padding: '36px 40px', fontFamily: "'Inter', system-ui, sans-serif", color: '#2c1a0e' }}>
      <header style={{ marginBottom: 32, paddingBottom: 20, borderBottom: '1px solid rgba(139,115,85,0.12)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.8rem', fontWeight: 700, color: '#2c1a0e', margin: 0 }}>
          <i className="ti ti-headphones" style={{ marginRight: 12 }}></i>
          Audio & Pronunciation
        </h1>
      </header>

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 4, background: '#f5efe6', borderRadius: 12, padding: 4, marginBottom: 24, border: '1px solid rgba(139,115,85,0.12)', flexWrap: 'wrap' }}>
        {[
          { id: 'pronunciation', label: 'Pronunciation Lab', icon: 'ti-volume' },
          { id: 'minimal', label: 'Minimal Pairs', icon: 'ti-arrows-split' },
          { id: 'dictation', label: 'Dictation Mode', icon: 'ti-pencil' },
          { id: 'bank', label: 'Word Bank', icon: 'ti-book' },
          { id: 'export', label: 'Export Material', icon: 'ti-printer' },
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '8px 18px', borderRadius: 9, border: 'none',
                background: isActive ? '#fffcf8' : 'transparent',
                color: isActive ? '#2c1a0e' : '#a08060',
                fontWeight: isActive ? 600 : 400,
                fontSize: 13.5, cursor: 'pointer',
                boxShadow: isActive ? '0 1px 4px rgba(44,26,14,0.1)' : 'none',
                transition: 'all 0.15s ease',
                fontFamily: "'Inter', system-ui, sans-serif",
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <i className={`ti ${tab.icon}`}></i> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Settings Bar */}
      <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.1)', borderRadius: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.06)', padding: 28, marginBottom: 24, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 13.5, color: '#a08060', marginBottom: 8, fontWeight: 500 }}>Voice</label>
          <select 
            style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, padding: '10px 14px', color: '#2c1a0e', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5, outline: 'none', width: 200, boxSizing: 'border-box' }}
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
          >
            {voices.map(v => (
              <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13.5, color: '#a08060', marginBottom: 8, fontWeight: 500 }}>Speed</label>
          <select 
            style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, padding: '10px 14px', color: '#2c1a0e', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5, outline: 'none', width: 150, boxSizing: 'border-box' }}
            value={pronRate}
            onChange={(e) => setPronRate(Number(e.target.value))}
          >
            <option value={1}>Normal (1.0x)</option>
            <option value={0.75}>Slow (0.75x)</option>
            <option value={0.5}>Very Slow (0.5x)</option>
          </select>
        </div>
      </div>

      {/* Tab: Pronunciation */}
      {activeTab === 'pronunciation' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
          <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.1)', borderRadius: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.06)', padding: 28 }}>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.1rem', fontWeight: 600, color: '#2c1a0e', marginTop: 0, marginBottom: 16 }}>Word / Phrase Analysis</h2>
            <input 
              style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, padding: '10px 14px', color: '#2c1a0e', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5, outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: 16 }}
              placeholder="Type an English word or phrase..."
              value={pronWord}
              onChange={(e) => setPronWord(e.target.value)}
            />
            
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#8b5e3c', color: '#fffcf8', border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', boxShadow: '0 2px 8px rgba(139,94,60,0.3)', transition: 'all 0.18s ease' }} onClick={() => speak(pronWord)}>
                <i className="ti ti-player-play-filled"></i> Listen
              </button>
              <button 
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: '#f5efe6', color: '#7a5c42', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, fontSize: 13.5, fontWeight: 500, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', transition: 'all 0.15s ease' }}
                onClick={() => {
                  setNewBankWord({ ...newBankWord, word: pronWord });
                  setActiveTab('bank');
                }}
              >
                <i className="ti ti-bookmark"></i> Save
              </button>
            </div>

            {renderWaveform()}

            {pronWord && (
              <div style={{ marginTop: 24, padding: 16, backgroundColor: '#f5efe6', borderRadius: 12, border: '1px solid rgba(139,115,85,0.14)' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 13.5, color: '#a08060', fontWeight: 600 }}>Phonetic Info (Estimated)</h3>
                <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: "'Fira Code', 'Courier New', monospace", color: '#8b5e3c' }}>
                  {IPA_MOCK_MAP[pronWord.toLowerCase()] || '🔤 Search in dictionary'}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Stress Visualizer */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.1)', borderRadius: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.06)', padding: 28 }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.1rem', fontWeight: 600, color: '#2c1a0e', marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><i className="ti ti-chart-bar" style={{ color: '#8b5e3c' }}></i> Word Stress Visualizer</h2>
              {pronWord.toLowerCase() in STRESS_PATTERNS ? (
                <div style={{ textAlign: 'center', marginTop: 24 }}>
                  {STRESS_PATTERNS[pronWord.toLowerCase()].map((syl, i) => {
                    const isStressed = syl === syl.toUpperCase();
                    return (
                      <div 
                        key={i} 
                        style={{
                          display: 'inline-block', padding: '8px 16px', margin: 4, 
                          background: isStressed ? '#8b5e3c' : '#f5efe6', 
                          color: isStressed ? '#fffcf8' : '#2c1a0e',
                          fontWeight: isStressed ? 700 : 400,
                          borderRadius: 8, fontSize: '1.5rem', 
                          border: isStressed ? '1px solid #8b5e3c' : '1px solid rgba(139,115,85,0.18)', 
                          cursor: 'pointer',
                          transform: isStressed ? 'scale(1.05)' : 'none',
                          boxShadow: isStressed ? '0 2px 8px rgba(139,94,60,0.3)' : 'none'
                        }}
                        onClick={() => speak(syl.toLowerCase())}
                      >
                        {syl}
                      </div>
                    );
                  })}
                  <p style={{ color: '#a08060', fontSize: 13.5, marginTop: 16 }}>Click syllables to hear them isolated.</p>
                </div>
              ) : (
                <div style={{ color: '#a08060', textAlign: 'center', padding: '24px 0', fontSize: 14 }}>
                  Type words like "photograph", "information" or "banana" to see stress patterns.
                </div>
              )}
            </div>

            {/* Rhymes */}
            <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.1)', borderRadius: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.06)', padding: 28 }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.1rem', fontWeight: 600, color: '#2c1a0e', marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><i className="ti ti-music" style={{ color: '#8b5e3c' }}></i> Rhymes & Patterns</h2>
              {pronWord.toLowerCase() in RHYME_MOCK_MAP ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {RHYME_MOCK_MAP[pronWord.toLowerCase()].map((rhyme, i) => (
                    <span 
                      key={i}
                      onClick={() => speak(rhyme)}
                      style={{ 
                        background: '#f5efe6', border: '1px solid rgba(139,115,85,0.18)', 
                        borderRadius: 20, padding: '6px 14px', cursor: 'pointer', 
                        color: '#5c3d20', display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: 13.5
                      }}
                    >
                      {rhyme} <i className="ti ti-volume" style={{ fontSize: 14 }}></i>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#a08060', textAlign: 'center', padding: '16px 0', fontSize: 14 }}>
                  Type a simple word like "cat", "dog", "day" for rhyme suggestions.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Minimal Pairs */}
      {activeTab === 'minimal' && (
        <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.1)', borderRadius: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.06)', padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.3rem', fontWeight: 600, color: '#2c1a0e', margin: 0 }}>Minimal Pair Trainer</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', 
                  background: mpMode === 'practice' ? '#8b5e3c' : '#f5efe6', 
                  color: mpMode === 'practice' ? '#fffcf8' : '#7a5c42', 
                  border: mpMode === 'practice' ? 'none' : '1px solid rgba(139,115,85,0.18)', 
                  borderRadius: 9, fontSize: 13.5, fontWeight: mpMode === 'practice' ? 600 : 500, 
                  fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', transition: 'all 0.15s ease'
                }}
                onClick={() => setMpMode('practice')}
              >Practice</button>
              <button 
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', 
                  background: mpMode === 'quiz' ? '#8b5e3c' : '#f5efe6', 
                  color: mpMode === 'quiz' ? '#fffcf8' : '#7a5c42', 
                  border: mpMode === 'quiz' ? 'none' : '1px solid rgba(139,115,85,0.18)', 
                  borderRadius: 9, fontSize: 13.5, fontWeight: mpMode === 'quiz' ? 600 : 500, 
                  fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', transition: 'all 0.15s ease'
                }}
                onClick={() => setMpMode('quiz')}
              >Quiz</button>
            </div>
          </div>

          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 32, flexWrap: 'wrap' }}>
              <div 
                style={{ background: '#f5efe6', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 16, padding: '2rem', minWidth: 200, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                onClick={() => speak(MINIMAL_PAIRS[mpIndex].word1)}
              >
                <div style={{ fontSize: '3rem', fontWeight: 700, color: '#2c1a0e', marginBottom: 8 }}>{MINIMAL_PAIRS[mpIndex].word1}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: "'Fira Code', 'Courier New', monospace", color: '#8b5e3c' }}>{MINIMAL_PAIRS[mpIndex].ipa1}</div>
                <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: '#fffcf8', color: '#7a5c42', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, fontSize: 13.5, fontWeight: 500, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', marginTop: 24 }}>
                  <i className="ti ti-volume"></i> Hear A
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', fontSize: '1.5rem', color: '#a08060', fontWeight: 600 }}>VS</div>

              <div 
                style={{ background: '#f5efe6', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 16, padding: '2rem', minWidth: 200, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                onClick={() => speak(MINIMAL_PAIRS[mpIndex].word2)}
              >
                <div style={{ fontSize: '3rem', fontWeight: 700, color: '#2c1a0e', marginBottom: 8 }}>{MINIMAL_PAIRS[mpIndex].word2}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: "'Fira Code', 'Courier New', monospace", color: '#8b5e3c' }}>{MINIMAL_PAIRS[mpIndex].ipa2}</div>
                <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: '#fffcf8', color: '#7a5c42', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, fontSize: 13.5, fontWeight: 500, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', marginTop: 24 }}>
                  <i className="ti ti-volume"></i> Hear B
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
              <button 
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: '#f5efe6', color: '#7a5c42', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, fontSize: 13.5, fontWeight: 500, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer' }}
                onClick={() => setMpIndex(i => (i > 0 ? i - 1 : MINIMAL_PAIRS.length - 1))}
              >
                <i className="ti ti-arrow-left"></i> Previous
              </button>
              <button 
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#8b5e3c', color: '#fffcf8', border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', boxShadow: '0 2px 8px rgba(139,94,60,0.3)' }}
                onClick={() => {
                  speak(MINIMAL_PAIRS[mpIndex].word1);
                  setTimeout(() => speak(MINIMAL_PAIRS[mpIndex].word2), 1500);
                }}
              >
                <i className="ti ti-arrows-right-left"></i> Hear Both
              </button>
              <button 
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: '#f5efe6', color: '#7a5c42', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, fontSize: 13.5, fontWeight: 500, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer' }}
                onClick={() => setMpIndex(i => (i < MINIMAL_PAIRS.length - 1 ? i + 1 : 0))}
              >
                Next <i className="ti ti-arrow-right"></i>
              </button>
            </div>
            <p style={{ marginTop: 24, color: '#a08060', fontSize: 14 }}>Pair {mpIndex + 1} of {MINIMAL_PAIRS.length}</p>
          </div>
        </div>
      )}

      {/* Tab: Dictation */}
      {activeTab === 'dictation' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
          <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.1)', borderRadius: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.06)', padding: 28 }}>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.1rem', fontWeight: 600, color: '#2c1a0e', marginTop: 0, marginBottom: 8 }}>Dictation List</h2>
            <p style={{ color: '#a08060', fontSize: 13.5, marginBottom: 16 }}>Enter words or phrases, one per line.</p>
            <textarea
              style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, padding: '10px 14px', color: '#2c1a0e', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5, outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: 250, resize: 'vertical' }}
              value={dictationList}
              onChange={(e) => setDictationList(e.target.value)}
              placeholder="1. The quick brown fox...&#10;2. Jumps over the lazy dog...&#10;3. ..."
            />
          </div>

          <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.1)', borderRadius: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.06)', padding: 28 }}>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.1rem', fontWeight: 600, color: '#2c1a0e', marginTop: 0, marginBottom: 16 }}>Controls</h2>
            
            <label style={{ display: 'block', fontSize: 13.5, color: '#a08060', marginBottom: 8, fontWeight: 500 }}>
              Interval between items (seconds): {dictInterval}s
            </label>
            <input 
              type="range" 
              min="1" max="10" 
              value={dictInterval}
              onChange={(e) => setDictInterval(Number(e.target.value))}
              style={{ width: '100%', marginBottom: 32, accentColor: '#8b5e3c' }}
            />

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#8b5e3c', color: '#fffcf8', border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', boxShadow: '0 2px 8px rgba(139,94,60,0.3)' }} onClick={handleDictationToggle}>
                <i className={`ti ${dictStatus === 'playing' ? 'ti-player-pause' : 'ti-player-play-filled'}`}></i>
                {dictStatus === 'playing' ? 'Pause Dictation' : dictStatus === 'paused' ? 'Resume' : 'Start Dictation'}
              </button>
              
              <button 
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: '#f5efe6', color: '#7a5c42', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, fontSize: 13.5, fontWeight: 500, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer' }}
                onClick={() => {
                  setDictStatus('idle');
                  setDictCurrentIndex(0);
                  window.speechSynthesis.cancel();
                  if (dictTimerRef.current) clearTimeout(dictTimerRef.current);
                }}
              >
                <i className="ti ti-player-stop"></i> Stop
              </button>
            </div>

            {renderWaveform()}

            {dictStatus !== 'idle' && (
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <p style={{ color: '#a08060', fontSize: 13.5, marginBottom: 8 }}>Current Item ({dictCurrentIndex + 1} / {dictationList.split('\\n').filter(l=>l.trim()).length}):</p>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, padding: 20, backgroundColor: '#f5efe6', borderRadius: 12, border: '1px solid rgba(139,115,85,0.18)', color: '#2c1a0e' }}>
                  {dictationList.split('\\n').filter(l=>l.trim())[dictCurrentIndex]}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Word Bank */}
      {activeTab === 'bank' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
          <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.1)', borderRadius: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.06)', padding: 28 }}>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.1rem', fontWeight: 600, color: '#2c1a0e', marginTop: 0, marginBottom: 16 }}>Add to Word Bank</h2>
            <input 
              style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, padding: '10px 14px', color: '#2c1a0e', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5, outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: 12 }} 
              placeholder="Word" 
              value={newBankWord.word} 
              onChange={e => setNewBankWord({...newBankWord, word: e.target.value})} 
            />
            <input 
              style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, padding: '10px 14px', color: '#2c1a0e', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5, outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: 12 }} 
              placeholder="IPA (Optional)" 
              value={newBankWord.ipa} 
              onChange={e => setNewBankWord({...newBankWord, ipa: e.target.value})} 
            />
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <select 
                style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, padding: '10px 14px', color: '#2c1a0e', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                value={newBankWord.level}
                onChange={e => setNewBankWord({...newBankWord, level: e.target.value})}
              >
                <option value="A1">A1 Beginner</option>
                <option value="A2">A2 Elementary</option>
                <option value="B1">B1 Intermediate</option>
                <option value="B2">B2 Upper Int.</option>
                <option value="C1">C1 Advanced</option>
              </select>
              <select 
                style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, padding: '10px 14px', color: '#2c1a0e', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                value={newBankWord.category}
                onChange={e => setNewBankWord({...newBankWord, category: e.target.value})}
              >
                <option value="vowels">Vowels</option>
                <option value="consonants">Consonants</option>
                <option value="stress">Word Stress</option>
                <option value="intonation">Intonation</option>
                <option value="general">General</option>
              </select>
            </div>
            <textarea 
              style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.18)', borderRadius: 9, padding: '10px 14px', color: '#2c1a0e', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 13.5, outline: 'none', width: '100%', boxSizing: 'border-box', minHeight: 80, resize: 'vertical', marginBottom: 16 }} 
              placeholder="Notes / Example Sentence..."
              value={newBankWord.notes}
              onChange={e => setNewBankWord({...newBankWord, notes: e.target.value})}
            />
            <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#8b5e3c', color: '#fffcf8', border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', boxShadow: '0 2px 8px rgba(139,94,60,0.3)', width: '100%', justifyContent: 'center' }} onClick={saveToBank}>
              <i className="ti ti-plus"></i> Add Word
            </button>
          </div>

          <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.1)', borderRadius: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.06)', padding: 28 }}>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.1rem', fontWeight: 600, color: '#2c1a0e', marginTop: 0, marginBottom: 16 }}>Saved Words ({wordBank.length})</h2>
            <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 8 }}>
              {wordBank.length === 0 ? (
                <p style={{ color: '#a08060', fontSize: 14 }}>No words saved yet.</p>
              ) : (
                wordBank.map(w => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid rgba(139,115,85,0.1)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8, color: '#2c1a0e', marginBottom: 4 }}>
                        {w.word}
                        <button style={{ background: 'none', border: 'none', color: '#7a5c42', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 }} onClick={() => speak(w.word)}>
                          <i className="ti ti-volume" style={{ fontSize: 16 }}></i>
                        </button>
                      </div>
                      <div style={{ color: '#a08060', fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif" }}>
                        <span style={{ fontFamily: "'Fira Code', 'Courier New', monospace", color: '#8b5e3c' }}>{w.ipa}</span> • {w.level} • {w.category}
                      </div>
                    </div>
                    <button 
                      style={{ background: 'none', border: 'none', color: '#a83232', cursor: 'pointer', fontSize: 18, padding: 8, borderRadius: 4, display: 'flex', alignItems: 'center' }}
                      onClick={() => removeWord(w.id)}
                    >
                      <i className="ti ti-trash"></i>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Export */}
      {activeTab === 'export' && (
        <div style={{ background: '#fffcf8', border: '1px solid rgba(139,115,85,0.1)', borderRadius: 16, boxShadow: '0 2px 8px rgba(44,26,14,0.06)', padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }} className="no-print">
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.3rem', fontWeight: 600, color: '#2c1a0e', margin: 0 }}>Student Material Export</h2>
            <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#8b5e3c', color: '#fffcf8', border: 'none', borderRadius: 9, fontSize: 13.5, fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer', boxShadow: '0 2px 8px rgba(139,94,60,0.3)' }} onClick={() => window.print()}>
              <i className="ti ti-printer"></i> Print / Save PDF
            </button>
          </div>
          
          <div id="printable-export" style={{ backgroundColor: 'white', color: 'black', padding: '2rem', borderRadius: '8px' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem', borderBottom: '2px solid rgba(139,115,85,0.2)', paddingBottom: '1rem' }}>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", margin: 0, color: '#2c1a0e' }}>Pronunciation Practice List</h1>
              <p style={{ color: '#7a5c42', margin: '0.5rem 0 0 0', fontFamily: "'Inter', system-ui, sans-serif" }}>TeacherAI Generated Material</p>
            </div>

            {wordBank.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#a08060' }}>Add words to the Word Bank to generate a list.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 16, borderBottom: '2px solid rgba(139,115,85,0.2)', color: '#5c3d20', fontWeight: 600 }}>Word</th>
                    <th style={{ textAlign: 'left', padding: 16, borderBottom: '2px solid rgba(139,115,85,0.2)', color: '#5c3d20', fontWeight: 600 }}>Pronunciation (IPA)</th>
                    <th style={{ textAlign: 'left', padding: 16, borderBottom: '2px solid rgba(139,115,85,0.2)', color: '#5c3d20', fontWeight: 600 }}>Category</th>
                    <th style={{ textAlign: 'left', padding: 16, borderBottom: '2px solid rgba(139,115,85,0.2)', color: '#5c3d20', fontWeight: 600 }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {wordBank.map(w => (
                    <tr key={w.id}>
                      <td style={{ padding: 16, borderBottom: '1px solid rgba(139,115,85,0.1)', fontWeight: 600, color: '#2c1a0e' }}>{w.word}</td>
                      <td style={{ padding: 16, borderBottom: '1px solid rgba(139,115,85,0.1)', fontFamily: "'Fira Code', 'Courier New', monospace", fontSize: '1.1rem', color: '#8b5e3c' }}>{w.ipa}</td>
                      <td style={{ padding: 16, borderBottom: '1px solid rgba(139,115,85,0.1)', color: '#7a5c42' }}>{w.category} ({w.level})</td>
                      <td style={{ padding: 16, borderBottom: '1px solid rgba(139,115,85,0.1)', fontStyle: 'italic', color: '#7a5c42' }}>{w.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            <div style={{ marginTop: '3rem', fontSize: '0.85rem', color: '#a08060', textAlign: 'center' }}>
              Generated with TeacherAI — Practice makes perfect!
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#8b5e3c', color: '#fffcf8', padding: '1rem 2rem', borderRadius: 9, fontWeight: 600, boxShadow: '0 4px 12px rgba(44,26,14,0.15)', zIndex: 1000, animation: 'slideIn 0.3s ease-out' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
