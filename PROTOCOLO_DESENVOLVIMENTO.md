# PROTOCOLO DE DESENVOLVIMENTO — TEACHER AI APP

> Leia este arquivo no início de toda sessão de trabalho neste repositório.
> Estas regras têm prioridade sobre a conveniência de responder rápido.

---

## POR QUE ESTE ARQUIVO EXISTE

Em rodadas anteriores de desenvolvimento, aconteceu repetidamente: uma funcionalidade foi reportada como "implementada e funcionando" quando na verdade era interface sem lógica real (`Math.random()` fingindo ser dado real), estava desconectada do restante do sistema (sliders de UI que não chegavam ao prompt da IA), ou uma mudança de escopo grande foi feita sem aprovação prévia quando isso era exigido. Este protocolo existe para tornar esse tipo de erro estruturalmente mais difícil de acontecer — não depende de "lembrar de ser cauteloso", depende de seguir um processo fixo.

---

## REGRA 1 — DEFINIÇÃO DE "PRONTO" (Definition of Done)

Uma tarefa **NUNCA** está concluída apenas porque o código foi escrito e parece correto. Uma tarefa só pode ser reportada como ✅ concluída quando as 3 condições abaixo forem satisfeitas, com evidência colada na resposta:

1. **Código alterado:** caminho do(s) arquivo(s) e o trecho relevante modificado.
2. **Execução real:** rode o fluxo de verdade (não infira que vai funcionar por leitura do código) e cole o resultado real observado — output de console, resposta real da IA, screenshot descrito, valor real retornado. "Deveria funcionar" não é evidência.
3. **Build/teste automatizado:** rode `npm run build` e/ou `npx vitest run` e cole o resultado (incluindo exit code). Se algo quebrar, reporte isso, não omita.

Se qualquer uma das 3 não puder ser satisfeita (ex: não há como testar sem um dado que só o usuário tem), classifique explicitamente como 🟡 parcial ou 🔴 pendente de teste — nunca como ✅.

---

## REGRA 2 — PROIBIÇÃO DE SIMULAÇÃO SILENCIOSA (Zero-Simulação)

Nunca substitua ausência de dado real, integração real, ou lógica real por:
- Valor aleatório (`Math.random()`)
- Valor hardcoded fingindo ser dinâmico
- Função com nome genérico tipo `mockX()`/`fakeX()`/`dummyX()` deixada em código de produção
- Parâmetro de UI (slider, toggle, campo) que não é de fato lido pela lógica que ele aparenta controlar

Se o dado real ainda não existe ou a integração ainda não foi feita, a interface deve comunicar isso claramente ("sem dados suficientes", "recurso em desenvolvimento") — nunca preencher com algo que pareça real sem ser.

Antes de finalizar qualquer tarefa, rode uma varredura por: `mock`, `fake`, `dummy`, `stub`, `temp`, `placeholder`, `Math.random()` no(s) arquivo(s) alterado(s) e confirme que nenhum resquício ficou esquecido em código de produção (fora de arquivos de teste).

---

## REGRA 3 — NENHUMA DECISÃO DE ESCOPO SEM APROVAÇÃO EXPLÍCITA

Se, durante a implementação, você (Antigravity) perceber que a especificação recebida é ambígua, insuficiente, ou que uma decisão de design/arquitetura precisa ser tomada (ex: quantas categorias uma navegação deveria ter, se um dado deve ser público ou privado, se uma integração deve ser síncrona ou assíncrona) — **PARE e apresente as opções para aprovação antes de implementar**. Nunca decida sozinho e reporte a decisão como se tivesse sido a instrução original. Se você decidir seguir em frente mesmo assim por julgar necessário, isso deve ser sinalizado em destaque na resposta, não mencionado de passagem.

---

## REGRA 4 — TAREFAS GRANDES SÃO DIVIDIDAS, NÃO EMPACOTADAS

Quando uma solicitação contém múltiplos itens (mais de ~5), não implemente todos em uma única passada sem reportar progresso intermediário. Estruture como: implementar item → testar item (Regra 1) → reportar → seguir para o próximo. Se perceber que a qualidade da verificação está caindo conforme avança pela lista (menos rigor nos itens finais), pare e sinalize isso explicitamente em vez de continuar e arredondar para cima no relatório final.

---

## REGRA 5 — RESPOSTA A PERGUNTA DE VERIFICAÇÃO NÃO PODE SER RESUMO GENÉRICO

Quando receber um prompt pedindo verificação pontual de algo específico (ex: "cole o código exato de X", "responda apenas Y"), a resposta deve conter exatamente o que foi pedido, no formato pedido. Reenviar um resumo geral do projeto, mesmo que tecnicamente relacionado, não é uma resposta válida a uma pergunta específica.

---

## REGRA 6 — CONTRADIÇÕES COM AUDITORIAS ANTERIORES SÃO SEMPRE SINALIZADAS

Se, ao investigar algo, você descobrir que uma afirmação feita em uma resposta anterior sua (ou de uma sessão anterior) estava incorreta ou desatualizada, isso deve ser dito explicitamente e em destaque — "isto contradiz o que reportei antes, e a versão correta é X" — nunca silenciosamente substituído ou reafirmado sem menção à divergência.

---

## CHECKLIST RÁPIDO ANTES DE QUALQUER RESPOSTA DE "CONCLUÍDO"

- [ ] Colei o código real alterado, não uma descrição dele?
- [ ] Rodei o fluxo de verdade e colei o resultado real, não uma previsão?
- [ ] Rodei build/teste e colei o resultado, incluindo se algo falhou?
- [ ] Procurei por mock/fake/random/stub esquecido no que alterei?
- [ ] Tomei alguma decisão de escopo sozinho que deveria ter sido aprovada antes?
- [ ] Se a tarefa tinha muitos itens, testei todos com o mesmo rigor, ou só os primeiros?
- [ ] Alguma informação que dei aqui contradiz algo que eu disse antes? Sinalizei isso?

Se a resposta a qualquer item acima for "não" ou "não tenho certeza", a tarefa não está pronta — reporte como parcial e explique o motivo.
