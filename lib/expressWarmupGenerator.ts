/**
 * Gerador Express de Warm-ups & Dinâmicas de Movimento/Jogos de 5–15 min (R6)
 * Gera atividades rápidas de engajamento conectadas ao tópico da aula/unidade atual,
 * com regras cooperativas antirrustração alinhadas ao PDI/PEI (ex.: Carina Miranda de Oliveira)
 * e exportação pronta para impressão (PDF / Word .doc) ou projeção em lousa.
 */

export type ExpressWarmupModality =
  | 'music_movement'
  | 'lexical_bingo'
  | 'pair_roleplay'
  | 'flashcards_memory'
  | 'board_quiz'

export interface ExpressWarmupActivity {
  id: string
  modality: ExpressWarmupModality
  modalityLabel: string
  durationMinutes: 5 | 10 | 15
  title: string
  topic: string
  grade: string
  bnccCodes: string[]
  objective: string
  materialsNeeded: string[]
  stepByStepTeacherGuide: string[]
  cooperativePdiProtocol: string
  studentPrintableItems: Array<{
    cardTitle: string
    contentLines: string[]
  }>
  boardQuizQuestions?: Array<{
    round: number
    prompt: string
    options: string[]
    correctAnswer: string
    gestureOrVisualCue: string
  }>
  printableHtml: string
}

const MODALITY_LABELS: Record<ExpressWarmupModality, string> = {
  music_movement: '🎵 Música & Movimento (TPR / Ritmo & Ação)',
  lexical_bingo: '🎲 Bingo Lexical Imprimível (4 Cartelas + Sorteio)',
  pair_roleplay: '🗣️ Role-play Rápido em Duplas (Cartões Guiados)',
  flashcards_memory: '🃏 Flashcards & Jogo da Memória (Recortável)',
  board_quiz: '⚡ Quiz Cooperativo de Lousa / Projetor'
}

export function getExpressWarmupModalityOptions(): Array<{
  id: ExpressWarmupModality
  label: string
  shortDesc: string
}> {
  return [
    {
      id: 'music_movement',
      label: MODALITY_LABELS.music_movement,
      shortDesc: 'Associa vocabulário e estruturas a gestos, música e reação física em equipe.'
    },
    {
      id: 'lexical_bingo',
      label: MODALITY_LABELS.lexical_bingo,
      shortDesc: 'Gera 4 cartelas 3x3 distintas prontas para impressão + folha de dicas do professor.'
    },
    {
      id: 'pair_roleplay',
      label: MODALITY_LABELS.pair_roleplay,
      shortDesc: 'Diálogos curtos estruturados com lacunas de apoio visual para prática oral em duplas.'
    },
    {
      id: 'flashcards_memory',
      label: MODALITY_LABELS.flashcards_memory,
      shortDesc: 'Pares recortáveis (Expressão/Imagem Mental ↔ Tradução/Contexto) para mesas em grupo.'
    },
    {
      id: 'board_quiz',
      label: MODALITY_LABELS.board_quiz,
      shortDesc: '5 rodadas rápidas para projetar no quadro com contagem regressiva e pontuação coletiva.'
    }
  ]
}

function extractKeyTermsFromTopic(topic: string): string[] {
  const baseTerms = [
    'Greetings & Introductions (Hello / Nice to meet you)',
    'Daily Routine & Action Verbs (Wake up / Study / Play)',
    'Classroom Objects & Commands (Open your book / Listen)',
    'Family & Friends Vocabulary (Brother / Sister / Best friend)',
    'Feelings & Preferences (Happy / Excited / I like music)',
    'Numbers, Colors & Days of the Week (Monday to Friday)',
    'Simple Present Affirmative (She plays / We study)',
    'Cognates & Reading Clues (Important / Music / Different)',
    'Polite Expressions (Please / Thank you / Can you help me?)'
  ]
  const cleanTopic = (topic || '').trim()
  if (!cleanTopic) return baseTerms

  const topicWords = cleanTopic
    .split(/[,;/|-]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3)

  if (topicWords.length >= 4) {
    return [...topicWords, ...baseTerms].slice(0, 9)
  }
  return [`Tema central: ${cleanTopic}`, ...baseTerms.slice(0, 8)]
}

/**
 * Gera uma dinâmica express completa (5–15 min) com protocolo cooperativo PDI/PEI e HTML imprimível.
 */
export function generateExpressClassroomActivity(params: {
  modality: ExpressWarmupModality
  durationMinutes?: 5 | 10 | 15
  topic?: string
  grade?: string
  bnccCodes?: string[]
}): ExpressWarmupActivity {
  const modality = params.modality || 'music_movement'
  const durationMinutes = params.durationMinutes || 10
  const topic = (params.topic || 'Greetings, Routine & Action Verbs').trim()
  const grade = params.grade || '6º Ano'
  const bnccCodes =
    params.bnccCodes && params.bnccCodes.length > 0
      ? params.bnccCodes
      : ['EF06LI01', 'EF06LI08', 'EF06LI16']

  const terms = extractKeyTermsFromTopic(topic)
  const modalityLabel = MODALITY_LABELS[modality]

  const cooperativePdiProtocol =
    '🤝 Protocolo Cooperativo & Inclusão PDI/PEI (Antifrustração): Jogo 100% em duplas ou equipes cooperativas, SEM eliminação individual. Cada rodada vale bônus coletivo para a turma inteira. Utilize apoio gestual/visual no quadro e permita resposta por apontamento ou cartão de cor (A/B/C) para estudantes com PDI (ex.: perfil Carina Miranda).'

  let title = `${modalityLabel.replace(/^[^\s]+\s*/, '')} — ${topic}`
  let objective = `Ativar conhecimentos prévios e fixar o repertório de "${topic}" (${bnccCodes.join(
    ', '
  )}) de forma lúdica, cinestésica e colaborativa em ${durationMinutes} minutos.`
  let materialsNeeded: string[] = ['Quadro/Projetor', 'Folha impressa ou cartões de apoio']
  let stepByStepTeacherGuide: string[] = []
  let studentPrintableItems: ExpressWarmupActivity['studentPrintableItems'] = []
  let boardQuizQuestions: ExpressWarmupActivity['boardQuizQuestions'] = []

  if (modality === 'music_movement') {
    title = `Ritmo, Gesto & Palavra-Chave (TPR) — ${topic}`
    materialsNeeded = [
      'Caixa de som ou palmas rítmicas na sala',
      'Quadro com 4 palavras-chave escritas em letras grandes',
      'Cartões visuais (A, B, C)'
    ]
    stepByStepTeacherGuide = [
      `Minuto 1–2 (Aquecimento): Apresente no quadro 4 expressões-chave de "${topic}" associando cada uma a um gesto simples (ex.: levantar as mãos, apontar para o caderno, bater palmas, fazer pose de música).`,
      `Minuto 3–7 (Rodada Musical Cooperativa): Coloque um ritmo/música instrumental animada (ou batida de palmas). Quando a música pausar ("Freeze!"), fale uma frase em inglês sobre "${topic}". As duplas fazem o gesto correspondente juntas!`,
      `Minuto 8–${durationMinutes} (Desafio dos Capitães em Dupla): Convide duplas voluntárias para escolherem o próximo comando gestual. Toda a turma soma estrelas coletivas no quadro.`
    ]
    studentPrintableItems = [
      {
        cardTitle: 'Estação Gestual 1 — Ação & Saudação',
        contentLines: [
          `Expressão-Alvo: ${terms[0]}`,
          'Gesto Combinado: Cumprimento no ar (High-five na dupla) + repetir a palavra-chave em voz alta.',
          'Dica Visual PDI: Destaque a palavra principal no quadro com giz/pincel colorido.'
        ]
      },
      {
        cardTitle: 'Estação Gestual 2 — Rotina & Movimento',
        contentLines: [
          `Expressão-Alvo: ${terms[1]}`,
          'Gesto Combinado: Mímica rápida da ação por 3 segundos com o colega de carteira.',
          'Pontuação Cooperativa: +10 pontos para a fileira toda!'
        ]
      },
      {
        cardTitle: 'Estação Gestual 3 — Comando de Sala',
        contentLines: [
          `Expressão-Alvo: ${terms[2]}`,
          'Gesto Combinado: Levantar o lápis/caderno e apontar para a resposta correta no quadro.',
          'Sem Eliminação: Quem errar recebe dica da dupla e pontua junto na rodada seguinte.'
        ]
      }
    ]
  } else if (modality === 'lexical_bingo') {
    title = `Bingo Lexical Cooperativo em Duplas — ${topic}`
    materialsNeeded = ['Cartelas impressas (1 por dupla)', 'Marcadores (feijões, tampinhas ou lápis de cor)']
    stepByStepTeacherGuide = [
      `Minuto 1–2: Entregue 1 cartela 3x3 para cada dupla (incentivando a tutoria entre pares para inclusão PDI/PEI).`,
      `Minuto 3–8: Sorteie a dica contextual em português/inglês ou mostre o gesto correspondente. A dupla conversa e marca o termo correspondente na cartela.`,
      `Minuto 9–${durationMinutes}: Em vez de apenas 1 vencedor, jogue no modo "Meta da Turma": todas as duplas que completarem uma linha horizontal ou vertical ganham o selo de missão cumprida!`
    ]
    const rotations = [
      [0, 1, 2, 3, 4, 5, 6, 7, 8],
      [2, 4, 6, 0, 8, 1, 3, 5, 7],
      [1, 3, 5, 7, 0, 2, 4, 6, 8],
      [8, 6, 4, 2, 0, 7, 5, 3, 1]
    ]
    studentPrintableItems = rotations.map((idxs, cardIdx) => ({
      cardTitle: `Cartela de Bingo Cooperativo #${cardIdx + 1} (Dupla ${String.fromCharCode(65 + cardIdx)})`,
      contentLines: idxs.map((tIdx, pos) => `[ Casa ${pos + 1} ]: ${terms[tIdx % terms.length]}`)
    }))
  } else if (modality === 'pair_roleplay') {
    title = `Role-play Guiado em Duplas — ${topic}`
    materialsNeeded = ['Cartões de diálogo impresso (Papel A e Papel B)', 'Quadro com banco de palavras de apoio']
    stepByStepTeacherGuide = [
      `Minuto 1–3: Leia as falas-modelo com entonação expressiva. Grife no quadro as palavras cognatas e os comandos principais.`,
      `Minuto 4–8: Em duplas na própria carteira, o Estudante A lê a pergunta guiada e o Estudante B escolhe uma das 3 opções visuais para responder.`,
      `Minuto 9–${durationMinutes}: As duplas invertem os papéis (A ↔ B) e registram um "Check ✅" de missão concluída.`
    ]
    studentPrintableItems = [
      {
        cardTitle: 'Cartão da Dupla — Rodada 1 (Quebra-Gelo Guiado)',
        contentLines: [
          `Estudante A: "Hello! Let's practice ${topic}. Which expression matches this situation?"`,
          `Estudante B (Escolha 1 opção com apoio): (A) ${terms[0]} | (B) ${terms[1]} | (C) ${terms[2]}`,
          'Fechamento da Dupla: "Great job! High five!"'
        ]
      },
      {
        cardTitle: 'Cartão da Dupla — Rodada 2 (Aplicação Prática)',
        contentLines: [
          `Estudante B: "Look at the keyword in bold. How can we use ${terms[3]} in class?"`,
          `Estudante A: "We can use it when we talk about ${terms[4]}!"`,
          'Adaptação PDI: Permite resposta oral curta ou apontamento direto no cartão.'
        ]
      }
    ]
  } else if (modality === 'flashcards_memory') {
    title = `Flashcards & Memory Match em Equipes — ${topic}`
    materialsNeeded = ['Folha de Flashcards recortáveis', 'Envelopes ou clipes por grupo de 3–4 alunos']
    stepByStepTeacherGuide = [
      `Minuto 1–2: Organize grupos cooperativos de 3 a 4 estudantes e distribua os cartões virados para cima na primeira rodada (reconhecimento visual sem pressão).`,
      `Minuto 3–8: Na segunda rodada, vire os cartões para baixo. Cada dupla dentro do grupo vira 2 cartões buscando conectar o Termo em Inglês à Dica Visual/Significado.`,
      `Minuto 9–${durationMinutes}: Cole os pares encontrados no caderno ou mural da turma.`
    ]
    studentPrintableItems = terms.slice(0, 6).map((term, idx) => ({
      cardTitle: `Par de Flashcard #${idx + 1}`,
      contentLines: [
        `[CARTÃO FRENTE — EXPRESSÃO]: ${term}`,
        `[CARTÃO VERSO — PISTA VISUAL / USO]: Aplicação prática em "${topic}" (${bnccCodes[idx % bnccCodes.length]})`
      ]
    }))
  } else {
    title = `Quiz Cooperativo de Lousa / Projetor (3 Alternativas) — ${topic}`
    materialsNeeded = ['Projetor ou Quadro', 'Plaquinhas A / B / C (ou dedos 1, 2, 3 levantados em dupla)']
    stepByStepTeacherGuide = [
      `Minuto 1–2: Explique que cada dupla funciona como uma "Equipe de Consultores": eles têm 20 segundos para conversar antes de levantar a resposta (A, B ou C).`,
      `Minuto 3–8: Projete ou leia as 5 rodadas abaixo (todas com apenas 3 alternativas A, B, C para acessibilidade plena de alunos com PDI/PEI).`,
      `Minuto 9–${durationMinutes}: Comemore a pontuação coletiva da turma!`
    ]
    boardQuizQuestions = [
      {
        round: 1,
        prompt: `[Rodada 1 — Aquecimento Visual] Sobre "${topic}", qual das opções abaixo representa a expressão-chave trabalhada hoje?`,
        options: [`A) ${terms[0]}`, `B) Expressão fora do contexto da unidade`, `C) Nenhuma palavra da língua inglesa`],
        correctAnswer: 'A',
        gestureOrVisualCue: 'Aponte para o topo do quadro e destaque a palavra cognata.'
      },
      {
        round: 2,
        prompt: `[Rodada 2 — Uso em Contexto] Quando queremos aplicar "${terms[1]}" em uma atividade da turma, qual atitude comunicativa está correta?`,
        options: [
          `A) Ignorar o comando da atividade`,
          `B) Utilizar "${terms[1]}" colaborando com o colega de dupla`,
          `C) Trocar de idioma sem ler as palavras-chave`
        ],
        correctAnswer: 'B',
        gestureOrVisualCue: 'Faça o gesto de trabalho em dupla (duas mãos unidas).'
      },
      {
        round: 3,
        prompt: `[Rodada 3 — Palavras Cognatas e Pistas Visuais] Qual estratégia ajuda a compreender rapidamente um texto sobre "${topic}"?`,
        options: [
          `A) Identificar palavras cognatas, títulos e imagens de apoio`,
          `B) Desistir na primeira palavra desconhecida`,
          `C) Ler apenas a última letra da página`
        ],
        correctAnswer: 'A',
        gestureOrVisualCue: 'Simule uma lupa com as mãos (busca de pistas no texto).'
      }
    ]
    studentPrintableItems = boardQuizQuestions.map(q => ({
      cardTitle: `Rodada ${q.round} (Gabarito: ${q.correctAnswer})`,
      contentLines: [q.prompt, ...q.options, `Dica Visual/Gestual para o Professor: ${q.gestureOrVisualCue}`]
    }))
  }

  const cardsHtml = studentPrintableItems
    .map(
      card => `
      <div style="margin-bottom: 12px; padding: 12px 14px; border: 1.5px dashed #8b5e3c; border-radius: 8px; background: #fffcf8; page-break-inside: avoid;">
        <div style="font-weight: 800; font-size: 11.5pt; color: #2c1a0e; margin-bottom: 6px;">
          ${card.cardTitle}
        </div>
        <ul style="margin: 0; padding-left: 18px; font-size: 10.5pt; color: #2c1a0e; line-height: 1.5;">
          ${card.contentLines.map(line => `<li>${line}</li>`).join('')}
        </ul>
      </div>`
    )
    .join('\n')

  const printableHtml = `<div class="express-warmup-document" style="font-family: inherit; color: #2c1a0e; line-height: 1.55;">
    <div style="margin-bottom: 14px; padding: 10px 14px; background: #fdf8f2; border: 1px solid #d4c8b8; border-radius: 6px;">
      <div><strong>Modalidade:</strong> ${modalityLabel} &bull; <strong>Duração:</strong> ${durationMinutes} minutos</div>
      <div><strong>Série/Turma:</strong> ${grade} &bull; <strong>Habilidades BNCC:</strong> ${bnccCodes.join(', ')}</div>
      <div style="margin-top: 4px;"><strong>Objetivo Pedagógico:</strong> ${objective}</div>
    </div>

    <div style="margin-bottom: 14px; padding: 10px 14px; background: #f5efe6; border-left: 4px solid #8b5e3c; border-radius: 4px; font-size: 10pt;">
      ${cooperativePdiProtocol}
    </div>

    <h3 style="font-size: 11.5pt; color: #2c1a0e; border-bottom: 1px solid #8b5e3c; padding-bottom: 4px;">
      1. ROTEIRO RÁPIDO DO PROFESSOR (${durationMinutes} MINUTOS)
    </h3>
    <ol style="font-size: 10.5pt; line-height: 1.55;">
      ${stepByStepTeacherGuide.map(step => `<li style="margin-bottom: 6px;">${step}</li>`).join('')}
    </ol>

    <h3 style="font-size: 11.5pt; color: #2c1a0e; border-bottom: 1px solid #8b5e3c; padding-bottom: 4px; margin-top: 16px;">
      2. MATERIAL IMPRIMÍVEL / CARTÕES DA DINÂMICA
    </h3>
    ${cardsHtml}
  </div>`

  return {
    id: `warmup_${modality}_${Date.now()}`,
    modality,
    modalityLabel,
    durationMinutes,
    title,
    topic,
    grade,
    bnccCodes,
    objective,
    materialsNeeded,
    stepByStepTeacherGuide,
    cooperativePdiProtocol,
    studentPrintableItems,
    boardQuizQuestions,
    printableHtml
  }
}
