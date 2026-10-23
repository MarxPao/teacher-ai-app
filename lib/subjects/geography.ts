/**
 * subjects/geography.ts — Perfil de Geografia
 *
 * Fundamentos epistemológicos:
 *   - Espaço Geográfico como Instância Social — Milton Santos (1996)
 *   - A Produção do Espaço e o Lugar — Ana Fani Carlos (2007)
 *   - Raciocínio Geográfico e Cartografia Escolar — Sonia Castellar (2017), Cavalcanti (2012)
 *   - BNCC Geografia (MEC, 2018) — 5 unidades temáticas
 */

import { SubjectProfile, registerSubjectProfile } from '@/lib/subjectProfile'

const geographyProfile: SubjectProfile = {
  id: 'geography',
  name: 'Geografia',
  nameShort: 'Geog.',
  examLanguage: 'pt-BR',

  taxonomy: [
    {
      id: 'sujeito_lugar',
      name: 'O Sujeito e seu Lugar no Mundo',
      icon: 'ti-map-pin',
      subcategories: [
        { id: 'lugar_identidade', name: 'Lugar, Vivência e Identidade Socioespacial', bnccCodes: ['EF06GE01', 'EF07GE01'] },
        { id: 'comunidades_tradicionais', name: 'Territórios Indígenas, Quilombolas e Ribeirinhos', bnccCodes: ['EF07GE03', 'EF08GE04'] },
      ]
    },
    {
      id: 'conexoes_escalas',
      name: 'Conexões e Escalas',
      icon: 'ti-arrows-split-2',
      subcategories: [
        { id: 'redes_fluxos', name: 'Redes de Transporte, Comunicação e Comércio', bnccCodes: ['EF06GE04', 'EF07GE08'] },
        { id: 'migracoes_fronteiras', name: 'Migrações Nacionais, Internacionais e Fronteiras', bnccCodes: ['EF07GE02', 'EF08GE01'] },
        { id: 'geopolitica_blocos', name: 'Geopolítica Mundial, Conflitos e Organismos Internacionais', bnccCodes: ['EF08GE05', 'EF09GE06'] },
      ]
    },
    {
      id: 'mundo_trabalho_espaco',
      name: 'Mundo do Trabalho e Produção do Espaço',
      icon: 'ti-building-factory-2',
      subcategories: [
        { id: 'urbanizacao_metropole', name: 'Processo de Urbanização, Segregação e Metropolização', bnccCodes: ['EF07GE04', 'EF09GE02'] },
        { id: 'agropecuaria_industria', name: 'Agronegócio, Agricultura Familiar e Industrialização', bnccCodes: ['EF07GE05', 'EF08GE14'] },
      ]
    },
    {
      id: 'formas_representacao',
      name: 'Formas de Representação e Pensamento Espacial',
      icon: 'ti-map',
      subcategories: [
        { id: 'alfabetizacao_cartografica', name: 'Cartografia: Escalas, Projeções e Coordenadas', bnccCodes: ['EF06GE08', 'EF06GE09'] },
        { id: 'sig_sensoriamento', name: 'Sensoriamento Remoto, Imagens de Satélite e SIG', bnccCodes: ['EF07GE10', 'EF08GE18'] },
      ]
    },
    {
      id: 'natureza_sociedade',
      name: 'Natureza, Ambientes e Qualidade de Vida',
      icon: 'ti-trees',
      subcategories: [
        { id: 'relevo_clima_bacias', name: 'Dinâmica da Litosfera, Hidrosfera e Climas', bnccCodes: ['EF06GE10', 'EF06GE11'] },
        { id: 'biomas_impactos', name: 'Domínios Morfoclimáticos, Desmatamento e Justiça Climática', bnccCodes: ['EF07GE11', 'EF08GE23'] },
      ]
    }
  ],

  levelFramework: {
    name: 'Ano Escolar BNCC',
    levels: [
      {
        id: '6ano',
        label: '6º Ano — EF',
        gatingRules: `6º ANO ENSINO FUNDAMENTAL (GEOGRAFIA):
- Conceitos estruturantes: paisagem, espaço, lugar e território em escala local e vivencial.
- Cartografia básica: pontos cardeais, coordenadas geográficas (latitude/longitude) e leitura de escalas simples.
- Dinâmica física da Terra: agentes internos/externos do relevo e bacias hidrográficas.
- PROIBIDO: geopolítica complexa da Guerra Fria e análise quantitativa de balança comercial internacional.`
      },
      {
        id: '7ano',
        label: '7º Ano — EF',
        gatingRules: `7º ANO ENSINO FUNDAMENTAL (GEOGRAFIA):
- Formação territorial e diversidade regional do Brasil (divisão oficial IBGE e complexos geoeconômicos).
- Demografia brasileira, urbanização, desigualdades socioespaciais e biomas brasileiros.
- PROIBIDO: análise aprofundada de continentes estrangeiros e modelos econométricos globais.`
      },
      {
        id: '8ano',
        label: '8º Ano — EF',
        gatingRules: `8º ANO ENSINO FUNDAMENTAL (GEOGRAFIA):
- O espaço mundial: continentes americano e africano, processos de colonização e dependência econômica.
- Geopolítica: conceitos de Estado, Nação, Território, País e Governo (conforme EF08GE05); fluxos migratórios.
- PROIBIDO: análise monográfica da União Europeia ou tensões geopolíticas asiáticas (foco no 9º ano).`
      },
      {
        id: '9ano',
        label: '9º Ano — EF',
        gatingRules: `9º ANO ENSINO FUNDAMENTAL (GEOGRAFIA):
- Europa, Ásia e Oceania: disparidades socioeconômicas, tensões étnico-nacionais e poder global.
- Globalização, corporações transnacionais, impactos socioambientais planetários e a nova ordem mundial.
- PROIBIDO: discussões de teoria do espaço puro desvinculadas das dinâmicas concretas contemporâneas.`
      },
      {
        id: 'em',
        label: 'Ensino Médio',
        gatingRules: `ENSINO MÉDIO (GEOGRAFIA):
- Epistemologia geográfica, teorias de ordenamento territorial, transição energética e geopolítica de recursos estratégicos.
- Conflitos territoriais contemporâneos, migrações de refúgio e vulnerabilidades climáticas extremas.`
      }
    ]
  },

  distractorPatterns: [
    {
      id: 'geo_escala_cartografica_invertida',
      pattern: 'Inversão conceitual de escala cartográfica (grande vs pequena)',
      examples: ['Achar que 1:1.000.000 é uma escala grande porque o número é grande', 'Confundir escala com riqueza de detalhes'],
      pedagogicNote: 'O aluno confunde a magnitude do denominador fracionário com o grau de detalhamento do mapa.'
    },
    {
      id: 'geo_determinismo_geografico',
      pattern: 'Determinismo geográfico simplista',
      examples: ['Afirmar que a pobreza de uma região é causada exclusivamente pelo clima árido', 'Tratar a prosperidade como resultado direto da latitude temperada'],
      pedagogicNote: 'Ignora condicionantes socioeconômicos e históricos na produção das desigualdades territoriais.'
    },
    {
      id: 'geo_paisagem_espaco_confusao',
      pattern: 'Redução do espaço geográfico à paisagem visual estática',
      examples: ['Descrever um espaço unicamente pelos elementos visíveis sem considerar relações de trabalho ou fluxos invisíveis', 'Ignorar conflitos territoriais que não deixam marcas plásticas na paisagem'],
      pedagogicNote: 'Confunde o perceptível sensorial momentâneo com a totalidade das relações socioespaciais.'
    },
    {
      id: 'geo_estado_nacao_confusao',
      pattern: 'Confusão terminológica entre Estado, Nação, Território e Governo',
      examples: ['Tratar Nação e Estado como sinônimos perfeitos em qualquer contexto', 'Afirmar que um povo sem território formal não constitui uma nação'],
      pedagogicNote: 'Não diferencia a dimensão jurídica institucional (Estado) do sentimento identitário-cultural (Nação).'
    }
  ],

  presentationTriad: {
    name: 'Espaço-Escala-Sociedade',
    components: ['Espaço Geográfico (Configuração Territorial)', 'Escala de Análise (Local ao Global)', 'Dinâmica Social (Atores e Tensões Socioambientais)'],
    promptDirective: 'Em conformidade com Milton Santos (1996) e Ana Fani Carlos (2007), a análise geográfica deve articular a configuração do Espaço Geográfico (formas e objetos técnicos), a variação da Escala de análise (do local ao global) e a ação contraditória da Sociedade (sujeitos e fluxos de poder).'
  },

  timeBalanceMetric: {
    primaryMetric: 'IET_AET',
    teacherRoleLabel: 'Tempo de Instrução Expositiva (IET)',
    studentRoleLabel: 'Tempo de Atividade Efetiva (AET)',
    targetRatio: { teacherMax: 35, studentMin: 65 },
    pedagogicalRationale: 'A cartografia temática e a investigação espacial requerem prática ativa de decodificação de mapas e dados geográficos pelos estudantes (AET >= 65%).'
  },

  udlScaffolding: {
    perception: [
      'Mapas táteis e com legendas cromáticas de alto contraste (acessibilidade a daltonismo)',
      'Camadas analíticas transparentes em SIG e imagens de satélite multitemporais',
      'Infográficos geográficos dinâmicos combinando relevo 3D e climogramas interativos'
    ],
    expression: [
      'Produção de croquis cartográficos colaborativos, storymaps digitais e podcasts socioespaciais',
      'Relatórios visuais de estudo do meio e planos de intervenção urbana comunitária',
      'Debates estruturados no formato de audiência pública ambiental'
    ],
    engagement: [
      'Investigação de desafios socioespaciais do próprio bairro (enchentes, ilhas de calor, transporte)',
      'Estudos de caso reais de conservação ambiental e movimentos sociais territoriais'
    ]
  },

  scopeProfile: {
    targetStages: ['fundamental_2', 'ensino_medio'],
    defaultEmSequence: 'traditional_series'
  },

  provenance: {
    theoreticalFoundations: ['Geografia Crítica (Espaço como Produção Social)', 'Didática do Raciocínio Geográfico', 'Cartografia Escolar Emancipatória'],
    pedagogicalReferences: [
      'Santos, M. (1996). A Natureza do Espaço: Técnica e Tempo, Razão e Emoção. Hucitec.',
      'Carlos, A. F. A. (2007). O Espaço no Fim de Século. Contexto.',
      'Castellar, S. (2017). Cartografia Escolar e o Pensamento Espacial. Terra Livre.',
      'Cavalcanti, L. S. (2012). O Ensino de Geografia na Escola. Papirus.'
    ],
    authors: ['Milton Santos', 'Ana Fani Alessandri Carlos', 'Sonia Castellar', 'Lana de Souza Cavalcanti']
  },

  specialRenderers: {
    hasMapsOrCartography: true
  },

  recommendedFrameworkIds: ['geo_estudo_meio_analise_espacial', 'geo_cartografia_tematica_ativa', 'geo_julgamento_simulado_socioambiental'],
  gatingRuleIds: ['GEO-G-6-001', 'GEO-G-7-001', 'GEO-G-8-001', 'GEO-G-9-001'],

  agentSystemPromptSnippet: `Você domina a Taxonomia de Geografia alinhada à BNCC (5 eixos: Sujeito e Lugar, Conexões e Escalas, Mundo do Trabalho, Representações Espaciais, Natureza e Sociedade).
Aplica a tríade Espaço-Escala-Sociedade (Milton Santos), articulando raciocínio geográfico da escala local à global.
Supera ativamente o determinismo geográfico, a confusão de escala cartográfica e o viés estático de paisagem.
Prioriza o pensamento espacial crítico e a justiça socioambiental.`,

  bnccSkillIds: [
    'EF06GE01', 'EF06GE03', 'EF06GE04', 'EF06GE08', 'EF06GE09', 'EF06GE10', 'EF06GE11',
    'EF07GE01', 'EF07GE02', 'EF07GE03', 'EF07GE04', 'EF07GE05', 'EF07GE06', 'EF07GE08', 'EF07GE10', 'EF07GE11',
    'EF08GE01', 'EF08GE04', 'EF08GE05', 'EF08GE14', 'EF08GE18', 'EF08GE23',
    'EF09GE01', 'EF09GE02', 'EF09GE06',
    'EM13CHS103', 'EM13CHS206'
  ]
}

registerSubjectProfile(geographyProfile)

export default geographyProfile
