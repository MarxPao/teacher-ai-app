# Postura de Segurança e Blindagem do Teacher AI (SECURITY_STATUS.md)

**Documento:** `docs/SECURITY_STATUS.md`  
**Data:** 11 de outubro de 2026  
**Status:** Consolidado (Fase 7 / Fechamento da Arquitetura)  
**Versão do Sistema:** 0.1.0 (Desktop Local-First + Chrome MV3 + Rede Comunitária Estática)

---

## 1. Resumo da Filosofia de Segurança

O Teacher AI foi projetado sob os princípios de **Local-First**, **Defesa em Profundidade**, **Privacidade por Padrão (LGPD Técnica)** e **Confiança Zero na Cadeia de Suprimentos Comunitária**. Nenhuma premissa de boa-fé é assumida: mesmo pacotes assinados digitalmente são tratados como potencialmente hostis até inspeção estática, vinculação explícita de infraestrutura e teste supervisionado em quarentena (*dry-run*).

---

## 2. Pilares de Segurança e Mecanismos Criptográficos

### 2.1. Criptografia em Repouso e Cofre do Sistema Operacional
- **SQLite Local Cifrado:** Todos os dados relacionais sensíveis (alunos, turmas, notas, auditoria e pacotes de comunidade) residem em banco local (`node:sqlite`). Colunas sensíveis utilizam criptografia de envelope AES-256-GCM com IV de 96 bits aleatório e tag de autenticação de 128 bits.
- **DEK (Data Encryption Key):** A chave de dados (256 bits) é gerada aleatoriamente no primeiro uso do aplicativo e selada pelo cofre do sistema operacional (`safeStorage` do Electron / DPAPI no Windows). A chave decifrada nunca é persistida em texto puro em disco, variáveis de ambiente ou telemetria.
- **Backups Cifrados por Senha (`.tbackup`):** A exportação de dados do usuário requer senha forte estritamente fornecida pela professora, utilizando derivação com scrypt (`N=32768, r=8, p=1`, salt de 128 bits) e cifra AES-256-GCM.

### 2.2. Isolamento de Rede e Zero Portas TCP
- **Extensão Chrome MV3 $\leftrightarrow$ App Desktop:** A comunicação é feita exclusivamente através do protocolo oficial **Chrome Native Messaging** conectado a um **Named Pipe** do Windows (`\\.\pipe\teacher-ai-desktop`).
- **Autenticação por Nonce Único:** Cada sessão de named pipe exige handshake com nonce efêmero de 256 bits gerado pelo shim nativo e consumido de forma única pelo desktop.
- **Superfície de Ataque de Rede Nula:** O desktop **não** instancia listeners HTTP, Express, Fastify ou WebSocket. Nenhuma porta TCP (8000, 8765, 9222 ou similares) fica escutando em `localhost` ou na rede local em produção.

### 2.3. Assinatura Digital e Canonicalização Comunitária
- **Algoritmo Ed25519:** Pacotes comunitários (`.skillpkg.json`) e índices de registros são assinados com chaves assimétricas Ed25519 (RFC 8032) nativas via `node:crypto`.
- **Canonicalização JCS (RFC 8785):** A serialização dos dados para assinatura utiliza ordenação lexicográfica determinística de chaves UTF-16, números IEEE 754 canônicos e escape estrito em TypeScript puro (`canonical.ts`), eliminando discrepâncias entre ambientes.
- **Identidade Criptográfica do Publicador:** O `key_id` é o SHA-256 exato da chave pública bruta (64 caracteres hexadecimais). Handles ("prof_claudia") são meramente cosméticos.

### 2.4. Sanitização e Quarentena Mandatória
- **Expurgo de PII e Placeholders RFC 2606:** Na exportação, o pipeline de sanitização expurga nomes de alunos, turmas, CPFs e notas, substituindo todos os domínios reais por marcadores neutros (`h1.invalid`, `h2.invalid`).
- **Estados de Quarentena no SQLite:**
  - `quarantined`: Pacote importado, grafo bloqueado no repositório (`E_GRAPH_QUARANTINED`), execução física desabilitada.
  - `dry_run_passed`: Grafo validado em simulação passiva (leitura/navegação) sem escrita no portal real.
  - `activated`: Liberação expressa pela professora para uso operacional.
  - `revoked`: Chave pública do autor revogada no registro comunitário; o mapa retorna ao bloqueio.
- **Enforcement no Repositório:** O repositório central `SqlSkillGraphRepository` intercepta qualquer chamada `get()` ou `setActive()` em grafos de origem `imported`. Se o pacote não estiver no estado `activated`, lança imediatamente `E_GRAPH_QUARANTINED`.

### 2.5. Proteções de Runtime e Defesa em Profundidade
- **Guarda Anti-Submissão Oculta (`E_CLICK_UNDECLARED_SUBMIT`):** No runner de automação, nós `CLICK` com `is_submit_action: false` têm o elemento inspecionado via DOM accessibility tree. Se for um botão de submissão (`type="submit"`, `role="button"` com termos de salvar/excluir), o runner aborta imediatamente.
- **Proteção Anti-ReDoS e Parser JSON Estrito:**
  - `safeRegex`: Rejeição estática de quantificadores aninhados suscetíveis a backtracking exponencial.
  - `safeRegexMatch`: Truncamento rígido de alvos a 2.000 caracteres no motor de texto.
  - `strictJsonParse`: Parser personalizado que bloqueia chaves duplicadas, `__proto__`, `constructor` e profundidade recursiva > 32 antes da validação Zod.
- **Rejeição de Textos Inseguros (`E_PKG_UNSAFE_TEXT`):** Bloqueio estrito de caracteres de controle invisíveis, zero-width spaces e sequências de inversão de direção bidi (ex.: U+202E).
- **Proteção Contra Regressão de Versão (`E_PKG_ROLLBACK`):** A tabela `community_seen_versions` rastreia a maior versão vista por `(key_id, package_id)`, impedindo que atacantes forcem downgrade para versões vulneráveis.

### 2.6. Privacidade na Consulta ao Registro
- **Arquitetura 100% Estática:** O registro comunitário é um repositório Git ou CDN de arquivos estáticos.
- **Zero Telemetria de Busca:** O app baixa apenas o arquivo `index.json` (assinado pela chave mestra em `pinnedKey.ts`). Todas as buscas por plataforma, autor ou tarefa são executadas estritamente em memória na máquina local. O servidor do registro não recebe parâmetros de consulta.

---

## 3. Matriz de Ameaças, Mitigações e Limites Honestos

| Ameaça / Vetor | Nível | Mitigação no Teacher AI | Limite Honesto / Risco Residual |
| :--- | :---: | :--- | :--- |
| **Adulteração de pacote comunitário** | Crítico | Assinatura Ed25519 sobre RFC 8785 JCS. Hash SHA-256 no índice assinado. | Nulo contra pacotes com assinatura rompida. |
| **Exfiltração de dados via host malicioso** | Crítico | Hosts reais convertidos em `h1.invalid`. A professora vincula o seu próprio portal. | Erro humano se a usuária digitar manualmente um domínio malicioso no formulário. |
| **Escrita destrutiva sem autorização** | Alto | Quarentena mandatória + Write-ahead audit ack + `E_WRITE_WITHOUT_CHECKPOINT`. | Não substitui o julgamento pedagógico da professora ao revisar a simulação. |
| **Clique destrutivo não declarado** | Alto | Guarda de runtime inspeciona atributos semânticos do botão (`E_CLICK_UNDECLARED_SUBMIT`). | Botões mal formatados pelo portal (ex.: `<div>` com ícone sem texto) reduzem a eficácia da heurística. |
| **Vazamento de PII para Nuvem / LLM** | Alto | `Pseudonymizer` reversível local; nuvem bloqueada sem consentimento na tabela `consents`. | Dados inseridos em campos de texto livre não capturados pelos padrões regex de pseudonimização. |
| **Malware local rodando na mesma conta** | Alto | Cofre do SO (`safeStorage` / DPAPI). | DPAPI protege contra roubo de disco desligado ou outro usuário, mas não contra processo com os mesmos privilégios da usuária (recomenda-se BitLocker e antivírus). |
| **Chave do publicador comprometida** | Médio | Revogação central no `index.json` (`revoked_keys`). Downgrades bloqueados (`E_PKG_ROLLBACK`). | Janela de tempo entre o comprometimento da chave e a sincronização do índice pela usuária. |
| **ReDoS / Negação de Serviço no App** | Médio | Validador `safeRegex`, teto de 2.000 caracteres, limite de pacote $\le$ 512 KB e grafo $\le$ 256 KB. | Expressões aceitas ainda podem consumir ciclos modestos de CPU antes do timeout do runner. |

---

## 4. Status de Conformidade e Auditoria

1. **Varredura de Privacidade em Repouso (`privacy-scan.ts`):** 4.367 arquivos inspecionados com 0 violações de PII ou vazamento de portas de rede.
2. **Suíte Adversarial de Pacotes (`conformance-run.ts`):** 12/12 casos de teste DEV aprovados; integridade do `holdout.lock` verificada com 100% de correspondência de SHA-256.
3. **Isolamento de Tipos e Integridade Estática:** `tsc --noEmit` aprovado com 0 erros em todo o workspace TypeScript.
4. **Testes Criptográficos e de Protocolo:** 56/56 testes vitest aprovados em `community.core.test.ts` e `desktop.core.test.ts`.
