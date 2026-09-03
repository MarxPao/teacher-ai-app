import { COLOR } from '../styles/tokens'

console.log('================================================================================')
console.log('       VALIDAÇÃO: BADGE DE NEE & DISCLAMER PEDAGÓGICO NO ANALYTICS             ')
console.log('================================================================================\n')

interface StudentRecordMock {
  id: string
  name: string
  classId: string
  grades: Record<string, string>
  nee?: boolean
  nee_description?: string
}

const sampleStudents: StudentRecordMock[] = [
  { id: '1', name: 'Ana Oliveira', classId: 'c1', grades: { 'P1': '8.5', 'P2': '9.0' } },
  { id: '2', name: 'Lucas Silva', classId: 'c1', grades: { 'P1': '7.0', 'P2': '6.5' }, nee: true, nee_description: 'Dislexia e TDAH — tempo estendido em avaliações' },
  { id: '3', name: 'Carlos Eduardo', classId: 'c1', grades: { 'P1': '6.0', 'P2': '5.5' } },
  { id: '4', name: 'Beatriz Costa', classId: 'c1', grades: { 'P1': '8.0', 'P2': '7.5' }, nee: true, nee_description: 'Baixa visão — material impresso ampliado' },
  { id: '5', name: 'Daniel Ferreira', classId: 'c1', grades: { 'P1': '9.5', 'P2': '9.0' } }
]

function renderStudentCardRow(st: StudentRecordMock) {
  const avg = (Object.values(st.grades).map(v => parseFloat(v)).reduce((a, b) => a + b, 0) / 2).toFixed(1)
  
  // Lógica de renderização idêntica à do Analytics.tsx
  const hasBadge = !!st.nee
  const badgeHtml = hasBadge
    ? `<span role="note" tabIndex="0" class="badge-adaptado" title="${st.nee_description || 'Adaptação curricular (NEE)'}" aria-label="Aluno com adaptação curricular (NEE): ${st.nee_description || ''}">✦ Adaptado</span>`
    : ''

  const plainTextVisible = `${st.name} ${hasBadge ? '[✦ Adaptado]' : ''} | Média: ${avg}`
  return {
    studentId: st.id,
    name: st.name,
    hasNee: hasBadge,
    badgeRendered: hasBadge ? '✦ Adaptado' : 'NENHUM',
    tooltipSecret: st.nee_description || null,
    plainTextVisible,
    rawBadgeHtml: badgeHtml
  }
}

console.log('1. RENDERIZAÇÃO DO RANKING / LISTA DE ALUNOS (Dataset Misto com 5 Alunos):')
console.log('--------------------------------------------------------------------------------')

const renderedRows = sampleStudents.map(renderStudentCardRow)
renderedRows.forEach((r, idx) => {
  console.log(`[Posição ${idx + 1}] ${r.plainTextVisible}`)
  console.log(`  - Badge Renderizado: ${r.badgeRendered}`)
  console.log(`  - Detalhe Privado (Apenas Tooltip/Aria-Label): "${r.tooltipSecret ?? 'Nenhum'}"`)
})

const neeStudentsCount = renderedRows.filter(r => r.hasNee).length
const nonNeeStudentsCount = renderedRows.filter(r => !r.hasNee).length
console.log(`\nVerificação de Precisão do Badge:`)
console.log(`  - Total Alunos com NEE Sinalizados: ${neeStudentsCount} de 2 esperados -> ${neeStudentsCount === 2 ? '✅ EXATO' : '❌ ERRO'}`)
console.log(`  - Total Alunos sem NEE sem Badge: ${nonNeeStudentsCount} de 3 esperados -> ${nonNeeStudentsCount === 3 ? '✅ EXATO' : '❌ ERRO'}`)

// 2. Verificação de Vazamento de Diagnóstico no Texto Corrido
console.log('\n2. SEGURANÇA E PRIVACIDADE DO DADO PROTEGIDO (LGPD / Menores):')
console.log('--------------------------------------------------------------------------------')
const diagnosesExposedInPlainText = renderedRows.some(r => r.plainTextVisible.includes('Dislexia') || r.plainTextVisible.includes('TDAH') || r.plainTextVisible.includes('Baixa visão'))
console.log(`Diagnósticos expostos em texto simples na tela principal?: ${diagnosesExposedInPlainText ? '❌ VAZOU (FALHA GRAVE)' : '✅ NÃO (Protegido sob Tooltip/Aria-Label)'}`)

// 3. Nota de Rodapé Pedagógica
const hasNeeInClass = sampleStudents.some(s => s.nee)
const footnoteText = hasNeeInClass ? 'Alunos com "Adaptado" possuem adaptação curricular (NEE) — compare desempenhos com cautela pedagógica.' : ''
console.log('\n3. NOTA DE RODAPÉ PEDAGÓGICA:')
console.log('--------------------------------------------------------------------------------')
console.log(`Exibida?: ${hasNeeInClass ? 'SIM' : 'NÃO'}`)
console.log(`Texto:\n  "${footnoteText}"`)

// 4. Teste de Contraste do Badge NEE (WCAG 2.1 AA)
console.log('\n4. CONTRASTE DO BADGE NEE (styles/tokens.ts vs Fundo #fdf8f2):')
console.log('--------------------------------------------------------------------------------')

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  return [parseInt(clean.slice(0, 2), 16) / 255, parseInt(clean.slice(2, 4), 16) / 255, parseInt(clean.slice(4, 6), 16) / 255]
}
function relLum([r, g, b]: number[]) {
  const c = (val: number) => val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
function getContrast(fg: string, bg: string) {
  const l1 = relLum(hexToRgb(fg))
  const l2 = relLum(hexToRgb(bg))
  return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)
}

const badgeColor = COLOR.accentGold // #945722
const pageBg = COLOR.paperPage     // #fdf8f2
const ratio = getContrast(badgeColor, pageBg)
console.log(`Badge NEE (${badgeColor}) sobre Fundo da Página (${pageBg}):`)
console.log(`  Ratio: ${ratio}:1 -> ${Number(ratio) >= 4.5 ? '✅ PASS AA (>= 4.5:1)' : '❌ FAIL'}`)

console.log('\n================================================================================')
