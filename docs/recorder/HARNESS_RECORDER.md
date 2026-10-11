# Guia de Operação do Gravador e Tela de Revisão (Harness)

Este documento descreve a operação do ambiente de desenvolvimento e testes do Gravador e Compilador de SkillGraph v2 (`tools/runner-harness/`).

---

## 1. Visão Geral

O harness do Teacher AI fornece um ambiente autônomo e local para execução, gravação, revisão pedagógica e compilação determinística sem dependência do ambiente Chrome MV3.

### Funcionalidades Disponíveis
1. **Aba "Executar (Runner)"**:
   - Execução passo a passo ou contínua de grafos sintéticos v2.
   - Inspeção de variáveis mascaradas por LGPD.
   - Trilha de auditoria em tempo real.
2. **Aba "Gravar & Revisar"**:
   - Injeção sob demanda do `DomRecorder` sobre o documento do iframe (`fixtureFrame.contentDocument`).
   - Barra de overlay flutuante em Shadow DOM fechado com contagem de passos e botões de marcação.
   - Captura interativa em modo aponta-e-clica (`PickMode`) para tabelas e paginação.
   - Formulário de decisões pedagógicas da professora (`ReviewView`).
   - Botão **"Compilar Grafo"** com feedback imediato.
   - Botão **"Verificar Replay (Dry-Run)"** usando o `SkillGraphRunner` sobre a página viva.
   - Botão **"Salvar no Repositório"** com controle de versões imutáveis (`MemorySkillGraphRepository`).
   - Botões de carga rápida dos 4 traces dourados canônicos (`read_roster`, `lancar_falta`, `lancar_nota`, `login`).

---

## 2. Como Executar o Harness

1. Construir o bundle do harness:
   ```powershell
   npm run harness:build
   ```
2. Iniciar o servidor HTTP local do harness:
   ```powershell
   npm run harness
   ```
3. Acessar no navegador: `http://localhost:8899/tools/runner-harness/index.html`.

---

## 3. Fluxo de Gravação e Revisão Passo a Passo

1. **Selecionar Fixture**:
   - Escolha o cenário desejado no dropdown (ex.: `standard.html`, `portal_com_login.html`, `portal_com_abas.html`).
2. **Iniciar Gravação**:
   - Clique em **"Gravar & Revisar"** no cabeçalho e em seguida em **"🔴 Iniciar Gravação no Fixture"**.
   - A barra flutuante preta surgirá na base do iframe.
3. **Interagir no Portal**:
   - Preencha campos ou marque checkboxes. O gravador captura em capture phase com anti-keylogger estrito (agrupamento no blur/change, sem gravar digitação tecla a tecla).
   - Utilize **"Marcar Tabela"** para apontar e clicar na tabela de alunos da turma.
   - Utilize **"Marcar Próxima"** para registrar o botão de próxima página.
4. **Concluir Gravação**:
   - Clique em **"Concluir"** na barra do iframe ou em **"⏹ Parar Gravação"** no harness.
5. **Revisar e Compilar**:
   - O `ReviewView` abrirá automaticamente exibindo as decisões inferidas (`analyzeTrace`).
   - Confirme a coluna chave de aluno, polaridade de presença/falta e tarefa.
   - Clique em **"⚙ Compilar Grafo"**.
6. **Replay de Verificação**:
   - Clique em **"🔄 Verificar Replay (Dry-Run)"**. O runner validará a execução de todos os nós em memória sem aplicar mutações reais no DOM.
7. **Persistência**:
   - Clique em **"💾 Salvar no Repositório"** para arquivar o grafo compilado.
