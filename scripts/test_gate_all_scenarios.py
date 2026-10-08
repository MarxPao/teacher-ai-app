#!/usr/bin/env python3
"""
scripts/test_gate_all_scenarios.py — Bateria de Testes de Aceite do Gate (Etapa 0)

Executa de forma determinística e isolada cada um dos cenários exigidos:
  1. ORCH_AUDIT_DIR ausente (deve falhar)
  2. Arquivo STOP presente (deve abortar imediatamente)
  3. Duas tarefas com files_allowed sobrepostos (deve recusar)
  4. Violação de files_allowed (arquivo não protegido), já COMMITADA (deve reprovar)
  5. Arquivo renomeado e apagado (deve rastrear via git diff base...HEAD)
  6. Critério de aceite que falha (deve reprovar)
  7. Critério de aceite com timeout (deve reprovar por timeout)
  8. Teste de aceite enfraquecido no mesmo diff (deve reprovar)
  9. Segredo falso plantado (JWT/chave) e PII falsa (deve reprovar)
 10. Diff acima do limite (mostra limite e reprova)
 11. Verificação do registro de auditoria encadeado (íntegro vs adulterado)
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BASE_COMMIT = "main"
AUDIT_DIR = Path(r"C:\Users\rafae\.gemini\orch_audit_test").resolve()
WORKTREES_DIR = REPO_ROOT / ".worktrees"

def run_cmd(cmd: list, cwd: Path = REPO_ROOT, env: dict = None) -> tuple:
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    res = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=full_env
    )
    return res.returncode, res.stdout, res.stderr

def print_scenario_header(num: int, title: str):
    print("\n" + "=" * 78)
    print(f" CENÁRIO {num}: {title}")
    print("=" * 78)

def print_result(code: int, stdout: str, stderr: str):
    print(f"Exit Code: {code}")
    if stdout.strip():
        print("STDOUT:")
        print(stdout.rstrip())
    if stderr.strip():
        print("STDERR:")
        print(stderr.rstrip())

def cleanup_branch_and_worktree(branch_name: str, wt_path: Path):
    if wt_path.exists():
        run_cmd(["git", "worktree", "remove", "--force", str(wt_path)], cwd=REPO_ROOT)
        if wt_path.exists():
            shutil.rmtree(wt_path, ignore_errors=True)
    run_cmd(["git", "branch", "-D", branch_name], cwd=REPO_ROOT)

def main():
    print("=== INICIANDO EXECUÇÃO INTEGRAL DOS CENÁRIOS DO GATE ===")
    print(f"Repositório: {REPO_ROOT}")
    print(f"Audit Dir:   {AUDIT_DIR}")
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    audit_file = AUDIT_DIR / "orch_gate_audit.jsonl"
    if audit_file.exists():
        audit_file.unlink()

    env_with_audit = {"ORCH_AUDIT_DIR": str(AUDIT_DIR)}

    # Obtém hashes canônicos das tarefas na main
    task_hashes = {}
    for task_file in REPO_ROOT.glob("tasks/*.md"):
        code, out, _ = run_cmd(["git", "show", f"main:{task_file.name if 'tasks/' not in str(task_file) else task_file.relative_to(REPO_ROOT).as_posix()}"], cwd=REPO_ROOT)
        if code == 0:
            import hashlib
            raw_hash = hashlib.sha256(out.encode("utf-8")).hexdigest()
            task_hashes[task_file.name] = raw_hash

    # -------------------------------------------------------------
    # 1. ORCH_AUDIT_DIR ausente / inexistente
    # -------------------------------------------------------------
    print_scenario_header(1, "ORCH_AUDIT_DIR ausente / inexistente")
    # Subcenário A: Variável ausente
    code_1a, out_1a, err_1a = run_cmd(
        [sys.executable, "scripts/gate.py", "tasks/task-test-pass.md", "--base", "main"],
        cwd=REPO_ROOT,
        env={"ORCH_AUDIT_DIR": ""}
    )
    print("--- 1A: Variável ORCH_AUDIT_DIR não definida ---")
    print_result(code_1a, out_1a, err_1a)

    # Subcenário B: Diretório inexistente
    code_1b, out_1b, err_1b = run_cmd(
        [sys.executable, "scripts/gate.py", "tasks/task-test-pass.md", "--base", "main", "--audit-dir", r"C:\caminho_inexistente_12345"],
        cwd=REPO_ROOT,
        env={"ORCH_AUDIT_DIR": ""}
    )
    print("\n--- 1B: Diretório de auditoria inexistente em disco ---")
    print_result(code_1b, out_1b, err_1b)

    # -------------------------------------------------------------
    # 2. Arquivo STOP presente
    # -------------------------------------------------------------
    print_scenario_header(2, "Arquivo STOP presente na raiz (Aborto Imediato)")
    stop_file = REPO_ROOT / "STOP"
    stop_file.write_text("Emergencia acionada pelo operador humano", encoding="utf-8")
    try:
        code_2, out_2, err_2 = run_cmd(
            [sys.executable, "scripts/gate.py", "tasks/task-test-pass.md", "--base", "main", "--task-hash", task_hashes.get("task-test-pass.md", "")],
            cwd=REPO_ROOT,
            env=env_with_audit
        )
        print_result(code_2, out_2, err_2)
    finally:
        if stop_file.exists():
            stop_file.unlink()

    # -------------------------------------------------------------
    # 3. Duas tarefas com files_allowed sobrepostos
    # -------------------------------------------------------------
    print_scenario_header(3, "Duas tarefas com files_allowed sobrepostos (check-overlap)")
    code_3, out_3, err_3 = run_cmd(
        [sys.executable, "scripts/gate.py", "--check-overlap", "tasks/task-test-overlap-a.md", "tasks/task-test-overlap-b.md"],
        cwd=REPO_ROOT,
        env=env_with_audit
    )
    print_result(code_3, out_3, err_3)

    # -------------------------------------------------------------
    # 4. Violação de files_allowed (arquivo não protegido), já COMMITADA
    # -------------------------------------------------------------
    print_scenario_header(4, "Violação de files_allowed (arquivo não protegido), já COMMITADA")
    branch_4 = "task/test-unauthorized-commit"
    wt_4 = WORKTREES_DIR / "wt-unauth-commit"
    cleanup_branch_and_worktree(branch_4, wt_4)
    run_cmd(["git", "worktree", "add", "-b", branch_4, str(wt_4), "main"], cwd=REPO_ROOT)
    try:
        # Modifica arquivo permitido
        mod_allowed = wt_4 / "teacher-extension/modulo_permitido_teste.js"
        mod_allowed.parent.mkdir(parents=True, exist_ok=True)
        mod_allowed.write_text("// Codigo permitido\nconsole.log('Permitido');\n", encoding="utf-8")
        
        # Cria e commita arquivo NAO PERMITIDO (desprotegido, mas fora de files_allowed)
        unauth_file = wt_4 / "unauthorized_extra_file.js"
        unauth_file.write_text("// Codigo fora de files_allowed\nconsole.log('Invasao de escopo');\n", encoding="utf-8")
        
        run_cmd(["git", "add", "."], cwd=wt_4)
        run_cmd(["git", "commit", "-m", "commit com arquivo fora de files_allowed"], cwd=wt_4)

        code_4, out_4, err_4 = run_cmd(
            [sys.executable, str(REPO_ROOT / "scripts/gate.py"), "tasks/task-test-pass.md", "--base", "main", "--worktree", str(wt_4), "--task-hash", task_hashes.get("task-test-pass.md", "")],
            cwd=REPO_ROOT,
            env=env_with_audit
        )
        print_result(code_4, out_4, err_4)
    finally:
        cleanup_branch_and_worktree(branch_4, wt_4)

    # -------------------------------------------------------------
    # 5. Arquivo renomeado e apagado
    # -------------------------------------------------------------
    print_scenario_header(5, "Arquivo renomeado e apagado fora de files_allowed")
    branch_5 = "task/test-rename-delete"
    wt_5 = WORKTREES_DIR / "wt-rename-delete"
    cleanup_branch_and_worktree(branch_5, wt_5)
    run_cmd(["git", "worktree", "add", "-b", branch_5, str(wt_5), "main"], cwd=REPO_ROOT)
    try:
        # Cria um arquivo base dummy na main para renomear e apagar
        dummy_del = wt_5 / "arquivo_para_apagar.js"
        dummy_del.write_text("// Arquivo temporario\n", encoding="utf-8")
        run_cmd(["git", "add", "arquivo_para_apagar.js"], cwd=wt_5)
        run_cmd(["git", "commit", "-m", "adiciona arquivo base para apagar"], cwd=wt_5)
        base_commit_5 = run_cmd(["git", "rev-parse", "HEAD"], cwd=wt_5)[1].strip()

        # Agora apaga e cria renomeado fora de files_allowed
        run_cmd(["git", "rm", "arquivo_para_apagar.js"], cwd=wt_5)
        renamed_file = wt_5 / "arquivo_renomeado_nao_autorizado.js"
        renamed_file.write_text("// Renomeado sem autorizacao\n", encoding="utf-8")
        run_cmd(["git", "add", "arquivo_renomeado_nao_autorizado.js"], cwd=wt_5)
        run_cmd(["git", "commit", "-m", "apaga e renomeia fora de files_allowed"], cwd=wt_5)

        code_5, out_5, err_5 = run_cmd(
            [sys.executable, str(REPO_ROOT / "scripts/gate.py"), "tasks/task-test-pass.md", "--base", base_commit_5, "--worktree", str(wt_5), "--task-hash", task_hashes.get("task-test-pass.md", "")],
            cwd=REPO_ROOT,
            env=env_with_audit
        )
        print_result(code_5, out_5, err_5)
    finally:
        cleanup_branch_and_worktree(branch_5, wt_5)

    # -------------------------------------------------------------
    # 6. Critério de aceite que falha
    # -------------------------------------------------------------
    print_scenario_header(6, "Critério de aceite que falha (Exit code != 0)")
    branch_6 = "task/test-crit-fail"
    wt_6 = WORKTREES_DIR / "wt-crit-fail"
    cleanup_branch_and_worktree(branch_6, wt_6)
    run_cmd(["git", "worktree", "add", "-b", branch_6, str(wt_6), "main"], cwd=REPO_ROOT)
    try:
        mod_allowed = wt_6 / "teacher-extension/modulo_permitido_teste.js"
        mod_allowed.parent.mkdir(parents=True, exist_ok=True)
        mod_allowed.write_text("// Codigo valido\n", encoding="utf-8")
        run_cmd(["git", "add", "."], cwd=wt_6)
        run_cmd(["git", "commit", "-m", "implementacao da tarefa"], cwd=wt_6)

        code_6, out_6, err_6 = run_cmd(
            [sys.executable, str(REPO_ROOT / "scripts/gate.py"), "tasks/task-test-crit-fail.md", "--base", "main", "--worktree", str(wt_6), "--task-hash", task_hashes.get("task-test-crit-fail.md", "")],
            cwd=REPO_ROOT,
            env=env_with_audit
        )
        print_result(code_6, out_6, err_6)
    finally:
        cleanup_branch_and_worktree(branch_6, wt_6)

    # -------------------------------------------------------------
    # 7. Critério de aceite com timeout
    # -------------------------------------------------------------
    print_scenario_header(7, "Critério de aceite com timeout (Limite de tempo excedido)")
    branch_7 = "task/test-timeout"
    wt_7 = WORKTREES_DIR / "wt-timeout"
    cleanup_branch_and_worktree(branch_7, wt_7)
    run_cmd(["git", "worktree", "add", "-b", branch_7, str(wt_7), "main"], cwd=REPO_ROOT)
    try:
        mod_allowed = wt_7 / "teacher-extension/modulo_permitido_teste.js"
        mod_allowed.parent.mkdir(parents=True, exist_ok=True)
        mod_allowed.write_text("// Codigo valido\n", encoding="utf-8")
        run_cmd(["git", "add", "."], cwd=wt_7)
        run_cmd(["git", "commit", "-m", "implementacao da tarefa"], cwd=wt_7)

        code_7, out_7, err_7 = run_cmd(
            [sys.executable, str(REPO_ROOT / "scripts/gate.py"), "tasks/task-test-timeout.md", "--base", "main", "--worktree", str(wt_7), "--task-hash", task_hashes.get("task-test-timeout.md", "")],
            cwd=REPO_ROOT,
            env=env_with_audit
        )
        print_result(code_7, out_7, err_7)
    finally:
        cleanup_branch_and_worktree(branch_7, wt_7)

    # -------------------------------------------------------------
    # 8. Teste de aceite enfraquecido no mesmo diff
    # -------------------------------------------------------------
    print_scenario_header(8, "Teste de aceite enfraquecido no mesmo diff")
    branch_8 = "task/test-weaken"
    wt_8 = WORKTREES_DIR / "wt-weaken"
    cleanup_branch_and_worktree(branch_8, wt_8)
    run_cmd(["git", "worktree", "add", "-b", branch_8, str(wt_8), "main"], cwd=REPO_ROOT)
    try:
        # Modifica o proprio arquivo de teste de seguranca no diff
        test_file = wt_8 / "tests/test_seguranca.py"
        test_file.write_text("import unittest\nclass TestSeguranca(unittest.TestCase):\n    def test_verificacao_basica(self):\n        pass # Enfraquecido!\n", encoding="utf-8")
        run_cmd(["git", "add", "tests/test_seguranca.py"], cwd=wt_8)
        run_cmd(["git", "commit", "-m", "modifica teste de seguranca para enfraquecer"], cwd=wt_8)

        code_8, out_8, err_8 = run_cmd(
            [sys.executable, str(REPO_ROOT / "scripts/gate.py"), "tasks/task-test-weaken.md", "--base", "main", "--worktree", str(wt_8), "--task-hash", task_hashes.get("task-test-weaken.md", "")],
            cwd=REPO_ROOT,
            env=env_with_audit
        )
        print_result(code_8, out_8, err_8)
    finally:
        cleanup_branch_and_worktree(branch_8, wt_8)

    # -------------------------------------------------------------
    # 9. Segredo falso plantado (JWT/chave) e PII falsa
    # -------------------------------------------------------------
    print_scenario_header(9, "Segredo falso plantado (JWT/chave) e PII falsa")
    branch_9 = "task/test-sec-pii"
    wt_9 = WORKTREES_DIR / "wt-sec-pii"
    cleanup_branch_and_worktree(branch_9, wt_9)
    run_cmd(["git", "worktree", "add", "-b", branch_9, str(wt_9), "main"], cwd=REPO_ROOT)
    try:
        mod_allowed = wt_9 / "teacher-extension/modulo_permitido_teste.js"
        mod_allowed.parent.mkdir(parents=True, exist_ok=True)
        planted_content = """
// Modulo de teste com vazamento plantado
const fakeApiKey = "sk-proj-test12345678901234567890";
const fakeJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
const alunoCpf = "123.456.789-00";
const alunoEmail = "mariana.silva@gmail.com";
"""
        mod_allowed.write_text(planted_content, encoding="utf-8")
        run_cmd(["git", "add", "."], cwd=wt_9)
        run_cmd(["git", "commit", "-m", "planta segredos e PII falsas"], cwd=wt_9)

        code_9, out_9, err_9 = run_cmd(
            [sys.executable, str(REPO_ROOT / "scripts/gate.py"), "tasks/task-test-pass.md", "--base", "main", "--worktree", str(wt_9), "--task-hash", task_hashes.get("task-test-pass.md", "")],
            cwd=REPO_ROOT,
            env=env_with_audit
        )
        print_result(code_9, out_9, err_9)
    finally:
        cleanup_branch_and_worktree(branch_9, wt_9)

    # -------------------------------------------------------------
    # 10. Diff acima do limite (mostrar o limite)
    # -------------------------------------------------------------
    print_scenario_header(10, "Diff acima do limite permitido (--max-diff-lines 5)")
    branch_10 = "task/test-diff-limit"
    wt_10 = WORKTREES_DIR / "wt-diff-limit"
    cleanup_branch_and_worktree(branch_10, wt_10)
    run_cmd(["git", "worktree", "add", "-b", branch_10, str(wt_10), "main"], cwd=REPO_ROOT)
    try:
        mod_allowed = wt_10 / "teacher-extension/modulo_permitido_teste.js"
        mod_allowed.parent.mkdir(parents=True, exist_ok=True)
        # Gera 20 linhas no diff
        lines_content = "\n".join([f"console.log('Linha {i}');" for i in range(20)])
        mod_allowed.write_text(lines_content, encoding="utf-8")
        run_cmd(["git", "add", "."], cwd=wt_10)
        run_cmd(["git", "commit", "-m", "gera diff com 20 linhas"], cwd=wt_10)

        code_10, out_10, err_10 = run_cmd(
            [sys.executable, str(REPO_ROOT / "scripts/gate.py"), "tasks/task-test-pass.md", "--base", "main", "--worktree", str(wt_10), "--max-diff-lines", "5", "--task-hash", task_hashes.get("task-test-pass.md", "")],
            cwd=REPO_ROOT,
            env=env_with_audit
        )
        print_result(code_10, out_10, err_10)
    finally:
        cleanup_branch_and_worktree(branch_10, wt_10)

    # -------------------------------------------------------------
    # 11. Verificação do registro de auditoria encadeado
    # -------------------------------------------------------------
    print_scenario_header(11, "Verificação do registro de auditoria encadeado (gate.py --verify-log)")
    # Primeiro executa uma tarefa que DEVE PASSAR para registrar entrada válida
    branch_pass = "task/test-pass-clean"
    wt_pass = WORKTREES_DIR / "wt-pass-clean"
    cleanup_branch_and_worktree(branch_pass, wt_pass)
    run_cmd(["git", "worktree", "add", "-b", branch_pass, str(wt_pass), "main"], cwd=REPO_ROOT)
    try:
        mod_allowed = wt_pass / "teacher-extension/modulo_permitido_teste.js"
        mod_allowed.parent.mkdir(parents=True, exist_ok=True)
        mod_allowed.write_text("// Modulo limpo aprovado\nconsole.log('OK');\n", encoding="utf-8")
        run_cmd(["git", "add", "."], cwd=wt_pass)
        run_cmd(["git", "commit", "-m", "modulo limpo aprovado"], cwd=wt_pass)

        code_p, out_p, err_p = run_cmd(
            [sys.executable, str(REPO_ROOT / "scripts/gate.py"), "tasks/task-test-pass.md", "--base", "main", "--worktree", str(wt_pass), "--task-hash", task_hashes.get("task-test-pass.md", "")],
            cwd=REPO_ROOT,
            env=env_with_audit
        )
        print("Execução da tarefa válida (APROVADA):")
        print_result(code_p, out_p, err_p)
    finally:
        cleanup_branch_and_worktree(branch_pass, wt_pass)

    print("\n--- Verificação da integridade do log autêntico ---")
    code_11a, out_11a, err_11a = run_cmd(
        [sys.executable, "scripts/gate.py", "--verify-log", "--audit-dir", str(AUDIT_DIR)],
        cwd=REPO_ROOT
    )
    print_result(code_11a, out_11a, err_11a)

    print("\n--- Verificação de adulteração (simulando alteração de registro no log) ---")
    # Adultera o log substituindo um caractere
    log_content = audit_file.read_text(encoding="utf-8")
    tampered_content = log_content.replace('"passed": true', '"passed": false')
    tampered_file = AUDIT_DIR / "orch_gate_audit_tampered.jsonl"
    tampered_file.write_text(tampered_content, encoding="utf-8")

    # Testa verificação no arquivo adulterado apontando via audit_dir temporario
    temp_tamper_dir = Path(r"C:\Users\rafae\.gemini\orch_audit_tampered_test").resolve()
    temp_tamper_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(tampered_file, temp_tamper_dir / "orch_gate_audit.jsonl")

    code_11b, out_11b, err_11b = run_cmd(
        [sys.executable, "scripts/gate.py", "--verify-log", "--audit-dir", str(temp_tamper_dir)],
        cwd=REPO_ROOT
    )
    print_result(code_11b, out_11b, err_11b)
    shutil.rmtree(temp_tamper_dir, ignore_errors=True)

    print("\n=== TODOS OS CENÁRIOS FORAM EXECUTADOS COM SUCESSO ===")

if __name__ == "__main__":
    main()
