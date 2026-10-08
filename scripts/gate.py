#!/usr/bin/env python3
"""
scripts/gate.py — Portão de Verificação Determinístico do Teacher AI

Executa verificação estrita e sem LLM para garantir as regras inegociáveis:
  S1: Arquivos alterados estritamente dentro de files_allowed.
  S2: Nenhum arquivo protegido (audit/eval, EVAL_HASHES.txt, .env*) alterado.
      Varredura rigorosa contra segredos e PII.
  S3: Quem produz não aprova. Apenas o gate pode alterar estado para 'aprovada'.
  S5: Variável ORCH_AUDIT_DIR obrigatória para registro append-only fora do repo.

Uso:
  python scripts/gate.py tasks/<id>.md [--worktree <path>] [--base <branch>]
"""

import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Arquivos e padrões estritamente protegidos (S2)
DEFAULT_PROTECTED_PATTERNS = [
    "audit/eval/**",
    "EVAL_HASHES.txt",
    ".env*",
    "**/.env*",
    "scripts/gate.py",
    "STATE.md"
]

# Padrões de segredos (chaves de API, JWT, chaves privadas)
SECRET_PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9_-]{20,}"), "OpenAI API Key"),
    (re.compile(r"AIza[0-9A-Za-z-_]{35}"), "Google Gemini API Key"),
    (re.compile(r"-----BEGIN (?:RSA|EC|OPENSSH|PGP|DSA )?PRIVATE KEY-----"), "Chave Privada"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"), "Token JWT"),
    (re.compile(r"""(?i)(?:aws_access_key_id|aws_secret_access_key)\s*=\s*['"][A-Za-z0-9/+=]{16,}['"]"""), "Credenciais AWS")
]

# Padrões de PII (dados de alunos / professores reais)
PII_PATTERNS = [
    (re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"), "CPF (Formato Padrão)"),
    (re.compile(r"(?i)\b[A-Za-z0-9._%+-]+@(?:gmail|hotmail|yahoo|outlook|uol|bol)\.com(?:\.br)?\b"), "E-mail Pessoal em Domínio Comercial")
]

def parse_task_file(task_path: Path) -> dict:
    content = task_path.read_text(encoding="utf-8")
    
    # Extrai frontmatter YAML simples
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
    if not match:
        raise ValueError(f"Formato inválido: {task_path} não possui frontmatter YAML delimitado por '---'.")
    
    raw_yaml, body = match.group(1), match.group(2)
    data = {}
    
    # Parser determinístico linha a linha sem dependência de pyyaml
    current_list_key = None
    for line in raw_yaml.splitlines():
        line_str = line.rstrip()
        if not line_str or line_str.startswith("#"):
            continue
        
        # Elemento de lista
        if line_str.strip().startswith("- ") and current_list_key:
            val = line_str.strip()[2:].strip().strip('"').strip("'")
            data[current_list_key].append(val)
            continue
            
        # Chave: valor
        if ":" in line_str:
            key, val = line_str.split(":", 1)
            key = key.strip()
            val = val.strip().split("#")[0].strip() # remove inline comment
            current_list_key = None
            
            if val == "":
                # Pode ser início de lista ou objeto
                data[key] = []
                current_list_key = key
            elif val.startswith("[") and val.endswith("]"):
                # Lista inline: [a, b]
                items = [x.strip().strip('"').strip("'") for x in val[1:-1].split(",") if x.strip()]
                data[key] = items
            else:
                # Remove aspas externas se existirem e desescapa
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
        # Se padrão terminar com /**, testa diretório
        if norm_pat.endswith("/**"):
            dir_pat = norm_pat[:-3]
            if norm_path.startswith(dir_pat + "/") or norm_path == dir_pat:
                return True
    return False

def get_git_diff_files_and_content(cwd: Path, base_branch: str = None) -> tuple:
    """Obtém lista de arquivos modificados e texto do diff."""
    # 1. Arquivos não commitados / staged
    cmd_status = ["git", "status", "--porcelain"]
    status_res = subprocess.run(cmd_status, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", check=True)
    
    changed_files = set()
    for line in status_res.stdout.splitlines():
        if not line:
            continue
        path_part = line[3:].strip()
        # Trata renomeação 'R  orig -> dest'
        if " -> " in path_part:
            path_part = path_part.split(" -> ")[1].strip()
        changed_files.add(path_part.replace("\\", "/"))

    # 2. Se houver base_branch, inclui diff commitado na branch atual
    diff_content = ""
    diff_args = ["git", "diff"]
    if base_branch:
        diff_args.extend([f"{base_branch}...HEAD"])
        cmd_diff_names = ["git", "diff", "--name-only", f"{base_branch}...HEAD"]
        diff_names_res = subprocess.run(cmd_diff_names, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if diff_names_res.returncode == 0:
            for f in diff_names_res.stdout.splitlines():
                if f.strip():
                    changed_files.add(f.strip().replace("\\", "/"))

    diff_res = subprocess.run(diff_args, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    diff_content = diff_res.stdout or ""

    # Se não houver diff commitado, pega diff de working tree
    if not diff_content:
        diff_res_head = subprocess.run(["git", "diff", "HEAD"], cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        diff_content = diff_res_head.stdout or ""

    # Inclui conteúdo de arquivos untracked para varredura de segredos
    for f in list(changed_files):
        f_path = cwd / f
        if f_path.is_file():
            try:
                content = f_path.read_text(encoding="utf-8", errors="ignore")
                diff_content += f"\n+++ untracked/{f}\n" + content
            except Exception:
                pass

    return sorted(list(changed_files)), diff_content

def update_task_state(task_path: Path, new_state: str):
    """Atualiza deterministicamente o campo estado no frontmatter da tarefa."""
    content = task_path.read_text(encoding="utf-8")
    updated = re.sub(r'(\bestado:\s*["\']?)[^"\'\n]+(["\']?)', rf'\g<1>{new_state}\g<2>', content, count=1)
    task_path.write_text(updated, encoding="utf-8")

def main():
    parser = argparse.ArgumentParser(description="Portão determinístico de verificação de tarefas (Teacher AI)")
    parser.add_argument("task_file", type=str, help="Caminho para o arquivo da tarefa (tasks/<id>.md)")
    parser.add_argument("--worktree", type=str, default=None, help="Caminho para a worktree a ser auditada")
    parser.add_argument("--base", type=str, default=None, help="Branch base para comparação de diff (ex: main)")
    parser.add_argument("--tokens", type=int, default=0, help="Tokens reportados pelo executor")
    parser.add_argument("--attempt", type=int, default=1, help="Tentativa atual da tarefa")
    args = parser.parse_args()

    start_time = time.time()
    task_path = Path(args.task_file).resolve()
    if not task_path.is_file():
        print(f"[GATE-ERRO] Arquivo de tarefa não encontrado: {task_path}")
        sys.exit(1)

    worktree_path = Path(args.worktree).resolve() if args.worktree else Path.cwd().resolve()

    # -------------------------------------------------------------
    # REGRA S5 / E: Validação estrita da variável de auditoria
    # -------------------------------------------------------------
    audit_env = os.environ.get("ORCH_AUDIT_DIR")
    if not audit_env:
        print("[GATE-ERRO FATAL] Variável de ambiente ORCH_AUDIT_DIR não definida.")
        print("Regra S2/S3/S5: O gate exige registro de auditoria append-only fora do repositório.")
        sys.exit(1)

    audit_dir = Path(audit_env).resolve()
    audit_dir.mkdir(parents=True, exist_ok=True)
    audit_log_file = audit_dir / "orch_gate_audit.jsonl"

    print(f"=== INICIANDO GATE DE VERIFICAÇÃO ===")
    print(f"Tarefa:   {task_path.name}")
    print(f"Worktree: {worktree_path}")
    print(f"Audit:    {audit_log_file}")

    # Carrega meta da tarefa
    try:
        task_data = parse_task_file(task_path)
    except Exception as e:
        print(f"[GATE-ERRO] Falha ao ler frontmatter da tarefa: {e}")
        sys.exit(1)

    task_id = task_data.get("id", task_path.stem)
    criterio = task_data.get("criterio_de_aceite")
    files_allowed = task_data.get("files_allowed", [])
    files_forbidden = task_data.get("files_forbidden", [])
    max_minutos = int(task_data.get("orcamento", {}).get("max_minutos", 15) if isinstance(task_data.get("orcamento"), dict) else 15)

    violations = []

    # -------------------------------------------------------------
    # ETAPA A: Verificação de Arquivos Alterados (S1 & S2)
    # -------------------------------------------------------------
    changed_files, diff_content = get_git_diff_files_and_content(worktree_path, args.base)
    print(f"\n[1/4] Verificando arquivos alterados ({len(changed_files)} detectados)...")

    # Arquivos da própria tarefa na pasta tasks/ e handoff/ são permitidos por design do fluxo
    meta_allowed = [f"tasks/{task_path.name}", f"handoff/handoff-{task_id}.md", f"handoff/blocked-{task_id}.md"]

    for f in changed_files:
        norm_f = f.replace("\\", "/")
        print(f"  - {norm_f}")

        # 1. Checa se violou padrões protegidos de sistema ou files_forbidden
        is_forbidden = matches_any_pattern(norm_f, DEFAULT_PROTECTED_PATTERNS) or matches_any_pattern(norm_f, files_forbidden)
        if is_forbidden:
            msg = f"Arquivo protegido/proibido modificado: {norm_f}"
            violations.append(msg)
            print(f"    [VIOLAÇÃO S2] {msg}")
            continue

        # 2. Checa se está dentro de files_allowed
        is_allowed = matches_any_pattern(norm_f, files_allowed) or matches_any_pattern(norm_f, meta_allowed)
        if not is_allowed:
            msg = f"Arquivo fora do escopo files_allowed: {norm_f}"
            violations.append(msg)
            print(f"    [VIOLAÇÃO S1] {msg}")

    # -------------------------------------------------------------
    # ETAPA B: Varredura de Segredos e PII no Diff (S2)
    # -------------------------------------------------------------
    print("\n[2/4] Varrendo diff por segredos e PII...")
    for pattern, sec_name in SECRET_PATTERNS:
        matches = pattern.findall(diff_content)
        if matches:
            msg = f"Segredo detectado no diff ({sec_name})"
            violations.append(msg)
            print(f"  [VIOLAÇÃO SEGURANÇA] {msg}: {matches[0][:8]}***")

    for pattern, pii_name in PII_PATTERNS:
        matches = pattern.findall(diff_content)
        if matches:
            msg = f"PII detectada no diff ({pii_name})"
            violations.append(msg)
            print(f"  [VIOLAÇÃO PRIVACIDADE] {msg}: {matches[0][:5]}***")

    # -------------------------------------------------------------
    # ETAPA C: Medição de Tamanho do Diff (S4)
    # -------------------------------------------------------------
    print("\n[3/4] Analisando tamanho do diff...")
    diff_lines = len(diff_content.splitlines())
    if diff_lines > 500:
        print(f"  [ALERTA DE TAMANHO] Diff grande detectado ({diff_lines} linhas). Recomenda-se quebrar a tarefa.")

    # -------------------------------------------------------------
    # ETAPA D: Execução do Critério de Aceite (S3 & S8)
    # -------------------------------------------------------------
    acceptance_success = True
    acceptance_output = ""
    acceptance_exit_code = 0

    if not criterio:
        violations.append("Critério de aceite ausente na tarefa")
        acceptance_success = False
    elif violations:
        print("\n[PULANDO CRITÉRIO] Violações de escopo ou segurança já detectadas.")
        acceptance_success = False
    else:
        print(f"\n[4/4] Executando critério de aceite (Timeout: {max_minutos * 60}s):")
        print(f"  $ {criterio}")
        try:
            crit_res = subprocess.run(
                criterio,
                cwd=worktree_path,
                shell=True,
                capture_output=True,
                text=True,
                timeout=max_minutos * 60
            )
            acceptance_exit_code = crit_res.returncode
            acceptance_output = crit_res.stdout + ("\n" + crit_res.stderr if crit_res.stderr else "")
            if acceptance_exit_code != 0:
                acceptance_success = False
                msg = f"Critério de aceite falhou com exit code {acceptance_exit_code}"
                violations.append(msg)
                print(f"  [FALHA DE ACEITE] {msg}")
                # Imprime linhas finais da saída
                lines = acceptance_output.strip().splitlines()
                tail = "\n".join(lines[-10:] if len(lines) > 10 else lines)
                print(f"  Saída:\n{tail}")
            else:
                print(f"  [SUCESSO] Critério de aceite passou com código 0.")
        except subprocess.TimeoutExpired:
            acceptance_success = False
            msg = f"Critério de aceite atingiu timeout de {max_minutos * 60}s"
            violations.append(msg)
            print(f"  [TIMEOUT] {msg}")

    # -------------------------------------------------------------
    # ETAPA E: Gravação em Registro Append-Only e Desfecho
    # -------------------------------------------------------------
    duration_sec = round(time.time() - start_time, 2)
    passed = (len(violations) == 0 and acceptance_success)
    
    audit_record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "task_id": task_id,
        "task_file": str(task_path),
        "status": "APROVADA" if passed else "REPROVADA",
        "passed": passed,
        "exit_code": 0 if passed else 1,
        "duration_seconds": duration_sec,
        "tokens_reported": args.tokens,
        "attempt": args.attempt,
        "files_changed_count": len(changed_files),
        "files_changed": changed_files,
        "diff_lines": diff_lines,
        "violations": violations
    }

    # Escrita append-only protegida
    with open(audit_log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(audit_record, ensure_ascii=False) + "\n")

    print("\n=== RESULTADO DO GATE ===")
    if passed:
        print(f"STATUS: APROVADA (Duração: {duration_sec}s)")
        update_task_state(task_path, "aprovada")
        print(f"Estado da tarefa atualizado para: 'aprovada'.")
        sys.exit(0)
    else:
        print(f"STATUS: REPROVADA (Duração: {duration_sec}s)")
        print("Violações:")
        for v in violations:
            print(f"  - {v}")
        sys.exit(1)

if __name__ == "__main__":
    main()
