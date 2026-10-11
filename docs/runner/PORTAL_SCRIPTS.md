# Roteiros de Execução: Portais Sintéticos P1 e P2 (PORTAL_SCRIPTS.md)

Este documento define os roteiros padronizados para execução do ciclo completo **(Gravar → Revisar → Compilar → Verificar → Rodar sem LLM)** nos portais de teste sintéticos P1 (Moderno) e P2 (Legado).

---

## 1. Portal Sintético Moderno (P1: SPA, Scroll Infinito e DOM Reativo)

### Fixtures Recomendadas:
- Servidor: `http://127.0.0.1:8898`
- URLs:
  - Roster com scroll: `http://127.0.0.1:8898/fixtures/archetypes/infinite-scroll.html`
  - Abas e reatividade: `http://127.0.0.1:8898/fixtures/portal_com_abas.html`
  - Tabela reativa padrão: `http://127.0.0.1:8898/fixtures/standard.html`

---

### Roteiro 1.1: `read_roster` (Leitura da Lista de Alunos)
1. **Gravação:**
   - Abra a fixture no navegador com a extensão ativada.
   - No painel da extensão, inicie a gravação da tarefa `read_roster`.
   - Se houver container com rolagem infinita, faça a rolagem lenta até que todos os itens carreguem.
   - Clique em uma linha da tabela ou inspecione o roster.
   - Finalize a gravação.
2. **Decisões na Tela de Revisão:**
   - Tipo de Operação: `Leitura de Tabela` (`READ_TABLE`).
   - Identificação de Linha: `name_contains` sobre o nome dos alunos.
   - Colunas Detectadas: Confirme `Nome` e `Matrícula` (ignore colunas auxiliares de botões).
3. **Execução e Resultado Esperado:**
   - **Dry-Run:** Executa em milissegundos; o painel exibe a lista completa de alunos mascarada por LGPD (`Mariana L.`, etc.).
   - **Execução Real:** Conclui com sucesso, 0 chamadas de LLM, 0 escritas no DOM.

---

### Roteiro 1.2: `lancar_falta` (Marcação de Faltas com Polaridade)
1. **Gravação:**
   - Inicie a gravação no painel.
   - Localize o aluno de teste `"Zeca Canário"`.
   - Clique no controle de presença/falta (checkbox ou botão alternador).
   - Encerre a gravação.
2. **Decisões na Tela de Revisão:**
   - **Polaridade:** Confirme se o clique significa *Ausência* (Marcado = Falta) ou *Presença* (Marcado = Presente).
   - **Checkpoint:** Marque como obrigatório antes da persistência (`scope: once` ou `per_iteration`).
   - **Readback:** Habilitado (verificar se o estado do controle permaneceu após o clique).
3. **Execução e Resultado Esperado:**
   - **Teste A (Dry-Run):** O runner simula o fluxo completo. O checkbox NÃO é marcado na tela. Evento `write_performed (dryRun: true)`.
   - **Teste B (Rejeição de Checkpoint):** Dispare a execução real. Quando surgir o modal de checkpoint humano, clique em **Cancelar**. O runner deve abortar imediatamente com `E_INTERRUPTED` e **zero escritas** aplicadas.
   - **Teste C (Execução Real Aprovada):** Dispare novamente e clique em **Aprovar e Gravar**. O checkbox é marcado no DOM, o read-back valida o estado e o log de auditoria registra a ação.

---

### Roteiro 1.3: `lancar_nota` (Preenchimento de Notas com Auto-formatação)
1. **Gravação:**
   - Inicie a gravação.
   - No campo de nota do aluno de teste, digite o valor `"8.5"` e dispare a saída de foco (Tab ou clique fora para acionar `blur`).
   - Finalize a gravação.
2. **Decisões na Tela de Revisão:**
   - **Escala de Avaliação:** 0.0 a 10.0 (passo 0.1).
   - **Pós-condição:** Ausência de mensagens de erro de validação (classe `.error` ou `.invalid`).
3. **Execução e Resultado Esperado:**
   - O runner aplica a digitação assistida com eventos `input` e `change`.
   - Read-back confere que o valor permanece `"8.5"`.
   - Caso um valor fora de escala (ex: `"15.0"`) seja passado como variável, o runner recusa preventivamente com `E_VALUE_OUT_OF_SCALE`.

---

## 2. Portal Sintético Legado (P2: Frames, Cabeçalhos Complexos e Wizard)

### Fixtures Recomendadas:
- Servidor: `http://127.0.0.1:8898`
- URLs:
  - Wizard multi-etapas: `http://127.0.0.1:8898/fixtures/holdout/wizard.html`
  - Cabeçalhos de 2 linhas: `http://127.0.0.1:8898/fixtures/holdout/two_row_headers.html`
  - Iframe cross-origin: `http://127.0.0.1:8898/fixtures/holdout/cross_origin_iframe.html`

---

### Roteiro 2.1: `read_roster` (Tabela com Cabeçalho Multinível e Iframe)
1. **Gravação:**
   - Abra `cross_origin_iframe.html` ou `two_row_headers.html`.
   - Ao iniciar, o `RemoteDriver` inspeciona os frames da página. Se houver iframe em `localhost:8898`, conceda a permissão pontual ao ser solicitado.
   - Interaja com a tabela de alunos e finalize.
2. **Decisões na Tela de Revisão:**
   - Seletor de cabeçalho: Descarte a linha de agrupamento genérica (`Dados Pessoais`) e fixe as colunas filhas reais (`Matrícula`, `Nome do Aluno`).
   - Frame alvo: Confirme o frame correto listado pelo ID estrutural.
3. **Execução e Resultado Esperado:**
   - Leitura precisa dos dados do frame sem colisão com a página pai.

---

### Roteiro 2.2: `lancar_falta` (Fluxo Assistido estilo Wizard)
1. **Gravação:**
   - Abra a fixture `wizard.html`.
   - Etapa 1: Selecione a disciplina e clique em **Avançar**.
   - Etapa 2: Na lista de presença, marque a falta do aluno de teste e clique em **Revisar**.
   - Etapa 3: Na tela de confirmação, clique em **Finalizar Lançamento**.
   - Encerre a gravação.
2. **Decisões na Tela de Revisão:**
   - **Posicionamento do Checkpoint:** O checkpoint DEVE ser inserido estritamente antes do clique no botão "Finalizar Lançamento" da Etapa 3.
   - **Fingerprint de Etapa:** Cada transição de tela deve validar o seletor correspondente da etapa ativa.
3. **Execução e Resultado Esperado:**
   - O runner avança ordenadamente pelas etapas 1 e 2.
   - Pausa no checkpoint na etapa 3.
   - Se aprovado, conclui a submissão. Se abortado antes, não deixa escritas parciais órfãs no banco do portal.

---

### Roteiro 2.3: `lancar_nota` (Formulário Estrito em Frame Legado)
1. **Gravação:**
   - Preencha a nota e acione a validação clássica.
2. **Decisões na Tela de Revisão:**
   - Assertar pós-condição de ausência de alertas (`alert()` ou caixas de mensagem legadas).
3. **Resultado Esperado:**
   - Validação da resposta e encerramento sem bloqueios de alert.
