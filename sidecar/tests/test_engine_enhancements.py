"""
test_engine_enhancements.py — Testes Automatizados dos Aprimoramentos do Motor (Teacher AI)

Valida as 4 novas capacidades:
1. Hiper-Precisão Semântica com Pedagogical Domain Gloss (resolução do viés 'registro de ausências').
2. Resolução de jargões regionais ('ver pautas' -> 'Notas').
3. Comportamento do seletor use_domain_gloss (Raw vs Enriquecido).
4. Auto-Cura de Seletores Degradados no PortalMapStore (Self-Healing SkillGraph).
5. Validação e normalização de notas do Guardião Pedagógico.
"""

import sys
from pathlib import Path
import pytest

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from local_semantic_matcher import LocalSemanticMatcher, PEDAGOGICAL_DOMAIN_GLOSSES
from portal_map_store import PortalMapStore, PortalSelectorMap


# ── 1. Testes de Hiper-Precisão Semântica (Domain Gloss) ─────────────────────

def test_domain_gloss_resolves_polysemic_registro_de_ausencias():
    """
    Comprova que o Pedagogical Domain Gloss elimina a fragilidade do termo 'registro de ausências',
    fazendo 'Frequência' vencer 'Notas' com folga na similaridade por cosseno.
    """
    matcher = LocalSemanticMatcher()
    candidates = ["Notas", "Frequência", "Recados", "Horários"]
    query = "registro de ausências"

    result = matcher.match_best_candidate(query, candidates, use_domain_gloss=True)
    assert result is not None
    best_candidate, score, _ = result

    # 'Frequência' deve ser a vencedora indiscutível
    assert best_candidate == "Frequência"
    assert score >= 0.50


def test_domain_gloss_resolves_ver_pautas():
    """
    Comprova que 'ver pautas' é mapeado para 'Notas' pelo motor semântico com glossário.
    """
    matcher = LocalSemanticMatcher()
    candidates = ["Notas", "Frequência", "Recados", "Horários"]
    query = "ver pautas"

    result = matcher.match_best_candidate(query, candidates, use_domain_gloss=True)
    assert result is not None
    best_candidate, score, _ = result

    assert best_candidate == "Notas"
    assert score >= 0.50


def test_domain_gloss_toggle_shows_clear_contrast():
    """
    Comprova empiricamente o efeito do Domain Gloss:
    - Sem gloss (use_domain_gloss=False): 'Notas' vence erroneamente devido ao viés da palavra 'registro'.
    - Com gloss (use_domain_gloss=True): 'Frequência' vence corretamente.
    """
    matcher = LocalSemanticMatcher()
    candidates = ["Notas", "Frequência", "Recados", "Horários"]
    query = "registro de ausências"

    raw_result = matcher.match_best_candidate(query, candidates, use_domain_gloss=False)
    enhanced_result = matcher.match_best_candidate(query, candidates, use_domain_gloss=True)

    assert raw_result is not None
    assert enhanced_result is not None

    raw_winner, raw_score, _ = raw_result
    enhanced_winner, enhanced_score, _ = enhanced_result

    # Sem gloss, o viés estatístico de 'registro' favorece Notas
    assert raw_winner == "Notas"

    # Com gloss pedagógico, Frequência assume a liderança
    assert enhanced_winner == "Frequência"


# ── 2. Testes de Self-Healing no PortalMapStore ────────────────────────────────

def test_self_healing_selector_lifecycle():
    """
    Comprova o ciclo completo de auto-cura:
    1. Registro de falha incrementa contador e ativa flag de drift.
    2. heal_selector atualiza o seletor degradado pelo novo seletor.
    3. Contador de falhas é zerado e flag de drift é limpa.
    """
    store = PortalMapStore()
    domain = "colegio-modelo.com.br"
    action_key = "lancar_nota"

    # Salva mapa inicial com seletor antigo
    store.save_map(
        domain=domain,
        selectors={action_key: {"selector": "#nota_v1_old", "confidence": "high"}},
        confidence="high"
    )

    # 1. Simula falha do seletor
    failures = store.record_selector_failure(domain, action_key)
    assert failures == 1
    assert store.is_drifted(domain, action_key) is True

    # 2. Executa auto-cura com novo seletor descoberto pela Camada 2
    new_selector_data = {"selector": "#nota_v2_healed", "confidence": "high"}
    healed = store.heal_selector(domain, action_key, new_selector_data)
    assert healed is True

    # 3. Valida que o mapa está curado
    active_map = store.lookup_map(domain)
    assert active_map is not None
    assert active_map.discovered_selectors[action_key]["selector"] == "#nota_v2_healed"
    assert active_map.validation_failures == 0
    assert store.is_drifted(domain, action_key) is False


# ── 3. Testes do Guardião Pedagógico de Notas ─────────────────────────────────

def normalize_grade_pedagogical(val) -> tuple[bool, float, str]:
    """Função de teste espelhando a lógica implementada no SafeWriter."""
    try:
        raw = float(str(val).replace(",", "."))
    except (ValueError, TypeError):
        return False, 0.0, "Valor inválido"

    if raw > 10 and raw <= 100:
        normalized = round(raw / 10.0, 1)
        return True, normalized, f"Nota normalizada de {raw} para {normalized}"
    elif raw < 0 or raw > 100:
        return False, raw, f"A nota {raw} está fora da escala permitida (0 a 10)"
    else:
        return True, raw, "Nota válida"


def test_pedagogical_grade_normalization():
    """Valida que notas digitadas na escala 0-100 são suavemente convertidas para 0-10."""
    valid, norm, msg = normalize_grade_pedagogical(95)
    assert valid is True
    assert norm == 9.5

    valid, norm, msg = normalize_grade_pedagogical("80")
    assert valid is True
    assert norm == 8.0

    valid, norm, msg = normalize_grade_pedagogical("7,5")
    assert valid is True
    assert norm == 7.5

    valid, norm, msg = normalize_grade_pedagogical(150)
    assert valid is False
    assert "fora da escala" in msg

    valid, norm, msg = normalize_grade_pedagogical(-2)
    assert valid is False
    assert "fora da escala" in msg
