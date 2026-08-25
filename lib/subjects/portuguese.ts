/**
 * subjects/portuguese.ts — Perfil de Língua Portuguesa
 *
 * Piloto A.3: primeiro perfil de matéria não-inglês.
 * Contém:
 *   - Taxonomia LP alinhada aos eixos BNCC (Oralidade, Leitura, Escrita, Análise Linguística)
 *   - Framework de nível: Ano Escolar BNCC (6º-9º Ano EF + Ensino Médio)
 *   - 18 distratores diagnósticos reais documentados na literatura de ensino de LP
 *   - Rubrica de Produção de Texto (5 Competências ENEM adaptada para EF)
 *   - Habilidades BNCC EF06LP..EF09LP selecionadas
 *
 * Referências pedagógicas:
 *   - BNCC Língua Portuguesa EF (MEC, 2018), p. 87-158
 *   - Bechara, E. (2009). Moderna Gramática Portuguesa.
 *   - Perini, M.A. (2010). Gramática do Português Brasileiro.
 *   - Travaglia, L.C. (2009). Gramática e Interação.
 *   - Geraldi, J.W. (1997). Portos de Passagem.
 *   - Guia de Redação ENEM (INEP, 2024) — adaptação para EF.
 */

import { SubjectProfile, registerSubjectProfile } from '@/lib/subjectProfile'

const portugueseProfile: SubjectProfile = {
  id: 'portuguese',
  name: 'Língua Portuguesa',
  nameShort: 'LP',
  examLanguage: 'pt-BR',

  // ─── Taxonomia BNCC LP (4 eixos × subcategorias) ─────────────────────────
  taxonomy: [
    {
      id: 'leitura',
      name: 'Leitura e Escuta',
      icon: 'ti-align-left',
      subcategories: [
        { id: 'estrategias_leitura', name: 'Estratégias de Leitura (Skimming, Scanning, Inferência)', bnccCodes: ['EF06LP01', 'EF07LP01', 'EF08LP01', 'EF09LP01'] },
        { id: 'generos_textuais', name: 'Gêneros Textuais e Suporte', bnccCodes: ['EF06LP06', 'EF07LP06'] },
        { id: 'intertextualidade', name: 'Intertextualidade e Interdiscursividade', bnccCodes: ['EF09LP03'] },
        { id: 'implicitos', name: 'Implícitos, Pressupostos e Subentendidos', bnccCodes: ['EF07LP03', 'EF08LP03'] },
        { id: 'figuras_linguagem', name: 'Figuras de Linguagem e Sentido Conotativo', bnccCodes: ['EF08LP14', 'EF09LP09'] },
      ]
    },
    {
      id: 'escrita',
      name: 'Produção de Textos',
      icon: 'ti-notebook',
      subcategories: [
        { id: 'planejamento_textual', name: 'Planejamento e Produção Textual', bnccCodes: ['EF06LP15', 'EF07LP15', 'EF08LP15', 'EF09LP15'] },
        { id: 'coesao_coerencia', name: 'Coesão e Coerência Textual', bnccCodes: ['EF06LP16', 'EF07LP16'] },
        { id: 'argumentacao', name: 'Argumentação e Dissertação', bnccCodes: ['EF08LP16', 'EF09LP16'] },
        { id: 'revisao_reescrita', name: 'Revisão e Reescrita', bnccCodes: ['EF06LP18', 'EF07LP18'] },
      ]
    },
    {
      id: 'oralidade',
      name: 'Oralidade',
      icon: 'ti-microphone',
      subcategories: [
        { id: 'seminario_debate', name: 'Seminário, Debate e Discussão', bnccCodes: ['EF06LP22', 'EF07LP22'] },
        { id: 'exposicao_oral', name: 'Exposição Oral e Registro', bnccCodes: ['EF08LP22'] },
        { id: 'analise_discurso', name: 'Análise de Discurso Oral', bnccCodes: ['EF09LP22'] },
      ]
    },
    {
      id: 'analise_linguistica',
      name: 'Análise Linguística / Semiótica',
      icon: 'ti-code',
      subcategories: [
        { id: 'morfologia', name: 'Morfologia (Clases de Palavras, Flexão)', bnccCodes: ['EF06LP32', 'EF07LP30'] },
        { id: 'sintaxe', name: 'Sintaxe (Concordância, Regência, Pontuação)', bnccCodes: ['EF06LP33', 'EF07LP31', 'EF08LP30', 'EF09LP29'] },
        { id: 'ortografia', name: 'Ortografia e Acentuação Gráfica', bnccCodes: ['EF06LP38', 'EF07LP36'] },
        { id: 'semantica', name: 'Semântica (Sinonímia, Antonímia, Polissemia)', bnccCodes: ['EF06LP36', 'EF07LP34'] },
        { id: 'variacao_linguistica', name: 'Variação Linguística (Registro, Dialeto, Norma)', bnccCodes: ['EF06LP26', 'EF09LP26'] },
      ]
    }
  ],

  // ─── Framework de Nível: Ano Escolar BNCC ────────────────────────────────
  levelFramework: {
    name: 'Ano Escolar BNCC',
    levels: [
      {
        id: '6ano',
        label: '6º Ano — EF',
        wordLimits: { min: 80, max: 200 },
        gatingRules: `6º ANO ENSINO FUNDAMENTAL:
- Textos de 80 a 200 palavras. Vocabulário do cotidiano e experiências próximas.
- Gêneros prioritários: conto, fábula, notícia, carta, tirinha, infográfico simples.
- Gramática: classes de palavras (substantivo, adjetivo, verbo, artigo), pontuação básica (ponto, vírgula, ponto de interrogação), ortografia regular.
- PROIBIDO: argumentação formal, dissertação, estruturas sintáticas complexas (inversão, aposto explicativo elaborado).
- Nível cognitivo predominante: Lembrar e Compreender.`
      },
      {
        id: '7ano',
        label: '7º Ano — EF',
        wordLimits: { min: 150, max: 300 },
        gatingRules: `7º ANO ENSINO FUNDAMENTAL:
- Textos de 150 a 300 palavras. Ampliação para contextos sociais e culturais.
- Gêneros prioritários: crônica, poema, reportagem, relato, artigo de opinião curto.
- Gramática: concordância verbal e nominal básica, uso de vírgula em adjuntos adverbiais, pronomes (pessoais, demonstrativos, relativos simples).
- Nível cognitivo predominante: Compreender e Aplicar.`
      },
      {
        id: '8ano',
        label: '8º Ano — EF',
        wordLimits: { min: 200, max: 400 },
        gatingRules: `8º ANO ENSINO FUNDAMENTAL:
- Textos de 200 a 400 palavras. Contextos argumentativos e análise de linguagem.
- Gêneros prioritários: artigo de opinião, editorial, conto literário, texto dramático.
- Gramática: regência verbal e nominal, colocação pronominal, uso de crase (básico), vozes verbais (ativa/passiva), figuras de linguagem.
- Nível cognitivo predominante: Aplicar e Analisar.`
      },
      {
        id: '9ano',
        label: '9º Ano — EF',
        wordLimits: { min: 250, max: 500 },
        gatingRules: `9º ANO ENSINO FUNDAMENTAL:
- Textos de 250 a 500 palavras. Análise crítica e produção argumentativa.
- Gêneros prioritários: dissertação-argumentativa, análise literária, ensaio, debate formal.
- Gramática: crase (todos os casos), pontuação avançada (travessão, ponto-e-vírgula), período composto (subordinação e coordenação), discurso direto e indireto.
- Nível cognitivo predominante: Analisar e Avaliar.`
      },
      {
        id: 'em',
        label: 'Ensino Médio',
        wordLimits: { min: 300, max: 700 },
        gatingRules: `ENSINO MÉDIO:
- Textos de 300 a 700 palavras. Pleno domínio da norma culta e produção autoral.
- Gêneros: dissertação-argumentativa ENEM, artigo científico, análise literária, proposta de intervenção.
- Gramática: domínio pleno de sintaxe (orações reduzidas, participiais, gerundivas), coesão sequencial e referencial, operadores argumentativos.
- Nível cognitivo: Analisar, Avaliar e Criar.`
      }
    ]
  },

  // ─── 18 Distratores Diagnósticos Documentados (Erros Conceituais LP) ────────
  distractorPatterns: [
    {
      id: 'conc_verbal_composto',
      pattern: 'Concordância verbal com sujeito composto anteposto ao verbo',
      examples: ['"João e Maria foi à escola"', '"O professor e a aluna chegou cedo"'],
      pedagogicNote: 'Sujeito composto antes do verbo exige plural. Distrator: usar singular (erro frequente).'
    },
    {
      id: 'conc_partitivo',
      pattern: 'Concordância com sujeito partitivo (maioria, metade, parte)',
      examples: ['"A maioria dos alunos estavam ausentes"', '"Metade dos livros foram doados"'],
      pedagogicNote: 'Com partitivos, o verbo pode concordar com o núcleo do sujeito ou com o complemento. Distrator: apresentar apenas uma forma como correta quando ambas são aceitas.'
    },
    {
      id: 'regencia_assistir',
      pattern: 'Regência do verbo assistir',
      examples: ['"Assisti o filme" (errado)', '"Assisti ao filme" (correto — bitransitivo, regência com preposição A)'],
      pedagogicNote: '"Assistir" como ver/presenciar é bitransitivo e exige preposição A. Distrator: omitir a preposição.'
    },
    {
      id: 'regencia_chegar',
      pattern: 'Regência do verbo chegar/ir (preposições A vs EM)',
      examples: ['"Cheguei em casa" (informal)', '"Cheguei a casa" (norma culta)'],
      pedagogicNote: 'Na norma culta, chegar e ir regem preposição A, não EM. Distrator: usar EM como alternativa correta.'
    },
    {
      id: 'colocacao_negacao',
      pattern: 'Próclise obrigatória após palavras de negação',
      examples: ['"Não me disse nada" (correto)', '"Não disse-me nada" (errado)'],
      pedagogicNote: 'Após advérbio de negação, o pronome deve ser proclítico. Distrator: apresentar ênclise como correta.'
    },
    {
      id: 'colocacao_inicio',
      pattern: 'Ênclise em início de oração (proibida)',
      examples: ['"Me disseram a verdade" (informal/errado na norma culta)', '"Disseram-me a verdade" (correto)'],
      pedagogicNote: 'Em início de oração, a próclise é proibida na norma culta, mas o distrator frequente é apresentar o pronome antes do verbo.'
    },
    {
      id: 'crase_feminino',
      pattern: 'Crase obrigatória antes de substantivo feminino precedido de preposição A',
      examples: ['"Fui a escola" (errado)', '"Fui à escola" (correto)'],
      pedagogicNote: 'Antes de feminino que aceita artigo definido e após verbo que rege preposição A. Distrator: omitir o acento.'
    },
    {
      id: 'crase_proibida',
      pattern: 'Crase proibida antes de substantivos masculinos e verbos',
      examples: ['"Fui à pé" (errado)', '"Fui a pé" (correto)'],
      pedagogicNote: 'Não há crase antes de masculino sem artigo ou antes de verbos. Distrator: inserir o acento.'
    },
    {
      id: 'mas_mais',
      pattern: 'Distinção entre "mas" (conjunção adversativa) e "mais" (advérbio/adjetivo de quantidade)',
      examples: ['"Quero mais, mas não posso"', '"Quero mas não posso" (errado — falta mais)'],
      pedagogicNote: '"Mas" = porém/contudo; "mais" = quantidade/grau. Distrator frequente em questões de completar lacunas.'
    },
    {
      id: 'onde_aonde',
      pattern: 'Uso de "onde" (lugar estático) vs "aonde" (movimento/destino)',
      examples: ['"A escola onde estudo fica perto"', '"A escola aonde vou fica perto" (correto — movimento)'],
      pedagogicNote: '"Onde" = localização estática; "aonde" = destino de movimento. Distrator: usar "onde" indistintamente.'
    },
    {
      id: 'porque_formas',
      pattern: 'Distinção entre "porque", "por que", "porquê" e "por quê"',
      examples: [
        '"Porque" = explicação/resposta',
        '"Por que" = pergunta (= por qual razão)',
        '"Porquê" (s.) = o motivo',
        '"Por quê" = fim de frase interrogativa'
      ],
      pedagogicNote: 'Erro de alta frequência. Distratores: trocar as quatro formas em contextos específicos.'
    },
    {
      id: 'virgula_adverbial',
      pattern: 'Vírgula obrigatória após adjunto adverbial anteposto longo',
      examples: ['"No próximo bimestre, os alunos farão prova."', '"No próximo bimestre os alunos farão prova" (ausência aceitável para curtos)'],
      pedagogicNote: 'Adjuntos adverbiais antepostos longos exigem vírgula. Para curtos, é facultativa. Distrator: apresentar a versão sem vírgula como errada.'
    },
    {
      id: 'aposto_explicativo',
      pattern: 'Vírgula no aposto explicativo',
      examples: ['"Einstein, o físico alemão, revolucionou a ciência."', '"Einstein o físico alemão revolucionou..." (errado)'],
      pedagogicNote: 'Aposto explicativo é isolado por vírgulas. Distrator: omitir uma ou as duas vírgulas.'
    },
    {
      id: 'mau_mal',
      pattern: 'Distinção entre "mau" (adjetivo) e "mal" (advérbio)',
      examples: ['"Ele é um mau aluno" (adjetivo)', '"Ele se saiu mal na prova" (advérbio)'],
      pedagogicNote: '"Mau" qualifica substantivo; "mal" modifica verbo ou adjetivo. Distrator: substituição nas duas posições.'
    },
    {
      id: 'paralelismo',
      pattern: 'Paralelismo sintático em estruturas coordenadas',
      examples: ['"Ele gosta de ler, escrever e que estudem" (errado)', '"Ele gosta de ler, escrever e estudar" (correto)'],
      pedagogicNote: 'Estruturas coordenadas exigem mesma classe gramatical. Distrator: misturar infinitivos com orações subordinadas.'
    },
    {
      id: 'denotacao_conotacao',
      pattern: 'Denotação vs Conotação em textos literários',
      examples: ['"Ela tinha um coração de pedra" (conotação/metáfora)', '"A pedra caiu no chão" (denotação)'],
      pedagogicNote: 'Questões de múltipla escolha com texto literário frequentemente pedem distinção entre sentido literal e figurado.'
    },
    {
      id: 'voz_passiva',
      pattern: 'Voz passiva analítica e sintética',
      examples: ['"O livro foi lido por ela" (passiva analítica)', '"Leu-se o livro" (passiva sintética com SE apassivador)'],
      pedagogicNote: 'Distrator: confundir passiva com voz ativa ou com reflexivo. "Ele se machucou" ≠ voz passiva.'
    },
    {
      id: 'periodo_composto',
      pattern: 'Relações lógicas no período composto (subordinação vs coordenação)',
      examples: [
        '"Embora estudasse, não passou" (concessiva — ideia contrária)',
        '"Porque estudou, passou" (causal — relação de causa)'
      ],
      pedagogicNote: 'Distratores: trocar conectivos de sentidos opostos (concessivo/causal/condicional) em questões de interpretação.'
    }
  ],

  // ─── Rubrica de Produção de Texto (adaptada das 5 Competências ENEM para EF) ──
  essayRubric: [
    {
      id: 'comp1_dominio_escrita',
      name: 'Competência 1 — Domínio da Norma Culta',
      maxScore: 5,
      descriptors: {
        '5': 'Demonstra excelente domínio da norma culta escrita formal. Desvios gramaticais e de convenções da escrita são raros e não comprometem a comunicação.',
        '4': 'Demonstra bom domínio da norma culta. Poucos desvios gramaticais ou de convenções que não comprometem a comunicação.',
        '3': 'Demonstra domínio médio da norma culta. Desvios gramaticais e de convenções que não comprometem a comunicação.',
        '2': 'Demonstra domínio insuficiente da norma culta. Desvios gramaticais e de convenções frequentes.',
        '1': 'Demonstra domínio precário da norma culta. Desvios gramaticais graves e frequentes.',
        '0': 'Desconhecimento da norma culta da língua escrita formal.'
      }
    },
    {
      id: 'comp2_compreensao_tema',
      name: 'Competência 2 — Compreensão da Proposta e Adequação ao Tema',
      maxScore: 5,
      descriptors: {
        '5': 'Desenvolve o tema de forma completa e consistente, atendendo plenamente à proposta.',
        '4': 'Desenvolve o tema de forma consistente, atendendo à proposta.',
        '3': 'Desenvolve o tema, mas de forma previsível. Atende parcialmente à proposta.',
        '2': 'Desenvolve o tema de forma tangencial. Cumpre parcialmente a proposta.',
        '1': 'Apresenta domínio precário do tema. Fuga parcial à proposta.',
        '0': 'Fuga ao tema ou não atendimento à proposta. Sem texto.'
      }
    },
    {
      id: 'comp3_argumentacao',
      name: 'Competência 3 — Seleção e Organização das Informações',
      maxScore: 5,
      descriptors: {
        '5': 'Apresenta informações, fatos e opiniões de forma consistente e organizada em defesa de um ponto de vista.',
        '4': 'Apresenta informações com consistência e organização em defesa de um ponto de vista, com indícios de autoria.',
        '3': 'Apresenta informações e defende um ponto de vista, mas de forma pouco consistente.',
        '2': 'Apresenta informações de forma limitada, sem defesa clara de um ponto de vista.',
        '1': 'Apresenta informações sem relação com o tema ou sem organização.',
        '0': 'Não apresenta informações ou argumentação.'
      }
    },
    {
      id: 'comp4_coesao',
      name: 'Competência 4 — Coesão e Coerência Textual',
      maxScore: 5,
      descriptors: {
        '5': 'Articula as partes do texto com repertório diversificado de recursos coesivos, sem repetições excessivas.',
        '4': 'Articula as partes do texto com repertório diversificado de recursos coesivos, com algumas repetições.',
        '3': 'Articula as partes do texto com recursos coesivos adequados, com algumas rupturas.',
        '2': 'Articula as partes do texto com poucos recursos coesivos e rupturas de coerência.',
        '1': 'Articula as partes do texto com recursos coesivos inadequados e muitas rupturas.',
        '0': 'Ausência de articulação entre as partes do texto.'
      }
    },
    {
      id: 'comp5_proposta',
      name: 'Competência 5 — Proposta de Intervenção ou Conclusão',
      maxScore: 5,
      descriptors: {
        '5': 'Elabora uma proposta de intervenção ou conclusão detalhada, articulada com a discussão e respeitando os direitos humanos.',
        '4': 'Elabora uma proposta de intervenção ou conclusão articulada com a discussão.',
        '3': 'Elabora uma proposta de intervenção ou conclusão relacionada ao tema.',
        '2': 'Elabora uma proposta de intervenção ou conclusão parcialmente relacionada ao tema.',
        '1': 'Apresenta proposta de intervenção ou conclusão vaga.',
        '0': 'Não apresenta proposta de intervenção ou conclusão.'
      }
    }
  ],

  agentSystemPromptSnippet: `Você domina a Taxonomia de Língua Portuguesa alinhada à BNCC, com 4 eixos pedagógicos:
1. Leitura e Escuta (Estratégias de Leitura, Gêneros Textuais, Intertextualidade, Figuras de Linguagem)
2. Produção de Textos (Planejamento, Coesão/Coerência, Argumentação, Dissertação-argumentativa)
3. Oralidade (Seminário, Debate, Exposição Oral)
4. Análise Linguística/Semiótica (Morfologia, Sintaxe, Concordância, Regência, Pontuação, Ortografia, Semântica)
Framework de nível: Ano Escolar BNCC (6º ao 9º Ano EF + Ensino Médio).
Erros diagnósticos prioritários: concordância verbal/nominal, regência, colocação pronominal, crase, conectivos adversativos/concessivos/causais, denotação vs conotação.`,

  bnccSkillIds: [
    // 6º Ano
    'EF06LP01', 'EF06LP06', 'EF06LP15', 'EF06LP16', 'EF06LP18',
    'EF06LP22', 'EF06LP26', 'EF06LP32', 'EF06LP33', 'EF06LP36', 'EF06LP38',
    // 7º Ano
    'EF07LP01', 'EF07LP03', 'EF07LP06', 'EF07LP15', 'EF07LP16',
    'EF07LP18', 'EF07LP22', 'EF07LP30', 'EF07LP31', 'EF07LP34', 'EF07LP36',
    // 8º Ano
    'EF08LP01', 'EF08LP03', 'EF08LP14', 'EF08LP15', 'EF08LP16',
    'EF08LP22', 'EF08LP30',
    // 9º Ano
    'EF09LP01', 'EF09LP03', 'EF09LP09', 'EF09LP15', 'EF09LP16',
    'EF09LP22', 'EF09LP26', 'EF09LP29'
  ]
}

// Auto-registra ao importar
registerSubjectProfile(portugueseProfile)

export default portugueseProfile
