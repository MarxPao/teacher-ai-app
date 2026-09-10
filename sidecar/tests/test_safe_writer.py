"""
test_safe_writer.py — Testes Unitários de Escrita Segura para Frameworks Modernos (Etapa 3)

Validações:
1. Digitação sequencial (press_sequentially) e setter nativo de prototype (React/Vue).
2. Normalização numérica (8.5 vs 8,5, 10 vs 10.0).
3. Checkpoint imediato e detecção de drift em falha de escrita.
4. Seleção em <select> nativo e em componentes customizados (div/ul/li).
5. Alternância de checkboxes com checkpoint e eventos sintéticos.
"""

import asyncio
import os
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from safe_writer import SafeWriter, WriteResult, SelectResult, CheckboxResult


@pytest.fixture
def writer():
    return SafeWriter(key_delay_ms=0, timeout_ms=500)


# ---------------------------------------------------------------------------
# Testes de write_input
# ---------------------------------------------------------------------------

class TestWriteInput:

    @pytest.mark.asyncio
    async def test_write_input_successful_press_sequentially(self, writer):
        locator = MagicMock()
        locator.focus = AsyncMock()
        locator.fill = AsyncMock()
        locator.press_sequentially = AsyncMock()
        locator.evaluate = AsyncMock(return_value={"success": True})
        locator.dispatch_event = AsyncMock()
        locator.input_value = AsyncMock(return_value="9.5")

        result = await writer.write_input(locator, "9.5")

        assert result.success is True
        assert result.verified is True
        assert result.drift_detected is False
        assert result.expected_value == "9.5"
        assert result.actual_value == "9.5"
        locator.focus.assert_awaited_once()
        locator.press_sequentially.assert_awaited_once_with("9.5", delay=0)
        assert locator.dispatch_event.await_count >= 2

    @pytest.mark.asyncio
    async def test_write_input_react_number_normalization(self, writer):
        """Portal pode formatar 8.5 para 8,5 ou 10 para 10.0; não deve acusar falso drift."""
        locator = MagicMock()
        locator.focus = AsyncMock()
        locator.fill = AsyncMock()
        locator.press_sequentially = AsyncMock()
        locator.evaluate = AsyncMock()
        locator.dispatch_event = AsyncMock()
        # Usuário enviou 8.5, o browser/input type=number ou locale BR formatou para 8,5
        locator.input_value = AsyncMock(return_value="8,5")

        result = await writer.write_input(locator, "8.5")

        assert result.success is True
        assert result.verified is True
        assert result.drift_detected is False

    @pytest.mark.asyncio
    async def test_write_input_drift_detected_when_dom_rejects(self, writer):
        """Se o DOM ignorar a escrita (ex: React controlled input sem dispatch), checkpoint deve detectar."""
        locator = MagicMock()
        locator.focus = AsyncMock()
        locator.fill = AsyncMock()
        locator.press_sequentially = AsyncMock()
        locator.evaluate = AsyncMock()
        locator.dispatch_event = AsyncMock()
        # Valor permaneceu antigo ou vazio no DOM
        locator.input_value = AsyncMock(return_value="")

        result = await writer.write_input(locator, "10.0")

        assert result.success is False
        assert result.verified is False
        assert result.drift_detected is True
        assert "Divergência pós-escrita" in (result.error_message or "")

    @pytest.mark.asyncio
    async def test_write_input_fallback_when_press_sequentially_unavailable(self, writer):
        """Se press_sequentially não existir (mock ou versão legada), usa fallback sem quebrar."""
        locator = MagicMock(spec=["focus", "fill", "type", "evaluate", "dispatch_event", "input_value"])
        locator.focus = AsyncMock()
        locator.fill = AsyncMock()
        locator.type = AsyncMock()
        locator.evaluate = AsyncMock()
        locator.dispatch_event = AsyncMock()
        locator.input_value = AsyncMock(return_value="Presença")

        result = await writer.write_input(locator, "Presença")

        assert result.success is True
        locator.type.assert_awaited_once()


# ---------------------------------------------------------------------------
# Testes de select_option
# ---------------------------------------------------------------------------

class TestSelectOption:

    @pytest.mark.asyncio
    async def test_select_native_successful(self, writer):
        select_loc = MagicMock()
        select_loc.evaluate = AsyncMock(side_effect=lambda js, *args: "select" if "tagName" in js else "2° Bimestre")
        select_loc.select_option = AsyncMock()
        select_loc.dispatch_event = AsyncMock()
        select_loc.input_value = AsyncMock(return_value="2_bimestre")

        result = await writer.select_option(select_loc, "2° Bimestre")

        assert result.success is True
        assert result.is_custom is False
        assert result.verified is True
        assert result.drift_detected is False

    @pytest.mark.asyncio
    async def test_select_custom_dropdown_successful(self, writer):
        """Simula dropdown customizado: clica no container, encontra li correspondente, clica e checa inner_text."""
        trigger_loc = MagicMock()
        # Não é select nativo
        trigger_loc.evaluate = AsyncMock(side_effect=lambda js, *args: "div" if "tagName" in js else "")
        trigger_loc.click = AsyncMock()
        # Checkpoint lê o texto atualizado após seleção
        trigger_loc.inner_text = AsyncMock(return_value="História Geral")

        option_loc = MagicMock()
        option_loc.count = AsyncMock(return_value=1)
        option_loc.is_visible = AsyncMock(return_value=True)
        option_loc.click = AsyncMock()

        # Configura busca da opção
        search_ctx = MagicMock()
        search_ctx.locator = MagicMock(return_value=MagicMock(first=option_loc))

        result = await writer.select_option(trigger_loc, "História Geral", page=search_ctx)

        assert result.success is True
        assert result.is_custom is True
        assert result.verified is True
        assert result.drift_detected is False
        trigger_loc.click.assert_awaited_once()
        option_loc.click.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_select_custom_dropdown_drift_when_option_missing(self, writer):
        """Se a opção não for encontrada no dropdown aberto, deve retornar falha com drift."""
        trigger_loc = MagicMock()
        trigger_loc.evaluate = AsyncMock(return_value="div")
        trigger_loc.click = AsyncMock()

        empty_loc = MagicMock()
        empty_loc.count = AsyncMock(return_value=0)
        empty_loc.is_visible = AsyncMock(return_value=False)

        search_ctx = MagicMock()
        search_ctx.locator = MagicMock(return_value=MagicMock(first=empty_loc))
        search_ctx.get_by_text = MagicMock(return_value=MagicMock(first=empty_loc))

        result = await writer.select_option(trigger_loc, "Opção Inexistente", page=search_ctx)

        assert result.success is False
        assert result.drift_detected is True
        assert result.is_custom is True


# ---------------------------------------------------------------------------
# Testes de set_checkbox
# ---------------------------------------------------------------------------

class TestSetCheckbox:

    @pytest.mark.asyncio
    async def test_set_checkbox_toggle_to_checked(self, writer):
        chk = MagicMock()
        chk.is_checked = AsyncMock(side_effect=[False, True])  # Antes False, depois True
        chk.check = AsyncMock()
        chk.dispatch_event = AsyncMock()

        result = await writer.set_checkbox(chk, checked=True)

        assert result.success is True
        assert result.verified is True
        assert result.actual_checked is True
        chk.check.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_set_checkbox_already_target_state(self, writer):
        chk = MagicMock()
        chk.is_checked = AsyncMock(return_value=True)
        chk.check = AsyncMock()
        chk.uncheck = AsyncMock()

        result = await writer.set_checkbox(chk, checked=True)

        assert result.success is True
        assert result.verified is True
        chk.check.assert_not_called()
        chk.uncheck.assert_not_called()

    @pytest.mark.asyncio
    async def test_set_checkbox_drift_when_check_fails(self, writer):
        chk = MagicMock()
        # O checkbox permaneceu False mesmo após tentar marcar
        chk.is_checked = AsyncMock(side_effect=[False, False])
        chk.check = AsyncMock()
        chk.dispatch_event = AsyncMock()

        result = await writer.set_checkbox(chk, checked=True)

        assert result.success is False
        assert result.verified is False
        assert result.drift_detected is True


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
