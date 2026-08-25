"""
run_tests.py — Executor dos testes unitários do Sidecar em Python
"""

import os
import sys

# Garante suporte a UTF-8 no terminal Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(__file__))

from capability_router import classify_action, model_supports_vision, can_execute_autonomously
from sanitizer import scrub_text, mask_student_name, clean_state_snapshot
from auth import generate_device_code

def run():
    print("=" * 60)
    print(" [TESTES] Executando testes unitários do Sidecar (Python)")
    print("=" * 60)

    # 1. Testes de Classificação de Ações
    assert classify_action("diary", "machado", True) == "low_complexity"
    assert classify_action("grades", "santacatarina", True) == "low_complexity"
    assert classify_action("grades", "desconhecido", False) == "high_complexity"
    print(" [OK] 1. Capability Router — Classificação de Ações")

    # 2. Testes de Suporte a Visão BYOK
    assert model_supports_vision("openai", "gpt-4o") is True
    assert model_supports_vision("anthropic", "claude-3-5-sonnet") is True
    assert model_supports_vision("gemini", "gemini-2.0-flash") is True
    assert model_supports_vision("groq", "llama-3.3-70b-versatile") is False
    assert model_supports_vision("deepseek", "deepseek-v3") is False
    print(" [OK] 2. Capability Router — Detecção de Visão BYOK")

    # 3. Teste de Autonomia e Bloqueio
    can_run, comp, reason = can_execute_autonomously("diary", "machado", "groq", "llama-3")
    assert can_run is True
    assert comp == "low_complexity"

    can_run, comp, reason = can_execute_autonomously("grades", "portal_novo", "groq", "llama-3", False)
    assert can_run is False
    assert "otimizado para texto" in reason

    can_run, comp, reason = can_execute_autonomously("grades", "portal_novo", "openai", "gpt-4o", False)
    assert can_run is True
    print(" [OK] 3. Capability Router — Regras de Bloqueio e Permissão")

    # 4. Testes de Sanitização LGPD
    raw = "Aluno João da Silva - CPF 123.456.789-00 - tel (31) 98877-6655"
    cleaned = scrub_text(raw)
    assert "123.456.789-00" not in cleaned
    assert "[CPF_PROTEGIDO]" in cleaned
    assert "[TEL_PROTEGIDO]" in cleaned
    assert mask_student_name("Mariana Lima") == "Mariana L."
    print(" [OK] 4. Sanitização LGPD e Mascaramento de Nomes")

    # 5. Teste de Código de Pareamento
    code = generate_device_code()
    assert code.startswith("TA-")
    assert len(code) == 7
    print(f" [OK] 5. Gerador de Código de Pareamento ({code})")

    # 6. Teste de Montagem de Diff e Guard de Submissão no Runner
    from browser_harness_runner import BrowserHarnessRunner
    runner = BrowserHarnessRunner()
    
    # Montagem de diff para notas
    diff_grades = runner._build_diff({}, {
        "studentGrades": [{"name": "Lucas Silva", "grade": 8.5}, {"name": "Mariana Lima", "grade": 9.0}],
        "evaluationName": "Prova 1"
    })
    assert len(diff_grades) == 2
    assert diff_grades[0]["studentName"] == "Lucas Silva"
    assert diff_grades[0]["afterValue"] == 8.5

    # Montagem de diff para faltas
    diff_att = runner._build_diff({}, {
        "absentStudents": ["Lucas Silva", "Pedro Costa"]
    })
    assert len(diff_att) == 2
    assert diff_att[0]["afterValue"] == "Ausente (Falta)"

    print(" [OK] 6. BrowserHarnessRunner — Montagem de Diff e Estrutura de Automação")

    print("\n TODOS OS TESTES EM PYTHON PASSARAM COM 100% DE SUCESSO!")

if __name__ == "__main__":
    run()
