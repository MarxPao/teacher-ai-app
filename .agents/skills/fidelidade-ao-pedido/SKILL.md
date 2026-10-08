---
name: fidelidade-ao-pedido
description: Use em TODA tarefa que tenha itens numerados, critérios de aceite ou regras. Garante que o pedido seja cumprido como escrito, sem simplificar nem substituir.
---

# Antes de agir
1. Copie o pedido e numere cada exigência (R1, R2, ...), incluindo restrições
   ("não alterar X", "usar Y", "rodar Z"). Salve em handoff/<tarefa>-requisitos.md.
2. Se algo for ambíguo, pergunte ANTES. Não escolha a interpretação mais fácil.

# Durante
3. Use o método e os arquivos pedidos. Se precisar de outro caminho, declare como
   DESVIO (o que, por quê, impacto) e PARE para aprovação. Substituir em silêncio
   é falha grave.
4. Não reduza escopo, escolha casos mais fáceis, nem troque o que é medido.
5. Não altere testes de aceite, a régua nem o critério para fazer algo passar.
6. Se for impossível ou arriscado cumprir um item, diga "NÃO FEITO" e o motivo.

# Ao relatar (obrigatório)
Tabela com UMA linha por requisito:
| Req | Status (FEITO/PARCIAL/NÃO FEITO/DESVIO) | Evidência (comando + saída bruta, arquivo:linha) |
- FEITO exige comando e saída. Sem evidência, o status é NÃO VERIFICADO.
- PARCIAL e NÃO FEITO são respostas legítimas e valem mais que um falso FEITO.
- Nunca escreva "concluído" se houver item que não seja FEITO.
- Liste ao fim: o que foi pedido e NÃO foi entregue.

# Autoverificação final
Releia o pedido original linha a linha. Para cada exigência, aponte a linha da
tabela. Se alguma não tiver linha, volte e resolva ou declare.
