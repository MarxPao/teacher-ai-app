/**
 * pedagogicalMethodologies.ts — Catálogo Completo e Oficial de Metodologias Ativas e Abordagens ELT/Pedagógicas
 */

export interface MethodologyDefinition {
  id: string
  name: string
  category: 'Metodologias Ativas' | 'Abordagens ELT' | 'Marcos & Taxonomias'
  description: string
  promptInstruction: string
  badgeColor: string
}

export const PEDAGOGICAL_METHODOLOGIES: MethodologyDefinition[] = [
  // ─── METODOLOGIAS ATIVAS ───────────────────────────────────────────────────
  {
    id: 'flipped_classroom',
    name: 'Sala de Aula Invertida (Flipped Classroom)',
    category: 'Metodologias Ativas',
    description: 'Estudo prévio autônomo seguido de aplicação prática e resolução colaborativa na aula.',
    promptInstruction: 'Estruture o conteúdo em duas partes explícitas: (1) Pre-Class Task (estudo/leitura prévia com conceito-chave) e (2) In-Class Active Challenge (aplicação prática profunda para a aula).',
    badgeColor: '#268bd2',
  },
  {
    id: 'project_based_learning',
    name: 'Aprendizagem Baseada em Projetos (PBL)',
    category: 'Metodologias Ativas',
    description: 'Investigação e criação de um produto/projeto real em resposta a um problema complexo.',
    promptInstruction: 'Crie uma atividade estruturada como Projeto: inclua Pergunta-Guia (Driving Question), Etapas de Prototipagem/Elaboração, Produto Final Esperado e Rubrica de Entrega.',
    badgeColor: '#b58900',
  },
  {
    id: 'problem_based_learning',
    name: 'Aprendizagem Baseada em Problemas (PBL)',
    category: 'Metodologias Ativas',
    description: 'Resolução de cenários hipotéticos ou reais através de análise crítica e tomada de decisão.',
    promptInstruction: 'Apresente um Caso/Problema Realista (Problem Scenario), seguido de perguntas de investigação guiada que exijam diagnósticos, hipóteses e solução justificada.',
    badgeColor: '#cb4b16',
  },
  {
    id: 'peer_instruction',
    name: 'Instrução por Pares (Peer Instruction / Mazur)',
    category: 'Metodologias Ativas',
    description: 'Testes conceituais individuais seguidos de discussão entre alunos e réplica de votação.',
    promptInstruction: 'Elabore testes de conceito (Concept Tests) seguidos por instruções explícitas para discussão em duplas ("Convença seu colega") e verificação de consenso.',
    badgeColor: '#6c71c4',
  },
  {
    id: 'gamification',
    name: 'Gamificação (Gamified Learning)',
    category: 'Metodologias Ativas',
    description: 'Mecânicas e dinâmicas de jogos (missões, pontos de XP, níveis e conquistas).',
    promptInstruction: 'Incorpore elementos de gamificação: atribua Pontos de XP a cada questão, divida em Níveis (Fácil / Desafio / Boss Level) e adicione "Badge de Conquista" ao final.',
    badgeColor: '#d33682',
  },
  {
    id: 'design_thinking',
    name: 'Design Thinking Pedagógico',
    category: 'Metodologias Ativas',
    description: 'Fases de Empatia, Definição, Ideação, Prototipagem e Teste aplicadas ao aprendizado.',
    promptInstruction: 'Divida o exercício nas 5 etapas do Design Thinking: (1) Empathize, (2) Define, (3) Ideate, (4) Prototype, (5) Test.',
    badgeColor: '#859900',
  },
  {
    id: 'inquiry_learning',
    name: 'Aprendizagem Baseada em Investigação (Inquiry-Based)',
    category: 'Metodologias Ativas',
    description: 'Curiosidade guiada, perguntas provocativas e descoberta científica autônoma.',
    promptInstruction: 'Inicie com uma Pergunta Provocativa (Essential Question) e forneça pistas/evidências para que o aluno descubra a regra ou padrão de forma investigativa.',
    badgeColor: '#2aa198',
  },

  // ─── ABORDAGENS ELT / ENSINO DE INGLÊS ────────────────────────────────────
  {
    id: 'clt',
    name: 'CLT (Communicative Language Teaching)',
    category: 'Abordagens ELT',
    description: 'Foco no uso funcional e comunicativo da língua em contextos autênticos e significativos.',
    promptInstruction: 'Foque 100% no uso funcional da linguagem em situações do mundo real (conversações, simulações de troca de papéis, resolução de mal-entendidos genuínos).',
    badgeColor: '#268bd2',
  },
  {
    id: 'task_based',
    name: 'TBL / TBLT (Task-Based Language Teaching)',
    category: 'Abordagens ELT',
    description: 'Aprendizagem orientada a tarefas com fases de Pre-Task, Task Cycle e Language Focus.',
    promptInstruction: 'Siga rigorosamente a estrutura TBLT: (1) Pre-Task (aquecimento e modelo), (2) Task Cycle (planejamento e execução), (3) Language Focus (análise linguística pós-tarefa).',
    badgeColor: '#b58900',
  },
  {
    id: 'clil',
    name: 'CLIL (Content & Language Integrated Learning)',
    category: 'Abordagens ELT',
    description: 'Integração do aprendizado de inglês com disciplinas escolares (Ciências, História, Geografia).',
    promptInstruction: 'Integre conteúdo interdisciplinar autêntico (ex: Ciências, Geografia, História, Tecnologia) com suporte duplo: aprendizagem de conteúdo acadêmico + suporte léxico em inglês.',
    badgeColor: '#2aa198',
  },
  {
    id: 'lexical_approach',
    name: 'Abordagem Léxica (Lexical Approach / Michael Lewis)',
    category: 'Abordagens ELT',
    description: 'Ensino baseado em collocations, blocos léxicos (chunks) e expressões prontas.',
    promptInstruction: 'Enfatize blocos de palavras (lexical chunks, collocations, fixed phrases) ao invés de regras gramaticais isoladas. Crie exercícios de identificação e uso de chunks.',
    badgeColor: '#6c71c4',
  },
  {
    id: 'dogme_el',
    name: 'Dogme ELT / Unplugged (Thornbury)',
    category: 'Abordagens ELT',
    description: 'Ensino focado no diálogo emergente dos alunos com mínimo recurso material.',
    promptInstruction: 'Crie prompts de conversação emergente e altamente pessoais baseados em experiências do aluno, estimulando a linguagem natural e correção no momento oportuno.',
    badgeColor: '#073642',
  },

  // ─── MARCOS & TAXONOMIAS OFICIAIS ──────────────────────────────────────────
  {
    id: 'bncc',
    name: 'BNCC (Base Nacional Comum Curricular)',
    category: 'Marcos & Taxonomias',
    description: 'Diretrizes curriculares nacionais de Inglês (Habilidades EF06LI a EM13LGG).',
    promptInstruction: 'Alinhe estritamente com as Habilidades Oficiais da BNCC (ex: EF06LI01, EF09LI05, EM13LGG102). Inclua a codificação da habilidade e o eixo correspondente.',
    badgeColor: '#859900',
  },
  {
    id: 'blooms_taxonomy',
    name: 'Taxonomia de Bloom Revisada',
    category: 'Marcos & Taxonomias',
    description: 'Hierarquia de níveis cognitivos: Lembrar, Entender, Aplicar, Analisar, Avaliar, Criar.',
    promptInstruction: 'Gradue as questões sequencialmente pelos 6 níveis de Bloom: 1. Remember, 2. Understand, 3. Apply, 4. Analyze, 5. Evaluate, 6. Create. Identifique o nível em cada questão.',
    badgeColor: '#d33682',
  },
  {
    id: 'cambridge_cefr',
    name: 'Padrão Cambridge & Quadro CEFR (A1-C2)',
    category: 'Marcos & Taxonomias',
    description: 'Níveis oficiais europeus de proficiência e formatos das exames Cambridge (KET, PET, FCE, CAE).',
    promptInstruction: 'Utilize o formato rigoroso de exames Cambridge (Key Word Transformation, Open Cloze, Word Formation, Multiple Choice) no nível CEFR indicado.',
    badgeColor: '#268bd2',
  },
  {
    id: 'enem_vestibulares',
    name: 'ENEM & Vestibulares (Matriz TRI)',
    category: 'Marcos & Taxonomias',
    description: 'Estilo de questões contextualizadas dos exames nacionais (ENEM, FUVEST, UNICAMP) com distratores elaborados e matriz TRI.',
    promptInstruction: 'Elabore questões no padrão oficial do ENEM / Vestibulares Nacionais: texto-base verbal/não-verbal autêntico (notícia, cartum, artigo ou poema), enunciado focado na interpretação contextual em língua inglesa e 5 alternativas (A, B, C, D, E) com análise de distratores plausíveis.',
    badgeColor: '#cb4b16',
  },
  {
    id: 'ib_english',
    name: 'IB English (International Baccalaureate)',
    category: 'Marcos & Taxonomias',
    description: 'Padrão global IB de análise textual, comunicação intercultural e síntese crítica em inglês.',
    promptInstruction: 'Estruture o conteúdo conforme o currículo internacional IB Language Acquisition / Literature: inclua foco em reflexão crítica, perspectiva global, análise de conceitos de área e critérios oficiais de avaliação do IB.',
    badgeColor: '#b58900',
  },
  {
    id: 'us_common_core',
    name: 'US Common Core ELA (English Language Arts)',
    category: 'Marcos & Taxonomias',
    description: 'Padrão americano de leitura de textos informativos complexos, escrita baseada em evidências e vocabulário acadêmico.',
    promptInstruction: 'Siga os padrões americanos US Common Core ELA (CCSS): exigência de citações diretas do texto-base (text-based evidence), análise de estrutura de argumento e vocabulário acadêmico Tier 2/Tier 3.',
    badgeColor: '#268bd2',
  },
  {
    id: 'igcse_english',
    name: 'Cambridge IGCSE English First / Second Language',
    category: 'Marcos & Taxonomias',
    description: 'Exame de certificação internacional Cambridge IGCSE para escolas bilíngues e internacionais.',
    promptInstruction: 'Utilize o formato rigoroso do exame Cambridge IGCSE (Directed Writing, Summary Task, Reading Comprehension & Writer’s Effect).',
    badgeColor: '#2aa198',
  },
  {
    id: 'vygotsky_zpd',
    name: 'Sociointeracionismo & Scaffolding (Vygotsky)',
    category: 'Marcos & Taxonomias',
    description: 'Zona de Desenvolvimento Proximal com andaimes pedagógicos graduais.',
    promptInstruction: 'Forneça andaimes pedagógicos (Scaffolding): comece com dicas e bancos de apoio (suporte alto) e diminua gradualmente o apoio nas questões finais (autonomia alta).',
    badgeColor: '#6c71c4',
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

  return `\n=== INSTRUÇÕES RÍGOROSAS DE METODOLOGIAS SELECIONADAS ===\n${instructions.join('\n')}\n`
}
