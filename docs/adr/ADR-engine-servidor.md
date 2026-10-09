# ADR 005 — Arquitetura de Execução do Engine de Provas: Cliente vs. Servidor

- **Status:** Proposto (Lote C — Documento de Projeto Arquitetural)
- **Data:** 2026-10-09
- **Autores:** Engenharia Teacher AI (Branch `fix/engine-provas`)
- **Decisores:** Rafael / Product Owner e Auditor do Projeto Teacher AI
- **Contexto de Origem:** Auditoria do Engine de Provas (Lotes 1, 2, A e B)

---

## 1. Contexto e Problema de Engenharia

O motor de geração de provas do Teacher AI opera atualmente através de **chamadas diretas do navegador** do usuário para APIs de LLM externas (`executeUnifiedAiCall` em `lib/autoApiSelector.ts`), adotando um modelo *Bring Your Own Key* (BYOK) onde as credenciais são armazenadas no `localStorage` do professor (`"teacher_apis"`).

A auditoria dos Lotes 1 e 2 e os testes de segurança do Lote A/B evidenciaram vulnerabilidades e limitações técnicas críticas desse modelo puramente cliente:

1. **Vulnerabilidade de Segurança em Rede (Severidade ALTA - Detectada em T4):**
   Em `lib/autoApiSelector.ts:245`, a chave de API do Google Gemini é transmitida via query string:
   `https://generativelanguage.googleapis.com/v1beta/models/...:generateContent?key=${key}`
   URLs com chaves expostas trafegam em logs de proxies corporativos/escolares, CDNs, histórico de navegadores e referrers HTTP. A documentação oficial do Google Cloud recomenda tráfego restrito via cabeçalho HTTP (`x-goog-api-key`).
2. **Uso de Cabeçalho de Risco no Cliente:**
   As chamadas diretas para a API da Anthropic exigem o envio do cabeçalho `'anthropic-dangerously-allow-browser': 'true'`, um anti-padrão desaconselhado que anula as políticas de segurança de CORS da API.
3. **Incapacidade de Proteção contra SSRF e Extração Web:**
   No navegador, é impossível efetuar busca e extração de fontes com DNS pinning e bloqueio de redes privadas (RFC 1918 / Loopback), expondo a aplicação a riscos de Server-Side / Client-Side Request Forgery caso links externos sejam processados.
4. **Ausência de Provenance Criptográfica Imutável:**
   Fontes bibliográficas não podem ser baixadas, validadas com hash SHA-256 e arquivadas com carimbo de tempo seguro sem uma camada de backend.
5. **Falta de Auditoria e Reprodutibilidade de Execução:**
   Não há registro centralizado e imutável de `promptHash`, temperatura, versão do schema (`examSchema_v2`) e log estruturado de execuções.
6. **Fragilidade de Resiliência (503 / 429):**
   O navegador possui limites severos de concorrência e gerenciamento de conexões; quedas transitórias (HTTP 503) e limites de taxa (HTTP 429) resultam em falha imediata na tela do professor em vez de retry com backoff exponencial resiliente.

Este ADR avalia comparativamente três arquiteturas para a evolução do engine de geração e validação de avaliações.

---

## 2. Comparação das Três Opções de Arquitetura

### Opção 1: Manter BYOK Puro no Navegador (Status Quo Endurecido)
*O navegador continua chamando as APIs de IA diretamente, mas corrige-se a URL do Gemini e encapsulam-se as chamadas com cabeçalhos adequados.*

- **O que habilita:**
  - Custo zero de infraestrutura de servidor para inferência (o servidor só serve HTML/JS estático).
  - Soberania total do professor sobre sua cota.
- **O que NÃO habilita (Limitações Intransponíveis):**
  - **Zero proteção SSRF:** Impossível inspecionar IPs e fazer DNS pinning a partir do sandbox do navegador.
  - **Sem RAG factual externo seguro:** O navegador não pode contornar CORS de portais acadêmicos ou governamentais para verificar referências bibliográficas sem proxies terceiros inseguros.
  - **Sem segunda passada independente:** Realizar uma segunda passada completa no navegador multiplica por 2 o tempo de bloqueio de conexão e expõe chaves extras no DevTools.
  - **Logs voláteis:** Logs residem no `localStorage` do professor; se o cache for limpo, o histórico de auditoria psicométrica e parâmetros desaparecem.
  - **Header inseguro:** A Anthropic continuará exigindo `'anthropic-dangerously-allow-browser': 'true'`.

---

### Opção 2: Camada Fina de Servidor Mantendo BYOK (Recomendada)
*Uma rota de API Next.js stateless (`/api/exam/pipeline`) atua como gateway de execução. O navegador envia o payload da prova e a chave do provedor no cabeçalho HTTP criptografado (TLS/HTTPS). A chave NUNCA é persistida no banco do servidor; ela é usada estritamente em memória durante o ciclo da requisição e descartada imediatamente.*

- **O que habilita:**
  - **Fim das chaves em URLs:** O gateway do servidor despacha chamadas com cabeçalhos estritos (`x-goog-api-key` para Gemini, `Authorization: Bearer` para OpenAI/DeepSeek, `x-api-key` para Anthropic sem `'anthropic-dangerously-allow-browser'`).
  - **Proteção contra SSRF e Allowlist de URLs:** Extração de fontes com validação prévia de IP (bloqueio de `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254` de metadados AWS/GCP).
  - **Provenance Criptográfica Real:** O servidor calcula o hash SHA-256 do texto de referência ou do arquivo fornecido e carimba data/hora ISO 8601 imutável no nó `provenance` da questão.
  - **Fact-Check com Recuperação (RAG de 2 Etapas):** O servidor divide conteúdos longos em partes consistentes, recupera contexto factual e valida sem truncamento arbitrário.
  - **Dual-Pass Gatekeeper (G5 e G6):** Possibilidade de usar um segundo modelo rápido e independente para auditar os gabaritos da prova antes de devolver a resposta ao cliente.
  - **Log Estruturado de Execução:** Emissão de log auditável com `{ promptHash, provider, model, temperature, schemaVersion, haladynaVersion, latencyMs, tokensUsed }` sem registrar PII de professores ou alunos.
  - **Retry Resiliente com Backoff Exponencial:** Tratamento nativo no backend para erros 503 e 429 com jitter, imperceptível para o usuário final.
- **Soberania do Professor:** A chave continua sendo do professor; a escola ou a plataforma não assume custo de inferência por token.

---

### Opção 3: Servidor com Chaves Gerenciadas (SaaS Centralizado)
*O backend do Teacher AI mantém chaves corporativas mestras centralizadas em variáveis de ambiente protegidas (`GEMINI_API_KEY`, `OPENAI_API_KEY`). O professor não fornece nenhuma chave; a autenticação na plataforma concede cotas de geração.*

- **O que habilita:**
  - Todas as capacidades da Opção 2.
  - Experiência de usuário sem atrito: o professor não precisa criar contas no Google AI Studio, Anthropic Console ou OpenAI, nem cadastrar cartões de crédito internacionais.
  - Controle rígido de modelos, temperaturas e caching semântico centralizado (ex: Redis / LiteLLM proxy), reduzindo chamadas duplicadas para o mesmo tópico pedagógico em 35%.
- **Desafios e Trade-offs:**
  - Custo operacional direto em faturas de nuvem da IA absorvido pela mantenedora da plataforma.
  - Necessidade de sistema de cotas, rate limits por escola/professor e proteção contra abuso ou scraping.

---

## 3. Matriz Comparativa Detalhada

| Critério de Arquitetura | Opção 1: BYOK no Navegador | Opção 2: Camada Fina Servidor (BYOK) | Opção 3: Servidor Gerenciado |
| :--- | :---: | :---: | :---: |
| **Segurança de Chaves (Zero URL Query)** | ❌ Frágil (exposta na query) | ✅ Total (Headers HTTPS transitórios) | ✅ Máxima (Chaves não saem do servidor) |
| **Eliminação de Headers Perigosos** | ❌ Exige `dangerously-allow-browser` | ✅ Eliminado no backend | ✅ Eliminado no backend |
| **Inspeção de Rede e Bloqueio SSRF** | ❌ Impossível no browser | ✅ Suportado via allowlist/DNS pinning | ✅ Suportado via allowlist/DNS pinning |
| **Auditoria Criptográfica de Fontes** | ❌ Hash volátil | ✅ SHA-256 e timestamp imutáveis | ✅ SHA-256 e timestamp imutáveis |
| **Fact-Check Integral em Partes** | ⚠️ Instável por timeout do browser | ✅ Pipeline assíncrono em chunks | ✅ Pipeline assíncrono com caching |
| **Segunda Passada de Gabarito (Dual-Pass)** | ❌ 2x latência no frontend | ✅ Execução paralela server-side | ✅ Execução paralela com proxy |
| **Retry com Backoff em 503/429** | ⚠️ Básico / bloqueia UI | ✅ Resiliente com jitter | ✅ Resiliente com fallback de provedor |
| **Custo de Infraestrutura de IA** | R$ 0,00 (pago pelo docente) | R$ 0,00 (pago pelo docente) | Fatura centralizada da plataforma |
| **Complexidade de Migração** | Nenhuma | Baixa (1 rota API Next.js) | Alta (requer controle de cotas/billing) |

---

## 4. Estimativa de Chamadas e Custos por Avaliação

Cenário Base: Geração de uma avaliação de **10 questões de múltipla escolha** estruturadas segundo a matriz BNCC/Bloom:

| Fluxo de Execução | Nº de Chamadas de LLM | Entrada Média (Tokens) | Saída Média (Tokens) | Custo Estimado (Gemini 2.5 Flash - BYOK) | Custo Estimado (Claude 3.5 Sonnet - BYOK) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Fluxo Normal (Geração + Gate 1-4 Local)** | 1 chamada | ~1.800 tokens | ~2.500 tokens | ~$0.0007 USD | ~$0.043 USD |
| **Fluxo Completo (+ Fact-Check RAG em 2 partes)** | 3 chamadas | ~5.000 tokens | ~3.200 tokens | ~$0.0016 USD | ~$0.068 USD |
| **Fluxo Blindado (+ Dual-Pass Gabarito com 2º Modelo)** | 4 chamadas | ~7.200 tokens | ~4.000 tokens | ~$0.0024 USD | ~$0.092 USD |

*Observação Psicométrica:* Com modelos de alta velocidade e baixo custo como o **Gemini 2.5 Flash**, o custo do fluxo blindado completo permanece abaixo de **$0.01 USD (menos de R$ 0,06 por prova completa)**, tornando a verificação factual e psicométrica economicamente acessível mesmo no modelo BYOK.

---

## 5. Hospedagem e Infraestrutura (Next.js 16 + Vercel)

Conforme mapeado na Etapa 0.4 (`audit/engine-provas-etapa0.md`):
- O repositório utiliza **Next.js 16.2.12** com React 19 e configuração de deploy para **Vercel** (`vercel.json`).
- As rotas de backend são implementadas como **Route Handlers** em `app/api/.../route.ts`.

### Restrições da Vercel e Estratégia de Mitigação de Timeouts:
- **Plano Vercel Hobby:** Limite padrão de 15 segundos de timeout para Serverless Functions.
- **Plano Vercel Pro:** Limite configurável de até 300 segundos.
- **Arquitetura Recomendada:**
  1. Para geração de lote grande (20 questões com verificação completa), a rota `/api/exam/generate` deve adotar **Server-Sent Events (SSE) / Streaming**:
     - O backend valida a estrutura e emite cada questão conforme é gerada e aprovada pelos portões;
     - O streaming contorna o timeout de 15 segundos da Vercel porque o primeiro byte (TTFB) é enviado em menos de 1,5s;
     - Alternativamente, a função pode ser configurada com `export const runtime = 'nodejs'` e `export const maxDuration = 60` no plano Pro.

---

## 6. LGPD e Proteção de Dados de Alunos Menores (Dois Trilhos)

A conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - Art. 14, que rege dados de crianças e adolescentes) é mandatória.

### Arquitetura de Dois Trilhos Aplicada ao Engine:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TRILHO 1 — ESTREITAMENTE LOCAL (Navegador / Memória da Máquina do Professor)  │
│ - Identidade do Aluno: Nomes completos, CPFs, fotos, matrículas              │
│ - Notas Individuais: Notas lançadas no Gradebook ou detectadas no OMR        │
│ - Ocorrências: Apontamentos comportamentais e registros de vulnerabilidade   │
│                                                                             │
│ [Mecanismo de Agregação e Anonimização Local]                                │
│   Mariana Lima (Nota 4.0 em Mitose) ──┐                                     │
│   João Santos  (Nota 3.5 em Mitose) ──┼──> "Turma 8A: Taxa de acerto 37.5%  │
│   Pedro Souza  (Nota 8.0 em Mitose) ──┘    na habilidade EF08CI02"          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼ (Somente dados agregados sem PII)
┌─────────────────────────────────────────────────────────────────────────────┐
│ TRILHO 2 — SERVIÇO EM NUVEM / GATEWAY DO SERVIDOR                            │
│ - Prompt de Geração: Envia apenas código BNCC, tópico e taxa agregada        │
│   Exemplo: "Gere 3 questões de reforço focadas em Mitose para uma turma     │
│             com 62% de lacuna na habilidade EF08CI02."                      │
│ - ZERO nomes, ZERO identificadores únicos, ZERO dados de menores trafegados  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Regras Invioláveis do Gateway:
1. **Sanitizador Pré-Egress:** Antes de qualquer requisição sair do backend para o provedor de IA, um linter de PII determinístico audita o payload. Se qualquer padrão compatível com CPF, e-mail de aluno ou nome mapeado no banco local for detectado, a requisição é **bloqueada imediatamente**.
2. **Sem Armazenamento de Identidade em Logs:** Os logs do servidor registram apenas `school_id` anônimo, `timestamp`, `tokens` e `promptHash`. Nenhum dado pessoal é persistido em tabelas de auditoria de IA.

---

## 7. Estratégia de Migração Incremental (Sem Quebra de Produção)

Para preservar a estabilidade da aplicação durante a transição:

1. **Fase 1 (Atual — Lote A e B):**
   - O cliente permanece como motor de geração, mas utiliza os novos portões determinísticos de `lib/examGates.ts` e o contrato estrito `lib/examSchema.ts`.
   - Correção imediata do envio de chave em query string em `lib/autoApiSelector.ts` (passando a usar headers HTTP adequados).
2. **Fase 2 (Introdução da Rota Gateway):**
   - Criação de `app/api/exam/pipeline/route.ts` implementando a Opção 2.
   - O frontend recebe uma feature flag configurável em `Settings.tsx` / `ApiManager.tsx`:
     `[x] Usar Gateway Seguro de Servidor (Recomendado)` com fallback transparente para chamada local se o servidor estiver indisponível.
3. **Fase 3 (Ativação de G5 e G6 no Servidor):**
   - Com o gateway estabelecido, ativam-se o Fact-Check em partes com allowlist e a segunda passada de gabarito independente.

---

## 8. Recomendação Técnica Oficial

A recomendação técnica da engenharia é a adoção da **Opção 2: Camada Fina de Servidor Mantendo BYOK**, pelas seguintes razões fundamentadas:

1. **Segurança OWASP Imediata:** Elimina a vulnerabilidade de chave em URL (T4) e extingue o cabeçalho `dangerously-allow-browser`, estabelecendo canais TLS seguros via headers restritos.
2. **Custo Zero de Licenciamento de IA para o Projeto:** Preserva o modelo sustentável BYOK sem onerar a infraestrutura do projeto com faturas de API dos usuários.
3. **Viabilidade dos Portões Avançados (G5 e G6):** Habilita validação factual segura contra SSRF e verificação de gabaritos em duas etapas que seriam inviáveis no sandbox do navegador.
4. **100% Compatível com a LGPD:** O isolamento em Dois Trilhos assegura que o servidor apenas orquestre prompts estruturais anonimizados, mantendo todos os dados de menores no controle local do docente.

---

## 9. Decisões que Dependem do Product Owner / Usuário

Para o planejamento dos passos posteriores ao Lote C, solicitam-se as seguintes decisões formais:

1. **Modelo de Gateway:** Você aprova a criação da rota fina de backend (`/api/exam/pipeline`) mantendo o modelo BYOK (Opção 2)?
2. **Estratégia de Fallback:** Se a rota do servidor falhar por timeout de conexão em redes escolares instáveis, o app deve tentar fallback para chamada direta do navegador ou bloquear com aviso amigável?
3. **Dual-Pass no Gabarito (G5):** No futuro portão G5, o segundo modelo auditor deve ser configurável pelo professor (ex: professor gera com Gemini e audita com DeepSeek/Claude) ou deve usar um modelo padrão fixo?
