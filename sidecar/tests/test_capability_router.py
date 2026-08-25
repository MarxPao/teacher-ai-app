"""
test_capability_router.py — Testes Unitários do Capability Router em Python
"""

import pytest
import sys
import os

# Adiciona o diretório sidecar ao sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from capability_router import classify_action, model_supports_vision, can_execute_autonomously
from sanitizer import scrub_text, mask_student_name, clean_state_snapshot
from auth import generate_device_code

def test_classify_action():
    assert classify_action("diary", "machado", True) == "low_complexity"
    assert classify_action("grades", "santacatarina", True) == "low_complexity"
    assert classify_action("grades", "desconhecido", False) == "high_complexity"

def test_model_supports_vision():
    assert model_supports_vision("openai", "gpt-4o") is True
    assert model_supports_vision("anthropic", "claude-3-5-sonnet") is True
    assert model_supports_vision("gemini", "gemini-2.0-flash") is True
    assert model_supports_vision("groq", "llama-3.3-70b-versatile") is False
    assert model_supports_vision("deepseek", "deepseek-v3") is False

def test_can_execute_autonomously():
    # Ação de baixa complexidade pode rodar com qualquer modelo
    can_run, comp, reason = can_execute_autonomously("diary", "machado", "groq", "llama-3")
    assert can_run is True
    assert comp == "low_complexity"

    # Ação de alta complexidade com modelo text-only é bloqueada
    can_run, comp, reason = can_execute_autonomously("grades", "portal_novo", "groq", "llama-3", False)
    assert can_run is False
    assert comp == "high_complexity"
    assert "otimizado para texto" in reason

    # Ação de alta complexidade com modelo vision é permitida
    can_run, comp, reason = can_execute_autonomously("grades", "portal_novo", "openai", "gpt-4o", False)
    assert can_run is True
    assert comp == "high_complexity"

def test_sanitizer():
    raw = "Aluno João da Silva - CPF 123.456.789-00 - tel (31) 98877-6655"
    cleaned = scrub_text(raw)
    assert "123.456.789-00" not in cleaned
    assert "[CPF_PROTEGIDO]" in cleaned
    assert "[TEL_PROTEGIDO]" in cleaned

    assert mask_student_name("Mariana Lima") == "Mariana L."

def test_device_code_generation():
    code = generate_device_code()
    assert code.startswith("TA-")
    assert len(code) == 7
