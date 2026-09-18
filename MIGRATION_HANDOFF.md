# Teacher AI — Documento Mestre de Transição e Migração de Contexto
**Data da Auditoria:** 18 de Setembro de 2026  
**Status do Projeto:** Estável / 294 Testes Coletados (293 Passando) / Camadas 1, 2 e 3 Implementadas  
**Repositório:** `C:\Users\rafae\Documents\antigravity\blissful-noether`

---

## 1. Visão Executiva e Estado Atual

A plataforma **Teacher AI** é um assistente pedagógico por voz e texto projetado para auxiliar professores a interagir com portais educacionais complexos (como o Machado Sobrinho, i-Educar e iDiário) sem atrito, sem jargões técnicos e em conformidade estrita com a LGPD.

### Principais Marcos Recentes:
1. **Motor de Descoberta Multi-Step (Camada 2) Consolidado:**
   - Implementado scroll vertical incremental para containers roláveis com renderização virtual de cards de alunos.
   - Implementada seleção de folhas clicáveis (botões de ação como "Ver perfil") em vez de disparar eventos no container externo.
   - Implementada **desambiguação honesta**: diante de homônimos (ex: duas alunas chamadas "Alice"), o sistema não chuta; ele exibe modal com foto, turma e matrícula para escolha da professora. Diante de nome completo único ("Alice Almeida"), o clique é direto.
2. **Correção do Bug de Sub-Navegação ("Recados Recebidos"):**
   - Comandos compostos do tipo `"abra recados e abra recados recebidos"` agora detectam a sub-navegação e selecionam a sub-aba por matching léxico bidirecional (`DISCOVERY_SELECT_FILTER`), eliminando o falso sequestro para "qual recado você deseja responder".
3. **Auditoria Rigorosa de Evidência e Integridade de Testes:**
   - Explicada a aparente divergência entre os 46 testes do `unittest` e os **294 testes coletados pelo Pytest**: nenhum teste foi deletado (`git log --diff-filter=D` limpo). O runner oficial é o `pytest`.
   - Transparência total sobre a origem dos mocks nos testes Playwright: testes locais em memória utilizam `page.set_content(html_content)` sem tocar a rede ou expor dados de alunos reais (LGPD).

---

## 2. Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                 Google Chrome (Extensão MV3)                │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │   side_panel.html/js  │       │     background.js     │  │
│  │ (Chat UI, Cards,      │◄─────►│ (Service Worker,      │  │
│  │  Decomposição Sintaxe)│       │  CDP, Camada 2 DOM)   │  │
│  └───────────────────────┘       └───────────┬───────────┘  │
│                                              │              │
│                                  ┌───────────▼───────────┐  │
│                                  │      content.js       │  │
│                                  │ (Overlay Aponte-e-    │  │
│                                  │  Clique, Destaque)    │  │
│                                  └───────────────────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │ WebSocket (porta 8765)
                               │ REST HTTP (porta 8000)
┌──────────────────────────────▼──────────────────────────────┐
│                    Sidecar Python Local                     │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │   manual_runner.py    │       │ agentic_execution_loop│  │
│  │ (Servidor FastAPI/WS) │◄─────►│ (Loop ReAct, Contexto)│  │
│  └───────────┬───────────┘       └───────────┬───────────┘  │
│              │                               │              │
│  ┌───────────▼───────────┐       ┌───────────▼───────────┐  │
│  │   intent_parser.py    │       │ portal_map_store.py   │  │
│  │ (Regex Offline/Slot)  │       │ (SkillGraphs / C1)    │  │
│  └───────────────────────┘       └───────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. O Motor de Descoberta em 3 Camadas

| Camada | Mecanismo | Onde Reside | Latência / Custo |
| :--- | :--- | :--- | :--- |
| **Camada 1: Cache SkillGraph** | Consulta determinística de seletores salvos no arquivo JSON por domínio raiz (`portal_map_store.py`). | `sidecar/portal_structure_maps/<portal_id>.json` | < 10ms / 0 LLM |
| **Camada 2: Descoberta Autônoma Multi-Step** | Exploração interativa do DOM com scroll incremental, matching bidirecional de sub-abas e desambiguação honesta. | `teacher-extension/background.js` | 100ms – 1s / 0 LLM |
| **Camada 3: Overlay Aponte-e-Clique** | Máscara visual interativa onde a professora clica no elemento para o agente aprender o seletor. | `teacher-extension/content.js` | Humano no circuito |

---

## 4. Auditoria de Fechamento de Inconsistências (Resumo Executivo)

1. **Contagem da Suíte de Testes:**
   - `python -m unittest discover -s sidecar/tests -p "test_*.py"` descobre apenas **46 testes** (as 5 classes legadas que herdam de `unittest.TestCase`).
   - `python -m pytest sidecar/tests -q` descobre **294 testes** (293 passando em 357s).
   - Zero arquivos de teste foram deletados no histórico do Git.
2. **Origem dos Mocks nos Testes Playwright:**
   - Em [`scratch/test_alice_dom_playwright.py`](file:///C:/Users/rafae/.gemini/antigravity/brain/d60df6af-6cc7-485f-9202-51dd96f22f58/scratch/test_alice_dom_playwright.py#L35-L114), a página é inicializada via `await page.set_content(html_content)`.
   - Zero tráfego de rede para servidores de produção de `paineldoaluno.com.br`.
   - Dados sintéticos protegem integralmente a privacidade dos alunos (LGPD).
3. **Bug "Recados Recebidos":**
   - O comando `"abra recados e abra recados recebidos"` foi corrigido com a flag `isSubNavCommand` no `side_panel.js` (linha 2056), despachando `DISCOVERY_SELECT_FILTER` com score 100 para o botão correto e sem falsas perguntas de esclarecimento.
4. **Desambiguação de Alunos:**
   - Termo incompleto `"Alice"`: detecta 2 alunas homônimas, retornando `status: 'ambiguous'` com fotos e turmas para escolha manual.
   - Termo completo `"Alice Almeida"`: detecta 1 aluna única, efetuando o clique direto no botão de ação ("Ver perfil") sem diálogos desnecessários.

---

## 5. Como Executar e Testar o Projeto

### A. Iniciar o Servidor Sidecar Python
```powershell
# No terminal raiz:
python sidecar/manual_runner.py
# Ou via script dedicado:
.\iniciar-sidecar.bat
```

### B. Carregar a Extensão no Google Chrome
1. Abra `chrome://extensions/` no Chrome.
2. Ative o "Modo do desenvolvedor" (Developer mode).
3. Clique em "Carregar sem compactação" (Load unpacked) e aponte para:
   `C:\Users\rafae\Documents\antigravity\blissful-noether\teacher-extension`
4. Abra o painel lateral (Side Panel) do Teacher AI.

### C. Executar a Suíte Completa de Testes
```powershell
python -m pytest sidecar/tests -q
```

### D. Executar Verificações Específicas
```powershell
# 1. Parsing semântico de intenções compostas:
python scratch/test_intent_parser_alice.py

# 2. Simulação da sub-navegação de recados:
node scratch/test_full_recados_flow.js

# 3. Teste E2E Playwright no Chrome Real:
python scratch/test_alice_dom_playwright.py

# 4. Prova comparativa de desambiguação:
python C:\Users\rafae\.gemini\antigravity\brain\d60df6af-6cc7-485f-9202-51dd96f22f58\scratch\test_alice_disambiguation_comparison.py
```

---

## 6. Skills e Regras do Antigravity Criadas

Para assegurar que o próximo agente atue com máximo rigor e contexto, foram configurados:
- **`GEMINI.md`:** Regras obrigatórias de evidência terminal, conformidade com a LGPD, proibição de validação circular e uso mandatório do Pytest.
- **`.agents/skills/teacher-ai-tester/SKILL.md`:** Runbook de testes unitários, assíncronos e Playwright no Chrome.
- **`.agents/skills/teacher-ai-discovery/SKILL.md`:** Runbook das Camadas 1, 2 e 3 do motor de descoberta.
- **`.agents/skills/teacher-ai-extension/SKILL.md`:** Runbook de manutenção da extensão Chrome Manifest V3.
- **`.agents/skills/teacher-ai-sidecar/SKILL.md`:** Runbook do servidor Python, loops ReAct e privacidade.

---

## 7. Próximos Passos Recomendados para a Nova Sessão

1. **Validação Ao Vivo com a Professora:**
   - Realizar o teste real no portal Machado Sobrinho (`machadosobrinho.paineldoaluno.com.br`) com a professora conectada, validando o comando `"acesse o perfil de alice almeida em meus alunos"`.
2. **Setup do Ollama Local para o Trilho 1:**
   - Subir o serviço do Ollama local (`ollama run qwen2.5:7b`) para cobrir a inferência offline quando houver dados sensíveis de alunos fora do padrão regex.
3. **Generalização Multi-Step N-Níveis:**
   - Estender a decomposição sintática para suportar comandos encadeados de 3 ou mais etapas (ex: `"abra turmas, selecione 6º Ano A e acesse o perfil de João"`).
