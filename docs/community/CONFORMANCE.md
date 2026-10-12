# Guia da Suíte Adversarial de Comunidade (CONFORMANCE.md)

Este documento descreve a suíte de testes de conformidade, receitas adversariais e a proteção do HOLDOUT travado na **Fase 7 (Comunidade)**.

---

## 1. Arquitetura da Suíte

A suíte adversarial avalia o motor comunitário de forma independente e cega:
1. **Chaves Determinísticas (`conformance/community/testKeys.ts`):** Chaves Ed25519 derivadas de sementes fixas em código (`TEST_ONLY`). Nenhuma chave real reside no repositório.
2. **Grafos Base (`conformance/community/base/`):** 6 grafos canônicos estruturados segundo o contrato SkillGraph v2.0 com hosts placeholders (`h1.invalid`, `h2.invalid`).
3. **Receitas Declarativas:**
   - **DEV (`conformance/community/dev/`):** 12 casos (4 legítimos + 8 hostis). Utilizados durante o desenvolvimento para aferição de conformidade e calibração de regras.
   - **HOLDOUT (`conformance/community/holdout/`):** 20 casos (6 legítimos + 14 hostis). **Conjunto travado via SHA-256**, contra o qual é expressamente proibido calibrar o verificador.
4. **Gerador Independente (`scripts/community/conformance-build.ts`):** Construtor de pacotes isolado que não importa nenhuma biblioteca de `lib/desktop-core/community`. Possui canonicalização JCS e assinatura Ed25519 próprias e mínimas ($\le 250$ linhas).

---

## 2. Como Gerar os Artefatos

Para compilar as receitas e gerar os pacotes `.skillpkg.json` e o `index.json` do registro:

```powershell
npm run community:conformance:build
```

Os artefatos compilados são gerados em `conformance/community/out/` (ignorado pelo Git).

---

## 3. Proteção do HOLDOUT e Lock Criptográfico

O arquivo `conformance/community/holdout.lock` contém a lista imutável de hashes SHA-256 de:
- Todas as 20 receitas do HOLDOUT (`holdout/*.recipe.json`);
- Todos os 6 grafos-base (`base/*.json`);
- O arquivo de chaves de teste `testKeys.ts`;
- O código do gerador independente `scripts/community/conformance-build.ts`.

### Regra Anti-Overfitting
Qualquer alteração em `lib/desktop-core/community/**` motivada por falha do HOLDOUT exige aprovação expressa do proprietário do projeto. A conformidade do HOLDOUT é executada e homologada pelo dono no **GATE A**.

---

## 4. Metas da Suíte Adversarial

| Métrica de Conformidade | Meta Exigida |
| :--- | :---: |
| **Casos Hostis Aceitos (DEV)** | **0** |
| **Casos Hostis Aceitos (HOLDOUT)** | **0** |
| **Casos Legítimos Aceitos (DEV e HOLDOUT)** | $\ge 85\%$ (máx. 1 falso-rejeitado) |
| **Integridade do Lock (`holdout.lock`)** | $100\%$ íntegro |
