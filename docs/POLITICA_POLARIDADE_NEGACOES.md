# Política Arquitetural: Tratamento de Negações no Resolvedor de Polaridade de Frequência

**Documento de Decisão Formal — Teacher AI (attendancePolarity.js)**  
**Data:** 2026-10-09  
**Status: DECISÃO TOMADA, PENDENTE DE CONFIRMAÇÃO DO DONO DO PRODUTO**  
**Escopo:** `teacher-extension/attendancePolarity.js`, `audit/polarity_test_cases.json`, `audit/fuzz_polarity.js`  
**Nota de Reversibilidade:** Esta decisão é preliminar, reversível e aguarda validação explícita do dono do produto antes do congelamento definitivo.

---

## 1. Três Decisões de Comportamento Real e Riscos Associados

As seguintes três decisões definem o comportamento efetivo em produção e apresentam trade-offs de risco operacional:

1. **Negação simples de presença (*"Não compareceu"*, *"Not present"*, *"Nao presente"*, *"Sem presença"*) $\rightarrow$ INVERTE para ausência (`NEGATIVE`)**:
   - **Risco se a decisão estiver errada:** Se o portal escolar utilizar o rótulo "Não compareceu" apenas como título descritivo mas o checkbox mantiver convenção de presença (marcar = veio), o sistema marcará falta em aluno presente (falso negativo de presença / dano acadêmico ao discente).

2. **Negação de ausência (*"Sem falta"*, *"Não faltou"*, *"Not absent"*, *"No absence"*) $\rightarrow$ RECUSA (`canResolve: false`, fail-closed)**:
   - **Risco se a decisão estiver errada:** Se o portal utilizar legitimamente a caixa "Sem falta" como controle de presença da aula do dia, a recusa automática impedirá o fluxo da Camada 2 e forçará interrupção desnecessária solicitando confirmação manual no overlay (Camada 3).

3. **Dupla negação / Negação composta (*"Não ausente"*, *"Not not present"*, *"Sem falta de presença"*) $\rightarrow$ RECUSA (`canResolve: false`, fail-closed)**:
   - **Risco se a decisão estiver errada:** Falso bloqueio de interface em portais com textos de acessibilidade redundantes, exigindo intervenção humana para resolver uma marcação que poderia ser inferida.

---

## 2. Tabela de Políticas e Ações do Resolvedor

| Categoria da Expressão | Exemplos Típicos | Ação do Resolvedor | Polaridade Resultante | Justificativa Pedagógica & Salvaguarda |
| :--- | :--- | :---: | :---: | :--- |
| **Negação Simples de Presença** | *"Não compareceu"*, *"Nao presente"*, *"Not present"*, *"Sem presença"* | **INVERTE** | `absence` (`NEGATIVE`) | **Inequívoca.** Em diários escolares, uma coluna "Não compareceu" equivale operacionalmente a "Falta". Inverte para ausência permitindo automação de alta confiança. |
| **Negação de Ausência** | *"Não faltou"*, *"Sem falta"*, *"Not absent"*, *"No absence"* | **RECUSA** (Fail-Closed) | `null` (`AMBIGUOUS`) | **Ambiguidade de Controle vs. Filtro.** Expressões frequentemente usadas em filtros ou contadores agregados, não em marcação pontual. |
| **Dupla Negação / Negação Composta** | *"Não ausente"*, *"Not not present"*, *"Sem falta de presença"* | **RECUSA** (Fail-Closed) | `null` (`AMBIGUOUS`) | **Sobrecarga Sintática & Risco de Erro.** Construções anômalas no DOM que geram incerteza inaceitável. |
| **Termos Agregados / Contadores** | *"Total de faltas"*, *"Total de presenças"*, *"Total"* | **RECUSA** (Fail-Closed) | `null` (`AMBIGUOUS`) | Não são campos booleanos transacionais de lançamento individual por aluno. |

---

## 3. Justificativa Detalhada da Inversão em Negações Simples de Presença

### 3.1. Equivalência Semântica
Na língua portuguesa e inglesa, o oposto direto de "presente" / "compareceu" precedido por partícula negativa ("não" / "not" / "sem") é a ausência:
$$\neg (\text{Presença}) \equiv \text{Ausência}$$
Portanto:
- Se a intenção do professor for `PRESENCA` e o controle indicar *"Não compareceu"*, `shouldBeChecked` resulta em `false`.
- Se a intenção do professor for `FALTA` e o controle indicar *"Não compareceu"*, `shouldBeChecked` resulta em `true`.

### 3.2. Preservação da Camada 2 (Descoberta Autônoma)
Recusar termos óbvios como *"Não compareceu"* rotulando-os como ambíguos degradaria a experiência pedagógica ao transferir para o professor a tarefa manual de confirmação (Camada 3). O princípio fail-closed protege contra dúvida real; havendo clareza lexical, resolve com segurança.

---

## 4. Salvaguardas Implementadas em Código (`attendancePolarity.js`)

1. **Precedência da Regra de Ambiguidade (Regra 0)**:
   Expressões de negação de ausência (`ambiguousRegex`) são testadas *antes* da regra de negação simples (`negationRegex`), impedindo que termos como *"sem falta"* ou *"não faltou"* caiam por engano na regra de inversão.
2. **Normalização de Pontuação e Acentos**:
   Hífens e pontuações são convertidos em espaços antes da análise com limites estritos de palavra (`\b`), impedindo vazamento de radicais em palavras compostas (ex.: *"pre-sente"*, *"rua asfaltou"*, *"representante"*).
3. **Detecção de Conflitos Cruzados**:
   Se um cabeçalho indicar presença e um `aria-label` indicar ausência, o resolvedor emite `polarity: 'CONFLICT'` e `canResolve: false`.
