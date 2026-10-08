#!/usr/bin/env python3
"""
scripts/worktree.py — Gerenciador de Worktrees por Tarefa do Teacher AI

Cria, lista e remove worktrees isoladas para execução de tarefas (branch task/<id>)
a partir da branch canônica (padrão: main).

Uso:
  python scripts/worktree.py create <task_id> [--base main] [--path <dir>]
  python scripts/worktree.py remove <task_id> [--delete-branch]
  python scripts/worktree.py list
"""

import argparse
import subprocess
import sys
from pathlib import Path

DEFAULT_WORKTREES_DIR = Path(".worktrees")

def run_git(cmd: list, cwd: Path = None, check: bool = True) -> subprocess.CompletedProcess:
    res = subprocess.run(["git"] + cmd, cwd=cwd, capture_output=True, text=True)
    if check and res.returncode != 0:
        print(f"[ERRO GIT] Falha no comando: git {' '.join(cmd)}")
        print(res.stderr.strip() or res.stdout.strip())
        sys.exit(res.returncode)
    return res

def create_worktree(task_id: str, base_branch: str, target_path: Path = None):
    branch_name = f"task/{task_id}"
    wt_dir = target_path or (DEFAULT_WORKTREES_DIR / f"task-{task_id}")
    wt_dir = wt_dir.resolve()

    print(f"=== CRIANDO WORKTREE PARA TAREFA: {task_id} ===")
    print(f"Branch:   {branch_name} (a partir de {base_branch})")
    print(f"Diretório: {wt_dir}")

    # Cria diretório pai se necessário
    wt_dir.parent.mkdir(parents=True, exist_ok=True)

    # Verifica se branch já existe
    chk_branch = run_git(["branch", "--list", branch_name], check=False)
    branch_exists = bool(chk_branch.stdout.strip())

    if branch_exists:
        print(f"Branch {branch_name} já existe. Montando worktree...")
        run_git(["worktree", "add", str(wt_dir), branch_name])
    else:
        print(f"Criando branch {branch_name} a partir de {base_branch}...")
        run_git(["worktree", "add", "-b", branch_name, str(wt_dir), base_branch])

    print(f"[SUCESSO] Worktree criada em: {wt_dir}")

def remove_worktree(task_id: str, delete_branch: bool = False, target_path: Path = None):
    branch_name = f"task/{task_id}"
    wt_dir = target_path or (DEFAULT_WORKTREES_DIR / f"task-{task_id}")
    wt_dir = wt_dir.resolve()

    print(f"=== REMOVENDO WORKTREE DA TAREFA: {task_id} ===")
    print(f"Diretório: {wt_dir}")

    # Remove worktree
    run_git(["worktree", "remove", str(wt_dir), "--force"], check=False)

    if delete_branch:
        print(f"Excluindo branch {branch_name}...")
        run_git(["branch", "-D", branch_name], check=False)

    print(f"[SUCESSO] Worktree removida.")

def list_worktrees():
    print("=== WORKTREES ATIVAS NO REPOSITÓRIO ===")
    res = run_git(["worktree", "list"])
    print(res.stdout.strip())

def main():
    parser = argparse.ArgumentParser(description="Gerenciador de Worktrees do Teacher AI")
    subparsers = parser.add_subparsers(dest="action", required=True)

    # Create
    p_create = subparsers.add_parser("create", help="Cria worktree para uma tarefa")
    p_create.add_argument("task_id", type=str, help="ID da tarefa (ex: TASK-001)")
    p_create.add_argument("--base", type=str, default="main", help="Branch base canônica (padrão: main)")
    p_create.add_argument("--path", type=str, default=None, help="Caminho personalizado para a worktree")

    # Remove
    p_remove = subparsers.add_parser("remove", help="Remove worktree de uma tarefa")
    p_remove.add_argument("task_id", type=str, help="ID da tarefa")
    p_remove.add_argument("--delete-branch", action="store_true", help="Também deleta a branch task/<id>")
    p_remove.add_argument("--path", type=str, default=None, help="Caminho da worktree se personalizado")

    # List
    subparsers.add_parser("list", help="Lista todas as worktrees")

    args = parser.parse_args()

    if args.action == "create":
        target = Path(args.path) if args.path else None
        create_worktree(args.task_id, args.base, target)
    elif args.action == "remove":
        target = Path(args.path) if args.path else None
        remove_worktree(args.task_id, args.delete_branch, target)
    elif args.action == "list":
        list_worktrees()

if __name__ == "__main__":
    main()
