/**
 * subjects/math.ts — Perfil de Matemática
 *
 * Fundamentos epistemológicos:
 *   - Concreto-Pictórico-Abstrato (CPA/CRA) — Bruner (1966), Dienes (1960), Leong et al. (2015)
 *   - Resolução de Problemas em 4 Fases — Polya (1945)
 *   - Compreensão Instrumental vs Relacional — Skemp (1976)
 *   - BNCC Matemática (MEC, 2018) — 5 unidades temáticas
 */

import { SubjectProfile, registerSubjectProfile } from '@/lib/subjectProfile'

const mathProfile: SubjectProfile = {
  id: 'math',
  name: 'Matemática',
  nameShort: 'Mat.',
  examLanguage: 'pt-BR',

  taxonomy: [
    {
      id: 'numeros',
      name: 'Números e Operações',
      icon: 'ti-numbers',
      subcategories: [
        { id: 'fracoes_decimais', name: 'Frações, Decimais e Porcentagens', bnccCodes: ['EF06MA07', 'EF07MA08'] },
        { id: 'operacoes_fundamentais', name: 'Operações Fundamentais e Propriedades', bnccCodes: ['EF06MA03', 'EF07MA03'] },
        { id: 'potenciacao_radiciacao', name: 'Potenciação, Radiciação e Notação Científica', bnccCodes: ['EF08MA01', 'EF09MA03'] },
        { id: 'numeros_reais', name: 'Conjuntos Numéricos e Números Irracionais', bnccCodes: ['EF09MA01', 'EF09MA02'] },
      ]
    },
    {
      id: 'algebra',
      name: 'Álgebra e Funções',
      icon: 'ti-variable',
      subcategories: [
        { id: 'padroes_sequencias', name: 'Padrões, Regularidades e Sequências', bnccCodes: ['EF06MA14', 'EF07MA13'] },
        { id: 'equacoes_1grau', name: 'Equações Lineares e Sistemas de 1º Grau', bnccCodes: ['EF07MA18', 'EF08MA08'] },
        { id: 'produtos_notaveis', name: 'Produtos Notáveis e Fatoração', bnccCodes: ['EF09MA09'] },
        { id: 'equacoes_2grau', name: 'Equações de 2º Grau (Incompletas e Completas)', bnccCodes: ['EF08MA09', 'EF09MA09'] },
        { id: 'funcoes', name: 'Estudo de Funções (Afim, Quadrática, Exponencial)', bnccCodes: ['EF09MA06', 'EM13MAT101'] },
      ]
    },
    {
      id: 'geometria',
      name: 'Geometria',
      icon: 'ti-shapes',
      subcategories: [
        { id: 'figuras_planas', name: 'Polígonos, Triângulos e Quadriláteros', bnccCodes: ['EF06MA19', 'EF07MA23'] },
        { id: 'transformacoes_simetria', name: 'Transformações Geométricas e Simetria', bnccCodes: ['EF07MA27', 'EF08MA18'] },
        { id: 'pitagoras_semelhanca', name: 'Teorema de Pitágoras e Semelhança de Triângulos', bnccCodes: ['EF09MA11', 'EF09MA12'] },
        { id: 'geometria_espacial', name: 'Prismas, Pirâmides e Corpos Redondos', bnccCodes: ['EF06MA17', 'EM13MAT301'] },
      ]
    },
    {
      id: 'grandezas_medidas',
      name: 'Grandezas e Medidas',
      icon: 'ti-ruler-2',
      subcategories: [
        { id: 'perimetro_area', name: 'Perímetro e Área de Figuras Planas', bnccCodes: ['EF06MA24', 'EF07MA31', 'EF08MA19'] },
        { id: 'volume_capacidade', name: 'Volume de Blocos Retangulares e Capacidade', bnccCodes: ['EF07MA30', 'EF08MA20'] },
        { id: 'medidas_compostas', name: 'Velocidade, Densidade Demográfica e Escala', bnccCodes: ['EF08MA15', 'EF09MA15'] },
      ]
    },
    {
      id: 'probabilidade_estatistica',
      name: 'Probabilidade e Estatística',
      icon: 'ti-chart-bar',
      subcategories: [
        { id: 'amostragem_graficos', name: 'Leitura, Interpretação e Construção de Gráficos', bnccCodes: ['EF06MA31', 'EF07MA36'] },
        { id: 'medidas_tendencia', name: 'Média, Mediana e Moda', bnccCodes: ['EF08MA25', 'EF09MA22'] },
        { id: 'probabilidade', name: 'Espaço Amostral e Cálculo de Probabilidade', bnccCodes: ['EF07MA34', 'EF08MA22', 'EF09MA20'] },
      ]
    }
  ],

  levelFramework: {
    name: 'Ano Escolar BNCC',
    levels: [
      {
        id: '6ano',
        label: '6º Ano — EF',
        gatingRules: `6º ANO ENSINO FUNDAMENTAL (MATEMÁTICA):
- Números naturais e racionais positivos (forma fracionária e decimal até centésimos).
- Operações fundamentais, múltiplos, divisores e potências de base e expoente naturais.
- Polígonos simples, cálculo de perímetro e área de retângulos por decomposição visual.
- PROIBIDO: números negativos formais, equações com incógnitas algébricas, Teorema de Pitágoras.`
      },
      {
        id: '7ano',
        label: '7º Ano — EF',
        gatingRules: `7º ANO ENSINO FUNDAMENTAL (MATEMÁTICA):
- Números inteiros (positivos e negativos), operações na reta numérica.
- Equações polinomiais de 1º grau na forma ax + b = c e problemas de partilha proporcional.
- Ângulos, transformações geométricas no plano cartesiano e circunferências.
- PROIBIDO: produtos notáveis, equações de 2º grau e números irracionais.`
      },
      {
        id: '8ano',
        label: '8º Ano — EF',
        gatingRules: `8º ANO ENSINO FUNDAMENTAL (MATEMÁTICA):
- Notação científica, dízimas periódicas e potenciação com expoente inteiro.
- Equações de 2º grau incompletas (na forma ax^2 = b, conforme EF08MA09).
- Congruência de triângulos, áreas de figuras planas e volume de cilindro reto.
- PROIBIDO: fórmula de Bhaskara para equações completas (reservada ao 9º ano) e discriminante negativo.`
      },
      {
        id: '9ano',
        label: '9º Ano — EF',
        gatingRules: `9º ANO ENSINO FUNDAMENTAL (MATEMÁTICA):
- Números irracionais e reais na reta numérica; radicais aritméticos.
- Produtos notáveis, fatoração algébrica e equações completas de 2º grau (Bhaskara).
- Teorema de Pitágoras, relações métricas no triângulo retângulo e introdução a funções.
- PROIBIDO: números complexos, matrizes e logaritmos formais.`
      },
      {
        id: 'em',
        label: 'Ensino Médio',
        gatingRules: `ENSINO MÉDIO (MATEMÁTICA):
- Funções afim, quadrática, exponencial e logarítmica; progressões (PA e PG).
- Trigonometria no ciclo trigonométrico; geometria espacial de posição e métrica.
- Análise combinatória, probabilidade condicional e matemática financeira.`
      }
    ]
  },

  distractorPatterns: [
    {
      id: 'mat_soma_fracoes_direta',
      pattern: 'Soma ingênua de numeradores e denominadores',
      examples: ['1/2 + 1/3 = 2/5', '3/4 + 1/2 = 4/6'],
      pedagogicNote: 'Aluno estende erroneamente a regra aditiva de números inteiros para frações sem encontrar o MMC.'
    },
    {
      id: 'mat_divisao_fracao_invertida',
      pattern: 'Esquecimento de inverter a segunda fração na divisão',
      examples: ['(2/3) / (4/5) = (2*4)/(3*5) = 8/15', '1/2 / 3/4 = 3/8'],
      pedagogicNote: 'O estudante multiplica direto sem compreender a relação inversa da divisão fracionária.'
    },
    {
      id: 'mat_distributividade_potencia',
      pattern: 'Distributividade indevida de potência sobre adição (Sonho do Calouro)',
      examples: ['(a + b)^2 = a^2 + b^2', '(x + 3)^2 = x^2 + 9'],
      pedagogicNote: 'Ocorre por generalização indevida da propriedade distributiva da multiplicação sobre a soma.'
    },
    {
      id: 'mat_sinal_transposicao',
      pattern: 'Inversão incompleta de sinais na transposição de termos',
      examples: ['2x + 5 = 15 => 2x = 15 + 5', 'x - 4 = 10 => x = 6'],
      pedagogicNote: 'Memorização mecânica de passar para o outro lado sem o princípio aditivo da igualdade.'
    },
    {
      id: 'mat_perimetro_area_confusao',
      pattern: 'Confusão conceitual e de unidades entre perímetro e área',
      examples: ['Área de retângulo 4x5 = 18 cm', 'Perímetro com unidade cm^2'],
      pedagogicNote: 'Não diferenciação entre grandeza unidimensional (contorno) e bidimensional (superfície).'
    },
    {
      id: 'mat_raiz_soma',
      pattern: 'Linearização indevida da raiz quadrada da soma',
      examples: ['sqrt(a^2 + b^2) = a + b', 'sqrt(9 + 16) = 3 + 4 = 7'],
      pedagogicNote: 'Aluno assume que radiciação é distributiva em relação à adição.'
    }
  ],

  presentationTriad: {
    name: 'Concreto-Pictórico-Abstrato (CPA / CRA)',
    components: ['Concreto (Manipulativos/Modelos Físicos)', 'Pictórico (Diagramas/Barras/Gráficos)', 'Abstrato (Símbolos/Equações)'],
    promptDirective: 'Em conformidade com Bruner (1966) e o método CPA/CRA, a introdução de conceitos matemáticos deve progredir do estágio Concreto (manipulativos físicos ou modelos perceptíveis), passando pelo Pictórico (desenhos, esquemas de barras, gráficos) antes da formalização Abstrata (algoritmos e símbolos).'
  },

  timeBalanceMetric: {
    primaryMetric: 'IET_AET',
    teacherRoleLabel: 'Tempo de Instrução Expositiva (IET)',
    studentRoleLabel: 'Tempo de Atividade Efetiva (AET)',
    targetRatio: { teacherMax: 30, studentMin: 70 },
    pedagogicalRationale: 'A aprendizagem matemática profunda requer resolução ativa de problemas pelos estudantes (AET >= 70%), com o professor atuando como mediador das estratégias.'
  },

  udlScaffolding: {
    perception: [
      'Modelos manipulativos digitais e físicos (blocos lógicos, geoplanos virtuais, materiais dourados)',
      'Códigos de cores consistentes para termos semelhantes e passos de resolução algébrica',
      'Visualizações dinâmicas em GeoGebra com múltiplos ângulos e parâmetros ajustáveis'
    ],
    expression: [
      'Múltiplas formas de demonstração: resolução formal escrita, mapas conceituais ou explicação em vídeo',
      'Organizadores visuais em 4 quadrantes para resolução de problemas (Polya)',
      'Calculadoras gráficas e softwares de simulação como ferramentas de apoio'
    ],
    engagement: [
      'Problemas abertos contextualizados em finanças reais, games, arquitetura e esportes',
      'Trabalho em duplas investigativas com rotação de papéis (resolvedor e verificador)'
    ]
  },

  scopeProfile: {
    targetStages: ['fundamental_2', 'ensino_medio'],
    defaultEmSequence: 'traditional_series'
  },

  provenance: {
    theoreticalFoundations: ['Teoria do Desenvolvimento Cognitivo (CPA)', 'Heurística de Resolução de Problemas', 'Compreensão Relacional da Matemática'],
    pedagogicalReferences: [
      'Bruner, J. S. (1966). Toward a Theory of Instruction. Harvard University Press.',
      'Polya, G. (1945). How to Solve It. Princeton University Press.',
      'Skemp, R. R. (1976). Relational Understanding and Instrumental Understanding.',
      'Dienes, Z. P. (1960). Building Up Mathematics. Hutchinson Educational.'
    ],
    authors: ['Jerome Bruner', 'George Polya', 'Richard Skemp', 'Zoltan Dienes']
  },

  specialRenderers: {
    hasMathJaxOrLatex: true
  },

  recommendedFrameworkIds: ['mat_resolucao_problemas_polya', 'mat_cpa_laboratorio', 'mat_investigacao_etnomatematica'],
  gatingRuleIds: ['MAT-G-6-001', 'MAT-G-7-001', 'MAT-G-8-001', 'MAT-G-9-004', 'MAT-G-EM-001'],

  agentSystemPromptSnippet: `Você domina a Taxonomia de Matemática alinhada à BNCC (5 eixos: Números, Álgebra, Geometria, Grandezas e Medidas, Probabilidade e Estatística).
Aplica rigorosamente o método CPA (Concreto-Pictórico-Abstrato) de Bruner e a heurística de 4 passos de Polya.
Renderiza fórmulas matemáticas estritamente em LaTeX/KaTeX formatado ($...$ e $$...$$).
Erros diagnósticos centrais: distributividade indevida em potências e raízes, operações com frações, inversão de sinais e confusão perímetro/área.`,

  bnccSkillIds: [
    'EF06MA01', 'EF06MA03', 'EF06MA07', 'EF06MA14', 'EF06MA17', 'EF06MA19', 'EF06MA24', 'EF06MA31',
    'EF07MA01', 'EF07MA03', 'EF07MA08', 'EF07MA13', 'EF07MA18', 'EF07MA23', 'EF07MA27', 'EF07MA30', 'EF07MA31', 'EF07MA34', 'EF07MA36',
    'EF08MA01', 'EF08MA08', 'EF08MA09', 'EF08MA15', 'EF08MA18', 'EF08MA19', 'EF08MA20', 'EF08MA22', 'EF08MA25',
    'EF09MA01', 'EF09MA02', 'EF09MA03', 'EF09MA06', 'EF09MA09', 'EF09MA11', 'EF09MA12', 'EF09MA15', 'EF09MA20', 'EF09MA22',
    'EM13MAT101', 'EM13MAT301', 'EM13MAT501'
  ]
}

registerSubjectProfile(mathProfile)

export default mathProfile
