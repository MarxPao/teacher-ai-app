# Regras de Desenvolvimento e Diretrizes do Projeto (Teacher AI)

## 1. Princípio Fundamental de Rigor e Evidência
- **Nunca afirmar sem provar:** Nenhuma correção de bug, nova funcionalidade ou refatoração deve ser dada como "concluída" sem uma execução real de teste colando o output literal do terminal (código de saída, stdout e stderr).
- **Fim da Validação Circular:** Testes automatizados contra mocks locais em memória (como `page.set_content()`) devem **sempre declarar explicitamente** sua origem como mock estático. Jamais apresentar um teste em mock local como prova de funcionamento contra o portal real de produção (`machadosobrinho.paineldoaluno.com.br` ou outros). A validação final de portais reais exige observação ao vivo ou HTML real capturado pelo usuário.
- **Auditoria de Testes (Pytest vs Unittest):** A suíte de testes do sidecar (`sidecar/tests/`) utiliza convenções do **Pytest** (`def test_*`, testes assíncronos e fixtures) totalizando mais de 400 testes. **Nunca** use `python -m unittest discover` como métrica de contagem total da suíte, pois o runner padrão do unittest descobre apenas as 5 classes herdadas de `unittest.TestCase` (46 testes). O comando canônico é:
  ```powershell
  python -m pytest sidecar/tests -q
  ```
- **Proibição Absoluta de Evidência Fabricada ou Prematura:** Nenhum resultado de execução de comando (código de saída, contagem de testes passados/falhos, tempos de execução em ms, stdout ou stacktraces) pode ser escrito ou reportado antes de o processo correspondente ter de fato terminado e retornado seu código de saída. Se um comando foi enviado para background (ex.: suítes longas do sidecar, testes E2E com Playwright ou builds do Next.js), o agente deve obrigatoriamente aguardar a notificação do sistema ou consultar seu status real via `manage_task`, sendo estritamente vedado simular, prever ou estimar o resultado em blocos formatados como se fossem saídas literais do terminal. Caso uma expectativa preliminar precise ser mencionada, deve ser explicitamente rotulada como "estimativa não confirmada (processo ainda em execução)".

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


## 6. Modo Econômico de Relatório (Padrão) vs. Modo Detalhado (Sob Pedido)

Por padrão, toda resposta de implementação segue o MODO ECONÔMICO abaixo.
O modo detalhado (relatório completo com narrativa, diagramas e trace verbose)
só é usado quando explicitamente pedido ("modo detalhado", "quero o walkthrough completo").

### Modo Econômico — Estrutura Obrigatória de Resposta

1. **TL;DR (5-8 linhas máximo):** o que mudou, qual teste prova, número final
   da suíte (ex.: "413 passed, 0 failed"), qualquer risco residual conhecido.
2. **Diff do código** (ou trecho modificado com caminho + linha) — sem prosa
   explicativa ao redor além de 1 linha de contexto por bloco, se necessário.
3. **Comando de teste exato usado.**
4. **Output do teste em formato compacto:**
   - Use `pytest -q` (pontos), nunca `-v`/`-s` por padrão.
   - Para testes em TypeScript/Vitest, use formato compacto (apenas resumo final de contagem e traceback de falhas).
   - Nunca cole lista de testes que passaram. Cole apenas: (a) o resumo final
     de contagem, e (b) o traceback completo de qualquer teste que falhou.
   - Se precisar mostrar um teste específico passando como prova de um
     comportamento específico (ex.: prova de bloqueio de segurança), cole
     SÓ esse teste isolado, não a suíte inteira em modo verbose.

### Proibições no Modo Econômico

- Sem diagramas mermaid, ASCII art, ou tabelas decorativas de "arquitetura",
  a menos que pedido explicitamente.
- Sem seções como "Visão Geral", "Contexto", "Conclusão Definitiva",
  "Veredito Final" repetindo o que já foi dito no TL;DR.
- Sem recapitular a arquitetura do projeto (3 camadas, SkillGraph, Origin
  Gate, etc.) — isso já vive em `ARCHITECTURE.md`/`GEMINI.md`; referencie
  por nome de seção, não copie o conteúdo de novo.
- Sem colar de volta relatórios anteriores inteiros para "reconfirmar" —
  se algo já foi provado em uma rodada anterior e não mudou, apenas cite
  "inalterado, ver rodada anterior", não repita a evidência.

### Quando o Modo Detalhado é justificado (usar sem economia)

- Mudanças que tocam: dados de aluno/LGPD, segurança de rede (CORS/CSRF/
  auth), defesa contra prompt injection, qualquer ação com efeito colateral
  real no portal escolar (mutações, exclusões).
- Quando explicitamente solicitado pelo auditor/usuário.
- Nesses casos, o rigor de evidência não muda — continue exigindo trace
  literal completo, reexecução da suíte inteira, e testes de caso-limite,
  como já é prática estabelecida no projeto.

### Arquivo Único de Arquitetura

- Toda decisão de arquitetura (diagrama do loop de 8 passos, camadas de
  honestidade em cascata, modelo de nós hierárquicos, etc.) deve viver em
  um único arquivo (`ARCHITECTURE.md` ou seção correspondente de
  `GEMINI.md`), atualizado quando a arquitetura muda de verdade — nunca
  reproduzido por extenso dentro de uma resposta de implementação.

### Redução de Ida-e-Volta

- Ao final de uma implementação, a prova completa (trace, testes, diffs)
  fica salva em `walkthrough.md` (já é prática do projeto). A resposta
  para o usuário/auditor não precisa colar esse arquivo inteiro de volta —
  aponte o caminho do arquivo e cole apenas o TL;DR.
- Acumule pontos de dúvida/ajuste antes de pedir nova rodada de auditoria,
  em vez de uma rodada por descoberta individual, quando isso não atrasar
  uma correção de segurança urgente.

### Escolha de Ferramenta/Modelo (quando aplicável)

- Tarefas mecânicas e repetitivas (rodar suíte completa, aplicar diff já
  decidido, checar regressão) podem usar um modelo/execução mais barata.
- Reserve o modelo de raciocínio mais caro para decisão de arquitetura e
  auditoria de segurança, não para formatar output de terminal.
