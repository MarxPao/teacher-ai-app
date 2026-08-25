/**
 * pedagogicalMethodologies.ts — Catálogo Completo de Metodologias Científicas, do Inglês (ELT), Abordagens e Marcos
 */

export type MethodologyCategory =
  | 'Metodologias do Inglês (ELT)'
  | 'Metodologias Científicas & Cognitivas'
  | 'Abordagens Pedagógicas'
  | 'Marcos & Certificações'
  | 'Taxonomia Cognitiva'

export interface MethodologyDefinition {
  id: string
  name: string
  category: MethodologyCategory
  description: string
  promptInstruction: string
  badgeColor: string
}

export const PEDAGOGICAL_METHODOLOGIES: MethodologyDefinition[] = [
  // ─── METODOLOGIAS DO INGLÊS (ELT) ──────────────────────────────────────────
  {
    id: 'clt',
    name: 'CLT (Communicative Language Teaching)',
    category: 'Metodologias do Inglês (ELT)',
    description: 'Foco no uso funcional, interativo e comunicativo da língua em contextos reais e autênticos.',
    promptInstruction: 'Foque 100% no uso funcional da linguagem em situações do mundo real (conversações, trocas de papéis, resolução de mal-entendidos comunicativos).',
    badgeColor: '#268bd2',
  },
  {
    id: 'task_based',
    name: 'TBL / TBLT (Task-Based Language Teaching)',
    category: 'Metodologias do Inglês (ELT)',
    description: 'Aprendizagem orientada a tarefas práticas com fases de Pre-Task, Task Cycle e Language Focus.',
    promptInstruction: 'Siga rigorosamente a estrutura TBLT: (1) Pre-Task (aquecimento e modelo), (2) Task Cycle (planejamento e execução), (3) Language Focus (análise linguística pós-tarefa).',
    badgeColor: '#b58900',
  },
  {
    id: 'clil',
    name: 'CLIL (Content & Language Integrated Learning)',
    category: 'Metodologias do Inglês (ELT)',
    description: 'Integração do aprendizado de inglês com disciplinas acadêmicas (Ciências, História, Geografia).',
    promptInstruction: 'Integre conteúdo interdisciplinar autêntico (ex: Ciências, Geografia, História, Tecnologia) com suporte duplo: aprendizagem conceitual + suporte léxico em inglês.',
    badgeColor: '#2aa198',
  },
  {
    id: 'lexical_approach',
    name: 'Abordagem Léxica (Lexical Approach / Michael Lewis)',
    category: 'Metodologias do Inglês (ELT)',
    description: 'Ensino baseado em collocations, blocos léxicos (chunks) e expressões idiomáticas frequentes.',
    promptInstruction: 'Enfatize blocos de palavras (lexical chunks, collocations, fixed phrases) ao invés de regras gramaticais isoladas. Crie exercícios de identificação e uso de chunks.',
    badgeColor: '#6c71c4',
  },
  {
    id: 'dogme_el',
    name: 'Dogme ELT / Unplugged (Thornbury)',
    category: 'Metodologias do Inglês (ELT)',
    description: 'Ensino focado no diálogo emergente dos alunos com mínimo recurso artificial.',
    promptInstruction: 'Crie prompts de conversação emergente e altamente pessoais baseados em experiências do aluno, estimulando linguagem natural e correção no momento oportuno.',
    badgeColor: '#073642',
  },
  {
    id: 'audio_lingual',
    name: 'Método Áudio-Lingual & Drills Estruturais',
    category: 'Metodologias do Inglês (ELT)',
    description: 'Padrões de repetição, substituição e fixação rítmica de estruturas gramaticais.',
    promptInstruction: 'Inclua exercícios de drills estruturais (Pattern Practice), transformação de sentenças e pares mínimos de pronúncia.',
    badgeColor: '#cb4b16',
  },
  {
    id: 'tpr',
    name: 'TPR (Total Physical Response / Asher)',
    category: 'Metodologias do Inglês (ELT)',
    description: 'Associação direta de comandos verbais em inglês com respostas cinestésicas e visuais.',
    promptInstruction: 'Elabore comandos de ação dinâmica (Action Chains) e instruções verbais diretas que vinculem significado à ação física.',
    badgeColor: '#859900',
  },

  // ─── METODOLOGIAS CIENTÍFICAS & COGNITIVAS ──────────────────────────────────
  {
    id: 'inquiry_learning',
    name: 'Método Científico & Investigação (Inquiry-Based Learning)',
    category: 'Metodologias Científicas & Cognitivas',
    description: 'Hipóteses, coleta de evidências, observação de dados e descoberta de regras por indução.',
    promptInstruction: 'Inicie com uma Questão Investigativa Central (Essential Question) e forneça dados/evidências para que o aluno formule hipóteses e deduza a regra científica/linguística.',
    badgeColor: '#2aa198',
  },
  {
    id: 'problem_based_learning',
    name: 'Aprendizagem Baseada em Problemas (PBL / Problem-Based)',
    category: 'Metodologias Científicas & Cognitivas',
    description: 'Cenários do mundo real complexos que exigem diagnóstico analítico e soluções embasadas.',
    promptInstruction: 'Apresente um Caso/Problema Realista (Problem Scenario), seguido de perguntas de investigação guiada que exijam diagnósticos, hipóteses e solução justificada.',
    badgeColor: '#cb4b16',
  },
  {
    id: 'project_based_learning',
    name: 'Aprendizagem Baseada em Projetos (PBL / Project-Based)',
    category: 'Metodologias Científicas & Cognitivas',
    description: 'Desenvolvimento de produtos e entregáveis através de etapas iterativas de prototipagem.',
    promptInstruction: 'Crie uma atividade estruturada como Projeto: inclua Pergunta-Guia (Driving Question), Etapas de Prototipagem, Produto Final Esperado e Critérios de Avaliação.',
    badgeColor: '#b58900',
  },
  {
    id: 'retrieval_practice',
    name: 'Prática de Recuperação & Repetição Espaçada (Cognitiva)',
    category: 'Metodologias Científicas & Cognitivas',
    description: 'Fortalecimento da memória de longo prazo através de testes frequentes de recordação ativa.',
    promptInstruction: 'Utilize princípios de Ciência Cognitiva: questões de recordação ativa (Active Recall) sem pistas superficiais e conexões cumulativas com matérias anteriores.',
    badgeColor: '#d33682',
  },
  {
    id: 'peer_instruction',
    name: 'Instrução por Pares (Peer Instruction / Eric Mazur)',
    category: 'Metodologias Científicas & Cognitivas',
    description: 'Testes conceituais com debate entre pares e argumentação científica/lógica.',
    promptInstruction: 'Elabore testes de conceito (Concept Tests) seguidos por instruções para discussão em duplas ("Convença seu colega com base em evidências") e consenso.',
    badgeColor: '#6c71c4',
  },
  {
    id: 'dual_coding',
    name: 'Codificação Dupla & Teoria da Carga Cognitiva (Sweller)',
    category: 'Metodologias Científicas & Cognitivas',
    description: 'Combinação de representações verbais e visuais estruturadas para maximizar absorção.',
    promptInstruction: 'Estruture o conteúdo combinando tabelas sintéticas, diagramas textuais e organizadores visuais com instruções enxutas sem sobrecarga cognitiva.',
    badgeColor: '#268bd2',
  },
  {
    id: 'flipped_classroom',
    name: 'Sala de Aula Invertida (Flipped Classroom)',
    category: 'Metodologias Científicas & Cognitivas',
    description: 'Estudo prévio individual de conceitos seguido de aplicação prática profunda na aula.',
    promptInstruction: 'Estruture o conteúdo em duas partes explícitas: (1) Pre-Class Task (estudo/leitura prévia com conceito-chave) e (2) In-Class Active Challenge (aplicação prática para a aula).',
    badgeColor: '#268bd2',
  },

  // ─── ABORDAGENS PEDAGÓGICAS & DIFERENCIAÇÃO ────────────────────────────────
  {
    id: 'vygotsky_zpd',
    name: 'Sociointeracionismo & Scaffolding (Vygotsky)',
    category: 'Abordagens Pedagógicas',
    description: 'Andaimes graduais de suporte: do apoio guiado à autonomia total do aluno.',
    promptInstruction: 'Forneça andaimes pedagógicos (Scaffolding): comece com dicas e bancos de apoio (suporte alto) e diminua gradualmente o apoio nas questões finais (autonomia alta).',
    badgeColor: '#6c71c4',
  },
  {
    id: 'gamification',
    name: 'Gamificação (Gamified Learning)',
    category: 'Abordagens Pedagógicas',
    description: 'Mecânicas de engajamento (pontos de XP, fases, desafios e recompensas).',
    promptInstruction: 'Incorpore elementos de gamificação: atribua Pontos de XP a cada questão, divida em Níveis (Fácil / Desafio / Boss Level) e adicione "Badge de Conquista" ao final.',
    badgeColor: '#d33682',
  },
  {
    id: 'design_thinking',
    name: 'Design Thinking Pedagógico',
    category: 'Abordagens Pedagógicas',
    description: 'Etapas de Empatia, Definição, Ideação, Prototipagem e Teste.',
    promptInstruction: 'Divida o exercício nas etapas do Design Thinking: (1) Empathize, (2) Define, (3) Ideate, (4) Prototype, (5) Test.',
    badgeColor: '#859900',
  },

  // ─── MARCOS & CERTIFICAÇÕES ────────────────────────────────────────────────
  {
    id: 'bncc',
    name: 'BNCC (Base Nacional Comum Curricular)',
    category: 'Marcos & Certificações',
    description: 'Habilidades oficiais curriculares (EF06LI a EM13LGG) e competências gerais.',
    promptInstruction: 'Alinhe estritamente com as Habilidades Oficiais da BNCC (ex: EF06LI01, EF09LI05, EM13LGG102). Inclua a codificação da habilidade e o eixo correspondente.',
    badgeColor: '#859900',
  },
  {
    id: 'cambridge_cefr',
    name: 'Padrão Cambridge & Quadro CEFR (A1-C2)',
    category: 'Marcos & Certificações',
    description: 'Formatos oficiais internacionais de proficiência Cambridge (KET, PET, FCE, CAE).',
    promptInstruction: 'Utilize o formato rigoroso de exames Cambridge (Key Word Transformation, Open Cloze, Word Formation, Multiple Choice) no nível CEFR indicado.',
    badgeColor: '#268bd2',
  },
  {
    id: 'enem_vestibulares',
    name: 'ENEM & Vestibulares (Matriz TRI)',
    category: 'Marcos & Certificações',
    description: 'Textos autênticos, interpretação contextual e distratores com base na Teoria de Resposta ao Item.',
    promptInstruction: 'Elabore questões no padrão do ENEM / Vestibulares: texto-base autêntico, enunciado contextualizado e 5 alternativas (A-E) com distratores plausíveis.',
    badgeColor: '#cb4b16',
  },
  {
    id: 'ib_english',
    name: 'IB English (International Baccalaureate)',
    category: 'Marcos & Certificações',
    description: 'Análise textual avançada, perspectiva global e síntese crítica internacional.',
    promptInstruction: 'Estruture conforme o currículo internacional IB: foco em reflexão crítica, perspectiva global e critérios oficiais de avaliação do IB.',
    badgeColor: '#b58900',
  },
  {
    id: 'us_common_core',
    name: 'US Common Core ELA (CCSS)',
    category: 'Marcos & Certificações',
    description: 'Padrão americano de análise textual baseada em evidências e vocabulário acadêmico.',
    promptInstruction: 'Siga os padrões americanos US Common Core ELA (CCSS): exigência de citações diretas do texto-base (text-based evidence) e vocabulário acadêmico Tier 2/3.',
    badgeColor: '#268bd2',
  },
  {
    id: 'igcse_english',
    name: 'Cambridge IGCSE English',
    category: 'Marcos & Certificações',
    description: 'Exame de certificação internacional para escolas bilíngues e internacionais.',
    promptInstruction: 'Utilize o formato rigoroso do exame Cambridge IGCSE (Directed Writing, Summary Task, Reading Comprehension & Writer’s Effect).',
    badgeColor: '#2aa198',
  },

  // ─── TAXONOMIA COGNITIVA ───────────────────────────────────────────────────
  {
    id: 'blooms_taxonomy',
    name: 'Taxonomia de Bloom Revisada (6 Níveis)',
    category: 'Taxonomia Cognitiva',
    description: 'Lembrar, Entender, Aplicar, Analisar, Avaliar e Criar organizados progressivamente.',
    promptInstruction: 'Gradue as questões sequencialmente pelos níveis de Bloom: 1. Lembrar, 2. Entender, 3. Aplicar, 4. Analisar, 5. Avaliar, 6. Criar. Identifique o nível em cada questão.',
    badgeColor: '#d33682',
  },
  {
    id: 'dok_webb',
    name: 'DOK (Depth of Knowledge / Webb)',
    category: 'Taxonomia Cognitiva',
    description: '4 Níveis de Profundidade do Conhecimento: Recall, Skill/Concept, Strategic Thinking, Extended Thinking.',
    promptInstruction: 'Classifique e estruture as questões conforme os 4 níveis DOK de Webb, enfatizando raciocínio estratégico e pensamento estendido.',
    badgeColor: '#073642',
  }
]

/**
 * Retorna as instruções pedagógicas detalhadas para um conjunto de metodologias selecionadas.
 */
export function buildMethodologyInstructions(selectedIdsOrNames: string[]): string {
  if (!selectedIdsOrNames || !selectedIdsOrNames.length) return ''

  const instructions: string[] = []

  for (const item of selectedIdsOrNames) {
    const match = PEDAGOGICAL_METHODOLOGIES.find(m =>
      m.id.toLowerCase() === item.toLowerCase() ||
      m.name.toLowerCase().includes(item.toLowerCase()) ||
      item.toLowerCase().includes(m.name.toLowerCase())
    )

    if (match) {
      instructions.push(`- **${match.name}**: ${match.promptInstruction}`)
    }
  }

  if (!instructions.length) return ''

  return `\n=== INSTRUÇÕES RÍGOROSAS DE METODOLOGIAS & MARCOS SELECIONADOS ===\n${instructions.join('\n')}\n`
}

