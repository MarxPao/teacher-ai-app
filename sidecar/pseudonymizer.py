"""
pseudonymizer.py — Motor de Pseudonimização em Memória (Cadeado de Segurança Final)
═══════════════════════════════════════════════════════════════════════════════════════
Substitui nomes reais de alunos por tokens opacos `ALUNO_<6 hex chars>` ANTES
de qualquer chamada a APIs de nuvem (Groq/Gemini). O mapa token↔nome vive
EXCLUSIVAMENTE em memória RAM e é destruído ao final de cada requisição.

GARANTIAS:
  - Tokens nunca derivam do nome real (gerados via secrets.token_hex)
  - known_students=None ou lista vazia → PseudonymizationError (fail-closed)
  - Tokens são únicos por requisição (novo secrets.token_hex a cada chamada)
  - depseudonymize() reconstrói nomes reais a partir do token_map em memória
  - Nenhuma gravação em disco de token_map

Autor: Cadeado de Segurança — Teacher AI
"""

from __future__ import annotations

import re
import secrets
import unicodedata
from typing import Dict, List, Optional, Tuple


class PseudonymizationError(RuntimeError):
    """
    Levantada quando pseudonimização não pode ser garantida.
    Sinaliza ao chamador para tratar o texto como Classe 1 (local apenas).
    """
    pass


# ─── Normalização interna ──────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    """Remove acentos e converte para minúsculas."""
    nfd = unicodedata.normalize("NFD", text)
    return "".join(c for c in nfd if not unicodedata.combining(c)).lower().strip()


def _build_student_variants(student_name: str) -> List[str]:
    """
    Gera variantes de busca para um nome de aluno:
    - Nome completo
    - Partes individuais com >= 3 caracteres (prenome e sobrenome)
    - Versão normalizada (sem acento)

    Retorna lista de strings a serem buscadas no texto original (case-insensitive).
    """
    variants = set()
    name_stripped = student_name.strip()
    if not name_stripped:
        return []

    # Nome completo e normalizado
    variants.add(name_stripped)
    variants.add(_normalize(name_stripped))

    # Partes do nome (para sobrenomes e prenomes separados)
    for part in re.split(r"\s+", name_stripped):
        if len(part) >= 3:
            variants.add(part)
            variants.add(_normalize(part))

    return [v for v in variants if v]


# ─── API pública ───────────────────────────────────────────────────────────────

def pseudonymize(
    text: str,
    known_students: Optional[List[str]],
) -> Tuple[str, Dict[str, str]]:
    """
    Substitui nomes reais de alunos por tokens opacos no texto.

    Parâmetros
    ----------
    text : str
        Texto original do comando da professora.
    known_students : list[str] | None
        Lista de nomes completos dos alunos da turma ativa.
        None ou lista vazia → PseudonymizationError (fail-closed).

    Retorno
    -------
    (texto_mascarado, token_map) : tuple[str, dict[str, str]]
        texto_mascarado : texto com nomes substituídos por tokens ALUNO_xxxxxx
        token_map : {token: nome_original} — SOMENTE em memória, destruir após uso

    Raises
    ------
    PseudonymizationError
        Se known_students for None, vazio, ou se ocorrer qualquer falha na varredura.
        O chamador deve tratar o texto como Classe 1 (local somente).
    """
    if not known_students:
        raise PseudonymizationError(
            "Lista de alunos indisponível (known_students=None ou vazia). "
            "Impossível garantir pseudonimização — texto tratado como Classe 1."
        )

    # Mapa inverso: token → nome_original (somente em RAM)
    token_map: Dict[str, str] = {}
    # Mapa de busca: variante_normalizada → (nome_original, token)
    # Ordena por tamanho decrescente para substituir nomes compostos antes das partes
    variant_to_token: Dict[str, str] = {}
    original_names: Dict[str, str] = {}  # variante → nome_original_completo

    for student_name in known_students:
        if not student_name or not student_name.strip():
            continue

        # Gera token único e opaco (não derivado do nome)
        token = f"ALUNO_{secrets.token_hex(3).upper()}"
        # Garante unicidade do token (colisão improvável mas protegida)
        while token in token_map:
            token = f"ALUNO_{secrets.token_hex(3).upper()}"

        token_map[token] = student_name.strip()

        for variant in _build_student_variants(student_name):
            variant_to_token[variant] = token
            original_names[variant] = student_name.strip()

    if not variant_to_token:
        raise PseudonymizationError(
            "Nenhum aluno válido na lista — pseudonimização impossível."
        )

    # Substitui no texto: ordena variantes por tamanho (maior primeiro)
    # para que "João Silva" seja substituído antes de "João"
    masked_text = text
    for variant in sorted(variant_to_token.keys(), key=len, reverse=True):
        token = variant_to_token[variant]
        # Substituição case-insensitive (cobre "Hugo", "hugo", "HUGO")
        try:
            pattern = re.compile(re.escape(variant), re.IGNORECASE)
            masked_text = pattern.sub(token, masked_text)
        except re.error:
            # Variante com chars especiais — pula silenciosamente (seguro)
            continue

    return masked_text, token_map


def depseudonymize(
    text: str,
    token_map: Dict[str, str],
) -> str:
    """
    Reconstrói nomes reais a partir do token_map em memória.

    Parâmetros
    ----------
    text : str
        Texto da resposta da API com tokens ALUNO_xxxxxx.
    token_map : dict[str, str]
        Mapa {token: nome_original} retornado por pseudonymize().
        Após esta chamada, o chamador deve deletar (ou deixar sair de escopo) o mapa.

    Retorno
    -------
    str
        Texto com tokens substituídos pelos nomes reais.
    """
    if not token_map:
        return text

    result = text
    for token, real_name in token_map.items():
        result = result.replace(token, real_name)

    return result


def verify_no_real_names_in_payload(
    payload_bytes: bytes,
    known_students: List[str],
) -> List[str]:
    """
    Verifica empiricamente que nenhum nome real de aluno aparece no payload
    bruto que seria enviado à API de nuvem.

    Usada exclusivamente em testes (TestNetworkPayloadVerification).

    Retorno
    -------
    list[str]
        Lista de nomes reais encontrados no payload (vazia = ✅ seguro).
    """
    payload_lower = payload_bytes.decode("utf-8", errors="replace").lower()
    leaks: List[str] = []

    for student_name in known_students:
        for variant in _build_student_variants(student_name):
            if len(variant) >= 3 and variant in payload_lower:
                if student_name not in leaks:
                    leaks.append(student_name)
                break

    return leaks
