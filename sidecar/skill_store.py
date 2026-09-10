"""
skill_store.py — Armazenamento Versionado e Imutável de Skill Graphs (Lote 1)

Persiste grafos de habilidades em disco no padrão:
  skills/{portal_id}__{task_id}/v{version}.json

Garante que nenhuma skill insegura (sem CHECKPOINT antes de WRITE/CLICK)
possa ser gravada em disco.
"""

import json
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Union, Any

from skill_graph_schema import SkillGraph
from graph_validator import assert_graph_safe, UnsafeGraphError

# Diretório padrão para persistência de skills
DEFAULT_SKILLS_DIR = Path(__file__).resolve().parent / "skills"


class SkillNotFoundError(FileNotFoundError):
    """Lançada quando uma skill ou versão solicitada não existe."""
    pass


def get_skill_dir(portal_id: str, task_id: str, base_dir: Union[Path, str] = DEFAULT_SKILLS_DIR) -> Path:
    """Retorna o diretório correspondente a uma tupla portal/task."""
    safe_portal = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', portal_id)
    safe_task = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', task_id)
    return Path(base_dir) / f"{safe_portal}__{safe_task}"


def save_skill(
    graph_input: Union[SkillGraph, Dict[str, Any]],
    base_dir: Union[Path, str] = DEFAULT_SKILLS_DIR
) -> Path:
    """
    Valida e salva um Skill Graph em formato JSON versionado.
    
    Exige aprovação em assert_graph_safe(). Se o grafo for inseguro,
    rejeita a gravação imediatamente levantando UnsafeGraphError.
    """
    # 1. Validação estática de segurança mandatória (Trava Pré-Gravação)
    assert_graph_safe(graph_input)

    # 2. Converte para SkillGraph se necessário
    if isinstance(graph_input, dict):
        graph = SkillGraph.model_validate(graph_input)
    else:
        graph = graph_input

    # 3. Determina diretório de destino
    skill_dir = get_skill_dir(graph.portal_id, graph.task_id, base_dir=base_dir)
    skill_dir.mkdir(parents=True, exist_ok=True)

    file_path = skill_dir / f"v{graph.version}.json"

    # 4. Serializa com formatação limpa
    data = graph.model_dump()
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return file_path


def load_skill(
    portal_id: str,
    task_id: str,
    version: Optional[int] = None,
    base_dir: Union[Path, str] = DEFAULT_SKILLS_DIR
) -> SkillGraph:
    """
    Carrega um Skill Graph a partir do disco.
    
    Se version for None, carrega a versão mais recente disponível.
    Também re-valida o grafo ao carregar para garantir a integridade dos dados.
    """
    skill_dir = get_skill_dir(portal_id, task_id, base_dir=base_dir)
    if not skill_dir.exists():
        raise SkillNotFoundError(f"Skill '{portal_id}/{task_id}' não encontrada em {skill_dir}")

    if version is not None:
        target_file = skill_dir / f"v{version}.json"
        if not target_file.exists():
            raise SkillNotFoundError(f"Versão v{version} da skill '{portal_id}/{task_id}' não encontrada.")
    else:
        # Busca todas as versões disponíveis e seleciona a maior
        version_files = list(skill_dir.glob("v*.json"))
        if not version_files:
            raise SkillNotFoundError(f"Nenhum arquivo de versão encontrado em {skill_dir}")
        
        def extract_version(p: Path) -> int:
            match = re.search(r"v(\d+)\.json$", p.name)
            return int(match.group(1)) if match else -1

        version_files.sort(key=extract_version)
        target_file = version_files[-1]

    with open(target_file, "r", encoding="utf-8") as f:
        raw_data = json.load(f)

    # Valida estrutura Pydantic e segurança
    graph = SkillGraph.model_validate(raw_data)
    assert_graph_safe(graph)

    return graph


def list_skills(base_dir: Union[Path, str] = DEFAULT_SKILLS_DIR) -> List[Dict[str, Any]]:
    """
    Lista todas as skills armazenadas e suas respectivas versões.
    """
    base_path = Path(base_dir)
    if not base_path.exists():
        return []

    results = []
    for entry in base_path.iterdir():
        if entry.is_dir() and "__" in entry.name:
            portal_id, task_id = entry.name.split("__", 1)
            versions = []
            for vf in entry.glob("v*.json"):
                match = re.search(r"v(\d+)\.json$", vf.name)
                if match:
                    versions.append(int(match.group(1)))
            versions.sort()
            if versions:
                results.append({
                    "portal_id": portal_id,
                    "task_id": task_id,
                    "versions": versions,
                    "latest_version": versions[-1],
                    "directory": str(entry)
                })

    return results
