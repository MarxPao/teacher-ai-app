console.log('================================================================================')
console.log('    VALIDAÇÃO DO GUARD DE OUTLIER: BLOQUEIO + CONFIRMAÇÃO EXPLÍCITA            ')
console.log('================================================================================\n')

interface StudentMock {
  id: string
  name: string
  grades: Record<string, string>
}

// Simulador da lógica exata implementada em Gradebook.tsx (updateGrade)
async function simulateUpdateGrade(
  currentStudents: StudentMock[],
  sid: string,
  col: string,
  typedVal: string,
  userChoice: 'accept_suggestion' | 'reject_suggestion'
): Promise<{ updatedStudents: StudentMock[]; actionResult: string; savedGrade: string | null }> {
  let cleanVal = typedVal.trim()
  let actionResult = ''
  let savedGrade: string | null = null

  if (cleanVal !== '') {
    const parsedNum = parseFloat(cleanVal.replace(',', '.'))
    if (!isNaN(parsedNum)) {
      if (parsedNum < 0 || parsedNum > 10) {
        if (parsedNum > 10 && parsedNum <= 100 && !cleanVal.includes('.') && !cleanVal.includes(',')) {
          const autoFixed = (parsedNum / 10).toFixed(1)
          const promptMessage = `Você digitou "${cleanVal}" — isso está fora da escala de 0.0 a 10.0. Você quis dizer "${autoFixed}"?`
          
          if (userChoice === 'accept_suggestion') {
            actionResult = `[BLOQUEIO] Diálogo exibido: "${promptMessage}" -> Professor escolheu [Sim, usar ${autoFixed}]`
            cleanVal = autoFixed
          } else {
            actionResult = `[BLOQUEIO] Diálogo exibido: "${promptMessage}" -> Professor escolheu [Não, quero redigitar]`
            return { updatedStudents: currentStudents, actionResult, savedGrade: null }
          }
        } else {
          actionResult = `[BLOQUEIO DIRETO] Nota inválida (${cleanVal}). O valor deve ser entre 0.0 e 10.0.`
          return { updatedStudents: currentStudents, actionResult, savedGrade: null }
        }
      }
    }
  }

  const updated = currentStudents.map(s => {
    if (s.id === sid) {
      savedGrade = cleanVal
      return { ...s, grades: { ...s.grades, [col]: cleanVal } }
    }
    return s
  })

  return { updatedStudents: updated, actionResult: actionResult || `Nota "${cleanVal}" gravada diretamente.`, savedGrade }
}

function calcClassAverage(students: StudentMock[], col: string): number {
  const vals = students.map(s => parseFloat(s.grades[col] || '')).filter(n => !isNaN(n))
  return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0
}

async function runTests() {
  const initialStudents: StudentMock[] = [
    { id: '1', name: 'Aluno 1', grades: { 'P1': '8.0' } },
    { id: '2', name: 'Aluno 2', grades: { 'P1': '7.0' } },
    { id: '3', name: 'Aluno 3', grades: { 'P1': '6.0' } },
    { id: '4', name: 'Aluno 4', grades: { 'P1': '9.0' } },
    { id: '5', name: 'Aluno 5 (Alvo)', grades: {} } // Sem nota ainda
  ]

  const initialAvg = calcClassAverage(initialStudents, 'P1')
  console.log(`Estado Inicial da Turma (4 alunos com notas [8.0, 7.0, 6.0, 9.0]): Média = ${initialAvg}`)

  // ─── Teste 1 & 2: Digitação de "85" com Rejeição do Professor ─────────────────
  console.log('\n--- TESTE 1: Digitação de "85" com REJEIÇÃO do Professor ("Não, quero redigitar") ---')
  const resReject = await simulateUpdateGrade(initialStudents, '5', 'P1', '85', 'reject_suggestion')
  const avgAfterReject = calcClassAverage(resReject.updatedStudents, 'P1')
  console.log('Ação:', resReject.actionResult)
  console.log('Nota Gravada no Aluno 5:', resReject.savedGrade ?? '(NENHUMA - Estado anterior preservado)')
  console.log(`Média da Turma após Rejeição: ${avgAfterReject} (Esperado: ${initialAvg} - NUNCA corrompeu a média) -> ${avgAfterReject === initialAvg ? '✅ PASSOU (Média Blindada)' : '❌ FALHA'}`)

  // ─── Teste 3: Digitação de "85" com Confirmação Positiva do Professor ────────
  console.log('\n--- TESTE 2: Digitação de "85" com CONFIRMAÇÃO Positiva ("Sim, usar 8.5") ---')
  const resAccept = await simulateUpdateGrade(initialStudents, '5', 'P1', '85', 'accept_suggestion')
  const avgAfterAccept = calcClassAverage(resAccept.updatedStudents, 'P1')
  const expectedAvgAccept = Number(((8.0 + 7.0 + 6.0 + 9.0 + 8.5) / 5).toFixed(2)) // 38.5 / 5 = 7.70
  console.log('Ação:', resAccept.actionResult)
  console.log('Nota Gravada no Aluno 5:', resAccept.savedGrade)
  console.log(`Média da Turma após Confirmação: ${avgAfterAccept} (Esperado: ${expectedAvgAccept}) -> ${avgAfterAccept === expectedAvgAccept ? '✅ PASSOU (Média Exata)' : '❌ FALHA'}`)

  // ─── Teste 4: Nota Negativa "-8" e Valor Absurdo "999" ───────────────────────
  console.log('\n--- TESTE 3: Digitação de Nota Negativa "-8" e Valor Absurdo "999" ---')
  const resNegative = await simulateUpdateGrade(initialStudents, '5', 'P1', '-8', 'reject_suggestion')
  console.log('Tentativa com "-8":', resNegative.actionResult)
  console.log('Nota Gravada:', resNegative.savedGrade ?? '(REJEITADA - Bloqueio imediato)')

  const resAbsurd = await simulateUpdateGrade(initialStudents, '5', 'P1', '999', 'reject_suggestion')
  console.log('Tentativa com "999":', resAbsurd.actionResult)
  console.log('Nota Gravada:', resAbsurd.savedGrade ?? '(REJEITADA - Bloqueio imediato)')
  console.log(`Blindagem contra valores negativos e absurdos: ${resNegative.savedGrade === null && resAbsurd.savedGrade === null ? '✅ PASSOU' : '❌ FALHA'}`)

  console.log('\n================================================================================')
}

runTests()
