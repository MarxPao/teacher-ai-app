# Modelo de Ameaça e Segurança Criptográfica do Cofre Local (Desktop Core)

Este documento estabelece o modelo de ameaça, os limites de segurança e os pressupostos operacionais do cofre seguro local do Teacher AI Desktop (`desktop/vault/safeStorage.ts` e `lib/conversationData/schema.ts`).

---

## 1. Primitiva de Segurança: DPAPI e Chaveiro do Sistema Operacional

A proteção em repouso da Chave de Cifra de Dados (DEK - Data Encryption Key) utiliza a API nativa do sistema operacional através do módulo `safeStorage` do Electron:
- **Windows**: Windows Data Protection API (DPAPI - `CryptProtectData` / `CryptUnprotectData`).
- **macOS**: Keychain do macOS.
- **Linux**: Secret Service API / libsecret (Gnome Keyring ou KWallet). O backend `basic_text` (criptografia fraca com chave fixa) é terminantemente rejeitado com erro `E_VAULT_BACKEND_INSECURE`.

---

## 2. Superfície de Ataque e Modelo de Ameaça

| Cenário de Ameaça | Protegido? | Justificativa Técnica |
| :--- | :---: | :--- |
| **Roubo de disco físico / dump de partição** | **SIM** | A DEK física (`userData/vault/dek.enc`) está cifrada com as credenciais criptográficas atreladas ao TPM/credenciais de login do SO. O atacante que montar o HD externamente não consegue descriptografar a DEK nem os registros SQLite. |
| **Outro usuário do mesmo computador** | **SIM** | A DPAPI do Windows vincula a chave ao SID do usuário logado. Outra conta de usuário no mesmo computador que tente ler `dek.enc` ou `teacher_local.db` receberá erro de acesso negado pelo SO na decifragem da DPAPI. |
| **Leitura direta do arquivo `.db` / `.wal`** | **SIM** | Todos os campos sensíveis de fala, rótulo e PII (`title`, `text`, `speaker_label`, `evidence_span`, `user_label`) são cifrados no nível de aplicação com AES-256-GCM (`enc:v1:<iv>:<tag>:<ciphertext>`). |
| **Processo malicioso executando sob o MESMO usuário do professor** | **NÃO** | **Limitação fundamental do DPAPI**: Qualquer processo executado no espaço de usuário do mesmo professor tem permissão de chamar a DPAPI e desproteger segredos criptografados pela mesma conta. A mitigação é o isolamento de processo no SO (não executar malwares/binários desconhecidos). |
| **Injeção de script via Renderer / DevTools** | **SIM** | `contextIsolation: true`, `nodeIntegration: false`, e canais estritos de IPC (Allowlist fechada) impedem acesso direto ao SQLite ou ao `safeStorage` pelo Renderer. |
| **Native Messaging / Extensão do Chrome maliciosa** | **SIM** | O NamedPipeServer bloqueia estritamente todos os métodos `conversation.*` com `E_METHOD_NOT_ALLOWED`. A extensão não tem permissão de invocar comandos do cofre. |

---

## 3. Gestão do Ciclo de Vida da Chave e Irrecuperabilidade

1. **Dependência Crítica de `dek.enc` e Perfil do SO**:
   - A perda ou corrupção do arquivo `userData/vault/dek.enc`, ou a redefinição destrutiva da senha do Windows/perfil do usuário sem backup do certificado DPAPI, torna o cofre **permanente e matematicamente irrecuperável**.
2. **Proibição de Backup de Chave em Claro**:
   - É terminantemente proibido implementar rotinas de exportação, dump de memória, backup em nuvem ou persistência em arquivos de texto plano da DEK desprotegida.
3. **Expurgo Físico (Right to be Forgotten / LGPD)**:
   - Ao apagar uma sessão (`conversation.delete`), todos os registros nas tabelas são deletados sob transação e o comando `VACUUM` é executado compulsoriamente no SQLite, garantindo que nenhum fragmento residual de texto cifrado ou metadado permaneça nas páginas livres do banco.
