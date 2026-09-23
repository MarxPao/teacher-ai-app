"""
test_advanced_optimizations.py — Testes Unitários das Otimizações Avançadas (Rodadas 1 e 2)

Cobre:
1. Ancoragem Espacial Relativa (find_spatially_aligned_input em visual_grounding.py)
2. Patches Delta de Mapas Federados RFC 6902 com SHA-256 (portal_map_federation.py)
3. Criptografia em Repouso AES/XOR para LGPD (teacher_preference_memory.py)
4. Interpretador de Regras Pedagógicas Relacionais Locais (pedagogical_anomaly_guardian.py)
"""

import json
import os
import sys
import tempfile
import pytest

from sidecar.visual_grounding import BoundingBox, VisualGroundingEngine
from sidecar.portal_map_federation import create_delta_patch, apply_delta_patch
from sidecar.teacher_preference_memory import TeacherPreferenceMemory
from sidecar.pedagogical_anomaly_guardian import evaluate_relational_rule


def test_spatial_relative_anchoring():
    """Valida localização geométrica de inputs alinhados à direita do rótulo do aluno."""
    engine = VisualGroundingEngine()

    label_alice = BoundingBox(x=50, y=100, width=120, height=30, text="Alice Almeida", confidence=0.98)
    
    # Inputs candidatos:
    # 1. Input correto alinhado na mesma linha Y (x=200, y=100)
    # 2. Input de outra linha (x=200, y=180)
    # 3. Input à esquerda do rótulo (x=10, y=100)
    input_correto = BoundingBox(x=200, y=102, width=60, height=28, text="", confidence=0.95)
    input_outra_linha = BoundingBox(x=200, y=180, width=60, height=28, text="", confidence=0.95)
    input_esquerda = BoundingBox(x=10, y=100, width=30, height=28, text="", confidence=0.95)

    candidates = [input_outra_linha, input_esquerda, input_correto]

    matched_input = engine.find_spatially_aligned_input(label_alice, candidates, max_distance_x=400, max_tolerance_y=15)
    assert matched_input is not None
    assert matched_input == input_correto
    assert matched_input.x == 200


def test_portal_map_delta_patch_rfc6902():
    """Valida geração e aplicação de patches delta com integridade SHA-256 e segurança LGPD."""
    base_map = {
        "portal_domain": "portal.escola.sp.gov.br",
        "discovered_selectors": {
            "btn_salvar": "#btn-salvar-original",
            "campo_nota": ".input-nota-v1",
            "campo_antigo": "#obsoleto"
        }
    }

    updated_map = {
        "portal_domain": "portal.escola.sp.gov.br",
        "discovered_selectors": {
            "btn_salvar": "#btn-salvar-autocura", # replace
            "campo_nota": ".input-nota-v1",       # inalterado
            "novo_filtro": ".select-trimestre"    # add
            # campo_antigo foi removido
        }
    }

    delta_json = create_delta_patch(base_map, updated_map)
    package = json.loads(delta_json)

    assert package["schema"] == "teacher_ai_federated_delta_patch"
    assert "checksum_sha256" in package
    ops = package["payload"]["operations"]
    assert len(ops) == 3 # 1 replace, 1 add, 1 remove

    # Aplica o patch sobre o mapa base
    sucesso, new_map, msg = apply_delta_patch(base_map, delta_json)
    assert sucesso is True
    assert new_map["discovered_selectors"]["btn_salvar"] == "#btn-salvar-autocura"
    assert new_map["discovered_selectors"]["novo_filtro"] == ".select-trimestre"
    assert "campo_antigo" not in new_map["discovered_selectors"]


def test_teacher_preference_encryption_at_rest():
    """Valida que o histórico de preferências é criptografado em repouso no SQLite."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp_db = f.name

    try:
        secret_key = "chave_mestra_professora_segura_123"
        mem = TeacherPreferenceMemory(db_path=tmp_db, encryption_key=secret_key)
        
        context = "turma_9a:aluno_gabriel"
        choice = "Gabriel Santos Pereira"

        mem.record_choice(context, choice)

        # 1. Valida leitura transparente decifrada pela API
        preferred = mem.get_preferred_choice(context)
        assert preferred == choice

        # 2. Valida que fisicamente no banco SQLite o texto está cifrado (sem PII em texto claro)
        with mem._lock:
            cursor = mem._conn.cursor()
            cursor.execute("SELECT choice_value FROM teacher_preferences WHERE context_key = ?", (context,))
            raw_in_db = cursor.fetchone()[0]
            assert raw_in_db.startswith("enc:")
            assert "Gabriel" not in raw_in_db
            assert "Santos" not in raw_in_db

        mem.close()
    finally:
        if os.path.exists(tmp_db):
            try:
                os.remove(tmp_db)
            except Exception:
                pass


def test_relational_rule_evaluator():
    """Valida avaliação de regras pedagógicas compostas (médias ponderadas e presença)."""
    students = [
        {"student_id": "ALU-1", "grades": {"prova": 8.0, "trabalho": 9.0}, "attendance_pct": 85.0},
        {"student_id": "ALU-2", "grades": {"prova": 5.0, "trabalho": 6.0}, "attendance_pct": 70.0},
    ]

    # Regra 1: Média Ponderada (Prova peso 2, Trabalho peso 1)
    rule_avg = {
        "type": "weighted_average",
        "weights": {"prova": 2.0, "trabalho": 1.0}
    }
    res_avg = evaluate_relational_rule(rule_avg, students)
    assert res_avg["processed_count"] == 2
    # ALU-1: (8*2 + 9*1) / 3 = 25/3 = 8.33
    assert res_avg["results"][0]["final_grade"] == 8.33
    # ALU-2: (5*2 + 6*1) / 3 = 16/3 = 5.33
    assert res_avg["results"][1]["final_grade"] == 5.33

    # Regra 2: Corte de Presença mínima de 75%
    rule_att = {
        "type": "attendance_cutoff",
        "min_attendance_pct": 75.0
    }
    res_att = evaluate_relational_rule(rule_att, students)
    assert res_att["results"][0]["eligible"] is True
    assert res_att["results"][1]["eligible"] is False
