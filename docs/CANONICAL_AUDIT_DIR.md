# Definição e Auditoria do Diretório Canônico de Auditoria (ORCH_AUDIT_DIR)

Data: 2026-10-09  
Status: CANÔNICO & VERIFICADO

---

## 1. Diretório Canônico Declarado

O diretório canônico do registro de auditoria append-only da orquestração é:
```text
C:\Users\rafae\.gemini\antigravity\orch_audit
```

Arquivo de log:
```text
C:\Users\rafae\.gemini\antigravity\orch_audit\orch_gate_audit.jsonl
```

---

## 2. Evidência Comparativa dos Comandos de Verificação

### Comando 1: com `ORCH_AUDIT_DIR="C:\Users\rafae\.gemini\antigravity\orch_audit"`
```powershell
$env:ORCH_AUDIT_DIR="C:\Users\rafae\.gemini\antigravity\orch_audit"; python scripts/gate.py --verify-log
```
**Saída:**
```text
=== VERIFICANDO INTEGRIDADE DO REGISTRO DE AUDITORIA ===
Arquivo: C:\Users\rafae\.gemini\antigravity\orch_audit\orch_gate_audit.jsonl
[SUCESSO] Total de 17 registros verificados. Encadeamento íntegro e autêntico.
```

### Comando 2: com `ORCH_AUDIT_DIR="C:\Users\rafae\orch_audit"`
```powershell
$env:ORCH_AUDIT_DIR="C:\Users\rafae\orch_audit"; python scripts/gate.py --verify-log
```
**Saída:**
```text
[GATE-ERRO FATAL] Diretório de auditoria especificado em ORCH_AUDIT_DIR não existe: C:\Users\rafae\orch_audit
Regra S5: O diretório de auditoria deve ser pré-configurado fora do repositório.
```

---

## 3. Comportamento Padrão de `scripts/gate.py`

Em `scripts/gate.py`, linhas 336 a 341:
```python
audit_env = args.audit_dir or os.environ.get("ORCH_AUDIT_DIR")
if not audit_env:
    print("[GATE-ERRO FATAL] Variável de ambiente ORCH_AUDIT_DIR não definida.")
    print("Regra S2/S3/S5: O gate exige registro de auditoria append-only fora do repositório.")
    sys.exit(1)
```
**Conclusão:** O `scripts/gate.py` não possui nenhum valor padrão (fallback); se `ORCH_AUDIT_DIR` não for informada via argumento ou ambiente, o script aborta com código 1.

---

## 4. Estado da Variável de Ambiente

Comando:
```powershell
echo $env:ORCH_AUDIT_DIR
```
Saída: *(vazia)* — a variável não é exportada globalmente pelo shell do sistema e deve ser passada explicitamente no ambiente de execução do gate.

---

## 5. Explicação da Divergência

- Não existem dois logs concorrentes ou divergentes.
- `Test-Path "C:\Users\rafae\orch_audit"` retorna `False`.
- `Test-Path "C:\Users\rafae\.gemini\antigravity\orch_audit"` retorna `True`.
- A menção a `C:\Users\rafae\orch_audit` no relatório anterior decorreu de um erro de formatação no texto markdown; o comando executado no processo real sempre utilizou o diretório canônico `.gemini\antigravity\orch_audit`, que contém os 17 registros encadeados.
