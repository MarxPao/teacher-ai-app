"""
test_visual_highlight_and_sidepanel.py — Testes de validação para:
1. Migração de Popup para Side Panel fixo (manifest.json e background.js)
2. Destaque visual em tempo real (content.js e safe_writer.py)
3. Correção de tags e visibilidade do modal de skill e badge acolhedor
"""

import json
import os
import re
import pytest
from unittest.mock import AsyncMock, MagicMock
from sidecar.safe_writer import SafeWriter, HIGHLIGHT_JS_HELPER


def test_manifest_sidepanel_configuration():
    manifest_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "teacher-extension", "manifest.json"
    )
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    action = data.get("action", {})
    assert "default_popup" not in action, "action.default_popup deve ser removido para habilitar side panel fixo"
    assert "side_panel" in data, "manifest deve declarar side_panel"
    assert data["side_panel"].get("default_path") == "side_panel.html"
    assert "sidePanel" in data.get("permissions", []), "permissions deve incluir sidePanel"


def test_side_panel_html_modals_and_tags_balanced():
    html_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "teacher-extension", "side_panel.html"
    )
    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert ".modal-overlay" in content, "CSS deve definir classe .modal-overlay"
    assert ".modal-card" in content, "CSS deve definir classe .modal-card"

    modal_match = re.search(r'<div\s+id="modal-define-skill"[^>]*>', content)
    assert modal_match is not None, "Elemento modal-define-skill deve existir"
    assert 'style="display: none;"' in modal_match.group(0), "modal-define-skill deve ter style display: none"

    dev_panel_start = content.find('id="dev-mode-panel"')
    dev_panel_end = content.find('<!-- /dev-mode-panel -->')
    modal_pos = content.find('id="modal-define-skill"')
    assert dev_panel_start < modal_pos < dev_panel_end, "modal-define-skill deve estar contido dentro de dev-mode-panel"


def test_side_panel_js_friendly_portal_status():
    js_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "teacher-extension", "side_panel.js"
    )
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "Portal de Teste (Sandbox)" in content, "side_panel.js deve reconhecer sandbox local"
    assert "Aguardando portal escolar" in content, "side_panel.js deve exibir mensagem acolhedora quando fora de portal"
    assert "Portal não detectado" not in content, "Termo seco Portal não detectado deve ser eliminado"


def test_content_js_visual_highlight_functions():
    content_js_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "teacher-extension", "content.js"
    )
    with open(content_js_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "teacher-agent-focus-outline" in content, "content.js deve definir container de destaque visual"
    assert "teacher-agent-focus-badge" in content, "content.js deve definir badge com nome da Rafinha"
    assert "#38bdf8" in content, "Destaque visual deve usar contorno azul estilo Comet (#38bdf8)"
    assert "HIGHLIGHT_ELEMENT" in content, "content.js deve ouvir mensagem HIGHLIGHT_ELEMENT"
    assert "window.__teacherAiHighlight" in content, "content.js deve expor window.__teacherAiHighlight"


@pytest.mark.asyncio
async def test_safe_writer_triggers_visual_highlight():
    writer = SafeWriter()
    mock_locator = AsyncMock()
    mock_locator.focus = AsyncMock()
    mock_locator.fill = AsyncMock()
    mock_locator.press_sequentially = AsyncMock()
    mock_locator.input_value = AsyncMock(return_value="8.5")
    mock_locator.evaluate = AsyncMock(return_value="8.5")
    mock_locator.dispatch_event = AsyncMock()

    result = await writer.write_input(mock_locator, "8.5")
    assert result.success is True

    evaluate_calls = [call.args[0] for call in mock_locator.evaluate.call_args_list]
    highlight_called = any("teacher-agent-focus-outline" in str(code) or "window.__teacherAiHighlight" in str(code) for code in evaluate_calls)
    assert highlight_called, "SafeWriter.write_input deve acionar HIGHLIGHT_JS_HELPER"
