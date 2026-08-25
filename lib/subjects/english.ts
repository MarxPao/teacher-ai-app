/**
 * subjects/english.ts — Perfil de Língua Inglesa
 *
 * Migra o conhecimento hardcoded de inglês (ELT taxonomy, CEFR gating,
 * L1 interference patterns, Cambridge rubric) para o formato SubjectProfile.
 * O código original do ExamBuilder e OmniGrader continua funcionando via fallback.
 *
 * Auto-registra ao importar: import '@/lib/subjects/english'
 */

import { SubjectProfile, registerSubjectProfile } from '@/lib/subjectProfile'

const englishProfile: SubjectProfile = {
  id: 'english',
  name: 'Língua Inglesa',
  nameShort: 'Inglês',
  examLanguage: 'en',

  // ─── Taxonomia ELT (7 categorias × 27 subcategorias) ──────────────────────
  taxonomy: [
    {
      id: 'Grammar',
      name: 'Grammar',
      icon: 'ti-book-2',
      subcategories: [
        { id: 'tenses', name: 'Tenses' },
        { id: 'syntax', name: 'Syntax' },
        { id: 'prepositions', name: 'Prepositions and Articles' },
        { id: 'conditionals', name: 'Conditionals' },
        { id: 'reported_speech', name: 'Reported Speech' },
      ]
    },
    {
      id: 'Vocabulary',
      name: 'Vocabulary',
      icon: 'ti-abc',
      subcategories: [
        { id: 'synonyms', name: 'Synonyms and Antonyms' },
        { id: 'phrasal_verbs', name: 'Phrasal Verbs' },
        { id: 'idioms', name: 'Idioms' },
        { id: 'collocations', name: 'Collocations' },
        { id: 'false_friends', name: 'False Friends' },
      ]
    },
    {
      id: 'Reading Comprehension',
      name: 'Reading Comprehension',
      icon: 'ti-align-left',
      subcategories: [
        { id: 'main_idea', name: 'Main Idea' },
        { id: 'scanning', name: 'Scanning / Detail Extraction' },
        { id: 'inference', name: 'Inference' },
        { id: 'vocab_in_context', name: 'Vocabulary in Context' },
      ]
    },
    {
      id: 'Listening Comprehension',
      name: 'Listening Comprehension',
      icon: 'ti-headphones',
      subcategories: [
        { id: 'main_point', name: 'Main Point' },
        { id: 'specific_details', name: 'Specific Details' },
        { id: 'speaker_attitude', name: "Speaker's Attitude" },
        { id: 'dictation', name: 'Dictation' },
      ]
    },
    {
      id: 'Use of English',
      name: 'Use of English',
      icon: 'ti-pencil',
      subcategories: [
        { id: 'mc_cloze', name: 'Multiple-Choice Cloze' },
        { id: 'open_cloze', name: 'Open Cloze' },
        { id: 'word_formation', name: 'Word Formation' },
        { id: 'key_word', name: 'Key Word Transformation' },
      ]
    },
    {
      id: 'Writing',
      name: 'Writing',
      icon: 'ti-notebook',
      subcategories: [
        { id: 'essays', name: 'Essays' },
        { id: 'summarization', name: 'Summarization' },
        { id: 'emails_letters', name: 'Emails & Letters' },
      ]
    },
    {
      id: 'Speaking',
      name: 'Speaking',
      icon: 'ti-microphone',
      subcategories: [
        { id: 'interview', name: 'Personal Interview' },
        { id: 'picture_description', name: 'Picture Description' },
        { id: 'discussion', name: 'Discussion / Role-play' },
      ]
    },
  ],

  // ─── Framework de Níveis: CEFR ─────────────────────────────────────────────
  levelFramework: {
    name: 'CEFR',
    levels: [
      {
        id: 'A1',
        label: 'A1 — Breakthrough',
        wordLimits: { min: 100, max: 150 },
        gatingRules: `NÍVEL CEFR A1 (Breakthrough):
- Vocabulário restrito a alta frequência (família, rotina, escola, hobbies, cores, números, comida).
- Frases curtas e coordenadas simples (máx 10-12 palavras por oração).
- Gramática permitida: Simple Present, Present Continuous, Can/Can't, There is/are, Imperatives, Pronomes básicos.
- PROIBIDO: Passive Voice, Past Perfect, Conditionals, Phrasal Verbs complexos, vocabulário abstrato.
- Textos de Leitura: exatamente 100 a 150 palavras.`
      },
      {
        id: 'A2',
        label: 'A2 — Waystage (KET)',
        wordLimits: { min: 150, max: 220 },
        gatingRules: `NÍVEL CEFR A2 (Waystage - KET):
- Vocabulário prático e descritivo (viagens, compras, passado, planos futuros, saúde).
- Frases simples com conectivos básicos (and, but, because, so, when).
- Gramática permitida: Simple Past, Going to, Will (previsão), Comparatives/Superlatives, Have to, Modals (should, must).
- PROIBIDO: 2nd/3rd Conditionals, Past Perfect, Passive Voice múltiplos tempos, vocabulário B2.
- Textos de Leitura: exatamente 150 a 220 palavras.`
      },
      {
        id: 'B1',
        label: 'B1 — Threshold (PET)',
        wordLimits: { min: 250, max: 350 },
        gatingRules: `NÍVEL CEFR B1 (Threshold - PET):
- Vocabulário intermediário (opiniões, sentimentos, trabalho, lazer, tecnologia, experiências).
- Gramática permitida: Present Perfect (since/for/already/yet), First & Second Conditionals, Relative Clauses (defining), Passive Voice (Simple Present/Past), Used to, Modals of Deduction (might, could).
- Textos de Leitura: exatamente 250 a 350 palavras.`
      },
      {
        id: 'B2',
        label: 'B2 — Vantage (FCE)',
        wordLimits: { min: 350, max: 450 },
        gatingRules: `NÍVEL CEFR B2 (Vantage - FCE):
- Vocabulário avançado e expressivo (argumentação, hipóteses, phrasal verbs idiomáticos, collocations formais).
- Gramática permitida: Third Conditional, Mixed Conditionals, Past Perfect Continuous, Passive Voice avançada, Reported Speech, Wish/If only, Linkers formais (However, Whereas, In spite of, Furthermore).
- Textos de Leitura: exatamente 350 a 450 palavras.`
      },
      {
        id: 'C1',
        label: 'C1 — Effective Operational (CAE)',
        wordLimits: { min: 450, max: 600 },
        gatingRules: `NÍVEL CEFR C1/C2 (Effective Operational / Mastery - CAE/CPE):
- Vocabulário acadêmico e idiomático sofisticado, nuances estilísticas, inversão enfática, cleft sentences.
- Textos de Leitura: 450 a 600 palavras.`
      },
      { id: 'C2', label: 'C2 — Mastery (CPE)', wordLimits: { min: 500, max: 700 },
        gatingRules: `NÍVEL CEFR C2 (Mastery - CPE): Domínio nativo, sofisticação lexical e sintática plena.` }
    ]
  },

  // ─── Padrões Diagnósticos de Distratores (Interferência L1 PT→EN) ───────────
  distractorPatterns: [
    {
      id: 'l1_syntax',
      pattern: 'Interferência Sintática de L1 (Português)',
      examples: ['"I have 15 years"', '"I am agree"', '"She said me that..."', '"Is raining today"'],
      pedagogicNote: 'Crie distratores que espelham estrutura do português aplicada diretamente ao inglês.'
    },
    {
      id: 'false_friends',
      pattern: 'Falsos Cognatos Reais (False Friends)',
      examples: ['"pretend" (confundido com pretender)', '"attend" (atender vs frequentar)', '"actually" (atualmente vs na verdade)'],
      pedagogicNote: 'Use palavras com grafia/som similar em PT mas significado diferente em EN.'
    },
    {
      id: 'overgeneralization',
      pattern: 'Super-generalização de Regras',
      examples: ['"goed"', '"buyed"', '"I have seen him yesterday"'],
      pedagogicNote: 'Crie distratores aplicando regra regular a irregular ou Present Perfect com data específica.'
    },
    {
      id: 'aspect_preposition',
      pattern: 'Aspecto Verbal & Preposições',
      examples: ['"depend of"', '"since 3 years"', '"I am here since Monday"'],
      pedagogicNote: 'Confusão entre Simple Past vs Past Continuous e preposições típicas de português.'
    },
    {
      id: 'uncountable_plural',
      pattern: 'Pluralização de Incontáveis',
      examples: ['"informations"', '"advices"', '"homeworks"'],
      pedagogicNote: 'Distratores com plural de substantivos incontáveis (padrão do português).'
    },
    {
      id: 'verb_agreement',
      pattern: 'Concordância Verbal L1',
      examples: ['"He go to school"', '"She don\'t like"'],
      pedagogicNote: 'Ausência de -s na 3ª pessoa por influência do padrão morfológico do português.'
    },
    {
      id: 'article_confusion',
      pattern: 'Uso do Artigo Definido',
      examples: ['"I love the soccer"', '"The life is beautiful"'],
      pedagogicNote: 'Inserção de artigo definido onde o inglês não usa (influência do português).'
    },
    {
      id: 'question_formation',
      pattern: 'Formação de Perguntas sem Auxiliar',
      examples: ['"Where you live?"', '"What she does?"'],
      pedagogicNote: 'Omissão de do/does/did na formação de perguntas (padrão SVO direto do português).'
    }
  ],

  // ─── Rubrica Cambridge 4D (para OmniGrader) ───────────────────────────────
  essayRubric: [
    {
      id: 'content',
      name: 'Content',
      maxScore: 5,
      descriptors: {
        '5': 'All content is relevant and the reader is fully informed. Ideas are well-developed with examples.',
        '4': 'Content is mostly relevant. Some ideas could be further developed.',
        '3': 'Content is generally appropriate but some irrelevance or repetition present.',
        '2': 'Some relevant content but limited development of ideas.',
        '1': 'Minimal relevant content; ideas are undeveloped.',
        '0': 'Content is irrelevant or no response.'
      }
    },
    {
      id: 'communicative_achievement',
      name: 'Communicative Achievement',
      maxScore: 5,
      descriptors: {
        '5': 'Consistently achieves the desired effect on the reader. Register and format are fully appropriate.',
        '4': 'Generally achieves the desired effect. Register mostly appropriate.',
        '3': 'Some communicative effect achieved. Some inconsistency in register.',
        '2': 'Limited communicative effect.',
        '1': 'Very limited attempt at communicative effect.',
        '0': 'No communicative effect.'
      }
    },
    {
      id: 'organisation',
      name: 'Organisation',
      maxScore: 5,
      descriptors: {
        '5': 'Logical organisation with effective use of cohesive devices. Ideas flow naturally.',
        '4': 'Generally well-organised with some effective cohesion.',
        '3': 'Some evidence of organisation. Cohesive devices used but not always effectively.',
        '2': 'Limited organisation; ideas are not well-connected.',
        '1': 'Very limited organisation.',
        '0': 'No evidence of organisation.'
      }
    },
    {
      id: 'language',
      name: 'Language',
      maxScore: 5,
      descriptors: {
        '5': 'Wide range of vocabulary and structures used with flexibility and accuracy. Errors are minimal.',
        '4': 'Good range of vocabulary and structures. Occasional errors that do not impede communication.',
        '3': 'Adequate range of vocabulary and structures. Errors present but generally do not impede.',
        '2': 'Limited range. Errors are frequent and may impede communication.',
        '1': 'Very limited range with many errors.',
        '0': 'No control of language.'
      }
    }
  ],

  agentSystemPromptSnippet: `Você domina a Taxonomia Oficial ELT composta por 7 Categorias e 27 Subcategorias:
1. Grammar (Tenses, Syntax, Prepositions and Articles, Conditionals, Reported Speech)
2. Vocabulary (Synonyms and Antonyms, Phrasal Verbs, Idioms, Collocations, False Friends)
3. Reading Comprehension (Main Idea, Scanning/Detail Extraction, Inference, Vocabulary in Context)
4. Listening Comprehension (Main Point, Specific Details, Speaker's Attitude, Dictation)
5. Use of English (Multiple-Choice Cloze, Open Cloze, Word Formation, Key Word Transformation)
6. Writing (Essays, Summarization, Emails/Letters)
7. Speaking (Personal Interview, Picture Description, Discussion/Role-play)
Frameworks: CEFR (A1-C2), Cambridge Assessment English, IELTS, BNCC Língua Inglesa (EF06LI-EM13LGG).`,

  bnccSkillIds: [
    'EF06LI01', 'EF06LI02', 'EF06LI07', 'EF06LI15', 'EF06LI19', 'EF06LI25',
    'EF07LI01', 'EF07LI06', 'EF07LI12', 'EF07LI15', 'EF07LI23',
    'EF08LI01', 'EF08LI05', 'EF08LI14', 'EF08LI16',
    'EF09LI01', 'EF09LI08', 'EF09LI14', 'EF09LI15', 'EF09LI16', 'EF09LI19',
    'EM13LGG101', 'EM13LGG401', 'EM13LGG604'
  ]
}

// Auto-registra ao importar
registerSubjectProfile(englishProfile)

export default englishProfile
