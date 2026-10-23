/**
 * subjectRubrics.ts — 8 Rubricas Analíticas Oficiais por Disciplina (Escala 0–5)
 * 
 * Fornece rubricas analíticas calibradas com descritores explícitos para níveis 5, 3, 1 e 0:
 * - LP-R1: Produção Textual (5 Competências ENEM adaptada EF)
 * - LP-R2: Análise Linguística Epilinguística
 * - MAT-R1: Resolução de Problemas (4 Fases de Polya)
 * - HIS-R1: Oficina do Historiador (Crítica Documental & Multiperspectividade)
 * - GEO-R1: Análise Espacial e Cartográfica Cidadã
 * - FIS-R1: Modelagem Física e Argumentação Científica
 * - QUI-R1: Interconexão dos 3 Níveis de Johnstone
 * - BIO-R1: Pensamento Evolutivo e Argumentação Bioética
 * - CIE-R1: Investigação Científica no EF II (Problematização e Evidência)
 * 
 * Inclui motor de reconciliação de discrepância inter-avaliadores (Inter-Rater Reliability).
 */

export interface RubricCriterion {
  id: string
  name: string
  maxScore: number
  descriptors: {
    '5': string // Excelente / Domínio Pleno
    '3': string // Adequado / Desenvolvimento Básico
    '1': string // Insuficiente / Frágil
    '0': string // Não atende / Ausente
    [key: string]: string
  }
}

export interface SubjectRubric {
  id: string
  subject: string
  name: string
  description: string
  criteria: RubricCriterion[]
}

// ─── Catálogo de Rubricas Analíticas ──────────────────────────────────────────

export const SUBJECT_RUBRICS_CATALOG: SubjectRubric[] = [
  // 1. MATEMÁTICA: Resolução de Problemas (4 Fases de Polya)
  {
    id: 'MAT-R1',
    subject: 'math',
    name: 'Rubrica Analítica de Resolução de Problemas (Polya)',
    description: 'Avalia a progressão heurística nas 4 fases da resolução de problemas matemáticos',
    criteria: [
      {
        id: 'c1_compreensao',
        name: 'Fase 1: Compreensão e Modelagem do Problema',
        maxScore: 5,
        descriptors: {
          '5': 'Identifica perfeitamente todos os dados, a incógnita central e as condições restritivas, traduzindo o enunciado para linguagem matemática sem ambiguidades.',
          '3': 'Identifica a maioria dos dados e a incógnita principal, mas omite restrições secundárias ou comete imprecisões leves na interpretação.',
          '1': 'Apresenta compreensão fragmentada ou confusa dos dados; confunde a incógnita com os valores fornecidos.',
          '0': 'Não demonstra compreensão do problema ou não identifica os dados fundamentais.'
        }
      },
      {
        id: 'c2_plano',
        name: 'Fase 2: Escolha da Estratégia e Estabelecimento do Plano',
        maxScore: 5,
        descriptors: {
          '5': 'Seleciona uma estratégia heurística eficiente (desenho, tabela, simplificação ou equação) perfeitamente adequada ao tipo de problema.',
          '3': 'Propõe um plano coerente, porém com passos redundantes ou menos econômicos, que ainda assim conduz à solução.',
          '1': 'Tenta aplicar procedimentos mecânicos ou fórmulas desconexas do contexto sem plano estruturado.',
          '0': 'Ausência de qualquer plano ou estratégia visível.'
        }
      },
      {
        id: 'c3_execucao',
        name: 'Fase 3: Execução e Precisão Algébrica',
        maxScore: 5,
        descriptors: {
          '5': 'Executa todas as etapas do plano com exatidão operatória, justificando passagens lógicas e apresentando resposta correta com as unidades adequadas.',
          '3': 'Executa o plano com lógica correta, mas comete deslizes aritméticos menores que não comprometem o raciocínio estrutural.',
          '1': 'Comete erros conceituais graves de cálculo (ex.: somar denominadores, sinais incorretos na transposição), inviabilizando o resultado.',
          '0': 'Cálculos incoerentes ou ausência de resolução.'
        }
      },
      {
        id: 'c4_retrospecto',
        name: 'Fase 4: Retrospecto, Verificação e Generalização',
        maxScore: 5,
        descriptors: {
          '5': 'Verifica criticamente a razoabilidade do resultado no contexto real, testa o valor na equação original e propõe método alternativo ou generalização.',
          '3': 'Confere a resposta apenas com cálculo direto, reconhecendo se o valor é plausível, mas sem demonstrar método alternativo.',
          '1': 'Aceita resultados manifestamente absurdos (ex.: distâncias negativas, porcentagens de 5000%) sem qualquer verificação crítica.',
          '0': 'Não realiza retrospecto nem verifica a solução.'
        }
      }
    ]
  },

  // 2. HISTÓRIA: Oficina do Historiador (Bloch/Rüsen)
  {
    id: 'HIS-R1',
    subject: 'history',
    name: 'Rubrica da Oficina do Historiador e Crítica Documental',
    description: 'Avalia a interrogação de fontes primárias, contextualização temporal e superação do anacronismo',
    criteria: [
      {
        id: 'c1_critica_fontes',
        name: 'Crítica Hermenêutica de Fontes Primárias',
        maxScore: 5,
        descriptors: {
          '5': 'Interroga rigorosamente a fonte histórica (autoria, época, intencionalidade, suporte e silenciamentos), tratando o documento como monumento/vestígio.',
          '3': 'Extrai informações úteis da fonte, mas a trata como verdade documental absoluta, sem questionar profundamente as intencionalidades do autor.',
          '1': 'Faz leitura meramente ilustrativa da fonte, ignorando o contexto de produção e sua tipologia.',
          '0': 'Ignora a fonte primária na argumentação.'
        }
      },
      {
        id: 'c2_temporalidade_anacronismo',
        name: 'Temporalidade e Superação do Anacronismo',
        maxScore: 5,
        descriptors: {
          '5': 'Analisa as ações dos sujeitos históricos estritamente a partir dos horizontes culturais de sua época, refutando qualquer juízo moral retrospectivo anacrônico.',
          '3': 'Situa o evento no tempo correto, mas faz comentários ocasionais que flertam com o anacronismo, ainda que sem comprometer a análise central.',
          '1': 'Julga ostensivamente o passado com leis e valores éticos contemporâneos do século XXI, incorrendo em anacronismo grosseiro.',
          '0': 'Confusão temporal completa de épocas históricas distintas.'
        }
      },
      {
        id: 'c3_multiperspectividade',
        name: 'Multiperspectividade e Agência Histórica',
        maxScore: 5,
        descriptors: {
          '5': 'Confronta múltiplas visões historiográficas e reconhece a agência de sujeitos plurais (trabalhadores, mulheres, indígenas, escravizados) além das elites.',
          '3': 'Menciona a existência de pontos de vista diferentes, mas prioriza a narrativa hegemônica tradicional.',
          '1': 'Reduz o processo histórico à visão monocausal dos grandes heróis ou líderes isolados.',
          '0': 'Narrativa maniqueísta simplória sem perspectiva histórica.'
        }
      }
    ]
  },

  // 3. GEOGRAFIA: Análise Espacial e Cartográfica Cidadã (Santos/Castellar)
  {
    id: 'GEO-R1',
    subject: 'geography',
    name: 'Rubrica de Análise Espacial e Cartografia Temática',
    description: 'Avalia o raciocínio geográfico multiescalar e a precisão da representação cartográfica',
    criteria: [
      {
        id: 'c1_alfabetizacao_cartografica',
        name: 'Linguagem e Rigor Cartográfico',
        maxScore: 5,
        descriptors: {
          '5': 'Emprega corretamente os elementos cartográficos (título, legenda proporcional, escala correta, coordenadas e orientação) com semiótica impecável.',
          '3': 'Elabora mapa legível com título e legenda adequados, mas com imprecisões no cálculo de escala ou proporção gráfica.',
          '1': 'Apresenta croqui sem legenda ou com inversão conceitual de escala (ex.: confundir escala grande com denominador grande).',
          '0': 'Representação ilegível ou ausência de produto cartográfico.'
        }
      },
      {
        id: 'c2_articulacao_escalar',
        name: 'Articulação Escalar (Local ao Global)',
        maxScore: 5,
        descriptors: {
          '5': 'Articula com maestria o fenômeno na escala local do espaço vivido às redes econômicas e geopolíticas globais, demonstrando o raciocínio geográfico.',
          '3': 'Descreve o fenômeno no espaço local ou global, mas tem dificuldade de conectar as duas escalas de forma integrada.',
          '1': 'Análise restrita a descrições visuais estáticas da paisagem imediata sem explicação espacial.',
          '0': 'Ausência de consideração sobre escala ou espaço.'
        }
      },
      {
        id: 'c3_justica_socioambiental',
        name: 'Dinâmica Socioambiental e Cidadania Territorial',
        maxScore: 5,
        descriptors: {
          '5': 'Identifica com precisão as contradições territoriais e interesses dos atores sociais, propondo intervenções viáveis de sustentabilidade e justiça espacial.',
          '3': 'Reconhece o impacto ambiental ou social, mas propõe soluções genéricas sem considerar os limites territoriais concretos.',
          '1': 'Recai em determinismo geográfico simplista (atribuir pobreza unicamente ao clima ou relevo).',
          '0': 'Não aborda a dimensão socioambiental.'
        }
      }
    ]
  },

  // 4. FÍSICA: Modelagem Física e Argumentação Científica (Viennot/Hestenes)
  {
    id: 'FIS-R1',
    subject: 'physics',
    name: 'Rubrica de Modelagem Física e Argumentação Científica',
    description: 'Avalia a transição do fenômeno ao modelo vetorial conceitual e formalismo algébrico',
    criteria: [
      {
        id: 'c1_modelo_vetorial',
        name: 'Modelagem Conceitual e Diagrama de Forças',
        maxScore: 5,
        descriptors: {
          '5': 'Isola o corpo corretamente e constrói o diagrama de corpo livre com todos os vetores de força bem orientados e agentes externos identificados, superando o impetus.',
          '3': 'Desenha os vetores de força principais com ligeiras falhas de escala ou orientação, mas sem inserir forças fantasmas de movimento.',
          '1': 'Inclui forças inexistentes no sentido da velocidade (impetus medieval) ou trata Normal e Peso como par de ação/reação.',
          '0': 'Não apresenta diagrama vetorial ou confunde forças com grandezas escalares.'
        }
      },
      {
        id: 'c2_formalismo_matematico',
        name: 'Formalismo Físico-Matemático e Conservação',
        maxScore: 5,
        descriptors: {
          '5': 'Deduz equações escalares a partir dos princípios fundamentais (Leis de Newton ou Teoremas de Conservação) com unidades do SI perfeitas em cada passo.',
          '3': 'Aplica a fórmula correta e obtém resultado coerente, mas comete deslizes nas unidades de medida ou omite passos intermediários da dedução.',
          '1': 'Mistura fórmulas memorizadas mecanicamente sem compatibilidade dimensional com o sistema físico analisado.',
          '0': 'Manipulação algébrica desconexa dos princípios da física.'
        }
      },
      {
        id: 'c3_argumentacao_poe',
        name: 'Argumentação Científica e Validação Empírica',
        maxScore: 5,
        descriptors: {
          '5': 'Explica o fenômeno físico fundamentando causas e efeitos com modelos teóricos, explicitando os limites de validade das simplificações adotadas.',
          '3': 'Explica o resultado com coerência empírica, mas sem aprofundar os limites teóricos do modelo.',
          '1': 'Apresenta explicações tautológicas (ex.: "cai porque tem que cair") baseadas no senso comum.',
          '0': 'Ausência de argumentação conceitual.'
        }
      }
    ]
  },

  // 5. QUÍMICA: Tríade de Johnstone (Macro, Submicro e Representacional)
  {
    id: 'QUI-R1',
    subject: 'chemistry',
    name: 'Rubrica dos Três Níveis de Johnstone em Química',
    description: 'Avalia a articulação simultânea entre fenômeno macroscópico, arranjo submicroscópico e equação simbólica',
    criteria: [
      {
        id: 'c1_fenomenologico_macro',
        name: 'Nível Macroscópico: Observação e Evidências',
        maxScore: 5,
        descriptors: {
          '5': 'Descreve com precisão todas as evidências macroscópicas da transformação química (precipitação, gás, cor, calor) sem confundir com propriedades atômicas.',
          '3': 'Registra as evidências principais da reação, com pequenas imprecisões de vocabulário experimental.',
          '1': 'Confunde dissolução física com reação química ou ignora gases participantes do balanço de massa.',
          '0': 'Não relata evidências observáveis.'
        }
      },
      {
        id: 'c2_submicroscopico',
        name: 'Nível Submicroscópico: Partículas e Ligações',
        maxScore: 5,
        descriptors: {
          '5': 'Representa com exatidão o rearranjo de átomos, íons e moléculas, demonstrando conservação de espécies e quebra/formação de ligações químicas.',
          '3': 'Representa o modelo de partículas de forma compreensível, mas com pequenas imperfeições na proporção relativa dos átomos.',
          '1': 'Atribui propriedades macroscópicas a átomos individuais (ex.: átomo de cobre maleável) ou altera a identidade das moléculas.',
          '0': 'Ausência de modelo submicroscópico.'
        }
      },
      {
        id: 'c3_simbolico_estequiometrico',
        name: 'Nível Representacional: Simbolismo e Estequiometria',
        maxScore: 5,
        descriptors: {
          '5': 'Escreve a equação química balanceada com índices corretos, estados físicos indicados e cálculo estequiométrico em mols sem desvios dimensionais.',
          '3': 'Equação corretamente balanceada, com pequenos erros nos cálculos estequiométricos de rendimento ou pureza.',
          '1': 'Altera índices atômicos das fórmulas para forçar o balanceamento ou ignora a conservação estequiométrica.',
          '0': 'Fórmulas incorretas ou ausência de equacionamento.'
        }
      }
    ]
  },

  // 6. BIOLOGIA: Pensamento Evolutivo e Bioética (Mayr/Dobzhansky)
  {
    id: 'BIO-R1',
    subject: 'biology',
    name: 'Rubrica de Pensamento Evolutivo e Argumentação Bioética',
    description: 'Avalia a integração Estrutura-Função-Evolução e a fundamentação ética em biotecnologia',
    criteria: [
      {
        id: 'c1_evolucao_nao_teleologica',
        name: 'Explicação Evolutiva por Seleção Natural',
        maxScore: 5,
        descriptors: {
          '5': 'Explica a adaptação estritamente por variação pré-existente e reprodução diferencial, rejeitando qualquer teleologia lamarckista ou necessidade induzida.',
          '3': 'Compreende a seleção natural, mas utiliza pontualmente expressões descuidadas (ex.: "o animal precisou se adaptar") sem intenção teleológica formal.',
          '1': 'Afirma categoricamente que o meio induz mutações adaptativas de propósito para a sobrevivência do organismo (lamarckismo ingênuo).',
          '0': 'Explicação pré-científica ou sem fundamentação biológica.'
        }
      },
      {
        id: 'c2_estrutura_funcao',
        name: 'Integração Fisiológica e Morfológica',
        maxScore: 5,
        descriptors: {
          '5': 'Articula o nível celular/molecular com a morfologia tecidual e os mecanismos de homeostase fisiológica do organismo de forma integrada.',
          '3': 'Descreve a estrutura e a função adequadamente, mas de maneira compartimentada sem conectar à homeostase geral.',
          '1': 'Confunde funções de órgãos vitais ou apresenta modelos fisiológicos anatomicamente equivocados.',
          '0': 'Ausência de descrição estrutural ou funcional.'
        }
      },
      {
        id: 'c3_argumentacao_bioetica',
        name: 'Argumentação Bioética e Biossegurança',
        maxScore: 5,
        descriptors: {
          '5': 'Sustenta posicionamentos éticos baseados em dados científicos de biossegurança (CTNBio), equidade social e princípios da bioética.',
          '3': 'Defende ponto de vista com argumentos científicos razoáveis, mas sem aprofundar os marcos regulatórios de biossegurança.',
          '1': 'Argumentação baseada em preconceitos morais ou sensacionalismo sem evidências biológicas.',
          '0': 'Sem fundamentação ou consideração bioética.'
        }
      }
    ]
  },

  // 7. CIÊNCIAS EF II: Ensino Investigativo (Carvalho/Driver)
  {
    id: 'CIE-R1',
    subject: 'science',
    name: 'Rubrica de Investigação Científica no Ensino Fundamental II',
    description: 'Avalia a atitude investigativa, registro empírico e construção coletiva da explicação científica',
    criteria: [
      {
        id: 'c1_problematizacao_hipotese',
        name: 'Formulação de Problemas e Hipóteses Testáveis',
        maxScore: 5,
        descriptors: {
          '5': 'Formula hipóteses claras e passíveis de teste empírico a partir da observação de fenômenos naturais, prevendo variáveis de controle.',
          '3': 'Formula hipóteses coerentes, mas com dificuldades de definir variáveis que possam ser testadas experimentalmente.',
          '1': 'Apresenta palpites desconexos da observação que não permitem teste empírico.',
          '0': 'Não formula hipóteses nem questionamentos investigativos.'
        }
      },
      {
        id: 'c2_evidencia_dados',
        name: 'Coleta de Evidências e Registro no Diário de Bordo',
        maxScore: 5,
        descriptors: {
          '5': 'Registra observações, tabelas e desenhos esquemáticos com fidelidade aos dados empíricos observados, sem distorcer o resultado para casar com a teoria.',
          '3': 'Registra a maioria dos dados no diário de bordo com clareza razoável, com poucas omissões metodológicas.',
          '1': 'Registros desorganizados, incompletos ou alterados para esconder falhas no experimento.',
          '0': 'Ausência de registro empírico.'
        }
      },
      {
        id: 'c3_explicacao_conceitual',
        name: 'Construção da Explicação Científica Fundamentada',
        maxScore: 5,
        descriptors: {
          '5': 'Constrói a explicação causal do fenômeno ligando as evidências coletadas aos modelos teóricos adequados à faixa etária (6º ao 9º ano).',
          '3': 'Explica o fenômeno com base no que observou, mas com vocabulário informal e conceitos ainda em fase de formalização.',
          '1': 'Mantém concepções alternativas persistentes mesmo após o experimento refutá-las (ex.: manter que a Lua tem fases pela sombra da Terra).',
          '0': 'Não constrói explicação científica.'
        }
      }
    ]
  },

  // 8. LÍNGUA PORTUGUESA: Análise Linguística Epilinguística (Geraldi/Travaglia)
  {
    id: 'LP-R2',
    subject: 'portuguese',
    name: 'Rubrica de Análise Linguística Epilinguística e Variação',
    description: 'Avalia a reflexão sobre o uso, a forma gramatical e os efeitos de sentido no discurso',
    criteria: [
      {
        id: 'c1_reflexao_epilinguistica',
        name: 'Reflexão Epilinguística sobre a Forma',
        maxScore: 5,
        descriptors: {
          '5': 'Manipula estruturas morfossintáticas identificando regularidades e formulando regras indutivas com autonomia e rigor metalinguístico.',
          '3': 'Identifica as classes de palavras e funções sintáticas fundamentais com apoio de exemplos, cometendo hesitações conceituais leves.',
          '1': 'Decora nomenclaturas gramaticais mecanicamente sem conseguir aplicá-las na identificação prática em textos reais.',
          '0': 'Incompreensão das estruturas linguísticas básicas.'
        }
      },
      {
        id: 'c2_efeitos_sentido',
        name: 'Análise dos Efeitos de Sentido e Discurso',
        maxScore: 5,
        descriptors: {
          '5': 'Explica com clareza como a escolha de uma determinada estrutura sintática ou conectivo altera a persuasão, ênfase ou sentido global do texto.',
          '3': 'Reconhece o sentido básico pretendido pelo autor, mas tem dificuldade em articular como a gramática construiu esse efeito.',
          '1': 'Trata a gramática como conjunto de regras arbitrárias sem qualquer conexão com a intencionalidade discursiva.',
          '0': 'Não relaciona forma linguística e sentido discursivo.'
        }
      },
      {
        id: 'c3_variacao_sociolinguistica',
        name: 'Adequação ao Contexto e Variação Linguística',
        maxScore: 5,
        descriptors: {
          '5': 'Reconhece e valoriza a diversidade dialetal brasileira, identificando o registro adequado a cada situação comunicativa sem preconceito linguístico.',
          '3': 'Identifica a diferença entre linguagem formal e informal, mas demonstra resquícios de juízo preconceituoso sobre variedades regionais.',
          '1': 'Classifica manifestações linguísticas legítimas de forma maniqueísta como "certo vs errado" absoluto.',
          '0': 'Desconhece o conceito de variação linguística.'
        }
      }
    ]
  }
]

// ─── Motor de Reconciliação Inter-Avaliadores (Inter-Rater Reliability) ────────

export interface SubjectRubricScore {
  criterionId: string
  score: number // 0 a 5
  feedback: string
}

export interface SubjectRubricEvaluation {
  evaluatorId: string
  rubricId: string
  scores: SubjectRubricScore[]
  generalNotes?: string
}

export interface ReconciledCriterionScore {
  criterionId: string
  finalScore: number
  scoreA: number
  scoreB: number
  discrepancy: number
  reconciliationMethod: 'average' | 'consensus' | 'arbitrated'
  justification: string
}

export interface ReconciledRubricScore {
  rubricId: string
  totalFinalScore: number
  maxTotalScore: number
  criteriaScores: ReconciledCriterionScore[]
  needsArbitration: boolean
  auditReport: string
}

/**
 * Reconcilia duas avaliações independentes da mesma produção de estudante sob uma rubrica analítica:
 * - Se discrepância <= 1 ponto em cada critério: calcula média ponderada.
 * - Se discrepância >= 2 pontos em qualquer critério: sinaliza divergência e requer arbitragem.
 */
export function reconcileRubricScores(
  evaluatorA: SubjectRubricEvaluation,
  evaluatorB: SubjectRubricEvaluation,
  arbitrator?: SubjectRubricEvaluation
): ReconciledRubricScore {
  if (evaluatorA.rubricId !== evaluatorB.rubricId) {
    throw new Error(`Incompatibilidade de rubricas na reconciliação: ${evaluatorA.rubricId} vs ${evaluatorB.rubricId}`)
  }

  const rubric = SUBJECT_RUBRICS_CATALOG.find(r => r.id === evaluatorA.rubricId)
  const maxScore = rubric ? rubric.criteria.reduce((sum, c) => sum + c.maxScore, 0) : 15

  const criteriaScores: ReconciledCriterionScore[] = []
  let hasCriticalDiscrepancy = false
  const auditLines: string[] = []

  evaluatorA.scores.forEach(scoreItemA => {
    const scoreItemB = evaluatorB.scores.find(s => s.criterionId === scoreItemA.criterionId)
    const valA = scoreItemA.score
    const valB = scoreItemB ? scoreItemB.score : valA
    const discrepancy = Math.abs(valA - valB)

    let finalScore = (valA + valB) / 2
    let method: 'average' | 'consensus' | 'arbitrated' = 'average'
    let justification = ''

    if (discrepancy === 0) {
      method = 'consensus'
      finalScore = valA
      justification = `Consenso perfeito entre avaliadores (${valA}/5).`
    } else if (discrepancy <= 1) {
      method = 'average'
      finalScore = Number(((valA + valB) / 2).toFixed(1))
      justification = `Discrepância aceitável de 1 ponto (${valA} vs ${valB}). Aplicada média aritmética (${finalScore}).`
    } else {
      hasCriticalDiscrepancy = true
      if (arbitrator) {
        const arbScoreItem = arbitrator.scores.find(s => s.criterionId === scoreItemA.criterionId)
        if (arbScoreItem) {
          method = 'arbitrated'
          finalScore = arbScoreItem.score
          justification = `Discrepância severa de ${discrepancy} pontos (${valA} vs ${valB}). Desempate oficial por árbitro terceiro: ${finalScore}/5.`
        } else {
          justification = `Discrepância severa de ${discrepancy} pontos (${valA} vs ${valB}). Aguardando pontuação do terceiro avaliador.`
        }
      } else {
        justification = `Discrepância crítica de ${discrepancy} pontos (${valA} vs ${valB}). Requer arbitragem de terceiro avaliador sênior.`
      }
    }

    criteriaScores.push({
      criterionId: scoreItemA.criterionId,
      finalScore,
      scoreA: valA,
      scoreB: valB,
      discrepancy,
      reconciliationMethod: method,
      justification
    })

    auditLines.push(`- Critério ${scoreItemA.criterionId}: Avaliador A=${valA}, Avaliador B=${valB} -> Final=${finalScore} [${method}]`)
  })

  const totalFinalScore = Number(criteriaScores.reduce((sum, c) => sum + c.finalScore, 0).toFixed(1))

  return {
    rubricId: evaluatorA.rubricId,
    totalFinalScore,
    maxTotalScore: maxScore,
    criteriaScores,
    needsArbitration: hasCriticalDiscrepancy && !arbitrator,
    auditReport: `RELATÓRIO DE AUDITORIA DE RECONCILIAÇÃO PSICOMÉTRICA (${evaluatorA.rubricId}):\n${auditLines.join('\n')}\nStatus: ${hasCriticalDiscrepancy && !arbitrator ? 'PENDENTE DE ARBITRAGEM (Discrepância >= 2)' : 'RECONCILIAÇÃO CONCLUÍDA'}`
  }
}
