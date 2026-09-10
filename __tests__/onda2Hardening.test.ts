import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Protocolo Enterprise Onda 2 — Hardening & Security Audit', () => {
  const rootDir = path.resolve(__dirname, '..')

  // 1. QuestionBank.tsx Security & Direct API Elimination
  it('1. QuestionBank.tsx: Não deve conter chamadas diretas externas nem anthropic-dangerously-allow-browser', () => {
    const filePath = path.join(rootDir, 'components', 'modules', 'QuestionBank.tsx')
    const content = fs.readFileSync(filePath, 'utf8')

    expect(content).not.toContain('api.anthropic.com')
    expect(content).not.toContain('anthropic-dangerously-allow-browser')
    expect(content).not.toContain('api.openai.com')
    expect(content).not.toContain('generativelanguage.googleapis.com')
    expect(content).toContain('/api/agent')
    expect(content).not.toContain('localStorage.getItem')
    expect(content).not.toContain('localStorage.setItem')
  })

  // 2. ocrCapture.ts (OmniGrader) Security & Direct API Elimination
  it('2. lib/ocrCapture.ts: OCR deve rotear exclusivamente via /api/agent seguro no backend', () => {
    const filePath = path.join(rootDir, 'lib', 'ocrCapture.ts')
    const content = fs.readFileSync(filePath, 'utf8')

    expect(content).not.toContain('api.openai.com/v1/chat/completions')
    expect(content).not.toContain('generativelanguage.googleapis.com')
    expect(content).toContain('/api/agent')
  })

  // 3. OmniGrader.tsx Security & Psychometrics
  it('3. OmniGrader.tsx: Não deve acessar localStorage diretamente e deve usar safeGet/safeSet', () => {
    const filePath = path.join(rootDir, 'components', 'modules', 'OmniGrader.tsx')
    const content = fs.readFileSync(filePath, 'utf8')

    expect(content).not.toContain('localStorage.getItem')
    expect(content).not.toContain('localStorage.setItem')
    expect(content).toContain('safeGet')
    expect(content).toContain('safeSet')
  })

  // 4. QuickGenerate.tsx: Toast Semantics & Subject Decoupling
  it('4. QuickGenerate.tsx: Desacoplado de matéria fixa e sem toasts invertidos', () => {
    const filePath = path.join(rootDir, 'components', 'modules', 'QuickGenerate.tsx')
    const content = fs.readFileSync(filePath, 'utf8')

    expect(content).not.toContain("toast.success('Gere um exercício primeiro.')")
    expect(content).toContain("toast.warning('Gere um exercício primeiro.')")
    expect(content).not.toContain("subject: 'Inglês'")
    expect(content).toContain('getSubjectProfile')
    expect(content).not.toContain('localStorage.getItem')
    expect(content).not.toContain('localStorage.setItem')
  })

  // 5. Students.tsx: Zero-Mock & Roster Safe Storage
  it('5. Students.tsx: Sem arrays simulados e persistência 100% via safeGet/safeSet', () => {
    const filePath = path.join(rootDir, 'components', 'modules', 'Students.tsx')
    const content = fs.readFileSync(filePath, 'utf8')

    expect(content).not.toContain('mockScraped')
    expect(content).not.toContain('localStorage.getItem')
    expect(content).not.toContain('localStorage.setItem')
    expect(content).toContain('safeGet')
    expect(content).toContain('safeSet')
  })

  // 6. PrivateTutoring.tsx: Desacoplamento Curricular & Storage
  it('6. PrivateTutoring.tsx: Sem injeção de livros fixos em inglês e persistência segura', () => {
    const filePath = path.join(rootDir, 'components', 'modules', 'PrivateTutoring.tsx')
    const content = fs.readFileSync(filePath, 'utf8')

    expect(content).not.toContain("'English File'")
    expect(content).not.toContain("'Grammar in Use'")
    expect(content).not.toContain('localStorage.getItem')
    expect(content).not.toContain('localStorage.setItem')
    expect(content).toContain('safeGet')
    expect(content).toContain('safeSet')
  })

  // 7. Classes.tsx: Acessibilidade & Desacoplamento
  it('7. Classes.tsx: Modal acessível com role=dialog, disciplina dinâmica e persistência segura', () => {
    const filePath = path.join(rootDir, 'components', 'modules', 'Classes.tsx')
    const content = fs.readFileSync(filePath, 'utf8')

    expect(content).toContain('role="dialog"')
    expect(content).toContain('useModalA11y')
    expect(content).toContain('getSubjectProfile')
    expect(content).not.toContain('localStorage.getItem')
    expect(content).not.toContain('localStorage.setItem')
  })
})
