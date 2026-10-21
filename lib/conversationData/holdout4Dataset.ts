/**
 * lib/conversationData/holdout4Dataset.ts
 *
 * Conjunto de 40 falas NOVAS (Holdout 4) no estilo de saída de ASR real:
 * - Caixa estritamente baixa (minúsculas)
 * - Zero pontuação (sem ?, sem ., sem !, sem vírgulas)
 * - Fala coloquial e reconhecimento de voz de sala de aula em múltiplas disciplinas
 *
 * NÃO VALIDADO EM ASR REAL — dataset sintético de teste cego (Holdout 4).
 */

export interface Holdout4Utterance {
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

export const HOLDOUT4_40_DATASET: ReadonlyArray<Holdout4Utterance> = Object.freeze([
  // ─── 1 a 6: Perguntas de conteúdo do professor em estilo ASR ───────────────
  { id: 301, speakerRole: 'professor', text: 'qual eh o bioma predominante na regiao centro oeste do brasil', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },
  { id: 302, speakerRole: 'professor', text: 'quem sabe me dizer a diferenca entre clima e tempo meteorologico', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },
  { id: 303, speakerRole: 'professor', text: 'por que a pressao atmosferica diminui conforme a altitude aumenta', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },
  { id: 304, speakerRole: 'professor', text: 'o que motivou a chegada da familia real portuguesa ao brasil em mil oitocentos e oito', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },
  { id: 305, speakerRole: 'professor', text: 'como a gente calcula a area de um triangulo retangulo', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },
  { id: 306, speakerRole: 'professor', text: 'onde ocorre a fecundacao humana no sistema reprodutor feminino', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_docente' },

  // ─── 7 a 12: Perguntas de conteúdo dos alunos em estilo ASR ────────────────
  { id: 307, speakerRole: 'aluno', text: 'professor o que significa a palavra anacronismo na historia', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },
  { id: 308, speakerRole: 'aluno', text: 'professora porque a lua tem fases se ela nao tem luz propria', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },
  { id: 309, speakerRole: 'aluno', text: 'como que a agua do poco artesiano sobe sem bomba eletrica', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },
  { id: 310, speakerRole: 'aluno', text: 'qual a diferenca entre velocidade escalar media e aceleracao', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },
  { id: 311, speakerRole: 'aluno', text: 'professora as baleias sao peixes ou mamiferos aquaticos', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },
  { id: 312, speakerRole: 'aluno', text: 'quem pintou o quadro da mona lisa', expectedIsQuestion: true, expectedSubtype: 'conteudo', category: 'pergunta_conteudo_discente' },

  // ─── 13 a 18: Perguntas administrativas / rotina escolar em estilo ASR ─────
  { id: 313, speakerRole: 'aluno', text: 'professor posso pegar meu estojo no armario do fundo', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },
  { id: 314, speakerRole: 'aluno', text: 'vai cair trigonometria na prova trimestral de terca feira', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },
  { id: 315, speakerRole: 'aluno', text: 'professora onde que joga essa casca de banana', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },
  { id: 316, speakerRole: 'aluno', text: 'que horas termina a segunda aula pra bater o sinal', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },
  { id: 317, speakerRole: 'aluno', text: 'o trabalho de historia pode ser entregue em grupo de quatro', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },
  { id: 318, speakerRole: 'aluno', text: 'tem folha de rascunho sobrando pra fazer a conta', expectedIsQuestion: true, expectedSubtype: 'administrativa', category: 'pergunta_administrativa' },

  // ─── 19 a 24: Checagens de canal e retóricas ───────────────────────────────
  { id: 319, speakerRole: 'professor', text: 'entenderam pessoal', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },
  { id: 320, speakerRole: 'professor', text: 'ta dando pra ouvir la no fundo turma', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },
  { id: 321, speakerRole: 'professor', text: 'tudo bem ate aqui gente', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },
  { id: 322, speakerRole: 'professor', text: 'ne turma', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },
  { id: 323, speakerRole: 'professor', text: 'certo pessoal', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },
  { id: 324, speakerRole: 'professor', text: 'faz sentido isso que eu falei', expectedIsQuestion: false, expectedSubtype: 'checagem', category: 'checagem_retorica' },

  // ─── 25 a 30: Afirmações com hesitação / uptalk discente ──────────────────
  { id: 325, speakerRole: 'aluno', text: 'eu acho que a capital de minas gerais eh belo horizonte', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },
  { id: 326, speakerRole: 'aluno', text: 'a resposta certa eh a alternativa d', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },
  { id: 327, speakerRole: 'aluno', text: 'o rio amazonas eh o maior rio do mundo em extensao', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },
  { id: 328, speakerRole: 'aluno', text: 'minha conta deu quarenta e oito metros quadrados', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },
  { id: 329, speakerRole: 'aluno', text: 'a revolucao francesa aconteceu no final do seculo dezoito', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },
  { id: 330, speakerRole: 'aluno', text: 'eu fiz a redacao sobre meio ambiente ontem a noite', expectedIsQuestion: false, expectedSubtype: 'none', category: 'afirmacao_ou_uptalk' },

  // ─── 31 a 36: Exposição docente ou instruções de rotina ────────────────────
  { id: 331, speakerRole: 'professor', text: 'abram a apostila na pagina vinte para fazermos os exercicios', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },
  { id: 332, speakerRole: 'professor', text: 'guardem os fones de ouvido nos bolsos antes de iniciarmos', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },
  { id: 333, speakerRole: 'professor', text: 'a primeira lei de newton eh conhecida como o principio da inercia', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },
  { id: 334, speakerRole: 'professor', text: 'silencio por favor para que todos consigam escutar a explicacao', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },
  { id: 335, speakerRole: 'professor', text: 'a funcao afim possui um grafico representado por uma reta no plano cartesiano', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },
  { id: 336, speakerRole: 'professor', text: 'anotem essas tres formulas no caderno para usar nos problemas', expectedIsQuestion: false, expectedSubtype: 'none', category: 'instrucao_ou_exposicao' },

  // ─── 37 a 40: Interrupções, hesitações e ruído ─────────────────────────────
  { id: 337, speakerRole: 'aluno', text: 'mas se a gente pegar e', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao_ou_ruido' },
  { id: 338, speakerRole: 'aluno', text: 'espera ai deixa eu achar aqui no livro', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao_ou_ruido' },
  { id: 339, speakerRole: 'professor', text: 'entao como eu ia dizendo antes de tocar', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao_ou_ruido' },
  { id: 340, speakerRole: 'aluno', text: 'nao entendi nada do enunciado dessa questao', expectedIsQuestion: false, expectedSubtype: 'none', category: 'interrupcao_ou_ruido' }
])
