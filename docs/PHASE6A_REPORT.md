# Relatório da Parte A — Fase 6 (Local-First e Blindagem)

**Documento:** `docs/PHASE6A_REPORT.md`  
**Data:** 11 de outubro de 2026  
**Branch:** `fase-6-local-first`  
**Status do Marco:** Concluído (Aguardando Aprovação do GATE A)  

---

## 1. Resumo Executivo da Parte A

A **Parte A da Fase 6** estabeleceu a fundação técnica do modelo local-first e a blindagem de dados escolares do Teacher AI:
1. **Núcleo Criptográfico Puro (`lib/desktop-core/crypto/`):** Envelope AES-256-GCM com detecção de adulteração, nonces aleatórios únicos e backups versionados cifrados via `scrypt` + GCM.
2. **Banco de Dados e Repositórios (`lib/desktop-core/db/`):** Driver agnóstico `SqlDriver`, migração inicial `001` com verificação de checksum SHA-256 e implementações dos repositórios canônicos (`SqlStudentRepository`, `SqlPrivateStudentRepository`, `SqlSkillGraphRepository`, `SqlAuditRepository`, `SqlConsentRepository`, `SqlSettingsRepository`).
3. **Imutabilidade Estrita de Mapas:** `SqlSkillGraphRepository.save()` garante que nenhuma versão publicada de grafo seja sobrescrita.
4. **Conformidade LGPD:** Serviços de exportação de dados do titular (`ExportService`) e expurgo seguro em cascata (`ErasureService`) com anonimização de auditoria e verificação mandatória pós-deleção.
5. **Casca Desktop Endurecida (`desktop/`):** Processo Electron main com isolamento rigoroso (`contextIsolation: true`, `sandbox: true`, bloqueio de navegação externa), cofre do SO (`safeStorage` / DPAPI no Windows) para guarda da DEK, interface local segura e driver SQLite via `node:sqlite`.
6. **Varredura de Privacidade (`scripts/privacy-scan.ts`):** Script estrito que audita discos em busca de canários e PII, imprimindo apenas contagem e caminho (zero exposição de trechos), além de checagem de portas TCP.

---

## 2. Commits da Parte A

- `f3ca973` — `fase6(T6.1): nota de design do desktop local-first`
- `18eb5ad` — `fase6(T6.2): nucleo criptografico e protocolo`
- `cb3dd60` — `fase6(T6.3): banco, migracoes e repositorios`
- `d1dac78` — `fase6(T6.4): teste de fronteira do desktop-core`
- `[pendente]` — `fase6(T6.5): casca do desktop, banco cifrado e varredura de privacidade`

---

## 3. Evidências de Comandos e Testes

### 3.1 Suíte de Testes de Fronteira (`__tests__/desktop.core.test.ts`)
```text
✓ __tests__/desktop.core.test.ts (19 tests) 825ms
Test Files  1 passed (1)
     Tests  19 passed (19)
```

### 3.2 Compilação de Tipos (`tsc --noEmit`)
```text
npx tsc --noEmit -> Código de saída 0 (Zero erros de tipagem no repositório).
```

### 3.3 Empacotamento Desktop (`npm run desktop:build`)
```text
[Build Desktop] Empacotando casca Electron...
[Build Desktop] Sucesso: Artefatos gerados em dist-desktop/!
```

---

## 4. Dependências Adicionadas (com Aprovação no GATE 0)

- `electron` (`^34.5.8`) — Casca do aplicativo desktop nativo.
*(Nenhuma dependência nativa em C++ adicionada).*

---

## 5. Desvios em Relação ao Plano Inicial

- **Nenhum desvio arquitetural:** Todas as entregas obedecem estritamente a `docs/desktop/DESKTOP_DESIGN.md` e aos contratos congelados.

---

## 6. Checklist de Homologação Manual do Dono (GATE A)

Para aprovação formal do **GATE A**, o proprietário deve executar os passos abaixo (~40 minutos):

- [ ] **1. Inicialização do Desktop e Dados Demo:**
  - Execute `npm run desktop:dev`.
  - Em outro terminal, execute `npm run desktop:seed-demo`.
  - Verifique na tela que o diagnóstico local exibe conexão bem-sucedida.
- [ ] **2. Inspeção em Repouso do Arquivo do Banco:**
  - Feche o aplicativo desktop.
  - Abra o arquivo do banco em `%APPDATA%\TeacherAI\data\teacher_local.db` em um visualizador de SQLite ou execute no terminal:
    `findstr "Canário" "%APPDATA%\TeacherAI\data\teacher_local.db"`
  - **Critério:** Nenhum nome legível em texto puro (`name_encrypted` deve conter apenas strings base64 `enc:v1:...`).
- [ ] **3. Varredura de Privacidade e Portas:**
  - Com o aplicativo aberto, execute:
    `npm run privacy:scan -- "%APPDATA%\TeacherAI\data" --ports`
  - **Critério:** Zero ocorrências de nomes/PII em repouso e zero portas TCP abertas pertencentes ao app desktop.
- [ ] **4. Backup e Restauração Cifrada:**
  - No painel da aplicação, digite uma senha e clique em **Exportar Backup Cifrado**.
  - Verifique o arquivo gerado `.tbackup` na pasta do usuário.
- [ ] **5. Endurecimento do Electron:**
  - Confirme que atalhos de DevTools estão inativos em modo de produção e que links externos não navegam para fora da casca segura.
