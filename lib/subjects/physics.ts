/**
 * subjects/physics.ts — Perfil de Física
 *
 * Fundamentos epistemológicos:
 *   - Raciocínio Espontâneo em Dinâmica e Força — Laurence Viennot (1979)
 *   - Modelagem no Ensino de Física (Modeling Instruction) — David Hestenes (1987), Halloun (2004)
 *   - Teoria da Aprendizagem Significativa em Física — Marco Antonio Moreira (2018)
 *   - BNCC Ciências da Natureza — Ensino Médio (MEC, 2018)
 */

import { SubjectProfile, registerSubjectProfile } from '@/lib/subjectProfile'

const physicsProfile: SubjectProfile = {
  id: 'physics',
  name: 'Física',
  nameShort: 'Fís.',
  examLanguage: 'pt-BR',

  taxonomy: [
    {
      id: 'mecanica',
      name: 'Mecânica Newtoniana',
      icon: 'ti-activity',
      subcategories: [
        { id: 'cinematica', name: 'Cinemática Escalar e Vetorial (MRU, MRUV, MCU)', bnccCodes: ['EM13CNT101'] },
        { id: 'leis_newton', name: 'Leis de Newton e Forças Fundamentais (Atrito, Peso, Tração, Normal)', bnccCodes: ['EM13CNT102', 'EM13CNT204'] },
        { id: 'energia_trabalho', name: 'Trabalho, Energia Mecânica e Teoremas de Conservação', bnccCodes: ['EM13CNT101', 'EM13CNT301'] },
        { id: 'impulso_gravitacao', name: 'Impulso, Quantidade de Movimento e Gravitação Universal', bnccCodes: ['EM13CNT204'] },
      ]
    },
    {
      id: 'termodinamica',
      name: 'Termodinâmica e Física Térmica',
      icon: 'ti-flame',
      subcategories: [
        { id: 'termometria_calorimetria', name: 'Temperatura, Escalas Termométricas e Calorimetria', bnccCodes: ['EM13CNT102'] },
        { id: 'leis_termodinamica', name: 'Leis da Termodinâmica, Máquinas Térmicas e Entropia', bnccCodes: ['EM13CNT102', 'EM13CNT302'] },
      ]
    },
    {
      id: 'ondulatoria_optica',
      name: 'Ondulatória e Óptica',
      icon: 'ti-wave-sine',
      subcategories: [
        { id: 'movimento_ondulatorio', name: 'Propagação de Ondas, Interferência, Difração e Acústica', bnccCodes: ['EF09CI05', 'EM13CNT106'] },
        { id: 'optica_geometrica', name: 'Reflexão, Refração, Lentes e Espelhos', bnccCodes: ['EM13CNT106', 'EM13CNT307'] },
      ]
    },
    {
      id: 'eletromagnetismo',
      name: 'Eletricidade e Magnetismo',
      icon: 'ti-bolt',
      subcategories: [
        { id: 'eletrostatica_circuitos', name: 'Carga Elétrica, Campo Elétrico, Corrente e Circuitos (Leis de Ohm)', bnccCodes: ['EF08CI02', 'EM13CNT307'] },
        { id: 'magnetismo_inducao', name: 'Campo Magnético, Força Magnética e Indução Eletromagnética (Faraday)', bnccCodes: ['EM13CNT307'] },
      ]
    },
    {
      id: 'fisica_moderna',
      name: 'Física Moderna e Contemporânea',
      icon: 'ti-atom-2',
      subcategories: [
        { id: 'relatividade_quantica', name: 'Relatividade Restrita, Efeito Fotoelétrico e Dualidade Onda-Partícula', bnccCodes: ['EM13CNT301', 'EM13CNT307'] },
      ]
    }
  ],

  levelFramework: {
    name: 'Sequência Curricular Física',
    levels: [
      {
        id: 'em1',
        label: '1ª Série — Ensino Médio',
        gatingRules: `1ª SÉRIE DO ENSINO MÉDIO (FÍSICA - MECÂNICA):
- Cinemática escalar e vetorial, Leis de Newton, forças de contato e campo.
- Conservação da energia mecânica e da quantidade de movimento.
- PROIBIDO: Leis da termodinâmica formal, circuitos elétricos complexos e física quântica.`
      },
      {
        id: 'em2',
        label: '2ª Série — Ensino Médio',
        gatingRules: `2ª SÉRIE DO ENSINO MÉDIO (FÍSICA - TÉRMICA, ONDAS E ÓPTICA):
- Calorimetria, dilatação térmica, Leis da Termodinâmica e máquinas térmicas.
- Movimento ondulatório, equação fundamental da onda, óptica geométrica e formação de imagens.
- PROIBIDO: Eletromagnetismo de Maxwell e relatividade especial.`
      },
      {
        id: 'em3',
        label: '3ª Série — Ensino Médio',
        gatingRules: `3ª SÉRIE DO ENSINO MÉDIO (FÍSICA - ELETROMAGNETISMO E MODERNA):
- Eletrostática, eletrodinâmica (resistores, geradores, Leis de Kirchhoff), campo magnético e indução.
- Física moderna: radiação de corpo negro, efeito fotoelétrico e introdução à relatividade.
- PROIBIDO: mecânica quântica avançada com formalismo diferencial de Schrödinger.`
      }
    ]
  },

  distractorPatterns: [
    {
      id: 'fis_impetus_movimento',
      pattern: 'Concepção de impetus buridaniano (força necessária para manter a velocidade)',
      examples: ['Afirmar que um projétil no ar mantém força para frente aplicada pela mão', 'Dizer que se um corpo se move, deve haver uma força resultante no sentido do movimento'],
      pedagogicNote: 'Confunde o conceito de inércia (1ª Lei de Newton) com a teoria medieval do impetus de Buridan.'
    },
    {
      id: 'fis_normal_peso_reacao',
      pattern: 'Tratar Força Normal e Peso como par de Ação e Reação',
      examples: ['Afirmar que o peso de um bloco na mesa é anulado pela sua reação, que seria a força normal', 'Achar que N e P sempre têm intensidades idênticas'],
      pedagogicNote: 'Ignora que pares de ação e reação agem em corpos distintos e decorrem da mesma interação fundamental.'
    },
    {
      id: 'fis_calor_temperatura_confusao',
      pattern: 'Confusão entre calor (energia em trânsito) e temperatura (grau de agitação)',
      examples: ['Dizer que um corpo contém muito calor guardado', 'Afirmar que um cobertor produz calor'],
      pedagogicNote: 'Trata o calor como substância estática (resquício da teoria do calórico) em vez de transferência de energia.'
    },
    {
      id: 'fis_corrente_consumo',
      pattern: 'Concepção de desgaste ou consumo da corrente elétrica no circuito',
      examples: ['Achar que a corrente que volta ao polo negativo da bateria é menor do que a que sai do positivo', 'Dizer que as lâmpadas consomem elétrons'],
      pedagogicNote: 'Viola o princípio da conservação da carga elétrica em nós e ramos de circuitos fechados.'
    }
  ],

  presentationTriad: {
    name: 'Fenômeno-Modelo-Formalismo',
    components: ['Fenômeno Físico (Observação Real/Experimento)', 'Modelo Conceitual (Representação Vetorial/Diagramas)', 'Formalismo Matemático (Equações e Leis)'],
    promptDirective: 'Em conformidade com Viennot (1979) e Hestenes (1987), toda aula de física deve iniciar na observação do Fenômeno qualitativo concreto, avançar pela construção do Modelo físico conceitual (diagramas de corpo livre, vetores) antes de introduzir o Formalismo algébrico matemático. Jamais começar aplicando fórmulas sem modelo prévio.'
  },

  timeBalanceMetric: {
    primaryMetric: 'IET_AET',
    teacherRoleLabel: 'Tempo de Instrução Expositiva (IET)',
    studentRoleLabel: 'Tempo de Atividade Efetiva (AET)',
    targetRatio: { teacherMax: 30, studentMin: 70 },
    pedagogicalRationale: 'A modelagem física e os experimentos de Prever-Observar-Explicar (POE) exigem manipulação e investigação ativa pelos estudantes (AET >= 70%).'
  },

  udlScaffolding: {
    perception: [
      'Simulações interativas PhET com vetores e gráficos plotados em tempo real',
      'Gravações em câmera lenta de colisões mecânicas, oscilações e propagação de ondas',
      'Diagramas de corpo livre com cores codificadas por agente e tipo de força'
    ],
    expression: [
      'Construção de diagramas de forças, esquemas de circuitos e gráficos experimentais',
      'Relatórios no formato POE (Prever - Observar - Explicar) estruturados',
      'Resolução de problemas abertos com argumentação física em múltiplas etapas'
    ],
    engagement: [
      'Desafios de engenharia prática (pontes de macarrão, foguetes de garrafa pet, circuitos caseiros)',
      'Análise física de acidentes automobilísticos reais e estratégias de segurança no trânsito'
    ]
  },

  scopeProfile: {
    targetStages: ['ensino_medio'],
    defaultEmSequence: 'traditional_series',
    scienceClassification: 'physics'
  },

  provenance: {
    theoreticalFoundations: ['Modelagem no Ensino de Física (Modeling Instruction)', 'Epistemologia do Raciocínio Espontâneo', 'Aprendizagem Significativa em Ciências'],
    pedagogicalReferences: [
      'Viennot, L. (1979). Spontaneous Reasoning in Elementary Dynamics. European Journal of Science Education.',
      'Hestenes, D. (1987). Toward a Modeling Theory of Physics Instruction. American Journal of Physics.',
      'Halloun, I. A. (2004). Modeling Theory in Science Education. Springer.',
      'Moreira, M. A. (2018). Aprendizagem Significativa: a teoria e textos complementares. Editora Livraria da Física.'
    ],
    authors: ['Laurence Viennot', 'David Hestenes', 'Ibrahim Halloun', 'Marco Antonio Moreira']
  },

  specialRenderers: {
    hasMathJaxOrLatex: true
  },

  recommendedFrameworkIds: ['fis_poe_prever_observar_explicar', 'fis_modelagem_investigativa', 'fis_experimento_demonstrativo_disrupcao'],
  gatingRuleIds: ['FIS-G-EM-001'],

  agentSystemPromptSnippet: `Você domina a Taxonomia de Física alinhada à BNCC e a modelagem conceitual (Fenômeno-Modelo-Formalismo).
Renderiza equações estritamente em LaTeX/KaTeX formatado ($...$).
Combate ativamente concepções alternativas centrais: impetus medieval de Buridan, Normal e Peso como par de ação/reação, confusão calor/temperatura e consumo de corrente elétrica.
Prioriza o método POE (Prever-Observar-Explicar) e o desenho de diagramas de corpo livre antes de qualquer cálculo numérico.`,

  bnccSkillIds: [
    'EF09CI01', 'EF09CI02', 'EF09CI03', 'EF09CI05',
    'EM13CNT101', 'EM13CNT102', 'EM13CNT106', 'EM13CNT204', 'EM13CNT301', 'EM13CNT302', 'EM13CNT307'
  ]
}

registerSubjectProfile(physicsProfile)

export default physicsProfile
