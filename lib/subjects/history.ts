/**
 * subjects/history.ts — Perfil de História
 *
 * Fundamentos epistemológicos:
 *   - Método Histórico e Crítica Documental — Marc Bloch (1949), Febvre (1953)
 *   - Consciência Histórica e Didática da História — Jörn Rüsen (2001), Schmidt (2017)
 *   - Educação Histórica e Superação do Anacronismo — Cerri (2011), Lee (2005)
 *   - BNCC História (MEC, 2018)
 */

import { SubjectProfile, registerSubjectProfile } from '@/lib/subjectProfile'

const historyProfile: SubjectProfile = {
  id: 'history',
  name: 'História',
  nameShort: 'Hist.',
  examLanguage: 'pt-BR',

  taxonomy: [
    {
      id: 'tempo_espaco',
      name: 'Tempo, Espaço e Periodização Histórica',
      icon: 'ti-clock',
      subcategories: [
        { id: 'fontes_historicas', name: 'Fontes Históricas e Métodos de Pesquisa', bnccCodes: ['EF06HI01', 'EF06HI02'] },
        { id: 'periodizacao_tempo', name: 'Temporalidades, Calendários e Periodizações', bnccCodes: ['EF06HI01', 'EF07HI01'] },
        { id: 'mudancas_permanencias', name: 'Mudanças e Permanências Históricas', bnccCodes: ['EF07HI02', 'EF08HI01'] },
      ]
    },
    {
      id: 'cultura_trabalho',
      name: 'Mundo do Trabalho, Cultura e Sociedade',
      icon: 'ti-users',
      subcategories: [
        { id: 'sociedades_antigas', name: 'Sociedades Antigas e Trabalho Compulsório', bnccCodes: ['EF06HI04', 'EF06HI07'] },
        { id: 'escravidao_resistencia', name: 'Escravidão Moderna, Tráfico e Resistência Negra e Indígena', bnccCodes: ['EF07HI13', 'EF07HI15', 'EF08HI14'] },
        { id: 'industrializacao_operariado', name: 'Revolução Industrial e Movimentos Operários', bnccCodes: ['EF08HI03', 'EF08HI04'] },
        { id: 'sociedade_consumo', name: 'Cultura de Massa, Consumo e Mídias', bnccCodes: ['EF09HI18', 'EM13CHS102'] },
      ]
    },
    {
      id: 'poder_politica',
      name: 'Relações de Poder, Cidadania e Estado',
      icon: 'ti-building-bank',
      subcategories: [
        { id: 'cidadania_democracia', name: 'Cidadania na Antiguidade Clássica vs Contemporaneidade', bnccCodes: ['EF06HI10', 'EF06HI12'] },
        { id: 'monarquias_absolutismo', name: 'Absolutismo e Formação dos Estados Nacionais', bnccCodes: ['EF07HI07'] },
        { id: 'revolucoes_independencias', name: 'Iluminismo, Revoluções Burguesas e Independências Americanas', bnccCodes: ['EF08HI06', 'EF08HI07'] },
        { id: 'brasil_imperio_republica', name: 'Brasil: Império, Proclamação da República e Ditaduras', bnccCodes: ['EF08HI15', 'EF09HI01', 'EF09HI19'] },
      ]
    },
    {
      id: 'patrimonio_memoria',
      name: 'Patrimônio, Memória e Direitos Humanos',
      icon: 'ti-award',
      subcategories: [
        { id: 'patrimonio_material_imaterial', name: 'Patrimônio Histórico, Material e Imaterial', bnccCodes: ['EF06HI03', 'EF07HI17'] },
        { id: 'memoria_esquecimento', name: 'Lugares de Memória e Tensões Sociais', bnccCodes: ['EF09HI05', 'EM13CHS601'] },
        { id: 'direitos_humanos', name: 'Lutas por Direitos Civis, Indígenas e Feministas', bnccCodes: ['EF09HI23', 'EM13CHS502'] },
      ]
    }
  ],

  levelFramework: {
    name: 'Ano Escolar BNCC',
    levels: [
      {
        id: '6ano',
        label: '6º Ano — EF',
        gatingRules: `6º ANO ENSINO FUNDAMENTAL (HISTÓRIA):
- Origens da humanidade, povoamento da América, conceito de fonte histórica e temporalidades.
- Sociedades do Oriente Médio antigo, Grécia e Roma antigas (conceito inicial de pólis e cidadania).
- PROIBIDO: análise estrutural de revoluções modernas, teorias historiográficas marxistas/positivistas formais.`
      },
      {
        id: '7ano',
        label: '7º Ano — EF',
        gatingRules: `7º ANO ENSINO FUNDAMENTAL (HISTÓRIA):
- Passagem do Medievo à Modernidade europeia, Renascimento e Reformas Religiosas.
- Povos indígenas americanos, reinos africanos pré-coloniais, invasão mercantil e colonização luso-espanhola.
- PROIBIDO: análise do imperialismo do século XIX e regimes totalitários do século XX.`
      },
      {
        id: '8ano',
        label: '8º Ano — EF',
        gatingRules: `8º ANO ENSINO FUNDAMENTAL (HISTÓRIA):
- Iluminismo, Revolução Francesa, Revolução Industrial e Independência dos EUA e colônias espanholas.
- Brasil: vinda da família real, Independência, Primeiro Reinado, Período Regencial e Segundo Reinado.
- PROIBIDO: Guerra Fria, bipolaridade e ditaduras civis-militares da América Latina (reservadas ao 9º ano).`
      },
      {
        id: '9ano',
        label: '9º Ano — EF',
        gatingRules: `9º ANO ENSINO FUNDAMENTAL (HISTÓRIA):
- Primeira República no Brasil (coronelismo e revoltas), Era Vargas e Segunda Guerra Mundial.
- Guerra Fria, Ditadura Civil-Militar brasileira (1964-1985), processo de redemocratização e Nova República.
- PROIBIDO: debates historiográficos de teoria pura desprovidos de lastro documental factual.`
      },
      {
        id: 'em',
        label: 'Ensino Médio',
        gatingRules: `ENSINO MÉDIO (HISTÓRIA):
- Teoria da história, crítica hermenêutica de fontes e historiografia comparada.
- Globalização, tensões geopolíticas contemporâneas, disputas de memória e direitos humanos.`
      }
    ]
  },

  distractorPatterns: [
    {
      id: 'his_anacronismo_moral',
      pattern: 'Anacronismo moral e retrospectivo',
      examples: ['Julgar ações do século XVI com normas éticas e jurídicas do século XXI', 'Atribuir visão contemporânea de direitos humanos a monarcas absolutistas'],
      pedagogicNote: 'O estudante projeta valores contemporâneos sobre agentes históricos passados ignorando os horizontes de época.'
    },
    {
      id: 'his_teleologia_inevitabilidade',
      pattern: 'Teleologia e determinismo do progresso inevitável',
      examples: ['Afirmar que a proclamação da República no Brasil era um destino histórico traçado', 'Tratar a Revolução Francesa como evento planejado do início ao fim'],
      pedagogicNote: 'Ignora a contingência, as disputas em aberto e as alternativas históricas derrotadas.'
    },
    {
      id: 'his_eurocentrismo_difusionista',
      pattern: 'Eurocentrismo e perspectiva difusionista linear',
      examples: ['Descrever os povos indígenas e africanos como agentes passivos que apenas receberam a civilização europeia', 'Ignorar avanços científicos pré-colombianos e africanos'],
      pedagogicNote: 'Trata a Europa como único sujeito histórico ativo da modernidade.'
    },
    {
      id: 'his_heroismo_monocausal',
      pattern: 'História dos grandes vultos heroicos e monocausalidade',
      examples: ['Atribuir a independência do Brasil exclusivamente à coragem de D. Pedro I', 'Explicar a Segunda Guerra Mundial unicamente pela mente de Hitler'],
      pedagogicNote: 'Reduz processos estruturais complexos à vontade de líderes isolados.'
    }
  ],

  presentationTriad: {
    name: 'Fato-Fontes-Interpretação',
    components: ['Fato Histórico (Acontecimento Contextualizado)', 'Fontes Primárias (Vestígios Documentais)', 'Interpretação Historiográfica (Multiperspectividade)'],
    promptDirective: 'Em conformidade com Marc Bloch (1949) e Jörn Rüsen (2001), toda aula de história deve estruturar-se na triangulação obrigatória: o Fato histórico contextualizado temporalmente, as Fontes documentais primárias submetidas à crítica externa/interna, e a pluralidade de Interpretações historiográficas sem anacronismo.'
  },

  timeBalanceMetric: {
    primaryMetric: 'IET_AET',
    teacherRoleLabel: 'Tempo de Instrução Expositiva (IET)',
    studentRoleLabel: 'Tempo de Atividade Efetiva (AET)',
    targetRatio: { teacherMax: 35, studentMin: 65 },
    pedagogicalRationale: 'A oficina do historiador exige que os estudantes analisem fontes primárias e debatam interpretações ativamente (AET >= 65%).'
  },

  udlScaffolding: {
    perception: [
      'Fontes primárias transcritas acompanhadas de notas lexicais para termos arcaicos',
      'Iconografias históricas de alta resolução com roteiro de leitura visual estruturado',
      'Linhas do tempo interativas relacionando eventos locais, nacionais e mundiais'
    ],
    expression: [
      'Produção de dossiês documentais investigativos, podcasts narrativos e dramatizações de debates históricos',
      'Elaboração de mapas históricos mentais e charges analíticas',
      'Debates orais estruturados no modelo tribunal da história'
    ],
    engagement: [
      'Conexões investigativas entre fontes documentais do passado e dilemas do presente',
      'Valorização da história local, patrimônio do bairro e narrativas de grupos sub-representados'
    ]
  },

  scopeProfile: {
    targetStages: ['fundamental_2', 'ensino_medio'],
    defaultEmSequence: 'traditional_series'
  },

  provenance: {
    theoreticalFoundations: ['Escola dos Annales (História-Problema)', 'Teoria da Consciência Histórica', 'Crítica Hermenêutica de Fontes'],
    pedagogicalReferences: [
      'Bloch, M. (1949). Apologia da História ou o Ofício do Historiador. Zahar.',
      'Rüsen, J. (2001). Razão Histórica: Teoria da História. Editora UnB.',
      'Schmidt, M. A. (2017). Ensinar História: Fundamentos e Metodologias. Vozes.',
      'Cerri, L. F. (2011). Ensino de História e Consciência Histórica. FGV.'
    ],
    authors: ['Marc Bloch', 'Jörn Rüsen', 'Maria Auxiliadora Schmidt', 'Luis Fernando Cerri']
  },

  specialRenderers: {
    hasHistoricalTimelines: true
  },

  recommendedFrameworkIds: ['his_oficina_historiador', 'his_debate_interpretacoes_conflitantes', 'his_estudo_caso_microhistoria'],
  gatingRuleIds: ['HIS-G-6-001', 'HIS-G-7-001', 'HIS-G-8-001', 'HIS-G-9-001'],

  agentSystemPromptSnippet: `Você domina a Taxonomia de História alinhada à BNCC (4 eixos: Tempo/Espaço, Cultura/Trabalho, Poder/Política, Patrimônio/Memória).
Aplica rigorosamente o método da Oficina do Historiador (Fato-Fontes-Interpretação), confrontando fontes primárias com rigor hermenêutico.
Rejeita estritamente o anacronismo moral, o eurocentrismo e a visão teleológica/heroica de grandes vultos.
Temas sensíveis são tratados com pluralidade documental e neutralidade pedagógica fundamentada.`,

  bnccSkillIds: [
    'EF06HI01', 'EF06HI02', 'EF06HI03', 'EF06HI04', 'EF06HI07', 'EF06HI10', 'EF06HI12',
    'EF07HI01', 'EF07HI02', 'EF07HI07', 'EF07HI13', 'EF07HI15', 'EF07HI17',
    'EF08HI01', 'EF08HI03', 'EF08HI04', 'EF08HI06', 'EF08HI07', 'EF08HI14', 'EF08HI15',
    'EF09HI01', 'EF09HI05', 'EF09HI10', 'EF09HI18', 'EF09HI19', 'EF09HI23',
    'EM13CHS101', 'EM13CHS102', 'EM13CHS502', 'EM13CHS601'
  ]
}

registerSubjectProfile(historyProfile)

export default historyProfile
