"""
test_semantic_nlu_resilience.py — Testes da Camada 1 (NLU Semântica Resiliente)

Valida:
1. Resolução primária via LLM (Groq) com extração precisa de intenções e parâmetros semânticos.
2. Fallback secundário transparente para Google Gemini Flash em caso de erro/rate-limit.
3. Fallback terciário determinístico (Regex) para contingência pura offline.
4. Telemetria e rastreabilidade do provedor utilizado (provider_used / model_used).
"""

import os
import pytest
from sidecar.intent_parser import extract_intent


def test_semantic_nlu_groq_or_gemini_active():
    """Valida que o interpretador semântico da Camada 1 resolve requisições via LLM (não regex)."""
    intent = extract_intent("marca o Hugo como ausente")
    assert intent["acao"] == "lancar_falta"
    assert "Hugo" in intent["aluno"]
    assert intent["is_complete"] is True
    assert intent["provider_used"] in ["groq", "gemini"]
    assert intent["model_used"] != "deterministic_regex_rules"


def test_semantic_nlu_nota_paraphrase():
    """Valida extração de notas em frases coloquiais sem regras rígidas de regex."""
    intent = extract_intent("Hugo tirou 9.5 na avaliação")
    assert intent["acao"] == "lancar_nota"
    assert "Hugo" in intent["aluno"]
    assert intent["nota"] == 9.5
    assert intent["is_complete"] is True
    assert intent["provider_used"] in ["groq", "gemini"]


def test_semantic_nlu_roster_paraphrase():
    """Valida pedido de leitura de diário usando termos variados ('estudantes matriculados')."""
    intent = extract_intent("quem são os estudantes matriculados?")
    assert intent["acao"] == "read_roster"
    assert intent["is_complete"] is True
    assert intent["provider_used"] in ["groq", "gemini"]


def test_semantic_nlu_navigation_paraphrase():
    """Valida navegação semântica em aba de arquivos ('quero ver os arquivos')."""
    intent = extract_intent("quero ver os arquivos")
    assert intent["acao"] == "navegar_aba"
    assert "arquivo" in (intent["destino"] or "").lower()
    assert intent["is_complete"] is True
    assert intent["provider_used"] in ["groq", "gemini"]


def test_gemini_fallback_when_groq_unavailable():
    """Valida que, caso o Groq falhe ou atinja cota, o Google Gemini Flash assume imediatamente."""
    intent = extract_intent("o Hugo faltou hoje", groq_key="invalid_groq_key_to_force_fallback")
    assert intent["acao"] == "lancar_falta"
    assert "Hugo" in intent["aluno"]
    assert intent["is_complete"] is True
    assert intent["provider_used"] == "gemini"
    assert "gemini" in intent["model_used"].lower()


def test_regex_contingency_when_fully_offline():
    """Valida que, se não houver nenhuma conexão LLM (offline), o regex responde de forma segura."""
    intent = extract_intent("lança falta pro Hugo", groq_key="invalid", gemini_key="invalid")
    assert intent["acao"] == "lancar_falta"
    assert "Hugo" in intent["aluno"]
    assert intent["is_complete"] is True
    assert intent["provider_used"] == "regex"
    assert intent["model_used"] == "deterministic_regex_rules"


def test_incomplete_intent_clarification():
    """Valida que pedidos incompletos continuam gerando perguntas acolhedoras de esclarecimento."""
    intent = extract_intent("lança nota pro Hugo")
    assert intent["acao"] == "lancar_nota"
    assert intent["is_complete"] is False
    assert intent["clarification_question"] is not None
    assert "Hugo" in intent["clarification_question"]
