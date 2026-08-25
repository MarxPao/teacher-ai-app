"""
sanitizer.py — Higienizador de PII e Dados Sensíveis para o Sidecar Python
Garante conformidade estrita com a LGPD escolar antes do trânsito de dados para logs e storage.
"""

import re
from typing import Any, Dict, List

# Padrões comuns de dados sensíveis no Brasil
CPF_REGEX = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")
PHONE_REGEX = re.compile(r"\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}-?\d{4}\b")

def scrub_text(text: str) -> str:
    """Substitui CPFs, telefones e emails por marcadores protegidos."""
    if not isinstance(text, str):
        return text
    text = CPF_REGEX.sub("[CPF_PROTEGIDO]", text)
    text = EMAIL_REGEX.sub("[EMAIL_PROTEGIDO]", text)
    text = PHONE_REGEX.sub("[TEL_PROTEGIDO]", text)
    return text

def mask_student_name(full_name: str) -> str:
    """Mascara o sobrenome de alunos mantendo apenas a inicial."""
    if not full_name:
        return "Aluno(a)"
    parts = full_name.strip().split()
    if len(parts) == 1:
        return parts[0]
    first = parts[0]
    last_initial = parts[-1][0].upper()
    return f"{first} {last_initial}."

def clean_state_snapshot(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Limpa e formata o snapshot de estado antes/depois capturado no DOM."""
    if not isinstance(snapshot, dict):
        return {}
    
    clean: Dict[str, Any] = {}
    for key, value in snapshot.items():
        if isinstance(value, str):
            clean[key] = scrub_text(value)
        elif isinstance(value, list):
            clean[key] = [
                clean_state_snapshot(item) if isinstance(item, dict) else (scrub_text(item) if isinstance(item, str) else item)
                for item in value
            ]
        elif isinstance(value, dict):
            clean[key] = clean_state_snapshot(value)
        else:
            clean[key] = value
            
    return clean
