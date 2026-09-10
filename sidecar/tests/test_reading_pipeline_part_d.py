"""
test_reading_pipeline_part_d.py — Testes da PARTE D: Generalização para Múltiplos Formatos

Cobre:
1. Regressão Zero em table_rows (sem paginação).
2. Regressão Zero em card_grid (sem paginação).
3. Paginação com table_rows (3 páginas -> 15 alunos agregados, pages_read = 3).
4. Paginação com card_grid (2 páginas -> 8 alunos agregados, pages_read = 2).
5. Limite máximo estrito de páginas (maxPages = 2).
6. Proteção anti-loop infinito (estagnação / deduplicação de alunos).
7. Falha Proposital: Botão próximo desabilitado na primeira página (encerra com pages_read = 1).
8. Falha Proposital: Seletor inexistente no DOM com paginação habilitada (retorna failure_reason).
"""

import asyncio
import pytest
from typing import Any, Dict, List, Optional
from sidecar.page_reader_engine import PageReaderEngine, ExtractedData, PAGINATION_CONTROL_JS
from sidecar.portal_map_store import PortalMapStore, PortalSelectorMap


class MockMultiPage:
    """Mock de página Playwright com suporte a múltiplas páginas de dados e cliques em próxima página."""

    def __init__(
        self,
        pages_content: List[Dict[str, Any]],
        url: str = "https://portal.escola.com.br/turma",
        next_button_disabled_at_page: Optional[int] = None,
    ):
        self.pages_content = pages_content
        self.current_page_idx = 0
        self.url = url
        self.next_button_disabled_at_page = next_button_disabled_at_page

    async def title(self) -> str:
        return "Portal Escolar — Turma A"

    async def evaluate(self, js: str, *args) -> Any:
        # 1. Controle de Paginação
        if "options.nextSelector" in js or "PAGINATION_CONTROL_JS" in js or "nextSelector" in str(args):
            opts = args[0] if args else {}
            click = opts.get("click", False)
            total_pages = len(self.pages_content)

            # Verifica se o botão está desabilitado na página atual
            if self.next_button_disabled_at_page is not None and self.current_page_idx >= self.next_button_disabled_at_page:
                return {"has_next": False, "clicked": False, "reason": "button_disabled"}

            has_next = (self.current_page_idx < total_pages - 1)
            if not has_next:
                return {"has_next": False, "clicked": False, "reason": "no_more_pages"}

            if click:
                self.current_page_idx += 1
                return {"has_next": True, "clicked": True, "selector_matched": "button"}

            return {"has_next": True, "clicked": False, "selector_matched": "button"}

        # 2. Extração de Tabela
        if "EXTRACT_TABLE_JS" in js or "const t = document.querySelector" in js:
            sel = args[0] if args else ""
            if "fantasma" in sel or "inexistente" in sel:
                return {"rows": [], "error": "not_found"}

            current_data = self.pages_content[self.current_page_idx]
            return current_data.get("table", {"rows": []})

        # 3. Extração de Grade de Cartões
        if "EXTRACT_CARD_GRID_JS" in js or "const container = document.querySelector" in js:
            sel = args[0] if args else ""
            if "fantasma" in sel or "inexistente" in sel:
                return {"cards": [], "error": "not_found"}

            current_data = self.pages_content[self.current_page_idx]
            return current_data.get("cards", {"cards": []})

        # 4. Outros seletores
        return {}


# ---------------------------------------------------------------------------
# Teste 1: Regressão Zero em table_rows (sem paginação)
# ---------------------------------------------------------------------------
def test_regressao_zero_table_rows():
    """Confirma que a extração determinística de tabela em página única funciona 100% sem regressão."""
    engine = PageReaderEngine()
    table_page_1 = {
        "table": {
            "rows": [
                {"cells": ["1", "Ana Júlia Ferreira", "2024001"], "full_text": "1 Ana Júlia Ferreira", "portal_native_id": "2024001"},
                {"cells": ["2", "Bruno Henrique Lima", "2024002"], "full_text": "2 Bruno Henrique Lima", "portal_native_id": "2024002"},
                {"cells": ["3", "Carla Beatriz Santos", "2024003"], "full_text": "3 Carla Beatriz Santos", "portal_native_id": "2024003"}
            ]
        }
    }
    page = MockMultiPage(pages_content=[table_page_1])

    res = asyncio.run(engine.extract_deterministic(page, "table#alunos", strategy="table_rows"))

    assert res.success is True
    assert len(res.data) == 3
    assert res.pages_read == 1
    assert res.data[0]["name"] == "Ana Júlia Ferreira"
    assert res.data[1]["name"] == "Bruno Henrique Lima"
    assert res.data[2]["name"] == "Carla Beatriz Santos"
    assert res.strategy_used == "table_rows"
    assert res.layer_used == "layer_1_deterministic"


# ---------------------------------------------------------------------------
# Teste 2: Regressão Zero em card_grid (sem paginação)
# ---------------------------------------------------------------------------
def test_regressao_zero_card_grid():
    """Confirma que a extração determinística de grade de cartões em página única funciona 100% sem regressão."""
    engine = PageReaderEngine()
    cards_page_1 = {
        "cards": {
            "cards": [
                {"name": "Diego Alves Costa", "rollNumber": "101", "portal_native_id": "P101", "status": "active"},
                {"name": "Eduarda Melo Pires", "rollNumber": "102", "portal_native_id": "P102", "status": "active", "nee_flag": True}
            ]
        }
    }
    page = MockMultiPage(pages_content=[cards_page_1])

    res = asyncio.run(engine.extract_deterministic(page, ".student-cards", strategy="card_grid"))

    assert res.success is True
    assert len(res.data) == 2
    assert res.pages_read == 1
    assert res.data[0]["name"] == "Diego Alves Costa"
    assert res.data[1]["name"] == "Eduarda Melo Pires"
    assert res.data[1]["nee_flag"] is True
    assert res.strategy_used == "card_grid"


# ---------------------------------------------------------------------------
# Teste 3: Paginação com table_rows (3 páginas -> 15 alunos, pages_read = 3)
# ---------------------------------------------------------------------------
def test_paginacao_table_rows_tres_paginas():
    """Valida loop controlado de paginação em tabela com 3 páginas, agregando todos os 15 alunos."""
    engine = PageReaderEngine()

    page_1 = {
        "table": {
            "rows": [
                {"cells": ["1", f"Aluno P1_{i}", f"2024_{i}"], "full_text": f"Aluno P1_{i}", "portal_native_id": f"2024_{i}"}
                for i in range(1, 6)
            ]
        }
    }
    page_2 = {
        "table": {
            "rows": [
                {"cells": ["1", f"Aluno P2_{i}", f"2024_{i+5}"], "full_text": f"Aluno P2_{i}", "portal_native_id": f"2024_{i+5}"}
                for i in range(1, 6)
            ]
        }
    }
    page_3 = {
        "table": {
            "rows": [
                {"cells": ["1", f"Aluno P3_{i}", f"2024_{i+10}"], "full_text": f"Aluno P3_{i}", "portal_native_id": f"2024_{i+10}"}
                for i in range(1, 6)
            ]
        }
    }

    page = MockMultiPage(pages_content=[page_1, page_2, page_3])

    pagination_cfg = {
        "type": "next_button",
        "nextSelector": ".pagination .next",
        "maxPages": 5,
        "delayBetweenPagesMs": 100
    }

    res = asyncio.run(
        engine.extract_deterministic(
            page, "table.roster", strategy="table_rows", pagination_config=pagination_cfg
        )
    )

    assert res.success is True
    assert len(res.data) == 15
    assert res.pages_read == 3
    assert res.data[0]["name"] == "Aluno P1_1"
    assert res.data[5]["name"] == "Aluno P2_1"
    assert res.data[10]["name"] == "Aluno P3_1"

    # Confirma que os logs registraram as 3 páginas
    assert res.structured_log is not None
    page_logs = [log for log in res.structured_log if log.get("step") == "pagination_page_extracted"]
    assert len(page_logs) == 3
    assert page_logs[-1]["total_accumulated"] == 15


# ---------------------------------------------------------------------------
# Teste 4: Paginação com card_grid (2 páginas -> 8 alunos, pages_read = 2)
# ---------------------------------------------------------------------------
def test_paginacao_card_grid_duas_paginas():
    """Valida paginação em grade de cartões (Machado Sobrinho) com 2 páginas e agregação total."""
    engine = PageReaderEngine()

    page_1 = {
        "cards": {
            "cards": [
                {"name": f"Estudante Card {i}", "rollNumber": f"C{i}", "portal_native_id": f"NAT_{i}", "status": "active"}
                for i in range(1, 5)
            ]
        }
    }
    page_2 = {
        "cards": {
            "cards": [
                {"name": f"Estudante Card {i}", "rollNumber": f"C{i}", "portal_native_id": f"NAT_{i}", "status": "active"}
                for i in range(5, 9)
            ]
        }
    }

    page = MockMultiPage(pages_content=[page_1, page_2])

    pagination_cfg = {
        "type": "next_button",
        "nextSelector": "button.proxima-pagina",
        "maxPages": 10,
        "delayBetweenPagesMs": 100
    }

    res = asyncio.run(
        engine.extract_deterministic(
            page, ".cards-container", strategy="card_grid", pagination_config=pagination_cfg
        )
    )

    assert res.success is True
    assert len(res.data) == 8
    assert res.pages_read == 2
    assert res.data[0]["name"] == "Estudante Card 1"
    assert res.data[7]["name"] == "Estudante Card 8"


# ---------------------------------------------------------------------------
# Teste 5: Limite Máximo Estrito de Páginas (maxPages = 2)
# ---------------------------------------------------------------------------
def test_limite_maximo_paginas_interrompe_loop():
    """Confirma que o loop respeita rigorosamente o teto maxPages mesmo havendo mais páginas no portal."""
    engine = PageReaderEngine()

    pages = [
        {
            "table": {
                "rows": [
                    {"cells": ["1", f"Aluno Pag_{p}_{i}"], "full_text": f"Aluno Pag_{p}_{i}", "portal_native_id": f"P{p}_{i}"}
                    for i in range(1, 4)
                ]
            }
        }
        for p in range(1, 6) # 5 páginas disponíveis
    ]

    page = MockMultiPage(pages_content=pages)

    # Configura limite estrito de 2 páginas
    pagination_cfg = {
        "type": "next_button",
        "maxPages": 2,
        "delayBetweenPagesMs": 50
    }

    res = asyncio.run(
        engine.extract_deterministic(
            page, "table", strategy="table_rows", pagination_config=pagination_cfg
        )
    )

    assert res.success is True
    # Extraiu apenas as páginas 1 e 2 (3 alunos cada = 6 alunos)
    assert len(res.data) == 6
    assert res.pages_read == 2


# ---------------------------------------------------------------------------
# Teste 6: Proteção Anti-Loop Infinito (Deduplicação / Página Estagnada)
# ---------------------------------------------------------------------------
def test_protecao_anti_loop_pagina_estagnada():
    """Garante que se a próxima página for idêntica à anterior (DOM não mudou), o loop encerra sem duplicação."""
    engine = PageReaderEngine()

    same_page_content = {
        "table": {
            "rows": [
                {"cells": ["1", "Aluno Fixo A", "101"], "full_text": "Aluno Fixo A", "portal_native_id": "101"},
                {"cells": ["2", "Aluno Fixo B", "102"], "full_text": "Aluno Fixo B", "portal_native_id": "102"}
            ]
        }
    }

    # 4 páginas configuradas, mas todas com os mesmos alunos
    page = MockMultiPage(pages_content=[same_page_content, same_page_content, same_page_content, same_page_content])

    pagination_cfg = {
        "type": "next_button",
        "maxPages": 10,
        "delayBetweenPagesMs": 50
    }

    res = asyncio.run(
        engine.extract_deterministic(
            page, "table", strategy="table_rows", pagination_config=pagination_cfg
        )
    )

    assert res.success is True
    # Não duplicou alunos
    assert len(res.data) == 2
    # Encerrou na página 2 ao detectar estagnação
    assert res.pages_read == 2


# ---------------------------------------------------------------------------
# Teste 7: Falha Proposital — Botão Próximo Desabilitado na Página 1
# ---------------------------------------------------------------------------
def test_falha_proposital_botao_proximo_desabilitado():
    """Simula portal com botão 'Próxima' com classe disabled ou aria-disabled: não avança e encerra com 1 página."""
    engine = PageReaderEngine()

    page_1 = {
        "table": {
            "rows": [
                {"cells": ["1", "Aluno Único", "999"], "full_text": "Aluno Único", "portal_native_id": "999"}
            ]
        }
    }

    # Botão desabilitado desde a página 0
    page = MockMultiPage(pages_content=[page_1], next_button_disabled_at_page=0)

    pagination_cfg = {
        "type": "next_button",
        "maxPages": 5,
        "delayBetweenPagesMs": 50
    }

    res = asyncio.run(
        engine.extract_deterministic(
            page, "table", strategy="table_rows", pagination_config=pagination_cfg
        )
    )

    assert res.success is True
    assert len(res.data) == 1
    assert res.pages_read == 1


# ---------------------------------------------------------------------------
# Teste 8: Falha Proposital — Seletor Inválido no DOM com Paginação Habilitada
# ---------------------------------------------------------------------------
def test_falha_proposital_seletor_invalido_com_paginacao():
    """Garante que seletor inexistente no DOM retorna success=False sem tentar paginar."""
    engine = PageReaderEngine()

    page = MockMultiPage(pages_content=[{"table": {"rows": []}}])

    pagination_cfg = {
        "type": "next_button",
        "maxPages": 5
    }

    res = asyncio.run(
        engine.extract_deterministic(
            page, "#tabela-fantasma", strategy="table_rows", pagination_config=pagination_cfg
        )
    )

    assert res.success is False
    assert "empty_extraction" in (res.failure_reason or "")
    assert res.pages_read == 1
    assert len(res.data) == 0
