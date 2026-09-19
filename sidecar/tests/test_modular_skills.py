"""
sidecar/tests/test_modular_skills.py — Testes Unitários do Catálogo de Skills Modulares
"""

import pytest
import sys
from pathlib import Path

_SIDECAR = Path(__file__).resolve().parent.parent
if str(_SIDECAR) not in sys.path:
    sys.path.insert(0, str(_SIDECAR))

from skills.portal_topology_skill import PortalTopologySkill
from skills.semantic_anchor_skill import SemanticAnchorSkill
from skills.interactive_actor_skill import InteractiveActorSkill
from skills.ground_truth_verifier_skill import GroundTruthVerifierSkill
from skills.pathway_compiler_skill import PathwayCompilerSkill


class TestModularSkills:

    def test_portal_topology_detection_legacy_and_widgets(self):
        page_data = {
            "url": "https://escola.gov.br/diario.aspx",
            "raw_html": '<input type="hidden" name="__VIEWSTATE" value="xyz"/> <div class="select2-container"></div>',
            "tables": [
                {
                    "headers": [],
                    "rows": [
                        ["Horário", "2ª-Feira", "4ª-Feira"],
                        ["07:15", "Matemática", "Inglês"]
                    ]
                }
            ]
        }
        res = PortalTopologySkill.analyze_topology(page_data)
        assert res["architecture"] == "aspnet_webforms_legacy"
        assert res["table_pattern"] == "legacy_table_no_th_header_in_rows"
        assert "select2_dropdown" in res["widgets_detected"]
        assert res["is_legacy"] is True
        assert res["recommended_strategy"]["header_extraction_mode"] == "auto_promote_row0"

    def test_semantic_anchor_derivation_and_fallbacks(self):
        element_info = {
            "tag": "button",
            "text": "Salvar Diário",
            "aria_label": "Gravar Frequência da Turma",
            "row_context": "Hugo Leonardo",
            "id": "btn_salvar_991823"
        }
        anchors = SemanticAnchorSkill.derive_anchors_for_element(element_info)
        assert anchors["anchor_strategy"] == "aria_label"
        assert anchors["primary_selector"] == '[aria-label="Gravar Frequência da Turma"]'
        
        # Verifica se os fallbacks foram gerados
        fallbacks = anchors["fallback_selectors"]
        assert len(fallbacks) >= 2
        strategies = [f["strategy"] for f in fallbacks]
        assert "text_match" in strategies
        assert "relative_row_context" in strategies

    def test_interactive_actor_scripts(self):
        fill_script = InteractiveActorSkill.get_fill_script("input#nota_1", "9.5")
        assert "input" in fill_script
        assert "change" in fill_script
        assert "blur" in fill_script
        assert "9.5" in fill_script

        click_script = InteractiveActorSkill.get_click_script("button.submit")
        assert "scrollIntoView" in click_script
        assert "elementFromPoint" in click_script

    def test_ground_truth_verifier_error_and_success(self):
        # 1. Caso de Erro Explícito no Portal
        state_err = {"page_text": "Atenção: Sessão expirada. Faça login novamente."}
        verif_err = GroundTruthVerifierSkill.verify({"url": ""}, state_err)
        assert verif_err["verified"] is False
        assert verif_err["status"] == "ERROR_DETECTED"
        assert "sessão expirada" in verif_err["details"].lower()

        # 2. Caso de Sucesso Factual
        state_success = {"page_text": "Frequência registrada com sucesso!"}
        verif_success = GroundTruthVerifierSkill.verify({"url": ""}, state_success)
        assert verif_success["verified"] is True
        assert verif_success["status"] == "SUCCESS"

        # 3. Caso de Efeito Nulo (Zero-Alucinação)
        state_neutral = {"url": "https://portal.com/diario", "page_text": "Painel de Aulas"}
        verif_neutral = GroundTruthVerifierSkill.verify({"url": "https://portal.com/diario"}, state_neutral)
        assert verif_neutral["verified"] is False
        assert verif_neutral["status"] == "NO_EFFECT"

    def test_pathway_compiler_pruning_and_step_assembly(self):
        raw_steps = [
            {"type": "NAVIGATE", "payload": {"url": "https://portal.com/horarios"}},
            {"type": "NOOP"},  # Deve ser podado
            {"type": "CLICK", "target": "Salvar", "context": {"student_name": "Hugo"}}
        ]
        compiled = PathwayCompilerSkill.compile_trajectory(
            portal_id="machado",
            intent="save_grades",
            title="Salvar Notas",
            start_url="https://portal.com/login",
            raw_steps=raw_steps
        )
        assert compiled["portal_id"] == "machado"
        assert compiled["intent"] == "save_grades"
        assert len(compiled["steps"]) == 2  # O NOOP foi descartado
        assert compiled["steps"][0]["action_type"] == "NAVIGATE"
        assert compiled["steps"][1]["action_type"] == "CLICK"
        assert compiled["status"] == "compiled"
