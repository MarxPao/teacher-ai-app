/**
 * subjects/chemistry.ts — Perfil de Química
 *
 * Fundamentos epistemológicos:
 *   - Tríade Macroscópico-Submicroscópico-Representacional — Alex Johnstone (1982, 1991, 2000)
 *   - Pensamento Commonsense e Progressões em Química — Vicente Talanquer (2011)
 *   - Linguagem e Formação de Conceitos no Ensino de Química — Mortimer & Machado (2002)
 *   - BNCC Ciências da Natureza — Ensino Médio (MEC, 2018)
 */

import { SubjectProfile, registerSubjectProfile } from '@/lib/subjectProfile'

const chemistryProfile: SubjectProfile = {
  id: 'chemistry',
  name: 'Química',
  nameShort: 'Quím.',
  examLanguage: 'pt-BR',

  taxonomy: [
    {
      id: 'materia_transformacoes',
      name: 'Matéria e suas Transformações',
      icon: 'ti-flask-2',
      subcategories: [
        { id: 'estados_misturas', name: 'Propriedades da Matéria, Estados Físicos e Métodos de Separação', bnccCodes: ['EF06CI01', 'EF09CI01'] },
        { id: 'transformacoes_quimicas', name: 'Evidências de Reações Químicas e Leis Ponderais (Lavoisier/Proust)', bnccCodes: ['EF09CI02', 'EM13CNT101'] },
      ]
    },
    {
      id: 'estrutura_atomica_tabela',
      name: 'Estrutura Atômica, Tabela Periódica e Ligações',
      icon: 'ti-atom',
      subcategories: [
        { id: 'modelos_atomicos', name: 'Evolução dos Modelos Atômicos (Dalton, Thomson, Rutherford, Bohr)', bnccCodes: ['EF09CI03', 'EM13CNT205'] },
        { id: 'distribuicao_eletronica', name: 'Distribuição Eletrônica (Regra de Madelung / Diagrama de Pauling) e Tabela', bnccCodes: ['EM13CNT205'] },
        { id: 'ligacoes_interacoes', name: 'Ligações Iônica, Covalente, Metálica e Forças Intermoleculares', bnccCodes: ['EM13CNT205'] },
      ]
    },
    {
      id: 'funcoes_reacoes',
      name: 'Funções Químicas e Reatividade',
      icon: 'ti-test-pipe',
      subcategories: [
        { id: 'funcoes_inorganicas', name: 'Ácidos, Bases, Sais, Óxidos e Nomenclatura IUPAC', bnccCodes: ['EM13CNT104'] },
        { id: 'quimica_organica', name: 'Cadeias Carbônicas, Hidrocarbonetos, Funções Oxigenadas e Nitrogenadas', bnccCodes: ['EM13CNT104', 'EM13CNT303'] },
        { id: 'isomeria_reacoes_organicas', name: 'Isomeria Plana/Espacial e Reações Orgânicas Fundamentais', bnccCodes: ['EM13CNT303'] },
      ]
    },
    {
      id: 'fisico_quimica',
      name: 'Físico-Química',
      icon: 'ti-calculator',
      subcategories: [
        { id: 'estequiometria', name: 'Massa Molar, Quantidade de Matéria (Mol) e Cálculo Estequiométrico', bnccCodes: ['EM13CNT101'] },
        { id: 'solucoes_concentracao', name: 'Soluções, Concentração Comum, Molaridade e Diluição', bnccCodes: ['EM13CNT101'] },
        { id: 'termoquimica_cinetica', name: 'Entalpia (Lei de Hess), Velocidade de Reação e Catálise', bnccCodes: ['EM13CNT301'] },
        { id: 'equilibrio_eletroquimica', name: 'Equilíbrio Químico (Le Chatelier, pH) e Pilhas/Eletrólise', bnccCodes: ['EM13CNT301'] },
      ]
    },
    {
      id: 'quimica_ambiental_materiais',
      name: 'Química Ambiental, Materiais e Sociedade',
      icon: 'ti-leaf',
      subcategories: [
        { id: 'polimeros_sustentabilidade', name: 'Polímeros Sintéticos, Bioplásticos e Reciclagem', bnccCodes: ['EM13CNT307'] },
        { id: 'chuva_acida_estufa', name: 'Chuva Ácida, Efeito Estufa, Poluição Aquática e Química Verde', bnccCodes: ['EM13CNT105', 'EM13CNT307'] },
      ]
    }
  ],

  levelFramework: {
    name: 'Sequência Curricular Química',
    levels: [
      {
        id: 'em1',
        label: '1ª Série — Ensino Médio',
        gatingRules: `1ª SÉRIE DO ENSINO MÉDIO (QUÍMICA GERAL E INORGÂNICA):
- Modelos atômicos clássicos, tabela periódica, ligações químicas e forças intermoleculares.
- Funções inorgânicas fundamentais e noções de cálculo estequiométrico simples.
- PROIBIDO: isomeria orgânica, cinética química avançada e eletroquímica de pilhas.`
      },
      {
        id: 'em2',
        label: '2ª Série — Ensino Médio',
        gatingRules: `2ª SÉRIE DO ENSINO MÉDIO (FÍSICO-QUÍMICA):
- Estequiometria completa (reagente limitante, rendimento e pureza), soluções e diluições.
- Termoquímica, cinética química, equilíbrio químico homogêneo/heterogêneo e eletroquímica.
- PROIBIDO: síntese orgânica elaborada e química de polímeros avançada.`
      },
      {
        id: 'em3',
        label: '3ª Série — Ensino Médio',
        gatingRules: `3ª SÉRIE DO ENSINO MÉDIO (QUÍMICA ORGÂNICA E APLICADA):
- Estrutura do carbono, funções orgânicas oxigenadas, nitrogenadas e halogenadas.
- Isomeria plana e espacial (enantiômeros), principais reações orgânicas e polímeros.
- PROIBIDO: reações de síntese de compostos explosivos, tóxicos regulados ou entorpecentes.`
      }
    ]
  },

  distractorPatterns: [
    {
      id: 'qui_conservacao_massa_aberto',
      pattern: 'Ignorar gases em reações em sistemas abertos (Lavoisier aparente)',
      examples: ['Achar que a queima da palha de aço perde massa porque vira cinza', 'Afirmar que comprimido efervescente perde massa por destruição de matéria'],
      pedagogicNote: 'O aluno ignora a incorporação ou liberação de gases (como O2 ou CO2) por raciocínio macroscópico desatento.'
    },
    {
      id: 'qui_substancia_propriedade_atomo',
      pattern: 'Atribuição de propriedades macroscópicas a átomos individuais',
      examples: ['Afirmar que um átomo de cobre é maleável e conduz eletricidade', 'Dizer que uma molécula de água é líquida e molhada'],
      pedagogicNote: 'Falha em reconhecer que propriedades emergentes surgem da interação coletiva e não do átomo isolado.'
    },
    {
      id: 'qui_coeficiente_indice_confusao',
      pattern: 'Confusão entre índice atômico e coeficiente estequiométrico no balanceamento',
      examples: ['Alterar H2O para H2O2 para balancear oxigênios', 'Multiplicar apenas o primeiro elemento de uma fórmula composta'],
      pedagogicNote: 'Altera a identidade da substância química em vez de ajustar a proporção estequiométrica das espécies.'
    },
    {
      id: 'qui_dissolucao_reacao_confusao',
      pattern: 'Confusão entre dissolução física e reação química de decomposição',
      examples: ['Afirmar que o sal de cozinha some na água porque foi destruído quimicamente', 'Tratar a evaporação como reação química'],
      pedagogicNote: 'Não diferencia interações intermoleculares de dispersão de quebra/formação de ligações intramoleculares.'
    }
  ],

  presentationTriad: {
    name: 'Fenomenológico-Submicroscópico-Representacional (Tríade de Johnstone)',
    components: ['Nível Macroscópico/Fenomenológico (Observável)', 'Nível Submicroscópico (Átomos/Moléculas/Íons)', 'Nível Representacional/Simbólico (Fórmulas/Equações)'],
    promptDirective: 'Em conformidade com Alex Johnstone (1982, 1991, 2000) e Vicente Talanquer (2011), o ensino de química deve integrar simultaneamente os 3 vértices do Triângulo de Johnstone: o Macroscópico (o que se observa no tubo de ensaio ou no cotidiano), o Submicroscópico (como átomos, íons e moléculas se organizam e reagem) e o Representacional (símbolos, fórmulas de Lewis, equações estequiométricas balanceadas). Jamais ensinar equações desconectadas dos outros dois níveis.'
  },

  timeBalanceMetric: {
    primaryMetric: 'IET_AET',
    teacherRoleLabel: 'Tempo de Instrução Expositiva (IET)',
    studentRoleLabel: 'Tempo de Atividade Efetiva (AET)',
    targetRatio: { teacherMax: 30, studentMin: 70 },
    pedagogicalRationale: 'A transição entre os níveis de Johnstone e os cálculos estequiométricos exigem resolução prática contínua pelos alunos (AET >= 70%).'
  },

  udlScaffolding: {
    perception: [
      'Modelos moleculares interativos 3D manipuláveis (Jmol, PhET, Avogadro)',
      'Vídeos em alta definição de reações químicas em laboratório com marcadores de evidências',
      'Esquemas particulados com legendas por cores padronizadas (esferas de Dalton/CPK)'
    ],
    expression: [
      'Representação em três colunas simultâneas (Macroscópico | Submicroscópico | Representacional)',
      'Desenho de estruturas de Lewis e modelos de caixas de distribuição eletrônica',
      'Resolução passo a passo de balanceamento estequiométrico com tabelas de conservação de átomos'
    ],
    engagement: [
      'Aplicações diretas na culinária, cosméticos, produção de fármacos e baterias de lítio',
      'Dilemas éticos e socioambientais sobre o uso de plásticos e processos da Química Verde'
    ]
  },

  scopeProfile: {
    targetStages: ['ensino_medio'],
    defaultEmSequence: 'traditional_series',
    scienceClassification: 'chemistry'
  },

  provenance: {
    theoreticalFoundations: ['Tríade de Johnstone (Chemistry Triangle)', 'Epistemologia do Pensamento Químico (Commonsense Chemistry)', 'Linguagem e Mediação Semiótica em Ciências'],
    pedagogicalReferences: [
      'Johnstone, A. H. (1982). Macro- and micro-chemistry. School Science Review.',
      'Johnstone, A. H. (1991). Why is science difficult to learn? Things are seldom what they seem. Journal of Computer Assisted Learning.',
      'Talanquer, V. (2011). Macro, submicro, and symbolic: The many faces of the chemistry triplet. International Journal of Science Education.',
      'Mortimer, E. F., & Machado, A. H. (2002). Olhares sobre a química: investigações sobre linguagem e ensino. Editora UFMG.'
    ],
    authors: ['Alex H. Johnstone', 'Vicente Talanquer', 'Eduardo Fleury Mortimer', 'Andréa Horta Machado']
  },

  specialRenderers: {
    hasChemicalFormulas: true,
    hasMathJaxOrLatex: true
  },

  recommendedFrameworkIds: ['qui_triangulo_johnstone_laboratorio', 'qui_estudo_caso_quimica_cotidiana', 'qui_estequiometria_guiada_pbl'],
  gatingRuleIds: ['QUI-G-EM-001'],

  agentSystemPromptSnippet: `Você domina a Taxonomia de Química alinhada à BNCC e a Tríade de Johnstone (Macroscópico-Submicroscópico-Representacional).
Renderiza equações e fórmulas químicas com formatação estequiométrica correta (índices subscritos e balanço de carga).
Combate ativamente concepções alternativas: conservação de massa em recipientes abertos (oxidação da palha de aço ganha massa do O2 incorporado), atribuição de propriedades macroscópicas a átomos individuais e alteração indevida de índices atômicos.
BLOQUEIO ABSOLUTO: Nunca gere protocolos de síntese de explosivos, tóxicos severos ou substâncias ilícitas.`,

  bnccSkillIds: [
    'EF06CI01', 'EF09CI01', 'EF09CI02', 'EF09CI03',
    'EM13CNT101', 'EM13CNT104', 'EM13CNT105', 'EM13CNT205', 'EM13CNT301', 'EM13CNT303', 'EM13CNT307'
  ]
}

registerSubjectProfile(chemistryProfile)

export default chemistryProfile
