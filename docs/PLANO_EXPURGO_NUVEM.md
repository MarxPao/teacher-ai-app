# Plano de Expurgo de PII e Dados de Estudantes no Supabase Cloud

> [!CAUTION]
> **NÃO EXECUTAR sem aprovação expressa da professora (dona do produto).**  
> Este documento é uma proposta técnica estruturada para encerramento de passivo de privacidade na nuvem. Nenhuma operação de escrita, exclusão ou mutação foi realizada no banco de dados.

---

## 1. Motivação e Enquadramento Legal (LGPD)

O Teacher AI Desktop v2 adota a **Arquitetura de Dois Trilhos**:
- **Trilho 1 (Estritamente Local / Cofre SQLite Cifrado via DPAPI/AES-256-GCM):** Dados identificáveis de alunos (nomes, matrículas, notas individuais, observações psicopedagógicas, flag NEE).
- **Trilho 2 (Nuvem / Metadados Estruturais):** Aulas, planos, provas, rubricas, agendamento de tarefas e configurações gerais sem PII.

Em versões anteriores do protótipo, dados de estudantes foram sincronizados em tabelas do Supabase Cloud (`students`, `private_students`, `teacher_sync`, `portal_execution_logs`). Para conformidade estrita com o Art. 16 (eliminação após o término do tratamento) e Art. 18 (direitos do titular), propõe-se o expurgo controlado dessas tabelas.

---

## 2. Metodologia de Expurgo em 4 Fases

O script [scripts/sql/expurgo_pii_alunos.sql](file:///c:/Users/rafae/Documents/antigravity/hopeful-bell/scripts/sql/expurgo_pii_alunos.sql) segue o protocolo:

```
[Fase 1: Diagnóstico] -> [Fase 2: Quarentena Auditável] -> [Fase 3: DELETE Transacional] -> [Fase 4: Verificação Fail-Safe]
```

1. **Fase 1 — Contagem Diagnóstica:** Executa apenas contagens inofensivas (`COUNT(*)`) para registrar a volumetria exata de linhas afetadas.
2. **Fase 2 — Quarentena com Carimbo Temporal:** Cria tabelas temporárias com prefixo `_quarentena_expurgo_*` contendo cópia integral dos dados e timestamp de arquivamento. Permite reversão imediata caso haja discrepância de notas durante a transição.
3. **Fase 3 — Transação Atômica (`BEGIN ... COMMIT`):**
   - Efetua o `DELETE` nas tabelas `students`, `private_students`, `portal_scraped_data`.
   - Remove as 4 chaves sensíveis de `teacher_sync` (`teacher_students`, `teacher_private_students`, `teacher_student_metrics`, `teacher_student_memory`).
   - Higieniza `portal_execution_logs.extracted_data`, substituindo diffs nominais por contadores anonimizados (`filled_count`).
4. **Fase 4 — Trava de Integridade Pós-Exclusão:** Bloco `DO $$` em PL/pgSQL que verifica se a contagem pós-delete é estritamente `0`. Se restar qualquer linha, dispara `RAISE EXCEPTION` e executa `ROLLBACK` automático.

---

## 3. Política de Retenção e Logs

- **Período de Quarentena Local:** O cofre local Desktop mantém o histórico completo.
- **Retenção de Auditoria na Nuvem:** Logs operacionais de portais (`portal_execution_logs`) mantêm apenas data, portal, ação e contagem (`status: 'success'`, `filled_count: 24`), garantindo auditoria de sistema sem expor identidades de estudantes.
- **Tratamento de Falhas:** Em caso de erro de rede ou interrupção durante a execução, o bloco transacional garante atomicidade (tudo ou nada).

---

## 4. Checklist de Aprovação da Professora

Antes de autorizar a execução do script no console do Supabase, confirme:

- [ ] Todos os dados de alunos em uso na escola estão importados e visíveis no cofre local da aplicação Desktop.
- [ ] O backup manual do arquivo de banco local do Desktop foi realizado (`teacher_vault.db`).
- [ ] A professora verificou e validou a volumetria reportada na Fase 1 do script.
- [ ] Autorização expressa concedida para a execução da Fase 3 (exclusão remota).

---

*Documento elaborado para auditoria e controle de governança de dados do Teacher AI.*
