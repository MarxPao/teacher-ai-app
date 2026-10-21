# Desenho Arquitetural: Espelho Local de Write-Through no Cofre Seguro (Desktop Core)

## 1. Visão Geral e Princípio de Isolamento
A persistência do histórico de mutações e conciliações executadas em portais escolares (ex.: lançamento de notas, faltas, conteúdos) opera sob o **Trilho 1 (Proteção Estrita de PII / LGPD)**. Nenhum dado discente ou diff nominal trafega pela nuvem pública. O registro de auditoria é armazenado exclusivamente no cofre SQLite local cifrado da aplicação Desktop.

---

## 2. Estrutura da Tabela no Cofre (`portal_execution_mirror`)

No esquema gerenciado pelo Desktop Core (`lib/desktop-core/db/`):

```sql
CREATE TABLE IF NOT EXISTS portal_execution_mirror (
  id TEXT PRIMARY KEY,                       -- UUID v4 único da gravação local
  task_id TEXT NOT NULL,                     -- Identificador da tarefa executada
  portal TEXT NOT NULL,                      -- Nome/origem do portal (ex: "Machado Sobrinho")
  action_type TEXT NOT NULL,                 -- Tipo de mutação ("lancar_nota", "lancar_falta")
  class_ref TEXT,                            -- Referência da turma ("7º Ano A")
  diff_encrypted TEXT NOT NULL,              -- Payload JSON cifrado (AES-GCM / pref enc:v1:)
  applied_at TEXT NOT NULL                   -- Timestamp ISO 8601 UTC
);

CREATE INDEX IF NOT EXISTS idx_portal_mirror_task ON portal_execution_mirror(task_id);
CREATE INDEX IF NOT EXISTS idx_portal_mirror_portal ON portal_execution_mirror(portal);
CREATE INDEX IF NOT EXISTS idx_portal_mirror_applied_at ON portal_execution_mirror(applied_at);
```

- **Campos Estruturais em Claro**: `task_id`, `portal`, `action_type`, `class_ref`, `applied_at` (permitem filtros temporais e por turma sem expor PII).
- **Campo Sensível Cifrado**: `diff_encrypted` armazena o array serializado contendo nomes de alunos, matrículas, notas anteriores e novas (`[{ studentName, matricula, field, beforeValue, afterValue }]`). É cifrado no nível de aplicação com a chave do cofre local (`dataKey` protegida via DPAPI).

---

## 3. Fluxo de Gravação Local via IPC (`PortalApprovalCard`)

Quando a professora clica no botão "Aprovar e Executar" no `PortalApprovalCard`:

1. **Aprovação e Despacho**: O card notifica a extensão/sidecar para execução física no portal via bridge Chrome.
2. **Gravação no Cofre Local via IPC**:
   ```typescript
   // Chamada IPC no Electron / Desktop Core
   await window.electronAPI.vault.appendPortalExecutionMirror({
     taskId: execution.taskId,
     portal: execution.portalName,
     actionType: execution.actionType,
     classRef: execution.classRef,
     diff: execution.diff // Objeto com dados sensíveis
   })
   ```
3. **Tratamento Fail-Closed**: Se o Desktop Core ou o cofre não estiverem disponíveis, o card registra aviso pedagógico na tela sem travar a navegação da professora e sem tentar fallback para a nuvem.

---

## 4. Visualização do Histórico e Auditoria Local pelo Docente

1. **Consulta Local**: Na tela de Configurações/Auditoria do aplicativo Desktop, a professora tem a aba **"Histórico de Ações em Portais"**.
2. **Decifração em Memória**: O backend do Desktop lê `portal_execution_mirror`, decifra `diff_encrypted` pontualmente em memória usando a chave mestra da sessão, e exibe:
   - Data e hora exata da aprovação;
   - Nome do portal e turma afetada;
   - Tabela comparativa (Aluno, Matrícula, Valor Anterior $\rightarrow$ Valor Atual);
   - Exportação em CSV/PDF estritamente em disco local para prestação de contas à coordenação pedagógica.
