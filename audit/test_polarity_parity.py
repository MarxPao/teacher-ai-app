"""
audit/test_polarity_parity.py — Avaliacao do Resolvedor de Polaridade de Frequencia
Executa a suite audit/polarity_test_cases.json contra o modulo oficial teacher-extension/attendancePolarity.js.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
TEST_CASES_FILE = ROOT_DIR / "audit" / "polarity_test_cases.json"
JS_MODULE_FILE = ROOT_DIR / "teacher-extension" / "attendancePolarity.js"

def run_js_polarity_case(case: dict) -> dict:
    js_module_path = str(JS_MODULE_FILE).replace("\\", "/")
    js_code = f"""
    const AttendancePolarity = require('{js_module_path}');
    const res = AttendancePolarity.resolveAttendancePolarity(
        {json.dumps(case['column_header'])},
        {json.dumps(case['control_label'])},
        {json.dumps(case['teacher_intent'])}
    );
    console.log(JSON.stringify(res));
    """
    proc = subprocess.run(["node", "-e", js_code], capture_output=True, text=True, check=True)
    return json.loads(proc.stdout.strip())

def test_polarity_parity():
    test_cases = json.loads(TEST_CASES_FILE.read_text(encoding="utf-8"))
    print("\n=======================================================")
    print("  AVALIACAO DO RESOLVEDOR DE POLARIDADE (11 CASOS)")
    print(f"  Total de casos avaliados: {len(test_cases)}")
    print("=======================================================\n")

    passed_count = 0
    failures = []

    for idx, case in enumerate(test_cases, 1):
        c_id = case["id"]
        c_desc = case["description"]
        exp_resolve = case["expected_can_resolve"]
        exp_pol = case["expected_polarity"]
        exp_checked = case["expected_should_be_checked"]

        js_res = run_js_polarity_case(case)
        ok = (
            js_res.get("canResolve") == exp_resolve
            and js_res.get("polarity") == exp_pol
            and js_res.get("shouldBeChecked") == exp_checked
        )

        if ok:
            passed_count += 1
            print(f"[{idx:02d}] {c_id}: PASS")
        else:
            failures.append((c_id, js_res, case))
            print(f"[{idx:02d}] {c_id}: FAIL")
            print(f"     Esperado: canResolve={exp_resolve}, pol={exp_pol}, checked={exp_checked}")
            print(f"     Obtido:   canResolve={js_res.get('canResolve')}, pol={js_res.get('polarity')}, checked={js_res.get('shouldBeChecked')}")

    total = len(test_cases)
    print("\n=======================================================")
    print(f"  RESULTADO FINAL: {passed_count}/{total} casos aprovados")
    print("=======================================================\n")

    assert passed_count == total, f"Falha na suite de polaridade: {len(failures)} caso(s) falharam: {failures}"

if __name__ == "__main__":
    try:
        test_polarity_parity()
        sys.exit(0)
    except AssertionError as e:
        print(f"\n[ERRO DE ACEITE] {e}", file=sys.stderr)
        sys.exit(1)
