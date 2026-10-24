/**
 * lib/misconceptionCatalog.ts — Catálogo Pedagógico Curado de Concepções Alternativas (Misconceptions)
 * 
 * Base Teórica e Epistemológica:
 * - Hestenes, D., Wells, M., & Swackhamer, G. (1992). "Force Concept Inventory." The Physics Teacher, 30(3).
 * - Sadler, P. M., et al. (2013). "The influence of teachers' knowledge on student learning." AERJ, 50(5).
 * - Johnstone, A. H. (1991). "Why is science difficult to learn? Things are seldom what they seem." JCA.
 * - Driver, R., Squires, A., Rushworth, P., & Wood-Robinson, V. (1994). "Making Sense of Secondary Science."
 * - Bachelard, G. (1938). "A Formação do Espírito Científico: Contribuição para uma Psicanálise do Conhecimento."
 * - Wineburg, S. (2001). "Historical Thinking and Other Unnatural Acts."
 * - Fischbein, E., Deri, M., Nello, M. S., & Marino, M. S. (1985). "The role of implicit models in solving problems."
 * 
 * Princípio Metodológico (Seções 6, 7 e 17 do Parecer Técnico):
 * Cada alternativa incorreta (distrator) em uma avaliação diagnóstica DEVE estar ancorada em um obstáculo
 * epistemológico documentado. A detecção automática por regex em texto livre deve ter cobertura e precisão
 * mensuradas contra amostras rotuladas por professores (função evaluateMisconceptionDetectionMetrics).
 */

export interface MisconceptionEntry {
  id: string
  code: string
  subject: 'portuguese' | 'english' | 'math' | 'history' | 'geography' | 'physics' | 'chemistry' | 'biology' | 'science' | string
  topic: string
  bnccSkill?: string
  bnccCodes?: string[]
  name: string
  description: string
  cognitiveFlaw: string // Mecanismo mental do erro
  flaw?: string
  studentExample?: string
  diagnosticItem?: string
  distractorExamples: string[]
  matchKeywords: string[]
  matchRegex?: RegExp
  remediationAdvice: string
  remediation?: string
  source?: string
  provenance?: 'LITERATURA-CONFERIR' | 'SINTESE-TA' | 'PROFESSOR-VALIDADO'
  contrastsWith?: string[]
}

export const MISCONCEPTION_CATALOG: MisconceptionEntry[] = [
  // ─── 1. LÍNGUA PORTUGUESA (Seção 17.1 do Parecer) ───────────────────────────
  {
    id: 'MIS_PT_ONDE_TEMPORAL',
    code: 'LP-MIS-01',
    subject: 'portuguese',
    topic: 'Pronomes Relativos',
    bnccCodes: ['EF07LP04', 'EF08LP04', 'EF09LP04'],
    name: 'Uso Indevido de "Onde" com Referente Temporal',
    description: 'Uso de "onde" como pronome relativo referindo-se a tempo ou situação abstrata, em vez de lugar concreto.',
    cognitiveFlaw: 'Generalização do pronome relativo "onde" para contextos não espaciais, por influência da língua oral informal.',
    studentExample: 'Na época onde não havia internet, as pessoas liam mais.',
    diagnosticItem: 'O pronome relativo "onde" refere-se a lugar. Substitua por "em que" quando o referente for tempo ou situação.',
    distractorExamples: [
      'Na época onde não havia internet',
      'No momento onde tudo mudou',
      'Na fase onde aprendemos mais',
      'No período onde estávamos juntos'
    ],
    matchKeywords: ['onde não havia', 'época onde', 'momento onde', 'fase onde', 'período onde'],
    matchRegex: /\b(?:época|momento|fase|período|tempo|situação|contexto|cenário)\s+onde\b/i,
    remediationAdvice: '"Onde" só se usa com referente de lugar concreto. Para tempo ou situação abstrata, use "em que" ou "quando".',
    source: 'Gramática normativa; uso recorrente em redações do Ensino Fundamental II',
    provenance: 'LITERATURA-CONFIRMAR',
    contrastsWith: ['LP-MIS-02']
  },
  {
    id: 'LP-MIS-01-PONTUACAO',
    code: 'LP-MIS-01',
    subject: 'portuguese',
    topic: 'Pontuação e Sintaxe',
    bnccCodes: ['EF06LP11', 'EF07LP04', 'EF08LP04'],
    name: 'Pontuação como Pausa Respiratória (Vírgula Sujeito-Verbo)',
    description: 'Inserção de vírgula entre o sujeito e o predicado, motivada por pausa na respiração durante a leitura oral.',
    cognitiveFlaw: 'Subordinação da regra sintática estrutural da língua escrita à prosódia e ao ritmo fonético da fala.',
    studentExample: 'Os alunos da turma B, venceram a gincana escolar.',
    diagnosticItem: 'Na oração, identifique o sujeito e o verbo principal e diga se a vírgula é permitida.',
    distractorExamples: [
      'Os alunos do 9º ano, participaram da feira de ciências',
      'O professor de história, explicou a matéria com clareza',
      'A menina de olhos azuis, chegou cedo hoje'
    ],
    matchKeywords: ['pausa para respirar', 'vírgula separa sujeito', 'respiro', 'pausa na fala'],
    matchRegex: /^[A-Z][^,]+,\s+(é|são|foi|foram|venceram|chegou|explicou|participou|disse)\b/i,
    remediationAdvice: 'Nunca se separa o sujeito do seu verbo por vírgula, mesmo quando o sujeito for longo ou houver pausa na leitura em voz alta.',
    source: 'Crítica recorrente em estudos de ensino de pontuação (Travaglia; Bechara)',
    provenance: 'LITERATURA-CONFERIR',
    contrastsWith: ['LP-MIS-03']
  },
  {
    id: 'LP-MIS-02',
    code: 'LP-MIS-02',
    subject: 'portuguese',
    topic: 'Ortografia e Fronteira Lexical',
    bnccCodes: ['EF06LP38', 'EF07LP36'],
    name: 'Escrita como Transcrição Fonética (Hipo e Hipersegmentação)',
    description: 'Junção indevida de palavras separadas ou fragmentação de palavra única baseada na pronúncia contínua oral.',
    cognitiveFlaw: 'Falta de consciência da fronteira morfológica/lexical em oposição à cadeia sonora contínua.',
    studentExample: 'Eles chegaram de repente (escrito "derepente") e olharam em baixo (escrito "embaixo" ou inverso).',
    diagnosticItem: 'Ditado contrastivo com palavras de fronteira e justificativa da classe gramatical.',
    distractorExamples: ['derepente', 'agente vai (como pronome nós)', 'com certeza junto', 'porisso'],
    matchKeywords: ['derepente', 'comcerteza', 'porisso', 'agente fomos'],
    matchRegex: /\b(derepente|comcerteza|porisso|derrepente)\b/i,
    remediationAdvice: '"De repente" e "com certeza" são locuções formadas por preposição + substantivo/adjetivo, escrevendo-se sempre separadas.',
    source: 'Abaurre, Fiad e Mayrink-Sabinson (1997); Marcuschi (2001)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'LP-MIS-03',
    code: 'LP-MIS-03',
    subject: 'portuguese',
    topic: 'Orações Adjetivas e Pontuação',
    bnccCodes: ['EF09LP09'],
    name: 'Equivalência Semântica entre Oração Adjetiva Restritiva e Explicativa',
    description: 'Tratar orações adjetivas restritivas (sem vírgula) e explicativas (com vírgula) como meras opções estilísticas com mesmo sentido.',
    cognitiveFlaw: 'Ignora que a pontuação altera o escopo quantitativo do referente (subconjunto restrito vs. totalidade do conjunto).',
    studentExample: 'Dizer que "Os alunos que faltaram farão prova" significa que todos os alunos faltaram.',
    diagnosticItem: 'Par mínimo: quantos alunos faltaram à prova em cada uma das duas frases?',
    distractorExamples: [
      'todos os alunos faltaram e farão segunda chamada',
      'a oração é acessória e pode ser retirada sem mudar o sentido restritivo',
      'as vírgulas servem apenas para dar ênfase sem alterar o número de alunos'
    ],
    matchKeywords: ['restritiva igual explicativa', 'vírgula só enfeite', 'todos os alunos'],
    remediationAdvice: 'Orações adjetivas com vírgula (explicativas) generalizam a característica para todos os elementos; sem vírgula (restritivas), limitam a apenas alguns.',
    source: 'Síntese pedagógica Teacher AI baseada em Perini e Bechara',
    provenance: 'SINTESE-TA',
    contrastsWith: ['LP-MIS-01']
  },
  {
    id: 'LP-MIS-04',
    code: 'LP-MIS-04',
    subject: 'portuguese',
    topic: 'Concordância Verbal',
    bnccCodes: ['EF07LP31', 'EF08LP30'],
    name: 'Hipercorreção em Verbos Impessoais ("Houveram problemas" / "Fazem anos")',
    description: 'Flexão indevida no plural do verbo haver (no sentido de existir) e fazer (indicando tempo decorrido).',
    cognitiveFlaw: 'Interpretação do termo que sucede o verbo impessoal como se fosse o sujeito oracional e não objeto direto.',
    studentExample: 'Houveram muitos acidentes na rodovia ontem.',
    diagnosticItem: 'Identifique se a oração tem sujeito e transforme o verbo para o presente.',
    distractorExamples: ['Houveram muitas dúvidas na aula', 'Fazem dois anos que não o vejo', 'Haviam várias pessoas na sala'],
    matchKeywords: ['houveram', 'fazem anos', 'haviam pessoas', 'fazem dois meses'],
    matchRegex: /\b(houveram|fazem\s+\d+|haviam\s+(muitos|muitas|vários|várias))\b/i,
    remediationAdvice: 'O verbo haver com sentido de existir e o verbo fazer indicando tempo são impessoais (não têm sujeito) e ficam sempre na 3ª pessoa do singular (houve, faz).',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'LP-MIS-05',
    code: 'LP-MIS-05',
    subject: 'portuguese',
    topic: 'Produção Textual e Argumentação',
    bnccCodes: ['EF08LP16', 'EF09LP16'],
    name: 'Confusão entre Tema e Tese na Dissertação',
    description: 'Apresentar o assunto geral (ex: "A violência urbana no Brasil") acreditando que ele já cumpre o papel da tese (posicionamento).',
    cognitiveFlaw: 'Ausência de juízo de valor propositionável: o aluno descreve o tópico sem formular uma tese que possa ser refutada.',
    studentExample: 'A minha tese é que a educação é importante.',
    diagnosticItem: 'Formule uma frase sobre o tema da qual um leitor possa discordar com argumentos.',
    distractorExamples: [
      'o tema abordado funciona como a tese defendida pelo autor',
      'a tese é simplesmente o assunto sobre o qual o texto fala',
      'a tese não precisa de argumento contrário plausível'
    ],
    matchKeywords: ['tema é a tese', 'assunto igual tese', 'tese é falar de'],
    remediationAdvice: 'O tema é o assunto delimitado sobre o qual se escreve; a tese é a sua opinião explícita e fundamentada sobre esse assunto.',
    source: 'Guia de Redação ENEM (INEP)',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'LP-MIS-06',
    code: 'LP-MIS-06',
    subject: 'portuguese',
    topic: 'Estratégias de Leitura e Inferência',
    bnccCodes: ['EF06LP01', 'EF08LP03'],
    name: 'Leitura de Superfície e Cópia Literal em Vez de Inferência',
    description: 'Buscar responder perguntas interpretativas copiando fragmentos literais do texto sem articular os sentidos implícitos.',
    cognitiveFlaw: 'Postura passiva de localização pontual de palavras idênticas em vez de processamento inferencial semântico.',
    studentExample: 'Copiar a primeira linha do parágrafo quando perguntado sobre a intenção do autor.',
    diagnosticItem: 'Pergunta cuja resposta exige integrar duas partes do texto sem repetição de termos.',
    distractorExamples: ['resposta copiada literalmente sem responder à causa implícita', 'paráfrase mecânica superficial'],
    matchKeywords: ['cópia literal', 'leitura superficial', 'está escrito no texto assim'],
    remediationAdvice: 'Interpretar um texto exige ler nas entrelinhas: cruzar o que o autor disse com o contexto para deduzir o que não está escrito com todas as letras.',
    source: 'Solé, I. (1998). Estratégias de Leitura',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'LP-MIS-07',
    code: 'LP-MIS-07',
    subject: 'portuguese',
    topic: 'Crase e Regência',
    bnccCodes: ['EF08LP30', 'EF09LP06'],
    name: 'Crase Mecânica Antes de Verbos e Palavras Masculinas',
    description: 'Emprego do acento grave indicativo de crase antes de verbos ou termos masculinos por mera memorização cega.',
    cognitiveFlaw: 'Confunde a preposição "a" exigida por regência com a fusão preposição + artigo feminino.',
    studentExample: 'Ficou à ver navios; comprou o sapato à prazo.',
    diagnosticItem: 'Substitua o termo por uma palavra masculina ou verbo e verifique se surge "ao".',
    distractorExamples: ['estava à esperar', 'vendeu o carro à prazo', 'começou à chover', 'andou à cavalo'],
    matchKeywords: ['à fazer', 'à prazo', 'à pé', 'à cavalo', 'à partir'],
    matchRegex: /\bà\s+(fazer|esperar|partir|pé|prazo|cavalo|esmo)\b/i,
    remediationAdvice: 'A crase só ocorre antes de palavras femininas que admitem o artigo "a". Antes de verbos e palavras masculinas não há artigo feminino, logo não há crase.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'LP-MIS-08',
    code: 'LP-MIS-08',
    subject: 'portuguese',
    topic: 'Coesão e Coerência Textual',
    bnccCodes: ['EF07LP16', 'EF09LP08'],
    name: 'Conectivo como Enfeite (Coesão Superficial sem Coerência Lógica)',
    description: 'Uso de operadores argumentativos rebuscados (ex: "Além disso", "Outrossim") estabelecendo relação lógica oposta à intenção.',
    cognitiveFlaw: 'Valorização estética/ornamental do vocabulário em detrimento do nexo lógico de causa, oposição ou conclusão.',
    studentExample: 'O trânsito estava caótico. Além disso, chegamos adiantados.',
    diagnosticItem: 'Qual é a relação lógica entre as duas orações (adição, adversidade ou concessão)?',
    distractorExamples: ['uso de além disso para opor ideias', 'uso de portanto onde cabia contudo'],
    matchKeywords: ['além disso com sentido oposto', 'outrossim errado', 'portanto adversativo'],
    remediationAdvice: 'Conectivos não servem para enfeitar o texto. Cada conjunção carrega uma relação de sentido rígida: "além disso" soma argumentos do mesmo lado; "porém" contrapõe.',
    source: 'Koch, I. V. A Coesão Textual',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'LP-MIS-09',
    code: 'LP-MIS-09',
    subject: 'portuguese',
    topic: 'Gêneros Discursivos e Adequação',
    bnccCodes: ['EF06LP06', 'EF08LP15'],
    name: 'Gênero Textual Concebido como Fôrma Fixa e Descontextualizada',
    description: 'Acreditar que um gênero discursivo é uma lista rígida de seções imutáveis, ignorando a situação social e o interlocutor.',
    cognitiveFlaw: 'Essencialismo tipológico em oposição à natureza sociointerativa e dinâmica dos gêneros (Bakhtin).',
    studentExample: 'Achar que toda carta precisa começar obrigatoriamente com "Prezado" mesmo quando dirigida a um amigo íntimo.',
    diagnosticItem: 'Analise a situação de comunicação e adapte a saudação e o registro ao destinatário real.',
    distractorExamples: ['toda carta possui fórmula fixa obrigatória', 'a crônica não pode conter diálogo'],
    matchKeywords: ['gênero fôrma fixa', 'carta sempre prezado', 'estrutura engessada'],
    remediationAdvice: 'Os gêneros textuais são relativamente estáveis (Bakhtin): sua forma, vocabulário e tom dependem de quem escreve, para quem escreve e com qual propósito.',
    source: 'Bakhtin, M. Estética da Criação Verbal',
    provenance: 'LITERATURA-CONFERIR'
  },

  // ─── 2. MATEMÁTICA (Seção 17.2 do Parecer) ──────────────────────────────────
  {
    id: 'MAT-MIS-01',
    code: 'MAT-MIS-01',
    subject: 'math',
    topic: 'Álgebra e Produtos Notáveis',
    bnccCodes: ['EF09MA09'],
    name: 'Ilusão da Linearidade Universal (Distributiva Falsa da Potência)',
    description: 'Elevar binômio ao quadrado aplicando potência a cada parcela separada: (a + b)² = a² + b².',
    cognitiveFlaw: 'Generalização indevida da propriedade distributiva da multiplicação sobre a adição para o operador de potência.',
    studentExample: '(x + 3)² = x² + 9 ou (a + b)² = a² + b².',
    diagnosticItem: 'Substitua x = 1 ou a = 2, b = 3 e compare os dois lados da igualdade.',
    distractorExamples: ['(x + 3)² = x² + 9', '(a + b)² = a² + b²', '√(a² + b²) = a + b'],
    matchKeywords: ['x² + 9', 'a² + b²', 'x² + 25', 'quadrado do primeiro mais quadrado do segundo sem termo duplo'],
    matchRegex: /\([a-z0-9]+\s*\+\s*[a-z0-9]+\)\^?2\s*=\s*[a-z0-9]+\^?2\s*\+\s*[a-z0-9]+\^?2/i,
    remediationAdvice: '(a + b)² significa (a + b) × (a + b). Pela propriedade distributiva, surgem dois retângulos de área a×b, totalizando a² + 2ab + b².',
    source: 'Tall, D. Three Worlds of Mathematics; Resnick, L.',
    provenance: 'LITERATURA-CONFERIR',
    contrastsWith: ['MAT-MIS-08']
  },
  {
    id: 'MAT-MIS-02',
    code: 'MAT-MIS-02',
    subject: 'math',
    topic: 'Números Racionais e Decimais',
    bnccCodes: ['EF06MA01', 'EF06MA02'],
    name: 'Viés do Número Natural na Comparação de Decimais e Frações',
    description: 'Julgar que 0,125 é maior que 0,4 porque 125 > 4, ou que 1/8 é maior que 1/3 porque 8 > 3.',
    cognitiveFlaw: 'Sobreposição das propriedades de ordenação dos números naturais sobre a notação posicional decimal e fracionária.',
    studentExample: '0,15 é maior que 0,8 porque 15 é maior que 8.',
    diagnosticItem: 'Compare 0,400 com 0,125 igualando as casas decimais na reta numérica.',
    distractorExamples: ['0,125 > 0,4', '0,15 > 0,8', '1/8 > 1/3', '1/4 > 1/2'],
    matchKeywords: ['0,125 maior que 0,4', '15 maior que 8 decimal', '1/8 maior que 1/3'],
    matchRegex: /0,125\s*>\s*0,4|1\/8\s*>\s*1\/3/i,
    remediationAdvice: 'Em números decimais, compare casa por casa após a vírgula: 4 décimos (0,4 = 0,400) é muito maior que 1 décimo (0,125). Em frações unitárias, quanto maior o denominador, menor a parte dividida.',
    source: 'Resnick et al. (1989); Vamvakoussi & Vosniadou (2004)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'MAT-MIS-03',
    code: 'MAT-MIS-03',
    subject: 'math',
    topic: 'Frações Algébricas',
    bnccCodes: ['EF08MA06', 'EF09MA09'],
    name: 'Cancelamento Ilegal de Parcelas de Soma em Frações',
    description: 'Simplificar frações cortando termos que estão somando com o denominador: (x + 5)/5 = x.',
    cognitiveFlaw: 'Confunde parcela aditiva com fator multiplicativo na regra de simplificação por divisão mútua.',
    studentExample: '(x + 2)/2 = x + 1 ou (2x + 3)/2 = x + 3.',
    diagnosticItem: 'Substitua x = 8 na expressão (x + 2)/2 e compare (8 + 2)/2 = 5 com x + 1 = 9.',
    distractorExamples: ['(x + 5)/5 = x', '(x + 2)/2 = x + 1', '(3x + 4)/3 = x + 4'],
    matchKeywords: ['corta o 5', 'cancela o 2 na soma', '(x+5)/5 = x'],
    remediationAdvice: 'Só podemos simplificar termos em frações quando o numerador inteiro estiver multiplicado pelo fator. Na soma, o denominador divide todos os termos: (x + 2)/2 = x/2 + 1.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'MAT-MIS-04',
    code: 'MAT-MIS-04',
    subject: 'math',
    topic: 'Números Inteiros e Sinais',
    bnccCodes: ['EF07MA03', 'EF07MA04'],
    name: 'Regra de Sinais da Multiplicação Aplicada à Adição de Inteiros',
    description: 'Calcular -5 - 3 = +8 com a justificativa de que "menos com menos dá mais".',
    cognitiveFlaw: 'Hipergeneralização mecânica da regra da multiplicação (-a × -b = +ab) para o campo aditivo das dívidas acumuladas.',
    studentExample: '-5 - 3 = +8 ou -10 - 2 = +12.',
    diagnosticItem: 'Calcule -5 - 3 e -5 + 3 explicando o saldo em uma conta bancária com dívida.',
    distractorExamples: ['-5 - 3 = +8', '-4 - 2 = +6', '-7 - 1 = +8'],
    matchKeywords: ['menos com menos dá mais na soma', '-5 - 3 = 8', '-5 - 3 = +8'],
    matchRegex: /-\s*5\s*-\s*3\s*=\s*\+?8|-\s*4\s*-\s*2\s*=\s*\+?6/i,
    remediationAdvice: '"Menos com menos dá mais" vale apenas para multiplicação e divisão. Na adição/subtração de inteiros pense em saldo: dever 5 e dever 3 resulta em uma dívida total de 8 (-8).',
    source: 'Vergnaud, G. (1990). Campos Conceituais',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'MAT-MIS-05',
    code: 'MAT-MIS-05',
    subject: 'math',
    topic: 'Geometria: Perímetro vs Área',
    bnccCodes: ['EF06MA29', 'EF07MA31'],
    name: 'Confusão e Dependência Linear entre Perímetro e Área',
    description: 'Acreditar que dobrar o perímetro dobra a área, ou que figuras com mesmo perímetro possuem a mesma área.',
    cognitiveFlaw: 'Ausência de discriminação entre grandezas unidimensionais lineares (comprimento) e bidimensionais quadráticas (área k²).',
    studentExample: 'Se o lado de um quadrado dobra de 2 para 4, sua área dobra de 4 para 8.',
    diagnosticItem: 'Desenhe um retângulo 1x7 e outro 4x4. Ambos têm perímetro 16; calcule suas áreas (7 vs 16).',
    distractorExamples: ['dobrar o lado dobra a área', 'figuras de mesmo perímetro têm mesma área', 'área proporcional ao perímetro'],
    matchKeywords: ['dobra o perímetro dobra a área', 'mesmo perímetro mesma área'],
    remediationAdvice: 'O perímetro é uma medida linear (1D); a área é de superfície (2D). Ao dobrar os lados de uma figura plana, sua área é multiplicada por 2² = 4.',
    source: 'Douady & Perrin-Glorian (1989)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'MAT-MIS-06',
    code: 'MAT-MIS-06',
    subject: 'math',
    topic: 'Porcentagem e Matemática Financeira',
    bnccCodes: ['EF07MA02', 'EF08MA04'],
    name: 'Irreversibilidade de Porcentagens Sucessivas',
    description: 'Acreditar que um aumento de 20% seguido de um desconto de 20% retorna exatamente ao valor inicial.',
    cognitiveFlaw: 'Desconsideração de que a base de cálculo da segunda porcentagem incide sobre o montante já reajustado.',
    studentExample: '100 + 20% = 120; 120 - 20% = 100.',
    diagnosticItem: 'Calcule 20% de 120 (dá 24) e subtraia de 120 (resultado 96, perda de 4%).',
    distractorExamples: ['retorna ao valor original de 100%', 'o produto não teve alteração de preço', 'aumento de 20% anula desconto de 20%'],
    matchKeywords: ['retorna a 100', 'aumento anula desconto igual', 'fica no mesmo valor'],
    remediationAdvice: 'As porcentagens não incidem sobre a mesma base. Um acréscimo de 20% multiplica por 1,20; um desconto de 20% multiplica por 0,80 (1,20 × 0,80 = 0,96, ou seja, redução líquida de 4%).',
    source: 'Parker & Leinhardt (1995)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'MAT-MIS-07',
    code: 'MAT-MIS-07',
    subject: 'math',
    topic: 'Proporcionalidade',
    bnccCodes: ['EF07MA17', 'EF08MA12'],
    name: 'Aplicação de Regra de Três Direta em Grandezas Inversas ou Constantes',
    description: 'Aplicar proporção direta em problemas onde as grandezas são inversamente proporcionais ou invariantes.',
    cognitiveFlaw: 'Automatismo operatório da regra de três em cruz sem checagem do comportamento físico das variáveis.',
    studentExample: 'Se 2 pintores levam 6 dias para pintar um muro, 4 pintores levarão 12 dias.',
    diagnosticItem: 'Se mais pessoas trabalham no mesmo ritmo, o tempo gasto deve aumentar ou diminuir?',
    distractorExamples: ['4 pintores levam 12 dias', 'se 1 camisa seca em 1 hora, 5 camisas secam em 5 horas'],
    matchKeywords: ['mais operários mais dias', '5 camisas 5 horas no varal'],
    remediationAdvice: 'Antes de calcular, pergunte: quando uma grandeza aumenta, a outra aumenta ou diminui? Se mais trabalhadores diminuem o tempo, a proporção é inversa (o produto é constante: 2 × 6 = 4 × 3 dias).',
    source: 'De Bock, Verschaffel & Janssens (2002)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'MAT-MIS-08',
    code: 'MAT-MIS-08',
    subject: 'math',
    topic: 'Produtos Notáveis',
    bnccCodes: ['EF09MA09'],
    name: 'Omissão do Termo Central Dobrado no Trinômio Quadrado Perfeito',
    description: 'Desenvolver (x + 3)² como x² + 3x + 9, esquecendo de dobrar o produto do primeiro pelo segundo termo.',
    cognitiveFlaw: 'Lembrança fragmentária da regra memorizada ("primeiro vezes o segundo") sem o coeficiente multiplicador 2.',
    studentExample: '(x + 3)² = x² + 3x + 9.',
    diagnosticItem: 'Teste x = 1: (1 + 3)² = 16, enquanto 1² + 3(1) + 9 = 13 (faltam 3 unidades).',
    distractorExamples: ['x² + 3x + 9', 'x² + 4x + 16 (para (x+4)²)', 'a² + ab + b²'],
    matchKeywords: ['x² + 3x + 9', 'a² + ab + b²', 'esqueceu de dobrar o termo do meio'],
    remediationAdvice: 'No quadrado do binômio surgem dois retângulos iguais: a×b + b×a = 2ab. Portanto (x + 3)² = x² + 2×(3×x) + 3² = x² + 6x + 9.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA',
    contrastsWith: ['MAT-MIS-01']
  },
  {
    id: 'MAT-MIS-09',
    code: 'MAT-MIS-09',
    subject: 'math',
    topic: 'Aritmética e Álgebra Inicial',
    bnccCodes: ['EF06MA14', 'EF07MA18'],
    name: 'Sinal de Igual Tratado como Operador Direcional "Dá o Resultado"',
    description: 'Interpretar o símbolo "=" apenas como comando para executar uma conta à direita, escrevendo cadeias como 3 + 4 = 7 + 2 = 9.',
    cognitiveFlaw: 'Ausência da concepção relacional de equivalência/balança do sinal de igualdade.',
    studentExample: '3 + 4 = 7 + 2 = 9 ou na equação 5 + x = 12 achar que o resultado é 17.',
    diagnosticItem: 'A sentença 7 = 7 + 2 é verdadeira? O que significa os dois lados da balança estarem em equilíbrio?',
    distractorExamples: ['3 + 4 = 7 + 2 = 9', 'o sinal de igual serve para mostrar a próxima conta'],
    matchKeywords: ['3 + 4 = 7 + 2 = 9', 'sinal de igual dá o resultado'],
    remediationAdvice: 'O sinal de igual (=) é uma relação de equivalência: o valor do lado esquerdo DEVE ser rigorosamente idêntico ao valor do lado direito, como uma balança perfeitamente equilibrada.',
    source: 'Kieran, C. (1981). Concepts associated with the equality sign',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'MAT-MIS-10',
    code: 'MAT-MIS-10',
    subject: 'math',
    topic: 'Expressões Numéricas',
    bnccCodes: ['EF06MA03', 'EF07MA04'],
    name: 'Operações Calculadas da Esquerda para a Direita sem Precedência Operatória',
    description: 'Resolver 2 + 3 × 4 somando 2 + 3 = 5 primeiro e multiplicando por 4 para dar 20.',
    cognitiveFlaw: 'Transposição da ordem de leitura ocidental linear (esquerda para a direita) sobre a hierarquia das operações.',
    studentExample: '2 + 3 × 4 = 20.',
    diagnosticItem: 'Calcule 2 + 3 × 4 e 3 × 4 + 2 explicando por que a multiplicação tem prioridade.',
    distractorExamples: ['2 + 3 × 4 = 20', '10 - 2 × 3 = 24', '5 + 5 ÷ 5 = 2'],
    matchKeywords: ['2 + 3 × 4 = 20', 'sem hierarquia de operações', 'resolve na ordem que aparece'],
    matchRegex: /2\s*\+\s*3\s*[\*x×]\s*4\s*=\s*20/i,
    remediationAdvice: 'Multiplicações e divisões têm precedência matemática sobre adições e subtrações: 3 × 4 = 12; em seguida, 2 + 12 = 14.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'MAT-MIS-11',
    code: 'MAT-MIS-11',
    subject: 'math',
    topic: 'Estatística Básica',
    bnccCodes: ['EF07MA35', 'EF08MA25'],
    name: 'Confusão entre Média, Mediana e Moda',
    description: 'Identificar a média como o valor central da lista sem ordenar, ou confundi-la com a moda (valor mais frequente).',
    cognitiveFlaw: 'Sobreposição indistinta dos conceitos de tendência central por falta de visualização gráfica/geométrica dos dados.',
    studentExample: 'No conjunto {1, 1, 2, 6}, dizer que a média é 1 porque é o que mais se repete.',
    diagnosticItem: 'No conjunto {1, 1, 2, 6}, calcule: Média = (1+1+2+6)/4 = 2,5; Mediana = 1,5; Moda = 1.',
    distractorExamples: ['a média é o valor mais frequente', 'a mediana é a soma dividida por 2', 'moda é o valor do meio sem ordenar'],
    matchKeywords: ['média é o que mais aparece', 'mediana é a média', 'moda é a média'],
    remediationAdvice: 'Moda é o valor que mais se repete; Mediana é o valor central com a lista em ordem crescente; Média é a soma de todos dividida pela quantidade de elementos.',
    source: 'Garfield & Ben-Zvi (2007)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'MAT-MIS-12',
    code: 'MAT-MIS-12',
    subject: 'math',
    topic: 'Probabilidade',
    bnccCodes: ['EF07MA34', 'EF08MA22'],
    name: 'Falácia do Apostador (Independência de Eventos Aleatórios)',
    description: 'Acreditar que após uma moeda sair 5 vezes consecutivas "cara", a probabilidade de sair "coroa" no próximo lançamento aumentou.',
    cognitiveFlaw: 'Crença intuitiva de autorretificação do acaso, atribuindo "memória" a processos estocásticos independentes.',
    studentExample: 'Já saiu cara 4 vezes seguidas, agora é quase certo que vai dar coroa.',
    diagnosticItem: 'A moeda tem memória do lançamento anterior? Em cada lançamento isolado a probabilidade continua 1/2 (50%).',
    distractorExamples: ['coroa é mais provável após sequência de caras', 'o número da loteria que não sai há meses vai sair hoje'],
    matchKeywords: ['falácia do apostador', 'moeda com memória', 'vai dar coroa com certeza'],
    remediationAdvice: 'Cada lançamento de uma moeda honesta é um evento independente: a moeda não se lembra do passado e a probabilidade de cara ou coroa é sempre 50%.',
    source: 'Tversky & Kahneman (1971). Belief in the law of small numbers',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'MAT-MIS-13',
    code: 'MAT-MIS-13',
    subject: 'math',
    topic: 'Operações com Racionais',
    bnccCodes: ['EF06MA03', 'EF07MA04'],
    name: 'Crença de que Multiplicar Sempre Aumenta e Dividir Sempre Diminui',
    description: 'Julgar impossível que 8 × 0,5 = 4 (menor que 8) ou que 8 ÷ 0,5 = 16 (maior que 8).',
    cognitiveFlaw: 'Modelo implícito primitivo baseado exclusivamente na tabuada dos números naturais maiores que 1.',
    studentExample: '8 dividido por meio tem que ser menor que 8.',
    diagnosticItem: 'Quantas moedas de 50 centavos (0,5) cabem em 8 reais? Cabem 16 moedas, logo 8 ÷ 0,5 = 16.',
    distractorExamples: ['8 × 0,5 tem que ser maior que 8', 'dividir por 0,1 diminui o número', 'multiplicação sempre gera número maior'],
    matchKeywords: ['multiplicar sempre aumenta', 'dividir sempre diminui', '8 x 0,5 não pode dar 4'],
    remediationAdvice: 'Multiplicar por um número entre 0 e 1 equivale a calcular uma fração daquele valor (reduzindo-o); dividir por um número menor que 1 calcula quantas partes pequenas cabem no todo (aumentando o quociente).',
    source: 'Fischbein et al. (1985)',
    provenance: 'LITERATURA-CONFERIR'
  },

  // ─── 3. HISTÓRIA (Seção 17.3 do Parecer) ────────────────────────────────────
  {
    id: 'HIS-MIS-01',
    code: 'HIS-MIS-01',
    subject: 'history',
    topic: 'Consciência Histórica e Temporalidade',
    bnccCodes: ['EF06HI01', 'EF06HI09', 'EF07HI01'],
    name: 'Anacronismo Moral e Conceitual',
    description: 'Julgar mentalidades, costumes e decisões do passado utilizando exclusivamente os valores éticos, legais e científicos do presente.',
    cognitiveFlaw: 'Falta de empatia histórica contextualizada e de compreensão da historicidade dos valores humanos.',
    studentExample: 'Dizer que os atenienses do séc. V a.C. eram "falsos democratas e hipócritas" por manterem escravizados.',
    diagnosticItem: 'Como os próprios atenienses justificavam a cidadania e a escravidão em sua época?',
    distractorExamples: ['julgar a inquisição medieval com base na declaração universal dos direitos humanos de 1948', 'acusar povos antigos de atrasados'],
    matchKeywords: ['anacronismo', 'eram hipócritas no passado', 'não sabiam nada de direitos humanos'],
    remediationAdvice: 'O historiador não é um juiz moral do passado. O objetivo é compreender por que as pessoas pensavam e agiam daquela forma dentro do seu próprio contexto histórico.',
    source: 'Wineburg, S. (2001); Lee & Ashby (2000)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'HIS-MIS-02',
    code: 'HIS-MIS-02',
    subject: 'history',
    topic: 'Teoria da História',
    bnccCodes: ['EF06HI01', 'EF08HI23'],
    name: 'Teleologia e Evolucionismo Linear ("História como Marcha do Progresso")',
    description: 'Acreditar que a história humana caminha inevitavelmente em linha reta rumo a um futuro superior, vendo o passado como estágio imperfeito.',
    cognitiveFlaw: 'Filosofia teleológica da história que confunde passagem do tempo cronológico com evolução ética e técnica.',
    studentExample: 'Achar que a sociedade atual é moralmente superior às sociedades indígenas por possuir tecnologia digital.',
    diagnosticItem: 'Aponte regressões de direitos ou catástrofes humanitárias contemporâneas (ex: guerras mundiais) que refutam o progresso linear contínuo.',
    distractorExamples: ['sociedades indígenas como estágio primitivo do homem branco', 'o tempo sempre traz evolução moral'],
    matchKeywords: ['marcha do progresso', 'evolução inevitável da humanidade', 'sociedades primitivas atrasadas'],
    remediationAdvice: 'A história não segue uma linha reta predeterminada rumo ao progresso: há avanços, rupturas, permanências e regressões em diferentes dimensões sociais.',
    source: 'Rüsen, J. Razão Histórica; Bloch, M.',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'HIS-MIS-03',
    code: 'HIS-MIS-03',
    subject: 'history',
    topic: 'Crítica de Fontes Históricas',
    bnccCodes: ['EF06HI02', 'EF08HI22'],
    name: 'Leitura Ingênua da Fonte Histórica como Espelho Neutro dos Fatos',
    description: 'Tomar um documento oficial, pintura histórica ou crônica como registro neutro e fotográfico da verdade factual.',
    cognitiveFlaw: 'Ausência da crítica documental de autoria, lugar social, intencionalidade e público-alvo.',
    studentExample: 'Tomar a tela "Independência ou Morte" de Pedro Américo (1888) como fotografia literal do evento ocorrido em 1822.',
    diagnosticItem: 'Quem produziu a tela? Quando (1888)? Com qual objetivo político no final do Império brasileiro?',
    distractorExamples: ['a pintura retrata com precisão fotográfica o 7 de setembro de 1822', 'o documento oficial diz a verdade absoluta dos fatos'],
    matchKeywords: ['espelho da realidade', 'fotografia do momento', 'documento neutro'],
    remediationAdvice: 'Toda fonte histórica é um monumento construído por alguém com intenções específicas. É indispensável analisar quem produziu, quando, para quem e por quê.',
    source: 'Le Goff, J. Documento/Monumento; Wineburg, S.',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'HIS-MIS-04',
    code: 'HIS-MIS-04',
    subject: 'history',
    topic: 'Causalidade Histórica',
    bnccCodes: ['EF08HI04', 'EF09HI10'],
    name: 'Monocausalidade e Personalismo ("História dos Grandes Homens")',
    description: 'Explicar processos históricos complexos (como revoluções e guerras) unicamente pela vontade, bondade ou loucura de um indivíduo isolado.',
    cognitiveFlaw: 'Redução de dinâmicas estruturais econômicas, sociais e coletivas a narrativas biográficas de heróis ou vilões.',
    studentExample: 'Dizer que a Primeira Guerra Mundial aconteceu exclusivamente porque Gavrilo Princip assassinou o arquiduque.',
    diagnosticItem: 'Quais eram as tensões imperialistas, econômicas e a corrida armamentista que já vinham se acumulando na Europa há décadas?',
    distractorExamples: ['a princesa isabel acabou com a escravidão por bondade própria', 'a primeira guerra ocorreu apenas pelo atentado de sarajevo'],
    matchKeywords: ['graças ao herói', 'por pura loucura de um homem', 'única causa'],
    remediationAdvice: 'Processos históricos são multicausais: o atentado foi apenas o estopim imediato de conflitos estruturais prévios (imperialismo, nacionalismo, disputas econômicas).',
    source: 'Carr, E. H. O que é História?; Peter Lee',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'HIS-MIS-05',
    code: 'HIS-MIS-05',
    subject: 'history',
    topic: 'História Indígena e Afro-Brasileira (Leis 10.639 e 11.645)',
    bnccCodes: ['EF06HI08', 'EF07HI03', 'EF07HI09', 'EF08HI14'],
    name: 'Homogeneização Cultural e Apagamento da Diversidade Étnica',
    description: 'Tratar "os índios" ou "os africanos" como blocos homogêneos com uma única língua, cultura e religião.',
    cognitiveFlaw: 'Etnocentrismo colonial que apaga a pluralidade de centenas de nações indígenas e reinos africanos distintos.',
    studentExample: 'Afirmar que os africanos escravizados eram todos iguais e falavam a mesma língua.',
    diagnosticItem: 'Compare os povos iorubás (nagôs) e os bantos, ou tupinambás e guaranis, apontando suas diferenças culturais.',
    distractorExamples: ['os indígenas possuíam uma única cultura e costumes idênticos', 'na áfrica todos compartilhavam da mesma fé'],
    matchKeywords: ['cultura indígena única', 'africanos todos iguais', 'o índio genérico'],
    remediationAdvice: 'Não existe "o índio" ou "o africano" genérico: a África possui milhares de etnias e línguas (reinos do Congo, Mali, Iorubá) e o Brasil abrigava centenas de povos com línguas e alianças políticas próprias.',
    source: 'Leis 10.639/2003 e 11.645/2008; Silva & Silva',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'HIS-MIS-06',
    code: 'HIS-MIS-06',
    subject: 'history',
    topic: 'Crítica de Fontes',
    bnccCodes: ['EF06HI02', 'EF08HI22'],
    name: 'Descarte Preconceituoso de Fonte Histórica Produzida Posteriormente ao Evento',
    description: 'Descartar uma fonte pictórica ou documental do século XIX sobre o século XVII afirmando que ela "não tem valor nenhum".',
    cognitiveFlaw: 'Incompreensão de que documentos posteriores revelam de forma extraordinária a memória e a construção política do período em que foram feitos.',
    studentExample: 'Afirmar que a tela de Pedro Américo pintada em 1888 não serve para o historiador porque o pintor não estava lá em 1822.',
    diagnosticItem: 'O que essa pintura revela sobre a forma como a monarquia no final do Império queria que o povo lembrasse de D. Pedro I?',
    distractorExamples: ['a fonte não possui utilidade por ser posterior ao evento', 'somente testemunhas oculares geram fontes históricas válidas'],
    matchKeywords: ['fonte tardia inútil', 'não estava lá não serve', 'produzido depois não tem valor'],
    remediationAdvice: 'Mesmo fontes produzidas muito depois do evento são valiosas: revelam como aquele fato foi ressignificado, celebrado ou instrumentalizado politicamente na época em que a fonte foi criada.',
    source: 'Wineburg, S. (2001)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'HIS-MIS-07',
    code: 'HIS-MIS-07',
    subject: 'history',
    topic: 'Temporalidade e Duração',
    bnccCodes: ['EF08HI04', 'EF09HI10'],
    name: 'Confusão entre Evento Pontual e Processo Histórico de Longa Duração',
    description: 'Acreditar que a Revolução Francesa começou e terminou no dia 14 de julho de 1789 com a Tomada da Bastilha.',
    cognitiveFlaw: 'Equiparação do marco cronológico simbólico ao processo social e político em curso.',
    studentExample: 'A Revolução Francesa foi quando o povo derrubou a prisão da Bastilha e pronto.',
    diagnosticItem: 'Construa uma linha do tempo mostrando os desdobramentos de 1789 até a Era Napoleônica.',
    distractorExamples: ['a revolução se resume à queda da bastilha', 'a abolição ocorreu inteira no dia 13 de maio com a assinatura'],
    matchKeywords: ['revolução foi a queda da bastilha', 'acabou no mesmo dia', 'evento igual ao processo'],
    remediationAdvice: 'Um evento (como a Tomada da Bastilha) é apenas um marco simbólico dentro de um processo histórico amplo que se desdobra em anos de disputas, avanços e retrocessos.',
    source: 'Braudel, F. A Longa Duração; Lee & Ashby',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'HIS-MIS-08',
    code: 'HIS-MIS-08',
    subject: 'history',
    topic: 'Agência e Protagonismo Social',
    bnccCodes: ['EF07HI09', 'EF08HI11', 'EF08HI14'],
    name: 'Vitimização Passiva e Apagamento da Resistência de Grupos Subalternizados',
    description: 'Apresentar escravizados e povos indígenas exclusivamente como vítimas submissas e resignadas à dominação colonial.',
    cognitiveFlaw: 'Invisibilização da agência política, das revoltas, da formação de quilombos e das negociações cotidianas.',
    studentExample: 'Os escravizados apenas aceitavam o trabalho forçado sem fazer nada a respeito.',
    diagnosticItem: 'Cite 3 formas de resistência escrava (formação de quilombos, sabotagens, irmandades religiosas, revoltas armadas).',
    distractorExamples: ['os escravizados eram passivos e não reagiam', 'a abolição foi concedida sem luta dos negros'],
    matchKeywords: ['escravizados passivos', 'indígenas aceitaram tudo', 'vítimas resignadas'],
    remediationAdvice: 'Populações escravizadas e indígenas nunca foram passivas: resistiram ativamente por meio de revoltas armadas (como a Revolta dos Malês), criação de quilombos (como Palmares), preservação de suas culturas e negociações diárias.',
    source: 'Gorender, J.; Lara, S. H.; Reis, J. J.',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'HIS-MIS-09',
    code: 'HIS-MIS-09',
    subject: 'history',
    topic: 'História Medieval',
    bnccCodes: ['EF06HI14', 'EF06HI15', 'EF06HI19'],
    name: 'Estereótipo da Idade Média como "Idade das Trevas" e Atraso Uniforme',
    description: 'Julgar os mil anos da Idade Média como um período de ignorância total, ausência de ciência e barbárie generalizada.',
    cognitiveFlaw: 'Adesão acrítica ao discurso iluminista/renascentista que cunhou a expressão pejorativa para valorizar a própria época.',
    studentExample: 'Na Idade Média ninguém tomava banho, não existiam livros e a ciência não existia.',
    diagnosticItem: 'Cite contribuições medievais (criação das universidades, moinhos hidráulicos, arquitetura gótica e preservação de manuscritos).',
    distractorExamples: ['idade média como período de trevas sem nenhuma produção cultural', 'ausência completa de tecnologia ou comércio medieval'],
    matchKeywords: ['idade das trevas', 'atraso medieval absoluto', 'mil anos de escuridão'],
    remediationAdvice: 'A expressão "Idade das Trevas" foi um rótulo inventado no Renascimento. O medievo viu o nascimento das universidades, grandes avanços agrícolas, preservação filosófica e rica produção arquitetônica e literária.',
    source: 'Le Goff, J. Para um Novo Conceito de Idade Média',
    provenance: 'SINTESE-TA'
  },

  // ─── 4. GEOGRAFIA (Seção 17.3 do Parecer) ───────────────────────────────────
  {
    id: 'GEO-MIS-01',
    code: 'GEO-MIS-01',
    subject: 'geography',
    topic: 'Cartografia e Escalas',
    bnccCodes: ['EF06GE08'],
    name: 'Inversão de Grandeza na Escala Cartográfica (Denominador vs. Detalhe)',
    description: 'Acreditar que 1:50.000.000 é uma escala maior do que 1:5.000 porque o número no denominador é muito maior.',
    cognitiveFlaw: 'Falta de compreensão de que a escala é uma fração (1/D): denominadores gigantes geram frações minúsculas (pouco detalhe).',
    studentExample: 'Uma escala de 1:50.000.000 é bem grande, dá para ver os detalhes da cidade.',
    diagnosticItem: 'Qual escala permite maior nível de detalhe: 1:5.000 ou 1:50.000.000?',
    distractorExamples: ['1:50.000.000 permite maior detalhamento de ruas', 'quanto maior o denominador mais detalhada a escala'],
    matchKeywords: ['1:50.000.000 mais detalhada', 'escala grande com denominador grande'],
    matchRegex: /1\s*:\s*50\.?000\.?000.*(maior detalhamento|escala grande)/i,
    remediationAdvice: 'A escala cartográfica é uma fração: 1/5.000 é um número muito maior que 1/50.000.000. Escalas grandes (denominador pequeno) mostram ruas e casas com grande riqueza de detalhes.',
    source: 'Almeida & Passini (1989); Castellar, S.',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'GEO-MIS-02',
    code: 'GEO-MIS-02',
    subject: 'geography',
    topic: 'Climatologia',
    bnccCodes: ['EF06GE03', 'EF08CI14'],
    name: 'Confusão Conceitual entre Tempo Meteorológico e Clima',
    description: 'Afirmar que o clima mudou porque hoje fez frio e ontem estava calor.',
    cognitiveFlaw: 'Equiparação do estado momentâneo e transitório da atmosfera à sucessão habitual de padrões ao longo de 30 anos.',
    studentExample: 'O clima hoje em São Paulo está muito chuvoso.',
    diagnosticItem: 'Qual é a diferença entre a previsão do tempo para o final de semana e o clima tropical de uma região?',
    distractorExamples: ['o clima de hoje é frio com chuva', 'mudança de clima porque caiu uma tempestade à tarde'],
    matchKeywords: ['clima de hoje', 'clima está chuvoso hoje', 'o clima mudou nesta semana'],
    remediationAdvice: 'Tempo é o estado pontual da atmosfera em um determinado dia ou hora; Clima é o padrão atmosférico observado e consolidado ao longo de pelo menos 30 anos de medições.',
    source: 'Mendonça & Danni-Oliveira (2007)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'GEO-MIS-03',
    code: 'GEO-MIS-03',
    subject: 'geography',
    topic: 'Geografia Humana e Epistemologia',
    bnccCodes: ['EF07GE01', 'EF08GE06'],
    name: 'Determinismo Geográfico e Ambiental',
    description: 'Atribuir a riqueza, pobreza ou nível de desenvolvimento de uma nação estritamente às suas condições naturais (clima ou recursos).',
    cognitiveFlaw: 'Explicação monocausal naturalista que ignora a história colonial, a geopolítica e as estruturas socioeconômicas.',
    studentExample: 'O Brasil não se desenvolveu porque o clima tropical deixa as pessoas com preguiça.',
    diagnosticItem: 'Compare países de clima semelhante e níveis industriais opostos (ex: Haiti e Cingapura).',
    distractorExamples: ['o subdesenvolvimento decorre puramente da escassez de recursos minerais', 'países de clima quente não progridem'],
    matchKeywords: ['clima tropical causa preguiça', 'pobreza causada pela natureza', 'determinismo climático'],
    remediationAdvice: 'O desenvolvimento socioeconômico não é determinado pela natureza: resulta de processos históricos de colonização, escolhas políticas, investimentos em ciência e relações internacionais de poder.',
    source: 'Santos, M. A Natureza do Espaço; Ratzel vs. Vidal',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'GEO-MIS-04',
    code: 'GEO-MIS-04',
    subject: 'geography',
    topic: 'Cartografia e Astronomia Geográfica',
    bnccCodes: ['EF06GE08'],
    name: 'Confusão entre Latitude (Zonas Térmicas) e Longitude (Fusos Horários)',
    description: 'Acreditar que a latitude determina o fuso horário ou que a longitude é responsável pela variação de temperatura entre polos e equador.',
    cognitiveFlaw: 'Mistura dos dois eixos coordenados perpendiculares e de seus efeitos físicos planetários.',
    studentExample: 'A longitude determina se o lugar é quente ou frio.',
    diagnosticItem: 'Quais linhas imaginárias medem a distância em graus ao Equador (paralelos/latitude) e a Greenwich (meridianos/longitude)?',
    distractorExamples: ['a longitude altera as estações do ano', 'a latitude define a diferença de horas entre países'],
    matchKeywords: ['longitude define temperatura', 'latitude define fusos horários'],
    remediationAdvice: 'Latitude (distância ao Equador) define a incidência solar e as zonas térmicas; Longitude (distância ao Meridiano de Greenwich) define os fusos horários devido à rotação da Terra de oeste para leste.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'GEO-MIS-05',
    code: 'GEO-MIS-05',
    subject: 'geography',
    topic: 'Climatologia e Meio Ambiente',
    bnccCodes: ['EF06GE13', 'EF07CI13'],
    name: 'Efeito Estufa Interpretado Exclusivamente como Poluição Nociva',
    description: 'Julgar que o efeito estufa é um mal criado pelas indústrias humanas que deveria ser totalmente eliminado da Terra.',
    cognitiveFlaw: 'Desconhecimento de que o efeito estufa natural é o mecanismo indispensável que mantém a Terra aquecida (média de 15°C vs -18°C).',
    studentExample: 'A meta ecológica do planeta é acabar com todo o efeito estufa.',
    diagnosticItem: 'O que aconteceria com a vida na Terra se o efeito estufa natural desaparecesse por completo? (O planeta congelaria).',
    distractorExamples: ['o efeito estufa é 100% artificial e nocivo', 'sem efeito estufa a temperatura seria perfeita'],
    matchKeywords: ['acabar com todo efeito estufa', 'efeito estufa 100% poluição', 'efeito estufa não natural'],
    remediationAdvice: 'O efeito estufa natural é essencial para a vida na Terra; o problema ambiental grave é o aquecimento global antropogênico, causado pela intensificação excessiva desse mecanismo pela queima de combustíveis fósseis.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'GEO-MIS-06',
    code: 'GEO-MIS-06',
    subject: 'geography',
    topic: 'Geopolítica e Conceitos Espaciais',
    bnccCodes: ['EF08GE05'],
    name: 'Equiparação Sinônima entre Estado, Nação, Território, País e Governo',
    description: 'Tratar os conceitos estruturantes de Estado, Nação, Território, País e Governo como sinônimos perfeitos intercambiáveis.',
    cognitiveFlaw: 'Falta de diferenciação entre a dimensão jurídico-institucional (Estado), identitário-cultural (Nação) e a base física de poder (Território).',
    studentExample: 'Afirmar que não existem nações no mundo que não possuam um Estado e território próprios.',
    diagnosticItem: 'Cite o exemplo da nação Curda ou dos povos indígenas (nações sem Estado soberano próprio).',
    distractorExamples: ['toda nação é obrigatoriamente um Estado soberano', 'governo e Estado são rigorosamente a mesma coisa'],
    matchKeywords: ['estado e governo sinônimos', 'toda nação tem estado'],
    remediationAdvice: 'Estado é a instituição política que exerce soberania; Nação é o grupo humano com identidade e cultura compartilhadas; Território é o espaço delimitado sob relações de poder. Há nações sem Estado soberano (como os curdos).',
    source: 'Raffestin, C. Por uma Geografia do Poder; BNCC EF08GE05',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'GEO-MIS-07',
    code: 'GEO-MIS-07',
    subject: 'geography',
    topic: 'Projeções Cartográficas',
    bnccCodes: ['EF09GE14'],
    name: 'Projeção de Mercator Tomada como Cópia Fiel das Dimensões Reais da Terra',
    description: 'Acreditar que a Groenlândia é do tamanho da África ou que a Europa é maior que a América do Sul com base no mapa-múndi escolar de Mercator.',
    cognitiveFlaw: 'Desconhecimento de que é matematicamente impossível projetar uma esfera sobre um plano sem distorcer forma ou área.',
    studentExample: 'No mapa, a Groenlândia parece do tamanho da África, então elas têm a mesma área territorial.',
    diagnosticItem: 'Compare a Projeção de Mercator (conforme: mantém formas e deforma áreas) com a de Peters (equivalente: mantém proporção de áreas).',
    distractorExamples: ['a groenlândia tem a mesma área territorial do continente africano', 'a projeção de mercator não deforma tamanhos'],
    matchKeywords: ['groenlândia tamanho da áfrica', 'mercator tamanhos reais'],
    remediationAdvice: 'A projeção de Mercator preserva os ângulos e as formas para navegação, mas distorce enormemente as áreas nas altas latitudes: a África é na realidade 14 vezes maior que a Groenlândia.',
    source: 'Monmonier, M. How to Lie with Maps',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'GEO-MIS-08',
    code: 'GEO-MIS-08',
    subject: 'geography',
    topic: 'Problemas Ambientais Globais',
    bnccCodes: ['EF07CI14', 'EF08CI16'],
    name: 'Confusão entre Buraco na Camada de Ozônio e Aquecimento Global',
    description: 'Afirmar que o aquecimento global ocorre porque "os raios solares passam pelo buraco da camada de ozônio e entram mais na Terra".',
    cognitiveFlaw: 'Fusão sincrética de dois fenômenos atmosféricos distintos em uma única metáfora de "buraco quente".',
    studentExample: 'A Terra esquenta porque a camada de ozônio foi furada e o calor do Sol entra direto.',
    diagnosticItem: 'Diferencie o papel dos gases CFCs (destroem o O₃ e aumentam a radiação ultravioleta) dos gases de efeito estufa como CO₂ e CH₄ (retêm radiação infravermelha).',
    distractorExamples: ['o aquecimento global é causado pelo buraco de ozônio', 'o gás carbônico destrói o ozônio diretamente'],
    matchKeywords: ['buraco de ozônio causa aquecimento global', 'raios entram pelo buraco e esquentam'],
    remediationAdvice: 'A camada de ozônio filtra a radiação ultravioleta prejudicial à saúde; o aquecimento global decorre da retenção de calor (radiação infravermelha) pelos gases de efeito estufa. São problemas distintos com causas distintas.',
    source: 'Boyes & Stanisstreet (1993)',
    provenance: 'LITERATURA-CONFERIR'
  },

  // ─── 5. CIÊNCIAS DO ENSINO FUNDAMENTAL — TERRA E UNIVERSO (Seção 17.3) ──────
  {
    id: 'CIE-MIS-01',
    code: 'CIE-MIS-01',
    subject: 'science',
    topic: 'Terra e Universo — Estações do Ano',
    bnccCodes: ['EF08CI13'],
    name: 'Estações do Ano Atribuídas à Variação da Distância Terra-Sol',
    description: 'Acreditar que é verão porque a Terra está mais próxima do Sol e inverno porque ela está mais distante em sua órbita.',
    cognitiveFlaw: 'Metáfora da fogueira doméstica aplicada à astronomia planetária, ignorando a inclinação do eixo terrestre.',
    studentExample: 'No verão a Terra fica perto do Sol e no inverno fica longe.',
    diagnosticItem: 'Se fosse a distância ao Sol, por que quando é verão no Brasil (Hemisfério Sul) é rigorosamente inverno na Europa (Hemisfério Norte)?',
    distractorExamples: ['o verão ocorre no periélio quando a terra está mais próxima do sol', 'as estações dependem da distância orbital ao sol'],
    matchKeywords: ['verão terra perto do sol', 'inverno longe do sol', 'estações causadas pela distância'],
    matchRegex: /verão.*(terra|órbita).*(perto|próxim)|inverno.*longe\s+do\s+sol/i,
    remediationAdvice: 'As estações do ano ocorrem pela inclinação de 23,5° do eixo de rotação da Terra em relação à sua órbita, fazendo com que um hemisfério receba luz solar mais perpendicular do que o outro ao longo do ano.',
    source: 'Schneps, M. H., & Sadler, P. M. (1987). A Private Universe (Harvard-Smithsonian)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'CIE-MIS-02',
    code: 'CIE-MIS-02',
    subject: 'science',
    topic: 'Terra e Universo — Fases da Lua',
    bnccCodes: ['EF08CI12'],
    name: 'Fases da Lua Explicadas pela Sombra da Terra (Confusão com Eclipse)',
    description: 'Acreditar que a Lua fica minguante ou crescente porque a sombra da Terra está tapando um pedaço dela.',
    cognitiveFlaw: 'Confusão entre a geometria da iluminação solar contínua da esfera lunar vista da Terra e o fenômeno raro do eclipse lunar.',
    studentExample: 'A Lua fica quarto crescente porque a Terra fez sombra nela.',
    diagnosticItem: 'Desenhe as posições relativas do Sol, da Terra e da Lua no quarto crescente mostrando que metade da Lua está sempre iluminada.',
    distractorExamples: ['a fase minguante é a sombra projetada da terra sobre a lua', 'a lua nova é quando a terra fica entre o sol e a lua'],
    matchKeywords: ['sombra da terra faz as fases da lua', 'lua minguante é sombra da terra'],
    remediationAdvice: 'A metade da Lua voltada para o Sol está sempre 100% iluminada. As fases decorrem do ângulo a partir do qual nós, na Terra, conseguimos enxergar essa porção iluminada ao longo de 29,5 dias. A sombra da Terra ocorre apenas no eclipse.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'CIE-MIS-03',
    code: 'CIE-MIS-03',
    subject: 'science',
    topic: 'Matéria e Universo',
    bnccCodes: ['EF07CI12'],
    name: 'Crença de que Gases Não Têm Massa e o Ar Não Pesa',
    description: 'Acreditar que substâncias em estado gasoso (como ar e hélio) não possuem massa nem peso na balança.',
    cognitiveFlaw: 'Substancialismo sensorial: só é considerado matéria aquilo que pode ser tocado ou visto diretamente com peso aparente.',
    studentExample: 'O ar não tem peso porque é transparente e voa.',
    diagnosticItem: 'Coloque em uma balança de precisão uma bola de basquete murcha e outra cheia: a bola cheia é mais pesada.',
    distractorExamples: ['os gases não possuem massa por serem intangíveis', 'um balão cheio de ar pesa o mesmo que vazio'],
    matchKeywords: ['ar não tem peso', 'gases não têm massa', 'ar não pesa'],
    remediationAdvice: 'O ar é matéria e possui massa: 1 m³ de ar atmosférico ao nível do mar pesa aproximadamente 1,2 kg.',
    source: 'Driver et al. (1994). Making Sense of Secondary Science',
    provenance: 'LITERATURA-CONFERIR'
  },

  // ─── 6. FÍSICA (Seção 17.4 do Parecer) ───────────────────────────────────────
  {
    id: 'FIS-MIS-01',
    code: 'FIS-MIS-01',
    subject: 'physics',
    topic: 'Dinâmica e Leis de Newton',
    bnccCodes: ['EM13CNT204'],
    name: 'Concepção de Impetus (Movimento Implica Força Resultante na Direção da Velocidade)',
    description: 'Acreditar que se um corpo está se movendo para a frente, obrigatoriamente existe uma força apontando para a frente empurrando-o.',
    cognitiveFlaw: 'Física do impetus (Buridan, séc. XIV) confundindo vetor velocidade com vetor força resultante.',
    studentExample: 'Uma bola de boliche jogada na pista continua andando porque a força da mão ainda está dentro dela.',
    diagnosticItem: 'Em uma superfície sem atrito, qual é a força resultante necessária para manter um corpo em movimento uniforme? (Zero, por inércia).',
    distractorExamples: [
      'a força do lançamento continua atuando na bola até ela parar',
      'para haver velocidade constante é necessária uma força resultante constante',
      'no ar a bola tem força para cima'
    ],
    matchKeywords: ['força da mão continua', 'movimento exige força resultante', 'força de lançamento no corpo'],
    matchRegex: /força.*(lançamento|da mão).*(continua|dentro da bola)|velocidade constante.*exige força/i,
    remediationAdvice: 'Pela Primeira Lei de Newton (Inércia), um corpo em movimento livre não precisa de nenhuma força para continuar se movendo em linha reta com velocidade constante. Força causa aceleração (mudança de velocidade), não velocidade.',
    source: 'Hestenes, Wells & Swackhamer (1992). Force Concept Inventory (FCI); Buridan',
    provenance: 'LITERATURA-CONFERIR',
    contrastsWith: ['FIS-MIS-02']
  },
  {
    id: 'FIS-MIS-02',
    code: 'FIS-MIS-02',
    subject: 'physics',
    topic: 'Cinemática e Lançamento Vertical',
    bnccCodes: ['EM13CNT204'],
    name: 'Confusão entre Velocidade Nula e Aceleração Nula no Topo da Trajetória',
    description: 'Afirmar que quando um objeto lançado para cima atinge a altura máxima, sua aceleração é zero porque ele para instantaneamente.',
    cognitiveFlaw: 'Indiscriminação entre o valor da função velocidade v(t)=0 e a derivada da velocidade (taxa de variação a(t)=g).',
    studentExample: 'No ponto mais alto a bola para, então a aceleração é zero.',
    diagnosticItem: 'Se a aceleração fosse zero no ponto mais alto, a velocidade não mudaria e a bola ficaria flutuando parada no ar para sempre.',
    distractorExamples: [
      'a aceleração é nula porque a velocidade é nula',
      'a aceleração aponta para cima no ponto mais alto',
      'a gravidade para de atuar na altura máxima'
    ],
    matchKeywords: ['aceleração nula no topo', 'aceleração é zero quando para', 'aceleração zero na altura máxima'],
    matchRegex: /ponto mais alto.*aceleração.*(zero|nula)|velocidade nula.*aceleração zero/i,
    remediationAdvice: 'No ponto mais alto, a velocidade é instantaneamente nula (v = 0), mas a aceleração gravitacional continua atuando apontando para baixo com módulo g = 9,8 m/s² constante.',
    source: 'Hestenes et al. (1992)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'FIS-MIS-03',
    code: 'FIS-MIS-03',
    subject: 'physics',
    topic: 'Terceira Lei de Newton',
    bnccCodes: ['EM13CNT204'],
    name: 'Crença de que Forças de Ação e Reação se Anulam no Mesmo Corpo',
    description: 'Acreditar que um cavalo não consegue puxar uma carroça porque a força que a carroça faz para trás anula a força do cavalo.',
    cognitiveFlaw: 'Desconsideração do ponto de aplicação vetorial: somar na mesma equação forças aplicadas em corpos distintos.',
    studentExample: 'Ação e reação têm mesmo valor e sentidos opostos, então o somatório dá zero e nada se move.',
    diagnosticItem: 'Em qual corpo atua a força de tração da corda? (Na carroça). Onde atua a reação? (No cavalo). Forças em corpos diferentes nunca se anulam.',
    distractorExamples: [
      'ação e reação se equilibram por terem sinais opostos',
      'o caminhão faz uma força maior no fusca do que o fusca faz no caminhão',
      'a força do cavalo se anula com a força da carroça'
    ],
    matchKeywords: ['ação e reação se anulam', 'ação e reação se equilibram', 'caminhão faz força maior que o carro'],
    remediationAdvice: 'As forças de ação e reação NUNCA se anulam porque atuam em corpos diferentes. O que faz a carroça acelerar é a força resultante aplicada nela pelos pneus e pela corda.',
    source: 'Hewitt, P. Física Conceitual; Hestenes et al.',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'FIS-MIS-04',
    code: 'FIS-MIS-04',
    subject: 'physics',
    topic: 'Termologia',
    bnccCodes: ['EF07CI02', 'EM13CNT102'],
    name: 'Confusão Calor vs. Temperatura e "Frio como Substância Física"',
    description: 'Acreditar que o agasalho de lã "produz calor" ou que um objeto de metal está a uma temperatura menor do que um livro no mesmo quarto.',
    cognitiveFlaw: 'Confundir sensação tátil de condutividade térmica com temperatura de equilíbrio e energia térmica em trânsito com estoque.',
    studentExample: 'O casaco esquenta o corpo e a maçaneta de ferro é mais fria que a porta de madeira.',
    diagnosticItem: 'Se o livro e a maçaneta estão no mesmo quarto há 24 horas, ambos estão na mesma temperatura de equilíbrio térmico.',
    distractorExamples: ['a maçaneta está em temperatura menor que a madeira', 'o casaco produz calor', 'o frio entra pela janela aberta'],
    matchKeywords: ['casaco produz calor', 'maçaneta mais fria', 'frio entra'],
    remediationAdvice: 'Temperatura mede o grau médio de agitação molecular; Calor é a energia térmica em trânsito do corpo mais quente para o mais frio. "Frio" não existe como substância física, é apenas a ausência ou perda de calor. O metal parece mais frio porque conduz calor para fora da sua mão mais rápido.',
    source: 'Driver et al. (1994); Carvalho (2013)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'FIS-MIS-05',
    code: 'FIS-MIS-05',
    subject: 'physics',
    topic: 'Eletrodinâmica',
    bnccCodes: ['EF08CI02', 'EM13CNT106'],
    name: 'Modelo da Corrente Elétrica "Consumida / Gasta" no Resistor',
    description: 'Acreditar que a corrente que entra na lâmpada pelo fio positivo é maior do que a corrente que sai dela pelo fio negativo.',
    cognitiveFlaw: 'Confundir o consumo de energia potencial elétrica (tensão/voltagem) com o desaparecimento físico dos elétrons portadores de carga.',
    studentExample: 'A lâmpada brilha porque gasta os elétrons que chegam nela.',
    diagnosticItem: 'Coloque um amperímetro antes e outro depois da lâmpada: a corrente em amperes é rigorosamente idêntica em ambos os pontos.',
    distractorExamples: [
      'a corrente que retorna à bateria é menor que a que sai',
      'os elétrons são consumidos pelo resistor',
      'a lâmpada gasta corrente'
    ],
    matchKeywords: ['corrente consumida', 'gasta elétrons', 'corrente menor depois da lâmpada'],
    remediationAdvice: 'A corrente elétrica (número de elétrons por segundo) é rigorosamente conservada ao longo do circuito fechado. O que é consumido e transformado em luz e calor é a energia potencial elétrica, e não a carga.',
    source: 'Shipstone, D. M. (1985). Electricity in Science Education',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'FIS-MIS-06',
    code: 'FIS-MIS-06',
    subject: 'physics',
    topic: 'Gravitação e Queda Livre',
    bnccCodes: ['EM13CNT204'],
    name: 'Aceleração de Queda Livre Proporcional à Massa no Vácuo',
    description: 'Acreditar que uma bola de boliche cai duas vezes mais rápido que uma pena na ausência de resistência do ar.',
    cognitiveFlaw: 'Confundir a Força Peso (que de fato é maior no corpo pesado, P = m·g) com a Aceleração adquirida (a = P/m = g constante).',
    studentExample: 'O corpo pesado cai mais rápido porque a gravidade puxa ele com mais força.',
    diagnosticItem: 'No tubo de vácuo sem ar, a pena e a esfera de chumbo atingem o chão rigorosamente juntas (experimento da Apollo 15).',
    distractorExamples: ['a aceleração da gravidade é maior no corpo de maior massa', 'no vácuo o objeto mais pesado chega primeiro'],
    matchKeywords: ['pesado cai mais rápido no vácuo', 'massa maior aceleração maior'],
    remediationAdvice: 'O corpo mais pesado é atraído com maior força peso, mas tem exatamente maior inércia proporcional para resistir à aceleração. Pela Segunda Lei, a = P / m = (m·g) / m = g. No vácuo, todos os corpos caem com a mesma aceleração.',
    source: 'Galileu Galilei; Hestenes et al. (1992)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'FIS-MIS-07',
    code: 'FIS-MIS-07',
    subject: 'physics',
    topic: 'Óptica Geométrica',
    bnccCodes: ['EF09CI04', 'EM13CNT103'],
    name: 'Visão por Emissão Ocular de Raios Visuais',
    description: 'Acreditar que nós enxergamos porque nossos olhos "emitem raios" em direção aos objetos, ou que em uma sala 100% escura após alguns minutos a visão se adapta e enxerga.',
    cognitiveFlaw: 'Modelo visual extramissionista pré-científico atribuindo à visão uma emissão sensorial do olho.',
    studentExample: 'O olho dispara raios para ver os objetos; se eu me acostumar no escuro absoluto vou enxergar.',
    diagnosticItem: 'Em um quarto sem nenhum fóton de luz, nem com adaptação de horas o olho é capaz de ver nada: enxergamos a luz que entra na pupila.',
    distractorExamples: ['o olho emite feixes de visão', 'enxergamos no escuro absoluto com adaptação', 'o objeto é visto sem luz incidindo'],
    matchKeywords: ['olho emite raios', 'visão por emissão', 'ver no escuro absoluto'],
    remediationAdvice: 'A visão é intromissionista: só enxergamos um objeto quando a luz emitida ou refletida por ele atinge a retina no fundo do olho. Sem luz não há visão.',
    source: 'Andersson & Kärrqvist (1983); Guesne (1985)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'FIS-MIS-08',
    code: 'FIS-MIS-08',
    subject: 'physics',
    topic: 'Grandezas Físicas e Gravidade',
    bnccCodes: ['EF07CI01', 'EM13CNT204'],
    name: 'Equiparação Sinônima entre Massa e Peso',
    description: 'Afirmar que a massa de uma pessoa diminui quando ela vai para a Lua, ou usar "quilogramas" como unidade de peso.',
    cognitiveFlaw: 'Uso da linguagem cotidiana leiga ("me pesei na farmácia") transposta para o rigor da física newtoniana.',
    studentExample: 'Meu peso é 70 kg e na Lua minha massa vai ser menor.',
    diagnosticItem: 'A massa de 70 kg é invariante na Terra e na Lua. O peso é medido em Newtons: P = 70 × 9,8 ≈ 686 N na Terra e 70 × 1,6 ≈ 112 N na Lua.',
    distractorExamples: ['o peso é medido em quilogramas', 'a massa de uma pessoa muda de acordo com o planeta'],
    matchKeywords: ['peso de 70 kg', 'massa muda na lua', 'peso e massa são iguais'],
    remediationAdvice: 'Massa é a quantidade de matéria e inércia de um corpo, medida em quilogramas (kg) invariante em qualquer lugar do Universo; Peso é a força vetorial gravitacional, medida em Newtons (N) e varia com a gravidade local.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'FIS-MIS-09',
    code: 'FIS-MIS-09',
    subject: 'physics',
    topic: 'Conservação da Energia',
    bnccCodes: ['EF08CI01', 'EM13CNT101'],
    name: 'Energia Tratada como Entidade Consumível e Destrutível',
    description: 'Afirmar que quando um carro freia e para sua energia cinética "desapareceu ou foi destruída".',
    cognitiveFlaw: 'Confundir dissipação térmica com aniquilação física da energia.',
    studentExample: 'A energia cinética do carro que freou sumiu.',
    diagnosticItem: 'Para onde foi a energia cinética? Os discos de freio e os pneus esquentaram: a energia mecânica transformou-se em energia térmica.',
    distractorExamples: ['a energia cinética foi totalmente destruída', 'a energia é consumida e deixa de existir'],
    matchKeywords: ['energia sumiu', 'energia foi destruída na frenagem', 'energia consumida do nada'],
    remediationAdvice: 'Pelo Princípio da Conservação da Energia, a energia nunca pode ser criada nem destruída, apenas transformada de uma forma em outra (no freio, a energia cinética vira calor por atrito).',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'FIS-MIS-10',
    code: 'FIS-MIS-10',
    subject: 'physics',
    topic: 'Hidrostática e Empuxo',
    bnccCodes: ['EF09CI01', 'EM13CNT204'],
    name: 'Flutuação Explicada Unicamente pelo Peso Absoluto',
    description: 'Acreditar que um navio de aço de 50.000 toneladas deveria afundar por ser "pesado demais" e que uma moeda afunda por ser pesada.',
    cognitiveFlaw: 'Falta de articulação entre a massa volumétrica média (densidade) e a força de empuxo hidrostático de Arquimedes.',
    studentExample: 'O navio de aço não deveria flutuar porque aço é pesado.',
    diagnosticItem: 'O navio é oco: sua densidade média global (aço + ar interno) é menor do que a densidade da água (1 g/cm³), logo ele flutua.',
    distractorExamples: ['objetos pesados afundam e leves flutuam obrigatoriamente', 'o navio flutua porque a água não tem gravidade'],
    matchKeywords: ['navio pesado demais para flutuar', 'afunda porque é pesado'],
    remediationAdvice: 'A flutuação depende da densidade média do corpo comparada à densidade do fluido e do Empuxo (peso do fluido deslocado). Se a densidade média for menor que a da água, o corpo flutua, independentemente do seu peso absoluto.',
    source: 'Síntese pedagógica Teacher AI; Arquimedes',
    provenance: 'SINTESE-TA'
  },

  // ─── 7. QUÍMICA (Seção 17.4 do Parecer) ───────────────────────────────────────
  {
    id: 'QUI-MIS-01',
    code: 'QUI-MIS-01',
    subject: 'chemistry',
    topic: 'Modelos Atômicos e Estrutura da Matéria',
    bnccCodes: ['EF09CI03', 'EM13CNT307'],
    name: 'Atribuição de Propriedades Macroscópicas a Átomos Isolados (Substancialismo)',
    description: 'Acreditar que o átomo de cobre é avermelhado e conduz eletricidade, ou que a molécula de água se expande ao aquecer.',
    cognitiveFlaw: 'Obstáculo substancialista de Bachelard: transpor propriedades emergentes do conjunto para a partícula indivisível.',
    studentExample: 'O átomo de ouro brilha e é amarelo.',
    diagnosticItem: 'Cor e condução elétrica são fenômenos coletivos de mar de elétrons e interação de fótons com bandas de energia: átomos isolados não têm cor nem maleabilidade.',
    distractorExamples: [
      'o átomo de cobre é maleável e brilhante',
      'as moléculas de água aumentam de volume quando a água ferve',
      'o átomo de ferro enferruja'
    ],
    matchKeywords: ['átomo de ouro é amarelo', 'molécula dilata', 'átomo de cobre conduz eletricidade'],
    remediationAdvice: 'Propriedades como cor, ponto de fusão, densidade e condutividade elétrica são propriedades macroscópicas emergentes da união de trilhões de átomos. Um átomo isolado não tem cor nem estado físico.',
    source: 'Bachelard, G. (1938); Johnstone, A. H. (1991)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'QUI-MIS-02',
    code: 'QUI-MIS-02',
    subject: 'chemistry',
    topic: 'Ligações Químicas vs. Forças Intermoleculares',
    bnccCodes: ['EF09CI01', 'EM13CNT307'],
    name: 'Fervura da Água Interpretada como Quebra de Ligações Covalentes O–H',
    description: 'Acreditar que quando a água ferve (H₂O(l) -> H₂O(g)), as ligações intramoleculares se rompem liberando gases hidrogênio e oxigênio.',
    cognitiveFlaw: 'Confundir mudança física de estado (superação de forças intermoleculares) com reação química de decomposição.',
    studentExample: 'Ao ferver a água na panela, o vapor que sobe é uma mistura de gás hidrogênio e oxigênio.',
    diagnosticItem: 'O vapor de água continua sendo H₂O pura: as moléculas apenas se afastaram ao romper as ligações de hidrogênio intermoleculares.',
    distractorExamples: [
      'rompem-se as ligações O-H formando H₂ e O₂',
      'a fervura é uma reação química de quebra das moléculas de água',
      'o vapor de água é inflamável por conter hidrogênio gasoso'
    ],
    matchKeywords: ['fervura quebra ligação covalente', 'vapor de água é H2 e O2', 'rompe ligações O-H na fervura'],
    matchRegex: /ferver.*(rompe|quebra).*(ligações?\s+covalente|ligação\s+O-?H)|vapor.*(H2\s+e\s+O2)/i,
    remediationAdvice: 'Na ebulição da água, NENHUMA ligação covalente interna da molécula é quebrada. O que se rompe são apenas as fracas interações intermoleculares (ligações de hidrogênio), afastando as moléculas intactas de H₂O.',
    source: 'Osborne & Cosgrove (1983); Johnstone (1991)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'QUI-MIS-03',
    code: 'QUI-MIS-03',
    subject: 'chemistry',
    topic: 'Leis Ponderais — Lavoisier',
    bnccCodes: ['EF09CI02', 'EM13CNT101'],
    name: 'Aparente Violação de Lavoisier em Reações de Oxidação ou Liberação de Gás',
    description: 'Observar que a palha de aço oxidada pesa mais na balança ou que um efervescente perde peso e concluir que a Lei de Lavoisier falhou.',
    cognitiveFlaw: 'Não contabilizar a matéria em estado gasoso (O₂ absorvido do ar ou CO₂ liberado) em recipientes abertos.',
    studentExample: 'A palha de aço enferrujou e a balança marcou mais massa, logo a massa não se conservou.',
    diagnosticItem: 'Ao queimar palha de aço em um frasco fechado hermeticamente, a massa antes e depois é rigorosamente idêntica.',
    distractorExamples: [
      'a lei de lavoisier não se aplica a reações de queima de palha de aço',
      'a massa diminui na efervescência porque a matéria virou energia',
      'a ferrugem cria átomos do nada aumentando a massa'
    ],
    matchKeywords: ['lavoisier falhou na palha de aço', 'massa aumenta na ferrugem sem oxigênio', 'gás não conta na massa'],
    remediationAdvice: 'Na queima da palha de aço em sistema aberto, a massa sólida aumenta porque átomos de oxigênio gasoso (O₂) do ar se ligam ao ferro formando Fe₂O₃. Se o sistema fosse fechado, a massa total do ar + ferro seria rigorosamente constante.',
    source: 'Driver et al. (1994); Lavoisier',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'QUI-MIS-04',
    code: 'QUI-MIS-04',
    subject: 'chemistry',
    topic: 'Balanceamento de Equações Químicas',
    bnccCodes: ['EF09CI02', 'EM13CNT101'],
    name: 'Alteração dos Índices Subscritos da Fórmula para Balancear a Reação',
    description: 'Tentar balancear H₂ + O₂ -> H₂O alterando os subscritos para H₂ + O₂ -> H₂O₂.',
    cognitiveFlaw: 'Confundir a proporção estequiométrica de moléculas inteiras (coeficientes) com a identidade química molecular da substância (subscrito).',
    studentExample: 'Para balancear H₂ + O₂ -> H₂O, escreve-se H₂ + O₂ -> H₂O₂.',
    diagnosticItem: 'H₂O é água potável; H₂O₂ é água oxigenada, substância corrosiva e tóxica. O balanceamento correto altera os coeficientes: 2 H₂ + O₂ -> 2 H₂O.',
    distractorExamples: [
      'H₂ + O₂ -> H₂O₂',
      'alterar o subscrito do oxigênio para equilibrar a reação',
      'mudar a fórmula da substância para fechar a conta dos átomos'
    ],
    matchKeywords: ['H2 + O2 = H2O2', 'muda o subscrito no balanceamento', 'alterar o índice da fórmula'],
    remediationAdvice: 'Ao balancear uma equação química, NUNCA altere os números subscritos das fórmulas, pois isso muda a própria substância química. Altere apenas os coeficientes estequiométricos à frente das moléculas.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'QUI-MIS-05',
    code: 'QUI-MIS-05',
    subject: 'chemistry',
    topic: 'Termoquímica',
    bnccCodes: ['EM13CNT101'],
    name: 'Crença de que Quebrar Ligações Químicas Libera Energia',
    description: 'Acreditar que a ruptura de uma ligação química é um processo exotérmico que libera energia para o meio.',
    cognitiveFlaw: 'Influência de expressões biológicas imprecisas ("quebra de ATP libera energia") transpostas erroneamente para a física-química.',
    studentExample: 'Quando quebramos a ligação entre dois átomos a energia explode para fora.',
    diagnosticItem: 'Para separar dois ímãs grudados é preciso gastar energia; da mesma forma, romper ligações químicas sempre consome energia (endotérmico).',
    distractorExamples: [
      'a quebra de ligações químicas é sempre exotérmica',
      'quebrar a ligação química do ATP libera energia diretamente da quebra',
      'a energia é armazenada dentro da ligação como uma mola esticada que se rompe'
    ],
    matchKeywords: ['quebrar ligação libera energia', 'ruptura de ligação é exotérmica'],
    remediationAdvice: 'TODA quebra de ligação química consome energia (processo endotérmico, ΔH > 0). A energia é liberada quando NOVAS ligações mais estáveis se FORMAM nos produtos.',
    source: 'Barker, V. (2000). Beyond Appearances: Students\' Misconceptions in Chemistry',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'QUI-MIS-06',
    code: 'QUI-MIS-06',
    subject: 'chemistry',
    topic: 'Grandezas Químicas — Mol',
    bnccCodes: ['EM13CNT101'],
    name: 'Mol Interpretado como Unidade de Massa ou Número Físico Pequeno',
    description: 'Confundir mol com grama, ou achar que 1 mol é uma partícula microscópica individual.',
    cognitiveFlaw: 'Falta de analogia com unidades de contagem de coletivos (ex: 1 dúzia = 12 laranjas; 1 mol = 6,02 × 10²³ partículas).',
    studentExample: 'Um mol de água é uma molécula de água.',
    diagnosticItem: 'Quantas moléculas há em 18 gramas de água? (Há 1 mol = 6,02 × 10²³ moléculas).',
    distractorExamples: ['1 mol equivale a 1 molécula', 'mol é o mesmo que miligrama', '1 mol de chumbo tem a mesma massa de 1 mol de hidrogênio'],
    matchKeywords: ['mol é molécula', 'mol é miligrama', '1 mol é pequeno'],
    remediationAdvice: 'Mol é uma unidade de quantidade de matéria (contagem): 1 mol de qualquer substância contém sempre 6,02 × 10²³ entidades elementares, assim como 1 dúzia contém 12 unidades.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'QUI-MIS-07',
    code: 'QUI-MIS-07',
    subject: 'chemistry',
    topic: 'Equilíbrio Químico',
    bnccCodes: ['EM13CNT101'],
    name: 'Equilíbrio Químico Interpretado como Reações Estáticas e Paradas',
    description: 'Acreditar que no estado de equilíbrio químico as reações direta e inversa cessaram por completo e as moléculas pararam de reagir.',
    cognitiveFlaw: 'Concepção de equilíbrio mecânico estático (balança parada) transposta para um equilíbrio dinâmico molecular.',
    studentExample: 'No equilíbrio químico a reação parou e nada mais acontece.',
    diagnosticItem: 'No equilíbrio, o que ocorre com a velocidade da reação direta e da inversa? (v_direta = v_inversa > 0, reações continuam ocorrendo).',
    distractorExamples: [
      'no equilíbrio a reação para completamente com velocidade zero',
      'as concentrações de reagentes e produtos têm que ser obrigatoriamente iguais no equilíbrio',
      'o equilíbrio impede qualquer transformação química futura'
    ],
    matchKeywords: ['equilíbrio a reação parou', 'velocidade é zero no equilíbrio', 'concentração igual no equilíbrio'],
    remediationAdvice: 'O equilíbrio químico é DINÂMICO: as reações direta e inversa continuam ocorrendo sem parar, mas com velocidades exatamente iguais (v_direta = v_inversa), mantendo as concentrações macroscópicas constantes.',
    source: 'Hackling & Garnett (1985)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'QUI-MIS-08',
    code: 'QUI-MIS-08',
    subject: 'chemistry',
    topic: 'Funções Inorgânicas — Ácidos e Bases',
    bnccCodes: ['EM13CNT104', 'EM13CNT307'],
    name: 'Confusão entre Força Ácida (Grau de Ionização) e Concentração da Solução',
    description: 'Acreditar que ácido forte é o mesmo que ácido concentrado, ou que ácido fraco nunca pode queimar a pele.',
    cognitiveFlaw: 'Indiscriminação entre grau de dissociação/ionização α (força química intrínseca) e quantidade de soluto por volume (concentração molar).',
    studentExample: 'Ácido acético a 99% é forte porque está concentrado.',
    diagnosticItem: 'Compare HCl diluído 0,01 mol/L (ácido forte, α > 90%) com ácido acético concentrado 10 mol/L (ácido fraco, α ≈ 1%).',
    distractorExamples: [
      'ácido forte é aquele que tem alta concentração na garrafa',
      'ácido acético do vinagre é forte se estiver puro',
      'ácidos diluídos são sempre fracos'
    ],
    matchKeywords: ['ácido forte é concentrado', 'ácido fraco é diluído'],
    remediationAdvice: 'Força ácida é a facilidade com que a molécula libera íons H+ em água (grau de ionização α); Concentração é a quantidade de moléculas por litro de solução. Um ácido pode ser fraco e estar extremamente concentrado.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'QUI-MIS-09',
    code: 'QUI-MIS-09',
    subject: 'chemistry',
    topic: 'Cálculo Estequiométrico',
    bnccCodes: ['EM13CNT101'],
    name: 'Reagente Limitante Identificado pela Menor Massa em Gramas',
    description: 'Olhar para uma mistura de 10 g de reagente A com 15 g de reagente B e concluir automaticamente que A é o limitante por ter menor massa.',
    cognitiveFlaw: 'Falta de conversão para quantidade de matéria em mols e desconsideração da proporção estequiométrica da equação.',
    studentExample: 'Tenho 10 g de H₂ e 50 g de O₂. O H₂ é o limitante porque 10 g é menor que 50 g.',
    diagnosticItem: 'Converta para mols: 10 g de H₂ = 5 mols de H₂; 50 g de O₂ = 1,56 mol de O₂. A reação 2 H₂ + O₂ -> 2 H₂O exige 3,12 mols de H₂. Portanto o O₂ é o limitante!',
    distractorExamples: [
      'o limitante é sempre o de menor massa em gramas',
      'reagentes reagem na proporção de suas massas em gramas diretamente',
      'o reagente em excesso é o de maior volume'
    ],
    matchKeywords: ['limitante é a menor massa', 'menor em gramas é o limitante'],
    remediationAdvice: 'A Química não reage em gramas, reage em mols! O reagente limitante só pode ser determinado após converter todas as massas em mols e dividir pelos coeficientes estequiométricos da reação balanceada.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'QUI-MIS-10',
    code: 'QUI-MIS-10',
    subject: 'chemistry',
    topic: 'Eletroquímica e Oxirredução',
    bnccCodes: ['EM13CNT107'],
    name: 'Oxidação Restrita à Presença Obrigatória de Gás Oxigênio',
    description: 'Acreditar que uma reação de oxidação só pode ocorrer se houver elemento oxigênio envolvido no processo.',
    cognitiveFlaw: 'Adesão ao sentido etimológico histórico da palavra (Lavoisier) ignorando a definição moderna baseada em perda de elétrons e aumento de Nox.',
    studentExample: 'Na reação Mg + Cl₂ -> MgCl₂, não há oxidação porque não tem oxigênio.',
    diagnosticItem: 'O magnésio passou de Nox 0 para Nox +2 perdendo 2 elétrons: ele foi oxidado pelo cloro, mesmo sem nenhum átomo de oxigênio.',
    distractorExamples: [
      'não ocorre oxidação sem gás oxigênio como reagente',
      'oxidação é apenas a ferrugem causada pelo ar',
      'o cloro não pode atuar como agente oxidante'
    ],
    matchKeywords: ['oxidação exige oxigênio', 'sem O2 não oxida', 'oxigênio obrigatório para oxidar'],
    remediationAdvice: 'Na química moderna, oxidação é a perda de elétrons (aumento do Número de Oxidação - Nox), e redução é o ganho de elétrons. O cloro, o flúor e muitos outros elementos oxidam metais sem a presença de oxigênio.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },

  // ─── 8. BIOLOGIA (Seção 17.4 do Parecer) ─────────────────────────────────────
  {
    id: 'BIO-MIS-01',
    code: 'BIO-MIS-01',
    subject: 'biology',
    topic: 'Evolução e Genética',
    bnccCodes: ['EF09CI10', 'EM13CNT208'],
    name: 'Teleologia e Lamarckismo Adaptativo ("Mutação Sob Demanda")',
    description: 'Afirmar que as bactérias "criaram resistência" para não morrerem com o antibiótico ou que as girafas esticaram o pescoço para alcançar folhas altas.',
    cognitiveFlaw: 'Pensamento teleológico finalista: atribuir intenção consciente, propósito ou necessidade adaptativa direta como geradora de mutações genéticas.',
    studentExample: 'O uso de antibióticos fez as bactérias mutarem para ficarem resistentes.',
    diagnosticItem: 'As mutações de resistência surgiram antes ou depois da aplicação do antibiótico? (Surgiram antes, ao acaso; o antibiótico apenas selecionou as que já eram resistentes).',
    distractorExamples: [
      'o antibiótico induziu mutações para que a bactéria sobrevivesse',
      'as bactérias se adaptaram voluntariamente criando defesas',
      'a necessidade do meio ambiente gera a mutação adequada'
    ],
    matchKeywords: ['mutaram para sobreviver', 'criaram resistência para', 'para se adaptar', 'o meio ambiente provoca a mutação'],
    matchRegex: /bactérias?.*(mutaram|evoluíram|criaram).*para\s+(sobreviver|resistir)|para\s+se\s+adaptar/i,
    remediationAdvice: 'As mutações genéticas ocorrem ao acaso e independentemente da necessidade do organismo. O antibiótico NÃO induz resistência: ele atua como agente seletivo, matando as sensíveis e permitindo que as previamente resistentes sobrevivam.',
    source: 'Mayr, E. (1997); Gould, S. J.; Bishop & Anderson (1990)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'BIO-MIS-02',
    code: 'BIO-MIS-02',
    subject: 'biology',
    topic: 'Fisiologia Vegetal e Bioenergética',
    bnccCodes: ['EF06CI05', 'EM13CNT202'],
    name: 'Exclusão Mútua entre Fotossíntese e Respiração Celular nas Plantas',
    description: 'Acreditar que plantas realizam fotossíntese de dia e respiram apenas à noite, ou que a fotossíntese é a "respiração" da planta.',
    cognitiveFlaw: 'Confundir a via anabólica autótrofa de produção de glicose com a via catabólica mitocondrial contínua de liberação de ATP.',
    studentExample: 'As plantas respiram gás carbônico de dia e oxigênio de noite.',
    diagnosticItem: 'As células vegetais possuem mitocôndrias? Sim, e precisam de ATP 24 horas por dia: as plantas respiram continuamente dia e noite.',
    distractorExamples: [
      'as plantas fazem fotossíntese de dia e respiram apenas à noite',
      'a fotossíntese é a respiração das plantas',
      'as plantas não consomem oxigênio durante o dia'
    ],
    matchKeywords: ['plantas respiram só à noite', 'fotossíntese é a respiração vegetal', 'planta não respira de dia'],
    remediationAdvice: 'As plantas realizam respiração celular aeróbica ininterruptamente (24 horas por dia), consumindo O₂ nas mitocôndrias. A fotossíntese nos cloroplastos ocorre na presença de luz, produzindo glicose e liberando O₂ excedente.',
    source: 'Driver et al. (1994); Wandersee (1983)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'BIO-MIS-03',
    code: 'BIO-MIS-03',
    subject: 'biology',
    topic: 'Ecologia — Fluxo de Energia',
    bnccCodes: ['EF07CI08', 'EM13CNT203'],
    name: 'Confusão entre o Ciclo da Matéria e o Fluxo Unidirecional da Energia',
    description: 'Afirmar que a energia dos ecossistemas é reciclada pelos decompositores e devolvida aos produtores.',
    cognitiveFlaw: 'Confundir o ciclo biogeoquímico fechado dos nutrientes minerais (C, N, P) com a degradação entrópica unidirecional da energia.',
    studentExample: 'Os decompositores reciclam a energia para a planta usar de novo.',
    diagnosticItem: 'A energia térmica dissipada na respiração dos seres vivos pode ser reaproveitada pelos produtores? (Não, flui unidirecionalmente).',
    distractorExamples: [
      'a energia é ciclada infinitamente na cadeia alimentar',
      'os decompositores devolvem a energia para os produtores',
      'a energia se conserva sem perdas térmicas ao longo dos níveis tróficos'
    ],
    matchKeywords: ['energia é reciclada', 'decompositores reciclam energia', 'ciclo da energia na cadeia'],
    remediationAdvice: 'A matéria é ciclada (os decompositores reciclam nutrientes químicos); a ENERGIA tem fluxo estritamente UNIDIRECIONAL e decrescente: entra como luz solar, passa pelos níveis tróficos e dissipa-se irreversivelmente como calor.',
    source: 'Odum, E. P. Fundamentos de Ecologia; Driver et al.',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'BIO-MIS-04',
    code: 'BIO-MIS-04',
    subject: 'biology',
    topic: 'Imunologia e Saúde Pública',
    bnccCodes: ['EF07CI10', 'EM13CNT310'],
    name: 'Confusão entre Vacina (Imunização Ativa) e Soro Terapêutico (Imunização Passiva)',
    description: 'Acreditar que a vacina contém anticorpos prontos para curar uma infecção aguda grave imediata ou que soro gera imunidade permanente.',
    cognitiveFlaw: 'Indiscriminação entre indução de memória imunológica própria por antígenos atenuados vs. neutralização imediata por anticorpos heterólogos.',
    studentExample: 'Se alguém for picado por cobra cascavel deve tomar uma vacina antiofídica.',
    diagnosticItem: 'Quem produz os anticorpos na vacina? (O próprio corpo, levando dias). O que contém o soro? (Anticorpos prontos de efeito imediato e sem memória).',
    distractorExamples: [
      'a vacina fornece anticorpos prontos para curar a doença no mesmo dia',
      'o soro antiofídico gera memória imunológica para a vida toda',
      'vacinas curam o veneno de serpentes'
    ],
    matchKeywords: ['vacina tem anticorpos prontos', 'vacina cura veneno de cobra', 'soro gera memória imunológica'],
    remediationAdvice: 'Vacina contém antígenos inativados para estimular o próprio organismo a produzir anticorpos e células de memória (imunização ativa preventiva); Soro contém anticorpos prontos para neutralizar toxinas urgentes sem gerar memória (imunização passiva curativa).',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'BIO-MIS-05',
    code: 'BIO-MIS-05',
    subject: 'biology',
    topic: 'Sistemática Filogenética e Cladogramas',
    bnccCodes: ['EM13CNT208'],
    name: 'Leitura Linear Escalar de Cladogramas ("Escada do Progresso Evolutivo")',
    description: 'Ler o cladograma da esquerda para a direita acreditando que o grupo na ponta direita é "mais evoluído" que os demais.',
    cognitiveFlaw: 'Persistência do modelo medieval da "Scala Naturae" (Grande Cadeia do Ser) sobreposto às árvores filogenéticas ramificadas.',
    studentExample: 'Os mamíferos são o topo da evolução em relação aos peixes.',
    diagnosticItem: 'Gire um nó do cladograma: a relação de parentesco muda? (Não, cladogramas não têm topo nem seres "mais evoluídos").',
    distractorExamples: [
      'o táxon mais à direita é o mais evoluído de todos',
      'os seres vivos evoluem em linha reta rumo à perfeição humana',
      'os peixes pararam no tempo e não evoluíram mais'
    ],
    matchKeywords: ['mais à direita mais evoluído', 'topo da evolução no cladograma', 'escada evolutiva'],
    remediationAdvice: 'A evolução biológica é uma árvore ramificada, não uma escada linear. Todos os seres vivos atuais têm a mesma idade evolutiva e acumularam adaptações específicas para seus nichos: não há organismos "mais evoluídos" que outros.',
    source: 'Baum, Smith & Donovan (2005). The Tree-Thinking Challenge. Science',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'BIO-MIS-06',
    code: 'BIO-MIS-06',
    subject: 'biology',
    topic: 'Genética Mendeliana',
    bnccCodes: ['EF09CI09', 'EM13CNT205'],
    name: 'Equiparação entre Dominância Alélica e Frequência Populacional',
    description: 'Acreditar que um alelo dominante (A) é obrigatoriamente mais comum na população ou "mais forte e saudável" que um alelo recessivo (a).',
    cognitiveFlaw: 'Interferência do sentido coloquial da palavra "dominante" (forte, prevalente, vencedor) sobre a relação bioquímica de expressão fenotípica.',
    studentExample: 'O gene dominante sempre vai ser a maioria na população com o passar do tempo.',
    diagnosticItem: 'Polidactilia (dedos a mais) e Doença de Huntington são causadas por alelos dominantes raríssimos na população humana.',
    distractorExamples: [
      'o alelo dominante é sempre mais frequente na espécie',
      'alelos recessivos tendem a desaparecer naturalmente da população',
      'dominância significa vigor físico superior do indivíduo'
    ],
    matchKeywords: ['dominante é o mais comum', 'recessivo vai sumir', 'dominante é mais forte'],
    remediationAdvice: 'Dominância genética refere-se apenas à expressão fenotípica no heterozigoto (Aa). A frequência de um alelo em uma população depende da seleção natural e da deriva genética, e não de ele ser dominante ou recessivo.',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'BIO-MIS-07',
    code: 'BIO-MIS-07',
    subject: 'biology',
    topic: 'Nutrição Vegetal e Fotossíntese',
    bnccCodes: ['EF07CI07', 'EM13CNT202'],
    name: 'Crença de que a Biomassa Sólida da Planta Vem dos Nutrientes do Solo',
    description: 'Acreditar que as toneladas de madeira do tronco de uma grande árvore foram retiradas diretamente da terra pelas raízes.',
    cognitiveFlaw: 'Obstáculo sensorial: ignorar que o gás incolor e invisível (CO₂ do ar) possui massa real e é a fonte primária de átomos de carbono.',
    studentExample: 'A árvore fica gigante porque chupa muita terra e adubo pelas raízes.',
    diagnosticItem: 'O experimento clássico de Van Helmont (1648) provou que 90 kg de árvore cresceram consumindo apenas alguns gramas de solo: a biomassa vem do carbono do CO₂ atmosférico.',
    distractorExamples: [
      'a massa da madeira da árvore é extraída do solo pelas raízes',
      'as plantas se alimentam da terra como os animais',
      'o solo diminui de volume proporcionalmente ao crescimento do tronco'
    ],
    matchKeywords: ['madeira vem do solo', 'árvore come a terra', 'massa da planta vem do chão'],
    remediationAdvice: 'A maior parte da biomassa sólida das plantas (celulose, lignina, açúcares) é construída a partir do gás carbônico (CO₂) absorvido da atmosfera durante a fotossíntese. As raízes absorvem água e minerais traço essenciais.',
    source: 'Van Helmont (1648); Driver et al. (1994)',
    provenance: 'LITERATURA-CONFERIR'
  },
  {
    id: 'BIO-MIS-08',
    code: 'BIO-MIS-08',
    subject: 'biology',
    topic: 'Natureza da Ciência e Evolução',
    bnccCodes: ['EM13CNT301'],
    name: 'Desqualificação de Teoria Científica como "Apenas um Palpite"',
    description: 'Afirmar que a Teoria da Evolução ou da Relatividade não é comprovada porque "é apenas uma teoria e não uma lei ou fato".',
    cognitiveFlaw: 'Confusão do vocabulário leigo ("eu tenho uma teoria sobre isso") com a epistemologia formal da ciência.',
    studentExample: 'A evolução é só uma teoria, ninguém provou ainda.',
    diagnosticItem: 'Diferencie Teoria Científica (corpo explicativo robusto e testado por milhares de evidências) de hipótese e lei.',
    distractorExamples: [
      'a evolução é apenas uma teoria não comprovada',
      'uma teoria se transforma em lei quando for provada definitivamente',
      'teorias científicas são meras opiniões de cientistas'
    ],
    matchKeywords: ['só uma teoria', 'apenas uma teoria', 'não foi provada ainda'],
    remediationAdvice: 'Na ciência, uma Teoria é o nível mais elevado de explicação: um sistema amplamente sustentado por milhares de evidências empíricas e fatos observáveis (ex: Teoria Celular, Teoria da Gravitação, Teoria da Evolução). Teorias explicam leis, não viram leis.',
    source: 'National Academy of Sciences; Mayr, E.',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'BIO-MIS-09',
    code: 'BIO-MIS-09',
    subject: 'biology',
    topic: 'Genética e Comportamento',
    bnccCodes: ['EF09CI09', 'EM13CNT205'],
    name: 'Determinismo Genético Estrito (Invisibilização da Interação com o Ambiente)',
    description: 'Acreditar que existe "o gene do crime", "o gene da inteligência" e que o DNA determina inexoravelmente todo o destino e comportamento do indivíduo.',
    cognitiveFlaw: 'Reducionismo biológico essencialista que apaga a epigenética, a plasticidade cerebral e os determinantes socioeconômicos.',
    studentExample: 'Se está no DNA da pessoa, ela obrigatoriamente vai desenvolver o comportamento sem importar a vida que levar.',
    diagnosticItem: 'Gêmeos univitelinos (100% mesmo DNA) criados em contextos diferentes desenvolvem personalidades, hábitos e doenças distintas.',
    distractorExamples: [
      'as características complexas são determinadas 100% pelos genes sem influência ambiental',
      'o DNA é o único responsável pelas habilidades cognitivas humanas',
      'a epigenética não altera a expressão gênica'
    ],
    matchKeywords: ['determinismo genético', 'gene do crime', 'DNA determina tudo'],
    remediationAdvice: 'O fenótipo é o resultado da interação complexa entre o genótipo e o ambiente (Fenótipo = Genótipo + Ambiente + Epigenética). Características comportamentais e cognitivas são multifatoriais e influenciadas pela cultura e vivências.',
    source: 'Lewontin, R. Not in Our Genes; BNCC EM13CNT205',
    provenance: 'SINTESE-TA'
  },
  {
    id: 'BIO-MIS-10',
    code: 'BIO-MIS-10',
    subject: 'biology',
    topic: 'Fisiologia e Bioenergética',
    bnccCodes: ['EF06CI07', 'EM13CNT202'],
    name: 'Respiração Pulmonar Confundida com Respiração Celular Mitocondrial',
    description: 'Acreditar que respirar é apenas o movimento mecânico dos pulmões de inspirar ar e expirar ar pelo peito.',
    cognitiveFlaw: 'Redução do processo bioquímico de produção de ATP nos tecidos celulares à ventilação mecânica pulmonar macroscópica.',
    studentExample: 'A respiração acontece apenas no pulmão e serve só para encher o peito de ar.',
    diagnosticItem: 'Por que uma célula da ponta do pé precisa de oxigênio? (Para oxidar a glicose nas mitocôndrias e produzir energia ATP).',
    distractorExamples: [
      'a respiração é apenas o movimento pulmonar do peito',
      'as células não respiram individualmente',
      'o oxigênio para no pulmão e não vai para os tecidos'
    ],
    matchKeywords: ['respiração é só no pulmão', 'respiração celular é o pulmão'],
    remediationAdvice: 'A ventilação pulmonar é apenas a troca gasosa com o ar. A verdadeira RESPIRAÇÃO é a Respiração Celular, que ocorre dentro das mitocôndrias de cada uma das células do corpo para produzir energia química (ATP).',
    source: 'Síntese pedagógica Teacher AI',
    provenance: 'SINTESE-TA'
  }
]

// ─── Cache LRU para Matching Rápido de Distratores ────────────────────────────

const MISCONCEPTION_MATCH_CACHE = new Map<string, MisconceptionEntry | null>()
const MAX_MISCONCEPTION_CACHE_SIZE = 1500

const NORMALIZED_CATALOG_EXAMPLES = new Map<string, string[]>()
MISCONCEPTION_CATALOG.forEach(m => {
  const cleaned = (m.distractorExamples || []).map(ex =>
    ex.toLowerCase().replace(/[^a-z0-9\s]/gi, '').trim()
  )
  NORMALIZED_CATALOG_EXAMPLES.set(m.id, cleaned)
})

/**
 * Busca e valida se um distrator (alternativa incorreta) corresponde a uma misconception catalogada.
 */
export function matchDistractorToCatalog(
  optionText: string,
  subject?: string,
  topic?: string
): MisconceptionEntry | null {
  const cleanOption = (optionText || '').trim().toLowerCase()
  if (!cleanOption) return null

  const cacheKey = `${subject || 'all'}:${cleanOption}`
  if (MISCONCEPTION_MATCH_CACHE.has(cacheKey)) {
    return MISCONCEPTION_MATCH_CACHE.get(cacheKey)!
  }

  const sLower = (subject || '').toLowerCase()
  const candidates = subject
    ? MISCONCEPTION_CATALOG.filter(m => m.subject === sLower || sLower.includes(m.subject) || m.subject.includes(sLower))
    : MISCONCEPTION_CATALOG

  let result: MisconceptionEntry | null = null

  for (const mis of candidates) {
    if (mis.matchRegex && mis.matchRegex.test(cleanOption)) {
      result = mis
      break
    }
    const matchedKey = mis.matchKeywords.some(kw => cleanOption.includes(kw.toLowerCase()))
    if (matchedKey) {
      result = mis
      break
    }
    const preCleaned = NORMALIZED_CATALOG_EXAMPLES.get(mis.id) || []
    const matchedEx = preCleaned.some(cleanEx => {
      return cleanOption.includes(cleanEx) || cleanEx.includes(cleanOption)
    })
    if (matchedEx) {
      result = mis
      break
    }
  }

  if (MISCONCEPTION_MATCH_CACHE.size >= MAX_MISCONCEPTION_CACHE_SIZE) {
    MISCONCEPTION_MATCH_CACHE.clear()
  }
  MISCONCEPTION_MATCH_CACHE.set(cacheKey, result)
  return result
}

/**
 * Retorna todas as concepções alternativas de uma disciplina.
 */
export function getMisconceptionsBySubject(subject: string): MisconceptionEntry[] {
  const sLower = (subject || '').toLowerCase().trim()
  return MISCONCEPTION_CATALOG.filter(
    m => m.subject === sLower || sLower.includes(m.subject) || m.subject.includes(sLower)
  )
}

/**
 * Mede a cobertura, precisão, recall e F1 da detecção de concepções alternativas
 * contra uma amostra de texto rotulada por professores (Seção 7 e 17 do Parecer).
 */
export function evaluateMisconceptionDetectionMetrics(labeledSamples: Array<{
  text: string
  expectedMisconceptionId: string | null
  subject: string
}>): {
  totalSamples: number
  truePositives: number
  falsePositives: number
  falseNegatives: number
  trueNegatives: number
  precision: number
  recall: number
  f1Score: number
} {
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0

  for (const sample of labeledSamples) {
    const detected = matchDistractorToCatalog(sample.text, sample.subject)
    const detectedId = detected ? detected.id : null

    if (sample.expectedMisconceptionId) {
      if (detectedId === sample.expectedMisconceptionId) {
        tp++
      } else {
        fn++
      }
    } else {
      if (detectedId) {
        fp++
      } else {
        tn++
      }
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1.0
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  return {
    totalSamples: labeledSamples.length,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    trueNegatives: tn,
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    f1Score: Math.round(f1Score * 100) / 100
  }
}
