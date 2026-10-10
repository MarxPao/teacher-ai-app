# Matriz de Decisão Técnica: ExamBuilder Órfão e Integração OMR → OmniGrader (A2.6)

Data: 2026-10-09  
Branch: `fix/engine-provas`  
Status: Documento de Decisão Arquitetural (Sem alteração de código de produto neste passo)

---

## 1. Contexto e Diagnóstico do Problema

Durante a auditoria da Etapa 0 (`audit/engine-provas-etapa0.md`), foi identificado que o componente `components/modules/ExamBuilder.tsx` está **100% órfão**:
- Nenhum arquivo no repositório o importa.
- O roteador principal (`app/page.tsx:102, 104`) direciona as chaves `exam`, `quick` e `test_and_worksheets` exclusivamente para `components/modules/TestAndWorksheets.tsx`.
- No entanto, `ExamBuilder.tsx` continha a lógica de integração de gabarito para correção automatizada com o leitor OMR:
  - Linhas 340-351: função `handleSaveOmrForOmniGrader` gravava a chave `teacher_omr_active_layout` no `localStorage` e disparava o evento customizado `window.dispatchEvent(new CustomEvent('teacher:navigate', { detail: 'omnigrader' }))`.
  - Em contrapartida, `components/modules/OmniGrader.tsx:173-181` escuta e consome essa mesma chave `teacher_omr_active_layout` no mount para carregar automaticamente o gabarito e alternar para a aba de Foto / OMR.

Como o `ExamBuilder` está inacessível pela interface, a transmissão automática de gabaritos para o `OmniGrader` ficou desconectada.

---

## 2. Diferenças Funcionais: ExamBuilder vs. TestAndWorksheets

| Característica | `ExamBuilder.tsx` (Legado / Órfão, 1452 linhas) | `TestAndWorksheets.tsx` + `ExamResultThreeTabs.tsx` (Ativo, 3751 linhas somadas) |
| :--- | :--- | :--- |
| **Status no Roteador** | Desconectado (0 importações no repositório). | Ativo (`app/page.tsx:102, 104`). |
| **Arquitetura de Geração** | Monolítica (Onda 1/2 inicial), sem suporte a 3 abas. | Modular (Onda 3+): gerador + `ExamResultThreeTabs` + `EditableQuestionBoxes`. |
| **Gates de Integridade e Haladyna** | Inexistentes no componente. | Integrados (`checkGenerationCompleteness`, auto-save gate, Haladyna warning). |
| **Geração de Folha OMR A4** | Modal manual (`showOmrModal`, L1312) onde o professor digita número de questões e gabarito em texto. | Botão "📄 Cartão OMR (Fiduciais)" (`ExamResultThreeTabs.tsx:981`) que gera folhas padronizadas com fiduciais direto das questões geradas. |
| **Integração com OmniGrader** | Grava `teacher_omr_active_layout` e despacha `teacher:navigate` para `omnigrader` (L347-350). | **Ponto Cego Atual:** Gera o HTML e chama `win.print()`, mas **NÃO** salva `teacher_omr_active_layout` nem despacha navegação para `omnigrader`. |

---

## 3. Matriz de Opções e Análise de Trade-Offs

### Opção (a): Religar o ExamBuilder na Rota/Menu
- **Descrição:** Adicionar `ExamBuilder` como opção no roteador (`app/page.tsx`) e na barra lateral (`Sidebar.tsx`), sob uma nova rota (ex: `/exambuilder` ou "Gerador Legado").
- **Trade-offs:**
  - *Vantagens:* Não requer nenhuma refatoração interna de código; restaura o modal original de OMR imediatamente.
  - *Desvantagens (Críticas):* Cria duplicidade prejudicial de experiência para o usuário (dois geradores de provas concorrentes). O `ExamBuilder` não possui as melhorias de confiabilidade do Lote 1, nem os portões de integridade do Lote A, nem as correções pedagógicas do Haladyna. Trata-se de reintroduzir dívida técnica e fragmentação no produto.
- **Arquivos Impactados:**
  - `app/page.tsx`
  - `components/Sidebar.tsx`
  - `components/modules/ExamBuilder.tsx`

---

### Opção (b): Migrar a Integração OMR → OmniGrader para `ExamResultThreeTabs.tsx` (Recomendada)
- **Descrição:** Manter `TestAndWorksheets` como a UI canônica de avaliação. Aproveitar que `ExamResultThreeTabs.tsx:945-983` já possui o botão "📄 Cartão OMR (Fiduciais)" e já tem todas as questões em memória (`parsedQuestions`), e:
  1. Extrair o gabarito automaticamente das questões (`parsedQuestions.map((q, i) => `${i + 1}:${q.answer}`).join(';')`).
  2. Ao clicar em gerar o Cartão OMR (ou em um botão complementar "Enviar Gabarito ao OmniGrader"), salvar `teacher_omr_active_layout` no `localStorage`.
  3. Oferecer atalho ou despachar o evento `teacher:navigate` para `'omnigrader'`.
- **Trade-offs:**
  - *Vantagens:* Unifica a experiência do professor em uma única ferramenta moderna. Elimina digitação manual de gabarito (que o modal do ExamBuilder exigia). Conecta o fluxo ponta a ponta: Geração da Prova → Impressão do Cartão OMR com fiduciais → Correção instantânea com câmera no OmniGrader.
  - *Desvantagens:* Requer pequena edição pontual em `components/ExamResultThreeTabs.tsx` (~15 a 20 linhas de código).
- **Arquivos Impactados:**
  - `components/ExamResultThreeTabs.tsx` (ou `components/modules/TestAndWorksheets.tsx`)

---

### Opção (c): Arquivar o ExamBuilder e Adiar a Integração OMR para Redesign Futuro
- **Descrição:** Mover `components/modules/ExamBuilder.tsx` para pasta de arquivo ou excluí-lo da codebase. Manter `ExamResultThreeTabs` apenas com a impressão estática da folha fiducial, sem integração com o `OmniGrader`.
- **Trade-offs:**
  - *Vantagens:* Redução imediata de 1452 linhas de código morto sem tocar em lógica existente de frontend.
  - *Desvantagens:* Mantém o loop OMR → OmniGrader quebrado para o professor até uma futura sprint de produto.
- **Arquivos Impactados:**
  - `components/modules/ExamBuilder.tsx` (remoção ou arquivamento)

---

## 4. Recomendação Técnica Fundamentada

A recomendação técnica oficial da engenharia é uma abordagem em dois tempos:

1. **Estratégia Imediata (Lote A.2 / Fase Atual):**
   - **Adotar a Opção (c) provisoriamente em termos de escopo:** Não tentar ressuscitar o `ExamBuilder` órfão na rota.
   - Deixar a decisão de implementação prática da **Opção (b)** para o lote de produto planejado (Lote B ou sprint dedicada de OMR), garantindo que a suíte de testes de aceite e a estabilização do engine de provas não sejam infladas com mudanças fora de escopo.

2. **Estratégia de Implementação (Lote B ou Próxima Sprint):**
   - Executar a **Opção (b)**: Em `components/ExamResultThreeTabs.tsx:947-964`, além de gerar o HTML para impressão, persistir `teacher_omr_active_layout` com o gabarito derivado de `parsedQuestions` e adicionar botão de navegação "Ir para Correção no OmniGrader 📸".
   - Executar a remoção/arquivamento definitivo de `components/modules/ExamBuilder.tsx`.
