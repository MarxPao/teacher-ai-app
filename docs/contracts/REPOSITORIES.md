# Contratos de Repositório e Camada de Acesso a Dados

**Status:** CONGELADO (Fase 1)  
**Localização:** `lib/repositories/`

---

## 1. Regra Arquitetural Inegociável

> **A partir da Fase 2, todo código novo acessa dados de alunos, turmas, notas e grafos EXCLUSIVAMENTE através das interfaces de repositório (`lib/repositories/`).**
> É estritamente proibido criar novos acessos diretos a `localStorage`, `localDB.ts`, ou clientes HTTP/Supabase no código de aplicação.

Essa diretriz prepara o Teacher AI para a transição transparente para o banco local cifrado (SQLite) no Desktop App (Fase 6), sem necessidade de reescrever a lógica de negócio ou as automações de tela.

---

## 2. Catálogo de Interfaces Congeladas

1. **`StudentRepository` (`lib/repositories/StudentRepository.ts`)**
   - Centraliza consultas e mutações de turmas, alunos regulares, frequência e notas.
   - Todo retorno é tipado e validado contra o modelo canônico (`lib/contracts/canonical.ts`).
   - Define formalmente os ganchos de conformidade LGPD:
     - `exportStudentData(studentId)`: portabilidade de dados.
     - `eraseStudentData(studentId)`: direito ao esquecimento e expurgo seguro.
2. **`PrivateStudentRepository` (`lib/repositories/PrivateStudentRepository.ts`)**
   - Isola o domínio de aulas particulares (dados financeiros, mensalidades, telefones e responsáveis legais).
3. **`SkillGraphRepository` (`lib/repositories/SkillGraphRepository.ts`)**
   - Gerencia a persistência de grafos compilados.
   - **Imutabilidade de versão:** versões publicadas de um mapa nunca são sobrescritas; toda melhoria resulta em incremento de versão.
4. **`LocalStorageStudentRepository` (`lib/repositories/LocalStorageStudentRepository.ts`)**
   - Adaptador transitório sobre o `localDB.ts` existente, permitindo consumo da interface antes da chegada do SQLite.
   - Métodos ainda não suportados pelo modelo legado emitem `NotImplementedError` explícito.

---

## 3. Inventário de Arquivos Dependentes de `localDB` (Insumo para a Fase 6)

Durante a auditoria de reconhecimento (T1.1), foram mapeados **14 arquivos** que atualmente importam `localDB.ts` diretamente. Estes arquivos formam a lista exata a ser migrada para as interfaces de repositório na Fase 6:

1. `components/modules/Classes.tsx`
2. `components/modules/OmniGrader.tsx`
3. `components/modules/PrivateTutoring.tsx`
4. `components/modules/QuestionBank.tsx`
5. `components/modules/QuickGenerate.tsx`
6. `components/modules/Rubric.tsx`
7. `components/modules/Students.tsx`
8. `components/shared/StudentProfilePanel.tsx`
9. `lib/dataPortability.ts`
10. `lib/extensionSyncBus.ts`
11. `__tests__/byokValidationAndPortability.test.ts`
12. `__tests__/extensionSyncBus.test.ts`
13. `__tests__/rubricSecurityAudit.test.ts`
14. `__tests__/safeSetStorageResilience.test.ts`
