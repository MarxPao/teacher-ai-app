# Guia Canônico: Diretório de Auditoria e Verificação do Gate (ORCH_AUDIT_DIR)

**Data:** 2026-10-09  
**Status:** CANÔNICO, AUDITADO E VERIFICADO  
**Público-alvo:** Qualquer auditor ou desenvolvedor operando o repositório.

---

## 1. Caminho Canônico do Registro de Auditoria

O diretório canônico do registro append-only de auditoria do gate é:
```text
C:\Users\rafae\.gemini\antigravity\orch_audit
```

O arquivo físico de log contendo a cadeia criptográfica é:
```text
C:\Users\rafae\.gemini\antigravity\orch_audit\orch_gate_audit.jsonl
```

---

## 2. Como Executar a Verificação com Sucesso (Primeira Tentativa)

No PowerShell, execute exatamente o comando abaixo:

```powershell
$env:ORCH_AUDIT_DIR="C:\Users\rafae\.gemini\antigravity\orch_audit"; python scripts/gate.py --verify-log
```

### Saída Esperada de Sucesso:
```text
=== VERIFICANDO INTEGRIDADE DO REGISTRO DE AUDITORIA ===
Arquivo: C:\Users\rafae\.gemini\antigravity\orch_audit\orch_gate_audit.jsonl
[SUCESSO] Total de 17 registros verificados. Encadeamento íntegro e autêntico.
```

---

## 3. Comportamento Intencional de Segurança (Regra S5)

A variável de ambiente `ORCH_AUDIT_DIR` **NÃO está definida por padrão no ambiente do sistema** (`echo $env:ORCH_AUDIT_DIR` retorna vazio).

Se o comando for executado diretamente sem definir a variável:
```powershell
python scripts/gate.py --verify-log
```

O gate falhará imediatamente com código de saída 1 e a mensagem de erro S5:
```text
[GATE-ERRO FATAL] Variável de ambiente ORCH_AUDIT_DIR não definida.
Regra S2/S3/S5: O gate exige registro de auditoria append-only fora do repositório.
```

> **Por que isso é intencional?**  
> A regra de segurança S5 exige que o registro de auditoria viva obrigatoriamente fora do repositório git (`hopeful-bell`), sob custódia de um diretório externo controlado. O script `scripts/gate.py` (linhas 336 a 341) recusa intencionalmente qualquer valor de fallback ou suposição de caminho para impedir que auditorias sejam gravadas no repositório ou mascaradas.

---

## 4. Esclarecimento Sobre o Caminho `C:\Users\rafae\orch_audit`

- O caminho `C:\Users\rafae\orch_audit` **NÃO existe fisicamente no disco** (`Test-Path "C:\Users\rafae\orch_audit"` $\rightarrow$ `False`).
- Sua aparição em relatórios anteriores decorreu puramente de um **erro de digitação/formatação no texto markdown** ao omitir o segmento `.gemini\antigravity\`.
- O processo real e o gate sempre operaram e validaram contra o diretório canônico `C:\Users\rafae\.gemini\antigravity\orch_audit`.
- Não existem dois arquivos de log nem duplicidade de registros.
