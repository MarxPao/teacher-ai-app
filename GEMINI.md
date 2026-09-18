# Regras de Desenvolvimento e Diretrizes do Projeto (Teacher AI)

## 1. Princípio Fundamental de Rigor e Evidência
- **Nunca afirmar sem provar:** Nenhuma correção de bug, nova funcionalidade ou refatoração deve ser dada como "concluída" sem uma execução real de teste colando o output literal do terminal (código de saída, stdout e stderr).
- **Fim da Validação Circular:** Testes automatizados contra mocks locais em memória (como `page.set_content()`) devem **sempre declarar explicitamente** sua origem como mock estático. Jamais apresentar um teste em mock local como prova de funcionamento contra o portal real de produção (`machadosobrinho.paineldoaluno.com.br` ou outros). A validação final de portais reais exige observação ao vivo ou HTML real capturado pelo usuário.
- **Auditoria de Testes (Pytest vs Unittest):** A suíte de testes do sidecar (`sidecar/tests/`) utiliza convenções do **Pytest** (`def test_*`, testes assíncronos e fixtures) totalizando mais de 290 testes. **Nunca** use `python -m unittest discover` como métrica de contagem total da suíte, pois o runner padrão do unittest descobre apenas as 5 classes herdadas de `unittest.TestCase` (46 testes). O comando canônico é:
  ```powershell
  python -m pytest sidecar/tests -q
  ```

## 2. Privacidade, LGPD e Roteamento de PII
- **Arquitetura de Dois Trilhos:**
  - **Trilho 1 (Com PII / Dados de Alunos):** Nomes completos, CPFs, notas individuais, observações comportamentais e fotos **nunca** devem ser enviados para APIs em nuvem (Groq, OpenAI, Gemini). Devem ser processados estritamente localmente (regex determinístico, scripts em memória ou Ollama local).
  - **Trilho 2 (Sem PII / Ações Estruturais):** Navegação entre abas, seleção de filtros e leitura de rótulos de menus podem utilizar inferência rápida em nuvem quando necessário.
- **Sanitização Obrigatória:** Antes de qualquer log ou envio de dados estruturais, campos de alunos devem ser mascarados (ex: `Mariana Lima` -> `Mariana L.`, CPFs -> `[CPF_PROTEGIDO]`).

## 3. Arquitetura do Motor de Descoberta (3 Camadas)
1. **Camada 1 — Cache Determinístico (SkillGraph / MapStore):**
   - Antes de qualquer exploração, consulta `sidecar/portal_structure_maps/<portal_id>.json`. Se houver seletores salvos e válidos com alta confiança, executa em milissegundos sem custo de LLM.
2. **Camada 2 — Descoberta Autônoma Multi-Step (Extensão + Sidecar):**
   - `DISCOVERY_SELECT_FILTER`: Sub-navegação em botões e abas horizontais com matching bidirecional de strings (ex: "recados recebidos" clica na sub-aba correspondente).
   - `DISCOVERY_FIND_AND_CLICK_STUDENT`: Localização hierárquica em grids de cards de alunos com **scroll vertical incremental** no container rolável, busca folha do botão de ação ("Ver perfil") e **detecção honesta de ambiguidade** (homônimos retornam modal com foto, turma e matrícula sem adivinhar).
3. **Camada 3 — Overlay Aponte-e-Clique (Humano no Circuito):**
   - Se a exploração autônoma não encontrar o elemento com alta confiança, ativa a camada de overlay visual na tela do professor para gravação guiada da habilidade sem comandos complexos.

## 4. Comunicação Amigável com o Professor (Zero Jargão)
- O side panel da extensão e o assistente de voz devem se comunicar em linguagem natural, acolhedora e pedagógica.
- **Proibido expor ao professor:** Códigos HTTP (ex: 500, 404), stacktraces de exceção, seletores CSS/XPath, nomes de classes técnicas (`DISCOVERY_FIND_AND_CLICK_STUDENT`, `CDPError`, `NullPointerException`).
- Em caso de falha técnica, traduzir para orientações claras e de apoio (ex: *"Não consegui encontrar a Alice nesta lista. Pode verificar se estamos na turma certa? ✨"*).

## 5. Estrutura de Arquivos Canônica
- `sidecar/`: Backend Python com `manual_runner.py` (porta HTTP 8000 e WebSocket 8765), `agentic_execution_loop.py`, `intent_parser.py`, `portal_structure_mapper.py`, `portal_map_store.py`.
- `teacher-extension/`: Extensão Google Chrome Manifest V3 (`side_panel.html`, `side_panel.js`, `background.js`, `content.js`).
- `.agents/skills/`: Skills especializadas para orquestração, testes e automação do agente.
