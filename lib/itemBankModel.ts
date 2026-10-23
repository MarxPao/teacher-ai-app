/**
 * itemBankModel.ts — Modelo Psicométrico do Banco de Itens com Vinculação Diagnóstica
 * 
 * Modela itens de múltipla escolha com:
 * - Vinculação estrita a códigos BNCC e Misconceptions catalogadas (MIS-ID)
 * - Racional pedagógico diagnóstico por distrator
 * - Metadados de calibração psicométrica (Teoria Clássica dos Testes: Dificuldade p e Discriminação r_pb)
 * - 8 itens curriculares oficiais representativos cobrindo todas as disciplinas
 */

export interface DistractorRationale {
  letter: 'A' | 'B' | 'C' | 'D' | 'E'
  text: string
  isCorrect: boolean
  misconceptionCode?: string // ex: 'LP-MIS-01', 'MAT-MIS-01', 'FIS-MIS-01'
  diagnosticRationale: string // Diagnóstico do erro cognitivo subjacente
}

export interface SubjectBankItem {
  id: string
  subject: string // 'portuguese' | 'math' | 'history' | 'geography' | 'physics' | 'chemistry' | 'biology' | 'science'
  gradeStage: string // '6ano' | '7ano' | '8ano' | '9ano' | 'em1' | 'em2' | 'em3'
  bnccSkillCode: string
  stem: string
  supportTextOrMedia?: string
  options: DistractorRationale[]
  correctOption: 'A' | 'B' | 'C' | 'D' | 'E'
  explanation: string
  difficultyIndex?: number // p (0 a 1, proporção de acertos esperada)
  discriminationIndex?: number // r_pb (índice de discriminação ponto-bisserial)
  targetTriadDimension?: string
}

// ─── 8 Itens Canônicos Oficiais Vinculados a Misconceptions ──────────────────

export const CANONICAL_MULTI_SUBJECT_ITEMS: SubjectBankItem[] = [
  // 1. LÍNGUA PORTUGUESA (LP-MIS-01: Concordância com sujeito composto pós-posto)
  {
    id: 'ITEM-LP-01',
    subject: 'portuguese',
    gradeStage: '8ano',
    bnccSkillCode: 'EF08LP08',
    stem: 'No trecho "Ainda não _____ à reunião o diretor e os coordenadores pedagógicos", a concordância verbal de acordo com a norma-padrão da língua portuguesa admite:',
    options: [
      {
        letter: 'A',
        text: 'Apenas a forma "compareceram", pois o sujeito é composto e plural.',
        isCorrect: false,
        misconceptionCode: 'LP-MIS-01',
        diagnosticRationale: 'O aluno ignora a possibilidade da concordância atrativa com o núcleo mais próximo quando o sujeito composto está pós-posto ao verbo.'
      },
      {
        letter: 'B',
        text: 'Tanto a forma "compareceu" (concordando com o núcleo mais próximo "o diretor") quanto "compareceram" (concordando com a totalidade dos núcleos).',
        isCorrect: true,
        diagnosticRationale: 'Gabarito correto: com sujeito composto pós-posto ao verbo, a norma-padrão admite concordância gramatical no plural ou atrativa no singular.'
      },
      {
        letter: 'C',
        text: 'Apenas a forma "compareceu", pois o primeiro substantivo é o núcleo regente da oração.',
        isCorrect: false,
        misconceptionCode: 'LP-MIS-02',
        diagnosticRationale: 'O aluno considera a concordância atrativa como a única forma obrigatória, desconhecendo a regra canônica de pluralização.'
      },
      {
        letter: 'D',
        text: 'A forma "compareceram-se", empregando a partícula apassivadora.',
        isCorrect: false,
        misconceptionCode: 'LP-MIS-04',
        diagnosticRationale: 'Confusão com voz passiva sintética em verbos intransitivos.'
      }
    ],
    correctOption: 'B',
    explanation: 'De acordo com a norma gramatical (Bechara, 2009), quando o sujeito composto vem posposto ao verbo, são admitidas duas concordâncias: a gramatical (verbo no plural: compareceram) e a atrativa (verbo concordando com o primeiro núcleo: compareceu).',
    difficultyIndex: 0.58,
    discriminationIndex: 0.42,
    targetTriadDimension: 'Forma (Estrutura Morfossintática)'
  },

  // 2. MATEMÁTICA (MAT-MIS-01: Soma ingênua de numeradores e denominadores)
  {
    id: 'ITEM-MAT-01',
    subject: 'math',
    gradeStage: '6ano',
    bnccSkillCode: 'EF06MA07',
    stem: 'Em uma receita de suco concentrado, Maria misturou 1/2 litro de suco de laranja com 1/3 de litro de suco de maracujá. A quantidade total de suco misturado em litros é:',
    options: [
      {
        letter: 'A',
        text: '2/5 de litro.',
        isCorrect: false,
        misconceptionCode: 'MAT-MIS-01',
        diagnosticRationale: 'Erro diagnóstico clássico: soma direta de numeradores (1+1=2) e denominadores (2+3=5), ignorando a necessidade de frações equivalentes.'
      },
      {
        letter: 'B',
        text: '5/6 de litro.',
        isCorrect: true,
        diagnosticRationale: 'Gabarito correto: frações equivalentes com MMC(2,3) = 6: 3/6 + 2/6 = 5/6.'
      },
      {
        letter: 'C',
        text: '1/5 de litro.',
        isCorrect: false,
        misconceptionCode: 'MAT-MIS-02',
        diagnosticRationale: 'Multiplicação indevida de frações tentando realizar uma adição.'
      },
      {
        letter: 'D',
        text: '2/6 de litro.',
        isCorrect: false,
        misconceptionCode: 'MAT-MIS-03',
        diagnosticRationale: 'Soma dos numeradores mantendo o produto dos denominadores de forma inconsistente.'
      }
    ],
    correctOption: 'B',
    explanation: 'Para somar frações com denominadores distintos, converte-se ao mesmo denominador comum via MMC: 1/2 = 3/6 e 1/3 = 2/6. Logo, 3/6 + 2/6 = 5/6.',
    difficultyIndex: 0.62,
    discriminationIndex: 0.48,
    targetTriadDimension: 'Abstrato (Símbolos/Equações)'
  },

  // 3. HISTÓRIA (HIS-MIS-01: Anacronismo moral e retrospectivo)
  {
    id: 'ITEM-HIS-01',
    subject: 'history',
    gradeStage: '7ano',
    bnccSkillCode: 'EF07HI13',
    stem: 'Ao analisar um testamento do século XVII na capitania de São Vicente em que um colonizador legava indígenas escravizados aos seus herdeiros, um estudante afirmou: "Esse colonizador agia de forma ilegal porque a Constituição brasileira de 1988 proíbe qualquer tipo de servidão". A afirmação do estudante incorre em:',
    options: [
      {
        letter: 'A',
        text: 'Anacronismo histórico, ao julgar práticas do passado com leis e valores contemporâneos que não existiam naquela temporalidade.',
        isCorrect: true,
        diagnosticRationale: 'Gabarito correto: anacronismo conceitual ao projetar a ordem constitucional de 1988 sobre o século XVII.'
      },
      {
        letter: 'B',
        text: 'Teleologia histórica, por afirmar que a escravidão foi abolida inevitavelmente pelo destino.',
        isCorrect: false,
        misconceptionCode: 'HIS-MIS-02',
        diagnosticRationale: 'Confunde anacronismo com visão teleológica determinista.'
      },
      {
        letter: 'C',
        text: 'Crítica hermenêutica de fontes, por confrontar a fonte documental com o código jurídico.',
        isCorrect: false,
        misconceptionCode: 'HIS-MIS-03',
        diagnosticRationale: 'Confunde equívoco anacrônico com procedimento metodológico legítimo do historiador.'
      },
      {
        letter: 'D',
        text: 'Eurocentrismo metodológico, ao priorizar as leis de Portugal sobre o direito costumeiro.',
        isCorrect: false,
        misconceptionCode: 'HIS-MIS-04',
        diagnosticRationale: 'Associa incorretamente a falha anacrônica a viés eurocêntrico.'
      }
    ],
    correctOption: 'A',
    explanation: 'O erro consiste em julgar a sociedade paulista colonial seiscentista à luz de preceitos constitucionais instituídos três séculos depois, constituindo anacronismo histórico.',
    difficultyIndex: 0.55,
    discriminationIndex: 0.45,
    targetTriadDimension: 'Fontes Primárias (Vestígios Documentais)'
  },

  // 4. GEOGRAFIA (GEO-MIS-01: Inversão de escala cartográfica)
  {
    id: 'ITEM-GEO-01',
    subject: 'geography',
    gradeStage: '6ano',
    bnccSkillCode: 'EF06GE08',
    stem: 'Um estudante precisa escolher um mapa que apresente o maior nível de detalhamento das ruas e praças do seu bairro. Ele encontrou três opções com as seguintes escalas: Mapa 1 (1:10.000), Mapa 2 (1:250.000) e Mapa 3 (1:1.000.000). A opção mais adequada e sua justificativa técnica são:',
    options: [
      {
        letter: 'A',
        text: 'Mapa 3, porque a escala 1:1.000.000 possui o maior número no denominador, sendo portanto a maior escala.',
        isCorrect: false,
        misconceptionCode: 'GEO-MIS-01',
        diagnosticRationale: 'Inversão conceitual clássica: o aluno confunde a grandeza numérica do denominador com a magnitude da escala fracionária.'
      },
      {
        letter: 'B',
        text: 'Mapa 1, pois 1/10.000 é uma fração maior do que as outras duas, configurando uma escala grande que representa uma área menor com rica riqueza de detalhes.',
        isCorrect: true,
        diagnosticRationale: 'Gabarito correto: escala grande (denominador pequeno) representa menor redução e maior riqueza de detalhes cadastrais.'
      },
      {
        letter: 'C',
        text: 'Mapa 2, por ser uma escala intermediária que equilibra o país inteiro com as ruas locais.',
        isCorrect: false,
        misconceptionCode: 'GEO-MIS-02',
        diagnosticRationale: 'Uso de heurística de meio-termo desprovida de rigor matemático cartográfico.'
      },
      {
        letter: 'D',
        text: 'Qualquer um dos três, pois a riqueza de detalhes de um mapa independe da escala adotada.',
        isCorrect: false,
        misconceptionCode: 'GEO-MIS-03',
        diagnosticRationale: 'Desconhecimento da relação causal entre escala métrica e generalização cartográfica.'
      }
    ],
    correctOption: 'B',
    explanation: 'A escala cartográfica é uma relação fracionária (1/D). Quanto menor o denominador D, maior é a fração e maior a escala, permitindo visualizar objetos pequenos como ruas e praças com alto detalhamento.',
    difficultyIndex: 0.52,
    discriminationIndex: 0.50,
    targetTriadDimension: 'Escala de Análise (Local ao Global)'
  },

  // 5. FÍSICA (FIS-MIS-01: Concepção de impetus buridaniano)
  {
    id: 'ITEM-FIS-01',
    subject: 'physics',
    gradeStage: 'em1',
    bnccSkillCode: 'EM13CNT102',
    stem: 'Uma bola de futebol é chutada e sobe verticalmente no ar. Desprezando a resistência do ar, no ponto médio da trajetória ascendente, as forças que atuam sobre a bola são:',
    options: [
      {
        letter: 'A',
        text: 'A força do chute para cima (impetus) e a força peso para baixo, sendo a do chute maior para fazê-la subir.',
        isCorrect: false,
        misconceptionCode: 'FIS-MIS-01',
        diagnosticRationale: 'Concepção espontânea medieval de impetus de Buridan: acreditar que o corpo em movimento para cima mantém uma força atuando no sentido da velocidade.'
      },
      {
        letter: 'B',
        text: 'Apenas a força peso, dirigida verticalmente para baixo.',
        isCorrect: true,
        diagnosticRationale: 'Gabarito correto: após perder o contato com o pé, a única interação de campo que atua sobre a bola (no vácuo) é a gravidade.'
      },
      {
        letter: 'C',
        text: 'A força normal da gravidade e a inércia como força de propulsão.',
        isCorrect: false,
        misconceptionCode: 'FIS-MIS-02',
        diagnosticRationale: 'Tratar a inércia (propriedade da matéria) como uma força física aplicada.'
      },
      {
        letter: 'D',
        text: 'Nenhuma força, pois no ar a bola se encontra em estado de gravidade zero.',
        isCorrect: false,
        misconceptionCode: 'FIS-MIS-03',
        diagnosticRationale: 'Confusão entre movimento livre e ausência de campo gravitacional.'
      }
    ],
    correctOption: 'B',
    explanation: 'Conforme a 1ª Lei de Newton, a bola continua em movimento ascendente por inércia. A única força atuante após perder o contato com o pé é a força peso exercida pela Terra dirigida para baixo.',
    difficultyIndex: 0.44,
    discriminationIndex: 0.55,
    targetTriadDimension: 'Modelo Conceitual (Representação Vetorial/Diagramas)'
  },

  // 6. QUÍMICA (QUI-MIS-01: Conservação de massa em recipientes abertos)
  {
    id: 'ITEM-QUI-01',
    subject: 'chemistry',
    gradeStage: 'em1',
    bnccSkillCode: 'EM13CNT101',
    stem: 'Uma porção de palha de aço seca é colocada sobre uma balança de precisão ao ar livre, registrando 10,0 g. Em seguida, a palha de aço é submetida a queima branda, oxidando-se completamente em óxido de ferro. Após a combustão, ao ar livre, a massa indicada na balança:',
    options: [
      {
        letter: 'A',
        text: 'Diminui, pois a combustão queima a matéria transformando-a em cinzas mais leves.',
        isCorrect: false,
        misconceptionCode: 'QUI-MIS-01',
        diagnosticRationale: 'Raciocínio intuitivo macroscópico de queima (resquício do flogisto): achar que toda combustão diminui a massa do sólido.'
      },
      {
        letter: 'B',
        text: 'Aumenta, porque os átomos de ferro incorporam quimicamente átomos de oxigênio do ar ambiente na formação do óxido.',
        isCorrect: true,
        diagnosticRationale: 'Gabarito correto: 4 Fe(s) + 3 O2(g) -> 2 Fe2O3(s). O oxigênio gasoso incorporado ao sólido aumenta a massa pesada no prato da balança.'
      },
      {
        letter: 'C',
        text: 'Permanece estritamente 10,0 g, pois a Lei de Lavoisier garante que a massa nunca se altera em nenhuma circunstância.',
        isCorrect: false,
        misconceptionCode: 'QUI-MIS-02',
        diagnosticRationale: 'Aplicação dogmática da Lei de Lavoisier sem reconhecer a condição de sistema aberto vs sistema fechado.'
      },
      {
        letter: 'D',
        text: 'Cai a zero, pois a queima consome todas as ligações químicas do metal.',
        isCorrect: false,
        misconceptionCode: 'QUI-MIS-03',
        diagnosticRationale: 'Confusão extrema entre transformação química e destruição de átomos.'
      }
    ],
    correctOption: 'B',
    explanation: 'Como a reação ocorre em sistema aberto, o gás oxigênio (O2) da atmosfera reage com o ferro metálico (Fe), formando óxido de ferro sólido. A massa do oxigênio incorporado passa a ser medida pela balança, aumentando a massa final.',
    difficultyIndex: 0.48,
    discriminationIndex: 0.52,
    targetTriadDimension: 'Nível Submicroscópico (Átomos/Moléculas/Íons)'
  },

  // 7. BIOLOGIA (BIO-MIS-01: Lamarckismo ingênuo e teleologia adaptativa)
  {
    id: 'ITEM-BIO-01',
    subject: 'biology',
    gradeStage: 'em3',
    bnccSkillCode: 'EM13CNT208',
    stem: 'Em um hospital, o uso frequente de um determinado antibiótico resultou no aumento da porcentagem de bactérias resistentes. Sob a perspectiva da Teoria Sintética da Evolução (Neodarwinismo), a explicação científica correta para esse fenômeno é:',
    options: [
      {
        letter: 'A',
        text: 'O antibiótico induziu mutações adaptativas nas bactérias para que elas pudessem sobreviver naquele ambiente.',
        isCorrect: false,
        misconceptionCode: 'BIO-MIS-01',
        diagnosticRationale: 'Lamarckismo/teleologia: conceber que o meio ambiente direciona mutações de propósito em resposta a uma necessidade do organismo.'
      },
      {
        letter: 'B',
        text: 'Bactérias com mutações pré-existentes de resistência sobreviveram à ação seletiva do antibiótico e proliferaram com maior frequência.',
        isCorrect: true,
        diagnosticRationale: 'Gabarito correto: seleção natural atua sobre variabilidade genética gerada previamente por mutações aleatórias.'
      },
      {
        letter: 'C',
        text: 'As bactérias aprenderam a metabolizar o antibiótico e transmitiram esse hábito adquirido aos seus descendentes.',
        isCorrect: false,
        misconceptionCode: 'BIO-MIS-02',
        diagnosticRationale: 'Lei do uso e desuso e herança de caracteres adquiridos.'
      },
      {
        letter: 'D',
        text: 'O antibiótico perdeu sua potência química devido à umidade do ar hospitalar.',
        isCorrect: false,
        misconceptionCode: 'BIO-MIS-03',
        diagnosticRationale: 'Explicação física espúria desconsiderando a dinâmica populacional biológica.'
      }
    ],
    correctOption: 'B',
    explanation: 'A seleção natural não cria a variação; ela atua selecionando diferencialmente indivíduos portadores de mutações que já existiam na população antes da exposição ao agente seletivo (antibiótico).',
    difficultyIndex: 0.56,
    discriminationIndex: 0.46,
    targetTriadDimension: 'Pressão Evolutiva (Adaptação e Seleção Natural)'
  },

  // 8. CIÊNCIAS EF II (CIE-MIS-01: Fases da Lua causadas pela sombra da Terra)
  {
    id: 'ITEM-CIE-01',
    subject: 'science',
    gradeStage: '8ano',
    bnccSkillCode: 'EF08CI12',
    stem: 'Ao observar o céu noturno ao longo de um mês, um estudante nota que a porção iluminada da Lua varia gradualmente, passando pelas fases nova, crescente, cheia e minguante. Essa variação ocorre porque:',
    options: [
      {
        letter: 'A',
        text: 'A sombra da Terra é projetada sobre a Lua, cobrindo parte do satélite dependendo do dia do mês.',
        isCorrect: false,
        misconceptionCode: 'CIE-MIS-01',
        diagnosticRationale: 'Erro diagnóstico astronômico clássico: confundir as fases da Lua com a projeção cônica da sombra da Terra em um eclipse lunar.'
      },
      {
        letter: 'B',
        text: 'A posição relativa entre Sol, Terra e Lua faz com que vejamos frações diferentes da face da Lua que está iluminada pelo Sol.',
        isCorrect: true,
        diagnosticRationale: 'Gabarito correto: a metade da Lua voltada para o Sol está sempre iluminada; a perspectiva a partir da Terra é que varia na órbita.'
      },
      {
        letter: 'C',
        text: 'A Lua se afasta e se aproxima da Terra, recebendo mais ou menos luz solar.',
        isCorrect: false,
        misconceptionCode: 'CIE-MIS-02',
        diagnosticRationale: 'Atribuir a variação de brilho e fase à distância orbital.'
      },
      {
        letter: 'D',
        text: 'Nuvens na alta atmosfera terrestre cobrem parcialmente o disco lunar durante a noite.',
        isCorrect: false,
        misconceptionCode: 'CIE-MIS-03',
        diagnosticRationale: 'Explicação meteorológica simplista para fenômeno orbital geométrico.'
      }
    ],
    correctOption: 'B',
    explanation: 'A Lua orbita a Terra e tem sempre metade de sua superfície iluminada pelo Sol. As fases observadas resultam do ângulo sob o qual nós, na Terra, enxergamos essa metade iluminada à medida que a Lua transita em sua órbita.',
    difficultyIndex: 0.50,
    discriminationIndex: 0.49,
    targetTriadDimension: 'Evidência Empírica (Dados/Observação/Experimento)'
  }
]

// ─── Validador de Qualidade Psicométrica do Item ──────────────────────────────

export function validateItemBankQuality(item: SubjectBankItem): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  if (!item.id || !item.subject || !item.stem) {
    issues.push('Item deve conter id, subject e stem não vazios.')
  }

  if (!item.bnccSkillCode || !/^(EF\d{2}[A-Z]{2}\d{2}|EM13[A-Z]{3}\d{3})/i.test(item.bnccSkillCode)) {
    issues.push(`Código BNCC inválido: ${item.bnccSkillCode}`)
  }

  if (!item.options || item.options.length < 4) {
    issues.push('Item deve conter pelo menos 4 alternativas (A, B, C, D).')
  }

  const correctOptions = item.options.filter(o => o.isCorrect)
  if (correctOptions.length !== 1) {
    issues.push(`Item deve ter EXATAMENTE 1 alternativa correta. Encontradas: ${correctOptions.length}`)
  } else if (correctOptions[0].letter !== item.correctOption) {
    issues.push(`Inconsistência: correctOption é ${item.correctOption}, mas opção marcada como isCorrect é ${correctOptions[0].letter}`)
  }

  const distractors = item.options.filter(o => !o.isCorrect)
  distractors.forEach(d => {
    if (!d.diagnosticRationale || d.diagnosticRationale.trim().length < 10) {
      issues.push(`Distrator ${d.letter} deve conter diagnosticRationale explicativo (mínimo 10 caracteres).`)
    }
  })

  if (item.difficultyIndex !== undefined && (item.difficultyIndex < 0 || item.difficultyIndex > 1)) {
    issues.push('Índice de dificuldade p deve estar no intervalo [0, 1].')
  }

  return {
    valid: issues.length === 0,
    issues
  }
}
