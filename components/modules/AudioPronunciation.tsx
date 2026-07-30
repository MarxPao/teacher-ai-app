'use client';

import React, { useState, useEffect, useRef, CSSProperties } from 'react';

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

// --- Styles ---
const theme = {
  bg: '#0f1117',
  card: '#1a1d2e',
  primary: '#00f2fe',
  secondary: '#4facfe',
  accent: '#ff0844',
  text: '#ffffff',
  textMuted: '#94a3b8',
  border: '#2a2f4c',
};

const styles: Record<string, CSSProperties> = {
  container: {
    backgroundColor: theme.bg,
    color: theme.text,
    minHeight: '100vh',
    padding: '2rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '2rem',
    borderBottom: `1px solid ${theme.border}`,
    paddingBottom: '1rem',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  nav: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '2rem',
    flexWrap: 'wrap',
  },
  navButton: {
    backgroundColor: theme.card,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  navButtonActive: {
    backgroundColor: '#2a3152',
    borderColor: theme.primary,
    boxShadow: `0 0 10px rgba(0, 242, 254, 0.2)`,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: '12px',
    padding: '1.5rem',
    border: `1px solid ${theme.border}`,
    marginBottom: '1.5rem',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  },
  input: {
    backgroundColor: '#0f1117',
    border: `1px solid ${theme.border}`,
    color: theme.text,
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    width: '100%',
    fontSize: '1rem',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '1rem',
  },
  select: {
    backgroundColor: '#0f1117',
    border: `1px solid ${theme.border}`,
    color: theme.text,
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    fontSize: '1rem',
    outline: 'none',
    width: '100%',
    marginBottom: '1rem',
  },
  button: {
    background: `linear-gradient(135deg, ${theme.secondary}, ${theme.primary})`,
    color: '#000',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '1rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'transform 0.1s, opacity 0.2s',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    color: theme.primary,
    border: `1px solid ${theme.primary}`,
    padding: '0.75rem 1.5rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '1rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1.5rem',
  },
  toast: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    backgroundColor: theme.primary,
    color: '#000',
    padding: '1rem 2rem',
    borderRadius: '8px',
    fontWeight: 'bold',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: 1000,
    animation: 'slideIn 0.3s ease-out',
  },
  waveformContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    height: '60px',
    margin: '1rem 0',
  },
  sylBlock: {
    display: 'inline-block',
    padding: '0.5rem 1rem',
    margin: '0.2rem',
    backgroundColor: '#2a3152',
    borderRadius: '8px',
    fontSize: '1.5rem',
    border: `1px solid ${theme.border}`,
    cursor: 'pointer',
  },
  sylStressed: {
    backgroundColor: '#ff0844',
    borderColor: '#ff0844',
    fontWeight: 'bold',
    transform: 'scale(1.1)',
    boxShadow: '0 0 15px rgba(255, 8, 68, 0.4)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '1rem',
  },
  th: {
    textAlign: 'left',
    padding: '1rem',
    borderBottom: `2px solid ${theme.border}`,
    color: theme.textMuted,
  },
  td: {
    padding: '1rem',
    borderBottom: `1px solid ${theme.border}`,
  }
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
      .bar { width: 6px; background-color: ${theme.primary}; border-radius: 3px; }
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
    const items = dictationList.split('\n').filter(l => l.trim().length > 0);
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
    <div style={styles.waveformContainer}>
      {[...Array(7)].map((_, i) => (
        <div key={i} className={`bar ${isPlaying ? 'active' : ''}`} />
      ))}
    </div>
  );

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>
          <i className="ti ti-headphones" style={{ fontSize: '2.5rem' }}></i>
          Audio & Pronunciation
        </h1>
      </header>

      {/* Navigation */}
      <div style={styles.nav}>
        {[
          { id: 'pronunciation', label: 'Pronunciation Lab', icon: 'ti-volume' },
          { id: 'minimal', label: 'Minimal Pairs', icon: 'ti-arrows-split' },
          { id: 'dictation', label: 'Dictation Mode', icon: 'ti-pencil' },
          { id: 'bank', label: 'Word Bank', icon: 'ti-book' },
          { id: 'export', label: 'Export Material', icon: 'ti-printer' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              ...styles.navButton,
              ...(activeTab === tab.id ? styles.navButtonActive : {})
            }}
          >
            <i className={`ti ${tab.icon}`}></i> {tab.label}
          </button>
        ))}
      </div>

      {/* Settings Bar */}
      <div style={{ ...styles.card, display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: theme.textMuted, marginBottom: '0.5rem' }}>Voice</label>
          <select 
            style={{ ...styles.select, width: '200px', marginBottom: 0 }}
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
          >
            {voices.map(v => (
              <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', color: theme.textMuted, marginBottom: '0.5rem' }}>Speed</label>
          <select 
            style={{ ...styles.select, width: '150px', marginBottom: 0 }}
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
        <div style={styles.grid}>
          <div style={styles.card}>
            <h2 style={{ marginTop: 0, color: theme.primary }}>Word / Phrase Analysis</h2>
            <input 
              style={styles.input} 
              placeholder="Type an English word or phrase..."
              value={pronWord}
              onChange={(e) => setPronWord(e.target.value)}
            />
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button style={styles.button} onClick={() => speak(pronWord)}>
                <i className="ti ti-player-play-filled"></i> Listen
              </button>
              <button 
                style={styles.buttonSecondary}
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
              <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#0b0d14', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: theme.textMuted }}>Phonetic Info (Estimated)</h3>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', fontFamily: 'monospace', color: theme.secondary }}>
                  {IPA_MOCK_MAP[pronWord.toLowerCase()] || '🔤 Search in dictionary'}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Stress Visualizer */}
            <div style={styles.card}>
              <h3 style={{ marginTop: 0 }}><i className="ti ti-chart-bar"></i> Word Stress Visualizer</h3>
              {pronWord.toLowerCase() in STRESS_PATTERNS ? (
                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                  {STRESS_PATTERNS[pronWord.toLowerCase()].map((syl, i) => {
                    const isStressed = syl === syl.toUpperCase();
                    return (
                      <div 
                        key={i} 
                        style={{ ...styles.sylBlock, ...(isStressed ? styles.sylStressed : {}) }}
                        onClick={() => speak(syl.toLowerCase())}
                      >
                        {syl}
                      </div>
                    );
                  })}
                  <p style={{ color: theme.textMuted, fontSize: '0.85rem', marginTop: '1rem' }}>Click syllables to hear them isolated.</p>
                </div>
              ) : (
                <div style={{ color: theme.textMuted, textAlign: 'center', padding: '2rem 0' }}>
                  Type words like "photograph", "information" or "banana" to see stress patterns.
                </div>
              )}
            </div>

            {/* Rhymes */}
            <div style={styles.card}>
              <h3 style={{ marginTop: 0 }}><i className="ti ti-music"></i> Rhymes & Patterns</h3>
              {pronWord.toLowerCase() in RHYME_MOCK_MAP ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {RHYME_MOCK_MAP[pronWord.toLowerCase()].map((rhyme, i) => (
                    <span 
                      key={i}
                      onClick={() => speak(rhyme)}
                      style={{ 
                        padding: '0.5rem 1rem', 
                        backgroundColor: '#2a3152', 
                        borderRadius: '20px',
                        cursor: 'pointer',
                        border: `1px solid ${theme.border}`
                      }}
                    >
                      {rhyme} <i className="ti ti-volume" style={{ fontSize: '0.8rem', marginLeft: '4px' }}></i>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ color: theme.textMuted, textAlign: 'center', padding: '1rem 0' }}>
                  Type a simple word like "cat", "dog", "day" for rhyme suggestions.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Minimal Pairs */}
      {activeTab === 'minimal' && (
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ margin: 0, color: theme.primary }}>Minimal Pair Trainer</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                style={mpMode === 'practice' ? styles.button : styles.buttonSecondary}
                onClick={() => setMpMode('practice')}
              >Practice</button>
              <button 
                style={mpMode === 'quiz' ? styles.button : styles.buttonSecondary}
                onClick={() => setMpMode('quiz')}
              >Quiz</button>
            </div>
          </div>

          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '2rem' }}>
              <div 
                style={{ padding: '2rem', backgroundColor: '#0b0d14', borderRadius: '12px', minWidth: '200px', cursor: 'pointer', border: `2px solid ${theme.border}` }}
                onClick={() => speak(MINIMAL_PAIRS[mpIndex].word1)}
              >
                <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{MINIMAL_PAIRS[mpIndex].word1}</div>
                <div style={{ color: theme.secondary, fontSize: '1.2rem', marginTop: '0.5rem' }}>{MINIMAL_PAIRS[mpIndex].ipa1}</div>
                <button style={{ ...styles.buttonSecondary, marginTop: '1rem', padding: '0.5rem 1rem' }}>
                  <i className="ti ti-volume"></i> Hear A
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', fontSize: '2rem', color: theme.textMuted }}>VS</div>

              <div 
                style={{ padding: '2rem', backgroundColor: '#0b0d14', borderRadius: '12px', minWidth: '200px', cursor: 'pointer', border: `2px solid ${theme.border}` }}
                onClick={() => speak(MINIMAL_PAIRS[mpIndex].word2)}
              >
                <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{MINIMAL_PAIRS[mpIndex].word2}</div>
                <div style={{ color: theme.accent, fontSize: '1.2rem', marginTop: '0.5rem' }}>{MINIMAL_PAIRS[mpIndex].ipa2}</div>
                <button style={{ ...styles.buttonSecondary, marginTop: '1rem', padding: '0.5rem 1rem' }}>
                  <i className="ti ti-volume"></i> Hear B
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button 
                style={styles.buttonSecondary} 
                onClick={() => setMpIndex(i => (i > 0 ? i - 1 : MINIMAL_PAIRS.length - 1))}
              >
                <i className="ti ti-arrow-left"></i> Previous
              </button>
              <button 
                style={styles.button} 
                onClick={() => {
                  speak(MINIMAL_PAIRS[mpIndex].word1);
                  setTimeout(() => speak(MINIMAL_PAIRS[mpIndex].word2), 1500);
                }}
              >
                <i className="ti ti-arrows-right-left"></i> Hear Both
              </button>
              <button 
                style={styles.buttonSecondary} 
                onClick={() => setMpIndex(i => (i < MINIMAL_PAIRS.length - 1 ? i + 1 : 0))}
              >
                Next <i className="ti ti-arrow-right"></i>
              </button>
            </div>
            <p style={{ marginTop: '2rem', color: theme.textMuted }}>Pair {mpIndex + 1} of {MINIMAL_PAIRS.length}</p>
          </div>
        </div>
      )}

      {/* Tab: Dictation */}
      {activeTab === 'dictation' && (
        <div style={styles.grid}>
          <div style={styles.card}>
            <h2 style={{ marginTop: 0, color: theme.primary }}>Dictation List</h2>
            <p style={{ color: theme.textMuted, fontSize: '0.9rem' }}>Enter words or phrases, one per line.</p>
            <textarea
              style={{ ...styles.input, minHeight: '250px', resize: 'vertical' }}
              value={dictationList}
              onChange={(e) => setDictationList(e.target.value)}
              placeholder="1. The quick brown fox...&#10;2. Jumps over the lazy dog...&#10;3. ..."
            />
          </div>

          <div style={styles.card}>
            <h2 style={{ marginTop: 0, color: theme.primary }}>Controls</h2>
            
            <label style={{ display: 'block', fontSize: '0.9rem', color: theme.textMuted, marginBottom: '0.5rem' }}>
              Interval between items (seconds): {dictInterval}s
            </label>
            <input 
              type="range" 
              min="1" max="10" 
              value={dictInterval}
              onChange={(e) => setDictInterval(Number(e.target.value))}
              style={{ width: '100%', marginBottom: '2rem' }}
            />

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button style={styles.button} onClick={handleDictationToggle}>
                <i className={`ti ${dictStatus === 'playing' ? 'ti-player-pause' : 'ti-player-play-filled'}`}></i>
                {dictStatus === 'playing' ? 'Pause Dictation' : dictStatus === 'paused' ? 'Resume' : 'Start Dictation'}
              </button>
              
              <button 
                style={styles.buttonSecondary}
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
              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <p style={{ color: theme.textMuted }}>Current Item ({dictCurrentIndex + 1} / {dictationList.split('\n').filter(l=>l.trim()).length}):</p>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', padding: '1rem', backgroundColor: '#0b0d14', borderRadius: '8px', border: `1px solid ${theme.primary}` }}>
                  {dictationList.split('\n').filter(l=>l.trim())[dictCurrentIndex]}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Word Bank */}
      {activeTab === 'bank' && (
        <div style={styles.grid}>
          <div style={styles.card}>
            <h2 style={{ marginTop: 0, color: theme.primary }}>Add to Word Bank</h2>
            <input 
              style={styles.input} 
              placeholder="Word" 
              value={newBankWord.word} 
              onChange={e => setNewBankWord({...newBankWord, word: e.target.value})} 
            />
            <input 
              style={styles.input} 
              placeholder="IPA (Optional)" 
              value={newBankWord.ipa} 
              onChange={e => setNewBankWord({...newBankWord, ipa: e.target.value})} 
            />
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <select 
                style={styles.select}
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
                style={styles.select}
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
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }} 
              placeholder="Notes / Example Sentence..."
              value={newBankWord.notes}
              onChange={e => setNewBankWord({...newBankWord, notes: e.target.value})}
            />
            <button style={{ ...styles.button, width: '100%', justifyContent: 'center' }} onClick={saveToBank}>
              <i className="ti ti-plus"></i> Add Word
            </button>
          </div>

          <div style={styles.card}>
            <h2 style={{ marginTop: 0, color: theme.primary }}>Saved Words ({wordBank.length})</h2>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {wordBank.length === 0 ? (
                <p style={{ color: theme.textMuted }}>No words saved yet.</p>
              ) : (
                wordBank.map(w => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: `1px solid ${theme.border}` }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {w.word}
                        <button style={{ background: 'none', border: 'none', color: theme.secondary, cursor: 'pointer' }} onClick={() => speak(w.word)}>
                          <i className="ti ti-volume"></i>
                        </button>
                      </div>
                      <div style={{ color: theme.textMuted, fontSize: '0.9rem' }}>
                        {w.ipa} • {w.level} • {w.category}
                      </div>
                    </div>
                    <button 
                      style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '1.2rem' }}
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
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }} className="no-print">
            <h2 style={{ margin: 0, color: theme.primary }}>Student Material Export</h2>
            <button style={styles.button} onClick={() => window.print()}>
              <i className="ti ti-printer"></i> Print / Save PDF
            </button>
          </div>
          
          <div id="printable-export" style={{ backgroundColor: 'white', color: 'black', padding: '2rem', borderRadius: '8px' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem', borderBottom: '2px solid #ccc', paddingBottom: '1rem' }}>
              <h1 style={{ margin: 0, color: '#333' }}>Pronunciation Practice List</h1>
              <p style={{ color: '#666', margin: '0.5rem 0 0 0' }}>TeacherAI Generated Material</p>
            </div>

            {wordBank.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666' }}>Add words to the Word Bank to generate a list.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, color: '#333' }}>Word</th>
                    <th style={{ ...styles.th, color: '#333' }}>Pronunciation (IPA)</th>
                    <th style={{ ...styles.th, color: '#333' }}>Category</th>
                    <th style={{ ...styles.th, color: '#333' }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {wordBank.map(w => (
                    <tr key={w.id}>
                      <td style={{ ...styles.td, fontWeight: 'bold' }}>{w.word}</td>
                      <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: '1.1rem' }}>{w.ipa}</td>
                      <td style={{ ...styles.td }}>{w.category} ({w.level})</td>
                      <td style={{ ...styles.td, fontStyle: 'italic', color: '#555' }}>{w.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            <div style={{ marginTop: '3rem', fontSize: '0.8rem', color: '#999', textAlign: 'center' }}>
              Generated with TeacherAI — Practice makes perfect!
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div style={styles.toast}>
          {toast}
        </div>
      )}
    </div>
  );
}
