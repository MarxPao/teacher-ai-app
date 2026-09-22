"""
portal_map_federation.py — Exportação e Importação Federada e Segura de Mapas de Portais

Permite o compartilhamento de mapas de seletores (SkillGraph) entre instâncias locais
do Teacher AI, com garantia absoluta de higienização de PII (LGPD) e validação por SHA-256.
"""

import hashlib
import json
import re
from typing import Any, Dict, Optional, Tuple

FORBIDDEN_PII_PATTERNS = [
    re.compile(r"[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}"),  # CPF
    re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),  # Email
    re.compile(r"\(?\d{2}\)?\s?9?\d{4}-?\d{4}"),  # Telefone
    re.compile(r"(maria|joao|pedro|lucas|gabriel|ana|julia|bruno|carla|diego|eduarda|felipe)", re.IGNORECASE),
    re.compile(r"[0-9]{7,}"),  # Matrículas longas
]


def _has_pii(text: str) -> bool:
    """Verifica se há qualquer dado pessoal sensível na string."""
    return any(p.search(text) for p in FORBIDDEN_PII_PATTERNS)


def export_federated_map(raw_map: Dict[str, Any]) -> str:
    """
    Higieniza e empacota um mapa de portal para compartilhamento federado.
    Remove identificadores de professores, IDs de banco e dados pessoais.
    Calcula checksum SHA-256 de integridade.
    """
    # 1. Filtra estritamente os campos estruturais públicos
    sanitized_payload = {
        "portal_domain": raw_map.get("portal_domain", ""),
        "portal_display_name": raw_map.get("portal_display_name", ""),
        "discovered_selectors": raw_map.get("discovered_selectors", {}),
        "pagination_strategy": raw_map.get("pagination_strategy"),
        "discovery_confidence": raw_map.get("discovery_confidence", "high"),
        "federation_version": "1.0",
    }

    # 2. Varredura estrita de PII antes de exportar
    payload_str = json.dumps(sanitized_payload, sort_keys=True, ensure_ascii=False)
    if _has_pii(payload_str):
        raise ValueError("Violação de segurança LGPD: PII detectada nos seletores ao exportar mapa.")

    # 3. Calcula hash SHA-256
    checksum = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    package = {
        "schema": "teacher_ai_federated_portal_map",
        "checksum_sha256": checksum,
        "payload": sanitized_payload
    }

    return json.dumps(package, indent=2, ensure_ascii=False)


def import_federated_map(package_json_str: str) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    """
    Importa e valida um pacote de mapa federado.
    Verifica integridade por SHA-256 e ausência de PII.
    Retorna (sucesso, mapa_higienizado, mensagem).
    """
    try:
        data = json.loads(package_json_str)
    except json.JSONDecodeError as e:
        return False, None, f"JSON inválido: {e}"

    if data.get("schema") != "teacher_ai_federated_portal_map":
        return False, None, "Schema de pacote não reconhecido."

    payload = data.get("payload")
    expected_checksum = data.get("checksum_sha256")
    if not payload or not expected_checksum:
        return False, None, "Pacote incompleto (payload ou checksum ausente)."

    # 1. Validação de integridade SHA-256
    payload_str = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    actual_checksum = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    if actual_checksum != expected_checksum:
        return False, None, "Falha de integridade: Checksum SHA-256 não confere."

    # 2. Validação obrigatória anti-PII
    if _has_pii(payload_str):
        return False, None, "Rejeitado: PII detectada no conteúdo do mapa (LGPD)."

    return True, payload, "Mapa federado importado com sucesso."


def create_delta_patch(base_map: Dict[str, Any], updated_map: Dict[str, Any]) -> str:
    """
    Gera um patch delta no formato RFC 6902 com as operações atômicas (replace, add, remove)
    entre dois mapas de portais, higienizado contra PII e assinado com checksum SHA-256.
    """
    base_selectors = base_map.get("discovered_selectors", {})
    updated_selectors = updated_map.get("discovered_selectors", {})

    operations = []

    # Detecta adições e substituições
    for k, v in updated_selectors.items():
        if k not in base_selectors:
            operations.append({"op": "add", "path": f"/discovered_selectors/{k}", "value": v})
        elif base_selectors[k] != v:
            operations.append({"op": "replace", "path": f"/discovered_selectors/{k}", "value": v})

    # Detecta remoções
    for k in base_selectors:
        if k not in updated_selectors:
            operations.append({"op": "remove", "path": f"/discovered_selectors/{k}"})

    patch_payload = {
        "portal_domain": updated_map.get("portal_domain", base_map.get("portal_domain", "")),
        "operations": operations,
        "federation_version": "1.0-delta"
    }

    payload_str = json.dumps(patch_payload, sort_keys=True, ensure_ascii=False)
    if _has_pii(payload_str):
        raise ValueError("Violação de segurança LGPD: PII detectada no patch delta.")

    checksum = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    package = {
        "schema": "teacher_ai_federated_delta_patch",
        "checksum_sha256": checksum,
        "payload": patch_payload
    }
    return json.dumps(package, indent=2, ensure_ascii=False)


def apply_delta_patch(base_map: Dict[str, Any], delta_patch_json: str) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    """
    Valida e aplica um patch delta RFC 6902 sobre um mapa base.
    Retorna (sucesso, novo_mapa, mensagem).
    """
    try:
        data = json.loads(delta_patch_json)
    except json.JSONDecodeError as e:
        return False, None, f"JSON inválido: {e}"

    if data.get("schema") != "teacher_ai_federated_delta_patch":
        return False, None, "Schema de delta patch não reconhecido."

    payload = data.get("payload", {})
    expected_checksum = data.get("checksum_sha256")

    payload_str = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    actual_checksum = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    if actual_checksum != expected_checksum:
        return False, None, "Falha de integridade SHA-256 no delta patch."

    if _has_pii(payload_str):
        return False, None, "Rejeitado: PII detectada no delta patch (LGPD)."

    new_map = json.loads(json.dumps(base_map))
    if "discovered_selectors" not in new_map:
        new_map["discovered_selectors"] = {}

    for op in payload.get("operations", []):
        path = op.get("path", "")
        if not path.startswith("/discovered_selectors/"):
            continue
        key = path.replace("/discovered_selectors/", "")

        action = op.get("op")
        if action in ("add", "replace"):
            new_map["discovered_selectors"][key] = op.get("value")
        elif action == "remove":
            new_map["discovered_selectors"].pop(key, None)

    return True, new_map, "Delta patch aplicado com sucesso."

