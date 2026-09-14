"""
test_semantic_nlu_resilience.py — Testes da Camada 1 (NLU Semântica Resiliente)

Valida:
1. Roteamento por privacidade (LGPD): frases com PII de aluno → local/regex, nunca cloud.
2. Frases sem PII → Groq / Gemini (tier livre).
3. Fallback offline determinístico (Regex) para contingência pura offline.
4. Telemetria: pii_detected, pii_routed_local, provider_used, model_used.
"""

import os
import pytest
from sidecar.intent_parser import extract_intent


def test_semantic_nlu_pii_vai_para_local():
    """
    Frases com PII de aluno (nome + ação escolar) devem ser resolvidas
    localmente (regex ou ollama_local) — NUNCA via Groq/Gemini free tier.
    """
    intent = extract_intent("marca o Hugo como ausente")
    assert intent["acao"] == "lancar_falta"
    assert "Hugo" in intent["aluno"]
    assert intent["is_complete"] is True
    # PII → local: nunca cloud
    assert intent["pii_detected"] is True
    assert intent["pii_routed_local"] is True
    assert intent["provider_used"] in ["regex", "ollama_local"]


def test_semantic_nlu_nota_paraphrase():
    """
    Frases coloquiais de nota com nome de aluno (PII) devem ser resolvidas
    localmente. O regex melhorado captura 'Hugo tirou 9.5 na avaliação'
    sem precisar de LLM cloud.
    """
    intent = extract_intent("Hugo tirou 9.5 na avaliação")
    assert intent["acao"] == "lancar_nota"
    assert "Hugo" in intent["aluno"]
    assert intent["nota"] == 9.5
    assert intent["is_complete"] is True
    # PII → local (regex ou ollama)
    assert intent["pii_detected"] is True
    assert intent["pii_routed_local"] is True
    assert intent["provider_used"] in ["regex", "ollama_local"]


def test_semantic_nlu_roster_paraphrase():
    """Pedido de leitura de diário (sem PII de aluno individual) → pode usar cloud."""
    intent = extract_intent("quem são os estudantes matriculados?")
    assert intent["acao"] == "read_roster"
    assert intent["is_complete"] is True
    # read_roster não contém PII de aluno específico → pode ir para cloud
    assert intent["pii_detected"] is False
    # provider pode ser groq, gemini ou regex (dependendo de conectividade)
    assert intent["provider_used"] in ["groq", "gemini", "regex"]


def test_semantic_nlu_navigation_paraphrase():
    """Navegação semântica não contém PII → pode usar cloud."""
    intent = extract_intent("quero ver os arquivos")
    assert intent["acao"] == "navegar_aba"
    assert "arquivo" in (intent["destino"] or "").lower()
    assert intent["is_complete"] is True
    assert intent["pii_detected"] is False


def test_pii_frase_nunca_vai_para_groq_mesmo_com_chave(monkeypatch):
    """
    Mesmo com chave Groq válida configurada, frases PII devem ir para local.
    Groq não deve ser chamado.
    """
    chamados = []

    def fake_groq(prompt, key, **kwargs):
        chamados.append(prompt)
        return None

    monkeypatch.setattr("sidecar.intent_parser._call_groq_llm", fake_groq)

    intent = extract_intent("o Hugo faltou hoje", groq_key="gsk_fakekeyxxxxxxxx")
    assert intent["acao"] == "lancar_falta"
    assert "Hugo" in intent["aluno"]
    assert intent["is_complete"] is True
    assert len(chamados) == 0, "Groq não deveria ser chamado para frase PII"
    assert intent["pii_routed_local"] is True


def test_regex_contingency_when_fully_offline():
    """Offline total (sem LLM): regex responde de forma segura para frases PII."""
    intent = extract_intent("lança falta pro Hugo", groq_key="invalid", gemini_key="invalid")
    assert intent["acao"] == "lancar_falta"
    assert "Hugo" in intent["aluno"]
    assert intent["is_complete"] is True
    # PII → regex local (Ollama também offline neste cenário)
    assert intent["provider_used"] in ["regex", "ollama_local"]
    assert intent["pii_routed_local"] is True


def test_incomplete_intent_clarification():
    """Pedidos incompletos continuam gerando perguntas acolhedoras de esclarecimento."""
    intent = extract_intent("lança nota pro Hugo")
    assert intent["acao"] == "lancar_nota"
    assert intent["is_complete"] is False
    assert intent["clarification_question"] is not None
    assert "Hugo" in intent["clarification_question"]
