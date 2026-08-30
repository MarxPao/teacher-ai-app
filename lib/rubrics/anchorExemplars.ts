/**
 * anchorExemplars.ts — Exemplares-Âncora Calibrados para Correção de Produção Textual (OmniGrader)
 * 
 * Fornece redações de calibração oficial (Ground Truth Few-Shot) para ancorar a régua avaliativa
 * da LLM contra drift de severidade, garantindo consistência psicométrica entre diferentes modelos BYOK.
 */

export interface AnchorExemplar {
  level: 1 | 3 | 5 // 1: Insuficiente, 3: Adequado/Intermediário, 5: Pleno/Excelente
  label: string
  textExcerpt: string
  scoreJustification: string
}

export const CAMBRIDGE_ANCHORS_MACRO: AnchorExemplar[] = [
  {
    level: 1,
    label: 'Banda 1/5 (Insuficiente — Fuga Parcial e Propósito Frágil)',
    textExcerpt: '"I like sports because is good. Yesterday I play football with friends and is very funny. That is my opinion."',
    scoreJustification: 'Content 1/5: Resposta mínima, tangencia o tema solicitado sem desenvolver os tópicos da proposta. Communicative Achievement 1/5: Registro informal inadequado, formato de carta/ensaio não sustentado.'
  },
  {
    level: 3,
    label: 'Banda 3/5 (Adequado — Cumpre a Tarefa com Desenvolvimento Básico)',
    textExcerpt: '"In my opinion, technology brings many benefits for students. First, we can find information quickly on the internet. However, some students waste time playing games during study hours. In conclusion, we should use technology carefully."',
    scoreJustification: 'Content 3/5: Todos os pontos da proposta são abordados com clareza razoável. Communicative Achievement 3/5: Tom apropriado, comunica ideias simples de forma eficaz, mantendo a atenção do leitor.'
  },
  {
    level: 5,
    label: 'Banda 5/5 (Excelente — Domínio Pleno e Argumentação Convincente)',
    textExcerpt: '"It is widely acknowledged that technological advancements have revolutionized modern education. Not only does digital research expand intellectual horizons, but interactive platforms also foster collaborative learning. While concerns regarding digital distractions are valid, proper guidance ensures technology serves as an empowering tool rather than a hindrance."',
    scoreJustification: 'Content 5/5: Todos os requisitos da tarefa são desenvolvidos de forma abrangente e persuasiva. Communicative Achievement 5/5: Convenções de gênero perfeitas, tom sofisticado e engajador.'
  }
]

export const CAMBRIDGE_ANCHORS_MICRO: AnchorExemplar[] = [
  {
    level: 1,
    label: 'Banda 1/5 (Micro-Linguístico Frágil — Erros Frequentes de Coesão e Sintaxe)',
    textExcerpt: '"Because is very good and the person like. They goes to school and not have books. But then is ok."',
    scoreJustification: 'Organisation 1/5: Falta pontuação e conectivos lógicos; frases fragmentadas. Language 1/5: Erros sistemáticos de concordância (they goes) e omissão de sujeitos (because is).'
  },
  {
    level: 3,
    label: 'Banda 3/5 (Micro-Linguístico Adequado — Coesão Clara e Vocabulário Cotidiano)',
    textExcerpt: '"Firstly, studying every day is important. In addition, teachers help us when we have difficulties. On the other hand, too much homework makes students tired."',
    scoreJustification: 'Organisation 3/5: Paragrafação clara com linkers funcionais (Firstly, In addition, On the other hand). Language 3/5: Bom controle de vocabulário e tempos verbais cotidianos, erros não impedem a compreensão.'
  },
  {
    level: 5,
    label: 'Banda 5/5 (Micro-Linguístico Excelente — Variedade Sintática e Vocabulário Preciso)',
    textExcerpt: '"Consequently, integrating sustainable practices within school curricula not only enhances ecological awareness, but also equips students with the critical mindset necessary to address forthcoming global challenges."',
    scoreJustification: 'Organisation 5/5: Coesão fluida com transições elegantes e referências anafóricas naturais. Language 5/5: Ampla gama de léxico avançado (enhances, equips, forthcoming) e estruturas complexas sem erros.'
  }
]

export const PORTUGUESE_ANCHORS_MACRO: AnchorExemplar[] = [
  {
    level: 1,
    label: 'Nível 1/5 (Insuficiente — Tangenciamento e Estrutura Embrionária)',
    textExcerpt: '"A violência no trânsito é muito ruim porque as pessoas andam rápido e não respeita nada. Tem que multar todo mundo."',
    scoreJustification: 'Tema & Estrutura 1/5: Argumentação circular e senso comum sem repertório sociocultural ou contextualização analítica.'
  },
  {
    level: 3,
    label: 'Nível 3/5 (Adequado — Tese Clara e Argumentação Linear)',
    textExcerpt: '"É notório que a mobilidade urbana enfrenta graves problemas nas grandes cidades. Em primeiro lugar, o transporte público insuficiente obriga o cidadão a utilizar veículos individuais, saturando as vias. Além disso, a falta de ciclovias seguras dificulta o uso de transportes alternativos. Logo, medidas governamentais são urgentes."',
    scoreJustification: 'Tema & Estrutura 3/5: Tese identificável, divisão clássica em introdução, causa/efeito e fechamento, com argumentação coerente.'
  },
  {
    level: 5,
    label: 'Nível 5/5 (Excelente — Projeto de Texto Estruturado e Repertório Legitimado)',
    textExcerpt: '"Na obra \'Cidadãos de Papel\', Gilberto Dimenstein reflete sobre a distância entre os direitos constitucionais e a realidade cotidiana. De maneira análoga, a precarização do transporte público evidencia a negligência estatal diante do direito fundamental à mobilidade. Sob essa ótica, tanto a escassez de investimentos na malha ferroviária quanto a defasagem tarifária perpetuam a segregação socioespacial."',
    scoreJustification: 'Tema & Estrutura 5/5: Repertório legitimado e produtivo integrado perfeitamente ao projeto de texto dissertativo-argumentativo.'
  }
]

export const PORTUGUESE_ANCHORS_MICRO: AnchorExemplar[] = [
  {
    level: 1,
    label: 'Nível 1/5 (Micro-Linguístico Frágil — Desvios Múltiplos de Norma-Padrão)',
    textExcerpt: '"Os problema acontece por que as pessoas não liga pra regras e faz oque quer nas ruas."',
    scoreJustification: 'Coesão & Norma 1/5: Desvios graves de concordância verbal/nominal, grafia incorreta de porquê e aglutinações (oque).'
  },
  {
    level: 3,
    label: 'Nível 3/5 (Micro-Linguístico Adequado — Coesão Interparágrafos e Poucos Desvios)',
    textExcerpt: '"Nesse sentido, cabe destacar a importância de investimentos públicos. Embora existam leis rigorosas, a fiscalização ainda é precária, o que compromete os resultados esperados."',
    scoreJustification: 'Coesão & Norma 3/5: Presença de conectivos inter e intraparágrafos (Nesse sentido, Embora), pontuação adequada e obediência à norma culta.'
  },
  {
    level: 5,
    label: 'Nível 5/5 (Micro-Linguístico Excelente — Riqueza Sintática e Domínio da Norma)',
    textExcerpt: '"Torna-se imperativo, outrossim, que o Ministério dos Transportes destine recursos à expansão de corredores exclusivos de ônibus, mitigando, por conseguinte, os impactos ambientais e os congestionamentos crônicos."',
    scoreJustification: 'Coesão & Norma 5/5: Emprego impecável de conjunções subordinativas e orações intercaladas, precisão vocabular e ausência total de desvios.'
  }
]

/**
 * Retorna o bloco de exemplares-âncora formatado para injeção no prompt do OmniGrader
 */
export function getAnchorExemplarsPrompt(
  subject: 'portuguese' | 'english' = 'english',
  passType: 'macro' | 'micro' = 'macro'
): string {
  let anchors: AnchorExemplar[] = []

  if (subject === 'portuguese') {
    anchors = passType === 'macro' ? PORTUGUESE_ANCHORS_MACRO : PORTUGUESE_ANCHORS_MICRO
  } else {
    anchors = passType === 'macro' ? CAMBRIDGE_ANCHORS_MACRO : CAMBRIDGE_ANCHORS_MICRO
  }

  const lines = anchors.map(a => `• ${a.label}:\n  Trecho: ${a.textExcerpt}\n  Calibração Psicométrica: ${a.scoreJustification}`).join('\n\n')

  return `=== GROUND TRUTH / EXEMPLARES-ÂNCORA DE CALIBRAÇÃO (${passType.toUpperCase()}) ===
Use os seguintes textos de referência oficiais para calibrar a escala de 0 a 5 com consistência absoluta:
${lines}
`
}
