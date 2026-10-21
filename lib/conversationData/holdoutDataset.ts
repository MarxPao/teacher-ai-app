/**
 * lib/conversationData/holdoutDataset.ts
 *
 * Conjunto de 40 falas NOVAS (Holdout Cego) para verificação sem vazamento de dados de treino.
 * NÃO VALIDADO EM ASR REAL — dataset sintético pré-gravado para teste estrito.
 */

export interface HoldoutUtterance {
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

export const HOLDOUT_40_DATASET: ReadonlyArray<HoldoutUtterance> = Object.freeze([
  // ─── 1 a 6: Pergunta sem '?' ─────────────────────────────────────────────
  { id: 101, speakerRole: 'professor', text: 'descreva para mim as etapas da mitose celular', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'sem_interrogacao' },
  { id: 102, speakerRole: 'professor', text: 'cite dois exemplos de mamíferos marinhos', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'sem_interrogacao' },
  { id: 103, speakerRole: 'professor', text: 'aponte a principal diferença entre artérias e veias', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'sem_interrogacao' },
  { id: 104, speakerRole: 'professor', text: 'quero ouvir de vocês por que a gravidade varia nos polos', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'sem_interrogacao' },
  { id: 105, speakerRole: 'professor', text: 'demonstre como se calcula a velocidade média', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'sem_interrogacao' },
  { id: 106, speakerRole: 'professor', text: 'me fale o nome do autor de Dom Casmurro', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'sem_interrogacao' },

  // ─── 7 a 12: Retóricas / checagem de canal ─────────────────────────────────
  { id: 107, speakerRole: 'professor', text: 'compreenderam a explicação?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },
  { id: 108, speakerRole: 'professor', text: 'tranquilo pessoal?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },
  { id: 109, speakerRole: 'professor', text: 'faz sentido?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },
  { id: 110, speakerRole: 'professor', text: 'beleza galera?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },
  { id: 111, speakerRole: 'professor', text: 'tudo certinho?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },
  { id: 112, speakerRole: 'professor', text: 'estão me ouvindo?', expectedIsQuestion: false, expectedSubtype: 'retorica', category: 'retorica' },

  // ─── 13 a 18: Administrativas / rotina escolar ─────────────────────────────
  { id: 113, speakerRole: 'aluno', text: 'professor posso apontar meu lápis no lixo?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },
  { id: 114, speakerRole: 'aluno', text: 'a aula acaba às dez e meia?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },
  { id: 115, speakerRole: 'aluno', text: 'o trabalho é em dupla ou individual?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },
  { id: 116, speakerRole: 'aluno', text: 'tem folha de rascunho sobrando?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },
  { id: 117, speakerRole: 'aluno', text: 'professora o ar condicionado pode ligar?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },
  { id: 118, speakerRole: 'aluno', text: 'pode entregar o relatório na semana que vem?', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'administrativa' },

  // ─── 19 a 25: Perguntas de conteúdo feitas por alunos ──────────────────────
  { id: 119, speakerRole: 'aluno', text: 'professora por que as folhas ficam amarelas no outono?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 120, speakerRole: 'aluno', text: 'o átomo pode ser dividido em partes menores?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 121, speakerRole: 'aluno', text: 'qual é a velocidade da luz no vácuo?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 122, speakerRole: 'aluno', text: 'como os fungos obtêm seus nutrientes?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 123, speakerRole: 'aluno', text: 'as ondas sonoras se propagam no espaço sideral?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 124, speakerRole: 'aluno', text: 'o que é a camada de ozônio?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },
  { id: 125, speakerRole: 'aluno', text: 'quem propôs a teoria da relatividade?', expectedIsQuestion: true, expectedSubtype: 'aluno', category: 'pergunta_aluno' },

  // ─── 26 a 30: Afirmação com '?' no fim (uptalk / hesitação discente) ──────
  { id: 126, speakerRole: 'aluno', text: 'a capital da Argentina é Buenos Aires?', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_com_interrogacao' },
  { id: 127, speakerRole: 'aluno', text: 'a fórmula da água oxigenada é H2O2?', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_com_interrogacao' },
  { id: 128, speakerRole: 'aluno', text: 'a resposta do cálculo deu quarenta e dois?', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_com_interrogacao' },
  { id: 129, speakerRole: 'aluno', text: 'o verbo está no pretérito perfeito?', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_com_interrogacao' },
  { id: 130, speakerRole: 'aluno', text: 'o sangue oxigenado passa pela aorta?', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_com_interrogacao' },

  // ─── 31 a 35: ASR sem pontuação ───────────────────────────────────────────
  { id: 131, speakerRole: 'aluno', text: 'qual e o maior planeta do sistema solar', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'asr_sem_pontuacao' },
  { id: 132, speakerRole: 'professor', text: 'quem sabe me dizer a funcao dos ribossomos na celula', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'asr_sem_pontuacao' },
  { id: 133, speakerRole: 'aluno', text: 'como que os peixes respiram debaixo da agua', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'asr_sem_pontuacao' },
  { id: 134, speakerRole: 'aluno', text: 'porque a agua do mar e salgada', expectedIsQuestion: true, expectedSubtype: 'aberta', category: 'asr_sem_pontuacao' },
  { id: 135, speakerRole: 'professor', text: 'onde ocorre a respiracao celular aerobia', expectedIsQuestion: true, expectedSubtype: 'fechada', category: 'asr_sem_pontuacao' },

  // ─── 36 a 40: Interrupções e falas incompletas ─────────────────────────────
  { id: 136, speakerRole: 'aluno', text: 'espera aí que eu não copiei ainda...', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao' },
  { id: 137, speakerRole: 'professor', text: 'guardem os cadernos e prestem atenção', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao' },
  { id: 138, speakerRole: 'aluno', text: 'mas professora se...', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao' },
  { id: 139, speakerRole: 'aluno', text: 'esqueci minha régua em casa hoje', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao' },
  { id: 140, speakerRole: 'professor', text: 'abram na página cinquenta e quatro', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao' }
])
