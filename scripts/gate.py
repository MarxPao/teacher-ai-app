#!/usr/bin/env python3
"""
scripts/gate.py — Portão de Verificação Determinístico do Teacher AI

Garante as regras inegociáveis de governança (S1 a S8):
  S1: Arquivos alterados estritamente dentro de files_allowed.
  S2: Zonas proibidas (gate.py, tasks/*, STATE.md, audit/eval, EVAL_HASHES.txt, .env*).
      Varredura rigorosa de segredos, PII e enfraquecimento de testes de aceite.
  S3: Quem produz não aprova. Executado exclusivamente pelo supervisor/usuário.
  S5: Registro append-only criptograficamente encadeado em $ORCH_AUDIT_DIR.
  S7: Aborto imediato se existir arquivo STOP na raiz.

Uso:
  python scripts/gate.py tasks/<id>.md --base <commit_ou_branch> [--worktree <path>] [--task-hash <sha256>]
  python scripts/gate.py --verify-log [--audit-dir <path>]
  python scripts/gate.py --check-overlap tasks/<id1>.md tasks/<id2>.md
"""

import argparse
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Limite máximo recomendado de linhas no diff para alertar
DIFF_LINES_LIMIT = 500

# Arquivos e padrões estritamente protegidos contra qualquer alteração (S2)
DEFAULT_PROTECTED_PATTERNS = [
    "scripts/gate.py",
    "tasks/**",
    "tasks/*",
    "STATE.md",
    "docs/STATE.md",
    "audit/eval/**",
    "EVAL_HASHES.txt",
    ".env*",
    "**/.env*",
]

# Padrões de segredos proibidos no diff
SECRET_PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9_-]{20,}"), "OpenAI API Key"),
    (re.compile(r"AIza[0-9A-Za-z-_]{35}"), "Google Gemini API Key"),
    (re.compile(r"-----BEGIN (?:RSA|EC|OPENSSH|PGP|DSA )?PRIVATE KEY-----"), "Chave Privada"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"), "Token JWT"),
    (re.compile(r"""(?i)(?:aws_access_key_id|aws_secret_access_key)\s*=\s*['"][A-Za-z0-9/+=]{16,}['"]"""), "Credenciais AWS")
]

# Padrões de PII proibidos no diff
PII_PATTERNS = [
    (re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"), "CPF (Formato Padrão)"),
    (re.compile(r"(?i)\b[A-Za-z0-9._%+-]+@(?:gmail|hotmail|yahoo|outlook|uol|bol)\.com(?:\.br)?\b"), "E-mail Pessoal em Domínio Comercial")
]

def parse_yaml_frontmatter(content: str) -> dict:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
    if not match:
        raise ValueError("Formato inválido: conteúdo não possui frontmatter YAML delimitado por '---'.")
    
    raw_yaml, body = match.group(1), match.group(2)
    data = {}
    current_list_key = None
    
    for line in raw_yaml.splitlines():
        line_str = line.rstrip()
        if not line_str or line_str.startswith("#"):
            continue
        if line_str.strip().startswith("- ") and current_list_key:
            val = line_str.strip()[2:].strip().strip('"').strip("'")
            data[current_list_key].append(val)
            continue
        if ":" in line_str:
            key, val = line_str.split(":", 1)
            key = key.strip()
            val = val.strip().split("#")[0].strip()
            current_list_key = None
            if val == "":
                data[key] = []
                current_list_key = key
            elif val.startswith("[") and val.endswith("]"):
                items = [x.strip().strip('"').strip("'") for x in val[1:-1].split(",") if x.strip()]
                data[key] = items
            else:
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                val = val.replace('\\"', '"').replace("\\'", "'")
                data[key] = val

    data["_body"] = body
    data["_raw_yaml"] = raw_yaml
    return data

def matches_any_pattern(rel_path: str, patterns: list) -> bool:
    norm_path = rel_path.replace("\\", "/")
    for pat in patterns:
        norm_pat = pat.replace("\\", "/")
        if fnmatch.fnmatch(norm_path, norm_pat) or norm_path == norm_pat:
            return True
        if norm_pat.endswith("/**"):
            dir_pat = norm_pat[:-3]
            if norm_path.startswith(dir_pat + "/") or norm_path == dir_pat:
                return True
    return False

def get_git_diff_details(cwd: Path, base_commit: str) -> tuple:
    """
    Obtém a lista completa de arquivos afetados comparando a base com o HEAD da tarefa:
    inclui modificados (M), adicionados (A), apagados (D) e renomeados (R),
    além de alterações não-commitadas no worktree.
    """
    changed_files = set()
    renamed_deleted_files = set()

    # 1. Diff formal entre base...HEAD (commitados)
    diff_cmd = ["git", "diff", "--name-status", f"{base_commit}...HEAD"]
    res_diff = subprocess.run(diff_cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res_diff.returncode == 0:
        for line in res_diff.stdout.splitlines():
            if not line.strip():
                continue
            parts = line.split("\t")
            status = parts[0].strip()
            if status.startswith("R") and len(parts) >= 3:
                # Renomeado: parts[1]=origem, parts[2]=destino
                orig, dest = parts[1].replace("\\", "/"), parts[2].replace("\\", "/")
                changed_files.add(orig)
                changed_files.add(dest)
                renamed_deleted_files.add(orig)
                renamed_deleted_files.add(dest)
            elif status == "D" and len(parts) >= 2:
                del_file = parts[1].replace("\\", "/")
                changed_files.add(del_file)
                renamed_deleted_files.add(del_file)
            elif len(parts) >= 2:
                changed_files.add(parts[1].replace("\\", "/"))

    # 2. Mudanças pendentes / unstaged / untracked no worktree
    status_cmd = ["git", "status", "--porcelain"]
    res_status = subprocess.run(status_cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res_status.returncode == 0:
        for line in res_status.stdout.splitlines():
            if not line:
                continue
            status_code = line[:2]
            path_part = line[3:].strip()
            if " -> " in path_part:
                orig, dest = path_part.split(" -> ")
                changed_files.add(orig.strip().replace("\\", "/"))
                changed_files.add(dest.strip().replace("\\", "/"))
                renamed_deleted_files.add(orig.strip().replace("\\", "/"))
                renamed_deleted_files.add(dest.strip().replace("\\", "/"))
            elif "D" in status_code:
                del_file = path_part.replace("\\", "/")
                changed_files.add(del_file)
                renamed_deleted_files.add(del_file)
            else:
                changed_files.add(path_part.replace("\\", "/"))

    # 3. Conteúdo textual do diff (base...HEAD + HEAD)
    full_diff_cmd = ["git", "diff", f"{base_commit}...HEAD"]
    diff_text_res = subprocess.run(full_diff_cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    diff_text = diff_text_res.stdout or ""

    diff_wt_cmd = ["git", "diff", "HEAD"]
    diff_wt_res = subprocess.run(diff_wt_cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    diff_text += "\n" + (diff_wt_res.stdout or "")

    # Adiciona conteúdo de arquivos untracked no diff para varredura
    for f in list(changed_files):
        f_path = cwd / f
        if f_path.is_file():
            try:
                content = f_path.read_text(encoding="utf-8", errors="ignore")
                diff_text += f"\n+++ untracked/{f}\n" + content
            except Exception:
                pass

    return sorted(list(changed_files)), sorted(list(renamed_deleted_files)), diff_text

def compute_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def read_task_from_git_base(repo_root: Path, base_commit: str, rel_task_path: str) -> tuple:
    """Lê estritamente o arquivo da tarefa a partir do commit BASE via git show."""
    git_path = rel_task_path.replace("\\", "/")
    cmd = ["git", "show", f"{base_commit}:{git_path}"]
    res = subprocess.run(cmd, cwd=repo_root, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        raise FileNotFoundError(f"Tarefa '{git_path}' não encontrada no commit BASE ({base_commit}).")
    content = res.stdout
    sha256_hash = compute_sha256(content)
    data = parse_yaml_frontmatter(content)
    return data, sha256_hash, content

def append_chained_audit_record(audit_file: Path, record_data: dict) -> dict:
    """Grava registro com encadeamento criptográfico de hash (hash chaining)."""
    prev_hash = "0" * 64
    entry_index = 0

    if audit_file.exists() and audit_file.stat().st_size > 0:
        lines = [line.strip() for line in audit_file.read_text(encoding="utf-8").splitlines() if line.strip()]
        if lines:
            entry_index = len(lines)
            last_line = lines[-1]
            try:
                last_record = json.loads(last_line)
                prev_hash = last_record.get("hash", compute_sha256(last_line))
            except Exception:
                prev_hash = compute_sha256(last_line)

    record_to_hash = {
        "index": entry_index,
        "prev_hash": prev_hash,
        "payload": record_data
    }
    canonical_repr = json.dumps(record_to_hash, sort_keys=True, ensure_ascii=False)
    entry_hash = compute_sha256(canonical_repr)

    final_entry = {
        "index": entry_index,
        "prev_hash": prev_hash,
        "hash": entry_hash,
        "payload": record_data
    }

    with open(audit_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(final_entry, ensure_ascii=False) + "\n")

    return final_entry

def verify_audit_log(audit_file: Path) -> bool:
    print(f"=== VERIFICANDO INTEGRIDADE DO REGISTRO DE AUDITORIA ===")
    print(f"Arquivo: {audit_file}")
    if not audit_file.exists():
        print("[ERRO] Arquivo de log não existe.")
        return False

    lines = [line.strip() for line in audit_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not lines:
        print("[AVISO] Log vazio.")
        return True

    expected_prev = "0" * 64
    for idx, line in enumerate(lines):
        try:
            entry = json.loads(line)
        except Exception as e:
            print(f"[FALHA NA LINHA {idx}] JSON inválido: {e}")
            return False

        if entry.get("index") != idx:
            print(f"[FALHA NA LINHA {idx}] Índice inconsistente: esperado {idx}, obtido {entry.get('index')}")
            return False

        if entry.get("prev_hash") != expected_prev:
            print(f"[FALHA NA LINHA {idx}] Quebra de encadeamento! prev_hash {entry.get('prev_hash')} != {expected_prev}")
            return False

        # Recalcula hash
        record_to_hash = {
            "index": idx,
            "prev_hash": expected_prev,
            "payload": entry.get("payload")
        }
        recalc_hash = compute_sha256(json.dumps(record_to_hash, sort_keys=True, ensure_ascii=False))
        if entry.get("hash") != recalc_hash:
            print(f"[FALHA NA LINHA {idx}] Hash adulterado! Gravado: {entry.get('hash')}, Recalculado: {recalc_hash}")
            return False

        expected_prev = entry.get("hash")

    print(f"[SUCESSO] Total de {len(lines)} registros verificados. Encadeamento íntegro e autêntico.")
    return True

def check_task_overlap(task1_path: Path, task2_path: Path) -> bool:
    """Verifica sobreposição de files_allowed entre duas tarefas para garantir paralelismo seguro."""
    data1 = parse_yaml_frontmatter(task1_path.read_text(encoding="utf-8"))
    data2 = parse_yaml_frontmatter(task2_path.read_text(encoding="utf-8"))
    
    fa1 = set(data1.get("files_allowed", []))
    fa2 = set(data2.get("files_allowed", []))
    
    overlap = fa1.intersection(fa2)
    print(f"=== VERIFICANDO SOBREPOSIÇÃO DE FILES_ALLOWED ===")
    print(f"Tarefa 1: {task1_path.name} -> {len(fa1)} caminhos")
    print(f"Tarefa 2: {task2_path.name} -> {len(fa2)} caminhos")
    
    if overlap:
        print(f"[FALHA DE PARALELISMO] Sobreposição detectada em files_allowed: {sorted(list(overlap))}")
        print("Regra S1/Paralelismo: Tarefas concorrentes devem possuir escopos estritamente disjuntos.")
        return False
    else:
        print("[SUCESSO] Escopos disjuntos. Paralelismo seguro autorizado.")
        return True

def main():
    parser = argparse.ArgumentParser(description="Portão determinístico de verificação de tarefas (Teacher AI)")
    parser.add_argument("task_file", nargs="?", default=None, help="Caminho para o arquivo da tarefa (tasks/<id>.md)")
    parser.add_argument("--base", type=str, default="main", help="Commit ou branch base (padrão: main)")
    parser.add_argument("--worktree", type=str, default=None, help="Caminho para a worktree da tarefa")
    parser.add_argument("--task-hash", type=str, default=None, help="Hash SHA-256 travado exigido para a tarefa")
    parser.add_argument("--max-diff-lines", type=int, default=DIFF_LINES_LIMIT, help="Limite máximo de linhas no diff")
    parser.add_argument("--verify-log", action="store_true", help="Verifica integridade do encadeamento do registro de auditoria")
    parser.add_argument("--audit-dir", type=str, default=None, help="Diretório de auditoria se personalizado")
    parser.add_argument("--check-overlap", nargs=2, metavar=("TASK1", "TASK2"), help="Verifica sobreposição entre duas tarefas")

    args = parser.parse_args()

    # -------------------------------------------------------------
    # Subcomando: Verificação de sobreposição
    # -------------------------------------------------------------
    if args.check_overlap:
        ok = check_task_overlap(Path(args.check_overlap[0]), Path(args.check_overlap[1]))
        sys.exit(0 if ok else 1)

    # -------------------------------------------------------------
    # Validação do Diretório de Auditoria (Regra S5)
    # -------------------------------------------------------------
    audit_env = args.audit_dir or os.environ.get("ORCH_AUDIT_DIR")
    if not audit_env:
        print("[GATE-ERRO FATAL] Variável de ambiente ORCH_AUDIT_DIR não definida.")
        print("Regra S2/S3/S5: O gate exige registro de auditoria append-only fora do repositório.")
        sys.exit(1)

    audit_dir = Path(audit_env).resolve()
    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_log_file = audit_dir / "orch_gate_audit.jsonl"

    # -------------------------------------------------------------
    # Subcomando: Verificação de Log
    # -------------------------------------------------------------
    if args.verify_log:
        ok = verify_audit_log(audit_log_file)
        sys.exit(0 if ok else 1)

    if not args.task_file:
        parser.print_help()
        sys.exit(1)

    start_time = time.time()
    task_arg_path = Path(args.task_file)
    worktree_path = Path(args.worktree).resolve() if args.worktree else Path.cwd().resolve()

    # Encontra raiz do repo git
    repo_root_res = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=worktree_path, capture_output=True, text=True)
    repo_root = Path(repo_root_res.stdout.strip()).resolve() if repo_root_res.returncode == 0 else worktree_path

    # Determina caminho relativo da tarefa no repo
    try:
        rel_task_path = str(task_arg_path.resolve().relative_to(repo_root))
    except Exception:
        rel_task_path = f"tasks/{task_arg_path.name}"

    print(f"=== INICIANDO GATE DE VERIFICAÇÃO DETERMINÍSTICO ===")
    print(f"Tarefa:   {rel_task_path}")
    print(f"Base:     {args.base}")
    print(f"Worktree: {worktree_path}")
    print(f"Audit:    {audit_log_file}")

    violations = []

    # -------------------------------------------------------------
    # REGRA S7: Parada de Emergência (Arquivo STOP)
    # -------------------------------------------------------------
    stop_file_wt = worktree_path / "STOP"
    stop_file_root = repo_root / "STOP"
    if stop_file_wt.exists() or stop_file_root.exists():
        msg = "PARADA DE EMERGÊNCIA (S7): Arquivo STOP detectado. Trabalho abortado imediatamente."
        print(f"\n[ABORT] {msg}")
        violations.append(msg)
        # Grava auditoria e encerra
        append_chained_audit_record(audit_log_file, {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "task_id": task_arg_path.stem,
            "status": "ABORTADO_STOP",
            "passed": False,
            "exit_code": 1,
            "duration_seconds": round(time.time() - start_time, 2),
            "cost_tokens": "NÃO VERIFICADO",
            "violations": violations
        })
        sys.exit(1)

    # -------------------------------------------------------------
    # REGRA 2(b): Ler tarefa do commit BASE (Imutabilidade da tarefa)
    # -------------------------------------------------------------
    print("\n[1/6] Lendo especificação da tarefa a partir do commit BASE...")
    try:
        task_data, task_base_sha, task_raw_content = read_task_from_git_base(repo_root, args.base, rel_task_path)
        print(f"  Hash SHA-256 da tarefa no BASE: {task_base_sha}")
    except Exception as e:
        msg = f"Falha ao ler tarefa do commit BASE ({args.base}): {e}"
        print(f"  [VIOLAÇÃO] {msg}")
        violations.append(msg)
        task_data = {}
        task_base_sha = ""

    task_id = task_data.get("id", task_arg_path.stem)
    criterio = task_data.get("criterio_de_aceite")
    files_allowed = task_data.get("files_allowed", [])
    files_forbidden = task_data.get("files_forbidden", [])
    task_hash_locked = task_data.get("task_hash_locked") or args.task_hash
    max_minutos = int(task_data.get("orcamento", {}).get("max_minutos", 15) if isinstance(task_data.get("orcamento"), dict) else 15)

    # -------------------------------------------------------------
    # REGRA 2(c): Exigência de Hash Travado da Tarefa
    # -------------------------------------------------------------
    print("\n[2/6] Verificando trava de integridade do hash da tarefa...")
    if not task_hash_locked:
        msg = "Hash travado da tarefa não informado (exija --task-hash ou campo 'task_hash_locked' na tarefa base)"
        print(f"  [VIOLAÇÃO 2(c)] {msg}")
        violations.append(msg)
    elif task_base_sha != task_hash_locked:
        msg = f"Hash da tarefa divergente! Esperado: {task_hash_locked}, Encontrado no base: {task_base_sha}"
        print(f"  [VIOLAÇÃO 2(c)] {msg}")
        violations.append(msg)
    else:
        print(f"  [OK] Hash travado verificado com sucesso ({task_hash_locked[:12]}...).")

    # -------------------------------------------------------------
    # REGRA 2(d) & 2(e): Comparação de Diff e Aplicação de files_allowed
    # -------------------------------------------------------------
    print(f"\n[3/6] Inspecionando diff ({args.base}...HEAD + worktree)...")
    changed_files, renamed_deleted_files, diff_content = get_git_diff_details(worktree_path, args.base)
    print(f"  Arquivos afetados: {len(changed_files)}")

    # Identifica o arquivo de teste de aceite para evitar enfraquecimento
    acceptance_test_files = []
    if criterio:
        # Detecta referências a arquivos de teste no critério (ex: __tests__/foo.test.ts, test_bar.py)
        for token in criterio.split():
            clean_token = token.strip('"').strip("'")
            if re.search(r"(?:test_.*\.py|.*\.test\.[jt]sx?|.*_test\.[jt]sx?)", clean_token):
                acceptance_test_files.append(clean_token.replace("\\", "/"))

    # Verifica se algum arquivo alterado toca o próprio ORCH_AUDIT_DIR
    audit_dir_norm = str(audit_dir).replace("\\", "/").lower()

    for f in changed_files:
        norm_f = f.replace("\\", "/")
        print(f"  - {norm_f}")

        # Proteção do diretório de auditoria
        f_abs = str((worktree_path / f).resolve()).replace("\\", "/").lower()
        if f_abs.startswith(audit_dir_norm):
            msg = f"Tentativa proibida de alterar o diretório de auditoria: {norm_f}"
            violations.append(msg)
            print(f"    [VIOLAÇÃO CRÍTICA S2/S5] {msg}")
            continue

        # Proteção contra enfraquecimento do próprio teste de aceite da tarefa
        if any(norm_f == atf or norm_f.endswith(atf) for atf in acceptance_test_files):
            msg = f"Tentativa proibida de alterar o teste de aceite no mesmo diff (enfraquecimento): {norm_f}"
            violations.append(msg)
            print(f"    [VIOLAÇÃO S2] {msg}")
            continue

        # Proteção contra alteração em arquivos protegidos de sistema ou files_forbidden
        is_forbidden = matches_any_pattern(norm_f, DEFAULT_PROTECTED_PATTERNS) or matches_any_pattern(norm_f, files_forbidden)
        if is_forbidden:
            msg = f"Arquivo protegido/proibido modificado: {norm_f}"
            violations.append(msg)
            print(f"    [VIOLAÇÃO 2(a)] {msg}")
            continue

        # Regra 2(e): Aplicação estrita de files_allowed
        is_allowed = matches_any_pattern(norm_f, files_allowed)
        if not is_allowed:
            msg = f"Arquivo fora de files_allowed: {norm_f}"
            violations.append(msg)
            print(f"    [VIOLAÇÃO 2(e)] {msg}")

    # -------------------------------------------------------------
    # REGRA S2: Varredura de Segredos e PII
    # -------------------------------------------------------------
    print("\n[4/6] Varrendo diff por segredos e PII...")
    for pattern, sec_name in SECRET_PATTERNS:
        matches = pattern.findall(diff_content)
        if matches:
            msg = f"Segredo detectado no diff ({sec_name})"
            violations.append(msg)
            print(f"  [VIOLAÇÃO SEGURANÇA S2] {msg}")

    for pattern, pii_name in PII_PATTERNS:
        matches = pattern.findall(diff_content)
        if matches:
            msg = f"PII detectada no diff ({pii_name})"
            violations.append(msg)
            print(f"  [VIOLAÇÃO PRIVACIDADE S2] {msg}")

    # -------------------------------------------------------------
    # Medição de Tamanho do Diff
    # -------------------------------------------------------------
    diff_lines = len(diff_content.splitlines())
    print(f"\n[5/6] Analisando tamanho do diff ({diff_lines} linhas / limite: {args.max_diff_lines})...")
    if diff_lines > args.max_diff_lines:
        msg = f"Diff acima do limite permitido ({diff_lines} > {args.max_diff_lines} linhas)"
        violations.append(msg)
        print(f"  [VIOLAÇÃO TAMANHO] {msg}")

    # -------------------------------------------------------------
    # Execução do Critério de Aceite (S3 & S8)
    # -------------------------------------------------------------
    acceptance_success = True
    acceptance_exit_code = 0
    acceptance_output = ""

    if not criterio:
        violations.append("Critério de aceite ausente na tarefa")
        acceptance_success = False
    elif violations:
        print("\n[6/6] Pulando execução do critério de aceite (violações já detectadas).")
        acceptance_success = False
    else:
        print(f"\n[6/6] Executando critério de aceite (Timeout: {max_minutos * 60}s):")
        print(f"  $ {criterio}")
        try:
            crit_res = subprocess.run(
                criterio,
                cwd=worktree_path,
                shell=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=max_minutos * 60
            )
            acceptance_exit_code = crit_res.returncode
            acceptance_output = crit_res.stdout + ("\n" + crit_res.stderr if crit_res.stderr else "")
            if acceptance_exit_code != 0:
                acceptance_success = False
                msg = f"Critério de aceite falhou com exit code {acceptance_exit_code}"
                violations.append(msg)
                print(f"  [FALHA] {msg}")
                lines = acceptance_output.strip().splitlines()
                tail = "\n".join(lines[-8:] if len(lines) > 8 else lines)
                print(f"  Saída:\n{tail}")
            else:
                print(f"  [SUCESSO] Critério de aceite passou com código 0.")
        except subprocess.TimeoutExpired:
            acceptance_success = False
            msg = f"Critério de aceite atingiu timeout de {max_minutos * 60}s"
            violations.append(msg)
            print(f"  [TIMEOUT] {msg}")

    # -------------------------------------------------------------
    # Desfecho e Registro Append-Only Encadeado (Regra 3 & 5)
    # -------------------------------------------------------------
    duration_sec = round(time.time() - start_time, 2)
    passed = (len(violations) == 0 and acceptance_success)

    audit_payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "task_id": task_id,
        "task_file": rel_task_path,
        "task_sha256": task_base_sha,
        "base_commit": args.base,
        "status": "APROVADA" if passed else "REPROVADA",
        "passed": passed,
        "exit_code": 0 if passed else 1,
        "duration_seconds": duration_sec,
        "cost_tokens": "NÃO VERIFICADO",  # Regra 5: Não aceitar self-reported; registrar como NÃO VERIFICADO
        "files_changed_count": len(changed_files),
        "files_changed": changed_files,
        "diff_lines": diff_lines,
        "violations": violations
    }

    chained_entry = append_chained_audit_record(audit_log_file, audit_payload)

    print("\n=== RESULTADO DO GATE ===")
    print(f"Registro: Hash={chained_entry['hash'][:12]}... (Index={chained_entry['index']})")
    if passed:
        print(f"STATUS: APROVADA (Duração: {duration_sec}s)")
        sys.exit(0)
    else:
        print(f"STATUS: REPROVADA (Duração: {duration_sec}s)")
        print("Violações:")
        for v in violations:
            print(f"  - {v}")
        sys.exit(1)

if __name__ == "__main__":
    main()
