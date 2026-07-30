'use client'

import { useState, useEffect } from 'react'
import { captureImageFile, extractContentFromImage } from '@/lib/ocrCapture'

interface StudentRecord { id: string; name: string; classId: string; schoolId: string; grades?: Record<string, string> }
interface ClassRecord   { id: string; name: string }

interface QuestionGradeResult {
  num: number
  studentAnswer: string
  correctAnswer: string
  isCorrect: boolean
  points: number
}

const S: Record<string, React.CSSProperties> = {
  page:  { padding: '32px 48px', minHeight: '100%', boxSizing: 'border-box', background: '#fdf6e3' },
  card:  { background: '#fff', border: '1px solid #ede8dc', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,43,54,0.06)' },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 },
  btn:   { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  input: { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #ddd', background: '#fdf6e3', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#586e75', textTransform: 'uppercase' as const, letterSpacing: '0.8px', marginBottom: 5 },
}

export default function OmniGrader() {
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [classes,  setClasses]  = useState<ClassRecord[]>([])

  const [selectedStudent, setSelectedStudent] = useState('')
  const [examTitle,       setExamTitle]       = useState('Prova Bimestral')
  const [answerKey,       setAnswerKey]       = useState('1:A, 2:B, 3:C, 4:D, 5:A, 6:C, 7:B, 8:D, 9:A, 10:B')

  const [imageUri,    setImageUri]    = useState<string | null>(null)
  const [isGrading,   setIsGrading]   = useState(false)
  const [gradeResult, setGradeResult] = useState<{
    score: number
    totalQuestions: number
    correctCount: number
    questions: QuestionGradeResult[]
    rawText: string
  } | null>(null)

  const [launched, setLaunched] = useState(false)

  useEffect(() => {
    const st = localStorage.getItem('teacher_students')
    const cl = localStorage.getItem('teacher_classes')
    if (st) {
      const parsed = JSON.parse(st)
      setStudents(parsed)
      if (parsed.length > 0) setSelectedStudent(parsed[0].id)
    }
    if (cl) setClasses(JSON.parse(cl))
  }, [])

  /* Capturar Imagem */
  async function handleCapture() {
    try {
      const base64 = await captureImageFile()
      setImageUri(base64)
      setGradeResult(null)
      setLaunched(false)
    } catch (e) {
      alert(`Falha ao selecionar imagem: ${String(e)}`)
    }
  }

  /* Processar Correção Automática via OCR Vision AI */
  async function handleGrade() {
    if (!imageUri) { alert('Selecione ou tire a foto da prova do aluno primeiro.'); return }

    const apis = JSON.parse(localStorage.getItem('teacher_apis') || '[]')
    const activeApi = apis.find((a: { active: boolean; provider: string; key: string }) => a.active && a.key && (a.provider === 'openai' || a.provider === 'gemini'))

    if (!activeApi) {
      alert('Para correção por câmera/OCR, ative uma API com visão no menu "APIs & Modelos" (OpenAI GPT-4o ou Gemini).')
      return
    }

    setIsGrading(true)
    try {
      const ocr = await extractContentFromImage(imageUri, activeApi)
      
      // Parse answer key
      const keyPairs = answerKey.split(',').map(s => s.trim().split(':')).filter(arr => arr.length === 2)
      const parsedKey: Record<number, string> = {}
      keyPairs.forEach(([qNum, ans]) => {
        parsedKey[parseInt(qNum)] = ans.trim().toUpperCase()
      })

      const totalQ = Object.keys(parsedKey).length || 10
      const results: QuestionGradeResult[] = []
      let correct = 0

      // Match extracted answers with key
      for (let i = 1; i <= totalQ; i++) {
        const expected = parsedKey[i] || 'A'
        // Procurar resposta no OCR
        const match = ocr.rawText.match(new RegExp(`${i}\\s*[:\\-\\)]\\s*([A-Da-d])`))
        const found = match ? match[1].toUpperCase() : (i <= ocr.questions.length ? ocr.questions[i-1].answer?.toUpperCase() || '—' : '—')
        const isOk = found === expected
        if (isOk) correct++

        results.push({
          num: i,
          studentAnswer: found,
          correctAnswer: expected,
          isCorrect: isOk,
          points: isOk ? (10 / totalQ) : 0
        })
      }

      const finalScore = Number(((correct / totalQ) * 10).toFixed(1))
      setGradeResult({
        score: finalScore,
        totalQuestions: totalQ,
        correctCount: correct,
        questions: results,
        rawText: ocr.rawText
      })
    } catch (e) {
      alert(`Erro na correção automática: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsGrading(false)
    }
  }

  /* Lançar Nota no Gradebook do Aluno */
  function handleLaunchGrade() {
    if (!selectedStudent || !gradeResult) return
    const idx = students.findIndex(s => s.id === selectedStudent)
    if (idx === -1) return

    const upd = [...students]
    upd[idx].grades = { ...(upd[idx].grades || {}), [examTitle]: String(gradeResult.score) }

    setStudents(upd)
    localStorage.setItem('teacher_students', JSON.stringify(upd))

    // Atualiza gbConfig
    const gbConfig = JSON.parse(localStorage.getItem('teacher_gbConfig') || '{"cols":[]}')
    if (!gbConfig.cols.includes(examTitle)) {
      gbConfig.cols.push(examTitle)
      localStorage.setItem('teacher_gbConfig', JSON.stringify(gbConfig))
    }

    window.dispatchEvent(new Event('storage'))
    setLaunched(true)
  }

  const stuObj = students.find(s => s.id === selectedStudent)
  const clsObj = classes.find(c => c.id === stuObj?.classId)

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 600, color: '#073642', fontStyle: 'italic', margin: 0 }}>
            OmniGrader — Correção Automática por Câmera
          </h1>
          <p style={{ color: '#586e75', fontSize: 13, marginTop: 4 }}>
            Tire foto da prova do aluno e a IA corrige instantaneamente e lança a nota no Gradebook.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Painel Esquerdo: Configuração & Captura */}
        <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={S.card}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#073642', margin: '0 0 16px' }}>
              <i className="ti ti-settings" style={{ marginRight: 8, color: '#268bd2' }} />Configuração da Prova
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Aluno Avaliado</label>
                <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} style={S.input}>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({classes.find(c => c.id === s.classId)?.name || 'Sem turma'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={S.label}>Título da Avaliação</label>
                <input value={examTitle} onChange={e => setExamTitle(e.target.value)} style={S.input} placeholder="Ex: Prova 1 - Inglês B2" />
              </div>

              <div>
                <label style={S.label}>Gabarito Oficial (Questão:Resposta)</label>
                <textarea value={answerKey} onChange={e => setAnswerKey(e.target.value)}
                  style={{ ...S.input, minHeight: 60, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 } as React.CSSProperties} />
              </div>
            </div>
          </div>

          <div style={S.card}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#073642', margin: '0 0 16px' }}>
              <i className="ti ti-camera" style={{ marginRight: 8, color: '#b58900' }} />Captura da Prova
            </h3>

            {imageUri ? (
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid #ddd', marginBottom: 16 }}>
                <img src={imageUri} alt="Prova capturada" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', background: '#000' }} />
                <button onClick={handleCapture} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.7)', color: '#fff', border: 'none', borderRadius: 20, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
                  Tirar Outra Foto
                </button>
              </div>
            ) : (
              <div onClick={handleCapture} style={{ border: '2px dashed #b58900', borderRadius: 16, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: '#fdf6e3', marginBottom: 16 }}>
                <i className="ti ti-camera-plus" style={{ fontSize: 40, color: '#b58900', display: 'block', marginBottom: 8 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#073642' }}>Fotografar / Enviar Imagem da Prova</span>
                <p style={{ fontSize: 11, color: '#93a1a1', margin: '4px 0 0' }}>Disponível para câmera do celular, tablet ou upload</p>
              </div>
            )}

            <button onClick={handleGrade} disabled={!imageUri || isGrading}
              style={{ ...S.btn, width: '100%', justifyContent: 'center', background: '#073642', color: '#fff', opacity: !imageUri || isGrading ? 0.6 : 1 }}>
              {isGrading ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Processando OCR Vision...</> : <><i className="ti ti-check" /> Corrigir Prova Agora</>}
            </button>
          </div>
        </div>

        {/* Painel Direito: Resultado da Correção */}
        <div style={{ flex: 1, minWidth: 320 }}>
          {gradeResult ? (
            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: '#073642', margin: 0 }}>
                    Resultado da Correção: {stuObj?.name}
                  </h3>
                  <p style={{ fontSize: 13, color: '#586e75', margin: '2px 0 0' }}>{clsObj?.name} · {examTitle}</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'center', background: '#f5f0e8', borderRadius: 16, padding: '8px 20px' }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: gradeResult.score >= 7 ? '#2d7a00' : gradeResult.score >= 5 ? '#854d00' : '#dc322f' }}>
                      {gradeResult.score}
                    </div>
                    <div style={{ fontSize: 10, color: '#93a1a1', fontWeight: 700 }}>NOTA FINAL</div>
                  </div>

                  <button onClick={handleLaunchGrade} disabled={launched}
                    style={{ ...S.btn, background: launched ? '#859900' : '#268bd2', color: '#fff' }}>
                    <i className={`ti ${launched ? 'ti-check' : 'ti-report-analytics'}`} />
                    {launched ? 'Nota Lançada no Gradebook!' : 'Lançar Nota no Gradebook'}
                  </button>
                </div>
              </div>

              {/* Detalhamento das Questões */}
              <div style={{ fontSize: 12, fontWeight: 700, color: '#586e75', textTransform: 'uppercase', marginBottom: 12 }}>
                Detalhamento ({gradeResult.correctCount} de {gradeResult.totalQuestions} acertos)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 20 }}>
                {gradeResult.questions.map(q => (
                  <div key={q.num} style={{
                    padding: '10px 14px', borderRadius: 12, border: `1px solid ${q.isCorrect ? '#2d7a00' : '#dc322f'}`,
                    background: q.isCorrect ? '#f0fdf4' : '#fef2f2', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#073642' }}>Q{q.num}</span>
                      <div style={{ fontSize: 11, color: '#586e75', marginTop: 2 }}>
                        Resp: <b>{q.studentAnswer}</b> | Gab: <b>{q.correctAnswer}</b>
                      </div>
                    </div>
                    <i className={`ti ${q.isCorrect ? 'ti-check text-sol-green' : 'ti-x text-sol-red'}`} style={{ fontSize: 20 }} />
                  </div>
                ))}
              </div>

              {/* Texto Extraído pelo OCR */}
              {gradeResult.rawText && (
                <div style={{ background: '#f5f0e8', borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#93a1a1', marginBottom: 6 }}>TEXTO EXTRAÍDO DA IMAGEM</div>
                  <p style={{ fontSize: 12, color: '#586e75', margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
                    {gradeResult.rawText}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...S.card, textAlign: 'center', padding: '80px 40px', color: '#93a1a1' }}>
              <i className="ti ti-camera" style={{ fontSize: 56, color: '#ddd', display: 'block', marginBottom: 12 }} />
              <p style={{ fontSize: 14, margin: 0 }}>Fotografe a prova do aluno ao lado e clique em "Corrigir Prova Agora" para visualizar os acertos e lançar a nota automaticamente.</p>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
