/**
 * subjectLessonFrameworks.ts — Catálogo dos 24 Frameworks Pedagógicos Especializados
 * 
 * 3 Frameworks de 50 minutos por matéria para as 8 disciplinas (LP, MAT, HIS, GEO, FIS, QUI, BIO, CIE).
 * Todos somam exatamente 50 minutos, com micro-timings, ações docentes e discentes e foco metodológico específico.
 */

import type { LessonFrameworkConfig } from './lessonFrameworks'

export const SUBJECT_SPECIALIZED_FRAMEWORKS: LessonFrameworkConfig[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. LÍNGUA PORTUGUESA (3 FRAMEWORKS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'lp_oficina_producao',
    name: 'Oficina de Produção Textual (Geraldi)',
    badge: '#059669',
    desc: 'Leitura do gênero, escrita em processo, revisão epilinguística e circulação social real (10+20+12+8 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Leitura Compartilhada & Análise do Gênero',
        durationMin: 10,
        teacherAction: 'Apresentar texto autêntico do gênero disparador e guiar a identificação da situação comunicativa e suporte',
        studentAction: 'Ler ativamente, identificar interlocutor previsto, finalidade discursiva e recursos linguísticos característicos',
        pedagogicalRole: 'Análise de Gênero e Situação Comunicativa'
      },
      {
        name: '2. Planejamento & Produção da 1ª Versão',
        durationMin: 20,
        teacherAction: 'Circular orientando o planejamento e atendendo dúvidas de repertório e estrutura',
        studentAction: 'Elaborar esquema prévio de ideias e redigir individualmente ou em duplas a primeira versão autoral',
        pedagogicalRole: 'Escrita em Processo com Rascunho Guiado'
      },
      {
        name: '3. Revisão por Pares & Epilinguística',
        durationMin: 12,
        teacherAction: 'Disponibilizar checklist de critérios objetivos e intervir em dúvidas de coesão, concordância e pontuação',
        studentAction: 'Trocar textos com o colega, realizar apontamentos construtivos e reescrever trechos com reflexão epilinguística',
        pedagogicalRole: 'Revisão Epilinguística e Reescrita'
      },
      {
        name: '4. Socialização & Circulação Real',
        durationMin: 8,
        teacherAction: 'Coordenar a leitura de trechos em voz alta e organizar o mural, varal de textos ou publicação no blog da turma',
        studentAction: 'Compartilhar a produção com a turma e avaliar o impacto comunicativo do texto produzido',
        pedagogicalRole: 'Publicação e Circulação Social'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — OFICINA DE PRODUÇÃO TEXTUAL (GERALDI):
A aula deve durar rigorosamente 50 minutos e estruturar-se em 4 etapas:
1. Leitura Compartilhada & Análise do Gênero (10 min): Leitura de modelo real, identificação de interlocutor e suporte.
2. Planejamento & Produção da 1ª Versão (20 min): Rascunho autoral focado na progressão temática e intencionalidade.
3. Revisão por Pares & Epilinguística (12 min): Checagem em duplas de coesão, concordância e reescrita sem jargão prescritivo.
4. Socialização & Circulação Real (8 min): Publicação/compartilhamento autêntico com a comunidade escolar.`,
    schemaStagesExample: [
      { name: '1. Leitura Compartilhada & Análise do Gênero', durationMin: 10, teacherAction: 'Mediação da leitura', studentAction: 'Identificação de traços do gênero', targetBnccCode: 'EF07LP06' },
      { name: '2. Planejamento & Produção da 1ª Versão', durationMin: 20, teacherAction: 'Consultoria de escrita', studentAction: 'Redação da primeira versão', targetBnccCode: 'EF07LP15' },
      { name: '3. Revisão por Pares & Epilinguística', durationMin: 12, teacherAction: 'Guia de checklist', studentAction: 'Revisão mútua e reescrita', targetBnccCode: 'EF07LP18' },
      { name: '4. Socialização & Circulação Real', durationMin: 8, teacherAction: 'Coordenação da partilha', studentAction: 'Apresentação e reflexão final', targetBnccCode: 'EF07LP22' }
    ]
  },
  {
    id: 'lp_circulo_leitura',
    name: 'Círculo de Leitura Literária e Escuta Ativa (Cosson)',
    badge: '#10b981',
    desc: 'Letramento literário com motivação, introdução da obra, leitura polifônica e ampliação crítica (8+15+17+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Motivação & Apresentação da Obra',
        durationMin: 8,
        teacherAction: 'Disparar pergunta existencial ou dilema ético relacionado ao tema central do texto literário',
        studentAction: 'Compartilhar vivências prévias e formular expectativas sobre a leitura',
        pedagogicalRole: 'Motivação e Horizonte de Expectativa'
      },
      {
        name: '2. Leitura Guiada & Noticing Estético',
        durationMin: 15,
        teacherAction: 'Conduzir leitura expressiva compartilhada destacando ritmo, imagens poéticas e recursos de estilo',
        studentAction: 'Acompanhar a leitura no texto impresso/digital, sublinhar passagens marcantes e anotar sensações',
        pedagogicalRole: 'Experiência Estética e Decodificação Sensível'
      },
      {
        name: '3. Roda de Conversa & Interpretação Polifônica',
        durationMin: 17,
        teacherAction: 'Moderar o círculo de discussão com perguntas interpretativas abertas, sem impor leitura única',
        studentAction: 'Argumentar sobre sentidos possíveis, dialogar com as visões dos colegas e citar trechos como evidência',
        pedagogicalRole: 'Comunidade Interpretativa e Argumentação'
      },
      {
        name: '4. Conexões Intertextuais & Registro Crítico',
        durationMin: 10,
        teacherAction: 'Apresentar obra visual/musical contemporânea para diálogo intertextual e orientar o registro no diário de leitor',
        studentAction: 'Produzir síntese poética, desenho interpretativo ou comentário crítico no diário de leitura',
        pedagogicalRole: 'Ampliação Cultural e Registro Subjetivo'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — CÍRCULO DE LEITURA LITERÁRIA (COSSON):
Divida a aula exatamente em 4 etapas (50 min total):
1. Motivação & Apresentação da Obra (8 min): Dilema humano disparador e expectativas.
2. Leitura Guiada & Noticing Estético (15 min): Leitura expressiva em voz alta e marcas de estilo.
3. Roda de Conversa & Interpretação Polifônica (17 min): Debate de sentidos plurais com evidências do texto.
4. Conexões Intertextuais & Registro Crítico (10 min): Diálogo com outras artes e escrita do leitor.`,
    schemaStagesExample: [
      { name: '1. Motivação & Apresentação da Obra', durationMin: 8, teacherAction: 'Provocação temática', studentAction: 'Expressão de expectativas', targetBnccCode: 'EF08LP01' },
      { name: '2. Leitura Guiada & Noticing Estético', durationMin: 15, teacherAction: 'Leitura expressiva', studentAction: 'Acompanhamento crítico', targetBnccCode: 'EF08LP14' },
      { name: '3. Roda de Conversa & Interpretação Polifônica', durationMin: 17, teacherAction: 'Mediação da roda', studentAction: 'Defesa de interpretações', targetBnccCode: 'EF08LP22' },
      { name: '4. Conexões Intertextuais & Registro Crítico', durationMin: 10, teacherAction: 'Ponte intertextual', studentAction: 'Registro reflexivo', targetBnccCode: 'EF08LP16' }
    ]
  },
  {
    id: 'lp_analise_linguistica_ativa',
    name: 'Prática de Análise Linguística Ativa (Travaglia/Bagno)',
    badge: '#047857',
    desc: 'Confronto de variedades, formulação indutiva de regras morfossintáticas e reflexão sobre efeitos de sentido (10+15+15+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Confronto de Textos Reais com Variação',
        durationMin: 10,
        teacherAction: 'Apresentar dois enunciados autênticos (oral vs formal ou regional) com a estrutura em foco',
        studentAction: 'Comparar as duas ocorrências e identificar diferenças de registro e contexto de circulação',
        pedagogicalRole: 'Observação Indutiva de Dados Linguísticos'
      },
      {
        name: '2. Levantamento de Hipóteses Morfossintáticas',
        durationMin: 15,
        teacherAction: 'Instigar os estudantes com perguntas-guia a manipularem as frases (troca de número, pessoa, ordem)',
        studentAction: 'Testar permutações em duplas e formular a regra de funcionamento com as próprias palavras',
        pedagogicalRole: 'Experimentação Epilinguística e Descoberta'
      },
      {
        name: '3. Sistematização da Regra & Efeito de Sentido',
        durationMin: 15,
        teacherAction: 'Sistematizar a nomenclatura gramatical normativa na lousa e analisar a expressividade discursiva da escolha',
        studentAction: 'Registrar a síntese conceitual associando a forma gramatical aos efeitos de sentido pretendidos',
        pedagogicalRole: 'Formalização Conceitual e Sociolinguística'
      },
      {
        name: '4. Aplicação Criativa e Reescrita',
        durationMin: 10,
        teacherAction: 'Propor exercício autoral de reescrita ajustando a variante linguística para um novo destinatário',
        studentAction: 'Reescrever o miniparágrafo aplicando adequadamente a concordância/regência no registro alvo',
        pedagogicalRole: 'Transferência e Domínio Operatório'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — ANÁLISE LINGUÍSTICA ATIVA (TRAVAGLIA/BAGNO):
Divida a aula exatamente em 4 etapas (50 min total):
1. Confronto de Textos Reais com Variação (10 min): Análise indutiva de dados autênticos.
2. Levantamento de Hipóteses Morfossintáticas (15 min): Manipulação linguística em duplas.
3. Sistematização da Regra & Efeito de Sentido (15 min): Da intuição à norma padrão sem preconceito.
4. Aplicação Criativa e Reescrita (10 min): Uso deliberado da estrutura em novo contexto discursivo.`,
    schemaStagesExample: [
      { name: '1. Confronto de Textos Reais com Variação', durationMin: 10, teacherAction: 'Apresentação de dados reais', studentAction: 'Identificação de diferenças', targetBnccCode: 'EF09LP26' },
      { name: '2. Levantamento de Hipóteses Morfossintáticas', durationMin: 15, teacherAction: 'Mediação da manipulação', studentAction: 'Formulação de hipóteses', targetBnccCode: 'EF09LP29' },
      { name: '3. Sistematização da Regra & Efeito de Sentido', durationMin: 15, teacherAction: 'Formalização da norma culta', studentAction: 'Registro de efeitos de sentido', targetBnccCode: 'EF09LP29' },
      { name: '4. Aplicação Criativa e Reescrita', durationMin: 10, teacherAction: 'Desafio de reescrita', studentAction: 'Aplicação contextualizada', targetBnccCode: 'EF09LP15' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. MATEMÁTICA (3 FRAMEWORKS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'mat_resolucao_problemas_polya',
    name: 'Resolução de Problemas em 4 Fases (Polya)',
    badge: '#2563eb',
    desc: 'Compreensão do problema, elaboração do plano, execução estratégica e retrospecto crítico (8+12+18+12 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Compreensão do Problema',
        durationMin: 8,
        teacherAction: 'Apresentar a situação-problema desafiadora sem entregar a fórmula; questionar incógnita, dados e condições',
        studentAction: 'Ler o problema, destacar os dados fornecidos, identificar o que se pede e reescrever o enunciado com suas palavras',
        pedagogicalRole: 'Decodificação e Identificação da Incógnita'
      },
      {
        name: '2. Estabelecimento de um Plano',
        durationMin: 12,
        teacherAction: 'Sugerir heurísticas: fazer um desenho, construir tabela, tentar caso particular menor ou buscar padrão',
        studentAction: 'Discutir em duplas possíveis caminhos de resolução e selecionar uma estratégia lógica',
        pedagogicalRole: 'Heurística e Estratégia de Resolução'
      },
      {
        name: '3. Execução do Plano',
        durationMin: 18,
        teacherAction: 'Acompanhar as duplas sem dar a resposta pronta, intervindo com contraexemplos quando surgirem impasses',
        studentAction: 'Executar os cálculos e representações passo a passo, conferindo cada etapa lógica',
        pedagogicalRole: 'Operação Algébrica e Resolução Efetiva'
      },
      {
        name: '4. Retrospecto & Verificação Crítica',
        durationMin: 12,
        teacherAction: 'Convidar duas duplas com estratégias distintas para a lousa e mediar a verificação da razoabilidade do resultado',
        studentAction: 'Validar a solução substituindo o valor no problema original e analisar se há método mais simples ou generalizável',
        pedagogicalRole: 'Metacognição, Verificação e Generalização'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — RESOLUÇÃO DE PROBLEMAS (POLYA):
Divida a aula exatamente nas 4 fases canônicas de George Polya (50 min total):
1. Compreensão do Problema (8 min): O que é dado? Qual a incógnita? Quais as restrições?
2. Estabelecimento de um Plano (12 min): Heurísticas ativas (desenhar, tabelar, simplificar, backward).
3. Execução do Plano (18 min): Resolução autônoma em duplas com checagem de cada passo.
4. Retrospecto & Verificação Crítica (12 min): O resultado faz sentido físico/real? Há outro método?`,
    schemaStagesExample: [
      { name: '1. Compreensão do Problema', durationMin: 8, teacherAction: 'Mediação da leitura', studentAction: 'Identificação de dados e incógnita', targetBnccCode: 'EF07MA18' },
      { name: '2. Estabelecimento de um Plano', durationMin: 12, teacherAction: 'Provocação de heurísticas', studentAction: 'Escolha de estratégia em duplas', targetBnccCode: 'EF07MA18' },
      { name: '3. Execução do Plano', durationMin: 18, teacherAction: 'Monitoramento consultivo', studentAction: 'Desenvolvimento dos cálculos', targetBnccCode: 'EF07MA18' },
      { name: '4. Retrospecto & Verificação Crítica', durationMin: 12, teacherAction: 'Sistematização comparada', studentAction: 'Verificação do resultado e generalização', targetBnccCode: 'EF07MA18' }
    ]
  },
  {
    id: 'mat_cpa_laboratorio',
    name: 'Laboratório CPA/CRA (Bruner)',
    badge: '#1d4ed8',
    desc: 'Progressão Concreto (materiais) -> Pictórico (barras/gráficos) -> Abstrato (algoritmo formal) (12+15+13+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Exploração com Materiais Concretos',
        durationMin: 12,
        teacherAction: 'Distribuir material manipulativo (material dourado, algebricas, discos de fração) e propor desafio prático',
        studentAction: 'Manusear os blocos físicos para montar e agrupar as quantidades descritas no desafio',
        pedagogicalRole: 'Experiência Concreta e Percepção Tátil'
      },
      {
        name: '2. Representação Pictórica / Esquemática',
        durationMin: 15,
        teacherAction: 'Solicitar que os alunos traduzam o arranjo físico em esquemas de barras, malhas pontilhadas ou desenhos na folha',
        studentAction: 'Desenhar modelos visuais bidimensionais que representem com exatidão a relação entre as partes e o todo',
        pedagogicalRole: 'Ponte Pictórica e Modelagem Visual'
      },
      {
        name: '3. Formalização Abstrata & Algoritmo',
        durationMin: 13,
        teacherAction: 'Conectar cada parte do desenho à notação algébrica formal e demonstrar o algoritmo matemático convencional',
        studentAction: 'Associar os símbolos matemáticos (+, -, x, fração, x) aos seus correspondentes no desenho e resolver algebricamente',
        pedagogicalRole: 'Formalização Algébrica e Notação Matemática'
      },
      {
        name: '4. Desafio de Transferência em Duplas',
        durationMin: 10,
        teacherAction: 'Apresentar problema inédito sem o material concreto, desafiando a aplicação autônoma do raciocínio formal',
        studentAction: 'Resolver o problema novo aplicando diretamente a representação pictórica e a notação formal aprendidas',
        pedagogicalRole: 'Transferência e Consolidação Conceitual'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — LABORATÓRIO CPA/CRA (BRUNER):
Divida a aula obrigatoriamente na progressão epistemológica em 4 etapas (50 min total):
1. Exploração com Materiais Concretos (12 min): Manipulação física para construir intuição sensorial.
2. Representação Pictórica / Esquemática (15 min): Tradução em diagramas de barras ou modelos visuais.
3. Formalização Abstrata & Algoritmo (13 min): Conexão direta dos desenhos à notação algébrica formal.
4. Desafio de Transferência em Duplas (10 min): Resolução autônoma de novo problema sem apoio concreto.`,
    schemaStagesExample: [
      { name: '1. Exploração com Materiais Concretos', durationMin: 12, teacherAction: 'Mediação da manipulação', studentAction: 'Montagem física com material', targetBnccCode: 'EF06MA07' },
      { name: '2. Representação Pictórica / Esquemática', durationMin: 15, teacherAction: 'Orientação dos desenhos', studentAction: 'Esquematização de barras visuais', targetBnccCode: 'EF06MA07' },
      { name: '3. Formalização Abstrata & Algoritmo', durationMin: 13, teacherAction: 'Formalização na lousa', studentAction: 'Registro de equações e algoritmo', targetBnccCode: 'EF06MA07' },
      { name: '4. Desafio de Transferência em Duplas', durationMin: 10, teacherAction: 'Proposição do desafio', studentAction: 'Aplicação abstrata independente', targetBnccCode: 'EF06MA07' }
    ]
  },
  {
    id: 'mat_investigacao_etnomatematica',
    name: 'Investigação Matemática e Modelagem (D’Ambrosio)',
    badge: '#3b82f6',
    desc: 'Problema real do cotidiano/trabalho, coleta de dados, formulação do modelo e tomada de decisão cidadã (10+18+12+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Problematização da Realidade e Dados Reais',
        durationMin: 10,
        teacherAction: 'Apresentar um problema prático da comunidade (consumo de água, tarifa de energia, custos de uma receita familiar)',
        studentAction: 'Analisar as grandezas envolvidas, discutir variáveis e levantar hipóteses quantitativas preliminares',
        pedagogicalRole: 'Contextualização Social e Etnomatemática'
      },
      {
        name: '2. Formulação do Modelo Matemático',
        durationMin: 18,
        teacherAction: 'Apoiar os grupos na escolha de variáveis, montagem de equações/funções e simplificações necessárias',
        studentAction: 'Traduzir a situação real em expressões algébricas ou funções e calcular os valores projetados',
        pedagogicalRole: 'Modelagem Matemática e Álgebra Aplicada'
      },
      {
        name: '3. Validação do Modelo frente à Realidade',
        durationMin: 12,
        teacherAction: 'Confrontar os resultados dos modelos dos grupos com dados empíricos reais, analisando discrepâncias e margens',
        studentAction: 'Testar limites do modelo, discutir fatores não contemplados e calibrar os parâmetros matemáticos',
        pedagogicalRole: 'Crítica Matemática e Validação Empírica'
      },
      {
        name: '4. Tomada de Decisão e Comunicação Cidadã',
        durationMin: 10,
        teacherAction: 'Mediar a elaboração de uma recomendação prática baseada nos cálculos e formalizar os conceitos BNCC',
        studentAction: 'Apresentar síntese argumentativa justificando a melhor decisão financeira/comunitária através da matemática',
        pedagogicalRole: 'Educação Crítica e Tomada de Decisão'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — INVESTIGAÇÃO E MODELAGEM MATEMÁTICA (D'AMBROSIO):
Divida a aula exatamente em 4 etapas (50 min total):
1. Problematização da Realidade e Dados Reais (10 min): Problema comunitário e identificação de variáveis.
2. Formulação do Modelo Matemático (18 min): Construção de equações/funções representativas da realidade.
3. Validação do Modelo frente à Realidade (12 min): Comparação com dados empíricos e ajuste de parâmetros.
4. Tomada de Decisão e Comunicação Cidadã (10 min): Argumentação quantitativa para ação concreta no mundo.`,
    schemaStagesExample: [
      { name: '1. Problematização da Realidade e Dados Reais', durationMin: 10, teacherAction: 'Apresentação do contexto', studentAction: 'Mapeamento de variáveis', targetBnccCode: 'EF08MA15' },
      { name: '2. Formulação do Modelo Matemático', durationMin: 18, teacherAction: 'Consultoria de modelagem', studentAction: 'Montagem e resolução da função', targetBnccCode: 'EF08MA08' },
      { name: '3. Validação do Modelo frente à Realidade', durationMin: 12, teacherAction: 'Provocação de limites do modelo', studentAction: 'Confronto com dados reais', targetBnccCode: 'EF08MA15' },
      { name: '4. Tomada de Decisão e Comunicação Cidadã', durationMin: 10, teacherAction: 'Síntese institucional', studentAction: 'Defesa de proposta prática', targetBnccCode: 'EF08MA25' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. HISTÓRIA (3 FRAMEWORKS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'his_oficina_historiador',
    name: 'Oficina do Historiador e Crítica de Fontes (Bloch)',
    badge: '#b45309',
    desc: 'Problematização, crítica externa/interna de fontes primárias, confronto historiográfico e síntese (8+20+14+8 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Problematização Histórica & Contexto de Época',
        durationMin: 8,
        teacherAction: 'Apresentar um evento histórico através de uma pergunta instigante sobre motivações dos agentes e horizonte da época',
        studentAction: 'Situar o tempo histórico, identificar personagens e expressar concepções prévias sobre o fato',
        pedagogicalRole: 'Problematização Histórica e Temporalidade'
      },
      {
        name: '2. Crítica Interna e Externa de Fontes Primárias',
        durationMin: 20,
        teacherAction: 'Distribuir reproduções de fontes históricas primárias (cartas, jornais de época, decretos, fotografias) com roteiro',
        studentAction: 'Investigar quem produziu a fonte, quando, com qual intencionalidade, identificando silenciamentos e interesses',
        pedagogicalRole: 'Hermenêutica e Interrogação de Documentos'
      },
      {
        name: '3. Confronto de Interpretações Historiográficas',
        durationMin: 14,
        teacherAction: 'Apresentar dois fragmentos de historiadores com visões distintas sobre o mesmo acontecimento',
        studentAction: 'Comparar as teses dos historiadores, avaliar os argumentos de cada um e relacionar às fontes analisadas',
        pedagogicalRole: 'Multiperspectividade e Consciência Histórica'
      },
      {
        name: '4. Síntese do Historiador & Registro Argumentativo',
        durationMin: 8,
        teacherAction: 'Mediar a elaboração de uma síntese coletiva rejeitando o anacronismo e sistematizar os conceitos da BNCC',
        studentAction: 'Redigir parágrafo conclusivo fundamentado em evidências documentais sem julgamento moralista retrospectivo',
        pedagogicalRole: 'Escrita da História e Superação do Anacronismo'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — OFICINA DO HISTORIADOR (MARC BLOCH):
Divida a aula exatamente na triangulação Fato-Fontes-Interpretação (50 min total):
1. Problematização Histórica & Contexto de Época (8 min): Pergunta investigativa temporalmente contextualizada.
2. Crítica Interna e Externa de Fontes Primárias (20 min): Quem escreveu? Quando? Para quem? Com qual interesse?
3. Confronto de Interpretações Historiográficas (14 min): Pluralidade de teses historiográficas sem anacronismo.
4. Síntese do Historiador & Registro Argumentativo (8 min): Redação histórica fundamentada em vestígios.`,
    schemaStagesExample: [
      { name: '1. Problematização Histórica & Contexto de Época', durationMin: 8, teacherAction: 'Provocação investigativa', studentAction: 'Localização cronológica e hipóteses', targetBnccCode: 'EF08HI01' },
      { name: '2. Crítica Interna e Externa de Fontes Primárias', durationMin: 20, teacherAction: 'Roteiro de crítica de fontes', studentAction: 'Interrogação de documentos primários', targetBnccCode: 'EF08HI06' },
      { name: '3. Confronto de Interpretações Historiográficas', durationMin: 14, teacherAction: 'Mediação de pontos de vista', studentAction: 'Comparação de teses de historiadores', targetBnccCode: 'EF08HI07' },
      { name: '4. Síntese do Historiador & Registro Argumentativo', durationMin: 8, teacherAction: 'Sistematização conceitual', studentAction: 'Redação fundamentada sem anacronismo', targetBnccCode: 'EF08HI15' }
    ]
  },
  {
    id: 'his_debate_interpretacoes_conflitantes',
    name: 'Debate Estruturado de Narrativas Conflitantes (Rüsen)',
    badge: '#d97706',
    desc: 'Contexto do dilema histórico, análise de posições antagônicas com documentos, debate regrado e síntese crítica (8+16+16+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Contexto Histórico e Apresentação do Conflito',
        durationMin: 8,
        teacherAction: 'Apresentar o dilema histórico real em que grupos sociais tomaram decisões opostas',
        studentAction: 'Mapear as forças políticas em disputa e as motivações concretas de cada segmento',
        pedagogicalRole: 'Contextualização de Conflitos Sociais'
      },
      {
        name: '2. Análise Documental de Pontos de Vista Opostos',
        durationMin: 16,
        teacherAction: 'Dividir a turma em bancadas e fornecer dossiês documentais defendendo perspectivas conflitantes',
        studentAction: 'Ler os documentos de época do grupo designado, extrair argumentos e antecipar contra-argumentos',
        pedagogicalRole: 'Imersão Documental e Preparação Retórica'
      },
      {
        name: '3. Debate Regrado em Grupos com Evidências',
        durationMin: 16,
        teacherAction: 'Atuar como moderador estrito do debate, exigindo citação textual de fontes para cada afirmação',
        studentAction: 'Expor a posição do segmento histórico, rebater argumentos contrários com base nas fontes e evitar anacronismos',
        pedagogicalRole: 'Debate Histórico e Argumentação com Provas'
      },
      {
        name: '4. Síntese Sem Anacronismo e Consciência Histórica',
        durationMin: 10,
        teacherAction: 'Desarmar os papéis do debate e conduzir reflexão sobre por que o desfecho ocorreu daquela forma histórica',
        studentAction: 'Avaliar as consequências históricas para o presente e registrar síntese integradora no caderno',
        pedagogicalRole: 'Formação da Consciência Histórica'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — DEBATE DE NARRATIVAS CONFLITANTES (RÜSEN/SCHMIDT):
Divida a aula exatamente em 4 etapas estruturadas (50 min total):
1. Contexto Histórico e Apresentação do Conflito (8 min): Forças em disputa e interesses materiais/ideológicos.
2. Análise Documental de Pontos de Vista Opostos (16 min): Preparação de bancadas com dossiês de fontes primárias.
3. Debate Regrado com Evidências (16 min): Sustentação de argumentos históricos baseados estritamente em provas.
4. Síntese Sem Anacronismo e Consciência Histórica (10 min): Reflexão desarmada sobre o sentido histórico para o presente.`,
    schemaStagesExample: [
      { name: '1. Contexto Histórico e Apresentação do Conflito', durationMin: 8, teacherAction: 'Exposição do dilema', studentAction: 'Identificação de atores em conflito', targetBnccCode: 'EF09HI01' },
      { name: '2. Análise Documental de Pontos de Vista Opostos', durationMin: 16, teacherAction: 'Distribuição dos dossiês', studentAction: 'Extração de argumentos das fontes', targetBnccCode: 'EF09HI10' },
      { name: '3. Debate Regrado em Grupos com Evidências', durationMin: 16, teacherAction: 'Mediação regrada do tempo', studentAction: 'Defesa e réplica baseada em fontes', targetBnccCode: 'EF09HI18' },
      { name: '4. Síntese Sem Anacronismo e Consciência Histórica', durationMin: 10, teacherAction: 'Desconstrução dos papéis', studentAction: 'Registro crítico da consciência histórica', targetBnccCode: 'EF09HI23' }
    ]
  },
  {
    id: 'his_estudo_caso_microhistoria',
    name: 'Estudo de Caso Micro-histórico (Ginzburg)',
    badge: '#92400e',
    desc: 'O vestígio singular, reconstituição da trajetória individual, articulação da micro com a macro-história e registro (10+18+14+8 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. O Vestígio Singular: Trajetória Individual',
        durationMin: 10,
        teacherAction: 'Apresentar o caso de uma pessoa comum (trabalhador, mulher escravizada, imigrante) através de um registro raro',
        studentAction: 'Examinar o documento singular (inventário, processo judicial, testamento, diário) e levantar hipóteses sobre sua vida',
        pedagogicalRole: 'Investigação Indiciária e Micro-História'
      },
      {
        name: '2. Reconstituição da Rede de Relações e Cotidiano',
        durationMin: 18,
        teacherAction: 'Fornecer dados contextuais sobre o meio social, família, vizinhança e condições de sobrevivência da época',
        studentAction: 'Mapear a teia de relações sociais da personagem e os constrangimentos e brechas de agência que ela encontrava',
        pedagogicalRole: 'Análise de Redes e Agência Histórica'
      },
      {
        name: '3. Da Micro à Macro-História: Indivíduo e Estrutura',
        durationMin: 14,
        teacherAction: 'Conectar a história particular dessa personagem aos grandes processos econômicos e políticos do período',
        studentAction: 'Explicar de que forma a vida desse indivíduo comum reflete e ao mesmo tempo tensiona as estruturas do império/república',
        pedagogicalRole: 'Articulação Escalar Micro-Macro'
      },
      {
        name: '4. Relatório Narrativo e Lições para o Presente',
        durationMin: 8,
        teacherAction: 'Sistematizar a importância de resgatar vozes subalternas na história e consolidar os conceitos da aula',
        studentAction: 'Redigir síntese narrativa sobre como a micro-história desconstrói visões simplificadoras de grandes heróis',
        pedagogicalRole: 'Historiografia Crítica e Descentralização'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — ESTUDO DE CASO MICRO-HISTÓRICO (GINZBURG):
Divida a aula exatamente em 4 etapas (50 min total):
1. O Vestígio Singular: Trajetória Individual (10 min): Análise indiciária de pessoa comum através de registro único.
2. Reconstituição da Rede de Relações (18 min): Agência, cotidiano e laços comunitários.
3. Da Micro à Macro-História (14 min): Cruzamento da trajetória particular com a grande estrutura social.
4. Relatório Narrativo e Lições para o Presente (8 min): Superação da história de grandes vultos.`,
    schemaStagesExample: [
      { name: '1. O Vestígio Singular: Trajetória Individual', durationMin: 10, teacherAction: 'Apresentação do documento raro', studentAction: 'Análise indiciária inicial', targetBnccCode: 'EF07HI13' },
      { name: '2. Reconstituição da Rede de Relações', durationMin: 18, teacherAction: 'Apoio na leitura contextual', studentAction: 'Mapeamento da rede social', targetBnccCode: 'EF07HI15' },
      { name: '3. Da Micro à Macro-História', durationMin: 14, teacherAction: 'Provocação escalar', studentAction: 'Conexão com a macroestrutura colonial', targetBnccCode: 'EF07HI17' },
      { name: '4. Relatório Narrativo e Lições para o Presente', durationMin: 8, teacherAction: 'Fechamento historiográfico', studentAction: 'Redação da síntese reflexiva', targetBnccCode: 'EF07HI02' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. GEOGRAFIA (3 FRAMEWORKS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'geo_estudo_meio_analise_espacial',
    name: 'Estudo do Meio e Análise Espacial (Milton Santos)',
    badge: '#0d9488',
    desc: 'Observação da paisagem, análise em múltiplas escalas (local ao global), atores socioespaciais e intervenção (8+18+14+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Observação da Paisagem & Pergunta Espacial',
        durationMin: 8,
        teacherAction: 'Apresentar imagem de satélite ou fotografia da paisagem e lançar pergunta sobre as transformações do espaço',
        studentAction: 'Diferenciar elementos naturais e construídos, identificando rugosidades e marcas de diferentes tempos na paisagem',
        pedagogicalRole: 'Leitura da Paisagem e Pergunta-Problema'
      },
      {
        name: '2. Análise Territorial em Múltiplas Escalas',
        durationMin: 18,
        teacherAction: 'Disponibilizar mapas em diferentes escalas (bairro, município, país, mundo) e guiar a correlação entre elas',
        studentAction: 'Localizar o fenômeno no mapa do bairro e identificar de que forma fluxos globais influenciam o espaço vivido local',
        pedagogicalRole: 'Transição Escalar e Pensamento Geográfico'
      },
      {
        name: '3. Cruzamento de Atores Sociais e Fluxos Espaciais',
        durationMin: 14,
        teacherAction: 'Problematizar os interesses contraditórios dos agentes modeladores do espaço (empresas, moradores, poder público)',
        studentAction: 'Mapear em grupos quem ganha e quem perde com a configuração territorial atual daquele espaço',
        pedagogicalRole: 'Relações de Poder e Conflito Socioespacial'
      },
      {
        name: '4. Proposta de Intervenção Socioespacial & Conclusão',
        durationMin: 10,
        teacherAction: 'Mediar a elaboração de propostas viáveis de planejamento urbano ou preservação ambiental',
        studentAction: 'Redigir proposta de intervenção espacial e registrar os conceitos estruturantes (espaço, território, lugar) trabalhados',
        pedagogicalRole: 'Cidadania Espacial e Sistematização'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — ESTUDO DO MEIO E ANÁLISE ESPACIAL (MILTON SANTOS):
Divida a aula exatamente na tríade Espaço-Escala-Sociedade (50 min total):
1. Observação da Paisagem & Pergunta Espacial (8 min): Formas visíveis e rugosidades temporais.
2. Análise Territorial em Múltiplas Escalas (18 min): Do espaço vivido local às redes globais.
3. Cruzamento de Atores Sociais e Fluxos Espaciais (14 min): Tensões entre poder público, capital e comunidade.
4. Proposta de Intervenção Socioespacial (10 min): Solução propositiva e cidadania territorial.`,
    schemaStagesExample: [
      { name: '1. Observação da Paisagem & Pergunta Espacial', durationMin: 8, teacherAction: 'Apresentação da paisagem', studentAction: 'Identificação de elementos no espaço', targetBnccCode: 'EF07GE01' },
      { name: '2. Análise Territorial em Múltiplas Escalas', durationMin: 18, teacherAction: 'Mediação cartográfica multiescalar', studentAction: 'Conexão local-regional-global', targetBnccCode: 'EF07GE04' },
      { name: '3. Cruzamento de Atores Sociais e Fluxos Espaciais', durationMin: 14, teacherAction: 'Provocação sobre agentes espaciais', studentAction: 'Análise de conflitos e interesses', targetBnccCode: 'EF07GE05' },
      { name: '4. Proposta de Intervenção Socioespacial & Conclusão', durationMin: 10, teacherAction: 'Sistematização conceitual', studentAction: 'Elaboração de proposta de melhoria', targetBnccCode: 'EF07GE11' }
    ]
  },
  {
    id: 'geo_cartografia_tematica_ativa',
    name: 'Laboratório de Cartografia Temática Ativa (Castellar)',
    badge: '#0f766e',
    desc: 'Leitura crítica de símbolos/escalas, georreferenciamento de dados, confecção do croqui temático e síntese (10+15+15+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Leitura Crítica de Mapas e Descodificação',
        durationMin: 10,
        teacherAction: 'Apresentar mapa temático com anomalias de escala ou legenda e desafiar a turma a interpretar os códigos gráficos',
        studentAction: 'Decodificar título, legenda, escala numérica/gráfica, orientação e identificar o tema central representado',
        pedagogicalRole: 'Alfabetização Cartográfica e Semiótica Espacial'
      },
      {
        name: '2. Coleta e Georreferenciamento de Dados Locais',
        durationMin: 15,
        teacherAction: 'Fornecer tabela de dados socioeconômicos ou ambientais da região e base cartográfica muda',
        studentAction: 'Categorizar os dados em intervalos de classes e planejar a convenção cartográfica mais adequada (cor, hachura, ponto)',
        pedagogicalRole: 'Tratamento de Dados Geográficos e Estatística Espacial'
      },
      {
        name: '3. Elaboração do Croqui / Mapa Temático',
        durationMin: 15,
        teacherAction: 'Circular orientando o rigor técnico da legenda, proporção da escala e clareza visual dos mapas',
        studentAction: 'Desenhar em duplas o mapa temático aplicando as variáveis visuais de Bertin (tamanho, valor, granulação, cor)',
        pedagogicalRole: 'Produção Cartográfica Prática'
      },
      {
        name: '4. Interpretação Espacial e Síntese Cidadã',
        durationMin: 10,
        teacherAction: 'Projetar os mapas produzidos pelas duplas e conduzir a leitura comparativa dos padrões espaciais revelados',
        studentAction: 'Explicar quais disparidades geográficas o mapa tornou visíveis e como essa informação pode embasar políticas públicas',
        pedagogicalRole: 'Análise Crítica e Pensamento Espacial'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — CARTOGRAFIA TEMÁTICA ATIVA (SONIA CASTELLAR):
Divida a aula exatamente em 4 etapas práticas (50 min total):
1. Leitura Crítica de Mapas e Descodificação (10 min): Título, escala, projeção, orientação e legenda.
2. Coleta e Georreferenciamento de Dados (15 min): Classificação e planejamento semiótico dos símbolos.
3. Elaboração do Croqui / Mapa Temático (15 min): Confecção prática do mapa temático em duplas.
4. Interpretação Espacial e Síntese Cidadã (10 min): O que o mapa revela sobre as desigualdades espaciais?`,
    schemaStagesExample: [
      { name: '1. Leitura Crítica de Mapas e Descodificação', durationMin: 10, teacherAction: 'Mediação semiótica de mapas', studentAction: 'Decodificação dos elementos cartográficos', targetBnccCode: 'EF06GE08' },
      { name: '2. Coleta e Georreferenciamento de Dados Locais', durationMin: 15, teacherAction: 'Disponibilização da base de dados', studentAction: 'Classificação estatística em classes', targetBnccCode: 'EF06GE09' },
      { name: '3. Elaboração do Croqui / Mapa Temático', durationMin: 15, teacherAction: 'Orientação técnica de confecção', studentAction: 'Desenho do mapa temático', targetBnccCode: 'EF06GE08' },
      { name: '4. Interpretação Espacial e Síntese Cidadã', durationMin: 10, teacherAction: 'Discussão comparada', studentAction: 'Análise dos padrões socioespaciais', targetBnccCode: 'EF06GE03' }
    ]
  },
  {
    id: 'geo_julgamento_simulado_socioambiental',
    name: 'Audiência Pública e Conflitos Territoriais (Carlos)',
    badge: '#115e59',
    desc: 'O conflito socioespacial, preparação de bancadas com dados de satélite, audiência simulada e veredito mediado (8+16+18+8 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Apresentação do Conflito Socioambiental',
        durationMin: 8,
        teacherAction: 'Apresentar um caso real de disputa territorial (ex.: barragem, desmatamento de terra indígena, verticalização urbana)',
        studentAction: 'Examinar o mapa da área em conflito e identificar a sobreposição de interesses espaciais',
        pedagogicalRole: 'Caracterização do Território em Disputa'
      },
      {
        name: '2. Preparação de Bancadas de Atores Espaciais',
        durationMin: 16,
        teacherAction: 'Dividir a turma em bancadas (comunidade tradicional, empreendedores, ambientalistas, poder público) com dados técnicos',
        studentAction: 'Analisar relatórios de impacto socioambiental e estruturar argumentos ancorados em dados geográficos e legais',
        pedagogicalRole: 'Apropriação de Indicadores Socioespaciais'
      },
      {
        name: '3. Audiência Pública Simulada e Argumentação',
        durationMin: 18,
        teacherAction: 'Presidir a audiência simulada garantindo tempos iguais de fala e exigindo evidências cartográficas nos discursos',
        studentAction: 'Apresentar sustentação oral de cada bancada, apontar os impactos territoriais e rebater propostas incompatíveis',
        pedagogicalRole: 'Deliberação Pública e Argumentação Territorial'
      },
      {
        name: '4. Veredito e Mediação de Justiça Socioambiental',
        durationMin: 8,
        teacherAction: 'Sistematizar o conceito de território, territorialidade e justiça socioambiental à luz da BNCC',
        studentAction: 'Redigir termo de compromisso ou veredito conciliador que equilibre direitos humanos e preservação',
        pedagogicalRole: 'Justiça Socioespacial e Cidadania Ativa'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — AUDIÊNCIA PÚBLICA SOCIOAMBIENTAL (ANA FANI CARLOS):
Divida a aula exatamente em 4 etapas (50 min total):
1. Apresentação do Conflito Socioambiental (8 min): O território contestado e o caso real.
2. Preparação de Bancadas com Dados Geográficos (16 min): Análise de relatórios de impacto ambiental.
3. Audiência Pública Simulada (18 min): Sustentação oral argumentativa com apoio cartográfico.
4. Veredito e Mediação de Justiça Socioambiental (8 min): Resolução consensual e direitos territoriais.`,
    schemaStagesExample: [
      { name: '1. Apresentação do Conflito Socioambiental', durationMin: 8, teacherAction: 'Apresentação do caso', studentAction: 'Identificação dos atores em litígio', targetBnccCode: 'EF08GE04' },
      { name: '2. Preparação de Bancadas de Atores Espaciais', durationMin: 16, teacherAction: 'Distribuição dos dossiês', studentAction: 'Elaboração de argumentos territoriais', targetBnccCode: 'EF08GE05' },
      { name: '3. Audiência Pública Simulada e Argumentação', durationMin: 18, teacherAction: 'Presidência da audiência', studentAction: 'Debate regrado com provas espaciais', targetBnccCode: 'EF08GE23' },
      { name: '4. Veredito e Mediação de Justiça Socioambiental', durationMin: 8, teacherAction: 'Sistematização conceitual', studentAction: 'Redação de acordo sustentável', targetBnccCode: 'EF08GE01' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. FÍSICA (3 FRAMEWORKS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'fis_poe_prever_observar_explicar',
    name: 'Prever-Observar-Explicar (POE) (White & Gunstone)',
    badge: '#7c3aed',
    desc: 'Previsão fundamentada, observação com coleta de dados, resolução de conflitos cognitivos e formalização matemática (10+15+15+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Previsão Individual Justificada',
        durationMin: 10,
        teacherAction: 'Apresentar a montagem experimental física sem acioná-la; solicitar que cada aluno registre sua previsão com justificativa física',
        studentAction: 'Escrever individualmente o que prevê que acontecerá quando o experimento for liberado e detalhar a teoria espontânea que sustenta sua previsão',
        pedagogicalRole: 'Elicitação de Concepções Prévias e Hipóteses'
      },
      {
        name: '2. Observação do Experimento com Coleta de Dados',
        durationMin: 15,
        teacherAction: 'Executar a demonstração experimental ou liberar simulação PhET, medindo grandezas (tempo, velocidade, força, temperatura)',
        studentAction: 'Observar atentamente o fenômeno em tempo real ou câmera lenta e anotar os dados observados sem preconceitos',
        pedagogicalRole: 'Evidência Empírica e Quebra de Expectativas'
      },
      {
        name: '3. Explicação e Resolução de Conflitos Conceituais',
        durationMin: 15,
        teacherAction: 'Discutir o conflito entre o senso comum e os dados reais; desenhar diagramas de corpo livre com forças atuantes',
        studentAction: 'Confrontar a previsão inicial com o resultado real, identificar por que o senso comum falhou e reelaborar a explicação conceitual',
        pedagogicalRole: 'Acomodação Cognitiva e Modelagem Conceitual'
      },
      {
        name: '4. Formalização Matemática e Novo Desafio',
        durationMin: 10,
        teacherAction: 'Apresentar as leis de Newton/conservação aplicáveis e propor cálculo quantitativo para prever um novo cenário análogo',
        studentAction: 'Aplicar a equação correta ($...$) e resolver o problema quantitativo para o novo caso sem cometer o erro diagnóstico inicial',
        pedagogicalRole: 'Formalismo Algébrico e Transferência'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — PREVER-OBSERVAR-EXPLICAR (POE - WHITE & GUNSTONE):
Divida a aula exatamente nas etapas da modelagem física Fenômeno-Modelo-Formalismo (50 min total):
1. Previsão Individual Justificada (10 min): Aluno declara sua hipótese espontânea por escrito antes de ver o evento.
2. Observação com Coleta de Dados (15 min): Medição do fenômeno concreto real ou em simulação.
3. Explicação e Conflito Cognitivo (15 min): Por que o senso comum falhou? Construção do modelo conceitual (vetores/forças).
4. Formalização Matemática e Transferência (10 min): Equacionamento rigoroso em LaTeX e cálculo para novo caso.`,
    schemaStagesExample: [
      { name: '1. Previsão Individual Justificada', durationMin: 10, teacherAction: 'Apresentação do aparato', studentAction: 'Registro individual da previsão', targetBnccCode: 'EM13CNT101' },
      { name: '2. Observação do Experimento com Coleta de Dados', durationMin: 15, teacherAction: 'Execução do experimento', studentAction: 'Registro de medidas e variáveis', targetBnccCode: 'EM13CNT102' },
      { name: '3. Explicação e Resolução de Conflitos Conceituais', durationMin: 15, teacherAction: 'Mediação do conflito cognitivo', studentAction: 'Desenho de diagramas e superação do erro', targetBnccCode: 'EM13CNT204' },
      { name: '4. Formalização Matemática e Novo Desafio', durationMin: 10, teacherAction: 'Formalização das equações', studentAction: 'Cálculo quantitativo em novo cenário', targetBnccCode: 'EM13CNT301' }
    ]
  },
  {
    id: 'fis_modelagem_investigativa',
    name: 'Ciclo de Modelagem Científica de Hestenes',
    badge: '#6d28d9',
    desc: 'Identificação de variáveis, construção do modelo visual/vetorial, equacionamento preditivo e teste experimental (8+16+16+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Descrição do Fenômeno & Variáveis do Sistema',
        durationMin: 8,
        teacherAction: 'Apresentar um sistema físico complexo e definir com a turma a fronteira do sistema e as interações relevantes',
        studentAction: 'Listar variáveis mensuráveis (massa, aceleração, atrito, resistência do ar) e eleger simplificações necessárias',
        pedagogicalRole: 'Delimitação do Sistema e Variáveis'
      },
      {
        name: '2. Construção do Diagrama Vetorial / Corpo Livre',
        durationMin: 16,
        teacherAction: 'Orientar o isolamento do corpo e a aplicação rigorosa da 3ª Lei de Newton para cada par de forças',
        studentAction: 'Desenhar os vetores de força no diagrama de corpo livre identificando claramente o agente externo de cada força',
        pedagogicalRole: 'Modelagem Conceitual e Vetorial'
      },
      {
        name: '3. Equacionamento Matemático e Previsão Quantitativa',
        durationMin: 16,
        teacherAction: 'Mediar a decomposição de forças nos eixos ortogonais e a aplicação da 2ª Lei da Mecânica',
        studentAction: 'Montar o sistema de equações escalares a partir dos vetores e calcular a aceleração teórica esperada',
        pedagogicalRole: 'Dedução Matemática e Solução Analítica'
      },
      {
        name: '4. Validação Experimental e Limites do Modelo',
        durationMin: 10,
        teacherAction: 'Comparar o resultado algébrico com a medição experimental real de bancada ou vídeo analisador',
        studentAction: 'Calcular o erro percentual, justificar discrepâncias por forças dissipativas e reconhecer a validade do modelo',
        pedagogicalRole: 'Validação Empírica e Epistemologia'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — MODELAGEM CIENTÍFICA (DAVID HESTENES):
Divida a aula exatamente em 4 etapas (50 min total):
1. Descrição do Fenômeno & Variáveis do Sistema (8 min): Simplificações e grandezas relevantes.
2. Construção do Diagrama Vetorial / Corpo Livre (16 min): Vetores e agentes externos sem fórmulas cegas.
3. Equacionamento Matemático e Previsão Quantitativa (16 min): Decomposição em eixos e solução analítica.
4. Validação Experimental e Limites do Modelo (10 min): Confronto da previsão teórica com a medição real.`,
    schemaStagesExample: [
      { name: '1. Descrição do Fenômeno & Variáveis do Sistema', durationMin: 8, teacherAction: 'Delimitação do sistema', studentAction: 'Mapeamento de variáveis', targetBnccCode: 'EM13CNT101' },
      { name: '2. Construção do Diagrama Vetorial / Corpo Livre', durationMin: 16, teacherAction: 'Supervisão do diagrama de forças', studentAction: 'Desenho vetorial rigoroso', targetBnccCode: 'EM13CNT204' },
      { name: '3. Equacionamento Matemático e Previsão Quantitativa', durationMin: 16, teacherAction: 'Apoio na álgebra', studentAction: 'Resolução analítica das equações', targetBnccCode: 'EM13CNT102' },
      { name: '4. Validação Experimental e Limites do Modelo', durationMin: 10, teacherAction: 'Mediação da validação', studentAction: 'Cálculo de erro e conclusão epistemológica', targetBnccCode: 'EM13CNT301' }
    ]
  },
  {
    id: 'fis_experimento_demonstrativo_disrupcao',
    name: 'Demonstração Investigativa com Disrupção Cognitiva',
    badge: '#5b21b6',
    desc: 'Enquete do senso comum, demonstração contraintuitiva, desconstrução do erro e formalismo das Leis de Newton (8+14+16+12 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Enquete do Senso Comum (Conflito de Impetus)',
        durationMin: 8,
        teacherAction: 'Lançar pergunta de múltipla escolha onde o raciocínio de impetus aristotélico/buridaniano pareça óbvio',
        studentAction: 'Votar na alternativa intuitiva e defender em duplas por que acreditam que aquela é a resposta correta',
        pedagogicalRole: 'Evidenciação da Concepção Alternativa'
      },
      {
        name: '2. Realização da Demonstração Surpreendente',
        durationMin: 14,
        teacherAction: 'Executar a demonstração física real onde o resultado contraria frontalmente a intuição da maioria',
        studentAction: 'Presenciar o resultado inesperado, manifestar perplexidade e registrar o que de fato aconteceu',
        pedagogicalRole: 'Desestabilização e Disrupção Cognitiva'
      },
      {
        name: '3. Desconstrução Coletiva do Raciocínio Espontâneo',
        durationMin: 16,
        teacherAction: 'Explicar por que o cérebro humano tende a pensar no impetus e contrapor com a conservação da inércia',
        studentAction: 'Discutir em grupos por que o corpo continua em movimento mesmo sem força aplicada no sentido da velocidade',
        pedagogicalRole: 'Superação Histórico-Conceitual'
      },
      {
        name: '4. Síntese das Leis e Aplicação Segura',
        durationMin: 12,
        teacherAction: 'Formalizar a 1ª Lei de Newton e o conceito de referencial inercial com equações e ilustrações',
        studentAction: 'Resolver dois exercícios diagnósticos sobre o tema, garantindo que não caiam mais no distrator do impetus',
        pedagogicalRole: 'Consolidação e Verificação Diagnóstica'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — DEMONSTRAÇÃO COM DISRUPÇÃO COGNITIVA (VIENNOT/MOREIRA):
Divida a aula exatamente em 4 etapas (50 min total):
1. Enquete do Senso Comum (8 min): Pergunta provocadora que ativa concepções espontâneas.
2. Demonstração Surpreendente (14 min): Experimento ao vivo que refuta a intuição simplista.
3. Desconstrução do Raciocínio Espontâneo (16 min): Por que nossa intuição falhou?
4. Síntese das Leis de Newton e Formalismo (12 min): Enunciado formal e consolidação sem misconceptions.`,
    schemaStagesExample: [
      { name: '1. Enquete do Senso Comum (Conflito de Impetus)', durationMin: 8, teacherAction: 'Enquete diagnóstica', studentAction: 'Voto e justificação prévia', targetBnccCode: 'EM13CNT101' },
      { name: '2. Realização da Demonstração Surpreendente', durationMin: 14, teacherAction: 'Execução do experimento', studentAction: 'Observação da quebra de expectativa', targetBnccCode: 'EM13CNT102' },
      { name: '3. Desconstrução Coletiva do Raciocínio Espontâneo', durationMin: 16, teacherAction: 'Mediação epistemológica', studentAction: 'Compreensão do princípio da inércia', targetBnccCode: 'EM13CNT204' },
      { name: '4. Síntese das Leis e Aplicação Segura', durationMin: 12, teacherAction: 'Formalização matemática', studentAction: 'Resolução de itens diagnósticos', targetBnccCode: 'EM13CNT301' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. QUÍMICA (3 FRAMEWORKS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qui_triangulo_johnstone_laboratorio',
    name: 'Transição nos 3 Níveis de Johnstone',
    badge: '#ea580c',
    desc: 'Observação Macroscópica -> Modelagem Submicroscópica (partículas) -> Representação Simbólica balanceada (10+16+14+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Observação Macroscópica de Evidências Reacionais',
        durationMin: 10,
        teacherAction: 'Demonstrar reação química em tubo ou bancada (mudança de cor, desprendimento gasoso, precipitado)',
        studentAction: 'Anotar rigorosamente todas as evidências visuais, térmicas e de estado físico sem supor fórmulas precipitadas',
        pedagogicalRole: 'Nível Macroscópico / Fenomenológico'
      },
      {
        name: '2. Modelagem Submicroscópica com Partículas',
        durationMin: 16,
        teacherAction: 'Distribuir esferas coloridas ou projetar animação de partículas e desafiar a representação do rearranjo de átomos',
        studentAction: 'Desenhar ou montar as moléculas dos reagentes, quebrar as ligações e reorganizar os átomos nos produtos (conservação de átomos)',
        pedagogicalRole: 'Nível Submicroscópico / Molecular'
      },
      {
        name: '3. Representação Simbólica e Balanceamento',
        durationMin: 14,
        teacherAction: 'Conectar cada grupo de esferas à fórmula química correspondente e demonstrar o balanceamento de coeficientes',
        studentAction: 'Escrever a equação química com estados físicos (s, l, g, aq) e balancear os coeficientes estequiométricos',
        pedagogicalRole: 'Nível Simbólico / Equações Químicas'
      },
      {
        name: '4. Verificação da Conservação da Massa e Aplicação',
        durationMin: 10,
        teacherAction: 'Verificar com a balança a conservação da massa em sistema fechado e lançar um cálculo estequiométrico em mols',
        studentAction: 'Comprovar que a massa dos reagentes é idêntica à dos produtos e resolver o cálculo para uma quantidade dada',
        pedagogicalRole: 'Integração dos 3 Níveis e Lavoisier'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — TRÍADE DE JOHNSTONE (MACRO-SUBMICRO-SIMBÓLICO):
Divida a aula exatamente na integração dos 3 vértices do triângulo químico (50 min total):
1. Nível Macroscópico (10 min): O que os olhos veem (evidências concretas da transformação).
2. Nível Submicroscópico (16 min): O que os átomos fazem (rearranjo de esferas/partículas e conservação).
3. Nível Simbólico (14 min): Como a química escreve (fórmulas corretas e balanceamento de coeficientes).
4. Verificação e Lavoisier (10 min): Prova da conservação e cálculo estequiométrico inicial.`,
    schemaStagesExample: [
      { name: '1. Observação Macroscópica de Evidências Reacionais', durationMin: 10, teacherAction: 'Execução da reação', studentAction: 'Anotação das evidências fenomenológicas', targetBnccCode: 'EM13CNT101' },
      { name: '2. Modelagem Submicroscópica com Partículas', durationMin: 16, teacherAction: 'Orientação das esferas atômicas', studentAction: 'Desenho das partículas e rearranjo', targetBnccCode: 'EM13CNT205' },
      { name: '3. Representação Simbólica e Balanceamento', durationMin: 14, teacherAction: 'Formalização da equação', studentAction: 'Balanceamento estequiométrico formal', targetBnccCode: 'EM13CNT101' },
      { name: '4. Verificação da Conservação da Massa e Aplicação', durationMin: 10, teacherAction: 'Verificação na balança', studentAction: 'Cálculo molar e conclusão', targetBnccCode: 'EM13CNT301' }
    ]
  },
  {
    id: 'qui_estudo_caso_quimica_cotidiana',
    name: 'Estudo de Caso da Química Cotidiana (Mortimer)',
    badge: '#c2410c',
    desc: 'Narrativa de caso real (alimentos, remédios, corrosão), investigação molecular, reatividade e química verde (8+18+14+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Narrativa do Caso Prático do Cotidiano',
        durationMin: 8,
        teacherAction: 'Apresentar um problema autêntico (ex.: por que o abacate escurece, por que o fermento faz o bolo crescer, corrosão de pontes)',
        studentAction: 'Identificar as substâncias presentes no caso e expressar hipóteses sobre os fatores que aceleram ou retardam o processo',
        pedagogicalRole: 'Contextualização Cotidiana e Problematização'
      },
      {
        name: '2. Investigação Química das Espécies e Funções',
        durationMin: 18,
        teacherAction: 'Fornecer fichas técnicas das substâncias ativas e guiar o reconhecimento de funções e polaridade',
        studentAction: 'Localizar grupos funcionais, prever tipo de ligação e interações intermoleculares presentes nas substâncias',
        pedagogicalRole: 'Estrutura Molecular e Propriedades Físico-Químicas'
      },
      {
        name: '3. Discussão de Mecanismos e Reatividade',
        durationMin: 14,
        teacherAction: 'Explicar a influência de temperatura, pH, oxigênio ou catalisadores na velocidade da reação',
        studentAction: 'Escrever as equações químicas do processo e explicar o mecanismo de ação em nível molecular',
        pedagogicalRole: 'Cinética e Mecanismos Reacionais'
      },
      {
        name: '4. Conclusão Sustentável e Química Verde',
        durationMin: 10,
        teacherAction: 'Propor solução preventiva sustentável alinhada aos 12 princípios da Química Verde',
        studentAction: 'Elaborar recomendação prática de conservação, descarte ou substituição de materiais tóxicos',
        pedagogicalRole: 'Sustentabilidade e Tomada de Decisão'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — ESTUDO DE CASO EM QUÍMICA (MORTIMER & MACHADO):
Divida a aula exatamente em 4 etapas (50 min total):
1. Narrativa do Caso Cotidiano (8 min): Fenômeno doméstico ou industrial real.
2. Investigação das Espécies Químicas (18 min): Fórmulas, polaridade, funções e interações.
3. Mecanismos e Fatores de Reatividade (14 min): Por que a reação ocorre nessa velocidade?
4. Solução Sustentável e Química Verde (10 min): Proposta preventiva ecologicamente correta.`,
    schemaStagesExample: [
      { name: '1. Narrativa do Caso Prático do Cotidiano', durationMin: 8, teacherAction: 'Apresentação do caso', studentAction: 'Identificação de hipóteses cotidianas', targetBnccCode: 'EM13CNT104' },
      { name: '2. Investigação Química das Espécies e Funções', durationMin: 18, teacherAction: 'Disponibilização das estruturas', studentAction: 'Reconhecimento funcional e polaridade', targetBnccCode: 'EM13CNT104' },
      { name: '3. Discussão de Mecanismos e Reatividade', durationMin: 14, teacherAction: 'Mediação cinética', studentAction: 'Equacionamento dos fatores de reação', targetBnccCode: 'EM13CNT301' },
      { name: '4. Conclusão Sustentável e Química Verde', durationMin: 10, teacherAction: 'Conexão com Química Verde', studentAction: 'Elaboração de recomendação limpa', targetBnccCode: 'EM13CNT307' }
    ]
  },
  {
    id: 'qui_estequiometria_guiada_pbl',
    name: 'Resolução Orientada de Estequiometria e Soluções',
    badge: '#9a3412',
    desc: 'Desafio industrial/farmacêutico, roteiro guiado de conversão em mols, reagente limitante e custo/pureza (8+16+16+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Desafio Industrial / Farmacêutico',
        durationMin: 8,
        teacherAction: 'Apresentar um problema de fabricação (ex.: produção de aspirina ou purificação de água) com massa alvo exigida',
        studentAction: 'Compreender a necessidade técnica de calcular as quantidades exatas de reagentes para evitar desperdício',
        pedagogicalRole: 'Problematização Prática e Escala de Produção'
      },
      {
        name: '2. Roteiro Passo a Passo de Conversão em Mols',
        durationMin: 16,
        teacherAction: 'Fornecer tabela de 4 passos: Massa dada -> Mols (Massa Molar) -> Proporção Estequiométrica -> Massa Desejada',
        studentAction: 'Calcular as massas molares na tabela periódica e realizar a conversão das grandezas em duplas',
        pedagogicalRole: 'Algoritmo Estequiométrico Estruturado'
      },
      {
        name: '3. Análise de Reagente Limitante e Rendimento',
        durationMin: 16,
        teacherAction: 'Inserir uma restrição real: quantidade finita de um dos reagentes e taxa de rendimento de 85%',
        studentAction: 'Determinar qual reagente se esgota primeiro (limitante), calcular o produto real e justificar o excesso que sobra',
        pedagogicalRole: 'Raciocínio Estequiométrico Avançado'
      },
      {
        name: '4. Balanço Final e Tomada de Decisão',
        durationMin: 10,
        teacherAction: 'Verificar os cálculos na lousa e analisar o custo-benefício econômico e ambiental do rendimento',
        studentAction: 'Apresentar o relatório de produção com a quantidade exata de matéria-prima a comprar e o rendimento real obtido',
        pedagogicalRole: 'Consolidação Quantitativa e Validação'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — ESTEQUIOMETRIA ORIENTADA (PBL QUÍMICA):
Divida a aula exatamente em 4 etapas estruturadas (50 min total):
1. Desafio Industrial / Farmacêutico (8 min): Demanda de produção com metas quantitativas.
2. Roteiro Passo a Passo de Conversão em Mols (16 min): Tabela estruturada de massas molares e proporção estequiométrica.
3. Análise de Reagente Limitante e Rendimento (16 min): Quem acaba primeiro e qual a massa real produzida?
4. Balanço Final e Tomada de Decisão (10 min): Relatório financeiro/ambiental da reação.`,
    schemaStagesExample: [
      { name: '1. Desafio Industrial / Farmacêutico', durationMin: 8, teacherAction: 'Apresentação do desafio', studentAction: 'Identificação de metas de massa', targetBnccCode: 'EM13CNT101' },
      { name: '2. Roteiro Passo a Passo de Conversão em Mols', durationMin: 16, teacherAction: 'Supervisão do algoritmo estequiométrico', studentAction: 'Cálculo de massas molares e proporções', targetBnccCode: 'EM13CNT101' },
      { name: '3. Análise de Reagente Limitante e Rendimento', durationMin: 16, teacherAction: 'Provocação sobre o limitante', studentAction: 'Identificação do excesso e rendimento', targetBnccCode: 'EM13CNT101' },
      { name: '4. Balanço Final e Tomada de Decisão', durationMin: 10, teacherAction: 'Validação dos cálculos', studentAction: 'Apresentação do relatório de síntese', targetBnccCode: 'EM13CNT301' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. BIOLOGIA (3 FRAMEWORKS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'bio_investigacao_ecologica_campo',
    name: 'Investigação Ecológica e Análise de Dados',
    badge: '#16a34a',
    desc: 'Problema ecológico real, coleta e análise de dados populacionais, modelagem de teias e conservação (8+18+14+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Problema Ecológico e Pergunta Investigativa',
        durationMin: 8,
        teacherAction: 'Apresentar dados sobre declínio de uma espécie polinizadora ou proliferação de alga invasora em lago local',
        studentAction: 'Levantar hipóteses sobre os fatores bióticos e abióticos responsáveis pelo desequilíbrio populacional',
        pedagogicalRole: 'Problematização Ecológica Real'
      },
      {
        name: '2. Coleta e Análise de Dados Populacionais',
        durationMin: 18,
        teacherAction: 'Disponibilizar gráficos de densidade populacional ao longo dos anos, dados climáticos e níveis de poluentes',
        studentAction: 'Analisar em grupos as curvas de crescimento populacional e correlacionar as variáveis ambientais com a mortalidade',
        pedagogicalRole: 'Tratamento de Dados Biológicos e Gráficos'
      },
      {
        name: '3. Modelagem de Teias Tróficas e Efeitos Cascata',
        durationMin: 14,
        teacherAction: 'Orientar o diagrama das interações alimentares do ecossistema, questionando os impactos tróficos indiretos',
        studentAction: 'Desenhar a teia trófica completa, prevendo como a alteração daquela população afeta predadores de topo e produtores',
        pedagogicalRole: 'Dinâmica de Comunidades e Fluxo Energético'
      },
      {
        name: '4. Conclusão com Ações de Conservação',
        durationMin: 10,
        teacherAction: 'Conectar o caso às metas de conservação da biodiversidade e sistematizar os conceitos ecológicos da BNCC',
        studentAction: 'Redigir plano de intervenção ecológica com indicadores de recuperação e monitoramento da fauna/flora',
        pedagogicalRole: 'Conservação Biológica e Ação Cidadã'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — INVESTIGAÇÃO ECOLÓGICA E DADOS (MAYR/FUTUYMA):
Divida a aula exatamente em 4 etapas (50 min total):
1. Problema Ecológico e Pergunta Investigativa (8 min): Desequilíbrio populacional concreto.
2. Coleta e Análise de Dados Populacionais (18 min): Leitura de gráficos de densidade e fatores ambientais.
3. Modelagem de Teias Tróficas e Efeito Cascata (14 min): Diagrama de fluxo de matéria e energia.
4. Conclusão com Ações de Conservação (10 min): Proposta de recuperação ecológica fundamentada.`,
    schemaStagesExample: [
      { name: '1. Problema Ecológico e Pergunta Investigativa', durationMin: 8, teacherAction: 'Apresentação do dilema ecológico', studentAction: 'Formulação de hipóteses ecológicas', targetBnccCode: 'EM13CNT206' },
      { name: '2. Coleta e Análise de Dados Populacionais', durationMin: 18, teacherAction: 'Orientação analítica dos gráficos', studentAction: 'Interpretação de curvas populacionais', targetBnccCode: 'EM13CNT206' },
      { name: '3. Modelagem de Teias Tróficas e Efeitos Cascata', durationMin: 14, teacherAction: 'Mediação das relações tróficas', studentAction: 'Desenho da teia trófica articulada', targetBnccCode: 'EM13CNT302' },
      { name: '4. Conclusão com Ações de Conservação', durationMin: 10, teacherAction: 'Sistematização conceitual', studentAction: 'Elaboração de plano de manejo', targetBnccCode: 'EM13CNT302' }
    ]
  },
  {
    id: 'bio_julgamento_bioetico_genomica',
    name: 'Júri Simulado de Bioética e Biotecnologia (Krasilchik)',
    badge: '#15803d',
    desc: 'Caso de edição gênica/transgenia, comissões de evidências científicas, debate bioético regrado e diretriz (8+16+16+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Apresentação do Caso de Edição Gênica',
        durationMin: 8,
        teacherAction: 'Apresentar caso real recente (ex.: uso de CRISPR em embriões humanos para evitar doenças ou mosquitos transgênicos contra dengue)',
        studentAction: 'Compreender o mecanismo molecular básico da tecnologia e os dilemas morais e ambientais envolvidos',
        pedagogicalRole: 'Introdução Biotecnológica e Dilema Ético'
      },
      {
        name: '2. Trabalho em Comissões Científicas e Sociais',
        durationMin: 16,
        teacherAction: 'Dividir a turma em bancadas: Geneticistas defensores, Comitê de Bioética, Associações de Pacientes e Órgãos Reguladores',
        studentAction: 'Ler o material de suporte técnico e formular argumentos baseados em evidências de eficácia, segurança e equidade de acesso',
        pedagogicalRole: 'Pesquisa Orientada e Argumentação Científica'
      },
      {
        name: '3. Audiência do Júri Simulado com Provas',
        durationMin: 16,
        teacherAction: 'Conduzir o júri com rigor nos tempos de argumentação, exigindo precisão biológica dos termos técnicos',
        studentAction: 'Expor pareceres, debater riscos ecológicos e benefícios biomédicos e responder às interpelações dos outros grupos',
        pedagogicalRole: 'Debate Bioético e Letramento Científico'
      },
      {
        name: '4. Redação de Diretriz Ética Regulamentar',
        durationMin: 10,
        teacherAction: 'Desarmar os papéis e conduzir a síntese da regulação biotecnológica responsável conforme a legislação brasileira (CTNBio)',
        studentAction: 'Redigir de forma colegiada um artigo de regulamentação estabelecendo limites éticos claros para o uso da técnica',
        pedagogicalRole: 'Consenso Bioético e Cidadania Científica'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — JÚRI DE BIOÉTICA E BIOTECNOLOGIA (MYRIAM KRASILCHIK):
Divida a aula exatamente em 4 etapas (50 min total):
1. Apresentação do Caso Biotecnológico (8 min): Dilema de engenharia genética contemporâneo.
2. Trabalho em Comissões Especializadas (16 min): Preparação com artigos científicos e marcos regulatórios.
3. Audiência do Júri Simulado (16 min): Sustentação argumentativa sem preconceitos e com precisão biológica.
4. Redação de Diretriz Ética (10 min): Construção coletiva de critérios de biossegurança e direitos humanos.`,
    schemaStagesExample: [
      { name: '1. Apresentação do Caso de Edição Gênica', durationMin: 8, teacherAction: 'Exposição do caso', studentAction: 'Identificação de variáveis biológicas', targetBnccCode: 'EM13CNT304' },
      { name: '2. Trabalho em Comissões Científicas e Sociais', durationMin: 16, teacherAction: 'Supervisão das bancadas', studentAction: 'Estruturação de argumentos técnicos', targetBnccCode: 'EM13CNT304' },
      { name: '3. Audiência do Júri Simulado com Provas', durationMin: 16, teacherAction: 'Mediação do debate regrado', studentAction: 'Sustentação oral com evidências genéticas', targetBnccCode: 'EM13CNT304' },
      { name: '4. Redação de Diretriz Ética Regulamentar', durationMin: 10, teacherAction: 'Fechamento regulatório', studentAction: 'Redação de diretriz ética de biossegurança', targetBnccCode: 'EM13CNT301' }
    ]
  },
  {
    id: 'bio_anatomia_fisiologia_comparada',
    name: 'Laboratório de Fisiologia Comparada (Dobzhansky)',
    badge: '#14532d',
    desc: 'Observação morfológica, mecanismo de homeostase, história evolutiva adaptativa e registro comparado (10+16+14+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Observação Morfológica de Estruturas',
        durationMin: 10,
        teacherAction: 'Apresentar modelos 3D ou ilustrações anatômicas de um mesmo órgão (ex.: coração de peixe, anfíbio, réptil, ave e mamífero)',
        studentAction: 'Examinar o número de cavidades, espessura muscular e trajeto de vasos em cada grupo biológico',
        pedagogicalRole: 'Nível Estrutural / Morfológico'
      },
      {
        name: '2. Investigação do Mecanismo Fisiológico',
        durationMin: 16,
        teacherAction: 'Propor desafio: como cada tipo de coração atende à demanda metabólica e à oxigenação dos tecidos do respectivo animal?',
        studentAction: 'Rastrear o caminho do sangue venoso e arterial, identificando onde ocorre mistura e qual a eficiência energética de cada sistema',
        pedagogicalRole: 'Nível Funcional / Fisiológico e Homeostase'
      },
      {
        name: '3. Análise da Pressão Seletiva e Evolução',
        durationMin: 14,
        teacherAction: 'Contextualizar a conquista do ambiente terrestre e o surgimento da endotermia como pressões seletivas fundamentais',
        studentAction: 'Relacionar a separação completa dos ventrículos com a manutenção da temperatura corporal e alta taxa metabólica em aves/mamíferos',
        pedagogicalRole: 'Nível Evolutivo / Adaptação e Seleção Natural'
      },
      {
        name: '4. Síntese Adaptativa e Registro Comparado',
        durationMin: 10,
        teacherAction: 'Sistematizar a máxima de Dobzhansky ("nada em biologia faz sentido exceto à luz da evolução") e formalizar os conceitos',
        studentAction: 'Preencher quadro comparativo integrando Estrutura -> Função -> Vantagem Evolutiva para os grupos analisados',
        pedagogicalRole: 'Integração Teórica e Síntese Evolutiva'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — FISIOLOGIA COMPARADA E EVOLUÇÃO (DOBZHANSKY):
Divida a aula exatamente na tríade Estrutura-Função-Evolução (50 min total):
1. Nível Estrutural / Morfológico (10 min): Observação anatômica comparada entre grupos de seres vivos.
2. Nível Funcional / Fisiológico (16 min): Mecanismo de circulação, transporte e homeostase metabólica.
3. Nível Evolutivo / Seleção Natural (14 min): Por que essa estrutura foi selecionada no ambiente terrestre/endotermia?
4. Síntese Comparada (10 min): Quadro comparativo integrado: Estrutura -> Função -> Pressão Evolutiva.`,
    schemaStagesExample: [
      { name: '1. Observação Morfológica de Estruturas', durationMin: 10, teacherAction: 'Mediação anatômica', studentAction: 'Mapeamento de cavidades e tecidos', targetBnccCode: 'EM13CNT207' },
      { name: '2. Investigação do Mecanismo Fisiológico', durationMin: 16, teacherAction: 'Provocação funcional', studentAction: 'Rastreamento do trajeto sanguíneo e oxigenação', targetBnccCode: 'EM13CNT207' },
      { name: '3. Análise da Pressão Seletiva e Evolução', durationMin: 14, teacherAction: 'Conexão evolutiva de Mayr', studentAction: 'Explicação da vantagem seletiva endotérmica', targetBnccCode: 'EM13CNT208' },
      { name: '4. Síntese Adaptativa e Registro Comparado', durationMin: 10, teacherAction: 'Fechamento comparativo', studentAction: 'Preenchimento da matriz Estrutura-Função-Evolução', targetBnccCode: 'EM13CNT202' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. CIÊNCIAS DO ENSINO FUNDAMENTAL II (3 FRAMEWORKS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'cie_investigacao_guiada',
    name: 'Sequência de Ensino Investigativo - ENCI (Carvalho)',
    badge: '#0284c7',
    desc: 'Problematização empírica, manipulação experimental, sistematização coletiva e registro no diário de bordo (10+18+14+8 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Problematização Inicial e Hipóteses',
        durationMin: 10,
        teacherAction: 'Apresentar um desafio prático concreto (ex.: como fazer uma massa de modelar flutuar ou como separar sal e areia)',
        studentAction: 'Trabalhar em equipes de 3 ou 4 estudantes levantando hipóteses de resolução e desenhando o plano de teste',
        pedagogicalRole: 'Problematização Investigativa Inicial'
      },
      {
        name: '2. Manipulação Experimental e Coleta',
        durationMin: 18,
        teacherAction: 'Disponibilizar os materiais simples e seguros de laboratório e circular incentivando a anotação das tentativas',
        studentAction: 'Executar os testes práticos, testar formas diferentes do material, observar resultados e anotar medições',
        pedagogicalRole: 'Experimentação Empírica e Manipulação'
      },
      {
        name: '3. Sistematização Coletiva e Explicação',
        durationMin: 14,
        teacherAction: 'Reunir as equipes em semicírculo e instigar: por que algumas formas flutuaram e outras afundaram? Introduzir densidade/empuxo',
        studentAction: 'Compartilhar o que deu certo e o que falhou, verbalizar a explicação com suas próprias palavras e associar ao conceito científico',
        pedagogicalRole: 'Construção Social do Conhecimento Científico'
      },
      {
        name: '4. Conclusão no Diário de Bordo Científico',
        durationMin: 8,
        teacherAction: 'Orientar o registro esquemático ilustrado individual no caderno de ciências, consolidando a habilidade BNCC',
        studentAction: 'Desenhar o experimento antes e depois, redigindo a conclusão científica em linguagem acessível e precisa',
        pedagogicalRole: 'Registro Individual e Formalização'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — ENSINO DE CIÊNCIAS POR INVESTIGAÇÃO (ENCI - ANNA MARIA CARVALHO):
Divida a aula exatamente na sequência investigativa em 4 etapas (50 min total):
1. Problematização Inicial e Hipóteses (10 min): Desafio empírico aberto sem resposta prévia.
2. Manipulação Experimental e Coleta (18 min): Teste prático em pequenos grupos com materiais acessíveis.
3. Sistematização Coletiva e Explicação (14 min): Roda de conversa guiada ligando evidências a conceitos científicos.
4. Conclusão no Diário de Bordo (8 min): Registro ilustrado e textual da descoberta pelo estudante.`,
    schemaStagesExample: [
      { name: '1. Problematização Inicial e Hipóteses', durationMin: 10, teacherAction: 'Lançamento do problema experimental', studentAction: 'Desenho de hipóteses pelas crianças', targetBnccCode: 'EF06CI01' },
      { name: '2. Manipulação Experimental e Coleta', durationMin: 18, teacherAction: 'Supervisão de bancada segura', studentAction: 'Execução e teste prático em equipes', targetBnccCode: 'EF06CI02' },
      { name: '3. Sistematização Coletiva e Explicação', durationMin: 14, teacherAction: 'Mediação do diálogo científico', studentAction: 'Verbalização da explicação causal', targetBnccCode: 'EF06CI01' },
      { name: '4. Conclusão no Diário de Bordo Científico', durationMin: 8, teacherAction: 'Orientação do registro', studentAction: 'Escrita e desenho no diário de bordo', targetBnccCode: 'EF06CI02' }
    ]
  },
  {
    id: 'cie_feira_ciencias_prototipagem',
    name: 'Prototipagem e Feira de Ciências (Driver/Duschl)',
    badge: '#0369a1',
    desc: 'Desafio tecnológico escolar, construção de protótipo em equipe, ciclo de aprimoramento e demonstração pública (8+20+12+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Desafio Tecnológico / Científico da Escola',
        durationMin: 8,
        teacherAction: 'Apresentar desafio de engenharia escolar (ex.: construir filtro de água caseiro, minipulmão funcional ou paraquedas de ovos)',
        studentAction: 'Analisar os critérios de sucesso e as restrições de materiais recicláveis fornecidos',
        pedagogicalRole: 'Engenharia Escolar e Desafio de Design'
      },
      {
        name: '2. Construção e Teste do Protótipo em Equipes',
        durationMin: 20,
        teacherAction: 'Monitorar o trabalho colaborativo, dando dicas de segurança e incentivando a persistência diante de falhas iniciais',
        studentAction: 'Montar fisicamente o protótipo em grupos de 4 alunos e submetê-lo ao primeiro teste de funcionamento',
        pedagogicalRole: 'Prototipagem Ativa e Teste Empírico'
      },
      {
        name: '3. Registro das Falhas e Aperfeiçoamento',
        durationMin: 12,
        teacherAction: 'Orientar a análise de causas de falha: qual princípio científico não foi respeitado na primeira montagem?',
        studentAction: 'Identificar vazamentos ou desequilíbrios, ajustar o projeto e realizar o segundo teste com sucesso',
        pedagogicalRole: 'Iteração e Pensamento Científico Corretivo'
      },
      {
        name: '4. Demonstração dos Resultados e Autoavaliação',
        durationMin: 10,
        teacherAction: 'Organizar a mini-feira de ciências na sala com avaliação formativa por rubrica compartilhada',
        studentAction: 'Demonstrar o funcionamento do protótipo aos colegas explicando a ciência por trás do invento',
        pedagogicalRole: 'Divulgação Científica e Autoavaliação'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — PROTOTIPAGEM E FEIRA DE CIÊNCIAS (DRIVER/DUSCHL):
Divida a aula exatamente em 4 etapas (50 min total):
1. Desafio Tecnológico da Escola (8 min): Missão de design com materiais recicláveis/seguros.
2. Construção e Teste do Protótipo (20 min): Montagem colaborativa e primeira prova prática.
3. Registro das Falhas e Aperfeiçoamento (12 min): Ciclo de melhoria baseado em evidências.
4. Demonstração e Autoavaliação (10 min): Apresentação pública da ciência por trás da engenhoca.`,
    schemaStagesExample: [
      { name: '1. Desafio Tecnológico / Científico da Escola', durationMin: 8, teacherAction: 'Apresentação da missão', studentAction: 'Planejamento do protótipo em equipe', targetBnccCode: 'EF07CI01' },
      { name: '2. Construção e Teste do Protótipo em Equipes', durationMin: 20, teacherAction: 'Apoio na construção', studentAction: 'Montagem física e primeiro teste', targetBnccCode: 'EF07CI01' },
      { name: '3. Registro das Falhas e Aperfeiçoamento', durationMin: 12, teacherAction: 'Provocação diagnóstica', studentAction: 'Ajuste do protótipo com base científica', targetBnccCode: 'EF07CI01' },
      { name: '4. Demonstração dos Resultados e Autoavaliação', durationMin: 10, teacherAction: 'Condução da feira de ciências', studentAction: 'Demonstração oral e autoavaliação', targetBnccCode: 'EF07CI09' }
    ]
  },
  {
    id: 'cie_observatorio_astronomico_ecologico',
    name: 'Observatório de Fenômenos Celestes e Terrestres',
    badge: '#075985',
    desc: 'Pergunta sobre o céu/Terra, simulação 3D (Stellarium/modelos), desmistificação de concepções alternativas e registro (8+18+14+10 = 50 min)',
    reasoningOrder: 'standard',
    defaultStages: [
      {
        name: '1. Pergunta Desafiadora sobre o Céu ou Meio Físico',
        durationMin: 8,
        teacherAction: 'Apresentar uma pergunta provocadora: por que a Lua muda de formato? Por que o verão no Brasil é inverno na Europa?',
        studentAction: 'Compartilhar hipóteses prévias desenhando a posição da Terra, Sol e Lua no caderno',
        pedagogicalRole: 'Elicitação de Modelos Mentais Espaciais'
      },
      {
        name: '2. Simulação Espacial com Modelos 3D / Stellarium',
        durationMin: 18,
        teacherAction: 'Projetar software de simulação astronômica ou orientar o uso de esferas de isopor e lanterna em ambiente escurecido',
        studentAction: 'Manipular os modelos em duplas, girando a Terra ao redor do Sol e observando a iluminação relativa das faces',
        pedagogicalRole: 'Simulação Tridimensional e Perspectiva Espacial'
      },
      {
        name: '3. Desmistificação de Concepções Alternativas',
        durationMin: 14,
        teacherAction: 'Confrontar diretamente o erro clássico: demonstrar que as fases da Lua NÃO são a sombra da Terra e que as estações NÃO dependem da distância ao Sol',
        studentAction: 'Constatar empiricamente na simulação a inclinação do eixo terrestre de ~23,5° e a geometria de iluminação da Lua',
        pedagogicalRole: 'Desmistificação Diagnóstica e Reconstrução Conceitual'
      },
      {
        name: '4. Registro do Mapa Celeste / Relatório de Observação',
        durationMin: 10,
        teacherAction: 'Orientar a elaboração do esquema explicativo correto com legendas técnicas e formalizar os conceitos BNCC',
        studentAction: 'Desenhar a geometria correta no caderno com anotações claras sobre afélio/periélio, solstícios/equinócios e lunação',
        pedagogicalRole: 'Consolidação e Registro Científico Rigoroso'
      }
    ],
    promptDirective: `ESTRUTURA PEDAGÓGICA OBRIGATÓRIA — OBSERVATÓRIO DE FENÔMENOS CELESTES E TERRESTRES:
Divida a aula exatamente em 4 etapas (50 min total):
1. Pergunta Desafiadora sobre o Céu (8 min): Hipóteses iniciais sobre fenômenos astronômicos/geológicos.
2. Simulação Espacial com Modelos 3D (18 min): Manipulação concreta ou digital da iluminação e eixos orbitais.
3. Desmistificação de Concepções Alternativas (14 min): Refutação explícita: fases da Lua NÃO são sombra da Terra; estações NÃO são distância ao Sol.
4. Registro do Relatório de Observação (10 min): Diagrama correto com eixos, raios solares e fases explicadas.`,
    schemaStagesExample: [
      { name: '1. Pergunta Desafiadora sobre o Céu ou Meio Físico', durationMin: 8, teacherAction: 'Provocação astronômica', studentAction: 'Desenho da hipótese prévia', targetBnccCode: 'EF08CI12' },
      { name: '2. Simulação Espacial com Modelos 3D / Stellarium', durationMin: 18, teacherAction: 'Mediação da simulação orbital', studentAction: 'Manipulação de modelos Sol-Terra-Lua', targetBnccCode: 'EF08CI13' },
      { name: '3. Desmistificação de Concepções Alternativas', durationMin: 14, teacherAction: 'Desconstrução do erro da sombra', studentAction: 'Compreensão da geometria de iluminação', targetBnccCode: 'EF08CI12' },
      { name: '4. Registro do Mapa Celeste / Relatório de Observação', durationMin: 10, teacherAction: 'Sistematização conceitual', studentAction: 'Esquema final com legendas técnicas', targetBnccCode: 'EF08CI14' }
    ]
  }
]
