/**
 * lib/conversationData/adversarialDataset.ts
 *
 * Conjunto de 40 falas adversariais pré-escritas com rótulo correto (Ground Truth).
 * NÃO VALIDADO EM ASR REAL — marcas e heurísticas projetadas para estresse sintético de ASR e sala de aula.
 */

export interface AdversarialUtterance {
  id: number
  speakerRole: 'professor' | 'aluno'
  text: string
  expectedIsQuestion: boolean
  expectedSubtype?: 'aberta' | 'fechada' | 'aluno' | 'administrativa' | 'retorica' | 'none'
  category:
    | 'sem_interrogacao'
    | 'retorica'
    | 'administrativa'
    | 'pergunta_aluno'
    | 'afirmacao_com_interrogacao'
    | 'asr_sem_pontuacao'
    | 'interrupcao'
}

export const DEV_ADVERSARIAL_CASES: ReadonlyArray<AdversarialUtterance> = Object.freeze([
  // ─── 1 a 7: Pergunta sem '?' (imperativo explicativo / elicitação) ─────────
  { id: 1, speakerRole: 'professor', text: 'me explica por que os mamíferos são homotérmicos', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'sem_interrogacao' },
  { id: 2, speakerRole: 'professor', text: 'diga para a turma qual é o ponto de ebulição da água', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'sem_interrogacao' },
  { id: 3, speakerRole: 'professor', text: 'gostaria de saber como a fotossíntese produz glicose', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'sem_interrogacao' },
  { id: 4, speakerRole: 'professor', text: 'quero que vocês reflitam sobre o que aconteceria se a temperatura global subisse 4 graus', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'sem_interrogacao' },
  { id: 5, speakerRole: 'professor', text: 'fale qual é a fórmula da água', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'sem_interrogacao' },
  { id: 6, speakerRole: 'professor', text: 'explique como as placas tectônicas se movem', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'sem_interrogacao' },
  { id: 7, speakerRole: 'professor', text: 'detalhe por que o solo arenoso não retém água', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'sem_interrogacao' },

  // ─── 8 a 13: Retóricas / checagem de canal ('entenderam?', 'né?') ──────────
  { id: 8, speakerRole: 'professor', text: 'entenderam turma?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },
  { id: 9, speakerRole: 'professor', text: 'né pessoal?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },
  { id: 10, speakerRole: 'professor', text: 'tá bom?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },
  { id: 11, speakerRole: 'professor', text: 'certo gente?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },
  { id: 12, speakerRole: 'professor', text: 'entendeu?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },
  { id: 13, speakerRole: 'professor', text: 'beleza turma?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },

  // ─── 14 a 18: Administrativas / rotina de sala ────────────────────────────
  { id: 14, speakerRole: 'aluno', text: 'professora posso ir ao banheiro?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },
  { id: 15, speakerRole: 'aluno', text: 'posso beber água?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },
  { id: 16, speakerRole: 'aluno', text: 'professora onde jogo esse papel?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },
  { id: 17, speakerRole: 'aluno', text: 'vai cair na prova de sexta?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },
  { id: 18, speakerRole: 'aluno', text: 'que horas bate o sinal?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },

  // ─── 19 a 24: Perguntas de conteúdo feitas por alunos ──────────────────────
  { id: 19, speakerRole: 'aluno', text: 'professora os vírus são seres vivos?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 20, speakerRole: 'aluno', text: 'quem descobriu o núcleo celular?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 21, speakerRole: 'aluno', text: 'por que a Lua não cai na Terra?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 22, speakerRole: 'aluno', text: 'as bactérias têm mitocôndrias?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 23, speakerRole: 'aluno', text: 'como a vacina ensina o sistema imune?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 24, speakerRole: 'aluno', text: 'o elétron tem massa desprezível?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },

  // ─── 25 a 29: Afirmação com '?' no fim (hesitação / resposta com uptalk) ──
  { id: 25, speakerRole: 'aluno', text: 'a resposta certa é a letra C?', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_com_interrogacao' },
  { id: 26, speakerRole: 'aluno', text: 'o Brasil é o maior país da América do Sul?', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_com_interrogacao' },
  { id: 27, speakerRole: 'aluno', text: 'a célula animal não tem parede celular?', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_com_interrogacao' },
  { id: 28, speakerRole: 'aluno', text: 'amanhã nós vamos ao laboratório de química?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'afirmacao_com_interrogacao' },
  { id: 29, speakerRole: 'aluno', text: 'eu fiz o exercício número 4?', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_com_interrogacao' },

  // ─── 30 a 35: Fala sem pontuação no estilo de saída de ASR ─────────────────
  { id: 30, speakerRole: 'aluno', text: 'como que a agua evapora do oceano', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'asr_sem_pontuacao' },
  { id: 31, speakerRole: 'professor', text: 'qual o nome daquela celula vegetal que faz fotossintese', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'asr_sem_pontuacao' },
  { id: 32, speakerRole: 'aluno', text: 'porque o ceu e azul', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'asr_sem_pontuacao' },
  { id: 33, speakerRole: 'aluno', text: 'quem foi que inventou o microscopio optico', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'asr_sem_pontuacao' },
  { id: 34, speakerRole: 'professor', text: 'as plantas respiram oxigenio durante a noite', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'asr_sem_pontuacao' },
  { id: 35, speakerRole: 'aluno', text: 'onde fica armazenado o dna da bacteria', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'asr_sem_pontuacao' },

  // ─── 36 a 40: Interrupções e falas incompletas ─────────────────────────────
  { id: 36, speakerRole: 'aluno', text: 'mas se a gente...', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao' },
  { id: 37, speakerRole: 'aluno', text: 'espera aí professora...', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao' },
  { id: 38, speakerRole: 'aluno', text: 'não entendi nada', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao' },
  { id: 39, speakerRole: 'aluno', text: 'olha ali na janela', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao' },
  { id: 40, speakerRole: 'professor', text: 'gente silêncio', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao' }
]);

export const ADVERSARIAL_40_DATASET = DEV_ADVERSARIAL_CASES
