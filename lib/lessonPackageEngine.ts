/**
 * lessonPackageEngine.ts — Motor do Pacote de Aula em 1 Clique (Lesson Studio + Worksheets + Comms)
 * 
 * Reúne em um único pacote persistido:
 * 1. Plano de Aula (Roteiro, Perguntas Essenciais, Evidências de Avaliação, BNCC)
 * 2. 5 Exercícios Rápidos (conectados estritamente ao vocabulário e objetivo real da aula)
 * 3. Comunicado Rascunho para os Pais (resumo afetuoso do conteúdo + orientações para estudo em casa)
 * 
 * DIRETIVA DE SEGURANÇA NÃO NEGOCIÁVEL:
 * O comunicado para os pais é gerado ESTRITAMENTE em status 'draft' (rascunho).
 * O sistema NUNCA efetua envios automáticos por WhatsApp ou e-mail sem a revisão
 * e o clique manual explícito da professora.
 */

export interface PackageQuestionItem {
  id: string
  number: number
  stem: string
  options?: string[]
  answerKey: string
  difficulty?: 'Fácil' | 'Médio' | 'Desafio'
  pedagogicalObjective?: string
  targetSkill?: string
}

export interface PackageWorksheet {
  title: string
  targetLevel: string
  summary: string
  questions: PackageQuestionItem[]
}

export interface PackageParentCommunication {
  title: string
  studentOrClassRef: string
  draftMessage: string
  tone: 'acolhedor' | 'formal' | 'direto'
  status: 'draft' // NUNCA 'sent' automaticamente
  safeNotice: string
  generatedAt: number
}

export interface LessonPackage {
  id: string
  createdAt: string
  topic: string
  className: string
  gradeYear: string
  methodologyId: string
  methodologyName: string
  plan: {
    topic: string
    durationMinutes: number
    guidingQuestions: string[]
    assessmentEvidence: string
    designRationale?: string
    stages: Array<{
      name: string
      durationMin: number
      teacherAction: string
      studentAction: string
      targetBnccCode?: string
      stageRationale?: string
    }>
    homework?: string
  }
  worksheet: PackageWorksheet
  parentCommunication: PackageParentCommunication
}

/**
 * Constrói o prompt para gerar 5 exercícios rápidos vinculados estritamente
 * ao vocabulário, estruturas e objetivos reais do plano de aula recém-gerado.
 */
export function buildPackageQuestionsPrompt(params: {
  topic: string
  className: string
  gradeYear: string
  stages: Array<{ name: string; teacherAction: string; studentAction: string; targetBnccCode?: string }>
  assessmentEvidence: string
  activeProfileName: string
  systemPrompt?: string
}): string {
  const stagesSummary = params.stages.map((s, i) => 
    `- Etapa ${i + 1} (${s.name}): Professor: "${s.teacherAction.slice(0, 90)}..." | Aluno: "${s.studentAction.slice(0, 90)}..."`
  ).join('\n')

  return `${params.systemPrompt || 'Você é um coordenador pedagógico sênior especialista em avaliação.'}
Gere uma lista de 5 QUESTÕES RÁPIDAS (Warm-up / Exit Ticket / Prática) ESTRITAMENTE CONECTADAS ao plano de aula recém-planejado.

DADOS DO PLANO DE AULA:
- Disciplina: ${params.activeProfileName}
- Turma: ${params.className} (${params.gradeYear})
- Tópico Real: "${params.topic}"
- Evidência Avaliativa Alvo: "${params.assessmentEvidence}"
- Conteúdo das Etapas da Aula:
${stagesSummary}

REGRAS DE CONTEÚDO:
1. As 5 questões DEVEM cobrar exatamente o vocabulário, as estruturas e os conceitos praticados nessas etapas.
2. Formato: 3 questões de Múltipla Escolha (A, B, C, D) e 2 questões de Preenchimento de Lacunas ou Resposta Curta.
3. Gradue os níveis: Questões 1 e 2 (Fácil), Questões 3 e 4 (Médio), Questão 5 (Desafio).
4. No gabarito comentado (answerKey), justifique pedagogicamente por que a resposta é correta.

Retorne ESTRITAMENTE um objeto JSON no formato:
{
  "title": "5 Questões de Consolidação: ${params.topic}",
  "summary": "Resumo pedagógico do que estas 5 questões avaliam",
  "questions": [
    {
      "number": 1,
      "difficulty": "Fácil",
      "stem": "Enunciado da questão 1",
      "options": ["A) Opção 1", "B) Opção 2", "C) Opção 3", "D) Opção 4"],
      "answerKey": "A) Explicação pedagógica",
      "pedagogicalObjective": "Checar domínio inicial de..."
    }
  ]
}`
}

/**
 * Constrói o prompt para redigir o comunicado afetuoso para as famílias dos alunos,
 * resumindo os objetivos da aula e fornecendo orientações práticas para apoio em casa.
 */
export function buildPackageParentCommsPrompt(params: {
  topic: string
  className: string
  gradeYear: string
  assessmentEvidence: string
  homework?: string
  tone?: 'acolhedor' | 'formal' | 'direto'
  activeProfileName: string
}): string {
  const tone = params.tone || 'acolhedor'
  return `Atue como a Rafinha, assistente pedagógica de ${params.activeProfileName}.
Redija um COMUNICADO AOS PAIS E FAMILIARES em tom ${tone} sobre a aula de "${params.topic}".

DADOS DA AULA:
- Turma: ${params.className} (${params.gradeYear})
- Tópico Trabalhado: "${params.topic}"
- O que os alunos conquistaram: "${params.assessmentEvidence}"
- Atividade de Casa / Extensão: "${params.homework || 'Revisão das anotações no caderno'}"

ESTRUTURA DA MENSAGEM:
1. Saudação carinhosa e próxima às famílias (ideal para WhatsApp).
2. Resumo acolhedor e sem jargões do que as crianças aprenderam e vivenciaram na aula de hoje.
3. Dica simples e divertida de como a família pode apoiar ou perguntar sobre o tema em casa.
4. Lembrete afetuoso sobre a tarefa de casa.
5. Fechamento caloroso da professora.

Retorne ESTRITAMENTE um objeto JSON no formato:
{
  "title": "Comunicado aos Pais — ${params.topic}",
  "draftMessage": "Texto completo e caloroso do comunicado formatado com quebras de linha e emojis amigáveis para WhatsApp",
  "tone": "${tone}"
}`
}

/**
 * Salva o pacote de aula no LocalStorage e atualiza os prefills cruzados
 * para sincronização transparente entre LessonStudio, QuickGenerate e ParentCommunicator.
 */
export function saveLessonPackage(pkg: LessonPackage): void {
  if (typeof window === 'undefined') return

  try {
    // 1. Gravação do Pacote Individual
    const packageKey = `lesson_package_${pkg.id}`
    localStorage.setItem(packageKey, JSON.stringify(pkg))

    // 2. Registro no Índice Central de Pacotes
    const indexRaw = localStorage.getItem('teacher_lesson_packages') || '[]'
    let index: Array<{ id: string; topic: string; className: string; createdAt: string }> = []
    try {
      index = JSON.parse(indexRaw)
    } catch {}
    index = index.filter(item => item.id !== pkg.id)
    index.unshift({
      id: pkg.id,
      topic: pkg.topic,
      className: pkg.className,
      createdAt: pkg.createdAt
    })
    localStorage.setItem('teacher_lesson_packages', JSON.stringify(index))

    // 3. Ponte com QuickGenerate / TestAndWorksheets
    localStorage.setItem('teacher_quick_prefill', JSON.stringify({
      packageId: pkg.id,
      topic: pkg.topic,
      level: pkg.gradeYear,
      questions: pkg.worksheet.questions,
      summary: pkg.worksheet.summary,
      generatedAt: Date.now()
    }))

    // 4. Ponte com ParentCommunicator (Status estritamente 'draft' — RASCUNHO SEGURO)
    localStorage.setItem('teacher_parent_comms_prefill', JSON.stringify({
      packageId: pkg.id,
      topic: pkg.topic,
      className: pkg.className,
      studentName: pkg.className,
      draftMessage: pkg.parentCommunication.draftMessage,
      tone: pkg.parentCommunication.tone,
      status: 'draft',
      generatedAt: Date.now()
    }))

    // 5. Pacote Ativo no Contexto Global
    localStorage.setItem('teacher_active_package', JSON.stringify(pkg))

    // 6. Notifica outros módulos via eventos de Storage
    window.dispatchEvent(new CustomEvent('teacher:quick_prefill', { detail: pkg.worksheet }))
    window.dispatchEvent(new CustomEvent('teacher:parent_comms_prefill', { detail: pkg.parentCommunication }))
    window.dispatchEvent(new Event('storage'))
  } catch (err) {
    console.warn('[LessonPackageEngine] Falha ao persistir pacote:', err)
  }
}

/**
 * Recupera um pacote de aula específico pelo ID
 */
export function getLessonPackage(id: string): LessonPackage | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`lesson_package_${id}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Recupera o último pacote de aula ativo
 */
export function getActiveLessonPackage(): LessonPackage | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('teacher_active_package')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Lista todos os pacotes salvos no sistema
 */
export function getAllLessonPackages(): LessonPackage[] {
  if (typeof window === 'undefined') return []
  try {
    const indexRaw = localStorage.getItem('teacher_lesson_packages') || '[]'
    const index: Array<{ id: string }> = JSON.parse(indexRaw)
    const list: LessonPackage[] = []
    for (const item of index) {
      const pkg = getLessonPackage(item.id)
      if (pkg) list.push(pkg)
    }
    return list
  } catch {
    return []
  }
}
