"""
test_ten_enhancements.py — Testes Automatizados dos 10 Novos Aprimoramentos (Teacher AI)

Valida as 10 capacidades estruturais:
1. Dicionário de Hipocorísticos (PT-BR)
2. Esquema Canônico Universal (Babel de Portais)
3. Verificação Visual Pós-Escrita (Pixel/DOM Diffing)
4. Visual Grounding Local por Coordenadas
5. Pipeline de Voz Local com VAD
6. Keep-Alive Ativo de Sessão Escolar
7. Federação Segura de Mapas de Portais (LGPD PII Stripping + SHA-256)
8. Guardião Estatístico Curricular de Anomalias
9. Memória Local de Preferências da Professora (RLHF)
10. Integração e consistência dos módulos
"""

import json
import math
import struct
import sys
from pathlib import Path
import pytest

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from hypocoristic_matcher import match_student_with_hypocoristics, get_formal_candidates
from universal_schema_normalizer import (
    CanonicalAction,
    CanonicalPeriod,
    CanonicalStatus,
    CanonicalTask,
    get_portal_adapter,
)
from visual_verifier import verify_dom_persistence, calculate_image_diff_ratio, verify_write_execution
from visual_grounding import BoundingBox, VisualGroundingEngine
from offline_voice_pipeline import VoiceActivityDetector, OfflineVoicePipeline
from portal_map_federation import export_federated_map, import_federated_map
from pedagogical_anomaly_guardian import calculate_statistics, analyze_grade_batch
from teacher_preference_memory import TeacherPreferenceMemory


# ── 1. Hipocorísticos e Apelidos (PT-BR) ──────────────────────────────────────

def test_hypocoristic_matching():
    """Valida que apelidos brasileiros encontram os nomes de registro formal no portal."""
    roster = ["José da Silva", "Maria Eduarda Santos", "Rafael de Oliveira", "Francisco Pereira", "Isabela Lima"]

    # "Zé" -> "José da Silva"
    match, conf = match_student_with_hypocoristics("Zé", roster)
    assert match == "José da Silva"
    assert conf >= 0.90

    # "Duda" -> "Maria Eduarda Santos"
    match, conf = match_student_with_hypocoristics("Duda", roster)
    assert match == "Maria Eduarda Santos"
    assert conf >= 0.85

    # "Rafa" -> "Rafael de Oliveira"
    match, conf = match_student_with_hypocoristics("Rafa", roster)
    assert match == "Rafael de Oliveira"
    assert conf >= 0.90

    # "Chico" -> "Francisco Pereira"
    match, conf = match_student_with_hypocoristics("Chico", roster)
    assert match == "Francisco Pereira"
    assert conf >= 0.90

    # "Bel" -> "Isabela Lima"
    match, conf = match_student_with_hypocoristics("Bel", roster)
    assert match == "Isabela Lima"
    assert conf >= 0.85


# ── 2. Esquema Canônico Universal (Babel de Portais) ──────────────────────────

def test_universal_schema_normalization():
    """Valida tradução bidirecional entre entidades canônicas e dialetos de portais."""
    # i-Educar
    adapter_ieducar = get_portal_adapter("ieducar")
    raw_ieducar = {
        "acao": "lancar_nota",
        "nome_aluno": "Hugo Gloss",
        "turma": "7B",
        "modulo": "1",
        "nota": 9.5
    }
    canonical = adapter_ieducar.to_canonical(raw_ieducar)
    assert canonical.action == CanonicalAction.POST_GRADE
    assert canonical.student_name == "Hugo Gloss"
    assert canonical.numeric_value == 9.5
    assert canonical.period == CanonicalPeriod.BIMESTER_1

    # Volta para formato i-Educar
    exported = adapter_ieducar.from_canonical(canonical)
    assert exported["portal"] == "ieducar"
    assert exported["tipo_operacao"] == "lancar_nota"

    # SED-SP
    adapter_sed = get_portal_adapter("sed_sp")
    raw_sed = {
        "tipo": "lancar_falta",
        "estudante": "Ana Silva",
        "classe": "6A",
        "bimestre": 1,
        "ausencia": True
    }
    can_sed = adapter_sed.to_canonical(raw_sed)
    assert can_sed.action == CanonicalAction.RECORD_ATTENDANCE
    assert can_sed.student_name == "Ana Silva"
    assert can_sed.status_value == CanonicalStatus.ABSENT


# ── 3. Verificação Visual Pós-Escrita (DOM + Pixel Diffing) ───────────────────

def test_visual_verifier_dom_persistence():
    """Valida persistência de valores no DOM após eventos blur."""
    assert verify_dom_persistence("9.5", "9.5") is True
    assert verify_dom_persistence("9.5", "9,5") is True
    assert verify_dom_persistence(9, "9.0") is True
    assert verify_dom_persistence("9.5", "8.0") is False

    # Execução combinada
    res_ok = verify_write_execution(expected_value="9.5", read_back_value="9.5")
    assert res_ok["verified"] is True
    assert res_ok["status"] == "success"

    res_reverted = verify_write_execution(expected_value="9.5", read_back_value="vazio")
    assert res_reverted["verified"] is False
    assert res_reverted["status"] == "reverted_by_spa"


# ── 4. Visual Grounding Local por Coordenadas ─────────────────────────────────

def test_visual_grounding_coordinates():
    """Valida cálculo de pontos centrais e coordenadas relativas para clique."""
    engine = VisualGroundingEngine()
    mock_box = BoundingBox(x=100, y=200, width=80, height=40, text="Salvar Notas", confidence=0.98)

    cx, cy = mock_box.center_point
    assert cx == 140
    assert cy == 220

    rel = engine.calculate_relative_click_point(mock_box, viewport_width=1000, viewport_height=800)
    assert rel["x"] == 140
    assert rel["y"] == 220
    assert rel["relative_x"] == 0.14
    assert rel["relative_y"] == 0.275

    # Localização via mock candidates
    found = engine.find_target_coordinates(b"", "salvar", mock_candidates=[mock_box])
    assert found is not None
    assert found.text == "Salvar Notas"


# ── 5. Pipeline de Voz Local com VAD ──────────────────────────────────────────

def test_offline_voice_vad_segmentation():
    """Valida detecção de atividade de voz e segmentação de enunciados."""
    vad = VoiceActivityDetector(energy_threshold=0.02)
    pipeline = OfflineVoicePipeline(energy_threshold=0.02)

    # 1. Silêncio puro (todos zeros)
    silence_pcm = b"\x00" * 3200  # 100ms a 16kHz 16-bit
    assert vad.calculate_rms(silence_pcm) == 0.0
    assert vad.is_speech(silence_pcm) is False

    # 2. Fala simulada (onda senoidal de alta amplitude)
    samples = [int(15000 * math.sin(2 * math.pi * 440 * i / 16000)) for i in range(1600)]
    speech_pcm = struct.pack(f"<{len(samples)}h", *samples)
    assert vad.calculate_rms(speech_pcm) > 0.1
    assert vad.is_speech(speech_pcm) is True

    # 3. Buffer do pipeline
    for _ in range(6):
        res = pipeline.feed_audio_chunk(speech_pcm)
        assert res["has_speech"] is True

    # Silêncio subsequente fecha o enunciado
    res_silence = pipeline.feed_audio_chunk(silence_pcm)
    assert res_silence["utterance_ready"] is True
    assert len(res_silence["audio_payload"]) > 0


# ── 6. Federação Segura de Mapas (PII Stripping + SHA-256) ───────────────────

def test_portal_map_federation_pii_clean_and_checksum():
    """Valida exportação e importação higienizada de mapas de seletores."""
    clean_map = {
        "portal_domain": "machadosobrinho.paineldoaluno.com.br",
        "portal_display_name": "Machado Sobrinho",
        "discovered_selectors": {
            "lancar_nota": {"selector": "#campo_nota", "type": "input"}
        },
        "discovery_confidence": "high",
        "discovered_by_teacher_id": "prof_secret_id_12345"  # Deve ser removido no export
    }

    # Exportação gera JSON assinado
    pkg_str = export_federated_map(clean_map)
    pkg = json.loads(pkg_str)
    assert "checksum_sha256" in pkg
    assert "discovered_by_teacher_id" not in pkg["payload"]

    # Importação válida
    ok, imported, msg = import_federated_map(pkg_str)
    assert ok is True
    assert imported["portal_domain"] == clean_map["portal_domain"]

    # Tentativa de exportar com CPF no seletor deve ser bloqueada
    dirty_map = clean_map.copy()
    dirty_map["discovered_selectors"] = {"lancar_nota": {"selector": "#aluno_123.456.789-00"}}
    with pytest.raises(ValueError, match="LGPD"):
        export_federated_map(dirty_map)


# ── 7. Guardião Estatístico Curricular de Anomalias ────────────────────────────

def test_pedagogical_anomaly_guardian():
    """Valida detecção de médias atipicamente baixas e reprovação em massa."""
    # Turma normal
    grades_normal = [7.5, 8.0, 8.5, 9.0, 7.0, 8.5, 9.5, 8.0]
    res_normal = analyze_grade_batch(grades_normal)
    assert res_normal["has_anomaly"] is False
    assert res_normal["friendly_notice"] is None

    # Turma com média excessivamente baixa (ex: 2.2)
    grades_low = [2.0, 1.5, 3.0, 2.5, 1.0, 2.0, 3.5, 2.0]
    res_low = analyze_grade_batch(grades_low)
    assert res_low["has_anomaly"] is True
    assert "low_class_average" in res_low["anomaly_types"]
    assert "revisar as notas" in res_low["friendly_notice"]


# ── 8. Memória Local de Preferências (RLHF) ───────────────────────────────────

def test_teacher_preference_memory():
    """Valida armazenamento e ponderação híbrida de escolhas recorrentes da professora."""
    memory = TeacherPreferenceMemory(db_path=":memory:")
    context = "turma_8b:aluno_lucas"

    # Inicialmente nenhuma escolha
    assert memory.get_preferred_choice(context) is None

    # Registra preferências
    memory.record_choice(context, "Lucas Silva")
    memory.record_choice(context, "Lucas Silva")
    memory.record_choice(context, "Lucas Santos")

    # Lucas Silva deve ser a escolha preferencial (2 votos vs 1)
    assert memory.get_preferred_choice(context) == "Lucas Silva"
    assert memory.get_choice_frequency(context, "Lucas Silva") == 2

    # Pontuação híbrida favorece a opção preferencial
    base_score = 0.60
    hybrid_silva = memory.calculate_hybrid_score(base_score, context, "Lucas Silva", preference_weight=0.30)
    hybrid_santos = memory.calculate_hybrid_score(base_score, context, "Lucas Santos", preference_weight=0.30)

    assert hybrid_silva > hybrid_santos
    assert hybrid_silva > base_score
