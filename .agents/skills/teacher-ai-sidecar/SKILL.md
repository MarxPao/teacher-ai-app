---
name: teacher-ai-sidecar
description: >-
  Manage, run, debug, and extend the Python Sidecar server for Teacher AI, handling NLU intent parsing, PII redaction, ReAct agentic execution loop, and WebSocket/CDP bridge.
---

# Teacher AI — Python Sidecar Runbook

Este skill orienta a operação, ciclo de vida e manutenção do servidor Sidecar em Python (`sidecar/`).

## 1. Visão Geral dos Componentes do Sidecar

```text
sidecar/
├── manual_runner.py           # Servidor principal (HTTP :8000 e WebSocket :8765)
├── agentic_execution_loop.py  # Loop ReAct agêntico com injeção de contexto estrutural
├── intent_parser.py           # NLU: extração de intenções, preenchimento de slots e regex offline
├── sanitizer.py               # Máscara de PII e proteção de dados LGPD (Trilho 1 vs Trilho 2)
├── capability_router.py       # Roteamento inteligente de capacidade por complexidade de modelo
├── portal_structure_mapper.py # Mapeamento incremental de portais e extração de tabelas/cards
├── portal_map_store.py        # Armazenamento e invalidação de SkillGraphs (Camada 1)
└── tests/                     # 40 arquivos de teste com 294 casos coletados via Pytest
```

## 2. Inicialização e Execução

### Como Iniciar o Sidecar
- **Via Script PowerShell / Bash:**
  ```powershell
  python sidecar/manual_runner.py
  ```
  Ou através do arquivo em lote:
  ```powershell
  .\iniciar-sidecar.bat
  ```
- **Portas Utilizadas:**
  - `HTTP 8000`: Endpoints REST (`/portal_status`, `/natural_intent`, `/execute_task_intent`).
  - `WebSocket 8765`: Canal bidirecional de comunicação em tempo real com a extensão Chrome.

### Verificação de Saúde (Health Check)
Para verificar se o sidecar está respondendo:
```powershell
curl http://127.0.0.1:8000/portal_status
```
Resposta esperada:
```json
{
  "status": "ready",
  "portals_mapped": 4,
  "cdp_connected": false
}
```

## 3. Fluxo de Intenção e Contingência Offline (`intent_parser.py`)

1. **Tentativa 1 — Regex Determinístico Offline:**
   - Detecta comandos de lançamento de notas, faltas, navegação e abertura de perfil de alunos sem necessidade de internet ou chaves de API.
   - Preserva total privacidade: dados de alunos não saem da máquina.
2. **Tentativa 2 — Inferência Local Ollama (Trilho 1 - LGPD):**
   - Se o comando contiver PII e o regex for insuficiente, despacha para o modelo local `ollama/qwen` ou `ollama/mistral`.
3. **Tentativa 3 — Modelos em Nuvem (Trilho 2 - Apenas Ações Sem PII):**
   - Somente ordens estruturais sem dados pessoais são enviadas para Groq (`openai/gpt-oss-120b`) ou Gemini Flash.

## 4. Loop ReAct Agêntico (`agentic_execution_loop.py`)

- **Ferramentas Disponíveis ao Agente:**
  - `detect_state`: Lê a página ativa e identifica se há tabela, cards ou formulário.
  - `answer_from_screen_data`: Responde a perguntas do professor (ex: "quantos alunos faltaram hoje?") lendo os dados raspados da tela sem acionar cliques.
  - `fill_field`: Preenche inputs com digitação sequencial e validação contra o DOM.
  - `click_element`: Aciona elementos garantindo destaque visual prévio.
  - `ask_clarification`: Faz perguntas pedagógicas de desambiguação se faltarem dados essenciais.
