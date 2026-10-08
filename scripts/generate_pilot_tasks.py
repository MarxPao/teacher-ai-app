import hashlib
from pathlib import Path

tasks = [
    {
        "filename": "task-pilot-1-haladyna.md",
        "content": """---
id: task-pilot-1-haladyna
objetivo: Adicionar funcao pura detectRedundantNegatives em lib/haladynaLinter.ts com testes unitarios em __tests__/haladynaRedundantNegative.test.ts
criterio_de_aceite: npx vitest run __tests__/haladynaRedundantNegative.test.ts
files_allowed:
  - lib/haladynaLinter.ts
  - __tests__/haladynaRedundantNegative.test.ts
files_forbidden:
  - scripts/gate.py
  - tasks/**
  - STATE.md
  - audit/eval/**
  - EVAL_HASHES.txt
depende_de: []
modelo_sugerido: barato
orcamento:
  max_tokens: 15000
  max_tentativas: 2
  max_minutos: 5
estado: a_fazer
responsavel: orquestrador
---
# Tarefa Piloto 1: Linter Haladyna - Deteccao de Negativas Redundantes
"""
    },
    {
        "filename": "task-pilot-2-school.md",
        "content": """---
id: task-pilot-2-school
objetivo: Adicionar funcoes puras formatInepCode e isValidInepCode em lib/schoolUtils.ts com testes unitarios em __tests__/schoolUtilsInep.test.ts
criterio_de_aceite: npx vitest run __tests__/schoolUtilsInep.test.ts
files_allowed:
  - lib/schoolUtils.ts
  - __tests__/schoolUtilsInep.test.ts
files_forbidden:
  - scripts/gate.py
  - tasks/**
  - STATE.md
  - audit/eval/**
  - EVAL_HASHES.txt
depende_de: []
modelo_sugerido: barato
orcamento:
  max_tokens: 15000
  max_tentativas: 2
  max_minutos: 5
estado: a_fazer
responsavel: orquestrador
---
# Tarefa Piloto 2: Utilitarios de Escola - Validacao e Formatacao de INEP
"""
    },
    {
        "filename": "task-pilot-3-class.md",
        "content": """---
id: task-pilot-3-class
objetivo: Adicionar funcao pura calculateGradeDispersion em lib/classUtils.ts com testes unitarios em __tests__/classUtilsDispersion.test.ts
criterio_de_aceite: npx vitest run __tests__/classUtilsDispersion.test.ts
files_allowed:
  - lib/classUtils.ts
  - __tests__/classUtilsDispersion.test.ts
files_forbidden:
  - scripts/gate.py
  - tasks/**
  - STATE.md
  - audit/eval/**
  - EVAL_HASHES.txt
depende_de: []
modelo_sugerido: barato
orcamento:
  max_tokens: 15000
  max_tentativas: 2
  max_minutos: 5
estado: a_fazer
responsavel: orquestrador
---
# Tarefa Piloto 3: Utilitarios de Turma - Dispersao Estatistica de Notas
"""
    }
]

for item in tasks:
    content = item["content"].strip() + "\n"
    lines = [l for l in content.splitlines() if not l.strip().startswith("task_hash_locked:")]
    norm_hash = hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()
    parts = content.split("---")
    fm = parts[1]
    new_fm = fm.rstrip() + f"\ntask_hash_locked: {norm_hash}\n"
    final_content = "---" + new_fm + "---" + parts[2]
    out_path = Path("tasks") / item["filename"]
    out_path.write_text(final_content, encoding="utf-8")
    print(f"Gerado {item['filename']} com task_hash_locked={norm_hash}")
