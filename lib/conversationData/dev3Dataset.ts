/**
 * lib/conversationData/dev3Dataset.ts
 *
 * Conjunto de 40 falas DEV3 (anteriormente Holdout 3, agora congelado e queimado para diagnóstico).
 * NÃO VALIDADO EM ASR REAL — dataset sintético adversarial no formato ASR.
 */

export interface Dev3Utterance {
  id: number
  speakerRole: 'professor' | 'aluno'
  text: string
  expectedIsQuestion: boolean
  expectedSubtype?: 'conteudo' | 'checagem' | 'administrativa' | 'none'
  category:
    | 'pergunta_conteudo_docente'
    | 'pergunta_conteudo_discente'
    | 'pergunta_administrativa'
    | 'checagem_retorica'
    | 'afirmacao_ou_uptalk'
    | 'instrucao_ou_exposicao'
    | 'interrupcao_ou_ruido'
}

export const DEV3_BURNED_DATASET: ReadonlyArray<Dev3Utterance> = Object.freeze([
  // ─── 1 a 6: Perguntas de conteúdo do professor em estilo ASR ───────────────
  { id: 201, speakerRole: 'professor', text: 'o que acontece quando a celula perde agua por osmose', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },
  { id: 202, speakerRole: 'professor', text: 'como voces explicariam a diferenca entre mitose e meiose', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },
  { id: 203, speakerRole: 'professor', text: 'qual eh a funcao principal dos ribossomos na celula', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },
  { id: 204, speakerRole: 'professor', text: 'por que a agua ferve em temperatura menor no topo da montanha', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },
  { id: 205, speakerRole: 'professor', text: 'explique pra turma como o coracao bombeia o sangue', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },
  { id: 206, speakerRole: 'professor', text: 'quem lembra o nome do cientista que formulou as leis da gravidade', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },

  // ─── 7 a 12: Perguntas de conteúdo dos alunos em estilo ASR ────────────────
  { id: 207, speakerRole: 'aluno', text: 'professora por que as celulas vegetais tem parece celular e a nossa nao', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },
  { id: 208, speakerRole: 'aluno', text: 'como eh que o virus entra na celula sem ser destruido', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },
  { id: 209, speakerRole: 'aluno', text: 'se a terra gira tao rapido porque a gente nao sente o vento', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },
  { id: 210, speakerRole: 'aluno', text: 'o adn e o rna sao a mesma coisa ou tem diferenca', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },
  { id: 211, speakerRole: 'aluno', text: 'qual animal vive mais tempo na terra', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },
  { id: 212, speakerRole: 'aluno', text: 'as bacterias tambem pegam doenca de virus', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },

  // ─── 13 a 18: Perguntas administrativas / rotina escolar em estilo ASR ─────
  { id: 213, speakerRole: 'aluno', text: 'professora posso ir beber agua rapidinho', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },
  { id: 214, speakerRole: 'aluno', text: 'essa materia de hoje vai cair no simulado do mes que vem', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },
  { id: 215, speakerRole: 'aluno', text: 'posso entregar a licao impressa na secretaria', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },
  { id: 216, speakerRole: 'aluno', text: 'onde que joga a ponta do lapis que quebrou', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },
  { id: 217, speakerRole: 'aluno', text: 'que horas o recreio comeca hoje', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },
  { id: 218, speakerRole: 'aluno', text: 'o trabalho de quimica pode ser feito em trio', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },

  // ─── 19 a 24: Checagens de canal e retóricas (não são perguntas de conteúdo) 
  { id: 219, speakerRole: 'professor', text: 'entenderam turma', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },
  { id: 220, speakerRole: 'professor', text: 'ta dando pra ouvir no fundo da sala', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },
  { id: 221, speakerRole: 'professor', text: 'ne pessoal', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },
  { id: 222, speakerRole: 'professor', text: 'tudo bem ate aqui', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },
  { id: 223, speakerRole: 'professor', text: 'certo gente', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },
  { id: 224, speakerRole: 'professor', text: 'faz sentido isso pra voces', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },

  // ─── 25 a 30: Afirmações com hesitação / uptalk discente ──────────────────
  { id: 225, speakerRole: 'aluno', text: 'eu acho que a fotossintese acontece nas folhas', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },
  { id: 226, speakerRole: 'aluno', text: 'a resposta certa eh a letra b', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },
  { id: 227, speakerRole: 'aluno', text: 'o brasil foi descoberto em mil e quinhentos', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },
  { id: 228, speakerRole: 'aluno', text: 'minha resposta deu vinte e cinco metros por segundo', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },
  { id: 229, speakerRole: 'aluno', text: 'a celula vegetal tem parede de celulose', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },
  { id: 230, speakerRole: 'aluno', text: 'eu fiz o exercicio da pagina quarenta e dois', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },

  // ─── 31 a 36: Exposição expositiva do docente ou instruções de rotina ──────
  { id: 231, speakerRole: 'professor', text: 'abram o livro na pagina cinquenta e tres pra comecar a leitura', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },
  { id: 232, speakerRole: 'professor', text: 'guardem os celulares dentro das mochilas agora pessoal', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },
  { id: 233, speakerRole: 'professor', text: 'o reticulo endoplasmatico rugoso eh responsavel pela sintese proteica', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },
  { id: 234, speakerRole: 'professor', text: 'silencio por favor vamos focar na explicacao da lousa', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },
  { id: 235, speakerRole: 'professor', text: 'a mitocondria produz adenosina trifosfato atraves da respiracao celular', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },
  { id: 236, speakerRole: 'professor', text: 'copiem esse esquema que eu coloquei no quadro antes de apagar', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },

  // ─── 37 a 40: Interrupções, hesitações e ruído de reconhecimento de fala ───
  { id: 237, speakerRole: 'aluno', text: 'mas se a gente pegar e', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao_ou_ruido' },
  { id: 238, speakerRole: 'aluno', text: 'espera ai deixa eu ver aqui', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao_ou_ruido' },
  { id: 239, speakerRole: 'professor', text: 'entao como eu ia dizendo antes', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao_ou_ruido' },
  { id: 240, speakerRole: 'aluno', text: 'nao entendi nada desse grafico', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao_ou_ruido' }
])
