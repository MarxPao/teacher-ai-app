# Nota de Design: Arquitetura Desktop Local-First e Blindagem de Dados (Fase 6)

**Documento:** `docs/desktop/DESKTOP_DESIGN.md`  
**Status:** Proposta de Arquitetura — GATE 0  
**Data:** 11 de outubro de 2026  
**Autor:** Engenheiro de Software Principal (Teacher AI)  
**Conformidade:** LGPD (Lei 13.709/2018) & Diretrizes de Soberania de Dados Escolares  

---

## 1. Modelo de Ameaças (Threat Model)

O objetivo central da Fase 6 é assegurar que **nenhum dado escolar (PII) saia do dispositivo da professora sem consentimento explícito e nenhum dado permaneça em texto puro em repouso**.

### 1.1 Ativos Protegidos
1. **Dados de Alunos (PII):** Nomes completos, matrículas, notas, faltas, observações comportamentais, pareceres pedagógicos e dados de responsáveis (`canonical.ts`).
2. **Segredos e Credenciais:** Chaves de API de LLMs (BYOK: OpenAI, Anthropic, Gemini, Groq, DeepSeek) e credenciais de login em portais escolares.
3. **Trilhas de Auditoria:** Histórico com valores anteriores e posteriores (`before_value` e `after_value`) das automações nos portais escolares.
4. **Habilidades Gravadas:** Grafos `SkillGraph v2` contendo estruturas de navegação e seletores.

### 1.2 Atores Adversários, Vetores de Ataque e Mitigações

| Adversário | Vetor de Ataque | Mitigação Arquitetural | Limite Honesto da Proteção |
| :--- | :--- | :--- | :--- |
| **Outro Usuário do PC** | Leitura de arquivos na pasta de perfil ou inicialização de binários. | Chave de Criptografia (DEK) embrulhada pelo cofre do SO (`safeStorage` / DPAPI vinculado ao perfil do Windows da professora) + ACL de pasta restrita (`icacls`). | Não protege se os usuários compartilharem a mesmíssima conta de usuário do Windows sem senha/PIN. |
| **Notebook Roubado / Perdido** | Extração do disco rígido e leitura forense de banco de dados e arquivos de configuração. | Criptografia em repouso do SQLite (DEK via DPAPI) e backups cifrados com senha robusta (scrypt + AES-256-GCM). | A proteção DPAPI do SO assume que o invasor não possui a senha de login do Windows da professora. Recomenda-se BitLocker ativo no disco. |
| **Página Web Maliciosa** | A professora navega em site malicioso que tenta sondar portas abertas (`fetch('http://localhost:8765')` ou WebSocket hijacking). | **Zero portas TCP abertas.** Extinção de servidores HTTP/WebSocket em `localhost`. Canal exclusivo via **Chrome Native Messaging** (acessível unicamente pela extensão autorizada). | Páginas não têm acesso físico à API de Native Messaging do Chrome nem a Named Pipes locais. |
| **Extensão Maliciosa no Chrome** | Outra extensão tenta enviar mensagens para a extensão Teacher AI ou para o Native Messaging Host. | ID fixo da extensão via chave pública RSA (`key` em `manifest.json`); `allowed_origins` restrito no manifesto do Host; handshake com **nonce efêmero** no Named Pipe. | Outras extensões no navegador são sumariamente barradas pelo Chrome no canal Native Messaging. |
| **Mapa Malicioso (SkillGraph Envenenado)** | Grafo manipulado para desviar cliques ou extrair dados para domínios externos. | Validação estrita de contrato (`SKILLGRAPH_V2.md`), lista estrita de domínios (`safety.allowed_hosts`), bloqueio de nós mutacionais sem checkpoint e auditoria prévia mandatória. | Protegido pelas regras congeladas das Fases 1 a 5. |
| **Provedor de Nuvem de LLM** | Ingestão ou vazamento de nomes de alunos através de prompts enviados para APIs externas. | **Pseudonimização obrigatória** por gateway local (`LlmGateway`): nomes e PII substituídos por tokens efêmeros antes da transmissão; de-pseudonimização só no retorno local; Ollama local como padrão. | Nuvem permitida apenas mediante consentimento explícito prévio e pré-visualização auditável. |
| **Malware do Mesmo Usuário** | Processo malicioso rodando sob a mesma conta e privilégio da professora tenta ler a memória ou cofre. | IPC endurecido, canais fechados, isolamento de renderer (`contextIsolation`, `sandbox`). | **Limite honesto:** No Windows, qualquer processo rodando como o mesmo usuário com acesso à DPAPI pode, em teoria, descriptografar segredos do usuário se executar código nativo malicioso. Cifra de processo não substitui antivírus do SO. |

---

## 2. Gestão de Chaves e Criptografia em Repouso

### 2.1 Chave de Criptografia de Dados (DEK - Data Encryption Key)
- **Geração:** Ao inicializar pela primeira vez, o processo principal (`main`) gera uma DEK criptograficamente segura de 256 bits (`crypto.randomBytes(32)`).
- **Embrulho (Key Wrapping):** A DEK é imediatamente cifrada usando o cofre do SO (`safeStorage.encryptString()` / Windows DPAPI).
- **Armazenamento:** A DEK cifrada é salva no arquivo `%APPDATA%\TeacherAI\vault\dek.enc`.
- **Regras Rígidas:** A DEK em texto puro vive apenas na memória RAM do processo `main` do Electron; **nunca** é persistida em disco, nunca vai para variáveis de ambiente, logs ou renderers.
- **Perda de Perfil do SO:** Se a senha do Windows for redefinida sem preservação das credenciais DPAPI, a DEK será perdida. A recuperação só é possível via **arquivo de backup exportado**.

### 2.2 Formato de Backup e Recuperação por Senha da Professora
Para permitir migração entre máquinas e contingência:
1. **Derivação de Chave:** `scrypt` (N=32768, r=8, p=1, salt aleatório de 32 bytes).
2. **Cifra Envelope:** AES-256-GCM com IV de 12 bytes e Auth Tag de 16 bytes.
3. **Cabeçalho Versionado do Arquivo de Backup (`.tbackup`):**
   ```text
   [4 bytes MAGIC 'TABK'] [2 bytes VERSION (0x0001)] [32 bytes SALT] [12 bytes IV] [16 bytes TAG] [PAYLOAD CIFRADO...]
   ```
4. **Proteção contra Força Bruta:** O custo do `scrypt` impõe atraso computacional proposital (>500ms por tentativa) contra ataques de dicionário offline.

---

## 3. Arquitetura do Banco de Dados Local (SQLite)

### 3.1 Avaliação das Opções de Implementação

| Critério | Opção A: SQLite 100% Cifrado (SQLCipher Nativo) | Opção B: SQLite Nativo + Cifra de Colunas por Envelope (AES-GCM) |
| :--- | :--- | :--- |
| **Ambiente Windows (Compilação)** | **Alto risco de atrito:** `cl.exe` e `gcc.exe` estão **ausentes** no ambiente (provado em T6.0). Módulos nativos (`@journeyapps/sqlcipher` ou `better-sqlite3-multiple-ciphers`) exigem compilação ou compatibilidade exata de prebuilds ABI entre Node 24 (Vitest) e Electron. | **Zero atrito de build:** Utiliza driver nativo pré-compilado ou `node:sqlite` (já validado como `AVAILABLE` no Node 24), sem nenhuma compilação C/C++. |
| **Proteção de Dados (LGPD)** | Cifra o arquivo inteiro de ponta a ponta (inclusive metadados e tabelas). | Cifra em envelope AES-256-GCM todas as colunas sensíveis (nomes, e-mails, notas, pareceres, antes/depois da auditoria). Estrutura de tabelas visível. |
| **Busca e Índices** | Índices B-Tree funcionam sobre campos de texto normais. | Índices operam sobre IDs e chaves cegas (hashes HMAC determinísticos ou IDs UUID); dados legíveis nunca são indexados em texto puro. |
| **Resíduos em Disco (`-wal` / `-shm`)** | Cifrados nativamente pelo SQLCipher. | Protegidos via `PRAGMA secure_delete = FAST` + remoção com sobrescrita no encerramento. |
| **Recomendação Técnica** | Excelente teoricamente, mas suscetível a quebra em CI/Windows sem compilador C++. | **Recomendada:** Máxima robustez no Windows, zero dependência de toolchain nativo, estrito cumprimento da LGPD. |

### 3.2 Esquema Relacional Canônico (Alinhado a `canonical.ts` e `audit.ts`)

```sql
-- ── PRAGMAs Mandatórios de Desempenho e Segurança ──────────────────────────
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA secure_delete = FAST;

-- ── Controle de Versão de Esquema ──────────────────────────────────────────
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

-- ── Entidades Escolares ───────────────────────────────────────────────────
CREATE TABLE schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  year TEXT,
  grade_year TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE students (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  portal_id TEXT,               -- Cifrado ou pseudonimizado
  roll_number TEXT,
  name_encrypted TEXT NOT NULL, -- Envelope AES-256-GCM
  name_hash TEXT NOT NULL,      -- HMAC-SHA256 para busca e desduplicação
  email_encrypted TEXT,         -- Envelope AES-256-GCM
  level TEXT,
  notes_encrypted TEXT,         -- Envelope AES-256-GCM
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_students_class ON students(class_id);
CREATE INDEX idx_students_hash ON students(name_hash);

CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  term TEXT NOT NULL,
  score_encrypted TEXT NOT NULL, -- Envelope AES-256-GCM
  max_score REAL DEFAULT 10,
  assessment_name TEXT,
  date TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_eval_student ON evaluations(student_id);

CREATE TABLE attendance_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL,          -- 'present', 'absent', 'justified', 'none'
  absences_count INTEGER DEFAULT 0,
  note_encrypted TEXT,           -- Envelope AES-256-GCM
  created_at TEXT NOT NULL
);
CREATE INDEX idx_attendance_student_date ON attendance_records(student_id, date);

CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  text_encrypted TEXT NOT NULL,  -- Envelope AES-256-GCM
  category TEXT,
  author TEXT,
  created_at TEXT NOT NULL
);

-- ── Aulas Particulares (Isolamento Estrito) ────────────────────────────────
CREATE TABLE private_students (
  id TEXT PRIMARY KEY,
  name_encrypted TEXT NOT NULL,
  subject TEXT NOT NULL,
  monthly_fee_encrypted TEXT,
  guardians_encrypted TEXT,     -- JSON cifrado com nomes/telefones dos responsáveis
  phone_encrypted TEXT,
  email_encrypted TEXT,
  notes_encrypted TEXT,
  status TEXT NOT NULL CHECK(status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ── Repositório de Habilidades (Versões Imutáveis) ──────────────────────────
CREATE TABLE skill_graphs (
  portal_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  spec_version TEXT NOT NULL,
  name TEXT NOT NULL,
  graph_json TEXT NOT NULL,      -- Contrato puro sem PII
  is_active INTEGER DEFAULT 0,   -- 1 = ativo, 0 = inativo
  created_at TEXT NOT NULL,
  PRIMARY KEY (portal_id, task_id, version)
);

-- ── Trilha de Auditoria Write-Ahead Persistente ────────────────────────────
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  portal_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  node_id TEXT NOT NULL,
  action TEXT NOT NULL,          -- 'read', 'write', 'revert', 'abort'
  status TEXT NOT NULL,          -- 'success', 'reverted', 'failed'
  target_ref TEXT,
  before_value_encrypted TEXT,   -- Envelope AES-256-GCM
  after_value_encrypted TEXT,    -- Envelope AES-256-GCM
  verified_by TEXT NOT NULL,     -- 'read_back', 'none'
  error_code TEXT,
  at TEXT NOT NULL
);
CREATE INDEX idx_audit_run ON audit_log(run_id);
CREATE INDEX idx_audit_at ON audit_log(at);

-- ── Preferências e Consentimentos ──────────────────────────────────────────
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE consents (
  provider TEXT PRIMARY KEY,     -- 'openai', 'anthropic', 'google', 'groq'
  consented INTEGER NOT NULL,    -- 0 ou 1
  granted_at TEXT NOT NULL,
  scope TEXT NOT NULL
);

-- ── Registro de Expurgo Seguro LGPD (Zero PII) ─────────────────────────────
CREATE TABLE erasure_log (
  id TEXT PRIMARY KEY,           -- UUID do evento de expurgo
  student_id_hash TEXT NOT NULL, -- Hash SHA-256 irreversível
  records_purged INTEGER NOT NULL,
  audit_entries_anonymized INTEGER NOT NULL,
  erased_at TEXT NOT NULL
);
```

---

## 4. Modelo de Processos e Hospedagem da UI

### 4.1 Comparação das Abordagens de Hospedagem
1. **Opção (a): Exportação Estática Next.js (`output: 'export'`) + Protocolo Local Customizado (`teacher://`):**
   - **Vantagens:** Atende 100% ao requisito de **zero portas TCP**. A aplicação carrega assets estáticos empacotados (`app://ui/index.html`).
   - **Desafio:** As 33 rotas dinâmicas em `app/api/**` não funcionam com exportação estática pura.
   - **Solução Arquitetural:** As 33 rotas são convertidas em handlers IPC no processo `main` do Electron (`ipcMain.handle`), e as chamadas no renderer usam uma ponte padronizada (`window.electronAPI.invoke` ou polyfill de `fetch('app://api/...')`).
2. **Opção (b): Servidor Next.js Node rodando em `localhost:3000`:**
   - **Rejeitada:** Viola frontalmente a regra de ouro: *"Zero portas TCP escutando no app de produção"*. Abre brecha para qualquer aba no navegador da usuária interagir com o servidor local.

### 4.2 Endurecimento Mandatório do Electron (`desktop/main.ts`)
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- `webSecurity: true`, `allowRunningInsecureContent: false`.
- `webContents.setWindowOpenHandler(() => ({ action: 'deny' }))`.
- Bloqueio de navegação não intencional: `will-navigate` cancela qualquer URL externa e abre no browser padrão do SO se aprovado.
- Rejeição padrão de permissões de hardware: `session.setPermissionRequestHandler((wc, perm, cb) => cb(false))`.
- DevTools estritamente desativadas em builds de produção (`app.isPackaged`).
- Bloqueio de múltiplas instâncias via `app.requestSingleInstanceLock()`.

---

## 5. Canal de Comunicação Extensão $\leftrightarrow$ Desktop: Chrome Native Messaging

### 5.1 Arquitetura do Canal
```text
[ Chrome Extension ] (Manifest V3)
       │  chrome.runtime.connectNative("com.teacherai.desktop")
       ▼
[ Shim Executável Local ] (desktop/native-host/shim.ts)
       │  Lê/escreve frames (4 bytes prefixo UTF-8 JSON) via stdin/stdout
       ▼
[ Named Pipe Local com ACL Restrita ] (\\.\pipe\teacher_ai_desktop_pipe)
       │  Autenticação: Handshake com Nonce de Sessão
       ▼
[ Electron Main Process ] (Servidor Pipe + Validação Zod + LlmGateway)
```

### 5.2 Configuração e Instalação do Host
1. **Manifesto do Host (`com.teacherai.desktop.json`):**
   ```json
   {
     "name": "com.teacherai.desktop",
     "description": "Teacher AI Desktop Host",
     "path": "teacher-ai-native-host.exe",
     "type": "stdio",
     "allowed_origins": [
       "chrome-extension://[ID_ESTAVEL_DA_EXTENSAO]/"
     ]
   }
   ```
2. **Registro no Windows:** O instalador / script do dono registra a chave em:
   `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.teacherai.desktop`.
3. **Auto-inicialização:** Se o shim for acionado pelo Chrome e o app não estiver em execução, o shim lança o app em segundo plano (`--minimized`) e aguarda a inicialização do Named Pipe antes de responder. Se expirar, emite `E_APP_NOT_RUNNING`.

---

## 6. Matriz de Acesso de Métodos IPC / Native Messaging

| Método | Origem Permitida | Schema de Entrada / Saída | Descrição |
| :--- | :---: | :--- | :--- |
| `app.status` | Extensão & UI | `{}` $\to$ `{ ready: bool, dbLocked: bool, hasOllama: bool }` | Verificação rápida de conectividade. |
| `students.list` | Extensão & UI | `{ classId?: string }` $\to$ `Student[]` (nomes legíveis para a professora) | Leitura de alunos da turma. |
| `students.upsertRoster` | Extensão & UI | `{ classId: string, students: Partial<Student>[], source: ... }` | Gravação de dados raspados do portal. |
| `graphs.get` | Extensão & UI | `{ portalId: string, taskId: string, version?: number }` | Busca grafo para execução. |
| `graphs.save` | Extensão & UI | `{ graph: SkillGraphV2 }` $\to$ Nova versão imutável | Persistência de mapa gravado/reparado. |
| `audit.append` | Extensão & UI | `{ entry: AuditEntry }` $\to$ `{ ack: true, id: number }` | **Gravação prévia mandatória.** |
| `nlu.parse` | Extensão & UI | `{ text: string }` $\to$ `{ intent: string, params: object }` | Parser semântico via Ollama ou Regex local. |
| `data.exportStudent` | **Apenas UI** | `{ studentId: string }` $\to$ JSON/CSV completo | Direito de portabilidade (LGPD). |
| `data.eraseStudent` | **Apenas UI** | `{ studentId: string }` $\to$ `{ success: bool, purged: number }` | Direito ao esquecimento (LGPD). |
| `data.backup` | **Apenas UI** | `{ passphrase: string }` $\to$ Arquivo `.tbackup` | Backup exportável protegido por senha. |
| `data.restore` | **Apenas UI** | `{ passphrase: string, backupPath: string }` | Restauração de base de dados. |
| `keys.configure` | **Apenas UI** | `{ provider: string, key: string }` $\to$ Salva no cofre DPAPI | Gestão segura de BYOK. |
| **Leitura de Chaves** | **NINGUÉM** | Bloqueado. A UI só consulta `keys.status` $\to$ `{ configured: bool }` | Proteção absoluta contra vazamento de chaves. |

---

## 7. Protocolo de Auditoria Write-Ahead com Ack

### 7.1 Garantia Mandatória de Escrita Segura
Antes de qualquer mutação física no portal da escola (`driver.write` em `lib/runner/nodes/write.ts`):
1. O runner captura o valor atual do DOM (`before_value`).
2. O runner emite mensagem síncrona `audit.append` com status `pending_write` para o app desktop.
3. O app grava a entrada cifrada em `audit_log` e devolve `{ ack: true, id: logId }`.
4. **Sem Ack ou Timeout:** Se o app estiver fechado ou não responder em 3 segundos, o runner **aborta imediatamente com `E_AUDIT_UNAVAILABLE` antes de encostar no DOM**.
5. Se o app fechar no meio do run após o ack, o runner executa reversão ao `before_value` e encerra.

---

## 8. Plano de Migração de Dados do `localStorage`

### 8.1 Classificação das Chaves Existentes (`lib/localDB.ts:83-175`)

| Categoria | Chaves Mapeadas | Ação e Destino na Fase 6 |
| :--- | :--- | :--- |
| **Segredos (BYOK)** | `teacher_apis`, `teacher_byok_key`, `teacher_supabase_config` | **Migrados para o cofre do SO (DPAPI).** Removidos imediatamente do `localStorage`. |
| **Dados Sensíveis (PII)** | `teacher_students`, `teacher_classes`, `teacher_private_students`, `teacher_saved_exams`, `teacher_attendance_records_v1`, `teacher_communications`, `teacher_student_memory` | **Migrados para o SQLite Cifrado.** Suportados por fachada hidratada em memória no início da sessão. |
| **Não Sensíveis / UI** | `teacher_dashboard_postits`, `teacher_sidebar_pinned`, `teacher_theme`, `teacher_onboarding_wizard_completed` | Permanecem no `localStorage` por ora; documentadas no BACKLOG. |
| **Cache Derivado** | `teacher_discovered_portal_maps`, `teacher_ipa_dynamic_cache` | Invalidados ou movidos para `chrome.storage.session`. |

### 8.2 Estratégia para Chamadores Síncronos
- **Fachada Hidratada (`lib/localDB.ts`):** Na inicialização do app, a fachada busca a base completa via IPC e popula um cache síncrono em memória.
- Leituras (`getStudents()`) permanecem síncronas para os 11 componentes legados.
- Escritas (`setStudents()`) atualizam o cache síncrono local e disparam persistência assíncrona com confirmação via IPC no SQLite.

---

## 9. LlmGateway e Proteção de Privacidade

### 9.1 Hierarquia de Provedores
1. **Padrão Absoluto:** **Ollama Local** (`http://127.0.0.1:11434` chamado exclusivamente pelo processo `main` do Electron). Zero dados deixam o computador.
2. **Nuvem Opcional (Com Consentimento):** Groq, OpenAI, Claude, Gemini.
   - Requer consentimento formal na tabela `consents`.
   - Requer tela de **pré-visualização do prompt pseudonimizado** na interface antes do envio.

### 9.2 Pipeline de Pseudonimização (`Pseudonymizer`)
```text
Texto da Professora: "Lançar 2 faltas para Mariana Lima e Zeca Canário"
       │
       ▼ [ Substituição por Tokens Efêmeros + Regex PII ]
Texto Higienizado:   "Lançar 2 faltas para ALUNO_A1 e ALUNO_B2"
       │
       ▼ [ Envio para Provedor Nuvem / Gemini com header x-goog-api-key ]
Resposta do Modelo:  "Comando: faltas=2, alvos=[ALUNO_A1, ALUNO_B2]"
       │
       ▼ [ De-pseudonimização em Memória Local ]
Resultado Final:     "Comando: faltas=2, alvos=[Mariana Lima, Zeca Canário]"
```

---

## 10. Aposentadoria do Sidecar Python

| Componente | Estado Atual | Destino na Fase 6 | Justificativa |
| :--- | :--- | :--- | :--- |
| `sidecar/manual_runner.py` (Porta 8765/8000) | Produção legada | **Desativado** | Substituído pelo Native Messaging Host do Electron. |
| `sidecar/chrome_launcher.py` (Porta CDP 9222) | Produção legada | **Desativado** | Extensão opera no Chrome comum da usuária sem flags de debug. |
| `abrir-chrome-cdp.bat` e `.bat` scripts | Produção legada | **Desativados** | Extensão não necessita de navegador especial. |
| Permissão `debugger` em `manifest.json` | Declarada (não usada) | **Removida** | Zero chamadas em código ativo; elimina risco de alerta de segurança. |
| `sidecar/intent_parser.py` | Produção legada | **Portado para TypeScript** | Lógica de regex portada para `lib/nlu/`; fallback para Ollama. |
| Código de `sidecar/` | Read-only | **Marcado como DEPRECATED** | Código mantido em disco sem execução, para arquivamento futuro. |

---

## 11. LGPD Técnica (Direitos do Titular - Rascunho Técnico)

> [!NOTE]
> Esta seção constitui um desenho de engenharia de software para cumprimento dos requisitos técnicos da LGPD (Lei 13.709/2018). Não substitui parecer jurídico formal.

1. **Portabilidade (Art. 18, V):** Exportação integral de dados do aluno em formatos abertos estruturados (`JSON` e `CSV`), contendo histórico de notas, frequências e observações.
2. **Direito ao Esquecimento / Expurgo (Art. 18, VI):**
   - Apagamento em cascata em `students`, `evaluations`, `attendance_records`, `observations`.
   - Anonimização estrita das linhas históricas de auditoria (`audit_log` substitui identificadores por `[ALUNO_EXPURGADO]`).
   - Registro criptográfico do expurgo em `erasure_log` (apenas hash HMAC e timestamp, zero PII).
   - Execução de `PRAGMA secure_delete = FAST` e `VACUUM` para sobrescrever blocos físicos em disco.
3. **Verificação Automatizada:** Teste `E_ERASE_VERIFY_FAILED` garante que uma varredura por canários na base após o expurgo retorna zero ocorrências.

---

## 12. Novos Códigos de Erro Estruturados

| Código de Erro | Causa-Raiz | Mensagem Pedagógica Amigável |
| :--- | :--- | :--- |
| `E_DB_LOCKED` | Concorrência ou arquivo de banco travado por outro processo. | *"O banco de dados está ocupado no momento. Tentando novamente em instantes."* |
| `E_DB_KEY_UNAVAILABLE` | Falha ao desproteger a DEK no cofre do Windows DPAPI. | *"Não foi possível abrir o cofre de segurança. Verifique o login do seu computador."* |
| `E_VAULT_UNAVAILABLE` | Sistema de segurança do SO inacessível. | *"O cofre seguro do sistema operacional não respondeu."* |
| `E_NM_UNAUTHORIZED` | Origem da extensão não bate com a chave autorizada no manifesto. | *"Comunicação com a extensão não autorizada."* |
| `E_NM_PROTOCOL` | Erro de formatação, violação de framing ou JSON corrompido no pipe. | *"Erro no protocolo de comunicação interna."* |
| `E_NM_TOO_LARGE` | Mensagem excede o limite máximo permitido (1 MB). | *"Tamanho da mensagem excedeu o limite seguro."* |
| `E_APP_NOT_RUNNING` | Shim não conseguiu iniciar o Desktop App em segundo plano. | *"O aplicativo Teacher AI Desktop não está em execução. Por favor, abra o aplicativo."* |
| `E_AUDIT_UNAVAILABLE` | App não confirmou gravação de auditoria antes da escrita. | *"Escrita interrompida por segurança: registro de auditoria indisponível."* |
| `E_MIGRATION_FAILED` | Checksum de migração divergiu ou erro de schema. | *"Falha ao atualizar a estrutura do banco de dados local."* |
| `E_BACKUP_BAD_PASSPHRASE`| Falha na validação do Auth Tag do backup com a senha fornecida. | *"Senha incorreta. Não foi possível restaurar a cópia de segurança."* |
| `E_ERASE_VERIFY_FAILED` | Verificação encontrou fragmentos residuais após exclusão. | *"Falha de conformidade: não foi possível garantir a exclusão total dos dados."* |
| `E_CONSENT_REQUIRED` | Tentativa de chamar provedor de nuvem sem consentimento registrado. | *"Esta ação requer seu consentimento prévio para envio seguro de dados."* |

---

## 13. Plano de Arquivos da Fase 6

### `lib/desktop-core/` (TypeScript Puro, sem Electron, sem DOM, sem Rede)
- `crypto/envelope.ts`: Envelope de cifra simétrica AES-256-GCM com nonce aleatório e versão.
- `crypto/backup.ts`: Cifra e decifra de arquivos de backup `.tbackup` via scrypt + AES-GCM.
- `protocol/schemas.ts`: Schemas Zod `.strict()` para todos os métodos da matriz de acesso.
- `protocol/errors.ts`: Enumeração dos códigos de erro `E_*`.
- `db/SqlDriver.ts`: Interface abstrata para operações SQLite.
- `db/migrations.ts`: Runner de migrações com validação de checksum SHA-256 e backup prévio.
- `db/repositories/SqlStudentRepository.ts`: Implementação sobre `SqlDriver`.
- `db/repositories/SqlPrivateStudentRepository.ts`: Implementação sobre `SqlDriver`.
- `db/repositories/SqlSkillGraphRepository.ts`: Implementação sobre `SqlDriver` (versões imutáveis).
- `db/repositories/SqlAuditRepository.ts`: Trilha de auditoria e purga por retenção.
- `db/services/ExportService.ts`: Exportação JSON/CSV para LGPD.
- `db/services/ErasureService.ts`: Expurgo seguro com verificação pós-exclusão.
- `privacy/pseudonymizer.ts`: Anonimização e de-anonimização por tokens efêmeros.

### `desktop/` (Casca Electron Endurecida)
- `main.ts`: Ponto de entrada, ciclo de vida, cofre `safeStorage`, Named Pipe server.
- `preload.ts`: `contextBridge` expondo apenas APIs permitidas.
- `db/nodeSqliteDriver.ts`: Implementação concreta de `SqlDriver` usando `node:sqlite`.
- `nm/pipeServer.ts`: Servidor de Named Pipe no Windows com autenticação por nonce.
- `native-host/shim.ts`: Shim binário para comunicação stdin/stdout com o Chrome.
- `llm/gateway.ts`: Roteamento para Ollama local e provedores externos consentidos.

---

## 14. Bloqueio de Contrato
- **Vazio.** Todas as integrações respeitam integralmente os contratos congelados em `lib/contracts/**` (`SKILLGRAPH_V2.md`, `canonical.ts`, `audit.ts`, `skillgraph.ts`).

---

## 15. Perguntas Numeradas ao Dono (GATE 0)

Para travarmos as decisões e prosseguirmos para a implementação (T6.2):

1. **Opção de Banco de Dados:**  
   Recomendamos a **Opção B** (SQLite padrão via `node:sqlite` nativo + envelope criptográfico AES-256-GCM em colunas sensíveis), pois o ambiente Windows local não possui compiladores C/C++ (`cl.exe`/`gcc.exe`), inviabilizando compilação do SQLCipher nativo (Opção A) sem risco crítico de falha de build. **Aprova a Opção B?**

2. **Hospedagem da UI:**  
   Recomendamos a **Opção (a)** (Exportação Estática Next.js + protocolo customizado + IPC), pois a Opção (b) abriria uma porta TCP em loopback, violando o objetivo de "zero portas abertas". **Aprova a Opção (a)?**

3. **Dados Reais no Supabase:**  
   Existem dados escolares reais atualmente no Supabase que precisem ser exportados/migrados para o banco local nesta fase, ou podemos focar nos scripts de importação via dump JSON/CSV?

4. **Descarte do Loop ReAct do Sidecar:**  
   Confirmamos o descarte total dos módulos de exploração autônoma ReAct (`browser_use_agent.py`, `agentic_execution_loop.py`), mantendo apenas a execução determinística baseada no SkillGraph gravado?

5. **LLMs em Nuvem (BYOK):**  
   Deseja manter provedores de nuvem (OpenAI, Claude, Gemini, Groq) como opção mediante consentimento explícito e pré-visualização, ou prefere remover o suporte a nuvem e deixar estritamente o Ollama local?

6. **Retenção Padrão de Auditoria:**  
   Aprovamos 90 dias como período padrão de retenção das linhas de auditoria antes da purga automática (configurável pela professora na tela de configurações)?

7. **Proteção por Senha / PIN ao Abrir o App:**  
   Deseja adicionar tela de senha/PIN ao iniciar o aplicativo desktop, ou considera a proteção do perfil do Windows (DPAPI) suficiente para a sua estação de trabalho?

8. **Instalador NSIS (T6.14):**  
   Mantemos a tentativa de empacotamento com `electron-builder` (NSIS por usuário) na T6.14, com a regra de que, caso haja atrito de assinatura de código no Windows, a tarefa é enviada ao BACKLOG sem bloquear o fechamento da fase?

---

### Dependências Novas Propostas para Aprovação Formal no GATE 0:
1. `electron` (`^34.0.0` ou compatível) — Casca desktop nativa (aprox. 85 MB no download).
2. `electron-builder` (`^25.0.0`, devDependency) — Gerador do instalador NSIS para Windows.
*(Nenhuma dependência nativa de C++ será necessária com a Opção B usando `node:sqlite`).*
