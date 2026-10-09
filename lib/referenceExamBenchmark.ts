/**
 * lib/referenceExamBenchmark.ts — Benchmark Fixo de Provas de Referência e Taxa de Aceite Sem Edição (Lote D3)
 *
 * Provê uma bateria canônica de 10 provas estruturadas em múltiplos domínios (BNCC/Bloom),
 * avaliando cada questão contra os 4 portões bloqueantes (G1 Estrutura, G2 Haladyna, G3 Distratores, G4 Idioma)
 * para apurar honestamente a métrica `unmodifiedAcceptanceRate` (taxa de questões prontas para uso sem edição).
 */

import { Question, QuestionInput } from './examSchema';
import {
  evaluateGateG1,
  evaluateGateG2,
  evaluateGateG3,
  evaluateGateG4,
  EvaluateExamGatesOptions,
} from './examGates';

export interface ReferenceExam {
  id: string;
  title: string;
  subject: string;
  gradeLevel: string;
  language?: 'pt' | 'en';
  questions: (Question | QuestionInput)[];
}

export interface BenchmarkExamReport {
  examId: string;
  title: string;
  subject: string;
  gradeLevel: string;
  totalQuestions: number;
  acceptedQuestions: number;
  acceptanceRate: number;
  gatesPassed: { G1: boolean; G2: boolean; G3: boolean; G4: boolean };
  issues: string[];
}

export interface BenchmarkResult {
  totalExams: number;
  totalQuestions: number;
  unmodifiedAcceptedQuestions: number;
  unmodifiedAcceptanceRate: number;
  rejectionBreakdown: {
    gate1Structure: number;
    gate2Haladyna: number;
    gate3Distractors: number;
    gate4Language: number;
  };
  detailsPerSubject: Record<
    string,
    {
      total: number;
      accepted: number;
      rate: number;
    }
  >;
  examReports: BenchmarkExamReport[];
}

// ─── Bateria Fixo-Canônica de 10 Provas de Referência ─────────────────────────

export const REFERENCE_EXAM_BATTERY: ReferenceExam[] = [
  // 1. Ciências — 7º Ano (BNCC EF07CI07)
  {
    id: 'REF-CIEN-01',
    title: 'Ecossistemas, Cadeias Tróficas e Relações Ecológicas',
    subject: 'Ciências',
    gradeLevel: 'EF II 7º ano',
    language: 'pt',
    questions: [
      {
        id: 'q-cien-01',
        stem: 'Em um ecossistema terrestre equilibrado, qual é o papel primário desempenhado pelos organismos decompositores?',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Produzir matéria orgânica a partir de energia solar e água.' },
          { id: 'B', letter: 'B', text: 'Reciclar nutrientes minerais degradando restos biológicos.' },
          { id: 'C', letter: 'C', text: 'Capturar presas herbívoras para controlar o crescimento populacional.' },
          { id: 'D', letter: 'D', text: 'Oxigenar a atmosfera por meio da transpiração noturna.' },
        ],
        correctOptionId: 'B',
        answerKey: 'B',
        explanation: 'Os decompositores transformam matéria orgânica em inorgânica, fechando o ciclo biogeoquímico.',
        subject: 'Ciências',
        topic: 'Ecologia',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-cien-02',
        stem: 'A introdução de uma espécie exótica em um hábitat pode gerar impactos severos porque:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Pode competir por recursos vitais sem a presença de predadores naturais locais.' },
          { id: 'B', letter: 'B', text: 'Diminui instantaneamente o pH do solo em todas as regiões adjacentes.' },
          { id: 'C', letter: 'C', text: 'Altera o regime pluviométrico continental devido à absorção radicular.' },
          { id: 'D', letter: 'D', text: 'Impede o processo de fotossíntese de todas as árvores nativas da floresta.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'A ausência de inimigos naturais permite proliferação rápida e desequilíbrio trófico.',
        subject: 'Ciências',
        topic: 'Biodiversidade',
        bloomTaxonomy: 'Análise',
        canAutoSave: true,
      },
      {
        id: 'q-cien-03',
        stem: 'Qual dos seguintes biomas brasileiros caracteriza-se pelo clima semiárido e vegetação adaptada à escassez hídrica (xerófila)?',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Floresta Amazônica' },
          { id: 'B', letter: 'B', text: 'Mata Atlântica' },
          { id: 'C', letter: 'C', text: 'Caatinga' },
          { id: 'D', letter: 'D', text: 'Pantanal' },
        ],
        correctOptionId: 'C',
        answerKey: 'C',
        explanation: 'A Caatinga apresenta vegetação caducifólia e xerófita adaptada a longos períodos sem chuva.',
        subject: 'Ciências',
        topic: 'Biomas',
        bloomTaxonomy: 'Conhecimento',
        canAutoSave: true,
      },
      {
        id: 'q-cien-04',
        stem: 'O fluxo de energia em uma teia alimentar é considerado unidirecional porque:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Apenas os carnívoros conseguem absorver energia de outros seres.' },
          { id: 'B', letter: 'B', text: 'Parte substancial da energia é dissipada como calor em cada nível trófico.' },
          { id: 'C', letter: 'C', text: 'A energia solar é reutilizada ciclicamente pelos animais carnívoros.' },
          { id: 'D', letter: 'D', text: 'Os decompositores retornam a energia calórica para os produtores.' },
        ],
        correctOptionId: 'B',
        answerKey: 'B',
        explanation: 'A segunda lei da termodinâmica implica que a energia útil diminui ao longo dos níveis tróficos.',
        subject: 'Ciências',
        topic: 'Bioenergética',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
    ],
  },

  // 2. Matemática — 8º Ano (BNCC EF08MA06)
  {
    id: 'REF-MAT-02',
    title: 'Equações de 1º Grau, Geometria e Proporções',
    subject: 'Matemática',
    gradeLevel: 'EF II 8º ano',
    language: 'pt',
    questions: [
      {
        id: 'q-mat-01',
        stem: 'Um comerciante aumentou o preço de um artigo em 20%. Posteriormente, aplicou um desconto de 20% sobre o novo valor. Em relação ao preço original, o valor final:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Permaneceu exatamente idêntico ao original.' },
          { id: 'B', letter: 'B', text: 'Sofreu redução líquida de 4% sobre o valor inicial.' },
          { id: 'C', letter: 'C', text: 'Ficou 2% mais caro devido ao aumento prévio.' },
          { id: 'D', letter: 'D', text: 'Apresentou queda expressiva de 10% no montante.' },
        ],
        correctOptionId: 'B',
        answerKey: 'B',
        explanation: '1.20 * 0.80 = 0.96, portanto 4% menor.',
        subject: 'Matemática',
        topic: 'Porcentagem',
        bloomTaxonomy: 'Aplicação',
        canAutoSave: true,
      },
      {
        id: 'q-mat-02',
        stem: 'A solução da equação linear 3x - 7 = 2(x + 4) no conjunto dos números reais é:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'x = 15' },
          { id: 'B', letter: 'B', text: 'x = 1' },
          { id: 'C', letter: 'C', text: 'x = 22' },
          { id: 'D', letter: 'D', text: 'x = -8' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: '3x - 7 = 2x + 8 -> 3x - 2x = 8 + 7 -> x = 15.',
        subject: 'Matemática',
        topic: 'Álgebra',
        bloomTaxonomy: 'Aplicação',
        canAutoSave: true,
      },
      {
        id: 'q-mat-03',
        stem: 'A soma das medidas dos ângulos internos de um hexágono convexo regular é igual a:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: '360 graus' },
          { id: 'B', letter: 'B', text: '540 graus' },
          { id: 'C', letter: 'C', text: '720 graus' },
          { id: 'D', letter: 'D', text: '900 graus' },
        ],
        correctOptionId: 'C',
        answerKey: 'C',
        explanation: 'S = (n - 2) * 180 = (6 - 2) * 180 = 4 * 180 = 720 graus.',
        subject: 'Matemática',
        topic: 'Geometria',
        bloomTaxonomy: 'Aplicação',
        canAutoSave: true,
      },
      {
        id: 'q-mat-04',
        stem: 'Dois triângulos semelhantes possuem razão de semelhança linear k = 3. A razão entre suas respectivas áreas superficiais é:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: '3 vezes maior' },
          { id: 'B', letter: 'B', text: '6 vezes maior' },
          { id: 'C', letter: 'C', text: '9 vezes maior' },
          { id: 'D', letter: 'D', text: '27 vezes maior' },
        ],
        correctOptionId: 'C',
        answerKey: 'C',
        explanation: 'A razão entre áreas de figuras semelhantes é proporcional ao quadrado da razão linear: k^2 = 3^2 = 9.',
        subject: 'Matemática',
        topic: 'Geometria',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
    ],
  },

  // 3. História — 9º Ano (BNCC EF09HI02)
  {
    id: 'REF-HIST-03',
    title: 'A Primeira República e as Transformações Urbanas no Brasil',
    subject: 'História',
    gradeLevel: 'EF II 9º ano',
    language: 'pt',
    questions: [
      {
        id: 'q-hist-01',
        stem: 'A chamada "Política dos Governadores", consolidada no governo Campos Sales, tinha como principal engrenagem política:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'A aliança de apoio recíproco entre o governo federal e as oligarquias estaduais dominantes.' },
          { id: 'B', letter: 'B', text: 'A convocação contínua de plebiscitos populares para a aprovação de orçamentos municipais.' },
          { id: 'C', letter: 'C', text: 'A descentralização militar em favor de comitês sindicais operários do Sudeste.' },
          { id: 'D', letter: 'D', text: 'A extinção imediata do voto censitário e a instituição da urna eletrônica federal.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Campos Sales estruturou o arranjo onde o presidente garantia apoio aos grupos dominantes estaduais em troca de fidelidade parlamentar.',
        subject: 'História',
        topic: 'República Velha',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-hist-02',
        stem: 'A Revolta da Vacina, ocorrida no Rio de Janeiro em 1904, associou a imposição sanitária da vacinação obrigatória a:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Reformas urbanas autoritárias que desalojaram populações pobres do centro da cidade.' },
          { id: 'B', letter: 'B', text: 'Exigências de adesão compulsória à Igreja Positivista no serviço público.' },
          { id: 'C', letter: 'C', text: 'Conflitos armados deflagrados pela imigração japonesa na cafeicultura fluminense.' },
          { id: 'D', letter: 'D', text: 'Disputas territoriais com países vizinhos decorrentes do Tratado de Petrópolis.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'O "Bota-Abaixo" de Pereira Passos gerou profunda insatisfação popular que culminou na Revolta.',
        subject: 'História',
        topic: 'Movimentos Sociais',
        bloomTaxonomy: 'Análise',
        canAutoSave: true,
      },
      {
        id: 'q-hist-03',
        stem: 'O Convênio de Taubaté (1906) representou uma intervenção estatal no setor agrícola com o objetivo de:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Valorizar os preços do café mediante a compra e retenção governamental de excedentes da colheita.' },
          { id: 'B', letter: 'B', text: 'Estimular a produção de cana-de-açúcar para substituir o café no mercado mundial.' },
          { id: 'C', letter: 'C', text: 'Distribuir terras públicas aos imigrantes europeus recém-chegados aos portos.' },
          { id: 'D', letter: 'D', text: 'Confiscar as receitas das grandes fazendas cafeeiras para financiar a ferrovia.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'O Estado contraía empréstimos externos para estocar sacas de café e sustentar as cotações internacionais.',
        subject: 'História',
        topic: 'Economia Cafeeira',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-hist-04',
        stem: 'O Tenentismo na década de 1920 expressou o descontentamento de jovens oficiais militares com:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'A corrupção eleitoral oligárquica e a falta de moralização institucional da República.' },
          { id: 'B', letter: 'B', text: 'O processo de industrialização acelerado imposto pelas greves operárias anarquistas.' },
          { id: 'C', letter: 'C', text: 'A manutenção da monarquia parlamentarista nos estados do Centro-Oeste.' },
          { id: 'D', letter: 'D', text: 'O alinhamento geopolítico automático do Brasil com a União Soviética no pós-guerra.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Os tenentes defendiam o voto secreto, o ensino obrigatório e o combate ao coronelismo.',
        subject: 'História',
        topic: 'Crise dos Anos 20',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
    ],
  },

  // 4. Geografia — 6º Ano (BNCC EF06GE03)
  {
    id: 'REF-GEO-04',
    title: 'Orientação Espacial, Cartografia e Climatologia',
    subject: 'Geografia',
    gradeLevel: 'EF II 6º ano',
    language: 'pt',
    questions: [
      {
        id: 'q-geo-01',
        stem: 'A escala cartográfica que indica que 1 centímetro no mapa corresponde a 50 quilômetros no terreno real é representada numericamente por:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: '1 : 50.000 (escala cadastral de grande detalhe)' },
          { id: 'B', letter: 'B', text: '1 : 500.000 (escala topográfica regional)' },
          { id: 'C', letter: 'C', text: '1 : 5.000.000 (escala geográfica de síntese)' },
          { id: 'D', letter: 'D', text: '1 : 50.000.000 (escala planisférica global)' },
        ],
        correctOptionId: 'C',
        answerKey: 'C',
        explanation: '50 km = 50.000 metros = 5.000.000 centímetros. Logo, escala 1 : 5.000.000.',
        subject: 'Geografia',
        topic: 'Cartografia',
        bloomTaxonomy: 'Aplicação',
        canAutoSave: true,
      },
      {
        id: 'q-geo-02',
        stem: 'O movimento de translação da Terra, combinado com a inclinação do seu eixo de rotação, é o responsável direto por:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'A sucessão diária entre os períodos diurno e noturno no equador.' },
          { id: 'B', letter: 'B', text: 'A ocorrência alternada das quatro estações do ano ao longo dos meses.' },
          { id: 'C', letter: 'C', text: 'O deslocamento contínuo das placas tectônicas na crosta terrestre.' },
          { id: 'D', letter: 'D', text: 'A variação horária regular provocada pela divisão em fusos horários.' },
        ],
        correctOptionId: 'B',
        answerKey: 'B',
        explanation: 'A inclinação axial e o movimento orbital provocam variação na incidência dos raios solares durante o ano.',
        subject: 'Geografia',
        topic: 'Dinâmica Terrestre',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-geo-03',
        stem: 'À medida que a altitude de uma localidade aumenta, a temperatura média do ar tende a diminuir devido à:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Menor densidade do ar e redução da retenção de calor por irradiação.' },
          { id: 'B', letter: 'B', text: 'Maior proximidade com a camada de ozônio presente na troposfera superior.' },
          { id: 'C', letter: 'C', text: 'Ausência total de ventos horizontais nas cordilheiras de montanha.' },
          { id: 'D', letter: 'D', text: 'Inversão magnética natural provocada pela pressão barométrica alta.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'O ar rarefeito em altas altitudes retém menos calor irradiado pela superfície terrestre.',
        subject: 'Geografia',
        topic: 'Climatologia',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-geo-04',
        stem: 'As coordenadas geográficas constituem um sistema de localização na superfície do planeta determinado por:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Latitude e longitude, expressas em medidas angulares de graus.' },
          { id: 'B', letter: 'B', text: 'Altímetro e barômetro, calculados em unidades métricas decimais.' },
          { id: 'C', letter: 'C', text: 'Fusos horários e curvas de nível baseadas no Meridiano de Brasília.' },
          { id: 'D', letter: 'D', text: 'Escala gráfica e projeção cilíndrica de Mercator com distorção polar.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Latitudes (distância do Equador) e longitudes (distância de Greenwich) definem qualquer ponto terrestre.',
        subject: 'Geografia',
        topic: 'Cartografia',
        bloomTaxonomy: 'Conhecimento',
        canAutoSave: true,
      },
    ],
  },

  // 5. Língua Inglesa — 8º Ano (CEFR A2 / BNCC EF08LI05)
  {
    id: 'REF-ING-05',
    title: 'Reading Comprehension and Everyday Communication',
    subject: 'Língua Inglesa',
    gradeLevel: 'EF II 8º ano',
    language: 'en',
    questions: [
      {
        id: 'q-ing-01',
        stem: 'Read the sentence: "Although she was exhausted after soccer practice, Sarah finished all her science assignments." What does this statement show about Sarah?',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'She decided to play soccer instead of doing her school tasks.' },
          { id: 'B', letter: 'B', text: 'She was committed and completed her homework despite being tired.' },
          { id: 'C', letter: 'C', text: 'She refused to attend practice because the homework was too hard.' },
          { id: 'D', letter: 'D', text: 'She asked her coach to complete the science project for her.' },
        ],
        correctOptionId: 'B',
        answerKey: 'B',
        explanation: 'The connector "although" indicates contrast between tiredness and task completion.',
        subject: 'Língua Inglesa',
        topic: 'Reading Comprehension',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-ing-02',
        stem: 'Choose the correct form to complete: "If we _____ plastic waste responsibly, we will protect marine biodiversity."',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'recycle' },
          { id: 'B', letter: 'B', text: 'are sorting' },
          { id: 'C', letter: 'C', text: 'will throw' },
          { id: 'D', letter: 'D', text: 'had burned' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'First conditional uses Simple Present in the if-clause and will + infinitive in the main clause.',
        subject: 'Língua Inglesa',
        topic: 'Conditionals',
        bloomTaxonomy: 'Aplicação',
        canAutoSave: true,
      },
      {
        id: 'q-ing-03',
        stem: 'Which word is the most appropriate antonym for "ancient" in the context of architecture?',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Traditional' },
          { id: 'B', letter: 'B', text: 'Historic' },
          { id: 'C', letter: 'C', text: 'Modern' },
          { id: 'D', letter: 'D', text: 'Distant' },
        ],
        correctOptionId: 'C',
        answerKey: 'C',
        explanation: '"Modern" directly contrasts with "ancient".',
        subject: 'Língua Inglesa',
        topic: 'Vocabulary',
        bloomTaxonomy: 'Conhecimento',
        canAutoSave: true,
      },
      {
        id: 'q-ing-04',
        stem: 'Read the short message: "Hi David, I won\'t make it to tonight\'s study group because my flight was delayed. See you tomorrow!" Why did the sender miss the meeting?',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Because their airplane departure was postponed.' },
          { id: 'B', letter: 'B', text: 'Because they forgot the location of the library.' },
          { id: 'C', letter: 'C', text: 'Because David cancelled the study group yesterday.' },
          { id: 'D', letter: 'D', text: 'Because they chose to watch a movie at home.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: '"Flight was delayed" means transportation schedule was postponed.',
        subject: 'Língua Inglesa',
        topic: 'Reading Comprehension',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
    ],
  },

  // 6. Língua Portuguesa — 1º Ano EM (BNCC EM13LP01)
  {
    id: 'REF-PORT-06',
    title: 'Linguagem Figurada, Coesão e Recursos Estilísticos',
    subject: 'Língua Portuguesa',
    gradeLevel: 'EM 1º ano',
    language: 'pt',
    questions: [
      {
        id: 'q-port-01',
        stem: 'No verso "O vento sussurrava segredos pelas frestas da janela antiga", o recurso expressivo predominante é a:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Prosopopeia ou personificação de elementos inanimados da natureza.' },
          { id: 'B', letter: 'B', text: 'Hipérbole caracterizada pelo exagero descritivo da tempestade.' },
          { id: 'C', letter: 'C', text: 'Antítese que opõe termos semanticamente contraditórios e hostis.' },
          { id: 'D', letter: 'D', text: 'Elipse provocada pela supressão gramatical voluntária de conectivos.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Atribuir ações humanas ("sussurrar segredos") a elementos inanimados ("o vento") configura personificação.',
        subject: 'Língua Portuguesa',
        topic: 'Figuras de Linguagem',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-port-02',
        stem: 'Em um texto dissertativo-argumentativo, o conector conjuntivo "conquanto" possui valor semântico de:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Concessão, introduzindo ressalva sem anular a tese principal.' },
          { id: 'B', letter: 'B', text: 'Causa, apontando o motivo factual determinante do fato.' },
          { id: 'C', letter: 'C', text: 'Conclusão, sintetizando as evidências expostas no parágrafo.' },
          { id: 'D', letter: 'D', text: 'Tempo, marcando a contemporaneidade cronológica dos eventos.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: '"Conquanto" é uma conjunção subordinativa concessiva (equivalente a "embora", "ainda que").',
        subject: 'Língua Portuguesa',
        topic: 'Coesão Sequencial',
        bloomTaxonomy: 'Conhecimento',
        canAutoSave: true,
      },
      {
        id: 'q-port-03',
        stem: 'Identifique a frase em que o emprego da regência verbal do verbo "assistir" com sentido de presenciar/ver está correto segundo a norma culta:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Os alunos assistiram ao documentário com atenção crítica.' },
          { id: 'B', letter: 'B', text: 'O médico assistiu o paciente acidentado com extrema presteza.' },
          { id: 'C', letter: 'C', text: 'Esse direito assiste com os cidadãos que cumprem o dever fiscal.' },
          { id: 'D', letter: 'D', text: 'A família assiste em Brasília desde a fundação da nova capital.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'O verbo assistir no sentido de ver é transitivo indireto e exige a preposição "a" (assistir a algo).',
        subject: 'Língua Portuguesa',
        topic: 'Sintaxe e Regência',
        bloomTaxonomy: 'Aplicação',
        canAutoSave: true,
      },
      {
        id: 'q-port-04',
        stem: 'A ambiguidade estrutural provocada por má colocação de adjuntos adverbiais pode ser prevenida mediante:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Pontuação criteriosa e reposicionamento do termo próximo ao núcleo modificado.' },
          { id: 'B', letter: 'B', text: 'Substituição de todas as formas verbais ativas pela voz passiva analítica.' },
          { id: 'C', letter: 'C', text: 'Eliminação compulsória de pronomes relativos em orações adjetivas explicativas.' },
          { id: 'D', letter: 'D', text: 'Uso generalizado de parônimos em substituição a termos unívocos eruditos.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'A clareza sintática depende do correto posicionamento e isolamento por vírgulas de termos modificadores.',
        subject: 'Língua Portuguesa',
        topic: 'Semântica e Estilo',
        bloomTaxonomy: 'Análise',
        canAutoSave: true,
      },
    ],
  },

  // 7. Física — 2º Ano EM (BNCC EM13CNT102)
  {
    id: 'REF-FIS-07',
    title: 'Termodinâmica, Calorimetria e Conservação de Energia',
    subject: 'Física',
    gradeLevel: 'EM 2º ano',
    language: 'pt',
    questions: [
      {
        id: 'q-fis-01',
        stem: 'A primeira lei da termodinâmica afirma que a variação da energia interna de um sistema gasoso ideal decorre de:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'A diferença entre o calor trocado com o meio e o trabalho realizado.' },
          { id: 'B', letter: 'B', text: 'A destruição espontânea de entropia durante expansões adiabáticas livres.' },
          { id: 'C', letter: 'C', text: 'O acréscimo de massa atômica resultante de colisões perfeitamente inelásticas.' },
          { id: 'D', letter: 'D', text: 'A transferência de campos magnéticos permanentes entre dois condutores térmicos.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Delta U = Q - W expressa a conservação da energia para sistemas termodinâmicos.',
        subject: 'Física',
        topic: 'Termodinâmica',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-fis-02',
        stem: 'Em uma transformação isovolumétrica (isocórica) de um gás ideal, o trabalho mecânico realizado pelo sistema é:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Nulo, pois o volume do recipiente não sofreu variação espacial.' },
          { id: 'B', letter: 'B', text: 'Positivo e igual ao produto da pressão pela temperatura absoluta.' },
          { id: 'C', letter: 'C', text: 'Negativo e determinado pela capacidade térmica do êmbolo.' },
          { id: 'D', letter: 'D', text: 'Infinito devido ao acréscimo exponencial de pressão nas paredes.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'W = P * Delta V. Se Delta V = 0, W = 0.',
        subject: 'Física',
        topic: 'Transformações Gasosas',
        bloomTaxonomy: 'Aplicação',
        canAutoSave: true,
      },
      {
        id: 'q-fis-03',
        stem: 'Dois corpos sólidos A e B de massas iguais recebem a mesma quantidade de calor. Se o calor específico de A é o dobro do de B:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'A variação de temperatura de A será a metade da de B.' },
          { id: 'B', letter: 'B', text: 'A variação de temperatura de A será o dobro da de B.' },
          { id: 'C', letter: 'C', text: 'Ambos sofrerão idêntica elevação na escala termométrica.' },
          { id: 'D', letter: 'D', text: 'O corpo B necessariamente mudará de estado físico primeiro.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Delta T = Q / (m * c). Sendo c_A = 2 * c_B, Delta T_A = Delta T_B / 2.',
        subject: 'Física',
        topic: 'Calorimetria',
        bloomTaxonomy: 'Análise',
        canAutoSave: true,
      },
      {
        id: 'q-fis-04',
        stem: 'A impossibilidade prática de construir uma máquina térmica que converta integralmente calor em trabalho útil deriva da:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Segunda lei da termodinâmica (enunciado de Kelvin-Planck).' },
          { id: 'B', letter: 'B', text: 'Lei de conservação da quantidade de movimento linear em colisões.' },
          { id: 'C', letter: 'C', text: 'Terceira lei de Newton aplicada a fluídos sob compressão estática.' },
          { id: 'D', letter: 'D', text: 'Equação de Torricelli para escoamentos laminares incompressíveis.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Nenhuma máquina cíclica pode retirar calor de uma fonte térmica e transformá-lo integralmente em trabalho mecânico.',
        subject: 'Física',
        topic: 'Máquinas Térmicas',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
    ],
  },

  // 8. Química — 1º Ano EM (BNCC EM13CNT201)
  {
    id: 'REF-QUIM-08',
    title: 'Modelos Atômicos, Tabela Periódica e Ligações Químicas',
    subject: 'Química',
    gradeLevel: 'EM 1º ano',
    language: 'pt',
    questions: [
      {
        id: 'q-quim-01',
        stem: 'O modelo atômico de Rutherford foi fundamental para demonstrar experimentalmente que:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'O átomo possui um núcleo denso e positivo cercado por imensos espaços vazios.' },
          { id: 'B', letter: 'B', text: 'A massa do átomo é uma esfera homogênea maciça com elétrons incrustados.' },
          { id: 'C', letter: 'C', text: 'Os elétrons orbitam em níveis de energia quantizados sem irradiar ondas.' },
          { id: 'D', letter: 'D', text: 'A matéria atômica é contínua e indivisível como postulava a teoria grega.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'O experimento da lâmina de ouro evidenciou o núcleo concentrado e a eletrosfera rarefeita.',
        subject: 'Química',
        topic: 'Atomística',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-quim-02',
        stem: 'Na tabela periódica dos elementos químicos, o raio atômico tende a crescer ao longo de:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Famílias (de cima para baixo) e períodos (da direita para a esquerda).' },
          { id: 'B', letter: 'B', text: 'Sentido ascendente das colunas em direção ao elemento hélio.' },
          { id: 'C', letter: 'C', text: 'Eixo diagonal direto apontando para os ametais mais eletronegativos.' },
          { id: 'D', letter: 'D', text: 'Alinhamento horizontal contínuo rumo aos gases nobres mais pesados.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Mais camadas eletrônicas aumentam o raio descendo na coluna; menor carga nuclear efetiva aumenta o raio para a esquerda.',
        subject: 'Química',
        topic: 'Propriedades Periódicas',
        bloomTaxonomy: 'Conhecimento',
        canAutoSave: true,
      },
      {
        id: 'q-quim-03',
        stem: 'A ligação química iônica entre o sódio (Na) e o cloro (Cl) forma o cloreto de sódio (NaCl) através de:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Transferência de elétron do metal para o ametal, gerando atração eletrostática.' },
          { id: 'B', letter: 'B', text: 'Compartilhamento equitativo de pares de elétrons em orbitais moleculares.' },
          { id: 'C', letter: 'C', text: 'Superposição de nuvens eletrônicas livres formando um mar de elétrons metálico.' },
          { id: 'D', letter: 'D', text: 'Interações intermoleculares fracas do tipo dipolo induzido de London.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'O sódio doa um elétron (Na+) e o cloro recebe (Cl-), formando retículo cristalino iônico.',
        subject: 'Química',
        topic: 'Ligações Químicas',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-quim-04',
        stem: 'A geometria molecular da água (H2O) é classificada como angular em virtude de:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Dois pares de elétrons não ligantes que repelem as ligações de hidrogênio.' },
          { id: 'B', letter: 'B', text: 'Hibridização sp linear que anula o momento dipolar permanente da molécula.' },
          { id: 'C', letter: 'C', text: 'Distribuição trigonal plana simétrica com três ligantes periféricos idênticos.' },
          { id: 'D', letter: 'D', text: 'Atração magnética intra-atômica gerada pelo nêutron central do oxigênio.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Os pares isolados do oxigênio exercem repulsão eletrônica, reduzindo o ângulo para aprox. 104,5 graus.',
        subject: 'Química',
        topic: 'Geometria Molecular',
        bloomTaxonomy: 'Análise',
        canAutoSave: true,
      },
    ],
  },

  // 9. Filosofia — 3º Ano EM (Com 1 questão de teste de detecção de distratores quase duplicados)
  {
    id: 'REF-FILO-09',
    title: 'Ética, Cidadania e Teoria Política Moderna',
    subject: 'Filosofia',
    gradeLevel: 'EM 3º ano',
    language: 'pt',
    questions: [
      {
        id: 'q-filo-01',
        stem: 'Para Aristóteles na obra Ética a Nicômaco, a virtude moral (areté) é definida essencialmente como:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'O justo meio ou mediania equilibrada entre os excessos e as carências passionais.' },
          { id: 'B', letter: 'B', text: 'A renúncia ascética radical a todo e qualquer prazer físico ou sensorial.' },
          { id: 'C', letter: 'C', text: 'O cumprimento cego de decretos emitidos pela autoridade monárquica divina.' },
          { id: 'D', letter: 'D', text: 'A busca desenfreada pelo acúmulo de propriedades privadas no comércio marítimo.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'A virtude é a mediania (mesotês) entre dois vícios extremos.',
        subject: 'Filosofia',
        topic: 'Ética Clássica',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-filo-02',
        stem: 'No contratualismo de Thomas Hobbes, a passagem do estado de natureza para a sociedade civil é motivada por:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'A necessidade de autopreservação e o medo constante da morte violenta.' },
          { id: 'B', letter: 'B', text: 'A solidariedade espontânea e harmonia inata entre todos os indivíduos livres.' },
          { id: 'C', letter: 'C', text: 'A exigência de regulamentar o sufrágio universal em eleições periódicas.' },
          { id: 'D', letter: 'D', text: 'A obediência religiosa irrestrita aos dogmas da Igreja medieval teocrática.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'O estado de natureza é "guerra de todos contra todos"; os homens renunciam à liberdade em troca da segurança do soberano.',
        subject: 'Filosofia',
        topic: 'Contratualismo',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-filo-03',
        stem: 'O imperativo categórico kantiano propõe uma moralidade baseada em:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Agir unicamente segundo máximas que possam se tornar lei universal da humanidade.' },
          { id: 'B', letter: 'B', text: 'Calcular friamente os benefícios materiais obtidos ao término de cada ação utilitarista.' },
          { id: 'C', letter: 'C', text: 'Seguir o costume tradicional consolidado pela maioria dos cidadãos da polis.' },
          { id: 'D', letter: 'D', text: 'Satisfazer os impulsos emocionais imediatos sem se preocupar com as consequências éticas.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Kant postula o dever deontológico autônomo e universalizável.',
        subject: 'Filosofia',
        topic: 'Ética Kantiana',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      // Questão projetada honestamente com distratores redundantes/quase idênticos para testar o portão G3
      {
        id: 'q-filo-04-flawed-g3',
        stem: 'Segundo o pensamento de Jean-Jacques Rousseau sobre o pacto social, a soberania reside fundamentalmente:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Na vontade geral inalienável do povo que compõe a comunidade política.' },
          { id: 'B', letter: 'B', text: 'No corpo monárquico absolutista que centraliza todos os três poderes.' },
          { id: 'C', letter: 'C', text: 'Nos magistrados togados escolhidos por concurso público vitalício.' },
          { id: 'D', letter: 'D', text: 'Nos magistrados togados escolhidos por concurso publico vitalicio.' }, // Quase duplicata proposital (Jaccard > 0.80)
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Item de auditoria para certificar rejeição honesta por distrator quase duplicata.',
        subject: 'Filosofia',
        topic: 'Contratualismo',
        bloomTaxonomy: 'Análise',
        canAutoSave: true,
      },
    ],
  },

  // 10. Língua Inglesa — 9º Ano (Com 1 questão de teste de detecção de vazamento de idioma para G4)
  {
    id: 'REF-ING-10',
    title: 'Advanced Reading and Discourse Markers',
    subject: 'Língua Inglesa',
    gradeLevel: 'EF II 9º ano',
    language: 'en',
    questions: [
      {
        id: 'q-ing-05',
        stem: 'Read the text: "Renewable energy investments have expanded worldwide. Nevertheless, global reliance on fossil fuels remains significant." The word "Nevertheless" introduces:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'A contrast or counter-argument to the previous statement.' },
          { id: 'B', letter: 'B', text: 'A chronological sequence of industrial development.' },
          { id: 'C', letter: 'C', text: 'An identical repetition of renewable energy benefits.' },
          { id: 'D', letter: 'D', text: 'A casual apology for lack of international funding.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: '"Nevertheless" is an adversative transition showing contrast.',
        subject: 'Língua Inglesa',
        topic: 'Discourse Markers',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      {
        id: 'q-ing-06',
        stem: 'Which sentence correctly demonstrates the present perfect tense used for ongoing actions?',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'They have studied climate patterns for over a decade.' },
          { id: 'B', letter: 'B', text: 'They studied climate patterns yesterday after class.' },
          { id: 'C', letter: 'C', text: 'They will study climate patterns next semester in college.' },
          { id: 'D', letter: 'D', text: 'They had study climate patterns before graduation.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: '"Have studied ... for over a decade" expresses action started in the past continuing to present.',
        subject: 'Língua Inglesa',
        topic: 'Verb Tenses',
        bloomTaxonomy: 'Aplicação',
        canAutoSave: true,
      },
      {
        id: 'q-ing-07',
        stem: 'Select the option that best replaces the underlined idiom in: "Solving this equation is a piece of cake for Daniel."',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Extremely easy and straightforward.' },
          { id: 'B', letter: 'B', text: 'Very delicious to taste at breakfast.' },
          { id: 'C', letter: 'C', text: 'Dangerously hard and time-consuming.' },
          { id: 'D', letter: 'D', text: 'Completely impossible to finish today.' },
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: '"A piece of cake" means very easy.',
        subject: 'Língua Inglesa',
        topic: 'Idiomatic Expressions',
        bloomTaxonomy: 'Compreensão',
        canAutoSave: true,
      },
      // Questão propositalmente com vazamento de português na opção D para testar o portão G4
      {
        id: 'q-ing-08-flawed-g4',
        stem: 'Choose the most appropriate synonym for "comprehensive" in an academic context:',
        type: 'multiple_choice',
        options: [
          { id: 'A', letter: 'A', text: 'Exhaustive and complete' },
          { id: 'B', letter: 'B', text: 'Brief and superficial' },
          { id: 'C', letter: 'C', text: 'Complicated and vague' },
          { id: 'D', letter: 'D', text: 'Esta opcao contem resposta em portugues' }, // Vazamento em PT disparando G4
        ],
        correctOptionId: 'A',
        answerKey: 'A',
        explanation: 'Item de auditoria para certificar rejeição honesta por consistência de idioma.',
        subject: 'Língua Inglesa',
        topic: 'Vocabulary',
        bloomTaxonomy: 'Análise',
        canAutoSave: true,
      },
    ],
  },
];

// ─── Executor do Benchmark Fixo ─────────────────────────────────────────────

export interface BenchmarkOptions {
  battery?: ReferenceExam[];
  evalOptions?: EvaluateExamGatesOptions;
}

export function runReferenceExamBenchmark(options: BenchmarkOptions = {}): BenchmarkResult {
  const battery = options.battery ?? REFERENCE_EXAM_BATTERY;
  let totalQuestions = 0;
  let unmodifiedAcceptedQuestions = 0;

  const rejectionBreakdown = {
    gate1Structure: 0,
    gate2Haladyna: 0,
    gate3Distractors: 0,
    gate4Language: 0,
  };

  const detailsPerSubject: Record<
    string,
    {
      total: number;
      accepted: number;
      rate: number;
    }
  > = {};

  const examReports: BenchmarkExamReport[] = [];

  for (const exam of battery) {
    let examAccepted = 0;
    const issues: string[] = [];
    const gatesSummary = { G1: true, G2: true, G3: true, G4: true };

    const subject = exam.subject || 'Geral';
    if (!detailsPerSubject[subject]) {
      detailsPerSubject[subject] = { total: 0, accepted: 0, rate: 0 };
    }

    for (let qIdx = 0; qIdx < exam.questions.length; qIdx++) {
      const q = exam.questions[qIdx];
      totalQuestions++;
      detailsPerSubject[subject].total++;

      const evalOpts: EvaluateExamGatesOptions = {
        ...options.evalOptions,
        targetLanguage: exam.language || 'pt',
      };

      // Avaliação isolada da questão contra os 4 portões
      const g1 = evaluateGateG1([q]);
      const g2 = evaluateGateG2([q]);
      const g3 = evaluateGateG3([q], evalOpts);
      const g4 = evaluateGateG4([q], evalOpts);

      const qPassedAll = g1.pass && g2.pass && g3.pass && g4.pass;

      if (qPassedAll) {
        unmodifiedAcceptedQuestions++;
        examAccepted++;
        detailsPerSubject[subject].accepted++;
      } else {
        if (!g1.pass) {
          rejectionBreakdown.gate1Structure++;
          gatesSummary.G1 = false;
          issues.push(`Questão #${qIdx + 1}: ${g1.evidence}`);
        }
        if (!g2.pass) {
          rejectionBreakdown.gate2Haladyna++;
          gatesSummary.G2 = false;
          issues.push(`Questão #${qIdx + 1}: ${g2.evidence}`);
        }
        if (!g3.pass) {
          rejectionBreakdown.gate3Distractors++;
          gatesSummary.G3 = false;
          issues.push(`Questão #${qIdx + 1}: ${g3.evidence}`);
        }
        if (!g4.pass) {
          rejectionBreakdown.gate4Language++;
          gatesSummary.G4 = false;
          issues.push(`Questão #${qIdx + 1}: ${g4.evidence}`);
        }
      }
    }

    const examTotal = exam.questions.length;
    examReports.push({
      examId: exam.id,
      title: exam.title,
      subject: exam.subject,
      gradeLevel: exam.gradeLevel,
      totalQuestions: examTotal,
      acceptedQuestions: examAccepted,
      acceptanceRate: examTotal > 0 ? examAccepted / examTotal : 0,
      gatesPassed: gatesSummary,
      issues,
    });
  }

  // Atualiza as taxas consolidadas por disciplina
  for (const subj of Object.keys(detailsPerSubject)) {
    const s = detailsPerSubject[subj];
    s.rate = s.total > 0 ? s.accepted / s.total : 0;
  }

  const unmodifiedAcceptanceRate =
    totalQuestions > 0 ? unmodifiedAcceptedQuestions / totalQuestions : 0;

  return {
    totalExams: battery.length,
    totalQuestions,
    unmodifiedAcceptedQuestions,
    unmodifiedAcceptanceRate,
    rejectionBreakdown,
    detailsPerSubject,
    examReports,
  };
}
