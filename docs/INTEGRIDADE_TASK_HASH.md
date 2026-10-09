# Integridade de Tarefas: Hash Bruto vs. Hash Normalizado Travado

**Data:** 2026-10-09  
**Módulo:** `scripts/gate.py`  
**Escopo:** Governança e auditoria imutável de especificações de tarefas (`tasks/*.md`).

---

## 1. O Problema da Circularidade do Hash

Cada especificação de tarefa deve ser imutável após ser travada no commit base da branch de produto.
Se o hash SHA-256 for calculado sobre o arquivo completo (hash bruto) e incluído dentro do próprio arquivo no campo `task_hash_locked: <hash>`, o arquivo é alterado, gerando um novo hash e tornando a autovalidação circular e impossível:
$$\text{hash}(F) \ne \text{hash}(F \cup \{\text{hash}(F)\})$$

---

## 2. A Solução: Hash Normalizado (`compute_normalized_task_hash`)

O portão determinístico (`scripts/gate.py`, linhas 195 a 197) implementa uma função determinística de normalização:

```python
def compute_normalized_task_hash(content: str) -> str:
    lines = [l for l in content.splitlines() if not l.strip().startswith("task_hash_locked:")]
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()
```

### O que a normalização faz:
1. **Ignora Linhas de Metadado de Trava:**  
   Remove do cálculo qualquer linha cujo início seja `task_hash_locked:`. Com isso, o campo pode armazenar o valor do hash do restante do documento sem alterar o resultado do cálculo.
2. **Normalização de Quebras de Linha (`CRLF` $\rightarrow$ `\n`):**  
   Ao usar `content.splitlines()` e recombinar com `"\n".join(...)`, o cálculo é 100% agnóstico ao sistema operacional (Windows `\r\n` vs Linux/macOS `\n`). Uma tarefa commitada no Windows gerará o mesmo hash exato quando avaliada em ambiente Linux de CI.

---

## 3. Como o `gate.py` Valida a Integridade da Tarefa

Ao avaliar a tarefa no commit base (linhas 431 a 440 de `scripts/gate.py`):
1. Lê o conteúdo bruto da tarefa a partir do commit base via `git show <base_commit>:<rel_path>`.
2. Calcula o hash SHA-256 bruto (`task_base_raw_sha`) e o hash normalizado (`task_base_norm_sha`).
3. Compara o valor registrado em `task_hash_locked`:
   ```python
   if task_hash_locked in (task_base_raw_sha, task_base_norm_sha):
       # Hash verificado e aprovado
   ```
4. Se o conteúdo da tarefa foi alterado após o travamento no base, o hash diverge e o gate rejeita a tarefa sumariamente no passo `[2/6]`.

---

## 4. Registro de Execuções Reprovadas no Log de Auditoria

Conforme auditado em `C:\Users\rafae\.gemini\antigravity\orch_audit\orch_gate_audit.jsonl` (ex.: Index 17), **todas as execuções do gate são registradas no log append-only**, sejam elas aprovadas (`status: "APROVADA", passed: true`) ou reprovadas (`status: "REPROVADA", passed: false`), incluindo o código de saída, duração e lista exata de violações.
