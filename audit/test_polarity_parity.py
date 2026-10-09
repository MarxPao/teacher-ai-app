"""
audit/test_polarity_parity.py — Avaliação do Resolvedor de Polaridade de Frequência (JavaScript)
Executa a suíte audit/polarity_test_cases.json contra o módulo canônico teacher-extension/attendancePolarity.js.

Nota de Escopo Arquitetural:
A resolução de polaridade opera exclusivamente no cliente (extensão Chrome Manifest V3, DOM).
Não há módulo Python no sidecar previsto ou especificado na arquitetura.
Paridade Python: [NÃO APLICÁVEL].
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
TEST_CASES_FILE = ROOT_DIR / "audit" / "polarity_test_cases.json"
JS_MODULE_FILE = ROOT_DIR / "teacher-extension" / "attendancePolarity.js"
SIDECAR_MODULE_FILE = ROOT_DIR / "sidecar" / "attendance_polarity.py"

def run_js_polarity_case(case: dict) -> dict:
    js_module_path = str(JS_MODULE_FILE).replace("\\", "/")
    # O harness NÃO reimplementa a lógica: apenas serializa o caso, chama o módulo JS e retorna a resposta
    intent_json = json.dumps(case.get('teacher_intent'))
    header_json = json.dumps(case.get('column_header'))
    label_json = json.dumps(case.get('control_label'))
    extra_json = json.dumps(case.get('extra_signals'))
    js_code = f"""
    const AttendancePolarity = require('{js_module_path}');
    const res = AttendancePolarity.resolveAttendancePolarity({header_json}, {label_json}, {intent_json}, {extra_json});
    console.log(JSON.stringify(res));
    """
    proc = subprocess.run(["node", "-e", js_code], capture_output=True, text=True, check=True)
    return json.loads(proc.stdout.strip())

def test_polarity_parity():
    test_cases = json.loads(TEST_CASES_FILE.read_text(encoding="utf-8"))
    print("\n=======================================================")
    print(f"  AVALIACAO DO RESOLVEDOR DE POLARIDADE ({len(test_cases)} CASOS)")
    print("=======================================================\n")

    # Verifica se sidecar existe (escopo exclusivo da extensão)
    if SIDECAR_MODULE_FILE.exists():
        print(f"[SIDECAR] Módulo python detectado em {SIDECAR_MODULE_FILE}.")
    else:
        print("[ESCOPO] Resolvedor canônico é exclusivamente JavaScript (extensão). Paridade Python: [NÃO APLICÁVEL].")

    # Verifica se o módulo JS exporta a lista de intenções (fonte única de verdade)
    js_module_path = str(JS_MODULE_FILE).replace("\\", "/")
    chk_code = f"""
    const AttendancePolarity = require('{js_module_path}');
    if (!AttendancePolarity.VALID_INTENTS || typeof AttendancePolarity.parseTeacherIntent !== 'function') {{
        console.error('Módulo não exporta VALID_INTENTS ou parseTeacherIntent!');
        process.exit(1);
    }}
    console.log(JSON.stringify(AttendancePolarity.VALID_INTENTS));
    """
    chk_proc = subprocess.run(["node", "-e", chk_code], capture_output=True, text=True)
    if chk_proc.returncode != 0:
        print(f"[ERRO DE CONTRATO] {chk_proc.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    print(f"[FONTE UNICA DE INTENCOES] {chk_proc.stdout.strip()}\n")

    passed_count = 0
    superseded_count = 0
    failures = []

    for idx, case in enumerate(test_cases, 1):
        c_id = case["id"]
        c_desc = case["description"]
        exp_resolve = case["expected_can_resolve"]
        exp_pol = case["expected_polarity"]
        exp_checked = case["expected_should_be_checked"]

        # Trata casos marcados como superados genericamente (campo superseded_by no JSON)
        if case.get("superseded_by"):
            target_id = case["superseded_by"]
            superseded_count += 1
            print(f"[{idx:02d}] {c_id}: SUPERSEDED (superado por {target_id})")
            continue

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
            if js_res.get("reason"):
                print(f"     Motivo:   {js_res.get('reason')}")

    total = len(test_cases)
    fail_count = len(failures)
    print("\n=======================================================")
    print(f"  RESULTADO FINAL: {passed_count} aprovados, {fail_count} falhos, {superseded_count} superado (de {total})")
    if failures:
        print(f"  CASOS FALHOS (FAIL) - TOTAL: {fail_count}:")
        for f_id, f_res, f_case in failures:
            print(f"    - [{f_id}] {f_case.get('description', '')}")
            print(f"      Esperado: canResolve={f_case.get('expected_can_resolve')}, polarity={f_case.get('expected_polarity')}, shouldBeChecked={f_case.get('expected_should_be_checked')}")
            print(f"      Obtido:   canResolve={f_res.get('canResolve')}, polarity={f_res.get('polarity')}, shouldBeChecked={f_res.get('shouldBeChecked')}")
            if f_res.get("reason"):
                print(f"      Motivo:   {f_res.get('reason')}")
    else:
        print("  Falhas: 0")
    print("=======================================================\n")

    assert (passed_count + superseded_count) == total, f"Falha na suite de polaridade: {len(failures)} caso(s) falharam"

if __name__ == "__main__":
    try:
        test_polarity_parity()
        sys.exit(0)
    except AssertionError as e:
        print(f"\n[ERRO DE ACEITE] {e}", file=sys.stderr)
        sys.exit(1)
