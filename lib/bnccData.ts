/**
 * bnccData.ts — Matriz Central de Competências e Habilidades BNCC
 * Suporta múltiplas disciplinas: Língua Inglesa (padrão), Língua Portuguesa e futuras.
 * Reutilizável em Turmas, Planejamento de Aula, Provas e Relatórios de Cobertura Curricular.
 */

export interface BnccSkill {
  id: string
  code: string
  gradeYear: string // "6º Fund.", "7º Fund.", "8º Fund.", "9º Fund.", "1º Médio", "2º Médio", "3º Médio"
  /** Matéria — 'EF_LI' = Língua Inglesa (padrão), 'EF_LP' = Língua Portuguesa, etc. */
  subject?: 'EF_LI' | 'EF_LP' | 'EF_MA' | 'EF_CI' | 'EF_HI' | 'EF_GE' | 'EF_AR' | 'EF_EF' | 'EF_ER' | 'EM_LGG' | string
  /** Eixo temático — varia por disciplina. Linguagens: Oralidade/Leitura/Escrita etc. */
  axis: 'Oralidade' | 'Leitura' | 'Escrita' | 'Conhecimentos Linguísticos' | 'Dimensão Intercultural'
    | 'Análise Linguística' | 'Produção de Textos'
    | 'Linguagens' | 'Matemática' | 'Ciências da Natureza' | 'Ciências Humanas'
    | 'Ensino Religioso' | string
  description: string
  unit?: string
  isCustom?: boolean
}

export const DEFAULT_BNCC_SKILLS: BnccSkill[] = [
  // ─── 6º ANO ENSINO FUNDAMENTAL (EF06LI01 a EF06LI26) ─────────────────────
  {
    id: 'EF06LI01',
    code: 'EF06LI01',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Interagir em situações de intercâmbio oral, demonstrando iniciativa para utilizar a língua inglesa.',
    unit: 'Interação discursiva'
  },
  {
    id: 'EF06LI02',
    code: 'EF06LI02',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Coletar informações do grupo, perguntando e respondendo sobre a família, os amigos, a escola e a comunidade.',
    unit: 'Interação discursiva'
  },
  {
    id: 'EF06LI03',
    code: 'EF06LI03',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Solicitar esclarecimentos em língua inglesa sobre o que não entendeu e o significado de palavras ou expressões desconhecidas.',
    unit: 'Interação discursiva'
  },
  {
    id: 'EF06LI04',
    code: 'EF06LI04',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Reconhecer, com o apoio de palavras cognatas e pistas do contexto discursivo, o assunto e as informações principais em textos orais sobre temas familiares.',
    unit: 'Compreensão oral'
  },
  {
    id: 'EF06LI05',
    code: 'EF06LI05',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Aplicar os conhecimentos da língua inglesa para falar de si e de outras pessoas, explicitando informações pessoais e características relacionadas a gostos, preferências e rotinas.',
    unit: 'Produção oral'
  },
  {
    id: 'EF06LI06',
    code: 'EF06LI06',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Planejar apresentação sobre a família, a comunidade e a escola, compartilhando-a oralmente com o grupo.',
    unit: 'Produção oral'
  },
  {
    id: 'EF06LI07',
    code: 'EF06LI07',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Formular hipóteses sobre a finalidade de um texto em língua inglesa, com base em sua estrutura, organização visual e pistas textuais.',
    unit: 'Estratégias de leitura'
  },
  {
    id: 'EF06LI08',
    code: 'EF06LI08',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Identificar o assunto de um texto, reconhecendo sua organização textual e palavras cognatas.',
    unit: 'Estratégias de leitura'
  },
  {
    id: 'EF06LI09',
    code: 'EF06LI09',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Localizar informações específicas em texto.',
    unit: 'Estratégias de leitura'
  },
  {
    id: 'EF06LI10',
    code: 'EF06LI10',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Conhecer a organização de um dicionário bilíngue (impresso e/ou on-line) para construir repertório lexical.',
    unit: 'Construção de repertório lexical'
  },
  {
    id: 'EF06LI11',
    code: 'EF06LI11',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Explorar ambientes virtuais e/ou aplicativos para construir repertório lexical na língua inglesa.',
    unit: 'Construção de repertório lexical'
  },
  {
    id: 'EF06LI12',
    code: 'EF06LI12',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Interessar-se pelo texto lido, compartilhando suas ideias sobre o que o texto informa/comunica.',
    unit: 'Atitudes e disposições do leitor'
  },
  {
    id: 'EF06LI13',
    code: 'EF06LI13',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Listar ideias para a produção de textos, levando em conta o tema e o assunto.',
    unit: 'Práticas de escrita'
  },
  {
    id: 'EF06LI14',
    code: 'EF06LI14',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Organizar ideias, selecionando-as em função da estrutura e do objetivo do texto.',
    unit: 'Práticas de escrita'
  },
  {
    id: 'EF06LI15',
    code: 'EF06LI15',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Produzir textos escritos em língua inglesa (histórias em quadrinhos, cartazes, chats, posts) sobre si mesmo e sua rotina.',
    unit: 'Práticas de escrita'
  },
  {
    id: 'EF06LI16',
    code: 'EF06LI16',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Construir repertório relativo às expressões usadas para o convívio social e o uso da língua inglesa em sala de aula.',
    unit: 'Estudo do léxico: Convívio social'
  },
  {
    id: 'EF06LI17',
    code: 'EF06LI17',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Construir repertório lexical relativo a temas familiares (escola, família, rotina diária, atividades de lazer, esportes, entre outros).',
    unit: 'Estudo do léxico: Temas familiares'
  },
  {
    id: 'EF06LI18',
    code: 'EF06LI18',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Reconhecer semelhanças e diferenças na pronúncia de palavras da língua inglesa e da língua materna e/ou outras línguas conhecidas.',
    unit: 'Estudo do léxico: Pronúncia'
  },
  {
    id: 'EF06LI19',
    code: 'EF06LI19',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar o presente do indicativo (Simple Present) para identificar pessoas e descrever rotinas diárias.',
    unit: 'Gramática: Simple Present'
  },
  {
    id: 'EF06LI20',
    code: 'EF06LI20',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar o presente contínuo (Present Continuous) para descrever ações em progresso.',
    unit: 'Gramática: Present Continuous'
  },
  {
    id: 'EF06LI21',
    code: 'EF06LI21',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Reconhecer o uso do imperativo em enunciados de atividades, comandos e instruções.',
    unit: 'Gramática: Imperativo'
  },
  {
    id: 'EF06LI22',
    code: 'EF06LI22',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Descrever relações por meio do uso de apóstrofo (\') + s (caso genitivo / possessivo).',
    unit: 'Gramática: Caso Genitivo (\'s)'
  },
  {
    id: 'EF06LI23',
    code: 'EF06LI23',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Empregar, de forma inteligível, os adjetivos possessivos.',
    unit: 'Gramática: Adjetivos Possessivos'
  },
  {
    id: 'EF06LI24',
    code: 'EF06LI24',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Dimensão Intercultural',
    description: 'Investigar o alcance da língua inglesa no mundo: como língua materna e/ou oficial (primeira ou segunda língua).',
    unit: 'A língua inglesa no mundo'
  },
  {
    id: 'EF06LI25',
    code: 'EF06LI25',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Dimensão Intercultural',
    description: 'Reconhecer a presença da língua inglesa na sociedade brasileira/comunidade e seu significado.',
    unit: 'Presença do Inglês no Cotidiano'
  },
  {
    id: 'EF06LI26',
    code: 'EF06LI26',
    gradeYear: '6º Fund.',
    subject: 'EF_LI',
    axis: 'Dimensão Intercultural',
    description: 'Avaliar, problematizando elementos/produtos culturais de países de língua inglesa absorvidos pela sociedade brasileira/comunidade.',
    unit: 'Comunicação intercultural'
  },

  // ─── 7º ANO ENSINO FUNDAMENTAL (EF07LI01 a EF07LI23) ─────────────────────
  {
    id: 'EF07LI01',
    code: 'EF07LI01',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Interagir em situações de intercâmbio oral para realizar as atividades em sala de aula, de forma respeitosa e colaborativa, trocando ideias e engajando-se em brincadeiras e jogos.',
    unit: 'Interação discursiva'
  },
  {
    id: 'EF07LI02',
    code: 'EF07LI02',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Entrevistar os colegas para conhecer suas histórias de vida.',
    unit: 'Interação discursiva'
  },
  {
    id: 'EF07LI03',
    code: 'EF07LI03',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Mobilizar conhecimentos prévios para compreender texto oral.',
    unit: 'Compreensão oral'
  },
  {
    id: 'EF07LI04',
    code: 'EF07LI04',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Identificar o contexto, a finalidade, o assunto e os interlocutores em textos orais presentes no cinema, na internet, na televisão, entre outros.',
    unit: 'Compreensão oral'
  },
  {
    id: 'EF07LI05',
    code: 'EF07LI05',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Compor, em língua inglesa, narrativas orais sobre fatos, acontecimentos e personalidades marcantes do passado.',
    unit: 'Produção oral'
  },
  {
    id: 'EF07LI06',
    code: 'EF07LI06',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Antecipar o sentido global de textos em língua inglesa por inferências com base em leitura rápida (skimming, scanning).',
    unit: 'Estratégias de leitura'
  },
  {
    id: 'EF07LI07',
    code: 'EF07LI07',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Identificar a(s) informação(ões)-chave de partes de um texto em língua inglesa (parágrafos).',
    unit: 'Estratégias de leitura'
  },
  {
    id: 'EF07LI08',
    code: 'EF07LI08',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Relacionar as partes de um texto (parágrafos) para construir seu sentido global.',
    unit: 'Estratégias de leitura'
  },
  {
    id: 'EF07LI09',
    code: 'EF07LI09',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Selecionar, em um texto, a informação desejada como objetivo de leitura.',
    unit: 'Estratégias de leitura'
  },
  {
    id: 'EF07LI10',
    code: 'EF07LI10',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Escolher, em ambientes virtuais, textos em língua inglesa, de fontes confiáveis, para estudos/pesquisas escolares.',
    unit: 'Práticas de leitura e fruição'
  },
  {
    id: 'EF07LI11',
    code: 'EF07LI11',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Participar de troca de opiniões e informações sobre textos, lidos na sala de aula ou em outros ambientes.',
    unit: 'Atitudes e disposições do leitor'
  },
  {
    id: 'EF07LI12',
    code: 'EF07LI12',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Planejar a escrita de textos em função do contexto (público, finalidade, layout e suporte).',
    unit: 'Planejamento textual'
  },
  {
    id: 'EF07LI13',
    code: 'EF07LI13',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Organizar texto em unidades de sentido, dividindo-o em parágrafos ou tópicos e subtópicos, explorando as possibilidades de organização gráfica, de suporte e de formato do texto.',
    unit: 'Práticas de escrita'
  },
  {
    id: 'EF07LI14',
    code: 'EF07LI14',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Produzir textos diversos sobre fatos, acontecimentos e personalidades do passado (linha do tempo/timelines, biografias, verbetes de enciclopédias, blogues, entre outros).',
    unit: 'Práticas de escrita'
  },
  {
    id: 'EF07LI15',
    code: 'EF07LI15',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Construir repertório lexical relativo a verbos regulares e irregulares no passado (Simple Past) para narrar fatos.',
    unit: 'Gramática: Simple Past'
  },
  {
    id: 'EF07LI16',
    code: 'EF07LI16',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Reconhecer a pronúncia de verbos regulares no passado (-ed).',
    unit: 'Estudo do léxico: Pronúncia do passado (-ed)'
  },
  {
    id: 'EF07LI17',
    code: 'EF07LI17',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Explorar o caráter polissêmico de palavras de acordo com o contexto de uso.',
    unit: 'Estudo do léxico: Polissemia'
  },
  {
    id: 'EF07LI18',
    code: 'EF07LI18',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar o passado simples e o passado contínuo para produzir textos orais e escritos, mostrando relações de sequência e causalidade.',
    unit: 'Gramática: Past Continuous e Sequência'
  },
  {
    id: 'EF07LI19',
    code: 'EF07LI19',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Discriminar sujeito de objeto utilizando pronomes a eles relacionados (subject and object pronouns).',
    unit: 'Gramática: Pronomes Sujeito e Objeto'
  },
  {
    id: 'EF07LI20',
    code: 'EF07LI20',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Empregar, de forma inteligível, o verbo modal can para descrever habilidades (no presente e no passado).',
    unit: 'Gramática: Verbo Modal Can'
  },
  {
    id: 'EF07LI21',
    code: 'EF07LI21',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Dimensão Intercultural',
    description: 'Analisar o alcance da língua inglesa e os seus contextos de uso no mundo globalizado.',
    unit: 'A língua inglesa no mundo'
  },
  {
    id: 'EF07LI22',
    code: 'EF07LI22',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Dimensão Intercultural',
    description: 'Explorar modos de falar em língua inglesa, refutando preconceitos e reconhecendo a variação linguística como fenômeno natural das línguas.',
    unit: 'Variação linguística'
  },
  {
    id: 'EF07LI23',
    code: 'EF07LI23',
    gradeYear: '7º Fund.',
    subject: 'EF_LI',
    axis: 'Dimensão Intercultural',
    description: 'Reconhecer a variação linguística como manifestação de formas de pensar e expressar o mundo.',
    unit: 'Variação linguística e cultura'
  },

  // ─── 8º ANO ENSINO FUNDAMENTAL (EF08LI01 a EF08LI20) ─────────────────────
  {
    id: 'EF08LI01',
    code: 'EF08LI01',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Fazer uso da língua inglesa para debater assuntos de interesse coletivo e escolar.',
    unit: 'Debate e argumentação'
  },
  {
    id: 'EF08LI02',
    code: 'EF08LI02',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Explorar o uso de recursos linguísticos e paralinguísticos em situações de interação oral.',
    unit: 'Interação discursiva'
  },
  {
    id: 'EF08LI03',
    code: 'EF08LI03',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Construir o sentido global de textos orais, relacionando suas partes, o assunto principal e informações relevantes.',
    unit: 'Compreensão oral'
  },
  {
    id: 'EF08LI04',
    code: 'EF08LI04',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Utilizar recursos e repertório linguísticos apropriados para informar/comunicar/falar do futuro.',
    unit: 'Produção oral: Futuro'
  },
  {
    id: 'EF08LI05',
    code: 'EF08LI05',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Reconhecer o tema principal, a tese e as ideias secundárias em textos argumentativos e jornalísticos.',
    unit: 'Leitura crítica'
  },
  {
    id: 'EF08LI06',
    code: 'EF08LI06',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Apreciar textos narrativos em língua inglesa (contos, romances, entre outros, em versão original ou simplificada), como forma de valorizar o patrimônio cultural produzido em língua inglesa.',
    unit: 'Práticas de leitura e fruição'
  },
  {
    id: 'EF08LI07',
    code: 'EF08LI07',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Explorar ambientes virtuais e/ou aplicativos para acessar e usufruir do patrimônio artístico literário em língua inglesa.',
    unit: 'Práticas de leitura e fruição'
  },
  {
    id: 'EF08LI08',
    code: 'EF08LI08',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Analisar, criticamente, o conteúdo de textos, comparando diferentes perspectivas apresentadas sobre um mesmo assunto.',
    unit: 'Leitura comparativa e crítica'
  },
  {
    id: 'EF08LI09',
    code: 'EF08LI09',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Avaliar a própria produção escrita e a de colegas, com base no contexto de comunicação (finalidade e adequação ao público, conteúdo a ser comunicado, organização textual, legibilidade, estrutura de frases).',
    unit: 'Estratégias de escrita: Avaliação por pares'
  },
  {
    id: 'EF08LI10',
    code: 'EF08LI10',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Reconstruir o texto, com cortes, acréscimos, reformulações e correções, para aprimoramento, edição e publicação final.',
    unit: 'Estratégias de escrita: Edição'
  },
  {
    id: 'EF08LI11',
    code: 'EF08LI11',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Produzir textos (comentários em fóruns, relatos pessoais, mensagens instantâneas, tweets, reportagens, histórias de ficção, blogues, entre outros), com o uso de estratégias de escrita, apontando sonhos e projetos para o futuro.',
    unit: 'Práticas de escrita: Projetos de futuro'
  },
  {
    id: 'EF08LI12',
    code: 'EF08LI12',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Construir repertório lexical relativo a planos, previsões e expectativas para o futuro.',
    unit: 'Estudo do léxico: Futuro'
  },
  {
    id: 'EF08LI13',
    code: 'EF08LI13',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Reconhecer sufixos e prefixos comuns utilizados na formação de palavras em língua inglesa.',
    unit: 'Estudo do léxico: Formação de palavras'
  },
  {
    id: 'EF08LI14',
    code: 'EF08LI14',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar formas verbais do futuro (will, going to, present continuous) para expressar planos, previsões e decisões.',
    unit: 'Gramática: Formas de Futuro'
  },
  {
    id: 'EF08LI15',
    code: 'EF08LI15',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar, de modo inteligível, as formas comparativas e superlativas de adjetivos para comparar qualidades e quantidades.',
    unit: 'Gramática: Comparativos e Superlativos'
  },
  {
    id: 'EF08LI16',
    code: 'EF08LI16',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar os quantificadores (much, many, a lot of, few, little) e comparativos/superlativos.',
    unit: 'Gramática: Quantificadores'
  },
  {
    id: 'EF08LI17',
    code: 'EF08LI17',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Empregar, de modo inteligível, os pronomes relativos (who, which, that, whose) para construir textos coesos.',
    unit: 'Gramática: Pronomes Relativos'
  },
  {
    id: 'EF08LI18',
    code: 'EF08LI18',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Construir repertório lexical relativo a planos, previsões e expectativas para o futuro.',
    unit: 'Vocabulário: Planos e Futuro'
  },
  {
    id: 'EF08LI19',
    code: 'EF08LI19',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Investigar de que forma expressões de uso recorrente e estruturas verbais da língua inglesa são utilizadas para falar sobre experiências passadas e presentes.',
    unit: 'Gramática: Experiências Passadas e Presentes'
  },
  {
    id: 'EF08LI20',
    code: 'EF08LI20',
    gradeYear: '8º Fund.',
    subject: 'EF_LI',
    axis: 'Dimensão Intercultural',
    description: 'Examinar fatores que podem impedir o entendimento entre pessoas de culturas diferentes que falam a língua inglesa.',
    unit: 'Comunicação intercultural'
  },

  // ─── 9º ANO ENSINO FUNDAMENTAL (EF09LI01 a EF09LI19) ─────────────────────
  {
    id: 'EF09LI01',
    code: 'EF09LI01',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Fazer uso da língua inglesa para expor pontos de vista, argumentos e contra-argumentos, considerando o contexto.',
    unit: 'Persuasão e opinião'
  },
  {
    id: 'EF09LI02',
    code: 'EF09LI02',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Compilar as ideias-chave de textos por meio de tomada de notas.',
    unit: 'Compreensão oral e notas'
  },
  {
    id: 'EF09LI03',
    code: 'EF09LI03',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Analisar posicionamentos defendidos e refutados em textos orais sobre temas de interesse social e coletivo.',
    unit: 'Argumentação oral'
  },
  {
    id: 'EF09LI04',
    code: 'EF09LI04',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Oralidade',
    description: 'Expor resultados de pesquisa ou estudo com o apoio de recursos (notas, gráficos, tabelas, etc.), adequando as estratégias de construção do texto oral aos objetivos de comunicação e ao contexto.',
    unit: 'Produção oral: Seminários'
  },
  {
    id: 'EF09LI05',
    code: 'EF09LI05',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Identificar recursos de persuasão (escolha de palavras, jogo de palavras, uso de cores e imagens, tamanho de letras) utilizados em textos publicitários e de propaganda como elementos de convencimento.',
    unit: 'Recursos persuasivos na publicidade'
  },
  {
    id: 'EF09LI06',
    code: 'EF09LI06',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Distinguir fatos de opiniões em textos argumentativos da esfera jornalística.',
    unit: 'Práticas de leitura: Fato vs. Opinião'
  },
  {
    id: 'EF09LI07',
    code: 'EF09LI07',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Identificar argumentos principais e as evidências ou exemplos que os sustentam em textos.',
    unit: 'Práticas de leitura e fruição'
  },
  {
    id: 'EF09LI08',
    code: 'EF09LI08',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Identificar os recursos de persuasão (escolha vocabular, pontuação, figuras de linguagem) em textos publicitários e editoriais.',
    unit: 'Recursos persuasivos'
  },
  {
    id: 'EF09LI09',
    code: 'EF09LI09',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Leitura',
    description: 'Compartilhar, com os colegas, a leitura dos textos escritos pelo grupo, valorizando os diferentes pontos de vista defendidos, com ética e respeito.',
    unit: 'Atitudes e disposições do leitor'
  },
  {
    id: 'EF09LI10',
    code: 'EF09LI10',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Propor potenciais argumentos para expor e defender pontos de vista em texto escrito, refletindo sobre o tema proposto e pesquisando dados, evidências e exemplos para sustentar os argumentos, organizando-os em sequência lógica.',
    unit: 'Práticas de escrita: Argumentação'
  },
  {
    id: 'EF09LI11',
    code: 'EF09LI11',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Utilizar recursos verbais e não verbais para construção da persuasão em textos da esfera publicitária, de forma adequada ao contexto de circulação (produção e compreensão).',
    unit: 'Práticas de escrita: Publicidade'
  },
  {
    id: 'EF09LI12',
    code: 'EF09LI12',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Produzir textos (infográficos, fóruns de discussão on-line, fotorreportagens, campanhas publicitárias, memes, entre outros) sobre temas de interesse coletivo local ou global, que revelem posicionamento crítico.',
    unit: 'Práticas de escrita: Mídias digitais'
  },
  {
    id: 'EF09LI13',
    code: 'EF09LI13',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Escrita',
    description: 'Reconhecer, nos novos gêneros digitais (blogues, mensagens instantâneas, tweets, entre outros), novas formas de escrita (abreviação de palavras, palavras com combinação de letras e números, pictogramas, símbolos gráficos, entre outros) na constituição das mensagens.',
    unit: 'Estratégias de escrita: Gêneros digitais'
  },
  {
    id: 'EF09LI14',
    code: 'EF09LI14',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Utilizar os conectores discursivos (linkers: however, although, therefore, furthermore) para estabelecer relações de causa, contraste e conclusão.',
    unit: 'Gramática: Conectivos Discursivos'
  },
  {
    id: 'EF09LI15',
    code: 'EF09LI15',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Empregar o Present Perfect (com since, for, already, yet) para expressar ações iniciadas no passado que continuam no presente.',
    unit: 'Gramática: Present Perfect'
  },
  {
    id: 'EF09LI16',
    code: 'EF09LI16',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Conhecimentos Linguísticos',
    description: 'Empregar as orações condicionais (First and Second Conditionals) para analisar hipóteses e consequências.',
    unit: 'Gramática: Condicionais (1st/2nd)'
  },
  {
    id: 'EF09LI17',
    code: 'EF09LI17',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Dimensão Intercultural',
    description: 'Debater sobre a expansão da língua inglesa pelo mundo, em função do processo de colonização nas Américas, África, Ásia e Oceania.',
    unit: 'A língua inglesa no mundo: História e Colonização'
  },
  {
    id: 'EF09LI18',
    code: 'EF09LI18',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Dimensão Intercultural',
    description: 'Analisar a importância da língua inglesa para o desenvolvimento das ciências (produção, divulgação e discussão de novos conhecimentos), da economia e da política no cenário mundial.',
    unit: 'A língua inglesa no mundo: Ciência e Economia'
  },
  {
    id: 'EF09LI19',
    code: 'EF09LI19',
    gradeYear: '9º Fund.',
    subject: 'EF_LI',
    axis: 'Dimensão Intercultural',
    description: 'Discutir a comunicação intercultural por meio da língua inglesa como língua franca em âmbito global.',
    unit: 'Inglês como Língua Franca'
  },

  // ─── ENSINO MÉDIO (1º AO 3º ANO — LINGUAGENS / LÍNGUA INGLESA) ──────────
  {
    id: 'EM13LGG101',
    code: 'EM13LGG101',
    gradeYear: '1º Médio',
    subject: 'EM_LGG',
    axis: 'Leitura',
    description: 'Compreender e analisar processos de produção e circulação de discursos, nas diferentes linguagens, para fazer escolhas fundamentadas em função de interesses pessoais e coletivos.',
    unit: 'Análise do Discurso e Mídia'
  },
  {
    id: 'EM13LGG102',
    code: 'EM13LGG102',
    gradeYear: '1º Médio',
    subject: 'EM_LGG',
    axis: 'Leitura',
    description: 'Analisar visões de mundo, conflitos de interesse, preconceitos e ideologias presentes nos discursos veiculados nas diferentes mídias em língua inglesa e outras linguagens.',
    unit: 'Leitura Crítica e Ideologia'
  },
  {
    id: 'EM13LGG103',
    code: 'EM13LGG103',
    gradeYear: '1º Médio',
    subject: 'EM_LGG',
    axis: 'Conhecimentos Linguísticos',
    description: 'Analisar o funcionamento das linguagens, para interpretar e produzir criticamente discursos em textos de diversas semioses (visuais, verbais, sonoras, gestuais).',
    unit: 'Multimodalidade e Semiótica'
  },
  {
    id: 'EM13LGG104',
    code: 'EM13LGG104',
    gradeYear: '1º Médio',
    subject: 'EM_LGG',
    axis: 'Oralidade',
    description: 'Utilizar as diferentes linguagens, levando em conta seus funcionamentos, para a compreensão e produção de textos em diversos campos de atuação social.',
    unit: 'Práticas Discursivas'
  },
  {
    id: 'EM13LGG105',
    code: 'EM13LGG105',
    gradeYear: '1º Médio',
    subject: 'EM_LGG',
    axis: 'Escrita',
    description: 'Analisar e experimentar diversos processos de remediação de produções multissemióticas, multimídia e transmídia.',
    unit: 'Remediação e Transmídia'
  },
  {
    id: 'EM13LGG201',
    code: 'EM13LGG201',
    gradeYear: '1º Médio',
    subject: 'EM_LGG',
    axis: 'Dimensão Intercultural',
    description: 'Utilizar as diversas linguagens em diferentes contextos, valorizando-as como fenômeno social, cultural, histórico, variável, heterogêneo e sensível aos contextos de uso.',
    unit: 'Linguagem como Prática Social'
  },
  {
    id: 'EM13LGG202',
    code: 'EM13LGG202',
    gradeYear: '2º Médio',
    subject: 'EM_LGG',
    axis: 'Leitura',
    description: 'Analisar interesses, relações de poder e perspectivas de mundo nos discursos das diversas práticas de linguagem.',
    unit: 'Relações de Poder e Discurso'
  },
  {
    id: 'EM13LGG204',
    code: 'EM13LGG204',
    gradeYear: '2º Médio',
    subject: 'EM_LGG',
    axis: 'Oralidade',
    description: 'Dialogar e produzir entendimento mútuo, nas diversas linguagens, com vistas ao interesse comum pautado em princípios e valores de equidade assentados na democracia e nos Direitos Humanos.',
    unit: 'Diálogo e Direitos Humanos'
  },
  {
    id: 'EM13LGG301',
    code: 'EM13LGG301',
    gradeYear: '2º Médio',
    subject: 'EM_LGG',
    axis: 'Escrita',
    description: 'Participar de processos de produção individual e colaborativa em diferentes linguagens, levando em conta suas formas e seus funcionamentos.',
    unit: 'Produção Textual Colaborativa'
  },
  {
    id: 'EM13LGG302',
    code: 'EM13LGG302',
    gradeYear: '2º Médio',
    subject: 'EM_LGG',
    axis: 'Dimensão Intercultural',
    description: 'Posicionar-se criticamente diante de diversas visões de mundo presentes nos discursos em língua inglesa e outras linguagens.',
    unit: 'Posicionamento Crítico'
  },
  {
    id: 'EM13LGG303',
    code: 'EM13LGG303',
    gradeYear: '2º Médio',
    subject: 'EM_LGG',
    axis: 'Oralidade',
    description: 'Debater questões polêmicas de relevância social, analisando diferentes argumentos e opiniões em língua inglesa, para formular, negociar e sustentar posições.',
    unit: 'Debate de Questões Polêmicas'
  },
  {
    id: 'EM13LGG401',
    code: 'EM13LGG401',
    gradeYear: '2º Médio',
    subject: 'EM_LGG',
    axis: 'Escrita',
    description: 'Analisar criticamente textos de divulgação científica, acadêmicos e jornalísticos em língua inglesa, produzindo resenhas, ensaios e artigos.',
    unit: 'Produção Acadêmica e Argumentativa'
  },
  {
    id: 'EM13LGG402',
    code: 'EM13LGG402',
    gradeYear: '3º Médio',
    subject: 'EM_LGG',
    axis: 'Oralidade',
    description: 'Empregar, nas interações sociais em língua inglesa, a variedade e o estilo de linguagem adequados à situação comunicativa, aos interlocutores e ao gênero do discurso.',
    unit: 'Registro e Estilo Comunicativo'
  },
  {
    id: 'EM13LGG403',
    code: 'EM13LGG403',
    gradeYear: '3º Médio',
    subject: 'EM_LGG',
    axis: 'Dimensão Intercultural',
    description: 'Fazer uso do inglês como língua de comunicação global, levando em conta a multiplicidade e variedade de usos, usuários e funções dessa língua no mundo contemporâneo.',
    unit: 'Inglês como Comunicação Global'
  },
  {
    id: 'EM13LGG604',
    code: 'EM13LGG604',
    gradeYear: '3º Médio',
    subject: 'EM_LGG',
    axis: 'Dimensão Intercultural',
    description: 'Relacionar as práticas de linguagem em língua inglesa às exigências do mundo do trabalho e exames vestibulares/ENEM.',
    unit: 'Inglês para Fins Acadêmicos e Profissionais'
  },
  {
    id: 'EM13LGG701',
    code: 'EM13LGG701',
    gradeYear: '3º Médio',
    subject: 'EM_LGG',
    axis: 'Escrita',
    description: 'Explorar tecnologias digitais da informação e comunicação (TDIC) em língua inglesa para produzir e divulgar discursos multimodais.',
    unit: 'Tecnologias Digitais e Criação'
  },
  {
    id: 'EM13LGG703',
    code: 'EM13LGG703',
    gradeYear: '3º Médio',
    subject: 'EM_LGG',
    axis: 'Escrita',
    description: 'Utilizar diferentes linguagens, mídias e ferramentas digitais em processos de produção coletiva e colaborativa internacional.',
    unit: 'Criação Digital Internacional'
  },
  {
    id: 'EM13LGG704',
    code: 'EM13LGG704',
    gradeYear: '3º Médio',
    subject: 'EM_LGG',
    axis: 'Leitura',
    description: 'Apropriar-se criticamente de processos de pesquisa e busca de informação em língua inglesa, por meio de ferramentas digitais e fontes confiáveis.',
    unit: 'Pesquisa e Letramento Digital'
  }
]

/**
 * Retorna as competências salvas ou a lista padrão inicial
 */
export function getStoredBnccSkills(): BnccSkill[] {
  if (typeof localStorage === 'undefined') return DEFAULT_BNCC_SKILLS
  try {
    const raw = localStorage.getItem('teacher_bncc_skills')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length >= DEFAULT_BNCC_SKILLS.length) return parsed
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Sincroniza e funde habilidades da matriz oficial completa sem perder customizações
        const existingCodes = new Set(parsed.map((s: BnccSkill) => s.code))
        const missing = DEFAULT_BNCC_SKILLS.filter(s => !existingCodes.has(s.code))
        const merged = [...parsed, ...missing]
        localStorage.setItem('teacher_bncc_skills', JSON.stringify(merged))
        return merged
      }
    }
    localStorage.setItem('teacher_bncc_skills', JSON.stringify(DEFAULT_BNCC_SKILLS))
    return DEFAULT_BNCC_SKILLS
  } catch {
    return DEFAULT_BNCC_SKILLS
  }
}

/**
 * Salva a lista personalizada de competências
 */
export function saveStoredBnccSkills(skills: BnccSkill[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem('teacher_bncc_skills', JSON.stringify(skills))
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('storage'))
  } catch {}
}

/**
 * Filtra competências por ano escolar / série
 */
export function getBnccSkillsForGrade(gradeYear: string): BnccSkill[] {
  const all = getStoredBnccSkills()
  if (!gradeYear || gradeYear === 'all') return all
  const cleanGrade = gradeYear.toLowerCase().replace(/ano|série/g, '').trim()
  return all.filter(s => s.gradeYear.toLowerCase().includes(cleanGrade) || gradeYear.toLowerCase().includes(s.gradeYear.toLowerCase()))
}

/**
 * Gerenciamento de Backlog de Habilidades Adiadas por Turma
 */
export function getClassPostponedSkills(classId: string): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(`teacher_backlog_skills_${classId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveClassPostponedSkills(classId: string, skillCodes: string[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(`teacher_backlog_skills_${classId}`, JSON.stringify(skillCodes))
  } catch {}
}

// ─── Habilidades BNCC — Língua Portuguesa (piloto A.3) ────────────────────────

export const PORTUGUESE_BNCC_SKILLS: BnccSkill[] = [
  // ─── 6º ANO ───────────────────────────────────────────────────────────────
  { id: 'EF06LP01', code: 'EF06LP01', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Estratégias de Leitura',
    description: 'Selecionar e utilizar, com ajuda do professor, estratégias de leitura (skimming, scanning, leitura detalhada) adequadas ao objetivo e ao gênero textual.' },
  { id: 'EF06LP06', code: 'EF06LP06', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Gêneros Textuais',
    description: 'Identificar o gênero textual com base em suas características composicionais (forma de organização interna, recursos linguísticos e marcas enunciativas).' },
  { id: 'EF06LP15', code: 'EF06LP15', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Produção de Textos', unit: 'Planejamento Textual',
    description: 'Planejar textos considerando o contexto de produção (finalidade, interlocutores, suporte, gênero), selecionando forma de tratamento e registro adequados.' },
  { id: 'EF06LP32', code: 'EF06LP32', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Morfologia',
    description: 'Identificar e classificar as classes de palavras (substantivos, adjetivos, verbos, artigos, pronomes, numerais, advérbios, preposições, conjunções e interjeições).' },
  { id: 'EF06LP33', code: 'EF06LP33', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Sintaxe',
    description: 'Reconhecer a estrutura básica da oração (sujeito e predicado) e a relação de concordância verbal e nominal.' },
  { id: 'EF06LP36', code: 'EF06LP36', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Semântica',
    description: 'Identificar sinonímia, antonímia e polissemia no texto, e compreender seus efeitos de sentido.' },
  { id: 'EF06LP38', code: 'EF06LP38', gradeYear: '6º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Ortografia e Acentuação',
    description: 'Empregar as regras básicas de acentuação gráfica (palavras oxítonas, paroxítonas e proparoxítonas) e o hífen.' },
  // ─── 7º ANO ───────────────────────────────────────────────────────────────
  { id: 'EF07LP01', code: 'EF07LP01', gradeYear: '7º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Estratégias de Leitura',
    description: 'Inferir, com base em dados do texto e do contexto, o sentido de palavras, expressões ou trechos desconhecidos.' },
  { id: 'EF07LP03', code: 'EF07LP03', gradeYear: '7º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Implícitos e Subentendidos',
    description: 'Identificar implícitos e pressupostos nos textos lidos, reconhecendo as diferentes vozes sociais que neles circulam.' },
  { id: 'EF07LP15', code: 'EF07LP15', gradeYear: '7º Fund.', subject: 'EF_LP',
    axis: 'Produção de Textos', unit: 'Planejamento Textual',
    description: 'Produzir textos em diferentes gêneros, considerando sua adequação ao contexto (tema, interlocutores, finalidade e suporte).' },
  { id: 'EF07LP31', code: 'EF07LP31', gradeYear: '7º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Sintaxe',
    description: 'Reconhecer e empregar os recursos de concordância verbal e nominal, emprego de pronomes e regência de verbos frequentes.' },
  // ─── 8º ANO ───────────────────────────────────────────────────────────────
  { id: 'EF08LP01', code: 'EF08LP01', gradeYear: '8º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Estratégias de Leitura',
    description: 'Fazer inferências e deduções em textos de maior complexidade, articulando conhecimentos prévios com os dados do texto.' },
  { id: 'EF08LP14', code: 'EF08LP14', gradeYear: '8º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Figuras de Linguagem',
    description: 'Identificar e analisar os efeitos de sentido provocados pelo uso de figuras de linguagem (metáfora, metonímia, hipérbole, ironia, eufemismo, antítese, paradoxo).' },
  { id: 'EF08LP16', code: 'EF08LP16', gradeYear: '8º Fund.', subject: 'EF_LP',
    axis: 'Produção de Textos', unit: 'Argumentação',
    description: 'Produzir textos argumentativos (artigo de opinião, editorial), apresentando tese, argumentos e contra-argumentos com uso de conectivos adequados.' },
  { id: 'EF08LP30', code: 'EF08LP30', gradeYear: '8º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Sintaxe',
    description: 'Empregar adequadamente as regras de regência verbal e nominal, colocação pronominal e emprego de crase.' },
  // ─── 9º ANO ───────────────────────────────────────────────────────────────
  { id: 'EF09LP01', code: 'EF09LP01', gradeYear: '9º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Estratégias de Leitura',
    description: 'Analisar diferentes textos de divulgação científica, artigos de opinião e textos literários, identificando argumentos, pressupostos e implícitos.' },
  { id: 'EF09LP09', code: 'EF09LP09', gradeYear: '9º Fund.', subject: 'EF_LP',
    axis: 'Leitura', unit: 'Figuras de Linguagem e Sentido',
    description: 'Analisar o efeito de sentido de figuras de linguagem (ironia, eufemismo, antítese, paradoxo) em textos literários e jornalísticos.' },
  { id: 'EF09LP15', code: 'EF09LP15', gradeYear: '9º Fund.', subject: 'EF_LP',
    axis: 'Produção de Textos', unit: 'Dissertação-Argumentativa',
    description: 'Produzir texto dissertativo-argumentativo em prosa, defendendo uma tese com argumentos consistentes, articulados e coerentes, e com proposta de intervenção.' },
  { id: 'EF09LP29', code: 'EF09LP29', gradeYear: '9º Fund.', subject: 'EF_LP',
    axis: 'Análise Linguística', unit: 'Sintaxe Avançada',
    description: 'Identificar e empregar orações subordinadas substantivas, adjetivas e adverbiais, reconhecendo os conectivos que as introduzem e os efeitos de sentido que produzem.' },
  { id: 'EF09LP26', code: 'EF09LP26', gradeYear: '9º Fund.', subject: 'EF_LP',
    axis: 'Oralidade', unit: 'Variação Linguística',
    description: 'Analisar, em textos orais e escritos, as marcas de variação linguística (regional, social, etária, de registro) e seus efeitos de sentido.' }
]

// ─── Índice Multi-Matéria ─────────────────────────────────────────────────────

/**
 * Retorna todas as habilidades BNCC de uma matéria específica.
 * subject: 'EF_LI' (Inglês, padrão), 'EF_LP' (Português), etc.
 */
export function getBnccSkillsBySubject(subject: 'EF_LI' | 'EF_LP' | string): BnccSkill[] {
  if (subject === 'EF_LP') return PORTUGUESE_BNCC_SKILLS
  // Padrão: retorna habilidades de inglês (comportamento original)
  return DEFAULT_BNCC_SKILLS
}

// ─── Relatório de Cobertura Curricular BNCC (Bloco A.5) ─────────────────────

export interface CurriculumCoverageReport {
  gradeYear: string
  totalSkills: number
  coveredCount: number
  postponedCount: number
  plannedCount: number
  uncoveredCount: number
  coveragePercentage: number
  byAxis: Record<string, { total: number; covered: number; percentage: number }>
  skillsDetail: Array<{
    code: string
    axis: string
    description: string
    status: 'covered' | 'postponed' | 'planned' | 'uncovered'
    coveredCount: number
    lastLessonDate?: string
  }>
}

export function getCurriculumCoverageReport(
  gradeYear: string,
  lessonPlans: Array<{ date: string; classId?: string; selectedSkills?: Array<{ code: string; desc?: string; status: string }> }>,
  classId?: string
): CurriculumCoverageReport {
  const allGradeSkills = getBnccSkillsForGrade(gradeYear)
  const filteredPlans = classId ? lessonPlans.filter(p => p.classId === classId) : lessonPlans
  
  const skillOccurrences = new Map<string, { count: number; lastDate: string; status: 'covered' | 'postponed' | 'planned' }>()

  filteredPlans.forEach(plan => {
    if (Array.isArray(plan.selectedSkills)) {
      plan.selectedSkills.forEach(s => {
        const existing = skillOccurrences.get(s.code)
        const currentCount = (existing?.count || 0) + (s.status === 'covered' ? 1 : 0)
        skillOccurrences.set(s.code, {
          count: currentCount,
          lastDate: plan.date || existing?.lastDate || '',
          status: s.status as any
        })
      })
    }
  })

  // Se tiver backlog salvo na turma
  const postponedBacklog = classId ? getClassPostponedSkills(classId) : []

  const byAxis: Record<string, { total: number; covered: number; percentage: number }> = {}
  let coveredCount = 0
  let postponedCount = 0
  let plannedCount = 0

  const skillsDetail = allGradeSkills.map(skill => {
    const axis = skill.axis || 'Geral'
    if (!byAxis[axis]) {
      byAxis[axis] = { total: 0, covered: 0, percentage: 0 }
    }
    byAxis[axis].total++

    const record = skillOccurrences.get(skill.code)
    let status: 'covered' | 'postponed' | 'planned' | 'uncovered' = 'uncovered'

    if (postponedBacklog.includes(skill.code)) {
      status = 'postponed'
      postponedCount++
    } else if (record) {
      if (record.status === 'covered' || record.count > 0) {
        status = 'covered'
        coveredCount++
        byAxis[axis].covered++
      } else if (record.status === 'postponed') {
        status = 'postponed'
        postponedCount++
      } else {
        status = 'planned'
        plannedCount++
      }
    }

    return {
      code: skill.code,
      axis,
      description: skill.description,
      status,
      coveredCount: record?.count || 0,
      lastLessonDate: record?.lastDate
    }
  })

  // Calcula percentuais por eixo
  Object.keys(byAxis).forEach(axis => {
    const item = byAxis[axis]
    item.percentage = item.total > 0 ? Math.round((item.covered / item.total) * 100) : 0
  })

  const totalSkills = allGradeSkills.length
  const uncoveredCount = totalSkills - coveredCount - postponedCount - plannedCount
  const coveragePercentage = totalSkills > 0 ? Math.round((coveredCount / totalSkills) * 100) : 0

  return {
    gradeYear,
    totalSkills,
    coveredCount,
    postponedCount,
    plannedCount,
    uncoveredCount: Math.max(0, uncoveredCount),
    coveragePercentage,
    byAxis,
    skillsDetail
  }
}

// ─── Re-export do Motor de Inferência Automática ─────────────────────────────
export { inferBnccSkillsForTopic, normalizeGradeYear } from './bnccInference'
