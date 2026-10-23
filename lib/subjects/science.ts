/**
 * subjects/science.ts — Perfil de Ciências (Ensino Fundamental II - 6º ao 9º Ano)
 *
 * Fundamentos epistemológicos:
 *   - Ensino de Ciências por Investigação (ENCI) — Anna Maria Pessoa de Carvalho (2013)
 *   - Construção do Conhecimento Científico na Escola — Rosalind Driver et al. (1994)
 *   - Argumentação e Episteme Científica — Richard Duschl (2008)
 *   - BNCC Ciências da Natureza — Ensino Fundamental (MEC, 2018)
 */

import { SubjectProfile, registerSubjectProfile } from '@/lib/subjectProfile'

const scienceProfile: SubjectProfile = {
  id: 'science',
  name: 'Ciências',
  nameShort: 'Ciênc.',
  examLanguage: 'pt-BR',

  taxonomy: [
    {
      id: 'materia_energia',
      name: 'Matéria e Energia',
      icon: 'ti-flask',
      subcategories: [
        { id: 'misturas_materiais', name: 'Misturas Homogêneas/Heterogêneas e Separação', bnccCodes: ['EF06CI01', 'EF06CI02'] },
        { id: 'transformacoes_quimicas_ef', name: 'Transformações Químicas e Leis Ponderais', bnccCodes: ['EF09CI01', 'EF09CI02'] },
        { id: 'energia_calor_ondas', name: 'Calor, Temperatura, Eletricidade e Ondas', bnccCodes: ['EF07CI01', 'EF08CI01', 'EF09CI04'] },
      ]
    },
    {
      id: 'vida_evolucao',
      name: 'Vida e Evolução',
      icon: 'ti-dna',
      subcategories: [
        { id: 'celula_organizacao', name: 'Organização Celular e Níveis de Organização dos Seres Vivos', bnccCodes: ['EF06CI05', 'EF06CI06'] },
        { id: 'ecossistemas_biodiversidade', name: 'Ecossistemas, Cadeias Tróficas e Biodiversidade Brasileira', bnccCodes: ['EF07CI07', 'EF07CI08'] },
        { id: 'corpo_humano_saude', name: 'Fisiologia Humana, Sexualidade e Imunologia', bnccCodes: ['EF08CI07', 'EF08CI08', 'EF07CI09'] },
        { id: 'hereditariedade_evolucao_ef', name: 'Hereditariedade, Genética Básica e Evolução Biológica', bnccCodes: ['EF09CI08', 'EF09CI10'] },
      ]
    },
    {
      id: 'terra_universo',
      name: 'Terra e Universo',
      icon: 'ti-planet',
      subcategories: [
        { id: 'estrutura_terra', name: 'Formação da Terra, Placas Tectônicas e Rochas', bnccCodes: ['EF06CI11', 'EF07CI15'] },
        { id: 'clima_atmosfera', name: 'Camadas da Atmosfera, Efeito Estufa e Previsão do Tempo', bnccCodes: ['EF07CI12', 'EF08CI14'] },
        { id: 'astronomia_espaco', name: 'Movimentos da Terra, Fases da Lua, Eclipses e Sistema Solar', bnccCodes: ['EF06CI14', 'EF08CI12', 'EF09CI14'] },
      ]
    }
  ],

  levelFramework: {
    name: 'Ano Escolar BNCC',
    levels: [
      {
        id: '6ano',
        label: '6º Ano — EF',
        gatingRules: `6º ANO ENSINO FUNDAMENTAL (CIÊNCIAS):
- Misturas homogêneas/heterogêneas, separação de misturas e materiais sintéticos.
- Estrutura da célula como unidade da vida, tecidos fundamentais e sistemas locomotor e nervoso.
- Camadas da Terra (crosta, manto, núcleo), tipos de rochas e movimentos da Terra/estações.
- PROIBIDO: equações químicas formais, balanceamento estequiométrico e genética mendeliana.`
      },
      {
        id: '7ano',
        label: '7º Ano — EF',
        gatingRules: `7º ANO ENSINO FUNDAMENTAL (CIÊNCIAS):
- Calor, temperatura, máquinas térmicas e propagação do calor.
- Diversidade dos ecossistemas brasileiros, impacto da ação humana e programas de vacinação.
- Camada de ozônio, placas tectônicas, terremotos e vulcões.
- PROIBIDO: termodinâmica quantitativa formal e circuitos elétricos com Leis de Kirchhoff.`
      },
      {
        id: '8ano',
        label: '8º Ano — EF',
        gatingRules: `8º ANO ENSINO FUNDAMENTAL (CIÊNCIAS):
- Transformações de energia, fontes renováveis/não renováveis e consumo de energia elétrica residencial.
- Sistema reprodutor humano, métodos contraceptivos, ISTs e sistema endócrino.
- Clima, dinâmica atmosférica, fases da Lua e eclipses.
- PROIBIDO: síntese proteica molecular detalhada (códons/anticódons formais).`
      },
      {
        id: '9ano',
        label: '9º Ano — EF',
        gatingRules: `9º ANO ENSINO FUNDAMENTAL (CIÊNCIAS):
- Estrutura da matéria (átomos e tabela periódica básica), transformações químicas e leis ponderais.
- Movimento, forças, Leis de Newton introdutórias e ondas (som e luz).
- Hereditariedade (ideias de Mendel), evolução por seleção natural e astronomia/universo.
- PROIBIDO: formalismo vetorial avançado e mecânica quântica.`
      }
    ]
  },

  distractorPatterns: [
    {
      id: 'cie_fases_lua_sombra_terra',
      pattern: 'Atribuir as fases da Lua à sombra projetada pela Terra',
      examples: ['Afirmar que a Lua minguante ocorre porque a Terra está bloqueando parte da luz do Sol', 'Confundir fases da Lua com eclipse lunar'],
      pedagogicNote: 'O aluno confunde a geometria de iluminação relativa Sol-Terra-Lua com a projeção de sombra cônica de um eclipse.'
    },
    {
      id: 'cie_estacoes_ano_distancia_sol',
      pattern: 'Atribuir as estações do ano à distância da Terra em relação ao Sol',
      examples: ['Afirmar que é verão quando a Terra está mais perto do Sol e inverno quando está mais longe', 'Ignorar a inclinação do eixo terrestre'],
      pedagogicNote: 'Ignora a inclinação axial da Terra de ~23,5° e a distribuição da radiação solar por área, além de esquecer estações opostas nos hemisférios norte e sul.'
    },
    {
      id: 'cie_digestao_estomago_total',
      pattern: 'Concepção de que toda a digestão e absorção de nutrientes ocorre no estômago',
      examples: ['Afirmar que os nutrientes dos alimentos entram no sangue diretamente através do estômago', 'Ignorar o papel do intestino delgado na absorção'],
      pedagogicNote: 'Reduz a fisiologia digestiva completa à digestão mecânica e ácida inicial do estômago.'
    }
  ],

  presentationTriad: {
    name: 'Investigação-Evidência-Explicação',
    components: ['Investigação Científica (Problema/Hipótese)', 'Evidência Empírica (Dados/Observação/Experimento)', 'Explicação Teórica (Conceitualização Baseada em Modelos)'],
    promptDirective: 'Em conformidade com Anna Maria Carvalho (2013) e Rosalind Driver et al. (1994), o ensino de ciências por investigação no EF II deve estruturar-se na problematização investigativa inicial, coleta e análise de Evidências empíricas e construção coletiva da Explicação científica fundamentada em modelos teóricos.'
  },

  timeBalanceMetric: {
    primaryMetric: 'IET_AET',
    teacherRoleLabel: 'Tempo de Instrução Expositiva (IET)',
    studentRoleLabel: 'Tempo de Atividade Efetiva (AET)',
    targetRatio: { teacherMax: 30, studentMin: 70 },
    pedagogicalRationale: 'O Ensino de Ciências por Investigação (ENCI) exige que os estudantes manipulem dados, realizem experimentos e debatam hipóteses ativamente (AET >= 70%).'
  },

  udlScaffolding: {
    perception: [
      'Guias ilustrados de experimentos com protocolos de segurança passo a passo',
      'Simulações computacionais interativas de fenômenos microscópicos e celestes',
      'Modelos anatômicos e geológicos táteis tridimensionais'
    ],
    expression: [
      'Diários de bordo científicos com hipóteses, tabelas de observação e conclusões',
      'Elaboração de cartazes científicos ilustrados e modelos tridimensionais',
      'Comunicação oral de resultados em formato de feira de ciências'
    ],
    engagement: [
      'Investigação de desafios ecológicos locais (qualidade da água, poluição, horta escolar)',
      'Experimentos demonstrativos com materiais acessíveis do cotidiano'
    ]
  },

  scopeProfile: {
    targetStages: ['fundamental_2'],
    defaultEmSequence: 'traditional_series',
    scienceClassification: 'general'
  },

  provenance: {
    theoreticalFoundations: ['Ensino de Ciências por Investigação (ENCI)', 'Constructivismo Social na Educação Científica', 'Prática Pedagógica em Ciências'],
    pedagogicalReferences: [
      'Carvalho, A. M. P. (2013). Ensino de Ciências por Investigação: Condições para implementação em sala de aula. Cengage Learning.',
      'Driver, R., Asoko, H., Leach, J., Mortimer, E., & Scott, P. (1994). Constructing scientific knowledge in the classroom. Educational Researcher.',
      'Duschl, R. (2008). Quality argumentation and epistemic criteria. In Argumentation in Science Education. Springer.',
      'Krasilchik, M. (2008). Prática de Ensino de Biologia. Editora da USP.'
    ],
    authors: ['Anna Maria Pessoa de Carvalho', 'Rosalind Driver', 'Richard Duschl', 'Myriam Krasilchik']
  },

  specialRenderers: {
    hasMathJaxOrLatex: true,
    hasChemicalFormulas: true
  },

  recommendedFrameworkIds: ['cie_investigacao_guiada', 'cie_feira_ciencias_prototipagem', 'cie_observatorio_astronomico_ecologico'],
  gatingRuleIds: ['CIE-G-6-001', 'CIE-G-7-001', 'CIE-G-8-001', 'CIE-G-9-001'],

  agentSystemPromptSnippet: `Você domina a Taxonomia de Ciências alinhada à BNCC (3 unidades: Matéria e Energia, Vida e Evolução, Terra e Universo).
Aplica a tríade Investigação-Evidência-Explicação (Carvalho e Driver), conduzindo o estudante do problema empírico à conceitualização científica.
Combate ativamente concepções alternativas centrais: fases da Lua causadas pela sombra da Terra, estações do ano pela distância do Sol, digestão exclusiva no estômago.
Estimula a atitude investigativa e o método científico escolar com linguagem rigorosa porém acolhedora.`,

  bnccSkillIds: [
    'EF06CI01', 'EF06CI02', 'EF06CI05', 'EF06CI06', 'EF06CI11', 'EF06CI14',
    'EF07CI01', 'EF07CI07', 'EF07CI08', 'EF07CI09', 'EF07CI12', 'EF07CI15',
    'EF08CI01', 'EF08CI07', 'EF08CI08', 'EF08CI12', 'EF08CI14',
    'EF09CI01', 'EF09CI02', 'EF09CI04', 'EF09CI08', 'EF09CI10', 'EF09CI14'
  ]
}

registerSubjectProfile(scienceProfile)

export default scienceProfile
