# Relatório do GATE A — Núcleo Comunitário, Conformidade DEV e Quarentena (Fase 7)

**Data:** 11/10/2026  
**Status do Gate:** Pronto para Auditoria Humana  
**Branch:** `fase-7-comunidade`

---

## 1. Resumo Executivo

A primeira metade da Fase 7 implementou a infraestrutura fundamental para distribuição segura de mapas pedagógicos (`SkillGraphV2`) entre professoras, garantindo que nenhum dado pessoal ou identificador de escola saia da máquina local e que nenhum pacote de terceiro possa executar ações sem revisão explícita e quarentena ativa.

- **Zero dependências npm adicionadas:** Criptografia de curva elíptica Ed25519 e hashing SHA-256 executados exclusivamente via `node:crypto`.
- **Canonicalização JCS pura (RFC 8785):** Ordenação léxica e serialização determinística em TypeScript puro.
- **Parser JSON Estrito:** Bloqueia chaves duplicadas no mesmo objeto, poluição de protótipo (`__proto__`, `constructor`, `prototype`) e profundidades superiores a 32 níveis.
- **Sanitização estrita:** Substituição determinística de domínios por marcadores `h<N>.invalid`, neutralização de `portal_id`, bloqueio de reexportação de mapas importados e expurgo de termos protegidos e PII.
- **Importador com Quarentena:** Pipeline de 13 estágios com derivação local auditada (`assertAllowedDifferencesOnly`), relatório de efeitos de nós arriscados e bloqueio de ativação até aprovação humana e dry-run concluído.

---

## 2. Checklist do GATE A

| Critério de Aceite | Status | Evidência / Arquivo |
| :--- | :---: | :--- |
| **Canonicalização RFC 8785** | APROVADO | `canonical.ts`, 2 testes passando em `community.core.test.ts` |
| **Parser Estrito Anti-Tampering** | APROVADO | `strictJson.ts`, 4 testes dedicados cobrindo duplicatas, `__proto__` e profundidade |
| **Assinatura Ed25519 Nativa** | APROVADO | `signing.ts`, zero pacotes npm novos no `package.json` |
| **Exportação Sanitizada (h<N>.invalid)** | APROVADO | `export/`, varredura de PII e bloqueio de reexportação testados |
| **Importador com Quarentena** | APROVADO | `import/pipeline.ts` (13 estágios), `quarantine.ts`, `effectsReport.ts` |
| **Conformidade DEV (12 casos)** | APROVADO (12/12) | `npm run community:conformance` (4 legítimos aceitos, 8 hostis rejeitados honestamente) |
| **Suíte de Testes de Fronteira** | APROVADO (27/27) | `npx vitest run __tests__/community.core.test.ts` (27 passed) |
| **Integridade de holdout.lock** | APROVADO | Hash SHA-256 de todas as 20 receitas do holdout, grafos base e gerador travados e intactos |
| **Demonstração Pedagógica (Demo)** | APROVADO | `npm run community:demo` executando o fluxo completo com clareza |
| **Inspeção de Pacotes (CLI)** | APROVADO | `npm run community:import-check` inspeciona pacotes sem tocar no banco |

---

## 3. Instruções para Execução do HOLDOUT pelo Auditor

Conforme a regra de rigor técnico da Fase 7, o agente orquestrador **NÃO executou** o conjunto HOLDOUT para preservar a integridade cega da avaliação.

Para verificar a suíte HOLDOUT completa (20 receitas adicionais), o auditor deve rodar no terminal:

```powershell
npm run community:conformance -- --include-holdout
```

---

## 4. Próximos Passos (Parte B)

Após a aprovação do GATE A pelo dono do projeto:
- **T7.7:** Migração `002` do SQLite com tabelas de pacotes comunitários, chaves e quarentena + enforcement em `SqlSkillGraphRepository` (`E_GRAPH_QUARANTINED`).
- **T7.8:** Cliente estático de registro comunitário, pinning de chaves, IPC UI-only e proteções de runtime no Driver/Runner (`describeClickTarget`, anti-submissão não declarada).
- **T7.9:** Interface visual da Comunidade no desktop (busca, quarentena, dry-run e ativação).
- **T7.10:** Template de repositório de registro comunitário e documentação.
