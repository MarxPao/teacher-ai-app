/**
 * englishTaxonomy.ts — Taxonomia Oficial de Ensino de Língua Inglesa (ELT)
 * 7 Categorias Principais e 27 Subcategorias Pedagógicas
 */

export interface EltSubcategory {
  id: string
  name: string
  desc: string
  example?: string
}

export interface EltCategory {
  id: string
  name: string
  icon: string
  color: string
  desc: string
  subcategories: EltSubcategory[]
}

export const ELT_TAXONOMY: EltCategory[] = [
  {
    id: 'grammar',
    name: 'Grammar (Gramática)',
    icon: 'ti-book-2',
    color: '#268bd2',
    desc: 'Avalia o domínio das regras estruturais e mecânicas da língua.',
    subcategories: [
      { id: 'tenses',                  name: 'Tenses (Tempos Verbais)',               desc: 'Uso correto dos tempos verbais (ex: Present Perfect vs Past Simple).' },
      { id: 'syntax',                  name: 'Syntax (Sintaxe e Ordem)',             desc: 'Ordem adequada das palavras em frases afirmativas, negativas e interrogativas.' },
      { id: 'prepositions_articles',  name: 'Prepositions and Articles',            desc: 'Escolha exata de preposições (in, on, at) e artigos (a, an, the).' },
      { id: 'conditionals',            name: 'Conditionals (Condicionais)',          desc: 'Estruturas de "If clauses" para hipóteses, fatos ou situações irreais.' },
      { id: 'reported_speech',         name: 'Reported Speech (Discurso Indireto)',  desc: 'Transformação do discurso direto em discurso indireto.' }
    ]
  },

  {
    id: 'vocabulary',
    name: 'Vocabulary (Vocabulário)',
    icon: 'ti-abc',
    color: '#859900',
    desc: 'Testa a amplitude do repertório lexical e a precisão do uso das palavras.',
    subcategories: [
      { id: 'synonyms_antonyms',       name: 'Synonyms and Antonyms',                desc: 'Identificação de palavras com significados equivalentes ou opostos.' },
      { id: 'phrasal_verbs',           name: 'Phrasal Verbs',                         desc: 'Verbos seguidos de preposição/advérbio que alteram o sentido (ex: give up, look after).' },
      { id: 'idioms',                  name: 'Idioms (Expressões Idiomáticas)',       desc: 'Expressões lógicas não dedutíveis ao pé da letra (ex: piece of cake).' },
      { id: 'collocations',            name: 'Collocations (Combinações Naturais)',  desc: 'Combinações naturais de palavras (ex: make a mistake em vez de do a mistake).' },
      { id: 'false_friends',           name: 'False Friends (Cognatos Falsos)',        desc: 'Palavras parecidas com o português mas de sentido diverso (ex: actually vs atualmente).' }
    ]
  },

  {
    id: 'reading',
    name: 'Reading Comprehension (Compreensão de Texto)',
    icon: 'ti-align-left',
    color: '#b58900',
    desc: 'Mede a capacidade de ler, interpretar e extrair dados de textos em inglês.',
    subcategories: [
      { id: 'main_idea',               name: 'Main Idea (Ideia Principal)',          desc: 'Identificação do tema central ou propósito do texto.' },
      { id: 'scanning_details',        name: 'Scanning / Detail Extraction',         desc: 'Busca rápida por informações, datas ou dados específicos.' },
      { id: 'inference',               name: 'Inference (Inferência)',                desc: 'Dedução de informações subentendidas no texto.' },
      { id: 'vocab_in_context',        name: 'Vocabulary in Context',                desc: 'Descoberta do significado lexical pelo contexto.' }
    ]
  },

  {
    id: 'listening',
    name: 'Listening Comprehension (Compreensão Auditiva)',
    icon: 'ti-headphones',
    color: '#d33682',
    desc: 'Avalia a habilidade de entender o inglês falado em diversas velocidades e sotaques.',
    subcategories: [
      { id: 'main_point',              name: 'Main Point (Ponto Principal)',          desc: 'Identificação do assunto principal de um diálogo ou palestra em áudio.' },
      { id: 'specific_details',        name: 'Specific Details (Detalhes Específicos)',desc: 'Captura de dados precisos (horários, preços, locais).' },
      { id: 'speaker_attitude',        name: 'Speaker\'s Attitude (Atitude do Falante)',desc: 'Compreensão da emoção, tom ou ironia através da intonação.' },
      { id: 'dictation',               name: 'Dictation (Ditado)',                    desc: 'Transcrição exata do que foi ouvido.' }
    ]
  },

  {
    id: 'use_of_english',
    name: 'Use of English (Uso Integrado da Língua)',
    icon: 'ti-pencil',
    color: '#6c71c4',
    desc: 'Aplicação prática simultânea de gramática e vocabulário (padrão Cambridge/IELTS).',
    subcategories: [
      { id: 'mc_cloze',                name: 'Multiple-Choice Cloze',                 desc: 'Preenchimento de lacunas em texto escolhendo entre opções pré-definidas.' },
      { id: 'open_cloze',              name: 'Open Cloze',                            desc: 'Preenchimento de lacunas sem qualquer banco de apoio.' },
      { id: 'word_formation',          name: 'Word Formation (Formação de Palavras)', desc: 'Modificação morfológica de palavra-base (ex: act → actively).' },
      { id: 'key_word_transformation', name: 'Key Word Transformation',               desc: 'Reescrita de frase mantendo o sentido usando palavra-chave obrigatória.' }
    ]
  },

  {
    id: 'writing',
    name: 'Writing (Produção Escrita)',
    icon: 'ti-notebook',
    color: '#2aa198',
    desc: 'Testa a capacidade de organizar e expressar ideias de forma coesa e coerente.',
    subcategories: [
      { id: 'essays',                  name: 'Essays (Redações)',                     desc: 'Textos argumentativos ou expositivos com introdução, desenvolvimento e conclusão.' },
      { id: 'summarization',           name: 'Summarization (Resumo)',                desc: 'Condensação de texto longo em parágrafo síntese.' },
      { id: 'emails_letters',          name: 'Emails / Letters (Correspondências)',   desc: 'Correspondências em linguagem formal ou informal.' }
    ]
  },

  {
    id: 'speaking',
    name: 'Speaking (Produção Oral)',
    icon: 'ti-microphone',
    color: '#cb4b16',
    desc: 'Avalia a clareza, fluência, pronúncia e coerência na fala.',
    subcategories: [
      { id: 'personal_interview',      name: 'Personal Interview',                    desc: 'Respostas diretas sobre rotina, preferências e experiências.' },
      { id: 'picture_description',     name: 'Picture Description',                   desc: 'Descrição detalhada dos elementos e contextos de uma imagem.' },
      { id: 'discussion_roleplay',     name: 'Discussion / Role-play',                desc: 'Interação e debate simulando situações cotidianas.' }
    ]
  }
]

export function getSubcategoriesForCategory(categoryId: string): EltSubcategory[] {
  const cat = ELT_TAXONOMY.find(c => c.id === categoryId || c.name.toLowerCase().includes(categoryId.toLowerCase()))
  return cat ? cat.subcategories : []
}

export function getCategoryById(id: string): EltCategory | undefined {
  return ELT_TAXONOMY.find(c => c.id === id)
}
