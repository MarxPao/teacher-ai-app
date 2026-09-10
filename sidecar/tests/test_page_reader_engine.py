"""
test_page_reader_engine.py — Testes do Engine Generalista de Leitura de Página

Usa MockPage (padrão já estabelecido nos testes de portal_discovery_agent)
para simular o Playwright sem precisar de Chrome real.
"""
import asyncio
import sys
import os
import json
import pytest

# Garante que o diretório sidecar está no path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from page_reader_engine import (
    PageReaderEngine,
    PageMemory,
    PageSection,
    ExtractionPlan,
    AnchoredTarget,
    ExtractedData,
    provider_supports_vision,
)


# ---------------------------------------------------------------------------
# Fixtures e Mocks
# ---------------------------------------------------------------------------

class MockPage:
    """
    Simula um objeto Playwright Page para testes sem Chrome.

    Suporta os padrões de chamada do novo engine:
    - evaluate(PAGE_MEM_JS) → sem args → retorna __page_mem__
    - evaluate(SET_OF_MARKS_INJECT_JS, sections_list) → com arg lista → retorna lista de marks injetados
    - evaluate(SET_OF_MARKS_REMOVE_JS) → sem args, JS de remoção → retorna True
    - evaluate(EXTRACT_*_JS, selector) → com arg string → retorna mapa de resultado por seletor
    """

    def __init__(self, evaluate_results: dict = None, screenshot_bytes: bytes = None):
        self._eval_results = evaluate_results or {}
        self._screenshot_bytes = screenshot_bytes or b""
        self.url = "https://portal.escola.edu.br/chamada/turma/9A"
        self.frames = []
        self._injected_marks = []  # rastreia marks injetados pelo SoM

    async def evaluate(self, js_code, *args):
        # Sem argumentos: decide pelo conteúdo do JS
        if not args:
            # JS de remoção de overlays → retorna True
            if "data-som-overlay" in js_code and "remove()" in js_code:
                self._injected_marks = []
                return True
            # JS do PageMem → retorna DOM simulado
            return self._eval_results.get("__page_mem__", {})

        arg = args[0]

        # Argumento é lista → é a chamada do SET_OF_MARKS_INJECT_JS
        if isinstance(arg, list):
            injected = [{"mark": idx + 1, "css_selector": s.get("css_selector", "")}
                        for idx, s in enumerate(arg)]
            self._injected_marks = injected
            return injected

        # Argumento é string → é seletor para extração
        selector = arg
        return self._eval_results.get(selector, {})

    async def screenshot(self, **kwargs):
        return self._screenshot_bytes


def mock_llm_caller_students(b64: str, prompt: str, byok: dict) -> str:
    """LLM simulado que sempre aponta para a seção 2 (tabela de alunos)."""
    return json.dumps({
        "target_section_id": 2,
        "mark_number": 2,
        "reasoning": "A seção 2 contém uma tabela com colunas Nome e Matrícula — é a lista de alunos.",
        "confidence": "high",
        "fallback_section_ids": [3]
    })


def mock_llm_caller_not_found(b64: str, prompt: str, byok: dict) -> str:
    """LLM simulado que não encontra a informação."""
    return json.dumps({
        "error": "not_found",
        "reasoning": "Nenhuma seção contém lista de alunos visível."
    })


def mock_llm_caller_text_only(b64: str, prompt: str, byok: dict) -> str:
    """LLM simulado para modo text-only (sem visão)."""
    return json.dumps({
        "target_section_id": 1,
        "mark_number": None,
        "reasoning": "Seção 1 tem o texto de chamada.",
        "confidence": "medium",
        "fallback_section_ids": []
    })


SAMPLE_PAGE_MEM_RAW = {
    "url": "https://portal.escola.edu.br/chamada/turma/9A",
    "title": "Chamada - Turma 9A",
    "built_at": 1700000000.0,
    "sections": [
        {
            "section_id": 1,
            "css_selector": "nav",
            "tag_path": "body > nav",
            "semantic_role": "nav",
            "text_summary": "Início > Turmas > 9A > Chamada",
            "element_count": 3,
            "has_table": False,
            "has_list": False,
            "has_form": False,
            "row_count": 0,
            "bounding_box": {"x": 0, "y": 0, "width": 800, "height": 40},
        },
        {
            "section_id": 2,
            "css_selector": "table#chamada",
            "tag_path": "main > table#chamada",
            "semantic_role": "table",
            "text_summary": "N. | Nome | Matrícula | Situação\n1 | Alice Santos | 20240001 | Ativa\n2 | Bruno Lima | 20240002 | Ativa",
            "element_count": 35,
            "has_table": True,
            "has_list": False,
            "has_form": False,
            "row_count": 35,
            "bounding_box": {"x": 0, "y": 60, "width": 800, "height": 500},
        },
        {
            "section_id": 3,
            "css_selector": "form#filtros",
            "tag_path": "main > form#filtros",
            "semantic_role": "form",
            "text_summary": "Filtrar por período: [data inicial] [data final] [Aplicar]",
            "element_count": 4,
            "has_table": False,
            "has_list": False,
            "has_form": True,
            "row_count": 0,
            "bounding_box": {"x": 0, "y": 580, "width": 800, "height": 60},
        },
    ]
}

SAMPLE_TABLE_ROWS_RESULT = {
    "rows": [
        {"cells": ["1", "Alice Santos", "20240001", "Ativa"], "full_text": "1 Alice Santos 20240001 Ativa", "portal_native_id": "aluno-001", "nee_flag": False},
        {"cells": ["2", "Bruno Lima", "20240002", "Ativa"], "full_text": "2 Bruno Lima 20240002 Ativa", "portal_native_id": "aluno-002", "nee_flag": False},
        {"cells": ["3", "Carla Mendes", "20240003", "Ativa"], "full_text": "3 Carla Mendes 20240003 Ativa", "portal_native_id": "aluno-003", "nee_flag": True},
    ],
    "error": None
}


# ---------------------------------------------------------------------------
# Testes
# ---------------------------------------------------------------------------

class TestPageReaderEngine:

    def test_provider_supports_vision_gemini(self):
        """Gemini e OpenAI devem retornar True para visão."""
        assert provider_supports_vision({"provider": "gemini"}) is True
        assert provider_supports_vision({"provider": "openai"}) is True
        assert provider_supports_vision({"provider": "anthropic"}) is True

    def test_provider_supports_vision_groq_false(self):
        """Groq é text-only — deve retornar False."""
        assert provider_supports_vision({"provider": "groq"}) is False
        assert provider_supports_vision({"provider": "deepseek"}) is False
        assert provider_supports_vision({}) is False

    @pytest.mark.asyncio
    async def test_build_page_mem_parses_sections(self):
        """_build_page_mem deve construir PageMemory a partir do JS sem LLM."""
        page = MockPage(evaluate_results={"__page_mem__": SAMPLE_PAGE_MEM_RAW})
        engine = PageReaderEngine(llm_caller=mock_llm_caller_students)
        mem = await engine._build_page_mem(page)

        assert mem is not None
        assert mem.title == "Chamada - Turma 9A"
        assert mem.total_sections == 3
        assert mem.sections[1].section_id == 2
        assert mem.sections[1].semantic_role == "table"
        assert mem.sections[1].row_count == 35
        assert mem.sections[1].has_table is True

    @pytest.mark.asyncio
    async def test_build_page_mem_empty_returns_none(self):
        """PageMem com DOM vazio deve retornar None."""
        page = MockPage(evaluate_results={"__page_mem__": {}})
        engine = PageReaderEngine(llm_caller=mock_llm_caller_students)
        mem = await engine._build_page_mem(page)
        assert mem is None

    def test_parse_perception_response_valid(self):
        """_parse_perception_response deve extrair ExtractionPlan do JSON do LLM."""
        engine = PageReaderEngine(llm_caller=mock_llm_caller_students)
        raw = '{"target_section_id": 2, "mark_number": 2, "reasoning": "Tabela de alunos", "confidence": "high", "fallback_section_ids": [3]}'
        plan = engine._parse_perception_response(raw)

        assert plan is not None
        assert plan.target_section_id == 2
        assert plan.mark_number == 2
        assert plan.confidence == "high"
        assert 3 in plan.fallback_section_ids

    def test_parse_perception_response_error_returns_none(self):
        """LLM reportando erro explícito deve retornar None."""
        engine = PageReaderEngine(llm_caller=mock_llm_caller_not_found)
        raw = '{"error": "not_found", "reasoning": "Sem lista de alunos"}'
        plan = engine._parse_perception_response(raw)
        assert plan is None

    def test_parse_perception_response_markdown_wrapped(self):
        """JSON dentro de markdown code block deve ser parseado corretamente."""
        engine = PageReaderEngine(llm_caller=mock_llm_caller_students)
        raw = '```json\n{"target_section_id": 1, "mark_number": null, "reasoning": "ok", "confidence": "low", "fallback_section_ids": []}\n```'
        plan = engine._parse_perception_response(raw)
        assert plan is not None
        assert plan.target_section_id == 1
        assert plan.mark_number is None

    def test_anchor_plan_to_dom_table_strategy(self):
        """Seção com tabela deve receber estratégia 'table_rows'."""
        sections = [PageSection(**{**s, "mark_number": i+1}) for i, s in enumerate(SAMPLE_PAGE_MEM_RAW["sections"])]
        mem = PageMemory(url="", title="", sections=sections, total_sections=3, built_at=0)
        engine = PageReaderEngine(llm_caller=mock_llm_caller_students)

        plan = ExtractionPlan(target_section_id=2, mark_number=2, reasoning="", confidence="high", fallback_section_ids=[])
        target = engine._anchor_plan_to_dom(plan, mem)

        assert target is not None
        assert target.css_selector == "table#chamada"
        assert target.extraction_strategy == "table_rows"

    def test_anchor_plan_to_dom_missing_section_returns_none(self):
        """Seção inexistente deve retornar None (sem alucinação)."""
        sections = [PageSection(**{**s, "mark_number": None}) for s in SAMPLE_PAGE_MEM_RAW["sections"]]
        mem = PageMemory(url="", title="", sections=sections, total_sections=3, built_at=0)
        engine = PageReaderEngine(llm_caller=mock_llm_caller_students)

        plan = ExtractionPlan(target_section_id=99, mark_number=None, reasoning="", confidence="low", fallback_section_ids=[])
        target = engine._anchor_plan_to_dom(plan, mem)
        assert target is None

    def test_parse_rows_detects_header_and_builds_student_records(self):
        """_parse_rows deve detectar linha de cabeçalho e construir registros corretamente."""
        rows = [
            {"cells": ["N.", "Nome", "Matrícula", "Situação"], "full_text": "N. Nome Matrícula Situação", "portal_native_id": "", "nee_flag": False},
            {"cells": ["1", "Alice Santos", "20240001", "Ativa"], "full_text": "1 Alice Santos 20240001 Ativa", "portal_native_id": "a001", "nee_flag": False},
            {"cells": ["2", "Bruno Lima", "20240002", "Ativa"], "full_text": "2 Bruno Lima 20240002 Ativa", "portal_native_id": "a002", "nee_flag": False},
        ]
        engine = PageReaderEngine(llm_caller=mock_llm_caller_students)
        result = engine._parse_rows(rows)

        assert len(result) == 2
        assert result[0]["name"] == "Alice Santos"
        assert result[0]["rollNumber"] == "1"
        assert result[1]["name"] == "Bruno Lima"

    @pytest.mark.asyncio
    async def test_full_run_success_with_students(self):
        """Ciclo completo com MockPage deve retornar ExtractedData de sucesso."""
        # Configura MockPage para retornar PageMem e dados da tabela
        page = MockPage(
            evaluate_results={
                "__page_mem__": SAMPLE_PAGE_MEM_RAW,
                "table#chamada": SAMPLE_TABLE_ROWS_RESULT,
                "table#chamada table": {"rows": [], "error": "not_found"},
            },
            screenshot_bytes=b""  # sem screenshot real
        )

        engine = PageReaderEngine(llm_caller=mock_llm_caller_students)
        byok = {"provider": "groq", "model": "llama-3.3-70b-versatile", "api_key": "test"}
        result = await engine.run(page, "lista de alunos", byok)

        assert result.success is True
        assert len(result.data) == 3
        assert result.data[0]["name"] == "Alice Santos"
        assert result.data[1]["name"] == "Bruno Lima"
        assert result.data[2]["name"] == "Carla Mendes"
        assert result.failure_reason is None

    @pytest.mark.asyncio
    async def test_full_run_failure_empty_dom(self):
        """DOM vazio deve retornar ExtractedData de falha com mensagem honesta."""
        page = MockPage(evaluate_results={})
        engine = PageReaderEngine(llm_caller=mock_llm_caller_students)
        byok = {"provider": "groq", "model": "llama-3.3-70b-versatile", "api_key": "test"}
        result = await engine.run(page, "lista de alunos", byok)

        assert result.success is False
        assert result.failure_reason is not None
        assert "empty_page" in result.failure_reason or "empty" in result.failure_reason.lower()
        assert len(result.data) == 0

    @pytest.mark.asyncio
    async def test_full_run_failure_llm_not_found(self):
        """LLM que retorna 'not_found' deve resultar em falha honesta."""
        page = MockPage(evaluate_results={"__page_mem__": SAMPLE_PAGE_MEM_RAW})
        engine = PageReaderEngine(llm_caller=mock_llm_caller_not_found)
        byok = {"provider": "groq", "model": "llama-3.3-70b-versatile", "api_key": "test"}
        result = await engine.run(page, "lista de alunos", byok)

        assert result.success is False
        assert "section" in result.failure_reason.lower() or "matching" in result.failure_reason.lower()
        assert len(result.data) == 0

    def test_anchor_card_grid_strategy(self):
        """Seção com semantic_role 'card_grid' deve mapear para estratégia 'card_grid'."""
        sec = PageSection(
            section_id=4, css_selector="div.meus-alunos-grid", tag_path="main > div.meus-alunos-grid",
            semantic_role="card_grid", text_summary="Carlos Alberto Matrícula: 202401 ...",
            element_count=30, has_table=False, has_list=False, has_form=False,
            row_count=30, bounding_box={"x": 10, "y": 10, "width": 800, "height": 600},
            has_cards=True
        )
        mem = PageMemory(url="https://machado.paineldoaluno.com.br", title="Meus Alunos",
                         sections=[sec], total_sections=1, built_at=100.0)
        plan = ExtractionPlan(target_section_id=4, mark_number=None, reasoning="Grade de cartões",
                              confidence="high", fallback_section_ids=[])
        engine = PageReaderEngine()
        target = engine._anchor_plan_to_dom(plan, mem)

        assert target is not None
        assert target.extraction_strategy == "card_grid"
        assert target.css_selector == "div.meus-alunos-grid"

    @pytest.mark.asyncio
    async def test_full_run_success_with_card_grid(self):
        """Ciclo completo com 'card_grid' deve extrair cartões de perfil de alunos corretamente."""
        card_grid_mem = {
            "url": "https://machadosobrinho.paineldoaluno.com.br/professor_painel",
            "title": "machadosobrinho | Painel do Professor",
            "sections": [
                {
                    "section_id": 1,
                    "css_selector": "header.navbar",
                    "tag_path": "header.navbar",
                    "semantic_role": "header",
                    "text_summary": "Machado Sobrinho - Professor",
                    "element_count": 3,
                    "has_table": False,
                    "has_list": False,
                    "has_form": False,
                    "row_count": 0,
                    "bounding_box": {"x": 0, "y": 0, "width": 1200, "height": 60},
                },
                {
                    "section_id": 2,
                    "css_selector": "div.grid-meus-alunos",
                    "tag_path": "main > div.grid-meus-alunos",
                    "semantic_role": "card_grid",
                    "text_summary": "Ana Júlia Ferreira Matrícula: 408 Bruno Henrique Lima Matrícula: 409",
                    "element_count": 25,
                    "has_table": False,
                    "has_list": False,
                    "has_form": False,
                    "has_cards": True,
                    "row_count": 25,
                    "bounding_box": {"x": 20, "y": 100, "width": 1160, "height": 700},
                }
            ]
        }

        cards_extracted = {
            "cards": [
                {
                    "name": "Ana Júlia Ferreira",
                    "rollNumber": "408",
                    "portal_native_id": "408",
                    "status": "active",
                    "avatar": "https://machado.paineldoaluno.com.br/fotos/408.jpg",
                    "nee_flag": True,
                    "full_text": "Ana Júlia Ferreira Matrícula: 408 NEE Ativo"
                },
                {
                    "name": "Bruno Henrique Lima",
                    "rollNumber": "409",
                    "portal_native_id": "409",
                    "status": "active",
                    "avatar": "https://machado.paineldoaluno.com.br/fotos/409.jpg",
                    "nee_flag": False,
                    "full_text": "Bruno Henrique Lima Matrícula: 409 Ativo"
                }
            ],
            "error": None
        }

        page = MockPage(
            evaluate_results={
                "__page_mem__": card_grid_mem,
                "div.grid-meus-alunos": cards_extracted,
            }
        )

        def mock_llm_card_grid(b64, prompt, byok):
            return json.dumps({
                "target_section_id": 2,
                "mark_number": 2,
                "reasoning": "A seção 2 é um CARD_GRID contendo os cartões individuais de perfil na aba Meus Alunos.",
                "confidence": "high",
                "fallback_section_ids": []
            })

        engine = PageReaderEngine(llm_caller=mock_llm_card_grid)
        byok = {"provider": "groq", "model": "llama-3.3-70b-versatile", "api_key": "test"}
        result = await engine.run(page, "lista de alunos na seção Meus Alunos, um por cartão de perfil", byok)

        assert result.success is True
        assert len(result.data) == 2
        assert result.data[0]["name"] == "Ana Júlia Ferreira"
        assert result.data[0]["rollNumber"] == "408"
        assert result.data[0]["nee_flag"] is True
        assert result.data[1]["name"] == "Bruno Henrique Lima"
        assert result.data[1]["rollNumber"] == "409"
        assert result.data[1]["nee_flag"] is False

    @pytest.mark.asyncio
    async def test_deterministic_fallback_on_http_429_rate_limit(self):
        """
        TAREFA 3: Comprova que quando o provedor LLM externo retorna HTTP 429 (Rate Limit / Quota Exceeded),
        o PageReaderEngine ativa o fallback determinístico PageMem, localiza a seção de maior densidade
        (card_grid ou table) e extrai os alunos do DOM real sem falhar ou quebrar o fluxo.
        """
        import urllib.error

        card_grid_mem = {
            "url": "https://machadosobrinho.paineldoaluno.com.br/meus-alunos",
            "title": "Machado Sobrinho - Meus Alunos",
            "built_at": 1741200000.0,
            "sections": [
                {
                    "section_id": 1,
                    "css_selector": "header.top-bar",
                    "tag_path": "header",
                    "semantic_role": "navigation",
                    "text_summary": "Machado Sobrinho Portal do Professor Sair",
                    "element_count": 4,
                    "has_table": False,
                    "has_list": False,
                    "has_form": False,
                    "row_count": 0,
                    "bounding_box": {"x": 0, "y": 0, "w": 1280, "h": 60},
                    "has_cards": False
                },
                {
                    "section_id": 2,
                    "css_selector": "div.grid-meus-alunos",
                    "tag_path": "div",
                    "semantic_role": "card_grid",
                    "text_summary": "Ana Júlia Ferreira 408 Bruno Henrique Lima 409 Carlos Eduardo 410",
                    "element_count": 3,
                    "has_table": False,
                    "has_list": False,
                    "has_form": False,
                    "row_count": 3,
                    "bounding_box": {"x": 20, "y": 100, "w": 1240, "h": 600},
                    "has_cards": True
                }
            ]
        }

        cards_extracted = {
            "format": "students",
            "total_extracted": 3,
            "cards": [
                {
                    "name": "Ana Júlia Ferreira",
                    "rollNumber": "408",
                    "portal_native_id": "408",
                    "status": "active",
                    "avatar": "https://machado.paineldoaluno.com.br/fotos/408.jpg",
                    "nee_flag": True,
                    "full_text": "Ana Júlia Ferreira Matrícula: 408 NEE Ativo"
                },
                {
                    "name": "Bruno Henrique Lima",
                    "rollNumber": "409",
                    "portal_native_id": "409",
                    "status": "active",
                    "avatar": "https://machado.paineldoaluno.com.br/fotos/409.jpg",
                    "nee_flag": False,
                    "full_text": "Bruno Henrique Lima Matrícula: 409 Ativo"
                },
                {
                    "name": "Carlos Eduardo Santos",
                    "rollNumber": "410",
                    "portal_native_id": "410",
                    "status": "active",
                    "avatar": "https://machado.paineldoaluno.com.br/fotos/410.jpg",
                    "nee_flag": False,
                    "full_text": "Carlos Eduardo Santos Matrícula: 410 Ativo"
                }
            ],
            "error": None
        }

        page = MockPage(
            evaluate_results={
                "__page_mem__": card_grid_mem,
                "div.grid-meus-alunos": cards_extracted,
            }
        )

        def mock_llm_throwing_429(b64, prompt, byok):
            raise urllib.error.HTTPError(
                url="https://api.groq.com/openai/v1/chat/completions",
                code=429,
                msg="Too Many Requests - Rate limit reached for default-tier",
                hdrs={},
                fp=None
            )

        engine = PageReaderEngine(llm_caller=mock_llm_throwing_429)
        byok = {"provider": "groq", "model": "llama-3.3-70b-versatile", "api_key": "test_byok_key"}

        result = await engine.run(page, "lista de alunos da turma", byok, output_format="students")

        assert result.success is True, f"Esperado success=True, obteve False: {result.failure_reason}"
        assert len(result.data) == 3
        assert result.data[0]["name"] == "Ana Júlia Ferreira"
        assert result.data[0]["rollNumber"] == "408"
        assert result.data[0]["nee_flag"] is True
        assert result.data[1]["name"] == "Bruno Henrique Lima"
        assert result.data[2]["name"] == "Carlos Eduardo Santos"
        assert result.section_used == "div.grid-meus-alunos"
