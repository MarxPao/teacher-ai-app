'use client';

import React, { useState, useEffect, useRef, CSSProperties } from 'react';

// --- Interfaces & Types ---

interface Flashcard {
  id: string;
  front: string;
  back: string;
  category: string;
  level: string;
  tags: string[];
  performance: number; // 0 = New/Unknown, 1 = Hard, 2 = Good, 3 = Easy
  lastReviewed?: number;
}

interface FlashcardDeck {
  id: string;
  name: string;
  description: string;
  cards: Flashcard[];
  createdAt: number;
}

interface Student {
  id: string;
  name: string;
  classId?: string;
}

type ViewMode = 'list' | 'deck_details' | 'study' | 'game' | 'matching';

// --- Theme Colors ---
const paperTheme = {
  bg: '#fdf8f2',
  cardMain: '#fffcf8',
  cardSub: '#f5efe6',
  textMain: '#2c1a0e',
  textWarm: '#7a5c42',
  textMuted: '#a08060',
  label: '#c4a882',
  accent: '#8b5e3c',
  accentHover: '#b5805a',
  borderSoft: 'rgba(139,115,85,0.1)',
  borderMed: 'rgba(139,115,85,0.14)',
  borderHard: 'rgba(139,115,85,0.18)',
  success: '#3d7a4e',
  successBg: 'rgba(61,122,78,0.1)',
  warning: '#c87a1e',
  warningBg: 'rgba(200,122,30,0.1)',
  danger: '#a83232',
  dangerBg: 'rgba(168,50,50,0.1)',
  projectorBg: '#1c110a'
};

// --- Main Component ---

export default function FlashcardMode() {
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [view, setView] = useState<ViewMode>('list');
  const [currentDeck, setCurrentDeck] = useState<FlashcardDeck | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load Data
  useEffect(() => {
    const savedDecks = localStorage.getItem('teacher_flashcards');
    if (savedDecks) {
      try {
        setDecks(JSON.parse(savedDecks));
      } catch (e) {
        console.error("Failed to parse decks", e);
      }
    }
    
    const savedStudents = localStorage.getItem('teacher_students');
    if (savedStudents) {
      try {
        setStudents(JSON.parse(savedStudents));
      } catch (e) {
        console.error("Failed to parse students", e);
      }
    }
  }, []);

  // Save Decks
  useEffect(() => {
    if (decks.length > 0) {
      localStorage.setItem('teacher_flashcards', JSON.stringify(decks));
    }
  }, [decks]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const updateDeck = (updatedDeck: FlashcardDeck) => {
    setDecks(decks.map(d => d.id === updatedDeck.id ? updatedDeck : d));
    if (currentDeck?.id === updatedDeck.id) {
      setCurrentDeck(updatedDeck);
    }
  };

  const deleteDeck = (deckId: string) => {
    if(confirm('Delete this deck?')) {
        setDecks(decks.filter(d => d.id !== deckId));
        showToast('Deck deleted');
    }
  };

  // --- Views ---

  return (
    <div style={{
      backgroundColor: paperTheme.bg,
      color: paperTheme.textMain,
      minHeight: '100vh',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      padding: '36px 40px',
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingBottom: '20px', borderBottom: `1px solid ${paperTheme.borderSoft}` }}>
        <div>
          <h1 style={{ margin: '0', fontSize: '1.8rem', fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, color: paperTheme.textMain }}>
            <i className="ti ti-cards" style={{ marginRight: '12px', color: paperTheme.accent }}></i>
            Flashcards Live
          </h1>
          <p style={{ margin: '6px 0 0 0', color: paperTheme.textMuted, fontSize: '14px' }}>Create, study, and play vocabulary games.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {view !== 'list' && (
            <button onClick={() => { setView('list'); setCurrentDeck(null); }} style={btnStyle('secondary')}>
              <i className="ti ti-arrow-left"></i> Back to Decks
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {view === 'list' && (
          <DeckListView 
            decks={decks} 
            setDecks={setDecks} 
            onOpenDeck={(d: FlashcardDeck) => { setCurrentDeck(d); setView('deck_details'); }} 
            onDelete={deleteDeck}
            showToast={showToast} 
          />
        )}
        {view === 'deck_details' && currentDeck && (
          <DeckDetailsView 
            deck={currentDeck} 
            updateDeck={updateDeck} 
            onStudy={() => setView('study')} 
            onGame={() => setView('game')} 
            onMatching={() => setView('matching')}
            showToast={showToast} 
          />
        )}
        {view === 'study' && currentDeck && (
          <StudyMode 
            deck={currentDeck} 
            updateDeck={updateDeck} 
            onComplete={() => setView('deck_details')} 
          />
        )}
        {view === 'game' && currentDeck && (
          <GameMode 
            deck={currentDeck} 
            students={students} 
            onExit={() => setView('deck_details')} 
          />
        )}
        {view === 'matching' && currentDeck && (
          <MatchingMode 
            deck={currentDeck} 
            onExit={() => setView('deck_details')} 
          />
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px',
          backgroundColor: paperTheme.accent, color: paperTheme.cardMain,
          padding: '12px 24px', borderRadius: '8px',
          boxShadow: `0 4px 12px ${paperTheme.borderSoft}`,
          zIndex: 1000,
          fontFamily: "'Inter', system-ui, sans-serif",
          animation: 'fadeIn 0.3s ease-out',
          display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500
        }}>
          <i className="ti ti-check"></i>
          {toastMessage}
        </div>
      )}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes flipIn { from { transform: rotateY(180deg); opacity: 0; } to { transform: rotateY(0deg); opacity: 1; } }
      `}</style>
    </div>
  );
}

// --- Sub-Components ---

function DeckListView({ decks, setDecks, onOpenDeck, onDelete, showToast }: any) {
  const [newDeckName, setNewDeckName] = useState('');

  const handleCreate = () => {
    if (!newDeckName.trim()) return;
    const newDeck: FlashcardDeck = {
      id: Date.now().toString(),
      name: newDeckName,
      description: 'New flashcard deck',
      cards: [],
      createdAt: Date.now()
    };
    setDecks([...decks, newDeck]);
    setNewDeckName('');
    showToast('Deck created successfully!');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result as string);
          if (Array.isArray(imported)) {
             setDecks([...decks, ...imported.map(d => ({...d, id: Date.now().toString() + Math.random()}))]);
             showToast('Decks imported!');
          }
        } catch(err) {
          showToast('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(decks));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "teacher_flashcards_export.json");
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="New Deck Name..." 
          value={newDeckName} 
          onChange={e => setNewDeckName(e.target.value)}
          style={{ ...inputStyle, width: '250px' }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button onClick={handleCreate} style={btnStyle('primary')}>
          <i className="ti ti-plus"></i> Create Deck
        </button>
        <div style={{ flex: 1 }}></div>
        <label style={btnStyle('secondary')}>
           <i className="ti ti-upload"></i> Import JSON
           <input type="file" accept=".json" style={{display:'none'}} onChange={handleImport} />
        </label>
        <button onClick={handleExport} style={btnStyle('secondary')}>
          <i className="ti ti-download"></i> Export JSON
        </button>
      </div>

      {decks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px', color: paperTheme.textMuted, backgroundColor: paperTheme.cardMain, borderRadius: '16px', border: `1px solid ${paperTheme.borderSoft}`, boxShadow: `0 2px 8px rgba(44,26,14,0.06)` }}>
          <i className="ti ti-box" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5, color: paperTheme.label }}></i>
          <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", color: paperTheme.textMain }}>No decks found</h3>
          <p>Create your first deck above to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {decks.map((deck: FlashcardDeck) => (
            <div key={deck.id} style={{
              backgroundColor: paperTheme.cardSub, borderRadius: '10px', padding: '20px',
              border: `1px solid ${paperTheme.borderMed}`, display: 'flex', flexDirection: 'column',
              transition: 'transform 0.2s', cursor: 'pointer'
            }}
            onClick={() => onOpenDeck(deck)}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                 <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontFamily: "'Playfair Display', Georgia, serif", color: paperTheme.textMain }}>{deck.name}</h3>
                 <button onClick={(e) => { e.stopPropagation(); onDelete(deck.id); }} style={{ background: 'none', border: 'none', color: paperTheme.danger, cursor: 'pointer', padding: '4px' }}>
                    <i className="ti ti-trash"></i>
                 </button>
              </div>
              <p style={{ margin: '0 0 16px 0', color: paperTheme.textWarm, fontSize: '14px', flex: 1 }}>{deck.description}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${paperTheme.borderSoft}`, paddingTop: '16px' }}>
                <span style={{ fontSize: '13px', color: paperTheme.accent, fontWeight: 600 }}>{deck.cards.length} cards</span>
                <span style={{ fontSize: '12px', color: paperTheme.textMuted }}>{new Date(deck.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeckDetailsView({ deck, updateDeck, onStudy, onGame, onMatching, showToast }: any) {
  const [quickAddText, setQuickAddText] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleQuickAdd = () => {
    if (!quickAddText.trim()) return;
    const pairs = quickAddText.split(';').map(p => p.trim()).filter(p => p);
    const newCards = pairs.map(pair => {
      const [front, back] = pair.split('-').map(s => s.trim());
      return {
        id: Date.now().toString() + Math.random(),
        front: front || 'Empty',
        back: back || 'Empty',
        category: 'Vocabulary',
        level: 'B1',
        tags: [],
        performance: 0
      };
    });
    
    updateDeck({ ...deck, cards: [...deck.cards, ...newCards] });
    setQuickAddText('');
    showToast(`${newCards.length} cards added!`);
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Gere 5 flashcards de inglês para o tema: "${aiPrompt}". Retorne apenas um array JSON de objetos com front (EN), back (PT ou exemplo), category, level.`
        })
      });
      
      const text = await response.text();
      // Basic JSON extraction
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
         const parsed = JSON.parse(match[0]);
         const newCards = parsed.map((c: any) => ({
             id: Date.now().toString() + Math.random(),
             front: c.front || '',
             back: c.back || '',
             category: c.category || 'Vocabulary',
             level: c.level || 'B1',
             tags: [],
             performance: 0
         }));
         updateDeck({ ...deck, cards: [...deck.cards, ...newCards] });
         showToast(`${newCards.length} AI cards generated!`);
         setAiPrompt('');
      } else {
        showToast('AI response invalid.');
      }
    } catch(e) {
      showToast('Error generating via AI');
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const removeCard = (cardId: string) => {
      if(confirm('Remove this card?')) {
          updateDeck({...deck, cards: deck.cards.filter((c:any) => c.id !== cardId)});
      }
  };

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      {/* Sidebar Controls */}
      <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ backgroundColor: paperTheme.cardMain, padding: '28px', borderRadius: '16px', border: `1px solid ${paperTheme.borderSoft}`, boxShadow: `0 2px 8px rgba(44,26,14,0.06)` }}>
           <h2 style={{ margin: '0 0 20px 0', fontSize: '22px', fontFamily: "'Playfair Display', Georgia, serif" }}>{deck.name}</h2>
           
           <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: paperTheme.cardSub, borderRadius: '12px', padding: '8px', border: `1px solid ${paperTheme.borderMed}` }}>
             <button onClick={onStudy} disabled={deck.cards.length === 0} style={{ ...btnStyle('secondary'), background: paperTheme.cardMain, border: 'none', boxShadow: '0 1px 4px rgba(44,26,14,0.1)', fontWeight: 600, color: paperTheme.textMain, justifyContent: 'flex-start' }}><i className="ti ti-book" style={{ color: paperTheme.accent }}></i> Study Mode</button>
             <button onClick={onGame} disabled={deck.cards.length === 0} style={{ ...btnStyle('secondary'), border: 'none', justifyContent: 'flex-start' }}><i className="ti ti-device-desktop"></i> Live Game (Projector)</button>
             <button onClick={onMatching} disabled={deck.cards.length < 4} style={{ ...btnStyle('secondary'), border: 'none', justifyContent: 'flex-start' }}><i className="ti ti-components"></i> Matching Game</button>
           </div>
        </div>

        <div style={{ backgroundColor: paperTheme.cardSub, padding: '20px', borderRadius: '12px', border: `1px solid ${paperTheme.borderMed}` }}>
           <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.4px', color: paperTheme.label, marginBottom: '8px' }}>QUICK ADD</div>
           <p style={{ fontSize: '12px', color: paperTheme.textWarm, margin: '0 0 12px 0' }}>Format: Word - Translation ; Word - Translation</p>
           <textarea 
             value={quickAddText} 
             onChange={e => setQuickAddText(e.target.value)}
             style={{ ...inputStyle, width: '100%', height: '80px', marginBottom: '12px', resize: 'vertical' }}
             placeholder="apple - maçã; house - casa"
           />
           <button onClick={handleQuickAdd} style={{...btnStyle('secondary'), width: '100%'}}><i className="ti ti-plus"></i> Add Cards</button>
        </div>

        <div style={{ backgroundColor: paperTheme.cardSub, padding: '20px', borderRadius: '12px', border: `1px solid ${paperTheme.borderMed}` }}>
           <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.4px', color: paperTheme.label, marginBottom: '12px', display: 'flex', alignItems:'center', gap:'8px' }}>
               <i className="ti ti-sparkles" style={{ color: paperTheme.accent, fontSize: '14px' }}></i> AI GENERATOR
           </div>
           <input 
             type="text" 
             value={aiPrompt} 
             onChange={e => setAiPrompt(e.target.value)}
             style={{ ...inputStyle, width: '100%', marginBottom: '12px' }}
             placeholder="E.g. Travel Phrasal Verbs"
           />
           <button onClick={handleAIGenerate} disabled={isGenerating} style={{...btnStyle('primary'), width: '100%'}}>
              {isGenerating ? 'Generating...' : 'Generate with AI'}
           </button>
        </div>
      </div>

      {/* Cards List */}
      <div style={{ flex: 1, backgroundColor: paperTheme.cardMain, padding: '28px', borderRadius: '16px', border: `1px solid ${paperTheme.borderSoft}`, boxShadow: `0 2px 8px rgba(44,26,14,0.06)` }}>
         <h3 style={{ margin: '0 0 20px 0', fontSize: '20px', fontFamily: "'Playfair Display', Georgia, serif" }}>Cards ({deck.cards.length})</h3>
         {deck.cards.length === 0 ? (
             <p style={{ color: paperTheme.textMuted }}>No cards yet. Add some from the sidebar.</p>
         ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '8px' }}>
                 {deck.cards.map((card: Flashcard, index: number) => (
                     <div key={card.id} style={{ display: 'flex', backgroundColor: paperTheme.cardSub, padding: '16px', borderRadius: '12px', border: `1px solid ${paperTheme.borderMed}`, alignItems: 'center' }}>
                         <div style={{ width: '40px', color: paperTheme.label, fontSize: '14px' }}>#{index + 1}</div>
                         <div style={{ flex: 1, fontWeight: 'bold', fontSize: '16px', color: paperTheme.textMain }}>{card.front}</div>
                         <div style={{ flex: 1, color: paperTheme.textWarm }}>{card.back}</div>
                         <div style={{ width: '120px', display: 'flex', gap: '8px' }}>
                             <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px', backgroundColor: 'rgba(139,94,60,0.1)', color: paperTheme.accent }}>{card.category}</span>
                         </div>
                         <button onClick={() => removeCard(card.id)} style={{ background: 'none', border: 'none', color: paperTheme.textMuted, cursor: 'pointer', padding: '8px' }}>
                             <i className="ti ti-x"></i>
                         </button>
                     </div>
                 ))}
             </div>
         )}
      </div>
    </div>
  );
}

// --- Study Mode ---

function StudyMode({ deck, updateDeck, onComplete }: any) {
  // Sort cards: those with lower performance first
  const [queue, setQueue] = useState<Flashcard[]>(() => {
     return [...deck.cards].sort((a, b) => (a.performance || 0) - (b.performance || 0));
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionStats, setSessionStats] = useState({ seen: 0, known: 0 });

  const currentCard = queue[currentIndex];

  const handleRate = (rating: number) => {
      const updatedCard = { ...currentCard, performance: rating, lastReviewed: Date.now() };
      // Update deck
      const newDeckCards = deck.cards.map((c: any) => c.id === updatedCard.id ? updatedCard : c);
      updateDeck({ ...deck, cards: newDeckCards });
      
      setSessionStats(s => ({ seen: s.seen + 1, known: s.known + (rating >= 2 ? 1 : 0) }));

      setIsFlipped(false);
      setTimeout(() => {
          if (currentIndex < queue.length - 1) {
              setCurrentIndex(currentIndex + 1);
          } else {
              // End of queue
              alert(`Session complete! You knew ${sessionStats.known + (rating >= 2 ? 1 : 0)} out of ${sessionStats.seen + 1}.`);
              onComplete();
          }
      }, 300);
  };

  if (!currentCard) return null;

  const progressPercent = ((currentIndex + 1) / queue.length) * 100;

  return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div style={{ marginBottom: '24px', width: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: paperTheme.textMuted, fontSize: '13px', marginBottom: '8px' }}>
              <span>Card {currentIndex + 1} of {queue.length}</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(139,115,85,0.12)', borderRadius: '3px', overflow: 'hidden' }}>
               <div style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: paperTheme.accent, transition: 'width 0.3s ease' }}></div>
            </div>
          </div>
          
          <Flashcard3D 
            front={currentCard.front} 
            back={currentCard.back} 
            isFlipped={isFlipped} 
            onClick={() => setIsFlipped(!isFlipped)} 
            category={currentCard.category}
          />

          <div style={{ marginTop: '40px', display: 'flex', gap: '16px', height: '60px' }}>
              {isFlipped ? (
                  <>
                      <button onClick={() => handleRate(1)} style={{ ...btnStyle('danger'), width: '130px', fontSize: '14px', borderRadius: '9px' }}><i className="ti ti-x"></i> Não sei</button>
                      <button onClick={() => handleRate(2)} style={{ ...btnStyle('warning'), width: '130px', fontSize: '14px', borderRadius: '9px' }}><i className="ti ti-minus"></i> Quase</button>
                      <button onClick={() => handleRate(3)} style={{ ...btnStyle('success'), width: '130px', fontSize: '14px', borderRadius: '9px' }}><i className="ti ti-check"></i> Sei</button>
                  </>
              ) : (
                  <button onClick={() => setIsFlipped(true)} style={{ ...btnStyle('primary'), width: '220px', fontSize: '14.5px', padding: '12px 24px', borderRadius: '9px' }}>Show Answer</button>
              )}
          </div>
          <button onClick={onComplete} style={{ marginTop: '40px', background: 'none', border: 'none', color: paperTheme.textMuted, cursor: 'pointer', fontFamily: "'Inter', system-ui, sans-serif", fontSize: '14px' }}>Exit Study Mode</button>
      </div>
  );
}

// --- Live Game Mode (Projector) ---

function GameMode({ deck, students, onExit }: any) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [scores, setScores] = useState<Record<string, number>>({});
    const [timeLeft, setTimeLeft] = useState(15);
    const [timerActive, setTimerActive] = useState(false);

    const cards = deck.cards;
    const currentCard = cards[currentIndex];

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') { e.preventDefault(); setIsFlipped(f => !f); }
            if (e.code === 'ArrowRight') { nextCard(); }
            if (e.code === 'ArrowLeft') { prevCard(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex]);

    // Timer
    useEffect(() => {
        let int: any;
        if (timerActive && timeLeft > 0) {
            int = setInterval(() => setTimeLeft(t => t - 1), 1000);
        } else if (timeLeft === 0) {
            setTimerActive(false);
        }
        return () => clearInterval(int);
    }, [timerActive, timeLeft]);

    const nextCard = () => {
        setIsFlipped(false);
        setTimerActive(false);
        setTimeLeft(15);
        if (currentIndex < cards.length - 1) setCurrentIndex(c => c + 1);
    };

    const prevCard = () => {
        setIsFlipped(false);
        setTimerActive(false);
        setTimeLeft(15);
        if (currentIndex > 0) setCurrentIndex(c => c - 1);
    };

    const pickRandomStudent = () => {
        if (students.length === 0) return;
        const random = students[Math.floor(Math.random() * students.length)];
        setSelectedStudent(random);
        setTimerActive(true);
        setTimeLeft(15);
    };

    const addScore = (points: number) => {
        if (!selectedStudent) return;
        setScores(prev => ({
            ...prev,
            [selectedStudent.id]: (prev[selectedStudent.id] || 0) + points
        }));
        setTimerActive(false);
    };

    if (!currentCard) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: paperTheme.projectorBg, color: paperTheme.cardMain, zIndex: 9999, display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif" }}>
            {/* Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '24px', backgroundColor: 'rgba(0,0,0,0.3)', borderBottom: `1px solid rgba(196,168,130,0.15)` }}>
                <button onClick={onExit} style={{ ...btnStyle('secondary'), color: paperTheme.cardMain, border: `1px solid rgba(196,168,130,0.3)` }}><i className="ti ti-x"></i> Close Projector</button>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: paperTheme.label, fontFamily: "'Playfair Display', Georgia, serif" }}>{currentIndex + 1} / {cards.length}</div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <button onClick={prevCard} disabled={currentIndex === 0} style={{ ...btnStyle('secondary'), color: paperTheme.cardMain, border: `1px solid rgba(196,168,130,0.3)` }}><i className="ti ti-arrow-left"></i> Prev</button>
                    <button onClick={nextCard} disabled={currentIndex === cards.length - 1} style={{ ...btnStyle('secondary'), color: paperTheme.cardMain, border: `1px solid rgba(196,168,130,0.3)` }}>Next <i className="ti ti-arrow-right"></i></button>
                </div>
            </div>

            {/* Main Stage */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <div style={{ transform: 'scale(1.5)' }}>
                    <Flashcard3D 
                        front={currentCard.front} 
                        back={currentCard.back} 
                        isFlipped={isFlipped} 
                        onClick={() => setIsFlipped(!isFlipped)} 
                        category={currentCard.category}
                    />
                </div>
                
                {/* Timer Overlay */}
                {timerActive && (
                    <div style={{ position: 'absolute', top: '40px', right: '40px', width: '100px', height: '100px', borderRadius: '50%', border: `8px solid ${timeLeft <= 5 ? paperTheme.danger : paperTheme.label}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 'bold', color: timeLeft <= 5 ? paperTheme.danger : paperTheme.cardMain }}>
                        {timeLeft}
                    </div>
                )}
            </div>

            {/* Bottom Bar: Student Controls */}
            <div style={{ height: '120px', backgroundColor: 'rgba(28,17,10,0.8)', borderTop: `1px solid rgba(196,168,130,0.15)`, display: 'flex', alignItems: 'center', padding: '0 40px', gap: '40px' }}>
                <button onClick={pickRandomStudent} style={{ ...btnStyle('primary'), fontSize: '18px', padding: '16px 32px' }}>
                    <i className="ti ti-dice"></i> Pick Student
                </button>
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '24px' }}>
                    {selectedStudent ? (
                        <>
                            <div style={{ fontSize: '32px', fontWeight: 'bold', color: paperTheme.label, fontFamily: "'Playfair Display', Georgia, serif" }}>
                                🎯 {selectedStudent.name}
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button onClick={() => addScore(1)} style={btnStyle('success')}><i className="ti ti-check"></i> Correct (+1)</button>
                                <button onClick={() => addScore(0)} style={btnStyle('danger')}><i className="ti ti-x"></i> Incorrect (0)</button>
                            </div>
                        </>
                    ) : (
                        <div style={{ color: paperTheme.textMuted, fontSize: '18px', fontStyle: 'italic' }}>
                            Click "Pick Student" to select randomly...
                        </div>
                    )}
                </div>

                {/* Mini Scoreboard */}
                <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', maxWidth: '400px' }}>
                    {Object.entries(scores).map(([id, score]) => {
                        const student = students.find((s:any) => s.id === id);
                        if(!student) return null;
                        return (
                            <div key={id} style={{ backgroundColor: 'rgba(255,252,248,0.05)', padding: '8px 16px', borderRadius: '8px', border: `1px solid rgba(196,168,130,0.2)`, whiteSpace: 'nowrap', color: paperTheme.cardMain }}>
                                <strong>{student.name}</strong>: {score}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// --- Matching Game Mode ---

function MatchingMode({ deck, onExit }: any) {
    const [items, setItems] = useState<any[]>([]);
    const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
    const [matchedIds, setMatchedIds] = useState<string[]>([]);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [timeElapsed, setTimeElapsed] = useState(0);

    // Initialize Game
    useEffect(() => {
        // Pick up to 8 random cards
        const shuffledCards = [...deck.cards].sort(() => 0.5 - Math.random()).slice(0, 8);
        const gameItems: any[] = [];
        
        shuffledCards.forEach((c: any) => {
            gameItems.push({ id: c.id, text: c.front, type: 'front' });
            gameItems.push({ id: c.id, text: c.back, type: 'back' });
        });
        
        setItems(gameItems.sort(() => 0.5 - Math.random()));
        setStartTime(Date.now());
    }, [deck]);

    // Timer
    useEffect(() => {
        if (startTime && matchedIds.length < (items.length / 2)) {
            const int = setInterval(() => {
                setTimeElapsed(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
            return () => clearInterval(int);
        }
    }, [startTime, matchedIds, items.length]);

    const handleItemClick = (index: number) => {
        if (selectedIndexes.includes(index) || matchedIds.includes(items[index].id)) return;
        if (selectedIndexes.length === 2) return;

        const newSelection = [...selectedIndexes, index];
        setSelectedIndexes(newSelection);

        if (newSelection.length === 2) {
            const item1 = items[newSelection[0]];
            const item2 = items[newSelection[1]];
            
            if (item1.id === item2.id) {
                // Match
                setTimeout(() => {
                    setMatchedIds([...matchedIds, item1.id]);
                    setSelectedIndexes([]);
                }, 500);
            } else {
                // No match
                setTimeout(() => {
                    setSelectedIndexes([]);
                }, 1000);
            }
        }
    };

    const isComplete = items.length > 0 && matchedIds.length === items.length / 2;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', width: '800px', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", color: paperTheme.textMain, fontSize: '28px' }}>Matching Game</h2>
                <div style={{ fontSize: '20px', fontFamily: "'Fira Code', 'Courier New', monospace", color: paperTheme.accent, fontWeight: 600 }}>⏱ {timeElapsed}s</div>
                <button onClick={onExit} style={btnStyle('secondary')}>Exit</button>
            </div>

            {isComplete ? (
                <div style={{ textAlign: 'center', backgroundColor: paperTheme.cardMain, padding: '48px', borderRadius: '16px', border: `1px solid ${paperTheme.borderSoft}`, boxShadow: `0 4px 16px ${paperTheme.borderSoft}` }}>
                    <h1 style={{ color: paperTheme.success, fontSize: '48px', margin: '0 0 16px 0', fontFamily: "'Playfair Display', Georgia, serif" }}>🎉 You Won!</h1>
                    <p style={{ fontSize: '20px', color: paperTheme.textMain }}>Time: <strong style={{ color: paperTheme.accent }}>{timeElapsed}</strong> seconds</p>
                    <button onClick={onExit} style={{ ...btnStyle('primary'), marginTop: '24px', fontSize: '16px', padding: '12px 24px' }}>Back to Deck</button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', width: '800px' }}>
                    {items.map((item, index) => {
                        const isSelected = selectedIndexes.includes(index);
                        const isMatched = matchedIds.includes(item.id);
                        
                        let bgColor = paperTheme.cardSub;
                        let borderColor = paperTheme.borderMed;
                        let textColor = paperTheme.textMain;
                        
                        if (isSelected) {
                            bgColor = paperTheme.cardMain;
                            borderColor = paperTheme.accent;
                        } else if (isMatched) {
                            bgColor = paperTheme.successBg;
                            borderColor = paperTheme.success;
                            textColor = paperTheme.success;
                        } else if (selectedIndexes.length === 2 && !isMatched && isSelected) {
                            bgColor = paperTheme.dangerBg;
                            borderColor = paperTheme.danger;
                            textColor = paperTheme.danger;
                        }

                        return (
                            <div 
                                key={index}
                                onClick={() => handleItemClick(index)}
                                style={{
                                    height: '100px',
                                    backgroundColor: bgColor,
                                    border: `2px solid ${borderColor}`,
                                    borderRadius: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '16px',
                                    textAlign: 'center',
                                    fontSize: '16px',
                                    fontWeight: 600,
                                    color: textColor,
                                    cursor: isMatched ? 'default' : 'pointer',
                                    opacity: isMatched ? 0.6 : 1,
                                    transition: 'all 0.2s ease',
                                    transform: isSelected && !isMatched ? 'scale(1.05)' : 'scale(1)',
                                    userSelect: 'none',
                                    boxShadow: isSelected && !isMatched ? '0 4px 12px rgba(44,26,14,0.1)' : 'none'
                                }}
                            >
                                {item.text}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// --- Generic 3D Flashcard Component ---

function Flashcard3D({ front, back, isFlipped, onClick, category }: any) {
    return (
        <div 
            onClick={onClick}
            style={{
                width: '400px',
                height: '260px',
                perspective: '1000px',
                cursor: 'pointer'
            }}
        >
            <div style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                transition: 'transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1)',
                transformStyle: 'preserve-3d',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
            }}>
                {/* Front */}
                <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backfaceVisibility: 'hidden',
                    backgroundColor: paperTheme.cardMain,
                    borderRadius: '20px',
                    boxShadow: '0 8px 32px rgba(44,26,14,0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '32px',
                    boxSizing: 'border-box'
                }}>
                    <div style={{ position: 'absolute', top: '24px', fontSize: '13px', color: paperTheme.textMuted, fontWeight: 600, letterSpacing: '0.5px' }}>
                        {category}
                    </div>
                    <h2 style={{ margin: 0, fontSize: '42px', textAlign: 'center', fontFamily: "'Playfair Display', Georgia, serif", color: paperTheme.textMain }}>{front}</h2>
                    <p style={{ position: 'absolute', bottom: '24px', color: paperTheme.textMuted, fontSize: '12px' }}>Click to flip or press Space</p>
                </div>

                {/* Back */}
                <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backfaceVisibility: 'hidden',
                    backgroundColor: paperTheme.accent,
                    borderRadius: '20px',
                    boxShadow: '0 8px 32px rgba(44,26,14,0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '32px',
                    boxSizing: 'border-box',
                    transform: 'rotateY(180deg)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '32px', textAlign: 'center', color: paperTheme.cardMain, fontWeight: 600 }}>{back}</h2>
                </div>
            </div>
        </div>
    );
}

// --- Styles Helpers ---

const inputStyle: CSSProperties = {
    backgroundColor: paperTheme.cardMain,
    border: `1px solid ${paperTheme.borderHard}`,
    color: paperTheme.textMain,
    padding: '10px 14px',
    borderRadius: '9px',
    fontSize: '13.5px',
    fontFamily: "'Inter', system-ui, sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s ease'
};

const btnStyle = (variant: 'primary'|'secondary'|'danger'|'success'|'warning'|'accent'): CSSProperties => {
    let bg = paperTheme.accent;
    let color = paperTheme.cardMain;
    let border = 'none';
    let boxShadow = '0 2px 8px rgba(139,94,60,0.3)';
    
    if (variant === 'secondary') { bg = paperTheme.cardSub; color = paperTheme.textWarm; border = `1px solid ${paperTheme.borderHard}`; boxShadow = 'none'; }
    if (variant === 'danger') { bg = paperTheme.danger; boxShadow = '0 2px 8px rgba(168,50,50,0.3)'; }
    if (variant === 'success') { bg = paperTheme.success; boxShadow = '0 2px 8px rgba(61,122,78,0.3)'; }
    if (variant === 'warning') { bg = paperTheme.warning; boxShadow = '0 2px 8px rgba(200,122,30,0.3)'; }
    if (variant === 'accent') { bg = paperTheme.accent; color = paperTheme.cardMain; } // redundant but clear

    return {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: variant === 'secondary' ? '9px 18px' : '10px 20px',
        backgroundColor: bg,
        color: color,
        border: border,
        borderRadius: '9px',
        fontSize: '13.5px',
        fontWeight: variant === 'secondary' ? 500 : 600,
        fontFamily: "'Inter', system-ui, sans-serif",
        cursor: 'pointer',
        boxShadow: boxShadow,
        transition: 'all 0.18s ease',
        justifyContent: 'center'
    };
};
