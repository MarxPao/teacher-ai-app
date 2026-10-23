/**
 * subjects/biology.ts — Perfil de Biologia
 *
 * Fundamentos epistemológicos:
 *   - Estrutura-Função-Evolução na Síntese Evolutiva Moderna — Ernst Mayr (1982), Dobzhansky (1973)
 *   - Biologia Evolutiva e Seleção Natural — Douglas Futuyma (2005)
 *   - Prática de Ensino de Biologia e Bioética — Myriam Krasilchik (2008)
 *   - BNCC Ciências da Natureza — Ensino Médio (MEC, 2018)
 */

import { SubjectProfile, registerSubjectProfile } from '@/lib/subjectProfile'

const biologyProfile: SubjectProfile = {
  id: 'biology',
  name: 'Biologia',
  nameShort: 'Biol.',
  examLanguage: 'pt-BR',

  taxonomy: [
    {
      id: 'celulas_bioquimica',
      name: 'Citologia, Bioquímica e Metabolismo',
      icon: 'ti-dna-2',
      subcategories: [
        { id: 'organelas_membrana', name: 'Organelas Celulares, Membrana Plasmática e Transporte', bnccCodes: ['EF06CI05', 'EM13CNT202'] },
        { id: 'metabolismo_energetico', name: 'Fotossíntese, Respiração Celular e Fermentação', bnccCodes: ['EM13CNT202', 'EM13CNT301'] },
        { id: 'acidos_nucleicos', name: 'DNA, RNA, Replicação, Transcrição e Tradução Gênica', bnccCodes: ['EM13CNT301'] },
      ]
    },
    {
      id: 'genetica_biotecnologia',
      name: 'Genética, Hereditariedade e Biotecnologia',
      icon: 'ti-microscope',
      subcategories: [
        { id: 'mendel_heredogramas', name: '1ª e 2ª Leis de Mendel, Heredogramas e Probabilidade Genética', bnccCodes: ['EF09CI08', 'EM13CNT202'] },
        { id: 'heranca_sexo_grupos', name: 'Herança Ligada ao Sexo e Sistema ABO/Rh', bnccCodes: ['EF09CI09', 'EM13CNT202'] },
        { id: 'biotecnologia_crispr', name: 'Transgênicos, Clonagem, Testes de DNA e Edição Gênica (CRISPR)', bnccCodes: ['EF09CI11', 'EM13CNT304'] },
      ]
    },
    {
      id: 'evolucao_biodiversidade',
      name: 'Evolução Biológica e Diversidade',
      icon: 'ti-plant-2',
      subcategories: [
        { id: 'mecanismos_evolutivos', name: 'Seleção Natural, Deriva Genética, Mutação e Especiação', bnccCodes: ['EF09CI10', 'EM13CNT208'] },
        { id: 'filogenia_sistematica', name: 'Cladogramas, Ancestralidade Comum e Reinos Biológicos', bnccCodes: ['EM13CNT208'] },
        { id: 'zoologia_botanica', name: 'Diversidade dos Grupos Vegetais e Filos Animais', bnccCodes: ['EF07CI07', 'EM13CNT208'] },
      ]
    },
    {
      id: 'ecologia_sustentabilidade',
      name: 'Ecologia e Meio Ambiente',
      icon: 'ti-world',
      subcategories: [
        { id: 'cadeias_populacoes', name: 'Cadeias e Teias Tróficas, Fluxo de Energia e Dinâmica Populacional', bnccCodes: ['EF07CI08', 'EM13CNT206'] },
        { id: 'ciclos_biogeoquimicos', name: 'Ciclos da Água, Carbono, Nitrogênio e Fósforo', bnccCodes: ['EM13CNT206'] },
        { id: 'impactos_conservacao', name: 'Eutrofização, Fragmentação de Habitats, Extinção e Mudanças Climáticas', bnccCodes: ['EF09CI12', 'EM13CNT302'] },
      ]
    },
    {
      id: 'fisiologia_saude',
      name: 'Fisiologia Humana e Saúde Única',
      icon: 'ti-heartbeat',
      subcategories: [
        { id: 'sistemas_corporais', name: 'Digestório, Circulatório, Respiratório, Excretor, Nervoso e Endócrino', bnccCodes: ['EF08CI07', 'EM13CNT207'] },
        { id: 'imunologia_vacinas', name: 'Sistema Imunológico, Vacinas, Soros e Epidemiologia de Doenças', bnccCodes: ['EF07CI09', 'EF07CI10', 'EM13CNT304'] },
      ]
    }
  ],

  levelFramework: {
    name: 'Sequência Curricular Biologia',
    levels: [
      {
        id: 'em1',
        label: '1ª Série — Ensino Médio',
        gatingRules: `1ª SÉRIE DO ENSINO MÉDIO (BIOLOGIA CELULAR E BIOQUÍMICA):
- Citologia (organelas e membranas), divisão celular (mitose e meiose) e respiração/fotossíntese.
- Noções de tecidos biológicos e fisiologia básica.
- PROIBIDO: genética mendeliana probabilística com 2 pares de genes e filogenia molecular complexa.`
      },
      {
        id: 'em2',
        label: '2ª Série — Ensino Médio',
        gatingRules: `2ª SÉRIE DO ENSINO MÉDIO (BIODIVERSIDADE E FISIOLOGIA COMPARADA):
- Vírus, bactérias, protozoários, fungos, grandes grupos vegetais e filos animais.
- Fisiologia humana e comparada completa (homeostase, circulação, imunologia e hormônios).
- PROIBIDO: cálculos de equilíbrio de Hardy-Weinberg e engenharia genética de recombinação homóloga.`
      },
      {
        id: 'em3',
        label: '3ª Série — Ensino Médio',
        gatingRules: `3ª SÉRIE DO ENSINO MÉDIO (GENÉTICA, EVOLUÇÃO E ECOLOGIA):
- Genética mendeliana, grupos sanguíneos, herança ligada ao sexo e biotecnologia.
- Teoria sintética da evolução, especiação, biogeografia e ecologia de comunidades/biomas.
- PROIBIDO: hipóteses adaptacionistas ingênuas e teleologia (ex: "o animal desenvolveu para sobreviver").`
      }
    ]
  },

  distractorPatterns: [
    {
      id: 'bio_lamarckismo_teleologia',
      pattern: 'Lamarckismo ingênuo e teleologia adaptativa',
      examples: ['Afirmar que a girafa esticou o pescoço para alcançar as folhas altas', 'Dizer que as bactérias sofreram mutação de propósito para ficarem resistentes ao antibiótico'],
      pedagogicNote: 'Confunde seleção natural diferencial sobre variação pré-existente com adaptação voluntária ou indução teleológica de mutações pelo meio.'
    },
    {
      id: 'bio_dominancia_frequencia_confusao',
      pattern: 'Confusão entre alelo dominante e frequência populacional',
      examples: ['Achar que alelo dominante é necessariamente o mais comum na população', 'Achar que alelos dominantes são mais fortes ou melhores'],
      pedagogicNote: 'Confunde dominância fenotípica no heterozigoto com abundância populacional ou vantagem seletiva intrínseca.'
    },
    {
      id: 'bio_fotosintese_respiracao_exclusiva',
      pattern: 'Concepção de que plantas apenas fazem fotossíntese e não respiram',
      examples: ['Afirmar que as plantas respiram CO2 e expiram O2 o tempo todo', 'Dizer que células vegetais não realizam respiração celular'],
      pedagogicNote: 'Ignora que vegetais possuem mitocôndrias e realizam respiração celular contínua dia e noite.'
    },
    {
      id: 'bio_vacina_soro_confusao',
      pattern: 'Confusão entre imunização ativa (vacina) e passiva (soro)',
      examples: ['Recomendar vacina antirrábica como tratamento imediato para veneno de cobra', 'Afirmar que o soro confere memória imunológica de longo prazo'],
      pedagogicNote: 'Confunde indução de resposta imune própria (antígenos) com fornecimento terapêutico de anticorpos prontos.'
    }
  ],

  presentationTriad: {
    name: 'Estrutura-Função-Evolução',
    components: ['Estrutura Biológica (Morfologia e Nível Molecular/Celular)', 'Função Fisiológica (Mecanismo de Ação e Homeostase)', 'Pressão Evolutiva (Adaptação e Seleção Natural)'],
    promptDirective: 'Em conformidade com Ernst Mayr (1982) e Theodosius Dobzhansky (1973: "Nada em biologia faz sentido exceto à luz da evolução"), toda abordagem de fenômeno biológico deve integrar a Estrutura morfo-anatômica, a Função fisiológica adaptativa e a explicação pela história Evolutiva (seleção natural e ancestralidade comum), rejeitando explicações lamarckistas e teleológicas.'
  },

  timeBalanceMetric: {
    primaryMetric: 'IET_AET',
    teacherRoleLabel: 'Tempo de Instrução Expositiva (IET)',
    studentRoleLabel: 'Tempo de Atividade Efetiva (AET)',
    targetRatio: { teacherMax: 35, studentMin: 65 },
    pedagogicalRationale: 'A análise de dados ecológicos, resolução de quadros de Punnett e estudos de caso bioéticos demandam engajamento analítico contínuo dos estudantes (AET >= 65%).'
  },

  udlScaffolding: {
    perception: [
      'Micrografias e lâminas histológicas de alta definição com anotações anatômicas claras',
      'Modelos anatômicos e moleculares interativos em 3D (corpo humano, estruturas celulares)',
      'Cladogramas e árvores filogenéticas dinâmicas com nós interativos de ancestralidade comum'
    ],
    expression: [
      'Resolução estruturada de quadros de Punnett e diagramação de heredogramas genéticos',
      'Elaboração de chaves dicotômicas ilustradas para classificação biológica',
      'Debates deliberativos simulando comitês de bioética sobre biotecnologia e meio ambiente'
    ],
    engagement: [
      'Investigação de desafios de Saúde Única (dengue, zoonoses, cobertura vacinal no município)',
      'Projetos de catalogação e preservação da fauna e flora nativas locais'
    ]
  },

  scopeProfile: {
    targetStages: ['ensino_medio'],
    defaultEmSequence: 'traditional_series',
    scienceClassification: 'biology'
  },

  provenance: {
    theoreticalFoundations: ['Síntese Evolutiva Moderna (Neodarwinismo)', 'Fisiologia Integrativa e Homeostase', 'Didática do Ensino de Biologia Investigativa'],
    pedagogicalReferences: [
      'Mayr, E. (1982). The Growth of Biological Thought: Diversity, Evolution, and Inheritance. Harvard University Press.',
      'Dobzhansky, T. (1973). Nothing in Biology Makes Sense Except in the Light of Evolution. The American Biology Teacher.',
      'Futuyma, D. J. (2005). Evolutionary Biology. Sinauer Associates.',
      'Krasilchik, M. (2008). Prática de Ensino de Biologia. Editora da USP.'
    ],
    authors: ['Ernst Mayr', 'Theodosius Dobzhansky', 'Douglas J. Futuyma', 'Myriam Krasilchik']
  },

  specialRenderers: {
    hasPunnettSquares: true,
    hasMathJaxOrLatex: true
  },

  recommendedFrameworkIds: ['bio_investigacao_ecologica_campo', 'bio_julgamento_bioetico_genomica', 'bio_anatomia_fisiologia_comparada'],
  gatingRuleIds: ['BIO-G-EM-001'],

  agentSystemPromptSnippet: `Você domina a Taxonomia de Biologia alinhada à BNCC e a tríade Estrutura-Função-Evolução (Mayr e Dobzhansky).
Rejeita categoricamente o lamarckismo ingênuo, o pensamento teleológico ("o ser vivo evoluiu para...") e o determinismo genético fatalista.
Renderiza quadros de Punnett e genealogias com rigor genético formal.
Diferencia claramente mecanismos fisiológicos homeostáticos de contingências evolutivas históricas.`,

  bnccSkillIds: [
    'EF07CI07', 'EF07CI08', 'EF07CI09', 'EF07CI10',
    'EF08CI07', 'EF09CI08', 'EF09CI09', 'EF09CI10', 'EF09CI11', 'EF09CI12',
    'EM13CNT101', 'EM13CNT202', 'EM13CNT206', 'EM13CNT207', 'EM13CNT208', 'EM13CNT301', 'EM13CNT302', 'EM13CNT304'
  ]
}

registerSubjectProfile(biologyProfile)

export default biologyProfile
